// Столы дурака в кафе «Чайка»: кто где сидит, готовность, отсчёт, партия по shared/durak.ts, боты
// и автопилот за отошедших, сроки ходов, помидоры и реакции. Открытое состояние стола — всем на набережной,
// рука — только хозяину. Порядок игроков — по часовой стрелке (если смотреть сверху): ход переходит налево.
import { randomInt, randomUUID } from 'node:crypto';
import { BOT_NAMES, TICK_MS } from '../../shared/constants.ts';
import {
  DK_AWAY_TICKS, DK_BOT_MAX, DK_BOT_MIN, DK_COUNT_TICKS, DK_REACT_TICKS, DK_RESULT_TICKS, DK_SHOW_TICKS, DK_TAKE_TICKS,
  DK_TOMATO_TICKS, DK_TURN_TICKS, REACTIONS, autoMove, botMove, canPass, epaulets, newGame, passAll, play, resolve,
  shuffledDeck, viewOf, waiting, type Durak, type DurakMode, type DurakMove,
} from '../../shared/durak.ts';
import { TABLE_SEATS, TABLE_ZS, seatChair, seatTable, tableSeat } from '../../shared/maps/lobby.ts';
import { hash32 } from '../../shared/math.ts';
import type { DurakPhase, DurakTableView, LobbyEvent, ServerMsg } from '../../shared/messages.ts';
import { randomOutfit, type Outfit } from '../../shared/outfit.ts';

export const TABLE_COUNT = TABLE_ZS.length;

/** Действия за столом: не больше 10 за секунду с одного места */
const ACT_WINDOW = 60;
const ACT_MAX = 10;
const NEVER = -1e9;

export interface DurakSeat {
  /** 0 — пусто, 1 — человек, 2 — бот */
  k: 0 | 1 | 2;
  /** Номер человека на набережной; 0 — участник отошёл, место держится за ним */
  slot: number;
  pid: number;
  nick: string;
  /** Наряд бота (людей одевает набережная) */
  outfit: Outfit | null;
  ready: boolean;
  stake: boolean;
  /** Номер в партии, −1 — не играет */
  p: number;
  /** Тик, когда участник отошёл */
  awayAt: number;
  /** Порядок, в котором садились: кто раньше — выбирает режим; какого бота убрать */
  seq: number;
  /** Бот на месте ушедшего: после партии уходит */
  temp: boolean;
  tomatoAt: number;
  reactAt: number;
  actAt: number;
  acts: number;
  /** Последняя отправленная рука */
  sent: string;
}

export interface DurakTable {
  readonly t: number;
  phase: DurakPhase;
  mode: DurakMode;
  ante: number;
  round: string;
  stakes: Array<{ pid: number; chair: number; wager: number }>;
  readonly seats: DurakSeat[];
  game: Durak | null;
  /** Номер в партии → стул */
  order: number[];
  /** Конец отсчёта или показа итога */
  phaseEnd: number;
  /** Срок хода */
  deadline: number;
  /** Когда походят боты и автопилот (0 — некому) */
  botAt: number;
  /** Пауза перед «бито» / «взял» (0 — нет) */
  showUntil: number;
  result: { fool: number; ep: boolean; first: number; payouts?: Array<{ pid: number; wager: number; payout: number }> } | null;
  /** Прошлый дурак — для раздачи «под дурака»: профиль человека или имя бота */
  lastFool: { pid: number; nick: string } | null;
  dirty: boolean;
}

export interface DurakPlayerResult {
  pid: number;
  slot: number;
  nick: string;
  bot: boolean;
  fool: boolean;
  first: boolean;
  /** Сидел за столом в конце партии */
  present: boolean;
}

export interface DurakResult {
  table: number;
  players: DurakPlayerResult[];
  ep: boolean;
  draw: boolean;
}

export interface DurakHooks {
  reserve?(round: string, bets: readonly { pid: number; amount: number }[]): boolean;
  settle?(round: string, payouts: readonly { pid: number; wager: number; payout: number }[]): boolean;
  /** Одному на набережной */
  send(slot: number, msg: ServerMsg): void;
  /** Всем на набережной */
  broadcast(msg: ServerMsg): void;
  /** В ближайший снимок (помидор, реакция) */
  event(e: LobbyEvent): void;
  toast(slot: number, text: string): void;
  /** Партия кончилась: жетоны, колпак, объявление — это хаб */
  finished(r: DurakResult): void;
}

function emptySeat(): DurakSeat {
  return {
    k: 0, slot: 0, pid: 0, nick: '', outfit: null, ready: false, stake: false, p: -1, awayAt: 0, seq: 0, temp: false,
    tomatoAt: NEVER, reactAt: NEVER, actAt: NEVER, acts: 0, sent: '',
  };
}

function botOutfit(t: number, chair: number, name: string): Outfit {
  return randomOutfit(hash32(tableSeat(t, chair), BOT_NAMES.indexOf(name)));
}

export class DurakHall {
  readonly tables: DurakTable[];
  private readonly hooks: DurakHooks;
  private readonly deck: () => number[];
  private readonly rand: () => number;
  private readonly allowedTables: ReadonlySet<number>;
  private tick = 0;
  private seq = 0;

  constructor(hooks: DurakHooks, opts: { deck?: () => number[]; rand?: () => number; allowedTables?: readonly number[] } = {}) {
    this.hooks = hooks;
    this.deck = opts.deck ?? (() => shuffledDeck((n) => randomInt(n)));
    this.rand = opts.rand ?? Math.random;
    this.allowedTables = new Set(opts.allowedTables ?? Array.from({ length: TABLE_COUNT }, (_, t) => t));
    this.tables = Array.from({ length: TABLE_COUNT }, (_, t) => ({
      t, phase: 'wait' as DurakPhase, mode: 'throw' as DurakMode, ante: 10, round: '', stakes: [], seats: Array.from({ length: TABLE_SEATS }, emptySeat), game: null,
      order: [], phaseEnd: 0, deadline: 0, botAt: 0, showUntil: 0, result: null, lastFool: null, dirty: false,
    }));
  }

  table(t: number): DurakTable {
    return this.tables[t];
  }

  get busy(): number { return this.tables.reduce((n, table) => n + table.stakes.length, 0); }
  get active(): boolean { return this.busy > 0; }

  shutdown(): void { for (const table of this.tables) if (table.stakes.length) this.clear(table); }

  private seatAt(seat: number): { tb: DurakTable; s: DurakSeat; ch: number } | null {
    const tb = this.tables[seatTable(seat)];
    if (!tb || !this.allowedTables.has(tb.t) || !Number.isInteger(seat) || seat < 0) return null;
    const ch = seatChair(seat);
    return { tb, s: tb.seats[ch], ch };
  }

  // ------------------------------------------------------------ места

  /** Свободно или это своё отложенное место (бот, чужая бронь, сидящий — нельзя). */
  canSit(seat: number, pid: number): boolean {
    const at = this.seatAt(seat);
    if (!at) return false;
    const { s } = at;
    return s.k === 0 || (s.k === 1 && s.slot === 0 && s.pid === pid);
  }

  sit(seat: number, slot: number, pid: number, nick: string): void {
    const at = this.seatAt(seat);
    if (!at) return;
    const { tb, s } = at;
    if (s.k === 1 && s.slot === 0 && s.pid === pid) {
      // вернулся на своё место — снова сам за себя
      s.slot = slot;
      s.awayAt = 0;
      s.nick = nick;
      s.sent = '';
      tb.dirty = true;
      this.sendHands(tb);
      this.schedule(tb);
      return;
    }
    if (s.k !== 0) return;
    Object.assign(s, emptySeat(), { k: 1, slot, pid, nick, seq: ++this.seq });
    tb.dirty = true;
    if (tb.phase === 'wait' || tb.phase === 'count') this.recount(tb);
  }

  /** Встал или ушёл. Участник идущей партии — место держится за ним, за него ходит автопилот. */
  stand(seat: number, slot: number): void {
    const at = this.seatAt(seat);
    if (!at) return;
    const { tb, s } = at;
    if (s.k !== 1 || s.slot !== slot) return;
    tb.dirty = true;
    if ((tb.phase === 'play' || tb.phase === 'result') && s.p >= 0) {
      s.slot = 0;
      s.ready = false;
      s.awayAt = this.tick;
      this.schedule(tb);
      return;
    }
    Object.assign(s, emptySeat());
    this.afterLeave(tb);
  }

  rename(pid: number, nick: string): void {
    for (const tb of this.tables) {
      for (const s of tb.seats) {
        if (s.k === 1 && s.pid === pid) {
          s.nick = nick;
          tb.dirty = true;
        }
      }
    }
  }

  // ------------------------------------------------------------ действия

  act(seat: number, slot: number, a: unknown, card: unknown, on: unknown): void {
    const at = this.seatAt(seat);
    if (!at) return;
    const { tb, s, ch } = at;
    if (s.k !== 1 || s.slot !== slot) return;
    if (this.tick - s.actAt >= ACT_WINDOW) {
      s.actAt = this.tick;
      s.acts = 0;
    }
    if (++s.acts > ACT_MAX) return;
    const n = typeof on === 'number' && Number.isInteger(on) ? on : -1;
    const c = typeof card === 'number' && Number.isInteger(card) ? card : -1;
    switch (a) {
      case 'ante':
        if ((tb.phase === 'wait' || tb.phase === 'count') && ch === this.modeBy(tb) && [10,20,50].includes(n) && tb.ante !== n) {
          tb.ante = n;
          for (const seat of tb.seats) if (seat.k === 1) seat.ready = false;
          this.recount(tb);
        }
        return;
      case 'stake':
        if ((tb.phase === 'wait' || tb.phase === 'count' || tb.phase === 'result') && (n === 0 || n === 1) && s.stake !== (n === 1)) {
          s.stake = n === 1; s.ready = false; tb.dirty = true;
          if (tb.phase !== 'result') this.recount(tb);
        }
        return;
      case 'ready':
        this.setReady(tb, s, n === 1);
        return;
      case 'bot':
        this.addBot(tb);
        return;
      case 'unbot':
        this.removeBot(tb);
        return;
      case 'mode':
        this.setMode(tb, ch, s, n);
        return;
      case 'tomato':
        this.tomato(tb, ch, n);
        return;
      case 'react':
        this.react(tb, ch, n);
        return;
      case 'attack':
      case 'transfer':
        this.move(tb, s, { a, card: c });
        return;
      case 'beat':
        this.move(tb, s, { a: 'beat', card: c, on: n });
        return;
      case 'take':
      case 'pass':
        this.move(tb, s, { a });
        return;
    }
  }

  private setReady(tb: DurakTable, s: DurakSeat, on: boolean): void {
    if ((tb.phase !== 'wait' && tb.phase !== 'count' && tb.phase !== 'result') || s.ready === on) return;
    s.ready = on;
    tb.dirty = true;
    // Согласие на следующую партию не сокращает показ текущего итога.
    if (tb.phase !== 'result') this.recount(tb);
  }

  private addBot(tb: DurakTable): void {
    if (tb.phase !== 'wait' && tb.phase !== 'count') return;
    const ch = tb.seats.findIndex((s) => s.k === 0);
    if (ch < 0) return;
    const name = this.botName(tb);
    Object.assign(tb.seats[ch], emptySeat(), { k: 2, nick: name, outfit: botOutfit(tb.t, ch, name), ready: true, seq: ++this.seq });
    tb.dirty = true;
    this.recount(tb);
  }

  /** Убрать последнего добавленного бота. */
  private removeBot(tb: DurakTable): void {
    if (tb.phase !== 'wait' && tb.phase !== 'count') return;
    let last: DurakSeat | null = null;
    for (const s of tb.seats) if (s.k === 2 && (!last || s.seq > last.seq)) last = s;
    if (!last) return;
    Object.assign(last, emptySeat());
    tb.dirty = true;
    this.recount(tb);
  }

  private setMode(tb: DurakTable, ch: number, s: DurakSeat, n: number): void {
    if ((tb.phase !== 'wait' && tb.phase !== 'count') || (n !== 0 && n !== 1)) return;
    if (ch !== this.modeBy(tb)) {
      this.hooks.toast(s.slot, 'Режим выбирает тот, кто сел за стол первым');
      return;
    }
    const mode: DurakMode = n === 1 ? 'transfer' : 'throw';
    if (mode === tb.mode) return;
    tb.mode = mode;
    tb.seats.forEach((s, i) => {
      if (s.k === 1 && i !== ch) s.ready = false;
    });
    tb.dirty = true;
    this.recount(tb);
  }

  /** Режим выбирает человек, который сел раньше всех (−1 — людей нет). */
  private modeBy(tb: DurakTable): number {
    let best = -1;
    tb.seats.forEach((s, i) => {
      if (s.k === 1 && s.slot !== 0 && (best < 0 || s.seq < tb.seats[best].seq)) best = i;
    });
    return best;
  }

  private tomato(tb: DurakTable, ch: number, target: number): void {
    const s = tb.seats[ch];
    const to = tb.seats[target];
    if (!to || target === ch || to.k === 0 || (to.k === 1 && to.slot === 0)) return;
    if (this.tick - s.tomatoAt < DK_TOMATO_TICKS) return;
    s.tomatoAt = this.tick;
    this.hooks.event(['tomato', tb.t, ch, target]);
  }

  private react(tb: DurakTable, ch: number, k: number): void {
    const s = tb.seats[ch];
    if (k < 0 || k >= REACTIONS.length || this.tick - s.reactAt < DK_REACT_TICKS) return;
    s.reactAt = this.tick;
    this.hooks.event(['react', tb.t, ch, k]);
  }

  private move(tb: DurakTable, s: DurakSeat, m: DurakMove): void {
    const g = tb.game;
    if (tb.phase !== 'play' || !g || s.p < 0 || tb.showUntil !== 0) return;
    if (!play(g, s.p, m)) return;
    this.changed(tb, m.a !== 'pass');
  }

  // ------------------------------------------------------------ ход партии

  /** После хода: срок (если менялся стол), пауза перед «бито»/«взял», руки, боты. */
  private changed(tb: DurakTable, moved: boolean): void {
    const g = tb.game!;
    tb.dirty = true;
    if (moved) tb.deadline = this.tick + (g.taking ? DK_TAKE_TICKS : DK_TURN_TICKS);
    const w = waiting(g);
    if ((w === 'bito' || w === 'took') && tb.showUntil === 0) tb.showUntil = this.tick + DK_SHOW_TICKS;
    this.sendHands(tb);
    this.schedule(tb);
  }

  /** Кого ждём: ходящего, отбивающегося или всех, кто может подкинуть и не сказал «Пас». */
  private actors(g: Durak): number[] {
    const w = waiting(g);
    if (w === 'lead') return [g.attacker];
    if (w === 'defend') return [g.defender];
    const list: number[] = [];
    if (w === 'throw' || w === 'take') for (let p = 0; p < g.n; p++) if (canPass(g, p)) list.push(p);
    return list;
  }

  /** За этого игрока ходит программа: бот или отошедший человек. */
  private isAuto(tb: DurakTable, p: number): boolean {
    const s = tb.seats[tb.order[p]];
    return s.k === 2 || (s.k === 1 && s.slot === 0);
  }

  private schedule(tb: DurakTable): void {
    tb.botAt = 0;
    const g = tb.game;
    if (tb.phase !== 'play' || !g || tb.showUntil !== 0) return;
    if (this.actors(g).some((p) => this.isAuto(tb, p))) {
      tb.botAt = this.tick + DK_BOT_MIN + Math.floor(this.rand() * (DK_BOT_MAX - DK_BOT_MIN + 1));
    }
  }

  /** Боты и автопилот: первый не-пас из их ходов; если у всех «Пас» — пасуют разом. */
  private botStep(tb: DurakTable): void {
    const g = tb.game!;
    const auto = this.actors(g).filter((p) => this.isAuto(tb, p));
    if (auto.length === 0) {
      tb.botAt = 0;
      return;
    }
    for (const p of auto) {
      const m = botMove(g, p);
      if (m && m.a !== 'pass' && play(g, p, m)) {
        this.changed(tb, true);
        return;
      }
    }
    for (const p of auto) play(g, p, { a: 'pass' });
    this.changed(tb, false);
  }

  /** Истёк срок хода человека. */
  private timeout(tb: DurakTable): void {
    const g = tb.game!;
    const w = waiting(g);
    if (w === 'lead') {
      const m = autoMove(g, g.attacker);
      if (m) play(g, g.attacker, m);
    } else if (w === 'defend') {
      // отбивается, сколько может, иначе берёт — одним решением
      for (let i = 0; i < 12 && waiting(g) === 'defend'; i++) {
        const m = autoMove(g, g.defender);
        if (!m || !play(g, g.defender, m)) break;
      }
    } else if (w === 'throw' || w === 'take') passAll(g);
    this.changed(tb, true);
  }

  private stepPlay(tb: DurakTable): void {
    const g = tb.game!;
    for (const s of tb.seats) if (s.k === 1 && s.slot === 0 && this.tick - s.awayAt >= DK_AWAY_TICKS) this.replaceByBot(tb, s);
    if (!tb.seats.some((s) => s.k === 1)) {
      this.clear(tb);
      return;
    }
    if (tb.showUntil !== 0) {
      if (this.tick < tb.showUntil) return;
      tb.showUntil = 0;
      if (!resolve(g)) {
        this.changed(tb, false);
        return;
      }
      if (g.over) this.finishGame(tb);
      else this.changed(tb, true);
      return;
    }
    if (tb.botAt !== 0 && this.tick >= tb.botAt) this.botStep(tb);
    else if (this.tick >= tb.deadline) this.timeout(tb);
  }

  /** Отошедший не вернулся за минуту: его место до конца партии — боту, наград ему нет. */
  private replaceByBot(tb: DurakTable, s: DurakSeat): void {
    const ch = tb.seats.indexOf(s);
    const name = this.botName(tb);
    Object.assign(s, { k: 2, slot: 0, pid: 0, nick: name, outfit: botOutfit(tb.t, ch, name), ready: true, awayAt: 0, temp: true, sent: '' });
    tb.dirty = true;
    this.schedule(tb);
  }

  private botName(tb: DurakTable): string {
    const used = new Set<string>();
    for (const s of tb.seats) if (s.k === 2) used.add(s.nick);
    const free = BOT_NAMES.filter((n) => !used.has(n));
    return free[Math.floor(this.rand() * free.length)] ?? BOT_NAMES[0];
  }

  // ------------------------------------------------------------ фазы

  /** Отсчёт идёт, если за столом от двух, есть человек и все люди готовы. Любое изменение — отсчёт заново. */
  private recount(tb: DurakTable): void {
    let n = 0;
    let humans = 0;
    let ready = true;
    for (const s of tb.seats) {
      if (s.k === 0) continue;
      n++;
      if (s.k === 1) {
        humans++;
        if (!s.ready) ready = false;
      }
    }
    const ok = n >= 2 && humans > 0 && ready;
    tb.phase = ok ? 'count' : 'wait';
    tb.phaseEnd = ok ? this.tick + DK_COUNT_TICKS : 0;
    tb.dirty = true;
  }

  private deal(tb: DurakTable): void {
    const chairs: number[] = [];
    for (let ch = TABLE_SEATS - 1; ch >= 0; ch--) if (tb.seats[ch].k !== 0) chairs.push(ch);
    if (chairs.length < 2 || !chairs.some((ch) => tb.seats[ch].k === 1)) {
      this.recount(tb);
      return;
    }
    const stakes = chairs.filter(ch => tb.seats[ch].k === 1 && tb.seats[ch].stake)
      .map(chair => ({ chair, pid: tb.seats[chair].pid, wager: tb.ante }));
    if (stakes.length) {
      const round = randomUUID();
      if (!this.hooks.reserve?.(round, stakes.map(s => ({ pid: s.pid, amount: s.wager })))) {
        for (const seat of tb.seats) if (seat.k === 1) {
          seat.ready = false;
          if (seat.slot) this.hooks.toast(seat.slot, 'Ставки не списаны: у участника не хватает жетонов или есть другая незавершённая ставка. Можно выбрать бесплатную игру.');
        }
        this.recount(tb);
        return;
      }
      tb.round = round; tb.stakes = stakes;
    }
    tb.order = chairs;
    for (const s of tb.seats) s.p = -1;
    chairs.forEach((ch, p) => {
      tb.seats[ch].p = p;
      tb.seats[ch].sent = '';
    });
    // «под дурака»: прошлый дурак снова за столом — ходит сидящий перед ним
    let lead = -1;
    const lf = tb.lastFool;
    if (lf) {
      const f = chairs.findIndex((ch) => {
        const s = tb.seats[ch];
        return lf.pid > 0 ? s.k === 1 && s.pid === lf.pid : s.k === 2 && s.nick === lf.nick;
      });
      if (f >= 0) lead = (f + chairs.length - 1) % chairs.length;
    }
    tb.game = newGame(chairs.length, this.deck(), tb.mode, lead);
    tb.phase = 'play';
    tb.result = null;
    tb.showUntil = 0;
    tb.deadline = this.tick + DK_TURN_TICKS;
    tb.dirty = true;
    this.sendHands(tb);
    this.schedule(tb);
  }

  private finishGame(tb: DurakTable): void {
    const g = tb.game!;
    const ep = epaulets(g);
    const first = g.out.length > 0 ? g.out[0] : -1;
    tb.phase = 'result';
    tb.phaseEnd = this.tick + DK_RESULT_TICKS;
    const payouts = this.settleBank(tb, g.fool < 0 ? -1 : tb.order[first]);
    tb.result = { fool: g.fool, ep, first, payouts };
    for (const s of tb.seats) if (s.k === 1) { s.ready = false; s.stake = false; }
    tb.botAt = 0;
    tb.dirty = true;
    const players = tb.order.map((ch, p): DurakPlayerResult => {
      const s = tb.seats[ch];
      const human = s.k === 1;
      return {
        pid: human ? s.pid : 0, slot: human ? s.slot : 0, nick: s.nick, bot: !human, fool: p === g.fool, first: p === first,
        present: human && s.slot !== 0,
      };
    });
    const fs = g.fool >= 0 ? tb.seats[tb.order[g.fool]] : null;
    tb.lastFool = fs ? { pid: fs.k === 1 ? fs.pid : 0, nick: fs.nick } : null;
    // боты: победители смеются, дурак сердится
    tb.order.forEach((ch, p) => {
      if (tb.seats[ch].k === 2) this.hooks.event(['react', tb.t, ch, p === g.fool ? 2 : 0]);
    });
    this.hooks.finished({ table: tb.t, players, ep, draw: g.fool < 0 });
  }

  /** Итог показан: временные боты и брони уходят; согласие на повтор сохраняется. */
  private endResult(tb: DurakTable): void {
    for (const s of tb.seats) {
      if (s.k === 1 && s.slot !== 0) this.hooks.send(s.slot, { t: 'durakHand', table: tb.t, cards: [] });
      if (s.temp || (s.k === 1 && s.slot === 0)) Object.assign(s, emptySeat());
      else {
        s.p = -1;
        s.sent = '';
      }
    }
    tb.game = null;
    tb.order = [];
    tb.result = null;
    tb.phase = 'wait';
    tb.phaseEnd = 0;
    tb.deadline = 0;
    tb.botAt = 0;
    tb.showUntil = 0;
    tb.dirty = true;
    this.afterLeave(tb);
  }

  private afterLeave(tb: DurakTable): void {
    if (!tb.seats.some((s) => s.k === 1)) this.clear(tb);
    else if (tb.phase === 'wait' || tb.phase === 'count') this.recount(tb);
  }

  /** Людей за столом не осталось: боты уходят, партия (если шла) прерывается. */
  private clear(tb: DurakTable): void {
    this.settleBank(tb, -1);
    for (const s of tb.seats) {
      if (s.k === 1 && s.slot !== 0) {
        s.p = -1;
        s.ready = false;
        s.stake = false;
      } else Object.assign(s, emptySeat());
    }
    tb.game = null;
    tb.order = [];
    tb.result = null;
    tb.phase = 'wait';
    tb.botAt = 0;
    tb.showUntil = 0;
    tb.lastFool = null;
    tb.dirty = true;
  }

  /** Immutable original-chair ledger survives departures and temporary bot replacement. */
  private settleBank(tb: DurakTable, firstChair: number): Array<{ pid: number; wager: number; payout: number }> {
    if (!tb.stakes.length) return [];
    const winner = tb.stakes.find(s => s.chair === firstChair);
    const bank = tb.stakes.reduce((sum, s) => sum + s.wager, 0);
    const payouts = tb.stakes.map(s => ({ pid: s.pid, wager: s.wager, payout: winner ? (winner.pid === s.pid ? bank : 0) : s.wager }));
    if (!this.hooks.settle?.(tb.round, payouts)) throw new Error('Durak settlement rejected');
    tb.stakes = []; tb.round = '';
    return payouts;
  }

  step(tick: number): void {
    this.tick = tick;
    for (const tb of this.tables) {
      if (tb.phase === 'count' && tick >= tb.phaseEnd) this.deal(tb);
      else if (tb.phase === 'play') this.stepPlay(tb);
      else if (tb.phase === 'result' && tick >= tb.phaseEnd) this.endResult(tb);
    }
    for (const tb of this.tables) {
      if (!tb.dirty) continue;
      tb.dirty = false;
      this.hooks.broadcast({ t: 'durak', table: tb.t, v: this.view(tb.t) });
    }
  }

  // ------------------------------------------------------------ рассылка

  /** Руки — только хозяевам и только изменившиеся. */
  private sendHands(tb: DurakTable): void {
    const g = tb.game;
    if (!g) return;
    for (const s of tb.seats) {
      if (s.k !== 1 || s.slot === 0 || s.p < 0) continue;
      const cards = g.hands[s.p];
      const key = cards.join(',');
      if (key === s.sent) continue;
      s.sent = key;
      this.hooks.send(s.slot, { t: 'durakHand', table: tb.t, cards: [...cards] });
    }
  }

  view(t: number): DurakTableView {
    const tb = this.tables[t];
    const ms = (ticks: number): number => Math.max(0, Math.round(ticks * TICK_MS));
    let left = 0;
    if (tb.phase === 'count' || tb.phase === 'result') left = ms(tb.phaseEnd - this.tick);
    else if (tb.phase === 'play' && tb.showUntil === 0) left = ms(tb.deadline - this.tick);
    return {
      phase: tb.phase,
      mode: tb.mode,
      modeBy: this.modeBy(tb),
      ante: tb.ante,
      bank: tb.stakes.reduce((sum, s) => sum + s.wager, 0) || tb.result?.payouts?.reduce((sum, p) => sum + p.wager, 0) || 0,
      left,
      seats: tb.seats.map((s) => ({
        k: s.k, id: s.k === 1 ? s.slot : 0, pid: s.k === 1 ? s.pid : 0, nick: s.nick, o: s.k === 2 ? s.outfit : null, ready: s.ready, stake: s.stake, wager: tb.stakes.find(b => b.chair === tb.seats.indexOf(s))?.wager ?? 0, p: s.p,
        away: s.k === 1 && s.slot === 0 && tb.phase === 'play' ? ms(s.awayAt + DK_AWAY_TICKS - this.tick) : 0,
      })),
      game: tb.game ? viewOf(tb.game) : null,
      result: tb.result,
    };
  }

  views(): DurakTableView[] {
    return this.tables.map((tb) => this.view(tb.t));
  }
}
