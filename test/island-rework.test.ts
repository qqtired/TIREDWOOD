// Regressions for the owner's walk across Last Light: physical support follows the visible island.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLobby } from '../shared/maps/lobby.ts';
import { ISLE_CENTER, ISLE_FISH_SPOTS, ISLE_IGNAT_USE, ISLE_SPAWN, ISLE_Y } from '../shared/maps/isle.ts';
import { CollisionWorld } from '../shared/world.ts';
import { PLAYER_HEIGHT } from '../shared/constants.ts';
import { BTN_FORWARD, BTN_JUMP, makeEvents, makeState, statesEqual, stepPlayer, type PlayerState } from '../shared/sim.ts';
import { isleSurfaceHeight } from '../shared/maps/isleterrain.ts';
import type { GameMap } from '../shared/maps/types.ts';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { dressIsleSurfaces } from '../client/lobby/isle/surfaces.ts';

test('верхние холмы острова имеют опору, а не пустую воду под моделью', () => {
  const world = new CollisionWorld(buildLobby());
  for (const [u, v] of [[40, -44], [20, -50], [-45, -30], [-70, -10]]) {
    const h = world.groundBelow(ISLE_CENTER.x + u, ISLE_Y + 40, ISLE_CENTER.z + v);
    assert.ok(h > ISLE_Y + 4, `видимый холм (${u}, ${v}) не имеет опоры: ${h}`);
  }
});

function walk(world: CollisionWorld, p: PlayerState, path: ReadonlyArray<readonly [number, number]>): void {
  const ev = makeEvents(); let seq = 0;
  for (const [u, v] of path) {
    let reached = false;
    for (let i = 0; i < 3600; i++) {
      const dx = ISLE_CENTER.x + u - p.x, dz = ISLE_CENTER.z + v - p.z;
      if (Math.hypot(dx, dz) < 0.18) { reached = true; break; }
      stepPlayer(p, { seq: ++seq, buttons: BTN_FORWARD, yaw: Math.atan2(-dx, -dz), pitch: 0, viewTick: 0 }, world, false, 1, ev);
      assert.ok(p.y >= ISLE_Y + 0.12, `вода на маршруте к ${u},${v}`);
      const h = world.groundBelow(p.x, p.y + 0.01, p.z);
      assert.ok(h === -Infinity || p.y >= h - 0.002, 'игрок не внутри поверхности');
    }
    assert.ok(reached, `не дошёл к ${u},${v}: ${(p.x - ISLE_CENTER.x).toFixed(2)},${(p.y - ISLE_Y).toFixed(2)},${(p.z - ISLE_CENTER.z).toFixed(2)}`);
  }
}

test('реальный путь: высадка, Игнат, вход мола, все восемь мест, маяк, холмы и назад', () => {
  const world = new CollisionWorld(buildLobby()), p = makeState(); Object.assign(p, ISLE_SPAWN, { grounded: 1 });
  walk(world, p, [[57, -12], [56.4, -16.4]]);
  assert.ok(Math.hypot(p.x - ISLE_IGNAT_USE.x, p.z - ISLE_IGNAT_USE.z) < 0.2);
  const beach: Array<[number, number]> = [[57, -12], [54, -8], [48, -2], [47, 20], [47, 35], [53, 35]];
  walk(world, p, beach);
  for (const spot of ISLE_FISH_SPOTS) {
    walk(world, p, [[spot.x - ISLE_CENTER.x, spot.z - ISLE_CENTER.z]]);
    assert.ok(Math.abs(p.y - spot.y) < 0.01, 'рыбак стоит на видимых плитах');
  }
  walk(world, p, ISLE_FISH_SPOTS.slice(0, -1).reverse().map((s) => [s.x - ISLE_CENTER.x, s.z - ISLE_CENTER.z]));
  walk(world, p, beach.slice(1).reverse().concat([[58, -8.8], [58, -10], [57, -12], [56, -21.8]]));
  const stair: Array<[number, number]> = Array.from({ length: 31 }, (_, i) => [56 + 12 * i / 30, -22 - 28 * i / 30]);
  walk(world, p, stair.concat([[68, -52], [70, -56], [70, -58]]));
  assert.ok(Math.abs(p.y - (ISLE_Y + 16)) < 0.01, 'на площадке маяка');
  const hills: Array<[number, number]> = [[70, -56], [68, -52], [65, -51], [64, -56], [62, -59], [58, -60], [52, -60], [52, -57.5], [48.5, -54], [24, -54], [20, -50]];
  walk(world, p, hills);
  assert.ok(p.y > ISLE_Y + 8, 'холмы — настоящая поверхность');
  walk(world, p, hills.slice(1).reverse().concat(stair.slice().reverse(), [[56, -21.8], [57, -12], [58, -10], [62, -8], [70, -8], [80, -8.2], [93, -8.2]]));
  assert.ok(Math.abs(p.y - (ISLE_Y + 0.4)) < 0.01, 'вернулся на понтон к лодке');
});

test('треугольники дают точную высоту на границах клеток, флаг выключает всю опору', () => {
  const map = buildLobby(), w = new CollisionWorld(map);
  assert.equal(w.terrainWalkable(0, 0), true, 'дальняя площадь продолжает использовать прежние боксовые ступени');
  for (const u of [38, 40, 42]) {
    const a = isleSurfaceHeight(u - 1e-5, -44), b = isleSurfaceHeight(u + 1e-5, -44);
    assert.ok(Math.abs(a - b) < 0.001);
  }
  for (const id of map.isleBoxes) w.setEnabled(id, false);
  assert.equal(w.terrainHeight(ISLE_CENTER.x + 40, ISLE_CENTER.z - 44), -Infinity);
  assert.equal(w.terrainBlocks(ISLE_CENTER.x + 40, ISLE_Y, ISLE_CENTER.z - 44, PLAYER_HEIGHT), false);
  for (const id of map.isleBoxes) w.setEnabled(id, true);
  assert.ok(w.terrainHeight(ISLE_CENTER.x + 40, ISLE_CENTER.z - 44) > ISLE_Y + 6);
});

test('вывеска не перекрывает обратный проход с мостика на береговую площадку', () => {
  const world = new CollisionWorld(buildLobby());
  // The crate stack occupies v -7.1…-6.1; keep the player's half-width clear of it.
  for (const v of [-8.6, -8, -7.6]) {
    const p = Object.assign(makeState(), { x: ISLE_CENTER.x + 64, y: ISLE_Y + 1.4, z: ISLE_CENTER.z + v, grounded: 1 });
    walk(world, p, [[60, v], [58, v], [60, v], [64, v]]);
  }
});

test('спокойные повторяемые текстуры и восемь видимых мест не меняют дальний силуэт', async () => {
  const load = async (file: string): Promise<THREE.Group> => {
    const b = fs.readFileSync(new URL(`../client/assets/isle/${file}.glb`, import.meta.url));
    const g = await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', resolve, reject));
    g.scene.updateMatrixWorld(true); return g.scene;
  };
  const terrain = await load('island-terrain'), pier = await load('pier-breakwater');
  const silhouette = terrain.getObjectByName('island_silhouette') as THREE.Mesh;
  const before = Array.from(silhouette.geometry.getAttribute('position').array), originalMat = silhouette.material;
  dressIsleSurfaces(terrain); dressIsleSurfaces(pier);
  assert.equal(terrain.getObjectByName('island_silhouette'), silhouette);
  assert.equal(silhouette.material, originalMat); assert.deepEqual(Array.from(silhouette.geometry.getAttribute('position').array), before);
  const marker = pier.getObjectByName('mole_fishing_stations_v2')!;
  assert.equal(marker.userData.spots, 8);
  const materials = new Set<string>();
  for (const root of [terrain, pier]) root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || !m.material.name.startsWith('isle_')) return;
    materials.add(m.material.name);
    const uv = m.geometry.getAttribute('uv'); assert.equal(uv.count, m.geometry.getAttribute('position').count);
    assert.ok(Array.from(uv.array).every(Number.isFinite));
    assert.ok((m.material as THREE.MeshStandardMaterial).map);
  });
  assert.equal(materials.size, 6, 'пять материалов земли / камня и один общий материал деревянных настилов');
});

test('наклон, обрыв и одинаковый ввод: шаг и прыжок остаются прежними', () => {
  const map: GameMap = { name: 'slope', boxes: [], spawns: [], trampolines: [], pickups: [], deco: [], bounds: { minX: -5, maxX: 12, minZ: -5, maxZ: 5 },
    terrain: { height: (x, z) => x >= 0 && x <= 10 && Math.abs(z) < 2 ? x * 0.25 : -Infinity, walkable: (x) => x < 6 },
  };
  const w = new CollisionWorld(map), a = makeState(), b = makeState(); Object.assign(a, { x: 0.1, y: 0.025, z: 0, grounded: 1 }); Object.assign(b, a);
  const ea = makeEvents(), eb = makeEvents();
  for (let i = 0; i < 180; i++) {
    const input = { seq: i, buttons: BTN_FORWARD, yaw: -Math.PI / 2, pitch: 0, viewTick: 0 };
    stepPlayer(a, input, w, false, 1, ea); stepPlayer(b, input, w, false, 1, eb);
    assert.ok(statesEqual(a, b)); assert.ok(Math.abs(a.y - a.x * 0.25) < 1e-5);
  }
  assert.ok(a.x > 5 && a.x < 6.01, 'гладкий подъём проходит, голый обрыв — нет');
});

test('земля под поднятой лестницей остаётся отдельной опорой без переноса на настил', () => {
  const world = new CollisionWorld(buildLobby()), x = ISLE_CENTER.x + 62, z = ISLE_CENTER.z - 36;
  const ground = world.groundBelow(x, ISLE_Y + 6, z);
  assert.ok(ground > ISLE_Y + 3 && ground < ISLE_Y + 4, `земля под мостом: ${ground - ISLE_Y}`);
  assert.equal(world.overlaps(x - 0.2, ground + 0.01, z - 0.2, x + 0.2, ground + PLAYER_HEIGHT, z + 0.2), false);
});

test('прыжок под лестницей упирается в низ настила и не переносит наверх', () => {
  const world = new CollisionWorld(buildLobby()), p = makeState(), x = ISLE_CENTER.x + 57.2, z = ISLE_CENTER.z - 24.8;
  const ground = world.groundBelow(x, ISLE_Y + 2, z); Object.assign(p, { x, y: ground, z, grounded: 1 });
  const ceiling = world.terrainCeiling(x, z, ground + PLAYER_HEIGHT), ev = makeEvents();
  assert.ok(Number.isFinite(ceiling));
  for (let i = 0; i < 90; i++) {
    stepPlayer(p, { seq: i, buttons: i === 0 ? BTN_JUMP : 0, yaw: 0, pitch: 0, viewTick: 0 }, world, false, 1, ev);
    assert.ok(p.y + PLAYER_HEIGHT <= ceiling + 1e-6);
  }
  assert.ok(Math.abs(p.y - ground) < 1e-6);
});
