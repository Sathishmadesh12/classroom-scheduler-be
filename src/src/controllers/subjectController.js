const Subject = require('../models/Subject');
const User = require('../models/User');
const { sendSubjectAssignedEmail } = require('../utils/emailService');

exports.getAllSubjects = async (req, res) => {
  try {
    const { department, semester, faculty } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (semester) filter.semester = Number(semester);
    if (faculty) filter.faculty = faculty;

    const subjects = await Subject.find(filter).populate('faculty', 'name email').sort({ code: 1 });
    res.json({ success: true, subjects, total: subjects.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createSubject = async (req, res) => {
  try {
    const { totalHours, ...rest } = req.body;
    const subject = await Subject.create({ ...rest, totalHours: totalHours || 0 });

    if (req.body.faculty) {
      const faculty = await User.findById(req.body.faculty);
      if (faculty) sendSubjectAssignedEmail({ faculty, subject }).catch(e => console.error(e.message));
    }

    const populated = await Subject.findById(subject._id).populate('faculty', 'name email');
    res.status(201).json({ success: true, subject: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateSubject = async (req, res) => {
  try {
    const oldSubject = await Subject.findById(req.params.id);
    const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('faculty', 'name email');
    if (!subject) return res.status(404).json({ message: 'Subject not found' });

    const oldFacultyId = oldSubject?.faculty?.toString();
    const newFacultyId = req.body.faculty;
    if (newFacultyId && oldFacultyId !== newFacultyId) {
      const faculty = await User.findById(newFacultyId);
      if (faculty) sendSubjectAssignedEmail({ faculty, subject }).catch(e => console.error(e.message));
    }

    res.json({ success: true, subject });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findByIdAndDelete(req.params.id);
    if (!subject) return res.status(404).json({ message: 'Subject not found' });
    res.json({ success: true, message: 'Subject deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Bulk update completion for multiple subjects ─────────────────────────────
exports.bulkUpdateCompletion = async (req, res) => {
  try {
    const { updates } = req.body; // [{ subjectId, completedHours, totalHours }]
    const results = [];
    for (const u of updates) {
      const sub = await Subject.findById(u.subjectId);
      if (!sub) continue;
      if (u.totalHours !== undefined) sub.totalHours = Number(u.totalHours);
      if (u.completedHours !== undefined) sub.completedHours = Number(u.completedHours);
      await sub.save();
      results.push({ subjectId: u.subjectId, completionPercentage: sub.completionPercentage });
    }
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
