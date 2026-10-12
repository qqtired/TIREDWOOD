import { TICK_RATE } from '../../shared/constants.ts';
import type { PlayerState } from '../../shared/sim.ts';
export type BigEventKind = 'storm' | 'pirates';
/** Epoch milliseconds; lockUntil reserves the worst-case end + gap across an abrupt restart. */
export interface LobbyEventMeta { stormAt: number; piratesAt: number; endedAt: number; lockUntil?: number }
export interface EventPlayer { pid: number; slot: number; nick: string; state: PlayerState; eligible: boolean }
export interface EventStats { stStorms?: number; stLights?: number; prRaids?: number; prWins?: number; prKos?: number }
export interface EventHost {
  players(): readonly EventPlayer[];
  award(pid: number, tokens: number, stats: EventStats): void;
  chat(text: string): void;
}
export interface LargeEvent { readonly active: boolean; start(tick: number, id: string): void; step(tick: number): void }
export const BIG_GAP_MS = 30 * 60_000;
export const STORM_COOLDOWN_MS = 2 * 60 * 60_000;
export const PIRATE_COOLDOWN_MS = 3 * 60 * 60_000;
const MAX_DURATION_MS = { storm: 60_000 + 180_000 + 30_000, pirates: 30_000 + 240_000 + 14_000 };
export function eveningMoscow(ms: number): boolean { const hour = new Date(ms + 3 * 3600_000).getUTCHours(); return hour >= 18; }
export function eventFlag(raw: string | undefined, dev: boolean): boolean { return raw === '1' || raw === undefined && dev; }
export interface EventDirectorOptions {
  storm?: LargeEvent | null; pirates?: LargeEvent | null;
  now?: () => number; random?: () => number; humans(): number; rain(): boolean;
  meta?: LobbyEventMeta; save(meta: LobbyEventMeta): void;
  devStorm?: boolean; devPirates?: boolean;
}
export class LobbyEvents {
  readonly meta: LobbyEventMeta;
  private readonly o: EventDirectorOptions;
  private readonly now: () => number;
  private readonly random: () => number;
  private running: BigEventKind | null = null;
  private nextCheck = 0;
  private devStorm: boolean;
  private devPirates: boolean;
  constructor(o: EventDirectorOptions) {
    this.o = o; this.now = o.now ?? Date.now; this.random = o.random ?? Math.random;
    this.meta = { stormAt: 0, piratesAt: 0, endedAt: 0, lockUntil: 0, ...o.meta };
    this.devStorm = !!o.devStorm; this.devPirates = !!o.devPirates;
  }
  /** Hold natural rain and reject the fishing weather drum while true. */
  get busy(): boolean { return !!this.running || !!this.o.storm?.active || !!this.o.pirates?.active; }
  get active(): boolean { return this.busy || this.devStorm && !!this.o.storm || this.devPirates && !!this.o.pirates; }
  canStart(kind: BigEventKind): boolean {
    const now = this.now(), last = kind === 'storm' ? this.meta.stormAt : this.meta.piratesAt;
    return !this.busy && !this.o.rain() && this.o.humans() >= 3 && eveningMoscow(now)
      && (!last || now - last >= (kind === 'storm' ? STORM_COOLDOWN_MS : PIRATE_COOLDOWN_MS))
      && (!this.meta.endedAt || now - this.meta.endedAt >= BIG_GAP_MS) && now >= (this.meta.lockUntil ?? 0);
  }
  step(tick: number): void {
    this.o.storm?.step(tick); this.o.pirates?.step(tick);
    if (this.running && !this.o[this.running]?.active) {
      this.meta.endedAt = this.now(); this.meta.lockUntil = this.meta.endedAt + BIG_GAP_MS;
      this.o.save({ ...this.meta }); this.running = null;
    }
    if (this.busy || this.o.rain()) return;
    if (tick >= 10 * TICK_RATE) {
      if (this.devStorm && this.o.storm) { this.devStorm = false; this.begin('storm', tick); return; }
      if (this.devPirates && this.o.pirates) { this.devPirates = false; this.begin('pirates', tick); return; }
    }
    if (tick < this.nextCheck) return;
    this.nextCheck = tick + 60 * TICK_RATE;
    const order: BigEventKind[] = this.random() < .5 ? ['storm', 'pirates'] : ['pirates', 'storm'];
    for (const kind of order) if (this.o[kind] && this.canStart(kind) && this.random() < .12) { this.begin(kind, tick); return; }
  }
  /** Команда разработчика: начать событие сразу, если сейчас не идёт другое (правила вечера, паузы и дождя не проверяются) */
  force(kind: BigEventKind, tick: number): boolean {
    if (this.busy || !this.o[kind]) return false;
    this.begin(kind, tick);
    return true;
  }
  private begin(kind: BigEventKind, tick: number): void {
    const now = this.now();
    this.meta[kind === 'storm' ? 'stormAt' : 'piratesAt'] = now;
    this.meta.lockUntil = now + MAX_DURATION_MS[kind] + BIG_GAP_MS;
    // Persist the reservation before publishing an event or granting any reward.
    this.o.save({ ...this.meta }); this.running = kind; this.o[kind]!.start(tick, `${kind}:${now}`);
  }
}
