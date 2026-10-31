import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DurakResult } from '../server/lobby/durak.ts';
import { normalizeProfile } from '../server/store.ts';
import { BL_AWAY_TICKS, BL_WIN, makeBalls } from '../shared/billiards.ts';
import { mskDayNum } from '../shared/fishrules.ts';
import { levelFromXp, xpForLevel } from '../shared/levels.ts';
import { allOf, lastOf, login, placeAt, setupHub, steps } from './kit.ts';

type Env = ReturnType<typeof setupHub>;
type Who = ReturnType<typeof login>;

function result(...people: Who[]): DurakResult {
  return {
    table: 0, draw: false, ep: false,
    players: people.map(({ c }, i) => ({ pid: c.pid, slot: i + 1, nick: c.nick, bot: false, present: true, fool: i > 0, first: i === 0 })),
  };
}

function xpToasts(who: Who): string[] {
  return allOf(who.s, 'toast').map((m) => m.text).filter((s) => /^\+\d+ опыта за партию/.test(s));
}

function billiards(env: Env): [Who, Who] {
  const { hub } = env;
  const a = login(hub, 'TableXpA'), b = login(hub, 'TableXpB');
  const it = hub.lobby.map.interact.find((i) => i.kind === 'billiards' && i.arg === 0)!;
  for (const who of [a, b]) {
    placeAt(hub, who.c, it.x - 1.25, it.z);
    hub.onJson(who.c, { t: 'use', id: it.id });
  }
  hub.onJson(a.c, { t: 'bl', table: 0, a: 'offer', amount: 0 });
  hub.onJson(b.c, { t: 'bl', table: 0, a: 'accept', amount: 0 });
  assert.equal(hub.lobby.billiards!.view(0).phase, 'match');
  return [a, b];
}

test('durak with two present humans grants 15 XP each without tokens, including a draw, without TABLES2', () => {
  const { hub } = setupHub();
  const people = [login(hub, 'DurakXpA'), login(hub, 'DurakXpB')];
  const before = people.map(({ c }) => ({ xp: c.profile!.xp, tokens: c.profile!.tokens }));
  const r = result(...people);
  hub.onDurakGame(r);
  for (const [i, who] of people.entries()) {
    assert.equal(who.c.profile!.xp, before[i].xp + 15);
    assert.equal(who.c.profile!.tokens, before[i].tokens);
    assert.equal(who.c.profile!.stats.txGames, 1);
    assert.deepEqual(xpToasts(who), ['+15 опыта за партию с людьми · сегодня 1 из 20']);
  }
  r.draw = true;
  for (const pl of r.players) { pl.fool = false; pl.first = false; }
  hub.onDurakGame(r);
  people.forEach(({ c }, i) => {
    assert.equal(c.profile!.xp, before[i].xp + 30);
    assert.equal(c.profile!.tokens, before[i].tokens);
    assert.equal(c.profile!.stats.txGames, 2);
  });
});

test('durak against a bot gives no table XP or XP toast', () => {
  const { hub } = setupHub();
  const a = login(hub, 'SoloTableXp'), r = result(a);
  r.players.push({ pid: 0, slot: 2, nick: 'Бот', bot: true, present: true, fool: true, first: false });
  const before = a.c.profile!.xp;
  hub.onDurakGame(r);
  assert.equal(a.c.profile!.xp, before);
  assert.equal(a.c.profile!.stats.txGames, 0);
  assert.deepEqual(xpToasts(a), []);
});

test('durak rewards only humans present at the end with a connected client', () => {
  const { hub } = setupHub();
  const a = login(hub, 'AbsentXp'), b = login(hub, 'PresentXp'), c = login(hub, 'OfflineXp');
  const r = result(a, b, c), before = [a, b, c].map((who) => who.c.profile!.xp);
  r.players[0].present = false;
  hub.disconnect(c.c);
  hub.onDurakGame(r);
  assert.deepEqual([a, b, c].map((who) => who.c.profile!.xp), [before[0], before[1] + 15, before[2]]);
  assert.deepEqual([a, b, c].map((who) => who.c.profile!.stats.txGames), [0, 1, 0]);
});

test('both games share a 20-game daily cap, and reset exactly at Moscow midnight', () => {
  const { hub, clock } = setupHub();
  clock.now = Date.UTC(2026, 9, 1, 20, 59, 59, 999);
  const a = login(hub, 'LimitXpA'), b = login(hub, 'LimitXpB'), r = result(a, b);
  const p = a.c.profile!, xp = p.xp, tokens = p.tokens;
  for (let i = 0; i < 21; i++) hub.onDurakGame(r);
  assert.equal(p.xp, xp + 20 * 15);
  assert.equal(p.tokens, tokens);
  assert.equal(p.stats.txGames, 20);
  assert.equal(p.stats.txDay, mskDayNum(clock.now));
  assert.equal(xpToasts(a).length, 20);
  assert.equal(xpToasts(a).at(-1), '+15 опыта за партию с людьми · сегодня 20 из 20 — на сегодня всё');
  hub.tableXp(a.c.pid, 'billiards');
  assert.equal(p.xp, xp + 20 * 15);
  assert.equal(xpToasts(a).length, 20);
  const day = p.stats.txDay;
  clock.now++;
  hub.onDurakGame(r);
  assert.equal(p.stats.txDay, day + 1);
  assert.equal(p.stats.txGames, 1);
  assert.equal(p.xp, xp + 21 * 15);
  assert.equal(xpToasts(a).at(-1), '+15 опыта за партию с людьми · сегодня 1 из 20');
});

test('table XP uses normal level progression and the mixed-game limit', () => {
  const { hub, profiles } = setupHub();
  const a = login(hub, 'TableLevel'), p = a.c.profile!;
  p.xp = xpForLevel(2) - 10;
  p.level = levelFromXp(p.xp);
  const tokens = p.tokens;
  assert.deepEqual(profiles.tableGameXp(p, 'durak'), { xp: 15, n: 1 });
  assert.equal(p.level, 2);
  assert.ok(lastOf(a.s, 'levelUp'));
  for (let i = 1; i < 19; i++) profiles.tableGameXp(p, 'durak');
  hub.tableXp(p.id, 'billiards');
  assert.equal(p.stats.txGames, 20);
  assert.equal(xpToasts(a).at(-1), '+10 опыта за партию с человеком · сегодня 20 из 20 — на сегодня всё');
  assert.deepEqual(profiles.tableGameXp(p, 'durak'), { xp: 0, n: 20 });
  assert.equal(p.tokens, tokens);
});

test('billiards reaching 8 balls grants both humans 10 XP with no token change', () => {
  const env = setupHub({ billiards: true });
  const people = billiards(env), tb = env.hub.lobby.billiards!.tables[0];
  const before = people.map(({ c }) => ({ xp: c.profile!.xp, tokens: c.profile!.tokens }));
  tb.score[tb.turn] = BL_WIN - 1;
  const fresh = makeBalls();
  for (let i = 0; i < 16; i++) Object.assign(tb.balls[i], fresh[i]);
  Object.assign(tb.balls[0], { x: -0.3, z: -0.6, on: true });
  Object.assign(tb.balls[1], { x: -0.43, z: -0.86, on: true });
  env.clock.now += 1000;
  env.hub.onJson(people[tb.turn].c, { t: 'bl', table: 0, a: 'shoot', n: tb.shot, ang: Math.atan2(-0.13, -0.26), pw: 0.45 });
  steps(env.hub, Math.max(0, tb.restAt - env.hub.lobby.tick) + 1);
  assert.equal(tb.phase, 'result');
  assert.equal(tb.why, 'score');
  assert.equal(tb.score[tb.winner], 8);
  people.forEach((who, i) => {
    assert.equal(who.c.profile!.xp, before[i].xp + 10);
    assert.equal(who.c.profile!.tokens, before[i].tokens);
    assert.equal(who.c.profile!.stats.txGames, 1);
    assert.deepEqual(xpToasts(who), ['+10 опыта за партию с человеком · сегодня 1 из 20']);
  });
});

test('billiards resignation or absence grants no table XP', () => {
  for (const why of ['resign', 'away'] as const) {
    const env = setupHub({ billiards: true });
    const people = billiards(env), before = people.map(({ c }) => c.profile!.xp);
    if (why === 'resign') env.hub.onJson(people[0].c, { t: 'bl', table: 0, a: 'resign' });
    else {
      env.hub.onJson(people[0].c, { t: 'unuse' });
      steps(env.hub, BL_AWAY_TICKS + 1);
    }
    assert.equal(env.hub.lobby.billiards!.tables[0].why, why);
    people.forEach((who, i) => {
      assert.equal(who.c.profile!.xp, before[i]);
      assert.equal(who.c.profile!.stats.txGames, 0);
      assert.deepEqual(xpToasts(who), []);
    });
  }
});

test('old profiles without table XP counters normalize to zero without losing progress', () => {
  const p = normalizeProfile({ id: 12, nick: 'OldTableXp', tokens: 1234, stats: { dkGames: 9, rcRaces: 4 } });
  assert.ok(p);
  assert.equal(p.stats.txDay, 0);
  assert.equal(p.stats.txGames, 0);
  assert.equal(p.stats.dkGames, 9);
  assert.equal(p.stats.rcRaces, 4);
  assert.equal(p.tokens, 1234);
});
