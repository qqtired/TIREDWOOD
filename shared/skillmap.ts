import type { AquaMover } from './aqua.ts';
import type { GameMap } from './maps/types.ts';
import { SKILL_CHECKPOINTS, SKILL_SECTIONS, SKILL_TOP } from './skilltest.ts';

export interface SkillPad { x: number; z: number; w: number; d: number; y: number; color: number; section: number }
export interface SkillHazard { kind: 'pulse' | 'sweep'; x: number; z: number; top: number; radius: number; period: number; phase: number }
export interface SkillMap extends GameMap { pads: SkillPad[]; movers: AquaMover[]; moverIndices: number[]; hazards: SkillHazard[] }
export function makeSkillMap(): SkillMap {
  const pads: SkillPad[] = [];
  const movers: AquaMover[] = [];
  const hazards: SkillHazard[] = [];
  const pad = (section: number, x: number, z: number, w: number, d: number, y = SKILL_TOP) => pads.push({ x, z, w, d, y, section, color: SKILL_SECTIONS[Math.min(section, 7)].color });
  const ferry = (section: number, x: number, dx: number, z = 0, dy = 0) => movers.push({ kind: dy ? 'lift' : 'ferry', x0: x - 2, x1: x + 2, z0: z - 2, z1: z + 2, top: SKILL_TOP, dx, dy, dz: 0, rest: 75, go: 150, stay: 75, back: 150, phase: 0, color: SKILL_SECTIONS[section].color });
  // Safe decks also serve as visible, numbered checkpoints; no hazard reaches them.
  for (let i = 0; i < SKILL_CHECKPOINTS.length; i++) pad(i, i * 30, 0, 6, 8);
  for (const x of [9, 18, 25]) pad(0, x, 0, 5, 6);
  ferry(1, 36, 18);
  pad(2, 75, 0, 24, 4.4);
  for (const x of [69, 77, 84]) hazards.push({ kind: 'pulse', x, z: 0, top: 40, radius: 1.5, period: 210, phase: (x - 69) * 12 });
  for (let i = 0; i < 5; i++) pad(3, 96 + i * 5.2, i % 2 ? -1.8 : 1.8, 2.4, 2.4);
  for (const x of [128, 139]) { pad(4, x, 0, 8, 6); hazards.push({ kind: 'sweep', x, z: 0, top: 40, radius: 3.5, period: 240, phase: x * 2 }); }
  pad(4, 146, 0, 3, 4);
  ferry(5, 156, 0, 0, 4);
  pad(5, 162, 0, 5, 5, 44);
  pad(5, 169, -1, 4, 4, 42.7);
  pad(5, 175, 1, 3.5, 3.5, 41.3);
  for (let i = 0; i < 5; i++) {
    const x = 186 + i * 5.1;
    movers.push({ kind: 'sink', x0: x - 1.55, x1: x + 1.55, z0: -1.6, z1: 1.6, top: 40, dx: 0, dy: -8, dz: 0, rest: 180, go: 30, stay: 70, back: 30, phase: i * 34, color: SKILL_SECTIONS[6].color });
  }
  ferry(7, 216, 7);
  pad(7, 230, 0, 4, 3.2);
  hazards.push({ kind: 'pulse', x: 230, z: 0, top: 40, radius: 1.5, period: 210, phase: 90 });
  pad(7, 235, 1, 2.5, 2.5);
  const boxes: GameMap['boxes'] = pads.map(p => ({ min: [p.x - p.w / 2, p.y - 1, p.z - p.d / 2], max: [p.x + p.w / 2, p.y, p.z + p.d / 2], mat: 'deck', color: p.color }));
  const moverIndices = movers.map(m => { const i = boxes.length; boxes.push({ min: [m.x0, m.top - 1, m.z0], max: [m.x1, m.top, m.z1], mat: 'deck', color: m.color }); return i; });
  return { name: 'Выше облаков', boxes, pads, movers, moverIndices, hazards, spawns: [{ ...SKILL_CHECKPOINTS[0], team: 0 }], trampolines: [], pickups: [], deco: [], bounds: { minX: -10, maxX: 250, minZ: -20, maxZ: 20 } };
}
