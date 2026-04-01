'use strict';

// controllers/reviewController.js
// ============================================================

const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const factory    = require('../utils/handlerFactory');
const { Review, Enrollment } = require('../models');

exports.getCourseReviews = catchAsync(async (req, res, next) => {
  const reviews = await Review.find({ course: req.params.courseId, isApproved: true })
    .populate('user', 'firstName lastName profilePicture')
    .sort('-createdAt').lean();
  res.status(200).json({ status: 'success', results: reviews.length, data: reviews });
});

exports.createReview = catchAsync(async (req, res, next) => {
  // Verify enrollment
  const enrolled = await Enrollment.findOne({
    student: req.user._id, course: req.params.courseId, isActive: true
  }).lean();
  if (!enrolled) return next(new AppError('You must be enrolled to leave a review.', 403, 'NOT_ENROLLED'));

  const existing = await Review.findOne({ course: req.params.courseId, user: req.user._id });
  if (existing) return next(new AppError('You have already reviewed this course.', 409, 'ALREADY_REVIEWED'));

  const review = await Review.create({
    ...req.body,
    course:     req.params.courseId,
    user:       req.user._id,
    isVerified: true
  });

  res.status(201).json({ status: 'success', data: review });
});

exports.updateReview = catchAsync(async (req, res, next) => {
  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { rating: req.body.rating, title: req.body.title, comment: req.body.comment, pros: req.body.pros, cons: req.body.cons },
    { new: true, runValidators: true }
  );
  if (!review) return next(new AppError('Review not found or access denied.', 404));
  res.status(200).json({ status: 'success', data: review });
});

exports.deleteReview = catchAsync(async (req, res, next) => {
  req.filter = { user: req.user._id };
  return factory.deleteOne(Review)(req, res, next);
});

exports.markHelpful = catchAsync(async (req, res, next) => {
  await Review.findByIdAndUpdate(req.params.id, { $inc: { helpfulCount: 1 } });
  res.status(200).json({ status: 'success', message: 'Marked as helpful.' });
});

exports.addInstructorReply = catchAsync(async (req, res, next) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { replyFromInstructor: { comment: req.body.comment, repliedAt: new Date() } },
    { new: true }
  );
  if (!review) return next(new AppError('Review not found.', 404));
  res.status(200).json({ status: 'success', data: review });
});

// ──────────────────────────────────────────────────────────────
// controllers/discussionController.js (combined in same file)
// ──────────────────────────────────────────────────────────────

const { Discussion, DiscussionReply } = require('../models');

exports.getDiscussions = catchAsync(async (req, res, next) => {
  const filter = { isDeleted: false };
  if (req.params.courseId) filter.course = req.params.courseId;
  if (req.params.lessonId) filter.lesson = req.params.lessonId;

  const discussions = await Discussion.find(filter)
    .populate('user', 'firstName lastName profilePicture role')
    .sort('-isPinned -createdAt')
    .lean();

  res.status(200).json({ status: 'success', results: discussions.length, data: discussions });
});

exports.createDiscussion = catchAsync(async (req, res, next) => {
  const discussion = await Discussion.create({
    ...req.body,
    course: req.params.courseId || req.body.course,
    lesson: req.params.lessonId || req.body.lesson,
    user:   req.user._id
  });
  res.status(201).json({ status: 'success', data: discussion });
});

exports.getReplies = catchAsync(async (req, res, next) => {
  const replies = await DiscussionReply.find({ discussion: req.params.discussionId })
    .populate('user', 'firstName lastName profilePicture role')
    .sort('createdAt').lean();
  res.status(200).json({ status: 'success', results: replies.length, data: replies });
});

exports.addReply = catchAsync(async (req, res, next) => {
  const discussion = await Discussion.findById(req.params.discussionId);
  if (!discussion) return next(new AppError('Discussion not found.', 404));

  const reply = await DiscussionReply.create({
    discussion:         req.params.discussionId,
    user:               req.user._id,
    content:            req.body.content,
    isInstructorAnswer: ['instructor', 'admin'].includes(req.user.role)
  });

  await Discussion.findByIdAndUpdate(req.params.discussionId, {
    $inc: { totalReplies: 1 },
    ...(req.user.role === 'instructor' ? { isResolved: true } : {})
  });

  res.status(201).json({ status: 'success', data: reply });
});

exports.toggleLikeDiscussion = catchAsync(async (req, res, next) => {
  const discussion = await Discussion.findById(req.params.id);
  if (!discussion) return next(new AppError('Discussion not found.', 404));

  const alreadyLiked = discussion.likes.includes(req.user._id);
  if (alreadyLiked) {
    await Discussion.findByIdAndUpdate(req.params.id, { $pull:     { likes: req.user._id } });
  } else {
    await Discussion.findByIdAndUpdate(req.params.id, { $addToSet: { likes: req.user._id } });
  }

  res.status(200).json({ status: 'success', liked: !alreadyLiked });
});

exports.deleteDiscussion = catchAsync(async (req, res, next) => {
  req.filter = { user: req.user._id };
  return factory.deleteOne(Discussion)(req, res, next);
});

exports.deleteReply = catchAsync(async (req, res, next) => {
  const reply = await DiscussionReply.findOneAndDelete({ _id: req.params.replyId, user: req.user._id });
  if (!reply) return next(new AppError('Reply not found or access denied.', 404));
  await Discussion.findByIdAndUpdate(reply.discussion, { $inc: { totalReplies: -1 } });
  res.status(204).json({ status: 'success', data: null });
});