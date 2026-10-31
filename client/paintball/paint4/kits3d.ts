// Четыре набора краскомётов (флаг PAINT4) в руках желейки: Брызгалка, Лейка, Лук и ведёрко краски (маркер — прежний,
// из avatar.ts). Кодом three.js по образцу стволов крепости (client/fort/arsenal3d.ts): вершинные цвета, одна геометрия
// на модель, общие материалы. Концепт — imagegen (client/assets/ui/icons/PROVENANCE.md, «Дополнение 6»).
//
// Оси как у маркера (avatar.ts): ствол смотрит в −Z, начало — у рукояти. Узел маркера у аватара закрыт — берём его через
// узкий интерфейс (как арсенал крепости). У набора свои варежки (тот же материал кожи): правая жмёт спуск, тянет тетиву или
// держит ведёрко, левая качает помпу Брызгалки, держит ручку Лейки и лук — так анимация объясняет оружие.
//
// Анимации: в руках — лёгкое покачивание; выстрел — у Брызгалки дёргается помпа и брызжет сопло, у Лейки — «полив»
// наклоном вперёд, у Лука — тетива уходит вперёд с дрожью, плечи пружинят, стрела ложится заново; отдача — общий толчок
// узла (avatar.onShot) плюс свой; перезарядка — Брызгалка качает помпу, Лейка запрокидывается и «наливается»; натяжение
// лука — тетива и правая варежка назад, плечи гнутся; ведёрко — держишь G: висит в правой руке, бросок — замах снизу вперёд.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEAM_COLORS } from '../../../shared/constants.ts';
import { KIT_BOW, KIT_CAN, KIT_MARKER, KIT_SQUIRT } from '../../../shared/paint4.ts';
import type { Avatar } from '../../render/avatar.ts';

const RED = 0xd8473a;
const RED_DARK = 0xa53229;
const CREAM = 0xf1e4c8;
const CREAM_DARK = 0xd9c6a2;
const ZINC = 0xb3bbc0;
const ZINC_DARK = 0x858e94;
const BAND = 0xc4482f;
const BRASS = 0xcf9d3e;
const BRASS_DARK = 0x9c7228;
const WOOD = 0xb87a3e;
const WOOD_DARK = 0x83521f;
const STRING = 0xf6eedb;
const SHAFT = 0xdcbb8a;
const TIN = 0xbcc3c7;
const TIN_DARK = 0x8d959a;
const IRON = 0x4d5156;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

function colored(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = ng.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  ng.deleteAttribute('uv');
  return ng;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts, false)!;
}

/** Цилиндр вдоль Z от z0 до z1 (z0 < z1): r0 — у z0, r1 — у z1 */
function tubeZ(r0: number, r1: number, z0: number, z1: number, x: number, y: number, seg = 12): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r0, r1, z1 - z0, seg).rotateX(-Math.PI / 2).translate(x, y, (z0 + z1) / 2);
}

/** Цилиндр от точки a к точке b, радиусы ra и rb */
function rod(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, seg = 8): THREE.BufferGeometry {
  const d = _v.subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(rb, ra, len, seg);
  _q.setFromUnitVectors(UP, d.normalize());
  g.applyQuaternion(_q);
  const m = _v2.addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/** Тело вращения вокруг Y по профилю (r, y) */
function lathe(profile: Array<[number, number]>, seg = 16): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

function tris(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

// ------------------------------------------------------------ общие ресурсы

interface Res {
  vc: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  paint: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  mitten: THREE.BufferGeometry;
  // Брызгалка
  sqBody: THREE.BufferGeometry;
  sqPump: THREE.BufferGeometry;
  sqTank: THREE.BufferGeometry;
  sqPaint: THREE.BufferGeometry;
  // Лейка
  canBody: THREE.BufferGeometry;
  canPaint: THREE.BufferGeometry;
  // Лук
  bowRiser: THREE.BufferGeometry;
  bowLimb: THREE.BufferGeometry;
  string: THREE.BufferGeometry;
  arrowBody: THREE.BufferGeometry;
  arrowTip: THREE.BufferGeometry;
  // Ведёрко
  bucketBody: THREE.BufferGeometry;
  bucketPaint: THREE.BufferGeometry;
}

let res: Res | null = null;

/** Где на моделях дуло, держатся варежки и точки анимации (оси узла маркера) */
/** Наборы в руках крупнее маркера: на желейке в 1,2 раза, чтобы с 10–20 м читался силуэт (ведёрко и стрела в полёте — так же) */
export const KIT_SCALE = 1.2;
export const SQ_MUZZLE = new THREE.Vector3(0, 0.03, -0.585);
const SQ_TANK = new THREE.Vector3(0, 0.12, -0.2);
const SQ_TANK_R = 0.075;
const SQ_PUMP_Z = -0.43;
/** Лейка: поворачивается вокруг задней ручки */
const CAN_PIVOT = new THREE.Vector3(0, -0.04, -0.1);
export const CAN_MUZZLE = new THREE.Vector3(0, 0.075, -0.665);
/** Лук: рукоять (левая варежка), тетива в покое — на столько за рукоятью (к себе, +Z), натяжение — ещё столько */
const BOW_GRIP = new THREE.Vector3(-0.02, 0.0, -0.4);
const BOW_BRACE = 0.11;
const BOW_PULL = 0.36;
const BOW_TIP_Y = 0.43;
const BOW_TIP_Z = 0.1;
const ARROW_LEN = 0.6;

function build(): Res {
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false });
  const paint = TEAM_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.22, metalness: 0 })) as [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  const mitten = new THREE.SphereGeometry(0.08, 14, 10).scale(1, 0.92, 0.9);

  // --- Брызгалка: красный пузатый корпус, кремовое сопло и помпа под стволом, прозрачный бак сверху
  const sqBody = merge([
    colored(new THREE.CapsuleGeometry(0.052, 0.26, 6, 14).rotateX(Math.PI / 2).translate(0, 0.015, -0.21), RED),
    colored(tubeZ(0.03, 0.034, -0.52, -0.36, 0, 0.03, 14), RED),
    colored(tubeZ(0.012, 0.024, -0.585, -0.52, 0, 0.03, 12), CREAM),
    colored(new THREE.TorusGeometry(0.031, 0.007, 6, 16).translate(0, 0.03, -0.52), CREAM_DARK),
    // рукоять с наклоном и спуск в кремовой скобе
    colored(new THREE.CapsuleGeometry(0.03, 0.08, 4, 10).rotateX(-0.32).translate(0, -0.085, -0.065), RED_DARK),
    colored(new THREE.TorusGeometry(0.03, 0.006, 5, 12, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI).translate(0, -0.035, -0.135), CREAM),
    colored(new THREE.BoxGeometry(0.014, 0.03, 0.016).translate(0, -0.05, -0.13), CREAM_DARK),
    // горловина и крышка бака, кольцо-прицел сзади
    colored(new THREE.CylinderGeometry(0.03, 0.036, 0.04, 12).translate(SQ_TANK.x, SQ_TANK.y - SQ_TANK_R + 0.005, SQ_TANK.z), RED),
    colored(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12).translate(SQ_TANK.x, SQ_TANK.y + SQ_TANK_R + 0.01, SQ_TANK.z), RED),
    colored(new THREE.CylinderGeometry(0.022, 0.026, 0.012, 12).translate(SQ_TANK.x, SQ_TANK.y + SQ_TANK_R + 0.03, SQ_TANK.z), CREAM),
    colored(new THREE.TorusGeometry(0.018, 0.006, 5, 10).translate(0, 0.075, -0.06), CREAM),
    // кремовые кружки по бокам — как на концепте
    colored(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 12).rotateZ(Math.PI / 2).translate(0, 0.012, -0.29), CREAM),
  ]);
  const pumpParts = [colored(tubeZ(0.038, 0.038, -0.075, 0.075, 0, 0, 14), CREAM)];
  for (let i = 0; i < 4; i++) pumpParts.push(colored(new THREE.TorusGeometry(0.039, 0.006, 5, 14).translate(0, 0, -0.05 + i * 0.033), CREAM_DARK));
  const sqPump = merge(pumpParts);
  const sqTank = new THREE.SphereGeometry(SQ_TANK_R, 18, 12);
  // краска в баке: шар чуть меньше; уровень — масштаб по Y от дна
  const sqPaint = new THREE.SphereGeometry(SQ_TANK_R - 0.008, 16, 10).translate(0, SQ_TANK_R - 0.008, 0);

  // --- Лейка: оцинкованный бачок с красной полосой и заклёпками, задняя и верхняя ручки, длинный носик с латунной розеткой
  const by0 = -0.19;
  const by1 = 0.02;
  const bz = -0.26;
  const canParts = [
    colored(lathe([[0, by0], [0.098, by0], [0.104, by0 + 0.01], [0.1, by1 - 0.01], [0.094, by1], [0.05, by1 + 0.012], [0.05, by1 + 0.018]], 18).translate(0, 0, bz), ZINC),
    colored(new THREE.TorusGeometry(0.103, 0.008, 6, 20).rotateX(Math.PI / 2).translate(0, by0 + 0.005, bz), ZINC_DARK),
    colored(new THREE.TorusGeometry(0.096, 0.008, 6, 20).rotateX(Math.PI / 2).translate(0, by1, bz), ZINC_DARK),
    colored(new THREE.CylinderGeometry(0.1035, 0.1045, 0.055, 18, 1, true).translate(0, -0.09, bz), BAND),
    // горловина сверху (в неё видно краску)
    colored(new THREE.TorusGeometry(0.05, 0.007, 6, 14).rotateX(Math.PI / 2).translate(0, by1 + 0.018, bz), ZINC_DARK),
    // задняя ручка: дуга в плоскости YZ
    colored(new THREE.TorusGeometry(0.075, 0.012, 7, 16, Math.PI).rotateY(-Math.PI / 2).translate(0, -0.07, bz + 0.1), ZINC_DARK),
    // верхняя ручка: дуга над горловиной
    colored(new THREE.TorusGeometry(0.065, 0.011, 7, 16, Math.PI).rotateY(Math.PI / 2).translate(0, by1 + 0.02, bz + 0.005), ZINC_DARK),
  ];
  // заклёпки на полосе
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    canParts.push(colored(new THREE.SphereGeometry(0.009, 6, 4).translate(Math.cos(a) * 0.106, -0.09, bz + Math.sin(a) * 0.106), ZINC_DARK));
  }
  // носик: от низа бачка вперёд-вверх, розетка — раструб и латунный диск с дырочками
  const sp0 = new THREE.Vector3(0, -0.13, bz - 0.09);
  const sp1 = new THREE.Vector3(0, 0.045, -0.6);
  canParts.push(colored(rod(sp0, sp1, 0.024, 0.014, 10), ZINC));
  const dir = _v.subVectors(sp1, sp0).normalize().clone();
  const rose0 = sp1.clone();
  const rose1 = sp1.clone().addScaledVector(dir, 0.06);
  canParts.push(colored(rod(rose0, rose1, 0.016, 0.05, 14), BRASS));
  const face = new THREE.CylinderGeometry(0.05, 0.05, 0.01, 16);
  _q.setFromUnitVectors(UP, dir);
  face.applyQuaternion(_q).translate(rose1.x, rose1.y, rose1.z);
  canParts.push(colored(face, BRASS_DARK));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const hole = new THREE.CylinderGeometry(0.006, 0.006, 0.006, 5);
    const off = new THREE.Vector3(Math.cos(a) * 0.028, 0, Math.sin(a) * 0.028).applyQuaternion(_q);
    hole.applyQuaternion(_q).translate(rose1.x + off.x + dir.x * 0.004, rose1.y + off.y + dir.y * 0.004, rose1.z + off.z + dir.z * 0.004);
    canParts.push(colored(hole, IRON));
  }
  const canBody = merge(canParts);
  CAN_MUZZLE.copy(rose1).addScaledVector(dir, 0.01);
  // краска в горловине (зазор 1,5 см над дном горловины не нужен: это отдельный цилиндр с толщиной)
  const canPaint = new THREE.CylinderGeometry(0.046, 0.046, 0.012, 14).translate(0, by1 + 0.006, bz);

  // --- Лук: рукоять в красно-кремовой обмотке, плечи — гнутые трубки с завитком на концах, тетива — две нитки
  const bowRiser = merge([
    colored(new THREE.CapsuleGeometry(0.022, 0.13, 4, 10).translate(0, 0, 0), WOOD_DARK),
    colored(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 10).translate(0, 0.035, 0), RED),
    colored(new THREE.CylinderGeometry(0.025, 0.025, 0.035, 10).translate(0, -0.005, 0), CREAM),
    colored(new THREE.CylinderGeometry(0.025, 0.025, 0.035, 10).translate(0, -0.045, 0), RED),
    // полочка для стрелы
    colored(new THREE.BoxGeometry(0.03, 0.012, 0.03).translate(0.018, 0.075, 0), WOOD_DARK),
  ]);
  // верхнее плечо (нижнее — то же, отражённое): от рукояти назад к лучнику, кончик завивается вперёд
  const limbCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.07, 0),
    new THREE.Vector3(0, 0.18, 0.04),
    new THREE.Vector3(0, 0.3, 0.09),
    new THREE.Vector3(0, 0.39, 0.115),
    new THREE.Vector3(0, BOW_TIP_Y, BOW_TIP_Z),
  ]);
  const limb = new THREE.TubeGeometry(limbCurve, 14, 0.016, 7, false);
  // плечи тоньше к концу: сужаем по высоте
  const lp = limb.getAttribute('position');
  for (let i = 0; i < lp.count; i++) {
    const y = lp.getY(i);
    const k = 1 - Math.max(0, (y - 0.07) / (BOW_TIP_Y - 0.07)) * 0.45;
    const c = limbCurve.getPoint(Math.min(1, Math.max(0, (y - 0.07) / (BOW_TIP_Y - 0.07))));
    lp.setX(i, c.x + (lp.getX(i) - c.x) * k);
    lp.setZ(i, c.z + (lp.getZ(i) - c.z) * k);
  }
  const bowLimb = merge([
    colored(limb, WOOD),
    colored(new THREE.SphereGeometry(0.013, 6, 5).translate(0, BOW_TIP_Y, BOW_TIP_Z), WOOD_DARK),
    colored(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8).translate(0, 0.27, 0.078).rotateX(0), CREAM),
  ]);
  const string = colored(new THREE.CylinderGeometry(0.0035, 0.0035, 1, 5).translate(0, 0.5, 0), STRING);
  // стрела: древко вдоль −Z от ушка (0) до наконечника; наконечник — мягкий шарик с краской (свой материал команды)
  const arrowParts = [
    colored(tubeZ(0.0065, 0.0065, -ARROW_LEN, 0, 0, 0, 6), SHAFT),
    colored(tubeZ(0.009, 0.0075, -0.012, 0.008, 0, 0, 6), CREAM),
    colored(tubeZ(0.012, 0.007, -ARROW_LEN - 0.012, -ARROW_LEN + 0.03, 0, 0, 8), WOOD_DARK),
  ];
  for (let i = 0; i < 3; i++) {
    const vane = new THREE.BufferGeometry();
    vane.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.03, 0, 0.034, -0.04, 0, 0.026, -0.12, 0, 0, -0.13], 3));
    vane.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]);
    vane.computeVertexNormals();
    vane.rotateZ((i / 3) * Math.PI * 2);
    arrowParts.push(colored(vane, i === 0 ? RED : CREAM));
  }
  const arrowBody = merge(arrowParts);
  const arrowTip = new THREE.SphereGeometry(0.026, 12, 9).translate(0, 0, -ARROW_LEN - 0.03);

  // --- Ведёрко: жестяное, с ободком, проволочной дужкой и деревянной ручкой, краска потекла через край
  const bucketParts = [
    colored(lathe([[0, 0], [0.07, 0], [0.072, 0.005], [0.088, 0.13], [0.084, 0.13], [0.082, 0.118]], 18), TIN),
    colored(new THREE.TorusGeometry(0.088, 0.006, 6, 20).rotateX(Math.PI / 2).translate(0, 0.13, 0), TIN_DARK),
    colored(new THREE.TorusGeometry(0.072, 0.005, 5, 18).rotateX(Math.PI / 2).translate(0, 0.006, 0), TIN_DARK),
    colored(new THREE.TorusGeometry(0.0905, 0.0035, 5, 18, Math.PI).translate(0, 0.11, 0), IRON),
    colored(new THREE.CylinderGeometry(0.013, 0.013, 0.06, 8).rotateZ(Math.PI / 2).translate(0, 0.2, 0), WOOD),
    colored(new THREE.SphereGeometry(0.008, 6, 4).translate(0.088, 0.11, 0), IRON),
    colored(new THREE.SphereGeometry(0.008, 6, 4).translate(-0.088, 0.11, 0), IRON),
  ];
  const bucketBody = merge(bucketParts);
  const drips: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.083, 0.083, 0.014, 18).translate(0, 0.122, 0)];
  for (const [a, len] of [[0.4, 0.05], [1.9, 0.08], [3.6, 0.04], [5.1, 0.065]] as const) {
    const r = 0.087;
    drips.push(new THREE.CapsuleGeometry(0.009, len, 3, 6).translate(Math.cos(a) * r, 0.13 - len / 2, Math.sin(a) * r));
  }
  for (const d of drips) d.deleteAttribute('uv');
  const bucketPaint = merge(drips.map((d) => (d.index ? d.toNonIndexed() : d)));

  return {
    vc, metal, glass, paint, mitten, sqBody, sqPump, sqTank, sqPaint, canBody, canPaint, bowRiser, bowLimb, string, arrowBody, arrowTip,
    bucketBody, bucketPaint,
  };
}

function R(): Res {
  if (!res) res = build();
  return res;
}

// ------------------------------------------------------------ модели

/** Узел маркера аватара (закрыт — берём узко, как арсенал крепости) */
interface AvatarGun {
  node: THREE.Group;
  marker: THREE.Mesh[];
  awp: THREE.Group | null;
}

function gunOf(av: Avatar): AvatarGun | null {
  return (av as unknown as { gun: AvatarGun | null }).gun;
}

/** Модель набора в узле маркера: группа, части для анимации и где дуло */
interface KitModel {
  group: THREE.Group;
  /** Дуло в осях узла (для Лука — наконечник стрелы в покое) */
  muzzle: THREE.Vector3;
  tris: number;
}

interface SquirtModel extends KitModel {
  pump: THREE.Mesh;
  paint: THREE.Mesh;
}

interface CanModel extends KitModel {
  tilt: THREE.Group;
}

interface BowModel extends KitModel {
  bow: THREE.Group;
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  strTop: THREE.Mesh;
  strBot: THREE.Mesh;
  arrow: THREE.Group;
  arrowTip: THREE.Mesh;
}

interface BucketModel extends KitModel {
  swing: THREE.Group;
  paint: THREE.Mesh;
}

function makeSquirt(team: 0 | 1): SquirtModel {
  const r = R();
  const group = new THREE.Group();
  const body = new THREE.Mesh(r.sqBody, r.vc);
  const pump = new THREE.Mesh(r.sqPump, r.vc);
  pump.position.set(0, -0.035, SQ_PUMP_Z);
  const paint = new THREE.Mesh(r.sqPaint, r.paint[team]);
  paint.position.set(SQ_TANK.x, SQ_TANK.y - SQ_TANK_R + 0.008, SQ_TANK.z);
  const tank = new THREE.Mesh(r.sqTank, r.glass);
  tank.position.copy(SQ_TANK);
  tank.renderOrder = 2;
  for (const m of [body, pump]) m.castShadow = true;
  group.add(body, pump, paint, tank);
  return { group, muzzle: SQ_MUZZLE, tris: tris(r.sqBody) + tris(r.sqPump) + tris(r.sqTank) + tris(r.sqPaint), pump, paint };
}

function makeCan(team: 0 | 1): CanModel {
  const r = R();
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.position.copy(CAN_PIVOT);
  const inner = new THREE.Group();
  inner.position.copy(CAN_PIVOT).multiplyScalar(-1);
  const body = new THREE.Mesh(r.canBody, r.metal);
  body.castShadow = true;
  const paint = new THREE.Mesh(r.canPaint, r.paint[team]);
  inner.add(body, paint);
  tilt.add(inner);
  group.add(tilt);
  return { group, muzzle: CAN_MUZZLE, tris: tris(r.canBody) + tris(r.canPaint), tilt };
}

function makeBow(team: 0 | 1): BowModel {
  const r = R();
  const group = new THREE.Group();
  const bow = new THREE.Group();
  bow.position.copy(BOW_GRIP);
  // лук чуть завален вбок, как держат лучники
  bow.rotation.z = 0.12;
  const riser = new THREE.Mesh(r.bowRiser, r.vc);
  const upper = new THREE.Mesh(r.bowLimb, r.vc);
  const lower = new THREE.Mesh(r.bowLimb, r.vc);
  lower.scale.y = -1;
  const strTop = new THREE.Mesh(r.string, r.vc);
  const strBot = new THREE.Mesh(r.string, r.vc);
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(r.arrowBody, r.vc);
  const arrowTip = new THREE.Mesh(r.arrowTip, r.paint[team]);
  arrow.add(shaft, arrowTip);
  arrow.position.set(0.012, 0.075, BOW_BRACE);
  for (const m of [riser, upper, lower]) m.castShadow = true;
  bow.add(riser, upper, lower, strTop, strBot, arrow);
  group.add(bow);
  const t = tris(r.bowRiser) + 2 * tris(r.bowLimb) + 2 * tris(r.string) + tris(r.arrowBody) + tris(r.arrowTip);
  const muzzle = new THREE.Vector3(BOW_GRIP.x, BOW_GRIP.y + 0.075, BOW_GRIP.z + BOW_BRACE - ARROW_LEN - 0.03);
  return { group, muzzle, tris: t, bow, upper, lower, strTop, strBot, arrow, arrowTip };
}

function makeBucket(team: 0 | 1): BucketModel {
  const r = R();
  const group = new THREE.Group();
  const swing = new THREE.Group();
  const inner = new THREE.Group();
  // держим за деревянную ручку: она — в начале координат
  inner.position.set(0, -0.2, 0);
  const body = new THREE.Mesh(r.bucketBody, r.metal);
  body.castShadow = true;
  const paint = new THREE.Mesh(r.bucketPaint, r.paint[team]);
  inner.add(body, paint);
  swing.add(inner);
  group.add(swing);
  return { group, muzzle: new THREE.Vector3(0, -0.07, 0), tris: tris(r.bucketBody) + tris(r.bucketPaint), swing, paint };
}

/** Летящее ведёрко и стрела в мире — те же геометрии (fx.ts) */
export function bucketMesh(team: 0 | 1): THREE.Group {
  const r = R();
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.set(0, -0.08, 0);
  inner.add(new THREE.Mesh(r.bucketBody, r.metal), new THREE.Mesh(r.bucketPaint, r.paint[team]));
  g.add(inner);
  g.scale.setScalar(KIT_SCALE);
  return g;
}

export function arrowMesh(team: 0 | 1): THREE.Group {
  const r = R();
  const g = new THREE.Group();
  const inner = new THREE.Group();
  // в мире начало — у наконечника (так удобно втыкать в стену)
  inner.position.z = ARROW_LEN + 0.03;
  inner.add(new THREE.Mesh(r.arrowBody, r.vc), new THREE.Mesh(r.arrowTip, r.paint[team]));
  g.add(inner);
  g.scale.setScalar(KIT_SCALE);
  return g;
}

/** Треугольники моделей — для стенда и отчёта */
export function kitTriangles(): Record<string, number> {
  return {
    squirt: makeSquirt(0).tris, can: makeCan(0).tris, bow: makeBow(0).tris, bucket: makeBucket(0).tris,
  };
}

// ------------------------------------------------------------ анимация на аватаре

function damp(cur: number, to: number, k: number, dt: number): number {
  return to + (cur - to) * Math.exp(-k * dt);
}

/**
 * Набор в руках одной желейки: модели, варежки и анимации. Хозяин (матч или стенд) зовёт update каждый кадр,
 * fire — на выстрел, setReload / setDraw — состояние, bucket — держит G и бросок.
 */
export class KitRig {
  private readonly av: Avatar;
  private team: 0 | 1;
  kit = KIT_MARKER;
  private readonly root = new THREE.Group();
  private readonly mitL: THREE.Mesh | null = null;
  private readonly mitR: THREE.Mesh | null = null;
  private hands: THREE.Object3D | null = null;
  private squirt: SquirtModel | null = null;
  private can: CanModel | null = null;
  private bow: BowModel | null = null;
  private bucket: BucketModel | null = null;
  private time = 0;
  /** С последнего выстрела, с */
  private fireT = 9;
  /** Перезарядка 0…1 (−1 — нет), натяжение 0…1 */
  private reload = -1;
  private draw = 0;
  private drawShown = 0;
  /** Тетива после выстрела: дрожь гаснет */
  private snap = 0;
  /** Стрела снова на тетиве: 0 — нет, 1 — легла */
  private nock = 1;
  /** Ведёрко: держит G (0…1 — поднял) и бросок (−1 — нет, иначе время с начала замаха) */
  private hold = 0;
  private holding = false;
  private throwT = -1;
  /** Уровень краски в баке Брызгалки 0…1 */
  private level = 1;
  awp = false;

  constructor(av: Avatar, team: 0 | 1) {
    this.av = av;
    this.team = team;
    const g = gunOf(av);
    if (!g) return;
    g.node.add(this.root);
    this.root.scale.setScalar(KIT_SCALE);
    this.hands = g.node.children.find((c) => (c as THREE.Mesh).isMesh && !g.marker.includes(c as THREE.Mesh)) ?? null;
    const skin = (this.hands as THREE.Mesh | null)?.material as THREE.Material | undefined;
    if (skin) {
      this.mitL = new THREE.Mesh(R().mitten, skin);
      this.mitR = new THREE.Mesh(R().mitten, skin);
      this.mitL.scale.setScalar(1 / KIT_SCALE);
      this.mitR.scale.setScalar(1 / KIT_SCALE);
      this.root.add(this.mitL, this.mitR);
    }
    this.apply();
  }

  /** Набор в руках (0 — маркер, прежняя модель) */
  setKit(kit: number): void {
    if (kit === this.kit) return;
    this.kit = kit;
    this.reload = -1;
    this.draw = 0;
    this.nock = 1;
    this.fireT = 9;
    this.apply();
  }

  setTeam(team: 0 | 1): void {
    if (team === this.team) return;
    this.team = team;
    const m = R().paint[team];
    if (this.squirt) this.squirt.paint.material = m;
    if (this.can) ((this.can.tilt.children[0] as THREE.Group).children[1] as THREE.Mesh).material = m;
    if (this.bow) this.bow.arrowTip.material = m;
    if (this.bucket) this.bucket.paint.material = m;
  }

  /** Выстрел (у лука — стрела ушла) */
  fire(): void {
    this.fireT = 0;
    if (this.kit === KIT_BOW) {
      this.snap = 1;
      this.nock = 0;
      this.draw = 0;
      this.drawShown = Math.max(this.drawShown, 0.3);
    }
  }

  /** frac 0…1 — доля перезарядки (null — нет); loop — чужой: точной доли не знаем, качаем по кругу */
  setReload(frac: number | null): void {
    this.reload = frac === null ? -1 : frac;
  }

  /** Натяжение лука 0…1 */
  setDraw(d: number): void {
    this.draw = d;
  }

  /** Сколько краски в баке Брызгалки 0…1 */
  setLevel(k: number): void {
    this.level = k;
  }

  /** Держит G: ведёрко в правой руке */
  holdBucket(on: boolean): void {
    this.holding = on;
  }

  /** Бросок ведёрка: замах снизу вперёд, потом снова набор */
  throwBucket(): void {
    this.throwT = 0;
    this.holding = false;
  }

  /** Дуло набора в мире (null — маркер/AWP: дуло знает аватар) */
  muzzle(out: THREE.Vector3): THREE.Vector3 | null {
    const m = this.model();
    const g = gunOf(this.av);
    if (!m || !g || this.awp) return null;
    if (m === this.bow) {
      this.bow.arrow.updateWorldMatrix(true, false);
      return out.set(0, 0, -ARROW_LEN - 0.03).applyMatrix4(this.bow.arrow.matrixWorld);
    }
    if (m === this.can) {
      this.can.tilt.updateWorldMatrix(true, false);
      return out.copy(CAN_MUZZLE).sub(CAN_PIVOT).applyMatrix4(this.can.tilt.matrixWorld);
    }
    this.root.updateWorldMatrix(true, false);
    return out.copy(m.muzzle).applyMatrix4(this.root.matrixWorld);
  }

  private model(): KitModel | null {
    return this.kit === KIT_SQUIRT ? this.squirt : this.kit === KIT_CAN ? this.can : this.kit === KIT_BOW ? this.bow : null;
  }

  private apply(): void {
    const g = gunOf(this.av);
    if (!g) return;
    const t = this.team;
    if (this.kit === KIT_SQUIRT && !this.squirt) this.root.add((this.squirt = makeSquirt(t)).group);
    if (this.kit === KIT_CAN && !this.can) this.root.add((this.can = makeCan(t)).group);
    if (this.kit === KIT_BOW && !this.bow) this.root.add((this.bow = makeBow(t)).group);
  }

  dispose(): void {
    this.root.removeFromParent();
    const g = gunOf(this.av);
    if (g) {
      for (const m of g.marker) m.visible = !g.awp?.visible;
      if (this.hands) this.hands.visible = true;
    }
  }

  update(dt: number): void {
    const g = gunOf(this.av);
    if (!g) return;
    this.time += dt;
    this.fireT += dt;
    const awp = !!g.awp?.visible;
    this.awp = awp;
    // ведёрко: поднять, держать, бросить
    if (this.throwT >= 0) {
      this.throwT += dt;
      if (this.throwT > 0.42) this.throwT = -1;
    }
    this.hold = damp(this.hold, this.holding ? 1 : 0, 14, dt);
    const bucketOn = !awp && (this.hold > 0.02 || this.throwT >= 0);
    if (bucketOn && !this.bucket) this.root.add((this.bucket = makeBucket(this.team)).group);
    const kitOn = this.kit !== KIT_MARKER && !awp;
    // свои варежки — когда в руках набор или ведёрко; маркер и AWP — прежние варежки аватара
    const own = (kitOn || bucketOn) && !!this.mitL;
    if (this.hands) this.hands.visible = !own;
    for (const m of g.marker) m.visible = !awp && this.kit === KIT_MARKER && !bucketOn;
    if (this.squirt) this.squirt.group.visible = this.kit === KIT_SQUIRT && !awp && !bucketOn;
    if (this.can) this.can.group.visible = this.kit === KIT_CAN && !awp && !bucketOn;
    if (this.bow) this.bow.group.visible = this.kit === KIT_BOW && !awp && !bucketOn;
    if (this.bucket) this.bucket.group.visible = bucketOn;
    if (this.mitL) this.mitL.visible = own;
    if (this.mitR) this.mitR.visible = own;
    if (!own) return;
    const mitL = this.mitL!;
    const mitR = this.mitR!;
    // отдача набора: короткий толчок назад и вверх, гаснет за ~0,2 с
    const kick = Math.exp(-this.fireT * 16) * (this.fireT < 0.5 ? 1 : 0);
    const idle = Math.sin(this.time * 2.1) * 0.006;
    this.root.position.set(0, idle, 0);
    this.root.rotation.set(0, 0, 0);

    if (bucketOn) {
      this.updateBucket(mitL, mitR);
      return;
    }
    if (this.kit === KIT_SQUIRT && this.squirt) {
      const s = this.squirt;
      // помпа: на выстреле — короткий рывок, на перезарядке — три полных качка
      let pump = kick * 0.025;
      if (this.reload >= 0) pump = Math.max(0, Math.sin(this.reload * Math.PI * 6)) * 0.075;
      s.pump.position.z = SQ_PUMP_Z + pump;
      // краска в баке: уровень и плеск
      const lv = Math.max(0.12, this.reload >= 0 ? this.reload : this.level);
      s.paint.scale.set(1, lv, 1);
      s.paint.rotation.z = Math.sin(this.time * 9) * 0.06 * kick;
      this.root.position.z += kick * 0.03;
      this.root.rotation.x = kick * 0.06;
      mitR.position.set(0.012, -0.085, -0.075);
      mitL.position.set(-0.008, -0.045, SQ_PUMP_Z + pump + 0.01);
    } else if (this.kit === KIT_CAN && this.can) {
      const c = this.can;
      // полив: на выстреле наклон вперёд (быстро) и обратно; перезарядка — запрокинуть и потрясти
      const pour = this.fireT < 0.45 ? Math.sin(Math.min(1, this.fireT / 0.45) * Math.PI) * (this.fireT < 0.08 ? this.fireT / 0.08 : 1) : 0;
      let tilt = -0.5 * pour;
      if (this.reload >= 0) tilt = 0.55 * Math.sin(Math.min(1, this.reload * 1.4) * Math.PI * 0.5) * (this.reload < 0.85 ? 1 : (1 - this.reload) / 0.15) + Math.sin(this.time * 22) * 0.03 * (this.reload < 0.85 ? 1 : 0);
      c.tilt.rotation.x = tilt;
      this.root.position.z += kick * 0.02;
      mitR.position.set(0.01, -0.055, -0.085);
      // левая — на верхней ручке (вместе с наклоном)
      _v.set(0, 0.105, -0.255).sub(CAN_PIVOT).applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt).add(CAN_PIVOT);
      mitL.position.copy(_v);
    } else if (this.kit === KIT_BOW && this.bow) {
      this.updateBow(this.bow, mitL, mitR, kick, dt);
    }
  }

  private updateBow(b: BowModel, mitL: THREE.Mesh, mitR: THREE.Mesh, kick: number, dt: number): void {
    // натяжение плавно, после выстрела тетива уходит вперёд с дрожью; новая стрела ложится за ~0,4 с
    this.drawShown = this.draw > this.drawShown ? damp(this.drawShown, this.draw, 30, dt) : damp(this.drawShown, this.draw, 40, dt);
    this.snap = Math.max(0, this.snap - dt * 2.2);
    if (this.fireT > 0.12) this.nock = Math.min(1, this.nock + dt * 3);
    const d = this.drawShown;
    const wobble = Math.sin(this.fireT * 70) * this.snap * 0.025;
    // плечи гнутся к лучнику, концы чуть сходятся
    const bend = d * 0.13 + wobble * 2;
    b.upper.rotation.x = bend;
    b.lower.rotation.x = -bend;
    // кончики плеч в осях лука
    const tipTop = _v.set(0, BOW_TIP_Y, BOW_TIP_Z).applyEuler(b.upper.rotation);
    const tipBot = _v2.set(0, BOW_TIP_Y, BOW_TIP_Z).applyEuler(b.upper.rotation);
    tipBot.y = -tipBot.y;
    const nockZ = BOW_BRACE + d * BOW_PULL + wobble;
    const nock = new THREE.Vector3(0, 0.075 * (1 - d * 0.3), nockZ);
    this.setString(b.strTop, tipTop, nock);
    this.setString(b.strBot, tipBot, nock);
    // стрела на тетиве; после выстрела её нет, потом выезжает из колчана (из-за спины) и ложится
    b.arrow.visible = this.nock > 0.05;
    b.arrow.position.set(0.012, nock.y, nockZ + (1 - this.nock) * 0.25);
    b.arrow.scale.setScalar(0.4 + 0.6 * this.nock);
    // натянутый лук дрожит от усилия
    const strain = d > 0.95 ? Math.sin(this.time * 31) * 0.004 : 0;
    b.bow.position.set(BOW_GRIP.x, BOW_GRIP.y + strain, BOW_GRIP.z);
    this.root.position.z += kick * 0.02;
    this.root.rotation.x = kick * 0.04;
    mitL.position.set(BOW_GRIP.x - 0.01, BOW_GRIP.y + 0.0, BOW_GRIP.z + 0.01);
    // правая — на тетиве (в осях узла: лук повёрнут на 0,12 по Z — для варежки этого хватает и без поворота)
    mitR.position.set(BOW_GRIP.x + 0.02, BOW_GRIP.y + nock.y - 0.02, BOW_GRIP.z + nockZ + 0.04);
  }

  private setString(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    m.scale.set(1, len, 1);
  }

  private updateBucket(mitL: THREE.Mesh, mitR: THREE.Mesh): void {
    const b = this.bucket!;
    // держит: ведёрко висит в правой руке у бедра и покачивается; бросок — замах снизу назад и вперёд-вверх
    let ang = 0.5 + Math.sin(this.time * 3) * 0.08;
    let lift = -0.08;
    let z = -0.05;
    if (this.throwT >= 0) {
      const t = this.throwT / 0.42;
      // 0…0,35 — замах назад, 0,35…0,7 — вперёд-вверх, дальше ведёрка в руке уже нет
      const back = t < 0.35 ? t / 0.35 : 1 - Math.min(1, (t - 0.35) / 0.35);
      ang = 0.5 + back * 0.9 - (t > 0.35 ? (t - 0.35) / 0.35 * 2.4 : 0);
      lift = -0.08 + (t > 0.35 ? (t - 0.35) * 0.5 : 0);
      z = -0.05 + back * 0.12 - (t > 0.35 ? (t - 0.35) * 0.4 : 0);
      b.swing.visible = t < 0.62;
    } else {
      b.swing.visible = true;
      lift = -0.08 - (1 - this.hold) * 0.15;
    }
    b.swing.position.set(0.06, lift, z);
    b.swing.rotation.set(ang, 0, 0.1);
    mitR.position.set(0.06, lift, z);
    mitL.position.set(-0.04, -0.06, -0.3);
  }
}

/** Иконка набора (id иконки интерфейса и «чем» в ленте) */
export const KIT_ICON = ['marker', 'squirt', 'can', 'bow'] as const;
