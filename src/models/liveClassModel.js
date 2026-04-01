// models/liveClassModel.js
// ============================================================
// LIVE CLASS — Scheduled live sessions (the heartbeat of
// Indian ed-tech: PW, Unacademy, Vedantu all run on this)
// ============================================================

const mongoose = require('mongoose');

// ==================== DOUBT SESSION SCHEMA ====================
// Separate from main live class — Q&A / doubt clearing sessions
const doubtSessionSchema = new mongoose.Schema({
  batch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  title:      { type: String, required: true },
  subject:    String,

  scheduledAt: { type: Date, required: true },
  duration:    { type: Number, default: 60 },  // minutes
  streamUrl:   String,
  recordingUrl: String,

  attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  questions: [{
    student:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    question:    String,
    isAnswered:  { type: Boolean, default: false },
    answeredAt:  Date,
    upvotes:     { type: Number, default: 0 }
  }],

  status: {
    type: String,
    enum: ['scheduled', 'live', 'completed', 'cancelled'],
    default: 'scheduled'
  }
}, { timestamps: true });

// ==================== LIVE CLASS SCHEMA ====================
const liveClassSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: String,

  // Belongs to a batch (primary) and optionally a course
  batch:  { type: mongoose.Schema.Types.ObjectId, ref: 'Batch',  required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },

  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Exam context
  examGoal: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamGoal' },
  subject:  String,   // "History"
  chapter:  String,   // "Modern India"
  topic:    String,   // "1857 Revolt"

  // Scheduling
  scheduledAt:  { type: Date, required: true },
  duration:     { type: Number, default: 60 },   // minutes
  endTime:      Date,                             // calculated on save

  // Streaming
  streamUrl:     String,    // YouTube/Zoom/custom RTMP
  streamKey:     { type: String, select: false }, // secret
  streamPlatform: String,   // "youtube", "zoom", "custom"
  recordingUrl:  String,    // auto-saved after class
  thumbnailUrl:  String,

  // Resources shared during class
  resources: [{
    title:     String,
    url:       String,
    type:      String    // "pdf", "image", "link"
  }],

  // Engagement
  attendees:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  totalAttendees: { type: Number, default: 0 },
  peakViewers:    { type: Number, default: 0 },
  totalViews:     { type: Number, default: 0 },  // includes replay views

  // Class notes (posted after)
  notes: String,
  notesUrl: String,

  // Reminder sent?
  reminderSent: { type: Boolean, default: false },

  status: {
    type: String,
    enum: ['scheduled', 'live', 'completed', 'cancelled', 'postponed'],
    default: 'scheduled'
  },

  // If postponed, new time
  postponedTo:     Date,
  postponeReason:  String,

  isRecorded:        { type: Boolean, default: true },
  isRecordingPublic: { type: Boolean, default: true },
  isDeleted:         { type: Boolean, default: false }
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== HOOKS ====================
liveClassSchema.pre('save', function (next) {
  if (this.scheduledAt && this.duration) {
    this.endTime = new Date(this.scheduledAt.getTime() + this.duration * 60 * 1000);
  }
  next();
});

// ==================== INDEXES ====================
liveClassSchema.index({ batch: 1, scheduledAt: 1 });
liveClassSchema.index({ instructor: 1, scheduledAt: 1 });
liveClassSchema.index({ examGoal: 1, subject: 1 });
liveClassSchema.index({ status: 1, scheduledAt: 1 });

doubtSessionSchema.index({ batch: 1, scheduledAt: 1 });

// ==================== EXPORTS ====================
module.exports = {
  LiveClass:     mongoose.models.LiveClass     || mongoose.model('LiveClass',     liveClassSchema),
  DoubtSession:  mongoose.models.DoubtSession  || mongoose.model('DoubtSession',  doubtSessionSchema)
};
