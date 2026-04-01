// models/communityModel.js
// ============================================================
// COMMUNITY — Reviews, Discussions, Replies
// ============================================================

const mongoose = require('mongoose');

// ==================== REVIEW SCHEMA ====================
const reviewSchema = new mongoose.Schema({
  // Can review a course or a batch
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  batch:  { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },

  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating:  { type: Number, required: true, min: 1, max: 5 },
  title:   String,
  comment: { type: String, required: true },

  pros:    [String],
  cons:    [String],

  isVerified:  { type: Boolean, default: false },     // purchased before reviewing
  helpfulCount: { type: Number, default: 0 },

  replyFromInstructor: {
    comment:   String,
    repliedAt: Date
  },

  isApproved: { type: Boolean, default: true }
}, { timestamps: true });

// ==================== STATICS ====================
reviewSchema.statics.calcAverageRatings = async function (courseId) {
  const stats = await this.aggregate([
    { $match: { course: courseId } },
    { $group: { _id: '$course', rating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
  ]);

  const Course = mongoose.model('Course');
  if (stats.length > 0) {
    await Course.findByIdAndUpdate(courseId, {
      rating:       Math.round(stats[0].rating * 10) / 10,
      totalReviews: stats[0].totalReviews
    });
  } else {
    await Course.findByIdAndUpdate(courseId, { rating: 0, totalReviews: 0 });
  }
};

reviewSchema.post('save', function () {
  if (this.course) this.constructor.calcAverageRatings(this.course);
});

reviewSchema.post(/^findOneAnd/, async function (doc) {
  if (doc && doc.course) {
    await doc.constructor.calcAverageRatings(doc.course);
  }
});

reviewSchema.index({ course: 1, user: 1 }, { unique: true });
reviewSchema.index({ batch: 1, user: 1 });
reviewSchema.index({ rating: -1 });

// ==================== DISCUSSION SCHEMA ====================
const discussionSchema = new mongoose.Schema({
  course:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  lesson:  { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
  batch:   { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  title:   { type: String, required: true },
  content: { type: String, required: true },

  // For video timestamp-linked discussions
  videoTimestamp: Number,    // seconds into video where question is asked

  likes:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isPinned:    { type: Boolean, default: false },
  isResolved:  { type: Boolean, default: false },
  totalReplies: { type: Number, default: 0 },

  // Tags for filtering
  tags: [String]
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

discussionSchema.virtual('replies', {
  ref:          'DiscussionReply',
  foreignField: 'discussion',
  localField:   '_id'
});

discussionSchema.index({ course: 1, lesson: 1 });
discussionSchema.index({ batch: 1 });
discussionSchema.index({ user: 1, createdAt: -1 });

// ==================== DISCUSSION REPLY SCHEMA ====================
const discussionReplySchema = new mongoose.Schema({
  discussion: { type: mongoose.Schema.Types.ObjectId, ref: 'Discussion', required: true },
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User',       required: true },
  content:    { type: String, required: true },
  isEdited:   { type: Boolean, default: false },
  likes:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Instructor answer flag
  isInstructorAnswer: { type: Boolean, default: false }
}, { timestamps: true });

discussionReplySchema.index({ discussion: 1, createdAt: 1 });

// ==================== EXPORTS ====================
module.exports = {
  Review:           mongoose.models.Review           || mongoose.model('Review',           reviewSchema),
  Discussion:       mongoose.models.Discussion       || mongoose.model('Discussion',       discussionSchema),
  DiscussionReply:  mongoose.models.DiscussionReply  || mongoose.model('DiscussionReply',  discussionReplySchema)
};
