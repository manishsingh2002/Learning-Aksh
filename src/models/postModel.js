// models/postModel.js
// ============================================================
// POST — Blog, Current Affairs, Announcements, News
// Current Affairs is a critical feature for UPSC/SSC students
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

const postSchema = new mongoose.Schema({
  title:  { type: String, required: true, trim: true },
  slug:   { type: String, unique: true, lowercase: true, index: true },

  type: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('post_type', value);
      },
      message: 'Invalid post type. Must be defined in Master data.'
    }
  },

  language: {
    type: String,
    default: 'en',
    lowercase: true,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('language', value);
      },
      message: 'Invalid language selection'
    }
  },

  excerpt:   { type: String, required: true, maxLength: 500 },
  content:   { type: String, required: true },
  thumbnail: String,

  // For Current Affairs
  sourceName: { type: String, trim: true },
  sourceUrl:  { type: String, trim: true },
  eventDate:  { type: Date, index: true },

  // Monthly PDF compilations
  attachmentUrl:  String,
  attachmentName: String,

  // Relations
  author:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', index: true },

  // Link to relevant exam goals
  examGoals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ExamGoal' }],
  tags:      [String],

  // Metrics
  readTime: { type: Number, default: 5 },
  views:    { type: Number, default: 0 },
  likes:    { type: Number, default: 0 },
  likedBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // SEO
  seo: {
    metaTitle:       String,
    metaDescription: String,
    keywords:        [String]
  },

  isFeatured: { type: Boolean, default: false, index: true },

  status: {
    type: String,
    default: 'draft',
    lowercase: true,
    trim: true,
    index: true,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('post_status', value);
      },
      message: 'Invalid post status. Must be defined in Master data.'
    }
  },

  publishedAt: Date,
  isDeleted:   { type: Boolean, default: false }
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== PRE-SAVE HOOKS ====================
postSchema.pre('save', function (next) {
  // Auto-generate slug
  if (this.isModified('title') && !this.slug) {
    this.slug = `${slugify(this.title)}-${nanoid(6)}`;
  }

  // Auto-set published date
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  // Auto-calculate read time (200 wpm)
  if (this.isModified('content') && this.content) {
    const plainText = this.content.replace(/<[^>]*>?/gm, '');
    const wordCount = plainText.split(/\s+/).length;
    this.readTime = Math.max(1, Math.ceil(wordCount / 200));
  }

  next();
});

// ==================== INDEXES ====================
postSchema.index({ type: 1, status: 1, publishedAt: -1 });
postSchema.index({ examGoals: 1, type: 1, status: 1 });
postSchema.index({ title: 'text', content: 'text', tags: 'text' });

module.exports = mongoose.models.Post || mongoose.model('Post', postSchema);
