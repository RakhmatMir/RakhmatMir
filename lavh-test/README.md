# LAVH TEST — UI демо

Новый интерфейс школьного портала по макетам LAVH: левая панель, центральные карточки, анимации и hover-тени.

## Несколько школ (подготовка к релизу)

Данные лежат в `data/schools/<код>/portal.json`. Список школ: `data/schools/index.json`.

| Код | Школа | Вход (примеры) |
|-----|--------|----------------|
| `foundation` | Foundation School — демо | админ `admin` / `admin123` (тесты и классы), ученик `6b01` / `6b01-401` |
| `lavh-demo` | Тестовая школа LAVH | админ `admin` / `admin123`, ученик `5a01` / `5a01-501` |

На экране входа — только **логин и пароль** (школа определяется по учётной записи). Сдачи и сессия изолированы по школе в `localStorage`.

**Супер-администратор платформы** (все школы, добавление новых): `superadmin` / `lavh-super-2026` — учётные данные в `data/super-admin.json`. Новые школы в демо сохраняются в браузере; встроенные (`foundation`, `lavh-demo`) — из репозитория.

Новую школу добавляют в репозиторий: папка `data/schools/<код>/portal.json` + запись в `index.json`.

## Демо-вход

### Локально на ноутбуке (основной режим)

Все живые данные — **один файл** `data/platform-store.json` (учётки + сдачи по школам). Практика в файл не пишется.

Запуск (обязательно `serve.py`, не простой `http.server`):

```bash
cd lavh-test
python serve.py
```

Откройте http://127.0.0.1:8080 — регистрации и сдачи автоматически дописываются в `platform-store.json`. При первом запуске, если файла нет, он собирается из `data/users.json` и `data/schools/*/submissions.json`.

Копию для бэкапа достаточно сохранить папку `lavh-test/data/` (или только `platform-store.json`).

### GitHub Pages (один репозиторий)

Публичное демо: **https://rakhmatmir.github.io/RakhmatMir/** — всё в [RakhmatMir/RakhmatMir](https://github.com/RakhmatMir/RakhmatMir): код в `lavh-test/`, живые данные в `lavh-test/data/platform-store.json`. Синхронизация с токеном: `?portal_sync_token=...` (Contents: Read and write на этот репозиторий). Старые копии проекта — папка `D:\old\старые школьные проекты\`.

Данные и логика тестов — `portal-data.js` + полный интерфейс портала `portal-app.js`.

Сдачи школы в репозитории: `data/schools/<код>/submissions.json`. Повторный экспорт с API — `lavh-test/scripts/export-foundation-submissions.py`.

Файл `data/portal.json` устарел; используйте `data/schools/...`.
