'use strict';

// controllers/mockTestController.js
// ============================================================
// MOCK TEST — CRUD, Questions, Attempt, Results, Leaderboard
// ============================================================

const catchAsync  = require('../utils/catchAsync');
const AppError    = require('../utils/appError');
const factory     = require('../utils/handlerFactory');
const cache       = require('../utils/cache');
const { notifyUser } = require('../utils/socket');
const { calcMockTestScore, calcPercentage, getGrade } = require('../utils/helpers');
const email       = require('../utils/email');
const logger      = require('../utils/logger');
const ApiFeatures = require('../utils/ApiFeatures');
const {
  MockTest, MockTestQuestion, MockTestAttempt,
  TestSeries, Enrollment, PerformanceAnalytics
} = require('../models');

// ══════════════════════════════════════════════════════════════
// MOCK TESTS
// ══════════════════════════════════════════════════════════════

// ── PUBLIC / STUDENT ──────────────────────────────────────────

exports.getAllMockTests = catchAsync(async (req, res, next) => {
  const baseFilter = { isPublished: true, isDeleted: false };
  if (req.query.examGoal) baseFilter.examGoal = req.query.examGoal;
  if (req.query.subject)  baseFilter.subject  = req.query.subject;
  if (req.query.isPYQ === 'true') baseFilter.isPYQ = true;

  const features = new ApiFeatures(MockTest.find(baseFilter), req.query)
    .filter().search(['title', 'description']).sort().paginate();

  features.populate([
    { path: 'instructor', select: 'firstName lastName' },
    { path: 'examGoal',   select: 'name slug' }
  ]);

  const result = await features.execute(MockTest);
  res.status(200).json({ status: 'success', ...result });
});

exports.getMockTest = catchAsync(async (req, res, next) => {
  const test = await cache.remember(
    cache.keys.mockTest(req.params.id),
    async () => MockTest.findOne({ _id: req.params.id, isDeleted: false })
      .populate('instructor', 'firstName lastName profilePicture')
      .populate('examGoal',   'name slug')
      .lean(),
    cache.TTL.MEDIUM
  );

  if (!test) return next(new AppError('Mock test not found.', 404));

  res.status(200).json({ status: 'success', data: test });
});

// ── INSTRUCTOR CRUD ───────────────────────────────────────────

exports.getMyMockTests = catchAsync(async (req, res, next) => {
  req.filter = { instructor: req.user._id };
  return factory.getAll(MockTest, { searchFields: ['title'] })(req, res, next);
});

exports.createMockTest = catchAsync(async (req, res, next) => {
  const test = await MockTest.create({ ...req.body, instructor: req.user._id });
  res.status(201).json({ status: 'success', data: test });
});

exports.updateMockTest = catchAsync(async (req, res, next) => {
  ['instructor', 'attemptsCount', 'averageScore'].forEach(f => delete req.body[f]);

  const test = await MockTest.findOneAndUpdate(
    { _id: req.params.id, instructor: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!test) return next(new AppError('Mock test not found or access denied.', 404));

  await cache.del(cache.keys.mockTest(req.params.id));
  res.status(200).json({ status: 'success', data: test });
});

exports.deleteMockTest = catchAsync(async (req, res, next) => {
  req.filter = { instructor: req.user._id };
  return factory.deleteOne(MockTest)(req, res, next);
});

exports.publishMockTest = catchAsync(async (req, res, next) => {
  // Validate at least 1 question before publishing
  const count = await MockTestQuestion.countDocuments({ mockTest: req.params.id });
  if (count === 0 && req.body.publish !== false) {
    return next(new AppError('Cannot publish a mock test with no questions.', 400, 'NO_QUESTIONS'));
  }

  const test = await MockTest.findOneAndUpdate(
    { _id: req.params.id, instructor: req.user._id },
    { isPublished: req.body.publish !== false },
    { new: true }
  );
  if (!test) return next(new AppError('Mock test not found or access denied.', 404));

  await cache.del(cache.keys.mockTest(req.params.id));
  res.status(200).json({ status: 'success', data: test });
});

// ── ADMIN APPROVE ─────────────────────────────────────────────
exports.approveMockTest = catchAsync(async (req, res, next) => {
  const test = await MockTest.findByIdAndUpdate(
    req.params.id,
    { isApproved: req.body.approve !== false },
    { new: true }
  ).populate('instructor', 'firstName lastName');

  if (!test) return next(new AppError('Mock test not found.', 404));
  notifyUser(test.instructor._id, 'mocktest-approved', { testId: test._id, title: test.title });
  await cache.del(cache.keys.mockTest(req.params.id));
  res.status(200).json({ status: 'success', data: test });
});

// ══════════════════════════════════════════════════════════════
// QUESTIONS
// ══════════════════════════════════════════════════════════════

exports.getQuestions = catchAsync(async (req, res, next) => {
  // Only enrolled students and instructors can see questions
  const test = await MockTest.findById(req.params.id).lean();
  if (!test) return next(new AppError('Mock test not found.', 404));

  const questions = await MockTestQuestion.find({ mockTest: req.params.id })
    .sort('sectionName order')
    .lean();

  // For non-instructors: hide correct answers (during active attempts)
  const isInstructor = ['instructor', 'admin'].includes(req.user?.role) ||
                       test.instructor.toString() === req.user?._id?.toString();

  const safeQuestions = isInstructor ? questions : questions.map(q => ({
    ...q,
    options: q.options.map(o => ({ text: o.text, imageUrl: o.imageUrl }))  // hide isCorrect
  }));

  res.status(200).json({ status: 'success', results: questions.length, data: safeQuestions });
});

exports.addQuestion = catchAsync(async (req, res, next) => {
  const test = await MockTest.findOne({ _id: req.params.id, instructor: req.user._id }).lean();
  if (!test) return next(new AppError('Mock test not found or access denied.', 404));

  // Validate at least one correct option
  const hasCorrect = req.body.options?.some(o => o.isCorrect);
  if (!hasCorrect) return next(new AppError('At least one option must be marked as correct.', 400));

  const question = await MockTestQuestion.create({ ...req.body, mockTest: req.params.id });

  // Update test counters
  await MockTest.findByIdAndUpdate(req.params.id, {
    $inc: {
      totalQuestions: 1,
      totalMarks:     req.body.marks || 1
    }
  });

  await cache.del(cache.keys.mockTest(req.params.id));
  res.status(201).json({ status: 'success', data: question });
});

exports.updateQuestion = catchAsync(async (req, res, next) => {
  const question = await MockTestQuestion.findById(req.params.questionId).lean();
  if (!question) return next(new AppError('Question not found.', 404));

  // Verify instructor owns the mock test
  const test = await MockTest.findOne({ _id: question.mockTest, instructor: req.user._id }).lean();
  if (!test && req.user.role !== 'admin') return next(new AppError('Access denied.', 403));

  const updated = await MockTestQuestion.findByIdAndUpdate(req.params.questionId, req.body, {
    new: true, runValidators: true
  });

  await cache.del(cache.keys.mockTest(question.mockTest.toString()));
  res.status(200).json({ status: 'success', data: updated });
});

exports.deleteQuestion = catchAsync(async (req, res, next) => {
  const question = await MockTestQuestion.findByIdAndDelete(req.params.questionId);
  if (!question) return next(new AppError('Question not found.', 404));

  await MockTest.findByIdAndUpdate(question.mockTest, {
    $inc: { totalQuestions: -1, totalMarks: -(question.marks || 1) }
  });

  await cache.del(cache.keys.mockTest(question.mockTest.toString()));
  res.status(204).json({ status: 'success', data: null });
});

exports.bulkAddQuestions = catchAsync(async (req, res, next) => {
  const test = await MockTest.findOne({ _id: req.params.id, instructor: req.user._id }).lean();
  if (!test) return next(new AppError('Mock test not found or access denied.', 404));

  if (!Array.isArray(req.body) || req.body.length === 0) {
    return next(new AppError('Provide an array of questions.', 400));
  }

  const questions = req.body.map(q => ({ ...q, mockTest: req.params.id }));
  const inserted  = await MockTestQuestion.insertMany(questions, { ordered: false });

  const totalMarks = inserted.reduce((sum, q) => sum + (q.marks || 1), 0);
  await MockTest.findByIdAndUpdate(req.params.id, {
    $inc: { totalQuestions: inserted.length, totalMarks }
  });

  await cache.del(cache.keys.mockTest(req.params.id));
  res.status(201).json({ status: 'success', results: inserted.length, data: inserted });
});

// ══════════════════════════════════════════════════════════════
// ATTEMPTS
// ══════════════════════════════════════════════════════════════

exports.startAttempt = catchAsync(async (req, res, next) => {
  const test = await MockTest.findOne({ _id: req.params.id, isPublished: true, isDeleted: false }).lean();
  if (!test) return next(new AppError('Mock test not found or not available.', 404));

  // Check if already has an in-progress attempt
  const existing = await MockTestAttempt.findOne({
    mockTest: req.params.id,
    student:  req.user._id,
    status:   { $in: ['started', 'in-progress'] }
  }).lean();

  if (existing) {
    return res.status(200).json({
      status:  'success',
      message: 'Resuming existing attempt.',
      data:    existing
    });
  }

  const attempt = await MockTestAttempt.create({
    mockTest:  req.params.id,
    student:   req.user._id,
    startedAt: new Date()
  });

  await MockTest.findByIdAndUpdate(req.params.id, { $inc: { attemptsCount: 1 } });

  res.status(201).json({ status: 'success', data: attempt });
});

exports.submitAttempt = catchAsync(async (req, res, next) => {
  const attempt = await MockTestAttempt.findOne({
    _id:     req.params.attemptId,
    student: req.user._id,
    status:  { $in: ['started', 'in-progress'] }
  }).lean();

  if (!attempt) return next(new AppError('Attempt not found or already submitted.', 404));

  const test      = await MockTest.findById(attempt.mockTest).lean();
  const questions = await MockTestQuestion.find({ mockTest: attempt.mockTest }).lean();

  // Build a map of questionId → question for fast lookup
  const qMap = {};
  questions.forEach(q => { qMap[q._id.toString()] = q; });

  // Score each answer
  const { answers, timeTaken } = req.body;
  const scoredAnswers = [];
  const sectionMap    = {};

  for (const ans of answers) {
    const q = qMap[ans.questionId];
    if (!q) continue;

    const skipped    = ans.selectedOptionIndex === null || ans.selectedOptionIndex === undefined;
    const isCorrect  = !skipped && q.options[ans.selectedOptionIndex]?.isCorrect === true;
    const marks      = skipped ? 0 : isCorrect ? q.marks : -(test.negativeMarkingValue || 0);

    scoredAnswers.push({
      questionId:          ans.questionId,
      selectedOptionIndex: ans.selectedOptionIndex ?? null,
      isCorrect:           !skipped && isCorrect,
      marksObtained:       marks
    });

    // Section aggregation
    const sec = q.sectionName;
    if (!sectionMap[sec]) sectionMap[sec] = { sectionName: sec, attempted: 0, correct: 0, incorrect: 0, skipped: 0, marksObtained: 0 };
    if (skipped) sectionMap[sec].skipped++;
    else if (isCorrect) { sectionMap[sec].correct++; sectionMap[sec].attempted++; sectionMap[sec].marksObtained += marks; }
    else { sectionMap[sec].incorrect++; sectionMap[sec].attempted++; sectionMap[sec].marksObtained += marks; }
  }

  const totalScore  = Math.max(scoredAnswers.reduce((sum, a) => sum + a.marksObtained, 0), 0);
  const percentage  = calcPercentage(totalScore, test.totalMarks);
  const isPassed    = totalScore >= test.passingMarks;

  const updatedAttempt = await MockTestAttempt.findByIdAndUpdate(
    attempt._id,
    {
      answers:      scoredAnswers,
      sectionScores: Object.values(sectionMap),
      score:        totalScore,
      percentage,
      isPassed,
      timeTaken,
      completedAt:  new Date(),
      status:       'completed'
    },
    { new: true }
  );

  // Update mock test average score
  const allAttempts = await MockTestAttempt.find({ mockTest: attempt.mockTest, status: 'completed' }).lean();
  const avgScore    = allAttempts.reduce((s, a) => s + a.percentage, 0) / allAttempts.length;
  await MockTest.findByIdAndUpdate(attempt.mockTest, { averageScore: avgScore.toFixed(1) });

  // Update performance analytics asynchronously
  updatePerformanceAnalytics(req.user._id, test, scoredAnswers, questions).catch(err =>
    logger.warn('Performance analytics update failed', { error: err.message })
  );

  // Notify user
  notifyUser(req.user._id, 'test-submitted', {
    attemptId:  updatedAttempt._id,
    testTitle:  test.title,
    score:      totalScore,
    percentage,
    isPassed
  });

  logger.info('Mock test submitted', { attemptId: attempt._id, score: totalScore, percentage });
  res.status(200).json({ status: 'success', data: updatedAttempt });
});

// Background function — updates PerformanceAnalytics after a test submission
async function updatePerformanceAnalytics(studentId, test, scoredAnswers, questions) {
  const qMap = {};
  questions.forEach(q => { qMap[q._id.toString()] = q; });

  const subjectUpdates = {};
  for (const ans of scoredAnswers) {
    const q = qMap[ans.questionId?.toString()];
    if (!q?.subject) continue;

    if (!subjectUpdates[q.subject]) {
      subjectUpdates[q.subject] = { attempted: 0, correct: 0, incorrect: 0 };
    }
    subjectUpdates[q.subject].attempted++;
    if (ans.isCorrect) subjectUpdates[q.subject].correct++;
    else subjectUpdates[q.subject].incorrect++;
  }

  const analytics = await PerformanceAnalytics.findOne({
    student: studentId, examGoal: test.examGoal
  });

  if (!analytics) {
    await PerformanceAnalytics.create({
      student:  studentId,
      examGoal: test.examGoal,
      subjectWise: Object.entries(subjectUpdates).map(([subject, stats]) => ({
        subject,
        ...stats,
        accuracy: calcPercentage(stats.correct, stats.attempted)
      }))
    });
    return;
  }

  // Merge into existing analytics
  for (const [subject, stats] of Object.entries(subjectUpdates)) {
    const existing = analytics.subjectWise.find(s => s.subject === subject);
    if (existing) {
      existing.attempted += stats.attempted;
      existing.correct   += stats.correct;
      existing.incorrect += stats.incorrect;
      existing.accuracy   = calcPercentage(existing.correct, existing.attempted);
    } else {
      analytics.subjectWise.push({
        subject,
        ...stats,
        accuracy: calcPercentage(stats.correct, stats.attempted)
      });
    }
  }

  // Recalculate weak / strong topics
  analytics.weakTopics   = analytics.subjectWise.filter(s => s.accuracy < 40).map(s => s.subject);
  analytics.strongTopics = analytics.subjectWise.filter(s => s.accuracy >= 75).map(s => s.subject);
  analytics.lastUpdated  = new Date();
  await analytics.save();
}

// ── GET ATTEMPT RESULT ────────────────────────────────────────
exports.getAttemptResult = catchAsync(async (req, res, next) => {
  const attempt = await MockTestAttempt.findOne({
    _id:    req.params.attemptId,
    student: req.user._id
  })
  .populate({ path: 'answers.questionId', model: 'MockTestQuestion', select: 'question options explanation sectionName marks' })
  .lean();

  if (!attempt) return next(new AppError('Attempt not found.', 404));
  if (attempt.status !== 'completed') {
    return next(new AppError('Attempt is not yet completed.', 400));
  }

  res.status(200).json({ status: 'success', data: attempt });
});

exports.getMyAttempts = catchAsync(async (req, res, next) => {
  const attempts = await MockTestAttempt.find({
    student:  req.user._id,
    mockTest: req.params.id,
    status:   'completed'
  }).sort('-createdAt').lean();

  res.status(200).json({ status: 'success', results: attempts.length, data: attempts });
});

// ── LEADERBOARD ───────────────────────────────────────────────
exports.getLeaderboard = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const limit  = Math.min(parseInt(req.query.limit) || 10, 50);

  const leaderboard = await cache.remember(
    cache.keys.leaderboard(id),
    async () => {
      return await MockTestAttempt.find({ mockTest: id, status: 'completed' })
        .sort({ score: -1, timeTaken: 1 })
        .limit(limit)
        .populate('student', 'firstName lastName profilePicture')
        .select('score percentage timeTaken rank percentile student')
        .lean();
    },
    cache.TTL.SHORT
  );

  res.status(200).json({ status: 'success', results: leaderboard.length, data: leaderboard });
});