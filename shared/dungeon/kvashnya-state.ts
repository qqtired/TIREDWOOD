import type { DgSim, DgMob } from './types.ts';

/** Rounded up: no hit precedes its authored GLB frame. All values are simulation ticks. */
export const KVASHNYA_TIMING = {
  cycle: 180,
  tongue: { windup: 27, attack: 15, impact: 5, recover: 30 },
  jump: { windup: 38, attack: 19, impact: 18, recover: 33, takeoff: 4 },
} as const;
function clearMarks(sim: DgSim, m: DgMob): void {
  for (const mk of sim.marks) if (mk.src === m.id) mk.t1 = sim.t - 1;
}
export function cancelKvashnya(sim: DgSim, m: DgMob): void {
  if (m.attackAt === undefined || (m.attackKind !== 'tongue' && m.attackKind !== 'jump')) return;
  const timing = KVASHNYA_TIMING[m.attackKind];
  if (sim.t - m.attackAt >= timing.windup) return; // A launched jump must reach its safe landing.
  clearMarks(sim, m);
  m.attackAt = sim.t; m.attackKind = 'recover'; m.attackStep = 0; m.st = 'rest'; m.stT = sim.t;
  m.cd = Math.max(m.cd, KVASHNYA_TIMING.tongue.recover);
  m.kx = m.kz = 0;
}

