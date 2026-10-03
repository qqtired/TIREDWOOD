# TURN deployment, 2026-10-03

Владелец явно разрешил TURN и полный релиз. Установлен и запущен отдельный production `game-opus-turn.service`; игровой unit, drop-ins, процесс и профили этим агентом не менялись. Игровая интеграция `/etc/game-opus/voice.env` передана ведущему для штатного релиза.

## Фактически установлено

- Официальный coturn **4.18.0**, исходный commit `23c6c1d32a3d2b21a56cee65d3203bcc4ea82d2b` проверен после clone.
- Linux build, `make test`, `make install` прошли. Бинарник `/opt/game-opus-turn/4.18.0/bin/turnserver`; SHA-256 `5a7c23553e6c11a1af09faecc8e3608a30f42e0bc3a51ed887849c370c8780bf`.
- Добавлены 40 пакетов сборки/зависимостей двумя apt-транзакциями; **0 upgrades, 0 removals**. Автоматический рестарт существующих служб отключён через `NEEDRESTART_MODE=l`. Исходный снимок списка пакетов имел ошибку форматирования; точные изменения сохранены в apt/dpkg transaction logs, а итоговый список сохранён корректно. Нельзя выдавать повреждённый исходный файл за проверенный backup.
- `game-opus-turn` — отдельный non-login system user. Unit включён на загрузку, active/running; `systemd-analyze verify` прошёл. Финальный процесс на момент свидетельства: ~4.85 MiB memory, 0 рестартов. Это idle-наблюдение, не capacity test.
- Только explicit public IPv4 listeners **3478 UDP/TCP**; relay range **49160–50183 UDP**. Wildcard, TLS/DTLS и CLI listeners не обнаружены. Firewall, DNS и Nginx не изменялись; пустой host firewall не требовал добавления allow-правил.
- Полный согласованный бюджет: `total-quota=960`, `user-quota=20`, `max-bps=16000`, `bps-capacity=15360000`. CPU/memory unit ограничены 100% одного CPU / 256 MiB. Эти лимиты ещё требуют восьмикомнатной нагрузочной проверки.
- Fresh HMAC secret создан непосредственно на VPS. Relay config root:game-opus-turn **0640**, game env root:root **0600**; значения не выводились. В production нет loopback exceptions.

## Проверено на работающем relay

[Санитизированное машинное свидетельство](operational-evidence-20261003.json):

| Проверка | UDP | TCP |
|---|---|---|
| Без credentials | Allocation отклонён | Allocation отклонён |
| Правильный HMAC REST credential | Allocation выдан | Allocation выдан |
| Выданный relay port внутри согласованного диапазона | PASS | PASS |
| Разрешение реального public peer IP relay | PASS | PASS |
| Два allocations на том же public IP, данные в обе стороны | PASS | PASS |
| Loopback/private/link-local/multicast CreatePermission | Все 4 отклонены 403 | Все 4 отклонены 403 |
| IPv4-mapped loopback/private на IPv4 allocation | Отклонены 443, family mismatch | Отклонены 443, family mismatch |
| Refresh lifetime=0 | Allocation освобождён | Allocation освобождён |
| Неправильный credential | Allocation не выдан | Allocation не выдан |
| Истёкший credential | Allocation не выдан | Allocation не выдан |

Проверки разрешений не отправляли данные во внутренние сервисы: проверялись TURN permission responses для контролируемых адресных классов. Отрицательная auth-проверка допускает 401 либо закрытие/тайм-аут invalid session после успешного challenge; положительный allocation проверяется отдельно. CLI-команды не содержали credentials.

В startup выявлены и исправлены: закрытый traverse у нового `/opt/game-opus-turn` (теперь только runtime parent 0755; source/build/backup приватны), устаревший negative STUN compatibility flag (4.18 использует `stun-backward-compatibility=0`). Проверяющий клиент получил UDP retransmissions, чтобы не терять единственный запрос при старте listener. Фактический protocol PASS получен после этих исправлений.

**Первоначальная allocation-only проверка пропустила дефект ACL:** draft-правило `denied-peer-ip=::-::ffff:ffff:ffff` запрещало реальных IPv4 peers, поэтому первые public browser попытки создали allocations, но не передали RTP. В coturn `addr_any()` воспринимает `::` как wildcard endpoint; сравнение разных address families позволяло этому deny захватывать обычный IPv4. Замена на exact `::` тоже является wildcard deny и была отклонена повторным RED. Финальное исправление полностью удаляет endpoint `::`; встроенный zero-address guard и точечный `::1`/приватные IPv4 deny остаются. [Проверенный upstream source](https://github.com/coturn/coturn/blob/23c6c1d32a3d2b21a56cee65d3203bcc4ea82d2b/src/client/ns_turn_ioaddr.c#L510).

Новый регрессионный gate сначала воспроизвёл `public-peer-permission-denied`, затем после исправления доказал bidirectional data через два allocations для UDP и TCP. Прежние отрицательные проверки сохранены; mapped-private запросы отклонены **443 по family mismatch**, что не следует выдавать за отдельный IPv6 ACL test. Raw IP/username/payload не выводились.

## Изолированная QA для ведущего

Transient unit `game-opus-voice-qa-20261003-120723` использует candidate `/opt/game-opus/releases/20261003-120723`, fresh data `/var/lib/game-opus-voice-qa-20261003-120723` и отдельный root-only `/etc/game-opus-turn/voice-qa.env`. Bind **127.0.0.1:5195**, `/health` 200; production data не копировались. QA включает relay-only и пустой STUN; разрешены два localhost-origin с портом 5232. Ведущий управляет SSH tunnel/browser и фиксирует публичный Opus proof.

Имена game env: `VOICE`, `VOICE_TURN_URLS`, `VOICE_RELAY_ONLY`, `VOICE_TURN_SECRET`. QA дополнительно задаёт `VOICE_STUN_URLS`, `NODE_ENV`, `HOST`, `PORT`, `DATA_DIR`, `ALLOWED_ORIGINS`. Ведущий подключает production env через обязательный `EnvironmentFile=` нового игрового unit в своём релизе; отдельного игрового drop-in здесь не создано.

Остановить QA после приёмки: `systemctl stop game-opus-voice-qa-20261003-120723.service`. Не удалять её данные/секреты автоматически без согласованной cleanup-процедуры.

## Восстановление и оставшиеся границы

Приватные build/test/package logs, checker и `rollback-relay.sh` находятся в `/var/backups/game-opus-turn/20261003-120723` (0700). Relay rollback останавливает/отключает **только** `game-opus-turn.service`, сохраняя артефакты для диагностики; игровой env/unit откатывает ведущий согласованно со своим backup. Профили и другие сетевые службы не затрагиваются. Установленные build dependencies не удаляются вслепую.

Ранний staging candidate `20261003-120723` содержит устаревший, неиспользуемый draft relay template и остаётся только QA. Ведущий пересобирает финальный source archive с исправленными infra-файлами. Дополнительная operator-копия хранится в `/opt/game-opus-turn/4.18.0/ops`; активный приватный config — `/etc/game-opus-turn/turnserver.conf`.

Эти проверки выполнялись на VPS и доказывают работу протокола/ACL там. Публичный browser media proof, игровую активацию, release health и сохранность профилей фиксирует ведущий отдельно. Шесть/48 одновременных участников, внешние TLS-only сети и реальные микрофоны этим отчётом не приняты. TLS5349/443 не входит в выполненный baseline.
