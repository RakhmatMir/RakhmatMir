# LAVH TEST — UI демо

Новый интерфейс школьного портала по макетам LAVH: левая панель, центральные карточки, анимации и hover-тени.

## Демо-вход

| Кнопка | Логин | Пароль |
|--------|-------|--------|
| Админ | `admin` | `admin123` |
| Учитель | `admin` | `admin123` (режим учителя) |
| Ученик | `6b01` | `6b01-401` |

Локально:

```bash
cd lavh-test
python3 -m http.server 8080
```

Откройте http://127.0.0.1:8080

После merge в `main` — GitHub Pages:  
**https://rakhmatmir.github.io/RakhmatMir/lavh-test/** (если Pages включены для репозитория).

Данные и логика тестов — `data/portal.json` + `static/js/portal-data.js` (демо-режим в браузере).
