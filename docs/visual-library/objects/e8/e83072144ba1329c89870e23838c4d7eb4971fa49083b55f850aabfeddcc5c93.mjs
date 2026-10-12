import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import * as THREE from '../../../../game-opus/node_modules/three/build/three.module.js';
import {buildMasonry} from '../../../../game-opus/client/fort/castle/masonry.ts';
import {buildTowers} from '../../../../game-opus/client/fort/castle/towers.ts';
import {buildYard} from '../../../../game-opus/client/fort/castle/yard.ts';
import {addBox,buildGeo,parts} from '../../../../game-opus/client/render/kit.ts';
import {buildFort} from '../../../../game-opus/shared/fortmap.ts';
import {buildPreview,MOB_STRIDE} from '../../../../game-opus/client/fort/mobs/kit.ts';
import {SEA_BOAT} from '../../../../game-opus/client/fort/mobs/sea-boat.ts';
import {BRUTE_TROLL} from '../../../../game-opus/client/fort/mobs/brute-troll.ts';
import {WALKER_MUSHROOM} from '../../../../game-opus/client/fort/mobs/walker-mushroom.ts';
import * as F from '../../../../game-opus/shared/fort.ts';
import {SCENARIOS,ScenarioRun} from './scenarios.mjs';import {eventCamera} from './event-camera.mjs';

// Exact solid builder geometry used by CastleDecor, with no Canvas/WebGL/browser.
const solid=[],mat=new THREE.MeshBasicMaterial(),masonry=buildMasonry(buildFort()),towers=buildTowers(),yard=buildYard({addStatic(){}});
for(const [owner,buckets]of[['masonry',masonry],['towers',towers],['yard',yard]])for(const [name,bucket]of Object.entries(buckets))if(bucket.build&&name!=='ivy'){
 const mesh=new THREE.Mesh(bucket.build(),mat);mesh.name=owner+'.'+name;mesh.updateMatrixWorld(true);solid.push(mesh);
}
const crates=parts();for(const box of masonry.crates)addBox(crates,box,'wood',()=>.5);yard.crates.forEach(([x0,y0,z0,x1,y1,z1],i)=>addBox(crates,{min:[x0,y0,z0],max:[x1,y1,z1],color:0xb88a55,variant:i+5},'wood',()=>.4));const crateMesh=new THREE.Mesh(buildGeo(crates),mat);crateMesh.name='castle.crates';crateMesh.updateMatrixWorld(true);solid.push(crateMesh);
const ray=new THREE.Raycaster(),boat=buildPreview(SEA_BOAT),brute=buildPreview(BRUTE_TROLL),walker=buildPreview(WALKER_MUSHROOM),clamp=x=>Math.max(0,Math.min(1,x));
const box=(name,min,max)=>({name,min,max}),point=(name,xyz)=>({name,xyz});
function contents(state,n,view){const points=[],boxes=[];
 if(state.id==='stores'){
  points.push(point('склад: передние ящики',[-14.45,.72,-10.7]));boxes.push(box('склад и тление',[-15,0,-13],[-13.55,1.8,-10.25]));
  if(state.savedCrates){points.push(point('спасённые ящики',[-7,.3,-10]));boxes.push(box('спасённые ящики',[-8,.0,-10.4],[-6,.6,-9.6]));}
  if(state.burnedCrates)points.push(point('обгоревшие запасы',[-14,.4,-10.6]));
  if(state.operator){const o=state.operator;points.push(point('работник и перенос', [o.x,.8,o.z]));boxes.push(box('работник и перенос',[o.x-.55,0,o.z-.55],[o.x+.55,1.6,o.z+.55]));}
 }else if(state.id==='forge'){
  if(view.key==='forge/main'){
   points.push(point('лицо горна',[14.02,.7,-11.4]),point('наковальня',[13.35,.8,-10.05]),point('заказ',[12.8,1.15,-10.1]));boxes.push(box('горн и наковальня',[12.95,0,-12.55],[15,4.55,-9.35]));
   if(state.operator)points.push(point('кузнец',[12.4,.8,-10.1]));
   if(state.forgeItem)boxes.push(box('готовая партия',[12.05,.8,-10.5],[13.55,1.6,-9.7]));
  }else{
   // The gate's actual plane is -15.95; the old -18 probe was in the throat.
   points.push(point('створки',[0,1.8,-15.95]));boxes.push(box('воротный проём',[-2.5,0,-16],[2.5,3.0,-15.5]));
   if(state.braceActive)points.push(point('распорка',[0,1.3,-16.7]));
   if(state.repairKitUsed){points.push(point('ремонтный комплект',[1,3.9,-15.2]));boxes.push(box('ремонтный комплект',[.7,3.7,-15.4],[1.3,4.1,-15]));}
   for(const u of state.units){if(u.die>=.99)continue;const mob=u.kind==='brute'?brute:walker;mob.group.position.set(u.x,u.y,u.z);mob.group.rotation.y=u.yaw;mob.update({t:state.t,gait:((Math.abs(u.z)+Math.abs(u.x))/MOB_STRIDE)%1,speed:u.speed,st:F.ZS_WALK,stT:state.t,hit:0,die:u.die,seed:u.id*.13,rage:false});mob.group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(mob.group);boxes.push(box('нападающий '+u.id,bounds.min.toArray(),bounds.max.toArray()));points.push(point('нападающий '+u.id,[u.x,u.y+(u.kind==='brute'?1.5:.85),u.z]));}
  }
 }else{
  const die=state.boatSunk?clamp((state.t-state.choiceAt-2)/4):0,fall=state.boatSunk?-.8*clamp((state.t-state.choiceAt-2)/3):0;
  boat.group.position.set(-12,fall,state.boatZ);boat.update({t:state.t,gait:state.t*.4,speed:state.boatSunk?0:3,st:F.ZS_WALK,stT:state.t,hit:0,die,seed:.4,rage:false,stage:Math.max(0,(n===1?3:n===2?4:6)-(n===1?2:n===2?3:4))});boat.group.updateMatrixWorld(true);
  if(die<.99){const b=new THREE.Box3().setFromObject(boat.group);boxes.push(box('полная настоящая лодка',b.min.toArray(),b.max.toArray()));points.push(point('лодка',[-12,.7+fall,state.boatZ]));}
  points.push(point('замок троса',[-12,3.5,14]),point('выход на стену: верх тела',[-12,4.4,12]));
  if(state.ropeIntact){boxes.push(box('оба конца троса',[-12,1,14],[-12,3.5,state.boatZ]));for(const u of[0,.5,1])points.push(point('трос '+u,[-12,1+2.5*u,state.boatZ+(14-state.boatZ)*u]));}
 }
 return {points,boxes};
}
function check(def,state,n,aspect){const view=eventCamera(def,state),camera=new THREE.PerspectiveCamera(43,aspect,.1,400);camera.position.set(...view.camera);camera.lookAt(...view.focus);camera.updateMatrixWorld(true);const {points,boxes}=contents(state,n,view),blocked=[],clipped=[];let probes=0;
 for(const p of points){const target=new THREE.Vector3(...p.xyz),delta=target.clone().sub(camera.position);ray.set(camera.position,delta.clone().normalize());ray.far=Math.max(0,delta.length()-.7);const hit=ray.intersectObjects(solid,false)[0];if(hit)blocked.push({name:p.name,by:hit.object.name,at:hit.point.toArray()});probes++;}
 for(const b of boxes)for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]]){const ndc=new THREE.Vector3(x,y,z).project(camera);if(Math.abs(ndc.x)>.97||Math.abs(ndc.y)>.94||ndc.z<0||ndc.z>1)clipped.push({name:b.name,ndc:ndc.toArray()});}
 const label=def.id==='stores'?{text:'Склад',xyz:[-13.3,2.8,-11]}:def.id==='forge'?{text:'Кузнечный заказ',xyz:state.t>=10?[0,5.4,-18.8]:[13.5,3,-10.5]}:{text:'Якорный замок',xyz:[-12,5.5,17]};const labelNdc=new THREE.Vector3(...label.xyz).project(camera),labelWidth=(label.text.length*18+40)/64*38,labelHalfX=labelWidth/(500*aspect),labelHalfY=38/500;if(Math.abs(labelNdc.x)+labelHalfX>1||Math.abs(labelNdc.y)+labelHalfY>1)clipped.push({name:'экранная подпись',ndc:labelNdc.toArray()});
 return {id:def.id,n,t:state.t,choice:state.choice,key:view.key,aspect,probes,blocked,clipped};
}
const rows=[];for(const n of[1,4])for(const id of['stores','forge','anchor']){const def=SCENARIOS.find(d=>d.id===id);for(const action of[null,...def.actions.map(a=>a.id)])for(const late of[false,true]){const run=new ScenarioRun(id,n);if(action){run.seek(late?(id==='stores'?15:id==='forge'?7:12):def.decisionAt);run.choose(action);}for(const t of[0,def.decisionAt,8,10,13,17,19,24,def.total]){run.seek(t);for(const aspect of[1.42,1.516])rows.push(check(def,run.snapshot(),n,aspect));}}}
const failed=rows.filter(r=>r.blocked.length||r.clipped.length),failureSummary={};for(const r of failed)for(const item of[...r.blocked.map(b=>({name:'blocked '+b.name+' by '+b.by})),...r.clipped]){const key=r.key+' / '+item.name;failureSummary[key]=(failureSummary[key]??0)+1;}const receipt={at:new Date().toISOString(),method:'Actual CastleDecor solid source triangles + actual SEA_BOAT/old mob pose bounds, no renderer. Opaque builder geometry; ivy, animated flags and particles excluded. Rays stop 0.7m before endpoint to avoid treating the target itself as obstruction.',frames:rows.length,rays:rows.reduce((s,r)=>s+r.probes,0),failedFrames:failed.length,failureSummary,examples:failed.slice(0,4),cameraChapters:true,notVisualAcceptance:true,notGameplayOrPerformanceTest:true,newBuild:false,newBrowser:false,sourceHashes:Object.fromEntries(['./scenarios.mjs','./event-camera.mjs','./event-lab.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url))).digest('hex')]))};
fs.writeFileSync(new URL('../data/camera-geometry-receipt.json',import.meta.url),JSON.stringify(receipt,null,2));console.log(JSON.stringify({...receipt,sourceHashes:undefined}));assert.equal(failed.length,0,'Camera key objects clipped or blocked; inspect receipt');
