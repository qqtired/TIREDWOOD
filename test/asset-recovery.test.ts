import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
async function glb(name:string){const b=readFileSync(new URL(`../client/assets/${name}.glb`,import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
function canvasDom(t:TestContext){
 const old=Object.getOwnPropertyDescriptor(globalThis,'document');
 const gradient={addColorStop(){}};
 const ctx=new Proxy({measureText:(s:string)=>({width:s.length*10}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,getImageData:(_x:number,_y:number,w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>Reflect.get(o,k)??(()=>{})});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:1,height:1,getContext:()=>ctx})}});
 t.after(()=>{if(old)Object.defineProperty(globalThis,'document',old);else Reflect.deleteProperty(globalThis,'document');});
}
test('quadruped current callers share a bounded retry; successful source is reused for independent skins',async t=>{
 const source=await glb('critters/cat');let calls=0;
 t.mock.method(GLTFLoader.prototype,'loadAsync',async()=>{if(++calls===1)throw Error('temporary');return source;});t.mock.timers.enable({apis:['setTimeout']});
 const {makeQuadruped}=await import(new URL('../client/lobby/critter-quadruped.ts?recovery=current',import.meta.url).href);
 const pending=Promise.allSettled([makeQuadruped('cat',0),makeQuadruped('cat',1)]);await flush();t.mock.timers.tick(500);await flush();
 const results=await pending;assert.equal(calls,2);assert.ok(results.every(r=>r.status==='fulfilled'));
 const a=(results[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof makeQuadruped>>>).value,b=(results[1] as typeof results[0] & {value:typeof a}).value;
 assert.notEqual(a.mesh,b.mesh);assert.notEqual(a.mesh.geometry,b.mesh.geometry);await makeQuadruped('cat',2);assert.equal(calls,2);
});
test('final GLB rejection is evicted so a later view retries without page reload',async t=>{
 const source=await glb('critters/dog');let calls=0;
 t.mock.method(GLTFLoader.prototype,'loadAsync',async()=>{if(++calls<=2)throw Error('offline');return source;});t.mock.timers.enable({apis:['setTimeout']});
 const {makeQuadruped}=await import(new URL('../client/lobby/critter-quadruped.ts?recovery=later',import.meta.url).href);
 const pending=Promise.allSettled([makeQuadruped('dog'),makeQuadruped('dog')]);await flush();t.mock.timers.tick(500);await flush();
 assert.ok((await pending).every(r=>r.status==='rejected'));assert.equal(calls,2,'retry must be finite');
 const recovered=await makeQuadruped('dog');assert.ok(recovered.mesh);assert.equal(calls,3);
});
test('existing BoatModel recovers its hull after first failure; concurrent models share one source',async t=>{
 canvasDom(t);const source=await glb('boats/kenney-speed-a');let calls=0;
 t.mock.method(GLTFLoader.prototype,'loadAsync',async()=>{if(++calls===1)throw Error('temporary');return source;});t.mock.timers.enable({apis:['setTimeout']});
 const {BoatModel}=await import(new URL('../client/boatrace/model.ts?recovery=current',import.meta.url).href);const scene=new THREE.Scene();
 const a=new BoatModel(scene,1,DEFAULT_OUTFIT,'Tester7'),b=new BoatModel(scene,2,DEFAULT_OUTFIT,'Tester8');t.after(()=>{a.dispose(scene);b.dispose(scene);});
 await flush();t.mock.timers.tick(500);await Promise.all([a.ready,b.ready]);assert.equal(calls,2);assert.equal(a.debug().assetLoaded,true);assert.equal(b.debug().assetLoaded,true);
 assert.notEqual(a.root.getObjectByName('kenney-authored-hull'),b.root.getObjectByName('kenney-authored-hull'));
});
test('boat cache evicts final failure, and disposal before recovery cannot attach a late hull',async t=>{
 canvasDom(t);const source=await glb('boats/kenney-speed-a');let calls=0;
 t.mock.method(GLTFLoader.prototype,'loadAsync',async()=>{if(++calls<=2)throw Error('offline');return source;});t.mock.timers.enable({apis:['setTimeout']});
 const {BoatModel}=await import(new URL('../client/boatrace/model.ts?recovery=later',import.meta.url).href);const scene=new THREE.Scene();
 const a=new BoatModel(scene,1,DEFAULT_OUTFIT,'Tester7');a.dispose(scene);await flush();t.mock.timers.tick(500);await a.ready;assert.equal(calls,2);assert.equal(a.debug().assetLoaded,false);
 const b=new BoatModel(scene,2,DEFAULT_OUTFIT,'Tester8');t.after(()=>b.dispose(scene));await b.ready;assert.equal(calls,3);assert.equal(b.debug().assetLoaded,true);assert.equal(a.root.getObjectByName('kenney-authored-hull'),undefined);
});

test('successful late boat source loads for live peer but never attaches to disposed model',async t=>{
 canvasDom(t);const source=await glb('boats/kenney-speed-a');let resolve!:(g:typeof source)=>void,calls=0;const gate=new Promise<typeof source>(r=>resolve=r);
 t.mock.method(GLTFLoader.prototype,'loadAsync',()=>{calls++;return gate;});
 const {BoatModel}=await import(new URL('../client/boatrace/model.ts?recovery=dispose',import.meta.url).href);const scene=new THREE.Scene();
 const a=new BoatModel(scene,1,DEFAULT_OUTFIT,'Tester7'),b=new BoatModel(scene,2,DEFAULT_OUTFIT,'Tester8');a.dispose(scene);t.after(()=>b.dispose(scene));
 resolve(source);await Promise.all([a.ready,b.ready]);assert.equal(calls,1);assert.equal(a.debug().assetLoaded,false);assert.equal(a.root.getObjectByName('kenney-authored-hull'),undefined);assert.equal(b.debug().assetLoaded,true);
});
