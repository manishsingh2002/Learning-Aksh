'use strict';

// utils/scheduler.js
// ============================================================
// CRON SCHEDULER — node-cron background jobs
// ============================================================
// Jobs:
//   Every 30 min  → Send live class reminders (30 min before)
//   Every 1 min   → Force-submit expired exam attempts
//   Daily 00:05   → Reset/update study streaks
//   Daily 06:00   → Publish scheduled posts
//   Daily 08:00   → Send daily practice question notification
//   Daily 23:55   → Update mock test leaderboards
//   Weekly Sun    → Generate weekly performance digest emails
// ============================================================
// npm install node-cron

const cron   = require('node-cron');
const logger = require('./logger');

// Lazily require services to avoid circular dependencies
const getModels  = () => require('../models');
const getSocket  = () => require('./socket');
const getEmail   = () => require('./email');
const getSMS     = () => require('./sms');
const getCache   = () => require('./cache');

// Track registered jobs for graceful shutdown
const jobs = [];

// ── HELPER ───────────────────────────────────────────────────
const runJob = async (name, fn) => {
  logger.info(`[CRON] Starting: ${name}`);
  const start = Date.now();
  try {
    await fn();
    logger.info(`[CRON] Done: ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    logger.error(`[CRON] Failed: ${name}`, { error: err.message, stack: err.stack });
  }
};

// ── JOB DEFINITIONS ──────────────────────────────────────────

// 1. LIVE CLASS REMINDERS — every 30 minutes
// Finds classes starting in the next 30 minutes and sends email + socket notification
const liveClassReminderJob = async () => {
  const { LiveClass } = getModels();
  const { notifyUser } = getSocket();
  const email = getEmail();

  const now     = new Date();
  const in30min = new Date(now.getTime() + 30 * 60 * 1000);
  const in29min = new Date(now.getTime() + 29 * 60 * 1000);

  const classes = await LiveClass.find({
    scheduledAt:   { $gte: in29min, $lte: in30min },
    status:        'scheduled',
    reminderSent:  false
  }).populate({ path: 'batch', populate: { path: 'enrolledStudents', select: 'email firstName phoneNumber' } });

  for (const liveClass of classes) {
    const students = liveClass.batch?.enrolledStudents || [];
    const timeStr  = new Date(liveClass.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    for (const student of students) {
      // Socket notification
      notifyUser(student._id, 'live-class-reminder', {
        classId:  liveClass._id,
        title:    liveClass.title,
        startsAt: liveClass.scheduledAt,
        joinUrl:  liveClass.streamUrl
      });

      // Email
      email.sendLiveClassReminder(student, liveClass).catch(() => {});
    }

    // Mark reminder as sent
    await LiveClass.findByIdAndUpdate(liveClass._id, { reminderSent: true });
    logger.info(`[CRON] Reminders sent for live class: ${liveClass.title} (${students.length} students)`);
  }
};

// 2. FORCE-SUBMIT EXPIRED EXAMS — every minute
// Finds in-progress attempts where startedAt + duration has passed
const forceSubmitExpiredExamsJob = async () => {
  const { MockTest, MockTestAttempt } = getModels();
  const { forceSubmitExam } = getSocket();

  const now = new Date();

  // Find in-progress attempts
  const expiredAttempts = await MockTestAttempt.find({
    status: { $in: ['started', 'in-progress'] }
  }).populate('mockTest', 'duration').lean();

  for (const attempt of expiredAttempts) {
    const durationMs  = attempt.mockTest.duration * 60 * 1000;
    const expiresAt   = new Date(attempt.startedAt.getTime() + durationMs);

    if (now >= expiresAt) {
      await MockTestAttempt.findByIdAndUpdate(attempt._id, {
        status:      'timed-out',
        completedAt: expiresAt
      });

      // Push to student's exam socket
      forceSubmitExam(attempt._id.toString());
      logger.info(`[CRON] Force-submitted attempt ${attempt._id}`);
    }
  }
};

// 3. STUDY STREAK UPDATE — daily at 00:05
// Resets streak to 0 for students who didn't study yesterday
const updateStudyStreaksJob = async () => {
  const { ActivityLog, StudentProfile } = getModels();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Students who had activity yesterday (studied)
  const activeStudentIds = await ActivityLog.distinct('user', {
    type:      { $in: ['lesson_complete', 'mock_test_attempt', 'dpq_attempt', 'quiz_attempt'] },
    createdAt: { $gte: yesterday, $lt: todayStart }
  });

  // Reset streaks for students who DIDN'T study yesterday
  const result = await StudentProfile.updateMany(
    {
      user:          { $nin: activeStudentIds },
      currentStreak: { $gt: 0 }
    },
    { currentStreak: 0 }
  );

  logger.info(`[CRON] Streaks reset for ${result.modifiedCount} students`);
};

// 4. PUBLISH SCHEDULED POSTS — daily at 06:00
const publishScheduledPostsJob = async () => {
  const { Post } = getModels();
  const now = new Date();

  const result = await Post.updateMany(
    { status: 'scheduled', publishedAt: { $lte: now }, isDeleted: false },
    { status: 'published' }
  );

  if (result.modifiedCount > 0) {
    logger.info(`[CRON] Published ${result.modifiedCount} scheduled posts`);
  }
};

// 5. DAILY PRACTICE NOTIFICATION — daily at 08:00
// Notifies all active students about today's daily practice
const dailyPracticeNotificationJob = async () => {
  const { DailyPractice, Enrollment, StudentProfile } = getModels();
  const { notifyUser } = getSocket();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todaysPractices = await DailyPractice.find({
    date:        { $gte: today },
    isPublished: true
  }).lean();

  if (todaysPractices.length === 0) return;

  // Get all active student IDs
  const activeStudents = await StudentProfile.find({}).distinct('user');

  for (const studentId of activeStudents) {
    for (const dp of todaysPractices) {
      notifyUser(studentId, 'daily-practice-available', {
        practiceId: dp._id,
        subject:    dp.subject,
        questions:  dp.totalQuestions,
        message:    `Today's ${dp.subject} practice is ready! ${dp.totalQuestions} questions.`
      });
    }
  }

  logger.info(`[CRON] Daily practice notifications sent to ${activeStudents.length} students`);
};

// 6. UPDATE LEADERBOARDS — daily at 23:55
// Recalculates rank and percentile for recent mock test attempts
const updateLeaderboardsJob = async () => {
  const { MockTestAttempt } = getModels();
  const cache = getCache();

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get distinct mock tests attempted in the last 24 hours
  const recentTestIds = await MockTestAttempt.distinct('mockTest', {
    status:    'completed',
    createdAt: { $gte: yesterday }
  });

  for (const testId of recentTestIds) {
    // Get all completed attempts for this test, sorted by score
    const attempts = await MockTestAttempt.find({
      mockTest: testId,
      status:   'completed'
    }).sort({ score: -1, timeTaken: 1 }).lean();

    const total = attempts.length;

    // Assign ranks and percentiles
    const bulkOps = attempts.map((attempt, index) => {
      const rank       = index + 1;
      const percentile = parseFloat(((total - rank) / total * 100).toFixed(2));
      return {
        updateOne: {
          filter: { _id: attempt._id },
          update: { $set: { rank, totalStudents: total, percentile } }
        }
      };
    });

    if (bulkOps.length > 0) {
      await MockTestAttempt.bulkWrite(bulkOps, { ordered: false });
      // Invalidate leaderboard cache
      await cache.del(cache.keys.leaderboard(testId.toString()));
    }
  }

  logger.info(`[CRON] Leaderboards updated for ${recentTestIds.length} mock tests`);
};

// 7. WEEKLY PERFORMANCE DIGEST — every Sunday at 09:00
const weeklyDigestJob = async () => {
  const { PerformanceAnalytics, User } = getModels();
  const email = getEmail();

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const analytics = await PerformanceAnalytics.find({
    lastUpdated: { $gte: oneWeekAgo }
  }).populate('student', 'email firstName').lean();

  let emailsSent = 0;
  for (const record of analytics) {
    if (!record.student?.email) continue;
    // Only send if they have some activity
    if (record.totalQuestionsAttempted === 0) continue;

    // Simplified digest — in production, build a richer template
    const subject = `Your weekly progress — ${process.env.APP_NAME}`;
    try {
      await email.send({
        to:      record.student.email,
        subject,
        html: `<p>Hi ${record.student.firstName}, you attempted ${record.totalQuestionsAttempted} questions this week with ${record.overallAccuracy?.toFixed(1)}% accuracy. Keep going!</p>`
      });
      emailsSent++;
    } catch { /* non-fatal */ }
  }

  logger.info(`[CRON] Weekly digest sent to ${emailsSent} students`);
};

// ── REGISTER ALL JOBS ────────────────────────────────────────
const init = () => {
  if (process.env.NODE_ENV === 'test') {
    logger.info('[CRON] Scheduler disabled in test environment');
    return;
  }

  jobs.push(
    cron.schedule('*/30 * * * *',  () => runJob('live-class-reminders',     liveClassReminderJob)),
    cron.schedule('* * * * *',     () => runJob('force-submit-exams',        forceSubmitExpiredExamsJob)),
    cron.schedule('5 0 * * *',     () => runJob('update-study-streaks',      updateStudyStreaksJob)),
    cron.schedule('0 6 * * *',     () => runJob('publish-scheduled-posts',   publishScheduledPostsJob)),
    cron.schedule('0 8 * * *',     () => runJob('daily-practice-notif',      dailyPracticeNotificationJob)),
    cron.schedule('55 23 * * *',   () => runJob('update-leaderboards',       updateLeaderboardsJob)),
    cron.schedule('0 9 * * 0',     () => runJob('weekly-digest',             weeklyDigestJob))
  );

  logger.info(`[CRON] Scheduler started with ${jobs.length} jobs`);
};

// Graceful shutdown
const stop = () => {
  jobs.forEach(job => job.stop());
  logger.info('[CRON] All jobs stopped');
};

module.exports = { init, stop };