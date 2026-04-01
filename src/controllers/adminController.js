'use strict';

// controllers/adminController.js
// ============================================================
// ADMIN — Dashboard stats, approvals, platform management
// ============================================================

const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const factory    = require('../utils/handlerFactory');
const cache      = require('../utils/cache');
const logger     = require('../utils/logger');
const {
  User, Batch, Course, MockTest, TestSeries,
  Payment, Enrollment, InstructorProfile,
  ExamGoal, Post, Review, SystemSettings,
  ActivityLog, AuditLog
} = require('../models');

// ── DASHBOARD STATS ───────────────────────────────────────────
exports.getDashboardStats = catchAsync(async (req, res, next) => {
  const CACHE_KEY = 'admin:dashboard:stats';

  const stats = await cache.remember(CACHE_KEY, async () => {
    const now         = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth    = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalUsers, newUsersThisMonth,
      totalStudents, totalInstructors,
      totalBatches, pendingBatches,
      totalCourses, pendingCourses,
      totalMockTests, pendingMockTests,
      totalRevenue, revenueThisMonth,
      totalEnrollments, enrollmentsThisMonth,
      totalPosts, pendingPosts
    ] = await Promise.all([
      User.countDocuments({ isDeleted: false }),
      User.countDocuments({ isDeleted: false, createdAt: { $gte: startOfMonth } }),
      User.countDocuments({ role: 'student', isDeleted: false }),
      User.countDocuments({ role: 'instructor', isDeleted: false }),
      Batch.countDocuments({ isDeleted: false }),
      Batch.countDocuments({ isPublished: true, isApproved: false, isDeleted: false }),
      Course.countDocuments({ isDeleted: false }),
      Course.countDocuments({ isPublished: true, isApproved: false, isDeleted: false }),
      MockTest.countDocuments({ isDeleted: false }),
      MockTest.countDocuments({ isPublished: true, isApproved: false, isDeleted: false }),
      Payment.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Payment.aggregate([{ $match: { status: 'completed', createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Enrollment.countDocuments({ isActive: true }),
      Enrollment.countDocuments({ isActive: true, enrolledAt: { $gte: startOfMonth } }),
      Post.countDocuments({ isDeleted: false }),
      Post.countDocuments({ status: 'under_review', isDeleted: false })
    ]);

    return {
      users: {
        total:       totalUsers,
        newThisMonth: newUsersThisMonth,
        students:    totalStudents,
        instructors: totalInstructors
      },
      content: {
        batches:        totalBatches,
        pendingBatches,
        courses:        totalCourses,
        pendingCourses,
        mockTests:      totalMockTests,
        pendingMockTests,
        posts:          totalPosts,
        pendingPosts
      },
      revenue: {
        total:       totalRevenue[0]?.total || 0,
        thisMonth:   revenueThisMonth[0]?.total || 0
      },
      enrollments: {
        total:       totalEnrollments,
        thisMonth:   enrollmentsThisMonth
      }
    };
  }, cache.TTL.SHORT);  // 1 min cache for dashboard

  res.status(200).json({ status: 'success', data: stats });
});

// ── REVENUE CHART DATA ────────────────────────────────────────
exports.getRevenueChart = catchAsync(async (req, res, next) => {
  const months = parseInt(req.query.months) || 6;
  const start  = new Date();
  start.setMonth(start.getMonth() - months);

  const data = await Payment.aggregate([
    { $match: { status: 'completed', createdAt: { $gte: start } } },
    {
      $group: {
        _id:     { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        revenue: { $sum: '$amount' },
        count:   { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  res.status(200).json({ status: 'success', data });
});

// ── PENDING APPROVALS ─────────────────────────────────────────
exports.getPendingApprovals = catchAsync(async (req, res, next) => {
  const [batches, courses, mockTests, instructors] = await Promise.all([
    Batch.find({ isPublished: true, isApproved: false, isDeleted: false })
      .populate('primaryInstructor', 'firstName lastName email')
      .populate('examGoal', 'name')
      .sort('-createdAt').lean(),
    Course.find({ isPublished: true, isApproved: false, isDeleted: false })
      .populate('primaryInstructor', 'firstName lastName email')
      .sort('-createdAt').lean(),
    MockTest.find({ isPublished: true, isApproved: false, isDeleted: false })
      .populate('instructor', 'firstName lastName email')
      .sort('-createdAt').lean(),
    InstructorProfile.find({ isApproved: false })
      .populate('user', 'firstName lastName email createdAt')
      .sort('-createdAt').lean()
  ]);

  res.status(200).json({
    status: 'success',
    data: { batches, courses, mockTests, instructors }
  });
});

// ── INSTRUCTOR APPROVAL ───────────────────────────────────────
exports.approveInstructor = catchAsync(async (req, res, next) => {
  const { approve = true, reason } = req.body;

  const profile = await InstructorProfile.findOneAndUpdate(
    { user: req.params.userId },
    { isApproved: approve, approvedBy: req.user._id, approvedAt: approve ? new Date() : null },
    { new: true }
  ).populate('user', 'firstName lastName email');

  if (!profile) return next(new AppError('Instructor profile not found.', 404));

  const { notifyUser } = require('../utils/socket');
  notifyUser(req.params.userId, 'instructor-approval', { approved: approve, reason });

  logger.info('Instructor approval', { userId: req.params.userId, approved: approve, by: req.user._id });
  res.status(200).json({ status: 'success', data: profile });
});

// ── USER MANAGEMENT ───────────────────────────────────────────
exports.getAllUsers = factory.getAll(User, { searchFields: ['firstName', 'lastName', 'email'] });
exports.getUser     = factory.getOne(User);
exports.updateUser  = factory.updateOne(User);

exports.deactivateUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: req.body.activate === true },
    { new: true }
  );
  if (!user) return next(new AppError('User not found.', 404));
  res.status(200).json({ status: 'success', data: user });
});

// ── CONTENT MANAGEMENT ────────────────────────────────────────
exports.getAllBatchesAdmin    = factory.getAll(Batch,    { searchFields: ['name'] });
exports.getAllCoursesAdmin    = factory.getAll(Course,   { searchFields: ['title'] });
exports.getAllMockTestsAdmin  = factory.getAll(MockTest, { searchFields: ['title'] });
exports.getAllPaymentsAdmin   = factory.getAll(Payment);
exports.getAllEnrollmentsAdmin = factory.getAll(Enrollment);

// ── SYSTEM SETTINGS ───────────────────────────────────────────
exports.getSystemSettings = catchAsync(async (req, res, next) => {
  const settings = await SystemSettings.find({}).lean();
  // Return as key-value object
  const map = {};
  settings.forEach(s => { map[s.key] = s.value; });
  res.status(200).json({ status: 'success', data: map });
});

exports.updateSystemSetting = catchAsync(async (req, res, next) => {
  const { key, value, description } = req.body;

  const setting = await SystemSettings.findOneAndUpdate(
    { key },
    { value, description, updatedBy: req.user._id },
    { new: true, upsert: true, runValidators: true }
  );

  await cache.del(cache.keys.systemSettings());
  res.status(200).json({ status: 'success', data: setting });
});

// ── AUDIT LOGS ────────────────────────────────────────────────
exports.getAuditLogs = catchAsync(async (req, res, next) => {
  const page  = Math.max(parseInt(req.query.page)  || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  const filter = {};
  if (req.query.userId)   filter.user     = req.query.userId;
  if (req.query.action)   filter.action   = req.query.action;
  if (req.query.resource) filter.resource = req.query.resource;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('user', 'firstName lastName email role')
      .sort('-timestamp')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter)
  ]);

  res.status(200).json({
    status:  'success',
    results: logs.length,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data:    logs
  });
});

// ── MASTER DATA MANAGEMENT ────────────────────────────────────
exports.getMasterData   = factory.getAll(require('../models').Master, { searchFields: ['name'] });
exports.createMasterData = factory.createOne(require('../models').Master);
exports.updateMasterData = factory.updateOne(require('../models').Master);
exports.deleteMasterData = factory.deleteOne(require('../models').Master);