const mongoose = require('mongoose');

const classroomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  roomNumber: { type: String, required: true, unique: true },
  capacity: { type: Number, required: true },
  type: { type: String, enum: ['lecture', 'lab', 'seminar', 'auditorium'], default: 'lecture' },
  department: { type: String },
  facilities: [{ type: String }],
  isAvailable: { type: Boolean, default: true },
  floor: { type: Number },
  building: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Classroom', classroomSchema);
