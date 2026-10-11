import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
process.env.PLAZA3 = '1';
const { buildLobby, LOBBY_SEAT_COUNT } = await import('../shared/maps/lobby.ts');
const { SLOT_POSES } = await import('../shared/slots.ts');
const { ACT_SIT } = await import('../shared/lobby.ts');
const { CollisionWorld } = await import('../shared/world.ts');
const { setupHub, login, placeAt, steps } = await import('./kit.ts');
const { PAVILIONS, PROP_FILES, propOf } = await import('../client/lobby/plaza3/pavdata.ts');

test('новые места24/25 занимают два игрока независимо; занятое не отдаётся третьему', async () => {
  const { hub, clock } = setupHub();
  const map = buildLobby(), world = new CollisionWorld(map);
  assert.equal(LOBBY_SEAT_COUNT, 26);
  const seats = [24, 25].map((arg) => map.interact.find((p) => p.kind === 'seat' && p.arg === arg)!);
  const pav = PAVILIONS.find((p) => p.id === 'sunset')!;
  const bytes = readFileSync(new URL(`../client/assets/plaza3/${pav.file}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.position.set(pav.x, pav.y ?? 0, pav.z); gltf.scene.rotation.y = pav.yaw; gltf.scene.updateMatrixWorld(true);
  // Павильон хранит якорь; игровая сборка берёт настоящую скамью из первой подходящей PROP_FILES библиотеки.
  const scene = new THREE.Scene(); scene.add(gltf.scene);
  let bench: THREE.Object3D | null = null;
  for (const file of PROP_FILES) {
    const b = readFileSync(new URL(`../client/assets/plaza3/${file}`, import.meta.url));
    const kit = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
    kit.scene.updateMatrixWorld(true);
    bench = kit.scene.children.find((o) => o.name === 'bench' || o.userData.name === 'bench') ?? null;
    if (bench) break;
  }
  assert.ok(bench, 'реальная библиотечная скамья присутствует');
  gltf.scene.traverse((anchor) => {
    if (propOf(String(anchor.userData.name ?? anchor.name)) !== 'bench') return;
    bench!.traverse((o) => {
      const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(anchor.matrixWorld);
      scene.add(new THREE.Mesh(geometry, mesh.material));
    });
  });
  scene.updateMatrixWorld(true);
  const players = ['BenchA', 'BenchB', 'BenchC'].map((nick) => login(hub, nick));
  for (let i = 0; i < 2; i++) {
    const seat = seats[i], c = players[i].c;
    assert.equal(world.groundBelow(seat.x, .5, seat.z), 0);
    const ray = new THREE.Raycaster(new THREE.Vector3(seat.x, 1.2, seat.z), new THREE.Vector3(0, -1, 0), 0, 1.2);
    const surface = ray.intersectObject(scene, true)[0];
    assert.ok(surface && Math.abs(seat.y! + .3 - surface.point.y) < .01, 'поза совпадает с реальной геометрией сиденья GLB');
    placeAt(hub, c, seat.x, seat.z); clock.now += 1100;
    hub.onJson(c, { t: 'use', id: seat.id }); steps(hub, 2);
    const p = hub.lobby.playerOf(c)!;
    assert.equal(p.action, ACT_SIT); assert.equal(p.arg, 24 + i);
    assert.equal(p.state.y, seat.y);
  }
  placeAt(hub, players[2].c, seats[0].x, seats[0].z); clock.now += 1100;
  hub.onJson(players[2].c, { t: 'use', id: seats[0].id });
  assert.notEqual(hub.lobby.playerOf(players[2].c)!.action, ACT_SIT);
  assert.equal(hub.lobby.playerOf(players[0].c)!.arg, 24);
  hub.onJson(players[0].c, { t: 'unuse' }); clock.now += 1100;
  hub.onJson(players[2].c, { t: 'use', id: seats[0].id });
  assert.equal(hub.lobby.playerOf(players[2].c)!.action, ACT_SIT, 'освобождённое место доступно');
});

test('автоматы: реальные map корпуса/use и матрица рисунка смотрят на запад, камера смотрит на переднюю панель', () => {
  const map = buildLobby();
  for (const [i, p] of SLOT_POSES.entries()) {
    const use = map.interact.find((it) => it.kind === 'slot' && it.arg === i)!;
    assert.deepEqual(map.machines[i], { x: p.body.x, z: p.body.z });
    assert.deepEqual([use.x, use.z, use.yaw], [p.use.x, p.use.z, p.use.yaw]);
    assert.ok(Math.abs(p.front.x - 60.15) < 1e-9 && Math.abs(p.front.z - p.body.z) < 1e-9);
    assert.ok(Math.abs(Math.sin(p.modelYaw) + 1) < 1e-9, 'геометрический+Z передней панели повернулся на запад');
    assert.ok(p.use.x < p.front.x && Math.abs(p.use.z - p.front.z) < 1e-9);
  }
});
