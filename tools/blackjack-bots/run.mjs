#!/usr/bin/env node
// Боты блэкджека по WebSocket: проверка, что чужие ставки и ходы не вызывают отказ «Состояние стола обновилось».
// Запуск (сервер уже работает на 5390, DATA_DIR временный):
//   node tools/blackjack-bots/run.mjs --url=ws://127.0.0.1:5390/ws --bots=4 --rounds=40 [--mode=honest|double] [--first=8] [--think=мс] [--out=файл.json]
// Боты настоящие: входят по ключу, идут к столу (бинарный ввод) и садятся на стулья. Ставят одновременно в начале каждого
// раунда, жмут «Раздать сейчас» / «Следующая раздача» и ходят в свой ход. Сервер ничего не знает о том, что это боты.
// mode=honest — один запрос за раз, как у клиента: любой отказ, после которого то же действие снова доступно, — ложный.
// mode=double — боты иногда шлют ставку и ход дважды подряд (двойной клик, повтор): двойного списания быть не должно.
// После каждого раунда сверяется баланс: он обязан сойтись с ставками и выплатами из вида стола.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PROTOCOL_VERSION } from '../../shared/constants.ts';
import { linkNumbered } from '../../shared/link.ts';
import { buildLobby } from '../../shared/maps/lobby.ts';
import { decodeSnapshot, encodeInputs, makeHeader } from '../../shared/protocol.ts';
import { BTN_FORWARD, makeInput, makeState } from '../../shared/sim.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));
const URL_WS = args.url ?? 'ws://127.0.0.1:5390/ws';
const BOTS = Number(args.bots ?? 4);
const ROUNDS = Number(args.rounds ?? 40);
const MODE = args.mode ?? 'honest';
const PREFIX = args.prefix ?? 'Tester';
const FIRST = Number(args.first ?? 8);
const MAX_MS = Number(args.maxMs ?? 15 * 60_000);
// think=2000 — боты «думают» над ставкой от 0 до 2000 мс, как живые люди; без него все ставят в первые 25 мс (худший случай)
const THINK = Number(args.think ?? 0);
const TABLE = 2;
const CHAIRS = [3, 5, 0, 2, 4, 1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const map = buildLobby();
const table = map.tables[TABLE];

const totals = {
  mode: MODE, bots: BOTS, rounds: 0, sent: {}, accepted: {}, errors: {}, falseRejects: 0, trueRejects: 0, falseByAction: {},
  duplicates: 0, duplicateErrors: 0, balanceChecks: 0, balanceMismatch: [], lost: 0, seatFail: 0, extraCards: 0,
};
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };

class Bot {
  constructor(i) {
    this.i = i;
    this.nick = `${PREFIX}${FIRST + i}`;
    this.key = createHash('sha256').update(`bj-bot-${this.nick}`).digest('base64url').slice(0, 32);
    this.pid = 0;
    this.tokens = 0;
    this.epoch = 0;
    this.rx = 0;
    this.seq = 0;
    this.seat = -1;
    this.view = null;
    this.pending = null;
    this.lastSent = null;
    this.awaitFresh = null;
    this.rounds = 0;
    this.roundStart = null;
    this.checkedResult = -1;
    this.done = false;
    this.walking = false;
    this.timers = [];
    this.header = makeHeader();
    this.self = makeState();
    this.entities = [];
    this.where = null;
    this.expectCards = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(URL_WS);
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        this.send({ t: 'hello', v: PROTOCOL_VERSION, key: this.key, nick: this.nick });
        this.timers.push(setInterval(() => this.send({ t: 'ping', c: Date.now() % 1e9, r: this.rx }), 2000));
        resolve();
      };
      ws.onerror = (e) => reject(new Error(`ws ${this.nick}: ${e.message ?? 'error'}`));
      ws.onclose = (e) => { if (!this.done) console.log(`[${this.nick}] соединение закрыто: ${e.code} ${e.reason}`); };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') {
          // снимок набережной: свои координаты — чтобы идти к стулу по-настоящему
          if (decodeSnapshot(e.data, this.header, this.self, this.entities) >= 0 && (this.header.flags & 1)) this.where = { x: this.self.x, z: this.self.z };
          return;
        }
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (linkNumbered(msg.t)) this.rx++;
        this.onMsg(msg);
      };
    });
  }

  send(msg) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  onMsg(m) {
    switch (m.t) {
      case 'me': this.pid = m.pid; this.tokens = m.tokens; break;
      case 'tokens': this.tokens = m.n; break;
      case 'error': console.log(`[${this.nick}] ошибка входа: ${m.code}`); break;
      case 'scene':
        if (m.scene === 'lobby') { this.epoch = m.epoch; if (!this.walking) this.walk(); }
        break;
      case 'blackjack': this.onView(m.v); break;
      case 'blackjackError': this.onError(m); break;
      default: break;
    }
  }

  // ------------------------------------------------------------ дорога к стулу
  async walk() {
    this.walking = true;
    const k = CHAIRS[this.i % CHAIRS.length];
    const arg = 12 + k;
    const it = map.interact.find((x) => x.kind === 'blackjack' && x.arg === arg);
    const legs = [{ x: it.x - 3.2, z: it.z }, { x: it.x, z: it.z }];
    let leg = 0;
    const until = Date.now() + 20_000;
    while (Date.now() < until && this.seat < 0) {
      const at = this.where ?? { x: map.spawn.x, z: map.spawn.z };
      const goal = legs[leg];
      const dx = goal.x - at.x, dz = goal.z - at.z;
      if (leg === 0 && Math.hypot(dx, dz) < 0.8) leg = 1;
      const inp = makeInput();
      inp.seq = ++this.seq;
      inp.buttons = BTN_FORWARD;
      inp.yaw = Math.atan2(-dx, -dz);
      if (this.ws.readyState === 1) this.ws.send(encodeInputs([inp], 0, 1, this.epoch));
      if (Math.hypot(it.x - at.x, it.z - at.z) < 2.5 && this.seq % 14 === 0) this.send({ t: 'use', id: it.id });
      await sleep(16);
    }
    if (this.seat < 0) { totals.seatFail++; console.log(`[${this.nick}] не сел за стол (был в ${this.where ? `${this.where.x.toFixed(1)}, ${this.where.z.toFixed(1)}` : '?'}, стул ${it.x.toFixed(1)}, ${it.z.toFixed(1)})`); }
  }

  // ------------------------------------------------------------ стол
  mine(v = this.view) {
    if (!v) return null;
    const s = v.seats.findIndex((x) => x.pid === this.pid);
    return s < 0 ? null : { s, seat: v.seats[s] };
  }

  sig(v) {
    const me = this.mine(v);
    if (!me) return '';
    const { s, seat } = me;
    return JSON.stringify([seat.actions, seat.bet, seat.participating, seat.hands.map((h) => [h.cards.length, h.status, h.bet]), v.turn === s ? v.hand : -1, v.phase === 'result']);
  }

  onView(v) {
    const prev = this.view;
    this.view = v;
    const me = this.mine(v);
    if (!me) return;
    this.seat = me.s;
    // ответ на отказ: что видно теперь — то же действие всё ещё доступно?
    if (this.awaitFresh) {
      const a = this.awaitFresh;
      this.awaitFresh = null;
      // отказ ложный, если после него то же действие по-прежнему доступно: повтор прошёл бы (смена ставок на отсчёт — не причина)
      const still = me.seat.actions.includes(a.action);
      if (a.dup) totals.duplicateErrors++;
      else if (still) {
        totals.falseRejects++;
        inc(totals.falseByAction, a.action);
      } else totals.trueRejects++;
      this.pending = null;
    }
    if (this.pending && this.sig(v) !== this.pending.sig) this.pending = null;
    if (this.pending && Date.now() - this.pending.at > 5000) { totals.lost++; this.pending = null; }
    // двойной «ещё»: карт должно прибавиться ровно на одну, вторая отправка не выполняется
    if (this.expectCards) {
      const hand = me.seat.hands[this.expectCards.hand];
      if (hand && hand.cards.length > this.expectCards.n) { totals.extraCards++; this.expectCards.n = hand.cards.length; }
    }
    this.checkRound(v, prev);
    if (!this.done) this.schedule();
  }

  onError(m) {
    const last = this.lastSent;
    inc(totals.errors, m.message);
    if (!last) return;
    this.awaitFresh = { action: last.action, phase: last.phase, dup: last.dupSecond };
  }

  /** Баланс после раунда: до ставки − ставки + выплаты, как их показал сервер; раундов нужное число — стоп. */
  checkRound(v, prev) {
    const me = this.mine(v);
    if (!me) return;
    if (v.phase === 'betting' || v.phase === 'countdown') {
      if (!me.seat.participating && !this.pending) this.roundStart = null;
    }
    if (v.phase === 'result' && me.seat.hands.length && this.checkedResult !== this.roundId(v)) {
      this.checkedResult = this.roundId(v);
      const net = me.seat.hands.reduce((s, h) => s + h.payout - h.bet, 0);
      if (this.roundStart !== null) {
        // сервер шлёт новый баланс раньше вида с итогом, так что к этому моменту выплата уже учтена
        totals.balanceChecks++;
        const want = this.roundStart + net;
        if (this.tokens !== want) totals.balanceMismatch.push({ nick: this.nick, want, got: this.tokens, net, round: this.rounds + 1 });
      }
      this.rounds++;
      totals.rounds++;
      if (this.rounds >= ROUNDS) this.done = true;
    }
  }

  roundId(v) {
    const me = this.mine(v);
    return JSON.stringify([me.seat.hands.map((h) => h.cards), v.dealer]);
  }

  schedule() {
    if (this.timer) return;
    const betting = THINK > 0 && !!this.view && !!this.mine(this.view)?.seat.actions.includes('bet');
    this.timer = setTimeout(() => { this.timer = null; this.decide(); }, betting ? rand(0, THINK) : rand(0, 25));
  }

  decide() {
    const v = this.view;
    const me = this.mine(v);
    if (!me || this.pending || this.done) return;
    const a = me.seat.actions;
    if (a.includes('bet')) {
      const wanted = [1, 2, 3, 5][Math.floor(rand(0, 4))];
      const amount = this.tokens >= wanted ? wanted : 0;
      this.act('bet', amount);
    } else if (a.includes('skip')) {
      this.act('skip');
    } else if (a.includes('hit')) {
      const h = me.seat.hands[v.hand];
      const total = h.total;
      if (a.includes('split') && Math.random() < 0.3 && this.tokens >= h.bet) this.act('split');
      else if (a.includes('double') && total >= 9 && total <= 11 && this.tokens >= h.bet && Math.random() < 0.5) this.act('double');
      else this.act(total < 15 || (total === 15 && Math.random() < 0.4) ? 'hit' : 'stand');
    }
  }

  act(action, amount) {
    const v = this.view;
    const me = this.mine(v);
    if (!me.seat.actions.includes(action)) return;
    const msg = { t: 'blackjack', table: TABLE, a: action, rev: v.rev };
    if (amount !== undefined) msg.amount = amount;
    inc(totals.sent, action);
    this.expectCards = null;
    if (action === 'hit') this.expectCards = { hand: v.hand, n: me.seat.hands[v.hand].cards.length + 1 };
    this.lastSent = { action, phase: v.phase, dupSecond: false };
    if (action === 'bet') this.roundStart = this.tokens;
    if (action !== 'skip') this.pending = { sig: this.sig(v), at: Date.now() };
    this.send(msg);
    const twice = MODE === 'double' && action !== 'skip' && Math.random() < 0.35;
    if (twice) {
      totals.duplicates++;
      inc(totals.sent, action);
      this.lastSent = { action, phase: v.phase, dupSecond: true };
      this.send(msg);
    }
  }

  close() {
    this.done = true;
    for (const t of this.timers) clearInterval(t);
    this.ws.close();
  }
}

const bots = Array.from({ length: BOTS }, (_, i) => new Bot(i));
await Promise.all(bots.map((b) => b.connect()));
console.log(`подключено ботов: ${BOTS} (${bots.map((b) => b.nick).join(', ')}), режим ${MODE}, раундов ${ROUNDS}`);
const started = Date.now();
const timer = setInterval(() => {
  const seated = bots.filter((b) => b.seat >= 0).length;
  console.log(`  ... ${Math.round((Date.now() - started) / 1000)} с: за столом ${seated}, раундов ${bots.map((b) => b.rounds).join('/')}, отказов ${Object.values(totals.errors).reduce((s, n) => s + n, 0)}`);
}, 15_000);
while (!bots.every((b) => b.done) && Date.now() - started < MAX_MS) await sleep(250);
clearInterval(timer);
await sleep(600);
for (const b of bots) b.close();
const errorsTotal = Object.values(totals.errors).reduce((s, n) => s + n, 0);
const summary = { ...totals, errorsTotal, seconds: Math.round((Date.now() - started) / 1000), finalTokens: bots.map((b) => `${b.nick}=${b.tokens}`) };
console.log(JSON.stringify(summary, null, 2));
if (args.out) writeFileSync(args.out, JSON.stringify(summary, null, 2));
process.exit(0);
