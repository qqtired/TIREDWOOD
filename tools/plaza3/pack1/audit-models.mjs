import assert from 'node:assert/strict';import fs from 'node:fs';import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {glbJson,pavAnchors,PAVILIONS} from '../../../client/lobby/plaza3/pavdata.ts';
const assets=new URL('../../../client/assets/plaza3/',import.meta.url);
const anchorSets={kursaal:['anchor_jackpot_face'],semyon:['anchor_entry'],mole:['anchor_sign_udalaya','anchor_spot_mole_2'],rotunda:['anchor_jukebox','anchor_entry'],farm_arch:['anchor_farm_gate'],lighthouse_arch:['anchor_walk'],fishshowcase:['anchor_board_records','anchor_records_roof','anchor_fish_1','anchor_fish_2','anchor_fish_3','anchor_tag_1','anchor_tag_2','anchor_tag_3'],cafe:['anchor_seagull','anchor_afisha_face','anchor_barista','anchor_counter'],cardveranda:['anchor_cards_medallion','anchor_table_1','anchor_table_2','anchor_table_3','anchor_entry','anchor_croupier'],sunset:['anchor_seat_24','anchor_seat_25'],honor:['anchor_board_honor'],online:['anchor_board_online']};
const removeSigns=['cafe','cardveranda','rotunda','honor','online','farm_arch'];
for(const id of Object.keys(anchorSets)){
 const p=PAVILIONS.find(p=>p.id===id);assert.ok(p,id);const bytes=fs.readFileSync(new URL(p.file,assets));const j=glbJson(new Uint8Array(bytes));
 assert.equal(j.images?.length??0,0,`${id}: images`);
 const anchors=pavAnchors(j,p);
 for(const name of anchorSets[id])assert.ok(anchors.has(name),`${id}: ${name}`);
 if(removeSigns.includes(id))assert.ok(!anchors.has('anchor_sign_face'),`${id}: old sign`);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const box=new THREE.Box3().setFromObject(gltf.scene);assert.ok(!box.isEmpty());
 if(id==='cardveranda'){assert.ok(Math.abs(box.max.y-3.825)<.001);assert.ok(gltf.scene.getObjectByName('anchor_table_1'));}
 if(id==='cafe')assert.ok(gltf.scene.getObjectByName('live_vane'));
 if(id==='fishshowcase'){
  const fish=[1,2,3].map(i=>anchors.get(`anchor_fish_${i}`));for(const f of fish){assert.equal(f.data.pose,'upright');assert.equal(f.data.max_h,2.45);assert.equal(f.data.max_w,1.55);assert.ok(Math.abs(f.y-1.55)<1e-5);}
  const board=anchors.get('anchor_board_records');assert.equal(board.data.w,6);assert.equal(board.data.h,2.75);
 }
 if(id==='lighthouse_arch'){assert.ok(!anchors.has('anchor_sign_lighthouse'));assert.ok(!anchors.has('anchor_sign_lighthouse_back'));}
 if(id==='sunset'){assert.ok(Math.abs(anchors.get('anchor_seat_24').yaw-3*Math.PI/4)<.001);assert.ok(Math.abs(anchors.get('anchor_seat_25').yaw-3*Math.PI/4)<.001);assert.ok(!anchors.has('anchor_sign_sunset'));}
 if(id==='kursaal'){const f=anchors.get('anchor_jackpot_face');assert.ok(Math.abs(f.x-62)<1e-4&&Math.abs(f.y-3.5)<1e-4&&Math.abs(f.z+3.2)<1e-4);assert.equal(f.data.field_w,6.4);assert.equal(f.data.field_h,1.3);}
 if(id==='online'){const f=anchors.get('anchor_board_online');assert.equal(f.data.field_w,3);assert.equal(f.data.field_h,2.42);}
 console.log(`${id}: anchors/bounds/material data PASS`);
}
