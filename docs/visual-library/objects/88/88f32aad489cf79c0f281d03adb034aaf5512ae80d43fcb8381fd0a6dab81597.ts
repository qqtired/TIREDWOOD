// Трасса картинга «Портовое кольцо» (V3, id harbor): порт днём. X — восток, Z — юг, «север» = −Z.
// Большой круг против часовой стрелки: широкие разгонные секции, глубокая бухта и техничная грузовая змейка.
// Дальше восточный причал (справа море): горб-кикер и трамплин через канал; мыс с бухтой — срезка прыжком через воду
// или шпилька вокруг бухты (внутри вода без стены); северный причал с качающимся грузом крана и вторым каналом;
// дальний западный поворот и тугая «змейка» между штабелями: блоки, вертушка, контейнер на рельсах.
// На юго-западном и юго-восточном углах снаружи песок. Ширина дороги меняется от 12 до 18 м.
// Помехи и ускорители — в описании hazards (см. shared/hazards.ts): они же считаются в физике карта.
import { buildTrack, type Track, type TrackDef } from '../track.ts';
import type { HazardSpec } from '../hazards.ts';
import { buildLand, type LandShape } from './ringland.ts';
import type { Deco } from './types.ts';

const HALF_PI = Math.PI / 2;

/**
 * Ноги трассы: 0 — южная прямая (на восток, старт на 80-м метре), 1 — шикана, 2 — южная прямая за шиканой,
 * 3 — восточный причал (на север), 4 — верх мыса (на запад, 34 м), 5 — вниз по восточному берегу бухты, 6 — дно бухты,
 * 7 — вверх по западному берегу бухты, 8 — северный причал (на запад), 9 — западный подъезд (на юг), 10 — змейка на
 * восток, 11 — на юг (шикана из блоков), 12 — на запад, 13 — выход на южную прямую.
 */
const NODES = [
  { x: -215, z: 175, r: 28 },
  { x: 15, z: 175, r: 18 },
  { x: 57, z: 133, r: 18 },
  { x: 210, z: 133, r: 40 },
  { x: 210, z: -140, r: 24 },
  { x: 130, z: -140, r: 22 },
  { x: 130, z: 0, r: 12 },
  { x: 85, z: 0, r: 12 },
  { x: 85, z: -140, r: 18 },
  { x: -215, z: -140, r: 35 },
  { x: -215, z: -20, r: 13 },
  { x: -105, z: -20, r: 14 },
  { x: -105, z: 85, r: 15 },
  { x: -215, z: 85, r: 16 },
];

/** Группа из трёх бочек у стены: центр (at, lat) и сторона, куда выставлен «носик» группы */
function barrels(leg: number, at: number, lat: number): Array<{ leg: number; at: number; lat: number }> {
  return [
    { leg, at: at - 0.7, lat },
    { leg, at: at + 0.7, lat },
    { leg, at, lat: lat + (lat > 0 ? -1.15 : 1.15) },
  ];
}

const HAZARDS: HazardSpec = {
  // ускорители (6 × 3,6 м, по умолчанию 6 × 3,6)
  pads: [
    { leg: 0, at: 110, lat: 4.5, len: 9, w: 4 },
    { leg: 2, at: 8, lat: -2.5, len: 7, w: 3.6 },
    // разгон на кикер и трамплин через канал
    { leg: 3, at: 55, len: 8, w: 4.5 },
    // под началом настила срезки: разгоняет, чтобы долететь через бухту
    { leg: 4, at: 34, len: 7, w: 4 },
    { leg: 8, at: 112, lat: -3, len: 9, w: 4 },
  ],
  slicks: [
    { leg: 2, at: 61, lat: -4, kind: 'oil', rl: 5.5, rw: 2.6, yaw: 0.1 },
    { leg: 3, at: 165, lat: 4.2, kind: 'water', rl: 6, rw: 2.6 },
    { leg: 7, at: 64, lat: -2.5, kind: 'oil', rl: 5, rw: 2.6 },
    { leg: 8, at: 218, lat: 4, kind: 'water', rl: 6, rw: 3 },
    { leg: 12, at: 31, lat: 2.5, kind: 'oil', rl: 4, rw: 2.4 },
  ],
  barrels: [
    ...barrels(2, 82, 6.6),
    ...barrels(5, 52, -4.5),
    ...barrels(8, 9, -6.3),
    ...barrels(8, 188, -5.8),
    ...barrels(12, 66, -4.8),
  ],
  blocks: [
    // шикана на ноге 11: два блока поперёк дороги с разных сторон — «змейка» вправо-влево
    { leg: 11, at: 19, lat: -3.5, len: 6, wid: 1.1, yaw: HALF_PI },
    { leg: 11, at: 49, lat: 3.5, len: 6, wid: 1.1, yaw: HALF_PI },
    // островок посреди широкого подъезда (не на КТ: туда возвращается упавший)
    { leg: 9, at: 49, lat: 0, len: 7, wid: 1.1 },
  ],
  // настил срезки: ровная площадка на внешнем краю поворота, за ней — подъём на 3,5 м, дальше бухта
  decks: [
    { leg: 4, at: 32, len: 18, w: 12, y0: 0, y1: 0 },
    { leg: 4, at: 47, len: 12, w: 8, y0: 0, y1: 3.5 },
  ],
  movers: [
    // контейнер на рельсах выезжает из двора на южную прямую за шиканой и уходит обратно
    { kind: 'slide', leg: 2, at: 35, from: -13, to: 1.6, len: 6.06, wid: 2.44, period: 420, dwell: 48 },
    // груз портального крана качается поперёк причала
    { kind: 'swing', leg: 8, at: 78, amp: 6.4, r: 1.35, period: 270 },
    // шлагбаум-вертушка на змейке
    { kind: 'spin', leg: 10, at: 50, lat: -0.3, arm: 4.8, r: 0.35, period: 190 },
    // второй контейнер — на выходе из змейки, из двора с юга
    { kind: 'slide', leg: 12, at: 51, from: -11, to: 1, len: 6.06, wid: 2.44, period: 400, dwell: 44, phase: 150 },
  ],
};

export const RING: TrackDef = {
  name: 'Портовое кольцо',
  nodes: NODES,
  width: 18,
  widths: [
    { leg: 0, at: 140, w: 18 },
    { leg: 1, at: 0, w: 14 },
    { leg: 2, at: 10, w: 16 },
    { leg: 3, at: 0, w: 16 },
    { leg: 3, at: 66, w: 14 },
    { leg: 3, at: 155, w: 15 },
    { leg: 4, at: 0, w: 14 },
    { leg: 5, at: 0, w: 12.5 },
    { leg: 6, at: 0, w: 12 },
    { leg: 7, at: 74, w: 13 },
    { leg: 8, at: 0, w: 16 },
    { leg: 8, at: 128, w: 16 },
    { leg: 8, at: 153, w: 13 },
    { leg: 8, at: 179, w: 13 },
    { leg: 8, at: 215, w: 17 },
    { leg: 9, at: 0, w: 18 },
    { leg: 9, at: 49, w: 18 },
    { leg: 10, at: 0, w: 14 },
    { leg: 10, at: 64, w: 13 },
    { leg: 11, at: 60, w: 13 },
    { leg: 12, at: 0, w: 13 },
    { leg: 12, at: 69, w: 14 },
    { leg: 13, at: 0, w: 15 },
  ],
  step: 2,
  start: { leg: 0, at: 80 },
  // КТ нет на берегах бухты: срезка прыжком через бухту не обходит ни одной
  checkpoints: [
    { leg: 2, at: 55 },
    { leg: 3, at: 145 },
    { leg: 8, at: 30 },
    { leg: 8, at: 205 },
    { leg: 9, at: 25 },
    // на змейке — в начале ног: возврат на КТ не ставит карт под вертушку и контейнер
    { leg: 10, at: 18 },
    { leg: 12, at: 16 },
    { leg: 13, at: 12 },
  ],
  // J1: подъём 14 м на 2,7 м и 19 м воды; J2: подъём 15 м на 3 м и 21 м воды.
  ramps: [
    { leg: 3, at: 80, up: 14, height: 2.7, gap: 19 },
    { leg: 8, at: 142, up: 15, height: 3, gap: 21 },
  ],
  open: [
    { leg: 3, side: 'right', from: 0, to: 1e3 },
    { leg: 5, side: 'right', from: 0, to: 1e3 },
    { leg: 6, side: 'right', from: 0, to: 1e3 },
    { leg: 7, side: 'right', from: 0, to: 1e3 },
    { leg: 8, side: 'right', from: 0, to: 1e3 },
  ],
  // внешний край поворота за мысом и берега бухты: без стены (с него и стартует срезка)
  openNodes: [
    { node: 5, side: 'right' },
    { node: 6, side: 'right' },
    { node: 7, side: 'right' },
    { node: 8, side: 'right' },
  ],
  crates: [
    { leg: 0, at: 155, count: 4 },
    { leg: 3, at: 154, count: 3 },
    { leg: 5, at: 24, count: 3 },
    { leg: 7, at: 32, count: 3 },
    { leg: 8, at: 195, count: 4 },
    { leg: 10, at: 29, count: 3 },
    { leg: 12, at: 70, count: 3 },
  ],
  hazards: HAZARDS,
  // горб-кикер перед трамплином через восточный канал
  heights: [
    { leg: 3, at: 14, y: 0 },
    { leg: 3, at: 25, y: 1.3, sharp: true },
    { leg: 3, at: 38, y: 0 },
  ],
  verge: 0,
  verges: [
    // газон вдоль старта (внутри кольца)
    { leg: 0, side: 'left', w: 1.5 },
    // юго-западный и юго-восточный углы: снаружи песок перед шинами
    { node: 0, side: 'right', w: 6, sand: true, pre: 10, post: 14 },
    { node: 3, side: 'right', w: 6, sand: true, pre: 14, post: 4 },
    // шпилька в бухте: у воды полоса бетона (страховка на апексе)
    { node: 6, side: 'right', w: 1.2 },
    { node: 7, side: 'right', w: 1.2 },
    { leg: 6, side: 'right', w: 1.2 },
  ],
};

/**
 * Каналы под трамплинами: на сколько метров за левый край дороги уходит рукав воды в суше — по порядку провалов от
 * линии старта (восточный причал, северный причал). Суша — контур вокруг дороги, см. ringland.ts.
 */
export const RING_CANALS = [30, 26];

/** Прямоугольник: верх на y = 0 */
export interface Land {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Площадка под штабеля контейнеров; alongZ — контейнеры длинной стороной вдоль Z */
export interface Yard extends Land {
  alongZ: boolean;
}

/** Причальный кран «Причала»: стрела смотрит по yaw (0 → −Z, −π/2 → +X) */
export interface CraneSpot {
  x: number;
  z: number;
  yaw: number;
}

/** Склад: низкое здание, гребень крыши вдоль X (или вдоль Z, если alongZ); h — высота стен */
export interface Shed extends Land {
  alongZ: boolean;
  h: number;
  color: number;
}

/** Резервуар: цилиндр радиуса r и высоты h */
export interface Tank {
  x: number;
  z: number;
  r: number;
  h: number;
}

/** Щит-указатель на стойках: стоит в (x, z) и смотрит по yaw (0 → +Z), w — ширина, высота в три раза меньше */
export interface SignSpot {
  x: number;
  z: number;
  yaw: number;
  w: number;
  text: string;
  /** Цвет щита (CSS) */
  bg: string;
  /** Стрелка: 1 — вправо, −1 — влево, 0 — прямо */
  dir: 1 | -1 | 0;
}

/**
 * Декор вокруг трассы — только для вида, карты с ним не сталкиваются. Площадки, склады, резервуары и опоры кранов
 * стоят на суше не ближе 2 м от края дороги (тест track.test.ts следит), вне рельсов контейнеров и каналов.
 */
export interface RingDeco {
  yards: Yard[];
  cranes: CraneSpot[];
  sheds: Shed[];
  tanks: Tank[];
  /** Бытовки: x, z, поворот (ставятся, если место свободно) */
  cabins: Array<[number, number, number]>;
  signs: SignSpot[];
  /** Лодки и буи на воде */
  water: Deco[];
}

/** Куда смотрят краны: стрела над дорогой и водой */
const NORTH = 0;
const EAST = -HALF_PI;
const SOUTH = Math.PI;

export const RING_DECO: RingDeco = {
  yards: [
    // южная прямая: штабеля вдоль старта, между ними кран и рельсы контейнера; за шиканой дорога ближе — штабеля севернее
    { x0: -85, z0: 138, x1: -35, z1: 159, alongZ: false },
    { x0: -15, z0: 104, x1: 42, z1: 128, alongZ: false },
    { x0: 68, z0: 100, x1: 92, z1: 117, alongZ: false },
    { x0: 107, z0: 100, x1: 132, z1: 117, alongZ: false },
    // юго-западный угол
    { x0: -185, z0: 120, x1: -126, z1: 154, alongZ: false },
    // восточный причал и мыс
    { x0: 164, z0: 18, x1: 180, z1: 80, alongZ: true },
    { x0: 156, z0: -92, x1: 183, z1: -47, alongZ: true },
    // северный причал
    { x0: -49, z0: -111, x1: 58, z1: -87, alongZ: false },
    { x0: -183, z0: -99, x1: -124, z1: -61, alongZ: false },
  ],
  cranes: [
    { x: 190, z: 10, yaw: EAST },
    { x: 190, z: 61, yaw: EAST },
    { x: -10, z: -119, yaw: NORTH },
    { x: 37, z: -119, yaw: NORTH },
    { x: -25, z: 154, yaw: SOUTH },
  ],
  sheds: [
    { x0: -62, z0: 20, x1: 5, z1: 39, alongZ: false, h: 8, color: 0xd5d1c6 },
    { x0: 22, z0: 59, x1: 77, z1: 80, alongZ: false, h: 8, color: 0xc4cbd0 },
  ],
  tanks: [
    { x: -79, z: 24, r: 7, h: 11 },
    { x: -79, z: 44, r: 7, h: 11 },
    { x: -63, z: 57, r: 6, h: 9 },
  ],
  cabins: [
    [-20, 8, 0],
    [143, 20, 0.3],
    [20, 104, 0],
  ],
  signs: [{ x: 165, z: -130, yaw: 0.91, w: 5, text: 'СРЕЗКА', bg: '#1d5fae', dir: 0 }],
  water: [
    { kind: 'boat', x: -175, z: 6, yaw: HALF_PI, color: 0x2f5f8f },
    { kind: 'boat', x: -144, z: 51, yaw: -HALF_PI, color: 0xf2efe6 },
    { kind: 'boat', x: -188, z: 46, yaw: 0, color: 0x8f3b2f },
    { kind: 'boat', x: 106, z: -70, yaw: Math.PI, color: 0xc9a03a },
    { kind: 'boat', x: 236, z: 36, yaw: HALF_PI, color: 0x3f7f6a },
    { kind: 'boat', x: -130, z: -165, yaw: 0, color: 0xc9a03a },
    { kind: 'boat', x: 234, z: -65, yaw: Math.PI, color: 0x2f5f8f },
    { kind: 'boat', x: -12, z: -158, yaw: HALF_PI, color: 0xf2efe6 },
    { kind: 'boat', x: 30, z: 196, yaw: -HALF_PI, color: 0x8f3b2f },
    { kind: 'buoy', x: 223, z: -20, color: 0xc0392b },
    { kind: 'buoy', x: 223, z: 52, color: 0x2f8f4e },
    { kind: 'buoy', x: -231, z: 134, color: 0xc0392b },
    { kind: 'buoy', x: 225, z: 159, color: 0x2f8f4e },
  ],
};

/** Портальный кран: опоры ±6 × ±5 м (до поворота), толщина 1 м */
export const CRANE_HALF_X = 6.5;
export const CRANE_HALF_Z = 5.5;

export interface Ring {
  track: Track;
  land: LandShape;
  deco: RingDeco;
}

export function buildRing(): Ring {
  const track = buildTrack(RING);
  return { track, land: buildLand(track, RING_CANALS), deco: RING_DECO };
}
