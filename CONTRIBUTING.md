# Как работать с репозиторием «Искра»

## 1. Подготовка

```bash
git clone https://github.com/anastasiyarudomyotova/iskra.git
cd iskra
npm ci
cp .env.example .env.local
git config core.hooksPath .githooks   # включить локальный хук проверки секретов
```

## 2. Ветки

`main` защищена и не принимает прямые пуши. Каждая задача — своя ветка от `main`:

| Префикс    | Когда использовать          | Пример                  |
| ---------- | --------------------------- | ----------------------- |
| `feature/` | новая функциональность      | `feature/gemini-routes` |
| `fix/`     | исправление                 | `fix/form-validation`   |
| `chore/`   | инфраструктура, зависимости | `chore/update-next`     |
| `docs/`    | документация                | `docs/privacy-text`     |

```bash
git switch main && git pull
git switch -c feature/shadcn-shell
```

## 3. Перед пушем

```bash
npm run format        # при необходимости
npm run verify        # гигиена + lint + typecheck + build
```

`npm run verify` повторяет CI локально. Если он зелёный, PR почти наверняка пройдёт.

## 4. Pull request

- Заголовок в императиве и по делу: `feat: каркас экрана создания вакансии`.
- В описании: задача, что сделано, что проверено, скриншот для UI-изменений.
- Обязательные проверки: **Repo hygiene** и **Lint, typecheck & build**.
- Ревью PM, затем squash merge и удаление ветки.

## 5. Правила, которые не обсуждаются

- Никаких прямых пушей в `main`, никаких force-push в `main`.
- Никаких реальных ключей, `.env*` (кроме `.env.example`), записей голоса и
  персональных данных в Git — ни в коде, ни в issue, ни в описании PR.
- Ключ Gemini — только серверная переменная окружения, без `NEXT_PUBLIC_`.
- Секреты не пересылаются в чат. Если ключ попал в репозиторий — остановиться,
  сообщить PM и отозвать ключ в Google AI Studio.
