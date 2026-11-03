# Искра

Прототип сервиса автоматического создания вакансий. Этот репозиторий — **только каркас**:
Next.js App Router, TypeScript, Tailwind CSS и shadcn/ui подключены и собираются, но
продуктовый интерфейс и бизнес-логика намеренно не реализованы. Они появляются в
отдельных feature-ветках через pull request.

## Стек

| Слой       | Выбор                                                       |
| ---------- | ----------------------------------------------------------- |
| Фреймворк  | Next.js 16 (App Router, Turbopack, Cache Components)        |
| Язык       | TypeScript (strict)                                         |
| Стили      | Tailwind CSS 4 + `tw-animate-css`                           |
| Компоненты | shadcn/ui, стиль `radix-nova`, иконки Lucide                |
| Шрифты     | Geist Sans / Geist Mono (self-hosted, пакет `geist`)        |
| Тема       | `next-themes`, CSS-переменные, светлая/тёмная               |
| CI         | GitHub Actions: гигиена репозитория, lint, typecheck, build |

Компоненты shadcn/ui лежат в репозитории (`src/components/ui`) и правятся локально —
внешний визуальный шаблон не используется.

## Требования

- Node.js **22+** (проверено на 22.22)
- npm 10+ (в репозитории есть `package-lock.json`, используем `npm ci`)

## Быстрый старт

```bash
git clone https://github.com/anastasiyarudomyotova/iskra.git
cd iskra
npm ci

cp .env.example .env.local   # значения оставить пустыми, пока не согласованы
npm run dev                  # http://localhost:3000
```

Проверить, что всё как в CI:

```bash
npm run verify    # гигиена репозитория + lint + typecheck + production build
```

## Скрипты

| Команда                 | Что делает                                 |
| ----------------------- | ------------------------------------------ |
| `npm run dev`           | dev-сервер на http://localhost:3000        |
| `npm run build`         | production-сборка                          |
| `npm run start`         | запуск собранного приложения               |
| `npm run lint`          | ESLint (`eslint-config-next`)              |
| `npm run typecheck`     | `next typegen && tsc --noEmit`             |
| `npm run check:secrets` | запрет `.env*`, ключей и аудиофайлов в Git |
| `npm run format`        | Prettier + сортировка Tailwind-классов     |
| `npm run verify`        | полный локальный аналог CI                 |

## Ветки, ревью и защита `main`

- `main` защищена: прямые пуши запрещены, изменения попадают только через PR.
- Ветка на задачу: `feature/<короткое-имя>`, `fix/<...>`, `chore/<...>`, `docs/<...>`.
  Примеры: `feature/shadcn-shell`, `feature/gemini-routes`, `feature/qa-docs`.
- PR проходит обязательные проверки CI (**Repo hygiene** и **Lint, typecheck & build**)
  и ревью PM до merge.
- Merge — squash, ветка после merge удаляется.
- Перед началом работы один раз включите локальный хук:

```bash
git config core.hooksPath .githooks
```

Подробности — в [CONTRIBUTING.md](CONTRIBUTING.md).

## Защита `main` (одноразовая настройка владельца репозитория)

Правила защищают `main` от прямых пушей. Применить их может только владелец
репозитория или токен с правами администратора.

Вариант 1 — скриптом (нужен `gh` с правами admin):

```bash
./scripts/setup-github-protection.sh
```

Вариант 2 — в интерфейсе GitHub:

1. **Settings → General → Pull Requests**: включить _Allow squash merging_,
   выключить merge commit и rebase; включить _Automatically delete head branches_.
2. **Settings → Branches → Add branch protection rule**, pattern `main`:
   - _Require a pull request before merging_ (0 обязательных одобрений, пока
     владелец один; поднять до 1, когда появится второй ревьюер);
   - _Require status checks to pass before merging_ + _Require branches to be up
     to date_: выбрать `Repo hygiene` и `Lint, typecheck & build`;
   - _Require conversation resolution before merging_;
   - _Do not allow bypassing the above settings_;
   - снять _Allow force pushes_ и _Allow deletions_.

## Секреты, данные и приватность

- `.env.example` содержит **только пустые заглушки**. Реальные ключи живут в
  `.env.local` (локально) или в переменных окружения хостинга.
- В репозиторий не попадают: `GEMINI_API_KEY`, любые `.env*` кроме `.env.example`,
  записи голоса и аудиофайлы, реальные данные работодателей и кандидатов.
- Ключ Gemini используется **только на сервере** (Route Handler / Server Action) и
  никогда не уходит в клиентский бандл (никаких `NEXT_PUBLIC_` для ключей) и в логи.
- `npm run check:secrets` + CI-джоба **Repo hygiene** + git-хук ловят нарушения до пуша.
- Репозиторий остаётся **приватным** до проверки PM. Публикация и деплой — только
  после согласования видимости и текста о приватности.

## shadcn/ui

Конфигурация — `components.json` (`style: radix-nova`, база Radix, `neutral`, Lucide).
Утилита `cn` — `src/lib/utils.ts`. Добавление компонентов:

```bash
npx shadcn@latest add card
npx shadcn@latest add dialog field
```

Тема (CSS-переменные светлой/тёмной темы) — в `src/app/globals.css`.
Готовый пример подключённого примитива — `src/components/ui/button.tsx`.

## CI

`.github/workflows/ci.yml` запускается на pull request в `main` и на push в `main`:

1. **Repo hygiene** — `node scripts/check-secrets.mjs`: блокирует `.env*` (кроме
   `.env.example`), ключи и сертификаты, аудио, артефакты сборки; сканирует текст на
   сигнатуры ключей и проверяет, что в `.env.example` нет значений.
2. **Lint, typecheck & build** — `npm ci` → `npm run lint` → `npm run typecheck` →
   `npm run build`.

## Деплой (Vercel, после согласования)

1. Импортировать репозиторий в Vercel, framework — Next.js, команды по умолчанию
   (`npm ci`, `npm run build`).
2. Добавить переменные окружения в настройках проекта: `GEMINI_API_KEY`,
   `GEMINI_MODEL` (значения вводит PM; в коде и Git их нет).
3. Не включать публичный доступ и не подключать домен до подтверждения видимости
   репозитория и наличия текста о приватности.

## Структура

```
src/
  app/
    layout.tsx        # корневой layout: шрифты, тема, метаданные
    page.tsx          # техническая заглушка (продуктового UI нет)
    globals.css       # Tailwind + тема shadcn/ui
  components/
    theme-provider.tsx
    ui/button.tsx     # пример установленного компонента shadcn/ui
  lib/utils.ts        # cn()
scripts/check-secrets.mjs   # проверка гигиены репозитория
.githooks/pre-commit        # тот же проверка до коммита
.github/workflows/ci.yml    # CI
```

## Статус

Готово: каркас, тема, компонентный слой, защита `main`, проверки CI, документация.
Не реализовано (по договорённости): продуктовые экраны, интеграция с Gemini,
бизнес-логика генерации вакансий, деплой.
