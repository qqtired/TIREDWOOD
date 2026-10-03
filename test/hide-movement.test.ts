import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HideGame } from '../server/hide/game.ts';
import { Predictor } from '../client/predict.ts';
import { HidePhysics, hideFits } from '../shared/hidephysics.ts';
import { HIDE_COUNT_TICKS, HIDE_PREP_TICKS, HIDE_FORMS } from '../shared/hide.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { BTN_LEFT, BTN_JUMP, BTN_DASH, makeInput, makeState, statesEqual, type Input } from '../shared/sim.ts';
import { encodeInputs, decodeInputs } from '../shared/protocol.ts';

function setup() {
 const game=new HideGame({finished(){},rand:n=>Math.floor(n*.31)});
 for(let pid=1;pid<=2;pid++)game.addHuman({pid,nick:`Player${pid}`,level:1,outfit:DEFAULT_OUTFIT},{sendJson(){}});
 for(let i=0;i<HIDE_COUNT_TICKS+HIDE_PREP_TICKS;i++)game.step();
 return {game,prop:[...game.players.values()].find(p=>p.role==='prop')!,hunter:[...game.players.values()].find(p=>p.role==='hunter')!};
}

test('prop prediction and wire-input authority agree when walking into anonymous scenery',()=>{
 const {game,prop}=setup();prop.form='barrel';prop.propYaw=0;
 const props=game.view(prop).props;
 const obstacle=props.find(q=>{
  if(q.id===prop.propId)return false;
  const f=HIDE_FORMS[q.form],hx=Math.abs(Math.cos(q.yaw))*f.w+Math.abs(Math.sin(q.yaw))*f.d;
  return hideFits(game.world,{x:q.x+hx+.56+.4,y:q.y,z:q.z},'barrel',0);
 })!;
 assert.ok(obstacle);
 const f=HIDE_FORMS[obstacle.form],hx=Math.abs(Math.cos(obstacle.yaw))*f.w+Math.abs(Math.sin(obstacle.yaw))*f.d;
 Object.assign(prop.state,makeState(),{x:obstacle.x+hx+.56+.4,y:obstacle.y,z:obstacle.z,grounded:1});
 const physics=Object.assign(new HidePhysics(game.world),{form:prop.form,yaw:prop.propYaw,props:game.view(prop).props,propId:prop.propId});
 const predictor=new Predictor(game.world,physics);predictor.reset(prop.state,0);
 for(let seq=1;seq<=30;seq++){
  const input={...makeInput(),seq,buttons:BTN_LEFT|BTN_JUMP|BTN_DASH};
  predictor.step(input,false);
  const decoded:Input[]=[];decodeInputs(encodeInputs([input],0,1,1),decoded);game.onInputs(prop,decoded,1);game.step();
  assert.ok(statesEqual(predictor.state,prop.state),`prediction diverged on contact at input ${seq}: predicted x=${predictor.state.x}, server x=${prop.state.x}`);
 }
 assert.ok(Math.abs(prop.state.x-obstacle.x)>=hx+.56+.04);
});

import { HideMotion } from '../client/hide/motion.ts';
import { BTN_FORWARD } from '../shared/sim.ts';

test('hunter and prop motion reconcile real decoded inputs without continual corrections',()=>{
 for(const role of ['hunter','prop'] as const){
  const e=setup(),p=e[role],motion=new HideMotion(e.game.world);motion.accept(e.game.view(p),0);
  for(let seq=1;seq<=240;seq++){
   const input={...makeInput(),seq,buttons:BTN_FORWARD|BTN_JUMP|BTN_DASH,yaw:Math.fround(Math.floor((seq-1)/60)*Math.PI/2)};
   motion.step(input);const decoded:Input[]=[];decodeInputs(encodeInputs([input],0,1,1),decoded);e.game.onInputs(p,decoded,1);e.game.step();
   assert.ok(statesEqual(motion.predictor.state,p.state),`${role}: divergent input ${seq}`);
   if(seq%6===0)motion.accept(e.game.view(p),seq/60*1000);
  }
  assert.equal(motion.predictor.corrections,0,`${role}: stable authoritative path needs no correction smoothing`);
 }
});

test('self camera advances on each 120 Hz frame between its 60 Hz physics steps',()=>{
 const {game,hunter}=setup(),motion=new HideMotion(game.world);motion.accept(game.view(hunter),0);
 for(let seq=1;seq<=10;seq++)motion.step({...makeInput(),seq,buttons:BTN_FORWARD});
 const samples:number[]=[];
 for(let frame=0;frame<12;frame++){
  if(frame%2===0)motion.step({...makeInput(),seq:11+frame/2,buttons:BTN_FORWARD});
  motion.render(frame*1000/120,1/120,frame%2/2);samples.push(motion.position.z);
 }
 for(let i=1;i<samples.length;i++)assert.ok(samples[i]<samples[i-1],`render frame ${i} stalled at a physics boundary`);
});

test('10 Hz anonymous prop and hunter snapshots render smoothly through the existing network clock',()=>{
 const {game,hunter}=setup(),motion=new HideMotion(game.world),message=game.view(hunter);
 const id=message.props[0].id,startTick=message.tick;
 const distances:number[]=[];
 for(let frame=0;frame<=48;frame++){
  const now=frame*1000/120;
  if(frame%12===0){const x=frame/120*6;motion.accept({...message,tick:startTick+frame/2,props:[{...message.props[0],x,y:0,z:0}],hunter:{...message.hunter!,x,y:0,z:2}},now);}
  motion.render(now,1/120,0);
  const prop=motion.props.find(p=>p.id===id)!;assert.equal(prop.x,motion.hunter.x,'both remote paths share interpolation time');
  if(frame>=24)distances.push(prop.x);
 }
 for(let i=1;i<distances.length;i++)assert.ok(distances[i]>distances[i-1]&&distances[i]-distances[i-1]<.08,`snapshot arrival must not snap at frame ${i}`);
});

test('new round clears old movement history while form/freeze resets retain valid current inputs',()=>{
 const {game,hunter}=setup(),motion=new HideMotion(game.world),message=game.view(hunter);motion.accept(message,0);
 for(let seq=1;seq<=80;seq++)motion.step({...makeInput(),seq,buttons:BTN_FORWARD});
 const next={...message,round:message.round+1,self:{...message.self,ack:0,reset:message.self.reset+1,state:{...message.self.state,x:5,z:5}}};
 motion.accept(next,1000);assert.equal(motion.predictor.state.x,5);assert.equal(motion.predictor.state.z,5);assert.equal(motion.predictor.newestSeq,-1);
 motion.step({...makeInput(),seq:81,buttons:BTN_FORWARD});assert.ok(motion.predictor.state.z<5,'first new-round input is not lost');
 motion.accept({...next,self:{...next.self,role:'prop',form:'crate',locked:true,reset:next.self.reset+1,state:{...next.self.state},propId:123}},1010);
 motion.step({...makeInput(),seq:82,buttons:BTN_FORWARD});assert.equal(motion.predictor.state.z,5,'freeze replay and new inputs stay put');
 motion.accept({...next,self:{...next.self,reset:next.self.reset+2,state:{...next.self.state},ack:82}},1020);
 motion.step({...makeInput(),seq:83,buttons:BTN_FORWARD});assert.ok(motion.predictor.state.z<5,'release moves again');
});

test('snapshot arrival jitter cannot turn remote walking back into 10 Hz steps',()=>{
 const {game,hunter}=setup(),motion=new HideMotion(game.world),base=game.view(hunter),values:number[]=[];
 let sent=-1;
 for(let frame=0;frame<180;frame++){
  const now=frame*1000/120;
  while(sent<14){const n=sent+1,arrival=n*100+(n%2?20:0);if(arrival>now)break;sent=n;
   motion.accept({...base,tick:base.tick+n*6,props:[{...base.props[0],x:n*.6,y:0,z:0}],hunter:null},arrival);
  }
  motion.render(now,1/120,0);if(frame>36&&frame<165)values.push(motion.props[0].x);
 }
 for(let i=1;i<values.length;i++)assert.ok(values[i]>values[i-1]&&values[i]-values[i-1]<.08,`jitter created a stop/snap at frame ${i}: ${values[i]-values[i-1]}`);
});

test('first seek input, real form/freeze changes and reconnect retain authoritative movement',()=>{
 const game=new HideGame({finished(){},rand:n=>Math.floor(n*.31)});
 for(let pid=1;pid<=2;pid++)game.addHuman({pid,nick:`Player${pid}`,level:1,outfit:DEFAULT_OUTFIT},{sendJson(){}});
 for(let i=0;i<HIDE_COUNT_TICKS;i++)game.step();
 const hunter=[...game.players.values()].find(p=>p.role==='hunter')!,prop=[...game.players.values()].find(p=>p.role==='prop')!;
 const motion=new HideMotion(game.world);motion.accept(game.view(hunter),0);
 const apply=(p:typeof hunter,m:HideMotion,seq:number,buttons:number)=>{
  const input={...makeInput(),seq,buttons};m.step(input);const decoded:Input[]=[];decodeInputs(encodeInputs([input],0,1,1),decoded);game.onInputs(p,decoded,1);game.step();
  assert.ok(statesEqual(m.predictor.state,p.state));m.accept(game.view(p),game.tick*1000/60);
 };
 apply(hunter,motion,1,BTN_FORWARD);assert.equal(hunter.state.z,6,'preparation holds hunter still');
 while(game.phase==='hide')game.step();motion.accept(game.view(hunter),game.tick*1000/60);
 apply(hunter,motion,2,BTN_FORWARD);assert.ok(hunter.state.z<6,'first seek input moves');
 const propMotion=new HideMotion(game.world);propMotion.accept(game.view(prop),game.tick*1000/60);
 game.action(prop,{t:'hide',a:'form',form:prop.form});propMotion.accept(game.view(prop),game.tick*1000/60);
 for(let i=0;i<9;i++)game.step();game.action(prop,{t:'hide',a:'freeze'});assert.equal(prop.locked,true);propMotion.accept(game.view(prop),game.tick*1000/60);
 const frozen={x:prop.state.x,z:prop.state.z};apply(prop,propMotion,1,BTN_FORWARD);assert.deepEqual({x:prop.state.x,z:prop.state.z},frozen);
 for(let i=0;i<9;i++)game.step();game.action(prop,{t:'hide',a:'freeze'});propMotion.accept(game.view(prop),game.tick*1000/60);apply(prop,propMotion,2,BTN_FORWARD);
 game.removePlayer(hunter.id);const rejoined=game.addHuman(hunter,{sendJson(){}})!;assert.equal(rejoined.input.ack,0);
 const resumed=new HideMotion(game.world);resumed.accept(game.view(rejoined),game.tick*1000/60);apply(rejoined,resumed,1,BTN_FORWARD);assert.equal(resumed.predictor.corrections,0);
});

test('first large scene sequence after authority round reset is accepted without replaying old movement',()=>{
 const {game,hunter}=setup(),motion=new HideMotion(game.world);motion.accept(game.view(hunter),0);
 let seq=9000;
 const apply=()=>{const input={...makeInput(),seq:++seq,buttons:BTN_FORWARD};motion.step(input);const decoded:Input[]=[];decodeInputs(encodeInputs([input],0,1,1),decoded);game.onInputs(hunter,decoded,1);game.step();};
 apply();assert.equal(hunter.input.ack,9001);
 game.phase='gather';game.phaseEnd=game.tick+1;game.step();assert.equal(hunter.input.ack,0);
 motion.accept(game.view(hunter),100);assert.equal(motion.predictor.newestSeq,-1);
 const before={...hunter.state};apply();
 assert.equal(hunter.input.ack,9002,'scene sequence stays monotonic even when server queue restarts');
 assert.ok(statesEqual(motion.predictor.state,hunter.state));
 const distance=Math.hypot(hunter.state.x-before.x,hunter.state.z-before.z);assert.ok(distance>0&&distance<.15,'exactly one new walking step, no stale previous-round replay');
});
