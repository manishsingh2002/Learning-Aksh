'use strict';

// controllers/examGoalController.js
// ============================================================
// EXAM GOAL — CRUD + syllabus management + stats
// ============================================================

const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const factory    = require('../utils/handlerFactory');
const cache      = require('../utils/cache');
const { ExamGoal } = require('../models');

// ── PUBLIC ────────────────────────────────────────────────────

exports.getAllExamGoals = catchAsync(async (req, res, next) => {
  const cacheKey = `examgoals:all:${JSON.stringify(req.query)}`;

  const result = await cache.remember(cacheKey, async () => {
    const filter = { isActive: true, isDeleted: false };
    if (req.query.examBody) filter.examBody = req.query.examBody.toUpperCase();
    if (req.query.featured === 'true') filter.isFeatured = true;

    return await ExamGoal.find(filter)
      .select('name slug icon bannerImage examBody examSeries examYear totalEnrolledStudents totalBatches totalMockTests stages isFeatured')
      .sort('-isFeatured -totalEnrolledStudents')
      .lean();
  }, cache.TTL.LONG);

  res.status(200).json({ status: 'success', results: result.length, data: result });
});

exports.getExamGoal = catchAsync(async (req, res, next) => {
  const key = req.params.slug
    ? `examgoal:slug:${req.params.slug}`
    : cache.keys.examGoal(req.params.id);

  const goal = await cache.remember(key, async () => {
    const filter = req.params.slug
      ? { slug: req.params.slug, isDeleted: false }
      : { _id: req.params.id, isDeleted: false };

    return await ExamGoal.findOne(filter)
      .populate('leadInstructors', 'firstName lastName profilePicture')
      .lean();
  }, cache.TTL.LONG);

  if (!goal) return next(new AppError('Exam goal not found.', 404));

  res.status(200).json({ status: 'success', data: goal });
});

// ── ADMIN CRUD ────────────────────────────────────────────────

exports.createExamGoal = catchAsync(async (req, res, next) => {
  const goal = await ExamGoal.create(req.body);
  await cache.delPattern('examgoals:*');
  res.status(201).json({ status: 'success', data: goal });
});

exports.updateExamGoal = catchAsync(async (req, res, next) => {
  const goal = await ExamGoal.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true
  });
  if (!goal) return next(new AppError('Exam goal not found.', 404));

  await cache.del(cache.keys.examGoal(req.params.id));
  await cache.delPattern('examgoals:*');

  res.status(200).json({ status: 'success', data: goal });
});

exports.deleteExamGoal = factory.deleteOne(ExamGoal);

// Manage syllabus stages separately
exports.addSyllabusSubject = catchAsync(async (req, res, next) => {
  const goal = await ExamGoal.findByIdAndUpdate(
    req.params.id,
    { $push: { syllabus: req.body } },
    { new: true, runValidators: true }
  );
  if (!goal) return next(new AppError('Exam goal not found.', 404));
  await cache.del(cache.keys.examGoal(req.params.id));
  res.status(200).json({ status: 'success', data: goal });
});

exports.updateSyllabusSubject = catchAsync(async (req, res, next) => {
  const goal = await ExamGoal.findOneAndUpdate(
    { _id: req.params.id, 'syllabus._id': req.params.subjectId },
    { $set: { 'syllabus.$': req.body } },
    { new: true }
  );
  if (!goal) return next(new AppError('Subject not found.', 404));
  await cache.del(cache.keys.examGoal(req.params.id));
  res.status(200).json({ status: 'success', data: goal });
});

exports.removeSyllabusSubject = catchAsync(async (req, res, next) => {
  const goal = await ExamGoal.findByIdAndUpdate(
    req.params.id,
    { $pull: { syllabus: { _id: req.params.subjectId } } },
    { new: true }
  );
  if (!goal) return next(new AppError('Exam goal not found.', 404));
  await cache.del(cache.keys.examGoal(req.params.id));
  res.status(200).json({ status: 'success', data: goal });
});