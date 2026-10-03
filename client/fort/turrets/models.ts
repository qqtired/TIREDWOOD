// Башни крепости — геометрия четырёх типов по ступеням облика. Всё кодом: тела вращения, скруглённые бруски, трубки,
// цвет в вершинах. Модель смотрит в −Z (наружу, за бруствер), ноги — на ходу стены (y = 0).
// Ступени: I (ур. 1–3) — дерево и железо на своей простой основе; II (4–6) — каменная площадка, латунь, крашеное дерево;
// III (7–9) — круглая башенка с зубцами, медь и золото, двойной лук / два ствола / чайник смолы / дракончик;
// IV (10) — королевская: золото и корона на флагштоке.
// Узлы модели: base (стоит), turn (поворот вокруг Y на высоте turnY), gun (наклон вокруг X в точке pivot системы turn,
// отдача — вдоль +Z), плюс свои подвижные детали типа (плечи лука, колёса, гладь смолы, челюсть, меха).
import * as THREE from 'three';
import { TW_BALLISTA, TW_BRAZIER, TW_CANNON, TW_TAR } from '../../../shared/fortarsenal.ts';
import { C, IRONISH, METAL, Part, beam, box, cone, crown, cyl, ico, lathe, merge, rbox, shield, sphere, star, tint, torus, tube } from './kit.ts';

export const STAGES = 4;

/** Ступень облика по уровню: 1–3 → 0, 4–6 → 1, 7–9 → 2, 10 → 3 */
export function stageOf(level: number): number {
  return level >= 10 ? 3 : level >= 7 ? 2 : level >= 4 ? 1 : 0;
}

/** Сколько звёзд на щитке: уровень внутри ступени (1–3); на 10-м — три */
export function starsOf(level: number): number {
  if (level >= 10) return 3;
  return ((Math.max(1, level) - 1) % 3) + 1;
}

/** Цвет звёзд по ступени: бронза, серебро, золото, золото */
export const STAR_COLORS = [C.bronze, C.silver, C.gold, C.gold] as const;
/** Цвет вымпела по уровню 1…10 */
export const PENNANT_COLORS = [0xe0492f, 0xe0492f, 0xf28a2e, 0xf2c230, 0x4fb06a, 0x3f8fe0, 0x2fa6b8, 0x7a4bd0, 0xd94ab0, 0xffd24a] as const;

/** Высота каменной площадки (у ступени I своя основа) */
const DECK = [0, 0.3, 0.44, 0.44] as const;
/** Отделка ступени: металл колец и наверший */
const TRIM = [C.iron, C.brass, C.gold, C.gold] as const;

export interface TurretModel {
  type: number;
  stage: number;
  base: Part;
  turn: Part;
  gun: Part | null;
  turnY: number;
  pivotY: number;
  pivotZ: number;
  /** Откуда вылетает снаряд (система gun; у жаровни без gun — система turn) */
  muzzle: THREE.Vector3;
  /** Верх флагштока и центр щитка со звёздами; flagInBase — флагшток стоит, а не крутится с башней */
  flag: THREE.Vector3;
  plaque: THREE.Vector3;
  flagInBase: boolean;
  shadowR: number;
  pitchMin: number;
  pitchMax: number;
  // баллиста
  arm: Part | null;
  /** Высоты луков над ложем (один или два) */
  bows: number[];
  armPivot: THREE.Vector3;
  armTip: THREE.Vector3;
  nockDrawn: number;
  crankZ: number;
  // пушка
  wheel: Part | null;
  wheelPos: THREE.Vector3;
  wheelR: number;
  barrels: number[];
  /** Запальное отверстие (система gun, x — от ствола barrels[i]) */
  fuse: THREE.Vector3;
  /** Верхнее ядро на ящике (система turn) — его пушка «заглатывает» при перезарядке */
  pile: THREE.Vector3;
  // смола
  tarTop: Part | null;
  /** Гладь смолы: высота полного и пустого котла (система gun) */
  tarFull: number;
  tarEmpty: number;
  /** Огонь: [x, y, z, размер]; у котла — система base, у чаши — turn, у дракончика — gun */
  fires: Array<[number, number, number, number]>;
  // жаровня
  jaw: Part | null;
  jawPivot: THREE.Vector3;
  bellows: Part | null;
  bellowsAt: THREE.Vector3;
}

type Draft = Omit<TurretModel, 'base' | 'turn'> & { base?: Part; turn?: Part };

function blank(type: number, stage: number): Draft {
  return {
    type, stage, gun: null, turnY: 0, pivotY: 0, pivotZ: 0, muzzle: new THREE.Vector3(), flag: new THREE.Vector3(), plaque: new THREE.Vector3(), flagInBase: false,
    shadowR: 0.8, pitchMin: -0.4, pitchMax: 0.6, arm: null, bows: [], armPivot: new THREE.Vector3(), armTip: new THREE.Vector3(), nockDrawn: 0, crankZ: 0,
    wheel: null, wheelPos: new THREE.Vector3(), wheelR: 0.3, barrels: [0], fuse: new THREE.Vector3(), pile: new THREE.Vector3(), tarTop: null, tarFull: 0, tarEmpty: 0, fires: [],
    jaw: null, jawPivot: new THREE.Vector3(), bellows: null, bellowsAt: new THREE.Vector3(),
  };
}

function done(m: Draft, base: THREE.BufferGeometry[], turn: THREE.BufferGeometry[], gun: THREE.BufferGeometry[] | null, cap: number): TurretModel {
  m.base = new Part(merge(base), cap);
  m.turn = new Part(merge(turn), cap);
  if (gun && gun.length) m.gun = new Part(merge(gun), cap);
  return m as TurretModel;
}

// ------------------------------------------------------------ общее: площадки, флагшток со щитком

/** Каменная площадка ступеней II–IV: круглый барабан, у III–IV — зубцы и окошки-бойницы */
function plinth(stage: number, out: THREE.BufferGeometry[]): void {
  if (stage === 0) return;
  const h = DECK[stage];
  const r = stage === 1 ? 0.74 : 0.78;
  out.push(tint(lathe([[0, 0], [r + 0.03, 0], [r + 0.04, 0.05], [r, 0.09], [r - 0.03, h * 0.55], [r - 0.02, h - 0.05], [r + 0.02, h - 0.03], [r + 0.02, h], [0, h]], 22), C.stone));
  out.push(tint(cyl(r - 0.012, r - 0.02, 0.05, 22, true).translate(0, h * 0.42, 0), C.stoneDark));
  const deck = stage === 1 ? C.woodLight : stage === 2 ? C.blue : C.red;
  out.push(tint(cyl(r - 0.1, r - 0.1, 0.04, 22).translate(0, h + 0.02, 0), deck));
  out.push(tint(torus(r - 0.08, 0.025, 6, 26).rotateX(Math.PI / 2).translate(0, h + 0.03, 0), TRIM[stage], METAL));
  if (stage >= 2) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * (r - 0.04);
      const z = Math.sin(a) * (r - 0.04);
      out.push(tint(rbox(0.2, 0.16, 0.13, 0.03).rotateY(-a + Math.PI / 2).translate(x, h + 0.08, z), C.stoneLight));
      if (stage === 3) out.push(tint(rbox(0.21, 0.035, 0.14, 0.012).rotateY(-a + Math.PI / 2).translate(x, h + 0.17, z), C.gold, METAL));
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      out.push(tint(rbox(0.07, 0.17, 0.05, 0.02).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * (r - 0.015), h * 0.62, Math.sin(a) * (r - 0.015)), 0x3a3230));
    }
  }
}

/** Флагшток со щитком для звёзд: шест, навершие (на IV — корона), щиток лицом к +Z */
function flagpole(stage: number, x: number, y0: number, z: number, top: number, plaqueY: number, out: THREE.BufferGeometry[], m: Draft): void {
  out.push(tint(cyl(0.026, 0.032, top - y0, 6).translate(x, (top + y0) / 2, z), C.woodDeep));
  if (stage === 3) out.push(crown(0.085).translate(x, top + 0.02, z));
  else out.push(tint(sphere(stage === 0 ? 0.045 : 0.055, 10, 8).translate(x, top + 0.03, z), stage === 0 ? C.red : TRIM[stage], stage === 0 ? 0 : METAL));
  const field = [C.woodLight, C.blue, C.red, C.royal][stage];
  const rim = [C.woodDark, C.silver, C.gold, C.gold][stage];
  out.push(tint(shield(0.34, 0.4, 0.03).translate(x, plaqueY, z + 0.045), rim, stage === 0 ? 0 : METAL));
  out.push(tint(shield(0.28, 0.33, 0.03).translate(x, plaqueY + 0.01, z + 0.07), field));
  m.flag.set(x, top - 0.04, z);
  m.plaque.set(x, plaqueY + 0.01, z + 0.092);
}

// ------------------------------------------------------------ баллиста

/** Плечо лука (правое): от оси у стойки вдоль +X, конец загнут назад (+Z); навершие — шарик */
function armGeometry(stage: number): THREE.BufferGeometry {
  const limb = [C.woodLight, C.red, C.copper, C.gold][stage];
  const knob = [C.red, C.brass, C.gold, C.red][stage];
  const len = stage >= 2 ? 0.92 : 0.86;
  const pts: Array<[number, number, number]> = [[0, 0, 0], [len * 0.35, 0, 0.015], [len * 0.7, 0, 0.07], [len, 0, 0.19]];
  const parts = [tint(tube(pts, 0.042, 12, 7).scale(1, 1.45, 1), limb, stage >= 2 ? METAL : 0)];
  parts.push(tint(sphere(0.062, 10, 8).translate(len, 0, 0.19), knob, stage === 0 ? 0 : METAL, stage === 3 ? 0.25 : 0));
  if (stage >= 1) parts.push(tint(cyl(0.058, 0.058, 0.06, 10).rotateZ(Math.PI / 2).translate(0.12, 0, 0.004), TRIM[stage], METAL));
  if (stage >= 2) parts.push(tint(cyl(0.05, 0.05, 0.05, 10).rotateZ(Math.PI / 2).rotateY(-0.12).translate(len * 0.62, 0, 0.05), C.gold, METAL));
  return merge(parts);
}

function ballista(stage: number, cap: number): TurretModel {
  const m = blank(TW_BALLISTA, stage);
  const deck = DECK[stage];
  const base: THREE.BufferGeometry[] = [];
  const turn: THREE.BufferGeometry[] = [];
  const gun: THREE.BufferGeometry[] = [];
  plinth(stage, base);
  if (stage === 0) {
    // четыре разведённые ноги к ступице, перекрестья, башмаки
    const hubY = 0.62;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const fx = Math.cos(a) * 0.52;
      const fz = Math.sin(a) * 0.52;
      base.push(tint(beam([fx, 0.02, fz], [fx * 0.12, hubY, fz * 0.12], 0.1, 0.1, 0.03), C.woodDark));
      base.push(tint(rbox(0.17, 0.06, 0.17, 0.02).translate(fx * 1.02, 0.03, fz * 1.02), C.woodDeep));
    }
    for (const a of [Math.PI / 4, -Math.PI / 4]) base.push(tint(rbox(0.74, 0.05, 0.05, 0.015).rotateY(a).translate(0, 0.24, 0), C.wood));
    base.push(tint(cyl(0.2, 0.22, 0.12, 14).translate(0, hubY - 0.02, 0), C.woodDeep));
    base.push(tint(torus(0.21, 0.018, 5, 16).rotateX(Math.PI / 2).translate(0, hubY - 0.03, 0), C.iron, IRONISH));
    m.turnY = hubY + 0.04;
  } else {
    base.push(tint(cyl(0.36, 0.38, 0.14, 16).translate(0, deck + 0.07, 0), stage === 1 ? C.woodDark : C.woodDeep));
    base.push(tint(torus(0.37, 0.022, 5, 18).rotateX(Math.PI / 2).translate(0, deck + 0.1, 0), TRIM[stage], METAL));
    m.turnY = deck + 0.14;
  }
  // стойка-веретено и вилка с осью
  const pivot = stage === 0 ? 0.66 : stage === 1 ? 0.92 : 0.98;
  const postH = pivot - 0.22;
  const wood = stage === 0 ? C.wood : C.woodDark;
  turn.push(tint(lathe([[0.15, 0], [0.16, 0.04], [0.12, 0.1], [0.095, postH * 0.45], [0.12, postH * 0.85], [0.15, postH], [0, postH]], 14), wood));
  if (stage >= 1) for (const y of [0.06, postH * 0.82]) turn.push(tint(torus(0.13, 0.02, 5, 14).rotateX(Math.PI / 2).translate(0, y, 0), TRIM[stage], METAL));
  turn.push(tint(rbox(0.4, 0.08, 0.2, 0.025).translate(0, postH + 0.03, 0), wood));
  for (const s of [-1, 1]) {
    turn.push(tint(rbox(0.065, 0.3, 0.22, 0.025).translate(s * 0.16, postH + 0.17, 0), wood));
    if (stage >= 1) turn.push(tint(sphere(0.045, 8, 6).translate(s * 0.2, pivot, 0), TRIM[stage], METAL));
  }
  turn.push(tint(cyl(0.035, 0.035, 0.44, 8).rotateZ(Math.PI / 2).translate(0, pivot, 0), C.iron, IRONISH));
  // колчан запасных болтов (со II) — сбоку на вилке
  if (stage >= 1) {
    turn.push(tint(cyl(0.085, 0.07, 0.42, 10).rotateX(0.25).translate(0.31, postH - 0.05, 0.1), C.leather));
    turn.push(tint(torus(0.086, 0.014, 5, 12).rotateX(Math.PI / 2 + 0.25).translate(0.31, postH + 0.1, 0.13), TRIM[stage], METAL));
    for (let k = 0; k < 3; k++) {
      const x = 0.31 + (k - 1) * 0.035;
      const z = 0.16 + (k % 2) * 0.03;
      turn.push(tint(cyl(0.012, 0.012, 0.16, 5).translate(x, postH + 0.12, z), C.cream));
      turn.push(tint(rbox(0.015, 0.1, 0.07, 0.006).rotateY(k * 0.9).translate(x, postH + 0.22, z), C.red));
    }
  }
  // флагшток слева сзади, на кронштейне от стойки
  flagpole(stage, -0.42, 0, 0.18, stage === 0 ? 1.95 : stage === 1 ? 2.2 : 2.38, stage === 0 ? 0.62 : 0.8, turn, m);
  turn.push(tint(beam([-0.08, 0.14, 0.04], [-0.42, 0.14, 0.18], 0.05, 0.06), wood));
  // ложе, жёлоб, стойка лука, наконечник, ось ворота, спуск
  const stock = stage === 0 ? C.wood : stage === 1 ? C.woodDark : C.woodDeep;
  gun.push(tint(rbox(0.17, 0.13, 1.5, 0.04, 2).translate(0, 0, -0.2), stock));
  gun.push(tint(rbox(0.06, 0.02, 1.32, 0.008).translate(0, 0.072, -0.24), C.woodDeep));
  const riserH = stage >= 2 ? 0.46 : 0.24;
  const riserY = stage >= 2 ? 0.08 : 0.02;
  gun.push(tint(rbox(0.3, riserH, 0.2, 0.05, 2).translate(0, riserY, -0.78), stage === 0 ? C.woodDark : C.red));
  gun.push(tint(rbox(0.19, 0.15, 0.07, 0.02).translate(0, 0, -0.97), C.iron, IRONISH));
  gun.push(tint(cyl(0.032, 0.032, 0.5, 8).rotateZ(Math.PI / 2).translate(0, 0, 0.44), C.iron, IRONISH));
  gun.push(tint(rbox(0.05, 0.12, 0.06, 0.015).translate(0, -0.1, 0.18), C.brass, METAL));
  if (stage >= 1) for (const z of [0.22, -0.46]) gun.push(tint(rbox(0.19, 0.15, 0.05, 0.02).translate(0, 0, z), TRIM[stage], METAL));
  // щит-мишень впереди (со II): кольца — знак баллисты; на III–IV — обод, золотые скобы, корона
  if (stage >= 1) {
    const R = stage === 1 ? 0.33 : 0.4;
    const z = -0.93;
    const y = stage >= 2 ? 0.1 : 0.06;
    const face = (r: number, col: number, dz: number): void => {
      gun.push(tint(cyl(r, r, 0.03, 26).rotateX(Math.PI / 2).translate(0, y, z - dz), col));
    };
    face(R, stage === 1 ? C.woodLight : C.cream, 0);
    face(R * 0.74, C.red, 0.012);
    face(R * 0.5, C.cream, 0.024);
    face(R * 0.27, C.red, 0.036);
    gun.push(tint(torus(R, 0.03, 6, 30).translate(0, y, z - 0.01), TRIM[stage], METAL));
    if (stage >= 2) {
      gun.push(tint(torus(0.075, 0.022, 6, 16).translate(0, y, z - 0.05), C.gold, METAL));
      for (const s of [-1, 1]) gun.push(tint(rbox(0.07, 0.07, 0.08, 0.02).translate(s * R * 0.94, y, z), C.gold, METAL));
    }
    if (stage === 3) gun.push(crown(0.1).translate(0, y + R + 0.03, z));
  }
  // магазин болтов на III–IV — короб на ложе позади тетивы
  if (stage >= 2) {
    gun.push(tint(rbox(0.24, 0.18, 0.28, 0.03).translate(0, 0.17, 0.27), C.woodDark));
    gun.push(tint(rbox(0.25, 0.04, 0.29, 0.015).translate(0, 0.27, 0.27), C.gold, METAL));
    for (let k = 0; k < 4; k++) gun.push(tint(rbox(0.016, 0.09, 0.08, 0.006).translate(-0.075 + k * 0.05, 0.33, 0.3), C.red));
  }
  m.arm = new Part(armGeometry(stage), cap * 4);
  m.pivotY = pivot;
  m.pivotZ = 0;
  m.bows = stage >= 2 ? [-0.03, 0.21] : [0.04];
  m.armPivot.set(0.15, 0, -0.78);
  m.armTip.set(stage >= 2 ? 0.92 : 0.86, 0, 0.19);
  m.nockDrawn = -0.04;
  m.crankZ = 0.44;
  m.muzzle.set(0, 0.1, -1.18);
  m.shadowR = 1.0;
  m.pitchMin = -0.42;
  m.pitchMax = 1.1;
  return done(m, base, turn, gun, cap);
}

// ------------------------------------------------------------ пушка

/** Колесо: обод, железная шина, спицы, ступица; ось колеса — X */
function wheelGeometry(stage: number, r: number): THREE.BufferGeometry {
  const rim = [C.woodDark, C.red, C.blue, C.royal][stage];
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tint(torus(r - 0.035, 0.042, 7, 24).rotateY(Math.PI / 2), rim));
  parts.push(tint(torus(r, 0.022, 5, 24).rotateY(Math.PI / 2), C.ironDark, IRONISH));
  for (let k = 0; k < 6; k++) parts.push(tint(rbox(0.04, r * 1.88, 0.045, 0.012).rotateX((k / 6) * Math.PI), rim));
  parts.push(tint(cyl(0.08, 0.08, 0.13, 12).rotateZ(Math.PI / 2), stage === 0 ? C.iron : TRIM[stage], stage === 0 ? IRONISH : METAL));
  parts.push(tint(sphere(0.05, 8, 6).scale(1.3, 1, 1).translate(0.065, 0, 0), stage === 0 ? C.ironDark : TRIM[stage], METAL));
  return merge(parts);
}

/** Ствол по профилю (казна → дуло вдоль −Z), с кольцами; k — калибр */
function barrel(stage: number, k: number, x: number, out: THREE.BufferGeometry[]): void {
  const body = [C.bronze, C.brass, C.copper, C.gold][stage];
  const ring = [C.brass, C.gold, C.gold, C.red][stage];
  const L = 0.85 + 0.15 * k;
  const prof: Array<[number, number]> = [[0, -0.52], [0.17, -0.52], [0.24, -0.47], [0.255, -0.4], [0.235, -0.35], [0.228, -0.05], [0.25, -0.02], [0.25, 0.04], [0.22, 0.07], [0.2, 0.5], [0.188, 0.7], [0.205, 0.74], [0.235, 0.84], [0.24, 0.92], [0.215, 0.96], [0.13, 0.96], [0.12, 0.85], [0, 0.85]];
  out.push(tint(lathe(prof.map(([r, y]) => [r * k, y * L] as [number, number]), 18).rotateX(-Math.PI / 2).translate(x, 0, 0), body, METAL));
  out.push(tint(cyl(0.12 * k, 0.12 * k, 0.02, 14).rotateX(Math.PI / 2).translate(x, 0, -0.84 * L), 0x15110f));
  out.push(tint(sphere(0.085 * k, 10, 8).translate(x, 0, 0.6 * L), body, METAL));
  out.push(tint(cyl(0.035 * k, 0.05 * k, 0.1, 8).rotateX(-Math.PI / 2).translate(x, 0, 0.54 * L), body, METAL));
  out.push(tint(cyl(0.03, 0.03, 0.03, 6).translate(x, 0.235 * k, 0.3 * L), 0x2a2420));
  for (const y of [-0.37, 0.0, 0.72]) out.push(tint(torus(0.235 * k + (y === 0.72 ? 0 : 0.008), 0.022 * k, 6, 18).translate(x, 0, -y * L), ring, METAL));
  if (stage >= 1) for (const s of [-1, 1]) out.push(tint(torus(0.06 * k, 0.018 * k, 5, 10, Math.PI).rotateY(Math.PI / 2).translate(x + s * 0.07 * k, 0.225 * k, -0.08), ring, METAL));
}

function cannon(stage: number, cap: number): TurretModel {
  const m = blank(TW_CANNON, stage);
  const deck = DECK[stage];
  const base: THREE.BufferGeometry[] = [];
  const turn: THREE.BufferGeometry[] = [];
  const gun: THREE.BufferGeometry[] = [];
  plinth(stage, base);
  const twin = stage >= 2;
  if (stage === 0) {
    // орудийная площадка — низкая бочка из клёпок с железными обручами, мешки с песком у подножия
    base.push(tint(cyl(0.7, 0.72, 0.34, 24).translate(0, 0.17, 0), C.wood));
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      base.push(tint(box(0.022, 0.3, 0.012).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 0.712, 0.17, Math.sin(a) * 0.712), C.woodDark));
    }
    for (const y of [0.07, 0.27]) base.push(tint(torus(0.715, 0.022, 5, 28).rotateX(Math.PI / 2).translate(0, y, 0), C.iron, IRONISH));
    base.push(tint(cyl(0.66, 0.66, 0.03, 24).translate(0, 0.35, 0), C.woodLight));
    for (let k = 0; k < 4; k++) {
      const a = -Math.PI / 2 + (k - 1.5) * 0.5;
      base.push(tint(sphere(0.17, 12, 8).scale(1.3, 0.55, 0.75).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 0.82, 0.09, Math.sin(a) * 0.82), C.sack));
    }
    m.turnY = 0.365;
  } else {
    m.turnY = deck + 0.04;
  }
  // лафет: щёки, хобот до земли, ось, поворотный круг
  const wood = [C.wood, C.red, C.blue, C.royal][stage];
  const half = twin ? 0.33 : 0.19;
  const wr = twin ? 0.32 : 0.3;
  const axleY = wr + 0.02;
  for (const s of [-1, 1]) {
    turn.push(tint(rbox(0.09, 0.32, 0.66, 0.04, 2).translate(s * half, axleY + 0.12, 0.02), wood));
    if (stage >= 1) {
      turn.push(tint(rbox(0.1, 0.06, 0.14, 0.02).translate(s * half, axleY + 0.29, -0.24), TRIM[stage], METAL));
      turn.push(tint(rbox(0.1, 0.06, 0.12, 0.02).translate(s * half, axleY + 0.29, 0.26), TRIM[stage], METAL));
    }
  }
  turn.push(tint(rbox(half * 2 + 0.09, 0.08, 0.3, 0.03).translate(0, axleY - 0.02, 0.08), wood));
  turn.push(tint(rbox(0.18, 0.12, 0.9, 0.04, 2).rotateX(0.36).translate(0, axleY * 0.55, 0.52), wood));
  turn.push(tint(rbox(0.24, 0.06, 0.12, 0.02).translate(0, 0.04, 0.92), C.iron, IRONISH));
  turn.push(tint(cyl(0.045, 0.045, half * 2 + 0.36, 10).rotateZ(Math.PI / 2).translate(0, axleY, -0.05), C.ironDark, IRONISH));
  turn.push(tint(cyl(0.42, 0.44, 0.05, 18).translate(0, 0.025, 0.1), stage === 0 ? C.woodDark : C.woodDeep));
  if (stage >= 1) turn.push(tint(torus(0.43, 0.018, 5, 22).rotateX(Math.PI / 2).translate(0, 0.045, 0.1), TRIM[stage], METAL));
  // ящик с ядрами на хоботе: два лежат, третье (верхнее) — отдельная деталь
  turn.push(tint(rbox(0.3, 0.14, 0.24, 0.025).translate(0, 0.27, 0.5), C.woodDark));
  turn.push(tint(rbox(0.31, 0.03, 0.25, 0.01).translate(0, 0.33, 0.5), stage === 0 ? C.iron : TRIM[stage], stage === 0 ? IRONISH : METAL));
  for (const dx of [-0.075, 0.075]) turn.push(tint(sphere(0.075, 10, 8).translate(dx, 0.4, 0.5), C.ironDark, IRONISH));
  m.pile.set(0, 0.5, 0.5);
  // флагшток слева сзади (не за стволом: со стены щиток не закрывает пушку)
  flagpole(stage, -0.42, 0.06, 0.45, stage === 0 ? 1.85 : 2.05, 0.66, turn, m);
  // ствол(ы) на цапфах
  const xs = twin ? [-0.17, 0.17] : [0];
  const k = twin ? 0.78 : stage === 1 ? 1.08 : 1;
  for (const x of xs) barrel(stage, k, x, gun);
  gun.push(tint(cyl(0.05, 0.05, half * 2 + 0.12, 10).rotateZ(Math.PI / 2), C.ironDark, IRONISH));
  if (twin) gun.push(tint(rbox(0.2, 0.12, 0.3, 0.03).translate(0, -0.02, 0.15), wood));
  m.wheel = new Part(wheelGeometry(stage, wr), cap * 2);
  m.wheelPos.set(half + 0.15, axleY, -0.05);
  m.wheelR = wr;
  m.barrels = xs;
  m.pivotY = axleY + 0.27;
  m.pivotZ = -0.02;
  m.muzzle.set(0, 0, -0.98 * (0.85 + 0.15 * k));
  m.fuse.set(0, 0.235 * k + 0.03, 0.3 * (0.85 + 0.15 * k));
  m.shadowR = 1.05;
  m.pitchMin = -0.1;
  m.pitchMax = 0.8;
  return done(m, base, turn, gun, cap);
}


// ------------------------------------------------------------ смоляной котёл

function tarPot(stage: number, gun: THREE.BufferGeometry[], m: Draft): void {
  if (stage >= 2) {
    // чайник смолы: пузатый, крышка с шишечкой (на IV — корона), носик-трубка вперёд, ручка сзади
    const body = stage === 2 ? C.copper : C.gold;
    gun.push(tint(lathe([[0, -0.46], [0.24, -0.45], [0.4, -0.34], [0.47, -0.14], [0.46, 0.04], [0.4, 0.17], [0.32, 0.23], [0.3, 0.24], [0.3, 0.2], [0, 0.2]], 22), body, METAL));
    gun.push(tint(torus(0.465, 0.03, 6, 26).rotateX(Math.PI / 2).translate(0, -0.14, 0), stage === 2 ? C.brass : C.red, METAL));
    gun.push(tint(lathe([[0.31, 0.22], [0.31, 0.26], [0.24, 0.33], [0.12, 0.37], [0, 0.375]], 18), body, METAL));
    if (stage === 3) gun.push(crown(0.09).translate(0, 0.4, 0));
    else gun.push(tint(sphere(0.06, 10, 8).translate(0, 0.42, 0), C.red, 0.2));
    gun.push(tint(tube([[0, -0.08, -0.4], [0, 0.0, -0.58], [0, 0.14, -0.72], [0, 0.26, -0.8]], 0.065, 12, 8), body, METAL));
    gun.push(tint(torus(0.068, 0.02, 6, 12).rotateX(-0.6).translate(0, 0.26, -0.8), C.brass, METAL));
    gun.push(tint(torus(0.2, 0.035, 6, 14, Math.PI * 1.1).rotateZ(Math.PI / 2 + 0.2).rotateY(Math.PI / 2).translate(0, 0.0, 0.46), C.woodDeep));
    m.muzzle.set(0, 0.27, -0.84);
    m.tarFull = 0.19;
    m.tarEmpty = -0.05;
  } else {
    // котёл: толстые стенки (профиль наружу и внутрь), обод, заклёпки, слив-носик
    const body = stage === 0 ? C.ironDark : C.copper;
    const metal = stage === 0 ? IRONISH : METAL;
    gun.push(tint(lathe([[0, -0.44], [0.25, -0.43], [0.38, -0.3], [0.43, -0.12], [0.41, 0.08], [0.37, 0.18], [0.41, 0.21], [0.42, 0.25], [0.35, 0.26], [0.33, 0.18], [0.36, 0.04], [0.3, -0.25], [0, -0.3]], 22), body, metal));
    gun.push(tint(torus(0.415, 0.028, 6, 26).rotateX(Math.PI / 2).translate(0, 0.235, 0), stage === 0 ? C.brass : C.gold, METAL));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      gun.push(tint(sphere(0.022, 6, 5).translate(Math.cos(a) * 0.43, -0.08, Math.sin(a) * 0.43), stage === 0 ? C.iron : C.brass, METAL));
    }
    if (stage === 1) gun.push(tint(torus(0.432, 0.02, 5, 26).rotateX(Math.PI / 2).translate(0, -0.18, 0), C.brass, METAL));
    gun.push(tint(cyl(0.05, 0.085, 0.2, 10, true).rotateX(Math.PI / 2 + 0.5).translate(0, 0.22, -0.47), body, metal));
    m.muzzle.set(0, 0.2, -0.58);
    m.tarFull = 0.16;
    m.tarEmpty = -0.18;
  }
  gun.push(tint(cyl(0.05, 0.05, 1.12, 10).rotateZ(Math.PI / 2), C.ironDark, IRONISH));
}

function tar(stage: number, cap: number): TurretModel {
  const m = blank(TW_TAR, stage);
  const deck = DECK[stage];
  const base: THREE.BufferGeometry[] = [];
  const turn: THREE.BufferGeometry[] = [];
  const gun: THREE.BufferGeometry[] = [];
  plinth(stage, base);
  const fy = stage === 0 ? 0 : deck + 0.04;
  // очаг: кольцо камней (на площадке — кирпичное), поленья, зола, угли
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const g = stage === 0 ? ico(0.09, 0).scale(1.2, 0.7, 1) : rbox(0.15, 0.1, 0.09, 0.02).rotateY(-a + Math.PI / 2);
    base.push(tint(g.translate(Math.cos(a) * 0.3, fy + 0.05, Math.sin(a) * 0.3), stage === 0 ? C.stoneDark : 0xb5583e));
  }
  for (let k = 0; k < 3; k++) base.push(tint(cyl(0.045, 0.05, 0.46, 7).rotateZ(Math.PI / 2).rotateY(k * 1.05).translate(0, fy + 0.07 + k * 0.025, 0), C.woodDeep));
  base.push(tint(cyl(0.24, 0.26, 0.02, 14).translate(0, fy + 0.01, 0), 0x3a2e28));
  base.push(tint(ico(0.1, 0).scale(1.5, 0.5, 1.5).translate(0, fy + 0.1, 0), C.ember, 0, 0.9));
  m.fires.push([0, fy + 0.16, 0, 0.6], [0.09, fy + 0.13, 0.05, 0.4]);
  // козлы: две «А»-рамы с подшипниками, распорки, ворот наклона сбоку
  m.turnY = fy;
  const wood = [C.wood, C.red, C.woodDark, C.royal][stage];
  const top = stage === 0 ? 1.3 : stage === 1 ? 1.12 : 1.04;
  for (const s of [-1, 1]) {
    for (const dz of [-1, 1]) turn.push(tint(beam([s * 0.57, 0, dz * 0.4], [s * 0.57, top, dz * 0.03], 0.085, 0.085, 0.025), wood));
    turn.push(tint(rbox(0.07, 0.06, 0.6, 0.02).translate(s * 0.57, top * 0.3, 0), wood));
    turn.push(tint(rbox(0.13, 0.14, 0.16, 0.03).translate(s * 0.57, top, 0), stage === 0 ? C.iron : TRIM[stage], stage === 0 ? IRONISH : METAL));
  }
  for (const dz of [-0.4, 0.4]) turn.push(tint(rbox(1.2, 0.06, 0.07, 0.02).translate(0, 0.06, dz), wood));
  turn.push(tint(torus(0.17, 0.022, 6, 16).rotateY(Math.PI / 2).translate(0.69, top, 0), stage === 0 ? C.woodDark : TRIM[stage], stage === 0 ? 0 : METAL));
  for (let k = 0; k < 4; k++) turn.push(tint(rbox(0.025, 0.32, 0.025, 0.008).rotateX((k * Math.PI) / 4).translate(0.69, top, 0), C.woodDark));
  flagpole(stage, -0.66, 0.0, 0.42, top + (stage === 0 ? 0.85 : 1.05), top * 0.6, turn, m);
  tarPot(stage, gun, m);
  const r = stage >= 2 ? 0.42 : 0.36;
  m.tarTop = new Part(tint(cyl(r, r * 0.92, 0.02, 20), C.tar, 0.18), cap);
  m.pivotY = top;
  m.pivotZ = 0;
  m.shadowR = 1.05;
  m.pitchMin = 0;
  m.pitchMax = 0;
  return done(m, base, turn, gun, cap);
}

// ------------------------------------------------------------ жаровня

/** Меха: две доски-капли и кожа гармошкой; сжимаются по Y (масштаб), сопло вперёд (−Z) */
function bellowsGeometry(stage: number): THREE.BufferGeometry {
  const board = [C.woodDark, C.red, C.woodDark, C.royal][stage];
  const parts: THREE.BufferGeometry[] = [];
  const drop = (y: number): THREE.BufferGeometry => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.22);
    s.quadraticCurveTo(0.2, -0.18, 0.2, 0.06);
    s.quadraticCurveTo(0.16, 0.22, 0, 0.24);
    s.quadraticCurveTo(-0.16, 0.22, -0.2, 0.06);
    s.quadraticCurveTo(-0.2, -0.18, 0, -0.22);
    return new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, curveSegments: 5 })
      .rotateX(-Math.PI / 2).translate(0, y, 0.02);
  };
  parts.push(tint(drop(0.07), board));
  parts.push(tint(drop(-0.1), board));
  parts.push(tint(sphere(0.19, 14, 8).scale(1, 0.32, 1.12), C.leather));
  parts.push(tint(sphere(0.17, 14, 8).scale(1, 0.24, 1.0).translate(0, 0.045, 0), 0xb06a3e));
  parts.push(tint(cyl(0.025, 0.045, 0.22, 8).rotateX(Math.PI / 2).translate(0, 0, -0.3), stage === 0 ? C.iron : TRIM[stage], METAL));
  for (const y of [0.1, -0.11]) parts.push(tint(rbox(0.05, 0.03, 0.16, 0.01).translate(0, y, 0.28), C.woodDeep));
  return merge(parts);
}

/** Голова дракончика (система gun: шея внизу сзади, морда вперёд −Z); на IV — золото и корона */
function dragonHead(stage: number, gun: THREE.BufferGeometry[]): void {
  const skin = stage === 2 ? C.copper : C.gold;
  const accent = stage === 2 ? C.gold : C.red;
  const metal = METAL * 0.85;
  gun.push(tint(sphere(0.3, 18, 14).scale(1, 0.85, 1.05).translate(0, 0.08, 0.02), skin, metal));
  gun.push(tint(rbox(0.32, 0.2, 0.42, 0.09, 2).translate(0, 0.06, -0.3), skin, metal));
  for (const s of [-1, 1]) {
    gun.push(tint(sphere(0.035, 8, 6).translate(s * 0.07, 0.15, -0.5), 0x2a1810));
    gun.push(tint(sphere(0.1, 12, 8).scale(1.1, 0.55, 0.9).translate(s * 0.13, 0.27, -0.06), skin, metal));
    gun.push(tint(sphere(0.085, 14, 10).translate(s * 0.15, 0.2, -0.12), C.white));
    gun.push(tint(sphere(0.045, 10, 8).translate(s * 0.165, 0.2, -0.19), 0x1a1214));
    gun.push(tint(sphere(0.016, 6, 5).translate(s * 0.15, 0.225, -0.225), 0xffffff, 0, 0.6));
    gun.push(tint(cone(0.055, 0.28, 8).rotateX(-1.15).translate(s * 0.13, 0.33, 0.14), accent, METAL));
    gun.push(tint(cone(0.07, 0.2, 4).scale(0.3, 1, 1).rotateZ(s * 1.2).translate(s * 0.3, 0.12, 0.06), accent, METAL));
    gun.push(tint(cone(0.03, 0.08, 5).rotateX(Math.PI).translate(s * 0.1, -0.06, -0.44), C.white));
  }
  for (let k = 0; k < 3; k++) gun.push(tint(cone(0.05, 0.14 - k * 0.025, 5).rotateX(-0.6).translate(0, 0.36 - k * 0.04, 0.02 + k * 0.13), accent, METAL));
  if (stage === 3) gun.push(crown(0.09).translate(0, 0.35, -0.08));
}

function dragonJaw(stage: number): THREE.BufferGeometry {
  const skin = stage === 2 ? C.copper : C.gold;
  const parts = [tint(rbox(0.28, 0.08, 0.4, 0.04, 2).translate(0, -0.04, -0.2), skin, METAL * 0.85)];
  parts.push(tint(rbox(0.2, 0.03, 0.32, 0.015).translate(0, 0.005, -0.2), 0x8a2a2a));
  parts.push(tint(sphere(0.07, 10, 8).scale(1.2, 0.45, 1.6).translate(0, 0.02, -0.18), C.ember, 0, 1));
  for (const s of [-1, 1]) parts.push(tint(cone(0.025, 0.07, 5).translate(s * 0.09, 0.04, -0.36), C.white));
  return merge(parts);
}

function brazier(stage: number, cap: number): TurretModel {
  const m = blank(TW_BRAZIER, stage);
  const deck = DECK[stage];
  const base: THREE.BufferGeometry[] = [];
  const turn: THREE.BufferGeometry[] = [];
  const gun: THREE.BufferGeometry[] = [];
  plinth(stage, base);
  m.flagInBase = true;
  if (stage <= 1) {
    const bowlY = stage === 0 ? 0.78 : deck + 0.62;
    if (stage === 0) {
      // три ноги с завитками, кольцо-распорка
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        base.push(tint(tube([[c * 0.2, bowlY + 0.02, s * 0.2], [c * 0.3, bowlY * 0.6, s * 0.3], [c * 0.42, 0.15, s * 0.42], [c * 0.5, 0.06, s * 0.5]], 0.032, 10, 6), C.ironDark, IRONISH));
        base.push(tint(torus(0.05, 0.018, 5, 10).rotateY(-a).translate(c * 0.55, 0.06, s * 0.55), C.ironDark, IRONISH));
      }
      base.push(tint(torus(0.32, 0.018, 5, 18).rotateX(Math.PI / 2).translate(0, 0.42, 0), C.iron, IRONISH));
    } else {
      base.push(tint(lathe([[0.26, deck], [0.24, deck + 0.06], [0.13, deck + 0.14], [0.1, deck + 0.4], [0.16, bowlY - 0.04], [0.2, bowlY], [0, bowlY]], 16), C.copper, METAL));
      base.push(tint(torus(0.12, 0.022, 6, 14).rotateX(Math.PI / 2).translate(0, deck + 0.28, 0), C.brass, METAL));
    }
    flagpole(stage, -0.5, stage === 0 ? 0 : deck, 0.4, stage === 0 ? 2.15 : 2.4, stage === 0 ? 0.92 : 1.1, base, m);
    if (stage === 0) base.push(tint(rbox(0.12, 0.08, 0.12, 0.02).translate(-0.5, 0.04, 0.4), C.woodDeep));
    // чаша-корзина: поворачивается к цели вместе с жёлобом и мехами
    m.turnY = bowlY;
    const bowl = stage === 0 ? C.ironDark : C.copper;
    const metal = stage === 0 ? IRONISH : METAL;
    turn.push(tint(lathe([[0, 0], [0.2, 0.0], [0.34, 0.08], [0.44, 0.22], [0.48, 0.32], [0.45, 0.33], [0.41, 0.24], [0.3, 0.13], [0, 0.1]], 22), bowl, metal));
    turn.push(tint(torus(0.47, 0.03, 6, 26).rotateX(Math.PI / 2).translate(0, 0.33, 0), stage === 0 ? C.iron : C.brass, METAL));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      turn.push(tint(beam([Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3], [Math.cos(a) * 0.47, 0.32, Math.sin(a) * 0.47], 0.04, 0.03, 0.01), stage === 0 ? C.iron : C.brass, METAL));
    }
    turn.push(tint(rbox(0.22, 0.04, 0.28, 0.015).rotateX(0.35).translate(0, 0.3, -0.52), bowl, metal));
    for (const s of [-1, 1]) turn.push(tint(rbox(0.03, 0.08, 0.28, 0.01).rotateX(0.35).translate(s * 0.11, 0.34, -0.52), bowl, metal));
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4;
      const r = k === 0 ? 0 : 0.12 + (k % 3) * 0.07;
      turn.push(tint(ico(0.08 + (k % 2) * 0.02, 0).translate(Math.cos(a) * r, 0.28 + (k === 0 ? 0.06 : 0), Math.sin(a) * r), k % 3 ? C.ember : C.coal, 0, k % 3 ? 0.9 : 0.15));
    }
    m.fires.push([0, 0.42, 0, stage === 0 ? 0.9 : 1.05], [0.16, 0.38, 0.08, 0.6], [-0.15, 0.37, -0.06, 0.55]);
    m.muzzle.set(0, 0.42, -0.62);
    m.bellows = new Part(bellowsGeometry(stage), cap);
    m.bellowsAt.set(0, 0.2, 0.64);
    m.pitchMin = 0;
    m.pitchMax = 0;
    m.shadowR = 0.9;
    return done(m, base, turn, null, cap);
  }
  // дракончик: шея из колец на площадке, голова — gun, челюсть — своя деталь
  m.turnY = deck + 0.04;
  const skin = stage === 2 ? C.copper : C.gold;
  const accent = stage === 2 ? C.gold : C.red;
  turn.push(tint(cyl(0.3, 0.34, 0.12, 18).translate(0, 0.06, 0), C.woodDeep));
  for (let k = 0; k < 4; k++) {
    const y = 0.17 + k * 0.17;
    const z = 0.06 - k * 0.025;
    turn.push(tint(sphere(0.2 - k * 0.012, 14, 10).scale(1, 0.62, 1).translate(0, y, z), skin, METAL * 0.85));
    turn.push(tint(torus(0.19 - k * 0.012, 0.02, 5, 16).rotateX(Math.PI / 2).translate(0, y, z), accent, METAL));
  }
  for (let k = 0; k < 3; k++) turn.push(tint(cone(0.05, 0.14, 5).rotateX(0.5).translate(0, 0.3 + k * 0.17, 0.2 - k * 0.03), accent, METAL));
  flagpole(stage, -0.52, deck, 0.42, 2.45, 1.12, base, m);
  dragonHead(stage, gun);
  m.jaw = new Part(dragonJaw(stage), cap);
  m.jawPivot.set(0, -0.04, 0.04);
  m.pivotY = 0.88;
  m.pivotZ = -0.02;
  m.fires.push([0, 0.44, 0.12, 0.8], [0.1, 0.4, 0.22, 0.52], [-0.1, 0.4, 0.22, 0.52]);
  m.muzzle.set(0, 0.0, -0.52);
  m.bellows = new Part(bellowsGeometry(stage), cap);
  m.bellowsAt.set(0, 0.4, 0.44);
  m.pitchMin = -0.5;
  m.pitchMax = 0.35;
  m.shadowR = 0.95;
  return done(m, base, turn, gun, cap);
}

const BUILDERS = [ballista, cannon, tar, brazier];

/** Модель типа и ступени (геометрия строится один раз, детали — инстансы на cap мест) */
export function buildModel(type: number, stage: number, cap: number): TurretModel {
  const b = BUILDERS[type];
  if (!b) throw new Error(`turrets: unknown type ${type}`);
  return b(Math.max(0, Math.min(STAGES - 1, stage)), cap);
}

// ------------------------------------------------------------ общие детали всех башен

/** Болт на ложе: от хвоста (z = 0) к наконечнику (−Z) */
export function boltGeometry(): THREE.BufferGeometry {
  const p = [tint(cyl(0.022, 0.022, 0.96, 6).rotateX(Math.PI / 2).translate(0, 0, -0.48), 0xe8d3a6)];
  p.push(tint(cone(0.05, 0.17, 6).rotateX(-Math.PI / 2).translate(0, 0, -1.04), C.silver, METAL));
  p.push(tint(cyl(0.03, 0.03, 0.05, 6).rotateX(Math.PI / 2).translate(0, 0, -0.93), C.brass, METAL));
  for (let k = 0; k < 3; k++) p.push(tint(rbox(0.012, 0.09, 0.17, 0.004).translate(0, 0.045, -0.12).rotateZ((k * Math.PI * 2) / 3), C.red));
  return merge(p);
}

/** Тетива: единичная длина вдоль +Y (масштабом тянем от конца плеча к хвосту болта) */
export function stringGeometry(): THREE.BufferGeometry {
  return tint(cyl(0.016, 0.016, 1, 5, true).translate(0, 0.5, 0), C.cream);
}

/** Ворот баллисты: два колеса со спицами на оси X */
export function crankGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    p.push(tint(torus(0.12, 0.018, 5, 14).rotateY(Math.PI / 2).translate(s * 0.27, 0, 0), C.woodDark));
    for (let k = 0; k < 4; k++) p.push(tint(rbox(0.025, 0.24, 0.025, 0.008).rotateX((k * Math.PI) / 4).translate(s * 0.27, 0, 0), C.wood));
    p.push(tint(cyl(0.035, 0.035, 0.05, 8).rotateZ(Math.PI / 2).translate(s * 0.27, 0, 0), C.brass, METAL));
  }
  return merge(p);
}

/** Ядро */
export function ballGeometry(): THREE.BufferGeometry {
  return tint(sphere(0.085, 12, 9), C.ironDark, IRONISH);
}

/** Пузырь смолы */
export function bubbleGeometry(): THREE.BufferGeometry {
  return tint(sphere(0.06, 10, 7).scale(1, 0.75, 1), C.tar, 0.3);
}

/** Струя смолы: отрезок единичной длины вдоль +Y */
export function streamGeometry(): THREE.BufferGeometry {
  return tint(cyl(0.05, 0.05, 1, 8, true).translate(0, 0.5, 0), C.tar, 0.35);
}

/** Звезда уровня (белая: цвет металла — в инстансе) */
export function starGeometry(): THREE.BufferGeometry {
  return tint(star(0.062, 0.027, 0.02), 0xffffff, METAL);
}

/** Вымпел: полоса вдоль +X от древка (верх — y = 0); у II–IV — «ласточкин хвост». Белый — цвет в инстансе. */
export function pennantGeometry(stage: number): THREE.BufferGeometry {
  const L = [0.56, 0.64, 0.74, 0.78][stage];
  const H = [0.3, 0.32, 0.35, 0.37][stage];
  const notch = stage === 0 ? 0 : L * 0.28;
  const taper = stage === 0 ? 1 : 0.35;
  const N = 8;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = L * t;
    const h = (H / 2) * (1 - taper * t);
    pos.push(x, -H / 2 + h, 0, (L - notch) * t, -H / 2, 0, x, -H / 2 - h, 0);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 3;
    const b = a + 3;
    idx.push(a, a + 1, b, b, a + 1, b + 1, a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
