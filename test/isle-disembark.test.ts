import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { PLAYER_HALF, PLAYER_HEIGHT } from '../shared/constants.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { ISLE_CENTER, ISLE_Y } from '../shared/maps/isle.ts';
import { BERTHS, ISLE_DOCK, PARK, PARK_COUNT, PARK_DECK_Y, berthLanding } from '../shared/ownboat.ts';
import { BTN_FORWARD, makeEvents, makeState, stepPlayer } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';

test('E с каждого островного берта высаживает на свой понтон, вне реальных табличек и перил GLB', async () => {
  const bytes = fs.readFileSync(new URL('../client/assets/isle/pier-breakwater.glb', import.meta.url));
  const gltf = await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject));
  gltf.scene.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = []; gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const world = new CollisionWorld(buildLobby()), body = new THREE.Box3(), tri = new THREE.Triangle();
  const vertices = [tri.a, tri.b, tri.c];
  for (let i = 0; i < ISLE_DOCK.length; i++) {
    const berth = ISLE_DOCK[i], landing = berthLanding(PARK_COUNT + i);
    assert.equal(landing.x, berth.px); assert.equal(landing.y, berth.py); assert.equal(landing.z, berth.pz);
    assert.equal(landing.yaw, Math.PI / 2, 'после схода смотрит на запад, к мосткам');
    assert.ok(Math.abs(world.groundBelow(landing.x, landing.y + 0.3, landing.z) - landing.y) < 1e-6, `берт ${i + 1}: настоящая опора`);
    const u = landing.x - ISLE_CENTER.x, h = landing.y - ISLE_Y, v = landing.z - ISLE_CENTER.z;
    body.min.set(u - PLAYER_HALF, h + 0.015, v - PLAYER_HALF); body.max.set(u + PLAYER_HALF, h + PLAYER_HEIGHT, v + PLAYER_HALF);
    for (const mesh of meshes) {
      const p = mesh.geometry.getAttribute('position'), idx = mesh.geometry.index;
      for (let n = 0; n < (idx?.count ?? p.count); n += 3) {
        for (let k = 0; k < 3; k++) vertices[k].fromBufferAttribute(p, idx ? idx.getX(n + k) : n + k).applyMatrix4(mesh.matrixWorld);
        assert.equal(body.intersectsTriangle(tri), false, `берт ${i + 1}: тело пересекает ${mesh.name}`);
      }
    }
    const player = makeState(), ev = makeEvents(); Object.assign(player, landing, { grounded: 1 });
    let seq = 0;
    for (const [tu, tv] of [[74, -8.2], [70, -8], [62, -8]]) {
      let reached = false;
      for (let n = 0; n < 1800; n++) {
        const dx = ISLE_CENTER.x + tu - player.x, dz = ISLE_CENTER.z + tv - player.z;
        if (Math.hypot(dx, dz) < 0.25) { reached = true; break; }
        stepPlayer(player, { seq: ++seq, buttons: BTN_FORWARD, yaw: Math.atan2(-dx, -dz), pitch: 0, viewTick: 0 }, world, false, 1, ev);
        assert.ok(player.y > ISLE_Y + 0.12, `берт ${i + 1}: сход ведёт в воду`);
      }
      assert.ok(reached, `берт ${i + 1}: не дошёл до мостков`);
    }
  }
});

test('сход на общей марине сохраняет прежнюю точку и направление', () => {
  for (let b = 0; b < PARK_COUNT; b++) {
    const t = BERTHS[b];
    assert.deepEqual(berthLanding(b), { x: PARK.x + (t.px - PARK.x) * 0.4, y: PARK_DECK_Y, z: t.pz, yaw: 0 });
  }
});
