#!/bin/sh
# Выкладка Game Opus на https://game.tired.solutions:
# проверки и тесты → сборка → загрузка архива → установка релиза на сервере (deploy/install.sh).
# nginx не меняется: его блок для игры лежит в deploy/game.nginx.conf и ставится вручную (см. README).
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CONNECT="$ROOT/../ssh/connect.sh"
cd "$ROOT"

# Текст для игроков готовится явно к этому выпуску; без него ничего не собираем и не загружаем.
if [ -z "${RELEASE_NOTES_FILE:-}" ]; then
    echo 'Нужен файл с изменениями для игроков: RELEASE_NOTES_FILE=/путь/notes.txt ./deploy.sh' >&2
    exit 1
fi
RELEASE_ID=$(date -u '+%Y%m%d-%H%M%S')
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
node deploy/announce-release.ts prepare "$RELEASE_ID" "$RELEASE_NOTES_FILE" "$TMP/release-notes.json"

npm run check
npm test
npm run build
node deploy/compress.ts

# Выкладка перезапускает игровой сервер. С набережной клиент переподключится сам и ничего не потеряет,
# а игровые раунды оборвутся — не выкидываем тех, кто сейчас в режиме (busy; у старого сервера — humans).
if [ "${FORCE:-0}" != 1 ]; then
    BUSY=$(node --input-type=module -e '
        try {
            const r = await fetch("https://game.tired.solutions/health", { signal: AbortSignal.timeout(5000) });
            if (!r.ok) throw new Error("health HTTP failure");
            const h = await r.json();
            if (!h || typeof h !== "object" || Array.isArray(h) || h.ok !== true) throw new Error("unhealthy response");
            const n = Object.hasOwn(h, "busy") ? h.busy : h.humans;
            if (!Number.isSafeInteger(n) || n < 0) throw new Error("invalid busy counter");
            console.log(n);
        } catch {
            console.error("Не удалось достоверно проверить /health. Выкладка остановлена; проверь доступность сервера.");
            process.exit(1);
        }
    ')
    if [ "$BUSY" -gt 0 ]; then
        echo "Сейчас в игровых режимах: $BUSY. Выкладка перезапустит сервер и оборвёт их игру." >&2
        echo "Подожди, пока доиграют, или запусти так: FORCE=1 ./deploy.sh" >&2
        exit 1
    fi
fi

BUNDLE="$TMP/game-opus-$RELEASE_ID.tar.gz"
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$BUNDLE" package.json package-lock.json server shared dist deploy -C "$TMP" release-notes.json
"$CONNECT" "cat > /tmp/game-opus-$RELEASE_ID.tar.gz" < "$BUNDLE"
"$CONNECT" "sh /dev/stdin $RELEASE_ID" < "$ROOT/deploy/install.sh"
echo "Готово: https://game.tired.solutions (релиз $RELEASE_ID)"
