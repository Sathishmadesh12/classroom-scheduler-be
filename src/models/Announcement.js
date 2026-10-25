const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  priority: { type: String, enum: ['normal', 'important', 'urgent'], default: 'normal' },
  audience: { type: String, enum: ['all', 'faculty', 'student'], default: 'all' },
  department: { type: String }, // optional: limit to a department
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);
