import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STORM_GOAL, STORM_WARN, STORM_RANK } from '../shared/storm.ts';
import { FISHER_USE } from '../shared/fishplaces.ts';
import { BALL_BYTES } from '../shared/ball.ts';
import { decodeSnapshot, makeHeader } from '../shared/protocol.ts';
import { makeState } from '../shared/sim.ts';
import { emptyPirateTail, PIRATE_WARN } from '../shared/pirates.ts';
import { readPirateTail } from '../shared/piratenet.ts';
import { allOf, lastOf, login, placeAt, setupHub, steps } from './kit.ts';

test('big event flags off create no controllers or messages',()=>{
  const {hub}=setupHub();const a=login(hub,'QuietLobby');
  assert.ok(hub.lobby.storm===null);assert.ok(hub.lobby.pirates===null);steps(hub,601);
  assert.equal(allOf(a.s,'storm').length,0);assert.equal(allOf(a.s,'pirates').length,0);
});
test('DEV storm enters finite warning, lighthouse validates position, winner gets mode XP',()=>{
  const {hub}=setupHub({storm:true,devStorm:true});const a=login(hub,'Lighthouse');assert.ok(hub.lobby.storm);
  const xp=a.c.profile!.xp;steps(hub,600);assert.equal(hub.lobby.storm.view().phase,'warn');assert.equal(hub.lobby.director.busy,true);
  steps(hub,STORM_WARN);assert.equal(hub.lobby.storm.view().phase,'storm');
  hub.onJson(a.c,{t:'stormLight'});assert.equal(hub.lobby.storm.view().winners.length,0);
  placeAt(hub,a.c,STORM_GOAL.x,STORM_GOAL.z,STORM_GOAL.y);hub.onJson(a.c,{t:'stormLight'});
  assert.equal(hub.lobby.storm.view().phase,'calm');steps(hub,STORM_RANK+1);
  assert.ok(a.c.profile!.xp>xp);assert.ok(lastOf(a.s,'storm'));
});
test('existing rain blocks forced storm and storm blocks paid weather drum before debit',()=>{
  const blocked=setupHub({storm:true,devStorm:true});login(blocked.hub,'RainFirst');blocked.hub.lobby.weather.startRain(0);steps(blocked.hub,601);
  assert.equal(blocked.hub.lobby.storm?.view().phase,'idle');
  const {hub}=setupHub({storm:true,devStorm:true,fish2:true});const a=login(hub,'NoDrum');a.c.profile!.tokens=1000;steps(hub,601);
  placeAt(hub,a.c,FISHER_USE.x,FISHER_USE.z);hub.onJson(a.c,{t:'fishNpc',a:'rain'});
  assert.equal(a.c.profile!.tokens,1000);assert.equal(hub.lobby.weather.rain,false);assert.match(lastOf(a.s,'fishNpc')?.message??'',/событи/);
});
test('pirate tail follows unchanged ball offset and menu viewer receives no actors',()=>{
  const {hub}=setupHub({pirates:true,devPirates:true});const a=login(hub,'RaidViewer');assert.ok(hub.lobby.pirates);
  steps(hub,600+PIRATE_WARN+2);assert.equal(hub.lobby.pirates.view().phase,'raid');
  const decode=()=>{const data=a.s.bins.at(-1)!;const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer;
    const head=makeHeader();assert.ok(decodeSnapshot(buffer,head,makeState(),[])>=0);const tail=emptyPirateTail();assert.equal(readPirateTail(buffer,head.tail+BALL_BYTES,tail),buffer.byteLength);return tail;};
  assert.equal(decode().visible,true);assert.ok(decode().pirates.length>0);
  hub.onJson(a.c,{t:'lobbyMenu',open:true});steps(hub,2);assert.equal(decode().visible,false);assert.equal(decode().pirates.length,0);
  hub.onJson(a.c,{t:'lobbyMenu',open:false});steps(hub,2);assert.equal(decode().visible,true);
});
