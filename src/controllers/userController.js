'use strict';

// controllers/userController.js
// ============================================================
// USERS — Profile, Picture, Instructor Profile, Student Profile
// ============================================================

const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const factory    = require('../utils/handlerFactory');
const { promisifyUpload, uploadProfilePicture, deleteFromCloudinary } = require('../utils/upload');
const { pick }   = require('../utils/helpers');
const cache      = require('../utils/cache');
const logger     = require('../utils/logger');
const {
  User, StudentProfile, InstructorProfile
} = require('../models');

// ── ALLOWED UPDATE FIELDS ────────────────────────────────────
const USER_ALLOWED_FIELDS     = ['firstName', 'lastName', 'phoneNumber', 'dateOfBirth', 'gender', 'address'];
const STUDENT_ALLOWED_FIELDS  = ['education', 'interests', 'preferences'];
const INSTRUCTOR_ALLOWED_FIELDS = ['bio', 'qualifications', 'expertise', 'experience', 'socialLinks'];

// ── GET MY FULL PROFILE ───────────────────────────────────────
exports.getMyProfile = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  // Try cache first
  const cached = await cache.remember(
    cache.keys.user(userId),
    async () => {
      const user = await User.findById(userId).lean();
      if (!user) return null;

      // Attach profile based on role
      let profile = null;
      if (user.role === 'student') {
        profile = await StudentProfile.findOne({ user: userId }).lean();
      } else if (['instructor', 'co-instructor'].includes(user.role)) {
        profile = await InstructorProfile.findOne({ user: userId }).lean();
      }

      return { ...user, profile };
    },
    cache.TTL.MEDIUM
  );

  if (!cached) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', data: cached });
});

// ── UPDATE MY PROFILE ────────────────────────────────────────
exports.updateMyProfile = catchAsync(async (req, res, next) => {
  // Block password changes through this route
  if (req.body.password || req.body.confirmPassword) {
    return next(new AppError('Use /change-password to update your password.', 400, 'USE_CHANGE_PASSWORD'));
  }

  const allowedData = pick(req.body, USER_ALLOWED_FIELDS);
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    allowedData,
    { new: true, runValidators: true }
  ).lean();

  // Bust cache
  await cache.del(cache.keys.user(req.user._id));

  logger.info('Profile updated', { userId: req.user._id });
  res.status(200).json({ status: 'success', data: updatedUser });
});

// ── UPLOAD PROFILE PICTURE ────────────────────────────────────
exports.uploadProfilePicture = catchAsync(async (req, res, next) => {
  await promisifyUpload(uploadProfilePicture)(req, res);

  if (!req.file) {
    return next(new AppError('Please upload an image file.', 400, 'NO_FILE'));
  }

  // Delete old picture from Cloudinary if exists
  if (req.user.profilePicture) {
    const oldPublicId = req.user.profilePicture.split('/').pop().split('.')[0];
    deleteFromCloudinary(`${process.env.APP_NAME}/profiles/${oldPublicId}`).catch(() => {});
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { profilePicture: req.file.path },
    { new: true }
  ).lean();

  await cache.del(cache.keys.user(req.user._id));

  res.status(200).json({ status: 'success', data: { profilePicture: updatedUser.profilePicture } });
});

// ── DELETE MY ACCOUNT (soft) ──────────────────────────────────
exports.deleteMyAccount = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user._id, {
    isDeleted: true,
    isActive:  false,
    deletedAt: new Date()
  });

  await cache.del(cache.keys.user(req.user._id));

  const { clearRefreshCookie } = require('../utils/token');
  clearRefreshCookie(res);

  res.status(204).json({ status: 'success', data: null });
});

// ── STUDENT PROFILE ───────────────────────────────────────────
exports.getStudentProfile = catchAsync(async (req, res, next) => {
  const profile = await StudentProfile.findOne({ user: req.user._id })
    .populate('examGoals', 'name examBody slug icon')
    .lean();

  if (!profile) return next(new AppError('Student profile not found.', 404));

  res.status(200).json({ status: 'success', data: profile });
});

exports.updateStudentProfile = catchAsync(async (req, res, next) => {
  const allowedData = pick(req.body, STUDENT_ALLOWED_FIELDS);

  const profile = await StudentProfile.findOneAndUpdate(
    { user: req.user._id },
    allowedData,
    { new: true, runValidators: true, upsert: true }
  ).lean();

  await cache.del(cache.keys.user(req.user._id));

  res.status(200).json({ status: 'success', data: profile });
});

// Wishlist management
exports.addToWishlist = catchAsync(async (req, res, next) => {
  const { courseId } = req.params;
  await StudentProfile.findOneAndUpdate(
    { user: req.user._id },
    { $addToSet: { wishlist: courseId } }
  );
  res.status(200).json({ status: 'success', message: 'Added to wishlist.' });
});

exports.removeFromWishlist = catchAsync(async (req, res, next) => {
  const { courseId } = req.params;
  await StudentProfile.findOneAndUpdate(
    { user: req.user._id },
    { $pull: { wishlist: courseId } }
  );
  res.status(200).json({ status: 'success', message: 'Removed from wishlist.' });
});

exports.getWishlist = catchAsync(async (req, res, next) => {
  const profile = await StudentProfile.findOne({ user: req.user._id })
    .populate({
      path:   'wishlist',
      select: 'title slug thumbnail price discountPrice rating totalEnrollments primaryInstructor',
      populate: { path: 'primaryInstructor', select: 'firstName lastName' }
    })
    .lean();

  res.status(200).json({ status: 'success', data: profile?.wishlist || [] });
});

// ── INSTRUCTOR PROFILE ────────────────────────────────────────
exports.getInstructorProfile = catchAsync(async (req, res, next) => {
  const userId = req.params.id || req.user._id;

  const profile = await InstructorProfile.findOne({ user: userId })
    .populate('user', 'firstName lastName profilePicture email')
    .lean();

  if (!profile) return next(new AppError('Instructor profile not found.', 404));

  res.status(200).json({ status: 'success', data: profile });
});

exports.updateInstructorProfile = catchAsync(async (req, res, next) => {
  const allowedData = pick(req.body, INSTRUCTOR_ALLOWED_FIELDS);

  const profile = await InstructorProfile.findOneAndUpdate(
    { user: req.user._id },
    allowedData,
    { new: true, runValidators: true, upsert: true }
  ).lean();

  await cache.del(cache.keys.user(req.user._id));

  res.status(200).json({ status: 'success', data: profile });
});

// ── ADMIN — MANAGE ALL USERS ──────────────────────────────────
exports.getAllUsers   = factory.getAll(User, { searchFields: ['firstName', 'lastName', 'email'] });
exports.getUser      = factory.getOne(User);
exports.updateUser   = factory.updateOne(User);
exports.deleteUser   = factory.deleteOne(User);
exports.restoreUser  = factory.restoreOne(User);