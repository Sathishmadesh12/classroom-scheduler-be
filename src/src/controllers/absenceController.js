const AbsenceCover = require('../models/AbsenceCover');
const Subject = require('../models/Subject');
const User = require('../models/User');
const Timetable = require('../models/Timetable');
const { sendSubjectAssignedEmail } = require('../utils/emailService');

// ─── SMART: Find best cover faculty based on completion % ────────────────────
// Logic: When faculty A is absent, find another faculty in the SAME department
// whose OWN subject has the LOWEST completion % → they need to teach more
// → assign them to cover the absent slot so they can use the opportunity
// to cover their own backlog or simply cover
const findBestCoverFaculty = async (absentFacultyId, department, semester, period, day, date) => {
  // Get all active faculty in same department except absent one
  const allFaculty = await User.find({
    role: 'faculty',
    department,
    isActive: true,
    _id: { $ne: absentFacultyId },
  });

  if (!allFaculty.length) return null;

  // Get their subjects + completion %
  const facultyScores = [];
  for (const f of allFaculty) {
    const subjects = await Subject.find({ faculty: f._id, department, semester, isActive: true });
    if (!subjects.length) continue;

    // Average completion % of their subjects
    const avgCompletion = subjects.reduce((sum, s) => sum + (s.completionPercentage || 0), 0) / subjects.length;

    // Find which subject has lowest completion (most behind)
    const leastCompleteSubject = subjects.reduce((prev, curr) =>
      (prev.completionPercentage || 0) < (curr.completionPercentage || 0) ? prev : curr
    );

    // Check if this faculty is already busy at this period/day
    const existingCover = await AbsenceCover.findOne({
      coverFaculty: f._id,
      day,
      period,
      date: { $gte: new Date(date).setHours(0,0,0,0), $lte: new Date(date).setHours(23,59,59,999) },
      status: { $nin: ['cancelled'] },
    });
    if (existingCover) continue; // Already covering another slot

    facultyScores.push({
      faculty: f,
      avgCompletion,
      leastCompleteSubject,
      lowestCompletion: leastCompleteSubject.completionPercentage || 0,
    });
  }

  if (!facultyScores.length) return null;

  // Sort by LOWEST average completion % → they need the most "catch-up"
  facultyScores.sort((a, b) => a.avgCompletion - b.avgCompletion);

  return facultyScores[0]; // Best cover candidate
};

// ─── REPORT ABSENCE + Get smart suggestions ───────────────────────────────────
exports.reportAbsence = async (req, res) => {
  try {
    const { absentFacultyId, date, periods, department, semester, section = 'A', reason } = req.body;
    // periods = array of { period, day, subjectId }

    const absentFaculty = await User.findById(absentFacultyId);
    if (!absentFaculty) return res.status(404).json({ message: 'Faculty not found' });

    const suggestions = [];
    const createdCovers = [];

    for (const slot of periods) {
      const { period, day, subjectId } = slot;

      const bestCover = await findBestCoverFaculty(absentFacultyId, department, semester, period, day, date);

      if (!bestCover) {
        suggestions.push({
          period, day, subjectId,
          message: 'No available faculty found for this slot',
          coverFaculty: null,
        });
        continue;
      }

      // Create the cover record
      const cover = await AbsenceCover.create({
        date: new Date(date),
        absentFaculty: absentFacultyId,
        coverFaculty: bestCover.faculty._id,
        subject: subjectId,
        coverSubject: bestCover.leastCompleteSubject._id,
        period,
        day,
        department,
        semester,
        section,
        reason,
        status: 'pending',
        suggestedByCoverPercent: bestCover.lowestCompletion,
      });

      const populated = await AbsenceCover.findById(cover._id)
        .populate('absentFaculty', 'name email')
        .populate('coverFaculty', 'name email department')
        .populate('subject', 'name code')
        .populate('coverSubject', 'name code completionPercentage');

      createdCovers.push(populated);

      suggestions.push({
        period, day, subjectId,
        coverFaculty: bestCover.faculty,
        lowestCompletionSubject: bestCover.leastCompleteSubject.name,
        lowestCompletionPercent: bestCover.lowestCompletion,
        avgCompletion: bestCover.avgCompletion,
        coverId: cover._id,
        message: `${bestCover.faculty.name} suggested — their subject "${bestCover.leastCompleteSubject.name}" is only ${bestCover.lowestCompletion}% complete`,
      });
    }

    res.status(201).json({
      success: true,
      message: `Absence reported. ${createdCovers.length} cover suggestions generated.`,
      suggestions,
      covers: createdCovers,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET COVER SUGGESTIONS for a faculty's absent period ──────────────────────
exports.getCoverSuggestions = async (req, res) => {
  try {
    const { absentFacultyId, date, period, day, department, semester } = req.query;
    const result = await findBestCoverFaculty(absentFacultyId, department, Number(semester), Number(period), day, date);

    if (!result) {
      return res.json({ success: true, suggestion: null, message: 'No available faculty' });
    }

    // Get ALL faculty ranked by completion %
    const allFaculty = await User.find({ role: 'faculty', department, isActive: true, _id: { $ne: absentFacultyId } });
    const ranked = [];
    for (const f of allFaculty) {
      const subjects = await Subject.find({ faculty: f._id, department, semester: Number(semester), isActive: true });
      if (!subjects.length) continue;
      const avgCompletion = subjects.reduce((sum, s) => sum + (s.completionPercentage || 0), 0) / subjects.length;
      const leastComplete = subjects.reduce((p, c) => (p.completionPercentage||0) < (c.completionPercentage||0) ? p : c);
      ranked.push({
        faculty: { _id: f._id, name: f.name, email: f.email, department: f.department },
        avgCompletion: Math.round(avgCompletion),
        leastCompleteSubject: {
          name: leastComplete.name,
          code: leastComplete.code,
          completionPercentage: leastComplete.completionPercentage,
        },
        subjects: subjects.map(s => ({ name: s.name, code: s.code, completionPercentage: s.completionPercentage })),
      });
    }
    ranked.sort((a, b) => a.avgCompletion - b.avgCompletion);

    res.json({ success: true, bestSuggestion: ranked[0] || null, allRanked: ranked });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── UPDATE COVER STATUS (confirm / cancel) ───────────────────────────────────
exports.updateCoverStatus = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const cover = await AbsenceCover.findByIdAndUpdate(
      req.params.id,
      { status, adminNotes },
      { new: true }
    )
      .populate('absentFaculty', 'name email')
      .populate('coverFaculty', 'name email')
      .populate('subject', 'name code')
      .populate('coverSubject', 'name code completionPercentage');

    if (!cover) return res.status(404).json({ message: 'Cover record not found' });
    res.json({ success: true, cover });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET ALL COVERS (Admin view) ─────────────────────────────────────────────
exports.getCovers = async (req, res) => {
  try {
    const { department, semester, date, status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (semester) filter.semester = Number(semester);
    if (status) filter.status = status;
    if (date) {
      const d = new Date(date);
      filter.date = { $gte: new Date(d.setHours(0,0,0,0)), $lte: new Date(d.setHours(23,59,59,999)) };
    }

    const covers = await AbsenceCover.find(filter)
      .populate('absentFaculty', 'name email department')
      .populate('coverFaculty', 'name email department')
      .populate('subject', 'name code')
      .populate('coverSubject', 'name code completionPercentage')
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await AbsenceCover.countDocuments(filter);
    res.json({ success: true, covers, total, page: Number(page) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET FACULTY COMPLETION REPORT ───────────────────────────────────────────
// Shows all faculty + their subjects + completion % — used for admin dashboard
exports.getCompletionReport = async (req, res) => {
  try {
    const { department, semester } = req.query;
    const subjectFilter = { isActive: true };
    if (department) subjectFilter.department = department;
    if (semester) subjectFilter.semester = Number(semester);

    const subjects = await Subject.find(subjectFilter)
      .populate('faculty', 'name email department')
      .sort({ completionPercentage: 1 }); // Lowest first

    // Group by faculty
    const byFaculty = {};
    for (const sub of subjects) {
      if (!sub.faculty) continue;
      const fid = sub.faculty._id.toString();
      if (!byFaculty[fid]) {
        byFaculty[fid] = {
          faculty: sub.faculty,
          subjects: [],
          avgCompletion: 0,
        };
      }
      byFaculty[fid].subjects.push({
        _id: sub._id,
        name: sub.name,
        code: sub.code,
        totalHours: sub.totalHours,
        completedHours: sub.completedHours,
        completionPercentage: sub.completionPercentage,
        semester: sub.semester,
        department: sub.department,
      });
    }

    // Calc avg per faculty
    const report = Object.values(byFaculty).map(item => {
      item.avgCompletion = item.subjects.length
        ? Math.round(item.subjects.reduce((s, sub) => s + sub.completionPercentage, 0) / item.subjects.length)
        : 0;
      return item;
    }).sort((a, b) => a.avgCompletion - b.avgCompletion); // Lowest first

    res.json({ success: true, report, total: report.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── UPDATE SUBJECT COMPLETION (Faculty marks hours done) ────────────────────
exports.updateCompletion = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { completedHours, totalHours } = req.body;

    const subject = await Subject.findById(subjectId).populate('faculty', 'name');
    if (!subject) return res.status(404).json({ message: 'Subject not found' });

    // Only the assigned faculty or admin can update
    if (req.user.role !== 'admin' && subject.faculty?._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (totalHours !== undefined) subject.totalHours = Number(totalHours);
    if (completedHours !== undefined) subject.completedHours = Math.min(Number(completedHours), subject.totalHours || 9999);

    await subject.save(); // pre-save hook calculates completionPercentage

    res.json({ success: true, subject, message: `Completion updated to ${subject.completionPercentage}%` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
