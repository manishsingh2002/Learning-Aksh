'use strict';

// middleware/auditLog.js
// ============================================================
// AUDIT LOG — Non-blocking activity recorder
//
// Records every mutating request (POST/PATCH/PUT/DELETE) to
// the AuditLog collection for compliance and admin review.
//
// Design decisions:
//   - Non-blocking: fire-and-forget (never slows response)
//   - Captures AFTER response: records actual status code
//   - Redacts sensitive fields: passwords, tokens, OTPs
//   - Truncates large bodies: prevents DB bloat
// ============================================================

const logger = require('../utils/logger');

const REDACTED_FIELDS = new Set([
  'password', 'confirmPassword', 'currentPassword',
  'newPassword', 'token', 'otp', 'pin',
  'cardNumber', 'cvv', 'secretKey', 'apiKey',
  'passwordResetToken', 'streamKey'
]);

const SKIP_PATHS = ['/health', '/favicon', '/dropdowns', '/webhook'];

const redactBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  const safe = { ...body };
  REDACTED_FIELDS.forEach(field => { if (field in safe) safe[field] = '[REDACTED]'; });
  for (const key of Object.keys(safe)) {
    if (typeof safe[key] === 'string' && safe[key].length > 500) {
      safe[key] = safe[key].slice(0, 500) + '…[truncated]';
    }
  }
  return safe;
};

const auditLog = (req, res, next) => {
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const shouldSkip = SKIP_PATHS.some(p => req.path.includes(p));
  if (!isMutating || shouldSkip) return next();

  const startedAt = Date.now();
  const originalJson = res.json.bind(res);

  res.json = function intercept(responseBody) {
    const result = originalJson(responseBody);
    const duration = Date.now() - startedAt;

    setImmediate(async () => {
      try {
        const { AuditLog } = require('../models');
        await AuditLog.create({
          user:          req.user?._id || null,
          action:        `${req.method}:${req.route?.path || req.path}`,
          resource:      req.baseUrl?.split('/').filter(Boolean).pop() || 'unknown',
          resourceId:    req.params?.id || null,
          method:        req.method,
          statusCode:    res.statusCode,
          ip:            req.ip || req.connection?.remoteAddress,
          userAgent:     req.headers['user-agent'],
          requestParams: req.params,
          requestQuery:  req.query,
          requestBody:   redactBody(req.body),
          duration,
          timestamp:     new Date()
        });
      } catch (err) {
        logger.warn('Audit log write failed', { error: err.message, path: req.path });
      }
    });

    return result;
  };

  next();
};

module.exports = auditLog;