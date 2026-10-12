// Раскладка замка: где что стоит (створки и ниши, надвратная башня, эркеры, знамёна, фонари, вещи во дворе) и куда
// ставить ничего нельзя (проём ворот и «горло», ход по стенам, лестницы, места башен с бойницами, прилавок, места, где
// липучки лезут и спрыгивают). Чистые данные без three.js: по ним строят castle/*.ts, их же проверяет
// test/fort-castle.test.ts. Коллизий тут нет — всё только вид.
import { LADDERS } from '../../../shared/fortladder.ts';
import { CLIMBS, GATE, SHOP_COUNTER, THROAT_Z, TOWER_SPOTS, WALL_H, WALL_T } from '../../../shared/fortmap.ts';

export interface Aabb {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

export const aabb = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Aabb => ({ x0, y0, z0, x1, y1, z1 });

// ------------------------------------------------------------ ворота

/**
 * Створки: петли в нишах у краёв проёма, наружная плоскость досок на 5 см глубже грани стены. Открытая створка
 * (поворот на 90° во двор) целиком ложится в нишу: |x| ≥ 2,5 — проём 5 × 3 м не сужается ни на сантиметр.
 */
export const LEAF = {
  /** петля: |x| и z (наружная плоскость досок) */
  hx: 2.66,
  hz: GATE.face + 0.05,
  /** ширина створки (от петли до середины проёма), высота, низ */
  w: 2.66,
  h: 2.94,
  y0: 0.03,
  /** доски, бруски с изнанки, железо и шипы снаружи — толщины, м (шип открытой створки не доходит до проёма) */
  plank: 0.13,
  batten: 0.1,
  spike: 0.12,
  planks: 5,
};

/** Ниши в стенах проезда (по обе стороны): глубина до |x| = NICHE.x, вдоль проезда z0…z1, высота как у проёма */
export const NICHE = { x: 2.92, z0: LEAF.hz - 0.03, z1: LEAF.hz + LEAF.w + 0.05, h: GATE.h };

/**
 * Сколько «сжимается» босс в проёме ворот (как gateSqueeze у fort): 1 — в проезде или «горле», к 0 — за 2,5 м от них.
 * По этому числу арка дрожит и сыплет пылью.
 */
export function gatePress(x: number, z: number): number {
  if (Math.abs(x) > GATE.x1 + 3) return 0;
  const d = z < THROAT_Z ? THROAT_Z - z : z > GATE.face + WALL_T ? z - (GATE.face + WALL_T) : 0;
  return Math.max(0, Math.min(1, 1 - d / 2.5));
}

// ------------------------------------------------------------ надвратная башня и эркеры

/**
 * Надвратная башня — только вид. Этаж поднят над ходом по стене (под ним 2,9 м: ход и обзор вниз на «горло»
 * свободны), стоит на консолях: две спереди на гранях воротных башен (рядом с «горлом», не в нём) и две сзади на
 * внутренней грани стены. Консоли начинаются выше головы — внизу никто сквозь них не ходит.
 */
export const GATEHOUSE = {
  /** полуширина этажа, передняя и задняя грани */
  hx: 3.3,
  z0: THROAT_Z - 0.3,
  z1: GATE.face + WALL_T + 0.25,
  /** низ балок, низ этажа (плита), карниз, конёк шатра */
  beams: 6.15,
  floor: 6.3,
  story: 6.45,
  eave: 9.0,
  peak: 13.6,
  /** консоли-опоры: |x| от и до, низ передних и задних */
  sx0: 2.52,
  sx1: 3.12,
  front: 2.4,
  rear: 2.2,
};

/** Эркеры на углах северных бастионов (не на диагональных — там бойницы башен арсенала): круглые, шатёр-колпак */
export const BARTIZAN = { r: 0.8, corbel: 2.3, body: 3.1, top: 5.35, eave: 1.08, peak: 8.1, pole: 9.25 };
export const BARTIZANS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -14.6, z: -19.4 },
  { x: 14.6, z: -19.4 },
  { x: -21.4, z: -12.6 },
  { x: 21.4, z: -12.6 },
];

// ------------------------------------------------------------ знамёна, флаги, гирлянды, огни

export interface Banner {
  x: number;
  z: number;
  /** нормаль грани, на которой висит (наружу от стены) */
  nx: number;
  nz: number;
  top: number;
  len: number;
  w: number;
  /** рисунок в атласе знамён: 0 красное, 1 синее, 2 зелёное, 3 золотое */
  look: number;
}

export const BANNERS: readonly Banner[] = [
  // северная стена снаружи — между зубцами, в стороне от мест, где лезут липучки
  { x: -8.5, z: -16, nx: 0, nz: -1, top: 4.05, len: 2.7, w: 1.0, look: 0 },
  { x: 8.5, z: -16, nx: 0, nz: -1, top: 4.05, len: 2.7, w: 1.0, look: 1 },
  // бастионы спереди
  { x: -17.2, z: -19, nx: 0, nz: -1, top: 4.05, len: 2.9, w: 1.1, look: 1 },
  { x: 17.2, z: -19, nx: 0, nz: -1, top: 4.05, len: 2.9, w: 1.1, look: 0 },
  // надвратная башня спереди
  { x: -2.85, z: GATEHOUSE.z0, nx: 0, nz: -1, top: 8.75, len: 2.05, w: 0.72, look: 3 },
  { x: 2.85, z: GATEHOUSE.z0, nx: 0, nz: -1, top: 8.75, len: 2.05, w: 0.72, look: 3 },
  // терраса — к воротам
  { x: -4.3, z: 5, nx: 0, nz: -1, top: 2.12, len: 1.75, w: 0.9, look: 2 },
  { x: 4.3, z: 5, nx: 0, nz: -1, top: 2.12, len: 1.75, w: 0.9, look: 2 },
  // боковые стены со двора
  { x: -15, z: 7, nx: 1, nz: 0, top: 3.3, len: 2.3, w: 0.95, look: 0 },
  { x: 15, z: 7, nx: -1, nz: 0, top: 3.3, len: 2.3, w: 0.95, look: 1 },
];

/** Флаг на шесте: где низ шеста, его высота и размер полотнища */
export interface PoleFlag {
  x: number;
  y: number;
  z: number;
  pole: number;
  w: number;
  h: number;
  /** 0 — большой флаг замка (атлас), 1…4 — вымпел своего цвета */
  look: number;
}

export const POLE_FLAGS: readonly PoleFlag[] = [
  { x: 0, y: GATEHOUSE.peak - 0.2, z: (GATEHOUSE.z0 + GATEHOUSE.z1) / 2, pole: 2.6, w: 2.3, h: 1.45, look: 0 },
  ...BARTIZANS.map((b, i) => ({ x: b.x, y: BARTIZAN.peak - 0.1, z: b.z, pole: BARTIZAN.pole - BARTIZAN.peak + 0.1, w: 1.15, h: 0.5, look: 1 + (i % 4) })),
];

/**
 * Столбы с фонарями на углах террасы (на бортике): на них же — гирлянды флажков. Высокие: флажки над террасой
 * висят выше 3 м над её полом — не лезут в камеру над плечом, когда стреляют с террасы во двор.
 */
export const TERRACE_POSTS: ReadonlyArray<{ x: number; z: number; y0: number; y1: number }> = [
  { x: -9.85, z: 5.15, y0: 2.8, y1: 6.3 },
  { x: 9.85, z: 5.15, y0: 2.8, y1: 6.3 },
];

/** Флажок гирлянды свисает со шнура на столько, м */
export const BUNTING_DROP = 0.38;

/** Гирлянды флажков: концы и провис (двор — от надвратной башни к террасе, и вдоль террасы) */
export const BUNTING: ReadonlyArray<{ a: [number, number, number]; b: [number, number, number]; sag: number }> = [
  { a: [-GATEHOUSE.hx + 0.05, 7.9, GATEHOUSE.z1 + 0.05], b: [-9.85, 6.2, 5.15], sag: 1.3 },
  { a: [GATEHOUSE.hx - 0.05, 7.9, GATEHOUSE.z1 + 0.05], b: [9.85, 6.2, 5.15], sag: 1.3 },
  { a: [-9.85, 6.2, 5.15], b: [9.85, 6.2, 5.15], sag: 0.5 },
];

/** Огонь: фонари (висят) и факелы (в держателях на стене), n — нормаль грани */
export interface Light {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  kind: 'lantern' | 'torch' | 'post';
}

export const LIGHTS: readonly Light[] = [
  // фонари под передними консолями — по бокам «горла»
  { x: -2.82, y: 2.05, z: THROAT_Z - 0.24, nx: 0, nz: -1, kind: 'lantern' },
  { x: 2.82, y: 2.05, z: THROAT_Z - 0.24, nx: 0, nz: -1, kind: 'lantern' },
  // факелы во дворе: у выхода из проезда и на боковых стенах
  { x: -4.4, y: 2.45, z: -12.92, nx: 0, nz: 1, kind: 'torch' },
  { x: 4.4, y: 2.45, z: -12.92, nx: 0, nz: 1, kind: 'torch' },
  { x: -14.92, y: 2.45, z: -9.6, nx: 1, nz: 0, kind: 'torch' },
  { x: 14.92, y: 2.45, z: -9.6, nx: -1, nz: 0, kind: 'torch' },
  { x: -14.92, y: 2.45, z: 1.5, nx: 1, nz: 0, kind: 'torch' },
  { x: 14.92, y: 2.45, z: 1.5, nx: -1, nz: 0, kind: 'torch' },
  // фонари на столбах террасы
  ...TERRACE_POSTS.map((p) => ({ x: p.x, y: p.y1 - 0.3, z: p.z, nx: 0, nz: -1, kind: 'post' as const })),
];

// ------------------------------------------------------------ двор

/**
 * Вещи во дворе — вплотную к стенам и в углах, в стороне от лестниц, мест спрыгивания липучек и пути от ворот к
 * кристаллу. Коробки здесь — их габариты (для проверки), форму строит yard.ts.
 */
export const YARD = {
  /** кузня в северо-восточном углу: горн у восточной стены, колпак до верха стены, наковальня, бочка с водой */
  hearth: aabb(14.05, 0, -12.45, 15, 0.92, -10.35),
  hood: aabb(14.15, 1.45, -12.55, 15, 4.55, -10.25),
  anvil: aabb(12.95, 0, -10.35, 13.75, 0.86, -9.75),
  quench: aabb(14.25, 0, -9.95, 14.85, 0.78, -9.35),
  /** склад в северо-западном углу: бочки и ящики */
  stores: aabb(-15, 0, -13, -13.55, 1.55, -10.25),
  /** стойка с копьями и щитами у северной стены (запад) */
  rack: aabb(-6.65, 0, -13, -4.65, 2.25, -12.55),
  /** поленница у северной стены (восток) */
  logs: aabb(4.7, 0, -13, 6.65, 1.05, -12.45),
  /** ящики с цветами на бортике террасы (снаружи, над головами) */
  flowersW: aabb(-5.6, 2.24, 4.72, -2.2, 2.78, 5.0),
  flowersE: aabb(2.2, 2.24, 4.72, 5.6, 2.78, 5.0),
};

// ------------------------------------------------------------ куда ставить нельзя

export interface Keep {
  name: string;
  box: Aabb;
}

const H = WALL_H;

/** Над ходом по стене свободно (рост, прыжок и камера над плечом) */
const CLEAR = 2.7;

/** Ход по стенам (верх стен и бастионов внутри брустверов) — от пола хода до CLEAR над ним */
export const WALKWAYS: readonly Keep[] = [
  { name: 'бастион СЗ', box: aabb(-20.6, H, -18.6, -15.4, H + CLEAR, -13.4) },
  { name: 'бастион СВ', box: aabb(15.4, H, -18.6, 20.6, H + CLEAR, -13.4) },
  { name: 'северная стена З', box: aabb(-15, H, -15.6, -6, H + CLEAR, -13) },
  { name: 'северная стена В', box: aabb(6, H, -15.6, 15, H + CLEAR, -13) },
  { name: 'над воротами', box: aabb(-5.6, H, -18.1, 5.6, H + CLEAR, -13) },
  { name: 'западная стена', box: aabb(-17.6, H, -13, -15, H + CLEAR, 11) },
  { name: 'восточная стена', box: aabb(15, H, -13, 17.6, H + CLEAR, 11) },
  { name: 'южная стена', box: aabb(-17.6, H, 11, 17.6, H + CLEAR, 13.6) },
];

/** Места липучек на южной стене (десант с моря у fort): тоже не загораживаем */
const SEA_CLIMBS = [
  { x: -12.5, z: 14, nx: 0, nz: 1 },
  { x: 12.5, z: 14, nx: 0, nz: 1 },
];

/** Все запретные объёмы: проём с «горлом», ход по стенам, лестницы, башни с бойницами, прилавок, места липучек */
export function keepOut(): Keep[] {
  const out: Keep[] = [];
  out.push({ name: 'проём ворот и «горло»', box: aabb(GATE.x0, 0, THROAT_Z - 0.5, GATE.x1, GATE.h, GATE.face + WALL_T + 0.3) });
  out.push({ name: 'стойка ворот (ремонт)', box: aabb(-2.2, 0, -13, 2.2, 2.4, -9.6) });
  out.push(...WALKWAYS);
  for (const l of LADDERS) {
    // вдоль стены ± (полуширина + запас), от грани наружу до 1,1 м, по высоте — до верха хода и выше головы
    const ax = Math.abs(l.nz) > 0.5;
    const half = l.w + 0.35;
    const o0 = 0;
    const o1 = 1.1;
    const xa = ax ? l.x - half : Math.min(l.x + l.nx * o0, l.x + l.nx * o1);
    const xb = ax ? l.x + half : Math.max(l.x + l.nx * o0, l.x + l.nx * o1);
    const za = ax ? Math.min(l.z + l.nz * o0, l.z + l.nz * o1) : l.z - half;
    const zb = ax ? Math.max(l.z + l.nz * o0, l.z + l.nz * o1) : l.z + half;
    out.push({ name: `лестница ${l.name}`, box: aabb(xa, 0, za, xb, l.y1 + 2, zb) });
  }
  for (const s of TOWER_SPOTS) {
    // башня (круг 1,3 м) и бойница: от места наружу до port + 1 м, ±0,8 м поперёк
    out.push({ name: `башня ${s.name}`, box: aabb(s.x - 1.3, s.y, s.z - 1.3, s.x + 1.3, s.y + 2.6, s.z + 1.3) });
    const ex = s.x + s.nx * (s.port + 1);
    const ez = s.z + s.nz * (s.port + 1);
    out.push({ name: `бойница ${s.name}`, box: aabb(Math.min(s.x, ex) - 0.8, s.y, Math.min(s.z, ez) - 0.8, Math.max(s.x, ex) + 0.8, s.y + 2.4, Math.max(s.z, ez) + 0.8) });
  }
  out.push({ name: 'прилавок', box: aabb(SHOP_COUNTER.x0 - 0.6, 2.2, SHOP_COUNTER.z0 - 1.6, SHOP_COUNTER.x1 + 0.6, 2.2 + 2.4, SHOP_COUNTER.z1 + 0.6) });
  for (const c of [...CLIMBS, ...SEA_CLIMBS]) {
    // снаружи у грани (где липучка лезет) и с другой стороны стены (где спрыгивает во двор)
    const along = Math.abs(c.nz) > 0.5;
    const lx = along ? 1.0 : 1.5;
    const lz = along ? 1.5 : 1.0;
    const ox = c.x + c.nx * 0.75;
    const oz = c.z + c.nz * 0.75;
    out.push({ name: `липучка лезет ${c.x},${c.z}`, box: aabb(ox - lx * (along ? 1 : 0.5), 0, oz - lz * (along ? 0.5 : 1), ox + lx * (along ? 1 : 0.5), H + 1.2, oz + lz * (along ? 0.5 : 1)) });
    const ix = c.x - c.nx * (WALL_T + 0.8);
    const iz = c.z - c.nz * (WALL_T + 0.8);
    out.push({ name: `липучка спрыгивает ${c.x},${c.z}`, box: aabb(ix - (along ? 0.9 : 0.8), 0, iz - (along ? 0.8 : 0.9), ix + (along ? 0.9 : 0.8), 2.4, iz + (along ? 0.8 : 0.9)) });
  }
  return out;
}

/** Пересекаются ли коробки (касание — нет) */
export function overlaps(a: Aabb, b: Aabb): boolean {
  return a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.y0 < b.y1 - 1e-6 && a.y1 > b.y0 + 1e-6 && a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6;
}

/** Вертикальный цилиндр (x, z, r, y0…y1) против коробки */
export function cylOverlaps(x: number, z: number, r: number, y0: number, y1: number, b: Aabb): boolean {
  if (y0 >= b.y1 || y1 <= b.y0) return false;
  const cx = Math.max(b.x0, Math.min(x, b.x1));
  const cz = Math.max(b.z0, Math.min(z, b.z1));
  return Math.hypot(x - cx, z - cz) < r - 1e-6;
}

/** Габариты всего, что ставит замок (для проверки): коробки и цилиндры */
export interface DecorItem {
  name: string;
  box?: Aabb;
  cyl?: { x: number; z: number; r: number; y0: number; y1: number };
}

export function decorItems(): DecorItem[] {
  const g = GATEHOUSE;
  const items: DecorItem[] = [];
  items.push({ name: 'надвратная башня', box: aabb(-g.hx - 0.5, g.beams, g.z0 - 0.5, g.hx + 0.5, g.peak + 0.2, g.z1 + 0.5) });
  for (const s of [-1, 1]) {
    const xa = Math.min(s * g.sx0, s * g.sx1);
    const xb = Math.max(s * g.sx0, s * g.sx1);
    items.push({ name: 'консоль спереди', box: aabb(xa, g.front, g.z0, xb, g.floor, THROAT_Z) });
    items.push({ name: 'консоль сзади', box: aabb(xa, g.rear, GATE.face + WALL_T, xb, g.floor, g.z1) });
  }
  // арки между консолями (спереди — над входом в «горло», сзади — над выходом из проезда во двор)
  items.push({ name: 'арка спереди', box: aabb(-g.sx0, 4.95, g.z0, g.sx0, g.floor, THROAT_Z) });
  items.push({ name: 'арка сзади', box: aabb(-g.sx0, 5.3, GATE.face + WALL_T, g.sx0, g.floor, g.z1) });
  // решётка над «горлом» (поднята — низ выше хода по стене с головой)
  items.push({ name: 'решётка', box: aabb(-2.45, 5.2, g.z0 + 0.15, 2.45, g.floor, g.z0 + 0.3) });
  for (const b of BARTIZANS) items.push({ name: 'эркер', cyl: { x: b.x, z: b.z, r: BARTIZAN.eave, y0: BARTIZAN.corbel, y1: BARTIZAN.peak } });
  for (const b of BANNERS) {
    const ax = Math.abs(b.nz) > 0.5;
    const d0 = 0;
    const d1 = 0.12;
    items.push({
      name: 'знамя',
      box: ax
        ? aabb(b.x - b.w / 2, b.top - b.len, Math.min(b.z + b.nz * d0, b.z + b.nz * d1), b.x + b.w / 2, b.top + 0.1, Math.max(b.z + b.nz * d0, b.z + b.nz * d1))
        : aabb(Math.min(b.x + b.nx * d0, b.x + b.nx * d1), b.top - b.len, b.z - b.w / 2, Math.max(b.x + b.nx * d0, b.x + b.nx * d1), b.top + 0.1, b.z + b.w / 2),
    });
  }
  for (const l of LIGHTS) {
    const r = l.kind === 'post' ? 0.2 : 0.22;
    const ox = l.x + l.nx * 0.18;
    const oz = l.z + l.nz * 0.18;
    items.push({ name: l.kind === 'torch' ? 'факел' : 'фонарь', box: aabb(ox - r, l.y - 0.32, oz - r, ox + r, l.y + 0.62, oz + r) });
  }
  for (const p of TERRACE_POSTS) items.push({ name: 'столб террасы', box: aabb(p.x - 0.08, p.y0, p.z - 0.08, p.x + 0.08, p.y1, p.z + 0.08) });
  for (const [name, box] of Object.entries(YARD)) items.push({ name, box });
  return items;
}
