# Final spec / negative-path audit

**Проверенный main:** `8d07685eae13a5a382889777cbdede32088c8fe3` (получен из `origin/main` до аудита). Ниже «после исправления» означает рабочую ветку аудита, не незаметное изменение main. Требования проверены по фактическому коду; в этом аудите используются только синтетические данные и мокированный `fetch`, без ключа и платных вызовов.

Статусы: **PASS** — указанная проверка прошла в этой задаче; **PARTIAL** — есть защита или проверка, но доказательство неполно; **GAP** — известный невыполненный критерий или отсутствие автоматического покрытия.

| Требование | Свидетельство: код / тест | Статус и пробел |
|---|---|---|
| Отказ/неподдерживаемый микрофон, ошибка рекордера, пустая запись; сохранение ответа и ручной ввод | `src/app/page.tsx` `startRecording`/`transcribe`; `tests/ui-audit.test.ts` `voice negative paths` | PASS после исправления; jsdom, не аппаратный микрофон. |
| Таймаут, сеть, пустой transcript не уничтожают ответ | `tests/ui-audit.test.ts` `keeps the answer on transcription…`; `tests/transcribe.test.ts` `accepts a valid no-speech result…`; `tests/gemini.test.ts` deadline/body timeout | PASS для моков; нет теста поведения реальной мобильной ОС. |
| Пока запрашивается разрешение, повторное нажатие не открывает два микрофона; поток закрывается при ошибке или размонтировании | `microphonePending`, `requesting`, cleanup в `page.tsx`; `ui-audit.test.ts` `locks pending permission…`, `releases a late stream…` | PASS после исправления. Исходный main имел гонку и не закрывал поток, если конструктор рекордера выбрасывал исключение. |
| Повторная генерация/проверка и запоздавшие ответы | `generationInFlight`, `assessmentInFlight`, версии в `page.tsx`; `ui-audit.test.ts` `prevents duplicate submission…`; `ui-review-audit.test.ts` `ignores a stale review…`, `does not let a delayed regeneration…` | PASS для проверенных сценариев в jsdom. Старый запрос не отменяется на сервере; его результат игнорируется, поэтому расход провайдера возможен. |
| `/api/draft`, `/api/completeness`: схемы и безопасные ошибки | `src/app/api/{draft,completeness}/route.ts`, `src/lib/server/{draft-generation,completeness}.ts`; `draft-generation.test.ts`, `completeness.test.ts`, `api-negative-audit.test.ts`; `INTEGRATIONS.md` | PASS для указанных контрактов, JSON, лимитов и моковых ошибок. `/api/review` не существует; фактический путь — `/api/completeness`, алиас не добавлялся. |
| `/api/generate` совместим | `src/app/api/generate/route.ts`; `tests/generate.test.ts` `returns exactly the approved contract…`, `shared upstream failure handling` | PASS на моках; код маршрута и контракт не менялись. |
| Проверка смотрит на текущий текст; правки и копирование не теряются при ошибке | `page.tsx` `changeDraft`, `checkCompleteness`, `copy`; `ui-review-audit.test.ts` `ignores a stale review…`; `completeness.test.ts` `sends the entire current document…` | PASS для тестовых ситуаций; ручное редактирование проверено через synthetic paste в jsdom. |
| HTML/plain-text, fallback и отказ буфера | `page.tsx` `copy`, `src/lib/draft.ts` `plainText`; `ui-review-audit.test.ts` `tries plain text after HTML clipboard failure…`; `draft.test.ts` | PASS для мокированных буферов. Реальные разрешения браузера и специфические приложения-получатели не проверены. |
| Вставка небезопасного HTML и URL | `rich-draft-editor.tsx` StarterKit `link: false`; `editor-security.test.ts` `sanitizes clipboard HTML…`, `discards unsafe elements…` | PARTIAL: jsdom/ProseMirror проверяет выбранные `javascript:`, обработчики, `<img>` и ссылки; полный XSS-аудит и реальные браузеры не проведены. |
| Пустые/короткие/неоднозначные/противоречивые ответы | `page.tsx` `next`; `generateRequestSchema`; `completeness.test.ts` `accepts mixed vague, missing and sufficient topics`, `rejects model claims about empty input` | PARTIAL: UI проверяет 15 символов, API — непустую строку; модельная оценка неоднозначности мокирована. Противоречия автоматически не выявляются и могут остаться незамеченными. |
| Неверная модель, отсутствующий ключ, 429/503/504, размер/тип | `api-negative-audit.test.ts`, `gemini.test.ts`, `generate.test.ts`, `transcribe.test.ts`, `draft-generation.test.ts`, `completeness.test.ts` | PASS для названных синтетических примеров. Запросы каждого маршрута не исчерпывают все комбинации ошибок. |
| Ошибки без утечек, отсутствие выдуманного прогресса модели | `api`/индикаторы `page.tsx`; `api-errors.ts`; `tests/generate.test.ts` `does not log credentials…`; `draft-generation.test.ts` `logs only the provider status…` | PARTIAL: доступные пользователю ошибки общие; текст модели может содержать неподтверждённые факты. Оценка семантической безопасности не автоматизирована. |
| Данные и retention | `gemini.ts` (`store: false`, `background: false`), `next.config.ts`, `INTEGRATIONS.md` | PARTIAL: код не логирует тела; Vercel access/body logs, условия Gemini и независимое хранение провайдера не исследованы. `store:false` не означает отсутствия обработки. |

## Findings / severity

- **P1, исправлено в ветке:** pending `getUserMedia` оставлял UI в `idle`, допуская параллельные запросы и изменение шага; исключение `new MediaRecorder(stream)` оставляло дорожки открытыми. Добавлены синхронный guard, состояние ожидания, остановка дорожек при ошибке/размонтировании и тесты.
- **P2, исправлено в ветке:** дублирование запросов генерации/повторной оценки до повторного рендера не было явно защищено синхронной блокировкой. Добавлены guard и инвалидация поколений; повтор после правки допускается, а старый ответ не применяется.
- **P1, документация исправлена:** README и INTEGRATIONS ошибочно описывали demo как полностью локальный; на самом деле флаг отключает только транскрипцию, а создание/оценка вызывают Gemini. Старые `docs/UI-QA.md` помечены историческими.
- **P2, остаётся:** неподтверждённые смысловые утверждения, противоречия и неочевидные инструкции могут пройти через модель и эвристики проверки. Дословная цитата не доказывает, что перефразирование верно. Нужна проверка человеком.
- **P2, остаётся:** не подтверждены политика хранения/логи хостинга и условия обработки Gemini. До работы с реальными данными необходима отдельная проверка и согласие пользователя.
- **P2, остаётся:** настоящий paste/clipboard во всех браузерах, разрешения микрофона/мобильной ОС и живой Gemini в данном аудите не проверены. Ранее пользователь сообщала об успешном синтетическом Preview smoke на ветке предыдущего PR; это не новая проверка данного коммита.
- **P3, контракт уточнён:** `/api/review` отсутствует. Документирован фактический `/api/completeness`; существующий `/api/generate` оставлен без изменения.

## Команды и границы

- До изменений: `npm ci --no-audit --no-fund && npm run verify` — PASS, 122 теста, lint, typecheck, hygiene, build.
- После изменений: `npm ci --no-audit --no-fund && npm run verify` — PASS, 149 тестов в 10 файлах, lint, typecheck, hygiene и build. Тесты запускают только моки, не отправляют реальные данные.
- UI-тесты используют jsdom, а не браузерный E2E; локальная production-сборка не является развёртыванием в Production.
- Данный аудит не меняет Production, переменные и секреты, не проверяет реальные ключи/записи и не запускает платные вызовы. Никаких гарантий отсутствия выдумок или полного предотвращения prompt injection не заявляется.

## Preview smoke после ревью (только synthetic, без автоматических повторов)

На защищённом Preview сначала включить в браузерном тестовом инструменте перехват `/api/transcribe`, `/api/draft` и `/api/completeness` с синтетическими ответами; убедиться, что запросы не уходят на сервер. Затем ввести четыре вымышленных ответа; проверить отказ микрофона и сохранение текста; создать документ; отредактировать; дождаться оценки; скопировать и сравнить заголовки/списки; при отказе доступа к буферу проверить сообщение ручного копирования. Без перехвата генерация и оценка вызовут настоящий Gemini даже при demo-флаге: не запускать такой smoke без отдельного согласования. Реальные данные и ключи не передавать в чат. Сам Preview в этой задаче не проверялся живым Gemini.
