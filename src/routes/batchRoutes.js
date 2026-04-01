'use strict';

// routes/batchRoutes.js
// ============================================================
// BATCH ROUTES
// GET    /api/v1/batches                          (public)
// GET    /api/v1/batches/:id                      (public + auth optional)
// GET    /api/v1/batches/my                       (instructor)
// POST   /api/v1/batches                          (instructor)
// PATCH  /api/v1/batches/:id                      (instructor/owner)
// DELETE /api/v1/batches/:id                      (instructor/owner)
// PATCH  /api/v1/batches/:id/publish              (instructor)
// PATCH  /api/v1/batches/:id/approve              (admin)
// POST   /api/v1/batches/:id/courses              (instructor)
// POST   /api/v1/batches/:id/test-series          (instructor)
// GET    /api/v1/batches/:id/students             (instructor/admin)
// PATCH  /api/v1/batches/:id/students/:enrollmentId/revoke  (admin)
// ============================================================

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/batchController');
const {
  authenticate, restrictTo, optionalAuthenticate,
  requireInstructorApproved
} = require('../utils/permissions');
const { validate, schemas } = require('../utils/validators');

// ── PUBLIC ────────────────────────────────────────────────────
router.get('/', ctrl.getAllBatches);
router.get('/:id', optionalAuthenticate, ctrl.getBatch);

// ── PROTECTED ─────────────────────────────────────────────────
router.use(authenticate);

// Instructor
router.get( '/my/batches', restrictTo('instructor', 'admin'), ctrl.getMyBatches);
router.post('/',
  restrictTo('instructor', 'admin'),
  requireInstructorApproved,
  validate(schemas.createBatch),
  ctrl.createBatch
);
router.patch('/:id',
  restrictTo('instructor', 'admin'),
  ctrl.updateBatch
);
router.delete('/:id',
  restrictTo('instructor', 'admin'),
  ctrl.deleteBatch
);
router.patch('/:id/publish',
  restrictTo('instructor', 'admin'),
  ctrl.publishBatch
);

// Batch content
router.post('/:id/courses',
  restrictTo('instructor', 'admin'),
  ctrl.addCourseToBatch
);
router.post('/:id/test-series',
  restrictTo('instructor', 'admin'),
  ctrl.addTestSeriesToBatch
);

// Students
router.get('/:id/students',
  restrictTo('instructor', 'admin'),
  ctrl.getEnrolledStudents
);
router.patch('/:id/students/:enrollmentId/revoke',
  restrictTo('admin'),
  ctrl.revokeEnrollment
);

// Admin
router.patch('/:id/approve',
  restrictTo('admin'),
  ctrl.approveBatch
);

module.exports = router;