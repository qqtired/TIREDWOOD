import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoMove, DK_COUNT_TICKS, DK_AWAY_TICKS } from '../shared/durak.ts';
import { BJ_COUNT_TICKS, BJ_DEALER_TICKS } from '../shared/blackjack.ts';
import { DurakHall } from '../server/lobby/durak.ts';
import { BlackjackHall } from '../server/lobby/blackjack.ts';
import { login, setupHub } from './kit.ts';

function durak() {
 const {hub,profiles,store}=setupHub();const people=['ReviewerA','ReviewerB','ReviewerC','SlotReplacement'].map(n=>login(hub,n).c.profile!);
 const reserves: {pid:number;amount:number}[][]=[];let payouts=0,tick=0;
 const hall=new DurakHall({send(){},broadcast(){},event(){},toast(){},finished(){},
  reserve(round,bets){reserves.push(bets.map(b=>({...b})));return profiles.reserveDurakBatch(round,bets);},
  settle(round,pay){payouts++;return profiles.settleDurak(round,pay);},
 },{deck:()=>Array.from({length:36},(_,i)=>i),rand:()=>0});
 for(let ch=0;ch<3;ch++)hall.sit(ch,ch+1,people[ch].id,people[ch].nick);
 const step=(n=61)=>hall.step(tick+=n);
 const act=(ch:number,a:string,on?:number)=>hall.act(ch,ch+1,a,undefined,on);
 const start=(paid:number[])=>{for(const ch of paid)act(ch,'stake',1);for(let ch=0;ch<3;ch++)act(ch,'ready',1);step(DK_COUNT_TICKS);};
 const finish=()=>{
  const table=hall.table(0);
  for(let i=0;i<10000&&table.phase==='play';i++){
   for(let ch=0;ch<table.seats.length;ch++){
    const s=table.seats[ch];if(s.k!==1||!s.slot||s.p<0)continue;
    const m=autoMove(table.game!,s.p);if(m)hall.act(ch,s.slot,m.a,'card'in m?m.card:undefined,'on'in m?m.on:undefined);
   }step();
  }
  assert.equal(table.phase,'result');return table.order[table.result!.first];
 };
 return{people,profiles,store,hall,step,act,start,finish,reserves,payouts:()=>payouts};
}

test('review: played free winner refunds every bettor with real durable profiles and no XP',()=>{
 const probe=durak();probe.start([]);const freeWinner=probe.finish();
 assert.ok(probe.people.every(p=>p.tokens===100&&p.xp===0));assert.equal(probe.reserves.length,0);
 const e=durak();e.people[freeWinner].tokens=0;e.start([0,1,2].filter(ch=>ch!==freeWinner));
 assert.equal(e.finish(),freeWinner);assert.equal(e.people[freeWinner].tokens,0);
 for(let i=0;i<3;i++){assert.equal(e.people[i].tokens,i===freeWinner?0:100);assert.equal(e.people[i].xp,0);assert.equal(e.people[i].durakEscrow,null);}
 e.hall.shutdown();assert.equal(e.payouts(),1);
});

test('review: a lone bettor can never mint a profit, irrespective of which chair finishes first',()=>{
 for(let bettor=0;bettor<3;bettor++){
  const e=durak();e.start([bettor]);assert.equal(e.people[bettor].tokens,90);e.finish();
  assert.ok(e.people.every(p=>p.tokens===100&&p.xp===0));assert.equal(e.reserves.length,1);assert.equal(e.reserves[0].length,1);
 }
});

test('review: consent can be revoked before deal and insufficient batch reserve never partially debits',()=>{
 const e=durak();e.act(0,'stake',1);for(let i=0;i<3;i++)e.act(i,'ready',1);
 assert.equal(e.hall.table(0).phase,'count');assert.equal(e.reserves.length,0);
 e.act(0,'stake',0);assert.equal(e.hall.table(0).phase,'wait');e.act(0,'ready',1);e.step(DK_COUNT_TICKS);
 assert.equal(e.hall.table(0).phase,'play');assert.equal(e.reserves.length,0);assert.ok(e.people.every(p=>p.tokens===100));
 const insufficient=durak();insufficient.people[1].tokens=0;insufficient.start([0,1]);
 assert.equal(insufficient.hall.table(0).phase,'wait');assert.equal(insufficient.hall.table(0).game,null);
 assert.equal(insufficient.people[0].tokens,100);assert.equal(insufficient.people[1].tokens,0);assert.ok(insufficient.people.every(p=>p.durakEscrow===null));
});

test('review: original Durak reservation survives slot reuse and reconnect; all-away cancellation refunds once',()=>{
 const e=durak();e.start([0,1]);const reserved=e.people[0].durakEscrow;
 e.hall.stand(0,1);assert.equal(e.hall.canSit(0,e.people[3].id),false);
 e.hall.sit(3,1,e.people[3].id,e.people[3].nick); // Old network/lobby slot now belongs to a different profile.
 e.hall.sit(0,22,e.people[0].id,e.people[0].nick);
 assert.deepEqual(e.people[0].durakEscrow,reserved);assert.equal(e.reserves.length,1);
 const winner=e.finish();assert.ok(winner>=0);
 assert.equal(e.people[3].tokens,100);assert.equal(e.people[3].xp,0);
 assert.equal(e.people.reduce((sum,p)=>sum+p.tokens,0),400);
 assert.ok(e.people.every(p=>p.durakEscrow===null));
 const away=durak();away.start([0,1,2]);for(let ch=0;ch<3;ch++)away.hall.stand(ch,ch+1);
 away.step(DK_AWAY_TICKS+1);assert.equal(away.hall.table(0).phase,'wait');assert.equal(away.payouts(),1);
 away.hall.shutdown();away.step(DK_AWAY_TICKS+1);assert.equal(away.payouts(),1);assert.ok(away.people.every(p=>p.tokens===100&&p.xp===0));
});

test('review: free and paid Blackjack naturals never award general XP; zero bet has no escrow or money',()=>{
 for(const bet of[0,10]){
  const {hub,profiles}=setupHub(),p=login(hub,'BlackjackReview').c.profile!;p.tokens=bet;p.xp=99;
  const hall=new BlackjackHall({broadcast(){},toast(){},reserve:(pid,round,amount)=>profiles.reserveBlackjack(pid,round,amount),settle:(pid,round,wager,payout)=>profiles.settleBlackjack(pid,round,wager,payout)},{deck:()=>[0,9,12,6]});
  hall.sit(12,1,p.id,p.nick);hall.act(12,1,'bet',hall.view().rev,bet);hall.step(BJ_COUNT_TICKS);hall.step(BJ_COUNT_TICKS+BJ_DEALER_TICKS);
  assert.equal(hall.view().seats[0].hands[0].result,'blackjack');assert.equal(hall.view().seats[0].hands[0].payout,bet*2.5);
  assert.equal(p.tokens,bet*2.5);assert.equal(p.xp,99);assert.equal(p.blackjackEscrow,null);
  hall.shutdown();assert.equal(p.tokens,bet*2.5);assert.equal(p.xp,99);
 }
});

test('review: draw settlement returns the complete original bank without XP',()=>{
 const e=durak();e.start([0,1,2]);const table=e.hall.table(0);
 // Inject the terminal game outcome to isolate the money boundary; move legality is covered by the Durak engine tests.
 table.game!.fool=-1;table.game!.out=[];table.game!.over=true;
 (e.hall as unknown as {finishGame(t:typeof table):void}).finishGame(table);
 assert.equal(table.phase,'result');assert.ok(e.people.every(p=>p.tokens===100&&p.xp===0&&p.durakEscrow===null));
 assert.deepEqual(table.result!.payouts?.map(p=>p.payout),[10,10,10]);assert.equal(e.payouts(),1);
 e.hall.shutdown();assert.equal(e.payouts(),1);
});

test('review: real bot joins the round without ever entering its paid reservation ledger',()=>{
 // бот — только для игры одному: двое встают, остаётся один человек
 const e=durak();e.hall.stand(1,2);e.hall.stand(2,3);e.act(0,'bot');
 assert.ok(e.hall.table(0).seats.some(s=>s.k===2));e.start([0]);e.finish();
 assert.equal(e.reserves.length,1);assert.deepEqual(new Set(e.reserves[0].map(p=>p.pid)),new Set([e.people[0].id]));
 assert.equal(e.people.reduce((sum,p)=>sum+p.tokens,0),400);
 const totalXp=e.people.reduce((sum,p)=>sum+p.xp,0);assert.ok(totalXp===0||totalXp===10);
 assert.ok(e.people.every(p=>p.durakEscrow===null));
});
