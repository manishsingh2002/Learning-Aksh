'use strict';

// middleware/sanitize.js
// ============================================================
// INPUT SANITIZATION
//
// Layers:
//   1. mongoSanitize  → strips $ and . from req.body/query/params
//                       preventing NoSQL injection: {"$gt":""}
//   2. xss-clean      → strips <script> tags from req.body
//   3. Custom deep    → recursively strips dangerous keys from
//                       nested objects (belt-and-suspenders)
//   4. Body size      → enforced in body parser (see bodyParser.js)
// ============================================================
// npm install express-mongo-sanitize xss-clean

const mongoSanitize = require('express-mongo-sanitize');
const xss           = require('xss-clean');

// ── CUSTOM DEEP SANITIZER ─────────────────────────────────────
// Strips keys starting with $ and . recursively.
// Runs after mongoSanitize as a last-resort safety net.
const UNSAFE_KEY = /^\$|\./;

const deepSanitizeObj = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(deepSanitizeObj);

  const clean = {};
  for (const key of Object.keys(obj)) {
    if (UNSAFE_KEY.test(key)) continue;   // drop dangerous key
    clean[key] = deepSanitizeObj(obj[key]);
  }
  return clean;
};

const deepSanitize = (req, res, next) => {
  if (req.body   && typeof req.body   === 'object') req.body   = deepSanitizeObj(req.body);
  if (req.query  && typeof req.query  === 'object') req.query  = deepSanitizeObj(req.query);
  if (req.params && typeof req.params === 'object') req.params = deepSanitizeObj(req.params);
  next();
};

// ── EXPORT: Array of middleware, spread into app.use() ────────
const sanitizeMiddleware = [
  // 1. NoSQL injection prevention
  mongoSanitize({
    replaceWith:    '_',   // replace $ with _ instead of deleting (preserves structure)
    onSanitize:     ({ req, key }) => {
      const logger = require('../utils/logger');
      logger.warn('NoSQL injection attempt', { ip: req.ip, key, path: req.path });
    }
  }),

  // 2. XSS — strip HTML from strings in body
  xss(),

  // 3. Belt-and-suspenders deep clean
  deepSanitize
];

module.exports = sanitizeMiddleware;