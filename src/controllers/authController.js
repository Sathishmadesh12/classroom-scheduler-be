const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} = require('../utils/emailService');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

// In-memory OTP store (use Redis in production)
const otpStore = new Map();

// Auto-generate a random password
const generateRandomPassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
};

// ─── REGISTER (Admin creates staff) ──────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { name, email, password: manualPassword, role, department, phone, sendEmail = true } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already exists' });

    // If no password provided, auto-generate one
    const plainPassword = manualPassword || generateRandomPassword();

    const user = await User.create({ name, email, password: plainPassword, role, department, phone });
    const token = generateToken(user._id);

    // Send welcome email with credentials
    if (sendEmail) {
      sendWelcomeEmail({ name, email, password: plainPassword, role, department }).catch((err) =>
        console.error('Welcome email failed:', err.message)
      );
    }

    res.status(201).json({
      success: true,
      token,
      user,
      message: sendEmail ? 'User created. Welcome email sent.' : 'User created.',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (!user.isActive) return res.status(401).json({ message: 'Account is deactivated' });

    const token = generateToken(user._id);
    res.json({ success: true, token, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET ME ───────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, department } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, department },
      { new: true }
    );
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── FORGOT PASSWORD (Send OTP) ───────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'No user found with this email' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(email, { otp, expiresAt });

    await sendPasswordResetEmail({ name: user.name, email, otp });

    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── RESET PASSWORD (Verify OTP + Set new password) ──────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const record = otpStore.get(email);
    if (!record) return res.status(400).json({ message: 'OTP not found. Please request again.' });
    if (Date.now() > record.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ message: 'OTP expired. Please request again.' });
    }
    if (record.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.password = newPassword;
    await user.save();
    otpStore.delete(email);

    sendPasswordChangedEmail({ name: user.name, email }).catch((err) =>
      console.error('Password changed email failed:', err.message)
    );

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── CHANGE PASSWORD (Logged-in user) ────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });

    user.password = newPassword;
    await user.save();

    sendPasswordChangedEmail({ name: user.name, email: user.email }).catch((err) =>
      console.error('Password changed email failed:', err.message)
    );

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
