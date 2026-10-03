// Комната «пейнтбол» для хаба: связывает соединения с игроками Game, отдаёт итоги раундов и AFK наверх.
import { MAX_HUMANS } from '../../shared/constants.ts';
import type { ClientMsg, PbStatus } from '../../shared/messages.ts';
import type { Input } from '../../shared/sim.ts';
import type { Client, Hub, Room } from '../hub.ts';
import { Game, type Player } from './game.ts';

export class PaintballRoom implements Room {
  readonly kind = 'paintball' as const;
  readonly game: Game;
  private readonly hub: Hub;
  private readonly byClient = new Map<Client, Player>();
  private readonly byPlayer = new Map<Player, Client>();

  constructor(hub: Hub) {
    this.hub = hub;
    this.game = new Game({
      roundEnd: (p, r, won, mvp) => {
        const c = this.byPlayer.get(p);
        if (c) hub.onPaintballRound(c, p, r, won, mvp);
      },
      afk: (p) => {
        const c = this.byPlayer.get(p);
        if (c) hub.onPaintballAfk(c);
      },
    });
  }

  get humans(): number {
    return this.byClient.size;
  }

  get tick(): number {
    return this.game.tick;
  }

  hasSpace(): boolean {
    return this.game.humanCount < MAX_HUMANS;
  }

  join(c: Client): boolean {
    const prof = c.profile;
    if (!prof || this.byClient.has(c)) return false;
    const p = this.game.addHuman({ pid: prof.id, nick: prof.nick, level: prof.level, outfit: this.hub.outfitOf(prof) }, c.sink);
    if (!p) return false;
    p.ping = c.ping;
    this.byClient.set(c, p);
    this.byPlayer.set(p, c);
    return true;
  }

  leave(c: Client): void {
    const p = this.byClient.get(c);
    if (!p) return;
    this.byClient.delete(c);
    this.byPlayer.delete(p);
    this.game.removePlayer(p.id);
  }

  /** Колпак дурака надели или сняли — новый наряд уйдёт в ближайшем списке игроков. */
  outfitChanged(c: Client): void {
    const p = this.byClient.get(c);
    if (!p || !c.profile) return;
    p.level = c.profile.level;
    p.name = c.profile.nick;
    p.outfit = this.hub.outfitOf(c.profile);
    this.game.touchRoster();
  }

  playerOf(c: Client): Player | undefined {
    return this.byClient.get(c);
  }

  onInputs(c: Client, inputs: Input[], count: number): void {
    const p = this.byClient.get(c);
    if (p) this.game.onInputs(p, inputs, count);
  }

  onMessage(c: Client, msg: ClientMsg): void {
    if (msg.t !== 'pull') return;
    const p = this.byClient.get(c);
    if (p) this.game.onPull(p);
  }

  /** Команда из чата (/restart, /bots…) */
  command(c: Client, text: string): void {
    const p = this.byClient.get(c);
    if (p) this.game.command(p, text);
  }

  /** Команда игрока (для цвета ника в общем чате), −1 — не здесь */
  teamOf(c: Client): number {
    return this.byClient.get(c)?.team ?? -1;
  }

  status(): PbStatus {
    return this.game.status();
  }

  step(): void {
    for (const [c, p] of this.byClient) p.ping = c.ping;
    this.game.step();
  }
}
