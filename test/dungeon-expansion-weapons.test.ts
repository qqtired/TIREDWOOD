import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, applyEvent } from '../shared/dungeon/sim.ts';
import { makeMob, buildGrid, hurtMob } from '../shared/dungeon/core.ts';
import { stepWeapons, ownMarkHit } from '../shared/dungeon/weapons.ts';
import { spawnMob, addMark } from '../shared/dungeon/mobs.ts';
import { spawnBosses } from '../shared/dungeon/boss.ts';
import { D } from '../shared/dungeon/data.ts';
import { syncPhysicalMarks } from '../shared/dungeon/expansion.ts';
import { wrapD, wrapP } from '../shared/dungeon/util.ts';

function empty(seed: number) { const s = createRun(seed); s.t = 1; s.weapons = []; s.props = []; s.hero.invT = 1e9; return s; }

test('an evolved ember creates only one splash across piercing hits and never recurses', () => {
  const s = empty(51), x = s.hero.x + 2, z = s.hero.z;
  for (let i = 0; i < 2; i++) makeMob(s, 'rat', x, z, 100, 1, 0);
  s.shots.push({ id: 10000, k: 'ember', x, z, vx: 0, vz: 1, dx: 0, dz: 1, v0: 1, t0: s.t, ph: s.mobs[0].id, size: .35, dmg: 22, pierce: 2, hit: [], evo: 1 });
  buildGrid(s); stepWeapons(s);
  assert.equal(s.marks.length, 1); assert.equal(s.marks[0].what, 'ember_splash');
  const hp = s.mobs.map(m => m.hp); ownMarkHit(s, s.marks[0]);
  assert.equal(s.marks.length, 1); for (let i = 0; i < 2; i++) assert.equal(hp[i] - s.mobs[i].hp, 8);
});

test('flywheel return hits have stronger knockback than the outbound pass', () => {
  const impulses: number[] = [];
  for (const phase of [0, 1]) {
    const s = empty(53), m = makeMob(s, 'rat', s.hero.x + 2, s.hero.z, 100, 1, 0);
    s.shots.push({ id: 10000, k: 'pick', x: m.x, z: m.z, vx: 0, vz: 0, dx: 0, dz: 1, v0: 0, t0: s.t, ph: phase, size: 1.6, dmg: 48, pierce: 99, hit: [], evo: 1 });
    buildGrid(s); stepWeapons(s); impulses.push(Math.hypot(m.kx, m.kz));
  }
  assert.ok(impulses[1] > impulses[0] * 1.5);
});

test('crystal evolution makes exactly two finite endpoint pulses for a populated chain', () => {
  const s = empty(55); s.weapons = [{ id: 'spark', lv: 7, evo: 1, cd: 0, t2: 0 }];
  for (let i = 0; i < 15; i++) makeMob(s, 'rat', s.hero.x + 2 + i * .4, s.hero.z, 100, 1, 0);
  buildGrid(s); stepWeapons(s); assert.equal(s.marks.filter(m => m.what === 'spark_pulse').length, 2);
  const before = s.stats.dmg.spark; for (const mk of s.marks) ownMarkHit(s, mk);
  assert.ok(s.stats.dmg.spark > before); assert.equal(s.marks.length, 2);
});

test('bundle chain detonates each armed neighbor once with delay and leaves unarmed traps', () => {
  const s = empty(57); const x = s.hero.x, z = s.hero.z;
  for (let i = 0; i < 4; i++) s.traps.push({ id: 10000 + i, x: x + i, z, t0: 0, arm: i === 3 ? 100 : 0, end: i === 0 ? s.t : 1000, dmg: 86, r: 3.2, stun: 30, evo: 1, chainR: 4, chainDelay: 5 });
  buildGrid(s); stepWeapons(s); assert.equal(s.traps.length, 3); assert.equal(s.traps[0].end, 6); assert.equal(s.traps[1].end, 6); assert.equal(s.traps[2].end, 1000);
  for (let t = 2; t <= 6; t++) { s.t = t; stepWeapons(s); }
  assert.equal(s.fx.filter(f => f.k === 'boom').length, 3); assert.equal(s.traps.length, 1); assert.equal(s.traps[0].id, 10003);
});

test('sufficient damage interrupts the chain warden before its first impact', () => {
  const s = empty(59), h = s.hero, m = spawnMob(s, 'chainwarden', h.x + 3, h.z, 0); m.cd = 0; m.spd = 0;
  step(s); assert.equal(m.attackKind, 'attack');
  hurtMob(s, m, m.hpMax * .13, 'test', h.x, h.z, 0, 0, 0); step(s);
  assert.equal(m.attackKind, 'recover'); assert.equal(s.marks.filter(mk => mk.src === m.id).length, 0);
});

test('cauldron ring has a genuinely safe center and damaging annulus', () => {
  for (const distance of [0, 5]) {
    const s = empty(61); s.hero.invT = 0; const h = s.hero, hp = h.hp;
    addMark(s, 'ring', 'cauldron_boil', h.x - distance, h.z, 8, 0, 0, 0, 26, 0, 0, null);
    s.marks[0].inner = 4; step(s);
    assert.equal(hp - h.hp, distance === 0 ? 0 : 26);
  }
});

test('freezing the cauldron holds the visible warning fraction and impact deadline together', () => {
  const s = empty(63); spawnBosses(s, 20); const b = s.bosses[0], m = s.mobs.find(m => m.id === b.id)!;
  m.x = s.hero.x + 5; m.z = s.hero.z;
  b.phase = 3; b.act = 'pause'; b.actT = -100; b.rot = 0; m.hp = m.hpMax * .3;
  step(s); const mk = s.marks.find(m => m.what === 'cauldron_boil')!;
  const age = s.t - m.attackAt!, fraction = (s.t - mk.t0) / (mk.t1 - mk.t0);
  s.freezeT = s.t + 10; for (let i = 0; i < 10; i++) step(s);
  assert.equal(s.t - m.attackAt!, age); assert.equal((s.t - mk.t0) / (mk.t1 - mk.t0), fraction);
});

test('charged Q only cancels boil during the last window and near the body', () => {
  for (const [age, distance, cancel] of [[.15, 2, false], [.55, 8, false], [.55, 2, true]] as const) {
    const s = empty(65); spawnBosses(s, 20); const m = s.mobs.find(m => m.k === 'cauldronmaster')!;
    m.attackKind = 'boil'; m.attackAt = s.t - Math.round(age * 30); m.st = 'wind';
    hurtMob(s, m, 1, 'q', m.x - distance, m.z, 0, 30, 0);
    assert.equal(m.attackStep === -1, cancel);
  }
});

test('cauldron aims its real contact cup at the hero and has no old invisible sector', () => {
  const s = empty(66); s.hero.invT = 0; spawnBosses(s, 20); const b = s.bosses[0], m = s.mobs.find(m => m.id === b.id)!;
  m.x = s.hero.x + 2.6; m.z = s.hero.z; b.act = 'pause'; b.actT = -100; b.rot = 0;
  step(s); const mk = s.marks.find(m => m.what === 'cauldron_ladle')!;
  assert.equal(mk.k, 'circle'); assert.equal(mk.r, .54);
  assert.equal(mk.localRight, undefined, 'the announced cup stays fixed in world space');
  assert.ok(Math.hypot(wrapD(mk.x - s.hero.x), wrapD(mk.z - s.hero.z)) < mk.r + .45, 'the cup is aimed at the hero');
  const hp = s.hero.hp; while (s.t < mk.t1) step(s); assert.equal(s.hero.hp, hp); step(s); assert.ok(s.hero.hp < hp);
});

test('out of melee reach the cauldron uses its real ranged pour', () => {
  const s = empty(68); spawnBosses(s, 20); const b = s.bosses[0]; b.act = 'pause'; b.actT = -100; b.rot = 0;
  step(s); assert.equal(b.act, 'pour'); assert.equal(s.marks.filter(m=>m.what==='cauldron_pour').length,6);
});

test('rail warning and actual shot follow body knockback with locked aim', () => {
  const s=empty(70);s.hero.invT=0;s.hero.x=120;s.hero.z=120;
  const m=spawnMob(s,'railhopper',130,120,0);m.cd=0;m.spd=0;step(s);
  const mark=s.marks.find(m=>m.what==='rail_warn')!,dx=mark.dx,dz=mark.dz;
  s.hero.z=120.95;hurtMob(s,m,1,'charges',130,119,1.2,0,0);
  while(s.t<mark.t1)step(s);const hp=s.hero.hp;
  assert.equal(hp,100);assert.ok(Math.abs(mark.z-m.z)<1e-9);assert.equal(mark.dx,dx);assert.equal(mark.dz,dz);
  step(s);const shot=s.shots.find(s=>s.k==='rail')!;
  assert.ok(Math.abs(mark.z-m.z)<1e-9);assert.ok(Math.abs(shot.z-mark.z)<1e-9);assert.equal(shot.dx,dx);assert.equal(shot.dz,dz);
  const width=mark.w/2+.45;assert.ok(Math.abs(s.hero.z-mark.z)<width,'hero is within the actual displayed lane');
  for(let i=0;i<40&&s.hero.hp===hp;i++)step(s);assert.ok(s.hero.hp<hp);
});

test('actual charged Q holds the plant clock and placement follows the displaced hand',()=>{
  const s=empty(72);s.wave.hpMul=6;s.hero.x=120;s.hero.z=120;
  const m=spawnMob(s,'wickmole',125.1,120,0);m.spd=0;m.cd=100;
  applyEvent(s,{t:s.t,k:'q',on:1});for(let i=0;i<31;i++)step(s);m.cd=0;step(s);
  const mark=s.marks.find(m=>m.what==='plant_warn')!,start=mark.t1,initialX=mark.x;
  applyEvent(s,{t:s.t,k:'q',on:0});step(s);assert.equal(m.hp,m.hpMax-80);assert.ok(m.stunT>s.t);assert.ok(mark.t1>start);
  while(s.enemyCharges.length===0&&s.t<120)step(s);const charge=s.enemyCharges[0];assert.ok(charge);
  const a=D.mobs.find(m=>m.id==='wickmole')!.plant!;assert.ok(Math.abs(charge.x-wrapP(m.x+m.ax*a.forward+m.az*a.right))<1e-9);assert.ok(Math.abs(charge.z-wrapP(m.z+m.az*a.forward-m.ax*a.right))<1e-9);assert.ok(Math.abs(charge.x-initialX)>3);
  const x=charge.x,z=charge.z;hurtMob(s,m,1,'test',m.x-1,m.z,1.2,0,0);step(s);assert.equal(charge.x,x);assert.equal(charge.z,z);
});

test('death from actual Q before plant cancels the placement entirely',()=>{
  const s=empty(74);s.hero.x=120;s.hero.z=120;const m=spawnMob(s,'wickmole',125.1,120,0);m.cd=100;m.spd=0;
  m.hp=80; // Удар Q добивает раненого сапёра; полное здоровье нового врага выше урона Q.
  applyEvent(s,{t:s.t,k:'q',on:1});for(let i=0;i<31;i++)step(s);m.cd=0;step(s);applyEvent(s,{t:s.t,k:'q',on:0});step(s);
  assert.ok(m.die);for(let i=0;i<50;i++)step(s);assert.equal(s.enemyCharges.length,0);assert.equal(s.marks.filter(k=>k.src===m.id).length,0);
});

test('plant warning and first charge remain wrapped at the tor seam',()=>{
  const s=empty(76);s.hero.x=5.1;s.hero.z=.1;const m=spawnMob(s,'wickmole',239.9,.1,0);m.cd=0;m.spd=0;step(s);
  const mark=s.marks.find(m=>m.what==='plant_warn')!;m.x=239.9;m.z=.1;syncPhysicalMarks(s);assert.ok(mark.x>=0&&mark.x<240&&mark.z>=0&&mark.z<240);
  while(s.enemyCharges.length===0&&s.t<80)step(s);const c=s.enemyCharges[0];assert.ok(c);assert.ok(c.x>=0&&c.x<240&&c.z>=0&&c.z<240);
});
