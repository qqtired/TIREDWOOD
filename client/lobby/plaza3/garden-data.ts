// Огородный декор от арки до мельницы: постоянная раскладка, без коллизий и без новых взаимодействий.
import { makeRng } from '../../../shared/math.ts';
import { P3 } from '../../../shared/plaza3/layout.ts';

export interface GardenPlace { x: number; z: number; yaw: number; scale: number; stretch?: number; y?: number }
export const GARDEN_ROUTE = [[60.6, -23.2], [78, -57], [84, -62]] as const;
/** Плетень от северного столба арки до конца её южного крыла. Существующая колея остаётся открытой. */
export const GARDEN_EDGE = [[54.2, -24.6], [48.5, -29.5], [48.5, -69], [91, -69], [91, -13.5], [71, -13.5], [67.1, -22.1]] as const;

/** Поле сужается у арки: передний правый участок продолжается до садовой аллеи, без посадок на настиле. */
export function inGardenField(x: number, z: number, margin = 0): boolean {
  if (x < 49 + margin || x > 91 - margin || z < -69 + margin || z > -13.5 - margin) return false;
  const left = z < -29 ? 49 : z < -27.5 ? 51 : z < -18 ? 68 : 71;
  return x >= left + margin;
}

function fenceY(x: number, z: number): number {
  const poly = P3.land.polygon;
  let onDeck = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) onDeck = !onDeck;
  }
  return (onDeck ? P3.land.deckY : P3.land.streetY) + 0.035;
}

export function routeDistance(x: number, z: number, route: ReadonlyArray<readonly [number, number]>): number {
  let nearest = Infinity;
  for (let i = 0; i + 1 < route.length; i++) {
    const [ax, az] = route[i], [bx, bz] = route[i + 1];
    const dx = bx - ax, dz = bz - az;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    nearest = Math.min(nearest, Math.hypot(x - ax - k * dx, z - az - k * dz));
  }
  return nearest;
}

export function gardenPlan(): { beds: GardenPlace[]; sunflowers: GardenPlace[]; fences: GardenPlace[] } {
  const beds: GardenPlace[] = [];
  for (const z of [-34, -44, -54, -18, -26]) for (const x of [55, 62, 69, 76, 83, 88]) {
    if (![-2.15, 2.15].every((dx) => [-3.4, 3.4].every((dz) => inGardenField(x + dx, z + dz, 0.6)))) continue;
    if (routeDistance(x, z, GARDEN_ROUTE) <= 5 || Math.hypot(x - 84, z + 62) <= 9) continue;
    beds.push({ x, z, yaw: 0, scale: 1 });
  }
  const sunflowers: GardenPlace[] = [];
  const rng = makeRng(110311);
  // Ряды за грядками и у границы поля. Между растениями есть шаг, но ряды не выглядят точной решёткой.
  const rows: Array<readonly [number, number]> = [];
  for (let z = -29; z >= -68; z -= 2.25) rows.push([z, 2.1]);
  // В передней части подсолнухи гуще обрамляют новые грядки — тот же готовый куст, без новых сеток.
  for (let z = -16; z >= -27.25; z -= 1.35) rows.push([z, 1.35]);
  for (const [z, step] of rows) for (let x = 51; x <= 90; x += step) {
    const px = x + (rng() - 0.5) * 0.35, pz = z + (rng() - 0.5) * 0.35;
    if (!inGardenField(px, pz, 0.65) || routeDistance(px, pz, GARDEN_EDGE) < 0.75) continue;
    if (routeDistance(px, pz, GARDEN_ROUTE) <= 2.5 || Math.hypot(px - 84, pz + 62) <= 5.6) continue;
    if (beds.some((b) => Math.abs(px - b.x) < 2.5 && Math.abs(pz - b.z) < 3.9)) continue;
    // Все корзинки обращены к площади, с небольшой естественной разницей поворота и высоты.
    sunflowers.push({ x: px, z: pz, yaw: -0.65 + (rng() - 0.5) * 0.5, scale: 1.1 + rng() * 0.35 });
  }
  const fences: GardenPlace[] = [];
  for (let i = 0; i + 1 < GARDEN_EDGE.length; i++) {
    const [ax, az] = GARDEN_EDGE[i], [bx, bz] = GARDEN_EDGE[i + 1];
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    const count = Math.ceil(length / 2);
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const x = ax + dx * t, z = az + dz * t;
      fences.push({ x, z, y: fenceY(x, z), yaw: Math.atan2(-dz, dx), scale: 1, stretch: length / count / 2 });
    }
  }
  return { beds, sunflowers, fences };
}
