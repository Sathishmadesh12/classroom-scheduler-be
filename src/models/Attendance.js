const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['present', 'absent', 'late'], default: 'absent' },
});

const attendanceSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  department: { type: String, required: true },
  semester: { type: Number, required: true },
  section: { type: String, default: 'A' },
  period: { type: Number, required: true },
  records: [attendanceRecordSchema],
  notes: { type: String, default: '' },
}, { timestamps: true });

// Prevent duplicate attendance for same subject+date+period
attendanceSchema.index({ date: 1, subject: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
