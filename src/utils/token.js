'use strict';

// utils/token.js
// ============================================================
// JWT TOKENS — Issue, Verify, Refresh
// Access token  : short-lived (15m–1h), sent in Authorization header
// Refresh token : long-lived (7–30d), stored in httpOnly cookie
// Email token   : signed short-lived token for OTP / verification
// ============================================================
// npm install jsonwebtoken

const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const AppError = require('./appError');

// ── CONFIG ───────────────────────────────────────────────────
const {
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN  = '1h',
  JWT_REFRESH_EXPIRES_IN = '30d',
  NODE_ENV
} = process.env;

// ── SIGN ─────────────────────────────────────────────────────

/**
 * Issue an access token (short-lived)
 * @param {object} payload  - { id, role }
 */
const signAccessToken = (payload) => {
  if (!JWT_ACCESS_SECRET) throw new Error('JWT_ACCESS_SECRET not set');
  return jwt.sign(payload, JWT_ACCESS_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
    issuer:    process.env.APP_NAME || 'exam-prep',
    audience:  'api'
  });
};

/**
 * Issue a refresh token (long-lived)
 * @param {object} payload  - { id }
 */
const signRefreshToken = (payload) => {
  if (!JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET not set');
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer:    process.env.APP_NAME || 'exam-prep',
    audience:  'refresh'
  });
};

// ── VERIFY ───────────────────────────────────────────────────

/**
 * Verify an access token
 * @returns {object} decoded payload
 * @throws  AppError on invalid/expired
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET, {
      issuer:   process.env.APP_NAME || 'exam-prep',
      audience: 'api'
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Your session has expired. Please log in again.', 401, 'TOKEN_EXPIRED');
    }
    throw new AppError('Invalid token. Please log in again.', 401, 'INVALID_TOKEN');
  }
};

/**
 * Verify a refresh token
 * @returns {object} decoded payload
 * @throws  AppError on invalid/expired
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer:   process.env.APP_NAME || 'exam-prep',
      audience: 'refresh'
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Refresh token expired. Please log in again.', 401, 'REFRESH_EXPIRED');
    }
    throw new AppError('Invalid refresh token.', 401, 'INVALID_REFRESH');
  }
};

// ── COOKIE ───────────────────────────────────────────────────

/**
 * Set refresh token as httpOnly cookie
 */
const setRefreshCookie = (res, token) => {
  const MS_PER_DAY    = 24 * 60 * 60 * 1000;
  const days          = parseInt(JWT_REFRESH_EXPIRES_IN) || 30;
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure:   NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   days * MS_PER_DAY,
    path:     '/api/v1/auth'     // limit cookie to auth routes only
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
};

// ── FULL AUTH RESPONSE ───────────────────────────────────────

/**
 * Issue both tokens, set cookie, send JSON response
 * @param {object} user   - Mongoose user document
 * @param {number} statusCode
 * @param {object} res    - Express response
 * @param {string} [message]
 */
const sendTokenResponse = (user, statusCode, res, message = 'success') => {
  const accessToken  = signAccessToken({ id: user._id, role: user.role });
  const refreshToken = signRefreshToken({ id: user._id });

  setRefreshCookie(res, refreshToken);

  // Never send password in response
  user.password        = undefined;
  user.confirmPassword = undefined;

  res.status(statusCode).json({
    status:      'success',
    message,
    accessToken,
    expiresIn:   JWT_ACCESS_EXPIRES_IN,
    data: { user }
  });
};

// ── SECURE RANDOM TOKENS ─────────────────────────────────────

/**
 * Generate a cryptographically secure OTP (6 digits)
 */
const generateOTP = () => {
  const bytes = crypto.randomBytes(3);          // 3 bytes = 0–16777215
  return String(bytes.readUIntBE(0, 3) % 1000000).padStart(6, '0');
};

/**
 * Generate a random hex token (for email verification / password reset)
 * @param {number} bytes - default 32
 */
const generateSecureToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

/**
 * Hash a raw token before storing in DB
 */
const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// ── EXPORTS ──────────────────────────────────────────────────
module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  sendTokenResponse,
  generateOTP,
  generateSecureToken,
  hashToken
};