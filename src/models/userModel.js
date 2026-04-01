// models/userModel.js
// ============================================================
// USER — Base account, Instructor Profile, Student Profile
// ============================================================

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ==================== USER SCHEMA ====================
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },
  confirmPassword: {
    type: String,
    required: [true, 'Please confirm your password'],
    validate: {
      validator: function (el) {
        return el === this.password;
      },
      message: 'Passwords do not match!'
    }
  },
  firstName: { type: String, required: true, trim: true },
  lastName:  { type: String, required: true, trim: true },
  profilePicture: { type: String, default: null },
  phoneNumber: { type: String, trim: true },
  dateOfBirth: Date,

  gender: {
    type: String,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('user_gender', value);
      },
      message: 'Invalid gender selection'
    }
  },

  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },

  // Role kept as enum for fast middleware checks (JWT, guards)
  role: {
    type: String,
    enum: ['student', 'instructor', 'admin', 'co-instructor'],
    default: 'student',
    required: true
  },

  isActive:         { type: Boolean, default: true },
  isEmailVerified:  { type: Boolean, default: false },
  lastLogin:        Date,

  // Password management
  passwordChangedAt:   Date,
  passwordResetToken:  String,
  passwordResetExpires: Date,

  isDeleted:  { type: Boolean, default: false },
  deletedAt:  { type: Date,    default: null }
}, { timestamps: true });

// ==================== HOOKS ====================
// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.confirmPassword = undefined; // Remove confirmPassword from DB
  next();
});

// Track password change timestamp
userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();
  this.passwordChangedAt = Date.now() - 1000;
  next();
});

// ==================== INSTANCE METHODS ====================
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 min
  return resetToken;
};

// ==================== VIRTUAL ====================
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ==================== INDEXES ====================
userSchema.index({ role: 1 });
userSchema.index({ email: 1 });
userSchema.index({ isDeleted: 1, isActive: 1 });


// ==================== INSTRUCTOR PROFILE SCHEMA ====================
const instructorProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  bio: { type: String, maxlength: 1000 },
  qualifications: [{
    degree:      String,
    institution: String,
    year:        Number,
    certificate: String
  }],

  expertise: [{
    type: String,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('topic_area', value);
      },
      message: (props) => `${props.value} is not a valid topic area`
    }
  }],

  experience: {
    years:   Number,
    summary: String
  },

  socialLinks: {
    linkedin: String,
    github:   String,
    twitter:  String,
    website:  String,
    youtube:  String
  },

  // Aggregated stats (updated by hooks)
  rating:        { type: Number, min: 0, max: 5, default: 0 },
  totalStudents: { type: Number, default: 0 },
  totalCourses:  { type: Number, default: 0 },
  totalReviews:  { type: Number, default: 0 },
  totalBatches:  { type: Number, default: 0 },

  isApproved:  { type: Boolean, default: false },
  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:  Date,

  // Bank / payout details
  paymentDetails: {
    bankName:          String,
    accountNumber:     String,
    accountHolderName: String,
    ifscCode:          String,
    upiId:             String,
    paypalEmail:       String
  }
}, { timestamps: true });


// ==================== STUDENT PROFILE SCHEMA ====================
const studentProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  education: [{
    degree:       String,
    institution:  String,
    fieldOfStudy: String,
    startDate:    Date,
    endDate:      Date,
    grade:        String
  }],

  interests: [{
    type: String,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('topic_area', value);
      },
      message: (props) => `${props.value} is not a valid topic area`
    }
  }],

  // Exam goals the student is preparing for
  examGoals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ExamGoal' }],

  // Refs kept lean — actual data lives in Enrollment & ProgressTracking
  enrollments:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment' }],
  wishlist:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  savedForLater: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],

  // Gamification
  totalPoints:    { type: Number, default: 0 },
  currentStreak:  { type: Number, default: 0 },  // days
  longestStreak:  { type: Number, default: 0 },
  lastStudyDate:  Date,

  preferences: {
    emailNotifications: { type: Boolean, default: true },
    pushNotifications:  { type: Boolean, default: true },

    language: {
      type: String,
      default: 'en',
      validate: {
        validator: async function (value) {
          if (!value) return true;
          const Master = mongoose.model('Master');
          return await Master.validateValue('language', value);
        },
        message: 'Invalid language'
      }
    },

    theme: {
      type: String,
      default: 'light',
      validate: {
        validator: async function (value) {
          if (!value) return true;
          const Master = mongoose.model('Master');
          return await Master.validateValue('ui_theme', value);
        },
        message: 'Invalid UI theme'
      }
    }
  }
}, { timestamps: true });

// ==================== EXPORTS ====================
module.exports = {
  User: mongoose.models.User || mongoose.model('User', userSchema),
  InstructorProfile: mongoose.models.InstructorProfile || mongoose.model('InstructorProfile', instructorProfileSchema),
  StudentProfile: mongoose.models.StudentProfile || mongoose.model('StudentProfile', studentProfileSchema)
};
