import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FortGame } from '../server/fort/game.ts';
import { budgetHp, planWave, SIEGE_FEATURES } from '../server/fort/director.ts';
import { FT_WAVE, ZS_TOP, Z_WALKER, type FortEvent } from '../shared/fort.ts';
import { Z_BOAT } from '../shared/fortkinds.ts';
import { ACT_GATE, GUN_CROSSBOW, repairPrice } from '../shared/fortarsenal.ts';
import { EYE_HEIGHT } from '../shared/constants.ts';
import { HEAVY_IN_HANDS } from '../shared/fortgun.ts';
import { BTN_ADS, makeInput } from '../shared/sim.ts';
import { CLIMBS, WALL_H } from '../shared/fortmap.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { EV_METEORS, EV_NONE } from '../shared/fortwaves.ts';
import * as S from '../shared/fortsiege.ts';

function fixture(enabled = true) {
  const g = new FortGame({ siege: enabled });
  const p = g.addHuman({ pid: 77, nick: 'SiegeTester', outfit: DEFAULT_OUTFIT }, { sendJson() {}, sendBinary() {}, close() {} })!;
  const events: FortEvent[] = [];
  const original = g.event.bind(g);
  g.event = (e) => { events.push(e); original(e); };
  g.phase = FT_WAVE;
  g.wave = 40;
  p.run.arsenal.gold = 10000;
  const step = (n: number) => { for (let i = 0; i < n; i++) { g.tick++; g.horde.step(); g.arsenal.step(); } };
  return { g, p, events, step };
}

test('old repair accepts multiple purchases in one tick; siege repair requires completed work and a shared pause', () => {
  const old = fixture(false);
  const st = old.g.map.stations.find((s) => s.kind === 'gate')!;
  Object.assign(old.p.state, { x: st.x, y: st.y, z: st.z });
  old.g.gate = 100;
  old.g.use(old.p, ACT_GATE); old.g.use(old.p, ACT_GATE);
  assert.equal(old.g.gate, 900, 'baseline proof: 800 HP repaired in one server tick');
  const { g, p, step } = fixture();
  Object.assign(p.state, { x: st.x, y: st.y, z: st.z });
  g.gate = 100;
  const gold = p.run.arsenal.gold;
  g.use(p, ACT_GATE); g.use(p, ACT_GATE);
  assert.equal(g.gate, 100);
  assert.equal(p.run.arsenal.gold, gold);
  step(S.REPAIR_WORK_TICKS);
  assert.equal(g.gate, 500);
  assert.equal(p.run.arsenal.gold, gold - repairPrice(g.wave));
  g.use(p, ACT_GATE); step(S.REPAIR_WORK_TICKS);
  assert.equal(g.gate, 500);
});

test('interrupted repair spends nothing and never heals a fallen gate', () => {
  const { g, p, step, events } = fixture();
  const st = g.map.stations.find((s) => s.kind === 'gate')!;
  Object.assign(p.state, { x: st.x, y: st.y, z: st.z });
  g.gate = 100;
  g.use(p, ACT_GATE);
  p.state.x += 2;
  step(S.REPAIR_WORK_TICKS);
  assert.equal(g.gate, 100); assert.equal(p.run.arsenal.gold, 10000);
  assert.ok(events.some((e) => e[0] === 'repair' && e[5] === 2));
});

test('new director preserves health budget, boss health and capped old rosters for 1/2/4', () => {
  for (const n of [1, 2, 4]) {
    for (const w of [10, 12, 15, 16, 18, 24, 30, 56, 63, 91, 98]) {
      const p = planWave(w, n, 11, undefined, SIEGE_FEATURES);
      const old = planWave(w, n, 11);
      assert.equal(p.siege, true);
      if (S.newBossKind(w) >= 0) {
        assert.equal(p.boss, S.newBossKind(w));
        assert.equal(p.bossHp, old.bossHp);
      }
      const fresh = p.spawns.filter((s) => s.kind >= S.Z_ROPECRAB);
      const hp = (p: ReturnType<typeof planWave>) => p.spawns.reduce((sum, s) => sum + budgetHp(s.kind, s.tier, w, n, p.hpScale), 0)
        + p.boats.reduce((sum, b) => sum + b.crew.reduce((s, k, i) => s + budgetHp(k, b.tiers[i], w, n, p.hpScale), 0), 0);
      assert.ok(Math.abs(hp(p) / hp(old) - 1) < .001, 'new bodies spend the existing land HP target');
      assert.ok(fresh.length <= 2);
      assert.ok(fresh.every((s) => s.tier === 0));
      assert.ok(p.spawns.filter((s) => s.kind < S.Z_ROPECRAB).length >= p.spawns.length * .6);
      if (fresh.length) assert.equal(p.event, 0);
    }
    const boats = planWave(13, n, 9, undefined, SIEGE_FEATURES).boats;
    assert.equal(boats.filter((b) => b.anchor).length, 1);
  }
});

test('failed siege gets an ordinary recovery wave, while a scheduled boss keeps priority', () => {
  const p = planWave(18, 4, 11, { wave: 16, kind: EV_NONE, siegeFailureWave: 17 }, SIEGE_FEATURES);
  assert.ok(p.spawns.every((z) => z.kind < S.Z_ROPECRAB));
  assert.equal(p.event, EV_NONE);
  const boss = planWave(56, 4, 11, { wave: 53, kind: EV_NONE, siegeFailureWave: 55 }, SIEGE_FEATURES);
  assert.equal(boss.boss, S.Z_CRABCRANE);
});

test('launched battery shell survives destruction; a killed crew cannot launch its pending shot', () => {
  const { g, step, events } = fixture();
  const battery = g.horde.spawn(S.Z_BATTERY, 1)!;
  Object.assign(battery, { x: -10, z: -30, state: S.ZS_SIEGE_WINDUP, t: 2, chase: -1, toX: 0, toY: 1.5, toZ: -16 });
  step(2);
  assert.ok(events.some((e) => e[0] === 'throw' && e[8] === S.ZS_SIEGE_SHELL));
  g.horde.kill(battery, 1);
  assert.equal(g.horde.cleared, false, 'launched shell remains part of combat until impact');
  const gate = g.gate;
  step(S.BATTERY_FLIGHT_TICKS);
  assert.equal(g.gate, gate - S.BATTERY_GATE_DAMAGE);
  const pending = g.horde.spawn(S.Z_BATTERY, 1)!;
  Object.assign(pending, { state: S.ZS_SIEGE_WINDUP, t: 2, chase: -1, toY: 1.5, toZ: -16 });
  g.horde.kill(pending, 1);
  const after = g.gate;
  step(S.BATTERY_FLIGHT_TICKS + 10);
  assert.equal(g.gate, after);
  assert.ok(events.some((e) => e[0] === 'warnend' && e[1] === pending.id));
});

test('meteor follows exact ray geometry, requires team-sized hits, and a shot-down rock cannot damage structures', () => {
  for (const n of [1, 2, 4]) {
    const { g, events } = fixture();
    g.waveEvents.start({ ...planWave(20, n, 11, undefined, SIEGE_FEATURES), event: EV_METEORS }, 0);
    let meteor: Extract<FortEvent, ['meteor', ...number[]]> | undefined;
    for (let i = 0; i < 2000 && !meteor; i++) {
      g.tick++; g.waveEvents.step();
      meteor = events.find((e): e is Extract<FortEvent, ['meteor', ...number[]]> => e[0] === 'meteor' && e[2] === 0);
    }
    assert.ok(meteor);
    assert.equal(meteor[11], S.meteorHits(n));
    g.tick += 60;
    const u = (g.tick - meteor[9]) / (meteor[10] - meteor[9]);
    const x = meteor[3] + (meteor[6] - meteor[3]) * u;
    const y = meteor[4] + (meteor[7] - meteor[4]) * u;
    const z = meteor[5] + (meteor[8] - meteor[5]) * u;
    const target = g.waveEvents.meteorRay(x, y, z + 10, 0, 0, -1, 20);
    assert.equal(target?.id, meteor[1]);
    assert.ok(Math.abs(target!.t - (10 - S.SIEGE_METEOR_BODY)) < .01);
    for (let i = 0; i < S.meteorHits(n); i++) assert.equal(g.waveEvents.hitMeteor(meteor[1]), true);
    assert.equal(g.waveEvents.hitMeteor(meteor[1]), false);
    const gate = g.gate;
    while (g.tick <= meteor[10]) { g.tick++; g.waveEvents.step(); }
    assert.equal(g.gate, gate);
    assert.ok(events.some((e) => e[0] === 'meteor' && e[1] === meteor![1] && e[2] === 2));
  }
});

test('unanswered meteor is dangerous, and ending the event cancels its live marks for everyone', () => {
  const { g, events } = fixture();
  g.waveEvents.start({ ...planWave(20, 1, 11, undefined, SIEGE_FEATURES), event: EV_METEORS }, 0);
  for (let i = 0; i < 2000 && !events.some((e) => e[0] === 'meteor'); i++) { g.tick++; g.waveEvents.step(); }
  const live = g.waveEvents.replay();
  const meteor = live.find((e) => e[0] === 'meteor')!;
  const gate = g.gate;
  while (g.tick <= meteor[10]) { g.tick++; g.waveEvents.step(); }
  assert.equal(g.gate, gate - S.SIEGE_METEOR_GATE);
  for (let i = 0; i < S.SIEGE_METEOR_GAP && !g.waveEvents.replay().some((e) => e[0] === 'meteor'); i++) { g.tick++; g.waveEvents.step(); }
  const remaining = g.waveEvents.replay().filter((e) => e[0] === 'meteor');
  assert.ok(remaining.length);
  g.waveEvents.stop();
  assert.deepEqual(g.waveEvents.replay(), []);
  for (const m of remaining) assert.ok(events.some((e) => e[0] === 'meteor' && e[1] === m[1] && e[2] === 4));
});

test('canopies cover only three old bodies, never stack, and a precise hit removes that cover', () => {
  const { g } = fixture();
  const canopy = g.horde.spawn(S.Z_CANOPY, 1)!;
  Object.assign(canopy, { x: 0, z: -25, yaw: Math.PI, state: S.ZS_SIEGE_ACTION });
  const walkers = [1, 2, 3, 4].map((x) => {
    const z = g.horde.spawn(Z_WALKER, 1)!; Object.assign(z, { x, z: -25 }); return z;
  });
  assert.deepEqual(walkers.map((z) => g.horde.siege.cover(z, 0, -15)), [.65, .65, .65, 1]);
  assert.equal(g.horde.siege.cover(walkers[0], 0, -35), 1, 'flank/back shot bypasses shelter');
  g.horde.damage(canopy, .01, 1, true, 0, 1.6, -25);
  assert.ok(walkers.every((z) => g.horde.siege.cover(z, 0, -15) === 1));
});

test('crossbow weakpoint hit folds a canopy with x1.6 body damage, without multiplying its normal x2.5 headshot', () => {
  const { g, p } = fixture();
  Object.assign(p.state, { x: 0, y: 0, z: -34, awp: HEAVY_IN_HANDS, shots: 1 });
  p.load.heavy = GUN_CROSSBOW;
  p.ev.aimYaw = 0; p.ev.aimPitch = Math.atan2(1.65 - EYE_HEIGHT, 6); p.ev.spread = 0;
  const canopy = g.horde.spawn(S.Z_CANOPY, 1)!;
  Object.assign(canopy, { x: 0, z: -40, yaw: 0, hp: 1000, maxHp: 1000, state: S.ZS_SIEGE_ACTION });
  g.arsenal.fire(p, { ...makeInput(), buttons: BTN_ADS, viewTick: g.tick });
  assert.equal(canopy.state, S.ZS_SIEGE_OPEN);
  assert.equal(1000 - canopy.hp, 120 * 1.6);
});

test('tower moves existing bodies to wall; broken bridge cancels future transfers', () => {
  const { g, step } = fixture();
  const tower = g.horde.spawn(S.Z_SIEGE_TOWER, 1)!;
  Object.assign(tower, { x: -12.5, z: -19, state: S.ZS_SIEGE_APPROACH });
  const walker = g.horde.spawn(Z_WALKER, 1)!;
  Object.assign(walker, { x: -11, z: -21 });
  const before = g.horde.alive;
  step(S.SIEGE_DEPLOY_TICKS + S.BOARD_TICKS + 200);
  assert.equal(g.horde.alive, before);
  assert.ok(walker.state === S.ZS_BOARD || walker.y > 0 || walker.z > -16, 'existing walker crossed the wall');
  for (let i = 0; i < 4; i++) g.horde.damage(tower, .01, 1, true, tower.x, 4.2, tower.z);
  assert.equal(tower.state, S.ZS_SIEGE_SPENT);
});

test('mushroom throws existing walkers, and its death does not erase already airborne walkers', () => {
  const { g, step } = fixture();
  const mushroom = g.horde.spawn(S.Z_SPRING, 1)!;
  Object.assign(mushroom, { x: 12.5, z: -18, state: S.ZS_SIEGE_APPROACH });
  const walker = g.horde.spawn(Z_WALKER, 1)!;
  Object.assign(walker, { x: 12, z: -20 });
  for (let i = 0; i < 600 && walker.state !== S.ZS_BOARD; i++) step(1);
  assert.equal(walker.state, S.ZS_BOARD);
  g.horde.kill(mushroom, 1);
  step(S.BOARD_TICKS);
  assert.ok(walker.alive);
  assert.equal(walker.y, WALL_H);
  assert.equal(walker.state, ZS_TOP);
});

test('anchor boat does not teleport cargo: four-second setup, visible arc, severing stops next wall boarding', () => {
  const { g, step } = fixture();
  const boat = g.horde.spawn(Z_BOAT, 1)!;
  Object.assign(boat, { x: -12.5, y: -.4, z: 27.5, anchor: true, state: S.ZS_SIEGE_DEPLOY,
    t: S.SIEGE_DEPLOY_TICKS, toX: -12.5, toY: WALL_H, toZ: 12.3 });
  boat.cargo.push(Z_WALKER, Z_WALKER); boat.cargoTier.push(0, 0); g.horde.cargo += 2;
  step(S.SIEGE_DEPLOY_TICKS - 1);
  assert.equal(boat.cargo.length, 2);
  step(S.BOARD_TICKS + 3);
  const passenger = g.horde.zombies.find((z) => z.alive && z.crew)!;
  assert.ok(passenger);
  assert.equal(passenger.climb, CLIMBS.length - 2);
  g.horde.siege.cutAnchor(boat, 1, 3);
  assert.equal(boat.anchor, false);
  assert.equal(boat.state, S.ZS_SIEGE_OPEN);
  assert.ok(passenger.alive, 'cutting rope cannot reverse a completed boarding');
});

test('precision boss interruption opens a real damage window and cancels its pending strike', () => {
  const { g, step, events } = fixture();
  for (const kind of [S.Z_CRABCRANE, S.Z_MILLER]) {
    const boss = g.horde.spawn(kind, 1)!;
    Object.assign(boss, { x: 0, z: -25, state: S.ZS_SIEGE_WINDUP, t: 108, toX: 0, toY: 1, toZ: -16 });
    for (let i = 0; i < 3; i++) g.horde.damage(boss, .01, 1, true, 0, 3, -25);
    assert.equal(boss.state, S.ZS_SIEGE_OPEN);
    assert.ok(events.some((e) => e[0] === 'warnend' && e[1] === boss.id));
    const before = boss.hp;
    g.horde.damage(boss, 100, 1, false, 0, 2, -25);
    assert.equal(before - boss.hp, 100);
    step(1);
    g.horde.kill(boss, 1);
  }
});

test('pending specialist keeps a place inside the old sixty-body cap', () => {
  const { g, step } = fixture();
  const p = planWave(30, 4, 11, undefined, SIEGE_FEATURES);
  p.boats = [];
  p.spawns = [...Array.from({ length: 60 }, () => ({ kind: Z_WALKER, road: 1, tier: 0, at: 0 })),
    { kind: S.Z_ROPECRAB, road: 1, tier: 0, at: 10 }];
  g.horde.startWave(p, 0);
  step(1);
  assert.equal(g.horde.alive, 54);
  step(9);
  assert.ok(g.horde.zombies.some((z) => z.alive && z.kind === S.Z_ROPECRAB));
  assert.ok(g.horde.alive <= 60);
});

test('ropecrab has a reachable rope fastening on top of the wall and precision there stops the route', () => {
  const { g } = fixture();
  const crab = g.horde.spawn(S.Z_ROPECRAB, 1)!;
  Object.assign(crab, { x: -12.5, z: -17.6, state: S.ZS_SIEGE_ACTION, t: 480, toX: -12.5, toY: WALL_H, toZ: -14.3 });
  const ray = g.horde.siege.anchorRay(-12.5, WALL_H + .5, -10, 0, 0, -1, 10);
  assert.equal(ray?.boat.id, crab.id);
  for (let i = 0; i < 3; i++) g.horde.siege.hitRopeTarget(crab, 1);
  assert.equal(crab.state, S.ZS_SIEGE_OPEN);
  assert.equal(g.horde.siege.anchorRay(-12.5, WALL_H + .5, -10, 0, 0, -1, 10), null);
});

test('miller wind respects real merlon cover and creates two temporary flour patches without structure damage', () => {
  const { g, p, step, events } = fixture();
  const line = { x: 0, y: 0, z: 0 };
  const spots = Array.from({ length: 49 }, (_, i) => -12 + i * .5).map((x) => ({ x,
    blocked: g.traceAttack(0, WALL_H + 2.2, -25, x, WALL_H + .8, -14.5, line) }));
  const clear = spots.find((s) => !s.blocked && spots.some((o) => o.blocked && Math.abs(o.x - s.x) < 3))!;
  assert.ok(clear, 'real wall has an exposed gap next to cover');
  const cover = spots.find((s) => s.blocked && Math.abs(s.x - clear.x) < 3)!;
  const q = g.addHuman({ pid: 78, nick: 'CoverTester', outfit: DEFAULT_OUTFIT }, { sendJson() {}, sendBinary() {}, close() {} })!;
  Object.assign(p.state, { x: clear.x, y: WALL_H, z: -14.5 });
  Object.assign(q.state, { x: cover.x, y: WALL_H, z: -14.5 });
  g.targets = () => [p, q].map((p) => ({ id: p.id, x: p.state.x, y: p.state.y, z: p.state.z, air: false }));
  const boss = g.horde.spawn(S.Z_MILLER, 1)!;
  Object.assign(boss, { x: 0, z: -25, state: S.ZS_SIEGE_ACTION, t: 151, toX: (clear.x + cover.x) / 2, toY: WALL_H, toZ: -14.5 });
  const gate = g.gate, crystal = g.crystal;
  step(1);
  assert.equal(p.hp, 70);
  assert.equal(q.hp, 100);
  assert.equal(g.gate, gate); assert.equal(g.crystal, crystal);
  const pools = events.filter((e) => e[0] === 'siegepool' && e[7] === S.Z_MILLER);
  assert.equal(pools.length, 2);
  assert.equal(g.horde.siege.playerSlow(boss.toX, WALL_H, -14.5), .8);
  g.horde.kill(boss, 1);
  step(S.PUMP_POOL_TICKS);
  assert.equal(g.horde.siege.playerSlow(boss.toX, WALL_H, -14.5), 1);
});
