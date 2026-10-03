import { BR_MAX, type BoatRaceResultRow, type BoatRaceReward, type BoatRaceStatus } from '../../shared/boatrace.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import type { Input } from '../../shared/sim.ts';
import type { Client, Room } from '../hub.ts';
import type { Profile } from '../store.ts';
import { BoatRace, type BoatRaceOptions, type BoatRacer } from './game.ts';
export function boatRaceEnabled(v: string | undefined, dev: boolean): boolean { return v === '1' ? true : v === '0' ? false : dev; }
export interface BoatRaceRoomHooks { outfitOf(p: Profile): Outfit; result(c: Client, row: BoatRaceResultRow, reward: BoatRaceReward | null): void; over(clients: Client[]): void; announce?(text: string): void; afk?(c: Client): void }
export class BoatRaceRoom implements Room {
  readonly kind = 'boatrace' as const; race: BoatRace | null = null;
  private readonly hooks: BoatRaceRoomHooks; private readonly options: BoatRaceOptions; private readonly clients = new Map<Client, BoatRacer>();
  constructor(hooks: BoatRaceRoomHooks, options: BoatRaceOptions = {}) { this.hooks = hooks; this.options = options; }
  get idle(): boolean { return !this.race || this.race.closed; }
  get humans(): number { return this.clients.size; }
  get tick(): number { return this.race?.tick ?? 0; }
  hasSpace(): boolean { return !!this.race && !this.race.closed && !this.race.started && this.humans < BR_MAX; }
  open(): void {
    if (!this.idle) return; this.clients.clear();
    this.race = new BoatRace({ result: (p, row, reward) => { for (const [c, player] of this.clients) if (p === player) this.hooks.result(c, row, reward); }, over: () => this.hooks.over([...this.clients.keys()]), afk: p => { for (const [c, player] of this.clients) if (p === player) this.hooks.afk?.(c); }, announce: text => this.hooks.announce?.(text) }, this.options);
  }
  launch(): void { this.race?.start(); }
  join(c: Client): boolean { if (!c.profile || !this.hasSpace() || this.clients.has(c)) return false; const p = this.race!.addHuman({ pid: c.pid, level: c.profile.level, nick: c.nick, outfit: this.hooks.outfitOf(c.profile) }, c.sink); if (!p) return false; this.clients.set(c, p); return true; }
  leave(c: Client): void { const p = this.clients.get(c); if (p) this.race?.removePlayer(p.id); this.clients.delete(c); }
  playerOf(c: Client): BoatRacer | undefined { return this.clients.get(c); }
  onRename(c: Client): void { const p = this.clients.get(c); if (p) p.nick = c.nick; }
  outfitChanged(c: Client): void { const p = this.clients.get(c); if (p && c.profile) p.outfit = this.hooks.outfitOf(c.profile); }
  onInputs(c: Client, inputs: Input[], count: number): void { const p = this.clients.get(c); if (p) this.race?.onInputs(p, inputs, count); }
  onMessage(c: Client, msg: ClientMsg): void { const p = this.clients.get(c); if (p && msg.t === 'use' && msg.id === 0) this.race?.recover(p); }
  status(): BoatRaceStatus | null { return this.idle ? null : this.race!.status(); }
  step(): void { for (const [c, p] of this.clients) if (c.profile) p.level = c.profile.level; if (!this.idle) this.race!.step(); }
}
