// Карты: «Причал» не меняется при переносе кода, набережная проходима.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { PLAYER_HALF, PLAYER_HEIGHT } from '../shared/constants.ts';
import { CHAIR_R, LOBBY_SEAT_COUNT, PLANTERS, PLANTER_H, PLANTER_R, TABLE_SEATS, buildLobby, seatChair, seatTable, tableSeat } from '../shared/maps/lobby.ts';
import { buildPier } from '../shared/maps/pier.ts';
import { makeEvents, makeInput, makeState, stepPlayer } from '../shared/sim.ts';
import { CollisionWorld, makeRayHit } from '../shared/world.ts';

test('«Причал» остался тем же (отпечаток карты)', () => {
  const h = createHash('sha256').update(JSON.stringify(buildPier())).digest('hex');
  // выпуск 5: посередине верха креста — AWP, банка варенья там же сдвинута на 2,2 м
  assert.equal(h, '5bf0a6762f15f70ac9d82aedf6ca4c6eedceb04c5b0c2025e3bae5cf82d6ae22');
});


const lobby = buildLobby();
const lw = new CollisionWorld(lobby);

function freeSpot(x: number, z: number, floor = 0): boolean {
  return !lw.overlaps(x - PLAYER_HALF, floor + 0.01, z - PLAYER_HALF, x + PLAYER_HALF, floor + PLAYER_HEIGHT, z + PLAYER_HALF);
}

test('набережная: предметы пронумерованы, 5 автоматов, 18 карточных стульев и 6 мест на скамейках', () => {
  lobby.interact.forEach((it, i) => assert.equal(it.id, i));
  assert.equal(lobby.interact.filter((i) => i.kind === 'slot').length, 5);
  assert.deepEqual(lobby.interact.filter((i) => i.kind === 'slot').map((i) => i.arg), [0, 1, 2, 3, 4]);
  const chairs = lobby.interact.filter((i) => i.kind === 'durak' || i.kind === 'blackjack');
  assert.equal(chairs.filter(i => i.kind === 'durak').length, 12);
  assert.equal(chairs.filter(i => i.kind === 'blackjack').length, 6);
  assert.deepEqual(chairs.map((s) => s.arg), [...Array(18).keys()]);
  for (const ch of chairs) {
    const t = lobby.tables[seatTable(ch.arg)];
    assert.ok(Math.abs(Math.hypot(ch.x - t.x, ch.z - t.z) - CHAIR_R) < 1e-9, `стул ${ch.arg} у своего стола`);
    assert.equal(tableSeat(seatTable(ch.arg), seatChair(ch.arg)), ch.arg);
  }
  assert.equal(TABLE_SEATS, 6);
  const benches = lobby.interact.filter((i) => i.kind === 'seat');
  assert.deepEqual(benches.map((s) => s.arg), [18, 19, 20, 21, 22, 23]);
  assert.equal(LOBBY_SEAT_COUNT, 24);
  assert.equal(lobby.machines.length, 5);
  for (const k of ['pb_gate', 'garage', 'kiosk', 'honor', 'recent', 'boat', 'wheel', 'fort', 'fight'] as const) assert.equal(lobby.interact.filter((i) => i.kind === k).length, 1, k);
  // «Последние входы» — за доской почёта, лицом к ней (на юг)
  const hb = lobby.honorBoard;
  const back = lobby.interact.find((i) => i.kind === 'recent')!;
  assert.ok(back.z < hb.z0 && back.x > hb.x0 && back.x < hb.x1, 'за доской');
  assert.equal(back.yaw, Math.PI);
  // новые точки — только в конец (номера точек шлют клиенты): «Последние входы» (выпуск 4), за ней катер и колесо (выпуск 5),
  // арка «Крепости» и круг у двери «Fight Club» (выпуск 6). После них добавлены новые рыболовные точки.
  const kindOf = (k: string) => lobby.interact.find((i) => i.kind === k);
  assert.deepEqual(lobby.interact.slice(41, 46), [back, kindOf('boat'), kindOf('wheel'), kindOf('fort'), kindOf('fight')]);
});

test('набережная: точки появления и взаимодействия стоят на настиле и не в стене', () => {
  const spots = [lobby.spawn, lobby.gateSpawn, lobby.garageSpawn, lobby.fortSpawn, ...lobby.interact];
  for (const s of spots) {
    // точка катера — над кокпитом: до неё достают и с причала, и из самого катера (test/boat.test.ts); так же и у лодки
    // Семёна у мостков (test/barkas.test.ts)
    if ('kind' in s && (s.kind === 'boat' || (s.kind === 'ferry' && 'arg' in s && s.arg === 0))) continue;
    // касса колеса обозрения — на дощатом помосте (0,15 м)
    const floor = 'kind' in s && s.kind === 'wheel' ? 0.15 : 0;
    assert.ok(Math.abs(lw.groundBelow(s.x, 0.5, s.z) - floor) < 1e-9, `опора под ${s.x},${s.z}`);
    if ('kind' in s && (s.kind === 'seat' || s.kind === 'durak')) continue;
    assert.ok(freeSpot(s.x, s.z, floor), `свободно в ${s.x},${s.z}`);
  }
});

test('набережная: от точки появления до ворот склада — прямая дорога', () => {
  const hit = makeRayHit();
  const { x, z } = lobby.spawn;
  for (const dx of [-PLAYER_HALF, 0, PLAYER_HALF]) {
    assert.ok(!lw.raycast(x + dx, 1, z, 0, 0, -1, z + 14, hit, false), `луч с x=${dx}`);
  }
});

test('набережная: кадки с деревьями твёрдые, на край кадки можно встать, проход вокруг свободен', () => {
  for (const [x, z] of PLANTERS) {
    assert.ok(!freeSpot(x, z), `кадка ${x},${z} не пропускает`);
    assert.equal(lw.groundBelow(x + PLANTER_R - 0.05, 2, z), PLANTER_H, `край кадки ${x},${z} держит`);
    for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) assert.ok(freeSpot(x + dx, z + dz), `проход у кадки ${x},${z}`);
  }
});

test('набережная: без ввода желейка стоит на месте', () => {
  const s = makeState();
  s.x = lobby.spawn.x;
  s.z = lobby.spawn.z;
  const inp = makeInput();
  const ev = makeEvents();
  for (let i = 0; i < 120; i++) {
    inp.seq = i + 1;
    stepPlayer(s, inp, lw, false, 1, ev);
  }
  assert.equal(s.grounded, 1);
  assert.equal(s.x, lobby.spawn.x);
  assert.equal(s.z, lobby.spawn.z);
  assert.ok(Math.abs(s.y) < 1e-9);
});
