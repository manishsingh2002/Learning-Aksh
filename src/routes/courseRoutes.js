'use strict';

// routes/courseRoutes.js
// ============================================================
// COURSE ROUTES
// GET    /api/v1/courses                          (public)
// GET    /api/v1/courses/:id                      (public)
// GET    /api/v1/courses/slug/:slug               (public)
// GET    /api/v1/courses/my                       (instructor)
// POST   /api/v1/courses                          (instructor)
// PATCH  /api/v1/courses/:id                      (instructor/owner)
// PATCH  /api/v1/courses/:id/thumbnail            (instructor)
// PATCH  /api/v1/courses/:id/publish              (instructor)
// PATCH  /api/v1/courses/:id/approve              (admin)
// DELETE /api/v1/courses/:id                      (instructor)
//
// SECTIONS
// GET    /api/v1/courses/:courseId/sections
// POST   /api/v1/courses/:courseId/sections
// PATCH  /api/v1/courses/:courseId/sections/:sectionId
// DELETE /api/v1/courses/:courseId/sections/:sectionId
//
// LESSONS
// GET    /api/v1/courses/:courseId/sections/:sectionId/lessons
// POST   /api/v1/courses/:courseId/sections/:sectionId/lessons
// GET    /api/v1/courses/:courseId/sections/:sectionId/lessons/:lessonId
// PATCH  /api/v1/courses/:courseId/sections/:sectionId/lessons/:lessonId
// DELETE /api/v1/courses/:courseId/sections/:sectionId/lessons/:lessonId
// PATCH  /api/v1/courses/:courseId/sections/:sectionId/lessons/:lessonId/video
// PATCH  /api/v1/courses/:courseId/sections/:sectionId/reorder
// ============================================================

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/courseController');
const {
  authenticate, restrictTo, optionalAuthenticate,
  checkEnrollment, requireInstructorApproved
} = require('../utils/permissions');
const { uploadLimiter }     = require('../utils/rateLimiter');
const { validate, schemas } = require('../utils/validators');

// ── PUBLIC ────────────────────────────────────────────────────
router.get('/',            ctrl.getAllCourses);
router.get('/slug/:slug',  ctrl.getCourse);
router.get('/:id',         optionalAuthenticate, ctrl.getCourse);

// ── PROTECTED ─────────────────────────────────────────────────
router.use(authenticate);

// Instructor - my courses
router.get('/my/courses',
  restrictTo('instructor', 'admin'),
  ctrl.getMyCoursesAsInstructor
);

// CRUD
router.post('/',
  restrictTo('instructor', 'admin'),
  requireInstructorApproved,
  validate(schemas.createCourse),
  ctrl.createCourse
);
router.patch('/:id',
  restrictTo('instructor', 'admin'),
  ctrl.updateCourse
);
router.patch('/:id/thumbnail',
  restrictTo('instructor', 'admin'),
  uploadLimiter,
  ctrl.uploadCourseThumbnail
);
router.patch('/:id/publish',
  restrictTo('instructor', 'admin'),
  ctrl.publishCourse
);
router.delete('/:id',
  restrictTo('instructor', 'admin'),
  ctrl.deleteCourse
);

// Admin
router.patch('/:id/approve',
  restrictTo('admin'),
  ctrl.approveCourse
);

// ── SECTIONS ──────────────────────────────────────────────────
router.get('/:courseId/sections',
  ctrl.getSections
);
router.post('/:courseId/sections',
  restrictTo('instructor', 'admin'),
  validate(schemas.createSection),
  ctrl.createSection
);
router.patch('/:courseId/sections/:sectionId',
  restrictTo('instructor', 'admin'),
  ctrl.updateSection
);
router.delete('/:courseId/sections/:sectionId',
  restrictTo('instructor', 'admin'),
  ctrl.deleteSection
);

// ── LESSONS ───────────────────────────────────────────────────
router.get('/:courseId/sections/:sectionId/lessons',
  ctrl.getLessons
);
router.post('/:courseId/sections/:sectionId/lessons',
  restrictTo('instructor', 'admin'),
  validate(schemas.createLesson),
  ctrl.createLesson
);
router.get('/:courseId/sections/:sectionId/lessons/:lessonId',
  optionalAuthenticate,
  ctrl.getLesson
);
router.patch('/:courseId/sections/:sectionId/lessons/:lessonId',
  restrictTo('instructor', 'admin'),
  ctrl.updateLesson
);
router.patch('/:courseId/sections/:sectionId/lessons/:lessonId/video',
  restrictTo('instructor', 'admin'),
  uploadLimiter,
  ctrl.uploadLessonVideo
);
router.delete('/:courseId/sections/:sectionId/lessons/:lessonId',
  restrictTo('instructor', 'admin'),
  ctrl.deleteLesson
);
router.patch('/:courseId/sections/:sectionId/reorder',
  restrictTo('instructor', 'admin'),
  ctrl.reorderLessons
);

module.exports = router;