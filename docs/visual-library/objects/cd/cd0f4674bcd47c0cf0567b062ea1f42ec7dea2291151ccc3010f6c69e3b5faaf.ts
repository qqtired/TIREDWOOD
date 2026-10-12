// Десант с моря: лодка выходит далеко в море и плывёт к берегу у южной стены (x = ±12,5), экипаж по одному прыгает
// на берег (ZS_HOP), идёт к своей точке на морской стене, лезет и спрыгивает во двор сбоку от террасы (как липучка).
// Потопили лодку до высадки — экипаж тонет (каждый — как сбитый абордажник), лодка — своя награда. Пустая лодка
// отходит и пропадает без награды. Орда (horde.ts) вызывает stepBoat/stepHop каждый тик.
import { DT } from '../../shared/constants.ts';
import { ZK, ZS_BOAT, ZS_BOAT_LAND, ZS_BOAT_LEAVE, ZS_WALK, Z_BOAT } from '../../shared/fort.ts';
import { BOAT_LAND_Z, BOAT_LEAVE_TICKS, HOP_EVERY, HOP_TICKS } from '../../shared/fortkinds.ts';
import type { Horde, HordeHost, Zombie } from './horde.ts';

export interface SeaCtx {
  readonly host: HordeHost;
  readonly horde: Horde;
}

/** Лодка: плывёт к берегу → высадка по одному → пустая отходит и пропадает */
export function stepBoat(c: SeaCtx, z: Zombie): void {
  const speed = ZK[Z_BOAT].speed;
  switch (z.state) {
    case ZS_BOAT: {
      const d = z.z - BOAT_LAND_Z;
      if (d > 0.05) {
        z.z -= Math.min(d, speed * DT);
        return;
      }
      z.state = ZS_BOAT_LAND;
      z.t = 12;
      c.host.event(['boat', 1, 0, r2(z.x), r2(z.y), r2(z.z)]);
      return;
    }
    case ZS_BOAT_LAND:
      if (--z.t > 0) return;
      if (z.cargo.length === 0) {
        z.state = ZS_BOAT_LEAVE;
        z.t = BOAT_LEAVE_TICKS;
        return;
      }
      // мест в орде нет — ждёт у берега
      c.horde.unloadCrew(z);
      z.t = HOP_EVERY;
      return;
    case ZS_BOAT_LEAVE:
      // разворачивается и уходит в море
      z.yaw += (Math.PI - z.yaw) * 0.04;
      z.z += speed * 0.7 * DT * Math.min(1, (BOAT_LEAVE_TICKS - z.t) / 90);
      if (--z.t <= 0) c.horde.remove(z);
      return;
    default:
      z.state = ZS_BOAT;
  }
}

/** Абордажник прыгает из лодки на берег: дуга, потом идёт к морской стене */
export function stepHop(z: Zombie): void {
  z.t--;
  const u = 1 - z.t / HOP_TICKS;
  z.x = z.fromX + (z.toX - z.fromX) * u;
  z.z = z.fromZ + (z.toZ - z.fromZ) * u;
  z.y = z.fromY * (1 - u) + 2.4 * u * (1 - u);
  if (z.t <= 0) {
    z.y = 0;
    z.state = ZS_WALK;
    z.bestD = 1e9;
    z.stuck = 0;
  }
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
