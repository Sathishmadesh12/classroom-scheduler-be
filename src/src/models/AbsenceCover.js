const mongoose = require('mongoose');

const absenceCoverSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  absentFaculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  coverFaculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  // The subject the cover faculty teaches (their least complete subject as context)
  coverSubject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  period: { type: Number, required: true },
  day: { type: String, required: true },
  department: { type: String, required: true },
  semester: { type: Number, required: true },
  section: { type: String, default: 'A' },
  reason: { type: String },
  status: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled'], default: 'pending' },
  adminNotes: { type: String },
  suggestedByCoverPercent: { type: Number }, // The % that triggered this suggestion
}, { timestamps: true });

module.exports = mongoose.model('AbsenceCover', absenceCoverSchema);
