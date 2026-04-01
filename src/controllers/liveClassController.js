'use strict';

// controllers/liveClassController.js
// ============================================================
// LIVE CLASS — CRUD, start/end, recordings, doubt sessions
// ============================================================

const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const factory    = require('../utils/handlerFactory');
const { broadcastToClass, notifyUser } = require('../utils/socket');
const cache      = require('../utils/cache');
const logger     = require('../utils/logger');
const {
  LiveClass, DoubtSession, Batch, Enrollment
} = require('../models');

// ── GET ALL (for a batch) ─────────────────────────────────────
exports.getBatchLiveClasses = catchAsync(async (req, res, next) => {
  const { batchId } = req.params;
  const { status, upcoming } = req.query;

  const filter = { batch: batchId, isDeleted: false };
  if (status) filter.status = status;
  if (upcoming === 'true') {
    filter.scheduledAt = { $gte: new Date() };
    filter.status      = 'scheduled';
  }

  const classes = await LiveClass.find(filter)
    .populate('instructor', 'firstName lastName profilePicture')
    .sort('scheduledAt')
    .lean();

  res.status(200).json({ status: 'success', results: classes.length, data: classes });
});

// ── GET SINGLE ────────────────────────────────────────────────
exports.getLiveClass = catchAsync(async (req, res, next) => {
  const liveClass = await LiveClass.findOne({ _id: req.params.id, isDeleted: false })
    .populate('instructor', 'firstName lastName profilePicture')
    .populate('batch',      'name examGoal')
    .lean();

  if (!liveClass) return next(new AppError('Live class not found.', 404));

  // Only share stream URL / key to enrolled students and instructor
  const isInstructor = req.user?.role === 'instructor' || req.user?._id?.toString() === liveClass.instructor?._id?.toString();
  const isEnrolled   = req.enrollment;

  if (!isInstructor && !isEnrolled) {
    delete liveClass.streamKey;
    if (liveClass.status !== 'completed') delete liveClass.streamUrl;
  }

  res.status(200).json({ status: 'success', data: liveClass });
});

// ── CREATE ────────────────────────────────────────────────────
exports.createLiveClass = catchAsync(async (req, res, next) => {
  // Verify instructor owns the batch
  const batch = await Batch.findOne({
    _id: req.body.batch,
    $or: [{ primaryInstructor: req.user._id }, { instructors: req.user._id }]
  }).lean();

  if (!batch && req.user.role !== 'admin') {
    return next(new AppError('Batch not found or access denied.', 404));
  }

  const liveClass = await LiveClass.create({
    ...req.body,
    instructor: req.user._id,
    examGoal:   batch?.examGoal
  });

  // Notify all enrolled students
  const enrollments = await Enrollment.find({ batch: req.body.batch, isActive: true }).lean();
  enrollments.forEach(e => {
    notifyUser(e.student, 'live-class-scheduled', {
      classId:    liveClass._id,
      title:      liveClass.title,
      subject:    liveClass.subject,
      scheduledAt: liveClass.scheduledAt
    });
  });

  logger.info('Live class created', { classId: liveClass._id, batchId: req.body.batch });
  res.status(201).json({ status: 'success', data: liveClass });
});

// ── UPDATE ────────────────────────────────────────────────────
exports.updateLiveClass = catchAsync(async (req, res, next) => {
  // Prevent changing core fields after going live
  const liveClass = await LiveClass.findById(req.params.id).lean();
  if (!liveClass) return next(new AppError('Live class not found.', 404));
  if (liveClass.status === 'live') {
    return next(new AppError('Cannot edit a live class that is currently in progress.', 400));
  }

  const updated = await LiveClass.findOneAndUpdate(
    { _id: req.params.id, instructor: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!updated) return next(new AppError('Live class not found or access denied.', 404));

  // If rescheduled, notify students
  if (req.body.scheduledAt) {
    const enrollments = await Enrollment.find({ batch: updated.batch, isActive: true }).lean();
    enrollments.forEach(e => {
      notifyUser(e.student, 'live-class-rescheduled', {
        classId:    updated._id,
        title:      updated.title,
        newTime:    updated.scheduledAt
      });
    });
  }

  res.status(200).json({ status: 'success', data: updated });
});

// ── START CLASS ───────────────────────────────────────────────
exports.startLiveClass = catchAsync(async (req, res, next) => {
  const liveClass = await LiveClass.findOneAndUpdate(
    { _id: req.params.id, instructor: req.user._id, status: 'scheduled' },
    { status: 'live', streamUrl: req.body.streamUrl },
    { new: true }
  );
  if (!liveClass) return next(new AppError('Live class not found or already started.', 404));

  // Broadcast to all in the live room
  broadcastToClass(req.params.id, 'class-started', {
    classId:  liveClass._id,
    title:    liveClass.title,
    streamUrl: liveClass.streamUrl
  });

  logger.info('Live class started', { classId: liveClass._id });
  res.status(200).json({ status: 'success', data: liveClass });
});

// ── END CLASS ─────────────────────────────────────────────────
exports.endLiveClass = catchAsync(async (req, res, next) => {
  const liveClass = await LiveClass.findOneAndUpdate(
    { _id: req.params.id, instructor: req.user._id, status: 'live' },
    {
      status:       'completed',
      recordingUrl: req.body.recordingUrl,
      notes:        req.body.notes,
      notesUrl:     req.body.notesUrl
    },
    { new: true }
  );
  if (!liveClass) return next(new AppError('Live class not found or not currently live.', 404));

  broadcastToClass(req.params.id, 'class-ended', {
    classId:     liveClass._id,
    recordingUrl: liveClass.recordingUrl
  });

  logger.info('Live class ended', { classId: liveClass._id, attendees: liveClass.totalAttendees });
  res.status(200).json({ status: 'success', data: liveClass });
});

// ── CANCEL ────────────────────────────────────────────────────
exports.cancelLiveClass = catchAsync(async (req, res, next) => {
  const liveClass = await LiveClass.findOneAndUpdate(
    { _id: req.params.id, instructor: req.user._id },
    { status: 'cancelled', postponeReason: req.body.reason },
    { new: true }
  );
  if (!liveClass) return next(new AppError('Live class not found or access denied.', 404));

  broadcastToClass(req.params.id, 'class-cancelled', {
    classId: liveClass._id,
    reason:  req.body.reason
  });

  // Notify enrolled students
  const enrollments = await Enrollment.find({ batch: liveClass.batch, isActive: true }).lean();
  enrollments.forEach(e => notifyUser(e.student, 'live-class-cancelled', { classId: liveClass._id, title: liveClass.title }));

  res.status(200).json({ status: 'success', data: liveClass });
});

exports.deleteLiveClass = catchAsync(async (req, res, next) => {
  req.filter = { instructor: req.user._id };
  return factory.deleteOne(LiveClass)(req, res, next);
});

// ── DOUBT SESSIONS ────────────────────────────────────────────

exports.getBatchDoubtSessions = catchAsync(async (req, res, next) => {
  const sessions = await DoubtSession.find({ batch: req.params.batchId })
    .populate('instructor', 'firstName lastName profilePicture')
    .sort('-scheduledAt').lean();
  res.status(200).json({ status: 'success', results: sessions.length, data: sessions });
});

exports.createDoubtSession = catchAsync(async (req, res, next) => {
  const session = await DoubtSession.create({ ...req.body, instructor: req.user._id });
  res.status(201).json({ status: 'success', data: session });
});

exports.submitDoubtQuestion = catchAsync(async (req, res, next) => {
  const session = await DoubtSession.findByIdAndUpdate(
    req.params.sessionId,
    { $push: { questions: { student: req.user._id, question: req.body.question } } },
    { new: true }
  );
  if (!session) return next(new AppError('Doubt session not found.', 404));
  res.status(200).json({ status: 'success', message: 'Question submitted.' });
});

exports.upvoteDoubtQuestion = catchAsync(async (req, res, next) => {
  await DoubtSession.updateOne(
    { _id: req.params.sessionId, 'questions._id': req.params.questionId },
    { $inc: { 'questions.$.upvotes': 1 } }
  );
  res.status(200).json({ status: 'success', message: 'Upvoted.' });
});