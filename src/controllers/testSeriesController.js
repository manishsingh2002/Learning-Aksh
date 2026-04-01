'use strict';

// controllers/testSeriesController.js
// ============================================================
// TEST SERIES — CRUD + manage tests
// ============================================================

const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const factory    = require('../utils/handlerFactory');
const ApiFeatures = require('../utils/ApiFeatures');
const { notifyUser } = require('../utils/socket');
const { TestSeries, MockTest } = require('../models');

exports.getAllTestSeries = catchAsync(async (req, res, next) => {
  const baseFilter = { isPublished: true, isApproved: true, isDeleted: false };
  if (req.query.examGoal) baseFilter.examGoal = req.query.examGoal;

  const features = new ApiFeatures(TestSeries.find(baseFilter), req.query)
    .filter().search(['title', 'description']).sort().paginate();

  features.populate([
    { path: 'instructor', select: 'firstName lastName profilePicture' },
    { path: 'examGoal',   select: 'name slug icon' }
  ]);

  const result = await features.execute(TestSeries);
  res.status(200).json({ status: 'success', ...result });
});

exports.getTestSeries = catchAsync(async (req, res, next) => {
  const series = await TestSeries.findOne({ _id: req.params.id, isDeleted: false })
    .populate('instructor', 'firstName lastName profilePicture')
    .populate('examGoal',   'name slug icon')
    .populate({ path: 'tests.mockTestId', select: 'title duration totalQuestions totalMarks level isFreePreview' })
    .lean();

  if (!series) return next(new AppError('Test series not found.', 404));
  res.status(200).json({ status: 'success', data: series });
});

exports.createTestSeries = catchAsync(async (req, res, next) => {
  const series = await TestSeries.create({ ...req.body, instructor: req.user._id });
  res.status(201).json({ status: 'success', data: series });
});

exports.updateTestSeries = catchAsync(async (req, res, next) => {
  const series = await TestSeries.findOneAndUpdate(
    { _id: req.params.id, instructor: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!series) return next(new AppError('Test series not found or access denied.', 404));
  res.status(200).json({ status: 'success', data: series });
});

exports.deleteTestSeries = catchAsync(async (req, res, next) => {
  req.filter = { instructor: req.user._id };
  return factory.deleteOne(TestSeries)(req, res, next);
});

exports.addTestToSeries = catchAsync(async (req, res, next) => {
  const { mockTestId, subject, chapter, order, isPreview } = req.body;

  const mockTest = await MockTest.findById(mockTestId).lean();
  if (!mockTest) return next(new AppError('Mock test not found.', 404));

  const series = await TestSeries.findOneAndUpdate(
    { _id: req.params.id, instructor: req.user._id },
    {
      $addToSet: { tests: { mockTestId, subject, chapter, order: order || 0, isPreview: isPreview || false } },
      $inc:      { totalTests: 1 }
    },
    { new: true }
  );
  if (!series) return next(new AppError('Test series not found or access denied.', 404));
  res.status(200).json({ status: 'success', data: series });
});

exports.removeTestFromSeries = catchAsync(async (req, res, next) => {
  const series = await TestSeries.findOneAndUpdate(
    { _id: req.params.id, instructor: req.user._id },
    {
      $pull: { tests: { mockTestId: req.params.testId } },
      $inc:  { totalTests: -1 }
    },
    { new: true }
  );
  if (!series) return next(new AppError('Test series not found or access denied.', 404));
  res.status(200).json({ status: 'success', data: series });
});

exports.publishTestSeries = catchAsync(async (req, res, next) => {
  const series = await TestSeries.findOneAndUpdate(
    { _id: req.params.id, instructor: req.user._id },
    { isPublished: req.body.publish !== false },
    { new: true }
  );
  if (!series) return next(new AppError('Test series not found or access denied.', 404));
  res.status(200).json({ status: 'success', data: series });
});

exports.approveTestSeries = catchAsync(async (req, res, next) => {
  const series = await TestSeries.findByIdAndUpdate(
    req.params.id,
    { isApproved: req.body.approve !== false },
    { new: true }
  ).populate('instructor', 'firstName lastName');

  if (!series) return next(new AppError('Test series not found.', 404));
  notifyUser(series.instructor._id, 'testseries-approved', { seriesId: series._id, title: series.title });
  res.status(200).json({ status: 'success', data: series });
});


// ══════════════════════════════════════════════════════════════
// controllers/dailyPracticeController.js (admin side)
// ══════════════════════════════════════════════════════════════

const { DailyPractice } = require('../models');

exports.createDailyPractice = catchAsync(async (req, res, next) => {
  const practice = await DailyPractice.create(req.body);
  res.status(201).json({ status: 'success', data: practice });
});

exports.getAllDailyPractice = catchAsync(async (req, res, next) => {
  const baseFilter = { isDeleted: false };
  if (req.query.examGoal) baseFilter.examGoal = req.query.examGoal;

  const practices = await DailyPractice.find(baseFilter)
    .populate('examGoal', 'name slug')
    .sort('-date').lean();

  res.status(200).json({ status: 'success', results: practices.length, data: practices });
});

exports.updateDailyPractice = factory.updateOne(DailyPractice);
exports.deleteDailyPractice = factory.deleteOne(DailyPractice);

exports.publishDailyPractice = catchAsync(async (req, res, next) => {
  const practice = await DailyPractice.findByIdAndUpdate(
    req.params.id,
    { isPublished: req.body.publish !== false },
    { new: true }
  );
  if (!practice) return next(new AppError('Daily practice not found.', 404));
  res.status(200).json({ status: 'success', data: practice });
});