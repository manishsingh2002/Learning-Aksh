'use strict';

// controllers/notificationController.js
// ============================================================

const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const factory    = require('../utils/handlerFactory');
const { Notification, Announcement } = require('../models');

// ── NOTIFICATIONS ─────────────────────────────────────────────

exports.getMyNotifications = catchAsync(async (req, res, next) => {
  const page  = Math.max(parseInt(req.query.page)  || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const skip  = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ recipient: req.user._id })
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ recipient: req.user._id }),
    Notification.countDocuments({ recipient: req.user._id, isRead: false })
  ]);

  res.status(200).json({
    status: 'success',
    unreadCount,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: notifications
  });
});

exports.markAsRead = catchAsync(async (req, res, next) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { isRead: true, readAt: new Date() }
  );
  res.status(200).json({ status: 'success', message: 'Marked as read.' });
});

exports.markAllAsRead = catchAsync(async (req, res, next) => {
  await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  res.status(200).json({ status: 'success', message: 'All notifications marked as read.' });
});

exports.deleteNotification = catchAsync(async (req, res, next) => {
  await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
  res.status(204).json({ status: 'success', data: null });
});

exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const count = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
  res.status(200).json({ status: 'success', data: { count } });
});

// ── ANNOUNCEMENTS ─────────────────────────────────────────────

exports.getBatchAnnouncements = catchAsync(async (req, res, next) => {
  const announcements = await Announcement.find({
    batch: req.params.batchId, isDeleted: false
  })
  .populate('instructor', 'firstName lastName profilePicture')
  .sort('-isPinned -createdAt')
  .lean();

  res.status(200).json({ status: 'success', results: announcements.length, data: announcements });
});

exports.createAnnouncement = catchAsync(async (req, res, next) => {
  const announcement = await Announcement.create({
    ...req.body,
    instructor: req.user._id
  });

  // If email notification is requested, handled by scheduler/service
  // Socket push to batch students done here
  if (req.body.batch) {
    const { Enrollment } = require('../models');
    const { notifyUser } = require('../utils/socket');
    const enrollments = await Enrollment.find({ batch: req.body.batch, isActive: true }).lean();
    enrollments.forEach(e => notifyUser(e.student, 'announcement', {
      id:      announcement._id,
      title:   announcement.title,
      batchId: req.body.batch
    }));
  }

  res.status(201).json({ status: 'success', data: announcement });
});

exports.updateAnnouncement = catchAsync(async (req, res, next) => {
  const ann = await Announcement.findOneAndUpdate(
    { _id: req.params.id, instructor: req.user._id },
    req.body,
    { new: true }
  );
  if (!ann) return next(new AppError('Announcement not found or access denied.', 404));
  res.status(200).json({ status: 'success', data: ann });
});

exports.deleteAnnouncement = catchAsync(async (req, res, next) => {
  req.filter = { instructor: req.user._id };
  return factory.deleteOne(Announcement)(req, res, next);
});