import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { ApiError } from "../../shared/errors";
import { isDatabaseSeeded } from "../db/client";
import * as s from "../db/schema";
import {
  assertCsrf,
  clearSessionCookie,
  createSession,
  destroySession,
  readSessionCookie,
  requireAdmin,
  requireStudent,
  requireUser,
  setSessionCookie,
  verifyLogin,
} from "../lib/auth";
import { resolveSourceJsonPath } from "../lib/paths";
import { remainingSeconds, serverNowIso } from "../lib/time";
import {
  finishAttempt,
  getSchoolSettings,
  saveAnswer,
  startOrResumeAttempt,
} from "../services/attempts";
import { getDb } from "../db/client";

export const api = new Hono();

api.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: err.payload }, err.status as 401);
  }
  console.error(err);
  return c.json({ error: { code: "INTERNAL", message: "Внутренняя ошибка" } }, 500);
});

api.get("/health", (c) =>
  c.json({
    ok: true,
    seeded: isDatabaseSeeded(),
    sourceJson: Boolean(resolveSourceJsonPath()),
    serverNow: serverNowIso(),
  }),
);

api.post("/login", async (c) => {
  const body = await c.req.json<{ login?: string; password?: string }>();
  if (!body.login || !body.password) {
    throw new ApiError("VALIDATION", "Укажите логин и пароль", 400);
  }
  const ip = c.req.header("x-forwarded-for") ?? "127.0.0.1";
  const user = await verifyLogin(body.login, body.password, ip);
  const session = await createSession(user.id);
  setSessionCookie(c, session.id, session.expiresAt);
  return c.json({
    user: { id: user.id, login: user.login, role: user.role, name: user.displayName },
    csrfToken: session.csrf,
  });
});

api.post("/logout", async (c) => {
  const session = await requireUser(c);
  assertCsrf(c, session);
  await destroySession(readSessionCookie(c));
  clearSessionCookie(c);
  return c.json({ ok: true });
});

api.get("/me", async (c) => {
  const session = await requireUser(c);
  return c.json({
    user: {
      id: session.user.id,
      login: session.user.login,
      role: session.user.role,
      name: session.user.displayName,
    },
    csrfToken: session.csrfToken,
    demoWarning: true,
  });
});

api.get("/admin/overview", async (c) => {
  await requireAdmin(c);
  const db = getDb();
  const settings = await getSchoolSettings();
  const students = await db.select().from(s.users).where(eq(s.users.role, "student"));
  const exams = await db.select().from(s.exams);
  const finished = await db
    .select()
    .from(s.attempts)
    .where(eq(s.attempts.status, "finished"));
  const avg =
    finished.length > 0
      ? finished.reduce((a, b) => a + (b.scorePercent ?? 0), 0) / finished.length
      : null;

  const english = exams.find((e) => e.id === 102);
  const reviewQuestions = english
    ? await db
        .select()
        .from(s.questions)
        .where(and(eq(s.questions.examId, 102), eq(s.questions.needsReview, true)))
    : [];

  return c.json({
    schoolName: settings?.name,
    className: "6Б",
    kpis: {
      students: students.length,
      exams: exams.length,
      finishedAttempts: finished.length,
      average: avg == null ? null : Math.round(avg * 10) / 10,
    },
    exams,
    englishReview: reviewQuestions,
    bundle: {
      published: settings?.bundlePublished,
      limitMinutes: settings?.classBundleLimitMinutes,
    },
  });
});

api.get("/admin/students", async (c) => {
  await requireAdmin(c);
  const db = getDb();
  const students = await db.select().from(s.users).where(eq(s.users.role, "student"));
  const attempts = await db.select().from(s.attempts).where(eq(s.attempts.status, "finished"));

  const rows = students.map((st) => {
    const mine = attempts.filter((a) => a.userId === st.id);
    const avg =
      mine.length > 0
        ? mine.reduce((a, b) => a + (b.scorePercent ?? 0), 0) / mine.length
        : null;
    return {
      id: st.id,
      name: st.displayName,
      className: "6Б",
      status: mine.length ? "in_progress_or_done" : "not_started",
      finishedCount: mine.length,
      average: avg,
    };
  });
  return c.json({ students: rows });
});

api.get("/admin/exams", async (c) => {
  await requireAdmin(c);
  const db = getDb();
  const exams = await db.select().from(s.exams);
  const withCounts = await Promise.all(
    exams.map(async (exam) => {
      const count = await db
        .select({ c: sql<number>`count(*)` })
        .from(s.questions)
        .where(eq(s.questions.examId, exam.id));
      return { ...exam, questionCount: count[0]?.c ?? 0 };
    }),
  );
  return c.json({ exams: withCounts });
});

api.post("/admin/exams/:id/publish", async (c) => {
  const session = await requireAdmin(c);
  assertCsrf(c, session);
  const examId = Number(c.req.param("id"));
  const db = getDb();
  const exam = await db.select().from(s.exams).where(eq(s.exams.id, examId)).limit(1);
  const ex = exam[0];
  if (!ex) throw new ApiError("NOT_FOUND", "Тест не найден", 404);
  if (ex.hasNeedsReview) {
    const pending = await db
      .select()
      .from(s.questions)
      .where(
        and(
          eq(s.questions.examId, examId),
          eq(s.questions.needsReview, true),
          eq(s.questions.reviewConfirmed, false),
        ),
      );
    if (pending.length) {
      throw new ApiError(
        "NEEDS_REVIEW",
        "Исправьте вопросы на проверке и подтвердите ключ",
        403,
      );
    }
  }
  await db.update(s.exams).set({ publishedToStudents: true }).where(eq(s.exams.id, examId));
  return c.json({ ok: true });
});

api.post("/admin/exams/:id/unpublish", async (c) => {
  const session = await requireAdmin(c);
  assertCsrf(c, session);
  const examId = Number(c.req.param("id"));
  const db = getDb();
  await db.update(s.exams).set({ publishedToStudents: false }).where(eq(s.exams.id, examId));
  return c.json({ ok: true });
});

api.get("/admin/exams/:id", async (c) => {
  await requireAdmin(c);
  const examId = Number(c.req.param("id"));
  const db = getDb();
  const exam = await db.select().from(s.exams).where(eq(s.exams.id, examId)).limit(1);
  const questions = await db
    .select()
    .from(s.questions)
    .where(eq(s.questions.examId, examId))
    .orderBy(s.questions.sortOrder);
  const options = await db.select().from(s.questionOptions);
  return c.json({
    exam: exam[0],
    questions: questions.map((q) => ({
      ...q,
      options: options.filter((o) => o.questionId === q.id).sort((a, b) => a.sortOrder - b.sortOrder),
    })),
  });
});

api.patch("/admin/questions/:id", async (c) => {
  const session = await requireAdmin(c);
  assertCsrf(c, session);
  const qid = Number(c.req.param("id"));
  const body = await c.req.json<{
    text?: string;
    correctIndex?: number;
    confirmReview?: boolean;
    options?: string[];
  }>();
  const db = getDb();
  const q = await db.select().from(s.questions).where(eq(s.questions.id, qid)).limit(1);
  if (!q[0]) throw new ApiError("NOT_FOUND", "Вопрос не найден", 404);

  const textDisplay = body.text ?? q[0].textDisplay;
  const correctIndex = body.correctIndex ?? q[0].correctIndex;
  const reviewConfirmed = body.confirmReview === true ? true : q[0].reviewConfirmed;

  await db
    .update(s.questions)
    .set({
      textDisplay,
      textOriginal: body.text ?? q[0].textOriginal,
      correctIndex,
      reviewConfirmed,
      needsReview: reviewConfirmed ? false : q[0].needsReview,
    })
    .where(eq(s.questions.id, qid));

  if (body.options) {
    await db.delete(s.questionOptions).where(eq(s.questionOptions.questionId, qid));
    for (let i = 0; i < body.options.length; i++) {
      await db.insert(s.questionOptions).values({
        questionId: qid,
        sortOrder: i,
        text: body.options[i]!,
      });
    }
  }

  const examId = q[0].examId;
  const unresolved = await db
    .select()
    .from(s.questions)
    .where(
      and(
        eq(s.questions.examId, examId),
        eq(s.questions.needsReview, true),
        eq(s.questions.reviewConfirmed, false),
      ),
    );
  await db
    .update(s.exams)
    .set({ hasNeedsReview: unresolved.length > 0 })
    .where(eq(s.exams.id, examId));

  return c.json({ ok: true });
});

api.get("/admin/settings", async (c) => {
  await requireAdmin(c);
  const settings = await getSchoolSettings();
  return c.json({ settings });
});

api.post("/admin/reset-class", async (c) => {
  const session = await requireAdmin(c);
  assertCsrf(c, session);
  const body = await c.req.json<{ confirm?: string }>();
  if (body.confirm !== "6Б") {
    throw new ApiError("VALIDATION", "Введите 6Б для подтверждения", 400);
  }
  const settings = await getSchoolSettings();
  const nextGen = (settings?.resetGeneration ?? 7) + 1;
  const sqlite = (await import("../db/client")).getSqlite();
  sqlite.exec("BEGIN");
  try {
    sqlite.exec("DELETE FROM activity_events");
    sqlite.exec("DELETE FROM attempt_answers");
    sqlite.exec("DELETE FROM attempts");
    sqlite.exec("DELETE FROM bundle_sessions");
    sqlite
      .query("UPDATE school_settings SET reset_generation = ? WHERE id = ?")
      .run(nextGen, settings?.id ?? 1);
    sqlite.exec("COMMIT");
  } catch (e) {
    sqlite.exec("ROLLBACK");
    throw e;
  }
  return c.json({ resetGeneration: nextGen });
});

api.get("/student/dashboard", async (c) => {
  const session = await requireStudent(c);
  const db = getDb();
  const settings = await getSchoolSettings();
  const exams = await db.select().from(s.exams);
  const attempts = await db
    .select()
    .from(s.attempts)
    .where(eq(s.attempts.userId, session.user.id));

  const cards = exams.map((exam) => {
    const attempt = attempts.find((a) => a.examId === exam.id);
    const status = exam.hasNeedsReview
      ? "needs_review"
      : !exam.publishedToStudents
        ? "awaiting_publish"
        : attempt?.status === "finished"
          ? "finished"
          : attempt?.status === "in_progress"
            ? "in_progress"
            : "available";
    return { exam, attempt, status };
  });

  return c.json({
    student: session.user,
    className: "6Б",
    bundleLimit: settings?.classBundleLimitMinutes,
    cards,
  });
});

api.post("/student/exams/:id/start", async (c) => {
  const session = await requireStudent(c);
  assertCsrf(c, session);
  const examId = Number(c.req.param("id"));
  const attempt = await startOrResumeAttempt(session.user.id, examId);
  return c.json({ attemptId: attempt.id, serverNow: serverNowIso() });
});

api.get("/student/attempts/:id", async (c) => {
  const session = await requireStudent(c);
  const attemptId = Number(c.req.param("id"));
  const db = getDb();
  const attempt = await db.select().from(s.attempts).where(eq(s.attempts.id, attemptId)).limit(1);
  const a = attempt[0];
  if (!a || a.userId !== session.user.id) {
    throw new ApiError("FORBIDDEN", "Нет доступа", 403);
  }
  const questions = await db
    .select({
      id: s.questions.id,
      sortOrder: s.questions.sortOrder,
      text: s.questions.textDisplay,
    })
    .from(s.questions)
    .where(eq(s.questions.examId, a.examId))
    .orderBy(s.questions.sortOrder);
  const options = await db.select().from(s.questionOptions);
  const answers = await db
    .select()
    .from(s.attemptAnswers)
    .where(eq(s.attemptAnswers.attemptId, attemptId));

  const bundle = await db
    .select()
    .from(s.bundleSessions)
    .where(eq(s.bundleSessions.id, a.bundleSessionId))
    .limit(1);

  return c.json({
    attempt: a,
    bundleDeadline: bundle[0]?.deadlineAt,
    serverNow: serverNowIso(),
    remainingAttemptSec: remainingSeconds(a.deadlineAt),
    remainingBundleSec: bundle[0] ? remainingSeconds(bundle[0].deadlineAt) : 0,
    questions: questions.map((q) => ({
      ...q,
      options: options
        .filter((o) => o.questionId === q.id)
        .sort((x, y) => x.sortOrder - y.sortOrder)
        .map((o) => ({ id: o.id, text: o.text })),
      selectedIndex: answers.find((ans) => ans.questionId === q.id)?.selectedIndex ?? null,
    })),
  });
});

api.post("/student/attempts/:id/answers", async (c) => {
  const session = await requireStudent(c);
  assertCsrf(c, session);
  const attemptId = Number(c.req.param("id"));
  const body = await c.req.json<{ questionId: number; selectedIndex: number | null }>();
  await saveAnswer(session.user.id, attemptId, body.questionId, body.selectedIndex);
  return c.json({ ok: true, savedAt: serverNowIso() });
});

api.post("/student/attempts/:id/finish", async (c) => {
  const session = await requireStudent(c);
  assertCsrf(c, session);
  const attemptId = Number(c.req.param("id"));
  const result = await finishAttempt(session.user.id, attemptId);
  return c.json({ result });
});

api.post("/student/attempts/:id/events", async (c) => {
  const session = await requireStudent(c);
  const attemptId = Number(c.req.param("id"));
  const body = await c.req.json<{
    eventType: string;
    questionId?: number;
    clientEventId?: string;
    payload?: unknown;
  }>();
  const db = getDb();
  const attempt = await db.select().from(s.attempts).where(eq(s.attempts.id, attemptId)).limit(1);
  const a = attempt[0];
  if (!a || a.userId !== session.user.id) {
    throw new ApiError("FORBIDDEN", "Нет доступа", 403);
  }
  if (body.clientEventId) {
    const dup = await db
      .select()
      .from(s.activityEvents)
      .where(eq(s.activityEvents.clientEventId, body.clientEventId))
      .limit(1);
    if (dup[0]) return c.json({ ok: true, duplicate: true });
  }
  const settings = await getSchoolSettings();
  await db.insert(s.activityEvents).values({
    userId: session.user.id,
    attemptId,
    questionId: body.questionId,
    resetGeneration: settings!.resetGeneration,
    eventType: body.eventType,
    clientEventId: body.clientEventId,
    payloadJson: body.payload ? JSON.stringify(body.payload) : null,
  });
  return c.json({ ok: true });
});

api.get("/student/attempts/:id/result", async (c) => {
  const session = await requireStudent(c);
  const attemptId = Number(c.req.param("id"));
  const db = getDb();
  const attempt = await db.select().from(s.attempts).where(eq(s.attempts.id, attemptId)).limit(1);
  const a = attempt[0];
  if (!a || a.userId !== session.user.id) {
    throw new ApiError("FORBIDDEN", "Нет доступа", 403);
  }
  if (a.status !== "finished") {
    throw new ApiError("VALIDATION", "Попытка ещё не завершена", 400);
  }
  return c.json({
    scorePercent: a.scorePercent,
    correctCount: a.correctCount,
    totalCount: a.totalCount,
    finishedAt: a.finishedAt,
  });
});
