#!/bin/sh
# Кладёт токен Telegram-бота для экрана с чатом друзей на сервер игры: /var/lib/game-opus/tg-token.
# Запускается на этом Маке: ./deploy/set-tg-token.sh — токен вводится скрыто (можно и так: pbpaste | ./deploy/set-tg-token.sh)
# и уходит на сервер через stdin ssh: не в командной строке, не в истории, не в журналах.
# Игра подхватит токен сама в течение 30 секунд — перезапуск не нужен.
# Выключить экран (на нём будет заставка): ../ssh/connect.sh 'rm -f /var/lib/game-opus/tg-token'
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CONNECT="$ROOT/../ssh/connect.sh"

if [ ! -x "$CONNECT" ]; then
    echo "Не нашёл $CONNECT — им скрипт ходит на сервер." >&2
    exit 1
fi

# эхо терминала вернётся в любом случае: и после ввода, и по Ctrl+C
ECHO_OFF=0
restore() {
    if [ "$ECHO_OFF" = 1 ]; then
        stty echo 2>/dev/null || true
        ECHO_OFF=0
    fi
}
trap 'restore' EXIT
trap 'restore; echo >&2; exit 130' INT TERM HUP

printf 'Токен бота от @BotFather (при вводе не виден): ' >&2
if [ -t 0 ]; then
    stty -echo
    ECHO_OFF=1
fi
TOKEN=''
IFS= read -r TOKEN || true
restore
echo >&2

# пробелы и переводы строк по краям — от копирования, не часть токена (printf — встроенная команда, токен идёт по трубе)
TOKEN=$(printf '%s' "$TOKEN" | tr -d ' \t\r\n')
case "$TOKEN" in
    '')
        echo 'Пусто — токен не введён.' >&2
        exit 1 ;;
    *[!0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:_-]*)
        echo 'Это не похоже на токен бота: в нём бывают только цифры, латинские буквы, «:», «_» и «-».' >&2
        exit 1 ;;
    *:*) ;;
    *)
        echo 'В токене нет двоеточия — скопируй его из @BotFather целиком (вида 123456789:AA…).' >&2
        exit 1 ;;
esac

# На сервере: временный файл рядом (umask 077 — сразу только для владельца), владелец — пользователь игры, права 0600,
# и переименование поверх старого: игра никогда не прочитает недописанный токен.
REMOTE='umask 077 && D=/var/lib/game-opus && test -d "$D" && T=$(mktemp "$D/.tg-token.XXXXXX") && { cat > "$T" && test -s "$T" && chown game-opus:game-opus "$T" && chmod 600 "$T" && mv -f "$T" "$D/tg-token" || { rm -f "$T"; exit 1; }; }'
printf '%s\n' "$TOKEN" | "$CONNECT" "$REMOTE"
TOKEN=''

echo 'Готово: токен на сервере. Экран с чатом на крыше склада оживёт в течение 30 секунд — перезапуск не нужен.'
echo 'Если сообщения не появляются: в @BotFather — /setprivacy → Disable (иначе бот не видит переписку), потом убери бота из группы и добавь снова.'
