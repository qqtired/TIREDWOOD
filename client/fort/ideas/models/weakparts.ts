// Детали слабых мест тяжёлых мобов (Т-23, shared/fortweak.ts): бочонок варенья на раме за спиной Бугая, вентиль на латах
// Чугунка, ремень с пряжкой на спине Щитоносца. Только геометрия с цветами в вершинах (position, normal, color, без
// индекса и uv) — модели склеивают её в свою часть body (client/fort/mobs/brute-*, armored-armadillo, shield-*), так что
// деталь живёт в анимациях вместе со спиной и не добавляет отрисовок. Строится один раз при загрузке.
import * as THREE from 'three';

type Geo = THREE.BufferGeometry;
type V3 = readonly [number, number, number];
type Hex = number | ((x: number, y: number, z: number) => number);

const _c = new THREE.Color();

/** Покрасить (цвет или функция от точки), без индекса и uv */
export function tint(geo: Geo, hex: Hex): Geo {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const p = g.getAttribute('position');
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    _c.set(typeof hex === 'number' ? hex : hex(p.getX(i), p.getY(i), p.getZ(i)));
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Склеить куски (position, normal, color) */
export function joinParts(list: Geo[]): Geo {
  let count = 0;
  for (const g of list) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const OAK = 0xa8743c;
const OAK_DARK = 0x8a5a2c;
const OAK_END = 0xd2a066;
const HOOP = 0x3f3f46;
const JAM = 0x7e2fa8;
const JAM_LIGHT = 0xb06ad8;
const LEATHER = 0x6b4226;
/** Ремень щита — тёмное варенье (цвета войска Барона): читается и на буром, и на зелёном */
const STRAP_JAM = 0x5a2a78;
const LEATHER_DARK = 0x4e2f1a;
const BRASS = 0xd2a043;
const ROPE = 0xc9a66b;

/**
 * Бочонок варенья лёжа (ось — X), центр в начале координат: клёпки двух оттенков, четыре железных обруча, светлые
 * донышки, пробка сверху и потёк варенья. r — радиус пуза, len — длина.
 */
export function kegGeo(r: number, len: number): Geo {
  const h = len / 2;
  const prof: Array<[number, number]> = [[r * 0.8, -h], [r * 0.93, -h * 0.6], [r, 0], [r * 0.93, h * 0.6], [r * 0.8, h]];
  const staves = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 14);
  const body = tint(staves, (x, _y, z) => (Math.floor(((Math.atan2(x, z) + Math.PI) / (Math.PI * 2)) * 14) % 2 ? OAK : OAK_DARK));
  const parts: Geo[] = [body];
  for (const y of [-h * 0.8, -h * 0.3, h * 0.3, h * 0.8]) {
    const rr = r * (y === 0 ? 1 : Math.abs(y) > h * 0.6 ? 0.85 : 0.97) + 0.012;
    parts.push(tint(new THREE.TorusGeometry(rr, 0.016, 4, 14).rotateX(Math.PI / 2).translate(0, y, 0), HOOP));
  }
  for (const s of [-1, 1]) {
    const lid = new THREE.CircleGeometry(r * 0.8, 14).rotateX(-s * Math.PI / 2).translate(0, s * h, 0);
    parts.push(tint(lid, (x, _y, z) => (Math.hypot(x, z) > r * 0.62 ? OAK_DARK : OAK_END)));
  }
  // ось лежачей бочки — X: тело вращения строилось вокруг Y
  const out = parts.map((g) => g.rotateZ(Math.PI / 2));
  // пробка сверху и потёк варенья назад-вниз по клёпкам (уже в осях лежачей бочки: верх — +Y, назад — −Z)
  const a = Math.PI / 4;
  out.push(tint(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 10).translate(0.05, r + 0.012, 0), OAK_END));
  out.push(tint(new THREE.SphereGeometry(0.07, 9, 6).scale(1, 0.3, 1.2).rotateX(-a).translate(0.05, r * Math.cos(a) + 0.004, -r * Math.sin(a) - 0.004), JAM));
  out.push(tint(new THREE.SphereGeometry(0.04, 8, 5).scale(0.8, 1.9, 0.35).translate(0.06, r * 0.1, -r - 0.004), JAM));
  out.push(tint(new THREE.SphereGeometry(0.028, 7, 5).translate(0.06, -r * 0.05, -r * 0.99), JAM_LIGHT));
  return joinParts(out);
}

/** Трубка по точкам (ремень, верёвка): сечение сплюснуто в ленту шириной w и толщиной d */
export function band(points: readonly THREE.Vector3[], w: number, d: number, hex: number, closed = false): Geo {
  const curve = new THREE.CatmullRomCurve3(points.slice(), closed);
  const seg = Math.max(8, points.length * 2);
  const tube = new THREE.TubeGeometry(curve, seg, 1, 6, closed);
  // сечение-кольцо радиуса 1 → эллипс w × d по нормали и бинормали кадра
  const frames = curve.computeFrenetFrames(seg, closed);
  const p = tube.getAttribute('position');
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(Math.min(1, i / seg), c);
    const N = frames.normals[Math.min(seg, i)] ?? frames.normals[0];
    const B = frames.binormals[Math.min(seg, i)] ?? frames.binormals[0];
    for (let j = 0; j <= 6; j++) {
      const k = i * 7 + j;
      if (k >= p.count) continue;
      v.set(p.getX(k), p.getY(k), p.getZ(k)).sub(c);
      const a = v.dot(N);
      const b = v.dot(B);
      v.copy(c).addScaledVector(N, a * d).addScaledVector(B, b * w);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  tube.computeVertexNormals();
  return tint(tube, hex);
}

const _rc = new THREE.Raycaster();
const _mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

/**
 * Точки на поверхности геометрии: луч из каждой точки from по направлению dir до первой грани, отступ off наружу
 * (против луча). Не попал — точка как есть. Для ремней, которые должны лежать на спине и плечах.
 */
export function onSurface(geo: Geo, pts: ReadonlyArray<{ from: V3; dir: V3 }>, off: number): THREE.Vector3[] {
  const mesh = new THREE.Mesh(geo, _mat);
  mesh.updateMatrixWorld();
  if (!geo.boundingBox) geo.computeBoundingBox();
  const center = geo.boundingBox!.getCenter(new THREE.Vector3());
  const out: THREE.Vector3[] = [];
  const d = new THREE.Vector3();
  for (const { from, dir } of pts) {
    // нулевое направление — точка как есть (конец ремня на раме)
    if (dir[0] === 0 && dir[1] === 0 && dir[2] === 0) {
      out.push(new THREE.Vector3(from[0], from[1], from[2]));
      continue;
    }
    const o = new THREE.Vector3(from[0], from[1], from[2]);
    d.set(dir[0], dir[1], dir[2]).normalize();
    _rc.set(o, d);
    let hit = _rc.intersectObject(mesh, false)[0];
    if (!hit) {
      // луч прошёл мимо тела (край панциря) — второй луч к центру тела; не попал и он — точку пропускаем
      d.copy(center).sub(o).normalize();
      _rc.set(o, d);
      hit = _rc.intersectObject(mesh, false)[0];
    }
    if (hit) out.push(hit.point.clone().addScaledVector(d, -off));
  }
  return out;
}

/** Ремень по поверхности: опорные точки — откуда и куда смотреть на тело (лучом) */
export function surfaceStrap(geo: Geo, pts: ReadonlyArray<{ from: V3; dir: V3 }>, w: number, d: number, hex = LEATHER): Geo {
  return band(onSurface(geo, pts, d + 0.006), w, d, hex);
}

/**
 * Рама-«козлы» для бочонка за спиной: две стойки, перекладина снизу (на ней бочонок) и сверху, верёвки вокруг бочонка.
 * В осях рамы: бочонок лёжа в (0, 0, 0) с радиусом r; стойки — между бочонком и спиной (z = +gap от пуза).
 */
export function kegFrame(r: number, len: number, gap: number, rails: number): Geo {
  const z = r + gap / 2;
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    parts.push(tint(new THREE.BoxGeometry(0.07, rails, Math.max(0.05, gap)).translate(s * len * 0.36, rails / 2 - r - 0.04, z), OAK_DARK));
  }
  parts.push(tint(new THREE.BoxGeometry(len * 0.95, 0.06, r * 0.9 + gap).translate(0, -r - 0.03, (r * 0.9 + gap) / 2 - r * 0.3), OAK_DARK));
  parts.push(tint(new THREE.BoxGeometry(len * 0.82, 0.06, 0.06).translate(0, rails - r - 0.07, z), OAK_DARK));
  // верёвки: две петли вокруг бочонка и стоек
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const rr = r * 0.97 + 0.02;
      // петля вокруг оси X, сзади (к спине) — вытянута до стоек
      const back = Math.max(0, Math.sin(a));
      pts.push(new THREE.Vector3(s * len * 0.22, Math.cos(a) * rr, Math.sin(a) * rr + back * gap * 0.9));
    }
    parts.push(band(pts, 0.022, 0.014, ROPE, true));
  }
  return joinParts(parts);
}

/** Вентиль на трубе (Чугунок): центр — латунный корпус; труба вниз на pipe, маховик сверху, манометр сбоку */
export function valveGeo(pipe: number, iron: number): Geo {
  const parts: Geo[] = [
    tint(new THREE.CylinderGeometry(0.045, 0.055, pipe, 10).translate(0, -pipe / 2 - 0.03, 0), iron),
    tint(new THREE.TorusGeometry(0.058, 0.016, 5, 12).rotateX(Math.PI / 2).translate(0, -pipe - 0.02, 0), iron),
    // корпус вентиля — латунный шар с фланцами
    tint(new THREE.SphereGeometry(0.075, 12, 8).scale(1, 0.85, 1), BRASS),
    tint(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10).translate(0, -0.07, 0), BRASS),
    // шток и маховик: красный обод, четыре спицы, гайка
    tint(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 6).translate(0, 0.09, 0), iron),
    tint(new THREE.TorusGeometry(0.1, 0.018, 5, 16).rotateX(Math.PI / 2).translate(0, 0.135, 0), 0xc8352c),
    tint(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 6).translate(0, 0.14, 0), 0xa82a24),
  ];
  for (let k = 0; k < 4; k++) {
    parts.push(tint(new THREE.BoxGeometry(0.19, 0.014, 0.018).rotateY((k * Math.PI) / 4).translate(0, 0.135, 0), 0xa82a24));
  }
  // манометр сбоку: латунный ободок, светлый циферблат с красной стрелкой (кружки в одной плоскости не накладываются)
  const dial = (g: Geo) => g.rotateZ(Math.PI / 2).translate(0.1, 0.0, 0);
  parts.push(dial(tint(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), (x, y, z) => (y > 0.014 && Math.hypot(x, z) < 0.035 ? 0xf4efe4 : BRASS))));
  parts.push(dial(tint(new THREE.BoxGeometry(0.004, 0.006, 0.03).translate(0.008, 0.02, 0.006).rotateY(0.6), 0xd8332a)));
  parts.push(tint(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 6).rotateZ(Math.PI / 2).translate(0.06, 0, 0), BRASS));
  return joinParts(parts);
}

/** Пряжка ремня (лицом к −Z — наружу со спины), центр в начале координат: латунная рамка, язычок, шлёвка */
export function buckleGeo(w = 0.13, h = 0.11): Geo {
  const t = 0.022;
  const parts: Geo[] = [
    tint(new THREE.BoxGeometry(w, t, 0.022).translate(0, h / 2 - t / 2, 0), BRASS),
    tint(new THREE.BoxGeometry(w, t, 0.022).translate(0, -h / 2 + t / 2, 0), BRASS),
    tint(new THREE.BoxGeometry(t, h, 0.022).translate(w / 2 - t / 2, 0, 0), BRASS),
    tint(new THREE.BoxGeometry(t, h, 0.022).translate(-w / 2 + t / 2, 0, 0), BRASS),
    tint(new THREE.BoxGeometry(0.014, h * 0.85, 0.012).rotateZ(0.08).translate(0.005, 0, -0.012), 0xb08530),
    // шлёвка рядом с пряжкой и подложка из кожи под рамкой
    tint(new THREE.BoxGeometry(0.03, h * 1.15, 0.03).translate(-w / 2 - 0.035, 0, 0.004), LEATHER_DARK),
    tint(new THREE.BoxGeometry(w * 0.86, h * 0.8, 0.012).translate(0, 0, 0.014), LEATHER_DARK),
  ];
  return joinParts(parts);
}

export const WEAK_LEATHER = LEATHER;

/**
 * Ремень щита наискось по спине (от правого плеча к левому боку) с пряжкой посередине (Щитоносец). y — высота пряжки
 * в осях тела, wide — полуширина спины на этой высоте, tilt — наклон пряжки лицом вверх (спина покатая).
 */
export function backStrap(body: Geo, y: number, wide: number, tilt: number): Geo[] {
  const back: V3 = [0, 0, 1];
  const slope = -0.33;
  const at = (x: number): V3 => [x, y + slope * x, -2];
  const strap = surfaceStrap(body, [
    { from: [-wide * 0.8, 2, 0.02], dir: [0, -1, 0] },
    { from: at(-wide * 1.02), dir: back },
    { from: at(-wide * 0.5), dir: back },
    { from: at(0), dir: back },
    { from: at(wide * 0.5), dir: back },
    { from: at(wide * 0.95), dir: back },
    { from: [2, y + slope * wide * 1.3, -0.03], dir: [-1, 0, 0] },
  ], 0.095, 0.02, STRAP_JAM);
  const [c] = onSurface(body, [{ from: at(0), dir: back }], 0.048);
  const buckle = buckleGeo(0.15, 0.13).rotateZ(Math.atan(slope)).rotateX(tilt).translate(c.x, c.y, c.z);
  return [strap, buckle];
}
