'use strict';

// middleware/bodyParser.js
// ============================================================
// BODY PARSER
//
// Three types handled:
//   1. Raw (Razorpay webhook) — MUST be first and path-specific
//      Razorpay sends raw body for signature verification.
//      If parsed as JSON first, signature check fails.
//
//   2. JSON  — standard API requests (10kb limit)
//
//   3. URL-encoded — form submissions (10kb limit)
//
// IMPORTANT: Order matters. Raw must come before JSON.
// ============================================================

const express      = require('express');
const cookieParser = require('cookie-parser');

// ── WEBHOOK PATHS THAT NEED RAW BODY ─────────────────────────
const RAW_BODY_PATHS = [
  '/api/v1/payments/webhook/razorpay'
];

// ── BODY LIMIT ────────────────────────────────────────────────
// 10kb for JSON — enough for any legitimate API payload.
// Larger files go through multer/Cloudinary directly.
const BODY_LIMIT = '10kb';

const applyBodyParsers = (app) => {
  // 1. Raw body for webhook routes — must be BEFORE json parser
  app.use((req, res, next) => {
    if (RAW_BODY_PATHS.some(path => req.path.startsWith(path))) {
      express.raw({ type: 'application/json' })(req, res, next);
    } else {
      next();
    }
  });

  // 2. JSON body parser
  app.use(express.json({
    limit:  BODY_LIMIT,
    strict: true    // reject non-object/array JSON root
  }));

  // 3. URL-encoded body (form posts)
  app.use(express.urlencoded({
    extended: true,
    limit:    BODY_LIMIT
  }));

  // 4. Cookie parser (reads httpOnly refresh token)
  app.use(cookieParser(process.env.COOKIE_SECRET));
};

module.exports = applyBodyParsers;