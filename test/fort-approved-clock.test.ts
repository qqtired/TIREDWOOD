import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ClockSync } from '../client/net.ts';
import { FortMatch } from '../client/fort/match.ts';
import { EventFx } from '../client/fort/eventfx.ts';
import { WaveEvents, type EventHost } from '../server/fort/events.ts';
import { FORT_MIN_DELAY, FT_WAVE } from '../shared/fort.ts';
import type { ServerMsg } from '../shared/messages.ts';

function fortHarness() {
  const clock=new ClockSync(FORT_MIN_DELAY),fx=new EventFx(new THREE.Scene(),new THREE.PerspectiveCamera()),noop=()=>{};
  const match=Object.assign(Object.create(FortMatch.prototype),{
    clock,ready:false,predictor:{},setRoster:noop,krakenFx:{onEvent:()=>false},
    d:{eventFx:fx,hud:{ui:{onPhase:noop},alert:noop},marks:{meteor:noop},sound:{},zombies:{}}
  });
  return{match,clock,fx};
}
const hello={t:'fort',id:1,tick:100,seed:7,phase:FT_WAVE,phaseEnd:200,wave:30,players:[]} as unknown as ServerMsg;
const from=[0,46,-34] as const,to=[0,4,-14.5] as const;
function meteorServer(tick=100){const server=new WaveEvents({tick} as EventHost);Object.assign(server,{strikes:[{id:1000001,warned:true,at:144,start:0,fromX:0,fromY:46,fromZ:-34,x:0,y:4,z:-14.5,hits:3}]});return server;}

test('fort clock is finite before replay arrives ahead of the first snapshot',()=>{
  const {match,clock,fx}=fortHarness();match.onJson(hello);
  assert.equal(clock.ready,true);
  assert(Number.isFinite(clock.estimate(performance.now())));
  const tick=clock.renderTick;
  match.onJson({t:'fev',k:100,e:[['meteor',1000001,0,...from,...to,0,144,3]]} as unknown as ServerMsg);
  fx.update(0);
  const rocks=(fx as unknown as {rocks:THREE.InstancedMesh}).rocks,m=new THREE.Matrix4();rocks.getMatrixAt(0,m);
  const drawn=new THREE.Vector3().setFromMatrixPosition(m),expected=new THREE.Vector3(...from).lerp(new THREE.Vector3(...to),tick/144);
  assert(drawn.distanceTo(expected)<1e-5,'late replay must start at visible server progress, not at the sky origin');
});

test('invalid greeting cannot seed a non-finite Fortress clock',()=>{
  const {match,clock,fx}=fortHarness();match.onJson({...hello,tick:NaN} as ServerMsg);
  assert.equal(clock.ready,false);assert.equal(match.ready,false);
  fx.siegeMeteor(1000001,0,from,to,NaN,144,88);assert.equal(fx.stats().meteors,0);
});

test('targetable meteor drawing and server ray use one render tick through jitter and long frames',()=>{
  const {match,clock,fx}=fortHarness();match.onJson(hello);
  Object.assign(clock,{delay:12,targetDelay:12,renderTick:88});
  match.onJson({t:'fev',k:100,e:[['meteor',1000001,0,...from,...to,0,144,3]]} as unknown as ServerMsg);
  const server=meteorServer(130),eye=new THREE.Vector3(12.5,6,-14.5),m=new THREE.Matrix4();
  for(const tick of [88,88.8,90.2,102.5,119]){
    clock.renderTick=tick;fx.setRenderTick(tick);fx.update(.5);
    const rocks=(fx as unknown as {rocks:THREE.InstancedMesh}).rocks;rocks.getMatrixAt(0,m);
    const visible=new THREE.Vector3().setFromMatrixPosition(m),expected=new THREE.Vector3(...from).lerp(new THREE.Vector3(...to),tick/144);
    assert(visible.distanceTo(expected)<1e-5,'dt clamping must not advance or lag the meteor independently');
    const dir=visible.clone().sub(eye).normalize();
    const client=fx.meteorRay(eye.x,eye.y,eye.z,dir.x,dir.y,dir.z,200);
    const hit=server.meteorRay(eye.x,eye.y,eye.z,dir.x,dir.y,dir.z,200,tick);
    assert(hit&&client!==null);assert(Math.abs(client-hit.t)<1e-5,'direct shot at rendered sphere must hit the rewound server sphere');
  }
});

import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SiegePhaseClock, siegeElapsed, siegeSnapshotElapsed } from '../client/fort/approved/phase-clock.ts';
import { Zombies3D } from '../client/fort/zombies3d.ts';
import { ApprovedMobRenderer } from '../client/fort/approved/renderer.ts';
import { bakeFortModel } from '../client/fort/approved/bake.ts';
import { Z_BATTERY, Z_CANOPY, Z_CRABCRANE, Z_MILLER, ZS_SIEGE_DEPLOY, ZS_SIEGE_WINDUP, ZS_SIEGE_ACTION } from '../shared/fortsiege.ts';
import { Z_WALKER, ZS_ATTACK } from '../shared/fort.ts';
import { decodeFortTail, encodeFortTail, fortTailSize, makeFortTail, type ZombieSnap } from '../shared/fortnet.ts';

test('phase history survives replay, repeated state, future phase and shortened end',()=>{
  const phases=new SiegePhaseClock();
  phases.remember({id:7,kind:Z_CRABCRANE,state:ZS_SIEGE_DEPLOY,startTick:100,endTick:244});
  phases.remember({id:7,kind:Z_CRABCRANE,state:ZS_SIEGE_WINDUP,startTick:244,endTick:352});
  phases.remember({id:7,kind:Z_CRABCRANE,state:ZS_SIEGE_ACTION,startTick:352,endTick:412});
  phases.remember({id:7,kind:Z_CRABCRANE,state:ZS_SIEGE_DEPLOY,startTick:600,endTick:744});
  assert.equal(siegeElapsed(phases.at(7,ZS_SIEGE_DEPLOY,160)!,160),1);
  assert.equal(siegeElapsed(phases.at(7,ZS_SIEGE_ACTION,382)!,382),.5,'crane impact must remain on its authoritative half second');
  assert.equal(phases.at(7,ZS_SIEGE_DEPLOY,620)!.startTick,600,'repeated state must use its new start');
  phases.remember({id:7,kind:Z_CRABCRANE,state:ZS_SIEGE_DEPLOY,startTick:100,endTick:243});
  assert.equal(phases.at(7,ZS_SIEGE_DEPLOY,160)!.endTick,243,'same phase correction keeps start');
  assert.equal(siegeElapsed(phases.at(7,ZS_SIEGE_DEPLOY,620)!,620),1/3,'older replay cannot restart the present phase');
  phases.remember({id:7,kind:Z_CRABCRANE,state:ZS_SIEGE_ACTION,startTick:NaN,endTick:900});
  assert.equal(phases.at(7,ZS_SIEGE_ACTION,382)!.startTick,352);
  assert.equal(phases.at(7,ZS_SIEGE_ACTION,NaN),null);
});

test('snapshot-before-JSON fallback preserves elapsed deployment and leaves old mobs unchanged',()=>{
  assert.equal(siegeSnapshotElapsed(Z_BATTERY,ZS_SIEGE_DEPLOY,180),3);
  assert.equal(siegeSnapshotElapsed(Z_CRABCRANE,ZS_SIEGE_ACTION,30),.5);
  assert.equal(siegeSnapshotElapsed(Z_MILLER,ZS_SIEGE_ACTION,60),2);
  assert.equal(siegeSnapshotElapsed(Z_WALKER,ZS_ATTACK,0),null);
});

test('delayed first snapshot reaches the real halfway GLB deployment pose rather than frame zero',async()=>{
  const phases=new SiegePhaseClock();phases.remember({id:7,kind:Z_BATTERY,state:ZS_SIEGE_DEPLOY,startTick:100,endTick:460});
  const zombies=Object.assign(Object.create(Zombies3D.prototype),{siegePhases:phases,renderTick:280,tracks:new Map(),warm:0,frame:0,time:900});
  // The first binary snapshot is already 12 ticks ahead of the rendered clock.
  const snapshot:ZombieSnap={id:7,kind:Z_BATTERY,state:ZS_SIEGE_DEPLOY,x:0,y:0,z:-25,yaw:Math.PI,hp:1,atk:0,wind:168};
  const binary=new Uint8Array(fortTailSize([snapshot],1));
  encodeFortTail(binary,0,{gate:1600,crystal:2500,turrets:0,jams:0,left:1},[snapshot],1);
  const decoded:ZombieSnap[]=[];assert.equal(decodeFortTail(binary.buffer,0,makeFortTail(),decoded),1);
  zombies.push(292,decoded,1);const track=zombies.tracks.get(7)!;track.sample(280,track.r);
  assert.equal(track.r.wind,168,'fixture must retain the real first-snapshot lead');
  const anim=zombies.animOf(track,track.r,900);
  assert.equal(anim.stT,3,'arrival at local time 900 must not restart deploy');
  const bytes=readFileSync(new URL('../client/assets/fort/approved/battery-r3-03.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const baked=bakeFortModel(gltf,'battery');
  const slot={id:'battery',baked,mesh:new THREE.InstancedMesh(baked.geo,new THREE.MeshStandardMaterial(),1),n:0,
    anim:new THREE.InstancedBufferAttribute(new Float32Array(4),4),tint:new THREE.InstancedBufferAttribute(new Float32Array(4),4),target:new THREE.InstancedBufferAttribute(new Float32Array(4),4)};
  const runtime=Object.assign(Object.create(ApprovedMobRenderer.prototype),{slots:new Map([[Z_BATTERY,slot]])});
  assert(runtime.add(Z_BATTERY,new THREE.Matrix4(),anim,0,null,0));
  const values=slot.anim.array,root=gltf.scene.getObjectByName('battery')!;
  const animated=new Set(gltf.animations.flatMap(c=>c.tracks.map(t=>THREE.PropertyBinding.parseTrackName(t.name).nodeName)));
  const joints=[root];root.traverse(o=>{if(o!==root&&animated.has(o.name))joints.push(o);});
  const support=gltf.scene.getObjectByName('battery_support1')!,ji=joints.indexOf(support);assert(ji>0);
  const point=new THREE.Vector3(.35,.1,.2),sample=(row:number)=>{
    const o=(row*baked.tex.image.width+ji*3)*4,d=baked.tex.image.data as Float32Array;
    return new THREE.Vector3(d[o]*point.x+d[o+1]*point.y+d[o+2]*point.z+d[o+3],d[o+4]*point.x+d[o+5]*point.y+d[o+6]*point.z+d[o+7],d[o+8]*point.x+d[o+9]*point.y+d[o+10]*point.z+d[o+11]);
  };
  const rendered=sample(values[0]).lerp(sample(values[1]),values[2]);
  const mixer=new THREE.AnimationMixer(gltf.scene),clip=gltf.animations.find(c=>c.name==='battery_deploy')!;
  const action=mixer.clipAction(clip);action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  mixer.setTime(clip.duration*3/6);gltf.scene.updateMatrixWorld(true);
  const expected=point.clone().applyMatrix4(support.matrixWorld);
  assert(rendered.distanceTo(expected)<.001,'real renderer rows agree with the authoritative native clip pose');
  mixer.setTime(0);gltf.scene.updateMatrixWorld(true);
  assert(rendered.distanceTo(point.clone().applyMatrix4(support.matrixWorld))>.05,'regression guard: this is visibly different from replaying frame zero');
  zombies.push(406,[{...snapshot,wind:54}],1);zombies.renderTick=400;track.sample(400,track.r);assert.equal(zombies.animOf(track,track.r,905).stT,5,'skipped snapshots continue the phase rather than local wall time');
});

test('phase replay identifies Miller before its first binary snapshot',()=>{
  const {match,clock}=fortHarness();const phases=new SiegePhaseClock();
  const zombies=Object.assign(Object.create(Zombies3D.prototype),{tracks:new Map(),siegePhases:phases});
  match.d.zombies=zombies;let stripes=0;match.d.marks.stripe=()=>stripes++;
  match.predictor.state={x:10,y:4,z:-14};match.onJson(hello);
  match.onJson({t:'fev',k:100,e:[['siegephase',29,Z_MILLER,ZS_SIEGE_WINDUP,70,178],['warn',29,ZS_SIEGE_WINDUP,10,4,-14,4,178]]} as ServerMsg);
  assert.equal(zombies.kindOf(29),Z_MILLER);assert.equal(stripes,1);
  assert.equal(siegeElapsed(phases.at(29,ZS_SIEGE_WINDUP,clock.renderTick)!,clock.renderTick),(clock.renderTick-70)/60);
});

test('ClockSync jitter changes never create a second meteor clock',()=>{
  const clock=new ClockSync(FORT_MIN_DELAY),fx=new EventFx(new THREE.Scene(),new THREE.PerspectiveCamera());
  clock.addSample(100,0);fx.siegeMeteor(1000001,0,from,to,0,400,clock.renderTick);
  let last=0;const m=new THREE.Matrix4();
  for(let i=1;i<=28;i++){
    const at=Math.max(last+1,i*1000/30+(i%7===0?230:30));
    clock.addSample(100+i*2,at);clock.update(at,at-last);last=at;
    fx.setRenderTick(clock.renderTick);fx.update(.4);
    (fx as unknown as {rocks:THREE.InstancedMesh}).rocks.getMatrixAt(0,m);
    const rendered=new THREE.Vector3().setFromMatrixPosition(m),expected=new THREE.Vector3(...from).lerp(new THREE.Vector3(...to),clock.renderTick/400);
    assert(rendered.distanceTo(expected)<1e-5);
  }
  assert(clock.delay>FORT_MIN_DELAY,'fixture must actually exercise adaptive interpolation delay');
});

test('authoritative untimed siege phase wins even without a nominal fallback',()=>{
  const phases=new SiegePhaseClock();phases.remember({id:9,kind:Z_CANOPY,state:ZS_SIEGE_ACTION,startTick:100,endTick:0});
  const zombies=Object.assign(Object.create(Zombies3D.prototype),{siegePhases:phases,renderTick:220});
  const track={id:9,kind:Z_CANOPY,firstAt:-1,lastSt:-1,stAt:0,lastWind:0,gait:0,path:0,speed:0,back:false,atkT:1,jolt:0,dead:false,anim:{}};
  assert.equal(zombies.animOf(track,{st:ZS_SIEGE_ACTION,wind:0,flags:0,stage:0},900).stT,2);
});
