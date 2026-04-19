const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const userCtrl = require('../controllers/userController');
const classroomCtrl = require('../controllers/classroomController');
const subjectCtrl = require('../controllers/subjectController');
const timetableCtrl = require('../controllers/timetableController');
const noteCtrl = require('../controllers/noteController');
const absenceCtrl = require('../controllers/absenceController');
const { protect, adminOnly, facultyOrAdmin } = require('../middleware/auth');
const upload = require('../config/multer');

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', protect, authCtrl.getMe);
router.put('/auth/profile', protect, authCtrl.updateProfile);
router.post('/auth/forgot-password', authCtrl.forgotPassword);
router.post('/auth/reset-password', authCtrl.resetPassword);
router.put('/auth/change-password', protect, authCtrl.changePassword);

// ─── Users ────────────────────────────────────────────────────────────────────
router.get('/users', protect, adminOnly, userCtrl.getAllUsers);
router.get('/users/:id', protect, userCtrl.getUserById);
router.put('/users/:id', protect, adminOnly, userCtrl.updateUser);
router.delete('/users/:id', protect, adminOnly, userCtrl.deleteUser);
router.patch('/users/:id/toggle-status', protect, adminOnly, userCtrl.toggleUserStatus);

// ─── Classrooms ───────────────────────────────────────────────────────────────
router.get('/classrooms', protect, classroomCtrl.getAllClassrooms);
router.post('/classrooms', protect, adminOnly, classroomCtrl.createClassroom);
router.put('/classrooms/:id', protect, adminOnly, classroomCtrl.updateClassroom);
router.delete('/classrooms/:id', protect, adminOnly, classroomCtrl.deleteClassroom);

// ─── Subjects ─────────────────────────────────────────────────────────────────
router.get('/subjects', protect, subjectCtrl.getAllSubjects);
router.post('/subjects', protect, facultyOrAdmin, subjectCtrl.createSubject);
router.put('/subjects/:id', protect, facultyOrAdmin, subjectCtrl.updateSubject);
router.delete('/subjects/:id', protect, adminOnly, subjectCtrl.deleteSubject);
router.post('/subjects/bulk-completion', protect, adminOnly, subjectCtrl.bulkUpdateCompletion);

// ─── Timetables ───────────────────────────────────────────────────────────────
router.get('/timetables', protect, timetableCtrl.getTimetables);
router.get('/timetables/my-timetable', protect, timetableCtrl.getMyTimetable);                          // Faculty: own timetable
router.get('/timetables/faculty/:facultyId', protect, timetableCtrl.getFacultyTimetable);              // Admin: any faculty's timetable
router.get('/timetables/:id', protect, timetableCtrl.getTimetableById);
router.post('/timetables/generate', protect, adminOnly, timetableCtrl.generateTimetable);
router.delete('/timetables/:id', protect, adminOnly, timetableCtrl.deleteTimetable);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard/stats', protect, timetableCtrl.getDashboardStats);

// ─── Notes (Cloudinary-backed) ────────────────────────────────────────────────
router.get('/notes', protect, noteCtrl.getNotes);                                       // All: browse notes
router.get('/notes/my-notes', protect, facultyOrAdmin, noteCtrl.getMyNotes);           // Faculty: own notes
router.get('/notes/:id', protect, noteCtrl.getNoteById);
router.post('/notes', protect, facultyOrAdmin, upload.array('files', 10), noteCtrl.createNote);        // Upload up to 10 files
router.put('/notes/:id', protect, facultyOrAdmin, upload.array('files', 10), noteCtrl.updateNote);
router.delete('/notes/:id/files/:cloudinaryId', protect, facultyOrAdmin, noteCtrl.deleteFile);
router.delete('/notes/:id', protect, facultyOrAdmin, noteCtrl.deleteNote);

// ─── Absence Cover (Smart Assignment) ────────────────────────────────────────
router.get('/absence/covers', protect, adminOnly, absenceCtrl.getCovers);
router.get('/absence/suggestions', protect, adminOnly, absenceCtrl.getCoverSuggestions);
router.get('/absence/completion-report', protect, adminOnly, absenceCtrl.getCompletionReport);
router.post('/absence/report', protect, adminOnly, absenceCtrl.reportAbsence);
router.patch('/absence/covers/:id/status', protect, adminOnly, absenceCtrl.updateCoverStatus);
router.patch('/absence/subjects/:subjectId/completion', protect, facultyOrAdmin, absenceCtrl.updateCompletion);

module.exports = router;
