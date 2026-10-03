import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { Input as ClientInput } from '../client/input.ts';
import { viewDir } from '../shared/math.ts';
import { CollisionWorld } from '../shared/world.ts';
import { makeSkillMap } from '../shared/skillmap.ts';
import { SkillDynamics } from '../shared/skillphysics.ts';
import { HidePhysics, hideMotionWorld } from '../shared/hidephysics.ts';
import { HideMotion } from '../client/hide/motion.ts';
import { makeBoatCourse } from '../shared/boatracemap.ts';
import { makeBoatState, makeBoatEvents } from '../shared/boatrace.ts';
import { placeBoat, stepBoat } from '../shared/boatracephysics.ts';
import { BTN_FORWARD, BTN_BACK, BTN_RIGHT, makeInput, makeState, makeEvents } from '../shared/sim.ts';
import { decodeInputs } from '../shared/protocol.ts';
import { EYE_HEIGHT } from '../shared/constants.ts';
import { HideGame } from '../server/hide/game.ts';
import { HIDE_COUNT_TICKS, HIDE_PREP_TICKS, type HideStateMsg } from '../shared/hide.ts';
import { makeRayHit } from '../shared/world.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';

// Only asset/CSS URL imports are stubbed: frame(), Input.mouse(), Three camera math and simulation run unchanged.
const hook=registerHooks({load(url,ctx,next){if(/\.(webp|png|jpg|glb|bin|css)$/.test(new URL(url).pathname))return{format:'module',source:`export default ${JSON.stringify(url)}`,shortCircuit:true};return next(url,ctx);}});
let SkillScene:any,HideScene:any,SkillCamera:any;
try{SkillScene=(await import('../client/skilltest/scene.ts')).SkillScene;SkillCamera=(await import('../client/skilltest/camera.ts')).SkillCamera;HideScene=(await import('../client/hide/scene.ts')).HideScene;}finally{hook.deregister();}
const noop=()=>{};
function input(yaw=0,pitch=0){return Object.assign(Object.create(ClientInput.prototype),{locked:true,held:0,yaw,pitch,sens:1,adsSens:1,scopeSens:1});}
function skillCamera(controls=input(),collision=new CollisionWorld({...makeSkillMap(),boxes:[]})){
 const camera=new THREE.PerspectiveCamera();
 const s=Object.assign(Object.create(SkillScene.prototype),{active:true,ready:true,tick:0,receivedAt:0,viewTick:0,acc:0,peers:[],hudAt:0,progress:{checkpoint:0},
  cameraPos:new THREE.Vector3(),cameraLook:new THREE.Vector3(),cameraDir:new THREE.Vector3(),cam:new SkillCamera(),lock:0,decor:noop,
  predictor:{state:{...makeState(),y:40},offset:{x:0,y:0,z:0},decay:noop},d:{input:controls,renderer:{canvas:{clientHeight:800}},settings:{fov:95}},dynamics:{place:noop},
  world:{camera,collision,update:noop,render:noop}});
 return{s,camera};
}
function hideCamera(controls=input(),role:'hunter'|'prop'='hunter'){
 const camera=new THREE.PerspectiveCamera(),listener:number[]=[],collision=new CollisionWorld({...makeSkillMap(),boxes:[]});
 const message:HideStateMsg={t:'hide_state',tick:0,round:1,match:1,phase:'seek',phaseEnd:100,seekAt:0,
  self:{id:1,ack:0,reset:1,state:makeState(),role,kind:'barrel',prop:role==='prop'?77:0,yaw:0,locked:false,hits:0,paint:100,jam:false,takeAt:0,tauntCd:0,tauntAt:0,back:0},
  full:true,p:[],gone:[],h:[],left:1,total:1,notice:'',rows:[],res:null};
 const motion=new HideMotion();motion.accept(message,0);
 const s=Object.assign(Object.create(HideScene.prototype),{active:true,msg:message,motion,acc:0,lastHud:0,seq:0,inputs:[makeInput()],target:0,lastTickSound:-1,orbit:0,
  dir:{x:0,y:0,z:-1},look:new THREE.Vector3(),hit:makeRayHit(),statics:collision,avatars:new Map(),ghosts:[],
  props:{update:()=>false},fx:{update:noop},gun:{visible:false,update:noop,render:noop},sfx:{tick:noop},hud:{setHint:noop,update:noop,root:{classList:{toggle:noop}}},
  world:{camera,update:noop,render:noop},d:{input:controls,renderer:{canvas:{clientHeight:800},refreshShadows:noop},sound:{setListener:(...v:number[])=>listener.splice(0,listener.length,...v)}}});
 return{s,camera,listener};
}
for(const kind of['sky','hide'] as const)test(`${kind}: real mouse up/down follows canonical lobby pitch`,()=>{
 const controls=input(.7),rig=kind==='sky'?skillCamera(controls):hideCamera(controls);
 for(const dy of[-60,120,-60]){
  controls.mouse({movementX:0,movementY:dy});rig.s.frame(0,0);
  const actual=rig.camera.getWorldDirection(new THREE.Vector3()),expected=new THREE.Vector3();viewDir(controls.yaw,controls.pitch,expected);
  assert.ok(actual.distanceTo(expected)<1e-12,`${kind} pitch${controls.pitch}: got y${actual.y}, expected y${expected.y}`);
 }
});
test('HIDE first-person listener and camera use the same forward basis and eye origin',()=>{
 for(const pitch of[-.7,0,.7]){
  const rig=hideCamera(input(.6,pitch));rig.s.frame(0,0);const dir=new THREE.Vector3();viewDir(.6,pitch,dir);
  assert.deepEqual(rig.camera.position.toArray(),[0,EYE_HEIGHT,0]);
  assert.ok(new THREE.Vector3(...rig.listener.slice(3) as [number,number,number]).distanceTo(dir)<1e-12);
 }
});
test('Sky camera retracts before a wall behind the player instead of crossing it',()=>{
 const map=makeSkillMap();map.boxes=[{min:[-3,39,1.5],max:[3,47,2],mat:'deck',color:0xffffff}];
 const rig=skillCamera(input(0,0),new CollisionWorld(map));rig.s.frame(0,0);
 assert.ok(rig.camera.position.z<1.5,`camera crossed wall: z=${rig.camera.position.z}`);
 assert.ok(rig.camera.position.z>0,'camera remains behind the player');
});
test('HIDE server hits a below-eye prop with canonical negative pitch',()=>{
 const g=new HideGame({finished(){},rand:n=>Math.floor(n*.31)});
 const ps=[1,2].map(pid=>g.addHuman({pid,nick:`Tester${pid}`,level:1,outfit:DEFAULT_OUTFIT},{sendJson(){}})!);
 for(let i=0;i<HIDE_COUNT_TICKS+HIDE_PREP_TICKS;i++)g.step();
 const hunter=ps.find(p=>p.role==='hunter')!,prop=ps.find(p=>p.role==='prop')!;g.decor=[];
 Object.assign(hunter.state,{x:7,y:0,z:8});Object.assign(prop.state,{x:7,y:0,z:4});prop.kind='crate';prop.propYaw=0;g.step();
 g.action(hunter,{t:'hide',a:'shoot',aim:[0,Math.atan2(.32-EYE_HEIGHT,4)],view:g.tick+1,seq:hunter.input.ack});g.step();
 assert.equal(prop.hits,1,'server ray must point down when canonical pitch is negative');
});
test('Sky and HIDE W/S align with camera yaw and preserve normalized diagonal speed',()=>{
 for(const mode of['sky','hide'])for(const yaw of[0,-Math.PI/2,.6]){
  const results=[];
  for(const buttons of[BTN_FORWARD,BTN_BACK,BTN_FORWARD|BTN_RIGHT]){
   const map=makeSkillMap(),world=mode==='sky'?new CollisionWorld(map):hideMotionWorld();
   const state={...makeState(),y:mode==='sky'?40:0,z:mode==='sky'?0:9,grounded:1};
   const dyn=mode==='sky'?new SkillDynamics(map,world):Object.assign(new HidePhysics(world),{mover:'prop',kind:'crate'});
   for(let i=0;i<10;i++){const inp={...makeInput(),buttons,yaw,viewTick:i};if(dyn instanceof SkillDynamics)dyn.step(state,inp,i-1,makeEvents());else dyn.step(state,inp);}
   results.push(state);
  }
  const dir=new THREE.Vector3();viewDir(yaw,0,dir);
  assert.ok(results[0].vx*dir.x+results[0].vz*dir.z>0,mode+' W');
  assert.ok(results[1].vx*dir.x+results[1].vz*dir.z<0,mode+' S');
  assert.ok(Math.abs(Math.hypot(results[0].vx,results[0].vz)-Math.hypot(results[2].vx,results[2].vz))<1e-5,mode+' diagonal');
 }
});
test('Boat W accelerates along bow and S brakes/reverses; mouse pitch does not invert throttle',()=>{
 const course=makeBoatCourse();
 for(const pitch of[-.7,.7])for(const buttons of[BTN_FORWARD,BTN_BACK]){
  const state=makeBoatState();placeBoat(state,course,0);const input={...makeInput(),buttons,pitch};
  for(let i=0;i<10;i++)stepBoat(state,input,course,makeBoatEvents(),true);
  const forward=state.vx*state.hx+state.vz*state.hz;
  assert.ok(buttons===BTN_FORWARD?forward>0:forward<0);
 }
});
test('HIDE third-person view and authoritative first-person ray retain the same canonical basis',()=>{
 for(const pitch of[-.4,.4]){
  const yaw=.6,rig=hideCamera(input(yaw,pitch),'prop');rig.s.frame(0,0);
  const g=new HideGame({finished(){},rand:n=>Math.floor(n*.31)});
  const ps=[1,2].map(pid=>g.addHuman({pid,nick:`Aim${pid}`,level:1,outfit:DEFAULT_OUTFIT},{sendJson(){}})!);
  for(let i=0;i<HIDE_COUNT_TICKS+HIDE_PREP_TICKS;i++)g.step();
  const hunter=ps.find(p=>p.role==='hunter')!;
  let direction:number[]=[];const cast=g.world.raycast.bind(g.world);
  g.world.raycast=(ox,oy,oz,dx,dy,dz,maxT,hit,forShots,skipInvisible)=>{direction=[dx,dy,dz];return cast(ox,oy,oz,dx,dy,dz,maxT,hit,forShots,skipInvisible);};
  g.action(hunter,{t:'hide',a:'shoot',aim:[yaw,pitch],view:g.tick+1,seq:hunter.input.ack});g.step();
  assert.deepEqual(direction,rig.listener.slice(3),'server ray and client listener use bit-identical viewDir output');
  assert.ok(rig.camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(...direction as [number,number,number]))<1e-12);
 }
});

for(const kind of ['sky','hide'] as const)for(const edge of [-1,1])test(kind+': immediate reversal at '+(edge>0?'upper':'lower')+' pitch bound, including serialized input',()=>{
 const controls=input(.6),rig=kind==='sky'?skillCamera(controls):hideCamera(controls),packets:Uint8Array[]=[];
 rig.s.seq=0;rig.s.inputs=[makeInput()];if(kind==='sky')rig.s.predictor.step=()=>({jumped:false,landed:false});
 rig.s.d.net={epoch:3,sendBinary:(data:Uint8Array)=>packets.push(data)};
 controls.mouse({movementX:0,movementY:-edge*600});controls.mouse({movementX:0,movementY:-edge*600});rig.s.frame(0,1/60);
 const bound=kind==='sky'?(edge>0?.85:-.6):edge*1.2;
 assert.equal(controls.pitch,bound,'mode must constrain the accumulated input angle, not only the camera');
 const decoded=[makeInput()];assert.equal(decodeInputs(packets[0],decoded),1);assert.equal(decoded[0].pitch,Math.fround(bound));
 const before=rig.camera.getWorldDirection(new THREE.Vector3()).y;
 controls.mouse({movementX:0,movementY:edge*20});rig.s.frame(0,1/60);
 const after=rig.camera.getWorldDirection(new THREE.Vector3()).y;
 assert.ok((after-before)*edge < -1e-6,'a small reverse move must immediately leave the limit');
 assert.equal(decodeInputs(packets.at(-1)!,decoded),1);assert.equal(decoded[0].pitch,Math.fround(controls.pitch));
 const expected=new THREE.Vector3();viewDir(controls.yaw,controls.pitch,expected);
 assert.ok(rig.camera.getWorldDirection(new THREE.Vector3()).distanceTo(expected)<1e-12);
});
