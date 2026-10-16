# Как открыть слайд в браузере

## Вариант A — GitHub Pages (рекомендуется)

Сайт уже лежит на ветке **`gh-pages`**, но в репозитории нужно **один раз** включить Pages:

1. Откройте: https://github.com/RakhmatMir/RakhmatMir/settings/pages  
2. **Build and deployment → Source:** Deploy from a branch  
3. **Branch:** `gh-pages` → папка **`/ (root)`** → **Save**  
4. Подождите 1–3 минуты.

**Ссылки:**

- https://rakhmatmir.github.io/RakhmatMir/  
- https://rakhmatmir.github.io/RakhmatMir/standalone.html (один файл, всё внутри)

## Вариант B — репозиторий `prezentaciya` (у вас уже работает Pages)

Скопируйте содержимое папки `deploy/lavh-presentation` в репозиторий  
https://github.com/RakhmatMir/prezentaciya в каталог **`lavh/`**  
(через веб: Add file → Upload files).

Тогда слайд будет здесь: **https://rakhmatmir.github.io/prezentaciya/lavh/**

## Локально

```bash
cd deploy/lavh-presentation
python3 -m http.server 8080
```

Откройте http://localhost:8080/ или файл `standalone.html`.
