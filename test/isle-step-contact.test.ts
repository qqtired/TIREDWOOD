import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLobby } from '../shared/maps/lobby.ts';
import { ISLE_CENTER, ISLE_Y } from '../shared/maps/isle.ts';
import type { GameMap } from '../shared/maps/types.ts';
import { BTN_FORWARD, makeState, makeEvents, stepPlayer } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';

test('малый перепад земли не запирает игрока на настоящей верхней площадке маяка', () => {
  const w = new CollisionWorld(buildLobby());
  for (const offset of [0, 0.5e-7, 2e-7, 0.00005, 0.00007544597, 0.000099, 0.000101, 0.00015]) {
    for (const direction of [-1, 1]) {
      const p = makeState(), ev = makeEvents();
      Object.assign(p, { x: ISLE_CENTER.x + 70, z: ISLE_CENTER.z - (direction < 0 ? 56.09133986257 : 58), y: ISLE_Y + 16 - offset, grounded: 1 });
      const start = p.z;
      for (let i = 0; i < 40; i++) stepPlayer(p, { seq: i, buttons: BTN_FORWARD, yaw: direction < 0 ? 0 : Math.PI, pitch: 0, viewTick: 0 }, w, false, 1, ev);
      assert.ok((p.z - start) * direction > 1, `offset ${offset}, direction ${direction}: заблокирован ${p.z - start}`);
      assert.ok(Math.abs(p.y - w.terrainHeight(p.x, p.z)) < 0.01, 'опора остаётся реальной поверхностью');
    }
  }
});

test('прежний порог подъёма на обычные боксы сохраняется', () => {
  const map: GameMap = { name: 'box-contact', boxes: [{ min: [-2, -1, -2], max: [2, 0, 2], mat: 'concrete', color: 0x888888 }, { min: [0.5, -1, -2], max: [2, 0.000075, 2], mat: 'concrete', color: 0x888888 }], spawns: [], trampolines: [], pickups: [], deco: [], bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 } };
  const w = new CollisionWorld(map), p = makeState(), ev = makeEvents(); Object.assign(p, { y: 0, grounded: 1 });
  for (let i = 0; i < 40; i++) stepPlayer(p, { seq: i, buttons: BTN_FORWARD, yaw: -Math.PI / 2, pitch: 0, viewTick: 0 }, w, false, 1, ev);
  assert.ok(p.x <= 0.080001, 'старый box deadband / front face не изменён'); assert.equal(p.y, 0);
});
