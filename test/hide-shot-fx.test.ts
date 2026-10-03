import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { HideShots } from '../client/hide/shots.ts';
import type { HideServerMsg,HideShot } from '../shared/hide.ts';
import { hideWorld } from '../shared/hidephysics.ts';

const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>Reflect.get(target,key)??(()=>{})});
Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>context})}});
const shot=(id=1):HideShot=>({id,tick:100,from:[0,1.42,6],to:[0,0,5],normal:[0,1,0],kind:'world',propId:0});
const state=(shots:HideShot[],extra:Partial<HideServerMsg>={}):HideServerMsg=>({round:1,tick:100,phase:'seek',self:{role:'hunter'},props:[],shots,...extra} as HideServerMsg);
function setup() {const scene=new THREE.Scene(),sounds:string[]=[];const fx=new HideShots(scene,hideWorld(),{shot:()=>sounds.push('shot'),splat:()=>sounds.push('splat')},()=>null);return{scene,sounds,fx};}

test('snapshot retransmission plays a shot once, paint lasts five seconds, exit clears queued and live effects',()=>{
  const {fx,sounds,scene}=setup(),m=state([shot()]);fx.onState(m,new THREE.Vector3(0,1.42,6));fx.onState(m,new THREE.Vector3(0,1.42,6));fx.update(.016);
  assert.equal(sounds.filter(s=>s==='shot').length,1);assert.equal(fx.debug().paint,1);assert.ok(scene.children.some(c=>c.visible));
  fx.update(4.5);assert.equal(fx.debug().paint,1);fx.update(.6);assert.equal(fx.debug().paint,0);
  fx.onState(state([shot(2)]),new THREE.Vector3());fx.clear();fx.update(.1);assert.equal(sounds.filter(s=>s==='shot').length,1);assert.equal(fx.debug().pending,0);
  for(const child of scene.children){if(child instanceof THREE.InstancedMesh)assert.equal(child.count,0);else assert.equal(child.visible,false);}
});

test('invalid surface normals, stale events and blind snapshots cannot create paint or reveal a shot',()=>{
  const {fx,sounds}=setup();
  const bad=[{...shot(),normal:[0,0,0]},{...shot(2),normal:[NaN,1,0]},{...shot(3),from:[Infinity,0,0]}] as HideShot[];
  fx.onState(state(bad),new THREE.Vector3());fx.update(.016);assert.equal(sounds.length,0);
  fx.onState(state([shot(4)],{tick:400}),new THREE.Vector3());fx.update(.016);assert.equal(sounds.length,0);
  fx.onState(state([shot(5)],{phase:'hide'}),new THREE.Vector3());fx.update(.016);assert.equal(sounds.length,0);
});

test('paint on an anonymous prop uses its real surface and clears if that prop moves or disappears',()=>{
  const scene=new THREE.Scene(),normal=new THREE.Vector3(0,0,1),point=new THREE.Vector3(0,.7,4.62),prop={id:41,form:'crate' as const,x:0,y:0,z:4,yaw:0};
  let resolved=0;
  const fx=new HideShots(scene,hideWorld(),{shot(){},splat(){}},()=>{resolved++;return {point,normal,size:.08};});
  const s:HideShot={...shot(),kind:'prop',propId:41,to:[0,.7,4.62],normal:[0,0,1]};
  fx.onState(state([s],{props:[prop]}),new THREE.Vector3());fx.update(.016);assert.equal(resolved,1);assert.equal(fx.debug().paint,1);
  const matrix=new THREE.Matrix4();(scene.children[0] as THREE.InstancedMesh).getMatrixAt(0,matrix);const scale=new THREE.Vector3().setFromMatrixScale(matrix);
  assert.ok(Math.abs(scale.x-.08)<1e-6,'paint respects the thin rendered surface, not the gameplay box');
  fx.onState(state([s],{props:[{...prop,x:1}]}),new THREE.Vector3());fx.update(.016);assert.equal(fx.debug().paint,0);
  fx.onState(state([{...s,id:2}],{props:[]}),new THREE.Vector3());fx.update(.016);assert.equal(fx.debug().paint,0,'removed caught prop never leaves paint floating in the air');
});

test('empty-air shots still have a trajectory but no paint; a long session keeps at most sixteen live splats',()=>{
  const {fx,sounds}=setup();const camera=new THREE.Vector3();
  fx.onState(state([{...shot(),kind:'air',normal:[0,0,0]}]),camera);fx.update(.016);
  assert.equal(fx.debug().played,1);assert.equal(fx.debug().paint,0);assert.deepEqual(sounds,['shot']);
  for(let i=2;i<=22;i++){fx.onState(state([shot(i)]),camera);fx.update(.016);}
  assert.equal(fx.debug().paint,16);fx.update(5);assert.equal(fx.debug().paint,0);
  fx.onState(state([shot(23)],{round:2}),camera);fx.update(.016);assert.equal(fx.debug().paint,1);assert.equal(fx.debug().played,1,'new round clears the old feed');
});
