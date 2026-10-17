export function SetupNotice({
  sourceJson,
  seeded,
}: {
  sourceJson: boolean;
  seeded: boolean;
}) {
  return (
    <div className="login-page">
      <div className="card login-card">
        <h1>Foundation School</h1>
        <p className="muted">Нужны исходные материалы для запуска демо.</p>
        <ol>
          <li>
            Загрузите JSON и 10 SVG в папку <code>source-materials/</code> (см. README в репозитории).
          </li>
          <li>
            Выполните: <code>bun run db:migrate</code> и <code>bun run seed</code>
          </li>
          <li>
            Запустите: <code>bun run dev</code> и клиент <code>bunx vite</code>
          </li>
        </ol>
        <p>
          JSON: {sourceJson ? "найден" : "не найден"} · База: {seeded ? "заполнена" : "пустая"}
        </p>
        <p className="muted">
          Учебные данные не генерируются автоматически — используется только приложенный JSON.
        </p>
      </div>
    </div>
  );
}
