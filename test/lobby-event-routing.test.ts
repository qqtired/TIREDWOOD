import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STORM_GOAL, STORM_WARN, STORM_RANK } from '../shared/storm.ts';
import { FISHER_USE } from '../shared/fishplaces.ts';
import { BTN_FIRE } from '../shared/sim.ts';
import { PIRATE_LOOT, PIRATE_WARN } from '../shared/pirates.ts';
import { allOf, hold, lastOf, login, placeAt, setupHub, steps } from './kit.ts';

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
test('набег пиратов по сети: вид, снимки и эффекты идут обычными JSON-сообщениями; ЛКМ красит у свободного игрока и не работает в меню; новичку приходит всё сразу',()=>{
  const {hub}=setupHub({pirates:true,devPirates:true});const a=login(hub,'RaidViewer'),b=login(hub,'MenuViewer');assert.ok(hub.lobby.pirates);
  assert.equal(allOf(a.s,'pirates').at(-1)?.v.phase,'idle','пришедшему до набега — тишина');
  steps(hub,600+PIRATE_WARN+2);assert.equal(hub.lobby.pirates.view().phase,'raid');
  const views=allOf(a.s,'pirates').map(m=>m.v.phase);assert.ok(views.includes('warn')&&views.at(-1)==='raid');
  assert.ok(allOf(a.s,'pfx').some(m=>m.e.some(e=>e[0]==='wave')),'волна объявлена');
  steps(hub,300);
  const snaps=allOf(a.s,'pnow');assert.ok(snaps.length>=20,`снимков ${snaps.length}`);assert.ok(snaps.some(m=>m.d.length>0),'шлюпки в снимке');
  // ЛКМ: у свободного — выстрел маркером, у открывшего меню — ничего
  const slotA=hub.lobby.playerOf(a.c)!.slot,slotB=hub.lobby.playerOf(b.c)!.slot;
  hub.onJson(b.c,{t:'lobbyMenu',open:true});
  hold(hub,[a.c,b.c],BTN_FIRE,130);
  const shots=(slot:number)=>allOf(a.s,'pfx').flatMap(m=>m.e).filter(e=>e[0]==='pt'&&e[1]===slot).length;
  assert.ok(shots(slotA)>=3,`выстрелов ${shots(slotA)}`);assert.equal(shots(slotB),0);
  // кто вошёл посреди набега: вид, всё на экране и вся добыча — в первом же пакете
  const late=login(hub,'LateGuest','late-guest-key-0000001','10.0.0.2');
  assert.equal(lastOf(late.s,'pirates')?.v.phase,'raid');assert.equal(lastOf(late.s,'pnow')?.l?.length,PIRATE_LOOT);
});
test('команда /pirates: только у разработчика (DEV_GO), запускает анонс и прерывается; без флага PIRATES — понятный отказ',()=>{
  const off=setupHub({pirates:true});off.hub.gate.devGo=false;const a=login(off.hub,'NotDev');
  off.hub.onJson(a.c,{t:'chat',text:'/pirates'});assert.equal(off.hub.lobby.pirates!.view().phase,'idle','обычный игрок набег не запускает');
  const dev=setupHub({pirates:true});dev.hub.gate.devGo=true;const d=login(dev.hub,'DevOne');
  dev.hub.onJson(d.c,{t:'chat',text:'/pirates'});assert.equal(dev.hub.lobby.pirates!.view().phase,'warn');assert.match(lastOf(d.s,'toast')?.text??'',/30 секунд/);
  steps(dev.hub,5);dev.hub.onJson(d.c,{t:'chat',text:'/pirates stop'});assert.equal(dev.hub.lobby.pirates!.view().phase,'idle');
  const none=setupHub();none.hub.gate.devGo=true;const n=login(none.hub,'NoFlag');none.hub.onJson(n.c,{t:'chat',text:'/pirates'});assert.match(lastOf(n.s,'toast')?.text??'',/PIRATES/);
});
