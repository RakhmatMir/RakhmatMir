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

**Демо-пароли**

| Роль | Логин | Пароль |
|------|-------|--------|
| Администратор | `admin` | `admin123` |
| Ученик (6Б) | `6b01` | `6b01-401` |

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

## Постоянная ссылка (как портфолио на GitHub Pages)

После push в ветку **`school-test-v2`** GitHub Actions публикует сайт:

**https://rakhmatmir.github.io/RakhmatMir/school/**

Один раз на телефоне: GitHub → репозиторий **RakhmatMir** → **Settings** → **Pages** → Source: ветка **`gh-pages`**, папка **`/ (root)`** → **Save**. (Как у `prezentaciya`, только ветка `gh-pages`.)

Демо-режим Pages: данные и логика в браузере (localStorage), вход `admin` / `admin123`.

## Постоянная ссылка на полный сервер (Render)

Код в GitHub **не открывает** приложение. Нужен хостинг:

1. Откройте **[Deploy on Render](https://render.com/deploy?repo=https://github.com/RakhmatMir/RakhmatMir)** (в Render выберите ветку **`school-test-v2`**).
2. Войдите через GitHub → **Apply** / **Create Web Service**.
3. Постоянный адрес: **`https://foundation-school-6b.onrender.com`**

Первый заход после простоя может занять до ~1 минуты (бесплатный тариф Render).
