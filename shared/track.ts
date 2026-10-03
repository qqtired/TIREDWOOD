// Трасса картинга: замкнутая осевая линия из узлов со скруглёнными углами, разбитая на отрезки ≤ step.
// Дорога — коридор вокруг осевой (ширина меняется по ключам widths). За краем асфальта — обочина (трава, местами
// песок) шириной verge, за ней ограждение; а где ограждения нет (причал, берег реки), карт за обочиной падает в воду.
// Высота дороги — рельеф по ключам heights (подъёмы, спуски, гребни) плюс трамплины; отрезки над каналом — провал.
// К дороге привязаны помехи (shared/hazards.ts): ускорители, лужи, бочки и блоки, движущиеся помехи, настилы.
// Метры от начала ноги (at, from, to) можно задавать и от её конца: отрицательное число — столько метров до конца ноги.
// Считается только на + − × ÷ и Math.sqrt: сервер и любой браузер строят одну и ту же трассу бит в бит
// (дуги — делением пополам, без синусов). Тест следит, чтобы сюда не пробрались Math.sin, atan2 и прочие.
import { buildHazards, emptyHazards, type Frame, type HazardSpec, type Hazards } from './hazards.ts';

/** Угол многоугольника трассы и радиус его скругления (0 — острый угол) */
export interface TrackNode {
  x: number;
  z: number;
  r: number;
}

/**
 * Обочина на участке: нога leg (от from до to, по умолчанию вся) или дуга узла node (плюс pre метров до неё и post после).
 * side — по ходу гонки; w — ширина обочины до ограждения, м; sand — песок (иначе трава).
 */
export interface VergeSpec {
  leg?: number;
  node?: number;
  from?: number;
  to?: number;
  pre?: number;
  post?: number;
  side: 'left' | 'right' | 'both';
  w: number;
  sand?: boolean;
}

/**
 * «Нога» leg — прямая между скруглениями узлов leg и leg + 1; at, from, to — метры от её начала (отрицательные —
 * от конца).
 */
export interface TrackDef {
  name: string;
  /** Обход по ходу гонки, путь замкнут */
  nodes: TrackNode[];
  /** Ширина дороги, м (там, где не заданы widths, и на линии старта) */
  width: number;
  /**
   * Ключи ширины: на ноге leg в at метрах от её начала дорога шириной w м. Между соседними ключами (по ходу гонки,
   * включая линию старта с width в начале и в конце круга) ширина меняется линейно.
   */
  widths?: Array<{ leg: number; at: number; w: number }>;
  /** Длина отрезка не больше, м */
  step: number;
  /** Линия старта и финиша — точка 0 */
  start: { leg: number; at: number };
  /**
   * Контрольные точки 1… по ходу гонки (КТ 0 — линия старта). Засчитывается только следующая по порядку — когда карт
   * стоит на дороге за её линией, — поэтому срезка не должна обходить ни одной КТ.
   */
  checkpoints: Array<{ leg: number; at: number }>;
  /** Трамплин: подъём на height за up метров, дальше провал длиной gap */
  ramps: Array<{ leg: number; at: number; up: number; height: number; gap: number }>;
  /** Край без стены (причал, берег): side — по ходу гонки; to дальше конца ноги — до конца */
  open: Array<{ leg: number; side: 'left' | 'right'; from: number; to: number }>;
  /** Край дуги узла без стены (причал на повороте) */
  openNodes?: Array<{ node: number; side: 'left' | 'right' }>;
  /** Ряд ящиков поперёк дороги (lat — сдвиг ряда вправо от осевой) */
  crates: Array<{ leg: number; at: number; count: number; lat?: number }>;
  /** Помехи и зоны: ускорители, лужи, бочки, блоки, движущиеся помехи, настилы */
  hazards?: HazardSpec;
  /**
   * Рельеф: высота дороги в точке (нога, метр); между ключами — прямая, у ключа — плавный перегиб, у sharp — излом
   * (на скорости с него карт взлетает). На линии старта — y0 (по умолчанию 0).
   */
  heights?: Array<{ leg: number; at: number; y: number; sharp?: boolean }>;
  y0?: number;
  /** Обочина по умолчанию (м, с обеих сторон) и участки с другой шириной или песком */
  verge?: number;
  verges?: VergeSpec[];
}

/** Прямая нога: начало (после скругления узла), курс и длина */
export interface TrackLeg {
  x: number;
  z: number;
  dx: number;
  dz: number;
  len: number;
}

export interface TrackCrate {
  x: number;
  y: number;
  z: number;
  seg: number;
}

/** Место на стартовой решётке: курс (hx, hz) — по дороге */
export interface GridSlot {
  x: number;
  z: number;
  hx: number;
  hz: number;
  seg: number;
}

export interface Track {
  readonly name: string;
  /** Точек осевой (столько же отрезков: путь замкнут) */
  readonly n: number;
  readonly length: number;
  /** Самая большая полуширина дороги (у каждой точки — hw) */
  readonly half: number;
  /** Полуширина дороги в точке, м */
  readonly hw: Float64Array;
  readonly px: Float64Array;
  readonly pz: Float64Array;
  /** Высота дороги в точке */
  readonly h: Float64Array;
  /** Путь от линии старта до точки */
  readonly s: Float64Array;
  /** Длина отрезка i → i + 1 */
  readonly len: Float64Array;
  /** Единичное направление отрезка */
  readonly tx: Float64Array;
  readonly tz: Float64Array;
  /** 1 — у отрезка нет дороги (провал над каналом) */
  readonly gap: Uint8Array;
  /** 1 — край отрезка без стены (слева / справа по ходу) */
  readonly openL: Uint8Array;
  readonly openR: Uint8Array;
  /** Обочина в точке: ширина слева и справа, м (ограждение — за ней) */
  readonly vl: Float64Array;
  readonly vr: Float64Array;
  /** 1 — обочина отрезка песчаная (иначе трава), слева и справа */
  readonly sl: Uint8Array;
  readonly sr: Uint8Array;
  /** Кривизна в точке со знаком (+ — поворот влево), 1/м */
  readonly curv: Float64Array;
  /** Точка каждой контрольной точки; cpSeg[0] = 0 — линия старта */
  readonly cpSeg: Int32Array;
  /** Нога и метр от её начала для каждой точки (нога −1 — на дуге): для мира и ботов */
  readonly leg: Int16Array;
  readonly legAt: Float64Array;
  /** Узел дуги для каждой точки (−1 — на ноге) */
  readonly node: Int16Array;
  readonly crates: TrackCrate[];
  readonly grid: GridSlot[];
  readonly legs: TrackLeg[];
  /** Помехи и зоны (собираются вместе с трассой) */
  hz: Hazards;
}

/** Шаг ящиков в ряду поперёк дороги, м */
export const CRATE_SPACING = 2.4;
/** Решётка: первое место за линией, шаг назад и сдвиг вбок, м */
export const GRID_FIRST = 6;
export const GRID_STEP = 2.5;
export const GRID_SIDE = 2.4;
export const GRID_SLOTS = 6;
/** Нет дороги (провал) */
export const NO_GROUND = -1e9;
/** Поверхность под колёсами */
export const SURF_ROAD = 0;
export const SURF_GRASS = 1;
export const SURF_SAND = 2;
/** Поребрик: столько метров за краем асфальта ещё дорога */
export const KERB_TOL = 0.3;
/** Плавный перегиб рельефа — не длиннее стольких метров в каждую сторону от ключа */
const FILLET = 10;
/** Обочина сужается и расширяется плавно: м ширины на метр пути */
const VERGE_TAPER = 0.6;

interface Pt {
  x: number;
  z: number;
  leg: number;
  a: number;
  /** Узел, которому принадлежит дуга (для ног — −1) */
  node: number;
}

const EPS = 1e-6;

export function buildTrack(def: TrackDef): Track {
  const nodes = def.nodes;
  const m = nodes.length;
  if (m < 3) throw new Error('трасса: меньше трёх узлов');
  // направления сторон многоугольника
  const dx: number[] = [];
  const dz: number[] = [];
  const dl: number[] = [];
  for (let i = 0; i < m; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % m];
    const x = b.x - a.x;
    const z = b.z - a.z;
    const l = Math.sqrt(x * x + z * z);
    dx.push(x / l);
    dz.push(z / l);
    dl.push(l);
  }
  // отступ скругления: r · tg(θ/2) = r · |d1 × d2| / (1 + d1 · d2)
  const off: number[] = [];
  for (let i = 0; i < m; i++) {
    const p = (i - 1 + m) % m;
    const cross = dx[p] * dz[i] - dz[p] * dx[i];
    const dot = dx[p] * dx[i] + dz[p] * dz[i];
    if (dot < -0.5) throw new Error(`трасса: угол ${i} круче 120°`);
    off.push((nodes[i].r * Math.abs(cross)) / (1 + dot));
  }
  const legLen: number[] = [];
  for (let i = 0; i < m; i++) {
    const l = dl[i] - off[i] - off[(i + 1) % m];
    if (l < -EPS) throw new Error(`трасса: скругления на ноге ${i} не помещаются`);
    legLen.push(Math.max(0, l));
  }
  /** Метр на ноге: отрицательный — от её конца */
  const pos = (leg: number, at: number): number => (at < 0 && leg >= 0 && leg < m ? legLen[leg] + at : at);
  /** Конец участка: не дальше конца ноги */
  const upto = (leg: number, at: number): number => Math.min(pos(leg, at), leg >= 0 && leg < m ? legLen[leg] : at);

  // точки, которые обязаны попасть в осевую (границы особых участков)
  const marks: number[][] = Array.from({ length: m }, () => []);
  const mark = (leg: number, at0: number, what: string): void => {
    const at = pos(leg, at0);
    if (leg < 0 || leg >= m || at < -EPS || at > legLen[leg] + EPS) throw new Error(`трасса: ${what} вне ноги ${leg} (${at0})`);
    marks[leg].push(at);
  };
  mark(def.start.leg, def.start.at, 'старт');
  for (const c of def.checkpoints) mark(c.leg, c.at, 'КТ');
  for (const r of def.ramps) {
    const at = pos(r.leg, r.at);
    mark(r.leg, at, 'трамплин');
    mark(r.leg, at + r.up, 'трамплин');
    mark(r.leg, at + r.up + r.gap, 'провал');
  }
  for (const o of def.open) {
    mark(o.leg, o.from, 'причал');
    mark(o.leg, upto(o.leg, o.to), 'причал');
  }
  for (const c of def.crates) mark(c.leg, c.at, 'ящики');
  for (const w of def.widths ?? []) mark(w.leg, w.at, 'ширина');
  for (const k of def.heights ?? []) mark(k.leg, k.at, 'высота');

  const pts: Pt[] = [];
  for (let i = 0; i < m; i++) {
    const p = (i - 1 + m) % m;
    const nd = nodes[i];
    // дуга узла i: от A (включая) до B (не включая — с B начинается нога)
    if (off[i] > 0) {
      const ax = nd.x - dx[p] * off[i];
      const az = nd.z - dz[p] * off[i];
      const bx = nd.x + dx[i] * off[i];
      const bz = nd.z + dz[i] * off[i];
      // центр — на нормали к входящему направлению, со стороны поворота
      const left = dx[i] * dz[p] - dz[i] * dx[p] > 0;
      const nx = left ? dz[p] : -dz[p];
      const nz = left ? -dx[p] : dx[p];
      const r = nd.r;
      const cx = ax + nx * r;
      const cz = az + nz * r;
      let us: Array<[number, number]> = [
        [(ax - cx) / r, (az - cz) / r],
        [(bx - cx) / r, (bz - cz) / r],
      ];
      // делим дугу пополам, пока хорда длиннее шага
      for (;;) {
        const [u0, v0] = us[0];
        const [u1, v1] = us[1];
        const chord = r * Math.sqrt((u1 - u0) * (u1 - u0) + (v1 - v0) * (v1 - v0));
        if (chord <= def.step) break;
        const next: Array<[number, number]> = [];
        for (let k = 0; k < us.length - 1; k++) {
          const [a0, b0] = us[k];
          const [a1, b1] = us[k + 1];
          const sx = a0 + a1;
          const sz = b0 + b1;
          const l = Math.sqrt(sx * sx + sz * sz);
          next.push(us[k], [sx / l, sz / l]);
        }
        next.push(us[us.length - 1]);
        us = next;
      }
      pts.push({ x: ax, z: az, leg: -1, a: 0, node: i });
      for (let k = 1; k < us.length - 1; k++) pts.push({ x: cx + us[k][0] * r, z: cz + us[k][1] * r, leg: -1, a: 0, node: i });
    }
    // нога i: от B (включая) до начала следующей дуги (не включая)
    const L = legLen[i];
    if (L <= EPS) continue;
    const bx = nd.x + dx[i] * off[i];
    const bz = nd.z + dz[i] * off[i];
    const cuts = [0, L, ...marks[i].filter((a) => a > EPS && a < L - EPS)].sort((a, b) => a - b);
    const uniq: number[] = [];
    for (const c of cuts) if (uniq.length === 0 || c - uniq[uniq.length - 1] > EPS) uniq.push(c);
    for (let k = 0; k < uniq.length - 1; k++) {
      const a0 = uniq[k];
      const a1 = uniq[k + 1];
      const parts = Math.ceil((a1 - a0) / def.step - EPS);
      for (let j = 0; j < parts; j++) {
        const a = a0 + ((a1 - a0) * j) / parts;
        pts.push({ x: bx + dx[i] * a, z: bz + dz[i] * a, leg: i, a, node: -1 });
      }
    }
  }

  // точка 0 — на линии старта
  const find = (leg: number, at0: number, what: string): number => {
    const at = pos(leg, at0);
    const k = pts.findIndex((q) => q.leg === leg && Math.abs(q.a - at) < 1e-6);
    if (k >= 0) return k;
    // самый конец ноги — первая точка после неё (начало дуги или следующей ноги)
    if (leg >= 0 && leg < m && Math.abs(at - legLen[leg]) < 1e-6) {
      let last = -1;
      for (let i = 0; i < pts.length; i++) if (pts[i].leg === leg) last = i;
      if (last >= 0) return (last + 1) % pts.length;
    }
    throw new Error(`трасса: ${what} не попал в точку осевой`);
  };
  const s0 = find(def.start.leg, def.start.at, 'старт');
  const ring = [...pts.slice(s0), ...pts.slice(0, s0)];
  const n = ring.length;

  const px = new Float64Array(n);
  const pz = new Float64Array(n);
  const h = new Float64Array(n);
  const leg = new Int16Array(n);
  const legAt = new Float64Array(n);
  const node = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const q = ring[i];
    px[i] = q.x;
    pz[i] = q.z;
    leg[i] = q.leg;
    legAt[i] = q.a;
    node[i] = q.node;
  }

  const len = new Float64Array(n);
  const tx = new Float64Array(n);
  const tz = new Float64Array(n);
  const s = new Float64Array(n);
  const gap = new Uint8Array(n);
  const openL = new Uint8Array(n);
  const openR = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x = px[j] - px[i];
    const z = pz[j] - pz[i];
    const l = Math.sqrt(x * x + z * z);
    len[i] = l;
    tx[i] = x / l;
    tz[i] = z / l;
    if (i + 1 < n) s[i + 1] = s[i] + l;
    const a = ring[i];
    if (a.leg < 0) {
      for (const o of def.openNodes ?? []) if (o.node === a.node) (o.side === 'left' ? openL : openR)[i] = 1;
      continue;
    }
    // последний отрезок ноги кончается в начале дуги — это конец ноги
    const b = ring[j].leg === a.leg ? ring[j].a : legLen[a.leg];
    for (const r of def.ramps) {
      const at = pos(r.leg, r.at);
      if (a.leg === r.leg && a.a >= at + r.up - EPS && b <= at + r.up + r.gap + EPS) gap[i] = 1;
    }
    for (const o of def.open) {
      if (a.leg !== o.leg || a.a < pos(o.leg, o.from) - EPS || b > upto(o.leg, o.to) + EPS) continue;
      if (o.side === 'left') openL[i] = 1;
      else openR[i] = 1;
    }
  }
  const length = s[n - 1] + len[n - 1];

  const curv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n;
    const side = tx[i] * tz[p] - tz[i] * tx[p];
    curv[i] = side / ((len[p] + len[i]) / 2);
  }

  const index = (leg: number, at: number, what: string): number => (find(leg, at, what) - s0 + pts.length) % pts.length;
  const cpSeg = new Int32Array(def.checkpoints.length + 1);
  def.checkpoints.forEach((c, k) => {
    cpSeg[k + 1] = index(c.leg, c.at, 'КТ');
  });

  // рельеф: ломаная по пути через ключи с перегибами, сверху — трамплины
  const y0 = def.y0 ?? 0;
  const hk: Array<{ s: number; y: number; sharp: boolean }> = [{ s: 0, y: y0, sharp: false }];
  for (const k of def.heights ?? []) hk.push({ s: s[index(k.leg, k.at, 'высота')], y: k.y, sharp: !!k.sharp });
  hk.sort((p, q) => p.s - q.s);
  for (let i = 0; i < n; i++) h[i] = relief(hk, length, s[i]);
  for (let i = 0; i < n; i++) {
    const q = ring[i];
    for (const r of def.ramps) {
      const at = pos(r.leg, r.at);
      if (q.leg === r.leg && q.a >= at - EPS && q.a <= at + r.up + EPS) h[i] += (r.height * (q.a - at)) / r.up;
    }
  }

  const crates: TrackCrate[] = [];
  for (const row of def.crates) {
    const b = index(row.leg, row.at, 'ящики');
    const rx = -tz[b];
    const rz = tx[b];
    for (let k = 0; k < row.count; k++) {
      const lat = (row.lat ?? 0) + (k - (row.count - 1) / 2) * CRATE_SPACING;
      crates.push({ x: px[b] + rx * lat, y: h[b], z: pz[b] + rz * lat, seg: b });
    }
  }

  // ширина дороги: ломаная по пути через ключи; на линии старта (в начале и в конце круга) — def.width
  const keys: Array<{ s: number; w: number }> = [{ s: 0, w: def.width }];
  for (const k of def.widths ?? []) keys.push({ s: s[index(k.leg, k.at, 'ширина')], w: k.w });
  keys.push({ s: length, w: def.width });
  keys.sort((p, q) => p.s - q.s);
  const hw = new Float64Array(n);
  let half = 0;
  for (let i = 0, k = 0; i < n; i++) {
    while (k + 2 < keys.length && keys[k + 1].s <= s[i]) k++;
    const a = keys[k];
    const b = keys[k + 1];
    const t = b.s > a.s ? Math.min(1, Math.max(0, (s[i] - a.s) / (b.s - a.s))) : 0;
    hw[i] = (a.w + (b.w - a.w) * t) / 2;
    if (hw[i] > half) half = hw[i];
  }

  // обочины: по умолчанию verge, участки — поверх по порядку; ширина меняется не резче VERGE_TAPER
  const vl = new Float64Array(n).fill(def.verge ?? 0);
  const vr = new Float64Array(n).fill(def.verge ?? 0);
  const sl = new Uint8Array(n);
  const sr = new Uint8Array(n);
  for (const v of def.verges ?? []) {
    for (let i = 0; i < n; i++) {
      const q = ring[i];
      let hit = false;
      if (v.node !== undefined) {
        const before = (v.node - 1 + m) % m;
        hit = q.node === v.node || (q.leg === before && q.a >= legLen[before] - (v.pre ?? 0) - EPS) || (q.leg === v.node && q.a <= (v.post ?? 0) + EPS);
      } else if (v.leg !== undefined && q.leg === v.leg) {
        hit = q.a >= pos(v.leg, v.from ?? 0) - EPS && q.a <= pos(v.leg, v.to ?? legLen[v.leg]) + EPS;
      }
      if (!hit) continue;
      if (v.side !== 'right') {
        vl[i] = v.w;
        sl[i] = v.sand ? 1 : 0;
      }
      if (v.side !== 'left') {
        vr[i] = v.w;
        sr[i] = v.sand ? 1 : 0;
      }
    }
  }
  taper(vl, len, n);
  taper(vr, len, n);

  const legs: TrackLeg[] = [];
  for (let i = 0; i < m; i++) legs.push({ x: nodes[i].x + dx[i] * off[i], z: nodes[i].z + dz[i] * off[i], dx: dx[i], dz: dz[i], len: legLen[i] });

  const tr: Track = {
    name: def.name, n, length, half, hw, px, pz, h, s, len, tx, tz, gap, openL, openR, vl, vr, sl, sr, curv, cpSeg, leg, legAt,
    node, crates, grid: [], legs, hz: emptyHazards(),
  };

  // решётка: через одно влево и вправо, каждое следующее место дальше от линии
  for (let k = 0; k < GRID_SLOTS; k++) {
    const back = GRID_FIRST + GRID_STEP * k;
    const at = behind(tr, back);
    const lat = k % 2 === 0 ? -GRID_SIDE : GRID_SIDE;
    const j = at.seg;
    tr.grid.push({
      x: px[j] + tx[j] * len[j] * at.t - tz[j] * lat,
      z: pz[j] + tz[j] * len[j] * at.t + tx[j] * lat,
      hx: tx[j],
      hz: tz[j],
      seg: j,
    });
  }

  if (def.hazards) {
    const loc = makeLoc();
    const frame: Frame = {
      at(leg, at0, lat, out) {
        const g = legs[leg];
        if (!g) throw new Error(`трасса: помеха на ноге ${leg}, а ног ${legs.length}`);
        const at = at0 < 0 ? g.len + at0 : at0;
        out.x = g.x + g.dx * at - g.dz * lat;
        out.z = g.z + g.dz * at + g.dx * lat;
        out.tx = g.dx;
        out.tz = g.dz;
        // высота дороги на осевой напротив — от неё считаются настилы
        locateAny(tr, g.x + g.dx * at, g.z + g.dz * at, loc);
        const k = loc.seg + 1 < n ? loc.seg + 1 : 0;
        out.y = h[loc.seg] + (h[k] - h[loc.seg]) * loc.t;
        return out;
      },
      seg: (x, z) => locateAny(tr, x, z, loc).seg,
    };
    tr.hz = buildHazards(def.hazards, frame);
  }
  return tr;
}

/**
 * Высота рельефа на пути s: ломаная через ключи (по кругу), у не-острых ключей — парабола-перегиб длиной до 2·FILLET,
 * которая касается обоих соседних отрезков.
 */
function relief(keys: ReadonlyArray<{ s: number; y: number; sharp: boolean }>, L: number, s: number): number {
  const c = keys.length;
  if (c === 1) return keys[0].y;
  // ключ по кругу: i < 0 и i ≥ c — с прошлого и следующего круга
  const ks = (i: number): number => keys[((i % c) + c) % c].s + Math.floor(i / c) * L;
  const ky = (i: number): number => keys[((i % c) + c) % c].y;
  const slope = (i: number): number => (ky(i + 1) - ky(i)) / (ks(i + 1) - ks(i));
  let a = c - 1;
  for (let i = 0; i < c; i++) if (keys[i].s <= s) a = i;
  let y = ky(a) + slope(a) * (s - ks(a));
  const fillet = (i: number): number => {
    if (keys[((i % c) + c) % c].sharp) return 0;
    return Math.min(FILLET, 0.45 * (ks(i) - ks(i - 1)), 0.45 * (ks(i + 1) - ks(i)));
  };
  const near = (i: number): void => {
    const F = fillet(i);
    const d = s - ks(i);
    if (F <= 0 || d <= -F || d >= F) return;
    const g0 = slope(i - 1);
    const g1 = slope(i);
    y = ky(i) + g0 * d + ((g1 - g0) * (d + F) * (d + F)) / (4 * F);
  };
  near(a);
  near(a + 1);
  return y;
}

/** Ширина обочины меняется не резче VERGE_TAPER: широкие участки сужаются к своим краям (дважды по кругу). */
function taper(w: Float64Array, len: Float64Array, n: number): void {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const j = i + 1 < n ? i + 1 : 0;
      const lim = w[i] + VERGE_TAPER * len[i];
      if (w[j] > lim) w[j] = lim;
    }
    for (let i = n - 1; i >= 0; i--) {
      const p = i > 0 ? i - 1 : n - 1;
      const lim = w[i] + VERGE_TAPER * len[p];
      if (w[p] > lim) w[p] = lim;
    }
  }
}

/** Дуга узла i: центр, радиус, отступ скругления от узла и сторона (+1 — поворот влево). Для мира и ботов. */
export function nodeArc(def: TrackDef, i: number): { cx: number; cz: number; r: number; off: number; side: number } {
  const nodes = def.nodes;
  const m = nodes.length;
  const a = nodes[(i - 1 + m) % m];
  const b = nodes[i];
  const c = nodes[(i + 1) % m];
  const l1 = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
  const l2 = Math.sqrt((c.x - b.x) * (c.x - b.x) + (c.z - b.z) * (c.z - b.z));
  const d1x = (b.x - a.x) / l1;
  const d1z = (b.z - a.z) / l1;
  const d2x = (c.x - b.x) / l2;
  const d2z = (c.z - b.z) / l2;
  const cross = d1x * d2z - d1z * d2x;
  const dot = d1x * d2x + d1z * d2z;
  const off = (b.r * Math.abs(cross)) / (1 + dot);
  const left = d2x * d1z - d2z * d1x > 0;
  const nx = left ? d1z : -d1z;
  const nz = left ? -d1x : d1x;
  return { cx: b.x - d1x * off + nx * b.r, cz: b.z - d1z * off + nz * b.r, r: b.r, off, side: left ? 1 : -1 };
}

/** Отрезок и доля на нём для точки осевой в back метрах до линии старта. */
function behind(tr: Track, back: number): { seg: number; t: number } {
  for (let j = tr.n - 1; j >= 0; j--) {
    const bj = tr.length - tr.s[j];
    if (bj >= back) return { seg: j, t: (bj - back) / tr.len[j] };
  }
  return { seg: 0, t: 0 };
}

export interface TrackLoc {
  seg: number;
  /** Доля пути по отрезку 0…1 */
  t: number;
  /** Сдвиг от осевой: + — вправо по ходу */
  lat: number;
  /** Высота дороги или NO_GROUND над провалом */
  ground: number;
  /** Полуширина дороги здесь */
  hw: number;
  /** Обочина здесь: слева и справа, м */
  vl: number;
  vr: number;
  /** Под точкой: SURF_ROAD, SURF_GRASS или SURF_SAND */
  surf: number;
}

export function makeLoc(): TrackLoc {
  return { seg: 0, t: 0, lat: 0, ground: 0, hw: 0, vl: 0, vr: 0, surf: 0 };
}

export function wrapSeg(tr: Track, i: number): number {
  const n = tr.n;
  return ((i % n) + n) % n;
}

/** Расстояние² от точки до отрезка j и доля t ближайшей точки. */
function project(tr: Track, j: number, x: number, z: number, out: { d: number; t: number }): void {
  const ex = x - tr.px[j];
  const ez = z - tr.pz[j];
  const l = tr.len[j];
  let t = (ex * tr.tx[j] + ez * tr.tz[j]) / l;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ex - tr.tx[j] * l * t;
  const qz = ez - tr.tz[j] * l * t;
  out.d = qx * qx + qz * qz;
  out.t = t;
}

function fill(tr: Track, j: number, t: number, x: number, z: number, out: TrackLoc): TrackLoc {
  out.seg = j;
  out.t = t;
  const lat = (x - tr.px[j]) * -tr.tz[j] + (z - tr.pz[j]) * tr.tx[j];
  out.lat = lat;
  const k = j + 1 < tr.n ? j + 1 : 0;
  out.ground = tr.gap[j] ? NO_GROUND : tr.h[j] + (tr.h[k] - tr.h[j]) * t;
  const hw = tr.hw[j] + (tr.hw[k] - tr.hw[j]) * t;
  out.hw = hw;
  out.vl = tr.vl[j] + (tr.vl[k] - tr.vl[j]) * t;
  out.vr = tr.vr[j] + (tr.vr[k] - tr.vr[j]) * t;
  if (lat > hw + KERB_TOL && out.vr > KERB_TOL) out.surf = tr.sr[j] ? SURF_SAND : SURF_GRASS;
  else if (lat < -hw - KERB_TOL && out.vl > KERB_TOL) out.surf = tr.sl[j] ? SURF_SAND : SURF_GRASS;
  else out.surf = SURF_ROAD;
  return out;
}

const _pr = { d: 0, t: 0 };

/** Отрезок у точки: поиск в окне seg − 4 … seg + 8 (карт за тик не уезжает дальше). */
export function locate(tr: Track, x: number, z: number, seg: number, out: TrackLoc): TrackLoc {
  let best = seg;
  let bestD = Infinity;
  let bestT = 0;
  for (let k = -4; k <= 8; k++) {
    const j = wrapSeg(tr, seg + k);
    project(tr, j, x, z, _pr);
    if (_pr.d < bestD) {
      bestD = _pr.d;
      best = j;
      bestT = _pr.t;
    }
  }
  return fill(tr, best, bestT, x, z, out);
}

/** Отрезок у точки поиском по всей трассе (сборка, ловушки на сервере). */
export function locateAny(tr: Track, x: number, z: number, out: TrackLoc): TrackLoc {
  let best = 0;
  let bestD = Infinity;
  let bestT = 0;
  for (let j = 0; j < tr.n; j++) {
    project(tr, j, x, z, _pr);
    if (_pr.d < bestD) {
      bestD = _pr.d;
      best = j;
      bestT = _pr.t;
    }
  }
  return fill(tr, best, bestT, x, z, out);
}

/** Точка у дороги: под ней земля (асфальт или обочина до ограждения, с запасом edge за краем) */
export function onGround(loc: TrackLoc, edge: number): boolean {
  return loc.lat <= loc.hw + loc.vr + edge && loc.lat >= -loc.hw - loc.vl - edge;
}

/**
 * Прогресс по гонке, м: круг × длина + путь от последней пройденной КТ со знаком.
 * Кто сдал назад за линию, не уезжает «вперёд на круг».
 */
export function progress(tr: Track, lap: number, cp: number, seg: number, t: number): number {
  const L = tr.length;
  const base = tr.s[tr.cpSeg[cp]];
  let d = tr.s[seg] + tr.len[seg] * t - base;
  if (d > L / 2) d -= L;
  else if (d <= -L / 2) d += L;
  return lap * L + base + d;
}
