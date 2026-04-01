'use strict';

// config/env.js
// ============================================================
// ENVIRONMENT VALIDATION
//
// Validates all required env vars on startup.
// The app exits immediately with a clear error if anything
// critical is missing — no mysterious runtime crashes later.
// ============================================================

const logger = require('../utils/logger');

// ── REQUIRED VARIABLES ────────────────────────────────────────
const REQUIRED = [
  'NODE_ENV',
  'PORT',
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'FRONTEND_URL'
];

// ── RECOMMENDED (warn if missing, don't exit) ─────────────────
const RECOMMENDED = [
  { key: 'REDIS_URL',              hint: 'Cache will be disabled — not suitable for production.' },
  { key: 'CLOUDINARY_CLOUD_NAME',  hint: 'File uploads will fail.' },
  { key: 'CLOUDINARY_API_KEY',     hint: 'File uploads will fail.' },
  { key: 'CLOUDINARY_API_SECRET',  hint: 'File uploads will fail.' },
  { key: 'RAZORPAY_KEY_ID',        hint: 'Payments will not work.' },
  { key: 'RAZORPAY_KEY_SECRET',    hint: 'Payments will not work.' },
  { key: 'RAZORPAY_WEBHOOK_SECRET',hint: 'Webhook verification will fail.' },
  { key: 'SMTP_HOST',              hint: 'Emails will not be sent.' },
  { key: 'FAST2SMS_API_KEY',       hint: 'SMS will not be sent.' },
  { key: 'SENDGRID_API_KEY',       hint: 'Production emails will not be sent.' },
  { key: 'COOKIE_SECRET',          hint: 'Cookie signing will use an insecure default.' }
];

// ── VALIDATE ─────────────────────────────────────────────────
const validateEnv = () => {
  const missing = REQUIRED.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '  MISSING REQUIRED ENVIRONMENT VARIABLES:\n' +
      missing.map(k => `  ✗ ${k}`).join('\n') + '\n' +
      '  Check your .env file and try again.\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );
    process.exit(1);
  }

  // Warn about recommended missing vars
  RECOMMENDED.forEach(({ key, hint }) => {
    if (!process.env[key]) {
      logger.warn(`ENV WARNING: ${key} is not set. ${hint}`);
    }
  });

  // Validate specific formats
  const port = parseInt(process.env.PORT, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    logger.error(`Invalid PORT value: "${process.env.PORT}". Must be 1-65535.`);
    process.exit(1);
  }

  if (!['development', 'production', 'test'].includes(process.env.NODE_ENV)) {
    logger.error(`Invalid NODE_ENV: "${process.env.NODE_ENV}". Use development, production, or test.`);
    process.exit(1);
  }

  logger.info(`Environment validated. Running in ${process.env.NODE_ENV} mode.`);
};

// ── DEFAULTS ─────────────────────────────────────────────────
// Apply safe defaults for optional vars
const applyDefaults = () => {
  process.env.PORT                   = process.env.PORT || '5000';
  process.env.JWT_ACCESS_EXPIRES_IN  = process.env.JWT_ACCESS_EXPIRES_IN  || '1h';
  process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
  process.env.COOKIE_SECRET          = process.env.COOKIE_SECRET || 'default-insecure-secret-change-me';
  process.env.API_VERSION            = process.env.API_VERSION || 'v1';
  process.env.APP_NAME               = process.env.APP_NAME || 'ExamPrep';
};

module.exports = { validateEnv, applyDefaults };