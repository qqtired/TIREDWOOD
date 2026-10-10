// Награды рыбалки (shared/fishstyle.ts) в 3D: сеты «Бывалый рыбак», «Капитан баркаса», «Хозяин глубин», кукан, сачок
// и питомцы на плече. Координаты тела, как в outfit3d.ts: макушка y = 1,58, лицо в −Z, φ = 0 — спина, φ = π — лицо,
// +X — правая сторона желейки (в правой руке удочка). Шапки и аксессуары гнутся вместе с телом шейдером (hatpose.ts),
// питомец — жёсткий узел, который каждый кадр встаёт в точку тела под собой (avatar.ts).
// Остров «Последний свет»: шапка и свитер смотрителя и тупик — из GLB (islegear.ts) в те же Wear и PetRider.
import * as THREE from 'three';
import { islePuffin, isleWear } from './islegear.ts';
import { BODY_H, bodyR, col, colTri, merge, tube, wear, wearOf, type Wear } from './outfit3d.ts';

type Geo = THREE.BufferGeometry;
type V3 = [number, number, number];

// ------------------------------------------------------------ точки на теле

const UP = new THREE.Vector3(0, 1, 0);

/** Точка над телом: направление φ, высота y, отступ off */
export function onBody(phi: number, y: number, off: number): THREE.Vector3 {
  const r = bodyR(y) + off;
  return new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi));
}

/** Нормаль тела наружу */
function bodyNormal(phi: number, y: number): THREE.Vector3 {
  const dr = (bodyR(y + 0.004) - bodyR(y - 0.004)) / 0.008;
  return new THREE.Vector3(Math.sin(phi), -dr, Math.cos(phi)).normalize();
}

/** Система вещи на теле: +Z — наружу, +Y — вверх по телу, +X — вправо для того, кто смотрит снаружи. */
function frameAt(phi: number, y: number, off: number, spin = 0): THREE.Matrix4 {
  const z = bodyNormal(phi, y);
  const yy = UP.clone().addScaledVector(z, -z.dot(UP)).normalize();
  const x = new THREE.Vector3().crossVectors(yy, z);
  const m = new THREE.Matrix4().makeBasis(x, yy, z);
  if (spin) m.multiply(new THREE.Matrix4().makeRotationZ(spin));
  return m.setPosition(onBody(phi, y, off));
}

/** Поставить вещь (её +Z — наружу) на тело */
function put(g: Geo, phi: number, y: number, off: number, spin = 0): Geo {
  return g.applyMatrix4(frameAt(phi, y, off, spin));
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** φ из точки (0 — спина, π — лицо), в [0, 2π) */
const phiOf = (x: number, z: number): number => (Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2);

/** Тонкая линия (строчка, кант, нить сетки): четыре грани вместо шести — треугольников вдвое меньше */
function thin(points: V3[], r: number, seg = 24): Geo {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, r, 4, false);
}

// ------------------------------------------------------------ оболочка по телу (жилет, роба, китель)

interface Shell {
  /** Низ, м */
  y0: number;
  /** Верхний край в направлении φ */
  top: (phi: number) => number;
  /** Половина выреза спереди (рад) на доле высоты t: 0 — застёгнуто */
  open: (t: number) => number;
  /** Отступ от тела на доле высоты t */
  off: (t: number) => number;
}

/** Точка оболочки: u — по кругу от правого края выреза через спину к левому, t — от низа к верху */
function shellAt(s: Shell, u: number, t: number): THREE.Vector3 {
  const o = s.open(t);
  const phi = Math.PI + o + u * (Math.PI * 2 - 2 * o);
  const y = s.y0 + t * (s.top(phi) - s.y0);
  return onBody(phi, y, s.off(t));
}

/** Поверхность оболочки (или её кусок u0…u1, t0…t1, приподнятый на lift — кокетка, планка) */
function shellGeo(s: Shell, seg = 48, rows = 10, u0 = 0, u1 = 1, t0 = 0, t1 = 1, lift = 0): Geo {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    for (let j = 0; j <= rows; j++) {
      const p = shellAt(s, lerp(u0, u1, i / seg), lerp(t0, t1, j / rows));
      if (lift) {
        const n = bodyNormal(phiOf(p.x, p.z), p.y);
        p.addScaledVector(n, lift);
      }
      pos.push(p.x, p.y, p.z);
    }
  }
  const at = (i: number, j: number) => i * (rows + 1) + j;
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rows; j++) {
      idx.push(at(i, j), at(i + 1, j), at(i, j + 1));
      idx.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Кант по краю оболочки: низ, верх (edge = 'hem' | 'top') или край выреза ('right' | 'left'); from…to — кусок края,
 * at — на какой доле высоты (для 'top' — не обязательно верх: нижний край кокетки)
 */
function shellEdge(s: Shell, edge: 'hem' | 'top' | 'right' | 'left', r: number, out = 0.004, n = 36, from = 0, to = 1, at = 1): Geo {
  const pts: V3[] = [];
  for (let k = 0; k <= n; k++) {
    const v = lerp(from, to, k / n);
    const [u, t] = edge === 'hem' ? [v, 0] : edge === 'top' ? [v, at] : edge === 'right' ? [0, v] : [1, v];
    const p = shellAt(s, u, t);
    const phi = phiOf(p.x, p.z);
    const q = onBody(phi, p.y, Math.hypot(p.x, p.z) - bodyR(p.y) + out);
    pts.push([q.x, q.y, q.z]);
  }
  return r < 0.008 ? thin(pts, r, n) : tube(pts, r, n);
}

/** Изогнутая накладка по телу: центр (φ, y), ширина w и высота h (м), отступ off, толщина d — с бортиками */
function patch(phi: number, y: number, w: number, h: number, off: number, d = 0.01, tilt = 0, nx = 6, ny = 4): Geo {
  const r = bodyR(y) + off;
  const pos: number[] = [];
  const idx: number[] = [];
  const P = (a: number, b: number, lift: number): THREE.Vector3 => {
    // наклон tilt — поворот накладки по поверхности (рад)
    const ax = (a - 0.5) * w;
    const by = (b - 0.5) * h;
    const lx = ax * Math.cos(tilt) - by * Math.sin(tilt);
    const ly = ax * Math.sin(tilt) + by * Math.cos(tilt);
    const yy = y + ly;
    // +lx: «вправо» для того, кто смотрит снаружи, — по росту φ (как +X в frameAt)
    return onBody(phi + lx / r, yy, off + lift);
  };
  const face = (lift: number) => {
    const base = pos.length / 3;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      const p = P(i / nx, j / ny, lift);
      pos.push(p.x, p.y, p.z);
    }
    return base;
  };
  const top = face(d);
  const at = (i: number, j: number) => top + i * (ny + 1) + j;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
  // бортики: обход края накладки
  const rim: Array<[number, number]> = [];
  for (let i = 0; i < nx; i++) rim.push([i / nx, 0]);
  for (let j = 0; j < ny; j++) rim.push([1, j / ny]);
  for (let i = nx; i > 0; i--) rim.push([i / nx, 1]);
  for (let j = ny; j > 0; j--) rim.push([0, j / ny]);
  const b0 = pos.length / 3;
  for (const [a, b] of rim) {
    const lo = P(a, b, -0.002);
    const hi = P(a, b, d);
    pos.push(lo.x, lo.y, lo.z, hi.x, hi.y, hi.z);
  }
  for (let k = 0; k < rim.length; k++) {
    const a = b0 + k * 2;
    const b = b0 + ((k + 1) % rim.length) * 2;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Отложной воротник по верхнему краю оболочки (u0…u1): от края вверх на rise, перегиб и вниз по одежде на fall(φ) */
function collar(s: Shell, u0: number, u1: number, rise: number, fall: (phi: number) => number, n = 36): { geo: Geo; edge: V3[] } {
  const pos: number[] = [];
  const idx: number[] = [];
  const edge: V3[] = [];
  const off = s.off(1);
  for (let i = 0; i <= n; i++) {
    const p = shellAt(s, lerp(u0, u1, i / n), 1);
    const phi = phiOf(p.x, p.z);
    for (const q of [onBody(phi, p.y - 0.008, off + 0.003), onBody(phi, p.y + rise, off + 0.014), onBody(phi, p.y - fall(phi), off + 0.016)]) pos.push(q.x, q.y, q.z);
    const c = onBody(phi, p.y - fall(phi), off + 0.018);
    edge.push([c.x, c.y, c.z]);
  }
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    idx.push(k, k + 3, k + 1, k + 3, k + 4, k + 1, k + 1, k + 4, k + 2, k + 4, k + 5, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, edge };
}

/** Лацкан вдоль края выреза (side 1 — край u = 0, −1 — край u = 1) от t0 до верха, шириной width(t) наружу от выреза */
function lapel(s: Shell, side: 1 | -1, t0: number, width: (t: number) => number, n = 14): { geo: Geo; edge: V3[] } {
  const pos: number[] = [];
  const idx: number[] = [];
  const edge: V3[] = [];
  for (let j = 0; j <= n; j++) {
    const t = lerp(t0, 1, j / n);
    const p = shellAt(s, side > 0 ? 0 : 1, t);
    const phi = phiOf(p.x, p.z);
    const off = s.off(t) + 0.007;
    const r = bodyR(p.y) + off;
    const a = onBody(phi, p.y, off);
    const b = onBody(phi + (side * width(t)) / r, p.y, off);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    edge.push([b.x, b.y, b.z]);
  }
  for (let j = 0; j < n; j++) {
    const k = j * 2;
    idx.push(k, k + 2, k + 1, k + 2, k + 3, k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, edge };
}

/** Кнопка или кнопка-кнопка: плоский цилиндр, ось — по нормали тела */
function button(phi: number, y: number, off: number, r: number, h = 0.012, seg = 12): Geo {
  return put(new THREE.CylinderGeometry(r, r, h, seg).rotateX(Math.PI / 2), phi, y, off + h / 2);
}

/** Склеить вещь: у самодельных поверхностей нет uv — снимаем его у всех, иначе части не склеятся */
function dress(parts: Geo[], metal: Geo[], y: number): Wear {
  const strip = (g: Geo): Geo => {
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    return g;
  };
  return wear(parts.map(strip), metal.map(strip), y);
}

/** Поверхность вращения по точкам (r, y) — для шапок */
function lathe(pts: Array<[number, number]>, seg = 36, phi0 = 0, len = Math.PI * 2): Geo {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phi0, len);
}

// ------------------------------------------------------------ «Бывалый рыбак»: жилет рыболова

const KHAKI = 0x7d8a4c;
const KHAKI_DARK = 0x5d6935;
const KHAKI_EDGE = 0x4a5429;

const VEST: Shell = {
  y0: 0.36,
  top: (phi) => 1.0 + 0.03 * Math.cos(phi),
  // спереди расстёгнут: внизу узко, к плечам шире — лицо и рука с удочкой свободны
  open: (t) => lerp(0.3, 1.2, smooth(0.25, 1, t)),
  off: (t) => 0.02 + 0.01 * Math.sin(Math.PI * t),
};

function anglerVest(): Wear {
  const parts: Geo[] = [];
  const metal: Geo[] = [];
  parts.push(col(shellGeo(VEST), KHAKI));
  // кокетка на плечах сзади — темнее, с кантом по нижнему краю
  parts.push(col(shellGeo(VEST, 36, 3, 0.2, 0.8, 0.8, 1, 0.006), KHAKI_DARK));
  parts.push(col(shellEdge(VEST, 'top', 0.007, 0.01, 36, 0.2, 0.8, 0.8), KHAKI_EDGE));
  // кант по низу, вырезу и плечам
  for (const e of ['hem', 'top', 'right', 'left'] as const) parts.push(col(shellEdge(VEST, e, 0.011, 0.004, e === 'hem' || e === 'top' ? 30 : 14), KHAKI_EDGE));
  // карманы: два больших на груди, два ниже — светлее жилета, с клапанами и кнопками
  const pocket = (phi: number, y: number, w: number, h: number) => {
    parts.push(col(patch(phi, y, w, h, 0.03, 0.014), 0x8d9a5a));
    parts.push(col(patch(phi, y + h / 2 - 0.018, w + 0.012, 0.04, 0.046, 0.008), KHAKI_DARK));
    metal.push(button(phi, y + h / 2 - 0.022, 0.054, 0.011, 0.006));
  };
  // большой карман на спине с молнией и D-кольцо под сачок на кокетке
  parts.push(col(patch(0, 0.6, 0.5, 0.3, 0.03, 0.012, 0, 10, 5), 0x8d9a5a));
  parts.push(col(patch(0, 0.745, 0.46, 0.012, 0.044, 0.004, 0, 10, 1), 0x2f3420));
  metal.push(put(new THREE.BoxGeometry(0.014, 0.03, 0.006), -0.17, 0.725, 0.05));
  metal.push(put(new THREE.TorusGeometry(0.022, 0.005, 6, 16, Math.PI * 1.25).rotateZ(-Math.PI * 0.125 + Math.PI), 0, 0.945, 0.045));
  for (const s of [-1, 1]) {
    pocket(Math.PI + s * 0.78, 0.7, 0.15, 0.13);
    pocket(Math.PI + s * 0.64, 0.47, 0.17, 0.12);
  }
  // нашивка с мушками (правая грудь) и карабин с блесной (левая)
  parts.push(col(patch(Math.PI - 0.95, 0.89, 0.1, 0.055, 0.03, 0.01), 0xe9dfc6));
  const flies = [0xd23a2a, 0xf2c230, 0x2a8c8c];
  flies.forEach((hex, i) => parts.push(col(put(new THREE.SphereGeometry(0.014, 8, 6).scale(1, 1.4, 0.8), Math.PI - 0.95 + (i - 1) * 0.06, 0.89, 0.045), hex)));
  metal.push(put(new THREE.TorusGeometry(0.018, 0.004, 6, 14), Math.PI + 0.98, 0.9, 0.045));
  parts.push(col(put(new THREE.SphereGeometry(1, 10, 8).scale(0.017, 0.035, 0.006), Math.PI + 0.98, 0.84, 0.046), 0xdfe4e8));
  parts.push(col(put(new THREE.SphereGeometry(0.008, 6, 5), Math.PI + 0.98, 0.868, 0.05), 0xd23a2a));
  return dress(parts, metal, 0.7);
}

// ------------------------------------------------------------ «Бывалый рыбак»: панама с блёснами

const SAND = 0xc4ad73;
const SAND_DARK = 0xa48d58;
const OLIVE = 0x4f5a2e;

function anglerPanama(): Wear {
  const parts: Geo[] = [];
  const metal: Geo[] = [];
  // тулья: мягкая, скруглённая, выше макушки на 8 см, сверху вмятина
  parts.push(col(lathe([[0.398, 1.33], [0.395, 1.4], [0.384, 1.48], [0.364, 1.55], [0.33, 1.61], [0.27, 1.648], [0.19, 1.662], [0.1, 1.652], [0.001, 1.645]]), SAND));
  // поля: провисают, с толщиной и подвёрнутым краем
  const brim: Array<[number, number]> = [[0.396, 1.334], [0.46, 1.312], [0.53, 1.284], [0.6, 1.254], [0.645, 1.234]];
  parts.push(col(lathe(brim, 48), SAND));
  parts.push(col(lathe(brim.map(([r, y]) => [r, y - 0.014] as [number, number]).reverse(), 48), SAND_DARK));
  parts.push(col(new THREE.TorusGeometry(0.645, 0.0085, 5, 48).rotateX(Math.PI / 2).translate(0, 1.227, 0), SAND_DARK));
  // строчка на полях
  for (const r of [0.47, 0.54, 0.6]) {
    const y = 1.334 - ((r - 0.396) / (0.645 - 0.396)) * 0.1;
    parts.push(col(new THREE.TorusGeometry(r, 0.0026, 3, 40).rotateX(Math.PI / 2).translate(0, y + 0.004, 0), 0x8a7444));
  }
  // лента
  parts.push(col(lathe([[0.401, 1.334], [0.4, 1.395]], 48), OLIVE));
  // люверсы по бокам тульи
  for (const s of [-1, 1]) for (const dz of [-0.06, 0.06]) {
    metal.push(new THREE.TorusGeometry(0.014, 0.0045, 6, 12).rotateY(Math.PI / 2).translate(s * 0.383, 1.49, dz));
  }
  // блесна-колебалка спереди справа: серебро, красная бусина, крючок
  const lure = (phi: number) => {
    const r = 0.405;
    const at = (dy: number, dr: number): V3 => [Math.sin(phi) * (r + dr), 1.366 + dy, Math.cos(phi) * (r + dr)];
    parts.push(col(new THREE.SphereGeometry(1, 12, 8).scale(0.022, 0.042, 0.007).rotateY(phi).translate(...at(-0.01, 0.01)), 0xe2e7eb));
    parts.push(col(new THREE.SphereGeometry(0.008, 6, 5).translate(...at(0.034, 0.008)), 0xd23a2a));
    metal.push(new THREE.TorusGeometry(0.008, 0.002, 4, 10, Math.PI * 1.3).rotateY(phi).translate(...at(-0.058, 0.012)));
  };
  lure(Math.PI - 0.42);
  // воблер спереди слева: зелёная спинка, жёлтое брюшко, красная губа
  {
    const phi = Math.PI + 0.36;
    const r = 0.41;
    const g = new THREE.SphereGeometry(1, 12, 8).scale(0.045, 0.016, 0.012);
    const body = colTri(g, (_x, y) => (y > 0.004 ? 0x3f8a43 : y > -0.006 ? 0xe9d24a : 0xf2e7a8));
    body.rotateZ(0.25).rotateY(phi + Math.PI / 2).translate(Math.sin(phi) * r, 1.37, Math.cos(phi) * r);
    parts.push(body);
    parts.push(col(new THREE.BoxGeometry(0.012, 0.004, 0.014).rotateZ(0.25).rotateY(phi + Math.PI / 2)
      .translate(Math.sin(phi) * r + Math.cos(phi) * 0.05, 1.38, Math.cos(phi) * r - Math.sin(phi) * 0.05), 0xd23a2a));
  }
  // перо мушки сбоку слева — торчит над лентой назад
  {
    const phi = Math.PI + 1.15;
    const r = 0.41;
    const feather = colTri(new THREE.SphereGeometry(1, 10, 8).scale(0.016, 0.1, 0.004), (_x, y) => (y > 0.06 ? 0x5a2d1a : y > -0.05 ? 0xd5672a : 0xf2c230));
    feather.translate(0, 0.08, 0).rotateZ(0.5).rotateY(phi + Math.PI / 2).translate(Math.sin(phi) * r, 1.38, Math.cos(phi) * r);
    parts.push(feather);
    parts.push(col(new THREE.SphereGeometry(0.013, 8, 6).translate(Math.sin(phi) * (r + 0.01), 1.37, Math.cos(phi) * (r + 0.01)), 0xd23a2a));
  }
  return dress(parts, metal, 1.42);
}

// ------------------------------------------------------------ «Капитан баркаса»: зюйдвестка и штормовка

const OIL_Y = 0xf2bf1d;
const OIL_DARK = 0xd09b10;
const TOGGLE = 0x1f2c50;

/** Поля шляпы по сетке: inner — радиус у тульи на высоте y0; width(φ) и drop(φ) — ширина и провис края */
function brimGrid(inner: number, y0: number, width: (phi: number) => number, drop: (phi: number) => number, seg = 48, rows = 5, thick = 0.012): { top: Geo; bottom: Geo; edge: Geo; at: (phi: number, s: number) => V3 } {
  const at = (phi: number, s: number): V3 => {
    const r = inner + s * width(phi);
    // край загибается вниз колоколом: у тульи почти горизонтально, к краю круче
    return [r * Math.sin(phi), y0 - drop(phi) * (0.35 * s + 0.65 * s * s) - 0.01 * s * s, r * Math.cos(phi)];
  };
  const surf = (dy: number, flip: boolean): Geo => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= seg; i++) for (let j = 0; j <= rows; j++) {
      const [x, y, z] = at((i / seg) * Math.PI * 2, j / rows);
      pos.push(x, y + dy, z);
    }
    const id = (i: number, j: number) => i * (rows + 1) + j;
    for (let i = 0; i < seg; i++) for (let j = 0; j < rows; j++) {
      if (flip) idx.push(id(i, j), id(i, j + 1), id(i + 1, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1));
      else idx.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const edgePts: V3[] = [];
  for (let i = 0; i < seg; i++) {
    const [x, y, z] = at((i / seg) * Math.PI * 2, 1);
    edgePts.push([x, y - thick / 2, z]);
  }
  const edge = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePts.map((p) => new THREE.Vector3(...p)), true), seg, thick * 0.7, 5, true);
  return { top: surf(0, false), bottom: surf(-thick, true), edge, at };
}

function souwester(): Wear {
  const parts: Geo[] = [];
  // тулья: низкая и круглая, шесть клиньев со строчкой, пуговка наверху
  const crown: Array<[number, number]> = [[0.392, 1.33], [0.389, 1.39], [0.372, 1.45], [0.338, 1.51], [0.285, 1.56], [0.205, 1.597], [0.105, 1.616], [0.001, 1.62]];
  parts.push(col(lathe(crown, 36), OIL_Y));
  for (let k = 0; k < 6; k++) {
    const phi = (k / 6) * Math.PI * 2 + 0.3;
    const pts: V3[] = crown.slice(1, -1).map(([r, y]) => [(r + 0.004) * Math.sin(phi), y, (r + 0.004) * Math.cos(phi)]);
    pts.push([0, 1.624, 0]);
    parts.push(col(thin(pts, 0.003, 10), OIL_DARK));
  }
  parts.push(col(new THREE.SphereGeometry(0.018, 10, 6).scale(1, 0.6, 1).translate(0, 1.622, 0), OIL_DARK));
  // поля: спереди узкие и чуть загнуты вверх, по бокам опускаются, сзади длинные — вода стекает за воротник
  const k = (phi: number) => (1 + Math.cos(phi)) / 2;
  const b = brimGrid(0.39, 1.33, (phi) => 0.075 + 0.225 * k(phi) ** 1.3, (phi) => -0.03 + 0.33 * k(phi) ** 1.6, 40, 4);
  parts.push(col(b.top, OIL_Y), col(b.bottom, OIL_DARK), col(b.edge, OIL_DARK));
  for (const s of [0.45, 0.8]) {
    const stitch: V3[] = [];
    for (let i = 0; i <= 40; i++) {
      const [x, y, z] = b.at((i / 40) * Math.PI * 2, s);
      stitch.push([x, y + 0.004, z]);
    }
    parts.push(col(thin(stitch, 0.0025, 40), OIL_DARK));
  }
  parts.push(col(lathe([[0.395, 1.33], [0.394, 1.365]], 36), OIL_DARK));
  // завязки по бокам: свободно свисают, на концах узелки
  for (const s of [-1, 1]) {
    const phi = Math.PI / 2 * s + Math.PI * 0.08 * s;
    const pts: V3[] = [];
    for (let i = 0; i <= 8; i++) {
      const y = 1.31 - i * 0.03;
      const p = onBody(phi, y, 0.018 + 0.004 * i);
      pts.push([p.x, p.y, p.z - 0.01 * i]);
    }
    parts.push(col(tube(pts, 0.005, 16), 0x6b5526));
    const e = pts[pts.length - 1];
    parts.push(col(new THREE.SphereGeometry(0.012, 8, 6).translate(e[0], e[1], e[2]), 0x6b5526));
  }
  return dress(parts, [], 1.42);
}

const OIL_SHADE = 0xe2aa12;

const OILSKIN: Shell = {
  y0: 0.2,
  // круглый вырез: спереди под ртом, сзади до плеч
  top: (phi) => 0.95 + 0.04 * Math.cos(phi),
  open: () => 0,
  off: (t) => 0.024 + 0.008 * Math.sin(Math.PI * t),
};

function oilskin(): Wear {
  const parts: Geo[] = [];
  parts.push(col(shellGeo(OILSKIN, 56, 12), OIL_Y));
  parts.push(col(shellEdge(OILSKIN, 'hem', 0.012, 0.004, 48), OIL_DARK));
  // кокетка на плечах сзади, со строчкой по нижнему краю
  parts.push(col(shellGeo(OILSKIN, 28, 3, 0.2, 0.8, 0.78, 1, 0.006), OIL_SHADE));
  parts.push(col(shellEdge(OILSKIN, 'top', 0.006, 0.01, 28, 0.2, 0.8, 0.78), OIL_DARK));
  // отложной воротник тёмно-синего вельвета, спереди — уголками
  const c = collar(OILSKIN, 0.035, 0.965, 0.03, (phi) => 0.06 + 0.035 * Math.max(0, -Math.cos(phi)) ** 3);
  parts.push(col(c.geo, TOGGLE), col(thin(c.edge, 0.005, 40), 0x141c36));
  // планка с клыками-застёжками на петлях
  const top = OILSKIN.top(Math.PI);
  parts.push(col(patch(Math.PI, (0.2 + top) / 2, 0.075, top - 0.2, 0.034, 0.008, 0, 2, 12), OIL_SHADE));
  for (const y of [0.3, 0.43, 0.56, 0.69, 0.82]) {
    parts.push(col(put(new THREE.CylinderGeometry(0.009, 0.007, 0.06, 8).rotateZ(Math.PI / 2), Math.PI, y, 0.052), TOGGLE));
    parts.push(col(put(new THREE.TorusGeometry(0.016, 0.0035, 5, 12).scale(1.4, 0.7, 1), Math.PI + 0.06, y, 0.046), 0x3a2f1e));
  }
  // два накладных кармана внизу: клапан и пуговица
  for (const s of [-1, 1]) {
    const phi = Math.PI + s * 0.8;
    parts.push(col(patch(phi, 0.4, 0.17, 0.15, 0.033, 0.012), OIL_Y));
    parts.push(col(patch(phi, 0.475, 0.185, 0.05, 0.046, 0.008), OIL_SHADE));
    parts.push(col(button(phi, 0.468, 0.054, 0.011, 0.006), TOGGLE));
  }
  return dress(parts, [], 0.7);
}

// ------------------------------------------------------------ «Хозяин глубин»: фуражка и китель

const NAVY = 0x1b2a4f;
const NAVY_DARK = 0x121c36;
const CAP_WHITE = 0xf6f5f0;

function captainCap(): Wear {
  const parts: Geo[] = [];
  const metal: Geo[] = [];
  // тулья: белый верх, чуть приподнят спереди («седло»)
  const tilt = (g: Geo): Geo => g.translate(0, -1.47, 0).rotateX(0.07).translate(0, 1.47, 0);
  parts.push(col(lathe([[0.372, 1.36], [0.37, 1.47]], 36), 0x141826));
  parts.push(tilt(col(lathe([[0.366, 1.468], [0.4, 1.522], [0.445, 1.565], [0.46, 1.58]], 36), CAP_WHITE)));
  parts.push(tilt(col(lathe([[0.46, 1.58], [0.457, 1.592], [0.38, 1.61], [0.2, 1.622], [0.001, 1.625]], 36), CAP_WHITE)));
  parts.push(tilt(col(new THREE.TorusGeometry(0.46, 0.007, 5, 48).rotateX(Math.PI / 2).translate(0, 1.58, 0), NAVY)));
  // козырёк: чёрный лаковый сверху, зелёный снизу, золотые дубовые листья по краю
  const visor = (dy: number, flip: boolean): Geo => {
    const pos: number[] = [];
    const idx: number[] = [];
    const seg = 24;
    const rows = 4;
    for (let i = 0; i <= seg; i++) for (let j = 0; j <= rows; j++) {
      const a = (i / seg - 0.5) * 2.4;
      const s = j / rows;
      const r = 0.372 + s * 0.17 * Math.cos((a / 1.2) * (Math.PI / 2)) ** 0.6;
      pos.push(r * Math.sin(Math.PI + a), 1.374 - s * 0.075 - s * s * 0.012 + dy, r * Math.cos(Math.PI + a));
    }
    const id = (i: number, j: number) => i * (rows + 1) + j;
    for (let i = 0; i < seg; i++) for (let j = 0; j < rows; j++) {
      if (flip) idx.push(id(i, j), id(i, j + 1), id(i + 1, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1));
      else idx.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  parts.push(col(visor(0, false), 0x0b0d12), col(visor(-0.008, true), 0x1f3b2c));
  for (const a of [-0.55, -0.32, -0.1, 0.1, 0.32, 0.55]) {
    const r = 0.372 + 0.155 * Math.cos((a / 1.2) * (Math.PI / 2)) ** 0.6;
    metal.push(new THREE.SphereGeometry(1, 8, 6).scale(0.022, 0.004, 0.009).rotateY(a + (a > 0 ? 0.5 : -0.5))
      .translate(r * Math.sin(Math.PI + a), 1.374 - 0.072 + 0.003, r * Math.cos(Math.PI + a)));
  }
  // золотой шнур над козырьком с пуговками по бокам
  for (const y of [1.392, 1.405]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI - 1.15 + (i / 16) * 2.3;
      pts.push([0.379 * Math.sin(a), y, 0.379 * Math.cos(a)]);
    }
    metal.push(thin(pts, 0.004, 24));
  }
  for (const s of [-1, 1]) metal.push(new THREE.SphereGeometry(0.013, 8, 6).translate(0.379 * Math.sin(Math.PI + s * 1.15), 1.398, 0.379 * Math.cos(Math.PI + s * 1.15)));
  // «краб»: якорь в лавровом венке на чёрном овале — на околыше спереди; крупно, чтобы читался издалека
  const z = -0.381;
  const by = 1.418;
  const badge: Geo[] = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const a = -1.2 + i * 0.42;
      badge.push(new THREE.SphereGeometry(1, 6, 4).scale(0.009, 0.005, 0.003).rotateZ(a * s + s * Math.PI / 2)
        .translate(s * 0.042 * Math.cos(a), 0.042 * Math.sin(a) * 0.9 - 0.004, -0.003));
    }
  }
  badge.push(new THREE.BoxGeometry(0.006, 0.048, 0.005).translate(0, -0.002, -0.004));
  badge.push(new THREE.BoxGeometry(0.03, 0.005, 0.005).translate(0, 0.014, -0.004));
  badge.push(new THREE.TorusGeometry(0.006, 0.0022, 5, 10).translate(0, 0.026, -0.004));
  badge.push(new THREE.TorusGeometry(0.019, 0.003, 5, 14, Math.PI).rotateZ(Math.PI).translate(0, -0.012, -0.004));
  badge.push(new THREE.ConeGeometry(0.006, 0.01, 4).rotateZ(Math.PI * 0.75).translate(-0.019, -0.012, -0.004));
  badge.push(new THREE.ConeGeometry(0.006, 0.01, 4).rotateZ(-Math.PI * 0.75).translate(0.019, -0.012, -0.004));
  for (const g of badge) metal.push(g.scale(1.3, 1.3, 1).translate(0, by, z));
  parts.push(col(new THREE.SphereGeometry(1, 12, 8).scale(0.072, 0.064, 0.006).translate(0, by, z + 0.002), 0x0c0e16));
  return dress(parts, metal, 1.45);
}

const TUNIC_V = 0.55;

const TUNIC: Shell = {
  y0: 0.2,
  top: (phi) => 1.04 + 0.03 * Math.cos(phi),
  // двубортный: застёгнут до груди, выше — вырез с лацканами, в нём рубашка и галстук
  open: (t) => (t < TUNIC_V ? 0 : 0.55 * smooth(TUNIC_V, 1, t) ** 0.8),
  off: (t) => 0.026 + 0.006 * Math.sin(Math.PI * t),
};

function tunic(): Wear {
  const parts: Geo[] = [];
  const metal: Geo[] = [];
  const WHITE = 0xf4f1ea;
  parts.push(col(shellGeo(TUNIC, 56, 12), NAVY));
  // рубашка в вырезе, воротничок уголками и галстук
  parts.push(col(patch(Math.PI, 0.79, 0.52, 0.26, 0.012, 0.004, 0, 12, 6), WHITE));
  for (const s of [-1, 1]) parts.push(col(put(new THREE.ConeGeometry(0.034, 0.07, 3).rotateZ(Math.PI).scale(1, 1, 0.3), Math.PI + s * 0.075, 0.9, 0.022, s * 0.45), WHITE));
  parts.push(col(patch(Math.PI, 0.76, 0.045, 0.24, 0.02, 0.006, 0, 2, 6), 0x15161c));
  parts.push(col(put(new THREE.BoxGeometry(0.038, 0.032, 0.02), Math.PI, 0.885, 0.026), 0x15161c));
  // лацканы и отложной воротник, по краю выреза — тёмный кант, по низу — золотой
  const lw = (t: number) => 0.075 * Math.sin((Math.PI / 2) * ((t - TUNIC_V) / (1 - TUNIC_V))) ** 0.8;
  for (const side of [1, -1] as const) {
    const l = lapel(TUNIC, side, TUNIC_V, lw);
    parts.push(col(l.geo, 0x22345e), col(thin(l.edge, 0.005, 14), NAVY_DARK));
  }
  for (const e of ['right', 'left'] as const) parts.push(col(shellEdge(TUNIC, e, 0.009, 0.01, 24, TUNIC_V, 1), NAVY_DARK));
  const c = collar(TUNIC, 0, 1, 0.022, (phi) => 0.045 + 0.02 * Math.max(0, -Math.cos(phi)) ** 2);
  parts.push(col(c.geo, NAVY), col(thin(c.edge, 0.005, 40), NAVY_DARK));
  metal.push(shellEdge(TUNIC, 'hem', 0.008, 0.006, 48));
  // две колонки латунных пуговиц
  for (const s of [-1, 1]) for (const y of [0.34, 0.45, 0.56]) metal.push(button(Math.PI + s * 0.2, y, 0.03, 0.016, 0.01));
  // эполеты: тёмный погон в золотой рамке со звездой и золотая бахрома вниз по плечу (попугай сидит позади левой)
  for (const phi of [1.72, -1.72]) {
    const y = 0.94;
    const r = bodyR(y) + 0.04;
    parts.push(col(patch(phi, y, 0.105, 0.095, 0.034, 0.012, 0, 4, 3), NAVY_DARK));
    const rim: V3[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const p = onBody(phi + (0.054 * Math.cos(a)) / r, y + 0.049 * Math.sin(a), 0.047);
      rim.push([p.x, p.y, p.z]);
    }
    metal.push(thin(rim, 0.0055, 20));
    metal.push(put(new THREE.OctahedronGeometry(0.016).scale(1, 1, 0.4), phi, y + 0.004, 0.048));
    // бахрома чуть расходится книзу
    for (let k = 0; k < 9; k++) {
      const dx = -0.044 + (k / 8) * 0.088;
      const p0 = onBody(phi + dx / r, y - 0.045, 0.046);
      const p1 = onBody(phi + (dx * 1.25) / r, y - 0.115, 0.054);
      metal.push(thin([[p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z]], 0.0058, 1));
    }
  }
  // сзади: хлястик на двух пуговицах и шлица
  parts.push(col(patch(0, 0.42, 0.34, 0.05, 0.032, 0.01, 0, 8, 1), NAVY_DARK));
  for (const s of [-1, 1]) metal.push(button(s * 0.28, 0.42, 0.042, 0.015, 0.008));
  const v0 = onBody(0, 0.2, 0.031);
  const v1 = onBody(0, 0.395, 0.033);
  parts.push(col(tube([[v0.x, v0.y, v0.z], [v1.x, v1.y, v1.z]], 0.004, 4), NAVY_DARK));
  // нагрудный карман слева: прорезь и уголок платка
  parts.push(col(patch(Math.PI + 0.6, 0.66, 0.13, 0.014, 0.036, 0.006, 0, 4, 1), NAVY_DARK));
  parts.push(col(put(new THREE.ConeGeometry(0.022, 0.04, 3).scale(1, 1, 0.3), Math.PI + 0.6, 0.685, 0.036, 0.15), WHITE));
  return dress(parts, metal, 0.7);
}

// ------------------------------------------------------------ кукан с уловом и сачок

/** Ремень на поясе (на него вешаются кукан и сачок) с пряжкой спереди */
function belt(parts: Geo[], metal: Geo[]): void {
  parts.push(col(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 48 }, (_, i) => onBody((i / 48) * Math.PI * 2, 0.56, 0.012)), true), 96, 0.014, 6, true).scale(1, 1.6, 1).translate(0, -0.56 * 0.6, 0), 0x5a3a22));
  metal.push(put(new THREE.TorusGeometry(0.024, 0.006, 4, 4).rotateZ(Math.PI / 4).scale(1.2, 1, 1), Math.PI, 0.56, 0.03));
}

/** Рыбка головой вверх (рот — на шнуре в начале координат): длина len, спинка back, брюшко belly, плавники fin */
function hangingFish(len: number, back: number, belly: number, fin: number): Geo[] {
  const body = colTri(new THREE.SphereGeometry(1, 12, 8).scale(len * 0.22, len * 0.5, len * 0.1).translate(0, -len * 0.5, 0), (x) => (x > len * 0.02 ? back : belly));
  const tail = col(new THREE.ConeGeometry(len * 0.16, len * 0.24, 4).scale(1, 1, 0.25).translate(0, -len * 1.06, 0), fin);
  const dorsal = col(new THREE.ConeGeometry(len * 0.06, len * 0.3, 3).scale(1, 1, 0.3).rotateZ(-Math.PI / 2).translate(len * 0.2, -len * 0.45, 0), fin);
  const eye = col(new THREE.SphereGeometry(len * 0.035, 6, 4).translate(len * 0.05, -len * 0.12, len * 0.08), 0x111111);
  return [body, tail, dorsal, eye];
}

function kukan(): Wear {
  const parts: Geo[] = [];
  const metal: Geo[] = [];
  belt(parts, metal);
  // на правом боку (левое плечо — для питомца): шнур от кольца на ремне, на нём три рыбы веером
  const phi = Math.PI / 2;
  const ring = onBody(phi, 0.545, 0.03);
  const fish: Array<[number, number, number, number, number, number]> = [
    // высота рта, сдвиг по φ, длина, спина, брюхо, плавник: ставрида, бычок, кефаль
    [0.5, -0.19, 0.3, 0x6f8c9a, 0xe4ebef, 0xb8c4cc],
    [0.47, 0, 0.24, 0x7a5a36, 0xc9b48a, 0x5e4426],
    [0.49, 0.19, 0.34, 0x5d7a74, 0xdfe5e2, 0x9db0aa],
  ];
  for (const [y, dphi, len, back, belly, fin] of fish) {
    const at = onBody(phi + dphi, y, 0.055);
    parts.push(col(tube([[ring.x, ring.y, ring.z], [at.x, at.y + 0.012, at.z]], 0.004, 4), 0xd8c9a0));
    // бок рыбы — наружу, хвосты расходятся веером
    for (const g of hangingFish(len, back, belly, fin)) parts.push(g.rotateZ(dphi * 0.8).rotateY(phi + dphi).translate(at.x, at.y, at.z));
  }
  metal.push(put(new THREE.TorusGeometry(0.016, 0.0045, 5, 12), phi, 0.56, 0.028));
  return dress(parts, metal, 0.5);
}

function landingNet(): Wear {
  const parts: Geo[] = [];
  const metal: Geo[] = [];
  belt(parts, metal);
  // деревянный сачок-капля на левом бедре: карабин на ремне, короткая ручка вверх, обруч и сетка вниз;
  // левое плечо с питомцем выше — не мешает
  const m = frameAt(-1.62, 0.56, 0.062, 0.14);
  const P = (x: number, y: number, z: number): V3 => {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(m);
    return [v.x, v.y, v.z];
  };
  const H = 0.1;
  const top = -H;
  const hoop = (a: number): THREE.Vector3 => {
    const k = (1 - Math.cos(a)) / 2;
    return new THREE.Vector3(0.12 * Math.sin(a) * k ** 0.35, top - 0.27 * k, 0);
  };
  const ring: V3[] = [];
  for (let i = 0; i <= 40; i++) {
    const p = hoop((i / 40) * Math.PI * 2);
    ring.push(P(p.x, p.y, p.z));
  }
  parts.push(col(tube(ring, 0.01, 40), 0xb07a3c));
  // ручка: светлое дерево и пробковая рукоять, на конце — кожаная петля на карабине
  parts.push(col(tube([P(0, top, 0), P(0, top + 0.06, 0.004)], 0.012, 4), 0xb07a3c));
  parts.push(col(tube([P(0, top + 0.06, 0.004), P(0, -0.02, 0.008)], 0.014, 4), 0xc89a62));
  parts.push(col(new THREE.TorusGeometry(0.016, 0.004, 5, 12).applyMatrix4(m), 0x5a3a22));
  metal.push(new THREE.TorusGeometry(0.013, 0.0035, 5, 12).rotateY(Math.PI / 2).translate(0, 0.012, 0.006).applyMatrix4(m));
  // сетка: нити от обруча к донышку, висит вниз и наружу; три поперечных кольца
  const bottom = new THREE.Vector3(0, top - 0.33, 0.1);
  const mesh = 0x2f5b3a;
  for (let k = 1; k < 12; k++) {
    const rim = hoop((k / 12) * Math.PI * 2);
    const mid = rim.clone().lerp(bottom, 0.5).add(new THREE.Vector3(0, -0.015, 0.025));
    parts.push(col(thin([rim, mid, bottom].map((p) => P(p.x, p.y, p.z)), 0.0034, 6), mesh));
  }
  for (const f of [0.3, 0.55, 0.8]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 24; i++) {
      const p = hoop((i / 24) * Math.PI * 2).lerp(bottom, f).add(new THREE.Vector3(0, -0.015 * Math.sin(Math.PI * f), 0.025 * Math.sin(Math.PI * f)));
      pts.push(P(p.x, p.y, p.z));
    }
    parts.push(col(thin(pts, 0.003, 20), mesh));
  }
  return dress(parts, metal, 0.5);
}

// ------------------------------------------------------------ питомцы на плече

/** Насест: левое плечо (справа — удочка), чуть позади; ниже полей панамы и зюйдвестки */
const PERCH_PHI = -1.42;
const PERCH_Y = 1.0;
/** Лапы над телом: тело выше сужается к макушке, птица не должна в него уходить */
const PERCH_OFF = 0.03;
/** На куртках с воротником лапы выше: воротник лежит на плече */
const PERCH_LIFT: Record<string, number> = { oilskin: 0.016, tunic: 0.018, keeper: 0.012 };

interface PetDef {
  geo: Geo | null;
  metal: Geo | null;
  /** Куда смотрит: чуть наружу от лица */
  yaw: number;
  /** Насколько оглядывается, рад */
  look: number;
}

/** Эллипсоид (полуоси), повёрнутый по X (наклон вперёд) и сдвинутый в (x, y, z) */
function blob(rx: number, ry: number, rz: number, x: number, y: number, z: number, pitch = 0, seg = 12): Geo {
  return new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4)).scale(rx, ry, rz).rotateX(pitch).translate(x, y, z);
}

/** Клюв: конус длиной len вперёд (−Z), кончик загнут вниз на hook */
function beak(r: number, len: number, hook: number): Geo {
  const g = new THREE.ConeGeometry(r, len, 8, 4).rotateX(-Math.PI / 2).translate(0, 0, -len / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, -p.getZ(i) / len);
    p.setY(i, p.getY(i) - hook * t * t);
  }
  g.computeVertexNormals();
  return g;
}

/** Чайка: белая, серая спина и крылья с чёрными кончиками, жёлтый клюв с красной точкой, жёлтые лапы */
function gull(): PetDef {
  const white = 0xf6f6f1;
  const grey = 0xaab4bd;
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    parts.push(col(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6).translate(s * 0.02, 0.025, 0.005), 0xe7bf45));
    parts.push(col(blob(0.016, 0.005, 0.026, s * 0.021, 0.004, -0.012), 0xe7bf45));
  }
  // тело: спина серая, грудь белая
  parts.push(colTri(blob(0.056, 0.058, 0.1, 0, 0.1, 0.01, -0.3, 14), (_x, y, z) => (y > 0.115 + z * 0.3 ? grey : white)));
  // сложенные крылья по бокам: серые, кончики чёрные с белыми пятнышками
  for (const s of [-1, 1]) {
    parts.push(colTri(blob(0.02, 0.045, 0.11, s * 0.047, 0.118, 0.035, -0.22), (_x, y, z) => (z > 0.105 ? (z > 0.125 && y > 0.12 ? white : 0x1b1c20) : grey)));
  }
  parts.push(col(blob(0.034, 0.012, 0.05, 0, 0.115, 0.11, -0.25), white));
  // голова, глаза, клюв с красной точкой
  parts.push(col(blob(0.04, 0.042, 0.046, 0, 0.19, -0.07, 0, 14), white));
  for (const s of [-1, 1]) parts.push(col(new THREE.SphereGeometry(0.0075, 6, 5).translate(s * 0.032, 0.2, -0.09), 0x101114));
  parts.push(col(beak(0.012, 0.06, 0.012).translate(0, 0.186, -0.104), 0xf2c230));
  parts.push(col(new THREE.SphereGeometry(0.005, 6, 4).translate(0, 0.176, -0.145), 0xd23a2a));
  return { geo: merge(parts), metal: null, yaw: 0.28, look: 0.6 };
}

/** Попугай-ара: красный, на крыльях жёлтая полоса и синие маховые, белые щёки, светлый крючковатый клюв, длинный хвост */
function parrot(): PetDef {
  const red = 0xd8262c;
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    parts.push(col(new THREE.CylinderGeometry(0.007, 0.007, 0.035, 6).translate(s * 0.022, 0.018, 0), 0x50545a));
    parts.push(col(blob(0.014, 0.006, 0.022, s * 0.022, 0.004, -0.004), 0x50545a));
  }
  parts.push(col(blob(0.056, 0.078, 0.064, 0, 0.11, 0.012, -0.45, 14), red));
  for (const s of [-1, 1]) {
    parts.push(colTri(blob(0.021, 0.06, 0.085, s * 0.049, 0.11, 0.035, -0.55), (_x, y, z) => {
      const k = y - z * 0.6;
      return k > 0.115 ? red : k > 0.09 ? 0xf4c430 : k > 0.078 ? 0x3aa05a : 0x2a5fd0;
    }));
  }
  // хвост: три длинных пера вниз-назад и наружу (к −X), красные с синими концами
  for (const [dx, len, w] of [[-0.012, 0.27, 0.017], [0.008, 0.24, 0.015], [-0.03, 0.22, 0.014]] as const) {
    const g = colTri(blob(w, len / 2, 0.006, 0, -len / 2, 0, 0, 8), (_x, y) => (y < -len * 0.62 ? 0x2a5fd0 : red));
    parts.push(g.rotateX(0.62).rotateZ(-0.32).translate(dx, 0.07, 0.07));
  }
  // голова: красная, белые щёки, чёрные глаза
  parts.push(col(blob(0.043, 0.045, 0.046, 0, 0.2, -0.03, 0, 14), red));
  for (const s of [-1, 1]) {
    parts.push(col(blob(0.006, 0.024, 0.026, s * 0.037, 0.198, -0.052), 0xf4efe8));
    parts.push(col(new THREE.SphereGeometry(0.007, 6, 5).translate(s * 0.041, 0.206, -0.05), 0x101114));
  }
  // клюв: верх светлый крючком, низ тёмный
  parts.push(col(beak(0.02, 0.05, 0.035).translate(0, 0.198, -0.068), 0xece2cc));
  parts.push(col(blob(0.014, 0.01, 0.018, 0, 0.176, -0.078), 0x2a2a2c));
  return { geo: merge(parts), metal: null, yaw: 0.28, look: 0.32 };
}

const PETS: Record<string, () => PetDef> = {
  gull,
  parrot,
  // тупик — узлы из GLB (islegear.ts): голова, веки, крылья, мойва в клюве; здесь — только как оглядывается
  puffin: () => ({ geo: null, metal: null, yaw: 0.28, look: 0.55 }),
};

/** Узлы тупика, которые двигает код (как в GLB: puffin_body, head, lid_L/R, capelin, wing_L/R) */
interface PuffinParts {
  body: THREE.Object3D;
  head: THREE.Object3D;
  lids: THREE.Object3D[];
  capelin: THREE.Object3D;
  wings: [THREE.Object3D, THREE.Object3D];
}
const petCache = new Map<string, PetDef | null>();

function petDef(key: string): PetDef | null {
  if (!petCache.has(key)) petCache.set(key, Object.hasOwn(PETS, key) ? PETS[key]() : null);
  return petCache.get(key)!;
}

/** Геометрия питомца (для проверок): null — такого нет */
export function petGeometry(key: string): Geo | null {
  return petDef(key)?.geo ?? null;
}

/**
 * Питомец на плече: жёсткий узел в squashNode (бег, прыжок, сидит, танцует — вместе с телом). Каждый кадр встаёт в
 * точку тела под лапами тем же преобразованием, что шейдер тела (качание, наклон, дрожь от удара), и оглядывается.
 */
export class PetRider {
  readonly node = new THREE.Group();
  private readonly geo: THREE.Mesh;
  private readonly metal: THREE.Mesh;
  private def: PetDef | null = null;
  /** Точка тела под лапами (координаты тела) */
  private readonly perch = onBody(PERCH_PHI, PERCH_Y, PERCH_OFF);
  private yaw = 0;
  private target = 0;
  private nextLook = 0;
  private nod = 0;
  private readonly mat: THREE.Material;
  /** Тупик: своя копия узлов GLB на эту желейку (геометрии общие), заводится при первом тупике */
  private rig: THREE.Object3D | null = null;
  private parts: PuffinParts | null = null;
  private blinkAt = 0;
  private blinkT = -1;
  /** С поимки рыбы хозяином, с (−1 — нет) */
  private cheerT = -1;

  constructor(mat: THREE.Material, metalMat: THREE.Material) {
    this.mat = mat;
    this.geo = new THREE.Mesh(undefined, mat);
    this.metal = new THREE.Mesh(undefined, metalMat);
    this.node.add(this.geo, this.metal);
    this.node.rotation.order = 'YXZ';
    this.node.visible = false;
  }

  /** Кто сидит на плече: ключ слота s, «none» — никого; acc — что надето (на воротник лапы ставим выше) */
  set(key: string, acc = 'none'): void {
    const d = petDef(key);
    this.def = d;
    this.perch.copy(onBody(PERCH_PHI, PERCH_Y, PERCH_OFF + (Object.hasOwn(PERCH_LIFT, acc) ? PERCH_LIFT[acc] : 0)));
    this.node.visible = d !== null;
    if (this.rig) this.rig.visible = key === 'puffin';
    if (!d) return;
    // тупик ещё грузится: не видно, желейка переоденется сама (avatar.ts → whenIsleOutfit)
    if (key === 'puffin' && !this.puffinRig()) this.node.visible = false;
    this.geo.visible = d.geo !== null;
    if (d.geo) this.geo.geometry = d.geo;
    this.metal.visible = d.metal !== null;
    if (d.metal) this.metal.geometry = d.metal;
  }

  /** Хозяин поймал рыбу: тупик машет крыльями и держит мойву, остальные кивают */
  cheer(): void {
    if (this.rig?.visible) this.cheerT = 0;
    else this.nod = 1;
  }

  /** Копия тупика из GLB на эту желейку; null — модель ещё грузится */
  private puffinRig(): THREE.Object3D | null {
    if (this.rig) return this.rig;
    const tpl = islePuffin();
    if (!tpl) return null;
    const rig = tpl.clone(true);
    rig.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.mat;
    });
    const by = (name: string): THREE.Object3D => rig.getObjectByName(name)!;
    this.parts = { body: by('puffin_body'), head: by('head'), lids: [by('lid_L'), by('lid_R')], capelin: by('capelin'), wings: [by('wing_L'), by('wing_R')] };
    for (const o of [...this.parts.lids, this.parts.capelin]) o.visible = false;
    this.rig = rig;
    this.node.add(rig);
    return rig;
  }

  /** Тупик живёт (как анимации idle, blink, catch в GLB): дышит, моргает, на поимке — подскок, взмахи, мойва в клюве */
  private animatePuffin(time: number, dt: number): void {
    const p = this.parts!;
    const s = (1 - Math.cos(((time % 4) / 4) * Math.PI * 2)) / 2;
    p.body.scale.set(1 + 0.015 * s, 1 + 0.03 * s, 1 + 0.015 * s);
    let head = 0.06 * s;
    let wing = 0.05 * s;
    let hop = 0;
    let fish = 0;
    if (time >= this.blinkAt) {
      this.blinkT = 0;
      this.blinkAt = time + 2 + Math.random() * 3;
    }
    let lid = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      lid = this.blinkT >= 0.3 ? 0 : Math.min(1, Math.sin((Math.PI * this.blinkT) / 0.3) * 1.6);
      if (this.blinkT >= 0.3) this.blinkT = -1;
    }
    if (this.cheerT >= 0) {
      this.cheerT += dt;
      const t = this.cheerT;
      if (t >= 2) this.cheerT = -1;
      else {
        fish = t < 0.2 ? t / 0.2 : t < 1.85 ? 1 : 0;
        head = Math.max(head, 0.32 * Math.sin(Math.min(1, t / 1.6) * Math.PI));
        if (t < 0.7) wing = 0.85 * Math.abs(Math.sin((t / 0.7) * Math.PI * 2));
        if (t < 0.45) hop = 0.011 * Math.sin((t / 0.45) * Math.PI);
      }
    }
    for (const l of p.lids) {
      l.visible = lid > 0.01;
      l.scale.setScalar(Math.max(0.001, lid));
    }
    p.capelin.visible = fish > 0.01;
    p.capelin.scale.setScalar(Math.max(0.001, fish));
    p.head.rotation.x = head;
    p.wings[0].rotation.z = -wing;
    p.wings[1].rotation.z = wing;
    p.body.position.y = hop;
  }

  update(time: number, dt: number, uTime: number, wobble: number, lean: THREE.Vector2): void {
    const d = this.def;
    if (!d) return;
    if (this.rig?.visible) this.animatePuffin(time, dt);
    const p = this.perch;
    const h = Math.min(1, Math.max(0, p.y / BODY_H));
    const wob = Math.sin(uTime * 2.7 + h * 2.5) * 0.014 + wobble * Math.sin(uTime * 23 - h * 6) * h * 0.17;
    this.node.position.set(p.x * (1 + wob) + lean.x * h * h, p.y, p.z * (1 + wob) + lean.y * h * h);
    // оглядывается: быстро поворачивается к новой цели и держит; иногда кивает
    if (time >= this.nextLook) {
      this.target = (Math.random() * 2 - 1) * d.look;
      this.nextLook = time + 1.2 + Math.random() * 2.6;
      if (Math.random() < 0.35) this.nod = 1;
    }
    this.yaw += (this.target - this.yaw) * Math.min(1, dt * 9);
    this.nod = Math.max(0, this.nod - dt * 2.5);
    this.node.rotation.set(-Math.sin(this.nod * Math.PI) * 0.2, d.yaw + this.yaw, lean.x * 0.6);
  }
}

// ------------------------------------------------------------ таблица

const HATS: Record<string, () => Wear> = {
  angler: anglerPanama,
  sou: souwester,
  captain: captainCap,
};

const ACCS: Record<string, () => Wear> = {
  angler: anglerVest,
  oilskin,
  tunic,
  kukan,
  net: landingNet,
};

const cache = new Map<string, Wear>();

/** Геометрия вещи: награды рыбалки отсюда, остальное — из outfit3d.ts. Общая для всех желеек. */
export function wearFor(slot: 'h' | 'a' | 'e', key: string): Wear {
  const isle = isleWear(slot, key);
  if (isle !== undefined) return isle;
  const table = slot === 'h' ? HATS : slot === 'a' ? ACCS : null;
  if (!table || !Object.hasOwn(table, key)) return wearOf(slot, key);
  const id = `${slot}:${key}`;
  let w = cache.get(id);
  if (!w) {
    w = table[key]();
    cache.set(id, w);
  }
  return w;
}

