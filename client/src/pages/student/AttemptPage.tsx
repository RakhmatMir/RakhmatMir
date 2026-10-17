import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";

export function AttemptPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const attemptId = Number(id);
  const [payload, setPayload] = useState<any>(null);
  const [index, setIndex] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    api.getAttempt(attemptId).then(setPayload);
  }, [attemptId]);

  useEffect(() => {
    if (!payload) return;
    const onVis = () => {
      void api.saveAnswer(attemptId, payload.questions[index]?.id, payload.questions[index]?.selectedIndex);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [payload, index, attemptId]);

  const question = payload?.questions?.[index];

  const timers = useMemo(() => {
    if (!payload) return { attempt: 0, bundle: 0 };
    return { attempt: payload.remainingAttemptSec, bundle: payload.remainingBundleSec };
  }, [payload]);

  async function choose(optionIndex: number) {
    if (!question) return;
    setSaveState("saving");
    try {
      await api.saveAnswer(attemptId, question.id, optionIndex);
      setSaveState("saved");
      setPayload((prev: any) => {
        const next = structuredClone(prev);
        next.questions[index].selectedIndex = optionIndex;
        return next;
      });
    } catch {
      setSaveState("error");
    }
  }

  async function finish() {
    if (!confirm("Завершить тест?")) return;
    await api.finishAttempt(attemptId);
    nav("/student");
  }

  if (!payload) return <div className="main">Загрузка попытки…</div>;

  return (
    <div className="main">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <strong>
            Вопрос {index + 1} / {payload.questions.length}
          </strong>
          <div className="muted">
            Тест: {Math.floor(timers.attempt / 60)}:{String(timers.attempt % 60).padStart(2, "0")} · Пакет:{" "}
            {Math.floor(timers.bundle / 60)}:{String(timers.bundle % 60).padStart(2, "0")}
          </div>
        </div>
        <p style={{ fontSize: "1.2rem", margin: "18px 0" }}>{question?.text}</p>
        <div style={{ display: "grid", gap: 10 }}>
          {question?.options.map((opt: any, i: number) => (
            <button
              key={opt.id}
              className="btn"
              style={{
                textAlign: "left",
                background: question.selectedIndex === i ? "rgba(75,99,222,0.12)" : "#fff",
                border: "1px solid var(--border)",
              }}
              onClick={() => choose(i)}
            >
              {opt.text}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn" disabled={index === 0} onClick={() => setIndex((v) => v - 1)}>
            Назад
          </button>
          <button
            className="btn"
            disabled={index >= payload.questions.length - 1}
            onClick={() => setIndex((v) => v + 1)}
          >
            Далее
          </button>
          <button className="btn btn-primary" onClick={finish}>
            Завершить
          </button>
          <span className="muted" aria-live="polite">
            {saveState === "saving" && "Сохраняем…"}
            {saveState === "saved" && "Сохранено"}
            {saveState === "error" && "Не удалось сохранить"}
          </span>
        </div>
      </div>
    </div>
  );
}
