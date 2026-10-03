import type { Outfit } from './outfit.ts';
export const BR_COURSE = 'azure-bay-v1';
export const BR_MAX = 6;
export const BR_LAPS = 3;
export const BR_GRID_TICKS = 180;
export const BR_LIMIT = 5 * 60 * 60;
export const BR_RESULTS_TICKS = 600;
export const BR_NITRO_TICKS = 90;
export const BR_RADIUS = 1.05;
export type BoatRacePhase = 'grid' | 'race' | 'results';
export interface BoatState {
  x: number; z: number; vx: number; vz: number; hx: number; hz: number; steer: number;
  seg: number; cp: number; lap: number; done: number; rt: number; prevButtons: number;
  nitro: number; boost: number; ghost: number; off: number; respawns: number;
}
export interface BoatEvents { checkpoint: boolean; lap: boolean; finish: boolean; boost: boolean; respawn: boolean; hit: number }
export function makeBoatState(): BoatState { return { x: 0, z: 0, vx: 0, vz: 0, hx: 1, hz: 0, steer: 0, seg: 0, cp: 0, lap: 0, done: 0, rt: 0, prevButtons: 0, nitro: 0, boost: 0, ghost: 0, off: 0, respawns: 0 }; }
export function makeBoatEvents(): BoatEvents { return { checkpoint: false, lap: false, finish: false, boost: false, respawn: false, hit: 0 }; }
export interface BoatRaceReward { total: number; finish: number; place: number; pos: number }
export function boatRaceReward(pos: number, activeTicks: number): BoatRaceReward {
  const finish = Math.max(5, Math.floor(Math.min(180 * 60, Math.max(0, activeTicks)) / 3600 * 11));
  const place = [3, 2, 1, 0, 0, 0][pos - 1] ?? 0;
  return { total: finish + place, finish, place, pos };
}
export interface BoatRaceResultRow { id: number; pid: number; nick: string; bot: boolean; pos: number; finished: boolean; ticks: number; bestLap: number; respawns: number }
export interface BoatRacePeer { level: number; id: number; pid: number; nick: string; bot: boolean; outfit: Outfit; x: number; z: number; hx: number; hz: number; speed: number; steer: number; lap: number; cp: number; pos: number; boost: number; ghost: number; done: number }
export interface BoatRaceStatus { phase: BoatRacePhase; left: number; n: number; names: string[]; laps: number; course: string }
export type BoatRaceServerMsg =
  | { t: 'brState'; course: string; tick: number; id: number; ack: number; phase: BoatRacePhase; phaseEnd: number; reset: number; state: BoatState; bestLap: number; lapStart: number; raceStart: number; peers: BoatRacePeer[] }
  | { t: 'brEnd'; results: BoatRaceResultRow[] }
  | { t: 'brReward'; row: BoatRaceResultRow; reward: BoatRaceReward | null };
