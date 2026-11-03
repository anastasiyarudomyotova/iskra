#!/usr/bin/env bash
#
# Защита ветки main в репозитории «Искра».
#
# Запуск требует прав администратора репозитория (scope admin:repo для
# classic PAT или роль Admin у GitHub App). Обычный токен агента такие
# запросы не пропускает — команду выполняет владелец репозитория.
#
# Использование:
#   ./scripts/setup-github-protection.sh                 # репозиторий по origin
#   ./scripts/setup-github-protection.sh owner/repo      # явно
#
# Скрипт идемпотентен: повторный запуск обновляет те же настройки.

set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

echo "→ Репозиторий: ${REPO}"

echo "→ 1/2 Настройки merge: только squash, ветка удаляется после merge"
gh api -X PATCH "repos/${REPO}" \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true \
  -F allow_update_branch=true \
  >/dev/null

echo "→ 2/2 Защита main: PR + зелёные проверки, без force-push и удаления"
gh api -X PUT "repos/${REPO}/branches/main/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Repo hygiene", "Lint, typecheck & build"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo "✓ Готово. Проверка:"
gh api "repos/${REPO}/branches/main/protection" \
  --jq '{required_checks: .required_status_checks.contexts, strict: .required_status_checks.strict, pr_required: (.required_pull_request_reviews != null), admins_enforced: .enforce_admins.enabled, force_push: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled}'
echo
echo "Когда в проекте появится второй ревьюер: поднимите"
echo "required_approving_review_count до 1 в этом скрипте (или в настройках GitHub)."
