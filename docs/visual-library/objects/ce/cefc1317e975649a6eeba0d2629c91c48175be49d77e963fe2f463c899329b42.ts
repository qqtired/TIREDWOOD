// Трасса картинга «Портовое кольцо» (вторая версия, id harbor): порт днём. X — восток, Z — юг, «север» = −Z.
// Круг ≈ 1,16 км против часовой стрелки. Старт и финиш — на южной прямой у трибуны, за ним шикана из двух изломов.
// Дальше восточный причал (справа море): горб-кикер и трамплин через канал; мыс с бухтой — срезка прыжком через воду
// или шпилька вокруг бухты (внутри вода без стены); северный причал с качающимся грузом крана и вторым каналом;
// дальний западный поворот и тугая «змейка» между штабелями: блоки, вертушка, контейнер на рельсах.
// На юго-западном и юго-восточном углах снаружи песок. Ширина дороги меняется от 10 до 15 м.
// Помехи и ускорители — в описании hazards (см. shared/hazards.ts): они же считаются в физике карта.
import { buildTrack, type Track, type TrackDef } from '../track.ts';
import type { HazardSpec } from '../hazards.ts';
import { buildLand, type LandShape } from './ringland.ts';
import type { Deco } from './types.ts';

const HALF_PI = Math.PI / 2;

/**
 * Ноги трассы: 0 — южная прямая (на восток, старт на 66-м метре), 1 — шикана, 2 — южная прямая за шиканой,
 * 3 — восточный причал (на север), 4 — верх мыса (на запад, 9 м), 5 — вниз по восточному берегу бухты, 6 — дно бухты,
 * 7 — вверх по западному берегу бухты, 8 — северный причал (на запад), 9 — западный подъезд (на юг), 10 — змейка на
 * восток, 11 — на юг (шикана из блоков), 12 — на запад, 13 — выход на южную прямую.
 */
const NODES = [
  { x: -150, z: 112, r: 24 },
  { x: 5, z: 112, r: 16 },
  { x: 21.38, z: 100.53, r: 16 },
  { x: 135, z: 100.53, r: 36 },
  { x: 135, z: -62, r: 18 },
  { x: 90, z: -62, r: 18 },
  { x: 90, z: 2, r: 7 },
  { x: 64, z: 2, r: 7 },
  { x: 64, z: -62, r: 12 },
  { x: -150, z: -62, r: 28 },
  { x: -150, z: 8, r: 8.5 },
  { x: -80, z: 8, r: 8.5 },
  { x: -80, z: 62, r: 8.5 },
  { x: -150, z: 62, r: 8.5 },
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
    { leg: 0, at: 30, len: 7, w: 4 },
    { leg: 2, at: 8, lat: -2.5, len: 7, w: 3.6 },
    // разгон на кикер и трамплин через канал
    { leg: 3, at: 1, len: 6, w: 4 },
    // под началом настила срезки: разгоняет, чтобы долететь через бухту
    { leg: 4, at: 25, len: 6, w: 4 },
    { leg: 8, at: 78, len: 7, w: 4 },
  ],
  slicks: [
    { leg: 2, at: 36, lat: -3.2, kind: 'oil', rl: 4.5, rw: 2.6, yaw: 0.1 },
    { leg: 3, at: 80, lat: 3.2, kind: 'water', rl: 5, rw: 2.6 },
    { leg: 7, at: 33, lat: -1.5, kind: 'oil', rl: 4, rw: 2.6 },
    { leg: 8, at: 150, lat: 2.5, kind: 'water', rl: 5, rw: 3 },
    { leg: 12, at: 15.5, lat: 1, kind: 'oil', rl: 4, rw: 3 },
  ],
  barrels: [
    ...barrels(2, 52, 5.2),
    ...barrels(5, 22, -3),
    ...barrels(8, 7, -4.3),
    ...barrels(8, 136, -4.6),
    ...barrels(12, 37.5, -3.3),
  ],
  blocks: [
    // шикана на ноге 11: два блока поперёк дороги с разных сторон — «змейка» вправо-влево
    { leg: 11, at: 11, lat: -2.5, len: 5, wid: 1.1, yaw: HALF_PI },
    { leg: 11, at: 23, lat: 2.5, len: 5, wid: 1.1, yaw: HALF_PI },
    // островок посреди широкого подъезда (не на КТ: туда возвращается упавший)
    { leg: 9, at: 21, lat: 0, len: 4, wid: 1.1 },
  ],
  // настил срезки: ровная площадка на внешнем краю поворота, за ней — подъём на 2 м, дальше бухта
  decks: [
    { leg: 4, at: 19, len: 16, w: 10, y0: 0, y1: 0 },
    { leg: 4, at: 34, len: 14, w: 8, y0: 0, y1: 2 },
  ],
  movers: [
    // контейнер на рельсах выезжает из двора на южную прямую за шиканой и уходит обратно
    { kind: 'slide', leg: 2, at: 22, from: -11, to: 1.6, len: 6.06, wid: 2.44, period: 420, dwell: 48 },
    // груз портального крана качается поперёк причала
    { kind: 'swing', leg: 8, at: 52, amp: 5.2, r: 1.35, period: 270 },
    // шлагбаум-вертушка на змейке
    { kind: 'spin', leg: 10, at: 26.5, lat: -0.3, arm: 4.2, r: 0.35, period: 190 },
    // второй контейнер — на выходе из змейки, из двора с юга
    { kind: 'slide', leg: 12, at: 29.5, from: -8.6, to: 1, len: 6.06, wid: 2.44, period: 400, dwell: 44, phase: 150 },
  ],
};

export const RING: TrackDef = {
  name: 'Портовое кольцо',
  nodes: NODES,
  width: 14,
  widths: [
    { leg: 0, at: 96, w: 14 },
    { leg: 1, at: 0, w: 11 },
    { leg: 2, at: 10, w: 13 },
    { leg: 2, at: 60, w: 14 },
    { leg: 3, at: 0, w: 13 },
    { leg: 3, at: 22, w: 12 },
    { leg: 3, at: 92, w: 12.5 },
    { leg: 4, at: 0, w: 12 },
    { leg: 5, at: 0, w: 10.5 },
    { leg: 6, at: 0, w: 10 },
    { leg: 7, at: 44, w: 11 },
    { leg: 8, at: 0, w: 12 },
    { leg: 8, at: 85, w: 12 },
    { leg: 8, at: 96, w: 10.5 },
    { leg: 8, at: 120, w: 10.5 },
    { leg: 8, at: 140, w: 13 },
    { leg: 9, at: 0, w: 15 },
    { leg: 9, at: 26, w: 15 },
    { leg: 10, at: 0, w: 11 },
    { leg: 10, at: 45, w: 10 },
    { leg: 11, at: 29.5, w: 10 },
    { leg: 12, at: 0, w: 10 },
    { leg: 12, at: 45.5, w: 11 },
    { leg: 13, at: 0, w: 12 },
  ],
  step: 2,
  // x = −60
  start: { leg: 0, at: 66 },
  // КТ нет на берегах бухты: срезка прыжком через бухту не обходит ни одной
  checkpoints: [
    { leg: 2, at: 30 },
    { leg: 3, at: 70 },
    { leg: 8, at: 30 },
    { leg: 8, at: 138 },
    { leg: 9, at: 12 },
    // на змейке — в начале ног: возврат на КТ не ставит карт под вертушку и контейнер
    { leg: 10, at: 9 },
    { leg: 12, at: 9 },
    { leg: 13, at: 2 },
  ],
  // J1 — канал через восточный причал: подъём 10 м на 2,2 м, провал 14 м; J2 — канал на северном причале: 12 м на 2,4 м, 14 м
  ramps: [
    { leg: 3, at: 28.5, up: 10, height: 2.2, gap: 14 },
    { leg: 8, at: 92, up: 12, height: 2.4, gap: 14 },
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
    { leg: 0, at: 94, count: 4 },
    { leg: 3, at: 75, count: 3 },
    { leg: 5, at: 17, count: 3 },
    { leg: 7, at: 17, count: 3 },
    { leg: 8, at: 128, count: 4 },
    { leg: 10, at: 15.5, count: 3 },
    { leg: 12, at: 36.5, count: 3 },
  ],
  hazards: HAZARDS,
  // горб-кикер перед трамплином через восточный канал
  heights: [
    { leg: 3, at: 5, y: 0 },
    { leg: 3, at: 12, y: 0.9, sharp: true },
    { leg: 3, at: 19, y: 0 },
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
    { x0: -76, z0: 84, x1: -42, z1: 100, alongZ: false },
    { x0: -16, z0: 74, x1: 44, z1: 89, alongZ: false },
    { x0: 54, z0: 74, x1: 78, z1: 89, alongZ: false },
    // юго-западный угол
    { x0: -126, z0: 86, x1: -80, z1: 100, alongZ: false },
    // восточный причал и мыс
    { x0: 84, z0: 34, x1: 106, z1: 80, alongZ: true },
    { x0: 100, z0: -44, x1: 124, z1: 6, alongZ: true },
    // северный причал
    { x0: -26, z0: -35, x1: 50, z1: -15, alongZ: false },
    { x0: -126, z0: -30, x1: -74, z1: -4, alongZ: false },
  ],
  cranes: [
    { x: 116, z: 44, yaw: EAST },
    { x: 116, z: 66, yaw: EAST },
    { x: -12, z: -44, yaw: NORTH },
    { x: 32, z: -44, yaw: NORTH },
    { x: -30, z: 96, yaw: SOUTH },
  ],
  sheds: [
    { x0: -32, z0: 18, x1: 12, z1: 34, alongZ: false, h: 8, color: 0xd5d1c6 },
    { x0: 26, z0: 40, x1: 62, z1: 54, alongZ: false, h: 8, color: 0xc4cbd0 },
  ],
  tanks: [
    { x: -60, z: 28, r: 7, h: 11 },
    { x: -60, z: 46, r: 7, h: 11 },
    { x: -46, z: 37, r: 6, h: 9 },
  ],
  cabins: [
    [-20, 8, 0],
    [70, 24, 0.3],
    [20, 70, 0],
  ],
  signs: [{ x: 112, z: -54, yaw: 0.91, w: 5, text: 'СРЕЗКА', bg: '#1d5fae', dir: 0 }],
  water: [
    { kind: 'boat', x: -118, z: 26, yaw: HALF_PI, color: 0x2f5f8f },
    { kind: 'boat', x: -102, z: 46, yaw: -HALF_PI, color: 0xf2efe6 },
    { kind: 'boat', x: -128, z: 40, yaw: 0, color: 0x8f3b2f },
    { kind: 'boat', x: 77, z: -26, yaw: Math.PI, color: 0xc9a03a },
    { kind: 'boat', x: 112, z: 19, yaw: HALF_PI, color: 0x3f7f6a },
    { kind: 'boat', x: -59, z: -42, yaw: 0, color: 0xc9a03a },
    { kind: 'boat', x: 156, z: 10, yaw: Math.PI, color: 0x2f5f8f },
    { kind: 'boat', x: -12, z: -78, yaw: HALF_PI, color: 0xf2efe6 },
    { kind: 'boat', x: 30, z: 128, yaw: -HALF_PI, color: 0x8f3b2f },
    { kind: 'buoy', x: -158, z: 14, color: 0xc0392b },
    { kind: 'buoy', x: -158, z: 56, color: 0x2f8f4e },
    { kind: 'buoy', x: -172, z: 92, color: 0xc0392b },
    { kind: 'buoy', x: 150, z: 130, color: 0x2f8f4e },
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
