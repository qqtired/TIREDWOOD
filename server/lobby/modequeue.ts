import { TICK_RATE } from '../../shared/constants.ts';
import { inStartCircle, type CirclePosition, type GatherStatus, type StartCircle } from '../../shared/startzones.ts';

/** The karting circle's arrival order: a jump keeps the member; leaving removes it immediately. */
export function syncCircleMembers<T>(members: Set<T>, players: Iterable<T>, inside: (player: T) => boolean): void {
  const seen = new Set<T>();
  for (const player of players) {
    if (inside(player)) { seen.add(player); members.add(player); }
    else members.delete(player);
  }
  for (const player of members) if (!seen.has(player)) members.delete(player);
}

interface QueueOptions<T> {
  center: StartCircle;
  min: number | (() => number); max: number; ticks: number;
  players(): Iterable<T>;
  inside(player: T): boolean;
  position(player: T): CirclePosition;
  nick(player: T): string;
  idle(): boolean;
  start(players: T[]): void;
}

/** One bounded arrival-order gather for the boat race and hide-and-seek entrances. */
export class ModeQueue<T> {
  private readonly options: QueueOptions<T>;
  private readonly members = new Set<T>();
  private until = 0;
  private minimum(): number { return typeof this.options.min === 'function' ? this.options.min() : this.options.min; }
  constructor(options: QueueOptions<T>) { this.options = options; }
  drop(player: T): void { this.members.delete(player); if (this.members.size < this.minimum()) this.until = 0; }
  step(tick: number): void {
    const o = this.options;
    syncCircleMembers(this.members, o.players(), player => o.inside(player) && inStartCircle(o.position(player), o.center));
    if (!o.idle() || this.members.size < this.minimum()) { this.until = 0; return; }
    if (!this.until) this.until = tick + o.ticks;
    else if (tick >= this.until) {
      const players = [...this.members].slice(0, o.max);
      this.until = 0;
      players.forEach(player => this.members.delete(player));
      o.start(players);
    }
  }
  view(tick: number): GatherStatus {
    return { phase: this.until ? 'count' : 'idle', left: this.until ? Math.max(0, Math.ceil((this.until - tick) / TICK_RATE)) : 0,
      n: this.members.size, max: this.options.max, names: [...this.members].map(p => this.options.nick(p)) };
  }
}
