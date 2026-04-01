'use strict';

// routes/examGoalRoutes.js
// ============================================================
// EXAM GOAL ROUTES
// GET    /api/v1/exam-goals              (public)
// GET    /api/v1/exam-goals/:id          (public)
// GET    /api/v1/exam-goals/slug/:slug   (public)
// POST   /api/v1/exam-goals              (admin)
// PATCH  /api/v1/exam-goals/:id          (admin)
// DELETE /api/v1/exam-goals/:id          (admin)
// POST   /api/v1/exam-goals/:id/syllabus (admin)
// PATCH  /api/v1/exam-goals/:id/syllabus/:subjectId  (admin)
// DELETE /api/v1/exam-goals/:id/syllabus/:subjectId  (admin)
// ============================================================

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/examGoalController');
const { authenticate, restrictTo } = require('../utils/permissions');
const { validate, schemas }        = require('../utils/validators');

// ── PUBLIC ────────────────────────────────────────────────────
router.get('/',             ctrl.getAllExamGoals);
router.get('/slug/:slug',   ctrl.getExamGoal);
router.get('/:id',          ctrl.getExamGoal);

// ── ADMIN ONLY ────────────────────────────────────────────────
router.use(authenticate, restrictTo('admin'));
router.post('/',   validate(schemas.createExamGoal), ctrl.createExamGoal);
router.patch('/:id',  ctrl.updateExamGoal);
router.delete('/:id', ctrl.deleteExamGoal);

// Syllabus management
router.post(  '/:id/syllabus',                    ctrl.addSyllabusSubject);
router.patch( '/:id/syllabus/:subjectId',         ctrl.updateSyllabusSubject);
router.delete('/:id/syllabus/:subjectId',         ctrl.removeSyllabusSubject);

module.exports = router;


// ============================================================
// CATEGORY ROUTES — mounted at /api/v1/categories
// ============================================================
const catRouter  = express.Router();
const catCtrl    = require('../controllers/categoryController');

// Public
catRouter.get('/tree', catCtrl.getCategoryTree);
catRouter.get('/',     catCtrl.getAllCategories);
catRouter.get('/:slug', catCtrl.getCategory);

// Admin only
catRouter.use(authenticate, restrictTo('admin'));
catRouter.post('/',     catCtrl.createCategory);
catRouter.patch('/:id', catCtrl.updateCategory);
catRouter.delete('/:id', catCtrl.deleteCategory);

module.exports.categoryRouter = catRouter;