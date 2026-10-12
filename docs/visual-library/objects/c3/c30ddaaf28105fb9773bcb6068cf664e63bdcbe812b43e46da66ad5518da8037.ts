// Физика карта: шаг 60 Гц, один и тот же на сервере и в браузере (предсказание, как у пешехода).
// Только + − × ÷, Math.sqrt/abs/min/max и sinCos — бит в бит в любом движке, снимок сверяется точно.
// Курс — единичный вектор (hx, hz): yaw = 0 смотрит в −Z, вправо по ходу — (−hz, hx).
// Управление: W/S — газ и тормоз (задний ход), A/D — руль, Space — подскок и занос (в полёте — трюк), E или ЛКМ —
// бонус, R — вернуться на последнюю контрольную точку. Газ на «1» отсчёта — ракетный старт, раньше — пробуксовка.
// На скорости руль слабеет: крутой поворот проходится тормозом или заносом; занос копит мини-турбо трёх уровней.
// За краем асфальта — трава и песок: там потолок скорости ниже (турбо его не замечает — отсюда срезки).
// Помехи трассы (shared/hazards.ts): ускорители, лужи, бочки и блоки, движущиеся помехи, настилы. Движущиеся — функция
// «времени гонки» карта rt (тиков в пути): оно лежит в состоянии карта, поэтому сервер и предсказание совпадают бит в бит.
import { DT, WATER_Y } from './constants.ts';
import { collide, deckAt, makeHit, padAt, slickAt } from './hazards.ts';
import { sinCos } from './math.ts';
import { BTN_BACK, BTN_FIRE, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, BTN_USE, type Input } from './sim.ts';
import { NO_GROUND, SURF_GRASS, SURF_ROAD, SURF_SAND, locate, locateAny, makeLoc, onGround, type Track, type TrackLoc } from './track.ts';

/** Радиус карта: стены и толчки */
export const KART_R = 0.75;
export const RC_LAPS = 3;

export const ITEM_NONE = 0;
export const ITEM_TURBO = 1;
export const ITEM_JAM = 2;
export const ITEM_PAINT = 3;
// 4–6 — щит, импульс и очистка прежней версии: номера в протоколе заняты и больше не выпадают
/** Пузырь: 8 с или один удар бонусом; при включении снимает краску и замедление */
export const ITEM_BUBBLE = 7;
/** Хлопок: волна во все стороны — кто рядом, того закрутит */
export const ITEM_CLAP = 8;
export const ITEM_ICONS = ['', '🚀', '🍯', '🎨', '', '', '', '🫧', '💥'];
export const ITEM_NAMES = ['', 'Турбо', 'Варенье', 'Краска', '', '', '', 'Пузырь', 'Хлопок'];
/** Подсказка к бонусу (баннер, когда выпал) */
export const ITEM_HINTS = [
  '', 'рывок на 1,5 с', 'банка позади: кто наедет — закрутится', 'клякса тому, кто впереди', '', '', '',
  '8 с защиты от бонусов, снимает краску', 'волна на 8 м вокруг: всех закрутит',
];
/** Что выпадает из ящиков (шансы — по месту в гонке, считает сервер) */
export const ITEM_POOL = [ITEM_TURBO, ITEM_JAM, ITEM_PAINT, ITEM_BUBBLE, ITEM_CLAP];

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
export const PAINT_TICKS = 150;
/** Пузырь держится 8 с */
export const BUBBLE_TICKS = 480;
/** Рулетка бонуса после ящика */
export const ITEM_ROLL_TICKS = 48;
/** Призрак после возврата на трассу; первые FREEZE_TICKS карт стоит */
export const GHOST_TICKS = 90;
export const FREEZE_TICKS = 30;
/** Уровни ускорения: мини-турбо 1–3 (по длине заноса) и турбо (бонус, ускоритель) */
export const BOOST_MT1 = 1;
export const BOOST_MT2 = 2;
export const BOOST_MT3 = 3;
export const BOOST_TURBO = 4;
/** Занос: столько тиков — синие, оранжевые и фиолетовые искры (мини-турбо 1, 2, 3) */
export const MT1_TICKS = 45;
export const MT2_TICKS = 90;
export const MT3_TICKS = 140;
/** Ускоритель на дороге: турбо (как у бонуса) на столько тиков */
export const PAD_TICKS = 50;
/** Удар движущейся помехой: закрутка и медленный ход (короче, чем от банки варенья) */
export const HIT_SPIN_TICKS = 26;
export const HIT_SLOW_TICKS = 60;
/** Ракетный старт: газ нажат не раньше стольких тиков до старта (цифра «1» — последние 60) */
export const ROCKET_WINDOW = 66;
/** Время гонки карта не идёт дальше этого (в снимке — uint16) */
export const RT_MAX = 65535;

/** Мини-турбо 1–3: столько тиков рывка */
const MT_BOOST = [0, 36, 66, 96];
const MAX_SPEED = 22;
/** Потолок скорости по уровню ускорения: без него, мини-турбо 1–3, турбо */
const BOOST_SPEED = [MAX_SPEED, 25.5, 27, 28.5, 30];
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
/** На полной скорости руль поворачивает слабее: × (1 − 0,58) — без заноса радиус ~23 м на 22 м/с */
const TURN_FALL = 0.58;
/** На месте руль поворачивает с такой долей силы: карт развернётся, даже стоя носом в стену */
const TURN_MIN = 0.5;
/** Полная сила руля — с такой скорости, м/с */
const TURN_FULL_AT = 5;
/** Занос поворачивает сильнее: внутрь — радиус ~14 м на полной скорости, наружу — ~40 м */
const DRIFT_TURN = 1.5;
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
/** Земля под колёсами — ещё 0,5 м за краем (край причала) */
const EDGE_GROUND = 0.5;
/** Приземлиться можно, если ниже дороги не больше чем на столько */
const LAND_SNAP = 0.45;
/** Дорога уходит вниз быстрее, чем карт (на столько м/с за тик), — карт отрывается: гребень */
const TAKEOFF_DV = 1.6;
/** Стены держат только тех, кто у края, а не тех, кто уже над водой за причалом */
const WALL_REACH = 1;
const WALL_BOUNCE = 0.3;
/** Удар о стену гасит касательную скорость: до 30% при ударе в лоб */
const WALL_FRICTION = 0.3;
/** Носом в стену: за тик касания курс доворачивает вдоль стены на такую долю (лоб в лоб — по ходу трассы) */
const WALL_ALIGN = 0.35;
/** Трётся о стену — за тик теряет такую долю скорости: ехать по стене выходит медленнее, чем по дороге */
const WALL_SCRAPE = 0.02;
/** Обочина: потолок скорости без ускорения, торможение сверх него и сцепление (трава, песок) */
const GRASS_SPEED = 15;
const SAND_SPEED = 11;
const GRASS_DECEL = 18;
const SAND_DECEL = 30;
const GRASS_GRIP = 0.16;
const SAND_GRIP = 0.1;
/** Ракетный старт: рывок мини-турбо 2 на столько тиков; газ раньше — пробуксовка на BURN_TICKS */
const ROCKET_TICKS = 70;
const BURN_TICKS = 30;
/** Трюк: засчитывается, если в полёте не меньше стольких тиков; рывок после приземления */
const TRICK_AIR = 18;
const TRICK_TICKS = 40;
/**
 * КТ засчитывается, когда карт стоит колёсами на дороге за её линией, но не дальше CP_AHEAD метров, — и только следующая
 * по порядку. Перелетел линию на трамплине — засчитается при приземлении; объехать КТ стороной нельзя.
 */
const CP_AHEAD = 60;
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
  /** 1 — колёса на земле */
  grounded: number;
  /** Занос −1/0/1 (+ — влево) и сколько тиков длится */
  drift: number;
  driftT: number;
  /** Подскок: 0 — нет, 1 — пробел нажат, ждём земли, 2… — тиков на земле после приземления + 1 */
  hop: number;
  /** Ускорение: уровень BOOST_MT1…BOOST_TURBO и сколько тиков ещё */
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
  /** Тиков в полёте (до 255) */
  air: number;
  /** Трюк: 0 — нет, 1 — взлетел с рельефа (можно), 2 — сделал (рывок после приземления) */
  trick: number;
  /** На решётке: сколько тиков подряд нажат газ (до 255) — ракетный старт или пробуксовка */
  gasT: number;
  /** Пробуксовка на старте: тиков без разгона */
  burnT: number;
  /** Поверхность под колёсами в прошлом тике: SURF_ROAD, SURF_GRASS, SURF_SAND */
  surf: number;
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
  /** Мини-турбо 1–3 */
  mt: number;
  /** Наехал на ускоритель (в этом тике — впервые) */
  dash: boolean;
  /** Едет по луже: 1 — вода, 2 — масло, 0 — нет */
  slick: number;
  /** Скорость удара о бочку, блок или движущуюся помеху, 0 — не было; что именно — hitKind (0 бочка, 1 блок, 2 движущаяся) */
  hit: number;
  hitKind: number;
  /** Старт: 1 — ракетный, 2 — пробуксовка */
  rocket: number;
  /** Трюк: 1 — сделал в полёте, 2 — приземлился с трюком (рывок) */
  trick: number;
  /** Съехал с асфальта на траву или песок (в этом тике): SURF_GRASS, SURF_SAND */
  offroad: number;
}

export function makeKartState(): KartState {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hx: 0, hz: -1, steer: 0, seg: 0, grounded: 1, drift: 0, driftT: 0, hop: 0,
    boostT: 0, boostLvl: 0, slowT: 0, spinT: 0, ghostT: 0, cp: 0, lap: 0, done: 0, item: 0, itemT: 0, prevButtons: 0, rt: 0,
    air: 0, trick: 0, gasT: 0, burnT: 0, surf: 0,
  };
}

export function makeKartEvents(): KartEvents {
  return {
    used: 0, cp: false, lap: false, finish: false, splash: false, respawn: false, wall: 0, land: 0, drift: 0, hop: false, mt: 0,
    dash: false, slick: 0, hit: 0, hitKind: 0, rocket: 0, trick: 0, offroad: 0,
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
  ev.rocket = 0;
  ev.trick = 0;
  ev.offroad = 0;
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
  dst.air = s.air;
  dst.trick = s.trick;
  dst.gasT = s.gasT;
  dst.burnT = s.burnT;
  dst.surf = s.surf;
  return dst;
}

export function kartsEqual(a: KartState, b: KartState): boolean {
  return (
    a.x === b.x && a.y === b.y && a.z === b.z && a.vx === b.vx && a.vy === b.vy && a.vz === b.vz && a.hx === b.hx &&
    a.hz === b.hz && a.steer === b.steer && a.seg === b.seg && a.grounded === b.grounded && a.drift === b.drift &&
    a.driftT === b.driftT && a.hop === b.hop && a.boostT === b.boostT && a.boostLvl === b.boostLvl && a.slowT === b.slowT &&
    a.spinT === b.spinT && a.ghostT === b.ghostT && a.cp === b.cp && a.lap === b.lap && a.done === b.done &&
    a.item === b.item && a.itemT === b.itemT && a.prevButtons === b.prevButtons && a.rt === b.rt && a.air === b.air &&
    a.trick === b.trick && a.gasT === b.gasT && a.burnT === b.burnT && a.surf === b.surf
  );
}

/** Уровень искр заноса: 0 — нет, 1–3 — мини-турбо, которое выстрелит, если отпустить пробел сейчас */
export function sparkLevel(s: KartState): number {
  if (s.drift === 0) return 0;
  return s.driftT >= MT3_TICKS ? 3 : s.driftT >= MT2_TICKS ? 2 : s.driftT >= MT1_TICKS ? 1 : 0;
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
  k.air = 0;
  k.trick = 0;
  k.burnT = 0;
  k.surf = SURF_ROAD;
}

const loc: TrackLoc = makeLoc();
const sc = { s: 0, c: 0 };

/**
 * Стены — за обочиной: упереть в ограждение, нормальную скорость — назад с отскоком, касательную — погасить.
 * В шаге карта (ev есть) ещё и носом в стену — курс доворачивает вдоль неё, а трение о стену тормозит:
 * застрять нельзя, но и ехать «по стенке» медленнее, чем по дороге.
 */
function walls(k: KartState, tr: Track, lc: TrackLoc, ev: KartEvents | null): void {
  const j = lc.seg;
  const edgeR = lc.hw + lc.vr;
  const edgeL = lc.hw + lc.vl;
  let nx: number;
  let nz: number;
  let depth: number;
  if (lc.lat > edgeR - KART_R && lc.lat < edgeR + WALL_REACH && !tr.openR[j]) {
    nx = -tr.tz[j];
    nz = tr.tx[j];
    depth = lc.lat - (edgeR - KART_R);
    lc.lat = edgeR - KART_R;
  } else if (lc.lat < KART_R - edgeL && lc.lat > -edgeL - WALL_REACH && !tr.openL[j]) {
    nx = tr.tz[j];
    nz = -tr.tx[j];
    depth = KART_R - edgeL - lc.lat;
    lc.lat = KART_R - edgeL;
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

function stop(k: KartState): void {
  k.vx = 0;
  k.vy = 0;
  k.vz = 0;
  k.drift = 0;
  k.driftT = 0;
}

const hit = makeHit();
const loc2: TrackLoc = makeLoc();

export function stepKart(k: KartState, inp: Input, tr: Track, ev: KartEvents, canDrive: boolean): void {
  resetEvents(ev);
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
  if (k.burnT > 0) k.burnT--;

  // 2. R — назад на КТ
  if ((pressed & BTN_RELOAD) !== 0 && canDrive && k.ghostT === 0) {
    respawn(k, tr);
    ev.respawn = true;
    return;
  }

  // 3. Руль сглаживается всегда; на решётке карт стоит и считает, сколько держат газ
  const steerTo = k.spinT > 0 ? 0 : ((b & BTN_LEFT) !== 0 ? 1 : 0) - ((b & BTN_RIGHT) !== 0 ? 1 : 0);
  k.steer = approach(k.steer, steerTo, STEER_RATE * DT);
  if (!canDrive) {
    k.gasT = (b & BTN_FORWARD) !== 0 ? Math.min(255, k.gasT + 1) : 0;
    stop(k);
    return;
  }
  // первый тик гонки: газ на «1» — рывок, раньше — колёса буксуют полсекунды
  if (k.rt === 1 && k.gasT > 0) {
    if (k.gasT <= ROCKET_WINDOW) {
      k.boostT = ROCKET_TICKS;
      k.boostLvl = BOOST_MT2;
      ev.rocket = 1;
    } else {
      k.burnT = BURN_TICKS;
      ev.rocket = 2;
    }
  }
  k.gasT = 0;
  // сразу после возврата на трассу карт стоит
  if (k.ghostT > GHOST_TICKS - FREEZE_TICKS) {
    stop(k);
    return;
  }

  // 4. Бонус
  if ((pressed & (BTN_USE | BTN_FIRE)) !== 0 && k.item !== ITEM_NONE && k.itemT === 0) {
    if (k.item === ITEM_TURBO) {
      k.boostT = TURBO_TICKS;
      k.boostLvl = BOOST_TURBO;
    } else if (k.item === ITEM_BUBBLE) {
      k.slowT = 0;
      k.spinT = 0;
    }
    ev.used = k.item;
    k.item = ITEM_NONE;
  }

  // 5. Трюк: пробел в полёте с рельефа (не с подскока) — сальто, рывок после приземления
  if ((pressed & BTN_JUMP) !== 0 && !k.grounded && k.trick === 1 && k.spinT === 0) {
    k.trick = 2;
    ev.trick = 1;
  }
  // 6. Подскок и занос: нажал пробел — подскок; приземлился, держа пробел и руль, — занос в сторону руля
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
    const lvl = space || k.spinT > 0 ? 0 : sparkLevel(k);
    if (lvl > 0 && k.boostLvl <= lvl) {
      k.boostLvl = lvl;
      k.boostT = Math.max(k.boostT, MT_BOOST[lvl]);
      ev.mt = lvl;
    }
    k.drift = 0;
    k.driftT = 0;
    ev.drift = 2;
  } else if (k.driftT < 9999 && k.surf === SURF_ROAD) k.driftT++;

  // 7. Поворот курса: на месте — вполсилы, с TURN_FULL_AT — в полную, к полной скорости — заметно слабее.
  // Задним ходом руль наоборот, как у машины; на месте и чуть назад — как вперёд, чтобы не дёргался при смене.
  const af = f < 0 ? -f : f;
  let turn = TURN_RATE * (TURN_MIN + (1 - TURN_MIN) * Math.min(1, af / TURN_FULL_AT)) * (1 - TURN_FALL * Math.min(1, af / MAX_SPEED));
  let steer = k.steer;
  if (k.drift !== 0) {
    steer = k.drift * (0.75 + 0.4 * k.steer * k.drift);
    turn *= DRIFT_TURN;
  }
  // в подскоке рулит как на земле — довернуть перед заносом; в настоящем полёте — едва-едва
  if (!k.grounded && !(k.hop === 1 && k.trick === 0)) turn *= AIR_TURN;
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

  // 8. Скорость вперёд и вбок по новому курсу
  if (k.grounded) {
    const rx = -k.hz;
    const rz = k.hx;
    f = k.vx * k.hx + k.vz * k.hz;
    let l = k.vx * rx + k.vz * rz;
    // ускоритель под колёсами — турбо; лужа — сцепление почти пропадает
    if (tr.hz.pads.length > 0 && padAt(tr.hz, k.x, k.z) !== null) {
      if (k.boostT < PAD_TICKS - 1) ev.dash = true;
      if (k.boostT < PAD_TICKS) k.boostT = PAD_TICKS;
      k.boostLvl = BOOST_TURBO;
    }
    const slick = tr.hz.slicks.length > 0 ? slickAt(tr.hz, k.x, k.z) : null;
    let cap = k.boostT > 0 ? BOOST_SPEED[k.boostLvl] : MAX_SPEED;
    // обочина: без ускорения — потолок ниже и тормозит сильнее
    const rough = k.boostT === 0 && k.surf !== SURF_ROAD;
    if (rough) cap = Math.min(cap, k.surf === SURF_SAND ? SAND_SPEED : GRASS_SPEED);
    if (k.slowT > 0 && cap > SLOW_SPEED) cap = SLOW_SPEED;
    const free = k.done === 0 && k.spinT === 0;
    const gas = free && k.burnT === 0 && (b & BTN_FORWARD) !== 0;
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
    if (f > cap) f = Math.max(cap, f - (rough ? (k.surf === SURF_SAND ? SAND_DECEL : GRASS_DECEL) : OVER_DECEL) * DT);
    if (slick) {
      ev.slick = slick.kind + 1;
      l *= 1 - slick.grip;
    } else if (k.drift !== 0) l *= 1 - DRIFT_GRIP;
    else l *= 1 - (k.surf === SURF_SAND ? SAND_GRIP : k.surf === SURF_GRASS ? GRASS_GRIP : GRIP);
    k.vx = k.hx * f + rx * l;
    k.vz = k.hz * f + rz * l;
  }

  // 9. Сдвиг, отрезок, помехи, стены
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
  // в полёте вдали от дороги карт может лететь над другой частью трассы (срезка через воду): ищем по всей
  if (!k.grounded && !onGround(loc, FLIGHT_LOOKUP)) {
    locateAny(tr, k.x, k.z, loc2);
    if (loc2.seg !== loc.seg && onGround(loc2, EDGE_GROUND)) {
      loc.seg = loc2.seg;
      loc.t = loc2.t;
      loc.lat = loc2.lat;
      loc.ground = loc2.ground;
      loc.hw = loc2.hw;
      loc.vl = loc2.vl;
      loc.vr = loc2.vr;
      loc.surf = loc2.surf;
      k.seg = loc.seg;
    }
  }
  walls(k, tr, loc, ev);

  // 10. Земля и полёт: дорога с обочиной или настил (трамплин вне оси), что выше
  let gy = loc.ground !== NO_GROUND && onGround(loc, EDGE_GROUND) ? loc.ground : NO_GROUND;
  let surf = loc.surf;
  if (tr.hz.decks.length > 0) {
    const d = deckAt(tr.hz, k.x, k.z);
    if (d > gy) {
      gy = d;
      surf = SURF_ROAD;
    }
  }
  const ground = gy !== NO_GROUND;
  const wasGrounded = k.grounded;
  if (k.grounded && ground && (gy - k.y) / DT >= k.vy - TAKEOFF_DV) {
    // по земле: подъём за тик — вертикальная скорость (с края трамплина карт улетает вверх)
    k.vy = (gy - k.y) / DT;
    k.y = gy;
  } else {
    // в воздухе: провал, обрыв или гребень, с которого дорога уходит вниз быстрее, чем падает карт
    k.grounded = 0;
    k.vy -= KART_GRAVITY * DT;
    k.y += k.vy * DT;
    if (ground && k.y <= gy) {
      if (k.y >= gy - LAND_SNAP) {
        ev.land = -k.vy;
        k.y = gy;
        k.vy = 0;
        k.grounded = 1;
        if (k.trick === 2 && k.air >= TRICK_AIR) {
          if (k.boostLvl <= BOOST_MT1 || k.boostT === 0) {
            k.boostLvl = Math.max(k.boostLvl, BOOST_MT1);
            k.boostT = Math.max(k.boostT, TRICK_TICKS);
          }
          ev.trick = 2;
        }
        k.trick = 0;
      } else {
        // стенка причала или берега: назад, дальше отвесно вниз
        k.x = ox;
        k.z = oz;
        k.vx = 0;
        k.vz = 0;
        locate(tr, k.x, k.z, k.seg, loc);
        k.seg = loc.seg;
      }
    }
  }
  // оторвался от земли сам (гребень, трамплин, обрыв), а не подскоком — можно трюк
  if (wasGrounded && !k.grounded && !ev.hop) k.trick = 1;
  if (k.grounded) {
    k.air = 0;
    if (surf !== SURF_ROAD && k.surf === SURF_ROAD) ev.offroad = surf;
    k.surf = surf;
  } else {
    if (k.air < 255) k.air++;
    k.surf = SURF_ROAD;
  }

  // 11. Вода
  if (k.y < WATER_Y - 0.4) {
    ev.splash = true;
    respawn(k, tr);
    return;
  }

  // 12. Контрольные точки и круги: следующая по порядку, когда карт стоит на дороге за её линией (недалеко)
  if (k.done || !k.grounded || !onGround(loc, EDGE_GROUND)) return;
  const c = k.cp + 1 < tr.cpSeg.length ? k.cp + 1 : 0;
  const L = tr.length;
  let d = tr.s[loc.seg] + tr.len[loc.seg] * loc.t - tr.s[tr.cpSeg[c]];
  if (d > L / 2) d -= L;
  else if (d <= -L / 2) d += L;
  if (d >= 0 && d < CP_AHEAD) {
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
