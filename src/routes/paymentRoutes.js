'use strict';

// routes/paymentRoutes.js
// ============================================================
// PAYMENT ROUTES
// POST   /api/v1/payments/initiate             (student)
// POST   /api/v1/payments/verify               (student)
// POST   /api/v1/payments/webhook/razorpay     (public — Razorpay server)
// POST   /api/v1/payments/:id/refund           (student)
// GET    /api/v1/payments/my                   (student)
// GET    /api/v1/payments/my/enrollments       (student)
// GET    /api/v1/payments/                     (admin)
// ============================================================

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/paymentController');
const { authenticate, restrictTo } = require('../utils/permissions');
const { paymentLimiter }           = require('../utils/rateLimiter');
const { validate, schemas }        = require('../utils/validators');

// ── WEBHOOK (no auth — Razorpay sends raw body) ───────────────
// Must use express.raw() middleware — set in app.js for this path
router.post('/webhook/razorpay', ctrl.razorpayWebhook);

// ── PROTECTED ─────────────────────────────────────────────────
router.use(authenticate);

// Student
router.post('/initiate',
  restrictTo('student'),
  paymentLimiter,
  validate(schemas.initiatePayment),
  ctrl.initiatePayment
);
router.post('/verify',
  restrictTo('student'),
  paymentLimiter,
  ctrl.verifyPayment
);
router.post('/:id/refund',
  restrictTo('student'),
  ctrl.requestRefund
);
router.get('/my',              ctrl.getMyPayments);
router.get('/my/enrollments',  ctrl.getMyEnrollments);

// Admin
router.get('/', restrictTo('admin'), ctrl.getAllPayments);

module.exports = router;