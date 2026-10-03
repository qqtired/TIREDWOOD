// Суша «Портового кольца»: один контур вокруг дороги. Дорога идёт по кромке причалов: где справа нет стены, суша
// кончается у края обочины (дальше вода), где есть — за стеной ещё полоса бетона шириной LAND_MARGIN. Слева
// суша — вся середина порта. В местах провала (каналы под трамплинами) контур делает «рукав» воды вглубь суши.
// Контур обходится по ходу гонки, вода — справа. Считается и для мира (плита, стенки причалов), и для проверок
// (суша под точкой). Точность как у трассы не нужна: на физику карта не влияет.
import type { Track } from '../track.ts';

/** Полоса бетона за стеной дороги, м (в ней стоят фонари, щиты-стрелки и ряды покрышек) */
export const LAND_MARGIN = 3.2;

export interface LandShape {
  /** Вершины контура: x, z подряд; вода справа по ходу обхода */
  readonly poly: Float64Array;
  /** Число вершин контура */
  readonly count: number;
  /** Границы: x0, z0, x1, z1 */
  readonly box: { x0: number; z0: number; x1: number; z1: number };
}

/** Нормаль вправо в точке i осевой (по среднему направлению соседних отрезков) */
export function rightNormal(tr: Track, i: number, out: { x: number; z: number }): { x: number; z: number } {
  const p = (i - 1 + tr.n) % tr.n;
  const x = tr.tx[p] + tr.tx[i];
  const z = tr.tz[p] + tr.tz[i];
  const l = Math.sqrt(x * x + z * z);
  out.x = -z / l;
  out.z = x / l;
  return out;
}

const _n = { x: 0, z: 0 };

/**
 * Контур суши. depths[k] — на сколько метров за левый край дороги уходит канал под k-м по счёту провалом
 * (по ходу гонки от линии старта).
 */
export function buildLand(tr: Track, depths: readonly number[]): LandShape {
  const n = tr.n;
  const pts: number[] = [];
  const push = (x: number, z: number): void => {
    pts.push(x, z);
  };
  const right = (i: number, lat: number): [number, number] => {
    rightNormal(tr, i, _n);
    return [tr.px[i] + _n.x * lat, tr.pz[i] + _n.z * lat];
  };
  let run = 0;
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    if (tr.gap[i] && !tr.gap[prev]) {
      // провал: от конца подъёма (i) до приземления (g1) — рукав воды: поперёк дороги и на depth за левый край
      let g1 = i;
      while (g1 < n && tr.gap[g1]) g1++;
      if (g1 >= n) throw new Error('суша: провал переходит через линию старта');
      const d = depths[run++] ?? 0;
      // конец подъёма: правый край (с запасом за стеной, если она есть)
      const m0 = tr.openR[prev] ? 0 : LAND_MARGIN;
      const [ax, az] = right(i, tr.hw[i] + tr.vr[i] + m0);
      const [bx, bz] = right(i, -(tr.hw[i] + tr.vl[i] + d));
      const [cx, cz] = right(g1, -(tr.hw[g1] + tr.vl[g1] + d));
      const m1 = tr.openR[g1] ? 0 : LAND_MARGIN;
      const [ex, ez] = right(g1, tr.hw[g1] + tr.vr[g1] + m1);
      push(ax, az);
      push(bx, bz);
      push(cx, cz);
      push(ex, ez);
      // точка приземления уже в контуре
      i = g1;
      continue;
    }
    // обычная точка: на стыке открытого и закрытого края — ступенька поперёк дороги
    const mPrev = tr.openR[prev] ? 0 : LAND_MARGIN;
    const mNext = tr.openR[i] ? 0 : LAND_MARGIN;
    const [x, z] = right(i, tr.hw[i] + tr.vr[i] + mPrev);
    push(x, z);
    if (mNext !== mPrev) {
      const [x2, z2] = right(i, tr.hw[i] + tr.vr[i] + mNext);
      push(x2, z2);
    }
  }
  const poly = new Float64Array(pts);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (let k = 0; k < poly.length; k += 2) {
    x0 = Math.min(x0, poly[k]);
    x1 = Math.max(x1, poly[k]);
    z0 = Math.min(z0, poly[k + 1]);
    z1 = Math.max(z1, poly[k + 1]);
  }
  return { poly, count: poly.length / 2, box: { x0, z0, x1, z1 } };
}

/** Суша под точкой: чётное число пересечений луча с контуром */
export function landHas(land: LandShape, x: number, z: number): boolean {
  const b = land.box;
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return false;
  const p = land.poly;
  const m = land.count;
  let inside = false;
  for (let i = 0, j = m - 1; i < m; j = i++) {
    const xi = p[i * 2];
    const zi = p[i * 2 + 1];
    const xj = p[j * 2];
    const zj = p[j * 2 + 1];
    if (zi > z !== zj > z && x < xi + ((xj - xi) * (z - zi)) / (zj - zi)) inside = !inside;
  }
  return inside;
}
