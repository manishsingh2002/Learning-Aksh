'use strict';

// routes/liveClassRoutes.js
// ============================================================
// LIVE CLASS ROUTES
// GET    /api/v1/live-classes/batch/:batchId       (enrolled)
// GET    /api/v1/live-classes/:id                  (enrolled)
// POST   /api/v1/live-classes                      (instructor)
// PATCH  /api/v1/live-classes/:id                  (instructor)
// DELETE /api/v1/live-classes/:id                  (instructor)
// PATCH  /api/v1/live-classes/:id/start            (instructor)
// PATCH  /api/v1/live-classes/:id/end              (instructor)
// PATCH  /api/v1/live-classes/:id/cancel           (instructor)
//
// DOUBT SESSIONS
// GET    /api/v1/live-classes/doubt-sessions/:batchId
// POST   /api/v1/live-classes/doubt-sessions
// POST   /api/v1/live-classes/doubt-sessions/:sessionId/questions
// PATCH  /api/v1/live-classes/doubt-sessions/:sessionId/questions/:questionId/upvote
// ============================================================

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/liveClassController');
const {
  authenticate, restrictTo, optionalAuthenticate
} = require('../utils/permissions');
const { validate, schemas } = require('../utils/validators');

router.use(authenticate);

// ── DOUBT SESSIONS ────────────────────────────────────────────
router.get('/doubt-sessions/batch/:batchId',  ctrl.getBatchDoubtSessions);
router.post('/doubt-sessions',
  restrictTo('instructor', 'admin'),
  ctrl.createDoubtSession
);
router.post('/doubt-sessions/:sessionId/questions',
  restrictTo('student'),
  ctrl.submitDoubtQuestion
);
router.patch('/doubt-sessions/:sessionId/questions/:questionId/upvote',
  ctrl.upvoteDoubtQuestion
);

// ── LIVE CLASSES ──────────────────────────────────────────────
router.get('/batch/:batchId', ctrl.getBatchLiveClasses);
router.get('/:id',            ctrl.getLiveClass);

router.post('/',
  restrictTo('instructor', 'admin'),
  validate(schemas.createLiveClass),
  ctrl.createLiveClass
);
router.patch('/:id',
  restrictTo('instructor', 'admin'),
  ctrl.updateLiveClass
);
router.delete('/:id',
  restrictTo('instructor', 'admin'),
  ctrl.deleteLiveClass
);

// Class lifecycle
router.patch('/:id/start',
  restrictTo('instructor', 'admin'),
  ctrl.startLiveClass
);
router.patch('/:id/end',
  restrictTo('instructor', 'admin'),
  ctrl.endLiveClass
);
router.patch('/:id/cancel',
  restrictTo('instructor', 'admin'),
  ctrl.cancelLiveClass
);

module.exports = router;