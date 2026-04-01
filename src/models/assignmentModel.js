// models/assignmentModel.js
// ============================================================
// ASSIGNMENT & CODING EXERCISE — Graded coursework
// ============================================================

const mongoose = require('mongoose');

// ==================== ASSIGNMENT SCHEMA ====================
const assignmentSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, required: true },
  course:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  lesson:  { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },

  dueDate:       Date,
  totalPoints:   { type: Number, default: 100 },
  passingPoints: { type: Number, default: 70 },
  attachments:   [String],
  resources:     [String],
  instructions:  String,

  submissionType: {
    type: String,
    default: 'file-upload',
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('assignment_submission_type', value);
      },
      message: 'Invalid submission type'
    }
  },

  allowedFileTypes: [String],
  maxFileSize: { type: Number, default: 10 },    // MB

  isPublished: { type: Boolean, default: true },
  isDeleted:   { type: Boolean, default: false }
}, { timestamps: true });

assignmentSchema.index({ course: 1, lesson: 1 });

// ==================== ASSIGNMENT SUBMISSION SCHEMA ====================
const assignmentSubmissionSchema = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  student:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',       required: true },

  submittedAt: { type: Date, default: Date.now },
  content:     String,
  attachments: [String],

  status: {
    type: String,
    default: 'submitted',
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('assignment_status', value);
      },
      message: 'Invalid assignment status'
    }
  },

  grade: {
    points:    Number,
    percentage: Number,
    feedback:   String,
    gradedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    gradedAt:   Date
  },

  isLate: { type: Boolean, default: false }
}, { timestamps: true });

assignmentSubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

// ==================== CODING EXERCISE SCHEMA ====================
const codingExerciseSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, required: true },
  course:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  lesson:  { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },

  language: {
    type: String,
    required: true,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('programming_language', value);
      },
      message: 'Invalid programming language'
    }
  },

  initialCode:  String,
  solutionCode: { type: String, select: false },

  testCases: [{
    input:          String,
    expectedOutput: String,
    isHidden:       { type: Boolean, default: false },
    points:         { type: Number, default: 1 }
  }],

  constraints: [String],
  hints:       [String],

  difficulty: {
    type: String,
    default: 'medium',
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('difficulty_level', value);
      },
      message: 'Invalid difficulty level'
    }
  },

  totalPoints:  { type: Number, default: 10 },
  timeLimit:    Number,     // seconds
  memoryLimit:  Number,     // MB

  isPublished: { type: Boolean, default: true },
  isDeleted:   { type: Boolean, default: false }
}, { timestamps: true });

codingExerciseSchema.index({ course: 1, lesson: 1 });

// ==================== CODING SUBMISSION SCHEMA ====================
const codingSubmissionSchema = new mongoose.Schema({
  exercise: { type: mongoose.Schema.Types.ObjectId, ref: 'CodingExercise', required: true },
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',           required: true },

  code:        { type: String, required: true },
  language:    String,
  submittedAt: { type: Date, default: Date.now },

  status: {
    type: String,
    default: 'pending',
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('code_submission_status', value);
      },
      message: 'Invalid code submission status'
    }
  },

  testResults: [{
    testCase:       String,
    passed:         Boolean,
    output:         String,
    expectedOutput: String,
    points:         Number,
    executionTime:  Number  // ms
  }],

  totalPoints:   Number,
  executionTime: Number,    // ms
  memoryUsed:    Number,    // KB
  error:         String
}, { timestamps: true });

codingSubmissionSchema.index({ exercise: 1, student: 1 });

// ==================== EXPORTS ====================
module.exports = {
  Assignment:           mongoose.models.Assignment           || mongoose.model('Assignment',           assignmentSchema),
  AssignmentSubmission: mongoose.models.AssignmentSubmission || mongoose.model('AssignmentSubmission', assignmentSubmissionSchema),
  CodingExercise:       mongoose.models.CodingExercise       || mongoose.model('CodingExercise',       codingExerciseSchema),
  CodingSubmission:     mongoose.models.CodingSubmission     || mongoose.model('CodingSubmission',     codingSubmissionSchema)
};
