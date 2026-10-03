import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { levelFromXp,xpForLevel,xpToNext,levelProgress,frameForLevel,legacyXp } from '../shared/levels.ts';
import { Profiles } from '../server/profiles.ts';
import { Store,normalizeProfile } from '../server/store.ts';
const legacy=JSON.parse(readFileSync(new URL('./fixtures/profile-before-progression.json',import.meta.url),'utf8'));

test('level curve and all frame boundaries; invalid XP cannot produce a level exploit',()=>{
  for(const [level,xp] of [[1,0],[2,140],[5,800],[15,5600],[30,20300],[50,53900]]){
    assert.equal(xpForLevel(level),xp);assert.equal(levelFromXp(xp),level);if(level>1)assert.equal(levelFromXp(xp-1),level-1);
  }
  assert.equal(xpToNext(1),140);assert.equal(xpToNext(15),700);
  assert.deepEqual(levelProgress(160),{level:2,xp:160,current:20,needed:180,from:140,next:320});
  for(const [level,tier] of [[1,'none'],[4,'none'],[5,'bronze'],[14,'bronze'],[15,'silver'],[29,'silver'],[30,'gold'],[49,'gold'],[50,'diamond']]) assert.equal(frameForLevel(level as number).id,tier);
  for(const xp of [-1,NaN,Infinity])assert.equal(levelFromXp(xp),1);
});
test('one hour model gives evening bronze, week silver, month gold without casino',()=>{
  assert.ok(levelFromXp(8*60)>=3);assert.ok(levelFromXp(15*60)<=5);
  assert.ok(xpForLevel(5)/(10*60)<2);assert.ok(xpForLevel(15)/(10*60)>7);assert.ok(xpForLevel(30)/(10*60)>25);
});
test('historical profile migration resets only authorized fishing skill and backfills general XP once',()=>{
  const p=normalizeProfile(legacy)!;assert.equal(p.xp,870);assert.equal(legacyXp(p.stats),870);assert.equal(p.level,5);
  assert.deepEqual(p.fishing,{xp:0,questsDone:0,questCaught:0,rod:0,beerUntil:1900000000000});
  for(const key of ['tokens','owned','outfit','album','createdAt','lastSeen','daily','foolUntil','epUntil','blackjackEscrow'] as const)assert.deepEqual(p[key],legacy[key],key);
  for(const [key,value] of Object.entries(legacy.stats))assert.equal(p.stats[key as keyof typeof p.stats],value,key);
  p.fishing={xp:123,questsDone:2,questCaught:4,rod:1,beerUntil:1900000000000};p.xp=1000;p.level=5;
  const again=normalizeProfile(JSON.parse(JSON.stringify(p)))!;assert.deepEqual(again,p);
});
test('mode credit earns XP once; other credits and Blackjack returns do not; event only crosses level',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'opus-levels-'));const store=new Store(dir,{log:()=>{}});store.load();
  try{
    const ps=new Profiles(store);const r=ps.login({key:'test-levels-profile-key-001',nick:'Игрок'},'');assert.ok(r.ok);const p=r.profile;
    const events:unknown[]=[];ps.onLevel=(who,event)=>events.push({pid:who.id,...event});
    ps.credit(p,1000);assert.equal(p.xp,0);ps.credit(p,139,'mode');assert.equal(events.length,0);ps.credit(p,1,'mode');
    assert.equal(events.length,1);assert.equal(p.level,2);assert.deepEqual((events[0] as {milestones:unknown[]}).milestones,[]);
    ps.credit(p,660,'mode');assert.equal(p.level,5);assert.equal(events.length,2);assert.equal((events[1] as {milestones:{id:string}[]}).milestones[0].id,'bronze');
    assert.equal(ps.reserveBlackjack(p.id,'bj',10),true);assert.equal(ps.settleBlackjack(p.id,'bj',10,25),true);assert.equal(p.xp,800);
    ps.credit(p,NaN,'mode');ps.credit(p,Infinity,'mode');ps.credit(p,-50,'mode');assert.equal(p.xp,800);
    assert.equal(p.fishing.xp,0);assert.equal(p.levelsVersion,1);assert.equal(p.fishingResetVersion,1);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('migration markers survive disk reload; new fishing progress and event cooldowns remain',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'opus-migration-'));const store=new Store(dir,{log:()=>{}});store.load();
  try{
    const migrated=normalizeProfile(legacy)!;store.state.profiles.push(migrated);
    store.state.lobbyEvents={stormAt:1000,piratesAt:2000,endedAt:3000,lockUntil:1803000};
    store.markDirty();store.flush();const second=new Store(dir,{log:()=>{}});second.load();const ps=new Profiles(second);
    const p=ps.byId(17)!;assert.equal(p.tokens,12365,'only pending Blackjack escrow refunded');assert.equal(p.xp,870);
    p.fishing={xp:77,questsDone:1,questCaught:3,rod:1,beerUntil:1900000000000};second.markDirty();second.flush();second.close();
    const third=new Store(dir,{log:()=>{}});third.load();const again=new Profiles(third).byId(17)!;
    assert.equal(again.tokens,12365);assert.equal(again.xp,870);assert.deepEqual(again.fishing,p.fishing);assert.equal(third.state.lobbyEvents!.lockUntil,1803000);
    third.close();
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
