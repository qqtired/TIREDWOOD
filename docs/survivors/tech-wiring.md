# Как «Подземелье» подключено к игре

**Статус: режим на сайте с 10.10.2026** (релиз `20261010-204608`, протокол 16, флаг `DUNGEON=1` в `deploy/game-opus.service`).
Первая часть — что подключено и где (по состоянию `main` после релиза, 3f765e5). Вторая — разбор общих мест подключения,
сделанный до кода: он остаётся рецептом для следующего режима, номера строк в нём устарели — перепроверяй grep-ом.

## Что подключено

**Устройство.** Одна детерминированная симуляция на 30 Гц в `shared/dungeon/` (волны, мобы, оружие, постройки, босс,
прогресс; без `Math.random`/`sin`/`Date`, только `makeRng` и `sinCos`). Клиент играет её у себя (без задержки, с паузой) и шлёт
серверу журнал ввода (`dg_log`: события с номером шага и сумма состояния `dgHash`). Сервер повторяет забег по журналу
своей копией (`server/dungeon/room.ts`, `simport.ts`) и сам решает волны, жетоны и рекорды; расхождение копий пишется в
журнал сервера. Договор — `shared/dungeon/api.ts` (`DgEvent`, `DgClientMsg`, `DgServerMsg`, `DgResult`). Числа — из
`docs/survivors/design-data.json` и `level-data.json`: `tools/survivors/gen-data.mjs` пересобирает `shared/dungeon/gen-design.ts`
и `gen-level.ts`; клиентская копия данных — `client/assets/dungeon/level-data.json`.

**Сервер** (`server/dungeon/`):
- `room.ts` — `DungeonRoom` (комната на одного игрока) и флаг `dungeonEnabled(env, dev)`: `1` — вкл, `0` — выкл, без переменной
  только с `--dev`; догон симуляции до 4 шагов за тик хаба с запасом 3 с настенных часов;
- `hall.ts` — `DungeonHall`: набор инстансов, жетоны (`dg_wave` за каждую отбитую волну, `dg_end` с итогом, потолок 600),
  статистика профиля, табличка у входа;
- `records.ts` — таблицы «за всё время» (`State.dgTop`) и «за неделю» (`State.dgWeek`, с понедельника 00:00 МСК, сбрасывается
  сама), у профиля одна лучшая строка, смена ника переписывает строки;
- в `server/hub.ts`: `hub.dungeon` (null при выключенном флаге), шаг, занятость (`health.dungeon`), справка по клавишам в чате,
  смена ника, остановка; `server/main.ts`: чтение флага и опция в `new Hub({…})`.

**Протокол.** `RoomKind` 'dungeon' (`shared/messages.ts`), статус `dgSt` и поле `dg` в приветствии набережной (таблица
рекордов для доски; нет поля — режим выключен). `PROTOCOL_VERSION` поднят до 16 вместе с фермой и рыбалкой.
Профиль: счётчики `dgRuns, dgBest, dgBestMs, dgKills, dgBosses, dgWeek, dgWeekBest, dgWeekBestMs` в `Stats`
(`shared/economy.ts`), нули для старых сохранений.

**Пауза и обрыв.** Esc и свёрнутая вкладка — `dg_pause` (сервер паузу занятостью не считает; 10 минут паузы или тишины —
итог `timeout`). Обрыв связи: забег ждёт возврата `DG_LOST_MS` = 60 с (`server/hub.ts`, `client/app.ts` `limitMs`), потом засчитаны
отбитые волны. Вышел сам — засчитаны отбитые, текущая не в счёт.

**Вход.** `InteractKind` 'dungeon' в `shared/maps/lobby.ts` (`DUNGEON_USE`, `DUNGEON_RETURN`), твёрдая скала и доска в
`shared/plaza2.ts`, декор — `client/lobby/plaza/dungeon.ts` (скала, вывеска, факелы, доска; модель `plaza_entrance.glb` грузится
при первом показе, пока сервер не прислал статус — набережная как раньше), статус доски — `client/lobby/dgstatus.ts`, вход по E —
`server/lobby/room.ts` → `hub`. Профиль и «Рекорды» — `client/ui/records.ts`.

**Клиент** (`client/dungeon/`): модуль грузится лениво (`LazyScene` в `client/app.ts`), сцена — `scene.ts` (`DungeonScene`) и `game.ts`,
вид симуляции — `simview.ts`, мир и пол — `world.ts`, `worldgeo.ts`, `worldlink.ts`, враги/босс/герой — `mobs.ts`, `boss.ts`, `hero.ts`,
эффекты — `fx.ts`, постройки и зоны активации — `buildings.ts`, `zones.ts`, звук — `sfx.ts`, `prefs.ts` (переключатели звука, localStorage),
интерфейс «Кованый фонарь» — `hud.ts`, `hudtypes.ts`, `dungeon.css`, значки — `icons.ts`. Шрифты Alegreya — `@fontsource/alegreya-sc` и
`@fontsource/alegreya-sans` (devDependencies; в папке без них перед сборкой нужен `npm install`). Ввод через общий `Input`: WASD, Пробел,
Q, E, R/F, Alt, 1/2/3, Esc; на телефоне — кнопки рывка и Q в самом HUD (`hud.ts`).

**Ассеты** (`client/assets/dungeon/`): GLB героя, врагов, босса и наборов окружения (Blender), 63 значка webp (Codex image_gen,
`icons/PROVENANCE.md`), пол по зонам — 5 текстур jpg и карты рельефа `*_n.jpg` (`tools/survivors/floor/make-normals.mjs`),
вход на площади — `plaza/plaza_entrance.glb`. Только процедурная геометрия и GLB, CSP без blob: и внешних хостов.

**Стенд и инструменты.** `/tools/survivors/stand/` на сервере разработки (`client/dungeon/stand.ts`, в сборку не входит): сцена режима
без набережной, «сервер» в той же вкладке, `window.dgStand` для headless Chrome. `node tools/survivors/balance.mjs` — модель баланса,
`bot.mjs` — бот-прогон, `page/sync.mjs` — копии данных и моделей для страницы дизайна.

**Тесты:** `test/dungeon-sim.test.ts` (симуляция), `dungeon-server-sim.test.ts` (комната, журнал, рекорды), `dungeon-flag.test.ts`,
`dungeon-plaza.test.ts`, `dungeon-twins-view.test.ts`.

**Что не сделано в подключении:** телефон не проверялся; кооп и несколько героев в данных не заложены в игру; зазывала «Шахтёр
Шура» и указатель на площади — нет.

---

# Разбор общих мест подключения (10.10.2026, до кода)

Номера строк — по состоянию `main` d05094b; перед правкой перепроверь grep-ом. Раздел 5 («Соло-инстансы и пауза»)
в `Подземелье` решён так: у каждого игрока своя `DungeonRoom` в `DungeonHall`, хаб проверяет зал через `hub.dungeon`.

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
