# Выпуск 1: набережная, скины, пейнтбол от третьего лица, автоматы — план

> **Для исполнителя:** план выполняется в этой же сессии, по порядку, без субагентов (так договорились с владельцем). Шаги отмечаются `- [x]`.
>
> В плане не повторяется код, который пишется сразу в файлы. Для логики и тестов даны точные интерфейсы, формулы, числа и проверки. Для визуального кода — что построить и как проверить глазами.
>
> Проекта нет в git: вместо коммитов — контрольные точки `npm run check && npm test`. Перед началом — архив-копия.

**Цель:** выпуск 1 из `docs/superpowers/specs/2026-10-01-lobby-platform-design.md`:
- общая вечерняя набережная с профилями и жетонами;
- наряды желеек;
- 5 игровых автоматов, которые видят все;
- пейнтбол от третьего лица в наряде игрока.

**Подход:**
- Нынешний сервер Game Opus становится хабом с комнатами «набережная» и «пейнтбол» поверх одного WebSocket.
- Физику, предсказание, интерполяцию и снимки переиспользуем.
- Профили и банк джекпота хранятся в JSON-файле с атомарной записью.
- Клиент — оболочка со сценами на общем рендерере.

**Стек:** Node 24 (TypeScript без сборки, только стираемый синтаксис), three.js 0.186, ws 8, Vite 8, `node --test`.

## Общие ограничения

- Всё общение, тексты интерфейса, комментарии в коде — на русском. Имена в коде — английские, как сейчас.
- Стиль сцены — «приземлённый», тёплый свет. Без неона, космоса и светящихся порталов.
- `PROTOCOL_VERSION = 2`.
- Тик 60 Гц. На набережной снимки 30 Гц, `ClockSync.minDelay = 2.6` тика.
- Жетоны:
  - старт 100, ежедневный бонус +50 (день по Москве, UTC+3);
  - пейнтбол: раунд 10, сбитый +2 (до 30), победа 15, лучший игрок 10; нужно ≥ 3600 тиков в фазе боя;
  - цены вещей 60 / 150 / 400.
- Автоматы:
  - веса 🍒8 🍋7 🔔6 ⚓5 ⭐3 7️⃣3 (из 32), ставки 1 / 5 / 10 / 25 / 50;
  - выплаты ×2 (две вишни), ×6, ×10, ×15, ×20, ×50, ×4 (две семёрки), джекпот ×100 + банк × ставка / 50;
  - банк: 5 % ставок, не меньше 1000;
  - вращение 2400 мс, остановки барабанов 1200 / 1700 / 2200 мс, повторно крутить через 2600 мс.
- Камера пейнтбола:
  - опора 1,45 м;
  - обычная: назад 2,9, вбок 0,6, вверх 0,25; прицел: 1,4 / 0,5 / 0,15;
  - запас до стены 0,2 м, минимум 0,35 м от опоры;
  - запасное направление выстрела при `(P − глаза)·f < 0,5`;
  - `BTN_SHOULDER = 1024`.
- Камера набережной: назад 3,6 (колесо мыши 2–6), вбок 0, вверх 0,6.
- Секреты не пишем в код и журнал. Ключ устройства хранится только как SHA-256. Токен проверки — в файле с правами 0600.
- Не трогаем без «да» владельца:
  - `chatgame/`;
  - файлы Jelly Arena на сервере;
  - блок `/ctxai/` в nginx;
  - защиту сервера;
  - выкладку.

---

## Структура файлов

```
shared/
  constants.ts        изм.: PROTOCOL_VERSION 2, константы набережной
  protocol.ts         изм.: epoch в пакете ввода; JSON-типы уезжают в messages.ts
  messages.ts         нов.: все JSON-сообщения (ClientMsg, ServerMsg, RosterEntry…)
  sim.ts              изм.: BTN_SHOULDER, aimYaw/aimPitch/spread в StepEvents, applySpread()
  aim.ts              нов.: cameraRig, aimPoint, tpsShotDir
  outfit.ts           нов.: палитра, каталог, Outfit, sanitizeOutfit, randomOutfit
  economy.ts          нов.: жетоны, награды, mskDay
  slots.ts            нов.: символы, веса, ставки, evaluate, jackpotPayout
  maps/types.ts       нов.: GameMap, MapBox… (из map.ts)
  maps/builder.ts     нов.: Builder с флагом зеркалирования (из map.ts)
  maps/pier.ts        нов.: buildPier (из map.ts; map.ts удаляется)
  maps/lobby.ts       нов.: buildLobby → LobbyMap
server/
  main.ts             изм.: HTTP/WS → Hub, /health, build, smoke-token, завершение
  hub.ts              нов.: Client, Hub
  inputs.ts           нов.: InputQueue (общий для комнат)
  ratelimit.ts        нов.: RateLimiter
  store.ts            нов.: Store (JSON, атомарная запись, копии)
  profiles.ts         нов.: Profiles (вход, ники, коды, жетоны, покупки, наряды, доска почёта)
  lobby/room.ts       нов.: LobbyRoom
  lobby/slots.ts      нов.: SlotHall
  paintball/room.ts   нов.: PaintballRoom (обёртка над Game для Hub)
  paintball/game.ts   перенос + изм.: наряды, награды, AFK, выстрел от третьего лица, InputQueue
  paintball/bot.ts, nav.ts, lagcomp.ts   перенос
client/
  main.ts             изм.: контейнеры #ui
  app.ts              переписать: оболочка
  net.ts              изм.: Net (одно соединение, коды закрытия), ClockSync.minDelay
  input.ts            изм.: колесо мыши, клавиши 1–4/Q/Tab в onKey
  identity.ts         нов.: ключ устройства, сохранённый ник
  audio.ts            изм.: звуки монет, сирена, салют
  chat.ts             изм.: метки комнат, свои по pid
  ui/tokens.ts        нов.: счётчик жетонов (отложенные изменения)
  ui/toasts.ts        нов.: уведомления
  ui/online.ts        нов.: список «кто где» (Tab)
  ui/profile.ts       нов.: профиль в паузе (ник, код, статистика)
  ui/wardrobe.ts      нов.: примерочная
  render/renderer.ts  нов.: общий WebGLRenderer, качество, размер
  render/sky.ts       нов.: шейдеры неба и моря с палитрой (из world.ts)
  render/world.ts     изм.: принимает рендерер, палитру; мир «Причал»
  render/avatar.ts    изм.: наряды, пояс команды, руки, эмоции, облачко
  render/outfit3d.ts  нов.: геометрия шапок, аксессуаров, век и очков
  render/viewmodel.ts удалить
  lobby/world.ts      нов.: 3D набережной
  lobby/scene.ts      нов.: LobbyScene
  lobby/slots3d.ts    нов.: модели автоматов, барабаны, лампочки, рычаг
  lobby/fx.ts         нов.: монеты, всплывающие числа, салют
  lobby/boards.ts     нов.: экран склада, доска почёта, табло джекпота (холсты)
  paintball/scene.ts  из session.ts: PaintballScene от третьего лица
  paintball/hud.ts    перенос hud.ts + блокировка прицела + награды
  paintball/slot.ts   перенос slot.ts
test/
  maps.test.ts, outfit.test.ts, economy.test.ts, slots.test.ts, store.test.ts,
  profiles.test.ts, aim.test.ts, paintball.test.ts, hub.test.ts, lobby.test.ts   нов.
  sim.test.ts, bots.test.ts   изм.: пути и epoch
deploy/
  game-opus.service   изм.: StateDirectory, DATA_DIR
  install.sh          изм.: токен проверки
  smoke.ts            изм.: новый вход
  game.nginx.conf     изм.: X-Real-IP (на сервер — отдельно, с разрешения)
deploy.sh             изм.: busy
README.md, docs/design.md, ../server/README.md   изм.
```

---

### Задача 0. Копия и перестановка файлов

**Файлы:** `shared/map.ts` → `shared/maps/{types,builder,pier}.ts`; `server/{game,bot,nav,lagcomp}.ts` → `server/paintball/`; JSON-типы из `shared/protocol.ts` → `shared/messages.ts`; `test/maps.test.ts`.

- [x] Архив: `mkdir -p ../backups && tar -czf ../backups/game-opus-2026-10-01-before-lobby.tar.gz --exclude node_modules --exclude dist .`
- [x] До переноса снять отпечаток карты: `node -e` с импортом `buildPier` → sha256 от `JSON.stringify(buildPier())`. Записать значение в `test/maps.test.ts` как ожидаемое.
- [x] Вынести из `map.ts`:
  - типы → `maps/types.ts`;
  - класс `Builder` → `maps/builder.ts`;
  - `buildPier` → `maps/pier.ts`.

  Builder получает `constructor(mirror = true)`. Если `mirror = false`:
  - `sym()` ставит один бокс;
  - `trampoline`, `bollard`, `lamp`, `barrel` и `spawn` не делают пару.

  Для «Причала» порядок и результат не меняются.
- [x] Перенести серверные файлы пейнтбола в `server/paintball/` и поправить импорты.
- [x] Вынести из `protocol.ts` в `messages.ts`: `RosterEntry`, `SLOT_*`, `SlotBonus`, `ClientMsg`, `GameEvent`, `ServerMsg`. Обновить все импорты: game, main, session, smoke, тесты.
- [x] `test/maps.test.ts`: отпечаток `buildPier()` совпадает с записанным.
- [x] Контроль: `npm run check && npm test` — всё зелёное, тест ботов проходит.

### Задача 1. Протокол v2, флаг плеча, данные выстрела

**Файлы:** `shared/constants.ts`, `shared/protocol.ts`, `shared/sim.ts`, `test/sim.test.ts`, `client/session.ts` (временная подстройка вызова).

**Интерфейсы:**
- `encodeInputs(inputs, from, count, epoch): Uint8Array` — заголовок `[1, epoch, count]`, дальше записи по 19 байт.
- `inputEpoch(data: Uint8Array): number` — байт 1, или −1, если пакет короче.
- `decodeInputs(data, out): number` — записи начинаются со смещения 3.
- `BTN_SHOULDER = 1024`.
- `StepEvents` получает `aimYaw`, `aimPitch`, `spread`. При выстреле:
  - `aimYaw = inp.yaw + s.recoilY`;
  - `aimPitch = inp.pitch + s.recoilP`;
  - `spread` — посчитанный разброс;
  - всё до толчка отдачи.
- `applySpread(fx, fy, fz, spread, seed, shot, out)`:
  - `r = норм(−fz, 0, fx)`; если `|f.xz| < 1e-6`, то `r = (1, 0, 0)`;
  - `u = r × f`;
  - смещение по той же формуле, что в `shotDirection`: `u1`, `u2` из `hashFloat(seed, shot)` и `hashFloat(seed ^ 0x7f4a7c15, shot)`.

**Шаги:**
- [x] Тест: пакет из 2 входов имеет длину `3 + 2*19`; `inputEpoch` возвращает переданный `epoch`; разбор совпадает с исходными входами.
- [x] Тест: `applySpread` с `spread = 0` возвращает нормированное `f`. Со `spread = 0.02` угол к `f` не больше 0,02 рад. Результат детерминирован.
- [x] Реализовать и подстроить вызовы (`session.ts` передаёт `epoch = 0`, пока нет оболочки).
- [x] Контроль.

### Задача 2. Каталог нарядов

**Файлы:** `shared/outfit.ts`, `test/outfit.test.ts`.

**Интерфейсы:**

```ts
export const PALETTE: readonly number[]      // 16 цветов
export const PALETTE_NAMES: readonly string[] // клубничный … молочный
export type Slot = 'p' | 'e' | 'h' | 'a';
export type Tier = 'free' | 'common' | 'rare' | 'epic' | 'jackpot' | 'system';
export interface Item { id: string; slot: Slot; key: string; name: string; tier: Tier }
export interface Outfit { c: number; c2: number; p: string; e: string; h: string; a: string }
export const ITEMS: readonly Item[];
export const DEFAULT_OUTFIT: Outfit;          // {c: 9, c2: 15, p: 'none', e: 'normal', h: 'cap', a: 'none'}
export const JACKPOT_ITEMS: readonly string[]; // ['h:crown', 'p:gold']
export const PATTERN_INDEX: Record<string, number>; // none 0, stripes 1, dots 2, spots 3, sunset 4, camo 5, sugar 6, gold 7
export function itemById(id: string): Item | undefined;
export function itemOf(slot: Slot, key: string): Item | undefined;
export function isOwned(owned: readonly string[], item: Item): boolean; // free → true, system → false
export function sanitizeOutfit(raw: unknown, owned: readonly string[]): Outfit;
export function randomOutfit(seed: number): Outfit; // только бесплатные вещи, цвета любые
export function withItem(o: Outfit, item: Item): Outfit;
```

Каталог (ключ — название — уровень):
- **`p`:** none «Без узора» free, stripes «Тельняшка» common, dots «Горошек» common, spots «Пятна» common, sunset «Закат» rare, camo «Камуфляж» rare, sugar «Сахарная обсыпка» epic, gold «Золото» jackpot.
- **`e`:** normal «Обычные», sleepy «Сонные», angry «Сердитые», happy «Довольные» — free; glasses «Очки» common; shades «Тёмные очки» rare; patch «Пиратская повязка» rare; monocle «Монокль» epic.
- **`h`:** none «Без шапки» free, cap «Кепка» free, panama «Панама», ushanka «Ушанка», fisher «Рыбацкая шляпа», bandana «Бандана» — common; helmet «Каска», sailor «Бескозырка» — rare; tophat «Цилиндр» epic; crown «Корона» jackpot; fool «Колпак дурака» system.
- **`a`:** none «Без аксессуара» free, scarf «Шарф» free, mustache «Усы» common, bowtie «Бабочка» common, headphones «Наушники» rare, lifebuoy «Спасательный круг» rare, chain «Золотая цепь» epic, epaulets «Погоны» system.

**Шаги:**
- [x] Тесты:
  - `id` уникальны и равны `slot + ':' + key`;
  - в каждом слоте есть ключ по умолчанию (`none` / `normal`), и он бесплатный;
  - `sanitizeOutfit`:
    - `{c: 99, p: 'gold', h: 'tophat', e: 'zzz'}` при пустом `owned` даёт `c ∈ [0, 15]`, `p: 'none'`, `h: 'none'`, `e: 'normal'`;
    - при `owned = ['h:tophat']` цилиндр остаётся;
    - системные вещи отбрасываются всегда;
  - `randomOutfit(seed)` детерминирован, а вещи в нём бесплатные.
- [x] Реализовать, прогнать.

### Задача 3. Экономика и математика автоматов

**Файлы:** `shared/economy.ts`, `shared/slots.ts`, `test/economy.test.ts`, `test/slots.test.ts`.

**Интерфейсы (economy):**
- Константы:
  - `START_TOKENS = 100`, `DAILY_BONUS = 50`;
  - `PB_ROUND = 10`, `PB_KILL = 2`, `PB_KILL_CAP = 30`, `PB_WIN = 15`, `PB_MVP = 10`;
  - `PB_MIN_PLAY_TICKS = 3600`, `PB_AFK_TICKS = 5400`;
  - `TIER_PRICE = {common: 60, rare: 150, epic: 400}`.
- `mskDay(ms: number): string` — `new Date(ms + 3*3600_000).toISOString().slice(0, 10)`.
- `itemPrice(tier): number | null` — `null` для free, jackpot и system.
- `paintballReward({playTicks, kills, won, mvp}): {total, round, kills, win, mvp} | null` — `null`, если `playTicks < PB_MIN_PLAY_TICKS`; `kills = min(PB_KILL_CAP, 2*kills)`.

**Интерфейсы (slots):**
- Константы:
  - `SYMBOLS = ['cherry', 'lemon', 'bell', 'anchor', 'star', 'seven']`, `SYMBOL_EMOJI`;
  - `WEIGHTS = [8, 7, 6, 5, 3, 3]`, `WEIGHT_SUM = 32`;
  - `STAKES = [1, 5, 10, 25, 50]`, `MACHINE_NAMES = ['Копеечка', 'Пятак', 'Червонец', 'Четвертак', 'Полтинник']`;
  - `POOL_SHARE = 0.05`, `POOL_MIN = 1000`, `JACKPOT_MULT = 100`, `BIG_WIN_MULT = 20`;
  - `SPIN_TICKS = 144`, `SPIN_READY_TICKS = 156`, `REEL_STOP_MS = [1200, 1700, 2200]`, `SPIN_MS = 2400`.
- `symbolFromRoll(r: 0..31): number` — накопленные веса.
- `evaluate(reels): {mult: number; jackpot: boolean}`:
  - три семёрки → `{100, true}`;
  - три одинаковых → вишня 6, лимон 10, колокол 15, якорь 20, звезда 50;
  - ровно две вишни → 2;
  - ровно две семёрки → 4;
  - иначе 0.
- `jackpotPayout(stake, pool) → {win, share, poolAfter}`:
  - `share = floor(pool * stake / 50)`;
  - `win = stake * 100 + share`;
  - `poolAfter = max(POOL_MIN, pool - share)`.

**Шаги:**
- [x] Тест экономики:
  - `mskDay(Date.UTC(2026, 9, 1, 20, 59, 59))` → `'2026-10-01'`;
  - `mskDay(Date.UTC(2026, 9, 1, 21, 0, 0))` → `'2026-10-02'`;
  - награда при 3599 тиках — `null`;
  - 20 сбитых + победа + лучший → `{10, 30, 15, 10, total 65}`.
- [x] Тест автоматов: полный перебор 6³ с весами-произведениями.
  - сумма выплат = 28640 на 32768 (возврат 0,87402);
  - доля выигрышей 6641/32768 ≥ 0,2;
  - вероятность джекпота 27/32768;
  - `symbolFromRoll` для 0..31 даёт частоты `WEIGHTS`;
  - `jackpotPayout(50, 1500)` → `{win: 6500, share: 1500, poolAfter: 1000}`;
  - `jackpotPayout(1, 5000)` → `{win: 200, share: 100, poolAfter: 4900}`.
- [x] Реализовать, прогнать.

### Задача 4. Хранилище

**Файлы:** `server/store.ts`, `test/store.test.ts`.

**Интерфейсы:**

```ts
export interface Stats { pbRounds: number; pbWins: number; pbKills: number; pbMvp: number; spins: number; slotWon: number; bestWin: number; jackpots: number }
export interface Profile { id: number; nick: string; keyHashes: string[]; createdAt: number; lastSeen: number; tokens: number; owned: string[]; outfit: Outfit; daily: string; stats: Stats }
export interface State { v: 1; nextId: number; jackpot: number; lastJackpot: { nick: string; win: number; at: number } | null; profiles: Profile[] }
export interface StoreOptions { saveDelayMs?: number; now?: () => number; log?: (s: string) => void; keepBackups?: number }
export class Store {
  constructor(dir: string, opts?: StoreOptions);
  readonly dir: string;
  state: State;
  load(): void;        // синхронно; битый файл → копия; нет ничего → пустое состояние (jackpot = POOL_MIN)
  markDirty(): void;   // сохранение через saveDelayMs (по умолчанию 1000)
  flush(): void;       // синхронно, если есть несохранённое
  close(): void;       // flush + снять таймер
}
export function emptyStats(): Stats;
export function normalizeProfile(raw: unknown): Profile | null; // недостающие поля — по умолчанию
```

Запись:
1. `state.json.tmp`: `openSync` → `writeSync` → `fsyncSync` → `closeSync`.
2. `renameSync` в `state.json`.
3. Если нет `backups/state-<mskDay(now)>.json` — записать туда то же содержимое. Оставить `keepBackups` (7) самых новых.

Чтение:
- ошибка разбора → переименовать в `state.json.corrupt-<now>` → перебирать копии от новых к старым → первая читаемая;
- в журнал: «Хранилище было повреждено, восстановлено из <файл>».

**Шаги:**
- [x] Тесты (временная папка через `mkdtempSync`):
  1. пустая папка → пустое состояние; изменить, `flush`, новый `Store` читает то же; файла `.tmp` нет;
  2. испортить `state.json` → загрузка из копии, файл `.corrupt-*` появился;
  3. `now` на 9 разных дней, по одному сохранению → в `backups` 7 файлов;
  4. `markDirty` дважды при `saveDelayMs = 20` → через 60 мс файл есть и содержит последнее изменение.
- [x] Реализовать, прогнать.

### Задача 5. Профили и ограничение частоты

**Файлы:** `server/ratelimit.ts`, `server/profiles.ts`, `test/profiles.test.ts`.

**Интерфейсы:**

```ts
export class RateLimiter {
  constructor(now?: () => number);
  hit(key: string, limit: number, windowMs: number): boolean;   // true — можно (и засчитано)
  peek(key: string, limit: number, windowMs: number): boolean;  // проверка без засчитывания
}
export type LoginCode = 'need_nick' | 'nick_taken' | 'bad_nick' | 'bad_code' | 'bad_key' | 'rate';
export type LoginResult = { ok: true; profile: Profile; created: boolean; daily: number } | { ok: false; code: LoginCode };
export const RESERVED_NICKS: readonly string[]; // имена ботов + Система, Бот, Админ, Проверка
export function validNick(raw: unknown): string | null; // sanitizeName + 2..16 + хотя бы одна буква + не зарезервирован
export function nickKey(nick: string): string;          // toLowerCase, ё→е
export function hashKey(key: string): string;           // sha256 hex
export function validKey(key: unknown): key is string;  // /^[A-Za-z0-9_-]{16,64}$/
export class Profiles {
  constructor(store: Store, opts?: { now?: () => number });
  login(req: { key: unknown; nick?: unknown; code?: unknown }, ip: string): LoginResult;
  byId(id: number): Profile | undefined;
  rename(p: Profile, nick: unknown): 'ok' | 'nick_taken' | 'bad_nick' | 'rate';
  issueCode(p: Profile): { code: string; until: number };
  credit(p: Profile, n: number): void;               // n ≥ 0
  spend(p: Profile, n: number): boolean;             // не уходим в минус
  buy(p: Profile, itemId: unknown): 'ok' | 'owned' | 'not_for_sale' | 'no_tokens' | 'unknown';
  grant(p: Profile, itemId: string): boolean;        // выдать вещь (джекпот); false — уже есть
  setOutfit(p: Profile, raw: unknown): Outfit;       // sanitizeOutfit по owned
  touch(p: Profile): void;                           // lastSeen
  honor(): { rich: Array<{ nick: string; n: number }>; wins: Array<{ nick: string; n: number }>; lastJackpot: State['lastJackpot'] };
}
```

Лимиты:
- создание: 5 в час на адрес, при пустом адресе — 30 в час на всех (ключ `create:<ip>`);
- неверный код: 10 в час на адрес;
- смена ника: раз в 60 с на профиль.

Код входа:
- 8 символов из алфавита `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` через `crypto.randomInt`;
- хранится без дефиса, при вводе дефисы и пробелы убираются, буквы — в верхний регистр;
- показывается как `XXXX-XXXX`;
- действует 10 минут. Новый код профиля отменяет прежний.

Остальное:
- при входе по коду `keyHashes` ограничены 5 ключами, самый старый удаляется;
- новый профиль: 100 жетонов, `daily = mskDay(now)` (бонус со следующего дня), `outfit = {...DEFAULT_OUTFIT, c: randomInt(16)}`;
- доска почёта: топ-5 по `tokens` и топ-5 по `stats.pbWins` (только ненулевые).

**Шаги:**
- [x] Тесты:
  - создание и повторный вход тем же ключом (`created: false`, тот же `id`);
  - занятый ник «Ёжик» против «ежик»;
  - плохие ники: `'a'`, `'!!!'`, `'Бот'`, `'Пудинг'`;
  - `need_nick`;
  - `bad_key`;
  - вход по коду с новым ключом → тот же профиль, 2 ключа; повтор кода → `bad_code`;
  - 6 кодов → 5 ключей;
  - ежедневный бонус: в день создания 0, назавтра 50, повторно 0;
  - покупка: `no_tokens`, `ok` (жетоны −60, вещь в `owned`), `owned`, `not_for_sale` для короны;
  - 6-е создание с одного адреса → `rate`;
  - `rename`: `ok`, затем `rate`, потом `nick_taken`.
- [x] Реализовать, прогнать.

### Задача 6. Карта набережной

**Файлы:** `shared/maps/lobby.ts`, `test/maps.test.ts` (дополнить).

**Интерфейсы:**

```ts
export type InteractKind = 'slot' | 'pb_gate' | 'garage' | 'kiosk' | 'seat' | 'honor';
export interface Interactable { id: number; kind: InteractKind; x: number; y: number; z: number; yaw: number; r: number; arg: number; label: string }
export interface Spot { x: number; y: number; z: number; yaw: number }
export interface LobbyMap extends GameMap {
  spawn: Spot; gateSpawn: Spot;
  interact: Interactable[];
  machines: Array<{ x: number; z: number }>;      // центры корпусов автоматов
  tables: Array<{ x: number; z: number }>;
  benches: Array<{ x: number; z: number; yaw: number }>;
  lighthouse: { x: number; z: number };
  zones: { arcade: Box2; warehouse: Box2; garage: Box2; cafe: Box2; terrace: Box2; kiosk: Box2 };
}
export function buildLobby(): LobbyMap;
export const LOBBY_SEAT_COUNT: number;
```

Где `Box2 = {x0, z0, x1, z1}`.

Координаты. X — восток, Z — юг, поверхность настила y = 0. Строится через `Builder(false)`.

- **Настил:** `[-30, -0.6, -26]..[30, 0, 22]` `'deck'`.
- **Бордюр** 0,22 м:
  - запад: `x -30..-29.7`, `z -16..22`;
  - юг: `z 21.7..22`, `x -30..30`, кроме прохода к мосткам `x -21..-17`.
- **Невидимые стены** (высокие, `y -6..30`):
  - запад `x -39..-38`;
  - юг `z 48..49`;
  - восток `x 30.5..31.5`;
  - север `z -27..-26`;
  - по длине — на всё поле.
- **Павильон автоматов** (кирпич, крыша `y 4.6..5.0`):
  - стены: задняя `z -26..-25.4`, `x -28..-12`; боковые `x -28..-27.4` и `-12.6..-12`, `z -25.4..-16`;
  - столбы фасада `x = -22.5, -17.5`;
  - автоматы `x = -25, -22.5, -20, -17.5, -15`:
    - корпус `[x-0.55, 0, -25.4]..[x+0.55, 2.1, -23.7]` (металл);
    - точка «встать» `(x, 0, -22.7)`, `yaw 0`, `r 1.0`.
- **Склад №3** (кирпич `y 0..9`):
  - блоки `x -9..-3` и `3..9`, `z -26..-16`;
  - перемычка над воротами `x -3..3`, `y 4.5..9`, `z -26..-16`;
  - ворота — ниша: полотно `[-3, 0, -18]..[3, 4.5, -17.5]` (металл);
  - вход `pb_gate` `(0, 0, -15.2)`, `r 2.2`;
  - `gateSpawn` `(0, 0, -12.5)`, `yaw π`.
- **Гараж** (кирпич `y 0..6`): `x 13..28`, `z -26..-16`; `garage` `(20.5, 0, -15)`, `r 2.2`.
- **Проходы между зданиями** (`x -12..-9` и `9..13`): ящики и бочки.
- **Кафе:**
  - домик `[24, 0, -10]..[30, 4, 4]` (дерево);
  - столики `(16, 0, z)` для `z = -5, 3, 11`: корпус `[cx-0.55, 0, cz-0.55]..[cx+0.55, 0.75, cz+0.55]`;
  - 6 стульев на радиусе 1,35: угол `k·60° + 30°`, лицом к центру, стулья без коллизии; `seat` `r 0.7`.
- **Ларёк:**
  - корпус `[-29.5, 0, -6]..[-25.5, 3.2, 0]` (дерево);
  - `kiosk` `(-24, 0, -3)`, `yaw π/2` (лицом на запад к окошку), `r 1.6`.
- **Площадь:**
  - батуты `(-6, 10)` и `(8, 14)`;
  - скамейки лицом к морю `(x, 19.5)` для `x = -8, 0, 8`: без коллизии, по 2 места `x±0.5`, `yaw π`;
  - доска почёта `[5, 0, -12.3]..[8, 3.2, -11.9]`;
  - фонари `(-14, -2)`, `(-4.5, -11)`, `(11, -11)`, `(-14, 16)`, `(2, 16)`, `(14, 16)` — невидимая коллизия и декор;
  - кнехты по кромке у моря.
- **Мостки и маяк:**
  - мостки `[-21, -0.6, 22]..[-17, 0, 38]`;
  - площадка маяка `[-24, -0.6, 38]..[-14, 0, 46]`;
  - башня `[-20.6, 0, 41.4]..[-17.4, 12, 44.6]`;
  - `lighthouse (-19, 43)`.
- **`spawn`** `(0, 0, 6)`, `yaw 0`.

Порядок `interact`:
- 0–4 — автоматы (`arg` 0–4);
- 5 — ворота;
- 6 — гараж;
- 7 — ларёк;
- 8 — доска почёта (`honor`, только подсказка, `(6.5, 0, -11)`, `r 1.8`);
- дальше места: 18 стульев (стол×6 + стул), затем 6 мест на скамейках (`arg` — номер места 0–23).

**Шаги:**
- [x] Тесты:
  - `id` = индекс;
  - точки `spawn` и `gateSpawn` и все точки взаимодействий (кроме стульев и скамеек) стоят на опоре (`groundBelow ≈ 0`) и не пересекаются с боксами (AABB игрока);
  - из `spawn` по прямой вдоль Z до `(0, -14)` нет боксов (`raycast` на высоте 1 м);
  - автоматов 5, мест 24;
  - `stepPlayer` без ввода 120 тиков в `spawn` → стоит на месте (`grounded`).
- [x] Реализовать, прогнать.

### Задача 7. Прицел от третьего лица

**Файлы:** `shared/aim.ts`, `shared/world.ts` (опция луча), `test/aim.test.ts`.

**Интерфейсы:**

```ts
export interface RigParams { back: number; side: number; up: number }
export const RIG_PB: RigParams;       // 2.9, 0.6, 0.25
export const RIG_PB_ADS: RigParams;   // 1.4, 0.5, 0.15
export const RIG_LOBBY: RigParams;    // 3.6, 0, 0.6
export const PIVOT_Y = 1.45, CAM_MIN = 0.35, CAM_PAD = 0.2, AIM_FALLBACK = 0.5;
export interface V3 { x: number; y: number; z: number }
/** Позиция камеры. side: +1 правое плечо, −1 левое. back — если задан, вместо rig.back. Возвращает расстояние до опоры. */
export function cameraRig(px: number, py: number, pz: number, yaw: number, pitch: number, rig: RigParams, side: number, world: CollisionWorld, out: V3, back?: number): number;
/** Точка прицела: луч из камеры вдоль (yaw, pitch), начинается на глубине опоры; цели — тройки x, y(ноги), z. */
export function aimPoint(cam: V3, pivotX: number, pivotY: number, pivotZ: number, yaw: number, pitch: number, world: CollisionWorld, targets: ArrayLike<number>, count: number, out: V3): void;
/** Направление выстрела игрока s от третьего лица (камера → P → из глаз в P → разброс). */
export function tpsShotDir(s: PlayerState, aimYaw: number, aimPitch: number, spread: number, seed: number, shot: number, side: number, ads: boolean, world: CollisionWorld, targets: ArrayLike<number>, count: number, out: { dirX: number; dirY: number; dirZ: number }): void;
```

`world.raycast` получает необязательный 10-й параметр `skipInvisible = false`. Камера пропускает невидимые боксы (столбы фонарей и кнехты), чтобы не дёргаться.

Как считается камера:
- `f = viewDir(yaw, pitch)`;
- `r = (cos yaw, 0, −sin yaw)`;
- `желаемая = опора − f·back + r·side·rig.side + (0, rig.up, 0)`;
- луч от опоры к желаемой точке (`forShots = true`, `skipInvisible = true`);
- если попал на `t < длины`, то `dist = max(CAM_MIN, t − CAM_PAD)`.

**Шаги:**
- [x] Тесты (на карте «Причал»):
  1. открытое место, `pitch 0` → расстояние = `hypot(2.9, 0.6, 0.25)` с точностью 1e-9;
  2. спиной к стене склада (игрок в 1 м от неё, смотрит от стены) → расстояние от 0,35 до 2,9, камера вне боксов (`overlaps` куба 0,1 м вокруг точки — `false`);
  3. цель на линии взгляда в 10 м → `P` на поверхности её эллипсоида;
  4. без цели, смотрим в стену контейнера → `P` на стене;
  5. `tpsShotDir` при `spread 0` → направление = `норм(P − глаза)`;
  6. при `P` за спиной (цель вплотную сзади камеры не учитывается) → срабатывает запасной путь, направление = `f`;
  7. два вызова с одинаковыми данными → побитово равны.
- [x] Реализовать, прогнать.

### Задача 8. Пейнтбол: очередь ввода, наряды, награды, AFK, выстрел от третьего лица

**Файлы:** `server/inputs.ts`, `server/paintball/game.ts`, `server/paintball/room.ts`, `shared/messages.ts`, `test/paintball.test.ts`, `test/bots.test.ts`.

**Интерфейсы:**

```ts
// server/inputs.ts
export class InputQueue {
  readonly items: Input[]; lastSeq: number; ack: number; budget: number; starve: number;
  push(inputs: readonly Input[], count: number): void; // отбрасывает seq ≤ lastSeq, держит не больше 24
  due(): number;  // раз в тик: budget = min(budget + 1, 10); n = len > 3 ? 2 : len > 0 ? 1 : 0; n ≤ floor(budget)
  shift(): Input; // budget -= 1; starve = 0; ack = seq
  reset(): void;
  get length(): number;
}
// server/paintball/game.ts
export interface HumanInfo { pid: number; nick: string; outfit: Outfit }
export interface GameHooks {
  reward?(p: Player, r: PbReward): void;
  afk?(p: Player): void;
}
Game.constructor(hooks?: GameHooks)
Game.addHuman(info: HumanInfo, sink: Sink): Player | null
Game.command(p: Player, text: string): void    // бывший разбор команд из onChat
Game.status(): { phase: number; left: number; scores: [number, number]; humans: number; names: string[] }
Player: pid, outfit, playTicks, idleTicks, inq: InputQueue
RosterEntry: + o: Outfit
ServerMsg: + { t: 'pbReward'; total; round; kills; win; mvp }
// server/paintball/room.ts
export class PaintballRoom implements Room { kind = 'paintball'; game: Game; join/leave/onInputs/onMessage/step/humans }
```

Что меняется в `Game`:
- `processHuman` работает через `InputQueue`.
- Каждый тик фазы боя живым и мёртвым людям `playTicks++`. В начале разминки — 0.
- `idleTicks`:
  - обнуляется, если кнопки ввода отличаются от прошлых или `yaw`/`pitch` сдвинулись больше чем на 1e-4;
  - иначе растёт;
  - при `≥ PB_AFK_TICKS` → `hooks.afk(p)`, один раз.
- В `endRound`:
  - для людей `paintballReward({playTicks, kills, won: p.team === winner, mvp: mvp === p && !mvp.isBot})`;
  - если не `null` → `hooks.reward(p, r)` и `sink.sendJson({t: 'pbReward', ...r})`.
- `fire(p, inp)`:
  - собрать цели: противники, откат на `viewTick`, как сейчас, в `Float64Array` троек;
  - для людей направление = `tpsShotDir(p.state, ev.aimYaw, ev.aimPitch, ev.spread, p.seed, p.state.shots, (inp.buttons & BTN_SHOULDER) ? −1 : 1, (inp.buttons & BTN_ADS) !== 0, world, targets, n, out)`;
  - у ботов — `ev.dir`;
  - дальше прежний луч из глаз по миру и тем же целям.
- Чат:
  - `onChat` удаляется: обычные сообщения шлёт Hub;
  - `systemChat` и `privateChat` отправляют `{t: 'chat', from: '', pid: 0, room: 'pb', team: -1, text, sys: true}`.
- Боты:
  - `outfit = randomOutfit(hash32(id, 99))`;
  - ник человека, совпадающий с именем бота, невозможен: такие ники зарезервированы.

**Шаги:**
- [x] Тест: награда.
  1. `new Game(hooks)`, человек, `step` до фазы боя.
  2. Провести 61 с боя.
  3. `game.phaseEnd = game.tick + 1`, `step` → раунд окончен.
  4. `hooks.reward` вызван один раз, `total ≥ 10`, пришёл `pbReward`.

  Второй человек, вошедший за 30 с до конца, награды не получает.
- [x] Тест: в составе у людей `o` из профиля, у ботов — бесплатные вещи.
- [x] Тест: AFK. Человек без ввода 90 с → `afk` вызван один раз.
- [x] Тест: выстрел от третьего лица.
  1. Человек A, перед ним в 12 м противник-бот, помещённый вручную и замороженный (бот не управляется: `p.bot = null`).
  2. A жмёт огонь с прицелом на центр цели.
  3. За 30 тиков есть событие `hit` по цели.
- [x] Тест ботов проходит с новым `addHuman`.
- [x] Реализовать, прогнать.

### Задача 9. Hub, вход, чат, переходы, главный файл сервера

**Файлы:** `server/hub.ts`, `server/lobby/room.ts` (ходьба и снимки), `server/main.ts`, `shared/messages.ts`, `test/hub.test.ts`.

**Интерфейсы:**

```ts
export interface Sink { sendBinary(d: Uint8Array): void; sendJson(m: ServerMsg): void; close(code: number, reason: string): void }
export interface Room {
  readonly kind: 'lobby' | 'paintball';
  join(c: Client): boolean; leave(c: Client): void;
  onInputs(c: Client, inputs: Input[], count: number): void;
  onMessage(c: Client, msg: ClientMsg): void;
  step(): void; readonly humans: number;
}
export class Client {
  readonly id: number; readonly sink: Sink; readonly ip: string;
  profile: Profile | null; ephemeral: boolean; room: Room | null; epoch: number; ping: number;
  lastMoveTick: number; helloTries: number;
  get nick(): string; get pid(): number;
}
export interface HubOptions { store: Store; profiles: Profiles; smokeToken: string; build: string; dev?: boolean; rig?: number[] | null; now?: () => number }
export class Hub {
  readonly lobby: LobbyRoom; readonly paintball: PaintballRoom; readonly clients: Set<Client>; tick: number;
  constructor(o: HubOptions);
  connect(sink: Sink, ip: string): Client;
  disconnect(c: Client): void;
  onJson(c: Client, msg: unknown): void;
  onBinary(c: Client, data: Uint8Array): void;
  step(): void;
  get active(): boolean;                    // есть вошедшие
  move(c: Client, room: Room): boolean;     // лимит — раз в 120 тиков
  chat(c: Client | null, text: string): void;
  announce(text: string, delayTicks?: number): void;   // общая системная строка
  sendMe(c: Client): void; sendTokens(c: Client, delayMs?: number): void; toast(c: Client, text: string): void;
  reward(pid: number, n: number, why: string): void;
  broadcastOnline(): void;
  health(): { online: number; lobby: number; paintball: number; busy: number };
  shutdown(): void;                         // restart всем, store.flush, close(1012)
}
```

Поведение:
- **`hello`:**
  - не больше 10 попыток на соединение;
  - неверная версия → `error version` + `close(4002)`;
  - `smoke` совпал с токеном → временный профиль (`id` отрицательный, в store не пишется, в «кто где» и чате не виден);
  - иначе `profiles.login`, ошибки уходят как `error {code}`.
- **Успешный вход:**
  1. если профиль уже в сети — старому `error replaced` + `close(4001)`, его `disconnect`;
  2. `me`;
  3. `toast` о ежедневном бонусе;
  4. `chatlog`;
  5. `move(c, lobby)`;
  6. `broadcastOnline`.
- **`chat`:**
  - `sanitizeChat`, 5 сообщений за 5 с;
  - текст с `/` → `room.onMessage` (`'/…'` пейнтбол разбирает сам, на набережной — только `/help`);
  - иначе всем `{t: 'chat', from: nick, pid, room, team, text, sys: false}` и в историю (30 штук).
- **`ping`** → `pong {c, k: hub.tick}`.
- **`rename`, `code`** — через `profiles`, ответ `me` или `code`.
- **`leave`:** если в пейнтболе → `move(c, lobby)`, игрок появляется у ворот.
- Остальное → `c.room.onMessage`.
- **`onBinary`:** `data[0] === MSG_INPUT`, `inputEpoch(data) === c.epoch`, `decodeInputs > 0` → `room.onInputs`.
- **`step`:** `tick++`; отложенные объявления; `lobby.step()`, если там есть люди; `paintball.step()`, если там есть люди; раз в 60 тиков — статус склада на набережную (`pb`), если изменился или в пейнтболе есть люди.

`LobbyRoom` (базовая часть):
- места 1–250;
- `LobbyPlayer {slot, client, state, ev, inq, lastInput, action, arg, actionUntil, selfReset}`;
- `join` ставит в `spawn` или `gateSpawn` и шлёт `lobby {...}`, всем — `lroster`;
- `step`: ввод как в пейнтболе (`canFire = false`), каждые 2 тика — снимки. В сущности: `hp` = действие, `armor` = аргумент, `yaw` для сидящих — `yaw` места;
- вместимость 64.

`main.ts`:
- создаёт `Store(DATA_DIR)` (`load`), `Profiles`, `smoke-token` (`randomBytes(32)`, hex, `writeFileSync` с `mode 0o600`, если нет), `build`, `Hub`;
- адрес игрока — `X-Real-IP`, только если сокет с loopback;
- цикл спит, если `!hub.active`;
- `/health` → `hub.health()` + `stepMs`;
- `SIGTERM` и `SIGINT` → `hub.shutdown()` → выход.

**Шаги:**
- [x] Тесты (поддельные `Sink`, временная папка):
  1. вход новичка → по порядку `me` (100 жетонов), `chatlog`, `scene lobby epoch 1`, `lobby`; через 2 шага — двоичный снимок;
  2. версия 1 → `error version` и `close 4002`;
  3. без ника → `need_nick`, соединение живо; потом с ником → вход;
  4. второй вход тем же ключом → первому `replaced` и `4001`;
  5. ввод со старым `epoch` игнорируется, с текущим — принят (`inq.lastSeq`);
  6. чат двух игроков доходит обоим; третий получает его в `chatlog`;
  7. `smoke` с верным токеном → `me` и `scene`, профилей в store 0;
  8. `hub.move` в пейнтбол и `leave` → `epoch` 2 и 3, `paintball.humans` 1 → 0.
- [x] Реализовать `hub.ts`, базовый `LobbyRoom`, `PaintballRoom`, новый `main.ts`.
- [x] Ручная проверка: `npm run dev` запускается, `/health` отдаёт новые поля.
- [x] Контроль.

### Задача 10. Набережная: места, эмоции, вода, примерочная, склад, автоматы

**Файлы:** `server/lobby/room.ts`, `server/lobby/slots.ts`, `test/lobby.test.ts`.

**Интерфейсы:**

```ts
// server/lobby/slots.ts
export interface Machine { stake: number; occupant: number; busyUntil: number }
export interface SpinResult { m: number; reels: [number, number, number]; stake: number; win: number; mult: number; jackpot: boolean; item: string | null; afterStake: number; final: number; pool: number }
export class SlotHall {
  readonly machines: Machine[];
  constructor(profiles: Profiles, store: Store, roll?: () => number); // roll → 0..31, по умолчанию randomInt(32)
  occupy(m: number, who: number): boolean;
  release(who: number): void;
  machineOf(who: number): number;
  spin(who: number, p: Profile, tick: number): SpinResult | 'not_here' | 'busy' | 'no_tokens';
}
```

`spin`:
1. `spend(stake)`.
2. `store.state.jackpot += stake * 0.05`.
3. Выбросить 3 символа, `evaluate`.
4. Джекпот: `jackpotPayout` → `win`, `pool`; выдать первую ненужную вещь из `JACKPOT_ITEMS`; `lastJackpot`; `stats.jackpots++`.
5. `credit(win)`.
6. `stats.spins++`, `slotWon += win`, `bestWin = max(…)`.
7. `busyUntil = tick + SPIN_READY_TICKS`, `markDirty`.

Правила `LobbyRoom`:
- **`use {id}`:**
  - лимит 4 в секунду;
  - расстояние по XZ ≤ `r + 0.5`, `|dy| < 2`;
  - `slot` → `occupy` → действие 6, `arg` = `m`, перенос в точку и `selfReset`; иначе `toast` «Автомат занят»;
  - `seat` → свободно → действие 5;
  - `kiosk` → действие 8, перенос;
  - `pb_gate` → `hub.move(c, paintball)`; не вышло → «Склад переполнен»;
  - `garage` → `toast` «Картинг откроется скоро».
- **`unuse`** или **новое нажатие** W/A/S/D/пробел/Shift в сидячем действии (5, 6, 8; у автомата без пробела) → освободить место, действие 0. Клавиша, зажатая ещё до того, как сел, не поднимает. Правило — общая `stepHeld(s, hold, inp, …)` и `holdMask(action)` из `shared/lobby.ts`: так же считает предсказание клиента. В сидячем действии игрок не двигается, `prevButtons` обновляется.
- **`emote {e ∈ 1..4}`:**
  - лимит 2 в секунду;
  - нельзя в действиях 5, 6, 8;
  - 1, 3, 4 длятся 180 тиков, 2 — до движения;
  - движение отменяет эмоцию.
- **`spin`:** `SlotHall.spin`, по результату:
  - всем `slotSpin {m, id, nick, reels, win, jackpot, item}`;
  - игроку `tokens {n: afterStake}` и `tokens {n: final, delay: 2400}`;
  - при `win ≥ 20·stake` или джекпоте — `hub.announce(…, 144)`;
  - джекпот → `pool` и `honor` всем;
  - иначе `pool` всем раз в секунду (накопленное).
  - Ошибки: `toast` «Не хватает жетонов» или «Автомат ещё крутится».
- **`outfit {o}`** (только в действии 8, лимит 5 в секунду) → `profiles.setOutfit` → `outfitOf {id, o}` всем, `me` игроку.
- **`buy {item}`** (только в действии 8, лимит 2 в секунду) → `profiles.buy` → `ok`: надеть (`withItem`), `outfitOf`, `me`, `toast` «Куплено: …»; иначе `toast` с причиной.
- **Вода:** `y < DROWN_Y` → `lev {e: [['splash', x, z, id]]}` всем, перенос в `spawn`, `selfReset`.
- **Уход игрока:** `release` мест и автомата.
- **Отложенное:** `honor` раз в 60 с при изменениях; `pb` — от Hub.

**Шаги:**
- [x] Тесты:
  1. W 60 тиков → `z` уменьшился;
  2. позиция `x = -34` → через шаг `splash` и игрок в `spawn`;
  3. `use` автомата издалека — действия нет; из точки — действие 6; второй игрок — `toast` «занят»;
  4. `spin` с 0 жетонов → `toast`; с жетонами при `roll = () => 31` (всегда семёрки) → джекпот, корона в `owned`, банк ≥ 1000, объявление через 144 тика;
  5. `spin` сразу повторно → `busy`;
  6. эмоция 1 → действие 1; ввод W → 0;
  7. сесть на место → 5; второй не сядет; W → место свободно; сел на ходу с зажатым W — сидит, пока W не нажать заново;
  8. `outfit` вне ларька игнорируется; в ларьке → `outfitOf` всем;
  9. `buy 'h:panama'` → жетоны −60, `me.owned` содержит;
  10. `use pb_gate` → `scene paintball`.
- [x] Реализовать, прогнать.
- [x] Контроль (вся серверная часть закрыта тестами).

### Задача 11. Рендерер, небо с палитрой, мир «Причал» без изменений

**Файлы:** `client/render/renderer.ts`, `client/render/sky.ts`, `client/render/world.ts`.

**Интерфейсы:**

```ts
// renderer.ts
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  constructor(canvas: HTMLCanvasElement);
  resize(w: number, h: number, ratio: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;   // clear + render
  refreshShadows(): void;                                   // shadowMap.needsUpdate = true
}
// sky.ts
export interface SkyPalette { sunDir: THREE.Vector3; horizon: number; mid: number; zenith: number; sunGlow: number; stars: number; deep: number; shallow: number; exposure: number; fogNear: number; fogFar: number }
export const SUNSET: SkyPalette;   // нынешние значения «Причала», stars 0
export const EVENING: SkyPalette;  // поздний закат для набережной
export function makeSky(p: SkyPalette): THREE.Mesh;
export function makeSea(p: SkyPalette): THREE.Mesh;
export function fogColor(p: SkyPalette): THREE.Color;   // acesFilmic(horizon)
// world.ts
new World(renderer: Renderer, map: GameMap)
```

`World` больше не создаёт рендерер. Камера остаётся своей у каждой сцены.

**Шаги:**
- [x] Перенести, собрать. Пейнтбол выглядит как раньше (сравнить глазами в браузере с тем же ракурсом камеры меню). Сверено по пикселям: средняя разница 0,002 из 255.
- [x] Контроль: `npm run check`.

### Задача 12. Наряды на желейке

**Файлы:** `client/render/avatar.ts`, `client/render/outfit3d.ts`, `client/render/dress.ts` (примерочная `?dress`), `client/render/textures.ts` (`metalEnvTexture`, `emoteTexture`).

**Интерфейсы:**

```ts
new Avatar(id: number, opts?: { gun?: boolean })     // gun: пейнтбол
avatar.setOutfit(o: Outfit): void
avatar.setTeam(team: 0 | 1 | null): void              // null — набережная: без пояса, табличка белая
avatar.setInfo(name: string, team: 0 | 1 | null, mate: boolean): void
avatar.setAction(action: number, arg: number): void   // эмоции, сидит, у автомата
avatar.pullLever(): void                              // рука на рычаг (автомат)
avatar.say(text: string): void                        // облачко на 6 с
avatar.update(pose, dt, time, world, camPos, local)   // local: скрывать, если камера ближе 0,9 м
```

Шейдер желе:
- униформы `uPattern`, `uColor2`, `uMetal` (как в спецификации);
- `varying vObj` — позиция до покачивания;
- в `#include <color_fragment>` → `diffuseColor.rgb = patternColor(diffuseColor.rgb)`;
- `uMetal` смешивает `metalnessFactor` к 0,85 и `roughnessFactor` к 0,28;
- ключ программы `'jelly-v2'`;
- «золото»: `uMetal = 1`, цвет `0xd4a93a`.

Узоры (`h = vObj.y / 1.58`):
1. полосы `step(0.5, fract(vObj.y * 6.5))` в пределах `0.08 < h < 0.9`;
2. точки по сетке `(atan(z, x) * 3, y * 6)`, радиус 0,24;
3. пятна: порог `0.6` шума `noise3(vObj * 3.2)`;
4. градиент `smoothstep(0.1, 0.95, h)`;
5. камуфляж: два шума, пороги `0.55` и `0.62`;
6. блёстки: `step(0.93, hash3(floor(vObj * 60)))` добавляют `0.8` к цвету.

Шапки, аксессуары, очки, веки — `outfit3d.ts`:
- общие геометрии с вершинными цветами, один материал на всё, кроме металла (корона, цепь — отдельный металлический материал);
- у каждого `key` — функция-построитель в локальных координатах тела (макушка `y = 1.58`);
- смещение вместе с наклоном: коэффициент `(y / 1.58)²`, как у нынешних шапочек.

Пояс команды — тор `r 0.53`, трубка `0.05` на `y 0.62`, цвет команды, виден при `team !== null`.

Руки-варежки — две сферы цвета тела:
- помахать — правая у головы, качается;
- танец — обе вверх, тело покачивается и подпрыгивает;
- «устал» — тело сжато до 0,85, веки сонные, спрайт «zzz»;
- смех — дрожь, руки у живота, спрайт «ха-ха»;
- сидит — тело выше на 0,3 и сжато до 0,88;
- у автомата — руки вперёд, `pullLever` опускает правую руку на 0,4 с.

Облачко — спрайт-холст над табличкой: белая плашка, тёмный текст до 60 символов, исчезает через 6 с.

**Шаги:**
- [x] Реализовать. Веки — копия белка с отсечением по плоскости и изгибу (`dot(p, n) + k·x² ≥ d`): сонные, сердитые, довольные (дуга ^^).
- [x] Проверка глазами — пока отдельная примерочная `?dress` (`client/render/dress.ts`, запуск из `main.ts`): ряд из 12 желеек, каждая вещь каталога хотя бы раз; мышь — камера, цифры — эмоции, T — пояс, W — ходьба, H — попадание. Узоры читаются, шапки не проваливаются, пояс виден, вещи качаются с телом. Погоны опущены на «плечи» (y 0,99). В задаче 15 примерочная переедет в сцену набережной.
- [x] Контроль: `npm run check` (остались только ожидаемые ошибки `session.ts` до задачи 13), `npm test` — 71 из 71.

### Задача 13. Оболочка клиента: вход, соединение, сцены, общий интерфейс

**Файлы:** `client/app.ts` (переписать), `client/net.ts`, `client/identity.ts`, `client/chat.ts`, `client/input.ts`, `client/ui/{tokens,toasts,online,profile}.ts`, `client/paintball/{scene,hud,slot}.ts` (перенос из `session.ts`, `hud.ts`, `slot.ts`; пока от первого лица), `client/main.ts`, `client/styles.css`, `index.html` (заголовок «Game Opus — вечерняя набережная»).

**Интерфейсы:**

```ts
// net.ts
export class Net {
  onJson: (m: ServerMsg) => void; onBinary: (b: ArrayBuffer, at: number) => void;
  onOpen: () => void; onClose: (code: number, reason: string) => void;
  connect(): void; close(): void; send(m: ClientMsg): void; sendBinary(d: Uint8Array<ArrayBuffer>): void;
  get isOpen(): boolean; get buffered(): number;
}
ClockSync: + minDelay (по умолчанию 1.6)
// identity.ts
export function deviceKey(): string;          // создать при отсутствии (crypto.getRandomValues, base64url)
export function resetDeviceKey(): string;
export function savedNick(): string; export function saveNick(n: string): void;
// сцены
export interface Scene {
  enter(): void; exit(): void;
  onJson(m: ServerMsg): void; onSnapshot(b: ArrayBuffer, at: number): void;
  frame(now: number, dt: number): void;
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean;
  readonly wantsPointer: boolean;             // нужна ли захваченная мышь прямо сейчас
}
export interface SceneDeps { renderer: Renderer; input: Input; sound: Sound; settings: Settings; net: Net; ui: Ui }
export interface Ui { chat: Chat; tokens: TokensHud; toasts: Toasts; online: OnlineList; me: () => MeState }
```

`App`:
- **Экран входа:**
  - «Привет, <ник>!» + «Играть», если ник сохранён; иначе поле ника;
  - ссылки «Другой профиль» (с подтверждением) и «У меня есть код».
- **«Играть»:** `sound.unlock`, `input.lock`, `net.connect` → на `open` отправить `hello {v, key, nick?, code?}`.
- **Ответы сервера:**
  - `error` с `need_nick`, `nick_taken`, `bad_nick` → показать поле с текстом;
  - `bad_code` → текст;
  - `version` → перезагрузка один раз (`sessionStorage['opus.vreload']`);
  - `replaced` → экран «Ты зашёл в другом окне» с кнопкой «Вернуться сюда»;
  - `me` → запомнить ник и `build`. Если `build` сменился после переподключения — `location.reload()`;
  - `scene` → переключить сцену (затемнение 250 мс, `renderer.refreshShadows()`).
- **Закрытие соединения:**
  - коды 1012, 1006 или любой другой, кроме 4001, 4002, 1008, после успешного входа → «Переподключаемся…», повторы через 1, 2, 4, 8, 15, 15… с;
  - до входа → экран «Связь потеряна».
- **Общие сообщения** (обрабатывает оболочка):
  - `me`, `tokens`, `toast`, `chat`, `chatlog`, `online`, `code`, `restart`, `pong`;
  - остальное — активной сцене;
  - `chat` оболочка тоже передаёт сцене (облачка).
- **Пауза** (мышь отпущена без открытой примерочной):
  - «Продолжить», настройки (как сейчас), «Профиль», «Выйти на набережную» (только в пейнтболе), «Выйти в меню»;
  - настройка «покачивание маркера» убирается (нет вида от первого лица).
- **Фон меню:** сцена набережной в режиме облёта.
- **Жетоны** (`TokensHud`): правый верхний угол, `set(n, delayMs)`, всплывающее `+N` / `−N`.
- **Чат:**
  - `add({from, pid, room, team, text, sys}, myPid, myRoom)`;
  - метка 🏠 или 🎯 для чужой комнаты;
  - цвет ника — цвет команды при `team ≥ 0`.

**Шаги:**
- [x] Перенести `Session` в `PaintballScene` (соединение и сцена снаружи; `enter` и `exit` чистят аватары, эффекты, интерфейс). Матч — `client/paintball/match.ts` (класс `Match`, один на посещение склада), `session.ts` удалён.
- [x] Реализовать оболочку, `Net`, `identity`, общий интерфейс. `emptyStats` переехал в `shared/economy.ts` (нужен клиенту). Уведомления живут в `#menus` — видны поверх паузы и профиля (там же ошибки смены ника).
- [x] Временная сцена набережной: коробки карты, облёт в меню, своя желейка по снимкам (без предсказания), камера за спиной, E — ближайший предмет. Ворота проверены пешком: W до ворот, E.
- [x] Проверка в браузере: вход новым ником, повторный вход без ника, вторая вкладка выбивает первую («Вернуться сюда» выбивает вторую), ошибки входа (`need_nick`, `nick_taken`, `bad_code`) остаются на экране входа, вход по коду с другого ключа, «Кто где» по Tab, путь «набережная → ворота → склад → на набережную». Перезапуск — на собранной версии (`npm run build`, `PORT=5191 node server/main.ts`): «Сервер обновляется — переподключаемся через N с» → снова в игре; новая сборка → страница перезагрузилась. В разработке так не проверить: Vite сам перезагружает страницу, когда сервер перезапускается.
- [x] Контроль: `npm run check` — чисто, `npm test` — 71/71.
- Заметка к задаче 15: у своей желейки не показывать табличку с ником.

### Задача 14. Мир набережной

**Файлы:** `client/lobby/world.ts`, `client/lobby/boards.ts`, `client/render/textures.ts` (новые текстуры: доски террасы, вывески-лампочки, ковёр, дверь гаража).

**Интерфейсы:**

```ts
export class LobbyWorld {
  readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera; readonly map: LobbyMap; readonly collision: CollisionWorld;
  readonly machineAnchors: THREE.Object3D[];   // куда ставить модели автоматов
  readonly gateScreen: GateScreen; readonly honorBoard: HonorBoard; readonly jackpotBoard: JackpotBoard;
  constructor(renderer: Renderer, quality: 'high' | 'medium' | 'low');
  update(dt: number): void;
  bounceTrampoline(x: number, z: number, power: number): void;
}
// boards.ts: холсты с методами update(данные)
GateScreen.update(pb: {phase, left, scores, humans, names}); HonorBoard.update(h); JackpotBoard.update(pool: number, time: number)
```

Строится:
- боксы карты, склеенные по материалам (как `World.buildMap`, мягкие тени настила);
- кирпичные корпуса с парапетом;
- павильон с крышей на столбах и ковром;
- ниша ворот со светом изнутри (излучающая плоскость) и экраном над ней;
- гараж с рулонной дверью и табличкой «КАРТИНГ · скоро»;
- кафе — домик, окошко, вывеска «Кафе «Чайка»», навес-гирлянды над террасой, столики и стулья;
- ларёк с окошком, вывеской «Примерочная» и ростовым зеркалом (рама + светлая плоскость с бликом, без отражений);
- фонари с ореолами;
- гирлянды: провисающие кривые между столбами, лампочки — один инстансный меш;
- кнехты;
- скамейки;
- доска почёта;
- мостки;
- маяк с вращающимся лучом (конус с аддитивным материалом);
- дальний берег с огнями города (точки-спрайты);
- вода — общий шейдер моря с палитрой `EVENING`;
- 4 точечных источника (только на `high`, см. заметки): автоматы `(-20, 3, -20)`, ворота `(0, 3, -14)`, терраса `(16, 3, 3)`, ларёк `(-24, 2.6, -3)`.

**Шаги:**
- [x] Реализовать. Проверка глазами (`?dress` и облёт меню):
  - тёплый поздний закат;
  - здания узнаются: вывески читаются с площади;
  - нет висящих в воздухе предметов;
  - FPS не ниже, чем в пейнтболе, на том же компьютере.
- [x] Контроль: `npm run check` — чисто, `npm test` — 71/71, `npm run build` — собирается.
- Заметки:
  - В карту добавлены `CANOPY_POLES` и `CANOPY_POLE_H` (столбы навеса террасы — невидимые боксы коллизии).
  - `signTexture(text, bg, fg, w, h)` сам подбирает кегль под ширину (`fitFont`); вывески «Причала» не изменились.
  - Табло: `GateScreen.tick(time)` — обратный отсчёт между сообщениями `pb`; `JackpotBoard.flash(seconds)` — мигание при джекпоте.
  - У `LobbyWorld` есть ещё `setQuality(q)`, `resize(w, h)`, `render()`. Якорь автомата — середина передней грани у пола, модель строится назад по −z; пока стоят цветные заглушки (меняются в задаче 16).
  - Временная сцена набережной уже рисует `LobbyWorld`.
  - Настил — брусчатка (`paverTexture`, только для набережной); город: у воды дома в 2–4 этажа под двускатными крышами, на холмах реже и в сиреневой дымке, между домами рощи (кроны и стволы — два инстансных меша); дальний берег — две гряды-«кулисы» без освещения.
  - Скорость: при упоре в частоту экрана обе сцены дают ~160 кадров/с; время GPU на кадр 1920×1080 — пейнтбол 1,8–2,0 мс, набережная 2,5 мс, из них 0,7 мс — 4 точечные лампы. Поэтому лампы горят только на «высоком»; в «авто» гаснут, если разрешение уже пришлось снизить (`lobbyQuality(q, slow)`).

### Задача 15. Сцена набережной

**Файлы:** `client/lobby/scene.ts`.

Поведение:
- **Своя желейка:** `Predictor` на мире набережной (`canFire = false`), тики 60 Гц, `encodeInputs(..., epoch)`.
- **Состояние с сервера:** из снимка — своё действие и аргумент (сущность со своим `id`); `hold = holdMask(действие)`; `SNAP_SELF_RESET` → `reset(self, ack, hold)`, иначе `reconcile(ack, self, hold)`. `Predictor` сам ведёт `hold` через `stepHeld` (тест `test/predict.test.ts`).
- **Чужие:** `RemoteTrack` + `Avatar` (`gun: false`). Наряд из `lroster` и `outfitOf`, действие из снимка → `setAction`.
- **Камера:**
  - обычная: `cameraRig(поза, yaw, pitch, RIG_LOBBY, 0, world, cam, zoom)`, колесо — `zoom` 2–6;
  - действие 6 — фиксированная камера у автомата: позиция `(mx + 0.9, 1.9, −22.7 + 1.6)`, взгляд на барабаны `(mx, 1.35, −23.7)`;
  - действие 5 — облёт вокруг желейки мышью;
  - действие 8 — камера перед желейкой (как зеркало), мышь отпущена, открыта примерочная.
- **Подсказка «E — …»:** ближайший предмет в радиусе `r`, впереди (`dot > 0.2`) или ближе 1 м. E → `use {id}`.
- **У автомата:**
  - ЛКМ или пробел → `spin`;
  - пробел не уходит в прыжок: в тике ввода в этом режиме снимается `BTN_JUMP`;
  - W/A/S/D — встать (сервер освобождает сам);
  - подсказка «ЛКМ / пробел — крутить · ставка N · шаг — отойти».
- **Эмоции:** клавиши 1–4 → `emote`.
- **Tab** — список «кто где».
- **События:**
  - облачка чата — сообщения `chat` с `room 'lobby'` → `avatar.say`;
  - `lev splash` → брызги и звук;
  - `pb` → экран склада;
  - `honor` → доска почёта;
  - `pool` → табло;
  - `slotSpin` → автоматы (задача 16).
- **Режим меню** (не вошли): облёт по кругу радиусом 34 м на высоте 14 м, взгляд в `(0, 3, -6)`.
- **Отладка `?dress`:** ряд желеек со всеми вещами у `spawn`.

**Шаги:**
- [x] Реализовать.
- [x] Проверка в двух окнах:
  - ходьба плавная, без рывков (`corrections` не растут);
  - другой игрок виден и интерполируется;
  - облачка появляются;
  - эмоции видны второму окну;
  - сесть и встать работает;
  - падение в воду возвращает на площадь;
  - ворота переводят в пейнтбол и обратно (появляешься у ворот).
- [x] Контроль: `npm run check` — чисто, `npm test` — 72/72, `npm run build` — собирается.
- Заметки:
  - Файлы сцены: `client/lobby/camera.ts` (`LobbyCamera`: `follow` — за спиной и облёт сидящего, `fixed` — автомат, `mirror` — примерочная; между режимами плавный переход 0,5 с), `client/lobby/hud.ts` (`LobbyHud`: подсказка, эмоции 1–4, служебная строка и временная карточка примерочной — её заменит задача 17). `client/render/dress.ts` переехал в `client/lobby/dress.ts`: ряд желеек стоит у `spawn` в настоящем `LobbyWorld`.
  - Камера за спиной: `RIG_LOBBY = { back: 4.2, side: 0, up: 0.15 }` (было 3.6 / 0 / 0.6 — желейка выходила низко и крупно).
  - Камера у автомата: из `(mx + 0.35, 3.0, −23.7 + 3.2)` на `(mx, 1.3, −23.7)`, поле зрения 46°. Вид сбоку из плана закрывал барабаны головой; сверху-сзади барабаны видны над шапкой.
  - Камера примерочной: в 1,9 м перед желейкой (дальше — стена ларька с зеркалом), на высоте 1,2 м, взгляд на 0,72 м, сдвиг 0,72 м (желейка левее панели), поле зрения 68° — иначе желейка не влезает целиком.
  - Ввод: `Input.onUse(mouse)` — E и ЛКМ, что делать решает сцена (у автомата ЛКМ крутит, в остальных местах ЛКМ ничего не делает). `SceneDeps.wantPointer()` — после примерочной снова захватить мышь, а если браузер не дал — пауза с кнопкой. `RemoteTrack.clear()` — при скачке чужой желейки больше чем на 4 м (вода, телепорт) история забывается, чтобы она не проезжала через полкарты.
  - Детерминизм: движение больше не зовёт `Math.sin/cos` — их результат в Chrome и Node расходится в последнем знаке, и предсказание поправлялось почти на каждом снимке (глазу не видно, но `corrections` росли). Теперь `sinCos` из `shared/math.ts` (ряды на +, −, ×, тест в `test/sim.test.ts`): ходьба, прыжки и рывки — 0 поправок. Выход из примерочной по «Готово»/Esc даёт ровно одну поправку без сдвига: сервер отпускает «сидение» раньше, чем клиент об этом узнаёт.
  - Второе окно проверялось тестовым ботом (второй игрок по WebSocket, скрипт во временной папке, в проект не входит): интерполяция плавная (средняя скорость 8,4 м/с = `RUN_SPEED`), облачко держится 6 с, взмах — 3 с, танец — до первого шага.

### Задача 16. Автоматы: модели, барабаны, эффекты, табло

**Файлы:** `client/lobby/slots3d.ts`, `client/lobby/fx.ts`, `client/audio.ts`.

**Интерфейсы:**

```ts
export class SlotMachines3D {
  constructor(world: LobbyWorld, sound: Sound, fx: LobbyFx);
  onSpin(msg: { m: number; id: number; reels: number[]; win: number; jackpot: boolean }, isMine: boolean, pullerAvatar: Avatar | null): void;
  update(dt: number, time: number, camPos: THREE.Vector3): void;
  setOccupied(m: number, occupied: boolean): void;
}
export class LobbyFx {
  constructor(scene: THREE.Scene, quality: string);
  coins(x: number, y: number, z: number, count: number): void;       // инстансные монеты с отскоком
  floatText(x: number, y: number, z: number, text: string, color: string): void;
  fireworks(center: THREE.Vector3, bursts: number): void;           // только при джекпоте
  splash(x: number, z: number): void;
  update(dt: number): void;
}
Sound: + coin(pos), coins(pos, n), siren(), firework(pos), slotSpinStart(pos), reelStopAt(i, pos), slotWinAt(pos, big)
```

Модель автомата:
- корпус 1,0 × 1,9 × 0,8 м с полукруглым верхом, цвет по номеру: красный, синий, зелёный, фиолетовый, золотой;
- окно с 3 барабанами: цилиндры `r 0.16`, ширина 0,18, ось X;
- лента символов на холсте: 12 позиций, у каждого барабана своя перестановка 6 символов × 2;
- лампочки по контуру фасада — инстансы с излучением;
- рычаг справа;
- табличка «ПЯТАК · 5»;
- лоток монет.

Анимация по `slotSpin`:
- барабан i крутится с `t0`;
- останавливается в `REEL_STOP_MS[i]` на позиции символа `reels[i]` с перелётом и отскоком 6°;
- угол движется монотонно;
- на `SPIN_MS` — итог:
  - выигрыш: монеты (`min(40, 6 + mult·2)`), всплывающее `+win`, лампочки бегут 2 с, звон;
  - проигрыш: короткое затухание ламп;
  - джекпот: сирена, салют (8 залпов над `(−20, 12, −10)`), все автоматы мигают 4 с, табло мигает, крупная надпись в центре экрана «ДЖЕКПОТ! <ник> +<win>» (DOM, 4 с).
- Звуки в пространстве — от автомата. Свой автомат — без затухания по расстоянию.

**Шаги:**
- [x] Реализовать.
- [x] Проверка:
  - два окна; в одном крутим — второе видит барабаны, монеты и слышит;
  - баланс меняется после остановки барабанов, а не раньше;
  - `DEV_RIG=777 npm run dev` → джекпот: салют, сирена, строка в чате через 2,4 с, корона выдана.
- [x] Контроль: `npm run check` — чисто, `npm test` — 72/72, `npm run build` — собирается.
- Заметки:
  - Файлы сверх плана:
    - `client/lobby/hud.ts` + `client/styles.css` — `LobbyHud.showJackpot(nick, win)`: «ДЖЕКПОТ!» и «<ник> срывает N 🪙», 5,5 с; ник вставляется только как текст;
    - `client/lobby/scene.ts` — подключение: `slotSpin` → `slots.onSpin`, огни занятых автоматов, `slots.reset()` и `fx.clear()` при входе и выходе (иначе вращение, начатое без нас, догнало бы монетами и звуком по возвращении);
    - `client/lobby/world.ts` — заглушки автоматов заменены пустыми якорями, модели строит `slots3d`;
    - `client/main.ts` — шрифт Rubik 700/900 ждём для «Аб7»: кириллица и цифры у него в разных файлах, а таблички и символы рисуются на холсте один раз.
  - Отступления от интерфейса:
    - у `LobbyFx` нет `splash` — брызги остались в общем `Effects`, как в пейнтболе;
    - `coins(x, y, z, count, fx = 0, fz = 1)` — плюс направление;
    - добавлены `LobbyFx.fountain(x, y, z, seconds)`, `LobbyFx.clear()`, `SlotMachines3D.reset()`, `SlotMachines3D.onJackpot`.
  - Сверх плана по виду:
    - фонтаны искр по бокам автомата: крупный выигрыш (×20 и больше) — 1,6 с, джекпот — 4 с. Сорвавший джекпот сидит под крышей павильона и салюта над площадью не видит;
    - у джекпота 90 монет и нет всплывающего «+N» — сумма на крупной надписи;
    - монеты — жетоны радиусом 5 см (настоящего размера за пару метров не видно), летят веером в стороны: прямо вперёд их заслонял игрок у автомата;
    - «+N» всплывает с 2,08 м на 0,42 м: из камеры у автомата прежние 2,2 + 0,7 м уходили за край экрана;
    - задний короб до стены — цвет корпуса, только темнее: чёрный выглядел дырой;
    - неподвижное у всех пяти автоматов склеено в 8 мешей; отдельно — 15 барабанов, 5 рычагов, лампочки (один инстансный меш и ореолы точками).
  - Проверено:
    - второй игрок — тестовый бот, дошёл до «Копеечки» и крутил каждые 3,2 с. Браузер видел каждое вращение: ник, символы, рычаг дёргает желейка бота, автомат «занят» (огни ровные). Барабаны встают ровно на присланные символы — проверено по углам, ошибка 0;
    - звуки у чужого автомата: рычаг и мотор, трещотка (36 щелчков), остановки на 1,2 / 1,7 / 2,2 с, монеты, трель и сирена на 2,4 с, хлопки салюта по залпам. Проверено, что вызываются, на слух — не проверялось;
    - баланс: ставка списывается сразу (−10), выигрыш показывается на 2,4 с вместе с остановкой;
    - `DEV_RIG=777`: на 2416 мс — крупная надпись и строка «🎰 ДЖЕКПОТ! Тестер срывает 1200 🪙 на автомате «Червонец» и забирает «Корона»!», баланс +1200, корона в `owned`. Чужой джекпот с площади — салют над павильоном, табло сброшено на 1000;
    - первый джекпот после загрузки страницы — один кадр 18 мс, остальные не длиннее 12 мс.

### Задача 17. Примерочная

**Файлы:** `client/ui/wardrobe.ts`, `client/styles.css`.

Поведение:
- Панель справа, вкладки: Цвет, Узор, Глаза, Шапка, Аксессуар.
  - «Цвет» — 16 образцов цвета тела.
  - «Узор» — сетка узоров + 16 образцов второго цвета.
- Карточка вещи: название, значок уровня, цена или «есть» или «бесплатно» или «джекпот» (замок).
- Клик по своей вещи → `outfit` сразу. Предпросмотр на своей желейке мгновенный; если сервер вернул другое (`me`) — принимается ответ сервера.
- Клик по чужой (продажной) вещи → примерка на желейке (без отправки) + кнопка «Купить за N 🪙». Не хватает — кнопка неактивна с текстом «Не хватает N».
- Закрыть — крестик или Esc → `unuse`, наряд = `me.outfit`.

**Шаги:**
- [x] Реализовать.
- [x] Проверка:
  - купить панаму → жетоны −60, панама на желейке и у второго окна;
  - закрыть примерочную с примеренным, но не купленным цилиндром → цилиндр снят.
- [x] Контроль: `npm run check` чисто, `npm test` 72/72, `npm run build` собирается.

**Заметки по выполнению (задача 17):**
- Ещё файлы, кроме `wardrobe.ts` и стилей:
  - `client/lobby/scene.ts` — панель создаётся в корне интерфейса набережной; открывается и закрывается вместе с действием «примерочная»; свой наряд из сети (`outfitOf`, состав) в примерочной не перебивает выбранное;
  - `client/app.ts` — сообщение `me` теперь передаётся и сцене;
  - `client/lobby/hud.ts` и стили — убрана временная карточка «Скоро здесь…».
- Отличия от описания:
  - наряд шлётся не чаще раза в 300 мс (сервер принимает 5 в секунду): быстрые клики склеиваются, последний всё равно уходит;
  - ответ сервера, не совпавший с последним отправленным, первые 1,5 с считается ответом на прошлый клик и не трогает наряд — иначе желейка «мигает» назад;
  - перед выходом (Esc, крестик, «Готово», шаг) недосланный наряд уходит сразу: стоя сервер его уже не примет;
  - при закрытии на желейке остаётся наряд, отправленный серверу, а не прошлый `me.outfit` — без мигания, пока идёт ответ;
  - вещи с джекпота и особые тоже можно примерить; кнопка неактивна: «Только с джекпота 🎰» или «Выдаёт игра»;
  - после нажатия «Купить» кнопка до ответа показывает «Покупаем…» (до 2,5 с: отказ приходит только всплывашкой);
  - отдельной строки с жетонами в панели нет — их видно в общем счётчике прямо над ней.
- Проверено в браузере (местный сервер, второе окно — бот, записывающий `outfitOf`):
  - панама: «Купить за 60 🪙» → жетоны 1275 → 1215, всплывашка «Куплено: Панама», панама надета, карточка «✓ есть», бот получил наряд с панамой;
  - цилиндр примерен (кнопка «Купить за 400 🪙»), Esc → снят, на сервер ушло только `unuse`; бот цилиндра не видел;
  - три цвета подряд за 160 мс → два сообщения, итог у сервера — последний цвет, желейка назад не мигала;
  - клик по цвету и сразу шаг → недосланный цвет ушёл до того, как желейка встала;
  - кнопка: «Не хватает 30 🪙» (при 30 жетонах, неактивна), «Выдаёт игра» у колпака, «Только с джекпота 🎰» у золота; своя корона надевается сразу;
  - экраны 800×600 и 1280×800: желейка левее панели целиком; длинные названия переносятся по словам;
  - наряд тестовой желейки вернул как было (покупка панамы осталась в её профиле на местном сервере).

### Задача 18. Пейнтбол от третьего лица на клиенте

**Файлы:** `client/paintball/scene.ts`, `client/paintball/hud.ts`, `client/render/viewmodel.ts` (удалить), `client/input.ts`.

Поведение:
- **Камера:**
  - плечо `shoulder ∈ {+1, −1}` (Q переключает), плавный переход `sideSmooth`;
  - `adsT` плавно;
  - параметры — смесь `RIG_PB` и `RIG_PB_ADS`;
  - `cameraRig(поза, input.yaw + recoilY, input.pitch + recoilP, rig, sideSmooth, collision, cam)`;
  - `cam.rotation = (pitch + recoilP + тряска, yaw + recoilY + тряска, 0, 'YXZ')`.
- **Ввод:** `buttons |= shoulder < 0 ? BTN_SHOULDER : 0`.
- **Своя желейка:** видна, в наряде и с поясом команды; скрыта, если камера ближе 0,9 м.
- **`localShot`:**
  - цели — интерполированные живые противники;
  - `tpsShotDir(...)` → луч из глаз по миру и целям → конец;
  - шарик вылетает из `localAvatar.muzzle()`.
- **Блокировка прицела:** каждый кадр `aimPoint` + луч глаза → `P`. Если мир ближе `|P − глаза| − 0.3` — крестик блокировки в экранной проекции точки (`hud.setBlocked(x, y, on)`).
- **Прицел:** при прицеливании поле зрения в 1,25 раза уже.
- **Наряды и команды:** чужим — `setOutfit(o)` из состава, `setTeam(team)`.
- **Раунд и выход:**
  - `pbReward` → строка в финальном окне «+37 жетонов: раунд 10 · сбитые 12 · победа 15»;
  - пауза → «Выйти на набережную» → `leave`.

**Шаги:**
- [x] Реализовать, удалить вид от первого лица.
- [x] Проверка в браузере:
  - попадание по боту в центре прицела засчитывается (хитмаркер);
  - Q переносит камеру на другое плечо;
  - камера у стены не проходит сквозь неё;
  - угол контейнера у лица → крестик блокировки;
  - наряд виден на себе и на других;
  - конец раунда показывает жетоны, баланс вырос.
- [x] Контроль (включая тесты задач 7–8): `npm run check` чисто, `npm test` 72/72, `npm run build` собирается.

**Заметки по выполнению (задача 18):**
- Ещё файлы, кроме указанных:
  - `client/paintball/match.ts` — основная часть: камера, плечо, выстрел, крестик блокировки, своя желейка, строка жетонов; `scene.ts` только собирает зависимости;
  - `client/styles.css` — крестик блокировки и строка жетонов в финальном окне.
- Отличия от описания:
  - жетоны за раунд — только строкой в финальном окне, отдельной всплывашки нет; у сумм стоит плюс: «+27 жетонов: раунд +10 · сбитые +2 · победа +15» — без плюса «сбитые 2» читалось как «двое сбитых»;
  - кнопка в паузе осталась прежней — «На набережную» (шлёт `leave`);
  - в карточке патронов подсказка «R — перезарядка · Q — плечо»;
  - крестик блокировки — белый косой крест с тёмной обводкой и красным свечением: красный терялся на красной желейке;
  - при прицеливании крестик прицела не прячется, а сжимается: мушки от третьего лица нет;
  - тряска камеры, как и раньше, чуть наклоняет её вбок;
  - убрано лишнее: зависимость `toasts` у матча и неиспользуемые `lookDX/lookDY` во вводе.
- Проверено в браузере (местный сервер, боты):
  - камера на 0,6 м вбок и 2,9 м назад; своя желейка видна — в наряде и с поясом команды;
  - Q: плечо переходит плавно (на полпути −0,46), камера встаёт на −0,6 м;
  - 7 выстрелов по боту → 6 хитмаркеров; концы выстрелов у клиента и сервера совпали с точностью до 4 см (промах — цель уже исчезла на сервере);
  - у стены камера подтягивается (1,38 м от желейки вместо 2,9) и сквозь контейнер не проходит;
  - угол контейнера перед лицом → крестик блокировки в точке, куда на самом деле попадёт шарик;
  - у всех 7 ботов наряд на желейке совпал с составом от сервера;
  - конец раунда: «Победа!», строка «+27 жетонов: раунд 10 · сбитые 2 · победа 15» (до добавления плюсов), баланс 1237 → 1264; раундом раньше (остался один, значит, лучший) +22: 1215 → 1237;
  - после проверок вернул ботов: `/bots 4`.

### Задача 19. Выкладка и документация

**Файлы:** `deploy/game-opus.service`, `deploy/install.sh`, `deploy/smoke.ts`, `deploy.sh`, `deploy/game.nginx.conf`, `../server/nginx/tired.solutions.conf`, `README.md`, `docs/design.md`, `../server/README.md`.

- [x] Служба: `StateDirectory=game-opus`, `Environment=DATA_DIR=/var/lib/game-opus`.
- [x] `install.sh`: `node deploy/smoke.ts ws://127.0.0.1:5190/ws https://game.tired.solutions "$(cat /var/lib/game-opus/smoke-token 2>/dev/null || true)"`.
- [x] `smoke.ts`: аргументы `url`, `origin`, `token`.
  - Отправить `hello {v, key: случайный, smoke: token}`.
  - Успех = пришли `me`, `scene` и двоичный снимок.
  - Без токена — ошибка «нет токена проверки».
- [x] `deploy.sh`: `BUSY = h.busy ?? h.humans ?? 0`; текст «Сейчас в пейнтболе: N…».
- [x] nginx: `proxy_set_header X-Real-IP $remote_addr;` в `/ws` — в обоих файлах. На сервер — только после «да» владельца.
- [x] Проверить `smoke.ts` локально против `npm run dev` (токен из `data/smoke-token`).
- [x] Документация:
  - README: что есть, управление, `DATA_DIR`, `DEV_RIG`, профили и коды;
  - design.md: устройство Hub и комнат, протокол v2, хранилище;
  - server/README: где лежат данные и копии, как смотреть банк и профили, перезапуск без потери.
- [x] Контроль: `npm run check && npm test && npm run build`.

**Заметки по выполнению (задача 19):**
- На момент задачи 19 на сервер ничего не загружалось. Строка `X-Real-IP` есть в обоих файлах, блок игры в них совпадает целиком; блок `/ctxai/` не тронут.
- **Выложено 01.10.2026** с «да» владельца: сначала nginx (на сервере отличалась только строка `X-Real-IP`, прежний файл — в `/root/nginx-backups/`), потом `deploy.sh` — релиз `20261001-100857`, проверочный клиент зашёл. Пометка в `server/README` заменена.
- Отличия от описания:
  - в службе ещё `StateDirectoryMode=0700`: в папке профили, и чужим пользователям сервера её не видно;
  - `smoke.ts` различает ошибки: «нет токена проверки» (не подключается вовсе), «токен проверки не подошёл» (сервер ответил «нужен ник» — профиль при этом не создаётся, потому что ника в `hello` нет), «нет профиля», «не пустило в комнату», «нет снимков мира»;
  - пустой аргумент `smoke.ts` берёт значение по умолчанию (`||`, а не `??`);
  - в `deploy.sh` пояснено, почему ждём только пейнтбол: с набережной клиенты переподключатся сами;
  - в `server/README` вверху пометка: выпуск 1 и строка nginx ещё не выложены — убрать после выкладки;
  - в README добавлена команда локальной проверки `smoke.ts`; в design.md — разделы про хаб, профили и ограничения частоты, автоматы, хранилище, прицел от третьего лица и протокол v2; карта файлов переписана под новую раскладку.
- Проверено локально (`npm run dev`):
  - с токеном → `ok: … профиль, комната и снимок мира (125 байт)`, код выхода 0;
  - без токена → «нет токена проверки»; с чужим токеном → «токен проверки не подошёл», нового профиля в журнале нет; с чужого Origin → `HTTP 403` (код выхода 1 во всех трёх);
  - команда из `server/README` для банка и профилей отработала на местном `data/state.json`;
  - `sh -n` для `install.sh` и `deploy.sh` — без ошибок.
- Контроль: `npm run check` чисто, `npm test` 72/72, `npm run build` собирается.

### Задача 20. Итоговая проверка

- [x] Чистый запуск `npm run dev`, два окна (обычное + инкогнито), весь путь:
  1. вход;
  2. бонус;
  3. прогулка;
  4. эмоции, чат, облачка;
  5. автомат (выигрыш и проигрыш);
  6. примерочная (покупка);
  7. пейнтбол от третьего лица (попадания, награда);
  8. возврат;
  9. перезапуск сервера с автопереподключением.
- [x] Сборка `npm run build` + `npm start`: то же на собранной версии, `/health`.
- [x] Консоль браузера без ошибок, FPS в строке статистики не ниже 60 на этом Маке.
- [x] Отчёт владельцу простыми словами: что сделано, как проверить, что просим разрешить (выкладка и строка nginx).

**Заметки по выполнению (задача 20):**
- Вместо окна инкогнито — второй адрес: `localhost:5190` (Тестер) и `127.0.0.1:5190` (Пончик). У адресов разные хранилища браузера, значит, и разные ключи устройства. Данные — отдельная чистая папка (`DATA_DIR` во временной папке), рабочий `data/` не тронут.
- Разработка (`npm run dev`):
  1. вход: два новых профиля; со старым ключом чистый сервер ответил «Сервер тебя не узнал — впиши ник ещё раз»;
  2. бонус: в день создания профиля его нет (так задумано), поэтому вчерашняя дата вписана в профиль вручную → после перезапуска «Ежедневный бонус: +50 🪙», 69 → 119;
  3. прогулка, 4. танец и облачко чата — второй игрок всё видит;
  5. автоматы (Пончик): 7 проигрышей и выигрыш ×20 (три якоря), 100 → 92 → 112; ставка списывается сразу, выигрыш — через 2,4 с; о выигрыше написано в чате у Тестера;
  6. примерочная (Тестер): ушанка за 60, 100 → 40, всплывашка; Пончик видит ушанку;
  7. пейнтбол: 15 попаданий (9 в голову), наряд виден в игре; победа — «+29 жетонов: раунд +10 · сбитые +4 · победа +15», 40 → 69;
  8. возврат через паузу «На набережную» — у ворот склада;
  9. перезапуск: по сигналу остановки сервер записал состояние (Тестер 69 с ушанкой, Пончик 110), клиенты показали «Сервер обновляется — Переподключаемся через 5 с…». Вкладка Пончика переподключилась сама. Вкладку Тестера перезагрузил Vite: в разработке он обновляет страницу, когда сервер возвращается, а после перезагрузки нужно нажать «Играть». Поэтому переподключение отдельно проверено на сборке.
- Сборка (`npm run build` + `npm start`, номер сборки 57bbe30025df):
  - открытые вкладки после переподключения сами перезагрузились под новую сборку: номер сборки сменился, так и задумано;
  - вход, автомат (проигрыш на «Червонце», 119 → 109), примерочная (ушанка на желейке), пейнтбол: 2 сбитых бота, `/health` в раунде — `busy: 1, paintball: 1, lobby: 1`; возврат на набережную; награды нет — сыграно меньше минуты, так и задумано;
  - перезапуск: сигнал остановки → «Сервер обновляется»; сервер поднят снова → Тестер вернулся через 3 с, Пончик (фоновая вкладка) тоже; страницы не перезагружались, жетоны и вещи на месте.
- Найдено и исправлено: банк джекпота копил 5 % ставки дробями, и двоичная погрешность (1000 + 20 × 0,05 = 1000,9999…) заставляла табло показывать 1000 вместо 1001, а на границе джекпот мог недоплатить жетон. Теперь `poolAfterStake` (`shared/slots.ts`) хранит банк с точностью до сотых; тест в `test/slots.test.ts`, строка в design.md. На сборке после исправления табло показало 1001.
- Консоль: ошибок кода нет — только сообщения браузера о неудачном подключении, пока сервер был нарочно выключен.
- FPS: 165 (частота экрана) и на набережной, и в пейнтболе.
- Контроль: `npm run check` чисто, `npm test` 73/73, `npm run build` собирается; номер сборки клиента не изменился — исправление только на сервере.
- После проверки снова запущен `npm run dev` на обычном `data/`. Отчёт владельцу — в чате 01.10.2026.
