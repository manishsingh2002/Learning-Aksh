'use strict';

// controllers/paymentController.js
// ============================================================
// PAYMENT — Razorpay initiate, verify, webhook, refund
// ============================================================
// npm install razorpay

const crypto     = require('crypto');
const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const { notifyUser } = require('../utils/socket');
const email      = require('../utils/email');
const sms        = require('../utils/sms');
const logger     = require('../utils/logger');
const {
  Payment, Enrollment, Batch, Course, TestSeries, MockTest,
  StudentProfile, Coupon, ExamGoal
} = require('../models');

// ── RAZORPAY INSTANCE (lazy — only if keys present) ──────────
let razorpay;
const getRazorpay = () => {
  if (!razorpay) {
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpay;
};

// ── RESOURCE LOOKUP ───────────────────────────────────────────
const getResource = async (type, id) => {
  const modelMap = { batch: Batch, course: Course, testSeries: TestSeries, mockTest: MockTest };
  const Model = modelMap[type];
  if (!Model) return null;
  return await Model.findOne({ _id: id, isDeleted: false, isPublished: true }).lean();
};

// ── VALIDATE + APPLY COUPON ───────────────────────────────────
const applyCoupon = async (code, type, resourceId) => {
  if (!code) return { discount: 0, couponDoc: null };

  const coupon = await Coupon.findOne({
    code:       code.toUpperCase(),
    isActive:   true,
    expiryDate: { $gt: new Date() },
    $or: [
      { usageLimit: null },
      { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
    ]
  }).lean();

  if (!coupon) throw new AppError('Invalid or expired coupon code.', 400, 'INVALID_COUPON');

  // Check scope
  const scopeField = `validFor${type.charAt(0).toUpperCase() + type.slice(1)}s`;
  if (coupon[scopeField]?.length > 0 && !coupon[scopeField].some(id => id.toString() === resourceId)) {
    throw new AppError('This coupon is not valid for the selected item.', 400, 'COUPON_NOT_APPLICABLE');
  }

  return { discount: coupon.discountValue, discountType: coupon.discountType, couponDoc: coupon };
};

// ── INITIATE PAYMENT ──────────────────────────────────────────
exports.initiatePayment = catchAsync(async (req, res, next) => {
  const { type, resourceId, couponCode } = req.body;

  // Get the resource being purchased
  const resource = await getResource(type, resourceId);
  if (!resource) return next(new AppError('Item not found or not available.', 404));

  // Check not already enrolled
  const alreadyEnrolled = await Enrollment.findOne({
    student:     req.user._id,
    [type]:      resourceId,
    isActive:    true,
    isRevoked:   false
  }).lean();

  if (alreadyEnrolled) {
    return next(new AppError('You are already enrolled in this item.', 409, 'ALREADY_ENROLLED'));
  }

  // Calculate price
  const basePrice = resource.isFree ? 0 : (resource.discountPrice || resource.price || 0);

  // Apply coupon
  let finalPrice   = basePrice;
  let discountAmt  = 0;
  let couponDoc    = null;

  if (couponCode && basePrice > 0) {
    const result = await applyCoupon(couponCode, type, resourceId);
    couponDoc    = result.couponDoc;

    if (result.discountType === 'percentage') {
      discountAmt = Math.min((basePrice * result.discount) / 100, couponDoc.maxDiscountAmount || Infinity);
    } else if (result.discountType === 'fixed_amount') {
      discountAmt = result.discount;
    } else if (result.discountType === 'free') {
      discountAmt = basePrice;
    }

    finalPrice = Math.max(basePrice - discountAmt, 0);
  }

  // Free item — create enrollment directly without payment gateway
  if (finalPrice === 0) {
    const enrollment = await createEnrollment(req.user._id, type, resourceId, null, resource);

    if (couponDoc) await Coupon.findByIdAndUpdate(couponDoc._id, { $inc: { usedCount: 1 } });

    return res.status(201).json({
      status:  'success',
      message: 'Enrolled successfully (free).',
      data:    { enrollment }
    });
  }

  // Create Razorpay order
  const order = await getRazorpay().orders.create({
    amount:   Math.round(finalPrice * 100),  // in paise
    currency: 'INR',
    receipt:  `receipt_${Date.now()}`,
    notes: {
      userId:     req.user._id.toString(),
      type,
      resourceId
    }
  });

  // Create pending payment record
  const payment = await Payment.create({
    user:           req.user._id,
    [type]:         resourceId,
    amount:         finalPrice,
    originalAmount: basePrice,
    discountAmount: discountAmt,
    coupon:         couponDoc?._id,
    currency:       'INR',
    paymentMethod:  'razorpay',
    transactionId:  order.id,
    paymentGateway: 'razorpay',
    status:         'pending'
  });

  logger.info('Payment initiated', { paymentId: payment._id, amount: finalPrice, userId: req.user._id });

  res.status(201).json({
    status: 'success',
    data: {
      orderId:         order.id,
      amount:          finalPrice,
      currency:        'INR',
      razorpayKeyId:   process.env.RAZORPAY_KEY_ID,
      paymentId:       payment._id,
      itemName:        resource.name || resource.title,
      discountApplied: discountAmt
    }
  });
});

// ── VERIFY PAYMENT (called by frontend after Razorpay success) ─
exports.verifyPayment = catchAsync(async (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = req.body;

  // Verify Razorpay signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    await Payment.findByIdAndUpdate(paymentId, { status: 'failed' });
    return next(new AppError('Payment verification failed. Please contact support.', 400, 'PAYMENT_VERIFICATION_FAILED'));
  }

  // Update payment record
  const payment = await Payment.findByIdAndUpdate(
    paymentId,
    { status: 'completed', metadata: { razorpay_payment_id, razorpay_order_id } },
    { new: true }
  ).lean();

  if (!payment) return next(new AppError('Payment record not found.', 404));

  // Determine type
  const type       = payment.batch ? 'batch' : payment.course ? 'course' : payment.testSeries ? 'testSeries' : 'mockTest';
  const resourceId = payment[type];

  // Create enrollment
  const resource   = await getResource(type, resourceId);
  const enrollment = await createEnrollment(payment.user, type, resourceId, payment._id, resource);

  // Increment coupon usage
  if (payment.coupon) await Coupon.findByIdAndUpdate(payment.coupon, { $inc: { usedCount: 1 } });

  // Send confirmation email + SMS
  const user = await require('../models').User.findById(payment.user).lean();
  if (user) {
    email.sendEnrollmentConfirmation(user, resource, payment).catch(() => {});
    if (user.phoneNumber) sms.sendEnrollmentConfirmation(user.phoneNumber, resource.name || resource.title, payment.amount).catch(() => {});
  }

  notifyUser(payment.user, 'payment-success', {
    amount:   payment.amount,
    itemName: resource?.name || resource?.title,
    enrollmentId: enrollment._id
  });

  logger.info('Payment verified and enrollment created', { paymentId: payment._id, enrollmentId: enrollment._id });

  res.status(200).json({
    status: 'success',
    message: 'Payment successful! You are now enrolled.',
    data: { payment, enrollment }
  });
});

// ── RAZORPAY WEBHOOK (server-to-server) ───────────────────────
exports.razorpayWebhook = catchAsync(async (req, res, next) => {
  const webhookSecret   = process.env.RAZORPAY_WEBHOOK_SECRET;
  const receivedSig     = req.headers['x-razorpay-signature'];
  const expectedSig     = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (receivedSig !== expectedSig) {
    logger.warn('Invalid Razorpay webhook signature');
    return res.status(400).json({ status: 'fail', message: 'Invalid signature' });
  }

  const event = req.body.event;
  logger.info('Razorpay webhook received', { event });

  if (event === 'payment.failed') {
    const orderId = req.body.payload?.payment?.entity?.order_id;
    if (orderId) await Payment.findOneAndUpdate({ transactionId: orderId }, { status: 'failed' });
  }

  res.status(200).json({ status: 'success' });
});

// ── REFUND ────────────────────────────────────────────────────
exports.requestRefund = catchAsync(async (req, res, next) => {
  const payment = await Payment.findOne({
    _id:    req.params.id,
    user:   req.user._id,
    status: 'completed'
  }).lean();

  if (!payment) return next(new AppError('Payment not found or not eligible for refund.', 404));

  // Business rule: refund only within 7 days
  const daysSincePayment = (Date.now() - payment.createdAt) / (1000 * 60 * 60 * 24);
  if (daysSincePayment > 7) {
    return next(new AppError('Refund window has closed (7 days after purchase).', 400, 'REFUND_WINDOW_CLOSED'));
  }

  // Initiate Razorpay refund
  const refund = await getRazorpay().payments.refund(payment.metadata?.razorpay_payment_id, {
    amount: Math.round(payment.amount * 100),
    notes:  { reason: req.body.reason }
  });

  await Payment.findByIdAndUpdate(payment._id, {
    status:             'refunded',
    refundAmount:       payment.amount,
    refundReason:       req.body.reason,
    refundedAt:         new Date(),
    refundTransactionId: refund.id
  });

  // Revoke enrollment
  const type = payment.batch ? 'batch' : payment.course ? 'course' : 'testSeries';
  await Enrollment.findOneAndUpdate(
    { student: payment.user, [type]: payment[type] },
    { isRevoked: true, isActive: false, revokedAt: new Date(), revokeReason: 'Refund requested' }
  );

  notifyUser(payment.user, 'refund-processed', { amount: payment.amount });
  logger.info('Refund processed', { paymentId: payment._id, refundId: refund.id });

  res.status(200).json({ status: 'success', message: 'Refund processed successfully.' });
});

// ── PAYMENT HISTORY ───────────────────────────────────────────
exports.getMyPayments = catchAsync(async (req, res, next) => {
  const payments = await Payment.find({ user: req.user._id })
    .sort('-createdAt')
    .populate('batch',      'name')
    .populate('course',     'title')
    .populate('testSeries', 'title')
    .lean();

  res.status(200).json({ status: 'success', results: payments.length, data: payments });
});

exports.getMyEnrollments = catchAsync(async (req, res, next) => {
  const enrollments = await Enrollment.find({
    student:   req.user._id,
    isActive:  true,
    isRevoked: false
  })
  .populate({ path: 'batch',      select: 'name thumbnail examGoal startDate endDate features' })
  .populate({ path: 'course',     select: 'title thumbnail totalLessons totalDuration' })
  .populate({ path: 'testSeries', select: 'title totalTests examGoal' })
  .sort('-enrolledAt')
  .lean();

  res.status(200).json({ status: 'success', results: enrollments.length, data: enrollments });
});

// ── ADMIN ─────────────────────────────────────────────────────
exports.getAllPayments = catchAsync(async (req, res, next) => {
  const factory = require('../utils/handlerFactory');
  req.filter    = {};
  return factory.getAll(Payment)(req, res, next);
});

// ── HELPER ────────────────────────────────────────────────────
async function createEnrollment(studentId, type, resourceId, paymentId, resource) {
  const expiryDate = type === 'batch' && resource.endDate ? resource.endDate : null;

  const enrollment = await Enrollment.create({
    student:     studentId,
    [type]:      resourceId,
    payment:     paymentId,
    enrolledAt:  new Date(),
    expiryDate,
    isActive:    true
  });

  // Add to student profile
  await StudentProfile.findOneAndUpdate(
    { user: studentId },
    { $addToSet: { enrollments: enrollment._id } }
  );

  // Increment resource enrollment count
  if (type === 'batch')   await Batch.findByIdAndUpdate(resourceId, { $inc: { totalEnrollments: 1 }, $addToSet: { enrolledStudents: studentId } });
  if (type === 'course')  await Course.findByIdAndUpdate(resourceId, { $inc: { totalEnrollments: 1 } });

  // Increment exam goal student count
  if (resource.examGoal) await ExamGoal.findByIdAndUpdate(resource.examGoal, { $inc: { totalEnrolledStudents: 1 } });

  return enrollment;
}