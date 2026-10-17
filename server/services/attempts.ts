import { and, eq } from "drizzle-orm";
import { ApiError } from "../../shared/errors";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { computeScorePercent, formatScorePercent } from "../lib/scoring";
import { addMinutes, remainingSeconds, serverNowIso } from "../lib/time";

export async function getSchoolSettings() {
  const db = getDb();
  const rows = await db.select().from(s.schoolSettings).limit(1);
  return rows[0];
}

export async function getStudentClassId(userId: number) {
  const db = getDb();
  const row = await db
    .select()
    .from(s.classMemberships)
    .where(eq(s.classMemberships.userId, userId))
    .limit(1);
  return row[0]?.classId ?? null;
}

export async function ensureBundleSession(userId: number, classId: string) {
  const settings = await getSchoolSettings();
  if (!settings?.bundlePublished) {
    throw new ApiError("BUNDLE_NOT_PUBLISHED", "Пакет тестов не опубликован", 403);
  }
  const db = getDb();
  const active = await db
    .select()
    .from(s.bundleSessions)
    .where(
      and(
        eq(s.bundleSessions.userId, userId),
        eq(s.bundleSessions.resetGeneration, settings.resetGeneration),
        eq(s.bundleSessions.invalidated, false),
      ),
    )
    .limit(1);
  if (active[0]) return active[0];

  const now = serverNowIso();
  const deadline = addMinutes(now, settings.classBundleLimitMinutes);
  const [created] = await db
    .insert(s.bundleSessions)
    .values({
      classId,
      userId,
      resetGeneration: settings.resetGeneration,
      startedAt: now,
      deadlineAt: deadline,
    })
    .returning();
  return created;
}

export async function startOrResumeAttempt(userId: number, examId: number) {
  const settings = await getSchoolSettings();
  const classId = await getStudentClassId(userId);
  if (!classId) throw new ApiError("FORBIDDEN", "Класс не найден", 403);

  const db = getDb();
  const exam = await db.select().from(s.exams).where(eq(s.exams.id, examId)).limit(1);
  const ex = exam[0];
  if (!ex) throw new ApiError("NOT_FOUND", "Тест не найден", 404);
  if (!ex.publishedToStudents) {
    throw new ApiError("NOT_PUBLISHED", "Тест не опубликован", 403);
  }
  if (ex.hasNeedsReview) {
    throw new ApiError("NEEDS_REVIEW", "Тест на проверке содержания", 403);
  }

  const bundle = await ensureBundleSession(userId, classId);
  const now = serverNowIso();
  if (remainingSeconds(bundle.deadlineAt) <= 0) {
    throw new ApiError("TIME_EXPIRED", "Общее время пакета истекло", 403);
  }

  const existing = await db
    .select()
    .from(s.attempts)
    .where(
      and(
        eq(s.attempts.userId, userId),
        eq(s.attempts.examId, examId),
        eq(s.attempts.resetGeneration, settings!.resetGeneration),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const attemptDeadline = addMinutes(
    now,
    Math.min(
      ex.durationMinutes,
      remainingSeconds(bundle.deadlineAt) / 60,
    ),
  );

  const [attempt] = await db
    .insert(s.attempts)
    .values({
      examId,
      userId,
      bundleSessionId: bundle.id,
      resetGeneration: settings!.resetGeneration,
      status: "in_progress",
      examContentVersion: ex.contentVersion,
      startedAt: now,
      deadlineAt: attemptDeadline,
    })
    .returning();
  return attempt;
}

export async function saveAnswer(
  userId: number,
  attemptId: number,
  questionId: number,
  selectedIndex: number | null,
) {
  const db = getDb();
  const attempt = await db.select().from(s.attempts).where(eq(s.attempts.id, attemptId)).limit(1);
  const a = attempt[0];
  if (!a || a.userId !== userId) {
    throw new ApiError("FORBIDDEN", "Нет доступа к попытке", 403);
  }
  if (a.status !== "in_progress") {
    throw new ApiError("ATTEMPT_FINISHED", "Попытка завершена", 409);
  }
  const now = serverNowIso();
  if (remainingSeconds(a.deadlineAt) <= 0) {
    throw new ApiError("TIME_EXPIRED", "Время попытки истекло", 403);
  }

  await db
    .insert(s.attemptAnswers)
    .values({
      attemptId,
      questionId,
      selectedIndex,
      savedAt: now,
    })
    .onConflictDoUpdate({
      target: [s.attemptAnswers.attemptId, s.attemptAnswers.questionId],
      set: { selectedIndex, savedAt: now },
    });
}

export async function finishAttempt(userId: number, attemptId: number) {
  const db = getDb();
  const attempt = await db.select().from(s.attempts).where(eq(s.attempts.id, attemptId)).limit(1);
  const a = attempt[0];
  if (!a || a.userId !== userId) {
    throw new ApiError("FORBIDDEN", "Нет доступа", 403);
  }
  if (a.status === "finished") return a;

  const questions = await db
    .select()
    .from(s.questions)
    .where(eq(s.questions.examId, a.examId));
  const answers = await db
    .select()
    .from(s.attemptAnswers)
    .where(eq(s.attemptAnswers.attemptId, attemptId));

  let correct = 0;
  for (const q of questions) {
    const ans = answers.find((x) => x.questionId === q.id);
    if (ans?.selectedIndex === q.correctIndex) correct += 1;
  }
  const total = questions.length;
  const percent = formatScorePercent(computeScorePercent(correct, total)!);
  const now = serverNowIso();

  const [updated] = await db
    .update(s.attempts)
    .set({
      status: "finished",
      finishedAt: now,
      correctCount: correct,
      totalCount: total,
      scorePercent: percent,
    })
    .where(eq(s.attempts.id, attemptId))
    .returning();
  return updated;
}
