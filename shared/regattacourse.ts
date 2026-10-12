// «Белые скалы»: принятая петля ProductLab R5.3, старт в существующей бухте.
// Геометрия берега и ось получены из одного источника: tools/regatta/build-course.mjs.
import { buildTrack, locate, locateAny, makeLoc, type Track, type TrackLoc } from './track.ts';
import { RG_INSIDE, RG_ROUTE } from './regattalayout.ts';

export const RG_COURSE = 'white-cliffs-v2';
export const RG_LAPS = 3;
export const RG_WIDTH = 25.2;
export const RG_INSIDE_WIDTH = 14;

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
  /** 0 — линия старта (арка), 1…6 — ворота по порядку */
  gates: RgGate[];
  flags: RgFlag[];
  obstacles: RgObstacle[];
  ramp: RgRamp;
  /** Узкий внутренний ход у маячка; те же входные и выходные ворота. */
  inside: ReadonlyArray<readonly [number, number]>;
  insideFrom: number;
  insideTo: number;
  insideLength: number;
  /** Решётка: 6 мест, первый ряд — ближе к арке */
  grid: RgSlot[];
}


/** Перенос одобренного плана в восточную бухту; высота берегов не растягивается. */
export function rgWorld(x: number, z: number): { x: number; z: number } {
  return { x: 114.4 - z * 1.4, z: 119.8 + x * 1.4 };
}
const near = (x: number, z: number): number => {
  const p = rgWorld(x, z); let best = 0, distance = Infinity;
  for (let i = 0; i < RG_ROUTE.length; i++) {
    const q = RG_ROUTE[i], d = (q[0] - p.x) * (q[0] - p.x) + (q[1] - p.z) * (q[1] - p.z);
    if (d < distance) { distance = d; best = i; }
  }
  return best;
};
let cached: RgCourse | null = null;
export function regattaCourse(): RgCourse {
  if (cached) return cached;
  const track = buildTrack({
    name: 'Белые скалы', nodes: RG_ROUTE.map(([x, z]) => ({ x, z, r: 0 })), width: 18, step: 1,
    widths: [{ leg: 0, at: 0, w: 18 }, { leg: near(-62, -60), at: 0, w: 18 }, { leg: near(-45, -87), at: 0, w: RG_WIDTH }, { leg: near(36, 60), at: 0, w: RG_WIDTH }, { leg: near(-20, 60), at: 0, w: 18 }, { leg: near(-38, 60), at: 0, w: 17 }, { leg: RG_ROUTE.length - 1, at: 0, w: 18 }],
    start: { leg: 0, at: 0 }, checkpoints: [[-10, -88], [78, -60], [45, -34], [24, 9], [24, 60], [-20, 60]].map(([x, z]) => ({ leg: near(x, z), at: 0 })),
    ramps: [], open: [], crates: [],
  });
  const gates = Array.from(track.cpSeg, seg => {
    const x = track.px[seg], z = track.pz[seg], tx = track.tx[seg], tz = track.tz[seg];
    return { x, z, tx, tz, hw: track.hw[seg], seg, rx: x + tx * 5, rz: z + tz * 5 };
  });
  const flag = (x: number, z: number, lat = 0, hw = 3): RgFlag => {
    const p = rgWorld(x, z), l = locateAny(track, p.x, p.z, makeLoc()), i = l.seg;
    return { x: track.px[i] - track.tz[i] * lat, z: track.pz[i] + track.tx[i] * lat, tx: track.tx[i], tz: track.tz[i], hw };
  };
  const flags = [flag(-62, -13, 0, 4), flag(12, -88, 0, 4), flag(43, -34, -3.5), flag(17, 60, 0, 4), flag(-31, 60, -3)];
  // Скрытый морской трамплин справа по ходу: короткий прыжок через риф.
  // Широкая левая половина возвратной прямой остаётся свободной.
  const ramp = { x0: 34, x1: 40, z0: 102, z1: 109, h: 1.3 };
  const obstacles: RgObstacle[] = [{ kind: 'reef', ax: 34.4, az: 99, bx: 39.5, bz: 99, r: 1.2 }];
  const grid: RgSlot[] = [];
  // Решётка следует последней дуге, а не ставит задние катера на берег.
  for (const back of [6, 12, 18]) {
    let i = track.n - 1, distance = 0;
    while (i > 0 && distance < back) { distance += track.len[i]; i--; }
    for (const lat of [-3, 3]) grid.push({ x: track.px[i] - track.tz[i] * lat, z: track.pz[i] + track.tx[i] * lat, hx: track.tx[i], hz: track.tz[i] });
  }
  const pointS = (x: number, z: number) => { const l = locateAny(track, x, z, makeLoc()); return track.s[l.seg] + track.len[l.seg] * l.t; };
  let insideLength = 0;
  for (let i = 1; i < RG_INSIDE.length; i++) insideLength += Math.sqrt((RG_INSIDE[i][0] - RG_INSIDE[i - 1][0]) * (RG_INSIDE[i][0] - RG_INSIDE[i - 1][0]) + (RG_INSIDE[i][1] - RG_INSIDE[i - 1][1]) * (RG_INSIDE[i][1] - RG_INSIDE[i - 1][1]));
  cached = { track, gates, flags, obstacles, ramp, grid, inside: RG_INSIDE, insideFrom: pointS(...RG_INSIDE[0]), insideTo: pointS(...RG_INSIDE[RG_INSIDE.length - 1]), insideLength };
  return cached;
}

export interface RgWaterLoc { seg: number; t: number; lat: number; hw: number; tx: number; tz: number; distance: number; progress: number; inside: boolean }
export function makeRgWaterLoc(): RgWaterLoc { return { seg: 0, t: 0, lat: 0, hw: 0, tx: 1, tz: 0, distance: 0, progress: 0, inside: false }; }
const temp: TrackLoc = makeLoc();
/** Союз основной воды и настоящей внутренней протоки. Суша между ними остаётся твёрдой. */
export function rgWaterAt(c: RgCourse, x: number, z: number, seg: number, out: RgWaterLoc): RgWaterLoc {
  const tr = c.track;
  let l = locate(tr, x, z, seg, temp);
  // На внутренней линии географически ближайшая точка основной оси далеко по сегментам.
  const dx0 = x - tr.px[l.seg] - tr.tx[l.seg] * tr.len[l.seg] * l.t;
  const dz0 = z - tr.pz[l.seg] - tr.tz[l.seg] * tr.len[l.seg] * l.t;
  if (dx0 * dx0 + dz0 * dz0 > (l.hw - 1) * (l.hw - 1)) l = locateAny(tr, x, z, temp);
  const i = l.seg, qx = tr.px[i] + tr.tx[i] * tr.len[i] * l.t, qz = tr.pz[i] + tr.tz[i] * tr.len[i] * l.t;
  const distance = Math.sqrt((x - qx) * (x - qx) + (z - qz) * (z - qz));
  Object.assign(out, { seg: i, t: l.t, lat: l.lat, hw: l.hw, tx: tr.tx[i], tz: tr.tz[i], distance, progress: tr.s[i] + tr.len[i] * l.t, inside: false });
  let at = 0;
  for (let k = 1; k < c.inside.length; k++) {
    const a = c.inside[k - 1], b = c.inside[k], dx = b[0] - a[0], dz = b[1] - a[1], ll = dx * dx + dz * dz;
    const len = Math.sqrt(ll), t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / ll));
    const px = x - a[0] - dx * t, pz = z - a[1] - dz * t, d = Math.sqrt(px * px + pz * pz);
    if (d - RG_INSIDE_WIDTH / 2 < out.distance - out.hw) {
      out.lat = -px * dz / len + pz * dx / len; out.distance = d; out.hw = RG_INSIDE_WIDTH / 2;
      out.tx = dx / len; out.tz = dz / len; out.inside = true;
      out.progress = c.insideFrom + (c.insideTo - c.insideFrom) * (at + len * t) / c.insideLength;
      let si = out.seg;
      while (si + 1 < tr.n && tr.s[si + 1] <= out.progress) si++;
      while (si > 0 && tr.s[si] > out.progress) si--;
      out.seg = si; out.t = (out.progress - tr.s[si]) / tr.len[si];
    }
    at += len;
  }
  return out;
}
export function rgLocate(c: RgCourse, x: number, z: number): { seg: number; t: number; lat: number; hw: number } {
  return locateAny(c.track, x, z, makeLoc());
}
