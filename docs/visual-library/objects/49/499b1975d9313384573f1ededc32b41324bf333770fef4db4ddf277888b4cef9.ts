// Круг мелом у двери «Fight Club» на набережной (только с флагом FIGHT): кто стоит в круге — по порядку входа,
// первый — хозяин (E меняет режим: 1 на 1 → 2 на 2 → каждый за себя), отсчёт (круг полон — короче), спуск в подвал:
// первые по очереди — бойцами, остальные — зрителями. Пока внизу бой — E у двери спускает зрителем.
import { TICK_RATE } from '../../shared/constants.ts';
import { FC_CIRCLE, FC_COUNT_FULL_TICKS, FC_COUNT_TICKS, FC_FIGHTERS, FC_MODES, type FcMode, type FcStatus } from '../../shared/fight.ts';
import { isHeld } from '../../shared/lobby.ts';
import { inStartCircle } from '../../shared/startzones.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import type { Client } from '../hub.ts';
import { syncCircleMembers } from '../lobby/modequeue.ts';

export interface GatherMember {
  client: Client;
  state: { x: number; y: number; z: number };
  action: number;
}

export interface GatherHost<P extends GatherMember> {
  players(): Iterable<P>;
  toast(c: Client, text: string): void;
  broadcast(msg: ServerMsg): void;
  /** Внизу идёт бой: что писать на картоне (null — боя нет) */
  fight(): { mode: FcMode; round: number; score: number[]; names: string[] } | null;
  /** Отсчёт кончился: бойцы и зрители — вниз */
  start(fighters: Client[], crowd: Client[], mode: FcMode): void;
  /** Спуститься зрителем, пока идёт бой */
  watch(c: Client): void;
}

export class FightGather<P extends GatherMember> {
  mode: FcMode = 'duel';
  private readonly host: GatherHost<P>;
  /** Кто в круге — по порядку входа (Set хранит порядок) */
  private readonly circle = new Set<P>();
  private countEnd = 0;
  private shown = '';
  private tick = 0;

  constructor(host: GatherHost<P>) {
    this.host = host;
  }

  /** Кто в круге (кроме проверочного входа и сидящих), отсчёт и спуск. Картон — при каждом изменении. */
  step(tick: number): void {
    this.tick = tick;
    syncCircleMembers(this.circle, this.host.players(), p =>
      !p.client.ephemeral && !isHeld(p.action) && inStartCircle(p.state, FC_CIRCLE));
    const fight = this.host.fight();
    if (fight || this.circle.size === 0) {
      this.countEnd = 0;
      if (!fight) this.mode = 'duel';
    } else {
      const full = this.circle.size >= FC_FIGHTERS[this.mode];
      if (this.countEnd === 0) this.countEnd = tick + (full ? FC_COUNT_FULL_TICKS : FC_COUNT_TICKS);
      else if (full) this.countEnd = Math.min(this.countEnd, tick + FC_COUNT_FULL_TICKS);
      if (tick >= this.countEnd) {
        this.countEnd = 0;
        const all = [...this.circle].map((p) => p.client);
        const n = FC_FIGHTERS[this.mode];
        const mode = this.mode;
        this.circle.clear();
        this.host.start(all.slice(0, n), all.slice(n), mode);
      }
    }
    const st = this.status();
    const key = JSON.stringify(st);
    if (key !== this.shown) {
      this.shown = key;
      this.host.broadcast({ t: 'fcSt', ...st });
    }
  }

  /** E у круга: хозяин меняет режим; остальным — кто хозяин; идёт бой — спуститься посмотреть. */
  use(p: P): void {
    const c = p.client;
    if (c.ephemeral) return;
    if (this.host.fight()) {
      this.host.watch(c);
      return;
    }
    const first = this.circle.values().next().value;
    if (!first || !this.circle.has(p)) {
      this.host.toast(c, 'Встань в круг — бой начнётся сам');
      return;
    }
    if (first !== p) {
      this.host.toast(c, `Режим выбирает ${first.client.nick}: в круг встал первым`);
      return;
    }
    this.mode = FC_MODES[(FC_MODES.indexOf(this.mode) + 1) % FC_MODES.length];
  }

  drop(p: P): void {
    this.circle.delete(p);
  }

  status(): FcStatus {
    const fight = this.host.fight();
    if (fight) return { phase: 'fight', mode: fight.mode, left: 0, names: fight.names, host: '', round: fight.round, score: fight.score };
    if (this.countEnd > 0) {
      const names = [...this.circle].map((p) => p.client.nick);
      const left = Math.max(0, Math.ceil((this.countEnd - this.tick) / TICK_RATE));
      return { phase: 'count', mode: this.mode, left, names, host: names[0] ?? '', round: 0, score: [] };
    }
    return { phase: 'idle', mode: this.mode, left: 0, names: [], host: '', round: 0, score: [] };
  }
}
