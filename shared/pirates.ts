// «Набег пиратов» на набережной (флаг сервера PIRATES): общее для сервера и клиента. Корабль «Весёлый Мармелад» встаёт на
// якорь в море перед набережной и спускает шлюпки; пираты-желейки высаживаются на причал и тащат ящики с рыбой и бочки;
// защитники красят их маркерами, береговыми пушками топят шлюпки и пробивают корабль. Здесь: правила и числа (все
// настраиваются в одном месте), геометрия (док, кучи добычи, пушки, корабль, маршруты шлюпок), дуги ядер, наведение пушки,
// награды и формат сообщений. Без three.js и DOM — проверяется в node (test/pirates*.test.ts). Сервер: server/lobby/pirates.ts,
// сцена и панель: client/lobby/pirates.ts. События никого не двигает и не оглушает: пираты и ядра игроков не касаются.
import { TICK_RATE, WATER_Y } from './constants.ts';
import { PIVOT_Y } from './aim.ts';
import { viewDir } from './math.ts';

// ------------------------------------------------------------ время и числа

/** Анонс: колокол, корабль идёт к набережной; в конце — набег */
export const PIRATE_WARN = 30 * TICK_RATE;
/** Корабль идёт и разворачивается бортом (дальше стоит на якоре); ящики на причале — с PIRATE_LOOT_AT, пушки — с PIRATE_GUNS_AT */
export const PIRATE_SAIL = 22 * TICK_RATE;
export const PIRATE_LOOT_AT = 24 * TICK_RATE;
export const PIRATE_GUNS_AT = 26 * TICK_RATE;
/** Набег не дольше; финал (корабль уходит, итоги на экране) */
export const PIRATE_LIMIT = 240 * TICK_RATE;
export const PIRATE_END = 14 * TICK_RATE;
/** Корабль уходит: сколько длится его уход с экрана */
export const PIRATE_FLEE_TICKS = 14 * TICK_RATE;
/** Волн шлюпок; следующая — через столько после разбитой предыдущей, но не позже чем через столько после запуска */
export const PIRATE_WAVES = 4;
export const PIRATE_WAVE_GAP = 8 * TICK_RATE;
export const PIRATE_WAVE_MAX = 45 * TICK_RATE;
/** Ящиков и бочек на причале и сколько можно потерять: утащили столько — поражение */
export const PIRATE_LOOT = 12;
export const PIRATE_LIMIT_STOLEN = 6;
/** Маркер: пауза между шариками, дальность, радиус попадания (щедрый: пираты бегают) */
export const PIRATE_MARKER_CD = 20;
export const PIRATE_MARKER_RANGE = 26;
export const PIRATE_HIT_R = 0.85;
export const PIRATE_CAPTAIN_HIT_R = 1.15;
/** Пират: попаданий до «заляпан», оглушение от попадания; капитан — свои числа */
export const PIRATE_HP = 2;
export const PIRATE_CAPTAIN_HP = 8;
export const PIRATE_STUN = 54;
/** Береговые пушки: перезарядка, радиус «стоишь у пушки», скорость ядра, радиус всплеска, высота дула */
export const PIRATE_CANNON_CD = 210;
export const PIRATE_CANNON_R = 2.4;
export const PIRATE_BALL_SPEED = 26;
export const PIRATE_SPLASH_R = 3.1;
export const PIRATE_MUZZLE_Y = 1.0;
export const PIRATE_CANNON_RANGE = 70;
/** Шлюпка: попаданий до дна, скорость на веслах туда и обратно (с грузом), м/с */
export const PIRATE_BOAT_HP = 2;
export const PIRATE_ROW_IN = 3.2;
export const PIRATE_ROW_OUT = 2.9;
/** Пираты: бег, с добычей, капитан в ярости, м/с */
export const PIRATE_RUN = 3.3;
export const PIRATE_CARRY = 2.3;
export const PIRATE_CAPTAIN_RUN = 3.7;
/** Обстрел с корабля: через сколько после начала набега и как часто, сколько летит ядро, радиус сбитых ящиков */
export const PIRATE_SHELL_FIRST = 6 * TICK_RATE;
export const PIRATE_SHELL_EVERY = 8 * TICK_RATE;
export const PIRATE_SHELL_FLIGHT = Math.round(2.6 * TICK_RATE);
export const PIRATE_SHELL_R = 2.6;
/** Спасти ящик — подойти ближе */
export const PIRATE_SAVE_R = 1.15;
/** Награда: жетоны за заслуги (не больше), за итог */
export const PIRATE_REWARD_CAP = 25;
export const PIRATE_REWARD_WIN = 20;
export const PIRATE_REWARD_MVP = 10;
export const PIRATE_REWARD_LOSS = 5;
/** Сколько выстрелов (краской или ядром) делают защитника участником и без попаданий: итоговые жетоны получает и он */
export const PIRATE_PARTICIPATE = 3;

// ------------------------------------------------------------ места

/** Корабль на якоре: середина корпуса и курс (нос на запад: yaw как у игроков, 0 смотрит на −Z); бортом к набережной */
export const PIRATE_SHIP = { x: 8, z: 50, yaw: Math.PI / 2, ax: 9.5, az: 3.4 } as const;
/** Куча ящиков и бочек: центр и места четырёх вещей (чётный номер — ящик, нечётный — бочка) */
export const PIRATE_PILES: ReadonlyArray<{ x: number; z: number }> = [{ x: -1.0, z: 16.0 }, { x: 12.0, z: 16.0 }, { x: 20.0, z: 16.0 }];
const PILE_AT: ReadonlyArray<readonly [number, number]> = [[-0.65, -0.35], [0.55, -0.55], [-0.45, 0.6], [0.65, 0.5]];
export interface LootHome { x: number; z: number; pile: number }
export const PIRATE_LOOT_HOME: readonly LootHome[] = PIRATE_PILES.flatMap((p, pile) => PILE_AT.map(([dx, dz]) => ({ x: p.x + dx, z: p.z + dz, pile })));
/** Вещь с этим номером — бочка (иначе ящик с рыбой) */
export const lootIsBarrel = (id: number): boolean => id % 2 === 1;
/** Причалы шлюпок у кромки: шлюпка носом к причалу (нос на север), ступают на причал в точке выхода */
export interface PirateDock { x: number; z: number; exitX: number; exitZ: number; pile: number }
export const PIRATE_DOCKS: readonly PirateDock[] = [
  { x: 0, z: 24.1, exitX: 0, exitZ: 21.0, pile: 0 },
  { x: 16, z: 24.1, exitX: 16, exitZ: 21.0, pile: 1 },
  { x: 23, z: 24.1, exitX: 23, exitZ: 21.0, pile: 2 },
];
/** Маршруты шлюпок от борта корабля к причалам (x, z); обходят декоративную лодку у (6; 40) и жёлтый буй у (−8; 34) */
const ROUTES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[2, 46], [-2, 40.5], [-2.5, 31], [0, 25.8], [0, 24.1]],
  [[9, 46], [13, 37], [16, 29], [16, 24.1]],
  [[14, 46], [20, 37.5], [23, 29], [23, 24.1]],
];
/** Береговые пушки: на кромке между причалами, смотрят в море */
export const PIRATE_CANNONS: ReadonlyArray<{ x: number; z: number }> = [{ x: -2.6, z: 20.6 }, { x: 6.0, z: 20.6 }, { x: 18.6, z: 20.6 }];
/** Рабочая полоса пиратов: к северу от неё и в кафе они не заходят; южнее z = 22 — вода */
export const PIRATE_ZONE = { x0: -7, x1: 27, z0: 12.5, z1: 22 } as const;
/** Скамейки на кромке: пираты их обходят (под ними сидят) */
export const PIRATE_BENCHES: ReadonlyArray<{ x: number; z: number }> = [{ x: -8, z: 19.5 }, { x: 0, z: 19.5 }, { x: 8, z: 19.5 }];
/** Цвета краски стрелков (по номеру в снимке): розовый, синий, жёлтый, зелёный, фиолетовый, оранжевый, бирюзовый, красный */
export const PIRATE_PAINT: readonly number[] = [0xff5a8a, 0x4a8bff, 0xffc23a, 0x4cd08a, 0xb36bff, 0xff8a3a, 0x36c8d8, 0xff4d4d];
export const paintOf = (slot: number): number => PIRATE_PAINT[((slot % 8) + 8) % 8];
/** Во время набега камера над плечом (client/lobby/camera.ts): центр экрана — луч, смещённый вправо на столько метров и вверх на PIRATE_AIM_UP */
export const PIRATE_SHOULDER = 0.7;
export const PIRATE_AIM_UP = 0.15;
/** Откуда идёт луч прицела (маркера и пушки): точка на центральном луче камеры, не зависит от приближения колесом мыши (shared/aim.ts cameraRig) */
export function aimOrigin(x: number, y: number, z: number, yaw: number): V3 {
  return { x: x + Math.cos(yaw) * PIRATE_SHOULDER, y: y + PIVOT_Y + PIRATE_AIM_UP, z: z - Math.sin(yaw) * PIRATE_SHOULDER };
}

// ------------------------------------------------------------ состояния

export type PiratePhase = 'idle' | 'warn' | 'raid' | 'end';
/** Состояние пирата (то же число — состояние модели MobAnim.st в client/lobby/piratemodels.ts) */
export const PS_IDLE = 0, PS_RUN = 1, PS_GRAB = 2, PS_CARRY = 3, PS_JUMP = 4, PS_STUN = 5, PS_ROW = 6, PS_SEAT = 7, PS_CHEER = 8, PS_FLEE = 9;
/** Признаки пирата в снимке: капитан, злится, несёт ящик, несёт бочку, в шлюпке (x — номер шлюпки, z — место) */
export const PL_CAPTAIN = 1, PL_RAGE = 2, PL_CRATE = 4, PL_BARREL = 8, PL_ABOARD = 16;
/** Состояние шлюпки: идёт к причалу, швартуется, стоит у причала, идёт назад, тонет, ушла */
export const DS_IN = 0, DS_MOOR = 1, DS_DOCK = 2, DS_OUT = 3, DS_SUNK = 4, DS_GONE = 5;
/** Состояние вещи: в куче, у пирата, на земле, в шлюпке, украдена, прыгает обратно в кучу */
export const LS_PILE = 0, LS_CARRIED = 1, LS_DROPPED = 2, LS_BOAT = 3, LS_STOLEN = 4, LS_HOP = 5;
/** Вид попадания ядра: вода, шлюпка, корабль */
export const SK_WATER = 0, SK_BOAT = 1, SK_SHIP = 2;

export interface PirateResult { pid: number; nick: string; kos: number; sinks: number; hits: number; saves: number; tokens: number; mvp: boolean }
/** Медленное состояние (раз в секунду и при изменениях): фаза, полоски, итоги */
export interface PirateView {
  id: string;
  phase: PiratePhase;
  /** Тик начала анонса: от него считаются заход корабля и таймеры анимаций */
  t0: number;
  /** Тик начала этой фазы и её конца (в набеге — потолок времени) */
  start: number;
  end: number;
  wave: number;
  waves: number;
  /** Прочность корабля сейчас и в начале */
  hp: number;
  hpMax: number;
  /** Украдено, предел (поражение), ящиков на причале (в куче и на земле), всего */
  stolen: number;
  limit: number;
  left: number;
  total: number;
  /** С какого тика корабль уходит (0 — на якоре) */
  fleeAt: number;
  win: boolean;
  results: PirateResult[];
}
export const emptyPirates = (): PirateView => ({ id: '', phase: 'idle', t0: 0, start: 0, end: 0, wave: 0, waves: PIRATE_WAVES, hp: 0, hpMax: 0, stolen: 0, limit: PIRATE_LIMIT_STOLEN, left: 0, total: PIRATE_LOOT, fleeAt: 0, win: false, results: [] });

/** Пират в снимке: [номер, x, z, курс, состояние PS_*, попаданий осталось, признаки PL_*, номер вещи или −1]; в шлюпке x — её номер, z — место */
export type PirateRow = readonly [number, number, number, number, number, number, number, number];
/** Шлюпка: [номер, x, z, курс, состояние DS_*, груза на борту, экипажа на борту, прочность] */
export type DinghyRow = readonly [number, number, number, number, number, number, number, number];
/** Вещь: [номер, состояние LS_*, x, z] */
export type LootRow = readonly [number, number, number, number];
/** Быстрое состояние (10 раз в секунду): k — тик сервера; вещи l — только когда что-то изменилось и раз в 2 с */
export interface PirateSnapMsg { t: 'pnow'; k: number; p: PirateRow[]; d: DinghyRow[]; l?: LootRow[] }
/**
 * Разовые эффекты (кортеж: название, числа…); k — тик сервера, к которому они относятся. Названия и числа:
 * fire: пушка, выстрел, дуло x y z, цель x y z, тиков полёта, yaw, pitch, номер стрелка, вид SK_*
 * sh: выстрел, орудие корабля 0…3, цель x z, тиков полёта (ядро корабля по причалу)
 * sk: выстрел, x, z (ядро корабля упало на причал; сбитые вещи — в снимке)
 * pt: стрелок, дуло x y z, конец x y z, попал 0/1 (шарик краски)
 * ph: пират, стрелок, осталось попаданий, x, z (попали краской)
 * ko: пират, стрелок, x, z (заляпан) · fl: пират, x, z (прыгнул в воду)
 * dh: шлюпка, осталось, стрелок, x, z (ядро попало) · sink: шлюпка, стрелок, x, z (затонула)
 * st: вещь, x, z (ушла на корабль) · rs: вещь, стрелок, x, z (спасена) · dr: вещь, x, z (упала) · pk: вещь, пират (подняли)
 * hit: стрелок, номер попадания по кораблю, x, y, z (ядро попало в корабль) · wave: номер, шлюпок · anchor · flee
 */
export type PirateFx = readonly [string, ...number[]];
export interface PirateFxMsg { t: 'pfx'; k: number; e: PirateFx[] }

// ------------------------------------------------------------ корабль

export interface ShipPose { x: number; z: number; yaw: number; speed: number; anchored: number; turn: number; flee: number }
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (a: number, b: number, v: number): number => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Курс по направлению (dx, dz): как у игроков, 0 смотрит на −Z */
export const yawOf = (dx: number, dz: number): number => Math.atan2(-dx, -dz);
function wrapPi(a: number): number { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function bez(p0: number, p1: number, p2: number, u: number): number { const v = 1 - u; return v * v * p0 + 2 * v * u * p1 + u * u * p2; }
/** Корабль идёт с юго-востока: дуга от горизонта к якорю, в конце — разворот бортом к набережной */
const SAIL: readonly [number, number][] = [[70, 170], [30, 100], [PIRATE_SHIP.x, PIRATE_SHIP.z]];
/** Уходит на юг с поворотом вправо, разгоняясь */
const FLEE: readonly [number, number][] = [[PIRATE_SHIP.x, PIRATE_SHIP.z], [-4, 66], [6, 230]];

function sailAt(s: number, out: ShipPose): void {
  const u = 1 - (1 - s) * (1 - s);
  out.x = bez(SAIL[0][0], SAIL[1][0], SAIL[2][0], u);
  out.z = bez(SAIL[0][1], SAIL[1][1], SAIL[2][1], u);
  const du = 2 * (1 - u) * (SAIL[1][0] - SAIL[0][0]) + 2 * u * (SAIL[2][0] - SAIL[1][0]);
  const dv = 2 * (1 - u) * (SAIL[1][1] - SAIL[0][1]) + 2 * u * (SAIL[2][1] - SAIL[1][1]);
  const k = smooth(0.7, 1, s);
  const tangent = yawOf(du, dv);
  out.yaw = tangent + wrapPi(PIRATE_SHIP.yaw - tangent) * k;
  // скорость: производная по времени (u растёт к 1 с замедлением)
  const dus = 2 * (1 - s);
  out.speed = Math.hypot(du, dv) * dus / (PIRATE_SAIL / TICK_RATE);
  out.turn = k > 0 && k < 1 ? -0.8 * Math.sin(k * Math.PI) : 0;
}

/** Поза корабля по тику (одна и та же у сервера и у всех клиентов); false — корабля нет (до анонса и после ухода) */
export function shipPose(v: Pick<PirateView, 'phase' | 't0' | 'fleeAt'>, tick: number, out: ShipPose): boolean {
  out.anchored = 0; out.speed = 0; out.turn = 0; out.flee = 0;
  if (v.phase === 'idle') return false;
  if (v.fleeAt > 0 && tick >= v.fleeAt) {
    const s = (tick - v.fleeAt) / PIRATE_FLEE_TICKS;
    if (s >= 1.15) return false;
    const u = Math.min(1, s * s);
    out.x = bez(FLEE[0][0], FLEE[1][0], FLEE[2][0], u);
    out.z = bez(FLEE[0][1], FLEE[1][1], FLEE[2][1], u);
    const dx = 2 * (1 - u) * (FLEE[1][0] - FLEE[0][0]) + 2 * u * (FLEE[2][0] - FLEE[1][0]);
    const dz = 2 * (1 - u) * (FLEE[1][1] - FLEE[0][1]) + 2 * u * (FLEE[2][1] - FLEE[1][1]);
    const k = smooth(0, 0.45, s);
    const tangent = yawOf(dx, dz);
    out.yaw = PIRATE_SHIP.yaw + wrapPi(tangent - PIRATE_SHIP.yaw) * k;
    out.speed = Math.hypot(dx, dz) * 2 * s / (PIRATE_FLEE_TICKS / TICK_RATE);
    out.flee = Math.min(1, s * 3);
    out.turn = 0.7 * Math.sin(k * Math.PI);
    return true;
  }
  const s = (tick - v.t0) / PIRATE_SAIL;
  if (s < 0) return false;
  if (s >= 1) {
    out.x = PIRATE_SHIP.x; out.z = PIRATE_SHIP.z; out.yaw = PIRATE_SHIP.yaw; out.anchored = 1;
    return true;
  }
  sailAt(s, out);
  out.anchored = smooth(0.8, 1, s);
  return true;
}

// ------------------------------------------------------------ маршруты шлюпок

export interface Route { pts: number[]; cum: number[]; total: number }
export function makeRoute(pts: ReadonlyArray<readonly [number, number]>): Route {
  const flat: number[] = [], cum = [0];
  for (const [x, z] of pts) flat.push(x, z);
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts: flat, cum, total: cum[cum.length - 1] };
}
export const PIRATE_ROUTES: readonly Route[] = ROUTES.map(makeRoute);
/** Откуда спускают шлюпку к этому причалу */
export const launchPoint = (dock: number): { x: number; z: number } => ({ x: PIRATE_ROUTES[dock].pts[0], z: PIRATE_ROUTES[dock].pts[1] });
/** Точка маршрута на расстоянии d от корабля и курс по ходу (rev — идёт назад, от причала к кораблю) */
export function routeAt(r: Route, d: number, rev: boolean, out: { x: number; z: number; yaw: number }): void {
  const n = r.cum.length;
  const at = Math.min(r.total, Math.max(0, d));
  let i = 1;
  while (i < n - 1 && r.cum[i] < at) i++;
  const seg = r.cum[i] - r.cum[i - 1] || 1, k = (at - r.cum[i - 1]) / seg;
  const x0 = r.pts[(i - 1) * 2], z0 = r.pts[(i - 1) * 2 + 1], x1 = r.pts[i * 2], z1 = r.pts[i * 2 + 1];
  out.x = lerp(x0, x1, k);
  out.z = lerp(z0, z1, k);
  out.yaw = yawOf(rev ? x0 - x1 : x1 - x0, rev ? z0 - z1 : z1 - z0);
}

// ------------------------------------------------------------ ядра

/** Высота дуги над хордой для полёта на dist метров */
export const shellApex = (dist: number): number => 1.5 + 0.13 * dist;
/** Тиков полёта ядра береговой пушки на dist метров по горизонтали (не меньше 0,7 с) */
export const shellTicks = (dist: number): number => Math.max(Math.round(0.7 * TICK_RATE), Math.round(dist / PIRATE_BALL_SPEED * TICK_RATE));
export interface V3 { x: number; y: number; z: number }
/** Точка ядра в долю пути u (0…1): прямая от дула к цели плюс парабола */
export function shellAt(o: V3, t: V3, apex: number, u: number, out: V3): V3 {
  out.x = o.x + (t.x - o.x) * u;
  out.z = o.z + (t.z - o.z) * u;
  out.y = o.y + (t.y - o.y) * u + 4 * apex * u * (1 - u);
  return out;
}

export interface AimBoat { id: number; x: number; z: number; vx: number; vz: number }
export interface CannonShot { ok: boolean; why: '' | 'near' | 'range'; x: number; y: number; z: number; ticks: number; kind: number; boat: number }
export const makeShot = (): CannonShot => ({ ok: false, why: '', x: 0, y: 0, z: 0, ticks: 0, kind: SK_WATER, boat: -1 });
/** Лучи у кромки: ближе этой линии (z) ядро падает на причал, а не в воду — выстрел не нужен */
export const PIRATE_WATER_Z = 22.8;
const SHIP_TOP = 12.5;

/**
 * Куда уйдёт выстрел береговой пушки (cx, cz) у игрока с опорой (px, py, pz), смотрящего по yaw/pitch. Сначала шлюпка рядом с
 * прицелом (с упреждением по её ходу: щель в 2 м плюс 4,5 % дальности), потом корабль (луч через его контур), потом вода под
 * прицелом; взгляд выше горизонта — вода в 55 м. На причал ядро не падает: ok = false. Одну и ту же функцию зовёт сервер
 * (решает) и клиент (рисует кружок прицела), так что кружок честный.
 */
export function cannonSolve(cx: number, cz: number, px: number, py: number, pz: number, yaw: number, pitch: number,
  boats: readonly AimBoat[], ship: boolean, out: CannonShot): CannonShot {
  const f = { x: 0, y: 0, z: 0 };
  viewDir(yaw, pitch, f);
  out.ok = false; out.why = ''; out.kind = SK_WATER; out.boat = -1;
  // 1. шлюпка рядом с прицелом
  let bestCross = Infinity, bx = 0, bz = 0, bid = -1;
  for (const b of boats) {
    let T = Math.max(0.7, Math.hypot(b.x - cx, b.z - cz) / PIRATE_BALL_SPEED);
    let qx = b.x, qz = b.z;
    for (let k = 0; k < 3; k++) {
      qx = b.x + b.vx * T; qz = b.z + b.vz * T;
      T = Math.max(0.7, Math.hypot(qx - cx, qz - cz) / PIRATE_BALL_SPEED);
    }
    const wx = qx - px, wy = WATER_Y + 0.4 - py, wz = qz - pz;
    const along = wx * f.x + wy * f.y + wz * f.z;
    if (along < 1.5) continue;
    const ax = wy * f.z - wz * f.y, ay = wz * f.x - wx * f.z, az = wx * f.y - wy * f.x;
    const cross = Math.hypot(ax, ay, az);
    if (cross <= 2 + 0.045 * along && cross < bestCross) { bestCross = cross; bx = qx; bz = qz; bid = b.id; }
  }
  if (bid >= 0) {
    out.x = bx; out.y = WATER_Y + 0.3; out.z = bz; out.kind = SK_BOAT; out.boat = bid;
    out.ticks = shellTicks(Math.hypot(bx - cx, bz - cz));
    out.ok = bz >= PIRATE_WATER_Z;
    out.why = out.ok ? '' : 'near';
    return out;
  }
  // 2. корабль: луч через столб над его контуром (эллипс на воде, до верхушек мачт)
  if (ship) {
    const S = PIRATE_SHIP;
    const ox = (px - S.x) / S.ax, oz = (pz - S.z) / S.az, dx = f.x / S.ax, dz = f.z / S.az;
    const a = dx * dx + dz * dz, b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - 1;
    if (a > 1e-9) {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const s = c <= 0 ? 0 : (-b - Math.sqrt(disc)) / (2 * a);
        const y = py + f.y * s;
        if (s >= 0 && s <= PIRATE_CANNON_RANGE + 20 && y >= WATER_Y - 0.4 && y <= SHIP_TOP) {
          // попали в бок корабля, обращённый к причалу: точка на борту, на высоте палубы
          out.x = px + f.x * s;
          out.z = Math.min(S.z - S.az + 0.15, Math.max(S.z - S.az - 0.2, pz + f.z * s));
          out.y = Math.min(2.4, Math.max(0.6, y));
          out.kind = SK_SHIP;
          out.ticks = shellTicks(Math.hypot(out.x - cx, out.z - cz));
          out.ok = true;
          return out;
        }
      }
    }
  }
  // 3. вода под прицелом (или в 55 м, если смотрят выше горизонта)
  let wxm: number, wzm: number;
  if (f.y < -0.002) {
    const s = (WATER_Y - py) / f.y;
    wxm = px + f.x * s; wzm = pz + f.z * s;
    const d = Math.hypot(wxm - cx, wzm - cz);
    if (d > PIRATE_CANNON_RANGE) { wxm = cx + (wxm - cx) * PIRATE_CANNON_RANGE / d; wzm = cz + (wzm - cz) * PIRATE_CANNON_RANGE / d; out.why = ''; }
  } else {
    const h = Math.hypot(f.x, f.z) || 1;
    wxm = px + f.x / h * 55; wzm = pz + f.z / h * 55;
  }
  out.x = wxm; out.y = WATER_Y + 0.05; out.z = wzm;
  out.ticks = shellTicks(Math.hypot(wxm - cx, wzm - cz));
  out.ok = wzm >= PIRATE_WATER_Z;
  out.why = out.ok ? '' : 'near';
  return out;
}

// ------------------------------------------------------------ правила волн и наград

export interface WavePlan { boats: number; crew: number[]; captain: boolean }
/** Состав волны wave (1…4) при n защитниках: шлюпок 1…4, в каждой 2–3 пирата; в последней волне — капитан */
export function wavePlan(wave: number, n: number): WavePlan {
  const people = Math.max(1, Math.min(10, Math.floor(n)));
  const boats = Math.max(1, Math.min(3, 1 + ((wave - 1) >> 1) + (people >= 3 ? 1 : 0) + (people >= 6 ? 1 : 0)));
  const per = wave >= 3 ? 3 : 2;
  const captain = wave === PIRATE_WAVES;
  const crew: number[] = [];
  for (let i = 0; i < boats; i++) crew.push(i === 0 && captain ? Math.max(3, per) : per);
  return { boats, crew, captain };
}
/** Прочность корабля на n защитников */
export const shipHpMax = (n: number): number => 8 + 3 * Math.max(1, Math.min(8, Math.floor(n)));
export interface Score { kos: number; sinks: number; hits: number; saves: number; shots?: number }
/** Условные очки заслуг: лучший защитник — у кого больше */
export const contribution = (s: Score): number => s.kos * 2 + s.sinks * 4 + s.hits + s.saves * 2;
/** Участник: есть заслуга или сделано не меньше PIRATE_PARTICIPATE выстрелов (промахи тоже труд) */
export const tookPart = (s: Score): boolean => contribution(s) > 0 || (s.shots ?? 0) >= PIRATE_PARTICIPATE;
/** Жетоны: за заслуги не больше PIRATE_REWARD_CAP, за итог — победа 20 (лучшему ещё 10), поражение 5; не участвовал — 0 */
export function pirateReward(s: Score, win: boolean, mvp: boolean): number {
  if (!tookPart(s)) return 0;
  const merit = Math.min(PIRATE_REWARD_CAP, contribution(s));
  return merit + (win ? PIRATE_REWARD_WIN + (mvp ? PIRATE_REWARD_MVP : 0) : PIRATE_REWARD_LOSS);
}
