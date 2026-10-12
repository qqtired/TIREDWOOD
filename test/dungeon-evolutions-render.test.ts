import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { EvolutionRenderer, evolutionRole } from '../client/dungeon/evolutions.ts';
import { bakeFortModel } from '../client/fort/approved/bake.ts';
import type { EvolutionModel } from '../client/dungeon/assets.ts';
import { SimRun } from '../client/dungeon/simview.ts';
import type { Billboards } from '../client/dungeon/fx.ts';

const ids: EvolutionModel[] = ['lantern_evo','embers_evo','pickaxe_evo','fireflies_evo','spark_evo','stalactites_evo','charges_evo','beam_evo'];
const load = async (id: string, evolution = true): Promise<GLTF> => {
  const bytes = readFileSync(new URL('../client/assets/dungeon/' + (evolution ? 'evolutions/' : '') + id + '.glb', import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};

test('all eight accepted models preserve every clip and isolate their equipment geometry', async () => {
  for (const id of ids) {
    const gltf = await load(id), selected = evolutionRole(gltf, 'equip'), baked = bakeFortModel(selected, id);
    assert.deepEqual(Object.keys(baked.clips), ['idle','run','attack','flight']);
    assert(baked.triangles > 50 && baked.triangles < 4100);
    const channels = gltf.animations.flatMap(c => c.tracks.map(t => THREE.PropertyBinding.parseTrackName(t.name).nodeName));
    for (const name of channels) assert(selected.scene.getObjectByName(name), 'pruning another role must preserve animation bindings');
    assert([...baked.tex.image.data as Float32Array].every(Number.isFinite));
  }
});

test('beacon clears the actual hat and follows the real beam; equipment attack freezes with world time', async () => {
  const hero = (await load('hero', false)).scene, top = new THREE.Box3().setFromObject(hero).max.y;
  const renderer = new EvolutionRenderer({ beam_evo: await load('beam_evo'), lantern_evo: await load('lantern_evo') }, hero);
  const anchor = hero.getObjectByName('dg-equip-beam_evo')!;
  assert(renderer.beaconHeight - top >= .379);
  assert(anchor.position.y > top + .3);
  const run = new SimRun(34); run.sim.weapons = [{id:'beam',lv:7,evo:1,cd:0,t2:0},{id:'lantern',lv:7,evo:1,cd:0,t2:0}];
  const view = run.view(); view.weapons.find(w => w.id === 'lantern_evo')!.fires = 1;
  renderer.begin(view, 5, 1.7); assert(Math.abs(anchor.rotation.y - 1.7) < 1e-8);
  const lantern = hero.getObjectByName('dg-evolution-lantern_evo-equip') as THREE.InstancedMesh;
  const pose = Array.from(lantern.geometry.getAttribute('aAnim').array);
  renderer.begin(view, 5, 1.7); assert.deepEqual(Array.from(lantern.geometry.getAttribute('aAnim').array), pose);
  renderer.begin(view, 5.12, 1.7); assert.notDeepEqual(Array.from(lantern.geometry.getAttribute('aAnim').array), pose);
});

test('firefly uses a bounded batch, preserves base weapons, and places a small glow on the abdomen', async () => {
  const renderer = new EvolutionRenderer({ fireflies_evo: await load('fireflies_evo') }, new THREE.Group());
  const v = new SimRun(39).view(); renderer.begin(v, 1, 0);
  const halos: number[][] = [], billboards = { add: (...args: number[]) => halos.push(args) } as unknown as Billboards;
  const p = {id:1,kind:'firefly' as const,x:239.9,z:.1,y:.8,yaw:0,evo:false};
  assert.equal(renderer.projectile(p, -.1, .1, billboards), false);
  assert.equal(renderer.projectile({...p,evo:true}, -.1, .1, billboards), true); renderer.end();
  const batch = renderer.root.getObjectByName('dg-evolution-fireflies_evo-projectile') as THREE.InstancedMesh;
  const geometry = batch.geometry, matrix = new THREE.Matrix4(); batch.getMatrixAt(0,matrix);
  assert(Math.abs(matrix.elements[12] + .1) < .00001, 'renderer retains the caller\'s wrapped/interpolated coordinate');
  assert.equal(halos[0][3],.34); assert(Math.abs(halos[0][2]-.027)<.00001);
  for (let n=0;n<60;n++) { renderer.begin(v,2+n/60,0); renderer.projectile({...p,id:n,evo:true},-.1,.1,billboards);renderer.end();assert.equal(batch.geometry,geometry); }
  renderer.begin(v,4,0); renderer.end(); assert.equal(batch.count,0);
});

test('first real projectile animates without fires/FX and flight does not restart after culling', async () => {
  const run = new SimRun(43); run.sim.weapons = [{id:'charges',lv:7,evo:1,cd:0,t2:0}];
  run.sim.props = []; run.sim.wave.stage = 'wave'; run.step();
  const v = run.view();
  assert.equal(v.weapons[0].fires, 0);
  assert(!v.fx.some(f => f.k === 'shot'));
  const p = v.projectiles.find(p => p.kind === 'charge')!; assert(p);
  const hero = new THREE.Group(), renderer = new EvolutionRenderer({ charges_evo: await load('charges_evo') }, hero);
  renderer.begin(v,1,0);
  const equipment = hero.getObjectByName('dg-evolution-charges_evo-equip') as THREE.InstancedMesh;
  const firingPose = Array.from(equipment.geometry.getAttribute('aAnim').array);
  renderer.begin(v,1.12,0); assert.notDeepEqual(Array.from(equipment.geometry.getAttribute('aAnim').array), firingPose);
  const bb = { add: () => {} } as unknown as Billboards;
  renderer.projectile(p, p.x, p.z, bb); renderer.end();
  // The actual projectile still exists, but is outside the camera for this draw.
  renderer.begin(v,1.5,0); renderer.end();
  renderer.begin(v,1.75,0); renderer.projectile(p,p.x,p.z,bb); renderer.end();
  const batch = renderer.root.getObjectByName('dg-evolution-charges_evo-projectile') as THREE.InstancedMesh;
  const pose = batch.geometry.getAttribute('aAnim').array;
  // idle/run have 49 rows each, attack has 25: flight starts at123, age .75s =18frames.
  assert.equal(pose[0], 123 + 18);
});
