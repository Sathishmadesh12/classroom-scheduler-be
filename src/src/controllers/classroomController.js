const Classroom = require('../models/Classroom');

exports.getAllClassrooms = async (req, res) => {
  try {
    const { type, department, isAvailable } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (department) filter.department = department;
    if (isAvailable !== undefined) filter.isAvailable = isAvailable === 'true';

    const classrooms = await Classroom.find(filter).sort({ roomNumber: 1 });
    res.json({ success: true, classrooms, total: classrooms.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createClassroom = async (req, res) => {
  try {
    const classroom = await Classroom.create(req.body);
    res.status(201).json({ success: true, classroom });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateClassroom = async (req, res) => {
  try {
    const classroom = await Classroom.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!classroom) return res.status(404).json({ message: 'Classroom not found' });
    res.json({ success: true, classroom });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteClassroom = async (req, res) => {
  try {
    const classroom = await Classroom.findByIdAndDelete(req.params.id);
    if (!classroom) return res.status(404).json({ message: 'Classroom not found' });
    res.json({ success: true, message: 'Classroom deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
