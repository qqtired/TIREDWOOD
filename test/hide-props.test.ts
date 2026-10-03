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

test('prop paint resolver hits rendered triangles, skips bench gaps, and follows moved instances',()=>{
 const scene=new THREE.Scene(),props=new HideProps(scene);
 const bench={id:11,form:'bench' as const,x:0,y:0,z:0,yaw:0},crate={id:12,form:'crate' as const,x:4,y:0,z:0,yaw:0};
 props.update([bench,crate]);
 const forward=new THREE.Vector3(0,0,-1);
 assert.equal(props.raycastProp(11,new THREE.Vector3(0,.25,5),forward,10),null,'empty volume beneath the bench must not receive floating paint');
 const hit=props.raycastProp(12,new THREE.Vector3(4,.8,5),forward,10);
 assert.ok(hit);assert.ok(hit.point.z>.59&&hit.point.z<.66);assert.ok(hit.normal.z>.99);
 const leg=props.raycastProp(11,new THREE.Vector3(-.95,.3,5),forward,10);assert.ok(leg);assert.ok(leg.size<.12,'paint must fit the thin bench leg');
 assert.equal(props.raycastProp(11,new THREE.Vector3(4,.8,5),forward,10),null,'another instance cannot be mistaken for the requested prop');
 props.update([{...crate,x:14}]);
 assert.ok(props.raycastProp(12,new THREE.Vector3(14,.8,5),forward,10),'moving outside the previous bounding sphere stays raycastable');
 assert.equal(props.raycastProp(11,new THREE.Vector3(0,.5,5),forward,10),null,'removed props cannot receive paint');
 props.clear();assert.equal(props.raycastProp(12,new THREE.Vector3(14,.8,5),forward,10),null);props.dispose();
});
