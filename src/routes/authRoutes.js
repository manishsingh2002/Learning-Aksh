'use strict';

// routes/authRoutes.js
// ============================================================
// AUTH ROUTES
// POST /api/v1/auth/register
// POST /api/v1/auth/login
// POST /api/v1/auth/logout
// POST /api/v1/auth/refresh-token
// POST /api/v1/auth/send-otp
// POST /api/v1/auth/verify-otp
// POST /api/v1/auth/verify-email/:token
// POST /api/v1/auth/forgot-password
// PATCH /api/v1/auth/reset-password/:token
// PATCH /api/v1/auth/change-password
// GET  /api/v1/auth/me
// ============================================================

const express  = require('express');
const router   = express.Router();

const authCtrl = require('../controllers/authController');
const { authenticate }           = require('../utils/permissions');
const { authLimiter, otpLimiter } = require('../utils/rateLimiter');
const { validate, schemas }      = require('../utils/validators');

// ── PUBLIC ────────────────────────────────────────────────────
router.post('/register',       authLimiter, validate(schemas.register),       authCtrl.register);
router.post('/login',          authLimiter, validate(schemas.login),           authCtrl.login);
router.post('/logout',                                                          authCtrl.logout);
router.post('/refresh-token',                                                   authCtrl.refreshToken);
router.get( '/verify-email/:token',                                             authCtrl.verifyEmail);
router.post('/forgot-password', otpLimiter, validate(schemas.forgotPassword),  authCtrl.forgotPassword);
router.patch('/reset-password/:token',      validate(schemas.resetPassword),    authCtrl.resetPassword);
router.post('/send-otp',        otpLimiter,                                     authCtrl.sendOTP);
router.post('/verify-otp',                  validate(schemas.verifyOTP),        authCtrl.verifyOTP);

// ── PROTECTED ─────────────────────────────────────────────────
router.use(authenticate);
router.get( '/me',                                                              authCtrl.getMe);
router.patch('/change-password', validate(schemas.changePassword),             authCtrl.changePassword);

module.exports = router;