// models/testModel.js
// ============================================================
// QUIZ, TEST SERIES, MOCK TEST — Core exam prep content
// ============================================================
// TestSeries  → the "product" (bundle of MockTests)
// MockTest    → a single paper (e.g., SSC CGL Tier 1 2024)
// MockTestQuestion → individual question in a MockTest
// MockTestAttempt  → a student's attempt at a MockTest
// Quiz        → lightweight in-lesson quiz
// QuizQuestion → question in a Quiz
// DailyPracticeQuestion → standalone daily question set
// ============================================================

const mongoose = require('mongoose');

// ==================== QUIZ QUESTION SCHEMA ====================
const quizQuestionSchema = new mongoose.Schema({
  quiz:     { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  question: { type: String, required: true },

  type: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('question_type', value);
      },
      message: 'Invalid question type'
    }
  },

  options:       [{ text: String, isCorrect: Boolean }],
  correctAnswer: String,
  points:        { type: Number, default: 1 },
  explanation:   String,
  order:         Number
}, { timestamps: true });

// ==================== QUIZ SCHEMA ====================
const quizSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: String,
  course:      { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  lesson:      { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },

  timeLimit:      { type: Number, default: 30 },    // minutes
  passingScore:   { type: Number, min: 0, max: 100, default: 70 },
  maxAttempts:    { type: Number, default: 3 },
  totalQuestions: { type: Number, default: 0 },
  totalPoints:    { type: Number, default: 0 },

  isPublished: { type: Boolean, default: true },
  isDeleted:   { type: Boolean, default: false }
}, { timestamps: true });

quizSchema.index({ course: 1, lesson: 1 });

// ==================== TEST SERIES SCHEMA ====================
// The "product" students buy — bundles multiple MockTests
const testSeriesSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: String,
  thumbnail:   String,

  // Primary classification
  examGoal: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamGoal', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },

  // Which stage this series prepares for
  examStage: String,    // "Prelims", "Mains", "Full"

  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Tests in this bundle (ordered)
  tests: [{
    mockTestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MockTest' },
    subject:    String,    // "History"
    chapter:    String,    // "Modern India"
    order:      { type: Number, default: 0 },
    isPreview:  { type: Boolean, default: false }  // free preview test
  }],

  // Pricing
  isFree:        { type: Boolean, default: false },
  price:         { type: Number, default: 0 },
  discountPrice: { type: Number, default: 0 },
  currency:      { type: String, default: 'INR' },

  // Validity (access expires after N days)
  validityDays:  { type: Number, default: 365 },

  totalTests:        { type: Number, default: 0 },
  totalEnrollments:  { type: Number, default: 0 },

  isPublished: { type: Boolean, default: false },
  isApproved:  { type: Boolean, default: false },
  isDeleted:   { type: Boolean, default: false },

  tags: [String]
}, { timestamps: true });

testSeriesSchema.index({ examGoal: 1, isPublished: 1 });
testSeriesSchema.index({ title: 'text', description: 'text' });

// ==================== MOCK TEST SCHEMA ====================
const mockTestSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: String,

  examGoal:   { type: mongoose.Schema.Types.ObjectId, ref: 'ExamGoal', required: true },
  category:   { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Paper metadata
  subject:    String,   // If subject-specific test
  chapter:    String,
  examStage:  String,   // "Prelims", "Mains"
  year:       Number,   // 2024 (for PYQ papers)
  isPYQ:      { type: Boolean, default: false },  // Previous Year Question

  level: {
    type: String,
    required: true,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('difficulty_level', value);
      },
      message: 'Invalid difficulty level'
    }
  },

  duration:       { type: Number, required: true },   // minutes
  totalQuestions: { type: Number, default: 0 },
  totalMarks:     { type: Number, default: 0 },
  passingMarks:   { type: Number, required: true },

  // Negative marking (common in Indian exams)
  hasNegativeMarking:   { type: Boolean, default: false },
  negativeMarkingValue: { type: Number, default: 0.33 },  // marks deducted per wrong

  instructions: [String],
  tags:         [String],

  // Allow free preview even in paid series
  isFreePreview: { type: Boolean, default: false },
  price:         { type: Number, default: 0 },  // for standalone purchase

  // Aggregated after each attempt
  attemptsCount: { type: Number, default: 0 },
  averageScore:  { type: Number, default: 0 },

  isPublished: { type: Boolean, default: false },
  isApproved:  { type: Boolean, default: false },
  isDeleted:   { type: Boolean, default: false }
}, { timestamps: true });

mockTestSchema.index({ examGoal: 1, subject: 1, isPublished: 1 });
mockTestSchema.index({ title: 'text', description: 'text' });

// ==================== MOCK TEST QUESTION SCHEMA ====================
const mockTestQuestionSchema = new mongoose.Schema({
  mockTest:    { type: mongoose.Schema.Types.ObjectId, ref: 'MockTest', required: true },
  sectionName: { type: String, required: true },    // "General Studies", "Reasoning"

  question:  { type: String, required: true },
  imageUrl:  String,   // question image (Hindi medium papers often have images)

  options: [{
    text:      String,
    imageUrl:  String,
    isCorrect: Boolean
  }],

  marks:         { type: Number, default: 1 },
  negativeMarks: { type: Number, default: 0 },
  explanation:   String,
  explanationImageUrl: String,

  // Tagging for analytics
  subject:    String,
  chapter:    String,
  topic:      String,
  difficulty: String,  // easy, medium, hard

  language: { type: String, default: 'en' },   // en, hi, bilingual
  order:    Number
}, { timestamps: true });

mockTestQuestionSchema.index({ mockTest: 1, sectionName: 1, order: 1 });

// ==================== MOCK TEST ATTEMPT SCHEMA ====================
const mockTestAttemptSchema = new mongoose.Schema({
  mockTest: { type: mongoose.Schema.Types.ObjectId, ref: 'MockTest', required: true },
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },

  startedAt:   { type: Date, default: Date.now },
  completedAt: Date,
  timeTaken:   Number,   // seconds

  answers: [{
    questionId:          { type: mongoose.Schema.Types.ObjectId, ref: 'MockTestQuestion' },
    selectedOptionIndex: Number,
    isCorrect:           Boolean,
    marksObtained:       Number,   // can be negative
    timeSpent:           Number    // seconds on this question
  }],

  // Section-wise breakdown
  sectionScores: [{
    sectionName:   String,
    attempted:     Number,
    correct:       Number,
    incorrect:     Number,
    skipped:       Number,
    marksObtained: Number
  }],

  score:      { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },

  // Rank among all students who attempted this test
  rank:          Number,
  totalStudents: Number,
  percentile:    Number,   // e.g., 87.5 means better than 87.5% of students

  status: {
    type: String,
    enum: ['started', 'in-progress', 'completed', 'abandoned', 'timed-out'],
    default: 'started'
  },

  isPassed:  Boolean,
  feedback:  String
}, { timestamps: true });

mockTestAttemptSchema.index({ mockTest: 1, student: 1 });
mockTestAttemptSchema.index({ student: 1, status: 1 });

// ==================== DAILY PRACTICE QUESTION SCHEMA ====================
// Date-based standalone question set (daily quizzes on platforms)
const dailyPracticeSchema = new mongoose.Schema({
  examGoal: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamGoal', required: true },
  date:     { type: Date, required: true },          // The date this is for
  subject:  { type: String, required: true },
  topic:    String,

  questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MockTestQuestion' }],

  totalQuestions: { type: Number, default: 10 },
  timeLimit:      { type: Number, default: 10 },    // minutes
  difficulty:     String,

  // Aggregated
  totalAttempts:  { type: Number, default: 0 },
  averageScore:   { type: Number, default: 0 },

  isPublished: { type: Boolean, default: false }
}, { timestamps: true });

dailyPracticeSchema.index({ examGoal: 1, date: -1 });
dailyPracticeSchema.index({ date: 1, subject: 1 }, { unique: false });

// ==================== DAILY PRACTICE ATTEMPT ====================
const dailyPracticeAttemptSchema = new mongoose.Schema({
  dailyPractice: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyPractice', required: true },
  student:       { type: mongoose.Schema.Types.ObjectId, ref: 'User',          required: true },

  answers: [{
    questionId:          { type: mongoose.Schema.Types.ObjectId, ref: 'MockTestQuestion' },
    selectedOptionIndex: Number,
    isCorrect:           Boolean,
    marksObtained:       Number
  }],

  score:      { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  timeTaken:  Number,   // seconds
  completedAt: Date
}, { timestamps: true });

dailyPracticeAttemptSchema.index({ dailyPractice: 1, student: 1 }, { unique: true });

// ==================== EXPORTS ====================
module.exports = {
  Quiz:                   mongoose.models.Quiz                   || mongoose.model('Quiz',                   quizSchema),
  QuizQuestion:           mongoose.models.QuizQuestion           || mongoose.model('QuizQuestion',           quizQuestionSchema),
  TestSeries:             mongoose.models.TestSeries             || mongoose.model('TestSeries',             testSeriesSchema),
  MockTest:               mongoose.models.MockTest               || mongoose.model('MockTest',               mockTestSchema),
  MockTestQuestion:       mongoose.models.MockTestQuestion       || mongoose.model('MockTestQuestion',       mockTestQuestionSchema),
  MockTestAttempt:        mongoose.models.MockTestAttempt        || mongoose.model('MockTestAttempt',        mockTestAttemptSchema),
  DailyPractice:          mongoose.models.DailyPractice          || mongoose.model('DailyPractice',          dailyPracticeSchema),
  DailyPracticeAttempt:   mongoose.models.DailyPracticeAttempt   || mongoose.model('DailyPracticeAttempt',   dailyPracticeAttemptSchema)
};
