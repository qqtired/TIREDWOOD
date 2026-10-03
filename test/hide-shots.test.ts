import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HideGame } from '../server/hide/game.ts';
import { HIDE_COUNT_TICKS,HIDE_PREP_TICKS,HIDE_SHOT_TICKS,HIDE_MISS_TICKS,type HideServerMsg } from '../shared/hide.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { EYE_HEIGHT } from '../shared/constants.ts';
import { viewDir } from '../shared/math.ts';
import { makeRayHit } from '../shared/world.ts';

function setup() {
  const game=new HideGame({finished(){},rand:n=>Math.floor(n*.31)});
  const messages:HideServerMsg[][]=[[],[]];
  const players=messages.map((list,i)=>game.addHuman({pid:i+1,nick:`Private${i}`,level:1,outfit:DEFAULT_OUTFIT},{sendJson:m=>list.push(m)})!);
  const step=(n:number)=>{for(let i=0;i<n;i++)game.step();};
  step(HIDE_COUNT_TICKS);
  const hunter=players.find(p=>p.role==='hunter')!,prop=players.find(p=>p.role==='prop')!;
  return {game,messages,players,hunter,prop,step,seek(){step(HIDE_PREP_TICKS);}};
}

test('accepted HIDE shot broadcasts the authoritative wall endpoint to every observer, never through a wall',()=>{
  const e=setup();assert.deepEqual(e.game.view(e.hunter).shots,[]);e.seek();
  const late=e.game.addHuman({pid:3,nick:'Observer',level:1,outfit:DEFAULT_OUTFIT},{sendJson(){}})!;
  Object.assign(e.hunter.state,{x:4,y:0,z:-10});Object.assign(e.prop.state,{x:4,y:0,z:-20});e.prop.form='crate';
  const pitch=Math.atan2(.575-EYE_HEIGHT,10),dir={x:0,y:0,z:0};viewDir(0,pitch,dir);
  const wall=makeRayHit();assert.ok(e.game.world.raycast(4,EYE_HEIGHT,-10,dir.x,dir.y,dir.z,42,wall,true));
  e.game.action(e.hunter,{t:'hide',a:'shoot',aim:[0,pitch]});
  const shot=e.game.view(e.hunter).shots.at(-1)!;assert.ok(shot);assert.equal(shot.kind,'world');
  assert.deepEqual(shot.from,[4,EYE_HEIGHT,-10]);
  assert.ok(Math.hypot(shot.to[0]-(4+dir.x*wall.t),shot.to[1]-(EYE_HEIGHT+dir.y*wall.t),shot.to[2]-(-10+dir.z*wall.t))<1e-8);
  assert.deepEqual(shot.normal,[wall.nx,wall.ny,wall.nz]);assert.equal(shot.propId,0);assert.equal(e.prop.found,false);
  assert.deepEqual(e.game.view(e.prop).shots,e.game.view(late).shots);assert.deepEqual(e.game.view(late).shots,e.game.view(e.hunter).shots);
  assert.deepEqual(Object.keys(shot).sort(),['from','id','kind','normal','propId','tick','to']);
  assert.ok(!JSON.stringify(shot).includes('Private'));
});

test('latest validated aim matches the shot while origin stays server-owned; rejected inputs create no effects or penalty',()=>{
  const e=setup();e.seek();Object.assign(e.hunter.state,{x:0,y:0,z:8});Object.assign(e.prop.state,{x:0,y:0,z:4});e.prop.form='crate';e.prop.propYaw=0;
  e.hunter.yaw=Math.PI;e.hunter.pitch=1;
  const before=e.game.phaseEnd;
  for(const aim of [[NaN,0],[0,Infinity],[0],['0',0],null]) e.game.action(e.hunter,{t:'hide',a:'shoot',aim} as never);
  assert.equal(e.hunter.shots,0);assert.equal(e.game.phaseEnd,before);
  const pitch=Math.atan2(.575-EYE_HEIGHT,4);
  e.game.action(e.hunter,{t:'hide',a:'shoot',aim:[0,pitch]});
  assert.equal(e.prop.found,true);
  const shot=e.game.view(e.hunter).shots.at(-1)!;assert.equal(shot.kind,'prop');assert.equal(shot.propId,e.prop.propId);
  assert.deepEqual(shot.from,[0,EYE_HEIGHT,8]);assert.ok(shot.to[2]>4 && shot.to[2]<5);
  assert.ok(Math.abs(Math.hypot(...shot.normal)-1)<1e-8);
});

test('shot history is bounded, expires, deduplicates cooldown and is cleared before the next blind phase',()=>{
  const e=setup();e.game.action(e.hunter,{t:'hide',a:'shoot'});assert.deepEqual(e.game.view(e.hunter).shots,[]);e.seek();
  const before=e.game.phaseEnd;
  e.game.action(e.prop,{t:'hide',a:'shoot'});assert.equal(e.hunter.shots,0);
  e.game.action(e.hunter,{t:'hide',a:'shoot',aim:[0,1.2]});e.game.action(e.hunter,{t:'hide',a:'shoot',aim:[0,1.2]});
  assert.equal(e.hunter.shots,1);assert.equal(e.game.phaseEnd,before-HIDE_MISS_TICKS);
  const ids=new Set<number>();
  for(let i=0;i<12;i++) {e.step(HIDE_SHOT_TICKS);e.game.action(e.hunter,{t:'hide',a:'shoot',aim:[0,1.2]});const shots=e.game.view(e.hunter).shots;assert.ok(shots.length<=4);ids.add(shots.at(-1)!.id);}
  assert.equal(ids.size,12);e.step(121);assert.deepEqual(e.game.view(e.hunter).shots,[]);
  e.game.phase='gather';e.game.phaseEnd=e.game.tick+1;e.step(1);
  assert.equal(e.game.phase,'hide');for(const player of e.players)assert.deepEqual(e.game.view(player).shots,[]);
});
