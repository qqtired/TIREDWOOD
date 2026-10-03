import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HideGame } from '../server/hide/game.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { HIDE_COUNT_TICKS,HIDE_PREP_TICKS,HIDE_SEEK_TICKS,HIDE_RESULT_TICKS,HIDE_MISS_TICKS,HIDE_SHOT_TICKS,type HideServerMsg } from '../shared/hide.ts';
import { hideFits,hideRayProp,hideWorld } from '../shared/hidephysics.ts';
import { makeInput } from '../shared/sim.ts';
function setup(n=2){const payouts:unknown[]=[];const game=new HideGame({finished:(pid,r)=>payouts.push({pid,...r}),rand:m=>Math.floor(m*.31)});const messages=new Map<number,HideServerMsg[]>();const players=Array.from({length:n},(_,i)=>{const list:HideServerMsg[]=[];messages.set(i+1,list);return game.addHuman({pid:i+1,nick:`Игрок${i+1}`,level:5,outfit:{...DEFAULT_OUTFIT}},{sendJson:m=>list.push(m)})!;});return{game,players,messages,payouts,step(n:number){for(let i=0;i<n;i++)game.step();}};}
const roles=(e:ReturnType<typeof setup>)=>({hunter:e.players.find(p=>p.role==='hunter')!,prop:e.players.find(p=>p.role==='prop')!});

test('hide waits for at least two, masks preparation and sends no role identities in prop data',()=>{
 const solo=setup(1);solo.step(HIDE_COUNT_TICKS+HIDE_PREP_TICKS+HIDE_SEEK_TICKS);assert.equal(solo.game.phase,'gather');assert.equal(solo.payouts.length,0);
 const e=setup();e.step(HIDE_COUNT_TICKS);assert.equal(e.game.phase,'hide');const {hunter,prop}=roles(e);
 assert.deepEqual(e.game.view(hunter).props,[]);assert.equal(e.game.view(hunter).hunter,null);assert.ok(e.game.view(prop).props.length>=24);
 e.step(HIDE_PREP_TICKS);const view=e.game.view(hunter);assert.equal(view.phase,'seek');for(const p of view.props)assert.deepEqual(Object.keys(p).sort(),['form','id','x','y','yaw','z']);
 assert.ok(!JSON.stringify(view.props).includes('Игрок'));assert.equal(view.total,1);
});
test('freeze holds movement/rotation; bad shape-fit and unsafe positions are rejected',()=>{
 const e=setup();e.step(HIDE_COUNT_TICKS);const {prop}=roles(e);e.game.action(prop,{t:'hide',a:'freeze'});assert.equal(prop.locked,true);
 const before={...prop.state},yaw=prop.propYaw;const inp={...makeInput(),seq:1,buttons:1,yaw:2};e.game.onInputs(prop,[inp],1);e.step(1);
 assert.equal(prop.state.x,before.x);assert.equal(prop.state.z,before.z);assert.equal(prop.propYaw,yaw);
 const world=hideWorld();assert.equal(hideFits(world,{x:-23.6,y:0,z:19.2},'crate',0),false);assert.equal(hideFits(world,{x:0,y:-1,z:35},'pot',0),false);
 assert.equal(hideRayProp(0,1,0,0,0,-1,{id:1,form:'crate',x:0,y:0,z:-5,yaw:0}),4.38);
});
test('miss costs exactly3 seconds with cooldown; cannot shoot during prep or as prop',()=>{
 const e=setup();e.step(HIDE_COUNT_TICKS);const {hunter,prop}=roles(e);const prep=e.game.phaseEnd;e.game.action(hunter,{t:'hide',a:'shoot'});assert.equal(e.game.phaseEnd,prep);
 e.step(HIDE_PREP_TICKS);hunter.pitch=1.2;const before=e.game.phaseEnd;e.game.action(prop,{t:'hide',a:'shoot'});assert.equal(e.game.phaseEnd,before);
 e.game.action(hunter,{t:'hide',a:'shoot'});assert.equal(e.game.phaseEnd,before-HIDE_MISS_TICKS);e.game.action(hunter,{t:'hide',a:'shoot'});assert.equal(e.game.phaseEnd,before-HIDE_MISS_TICKS);
 e.step(HIDE_SHOT_TICKS);e.game.action(hunter,{t:'hide',a:'shoot'});assert.equal(e.game.phaseEnd,before-HIDE_MISS_TICKS*2);
});
test('late join is spectator; disconnect/rejoin cannot reset role or create reward; no remaining opponents cancels',()=>{
 const e=setup();e.step(HIDE_COUNT_TICKS+HIDE_PREP_TICKS);const {hunter,prop}=roles(e);
 const late=e.game.addHuman({pid:9,nick:'Поздний',level:1,outfit:{...DEFAULT_OUTFIT}},{sendJson:()=>{}})!;assert.equal(late.role,'spectator');
 e.game.removePlayer(prop.id);assert.equal(e.game.canRejoin(prop.pid),true);const rejoined=e.game.addHuman({pid:prop.pid,nick:prop.nick,level:5,outfit:prop.outfit},{sendJson:()=>{}})!;
 assert.equal(rejoined.id,prop.id);assert.equal(rejoined.role,'prop');assert.equal(e.game.canRejoin(prop.pid),false);assert.equal(rejoined.rewardEligible,false);
 e.game.removePlayer(prop.id);e.step(601);assert.equal(e.game.phase,'result');assert.equal(e.game.result,'cancelled');assert.equal(e.payouts.length,0);
 assert.equal(e.game.view(hunter).remaining,0);
});
test('idle players cannot farm survival rewards and roles rotate across rounds',()=>{
 const e=setup();e.step(HIDE_COUNT_TICKS+HIDE_PREP_TICKS);const first=roles(e).hunter.pid;
 e.step(HIDE_SEEK_TICKS);assert.equal(e.game.phase,'result');assert.equal(e.payouts.length,0);
 e.step(HIDE_RESULT_TICKS+HIDE_COUNT_TICKS);assert.equal(e.game.phase,'hide');assert.notEqual(roles(e).hunter.pid,first);
});

test('authoritative ray finds an exposed prop and emits one bounded result per eligible participant',()=>{
 const e=setup();e.step(HIDE_COUNT_TICKS+HIDE_PREP_TICKS+900);const {hunter,prop}=roles(e);
 Object.assign(hunter.state,{x:0,y:0,z:8});Object.assign(prop.state,{x:0,y:0,z:4});prop.form='crate';prop.propYaw=0;
 hunter.yaw=0;hunter.pitch=Math.atan2(.575-1.42,4);hunter.moved=5;prop.moved=5;prop.chose=true;
 e.game.action(hunter,{t:'hide',a:'shoot'});assert.equal(prop.found,true);assert.equal(e.game.result,'hunter');assert.equal(e.payouts.length,2);
 assert.ok((e.payouts[0] as {reward:number}).reward<=35);e.game.action(hunter,{t:'hide',a:'shoot'});e.step(10);assert.equal(e.payouts.length,2);
});
test('wall blocks a direct aim and expired round cannot reward a remaining solo hunter',()=>{
 const e=setup();e.step(HIDE_COUNT_TICKS+HIDE_PREP_TICKS);const {hunter,prop}=roles(e);
 // Existing warehouse front wall is between these positions; coordinates are not client-controlled.
 Object.assign(hunter.state,{x:4,y:0,z:-10});Object.assign(prop.state,{x:4,y:0,z:-20});prop.form='crate';hunter.yaw=0;hunter.pitch=Math.atan2(.575-1.42,10);
 e.game.action(hunter,{t:'hide',a:'shoot'});assert.equal(prop.found,false);
 e.game.removePlayer(prop.id);e.game.phaseEnd=e.game.tick+1;hunter.moved=20;e.step(1);assert.equal(e.game.result,'cancelled');assert.equal(e.payouts.length,0);
});
test('malformed movement is dropped without crashing queue or moving a prop',()=>{
 const e=setup();e.step(HIDE_COUNT_TICKS);const {prop}=roles(e);const x=prop.state.x;
 e.game.onInputs(prop,[{...makeInput(),seq:1,yaw:NaN}],1);e.step(1);assert.equal(prop.state.x,x);
});

test('live props do not occupy a recognizable prefix of public anonymous IDs',()=>{
 const e=setup(8);e.step(HIDE_COUNT_TICKS);const ids=e.game.view(e.players.find(p=>p.role==='prop')!).props.map(p=>p.id).sort((a,b)=>a-b);
 const live=e.players.filter(p=>p.role==='prop').map(p=>p.propId).sort((a,b)=>a-b);assert.notDeepEqual(live,ids.slice(0,7));
});
