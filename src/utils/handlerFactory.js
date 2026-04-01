'use strict';

// utils/handlerFactory.js
// ============================================================
// HANDLER FACTORY — Generic CRUD handlers for all resources
// ============================================================
// Every handler respects req.filter — set this in middleware
// to scope queries to the current user/resource automatically.
//
// Example middleware usage:
//   router.use(restrictTo('student'));
//   router.use((req, res, next) => {
//     req.filter = { student: req.user._id };
//     next();
//   });
//
// Then in routes:
//   router.get('/', factory.getAll(Enrollment));
//   // automatically scoped: Enrollment.find({ student: req.user._id })
// ============================================================

const mongoose = require('mongoose');
const AppError  = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const ApiFeatures = require('../utils/ApiFeatures');

// Fields that must never be writable by users via the API
const PROTECTED_FIELDS = [
  '__v', 'createdAt', 'updatedAt',
  'passwordResetToken', 'passwordResetExpires', 'passwordChangedAt',
  'isDeleted', 'deletedAt',     // managed by deleteOne / restoreOne
  'totalEnrollments', 'totalRatings', 'totalReviews', 'totalReplyCount',
  'rating', 'attemptsCount', 'averageScore'  // managed by hooks / statics
];

// Strip protected fields from any update payload
const sanitizeBody = (body) => {
  const cleaned = { ...body };
  PROTECTED_FIELDS.forEach(f => delete cleaned[f]);
  return cleaned;
};

// ── GET ALL ──────────────────────────────────────────────────
// GET /resource?page=1&limit=20&sort=-createdAt&search=upsc
exports.getAll = (Model, options = {}) =>
  catchAsync(async (req, res, next) => {
    // req.filter is set by upstream middleware (e.g. scope to instructor)
    let baseFilter = { ...(req.filter || {}) };

    // Allow body params to be passed as JSON string in query
    // Useful for complex filters from mobile apps
    let queryObj = { ...req.query };
    if (req.query.params) {
      try {
        queryObj = { ...queryObj, ...JSON.parse(req.query.params) };
      } catch {
        return next(new AppError('Invalid JSON in params query string', 400));
      }
    }

    // Automatically exclude soft-deleted docs if schema supports it
    if (Model.schema.path('isDeleted')) baseFilter.isDeleted = { $ne: true };

    const features = new ApiFeatures(Model.find(baseFilter), queryObj)
      .filter()
      .search(options.searchFields || [])
      .sort()
      .limitFields();

    // Cursor pagination for infinite scroll; offset for admin tables
    if (queryObj.cursor) features.cursorPaginate();
    else features.paginate();

    if (options.populate) features.populate(options.populate);

    const result = await features.execute(Model);

    res.status(200).json({
      status:     'success',
      results:    result.results,
      pagination: result.pagination,
      data:       result.data
    });
  });

// ── GET ONE ──────────────────────────────────────────────────
// GET /resource/:id
exports.getOne = (Model, options = {}) =>
  catchAsync(async (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(new AppError('Invalid ID format', 400));
    }

    // Merge req.filter so a student can only fetch their own docs
    let filter = { _id: req.params.id, ...(req.filter || {}) };
    if (Model.schema.path('isDeleted')) filter.isDeleted = { $ne: true };

    let query = Model.findOne(filter);
    if (options.populate) {
      options.populate.forEach(pop => { query = query.populate(pop); });
    }
    if (options.lean !== false) query = query.lean();

    const doc = await query;
    if (!doc) return next(new AppError('Document not found', 404));

    res.status(200).json({ status: 'success', data: doc });
  });

// ── GET ONE BY SLUG ──────────────────────────────────────────
// GET /resource/:slug  (for SEO-friendly public routes)
exports.getOneBySlug = (Model, options = {}) =>
  catchAsync(async (req, res, next) => {
    let filter = { slug: req.params.slug, ...(req.filter || {}) };
    if (Model.schema.path('isDeleted')) filter.isDeleted = { $ne: true };

    let query = Model.findOne(filter);
    if (options.populate) {
      options.populate.forEach(pop => { query = query.populate(pop); });
    }
    if (options.lean !== false) query = query.lean();

    const doc = await query;
    if (!doc) return next(new AppError('No document found with that slug', 404));

    res.status(200).json({ status: 'success', data: doc });
  });

// ── CREATE ONE ───────────────────────────────────────────────
// POST /resource
exports.createOne = (Model) =>
  catchAsync(async (req, res, next) => {
    // sanitizeBody strips protected fields
    // req.filter injects scoped fields (e.g. instructor: req.user._id)
    const payload = { ...sanitizeBody(req.body), ...(req.filter || {}) };
    const doc     = await Model.create(payload);
    res.status(201).json({ status: 'success', data: doc });
  });

// ── UPDATE ONE ───────────────────────────────────────────────
// PATCH /resource/:id
exports.updateOne = (Model) =>
  catchAsync(async (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(new AppError('Invalid ID format', 400));
    }

    // FIXED: merge req.filter so students can't update other people's docs
    // e.g. req.filter = { student: req.user._id } scopes the update correctly
    const filter = { _id: req.params.id, ...(req.filter || {}) };
    if (Model.schema.path('isDeleted')) filter.isDeleted = { $ne: true };

    const doc = await Model.findOneAndUpdate(
      filter,
      sanitizeBody(req.body),   // FIXED: strip protected fields
      { new: true, runValidators: true }
    );

    if (!doc) return next(new AppError('Document not found or access denied', 404));
    res.status(200).json({ status: 'success', data: doc });
  });

// ── DELETE ONE ───────────────────────────────────────────────
// DELETE /resource/:id
// Soft deletes if schema has isDeleted field, hard deletes otherwise
exports.deleteOne = (Model) =>
  catchAsync(async (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(new AppError('Invalid ID format', 400));
    }

    // FIXED: merge req.filter so students can't delete other people's docs
    const filter       = { _id: req.params.id, ...(req.filter || {}) };
    const hasSoftDelete = !!Model.schema.path('isDeleted');
    let doc;

    if (hasSoftDelete) {
      doc = await Model.findOneAndUpdate(
        filter,
        { isDeleted: true, isActive: false, deletedAt: new Date() },
        { new: true }
      );
    } else {
      doc = await Model.findOneAndDelete(filter);
    }

    if (!doc) return next(new AppError('Document not found or access denied', 404));
    res.status(204).json({ status: 'success', data: null });
  });

// ── RESTORE ONE ──────────────────────────────────────────────
// PATCH /resource/:id/restore  (admin only)
exports.restoreOne = (Model) =>
  catchAsync(async (req, res, next) => {
    if (!Model.schema.path('isDeleted')) {
      return next(new AppError('Soft delete not supported on this resource', 400));
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(new AppError('Invalid ID format', 400));
    }

    const doc = await Model.findOneAndUpdate(
      { _id: req.params.id, isDeleted: true },
      { isDeleted: false, isActive: true, deletedAt: null },
      { new: true }
    );

    if (!doc) return next(new AppError('No deleted document found with that ID', 404));
    res.status(200).json({ status: 'success', data: doc });
  });

// ── BULK CREATE ──────────────────────────────────────────────
// POST /resource/bulk
exports.bulkCreate = (Model) =>
  catchAsync(async (req, res, next) => {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      return next(new AppError('Request body must be a non-empty array', 400));
    }
    if (req.body.length > 500) {
      return next(new AppError('Cannot bulk create more than 500 documents at once', 400));
    }

    // FIXED: removed hardcoded primaryInstructor — that's business logic,
    // not generic factory logic. Set it in req.filter from your route middleware instead:
    //   req.filter = { primaryInstructor: req.user._id }
    const docs = req.body.map(item => ({
      ...sanitizeBody(item),
      ...(req.filter || {})    // inject scoped fields from middleware
    }));

    // ordered: false — continues inserting even if one fails
    // Collect partial errors instead of stopping everything
    let result;
    try {
      result = await Model.insertMany(docs, { ordered: false });
    } catch (err) {
      // insertMany with ordered:false throws but still inserts valid docs
      // err.insertedDocs gives you what succeeded
      const inserted = err.insertedDocs || [];
      return res.status(207).json({    // 207 = Multi-Status (partial success)
        status:   'partial',
        message:  `${inserted.length} of ${docs.length} documents created`,
        results:  inserted.length,
        data:     inserted,
        errors:   err.writeErrors?.map(e => ({
          index:   e.index,
          message: e.errmsg
        }))
      });
    }

    res.status(201).json({
      status:  'success',
      results: result.length,
      data:    result
    });
  });

// ── BULK UPDATE ──────────────────────────────────────────────
// PATCH /resource/bulk
// Body: { data: [{ _id, ...fields }, ...] }
exports.bulkUpdate = (Model) =>
  catchAsync(async (req, res, next) => {
    const { data } = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return next(new AppError('Provide a non-empty array in data field', 400));
    }
    if (data.length > 500) {
      return next(new AppError('Cannot bulk update more than 500 documents at once', 400));
    }

    const bulkOps = data
      .filter(item => item._id && mongoose.Types.ObjectId.isValid(item._id))
      .map(({ _id, ...updateData }) => ({
        updateOne: {
          filter: { _id, ...(req.filter || {}) },     // FIXED: scope to user's own docs
          update: { $set: sanitizeBody(updateData) }, // FIXED: strip protected fields
          upsert: false
        }
      }));

    if (bulkOps.length === 0) {
      return next(new AppError('No valid IDs found in the provided data', 400));
    }

    const result = await Model.bulkWrite(bulkOps, { ordered: false });

    res.status(200).json({
      status:        'success',
      matchedCount:  result.matchedCount,
      modifiedCount: result.modifiedCount,
      skipped:       data.length - bulkOps.length   // invalid IDs skipped
    });
  });

// ── BULK DELETE ──────────────────────────────────────────────
// DELETE /resource/bulk
// Body: { ids: [...], hardDelete: false }
exports.bulkDelete = (Model) =>
  catchAsync(async (req, res, next) => {
    const { ids, hardDelete = false } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return next(new AppError('Provide a non-empty ids array', 400));
    }
    if (ids.length > 500) {
      return next(new AppError('Cannot bulk delete more than 500 documents at once', 400));
    }

    const validIds = ids
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    if (validIds.length === 0) {
      return next(new AppError('No valid IDs provided', 400));
    }

    const hasSoftDelete = !!Model.schema.path('isDeleted');
    let result;

    const filter = {
      _id:         { $in: validIds },
      ...(req.filter || {})    // scope to user's own docs
    };

    if (!hardDelete && hasSoftDelete) {
      result = await Model.updateMany(
        filter,
        { isDeleted: true, isActive: false, deletedAt: new Date() }
      );
    } else {
      result = await Model.deleteMany(filter);
    }

    res.status(200).json({
      status: 'success',
      data: {
        requested: ids.length,
        affected:  result.modifiedCount ?? result.deletedCount,
        skipped:   ids.length - validIds.length   // invalid IDs skipped
      }
    });
  });

// ── COUNT ────────────────────────────────────────────────────
// GET /resource/count
exports.count = (Model) =>
  catchAsync(async (req, res, next) => {
    let filter = { ...(req.filter || {}) };
    if (Model.schema.path('isDeleted')) filter.isDeleted = { $ne: true };
    const count = await Model.countDocuments(filter);
    res.status(200).json({ status: 'success', data: { count } });
  });