'use strict';

// routes/adminRoutes.js
// ============================================================
// ADMIN ROUTES — All require admin role
// GET    /api/v1/admin/dashboard
// GET    /api/v1/admin/dashboard/revenue
// GET    /api/v1/admin/approvals
// PATCH  /api/v1/admin/instructors/:userId/approve
// GET    /api/v1/admin/users
// GET    /api/v1/admin/users/:id
// PATCH  /api/v1/admin/users/:id
// PATCH  /api/v1/admin/users/:id/activate
// GET    /api/v1/admin/batches
// GET    /api/v1/admin/courses
// GET    /api/v1/admin/mock-tests
// GET    /api/v1/admin/payments
// GET    /api/v1/admin/enrollments
// GET    /api/v1/admin/audit-logs
// GET    /api/v1/admin/settings
// PATCH  /api/v1/admin/settings
// GET    /api/v1/admin/master-data
// POST   /api/v1/admin/master-data
// PATCH  /api/v1/admin/master-data/:id
// DELETE /api/v1/admin/master-data/:id
// ============================================================

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/adminController');
const { authenticate, restrictTo } = require('../utils/permissions');
const { adminLimiter }             = require('../utils/rateLimiter');

// ALL admin routes require auth + admin role
router.use(authenticate, restrictTo('admin'), adminLimiter);

// Dashboard
router.get('/dashboard',         ctrl.getDashboardStats);
router.get('/dashboard/revenue', ctrl.getRevenueChart);

// Approvals
router.get('/approvals',                        ctrl.getPendingApprovals);
router.patch('/instructors/:userId/approve',    ctrl.approveInstructor);

// Users
router.get('/users',             ctrl.getAllUsers);
router.get('/users/:id',         ctrl.getUser);
router.patch('/users/:id',       ctrl.updateUser);
router.patch('/users/:id/activate', ctrl.deactivateUser);

// Content
router.get('/batches',     ctrl.getAllBatchesAdmin);
router.get('/courses',     ctrl.getAllCoursesAdmin);
router.get('/mock-tests',  ctrl.getAllMockTestsAdmin);
router.get('/payments',    ctrl.getAllPaymentsAdmin);
router.get('/enrollments', ctrl.getAllEnrollmentsAdmin);

// Audit logs
router.get('/audit-logs',  ctrl.getAuditLogs);

// System settings
router.get('/settings',    ctrl.getSystemSettings);
router.patch('/settings',  ctrl.updateSystemSetting);

// Master data
router.get('/master-data',     ctrl.getMasterData);
router.post('/master-data',    ctrl.createMasterData);
router.patch('/master-data/:id',  ctrl.updateMasterData);
router.delete('/master-data/:id', ctrl.deleteMasterData);

module.exports = router;