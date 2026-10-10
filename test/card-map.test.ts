import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH_ISLE_FIRST, spotZone } from '../shared/fishplaces.ts';
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
  // места у пристани — прежние номера; места баркаса (fisheco, barkas) добавляются только после прежних точек
  const fish = m.interact.filter((i) => i.kind === 'fish');
  assert.deepEqual(fish.filter((i) => spotZone(i.arg) === 'pier' && i.arg < 12).map((i) => i.id), [35, 36, 37, 38, 39, 40, 46, 47, 48, 49, 50, 51]);
  for (const i of fish) if (spotZone(i.arg) === 'barkas') assert.ok(i.id > 52, `место баркаса ${i.id} — после прежних точек`);
  // места дальних мостков и у дома рыбака (пристань, номера 20…27) — после первых восьми мест баркаса (12…19); два новых
  // места удлинённого баркаса (28, 29) — в самом конце списка
  const barkasMax = Math.max(...fish.filter((i) => i.arg >= 12 && i.arg < 20).map((i) => i.id));
  for (const i of fish) if (i.arg >= 20 && i.arg < 28) assert.ok(spotZone(i.arg) === 'pier' && i.id > barkasMax, `дальнее место ${i.id} — после баркаса`);
  const farMax = Math.max(...fish.filter((i) => i.arg >= 20 && i.arg < 28).map((i) => i.id));
  for (const i of fish) if (i.arg >= 28 && i.arg < FISH_ISLE_FIRST) assert.ok(spotZone(i.arg) === 'barkas' && i.id > farMax && i.id > m.interact.find((b) => b.kind === 'banner')!.id, `новое место баркаса ${i.id} — в конце`);
  // места на моле острова «Последний свет» — своя зона, после мест баркаса
  const barkasEnd = Math.max(...fish.filter((i) => i.arg >= 28 && i.arg < FISH_ISLE_FIRST).map((i) => i.id));
  for (const i of fish) if (i.arg >= FISH_ISLE_FIRST) assert.ok(spotZone(i.arg) === 'isle' && i.id > barkasEnd, `место острова ${i.id} — после баркаса`);
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
