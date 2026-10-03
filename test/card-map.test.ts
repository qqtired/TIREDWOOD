import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLobby, seatTable } from '../shared/maps/lobby.ts';
import { CollisionWorld } from '../shared/world.ts';

test('кафе сохраняет 18 старых стульев: два стола дурака и один Blackjack', () => {
  const m = buildLobby();
  const dk = m.interact.filter((i) => i.kind === 'durak');
  const bj = m.interact.filter((i) => String(i.kind) === 'blackjack');
  assert.equal(dk.length, 12);
  assert.equal(bj.length, 6);
  assert.deepEqual(dk.map((i) => i.arg), Array.from({ length: 12 }, (_, i) => i));
  assert.deepEqual(bj.map((i) => i.arg), [12, 13, 14, 15, 16, 17]);
  for (const i of [...dk, ...bj]) {
    const center = m.tables[seatTable(i.arg)];
    assert.ok(Math.abs(Math.hypot(i.x - center.x, i.z - center.z) - 1.35) < 1e-9);
  }
  assert.equal(m.interact.find((i) => i.kind === 'fisher')?.id, 52);
  assert.deepEqual(m.interact.filter((i) => i.kind === 'fish').map((i) => i.id), [35, 36, 37, 38, 39, 40, 46, 47, 48, 49, 50, 51]);
});

test('портал скилл-теста добавлен после старых точек; вход и выход стоят на свободном настиле', () => {
  const m = buildLobby();
  const portal = m.interact.find((i) => String(i.kind) === 'skill');
  assert.ok(portal);
  assert.equal(portal.id, 53);
  const w = new CollisionWorld(m);
  for (const [x, z] of [[portal.x, portal.z], [-10, -9.4]]) {
    assert.equal(w.groundBelow(x, 0.4, z), 0);
    assert.ok(!w.overlaps(x - .45, .01, z - .45, x + .45, 1.8, z + .45));
  }
  for (const i of m.interact) if (i.id !== portal.id) assert.ok(Math.hypot(i.x - portal.x, i.z - portal.z) > portal.r + i.r, `портал не мешает точке ${i.id}`);
});
