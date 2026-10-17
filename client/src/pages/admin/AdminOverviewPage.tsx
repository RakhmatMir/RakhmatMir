import { useEffect, useState } from "react";
import { api, type User } from "../../lib/api";
import { AppLayout } from "../../components/AppLayout";

export function AdminOverviewPage({ user }: { user: User }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminOverview()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <AppLayout role="admin" title="Обзор" userName={user.name}>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Загрузка…</p>}
      {data && (
        <>
          <div className="grid-3">
            <div className="card">
              <div className="muted">Ученики</div>
              <div className="kpi">{data.kpis.students}</div>
            </div>
            <div className="card">
              <div className="muted">Тесты</div>
              <div className="kpi">{data.kpis.exams}</div>
            </div>
            <div className="card">
              <div className="muted">Средний результат</div>
              <div className="kpi">{data.kpis.average ?? "Нет данных"}</div>
            </div>
          </div>
          {data.englishReview?.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <strong>Предупреждение:</strong> английский тест содержит вопросы на проверке (
              {data.englishReview.length}). Публикация заблокирована до исправления.
            </div>
          )}
          <div className="grid-3" style={{ marginTop: 16 }}>
            {data.exams.map((exam: any) => (
              <div className="card" key={exam.id}>
                <h3>{exam.title}</h3>
                <p className="muted">{exam.durationMinutes} мин · ID {exam.id}</p>
                <span className={`badge ${exam.publishedToStudents ? "badge-ok" : "badge-warn"}`}>
                  {exam.publishedToStudents ? "Опубликован" : "Не опубликован"}
                </span>
                {!exam.publishedToStudents && !exam.hasNeedsReview && (
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: 12 }}
                    onClick={() => api.publishExam(exam.id).then(() => window.location.reload())}
                  >
                    Опубликовать
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </AppLayout>
  );
}
