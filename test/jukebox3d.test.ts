// Модель музыкального автомата (client/lobby/jukebox3d.ts): всё твёрдое — внутри коробки-коллайдера из shared/jukebox.ts
// (наружу выходят только ноты, ореол и пятно на плитке), и анимация не ломает это ни в игре, ни в тишине.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Jukebox3D, jukeModels } from '../client/lobby/jukebox3d.ts';
import { JUKEBOX, JUKEBOX_BARKAS, JUKE_D, JUKE_H, JUKE_SPOTS, JUKE_W } from '../shared/jukebox.ts';

const EPS = 1e-3;

function solidBounds(juke: Jukebox3D): THREE.Box3 {
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  juke.group.updateMatrixWorld(true);
  juke.group.traverse((o) => {
    if (o.userData.fx || !(o as THREE.Mesh).isMesh) return;
    const pos = (o as THREE.Mesh).geometry.getAttribute('position');
    const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh) : null;
    for (let k = 0; k < (inst ? inst.count : 1); k++) {
      if (inst) inst.getMatrixAt(k, m).premultiply(o.matrixWorld);
      else m.copy(o.matrixWorld);
      for (let i = 0; i < pos.count; i++) b.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
    }
  });
  return b;
}

test('автомат: твёрдое — внутри коллайдера JUKE_W × JUKE_D × JUKE_H и в играющем, и в тихом состоянии', () => {
  const scene = new THREE.Scene();
  const juke = new Jukebox3D(scene);
  assert.equal(juke.group.parent, scene);
  const bands = new Float32Array(7).fill(0.8);
  for (let i = 0; i < 240; i++) juke.update(1 / 60, i < 180, bands, (i / 32) % 1);
  const b = solidBounds(juke);
  assert.ok(b.min.x >= JUKEBOX.x - JUKE_W / 2 - EPS && b.max.x <= JUKEBOX.x + JUKE_W / 2 + EPS, `по X: ${b.min.x}..${b.max.x}`);
  assert.ok(b.min.z >= JUKEBOX.z - JUKE_D / 2 - EPS && b.max.z <= JUKEBOX.z + JUKE_D / 2 + EPS, `по Z: ${b.min.z}..${b.max.z}`);
  assert.ok(b.min.y >= -EPS && b.max.y <= JUKE_H + EPS, `по высоте: ${b.min.y}..${b.max.y}`);
  // и не мельче: автомат занимает свою коробку почти целиком
  assert.ok(b.max.y > JUKE_H - 0.05 && b.max.x - b.min.x > JUKE_W - 0.05, 'силуэт заполняет габарит');
});

test('автомат: setVisible прячет и показывает целиком; update на спрятанном не падает', () => {
  const juke = new Jukebox3D(new THREE.Scene());
  juke.setVisible(false);
  assert.equal(juke.group.visible, false);
  juke.update(0.016, true, new Float32Array(7), 0.5);
  juke.setVisible(true);
  assert.equal(juke.group.visible, true);
  juke.update(0.016, true, new Float32Array(3), 0.1);
});

test('автомат на баке баркаса: та же модель — в своём коллайдере на палубе бака, лицом на север, без теней', () => {
  const scene = new THREE.Scene();
  const models = jukeModels(scene);
  assert.equal(models.length, JUKE_SPOTS.length);
  const juke = models[1];
  const bands = new Float32Array(7).fill(0.7);
  for (let i = 0; i < 120; i++) juke.update(1 / 60, true, bands, (i / 30) % 1);
  const b = solidBounds(juke);
  const J = JUKEBOX_BARKAS;
  assert.ok(b.min.x >= J.x - JUKE_W / 2 - EPS && b.max.x <= J.x + JUKE_W / 2 + EPS, `по X: ${b.min.x}..${b.max.x}`);
  assert.ok(b.min.z >= J.z - JUKE_D / 2 - EPS && b.max.z <= J.z + JUKE_D / 2 + EPS, `по Z: ${b.min.z}..${b.max.z}`);
  assert.ok(b.min.y >= J.y - EPS && b.max.y <= J.y + JUKE_H + EPS, `по высоте: ${b.min.y}..${b.max.y}`);
  // лицо (решётка динамика — на +Z модели) смотрит на север (−Z): перед корпусом — со стороны места заказа
  const face = new THREE.Vector3(0, 0, 1).applyQuaternion(juke.group.quaternion);
  assert.ok(face.z < -0.99, `лицом на север: ${face.toArray()}`);
  let casts = 0;
  juke.group.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.castShadow) casts++; });
  assert.equal(casts, 0, 'на баркасе — без теней (вне карты теней)');
  let plaza = 0;
  models[0].group.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.castShadow) plaza++; });
  assert.ok(plaza > 0, 'на площади — с тенью');
  assert.ok(Math.abs(models[0].group.position.x - JUKEBOX.x) < 1e-9);
});
