'use strict';

// routes/progressRoutes.js
// ============================================================
// PROGRESS ROUTES
// PATCH  /api/v1/progress/courses/:courseId/lessons/:lessonId/complete
// GET    /api/v1/progress/courses/:courseId
// GET    /api/v1/progress/courses
// PATCH  /api/v1/progress/courses/:courseId/video-position
// GET    /api/v1/progress/analytics/:examGoalId
// GET    /api/v1/progress/analytics
// GET    /api/v1/progress/study-plan/:examGoalId
// POST   /api/v1/progress/study-plan
// PATCH  /api/v1/progress/study-plan/:planId/days/:dayIndex
// PATCH  /api/v1/progress/study-plan/:planId/status
// GET    /api/v1/progress/certificates
// GET    /api/v1/progress/certificates/:certNumber  (public verify)
// NOTES
// GET    /api/v1/progress/courses/:courseId/lessons/:lessonId/notes
// POST   /api/v1/progress/courses/:courseId/lessons/:lessonId/notes
// PATCH  /api/v1/progress/notes/:noteId
// DELETE /api/v1/progress/notes/:noteId
// ============================================================

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/progressController');
const { authenticate, restrictTo } = require('../utils/permissions');
const { validate, schemas }        = require('../utils/validators');

// Public certificate verification
router.get('/certificates/:certNumber', ctrl.getCertificate);

router.use(authenticate);

// Lesson progress
router.patch('/courses/:courseId/lessons/:lessonId/complete', ctrl.markLessonComplete);
router.get(  '/courses/:courseId',                            ctrl.getCourseProgress);
router.get(  '/courses',                                      ctrl.getMyCoursesProgress);
router.patch('/courses/:courseId/video-position',             ctrl.saveVideoPosition);

// Performance analytics
router.get('/analytics',               ctrl.getAllMyAnalytics);
router.get('/analytics/:examGoalId',   ctrl.getMyAnalytics);

// Study plan
router.get(  '/study-plan/:examGoalId',              ctrl.getStudyPlan);
router.post( '/study-plan',   validate(schemas.createStudyPlan), ctrl.createStudyPlan);
router.patch('/study-plan/:planId/days/:dayIndex',   ctrl.markDayComplete);
router.patch('/study-plan/:planId/status',           ctrl.updateStudyPlanStatus);

// Certificates
router.get('/certificates', ctrl.getMyCertificates);

// Notes
router.get(   '/courses/:courseId/lessons/:lessonId/notes', ctrl.getMyNotes);
router.post(  '/courses/:courseId/lessons/:lessonId/notes', ctrl.saveNote);
router.patch( '/notes/:noteId',                             ctrl.updateNote);
router.delete('/notes/:noteId',                             ctrl.deleteNote);

module.exports = router;


// ============================================================
// REVIEW ROUTES — mounted at /api/v1/reviews
// ============================================================
const reviewRouter  = express.Router({ mergeParams: true });
const reviewCtrl    = require('../controllers/reviewController');

reviewRouter.get('/',
  reviewCtrl.getCourseReviews
);
reviewRouter.post('/',
  authenticate,
  restrictTo('student'),
  validate(schemas.createReview),
  reviewCtrl.createReview
);
reviewRouter.patch('/:id',
  authenticate,
  restrictTo('student'),
  reviewCtrl.updateReview
);
reviewRouter.delete('/:id',
  authenticate,
  reviewCtrl.deleteReview
);
reviewRouter.patch('/:id/helpful',
  authenticate,
  reviewCtrl.markHelpful
);
reviewRouter.post('/:id/reply',
  authenticate,
  restrictTo('instructor', 'admin'),
  reviewCtrl.addInstructorReply
);
module.exports.reviewRouter = reviewRouter;


// ============================================================
// DISCUSSION ROUTES — mounted at /api/v1/discussions
// ============================================================
const discRouter = express.Router();
const discCtrl   = require('../controllers/reviewController');  // combined file

discRouter.use(authenticate);
discRouter.get('/',                validate(schemas.paginationQuery), discCtrl.getDiscussions);
discRouter.post('/',               validate(schemas.createDiscussion), discCtrl.createDiscussion);
discRouter.delete('/:id',          discCtrl.deleteDiscussion);
discRouter.patch('/:id/like',      discCtrl.toggleLikeDiscussion);
discRouter.get(  '/:discussionId/replies',  discCtrl.getReplies);
discRouter.post( '/:discussionId/replies',  validate(schemas.createReply), discCtrl.addReply);
discRouter.delete('/:discussionId/replies/:replyId', discCtrl.deleteReply);

module.exports.discussionRouter = discRouter;


// ============================================================
// POST ROUTES — mounted at /api/v1/posts
// ============================================================
const postRouter = express.Router();
const postCtrl   = require('../controllers/postController');

postRouter.get('/',                    postCtrl.getAllPosts);
postRouter.get('/current-affairs',     postCtrl.getCurrentAffairs);
postRouter.get('/slug/:slug',          postCtrl.getPost);
postRouter.get('/:id',                 postCtrl.getPost);
postRouter.patch('/:id/like', authenticate, postCtrl.toggleLike);

postRouter.use(authenticate);
postRouter.get('/my/posts',            postCtrl.getMyPosts);
postRouter.post('/',   validate(schemas.createPost), postCtrl.createPost);
postRouter.patch('/:id',               postCtrl.updatePost);
postRouter.patch('/:id/thumbnail',     postCtrl.uploadPostThumbnail);
postRouter.patch('/:id/publish',       postCtrl.publishPost);
postRouter.delete('/:id',             postCtrl.deletePost);

module.exports.postRouter = postRouter;


// ============================================================
// NOTIFICATION ROUTES — mounted at /api/v1/notifications
// ============================================================
const notifRouter = express.Router();
const notifCtrl   = require('../controllers/notificationController');

notifRouter.use(authenticate);
notifRouter.get('/',               notifCtrl.getMyNotifications);
notifRouter.get('/unread-count',   notifCtrl.getUnreadCount);
notifRouter.patch('/read-all',     notifCtrl.markAllAsRead);
notifRouter.patch('/:id/read',     notifCtrl.markAsRead);
notifRouter.delete('/:id',         notifCtrl.deleteNotification);

// Announcements
notifRouter.get('/announcements/batch/:batchId',  notifCtrl.getBatchAnnouncements);
notifRouter.post('/announcements',
  restrictTo('instructor', 'admin'),
  validate(schemas.createAnnouncement),
  notifCtrl.createAnnouncement
);
notifRouter.patch('/announcements/:id',
  restrictTo('instructor', 'admin'),
  notifCtrl.updateAnnouncement
);
notifRouter.delete('/announcements/:id',
  restrictTo('instructor', 'admin'),
  notifCtrl.deleteAnnouncement
);

module.exports.notificationRouter = notifRouter;