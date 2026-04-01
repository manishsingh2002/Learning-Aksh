'use strict';

// utils/permissions.js
// ============================================================
// PERMISSIONS — Role-Based + Ownership Access Control
// ============================================================
// Three layers of protection:
//   1. authenticate()   → is the user logged in? (JWT check)
//   2. restrictTo()     → does the user have the required role?
//   3. checkOwnership() → does the user own this specific document?
//
// Usage in routes:
//   router.use(authenticate);
//   router.patch('/:id', restrictTo('instructor','admin'), checkOwnership(Course, 'primaryInstructor'), updateCourse);
// ============================================================

const mongoose  = require('mongoose');
const catchAsync = require('./catchAsync');
const AppError   = require('./appError');
const { verifyAccessToken } = require('./token');
const { User }   = require('../models');

// ── 1. AUTHENTICATE ──────────────────────────────────────────
// Validates JWT from Authorization header or cookie.
// Attaches req.user for downstream middleware.

const authenticate = catchAsync(async (req, res, next) => {
  // 1a. Extract token
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please log in to get access.', 401, 'NOT_AUTHENTICATED'));
  }

  // 1b. Verify token
  const decoded = verifyAccessToken(token);   // throws AppError if invalid/expired

  // 1c. Check user still exists (handles deleted accounts)
  const currentUser = await User.findById(decoded.id).select('+passwordChangedAt').lean();
  if (!currentUser) {
    return next(new AppError('The user belonging to this token no longer exists.', 401, 'USER_NOT_FOUND'));
  }

  // 1d. Check account is still active
  if (!currentUser.isActive || currentUser.isDeleted) {
    return next(new AppError('Your account has been deactivated. Contact support.', 401, 'ACCOUNT_INACTIVE'));
  }

  // 1e. Check password wasn't changed after token was issued
  if (currentUser.passwordChangedAt) {
    const changedAt  = parseInt(currentUser.passwordChangedAt.getTime() / 1000, 10);
    if (decoded.iat < changedAt) {
      return next(new AppError('Password was recently changed. Please log in again.', 401, 'PASSWORD_CHANGED'));
    }
  }

  req.user = currentUser;
  next();
});

// ── 2. RESTRICT TO ROLES ─────────────────────────────────────
// Usage: restrictTo('admin')
//        restrictTo('instructor', 'admin')

const restrictTo = (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Not authenticated.', 401, 'NOT_AUTHENTICATED'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError(
        `Access denied. Required role: ${roles.join(' or ')}.`,
        403,
        'FORBIDDEN'
      ));
    }
    next();
  };

// ── 3. OPTIONAL AUTHENTICATE ────────────────────────────────
// For public routes that show extra data if user is logged in
// (e.g. show "enrolled" badge on course listing)

const optionalAuthenticate = catchAsync(async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }
    if (!token) return next();  // just continue unauthenticated

    const decoded     = verifyAccessToken(token);
    const currentUser = await User.findById(decoded.id).lean();
    if (currentUser && currentUser.isActive && !currentUser.isDeleted) {
      req.user = currentUser;
    }
  } catch {
    // invalid token on optional route → just continue unauthenticated
  }
  next();
});

// ── 4. CHECK OWNERSHIP ───────────────────────────────────────
// Verifies the authenticated user owns the resource.
// Admins bypass ownership checks.
//
// @param {Model}  Model        - Mongoose model to query
// @param {string} ownerField   - Field name holding the owner's ID
//                                e.g. 'primaryInstructor', 'student', 'user', 'author'
// @param {string} [idParam]    - URL param name, default 'id'
//
// Example:
//   router.delete('/:id', authenticate, restrictTo('instructor','admin'), checkOwnership(Course, 'primaryInstructor'))

const checkOwnership = (Model, ownerField = 'user', idParam = 'id') =>
  catchAsync(async (req, res, next) => {
    // Admins bypass ownership
    if (req.user.role === 'admin') return next();

    const docId = req.params[idParam];
    if (!mongoose.Types.ObjectId.isValid(docId)) {
      return next(new AppError('Invalid document ID', 400));
    }

    const doc = await Model.findById(docId).lean();
    if (!doc) return next(new AppError('Document not found', 404));

    const ownerId = doc[ownerField]?.toString();
    const userId  = req.user._id.toString();

    if (ownerId !== userId) {
      return next(new AppError('You do not have permission to perform this action.', 403, 'FORBIDDEN'));
    }

    req.doc = doc;   // attach doc so controller doesn't need to re-query
    next();
  });

// ── 5. CHECK ENROLLMENT ──────────────────────────────────────
// Verifies the student is enrolled in a batch or course.
// Used to guard lesson/mock test access.
//
// @param {string} resourceField  - 'batch' | 'course' | 'testSeries'
// @param {string} [idParam]      - URL param name holding the resource ID

const checkEnrollment = (resourceField = 'course', idParam = 'id') =>
  catchAsync(async (req, res, next) => {
    // Admins and instructors bypass enrollment check
    if (['admin', 'instructor', 'co-instructor'].includes(req.user.role)) return next();

    const resourceId = req.params[idParam] || req.params[resourceField + 'Id'];
    if (!resourceId || !mongoose.Types.ObjectId.isValid(resourceId)) {
      return next(new AppError('Invalid resource ID', 400));
    }

    const { Enrollment } = require('../models');
    const enrollment = await Enrollment.findOne({
      student:           req.user._id,
      [resourceField]:   resourceId,
      isActive:          true,
      isRevoked:         false,
      $or: [
        { expiryDate: null },
        { expiryDate: { $gt: new Date() } }
      ]
    }).lean();

    if (!enrollment) {
      return next(new AppError(
        'Access denied. You are not enrolled in this resource.',
        403,
        'NOT_ENROLLED'
      ));
    }

    req.enrollment = enrollment;
    next();
  });

// ── 6. VERIFY EMAIL ──────────────────────────────────────────
// Blocks access if user hasn't verified their email.

const requireEmailVerified = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return next(new AppError(
      'Please verify your email address before accessing this feature.',
      403,
      'EMAIL_NOT_VERIFIED'
    ));
  }
  next();
};

// ── 7. VERIFY INSTRUCTOR APPROVAL ────────────────────────────
// Blocks instructor routes until admin has approved them.

const requireInstructorApproved = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'instructor') return next();

  const { InstructorProfile } = require('../models');
  const profile = await InstructorProfile.findOne({ user: req.user._id }).lean();

  if (!profile?.isApproved) {
    return next(new AppError(
      'Your instructor account is pending admin approval.',
      403,
      'INSTRUCTOR_NOT_APPROVED'
    ));
  }
  next();
});

// ── 8. SCOPE FILTER INJECTION ────────────────────────────────
// Middleware helpers that inject req.filter for handlerFactory.
// These are composable and go before factory handlers in routes.

const scopeToUser = (field = 'user') =>
  (req, res, next) => {
    req.filter = { ...req.filter, [field]: req.user._id };
    next();
  };

const scopeToInstructor = (req, res, next) => {
  req.filter = { ...req.filter, primaryInstructor: req.user._id };
  next();
};

const scopeToStudent = (req, res, next) => {
  req.filter = { ...req.filter, student: req.user._id };
  next();
};

// ── EXPORTS ──────────────────────────────────────────────────
module.exports = {
  authenticate,
  restrictTo,
  optionalAuthenticate,
  checkOwnership,
  checkEnrollment,
  requireEmailVerified,
  requireInstructorApproved,
  scopeToUser,
  scopeToInstructor,
  scopeToStudent
};