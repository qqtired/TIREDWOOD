// Огородный декор от арки до мельницы: постоянная раскладка, без коллизий и без новых взаимодействий.
import { makeRng } from '../../../shared/math.ts';

export interface GardenPlace { x: number; z: number; yaw: number; scale: number }
export const GARDEN_ROUTE = [[60.6, -23.2], [78, -57], [84, -62]] as const;

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

export function gardenPlan(): { beds: GardenPlace[]; sunflowers: GardenPlace[] } {
  const beds: GardenPlace[] = [];
  for (const z of [-34, -44, -54]) for (const x of [55, 62, 69, 76, 83, 89]) {
    if (routeDistance(x, z, GARDEN_ROUTE) <= 5 || Math.hypot(x - 84, z + 62) <= 9) continue;
    beds.push({ x, z, yaw: 0, scale: 1 });
  }
  const sunflowers: GardenPlace[] = [];
  const rng = makeRng(110311);
  // Ряды за грядками и у границы поля. Между растениями есть шаг, но ряды не выглядят точной решёткой.
  for (let z = -29; z >= -68; z -= 2.25) for (let x = 51; x <= 90; x += 2.1) {
    const px = x + (rng() - 0.5) * 0.35, pz = z + (rng() - 0.5) * 0.35;
    if (routeDistance(px, pz, GARDEN_ROUTE) <= 2.5 || Math.hypot(px - 84, pz + 62) <= 5.6) continue;
    if (beds.some((b) => Math.abs(px - b.x) < 2.5 && Math.abs(pz - b.z) < 3.9)) continue;
    // Все корзинки обращены к площади, с небольшой естественной разницей поворота и высоты.
    sunflowers.push({ x: px, z: pz, yaw: -0.65 + (rng() - 0.5) * 0.5, scale: 1.1 + rng() * 0.35 });
  }
  return { beds, sunflowers };
}
