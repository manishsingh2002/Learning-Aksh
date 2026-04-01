// models/batchModel.js
// ============================================================
// BATCH — The core product unit (like PW/Unacademy batches)
// A student buys a Batch. It bundles: live classes + courses
// + mock test series + study material.
// ============================================================

const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const slugify = (text) =>
  text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

// ==================== BATCH SCHEMA ====================
const batchSchema = new mongoose.Schema({
  name:   { type: String, required: true, trim: true },  // "UPSC 2026 Foundation Batch"
  slug:   { type: String, unique: true, lowercase: true },
  description: String,
  thumbnail: String,
  bannerImage: String,

  // What exam is this batch preparing for
  examGoal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamGoal',
    required: true
  },

  // Which exam stage (Prelims / Mains / Full)
  examStage: String,   // "Prelims", "Mains", "Full Course"

  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },

  primaryInstructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  instructors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  type: {
    type: String,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('batch_type', value);
      },
      message: 'Invalid batch type'
    }
  },

  language: {
    type: String,
    default: 'hi',
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('language', value);
      },
      message: 'Invalid language'
    }
  },

  // What's included
  features: {
    hasLiveClasses:    { type: Boolean, default: false },
    hasRecordedVideos: { type: Boolean, default: true },
    hasMockTests:      { type: Boolean, default: false },
    hasDoubtSessions:  { type: Boolean, default: false },
    hasPDFNotes:       { type: Boolean, default: false },
    hasCurrentAffairs: { type: Boolean, default: false },
    hasDailyPractice:  { type: Boolean, default: false }
  },

  // Content bundled in this batch
  courses:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  testSeries:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestSeries' }],

  // Schedule
  startDate: { type: Date, required: true },
  endDate:   { type: Date, required: true },

  // Pricing
  isFree:        { type: Boolean, default: false },
  price:         { type: Number, default: 0 },
  discountPrice: { type: Number, default: 0 },
  currency:      { type: String, default: 'INR' },

  // Access
  maxStudents:       { type: Number, default: null },  // null = unlimited
  enrolledStudents:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  totalEnrollments:  { type: Number, default: 0 },

  // SEO
  tags: [String],
  whatYouWillLearn: [String],
  targetAudience:   [String],
  requirements:     [String],

  isPublished: { type: Boolean, default: false },
  isApproved:  { type: Boolean, default: false },
  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:  Date,
  isDeleted:   { type: Boolean, default: false }
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== HOOKS ====================
batchSchema.pre('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = `${slugify(this.name)}-${nanoid(6)}`;
  }
  next();
});

// ==================== VIRTUALS ====================
batchSchema.virtual('isFull').get(function () {
  if (!this.maxStudents) return false;
  return this.totalEnrollments >= this.maxStudents;
});

batchSchema.virtual('durationDays').get(function () {
  if (!this.startDate || !this.endDate) return null;
  return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
});

// ==================== INDEXES ====================
batchSchema.index({ examGoal: 1, isPublished: 1 });
batchSchema.index({ primaryInstructor: 1 });
batchSchema.index({ startDate: 1, endDate: 1 });
batchSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.models.Batch || mongoose.model('Batch', batchSchema);
