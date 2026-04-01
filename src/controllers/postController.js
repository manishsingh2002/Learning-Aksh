'use strict';

// controllers/postController.js
// ============================================================
// POST — Blog, Current Affairs, Announcements
// ============================================================

const catchAsync  = require('../utils/catchAsync');
const AppError    = require('../utils/appError');
const factory     = require('../utils/handlerFactory');
const cache       = require('../utils/cache');
const ApiFeatures = require('../utils/ApiFeatures');
const { promisifyUpload, uploadThumbnail } = require('../utils/upload');
const Post        = require('../models/postModel');

// ── PUBLIC ────────────────────────────────────────────────────

exports.getAllPosts = catchAsync(async (req, res, next) => {
  const baseFilter = { status: 'published', isDeleted: false };
  if (req.query.type)     baseFilter.type     = req.query.type;
  if (req.query.examGoal) baseFilter.examGoals = req.query.examGoal;
  if (req.query.category) baseFilter.category = req.query.category;

  const features = new ApiFeatures(Post.find(baseFilter), req.query)
    .filter()
    .search(['title', 'excerpt', 'content'])
    .sort()
    .limitFields()
    .paginate();

  features.populate([
    { path: 'author',   select: 'firstName lastName profilePicture' },
    { path: 'category', select: 'name slug' }
  ]);

  const result = await features.execute(Post);
  res.status(200).json({ status: 'success', ...result });
});

exports.getPost = catchAsync(async (req, res, next) => {
  const filter = req.params.slug
    ? { slug: req.params.slug, isDeleted: false }
    : { _id: req.params.id, isDeleted: false };

  const post = await Post.findOne(filter)
    .populate('author',   'firstName lastName profilePicture')
    .populate('category', 'name slug')
    .populate('examGoals','name slug icon')
    .lean();

  if (!post) return next(new AppError('Post not found.', 404));

  // Increment view count (fire and forget)
  Post.findByIdAndUpdate(post._id, { $inc: { views: 1 } }).exec();

  res.status(200).json({ status: 'success', data: post });
});

// Current affairs — daily grouped by date
exports.getCurrentAffairs = catchAsync(async (req, res, next) => {
  const { date, examGoal } = req.query;
  const filter = { type: 'current_affairs', status: 'published', isDeleted: false };

  if (examGoal) filter.examGoals = examGoal;
  if (date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    filter.publishedAt = { $gte: d, $lte: end };
  }

  const posts = await Post.find(filter)
    .select('title slug excerpt thumbnail publishedAt readTime examGoals tags')
    .sort('-publishedAt')
    .lean();

  res.status(200).json({ status: 'success', results: posts.length, data: posts });
});

// Like / unlike a post
exports.toggleLike = catchAsync(async (req, res, next) => {
  const post = await Post.findById(req.params.id);
  if (!post) return next(new AppError('Post not found.', 404));

  const alreadyLiked = post.likedBy.includes(req.user._id);
  if (alreadyLiked) {
    post.likedBy.pull(req.user._id);
    post.likes = Math.max(0, post.likes - 1);
  } else {
    post.likedBy.push(req.user._id);
    post.likes += 1;
  }
  await post.save();

  res.status(200).json({ status: 'success', liked: !alreadyLiked, likes: post.likes });
});

// ── AUTHOR/ADMIN CRUD ─────────────────────────────────────────

exports.createPost = catchAsync(async (req, res, next) => {
  const post = await Post.create({ ...req.body, author: req.user._id });
  res.status(201).json({ status: 'success', data: post });
});

exports.updatePost = catchAsync(async (req, res, next) => {
  const filter = req.user.role === 'admin'
    ? { _id: req.params.id }
    : { _id: req.params.id, author: req.user._id };

  const post = await Post.findOneAndUpdate(filter, req.body, { new: true, runValidators: true });
  if (!post) return next(new AppError('Post not found or access denied.', 404));
  res.status(200).json({ status: 'success', data: post });
});

exports.uploadPostThumbnail = catchAsync(async (req, res, next) => {
  await promisifyUpload(uploadThumbnail)(req, res);
  if (!req.file) return next(new AppError('Please upload an image.', 400));

  const post = await Post.findOneAndUpdate(
    { _id: req.params.id, author: req.user._id },
    { thumbnail: req.file.path },
    { new: true }
  );
  if (!post) return next(new AppError('Post not found or access denied.', 404));
  res.status(200).json({ status: 'success', data: { thumbnail: post.thumbnail } });
});

exports.deletePost = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'admin') req.filter = { author: req.user._id };
  return factory.deleteOne(Post)(req, res, next);
});

exports.publishPost = catchAsync(async (req, res, next) => {
  const filter = req.user.role === 'admin'
    ? { _id: req.params.id }
    : { _id: req.params.id, author: req.user._id };

  const post = await Post.findOneAndUpdate(
    filter,
    { status: req.body.publish ? 'published' : 'draft', publishedAt: req.body.publish ? new Date() : null },
    { new: true }
  );
  if (!post) return next(new AppError('Post not found or access denied.', 404));
  res.status(200).json({ status: 'success', data: post });
});

// My posts (author)
exports.getMyPosts = catchAsync(async (req, res, next) => {
  req.filter = { author: req.user._id };
  return factory.getAll(Post, { searchFields: ['title'] })(req, res, next);
});