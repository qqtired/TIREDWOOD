import { SKILL_CAPACITY, SKILL_COURSE, type SkillStatus } from '../../shared/skilltest.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import type { Input } from '../../shared/sim.ts';
import type { Client, Room } from '../hub.ts';
import type { Profile } from '../store.ts';
import { SkillGame, type SkillPlayer, type SkillRace, type SkillReward } from './game.ts';

const DEV = process.argv.includes('--dev');

export interface SkillRoomHooks {
  outfitOf(p: Profile): Outfit;
  afk?(c: Client): void;
  /** Позвонил в колокол: профиль и жетоны; null — без награды (гость) */
  result?(c: Client, ticks: number, falls: number, place: number): SkillReward | null;
}

export class SkillRoom implements Room {
  readonly kind = 'skill' as const;
  readonly game = new SkillGame();
  private readonly hooks: SkillRoomHooks;
  private readonly clients = new Map<Client, SkillPlayer>();
  constructor(hooks: SkillRoomHooks) {
    this.hooks = hooks;
    this.game.onAfk = (p) => { for (const [c, player] of this.clients) if (p === player) hooks.afk?.(c); };
    this.game.onFinish = (p, ticks, falls, place) => {
      for (const [c, player] of this.clients) if (p === player) return hooks.result?.(c, ticks, falls, place) ?? null;
      return null;
    };
    this.game.onChat = (text) => {
      for (const c of this.clients.keys()) c.sink.sendJson({ t: 'chat', from: '', pid: 0, room: 'skill', team: -1, text, sys: true });
    };
  }
  get humans(): number { return this.clients.size; }
  get tick(): number { return this.game.tick; }
  /**
   * Сбор забега для экрана загрузки (server/readygate.ts): пока кто-то грузится, он сдвигает phaseEnd — старт ждёт.
   * Живой объект забега, не копия.
   */
  get prestart(): SkillRace | null { return this.game.race.phase === 'pre' ? this.game.race : null; }
  hasSpace(): boolean { return this.humans < SKILL_CAPACITY; }
  join(c: Client): boolean {
    if (!c.profile || this.clients.has(c)) return false;
    const best = c.profile.stats?.skBest ?? 0;
    const p = this.game.addHuman({ pid: c.pid, level: c.profile.level, nick: c.nick, outfit: this.hooks.outfitOf(c.profile), best }, c.sink);
    if (!p) return false;
    this.clients.set(c, p);
    return true;
  }
  leave(c: Client): void { const p = this.clients.get(c); if (p) this.game.removePlayer(p.id); this.clients.delete(c); }
  playerOf(c: Client): SkillPlayer | undefined { return this.clients.get(c); }
  onRename(c: Client): void { const p = this.clients.get(c); if (p) p.nick = c.nick; }
  outfitChanged(c: Client): void { const p = this.clients.get(c); if (p && c.profile) p.outfit = this.hooks.outfitOf(c.profile); }
  onInputs(c: Client, inputs: Input[], count: number): void { const p = this.clients.get(c); if (p) this.game.onInputs(p, inputs, count); }
  onMessage(c: Client, msg: ClientMsg): void { const p = this.clients.get(c); if (p && msg.t === 'use' && typeof msg.id === 'number') this.game.use(p, msg.id); }
  command(c: Client, text: string): void {
    const p = this.clients.get(c);
    if (!p) return;
    if (text === '/kill' || text === '/respawn') this.game.use(p, 1);
    // проверка участков в разработке: /cp 5 — на пятый флажок, /tp x y z — в точку (на боевом сервере команд нет)
    const cp = DEV ? /^\/cp (\d)$/.exec(text) : null;
    if (cp) this.game.devCheckpoint(p, Number(cp[1]));
    const tp = DEV ? /^\/tp (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)$/.exec(text) : null;
    if (tp) this.game.devTeleport(p, Number(tp[1]), Number(tp[2]), Number(tp[3]));
  }
  status(): SkillStatus {
    const race = this.game.race;
    const left = race.phase === 'pre' ? Math.max(0, Math.ceil((race.phaseEnd - this.game.tick) / 60)) : 0;
    return { n: this.humans, max: SKILL_CAPACITY, names: [...this.clients.keys()].map((c) => c.nick), course: SKILL_COURSE, phase: race.phase, left };
  }
  step(): void { for (const [c, p] of this.clients) if (c.profile) p.level = c.profile.level; this.game.step(); }
}
