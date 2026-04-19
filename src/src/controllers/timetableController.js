const Timetable = require('../models/Timetable');
const Subject = require('../models/Subject');
const Classroom = require('../models/Classroom');
const User = require('../models/User');
const { sendTimetableAssignedEmail } = require('../utils/emailService');

const TIME_SLOTS = [
  { period: 1, startTime: '08:00', endTime: '09:00' },
  { period: 2, startTime: '09:00', endTime: '10:00' },
  { period: 3, startTime: '10:15', endTime: '11:15' },
  { period: 4, startTime: '11:15', endTime: '12:15' },
  { period: 5, startTime: '13:00', endTime: '14:00' },
  { period: 6, startTime: '14:00', endTime: '15:00' },
  { period: 7, startTime: '15:15', endTime: '16:15' },
  { period: 8, startTime: '16:15', endTime: '17:15' },
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

exports.getTimetables = async (req, res) => {
  try {
    const { department, semester, section, academicYear } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (semester) filter.semester = Number(semester);
    if (section) filter.section = section;
    if (academicYear) filter.academicYear = academicYear;

    const timetables = await Timetable.find(filter)
      .populate('slots.subject', 'name code type')
      .populate('slots.faculty', 'name email')
      .populate('slots.classroom', 'name roomNumber')
      .populate('generatedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, timetables });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTimetableById = async (req, res) => {
  try {
    const timetable = await Timetable.findById(req.params.id)
      .populate('slots.subject', 'name code type hoursPerWeek completionPercentage')
      .populate('slots.faculty', 'name email department')
      .populate('slots.classroom', 'name roomNumber capacity type')
      .populate('generatedBy', 'name');
    if (!timetable) return res.status(404).json({ message: 'Timetable not found' });
    res.json({ success: true, timetable });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── NEW: Get Individual Faculty Timetable ────────────────────────────────────
exports.getFacultyTimetable = async (req, res) => {
  try {
    const facultyId = req.params.facultyId || req.user._id;

    // Get all active timetables that have slots for this faculty
    const timetables = await Timetable.find({ isActive: true })
      .populate('slots.subject', 'name code type hoursPerWeek completionPercentage totalHours completedHours')
      .populate('slots.faculty', 'name email department')
      .populate('slots.classroom', 'name roomNumber capacity type')
      .populate('generatedBy', 'name');

    // Filter slots belonging to this faculty only
    const facultyTimetables = [];
    for (const tt of timetables) {
      const mySlots = tt.slots.filter(s => s.faculty && s.faculty._id.toString() === facultyId.toString());
      if (!mySlots.length) continue;

      // Build a structured weekly grid for this faculty
      const weekGrid = {};
      for (const day of DAYS) {
        weekGrid[day] = {};
        for (const ts of TIME_SLOTS) {
          weekGrid[day][ts.period] = null;
        }
      }
      for (const slot of mySlots) {
        if (weekGrid[slot.day]) {
          weekGrid[slot.day][slot.period] = {
            _id: slot._id,
            subject: slot.subject,
            classroom: slot.classroom,
            startTime: slot.startTime,
            endTime: slot.endTime,
          };
        }
      }

      facultyTimetables.push({
        timetableId: tt._id,
        department: tt.department,
        semester: tt.semester,
        section: tt.section,
        academicYear: tt.academicYear,
        weekGrid,
        rawSlots: mySlots,
        totalSlotsPerWeek: mySlots.length,
      });
    }

    // Build summary: unique subjects taught by this faculty
    const allMySlots = facultyTimetables.flatMap(tt => tt.rawSlots);
    const subjectMap = {};
    for (const slot of allMySlots) {
      if (slot.subject) {
        const sid = slot.subject._id.toString();
        if (!subjectMap[sid]) subjectMap[sid] = { ...slot.subject.toObject(), periodsPerWeek: 0 };
        subjectMap[sid].periodsPerWeek++;
      }
    }

    res.json({
      success: true,
      facultyId,
      timetables: facultyTimetables,
      subjectSummary: Object.values(subjectMap),
      totalWeeklyPeriods: allMySlots.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET MY TIMETABLE (for logged-in faculty) ────────────────────────────────
exports.getMyTimetable = async (req, res) => {
  req.params.facultyId = req.user._id;
  return exports.getFacultyTimetable(req, res);
};

exports.generateTimetable = async (req, res) => {
  try {
    const { department, semester, section = 'A', academicYear } = req.body;
    const subjects = await Subject.find({ department, semester, isActive: true }).populate('faculty');
    if (!subjects.length) return res.status(400).json({ message: 'No subjects found for this department and semester' });

    const classrooms = await Classroom.find({ isAvailable: true });
    if (!classrooms.length) return res.status(400).json({ message: 'No classrooms available' });

    const facultyBusy = {};
    const classroomBusy = {};
    const slots = [];

    for (const subject of subjects) {
      const hoursNeeded = subject.hoursPerWeek || 3;
      let hoursAssigned = 0;
      const faculty = subject.faculty;
      if (!faculty) continue;

      const facultyId = faculty._id.toString();
      if (!facultyBusy[facultyId]) facultyBusy[facultyId] = new Set();

      const suitableRoom =
        classrooms.find((c) => {
          const roomId = c._id.toString();
          if (!classroomBusy[roomId]) classroomBusy[roomId] = new Set();
          return subject.type === 'lab' ? c.type === 'lab' : c.type !== 'lab';
        }) || classrooms[0];

      const roomId = suitableRoom._id.toString();
      if (!classroomBusy[roomId]) classroomBusy[roomId] = new Set();

      for (const day of DAYS) {
        if (hoursAssigned >= hoursNeeded) break;
        for (const slot of TIME_SLOTS) {
          if (hoursAssigned >= hoursNeeded) break;
          const key = `${day}-${slot.period}`;
          if (facultyBusy[facultyId].has(key)) continue;
          if (classroomBusy[roomId].has(key)) continue;
          const slotExists = slots.find((s) => s.day === day && s.period === slot.period);
          if (slotExists) continue;

          facultyBusy[facultyId].add(key);
          classroomBusy[roomId].add(key);
          slots.push({ day, period: slot.period, startTime: slot.startTime, endTime: slot.endTime, subject: subject._id, faculty: faculty._id, classroom: suitableRoom._id });
          hoursAssigned++;
        }
      }
    }

    await Timetable.updateMany({ department, semester, section, academicYear }, { isActive: false });
    const timetable = await Timetable.create({ department, semester, section, academicYear, slots, generatedBy: req.user._id, isActive: true });

    const populated = await Timetable.findById(timetable._id)
      .populate('slots.subject', 'name code type')
      .populate('slots.faculty', 'name email')
      .populate('slots.classroom', 'name roomNumber');

    // Send emails to faculty
    const facultySlotMap = new Map();
    for (const slot of populated.slots) {
      if (!slot.faculty) continue;
      const fid = slot.faculty._id.toString();
      if (!facultySlotMap.has(fid)) facultySlotMap.set(fid, { faculty: slot.faculty, slots: [] });
      facultySlotMap.get(fid).slots.push({
        day: slot.day, period: slot.period, startTime: slot.startTime, endTime: slot.endTime,
        subjectName: slot.subject?.name, subjectCode: slot.subject?.code,
        classroomName: slot.classroom?.roomNumber || slot.classroom?.name,
      });
    }
    for (const [, data] of facultySlotMap) {
      sendTimetableAssignedEmail({ faculty: data.faculty, timetable: { department, semester, section, academicYear }, slots: data.slots })
        .catch(err => console.error('Timetable email failed:', err.message));
    }

    res.status(201).json({
      success: true, timetable: populated,
      message: `Timetable generated with ${slots.length} slots. Emails sent to ${facultySlotMap.size} faculty.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteTimetable = async (req, res) => {
  try {
    const timetable = await Timetable.findByIdAndDelete(req.params.id);
    if (!timetable) return res.status(404).json({ message: 'Timetable not found' });
    res.json({ success: true, message: 'Timetable deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const [totalFaculty, totalStudents, totalClassrooms, totalSubjects, totalTimetables] = await Promise.all([
      User.countDocuments({ role: 'faculty' }),
      User.countDocuments({ role: 'student' }),
      Classroom.countDocuments(),
      Subject.countDocuments(),
      Timetable.countDocuments({ isActive: true }),
    ]);

    // Extra stats: average completion across all subjects
    const subjects = await Subject.find({ isActive: true, totalHours: { $gt: 0 } });
    const avgCompletion = subjects.length
      ? Math.round(subjects.reduce((s, sub) => s + sub.completionPercentage, 0) / subjects.length)
      : 0;

    res.json({ success: true, stats: { totalFaculty, totalStudents, totalClassrooms, totalSubjects, totalTimetables, avgSubjectCompletion: avgCompletion } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
