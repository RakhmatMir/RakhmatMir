import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setCsrf } from "../lib/api";

export function LoginPage() {
  const nav = useNavigate();
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(login, password);
      setCsrf(res.csrfToken);
      nav(res.user.role === "admin" ? "/admin" : "/student", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
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
        <p className="muted">Пример ученика: 6b01 / 6b01-401</p>
      </form>
    </div>
  );
}
