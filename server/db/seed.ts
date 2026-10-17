import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { SourceJson } from "../../shared/source-json";
import { resolveSourceJsonPath } from "../lib/paths";
import { getDb, getSqlite } from "./client";
import * as s from "./schema";
import "./migrate";

const ENGLISH_DAMAGED_SNIPPET = "pstudent on the register";

function displayQuestionText(examId: number, order: number, text: string) {
  let display = text;
  if (display.includes("\\n")) {
    display = display.replace(/\\n/g, "");
  }
  if (
    examId === 102 &&
    order === 8 &&
    text.includes(ENGLISH_DAMAGED_SNIPPET)
  ) {
    return display;
  }
  return display;
}

function questionNeedsReview(examId: number, order: number, text: string) {
  if (examId === 102 && order === 8 && text.includes(ENGLISH_DAMAGED_SNIPPET)) {
    return true;
  }
  return false;
}

function subjectKey(exam: SourceJson["exams"][number], subjects: Map<string, string>) {
  if (exam.subject) return exam.subject;
  if (exam.subject_id != null) {
    const sid = String(exam.subject_id);
    return subjects.get(sid) ?? sid;
  }
  return "unknown";
}

async function importJson(data: SourceJson) {
  const db = getDb();
  const classId = String(data.class.id);

  const existing = getSqlite()
    .query("SELECT COUNT(*) as c FROM users WHERE role = 'student'")
    .get() as { c: number };
  if (existing.c >= 18) {
    console.log("Seed skipped: database already contains student data.");
    return;
  }

  const subjectRows: { id: string; name: string }[] = [];
  if (data.subjects?.length) {
    for (const sub of data.subjects) {
      subjectRows.push({ id: String(sub.id), name: sub.name });
    }
  } else {
    const names = new Set<string>();
    for (const exam of data.exams) {
      if (exam.subject) names.add(exam.subject);
    }
    [...names].forEach((name, i) => subjectRows.push({ id: `subj-${i + 1}`, name }));
  }

  await db.insert(s.schoolSettings).values({
    name: data.school.name,
    telemetryRetentionHours: data.school.telemetry_retention_hours ?? 24,
    githubUploadEnabled: data.school.github_upload_enabled ?? false,
    githubToken: data.school.github_token ?? "",
    resetGeneration: data.school.submissions_reset_generation ?? 7,
    classBundleLimitMinutes: data.class.bundle_time_limit_minutes ?? 45,
    bundlePublished: data.class.bundle_published ?? true,
    examDate: data.class.exam_date ?? "07.10.2026",
  });

  await db.insert(s.classes).values({ id: classId, name: data.class.name });

  for (const sub of subjectRows) {
    await db.insert(s.subjects).values(sub).onConflictDoNothing();
  }

  const subjectByName = new Map(subjectRows.map((x) => [x.name, x.id]));

  const adminLogin = data.admin?.login ?? "admin";
  const adminPassword = data.admin?.password ?? "admin123";
  await db.insert(s.users).values({
    id: 1,
    login: adminLogin,
    passwordHash: bcrypt.hashSync(adminPassword, 10),
    role: "admin",
    displayName: "Администратор",
  });

  for (const student of data.students) {
    await db.insert(s.users).values({
      id: student.id,
      login: student.login,
      passwordHash: bcrypt.hashSync(student.password, 10),
      role: "student",
      displayName: student.name,
    });
    await db.insert(s.classMemberships).values({
      classId,
      userId: student.id,
    });
  }

  for (const exam of data.exams) {
    const subjName = subjectKey(exam, new Map(subjectRows.map((x) => [x.id, x.name])));
    const subjectId = subjectByName.get(subjName) ?? subjectRows[0]!.id;
    let hasNeedsReview = false;

    await db.insert(s.exams).values({
      id: exam.id,
      subjectId,
      title: exam.title,
      examDate: exam.date ?? data.class.exam_date ?? "07.10.2026",
      durationMinutes: exam.duration_minutes,
      publishedToStudents: exam.published_to_students ?? false,
      hasNeedsReview: false,
    });

    let order = 0;
    for (const q of exam.questions) {
      order += 1;
      const needsReview =
        q.needs_review === true || questionNeedsReview(exam.id, order, q.text);
      if (needsReview) hasNeedsReview = true;
      let explanation = q.explanation ?? null;
      if (
        !explanation &&
        q.text.toLowerCase().includes("туп") &&
        q.options.some((o) => o.includes("90"))
      ) {
        explanation = "90° < угол < 180°";
      }

      const [inserted] = await db
        .insert(s.questions)
        .values({
          examId: exam.id,
          sourceQuestionId: String(q.id),
          sortOrder: order,
          textOriginal: q.text,
          textDisplay: displayQuestionText(exam.id, order, q.text),
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

  console.log(
    `Seed complete: ${data.students.length} students, ${data.exams.length} exams, admin ${adminLogin}`,
  );
}

const sourcePath = resolveSourceJsonPath();
if (!sourcePath) {
  console.error(
    "Исходный JSON не найден. Положите файл в source-materials/ (см. source-materials/README.md) и запустите снова: bun run seed",
  );
  process.exit(1);
}

mkdirSync(join(process.cwd(), "data/private"), { recursive: true });
const archive = join(process.cwd(), "data/private/foundation-school.original.json");
if (!existsSync(archive)) {
  copyFileSync(sourcePath, archive);
}

const raw = await Bun.file(sourcePath).json();
const parsed = (await import("../../shared/source-json")).sourceJsonSchema.parse(raw);
await importJson(parsed);
