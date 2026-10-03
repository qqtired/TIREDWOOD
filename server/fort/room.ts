// Комната «Крепость» для хаба: одна на процесс (есть, только если режим включён флагом сервера). Связывает соединения
// с защитниками FortGame, итоги игры и AFK отдаёт наверх через хуки.
import { FORT_MAX_HUMANS, type FortResultRow, type FortRunRec, type FortStatus, type FtReward } from '../../shared/fort.ts';
import { FT_BREAK, FT_GATHER } from '../../shared/fort.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import type { Input } from '../../shared/sim.ts';
import type { Client, Room } from '../hub.ts';
import type { Profile } from '../store.ts';
import { FortGame, type FortPlayer } from './game.ts';

/**
 * Флаг сервера FORTRESS: '1' — режим включён, '0' — выключен, без переменной — только в разработке (--dev).
 * На боевом сайте переменной нет — до «да» владельца крепости не видно.
 */
export function fortEnabled(v: string | undefined, dev: boolean): boolean {
  if (v === '1') return true;
  if (v === '0') return false;
  return dev;
}

export interface FortRoomHooks {
  outfitOf(p: Profile): Outfit;
  /** Итог игры человеку, дождавшемуся итогов (reward null — ни одной отбитой волны) */
  result(c: Client, row: FortResultRow, reward: FtReward | null, win: boolean, wave: number): void;
  /** 90 с без дела — на набережную */
  afk(c: Client): void;
  /** Рекорды крепости (State.fortTop) и запись забега; свой лучший защитника */
  top?(): readonly FortRunRec[];
  saveRun?(rec: FortRunRec): void;
  best?(c: Client): number;
  /** Только в разработке: /wave N в чате */
  dev?: boolean;
}

export class FortRoom implements Room {
  readonly kind = 'fort' as const;
  readonly game: FortGame;
  private readonly hooks: FortRoomHooks;
  private readonly byClient = new Map<Client, FortPlayer>();
  private readonly byPlayer = new Map<FortPlayer, Client>();

  constructor(hooks: FortRoomHooks) {
    this.hooks = hooks;
    this.game = new FortGame({
      result: (p, row, reward, win, wave) => {
        const c = this.byPlayer.get(p);
        if (c) hooks.result(c, row, reward, win, wave);
      },
      afk: (p) => {
        const c = this.byPlayer.get(p);
        if (c) hooks.afk(c);
      },
      top: () => hooks.top?.() ?? [],
      saveRun: (rec) => hooks.saveRun?.(rec),
      best: (p) => {
        const c = this.byPlayer.get(p);
        return c && hooks.best ? hooks.best(c) : 0;
      },
    });
    this.game.debug = hooks.dev ?? false;
  }

  get humans(): number {
    return this.byClient.size;
  }

  get tick(): number {
    return this.game.tick;
  }

  hasSpace(): boolean {
    return this.game.humanCount < FORT_MAX_HUMANS;
  }

  /** Ожидание загрузки (server/readygate.ts): сбор и передышка стоят, пока вошедшие не загрузились */
  get prestart(): { phaseEnd: number } | null { return this.game.phase === FT_GATHER || this.game.phase === FT_BREAK ? this.game : null; }

  join(c: Client): boolean {
    const prof = c.profile;
    if (!prof || this.byClient.has(c)) return false;
    const p = this.game.addHuman({ pid: prof.id, nick: prof.nick, level: prof.level, outfit: this.hooks.outfitOf(prof) }, c.sink);
    if (!p) return false;
    p.ping = c.ping;
    this.byClient.set(c, p);
    this.byPlayer.set(p, c);
    return true;
  }

  leave(c: Client): void {
    const p = this.byClient.get(c);
    if (!p) return;
    // сначала игра: выплата жетонов за отбитые волны идёт через хук result — ему нужно соединение
    this.game.removePlayer(p.id);
    this.byClient.delete(c);
    this.byPlayer.delete(p);
  }

  /** Колпак дурака надели или сняли — новый наряд уйдёт в ближайшем составе. */
  outfitChanged(c: Client): void {
    const p = this.byClient.get(c);
    if (!p || !c.profile) return;
    p.level = c.profile.level;
    p.name = c.profile.nick;
    p.outfit = this.hooks.outfitOf(c.profile);
    this.game.touchRoster();
  }

  playerOf(c: Client): FortPlayer | undefined {
    return this.byClient.get(c);
  }

  onInputs(c: Client, inputs: Input[], count: number): void {
    const p = this.byClient.get(c);
    if (p) this.game.onInputs(p, inputs, count);
  }

  /** E у стойки: {t:'use', id} — номер стойки на карте крепости */
  onMessage(c: Client, msg: ClientMsg): void {
    if (msg.t !== 'use' || typeof msg.id !== 'number') return;
    const p = this.byClient.get(c);
    if (p) this.game.use(p, msg.id);
  }

  /** Команда из чата (/kill, /help) */
  command(c: Client, text: string): void {
    const p = this.byClient.get(c);
    if (p) this.game.command(p, text);
  }

  status(): FortStatus {
    return this.game.status();
  }

  step(): void {
    for (const [c, p] of this.byClient) p.ping = c.ping;
    this.game.step();
  }
}
