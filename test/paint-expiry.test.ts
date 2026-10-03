import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Effects } from '../client/render/effects.ts';
import { hideWorld } from '../shared/hidephysics.ts';

// Real Three pools and matrices; only the canvas texture drawing surface is stubbed.
const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>Reflect.get(target,key)??(()=>{})});
Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>context})}});
const setup=()=>{const scene=new THREE.Scene(),fx=new Effects(scene,hideWorld());return{scene,fx,mesh:scene.children[0] as THREE.InstancedMesh};};
function size(mesh:THREE.InstancedMesh,index:number):number {const m=new THREE.Matrix4();mesh.getMatrixAt(index,m);return new THREE.Vector3().setFromMatrixScale(m).length();}

test('temporary paint expires separately while existing permanent paint remains unchanged',()=>{
  const {fx,mesh}=setup();fx.splat(0,0,6,0,1,0,.6,0xff6600,-1,2);fx.splat(1,0,6,0,1,0,.6,0xff6600,-1);
  fx.update(1);assert.ok(size(mesh,0)>0);assert.ok(size(mesh,1)>0);
  fx.update(1);assert.equal(size(mesh,0),0);assert.ok(size(mesh,1)>0);
});

test('expired handles cannot erase a recycled pool slot, and clear removes pending balls and all effects',()=>{
  const {fx,mesh,scene}=setup();const old=fx.splat(0,0,6,0,1,0,.6,0xff6600,-1,2);
  for(let i=0;i<720;i++)fx.splat(0,0,6,0,1,0,.6,0xff6600,-1,5);
  assert.equal(mesh.count,720);fx.removeSplat(old);assert.ok(size(mesh,0)>0,'stale token never removes replacement paint');
  fx.shootBall(0,2,6,0,0,6,0xff6600,1,{kind:0,nx:0,ny:1,nz:0,victim:0,head:false});
  fx.burst(0,1,6,0xff6600,4,1,0,1,0,.05);fx.puff(0,1,6,.4,0xffffff,1,1);
  fx.clear();fx.update(1);
  for(const child of scene.children) {if(child instanceof THREE.InstancedMesh)assert.equal(child.count,0);else assert.equal(child.visible,false);}
  assert.equal(mesh.count,0,'a cleared pending ball cannot recreate a splat after exit');
});
