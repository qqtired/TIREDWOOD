// Э-2 «Четыре набора краскомётов» в пейнтболе (флаг сервера PAINT4, по умолчанию выключен — без него пейнтбол как раньше).
// Наборы: Маркер (как был), Брызгалка (быстрая, слабая вдаль), Лейка (веер вблизи, толкает — можно столкнуть с пирса),
// Лук (зажал — тянешь, отпустил — стрела летит дугой). У всех — ведёрко краски на G (бросок дугой, пятно на земле).
// Все числа — здесь. Один и тот же шаг оружия у сервера (истина) и в предсказании клиента: только целые тики и
// детерминированные хэши, как в shared/fortgun.ts (обёртка вокруг общего stepPlayer: огонь и перезарядку прячем, считаем свои).
//
// Поля PlayerState у наборов: ammo — патроны набора; fireCd — тиков до выстрела (у лука — пока натягивается следующая
// стрела); reloadT — перезарядка (у лука нет); bloom — у лука это натяжение в тиках 0…BOW_DRAW_TICKS (своего разброса
// от очереди у лука нет). Маркер и подобранная AWP идут прежним кодом sim.ts без обёртки.
// Толчок Лейки — короткий невольный рывок (dashT / dashX / dashZ уже есть в снимке своего игрока): предсказание
// переигрывает его бит в бит, а рывок самому на это время недоступен (sim.ts: новый рывок — только при dashT = 0).
import { DASH_SPEED, DT, RUN_SPEED, TICK_RATE } from './constants.ts';
import { grenadeLaunch, grenadeStep, type Grenade } from './fortgren.ts';
import { hashFloat } from './math.ts';
import {
  BTN_ADS, BTN_FIRE, BTN_RELOAD, DAMAGE_BODY, DAMAGE_HEAD, FALLOFF_END, FALLOFF_MIN, FALLOFF_START, FIRE_INTERVAL, MAG_SIZE,
  RELOAD_TICKS, SHOT_RANGE, shotDirection, type Input, type PlayerState, type StepEvents,
} from './sim.ts';
import type { CollisionWorld, RayHit } from './world.ts';

export const KIT_MARKER = 0;
export const KIT_SQUIRT = 1;
export const KIT_CAN = 2;
export const KIT_BOW = 3;
export const KIT_COUNT = 4;

/** G отпустили — бросить ведёрко (клиент ставит бит ровно на один вход; держишь G — только дуга на экране) */
export const BTN_PB_BUCKET = 2048;

export interface KitSpec {
  /** id иконки (client/assets/ui/icons) и «чем» в ленте сбитых */
  id: 'marker' | 'squirt' | 'can' | 'bow';
  name: string;
  /** Карточка: чем хорош и в чём слабость — по строке */
  good: string;
  weak: string;
  /** Тиков между выстрелами (у лука — натянуть новую стрелу после выстрела) */
  interval: number;
  mag: number;
  reload: number;
  /** Урон шарика (у Лейки — одной капли веера) */
  body: number;
  head: number;
  /** Полный урон до [0] м, к [1] м — доля [2] */
  falloff: readonly [number, number, number];
  /** Дальше этого краска не долетает, м */
  range: number;
  /** Капель за выстрел (веер Лейки) и полуширина веера по горизонтали, рад */
  pellets: number;
  fan: number;
  spreadHip: number;
  spreadAds: number;
  moveHip: number;
  moveAds: number;
  airHip: number;
  airAds: number;
  bloom: number;
  bloomMax: number;
  kick: number;
  kickYaw: number;
  /** Полоски на карточке 0…1: урон за выстрел, темп, дальность */
  card: readonly [number, number, number];
}

/**
 * Баланс (здоровье 100, база — маркер: 20 в тело, 10 выстрелов в секунду, сбивает за 0,4 с на любой дистанции до 24 м):
 * - Брызгалка: 20 капель в секунду по 13 — в упор сбивает за 0,35 с (быстрее всех), магазин 50, разброс на бегу мал;
 *   слабость — дальность: к 20 м урон падает до трети, дальше 28 м струя не долетает.
 * - Лейка: 8 капель веером по 10 — в упор 80 (две порции — сбит, 0,6 с), целиться почти не надо и толкает;
 *   слабость — к 10 м остаётся пятая часть урона, дальше 14 м пусто, 5 порций и долгая перезарядка 2,2 с.
 * - Лук: натяжение 0,7 с, полная — 90 в тело и 153 в голову (сбивает с одной стрелы), стрела летит дугой без спада
 *   урона; слабость — темп (выстрел раз в ~1,1 с), стрелу видно и надо брать упреждение, натягивая — идёшь шагом.
 * - Маркер — без изменений: ровный на всех дистанциях, но ничем не лучший.
 */
export const KITS: readonly KitSpec[] = [
  {
    id: 'marker', name: 'Маркер', good: 'Ровный на любой дистанции', weak: 'Ничем не выделяется',
    interval: FIRE_INTERVAL, mag: MAG_SIZE, reload: RELOAD_TICKS, body: DAMAGE_BODY, head: DAMAGE_HEAD,
    falloff: [FALLOFF_START, FALLOFF_END, FALLOFF_MIN], range: SHOT_RANGE, pellets: 1, fan: 0,
    spreadHip: 0.0095, spreadAds: 0.0018, moveHip: 0.02, moveAds: 0.007, airHip: 0.032, airAds: 0.016, bloom: 0.0042, bloomMax: 0.026,
    kick: 0.0105, kickYaw: 0.0042, card: [0.45, 0.55, 0.8],
  },
  {
    id: 'squirt', name: 'Брызгалка', good: 'Самая быстрая, бей на бегу', weak: 'Вдаль слабеет, 28 м — предел',
    interval: 3, mag: 50, reload: 96, body: 13, head: 18, falloff: [7, 20, 0.3], range: 28, pellets: 1, fan: 0,
    spreadHip: 0.012, spreadAds: 0.006, moveHip: 0.008, moveAds: 0.004, airHip: 0.016, airAds: 0.01, bloom: 0.0012, bloomMax: 0.012,
    kick: 0.0035, kickYaw: 0.003, card: [0.3, 1, 0.35],
  },
  {
    id: 'can', name: 'Лейка', good: 'Веер в упор и толкает — столкни с пирса', weak: 'Только вблизи, долгая перезарядка',
    interval: 36, mag: 5, reload: 132, body: 10, head: 12, falloff: [3, 10, 0.2], range: 14, pellets: 8, fan: 0.13,
    spreadHip: 0.01, spreadAds: 0.006, moveHip: 0.006, moveAds: 0.004, airHip: 0.012, airAds: 0.008, bloom: 0, bloomMax: 0,
    kick: 0.045, kickYaw: 0.012, card: [0.85, 0.25, 0.15],
  },
  {
    id: 'bow', name: 'Лук', good: 'Зажми — тяни: полная стрела сбивает в голову', weak: 'Медленный, стрела летит дугой',
    interval: 24, mag: 1, reload: 0, body: 90, head: 153, falloff: [999, 1000, 1], range: SHOT_RANGE, pellets: 1, fan: 0,
    spreadHip: 0.0015, spreadAds: 0.0008, moveHip: 0.006, moveAds: 0.003, airHip: 0.02, airAds: 0.012, bloom: 0, bloomMax: 0,
    kick: 0.03, kickYaw: 0.004, card: [1, 0.15, 1],
  },
];

export function kitOf(k: number | undefined): number {
  return Number.isInteger(k) && (k as number) >= 0 && (k as number) < KIT_COUNT ? (k as number) : KIT_MARKER;
}

// ------------------------------------------------------------ лук

/** Полное натяжение, тиков (0,7 с) */
export const BOW_DRAW_TICKS = 42;
/** Отпустил раньше — стрела всё равно летит, но не слабее этой доли */
export const BOW_MIN_CHARGE = 0.2;
/** Скорость стрелы, м/с: без натяжения и полная */
export const ARROW_SPEED_MIN = 16;
export const ARROW_SPEED_MAX = 50;
export const ARROW_GRAVITY = 12;
/** Урон в тело: с минимальным натяжением и с полным; в голову — ×1,7 */
export const ARROW_BODY_MIN = 30;
export const ARROW_HEAD_MUL = 1.7;
/** Стрела летит не дольше 3 с */
export const ARROW_LIFE_TICKS = 3 * TICK_RATE;

export function bowCharge(drawTicks: number): number {
  return Math.max(BOW_MIN_CHARGE, Math.min(1, drawTicks / BOW_DRAW_TICKS));
}

export function arrowSpeed(charge: number): number {
  return ARROW_SPEED_MIN + (ARROW_SPEED_MAX - ARROW_SPEED_MIN) * charge;
}

export function arrowDamage(charge: number, head: boolean): number {
  const body = ARROW_BODY_MIN + (KITS[KIT_BOW].body - ARROW_BODY_MIN) * charge;
  return Math.round(head ? body * ARROW_HEAD_MUL : body);
}

export interface Arrow {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
}

/** Тик полёта стрелы: сдвиг по скорости с тяжестью; true — воткнулась в мир (точка и нормаль — в hit, позиция — там) */
export function arrowStep(a: Arrow, world: CollisionWorld, hit: RayHit): boolean {
  a.vy -= ARROW_GRAVITY * DT;
  const dx = a.vx * DT;
  const dy = a.vy * DT;
  const dz = a.vz * DT;
  const len = Math.hypot(dx, dy, dz);
  a.t++;
  if (len < 1e-7) return false;
  if (world.raycast(a.x, a.y, a.z, dx / len, dy / len, dz / len, len, hit, true)) {
    a.x += (dx / len) * hit.t;
    a.y += (dy / len) * hit.t;
    a.z += (dz / len) * hit.t;
    return true;
  }
  a.x += dx;
  a.y += dy;
  a.z += dz;
  return false;
}

// ------------------------------------------------------------ Лейка: веер и толчок

/** Толчок — от стольких капель в цель */
export const CAN_PUSH_MIN = 3;
/** Скорость толчка, м/с: от CAN_PUSH_MIN капель и от всего веера */
export const CAN_PUSH_MIN_SPEED = 5;
export const CAN_PUSH_MAX_SPEED = 12;
/** Толчок длится столько тиков (дальше — по инерции, в воздухе скорость сохраняется до приземления) */
export const CAN_PUSH_TICKS = 9;
/** Подскок при толчке, м/с: над водой остаётся ~0,3 с, чтобы рывком вернуться на пирс */
export const CAN_PUSH_LIFT = 3.2;

export function canPushSpeed(hits: number): number {
  if (hits < CAN_PUSH_MIN) return 0;
  const k = Math.min(1, (hits - CAN_PUSH_MIN) / (KITS[KIT_CAN].pellets - CAN_PUSH_MIN));
  return CAN_PUSH_MIN_SPEED + (CAN_PUSH_MAX_SPEED - CAN_PUSH_MIN_SPEED) * k;
}

/** Толкнуть игрока по горизонтали (dx, dz — направление) со скоростью speed: короткий невольный рывок с подскоком */
export function applyShove(s: PlayerState, dx: number, dz: number, speed: number): void {
  const l = Math.hypot(dx, dz);
  if (l < 1e-6 || speed <= 0) return;
  s.dashX = (dx / l) * (speed / DASH_SPEED);
  s.dashZ = (dz / l) * (speed / DASH_SPEED);
  s.dashT = CAN_PUSH_TICKS;
  if (s.vy < CAN_PUSH_LIFT) s.vy = CAN_PUSH_LIFT;
  s.grounded = 0;
  s.coyote = 0;
}

/**
 * Направление капли i веера вокруг (fx, fy, fz): равномерно по горизонтали ±fan, по вертикали — лёгкий хэш-разброс.
 * Детерминированно (seed, shot) — сервер считает попадания, клиент рисует свой веер туда же.
 */
export function fanDir(fx: number, fy: number, fz: number, i: number, n: number, fan: number, seed: number, shot: number, out: { dirX: number; dirY: number; dirZ: number }): void {
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz);
  if (rl < 1e-6) {
    rx = 1;
    rz = 0;
  } else {
    rx /= rl;
    rz /= rl;
  }
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const j1 = hashFloat(seed ^ 0x3a91, shot * 16 + i) - 0.5;
  const j2 = hashFloat(seed ^ 0x6c07, shot * 16 + i) - 0.5;
  const h = n > 1 ? (i / (n - 1) - 0.5) * 2 * fan + j1 * (fan / n) : 0;
  const v = j2 * fan * 0.3;
  let dx = fx + rx * h + ux * v;
  let dy = fy + uy * v;
  let dz = fz + rz * h + uz * v;
  const l = Math.hypot(dx, dy, dz);
  dx /= l;
  dy /= l;
  dz /= l;
  out.dirX = dx;
  out.dirY = dy;
  out.dirZ = dz;
}

// ------------------------------------------------------------ урон

/** Урон капли или шарика набора на расстоянии (до бонуса автомата) */
export function kitDamage(kit: number, dist: number, head: boolean): number {
  const g = KITS[kitOf(kit)];
  const base = head ? g.head : g.body;
  const [a, b, min] = g.falloff;
  if (dist <= a) return base;
  if (dist >= b) return base * min;
  return base * (1 - ((1 - min) * (dist - a)) / (b - a));
}

// ------------------------------------------------------------ ведёрко

/** Ведёрко снова в руке через 14 с; в начале раунда — полное */
export const BUCKET_CD_TICKS = 14 * TICK_RATE;
/** Радиус пятна и урон: в центре и на краю (за стеной — не достаёт) */
export const BUCKET_R = 3.2;
export const BUCKET_DMG = 60;
export const BUCKET_EDGE = 25;
/** Ведёрко летит не дольше 2,5 с */
export const BUCKET_LIFE_TICKS = 150;

export function bucketDamage(dist: number): number {
  if (dist >= BUCKET_R) return 0;
  return BUCKET_DMG - (BUCKET_DMG - BUCKET_EDGE) * (dist / BUCKET_R);
}

/** Бросок ведёрка — как граната крепости: с руки по взгляду и чуть выше прицела */
export function bucketLaunch(px: number, py: number, pz: number, yaw: number, pitch: number, world: CollisionWorld, hit: RayHit, out: Grenade): void {
  grenadeLaunch(px, py, pz, yaw, pitch, world, hit, out);
}

/** Тик полёта: true — ударилось (о стену или землю) — тут и разливается */
export function bucketStep(g: Grenade, world: CollisionWorld, hit: RayHit): boolean {
  return grenadeStep(g, world, hit) || g.rest;
}

// ------------------------------------------------------------ шаг оружия набора

/** Черновик шага: исходный вход, вход для stepPlayer, сохранённое оружие, натяжение выпущенной стрелы */
export interface P4Step {
  readonly orig: Input;
  readonly masked: Input;
  pressed: number;
  ammo: number;
  fireCd: number;
  reloadT: number;
  bloom: number;
  recoilP: number;
  recoilY: number;
  shots: number;
  /** Обёртка включена в этом шаге (набор не маркер и AWP не в руках) */
  wrapped: boolean;
  /** Выстрел из лука в этом шаге: натяжение 0…1 */
  charge: number;
}

export function makeP4Step(): P4Step {
  return {
    orig: { seq: 0, buttons: 0, yaw: 0, pitch: 0, viewTick: 0 },
    masked: { seq: 0, buttons: 0, yaw: 0, pitch: 0, viewTick: 0 },
    pressed: 0, ammo: 0, fireCd: 0, reloadT: 0, bloom: 0, recoilP: 0, recoilY: 0, shots: 0, wrapped: false, charge: 0,
  };
}

/** Свежий боец или новый набор: полный магазин, без натяжения и перезарядки */
export function armKit(s: PlayerState, kit: number): void {
  s.ammo = KITS[kitOf(kit)].mag;
  s.fireCd = 0;
  s.reloadT = 0;
  s.bloom = 0;
}

/** Лук натягивается: идёт шагом, как в прицеле */
export function bowDrawing(s: PlayerState, kit: number): boolean {
  return kit === KIT_BOW && s.awp === 0 && s.bloom > 0;
}

/**
 * Перед stepPlayer: запомнить вход и оружие. Маркер и AWP — без изменений (вернёт сам вход), иначе огонь и
 * перезарядку прячем (их считает p4After), а пока лук натянут — шаг как в прицеле.
 */
export function p4Before(f: P4Step, s: PlayerState, inp: Input, kit: number): Input {
  f.charge = 0;
  f.wrapped = kit !== KIT_MARKER && s.awp === 0;
  if (!f.wrapped) return inp;
  const o = f.orig;
  o.seq = inp.seq;
  o.buttons = inp.buttons;
  o.yaw = inp.yaw;
  o.pitch = inp.pitch;
  o.viewTick = inp.viewTick;
  f.pressed = inp.buttons & ~s.prevButtons;
  f.ammo = s.ammo;
  f.fireCd = s.fireCd;
  f.reloadT = s.reloadT;
  f.bloom = s.bloom;
  f.recoilP = s.recoilP;
  f.recoilY = s.recoilY;
  f.shots = s.shots;
  const m = f.masked;
  m.seq = inp.seq;
  m.yaw = inp.yaw;
  m.pitch = inp.pitch;
  m.viewTick = inp.viewTick;
  m.buttons = (inp.buttons & ~(BTN_FIRE | BTN_RELOAD)) | (bowDrawing(s, kit) ? BTN_ADS : 0);
  return m;
}

/** После stepPlayer: вернуть оружие и сделать шаг набора. ev — события stepPlayer (дополняются выстрелом). */
export function p4After(f: P4Step, s: PlayerState, ev: StepEvents, canFire: boolean, seed: number, kit: number): void {
  if (!f.wrapped) return;
  s.ammo = f.ammo;
  s.fireCd = f.fireCd;
  s.reloadT = f.reloadT;
  s.bloom = f.bloom;
  s.recoilP = f.recoilP;
  s.recoilY = f.recoilY;
  s.shots = f.shots;
  ev.fired = false;
  ev.awp = false;
  ev.reloadStart = false;
  ev.reloaded = false;
  ev.dry = false;
  const inp = f.orig;
  if (kit === KIT_BOW) stepBow(f, s, inp, canFire, seed, ev);
  else stepKitGun(KITS[kitOf(kit)], s, inp, f.pressed, canFire, seed, ev);
  s.prevButtons = inp.buttons;
}

/** Разброс набора прямо сейчас (выстрел и прицел на клиенте) */
export function kitSpread(kit: number, s: PlayerState, ads: boolean): number {
  const g = KITS[kitOf(kit)];
  const hs = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
  const moveFrac = hs > RUN_SPEED ? 1 : hs / RUN_SPEED;
  let spread = ads ? g.spreadAds + g.moveAds * moveFrac : g.spreadHip + g.moveHip * moveFrac;
  if (s.grounded === 0) spread += ads ? g.airAds : g.airHip;
  if (kit === KIT_BOW) spread += (1 - Math.min(1, s.bloom / BOW_DRAW_TICKS)) * 0.02;
  else spread += ads ? s.bloom * 0.45 : s.bloom;
  return spread;
}

const BLOOM_DECAY = 0.0011;
const RECOIL_MAX = 0.085;
const RECOIL_KEEP_FIRING = 0.972;
const RECOIL_KEEP_IDLE = 0.86;

function settle(s: PlayerState, decayBloom: boolean): void {
  if (decayBloom) s.bloom = s.bloom > BLOOM_DECAY ? s.bloom - BLOOM_DECAY : 0;
  const keep = s.fireCd > 0 ? RECOIL_KEEP_FIRING : RECOIL_KEEP_IDLE;
  s.recoilP *= keep;
  s.recoilY *= keep;
  if (s.recoilP < 1e-6 && s.recoilP > -1e-6) s.recoilP = 0;
  if (s.recoilY < 1e-6 && s.recoilY > -1e-6) s.recoilY = 0;
}

function kick(g: KitSpec, s: PlayerState, seed: number, ads: boolean): void {
  const k1 = hashFloat(seed ^ 0x51ed, s.shots);
  const k2 = hashFloat(seed ^ 0x2c1b, s.shots);
  const k = ads ? 0.7 : 1;
  s.recoilP += g.kick * (0.8 + 0.4 * k1) * k;
  if (s.recoilP > RECOIL_MAX) s.recoilP = RECOIL_MAX;
  s.recoilY += (k2 - 0.5) * 2 * g.kickYaw * k;
}

/** Брызгалка и Лейка: зажал — стреляет с темпом набора, кончились — перезарядка (R — сам) */
function stepKitGun(g: KitSpec, s: PlayerState, inp: Input, pressed: number, canFire: boolean, seed: number, ev: StepEvents): void {
  const b = inp.buttons;
  const ads = (b & BTN_ADS) !== 0;
  if (s.fireCd > 0) s.fireCd--;
  if (s.reloadT > 0) {
    s.reloadT--;
    if (s.reloadT === 0) {
      s.ammo = g.mag;
      ev.reloaded = true;
    }
  } else if ((pressed & BTN_RELOAD) && s.ammo < g.mag) {
    s.reloadT = g.reload;
    ev.reloadStart = true;
  }
  let fired = false;
  if (canFire && (b & BTN_FIRE) && s.fireCd === 0 && s.reloadT === 0) {
    if (s.ammo <= 0) {
      s.reloadT = g.reload;
      ev.reloadStart = true;
      ev.dry = true;
    } else {
      s.ammo--;
      s.fireCd = g.interval;
      s.shots = (s.shots + 1) >>> 0;
      const spread = kitSpreadOf(g, s, ads);
      ev.aimYaw = inp.yaw + s.recoilY;
      ev.aimPitch = inp.pitch + s.recoilP;
      ev.spread = spread;
      shotDirection(ev.aimYaw, ev.aimPitch, spread, seed, s.shots, ev);
      ev.fired = true;
      fired = true;
      s.bloom = s.bloom + g.bloom > g.bloomMax ? Math.max(s.bloom, g.bloomMax) : s.bloom + g.bloom;
      kick(g, s, seed, ads);
      if (s.ammo === 0) {
        s.reloadT = g.reload + g.interval;
        ev.reloadStart = true;
      }
    }
  }
  if (!fired) settle(s, true);
}

function kitSpreadOf(g: KitSpec, s: PlayerState, ads: boolean): number {
  const hs = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
  const moveFrac = hs > RUN_SPEED ? 1 : hs / RUN_SPEED;
  let spread = ads ? g.spreadAds + g.moveAds * moveFrac : g.spreadHip + g.moveHip * moveFrac;
  if (s.grounded === 0) spread += ads ? g.airAds : g.airHip;
  return spread + (ads ? s.bloom * 0.45 : s.bloom);
}

/**
 * Лук: зажал огонь — тянешь (bloom растёт до BOW_DRAW_TICKS), отпустил — стрела (f.charge — натяжение);
 * R — опустить лук без выстрела. После выстрела новая стрела ложится за interval тиков.
 */
function stepBow(f: P4Step, s: PlayerState, inp: Input, canFire: boolean, seed: number, ev: StepEvents): void {
  const g = KITS[KIT_BOW];
  const b = inp.buttons;
  const ads = (b & BTN_ADS) !== 0;
  if (s.fireCd > 0) s.fireCd--;
  s.ammo = s.fireCd > 0 ? 0 : 1;
  s.reloadT = 0;
  if (!canFire || (f.pressed & BTN_RELOAD)) {
    s.bloom = 0;
  } else if (b & BTN_FIRE) {
    if (s.fireCd === 0 && s.bloom < BOW_DRAW_TICKS) s.bloom++;
  } else if (s.bloom > 0) {
    const charge = bowCharge(s.bloom);
    s.shots = (s.shots + 1) >>> 0;
    const spread = kitSpread(KIT_BOW, s, ads);
    ev.aimYaw = inp.yaw + s.recoilY;
    ev.aimPitch = inp.pitch + s.recoilP;
    ev.spread = spread;
    shotDirection(ev.aimYaw, ev.aimPitch, spread, seed, s.shots, ev);
    ev.fired = true;
    f.charge = charge;
    s.bloom = 0;
    s.fireCd = g.interval;
    s.ammo = 0;
    kick(g, s, seed, ads);
    return;
  }
  settle(s, false);
}

/** События наборов (в общем 'ev' пейнтбола; Брызгалка шлёт обычный 'shot') */
export type P4Event =
  // Лейка: кто, откуда (x, y, z), концы капель подряд четвёрками: x, y, z, чем кончилась (0 — стена, 1 — игрок, 2 — в никуда)
  | ['fan', number, number, number, number, number[]]
  // толчок Лейкой: кого, направление (dx, dz, не нормировано), скорость м/с
  | ['shove', number, number, number, number]
  // стрела: кто, номер выстрела (state.shots), откуда (x, y, z), скорость (vx, vy, vz), натяжение 0…1
  | ['arrow', number, number, number, number, number, number, number, number, number]
  // стрела кончилась: кто, номер выстрела, где (x, y, z), чем (0 — мир, 1 — игрок, 2 — потерялась), нормаль (nx, ny, nz)
  | ['arrowEnd', number, number, number, number, number, number, number, number, number]
  // ведёрко брошено: кто, откуда (x, y, z), скорость (vx, vy, vz)
  | ['bucket', number, number, number, number, number, number, number]
  // ведёрко разлилось: кто, где (x, y, z)
  | ['bsplash', number, number, number, number];
