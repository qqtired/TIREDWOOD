import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { EventFx } from '../client/fort/eventfx.ts';
import { WaveEvents, type EventHost } from '../server/fort/events.ts';
import { planWave, SIEGE_FEATURES } from '../server/fort/director.ts';
import { EV_METEORS } from '../shared/fortwaves.ts';
import type { FortEvent } from '../shared/fort.ts';
import * as S from '../shared/fortsiege.ts';

function fixture(humans=4){
  const events:FortEvent[]=[],hits:number[]=[];
  const host={tick:0,rng:()=>.5,horde:{zombies:[],skyStrike(){}},world:{},targets:()=>[],hitPlayer:(_z:number,p:number)=>hits.push(p),hitGate(){},hitCrystal(){},gateUp:()=>true,event:(e:FortEvent)=>events.push(e),systemChat(){},supplyPicked(){}};
  const wave=new WaveEvents(host as unknown as EventHost);
  wave.start({...planWave(22,humans,11,undefined,SIEGE_FEATURES),event:EV_METEORS},0);
  while(!events.some(e=>e[0]==='meteor')){host.tick++;wave.step();}
  const m=events.find(e=>e[0]==='meteor')!;
  return{host,wave,events,hits,m};
}
test('meteor keeps one shared 32-hit pool and replays its original durability after partial damage',()=>{
  const {wave,events,m,host}=fixture();assert.equal(m[11],32);assert.equal(m[12],32);
  for(let defender=0;defender<4;defender++)for(let shot=0;shot<7;shot++){host.tick++;assert.equal(wave.hitMeteor(m[1]),true);}
  const replay=wave.replay().find(e=>e[0]==='meteor')!;assert.equal(replay[11],4);assert.equal(replay[12],32);
  assert.ok(!events.some(e=>e[0]==='meteor'&&e[2]===2));
  for(let i=0;i<4;i++)wave.hitMeteor(m[1]);
  assert.equal(wave.replay().filter(e=>e[0]==='meteor').length,0);
  assert.equal(events.filter(e=>e[0]==='meteor'&&e[2]===2).length,1);
});
test('late defenders strengthen upcoming meteors without healing or extending an already announced strike',()=>{
  const {host,wave,events,m}=fixture(1);
  for(let i=0;i<3;i++)wave.hitMeteor(m[1]);
  wave.raiseDefenders(4);
  wave.raiseDefenders(2);
  const active=wave.replay().find(e=>e[0]==='meteor')!;
  assert.equal(active[11],5);assert.equal(active[12],8);assert.equal(active[10],m[10]);
  while(!events.some(e=>e[0]==='meteor'&&e[1]!==m[1])){host.tick++;wave.step();}
  const next=events.find(e=>e[0]==='meteor'&&e[1]!==m[1])!;
  assert.equal(next[11],32);assert.equal(next[12],32);
});
test('enlarged shockwave reaches beyond the old radius and still respects the new boundary',()=>{
  const {host,wave,hits,m}=fixture();
  Object.assign(host,{targets:()=>[{id:1,x:m[6]+8,y:m[7],z:m[8],air:false},{id:2,x:m[6]+S.SIEGE_METEOR_RADIUS+.2,y:m[7],z:m[8],air:false}]});
  host.tick=m[10];wave.step();assert.deepEqual(hits,[1]);
});
test('meteor durability bar drains smoothly, late replay shows partial progress, and cancellation clears it',()=>{
  const scene=new THREE.Scene(),fx=new EventFx(scene,new THREE.PerspectiveCamera());
  const from=[0,46,-34],to=[0,4,-14.5],bar=scene.getObjectByName('meteor-durability') as THREE.InstancedMesh;
  const width=()=>{const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();bar.getMatrixAt(1,m);m.decompose(p,q,s);return s.x;};
  fx.siegeMeteor(1,0,from,to,0,360,90,32,32);fx.update(1/60);const full=width();assert.equal(bar.count,2);
  fx.siegeMeteor(1,1,from,to,0,360,91,16,32);fx.update(1/60);assert.ok(width()<full&&width()>full*.5);
  for(let i=0;i<60;i++)fx.update(1/60);assert.ok(Math.abs(width()/full-.5)<.001);
  fx.clear();fx.siegeMeteor(1,0,from,to,0,360,150,8,32);fx.update(0);assert.ok(Math.abs(width()/full-.25)<.001);
  fx.siegeMeteor(1,2,from,to,0,360,151,0,32);fx.update(0);assert.equal(bar.visible,false);assert.equal(bar.count,0);
});
