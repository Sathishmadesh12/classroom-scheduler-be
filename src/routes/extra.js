// Extra routes for the new modules. Mounted from routes/index.js with one line.
const express = require('express');
const router = express.Router();
const extra = require('../controllers/extraController');
const absenceCtrl = require('../controllers/absenceController');
const { protect, adminOnly, facultyOrAdmin } = require('../middleware/auth');

// Announcements
router.get('/announcements', protect, extra.getAnnouncements);
router.post('/announcements', protect, facultyOrAdmin, extra.createAnnouncement);
router.delete('/announcements/:id', protect, facultyOrAdmin, extra.deleteAnnouncement);

// Reports
router.get('/reports/overview', protect, adminOnly, extra.getReportsOverview);

// NOTE: in routes/index.js this route is commented out by accident (it sits on the same line as the
// "Absence Cover" comment), so GET /absence/covers returned 404. Registered here so the Absence module works.
router.get('/absence/covers', protect, adminOnly, absenceCtrl.getCovers);

module.exports = router;
