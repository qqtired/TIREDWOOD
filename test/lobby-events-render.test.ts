import assert from'node:assert/strict';import{test,type TestContext}from'node:test';import*as THREE from'three';
import{Storm3D}from'../client/lobby/storm.ts';import{Pirates3D}from'../client/lobby/pirates.ts';
import{emptyStorm,STORM_PERIOD}from'../shared/storm.ts';import type{Strike}from'../shared/weather.ts';import{emptyPirates,emptyPirateTail}from'../shared/pirates.ts';
function dom(t:TestContext){const prev=Object.getOwnPropertyDescriptor(globalThis,'document');const el=()=>({style:{},hidden:false,textContent:'',append(){},setAttribute(){},addEventListener(){},remove(){}});Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:el}});t.after(()=>{if(prev)Object.defineProperty(globalThis,'document',prev);else Reflect.deleteProperty(globalThis,'document');});return el() as unknown as HTMLElement;}
test('storm = weather at full force: scheduled strikes, lighthouse door wait/light, rainbow after lighting',t=>{
 const root=dom(t),scene=new THREE.Scene();let force=0,lit=true,rainbow=false;const strikes:Strike[]=[];
 const fx=new Storm3D(scene,root,{climate:f=>force=f,strike:s=>strikes.push(s),rainbow:on=>rainbow=on,lamp:v=>lit=v,sound(){},light(){},self:()=>2});
 const v={...emptyStorm(),id:'x',phase:'storm' as const,start:100,end:10000,waveStart:100};fx.set(v);
 fx.update(100+STORM_PERIOD-30,.016,{x:-19,y:0,z:28},true);assert.equal(force,1);assert.equal(lit,false);assert.equal((fx as any).foam.visible,true);assert.equal(fx.door,null);
 fx.update(100+STORM_PERIOD+1,.016,{x:-19,y:0,z:28},true,true);assert.equal((fx as any).crest.visible,true);assert.equal((fx as any).foam.visible,false);
 // молнии шторма — по общему расписанию (shared/weather.ts), а не своей вспышкой
 for(let k=STORM_PERIOD+30;k<=60*60;k+=30)fx.update(100+k,.5,{x:-19,y:0,z:40.98},true);assert.ok(strikes.length>=3);
 assert.equal(fx.door,'light');assert.equal(fx.canLight,true);assert.match(fx.hint!.text,/зажечь/);assert.equal((fx as any).doorGlow.visible,true);
 // в предупреждение у двери — ждать: свет ещё горит
 fx.set({...v,id:'y',phase:'warn',start:0,end:3600});fx.update(1200,.016,{x:-19,y:0,z:40.98},true);assert.equal(fx.door,'wait');assert.equal(fx.canLight,false);assert.match(fx.hint!.text,/погаснет/);
 assert.ok(force>.15&&force<.85);
 // зажгли: свет вернулся, радуга — когда почти стихло, гаснет к концу; кто не первый — ещё может отметиться
 fx.set({...v,phase:'calm',start:500,end:1220,rankEnd:1100,rainbowEnd:2300,winners:[{pid:1,nick:'P',place:1,tokens:30}]});
 fx.update(510,.016,{x:-19,y:0,z:40.8},true);assert.equal(lit,true);assert.equal(rainbow,false);assert.equal(fx.door,'light');
 fx.update(1000,.016,{x:-19,y:0,z:40.8},true);assert.equal(rainbow,true);
 fx.update(2000,.016,{x:-19,y:0,z:40.8},true);assert.equal(rainbow,false);assert.equal(fx.door,null);
 fx.dispose();assert.equal(scene.children.length,0);assert.equal(force,0);
});
test('pirates render bounded instances/captain hook, hide all raid geometry and mop from ineligible viewers',t=>{const root=dom(t),scene=new THREE.Scene();const fx=new Pirates3D(scene,root,{swing(){},sound(){}});const parent=new THREE.Group();scene.add(parent);fx.attachMop(parent);fx.set({...emptyPirates(),id:'r',phase:'raid',wave:3,end:20000});const tail={...emptyPirateTail(),visible:true,wave:3,chestX:4,chestZ:8,pirates:[{id:1,x:4,z:8,hp:6,captain:true,rage:true,carrying:true,yaw:0}]};fx.setTail(tail,100);fx.update(100,.016,new THREE.PerspectiveCamera(),true);assert.equal(fx.group.visible,true);assert.equal(fx.mop.visible,true);assert.equal((fx as any).captainHook.visible,true);assert.equal((fx as any).bodies.count,1);assert.equal((fx as any).bodies.frustumCulled,false);fx.update(101,.016,new THREE.PerspectiveCamera(),false);assert.equal(fx.group.visible,false);assert.equal(fx.mop.visible,false);fx.dispose();assert.equal(parent.children.length,0);});
