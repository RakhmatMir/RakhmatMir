import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { sourceJsonSchema, type SourceJson } from "../../shared/source-json";
import { resolveSourceJsonPath } from "../lib/paths";
import { getDb, getSqlite } from "./client";
import * as s from "./schema";
import "./migrate";

const ENGLISH_DAMAGED_SNIPPET = "pstudent on the register";
const OBTUSE_EXPLANATION = "90° < угол < 180°";

function displayQuestionText(text: string) {
  return text.includes("\\n") ? text.replace(/\\n/g, "") : text;
}

function isDamagedEnglishQuestion(examId: number, order: number, text: string) {
  return examId === 102 && order === 8 && text.includes(ENGLISH_DAMAGED_SNIPPET);
}

async function importJson(data: SourceJson) {
  const db = getDb();
  const classMeta = data.classes[0];
  if (!classMeta) throw new Error("No class in JSON");
  const classId = classMeta.class_name;
  const schedule = data.class_schedules[classId];

  const existingStudents = getSqlite()
    .query("SELECT COUNT(*) as c FROM users WHERE role = 'student'")
    .get() as { c: number };
  if (existingStudents.c >= 18) {
    console.log("Seed skipped: database already contains student data.");
    return;
  }

  await db.insert(s.schoolSettings).values({
    name: data.school_name,
    telemetryRetentionHours: data.submissions_retention_hours,
    githubUploadEnabled: data.submissions_upload.enabled,
    githubToken: data.submissions_upload.github_token,
    resetGeneration: data.submissions_reset_generation,
    classBundleLimitMinutes: schedule?.total_minutes ?? 45,
    bundlePublished: schedule?.bundle_published ?? true,
    examDate: data.exams[0]?.control_date ?? "07.10.2026",
  });

  await db.insert(s.classes).values({ id: classId, name: classId });

  for (const sub of data.subjects) {
    await db.insert(s.subjects).values({ id: sub.code, name: sub.title });
  }

  for (const user of data.demo_users) {
    await db.insert(s.users).values({
      id: user.id,
      login: user.login,
      passwordHash: bcrypt.hashSync(user.password, 10),
      role: user.role,
      displayName: user.full_name,
    });
    if (user.role === "student" && user.class_name) {
      await db.insert(s.classMemberships).values({
        classId: user.class_name,
        userId: user.id,
      });
    }
  }

  for (const exam of data.exams) {
    let hasNeedsReview = false;

    await db.insert(s.exams).values({
      id: exam.id,
      subjectId: exam.subject_code,
      title: exam.title,
      examDate: exam.control_date,
      durationMinutes: exam.duration_minutes,
      publishedToStudents: exam.published_to_students,
      hasNeedsReview: false,
    });

    let order = 0;
    for (const q of exam.questions) {
      order += 1;
      const needsReview = isDamagedEnglishQuestion(exam.id, order, q.text);
      if (needsReview) hasNeedsReview = true;
      const explanation =
        q.text.includes("тупой угол") || q.options.some((o) => o.includes("90°–180°"))
          ? OBTUSE_EXPLANATION
          : null;

      const [inserted] = await db
        .insert(s.questions)
        .values({
          examId: exam.id,
          sourceQuestionId: String(order),
          sortOrder: order,
          textOriginal: q.text,
          textDisplay: displayQuestionText(q.text),
          correctIndex: q.correct_index,
          needsReview,
          reviewConfirmed: false,
          explanation,
        })
        .returning({ id: s.questions.id });

      for (let i = 0; i < q.options.length; i++) {
        await db.insert(s.questionOptions).values({
          questionId: inserted.id,
          sortOrder: i,
          text: q.options[i]!,
        });
      }
    }

    if (hasNeedsReview) {
      await db
        .update(s.exams)
        .set({ hasNeedsReview: true, publishedToStudents: false })
        .where(eq(s.exams.id, exam.id));
    }
  }

  const roster = data.rosters[classId] ?? [];
  const has402 = roster.some((r) => r.id === 402);
  if (roster.length !== 18 || !has402) {
    console.warn("Roster check: expected 18 students including id 402");
  }

  console.log(
    `Seed complete: ${data.demo_users.filter((u) => u.role === "student").length} students, ${data.exams.length} exams, ${data.demo_users.length} users total`,
  );
}

const sourcePath = resolveSourceJsonPath();
if (!sourcePath) {
  console.error("Исходный JSON не найден в source-materials/");
  process.exit(1);
}

mkdirSync(join(process.cwd(), "data/private"), { recursive: true });
const archive = join(process.cwd(), "data/private/foundation-school.original.json");
if (!existsSync(archive)) {
  copyFileSync(sourcePath, archive);
}

const raw = await Bun.file(sourcePath).json();
const parsed = sourceJsonSchema.parse(raw);
await importJson(parsed);
