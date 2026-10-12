// «Портовая регата»: трасса в бухте к юго-востоку от площади — с набережной её видно целиком. Коридор из поплавков
// по краям (shared/track.ts: осевая со скруглёнными углами, полуширина у каждой точки), ворота B1…B5 по порядку,
// пары жёлтых флажков (проскочил между — ускорение), камни, риф с трамплином, лодки на якоре. Стартовая арка с табло —
// на x = 64, решётка — перед ней. Считается только на + − × ÷ и Math.sqrt: сервер и браузер строят одну трассу бит
// в бит (тест следит, чтобы сюда не пробрались Math.sin, atan2 и прочие).
import { buildTrack, locateAny, makeLoc, type Track, type TrackDef } from './track.ts';

/** Номер трассы для рекордов: новая раскладка — новый номер (старые круги несравнимы) */
export const RG_COURSE = 'harbor-v1';
export const RG_LAPS = 3;

/** Узлы по ходу гонки (обход по часовой, если смотреть сверху на x вправо, z вниз) и полуширина каждой ноги, м */
const NODES = [
  { x: 34, z: 33, r: 10 }, { x: 118, z: 33, r: 11 }, { x: 119, z: 55, r: 7 }, { x: 64, z: 56, r: 8 }, { x: 64, z: 72, r: 8 },
  { x: 119, z: 73, r: 7 }, { x: 120, z: 119, r: 10 }, { x: 97, z: 119, r: 7 }, { x: 96, z: 90, r: 8 }, { x: 80, z: 90, r: 8 },
  { x: 79, z: 119, r: 7 }, { x: 37, z: 119, r: 12 },
];
const HW = [7, 7, 6, 6, 6, 7, 7, 6, 6, 6, 7, 8];
/** Линия старта и финиша — под аркой (нога 0, x = 64) */
const START = { leg: 0, at: 19.6 };
/** Ворота B1…B5: нога и метр от её начала */
const GATES = [{ leg: 2, at: 15.8 }, { leg: 5, at: 18.3 }, { leg: 7, at: 6.2 }, { leg: 10, at: 10.2 }, { leg: 11, at: 41.4 }];
/**
 * Куда ставит R (по воротам, 0 — линия старта): метров за воротами и сдвиг вправо — подальше от камней (за B4
 * на осевой — камень слева впереди, поэтому правее).
 */
const RESPAWN = [{ at: 3, lat: 0 }, { at: 3, lat: 0 }, { at: 3, lat: 0 }, { at: 3, lat: 0 }, { at: 3, lat: 3.5 }, { at: 3, lat: 0 }];
/** Пары флажков: нога, метр, сдвиг центра вправо по ходу и половина просвета между древками, м */
const FLAGS = [
  { leg: 0, at: 43.6, lat: 0, hw: 4 },
  { leg: 4, at: 10.1, lat: -3.3, hw: 2.5 },
  { leg: 9, at: 6.3, lat: -3.5, hw: 2.5 },
  { leg: 10, at: 15.2, lat: -5, hw: 2.2 },
  { leg: 11, at: 31.4, lat: 0, hw: 3 },
];

export type RgObstacleKind = 'buoy' | 'beacon' | 'rock' | 'reef' | 'moored';
/** Препятствие — отрезок (a → b) с радиусом r (у круглого a = b). Твёрдое; удар о камень — сильнее, чем о буй */
export interface RgObstacle {
  kind: RgObstacleKind;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

/** Ворота: точка на осевой, направление хода, полуширина коридора, номер точки осевой и куда ставит R */
export interface RgGate {
  x: number;
  z: number;
  tx: number;
  tz: number;
  hw: number;
  seg: number;
  rx: number;
  rz: number;
}

/** Пара флажков: середина просвета, направление хода, половина просвета */
export interface RgFlag {
  x: number;
  z: number;
  tx: number;
  tz: number;
  hw: number;
}

/** Трамплин (въезд с юга, на север): от z1 (у воды) до кромки z0 высотой h, по x — от x0 до x1 */
export interface RgRamp {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
}

export interface RgSlot {
  x: number;
  z: number;
  hx: number;
  hz: number;
}

export interface RgCourse {
  track: Track;
  /** 0 — линия старта (арка), 1…5 — ворота B1…B5 */
  gates: RgGate[];
  flags: RgFlag[];
  obstacles: RgObstacle[];
  ramp: RgRamp;
  /** Решётка: 6 мест, первый ряд — ближе к арке */
  grid: RgSlot[];
}

function legPoint(tr: Track, leg: number, at: number, lat: number): { x: number; z: number; tx: number; tz: number } {
  const l = tr.legs[leg];
  // вправо по ходу — (−dz, dx)
  return { x: l.x + l.dx * at - l.dz * lat, z: l.z + l.dz * at + l.dx * lat, tx: l.dx, tz: l.dz };
}

let cached: RgCourse | null = null;

/** Трасса (одна на процесс: собирается при первом обращении). */
export function regattaCourse(): RgCourse {
  if (cached) return cached;
  const base: TrackDef = {
    name: 'Портовая регата', nodes: NODES, width: HW[0] * 2, step: 1, start: START, checkpoints: GATES,
    ramps: [], open: [], crates: [],
  };
  // ширина: на каждой ноге — своя, на дугах — плавно от одной к другой (для ключей нужны длины ног)
  const probe = buildTrack(base);
  const widths = probe.legs.flatMap((l, i) => [{ leg: i, at: 0, w: HW[i] * 2 }, { leg: i, at: l.len, w: HW[i] * 2 }]);
  const track = buildTrack({ ...base, widths });
  const gates: RgGate[] = [];
  for (let k = 0; k < track.cpSeg.length; k++) {
    const j = track.cpSeg[k];
    const x = track.px[j];
    const z = track.pz[j];
    const tx = track.tx[j];
    const tz = track.tz[j];
    const r = RESPAWN[k];
    gates.push({ x, z, tx, tz, hw: track.hw[j], seg: j, rx: x + tx * r.at - tz * r.lat, rz: z + tz * r.at + tx * r.lat });
  }
  const flags: RgFlag[] = FLAGS.map(f => {
    const p = legPoint(track, f.leg, f.at, f.lat);
    return { x: p.x, z: p.z, tx: p.tx, tz: p.tz, hw: f.hw };
  });
  const dot = (kind: RgObstacleKind, x: number, z: number, r: number): RgObstacle => ({ kind, ax: x, az: z, bx: x, bz: z, r });
  const obstacles: RgObstacle[] = [
    // буй в шпильке и камень с маячком в «змейке» — в кольце поплавков у внутреннего края поворота
    dot('buoy', 72, 64, 0.9),
    dot('beacon', 88, 98, 1.8),
    // лодки на якоре и камень посреди коридора у флажков F4: слева — с флажками, справа — без них
    { kind: 'moored', ax: 67.5, az: 115, bx: 72.5, bz: 115, r: 1.1 },
    { kind: 'moored', ax: 46.5, az: 114, bx: 51.5, bz: 114, r: 1.1 },
    dot('rock', 60, 119.5, 1.6),
    // риф сразу за трамплином: перелетай или обходи справа
    { kind: 'reef', ax: 28.6, az: 89.5, bx: 36, bz: 89.5, r: 1.5 },
    // узкий проход перед последним поворотом
    dot('rock', 28, 50, 3),
    dot('rock', 42, 48, 3),
  ];
  const ramp: RgRamp = { x0: 29, x1: 35, z0: 92, z1: 98, h: 1.4 };
  const grid: RgSlot[] = [];
  for (const x of [58, 52, 46]) for (const z of [30, 36]) grid.push({ x, z, hx: 1, hz: 0 });
  cached = { track, gates, flags, obstacles, ramp, grid };
  return cached;
}

/** Где на осевой точка (для ботов, проверок и мира): номер точки, доля, сдвиг вправо. */
export function rgLocate(c: RgCourse, x: number, z: number): { seg: number; t: number; lat: number; hw: number } {
  const l = locateAny(c.track, x, z, makeLoc());
  return { seg: l.seg, t: l.t, lat: l.lat, hw: l.hw };
}
