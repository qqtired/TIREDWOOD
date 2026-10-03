import { randomInt, randomUUID } from 'node:crypto';
import { TICK_MS } from '../../shared/constants.ts';
import {
  BJ_COUNT_TICKS, BJ_DEALER_TICKS, BJ_MAX_BET, BJ_RESULT_TICKS, BJ_TABLE, BJ_TURN_TICKS,
  handValue, isBet, naturalPayout, rankOf, type BlackjackAct, type BlackjackHandView, type BlackjackPhase, type BlackjackView,
} from '../../shared/blackjack.ts';

export interface BlackjackHooks {
  broadcast(view: BlackjackView): void;
  toast(slot: number, text: string): void;
  reserve(pid: number, round: string, amount: number): boolean;
  settle(pid: number, round: string, wager: number, payout: number): boolean;
}
interface Hand {
  cards: number[];
  bet: number;
  split: boolean;
  status: BlackjackHandView['status'];
  result: BlackjackHandView['result'];
  payout: number;
}
interface Seat {
  slot: number;
  pid: number;
  nick: string;
  bet: number;
  participating: boolean;
  hands: Hand[];
  settled: boolean;
  reservation: string;
  /** Нажал «дальше»: после итога — не ждать конец паузы, после ставок — раздать сразу (когда так решили все участвующие). */
  skip: boolean;
}
const emptySeat = (): Seat => ({ slot: 0, pid: 0, nick: '', bet: 0, participating: false, hands: [], settled: false, reservation: '', skip: false });
const hand = (cards: number[], bet: number, split = false): Hand => ({ cards, bet, split, status: 'playing', result: null, payout: 0 });

/** Шесть обычных колод; выбирается сервером, новый shoe для каждой раздачи. */
export function shuffledShoe(): number[] {
  const cards = Array.from({ length: 312 }, (_, i) => i % 52);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export class BlackjackHall {
  private readonly hooks: BlackjackHooks;
  private readonly deck: () => number[];
  private readonly seats = Array.from({ length: 6 }, emptySeat);
  private phase: BlackjackPhase = 'betting';
  private rev = 0;
  private tick = 0;
  private deadline = 0;
  private turn = -1;
  private activeHand = 0;
  private dealer: number[] = [];
  private shoe: number[] = [];

  constructor(hooks: BlackjackHooks, opts: { deck?: () => number[] } = {}) {
    this.hooks = hooks;
    this.deck = opts.deck ?? shuffledShoe;
  }

  get active(): boolean { return this.phase !== 'betting'; }
  get busy(): number { return this.seats.filter((s) => s.bet > 0 && !s.settled).length; }

  private chair(seat: number): number {
    return Number.isInteger(seat) && seat >= 12 && seat < 18 ? seat - 12 : -1;
  }

  canSit(seat: number, pid: number): boolean {
    const ch = this.chair(seat);
    if (ch < 0 || !Number.isSafeInteger(pid) || pid <= 0) return false;
    if (this.seats.some((s, i) => i !== ch && s.pid === pid)) return false;
    const s = this.seats[ch];
    return !s.pid || (s.pid === pid && !s.slot);
  }

  sit(seat: number, slot: number, pid: number, nick: string): void {
    if (!this.canSit(seat, pid) || !Number.isInteger(slot) || slot <= 0) return;
    if (this.seats.some((s) => s.slot === slot)) return;
    Object.assign(this.seats[this.chair(seat)], { slot, pid, nick });
    this.changed();
  }

  stand(seat: number, slot: number): void {
    const ch = this.chair(seat);
    if (ch < 0 || !slot || this.seats[ch].slot !== slot) return;
    const s = this.seats[ch];
    if ((this.phase === 'play' || this.phase === 'dealer') && s.participating) {
      s.slot = 0;
      // Уже выданные карты не отменяются: оставленные руки пасуют при наступлении их хода.
    } else {
      if (s.bet && !s.settled && !this.refund(s)) return;
      this.seats[ch] = emptySeat();
      this.recount();
    }
    this.changed();
  }

  rename(pid: number, nick: string): void {
    const s = this.seats.find((x) => x.pid === pid);
    if (s && s.nick !== nick) { s.nick = nick; this.changed(); }
  }

  /** Зарезервированное место участника нельзя передать другому профилю до расчёта. */
  isLocked(seat: number): boolean {
    const ch = this.chair(seat);
    return ch >= 0 && this.seats[ch].participating && !this.seats[ch].settled && (this.phase === 'play' || this.phase === 'dealer');
  }

  act(seat: number, slot: number, action: BlackjackAct, rev: number, amount?: number): void {
    const ch = this.chair(seat), s = this.seats[ch];
    if (ch < 0 || !slot || !s || s.slot !== slot || !s.pid) return this.reject(slot, 'Сначала сядьте за свой стол Blackjack.');
    // «Дальше» безобидно и повторяемо: гонку версий и запоздавший клик молча пропускаем, без тоста об ошибке.
    if (action === 'skip') return this.skip(ch);
    if (!Number.isSafeInteger(rev) || rev !== this.rev) return this.reject(slot, 'Состояние стола обновилось. Повторите действие.');
    if (!this.actions(ch).includes(action)) return this.reject(slot, 'Это действие сейчас недоступно.');
    if (action === 'bet') {
      if (!isBet(amount)) return this.reject(slot, `Ставка — целое число жетонов от 1 до ${BJ_MAX_BET}, или играй бесплатно.`);
      const reservation = amount > 0 ? randomUUID() : '';
      if (amount > 0 && !this.hooks.reserve(s.pid, reservation, amount)) return this.reject(slot, 'Недостаточно жетонов для ставки.');
      s.bet = amount; s.participating = true; s.settled = false; s.reservation = reservation; s.skip = false;
      this.recount();
    } else if (action === 'cancel') {
      if (!this.refund(s)) return this.reject(slot, 'Не удалось вернуть ставку.');
      this.recount();
    } else {
      const h = s.hands[this.activeHand];
      if (action === 'double' || action === 'split') {
        if (h.bet > 0 && !this.hooks.reserve(s.pid, s.reservation, h.bet)) return this.reject(slot, 'Для этого действия нужна ещё одна ставка.');
        s.bet += h.bet;
      }
      if (action === 'stand') h.status = 'stood';
      if (action === 'hit' || action === 'double') {
        h.cards.push(this.draw());
        if (action === 'double') h.bet *= 2;
        this.classify(h);
        if (action === 'double' && h.status === 'playing') h.status = 'stood';
      }
      if (action === 'split') {
        const a = hand([h.cards[0], this.draw()], h.bet, true);
        const b = hand([h.cards[1], this.draw()], h.bet, true);
        this.classify(a); this.classify(b);
        if (rankOf(h.cards[0]) === 0) { a.status = 'stood'; b.status = 'stood'; }
        s.hands = [a, b];
      }
      this.advance();
    }
    this.changed();
  }

  private actions(ch: number): BlackjackAct[] {
    const s = this.seats[ch];
    if (!s.pid || !s.slot) return [];
    if (this.phase === 'betting' || this.phase === 'countdown') {
      if (!s.participating) return ['bet'];
      return this.phase === 'countdown' && !s.skip ? ['cancel', 'skip'] : ['cancel'];
    }
    if (this.phase === 'result') return s.participating && !s.skip ? ['skip'] : [];
    if (this.phase !== 'play' || this.turn !== ch) return [];
    const h = s.hands[this.activeHand];
    if (!h || h.status !== 'playing') return [];
    const actions: BlackjackAct[] = ['hit', 'stand'];
    if (h.cards.length === 2) actions.push('double');
    if (s.hands.length === 1 && h.cards.length === 2 && rankOf(h.cards[0]) === rankOf(h.cards[1])) actions.push('split');
    return actions;
  }

  /**
   * «Дальше» — голос участвующих. Пока нажали не все, паузу не трогаем: остальные досматривают итог или успевают поставить.
   * Один игрок за столом решает сам. Раздать сразу можно, только когда поставили все севшие за стол.
   */
  private skipsDone(): boolean {
    const voters = this.seats.filter((s) => s.participating && s.slot);
    if (!voters.length || !voters.every((s) => s.skip)) return false;
    return this.phase === 'result' || (this.phase === 'countdown' && this.seats.every((s) => !s.slot || s.participating));
  }

  private skip(ch: number): void {
    if (!this.actions(ch).includes('skip')) return;
    this.seats[ch].skip = true;
    if (!this.skipsDone()) this.changed();
    else if (this.phase === 'result') this.reset();
    else this.deal();
  }

  private recount(): void {
    if (this.phase !== 'betting' && this.phase !== 'countdown') return;
    if (!this.seats.some((s) => s.participating)) { this.phase = 'betting'; this.deadline = 0; }
    else if (this.phase === 'betting') { this.phase = 'countdown'; this.deadline = this.tick + BJ_COUNT_TICKS; }
  }

  private draw(): number {
    const c = this.shoe.shift();
    if (c === undefined) throw new Error('Blackjack shoe exhausted');
    return c;
  }

  private classify(h: Hand): void {
    const total = handValue(h.cards).total;
    if (total > 21) h.status = 'bust';
    else if (total === 21) h.status = !h.split && h.cards.length === 2 ? 'blackjack' : 'stood';
  }

  private deal(): void {
    this.shoe = this.deck();
    for (const s of this.seats) s.skip = false;
    const players = this.seats.filter((s) => s.participating);
    for (const s of players) s.hands = [hand([this.draw()], s.bet)];
    this.dealer = [this.draw()];
    for (const s of players) { s.hands[0].cards.push(this.draw()); this.classify(s.hands[0]); }
    this.dealer.push(this.draw());
    this.phase = 'play'; this.turn = 0; this.activeHand = 0;
    if (handValue(this.dealer).total === 21) this.startDealer(); else this.advance();
    this.changed();
  }

  private advance(): void {
    if (this.phase !== 'play') return;
    while (this.turn < this.seats.length) {
      const s = this.seats[this.turn];
      while (this.activeHand < s.hands.length) {
        const h = s.hands[this.activeHand];
        if (h.status === 'playing' && !s.slot) h.status = 'stood';
        if (h.status === 'playing') { this.deadline = this.tick + BJ_TURN_TICKS; return; }
        this.activeHand++;
      }
      this.turn++; this.activeHand = 0;
    }
    this.startDealer();
  }

  private startDealer(): void {
    this.phase = 'dealer'; this.turn = -1; this.activeHand = 0; this.deadline = this.tick + BJ_DEALER_TICKS;
  }

  private dealerStep(): void {
    if (handValue(this.dealer).total < 17 && this.seats.some((s) => s.hands.some((h) => h.status !== 'bust' && h.status !== 'blackjack'))) {
      this.dealer.push(this.draw()); this.deadline = this.tick + BJ_DEALER_TICKS;
    } else this.finish();
    this.changed();
  }

  private finish(): void {
    const dealer = handValue(this.dealer).total;
    const natural = this.dealer.length === 2 && dealer === 21;
    for (const s of this.seats) {
      if (!s.participating || s.settled) continue;
      let payout = 0;
      for (const h of s.hands) {
        const total = handValue(h.cards).total;
        if (h.status === 'bust' || (natural && h.status !== 'blackjack')) h.result = 'loss';
        else if (h.status === 'blackjack' && !natural) h.result = 'blackjack';
        else if (total === dealer) h.result = 'push';
        else if (dealer > 21 || total > dealer) h.result = 'win';
        else h.result = 'loss';
        h.payout = h.result === 'blackjack' ? naturalPayout(h.bet) : h.result === 'win' ? h.bet * 2 : h.result === 'push' ? h.bet : 0;
        payout += h.payout;
      }
      if (s.bet > 0 && !this.hooks.settle(s.pid, s.reservation, s.bet, payout)) throw new Error('Blackjack settlement rejected');
      s.settled = true;
    }
    this.phase = 'result'; this.deadline = this.tick + BJ_RESULT_TICKS;
  }

  private refund(s: Seat): boolean {
    if (s.bet > 0 && !this.hooks.settle(s.pid, s.reservation, s.bet, s.bet)) return false;
    s.bet = 0; s.participating = false; s.settled = false; s.reservation = ''; s.skip = false;
    return true;
  }

  private reset(): void {
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (!s.slot) this.seats[i] = emptySeat();
      else { s.bet = 0; s.participating = false; s.hands = []; s.settled = false; s.reservation = ''; s.skip = false; }
    }
    this.dealer = []; this.shoe = [];
    this.phase = 'betting'; this.turn = -1; this.activeHand = 0; this.deadline = 0;
    this.changed();
  }

  step(tick: number): void {
    this.tick = tick;
    // ушёл или отменил ставку последний, кто ещё не нажал «дальше»: остальные ждать не должны
    if (this.phase === 'countdown' && (tick >= this.deadline || this.skipsDone())) this.deal();
    else if (this.phase === 'play') {
      if (tick >= this.deadline || !this.seats[this.turn].slot) {
        this.seats[this.turn].hands[this.activeHand].status = 'stood';
        this.advance(); this.changed();
      }
    } else if (this.phase === 'dealer' && tick >= this.deadline) this.dealerStep();
    else if (this.phase === 'result' && (tick >= this.deadline || this.skipsDone())) this.reset();
    // Клиент получает свежий таймер; версия остаётся прежней.
    else if (this.phase !== 'betting' && tick % 60 === 0) this.hooks.broadcast(this.view());
  }

  /** Штатный рестарт: до раздачи возврат, после раздачи автопас и обычный расчёт. */
  shutdown(): void {
    if (this.phase === 'betting' || this.phase === 'countdown') {
      for (const s of this.seats) if (s.participating && !s.settled && !this.refund(s)) throw new Error('Blackjack refund rejected');
      this.phase = 'betting'; this.deadline = 0;
    } else if (this.phase === 'play' || this.phase === 'dealer') {
      for (const s of this.seats) for (const h of s.hands) if (h.status === 'playing') h.status = 'stood';
      this.startDealer();
      while (this.phase === 'dealer') this.dealerStep();
    }
  }

  view(): BlackjackView {
    const revealed = this.phase === 'dealer' || this.phase === 'result';
    return {
      table: BJ_TABLE, phase: this.phase, rev: this.rev,
      left: this.deadline ? Math.max(0, Math.round((this.deadline - this.tick) * TICK_MS)) : 0,
      turn: this.turn, hand: this.activeHand,
      dealer: revealed ? [...this.dealer] : this.dealer.map((c, i) => i === 0 ? c : -1),
      dealerTotal: revealed ? handValue(this.dealer).total : null,
      seats: this.seats.map((s, ch) => ({
        k: s.pid ? 1 : 0, id: s.slot, pid: s.pid, nick: s.nick, away: !!s.pid && !s.slot, bet: s.bet, participating: s.participating,
        hands: s.hands.map((h) => ({ cards: [...h.cards], bet: h.bet, ...handValue(h.cards), status: h.status, result: h.result, payout: h.payout })),
        actions: this.actions(ch), skip: s.skip,
      })),
    };
  }

  private changed(): void { this.rev++; this.hooks.broadcast(this.view()); }
  private reject(slot: number, text: string): void { this.hooks.toast(slot, text); }
}
