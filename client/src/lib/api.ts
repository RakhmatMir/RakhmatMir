let csrfToken: string | null = null;

export function setCsrf(token: string | null) {
  csrfToken = token;
}

const usePagesDemo = import.meta.env.VITE_PAGES_DEMO === "true";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (usePagesDemo) {
    const { pagesDemoFetch } = await import("./pages-demo");
    return pagesDemoFetch<T>(path, init);
  }
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (csrfToken && init?.method && init.method !== "GET") {
    headers.set("X-CSRF-Token", csrfToken);
  }
  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? "Ошибка запроса");
  }
  return data as T;
}

export const api = {
  health: () => request<{ seeded: boolean; sourceJson: boolean }>("/health"),
  login: (login: string, password: string) =>
    request<{ user: User; csrfToken: string }>("/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    }),
  logout: () => request("/logout", { method: "POST" }),
  me: () => request<{ user: User; csrfToken: string }>("/me"),
  adminOverview: () => request("/admin/overview"),
  studentDashboard: () => request("/student/dashboard"),
  startExam: (id: number) =>
    request<{ attemptId: number }>(`/student/exams/${id}/start`, { method: "POST" }),
  getAttempt: (id: number) => request(`/student/attempts/${id}`),
  saveAnswer: (id: number, questionId: number, selectedIndex: number | null) =>
    request(`/student/attempts/${id}/answers`, {
      method: "POST",
      body: JSON.stringify({ questionId, selectedIndex }),
    }),
  finishAttempt: (id: number) => request(`/student/attempts/${id}/finish`, { method: "POST" }),
  publishExam: (id: number) => request(`/admin/exams/${id}/publish`, { method: "POST" }),
};

export type User = {
  id: number;
  login: string;
  role: "admin" | "student";
  name: string;
};
