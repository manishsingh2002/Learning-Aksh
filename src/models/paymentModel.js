// models/paymentModel.js
// ============================================================
// PAYMENT — Transactions, Enrollments, Coupons
// ============================================================
// A student can buy:
//   - A Batch (most common)
//   - A TestSeries (standalone)
//   - A Course (standalone)
//   - A MockTest (standalone)
// Each purchase creates one Payment + one or more Enrollments.
// ============================================================

const mongoose = require('mongoose');

// ==================== PAYMENT SCHEMA ====================
const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // What was purchased (only one should be set)
  batch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  course:     { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  testSeries: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSeries' },
  mockTest:   { type: mongoose.Schema.Types.ObjectId, ref: 'MockTest' },

  amount:         { type: Number, required: true },
  originalAmount: { type: Number },             // before coupon
  discountAmount: { type: Number, default: 0 },
  coupon:         { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },

  currency: {
    type: String,
    default: 'INR',
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('currency', value);
      },
      message: 'Invalid currency'
    }
  },

  paymentMethod: {
    type: String,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('payment_method', value);
      },
      message: 'Invalid payment method'
    }
  },

  transactionId:   { type: String, required: true, unique: true },
  paymentGateway:  String,     // "razorpay", "stripe", "cashfree"
  gatewayOrderId:  String,
  gatewayResponse: { type: mongoose.Schema.Types.Mixed, select: false },  // raw response

  status: {
    type: String,
    default: 'pending',
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('payment_status', value);
      },
      message: 'Invalid payment status'
    }
  },

  // Refund details
  refundAmount: Number,
  refundReason: String,
  refundedAt:   Date,
  refundTransactionId: String,

  metadata: mongoose.Schema.Types.Mixed,
  invoiceNumber: String,
  invoiceUrl:    String
}, { timestamps: true });

paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ batch: 1, status: 1 });

// ==================== ENROLLMENT SCHEMA ====================
// Created when payment is successful (or batch is free)
const enrollmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // What they enrolled in (only one should be set)
  batch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  course:     { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  testSeries: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSeries' },

  payment:    { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  enrolledAt: { type: Date, default: Date.now },
  expiryDate: Date,                            // for time-bound access

  isActive:   { type: Boolean, default: true },
  isRevoked:  { type: Boolean, default: false },
  revokedAt:  Date,
  revokedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revokeReason: String
}, { timestamps: true });

// ==================== STATICS ====================
enrollmentSchema.statics.calcTotalEnrollments = async function (courseId) {
  try {
    const stats = await this.aggregate([
      { $match: { course: courseId, isActive: true, isRevoked: false } },
      { $group: { _id: '$course', totalEnrollments: { $sum: 1 } } }
    ]);
    const Course = mongoose.model('Course');
    const count = stats.length > 0 ? stats[0].totalEnrollments : 0;
    await Course.findByIdAndUpdate(courseId, { totalEnrollments: count });
  } catch (error) {
    console.error('Error calculating total enrollments:', error);
  }
};

enrollmentSchema.post('save', function () {
  if (this.course) this.constructor.calcTotalEnrollments(this.course);
});

enrollmentSchema.post(/^findOneAnd/, async function (doc) {
  if (doc && doc.course) {
    await doc.constructor.calcTotalEnrollments(doc.course);
  }
});

enrollmentSchema.index({ student: 1, course: 1 });
enrollmentSchema.index({ student: 1, batch: 1 });
enrollmentSchema.index({ student: 1, testSeries: 1 });
enrollmentSchema.index({ expiryDate: 1 });

// ==================== COUPON SCHEMA ====================
const couponSchema = new mongoose.Schema({
  code:        { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: String,

  discountType: {
    type: String,
    enum: ['percentage', 'fixed_amount', 'free'],
    required: true
  },
  discountValue:    { type: Number, required: true },
  maxDiscountAmount: Number,   // cap for percentage discounts

  // Scope — if empty, applies to all
  validForBatches:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],
  validForCourses:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  validForTestSeries:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestSeries' }],
  validForExamGoals:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'ExamGoal' }],

  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },  // instructor-specific coupon

  startDate:  { type: Date, default: Date.now },
  expiryDate: { type: Date, required: true },

  usageLimit:      { type: Number, default: null },   // null = unlimited
  usagePerUser:    { type: Number, default: 1 },       // how many times one user can use
  usedCount:       { type: Number, default: 0 },

  isActive: { type: Boolean, default: true }
}, { timestamps: true });

couponSchema.index({ code: 1 });
couponSchema.index({ expiryDate: 1, isActive: 1 });

// ==================== EXPORTS ====================
module.exports = {
  Payment:    mongoose.models.Payment    || mongoose.model('Payment',    paymentSchema),
  Enrollment: mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema),
  Coupon:     mongoose.models.Coupon     || mongoose.model('Coupon',     couponSchema)
};
