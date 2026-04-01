'use strict';

// routes/dropdownRoutes.js
// ============================================================
// DROPDOWN ROUTES — All public (some admin-only)
// GET /api/v1/dropdowns/all
// GET /api/v1/dropdowns/master/:type
// GET /api/v1/dropdowns/exam-goals
// GET /api/v1/dropdowns/categories
// GET /api/v1/dropdowns/subjects/:examGoalId
// GET /api/v1/dropdowns/batches
// GET /api/v1/dropdowns/instructors      (admin)
// GET /api/v1/dropdowns/languages
// POST /api/v1/dropdowns/cache/invalidate (admin)
// ============================================================

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/dropdownController');
const { authenticate, restrictTo } = require('../utils/permissions');
const { searchLimiter }            = require('../utils/rateLimiter');

router.use(searchLimiter);

// Public dropdown endpoints
router.get('/all',                   ctrl.getAllDropdowns);
router.get('/master/:type',          ctrl.getMasterDropdown);
router.get('/exam-goals',            ctrl.getExamGoalOptions);
router.get('/categories',            ctrl.getCategoryOptions);
router.get('/subjects/:examGoalId',  ctrl.getSubjectOptions);
router.get('/batches',               ctrl.getBatchOptions);
router.get('/languages',             ctrl.getLanguageOptions);

// Admin only
router.get('/instructors',
  authenticate, restrictTo('admin'),
  ctrl.getInstructorOptions
);
router.post('/cache/invalidate',
  authenticate, restrictTo('admin'),
  ctrl.invalidateDropdownCache
);

module.exports = router;