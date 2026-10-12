import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FortGame } from '../server/fort/game.ts';
import { planWave, SIEGE_FEATURES } from '../server/fort/director.ts';
import { BOSS_CYCLE, Z_BOAT, Z_GOLEM, Z_BOSS, Z_WALKER, ZK, CHAMP_HASTE } from '../shared/fortkinds.ts';
import { bossHp, TIER_ELITE, TIER_CHAMP, TIER_SPEED, GOLD_HASTE } from '../shared/fortwaves.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { FT_BREAK } from '../shared/fort.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { breakSecondsAfter, isBossWave, isSuperWave, waveTokens } from '../shared/fortwaves.ts';
import * as S from '../shared/fortsiege.ts';

const roles=[S.Z_ROPECRAB,S.Z_JAMPUMP,S.Z_CANOPY,S.Z_FOREMAN,S.Z_SPRING,S.Z_SIEGE_TOWER,S.Z_BATTERY];
function at(w:number,n:number,seed=11){const g=new FortGame({siege:true});const plan=(n:number)=>planWave(w,n,seed,undefined,SIEGE_FEATURES);g.horde.startWave(plan(n),0,plan);return g;}

test('new priority enemies stay stronger with more defenders, including a wounded live enemy',()=>{
  for(const w of [18,40,76,98])for(const kind of roles){
    const solo=at(w,1),team=at(w,4);
    assert.ok(team.horde.hpFor(kind,1)>solo.horde.hpFor(kind,1)*1.1,`${w}/${kind}: coop cannot make the new enemy frailer`);
    const z=solo.horde.spawn(kind,1,1,1)!;z.hp=z.maxHp*.4;const hp=z.hp;
    solo.horde.raiseDefenders(4,0);
    assert.ok(z.hp>hp);assert.ok(Math.abs(z.hp/z.maxHp-.4)<1e-9);
    assert.ok(Math.abs(z.maxHp-team.horde.hpFor(kind,1))<1e-6,'joining and fresh team agree');
  }
});
test('a different cooperative theme cannot renormalize priority HP below solo: wave 58 seed 23',()=>{
  const solo=at(58,1,23),team=at(58,4,23),kind=S.Z_CANOPY;
  const hp=solo.horde.hpFor(kind,TIER_ELITE);
  assert.ok(team.horde.hpFor(kind,TIER_ELITE)>hp*1.5);
  const z=solo.horde.spawn(kind,1,1,TIER_ELITE)!;z.hp=z.maxHp*.35;
  solo.horde.raiseDefenders(4,0);
  assert.ok(Math.abs(z.maxHp-team.horde.hpFor(kind,TIER_ELITE))<1e-6);
  assert.ok(Math.abs(z.hp/z.maxHp-.35)<1e-10);
  const after=z.maxHp;assert.equal(solo.horde.raiseDefenders(2,1),false);assert.equal(z.maxHp,after);
});
test('wave 33 sequential joins order the foreman once, including after its spawn and death',()=>{
  for(const state of ['queued','alive','dead'] as const){
    const g=at(33,1),original=g.horde.current!;
    assert.equal(original.spawns.filter(s=>s.kind===S.Z_FOREMAN).length,0);
    for(const n of [2,3,4])assert.equal(planWave(33,n,11,undefined,SIEGE_FEATURES).spawns.filter(s=>s.kind===S.Z_FOREMAN).length,1);
    const issued:number[]=[],spawn=g.horde.spawn.bind(g.horde);
    g.horde.spawn=(...args)=>{const z=spawn(...args);if(z&&z.kind===S.Z_FOREMAN)issued.push(z.id);return z;};
    const drain=()=>{
      g.tick+=10000;
      for(let i=0;i<50&&(g.horde.pending||g.horde.alive);i++){
        for(const z of g.horde.zombies)if(z.alive)g.horde.kill(z,1);
        g.tick++;g.horde.step();
      }
      assert.equal(g.horde.pending,0,'the real queue, including reinforcements, has been consumed');
    };
    g.horde.raiseDefenders(2,g.tick);
    if(state!=='queued'){
      g.tick+=10000;g.horde.step();
      const foreman=g.horde.zombies.find(z=>z.alive&&z.kind===S.Z_FOREMAN);
      assert.ok(foreman,'the first reinforcement actually spawned');
      if(state==='dead'){
        g.horde.damage(foreman,1e12,1,false,foreman.x,foreman.y,foreman.z);
        assert.equal(foreman.alive,false);
      }
    }
    g.horde.raiseDefenders(3,g.tick);g.horde.raiseDefenders(4,g.tick);
    assert.strictEqual(g.horde.current!.spawns,original.spawns,'original spawn schedule stays locked');
    assert.strictEqual(g.horde.current!.boats,original.boats,'original boat routes/cargo stay locked');
    drain();assert.equal(issued.length,1,`${state}: later arrivals must not order the same foreman again`);
    const left=g.horde.left;assert.equal(g.horde.raiseDefenders(2,g.tick),false);assert.equal(g.horde.left,left);
    g.horde.clear();
    const replan=(n:number)=>planWave(33,n,11,undefined,SIEGE_FEATURES);
    g.horde.startWave(replan(1),g.tick,replan);g.horde.raiseDefenders(2,g.tick);drain();
    assert.equal(issued.length,2,'a new wave starts a fresh committed quota');
  }
});
test('reinforcement quota changes retain every original spawn deadline and boat route',()=>{
  const g=at(34,1);
  const pending=()=> (g.horde as unknown as {queue:unknown[]}).queue;
  const original=pending().slice(),snapshot=structuredClone(original);
  assert.ok(original.some(s=>(s as {kind:number}).kind===Z_BOAT),'fixture includes scheduled boats');
  for(const n of [2,3,4])g.horde.raiseDefenders(n,n*10);
  assert.deepEqual(pending().filter(s=>original.includes(s)),snapshot,
    'same queued objects, original times, roads, lanes, cargo and cargo tiers');
});
test('late specialists receive elite and champion bodies rather than staying tier zero forever',()=>{
  let seen=0;
  for(let w=30;w<=99;w++)for(const s of planWave(w,4,11,undefined,SIEGE_FEATURES).spawns)if(roles.includes(s.kind)){
    seen++;assert.ok(s.tier>=(w>=70?TIER_CHAMP:TIER_ELITE),`${w}/${s.kind}`);
  }
  assert.ok(seen>20);
  assert.ok(ZK[S.Z_FOREMAN].hp>=520);
  assert.ok(ZK[S.Z_ROPECRAB].speed>=3.6&&ZK[S.Z_SPRING].speed>=3.6);
});
test('Valun has three times its old runtime HP, including fallback spawn; other bosses retain theirs',()=>{
  for(const n of [1,2,4]){
    const p=planWave(15,n,11,undefined,SIEGE_FEATURES);assert.equal(p.boss,Z_GOLEM);assert.equal(p.bossHp,bossHp(15,n,0)*3);
    const g=at(15,n);assert.equal(g.horde.spawn(Z_GOLEM,1)!.maxHp,p.bossHp);
    const fallback=new FortGame();assert.equal(fallback.horde.hpFor(Z_GOLEM,0),fallback.horde.hpFor(Z_BOSS,0)*3);
    const other=planWave(5,n,11,undefined,SIEGE_FEATURES);assert.equal(other.bossHp,bossHp(5,n,0));
  }
});
test('siege first cycle has eight unique bosses before wave 50, with no overlapping siege or event',()=>{
  const waves=[5,10,15,20,30,35,40,45],cycle=[...BOSS_CYCLE,S.Z_CRABCRANE,S.Z_MILLER];
  for(const n of [1,2,4])for(let i=0;i<waves.length;i++){
    const w=waves[i],p=planWave(w,n,11,undefined,SIEGE_FEATURES);
    assert.equal(p.boss,cycle[i]);assert.equal(p.bossTier,0);
    assert.equal(p.bossHp,bossHp(w,n,Math.floor(i/3))*(p.boss===Z_GOLEM?3:1));
    assert.ok(p.spawns.every(s=>s.kind<S.Z_ROPECRAB));assert.ok(p.boats.every(b=>!b.anchor));
    assert.equal(p.siegeEvent,0);assert.equal(p.event,0);
  }
  const repeat=planWave(55,1,11,undefined,SIEGE_FEATURES);
  assert.equal(repeat.boss,Z_BOSS);assert.equal(repeat.bossTier,1);assert.equal(repeat.bossHp,bossHp(55,1,2));
  for(const w of [25,50,75,100])assert.equal(planWave(w,2,11,undefined,SIEGE_FEATURES).kraken,true);
  for(let w=1;w<50;w++)if(!waves.includes(w)&&w!==25)assert.equal(planWave(w,2,11,undefined,SIEGE_FEATURES).boss,-1);
});
test('early siege introductions are single new roles, with one anchor boat from wave 7',()=>{
  const first=[[6,S.Z_SIEGE_TOWER],[8,S.Z_ROPECRAB],[9,S.Z_SPRING],[12,S.Z_BATTERY],[14,S.Z_JAMPUMP],[16,S.Z_CANOPY],[19,S.Z_FOREMAN]];
  for(const n of [1,2,4]){
    for(const [w,kind] of first){
      const p=planWave(w,n,11,undefined,SIEGE_FEATURES);
      assert.deepEqual(p.spawns.filter(s=>roles.includes(s.kind)).map(s=>s.kind),[kind]);
      assert.equal(p.boss,-1);assert.equal(p.event,0);assert.ok(p.boats.every(b=>!b.anchor));
    }
    const p=planWave(7,n,11,undefined,SIEGE_FEATURES);
    assert.equal(p.boats.filter(b=>b.anchor).length,1);assert.equal(p.boss,-1);
    assert.ok(p.spawns.every(s=>s.kind<S.Z_ROPECRAB));assert.equal(p.event,0);
    assert.equal(planWave(6,n,11,undefined,SIEGE_FEATURES).boats.filter(b=>b.anchor).length,0);
  }
});
test('actual wave completion uses the active boss schedule for break, token bonus and next-wave announcement',()=>{
  for(const siege of [false,true])for(const w of [4,5,6,7,9,10,14,15,24,25,39,40,44,45,49,50]){
    const messages:ServerMsg[]=[],g=new FortGame({siege});
    const p=g.addHuman({pid:1,nick:'ScheduleTester',outfit:DEFAULT_OUTFIT},
      {sendJson(m){messages.push(m)},sendBinary(){},close(){}})!;
    g.wave=w-1;g.phaseEnd=g.tick+1;g.step();g.horde.clear();g.step();
    assert.equal(g.phase,FT_BREAK,`${siege}/${w}: completed real wave`);
    const boss=siege?S.siegeBossNumber(w)>0:isBossWave(w);
    const seconds=siege?(isSuperWave(w+1)?30:boss||isSuperWave(w)?20:15):breakSecondsAfter(w);
    assert.equal(g.phaseEnd-g.tick,seconds*TICK_RATE);
    const expected=waveTokens(w)+8*(Number(boss)-Number(isBossWave(w)));
    assert.equal(p.run.tokWaves,expected,`${siege}/${w}: reward`);
    const nextBoss=siege?S.siegeBossNumber(w+1)>0:isBossWave(w+1);
    const announcement=messages.findLast(m=>m.t==='chat'&&m.text.includes(`Волна ${w} отбита`));
    assert.ok(announcement&&announcement.t==='chat');
    assert.equal(announcement.text.includes('дальше босс:'),nextBoss);
  }
});
test('siege approaches and routed passengers use tier, gold haste, champion aura and ground slow',()=>{
  for(const kind of [S.Z_ROPECRAB,S.Z_SPRING,S.Z_SIEGE_TOWER,S.Z_BATTERY,S.Z_FOREMAN]){
    const g=at(31,2),z=g.horde.spawn(kind,1,2,TIER_ELITE)!;
    Object.assign(z,{x:8,z:-50,hasted:true,state:S.ZS_SIEGE_APPROACH});
    g.horde.haste=GOLD_HASTE;g.arsenal.slow=()=>.6;
    const x=z.x,zz=z.z;g.horde.siege.step(z);
    const expected=ZK[kind].speed*TIER_SPEED[TIER_ELITE]*GOLD_HASTE*CHAMP_HASTE*.6/TICK_RATE;
    assert.ok(Math.abs(Math.hypot(z.x-x,z.z-zz)-expected)<1e-8,`${kind}: full movement multiplier`);
  }
  const g=at(31,2),source=g.horde.spawn(S.Z_SPRING,1)!,passenger=g.horde.spawn(Z_WALKER,1,2,TIER_ELITE)!;
  Object.assign(source,{x:8,z:-30,state:S.ZS_SIEGE_ACTION});
  Object.assign(passenger,{x:8,z:-45,hasted:true,siegeCarrier:source.id});
  g.horde.haste=GOLD_HASTE;g.arsenal.slow=()=>.6;
  g.horde.siege.step(passenger);
  assert.ok(Math.abs(passenger.z+45-ZK[Z_WALKER].speed*TIER_SPEED[TIER_ELITE]*GOLD_HASTE*CHAMP_HASTE*.6/TICK_RATE)<1e-8);
  assert.equal(S.siegeBodyMul(Z_BOAT,4),1,'ordinary boats keep their old scaling');
});
test('meteor is a slower shared target with a much larger impact, spaced so the team can concentrate fire',()=>{
  assert.ok(S.SIEGE_METEOR_FLIGHT>=6*TICK_RATE);
  assert.ok(S.SIEGE_METEOR_RADIUS>=11);
  assert.ok(S.SIEGE_METEOR_GAP>=S.SIEGE_METEOR_FLIGHT);
  assert.equal(S.meteorHits(1),8);assert.equal(S.meteorHits(4),32);
});
