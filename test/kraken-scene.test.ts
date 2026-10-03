import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { BP_RIDE } from '../shared/boat.ts';
import { Kraken } from '../client/lobby/kraken.ts';
import { KRAKEN_CUE, krakenFrame } from '../client/lobby/krakentiming.ts';
const boat={ph:BP_RIDE,at:100,n:1,nick:'Капитан'};

test('kraken scene hides when far or outside window, reuses geometry and disposes ownership',()=>{
  const scene=new THREE.Scene();const kraken=new Kraken(scene);const frame=krakenFrame(boat.at+1800,boat)!;
  kraken.update(boat.at,boat,{x:frame.x,z:frame.z});assert.equal(kraken.debug().visible,false);
  kraken.update(boat.at+1800,boat,{x:1000,z:1000});assert.equal(kraken.debug().visible,false);
  kraken.update(boat.at+1800,boat,{x:frame.x,z:frame.z});assert.equal(kraken.debug().visible,true);
  const geometries=new Set<THREE.BufferGeometry>();scene.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});
  kraken.setQuality('low');for(let t=1750;t<1900;t++)kraken.update(boat.at+t,boat,{x:frame.x,z:frame.z});
  const after=new Set<THREE.BufferGeometry>();scene.traverse(o=>{if(o instanceof THREE.Mesh)after.add(o.geometry);});
  assert.deepEqual(after,geometries);assert.ok(kraken.debug().segments<=64);assert.ok(kraken.debug().particles<=24);
  let disposed=0;for(const g of geometries)g.addEventListener('dispose',()=>disposed++);
  kraken.dispose();assert.equal(scene.children.length,0);assert.equal(disposed,geometries.size);
});
test('kraken emits a single nearby sound; late scene construction stays quiet',()=>{
  const scene=new THREE.Scene();let sounds=0;const kraken=new Kraken(scene,{onScare:()=>sounds++});const frame=krakenFrame(boat.at+1800,boat)!;
  const viewer={x:frame.x,z:frame.z,riding:true};kraken.update(boat.at+KRAKEN_CUE-1,boat,viewer);
  kraken.update(boat.at+KRAKEN_CUE,boat,viewer);kraken.update(boat.at+KRAKEN_CUE+1,boat,viewer);assert.equal(sounds,1);
  kraken.reset();kraken.update(boat.at+KRAKEN_CUE+2,boat,viewer);assert.equal(sounds,1);kraken.dispose();
});
