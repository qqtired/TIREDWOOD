# Как в игре подключаются режимы (разбор для «Подземелья», 10.10.2026)

Номера строк — по состоянию `main` d05094b; перед правкой перепроверь grep-ом.

## Подготовка
- В worktree нет node_modules/dist/data: симлинк `node_modules` на `~/Desktop/tired.solutions/game-opus/node_modules`.

## 1. Флаг сервера
- `server/main.ts:35` DEV, `:56-62` чтение флагов (`fortEnabled(process.env.FORTRESS, DEV)` и т. п.): '1' вкл, '0' выкл, нет — DEV.
- Флаг идёт в `new Hub({...})` (main.ts:82-88), логи :92-117. HubOptions `server/hub.ts:104-152`, комнаты в конструкторе :282-363 (null при выкл).
- Декор/коллизии площади тоже за флагом: `server/lobby/room.ts:219, 264-270, 297`.
- `test/kit.ts:46,53-57 setupHub(opts)` — добавить `survivors?: boolean`. Образец теста флага — `test/fortflag.test.ts`.

## 2. Вход с площади
- `Interactable` `shared/maps/lobby.ts:33-46`, `InteractKind` :31. id = индекс массива: **добавлять только в конец** (:503-506).
- Точки возврата :519-563 (`fortSpawn` …).
- E: `server/lobby/room.ts onUse` 813-969 (`case 'fort'` 913) → hub (`enterFort` hub.ts:953).
- Круги с ожиданием: `shared/startzones.ts`, `START_DWELL_TICKS=180`; сервер room.ts:1882-1911; клиент `client/lobby/startcircles.ts`, `client/lobby/scene.ts ~678-704, 840-915`.
- Декор площади: `PlazaDress` в `client/lobby/plaza/index.ts` (`PlazaMode`/`PLAZA_MODES`; venue/north/harbor/east.ts), твёрдые объекты `plazaSolids()` в `shared/plaza2.ts`. Табличка крепости — `setFortLine`.
- Вход: `hub.move()` (hub.ts:620-644) шлёт `{t:'scene', scene, epoch}`, затем `join()` комнаты шлёт приветствие.
- Клиент: `client/app.ts` `onJson 'scene'` 675-687, `switchScene` 895-912, `makeFort` 914-958; готовность `{t:'ready', e}` (`server/readygate.ts`).
- Выход: `{t:'leave'}` (hub.ts:445-481). Образец сцены — `client/fight/scene.ts`, интерфейс `client/scene.ts`.
- Отладка: чат `/go <kind>` (hub.ts:648-669).
- Новый `RoomKind` ломает компиляцию в: `shared/messages.ts:34`, `client/chat.ts:7`, `client/ui/online.ts:13`, `shared/voice.ts:17`, `client/ui/transition-art.ts`, `client/ui/menu/keys.ts`, `client/app.ts`.

## 3. Сообщения
- JSON-юнионы `shared/messages.ts`, бинарный ввод/снимки `shared/protocol.ts` (образец хвоста режима — `shared/fortnet.ts`). `PROTOCOL_VERSION = 15` (`shared/constants.ts:6`).
- Лимиты клиент→сервер: WS 16 KiB, JSON ≤ 2000 символов (`server/voice-wire.ts`), 150 сообщ./с, всплеск 1500; `server/ratelimit.ts`.
- Частые JSON-состояния — в `LINK_VOLATILE` (`shared/link.ts:9`), иначе раздувают буфер переподключения (RESUME_MS 45 с).

## 4. Награды и рекорды
- `Profiles.credit(p, n, 'mode')` `server/profiles.ts:259`. Образцы: `onFortResult` hub.ts:964, `onFortProgress` :983 (оплата при выходе посреди забега).
- `Stats`/`emptyStats()` в `shared/economy.ts` (:98-100, :143); `normalizeProfile` сам зажимает ключи — добавить поля и туда, и туда.
- Топ: `fortTop?` `server/store.ts:85`, `parseState` :195, `parseFortTop` :201, `addFortRun` :219; типы `FortRunRec` `shared/fort.ts:273`, `FORT_TOP=5` :282.
- Клиент: `shared/fortrecord.ts`, `client/fort/record.ts`, `client/fort/lobbygate.ts` (`recordLine`, табличка). Профиль: `client/ui/records.ts` (`RECORDS` :74, `MODE_STATS` :88), `client/ui/profile.ts`.
- Смена ника в топах: `LobbyRoom.onRename` room.ts:621-648.

## 5. Соло-инстансы и пауза
- Сейчас нет ни того, ни другого: все комнаты — одиночки в Hub (`hub.fort` …).
- Hub проверяет комнаты поимённо в `active` (hub.ts:366-368), `step` (:1059-1103), `health/busy` (:1106-1114), `leave`, `outfitChanged` (:776-786), чат, голос. Для инстанса на игрока нужен общий `Set<Room>` в этих местах.
- Голосовые зоны 'instance' ключуются объектом комнаты — у каждого инстанса своя.
- Пауза: `client/app.ts setPaused` (:1105), `refreshPause` (:1121-1134) — только меню, сервер продолжает. Нужен свой `pause/resume` и лимит паузы, иначе AFK держит комнату вечно.

## 6. Ассеты
- В основном процедурная геометрия (`client/render/kit.ts`). Единственный GLB — `client/assets/boats/kenney-speed-a.glb`, грузится `GLTFLoader.loadAsync(new URL(..., import.meta.url).href)` (`client/lobby/regattaboat.ts`).
- MIME `.glb` в `server/main.ts:172-184` нет (octet-stream, работает).
- CSP: `default-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self' wss://…` — без blob: и внешних хостов, GLB самодостаточные, текстуры из canvas — data: URL.

## 7. Камера и ввод
- Вид сверху: образец `client/lobby/ratracecam.ts` (наклон 68°, FOV 30), тест знаков `test/newmode-camera.test.ts`.
- `client/input.ts`: WASD, Space, Shift, E, R, ЛКМ/ПКМ; Esc — меню; Q — блок, M, V, Tab заняты. Ввод — BTN_* (`shared/sim.ts`), 19 байт. Тач — `client/touch.ts`.

## 8. Производительность (`docs/optimization.md`)
- ≤ 300 отрисовок, ≤ 80 шейдеров, ≤ 1 млн треугольников, CPU ≤ 3 мс/кадр, ≤ 2 настоящих лампы, гасить яркостью.
- Замер `?debug` → `__opus.info()` до/после. В крепости лимит живых `FORT_MAX_ALIVE=60`.

## 9. Тесты и запуск
- `npm run check && npm test && npm run build`; хелперы `test/kit.ts`.
- Образцы: `test/fortflag.test.ts`, `test/startzones.test.ts`, `test/new-mode-hub.test.ts`, `test/fort-records.test.ts`, `test/maps.test.ts:44-53`.
- Dev: `DATA_DIR=$(mktemp -d) PORT=3102 node server/main.ts --dev` (HTTP — Vite).
- Браузер: только CDP без puppeteer — `tools/release/csp-proxy.mjs`, `tools/release/csp-check.mjs` (`EXPECT_*`), рецепт Chrome в `docs/release-prep/2026-10-02/RELEASE-CHECKLIST.md`; хуки `__opus`.

## 10. Документы
- `docs/README.md` — строка в таблице режимов (раздел 2.4) тем же коммитом. `README.md` — списки режимов и флагов рядом с FIGHT/HIDE/FORTRESS.
