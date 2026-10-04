// «Набег пиратов»: корабль «Весёлый Мармелад» — яркий игрушечный бриг. Корпус — лофт по шпангоутам (острый нос с
// подъёмом, высокая корма с кормовой надстройкой и окнами со светом), обшивка досками цветами вершин: тёплое красное
// дерево, кремовая полоса у планширя, золотой пояс, тёмное днище; по 4 пушечных порта на борт с откинутыми крышками.
// Две мачты (фок и грот), прямые паруса на реях и кливер — кремовые, с заплатами, на гроте знак: жёлтая улыбчивая
// желейка в треуголке на тёмно-красном (CanvasTexture). На грот-мачте «воронье гнездо» и чёрный флаг с белой желейкой
// (лента, волна), на носу — смеющаяся желейка, якорь на кат-балке, бочки и ящики, штурвал, фонари.
// Корень group — в ватерлинии, нос по +Z, левый борт +X, правый −X. Качку, крен, паруса, флаг, откат пушек и
// повреждения update() делает внутри подгруппы hull; позицию и курс group ставит контроллер.
// Сетки: корпус со всем неподвижным (1), огни (1), паруса (1), флаг (1), стволы (инстансы, 1), якорь с канатом (1),
// пена у носа (1), повреждения (2), целые перила юта (1) — 10 вызовов отрисовки.
import * as THREE from 'three';
import { colored, merge } from '../fort/mobs/kit.ts';
import { curve, mergeColored, paint, tube } from '../fort/mobs/sea-shapes.ts';
import { barrelGeo, crateGeo } from './pirateloot.ts';

export interface ShipAnim {
  /** Секунды (качка, колыхание парусов и флага) */
  t: number;
  /** Скорость хода, м/с */
  speed: number;
  /** 0 — на ходу, 1 — на якоре (нижние паруса подобраны, якорь отдан) */
  anchored: number;
  /** −1…1 — поворот: лёгкий крен */
  turn: number;
  /** Отдача пушки i (0…1): 0…3 — левый борт (+X), 4…7 — правый (−X) */
  guns: readonly number[];
  /** 0…1 — повреждения: заплатки и щербины (от 0,33), пробоины и сломанные перила юта (от 0,66) */
  damage: number;
  /** 0…1 — уходит: паруса полные, нос задран */
  flee: number;
  /** Белый флаг вместо пиратского */
  whiteFlag: boolean;
  /**
   * Разворот реев (необязательно), −1…1: +1 — паруса лицом к левому борту (+X), −1 — к правому (−X), 0 — поперёк.
   * На якоре бортом к площади ставь сторону площади: знак на марселе будет виден с причала. По умолчанию +1.
   */
  brace?: number;
}

export interface ShipPoint {
  x: number;
  y: number;
  z: number;
}

export interface ShipModel {
  /** Корень в ватерлинии; нос +Z */
  group: THREE.Group;
  /**
   * Подгруппа качки (внутри group): все точки ниже заданы в её осях (в покое совпадают с осями group). Мировая точка с
   * качкой — hull.localToWorld(v.set(x, y, z)).
   */
  readonly hull: THREE.Object3D;
  /** 8 пушек: 0…3 — левый борт (+X), 4…7 — правый (−X), от кормы к носу: дульный срез и направление выстрела в XZ */
  readonly muzzles: ReadonlyArray<{ x: number; y: number; z: number; dx: number; dz: number }>;
  /**
   * Места матросов-болельщиков: 0…2 — у левого борта (+X), 3…5 — у правого (−X), 6 — «воронье гнездо», 7 — ют
   * (капитанский мостик). yaw — как у crowdRoot (0 — лицом в −Z), относительно корабля; у бортов — лицом наружу, в
   * гнезде — к левому борту, на юте — к носу.
   */
  readonly deck: ReadonlyArray<{ x: number; y: number; z: number; yaw: number }>;
  /** Шлюпбалки: 0 — левый борт (+X), 1 — правый (−X); точка — где корень (ватерлиния) поднятой шлюпки (нос по +Z) */
  readonly davits: ReadonlyArray<ShipPoint>;
  /** Откуда идёт дым при повреждениях (у пробоин) */
  readonly smokeSpots: ReadonlyArray<ShipPoint>;
  update(a: ShipAnim, dt: number): void;
  /**
   * Мировая матрица корня особи на месте deck[i] с качкой корпуса — сразу для PirateCrowd.add (scale — рост).
   * Мировые матрицы group должны быть свежими (после update и смены позиции контроллером: обновляет сама).
   */
  deckRoot(i: number, out: THREE.Matrix4, scale?: number): THREE.Matrix4;
  dispose(): void;
}

// ------------------------------------------------------------ обводы

/** Корма и нос (без бушприта) */
const Z0 = -7.5;
const Z1 = 8.0;
/** Наибольшая полуширина, высота наибольшей ширины */
const BEAM = 2.7;
const YMAX = 1.0;
/** Палуба и ют (с z < POOP_Z) */
const DECK_Y = 1.6;
const POOP_Y = 2.75;
const POOP_Z = -3.4;
/** Толщина фальшборта */
const WALL = 0.14;
/** Пушечные порты: высота центра, места по длине (от кормы к носу) */
const GUN_Y = 1.13;
const GUN_Z = [-0.8, 1.2, 3.2, 5.0] as const;
/** Мачты: фок и грот (z, низ, топ) */
const MAIN_Z = -0.6;
const FORE_Z = 3.6;
const MAIN_TOP = 14.6;
const FORE_TOP = 12.6;
const NEST_Y = 12.3;
/** Шлюпбалки */
const DAVIT_Z = -3.2;
/**
 * Реи развёрнуты (обрасоплены) вокруг мачт на угол до BRACE (ShipAnim.brace): с борта паруса видны не ребром, знак
 * на грот-марселе читается с площади. Реи и паруса — с одним углом; неподвижный такелаж реев не касается.
 */
const BRACE = 0.95;
let BC = Math.cos(BRACE);
let BS = Math.sin(BRACE);

/** Точка паруса или рея: x — поперёк, dz — вперёд от оси мачты; после разворота рея → [x, z] */
function braced(x: number, dz: number, mastZ: number): [number, number] {
  return [x * BC + dz * BS, mastZ - x * BS + dz * BC];
}

function sstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Полуширина по палубе в плане: полная в середине, острый нос, скруглённая корма */
function beamAt(z: number): number {
  if (z > 1.5) {
    const t = Math.min(1, (z - 1.5) / (Z1 - 1.5));
    return BEAM * Math.pow(Math.max(0, 1 - Math.pow(t, 2.1)), 0.75);
  }
  if (z < -2) {
    const t = (-2 - z) / (-2 - Z0);
    return BEAM * (1 - 0.2 * t * t);
  }
  return BEAM;
}

/** Киль: подъём к носу (форштевень) и к корме */
function keelAt(z: number): number {
  if (z > 3) return -1.25 + 2.35 * Math.pow((z - 3) / (Z1 - 3), 2.2);
  if (z < -5) return -1.25 + 0.55 * Math.pow((-5 - z) / (-5 - Z0), 1.5);
  return -1.25;
}

/** Планширь: 2,3 м посередине, к носу выше, на корме — до 3,6 м (ют) */
function railAt(z: number): number {
  return 2.3 + 1.3 * sstep(POOP_Z + 0.5, POOP_Z - 0.6, z) + 0.55 * Math.pow(Math.max(0, (z - 3) / (Z1 - 3)), 2);
}

function deckAt(z: number): number {
  return z < POOP_Z ? POOP_Y : DECK_Y;
}

/** Полуширина корпуса на высоте y: скулы — суперэллипс (к носу острее), выше наибольшей ширины — лёгкий завал внутрь */
function halfAt(z: number, y: number): number {
  const W = beamAt(z);
  const yk = keelAt(z);
  const ym = Math.max(YMAX, yk + 0.25);
  if (y <= yk) return 0;
  if (y < ym) {
    const p = 2.5 - 0.9 * sstep(3, Z1, z);
    const t = (ym - y) / (ym - yk);
    return W * Math.pow(Math.max(0, 1 - Math.pow(t, p)), 1 / p);
  }
  const t = (y - ym) / Math.max(0.2, railAt(z) - ym);
  return W * (1 - 0.08 * t * t);
}

/** Шпангоуты (с точной ступенькой юта) */
const STATIONS = [Z0, -7.2, -6.6, -5.8, -4.8, -4.0, POOP_Z, -2.6, -1.6, -0.4, 0.8, 2.0, 3.2, 4.2, 5.1, 5.9, 6.6, 7.2, 7.6, 7.85, Z1];

/** Ряды сечения по высоте: доски — по рядам (чёткие полосы), сверху — кремовая полоса */
function rowsAt(z: number): number[] {
  const yk = keelAt(z);
  const rail = railAt(z);
  const fixed = [-0.85, -0.45, -0.1, 0.25, 0.6, 0.95, 1.3, 1.62, 1.8];
  const ys = [yk, ...fixed, (1.8 + rail - 0.3) / 2, rail - 0.3, rail];
  // ниже киля рядов нет: сжимаем к килю, сохраняя порядок
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + 0.001);
  return ys;
}

const C = {
  bottom: 0x47322b,
  boot: 0x5e2a24,
  wood: 0xe0573a,
  wood2: 0xcd4c31,
  gold: 0xe6b84a,
  cream: 0xf3e1b8,
  inner: 0xb8673e,
  deck: 0xe4b878,
  deck2: 0xd2a364,
  mast: 0x9a6534,
  rope: 0x5c4332,
  iron: 0x2e3440,
  dark: 0x1d1a1c,
};

/** Цвет обшивки по высоте ряда (y — центр грани) и высоте планширя */
function hullColor(y: number, rail: number): number {
  if (y < -0.1) return C.bottom;
  if (y < 0.25) return C.boot;
  if (y > rail - 0.3) return C.cream;
  if (y > 1.62 && y < 1.8) return C.gold;
  return Math.floor((y + 10) / 0.35) % 2 ? C.wood : C.wood2;
}

/** Наружная обшивка: сетка шпангоуты × ряды, оба борта */
function shellGeo(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nRows = rowsAt(0).length;
  const P = STATIONS.map((z) => rowsAt(z).map((y) => [halfAt(z, y), y, z] as const));
  for (const side of [1, -1]) {
    for (let i = 0; i < STATIONS.length - 1; i++) {
      for (let j = 0; j < nRows - 1; j++) {
        const a = P[i][j];
        const b = P[i][j + 1];
        const c = P[i + 1][j];
        const d = P[i + 1][j + 1];
        const v = (p: readonly [number, number, number]) => [side * p[0], p[1], p[2]];
        // обход наружу: для левого борта (+X) a, b, c (z растёт к носу, ряды — вверх)
        const quad = side > 0 ? [a, b, c, b, d, c] : [a, c, b, b, c, d];
        for (const p of quad) pos.push(...v(p));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, (p, _n, o) => o.setHex(hullColor(p.y, railAt(p.z))), true);
}

/** Транец (плоская корма): веер по сечению Z0 */
function transomGeo(): THREE.BufferGeometry {
  const ys = rowsAt(Z0);
  const ring: THREE.Vector3[] = [];
  for (const y of ys) ring.push(new THREE.Vector3(halfAt(Z0, y), y, Z0));
  for (let k = ys.length - 1; k >= 0; k--) ring.push(new THREE.Vector3(-halfAt(Z0, ys[k]), ys[k], Z0));
  const pos: number[] = [];
  // полосами по высоте: ряд к ряду (правый и левый края) — чтобы цвета легли полосами
  for (let j = 0; j < ys.length - 1; j++) {
    const y0 = ys[j];
    const y1 = ys[j + 1];
    const x0 = halfAt(Z0, y0);
    const x1 = halfAt(Z0, y1);
    pos.push(-x0, y0, Z0, -x1, y1, Z0, x0, y0, Z0);
    pos.push(x0, y0, Z0, -x1, y1, Z0, x1, y1, Z0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, (p, _n, o) => o.setHex(p.y > 1.62 && p.y < railAt(Z0) - 0.3 ? C.wood2 : hullColor(p.y, railAt(Z0))), true);
}

/** Фальшборт изнутри и планширь сверху */
function bulwarkGeo(): THREE.BufferGeometry {
  const pos: number[] = [];
  const cap: number[] = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < STATIONS.length - 1; i++) {
      const z0 = STATIONS[i];
      const z1 = STATIONS[i + 1];
      const r0 = railAt(z0);
      const r1 = railAt(z1);
      // по ступеньке юта низ стенки берём от палубы своего участка
      const d0 = deckAt(z0 + 0.01);
      const d1 = deckAt(z1 - 0.01);
      const in0 = Math.max(0.02, halfAt(z0, r0) - WALL);
      const in1 = Math.max(0.02, halfAt(z1, r1) - WALL);
      const ind0 = Math.max(0.02, halfAt(z0, d0) - WALL);
      const ind1 = Math.max(0.02, halfAt(z1, d1) - WALL);
      const A = [side * ind0, d0, z0];
      const B = [side * in0, r0, z0];
      const Cc = [side * ind1, d1, z1];
      const D = [side * in1, r1, z1];
      // внутренняя стенка смотрит внутрь (к оси), планширь — вверх
      if (side > 0) pos.push(...A, ...Cc, ...B, ...B, ...Cc, ...D);
      else pos.push(...A, ...B, ...Cc, ...B, ...D, ...Cc);
      const O0 = [side * halfAt(z0, r0), r0, z0];
      const O1 = [side * halfAt(z1, r1), r1, z1];
      if (side > 0) cap.push(...B, ...D, ...O0, ...O0, ...D, ...O1);
      else cap.push(...B, ...O0, ...D, ...O0, ...O1, ...D);
    }
  }
  const wall = new THREE.BufferGeometry();
  wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wall.computeVertexNormals();
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3));
  top.computeVertexNormals();
  return mergeColored([colored(wall, C.inner), colored(top, C.cream)]);
}

/** Палуба и ют: доски вдоль корабля (полосы поперёк), между внутренними стенками фальшборта */
function decksGeo(): THREE.BufferGeometry {
  const pos: number[] = [];
  const cols = 6;
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const z0 = STATIONS[i];
    const z1 = STATIONS[i + 1];
    const y = deckAt((z0 + z1) / 2);
    const w0 = Math.max(0, halfAt(z0, y) - WALL);
    const w1 = Math.max(0, halfAt(z1, y) - WALL);
    for (let k = 0; k < cols; k++) {
      const u0 = -1 + (2 * k) / cols;
      const u1 = -1 + (2 * (k + 1)) / cols;
      const a = [u0 * w0, y, z0];
      const b = [u1 * w0, y, z0];
      const c = [u0 * w1, y, z1];
      const d = [u1 * w1, y, z1];
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  }
  // стенка юта (переборка) поперёк корабля: от палубы до юта
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const planks = paint(g, (p, _n, o) => {
    const w = Math.max(0.1, halfAt(p.z, p.y) - WALL);
    o.setHex(Math.floor(((p.x / w + 1) * cols) / 2) % 2 ? C.deck : C.deck2);
  }, true);
  const wb = halfAt(POOP_Z, POOP_Y) - WALL;
  const bulk = paint(new THREE.BoxGeometry(wb * 2, POOP_Y - DECK_Y, 0.12).translate(0, (POOP_Y + DECK_Y) / 2, POOP_Z), (p, _n, o) => o.setHex(p.y > POOP_Y - 0.12 ? C.gold : C.cream), true);
  // дверь в каюту и два окошка (окна светятся — в огнях)
  const door = colored(new THREE.BoxGeometry(0.72, 0.92, 0.06).translate(0, DECK_Y + 0.46, POOP_Z + 0.07), 0x7a3a22);
  const knob = colored(new THREE.SphereGeometry(0.05, 5, 3).translate(0.24, DECK_Y + 0.45, POOP_Z + 0.11), C.gold);
  return mergeColored([planks, bulk, door, knob]);
}

/** Точка на обшивке борта side на (z, y) с отступом off по нормали и угол нормали в плане (0 — ровно вбок) */
function onHull(side: number, z: number, y: number, off: number): { x: number; y: number; z: number; yaw: number } {
  const dz = 0.05;
  const slope = (halfAt(z + dz, y) - halfAt(z - dz, y)) / (2 * dz);
  // нормаль в плане: (side, -slope) нормированная; угол от оси X
  const yaw = Math.atan2(-slope, 1);
  const nx = Math.cos(yaw);
  const nz = Math.sin(yaw);
  return { x: side * (halfAt(z, y) + off * nx), y, z: z + off * nz, yaw: side * yaw };
}

/** Кусок геометрии (лицом по +X) поставить на борт: +X → нормаль обшивки */
function onSide(g: THREE.BufferGeometry, side: number, z: number, y: number, off: number): THREE.BufferGeometry {
  const h = onHull(side, z, y, off);
  if (side < 0) g.rotateY(Math.PI);
  return g.rotateY(-h.yaw).translate(h.x, h.y, h.z);
}

/** Пушечные порты: тёмный проём, золотая рамка, откинутая вверх крышка (снаружи красная, изнутри жёлтая) */
function portsGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const s = 0.46;
  for (const side of [1, -1]) {
    for (const z of GUN_Z) {
      parts.push(onSide(colored(new THREE.BoxGeometry(0.04, s, s), C.dark), side, z, GUN_Y, 0.0));
      const frame = mergeColored([
        colored(new THREE.BoxGeometry(0.05, 0.06, s + 0.12).translate(0, s / 2 + 0.03, 0), C.gold),
        colored(new THREE.BoxGeometry(0.05, 0.06, s + 0.12).translate(0, -s / 2 - 0.03, 0), C.gold),
        colored(new THREE.BoxGeometry(0.05, s, 0.06).translate(0, 0, s / 2 + 0.03), C.gold),
        colored(new THREE.BoxGeometry(0.05, s, 0.06).translate(0, 0, -s / 2 - 0.03), C.gold),
      ]);
      parts.push(onSide(frame, side, z, GUN_Y, 0.02));
      // крышка на петлях сверху, откинута на 70°
      const lid = paint(new THREE.BoxGeometry(0.06, s + 0.06, s + 0.06).translate(0.03, -(s + 0.06) / 2, 0), (p, _n, o) => o.setHex(p.x > 0.045 ? 0xf2c14a : 0xc8302c), true);
      lid.rotateZ(1.22).translate(0, s / 2 + 0.06, 0);
      parts.push(onSide(lid, side, z, GUN_Y, 0.04));
    }
  }
  return mergeColored(parts);
}

/** Труба-верёвка между двумя точками (3 грани), по желанию — несколько точек */
function rope(pts: ReadonlyArray<readonly [number, number, number]>, r = 0.035, hex = C.rope): THREE.BufferGeometry {
  return paint(tube(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), () => r, 3), (_p, _n, o) => o.setHex(hex));
}

/** Мачта-ствол с сужением */
function spar(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r0: number, r1: number, hex = C.mast, seg = 7): THREE.BufferGeometry {
  const a = new THREE.Vector3(x0, y0, z0);
  const b = new THREE.Vector3(x1, y1, z1);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q).translate(x0, y0, z0);
  return colored(g, hex);
}

/** Прямые паруса: где висят (рей сверху), размеры, подбираются ли на якоре, область атласа */
interface SailDef {
  z: number;
  top: number;
  height: number;
  wTop: number;
  wBot: number;
  furl: boolean;
  /** Область текстуры: u0, v0, u1, v1 */
  uv: readonly [number, number, number, number];
}

const SAILS: readonly SailDef[] = [
  // грот, грот-марсель (со знаком: стоит и на якоре); фок, фор-марсель
  { z: MAIN_Z, top: 7.4, height: 4.2, wTop: 8.2, wBot: 8.8, furl: true, uv: [0, 0, 0.5, 0.5] },
  { z: MAIN_Z, top: 11.6, height: 3.9, wTop: 6.4, wBot: 7.6, furl: false, uv: [0, 0.5, 0.5, 1] },
  { z: FORE_Z, top: 6.9, height: 3.9, wTop: 7.4, wBot: 8.0, furl: true, uv: [0, 0, 0.5, 0.5] },
  { z: FORE_Z, top: 10.6, height: 3.4, wTop: 5.4, wBot: 6.8, furl: false, uv: [0.5, 0.5, 1, 1] },
];
const SAIL_NX = 8;
const SAIL_NY = 6;
/** Кливер: фал, галс на бушприте, шкот */
const JIB = { head: [0, 10.0, FORE_Z + 0.35], tack: [0, 3.75, 10.15], clew: [0, 3.0, 6.0] } as const;
const JIB_N = 5;

/** Атлас парусов и флагов на холсте: грот со знаком, паруса с заплатами, пиратский и белый флаги */
function sailTexture(): THREE.CanvasTexture {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d')!;
  const cloth = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = '#f6ead2';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(160,120,80,0.35)';
    g.lineWidth = 2;
    for (let i = 1; i < 7; i++) {
      g.beginPath();
      g.moveTo(x + (i * w) / 7, y);
      g.lineTo(x + (i * w) / 7, y + h);
      g.stroke();
    }
    g.strokeStyle = 'rgba(150,105,65,0.55)';
    g.lineWidth = 7;
    g.strokeRect(x + 4, y + 4, w - 8, h - 8);
  };
  const patch = (cx: number, cy: number, w: number, h: number, rot: number, fill: string) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.fillStyle = fill;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.setLineDash([5, 4]);
    g.strokeStyle = '#fff7e6';
    g.lineWidth = 2;
    g.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
    g.restore();
    g.setLineDash([]);
  };
  /** Желейка в треуголке: центр, размер, цвет тела и черт лица */
  const jelly = (cx: number, cy: number, s: number, body: string, line: string, hat: string, trim: string) => {
    g.fillStyle = body;
    g.strokeStyle = line;
    g.lineWidth = s * 0.06;
    g.beginPath();
    g.ellipse(cx, cy + s * 0.1, s * 0.42, s * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // глаза и улыбка
    for (const dx of [-0.16, 0.16]) {
      g.fillStyle = line === '#1d1b22' ? '#1d1b22' : '#ffffff';
      g.beginPath();
      g.ellipse(cx + dx * s, cy + s * 0.02, s * 0.1, s * 0.125, 0, 0, Math.PI * 2);
      g.fill();
      if (line !== '#1d1b22') {
        g.fillStyle = '#1d1b22';
        g.beginPath();
        g.ellipse(cx + dx * s, cy + s * 0.04, s * 0.055, s * 0.07, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = line === '#1d1b22' ? '#1d1b22' : '#6a1f24';
    g.beginPath();
    g.moveTo(cx - s * 0.22, cy + s * 0.2);
    g.quadraticCurveTo(cx, cy + s * 0.52, cx + s * 0.22, cy + s * 0.2);
    g.quadraticCurveTo(cx, cy + s * 0.3, cx - s * 0.22, cy + s * 0.2);
    g.fill();
    // треуголка: поля с загнутыми углами и купол
    g.fillStyle = hat;
    g.strokeStyle = trim;
    g.lineWidth = s * 0.05;
    g.beginPath();
    g.moveTo(cx - s * 0.62, cy - s * 0.3);
    g.quadraticCurveTo(cx - s * 0.3, cy - s * 0.38, cx - s * 0.22, cy - s * 0.62);
    g.quadraticCurveTo(cx, cy - s * 0.95, cx + s * 0.22, cy - s * 0.62);
    g.quadraticCurveTo(cx + s * 0.3, cy - s * 0.38, cx + s * 0.62, cy - s * 0.3);
    g.quadraticCurveTo(cx, cy - s * 0.18, cx - s * 0.62, cy - s * 0.3);
    g.fill();
    g.stroke();
  };
  // грот: знак на тёмно-красном круге
  cloth(0, 0, 256, 256);
  g.fillStyle = '#9b2226';
  g.beginPath();
  g.arc(128, 132, 92, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#e8b84a';
  g.lineWidth = 8;
  g.stroke();
  jelly(128, 146, 120, '#ffc93a', '#b8761a', '#1f1d26', '#e8b84a');
  // фок: заплаты
  cloth(0, 256, 256, 256);
  patch(70, 330, 56, 44, 0.12, '#2fa59a');
  patch(180, 430, 64, 50, -0.1, '#f08a2a');
  patch(190, 318, 34, 30, 0.3, '#d8433a');
  // марсели: заплаты поменьше
  cloth(256, 0, 256, 256);
  patch(330, 80, 44, 36, -0.15, '#d8433a');
  patch(440, 180, 50, 40, 0.1, '#3f7fd0');
  patch(400, 60, 26, 22, 0.4, '#f2c14a');
  // флаги: пиратский (чёрный, белая желейка, скрещённые сабли) и белый
  g.fillStyle = '#1d1b22';
  g.fillRect(256, 256, 256, 128);
  g.strokeStyle = '#f7f4ec';
  g.lineCap = 'round';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(330, 370);
  g.lineTo(438, 290);
  g.moveTo(438, 370);
  g.lineTo(330, 290);
  g.stroke();
  jelly(384, 330, 66, '#f7f4ec', '#1d1b22', '#f7f4ec', '#1d1b22');
  g.fillStyle = '#f7f4ee';
  g.fillRect(256, 384, 256, 128);
  g.strokeStyle = '#d8d2c6';
  g.lineWidth = 6;
  g.strokeRect(259, 387, 250, 122);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Флаг: лента FLAG_N сегментов (две строки вершин), полотнище уходит к корме (−Z) */
const FLAG_N = 12;
const FLAG_W = 2.5;
const FLAG_H = 1.45;
const FLAG_Y = MAIN_TOP + 0.05;

/** Смеющаяся желейка на носу (носовая фигура): тело, глаза-дуги, открытый рот, ручки назад, треуголка */
function figureheadGeo(): THREE.BufferGeometry {
  const prof: Array<[number, number]> = [[0.001, 0], [0.26, 0.02], [0.34, 0.2], [0.36, 0.45], [0.32, 0.7], [0.22, 0.9], [0.001, 1.0]];
  const body = paint(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10), (p, _n, o) => {
    o.setHex(0xf6b52e);
    if (p.y > 0.6 && p.x < -0.05 && p.z > 0.1) o.setHex(0xffd977);
  });
  const parts: THREE.BufferGeometry[] = [body];
  for (const s of [1, -1]) {
    // глаза-дуги «^ ^» (смеётся) и ручки назад-в стороны
    parts.push(colored(new THREE.TorusGeometry(0.06, 0.014, 3, 6, Math.PI).translate(s * 0.11, 0.68, 0.3), 0x2a1a14));
    parts.push(colored(new THREE.CapsuleGeometry(0.06, 0.22, 2, 5).rotateZ(s * 1.9).rotateY(s * 0.5).translate(s * 0.4, 0.5, -0.05), 0xf0a826));
  }
  parts.push(colored(new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.13, 0.11, 0.05).translate(0, 0.54, 0.32), 0x6a1f24));
  parts.push(colored(new THREE.ConeGeometry(0.36, 0.2, 3).translate(0, 1.0, -0.02), 0x1f1d26));
  return mergeColored(parts);
}

/** Якорь: веретено, шток, рога с лапами, кольцо; подвешен за кольцо (начало координат) */
function anchorGeo(): THREE.BufferGeometry {
  const iron = 0x3a4048;
  const parts = [
    colored(new THREE.CylinderGeometry(0.07, 0.08, 1.5, 6).translate(0, -0.85, 0), iron),
    colored(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5).rotateZ(Math.PI / 2).translate(0, -0.3, 0), 0x6b4a2a),
    colored(new THREE.TorusGeometry(0.12, 0.035, 4, 8).translate(0, -0.03, 0), iron),
    paint(tube(curve([[-0.6, -1.25, 0], [-0.45, -1.62, 0], [0, -1.7, 0], [0.45, -1.62, 0], [0.6, -1.25, 0]], 7), () => 0.06, 5), (_p, _n, o) => o.setHex(iron)),
  ];
  for (const s of [1, -1]) parts.push(colored(new THREE.ConeGeometry(0.13, 0.26, 4).rotateZ(-s * 0.5).translate(s * 0.63, -1.18, 0), iron));
  return mergeColored(parts);
}

/** Штурвал: колесо со спицами и рукоятками на стойке; смотрит по +Z */
function wheelGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    colored(new THREE.BoxGeometry(0.18, 1.0, 0.18).translate(0, 0.5, -0.1), 0x8a5a32),
    colored(new THREE.TorusGeometry(0.45, 0.04, 4, 14).translate(0, 1.05, 0.02), 0x9a6a3a),
    colored(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 6).rotateX(Math.PI / 2).translate(0, 1.05, 0.02), C.gold),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(colored(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 4).rotateZ(a).translate(Math.sin(-a) * 0.27, 1.05 + Math.cos(a) * 0.27, 0.02), 0x9a6a3a));
    parts.push(colored(new THREE.CylinderGeometry(0.03, 0.025, 0.14, 4).rotateZ(a).translate(Math.sin(-a) * 0.56, 1.05 + Math.cos(a) * 0.56, 0.02), 0x7a4a26));
  }
  return mergeColored(parts);
}

/** Фонарь: золотой каркас и крыша (стекло — в огнях) */
function lanternFrame(x: number, y: number, z: number, s: number): THREE.BufferGeometry {
  return mergeColored([
    colored(new THREE.CylinderGeometry(0.05 * s, 0.24 * s, 0.22 * s, 6).translate(x, y + 0.36 * s, z), 0x2a2a2e),
    colored(new THREE.CylinderGeometry(0.2 * s, 0.17 * s, 0.07 * s, 6).translate(x, y - 0.26 * s, z), C.gold),
    colored(new THREE.TorusGeometry(0.08 * s, 0.02 * s, 3, 6).translate(x, y + 0.53 * s, z), C.gold),
  ]);
}
function lanternGlass(x: number, y: number, z: number, s: number): THREE.BufferGeometry {
  return colored(new THREE.CylinderGeometry(0.19 * s, 0.16 * s, 0.48 * s, 6).translate(x, y, z), 0xffc65a);
}

/** Неподвижное: корпус, палубы, порты, мачты, реи, такелаж, «воронье гнездо», бушприт, утварь, фигура, штурвал */
function staticGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [shellGeo(), transomGeo(), bulwarkGeo(), decksGeo(), portsGeo()];
  // форштевень: золотая полоса по носу от киля до планширя
  const stem: Array<[number, number, number]> = [];
  for (let i = 0; i <= 6; i++) {
    const z = 4.5 + (Z1 - 4.5) * (i / 6);
    stem.push([0, keelAt(z) - 0.02, z + 0.04]);
  }
  stem.push([0, railAt(Z1) + 0.1, Z1 + 0.12]);
  parts.push(rope(stem, 0.09, C.gold));
  // кормовая надстройка: окна по транцу и бокам — рамки (стекло в огнях), золотые завитки, кант
  for (const x of [-1.5, -0.5, 0.5, 1.5]) {
    parts.push(colored(new THREE.BoxGeometry(0.62, 0.72, 0.06).translate(x, 2.9, Z0 - 0.03), C.cream));
  }
  parts.push(colored(new THREE.BoxGeometry(halfAt(Z0, 3.4) * 2 + 0.1, 0.16, 0.12).translate(0, 3.45, Z0 - 0.04), C.gold));
  parts.push(colored(new THREE.BoxGeometry(halfAt(Z0, 2.2) * 2, 0.12, 0.1).translate(0, 2.35, Z0 - 0.04), C.gold));
  for (const side of [1, -1]) {
    for (const z of [-6.9, -5.5]) parts.push(onSide(colored(new THREE.BoxGeometry(0.05, 0.66, 0.78), C.cream), side, z, 2.9, 0.01));
  }
  // руль
  parts.push(colored(new THREE.BoxGeometry(0.16, 2.0, 0.7).translate(0, -0.1, Z0 - 0.3), 0x5a3a24));
  // мачты, стеньги, марс («воронье гнездо»)
  parts.push(spar(0, DECK_Y, MAIN_Z, 0, MAIN_TOP + 0.4, MAIN_Z, 0.24, 0.12, C.mast, 8));
  parts.push(spar(0, DECK_Y, FORE_Z, 0, FORE_TOP + 0.3, FORE_Z, 0.22, 0.11, C.mast, 8));
  parts.push(colored(new THREE.SphereGeometry(0.17, 6, 4).translate(0, MAIN_TOP + 0.45, MAIN_Z), C.gold));
  parts.push(colored(new THREE.SphereGeometry(0.15, 6, 4).translate(0, FORE_TOP + 0.35, FORE_Z), C.gold));
  const nest = paint(new THREE.CylinderGeometry(0.98, 0.86, 0.95, 12, 2, true).translate(0, NEST_Y + 0.42, MAIN_Z), (p, _n, o) => o.setHex(p.y > NEST_Y + 0.7 ? C.gold : Math.floor(Math.atan2(p.x, p.z - MAIN_Z) * 3) % 2 ? 0x9a6a3a : 0x8a5a30), true);
  parts.push(nest);
  // марс изнутри (двусторонний цилиндр не делаем — второй слой чуть меньше, обход внутрь)
  const inner = new THREE.CylinderGeometry(0.93, 0.82, 0.9, 12, 1, true).translate(0, NEST_Y + 0.42, MAIN_Z);
  const idx = inner.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const t = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, t);
  }
  inner.computeVertexNormals();
  parts.push(colored(inner, 0x7a4a26));
  parts.push(colored(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 12).translate(0, NEST_Y - 0.02, MAIN_Z), 0x7a4a26));
  // реи

  // бушприт
  parts.push(spar(0, 2.55, 6.9, 0, JIB.tack[1] + 0.05, 10.6, 0.17, 0.09, C.mast, 7));
  // такелаж: штаги, ванты с выбленками, бакштаги
  const R = C.rope;
  parts.push(rope([[0, MAIN_TOP, MAIN_Z], [0, FORE_TOP - 0.6, FORE_Z]]));
  parts.push(rope([[0, FORE_TOP, FORE_Z], [0, JIB.tack[1] + 0.1, 10.45]]));
  parts.push(rope([[0, JIB.head[1] + 0.2, FORE_Z], [0, 3.6, 9.4]]));
  parts.push(rope([[0, 9.0, MAIN_Z], [0, 7.4, FORE_Z]]));
  for (const side of [1, -1]) {
    for (const [mz, top, n] of [[MAIN_Z, NEST_Y - 0.1, 3], [FORE_Z, FORE_TOP - 1.2, 3]] as const) {
      const feet: Array<[number, number, number]> = [];
      for (let k = 0; k < n; k++) {
        const z = mz - 0.75 + k * 0.6;
        const y = railAt(z) - 0.05;
        feet.push([side * (halfAt(z, y) + 0.05), y, z]);
      }
      const head: [number, number, number] = [side * 0.25, top, mz];
      for (const f of feet) parts.push(rope([f, head], 0.03, R));
      // выбленки: поперечные ступеньки между вантами
      for (let r = 1; r <= 7; r++) {
        const u = r / 8;
        const a = feet[0];
        const b = feet[n - 1];
        const pa: [number, number, number] = [a[0] + (head[0] - a[0]) * u, a[1] + (head[1] - a[1]) * u, a[2] + (head[2] - a[2]) * u];
        const pb: [number, number, number] = [b[0] + (head[0] - b[0]) * u, b[1] + (head[1] - b[1]) * u, b[2] + (head[2] - b[2]) * u];
        parts.push(rope([pa, pb], 0.018, R));
      }
    }
    // бакштаги к корме
    parts.push(rope([[side * 0.15, MAIN_TOP - 0.4, MAIN_Z], [side * (halfAt(-5.2, 3.5) + 0.04), 3.55, -5.2]], 0.028));
  }
  // шлюпбалки: изогнутые кронштейны над бортами, тали
  for (const side of [1, -1]) {
    for (const dz of [-1.05, 1.05]) {
      const z = DAVIT_Z + dz;
      const y = railAt(z);
      const x0 = side * (halfAt(z, y) - 0.05);
      const pts = curve([[x0, y - 0.4, z], [x0 + side * 0.15, y + 0.6, z], [x0 + side * 0.65, y + 1.15, z], [x0 + side * 1.1, y + 1.05, z]], 7);
      parts.push(paint(tube(pts, () => 0.07, 5), (_p, _n, o) => o.setHex(0x3a3d44)));
      parts.push(rope([[x0 + side * 1.1, y + 1.0, z], [x0 + side * 1.1, y + 0.2, z]], 0.02));
    }
  }
  // кат-балки на носу (якорь висит на левой)
  for (const side of [1, -1]) parts.push(colored(new THREE.BoxGeometry(1.2, 0.16, 0.18).translate(side * (halfAt(6.4, 2.5) + 0.35), 2.55, 6.4), 0x7a4a26));
  // утварь на палубе: бочки, ящики, бухта каната; штурвал на юте
  const barrel = barrelGeo(true);
  const crate = crateGeo(true);
  for (const [g, x, z, ry] of [[barrel, 0.75, 1.35, 0], [barrel, -0.65, 1.8, 0.4], [barrel, 0.1, 2.15, 1], [crate, -0.3, -2.3, 0.2], [crate, 0.55, -2.15, -0.15]] as const) {
    parts.push(g.clone().rotateY(ry).translate(x, DECK_Y, z));
  }
  parts.push(colored(new THREE.TorusGeometry(0.28, 0.09, 4, 10).rotateX(Math.PI / 2).translate(-0.9, DECK_Y + 0.09, 5.4), 0xc8a46a));
  parts.push(wheelGeo().translate(0, POOP_Y, -4.6));
  // фонари: большой кормовой и два на углах юта (каркасы)
  parts.push(lanternFrame(0, 4.25, Z0 - 0.35, 1.5));
  parts.push(colored(new THREE.BoxGeometry(0.1, 0.1, 0.5).translate(0, 4.05, Z0 - 0.15), 0x2a2a2e));
  for (const x of [-1.9, 1.9]) parts.push(lanternFrame(x, 4.0, -7.0, 1));
  // носовая фигура: смеющаяся желейка под бушпритом
  parts.push(figureheadGeo().rotateX(1.05).translate(0, 1.55, Z1 - 0.12));
  for (const g of parts) g.deleteAttribute('uv');
  return merge(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/**
 * Реи с золотыми ноками и брасы (от ноков к борту позади мачты) — в покое (поперёк); разворот реев — поворотом вершин
 * вокруг своей мачты (у брасов вращается только конец у рея). Для каждой вершины: ось мачты (z) и вращается ли.
 */
function rigGeo(): { geo: THREE.BufferGeometry; mastZ: Float32Array; move: Float32Array } {
  const pieces: Array<{ g: THREE.BufferGeometry; mz: number; move: (y: number) => boolean }> = [];
  for (const s of SAILS) {
    const y = s.top + 0.1;
    const w = s.wTop / 2 + 0.35;
    pieces.push({ g: spar(-w, y, s.z + 0.28, w, y, s.z + 0.28, 0.13, 0.13, C.mast, 6), mz: s.z, move: () => true });
    for (const x of [-w, w]) pieces.push({ g: colored(new THREE.SphereGeometry(0.15, 5, 3).translate(x, y, s.z + 0.28), C.gold), mz: s.z, move: () => true });
    for (const side of [1, -1]) {
      const z = s.z - 2.2;
      const ry = railAt(z);
      pieces.push({ g: rope([[side * (w - 0.05), y, s.z + 0.28], [side * (halfAt(z, ry) - 0.05), ry, z]], 0.02), mz: s.z, move: (vy) => vy > ry + 0.3 });
    }
  }
  const geo = mergeColored(pieces.map((p) => p.g));
  const n = geo.getAttribute('position').count;
  const mastZ = new Float32Array(n);
  const move = new Float32Array(n);
  let k = 0;
  for (const p of pieces) {
    const pos = (p.g.index ? p.g.toNonIndexed() : p.g).getAttribute('position');
    for (let i = 0; i < pos.count; i++, k++) {
      mastZ[k] = p.mz;
      move[k] = p.move(pos.getY(i)) ? 1 : 0;
    }
  }
  return { geo, mastZ, move };
}

/** Огни: окна кормы, юта и каюты, стёкла фонарей (светятся сами) */
function glowGeo(): THREE.BufferGeometry {
  const win = 0xffc867;
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-1.5, -0.5, 0.5, 1.5]) parts.push(colored(new THREE.PlaneGeometry(0.46, 0.56).rotateY(Math.PI).translate(x, 2.9, Z0 - 0.07), win));
  for (const side of [1, -1]) {
    for (const z of [-6.9, -5.5]) parts.push(onSide(colored(new THREE.PlaneGeometry(0.62, 0.5).rotateY(Math.PI / 2), win), side, z, 2.9, 0.045));
  }
  for (const x of [-0.75, 0.75]) parts.push(colored(new THREE.PlaneGeometry(0.4, 0.34).translate(x, DECK_Y + 0.7, POOP_Z + 0.075), win));
  parts.push(lanternGlass(0, 4.25, Z0 - 0.35, 1.5));
  for (const x of [-1.9, 1.9]) parts.push(lanternGlass(x, 4.0, -7.0, 1));
  return merge(parts.map((g) => {
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  }));
}

/** Ствол пушки вдоль +X (дуло на +X), начало — у цапф внутри порта */
function gunGeo(): THREE.BufferGeometry {
  return mergeColored([
    colored(new THREE.CylinderGeometry(0.15, 0.2, 1.5, 8, 1, true).rotateZ(-Math.PI / 2).translate(0.35, 0, 0), C.iron),
    colored(new THREE.TorusGeometry(0.16, 0.045, 4, 8).rotateY(Math.PI / 2).translate(1.08, 0, 0), C.gold),
    colored(new THREE.CircleGeometry(0.13, 8).rotateY(Math.PI / 2).translate(1.1, 0, 0), 0x0d0d10),
    colored(new THREE.TorusGeometry(0.2, 0.035, 4, 8).rotateY(Math.PI / 2).translate(0.0, 0, 0), C.gold),
  ]);
}

/** Повреждения: ступень 1 — заплатки и щербины; ступень 2 — пробоины со щепками */
function damageGeo(level: 1 | 2): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (level === 1) {
    for (const [side, z, y, r] of [[1, 2.2, 0.75, 0.2], [-1, -1.9, 1.85, -0.25], [1, -5.2, 2.2, 0.1], [-1, 4.4, 0.6, 0.35]] as const) {
      const p = mergeColored([
        colored(new THREE.BoxGeometry(0.04, 0.2, 0.7).translate(0, 0.08, 0), 0xe0bf86),
        colored(new THREE.BoxGeometry(0.04, 0.2, 0.62).translate(0.005, -0.14, 0.03), 0xd4ae72),
        colored(new THREE.BoxGeometry(0.05, 0.05, 0.05).translate(0.02, 0.08, -0.28), 0x3a3a3a),
        colored(new THREE.BoxGeometry(0.05, 0.05, 0.05).translate(0.02, -0.14, 0.3), 0x3a3a3a),
      ]).rotateX(r);
      parts.push(onSide(p, side, z, y, 0.03));
    }
    for (const [side, z, y, s] of [[1, -2.6, 1.95, 0.22], [-1, 1.8, 1.0, 0.18], [1, 5.5, 1.5, 0.16]] as const) {
      parts.push(onSide(colored(new THREE.SphereGeometry(1, 7, 4).scale(0.05, s, s * 1.3), 0x3a2219), side, z, y, 0.01));
    }
  } else {
    for (const [side, z, y, s] of [[1, 2.0, 1.75, 0.38], [-1, -1.2, 1.7, 0.42], [1, -5.6, 2.9, 0.33], [-1, 5.2, 1.85, 0.3]] as const) {
      // рваная тёмная дыра: неровный многоугольник и щепки вокруг
      const pos: number[] = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        const r0 = s * (0.75 + 0.35 * Math.sin(i * 2.7 + z));
        const r1 = s * (0.75 + 0.35 * Math.sin((i + 1) * 2.7 + z));
        pos.push(0, 0, 0, 0, Math.sin(a1) * r1, Math.cos(a1) * r1, 0, Math.sin(a0) * r0, Math.cos(a0) * r0);
      }
      const hole = new THREE.BufferGeometry();
      hole.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      hole.computeVertexNormals();
      const bits: THREE.BufferGeometry[] = [colored(hole, 0x140c0c)];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + z;
        const len = 0.22 + 0.1 * Math.sin(i * 3.1);
        bits.push(colored(new THREE.BoxGeometry(0.05, len, 0.06).translate(0, len / 2, 0).rotateZ(-0.6).rotateX(a).translate(0, Math.sin(a) * s * 0.8, Math.cos(a) * s * 0.8), 0xe3c08a));
      }
      const g = mergeColored(bits);
      parts.push(onSide(g, side, z, y, 0.03));
    }
    // сломанные перила юта: обломки стоек и упавший поручень
    const w = halfAt(POOP_Z, POOP_Y) - WALL;
    for (const x of [-w + 0.2, -0.9, 0.4, w - 0.3]) parts.push(colored(new THREE.BoxGeometry(0.08, 0.35 + 0.2 * Math.sin(x * 5), 0.08).translate(x, POOP_Y + 0.17, POOP_Z + 0.06), 0xe3c08a));
    parts.push(colored(new THREE.BoxGeometry(2.2, 0.09, 0.1).rotateZ(0.32).translate(-0.6, POOP_Y + 0.3, POOP_Z + 0.12), C.cream));
    parts.push(colored(new THREE.BoxGeometry(1.4, 0.09, 0.1).rotateZ(-0.2).rotateY(0.4).translate(1.3, DECK_Y + 0.08, POOP_Z + 0.6), C.cream));
  }
  return merge(parts.map((g) => {
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  }));
}

/** Перила юта (целые): балясины и поручень поперёк корабля по краю юта */
function poopRailGeo(): THREE.BufferGeometry {
  const w = halfAt(POOP_Z, POOP_Y) - WALL;
  const parts: THREE.BufferGeometry[] = [colored(new THREE.BoxGeometry(w * 2, 0.1, 0.14).translate(0, POOP_Y + 0.82, POOP_Z + 0.06), C.cream)];
  for (let i = 0; i <= 10; i++) {
    const x = -w + 0.1 + ((w * 2 - 0.2) * i) / 10;
    parts.push(colored(new THREE.CylinderGeometry(0.045, 0.06, 0.78, 5).translate(x, POOP_Y + 0.39, POOP_Z + 0.06), 0xf6e8c8));
  }
  return mergeColored(parts);
}

/** Пена у носа на ходу: «усы» в обе стороны и след за кормой (плоские, на воде) */
function foamGeo(): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const s of [1, -1]) {
    const pts = [[0, Z1 + 0.15], [s * 0.6, 6.9], [s * 1.5, 5.2], [s * 2.4, 2.8], [s * 3.0, 0.2]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const w0 = 0.05 + 0.12 * i;
      const w1 = 0.05 + 0.12 * (i + 1);
      const A = [x0, 0.04, z0];
      const B = [x0 + s * w0, 0.04, z0 - w0];
      const Cc = [x1, 0.04, z1];
      const D = [x1 + s * w1, 0.04, z1 - w1];
      if (s > 0) pos.push(...A, ...B, ...Cc, ...B, ...D, ...Cc);
      else pos.push(...A, ...Cc, ...B, ...B, ...Cc, ...D);
    }
  }
  // след за кормой
  for (let i = 0; i < 4; i++) {
    const z0 = Z0 - 0.2 - i * 1.6;
    const z1 = z0 - 1.6;
    const w0 = 1.6 + i * 0.35;
    const w1 = 1.6 + (i + 1) * 0.35;
    pos.push(-w0, 0.03, z0, w0, 0.03, z0, -w1, 0.03, z1, w0, 0.03, z0, w1, 0.03, z1, -w1, 0.03, z1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ сборка

const _loc = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function buildShip(): ShipModel {
  const group = new THREE.Group();
  group.name = 'pirate-ship';
  const hull = new THREE.Group();
  hull.name = 'pirate-ship-hull';
  group.add(hull);

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0 });
  const glowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xffb050, emissiveIntensity: 1.1 });
  const tex = sailTexture();
  // ткань чуть светится своим цветом (просвечивает на солнце) — паруса не темнеют в тени и с изнанки
  const clothMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28 });
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xeef8fb, roughness: 0.9, transparent: true, opacity: 0.85, depthWrite: false });
  const geos: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string): THREE.Mesh => {
    geos.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    hull.add(mesh);
    return mesh;
  };
  add(staticGeo(), mat, 'ship:body');
  add(glowGeo(), glowMat, 'ship:lights').receiveShadow = false;
  const dmg1 = add(damageGeo(1), mat, 'ship:damage1');
  const dmg2 = add(damageGeo(2), mat, 'ship:damage2');
  const rail = add(poopRailGeo(), mat, 'ship:poop-rail');
  dmg1.visible = false;
  dmg2.visible = false;
  const foam = add(foamGeo(), foamMat, 'ship:foam');
  foam.receiveShadow = false;
  foam.visible = false;

  // ---- паруса: прямые сетками SAIL_NX × SAIL_NY, свёрнутые «колбаски» под реями, кливер — одной сеткой
  const sailVerts = SAILS.length * (SAIL_NX + 1) * (SAIL_NY + 1);
  const ROLL_N = 8;
  const rollVerts = SAILS.filter((s) => s.furl).length * (ROLL_N + 1) * 2;
  const jibVerts = (JIB_N + 1) * (JIB_N + 1);
  const nVerts = sailVerts + rollVerts + jibVerts;
  const sailPos = new Float32Array(nVerts * 3);
  const sailUv = new Float32Array(nVerts * 2);
  const sailIdx: number[] = [];
  let base = 0;
  for (const s of SAILS) {
    for (let j = 0; j <= SAIL_NY; j++) {
      for (let i = 0; i <= SAIL_NX; i++) {
        const k = base + j * (SAIL_NX + 1) + i;
        sailUv[k * 2] = s.uv[0] + (s.uv[2] - s.uv[0]) * (i / SAIL_NX);
        sailUv[k * 2 + 1] = s.uv[3] - (s.uv[3] - s.uv[1]) * (j / SAIL_NY);
      }
    }
    for (let j = 0; j < SAIL_NY; j++) {
      for (let i = 0; i < SAIL_NX; i++) {
        const a = base + j * (SAIL_NX + 1) + i;
        sailIdx.push(a, a + SAIL_NX + 1, a + 1, a + 1, a + SAIL_NX + 1, a + SAIL_NX + 2);
      }
    }
    base += (SAIL_NX + 1) * (SAIL_NY + 1);
  }
  for (const s of SAILS) {
    if (!s.furl) continue;
    for (let i = 0; i <= ROLL_N; i++) {
      for (let r = 0; r < 2; r++) {
        const k = base + i * 2 + r;
        sailUv[k * 2] = 0.52 + 0.02 * r;
        sailUv[k * 2 + 1] = 0.55 + 0.4 * (i / ROLL_N);
      }
    }
    for (let i = 0; i < ROLL_N; i++) {
      const a = base + i * 2;
      sailIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    base += (ROLL_N + 1) * 2;
  }
  for (let j = 0; j <= JIB_N; j++) {
    for (let i = 0; i <= JIB_N; i++) {
      const k = base + j * (JIB_N + 1) + i;
      sailUv[k * 2] = 0.52 + 0.44 * (i / JIB_N);
      sailUv[k * 2 + 1] = 0.54 + 0.42 * (1 - j / JIB_N);
    }
  }
  for (let j = 0; j < JIB_N; j++) {
    for (let i = 0; i < JIB_N; i++) {
      const a = base + j * (JIB_N + 1) + i;
      sailIdx.push(a, a + JIB_N + 1, a + 1, a + 1, a + JIB_N + 1, a + JIB_N + 2);
    }
  }
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.BufferAttribute(sailPos, 3).setUsage(THREE.DynamicDrawUsage));
  sailGeo.setAttribute('uv', new THREE.BufferAttribute(sailUv, 2));
  sailGeo.setIndex(sailIdx);
  add(sailGeo, clothMat, 'ship:sails');

  // ---- флаг: лента, кромка у мачты
  const flagPos = new Float32Array((FLAG_N + 1) * 2 * 3);
  const flagUv = new Float32Array((FLAG_N + 1) * 2 * 2);
  const flagIdx: number[] = [];
  for (let i = 0; i < FLAG_N; i++) {
    const a = i * 2;
    flagIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.BufferAttribute(flagPos, 3).setUsage(THREE.DynamicDrawUsage));
  flagGeo.setAttribute('uv', new THREE.BufferAttribute(flagUv, 2));
  flagGeo.setIndex(flagIdx);
  add(flagGeo, clothMat, 'ship:flag');
  let flagWhite: boolean | null = null;
  const setFlagUv = (white: boolean) => {
    const v0 = white ? 0 : 0.25;
    for (let i = 0; i <= FLAG_N; i++) {
      for (let r = 0; r < 2; r++) {
        const k = i * 2 + r;
        flagUv[k * 2] = 0.5 + 0.5 * (i / FLAG_N);
        flagUv[k * 2 + 1] = v0 + (r ? 0.25 : 0);
      }
    }
    flagGeo.getAttribute('uv').needsUpdate = true;
  };

  // ---- стволы: инстансы вдоль +X, по местам портов
  const gunGeom = gunGeo();
  geos.push(gunGeom);
  const guns = new THREE.InstancedMesh(gunGeom, mat, 8);
  guns.name = 'ship:guns';
  guns.frustumCulled = false;
  guns.receiveShadow = true;
  hull.add(guns);
  const gunAt: Array<{ x: number; y: number; z: number; yaw: number; side: number }> = [];
  const muzzles: Array<{ x: number; y: number; z: number; dx: number; dz: number }> = [];
  for (const side of [1, -1]) {
    for (const z of GUN_Z) {
      const h = onHull(side, z, GUN_Y, -0.25);
      gunAt.push({ x: h.x, y: GUN_Y, z: h.z, yaw: h.yaw, side });
      // направление наружу по нормали борта
      const dx = side * Math.cos(h.yaw * side);
      const dz = Math.sin(h.yaw * side);
      const len = Math.hypot(dx, dz);
      muzzles.push({ x: h.x + (dx / len) * 1.12, y: GUN_Y, z: h.z + (dz / len) * 1.12, dx: dx / len, dz: dz / len });
    }
  }

  // ---- якорь на кат-балке и канат в воду
  const anchorG = anchorGeo();
  const cable = rope([[0, 0, 0], [0, -1, 0]], 0.05);
  const anchorMesh = add(anchorG, mat, 'ship:anchor');
  geos.push(cable);
  const cableMesh = new THREE.Mesh(cable, mat);
  cableMesh.name = 'ship:cable';
  hull.add(cableMesh);
  const CAT = { x: halfAt(6.4, 2.5) + 0.85, y: 2.45, z: 6.4 };

  const deck = [
    { x: halfAt(2.6, DECK_Y) - 0.85, y: DECK_Y, z: 2.6, yaw: -Math.PI / 2 },
    { x: halfAt(0.4, DECK_Y) - 0.85, y: DECK_Y, z: 0.4, yaw: -Math.PI / 2 },
    { x: halfAt(-1.8, DECK_Y) - 0.85, y: DECK_Y, z: -1.8, yaw: -Math.PI / 2 },
    { x: -(halfAt(2.6, DECK_Y) - 0.85), y: DECK_Y, z: 2.6, yaw: Math.PI / 2 },
    { x: -(halfAt(0.4, DECK_Y) - 0.85), y: DECK_Y, z: 0.4, yaw: Math.PI / 2 },
    { x: -(halfAt(-1.8, DECK_Y) - 0.85), y: DECK_Y, z: -1.8, yaw: Math.PI / 2 },
    { x: 0.5, y: NEST_Y + 0.03, z: MAIN_Z, yaw: -Math.PI / 2 },
    { x: 0, y: POOP_Y, z: -5.7, yaw: Math.PI },
  ];
  const davits = [1, -1].map((side) => ({ x: side * (halfAt(DAVIT_Z, railAt(DAVIT_Z)) + 1.05), y: 3.05, z: DAVIT_Z }));
  const smokeSpots = [
    { x: halfAt(2.0, 1.75) + 0.2, y: 1.8, z: 2.0 },
    { x: -(halfAt(-1.2, 1.7) + 0.2), y: 1.75, z: -1.2 },
    { x: halfAt(-5.6, 2.9) + 0.2, y: 2.95, z: -5.6 },
    { x: -(halfAt(5.2, 1.85) + 0.2), y: 1.9, z: 5.2 },
  ];

  const sailsPos = sailGeo.getAttribute('position') as THREE.BufferAttribute;
  const flagAttr = flagGeo.getAttribute('position') as THREE.BufferAttribute;
  let furl = 1;
  // ---- реи и брасы: разворот — поворотом вершин вокруг мачт (пересчёт только когда угол меняется)
  const rig = rigGeo();
  add(rig.geo, mat, 'ship:yards');
  const rigPos = rig.geo.getAttribute('position') as THREE.BufferAttribute;
  const rigNor = rig.geo.getAttribute('normal') as THREE.BufferAttribute;
  const rigRest = Float32Array.from(rigPos.array as Float32Array);
  const rigRestN = Float32Array.from(rigNor.array as Float32Array);
  let braceNow = NaN;
  let brace = 1;
  function applyBrace(b: number): void {
    const c = Math.cos(b);
    const s = Math.sin(b);
    BC = c;
    BS = s;
    if (Math.abs(b - braceNow) < 0.002) return;
    braceNow = b;
    const P = rigPos.array as Float32Array;
    const N = rigNor.array as Float32Array;
    for (let i = 0; i < rig.move.length; i++) {
      const o = i * 3;
      if (rig.move[i] > 0) {
        const x = rigRest[o];
        const dz = rigRest[o + 2] - rig.mastZ[i];
        P[o] = x * c + dz * s;
        P[o + 1] = rigRest[o + 1];
        P[o + 2] = rig.mastZ[i] - x * s + dz * c;
        const nx = rigRestN[o];
        const nz = rigRestN[o + 2];
        N[o] = nx * c + nz * s;
        N[o + 1] = rigRestN[o + 1];
        N[o + 2] = -nx * s + nz * c;
      } else {
        P[o] = rigRest[o];
        P[o + 1] = rigRest[o + 1];
        P[o + 2] = rigRest[o + 2];
        N[o] = rigRestN[o];
        N[o + 1] = rigRestN[o + 1];
        N[o + 2] = rigRestN[o + 2];
      }
    }
    rigPos.needsUpdate = true;
    rigNor.needsUpdate = true;
    rig.geo.computeBoundingSphere();
  }
  let fill = 0;
  let alive = true;

  /** Паруса: надуты по ходу (+Z), колышутся; нижние на якоре подобраны к рею, на месте — «колбаски» */
  function updateSails(t: number, wind: number, furlK: number): void {
    let k = 0;
    for (let si = 0; si < SAILS.length; si++) {
      const s = SAILS[si];
      const hk = s.furl ? 1 - 0.94 * furlK : 1;
      const bulge = (0.25 + 0.95 * wind) * (s.furl ? 1 - furlK : 1) + 0.12;
      for (let j = 0; j <= SAIL_NY; j++) {
        const v = j / SAIL_NY;
        for (let i = 0; i <= SAIL_NX; i++) {
          const u = i / SAIL_NX;
          const w = s.wTop + (s.wBot - s.wTop) * v;
          const x = (u - 0.5) * w;
          const y = s.top - v * s.height * hk;
          const b = Math.pow(Math.sin(Math.PI * v), 0.8) * Math.pow(Math.sin(Math.PI * u), 0.7) * (0.55 + 0.45 * v);
          const flutter = 0.05 * Math.sin(u * 7 + t * (2.2 + wind * 2.5) + si) * v * (0.4 + wind);
          const [bx, bz] = braced(x, 0.42 + b * bulge * 1.15 + flutter, s.z);
          sailsPos.setXYZ(k++, bx, y, bz);
        }
      }
    }
    // свёрнутые: «колбаска» под реем, толщина — по свёрнутости
    for (const s of SAILS) {
      if (!s.furl) continue;
      const r = 0.24 * furlK;
      for (let i = 0; i <= ROLL_N; i++) {
        const x = (i / ROLL_N - 0.5) * s.wTop * 0.96;
        const sag = 0.12 * Math.sin((Math.PI * i) / ROLL_N) * furlK;
        const [ax, az] = braced(x, 0.42 - r, s.z);
        const [bx, bz] = braced(x, 0.42 + r * 0.8, s.z);
        sailsPos.setXYZ(k++, ax, s.top - 0.12 - sag + r * 0.9, az);
        sailsPos.setXYZ(k++, bx, s.top - 0.12 - sag - r, bz);
      }
    }
    // кливер: треугольник фал–галс–шкот, пузо в сторону (ветер с правого борта)
    for (let j = 0; j <= JIB_N; j++) {
      const v = j / JIB_N;
      for (let i = 0; i <= JIB_N; i++) {
        const u = i / JIB_N;
        // нижняя кромка: от шкота (u = 0) к галсу (u = 1), верх сходится в фал
        const bx = JIB.clew[0] + (JIB.tack[0] - JIB.clew[0]) * u;
        const by = JIB.clew[1] + (JIB.tack[1] - JIB.clew[1]) * u;
        const bz = JIB.clew[2] + (JIB.tack[2] - JIB.clew[2]) * u;
        const x = bx + (JIB.head[0] - bx) * (1 - v);
        const y = by + (JIB.head[1] - by) * (1 - v);
        const z = bz + (JIB.head[2] - bz) * (1 - v);
        const b = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.1)) * (0.45 + 0.9 * wind);
        sailsPos.setXYZ(k++, x + b + 0.04 * Math.sin(t * 3 + u * 5) * v, y, z);
      }
    }
    sailsPos.needsUpdate = true;
    sailGeo.computeVertexNormals();
    sailGeo.computeBoundingSphere();
  }

  /** Флаг: волна бежит от мачты, к свободному концу сильнее; чуть провисает без ветра */
  function updateFlag(t: number, wind: number): void {
    const amp = 0.18 + 0.16 * wind;
    const droop = 0.35 * (1 - wind);
    for (let i = 0; i <= FLAG_N; i++) {
      const s = i / FLAG_N;
      const len = s * FLAG_W;
      const wave = Math.sin(len * 2.2 - t * (5 + 3 * wind)) * amp * s;
      const dy = -droop * s * s;
      flagAttr.setXYZ(i * 2, wave, FLAG_Y + dy, MAIN_Z - 0.1 - len * (1 - 0.06 * s));
      flagAttr.setXYZ(i * 2 + 1, wave * 0.9, FLAG_Y - FLAG_H + dy * 1.3, MAIN_Z - 0.1 - len * (1 - 0.06 * s));
    }
    flagAttr.needsUpdate = true;
    flagGeo.computeVertexNormals();
    flagGeo.computeBoundingSphere();
  }

  const dummy = new THREE.Object3D();
  function update(a: ShipAnim, dt: number): void {
    if (!alive) return;
    const t = a.t;
    const anchored = Math.min(1, Math.max(0, a.anchored));
    const flee = Math.min(1, Math.max(0, a.flee));
    const damage = Math.min(1, Math.max(0, a.damage));
    // свёртывание и «полнота» парусов догоняют цель плавно
    const k = 1 - Math.exp(-Math.max(0, dt) * 1.6);
    furl += (anchored * (1 - flee) - furl) * (dt > 0 ? k : 1);
    const target = Math.min(1, (a.speed > 0.05 ? Math.min(1, a.speed / 3) : 0) * (1 - anchored) + flee * 1.3);
    fill += (target - fill) * (dt > 0 ? k : 1);
    // качка (только подгруппа корпуса); пробитый корабль сидит ниже и кренится
    const settle = 0.3 * Math.max(0, damage - 0.5);
    hull.position.y = 0.08 * Math.sin(t * 0.9) - settle;
    hull.rotation.set(0.02 * Math.sin(t * 0.7 + 1) - 0.05 * flee, 0, 0.04 * Math.sin(t * 0.55) + 0.06 * a.turn + 0.035 * damage, 'YXZ');
    brace += (Math.max(-1, Math.min(1, a.brace ?? 1)) - brace) * (dt > 0 ? k : 1);
    applyBrace(brace * BRACE);
    updateSails(t, fill, furl);
    updateFlag(t, Math.max(fill, 0.35));
    if (flagWhite !== a.whiteFlag) {
      flagWhite = a.whiteFlag;
      setFlagUv(flagWhite);
    }
    // откат пушек: ствол уходит в порт
    for (let i = 0; i < 8; i++) {
      const g = gunAt[i];
      const r = Math.min(1, Math.max(0, a.guns[i] ?? 0));
      // назад по нормали борта (наружу — (side·cos, sin) угла нормали)
      const back = 0.55 * r;
      const yaw0 = g.yaw * g.side;
      dummy.position.set(g.x - g.side * Math.cos(yaw0) * back, g.y, g.z - Math.sin(yaw0) * back);
      dummy.rotation.set(0, g.side > 0 ? -g.yaw : Math.PI - g.yaw, 0);
      dummy.updateMatrix();
      guns.setMatrixAt(i, dummy.matrix);
    }
    guns.instanceMatrix.needsUpdate = true;
    // повреждения ступенями
    dmg1.visible = damage >= 0.33;
    dmg2.visible = damage >= 0.66;
    rail.visible = damage < 0.66;
    // якорь: на ходу — у кат-балки, на якоре — под водой, канат в воду
    const drop = anchored;
    anchorMesh.position.set(CAT.x, CAT.y - 0.15 - drop * 4.2, CAT.z);
    anchorMesh.rotation.set(0, Math.PI / 2, 0.15 * Math.sin(t * 0.8) * (1 - drop));
    cableMesh.visible = drop > 0.02;
    cableMesh.position.set(CAT.x, CAT.y - 0.15, CAT.z);
    cableMesh.scale.set(1, Math.max(0.01, drop * 4.2), 1);
    // пена у носа и след — на ходу
    const sp = Math.min(1, Math.max(0, a.speed) / 3);
    foam.visible = sp > 0.05;
    foam.scale.set(0.6 + 0.4 * sp, 1, 0.5 + 0.5 * sp);
    foam.position.y = -hull.position.y + 0.02;
  }

  update({ t: 0, speed: 0, anchored: 1, turn: 0, guns: [], damage: 0, flee: 0, whiteFlag: false }, 0);

  return {
    group,
    hull,
    muzzles,
    deck,
    davits,
    smokeSpots,
    update,
    deckRoot(i: number, out: THREE.Matrix4, scale = 1) {
      const d = deck[Math.max(0, Math.min(deck.length - 1, i | 0))];
      hull.updateWorldMatrix(true, false);
      _e.set(0, d.yaw + Math.PI, 0, 'YXZ');
      _q.setFromEuler(_e);
      _loc.compose(_p.set(d.x, d.y, d.z), _q, _s.set(scale, scale, scale));
      return out.multiplyMatrices(hull.matrixWorld, _loc);
    },
    dispose() {
      if (!alive) return;
      alive = false;
      group.removeFromParent();
      for (const g of geos) g.dispose();
      guns.dispose();
      for (const m of [mat, glowMat, clothMat, foamMat]) m.dispose();
      tex.dispose();
    },
  };
}
