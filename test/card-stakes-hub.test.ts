import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoMove, DK_COUNT_TICKS } from '../shared/durak.ts';
import { BJ_COUNT_TICKS, BJ_DEALER_TICKS } from '../shared/blackjack.ts';
import { xpForLevel } from '../shared/levels.ts';
import { allOf, lastOf, login, placeAt, setupHub, steps } from './kit.ts';

test('real Hub Durak batch reserves once and credits XP only on conserved net profit',()=>{
  const {hub}=setupHub({durakDeck:()=>Array.from({length:36},(_,i)=>i)});
  const players=[login(hub,'StakeA'),login(hub,'StakeB'),login(hub,'StakeC')];
  const before=players.map(p=>({tokens:p.c.profile!.tokens,xp:p.c.profile!.xp}));
  players.forEach((p,ch)=>{const it=hub.lobby.map.interact.find(i=>i.kind==='durak'&&i.arg===ch)!;placeAt(hub,p.c,it.x,it.z,it.y);hub.onJson(p.c,{t:'use',id:it.id});hub.onJson(p.c,{t:'durak',table:0,a:'stake',on:1});hub.onJson(p.c,{t:'durak',table:0,a:'ready',on:1});});
  assert.deepEqual(players.map(p=>p.c.profile!.tokens),before.map(p=>p.tokens));
  steps(hub,DK_COUNT_TICKS);assert.deepEqual(players.map(p=>p.c.profile!.tokens),before.map(p=>p.tokens-10));
  const table=hub.lobby.durak.table(0);
  for(let i=0;i<200000&&table.phase==='play';i++){
    for(const p of players){const seat=table.seats.find(s=>s.pid===p.c.pid)!;const move=autoMove(table.game!,seat.p);if(move)hub.onJson(p.c,{t:'durak',table:0,a:move.a,card:'card'in move?move.card:undefined,on:'on'in move?move.on:undefined});}
    hub.step();
  }
  assert.equal(table.phase,'result');const winner=table.order[table.result!.first];
  for(let ch=0;ch<players.length;ch++){
    assert.equal(players[ch].c.profile!.durakEscrow,null);
    assert.equal(players[ch].c.profile!.tokens,before[ch].tokens+(ch===winner?20:-10));
    assert.equal(players[ch].c.profile!.xp,before[ch].xp+(ch===winner?20:0));
  }
});
test('real Hub free Blackjack can win at zero balance without XP or escrow',()=>{
  const {hub}=setupHub({blackjackDeck:()=>[0,9,12,6]});const a=login(hub,'FreeBlackjack');a.c.profile!.tokens=0;const xp=a.c.profile!.xp;
  const it=hub.lobby.map.interact.find(i=>i.kind==='blackjack'&&i.arg===12)!;placeAt(hub,a.c,it.x,it.z,it.y);hub.onJson(a.c,{t:'use',id:it.id});
  hub.onJson(a.c,{t:'blackjack',table:2,a:'bet',rev:hub.lobby.blackjack.view().rev,amount:0});steps(hub,BJ_COUNT_TICKS+BJ_DEALER_TICKS);
  assert.equal(hub.lobby.blackjack.view().seats[0].hands[0].result,'blackjack');assert.equal(a.c.profile!.tokens,0);assert.equal(a.c.profile!.xp,xp);assert.equal(a.c.profile!.blackjackEscrow,null);
});
test('mode XP publishes one owner levelUp and milestone chat; other credits grant no XP',()=>{
  const {hub,profiles}=setupHub();const a=login(hub,'LevelMilestone'),b=login(hub,'LevelWitness');
  const p=a.c.profile!;p.xp=xpForLevel(5)-10;p.level=4;a.s.msgs.length=0;b.s.msgs.length=0;
  profiles.credit(p,20,'mode');assert.equal(p.level,5);assert.equal(allOf(a.s,'levelUp').length,1);assert.equal(allOf(b.s,'levelUp').length,0);
  assert.equal(lastOf(a.s,'me')?.level,5);assert.ok(allOf(b.s,'chat').some(m=>m.sys&&m.text.includes('Бронза')));
  const xp=p.xp;profiles.credit(p,500,'other');assert.equal(p.xp,xp);assert.equal(allOf(a.s,'levelUp').length,1);
});
