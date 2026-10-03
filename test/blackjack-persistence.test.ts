import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';

test('blackjack reservation survives disk reload, startup refunds once and keeps fishing progress', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-bj-'));
  const store = new Store(dir, { log: () => {} }); store.load();
  try {
    const profiles = new Profiles(store);
    const r = profiles.login({key:'blackjack-profile-key-001',nick:'Игрок'}, ''); assert.ok(r.ok);
    const p = r.profile; p.tokens = 100; p.fishing.xp = 375; p.owned.push('p:gold'); p.stats.fsCaught = 17;
    assert.equal(typeof profiles.reserveBlackjack, 'function', 'reservation is a real profile operation');
    assert.equal(profiles.reserveBlackjack(p.id, 'round-a', 20), true);
    const saved = JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).profiles[0];
    assert.equal(saved.tokens, 80); assert.deepEqual(saved.blackjackEscrow, {round:'round-a',amount:20});
    assert.equal(profiles.reserveBlackjack(p.id, 'wrong-round', 10), false);
    assert.equal(profiles.reserveBlackjack(p.id, 'round-a', 200), false);
    const restarted = new Store(dir, { log: () => {} }); restarted.load();
    const recovered = new Profiles(restarted).byId(p.id)!;
    assert.equal(recovered.tokens, 100); assert.equal(recovered.blackjackEscrow, null);
    assert.equal(recovered.fishing.xp, 375); assert.equal(recovered.stats.fsCaught, 17); assert.ok(recovered.owned.includes('p:gold'));
    const again = new Store(dir, { log: () => {} }); again.load();
    assert.equal(new Profiles(again).byId(p.id)!.tokens, 100);
    restarted.close(); again.close();
  } finally { store.close(); rmSync(dir, {recursive:true,force:true}); }
});

test('settlement checks round and exact reservation, clears escrow and pays only once', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'opus-bj-')); const store=new Store(dir,{log:()=>{}}); store.load();
  try {
    const profiles=new Profiles(store); const r=profiles.login({key:'blackjack-profile-key-002',nick:'Игрок'},''); assert.ok(r.ok);
    const p=r.profile; p.tokens=100;
    assert.equal(typeof profiles.reserveBlackjack,'function');
    assert.equal(profiles.reserveBlackjack(p.id,'round-b',10),true);
    assert.equal(profiles.reserveBlackjack(p.id,'round-b',10),true);
    assert.equal(profiles.settleBlackjack(p.id,'round-b',10,40),false);
    assert.equal(profiles.settleBlackjack(p.id,'old',20,40),false);
    assert.equal(profiles.settleBlackjack(p.id,'round-b',20,40),true);
    assert.equal(p.tokens,120); assert.equal(p.blackjackEscrow,null);
    assert.equal(profiles.settleBlackjack(p.id,'round-b',20,40),false); assert.equal(p.tokens,120);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});

test('settled payout is durable: reload never refunds an already paid reserve', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'opus-bj-')); const store=new Store(dir,{log:()=>{}});store.load();
  try {
    const profiles=new Profiles(store);const r=profiles.login({key:'blackjack-profile-key-003',nick:'Игрок'},'');assert.ok(r.ok);
    const p=r.profile;p.tokens=100;
    assert.equal(profiles.reserveBlackjack(p.id,'natural',10),true);
    assert.equal(profiles.settleBlackjack(p.id,'natural',10,25),true);
    const restarted=new Store(dir,{log:()=>{}});restarted.load();const fresh=new Profiles(restarted);assert.equal(fresh.byId(p.id)!.tokens,115);
    assert.equal(fresh.reserveBlackjack(p.id,'next-bet',10),true);
    assert.equal(fresh.settleBlackjack(p.id,'natural',10,25),false);assert.equal(fresh.byId(p.id)!.tokens,105);
    assert.equal(fresh.settleBlackjack(p.id,'next-bet',10,10),true);restarted.close();
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
