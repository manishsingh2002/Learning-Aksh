'use strict';

// utils/ApiFeatures.js
// ============================================================
// API FEATURES — Reusable query builder for all GET endpoints
// Supports: filter, search, sort, field limiting, pagination,
//           cursor pagination, populate
// ============================================================

const mongoose = require('mongoose');

// Regex-safe escape — prevents search crashes on special chars
// e.g. searching "(upsc" would throw without this
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Blocked MongoDB operators that could be used for injection
const BLOCKED_OPERATORS = ['$where', '$expr', '$function', '$accumulator'];

class ApiFeatures {

  constructor(query, queryString, options = {}) {
    this.query       = query;
    this.queryString = queryString;
    this.options     = options;

    this.pagination = {
      page:         1,
      limit:        20,
      totalResults: 0,
      totalPages:   0,
      hasNextPage:  false,
      hasPrevPage:  false,
      nextCursor:   null
    };

    this._filter      = {};
    this._sortApplied = false;   // tracks if user set a sort (for cursorPaginate)
  }

  // ── TYPE COERCION ────────────────────────────────────────────
  // Converts query string values to proper JS types
  static coerceValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;

    const lower = value.toLowerCase().trim();
    if (lower === 'true')  return true;
    if (lower === 'false') return false;
    if (lower === 'null')  return null;

    // Number (guard: skip long strings that happen to be numeric like phone numbers)
    if (!isNaN(value) && value.trim().length > 0 && value.trim().length < 16) {
      return Number(value);
    }

    // MongoDB ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(value)) {
      return new mongoose.Types.ObjectId(value);
    }

    // Date (only if it looks like a date — has dashes and is valid)
    if (value.includes('-')) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }

    return value;
  }

  // ── OPERATOR INJECTION GUARD ─────────────────────────────────
  static isSafeOperator(op) {
    const full = `$${op}`;
    return !BLOCKED_OPERATORS.includes(full);
  }

  // ── FILTER ───────────────────────────────────────────────────
  // Supports: ?price[gte]=100&status=published&level=easy|medium
  filter() {
    const excluded = ['page', 'limit', 'sort', 'fields', 'search', 'populate', 'cursor', 'lastId'];
    const queryObj  = { ...this.queryString };
    excluded.forEach(el => delete queryObj[el]);

    const mongoFilter = {};

    for (const key in queryObj) {
      const value = queryObj[key];

      // Nested operator: ?price[gte]=100 → { price: { $gte: 100 } }
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        mongoFilter[key] = {};
        for (const op in value) {
          if (!ApiFeatures.isSafeOperator(op)) continue;  // block injection
          mongoFilter[key][`$${op}`] = ApiFeatures.coerceValue(value[op]);
        }
        continue;
      }

      // Pipe-separated OR: ?level=easy|medium → { level: { $in: ['easy','medium'] } }
      if (typeof value === 'string' && value.includes('|')) {
        mongoFilter[key] = {
          $in: value.split('|').map(v => ApiFeatures.coerceValue(v.trim()))
        };
        continue;
      }

      mongoFilter[key] = ApiFeatures.coerceValue(value);
    }

    this._filter   = mongoFilter;
    this.query     = this.query.find(mongoFilter);
    return this;
  }

  // ── SEARCH ───────────────────────────────────────────────────
  // Uses MongoDB text index if no fields passed, else regex per field
  // ?search=upsc+history
  search(fields = []) {
    const searchTerm = this.queryString.search;
    if (!searchTerm) return this;

    const escaped = escapeRegex(searchTerm.trim());  // safe regex

    if (fields.length === 0) {
      // Use MongoDB full-text search index (requires text index on model)
      this.query = this.query.find({ $text: { $search: searchTerm } });
    } else {
      // Field-level regex search
      const regex      = new RegExp(escaped, 'i');
      const conditions = fields.map(field => ({ [field]: regex }));
      this.query.and([{ $or: conditions }]);
    }

    return this;
  }

  // ── SORT ─────────────────────────────────────────────────────
  // ?sort=-createdAt,price  (comma-separated, - for descending)
  sort() {
    if (this.queryString.sort) {
      const sortBy     = this.queryString.sort.split(',').join(' ');
      this.query       = this.query.sort(sortBy);
      this._sortApplied = true;
    } else {
      this.query = this.query.sort('-createdAt -_id');
    }
    return this;
  }

  // ── FIELD LIMITING ───────────────────────────────────────────
  // ?fields=title,price,thumbnail  (comma-separated)
  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query   = this.query.select(fields);
    } else {
      this.query = this.query.select('-__v');
    }
    return this;
  }

  // ── OFFSET PAGINATION ────────────────────────────────────────
  // ?page=2&limit=20
  paginate() {
    const page  = Math.max(parseInt(this.queryString.page,  10) || 1,  1);
    const limit = Math.min(
      Math.max(parseInt(this.queryString.limit, 10) || 20, 1),
      100  // hard cap — prevents ?limit=99999 abuse
    );

    this.pagination.page  = page;
    this.pagination.limit = limit;
    return this;
  }

  // ── CURSOR PAGINATION ────────────────────────────────────────
  // ?cursor=<lastId>&limit=20
  // Better for infinite scroll / real-time feeds than offset pagination
  cursorPaginate() {
    const limit = Math.min(
      Math.max(parseInt(this.queryString.limit, 10) || 20, 1),
      100
    );
    const cursor = this.queryString.cursor;

    this.pagination.limit      = limit;
    this.pagination.cursorMode = true;

    if (cursor) {
      if (!mongoose.Types.ObjectId.isValid(cursor)) {
        // Invalid cursor — just ignore it and start from beginning
        // (don't throw — bad cursor is not a fatal error)
      } else {
        this.query = this.query.find({
          _id: { $gt: new mongoose.Types.ObjectId(cursor) }
        });
      }
    }

    // Only force _id sort if no custom sort was applied
    // Preserves user's sort intent (e.g. ?sort=-createdAt with cursor)
    if (!this._sortApplied) {
      this.query = this.query.sort({ _id: 1 });
    }

    this.query = this.query.limit(limit + 1);   // fetch 1 extra to detect next page
    return this;
  }

  // ── POPULATE ─────────────────────────────────────────────────
  populate(paths) {
    if (!paths || paths.length === 0) return this;
    paths.forEach(p => {
      this.query = this.query.populate(p);
    });
    return this;
  }

  // ── EXECUTE ──────────────────────────────────────────────────
  // Runs the query and returns { data, results, pagination }
  async execute(Model) {
    // ── Cursor mode ──────────────────────────────────────────
    if (this.pagination.cursorMode) {
      const docs        = await this.query;
      const hasNextPage = docs.length > this.pagination.limit;
      if (hasNextPage) docs.pop();   // remove the extra doc

      const nextCursor = hasNextPage ? docs[docs.length - 1]?._id : null;

      return {
        data:    docs,
        results: docs.length,
        pagination: {
          limit:       this.pagination.limit,
          nextCursor,
          hasNextPage
        }
      };
    }

    // ── Offset mode ──────────────────────────────────────────
    const totalResults = await Model.countDocuments(this.query.getFilter());
    const totalPages   = Math.ceil(totalResults / this.pagination.limit);
    const skip         = (this.pagination.page - 1) * this.pagination.limit;

    this.query.skip(skip).limit(this.pagination.limit);

    const docs = await this.query.lean();

    return {
      data:    docs,
      results: docs.length,
      pagination: {
        page:         this.pagination.page,
        limit:        this.pagination.limit,
        totalResults,
        totalPages,
        hasNextPage:  this.pagination.page < totalPages,
        hasPrevPage:  this.pagination.page > 1
      }
    };
  }
}

module.exports = ApiFeatures;