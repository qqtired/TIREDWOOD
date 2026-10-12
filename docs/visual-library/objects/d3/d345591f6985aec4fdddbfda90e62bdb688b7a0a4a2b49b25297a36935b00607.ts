// Перенос старой сборки режима целиком (docs/plaza3/tech-foundation.md §1.4): в plaza3 её старые литералы проходят через
// жёсткое преобразование группы — поворот на rot·90° вокруг старого центра (cx, cz), затем сдвиг (dx, dz). Внутренние связи
// (стул у стола, оградка вокруг настила) сохраняются сами. Подключение — одна строка у константы режима:
//   export const RAT_DECK = xfBox2(A.rat, { x0: …, z0: …, x1: …, z1: … });
// В старой раскладке (и при нулевом якоре) функции возвращают ТОТ ЖЕ объект (xfMinMax — те же числа): значения побитно прежние, отпечаток
// test/plaza-legacy.test.ts не меняется. Столкновения — только AABB, поэтому поворот — только четвертями.
import { PLAZA3 } from '../layout.ts';
import { P3 } from './layout.ts';
import type { Plaza3Group, Xf } from './types.ts';

export type { Plaza3Group, Xf } from './types.ts';

const NONE = Object.fromEntries(Object.keys(P3.anchors).map((g) => [g, null])) as Record<Plaza3Group, null>;
/** Якоря групп plaza3; в старой раскладке у каждой группы null — перенос не делается */
export const A: Record<Plaza3Group, Xf | null> = PLAZA3 ? P3.anchors : NONE;

/** Якорь ничего не меняет: старая раскладка или нулевой сдвиг без поворота */
function still(t: Xf | null): t is null {
  return !t || (t.dx === 0 && t.dz === 0 && t.rot === 0);
}

/** Точка (x, z) после поворота и сдвига группы */
function move(t: Xf, x: number, z: number): [number, number] {
  const cx = t.cx ?? 0;
  const cz = t.cz ?? 0;
  const u = x - cx;
  const v = z - cz;
  // rotation.y на четверть оборота при x — восток, z — юг: (u, v) → (v, −u); точные перестановки, без синусов
  const [ru, rv] = t.rot === 1 ? [v, -u] : t.rot === 2 ? [-u, -v] : t.rot === 3 ? [-v, u] : [u, v];
  return [cx + ru + t.dx, cz + rv + t.dz];
}

/** Поворот взгляда вместе с группой (yaw растёт на rot·π/2, как rotation.y) */
export function xfYaw(t: Xf | null, yaw: number): number {
  if (still(t) || t.rot === 0) return yaw;
  return yaw + (t.rot * Math.PI) / 2;
}

/** Точка с полями x, z (остальные поля — как были) */
export function xfP<T extends { x: number; z: number }>(t: Xf | null, p: T): T {
  if (still(t)) return p;
  const [x, z] = move(t, p.x, p.z);
  return { ...p, x, z };
}

/** Место с направлением взгляда: x, z и yaw */
export function xfSpot<T extends { x: number; z: number; yaw: number }>(t: Xf | null, p: T): T {
  if (still(t)) return p;
  const [x, z] = move(t, p.x, p.z);
  return { ...p, x, z, yaw: xfYaw(t, p.yaw) };
}

/** Прямоугольник на земле { x0, z0, x1, z1 } (после поворота — снова x0 < x1, z0 < z1) */
export function xfBox2<T extends { x0: number; z0: number; x1: number; z1: number }>(t: Xf | null, b: T): T {
  if (still(t)) return b;
  const [ax, az] = move(t, b.x0, b.z0);
  const [bx, bz] = move(t, b.x1, b.z1);
  return { ...b, x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
}

/** Бокс [x, y, z]–[x, y, z] (высота не меняется) */
export function xfMinMax(t: Xf | null, min: readonly [number, number, number], max: readonly [number, number, number]): [[number, number, number], [number, number, number]] {
  if (still(t)) return [[...min], [...max]];
  const [ax, az] = move(t, min[0], min[2]);
  const [bx, bz] = move(t, max[0], max[2]);
  return [[Math.min(ax, bx), min[1], Math.min(az, bz)], [Math.max(ax, bx), max[1], Math.max(az, bz)]];
}
