'use strict';

// app.js
// ============================================================
// EXPRESS APPLICATION
//
// Middleware pipeline order (matters — do not rearrange):
//
//  [1]  Trust Proxy        → correct IP behind nginx / ALB
//  [2]  Request ID         → UUID per request for tracing
//  [3]  Response Enhancer  → helpers on res object
//  [4]  HTTP Logger        → Morgan to Winston stream
//  [5]  Security           → CORS + Helmet + HPP
//  [6]  Webhook Raw Body   → BEFORE json parser (Razorpay sig)
//  [7]  Body Parsers       → JSON + URLencoded + Cookies
//  [8]  Sanitization       → NoSQL injection + XSS
//  [9]  Compression        → gzip/brotli
//  [10] Rate Limiting      → per-IP global limit
//  [11] Audit Log          → fire-and-forget DB write
//  [12] Activity Tracker   → streak + analytics (auth routes)
//  [13] Routes             → all API endpoints
//  [14] 404 Handler        → catches unmatched routes
//  [15] Error Handler      → global error response
// ============================================================

const express     = require('express');
const compression = require('compression');

// ── MIDDLEWARE ────────────────────────────────────────────────
const {
  applySecurity,
  applyBodyParsers,
  sanitizeMiddleware,
  buildHttpLogger,
  requestId,
  responseEnhancer,
  auditLog,
  activityTracker,
  notFound
} = require('./middleware');

// ── UTILS ─────────────────────────────────────────────────────
const errorController        = require('./utils/errorController');
const { generalLimiter }     = require('./utils/rateLimiter');

// ── ROUTES ────────────────────────────────────────────────────
const authRoutes      = require('./routes/authRoutes');
const userRoutes      = require('./routes/userRoutes');
const dropdownRoutes  = require('./routes/dropdownRoutes');
const adminRoutes     = require('./routes/adminRoutes');
const paymentRoutes   = require('./routes/paymentRoutes');
const batchRoutes     = require('./routes/batchRoutes');
const courseRoutes    = require('./routes/courseRoutes');
const liveClassRoutes = require('./routes/liveClassRoutes');
const progressRoutes  = require('./routes/progressRoutes');

// Named exports from route files that export multiple routers
const examGoalRoutes                    = require('./routes/examGoalRoutes');
const { categoryRouter }                = require('./routes/examGoalRoutes');
const mockTestRoutes                    = require('./routes/mockTestRoutes');
const { testSeriesRouter,
        dailyPracticeRouter }           = require('./routes/mockTestRoutes');
const { reviewRouter, discussionRouter,
        postRouter, notificationRouter } = require('./routes/progressRoutes');

// ── CREATE APP ────────────────────────────────────────────────
const app = express();

// ── [1] TRUST PROXY ───────────────────────────────────────────
// Required for correct req.ip and rate limiting behind
// nginx / AWS ALB / Heroku / Render / Railway
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ── [2] REQUEST ID ────────────────────────────────────────────
app.use(requestId);

// ── [3] RESPONSE ENHANCER ────────────────────────────────────
app.use(responseEnhancer);

// ── [4] HTTP LOGGER ──────────────────────────────────────────
app.use(buildHttpLogger());

// ── [5] SECURITY (CORS + Helmet + HPP) ───────────────────────
applySecurity(app);

// ── [6] WEBHOOK RAW BODY (before JSON parser) ─────────────────
// Razorpay sends raw body — must be captured before express.json()
// parses it, otherwise signature verification will always fail.
app.use(
  '/api/v1/payments/webhook/razorpay',
  express.raw({ type: 'application/json' })
);

// ── [7] BODY PARSERS ──────────────────────────────────────────
applyBodyParsers(app);

// ── [8] SANITIZATION ─────────────────────────────────────────
app.use(sanitizeMiddleware);

// ── [9] COMPRESSION ──────────────────────────────────────────
app.use(compression({
  level: 6,          // 1-9 (6 = good balance of speed vs size)
  threshold: 1024,   // only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress already-compressed streams (video/audio)
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// ── [10] GLOBAL RATE LIMIT ────────────────────────────────────
app.use('/api', generalLimiter);

// ── [11] AUDIT LOG ────────────────────────────────────────────
app.use('/api/v1', auditLog);

// ── [12] ACTIVITY TRACKER ─────────────────────────────────────
app.use('/api/v1', activityTracker);

// ──────────────────────────────────────────────────────────────
// [13] ROUTES
// ──────────────────────────────────────────────────────────────

const API = '/api/v1';

// ── Health check (before rate limiter scope) ─────────────────
app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbState  = ['disconnected', 'connected', 'connecting', 'disconnecting'];

  res.status(200).json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV,
    version:   process.env.npm_package_version || '1.0.0',
    uptime:    `${Math.floor(process.uptime())}s`,
    services: {
      database: dbState[mongoose.connection.readyState] || 'unknown',
      memory:   `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    }
  });
});

// ── API info ──────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.status(200).json({
    status:  'ok',
    name:    process.env.APP_NAME || 'ExamPrep API',
    version: process.env.API_VERSION || 'v1',
    base:    `${req.protocol}://${req.get('host')}/api/v1`
  });
});

// ── Core public routes ────────────────────────────────────────
app.use(`${API}/auth`,           authRoutes);
app.use(`${API}/dropdowns`,      dropdownRoutes);
app.use(`${API}/exam-goals`,     examGoalRoutes);
app.use(`${API}/categories`,     categoryRouter);

// ── User routes ───────────────────────────────────────────────
app.use(`${API}/users`,          userRoutes);

// ── Learning products ─────────────────────────────────────────
app.use(`${API}/batches`,        batchRoutes);
app.use(`${API}/courses`,        courseRoutes);
app.use(`${API}/live-classes`,   liveClassRoutes);

// ── Test & assessment ─────────────────────────────────────────
app.use(`${API}/mock-tests`,     mockTestRoutes);
app.use(`${API}/test-series`,    testSeriesRouter);
app.use(`${API}/daily-practice`, dailyPracticeRouter);

// ── Payments & enrollments ────────────────────────────────────
app.use(`${API}/payments`,       paymentRoutes);

// ── Progress, analytics, notes, certificates ─────────────────
app.use(`${API}/progress`,       progressRoutes);

// ── Community ─────────────────────────────────────────────────
app.use(`${API}/reviews`,        reviewRouter);
app.use(`${API}/discussions`,    discussionRouter);

// ── Content (blog / current affairs) ─────────────────────────
app.use(`${API}/posts`,          postRouter);

// ── Notifications & announcements ────────────────────────────
app.use(`${API}/notifications`,  notificationRouter);

// ── Admin panel ───────────────────────────────────────────────
app.use(`${API}/admin`,          adminRoutes);

// ── [14] 404 — must be after all routes ──────────────────────
app.use(notFound);

// ── [15] GLOBAL ERROR HANDLER — must be last ─────────────────
app.use(errorController);

module.exports = app;