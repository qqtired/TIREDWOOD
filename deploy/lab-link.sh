#!/bin/sh
# Печатает ссылку владельца Лаборатории: https://game.tired.solutions/lab/#key=...
# Открой её один раз в своём браузере (можно на телефоне): он запомнит ключ и уберёт его из адресной строки.
# Никому не пересылай: по этой ссылке можно менять решения. Ключ идёт с сервера только в этот терминал.
# Ключ создаёт сама игра при первом запуске с LAB=1: файл /var/lib/game-opus/lab-key (права 0600).
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CONNECT="$ROOT/../ssh/connect.sh"

if [ ! -x "$CONNECT" ]; then
    echo "Не нашёл $CONNECT — им скрипт ходит на сервер." >&2
    exit 1
fi

KEY=$("$CONNECT" 'cat /var/lib/game-opus/lab-key' 2>/dev/null | tr -d ' \t\r\n') || KEY=''
case "$KEY" in
    '')
        echo "Ключа нет: игра на сервере ещё не запускалась с LAB=1 (нет файла /var/lib/game-opus/lab-key)." >&2
        exit 1
        ;;
    *[!A-Za-z0-9_-]*)
        echo "В файле ключа лишние знаки, ссылку не печатаю." >&2
        exit 1
        ;;
esac
echo "https://game.tired.solutions/lab/#key=$KEY"
