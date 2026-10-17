import { relations, sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const schoolSettings = sqliteTable("school_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  telemetryRetentionHours: integer("telemetry_retention_hours").notNull().default(24),
  githubUploadEnabled: integer("github_upload_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  githubToken: text("github_token").notNull().default(""),
  resetGeneration: integer("reset_generation").notNull().default(7),
  classBundleLimitMinutes: integer("class_bundle_limit_minutes").notNull().default(45),
  bundlePublished: integer("bundle_published", { mode: "boolean" }).notNull().default(true),
  examDate: text("exam_date").notNull(),
  demoNoticeShown: integer("demo_notice_shown", { mode: "boolean" }).notNull().default(true),
});

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey(),
    login: text("login").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "student"] }).notNull(),
    displayName: text("display_name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("users_login_idx").on(t.login)],
);

export const classes = sqliteTable("classes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const classMemberships = sqliteTable(
  "class_memberships",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [uniqueIndex("class_user_idx").on(t.classId, t.userId)],
);

export const subjects = sqliteTable("subjects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const exams = sqliteTable("exams", {
  id: integer("id").primaryKey(),
  subjectId: text("subject_id")
    .notNull()
    .references(() => subjects.id),
  title: text("title").notNull(),
  examDate: text("exam_date").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  contentVersion: integer("content_version").notNull().default(1),
  publishedToStudents: integer("published_to_students", { mode: "boolean" })
    .notNull()
    .default(false),
  hasNeedsReview: integer("has_needs_review", { mode: "boolean" }).notNull().default(false),
});

export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id")
    .notNull()
    .references(() => exams.id),
  sourceQuestionId: text("source_question_id").notNull(),
  sortOrder: integer("sort_order").notNull(),
  textOriginal: text("text_original").notNull(),
  textDisplay: text("text_display").notNull(),
  correctIndex: integer("correct_index").notNull(),
  needsReview: integer("needs_review", { mode: "boolean" }).notNull().default(false),
  reviewConfirmed: integer("review_confirmed", { mode: "boolean" }).notNull().default(false),
  explanation: text("explanation"),
  contentVersion: integer("content_version").notNull().default(1),
});

export const questionOptions = sqliteTable("question_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id),
  sortOrder: integer("sort_order").notNull(),
  text: text("text").notNull(),
  contentVersion: integer("content_version").notNull().default(1),
});

export const bundleSessions = sqliteTable("bundle_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  classId: text("class_id")
    .notNull()
    .references(() => classes.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  resetGeneration: integer("reset_generation").notNull(),
  startedAt: text("started_at").notNull(),
  deadlineAt: text("deadline_at").notNull(),
  invalidated: integer("invalidated", { mode: "boolean" }).notNull().default(false),
});

export const attempts = sqliteTable("attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id")
    .notNull()
    .references(() => exams.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  bundleSessionId: integer("bundle_session_id")
    .notNull()
    .references(() => bundleSessions.id),
  resetGeneration: integer("reset_generation").notNull(),
  status: text("status", {
    enum: ["in_progress", "finished", "expired"],
  }).notNull(),
  examContentVersion: integer("exam_content_version").notNull(),
  startedAt: text("started_at").notNull(),
  deadlineAt: text("deadline_at").notNull(),
  finishedAt: text("finished_at"),
  scorePercent: real("score_percent"),
  correctCount: integer("correct_count"),
  totalCount: integer("total_count"),
  allowReviewForStudent: integer("allow_review_for_student", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const attemptAnswers = sqliteTable(
  "attempt_answers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    attemptId: integer("attempt_id")
      .notNull()
      .references(() => attempts.id),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id),
    selectedIndex: integer("selected_index"),
    savedAt: text("saved_at").notNull(),
  },
  (t) => [uniqueIndex("attempt_question_idx").on(t.attemptId, t.questionId)],
);

export const activityEvents = sqliteTable("activity_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  attemptId: integer("attempt_id")
    .notNull()
    .references(() => attempts.id),
  questionId: integer("question_id").references(() => questions.id),
  resetGeneration: integer("reset_generation").notNull(),
  eventType: text("event_type").notNull(),
  clientEventId: text("client_event_id"),
  payloadJson: text("payload_json"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const loginAttempts = sqliteTable("login_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  login: text("login").notNull(),
  ip: text("ip").notNull(),
  success: integer("success", { mode: "boolean" }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(classMemberships),
  attempts: many(attempts),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  subject: one(subjects, { fields: [exams.subjectId], references: [subjects.id] }),
  questions: many(questions),
}));
