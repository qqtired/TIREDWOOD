import { BOAT_RIDE_TICKS, BP_RIDE, ridePose } from '../../shared/boat.ts';
import { TICK_RATE } from '../../shared/constants.ts';
import type { BoatStatus } from '../../shared/messages.ts';

export const KRAKEN_START = BOAT_RIDE_TICKS / 2 - 3 * TICK_RATE;
export const KRAKEN_END = BOAT_RIDE_TICKS / 2 + 3 * TICK_RATE;
export const KRAKEN_CUE = KRAKEN_START + 0.7 * TICK_RATE;
const midpoint = ridePose(BOAT_RIDE_TICKS / 2);
/** Со стороны открытого моря, в 12 м от курса. Ближайшая точка маршрута проверена тестом. */
const ANCHOR = {
  x: midpoint.x - Math.cos(midpoint.yaw) * 12 - Math.sin(midpoint.yaw) * 2,
  z: midpoint.z + Math.sin(midpoint.yaw) * 12 - Math.cos(midpoint.yaw) * 2,
};
const smooth = (x: number): number => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

export interface KrakenFrame {
  x: number;
  z: number;
  yaw: number;
  /** Секунды с начала появления. */
  age: number;
  progress: number;
  emerge: number;
}

/** Абсолютные часы катера: одинаковая фаза при любом FPS и после позднего входа. */
export function krakenFrame(renderTick: number, boat: BoatStatus): KrakenFrame | null {
  if (boat.ph !== BP_RIDE || !Number.isFinite(renderTick) || !Number.isFinite(boat.at)) return null;
  const k = renderTick - boat.at;
  if (k < KRAKEN_START || k >= KRAKEN_END) return null;
  const age = (k - KRAKEN_START) / TICK_RATE;
  return {
    ...ANCHOR,
    yaw: Math.atan2(midpoint.x - ANCHOR.x, midpoint.z - ANCHOR.z),
    age, progress: age / 6,
    emerge: smooth(age / 1.05) * (1 - smooth((age - 4.05) / 1.95)),
  };
}

/** Однократный тихий акцент. Поздний вход/возврат во вкладку не догоняет старый звук. */
export class KrakenCue {
  private trip: number | null = null;
  private previous = 0;
  private consumed = false;

  update(renderTick: number, boat: BoatStatus, audible: boolean): boolean {
    if (boat.ph !== BP_RIDE || !Number.isFinite(renderTick) || !Number.isFinite(boat.at)) return false;
    const cue = boat.at + KRAKEN_CUE;
    if (this.trip !== boat.at) {
      this.trip = boat.at;
      this.previous = renderTick;
      this.consumed = renderTick >= cue;
      return false;
    }
    const previous = this.previous;
    this.previous = Math.max(previous, renderTick);
    if (this.consumed || renderTick < cue) return false;
    this.consumed = true;
    return audible && previous < cue && renderTick - previous <= TICK_RATE && renderTick - cue <= 0.35 * TICK_RATE;
  }

  reset(): void { this.trip = null; this.previous = 0; this.consumed = false; }
}
