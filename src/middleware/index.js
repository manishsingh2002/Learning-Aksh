'use strict';

// middleware/index.js
// ============================================================
// MIDDLEWARE INDEX — Single import point
//
// Usage in app.js:
//   const {
//     applySecurity, applyBodyParsers,
//     sanitizeMiddleware, buildHttpLogger,
//     requestId, responseEnhancer, auditLog,
//     activityTracker, notFound
//   } = require('./middleware');
// ============================================================

module.exports = {
  applySecurity:      require('./security'),
  applyBodyParsers:   require('./bodyParser'),
  sanitizeMiddleware: require('./sanitize'),
  buildHttpLogger:    require('./httpLogger'),
  requestId:          require('./requestId'),
  responseEnhancer:   require('./responseEnhancer'),
  auditLog:           require('./auditLog'),
  activityTracker:    require('./activityTracker'),
  notFound:           require('./notFound')
};