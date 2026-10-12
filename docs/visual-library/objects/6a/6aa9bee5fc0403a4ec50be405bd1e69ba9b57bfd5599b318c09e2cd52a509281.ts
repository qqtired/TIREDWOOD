import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../shared/dungeon/sim.ts';
import { startWave } from '../shared/dungeon/director.ts';
import { makeMob, hurtMob } from '../shared/dungeon/core.ts';
import { aliveCount } from '../shared/dungeon/mobs.ts';
import { stepProps } from '../shared/dungeon/props.ts';

function chestFixture(cap:number) {
  const s=createRun(1);s.t=1;startWave(s,16);s.weapons=[];s.hero.xp=7;
  const p=s.props.find(p=>p.k==='chest'&&p.st===0)!;s.props=[p];s.hero.x=p.x;s.hero.z=p.z;
  for(let i=0;i<cap;i++)makeMob(s,'rat',120,120,1,1,0);
  return {s,p};
}

test('full cap defers curse completion, then creates exactly one elite and one reward',()=>{
  const {s,p}=chestFixture(300),xp=s.hero.xp;stepProps(s);const use=s.hero.useT1;
  assert.equal(s.hero.useId,p.id);s.t=use;const rng=s.rng;stepProps(s);
  assert.equal(aliveCount(s),300);assert.equal(p.st,0);assert.equal(p.why,'crowd');assert.equal(s.hero.useId,p.id);assert.equal(s.rng,rng);assert.equal(s.hero.xp,xp);
  s.t+=20;stepProps(s);assert.equal(p.st,0);assert.equal(s.rng,rng);assert.equal(s.fx.filter(f=>f.k==='prop'&&f.what==='used').length,0);
  hurtMob(s,s.mobs[0],1000,'test',120,120,0,0,0);s.t++;stepProps(s);
  const elites=s.mobs.filter(m=>!m.die&&m.curse===p.id);assert.equal(elites.length,1);assert.equal(aliveCount(s),300);assert.equal(p.st,1);assert.equal(p.t0,s.t);assert.equal(p.t1-s.t,45*30);assert.equal(s.hero.xp,xp);
  stepProps(s);assert.equal(s.mobs.filter(m=>m.curse===p.id).length,1);assert.equal(s.fx.filter(f=>f.k==='prop'&&f.what==='used').length,1);
  const elite=elites[0];hurtMob(s,elite,elite.hpMax*2,'test',elite.x,elite.z,0,0,0);
  assert.equal(p.st,2);assert.equal(s.chest?.kind,'curse');const rows=structuredClone(s.chest!.rows);
  hurtMob(s,elite,elite.hpMax*2,'test',elite.x,elite.z,0,0,0);stepProps(s);assert.deepEqual(s.chest!.rows,rows);assert.equal(s.mobs.filter(m=>m.curse===p.id).length,1);
});

test('curse below cap retains its original immediate completion and tagged reward path',()=>{
  const {s,p}=chestFixture(0);stepProps(s);s.t=s.hero.useT1;stepProps(s);
  assert.equal(p.st,1);assert.ok(aliveCount(s)>=1&&aliveCount(s)<=13);const m=s.mobs.find(m=>m.curse===p.id)!;
  hurtMob(s,m,m.hpMax*2,'test',m.x,m.z,0,0,0);assert.equal(s.chest?.kind,'curse');assert.equal(p.st,2);
});

test('leaving a crowd-blocked chest cancels holding without losing or locking the chest',()=>{
  const {s,p}=chestFixture(300);stepProps(s);s.t=s.hero.useT1;stepProps(s);s.hero.x+=10;stepProps(s);
  assert.equal(s.hero.useId,-1);assert.equal(p.st,0);assert.equal(s.mobs.filter(m=>m.curse===p.id).length,0);
  hurtMob(s,s.mobs[0],1000,'test',120,120,0,0,0);s.hero.x=p.x;s.hero.z=p.z;s.t++;stepProps(s);s.t=s.hero.useT1;stepProps(s);
  assert.equal(p.st,1);assert.equal(s.mobs.filter(m=>m.curse===p.id).length,1);
});

test('boss stage cancels a waiting curse and twin reservation keeps its slots',()=>{
  const {s,p}=chestFixture(300);stepProps(s);s.t=s.hero.useT1;stepProps(s);s.wave.stage='boss';stepProps(s);
  assert.equal(s.hero.useId,-1);assert.equal(p.st,0);assert.equal(p.why,'boss');
  const {s:t,p:q}=chestFixture(299);t.pendingBossWaves.push({wave:30,at:t.t,dmgMul:1});stepProps(t);t.t=t.hero.useT1;stepProps(t);
  assert.equal(q.st,0);assert.equal(q.why,'crowd');assert.equal(t.mobs.filter(m=>m.curse===q.id).length,0);
});
