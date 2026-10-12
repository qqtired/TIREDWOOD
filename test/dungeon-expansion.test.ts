import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,step,dgHash} from '../shared/dungeon/sim.ts';
import {D,WEAPON_IDS,mobIndex} from '../shared/dungeon/data.ts';
import {applyCard,openChest} from '../shared/dungeon/progress.ts';
import {startWave,stepDirector,timerEnd} from '../shared/dungeon/director.ts';
import {makeMob,hurtMob} from '../shared/dungeon/core.ts';
import {aliveCount,spawnMob,summonFromBudget,enrage,addContactMark} from '../shared/dungeon/mobs.ts';
import {spawnBosses} from '../shared/dungeon/boss.ts';
import {ticks} from '../shared/dungeon/util.ts';
import {syncPhysicalMarks} from '../shared/dungeon/expansion.ts';

const RECIPES={lantern:'might',embers:'cooldown',pickaxe:'speed',fireflies:'maxhp',spark:'magnet',stalactites:'armor',charges:'amount',beam:'area'};

test('all eight current weapons have distinct existing catalysts',()=>{
 assert.equal(D.evolutions.length,8);
 for(const id of WEAPON_IDS)assert.equal(D.evolutions.find(e=>e.from===id)?.with,RECIPES[id]);
 assert.equal(new Set(D.evolutions.map(e=>e.with)).size,8);
});

test('every chest kind yields a new evolution once its weapon and catalyst are ready',()=>{
 for(const kind of ['small','big','curse','plain','isle'] as const){
  const s=createRun(17);s.weapons=[];s.passives=[];
  for(let i=0;i<7;i++)applyCard(s,{k:'w',id:'embers',lv:i+1});
  applyCard(s,{k:'p',id:'cooldown',lv:1});
  openChest(s,kind);
  assert.equal(s.chest?.rows[0].k,'evo',kind);
  assert.equal(s.chest?.rows[0].id,'embers_evo',kind);
  assert.equal(s.weapons[0].evo,1);assert.equal(s.passives[0].lv,1);
 }
});

test('eight evolutions are covered by legal five weapon five passive builds and ready order',()=>{
 const builds=[['lantern','embers','pickaxe','spark','charges'],['lantern','fireflies','stalactites','beam','embers']] as const;
 const seen=new Set<string>();
 for(const weapons of builds){const s=createRun(19);s.weapons=[];s.passives=[];
  for(const id of weapons){for(let i=0;i<7;i++)applyCard(s,{k:'w',id,lv:i+1});applyCard(s,{k:'p',id:RECIPES[id],lv:1});}
  assert.equal(s.weapons.length,5);assert.equal(s.passives.length,5);
  for(const id of weapons){openChest(s,'big');assert.equal(s.chest?.rows[0].id,id+'_evo');seen.add(s.chest!.rows[0].id);s.chest=null;}
  assert.equal(s.evoReady.length,0);
 }assert.equal(seen.size,8);
});

test('wave 20 spawns a new boss and carries old enemies into wave 21',()=>{
 const s=createRun(21);s.noFx=true;startWave(s,20);stepDirector(s);
 assert.ok(s.mobs.some(m=>(m.k as string)==='cauldronmaster'));
 const old=makeMob(s,'rat',120,120,1,1,0);timerEnd(s);
 assert.equal(s.wave.n,21);assert.ok(s.mobs.includes(old));assert.equal(old.rage,1);
 assert.ok(s.mobs.some(m=>(m.k as string)==='cauldronmaster'));
});

test('event spawning at the live cap queues the remainder instead of exceeding or losing it',()=>{
 const s=createRun(23);s.noFx=true;startWave(s,16);for(let i=0;i<D.mobRules.maxAlive;i++)makeMob(s,'rat',120+i*.01,120,1,1,0);
 s.t=s.wave.t0+ticks(24.5);stepDirector(s);
 assert.ok(aliveCount(s)<=D.mobRules.maxAlive);
 assert.ok(s.wave.pend.reduce((a,b)=>a+b,0)>0);
});

test('late game replay stays deterministic with legal evolved weapons',()=>{
 const a=createRun(27);a.noFx=true;startWave(a,19);a.hero.invT=1e9;
 for(const id of ['lantern','embers','pickaxe','spark','charges'] as const){if(id!=='lantern')applyCard(a,{k:'w',id,lv:1});for(let i=1;i<7;i++)applyCard(a,{k:'w',id,lv:i+1});applyCard(a,{k:'p',id:RECIPES[id],lv:1});openChest(a,'plain');a.chest=null;}
 const b=structuredClone(a);for(let i=0;i<120;i++){a.choice=b.choice=null;a.chest=b.chest=null;step(a);step(b);}
 assert.equal(dgHash(a),dgHash(b));assert.deepEqual(a.stats,b.stats);assert.deepEqual(a.mobs,b.mobs);
});

test('hook impact follows its visible mark deadline',()=>{
 const s=createRun(31);s.noFx=true;s.weapons=[];s.props=[];const h=s.hero,m=spawnMob(s,'hookclaw',h.x+2,h.z,0);m.cd=0;m.spd=0;
 const hp=h.hp;step(s);assert.ok(s.marks.some(m=>m.what==='hook_snap'));
 const deadline=s.marks.find(m=>m.what==='hook_snap')!.t1;
 while(s.t<deadline)step(s);assert.equal(h.hp,hp);
 step(s);assert.ok(h.hp<hp);
});

test('hook footprint matches the real head after rotation, body motion and tor seam',()=>{
 const s=createRun(32);s.t=1;s.props=[];s.weapons=[];const a=D.mobs.find(m=>m.id==='hookclaw')!.hook!;
 for(const [dx,dz]of [[0,1],[1,0],[0,-1],[-1,0]]){
  s.marks=[];s.mobs=[];s.hero.x=1;s.hero.z=120;const m=spawnMob(s,'hookclaw',239.8,120,0);m.ax=dx;m.az=dz;
  s.marks.push({id:999,k:'circle',what:'hook_snap',x:0,z:0,r:a.radius,dx:0,dz:0,len:0,w:0,t0:s.t,t1:s.t+25,own:0,fx:m.x,fz:m.z,dmg:14,kb:0,stun:0,pud:0,src:m.id,localRight:a.right,localForward:a.forward});
  syncPhysicalMarks(s);const mk=s.marks[0],expectedX=((m.x+dx*a.forward+dz*a.right)%240+240)%240,expectedZ=((m.z+dz*a.forward-dx*a.right)%240+240)%240;
  assert.ok(Math.abs(mk.x-expectedX)<1e-9);assert.ok(Math.abs(mk.z-expectedZ)<1e-9);assert.equal(mk.r,.65);assert.equal(mk.k,'circle');
  m.x+=.2;syncPhysicalMarks(s);assert.ok(Math.abs(((mk.x-expectedX+240)%240)-.2)<1e-9);
 }
});

test('rage and HP scaling change strength without inflating contact geometry',()=>{
 const s=createRun(34);s.t=1;s.wave.hpMul=6;s.wave.dmgMul=2;
 for(const kind of ['hookclaw','chainwarden'] as const){s.marks=[];const m=spawnMob(s,kind,239.9,0.1,0),base=D.mobs.find(m=>m.id===kind)!,a=base.hook??base.swing!;m.ax=1;m.az=0;
  for(let n=0;n<3;n++)enrage(m);assert.equal(m.r,base.radius);assert.ok(m.hpMax>=base.hp*6);assert.ok(m.dmg>base.dmg*2);
  addContactMark(s,m,'contact',a.right,a.forward,a.radius,25,a.dmg*m.dmg/base.dmg);syncPhysicalMarks(s);
  const mk=s.marks[0];assert.equal(mk.r,a.radius);assert.ok(mk.x>=0&&mk.x<240&&mk.z>=0&&mk.z<240);assert.ok(mk.dmg>a.dmg*2);
 }
});

test('a planted enemy charge is visible and can be disarmed by a real lantern attack',()=>{
 const s=createRun(33);s.noFx=true;s.weapons=[];s.props=[];const h=s.hero,m=spawnMob(s,'wickmole',h.x+6,h.z,0);m.cd=0;m.spd=0;
 for(let i=0;i<=30;i++)step(s);assert.equal(s.enemyCharges.length,1);
 s.weapons=[{id:'lantern',lv:7,evo:0,cd:0,t2:0}];step(s);assert.equal(s.enemyCharges.length,0);
});

test('a new boss contact hurts and its kill is rewarded even when an older boss survives',()=>{
 const s=createRun(35);s.noFx=true;s.weapons=[];s.props=[];startWave(s,20);stepDirector(s);const m=s.mobs.find(m=>m.k==='cauldronmaster')!;
 m.x=s.hero.x+1;m.z=s.hero.z;const b=s.bosses.find(b=>b.id===m.id)!;b.act='recover';b.actT=s.t;const hp=s.hero.hp;step(s);assert.ok(s.hero.hp<hp);
 spawnBosses(s,10);const old=s.bosses.find(b=>b.family==='povidl')!;const oldMob=s.mobs.find(m=>m.id===old.id)!;const oldHp=oldMob.hp;
 hurtMob(s,m,m.hpMax+1,'test',m.x,m.z,0,0,0);assert.equal(s.stats.bosses,1);assert.equal(old.phase,1);assert.equal(oldMob.hp,oldHp);
});

test('budget summons at the cap keep their pending budget',()=>{
 const s=createRun(37);s.noFx=true;s.wave.pend[mobIndex('shroom')]=5;
 for(let i=0;i<300;i++)makeMob(s,'rat',120,120,1,1,0);
 assert.equal(summonFromBudget(s,'shroom',120,120),null);assert.equal(aliveCount(s),300);assert.equal(s.wave.pend[mobIndex('shroom')],5);
});

test('blocked slime children become HP debt instead of disappearing',()=>{
 const s=createRun(39);s.t=1;s.noFx=true;for(let i=0;i<299;i++)makeMob(s,'rat',120,120,1,1,0);
 const m=makeMob(s,'slime',120,120,1,1,0),debt=s.wave.debt;hurtMob(s,m,100,'test',120,120,0,0,0);
 assert.ok(s.wave.debt>=debt+20);assert.ok(aliveCount(s)<=300);
});

test('a queued boss survives the timer and takes the first released slot in the next wave',()=>{
 const s=createRun(41);s.noFx=true;startWave(s,20);for(let i=0;i<300;i++)makeMob(s,'rat',120,120,1,1,0);stepDirector(s);
 assert.equal(s.bosses.length,0);assert.equal(s.pendingBossWaves.length,1);timerEnd(s);s.t=1;s.mobs[0].die=1;stepDirector(s);
 assert.equal(s.wave.n,21);assert.equal(s.pendingBossWaves.length,0);assert.equal(s.bosses[0].family,'cauldronmaster');assert.equal(s.bosses[0].rage,1);assert.ok(aliveCount(s)<=300);
});

test('endless composition retains old and new roles, replaces elites and caps late event bodies',()=>{
 for(const n of [21,22,25,28,101,204,1004]){
  const s=createRun(42);startWave(s,n);
  assert.ok(s.wave.total<=D.endless.bodyCap.after,String(n));assert.ok(Number.isFinite(s.wave.hpMul));
  const total=s.wave.pend.reduce((a,b)=>a+b,0)+s.wave.ev.reduce((a,e)=>a+e.n,0);assert.equal(total,s.wave.total);
  if(n===22){assert.ok(s.wave.ev.some(e=>e.mob==='chainwarden'));assert.ok(s.wave.ev.some(e=>e.mob==='barrel'||e.mob==='shaman'));}
  if(n<=28){assert.ok(s.wave.pend[mobIndex('rat')]>0);assert.ok(s.wave.pend.slice(mobIndex('hookclaw')).some(n=>n>0));}
 }
});
