import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeBoatCourse } from '../shared/boatracemap.ts';
import { BR_RADIUS } from '../shared/boatrace.ts';
import { SPORT_BOAT } from '../client/boatrace/model.ts';
import { BAY_LANDMARKS,corridorDistance,islandShorePoints,portShorePoints } from '../client/boatrace/scenery.ts';

test('licensed sport hull parses without image/network dependencies and preserves authored mesh topology',async()=>{
 const bytes=readFileSync(new URL('../client/assets/boats/kenney-speed-a.glb',import.meta.url));const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 assert.equal(json.images,undefined);assert.equal(json.textures,undefined);assert.equal(json.asset.extras.topologyAndNormalsPreserved,true);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');let triangles=0,painted=0;
 gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){triangles+=(o.geometry.index?.count??0)/3;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),c=o.geometry.getAttribute('color'),mask=o.geometry.getAttribute('_boat_paint');assert.equal(n.count,p.count);assert.equal(c.count,p.count);assert.equal(mask.count,p.count);for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(n.getX(i)+n.getY(i)+n.getZ(i)+c.getX(i)+c.getY(i)+c.getZ(i)));if(mask.getX(i)>.5)painted++;}}});
 assert.equal(triangles,156);assert.ok(painted>0&&painted<288,'paint only hull livery, not engine/glass');
 assert.ok(SPORT_BOAT.beam<=BR_RADIUS*2);assert.ok(SPORT_BOAT.length/SPORT_BOAT.beam>2);
});
test('rock island, marina and harbor landmarks remain outside the existing navigable water corridor',()=>{
 const course=makeBoatCourse();for(const p of [...islandShorePoints(),...portShorePoints()])assert.ok(corridorDistance(course,p.x,p.z)>17,'shore cannot cover racing water');
 for(const p of BAY_LANDMARKS)assert.ok(corridorDistance(course,p.x,p.z)-p.r>14,`${p.name} does not obstruct existing course`);
});
