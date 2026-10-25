const User = require('../models/User');
const { sendWelcomeEmail } = require('../utils/emailService');

// Auto-generate a random password
const generateRandomPassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
};

// Parse CSV text → array of objects using first row as headers
const parseCSV = (text) => {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    // Handle quoted fields with commas inside
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; continue; }
      if (line[i] === ',' && !inQuotes) { values.push(cur.trim()); cur = ''; continue; }
      cur += line[i];
    }
    values.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
};

// ─── IMPORT FACULTY (CSV upload) ─────────────────────────────────────────────
// POST /api/users/import-faculty
// Body: multipart/form-data with field "file" (CSV)
// CSV columns: name, email, department, phone  (password optional)
exports.importFaculty = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const text = req.file.buffer.toString('utf-8');
    const rows = parseCSV(text);

    if (rows.length === 0)
      return res.status(400).json({ message: 'CSV is empty or has no data rows' });

    const results = { created: [], skipped: [], errors: [] };

    for (const row of rows) {
      const name = row.name || row.full_name || '';
      const email = (row.email || '').toLowerCase();

      if (!name || !email) {
        results.errors.push({ row, reason: 'Missing name or email' });
        continue;
      }

      // Skip duplicates
      const existing = await User.findOne({ email });
      if (existing) {
        results.skipped.push({ email, reason: 'Email already exists' });
        continue;
      }

      const plainPassword = row.password || generateRandomPassword();

      try {
        const user = await User.create({
          name,
          email,
          password: plainPassword,
          role: 'faculty',
          department: row.department || '',
          phone: row.phone || '',
        });

        // Send welcome email (non-blocking)
        sendWelcomeEmail({ name, email, password: plainPassword, role: 'faculty', department: row.department }).catch(
          err => console.error('Welcome email failed:', err.message)
        );

        results.created.push({ name, email });
      } catch (err) {
        results.errors.push({ email, reason: err.message });
      }
    }

    return res.status(201).json({
      success: true,
      summary: {
        total: rows.length,
        created: results.created.length,
        skipped: results.skipped.length,
        errors: results.errors.length,
      },
      details: results,
      message: `Import complete. ${results.created.length} faculty created, ${results.skipped.length} skipped, ${results.errors.length} errors.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── IMPORT STUDENTS (CSV upload) ────────────────────────────────────────────
// POST /api/users/import-students
// Body: multipart/form-data with field "file" (CSV)
// CSV columns: name, email, department, phone  (password optional)
exports.importStudents = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const text = req.file.buffer.toString('utf-8');
    const rows = parseCSV(text);

    if (rows.length === 0)
      return res.status(400).json({ message: 'CSV is empty or has no data rows' });

    const results = { created: [], skipped: [], errors: [] };

    for (const row of rows) {
      const name = row.name || row.full_name || '';
      const email = (row.email || '').toLowerCase();

      if (!name || !email) {
        results.errors.push({ row, reason: 'Missing name or email' });
        continue;
      }

      const existing = await User.findOne({ email });
      if (existing) {
        results.skipped.push({ email, reason: 'Email already exists' });
        continue;
      }

      const plainPassword = row.password || generateRandomPassword();

      try {
        const user = await User.create({
          name,
          email,
          password: plainPassword,
          role: 'student',
          department: row.department || '',
          phone: row.phone || '',
        });

        sendWelcomeEmail({ name, email, password: plainPassword, role: 'student', department: row.department }).catch(
          err => console.error('Welcome email failed:', err.message)
        );

        results.created.push({ name, email });
      } catch (err) {
        results.errors.push({ email, reason: err.message });
      }
    }

    return res.status(201).json({
      success: true,
      summary: {
        total: rows.length,
        created: results.created.length,
        skipped: results.skipped.length,
        errors: results.errors.length,
      },
      details: results,
      message: `Import complete. ${results.created.length} students created, ${results.skipped.length} skipped, ${results.errors.length} errors.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
