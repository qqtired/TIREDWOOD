import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BL_TABLES, BL_TABLE_COUNT } from '../shared/billiards.ts';
import { tables2Enabled } from '../shared/tables2.ts';
import { allOf, lastOf, login, placeAt, setupHub } from './kit.ts';

function setup(tables2 = true) {
  const env = setupHub({ tables2, billiards: true });
  const { hub } = env;
  const a = login(hub, 'CheerA'), b = login(hub, 'CheerB'), fan = login(hub, 'CheerFan');
  const it = hub.lobby.map.interact.find((i) => i.kind === 'billiards' && i.arg === 0)!;
  for (const who of [a, b]) {
    placeAt(hub, who.c, it.x - 1.25, it.z);
    hub.onJson(who.c, { t: 'use', id: it.id });
  }
  hub.onJson(a.c, { t: 'bl', table: 0, a: 'offer', amount: 0 });
  hub.onJson(b.c, { t: 'bl', table: 0, a: 'accept', amount: 0 });
  assert.equal(hub.lobby.billiards!.view(0).phase, 'match');
  placeAt(hub, fan.c, BL_TABLES[0].x + 6, BL_TABLES[0].z);
  return { ...env, a, b, fan };
}

test('TABLES2 requires an explicit 1 and is advertised only when enabled', () => {
  for (const value of [undefined, '', '0', 'true']) assert.equal(tables2Enabled(value), false);
  assert.equal(tables2Enabled('1'), true);
  const { hub } = setupHub();
  assert.equal(hub.tables2, false);
  assert.equal('tables2' in lastOf(login(hub, 'FlagOff').s, 'lobby')!, false);
  const on = setupHub({ tables2: true });
  assert.equal(lastOf(login(on.hub, 'FlagOn').s, 'lobby')?.tables2, true);
});

test('nearby spectator and players receive a cheer; distant players do not; cooldown is 2 seconds', () => {
  const { hub, clock, a, b, fan } = setup();
  const far = login(hub, 'CheerFar');
  placeAt(hub, far.c, BL_TABLES[0].x + 15, BL_TABLES[0].z);
  const cheer = { t: 'blCheer', table: 0, side: 0 } as const;
  hub.onJson(fan.c, cheer);
  const expected = { ...cheer, pid: fan.c.pid, nick: fan.c.nick, text: 'Давай, CheerA!' };
  for (const who of [a, b, fan]) assert.deepEqual(allOf(who.s, 'blCheer'), [expected]);
  assert.equal(allOf(far.s, 'blCheer').length, 0);
  clock.now += 1999;
  hub.onJson(fan.c, cheer);
  for (const who of [a, b, fan]) assert.equal(allOf(who.s, 'blCheer').length, 1);
  clock.now++;
  hub.onJson(fan.c, { ...cheer, side: 1 });
  assert.equal(lastOf(fan.s, 'blCheer')?.text, 'Давай, CheerB!');
  assert.equal(allOf(fan.s, 'blCheer').length, 2);
});

test('cheering is silent with TABLES2 or billiards disabled', () => {
  const { hub, a, b, fan } = setup(false);
  hub.onJson(fan.c, { t: 'blCheer', table: 0, side: 0 });
  for (const who of [a, b, fan]) assert.equal(allOf(who.s, 'blCheer').length, 0);
  const off = setupHub({ tables2: true, billiards: false });
  const who = login(off.hub, 'NoBilliards');
  placeAt(off.hub, who.c, BL_TABLES[0].x, BL_TABLES[0].z);
  off.hub.onJson(who.c, { t: 'blCheer', table: 0, side: 0 });
  assert.equal(allOf(who.s, 'blCheer').length, 0);
});

test('seated players, distant spectators, ephemeral clients and invalid targets cannot cheer', () => {
  const { hub, clock, a, b, fan } = setup();
  hub.onJson(a.c, { t: 'blCheer', table: 0, side: 0 });
  for (const distance of [14, 15]) {
    placeAt(hub, fan.c, BL_TABLES[0].x + distance, BL_TABLES[0].z);
    clock.now += 2000;
    hub.onJson(fan.c, { t: 'blCheer', table: 0, side: 0 });
  }
  placeAt(hub, fan.c, BL_TABLES[0].x + 6, BL_TABLES[0].z);
  for (const [table, side] of [[-1, 0], [BL_TABLE_COUNT, 0], [0.5, 0], [0, 2], [1, 0]]) {
    clock.now += 2000;
    hub.onJson(fan.c, { t: 'blCheer', table, side });
  }
  clock.now += 2000;
  fan.c.ephemeral = true;
  hub.onJson(fan.c, { t: 'blCheer', table: 0, side: 0 });
  fan.c.ephemeral = false;
  for (const who of [a, b, fan]) assert.equal(allOf(who.s, 'blCheer').length, 0);
});
