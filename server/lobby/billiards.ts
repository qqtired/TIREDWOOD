// Бильярд в казино набережной: три стола на двоих. Кто где стоит, тренировка в одиночку, предложение партии со ставкой,
// партия по очереди с таймером хода, ушедший посреди партии (окно на возврат, потом техническое поражение), итог и банк.
// Удар считает сервер (shared/billiards.ts) от угла и силы; клиентам — начальная скорость битка для анимации и стол после.
import { randomInt, randomUUID } from 'node:crypto';
import { TICK_MS } from '../../shared/constants.ts';
import {
  BL_AWAY_TICKS, BL_FOOT, BL_HEAD, BL_MAX_BET, BL_RESULT_TICKS, BL_SETTLE_TICKS, BL_TABLES, BL_TABLE_COUNT, BL_TURN_TICKS, BL_WIN,
  cueVelocity, isBlBet, judge, packBalls, rack, respot, rollTicks, simulate,
  type BlBall, type BlPhase, type BlShotWire, type BlTableView,
} from '../../shared/billiards.ts';
import type { ServerMsg } from '../../shared/messages.ts';

export interface BilliardsPayout {
  pid: number;
  wager: number;
  payout: number;
}

export interface BilliardsResult {
  table: number;
  winner: { pid: number; nick: string };
  loser: { pid: number; nick: string };
  score: [number, number];
  bet: number;
  why: 'score' | 'resign' | 'away';
}

export interface BilliardsHooks {
  /** Всем на набережной */
  broadcast(msg: ServerMsg): void;
  /** Тем, кто рядом со столом (кий бьющего) */
  near(table: number, msg: ServerMsg): void;
  /** Отказ одному игроку (номер на набережной) — понятной строкой */
  reject(slot: number, table: number, text: string): void;
  balance(pid: number): number;
  /** Связь с игроком (номер на набережной) пропала, сервер держит его место в ожидании возврата */
  lost?(slot: number): boolean;
  /** Ставка в банк: списать и запомнить в профиле (возвращается после аварийного рестарта) */
  reserve(pid: number, round: string, amount: number): boolean;
  /** Расчёт банка одной записью: выплаты в сумме равны ставкам (комиссии нет) */
  settle(round: string, payouts: readonly BilliardsPayout[]): boolean;
  finished?(r: BilliardsResult): void;
  log?(text: string): void;
}

interface Seat {
  pid: number;
  /** Номер на набережной; 0 — отошёл посреди партии, место держится */
  slot: number;
  nick: string;
  /** Тик, когда отошёл (0 — на месте) */
  awayAt: number;
}

interface Table {
  readonly t: number;
  phase: BlPhase;
  seats: [Seat | null, Seat | null];
  offer: { by: number; amount: number; round: string } | null;
  /** Банк партии: id записи резерва и ставка каждого */
  round: string;
  bet: number;
  score: [number, number];
  turn: number;
  /** Срок удара (тик) */
  deadline: number;
  /** Когда остановятся шары (тик) — раньше бить нельзя */
  restAt: number;
  shot: number;
  balls: BlBall[];
  winner: number;
  why: '' | 'score' | 'resign' | 'away';
  note: string;
  resultUntil: number;
}

const other = (side: number): number => 1 - side;

export class BilliardsHall {
  private readonly hooks: BilliardsHooks;
  private readonly rand: (n: number) => number;
  readonly tables: Table[];
  private tick = 0;

  constructor(hooks: BilliardsHooks, opts: { rand?: (n: number) => number } = {}) {
    this.hooks = hooks;
    this.rand = opts.rand ?? ((n) => randomInt(n));
    this.tables = Array.from({ length: BL_TABLE_COUNT }, (_, t) => ({
      t, phase: 'open' as BlPhase, seats: [null, null] as [Seat | null, Seat | null], offer: null, round: '', bet: 0, score: [0, 0] as [number, number],
      turn: -1, deadline: 0, restAt: 0, shot: 0, balls: rack(), winner: -1, why: '' as const, note: '', resultUntil: 0,
    }));
  }

  /** Идёт партия или показ итога: часы набережной должны идти и без людей (окно на возврат, расчёт). */
  get busy(): boolean {
    return this.tables.some((t) => t.phase !== 'open' || t.offer !== null);
  }

  /** Сколько людей сейчас в партиях или ждут соперника по ставке (для отчёта «занятые» перед выкладкой). */
  get playing(): number {
    return this.tables.reduce((n, t) => n + (t.phase === 'match' ? 2 : t.offer ? 1 : 0), 0);
  }

  private table(t: unknown): Table | null {
    return typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < this.tables.length ? this.tables[t] : null;
  }

  private sideOf(tb: Table, slot: number): number {
    if (!slot) return -1;
    return tb.seats[0]?.slot === slot ? 0 : tb.seats[1]?.slot === slot ? 1 : -1;
  }

  /** Где у этого профиля партия, из которой он отошёл (−1 — нигде). */
  private pendingTable(pid: number): number {
    return this.tables.findIndex((tb) => tb.phase === 'match' && tb.seats.some((s) => s?.pid === pid));
  }

  /**
   * К какой стороне стола встанет игрок: своя (вернулся в партию), иначе свободная. Строка — почему нельзя.
   */
  sideFor(t: number, pid: number, x = Number.NaN): number | string {
    const tb = this.table(t);
    if (!tb || !Number.isSafeInteger(pid) || pid <= 0) return 'Стол недоступен';
    const own = tb.seats.findIndex((s) => s?.pid === pid);
    if (own >= 0) return own;
    const pending = this.pendingTable(pid);
    if (pending >= 0) return `Сначала доиграй партию за столом ${pending + 1}`;
    if (tb.phase === 'match') return 'Здесь идёт партия — смотри со стороны или подойди к другому столу';
    // обе стороны свободны — та, с которой подошёл (запад — 0, восток — 1)
    if (!tb.seats[0] && !tb.seats[1] && Number.isFinite(x)) return x < BL_TABLES[t].x ? 0 : 1;
    const free = tb.seats.findIndex((s) => s === null);
    return free >= 0 ? free : 'У стола уже двое — подойди к другому';
  }

  sit(t: number, side: number, slot: number, pid: number, nick: string): boolean {
    const tb = this.table(t);
    if (!tb || (side !== 0 && side !== 1) || !slot) return false;
    const s = tb.seats[side];
    if (s && s.pid !== pid) return false;
    if (s) {
      s.slot = slot; s.nick = nick; s.awayAt = 0;
      if (tb.phase === 'match') tb.note = `${nick} вернулся к столу`;
    } else {
      tb.seats[side] = { pid, slot, nick, awayAt: 0 };
    }
    this.changed(tb);
    return true;
  }

  /** Отошёл от стола (шаг, Esc, вышел с набережной): в партии место держится BL_AWAY_TICKS, иначе — свободно. */
  stand(t: number, slot: number): void {
    const tb = this.table(t);
    if (!tb) return;
    const side = this.sideOf(tb, slot);
    if (side < 0) return;
    const s = tb.seats[side]!;
    if (tb.phase === 'match') {
      s.slot = 0;
      // связь пропала раньше — окно на возврат считаем с того момента
      if (!s.awayAt) s.awayAt = Math.max(1, this.tick);
      tb.note = `${s.nick} отошёл — ждём ${Math.round(BL_AWAY_TICKS * TICK_MS / 1000)} с`;
    } else {
      if (tb.offer?.by === side) this.cancelOffer(tb);
      tb.seats[side] = null;
    }
    this.changed(tb);
  }

  rename(pid: number, nick: string): void {
    for (const tb of this.tables) {
      for (const s of tb.seats) {
        if (s?.pid === pid && s.nick !== nick) { s.nick = nick; this.changed(tb); }
      }
    }
  }

  // ------------------------------------------------------------ действия

  shoot(t: number, slot: number, n: unknown, ang: unknown, pw: unknown): void {
    const tb = this.table(t);
    if (!tb) return;
    const side = this.sideOf(tb, slot);
    if (side < 0) return this.hooks.reject(slot, t, 'Сначала подойди к столу (E)');
    if (tb.phase === 'result') return;
    if (tb.phase === 'match' && tb.turn !== side) return this.hooks.reject(slot, t, 'Сейчас бьёт соперник');
    if (this.tick < tb.restAt) return this.hooks.reject(slot, t, 'Шары ещё катятся');
    // повтор того же удара (двойной клик, запоздавшее сообщение) — молча
    if (n !== tb.shot) return;
    if (typeof ang !== 'number' || !Number.isFinite(ang) || typeof pw !== 'number' || !Number.isFinite(pw)) return;
    const power = Math.min(1, Math.max(0.02, pw));
    const v = cueVelocity(ang, power);
    const before = packBalls(tb.balls);
    const res = simulate(tb.balls, v.vx, v.vz);
    tb.shot++;
    const wire: BlShotWire = { table: tb.t, n: tb.shot, by: tb.phase === 'match' ? side : -1, pos: before.pos, on: before.on, vx: v.vx, vz: v.vz, steps: res.steps };
    tb.restAt = this.tick + rollTicks(res.steps) + BL_SETTLE_TICKS;
    const shooter = tb.seats[side]!.nick;
    if (tb.phase === 'match') {
      const j = judge(res);
      const opp = tb.seats[other(side)]?.nick ?? 'соперник';
      if (j.foul) {
        for (const i of j.back) respot(tb.balls, i, BL_FOOT.x, BL_FOOT.z);
        if (j.cueBack) respot(tb.balls, 0, BL_HEAD.x, BL_HEAD.z);
        tb.turn = other(side);
        tb.note = j.back.length ? `Фол: биток в лузе, ${j.back.length} ${balls(j.back.length)} обратно — бьёт ${opp}` : `Фол: биток в лузе — бьёт ${opp}`;
      } else if (j.scored > 0) {
        tb.score[side] += j.scored;
        tb.note = `${shooter} забил ${j.scored === 1 ? 'шар' : `${j.scored} ${balls(j.scored)}`} — ${tb.score[0]}:${tb.score[1]}`;
      } else {
        tb.turn = other(side);
        tb.note = `Мимо — бьёт ${opp}`;
      }
      tb.deadline = tb.restAt + BL_TURN_TICKS;
      this.hooks.broadcast({ t: 'blShot', s: wire });
      if (tb.score[side] >= BL_WIN) this.finish(tb, side, 'score');
      else this.changed(tb);
      return;
    }
    // тренировка: биток из лузы — в «дом», забитое остаётся в лузах
    if (!tb.balls[0].on) respot(tb.balls, 0, BL_HEAD.x, BL_HEAD.z);
    const potted = res.potted.filter((i) => i !== 0).length;
    const left = tb.balls.filter((b, i) => i > 0 && b.on).length;
    tb.note = left === 0 ? 'Все шары в лузах — «Расставить заново»' : potted ? `${shooter}: ${potted === 1 ? 'шар' : `${potted} ${balls(potted)}`} в лузе` : res.potted.includes(0) ? 'Биток в лузе — он снова в «доме»' : '';
    this.hooks.broadcast({ t: 'blShot', s: wire });
    this.changed(tb);
  }

  /** Тренировка: расставить пирамиду заново (только когда шары стоят и не идёт партия). */
  rerack(t: number, slot: number): void {
    const tb = this.table(t);
    if (!tb || this.sideOf(tb, slot) < 0) return;
    if (tb.phase !== 'open') return this.hooks.reject(slot, t, 'Во время партии расставлять нельзя');
    if (this.tick < tb.restAt) return this.hooks.reject(slot, t, 'Шары ещё катятся');
    rack(tb.balls);
    tb.shot++;
    tb.note = 'Шары расставлены';
    this.changed(tb);
  }

  offer(t: number, slot: number, amount: unknown): void {
    const tb = this.table(t);
    if (!tb) return;
    const side = this.sideOf(tb, slot);
    if (side < 0) return this.hooks.reject(slot, t, 'Сначала подойди к столу (E)');
    if (tb.phase !== 'open') return this.hooks.reject(slot, t, 'Партия уже идёт');
    if (tb.offer) return this.hooks.reject(slot, t, tb.offer.by === side ? 'Ты уже предложил партию — жди соперника' : 'Соперник уже предложил партию — прими её');
    if (!isBlBet(amount)) return this.hooks.reject(slot, t, `Ставка — целое число жетонов от 0 до ${BL_MAX_BET}`);
    const pid = tb.seats[side]!.pid;
    let round = '';
    if (amount > 0) {
      const have = this.hooks.balance(pid);
      if (have < amount) return this.hooks.reject(slot, t, `Не хватает жетонов: ставка ${amount}, у тебя ${have}`);
      round = randomUUID();
      if (!this.hooks.reserve(pid, round, amount)) return this.hooks.reject(slot, t, 'Не получилось поставить: жетоны заняты в другой игре');
    }
    tb.offer = { by: side, amount, round };
    tb.note = amount > 0 ? `${tb.seats[side]!.nick} предлагает партию на ${amount} 🪙` : `${tb.seats[side]!.nick} предлагает партию без ставки`;
    this.changed(tb);
  }

  cancel(t: number, slot: number): void {
    const tb = this.table(t);
    if (!tb) return;
    const side = this.sideOf(tb, slot);
    if (side < 0 || tb.offer?.by !== side) return;
    this.cancelOffer(tb);
    tb.note = '';
    this.changed(tb);
  }

  accept(t: number, slot: number, amount: unknown): void {
    const tb = this.table(t);
    if (!tb) return;
    const side = this.sideOf(tb, slot);
    if (side < 0) return this.hooks.reject(slot, t, 'Сначала подойди к столу (E)');
    const offer = tb.offer;
    if (tb.phase !== 'open' || !offer) return this.hooks.reject(slot, t, 'Партию никто не предлагает — предложи сам');
    if (offer.by === side) return this.hooks.reject(slot, t, 'Это твоё предложение — ждём соперника');
    // ставку поменяли, пока ты нажимал: деньги — только по той сумме, что видел
    if (amount !== offer.amount) return this.hooks.reject(slot, t, `Ставка теперь ${offer.amount} 🪙 — посмотри и прими ещё раз`);
    const me = tb.seats[side]!, them = tb.seats[offer.by]!;
    if (offer.amount > 0) {
      const have = this.hooks.balance(me.pid);
      if (have < offer.amount) return this.hooks.reject(slot, t, `Не хватает жетонов: ставка ${offer.amount}, у тебя ${have}`);
      if (!this.hooks.reserve(me.pid, offer.round, offer.amount)) return this.hooks.reject(slot, t, 'Не получилось поставить: жетоны заняты в другой игре');
    }
    tb.phase = 'match';
    tb.round = offer.round;
    tb.bet = offer.amount;
    tb.offer = null;
    tb.score = [0, 0];
    rack(tb.balls);
    tb.shot++;
    tb.turn = this.rand(2);
    tb.restAt = this.tick;
    tb.deadline = this.tick + BL_TURN_TICKS;
    tb.winner = -1;
    tb.why = '';
    tb.note = `Партия ${them.nick} — ${me.nick}${tb.bet ? `, банк ${tb.bet * 2} 🪙` : ''}. Жребий: разбивает ${tb.seats[tb.turn]!.nick}`;
    this.hooks.log?.(`[бильярд] стол ${tb.t + 1}: ${them.nick} — ${me.nick}, ставка ${tb.bet}`);
    this.changed(tb);
  }

  resign(t: number, slot: number): void {
    const tb = this.table(t);
    if (!tb) return;
    const side = this.sideOf(tb, slot);
    if (side < 0 || tb.phase !== 'match') return;
    this.finish(tb, other(side), 'resign');
  }

  /** Кий бьющего — тем, кто рядом (не чаще, чем пропускает комната). */
  aim(t: number, slot: number, ang: unknown, pw: unknown): void {
    const tb = this.table(t);
    if (!tb || typeof ang !== 'number' || !Number.isFinite(ang) || typeof pw !== 'number' || !Number.isFinite(pw)) return;
    const side = this.sideOf(tb, slot);
    if (side < 0 || tb.phase === 'result' || (tb.phase === 'match' && tb.turn !== side) || this.tick < tb.restAt) return;
    this.hooks.near(tb.t, { t: 'blAim', table: tb.t, ang: Math.round(ang * 1000) / 1000, pw: Math.round(Math.min(1, Math.max(0, pw)) * 100) / 100 });
  }

  // ------------------------------------------------------------ ход времени

  step(tick: number): void {
    this.tick = tick;
    for (const tb of this.tables) {
      if (tb.phase === 'match') {
        // пропала связь — окно на возврат пошло сразу (сервер ещё держит игрока); вернулся — снова на месте
        for (const s of tb.seats) {
          if (!s?.slot || !this.hooks.lost) continue;
          const lost = this.hooks.lost(s.slot);
          if (lost && !s.awayAt) { s.awayAt = Math.max(1, tick); tb.note = `${s.nick}: пропала связь — ждём ${Math.round(BL_AWAY_TICKS * TICK_MS / 1000)} с`; this.changed(tb); }
          else if (!lost && s.awayAt) { s.awayAt = 0; tb.note = `${s.nick} снова на связи`; this.changed(tb); }
        }
        const gone = [0, 1].filter((i) => tb.seats[i]?.awayAt && tick - tb.seats[i]!.awayAt >= BL_AWAY_TICKS)
          .sort((a, b) => tb.seats[a]!.awayAt - tb.seats[b]!.awayAt);
        if (gone.length) { this.finish(tb, other(gone[0]), 'away'); continue; }
        if (tick >= tb.deadline) {
          const late = tb.seats[tb.turn]!.nick;
          tb.turn = other(tb.turn);
          tb.deadline = tick + BL_TURN_TICKS;
          tb.note = `${late} не успел — бьёт ${tb.seats[tb.turn]!.nick}`;
          this.changed(tb);
        } else if (tick % 120 === 0) this.hooks.broadcast({ t: 'bl', v: this.view(tb.t) });
      } else if (tb.phase === 'result' && tick >= tb.resultUntil) this.reopen(tb);
    }
  }

  private finish(tb: Table, winner: number, why: 'score' | 'resign' | 'away'): void {
    const w = tb.seats[winner]!, l = tb.seats[other(winner)]!;
    if (tb.bet > 0) {
      const payouts: BilliardsPayout[] = [{ pid: w.pid, wager: tb.bet, payout: tb.bet * 2 }, { pid: l.pid, wager: tb.bet, payout: 0 }];
      if (!this.hooks.settle(tb.round, payouts)) this.hooks.log?.(`[бильярд] стол ${tb.t + 1}: расчёт не принят (${tb.round}) — ставки вернутся при рестарте`);
    }
    tb.phase = 'result';
    tb.winner = winner;
    tb.why = why;
    tb.turn = -1;
    tb.resultUntil = Math.max(this.tick, tb.restAt) + BL_RESULT_TICKS;
    const bank = tb.bet * 2;
    tb.note = why === 'score' ? `${w.nick} выиграл ${tb.score[winner]}:${tb.score[other(winner)]}${bank ? ` и забрал ${bank} 🪙` : ''}`
      : why === 'resign' ? `${l.nick} сдался — победа ${w.nick}${bank ? `, ${bank} 🪙` : ''}`
        : `${l.nick} не вернулся — техническая победа ${w.nick}${bank ? `, ${bank} 🪙` : ''}`;
    this.hooks.finished?.({ table: tb.t, winner: { pid: w.pid, nick: w.nick }, loser: { pid: l.pid, nick: l.nick }, score: [...tb.score], bet: tb.bet, why });
    tb.round = '';
    this.changed(tb);
  }

  /** После итога: ушедшие освобождают место, оставшиеся — у новой пирамиды (реванш — одной кнопкой). */
  private reopen(tb: Table): void {
    for (let i = 0; i < 2; i++) if (tb.seats[i] && !tb.seats[i]!.slot) tb.seats[i] = null;
    tb.phase = 'open';
    tb.score = [0, 0];
    tb.turn = -1;
    tb.winner = -1;
    tb.why = '';
    tb.note = '';
    tb.bet = 0;
    rack(tb.balls);
    tb.shot++;
    tb.restAt = this.tick;
    this.changed(tb);
  }

  private cancelOffer(tb: Table): void {
    const o = tb.offer;
    if (!o) return;
    const s = tb.seats[o.by];
    if (o.amount > 0 && s && !this.hooks.settle(o.round, [{ pid: s.pid, wager: o.amount, payout: o.amount }])) {
      this.hooks.log?.(`[бильярд] стол ${tb.t + 1}: возврат ставки не принят (${o.round})`);
    }
    tb.offer = null;
  }

  /** Штатный рестарт: предложения и партии отменяются, ставки — обратно. */
  shutdown(): void {
    for (const tb of this.tables) {
      this.cancelOffer(tb);
      if (tb.phase === 'match' && tb.bet > 0) {
        const payouts = tb.seats.flatMap((s) => (s ? [{ pid: s.pid, wager: tb.bet, payout: tb.bet }] : []));
        this.hooks.settle(tb.round, payouts);
      }
      tb.phase = 'open';
      tb.round = '';
      tb.bet = 0;
    }
  }

  // ------------------------------------------------------------ вид

  view(t: number): BlTableView {
    const tb = this.tables[t];
    const ms = (ticks: number): number => Math.max(0, Math.round(ticks * TICK_MS));
    const { pos, on } = packBalls(tb.balls);
    return {
      table: tb.t, phase: tb.phase,
      seats: tb.seats.map((s) => (s ? { pid: s.pid, nick: s.nick, away: s.awayAt ? ms(s.awayAt + BL_AWAY_TICKS - this.tick) || 1 : 0 } : null)) as BlTableView['seats'],
      offer: tb.offer ? { by: tb.offer.by, amount: tb.offer.amount } : null,
      bet: tb.bet, score: [tb.score[0], tb.score[1]], turn: tb.turn,
      left: tb.phase === 'match' ? ms(tb.deadline - this.tick) : 0,
      rolling: ms(tb.restAt - this.tick), shot: tb.shot, pos, on, winner: tb.winner, why: tb.why, note: tb.note,
    };
  }

  /** Вошедшему на набережную — все столы. */
  welcome(send: (msg: ServerMsg) => void): void {
    for (const tb of this.tables) send({ t: 'bl', v: this.view(tb.t) });
  }

  private changed(tb: Table): void {
    this.hooks.broadcast({ t: 'bl', v: this.view(tb.t) });
  }
}

function balls(n: number): string {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return 'шар';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'шара';
  return 'шаров';
}
