import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getSqlite } from "./client";

const dbPath = process.env.DATABASE_URL ?? "./data/app.db";
mkdirSync(dirname(dbPath), { recursive: true });

const sql = getSqlite();

sql.exec(`
CREATE TABLE IF NOT EXISTS school_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  telemetry_retention_hours INTEGER NOT NULL DEFAULT 24,
  github_upload_enabled INTEGER NOT NULL DEFAULT 0,
  github_token TEXT NOT NULL DEFAULT '',
  reset_generation INTEGER NOT NULL DEFAULT 7,
  class_bundle_limit_minutes INTEGER NOT NULL DEFAULT 45,
  bundle_published INTEGER NOT NULL DEFAULT 1,
  exam_date TEXT NOT NULL DEFAULT '07.10.2026',
  demo_notice_shown INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS class_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id TEXT NOT NULL REFERENCES classes(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  UNIQUE(class_id, user_id)
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  title TEXT NOT NULL,
  exam_date TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  content_version INTEGER NOT NULL DEFAULT 1,
  published_to_students INTEGER NOT NULL DEFAULT 0,
  has_needs_review INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  source_question_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  text_original TEXT NOT NULL,
  text_display TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  needs_review INTEGER NOT NULL DEFAULT 0,
  review_confirmed INTEGER NOT NULL DEFAULT 0,
  explanation TEXT,
  content_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS question_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  sort_order INTEGER NOT NULL,
  text TEXT NOT NULL,
  content_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bundle_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id TEXT NOT NULL REFERENCES classes(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  reset_generation INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  invalidated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  bundle_session_id INTEGER NOT NULL REFERENCES bundle_sessions(id),
  reset_generation INTEGER NOT NULL,
  status TEXT NOT NULL,
  exam_content_version INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  finished_at TEXT,
  score_percent REAL,
  correct_count INTEGER,
  total_count INTEGER,
  allow_review_for_student INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES attempts(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  selected_index INTEGER,
  saved_at TEXT NOT NULL,
  UNIQUE(attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  attempt_id INTEGER NOT NULL REFERENCES attempts(id),
  question_id INTEGER REFERENCES questions(id),
  reset_generation INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  client_event_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL,
  ip TEXT NOT NULL,
  success INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

console.log("Migrations applied:", dbPath);
