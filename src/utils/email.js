'use strict';

// utils/email.js
// ============================================================
// EMAIL — Nodemailer + HTML templates
// Supports: SMTP (dev), SendGrid, AWS SES (prod)
// ============================================================
// npm install nodemailer @sendgrid/mail

const nodemailer = require('nodemailer');
const logger     = require('./logger');

// ── TRANSPORTER FACTORY ──────────────────────────────────────
const createTransporter = () => {
  // Production: SendGrid
  if (process.env.NODE_ENV === 'production' && process.env.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
  }

  // Development: Mailtrap or local SMTP
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'sandbox.smtp.mailtrap.io',
    port:   process.env.SMTP_PORT   || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// ── BASE HTML TEMPLATE ───────────────────────────────────────
const baseTemplate = ({ title, preheader, body, ctaText, ctaUrl, footerText }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader || ''}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr>
          <td style="background:#1a56db;padding:24px 32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">
              ${process.env.APP_NAME || 'ExamPrep'}
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h2 style="color:#111827;font-size:20px;margin:0 0 16px;">${title}</h2>
            ${body}
          </td>
        </tr>

        <!-- CTA -->
        ${ctaText && ctaUrl ? `
        <tr>
          <td style="padding:0 32px 32px;text-align:center;">
            <a href="${ctaUrl}" style="display:inline-block;background:#1a56db;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
              ${ctaText}
            </a>
          </td>
        </tr>` : ''}

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="color:#6b7280;font-size:12px;margin:0;">
              ${footerText || `© ${new Date().getFullYear()} ${process.env.APP_NAME || 'ExamPrep'}. All rights reserved.`}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── EMAIL SENDER ─────────────────────────────────────────────
class EmailService {
  constructor() {
    this.transporter = createTransporter();
    this.from = `${process.env.APP_NAME || 'ExamPrep'} <${process.env.EMAIL_FROM || 'noreply@examprep.in'}>`;
  }

  async send({ to, subject, html, text }) {
    try {
      const info = await this.transporter.sendMail({
        from:    this.from,
        to,
        subject,
        html,
        text:    text || subject
      });
      logger.info('Email sent', { to, subject, messageId: info.messageId });
      return info;
    } catch (err) {
      logger.error('Email send failed', { to, subject, error: err.message });
      throw err;
    }
  }

  // ── TEMPLATES ──────────────────────────────────────────────

  async sendWelcome(user) {
    const html = baseTemplate({
      title:    `Welcome, ${user.firstName}! 🎉`,
      preheader: 'Your exam prep journey starts now.',
      body: `
        <p style="color:#374151;line-height:1.6;">
          Hi ${user.firstName}, welcome to <strong>${process.env.APP_NAME || 'ExamPrep'}</strong>!
          We're excited to help you crack your dream exam.
        </p>
        <p style="color:#374151;line-height:1.6;">
          Start by exploring batches for your target exam, or take a free mock test to assess your current level.
        </p>`,
      ctaText:  'Explore Batches',
      ctaUrl:   `${process.env.FRONTEND_URL}/explore`
    });
    return this.send({ to: user.email, subject: `Welcome to ${process.env.APP_NAME}!`, html });
  }

  async sendEmailVerification(user, verificationUrl) {
    const html = baseTemplate({
      title:    'Verify Your Email',
      preheader: 'Confirm your email to activate your account.',
      body: `
        <p style="color:#374151;line-height:1.6;">Hi ${user.firstName},</p>
        <p style="color:#374151;line-height:1.6;">
          Click the button below to verify your email address.
          This link expires in <strong>24 hours</strong>.
        </p>`,
      ctaText:  'Verify Email',
      ctaUrl:   verificationUrl
    });
    return this.send({ to: user.email, subject: 'Verify your email address', html });
  }

  async sendOTP(user, otp) {
    const html = baseTemplate({
      title:    'Your OTP Code',
      preheader: `${otp} is your verification code.`,
      body: `
        <p style="color:#374151;line-height:1.6;">Hi ${user.firstName},</p>
        <p style="color:#374151;line-height:1.6;">Your one-time password is:</p>
        <div style="text-align:center;margin:24px 0;">
          <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#1a56db;">
            ${otp}
          </span>
        </div>
        <p style="color:#6b7280;font-size:14px;">This OTP expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>`
    });
    return this.send({ to: user.email, subject: `${otp} — Your OTP Code`, html });
  }

  async sendPasswordReset(user, resetUrl) {
    const html = baseTemplate({
      title:    'Reset Your Password',
      preheader: 'We received a password reset request.',
      body: `
        <p style="color:#374151;line-height:1.6;">Hi ${user.firstName},</p>
        <p style="color:#374151;line-height:1.6;">
          We received a request to reset your password. Click the button below.
          This link expires in <strong>10 minutes</strong>.
        </p>
        <p style="color:#6b7280;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>`,
      ctaText:  'Reset Password',
      ctaUrl:   resetUrl
    });
    return this.send({ to: user.email, subject: 'Password Reset Request', html });
  }

  async sendEnrollmentConfirmation(user, batch, payment) {
    const html = baseTemplate({
      title:    'Enrollment Confirmed ✅',
      preheader: `You're enrolled in ${batch.name}.`,
      body: `
        <p style="color:#374151;line-height:1.6;">Hi ${user.firstName},</p>
        <p style="color:#374151;line-height:1.6;">
          Your enrollment in <strong>${batch.name}</strong> has been confirmed.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Amount Paid</td>
              <td style="padding:8px;font-weight:600;">₹${payment.amount}</td></tr>
          <tr style="background:#f9fafb;">
              <td style="padding:8px;color:#6b7280;font-size:14px;">Transaction ID</td>
              <td style="padding:8px;font-family:monospace;font-size:13px;">${payment.transactionId}</td></tr>
          <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Valid Until</td>
              <td style="padding:8px;font-weight:600;">${batch.endDate ? new Date(batch.endDate).toLocaleDateString('en-IN') : 'Lifetime'}</td></tr>
        </table>`,
      ctaText:  'Go to My Batch',
      ctaUrl:   `${process.env.FRONTEND_URL}/my-batches/${batch._id}`
    });
    return this.send({ to: user.email, subject: `Enrollment Confirmed — ${batch.name}`, html });
  }

  async sendMockTestResult(user, mockTest, attempt) {
    const html = baseTemplate({
      title:    'Your Test Result is Ready 📊',
      preheader: `You scored ${attempt.percentage.toFixed(1)}% in ${mockTest.title}.`,
      body: `
        <p style="color:#374151;line-height:1.6;">Hi ${user.firstName},</p>
        <p style="color:#374151;line-height:1.6;">
          Here's your result for <strong>${mockTest.title}</strong>:
        </p>
        <div style="text-align:center;padding:24px;background:#f0f9ff;border-radius:8px;margin:16px 0;">
          <div style="font-size:48px;font-weight:700;color:${attempt.isPassed ? '#059669' : '#dc2626'};">
            ${attempt.percentage.toFixed(1)}%
          </div>
          <div style="color:#374151;font-size:16px;margin-top:4px;">
            ${attempt.score} / ${mockTest.totalMarks} marks
          </div>
          <div style="color:#6b7280;font-size:14px;margin-top:4px;">
            Rank: ${attempt.rank} out of ${attempt.totalStudents} students
          </div>
        </div>`,
      ctaText:  'View Detailed Analysis',
      ctaUrl:   `${process.env.FRONTEND_URL}/results/${attempt._id}`
    });
    return this.send({ to: user.email, subject: `Result: ${mockTest.title} — ${attempt.percentage.toFixed(1)}%`, html });
  }

  async sendLiveClassReminder(user, liveClass) {
    const timeStr = new Date(liveClass.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const html = baseTemplate({
      title:    `Live Class Starting Soon ⏰`,
      preheader: `${liveClass.title} starts in 30 minutes.`,
      body: `
        <p style="color:#374151;line-height:1.6;">Hi ${user.firstName},</p>
        <p style="color:#374151;line-height:1.6;">
          Your live class is starting soon:
        </p>
        <div style="background:#f0f9ff;padding:16px;border-left:4px solid #1a56db;border-radius:4px;margin:16px 0;">
          <strong style="color:#111827;">${liveClass.title}</strong><br>
          <span style="color:#6b7280;font-size:14px;">${liveClass.subject || ''} • ${timeStr} IST</span>
        </div>`,
      ctaText:  'Join Now',
      ctaUrl:   liveClass.streamUrl || `${process.env.FRONTEND_URL}/live/${liveClass._id}`
    });
    return this.send({ to: user.email, subject: `Live Class Reminder: ${liveClass.title}`, html });
  }

  async sendInstructorInvitation(email, inviterName, course, inviteUrl) {
    const html = baseTemplate({
      title:    `You've been invited to co-instruct`,
      preheader: `${inviterName} invited you to teach ${course.title}.`,
      body: `
        <p style="color:#374151;line-height:1.6;">
          <strong>${inviterName}</strong> has invited you to be a co-instructor on:
        </p>
        <div style="background:#f9fafb;padding:16px;border-radius:6px;margin:16px 0;">
          <strong>${course.title}</strong>
        </div>
        <p style="color:#374151;line-height:1.6;">This invitation expires in 48 hours.</p>`,
      ctaText: 'Accept Invitation',
      ctaUrl:  inviteUrl
    });
    return this.send({ to: email, subject: `Invitation: Co-instruct "${course.title}"`, html });
  }
}

// Export singleton
module.exports = new EmailService();