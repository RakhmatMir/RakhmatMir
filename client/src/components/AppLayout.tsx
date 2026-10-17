import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export function AppLayout({
  children,
  title,
  userName,
  role,
}: {
  children: ReactNode;
  title: string;
  userName: string;
  role: "admin" | "student";
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 24 }}>Foundation School</div>
        <nav style={{ display: "grid", gap: 8 }}>
          {role === "admin" ? (
            <Link to="/admin">Обзор</Link>
          ) : (
            <Link to="/student">Главная</Link>
          )}
        </nav>
        <div style={{ marginTop: "auto", paddingTop: 40, fontSize: 14 }}>{userName}</div>
        <button
          className="btn"
          style={{ marginTop: 12, width: "100%", background: "rgba(255,255,255,0.15)", color: "#fff" }}
          onClick={async () => {
            await api.logout();
            window.location.hash = "#/login";
            window.location.reload();
          }}
        >
          Выйти
        </button>
      </aside>
      <main className="main">
        <h1 style={{ marginTop: 0 }}>{title}</h1>
        {children}
      </main>
    </div>
  );
}
