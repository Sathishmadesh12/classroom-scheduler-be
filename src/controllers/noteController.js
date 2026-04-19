const Note = require('../models/Note');
const cloudinary = require('../config/cloudinary');

// ─── Helper: upload buffer to Cloudinary ─────────────────────────────────────
const uploadToCloudinary = (buffer, originalName, mimeType) => {
  return new Promise((resolve, reject) => {
    const ext = originalName.split('.').pop();
    const resourceType = mimeType.startsWith('image/') ? 'image' : 'raw';

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'classroom_notes',
        resource_type: resourceType,
        public_id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        use_filename: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    const { Readable } = require('stream');
    Readable.from(buffer).pipe(stream);
  });
};

// ─── CREATE NOTE with file upload ────────────────────────────────────────────
exports.createNote = async (req, res) => {
  try {
    const { title, description, subjectId, department, semester, visibleTo } = req.body;
    const files = req.files || [];

    const uploadedFiles = [];
    for (const file of files) {
      const result = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);
      uploadedFiles.push({
        fileName: file.originalname,
        fileType: file.mimetype,
        cloudinaryId: result.public_id,
        url: result.secure_url,
        size: file.size,
      });
    }

    const note = await Note.create({
      title,
      description,
      subject: subjectId,
      faculty: req.user._id,
      department,
      semester: Number(semester),
      files: uploadedFiles,
      visibleTo: visibleTo || 'semester',
      isPublished: true,
    });

    const populated = await Note.findById(note._id)
      .populate('subject', 'name code')
      .populate('faculty', 'name email');

    res.status(201).json({ success: true, note: populated, message: 'Note created successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET NOTES (Student/Faculty view) ────────────────────────────────────────
exports.getNotes = async (req, res) => {
  try {
    const { department, semester, subjectId, page = 1, limit = 20 } = req.query;
    const filter = { isPublished: true };

    if (subjectId) filter.subject = subjectId;
    if (department) filter.department = department;
    if (semester) filter.semester = Number(semester);

    // If student - show only their dept/semester notes
    if (req.user.role === 'student') {
      if (req.user.department) filter.department = req.user.department;
    }

    const notes = await Note.find(filter)
      .populate('subject', 'name code type')
      .populate('faculty', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Note.countDocuments(filter);

    res.json({ success: true, notes, total, page: Number(page) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET NOTE BY ID ───────────────────────────────────────────────────────────
exports.getNoteById = async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate('subject', 'name code type department semester')
      .populate('faculty', 'name email department');
    if (!note) return res.status(404).json({ message: 'Note not found' });
    res.json({ success: true, note });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── UPDATE NOTE ──────────────────────────────────────────────────────────────
exports.updateNote = async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });

    // Only faculty who created it or admin can update
    if (req.user.role !== 'admin' && note.faculty.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { title, description, visibleTo, isPublished } = req.body;
    const newFiles = req.files || [];
    const uploadedFiles = [...note.files];

    for (const file of newFiles) {
      const result = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);
      uploadedFiles.push({
        fileName: file.originalname,
        fileType: file.mimetype,
        cloudinaryId: result.public_id,
        url: result.secure_url,
        size: file.size,
      });
    }

    const updated = await Note.findByIdAndUpdate(
      req.params.id,
      { title, description, visibleTo, isPublished, files: uploadedFiles },
      { new: true }
    )
      .populate('subject', 'name code')
      .populate('faculty', 'name email');

    res.json({ success: true, note: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── DELETE FILE from note ────────────────────────────────────────────────────
exports.deleteFile = async (req, res) => {
  try {
    const { noteId, cloudinaryId } = req.params;
    const note = await Note.findById(noteId);
    if (!note) return res.status(404).json({ message: 'Note not found' });

    if (req.user.role !== 'admin' && note.faculty.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Delete from cloudinary
    await cloudinary.uploader.destroy(decodeURIComponent(cloudinaryId), { resource_type: 'raw' }).catch(() => {});
    await cloudinary.uploader.destroy(decodeURIComponent(cloudinaryId), { resource_type: 'image' }).catch(() => {});

    note.files = note.files.filter(f => f.cloudinaryId !== decodeURIComponent(cloudinaryId));
    await note.save();

    res.json({ success: true, message: 'File deleted', note });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── DELETE NOTE ──────────────────────────────────────────────────────────────
exports.deleteNote = async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });

    if (req.user.role !== 'admin' && note.faculty.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Delete all files from cloudinary
    for (const file of note.files) {
      await cloudinary.uploader.destroy(file.cloudinaryId, { resource_type: 'raw' }).catch(() => {});
      await cloudinary.uploader.destroy(file.cloudinaryId, { resource_type: 'image' }).catch(() => {});
    }

    await Note.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET MY NOTES (Faculty) ───────────────────────────────────────────────────
exports.getMyNotes = async (req, res) => {
  try {
    const notes = await Note.find({ faculty: req.user._id })
      .populate('subject', 'name code type')
      .sort({ createdAt: -1 });
    res.json({ success: true, notes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
