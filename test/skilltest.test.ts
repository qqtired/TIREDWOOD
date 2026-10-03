import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkillGame } from '../server/skilltest/game.ts';
import { makeSkillMap } from '../shared/skillmap.ts';
import { SkillDynamics, skillPulseState } from '../shared/skillphysics.ts';
import { SKILL_CAPACITY, SKILL_CHECKPOINTS, SKILL_COURSE, SKILL_REJOIN_TICKS, type SkillServerMsg } from '../shared/skilltest.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { BTN_FORWARD, BTN_JUMP, copyState, makeEvents, makeInput, makeState, statesEqual } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';

function setup() {
  const game = new SkillGame(); const messages: SkillServerMsg[] = [];
  const p = game.addHuman({ pid: 1, nick: 'Pilot', outfit: DEFAULT_OUTFIT }, { sendJson: m => messages.push(m) })!;
  return { game, p, messages };
}
test('sky course has eight distinct sections, nine safe grounded checkpoints and bounded entities', () => {
  const map = makeSkillMap(), world = new CollisionWorld(map);
  assert.equal(SKILL_CHECKPOINTS.length, 9); assert.ok(map.boxes.length < 60); assert.equal(map.hazards.length, 6);
  for (const cp of SKILL_CHECKPOINTS) {
    assert.equal(world.groundBelow(cp.x, cp.y + 0.1, cp.z), cp.y);
    assert.ok(map.hazards.every(h => Math.abs(h.x - cp.x) > h.radius + 3));
  }
});
test('five independent people, no duplicate profile or sixth join', () => {
  const { game, p } = setup();
  for (let i = 2; i <= SKILL_CAPACITY; i++) assert.ok(game.addHuman({ pid: i, nick: `Pilot${i}`, outfit: DEFAULT_OUTFIT }, { sendJson() {} }));
  assert.equal(game.addHuman({ pid: 99, nick: 'Sixth', outfit: DEFAULT_OUTFIT }, { sendJson() {} }), null);
  game.step(); assert.equal(game.players.size, 5); assert.equal(p.state.x, 0);
  assert.equal([...game.players.values()].every(x => x.state.z === 0), true); // overlap has no pushing/collision
});
test('server progress rejects skipped checkpoints and airborne/under-deck entries; finish is once per run', () => {
  const { game, p } = setup(); game.tick = 100;
  p.state.x = 61; game.checkProgress(p); assert.equal(p.progress.checkpoint, 0);
  p.state.x = 30; p.state.y = 39; game.checkProgress(p); assert.equal(p.progress.checkpoint, 0);
  p.state.y = 40; p.state.grounded = 0; game.checkProgress(p); assert.equal(p.progress.checkpoint, 0);
  for (let i = 1; i <= 8; i++) { p.state.x = i * 30; p.state.grounded = 1; game.tick += 60; game.checkProgress(p); assert.equal(p.progress.checkpoint, i); }
  const end = p.progress.finishedAt; game.tick += 100; game.checkProgress(p); assert.equal(p.progress.finishedAt, end);
  game.use(p, 0); assert.equal(p.progress.run, 2); assert.equal(p.progress.finishedAt, null); assert.equal(p.state.x, 0);
});
test('fall restores last checkpoint, consumes stale queue and keeps server timer; rejoin keeps progress', () => {
  const { game, p } = setup(); p.progress.checkpoint = 3; p.progress.startedAt = 12; p.state.y = 20;
  game.onInputs(p, [{ ...makeInput(), seq: 5, buttons: BTN_FORWARD }], 1);
  game.checkProgress(p); assert.equal(p.state.x, 90); assert.equal(p.progress.falls, 1); assert.equal(p.progress.startedAt, 12); assert.equal(p.input.ack, 5); assert.equal(p.input.length, 0);
  game.removePlayer(p.id); game.tick = 1000;
  const rejoin = game.addHuman({ pid: 1, nick: 'Pilot', outfit: DEFAULT_OUTFIT }, { sendJson() {} })!;
  assert.equal(rejoin.progress.checkpoint, 3); assert.equal(rejoin.state.x, 90); assert.equal(rejoin.progress.startedAt, 12);
  game.removePlayer(rejoin.id); game.tick += SKILL_REJOIN_TICKS + 1;
  assert.equal(game.addHuman({ pid: 1, nick: 'Pilot', outfit: DEFAULT_OUTFIT }, { sendJson() {} })!.progress.checkpoint, 0);
});
test('movement input spam cannot accelerate server progress; advisory clock is clamped', () => {
  const { game, p } = setup();
  const inputs = Array.from({ length: 100 }, (_, i) => ({ seq: i + 1, buttons: BTN_FORWARD, yaw: -Math.PI / 2, pitch: 0, viewTick: 999999 }));
  game.onInputs(p, inputs, inputs.length); game.step();
  assert.ok(p.input.ack <= 2); assert.equal(p.prevTick, game.tick); assert.ok(p.state.x < 0.4); assert.equal(p.progress.finishedAt, null);
});
test('shared physics replays deterministically, carrying a rider across the full ferry journey', () => {
  const map = makeSkillMap(), a = new SkillDynamics(map, new CollisionWorld(map)), b = new SkillDynamics(makeSkillMap(), new CollisionWorld(makeSkillMap()));
  const sa = Object.assign(makeState(), { x: 36, y: 40, grounded: 1 }), sb = copyState(makeState(), sa);
  const ea = makeEvents(), eb = makeEvents();
  for (let t = 1; t <= 225; t++) { const inp = { ...makeInput(), seq: t, viewTick: t }; a.step(sa, inp, t - 1, ea); b.step(sb, inp, t - 1, eb); assert.ok(statesEqual(sa, sb)); }
  assert.ok(Math.abs(sa.x - 54) < 0.01); assert.equal(sa.grounded, 1); assert.equal(sa.y, 40);
});
test('pulse shows 48 ticks of warning, knocks on foot and allows a high jump to clear it', () => {
  const map = makeSkillMap(), dyn = new SkillDynamics(map, new CollisionWorld(map)), h = map.hazards[0];
  assert.equal(skillPulseState(h, h.phase + 101), 'safe'); assert.equal(skillPulseState(h, h.phase + 102), 'warn'); assert.equal(skillPulseState(h, h.phase + 149), 'warn'); assert.equal(skillPulseState(h, h.phase + 150), 'hit');
  const s = Object.assign(makeState(), { x: h.x, y: 40, z: 0, grounded: 1 });
  dyn.after(s, { ...makeInput(), viewTick: h.phase + 150 }, makeEvents()); assert.equal(s.vz, 13); assert.equal(s.grounded, 0);
  const jumped = Object.assign(makeState(), { x: h.x, y: 41.2, z: 0 });
  dyn.after(jumped, { ...makeInput(), viewTick: h.phase + 150 }, makeEvents()); assert.equal(jumped.vz, 0);
});
test('normal dash cooldown does not grant hazard immunity', () => {
  const map = makeSkillMap(), dyn = new SkillDynamics(map, new CollisionWorld(map));
  const s = Object.assign(makeState(), { x: 69, y: 40, grounded: 1, dashCd: 78 });
  dyn.after(s, { ...makeInput(), viewTick: 150 }, makeEvents()); assert.equal(s.vz, 13);
});
test('standard jelly jump reaches the first warm-up island without dash', () => {
  const map = makeSkillMap(), dyn = new SkillDynamics(map, new CollisionWorld(map));
  const s = Object.assign(makeState(), { x: 1.8, y: 40, vx: 8.4, grounded: 1 });
  const ev = makeEvents(); let landed = false;
  for (let t = 1; t <= 65; t++) {
    const inp = { ...makeInput(), seq: t, viewTick: t, yaw: -Math.PI / 2, buttons: BTN_FORWARD | (t === 1 ? BTN_JUMP : 0) };
    dyn.step(s, inp, t - 1, ev);
    if (s.x > 6.5 && s.grounded) { landed = true; break; }
  }
  assert.equal(landed, true);
});
test('initial and 10Hz state envelopes identify the stable course and only bounded peers', () => {
  const { game, messages } = setup(); for (let i = 0; i < 12; i++) game.step();
  assert.equal(messages.length, 3); assert.equal(messages[0].course, SKILL_COURSE); assert.equal(messages[2].tick, 12); assert.equal(messages[2].peers.length, 1);
});
test('elevator carries a standing rider upward to the upper exit', () => {
  const map = makeSkillMap(), dyn = new SkillDynamics(map, new CollisionWorld(map));
  const s = Object.assign(makeState(), { x: 156, y: 40, grounded: 1 });
  for (let t = 1; t <= 225; t++) dyn.step(s, { ...makeInput(), seq: t, viewTick: t }, t - 1, makeEvents());
  assert.ok(Math.abs(s.y - 44) < 1e-9); assert.equal(s.grounded, 1);
});
test('respawn increments falls only once and cannot be spammed to reset timer', () => {
  const { game, p } = setup(); p.progress.startedAt = 0; game.tick = 120;
  game.use(p, 1); game.use(p, 1); assert.equal(p.progress.falls, 1); assert.equal(p.progress.startedAt, 0);
  game.tick += 60; game.use(p, 1); assert.equal(p.progress.falls, 2); assert.equal(p.progress.startedAt, 0);
});
/** A bounded keyboard-only pilot: run toward a landing and jump before unsupported ground. */
function walkRoute(startX: number, targets: number[][]): void {
  const map = makeSkillMap(), world = new CollisionWorld(map), dyn = new SkillDynamics(map, world);
  const s = Object.assign(makeState(), { x: startX, y: 40, grounded: 1 });
  const ev = makeEvents(); let tick = 0;
  for (const [x, z = 0] of targets) {
    let arrived = false;
    for (let n = 0; n < 600; n++) {
      const dx = x - s.x, dz = z - s.z, dist = Math.hypot(dx, dz);
      if (dist < 0.45 && s.grounded && Math.abs(s.y - 40) < 0.15) { arrived = true; break; }
      let buttons = dist > 0.2 ? BTN_FORWARD : 0;
      if (s.grounded && dist > 2 && world.groundBelow(s.x + dx / dist, s.y + 0.1, s.z + dz / dist) < s.y - 0.5 && !(s.prevButtons & BTN_JUMP)) buttons |= BTN_JUMP;
      dyn.step(s, { ...makeInput(), seq: ++tick, viewTick: tick, yaw: Math.atan2(-dx, -dz), buttons }, tick - 1, ev);
      if (s.y < 31) break;
    }
    assert.ok(arrived, `no keyboard route from ${startX} to landing ${x},${z}; ended ${s.x},${s.y},${s.z}`);
  }
}
test('complete warm-up section is reachable with ordinary movement and jumps', () => walkRoute(0, [[9], [18], [25], [30]]));
test('all five precision jumps and the following checkpoint are reachable without dash', () => walkRoute(90, [[96, 1.8], [101.2, -1.8], [106.4, 1.8], [111.6, -1.8], [116.8, 1.8], [120]]));
test('leaving an empty paused room cannot pause a running timer or extend rejoin expiry', () => {
  let now = 100000;
  const game = new SkillGame(() => now);
  const info = { pid: 42, nick: 'Reconnect', outfit: DEFAULT_OUTFIT }, sink = { sendJson() {} };
  const p = game.addHuman(info, sink)!; p.progress.startedAt = 5; p.progress.checkpoint = 2; game.tick = 100;
  game.removePlayer(p.id); now += 30000; // Hub may stop stepping when the last human leaves.
  const rejoin = game.addHuman(info, sink)!;
  assert.equal(game.tick - rejoin.progress.startedAt!, 95 + 1800);
  game.removePlayer(rejoin.id); now += 10 * 60 * 1000 + 1;
  assert.equal(game.addHuman(info, sink)!.progress.checkpoint, 0);
});
