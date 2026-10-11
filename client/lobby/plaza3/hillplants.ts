// Рощи и кусты на дальнем холме plaza3. Места добавляются в существующие инстансы города; кусты — ещё один меш
// с той же геометрией кроны и материалом. Под буквами, перед ними с площади/колеса и в ближнем коридоре посадок нет.
import { makeRng } from '../../../shared/math.ts';
import { P3 } from '../../../shared/plaza3/layout.ts';
import { WHEEL, WHEEL_HUB_Y, WHEEL_R, CABIN_DROP } from '../../../shared/wheel.ts';
import type { Ground, Tiredwood } from '../tiredwood.ts';

export interface HillPlant { x: number; y: number; z: number; r: number; color: number }
export interface HillPlants { trees: HillPlant[]; bushes: HillPlant[] }
const GREENS = [0x4a8436, 0x56923c, 0x5f9c44, 0x3f7634, 0x6a9a3c];
/** Раздельные группы по плечам и за буквами; между группами остаётся открытый склон. */
const GROVES = [[520, -475, 55, 40], [700, -440, 60, 45], [825, -295, 65, 50], [940, -95, 60, 45], [855, 105, 60, 40], [655, 150, 55, 35]] as const;
const EYES = [
  { x: P3.lobby.spawn.x, y: 1.7, z: P3.lobby.spawn.z },
  { x: P3.center.x, y: 1.7, z: P3.center.z },
  { x: WHEEL.x, y: WHEEL_HUB_Y + WHEEL_R - CABIN_DROP + 1.7, z: WHEEL.z },
];

export function inHillViewCorridor(x: number, z: number, radius = 0): boolean {
  const c = P3.sign.corridor;
  const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
  const az = Math.atan2(dx, -dz) * 180 / Math.PI;
  const spread = Math.asin(Math.min(1, radius / Math.max(radius, d))) * 180 / Math.PI;
  return d - radius <= c.dMax && az + spread >= c.a0 && az - spread <= c.a1;
}

/** Консервативная проекция габарита кроны: дерево впереди буквы не попадает в её видимый прямоугольник. */
export function obscuresHillSign(p: HillPlant, height: number, sign: Pick<Tiredwood, 'letters'>): boolean {
  return EYES.some((eye) => sign.letters.some((letter) => {
    const d = Math.hypot(p.x - eye.x, p.z - eye.z), ld = Math.hypot(letter.x - eye.x, letter.z - eye.z);
    if (d - p.r > ld + letter.w / 2) return false;
    const a = Math.atan2(p.x - eye.x, eye.z - p.z), la = Math.atan2(letter.x - eye.x, eye.z - letter.z);
    const da = Math.abs(Math.atan2(Math.sin(a - la), Math.cos(a - la)));
    if (da > Math.atan2(p.r, Math.max(1, d - p.r)) + Math.atan2(letter.w / 2 + 3, ld)) return false;
    const bottom = Math.atan2(p.y - eye.y, d + p.r), top = Math.atan2(p.y + height - eye.y, Math.max(1, d - p.r));
    const letterBottom = Math.atan2(letter.y - eye.y, ld), letterTop = Math.atan2(letter.y + 45 - eye.y, ld);
    return top >= letterBottom && bottom <= letterTop;
  }));
}

export function hillPlantPlan(ground: Ground, sign: Pick<Tiredwood, 'letters' | 'blocks'>): HillPlants {
  const plan: HillPlants = { trees: [], bushes: [] };
  const rng = makeRng(111006);
  for (const [cx, cz, rx, rz] of GROVES) {
    for (const kind of ['trees', 'bushes'] as const) {
      const count = kind === 'trees' ? 24 : 12;
      let placed = 0;
      for (let attempt = 0; attempt < count * 16 && placed < count; attempt++) {
        const a = rng() * Math.PI * 2, k = Math.sqrt(rng());
        const x = cx + Math.cos(a) * rx * k, z = cz + Math.sin(a) * rz * k;
        const r = kind === 'trees' ? 2.8 + rng() * 2.2 : 1.4 + rng() * 1.3;
        const p = { x, y: ground(x, z), z, r, color: GREENS[Math.floor(rng() * GREENS.length)] };
        const height = kind === 'trees' ? 1.2 + r * 2.4 : r * 1.15;
        if (p.y < 0 || sign.blocks(x, z, 8 + r) || inHillViewCorridor(x, z, r) || obscuresHillSign(p, height, sign)) continue;
        if (plan.trees.some((t) => Math.hypot(x - t.x, z - t.z) < r + t.r + 1) || plan.bushes.some((b) => Math.hypot(x - b.x, z - b.z) < r + b.r)) continue;
        plan[kind].push(p);
        placed++;
      }
    }
  }
  return plan;
}
