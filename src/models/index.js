// models/index.js
// ============================================================
// MODELS INDEX — Single import point for the entire platform
// ============================================================
// Usage:
//   const { User, Course, Batch, ExamGoal } = require('./models');
// ============================================================

const Master             = require('./masterModel');
const Category           = require('./categoryModel');
const ExamGoal           = require('./examGoalModel');

const { User, InstructorProfile, StudentProfile }        = require('./userModel');
const Batch                                               = require('./batchModel');
const { Course, Section, Lesson, InstructorInvitation }  = require('./courseModel');
const { LiveClass, DoubtSession }                         = require('./liveClassModel');

const {
  Quiz, QuizQuestion,
  TestSeries, MockTest, MockTestQuestion, MockTestAttempt,
  DailyPractice, DailyPracticeAttempt
} = require('./testModel');

const { Payment, Enrollment, Coupon }   = require('./paymentModel');

const {
  ProgressTracking, PerformanceAnalytics,
  StudyPlan, Certificate
} = require('./progressModel');

const {
  Assignment, AssignmentSubmission,
  CodingExercise, CodingSubmission
} = require('./assignmentModel');

const { Review, Discussion, DiscussionReply } = require('./communityModel');

const Post = require('./postModel');

const {
  StudentNote, Badge, UserBadge,
  Notification, Announcement
} = require('./engagementModel');

const { AuditLog, ActivityLog, SystemSettings } = require('./systemModel');

module.exports = {
  // ── Core / Lookup ──────────────────────────────────────────
  Master,
  Category,
  ExamGoal,

  // ── Users ──────────────────────────────────────────────────
  User,
  InstructorProfile,
  StudentProfile,

  // ── Learning Products ──────────────────────────────────────
  Batch,
  Course,
  Section,
  Lesson,
  InstructorInvitation,

  // ── Live ───────────────────────────────────────────────────
  LiveClass,
  DoubtSession,

  // ── Tests ──────────────────────────────────────────────────
  Quiz,
  QuizQuestion,
  TestSeries,
  MockTest,
  MockTestQuestion,
  MockTestAttempt,
  DailyPractice,
  DailyPracticeAttempt,

  // ── Payments ───────────────────────────────────────────────
  Payment,
  Enrollment,
  Coupon,

  // ── Progress & Analytics ───────────────────────────────────
  ProgressTracking,
  PerformanceAnalytics,
  StudyPlan,
  Certificate,

  // ── Assignments ────────────────────────────────────────────
  Assignment,
  AssignmentSubmission,
  CodingExercise,
  CodingSubmission,

  // ── Community ──────────────────────────────────────────────
  Review,
  Discussion,
  DiscussionReply,

  // ── Content ────────────────────────────────────────────────
  Post,

  // ── Engagement ─────────────────────────────────────────────
  StudentNote,
  Badge,
  UserBadge,
  Notification,
  Announcement,

  // ── System ─────────────────────────────────────────────────
  AuditLog,
  ActivityLog,
  SystemSettings
};
