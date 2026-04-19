const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  day: { type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], required: true },
  period: { type: Number, required: true, min: 1, max: 8 },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom' },
});

const timetableSchema = new mongoose.Schema({
  department: { type: String, required: true },
  semester: { type: Number, required: true, min: 1, max: 8 },
  section: { type: String, default: 'A' },
  academicYear: { type: String, required: true },
  slots: [slotSchema],
  isActive: { type: Boolean, default: true },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Timetable', timetableSchema);
