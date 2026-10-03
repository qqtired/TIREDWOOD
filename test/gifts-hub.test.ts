import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { DEVIL_GIFT_ITEMS } from '../shared/gifts.ts';
import { PROTOCOL_VERSION } from '../shared/constants.ts';
import { connect, lastOf, login, SMOKE } from './kit.ts';

const CODE='SYNTHETIC-GIFT-42';
function fixture(t: TestContext, enabled=true) {
  const dir=mkdtempSync(path.join(tmpdir(),'opus-gift-hub-'));
  const store=new Store(dir,{log:()=>{},saveDelayMs:60_000});store.load();const profiles=new Profiles(store);
  const hub=new Hub({store,profiles,smokeToken:SMOKE,build:'gift-test',giftCodeHash:enabled?createHash('sha256').update(CODE).digest('hex'):null,log:()=>{}});
  t.after(()=>{for(const c of hub.clients)hub.disconnect(c);store.close();rmSync(dir,{recursive:true,force:true});});
  return{dir,store,profiles,hub};
}
test('gift capability is server-gated; guest and ephemeral sessions cannot claim',t=>{
  const {hub}=fixture(t,false),a=login(hub,'GiftOff');assert.equal(lastOf(a.s,'me')?.gifts,undefined);
  hub.onJson(a.c,{t:'redeem',code:CODE});assert.equal(lastOf(a.s,'redeemResult')?.result,'disabled');assert.deepEqual(a.c.profile!.owned,[]);
  const enabled=fixture(t),guest=connect(enabled.hub);enabled.hub.onJson(guest.c,{t:'redeem',code:CODE});assert.equal(lastOf(guest.s,'redeemResult'),undefined);
  enabled.hub.onJson(guest.c,{t:'hello',v:PROTOCOL_VERSION,smoke:SMOKE});enabled.hub.onJson(guest.c,{t:'redeem',code:CODE});
  assert.equal(lastOf(guest.s,'me')?.gifts,undefined);assert.equal(lastOf(guest.s,'redeemResult'),undefined);
});
test('real Hub grants both hidden items to the sender without changing money, progress, or outfit',t=>{
  const {hub,profiles}=fixture(t),a=login(hub,'GiftOwner'),b=login(hub,'GiftOther');
  profiles.grant(a.c.profile!,'h:fisher');const before=structuredClone(a.c.profile!);
  assert.equal(profiles.buy(a.c.profile!,'h:devil'),'not_for_sale');
  hub.onJson(a.c,{t:'redeem',code:CODE,pid:b.c.pid});
  assert.equal(lastOf(a.s,'redeemResult')?.result,'granted');assert.equal(lastOf(a.s,'me')?.gifts,true);
  assert.deepEqual(a.c.profile,{...before,owned:[...before.owned,...DEVIL_GIFT_ITEMS]});assert.deepEqual(b.c.profile!.owned,[]);
  assert.deepEqual(lastOf(a.s,'me')?.owned,a.c.profile!.owned);
  hub.onJson(a.c,{t:'redeem',code:CODE});assert.equal(lastOf(a.s,'redeemResult')?.result,'already');assert.equal(a.c.profile!.owned.length,3);
});
test('gift entitlement and separately equipped slots survive reload with redemption disabled',t=>{
  const {dir,hub,profiles,store}=fixture(t),a=login(hub,'GiftSaved');hub.onJson(a.c,{t:'redeem',code:CODE});
  profiles.setOutfit(a.c.profile!,{...a.c.profile!.outfit,h:'devil',a:'deviltail'});store.flush();
  const again=new Store(dir,{log:()=>{}});again.load();const saved=again.state.profiles.find(p=>p.id===a.c.pid)!;
  assert.deepEqual(saved.owned,[...DEVIL_GIFT_ITEMS]);assert.equal(saved.outfit.h,'devil');assert.equal(saved.outfit.a,'deviltail');
  const off=new Hub({store:again,profiles:new Profiles(again),smokeToken:SMOKE,build:'gift-off',log:()=>{}});
  const rejoined=login(off,'GiftSaved',a.key);assert.equal(lastOf(rejoined.s,'me')?.gifts,undefined);assert.deepEqual(lastOf(rejoined.s,'me')?.owned,[...DEVIL_GIFT_ITEMS]);
  off.disconnect(rejoined.c);again.close();
});
test('redeem in another game room fails without granting or charging',t=>{
  const {hub}=fixture(t),a=login(hub,'GiftRoom');const tokens=a.c.profile!.tokens;
  hub.move(a.c,hub.paintball,true);hub.onJson(a.c,{t:'redeem',code:CODE});
  assert.equal(lastOf(a.s,'redeemResult')?.result,'unavailable');assert.deepEqual(a.c.profile!.owned,[]);assert.equal(a.c.profile!.tokens,tokens);
});
