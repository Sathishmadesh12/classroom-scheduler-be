const User = require('../models/User');
const { sendAccountStatusEmail } = require('../utils/emailService');

exports.getAllUsers = async (req, res) => {
  try {
    const { role, department, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (department) filter.department = department;

    const users = await User.find(filter)
      .skip((page - 1) * limit).limit(Number(limit)).sort({ createdAt: -1 });
    const total = await User.countDocuments(filter);
    res.json({ success: true, users, total, page: Number(page) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Toggle active status + send email notification
exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isActive = !user.isActive;
    await user.save();

    // Send email about status change
    sendAccountStatusEmail({
      name: user.name,
      email: user.email,
      isActive: user.isActive,
    }).catch((err) => console.error('Status email failed:', err.message));

    res.json({
      success: true,
      user,
      message: `Account ${user.isActive ? 'activated' : 'deactivated'}. Email notification sent.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
