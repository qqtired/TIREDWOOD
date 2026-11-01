// Общее для боссов «Крепости 50» — Избушки и Пеликана-Бомбардира (server/fort/boss-hut.ts, boss-pelican.ts): когда босс
// открыт (броня не держит) и когда у него ярость (полоса «Ярость» и красный оттенок). У этих двух три фазы: ярость —
// только в третьей. Избушка открыта ещё и пока сидит на стене наседкой (дверь настежь, печь голубая).
import { ZS_BOSS_OPEN } from '../../shared/fort.ts';
import { HUT_NEST_OPEN0, HUT_NEST_OPEN1, HUT_NEST_TICKS, ZS_HUT_NEST } from '../../shared/fortbosses50.ts';
import { Z_HUT, Z_PELICAN } from '../../shared/fortkinds.ts';
import { ZS_SIEGE_OPEN } from '../../shared/fortsiege.ts';
import { DT } from '../../shared/constants.ts';
import { raging, type BossCtx } from './bosses.ts';
import { r2, turnTo } from './boss-kit.ts';
import type { HordeTarget, Zombie } from './horde.ts';

/** Броня не держит: окно после удара, механизм осады, Избушка сидит на стене */
export function bossExposed(z: Zombie): boolean {
  if (z.state === ZS_BOSS_OPEN || z.state === ZS_SIEGE_OPEN) return true;
  if (z.state === ZS_HUT_NEST) {
    const T = HUT_NEST_TICKS - z.t;
    return T >= HUT_NEST_OPEN0 && T < HUT_NEST_OPEN1;
  }
  return false;
}

/** Ярость в снимке: у Избушки и Пеликана — 3-я фаза, у остальных — как раньше */
export function f50Rage(z: Zombie): boolean {
  return z.kind === Z_HUT || z.kind === Z_PELICAN ? z.stage >= 3 : raging(z);
}

/** Метка атаки событием без смены отсчёта: удар через ticks тиков */
export function warnAt(c: BossCtx, z: Zombie, attack: number, x: number, y: number, zz: number, r: number, ticks: number): void {
  c.host.event(['warn', z.id, attack, r2(x), r2(y), r2(zz), r, c.host.tick + ticks]);
}

const _hit = { x: 0, y: 0, z: 0 };

/** Высота поверхности под точкой (ход стены, двор, терраса, крыша): луч сверху; ничего — fallback */
export function surfaceY(c: BossCtx, x: number, z: number, fallback = 0): number {
  return c.host.traceAttack(x, 30, z, x, -1, z, _hit) ? _hit.y : fallback;
}

/** Задело ли человека взрывом в точке (x, y, z) радиуса r: в шаре и без стены между */
export function reaches(c: BossCtx, p: HordeTarget, x: number, y: number, z: number, r: number): boolean {
  if (Math.hypot(p.x - x, p.y + 0.8 - y, p.z - z) >= r) return false;
  return !c.host.traceAttack(x, y + 0.05, z, p.x, p.y + 0.8, p.z, _hit);
}

/** Полёт к точке (x, y, z); true — ещё летит. Лицом по ходу (по горизонтали). */
export function fly(z: Zombie, x: number, y: number, zz: number, speed: number): boolean {
  const dx = x - z.x;
  const dy = y - z.y;
  const dz = zz - z.z;
  const d = Math.hypot(dx, dy, dz);
  if (d <= 0.25) {
    z.x = x;
    z.y = y;
    z.z = zz;
    return false;
  }
  const move = Math.min(d, speed * DT);
  z.x += (dx / d) * move;
  z.y += (dy / d) * move;
  z.z += (dz / d) * move;
  if (Math.hypot(dx, dz) > 0.05) z.yaw = turnTo(z.yaw, Math.atan2(-dx, -dz), 0.1);
  return true;
}

/** Курс, чтобы смотреть по направлению (dx, dz) */
export function yawTo(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
