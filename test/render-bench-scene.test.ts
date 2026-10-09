import test from 'node:test';
import assert from 'node:assert/strict';
import { BackSide, BufferGeometry, Mesh, InstancedMesh } from 'three';
import { createSceneData } from '../tools/render-bench/scene-data.ts';
import { createBenchScene } from '../tools/render-bench/scene.ts';
import type { SceneConfig } from '../tools/render-bench/types.ts';

const config = { seed: 20261006, players: 16, rain: false };

test('harbour descriptors are deterministic, and player count preserves the same prefix', () => {
  const data = createSceneData(config);
  assert.deepEqual(data, createSceneData(config));
  assert.notDeepEqual(data, createSceneData({ ...config, seed: 42 }));
  const larger = createSceneData({ ...config, players: 64, rain: true });
  assert.deepEqual(data.buildings, larger.buildings);
  assert.deepEqual(data.trees, larger.trees);
  assert.deepEqual(data.players, larger.players.slice(0, 16));
  assert.equal(data.rain.length, 0);
  assert.equal(larger.rain.length, 1800);
});

function transforms(bench: ReturnType<typeof createBenchScene>) {
  bench.scene.updateMatrixWorld(true);
  const result: unknown[] = [];
  bench.scene.traverse((object) => {
    if (object instanceof Mesh) result.push({
      name: object.name,
      matrix: object.matrixWorld.toArray(),
      positions: Array.from(object.geometry.getAttribute('position').array),
      index: object.geometry.index ? Array.from(object.geometry.index.array) : null,
      instances: object instanceof InstancedMesh ? Array.from(object.instanceMatrix.array) : null,
    });
  });
  return result;
}

test('omitted and explicit complexity 1 preserve frozen baseline descriptors, geometry and signatures', () => {
  for (const [players, rain, signature, meshes, triangles] of [
    [16, false, 'harbour-v2-c8e5ef48', 117, 54552],
    [64, true, 'harbour-v2-a4309ccd', 358, 170280],
  ] as const) {
    const baseline = { seed: 6102026, players, rain };
    const explicit: SceneConfig = { ...baseline, complexity: 1 };
    assert.deepEqual(createSceneData(baseline), createSceneData(explicit));
    const a = createBenchScene(baseline, 'legacy');
    const b = createBenchScene(explicit, 'legacy');
    try {
      assert.equal(a.manifest.signature, signature);
      assert.equal(b.manifest.signature, signature);
      assert.equal(a.manifest.meshes, meshes);
      assert.equal(a.manifest.triangles, triangles);
      assert.deepEqual(transforms(a), transforms(b));
    } finally { a.dispose(); b.dispose(); }
  }
});

// Compare each unique geometry once, retaining typed arrays rather than cloning huge
// water buffers or the same sphere geometry for all 640 characters.
function geometryPairs(a: ReturnType<typeof createBenchScene>, b: ReturnType<typeof createBenchScene>) {
  const objectsA: Mesh[] = [], objectsB: Mesh[] = [];
  a.scene.updateMatrixWorld(true); b.scene.updateMatrixWorld(true);
  a.scene.traverse(object => { if (object instanceof Mesh) objectsA.push(object); });
  b.scene.traverse(object => { if (object instanceof Mesh) objectsB.push(object); });
  assert.equal(objectsA.length, objectsB.length);
  const seen = new Map<BufferGeometry, BufferGeometry>();
  for (let i = 0; i < objectsA.length; i++) {
    const x = objectsA[i], y = objectsB[i];
    assert.equal(x.name, y.name);
    assert.deepEqual(x.matrixWorld.elements, y.matrixWorld.elements);
    if (!seen.has(x.geometry)) {
      seen.set(x.geometry, y.geometry);
      assert.deepEqual(Object.keys(x.geometry.attributes), Object.keys(y.geometry.attributes));
      for (const attribute of Object.keys(x.geometry.attributes)) {
        assert.deepEqual(x.geometry.getAttribute(attribute).array, y.geometry.getAttribute(attribute).array);
      }
      assert.deepEqual(x.geometry.index?.array, y.geometry.index?.array);
    } else assert.equal(seen.get(x.geometry), y.geometry);
    if (x instanceof InstancedMesh && y instanceof InstancedMesh) assert.deepEqual(x.instanceMatrix.array, y.instanceMatrix.array);
  }
}

test('complexity 10 creates genuine tenfold components with deterministic geometry parity', () => {
  for (const players of [160, 640]) {
    const heavy: SceneConfig = { seed: 6102026, players, rain: players === 640, complexity: 10 };
    const data = createSceneData(heavy);
    const base = createSceneData({ seed: heavy.seed, players: 16, rain: true });
    assert.equal(data.buildings.length, 100);
    assert.equal(data.trees.length, 240);
    assert.equal(data.rain.length, heavy.rain ? 18000 : 0);
    assert.deepEqual(data.buildings.slice(0, 10), base.buildings);
    assert.deepEqual(data.trees.slice(0, 24), base.trees);
    assert.deepEqual(data.players.slice(0, 16), base.players);
    assert.equal(new Set(data.buildings.map(b => `${b.x},${b.z}`)).size, 100);
    assert.equal(new Set(data.trees.map(t => `${t.x},${t.z}`)).size, 240);
    const a = createBenchScene(heavy, 'legacy');
    const b = createBenchScene(heavy, 'nodes');
    try {
      a.tick(2); b.tick(2);
      assert.deepEqual(a.manifest, b.manifest);
      assert.equal(a.manifest.complexity, 10);
      assert.equal(a.manifest.buildings, 100);
      assert.equal(a.manifest.trees, 240);
      assert.equal(a.manifest.rainDrops, heavy.rain ? 18000 : 0);
      assert.deepEqual(a.manifest.waterSegments, [960, 80]);
      assert.equal(a.manifest.waterTriangles, 153600);
      assert.equal(a.manifest.characterMeshes, players * 5);
      assert.match(a.manifest.signature, /^harbour-v3-10x-/);
      geometryPairs(a, b);
      assert.deepEqual(a.camera.matrixWorld.elements, b.camera.matrixWorld.elements);
    } finally { a.dispose(); b.dispose(); }
  }
});

test('heavy signatures respond to seed, workload and complexity, and accept 640 players', () => {
  const heavy: SceneConfig = { seed: 6102026, players: 640, rain: true, complexity: 10 };
  const configs = [heavy, { ...heavy, seed: 42 }, { ...heavy, players: 160 }, { ...heavy, complexity: 1 as const }];
  const scenes = configs.map(config => createBenchScene(config, 'legacy'));
  try { assert.equal(new Set(scenes.map(scene => scene.manifest.signature)).size, 4); }
  finally { for (const scene of scenes) scene.dispose(); }
  for (const complexity of [0, 2, 9, 11, NaN, null]) assert.throws(() => createSceneData({ ...heavy, complexity } as unknown as SceneConfig));
});

test('classic and node scenes have identical manifests, geometry, transforms and deterministic motion', () => {
  const a = createBenchScene(config, 'legacy');
  const b = createBenchScene(config, 'nodes');
  const c = createBenchScene(config, 'nodes');
  try {
    assert.deepEqual(a.manifest, b.manifest);
    assert.deepEqual(b.manifest, c.manifest);
    assert.equal(a.scene.background, null);
    for (const bench of [a, b, c]) {
      const dome = bench.scene.getObjectByName('sky-dome') as Mesh;
      const material = Array.isArray(dome.material) ? dome.material[0] : dome.material;
      assert.equal(material.toneMapped, true);
      assert.ok('fog' in material);
      assert.equal(material.fog, false);
      assert.equal(material.depthWrite, false);
      assert.equal(material.side, BackSide);
    }
    for (const time of [0, 2, 17.25, 2]) {
      a.tick(time); b.tick(time); c.tick(time);
      assert.deepEqual(transforms(a), transforms(b));
      assert.deepEqual(transforms(b), transforms(c));
      assert.deepEqual(a.camera.matrixWorld.toArray(), b.camera.matrixWorld.toArray());
      assert.deepEqual(a.scene.getObjectByName('sky-dome')!.position.toArray(), a.camera.position.toArray());
    }
    assert.ok(a.manifest.notes.some(note => note.includes('production')));
  } finally { a.dispose(); b.dispose(); c.dispose(); }
});

test('workload and seed affect signatures, rain adds one instanced draw workload', () => {
  const variants = [config, { ...config, seed: 42 }, { ...config, players: 64 }, { ...config, rain: true }]
    .map(config => createBenchScene(config, 'legacy'));
  try {
    assert.equal(new Set(variants.map(scene => scene.manifest.signature)).size, 4);
    assert.ok(variants[2].manifest.meshes > variants[0].manifest.meshes);
    assert.equal(variants[3].manifest.meshes, variants[0].manifest.meshes + 1);
    assert.equal(variants[3].manifest.instances, variants[0].manifest.instances + 1800);
    assert.equal(variants[3].manifest.triangles, variants[0].manifest.triangles + 3600);
  } finally { for (const scene of variants) scene.dispose(); }
});

test('rainy node/classic variants retain the same instanced geometry and frozen transforms', () => {
  const a = createBenchScene({ ...config, players: 64, rain: true }, 'legacy');
  const b = createBenchScene({ ...config, players: 64, rain: true }, 'nodes');
  try {
    a.tick(2); b.tick(2);
    assert.deepEqual(a.manifest, b.manifest);
    assert.deepEqual(transforms(a), transforms(b));
    const rainA = a.scene.getObjectByName('rain-drops') as InstancedMesh;
    const rainB = b.scene.getObjectByName('rain-drops') as InstancedMesh;
    assert.deepEqual(rainA.geometry.getAttribute('benchRainPhase').array, rainB.geometry.getAttribute('benchRainPhase').array);
    assert.equal(rainA.frustumCulled, false);
    assert.equal(rainA.count, 1800);
  } finally { a.dispose(); b.dispose(); }
});

test('dispose releases each owned geometry/material exactly once, even when called twice', () => {
  const bench = createBenchScene({ ...config, rain: true }, 'nodes');
  const resources = new Set<{ addEventListener(type: 'dispose', listener: () => void): void }>();
  bench.scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
  });
  const counts = new Map<object, number>();
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1));
  bench.dispose(); bench.dispose();
  assert.equal(counts.size, resources.size);
  assert.ok([...counts.values()].every(count => count === 1));
});

test('scene rejects invalid workload and non-finite simulation time', () => {
  for (const players of [-1, 1.5, NaN, 641]) assert.throws(() => createSceneData({ ...config, players }));
  assert.throws(() => createSceneData({ ...config, seed: NaN }));
  const bench = createBenchScene(config, 'legacy');
  try { assert.throws(() => bench.tick(NaN)); } finally { bench.dispose(); }
});
