// models/progressModel.js
// ============================================================
// PROGRESS & ANALYTICS — The feature students pay for
// ============================================================
// ProgressTracking     → lesson/quiz/assignment completion
// PerformanceAnalytics → subject-wise accuracy, weak areas
// StudyPlan            → daily study targets
// Certificate          → issued on course completion
// ============================================================

const mongoose = require('mongoose');

// ==================== PROGRESS TRACKING SCHEMA ====================
// Single source of truth for a student's journey through a course
const progressTrackingSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  course:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },

  completedLessons: [{
    lesson:      { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    completedAt: Date,
    timeSpent:   Number,   // seconds
    attempts:    { type: Number, default: 1 },
    lastPosition: Number   // video resume position in seconds
  }],

  completedQuizzes: [{
    quiz:        { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
    score:       Number,
    percentage:  Number,
    completedAt: Date,
    attempts:    { type: Number, default: 1 }
  }],

  completedAssignments: [{
    assignment:  { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    score:       Number,
    percentage:  Number,
    completedAt: Date
  }],

  courseProgressPercentage: { type: Number, default: 0, min: 0, max: 100 },
  totalTimeSpent:           { type: Number, default: 0 },   // minutes
  lastActivity:             Date,

  isCompleted:   { type: Boolean, default: false },
  completedAt:   Date,

  // Certificate generated?
  certificate:   { type: mongoose.Schema.Types.ObjectId, ref: 'Certificate' }
}, { timestamps: true });

progressTrackingSchema.index({ student: 1, course: 1 }, { unique: true });
progressTrackingSchema.index({ student: 1, isCompleted: 1 });

// ==================== PERFORMANCE ANALYTICS SCHEMA ====================
// Exam-goal level analytics — the most valuable feature
const subjectAnalyticsSchema = new mongoose.Schema({
  subject:   { type: String, required: true },

  // Question-level stats
  attempted: { type: Number, default: 0 },
  correct:   { type: Number, default: 0 },
  incorrect: { type: Number, default: 0 },
  skipped:   { type: Number, default: 0 },

  accuracy:  { type: Number, default: 0 },     // %
  avgTime:   { type: Number, default: 0 },     // seconds per question
  totalMarks: { type: Number, default: 0 },

  // Rolling trend (last 5 tests)
  trend:     { type: String, enum: ['improving', 'declining', 'stable', 'new'], default: 'new' },

  // Chapter breakdown
  chapterStats: [{
    chapter:   String,
    attempted: Number,
    correct:   Number,
    accuracy:  Number
  }]
}, { _id: false });

const performanceAnalyticsSchema = new mongoose.Schema({
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
  examGoal: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamGoal', required: true },

  subjectWise: [subjectAnalyticsSchema],

  // Auto-calculated from subjectWise
  weakTopics:   [String],     // topics with accuracy < 40%
  strongTopics: [String],     // topics with accuracy > 75%

  // Overall
  totalQuestionsAttempted: { type: Number, default: 0 },
  overallAccuracy:         { type: Number, default: 0 },
  totalTimeSpent:          { type: Number, default: 0 },   // minutes

  // Mock test history summary
  mockTestHistory: [{
    mockTest:    { type: mongoose.Schema.Types.ObjectId, ref: 'MockTest' },
    attempt:     { type: mongoose.Schema.Types.ObjectId, ref: 'MockTestAttempt' },
    score:       Number,
    percentage:  Number,
    percentile:  Number,
    attemptedAt: Date
  }],

  // Study streak
  studyStreak:  { type: Number, default: 0 },    // current consecutive days
  longestStreak: { type: Number, default: 0 },
  lastStudyDate: Date,

  // Updated every time a mock test is submitted
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

performanceAnalyticsSchema.index({ student: 1, examGoal: 1 }, { unique: true });

// ==================== STUDY PLAN SCHEMA ====================
// Daily targets set by the system or instructor
const studyPlanSchema = new mongoose.Schema({
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
  batch:    { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  examGoal: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamGoal', required: true },

  title:       String,   // "60-Day UPSC Prelims Crash Course"
  description: String,
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },

  // Daily schedule
  dailyTargets: [{
    date:        Date,
    subject:     String,
    tasks: [{
      type:       String,   // "lesson", "quiz", "mock_test", "revision", "dpq"
      refId:      { type: mongoose.Schema.Types.ObjectId },   // lesson / quiz / mock test ID
      title:      String,
      duration:   Number,   // planned minutes
      isComplete: { type: Boolean, default: false },
      completedAt: Date
    }],
    plannedDuration:  Number,   // total minutes planned
    actualDuration:   Number,   // minutes actually spent
    isComplete:       { type: Boolean, default: false }
  }],

  totalDaysPlanned:    Number,
  completedDays:       { type: Number, default: 0 },
  overallProgress:     { type: Number, default: 0 },   // %

  status: {
    type: String,
    enum: ['active', 'completed', 'paused', 'abandoned'],
    default: 'active'
  }
}, { timestamps: true });

studyPlanSchema.index({ student: 1, examGoal: 1 });
studyPlanSchema.index({ student: 1, status: 1 });

// ==================== CERTIFICATE SCHEMA ====================
const certificateSchema = new mongoose.Schema({
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  course:   { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },

  certificateNumber: { type: String, required: true, unique: true },

  // Snapshot at time of issue (in case course/user name changes)
  studentName:    String,
  courseName:     String,
  instructorName: String,
  instructor:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  issueDate:   { type: Date, default: Date.now },
  expiryDate:  Date,

  grade:       String,     // "A", "B+", "Distinction"
  percentage:  Number,

  certificateUrl:   String,
  verificationUrl:  String,   // public URL to verify authenticity

  isValid: { type: Boolean, default: true }
}, { timestamps: true });

certificateSchema.index({ certificateNumber: 1 });
certificateSchema.index({ student: 1, course: 1 });

// ==================== EXPORTS ====================
module.exports = {
  ProgressTracking:      mongoose.models.ProgressTracking      || mongoose.model('ProgressTracking',      progressTrackingSchema),
  PerformanceAnalytics:  mongoose.models.PerformanceAnalytics  || mongoose.model('PerformanceAnalytics',  performanceAnalyticsSchema),
  StudyPlan:             mongoose.models.StudyPlan             || mongoose.model('StudyPlan',             studyPlanSchema),
  Certificate:           mongoose.models.Certificate           || mongoose.model('Certificate',           certificateSchema)
};
