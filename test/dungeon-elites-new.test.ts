import assert from 'node:assert/strict';
import test from 'node:test';
import { createRun, step, dgHash } from '../shared/dungeon/sim.ts';
import { makeMob, hurtMob, buildGrid } from '../shared/dungeon/core.ts';
import { eliteAi, stepBud, spillHoard } from '../shared/dungeon/elites.ts';
import { canSpawn, stepMobs } from '../shared/dungeon/mobs.ts';
import { startWave } from '../shared/dungeon/director.ts';
import { D, mobDef, mobIndex } from '../shared/dungeon/data.ts';
import { dropGem, stepPickups } from '../shared/dungeon/pickups.ts';
import { earnedXp } from '../shared/dungeon/progress.ts';
import { blocked } from '../shared/dungeon/map.ts';
import { stepHero } from '../shared/dungeon/hero.ts';
import { heroInMark } from '../shared/dungeon/attack-footprint.ts';

function fixture(k:'hapuga'|'shaman'='hapuga') {
  const s=createRun(71);s.t=1;s.weapons=[];s.props=[];s.items=[];s.gems=[];
  s.wave.stage='intro';s.wave.t1=1e9;s.hero.invT=0;s.hero.xpNext=10000;
  let x=0,z=0;
  outer:for(let a=10;a<225;a+=5)for(let b=10;b<225;b+=5){
    if([-2,0,2,4].every(dx=>[-2,0,2].every(dz=>!blocked(a+dx,b+dz,1)))){x=a;z=b;break outer;}
  }
  assert.ok(x);s.hero.x=x+12;s.hero.z=z;
  const m=makeMob(s,k,x,z,1,1,0);return {s,m};
}
const total=(s:ReturnType<typeof createRun>)=>s.gems.reduce((a,g)=>a+g.v,0)+s.mobs.reduce((a,m)=>a+(m.storedXp??0),0);
function collect(s:ReturnType<typeof createRun>,m:ReturnType<typeof makeMob>){eliteAi(s,m,12,1,0);assert.equal(m.attackKind,'collect');s.t+=30;eliteAi(s,m,12,1,0);}

test('Hapuga caps raw XP, splits large gems, ignores flying gems and returns exact raw XP',()=>{
  const {s,m}=fixture();dropGem(s,m.x+.2,m.z,40);dropGem(s,m.x,m.z,9);s.gems[1].fly=1;
  collect(s,m);assert.equal(m.storedXp,25);assert.equal(total(s),49);assert.equal(s.gems[0].v,15);assert.equal(s.gems[1].v,9);
  spillHoard(s,m);assert.equal(m.storedXp,0);assert.equal(total(s),49);spillHoard(s,m);assert.equal(total(s),49);
  s.hero.x=m.x;s.hero.z=m.z;s.passives=[{id:'magnet',lv:3}];stepPickups(s);
  assert.equal(s.hero.xp,earnedXp(s,49));assert.equal(s.gems.length,0);
});

test('death and merge cap preserve hoarded XP, no double spill or disappearing carryover',()=>{
  const {s,m}=fixture();m.storedXp=25;
  for(let i=0;i<D.xp.mergeOver;i++)s.gems.push({id:s.nextId++,x:m.x+20,z:m.z,v:1,fly:0});
  const before=total(s);hurtMob(s,m,10000,'test',m.x,m.z,0,0,0);
  assert.equal(total(s),before+mobDef('hapuga').xp);assert.equal(m.storedXp,0);
  assert.ok(s.gems.some(g=>g.x===m.x&&g.v>=25));spillHoard(s,m);assert.equal(total(s),before+40);
  const f=fixture();f.m.storedXp=18;startWave(f.s,10);assert.equal(f.m.storedXp,18);assert.equal(f.m.die,0);
});

test('only full Q within its actual radius spills XP; tap and distant full Q do not',()=>{
  for(const [full,distance,expected] of [[false,2,20],[true,2,0],[true,20,20]] as const){
    const {s,m}=fixture();m.storedXp=20;s.hero.x=m.x+distance;buildGrid(s);
    s.hero.qHold=full?s.hero.qFull:2;s.in.q=0;s.in.qPress=0;stepHero(s);
    assert.equal(m.storedXp,expected);assert.equal(total(s),20);assert.equal(m.die,0);
  }
});

test('Hapuga replaces one elite on 9+3k without altering ordinary pending budget and respects cap',()=>{
  for(const n of [7,8,9,10,11,12,15,18,20,21,30,33]){
    const s=createRun(1);startWave(s,n);
    assert.equal(s.wave.ev.filter(e=>e.mob==='hapuga').length,n>=9&&(n-9)%3===0&&n%10!==0?1:0,String(n));
    if(n===9)for(const [k,count] of Object.entries(D.waves.find(w=>w.w===9)!.mobs))assert.equal(s.wave.pend[mobIndex(k as 'rat')],count);
  }
  const {s}=fixture();assert.equal(canSpawn(s,'hapuga'),false);assert.equal(mobDef('hapuga').hp,850);assert.equal(mobDef('shaman').hp,650);assert.equal(mobDef('shaman').waveBudgetHp,450);
});

function planted(){const {s,m}=fixture('shaman');s.wave.pend[mobIndex('shroom')]=5;s.wave.left=5;eliteAi(s,m,12,1,0);s.t+=33;eliteAi(s,m,12,1,0);return {s,m,buds:s.mobs.filter(m=>m.k==='shroom_bud')};}

test('Gribovod plants three real targets from finite budget; destroyed buds give no XP/cloud/chest',()=>{
  const {s,m,buds}=planted();assert.equal(buds.length,3);assert.equal(s.wave.pend[mobIndex('shroom')],2);assert.equal(s.wave.spawned,3);
  for(const b of buds)assert.equal(b.hp,25);
  hurtMob(s,buds[0],25,'lantern',buds[0].x,buds[0].z,0,0,0);assert.equal(s.wave.left,4);
  assert.equal(s.gems.length,0);assert.equal(s.items.length,0);assert.equal(s.puddles.length,0);
  s.hero.x=buds[1].x;s.hero.z=buds[1].z;s.hero.qHold=s.hero.qFull;s.in.q=0;buildGrid(s);stepHero(s);
  assert.ok(buds[1].die);assert.equal(s.gems.length,0);
  m.attackAt=undefined;m.attackKind=undefined;m.cd2=0;s.wave.pend[mobIndex('shroom')]=0;eliteAi(s,m,12,1,0);assert.notEqual(m.attackKind,'plant');
});

test('planted sprouts survive caster death/stun and mature once with reserved HP and wave identity',()=>{
  const {s,m,buds}=planted();const mature=buds[0].budMatureAt!;
  hurtMob(s,m,10000,'test',m.x,m.z,0,0,0);s.t=mature;stepBud(s,buds[0]);
  assert.equal(buds[0].k,'shroom');assert.equal(buds[0].hp,mobDef('shroom').hp);assert.equal(buds[0].sq,1);
  const pending=s.wave.pend[mobIndex('shroom')];stepBud(s,buds[0]);assert.equal(s.wave.pend[mobIndex('shroom')],pending);
  const f=planted();f.m.stunT=1000;f.s.t=f.buds[0].budMatureAt!;stepBud(f.s,f.buds[0]);assert.equal(f.buds[0].k,'shroom');
});

test('growth respects maxAlive and preserves unspent budget',()=>{
  const {s,m}=fixture('shaman');s.wave.pend[mobIndex('shroom')]=5;
  for(let i=1;i<D.mobRules.maxAlive;i++)makeMob(s,'rat',m.x+10,m.z,1,1,0);
  eliteAi(s,m,12,1,0);assert.equal(m.attackAt,undefined);assert.equal(s.wave.pend[mobIndex('shroom')],5);
});

test('jab warning follows actual fork tips; freeze shifts attack and impact together',()=>{
  const {s,m}=fixture();s.hero.x=m.x+1.4;s.hero.z=m.z;
  eliteAi(s,m,1.4,1,0);const mk=s.marks[0];assert.equal(mk.t1,41);assert.equal(mk.localForward,1.4508);assert.equal(mk.localRight,-.67);
  assert.equal(heroInMark(s.hero,mk),true);assert.equal(heroInMark({x:m.x-1,z:m.z},mk),false);
  s.freezeT=s.t+10;buildGrid(s);stepMobs(s);assert.equal(m.attackAt,2);assert.equal(mk.t1,42);
  const before=s.hero.hp;s.t=42;s.freezeT=0;step(s);assert.equal(s.hero.hp,before-14);
});

test('replay hash sees hoarded XP and growth timers',()=>{
  const {s,m}=fixture();const h=dgHash(s);m.storedXp=1;assert.notEqual(dgHash(s),h);
  const {s:t,buds}=planted();const h2=dgHash(t);buds[0].budMatureAt!++;assert.notEqual(dgHash(t),h2);
});

test('active global magnet prevents scooping even before pickup has marked a new gem as flying',()=>{
 const {s,m}=fixture();dropGem(s,m.x,m.z,12);eliteAi(s,m,12,1,0);s.hero.buffs.push({id:'pull',t1:1000});s.t+=30;eliteAi(s,m,12,1,0);assert.equal(m.storedXp,0);assert.equal(total(s),12);
});

test('stun pauses collection without losing or repeating its transfer',()=>{
 const {s,m}=fixture();dropGem(s,m.x,m.z,20);eliteAi(s,m,12,1,0);m.stunT=12;buildGrid(s);
 while(s.t<12){stepMobs(s);s.t++;}
 assert.equal(m.attackAt,12);assert.equal(m.storedXp,0);s.t=42;eliteAi(s,m,12,1,0);assert.equal(m.storedXp,20);
 s.t=92;eliteAi(s,m,12,1,0);assert.equal(total(s),20);assert.equal(m.storedXp,20);
});

test('full Q spill cancels jab permanently even when stun holds the source on its impact tick',()=>{
 const {s,m}=fixture();m.storedXp=20;s.hero.x=m.x+1.5;s.hero.z=m.z;eliteAi(s,m,1.5,1,0);
 const mark=s.marks[0];s.t=mark.t1;s.hero.qHold=s.hero.qFull;s.in.q=0;const hp=s.hero.hp;step(s);
 assert.equal(s.hero.hp,hp);assert.equal(m.storedXp,0);assert.ok(mark.t1<s.t-1);
 assert.equal(s.marks.some(mk=>mk.id===mark.id),false);
});

test('stun never revives an expired jab even without hoarded XP',()=>{
 const {s,m}=fixture();s.hero.x=m.x+1.5;eliteAi(s,m,1.5,1,0);const mk=s.marks[0];
 s.t=mk.t1+1;const expired=mk.t1;m.stunT=s.t+20;buildGrid(s);stepMobs(s);assert.equal(mk.t1,expired);
});
