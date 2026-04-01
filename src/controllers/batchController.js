'use strict';

// controllers/batchController.js
// ============================================================
// BATCH — CRUD, publish/approve, enrollment, students
// ============================================================

const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const factory    = require('../utils/handlerFactory');
const cache      = require('../utils/cache');
const { notifyUser } = require('../utils/socket');
const logger     = require('../utils/logger');
const ApiFeatures = require('../utils/ApiFeatures');
const {
  Batch, Enrollment, Payment, ExamGoal
} = require('../models');

// ── PUBLIC ────────────────────────────────────────────────────

exports.getAllBatches = catchAsync(async (req, res, next) => {
  const baseFilter = { isPublished: true, isApproved: true, isDeleted: false };
  if (req.query.examGoal) baseFilter.examGoal = req.query.examGoal;
  if (req.query.type)     baseFilter.type     = req.query.type;

  const features = new ApiFeatures(Batch.find(baseFilter), req.query)
    .filter().search(['name', 'description']).sort().limitFields().paginate();

  features.populate([
    { path: 'primaryInstructor', select: 'firstName lastName profilePicture' },
    { path: 'examGoal',          select: 'name slug icon examBody' }
  ]);

  const result = await features.execute(Batch);
  res.status(200).json({ status: 'success', ...result });
});

exports.getBatch = catchAsync(async (req, res, next) => {
  const key   = cache.keys.batch(req.params.id);
  const batch = await cache.remember(key, async () => {
    return await Batch.findOne({ _id: req.params.id, isDeleted: false })
      .populate('primaryInstructor', 'firstName lastName profilePicture')
      .populate('instructors',       'firstName lastName profilePicture')
      .populate('examGoal',          'name slug icon examBody stages')
      .populate('courses',           'title slug thumbnail totalLessons totalDuration')
      .lean();
  }, cache.TTL.MEDIUM);

  if (!batch) return next(new AppError('Batch not found.', 404));

  // Add enrollment status for authenticated users
  let isEnrolled = false;
  if (req.user) {
    isEnrolled = !!(await Enrollment.findOne({
      student: req.user._id, batch: req.params.id, isActive: true, isRevoked: false
    }).lean());
  }

  res.status(200).json({ status: 'success', data: { ...batch, isEnrolled } });
});

// ── INSTRUCTOR — MANAGE MY BATCHES ────────────────────────────

exports.getMyBatches = catchAsync(async (req, res, next) => {
  req.filter = { primaryInstructor: req.user._id };
  return factory.getAll(Batch, { searchFields: ['name'] })(req, res, next);
});

exports.createBatch = catchAsync(async (req, res, next) => {
  const batch = await Batch.create({
    ...req.body,
    primaryInstructor: req.user._id,
    instructors:       [req.user._id]
  });

  // Increment exam goal batch count
  await ExamGoal.findByIdAndUpdate(req.body.examGoal, { $inc: { totalBatches: 1 } });

  logger.info('Batch created', { batchId: batch._id, instructorId: req.user._id });
  res.status(201).json({ status: 'success', data: batch });
});

exports.updateBatch = catchAsync(async (req, res, next) => {
  // Block changing primaryInstructor via this route
  delete req.body.primaryInstructor;
  delete req.body.enrolledStudents;
  delete req.body.totalEnrollments;

  const batch = await Batch.findOneAndUpdate(
    { _id: req.params.id, primaryInstructor: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!batch) return next(new AppError('Batch not found or access denied.', 404));

  await cache.del(cache.keys.batch(req.params.id));
  res.status(200).json({ status: 'success', data: batch });
});

exports.deleteBatch = catchAsync(async (req, res, next) => {
  req.filter = { primaryInstructor: req.user._id };
  return factory.deleteOne(Batch)(req, res, next);
});

// Publish / unpublish
exports.publishBatch = catchAsync(async (req, res, next) => {
  const batch = await Batch.findOneAndUpdate(
    { _id: req.params.id, primaryInstructor: req.user._id },
    { isPublished: req.body.publish !== false },
    { new: true }
  );
  if (!batch) return next(new AppError('Batch not found or access denied.', 404));
  await cache.del(cache.keys.batch(req.params.id));
  res.status(200).json({ status: 'success', data: batch });
});

// ── ADMIN — APPROVE ────────────────────────────────────────────

exports.approveBatch = catchAsync(async (req, res, next) => {
  const { approve = true, reason } = req.body;
  const batch = await Batch.findByIdAndUpdate(
    req.params.id,
    { isApproved: approve, approvedBy: req.user._id, approvedAt: approve ? new Date() : null },
    { new: true }
  ).populate('primaryInstructor', 'firstName lastName');

  if (!batch) return next(new AppError('Batch not found.', 404));

  // Notify instructor
  notifyUser(batch.primaryInstructor._id, 'batch-approval', {
    batchId: batch._id,
    name:    batch.name,
    approved: approve,
    reason
  });

  await cache.del(cache.keys.batch(req.params.id));
  res.status(200).json({ status: 'success', data: batch });
});

// ── ENROLLMENT MANAGEMENT ─────────────────────────────────────

exports.getEnrolledStudents = catchAsync(async (req, res, next) => {
  // Only instructor of the batch or admin
  const batch = await Batch.findById(req.params.id).lean();
  if (!batch) return next(new AppError('Batch not found.', 404));

  if (req.user.role !== 'admin' && batch.primaryInstructor.toString() !== req.user._id.toString()) {
    return next(new AppError('Access denied.', 403));
  }

  const enrollments = await Enrollment.find({ batch: req.params.id, isActive: true, isRevoked: false })
    .populate('student', 'firstName lastName email profilePicture phoneNumber')
    .populate('payment', 'amount transactionId createdAt')
    .sort('-enrolledAt')
    .lean();

  res.status(200).json({ status: 'success', results: enrollments.length, data: enrollments });
});

exports.revokeEnrollment = catchAsync(async (req, res, next) => {
  const enrollment = await Enrollment.findOneAndUpdate(
    { _id: req.params.enrollmentId, batch: req.params.id },
    { isRevoked: true, isActive: false, revokedAt: new Date(), revokedBy: req.user._id, revokeReason: req.body.reason },
    { new: true }
  );
  if (!enrollment) return next(new AppError('Enrollment not found.', 404));

  notifyUser(enrollment.student, 'enrollment-revoked', { batchId: req.params.id });
  res.status(200).json({ status: 'success', message: 'Enrollment revoked.', data: enrollment });
});

// Add content to batch
exports.addCourseToBatch = catchAsync(async (req, res, next) => {
  const batch = await Batch.findOneAndUpdate(
    { _id: req.params.id, primaryInstructor: req.user._id },
    { $addToSet: { courses: req.body.courseId } },
    { new: true }
  );
  if (!batch) return next(new AppError('Batch not found or access denied.', 404));
  await cache.del(cache.keys.batch(req.params.id));
  res.status(200).json({ status: 'success', data: batch });
});

exports.addTestSeriesToBatch = catchAsync(async (req, res, next) => {
  const batch = await Batch.findOneAndUpdate(
    { _id: req.params.id, primaryInstructor: req.user._id },
    { $addToSet: { testSeries: req.body.testSeriesId } },
    { new: true }
  );
  if (!batch) return next(new AppError('Batch not found or access denied.', 404));
  await cache.del(cache.keys.batch(req.params.id));
  res.status(200).json({ status: 'success', data: batch });
});