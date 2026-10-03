import assert from 'node:assert/strict';
import { test } from 'node:test';
import { START_DWELL_TICKS, START_ZONES } from '../shared/startzones.ts';
import { lastOf, login, placeAt, setupHub, steps } from './kit.ts';

test('small paintball circle enters only after uninterrupted three seconds',()=>{
  const {hub}=setupHub();const a=login(hub,'Dwell');const z=START_ZONES[0];
  placeAt(hub,a.c,z.x,z.z);steps(hub,START_DWELL_TICKS-1);assert.equal(a.c.room?.kind,'lobby');
  assert.equal(lastOf(a.s,'startZone')?.kind,'paintball');steps(hub,2);assert.equal(a.c.room?.kind,'paintball');
});
test('leaving circle resets dwell; return must complete full time',()=>{
  const {hub}=setupHub();const a=login(hub,'DwellReset');const z=START_ZONES[0];
  placeAt(hub,a.c,z.x,z.z);steps(hub,100);placeAt(hub,a.c,0,0);steps(hub,1);
  assert.equal(lastOf(a.s,'startZone')?.kind,null);placeAt(hub,a.c,z.x,z.z);steps(hub,100);assert.equal(a.c.room?.kind,'lobby');
  steps(hub,START_DWELL_TICKS);assert.equal(a.c.room?.kind,'paintball');
});
test('spawn inside circle is disarmed until exit and reentry',()=>{
  const {hub}=setupHub();const z=START_ZONES[0];Object.assign(hub.lobby.map.spawn,{x:z.x,z:z.z});
  const a=login(hub,'SpawnDwell');placeAt(hub,a.c,z.x,z.z);steps(hub,START_DWELL_TICKS+10);assert.equal(a.c.room?.kind,'lobby');
  placeAt(hub,a.c,0,0);steps(hub,1);placeAt(hub,a.c,z.x,z.z);steps(hub,START_DWELL_TICKS+1);assert.equal(a.c.room?.kind,'paintball');
});
test('skill disabled omits welcome and refuses portal; explicit enable admits',()=>{
  const {hub}=setupHub({skill:false});const a=login(hub,'NoSky');
  assert.ok(hub.skill===null,'Skill is gated off');assert.equal(lastOf(a.s,'lobby')?.skill,undefined);
  const portal=hub.lobby.map.interact.find(i=>i.kind==='skill')!;placeAt(hub,a.c,portal.x,portal.z);hub.onJson(a.c,{t:'use',id:portal.id});assert.equal(a.c.room?.kind,'lobby');
  const enabled=setupHub({skill:true});assert.ok(enabled.hub.skill);
  const pillar=hub.lobby.map.boxes[hub.lobby.map.skillPortalBoxes[0]];
  const x=(pillar.min[0]+pillar.max[0])/2,z=(pillar.min[2]+pillar.max[2])/2;
  assert.equal(hub.lobby.world.overlaps(x-.01,1,z-.01,x+.01,1.1,z+.01),false,'disabled portal has no physical pillar');
  assert.equal(enabled.hub.lobby.world.overlaps(x-.01,1,z-.01,x+.01,1.1,z+.01),true,'enabled portal has physical pillar');
});
test('enabled fort circle enters after dwell; disabled fort circle stays inert',()=>{
  const z=START_ZONES[1], off=setupHub(), a=login(off.hub,'FortOff');placeAt(off.hub,a.c,z.x,z.z);steps(off.hub,START_DWELL_TICKS+1);assert.equal(a.c.room?.kind,'lobby');
  const on=setupHub({fort:true}), b=login(on.hub,'FortOn');placeAt(on.hub,b.c,z.x,z.z);steps(on.hub,START_DWELL_TICKS+1);assert.equal(b.c.room?.kind,'fort');
});
test('full room cancels dwell and freeing a slot never enters until fresh circle entry',()=>{
  const {hub}=setupHub({fort:true});assert.ok(hub.fort);
  const inside=Array.from({length:6},(_,i)=>login(hub,`FortFull${i}`,undefined,`10.4.0.${i+1}`));
  for(const p of inside)assert.equal(hub.move(p.c,hub.fort,true),true);
  const a=login(hub,'WaitingFort',undefined,'10.4.0.9'),z=START_ZONES[1];placeAt(hub,a.c,z.x,z.z);steps(hub,START_DWELL_TICKS+1);
  assert.equal(a.c.room?.kind,'lobby');hub.move(inside[0].c,hub.lobby,true);steps(hub,START_DWELL_TICKS+1);assert.equal(a.c.room?.kind,'lobby');
  placeAt(hub,a.c,0,0);steps(hub,1);placeAt(hub,a.c,z.x,z.z);steps(hub,START_DWELL_TICKS+1);assert.equal(a.c.room?.kind,'fort');
});
