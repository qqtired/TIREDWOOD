import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { BossView } from '../client/dungeon/boss.ts';
import type { VBoss } from '../client/dungeon/view.ts';

function fixture(): GLTF {
  const scene = new THREE.Group(), body = new THREE.Bone(), lid = new THREE.Bone();
  body.name = 'body'; lid.name = 'lid'; body.add(lid); scene.add(body);
  const clip = (name:string,position:number[],duration=1.5) => new THREE.AnimationClip(name,duration,[new THREE.VectorKeyframeTrack('lid.position',[0,duration],[...position,...position])]);
  return {scene,animations:[clip('cauldronmaster_idle',[0,2,0]),clip('cauldronmaster_phase_p2',[0,1.5,0]),clip('cauldronmaster_phase_p3',[1,.04,-2]),clip('cauldronmaster_walk_p3',[1,.04,-2]),clip('cauldronmaster_attack_p3',[1,.04,-2],5.2916667),clip('cauldronmaster_death_p3',[1,.04,-2],4)]} as unknown as GLTF;
}
function boss(anim:VBoss['anim'],phase:number):VBoss { return {id:7,family:'cauldronmaster',x:20,z:30,yaw:0,hp:100,hpMax:100,anim,animAt:0,phase,name:'Казанщик',scale:1,rage:false}; }

test('actual phase_p2/phase_p3 clip names and initial idle are mapped by the runtime view',()=>{
  const v=new BossView(fixture(),'cauldronmaster'),lid=v.root.getObjectByName('lid')!;
  v.update(0,boss('appear',1),20,30,.5);assert.equal(lid.position.y,2);
  v.update(0,boss('phase2',2),20,30,.75);assert.equal(lid.position.y,1.5);
  v.update(0,boss('phase3',3),20,30,1.5);assert.ok(Math.abs(lid.getWorldPosition(new THREE.Vector3()).y-.04)<1e-6);
});

test('detached lid stays on the floor through walk/attack/death and wraps with the camera',()=>{
  const v=new BossView(fixture(),'cauldronmaster'),lid=v.root.getObjectByName('lid')!,p=new THREE.Vector3();
  v.update(0,boss('phase3',3),20,30,1.5,20,30);lid.getWorldPosition(p);const ground=p.clone();
  for(const [anim,t]of [['walk',.2],['attack',2],['death',3]] as const){v.update(.03,boss(anim,3),30,40,t,30,40);lid.getWorldPosition(p);assert.ok(p.distanceTo(ground)<1e-6,anim);}
  v.update(.03,boss('walk',3),270,280,.2,250,280);lid.getWorldPosition(p);assert.ok(Math.abs(p.x-(ground.x+240))<1e-6);assert.ok(Math.abs(p.z-(ground.z+240))<1e-6);
  v.update(0,null,0,0,0);v.update(0,boss('idle',1),10,10,0,10,10);lid.getWorldPosition(p);assert.ok(Math.abs(p.x-10)<1e-6);assert.ok(Math.abs(p.y-2)<1e-6);
});
