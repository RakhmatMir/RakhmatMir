import type { User } from "./api";

/** In-browser demo backend for GitHub Pages (localStorage). Demo only. */
type DemoState = {
  session: User | null;
  csrf: string;
  published: Record<number, boolean>;
  attempts: Record<
    number,
    {
      id: number;
      examId: number;
      userId: number;
      status: string;
      startedAt: string;
      deadlineAt: string;
      answers: Record<number, number | null>;
      scorePercent?: number;
      correctCount?: number;
      totalCount?: number;
    }
  >;
  nextAttemptId: number;
};

const KEY = "foundation-school-pages-demo";

let catalog: Awaited<ReturnType<typeof loadCatalog>> | null = null;

async function loadCatalog() {
  const base = import.meta.env.BASE_URL ?? "/";
  const res = await fetch(`${base}foundation-school.json`);
  if (!res.ok) throw new Error("Не удалось загрузить данные");
  return res.json() as {
    school_name: string;
    demo_users: Array<{
      id: number;
      login: string;
      password: string;
      full_name: string;
      role: "admin" | "student";
    }>;
    exams: Array<{
      id: number;
      title: string;
      duration_minutes: number;
      published_to_students: boolean;
      subject_code: string;
      questions: Array<{ text: string; options: string[]; correct_index: number }>;
    }>;
    class_schedules: Record<string, { total_minutes: number }>;
  };
}

function loadState(): DemoState {
  const raw = localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw) as DemoState;
  return { session: null, csrf: "pages-demo", published: {}, attempts: {}, nextAttemptId: 1 };
}

function saveState(s: DemoState) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

function englishBlocked(examId: number, questions: { text: string }[]) {
  if (examId !== 102) return false;
  return questions.some((q, i) => i === 7 && q.text.includes("pstudent"));
}

export async function pagesDemoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!catalog) catalog = await loadCatalog();
  const state = loadState();
  const method = init?.method ?? "GET";

  if (path === "/health" && method === "GET") {
    return { seeded: true, sourceJson: true } as T;
  }

  if (path === "/login" && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}")) as { login?: string; password?: string };
    const user = catalog.demo_users.find(
      (u) => u.login === body.login && u.password === body.password,
    );
    if (!user) throw new Error("Неверный логин или пароль");
    state.session = {
      id: user.id,
      login: user.login,
      role: user.role,
      name: user.full_name,
    };
    saveState(state);
    return { user: state.session, csrfToken: state.csrf } as T;
  }

  if (path === "/logout" && method === "POST") {
    state.session = null;
    saveState(state);
    return { ok: true } as T;
  }

  if (path === "/me" && method === "GET") {
    if (!state.session) throw new Error("Требуется вход");
    return { user: state.session, csrfToken: state.csrf } as T;
  }

  if (path === "/admin/overview" && method === "GET") {
    if (state.session?.role !== "admin") throw new Error("Нет доступа");
    const students = catalog.demo_users.filter((u) => u.role === "student");
    return {
      schoolName: catalog.school_name,
      className: "6Б",
      kpis: { students: students.length, exams: catalog.exams.length, finishedAttempts: 0, average: null },
      exams: catalog.exams.map((e) => ({
        id: e.id,
        title: e.title,
        durationMinutes: e.duration_minutes,
        publishedToStudents: state.published[e.id] ?? e.published_to_students,
        hasNeedsReview: englishBlocked(e.id, e.questions),
        subjectId: e.subject_code,
        examDate: "07.10.2026",
        contentVersion: 1,
      })),
      englishReview: englishBlocked(102, catalog.exams.find((x) => x.id === 102)?.questions ?? [])
        ? [{ id: 1 }]
        : [],
    } as T;
  }

  if (path.match(/^\/admin\/exams\/\d+\/publish$/) && method === "POST") {
    const examId = Number(path.split("/")[3]);
    const exam = catalog.exams.find((e) => e.id === examId);
    if (!exam) throw new Error("Тест не найден");
    if (englishBlocked(examId, exam.questions)) {
      throw new Error("Требуется проверка содержания теста");
    }
    state.published[examId] = true;
    saveState(state);
    return { ok: true } as T;
  }

  if (path === "/student/dashboard" && method === "GET") {
    if (state.session?.role !== "student") throw new Error("Нет доступа");
    const cards = catalog.exams.map((exam) => {
      const published = state.published[exam.id] ?? exam.published_to_students;
      const blocked = englishBlocked(exam.id, exam.questions);
      const attempt = Object.values(state.attempts).find(
        (a) => a.examId === exam.id && a.userId === state.session!.id,
      );
      let status = "awaiting_publish";
      if (blocked) status = "needs_review";
      else if (!published) status = "awaiting_publish";
      else if (attempt?.status === "finished") status = "finished";
      else if (attempt?.status === "in_progress") status = "in_progress";
      else status = "available";
      return {
        exam: {
          id: exam.id,
          title: exam.title,
          durationMinutes: exam.duration_minutes,
          publishedToStudents: published,
          hasNeedsReview: blocked,
        },
        attempt,
        status,
      };
    });
    return {
      student: state.session,
      className: "6Б",
      bundleLimit: catalog.class_schedules["6Б"]?.total_minutes ?? 45,
      cards,
    } as T;
  }

  const startMatch = path.match(/^\/student\/exams\/(\d+)\/start$/);
  if (startMatch && method === "POST") {
    const examId = Number(startMatch[1]);
    const exam = catalog.exams.find((e) => e.id === examId)!;
    const published = state.published[examId] ?? exam.published_to_students;
    if (!published) throw new Error("Тест не опубликован");
    if (englishBlocked(examId, exam.questions)) throw new Error("Тест на проверке содержания");
    let attempt = Object.values(state.attempts).find(
      (a) => a.examId === examId && a.userId === state.session!.id,
    );
    if (!attempt) {
      const now = Date.now();
      attempt = {
        id: state.nextAttemptId++,
        examId,
        userId: state.session!.id,
        status: "in_progress",
        startedAt: new Date(now).toISOString(),
        deadlineAt: new Date(now + exam.duration_minutes * 60_000).toISOString(),
        answers: {},
      };
      state.attempts[attempt.id] = attempt;
      saveState(state);
    }
    return { attemptId: attempt.id } as T;
  }

  const attemptMatch = path.match(/^\/student\/attempts\/(\d+)$/);
  if (attemptMatch && method === "GET") {
    const attemptId = Number(attemptMatch[1]);
    const attempt = state.attempts[attemptId];
    if (!attempt || attempt.userId !== state.session!.id) throw new Error("Нет доступа");
    const exam = catalog.exams.find((e) => e.id === attempt.examId)!;
    const questions = exam.questions.map((q, i) => ({
      id: i + 1,
      sortOrder: i + 1,
      text: q.text.replace(/\\n/g, ""),
      options: q.options.map((text, j) => ({ id: j, text })),
      selectedIndex: attempt.answers[i + 1] ?? null,
    }));
    const rem = Math.max(0, Math.floor((new Date(attempt.deadlineAt).getTime() - Date.now()) / 1000));
    return {
      attempt,
      bundleDeadline: attempt.deadlineAt,
      serverNow: new Date().toISOString(),
      remainingAttemptSec: rem,
      remainingBundleSec: rem,
      questions,
    } as T;
  }

  const answerMatch = path.match(/^\/student\/attempts\/(\d+)\/answers$/);
  if (answerMatch && method === "POST") {
    const attemptId = Number(answerMatch[1]);
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      questionId: number;
      selectedIndex: number | null;
    };
    const attempt = state.attempts[attemptId];
    if (!attempt || attempt.userId !== state.session!.id) throw new Error("Нет доступа");
    attempt.answers[body.questionId] = body.selectedIndex;
    saveState(state);
    return { ok: true, savedAt: new Date().toISOString() } as T;
  }

  const finishMatch = path.match(/^\/student\/attempts\/(\d+)\/finish$/);
  if (finishMatch && method === "POST") {
    const attemptId = Number(finishMatch[1]);
    const attempt = state.attempts[attemptId];
    if (!attempt) throw new Error("Нет доступа");
    const exam = catalog.exams.find((e) => e.id === attempt.examId)!;
    let correct = 0;
    exam.questions.forEach((q, i) => {
      if (attempt.answers[i + 1] === q.correct_index) correct += 1;
    });
    attempt.status = "finished";
    attempt.correctCount = correct;
    attempt.totalCount = exam.questions.length;
    attempt.scorePercent = Math.round((correct / exam.questions.length) * 1000) / 10;
    saveState(state);
    return { result: attempt } as T;
  }

  throw new Error(`Pages demo: unsupported ${method} ${path}`);
}
