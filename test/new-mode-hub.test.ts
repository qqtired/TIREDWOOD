import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOAT_RACE_CIRCLE, HIDE_CIRCLE } from '../shared/maps/lobby.ts';
import { ACT_REGATTA, KART_COUNT_TICKS, KART_CHECK_EVERY } from '../shared/lobby.ts';
import { RG_GATHER_TICKS, RG_GRID_TICKS } from '../shared/regatta.ts';
import { HIDE_COUNT_TICKS, HIDE_PREP_TICKS, HIDE_REJOIN_TICKS, HIDE_RESULT_TICKS } from '../shared/hide.ts';
import { lastOf, login, placeAt, setupHub, steps } from './kit.ts';

test('new rooms are absent unless flags enabled',()=>{
  const {hub}=setupHub();const a=login(hub,'FlagOff');assert.ok(hub.boatrace===false&&hub.hide===null&&hub.lobby.regatta===null);
  assert.equal(lastOf(a.s,'lobby')?.regatta,undefined);assert.equal(lastOf(a.s,'lobby')?.hide,undefined);
});
test('solo regatta starts in the lobby itself, quitting returns outside circle',()=>{
  const {hub}=setupHub({boatrace:true});const a=login(hub,'BoatSolo');assert.ok(hub.boatrace&&hub.lobby.regatta);
  assert.ok(lastOf(a.s,'lobby')?.regatta);
  placeAt(hub,a.c,BOAT_RACE_CIRCLE.x,BOAT_RACE_CIRCLE.z);steps(hub,RG_GATHER_TICKS+KART_CHECK_EVERY+1);
  const p=hub.lobby.playerOf(a.c)!;
  assert.equal(a.c.room?.kind,'lobby');assert.equal(p.action,ACT_REGATTA);assert.ok(lastOf(a.s,'rg'));assert.equal(hub.health().boatrace,1);
  steps(hub,RG_GRID_TICKS+60);hub.onJson(a.c,{t:'rg',a:'quit'});assert.equal(hub.lobby.regatta!.phase,'idle');
  assert.ok(Math.hypot(p.state.x-BOAT_RACE_CIRCLE.x,p.state.z-BOAT_RACE_CIRCLE.z)>BOAT_RACE_CIRCLE.r);
  assert.equal(a.c.profile!.stats.brRaces,1);assert.equal(a.c.profile!.stats.brWins,0);
});
test('hide queue needs two; disconnected active round keeps stepping to finite cancellation',()=>{
  const {hub}=setupHub({hide:true});const a=login(hub,'HiddenA'),b=login(hub,'HiddenB');assert.ok(hub.hide);
  placeAt(hub,a.c,HIDE_CIRCLE.x,HIDE_CIRCLE.z);steps(hub,KART_COUNT_TICKS+KART_CHECK_EVERY);assert.equal(a.c.room?.kind,'lobby');
  placeAt(hub,b.c,HIDE_CIRCLE.x,HIDE_CIRCLE.z);steps(hub,KART_COUNT_TICKS+KART_CHECK_EVERY+1);
  assert.equal(a.c.room?.kind,'hide');assert.equal(b.c.room?.kind,'hide');assert.ok(lastOf(a.s,'hide_state'));
  steps(hub,HIDE_COUNT_TICKS+1);assert.equal(hub.hide.status().phase,'hide');assert.equal(hub.health().busy,2);
  hub.disconnect(a.c);hub.disconnect(b.c);assert.equal(hub.active,true);
  steps(hub,HIDE_PREP_TICKS+HIDE_REJOIN_TICKS+HIDE_RESULT_TICKS+10);assert.equal(hub.hide.active,false);assert.equal(hub.active,false);
});
test('E during an active hide round makes profile reclaim reachable after reconnect',()=>{
  const {hub}=setupHub({hide:true});const a=login(hub,'RejoinHideA'),b=login(hub,'RejoinHideB');assert.ok(hub.hide);
  for(const p of [a,b])placeAt(hub,p.c,HIDE_CIRCLE.x,HIDE_CIRCLE.z);
  steps(hub,KART_COUNT_TICKS+KART_CHECK_EVERY+HIDE_COUNT_TICKS+2);
  const old=hub.hide.playerOf(a.c)!;const role=old.role;hub.disconnect(a.c);
  const again=login(hub,'RejoinHideA',a.key);steps(hub,121);
  const portal=hub.lobby.map.interact.find(i=>i.kind==='hide')!;placeAt(hub,again.c,portal.x,portal.z);hub.onJson(again.c,{t:'use',id:portal.id});
  assert.equal(again.c.room?.kind,'hide');assert.equal(hub.hide.playerOf(again.c)?.id,old.id);assert.equal(hub.hide.playerOf(again.c)?.role,role);
});
