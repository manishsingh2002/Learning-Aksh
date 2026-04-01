'use strict';

// controllers/progressController.js
// ============================================================
// PROGRESS — Lesson tracking, Performance Analytics,
//             Study Plan, Daily Practice, Certificates
// ============================================================

const catchAsync  = require('../utils/catchAsync');
const AppError    = require('../utils/appError');
const { calcPercentage, generateCertificateNumber } = require('../utils/helpers');
const cache       = require('../utils/cache');
const { notifyUser } = require('../utils/socket');
const logger      = require('../utils/logger');
const {
  ProgressTracking, PerformanceAnalytics, StudyPlan, Certificate,
  Course, Lesson, StudentProfile, DailyPractice, DailyPracticeAttempt,
  Badge, UserBadge
} = require('../models');

// ══════════════════════════════════════════════════════════════
// LESSON PROGRESS
// ══════════════════════════════════════════════════════════════

exports.markLessonComplete = catchAsync(async (req, res, next) => {
  const { courseId, lessonId } = req.params;
  const { timeSpent = 0, lastPosition = 0 } = req.body;

  const lesson  = await Lesson.findOne({ _id: lessonId, course: courseId, isDeleted: false }).lean();
  if (!lesson) return next(new AppError('Lesson not found.', 404));

  // Upsert progress record
  let progress = await ProgressTracking.findOne({ student: req.user._id, course: courseId });

  if (!progress) {
    progress = await ProgressTracking.create({ student: req.user._id, course: courseId });
  }

  // Check if already completed
  const alreadyDone = progress.completedLessons.some(l => l.lesson.toString() === lessonId);

  if (!alreadyDone) {
    progress.completedLessons.push({ lesson: lessonId, completedAt: new Date(), timeSpent, lastPosition });
  } else {
    // Update time spent
    const idx = progress.completedLessons.findIndex(l => l.lesson.toString() === lessonId);
    progress.completedLessons[idx].timeSpent     += timeSpent;
    progress.completedLessons[idx].lastPosition   = lastPosition;
  }

  // Recalculate overall progress
  const course        = await Course.findById(courseId).lean();
  const totalLessons  = course?.totalLessons || 1;
  const completedCount = progress.completedLessons.length;
  progress.courseProgressPercentage = calcPercentage(completedCount, totalLessons);
  progress.totalTimeSpent += Math.round(timeSpent / 60);  // convert to minutes
  progress.lastActivity    = new Date();

  // Check course completion
  if (completedCount >= totalLessons && !progress.isCompleted) {
    progress.isCompleted = true;
    progress.completedAt = new Date();

    // Issue certificate
    const cert = await issueCertificate(req.user._id, courseId, course);
    progress.certificate = cert._id;

    notifyUser(req.user._id, 'course-completed', {
      courseId, courseTitle: course.title, certificateId: cert._id
    });

    // Check for badges
    await checkAndAwardBadge(req.user._id, 'course_complete', { courseId });
  }

  await progress.save();

  // Bust cache
  await cache.del(cache.keys.user(req.user._id));

  res.status(200).json({
    status: 'success',
    data: {
      progress:   progress.courseProgressPercentage,
      completed:  completedCount,
      total:      totalLessons,
      isCompleted: progress.isCompleted,
      certificate: progress.certificate
    }
  });
});

exports.getCourseProgress = catchAsync(async (req, res, next) => {
  const progress = await ProgressTracking.findOne({
    student: req.user._id,
    course:  req.params.courseId
  })
  .populate('completedLessons.lesson', 'title order type duration')
  .lean();

  res.status(200).json({ status: 'success', data: progress || { courseProgressPercentage: 0 } });
});

exports.getMyCoursesProgress = catchAsync(async (req, res, next) => {
  const allProgress = await ProgressTracking.find({ student: req.user._id })
    .populate('course', 'title slug thumbnail totalLessons')
    .lean();

  res.status(200).json({ status: 'success', results: allProgress.length, data: allProgress });
});

// Video resume position
exports.saveVideoPosition = catchAsync(async (req, res, next) => {
  const { lessonId, position } = req.body;

  await ProgressTracking.findOneAndUpdate(
    { student: req.user._id, course: req.params.courseId, 'completedLessons.lesson': lessonId },
    { $set: { 'completedLessons.$.lastPosition': position } }
  );

  res.status(200).json({ status: 'success' });
});

// ══════════════════════════════════════════════════════════════
// PERFORMANCE ANALYTICS
// ══════════════════════════════════════════════════════════════

exports.getMyAnalytics = catchAsync(async (req, res, next) => {
  const { examGoalId } = req.params;

  const analytics = await cache.remember(
    cache.keys.analytics(req.user._id, examGoalId),
    async () => PerformanceAnalytics.findOne({
      student:  req.user._id,
      examGoal: examGoalId
    })
    .populate('examGoal', 'name slug icon')
    .lean(),
    cache.TTL.MEDIUM
  );

  if (!analytics) {
    return res.status(200).json({
      status: 'success',
      data:   { message: 'No analytics yet. Attempt a mock test to get started.' }
    });
  }

  // Sort subjects by accuracy ascending (weakest first)
  analytics.subjectWise?.sort((a, b) => a.accuracy - b.accuracy);

  res.status(200).json({ status: 'success', data: analytics });
});

exports.getAllMyAnalytics = catchAsync(async (req, res, next) => {
  const analytics = await PerformanceAnalytics.find({ student: req.user._id })
    .populate('examGoal', 'name slug icon examBody')
    .lean();

  res.status(200).json({ status: 'success', results: analytics.length, data: analytics });
});

// ══════════════════════════════════════════════════════════════
// STUDY PLAN
// ══════════════════════════════════════════════════════════════

exports.getStudyPlan = catchAsync(async (req, res, next) => {
  const plan = await StudyPlan.findOne({
    student:  req.user._id,
    examGoal: req.params.examGoalId,
    status:   'active'
  })
  .populate('examGoal', 'name icon')
  .lean();

  res.status(200).json({ status: 'success', data: plan });
});

exports.createStudyPlan = catchAsync(async (req, res, next) => {
  // Deactivate any existing plan for this exam goal
  await StudyPlan.updateMany(
    { student: req.user._id, examGoal: req.body.examGoal, status: 'active' },
    { status: 'abandoned' }
  );

  const totalDays = Math.ceil(
    (new Date(req.body.endDate) - new Date(req.body.startDate)) / (1000 * 60 * 60 * 24)
  );

  const plan = await StudyPlan.create({
    ...req.body,
    student:          req.user._id,
    totalDaysPlanned: totalDays
  });

  res.status(201).json({ status: 'success', data: plan });
});

exports.markDayComplete = catchAsync(async (req, res, next) => {
  const { planId, dayIndex } = req.params;

  const plan = await StudyPlan.findOne({ _id: planId, student: req.user._id });
  if (!plan) return next(new AppError('Study plan not found.', 404));

  if (plan.dailyTargets[dayIndex]) {
    plan.dailyTargets[dayIndex].isComplete   = true;
    plan.dailyTargets[dayIndex].actualDuration = req.body.actualDuration || 0;
    plan.completedDays = plan.dailyTargets.filter(d => d.isComplete).length;
    plan.overallProgress = calcPercentage(plan.completedDays, plan.totalDaysPlanned);

    if (plan.completedDays >= plan.totalDaysPlanned) plan.status = 'completed';
    await plan.save();
  }

  res.status(200).json({ status: 'success', data: plan });
});

exports.updateStudyPlanStatus = catchAsync(async (req, res, next) => {
  const plan = await StudyPlan.findOneAndUpdate(
    { _id: req.params.planId, student: req.user._id },
    { status: req.body.status },
    { new: true }
  );
  if (!plan) return next(new AppError('Study plan not found.', 404));
  res.status(200).json({ status: 'success', data: plan });
});

// ══════════════════════════════════════════════════════════════
// DAILY PRACTICE
// ══════════════════════════════════════════════════════════════

exports.getTodaysPractice = catchAsync(async (req, res, next) => {
  const { examGoalId } = req.params;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cacheKey = cache.keys.dailyPractice(examGoalId, today.toISOString().slice(0, 10));

  const practice = await cache.remember(cacheKey, async () => {
    return await DailyPractice.findOne({
      examGoal:    examGoalId,
      date:        { $gte: today },
      isPublished: true
    })
    .populate('questions', 'question options marks negativeMarks sectionName')
    .lean();
  }, cache.TTL.DAY);

  if (!practice) {
    return res.status(200).json({ status: 'success', data: null, message: "No practice available for today." });
  }

  // Check if already attempted today
  const attempted = await DailyPracticeAttempt.findOne({
    dailyPractice: practice._id,
    student:       req.user._id
  }).lean();

  res.status(200).json({ status: 'success', data: { ...practice, isAttempted: !!attempted } });
});

exports.submitDailyPractice = catchAsync(async (req, res, next) => {
  const { practiceId } = req.params;

  const alreadyAttempted = await DailyPracticeAttempt.findOne({
    dailyPractice: practiceId, student: req.user._id
  }).lean();

  if (alreadyAttempted) {
    return next(new AppError('You have already attempted today\'s practice.', 409, 'ALREADY_ATTEMPTED'));
  }

  const practice = await DailyPractice.findById(practiceId).populate('questions').lean();
  if (!practice) return next(new AppError('Daily practice not found.', 404));

  const qMap = {};
  practice.questions.forEach(q => { qMap[q._id.toString()] = q; });

  let score = 0;
  const scoredAnswers = req.body.answers.map(ans => {
    const q          = qMap[ans.questionId];
    const isCorrect  = q?.options[ans.selectedOptionIndex]?.isCorrect === true;
    const marks      = isCorrect ? (q.marks || 1) : 0;
    score += marks;
    return { questionId: ans.questionId, selectedOptionIndex: ans.selectedOptionIndex, isCorrect, marksObtained: marks };
  });

  const percentage = calcPercentage(score, practice.totalQuestions);

  const attempt = await DailyPracticeAttempt.create({
    dailyPractice: practiceId,
    student:       req.user._id,
    answers:       scoredAnswers,
    score,
    percentage,
    timeTaken:     req.body.timeTaken,
    completedAt:   new Date()
  });

  // Update aggregate
  await DailyPractice.findByIdAndUpdate(practiceId, { $inc: { totalAttempts: 1 } });

  // Check streak badge
  await checkAndAwardBadge(req.user._id, 'dpq_streak', {});

  res.status(201).json({ status: 'success', data: { attempt, score, percentage } });
});

// ══════════════════════════════════════════════════════════════
// CERTIFICATES
// ══════════════════════════════════════════════════════════════

exports.getMyCertificates = catchAsync(async (req, res, next) => {
  const certs = await Certificate.find({ student: req.user._id, isValid: true })
    .populate('course', 'title thumbnail')
    .lean();
  res.status(200).json({ status: 'success', results: certs.length, data: certs });
});

exports.getCertificate = catchAsync(async (req, res, next) => {
  const cert = await Certificate.findOne({
    certificateNumber: req.params.certNumber
  })
  .populate('course',    'title')
  .populate('student',   'firstName lastName')
  .populate('instructor','firstName lastName')
  .lean();

  if (!cert) return next(new AppError('Certificate not found.', 404));
  res.status(200).json({ status: 'success', data: cert });
});

// ══════════════════════════════════════════════════════════════
// STUDENT NOTES
// ══════════════════════════════════════════════════════════════

exports.getMyNotes = catchAsync(async (req, res, next) => {
  const { StudentNote } = require('../models');
  const notes = await StudentNote.find({
    student:   req.user._id,
    lesson:    req.params.lessonId,
    isDeleted: false
  }).sort('videoTimestamp').lean();

  res.status(200).json({ status: 'success', results: notes.length, data: notes });
});

exports.saveNote = catchAsync(async (req, res, next) => {
  const { StudentNote } = require('../models');
  const note = await StudentNote.create({
    student:        req.user._id,
    course:         req.params.courseId,
    lesson:         req.params.lessonId,
    content:        req.body.content,
    videoTimestamp: req.body.videoTimestamp || 0
  });
  res.status(201).json({ status: 'success', data: note });
});

exports.updateNote = catchAsync(async (req, res, next) => {
  const { StudentNote } = require('../models');
  const note = await StudentNote.findOneAndUpdate(
    { _id: req.params.noteId, student: req.user._id },
    { content: req.body.content },
    { new: true }
  );
  if (!note) return next(new AppError('Note not found.', 404));
  res.status(200).json({ status: 'success', data: note });
});

exports.deleteNote = catchAsync(async (req, res, next) => {
  const { StudentNote } = require('../models');
  await StudentNote.findOneAndUpdate(
    { _id: req.params.noteId, student: req.user._id },
    { isDeleted: true }
  );
  res.status(204).json({ status: 'success', data: null });
});

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

async function issueCertificate(studentId, courseId, course) {
  const user  = await require('../models').User.findById(studentId).lean();
  const progress = await ProgressTracking.findOne({ student: studentId, course: courseId }).lean();

  const cert = await Certificate.create({
    student:           studentId,
    course:            courseId,
    certificateNumber: generateCertificateNumber(),
    studentName:       `${user.firstName} ${user.lastName}`,
    courseName:        course.title,
    instructorName:    '',
    instructor:        course.primaryInstructor,
    issueDate:         new Date(),
    percentage:        progress?.courseProgressPercentage || 100,
    grade:             require('../utils/helpers').getGrade(progress?.courseProgressPercentage || 100),
    isValid:           true
  });

  logger.info('Certificate issued', { certId: cert._id, studentId, courseId });
  return cert;
}

async function checkAndAwardBadge(studentId, criteria, context) {
  try {
    const badge = await Badge.findOne({ criteria, isActive: true }).lean();
    if (!badge) return;

    const alreadyHas = await UserBadge.findOne({ student: studentId, badge: badge._id }).lean();
    if (alreadyHas) return;

    await UserBadge.create({ student: studentId, badge: badge._id, context });

    await StudentProfile.findOneAndUpdate(
      { user: studentId },
      { $inc: { totalPoints: badge.points } }
    );

    notifyUser(studentId, 'badge-earned', {
      badgeId:   badge._id,
      name:      badge.name,
      iconUrl:   badge.iconUrl,
      points:    badge.points
    });
  } catch (err) {
    logger.warn('Badge check failed', { error: err.message });
  }
}