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

// The same real elapsed time must land on the accelerated attack pose, not only finish sooner.
test('Казанщик: поза и длительность совпадают с темпом каждой фазы, Повидл сохраняет темп',()=>{
  for(const family of ['cauldronmaster','povidl'] as const) for(const phase of [1,2,3]){
    const scene=new THREE.Group(), marker=new THREE.Group();marker.name='marker';scene.add(marker);
    const prefix=family==='povidl'?'boss':'cauldronmaster';
    const gltf={scene,animations:[new THREE.AnimationClip(prefix+'_attack',1,[new THREE.VectorKeyframeTrack('marker.position',[0,1],[0,0,0,10,0,0])])]} as unknown as GLTF;
    const view=new BossView(gltf,family);view.update(0,{...boss('attack',phase),family},0,0,.2);
    const speed = family === 'cauldronmaster' ? [1.8,2.2,2][phase-1] : 1;
    assert.equal(view.duration('attack',phase),1/speed);
    assert.ok(Math.abs(view.root.getObjectByName('marker')!.position.x-(2*speed))<1e-5);
  }
});

test('walking follows movement speed; transitions, recovery and death follow the action clock',()=>{
  for(const phase of [1,2,3]) for(const anim of ['walk','appear','phase2','phase3','recover','death'] as const){
    if(anim==='phase2'&&phase!==2||anim==='phase3'&&phase!==3) continue;
    const scene=new THREE.Group(), marker=new THREE.Group();marker.name='marker';scene.add(marker);
    const key=anim==='appear'?'idle':anim==='phase2'?'phase_p2':anim==='phase3'?'phase_p3':anim;
    const gltf={scene,animations:[new THREE.AnimationClip('cauldronmaster_'+key,2,[new THREE.VectorKeyframeTrack('marker.position',[0,2],[0,0,0,20,0,0])])]} as unknown as GLTF;
    const view=new BossView(gltf,'cauldronmaster'), state=boss(anim,phase);
    const speed=anim==='walk'?(phase===1?1.8:2):[1.8,2.2,2][phase-1];
    view.update(0,state,0,0,.2);
    assert.equal(view.duration(anim,phase),2/speed);
    const markerView=view.root.getObjectByName('marker')!;
    assert.ok(Math.abs(markerView.position.x-2*speed)<1e-5);
    view.update(.1,state,0,0,.2);
    assert.ok(Math.abs(markerView.position.x-2*speed)<1e-5,'frozen elapsed time holds the pose');
  }
});
