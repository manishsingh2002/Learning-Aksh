'use strict';

// middleware/security.js
// ============================================================
// SECURITY MIDDLEWARE BUNDLE
// Configures every HTTP security header and protection layer.
//
// Includes:
//   helmet        → 15+ security headers
//   hpp           → HTTP parameter pollution protection
//   CORS          → Cross-origin resource sharing
//   Trust proxy   → For apps behind nginx/load balancer
// ============================================================
// npm install helmet hpp cors

const helmet = require('helmet');
const hpp    = require('hpp');
const cors   = require('cors');

// ── CORS ─────────────────────────────────────────────────────
const buildCorsOptions = () => {
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  return {
    origin: (origin, callback) => {
      // Allow: no origin (native apps, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS policy: origin "${origin}" not permitted.`));
    },
    credentials:    true,
    methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Razorpay-Signature',
      'Cache-Control'
    ],
    exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining'],
    maxAge:         86400   // preflight cache: 24 hours
  };
};

// ── HELMET CONFIG ─────────────────────────────────────────────
// Carefully tuned — not just helmet() defaults.
const buildHelmetOptions = () => ({
  // Allow video iframes from YouTube / Cloudinary
  crossOriginEmbedderPolicy: false,

  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", 'cdn.razorpay.com'],
      styleSrc:       ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc:        ["'self'", 'fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:', 'blob:', '*.cloudinary.com', '*.amazonaws.com'],
      mediaSrc:       ["'self'", '*.cloudinary.com', '*.bunnycdn.com', '*.youtube.com'],
      frameSrc:       ["'self'", '*.youtube.com', '*.youtube-nocookie.com'],
      connectSrc:     ["'self'", 'api.razorpay.com', '*.sentry.io'],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },

  // HSTS — only in production (so local dev works on http)
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,

  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xDnsPrefetchControl: { allow: false },
  xFrameOptions: { action: 'DENY' }
});

// ── HPP — HTTP Parameter Pollution ───────────────────────────
// Prevents ?sort=price&sort=rating attacks.
// Whitelist fields that are legitimately array-able.
const buildHppOptions = () => ({
  whitelist: [
    'sort', 'fields', 'ids', 'tags',
    'examGoals', 'categories', 'roles'
  ]
});

// ── EXPORT: call applySecurity(app) in app.js ────────────────
const applySecurity = (app) => {
  // Trust proxy (nginx / AWS ALB / Heroku)
  // Required for correct req.ip and rate limiting behind reverse proxy
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // CORS — must be before helmet so OPTIONS gets through
  app.use(cors(buildCorsOptions()));
  app.options('*', cors(buildCorsOptions()));

  // Helmet security headers
  app.use(helmet(buildHelmetOptions()));

  // HTTP Parameter Pollution
  app.use(hpp(buildHppOptions()));
};

module.exports = applySecurity;x    