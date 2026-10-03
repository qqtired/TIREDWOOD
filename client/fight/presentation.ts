import { clamp, wrapAngle } from '../../shared/math.ts';
import { PITCH_LIMIT } from '../../shared/protocol.ts';

interface Point { x: number; y: number; z: number }
export interface FighterEye extends Point { yaw: number; pitch: number }

export function sampleFighterEye(out: FighterEye, prev: Point, current: Point, offset: Point, alpha: number, yaw: number, pitch: number): FighterEye {
  const a = clamp(alpha, 0, 1);
  out.x = prev.x + (current.x - prev.x) * a + offset.x;
  out.y = prev.y + (current.y - prev.y) * a + offset.y + 1.17;
  out.z = prev.z + (current.z - prev.z) * a + offset.z;
  out.yaw = yaw;
  out.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
  return out;
}

export function fightAvatarVisible(local: boolean, fighter: boolean, results: boolean, distanceSq: number): boolean {
  if (local && !results) return false;
  return fighter || distanceSq >= 4;
}

export function assistedFightYaw(yaw: number, target: number, touch: boolean, dt: number): number {
  if (!touch) return yaw;
  const limit = 1.2 * clamp(dt, 0, 1 / 30);
  return yaw + clamp(wrapAngle(target - yaw), -limit, limit);
}
