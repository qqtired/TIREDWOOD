// Набережная: действия игроков (байт hp в снимке), параметры комнаты и шаг «сидя».
import { TICK_RATE } from './constants.ts';
import { BTN_BACK, BTN_DASH, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RIGHT, resetEvents, stepPlayer, type Input, type PlayerState, type StepEvents } from './sim.ts';
import type { CollisionWorld } from './world.ts';

export const ACT_NONE = 0;
export const ACT_WAVE = 1;
export const ACT_DANCE = 2;
export const ACT_TIRED = 3;
export const ACT_LAUGH = 4;
/** Сидит (аргумент — номер места) */
export const ACT_SIT = 5;
/** У автомата (аргумент — номер автомата) */
export const ACT_SLOT = 6;
/** За столом в дурака (выпуск 2) */
export const ACT_DURAK = 7;
/** В примерочной */
export const ACT_WARDROBE = 8;
/** «Дай пять» и обнимашки: аргумент — номер партнёра в снимке, 0 — позвал и ждёт ответа */
export const ACT_FIVE = 9;
export const ACT_HUG = 10;
/** С удочкой на мостках (аргумент — номер места рыбалки) */
export const ACT_FISH = 11;
/** «Press F to pay respects»: у статуи отдаёт честь (shared/respect.ts) */
export const ACT_RESPECT = 12;
/** В катере у причала, ждёт отплытия (аргумент — номер места); шаг — выйти. Катер — shared/boat.ts */
export const ACT_BOAT = 13;
/** Катер в поездке: сидит, его везёт сервер; выйти нельзя до причала */
export const ACT_RIDE = 14;
/** В кабинке колеса обозрения (аргумент — номер места, shared/wheel.ts): везёт сервер, выйти — только внизу */
export const ACT_WHEEL = 15;
/** В лодке Семёна «Удалая» у стоянки, ждёт отхода (аргумент — номер места); шаг — выйти. Лодка — shared/ferry.ts */
export const ACT_FERRY = 16;
/** «Удалая» в рейсе: сидит, везёт сервер; выйти нельзя до стоянки */
export const ACT_FERRY_RIDE = 17;

/** Помахать, «устал», смех — 3 с; танец — до первого шага */
export const EMOTE_TICKS = 180;

/** Жесты вдвоём по номеру (0 — «дай пять», 1 — обняться): действие, сколько длится вдвоём, тиков */
export const PAIR_ACTS = [ACT_FIVE, ACT_HUG] as const;
export const PAIR_TICKS = [Math.round(1.6 * TICK_RATE), Math.round(2.6 * TICK_RATE)] as const;
/** Приглашение живёт 5 с; позвать можно того, кто ближе 2 м и впереди, ответить — пока он ближе 2,5 м */
export const PAIR_ASK_TICKS = 5 * TICK_RATE;
export const PAIR_RANGE = 2;
export const PAIR_ACCEPT_RANGE = 2.5;
/** Совсем рядом (вплотную) — с любой стороны */
const PAIR_CLOSE = 0.9;
/** «Впереди» — в пределах ±60° от взгляда */
const PAIR_COS = 0.5;

export function isPair(action: number): boolean {
  return action === ACT_FIVE || action === ACT_HUG;
}

/**
 * Можно ли позвать желейку в (bx, by, bz), если сам стоишь в (ax, ay, az) и смотришь по yaw: ближе PAIR_RANGE
 * по горизонтали, на том же уровне и впереди (вплотную — с любой стороны). Так считают сервер и подсказка клиента.
 */
export function pairReach(ax: number, ay: number, az: number, yaw: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const d = Math.hypot(dx, dz);
  if (d > PAIR_RANGE || Math.abs(by - ay) >= 1) return false;
  if (d < PAIR_CLOSE) return true;
  return (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d >= PAIR_COS;
}

/** Действия, при которых желейка стоит на месте, пока не нажать движение (в поездке на катере и на колесе — и с ним не встать) */
export function isHeld(action: number): boolean {
  return (
    action === ACT_SIT || action === ACT_SLOT || action === ACT_WARDROBE || action === ACT_DURAK || action === ACT_FISH || action === ACT_BOAT ||
    action === ACT_RIDE || action === ACT_WHEEL || action === ACT_FERRY || action === ACT_FERRY_RIDE
  );
}

/** Едет: катер в поездке, кабинка колеса или лодка Семёна в рейсе — двигает сервер, встать нельзя */
export function isRiding(action: number): boolean {
  return action === ACT_RIDE || action === ACT_WHEEL || action === ACT_FERRY_RIDE;
}

/** Сидит в лодке Семёна: ждёт отхода или уже плывёт */
export function isFerry(action: number): boolean {
  return action === ACT_FERRY || action === ACT_FERRY_RIDE;
}

/** Сидит в катере: ждёт отплытия или уже плывёт */
export function isAboard(action: number): boolean {
  return action === ACT_BOAT || action === ACT_RIDE;
}

const WALK = BTN_FORWARD | BTN_BACK | BTN_LEFT | BTN_RIGHT;
/** Эмоцию прерывает любое движение, и рывок тоже: он двигает желейку */
export const STOP_EMOTE = WALK | BTN_JUMP | BTN_DASH;
/** Встать с места или выйти из примерочной: шаг или прыжок. Рывок (Shift) не поднимает — его жмут по привычке */
export const LEAVE_SEAT = WALK | BTN_JUMP;
/** Отойти от автомата или с места рыбалки: только шаг — пробел там крутит барабаны и забрасывает удочку */
export const LEAVE_SLOT = WALK;
/** В поездке на катере и на колесе встать нельзя: маска из бита за пределами 16 бит кнопок в протоколе — его не пришлёт ни один клиент */
export const RIDE_LOCK = 1 << 16;

/** Маска клавиш, которыми встают из действия (0 — не сидит). */
export function holdMask(action: number): number {
  if (action === ACT_SLOT || action === ACT_FISH) return LEAVE_SLOT;
  if (isRiding(action)) return RIDE_LOCK;
  return isHeld(action) ? LEAVE_SEAT : 0;
}

/**
 * Шаг игрока с учётом «сидения». hold — маска из holdMask (0 — свободен). Пока сидит и не нажата
 * заново клавиша из маски, стоит на месте: меняются только prevButtons (клавиша, зажатая ещё до того,
 * как сел, не поднимает). Возвращает новую маску: 0 — встал или и не сидел.
 * Так считают и сервер, и предсказание клиента — поэтому без расхождений.
 */
export function stepHeld(s: PlayerState, hold: number, inp: Input, w: CollisionWorld, canFire: boolean, seed: number, ev: StepEvents): number {
  if (hold !== 0 && (inp.buttons & ~s.prevButtons & hold) === 0) {
    resetEvents(ev);
    s.prevButtons = inp.buttons;
    return hold;
  }
  stepPlayer(s, inp, w, canFire, seed, ev);
  return 0;
}

export const LOBBY_CAPACITY = 64;
/** Круг «Старт» у гаража: кто в нём, проверяем раз в 6 тиков; отсчёт до гонки — 15 с */
export const KART_CHECK_EVERY = 6;
export const KART_COUNT_TICKS = 15 * TICK_RATE;
/** Снимки набережной — каждые 2 тика (30 в секунду) */
export const LOBBY_SNAP_EVERY = 2;
/** Минимальная задержка интерполяции чужих на набережной, тиков */
export const LOBBY_MIN_DELAY = 2.6;
/** Облачко над головой: до 60 символов, 6 с */
export const BUBBLE_CHARS = 60;
export const BUBBLE_MS = 6000;
