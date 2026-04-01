// models/examGoalModel.js
// ============================================================
// EXAM GOAL — The anchor entity for Indian exam prep platforms
// Everything (batches, mock tests, study plans) links here.
// ============================================================
// Example ExamGoals:
//   UPSC CSE 2026 | SSC CGL 2025 | IBPS PO 2025
//   GATE CS 2026   | JEE Advanced 2026 | NEET 2026

const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const slugify = (text) =>
  text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

// ==================== SYLLABUS TOPIC SUB-SCHEMA ====================
const syllabusTopicSchema = new mongoose.Schema({
  name:       { type: String, required: true },   // e.g., "Ancient India"
  description: String,
  resources:  [String]                            // reference PDFs / links
}, { _id: true });

// ==================== SYLLABUS SUBJECT SUB-SCHEMA ====================
const syllabusSubjectSchema = new mongoose.Schema({
  subject:    { type: String, required: true },   // e.g., "History"
  weightage:  { type: Number, default: 0 },       // % of paper
  topics:     [syllabusTopicSchema]
}, { _id: true });

// ==================== EXAM STAGE / PHASE ====================
// Most Indian exams have multiple stages: Prelims → Mains → Interview
const examStageSchema = new mongoose.Schema({
  name:       { type: String, required: true },   // "Prelims", "Mains", "Interview"
  order:      { type: Number, required: true },   // 1, 2, 3
  examDate:   Date,
  description: String,
  pattern: {
    totalQuestions:  Number,
    totalMarks:      Number,
    duration:        Number,                      // minutes
    hasNegativeMarking: { type: Boolean, default: false },
    negativeMarkingValue: { type: Number, default: 0.33 },
    sections: [{
      name:          String,                      // "General Studies Paper I"
      totalQuestions: Number,
      totalMarks:    Number,
      optional:      { type: Boolean, default: false }
    }]
  }
}, { _id: true });

// ==================== EXAM GOAL SCHEMA ====================
const examGoalSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },  // "UPSC CSE 2026"
  slug:       { type: String, unique: true, lowercase: true, index: true },
  description: String,
  icon:       String,                   // emoji or image URL
  bannerImage: String,

  examBody: {
    type: String,
    required: true,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('exam_body', value);
      },
      message: 'Invalid exam body. Must be defined in Master data.'
    }
  },

  // e.g., "SSC CGL" — the recurring exam (name without year)
  examSeries:  { type: String, trim: true },
  examYear:    { type: Number },
  announcedOn: Date,
  lastDateToApply: Date,

  stages:    [examStageSchema],          // Prelims, Mains, Interview
  syllabus:  [syllabusSubjectSchema],    // Full subject-wise syllabus

  // Eligibility
  eligibility: {
    minAge:       Number,
    maxAge:       Number,
    minEducation: String,               // "Graduation", "12th Pass"
    nationality:  String
  },

  // Quick stats for listing page
  totalVacancies:   Number,
  applicationFeeGeneral: Number,        // in INR
  applicationFeeReserved: Number,       // SC/ST/OBC etc.

  // Instructors managing this goal's content
  leadInstructors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  totalEnrolledStudents: { type: Number, default: 0 },
  totalBatches:          { type: Number, default: 0 },
  totalMockTests:        { type: Number, default: 0 },

  isActive:   { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  isDeleted:  { type: Boolean, default: false }
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== PRE-SAVE HOOKS ====================
examGoalSchema.pre('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = `${slugify(this.name)}-${nanoid(6)}`;
  }
  next();
});

// ==================== VIRTUALS ====================
examGoalSchema.virtual('daysUntilExam').get(function () {
  const firstStage = this.stages?.find(s => s.order === 1);
  if (!firstStage?.examDate) return null;
  const diff = firstStage.examDate - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// ==================== INDEXES ====================
examGoalSchema.index({ examBody: 1, isActive: 1 });
examGoalSchema.index({ isFeatured: 1, isActive: 1 });
examGoalSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.models.ExamGoal || mongoose.model('ExamGoal', examGoalSchema);
