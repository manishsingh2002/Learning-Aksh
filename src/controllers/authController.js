'use strict';

// controllers/authController.js
// ============================================================
// AUTH — Register, Login, Logout, OTP, Password Reset, Refresh
// ============================================================

const crypto     = require('crypto');
const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const {
  sendTokenResponse, verifyRefreshToken,
  signAccessToken, clearRefreshCookie,
  generateOTP, generateSecureToken, hashToken
} = require('../utils/token');
const email    = require('../utils/email');
const sms      = require('../utils/sms');
const logger   = require('../utils/logger');
const {
  User, StudentProfile, InstructorProfile
} = require('../models');

// ── REGISTER ─────────────────────────────────────────────────
exports.register = catchAsync(async (req, res, next) => {
  const { firstName, lastName, email: userEmail, password, confirmPassword, phoneNumber, role } = req.body;

  // Only allow student/instructor self-registration (admin created by seeder)
  const allowedRoles = ['student', 'instructor'];
  const assignedRole = allowedRoles.includes(role) ? role : 'student';

  // Check duplicate email
  const existing = await User.findOne({ email: userEmail }).lean();
  if (existing) {
    return next(new AppError('An account with this email already exists.', 409, 'EMAIL_EXISTS'));
  }

  // Create user
  const user = await User.create({
    firstName, lastName,
    email: userEmail,
    password, confirmPassword,
    phoneNumber,
    role: assignedRole
  });

  // Create matching profile
  if (assignedRole === 'student') {
    await StudentProfile.create({ user: user._id });
  } else if (assignedRole === 'instructor') {
    await InstructorProfile.create({ user: user._id });
  }

  // Generate email verification token
  const verifyToken   = generateSecureToken();
  const hashedToken   = hashToken(verifyToken);
  const verifyUrl     = `${process.env.FRONTEND_URL}/verify-email/${verifyToken}`;

  // Store token on user (add these fields if not in schema — or use a simple expiry)
  await User.findByIdAndUpdate(user._id, {
    passwordResetToken:   hashedToken,
    passwordResetExpires: Date.now() + 24 * 60 * 60 * 1000  // 24h
  });

  // Send welcome + verification email (non-blocking)
  email.sendEmailVerification(user, verifyUrl).catch(err =>
    logger.warn('Verification email failed', { userId: user._id, error: err.message })
  );

  logger.info('User registered', { userId: user._id, role: assignedRole });
  sendTokenResponse(user, 201, res, 'Registration successful! Please verify your email.');
});

// ── VERIFY EMAIL ─────────────────────────────────────────────
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const hashedToken = hashToken(req.params.token);

  const user = await User.findOne({
    passwordResetToken:   hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });

  if (!user) {
    return next(new AppError('Email verification link is invalid or has expired.', 400, 'INVALID_VERIFY_TOKEN'));
  }

  await User.findByIdAndUpdate(user._id, {
    isEmailVerified:     true,
    passwordResetToken:  undefined,
    passwordResetExpires: undefined
  });

  res.status(200).json({ status: 'success', message: 'Email verified successfully. You can now log in.' });
});

// ── LOGIN ─────────────────────────────────────────────────────
exports.login = catchAsync(async (req, res, next) => {
  const { email: userEmail, password } = req.body;

  // Select password (it's select:false on schema)
  const user = await User.findOne({ email: userEmail }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password.', 401, 'INVALID_CREDENTIALS'));
  }

  if (!user.isActive || user.isDeleted) {
    return next(new AppError('Your account has been deactivated. Contact support.', 401, 'ACCOUNT_INACTIVE'));
  }

  // Update last login
  await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

  logger.info('User logged in', { userId: user._id, role: user.role });
  sendTokenResponse(user, 200, res, 'Logged in successfully.');
});

// ── LOGOUT ───────────────────────────────────────────────────
exports.logout = (req, res) => {
  clearRefreshCookie(res);
  res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
};

// ── REFRESH ACCESS TOKEN ──────────────────────────────────────
exports.refreshToken = catchAsync(async (req, res, next) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!token) {
    return next(new AppError('Refresh token missing. Please log in again.', 401, 'NO_REFRESH_TOKEN'));
  }

  const decoded = verifyRefreshToken(token);  // throws if invalid/expired

  const user = await User.findById(decoded.id).lean();
  if (!user || !user.isActive || user.isDeleted) {
    return next(new AppError('User not found or inactive.', 401, 'USER_NOT_FOUND'));
  }

  const accessToken = signAccessToken({ id: user._id, role: user.role });

  res.status(200).json({
    status:      'success',
    accessToken,
    expiresIn:   process.env.JWT_ACCESS_EXPIRES_IN || '1h'
  });
});

// ── SEND OTP ─────────────────────────────────────────────────
exports.sendOTP = catchAsync(async (req, res, next) => {
  const { email: userEmail, phone, type = 'email' } = req.body;

  let user;
  if (type === 'email') {
    user = await User.findOne({ email: userEmail });
  } else {
    user = await User.findOne({ phoneNumber: phone });
  }

  if (!user) {
    // Don't reveal if user exists — return success anyway
    return res.status(200).json({ status: 'success', message: 'OTP sent if account exists.' });
  }

  const otp       = generateOTP();
  const expiresAt = Date.now() + 10 * 60 * 1000;  // 10 minutes

  // Store hashed OTP on user document
  await User.findByIdAndUpdate(user._id, {
    passwordResetToken:   hashToken(otp),
    passwordResetExpires: expiresAt
  });

  if (type === 'email') {
    await email.sendOTP(user, otp);
  } else if (user.phoneNumber) {
    await sms.sendOTPMessage(user.phoneNumber, otp, user.firstName);
  }

  logger.info('OTP sent', { userId: user._id, type });
  res.status(200).json({ status: 'success', message: 'OTP sent successfully.' });
});

// ── VERIFY OTP ────────────────────────────────────────────────
exports.verifyOTP = catchAsync(async (req, res, next) => {
  const { email: userEmail, otp } = req.body;

  const user = await User.findOne({ email: userEmail });
  if (!user) return next(new AppError('User not found.', 404));

  const hashedOTP = hashToken(otp);
  if (
    user.passwordResetToken   !== hashedOTP ||
    user.passwordResetExpires  <  Date.now()
  ) {
    return next(new AppError('OTP is invalid or has expired.', 400, 'INVALID_OTP'));
  }

  // Clear OTP fields
  await User.findByIdAndUpdate(user._id, {
    passwordResetToken:   undefined,
    passwordResetExpires: undefined
  });

  res.status(200).json({ status: 'success', message: 'OTP verified successfully.' });
});

// ── FORGOT PASSWORD ───────────────────────────────────────────
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });

  // Don't reveal if user exists
  if (!user) {
    return res.status(200).json({ status: 'success', message: 'Reset link sent if account exists.' });
  }

  const resetToken  = user.createPasswordResetToken();  // instance method on model
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  try {
    await email.sendPasswordReset(user, resetUrl);
    res.status(200).json({ status: 'success', message: 'Password reset link sent to your email.' });
  } catch (err) {
    // Roll back token if email fails
    await User.findByIdAndUpdate(user._id, {
      passwordResetToken:   undefined,
      passwordResetExpires: undefined
    });
    logger.error('Password reset email failed', { userId: user._id, error: err.message });
    return next(new AppError('Failed to send reset email. Try again later.', 500));
  }
});

// ── RESET PASSWORD ────────────────────────────────────────────
exports.resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken:   hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });

  if (!user) {
    return next(new AppError('Password reset link is invalid or has expired.', 400, 'INVALID_RESET_TOKEN'));
  }

  user.password        = req.body.password;
  user.confirmPassword = req.body.confirmPassword;
  user.passwordResetToken   = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  logger.info('Password reset successful', { userId: user._id });
  sendTokenResponse(user, 200, res, 'Password reset successfully.');
});

// ── CHANGE PASSWORD (authenticated) ──────────────────────────
exports.changePassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.correctPassword(req.body.currentPassword, user.password))) {
    return next(new AppError('Current password is incorrect.', 401, 'WRONG_PASSWORD'));
  }

  user.password        = req.body.newPassword;
  user.confirmPassword = req.body.confirmPassword;
  await user.save();

  clearRefreshCookie(res);
  sendTokenResponse(user, 200, res, 'Password changed successfully. Please log in again.');
});

// ── GET ME ────────────────────────────────────────────────────
exports.getMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).lean();
  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', data: user });
});