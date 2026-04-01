'use strict';

// utils/rateLimiter.js
// ============================================================
// RATE LIMITERS — Per-route throttling
// Uses express-rate-limit with optional Redis store.
// Different limits for different route sensitivities.
// ============================================================
// npm install express-rate-limit rate-limit-redis ioredis

const rateLimit = require('express-rate-limit');

// Conditionally use Redis store if REDIS_URL is configured
let redisStore;
try {
  if (process.env.REDIS_URL) {
    const { RedisStore } = require('rate-limit-redis');
    const Redis           = require('ioredis');
    const redisClient     = new Redis(process.env.REDIS_URL);
    redisStore = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix:      'rl:'
    });
  }
} catch {
  // Redis not available — falls back to in-memory (not suitable for multi-instance)
}

/**
 * Factory to create a rate limiter with custom options
 */
const createLimiter = (options) =>
  rateLimit({
    standardHeaders: true,   // Return `RateLimit-*` headers
    legacyHeaders:   false,  // Disable `X-RateLimit-*` headers
    store:           redisStore || undefined,
    handler: (req, res) => {
      res.status(429).json({
        status:  'fail',
        message: options.message || 'Too many requests. Please try again later.',
        code:    'RATE_LIMITED',
        retryAfter: Math.ceil(options.windowMs / 1000 / 60)  // minutes
      });
    },
    ...options
  });

// ── LIMITERS ─────────────────────────────────────────────────

// General API — 300 requests per 15 minutes per IP
const generalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max:      300,
  message:  'Too many requests from this IP. Try again in 15 minutes.'
});

// Auth routes — 10 attempts per 15 minutes (brute-force protection)
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  'Too many login attempts. Try again in 15 minutes.',
  skipSuccessfulRequests: true   // only count failed attempts
});

// OTP / password reset — 3 per hour (prevent OTP spam)
const otpLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max:      3,
  message:  'Too many OTP requests. Try again in 1 hour.'
});

// Upload routes — 20 uploads per 10 minutes
const uploadLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  max:      20,
  message:  'Upload limit reached. Try again in 10 minutes.'
});

// Search / read-heavy routes — 100 per minute
const searchLimiter = createLimiter({
  windowMs: 60 * 1000,
  max:      100,
  message:  'Too many search requests. Slow down.'
});

// Payment routes — 10 per minute (fraud prevention)
const paymentLimiter = createLimiter({
  windowMs: 60 * 1000,
  max:      10,
  message:  'Too many payment requests.'
});

// Admin routes — 200 per 15 minutes
const adminLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max:      200,
  message:  'Admin rate limit exceeded.'
});

// Mock test submission — 5 per 5 minutes (prevent rapid re-submissions)
const testSubmitLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max:      5,
  message:  'Too many test submissions. Wait a moment before re-submitting.'
});

module.exports = {
  generalLimiter,
  authLimiter,
  otpLimiter,
  uploadLimiter,
  searchLimiter,
  paymentLimiter,
  adminLimiter,
  testSubmitLimiter,
  createLimiter    // expose factory for custom limiters in specific routes
};