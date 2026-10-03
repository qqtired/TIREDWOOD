import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

test('real Renderer restore callback invalidates static shadows after Three replaces its shadow map',async t=>{
 const canvas=new EventTarget(),order:string[]=[];
 const gpu={shadowMap:{enabled:true,type:0,autoUpdate:false,needsUpdate:false},info:{autoReset:false},getContext:()=>({getExtension:()=>{order.push('extension');return null;}})};
 // Replace only GPU construction: Renderer constructor/listeners/refreshShadows run unchanged.
 // Three registers its synchronous restore listener within WebGLRenderer's constructor.
 Object.defineProperty(globalThis,'__restoreGpuFactory',{configurable:true,value:()=>{canvas.addEventListener('webglcontextrestored',()=>{order.push('three-restore');gpu.shadowMap={...gpu.shadowMap};});return gpu;}});
 const hooks=registerHooks({load(url,context,next){const result=next(url,context);if(new URL(url).pathname.endsWith('/client/render/renderer.ts'))return{...result,source:String(result.source).replace("new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false })","(globalThis as any).__restoreGpuFactory()")};return result;}});
 t.after(()=>{hooks.deregister();Reflect.deleteProperty(globalThis,'__restoreGpuFactory');});
 const {Renderer}=await import(new URL('../client/render/renderer.ts?restore=regression',import.meta.url).href);const renderer=new Renderer(canvas as HTMLCanvasElement);
 for(let i=0;i<2;i++){
  gpu.shadowMap.needsUpdate=false;const old=gpu.shadowMap;order.length=0;canvas.dispatchEvent(new Event('webglcontextlost'));canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.notEqual(gpu.shadowMap,old);assert.equal(gpu.shadowMap.autoUpdate,false);assert.equal(gpu.shadowMap.needsUpdate,true);assert.equal(renderer.gpuMs,null);assert.deepEqual(order,['three-restore','extension']);
 }
 // Verify the exact installed dependency preserves old flags after initGLContext, and skips false/false.
 const three=readFileSync(new URL('../node_modules/three/src/renderers/WebGLRenderer.js',import.meta.url),'utf8');
 const restore=three.slice(three.indexOf('function onContextRestore'),three.indexOf('function onContextCreationError'));
 assert.ok(restore.indexOf('initGLContext();')<restore.indexOf('shadowMap.needsUpdate = shadowMapNeedsUpdate'));
 assert.ok(three.indexOf("canvas.addEventListener( 'webglcontextrestored', onContextRestore")<three.indexOf('this.dispose = function'));
 const shadows=readFileSync(new URL('../node_modules/three/src/renderers/webgl/WebGLShadowMap.js',import.meta.url),'utf8');
 assert.match(shadows,/scope\.autoUpdate === false && scope\.needsUpdate === false/);
});
