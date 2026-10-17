# Исходные материалы Foundation School

Положите сюда файлы **до** `bun run seed`:

| Файл | Назначение |
|------|------------|
| `foundation-school.json` (или единственный `*.json`) | Данные школы, класса, 18 учеников, 3 теста |
| `1_uk5_7M.svg` … `10_eJ74p6.svg` | Визуальные референсы (сохраняются как есть) |

JSON **не** попадает в клиентский bundle: копия архивируется в `data/private/foundation-school.original.json`.

После добавления JSON:

```bash
bun run db:migrate
bun run seed
bun run dev          # API :3000
bun run dev:client   # UI :5173
```
