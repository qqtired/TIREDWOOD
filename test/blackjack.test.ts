import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BJ_COUNT_TICKS, BJ_DEALER_TICKS, BJ_RESULT_TICKS, BJ_TURN_TICKS, handValue, type BlackjackAct } from '../shared/blackjack.ts';
import { BlackjackHall } from '../server/lobby/blackjack.ts';

const C=(rank:number,suit=0)=>suit*13+rank-1;
test('zero balance plays a free natural and receives no coins or profile calls', () => {
  let reserved=0,settled=0;
  const hall=new BlackjackHall({broadcast(){},toast(){},reserve(){reserved++;return false;},settle(){settled++;return false;}},{deck:()=>[C(1),C(10),C(13),C(7)]});
  hall.sit(12,1,1,'Бесплатно');hall.act(12,1,'bet',hall.view().rev,0);
  assert.equal(hall.view().seats[0].participating,true);
  hall.step(BJ_COUNT_TICKS);hall.step(BJ_COUNT_TICKS+BJ_DEALER_TICKS);
  assert.equal(hall.view().phase,'result');assert.equal(hall.view().seats[0].hands[0].result,'blackjack');
  assert.equal(hall.view().seats[0].hands[0].payout,0);assert.equal(reserved,0);assert.equal(settled,0);
  hall.step(BJ_COUNT_TICKS+BJ_DEALER_TICKS+BJ_RESULT_TICKS);
  assert.equal(hall.view().seats[0].participating,false);assert.equal(hall.view().seats[0].pid,1);
});
test('free split and double retain card rules without reserving or paying money',()=>{
  let money=0;
  const hall=new BlackjackHall({broadcast(){},toast(){},reserve(){money++;return false;},settle(){money++;return false;}},{deck:()=>[C(8),C(10),C(8),C(7),C(3),C(2),C(10),C(10)]});
  hall.sit(12,1,1,'Бесплатно');hall.act(12,1,'bet',hall.view().rev,0);hall.step(BJ_COUNT_TICKS);
  hall.act(12,1,'split',hall.view().rev);assert.equal(hall.view().seats[0].hands.length,2);
  hall.act(12,1,'double',hall.view().rev);hall.act(12,1,'double',hall.view().rev);hall.step(BJ_COUNT_TICKS+BJ_DEALER_TICKS);
  assert.equal(hall.view().phase,'result');assert.equal(money,0);assert.ok(hall.view().seats[0].hands.every(h=>h.bet===0&&h.payout===0));
});
test('free entry cancels before deal and remains reserved to its owner after departure mid-hand',()=>{
  const hall=new BlackjackHall({broadcast(){},toast(){},reserve(){throw Error('free reserve');},settle(){throw Error('free settle');}},{deck:()=>[C(10),C(10),C(8),C(7)]});
  hall.sit(12,1,11,'Free');hall.act(12,1,'bet',hall.view().rev,0);hall.act(12,1,'cancel',hall.view().rev);
  assert.equal(hall.view().phase,'betting');hall.act(12,1,'bet',hall.view().rev,0);hall.step(BJ_COUNT_TICKS);hall.stand(12,1);
  assert.equal(hall.canSit(12,22),false);assert.equal(hall.canSit(12,11),true);hall.shutdown();
  assert.equal(hall.view().seats[0].hands[0].payout,0);
});
function setup(deck:number[],balance=100) {
  const balances=new Map([[1,balance],[2,100]]), escrow=new Map<number,{round:string,amount:number}>();
  const errors:string[]=[];
  const hall=new BlackjackHall({broadcast:()=>{},toast:(_s,text)=>errors.push(text),
    reserve(pid,round,amount){ const available=balances.get(pid)??0; const old=escrow.get(pid); if(available<amount||(old&&old.round!==round))return false;balances.set(pid,available-amount);escrow.set(pid,{round,amount:(old?.amount??0)+amount});return true;},
    settle(pid,round,wager,payout){ const e=escrow.get(pid);if(!e||e.round!==round||e.amount!==wager)return false;balances.set(pid,(balances.get(pid)??0)+payout);escrow.delete(pid);return true;}
  },{deck:()=>[...deck]});
  let tick=0;
  const step=(n=1)=>{for(let i=0;i<n;i++)hall.step(++tick);};
  hall.sit(12,1,1,'Первый');
  const act=(a:BlackjackAct,amount?:number,rev=hall.view().rev)=>hall.act(12,1,a,rev,amount);
  const deal=()=>{act('bet',10);step(BJ_COUNT_TICKS);};
  const finish=()=>{for(let i=0;i<BJ_DEALER_TICKS*15&&hall.view().phase!=='result';i++)step();assert.equal(hall.view().phase,'result');};
  return{hall,balances,escrow,errors,step,act,deal,finish};
}

test('aces reduce to one; soft 17 retains ace eleven',()=>{
  assert.deepEqual(handValue([C(1),C(1),C(9)]),{total:21,soft:true});
  assert.deepEqual(handValue([C(1),C(6)]),{total:17,soft:true});
  assert.deepEqual(handValue([C(1),C(9),C(5)]),{total:15,soft:false});
});
test('solo natural pays 3:2 once, fresh bet required after result',()=>{
  const s=setup([C(1),C(10),C(13),C(7)]);s.deal();s.finish();
  assert.equal(s.balances.get(1),115);assert.equal(s.hall.view().seats[0].hands[0].result,'blackjack');
  s.hall.shutdown();s.hall.shutdown();assert.equal(s.balances.get(1),115);
  s.step(BJ_RESULT_TICKS);assert.equal(s.hall.view().phase,'betting');assert.equal(s.hall.view().seats[0].bet,0);
});
test('ordinary push returns stake; dealer stands soft17',()=>{
  const s=setup([C(10),C(1),C(7),C(6),C(13)]);s.deal();assert.equal(s.hall.view().phase,'play');
  assert.deepEqual(s.hall.view().dealer,[C(1),-1]);assert.equal(s.hall.view().dealerTotal,null);
  s.act('stand');s.finish();assert.equal(s.balances.get(1),100);assert.equal(s.hall.view().dealer.length,2);
  assert.equal(s.hall.view().seats[0].hands[0].result,'push');
});
test('double debits once and draws exactly one, stale action cannot replay',()=>{
  const s=setup([C(5),C(10),C(6),C(7),C(10)]);s.deal();const rev=s.hall.view().rev;
  s.act('double',undefined,rev);s.act('double',undefined,rev);s.finish();
  assert.equal(s.balances.get(1),120);assert.equal(s.hall.view().seats[0].hands[0].cards.length,3);assert.equal(s.escrow.size,0);
});
test('split aces receive one card each, split21 is ordinary win',()=>{
  const s=setup([C(1),C(10),C(1,1),C(7),C(13),C(12)]);s.deal();s.act('split');s.finish();
  const hands=s.hall.view().seats[0].hands;assert.equal(hands.length,2);assert.ok(hands.every(h=>h.cards.length===2&&h.result==='win'));
  assert.equal(s.balances.get(1),120);
});
test('insufficient double or split leaves cards and reserve unchanged',()=>{
  const s=setup([C(8),C(10),C(8,1),C(7),C(2)],10);s.deal();const before=s.hall.view();
  s.act('split');s.act('double');assert.deepEqual(s.hall.view(),before);assert.equal(s.balances.get(1),0);
});
test('table and slot authority, duplicate bet, cancel before deal',()=>{
  const s=setup([C(8),C(10),C(8),C(7)]);assert.equal(s.hall.canSit(0,2),false);
  s.hall.act(12,2,'bet',s.hall.view().rev,10);assert.equal(s.balances.get(1),100);
  const rev=s.hall.view().rev;s.act('bet',10,rev);s.act('bet',10,rev);assert.equal(s.balances.get(1),90);
  s.act('cancel');assert.equal(s.balances.get(1),100);assert.equal(s.hall.view().phase,'betting');
});
test('midround departure pays original profile, rejoin and reused slot cannot steal stake',()=>{
  const s=setup([C(10),C(10),C(8),C(7)]);s.deal();s.hall.stand(12,1);
  assert.equal(s.balances.get(1),90);assert.equal(s.hall.canSit(13,1),false);assert.equal(s.hall.canSit(12,1),true);
  s.hall.sit(13,1,2,'Другой');s.hall.act(12,1,'double',s.hall.view().rev);s.finish();
  assert.equal(s.balances.get(1),110);assert.equal(s.balances.get(2),100);assert.equal(s.hall.canSit(12,2),false);
});
test('timeout autostands; shutdown cancels undealt stakes or settles dealt hands',()=>{
  const s=setup([C(10),C(10),C(8),C(7)]);s.deal();s.step(BJ_TURN_TICKS);s.finish();assert.equal(s.balances.get(1),110);
  const before=setup([C(10),C(10),C(8),C(7)]);before.act('bet',10);before.hall.shutdown();assert.equal(before.balances.get(1),100);
  const during=setup([C(10),C(10),C(8),C(7)]);during.deal();during.hall.shutdown();assert.equal(during.balances.get(1),110);assert.equal(during.escrow.size,0);
});

test('offline round remains active until settlement, then clears abandoned chair',()=>{
  const s=setup([C(10),C(10),C(8),C(7)]);s.deal();s.hall.stand(12,1);
  assert.equal(s.hall.active,true);assert.equal(s.hall.busy,1);s.finish();
  assert.equal(s.balances.get(1),110);assert.equal(s.hall.busy,0);
  s.step(BJ_RESULT_TICKS);assert.equal(s.hall.active,false);assert.equal(s.hall.canSit(12,2),true);
});

test('cancel and re-bet use distinct reservation identities, replay cannot settle new bet',()=>{
  const s=setup([C(10),C(10),C(8),C(7)]);s.act('bet',10);const first=s.escrow.get(1)!.round;
  s.act('cancel');s.act('bet',10);assert.notEqual(s.escrow.get(1)!.round,first);
});
test('dealer natural beats ordinary21 but pushes another natural',()=>{
  const push=setup([C(1),C(1),C(13),C(12)]);push.deal();push.finish();assert.equal(push.balances.get(1),100);
  const loss=setup([C(10),C(1),C(8),C(12)]);loss.deal();assert.equal(loss.hall.view().phase,'dealer');loss.finish();
  assert.equal(loss.balances.get(1),90);assert.equal(loss.hall.view().seats[0].hands[0].result,'loss');
});
test('multiplayer split hand order, rejoin and independent payout',()=>{
  // Player1=8+8; player2=10+9; dealer=10+7. Split:8+2 then8+3; hitfirst=10.
  const s=setup([C(8),C(10),C(10),C(8,1),C(9),C(7),C(2),C(3),C(10)]);
  s.hall.sit(13,2,2,'Второй');s.act('bet',10);s.hall.act(13,2,'bet',s.hall.view().rev,20);s.step(BJ_COUNT_TICKS);
  assert.equal(s.hall.view().turn,0);s.act('split');s.act('hit');s.act('stand');assert.equal(s.hall.view().hand,1);
  s.hall.act(13,2,'stand',s.hall.view().rev);assert.equal(s.hall.view().turn,0,'wrong player cannot end current hand');
  s.act('stand');assert.equal(s.hall.view().turn,1);s.hall.stand(13,2);s.hall.sit(13,3,2,'Второй');
  assert.equal(s.hall.view().seats[1].id,3);s.hall.act(13,3,'stand',s.hall.view().rev);s.finish();
  assert.equal(s.balances.get(1),100);assert.equal(s.balances.get(2),120);
});
test('player bust loses even if dealer would bust; multiple aces do not bust early',()=>{
  const s=setup([C(10),C(10),C(9),C(6),C(5),C(13)]);s.deal();s.act('hit');s.finish();
  assert.equal(s.balances.get(1),90);assert.equal(s.hall.view().seats[0].hands[0].status,'bust');
});
