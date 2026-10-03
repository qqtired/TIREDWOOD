// Бильярд на сервере через настоящий хаб: ставка без денег, банк победителю, таймер хода, техническое поражение,
// соло без призов, возврат ставки после рестарта.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { BL_AWAY_TICKS, BL_RESULT_TICKS, BL_TURN_TICKS, BL_WIN, makeBalls, rack, type BlBall } from '../shared/billiards.ts';
import { Hub, type Client } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { SMOKE, allOf, lastOf, login, placeAt, steps, type FakeSink } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function setup(dir = mkdtempSync(path.join(tmpdir(), 'opus-bl-'))) {
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 4, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, billiards: true });
  return { hub, store, profiles, clock, dir };
}

type Env = ReturnType<typeof setup>;
type Who = { c: Client; s: FakeSink };

/** Подойти к столу t и нажать E. */
function sit(env: Env, p: Who, t = 0): void {
  const it = env.hub.lobby.map.interact.find((i) => i.kind === 'billiards' && i.arg === t)!;
  placeAt(env.hub, p.c, it.x - 1.25, it.z);
  env.hub.onJson(p.c, { t: 'use', id: it.id });
}

/** Действие у стола (часы вперёд — иначе сработает ограничение частоты). */
function bl(env: Env, p: Who, msg: Record<string, unknown>, t = 0): void {
  env.clock.now += 1000;
  env.hub.onJson(p.c, { t: 'bl', table: t, ...msg } as never);
}

const table = (env: Env, t = 0) => env.hub.lobby.billiards!.tables[t];

/** Подготовить стол: только биток и шар 1 у угловой лузы — следующий удар его забьёт. */
function easyPot(balls: BlBall[]): { ang: number; pw: number } {
  const fresh = makeBalls();
  for (let i = 0; i < 16; i++) Object.assign(balls[i], fresh[i]);
  Object.assign(balls[0], { x: -0.3, z: -0.6, on: true });
  Object.assign(balls[1], { x: -0.43, z: -0.86, on: true });
  return { ang: Math.atan2(-0.13, -0.26), pw: 0.45 };
}

/** Удар, а потом тики, пока шары катятся. */
function shoot(env: Env, p: Who, ang: number, pw: number, t = 0): void {
  bl(env, p, { a: 'shoot', n: table(env, t).shot, ang, pw }, t);
  steps(env.hub, Math.max(0, table(env, t).restAt - env.hub.lobby.tick) + 1);
}

function startMatch(env: Env, bet: number): [Who, Who] {
  const a = login(env.hub, 'BlTesterA'), b = login(env.hub, 'BlTesterB');
  sit(env, a); sit(env, b);
  bl(env, a, { a: 'offer', amount: bet });
  bl(env, b, { a: 'accept', amount: bet });
  assert.equal(table(env).phase, 'match');
  return [a, b];
}

test('offer without enough tokens is refused with a reason; no escrow, balance untouched', () => {
  const env = setup();
  const a = login(env.hub, 'BlPoor');
  a.c.profile!.tokens = 30;
  sit(env, a);
  assert.equal(env.hub.lobby.billiards!.view(0).seats[0]?.nick, 'BlPoor');
  bl(env, a, { a: 'offer', amount: 50 });
  assert.match(lastOf(a.s, 'blErr')!.text, /Не хватает жетонов: ставка 50, у тебя 30/);
  assert.equal(a.c.profile!.tokens, 30);
  assert.equal(a.c.profile!.billiardsEscrow, null);
  assert.equal(table(env).offer, null);
  // принять чужую ставку без денег — тоже отказ, партия не начинается
  const b = login(env.hub, 'BlRich');
  sit(env, b);
  bl(env, b, { a: 'offer', amount: 50 });
  assert.equal(b.c.profile!.billiardsEscrow?.amount, 50);
  bl(env, a, { a: 'accept', amount: 50 });
  assert.match(lastOf(a.s, 'blErr')!.text, /Не хватает жетонов/);
  assert.equal(table(env).phase, 'open');
  assert.equal(a.c.profile!.tokens, 30);
  // отошёл предложивший — ставка вернулась
  const before = b.c.profile!.tokens;
  env.hub.onJson(b.c, { t: 'unuse' });
  assert.equal(b.c.profile!.tokens, before + 50);
  assert.equal(b.c.profile!.billiardsEscrow, null);
});

test('match on a bet: both stakes reserved once, winner takes the whole bank, tokens conserved, no double spend', () => {
  const env = setup();
  const a = login(env.hub, 'BlTesterA'), b = login(env.hub, 'BlTesterB');
  const total0 = a.c.profile!.tokens + b.c.profile!.tokens;
  const a0 = a.c.profile!.tokens, b0 = b.c.profile!.tokens;
  sit(env, a); sit(env, b);
  bl(env, a, { a: 'offer', amount: 40 });
  bl(env, a, { a: 'offer', amount: 40 });
  assert.equal(a.c.profile!.tokens, a0 - 40);
  bl(env, b, { a: 'accept', amount: 40 });
  bl(env, b, { a: 'accept', amount: 40 });
  const tb = table(env);
  assert.equal(tb.phase, 'match');
  assert.equal(a.c.profile!.tokens, a0 - 40);
  assert.equal(b.c.profile!.tokens, b0 - 40);
  assert.equal(a.c.profile!.billiardsEscrow?.round, b.c.profile!.billiardsEscrow?.round);
  // чужой ход — понятный отказ
  const shooter = tb.turn === 0 ? a : b, other = tb.turn === 0 ? b : a;
  bl(env, other, { a: 'shoot', n: tb.shot, ang: 0, pw: 0.5 });
  assert.equal(lastOf(other.s, 'blErr')?.text, 'Сейчас бьёт соперник');
  // бьющему не хватает одного шара до победы — забивает
  tb.score[tb.turn] = BL_WIN - 1;
  const side = tb.turn;
  const shot = easyPot(tb.balls);
  shoot(env, shooter, shot.ang, shot.pw);
  assert.equal(tb.phase, 'result');
  assert.equal(tb.winner, side);
  assert.equal(tb.score[side], BL_WIN);
  const w = shooter.c.profile!, l = other.c.profile!;
  assert.equal(w.billiardsEscrow, null);
  assert.equal(l.billiardsEscrow, null);
  assert.equal(w.tokens, (shooter === a ? a0 : b0) + 40);
  assert.equal(l.tokens, (other === a ? a0 : b0) - 40);
  assert.equal(a.c.profile!.tokens + b.c.profile!.tokens, total0);
  assert.ok(allOf(a.s, 'blShot').length >= 1 && allOf(b.s, 'blShot').length >= 1, 'удар видят оба');
  // после итога — новая пирамида, оба у стола, можно реванш
  steps(env.hub, BL_RESULT_TICKS + 2);
  assert.equal(tb.phase, 'open');
  assert.equal(tb.seats.filter(Boolean).length, 2);
  assert.equal(a.c.profile!.tokens + b.c.profile!.tokens, total0);
});

test('turn timer: no shot in 30 s passes the turn; a miss passes it too, a pot keeps it', () => {
  const env = setup();
  const [a, b] = startMatch(env, 0);
  const tb = table(env);
  const first = tb.turn;
  steps(env.hub, BL_TURN_TICKS + 1);
  assert.equal(tb.turn, 1 - first);
  assert.match(tb.note, /не успел/);
  // забил — бьёт ещё
  const who = tb.turn === 0 ? a : b;
  const side = tb.turn;
  const shot = easyPot(tb.balls);
  shoot(env, who, shot.ang, shot.pw);
  assert.equal(tb.score[side], 1);
  assert.equal(tb.turn, side);
  // промах (бьёт в пустой борт) — ход сопернику
  shoot(env, who, Math.PI / 2, 0.2);
  assert.equal(tb.turn, 1 - side);
});

test('leaving mid-match: seat is held for the away window, then technical defeat pays the bank to the opponent', () => {
  const env = setup();
  const [a, b] = startMatch(env, 30);
  const a0 = a.c.profile!.tokens, b0 = b.c.profile!.tokens;
  const tb = table(env);
  env.hub.disconnect(a.c, 'тест');
  assert.equal(tb.phase, 'match');
  assert.ok(tb.seats[0]!.awayAt > 0);
  assert.ok(env.hub.lobby.billiards!.busy);
  steps(env.hub, BL_AWAY_TICKS - 10);
  assert.equal(tb.phase, 'match');
  steps(env.hub, 20);
  assert.equal(tb.phase, 'result');
  assert.equal(tb.winner, 1);
  assert.equal(tb.why, 'away');
  assert.equal(b.c.profile!.tokens, b0 + 60);
  assert.equal(a.c.profile!.tokens, a0);
  assert.equal(a.c.profile!.billiardsEscrow, null);
  // ушедший не держит место после итога
  steps(env.hub, BL_RESULT_TICKS + 2);
  assert.equal(tb.seats[0], null);
});

test('resign ends the match at once; a returning player gets the seat back', () => {
  const env = setup();
  const [a, b] = startMatch(env, 0);
  const tb = table(env);
  env.hub.onJson(a.c, { t: 'unuse' });
  assert.ok(tb.seats[0]!.awayAt > 0);
  sit(env, a);
  assert.equal(tb.seats[0]!.awayAt, 0);
  assert.equal(tb.phase, 'match');
  bl(env, b, { a: 'resign' });
  assert.equal(tb.phase, 'result');
  assert.equal(tb.winner, 0);
  assert.equal(tb.why, 'resign');
});

test('solo practice: shots and rerack without stakes, prizes or timer', () => {
  const env = setup();
  const a = login(env.hub, 'BlSolo');
  const t0 = a.c.profile!.tokens, xp0 = a.c.profile!.xp;
  sit(env, a, 2);
  const tb = table(env, 2);
  shoot(env, a, 0, 1, 2);
  assert.equal(tb.shot, 1);
  const shot = easyPot(tb.balls);
  shoot(env, a, shot.ang, shot.pw, 2);
  assert.equal(tb.balls[1].on, false);
  steps(env.hub, BL_TURN_TICKS * 2);
  assert.equal(tb.phase, 'open');
  bl(env, a, { a: 'rack' }, 2);
  assert.deepEqual(tb.balls.map((b) => b.on), rack().map((b) => b.on));
  assert.equal(a.c.profile!.tokens, t0);
  assert.equal(a.c.profile!.xp, xp0);
  assert.equal(a.c.profile!.billiardsEscrow, null);
  assert.equal(env.hub.lobby.billiards!.busy, false);
});

test('three tables run matches at the same time', () => {
  const env = setup();
  const ps = Array.from({ length: 6 }, (_, i) => login(env.hub, `BlMulti${i}`, undefined, `10.0.0.${i + 1}`));
  for (let t = 0; t < 3; t++) {
    sit(env, ps[2 * t], t); sit(env, ps[2 * t + 1], t);
    bl(env, ps[2 * t], { a: 'offer', amount: 10 }, t);
    bl(env, ps[2 * t + 1], { a: 'accept', amount: 10 }, t);
  }
  assert.deepEqual([0, 1, 2].map((t) => table(env, t).phase), ['match', 'match', 'match']);
  // за занятым столом третьему места нет
  const extra = login(env.hub, 'BlExtra', undefined, '10.0.0.9');
  sit(env, extra, 1);
  assert.match(allOf(extra.s, 'toast').at(-1)!.text, /идёт партия/);
});

test('server restart in the middle of a match returns both stakes', () => {
  const env = setup();
  const [a, b] = startMatch(env, 25);
  const pa = a.c.pid, pb = b.c.pid;
  const ta = a.c.profile!.tokens, tb = b.c.profile!.tokens;
  env.store.flush();
  // аварийно: без shutdown, читаем то, что на диске
  const store2 = new Store(env.dir, { log: () => {}, saveDelayMs: 60_000 });
  store2.load();
  const profiles2 = new Profiles(store2);
  assert.equal(profiles2.byId(pa)!.tokens, ta + 25);
  assert.equal(profiles2.byId(pb)!.tokens, tb + 25);
  assert.equal(profiles2.byId(pa)!.billiardsEscrow, null);
});
