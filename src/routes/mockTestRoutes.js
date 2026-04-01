'use strict';

// routes/mockTestRoutes.js
// ============================================================
// MOCK TEST ROUTES
// GET    /api/v1/mock-tests                        (public)
// GET    /api/v1/mock-tests/:id                    (public)
// GET    /api/v1/mock-tests/my                     (instructor)
// POST   /api/v1/mock-tests                        (instructor)
// PATCH  /api/v1/mock-tests/:id                    (instructor)
// DELETE /api/v1/mock-tests/:id                    (instructor)
// PATCH  /api/v1/mock-tests/:id/publish            (instructor)
// PATCH  /api/v1/mock-tests/:id/approve            (admin)
// GET    /api/v1/mock-tests/:id/questions          (enrolled/instructor)
// POST   /api/v1/mock-tests/:id/questions          (instructor)
// POST   /api/v1/mock-tests/:id/questions/bulk     (instructor)
// PATCH  /api/v1/mock-tests/:id/questions/:questionId (instructor)
// DELETE /api/v1/mock-tests/:id/questions/:questionId (instructor)
// POST   /api/v1/mock-tests/:id/attempts/start     (enrolled student)
// POST   /api/v1/mock-tests/:id/attempts/:attemptId/submit (student)
// GET    /api/v1/mock-tests/:id/attempts/my        (student)
// GET    /api/v1/mock-tests/:id/attempts/:attemptId/result (student)
// GET    /api/v1/mock-tests/:id/leaderboard        (enrolled)
// ============================================================

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/mockTestController');
const {
  authenticate, restrictTo, checkEnrollment, requireInstructorApproved
} = require('../utils/permissions');
const { testSubmitLimiter }  = require('../utils/rateLimiter');
const { validate, schemas }  = require('../utils/validators');

// ── PUBLIC ────────────────────────────────────────────────────
router.get('/',    ctrl.getAllMockTests);
router.get('/:id', ctrl.getMockTest);

// ── PROTECTED ─────────────────────────────────────────────────
router.use(authenticate);

// Instructor - my tests
router.get('/my/tests',
  restrictTo('instructor', 'admin'),
  ctrl.getMyMockTests
);

// CRUD (instructor)
router.post('/',
  restrictTo('instructor', 'admin'),
  requireInstructorApproved,
  validate(schemas.createMockTest),
  ctrl.createMockTest
);
router.patch('/:id',
  restrictTo('instructor', 'admin'),
  ctrl.updateMockTest
);
router.delete('/:id',
  restrictTo('instructor', 'admin'),
  ctrl.deleteMockTest
);
router.patch('/:id/publish',
  restrictTo('instructor', 'admin'),
  ctrl.publishMockTest
);
router.patch('/:id/approve',
  restrictTo('admin'),
  ctrl.approveMockTest
);

// ── QUESTIONS ─────────────────────────────────────────────────
router.get('/:id/questions',
  ctrl.getQuestions
);
router.post('/:id/questions',
  restrictTo('instructor', 'admin'),
  validate(schemas.createMockTestQuestion),
  ctrl.addQuestion
);
router.post('/:id/questions/bulk',
  restrictTo('instructor', 'admin'),
  ctrl.bulkAddQuestions
);
router.patch('/:id/questions/:questionId',
  restrictTo('instructor', 'admin'),
  ctrl.updateQuestion
);
router.delete('/:id/questions/:questionId',
  restrictTo('instructor', 'admin'),
  ctrl.deleteQuestion
);

// ── ATTEMPTS (student) ────────────────────────────────────────
router.post('/:id/attempts/start',
  restrictTo('student'),
  ctrl.startAttempt
);
router.post('/:id/attempts/:attemptId/submit',
  restrictTo('student'),
  testSubmitLimiter,
  validate(schemas.submitMockTest),
  ctrl.submitAttempt
);
router.get('/:id/attempts/my',
  ctrl.getMyAttempts
);
router.get('/:id/attempts/:attemptId/result',
  ctrl.getAttemptResult
);

// ── LEADERBOARD ───────────────────────────────────────────────
router.get('/:id/leaderboard', ctrl.getLeaderboard);

module.exports = router;


// ============================================================
// TEST SERIES ROUTES — mounted at /api/v1/test-series
// ============================================================
const tsRouter  = express.Router();
const tsCtrl    = require('../controllers/testSeriesController');

tsRouter.get('/',    tsCtrl.getAllTestSeries);
tsRouter.get('/:id', tsCtrl.getTestSeries);

tsRouter.use(authenticate);

tsRouter.post('/',
  restrictTo('instructor', 'admin'),
  requireInstructorApproved,
  tsCtrl.createTestSeries
);
tsRouter.patch('/:id',
  restrictTo('instructor', 'admin'),
  tsCtrl.updateTestSeries
);
tsRouter.delete('/:id',
  restrictTo('instructor', 'admin'),
  tsCtrl.deleteTestSeries
);
tsRouter.patch('/:id/publish',
  restrictTo('instructor', 'admin'),
  tsCtrl.publishTestSeries
);
tsRouter.patch('/:id/approve',
  restrictTo('admin'),
  tsCtrl.approveTestSeries
);
tsRouter.post('/:id/tests',
  restrictTo('instructor', 'admin'),
  tsCtrl.addTestToSeries
);
tsRouter.delete('/:id/tests/:testId',
  restrictTo('instructor', 'admin'),
  tsCtrl.removeTestFromSeries
);

module.exports.testSeriesRouter = tsRouter;


// ============================================================
// DAILY PRACTICE ROUTES — mounted at /api/v1/daily-practice
// ============================================================
const dpRouter  = express.Router();
const progCtrl  = require('../controllers/progressController');

dpRouter.use(authenticate);

// Student routes
dpRouter.get('/today/:examGoalId',  progCtrl.getTodaysPractice);
dpRouter.post('/:practiceId/submit', restrictTo('student'), testSubmitLimiter, progCtrl.submitDailyPractice);

// Admin / instructor routes
dpRouter.use(restrictTo('admin', 'instructor'));
dpRouter.get('/',     tsCtrl.getAllDailyPractice);
dpRouter.post('/',    tsCtrl.createDailyPractice);
dpRouter.patch('/:id', tsCtrl.updateDailyPractice);
dpRouter.delete('/:id', tsCtrl.deleteDailyPractice);
dpRouter.patch('/:id/publish', tsCtrl.publishDailyPractice);

module.exports.dailyPracticeRouter = dpRouter;