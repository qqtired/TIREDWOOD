#!/bin/sh
# Запускается на сервере (root) после загрузки архива релиза: ставит релиз, перезапускает игру
# и проверяет, что в неё можно зайти. Если проверка не прошла — возвращает предыдущий релиз.
# Данные игры (профили, жетоны, банк джекпота) лежат в /var/lib/game-opus и при выкладке не меняются.
# nginx и другие сайты этот скрипт не трогает.
set -eu
RELEASE_ID=$1
case "$RELEASE_ID" in *[!0-9-]*|'') echo 'Неверный номер релиза' >&2; exit 1;; esac

BASE=/opt/game-opus
RELEASE="$BASE/releases/$RELEASE_ID"
ARCHIVE="/tmp/game-opus-$RELEASE_ID.tar.gz"
NODE_VERSION=v24.15.0
NODE_DIR="node-$NODE_VERSION-linux-x64"
KEEP_RELEASES=5

mkdir -p "$BASE/releases"
test ! -e "$RELEASE"
mkdir "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
rm -f "$ARCHIVE"

# Свой Node 24, отдельно от системы. Если на сервере уже есть проверенный архивом тот же Node
# (его ставила Jelly Arena), копируем его; иначе качаем с nodejs.org и сверяем SHA-256.
if [ ! -x "$BASE/runtime/bin/node" ]; then
    if [ -x "/opt/jelly-arena/$NODE_DIR/bin/node" ]; then
        cp -a "/opt/jelly-arena/$NODE_DIR" "$BASE/$NODE_DIR"
    else
        test "$(uname -m)" = x86_64
        TMP=$(mktemp -d)
        curl --fail --silent --show-error --location "https://nodejs.org/dist/$NODE_VERSION/$NODE_DIR.tar.xz" -o "$TMP/$NODE_DIR.tar.xz"
        curl --fail --silent --show-error --location "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
        (cd "$TMP" && awk -v f="$NODE_DIR.tar.xz" '$2 == f' SHASUMS256.txt > node.sha256 && test -s node.sha256 && sha256sum -c node.sha256)
        tar -xJf "$TMP/$NODE_DIR.tar.xz" -C "$BASE"
        rm -rf "$TMP"
    fi
    chown -R root:root "$BASE/$NODE_DIR"
    ln -sfn "$BASE/$NODE_DIR" "$BASE/runtime"
fi
"$BASE/runtime/bin/node" --version
export PATH="$BASE/runtime/bin:$PATH"

cd "$RELEASE"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
chown -R root:root "$RELEASE"
chmod -R a+rX,go-w "$RELEASE"

id game-opus >/dev/null 2>&1 || useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin game-opus

OLD=$(readlink "$BASE/current" || true)
switch_to() {
    ln -sfn "$1" "$BASE/current.new"
    mv -T "$BASE/current.new" "$BASE/current"
}
install -m 644 "$RELEASE/deploy/game-opus.service" /etc/systemd/system/game-opus.service
switch_to "$RELEASE"
systemctl daemon-reload
systemctl enable --quiet game-opus
systemctl restart game-opus

healthy() {
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
        if curl --fail --silent --max-time 2 http://127.0.0.1:5190/health >/dev/null; then
            node deploy/smoke.ts ws://127.0.0.1:5190/ws https://game.tired.solutions "$(cat /var/lib/game-opus/smoke-token 2>/dev/null || true)" && return 0
        fi
        sleep 1
    done
    return 1
}

if ! healthy; then
    echo "Релиз $RELEASE_ID не отвечает. Журнал службы:" >&2
    journalctl -u game-opus -n 30 --no-pager >&2 || true
    if [ -n "$OLD" ] && [ -d "$OLD" ]; then
        echo "Возвращаю предыдущий релиз: $OLD" >&2
        switch_to "$OLD"
        systemctl restart game-opus
    else
        systemctl stop game-opus
    fi
    exit 1
fi

# Старые релизы: храним несколько последних для отката
ls -1dt "$BASE"/releases/*/ | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf
echo "Релиз $RELEASE_ID работает"
