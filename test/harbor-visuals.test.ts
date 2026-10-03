import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { TokarevLighthouse } from '../client/lobby/tokarev-lighthouse.ts';
import { podiumFishLength } from '../client/lobby/fishpodium.ts';
import { FISH } from '../shared/fishing.ts';
import { FISH_PODIUM_STEPS, FISH_PODIUM_STEP_WIDTH } from '../shared/fishplaces.ts';

test('Tokarev lighthouse retains footprint, height and separate switchable lamp', () => {
  const lighthouse = new TokarevLighthouse();
  const box = new THREE.Box3().setFromObject(lighthouse.group);
  assert.ok(box.min.x >= -1.6 && box.max.x <= 1.6 && box.min.z >= -1.6 && box.max.z <= 1.6);
  assert.ok(box.min.y >= -1e-6 && box.max.y <= 12.05 && box.max.y >= 11.9);
  assert.equal(lighthouse.lampAnchor.position.y, 9.73);
  lighthouse.setLampEnabled(false); assert.equal(lighthouse.lamp.visible, false);
  lighthouse.setLampEnabled(true); assert.equal(lighthouse.lamp.visible, true);
  let meshes = 0, triangles = 0;
  lighthouse.group.traverse((o) => { if (o instanceof THREE.Mesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3; } });
  assert.ok(meshes <= 4 && triangles < 18000, `${meshes} meshes, ${triangles} triangles`);
});

test('podium has five separated steps, strict rank heights, larger same-kind weights stay visibly different', () => {
  assert.deepEqual(FISH_PODIUM_STEPS.map((s) => s.rank), [3, 1, 0, 2, 4]);
  const ranked = [...FISH_PODIUM_STEPS].sort((a,b) => a.rank - b.rank);
  for (let i=1;i<5;i++) assert.ok(ranked[i-1].h > ranked[i].h);
  for (let i=1;i<5;i++) assert.ok(FISH_PODIUM_STEPS[i].x - FISH_PODIUM_STEPS[i-1].x > FISH_PODIUM_STEP_WIDTH);
  const tuna = FISH.findIndex((f) => f.id === 'tuna');
  assert.ok(podiumFishLength(tuna, 100000) > podiumFishLength(tuna,26000) * 1.35);
  for (let sp=0;sp<FISH.length;sp++) {
    for (const g of [1,...FISH[sp].g,1e9]) assert.ok(Number.isFinite(podiumFishLength(sp,g)) && podiumFishLength(sp,g) > .1);
    assert.equal(podiumFishLength(sp,1e9), podiumFishLength(sp,FISH[sp].g[1]), 'invalid weight cannot outgrow the species display envelope');
    assert.ok(podiumFishLength(sp,FISH[sp].g[1]) >= podiumFishLength(sp,FISH[sp].g[0]));
  }
});

import { makeRoofShark } from '../client/lobby/fishboard.ts';
import { FISH_BOARD, FISH_PODIUM_BODY, FISH_PODIUM_STEP_BOXES, FISH_SPOTS } from '../shared/fishplaces.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { CollisionWorld } from '../shared/world.ts';
import { PLAYER_HALF, PLAYER_HEIGHT } from '../shared/constants.ts';

test('roof shark occupies the roof, clears the leaderboard surface, and stays inside its width', () => {
  const model=makeRoofShark();model.position.y=FISH_BOARD.h+1.07;
  const box=new THREE.Box3().setFromObject(model);
  assert.ok(box.min.y>FISH_BOARD.h+.35);
  assert.ok(box.min.x>-FISH_BOARD.w/2 && box.max.x<FISH_BOARD.w/2);
  assert.ok(box.max.y>FISH_BOARD.h+1.5,'high dorsal silhouette');
});

test('new podium does not occupy old objects or bench approaches; lighthouse action and twelve casts remain clear', () => {
  const map=buildLobby();
  const blocks=[FISH_PODIUM_BODY,...FISH_PODIUM_STEP_BOXES];
  for(const a of blocks) for(const [i,b] of map.boxes.entries()) {
    if(map.fishPropsBoxes.includes(i)||b.max[1]<=0)continue;
    assert.ok(a.x1<=b.min[0]||a.x0>=b.max[0]||a.z1<=b.min[2]||a.z0>=b.max[2]||a.y1<=b.min[1],`podium overlaps old object ${i}`);
  }
  const w=new CollisionWorld(map);
  const clear=(x:number,z:number)=>assert.ok(!w.overlaps(x-PLAYER_HALF,.002,z-PLAYER_HALF,x+PLAYER_HALF,PLAYER_HEIGHT,z+PLAYER_HALF),`clear walking capsule ${x},${z}`);
  for(const [x,z] of [[-19,40.8],[-11,15.7],[-11,18.7],[-14.6,18],[-7.6,17.4]])clear(x,z);
  for(const bench of map.benches)for(const dx of [-.5,.5])clear(bench.x+dx,bench.z-1);
  for(const s of FISH_SPOTS) {
    clear(s.x,s.z);
    assert.equal(w.groundBelow(s.x-Math.sin(s.yaw)*6,0,s.z-Math.cos(s.yaw)*6),-Infinity);
  }
  for(let i=0;i<8;i+=2){assert.equal(FISH_SPOTS[i].x+FISH_SPOTS[i+1].x,-38);if(i)assert.equal(FISH_SPOTS[i].z-FISH_SPOTS[i-2].z,3.5);}
});
