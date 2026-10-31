import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RC_GRID, RC_GRID_TICKS, RC_RACE, RC_RESULTS, RC_RESULTS_TICKS } from '../shared/kart.ts';
import { allOf, lastOf, login, setupHub, steps } from './kit.ts';

function setup(humans = 2, tables2 = true) {
  const env = setupHub({ tables2 });
  const people = Array.from({ length: humans }, (_, i) => login(env.hub, `AgainPlayer${i}`));
  for (const { c } of people) env.hub.onJson(c, { t: 'ready', e: c.epoch });
  env.hub.startRace(people.map(({ c }) => c), 'hills');
  for (const { c } of people) env.hub.onJson(c, { t: 'ready', e: c.epoch });
  return { ...env, people };
}

function results(env: ReturnType<typeof setup>) {
  const { hub, people } = env, race = hub.race.race!;
  steps(hub, RC_GRID_TICKS);
  assert.equal(race.phase, RC_RACE);
  // Люди пересекли финиш: следующий тик проведёт обычные finishRace/pay.
  for (const [i, { c }] of people.entries()) {
    const k = hub.race.kartOf(c)!;
    k.state.done = 1;
    k.finishPlace = i + 1;
    k.finishTick = race.tick + 1;
  }
  hub.step();
  assert.equal(race.phase, RC_RESULTS);
  assert.equal(race.phaseEnd - race.tick, RC_RESULTS_TICKS);
  return race;
}

test('solo with bots starts another race on the same track without lobby or duplicate rewards; loading is awaited again', () => {
  const env = setup(1), { hub, people: [a] } = env;
  const old = results(env), oldKart = hub.race.kartOf(a.c)!;
  assert.ok([...old.karts.values()].some((k) => k.isBot));
  assert.equal(lastOf(a.s, 'race')?.again, true);
  assert.deepEqual(lastOf(a.s, 'rcAgain'), { t: 'rcAgain', ids: [], need: 1 });
  const tokens = a.c.profile!.tokens, xp = a.c.profile!.xp, epoch = a.c.epoch, from = a.s.msgs.length;
  assert.equal(a.c.profile!.stats.rcRaces, 1);
  hub.onJson(a.c, { t: 'rcAgain' });
  const next = hub.race.race!;
  assert.notEqual(next, old);
  assert.equal(old.closed, true);
  assert.equal(next.trackId, 'hills');
  assert.equal(next.phase, RC_GRID);
  assert.equal(next.humanCount, 1);
  assert.ok([...next.karts.values()].some((k) => k.isBot));
  assert.equal(a.c.room, hub.race);
  assert.notEqual(hub.race.kartOf(a.c), oldKart);
  assert.equal(a.c.epoch, (epoch + 1) & 255);
  assert.equal(a.c.lastMove, hub.tick);
  assert.deepEqual(a.s.msgs.slice(from).filter((m) => m.t === 'scene'), [{ t: 'scene', scene: 'race', epoch: a.c.epoch }]);
  assert.equal(a.c.profile!.tokens, tokens);
  assert.equal(a.c.profile!.xp, xp);
  assert.equal(a.c.profile!.stats.rcRaces, 1);
  assert.equal(allOf(a.s, 'raceReward').length, 1);
  assert.equal(next.again.size, 0);
  hub.onJson(a.c, { t: 'rcAgain' });
  assert.equal(next.again.size, 0, 'голос до итогов игнорируется');
  assert.equal(hub.gate.loading(a.c), true);
  const end = next.phaseEnd;
  hub.onJson(a.c, { t: 'ready', e: epoch });
  hub.step();
  assert.equal(next.phaseEnd, end + 1, 'старая готовность не запускает новый заезд');
  hub.onJson(a.c, { t: 'ready', e: a.c.epoch });
  assert.equal(hub.gate.loading(a.c), false);
  steps(hub, next.phaseEnd - next.tick);
  assert.equal(next.phase, RC_RACE);
  const k = hub.race.kartOf(a.c)!;
  k.state.done = 1; k.finishPlace = 1; k.finishTick = next.tick + 1;
  hub.step();
  assert.equal(next.phase, RC_RESULTS);
  assert.equal(a.c.profile!.stats.rcRaces, 2);
  assert.equal(allOf(a.s, 'raceReward').length, 2);
});

test('two humans need both votes; repeat votes are idempotent and the next race has no bots', () => {
  const env = setup(), { hub, people: [a, b] } = env, old = results(env);
  const end = old.phaseEnd;
  for (const who of [a, b]) assert.deepEqual(lastOf(who.s, 'rcAgain'), { t: 'rcAgain', ids: [], need: 2 });
  const id = hub.race.kartOf(a.c)!.id;
  hub.onJson(a.c, { t: 'rcAgain' });
  assert.equal(hub.race.race, old);
  assert.equal(old.closed, false);
  assert.equal(old.phaseEnd, end);
  for (const who of [a, b]) assert.deepEqual(lastOf(who.s, 'rcAgain'), { t: 'rcAgain', ids: [id], need: 2 });
  hub.onJson(a.c, { t: 'rcAgain' });
  assert.equal(allOf(a.s, 'rcAgain').length, 2);
  assert.equal(old.again.size, 1);
  hub.onJson(b.c, { t: 'rcAgain' });
  assert.notEqual(hub.race.race, old);
  assert.equal(old.closed, true);
  assert.equal(hub.race.race!.phase, RC_GRID);
  assert.equal(hub.race.race!.humanCount, 2);
  assert.equal(hub.race.race!.karts.size, 2);
  for (const who of [a, b]) {
    assert.equal(who.c.room, hub.race);
    assert.ok(hub.race.kartOf(who.c));
    assert.equal(who.c.profile!.stats.rcRaces, 1);
    assert.equal(allOf(who.s, 'raceReward').length, 1);
  }
});

test('one vote and the other human leaving or disconnecting rematches only the remaining player', () => {
  for (const disconnect of [false, true]) {
    const env = setup(), { hub, people: [a, b] } = env, old = results(env);
    hub.onJson(a.c, { t: 'rcAgain' });
    if (disconnect) hub.disconnect(b.c);
    else hub.onJson(b.c, { t: 'leave' });
    assert.notEqual(hub.race.race, old);
    assert.equal(old.closed, true);
    assert.equal(hub.race.race!.phase, RC_GRID);
    assert.equal(hub.race.race!.humanCount, 1);
    assert.equal(hub.race.humans, 1);
    assert.equal(a.c.room, hub.race);
    assert.ok(hub.race.kartOf(a.c));
    assert.equal(hub.race.kartOf(b.c), undefined);
    assert.equal(b.c.room, disconnect ? null : hub.lobby);
  }
});

test('a departed human vote is removed before recalculating the majority', () => {
  const env = setup(3), { hub, people: [a, b, c] } = env, old = results(env);
  hub.onJson(a.c, { t: 'rcAgain' });
  hub.onJson(a.c, { t: 'leave' });
  assert.equal(hub.race.race, old);
  assert.equal(old.again.size, 0);
  assert.deepEqual(lastOf(b.s, 'rcAgain'), { t: 'rcAgain', ids: [], need: 2 });
  hub.onJson(b.c, { t: 'rcAgain' });
  assert.equal(hub.race.race, old);
  hub.onJson(c.c, { t: 'rcAgain' });
  assert.notEqual(hub.race.race, old);
  assert.equal(hub.race.humans, 2);
  assert.equal(a.c.room, hub.lobby);
});

test('without a majority, the original 10-second results timeout returns everyone to lobby', () => {
  for (const votes of [0, 1]) {
    const env = setup(), { hub, people } = env, old = results(env);
    if (votes) hub.onJson(people[0].c, { t: 'rcAgain' });
    steps(hub, RC_RESULTS_TICKS);
    assert.equal(old.closed, true);
    assert.equal(hub.race.race, old);
    assert.equal(hub.race.humans, 0);
    for (const { c } of people) assert.equal(c.room, hub.lobby);
  }
});

test('TABLES2 off omits the welcome flag, silently ignores votes and keeps the original timeout', () => {
  const env = setup(2, false), { hub, people } = env, old = results(env);
  for (const { c, s } of people) {
    assert.equal('again' in lastOf(s, 'race')!, false);
    hub.onJson(c, { t: 'rcAgain' });
    assert.equal(allOf(s, 'rcAgain').length, 0);
  }
  assert.equal(hub.race.race, old);
  assert.equal(old.again.size, 0);
  steps(hub, RC_RESULTS_TICKS);
  for (const { c } of people) assert.equal(c.room, hub.lobby);
});
