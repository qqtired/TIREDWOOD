import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
function setup(){const dir=mkdtempSync(path.join(tmpdir(),'opus-dk-money-'));const store=new Store(dir,{log:()=>{}});store.load();const profiles=new Profiles(store);const people=['Первый','Второй','Третий'].map((nick,i)=>{const r=profiles.login({key:`durak-escrow-test-key-${i}`,nick},'');assert.ok(r.ok);return r.profile;});return{dir,store,profiles,people,close(){store.close();rmSync(dir,{recursive:true,force:true});}};}

test('Durak batch reservation is all-or-nothing and duplicate reservation is rejected',()=>{
  const e=setup();try{const [a,b]=e.people;b.tokens=5;
    assert.equal(typeof e.profiles.reserveDurakBatch,'function');
    assert.equal(e.profiles.reserveDurakBatch('round',[{pid:a.id,amount:10},{pid:b.id,amount:10}]),false);assert.equal(a.tokens,100);assert.equal(a.durakEscrow,null);
    b.tokens=100;assert.equal(e.profiles.reserveDurakBatch('round',[{pid:a.id,amount:10},{pid:b.id,amount:20}]),true);
    assert.equal(e.profiles.reserveDurakBatch('round',[{pid:a.id,amount:10}]),false);assert.equal(a.tokens,90);assert.equal(b.tokens,80);
    const disk=JSON.parse(readFileSync(path.join(e.dir,'state.json'),'utf8'));assert.equal(disk.profiles[0].durakEscrow.amount,10);assert.equal(disk.profiles[1].tokens,80);
  }finally{e.close();}
});
test('Durak settlement conserves bank, pays once, grants XP only to net profit',()=>{
  const e=setup();try{const [a,b]=e.people;e.profiles.reserveDurakBatch('round',[{pid:a.id,amount:10},{pid:b.id,amount:20}]);
    assert.equal(e.profiles.settleDurak('round',[{pid:a.id,wager:10,payout:30}]),false);
    assert.equal(e.profiles.settleDurak('round',[{pid:a.id,wager:10,payout:31},{pid:b.id,wager:20,payout:0}]),false);
    const pay=[{pid:a.id,wager:10,payout:30},{pid:b.id,wager:20,payout:0}];assert.equal(e.profiles.settleDurak('round',pay),true);
    assert.equal(a.tokens,120);assert.equal(b.tokens,80);assert.equal(a.xp,20);assert.equal(b.xp,0);assert.equal(a.durakEscrow,null);
    assert.equal(e.profiles.settleDurak('round',pay),false);assert.equal(a.tokens+b.tokens,200);
  }finally{e.close();}
});
test('Durak refunds and separate Blackjack/Durak startup recovery never grant XP',()=>{
  const e=setup();try{const [a,b]=e.people;e.profiles.reserveDurakBatch('refund',[{pid:a.id,amount:10},{pid:b.id,amount:20}]);
    assert.equal(e.profiles.settleDurak('refund',[{pid:a.id,wager:10,payout:10},{pid:b.id,wager:20,payout:20}]),true);assert.equal(a.xp+b.xp,0);
    e.profiles.reserveDurakBatch('crash',[{pid:a.id,amount:20},{pid:b.id,amount:20}]);e.profiles.reserveBlackjack(a.id,'bj',10);
    const restarted=new Store(e.dir,{log:()=>{}});restarted.load();const ps=new Profiles(restarted);assert.equal(ps.byId(a.id)!.tokens,100);assert.equal(ps.byId(b.id)!.tokens,100);assert.equal(ps.byId(a.id)!.xp,0);
    restarted.close();const again=new Store(e.dir,{log:()=>{}});again.load();assert.equal(new Profiles(again).byId(a.id)!.tokens,100);again.close();
  }finally{e.close();}
});

test('level callback observes the fully persisted Durak payout batch',()=>{
  const e=setup();try{const [a,b]=e.people;e.profiles.credit(a,139,'mode');e.profiles.reserveDurakBatch('level',[{pid:a.id,amount:10},{pid:b.id,amount:20}]);
    let events=0;e.profiles.onLevel=(p,event)=>{events++;const disk=JSON.parse(readFileSync(path.join(e.dir,'state.json'),'utf8'));assert.equal(disk.profiles[0].xp,159);assert.equal(disk.profiles[1].durakEscrow,null);assert.equal(p.id,a.id);assert.equal(event.level,2);};
    assert.equal(e.profiles.settleDurak('level',[{pid:a.id,wager:10,payout:30},{pid:b.id,wager:20,payout:0}]),true);assert.equal(events,1);
  }finally{e.close();}
});
