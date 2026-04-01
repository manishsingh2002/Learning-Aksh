'use strict';

// middleware/httpLogger.js
// ============================================================
// HTTP REQUEST LOGGER — Morgan + Winston
//
// Development : colorized one-liner per request
// Production  : structured JSON logs, skips health checks,
//               masks sensitive headers
// ============================================================
// npm install morgan

const morgan = require('morgan');
const logger = require('../utils/logger');

// ── SKIP RULES ────────────────────────────────────────────────
// Don't log health checks or static assets — too noisy
const skipConditions = (req, res) => {
  const skipPaths = ['/health', '/favicon.ico'];
  return skipPaths.includes(req.path);
};

// ── CUSTOM TOKENS ─────────────────────────────────────────────
// Add request ID and user ID to log output
morgan.token('id',      (req) => req.id || '-');
morgan.token('userId',  (req) => req.user?._id?.toString() || 'anon');
morgan.token('body',    (req) => {
  // Only log body in dev, and never log passwords
  if (process.env.NODE_ENV !== 'development') return '';
  if (!req.body || typeof req.body !== 'object') return '';
  const safe = { ...req.body };
  ['password', 'confirmPassword', 'currentPassword', 'newPassword', 'token', 'otp'].forEach(k => {
    if (safe[k]) safe[k] = '***';
  });
  const str = JSON.stringify(safe);
  return str.length > 200 ? str.slice(0, 200) + '…' : str;
});

// ── DEV FORMAT ────────────────────────────────────────────────
// :method :url :status :response-time ms — :userId [:id]
const devFormat = ':method \x1b[36m:url\x1b[0m :status :response-time ms — user::userId [req::id]';

// ── PROD FORMAT — JSON ────────────────────────────────────────
const prodFormat = JSON.stringify({
  time:         ':date[iso]',
  requestId:    ':id',
  method:       ':method',
  url:          ':url',
  status:       ':status',
  responseTime: ':response-time',
  userId:       ':userId',
  ip:           ':remote-addr',
  userAgent:    ':user-agent',
  referrer:     ':referrer'
});

// ── BUILD & EXPORT ────────────────────────────────────────────
const buildHttpLogger = () => {
  const isDev = process.env.NODE_ENV === 'development';

  return morgan(
    isDev ? devFormat : prodFormat,
    {
      stream: logger.stream,
      skip:   skipConditions
    }
  );
};

module.exports = buildHttpLogger;