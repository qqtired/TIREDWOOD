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

/**
 * Подложка v1 — два больших треугольника x −62…−24, z 43,5…46,5 на y −0,515.
 * Подъём восточных вершин при правке стыка растянул её скатом на весь мол: подложка закрыла новый настил.
 * Возвращаем только этот верх под плиты; рампу рисует moleFloorGeometry, борта и коллизии не меняются.
 */
export function recessMoleSupport(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const normal = geo.getAttribute('normal');
  const idx = geo.index;
  for (let i = 0; i < (idx?.count ?? pos.count); i += 3) {
    const ids = [0, 1, 2].map((k) => idx ? idx.getX(i + k) : i + k);
    const corner = (v: number): boolean =>
      (Math.abs(pos.getX(v) + 62) < 1e-4 || Math.abs(pos.getX(v) + 24) < 1e-4) &&
      (Math.abs(pos.getZ(v) - 43.5) < 1e-4 || Math.abs(pos.getZ(v) - 46.5) < 1e-4) &&
      pos.getY(v) >= MOLE_TOP - .016 && pos.getY(v) <= -.019;
    if (!ids.every(corner)) continue;
    for (const v of ids) {
      pos.setY(v, MOLE_TOP - .015);
      normal?.setXYZ(v, 0, 1, 0);
    }
  }
  return geo;
}

/** Площадка маяка начинается на x −26: её верх и бок не должны дублировать старую посадку мола. */
function trimMoleLanding(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const attributes = Object.entries(geo.attributes);
  const position = geo.getAttribute('position'), index = geo.index;
  const output = attributes.map(() => [] as number[]);
  type Vertex = number[][];
  const read = (id: number): Vertex => attributes.map(([, a]) => Array.from({ length: a.itemSize }, (_, k) => a.getComponent(id, k)));
  const p = attributes.findIndex(([name]) => name === 'position');
  const mix = (a: Vertex, b: Vertex, t: number): Vertex => a.map((values, i) => values.map((v, k) => v + (b[i]![k]! - v) * t));
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const triangle = [0, 1, 2].map((k) => read(index ? index.getX(i + k) : i + k));
    const clipped: Vertex[] = [];
    for (let k = 0; k < 3; k++) {
      const a = triangle[k]!, b = triangle[(k + 1) % 3]!;
      const ax = a[p]![0]!, bx = b[p]![0]!;
      if (ax < -26) clipped.push(a);
      if ((ax < -26) !== (bx < -26)) clipped.push(mix(a, b, (-26 - ax) / (bx - ax)));
    }
    for (let k = 1; k + 1 < clipped.length; k++) {
      for (const vertex of [clipped[0]!, clipped[k]!, clipped[k + 1]!]) {
        const xyz = [...vertex[p]!];
        const t = Math.max(0, Math.min(1, (xyz[0]! + 28) / 2));
        // Старый камень выступал на 12 см с обеих сторон. На стыке он заканчивается ровно по основанию.
        if (xyz[2]! < 43.5) xyz[2]! += (43.5 - xyz[2]!) * t;
        if (xyz[2]! > 46.5) xyz[2]! += (46.5 - xyz[2]!) * t;
        const top = moleJointY(xyz[0]!);
        // Случайная высота и фаска камня плавно сходятся к единому верху площадки, без уступа в конце рампы.
        if (xyz[1]! >= top - .05 && xyz[1]! <= top + .005) xyz[1]! += (top - xyz[1]!) * t;
        vertex.forEach((values, a) => output[a]!.push(...(a === p ? xyz : values)));
      }
    }
  }
  const trimmed = new THREE.BufferGeometry();
  attributes.forEach(([name, a], i) => trimmed.setAttribute(name, new THREE.Float32BufferAttribute(output[i]!, a.itemSize)));
  trimmed.setIndex(Array.from({ length: trimmed.getAttribute('position').count }, (_, i) => i));
  geo.dispose();
  return trimmed;
}

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
  return { kept: trimMoleLanding(geo), removed };
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
