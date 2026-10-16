# LAVH presentation (HTML)

Титульный слайд **LAVH TEST 2026** — HTML + CSS + JS (без отдельного SVG-файла в браузере).

## Локально

```bash
cd deploy/lavh-presentation
python3 -m http.server 8080
```

Открыть: http://localhost:8080/

## GitHub Pages

Workflow публикует сайт на ветку **`gh-pages`**.  
**Один раз** включите Pages — см. **[ENABLE.md](./ENABLE.md)**.

Рабочие URL после включения:

- https://rakhmatmir.github.io/RakhmatMir/
- https://rakhmatmir.github.io/RakhmatMir/standalone.html

## Данные с портала

В `js/config.js` задаётся `LAVH_PORTAL_API`. Скрипт запрашивает `/api/public/landing` и подставляет `school_name`.

Если туннель выключен или CORS не разрешён — показывается заготовка внизу страницы.
