import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoMove, DK_COUNT_TICKS, DK_RESULT_TICKS } from '../shared/durak.ts';
import { DurakHall } from '../server/lobby/durak.ts';

function setup() {
  const balances=new Map([[1,100],[2,100],[3,100]]); let reserves=0,settles=0;
  const hall=new DurakHall({send(){},broadcast(){},event(){},toast(){},finished(){},
    reserve(round,bets){reserves++;if(bets.some(b=>(balances.get(b.pid)??0)<b.amount))return false;for(const b of bets)balances.set(b.pid,balances.get(b.pid)!-b.amount);return !!round;},
    settle(_round,payouts){settles++;for(const p of payouts)balances.set(p.pid,balances.get(p.pid)!+p.payout);return true;}
  },{deck:()=>Array.from({length:36},(_,i)=>i),rand:()=>0});
  let tick=0; const step=(n=61)=>hall.step(tick+=n);
  for(let ch=0;ch<3;ch++)hall.sit(ch,ch+1,ch+1,`Player${ch}`);
  const act=(ch:number,a:string,on?:number)=>hall.act(ch,ch+1,a,undefined,on);
  const start=(paid:number[])=>{paid.forEach(ch=>act(ch,'stake',1));for(let ch=0;ch<3;ch++)act(ch,'ready',1);step(DK_COUNT_TICKS);};
  const finish=()=>{const tb=hall.table(0);for(let i=0;i<10000&&tb.phase==='play';i++){for(const s of tb.seats){if(s.k!==1||!s.slot||s.p<0)continue;const m=autoMove(tb.game!,s.p);if(m)hall.act(tb.seats.indexOf(s),s.slot,m.a,'card'in m?m.card:undefined,'on'in m?m.on:undefined);}step();}assert.equal(tb.phase,'result');return tb.order[tb.result!.first];};
  return{hall,balances,act,start,finish,step,counts:()=>({reserves,settles})};
}
test('free Durak players with zero balance can finish without monetary hooks',()=>{
  const s=setup();s.balances.forEach((_,id)=>s.balances.set(id,0));s.start([]);s.finish();
  assert.deepEqual(s.counts(),{reserves:0,settles:0});assert.equal([...s.balances.values()].reduce((a,b)=>a+b),0);
});
test('ante is host-only, resets consent and money reserves only at deal',()=>{
  const s=setup();s.act(1,'ante',50);assert.equal(s.hall.table(0).ante,10);
  s.act(0,'stake',1);s.act(0,'ready',1);s.act(1,'ready',1);s.act(2,'ready',1);
  assert.equal(s.counts().reserves,0);s.act(0,'ante',20);
  assert.equal(s.hall.table(0).phase,'wait');assert.ok(s.hall.table(0).seats.filter(x=>x.k===1).every(x=>!x.ready));
  for(let ch=0;ch<3;ch++)s.act(ch,'ready',1);s.step(DK_COUNT_TICKS);
  assert.equal(s.counts().reserves,1);assert.equal(s.balances.get(1),80);assert.equal(s.hall.view(0).bank,20);
});
test('failed batch reserve deals no cards and spends no participant balance',()=>{
  const s=setup();s.balances.set(2,0);s.start([0,1]);
  assert.equal(s.hall.table(0).phase,'wait');assert.equal(s.hall.table(0).game,null);assert.equal(s.balances.get(1),100);
});
test('only a staked first finisher receives bank; total money conserved and payout once',()=>{
  const s=setup();s.start([0,1,2]);const first=s.finish();
  assert.equal(s.balances.get(first+1),120);assert.equal([...s.balances.values()].reduce((a,b)=>a+b),300);
  assert.equal(s.counts().settles,1);s.step();s.hall.shutdown();assert.equal(s.counts().settles,1);
});
test('free first finisher earns no money and refunds all bettors',()=>{
  const probe=setup();probe.start([]);const free=probe.finish();
  const s=setup();s.start([0,1,2].filter(ch=>ch!==free));assert.equal(s.finish(),free);
  assert.deepEqual([...s.balances.values()],[100,100,100]);assert.equal(s.counts().settles,1);
});
test('rematch readiness never repeats paid opt-in automatically',()=>{
  const s=setup();s.start([0,1,2]);s.finish();assert.ok(s.hall.table(0).seats.every(x=>!x.stake));
  s.step();for(let ch=0;ch<3;ch++)s.act(ch,'ready',1);s.step(DK_RESULT_TICKS);s.step(DK_COUNT_TICKS);
  assert.equal(s.hall.table(0).phase,'play');assert.equal(s.counts().reserves,1);
});
test('shutdown refunds reserved Durak bank exactly once after players leave',()=>{
  const s=setup();s.start([0,1]);for(let ch=0;ch<3;ch++)s.hall.stand(ch,ch+1);
  assert.equal(s.hall.busy,2);assert.equal(s.hall.active,true);s.hall.shutdown();s.hall.shutdown();
  assert.deepEqual([...s.balances.values()],[100,100,100]);assert.equal(s.counts().settles,1);assert.equal(s.hall.busy,0);
});
