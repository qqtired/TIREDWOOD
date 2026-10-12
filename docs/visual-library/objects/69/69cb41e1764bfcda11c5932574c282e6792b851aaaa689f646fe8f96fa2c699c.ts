import type { FishNpcAction, FishSpotSnapshot, LobbyEvent } from './messages.ts';
import type { FishNpcId } from './fishplaces.ts';

export type PondIntent =
  | { t: 'fish'; a: 'cast' | 'hook' | 'keep' | 'release'; n?: number }
  | { t: 'reel'; i: number; k: number[]; u: number; d?: number }
  | { t: 'fishNpc'; npc?: FishNpcId; a: FishNpcAction; rod?: number; item?: string; n?: number; boat?: string }
  | { t: 'fishBag'; a: 'release'; n: number };

/** Epoch и turn от приветствия комнаты защищают от старой шкалы после перехода. */
export type FarmPondClientMsg =
  | { t: 'farmPondSeat'; seat: number | null; epoch: number }
  | { t: 'farmPondAct'; epoch: number; turn: number; intent: PondIntent };

export type FarmPondServerMsg =
  | { t: 'farmPond'; fish: FishSpotSnapshot[]; seats: number[]; now: number; epoch: number; turn: number }
  | { t: 'farmPondEv'; e: LobbyEvent[]; epoch: number };
