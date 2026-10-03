import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as F from '../shared/fort.ts';
import { FortGame } from '../server/fort/game.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { killBounty } from '../shared/fortarsenal.ts';
import { makeFortStep, stepFort } from '../shared/fortgun.ts';
import { LADDERS } from '../shared/fortladder.ts';
import { buildFort, WALL_H } from '../shared/fortmap.ts';
import { CollisionWorld } from '../shared/world.ts';
import { BTN_FORWARD, BTN_JUMP, makeEvents, makeInput, makeState } from '../shared/sim.ts';
import { budgetHp, planCounts, planWave, type WavePlan } from '../server/fort/director.ts';
import { bossHp, teamEarlyBoost, teamPressure } from '../shared/fortwaves.ts';
import { FEATURES } from '../server/fort/director.ts';
const sink = { sendJson() {}, sendBinary() {}, close() {} };
function add(g: FortGame, pid: number) { return g.addHuman({ pid, nick: `P${pid}`, outfit: DEFAULT_OUTFIT }, sink)!; }
/** Игра с n защитниками сразу на волне wave; seed — зерно директора (иначе случайное, как в игре) */
function start(n = 1, wave = 1, seed = 0) {
  const g = new FortGame();
  const p = Array.from({length: n}, (_, i) => add(g, i + 1));
  if (seed) g.seed = seed;
  g.wave = wave - 1;
  g.phaseEnd = g.tick + 1;
  g.step();
  return {g, p};
}
/** HP всей волны по плану в бюджете (без босса) */
function work(plan: WavePlan): number {
  let hp = 0;
  for (const s of plan.spawns) hp += budgetHp(s.kind, s.tier, plan.w, plan.defenders, plan.hpScale);
  for (const b of plan.boats) b.crew.forEach((k, i) => { hp += budgetHp(k, b.tiers[i], plan.w, plan.defenders, plan.hpScale); });
  return hp;
}
const total = (plan: WavePlan) => planCounts(plan).reduce((a, b) => a + b, 0);
test('с людьми HP волны растёт, на одного — по нагрузке команды arsenal; обычные не толстеют без меры', () => {
  for (let w = 1; w <= 40; w++) {
    const one = work(planWave(w, 1, 77));
    let prev = one;
    for (let n = 2; n <= 6; n++) {
      const many = work(planWave(w, n, 77));
      assert.ok(many > prev, `wave ${w}, ${n} defenders: ${many} / ${prev}`);
      // на одного: (3/n)^0,4, соло ×1,77 (щиты и кастрюли в бюджете — допуск на состав)
      const per = many / n / one;
      const want = teamPressure(n) / teamPressure(1) * teamEarlyBoost(w, n);
      assert.ok(Math.abs(per / want - 1) < 0.2, `wave ${w}, ${n}: на одного ${per.toFixed(3)} / ${want.toFixed(3)}`);
      prev = many;
    }
  }
  const six = planWave(1, 6, 77);
  assert.ok(F.ZK[F.Z_WALKER].hp * six.hpScale <= 60 * 1.45, 'шаркун на 1-й волне у шестерых — не толще ×1,45');
  assert.ok(planCounts(planWave(1, 1, 77))[F.Z_WALKER] >= 14);
});
test('late joins add exact quota delta, rescale existing fraction, leave/rejoin cannot erase or duplicate it', () => {
  const {g, p} = start(1, 7);
  g.tick += 31; g.horde.step();
  const b = g.horde.zombies.find(z => z.alive && z.kind === F.Z_BOSS)!;
  b.hp = b.maxHp * .5;
  const left = g.horde.left;
  const q = add(g, 2);
  const diff = total(planWave(7, 2, g.seed)) - total(planWave(7, 1, g.seed));
  assert.ok(diff > 0);
  assert.equal(g.horde.left, left + diff);
  assert.ok(Math.abs(b.maxHp - bossHp(7, 2)) < 1e-6, `${b.maxHp} vs ${bossHp(7, 2)}`);
  assert.ok(Math.abs(b.hp / b.maxHp - .5) < 1e-9);
  g.removePlayer(q.id);
  assert.ok(Math.abs(b.maxHp - bossHp(7, 2)) < 1e-6);
  add(g, 3);
  assert.equal(g.horde.left, left + diff);
  assert.equal(p[0].waves, 0);
});
test('1/2/4/6 defender schedules keep pending enemies and never exceed 60 alive', (t) => {
  // только суша: от двоих десант идёт часто (у четверых — каждую волну), лодки и экипаж — в своих тестах (fort-sea)
  const sea = FEATURES.sea;
  FEATURES.sea = false;
  t.after(() => { FEATURES.sea = sea; });
  for (const n of [1,2,4,6]) {
    // зерно задано: при случайном раз в ~130 игр на 30-й волне у четверых выходило меньше 60 тел (тяжёлая тема)
    const {g} = start(n, 30, 77);
    const all = total(g.plan!);
    assert.ok(n < 4 || all > 60, `${n}: ${all}`);
    g.tick += 10000;
    g.horde.step();
    assert.equal(g.horde.alive, Math.min(60, all));
    assert.equal(g.horde.pending, all - Math.min(60, all));
    assert.equal(g.horde.cleared, false);
  }
});
test('combat bell protects structures only, has one team cooldown, and expires exactly', () => {
  const {g,p} = start(2);
  const bell = g.map.stations.find(s => s.kind === 'bell')!;
  Object.assign(p[0].state, {x:bell.x,y:bell.y,z:bell.z});
  g.use(p[0], bell.id);
  const gate = g.gate, crystal = g.crystal, hp = p[0].hp;
  g.hitGate(100); g.hitCrystal(100); g.hitPlayer(1,p[0].id,20);
  assert.equal(g.gate, gate - 50); assert.equal(g.crystal, crystal - 50); assert.equal(p[0].hp,hp-20);
  g.tick += 8 * 60;
  Object.assign(p[1].state, {x:bell.x,y:bell.y,z:bell.z});
  g.use(p[1], bell.id); g.hitGate(100);
  assert.equal(g.gate,gate - 150, 'second player cannot bypass cooldown');
  g.tick += 22 * 60;
  g.use(p[1], bell.id); g.hitGate(100);
  assert.equal(g.gate,gate - 200);
});
test('both exterior return ladders bring a defender back on the wall after a real wall jump, with intact gates', () => {
  for (const side of [-1,1]) {
    const world = new CollisionWorld(buildFort());
    const s = makeState(); const i=makeInput(), e=makeEvents(); const f=makeFortStep(); const load={heavy:0,rate:0,mag:0};
    Object.assign(s,{x:side*16.5,y:WALL_H,z:1,grounded:1});
    i.yaw=-side*Math.PI/2; i.buttons=BTN_FORWARD|BTN_JUMP;
    for(let t=0;t<70;t++){ i.seq++; if(t>0)i.buttons=BTN_FORWARD; stepFort(f,s,i,world,false,1,e,load); }
    i.buttons=0; for(let t=0;t<90;t++)stepFort(f,s,i,world,false,1,e,load);
    assert.ok(side*s.x>18 && s.y<.01, 'jumped outside and landed');
    const l=LADDERS.find(x=>x.name===(side<0?'west-out':'east-out'))!;
    // to the foot of the ladder, then face the wall: W climbs, at the top a step onto the wall walk
    for(const [x,z] of [[l.x+l.nx*3,l.z],[l.x+l.nx*.5,l.z],[side*16.5,l.z]]) {
      for(let t=0;t<1200 && Math.hypot(s.x-x,s.z-z)>.22;t++){
        i.seq++;i.yaw=Math.atan2(-(x-s.x),-(z-s.z));i.buttons=BTN_FORWARD;stepFort(f,s,i,world,false,1,e,load);
      }
      assert.ok(Math.hypot(s.x-x,s.z-z)<.5,`side ${side}: could not reach ${x},${z}; at ${s.x},${s.y},${s.z}`);
    }
    i.buttons=0; for(let t=0;t<30;t++)stepFort(f,s,i,world,false,1,e,load);
    assert.ok(Math.abs(s.y-WALL_H)<.02, `returned to wall: y=${s.y}`);
  }
});

test('combat bell rejects distant, dead, foreign players and end phase; next wave resets roster', () => {
  const {g,p}=start(2);
  const bell=g.map.stations.find(s=>s.kind==='bell')!;
  Object.assign(p[0].state,{x:0,y:0,z:-40});
  g.use(p[0],bell.id); assert.equal(g.rallyUntil,0);
  Object.assign(p[0].state,{x:bell.x,y:bell.y,z:bell.z});
  p[0].alive=false; g.use(p[0],bell.id); assert.equal(g.rallyUntil,0);
  p[0].alive=true; g.use({...p[0]} as typeof p[0],bell.id); assert.equal(g.rallyUntil,0);
  g.phase=F.FT_END;g.use(p[0],bell.id);assert.equal(g.rallyUntil,0);
  g.removePlayer(p[1].id);
  g.horde.clear();g.phase=F.FT_BREAK;g.phaseEnd=g.tick+1;g.step();
  assert.equal(g.horde.defenders,1);
  assert.equal(g.horde.left,total(planWave(2,1,g.seed)));
});

test('late-join reinforcements have grace, preserve bounty and cannot award finished-wave credit', () => {
  const {g,p}=start();
  // At wave start no initial or incremental enemies have yet spawned.
  const q=add(g,2); const pending=g.horde.pending;
  g.horde.step(); assert.equal(g.horde.alive,0);assert.equal(g.horde.pending,pending);
  // A single credited kill distributes one bounty even after a roster change.
  const gold=()=>p[0].run.arsenal.gold+q.run.arsenal.gold;
  const z=g.horde.spawn(F.Z_WALKER,1)!;const before=gold();
  g.horde.damage(z,999,q.id,false,z.x,z.y,z.z);
  assert.equal(gold()-before,killBounty(F.Z_WALKER,1),'share of one kill goes to the shooter once (rest — to the wave pot)');
  const reused=q.id;g.removePlayer(q.id);const r=add(g,3);assert.equal(r.id,reused);
  // Remove enemies through normal damage; suppress scheduled spawns only to finish this controlled wave.
  g.horde.clear();g.step();
  assert.equal(p[0].waves,1);assert.equal(r.waves,0);
});

test('1/2/4/6 defender late waves retain boss warning and open-core duration, with bounded scaled adds', () => {
  for(const n of [1,2,4,6]) {
    const {g}=start(n,7);
    const b=g.horde.spawn(F.Z_BOSS,1)!;
    Object.assign(b,{x:0,z:-23,state:F.ZS_WALK,t:0,hp:b.maxHp*.32});
    g.horde.step();
    assert.equal(b.t,F.BOSS_WARN_TICKS);assert.equal(b.state,F.ZS_BOSS_GATE);
    assert.equal(g.horde.alive,1+3+Math.ceil((n-1)*.8),'ярость: одна стая крылаток по числу защитников');
    const adds=g.horde.alive;g.horde.step();assert.equal(g.horde.alive,adds);
    b.t=1;g.horde.step();assert.equal(b.state,F.ZS_BOSS_OPEN);assert.equal(b.t,F.BOSS_OPEN_TICKS);
  }
});
