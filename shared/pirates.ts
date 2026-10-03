import { DT, TICK_RATE } from './constants.ts';
import { pushPlayer, type Input, type PlayerState } from './sim.ts';
import type { CollisionWorld } from './world.ts';
export const PIRATE_MAX = 16;
export const PIRATE_WARN = 40 * TICK_RATE;
export const PIRATE_LIMIT = 4 * 60 * TICK_RATE;
export const PIRATE_END = 15 * TICK_RATE;
export const PIRATE_SWING = 30;
export const PIRATE_RANGE = 3.2;
export const PIRATE_CHEST = { x: 4, z: 8 };
export const PIRATE_LANDINGS = [{ x: 2, z: 20 }, { x: 14, z: 20 }, { x: 21, z: 20 }] as const;
export const PIRATE_SHIP = { x: 9, z: 39 };
export type PiratePhase = 'idle' | 'warn' | 'raid' | 'end';
export interface PirateResult { pid: number; nick: string; kos: number; tokens: number; mvp: boolean }
export interface PirateView { id: string; phase: PiratePhase; start: number; end: number; wave: number; win: boolean; results: PirateResult[] }
export const emptyPirates = (): PirateView => ({ id: '', phase: 'idle', start: 0, end: 0, wave: 0, win: false, results: [] });
export interface RaidKnock { at: number; until: number; vx: number; vz: number }
export const noRaidKnock = (): RaidKnock => ({ at: 0, until: 0, vx: 0, vz: 0 });
export interface PirateSnap { id: number; x: number; z: number; hp: number; captain: boolean; rage: boolean; carrying: boolean; yaw: number }
export interface PirateTail { visible: boolean; wave: number; chestX: number; chestZ: number; carrier: number; knock: RaidKnock; pirates: PirateSnap[] }
export const emptyPirateTail = (): PirateTail => ({ visible: false, wave: 0, chestX: 0, chestZ: 0, carrier: 0, knock: noRaidKnock(), pirates: [] });
export function pirateCount(wave: number, humans: number): number { return Math.min(PIRATE_MAX, (wave === 1 ? 4 : wave === 3 ? 7 : 6) + Math.max(0, Math.floor(humans) - 4)); }
export function pirateReward(kos: number, win: boolean, mvp: boolean): number { return Math.min(20, Math.max(0, kos) * 2) + (win ? 20 + (mvp ? 10 : 0) : 0); }
export function pirateInput(s: PlayerState, input: Input, tick: number, knock: RaidKnock): Input {
  if (tick < knock.at || tick >= knock.until) return input;
  s.dashT = 0; s.jumpBuf = 0; s.vx = 0; s.vz = 0;
  return { ...input, buttons: 0 };
}
export function piratePush(s: PlayerState, world: CollisionWorld, tick: number, knock: RaidKnock): void {
  if (tick >= knock.at && tick < knock.until) pushPlayer(s, world, knock.vx * DT, 0, knock.vz * DT);
}
