// Трасса картинга «Солнечный серпантин»: приморский городок на холме, яркий день. X — восток, Z — юг, «север» = −Z.
// Круг ≈ 1,27 км по часовой стрелке. Старт — на южной прямой у трибун (на запад). Дальше: правый поворот с песком
// снаружи, серпантин вверх на холм (три шпильки, +3 м между ними), гребень с прыжком, спуск через виноградник,
// река: узкий каменный мост в обход или прыжок с причала напрямую (рискованная срезка — недолёт в воду), деревня с
// переездом (шлагбаумы) и шиканой, широкая дуга вокруг фонтана с песчаной срезкой внутри (окупается только с турбо),
// ускоритель и прыжок через канаву на стартовую прямую.
// Помехи и ускорители — в описании hazards (см. shared/hazards.ts): они же считаются в физике карта.
import type { HazardSpec } from '../hazards.ts';
import { buildTrack, nodeArc, type TrackDef } from '../track.ts';
import type { Ring } from './ring.ts';

/**
 * Узлы: 0 — выход из дуги фонтана на стартовую прямую, 1 — поворот 1 (направо 110°), 2 — въезд в серпантин,
 * 3–4, 5–6, 7–8 — шпильки, 9 — поворот на гребень, 10 — дуга виноградника, 11–14 — река (11 — съезд к мосту, 12–13 —
 * мост, 14 — выезд на восток), 15 — поворот в деревню, 16–18 — шикана, 19 — поворот к фонтану, 20 — дуга фонтана.
 * Ноги: 0 — стартовая прямая, 2/4/6/8 — подъёмы серпантина, 9 — гребень, 10 — низ виноградника, 12 — мост,
 * 14 — к деревне, 15 — деревня с переездом, 18 — после шиканы.
 */
const NODES = [
  { x: 150, z: 178, r: 30 },
  { x: -80, z: 178, r: 10 },
  { x: -67.7, z: 144.2, r: 12 },
  { x: -3.7, z: 132.9, r: 7 },
  { x: -3.7, z: 120.9, r: 7 },
  { x: -67.7, z: 109.6, r: 7 },
  { x: -67.7, z: 97.6, r: 7 },
  { x: -3.7, z: 86.3, r: 7 },
  { x: -3.7, z: 74.3, r: 7 },
  { x: -67.7, z: 63, r: 12 },
  { x: -39, z: -100, r: 40 },
  { x: 40, z: -100, r: 8 },
  { x: 40, z: -78, r: 8 },
  { x: 70, z: -78, r: 8 },
  { x: 70, z: -100, r: 8 },
  { x: 127.4, z: -100, r: 18 },
  { x: 127.4, z: 10, r: 9 },
  { x: 138.7, z: 21.3, r: 9 },
  { x: 127.4, z: 32.6, r: 9 },
  { x: 127.4, z: 113.4, r: 14 },
  { x: 162, z: 133.4, r: 30 },
];

const HAZARDS: HazardSpec = {
  pads: [
    // разгон перед прыжком через канаву на стартовую прямую
    { leg: 0, at: 4, len: 6, w: 4 },
    // на гребень с турбо — дальний полёт
    { leg: 9, at: 12, lat: 2.2, len: 6, w: 3.4 },
    // деревня: сбоку, мимо шлагбаумов
    { leg: 15, at: 20, lat: -3, len: 7, w: 3.4 },
  ],
  slicks: [
    // лужи у реки и у фонтана
    { leg: 14, at: 12, lat: 2, kind: 'water', rl: 4, rw: 2.2 },
    { leg: 19, at: 2, lat: -2.5, kind: 'water', rl: 3.5, rw: 2.2 },
  ],
  // стопки шин у апексов шиканы
  barrels: [
    { leg: 16, at: 1, lat: 6.2 },
    { leg: 17, at: 1, lat: -6.2 },
  ],
  blocks: [
    // тюки сена на деревенской улице: объезд с двух сторон
    { leg: 18, at: 40, lat: 0, len: 3, wid: 1.2 },
  ],
  // причал срезки через реку: ровная площадка снаружи поворота к мосту, за ней — подъём на 1,2 м и вода
  decks: [
    { leg: 10, at: 46, lat: 0, len: 12, w: 13, y0: 0, y1: 0 },
    { leg: 10, at: 55, lat: 0, len: 6, w: 9, y0: 0, y1: 1.2 },
    // мостки на том берегу, за 8,8 м воды: долетел (нужно от 16 м/с) — садишься на них и выкатываешься на дорогу
    { leg: 10, at: 70.8, lat: 0.5, len: 8, w: 13, y0: 0, y1: 0 },
  ],
  movers: [
    // переезд: два шлагбаума на разных половинах улицы, закрываются по очереди — одна сторона всегда свободна
    { kind: 'gate', leg: 15, at: 52, lat: -3.2, len: 6.6, wid: 0.8, period: 300 },
    { kind: 'gate', leg: 15, at: 52, lat: 3.2, len: 6.6, wid: 0.8, period: 300, phase: 150 },
    // тюк сена на подъёмнике амбара качается поперёк улицы
    { kind: 'swing', leg: 18, at: 18, amp: 4.4, r: 1.1, period: 240 },
  ],
};

export const HILLS: TrackDef = {
  name: 'Солнечный серпантин',
  nodes: NODES,
  width: 14,
  widths: [
    { leg: 0, at: 150, w: 14 },
    { leg: 1, at: 0, w: 12 },
    { leg: 2, at: 0, w: 10 },
    { leg: 8, at: -1, w: 10 },
    { leg: 9, at: 10, w: 12 },
    { leg: 10, at: 20, w: 12 },
    { leg: 11, at: 0, w: 10 },
    { leg: 12, at: 0, w: 7.5 },
    { leg: 12, at: -1, w: 7.5 },
    { leg: 13, at: 0, w: 10 },
    { leg: 14, at: 8, w: 12 },
    { leg: 15, at: 10, w: 13 },
    { leg: 16, at: 0, w: 11 },
    { leg: 18, at: 10, w: 12 },
    { leg: 19, at: 0, w: 12 },
  ],
  step: 2,
  start: { leg: 0, at: 80 },
  checkpoints: [
    { leg: 0, at: 160 },
    { leg: 2, at: 20 },
    { leg: 4, at: 26 },
    { leg: 6, at: 26 },
    { leg: 8, at: 26 },
    { leg: 9, at: 70 },
    { leg: 10, at: 18 },
    { leg: 14, at: 16 },
    { leg: 15, at: 70 },
    { leg: 18, at: 30 },
    { leg: 19, at: 3 },
  ],
  ramps: [],
  open: [],
  // поворот к мосту: снаружи нет стены — съезд на причал срезки
  // и снаружи поворота за мостом — там мостки срезки, стены нет
  openNodes: [
    { node: 11, side: 'left' },
    { node: 14, side: 'left' },
  ],
  crates: [
    { leg: 0, at: 125, count: 4 },
    { leg: 9, at: 2, count: 3 },
    { leg: 10, at: 8, count: 3 },
    { leg: 15, at: 36, count: 4 },
    { leg: 18, at: 60, count: 3 },
  ],
  hazards: HAZARDS,
  y0: 0,
  heights: [
    // прыжок через канаву в начале стартовой прямой
    { leg: 0, at: 8, y: 0 },
    { leg: 0, at: 15, y: 1.1, sharp: true },
    { leg: 0, at: 22, y: -0.7 },
    { leg: 0, at: 29, y: -0.7 },
    { leg: 0, at: 37, y: 0 },
    // серпантин: +3 м на каждом подъёме
    { leg: 1, at: 0, y: 0 },
    { leg: 2, at: 4, y: 0.4 },
    { leg: 2, at: -2, y: 3 },
    { leg: 4, at: 2, y: 3 },
    { leg: 4, at: -2, y: 6 },
    { leg: 6, at: 2, y: 6 },
    { leg: 6, at: -2, y: 9 },
    { leg: 8, at: 2, y: 9 },
    // гребень: подъём, острый излом — полёт ~1 с, крутой спуск, дальше пологий спуск через виноградник к реке
    { leg: 9, at: 8, y: 9.2 },
    { leg: 9, at: 26, y: 11.6, sharp: true },
    { leg: 9, at: 44, y: 7.4 },
    { leg: 9, at: -4, y: 5.4 },
    { leg: 10, at: 10, y: 1.4 },
    { leg: 10, at: -2, y: 0.5 },
    // мост — лёгкий горб
    { leg: 12, at: 7.5, y: 1.2 },
    { leg: 14, at: 6, y: 0.5 },
    { leg: 15, at: 40, y: 0.6 },
    { leg: 18, at: 20, y: 0.3 },
  ],
  verge: 1.5,
  verges: [
    // поворот 1: снаружи песок
    { node: 1, side: 'left', w: 7, sand: true, pre: 24, post: 12 },
    { node: 2, side: 'left', w: 3.5, sand: true, pre: 6, post: 6 },
    // шпильки: снаружи песок перед шинами, внутри — узко
    { node: 3, side: 'right', w: 5, sand: true, pre: 14 },
    { node: 4, side: 'right', w: 5, sand: true, post: 8 },
    { node: 3, side: 'left', w: 0.6, pre: 10 },
    { node: 4, side: 'left', w: 0.6, post: 10 },
    { node: 5, side: 'left', w: 5, sand: true, pre: 14 },
    { node: 6, side: 'left', w: 5, sand: true, post: 8 },
    { node: 5, side: 'right', w: 0.6, pre: 10 },
    { node: 6, side: 'right', w: 0.6, post: 10 },
    { node: 7, side: 'right', w: 5, sand: true, pre: 14 },
    { node: 8, side: 'right', w: 5, sand: true, post: 8 },
    { node: 7, side: 'left', w: 0.6, pre: 10 },
    { node: 8, side: 'left', w: 0.6, post: 10 },
    // гребень и виноградник: широкая трава
    { leg: 9, side: 'both', w: 2.5 },
    { node: 10, side: 'both', w: 3.5, pre: 10, post: 10 },
    // река: у воды — парапет, мост без обочин
    { node: 11, side: 'right', w: 0.8 },
    { leg: 11, side: 'left', w: 0.4 },
    { node: 12, side: 'left', w: 0.4 },
    { leg: 12, side: 'both', w: 0 },
    { node: 13, side: 'left', w: 0.4 },
    { leg: 13, side: 'left', w: 0.4 },
    { node: 14, side: 'left', w: 0.6 },
    // деревня: тротуары
    { node: 15, side: 'left', w: 4, sand: true, pre: 10, post: 6 },
    { leg: 15, side: 'both', w: 1 },
    { node: 16, side: 'right', w: 2, sand: true },
    { node: 17, side: 'left', w: 2, sand: true },
    { node: 18, side: 'right', w: 2, sand: true },
    // дуга фонтана: внутри широкий песок до шин вокруг фонтана, снаружи — трава
    { node: 20, side: 'right', w: 19, sand: true, pre: 30 },
    { node: 0, side: 'right', w: 19, sand: true, post: 4 },
    { node: 20, side: 'left', w: 3, pre: 10 },
    { node: 0, side: 'left', w: 3 },
  ],
};

/** Узлы дуги фонтана (центр — у первого, шины вокруг чаши — по краю песка) и реки (съезд к мосту и выезд) */
export const HILLS_FOUNTAIN_NODE = 20;
export const HILLS_RIVER_NODES = [11, 12, 13, 14];

/** Суша «Серпантина» — прямоугольник вокруг трассы с запасом (вода — только река и пруд, их рисует клиент) */
const LAND_PAD = 70;

export function buildHills(): Ring {
  const track = buildTrack(HILLS);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < track.n; i++) {
    if (track.px[i] < x0) x0 = track.px[i];
    if (track.px[i] > x1) x1 = track.px[i];
    if (track.pz[i] < z0) z0 = track.pz[i];
    if (track.pz[i] > z1) z1 = track.pz[i];
  }
  x0 -= LAND_PAD;
  z0 -= LAND_PAD;
  x1 += LAND_PAD;
  z1 += LAND_PAD;
  const poly = new Float64Array([x0, z0, x1, z0, x1, z1, x0, z1]);
  return {
    track,
    land: { poly, count: 4, box: { x0, z0, x1, z1 } },
    deco: { yards: [], cranes: [], sheds: [], tanks: [], cabins: [], signs: [], water: [] },
  };
}

/** Центр фонтана — центр дуги узла HILLS_FOUNTAIN_NODE */
export function hillsFountain(): { x: number; z: number } {
  const a = nodeArc(HILLS, HILLS_FOUNTAIN_NODE);
  return { x: a.cx, z: a.cz };
}
