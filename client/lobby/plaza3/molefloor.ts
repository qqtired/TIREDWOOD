// Верхние плиты мола после маяка: v1 хранит каждый камень отдельным плоским квадом.
// Убираем только эти грани и заменяем цельным настилом с метрической текстурой.
// Покрывной камень по кромке, стенки, ступень, дерево сходней и мост к маяку сохраняются.
import * as THREE from 'three';
import { mergeColored, paint } from '../../render/kit.ts';

/** Внутренние поля pav_mole.glb; верх landing даёт расширенная площадка маяка. */
export const MOLE_FLOOR = [
  [-62, 43.88, -28, 46.12],
  [-28, 43.88, -26, 46.12],
  [-67.62, 42.88, -62.38, 48.12],
  [-62.38, 43.38, -62, 46.62],
] as const;
const LANDING_SLAB = [-26, 43.88, -24.38, 46.12] as const;
export const MOLE_TOP = -0.5;
export const MOLE_FLOOR_COLOR = 0xe0c49a;

/** Двухметровая рампа от нижнего мола к расширенной площадке маяка. */
export function moleJointY(x: number): number { return MOLE_TOP + Math.max(0, Math.min(0.5, (x + 28) * 0.25)); }

/** Треугольники исходных плит: на поверхности настила/рампы, целиком в одном из полей. */
export function isMoleSlab(points: readonly (readonly [number, number, number])[]): boolean {
  return points.length === 3 && points.every(([x, y]) => Math.abs(y - moleJointY(x)) < 1e-4) &&
    [...MOLE_FLOOR, LANDING_SLAB].some(([x0, z0, x1, z1]) => points.every(([x, , z]) => x >= x0 - 1e-4 && x <= x1 + 1e-4 && z >= z0 - 1e-4 && z <= z1 + 1e-4));
}

/** Только static_mole; вход — уже в мировых осях, как прочие части перед склейкой павильонов. */
export function removeMoleSlabs(geo: THREE.BufferGeometry): { kept: THREE.BufferGeometry; removed: number } {
  const pos = geo.getAttribute('position');
  const idx = geo.index;
  const indices: number[] = [];
  let removed = 0;
  for (let i = 0; i < (idx?.count ?? pos.count); i += 3) {
    const ids = [0, 1, 2].map((k) => idx ? idx.getX(i + k) : i + k);
    const points = ids.map((k): [number, number, number] => [pos.getX(k), pos.getY(k), pos.getZ(k)]);
    if (isMoleSlab(points)) removed++;
    else indices.push(...ids);
  }
  // Геометрия уже принадлежит вызывающему коду; атрибуты остаются без изменений.
  if (removed) geo.setIndex(indices);
  return { kept: geo, removed };
}

export function moleFloorGeometry(): THREE.BufferGeometry {
  return mergeColored(MOLE_FLOOR.map(([x0, z0, x1, z1]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      x0, moleJointY(x0), z0, x0, moleJointY(x0), z1,
      x1, moleJointY(x1), z1, x1, moleJointY(x1), z0,
    ], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    return paint(geo, MOLE_FLOOR_COLOR);
  }));
}
