// Прицел по зомби (режим «Крепость»): то же, что shared/aim.ts у пейнтбола (камера над плечом → точка прицела →
// шарик из глаз в неё), но у целей разные хитбоксы — по типу зомби. Цели — по FT_STRIDE чисел: x, y ног, z, тип.
// Клиент по этим формулам рисует свой выстрел сразу, сервер — решает, попал ли (с откатом зомби к viewTick).
import { AIM_FALLBACK, PIVOT_Y, RIG_PB, RIG_PB_ADS, cameraRig, type V3 } from './aim.ts';
import { EYE_HEIGHT } from './constants.ts';
import { ZK } from './fort.ts';
import { viewDir } from './math.ts';
import { SHOT_RANGE, applySpread, type PlayerState } from './sim.ts';
import { makeRayHit, rayEllipsoid, type CollisionWorld } from './world.ts';

export const FT_STRIDE = 4;

/** Луч по зомби номер i из списка целей: t до попадания (в длинах dir) или −1 */
export function zombieRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tg: ArrayLike<number>, i: number): number {
  const o = i * FT_STRIDE;
  const k = ZK[tg[o + 3]] ?? ZK[0];
  return rayEllipsoid(ox, oy, oz, dx, dy, dz, tg[o], tg[o + 1] + k.hcy, tg[o + 2], k.hrx, k.hry);
}

/** Ближайший зомби на луче ближе maxT: номер в списке (−1 — нет); hit.t — расстояние */
export function nearestZombie(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, tg: ArrayLike<number>, count: number, hit: { t: number },
): number {
  let best = maxT;
  let who = -1;
  for (let i = 0; i < count; i++) {
    const t = zombieRay(ox, oy, oz, dx, dy, dz, tg, i);
    if (t >= 0 && t < best) {
      best = t;
      who = i;
    }
  }
  hit.t = best;
  return who;
}

/** Попадание в голову: точка попадания выше ZK.headY над ногами */
export function zombieHead(kind: number, hitY: number, feetY: number): boolean {
  return hitY - feetY >= (ZK[kind] ?? ZK[0]).headY;
}

const hit = makeRayHit();
const near = { t: 0 };
const f = { x: 0, y: 0, z: 0 };

/** Точка прицела: луч из камеры по взгляду, начиная с глубины опоры (как aimPoint), до стены или зомби. */
export function fortAimPoint(cam: V3, pivotX: number, pivotY: number, pivotZ: number, yaw: number, pitch: number, world: CollisionWorld, tg: ArrayLike<number>, count: number, out: V3): void {
  viewDir(yaw, pitch, f);
  const fx = f.x;
  const fy = f.y;
  const fz = f.z;
  let t0 = (pivotX - cam.x) * fx + (pivotY - cam.y) * fy + (pivotZ - cam.z) * fz;
  if (t0 < 0) t0 = 0;
  const ox = cam.x + fx * t0;
  const oy = cam.y + fy * t0;
  const oz = cam.z + fz * t0;
  let best = SHOT_RANGE;
  if (world.raycast(ox, oy, oz, fx, fy, fz, best, hit, true)) best = hit.t;
  if (nearestZombie(ox, oy, oz, fx, fy, fz, best, tg, count, near) >= 0) best = near.t;
  out.x = ox + fx * best;
  out.y = oy + fy * best;
  out.z = oz + fz * best;
}

const cam = { x: 0, y: 0, z: 0 };
const P = { x: 0, y: 0, z: 0 };

/** Направление выстрела от третьего лица по зомби: камера → P → из глаз в P → разброс (как tpsShotDir). */
export function fortShotDir(
  s: PlayerState, aimYaw: number, aimPitch: number, spread: number, seed: number, shot: number, side: number, ads: boolean,
  world: CollisionWorld, tg: ArrayLike<number>, count: number, out: { dirX: number; dirY: number; dirZ: number },
): void {
  cameraRig(s.x, s.y, s.z, aimYaw, aimPitch, ads ? RIG_PB_ADS : RIG_PB, side, world, cam);
  fortAimPoint(cam, s.x, s.y + PIVOT_Y, s.z, aimYaw, aimPitch, world, tg, count, P);
  viewDir(aimYaw, aimPitch, f);
  let vx = P.x - s.x;
  let vy = P.y - (s.y + EYE_HEIGHT);
  let vz = P.z - s.z;
  if (vx * f.x + vy * f.y + vz * f.z < AIM_FALLBACK) {
    vx = f.x;
    vy = f.y;
    vz = f.z;
  }
  applySpread(vx, vy, vz, spread, seed, shot, out);
}
