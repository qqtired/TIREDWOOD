// Бильярд: детерминизм физики, лузы и борта, правила удара (shared/billiards.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BL_HX, BL_HZ, BL_R, cueVelocity, judge, makeBalls, packBalls, rack, simulate, unpackBalls, type BlBall,
} from '../shared/billiards.ts';

/** Только биток и один шар: биток в (cx, cz), шар 1 в (bx, bz). */
function two(cx: number, cz: number, bx: number, bz: number): BlBall[] {
  const balls = makeBalls();
  Object.assign(balls[0], { x: cx, z: cz, on: true });
  Object.assign(balls[1], { x: bx, z: bz, on: true });
  return balls;
}

/** Удар битком прямо в точку (tx, tz). */
function shootAt(balls: BlBall[], tx: number, tz: number, power: number) {
  const ang = Math.atan2(tx - balls[0].x, tz - balls[0].z);
  const v = cueVelocity(ang, power);
  return simulate(balls, v.vx, v.vz);
}

test('physics is deterministic: same start and cue velocity give bit-identical results, also through JSON', () => {
  for (const [ang, pw] of [[0, 1], [0.031, 0.73], [-2.4, 0.5], [1.2, 0.35]]) {
    const v = cueVelocity(ang, pw);
    const a = rack();
    const ra = simulate(a, v.vx, v.vz);
    const b = rack();
    const rb = simulate(b, v.vx, v.vz);
    assert.deepEqual(packBalls(a), packBalls(b));
    assert.deepEqual(ra, rb);
    // клиент получает старт и скорость по сети (JSON) — и считает то же самое
    const wire = JSON.parse(JSON.stringify({ ...packBalls(rack()), vx: v.vx, vz: v.vz }));
    const c = unpackBalls(wire.pos, wire.on);
    const rc = simulate(c, wire.vx, wire.vz);
    assert.deepEqual(packBalls(c), packBalls(a));
    assert.equal(rc.steps, ra.steps);
  }
});

test('balls stop, stay inside the cushions and never overlap after a full-power break', () => {
  const balls = rack();
  const v = cueVelocity(0.002, 1);
  const r = simulate(balls, v.vx, v.vz);
  assert.ok(r.steps > 600 && r.steps < 12 * 600, `шары катились ${r.steps} шагов`);
  assert.equal(r.firstHit, 1);
  for (const b of balls) {
    if (!b.on) continue;
    assert.equal(b.vx, 0);
    assert.ok(Math.abs(b.x) <= BL_HX - BL_R + 1e-6 && Math.abs(b.z) <= BL_HZ - BL_R + 1e-6, `шар за бортом: ${b.x}, ${b.z}`);
  }
  for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) {
    if (!balls[i].on || !balls[j].on) continue;
    assert.ok(Math.hypot(balls[i].x - balls[j].x, balls[i].z - balls[j].z) > 2 * BL_R - 1e-4, `шары ${i} и ${j} слиплись`);
  }
});

test('pockets: straight into a corner and into a middle pocket; cue ball alone into a pocket is a scratch', () => {
  // шар 1 у угловой лузы (−HX, −HZ), биток за ним на той же линии
  const corner = two(-0.3, -0.6, -0.43, -0.86);
  const rc = shootAt(corner, -0.43, -0.86, 0.45);
  assert.deepEqual(rc.potted, [1]);
  assert.equal(rc.pockets[0], 0);
  assert.equal(rc.firstHit, 1);
  assert.equal(corner[0].on, true);
  // средняя луза (+HX, 0)
  const side = two(0.1, 0, 0.35, 0);
  const rs = shootAt(side, 0.35, 0, 0.4);
  assert.deepEqual(rs.potted, [1]);
  assert.equal(rs.pockets[0], 5);
  // биток сам в лузу — фол
  const solo = two(0.3, 0.8, -0.3, -0.8);
  const rf = shootAt(solo, BL_HX, BL_HZ, 0.5);
  assert.deepEqual(rf.potted, [0]);
  assert.equal(rf.firstHit, -1);
  assert.equal(judge(rf).foul, true);
});

test('cushion bounces the ball back with loss of speed, no pot', () => {
  const balls = two(0, 0.3, 0.3, 0.9);
  balls[1].on = false;
  // в длинный борт x = −HX, далеко от средней лузы
  const r = shootAt(balls, -BL_HX, 0.6, 0.35);
  assert.deepEqual(r.potted, []);
  assert.ok(balls[0].x > -BL_HX + BL_R - 1e-9);
  // отскочил обратно на свою половину и дальше от борта, чем касался
  assert.ok(balls[0].x > -BL_HX + 0.1, `биток после борта у x=${balls[0].x}`);
});

test('rules: pot → shoot again, miss → turn passes, scratch → foul and potted balls come back', () => {
  assert.deepEqual(judge({ steps: 1, potted: [3, 7], pockets: [0, 1], firstHit: 3 }), { scored: 2, foul: false, back: [], cueBack: false, again: true });
  assert.deepEqual(judge({ steps: 1, potted: [], pockets: [], firstHit: 3 }), { scored: 0, foul: false, back: [], cueBack: false, again: false });
  assert.deepEqual(judge({ steps: 1, potted: [], pockets: [], firstHit: -1 }), { scored: 0, foul: false, back: [], cueBack: false, again: false });
  assert.deepEqual(judge({ steps: 1, potted: [5, 0], pockets: [2, 3], firstHit: 5 }), { scored: 0, foul: true, back: [5], cueBack: true, again: false });
});

test('hall: three tables are solid, the places at their long sides are free and aisles between tables stay open', async () => {
  const { buildLobby } = await import('../shared/maps/lobby.ts');
  const { CollisionWorld } = await import('../shared/world.ts');
  const { PLAYER_HALF, PLAYER_HEIGHT } = await import('../shared/constants.ts');
  const { BL_TABLES, blSpot } = await import('../shared/billiards.ts');
  const map = buildLobby();
  const w = new CollisionWorld(map);
  const free = (x: number, z: number) => !w.overlaps(x - PLAYER_HALF, 0.01, z - PLAYER_HALF, x + PLAYER_HALF, PLAYER_HEIGHT, z + PLAYER_HALF);
  assert.equal(map.interact.filter((i) => i.kind === 'billiards').length, 3);
  BL_TABLES.forEach((t, i) => {
    assert.ok(!free(t.x, t.z), `стол ${i} твёрдый`);
    for (const side of [0, 1]) {
      const s = blSpot(i, side);
      assert.ok(free(s.x, s.z), `место ${i}/${side} свободно`);
    }
  });
  // проходы к автоматам: между столами и вдоль павильона
  for (const x of [-22.25 + 0.6, -17.75 + 0.6]) for (const z of [-15, -12, -9]) assert.ok(free(x, z), `проход ${x},${z}`);
  for (const x of [-27, -20, -13.5]) assert.ok(free(x, -14.8), `вдоль павильона ${x}`);
});
