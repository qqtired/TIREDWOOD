// Набор E (mobs-e, море): общие заготовки моделей — раскраска вершин по месту, трубки переменной толщины, треуголка,
// капля варенья. Только геометрия: строится один раз при загрузке модуля, в позах не используется.
import * as THREE from 'three';

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

/** Цвет вершины по месту и нормали (в осях части). out.setHex(…) переводит в линейный цвет сам. */
export type PaintFn = (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;

/**
 * Раскрасить геометрию функцией: атрибут color, без индекса и uv. flat — один цвет на треугольник (по его центру):
 * чёткие полосы и пятна без размытых переходов. Нормали остаются гладкими.
 */
export function paint(geo: THREE.BufferGeometry, fn: PaintFn, flat = false): THREE.BufferGeometry {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const arr = new Float32Array(pos.count * 3);
  const step = flat ? 3 : 1;
  for (let i = 0; i + step <= pos.count; i += step) {
    if (flat) {
      _p.set(0, 0, 0);
      _n.set(0, 0, 0);
      for (let k = 0; k < 3; k++) {
        _p.x += pos.getX(i + k) / 3;
        _p.y += pos.getY(i + k) / 3;
        _p.z += pos.getZ(i + k) / 3;
        _n.x += nor.getX(i + k);
        _n.y += nor.getY(i + k);
        _n.z += nor.getZ(i + k);
      }
      _n.normalize();
    } else {
      _p.fromBufferAttribute(pos, i);
      _n.fromBufferAttribute(nor, i);
    }
    fn(_p, _n, _c);
    for (let k = 0; k < step; k++) {
      arr[(i + k) * 3] = _c.r;
      arr[(i + k) * 3 + 1] = _c.g;
      arr[(i + k) * 3 + 2] = _c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Плавный шаг 0…1 */
export function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Пятна варенья: 1 внутри пятна, 0 снаружи — сумма «клякс» с центрами spots (x, y, z, радиус) */
export function jamSpot(p: THREE.Vector3, spots: readonly number[]): number {
  let v = 0;
  for (let i = 0; i + 3 < spots.length; i += 4) {
    const d = Math.hypot(p.x - spots[i], p.y - spots[i + 1], p.z - spots[i + 2]) / spots[i + 3];
    if (d < 1) v = Math.max(v, 1 - d * d);
  }
  return v;
}

export interface TubeOpts {
  /** Замкнутая петля (кант треуголки) */
  closed?: boolean;
  /** Закрыть начало / конец конусом длиной в столько радиусов (0 — плоско) */
  capStart?: number;
  capEnd?: number;
}

/**
 * Трубка по точкам с толщиной radius(i, u) в каждой (u — доля пути 0…1): гладкие нормали, кольца без шва, рамки —
 * параллельный перенос (без перекрутов).
 */
export function tube(pts: readonly THREE.Vector3[], radius: (i: number, u: number) => number, radial: number, o: TubeOpts = {}): THREE.BufferGeometry {
  const n = pts.length;
  const closed = o.closed === true;
  const T: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    T.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  const ref = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const N: THREE.Vector3[] = [ref.clone().addScaledVector(T[0], -ref.dot(T[0])).normalize()];
  for (let i = 1; i < n; i++) {
    const v = N[i - 1].clone().addScaledVector(T[i], -N[i - 1].dot(T[i]));
    N.push(v.lengthSq() < 1e-10 ? N[i - 1].clone() : v.normalize());
  }
  const B = T.map((t, i) => new THREE.Vector3().crossVectors(t, N[i]));
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = radius(i, n > 1 ? i / (n - 1) : 0);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a);
      const sx = Math.sin(a);
      pos.push(
        pts[i].x + r * (cx * N[i].x + sx * B[i].x),
        pts[i].y + r * (cx * N[i].y + sx * B[i].y),
        pts[i].z + r * (cx * N[i].z + sx * B[i].z),
      );
    }
  }
  const rings = closed ? n : n - 1;
  for (let i = 0; i < rings; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      const a = i * radial + j;
      const b = i * radial + j2;
      const c = i2 * radial + j;
      const d = i2 * radial + j2;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (!closed && o.capStart !== undefined) {
    const r = radius(0, 0) * o.capStart;
    const s = pos.length / 3;
    pos.push(pts[0].x - T[0].x * r, pts[0].y - T[0].y * r, pts[0].z - T[0].z * r);
    for (let j = 0; j < radial; j++) idx.push(s, (j + 1) % radial, j);
  }
  if (!closed && o.capEnd !== undefined) {
    const r = radius(n - 1, 1) * o.capEnd;
    const e = pos.length / 3;
    const last = pts[n - 1];
    pos.push(last.x + T[n - 1].x * r, last.y + T[n - 1].y * r, last.z + T[n - 1].z * r);
    const base = (n - 1) * radial;
    for (let j = 0; j < radial; j++) idx.push(e, base + j, base + ((j + 1) % radial));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Точки гладкой кривой через опорные (Catmull-Rom): count точек */
export function curve(ctrl: ReadonlyArray<readonly [number, number, number]>, count: number): THREE.Vector3[] {
  const c = new THREE.CatmullRomCurve3(ctrl.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  return c.getPoints(count - 1);
}

/** Эллипсоид: сфера w×h, сжатая по осям */
export function blob(rx: number, ry: number, rz: number, w = 10, h = 7): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
}

/**
 * Треуголка: тулья-купол и поля, загнутые вверх тремя стенками; один угол смотрит вперёд (+Z). R — радиус до углов,
 * h — высота стенок посередине сторон. seg кратно 3. rich — поля в три ряда и золотой кант трубкой (крупные шляпы),
 * иначе один ряд с золотым краем.
 */
export function tricorn(R: number, h: number, felt: number, trim: number, seg = 12, rich = true): THREE.BufferGeometry {
  const rc = R * 0.46;
  const thick = 0.035 * R;
  const at = (t: number, phi: number, under: number, out: THREE.Vector3): THREE.Vector3 => {
    const c3 = Math.cos(3 * phi);
    const ro = R * (0.775 + 0.225 * c3);
    const ho = h * (0.55 - 0.45 * c3);
    const r = rc + (ro - rc) * t;
    return out.set(Math.sin(phi) * r, ho * Math.pow(t, 1.6) + 0.02 * R - under, Math.cos(phi) * r);
  };
  const cf = new THREE.Color(felt);
  const ct = new THREE.Color(trim);
  const v = new THREE.Vector3();
  /** Сетка полей: ряды rows × seg по кругу (без шва), гладкие нормали; under — нижняя сторона */
  const band = (rows: number[], under: boolean, color: (t: number) => THREE.Color): THREE.BufferGeometry => {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (const t of rows) {
      for (let j = 0; j < seg; j++) {
        at(t, (j / seg) * Math.PI * 2, under ? thick : 0, v);
        pos.push(v.x, v.y, v.z);
        const c = color(t);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let k = 0; k < rows.length - 1; k++) {
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        const a = k * seg + j;
        const b = (k + 1) * seg + j;
        const c = k * seg + j2;
        const d = (k + 1) * seg + j2;
        if (under) idx.push(a, c, b, c, d, b);
        else idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const parts: THREE.BufferGeometry[] = [];
  for (const under of [false, true]) {
    if (rich) {
      parts.push(band([0, 0.5, 0.86], under, () => cf));
      parts.push(band([0.86, 1], under, () => ct));
    } else {
      parts.push(band([0, 1], under, (t) => (t > 0.5 ? ct : cf)));
    }
  }
  const crown = new THREE.SphereGeometry(rc * 1.04, seg, rich ? 5 : 2, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, (h * 1.25) / (rc * 1.04), 1);
  parts.push(paint(crown, (_p0, _n0, o) => o.setHex(felt)));
  if (rich) {
    const edge: THREE.Vector3[] = [];
    for (let j = 0; j < seg * 2; j++) edge.push(at(1, (j / (seg * 2)) * Math.PI * 2, thick * 0.5, new THREE.Vector3()));
    parts.push(paint(tube(edge, () => R * 0.035, 4, { closed: true }), (_p0, _n0, o) => o.setHex(trim)));
  }
  return mergeColored(parts);
}

/** Склеить окрашенные куски (без индекса, position + normal + color) */
export function mergeColored(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  const ready = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.getAttribute('normal')) ng.computeVertexNormals();
    count += ng.getAttribute('position').count;
    return ng;
  });
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const g of ready) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const c = g.getAttribute('color');
    for (let i = 0; i < p.count; i++, o++) {
      pos[o * 3] = p.getX(i);
      pos[o * 3 + 1] = p.getY(i);
      pos[o * 3 + 2] = p.getZ(i);
      nor[o * 3] = n.getX(i);
      nor[o * 3 + 1] = n.getY(i);
      nor[o * 3 + 2] = n.getZ(i);
      col[o * 3] = c ? c.getX(i) : 1;
      col[o * 3 + 1] = c ? c.getY(i) : 1;
      col[o * 3 + 2] = c ? c.getZ(i) : 1;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/** Капля варенья, висящая вниз: шарик и хвостик вверх (точка подвеса — верх хвостика) */
export function jamDrop(r: number, len: number, hex: number): THREE.BufferGeometry {
  const bulb = new THREE.SphereGeometry(r, 6, 4).translate(0, -len, 0);
  const tail = new THREE.ConeGeometry(r * 0.75, len, 6, 1, true).translate(0, -len / 2, 0);
  return mergeColored([paint(bulb, (_p0, _n0, o) => o.setHex(hex)), paint(tail, (_p0, _n0, o) => o.setHex(hex))]);
}

/** Сколько треугольников в геометрии */
export function triCount(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}
