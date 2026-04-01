'use strict';

// utils/catchAsync.js
// ============================================================
// ASYNC ERROR WRAPPER
// Eliminates try/catch boilerplate from every controller.
// Any thrown error or rejected promise is forwarded to
// Express's next(err) → global error handler.
// ============================================================

/**
 * Wraps an async Express handler so errors auto-forward to next()
 * @param {Function} fn - async (req, res, next) => {}
 * @returns {Function}  - Express middleware
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = catchAsync;