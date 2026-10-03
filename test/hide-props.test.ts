import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { HideProps } from '../client/hide/props.ts';
import { HIDE_PROPS } from '../shared/hide.ts';
test('disguises and decoys use four bounded instanced meshes and no avatar/name metadata',()=>{
 const scene=new THREE.Scene(),props=new HideProps(scene);const records=HIDE_PROPS.map((form,id)=>({id:id+1,form,x:id*3,y:0,z:0,yaw:0}));
 props.update(records);assert.equal(scene.children.length,4);assert.ok(scene.children.every(o=>o instanceof THREE.InstancedMesh));
 assert.equal(scene.children.reduce((n,o)=>n+(o as THREE.InstancedMesh).count,0),4);
 const geometry=scene.children.map(o=>(o as THREE.InstancedMesh).geometry);
 for(let i=0;i<100;i++)props.update(records,1,{x:5,y:0,z:6});assert.deepEqual(scene.children.map(o=>(o as THREE.InstancedMesh).geometry),geometry);
 props.clear();assert.equal(scene.children.reduce((n,o)=>n+(o as THREE.InstancedMesh).count,0),0);props.dispose();assert.equal(scene.children.length,0);
});
