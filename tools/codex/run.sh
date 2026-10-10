#!/usr/bin/env bash
# Codex (модель gpt-6-astra, усилие max) — исполнитель бэкенда для ведущего Claude. Правила — AGENTS.md §4.
# Запуск: tools/codex/run.sh <worktree> <задание.md>
# Ведущий запускает в фоне и ждёт конца. Отчёт — <задание>.report.md, журнал — <задание>.log рядом с заданием.
# Модель и усилие зашиты: другие для Codex не используем.
set -euo pipefail
[ $# -eq 2 ] || { echo "запуск: $0 <worktree> <задание.md>" >&2; exit 2; }
WT=$(cd "$1" && pwd)
TASK=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
[ -f "$TASK" ] || { echo "нет задания: $TASK" >&2; exit 2; }
BRANCH=$(git -C "$WT" branch --show-current)
[ -n "$BRANCH" ] && [ "$BRANCH" != main ] || { echo "Codex работает только в своём worktree и ветке, не в main" >&2; exit 2; }
GIT_DIR=$(cd "$WT" && cd "$(git rev-parse --git-common-dir)" && pwd)
BASE=${TASK%.md}
HERE=$(cd "$(dirname "$0")" && pwd)
{ cat "$HERE/preamble.md"; printf '\n## Задание\n\nВетка: %s\n\n' "$BRANCH"; cat "$TASK"; } |
  codex exec -m gpt-6-astra -c 'model_reasoning_effort="max"' \
    -C "$WT" -s workspace-write --add-dir "$GIT_DIR" -c 'sandbox_workspace_write.network_access=true' \
    --color never -o "$BASE.report.md" - >"$BASE.log" 2>&1
echo "отчёт: $BASE.report.md"
