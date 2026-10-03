// Шаг бойца «Fight Club»: ходьба общим stepPlayer (шаг 5,2 м/с, прыжок, рывок = уклон) и свой автомат действий —
// серия джебов до хука, тяжёлый с финтом, захват и бросок, блок, выносливость, оглушение, нокаут — плюс край ринга
// (толпа отпихивает). Один код на сервере (истина) и на клиенте (предсказание своего бойца), поэтому никаких
// Math.sin/cos/hypot: только +, −, ×, ÷ и sqrt, как в shared/sim.ts. Попадания и урон решает сервер (applyHit).
import { DASH_TICKS, GROUND_BLEND, PLAYER_HALF } from './constants.ts';
import {
  FA_GRAB, FA_HEAVY, FA_HOLD, FA_HOOK, FA_JAB, FA_JAB2, FA_NONE, FA_THROW, FC_BLOCK_DMG, FC_BLOCK_KB, FC_BLOCK_ST, FC_BLOCK_STUN,
  FC_BREAK_DMG, FC_BREAK_KB, FC_CEIL, FC_ROOM, FC_BREAK_ST, FC_BREAK_STUN, FC_DODGE_COST, FC_DODGE_INV_EXTRA, FC_FEINT_BEFORE, FC_HOLD_MAX, FC_HOLD_MIN,
  FC_HP, FC_REACH_Y, FC_SHOVE_SPEED, FC_SHOVE_UP, FC_ST_DELAY, FC_ST_MAX, FC_ST_REGEN, FC_ST_REGEN_BLOCK, FC_THROW, HIT_BLOCK, HIT_BREAK,
  HIT_HIT, MOVES,
} from './fight.ts';
import { sinCos } from './math.ts';
import {
  BTN_ADS, BTN_BACK, BTN_DASH, BTN_FIRE, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RIGHT, BTN_USE, copyState, makeEvents, makeInput, makeState,
  statesEqual, stepPlayer, type Input, type PlayerState,
} from './sim.ts';
import { CollisionWorld } from './world.ts';

/** Блок — свой бит ввода (в других режимах его никто не читает) */
export const BTN_BLOCK = 2048;
const MOVE = BTN_FORWARD | BTN_BACK | BTN_LEFT | BTN_RIGHT;
/** Пойманный вырывается любыми «боевыми» кнопками */
const MASH = BTN_FIRE | BTN_ADS | BTN_USE | BTN_JUMP | BTN_DASH | BTN_BLOCK;

/** Что можно сейчас: стоять в углу (вступление), ходить без ударов (пауза, итоги), драться */
export const GATE_FROZEN = 0;
export const GATE_WALK = 1;
export const GATE_FIGHT = 2;

/**
 * Множитель скорости после stepPlayer, при котором на земле выходит доля f от обычного шага (stepPlayer тянет
 * скорость к цели на GROUND_BLEND за тик; умножая каждый тик на k, получаем установившуюся долю f).
 */
function slow(f: number): number {
  return (1 - GROUND_BLEND / f) / (1 - GROUND_BLEND);
}
const K_BLOCK = slow(0.45);
const K_HEAVY = slow(0.4);
const K_HOLD = slow(0.55);
const K_STRIKE = slow(0.7);

/** Подвал для столкновений: пол и четыре стены (ринг держит край толпы, см. ring). */
export function buildFightWorld(): CollisionWorld {
  const R = FC_ROOM;
  const H = FC_CEIL;
  const wall = (min: [number, number, number], max: [number, number, number]) => ({ min, max, mat: 'concrete' as const, color: 0x6f6a5e });
  return new CollisionWorld({
    name: 'fight',
    boxes: [
      wall([-R - 1, -1, -R - 1], [R + 1, 0, R + 1]),
      wall([-R - 1, 0, -R - 1], [R + 1, H, -R]),
      wall([-R - 1, 0, R], [R + 1, H, R + 1]),
      wall([-R - 1, 0, -R], [-R, H, R]),
      wall([R, 0, -R], [R + 1, H, R]),
    ],
    spawns: [],
    trampolines: [],
    pickups: [],
    deco: [],
    bounds: { minX: -R, maxX: R, minZ: -R, maxZ: R },
  });
}

/** Всё, что нужно для предсказания бойца: движение (PlayerState) и целые поля боя. */
export interface Fighter {
  s: PlayerState;
  /** Курс (из ввода): куда смотрит и куда бьёт */
  yaw: number;
  hp: number;
  /** Выносливость, десятые (полная — FC_ST_MAX) */
  st: number;
  /** Тиков до начала восстановления выносливости */
  stCd: number;
  /** Действие (FA_*) и сколько тиков оно идёт */
  act: number;
  actT: number;
  /** Нажал удар во время джеба — следующий в серии */
  buf: number;
  /** Оглушение (без управления) и стойка после блока (без ударов), тиков */
  stun: number;
  bstun: number;
  /** Неуязвим (уклон), тиков */
  inv: number;
  block: number;
  ko: number;
  /** Кто держит (номер; 0 — никто) и кого держит сам */
  held: number;
  grab: number;
  /** Пойманный: сколько раз нажал, вырываясь */
  mash: number;
  /** Кнопки прошлого тика — чтобы видеть нажатия */
  pb: number;
  /** Темнота: накопленный урон (только сервер, в снимок не идёт) */
  dark: number;
}

export function makeFighter(): Fighter {
  return {
    s: makeState(), yaw: 0, hp: FC_HP, st: FC_ST_MAX, stCd: 0, act: FA_NONE, actT: 0, buf: 0, stun: 0, bstun: 0, inv: 0, block: 0, ko: 0,
    held: 0, grab: 0, mash: 0, pb: 0, dark: 0,
  };
}

export function copyFighter(d: Fighter, f: Fighter): Fighter {
  copyState(d.s, f.s);
  d.yaw = f.yaw; d.hp = f.hp; d.st = f.st; d.stCd = f.stCd; d.act = f.act; d.actT = f.actT; d.buf = f.buf; d.stun = f.stun;
  d.bstun = f.bstun; d.inv = f.inv; d.block = f.block; d.ko = f.ko; d.held = f.held; d.grab = f.grab; d.mash = f.mash; d.pb = f.pb;
  d.dark = f.dark;
  return d;
}

/** Сверка предсказания с сервером (темнота — только у сервера, не сравниваем). */
export function fightersEqual(a: Fighter, b: Fighter): boolean {
  return statesEqual(a.s, b.s) && a.yaw === b.yaw && a.hp === b.hp && a.st === b.st && a.stCd === b.stCd && a.act === b.act &&
    a.actT === b.actT && a.buf === b.buf && a.stun === b.stun && a.bstun === b.bstun && a.inv === b.inv && a.block === b.block &&
    a.ko === b.ko && a.held === b.held && a.grab === b.grab && a.mash === b.mash && a.pb === b.pb;
}

/** Полное здоровье и выносливость, без действий — начало раунда. */
export function freshFighter(f: Fighter, x: number, z: number, yaw: number): void {
  const s = makeState();
  s.x = x;
  s.z = z;
  s.grounded = 1;
  copyState(f.s, s);
  f.yaw = yaw;
  f.hp = FC_HP;
  f.st = FC_ST_MAX;
  f.stCd = f.act = f.actT = f.buf = f.stun = f.bstun = f.inv = f.block = f.ko = f.held = f.grab = f.mash = f.dark = 0;
}

/** Что случилось за тик — серверу (удары, захват, бросок) и клиенту (звук, анимация). */
export interface FightEvents {
  /** Удар стал «активным»: каким действием (0 — нет). Попадание проверяет сервер */
  strike: number;
  /** Захват стал активным */
  grab: boolean;
  /** Бросил пойманного: номер (0 — нет) */
  throwAt: number;
  /** Начал действие: каким (0 — нет) — звук замаха */
  began: number;
  dodge: boolean;
  feint: boolean;
  /** Хотел ударить или уклониться — не хватило выносливости */
  winded: boolean;
  /** Влетел в толпу — отпихнули обратно */
  shove: boolean;
  jumped: boolean;
  landed: boolean;
  landSpeed: number;
}

export function makeFightEvents(): FightEvents {
  return { strike: 0, grab: false, throwAt: 0, began: 0, dodge: false, feint: false, winded: false, shove: false, jumped: false, landed: false, landSpeed: 0 };
}

function resetFightEvents(e: FightEvents): void {
  e.strike = 0; e.grab = false; e.throwAt = 0; e.began = 0; e.dodge = false; e.feint = false; e.winded = false; e.shove = false;
  e.jumped = false; e.landed = false; e.landSpeed = 0;
}

const stepIn: Input = makeInput();
const stepEv = makeEvents();
const sc = { s: 0, c: 0 };

/** Удар или захват ещё не дошёл до отхода (замах или сам удар) */
export function striking(f: Fighter): boolean {
  if (f.act === FA_NONE || f.act === FA_HOLD) return false;
  const m = MOVES[f.act];
  return f.actT < m.w + m.a;
}

/**
 * Один тик бойца. ringR — радиус ринга (край толпы), gate — что можно (GATE_*). Пойманный не двигается сам:
 * его носит тот, кто держит (сервер ставит позицию после шагов всех).
 */
export function stepFighter(f: Fighter, inp: Input, w: CollisionWorld, ringR: number, gate: number, ev: FightEvents): void {
  resetFightEvents(ev);
  const raw = inp.buttons;
  const pressed = raw & ~f.pb;
  f.pb = raw;
  if (f.inv > 0) f.inv--;
  if (f.stCd > 0) f.stCd--;
  else if (f.st < FC_ST_MAX) f.st = Math.min(FC_ST_MAX, f.st + (f.block ? FC_ST_REGEN_BLOCK : FC_ST_REGEN));
  if (f.held) {
    if (pressed & MASH) f.mash++;
    idle(f);
    return;
  }
  if (!f.ko) f.yaw = inp.yaw;
  if (f.ko || f.stun > 0 || gate === GATE_FROZEN) {
    if (f.stun > 0) f.stun--;
    idle(f);
    walk(f, 0, w, ev);
    ring(f, ringR, ev);
    return;
  }
  const canFight = gate === GATE_FIGHT;
  if (f.bstun > 0) f.bstun--;

  // 1) действие идёт своим чередом
  let lunge = 0;
  if (f.act === FA_HOLD) {
    f.actT++;
    if (!canFight || f.actT >= FC_HOLD_MAX || (f.actT >= FC_HOLD_MIN && (pressed & (BTN_USE | BTN_FIRE)) !== 0)) {
      ev.throwAt = f.grab;
      f.grab = 0;
      f.act = FA_THROW;
      f.actT = 0;
    }
  } else if (f.act !== FA_NONE) {
    f.actT++;
    const m = MOVES[f.act];
    if (f.actT === m.w && f.act !== FA_THROW) {
      if (f.act === FA_GRAB) ev.grab = true;
      else ev.strike = f.act;
      lunge = m.lunge;
    }
    if (f.actT >= m.w + m.a + m.r) {
      f.act = FA_NONE;
      f.actT = 0;
    }
  }

  // 2) новые действия: с места или из отхода прошлого (серия, уклон, тяжёлый, захват)
  const dashing = f.s.dashT > 0;
  const free = f.act === FA_NONE || (f.act !== FA_HOLD && !striking(f));
  if ((pressed & BTN_FIRE) !== 0 && (f.act === FA_JAB || f.act === FA_JAB2) && !free) f.buf = 1;
  let dash = false;
  // бросил в этом тике — тем же нажатием ничего нового не начинаем
  if (canFight && f.bstun === 0 && !dashing && free && ev.throwAt === 0) {
    const combo = f.act === FA_JAB || f.act === FA_JAB2;
    if ((pressed & BTN_DASH) !== 0 && f.s.dashCd === 0) {
      if (f.st >= FC_DODGE_COST) dash = true;
      else ev.winded = true;
    } else if ((pressed & BTN_FIRE) !== 0 || (f.buf !== 0 && combo)) {
      begin(f, f.act === FA_JAB ? FA_JAB2 : f.act === FA_JAB2 ? FA_HOOK : FA_JAB, ev);
      f.buf = 0;
    } else if ((pressed & BTN_ADS) !== 0) begin(f, FA_HEAVY, ev);
    else if ((pressed & BTN_USE) !== 0) begin(f, FA_GRAB, ev);
  }
  // финт: блок в начале замаха тяжёлого отменяет его (выносливость не возвращается)
  if (canFight && f.act === FA_HEAVY && (pressed & BTN_BLOCK) !== 0 && f.actT < MOVES[FA_HEAVY].w - FC_FEINT_BEFORE) {
    f.act = FA_NONE;
    f.actT = 0;
    ev.feint = true;
  }

  // 3) блок: держит кнопку, есть выносливость; отход после удара блоком отменяется
  if (canFight && (raw & BTN_BLOCK) !== 0 && f.st > 0 && !dashing && !dash && f.act !== FA_HOLD && !striking(f)) {
    f.act = FA_NONE;
    f.actT = 0;
    f.buf = 0;
    f.block = 1;
  } else {
    f.block = 0;
  }

  // 4) ходьба (рывок — это уклон), шаг в удар, медленнее в блоке, в замахе и с пойманным
  let b = BTN_ADS | (raw & MOVE);
  if (!striking(f) && f.act !== FA_HOLD) b |= raw & BTN_JUMP;
  if (dash) b |= BTN_DASH;
  if (walk(f, b, w, ev)) {
    f.st -= FC_DODGE_COST;
    f.stCd = FC_ST_DELAY;
    f.inv = DASH_TICKS + FC_DODGE_INV_EXTRA;
    f.act = FA_NONE;
    f.actT = 0;
    f.buf = 0;
    f.block = 0;
    ev.dodge = true;
  }
  const s = f.s;
  if (s.grounded === 1 && s.dashT === 0) {
    const k = f.block ? K_BLOCK : f.act === FA_HEAVY && f.actT < MOVES[FA_HEAVY].w ? K_HEAVY : f.act === FA_HOLD ? K_HOLD : striking(f) ? K_STRIKE : 1;
    if (k !== 1) {
      s.vx *= k;
      s.vz *= k;
    }
  }
  if (lunge > 0) {
    sinCos(f.yaw, sc);
    s.vx -= sc.s * lunge;
    s.vz -= sc.c * lunge;
  }
  ring(f, ringR, ev);
}

function idle(f: Fighter): void {
  f.act = FA_NONE;
  f.actT = 0;
  f.block = 0;
  f.buf = 0;
}

function begin(f: Fighter, act: number, ev: FightEvents): void {
  const cost = MOVES[act].cost;
  if (f.st < cost) {
    ev.winded = true;
    return;
  }
  f.st -= cost;
  f.stCd = FC_ST_DELAY;
  f.act = act;
  f.actT = 0;
  f.block = 0;
  ev.began = act;
}

/** Шаг stepPlayer с готовыми кнопками. true — начался рывок. */
function walk(f: Fighter, buttons: number, w: CollisionWorld, ev: FightEvents): boolean {
  stepIn.buttons = buttons;
  stepIn.yaw = f.yaw;
  stepIn.pitch = 0;
  stepPlayer(f.s, stepIn, w, false, 0, stepEv);
  ev.jumped = stepEv.jumped;
  ev.landed = stepEv.landed;
  ev.landSpeed = stepEv.landSpeed;
  return stepEv.dashed;
}

/** Край ринга: дальше толпа. Влетел быстро — отпихивает обратно с подбросом, медленно — просто упёрся. */
function ring(f: Fighter, ringR: number, ev: FightEvents): void {
  const s = f.s;
  const lim = ringR - PLAYER_HALF;
  const d2 = s.x * s.x + s.z * s.z;
  if (d2 <= lim * lim) return;
  const d = Math.sqrt(d2);
  const nx = s.x / d;
  const nz = s.z / d;
  s.x = nx * lim;
  s.z = nz * lim;
  const vr = s.vx * nx + s.vz * nz;
  if (vr <= 0) return;
  if (vr > FC_SHOVE_SPEED) {
    s.vx -= nx * vr * 1.6;
    s.vz -= nz * vr * 1.6;
    if (s.vy < FC_SHOVE_UP) {
      s.vy = FC_SHOVE_UP;
      s.grounded = 0;
    }
    s.dashT = 0;
    ev.shove = true;
  } else {
    s.vx -= nx * vr;
    s.vz -= nz * vr;
  }
}

// ---------------------------------------------------------------- попадания (решает сервер)

/** Достаёт ли удар из (ax, ay, az) с курсом yaw до (vx, vy, vz): дальность reach, сектор с косинусом arc. */
export function inReach(ax: number, ay: number, az: number, yaw: number, vx: number, vy: number, vz: number, reach: number, arc: number): boolean {
  const dx = vx - ax;
  const dz = vz - az;
  const d2 = dx * dx + dz * dz;
  if (d2 > reach * reach || Math.abs(vy - ay) > FC_REACH_Y) return false;
  return d2 < 1e-6 || faces(yaw, dx, dz, arc);
}

/** Смотрит ли курс yaw на точку (dx, dz) — в пределах косинуса arc. */
export function faces(yaw: number, dx: number, dz: number, arc: number): boolean {
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-6) return true;
  sinCos(yaw, sc);
  return (-sc.s * dx - sc.c * dz) / d >= arc;
}

export interface HitOut {
  /** HIT_HIT, HIT_BLOCK, HIT_BREAK */
  res: number;
  dmg: number;
}

export function makeHitOut(): HitOut {
  return { res: 0, dmg: 0 };
}

/**
 * Удар kind по жертве v; (dx, dz) — направление от бьющего к жертве (длина 1). blocked — жертва держала блок
 * лицом к бьющему. Лёгкий в блок — почти без урона, тяжёлый — пробивает; кончилась выносливость — блок падает.
 * Неуязвимых (уклон) сюда не передают.
 */
export function applyHit(v: Fighter, kind: number, dx: number, dz: number, blocked: boolean, out: HitOut): HitOut {
  const m = MOVES[kind];
  if (blocked && kind !== FA_HEAVY) {
    v.st -= FC_BLOCK_ST;
    v.stCd = FC_ST_DELAY;
    v.bstun = FC_BLOCK_STUN;
    if (v.st <= 0) {
      v.st = 0;
      out.res = HIT_BREAK;
      out.dmg = FC_BREAK_DMG;
      hurt(v, FC_BREAK_DMG, dx * FC_BREAK_KB, dz * FC_BREAK_KB, 0, FC_BREAK_STUN);
      return out;
    }
    out.res = HIT_BLOCK;
    out.dmg = FC_BLOCK_DMG;
    hurt(v, FC_BLOCK_DMG, dx * m.kb * FC_BLOCK_KB, dz * m.kb * FC_BLOCK_KB, 0, 0);
    return out;
  }
  if (blocked) {
    v.st = Math.max(0, v.st - FC_BREAK_ST);
    v.stCd = FC_ST_DELAY;
    out.res = HIT_BREAK;
    out.dmg = FC_BREAK_DMG;
    hurt(v, FC_BREAK_DMG, dx * FC_BREAK_KB, dz * FC_BREAK_KB, 0, FC_BREAK_STUN);
    return out;
  }
  out.res = HIT_HIT;
  out.dmg = m.dmg;
  hurt(v, m.dmg, dx * m.kb, dz * m.kb, m.up, m.stun);
  return out;
}

/** Бросок: пойманного швыряет вперёд (dx, dz — куда смотрит бросивший). */
export function applyThrow(v: Fighter, dx: number, dz: number): void {
  v.held = 0;
  v.mash = 0;
  hurt(v, FC_THROW.dmg, dx * FC_THROW.kb, dz * FC_THROW.kb, FC_THROW.up, FC_THROW.stun);
}

/** Урон, отброс, оглушение; HP кончилось — нокаут. */
export function hurt(v: Fighter, dmg: number, vx: number, vz: number, up: number, stun: number): void {
  v.hp = Math.max(0, v.hp - dmg);
  v.s.vx = vx;
  v.s.vz = vz;
  if (up > 0) {
    v.s.vy = up;
    v.s.grounded = 0;
  }
  if (stun > 0) {
    v.stun = Math.max(v.stun, stun);
    v.s.dashT = 0;
    idle(v);
  }
  if (v.hp === 0) {
    v.ko = 1;
    v.stun = 0;
    v.inv = 0;
    idle(v);
  }
}

/** Выносливость в процентах (для снимка и интерфейса) */
export function staminaPct(f: Fighter): number {
  return Math.round((f.st / FC_ST_MAX) * 100);
}

