import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RG_BOW, RG_R } from '../shared/regattaphysics.ts';
import { SPORT_BOAT, hopArc } from '../client/lobby/regattaboat.ts';

test('licensed sport hull parses without image/network dependencies and preserves authored mesh topology', async () => {
  const bytes = readFileSync(new URL('../client/assets/boats/kenney-speed-a.glb', import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  assert.equal(json.images, undefined);
  assert.equal(json.textures, undefined);
  assert.equal(json.asset.extras.topologyAndNormalsPreserved, true);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  let triangles = 0;
  let painted = 0;
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    triangles += (o.geometry.index?.count ?? 0) / 3;
    const p = o.geometry.getAttribute('position');
    const n = o.geometry.getAttribute('normal');
    const c = o.geometry.getAttribute('color');
    const mask = o.geometry.getAttribute('_boat_paint');
    assert.equal(n.count, p.count);
    assert.equal(c.count, p.count);
    assert.equal(mask.count, p.count);
    for (let i = 0; i < p.count; i++) {
      assert.ok(Number.isFinite(n.getX(i) + n.getY(i) + n.getZ(i) + c.getX(i) + c.getY(i) + c.getZ(i)));
      if (mask.getX(i) > 0.5) painted++;
    }
  });
  assert.equal(triangles, 156);
  assert.ok(painted > 0 && painted < 288, 'paint only hull livery, not engine/glass');
});

test('regatta hull matches its collision circles; the hop into the boat lands on the seat', () => {
  // корпус на экране — почти ровно два круга столкновений (нос и корма)
  assert.ok(SPORT_BOAT.beam <= RG_R * 2 + 0.05);
  assert.ok(SPORT_BOAT.length <= (RG_BOW + RG_R) * 2 + 0.4);
  assert.ok(SPORT_BOAT.length / SPORT_BOAT.beam > 2);
  const v = new THREE.Vector3();
  hopArc(16, 0, 18, 52, -0.8, 33, 0, v);
  assert.deepEqual([v.x, v.y, v.z], [16, 0, 18]);
  hopArc(16, 0, 18, 52, -0.8, 33, 1, v);
  assert.deepEqual([v.x, v.y, v.z], [52, -0.8, 33]);
  hopArc(16, 0, 18, 52, -0.8, 33, 0.5, v);
  assert.ok(v.y > 5, 'дуга выше крыш катеров');
});
