import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setCsrf } from "../lib/api";

const DEMO_ACCOUNTS = {
  admin: { login: "admin", password: "admin123", label: "Администратор" },
  student: { login: "6b01", password: "6b01-401", label: "Ученик (6Б)" },
} as const;

export function LoginPage() {
  const nav = useNavigate();
  const [login, setLogin] = useState(DEMO_ACCOUNTS.admin.login);
  const [password, setPassword] = useState(DEMO_ACCOUNTS.admin.password);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function doLogin(loginValue: string, passwordValue: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(loginValue, passwordValue);
      setCsrf(res.csrfToken);
      if (import.meta.env.VITE_PAGES_DEMO === "true") {
        window.location.hash = res.user.role === "admin" ? "#/admin" : "#/student";
        window.location.reload();
      } else {
        nav(res.user.role === "admin" ? "/admin" : "/student", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await doLogin(login, password);
  }

  function fillDemo(which: keyof typeof DEMO_ACCOUNTS) {
    const acc = DEMO_ACCOUNTS[which];
    setLogin(acc.login);
    setPassword(acc.password);
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={onSubmit}>
        <h1>Foundation School</h1>
        <p className="muted">Школьное тестирование · демо-режим</p>
        <p className="badge badge-warn">Демо-аккаунты. Замените перед реальной эксплуатацией.</p>
        <label className="muted">
          Логин
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} />
        </label>
        <label className="muted">
          Пароль
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "Вход…" : "Войти"}
        </button>
        <div className="card" style={{ marginTop: 16, padding: 16, boxShadow: "none" }}>
          <p style={{ margin: "0 0 10px", fontWeight: 600 }}>Демо-пароли</p>
          <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
            <thead>
              <tr className="muted">
                <th style={{ textAlign: "left", padding: "4px 0" }}>Роль</th>
                <th style={{ textAlign: "left" }}>Логин</th>
                <th style={{ textAlign: "left" }}>Пароль</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{DEMO_ACCOUNTS.admin.label}</td>
                <td>
                  <code>{DEMO_ACCOUNTS.admin.login}</code>
                </td>
                <td>
                  <code>{DEMO_ACCOUNTS.admin.password}</code>
                </td>
              </tr>
              <tr>
                <td>{DEMO_ACCOUNTS.student.label}</td>
                <td>
                  <code>{DEMO_ACCOUNTS.student.login}</code>
                </td>
                <td>
                  <code>{DEMO_ACCOUNTS.student.password}</code>
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={() => {
                fillDemo("admin");
                void doLogin(DEMO_ACCOUNTS.admin.login, DEMO_ACCOUNTS.admin.password);
              }}
            >
              Войти как админ
            </button>
            <button
              type="button"
              className="btn"
              style={{ border: "1px solid var(--border)", background: "#fff" }}
              disabled={loading}
              onClick={() => {
                fillDemo("student");
                void doLogin(DEMO_ACCOUNTS.student.login, DEMO_ACCOUNTS.student.password);
              }}
            >
              Войти как ученик
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
