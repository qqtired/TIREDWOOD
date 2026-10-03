// Крысиные бега (флаг сервера RATRACE, shared/ratrace.ts): понтон у набережной, ставка жетонами на крысу. Первая ставка
// открывает приём на 15 с (каждый новый игрок — +3 с, всего не больше 30 с с первой ставки), забег идёт 12 с у всех на
// глазах; порядок на финише и сид забега — crypto.randomInt на сервере. Ставка уходит в залог профиля и пишется на диск;
// выплата — когда забег кончился, даже если игрок ушёл; после аварийного рестарта залог возвращается (server/profiles.ts).
import { randomInt } from 'node:crypto';
import type { ServerMsg } from '../../shared/messages.ts';
import {
  RAT_ANNOUNCE, RAT_CENTER, RAT_COUNT, RAT_MAX_BET, RAT_MIN_BET, RAT_OPEN_MS, RAT_RUN_MS, RATS, isRatIndex, ratDrawOrder, ratExtend, ratOdds,
  ratPayout, ratShuffle, type RatBetView, type RatLast, type RatRaceView,
} from '../../shared/ratrace.ts';
import type { Profiles } from '../profiles.ts';
import type { RouletteWho } from './roulette.ts';

/** Кто ставит: тот же, что у рулетки (живой игрок с профилем и где стоит) */
export type RatWho = RouletteWho;

export interface RatHost {
  now(): number;
  send(pid: number, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
  announce(text: string): void;
  /** Жетоны поменялись */
  changed(pid: number): void;
}

/** Ставку принимают не дальше этого от центра арены, м */
const RAT_BET_R = 9;

/** Стоит ли у арены (для ставки) */
export function atRatTrack(x: number, y: number, z: number): boolean {
  return Math.hypot(x - RAT_CENTER.x, z - RAT_CENTER.z) <= RAT_BET_R && Math.abs(y) <= 2;
}

interface Bet extends RatBetView {
  round: string;
}

const fmt = new Intl.NumberFormat('ru-RU');

export class RatTrack {
  /** Равномерное целое 0…n−1: коэффициенты, порядок на финише, сид (в тестах подменяется) */
  rand: (n: number) => number = (n) => randomInt(n);
  private readonly host: RatHost;
  private readonly profiles: Profiles;
  private phase: RatRaceView['phase'] = 'idle';
  /** Номер забега, к которому относятся текущие коэффициенты */
  private race = 1;
  private odds: number[];
  private bets: Bet[] = [];
  /** Когда поставили первым в этом забеге (от него — потолок отсчёта) и до когда приём или забег */
  private openedAt = 0;
  private until = 0;
  private seed = 0;
  private order: number[] | null = null;
  private last: RatLast | null = null;
  private readonly tag = `${Date.now().toString(36)}-${randomInt(1 << 30).toString(36)}`;

  constructor(host: RatHost, profiles: Profiles) {
    this.host = host;
    this.profiles = profiles;
    this.odds = this.card();
  }

  /** Идёт ли забег (приём ставок или бег): комнату надо шагать, даже если в ней никого нет, — иначе ставки зависнут */
  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /** Болеть можно, пока идёт приём ставок или забег */
  get cheerable(): boolean {
    return this.phase !== 'idle';
  }

  view(): RatRaceView {
    return {
      phase: this.phase, left: this.phase === 'idle' ? 0 : Math.max(0, this.until - this.host.now()), race: this.race, odds: [...this.odds],
      bets: this.bets.map(({ pid, nick, rat, stake }) => ({ pid, nick, rat, stake })),
      ...(this.phase === 'run' && this.order ? { seed: this.seed, order: [...this.order] } : {}),
      ...(this.last ? { last: this.last } : {}),
    };
  }

  /** Ставка amount жетонов на крысу rat; race — номер забега, чьи коэффициенты видел игрок */
  bet(who: RatWho, rat: unknown, amount: unknown, race: unknown): void {
    const no = (text: string): void => this.host.send(who.pid, { t: 'ratBet', ok: false, text });
    if (!isRatIndex(rat)) return;
    // отсчёт мог кончиться между тиками — сначала догоняем часы
    this.step();
    if (!atRatTrack(who.x, who.y, who.z)) return no('Подойди к арене крысиных бегов');
    if (this.phase === 'run') return no('Забег уже идёт — ставь на следующий');
    if (race !== this.race) return no('Коэффициенты обновились — глянь на них ещё раз');
    if (this.bets.some((b) => b.pid === who.pid)) return no('Ты уже поставил в этом забеге');
    if (who.profile.ratEscrow) return no('Твоя прошлая ставка ещё не рассчитана');
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < RAT_MIN_BET) return no(`Ставка — от ${RAT_MIN_BET} 🪙`);
    if (amount > RAT_MAX_BET) return no(`Ставка — не больше ${RAT_MAX_BET} 🪙`);
    const tokens = who.profile.tokens;
    if (tokens < RAT_MIN_BET) return no(`Нет жетонов на ставку — нужно хотя бы ${RAT_MIN_BET} 🪙`);
    if (tokens < amount) return no(`Не хватает жетонов: у тебя ${tokens} 🪙`);
    const round = `${this.tag}-${this.race}`;
    if (!this.profiles.reserveRat(who.pid, round, amount)) return no('Ставка не принята');
    this.bets.push({ pid: who.pid, nick: who.nick, rat, stake: amount, round });
    const now = this.host.now();
    if (this.phase === 'idle') {
      // первая ставка — 15 с до старта, даже если игрок один
      this.phase = 'open';
      this.openedAt = now;
      this.until = now + RAT_OPEN_MS;
    } else {
      // новый игрок в забеге (ставка у каждого одна) — +3 с, но не дальше 30 с от первой ставки
      this.until = ratExtend(this.openedAt, this.until);
    }
    this.host.send(who.pid, { t: 'ratBet', ok: true, text: `Ставка принята: ${RATS[rat].name} · ${amount} 🪙` });
    this.host.changed(who.pid);
    this.publish();
    this.step();
  }

  /** Каждый тик комнаты: конец приёма — старт (сид и порядок на финише); конец забега — выплаты */
  step(): void {
    const now = this.host.now();
    if (this.phase === 'open' && now >= this.until) {
      this.phase = 'run';
      this.seed = this.rand(2 ** 31 - 1);
      this.order = ratDrawOrder(this.odds, this.rand);
      this.until = now + RAT_RUN_MS;
      this.publish();
    } else if (this.phase === 'run' && now >= this.until) {
      this.settle();
    }
  }

  /** Коэффициенты нового забега: шесть форм дня крысам в случайном порядке */
  private card(): number[] {
    return ratOdds(ratShuffle(RAT_COUNT, this.rand));
  }

  private settle(): void {
    const order = this.order ?? ratDrawOrder(this.odds, this.rand);
    const winner = order[0];
    const wins: RatLast['wins'] = [];
    for (const b of this.bets) {
      const payout = ratPayout(b.stake, b.rat, this.odds, winner);
      if (!this.profiles.settleRat(b.pid, b.round, payout)) continue;
      this.host.send(b.pid, { t: 'ratResult', race: this.race, rat: b.rat, stake: b.stake, payout, winner });
      this.host.changed(b.pid);
      if (payout > 0) wins.push({ nick: b.nick, payout });
      if (payout >= RAT_ANNOUNCE) {
        this.host.announce(`🐀 ${b.nick} поставил на ${RATS[b.rat].name} (×${this.odds[b.rat]}) и выиграл ${fmt.format(payout)} 🪙!`);
      }
    }
    wins.sort((a, b) => b.payout - a.payout);
    this.last = { race: this.race, order: [...order], odds: [...this.odds], wins };
    // следующий забег — с новыми коэффициентами
    this.race++;
    this.odds = this.card();
    this.bets = [];
    this.phase = 'idle';
    this.openedAt = 0;
    this.until = 0;
    this.seed = 0;
    this.order = null;
    this.publish();
  }

  private publish(): void {
    this.host.broadcast({ t: 'rat', v: this.view() });
  }
}
