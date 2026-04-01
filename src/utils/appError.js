'use strict';

// utils/appError.js
// ============================================================
// CUSTOM ERROR CLASS
// All operational errors thrown across the app use this.
// The global error handler (errorController) checks
// err.isOperational to decide whether to send details to client.
// ============================================================

class AppError extends Error {
  /**
   * @param {string} message   - Human-readable error message
   * @param {number} statusCode - HTTP status code (400, 401, 403, 404, 409, 500…)
   * @param {string} [code]    - Optional machine-readable error code for the client
   *                             e.g. 'INVALID_OTP', 'EXPIRED_TOKEN', 'QUOTA_EXCEEDED'
   * @param {object} [meta]    - Optional extra data (field errors, etc.)
   */
  constructor(message, statusCode, code = null, meta = null) {
    super(message);

    this.statusCode    = statusCode;
    this.status        = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;   // marks as a known, handled error
    this.code          = code;
    this.meta          = meta;

    // Capture stack trace (excludes this constructor from it)
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;


// ── USAGE EXAMPLES ──────────────────────────────────────────
//
// Simple:
//   throw new AppError('Course not found', 404);
//
// With machine code (useful for frontend i18n):
//   throw new AppError('OTP has expired', 400, 'EXPIRED_OTP');
//
// With field validation meta:
//   throw new AppError('Validation failed', 422, 'VALIDATION_ERROR', {
//     fields: { email: 'Email already in use', phone: 'Invalid format' }
//   });