// «Банан за катером» (идея В-7 со страницы lab/ideas/, флаг сервера BANANA, нужна ISLE): своя лодка рыбака тянет
// надувной банан на троих. Хозяин за штурвалом цепляет банан клавишей B; садятся все желающие — E у банана (у стоянки,
// пока банан стоит). Водитель резко поворачивает — банан заносит, седоков клонит; седоки держатся на A/D. Упал —
// всплеск и 5 секунд на «E — обратно», иначе Гоша подбирает на стоянку. Кто дольше продержался — строкой в чат.
// Общее для сервера и клиента: правила и числа, шаг банана на тросе, шаг крена седока, строка в чат, сообщения.
// Сервер — server/lobby/banana.ts, клиент — client/boat/banana.ts, модель — client/assets/banana/ (исходник —
// tools/banana/). Оси как у лодок (shared/ownboat.ts): X — восток, Z — юг, yaw 0 — нос на север (−Z),
// вперёд — (−sin yaw, −cos yaw), вправо — (cos yaw, −sin yaw).
import { TICK_RATE } from './constants.ts';
import { ACT_BANANA } from './lobby.ts';
import { obPushOut } from './ownboat.ts';
import { BTN_LEFT, BTN_RIGHT } from './sim.ts';

/** Действие седока банана (байт hp в снимке, shared/lobby.ts): аргумент — лодка × 4 + место, +64 — в воде */
export { ACT_BANANA };
export const BN_SEATS = 3;
export const BN_SWIM = 64;

export function bnArg(boat: number, seat: number, swim = false): number {
  return boat * 4 + seat + (swim ? BN_SWIM : 0);
}

export function bnArgOf(arg: number): { boat: number; seat: number; swim: boolean } {
  return { boat: (arg & 63) >> 2, seat: arg & 3, swim: (arg & BN_SWIM) !== 0 };
}

// ------------------------------------------------------------ размеры (как в модели client/assets/banana/banana.glb)

/** Длина банана от кольца на носу до хвоста, м; середина — между носом и хвостом */
export const BN_LEN = 6;
export const BN_HALF = BN_LEN / 2;
/** Трос от кормы лодки до кольца на носу банана */
export const BN_ROPE = 9;
/** Места в осях банана (z — к хвосту от середины), верх сиденья над водой */
export const BN_SEAT_Z: readonly [number, number, number] = [-1.24, 0.26, 1.69];
export const BN_SEAT_Y = 0.7;
/** Упавший — в воде сбоку от своего места, м */
export const BN_SWIM_SIDE = 1.7;

// ------------------------------------------------------------ правила

/** Упал — 5 секунд на «E — обратно» (число владельца), потом — на берег */
export const BN_BACK_TICKS = 5 * TICK_RATE;
/** Сел или вернулся — 2 с держится крепко (не упасть сразу) */
export const BN_GRACE_TICKS = 2 * TICK_RATE;
/** Сесть: ближе 6,5 м к середине банана и банан почти стоит */
export const BN_BOARD_R = 6.5;
export const BN_BOARD_SPEED = 1.2;
/** Время «продержался» идёт, когда банан быстрее 2 м/с */
export const BN_RUN_SPEED = 2;
/** Прицепить или отцепить банан — на малом ходу */
export const BN_HITCH_SPEED = 3;
/** Строка в чат — если лучший продержался хотя бы 5 с; позвать на банан в чат — раз в минуту на лодку */
export const BN_ANNOUNCE_MIN = 5 * TICK_RATE;
export const BN_CALL_EVERY = 60 * TICK_RATE;

// ------------------------------------------------------------ банан на тросе

/** Банан на воде: середина, курс, скорость, сглаженный боковой «толчок» (+ — седоков клонит вправо по ходу банана) */
export interface BnPose {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  lat: number;
}

export function makeBnPose(): BnPose {
  return { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, lat: 0 };
}

/** Поза лодки: середина, курс и длина корпуса (трос — от кормы) */
export interface BnBoat {
  x: number;
  z: number;
  yaw: number;
  length: number;
}

/** Где корма лодки (крюк троса) */
export function bnStern(boat: Readonly<BnBoat>, out = { x: 0, z: 0 }): { x: number; z: number } {
  const h = boat.length / 2;
  out.x = boat.x + Math.sin(boat.yaw) * h;
  out.z = boat.z + Math.cos(boat.yaw) * h;
  return out;
}

/** У кормы стоящей лодки нос банана — в 0,8 м: трос ослаблен, до банана дотягиваются с конца пальца стоянки */
export const BN_DOCK_GAP = 0.8;
/** У стоянки банан подтягивают к корме не быстрее 1,1 м/с (на нём уже можно сидеть — он медленнее BN_BOARD_SPEED) */
const PULL_SPEED = 1.1;

/** Прицепили: банан у кормы по оси лодки (трос ослаблен — лодка натянет его, отойдя на 8 м), стоит */
export function bnHitch(b: BnPose, boat: Readonly<BnBoat>): void {
  bnDockSpot(boat, b);
  b.vx = b.vz = 0;
  b.lat = 0;
}

/** Где банан стоит у кормы лодки: середина и курс */
export function bnDockSpot(boat: Readonly<BnBoat>, out: { x: number; z: number; yaw: number }): { x: number; z: number; yaw: number } {
  const s = bnStern(boat, _s);
  const back = BN_DOCK_GAP + BN_HALF;
  out.x = s.x + Math.sin(boat.yaw) * back;
  out.z = s.z + Math.cos(boat.yaw) * back;
  out.yaw = boat.yaw;
  return out;
}

/** Лодка у берта стоянки: банан плавно подтягивают к корме (после заезда он мог остаться в 10 м), толчок гаснет */
export function bnDockPull(b: BnPose, boat: Readonly<BnBoat>, dt: number): void {
  if (dt <= 0) return;
  const t = bnDockSpot(boat, _spot);
  const dx = t.x - b.x;
  const dz = t.z - b.z;
  const d = Math.hypot(dx, dz);
  const k = d > 1e-6 ? Math.min(d, PULL_SPEED * dt) / d : 0;
  b.x += dx * k;
  b.z += dz * k;
  b.vx = (dx * k) / dt;
  b.vz = (dz * k) / dt;
  let dy = t.yaw - b.yaw;
  dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
  b.yaw += dy * (1 - Math.exp(-1.5 * dt));
  b.lat -= b.lat * Math.min(1, 6 * dt);
}

const _spot = { x: 0, z: 0, yaw: 0 };

/** Вода гасит ход вдоль банана слабо, вбок — сильнее (банан скользит в повороте); курс тянется к тросу */
const DRAG_F = 0.55;
const DRAG_L = 1.6;
const YAW_K = 3.2;
/** Толчок: боковое ускорение / 9 м/с², сглаженное за 0,12 с */
const LAT_G = 9;
const LAT_TAU = 0.12;
const _s = { x: 0, z: 0 };
/** Ближе 0,6 м нос банана к корме не подходит (у стоянки он стоит в BN_DOCK_GAP = 0,8 м) */
const BUMP = 0.6;

/** Скорость банана, м/с */
export function bnSpeed(b: Readonly<BnPose>): number {
  return Math.hypot(b.vx, b.vz);
}

/**
 * Шаг банана за dt по позе лодки: инерция и вода, трос (не длиннее BN_ROPE от кормы до носа банана), курс — носом
 * к тросу. В резком повороте банан по инерции уходит по дуге шире лодки, и седоков клонит наружу — отсюда «lat».
 * Одинаково на сервере (тик) и на стенде lab/banana (кадр; там shore = false — у стенда своё море без берегов игры).
 */
export function bnStep(b: BnPose, boat: Readonly<BnBoat>, dt: number, shore = true): void {
  if (dt <= 0) return;
  const ovx = b.vx;
  const ovz = b.vz;
  // вода: вдоль и вбок по осям банана
  const fx = -Math.sin(b.yaw);
  const fz = -Math.cos(b.yaw);
  const rx = Math.cos(b.yaw);
  const rz = -Math.sin(b.yaw);
  const vf = (b.vx * fx + b.vz * fz) * Math.exp(-DRAG_F * dt);
  const vl = (b.vx * rx + b.vz * rz) * Math.exp(-DRAG_L * dt);
  const px = b.x;
  const pz = b.z;
  b.x += (fx * vf + rx * vl) * dt;
  b.z += (fz * vf + rz * vl) * dt;
  // берег, причалы, баркас — как у лодок: банан не заезжает на настил; до троса — трос сильнее (банан не застрянет
  // у мостка, пока лодка уходит: в худшем случае на миг заденет угол)
  if (shore) obPushOut(b, BN_LEN, 1.5);
  // трос: нос не дальше BN_ROPE от кормы
  const s = bnStern(boat, _s);
  const nx = b.x + fx * BN_HALF;
  const nz = b.z + fz * BN_HALF;
  const dx = s.x - nx;
  const dz = s.z - nz;
  const d = Math.hypot(dx, dz);
  const taut = d > BN_ROPE;
  if (taut) {
    const k = (d - BN_ROPE) / d;
    b.x += dx * k;
    b.z += dz * k;
  }
  // кранец: лодка задним ходом (отходит от стоянки) толкает банан перед кормой, а не проезжает сквозь него
  const bump = d < BUMP && d > 1e-6;
  if (bump) {
    const k = (d - BUMP) / d;
    b.x += dx * k;
    b.z += dz * k;
  }
  // скорость — по сдвигу (так трос передаёт банану ход лодки, а повороты — инерцию)
  b.vx = (b.x - px) / dt;
  b.vz = (b.z - pz) / dt;
  // курс: на тросе — носом к корме, без натяга — по ходу (медленно)
  const sp = Math.hypot(b.vx, b.vz);
  let want = b.yaw;
  if (taut || bump || d > BN_ROPE * 0.92) want = Math.atan2(-(s.x - b.x), -(s.z - b.z));
  else if (sp > 0.5) want = Math.atan2(-b.vx, -b.vz);
  let dy = want - b.yaw;
  dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
  b.yaw += dy * (1 - Math.exp(-(taut ? YAW_K : 1) * dt));
  if (b.yaw > Math.PI) b.yaw -= 2 * Math.PI;
  else if (b.yaw < -Math.PI) b.yaw += 2 * Math.PI;
  // толчок: ускорение вбок (по правой оси) — седоков клонит в обратную сторону
  const ax = (b.vx - ovx) / dt;
  const az = (b.vz - ovz) / dt;
  const ar = ax * Math.cos(b.yaw) + az * -Math.sin(b.yaw);
  const target = Math.max(-3, Math.min(3, -ar / LAT_G));
  b.lat += (target - b.lat) * (1 - Math.exp(-dt / LAT_TAU));
}

/** Место седока в мире: x, y (верх сиденья), z */
export function bnSeatWorld(b: Readonly<BnPose>, seat: number, waterY: number, out = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
  const lz = BN_SEAT_Z[seat] ?? 0;
  out.x = b.x + Math.sin(b.yaw) * lz;
  out.y = waterY + BN_SEAT_Y;
  out.z = b.z + Math.cos(b.yaw) * lz;
  return out;
}

/** Где в воде упавший: сбоку от места, в сторону крена (side +1 — вправо) */
export function bnSwimAt(b: Readonly<BnPose>, seat: number, side: number, out = { x: 0, z: 0 }): { x: number; z: number } {
  const lz = BN_SEAT_Z[seat] ?? 0;
  const k = side >= 0 ? BN_SWIM_SIDE : -BN_SWIM_SIDE;
  out.x = b.x + Math.sin(b.yaw) * lz + Math.cos(b.yaw) * k;
  out.z = b.z + Math.cos(b.yaw) * lz - Math.sin(b.yaw) * k;
  return out;
}

// ------------------------------------------------------------ седок: крен и A/D

/** Крен седока: ±1 — край («висит»), держится на краю 0,4 с — падает */
export const BN_EDGE_TICKS = Math.round(0.4 * TICK_RATE);
/** Толчок банана в крен, A/D (держаться), сам выпрямляется; заднего трясёт сильнее */
const PUSH = 1.2;
const HOLD = 1.4;
const RESTORE = 0.35;
const SEAT_MUL: readonly number[] = [0.9, 1, 1.15];

/** Наклон седока по кнопкам: D — вправо (+1), A — влево (−1), обе или ни одной — 0 */
export function bnLean(buttons: number): number {
  const l = (buttons & BTN_LEFT) !== 0;
  const r = (buttons & BTN_RIGHT) !== 0;
  return l === r ? 0 : r ? 1 : -1;
}

/** Волны: на ходу крен «гуляет» (у каждого места своя волна), на 12 м/с — до ±0,5 в секунду */
export function bnWave(tick: number, boat: number, seat: number, speed: number): number {
  const t = tick / TICK_RATE;
  const ph = boat * 2.31 + seat * 1.37;
  const sp = Math.min(1.4, speed / 12);
  return (Math.sin(t * 1.9 + ph) * 0.6 + Math.sin(t * 3.3 + ph * 2.1) * 0.4) * 0.5 * sp;
}

/** Седок на банане: крен −1…1, тиков на краю, сколько ещё держится крепко (после посадки) */
export interface BnRider {
  tilt: number;
  edge: number;
  grace: number;
}

export function makeBnRider(): BnRider {
  return { tilt: 0, edge: 0, grace: BN_GRACE_TICKS };
}

/**
 * Шаг крена седока за тик: толчок банана (lat) × место + волна + A/D − выпрямление. На малом ходу (банан медленнее
 * BN_RUN_SPEED) крен сам уходит и упасть нельзя. Возвращает true — упал (на краю дольше BN_EDGE_TICKS).
 */
export function bnRiderStep(r: BnRider, lat: number, lean: number, wave: number, seat: number, speed: number): boolean {
  const dt = 1 / TICK_RATE;
  if (speed < BN_RUN_SPEED) {
    r.tilt -= r.tilt * Math.min(1, RESTORE * 3 * dt);
    r.edge = 0;
    if (r.grace > 0) r.grace--;
    return false;
  }
  r.tilt += (Math.tanh(lat * 0.6) * PUSH * (SEAT_MUL[seat] ?? 1) + wave + lean * HOLD - r.tilt * RESTORE) * dt;
  const lim = r.grace > 0 ? 0.9 : 1;
  if (r.grace > 0) r.grace--;
  if (r.tilt >= lim) r.tilt = lim;
  else if (r.tilt <= -lim) r.tilt = -lim;
  if (Math.abs(r.tilt) >= 0.999) r.edge++;
  else r.edge = 0;
  return r.edge >= BN_EDGE_TICKS;
}

// ------------------------------------------------------------ итог заезда

/** Строка итога: ник и лучшее время без падения, тиков */
export interface BnResultRow {
  nick: string;
  best: number;
}

/** Тики → «0:48» */
export function bnClock(ticks: number): string {
  const s = Math.max(0, Math.floor(ticks / TICK_RATE));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Строка в общий чат после заезда: «🍌 Банан за лодкой «Волжанка» Tired: дольше всех продержался Tester7 — 0:48 · Tester8 0:31
 * · падений: 3». Лучший продержался меньше BN_ANNOUNCE_MIN — строки нет (null).
 */
export function bnChatLine(boatName: string, driver: string, rows: readonly BnResultRow[], falls: number): string | null {
  const sorted = [...rows].filter((r) => r.best > 0).sort((a, b) => b.best - a.best);
  if (!sorted.length || sorted[0].best < BN_ANNOUNCE_MIN) return null;
  const [top, ...rest] = sorted;
  const others = rest.slice(0, 4).map((r) => ` · ${r.nick} ${bnClock(r.best)}`).join('');
  const fl = falls > 0 ? ` · падений: ${falls}` : '';
  return `🍌 Банан за лодкой «${boatName}» ${driver}: дольше всех продержался ${top.nick} — ${bnClock(top.best)}${others}${fl}`;
}

// ------------------------------------------------------------ сообщения

/** Банан для всех (JSON, при смене): номер лодки; кто на местах (номер в снимке, 0 — свободно); до какого тика в воде (0 — нет) */
export interface BnView {
  i: number;
  s: [number, number, number];
  w: [number, number, number];
}

/** Позиции бананов: [лодка, x, z, курс, толчок, крен ×3, продержался ×3 (тиков)] на банан подряд */
export const BN_POS_N = 11;

export function bnPosPush(out: number[], boat: number, b: Readonly<BnPose>, riders: ReadonlyArray<BnRider | null>, held: readonly number[]): void {
  out.push(boat, rnd(b.x, 1000), rnd(b.z, 1000), rnd(b.yaw, 10000), rnd(b.lat, 100));
  for (let k = 0; k < BN_SEATS; k++) out.push(rnd(riders[k]?.tilt ?? 0, 100));
  for (let k = 0; k < BN_SEATS; k++) out.push(Math.round(held[k] ?? 0));
}

function rnd(v: number, k: number): number {
  return Math.round(v * k) / k;
}

/**
 * Сервер → клиент: bn — состав всех бананов (всем при смене и вошедшему; нет сообщения — флага нет) и их позиции;
 * bnPos — позиции бананов (ближним каждые 2 тика, дальним — каждые 30); bnFx — всплеск: упал (fall), вернулся (back),
 * спрыгнул (jump) — где и в какую сторону.
 */
export type BnServerMsg =
  | { t: 'bn'; k: number; b: BnView[]; pos: number[] }
  | { t: 'bnPos'; k: number; p: number[] }
  | { t: 'bnFx'; i: number; a: 'fall' | 'back' | 'jump'; seat: number; slot: number; x: number; z: number; side: number };

/**
 * Клиент → сервер: hitch — B у хозяина за штурвалом (прицепить или отцепить); board — E у банана лодки i;
 * e — E на банане (спрыгнуть; у причала — на берег) или в воде (обратно на своё место).
 */
export type BnClientMsg =
  | { t: 'bn'; a: 'hitch' }
  | { t: 'bn'; a: 'board'; i: number }
  | { t: 'bn'; a: 'e' };
