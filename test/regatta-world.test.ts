import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { regattaCourse } from '../shared/regattacourse.ts';

test('принятые скалы и маячок: реальная геометрия, небольшой бюджет и свободная вода обеих линий', async () => {
  const bytes = readFileSync(new URL('../client/assets/regatta/white-cliffs-v2.glb', import.meta.url));
  const raw = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(raw.asset.extras.source, 'ProductLab regatta-course-v5.3');
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const meshes: THREE.Mesh[] = [];
  let triangles = 0;
  gltf.scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes.push(o);
    triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
    assert.ok(o.geometry.getAttribute('uv'), 'берег имеет координаты текстуры');
  });
  gltf.scene.updateMatrixWorld(true);
  assert.ok(triangles > 10000 && triangles < 30000, `${triangles} треугольников`);
  assert.ok(meshes.length <= 3, `${meshes.length} отрисовок берегов`);
  const c = regattaCourse(), ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 5);
  const clear = (x: number, z: number) => {
    ray.ray.origin.set(x, 3, z);
    assert.equal(ray.intersectObjects(meshes).length, 0, `модель берега закрывает воду в (${x.toFixed(1)}, ${z.toFixed(1)})`);
  };
  // Three lanes: centre, near left bank, near right bank. The bridge is safely overhead.
  for (let i = 0; i < c.track.n; i += 8) {
    for (const side of [-1, 0, 1]) {
      const lat = side * (c.track.hw[i] - 2.4);
      clear(c.track.px[i] - c.track.tz[i] * lat, c.track.pz[i] + c.track.tx[i] * lat);
    }
  }
  for (let i = 1; i < c.inside.length - 1; i += 3) {
    const a = c.inside[i - 1], p = c.inside[i], b = c.inside[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    for (const side of [-1, 0, 1]) clear(p[0] - dz / len * side * 4.5, p[1] + dx / len * side * 4.5);
  }
});

test('катер регаты использует собственный полный корпус с рабочими частями и местом водителя', async () => {
  const bytes = readFileSync(new URL('../client/assets/ownboats/volzhanka.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  for (const node of ['volzhanka_body', 'motor', 'propeller', 'steering_wheel', 'seat_0']) assert.ok(gltf.scene.getObjectByName(node), node);
  gltf.scene.updateMatrixWorld(true);
  const seat = gltf.scene.getObjectByName('seat_0')!.getWorldPosition(new THREE.Vector3());
  assert.ok(seat.x > .3 && seat.x < .5 && seat.y > .4 && seat.y < .6 && seat.z > .4 && seat.z < .6);
});
