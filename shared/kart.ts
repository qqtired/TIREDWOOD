// Физика карта: шаг 60 Гц, один и тот же на сервере и в браузере (предсказание, как у пешехода).
// Только + − × ÷, Math.sqrt/abs/min/max и sinCos — бит в бит в любом движке, снимок сверяется точно.
// Курс — единичный вектор (hx, hz): yaw = 0 смотрит в −Z, вправо по ходу — (−hz, hx).
// Управление: W/S — газ и тормоз (задний ход), A/D — руль, Space — подскок и занос, E или ЛКМ — бонус,
// R — вернуться на последнюю контрольную точку.
// Помехи трассы (shared/hazards.ts): ускорители, лужи, бочки и блоки, движущиеся помехи, настилы. Движущиеся — функция
// «времени гонки» карта rt (тиков в пути): оно лежит в состоянии карта, поэтому сервер и предсказание совпадают бит в бит.
import { DT, WATER_Y } from './constants.ts';
import { collide, deckAt, makeHit, padAt, slickAt } from './hazards.ts';
import { sinCos } from './math.ts';
import { BTN_BACK, BTN_FIRE, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, BTN_USE, type Input } from './sim.ts';
import { NO_GROUND, locate, locateAny, makeLoc, wrapSeg, type Track, type TrackLoc } from './track.ts';

/** Радиус карта: стены и толчки */
export const KART_R = 0.75;
export const RC_LAPS = 3;

export const ITEM_NONE = 0;
export const ITEM_TURBO = 1;
export const ITEM_JAM = 2;
export const ITEM_PAINT = 3;
export const ITEM_SHIELD = 4;
export const ITEM_PULSE = 5;
export const ITEM_CLEAN = 6;
export const ITEM_ICONS = ['', '🚀', '🍯', '🎨', '🛡️', '⚡', '🧼'];
export const ITEM_NAMES = ['', 'Турбо', 'Варенье', 'Краска', 'Щит · один удар, 3 с', 'Импульс · впереди до 12 м', 'Очистка · снять помехи и разогнаться'];

/** Фазы гонки */
export const RC_GRID = 0;
export const RC_RACE = 1;
export const RC_RESULTS = 2;
/** Отсчёт на решётке 5 с, ожидание после первого финиша 30 с, гонка не дольше 5 мин, итоги 10 с */
export const RC_GRID_TICKS = 300;
export const RC_FINISH_WAIT = 1800;
export const RC_MAX_TICKS = 18000;
export const RC_RESULTS_TICKS = 600;
export const RC_MAX_KARTS = 6;
export const RC_MIN_KARTS = 4;
/** Снимок гонки — каждый второй тик (30 в секунду) */
export const RC_SNAP_EVERY = 2;

export const TURBO_TICKS = 90;
export const SLOW_TICKS = 120;
export const SPIN_TICKS = 40;
export const PAINT_TICKS = 180;
/** Рулетка бонуса после ящика */
export const ITEM_ROLL_TICKS = 48;
/** Призрак после возврата на трассу; первые FREEZE_TICKS карт стоит */
export const GHOST_TICKS = 90;
export const FREEZE_TICKS = 30;
/** Занос: столько тиков — мини-турбо 1 и 2 */
export const MT1_TICKS = 50;
export const MT2_TICKS = 110;
/** Ускоритель на дороге: турбо (как у бонуса) на столько тиков */
export const PAD_TICKS = 50;
/** Удар движущейся помехой: закрутка и медленный ход (короче, чем от банки варенья) */
export const HIT_SPIN_TICKS = 26;
export const HIT_SLOW_TICKS = 60;
/** Время гонки карта не идёт дальше этого (в снимке — uint16) */
export const RT_MAX = 65535;

const MT1_BOOST = 28;
const MT2_BOOST = 55;
const MAX_SPEED = 22;
const TURBO_SPEED = 30;
const MT1_SPEED = 26;
const MT2_SPEED = 28;
const SLOW_SPEED = 11;
const REVERSE_SPEED = 6;
const ACCEL = 14;
/** Разгон слабеет к потолку: 14 · (1 − 0,55 · v / потолок) */
const ACCEL_FALL = 0.55;
const OVER_DECEL = 12;
/** Ускорение под турбо и мини-турбо (и без газа) */
const BOOST_ACCEL = 24;
const BRAKE = 30;
const REVERSE_ACCEL = 9;
const COAST = 4;
/** Доля боковой скорости, которая гасится за тик: сцепление и занос */
const GRIP = 0.25;
const DRIFT_GRIP = 0.06;
const STEER_RATE = 8;
const TURN_RATE = 2.3;
/** На полной скорости руль поворачивает слабее: × (1 − 0,36) — радиус ~15 м на 22 м/с */
const TURN_FALL = 0.36;
/** На месте руль поворачивает с такой долей силы: карт развернётся, даже стоя носом в стену */
const TURN_MIN = 0.5;
/** Полная сила руля — с такой скорости, м/с */
const TURN_FULL_AT = 5;
const DRIFT_TURN = 1.15;
const DRIFT_START = 9;
const DRIFT_KEEP = 7;
/** Руль дальше этого — занос в его сторону */
const DRIFT_STEER = 0.3;
const AIR_TURN = 0.25;
/** Подскок на пробел: вверх с такой скоростью, м/с (в воздухе ~0,27 с) */
const HOP_VY = 3;
/** Приземлился с подскока — столько тиков ещё можно довернуть руль и уйти в занос */
const HOP_WINDOW = 15;
const KART_GRAVITY = 22;
/** Дорога под колёсами — ещё 0,5 м за краем (край причала) */
const EDGE_GROUND = 0.5;
/** Приземлиться можно, если ниже дороги не больше чем на столько */
const LAND_SNAP = 0.45;
/** Стены держат только тех, кто у края, а не тех, кто уже над водой за причалом */
const WALL_REACH = 1;
const WALL_BOUNCE = 0.3;
const WALL_FRICTION = 0.15;
/** Носом в стену: за тик касания курс доворачивает вдоль стены на такую долю (лоб в лоб — по ходу трассы) */
const WALL_ALIGN = 0.35;
/** Трётся о стену — за тик теряет такую долю скорости: ехать по стене выходит медленнее, чем по дороге */
const WALL_SCRAPE = 0.012;
/**
 * КТ засчитывается, если карт не дальше стольких отрезков за ней. Окно широкое: после срезки через бухту
 * пропущенные КТ засчитываются подряд, по одной за тик (по порядку, поэтому «перескочить» трассу всё равно нельзя).
 * Но только когда карт стоит колёсами на самой дороге: в полёте и на настиле срезки КТ «по пути» не берутся — иначе
 * упавший в бухту возвращался бы на КТ за срезкой, а не на ту, откуда прыгал.
 */
const CP_WINDOW = 100;
/** В полёте над водой отрезок ищется по всей трассе, если карт дальше от дороги, чем на столько за краем */
const FLIGHT_LOOKUP = 1.5;

export interface KartState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Курс (единичный вектор; yaw = 0 смотрит в −Z) */
  hx: number;
  hz: number;
  /** Руль −1…1 (+ — влево), сглаженный */
  steer: number;
  /** Отрезок трассы */
  seg: number;
  /** 1 — колёса на дороге */
  grounded: number;
  /** Занос −1/0/1 (+ — влево) и сколько тиков длится */
  drift: number;
  driftT: number;
  /** Подскок: 0 — нет, 1 — пробел нажат, ждём земли, 2… — тиков на земле после приземления + 1 */
  hop: number;
  /** Ускорение: уровень 1 — мини-турбо, 2 — большое мини-турбо, 3 — турбо */
  boostT: number;
  boostLvl: number;
  /** Варенье: потолок скорости ниже; кружение — без руля и газа */
  slowT: number;
  spinT: number;
  ghostT: number;
  /** Последняя пройденная КТ, круг (с 1 после старта), 1 — финишировал */
  cp: number;
  lap: number;
  done: number;
  /** Бонус и сколько тиков ещё крутится рулетка */
  item: number;
  itemT: number;
  prevButtons: number;
  /** Время гонки карта: тиков, которые он ехал (с решётки — 0). От него зависят движущиеся помехи */
  rt: number;
}

export interface KartEvents {
  /** Применил бонус (ITEM_*), 0 — нет */
  used: number;
  cp: boolean;
  lap: boolean;
  finish: boolean;
  splash: boolean;
  respawn: boolean;
  /** Скорость удара о стену, 0 — не было */
  wall: number;
  /** Скорость приземления, 0 — не было */
  land: number;
  /** 1 — начал занос, 2 — кончил */
  drift: number;
  /** Подскок на пробел */
  hop: boolean;
  /** Мини-турбо 1 или 2 */
  mt: number;
  /** Наехал на ускоритель (в этом тике — впервые) */
  dash: boolean;
  /** Едет по луже: 1 — вода, 2 — масло, 0 — нет */
  slick: number;
  /** Скорость удара о бочку, блок или движущуюся помеху, 0 — не было; что именно — hitKind (0 бочка, 1 блок, 2 движущаяся) */
  hit: number;
  hitKind: number;
}

export function makeKartState(): KartState {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hx: 0, hz: -1, steer: 0, seg: 0, grounded: 1, drift: 0, driftT: 0, hop: 0,
    boostT: 0, boostLvl: 0, slowT: 0, spinT: 0, ghostT: 0, cp: 0, lap: 0, done: 0, item: 0, itemT: 0, prevButtons: 0, rt: 0,
  };
}

export function makeKartEvents(): KartEvents {
  return {
    used: 0, cp: false, lap: false, finish: false, splash: false, respawn: false, wall: 0, land: 0, drift: 0, hop: false, mt: 0,
    dash: false, slick: 0, hit: 0, hitKind: 0,
  };
}

function resetEvents(ev: KartEvents): void {
  ev.used = 0;
  ev.cp = false;
  ev.lap = false;
  ev.finish = false;
  ev.splash = false;
  ev.respawn = false;
  ev.wall = 0;
  ev.land = 0;
  ev.drift = 0;
  ev.hop = false;
  ev.mt = 0;
  ev.dash = false;
  ev.slick = 0;
  ev.hit = 0;
  ev.hitKind = 0;
}

export function copyKart(dst: KartState, s: KartState): KartState {
  dst.x = s.x;
  dst.y = s.y;
  dst.z = s.z;
  dst.vx = s.vx;
  dst.vy = s.vy;
  dst.vz = s.vz;
  dst.hx = s.hx;
  dst.hz = s.hz;
  dst.steer = s.steer;
  dst.seg = s.seg;
  dst.grounded = s.grounded;
  dst.drift = s.drift;
  dst.driftT = s.driftT;
  dst.hop = s.hop;
  dst.boostT = s.boostT;
  dst.boostLvl = s.boostLvl;
  dst.slowT = s.slowT;
  dst.spinT = s.spinT;
  dst.ghostT = s.ghostT;
  dst.cp = s.cp;
  dst.lap = s.lap;
  dst.done = s.done;
  dst.item = s.item;
  dst.itemT = s.itemT;
  dst.prevButtons = s.prevButtons;
  dst.rt = s.rt;
  return dst;
}

export function kartsEqual(a: KartState, b: KartState): boolean {
  return (
    a.x === b.x && a.y === b.y && a.z === b.z && a.vx === b.vx && a.vy === b.vy && a.vz === b.vz && a.hx === b.hx &&
    a.hz === b.hz && a.steer === b.steer && a.seg === b.seg && a.grounded === b.grounded && a.drift === b.drift &&
    a.driftT === b.driftT && a.hop === b.hop && a.boostT === b.boostT && a.boostLvl === b.boostLvl && a.slowT === b.slowT &&
    a.spinT === b.spinT && a.ghostT === b.ghostT && a.cp === b.cp && a.lap === b.lap && a.done === b.done &&
    a.item === b.item && a.itemT === b.itemT && a.prevButtons === b.prevButtons && a.rt === b.rt
  );
}

/** Поставить на решётку: стоит, КТ — последняя перед линией, круг 0 (первое пересечение линии — круг 1). */
export function placeOnGrid(k: KartState, tr: Track, slot: number): void {
  const g = tr.grid[slot];
  copyKart(k, makeKartState());
  k.x = g.x;
  k.z = g.z;
  k.hx = g.hx;
  k.hz = g.hz;
  k.seg = g.seg;
  k.y = tr.h[g.seg];
  k.cp = tr.cpSeg.length - 1;
}

/** Вернуть на последнюю пройденную КТ: стоит, призрак. Бонус и круги остаются. */
export function respawn(k: KartState, tr: Track): void {
  const j = tr.cpSeg[k.cp];
  k.x = tr.px[j];
  k.y = tr.h[j];
  k.z = tr.pz[j];
  k.vx = 0;
  k.vy = 0;
  k.vz = 0;
  k.hx = tr.tx[j];
  k.hz = tr.tz[j];
  k.steer = 0;
  k.seg = j;
  k.grounded = 1;
  k.drift = 0;
  k.driftT = 0;
  k.hop = 0;
  k.boostT = 0;
  k.boostLvl = 0;
  k.slowT = 0;
  k.spinT = 0;
  k.ghostT = GHOST_TICKS;
}

const loc: TrackLoc = makeLoc();
const sc = { s: 0, c: 0 };

/**
 * Стены: упереть в край, нормальную скорость — назад с отскоком, касательную — чуть погасить.
 * В шаге карта (ev есть) ещё и носом в стену — курс доворачивает вдоль неё, а трение о стену тормозит:
 * застрять нельзя, но и ехать «по стенке» медленнее, чем по дороге.
 */
function walls(k: KartState, tr: Track, lc: TrackLoc, ev: KartEvents | null): void {
  const hw = lc.hw;
  const lim = hw - KART_R;
  const j = lc.seg;
  let nx: number;
  let nz: number;
  let depth: number;
  if (lc.lat > lim && lc.lat < hw + WALL_REACH && !tr.openR[j]) {
    nx = -tr.tz[j];
    nz = tr.tx[j];
    depth = lc.lat - lim;
    lc.lat = lim;
  } else if (lc.lat < -lim && lc.lat > -hw - WALL_REACH && !tr.openL[j]) {
    nx = tr.tz[j];
    nz = -tr.tx[j];
    depth = -lim - lc.lat;
    lc.lat = -lim;
  } else return;
  k.x -= nx * depth;
  k.z -= nz * depth;
  if (ev) alongWall(k, tr.tx[j], tr.tz[j], nx, nz);
  const vn = k.vx * nx + k.vz * nz;
  if (vn <= 0) return;
  const keep = 1 - WALL_FRICTION * Math.min(1, vn / 10) - (ev ? WALL_SCRAPE : 0);
  const tx = (k.vx - nx * vn) * keep;
  const tz = (k.vz - nz * vn) * keep;
  k.vx = tx - nx * vn * WALL_BOUNCE;
  k.vz = tz - nz * vn * WALL_BOUNCE;
  if (ev && vn > ev.wall) ev.wall = vn;
}

/** Носом в стену (n — от дороги в стену, t — вдоль трассы): курс — на долю ближе к «вдоль стены». */
function alongWall(k: KartState, tx: number, tz: number, nx: number, nz: number): void {
  if (k.hx * nx + k.hz * nz <= 0) return;
  // вдоль стены — в ту сторону, куда нос и так смотрел; лоб в лоб — по ходу трассы
  const s = k.hx * tx + k.hz * tz < -0.05 ? -1 : 1;
  const hx = k.hx + (s * tx - k.hx) * WALL_ALIGN;
  const hz = k.hz + (s * tz - k.hz) * WALL_ALIGN;
  const inv = 1 / Math.sqrt(hx * hx + hz * hz);
  k.hx = hx * inv;
  k.hz = hz * inv;
}

/** Удержать в коридоре после толчка (сервер): стены, высоту не трогает. */
export function constrain(k: KartState, tr: Track): void {
  locate(tr, k.x, k.z, k.seg, loc);
  k.seg = loc.seg;
  walls(k, tr, loc, null);
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

const hit = makeHit();
const loc2: TrackLoc = makeLoc();

export function stepKart(k: KartState, inp: Input, tr: Track, ev: KartEvents, canDrive: boolean): void {
  resetEvents(ev);
  const beforeX = k.x;
  const beforeZ = k.z;
  // 0. Время гонки идёт только на трассе (на решётке карт стоит)
  if (canDrive && k.rt < RT_MAX) k.rt++;
  // 1. Кнопки и таймеры
  const b = k.done ? 0 : inp.buttons;
  const pressed = b & ~k.prevButtons;
  k.prevButtons = b;
  if (k.boostT > 0 && --k.boostT === 0) k.boostLvl = 0;
  if (k.slowT > 0) k.slowT--;
  if (k.spinT > 0) k.spinT--;
  if (k.ghostT > 0) k.ghostT--;
  if (k.itemT > 0) k.itemT--;

  // 3. R — назад на КТ
  if ((pressed & BTN_RELOAD) !== 0 && canDrive && k.ghostT === 0) {
    respawn(k, tr);
    ev.respawn = true;
    return;
  }

  // 4–5. Руль сглаживается всегда; на решётке и сразу после возврата карт стоит
  const steerTo = k.spinT > 0 ? 0 : ((b & BTN_LEFT) !== 0 ? 1 : 0) - ((b & BTN_RIGHT) !== 0 ? 1 : 0);
  k.steer = approach(k.steer, steerTo, STEER_RATE * DT);
  if (!canDrive || k.ghostT > GHOST_TICKS - FREEZE_TICKS) {
    k.vx = 0;
    k.vy = 0;
    k.vz = 0;
    k.drift = 0;
    k.driftT = 0;
    return;
  }

  // 6. Бонус
  if ((pressed & (BTN_USE | BTN_FIRE)) !== 0 && k.item !== ITEM_NONE && k.itemT === 0) {
    if (k.item === ITEM_TURBO) {
      k.boostT = TURBO_TICKS;
      k.boostLvl = 3;
    }
    if (k.item === ITEM_CLEAN) {
      k.slowT = 0;
      k.spinT = 0;
      k.boostT = Math.max(k.boostT, 45);
      k.boostLvl = 3;
    }
    ev.used = k.item;
    k.item = ITEM_NONE;
  }

  // 7. Подскок и занос: нажал пробел — подскок; приземлился, держа пробел и руль, — занос в сторону руля
  // (руль можно довернуть и чуть позже, в окне HOP_WINDOW); отпустил пробел — мини-турбо по времени заноса
  let f = k.vx * k.hx + k.vz * k.hz;
  const space = (b & BTN_JUMP) !== 0;
  if (k.drift === 0) {
    if (!space) k.hop = 0;
    else if ((pressed & BTN_JUMP) !== 0 && k.spinT === 0) {
      // в воздухе (с трамплина) — без толчка вверх, но занос на приземлении будет
      k.hop = 1;
      if (k.grounded) {
        k.grounded = 0;
        k.vy = HOP_VY;
        ev.hop = true;
      }
    } else if (k.hop > 0 && k.grounded) {
      k.hop++;
      if (k.hop > HOP_WINDOW + 1) k.hop = 0;
      else if (k.spinT === 0 && f > DRIFT_START && (k.steer > DRIFT_STEER || k.steer < -DRIFT_STEER)) {
        k.drift = k.steer > 0 ? 1 : -1;
        k.driftT = 0;
        k.hop = 0;
        ev.drift = 1;
      }
    }
  } else if (!space || f < DRIFT_KEEP || k.spinT > 0) {
    const lvl = space ? 0 : k.driftT >= MT2_TICKS ? 2 : k.driftT >= MT1_TICKS ? 1 : 0;
    if (lvl > 0 && k.boostLvl <= lvl) {
      k.boostLvl = lvl;
      k.boostT = Math.max(k.boostT, lvl === 2 ? MT2_BOOST : MT1_BOOST);
      ev.mt = lvl;
    }
    k.drift = 0;
    k.driftT = 0;
    ev.drift = 2;
  } else if (k.driftT < 9999) k.driftT++;

  // 8. Поворот курса: на месте — вполсилы, с TURN_FULL_AT — в полную, к полной скорости — слабее.
  // Задним ходом руль наоборот, как у машины; на месте и чуть назад — как вперёд, чтобы не дёргался при смене.
  const af = f < 0 ? -f : f;
  let turn = TURN_RATE * (TURN_MIN + (1 - TURN_MIN) * Math.min(1, af / TURN_FULL_AT)) * (1 - TURN_FALL * Math.min(1, af / MAX_SPEED));
  let steer = k.steer;
  if (k.drift !== 0) {
    steer = k.drift * (0.75 + 0.4 * k.steer * k.drift);
    turn *= DRIFT_TURN;
  }
  // в подскоке рулит как на земле — довернуть перед заносом
  if (!k.grounded && k.hop !== 1) turn *= AIR_TURN;
  if (k.spinT > 0) turn = 0;
  const w = steer * turn * (f >= 0 ? 1 : Math.max(-1, 1 + f));
  if (w !== 0) {
    sinCos(w * DT, sc);
    const hx = k.hx * sc.c + k.hz * sc.s;
    const hz = k.hz * sc.c - k.hx * sc.s;
    const inv = 1 / Math.sqrt(hx * hx + hz * hz);
    k.hx = hx * inv;
    k.hz = hz * inv;
  }

  // 9. Скорость вперёд и вбок по новому курсу
  if (k.grounded) {
    const rx = -k.hz;
    const rz = k.hx;
    f = k.vx * k.hx + k.vz * k.hz;
    let l = k.vx * rx + k.vz * rz;
    let cap = MAX_SPEED;
    // ускоритель под колёсами — турбо; лужа — сцепление почти пропадает
    if (tr.hz.pads.length > 0 && padAt(tr.hz, k.x, k.z) !== null) {
      if (k.boostT < PAD_TICKS - 1) ev.dash = true;
      if (k.boostT < PAD_TICKS) k.boostT = PAD_TICKS;
      k.boostLvl = 3;
    }
    const slick = tr.hz.slicks.length > 0 ? slickAt(tr.hz, k.x, k.z) : null;
    if (k.boostT > 0) cap = k.boostLvl === 3 ? TURBO_SPEED : k.boostLvl === 2 ? MT2_SPEED : MT1_SPEED;
    if (k.slowT > 0 && cap > SLOW_SPEED) cap = SLOW_SPEED;
    const free = k.done === 0 && k.spinT === 0;
    const gas = free && (b & BTN_FORWARD) !== 0;
    // затормозил до нуля — в том же тике разгон в другую сторону: иначе боковая скорость, которая при повороте на месте
    // каждый тик чуть-чуть уходит «назад», не даёт тронуться никогда
    if (k.done) f = approach(f, 0, COAST * 2 * DT);
    else if (free && (b & BTN_BACK) !== 0) {
      if (f > 0) f = Math.max(0, f - BRAKE * DT);
      if (f <= 0) f = Math.max(-REVERSE_SPEED, f - REVERSE_ACCEL * DT);
    } else if (gas || k.boostT > 0) {
      if (f < 0) f = Math.min(0, f + BRAKE * DT);
      if (f >= 0 && f < cap) {
        let a = gas ? ACCEL * (1 - (ACCEL_FALL * f) / cap) : 0;
        if (k.boostT > 0 && a < BOOST_ACCEL) a = BOOST_ACCEL;
        f = Math.min(cap, f + a * DT);
      }
    } else f = approach(f, 0, COAST * DT);
    if (f > cap) f = Math.max(cap, f - OVER_DECEL * DT);
    if (slick) {
      ev.slick = slick.kind + 1;
      l *= 1 - slick.grip;
    } else l *= 1 - (k.drift !== 0 ? DRIFT_GRIP : GRIP);
    k.vx = k.hx * f + rx * l;
    k.vz = k.hz * f + rz * l;
  }

  // 10–11. Сдвиг, отрезок, стены
  const ox = k.x;
  const oz = k.z;
  k.x += k.vx * DT;
  k.z += k.vz * DT;
  locate(tr, k.x, k.z, k.seg, loc);
  k.seg = loc.seg;
  // бочки, блоки и движущиеся помехи (призраки и финишировавшие проезжают насквозь)
  if (k.ghostT === 0 && k.done === 0 && (tr.hz.solids.length > 0 || tr.hz.movers.length > 0)) {
    hit.sev = 0;
    hit.hard = 0;
    hit.what = 0;
    collide(tr.hz, k, k.rt, KART_R, hit);
    if (hit.sev > 0) {
      ev.hit = hit.sev;
      ev.hitKind = hit.what;
      if (hit.hard) {
        if (k.spinT < HIT_SPIN_TICKS) k.spinT = HIT_SPIN_TICKS;
        if (k.slowT < HIT_SLOW_TICKS) k.slowT = HIT_SLOW_TICKS;
      }
      locate(tr, k.x, k.z, k.seg, loc);
      k.seg = loc.seg;
    }
  }
  // в полёте вдали от дороги карт может лететь над другой частью трассы (срезка через бухту): ищем по всей
  if (!k.grounded && (loc.lat > loc.hw + FLIGHT_LOOKUP || loc.lat < -loc.hw - FLIGHT_LOOKUP)) {
    locateAny(tr, k.x, k.z, loc2);
    if (loc2.seg !== loc.seg && Math.abs(loc2.lat) <= loc2.hw + EDGE_GROUND) {
      loc.seg = loc2.seg;
      loc.t = loc2.t;
      loc.lat = loc2.lat;
      loc.ground = loc2.ground;
      loc.hw = loc2.hw;
      k.seg = loc.seg;
    }
  }
  walls(k, tr, loc, ev);

  // 12. Земля и полёт: дорога или настил (трамплин вне оси), что выше
  let gy = loc.ground !== NO_GROUND && (loc.lat <= loc.hw + EDGE_GROUND && loc.lat >= -loc.hw - EDGE_GROUND) ? loc.ground : NO_GROUND;
  if (tr.hz.decks.length > 0) {
    const d = deckAt(tr.hz, k.x, k.z);
    if (d > gy) gy = d;
  }
  const ground = gy !== NO_GROUND;
  if (k.grounded && ground) {
    // подъём за тик — вертикальная скорость: с края трамплина карт улетает вверх
    k.vy = (gy - k.y) / DT;
    k.y = gy;
  } else {
    k.grounded = 0;
    k.vy -= KART_GRAVITY * DT;
    k.y += k.vy * DT;
    if (ground && k.y <= gy) {
      if (k.y >= gy - LAND_SNAP) {
        ev.land = -k.vy;
        k.y = gy;
        k.vy = 0;
        k.grounded = 1;
      } else {
        // стенка причала или канала: назад, дальше отвесно вниз
        k.x = ox;
        k.z = oz;
        k.vx = 0;
        k.vz = 0;
        locate(tr, k.x, k.z, k.seg, loc);
        k.seg = loc.seg;
      }
    }
  }

  // 13. Вода
  if (k.y < WATER_Y - 0.4) {
    ev.splash = true;
    respawn(k, tr);
    return;
  }

  // 14. Контрольные точки и круги
  if (k.done || !k.grounded || loc.lat > loc.hw + EDGE_GROUND || loc.lat < -loc.hw - EDGE_GROUND) return;
  const c = k.cp + 1 < tr.cpSeg.length ? k.cp + 1 : 0;
  const cpSeg = tr.cpSeg[c];
  const before = (beforeX - tr.px[cpSeg]) * tr.tx[cpSeg] + (beforeZ - tr.pz[cpSeg]) * tr.tz[cpSeg];
  const after = (k.x - tr.px[cpSeg]) * tr.tx[cpSeg] + (k.z - tr.pz[cpSeg]) * tr.tz[cpSeg];
  const reached = tr.strictCheckpoints
    ? wrapSeg(tr, k.seg - cpSeg) < 3 && before <= 0 && after > 0
    : wrapSeg(tr, k.seg - cpSeg) < CP_WINDOW;
  if (reached) {
    k.cp = c;
    ev.cp = true;
    if (c === 0) {
      k.lap++;
      ev.lap = true;
      if (k.lap > RC_LAPS) {
        k.done = 1;
        ev.finish = true;
      }
    }
  }
}
