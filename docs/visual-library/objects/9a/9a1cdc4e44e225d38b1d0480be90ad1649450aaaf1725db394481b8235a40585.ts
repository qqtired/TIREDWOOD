// Комната «Fight Club» для хаба (только с флагом FIGHT): одна на процесс. Хаб открывает бой (open) с режимом
// и списком бойцов из круга у двери, переводит туда всех из круга (лишние — зрителями) и запускает (launch).
// Пока бой идёт, спуститься можно зрителем. Итоги людям и «всех наверх» уходят в хаб через хуки.
import { FC_CAPACITY, type FcMode, type FcResultRow, type FcReward } from '../../shared/fight.ts';
import { FP_INTRO } from '../../shared/fight.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import type { Input } from '../../shared/sim.ts';
import type { Client, Room } from '../hub.ts';
import type { Profile } from '../store.ts';
import { FightGame, type FcPlayer, type FightOptions } from './game.ts';

/** Флаг FIGHT: 1 — включить, 0 — выключить, без переменной — только в разработке (--dev). */
export function fightEnabled(v: string | undefined, dev: boolean): boolean {
  if (v === '1') return true;
  if (v === '0') return false;
  return dev;
}

export interface FightRoomHooks {
  outfitOf(p: Profile): Outfit;
  /** Итог бойцу-человеку: жетоны и статистика */
  result(c: Client, row: FcResultRow, reward: FcReward): void;
  /** Итоги показаны — этих вернуть на набережную */
  over(clients: Client[]): void;
  announce(text: string): void;
}

export class FightRoom implements Room {
  readonly kind = 'fight' as const;
  game: FightGame | null = null;
  private readonly hooks: FightRoomHooks;
  private readonly opts: FightOptions;
  private readonly byClient = new Map<Client, FcPlayer>();
  private readonly byPlayer = new Map<FcPlayer, Client>();
  /** Кого ждём бойцами (номера профилей из круга) — остальные входят зрителями */
  private fighters = new Set<number>();

  constructor(hooks: FightRoomHooks, opts: FightOptions = {}) {
    this.hooks = hooks;
    this.opts = opts;
  }

  /** Боя нет — можно собирать новый */
  get idle(): boolean {
    return !this.game || this.game.closed;
  }

  get humans(): number {
    return this.byClient.size;
  }

  get tick(): number {
    return this.game?.tick ?? 0;
  }

  hasSpace(): boolean {
    return !this.idle && this.byClient.size < FC_CAPACITY;
  }

  /** Ожидание загрузки (server/readygate.ts): вступление первого раунда стоит, пока все не загрузились */
  get prestart(): { phaseEnd: number } | null { const g = this.game; return g && g.started && !g.closed && g.phase === FP_INTRO && g.round === 1 ? g : null; }

  /** Новый бой: режим и кто в нём дерётся (по номерам профилей). */
  open(mode: FcMode, fighterPids: number[]): void {
    this.byClient.clear();
    this.byPlayer.clear();
    this.fighters = new Set(fighterPids);
    this.game = new FightGame(mode, {
      result: (p, row, reward) => {
        const c = this.byPlayer.get(p);
        if (c) this.hooks.result(c, row, reward);
      },
      over: () => this.hooks.over([...this.byClient.keys()]),
      announce: (text) => this.hooks.announce(text),
    }, this.opts);
  }

  /** Старт. Никто так и не спустился — бой закрываем. */
  launch(): void {
    if (!this.game) return;
    if (this.byClient.size === 0) this.game.closed = true;
    else this.game.start();
  }

  /** Для картона у двери: режим, раунд, счёт, кто дерётся (null — боя нет) */
  status(): { mode: FcMode; round: number; score: number[]; names: string[] } | null {
    return this.idle ? null : this.game!.status();
  }

  join(c: Client): boolean {
    const prof = c.profile;
    const g = this.game;
    if (!prof || !g || !this.hasSpace() || this.byClient.has(c)) return false;
    const p = g.addHuman({ pid: prof.id, nick: prof.nick, level: prof.level, outfit: this.hooks.outfitOf(prof) }, c.sink, this.fighters.has(prof.id));
    if (!p) return false;
    this.byClient.set(c, p);
    this.byPlayer.set(p, c);
    return true;
  }

  leave(c: Client): void {
    const p = this.byClient.get(c);
    if (!p) return;
    this.byClient.delete(c);
    this.byPlayer.delete(p);
    const g = this.game;
    if (!g) return;
    g.removePlayer(p.id);
    // людей не осталось — бой больше никому не нужен
    if (this.byClient.size === 0) g.closed = true;
  }

  /** Колпак дурака надели или сняли — новый наряд уйдёт в ближайшем составе. */
  outfitChanged(c: Client): void {
    const p = this.byClient.get(c);
    if (!p || !c.profile) return;
    p.level = c.profile.level;
    p.nick = c.profile.nick;
    p.outfit = this.hooks.outfitOf(c.profile);
    this.game?.touchRoster();
  }

  playerOf(c: Client): FcPlayer | undefined {
    return this.byClient.get(c);
  }

  onInputs(c: Client, inputs: Input[], count: number): void {
    const p = this.byClient.get(c);
    if (p && this.game) this.game.onInputs(p, inputs, count);
  }

  onMessage(c: Client, msg: ClientMsg): void {
    const p = this.byClient.get(c);
    if (!p || !this.game) return;
    if (msg.t === 'emote') this.game.emote(p, msg.e);
  }

  step(): void {
    if (!this.idle) this.game!.step();
  }
}
