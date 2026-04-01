// models/masterModel.js
// ============================================================
// MASTER DATA — Single Source of Truth for all dynamic enums
// ============================================================
// Types seeded in DB (examples):
//   user_gender       → male, female, other, prefer_not_to_say
//   user_role         → student, instructor, admin, co-instructor
//   language          → en, hi, ta, te, kn, mr, gu, bn, pa
//   ui_theme          → light, dark, system
//   topic_area        → mathematics, science, history, etc.
//   lesson_type       → video, article, quiz, assignment, coding_exercise, live_class
//   video_provider    → youtube, vimeo, cloudinary, bunny, custom
//   resource_type     → pdf, doc, zip, link, image
//   instructor_role   → primary, co-instructor, teaching_assistant
//   invitation_status → pending, accepted, expired, revoked
//   assignment_submission_type → file-upload, text, link, github
//   assignment_status → submitted, graded, revision_requested, late
//   programming_language → javascript, python, java, cpp, c, sql
//   difficulty_level  → easy, medium, hard, expert
//   code_submission_status → pending, running, passed, failed, error
//   payment_method    → razorpay, stripe, upi, bank_transfer, cash
//   payment_status    → pending, completed, failed, refunded, cancelled
//   currency          → INR, USD, EUR
//   post_type         → blog, current_affairs, announcement, news
//   post_status       → draft, published, scheduled, under_review, archived
//   badge_criteria    → first_login, course_complete, streak_7, streak_30, top_scorer, perfect_score
//   exam_body         → UPSC, SSC, IBPS, RBI, RAILWAY, STATE_PSC, GATE, JEE, NEET, NDA, CDS
//   exam_type         → prelims, mains, interview, written, practical
//   batch_type        → live, recorded, hybrid
//   section_type      → general, reasoning, mathematics, english, science, history, geography
//   question_type     → mcq, true_false, fill_blank, descriptive, match_following
//   study_plan_status → active, completed, paused, abandoned
//   notification_type → announcement, result, class_reminder, payment, badge, system

const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const slugify = (text) =>
  text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

const masterSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  name: { type: String, required: true, trim: true },
  slug: { type: String, lowercase: true, trim: true, index: true },
  code: { type: String, trim: true, uppercase: true },
  description: { type: String, trim: true },
  imageUrl: { type: String, trim: true },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Master',
    default: null
  },
  isActive: { type: Boolean, default: true },
  metadata: {
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 }
  }
}, { timestamps: true });

masterSchema.pre('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = `${slugify(this.name)}-${nanoid(6)}`;
  }
  next();
});

masterSchema.index({ type: 1, name: 1 }, { unique: true });
masterSchema.index({ type: 1, slug: 1 }, { unique: true });

// Central validation method used across all schemas
masterSchema.statics.validateValue = async function (type, value) {
  if (!value) return true;
  const exists = await this.exists({
    type: type.toLowerCase(),
    $or: [
      { code: value.toUpperCase() },
      { name: value },
      { slug: value.toLowerCase() }
    ],
    isActive: true
  });
  return !!exists;
};

module.exports = mongoose.models.Master || mongoose.model('Master', masterSchema);
