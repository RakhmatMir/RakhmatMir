# LAVH TEST — UI демо

Новый интерфейс школьного портала по макетам LAVH: левая панель, центральные карточки, анимации и hover-тени.

## Несколько школ (подготовка к релизу)

Данные лежат в `data/schools/<код>/portal.json`. Список школ: `data/schools/index.json`.

| Код | Школа | Вход (примеры) |
|-----|--------|----------------|
| `foundation` | Foundation School — демо | админ `admin` / `admin123`, ученик `6b01` / `6b01-401` |
| `lavh-demo` | Тестовая школа LAVH | админ `admin` / `admin123`, ученик `5a01` / `5a01-501` |

На экране входа укажите **код школы**, затем логин и пароль. Сдачи и сессия изолированы по школе в `localStorage`.

Новую школу добавляют в репозиторий: папка `data/schools/<код>/portal.json` + запись в `index.json`.

## Демо-вход

Локально:

```bash
cd lavh-test
python3 -m http.server 8080
```

Откройте http://127.0.0.1:8080

Публичная ссылка:

**https://rakhmatmir.github.io/RakhmatMir/**

Данные и логика тестов — `portal-data.js` (демо-режим в браузере, `PORTAL_USE_STATIC_DATA`).

Файл `data/portal.json` устарел; используйте `data/schools/...`.
