# Foundation School — школьное тестирование

Полнофункциональное демо-приложение (Bun + React/Vite + Hono + Drizzle/SQLite).

## Перед первым запуском

1. Скопируйте **JSON** и **10 SVG** в [`source-materials/`](source-materials/README.md) (учебные данные **не** генерируются автоматически).
2. Установите зависимости и заполните БД:

```bash
bun install
bun run db:migrate
bun run seed
```

3. Запуск:

```bash
bun run dev          # API http://127.0.0.1:3000
bun run dev:client   # UI http://127.0.0.1:5173
```

Демо-вход: `admin` / `admin123`, ученик `6b01` / `6b01-401` (после seed из JSON).

## Проверки

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

E2E (Playwright) и полный набор интеграционных тестов из ТЗ требуют исходный JSON в `source-materials/`.

## Дизайн

См. [`docs/design-references.md`](docs/design-references.md).
