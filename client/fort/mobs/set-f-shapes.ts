// Заготовки набора F (fort-bosses) — новые боссы «Крепости»: Король-Тыква, Ткачиха, Леший. Тела вращения, трубки с
// переменной толщиной, капли и пятна варенья, раскраска по вершинам; помощники позы (поворот вокруг точки, спрятать
// часть, шаг группы ног). Геометрия строится один раз при загрузке модуля; помощники позы — без выделений памяти.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARMY, colored, merge, setChildS } from './kit.ts';

export const TAU = Math.PI * 2;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Плавная ступенька 0…1 */
export function smooth(u: number): number {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
}

/** Плавно 0 → 1, пока x идёт от a к b */
export function ramp(a: number, b: number, x: number): number {
  return smooth((x - a) / (b - a));
}

export function mix(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/** Ходьба 0…1 от скорости: на месте — 0, с полной — 1 */
export function walkAmount(speed: number, full: number): number {
  return clamp01(speed / full);
}

/** Вздрагивание от попадания: 1 → 0 с плавным концом */
export function jolt(hit: number): number {
  return hit * hit * (3 - 2 * hit);
}

/** От 0 к 1 с перелётом за 1 и возвратом (выскочил из земли, крышка подпрыгнула) */
export function backOut(u: number): number {
  const x = clamp01(u) - 1;
  return 1 + 2.70158 * x * x * x + 1.70158 * x * x;
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

/** Раскраска по вершинам: fn(точка, нормаль, цвет) — пятна, полосы, блики (геометрия становится неиндексной) */
export function paint(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void): THREE.BufferGeometry {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    _n.fromBufferAttribute(nor, i);
    _c.setRGB(1, 1, 1);
    fn(_p, _n, _c);
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Гладкие нормали через шов (у тела вращения и трубки первая и последняя колонки — одни и те же точки) */
export function smoothNormals(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(geo.attributes)) if (name !== 'position') geo.deleteAttribute(name);
  const g = mergeVertices(geo, 1e-4);
  g.computeVertexNormals();
  return g;
}

/**
 * Тело вращения по парам [радиус, высота] снизу вверх; deform(точка) — правка формы до нормалей (рёбра тыквы, кора).
 * Шов — сзади (−Z), нормали гладкие через шов.
 */
export function lathe(points: ReadonlyArray<readonly [number, number]>, segments: number, deform?: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), segments).rotateY(Math.PI);
  if (deform) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i);
      deform(_p);
      pos.setXYZ(i, _p.x, _p.y, _p.z);
    }
  }
  return smoothNormals(g);
}

/** Эллипсоид */
export function blob(rx: number, ry: number, rz: number, w = 10, h = 7): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
}

/**
 * Трубка по точкам (сглаженная кривая) с толщиной radius(u), u — 0…1 вдоль; end — круглый кончик. Плети, ноги паука,
 * ветки, корни. deform(точка, u) — правка после построения (сплющить лист, изогнуть).
 */
export function tube(points: ReadonlyArray<readonly [number, number, number]>, radius: (u: number) => number, segments = 12, radial = 6, end = true, start = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.5);
  const g = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const pos = g.getAttribute('position');
  const at = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, at);
    const r = radius(u);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      _p.fromBufferAttribute(pos, k).sub(at).multiplyScalar(r).add(at);
      pos.setXYZ(k, _p.x, _p.y, _p.z);
    }
  }
  const list: THREE.BufferGeometry[] = [smoothNormals(g).toNonIndexed()];
  if (end) {
    const p = curve.getPointAt(1);
    list.push(new THREE.SphereGeometry(radius(1), radial, 4).translate(p.x, p.y, p.z).toNonIndexed());
  }
  if (start) {
    const p = curve.getPointAt(0);
    list.push(new THREE.SphereGeometry(radius(0), radial, 4).translate(p.x, p.y, p.z).toNonIndexed());
  }
  for (const part of list) part.deleteAttribute('uv');
  return list.length === 1 ? list[0] : mergePlain(list);
}

/** Склеить неокрашенные куски (position, normal) — потом красить целиком */
export function mergePlain(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const g of list) g.deleteAttribute('uv');
  const out = new THREE.BufferGeometry();
  let n = 0;
  for (const g of list) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const src of list) {
    const g = src.index ? src.toNonIndexed() : src;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/** Пятно варенья на поверхности: приплюснутая капля в точке, нормаль (nx, ny, nz) — наружу */
export function jamSpot(x: number, y: number, z: number, r: number, nx: number, ny: number, nz: number, hex: number = ARMY.jam): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 7, 4).scale(1, 1, 0.3);
  g.lookAt(new THREE.Vector3(nx, ny, nz));
  return colored(g.translate(x, y, z), hex);
}

/** Потёк варенья по точкам поверхности (сверху вниз) и капля на конце */
export function jamDrip(points: ReadonlyArray<readonly [number, number, number]>, r: number, hex: number = ARMY.jam): THREE.BufferGeometry {
  return colored(tube(points, (u) => r * (0.75 + 0.5 * u * u), 5, 5, true, false), hex);
}

/** Отражение по X (правая плеть из левой): масштаб −1 и обратный обход треугольников, иначе грани смотрят внутрь */
export function mirrorX(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.scale(-1, 1, 1);
  for (const name of Object.keys(g.attributes)) {
    const attr = g.getAttribute(name) as THREE.BufferAttribute;
    const n = attr.itemSize;
    const arr = attr.array as Float32Array;
    for (let t = 0; t + 2 < attr.count; t += 3) {
      for (let k = 0; k < n; k++) {
        const i1 = (t + 1) * n + k;
        const i2 = (t + 2) * n + k;
        const tmp = arr[i1];
        arr[i1] = arr[i2];
        arr[i2] = tmp;
      }
    }
    attr.needsUpdate = true;
  }
  return g;
}

/**
 * Плоский многоугольник (веер от центра) по точкам контура (x, y) — лицо тыквы, сердечки; map — посадить на
 * поверхность. Лицевая сторона — к +Z плоскости (x, y) при любом обходе контура; flip — наоборот (если map кладёт
 * плоскость так, что её +Z смотрит внутрь). Каждый треугольник веера мелко дробится (div × div) — ложится по кривой.
 */
export function fan(src: ReadonlyArray<readonly [number, number]>, map: (x: number, y: number, out: THREE.Vector3) => void, div = 4, flip = false): THREE.BufferGeometry {
  // обход против часовой (если смотреть с +Z), иначе развернуть
  let area = 0;
  for (let i = 0; i < src.length; i++) {
    const [x0, y0] = src[i];
    const [x1, y1] = src[(i + 1) % src.length];
    area += x0 * y1 - x1 * y0;
  }
  const outline = (area < 0) !== flip ? [...src].reverse() : src;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of outline) {
    cx += x;
    cy += y;
  }
  cx /= outline.length;
  cy /= outline.length;
  const pos: number[] = [];
  const v = new THREE.Vector3();
  // точка треугольника (c, a, b) по долям (i, j) из div: c + (a − c)·i/div + (b − c)·j/div
  const put = (ax: number, ay: number, bx: number, by: number, i: number, j: number) => {
    map(cx + ((ax - cx) * i + (bx - cx) * j) / div, cy + ((ay - cy) * i + (by - cy) * j) / div, v);
    pos.push(v.x, v.y, v.z);
  };
  for (let k = 0; k < outline.length; k++) {
    const [ax, ay] = outline[k];
    const [bx, by] = outline[(k + 1) % outline.length];
    for (let i = 0; i < div; i++) {
      for (let j = 0; i + j < div; j++) {
        put(ax, ay, bx, by, i, j);
        put(ax, ay, bx, by, i + 1, j);
        put(ax, ay, bx, by, i, j + 1);
        if (i + j + 2 <= div) {
          put(ax, ay, bx, by, i + 1, j);
          put(ax, ay, bx, by, i + 1, j + 1);
          put(ax, ay, bx, by, i, j + 1);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Полоса между двумя кривыми (верх и низ рта, трещина) по колонкам; map — посадить на поверхность */
export function strip(top: ReadonlyArray<readonly [number, number]>, bottom: ReadonlyArray<readonly [number, number]>, map: (x: number, y: number, out: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos: number[] = [];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i + 1 < top.length; i++) {
    map(top[i][0], top[i][1], v[0]);
    map(top[i + 1][0], top[i + 1][1], v[1]);
    map(bottom[i][0], bottom[i][1], v[2]);
    map(bottom[i + 1][0], bottom[i + 1][1], v[3]);
    // обход против часовой, если смотреть с +Z: верх-лево, низ-лево, верх-право; верх-право, низ-лево, низ-право
    pos.push(v[0].x, v[0].y, v[0].z, v[2].x, v[2].y, v[2].z, v[1].x, v[1].y, v[1].z);
    pos.push(v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z, v[3].x, v[3].y, v[3].z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Лента вдоль ломаной (x, y) снизу вверх шириной 2·w — трещина, прожилка; map — посадить на поверхность (лицом к +Z
 * плоскости (x, y)).
 */
export function ribbon(points: ReadonlyArray<readonly [number, number]>, w: number, map: (x: number, y: number, out: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos: number[] = [];
  const l0 = new THREE.Vector3();
  const r0 = new THREE.Vector3();
  const l1 = new THREE.Vector3();
  const r1 = new THREE.Vector3();
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const k0 = w * (1 - 0.6 * (i / (points.length - 1)));
    const k1 = w * (1 - 0.6 * ((i + 1) / (points.length - 1)));
    map(x0 - k0, y0, l0);
    map(x0 + k0, y0, r0);
    map(x1 - k1, y1, l1);
    map(x1 + k1, y1, r1);
    pos.push(l0.x, l0.y, l0.z, r0.x, r0.y, r0.z, l1.x, l1.y, l1.z);
    pos.push(r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, l1.x, l1.y, l1.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export { colored, merge };

// ------------------------------------------------------------ поза

const _pv = new THREE.Matrix4();

/**
 * Кость с поворотом и масштабом вокруг точки (px, py, pz) родителя, сдвинутой на (x, y, z):
 * m = parent × T(p + сдвиг) × R(YXZ) × S × T(−p). Без выделений памяти.
 */
export function setPivot(m: THREE.Matrix4, parent: THREE.Matrix4, px: number, py: number, pz: number, x: number, y: number, z: number,
  rx: number, ry: number, rz: number, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  setChildS(m, parent, px + x, py + y, pz + z, rx, ry, rz, sx, sy, sz);
  _pv.makeTranslation(-px, -py, -pz);
  return m.multiply(_pv);
}

/** Спрятать часть: крошечная (0,02 — не ноль, договор) в точке (x, y, z) внутри родителя */
export function hide(m: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number): THREE.Matrix4 {
  return setChildS(m, parent, x, y, z, 0, 0, 0, 0.02, 0.02, 0.02);
}

/** Шаг группы ног: смещение стоп по ходу (м, в осях модели) и подъём */
export interface GroupStep {
  dz: number;
  up: number;
  down: boolean;
}

export function newStep(): GroupStep {
  return { dz: 0, up: 0, down: true };
}

/**
 * Опора [0, duty): стопы едут назад ровно со скоростью тела (не скользят) — на len за опору; перенос — вперёд с
 * подъёмом lift. p — фаза походки группы.
 */
export function stepAt(p: number, duty: number, len: number, lift: number, out: GroupStep): GroupStep {
  const q = p - Math.floor(p);
  if (q < duty) {
    out.dz = len * (0.5 - q / duty);
    out.up = 0;
    out.down = true;
  } else {
    const u = (q - duty) / (1 - duty);
    out.dz = len * (smooth(u) - 0.5);
    out.up = lift * Math.sin(Math.PI * u);
    out.down = false;
  }
  return out;
}
