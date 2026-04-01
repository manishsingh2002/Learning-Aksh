'use strict';

// routes/userRoutes.js
// ============================================================
// USER ROUTES
// GET    /api/v1/users/me/profile
// PATCH  /api/v1/users/me/profile
// PATCH  /api/v1/users/me/profile-picture
// DELETE /api/v1/users/me
// GET    /api/v1/users/me/student-profile
// PATCH  /api/v1/users/me/student-profile
// GET    /api/v1/users/me/wishlist
// POST   /api/v1/users/me/wishlist/:courseId
// DELETE /api/v1/users/me/wishlist/:courseId
// GET    /api/v1/users/me/instructor-profile
// PATCH  /api/v1/users/me/instructor-profile
// GET    /api/v1/users/instructor/:id        (public)
// GET    /api/v1/users/           (admin)
// GET    /api/v1/users/:id        (admin)
// PATCH  /api/v1/users/:id        (admin)
// DELETE /api/v1/users/:id        (admin)
// ============================================================

const express  = require('express');
const router   = express.Router();

const userCtrl = require('../controllers/userController');
const { authenticate, restrictTo }  = require('../utils/permissions');
const { uploadLimiter }             = require('../utils/rateLimiter');
const { validate, schemas }         = require('../utils/validators');

// All routes require login
router.use(authenticate);

// ── MY PROFILE ────────────────────────────────────────────────
router.get(   '/me/profile',        userCtrl.getMyProfile);
router.patch( '/me/profile',        validate(schemas.updateProfile), userCtrl.updateMyProfile);
router.patch( '/me/profile-picture', uploadLimiter, userCtrl.uploadProfilePicture);
router.delete('/me',                userCtrl.deleteMyAccount);

// ── STUDENT PROFILE ───────────────────────────────────────────
router.get(  '/me/student-profile',  userCtrl.getStudentProfile);
router.patch('/me/student-profile',  userCtrl.updateStudentProfile);

// Wishlist
router.get(   '/me/wishlist',            userCtrl.getWishlist);
router.post(  '/me/wishlist/:courseId',  userCtrl.addToWishlist);
router.delete('/me/wishlist/:courseId',  userCtrl.removeFromWishlist);

// ── INSTRUCTOR PROFILE ────────────────────────────────────────
router.get(  '/me/instructor-profile',  userCtrl.getInstructorProfile);
router.patch('/me/instructor-profile',  validate(schemas.updateInstructorProfile), userCtrl.updateInstructorProfile);

// ── PUBLIC: view any instructor profile ──────────────────────
router.get('/instructor/:id', userCtrl.getInstructorProfile);

// ── ADMIN ONLY ────────────────────────────────────────────────
router.use(restrictTo('admin'));
router.get('/',    userCtrl.getAllUsers);
router.get('/:id', userCtrl.getUser);
router.patch('/:id', userCtrl.updateUser);
router.delete('/:id', userCtrl.deleteUser);

module.exports = router;