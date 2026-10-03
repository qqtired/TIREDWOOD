import { SKILL_CAPACITY, SKILL_COURSE, type SkillStatus } from '../../shared/skilltest.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import type { Input } from '../../shared/sim.ts';
import type { Client, Room } from '../hub.ts';
import type { Profile } from '../store.ts';
import { SkillGame, type SkillPlayer } from './game.ts';
export interface SkillRoomHooks { outfitOf(p: Profile): Outfit; afk?(c: Client): void }
export class SkillRoom implements Room {
  readonly kind = 'skill' as const;
  readonly game = new SkillGame();
  private readonly hooks: SkillRoomHooks;
  private readonly clients = new Map<Client, SkillPlayer>();
  constructor(hooks: SkillRoomHooks) {
    this.hooks = hooks;
    this.game.onAfk = p => { for (const [c, player] of this.clients) if (p === player) hooks.afk?.(c); };
  }
  get humans(): number { return this.clients.size; }
  get tick(): number { return this.game.tick; }
  hasSpace(): boolean { return this.humans < SKILL_CAPACITY; }
  join(c: Client): boolean {
    if (!c.profile || this.clients.has(c)) return false;
    const p = this.game.addHuman({ pid: c.pid, level: c.profile.level, nick: c.nick, outfit: this.hooks.outfitOf(c.profile) }, c.sink);
    if (!p) return false;
    this.clients.set(c, p); return true;
  }
  leave(c: Client): void { const p = this.clients.get(c); if (p) this.game.removePlayer(p.id); this.clients.delete(c); }
  playerOf(c: Client): SkillPlayer | undefined { return this.clients.get(c); }
  onRename(c: Client): void { const p = this.clients.get(c); if (p) p.nick = c.nick; }
  outfitChanged(c: Client): void { const p = this.clients.get(c); if (p && c.profile) p.outfit = this.hooks.outfitOf(c.profile); }
  onInputs(c: Client, inputs: Input[], count: number): void { const p = this.clients.get(c); if (p) this.game.onInputs(p, inputs, count); }
  onMessage(c: Client, msg: ClientMsg): void { const p = this.clients.get(c); if (p && msg.t === 'use' && typeof msg.id === 'number') this.game.use(p, msg.id); }
  command(c: Client, text: string): void { const p = this.clients.get(c); if (p && (text === '/kill' || text === '/respawn')) this.game.use(p, 1); }
  status(): SkillStatus { return { n: this.humans, max: SKILL_CAPACITY, names: [...this.clients.keys()].map(c => c.nick), course: SKILL_COURSE }; }
  step(): void { for (const [c, p] of this.clients) if (c.profile) p.level = c.profile.level; this.game.step(); }
}
