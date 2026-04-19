const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

transporter.verify((error) => {
  if (error) console.error('SMTP connection error:', error.message);
  else console.log('SMTP server connected ✅');
});

const htmlWrapper = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .header p { color: rgba(255,255,255,0.85); margin: 5px 0 0; font-size: 14px; }
    .body { padding: 30px; color: #333; }
    .body h2 { color: #4a4a4a; margin-top: 0; }
    .info-box { background: #f0f4ff; border-left: 4px solid #667eea; padding: 15px 20px; border-radius: 5px; margin: 20px 0; }
    .info-row { display: flex; margin: 8px 0; }
    .info-label { font-weight: bold; color: #555; min-width: 140px; }
    .info-value { color: #333; }
    .badge { display: inline-block; background: #667eea; color: white; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; }
    .badge.green { background: #28a745; }
    .badge.red { background: #dc3545; }
    .badge.orange { background: #fd7e14; }
    .btn { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 15px; }
    .footer { background: #f8f9fa; padding: 20px 30px; text-align: center; color: #888; font-size: 13px; border-top: 1px solid #eee; }
    .divider { height: 1px; background: #eee; margin: 20px 0; }
    .schedule-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .schedule-table th { background: #667eea; color: white; padding: 10px; text-align: left; font-size: 13px; }
    .schedule-table td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
    .schedule-table tr:hover td { background: #f8f9ff; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📚 ClassScheduler</h1>
      <p>Smart Classroom Scheduling System</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} ClassScheduler. All rights reserved.</p>
      <p>This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
`;

// 1. Welcome email
const sendWelcomeEmail = async ({ name, email, password, role, department }) => {
  const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
  const content = `
    <h2>Welcome to ClassScheduler, ${name}! 🎉</h2>
    <p>Your account has been created. Here are your login credentials:</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${name}</span></div>
      <div class="info-row"><span class="info-label">Email:</span><span class="info-value">${email}</span></div>
      <div class="info-row"><span class="info-label">Password:</span><span class="info-value"><strong>${password}</strong></span></div>
      <div class="info-row"><span class="info-label">Role:</span><span class="info-value"><span class="badge">${roleDisplay}</span></span></div>
      ${department ? `<div class="info-row"><span class="info-label">Department:</span><span class="info-value">${department}</span></div>` : ''}
    </div>
    <p>⚠️ Please change your password after first login.</p>
    <a href="${process.env.CLIENT_URL}/login" class="btn">Login Now →</a>
  `;
  return transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: `Welcome to ClassScheduler - Your Account is Ready`,
    html: htmlWrapper(content),
  });
};

// 2. Timetable assigned
const sendTimetableAssignedEmail = async ({ faculty, timetable, slots }) => {
  const slotRows = slots.map(s => `
    <tr>
      <td>${s.day}</td>
      <td>Period ${s.period} (${s.startTime} - ${s.endTime})</td>
      <td>${s.subjectName || 'N/A'} (${s.subjectCode || ''})</td>
      <td>${s.classroomName || 'N/A'}</td>
    </tr>
  `).join('');
  const content = `
    <h2>📅 Timetable Assigned</h2>
    <p>Hello <strong>${faculty.name}</strong>, a new timetable has been assigned to you.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Department:</span><span class="info-value">${timetable.department}</span></div>
      <div class="info-row"><span class="info-label">Semester:</span><span class="info-value">${timetable.semester}</span></div>
      <div class="info-row"><span class="info-label">Section:</span><span class="info-value">${timetable.section}</span></div>
      <div class="info-row"><span class="info-label">Academic Year:</span><span class="info-value">${timetable.academicYear}</span></div>
    </div>
    <p><strong>Your Schedule:</strong></p>
    <table class="schedule-table">
      <thead><tr><th>Day</th><th>Time Slot</th><th>Subject</th><th>Classroom</th></tr></thead>
      <tbody>${slotRows || '<tr><td colspan="4" style="text-align:center;color:#888;">No slots assigned</td></tr>'}</tbody>
    </table>
    <br><a href="${process.env.CLIENT_URL}/timetable" class="btn">View Full Timetable →</a>
  `;
  return transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
    to: faculty.email,
    subject: `Timetable Assigned - ${timetable.department} Sem ${timetable.semester} (${timetable.academicYear})`,
    html: htmlWrapper(content),
  });
};

// 3. Subject assigned
const sendSubjectAssignedEmail = async ({ faculty, subject }) => {
  const content = `
    <h2>📖 Subject Assigned to You</h2>
    <p>Hello <strong>${faculty.name}</strong>, a subject has been assigned to you.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Subject Name:</span><span class="info-value">${subject.name}</span></div>
      <div class="info-row"><span class="info-label">Subject Code:</span><span class="info-value">${subject.code}</span></div>
      <div class="info-row"><span class="info-label">Department:</span><span class="info-value">${subject.department}</span></div>
      <div class="info-row"><span class="info-label">Semester:</span><span class="info-value">${subject.semester}</span></div>
      <div class="info-row"><span class="info-label">Type:</span><span class="info-value"><span class="badge">${subject.type}</span></span></div>
      <div class="info-row"><span class="info-label">Credits:</span><span class="info-value">${subject.credits}</span></div>
      <div class="info-row"><span class="info-label">Hours/Week:</span><span class="info-value">${subject.hoursPerWeek}</span></div>
    </div>
    <a href="${process.env.CLIENT_URL}/subjects" class="btn">View Subjects →</a>
  `;
  return transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
    to: faculty.email,
    subject: `Subject Assigned: ${subject.name} (${subject.code})`,
    html: htmlWrapper(content),
  });
};

// 4. Account status changed
const sendAccountStatusEmail = async ({ name, email, isActive }) => {
  const status = isActive ? 'Activated' : 'Deactivated';
  const badgeClass = isActive ? 'green' : 'red';
  const icon = isActive ? '✅' : '⛔';
  const content = `
    <h2>${icon} Account ${status}</h2>
    <p>Hello <strong>${name}</strong>,</p>
    <p>Your account has been <strong>${status.toLowerCase()}</strong> by the administrator.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Status:</span><span class="info-value"><span class="badge ${badgeClass}">${status}</span></span></div>
      <div class="info-row"><span class="info-label">Email:</span><span class="info-value">${email}</span></div>
    </div>
    ${isActive ? `<a href="${process.env.CLIENT_URL}/login" class="btn">Login Now →</a>` : `<p>Contact your administrator to reactivate.</p>`}
  `;
  return transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: `Account ${status} - ClassScheduler`,
    html: htmlWrapper(content),
  });
};

// 5. Password reset OTP
const sendPasswordResetEmail = async ({ name, email, otp }) => {
  const content = `
    <h2>🔐 Password Reset Request</h2>
    <p>Hello <strong>${name}</strong>,</p>
    <p>Use the OTP below to reset your password:</p>
    <div style="text-align:center; margin: 30px 0;">
      <div style="display:inline-block; background: linear-gradient(135deg,#667eea,#764ba2); color:white; font-size:36px; font-weight:bold; letter-spacing:10px; padding: 20px 40px; border-radius:10px;">${otp}</div>
    </div>
    <p style="color:#888; font-size:13px;">Valid for <strong>10 minutes</strong>. Do not share.</p>
  `;
  return transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: `Password Reset OTP - ClassScheduler`,
    html: htmlWrapper(content),
  });
};

// 6. Password changed
const sendPasswordChangedEmail = async ({ name, email }) => {
  const content = `
    <h2>✅ Password Changed Successfully</h2>
    <p>Hello <strong>${name}</strong>,</p>
    <p>Your password has been changed. If you did not do this, contact your administrator immediately.</p>
    <a href="${process.env.CLIENT_URL}/login" class="btn">Login Now →</a>
  `;
  return transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: `Password Changed - ClassScheduler`,
    html: htmlWrapper(content),
  });
};

// 7. Cover assignment notification
const sendCoverAssignedEmail = async ({ coverFaculty, absentFaculty, subject, date, period, day, suggestedByCoverPercent }) => {
  const content = `
    <h2>📋 Cover Class Assignment</h2>
    <p>Hello <strong>${coverFaculty.name}</strong>,</p>
    <p>You have been assigned to cover a class due to the absence of <strong>${absentFaculty.name}</strong>.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Date:</span><span class="info-value">${new Date(date).toDateString()}</span></div>
      <div class="info-row"><span class="info-label">Day:</span><span class="info-value">${day}</span></div>
      <div class="info-row"><span class="info-label">Period:</span><span class="info-value">${period}</span></div>
      <div class="info-row"><span class="info-label">Subject:</span><span class="info-value">${subject.name} (${subject.code})</span></div>
      <div class="info-row"><span class="info-label">Absent Faculty:</span><span class="info-value">${absentFaculty.name}</span></div>
      ${suggestedByCoverPercent !== undefined ? `<div class="info-row"><span class="info-label">Why You:</span><span class="info-value">Your subject is at <strong>${suggestedByCoverPercent}%</strong> completion — assigned to help you catch up</span></div>` : ''}
    </div>
    <p>Please confirm with administration.</p>
  `;
  return transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
    to: coverFaculty.email,
    subject: `Cover Assignment: ${subject.name} on ${day}`,
    html: htmlWrapper(content),
  });
};

module.exports = {
  sendWelcomeEmail,
  sendTimetableAssignedEmail,
  sendSubjectAssignedEmail,
  sendAccountStatusEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendCoverAssignedEmail,
};
