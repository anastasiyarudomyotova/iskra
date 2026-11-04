# Искра

Прототип создания вакансии: четыре вопроса, голосовой или текстовый ответ,
подтверждение, редактирование и итоговый черновик. Состояние интерфейса хранится
в памяти страницы и теряется при обновлении. Аудио и тексты отправляются через
сервер в Gemini для обработки; это не полностью локальный режим. Для демонстрации
используйте только вымышленные данные.

### Голосовой ввод

После остановки записи браузер отправляет аудио в `/api/transcribe`; сервер
передаёт его в Gemini. Старый `NEXT_PUBLIC_ISKRA_MOCK` больше не включает
фиктивную расшифровку. При ошибке сохраняется ручной текстовый ввод.
Черновик и проверка также используют серверный Gemini. Для приёмки применяйте
только вымышленные данные. По сообщению пользователя голосовой сценарий в
Production работал после PR #12; в рамках данного аудита live-проверка не проводилась.
Подробности — в [INTEGRATIONS.md](INTEGRATIONS.md), [SPEC.md](SPEC.md), [QA.md](QA.md).

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

cp .env.example .env.local   # для тестов значения можно оставить пустыми
npm run dev                  # http://localhost:3000
```

Для расшифровки, создания и оценки черновика требуется серверный
`GEMINI_API_KEY`. Задайте его непосредственно в `.env.local` или в защищённых
переменных хостинга, не в чат и не в Git. Ключ не передаётся в браузер.
Старый `NEXT_PUBLIC_ISKRA_MOCK` не включает фиктивную расшифровку. Live-вызовы
могут расходовать квоту и деньги; перед ними согласуйте privacy notice и доступ.

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

- Изменения предполагается проводить через PR. Фактическую защиту `main`
  необходимо отдельно проверить в настройках GitHub: в этом аудите доступ к ней
  был ограничен, поэтому наличие защиты не подтверждено.
- Ветка на задачу: `feature/<короткое-имя>`, `fix/<...>`, `chore/<...>`, `docs/<...>`.
  Примеры: `feature/shadcn-shell`, `feature/gemini-routes`, `feature/qa-docs`.
- Рекомендуемые проверки CI: **Repo hygiene** и **Lint, typecheck & build**;
  ревью PM до merge. Требование этих проверок в настройках не подтверждено.
- Рекомендуется squash merge; автоматическое удаление веток не включено.
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
- `npm run check:secrets`, CI-джоба **Repo hygiene** и git-хук проверяют
  известные сигнатуры и запрещённые пути, но не гарантируют выявление всех утечек.
- Репозиторий следует публиковать только после аудита содержимого, истории и
  метаданных; перед применением реальных данных нужно согласовать приватность.

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

Production-ключ разрешён владельцем; изменения переменных применяются только
к новым развёртываниям. До работы с реальными данными согласуйте privacy/consent
и финансовые риски. Настройки WAF и квоты аккаунта в этом аудите не проверены;
приложение не гарантирует общий бюджет или concurrency-лимиты. Подробности —
[INTEGRATIONS.md](INTEGRATIONS.md). Merge в main может автоматически развернуть Production.

## Структура

```
src/
  app/
    layout.tsx        # корневой layout: шрифты, тема, метаданные
    page.tsx          # мастер создания вакансии и голосовой ввод
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

Реализованы: мастер создания вакансии, серверные маршруты Gemini,
синтетические тесты без ключа, проверки CI и документация интеграции.
В этом аудите живой вызов Gemini и end-to-end с серверным секретом не проверялись.
Пользователь сообщила об успешном голосовом сценарии в Production после PR #12.
Публикация репозитория — только после завершения аудита.

## Лицензия

Для кода проекта явная лицензия пока не указана. Публичный доступ сам по себе
не предоставляет права на повторное использование. Зависимости распространяются
по собственным лицензиям; условия их применения нужно проверять отдельно.
