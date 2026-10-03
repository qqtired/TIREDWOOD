// Граната «Крепости»: бросок с руки по взгляду (чуть выше прицела), полёт с тяжестью, отскоки от камня и земли.
// Один и тот же шаг у сервера (решает, где взрыв), у клиента (летящая граната) и у дуги-подсказки, пока держишь G.
import { DT, EYE_HEIGHT } from './constants.ts';
import { GREN_BOUNCE, GREN_GRAVITY, GREN_LOFT, GREN_SPEED } from './fortarsenal.ts';
import type { CollisionWorld, RayHit } from './world.ts';

export interface Grenade {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Лежит (больше не катится) */
  rest: boolean;
}

/** Радиус гранаты (отступ от стен) */
export const GREN_RADIUS = 0.12;

export function makeGrenade(): Grenade {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rest: false };
}

/**
 * Бросок: из-за правого плеча на высоте глаз, по взгляду + GREN_LOFT вверх. Стартовая точка не залезает в стену
 * (игрок прижат к брустверу — граната вылетает от лица).
 */
export function grenadeLaunch(px: number, py: number, pz: number, yaw: number, pitch: number, world: CollisionWorld, hit: RayHit, out: Grenade): void {
  const p = Math.min(1.35, pitch + GREN_LOFT);
  const cp = Math.cos(p);
  const fx = -Math.sin(yaw) * cp;
  const fy = Math.sin(p);
  const fz = -Math.cos(yaw) * cp;
  // вправо от взгляда
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const ex = px;
  const ey = py + EYE_HEIGHT - 0.1;
  const ez = pz;
  let ox = rx * 0.28 + fx * 0.35;
  let oy = 0.0;
  let oz = rz * 0.28 + fz * 0.35;
  const ol = Math.hypot(ox, oy, oz);
  if (ol > 1e-6 && world.raycast(ex, ey, ez, ox / ol, oy / ol, oz / ol, ol + GREN_RADIUS, hit, true)) {
    const k = Math.max(0, hit.t - GREN_RADIUS) / ol;
    ox *= k;
    oy *= k;
    oz *= k;
  }
  out.x = ex + ox;
  out.y = ey + oy;
  out.z = ez + oz;
  out.vx = fx * GREN_SPEED;
  out.vy = fy * GREN_SPEED;
  out.vz = fz * GREN_SPEED;
  out.rest = false;
}

/** Тик полёта. true — ударилась (для звука). */
export function grenadeStep(g: Grenade, world: CollisionWorld, hit: RayHit): boolean {
  if (g.rest) return false;
  g.vy -= GREN_GRAVITY * DT;
  let dx = g.vx * DT;
  let dy = g.vy * DT;
  let dz = g.vz * DT;
  let bounced = false;
  // до двух столкновений за тик (угол стены и земли)
  for (let k = 0; k < 2; k++) {
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-7) break;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;
    if (!world.raycast(g.x, g.y, g.z, ux, uy, uz, len + GREN_RADIUS, hit, true)) {
      g.x += dx;
      g.y += dy;
      g.z += dz;
      return bounced;
    }
    const t = Math.max(0, hit.t - GREN_RADIUS);
    g.x += ux * t;
    g.y += uy * t;
    g.z += uz * t;
    const vn = g.vx * hit.nx + g.vy * hit.ny + g.vz * hit.nz;
    if (vn < 0) {
      g.vx -= (1 + GREN_BOUNCE) * vn * hit.nx;
      g.vy -= (1 + GREN_BOUNCE) * vn * hit.ny;
      g.vz -= (1 + GREN_BOUNCE) * vn * hit.nz;
    }
    // трение о поверхность
    g.vx *= 0.72;
    g.vz *= 0.72;
    if (hit.ny > 0.6 && g.vy < 1.4) {
      g.vy = 0;
      if (g.vx * g.vx + g.vz * g.vz < 0.36) {
        g.vx = 0;
        g.vz = 0;
        g.rest = true;
        return true;
      }
    }
    bounced = true;
    const rest = Math.max(0, len - t);
    const rl = Math.hypot(g.vx, g.vy, g.vz);
    if (rl < 1e-6) break;
    dx = (g.vx / rl) * rest;
    dy = (g.vy / rl) * rest;
    dz = (g.vz / rl) * rest;
  }
  return bounced;
}
