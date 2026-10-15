import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../shared/dungeon/sim.ts';
import { spawnBosses } from '../shared/dungeon/boss.ts';
import { stepProps } from '../shared/dungeon/props.ts';
import { dropItem, stepPickups } from '../shared/dungeon/pickups.ts';
import { spawnMob, stepMobs } from '../shared/dungeon/mobs.ts';
import { addXp } from '../shared/dungeon/progress.ts';
import type { DgProp } from '../shared/dungeon/types.ts';

function fixture(wave:number) {
  const s=createRun(89);s.t=100;s.weapons=[];s.props=[];s.items=[];s.gems=[];s.hero.invT=1e9;spawnBosses(s,wave);
  const b=s.bosses[0],m=s.mobs.find(m=>m.id===b.id)!;m.under=0;m.st='walk';m.x=s.hero.x+2;m.z=s.hero.z;m.vulT=0;
  b.act='recover';b.actT=s.t;return {s,m,b};
}
const prop=(k:DgProp['k'],x:number,z:number):DgProp=>({id:99999,k,x,z,st:1,t0:0,t1:0,v:0,vx:0,why:''});

test('cauldron and old boss both take boss fractions from screen and map powder kegs',()=>{
  for(const wave of [10,20]){
    const {s,m}=fixture(wave),hp=m.hp;dropItem(s,'keg',s.hero.x,s.hero.z);s.items[0].t0=0;stepPickups(s);
    assert.ok(Math.abs(hp-m.hp-m.hpMax*.03)<1e-6,String(wave));
    const t=fixture(wave),k=prop('keg',t.m.x,t.m.z);t.s.props=[k];const before=t.m.hp;stepProps(t.s);
    assert.ok(Math.abs(before-t.m.hp-t.m.hpMax*.02)<1e-6,String(wave));
  }
});

test('cart ignores either boss without changing its attack state or HP',()=>{
  for(const wave of [10,20]){
    const {s,m}=fixture(wave),c=prop('cart',m.x-.4,m.z);c.vx=12;s.props=[c];m.st='wind';const hp=m.hp;stepProps(s);
    assert.equal(m.hp,hp,String(wave));assert.equal(m.st,'wind');assert.equal(m.bmT,0);
  }
});

test('Gribovod never heals bosses or ordinary mobs',()=>{
  for(const wave of [10,20]){
    const {s,m}=fixture(wave);m.hp=m.hpMax*.5;
    const shaman=spawnMob(s,'shaman',m.x,m.z,0);shaman.st='cast';shaman.stT=0;shaman.castHp=shaman.hp;
    const ordinary=spawnMob(s,'shroom',m.x+.2,m.z,0);ordinary.hp=ordinary.hpMax*.5;
    stepMobs(s);assert.ok(Math.abs(m.hp-m.hpMax*.5)<1e-6,String(wave));assert.ok(Math.abs(ordinary.hp-ordinary.hpMax*.5)<1e-6);
  }
});

test('level flash pushes ordinary mobs while either boss keeps zero knockback',()=>{
  for(const wave of [10,20]){
    const {s,m}=fixture(wave),rat=spawnMob(s,'rat',s.hero.x+1,s.hero.z,0);s.hero.xp=s.hero.xpNext;addXp(s,0);
    assert.equal(m.kx,0,String(wave));assert.equal(m.kz,0);assert.ok(Math.abs(rat.kx)>0);
  }
});
