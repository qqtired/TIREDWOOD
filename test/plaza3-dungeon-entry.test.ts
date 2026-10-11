// The pale shards in the cave were boulders crossing its dark lining, not transparent faces.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const base = new URL('../client/assets/', import.meta.url);
const original = readFileSync(new URL('dungeon/plaza/plaza_entrance.glb', base));
const revised = readFileSync(new URL('plaza3/plaza_entrance_v2.glb', base));
const json = (b: Buffer) => JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
const parse = async (b: Buffer) => new GLTFLoader().parseAsync(Uint8Array.from(b).buffer, '');

const c = Math.cos(0.803), s = Math.sin(0.803);
const local = (x: number, y: number, z: number) => new THREE.Vector3((x + 20.25) * c - (z + 34.8) * s, y, (x + 20.25) * s + (z + 34.8) * c);

test('plaza3: three pale shards are removed at the actual viewing rays, dark tunnel still closes each ray', async () => {
  const origin = local(-11.9, 1.8, -24.5);
  // Raycast points measured on the visible shards in the desktop screenshot.
  const targets = [
    local(-20.199428694258373, 0.5905123920666981, -36.111111653305784),
    local(-21.443051655263154, 0.5109289142831115, -34.66032426800852),
    local(-18.01439097319813, 0.7081730784498081, -34.38599403015901),
  ];
  for (const [buffer, expected] of [[original, /^plaza_stone/], [revised, /^(void|stone_dark)$/]] as const) {
    const gltf = await parse(buffer);
    const rock = gltf.scene.getObjectByName('plaza_cave_entrance')!;
    rock.position.set(0, 0, 0);
    gltf.scene.updateMatrixWorld(true);
    // Matches Venue.detail's material; the fix must work without a DoubleSide shader.
    rock.traverse((o) => { if (o instanceof THREE.Mesh) (o.material as THREE.Material).side = THREE.FrontSide; });
    for (const target of targets) {
      const first = new THREE.Raycaster(origin, target.clone().sub(origin).normalize()).intersectObject(rock, true)[0];
      assert.ok(first, 'tunnel lining must close the opening');
      assert.match(((first.object as THREE.Mesh).material as THREE.Material).name, expected);
    }
  }
});

test('plaza3 entrance v2 preserves nodes, eye animation and all materials', () => {
  const a = json(original), b = json(revised);
  for (const key of ['nodes', 'animations', 'materials', 'scenes']) assert.deepEqual(b[key], a[key], key);
  assert.equal(b.meshes.length, a.meshes.length);
  assert.equal(b.meshes[2].primitives.length, a.meshes[2].primitives.length);
  assert.equal(b.images?.length ?? 0, 0);
  for (let i = 0; i < a.meshes[2].primitives.length; i++) {
    const p = a.meshes[2].primitives[i];
    if (!/^plaza_stone/.test(a.materials[p.material].name)) assert.deepEqual(b.meshes[2].primitives[i], p);
  }
});

test('plaza3 cliff v2 changes only records-board anchor and its three collider helpers', () => {
  const a = readFileSync(new URL('plaza3/pav_dungeon_cliff.glb', base));
  const b = readFileSync(new URL('plaza3/pav_dungeon_cliff_v2.glb', base));
  const ja = json(a), jb = json(b);
  const bin = (buf: Buffer) => buf.subarray(28 + buf.readUInt32LE(12));
  assert.deepEqual(bin(b), bin(a), 'visible cliff geometry remains v1');
  assert.deepEqual(jb.meshes, ja.meshes);
  const anchor = jb.nodes.find((n: { name: string }) => n.name === 'anchor_records_board');
  assert.ok(Math.abs(-18 - anchor.translation[0] - -19.143213945619962) < 1e-6);
  assert.ok(Math.abs(-41 - anchor.translation[2] - -28.171649931556882) < 1e-6);
  for (let i = 0; i < ja.nodes.length; i++) {
    if (!/^(anchor_records_board|col_board_[012])$/.test(ja.nodes[i].name)) assert.deepEqual(jb.nodes[i], ja.nodes[i]);
  }
});
