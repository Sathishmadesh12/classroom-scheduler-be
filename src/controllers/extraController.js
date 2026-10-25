// New modules: Announcements + Reports (kept in a separate file so existing controllers stay untouched)
const Announcement = require('../models/Announcement');
const Timetable = require('../models/Timetable');
const Classroom = require('../models/Classroom');
const Subject = require('../models/Subject');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS_PER_DAY = 8;
const WEEK_CAPACITY = DAYS.length * PERIODS_PER_DAY; // 40

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
exports.getAnnouncements = async (req, res) => {
  try {
    const role = req.user.role;
    const filter = { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: new Date() } }] };
    const and = [filter];
    if (role !== 'admin') {
      and.push({ audience: { $in: ['all', role] } });
      if (req.user.department) and.push({ $or: [{ department: { $exists: false } }, { department: null }, { department: '' }, { department: req.user.department }] });
    }
    const announcements = await Announcement.find({ $and: and })
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, announcements });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    const { title, message, priority, audience, department, expiresAt } = req.body;
    if (!title || !message) return res.status(400).json({ message: 'Title and message are required' });
    const announcement = await Announcement.create({
      title, message, priority, audience,
      department: department || undefined,
      expiresAt: expiresAt || undefined,
      createdBy: req.user._id,
    });
    const populated = await Announcement.findById(announcement._id).populate('createdBy', 'name role');
    res.status(201).json({ success: true, announcement: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    const a = await Announcement.findById(req.params.id);
    if (!a) return res.status(404).json({ message: 'Announcement not found' });
    if (req.user.role !== 'admin' && a.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only delete your own announcements' });
    }
    await a.deleteOne();
    res.json({ success: true, message: 'Announcement deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── REPORTS (admin) ──────────────────────────────────────────────────────────
// Faculty workload, classroom utilisation, day-wise load and clash detection across all active timetables
exports.getReportsOverview = async (req, res) => {
  try {
    const timetables = await Timetable.find({ isActive: true })
      .populate('slots.subject', 'name code type')
      .populate('slots.faculty', 'name department')
      .populate('slots.classroom', 'name roomNumber');
    const totalRooms = await Classroom.countDocuments();
    const subjects = await Subject.find({ isActive: true }).select('completionPercentage');

    const faculty = {}; const rooms = {}; const dayLoad = Object.fromEntries(DAYS.map((d) => [d, 0]));
    const seenFaculty = {}; const seenRoom = {}; const conflicts = [];

    for (const tt of timetables) {
      const label = `${tt.department} Sem ${tt.semester}-${tt.section}`;
      for (const s of tt.slots) {
        if (dayLoad[s.day] !== undefined) dayLoad[s.day]++;
        const key = `${s.day}-${s.period}`;

        if (s.faculty) {
          const f = (faculty[s.faculty._id] ||= { _id: s.faculty._id, name: s.faculty.name, department: s.faculty.department, periods: 0, labPeriods: 0, subjects: new Set(), classes: new Set() });
          f.periods++; if (s.subject?.type === 'lab') f.labPeriods++;
          if (s.subject) f.subjects.add(s.subject.code); f.classes.add(label);
          const fk = `${s.faculty._id}|${key}`;
          if (seenFaculty[fk]) conflicts.push({ type: 'Faculty', who: s.faculty.name, day: s.day, period: s.period, where: [seenFaculty[fk], label] });
          else seenFaculty[fk] = label;
        }
        if (s.classroom) {
          const r = (rooms[s.classroom._id] ||= { _id: s.classroom._id, name: s.classroom.name, roomNumber: s.classroom.roomNumber, periods: 0 });
          r.periods++;
          const rk = `${s.classroom._id}|${key}`;
          if (seenRoom[rk]) conflicts.push({ type: 'Classroom', who: s.classroom.roomNumber || s.classroom.name, day: s.day, period: s.period, where: [seenRoom[rk], label] });
          else seenRoom[rk] = label;
        }
      }
    }

    const facultyWorkload = Object.values(faculty).map((f) => ({ ...f, subjects: [...f.subjects], classes: [...f.classes] })).sort((a, b) => b.periods - a.periods);
    const roomUtilization = Object.values(rooms).map((r) => ({ ...r, utilization: Math.round((r.periods / WEEK_CAPACITY) * 100) })).sort((a, b) => b.utilization - a.utilization);
    const totalPeriods = timetables.reduce((n, t) => n + t.slots.length, 0);
    const avgCompletion = subjects.length ? Math.round(subjects.reduce((n, s) => n + (s.completionPercentage || 0), 0) / subjects.length) : 0;

    res.json({
      success: true,
      summary: {
        activeTimetables: timetables.length, totalPeriods, totalRooms,
        facultyCount: facultyWorkload.length, avgSubjectCompletion: avgCompletion, conflictCount: conflicts.length,
        weekCapacity: WEEK_CAPACITY,
      },
      facultyWorkload, roomUtilization, dayLoad, conflicts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
