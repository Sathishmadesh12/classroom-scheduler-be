const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Subject = require('../models/Subject');

// GET /api/attendance - list sessions (admin: all, faculty: own)
exports.getAttendanceSessions = async (req, res) => {
  try {
    const { date, subjectId, department, semester, section, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (req.user.role === 'faculty') filter.faculty = req.user._id;
    if (date) filter.date = { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 86400000) };
    if (subjectId) filter.subject = subjectId;
    if (department) filter.department = department;
    if (semester) filter.semester = Number(semester);
    if (section) filter.section = section;

    const total = await Attendance.countDocuments(filter);
    const sessions = await Attendance.find(filter)
      .populate('subject', 'name code')
      .populate('faculty', 'name email')
      .populate('records.student', 'name email department')
      .sort({ date: -1, period: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ sessions, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/attendance - mark attendance for a session
exports.markAttendance = async (req, res) => {
  try {
    const { date, subjectId, period, department, semester, section, records, notes } = req.body;

    if (!date || !subjectId || !period || !department || !semester || !records) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const sessionDate = new Date(date);
    sessionDate.setHours(0, 0, 0, 0);

    // Check if already exists - update if so
    const existing = await Attendance.findOne({ date: sessionDate, subject: subjectId, period: Number(period) });

    if (existing) {
      existing.records = records;
      existing.notes = notes || '';
      await existing.save();
      const updated = await Attendance.findById(existing._id)
        .populate('subject', 'name code')
        .populate('faculty', 'name email')
        .populate('records.student', 'name email');
      return res.json({ message: 'Attendance updated', attendance: updated });
    }

    const attendance = await Attendance.create({
      date: sessionDate,
      subject: subjectId,
      faculty: req.user._id,
      department,
      semester: Number(semester),
      section: section || 'A',
      period: Number(period),
      records,
      notes: notes || '',
    });

    const populated = await Attendance.findById(attendance._id)
      .populate('subject', 'name code')
      .populate('faculty', 'name email')
      .populate('records.student', 'name email');

    res.status(201).json({ message: 'Attendance marked successfully', attendance: populated });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Attendance already marked for this session' });
    }
    res.status(500).json({ message: err.message });
  }
};

// GET /api/attendance/:id - single session
exports.getSessionById = async (req, res) => {
  try {
    const session = await Attendance.findById(req.params.id)
      .populate('subject', 'name code')
      .populate('faculty', 'name email')
      .populate('records.student', 'name email department');
    if (!session) return res.status(404).json({ message: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/attendance/:id
exports.deleteSession = async (req, res) => {
  try {
    const session = await Attendance.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    // Faculty can only delete their own; admin can delete any
    if (req.user.role === 'faculty' && String(session.faculty) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    await session.deleteOne();
    res.json({ message: 'Session deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/attendance/report/student/:studentId - student's attendance summary
exports.getStudentReport = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { subjectId, startDate, endDate } = req.query;

    // Match sessions that include this student
    const matchFilter = { 'records.student': studentId };
    if (subjectId) matchFilter.subject = require('mongoose').Types.ObjectId(subjectId);
    if (startDate || endDate) {
      matchFilter.date = {};
      if (startDate) matchFilter.date.$gte = new Date(startDate);
      if (endDate) matchFilter.date.$lte = new Date(endDate);
    }

    const sessions = await Attendance.find(matchFilter)
      .populate('subject', 'name code')
      .sort({ date: 1 });

    // Compute per-subject stats
    const subjectMap = {};
    for (const s of sessions) {
      const subKey = String(s.subject?._id);
      if (!subjectMap[subKey]) {
        subjectMap[subKey] = { subject: s.subject, total: 0, present: 0, absent: 0, late: 0 };
      }
      const rec = s.records.find(r => String(r.student) === studentId);
      if (rec) {
        subjectMap[subKey].total++;
        subjectMap[subKey][rec.status]++;
      }
    }

    const report = Object.values(subjectMap).map(d => ({
      ...d,
      percentage: d.total ? Math.round((d.present / d.total) * 100) : 0,
    }));

    res.json({ studentId, report });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/attendance/summary - overall summary stats
exports.getSummary = async (req, res) => {
  try {
    const filter = req.user.role === 'faculty' ? { faculty: req.user._id } : {};
    const totalSessions = await Attendance.countDocuments(filter);

    const pipeline = [
      { $match: filter },
      { $unwind: '$records' },
      { $group: { _id: '$records.status', count: { $sum: 1 } } },
    ];
    const statusCounts = await Attendance.aggregate(pipeline);
    const counts = { present: 0, absent: 0, late: 0 };
    for (const s of statusCounts) counts[s._id] = s.count;
    const total = counts.present + counts.absent + counts.late;

    res.json({
      totalSessions,
      totalRecords: total,
      present: counts.present,
      absent: counts.absent,
      late: counts.late,
      attendanceRate: total ? Math.round((counts.present / total) * 100) : 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
