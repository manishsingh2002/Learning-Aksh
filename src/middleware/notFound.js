'use strict';

// middleware/notFound.js
// ============================================================
// 404 NOT FOUND HANDLER
//
// Catches any request that didn't match a registered route.
// Must be placed AFTER all routes in app.js.
// ============================================================

const AppError = require('../utils/appError');

const notFound = (req, res, next) => {
  next(new AppError(
    `Cannot ${req.method} ${req.originalUrl}`,
    404,
    'ROUTE_NOT_FOUND'
  ));
};

module.exports = notFound;