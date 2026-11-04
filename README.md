# Искра

Прототип создания вакансии: четыре вопроса, голосовой или текстовый ответ,
подтверждение, редактирование и итоговый черновик. Данные остаются в памяти страницы;
при обновлении страницы они теряются. Используйте только вымышленные данные.

### Демо-расшифровка

```bash
npm ci
NEXT_PUBLIC_ISKRA_MOCK=true npm run dev
```

Флаг `NEXT_PUBLIC_ISKRA_MOCK=true` включает только **вымышленную расшифровку**:
аудио не отправляется, но `/api/draft` и `/api/completeness` по-прежнему вызывают
серверный Gemini и требуют `GEMINI_API_KEY`. Это не полностью офлайн-режим.
Без флага запись также передаётся на сервер для расшифровки.
Черновик и проверка используют Gemini Interactions API (`store: false`);
старый `POST /api/generate` сохранён для совместимости, текущий UI вызывает
`/api/draft` и `/api/completeness`. Без ключа сервер вернёт безопасную ошибку,
а UI сохранит введённые ответы.
Аудио отправляется на сервер только в реальном режиме после остановки записи.
Запись поддерживается браузерами с MediaRecorder и разрешением на микрофон;
текстовый ввод доступен всегда. Записи не сохраняются в репозиторий.
Подробности и лимиты — в [INTEGRATIONS.md](INTEGRATIONS.md), актуальные
сценарии — в [SPEC.md](SPEC.md), матрица проверок — в [QA.md](QA.md).

Проверка содержательности сейчас ограничена непустым ответом и минимальной длиной
15 символов; это не семантическая оценка. Модель инструктирована не придумывать
неизвестные факты, но достоверность необходимо проверить человеку. Изменение
ответов не переписывает черновик автоматически: пересоздание требует подтверждения
и заменяет правки только после успешного ответа.

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

cp .env.example .env.local   # для демо значения можно оставить пустыми
npm run dev                  # http://localhost:3000
```

Для создания и оценки черновика требуется серверный `GEMINI_API_KEY`; для
настоящей расшифровки mock-флаг должен быть выключен. Не подключайте ключ и не
запускайте live Gemini до согласования privacy notice и отдельного разрешения.
Ключ не передаётся в браузер и не коммитится.

Проверить, что всё как в CI:

```bash
npm test          # серверные тесты с mock Gemini, без настоящего ключа
npm run verify    # гигиена + lint + typecheck + тесты + production build
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
| `npm test`              | серверные тесты, Gemini endpoint mocked    |
| `npm run test:watch`    | тесты в режиме наблюдения                  |
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
   `npm test` (mock Gemini, без секретов) → `npm run build`.

## Активация live AI

До отдельного согласования privacy/consent и финансовых рисков Production-ключ не
добавлять и live Gemini не вызывать. WAF требует отдельной настройки; этот PR не
создаёт и не гарантирует общий бюджет или concurrency-лимиты. Подробности —
[INTEGRATIONS.md](INTEGRATIONS.md). Merge в main может автоматически развернуть Production.

## Структура

```
src/
  app/
    layout.tsx        # корневой layout: шрифты, тема, метаданные
    page.tsx          # мастер создания вакансии и деморежим
    api/transcribe/route.ts  # POST: аудио → расшифровка
    api/generate/route.ts    # POST: совместимый прежний контракт вакансии
    api/draft/route.ts       # POST: четыре ответа → блоки черновика
    api/completeness/route.ts # POST: текущий текст → оценка четырёх тем
    globals.css       # Tailwind + тема shadcn/ui
  components/
    theme-provider.tsx
    ui/button.tsx     # пример установленного компонента shadcn/ui
  lib/utils.ts        # cn()
  lib/server/         # Gemini, схемы, валидация аудио, безопасные ошибки
tests/                # синтетические фикстуры и mock Gemini
scripts/check-secrets.mjs   # проверка гигиены репозитория
.githooks/pre-commit        # тот же проверка до коммита
.github/workflows/ci.yml    # CI
```

## Статус

Готово: мастер создания вакансии, деморежим, серверные маршруты Gemini,
синтетические тесты без ключа, проверки CI и документация интеграции.
Не проверено в этой задаче: живой вызов Gemini и end-to-end с реальным серверным
секретом. Деплой и публикация — после согласования PM.
