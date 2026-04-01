# 📚 Indian Exam Prep Platform — Data Architecture

## Model Files (12 total)

| File | Models Inside | Purpose |
|------|--------------|---------|
| `masterModel.js` | Master | Dynamic enum validation (single source of truth) |
| `categoryModel.js` | Category | Hierarchical content classification |
| `examGoalModel.js` | ExamGoal | **Anchor entity** — UPSC, SSC, GATE, JEE etc. |
| `userModel.js` | User, InstructorProfile, StudentProfile | All user types |
| `batchModel.js` | Batch | **Core product unit** (like PW/Unacademy batches) |
| `courseModel.js` | Course, Section, Lesson, InstructorInvitation | Video curriculum |
| `liveClassModel.js` | LiveClass, DoubtSession | Scheduled live sessions |
| `testModel.js` | Quiz, TestSeries, MockTest, MockTestQuestion, MockTestAttempt, DailyPractice, DailyPracticeAttempt | All assessments |
| `paymentModel.js` | Payment, Enrollment, Coupon | Monetisation |
| `progressModel.js` | ProgressTracking, PerformanceAnalytics, StudyPlan, Certificate | Student journey |
| `assignmentModel.js` | Assignment, AssignmentSubmission, CodingExercise, CodingSubmission | Graded work |
| `communityModel.js` | Review, Discussion, DiscussionReply | Social features |
| `postModel.js` | Post | Blog, Current Affairs, Announcements |
| `engagementModel.js` | StudentNote, Badge, UserBadge, Notification, Announcement | Gamification |
| `systemModel.js` | AuditLog, ActivityLog, SystemSettings | Admin & compliance |

---

## The Core Relationship

```
ExamGoal  ←──────────────────── the anchor for everything
  │
  ├── Batch ──────────────────── what students BUY
  │     ├── Course[] ──────────── recorded video content
  │     │     ├── Section[]
  │     │     │     └── Lesson[] (video/article/quiz)
  │     │     └── Assignment[]
  │     ├── LiveClass[] ────────── scheduled live sessions
  │     ├── TestSeries[] ────────── mock test bundles
  │     └── Enrollment[] ────────── who has access
  │
  ├── TestSeries ──────────────── can also be sold standalone
  │     └── MockTest[]
  │           └── MockTestQuestion[]
  │
  └── DailyPractice[] ──────────── date-based daily questions

Student
  ├── enrolled in Batch (Payment → Enrollment)
  ├── ProgressTracking (per Course)
  ├── PerformanceAnalytics (per ExamGoal) ← THE KEY DIFFERENTIATOR
  ├── StudyPlan (per ExamGoal)
  ├── MockTestAttempt[] (per MockTest)
  └── DailyPracticeAttempt[] (per DailyPractice)
```

---

## Master Data Types to Seed

Seed these into the `Master` collection before going live:

```js
// user_gender
['male', 'female', 'other', 'prefer_not_to_say']

// language
['en', 'hi', 'ta', 'te', 'kn', 'mr', 'gu', 'bn', 'pa']

// ui_theme
['light', 'dark', 'system']

// topic_area
['mathematics', 'science', 'history', 'geography', 'economics',
 'polity', 'environment', 'current_affairs', 'reasoning', 'english', 'hindi']

// lesson_type
['video', 'article', 'quiz', 'assignment', 'coding_exercise', 'live_class']

// video_provider
['youtube', 'vimeo', 'cloudinary', 'bunny', 'custom']

// resource_type
['pdf', 'doc', 'zip', 'link', 'image']

// instructor_role
['primary', 'co-instructor', 'teaching_assistant']

// invitation_status
['pending', 'accepted', 'expired', 'revoked']

// assignment_submission_type
['file-upload', 'text', 'link', 'github']

// assignment_status
['submitted', 'graded', 'revision_requested', 'late']

// programming_language
['javascript', 'python', 'java', 'cpp', 'c', 'sql']

// difficulty_level
['easy', 'medium', 'hard', 'expert']

// code_submission_status
['pending', 'running', 'passed', 'failed', 'error']

// payment_method
['razorpay', 'stripe', 'upi', 'bank_transfer', 'cash']

// payment_status
['pending', 'completed', 'failed', 'refunded', 'cancelled']

// currency
['INR', 'USD']

// post_type
['blog', 'current_affairs', 'announcement', 'news']

// post_status
['draft', 'published', 'scheduled', 'under_review', 'archived']

// badge_criteria
['first_login', 'course_complete', 'streak_7', 'streak_30',
 'top_scorer', 'perfect_score', 'first_mock_test', 'mock_test_10']

// exam_body
['UPSC', 'SSC', 'IBPS', 'RBI', 'RAILWAY', 'STATE_PSC',
 'GATE', 'JEE', 'NEET', 'NDA', 'CDS']

// batch_type
['live', 'recorded', 'hybrid']

// question_type
['mcq', 'true_false', 'fill_blank', 'descriptive', 'match_following']

// notification_type
['announcement', 'result', 'class_reminder', 'payment', 'badge', 'system']
```

---

## MVP Build Order

**Phase 1 (Week 1-4): The Core Loop**
1. `Master` + `Category` + `ExamGoal` — seed data
2. `User` + `InstructorProfile` + `StudentProfile` — auth
3. `Batch` + `Enrollment` + `Payment` — students can buy
4. `Course` + `Section` + `Lesson` — content delivery

**Phase 2 (Week 5-8): The Differentiator**
5. `MockTest` + `MockTestQuestion` + `MockTestAttempt` — tests
6. `TestSeries` — bundle tests into products
7. `PerformanceAnalytics` — subject-wise accuracy tracking
8. `ProgressTracking` — lesson completion

**Phase 3 (Week 9-12): Engagement**
9. `LiveClass` — scheduled sessions
10. `DailyPractice` — daily question sets
11. `Post` (current_affairs type) — daily CA
12. `Notification` + `Announcement`

**Phase 4: Polish**
13. `StudyPlan` — personalised schedules
14. `Badge` + `UserBadge` — gamification
15. `Certificate` — course completion
16. `Discussion` + `Review` — community
