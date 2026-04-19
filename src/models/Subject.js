const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true },
  department: { type: String, required: true },
  semester: { type: Number, required: true, min: 1, max: 8 },
  credits: { type: Number, default: 3 },
  hoursPerWeek: { type: Number, default: 3 },
  type: { type: String, enum: ['theory', 'lab', 'elective'], default: 'theory' },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  // ── Completion Tracking ───────────────────────────────────────────────────
  totalHours: { type: Number, default: 0 },       // Total hours planned for the semester
  completedHours: { type: Number, default: 0 },   // Hours actually taught
  completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
}, { timestamps: true });

// Auto-calc completionPercentage before save
subjectSchema.pre('save', function (next) {
  if (this.totalHours > 0) {
    this.completionPercentage = Math.min(
      Math.round((this.completedHours / this.totalHours) * 100),
      100
    );
  } else {
    this.completionPercentage = 0;
  }
  next();
});

module.exports = mongoose.model('Subject', subjectSchema);
