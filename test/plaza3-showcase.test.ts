import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { FISH } from '../shared/fishing.ts';
import { podiumFishLength } from '../client/lobby/fishpodium.ts';
import { makeShowcaseTrophy, disposeShowcaseTrophy } from '../client/lobby/plaza3/showcase-trophy.ts';

const spot = (x = 0) => ({ matrix: new THREE.Matrix4().makeTranslation(x, 1.55, -.7), len: 3.3, maxH: 2.45, maxW: 1.55, pose: 'upright' as const, head: 1 });
const catchOf = (id: string, g: number) => ({ pid: 1, nick: 'Очень длинный ник рыбака', sp: FISH.findIndex((f) => f.id === id), g, at: 0 });
function fishBox(t: THREE.Group): THREE.Box3 { t.updateMatrixWorld(true); return new THREE.Box3().setFromObject(t.getObjectByName('showcase-trophy-fish')!); }

test('витрина: одинаковый улов имеет единый масштаб на всех трёх местах', () => {
  const row = catchOf('dogfish', 10_000);
  const trophies = [0, 1.875, -1.875].map((x) => makeShowcaseTrophy(row, spot(x), podiumFishLength));
  const sizes = trophies.map((t) => fishBox(t).getSize(new THREE.Vector3()));
  for (const size of sizes) assert.ok(size.distanceTo(sizes[0]) < 1e-6);
  for (const t of trophies) { assert.ok(Math.abs(fishBox(t).min.y - 1.55) < 1e-6); assert.equal(t.userData.p3keep, true); disposeShowcaseTrophy(t); }
});

test('витрина: трофей крупнее выставочного минимума сохраняет рост от абсолютного веса до cap', () => {
  // Tiny catches intentionally share the exhibition floor. Compare two real large shark weights instead.
  const small = makeShowcaseTrophy(catchOf('hammerhead', 300_000), spot(), podiumFishLength);
  const big = makeShowcaseTrophy(catchOf('hammerhead', 900_000), spot(), podiumFishLength);
  assert.ok(fishBox(big).getSize(new THREE.Vector3()).y > fishBox(small).getSize(new THREE.Vector3()).y + .15);
  disposeShowcaseTrophy(small); disposeShowcaseTrophy(big);
});

test('витрина: скат15кг занимает широкую поверхность и минимум1.2м на каждом ранге', () => {
  for (const x of [0, 1.875, -1.875]) {
    const t = makeShowcaseTrophy(catchOf('ray', 15_000), spot(x), podiumFishLength), size = fishBox(t).getSize(new THREE.Vector3());
    assert.ok(size.y >= 1.2 - 1e-6, `высота ${size.y}`);
    assert.ok(size.x >= .9, `широкая сторона ${size.x}`);
    assert.ok(size.x > size.z * 3, 'поверхность повернулась ребром');
    disposeShowcaseTrophy(t);
  }
});

test('витрина: скат, кальмар и длинный трофей не пересекают соседние стойки или навес', () => {
  for (const [id, g] of [['ray', 15_000], ['kalmar', 3_000_000], ['oarfish', 1_050_000], ['hammerhead', 900_000]] as const) {
    const t = makeShowcaseTrophy(catchOf(id, g), spot(), podiumFishLength);
    const box = fishBox(t), size = box.getSize(new THREE.Vector3());
    assert.ok(size.x <= 1.55 + 1e-6, `${id}: width ${size.x}`);
    assert.ok(size.y <= 2.45 + 1e-6, `${id}: height ${size.y}`);
    assert.ok(Math.abs(box.min.y - 1.55) < 1e-6, `${id}: bottom ${box.min.y}`);
    assert.ok(Math.abs((box.max.x + box.min.x) / 2) < 1e-6, `${id}: not centred`);
    const fish = t.getObjectByName('showcase-trophy-fish')!;
    assert.ok(Math.abs(fish.scale.x - fish.scale.y) < 1e-9 && Math.abs(fish.scale.y - fish.scale.z) < 1e-9);
    const head = new THREE.Vector3(...(id === 'ray' ? [0, 0, 1] as const : [1, 0, 0] as const)).applyQuaternion(fish.quaternion);
    assert.ok(head.y > .999, `${id}: head is not upright`);
    if (id === 'ray') assert.ok(size.x > size.z * 3, 'ray: broad face is edge-on to the viewer');
    let disposed = 0;
    const support = t.getObjectByName('showcase-trophy-support') as THREE.Mesh;
    support.geometry.addEventListener('dispose', () => { disposed++; });
    disposeShowcaseTrophy(t); assert.equal(disposed, 1);
  }
});
