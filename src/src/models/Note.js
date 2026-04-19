const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  department: { type: String, required: true },
  semester: { type: Number, required: true },
  // Cloudinary file info
  files: [{
    fileName: String,
    fileType: String,        // pdf, image, doc, etc.
    cloudinaryId: String,
    url: String,
    size: Number,            // bytes
  }],
  // Visibility - which students can see
  visibleTo: {
    type: String,
    enum: ['all', 'department', 'semester'],
    default: 'semester',
  },
  isPublished: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Note', noteSchema);
