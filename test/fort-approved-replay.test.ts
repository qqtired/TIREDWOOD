import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FortGame } from '../server/fort/game.ts';
import { FT_WAVE, Z_WALKER, type FortEvent } from '../shared/fort.ts';
import { WALL_H } from '../shared/fortmap.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import * as S from '../shared/fortsiege.ts';

function fixture(kind: number) {
  const g = new FortGame({ siege: true });
  const sink = { sendJson() {}, sendBinary() {}, close() {} };
  const p = g.addHuman({ pid: 91, nick: 'ReplayOwner', outfit: DEFAULT_OUTFIT }, sink)!;
  g.phase = FT_WAVE;
  const events: FortEvent[] = [];
  const original = g.event.bind(g);
  g.event = (e) => { events.push(e); original(e); };
  const z = g.horde.spawn(kind, 1)!;
  if (kind === S.Z_SIEGE_TOWER) Object.assign(z, { x: -12.5, z: -18.6 });
  else Object.assign(z, { x: 0, z: -25 });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { g.tick++; g.horde.step(); } };
  const until = (state: number) => {
    for (let i = 0; i < 4000 && z.state !== state; i++) step();
    assert.equal(z.state, state, 'real server controller reached the requested phase');
  };
  let nextId = 92;
  const join = () => {
    const messages: ServerMsg[] = [];
    const q = g.addHuman({ pid: nextId++, nick: `ReplayGuest${nextId}`, outfit: DEFAULT_OUTFIT },
      { sendJson(m) { messages.push(m); }, sendBinary() {}, close() {} })!;
    const replay = messages.flatMap((m) => m.t === 'fev' ? m.e : []);
    return { q, replay };
  };
  return { g, p, z, events, step, until, join };
}

function phase(events: readonly FortEvent[], id: number) {
  const e = events.find((e) => e[0] === 'siegephase' && e[1] === id);
  assert.ok(e, 'actual FortGame.addHuman replay contains the authoritative phase clock');
  return e as ['siegephase', number, number, number, number, number];
}

function warning(events: readonly FortEvent[], id: number) {
  const e = events.find((e) => e[0] === 'warn' && e[1] === id);
  assert.ok(e, 'actual FortGame.addHuman replay contains the active danger mark');
  return e as Extract<FortEvent, ['warn', ...number[]]>;
}

test('late join during tower deployment restores its wall target, exact deadline and original phase start', () => {
  const { g, z, step, until, join } = fixture(S.Z_SIEGE_TOWER);
  until(S.ZS_SIEGE_DEPLOY);
  const started = g.tick;
  step(40);
  const { replay } = join();
  assert.deepEqual(phase(replay, z.id), ['siegephase', z.id, z.kind, z.state, started, started + S.SIEGE_DEPLOY_TICKS]);
  assert.deepEqual(warning(replay, z.id), ['warn', z.id, S.ZS_SIEGE_DEPLOY, z.toX, z.toY, z.toZ, 2, g.tick + z.t]);
  assert.ok(replay.findIndex((e) => e[0] === 'siegephase') < replay.findIndex((e) => e[0] === 'warn'));
});

test('active bridge keeps its wall warning; its old walker gets a flight clock without a fake mechanism counter', () => {
  const { g, z, step, until, join } = fixture(S.Z_SIEGE_TOWER);
  const walker = g.horde.spawn(Z_WALKER, 1)!;
  Object.assign(walker, { x: -12.5, z: -20.5 });
  until(S.ZS_SIEGE_ACTION);
  for (let i = 0; i < 300 && walker.state !== S.ZS_BOARD; i++) step();
  assert.equal(walker.state, S.ZS_BOARD);
  const { replay } = join();
  assert.equal(warning(replay, z.id)[7], g.tick + z.t);
  assert.equal(phase(replay, walker.id)[5], g.tick + walker.t);
  assert.ok(!replay.some((e) => e[0] === 'siege' && e[1] === walker.id));
});

test('late join during Miller windup gets kind before its stripe and a warning through the entire gust', () => {
  const { g, z, step, until, join } = fixture(S.Z_MILLER);
  until(S.ZS_SIEGE_WINDUP);
  const started = g.tick;
  step(27);
  const { replay } = join();
  assert.deepEqual(phase(replay, z.id), ['siegephase', z.id, S.Z_MILLER, S.ZS_SIEGE_WINDUP, started, started + 108]);
  assert.deepEqual(warning(replay, z.id), ['warn', z.id, S.ZS_SIEGE_WINDUP, z.toX, z.toY, z.toZ, 4, g.tick + z.t + 180]);
});

test('snapshot gap and two late joins during ACTION do not restart Miller action or move its deadline', () => {
  const { g, z, events, step, until, join } = fixture(S.Z_MILLER);
  until(S.ZS_SIEGE_ACTION);
  const started = g.tick;
  const end = started + 180;
  step(80);
  const a = join().replay;
  assert.deepEqual(phase(a, z.id), ['siegephase', z.id, z.kind, S.ZS_SIEGE_ACTION, started, end]);
  assert.equal(warning(a, z.id)[7], end);
  step(35);
  const b = join().replay;
  assert.deepEqual(phase(b, z.id), phase(a, z.id));
  assert.equal(warning(b, z.id)[7], end);
  assert.equal(events.filter((e) => e[0] === 'siegephase' && e[1] === z.id && e[3] === S.ZS_SIEGE_ACTION).length, 1,
    'a decrementing timer must not broadcast a new phase start every tick');
});

test('Miller stripe still covers the final damaging gust tick for a player who entered late', () => {
  const { g, p, z, step, until, join } = fixture(S.Z_MILLER);
  const hit = { x: 0, y: 0, z: 0 };
  const x = Array.from({ length: 49 }, (_, i) => -12 + i * .5)
    .find((x) => !g.traceAttack(0, WALL_H + 2.2, -25, x, WALL_H + .8, -14.5, hit));
  assert.notEqual(x, undefined);
  Object.assign(p.state, { x: x!, y: WALL_H, z: -14.5 });
  g.targets = () => [...g.players.values()].filter((p) => p.alive)
    .map((p) => ({ id: p.id, x: p.state.x, y: p.state.y, z: p.state.z, air: false }));
  until(S.ZS_SIEGE_WINDUP);
  p.state.z = 0; // Fixed mark remains at the wall; original target gets out before the attack.
  until(S.ZS_SIEGE_ACTION);
  const actionStart = g.tick;
  step(170);
  const { q, replay } = join();
  const mark = warning(replay, z.id);
  assert.equal(mark[7], actionStart + 180);
  Object.assign(q.state, { x: x!, y: WALL_H, z: -14.5 });
  step(9);
  assert.equal(q.hp, 100);
  assert.equal(mark[7], g.tick + 1, 'stripe has not expired before the last possible damaging tick');
  step();
  assert.equal(q.hp, 70, 'real server hit occurs on the marked final gust tick');
  assert.equal(z.state, S.ZS_SIEGE_OPEN);
  assert.ok(!g.horde.siege.replay().some((e) => e[0] === 'warn' && e[1] === z.id), 'opening the boss removes the spent danger');
});

test('Crab action replay marks its coming impact only, never inventing a second hit after it landed', () => {
  const { g, z, step, until, join } = fixture(S.Z_CRABCRANE);
  until(S.ZS_SIEGE_ACTION);
  const start = g.tick;
  step(12);
  assert.equal(warning(join().replay, z.id)[7], start + 30);
  step(30);
  const replay = join().replay;
  assert.equal(phase(replay, z.id)[5], start + 60);
  assert.ok(!replay.some((e) => e[0] === 'warn' && e[1] === z.id));
});

test('battery ACTION replay keeps the launched shell mark separate after its source is killed', () => {
  const { g, z, step, until, join } = fixture(S.Z_BATTERY);
  until(S.ZS_SIEGE_ACTION);
  const started = g.tick;
  step(12);
  const { replay } = join();
  assert.deepEqual(phase(replay, z.id), ['siegephase', z.id, z.kind, z.state, started, started + S.BATTERY_FLIGHT_TICKS]);
  const shell = replay.find((e) => e[0] === 'warn' && e[1] >= 2_000_000)!;
  assert.ok(shell);
  assert.ok(!replay.some((e) => e[0] === 'warn' && e[1] === z.id));
  g.horde.kill(z, 1);
  const after = join().replay;
  assert.ok(after.some((e) => e[0] === 'warn' && e[1] === shell[1]));
  assert.ok(!after.some((e) => e[0] === 'siegephase' && e[1] === z.id));
});

test('repeated interruption of the same canopy OPEN state publishes a fresh exact clock; end-of-wave clear leaves no replayed hazard', () => {
  const { g, z, step, join } = fixture(S.Z_CANOPY);
  step();
  g.horde.siege.precision(z, 1);
  const old = phase(join().replay, z.id);
  step(17);
  g.horde.siege.precision(z, 1);
  const next = phase(join().replay, z.id);
  assert.equal(next[3], S.ZS_SIEGE_OPEN);
  assert.equal(next[4], g.tick);
  assert.equal(next[5], g.tick + S.CANOPY_OPEN_TICKS);
  assert.ok(next[4] > old[4]);
  g.horde.siege.clear();
  assert.deepEqual(g.horde.siege.replay(), []);
});
