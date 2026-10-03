import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as F from '../shared/fort.ts';
import { FortGame } from '../server/fort/game.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { buildFort, WALL_H } from '../shared/fortmap.ts';
import { CollisionWorld } from '../shared/world.ts';
import { BTN_FORWARD, BTN_JUMP, makeEvents, makeInput, makeState, stepPlayer } from '../shared/sim.ts';
const sink = { sendJson() {}, sendBinary() {}, close() {} };
function add(g: FortGame, pid: number) { return g.addHuman({ pid, nick: `P${pid}`, outfit: DEFAULT_OUTFIT }, sink)!; }
function start(n = 1, wave = 1) {
  const g = new FortGame();
  const p = Array.from({length: n}, (_, i) => add(g, i + 1));
  g.wave = wave - 1;
  g.phaseEnd = g.tick + 1;
  g.step();
  return {g, p};
}
test('each 1–6 defender wave has at least proportional HP work; ordinary HP stays bounded', () => {
  for (let w = 1; w <= 8; w++) {
    const work = (n: number) => F.waveCounts(w, n).reduce((v, count, kind) => v + count * F.zombieHp(kind, n), 0);
    for (let n = 2; n <= 6; n++) assert.ok(work(n) >= n * work(1), `wave ${w}, ${n} defenders: ${work(n)} / ${work(1)}`);
  }
  assert.ok(F.zombieHp(F.Z_WALKER, 6) <= 84);
  assert.ok(F.waveCounts(1, 1)[F.Z_WALKER] >= 14);
});
test('late joins add exact quota delta, rescale existing fraction, leave/rejoin cannot erase or duplicate it', () => {
  const {g, p} = start(1, 8);
  g.tick += 31; g.horde.step();
  const b = g.horde.zombies.find(z => z.alive && z.kind === F.Z_BOSS)!;
  b.hp = b.maxHp * .5;
  const left = g.horde.left;
  const q = add(g, 2);
  const diff = F.waveCounts(8, 2).reduce((s,v,k) => s + v - F.waveCounts(8,1)[k], 0);
  assert.equal(g.horde.left, left + diff);
  assert.equal(b.maxHp, F.zombieHp(F.Z_BOSS, 2));
  assert.equal(b.hp / b.maxHp, .5);
  g.removePlayer(q.id);
  assert.equal(b.maxHp, F.zombieHp(F.Z_BOSS, 2));
  add(g, 3);
  assert.equal(g.horde.left, left + diff);
  assert.equal(p[0].waves, 0);
});
test('1/2/4/6 defender schedules keep pending enemies and never exceed 60 alive', () => {
  for (const n of [1,2,4,6]) {
    const {g} = start(n, 8);
    const total = F.waveCounts(8,n).reduce((a,b) => a+b,0);
    g.tick += 10000;
    g.horde.step();
    assert.equal(g.horde.alive, 60);
    assert.equal(g.horde.pending, total - 60);
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
test('both exterior return stairs are walkable after a real wall jump, with intact gates', () => {
  for (const side of [-1,1]) {
    const world = new CollisionWorld(buildFort());
    const s = makeState(); const i=makeInput(), e=makeEvents();
    Object.assign(s,{x:side*16.5,y:WALL_H,z:1,grounded:true});
    i.yaw=-side*Math.PI/2; i.buttons=BTN_FORWARD|BTN_JUMP;
    for(let t=0;t<70;t++){ i.seq++; if(t>0)i.buttons=BTN_FORWARD; stepPlayer(s,i,world,false,1,e); }
    i.buttons=0; for(let t=0;t<90;t++)stepPlayer(s,i,world,false,1,e);
    assert.ok(side*s.x>18 && s.y<.01, 'jumped outside and landed');
    for(const [x,z] of [[side*24,6.5],[side*24,8],[side*21.4,8],[side*21.4,-1],[side*16.5,-1]]) {
      for(let t=0;t<1200 && Math.hypot(s.x-x,s.z-z)>.22;t++){
        i.seq++;i.yaw=Math.atan2(-(x-s.x),-(z-s.z));i.buttons=BTN_FORWARD;stepPlayer(s,i,world,false,1,e);
      }
      assert.ok(Math.hypot(s.x-x,s.z-z)<.5,`side ${side}: could not reach ${x},${z}; at ${s.x},${s.y},${s.z}`);
    }
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
  assert.equal(g.horde.left,F.waveCounts(2,1).reduce((a,b)=>a+b,0));
});

test('late-join reinforcements have grace, preserve bounty and cannot award finished-wave credit', () => {
  const {g,p}=start();
  // At wave start no initial or incremental enemies have yet spawned.
  const q=add(g,2); const pending=g.horde.pending;
  g.horde.step(); assert.equal(g.horde.alive,0);assert.equal(g.horde.pending,pending);
  // A single credited kill distributes one bounty even after a roster change.
  const z=g.horde.spawn(F.Z_WALKER,1)!;const points=p[0].pts+q.pts;
  g.horde.damage(z,999,q.id,false,z.x,z.y,z.z);
  assert.equal(p[0].pts+q.pts-points,F.ZK[F.Z_WALKER].pts);
  const reused=q.id;g.removePlayer(q.id);const r=add(g,3);assert.equal(r.id,reused);
  // Remove enemies through normal damage; suppress scheduled spawns only to finish this controlled wave.
  g.horde.clear();g.step();
  assert.equal(p[0].waves,1);assert.equal(r.waves,0);
});

test('1/2/4/6 defender late waves retain boss warning and open-core duration, with bounded scaled adds', () => {
  for(const n of [1,2,4,6]) {
    const {g}=start(n,8);
    const b=g.horde.spawn(F.Z_BOSS,1)!;
    Object.assign(b,{x:0,z:-23,state:F.ZS_WALK,t:0,hp:b.maxHp*.32});
    g.horde.step();
    assert.equal(b.t,F.BOSS_WARN_TICKS);assert.equal(b.state,F.ZS_BOSS_GATE);
    assert.equal(g.horde.alive,1+2+Math.ceil((n-1)*.6)+4+(n-1));
    const adds=g.horde.alive;g.horde.step();assert.equal(g.horde.alive,adds);
    b.t=1;g.horde.step();assert.equal(b.state,F.ZS_BOSS_OPEN);assert.equal(b.t,F.BOSS_OPEN_TICKS);
  }
});
