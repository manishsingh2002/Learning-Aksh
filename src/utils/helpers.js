'use strict';

// utils/helpers.js
// ============================================================
// HELPERS — Pure utility functions (no side effects, no DB)
// ============================================================

const crypto = require('crypto');

// ── STRING ───────────────────────────────────────────────────

/**
 * Slugify a string
 * "UPSC CSE 2026 (Prelims)" → "upsc-cse-2026-prelims"
 */
const slugify = (text) =>
  text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

/**
 * Capitalize first letter of each word
 */
const titleCase = (str) =>
  str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Truncate a string to maxLength, appending '...' if cut
 */
const truncate = (str, maxLength = 100) =>
  str?.length > maxLength ? `${str.substring(0, maxLength).trim()}...` : str;

/**
 * Strip HTML tags from a string
 */
const stripHtml = (html) =>
  html?.replace(/<[^>]*>?/gm, '') || '';

/**
 * Calculate estimated read time in minutes
 * @param {string} content - raw or HTML content
 * @param {number} [wpm=200] - words per minute
 */
const calcReadTime = (content, wpm = 200) => {
  const text      = stripHtml(content);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / wpm));
};

/**
 * Generate a unique slug (appends nanoid suffix)
 */
const uniqueSlug = (text, suffix = 6) => {
  const base   = slugify(text);
  const random = crypto.randomBytes(Math.ceil(suffix / 2))
                       .toString('hex')
                       .slice(0, suffix);
  return `${base}-${random}`;
};

// ── NUMBERS / MATH ───────────────────────────────────────────

/**
 * Round to N decimal places
 */
const round = (num, decimals = 2) =>
  Math.round(num * 10 ** decimals) / 10 ** decimals;

/**
 * Clamp a number between min and max
 */
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

/**
 * Calculate percentage
 */
const calcPercentage = (obtained, total) => {
  if (!total) return 0;
  return round((obtained / total) * 100, 2);
};

/**
 * Format Indian currency
 * 1500000 → "₹15,00,000"
 */
const formatINR = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
          .format(amount);

// ── DATES / TIME ─────────────────────────────────────────────

/**
 * Format seconds into HH:MM:SS display string
 * 3661 → "1:01:01"
 */
const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Format minutes into human-readable string
 * 90 → "1h 30m"
 */
const formatMinutes = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

/**
 * Return start and end of a date (midnight to midnight) in IST
 */
const getDayRange = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const start = new Date(d);
  const end   = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

/**
 * Days between two dates
 */
const daysBetween = (date1, date2) =>
  Math.abs(Math.ceil((date2 - date1) / (1000 * 60 * 60 * 24)));

/**
 * Check if a date is today
 */
const isToday = (date) => {
  const d = new Date(date);
  const t = new Date();
  return d.getDate()     === t.getDate()  &&
         d.getMonth()    === t.getMonth() &&
         d.getFullYear() === t.getFullYear();
};

// ── ARRAYS / OBJECTS ─────────────────────────────────────────

/**
 * Remove duplicate values from an array
 */
const unique = (arr) => [...new Set(arr)];

/**
 * Chunk an array into groups of size n
 * chunk([1,2,3,4,5], 2) → [[1,2],[3,4],[5]]
 */
const chunk = (arr, size) => {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
};

/**
 * Pick only specified keys from an object
 */
const pick = (obj, keys) =>
  keys.reduce((acc, key) => { if (key in obj) acc[key] = obj[key]; return acc; }, {});

/**
 * Omit specified keys from an object
 */
const omit = (obj, keys) => {
  const result = { ...obj };
  keys.forEach(k => delete result[k]);
  return result;
};

/**
 * Deep flatten nested array
 */
const flatDeep = (arr) => arr.reduce(
  (acc, val) => Array.isArray(val) ? acc.concat(flatDeep(val)) : acc.concat(val), []
);

// ── EXAM / SCORE HELPERS ─────────────────────────────────────

/**
 * Calculate mock test score with negative marking
 * @param {Array}  answers          - [{ isCorrect, marksObtained }]
 * @param {number} negativeMarkValue - deduction per wrong answer (e.g. 0.33)
 */
const calcMockTestScore = (answers, negativeMarkValue = 0) => {
  let score     = 0;
  let correct   = 0;
  let incorrect = 0;
  let skipped   = 0;

  for (const ans of answers) {
    if (ans.selectedOptionIndex === null || ans.selectedOptionIndex === undefined) {
      skipped++;
      continue;
    }
    if (ans.isCorrect) {
      score += ans.marksObtained || 1;
      correct++;
    } else {
      score -= negativeMarkValue;
      incorrect++;
    }
  }

  return {
    score:     round(Math.max(score, 0), 2),  // score can't go below 0
    correct,
    incorrect,
    skipped,
    attempted: correct + incorrect
  };
};

/**
 * Determine grade from percentage
 */
const getGrade = (percentage) => {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
};

/**
 * Generate a unique certificate number
 * Format: EP-YYYYMMDD-XXXXXX
 */
const generateCertificateNumber = () => {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `EP-${date}-${random}`;
};

// ── PAGINATION ───────────────────────────────────────────────

/**
 * Build a standard pagination meta object
 */
const buildPaginationMeta = (page, limit, total) => ({
  page,
  limit,
  totalResults: total,
  totalPages:   Math.ceil(total / limit),
  hasNextPage:  page < Math.ceil(total / limit),
  hasPrevPage:  page > 1
});

// ── RESPONSE HELPERS ─────────────────────────────────────────

/**
 * Send a success response
 */
const sendSuccess = (res, data, statusCode = 200, message = 'success') =>
  res.status(statusCode).json({ status: 'success', message, data });

/**
 * Send a paginated success response
 */
const sendPaginated = (res, data, pagination, message = 'success') =>
  res.status(200).json({ status: 'success', message, results: data.length, pagination, data });

// ── EXPORTS ──────────────────────────────────────────────────
module.exports = {
  // String
  slugify, titleCase, truncate, stripHtml, calcReadTime, uniqueSlug,
  // Numbers
  round, clamp, calcPercentage, formatINR,
  // Dates
  formatDuration, formatMinutes, getDayRange, daysBetween, isToday,
  // Arrays/Objects
  unique, chunk, pick, omit, flatDeep,
  // Exam
  calcMockTestScore, getGrade, generateCertificateNumber,
  // Pagination
  buildPaginationMeta,
  // Response
  sendSuccess, sendPaginated
};