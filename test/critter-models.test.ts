import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RiggedQuadruped} from '../client/lobby/critter-quadruped.ts';
import {CoastalCritter} from '../client/lobby/critter-coastal.ts';
import {CRITTERS} from '../shared/maps/critters.ts';
import {critterPeriod,sampleCritter,sampleReaction} from '../client/lobby/crittersim.ts';

async function asset(kind:'cat'|'dog'){
  const b=readFileSync(new URL(`../client/assets/critters/${kind}.glb`,import.meta.url));
  return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
}
test('licensed pets keep one skin/material, real clips, fixed bone lengths and grounded soles across rest/walk transitions',async()=>{
  for(const kind of ['cat','dog'] as const){
    const gltf=await asset(kind),pet=new RiggedQuadruped(gltf,kind),p=sampleCritter(CRITTERS[kind==='cat'?0:14],0);
    assert.deepEqual(gltf.animations.map(a=>a.name).sort(),['Idle','Walk']);assert.ok(pet.mesh.geometry.attributes.position.count/3<2500);
    assert.equal(Array.isArray(pet.mesh.material),false);
    const bodyVertices=(kind==='cat'?807:602)*3,original=pet.mesh.geometry.attributes.position,closed=pet.mesh.geometry.morphAttributes.position?.[0];
    assert.ok(closed,'real eyelid morph exists');
    for(let i=0;i<bodyVertices;i++)assert.deepEqual([closed.getX(i),closed.getY(i),closed.getZ(i)],pet.mesh.geometry.morphTargetsRelative?[0,0,0]:[original.getX(i),original.getY(i),original.getZ(i)],'eyelid morph leaves every original body vertex untouched');
    const bones=pet.mesh.skeleton.bones,baseLengths=bones.map(b=>b.parent instanceof THREE.Bone?b.position.length():0);
    for(const action of ['walk','sit','sleep','groom','walk'] as const)for(let i=0;i<=12;i++){
      Object.assign(p,{action,restWeight:action==='walk'?0:i/12,speed:action==='walk'?.55:0,distance:i*.055});pet.update(p,i/12*1.6);
      if(action==='sleep'&&i===12)assert.equal(pet.mesh.morphTargetInfluences?.[0],1,'sleep closes the eyes');
      pet.mesh.computeBoundingBox();const box=new THREE.Box3().setFromObject(pet.group),size=box.getSize(new THREE.Vector3());
      assert.ok(box.min.y>-.025&&box.min.y<.005,`${kind} ${action} ground=${box.min.y}`);
      assert.ok(size.x<.85&&size.y<1.2&&size.z<1.7,`${kind} ${action} bounded anatomy ${size.toArray()}`);
      for(let j=0;j<bones.length;j++)if(/^Bone(009|010|012|013|015|016|018|019)$/.test(bones[j].name))assert.ok(Math.abs(bones[j].position.length()-baseLengths[j])<1e-6,'rest poses do not shorten/stretch limbs');
    }
  }
});
test('coastal rigs have proper finite closed wing/shell surfaces and bounded poses without negative scale',()=>{
  for(const kind of ['gull','crab'] as const){
    const model=new CoastalCritter(kind),p=sampleCritter(CRITTERS[kind==='gull'?4:10],0);
    assert.ok(model.mesh.geometry.attributes.position.count/3<9000);
    const normal=model.mesh.geometry.getAttribute('normal');for(let i=0;i<normal.count;i++){const length=Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i));assert.ok(Number.isFinite(length)&&length>.9&&length<1.1);}
    for(let i=0;i<36;i++){
      Object.assign(p,{action:kind==='gull'?'fly':'walk',age:2,remaining:4,restWeight:0,speed:.6,distance:i*.03});model.update(p,i/10);
      model.mesh.computeBoundingBox();const size=new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());assert.ok(size.x<1.5&&size.y<1.3&&size.z<1.2);
      model.group.traverse(o=>{assert.ok(o.scale.x>0&&o.scale.y>0&&o.scale.z>0,'no mirrored negative transforms');});
    }
  }
});
test('shared motion starts/stops smoothly, turns continuously and does not reverse gait during a startle',()=>{
  for(const def of CRITTERS){
    let previous=sampleCritter(def,0);
    for(let tick=1;tick<critterPeriod(def)*60;tick++){
      const p=sampleCritter(def,tick);
      assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z)<.2,'no route teleport');
      const turn=Math.abs(Math.atan2(Math.sin(p.yaw-previous.yaw),Math.cos(p.yaw-previous.yaw)));assert.ok(turn<.2,`${def.id} no heading snap ${turn}`);
      assert.ok(p.distance+1e-7>=previous.distance,'gait distance is monotonic');previous=p;
    }
    const reaction={kind:'startle' as const,since:10,tick:600,duration:def.kind==='gull'?4.8:2.4,cooldown:20};let last=-Infinity;
    for(let i=0;i<=144;i++){const time=10+i/60,p=sampleReaction(def,600+i,time,reaction);assert.ok(p.distance+1e-7>=last,'startle must not run the walk cycle backwards');last=p.distance;}
  }
});
