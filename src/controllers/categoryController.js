'use strict';

// controllers/categoryController.js
// ============================================================
// CATEGORY — CRUD + tree structure
// ============================================================

const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const factory    = require('../utils/handlerFactory');
const cache      = require('../utils/cache');
const { Category } = require('../models');

const CACHE_KEY = 'categories:tree';

// ── PUBLIC ────────────────────────────────────────────────────

// Full tree (parent → children), heavily cached
exports.getCategoryTree = catchAsync(async (req, res, next) => {
  const tree = await cache.remember(CACHE_KEY, async () => {
    const all = await Category.find({ isActive: true, isDeleted: false })
      .sort('sortOrder name')
      .lean();

    // Build tree in-memory
    const map = {};
    const roots = [];
    all.forEach(c => { map[c._id] = { ...c, children: [] }; });
    all.forEach(c => {
      if (c.parentCategory) map[c.parentCategory]?.children.push(map[c._id]);
      else roots.push(map[c._id]);
    });
    return roots;
  }, cache.TTL.LONG);

  res.status(200).json({ status: 'success', data: tree });
});

exports.getAllCategories = factory.getAll(Category, { searchFields: ['name'] });
exports.getCategory      = factory.getOneBySlug(Category);

// ── ADMIN CRUD ────────────────────────────────────────────────
exports.createCategory = catchAsync(async (req, res, next) => {
  const cat = await Category.create(req.body);
  await cache.del(CACHE_KEY);
  res.status(201).json({ status: 'success', data: cat });
});

exports.updateCategory = catchAsync(async (req, res, next) => {
  const cat = await Category.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true
  });
  if (!cat) return next(new AppError('Category not found.', 404));
  await cache.del(CACHE_KEY);
  res.status(200).json({ status: 'success', data: cat });
});

exports.deleteCategory = catchAsync(async (req, res, next) => {
  // Check for subcategories before deleting
  const hasChildren = await Category.exists({ parentCategory: req.params.id, isDeleted: false });
  if (hasChildren) {
    return next(new AppError('Cannot delete a category that has subcategories. Delete subcategories first.', 400, 'HAS_CHILDREN'));
  }
  await Category.findByIdAndUpdate(req.params.id, { isDeleted: true, isActive: false });
  await cache.del(CACHE_KEY);
  res.status(204).json({ status: 'success', data: null });
});