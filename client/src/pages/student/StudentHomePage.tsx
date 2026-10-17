import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type User } from "../../lib/api";
import { AppLayout } from "../../components/AppLayout";

const statusLabel: Record<string, string> = {
  awaiting_publish: "Ожидает публикации",
  available: "Доступен",
  in_progress: "В процессе",
  finished: "Завершён",
  needs_review: "На проверке содержания",
};

export function StudentHomePage({ user }: { user: User }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.studentDashboard().then(setData);
  }, []);

  return (
    <AppLayout role="student" title="Мой кабинет" userName={user.name}>
      {!data && <p>Загрузка…</p>}
      {data && (
        <>
          <div className="card">
            <h2>
              {user.name} · класс {data.className}
            </h2>
            <p className="muted">Общий лимит пакета: {data.bundleLimit} минут</p>
          </div>
          <div className="grid-3" style={{ marginTop: 16 }}>
            {data.cards.map(({ exam, attempt, status }: any) => (
              <div className="card" key={exam.id}>
                <h3>{exam.title}</h3>
                <p className="muted">
                  {exam.durationMinutes} мин · {statusLabel[status] ?? status}
                </p>
                {status === "available" && (
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      const res = await api.startExam(exam.id);
                      window.location.hash = `#/student/attempts/${res.attemptId}`;
                    }}
                  >
                    Начать
                  </button>
                )}
                {status === "in_progress" && attempt && (
                  <Link className="btn btn-primary" to={`/student/attempts/${attempt.id}`}>
                    Продолжить
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </AppLayout>
  );
}
