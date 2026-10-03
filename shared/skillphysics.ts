// Same fixed-step jelly physics as the aquapark, with locally owned moving boxes.
import { moverU } from './aquadyn.ts';
import { PLAYER_HALF, PLAYER_HEIGHT } from './constants.ts';
import { TAU, sinCos } from './math.ts';
import type { SkillHazard, SkillMap } from './skillmap.ts';
import type { Input, PlayerState, StepEvents } from './sim.ts';
import { pushPlayer, stepPlayer } from './sim.ts';
import type { CollisionWorld } from './world.ts';

export function skillHazardPhase(h: SkillHazard, tick: number): number { return ((tick - h.phase) % h.period + h.period) % h.period; }
export function skillHazardAngle(h: SkillHazard, tick: number): number { return skillHazardPhase(h, tick) / h.period * TAU; }
export function skillPulseState(h: SkillHazard, tick: number): 'safe' | 'warn' | 'hit' {
  const p = skillHazardPhase(h, tick);
  return p >= 150 && p < 174 ? 'hit' : p >= 102 && p < 150 ? 'warn' : 'safe';
}
export class SkillDynamics {
  private readonly map: SkillMap;
  private readonly world: CollisionWorld;
  constructor(map: SkillMap, world: CollisionWorld) { this.map = map; this.world = world; }
  place(tick: number): void {
    this.map.movers.forEach((m, n) => {
      const i = this.map.moverIndices[n], u = moverU(m, tick), w = this.world;
      w.minX[i] = m.x0 + m.dx * u; w.maxX[i] = m.x1 + m.dx * u;
      w.minZ[i] = m.z0 + m.dz * u; w.maxZ[i] = m.z1 + m.dz * u;
      w.minY[i] = m.top - 1 + m.dy * u; w.maxY[i] = m.top + m.dy * u;
    });
  }
  before(s: PlayerState, inp: Input, prev: number): void {
    // Carry only from a recent known input; after a tab pause a platform cannot teleport its rider.
    const t = inp.viewTick;
    const old = Number.isFinite(prev) && t >= prev && t - prev <= 3 ? prev : t;
    this.place(old);
    let rider = -1;
    if (s.grounded) for (const i of this.map.moverIndices) {
      if (Math.abs(s.y - this.world.maxY[i]) < 0.04 && s.x + PLAYER_HALF > this.world.minX[i] && s.x - PLAYER_HALF < this.world.maxX[i] && s.z + PLAYER_HALF > this.world.minZ[i] && s.z - PLAYER_HALF < this.world.maxZ[i]) { rider = i; break; }
    }
    const n = this.map.moverIndices.indexOf(rider);
    this.place(t);
    if (n >= 0) {
      const m = this.map.movers[n], du = moverU(m, t) - moverU(m, old);
      // Horizontal carry must collide with the other course boxes; lifting is done before the player's step.
      pushPlayer(s, this.world, m.dx * du, m.dy * du, m.dz * du);
    }
  }
  after(s: PlayerState, inp: Input, _ev: StepEvents): void {
    if (s.dashCd > 78) return; // short deterministic knock immunity (normal dash cooldown is below this)
    for (const h of this.map.hazards) {
      if (s.y > h.top + 0.82 || s.y + PLAYER_HEIGHT < h.top + 0.2) continue;
      let hit = false, kx = 0, kz = 1;
      const dx = s.x - h.x, dz = s.z - h.z;
      if (h.kind === 'pulse') hit = skillPulseState(h, inp.viewTick) === 'hit' && Math.abs(dx) < h.radius && Math.abs(dz) < 2.6;
      else {
        const sc = { s: 0, c: 0 }; sinCos(skillHazardAngle(h, inp.viewTick), sc);
        const along = dx * sc.c + dz * sc.s, across = -dx * sc.s + dz * sc.c;
        hit = Math.abs(along) <= h.radius + PLAYER_HALF && Math.abs(across) < 0.22 + PLAYER_HALF;
        kx = -sc.s * (along >= 0 ? 1 : -1); kz = sc.c * (along >= 0 ? 1 : -1);
      }
      if (!hit) continue;
      s.vx = kx * 13; s.vz = kz * 13; s.vy = 5.5;
      s.grounded = 0; s.coyote = 0; s.jumpBuf = 0; s.dashT = 0; s.dashCd = 108;
      break;
    }
  }
  step(s: PlayerState, inp: Input, prev: number, ev: StepEvents): void {
    this.before(s, inp, prev); stepPlayer(s, inp, this.world, false, 0, ev); this.after(s, inp, ev);
  }
}
