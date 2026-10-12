// Геометрия замка: «ведро» вершин (позиции, нормали, развёртка, цвета) — грани и коробки в мировой развёртке
// (текстура лежит по метрам, швы кладки совпадают на соседних гранях), затенение у земли, вычитание закрытых частей
// граней, вставка готовых фигур (цилиндры, шатры). Одно ведро — один меш, один вызов отрисовки.
import * as THREE from 'three';
import { buildGeo, parts, quad, type GeoParts, type V3 } from '../../render/kit.ts';

/** Прямоугольник на грани: a — вдоль грани (мировая координата), b — по высоте (или вторая ось для горизонтальных) */
export interface Rect {
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

/** Вычесть из прямоугольника закрытые части: сетка по всем границам, открытые клетки склеиваются в полосы. */
export function subtract(base: Rect, holes: readonly Rect[]): Rect[] {
  const as = [base.a0, base.a1];
  const bs = [base.b0, base.b1];
  const clipped: Rect[] = [];
  for (const h of holes) {
    const r = { a0: Math.max(base.a0, h.a0), a1: Math.min(base.a1, h.a1), b0: Math.max(base.b0, h.b0), b1: Math.min(base.b1, h.b1) };
    if (r.a1 - r.a0 < 1e-4 || r.b1 - r.b0 < 1e-4) continue;
    clipped.push(r);
    as.push(r.a0, r.a1);
    bs.push(r.b0, r.b1);
  }
  if (!clipped.length) return [base];
  const ua = [...new Set(as.map((v) => Math.round(v * 1e4) / 1e4))].sort((p, q) => p - q);
  const ub = [...new Set(bs.map((v) => Math.round(v * 1e4) / 1e4))].sort((p, q) => p - q);
  const rows: Rect[][] = [];
  for (let j = 0; j < ub.length - 1; j++) {
    const row: Rect[] = [];
    for (let i = 0; i < ua.length - 1; i++) {
      const ca = (ua[i] + ua[i + 1]) / 2;
      const cb = (ub[j] + ub[j + 1]) / 2;
      if (clipped.some((h) => ca > h.a0 && ca < h.a1 && cb > h.b0 && cb < h.b1)) continue;
      const last = row[row.length - 1];
      if (last && Math.abs(last.a1 - ua[i]) < 1e-6) last.a1 = ua[i + 1];
      else row.push({ a0: ua[i], a1: ua[i + 1], b0: ub[j], b1: ub[j + 1] });
    }
    rows.push(row);
  }
  // по высоте: полосы с одинаковыми границами вдоль грани — в одну
  const out: Rect[] = [];
  const open: Rect[] = [];
  for (const row of rows) {
    const next: Rect[] = [];
    for (const r of row) {
      const prev = open.find((o) => Math.abs(o.a0 - r.a0) < 1e-6 && Math.abs(o.a1 - r.a1) < 1e-6 && Math.abs(o.b1 - r.b0) < 1e-6);
      if (prev) {
        prev.b1 = r.b1;
        next.push(prev);
      } else next.push({ ...r });
    }
    for (const o of open) if (!next.includes(o)) out.push(o);
    open.length = 0;
    open.push(...next);
  }
  out.push(...open);
  return out;
}

/** Высота, до которой у земли темнее (затенение «запечено» в цвета вершин) */
export const AO_H = 1.1;

export interface FaceOpts {
  /** метров на повтор текстуры по горизонтали и вертикали */
  su: number;
  sv: number;
  color: THREE.Color;
  /** множитель яркости у самой земли (1 — без затенения) */
  ao: number;
  /** сдвиг развёртки (разные камни на соседних постройках) */
  uOff: number;
  vOff: number;
}

const DEF: FaceOpts = { su: 4, sv: 4, color: new THREE.Color(1, 1, 1), ao: 1, uOff: 0, vOff: 0 };
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();

export type Axis = 'x' | 'y' | 'z';

export class Bucket {
  readonly p: GeoParts = parts();

  get empty(): boolean {
    return this.p.pos.length === 0;
  }

  private shade(out: THREE.Color, o: FaceOpts, y: number): THREE.Color {
    const k = o.ao >= 1 ? 1 : o.ao + (1 - o.ao) * THREE.MathUtils.smoothstep(y, 0, AO_H);
    return out.copy(o.color).multiplyScalar(k);
  }

  /**
   * Грань на плоскости axis = c, нормаль по знаку sign. Для вертикальных граней a — вдоль (z для 'x', x для 'z'),
   * b — высота; для горизонтальных a — x, b — z. Обход против часовой, если смотреть снаружи.
   */
  face(axis: Axis, sign: number, c: number, a0: number, a1: number, b0: number, b1: number, opts: Partial<FaceOpts> = {}): void {
    const o = { ...DEF, ...opts };
    if (a1 - a0 < 1e-5 || b1 - b0 < 1e-5) return;
    if (axis !== 'y' && o.ao < 1 && b0 < AO_H - 1e-4 && b1 > AO_H + 1e-4) {
      this.face(axis, sign, c, a0, a1, b0, AO_H, opts);
      this.face(axis, sign, c, a0, a1, AO_H, b1, opts);
      return;
    }
    const su = o.su;
    const sv = o.sv;
    let a: V3;
    let b: V3;
    let cc: V3;
    let d: V3;
    let uv: number[];
    let n: V3;
    if (axis === 'x') {
      n = [sign, 0, 0];
      // справа, если смотреть на грань снаружи: −z для +x, +z для −x
      const zl = sign > 0 ? a1 : a0;
      const zr = sign > 0 ? a0 : a1;
      a = [c, b0, zl];
      b = [c, b0, zr];
      cc = [c, b1, zr];
      d = [c, b1, zl];
      const u = (z: number) => (sign > 0 ? -z : z) / su + o.uOff;
      uv = [u(zl), b0 / sv + o.vOff, u(zr), b0 / sv + o.vOff, u(zr), b1 / sv + o.vOff, u(zl), b1 / sv + o.vOff];
    } else if (axis === 'z') {
      n = [0, 0, sign];
      const xl = sign > 0 ? a0 : a1;
      const xr = sign > 0 ? a1 : a0;
      a = [xl, b0, c];
      b = [xr, b0, c];
      cc = [xr, b1, c];
      d = [xl, b1, c];
      const u = (x: number) => (sign > 0 ? x : -x) / su + o.uOff;
      uv = [u(xl), b0 / sv + o.vOff, u(xr), b0 / sv + o.vOff, u(xr), b1 / sv + o.vOff, u(xl), b1 / sv + o.vOff];
    } else {
      n = [0, sign, 0];
      if (sign > 0) {
        a = [a0, c, b1];
        b = [a1, c, b1];
        cc = [a1, c, b0];
        d = [a0, c, b0];
        uv = [a0 / su + o.uOff, -b1 / su + o.vOff, a1 / su + o.uOff, -b1 / su + o.vOff, a1 / su + o.uOff, -b0 / su + o.vOff, a0 / su + o.uOff, -b0 / su + o.vOff];
      } else {
        a = [a0, c, b0];
        b = [a1, c, b0];
        cc = [a1, c, b1];
        d = [a0, c, b1];
        uv = [a0 / su + o.uOff, b0 / su + o.vOff, a1 / su + o.uOff, b0 / su + o.vOff, a1 / su + o.uOff, b1 / su + o.vOff, a0 / su + o.uOff, b1 / su + o.vOff];
      }
    }
    const lo = this.shade(_c0, o, axis === 'y' ? c : b0).clone();
    const hi = this.shade(_c1, o, axis === 'y' ? c : b1).clone();
    const cols = axis === 'y' ? [lo, lo, lo, lo] : [lo, lo, hi, hi];
    quad(this.p, a, b, cc, d, n, uv, cols);
  }

  /** Наклейка: грань, на которую вся текстура ложится один раз (0…1 слева направо, если смотреть снаружи) */
  decal(axis: 'x' | 'z', sign: number, c: number, a0: number, a1: number, b0: number, b1: number, color: THREE.Color): void {
    const n: V3 = axis === 'x' ? [sign, 0, 0] : [0, 0, sign];
    const l = axis === 'x' ? (sign > 0 ? a1 : a0) : sign > 0 ? a0 : a1;
    const r = axis === 'x' ? (sign > 0 ? a0 : a1) : sign > 0 ? a1 : a0;
    const P = (a: number, b: number): V3 => (axis === 'x' ? [c, b, a] : [a, b, c]);
    quad(this.p, P(l, b0), P(r, b0), P(r, b1), P(l, b1), n, [0, 0, 1, 0, 1, 1, 0, 1], [color, color, color, color]);
  }

  /**
   * Коробка. mask — какие грани: 1 +x, 2 −x, 4 +y, 8 −y, 16 +z, 32 −z (по умолчанию все, кроме низа на земле).
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opts: Partial<FaceOpts> = {}, mask = -1): void {
    const m = mask === -1 ? (y0 <= 0.001 ? 0b110111 : 0b111111) : mask;
    if (m & 1) this.face('x', 1, x1, z0, z1, y0, y1, opts);
    if (m & 2) this.face('x', -1, x0, z0, z1, y0, y1, opts);
    if (m & 4) this.face('y', 1, y1, x0, x1, z0, z1, opts);
    if (m & 8) this.face('y', -1, y0, x0, x1, z0, z1, opts);
    if (m & 16) this.face('z', 1, z1, x0, x1, y0, y1, opts);
    if (m & 32) this.face('z', -1, z0, x0, x1, y0, y1, opts);
  }

  /**
   * Готовая фигура (уже на месте): цвет — один на все вершины (или её собственные цвета, умноженные на него),
   * развёртка — её собственная с масштабом (или нули).
   */
  geo(g: THREE.BufferGeometry, color: THREE.Color | number, uvScale: readonly [number, number] = [1, 1], uvOff: readonly [number, number] = [0, 0]): void {
    const src = g.index ? g.toNonIndexed() : g;
    const pos = src.getAttribute('position');
    if (!src.getAttribute('normal')) src.computeVertexNormals();
    const nor = src.getAttribute('normal');
    const uv = src.getAttribute('uv');
    const col = src.getAttribute('color');
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const base = this.p.pos.length / 3;
    for (let i = 0; i < pos.count; i++) {
      this.p.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      this.p.nor.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (uv) this.p.uv.push(uv.getX(i) * uvScale[0] + uvOff[0], uv.getY(i) * uvScale[1] + uvOff[1]);
      else this.p.uv.push(0, 0);
      if (col) this.p.col.push(col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
      else this.p.col.push(c.r, c.g, c.b);
      this.p.idx.push(base + i);
    }
  }

  /** Дописать чужое ведро (тот же материал) */
  append(o: Bucket): this {
    const base = this.p.pos.length / 3;
    for (const v of o.p.pos) this.p.pos.push(v);
    for (const v of o.p.nor) this.p.nor.push(v);
    for (const v of o.p.uv) this.p.uv.push(v);
    for (const v of o.p.col) this.p.col.push(v);
    for (const i of o.p.idx) this.p.idx.push(base + i);
    return this;
  }

  /** Сколько треугольников (для замеров) */
  get triangles(): number {
    return this.p.idx.length / 3;
  }

  build(): THREE.BufferGeometry {
    return buildGeo(this.p);
  }
}

/** Матрица «поставить фигуру»: сдвиг, поворот вокруг Y, затем наклон вокруг X */
export function put(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

/** Цепная линия (провис) между точками: n точек */
export function catenary(a: readonly number[], b: readonly number[], sag: number, n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t));
  }
  return out;
}
