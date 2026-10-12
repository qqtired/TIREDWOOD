// Камера и прицел от третьего лица. Общий код: клиент ставит по нему камеру и рисует выстрел,
// сервер по тем же формулам находит, куда целился игрок (честно для всех).
//
// Выстрел: луч из камеры по центру экрана находит точку P (стена или противник), шарик летит
// из глаз желейки в P. Если P почти у лица (стена вплотную), стреляем прямо по взгляду.
import { EYE_HEIGHT, HITBOX_CY, HITBOX_RX, HITBOX_RY } from './constants.ts';
import { viewDir } from './math.ts';
import { SHOT_RANGE, applySpread, type PlayerState } from './sim.ts';
import { makeRayHit, rayEllipsoid, type CollisionWorld } from './world.ts';

export interface RigParams {
  back: number;
  side: number;
  up: number;
}

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Пейнтбол: над правым (или левым) плечом */
export const RIG_PB: RigParams = { back: 2.9, side: 0.6, up: 0.25 };
/** Пейнтбол, прицеливание: ближе */
export const RIG_PB_ADS: RigParams = { back: 1.4, side: 0.5, up: 0.15 };
/** Набережная: по центру и дальше — желейка чуть ниже середины экрана (колесо мыши меняет back) */
export const RIG_LOBBY: RigParams = { back: 4.2, side: 0, up: 0.15 };

/** Высота опоры камеры над ногами */
export const PIVOT_Y = 1.45;
/** Ближе этого камера к опоре не подъезжает */
export const CAM_MIN = 0.35;
/** Запас до стены */
export const CAM_PAD = 0.2;
/** Если точка прицела ближе этого (вдоль взгляда) — стреляем по взгляду */
export const AIM_FALLBACK = 0.5;

const hit = makeRayHit();
const f = { x: 0, y: 0, z: 0 };

/**
 * Позиция камеры для игрока в (px, py, pz). side: +1 — правое плечо, −1 — левое.
 * back — если задан, вместо rig.back (колесо мыши). Возвращает расстояние от опоры до камеры.
 */
export function cameraRig(px: number, py: number, pz: number, yaw: number, pitch: number, rig: RigParams, side: number, world: CollisionWorld, out: V3, back?: number): number {
  viewDir(yaw, pitch, f);
  const b = back ?? rig.back;
  const s = side * rig.side;
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const ox = px;
  const oy = py + PIVOT_Y;
  const oz = pz;
  let dx = -f.x * b + rx * s;
  let dy = -f.y * b + rig.up;
  let dz = -f.z * b + rz * s;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-9) {
    out.x = ox;
    out.y = oy;
    out.z = oz;
    return 0;
  }
  dx /= len;
  dy /= len;
  dz /= len;
  let dist = len;
  if (world.raycast(ox, oy, oz, dx, dy, dz, len, hit, true, true)) {
    dist = Math.max(CAM_MIN, hit.t - CAM_PAD);
    if (dist > len) dist = len;
  }
  out.x = ox + dx * dist;
  out.y = oy + dy * dist;
  out.z = oz + dz * dist;
  return dist;
}

/**
 * Точка прицела: луч из камеры по взгляду (yaw, pitch). Начинается на глубине опоры, чтобы
 * не цеплять то, что между камерой и желейкой. targets — тройки (x, y ног, z) противников.
 */
export function aimPoint(cam: V3, pivotX: number, pivotY: number, pivotZ: number, yaw: number, pitch: number, world: CollisionWorld, targets: ArrayLike<number>, count: number, out: V3): void {
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
  for (let i = 0; i < count; i++) {
    const t = rayEllipsoid(ox, oy, oz, fx, fy, fz, targets[i * 3], targets[i * 3 + 1] + HITBOX_CY, targets[i * 3 + 2], HITBOX_RX, HITBOX_RY);
    if (t >= 0 && t < best) best = t;
  }
  out.x = ox + fx * best;
  out.y = oy + fy * best;
  out.z = oz + fz * best;
}

const cam = { x: 0, y: 0, z: 0 };
const P = { x: 0, y: 0, z: 0 };

/** Направление выстрела игрока s от третьего лица: камера → P → из глаз в P → разброс. */
export function tpsShotDir(
  s: PlayerState, aimYaw: number, aimPitch: number, spread: number, seed: number, shot: number, side: number, ads: boolean,
  world: CollisionWorld, targets: ArrayLike<number>, count: number, out: { dirX: number; dirY: number; dirZ: number },
): void {
  cameraRig(s.x, s.y, s.z, aimYaw, aimPitch, ads ? RIG_PB_ADS : RIG_PB, side, world, cam);
  aimPoint(cam, s.x, s.y + PIVOT_Y, s.z, aimYaw, aimPitch, world, targets, count, P);
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
