// models/courseModel.js
// ============================================================
// COURSE — Recorded video course broken into Sections & Lessons
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

// ==================== CO-INSTRUCTOR SUB-SCHEMA ====================
const courseInstructorSchema = new mongoose.Schema({
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: { type: String },
  permissions: {
    canEditCourse:       { type: Boolean, default: false },
    canManageSections:   { type: Boolean, default: false },
    canManageLessons:    { type: Boolean, default: false },
    canManageStudents:   { type: Boolean, default: false },
    canViewAnalytics:    { type: Boolean, default: true },
    canGradeAssignments: { type: Boolean, default: false }
  },
  addedAt: { type: Date, default: Date.now },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true }
}, { _id: false });

// ==================== COURSE SCHEMA ====================
const courseSchema = new mongoose.Schema({
  title:    { type: String, required: true, trim: true },
  subtitle: String,
  slug:     { type: String, required: true, unique: true },
  description: { type: String, required: true },

  // Hierarchy
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  examGoal: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamGoal' },  // optional link

  // Subject / Chapter metadata (useful for exam-prep filtering)
  subject: String,   // "History"
  chapter: String,   // "Modern India"

  // Instructors
  primaryInstructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  instructors: [courseInstructorSchema],

  level: {
    type: String,
    default: 'beginner',
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('difficulty_level', value);
      },
      message: 'Invalid level'
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

  currency:      { type: String, default: 'INR' },
  thumbnail:     String,
  previewVideo:  String,
  price:         { type: Number, required: true, min: 0 },
  discountPrice: { type: Number, min: 0 },
  discountStartDate: Date,
  discountEndDate:   Date,
  isFree:        { type: Boolean, default: false },

  // Auto-calculated counters
  totalDuration:    { type: Number, default: 0 },   // in seconds
  totalLessons:     { type: Number, default: 0 },
  totalSections:    { type: Number, default: 0 },
  rating:           { type: Number, min: 0, max: 5, default: 0 },
  totalRatings:     { type: Number, default: 0 },
  totalEnrollments: { type: Number, default: 0 },
  totalReviews:     { type: Number, default: 0 },

  requirements:      [String],
  whatYouWillLearn:  [String],
  targetAudience:    [String],
  tags:              [String],

  isPublished: { type: Boolean, default: false },
  isApproved:  { type: Boolean, default: false },
  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:  Date,
  publishedAt: Date,
  isDeleted:   { type: Boolean, default: false },
  deletedAt:   { type: Date, default: null }
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== VIRTUALS ====================
courseSchema.virtual('activeInstructors').get(function () {
  if (!this.instructors || !Array.isArray(this.instructors)) return [];
  return this.instructors.filter(inst => inst.isActive);
});

courseSchema.virtual('instructorCount').get(function () {
  if (!this.instructors || !Array.isArray(this.instructors)) return 0;
  return this.instructors.length;
});

courseSchema.virtual('effectivePrice').get(function () {
  if (this.isFree) return 0;
  if (this.discountPrice && this.discountPrice < this.price) {
    const now = new Date();
    const inWindow =
      (!this.discountStartDate || now >= this.discountStartDate) &&
      (!this.discountEndDate   || now <= this.discountEndDate);
    if (inWindow) return this.discountPrice;
  }
  return this.price;
});

// ==================== PRE-SAVE HOOKS ====================
courseSchema.pre('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = `${slugify(this.title)}-${nanoid(6)}`;
  }
  next();
});

// Ensure primaryInstructor is always in instructors array
courseSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('primaryInstructor')) {
    const hasPrimary = this.instructors.some(
      inst => inst.instructor.toString() === this.primaryInstructor.toString()
    );
    if (!hasPrimary) {
      this.instructors.push({
        instructor: this.primaryInstructor,
        role: 'primary',
        permissions: {
          canEditCourse:       true,
          canManageSections:   true,
          canManageLessons:    true,
          canManageStudents:   true,
          canViewAnalytics:    true,
          canGradeAssignments: true
        }
      });
    }
  }
  next();
});

// ==================== INDEXES ====================
courseSchema.index({ title: 'text', description: 'text' });
courseSchema.index({ category: 1, isPublished: 1, isApproved: 1 });
courseSchema.index({ examGoal: 1, subject: 1 });
courseSchema.index({ primaryInstructor: 1, isPublished: 1 });
courseSchema.index({ 'instructors.instructor': 1 });
courseSchema.index({ slug: 1 }, { unique: true });


// ==================== SECTION SCHEMA ====================
const sectionSchema = new mongoose.Schema({
  course:      { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  title:       { type: String, required: true },
  description: String,
  order:       { type: Number, required: true },

  // Auto-calculated
  totalLessons:  { type: Number, default: 0 },
  totalDuration: { type: Number, default: 0 },

  isPublished: { type: Boolean, default: true },
  isDeleted:   { type: Boolean, default: false }
}, { timestamps: true });

sectionSchema.index({ course: 1, order: 1 }, { unique: true });
sectionSchema.index({ course: 1, isDeleted: 1 });


// ==================== LESSON SCHEMA ====================
const lessonSchema = new mongoose.Schema({
  section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
  course:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course',  required: true },
  title:       { type: String, required: true },
  description: String,

  type: {
    type: String,
    required: true,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('lesson_type', value);
      },
      message: 'Invalid lesson type'
    }
  },

  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  content: {
    video: {
      url:       String,
      duration:  Number,       // in seconds
      thumbnail: String,
      provider: {
        type: String,
        validate: {
          validator: async function (value) {
            if (!value) return true;
            const Master = mongoose.model('Master');
            return await Master.validateValue('video_provider', value);
          },
          message: 'Invalid video provider'
        }
      }
    },
    article: {
      body:        String,
      attachments: [String]
    },
    quiz:            { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
    assignment:      { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    codingExercise:  { type: mongoose.Schema.Types.ObjectId, ref: 'CodingExercise' }
  },

  order:    { type: Number, required: true },
  duration: { type: Number, default: 0 },    // in seconds
  isFree:   { type: Boolean, default: false },
  isPublished: { type: Boolean, default: true },

  resources: [{
    title: String,
    type: {
      type: String,
      validate: {
        validator: async function (value) {
          if (!value) return true;
          const Master = mongoose.model('Master');
          return await Master.validateValue('resource_type', value);
        },
        message: 'Invalid resource type'
      }
    },
    url:        String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

lessonSchema.index({ section: 1, order: 1 }, { unique: true });
lessonSchema.index({ course: 1, isFree: 1, isDeleted: 1 });
lessonSchema.index({ type: 1 });


// ==================== INSTRUCTOR INVITATION SCHEMA ====================
const instructorInvitationSchema = new mongoose.Schema({
  course:     { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  email:      { type: String, required: true },
  invitedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token:      { type: String, required: true, unique: true },

  role: {
    type: String,
    default: 'co-instructor',
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('instructor_role', value);
      },
      message: 'Invalid instructor role'
    }
  },

  permissions: {
    canEditCourse:       { type: Boolean, default: false },
    canManageSections:   { type: Boolean, default: false },
    canManageLessons:    { type: Boolean, default: false },
    canManageStudents:   { type: Boolean, default: false },
    canViewAnalytics:    { type: Boolean, default: true },
    canGradeAssignments: { type: Boolean, default: false }
  },

  status: {
    type: String,
    default: 'pending',
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('invitation_status', value);
      },
      message: 'Invalid invitation status'
    }
  },

  expiresAt:  { type: Date, required: true },
  acceptedAt: Date,
  revokedAt:  Date,
  revokedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

instructorInvitationSchema.index({ token: 1 }, { unique: true });
instructorInvitationSchema.index({ course: 1, email: 1, status: 1 });
instructorInvitationSchema.index({ expiresAt: 1 });

// ==================== EXPORTS ====================
module.exports = {
  Course: mongoose.models.Course || mongoose.model('Course', courseSchema),
  Section: mongoose.models.Section || mongoose.model('Section', sectionSchema),
  Lesson: mongoose.models.Lesson || mongoose.model('Lesson', lessonSchema),
  InstructorInvitation: mongoose.models.InstructorInvitation || mongoose.model('InstructorInvitation', instructorInvitationSchema)
};
