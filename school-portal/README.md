# Школьный портал (School Portal)

Веб-портал для администрации и учеников: вход, тесты, сдача работ, панель администратора.

Перенесён с демо-инстанса (`trycloudflare` tunnel). Фронтенд — статические `index.html` + `static/`, данные — `data/portal.json`.

## Быстрый старт

```bash
cd school-portal/server
npm install
npm start
```

Откройте http://127.0.0.1:8080

### Демо-логины

Пароли хранятся в `data/portal.json` → `demo_users` (только для демо).

| Роль | Логин | Пароль (пример) |
|------|-------|-----------------|
| Админ | `admin` | `admin123` |
| Ученик | `6b01` | см. `portal.json` |

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `PORT` | Порт HTTP (по умолчанию `8080`) |
| `PORTAL_SESSION_SECRET` | Секрет подписи cookie `exam_session` |

## Структура

- `index.html` — страница портала
- `static/css`, `static/js` — UI и клиентская логика (`portal.js`, `portal-data.js`)
- `data/portal.json` — школа, классы, тесты, пользователи
- `data/submissions.json` — публичная копия сдач (для GitHub Pages / CDN)
- `data/runtime/` — серверное хранилище сдач и черновиков (создаётся при работе)
- `server/` — Node.js API (совместим с фронтом без режима `PORTAL_USE_STATIC_DATA`)

## Режимы работы фронтенда

- **Сервер (как на tunnel):** тот же хост отдаёт API — cookie-сессия, SSE для админа.
- **Статика (GitHub Pages):** задайте `window.PORTAL_USE_STATIC_DATA = true` — API эмулируется в браузере через `portal-data.js`.

## Дальнейший перенос с VPS

Если на сервере есть отдельный Python/FastAPI-бэкенд с историей сдач, скопируйте:

1. `data/runtime/local_storage.json` или файл сдач с сервера
2. Актуальный `data/portal.json`

Либо замените `server/` на ваш оригинальный бэкенд — фронт ожидает те же пути `/api/*`.
