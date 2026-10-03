// Independent review: only public input/action APIs for round participation/reward cases.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HideGame, type HidePlayer } from '../server/hide/game.ts';
import { HIDE_COUNT_TICKS, HIDE_PREP_TICKS, HIDE_FORMS, HIDE_REJOIN_TICKS, HIDE_SHOT_TICKS, HIDE_MISS_TICKS, type HideResult, type HideServerMsg } from '../shared/hide.ts';
import { HIDE_BOUNDS, hideFits, hideWorld } from '../shared/hidephysics.ts';
import { makeRng } from '../shared/math.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { BTN_FORWARD, BTN_JUMP, BTN_DASH, makeInput, type Input } from '../shared/sim.ts';
import { encodeInputs, decodeInputs } from '../shared/protocol.ts';

function setup(seed?: number) {
  const rewards: Array<{ pid: number; result: HideResult }> = [], messages = new Map<number, HideServerMsg[]>();
  const rng = makeRng(seed ?? 1), rand = seed === undefined ? (n: number) => Math.floor(n * .31) : (n: number) => Math.floor(rng() * n);
  const game = new HideGame({ finished: (pid, result) => rewards.push({ pid, result }), rand });
  const add = (pid: number) => { const list: HideServerMsg[] = []; messages.set(pid, list); return game.addHuman({ pid, nick: `PrivateName${pid}`, level: 16, outfit: DEFAULT_OUTFIT }, { sendJson: m => list.push(m) })!; };
  add(1); add(2);
  const step = (n: number) => { for (let i = 0; i < n; i++) game.step(); };
  step(HIDE_COUNT_TICKS);
  const players = [...game.players.values()], hunter = players.find(p => p.role === 'hunter')!, prop = players.find(p => p.role === 'prop')!;
  const input = (p: HidePlayer, seq: number, buttons: number, yaw = 0, pitch = 0) => { const decoded: Input[] = []; assert.equal(decodeInputs(encodeInputs([{ ...makeInput(), seq, buttons, yaw, pitch }], 0, 1, 1), decoded), 1); game.onInputs(p, decoded, 1); game.step(); };
  const prepare = () => { for (let i = 1; i <= 400; i++) input(prop, i, BTN_FORWARD, Math.floor(i / 100) * Math.PI / 2); game.action(prop, { t: 'hide', a: 'freeze' }); assert.ok(prop.moved >= 4); assert.equal(prop.chose, true); };
  const seek = () => { while (game.phase === 'hide') game.step(); assert.equal(game.phase, 'seek'); };
  return { game, hunter, prop, rewards, messages, add, step, input, prepare, seek };
}

test('review: deliberate hider cannot farm 30 tokens against a fully idle hunter', () => {
  const e = setup(); e.prepare(); e.seek();
  while (e.game.phase === 'seek') e.step(1);
  assert.equal(e.hunter.moved, 0); assert.equal(e.hunter.shots, 0); assert.equal(e.game.result, 'cancelled'); assert.deepEqual(e.rewards, []);
});

test('review: meaningful hunter plus a deliberately frozen hider remains a legitimate survival round', () => {
  const e = setup(); e.prepare(); e.seek();
  for (let i = 1; i <= 70; i++) e.input(e.hunter, i, BTN_FORWARD);
  assert.ok(e.hunter.moved >= 4);
  while (e.game.phaseEnd - e.game.tick > 200) e.step(1);
  e.input(e.hunter, 71, 0, 0, -1.2); // look upward for a deliberate, harmless miss near the end
  e.game.action(e.hunter, { t: 'hide', a: 'shoot' });
  while (e.game.phase === 'seek') e.step(1);
  assert.equal(e.game.result, 'props');
  const award = e.rewards.find(r => r.pid === e.prop.pid); assert.ok(award); assert.ok(award.result.reward > 0 && award.result.reward <= 35);
  const count = e.rewards.length; e.step(10); e.game.action(e.hunter, { t: 'hide', a: 'shoot' }); assert.equal(e.rewards.length, count);
});

test('review: untouched AFK prop spawns do not create an eligible opposition', () => {
  const e = setup(); e.seek(); for (let i = 1; i <= 70; i++) e.input(e.hunter, i, BTN_FORWARD);
  while (e.game.phaseEnd - e.game.tick > 200) e.step(1);
  e.input(e.hunter, 71, 0, 0, -1.2); e.game.action(e.hunter, { t: 'hide', a: 'shoot' });
  while (e.game.phase === 'seek') e.step(1);
  assert.equal(e.prop.moved, 0); assert.equal(e.prop.chose, false); assert.equal(e.game.result, 'cancelled'); assert.deepEqual(e.rewards, []);
});

test('review: every prep snapshot blinds hunters/late spectators; seek props have no identity or role fields', () => {
  const e = setup(), late = e.add(3); e.step(HIDE_PREP_TICKS);
  for (const pid of [e.hunter.pid, late.pid]) for (const message of e.messages.get(pid)!) if (message.phase === 'hide') { assert.deepEqual(message.props, []); assert.equal(message.hunter, null); assert.equal(message.cue, null); }
  const view = e.game.view(e.hunter); assert.equal(view.phase, 'seek'); assert.ok(view.props.length >= 24);
  for (const prop of view.props) { assert.deepEqual(Object.keys(prop).sort(), ['form', 'id', 'x', 'y', 'yaw', 'z']); assert.ok(prop.id >= 10000); }
  assert.equal(JSON.stringify(view.props).includes('PrivateName'), false); assert.equal(late.role, 'spectator');
});

test('review: randomized layouts and every rotation fit static geometry; water, roof and memorial are excluded', () => {
  const world = hideWorld();
  for (const seed of [1, 7, 29, 109, 501, 9001]) { const e = setup(seed); for (const p of e.game.view(e.prop).props) assert.equal(hideFits(e.game.world, p, p.form, p.yaw), true, `seed ${seed}, prop ${p.id}`); }
  for (const form of Object.keys(HIDE_FORMS) as Array<keyof typeof HIDE_FORMS>) for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    for (const p of [{ x: 0, y: -1, z: 35 }, { x: -23.6, y: 0, z: 19.2 }, { x: 0, y: 4, z: -20 }, { x: 4, y: 0, z: -17 }, { x: HIDE_BOUNDS.maxX + 1, y: 0, z: 0 }]) assert.equal(hideFits(world, p, form, yaw), false);
  }
});

test('review: jump/dash inputs never escape permitted grounded volume; misses charge only once per cooldown', () => {
  const e = setup(); for (let i = 1; i <= 240; i++) { e.input(e.prop, i, BTN_FORWARD | BTN_JUMP | BTN_DASH, i < 120 ? 0 : Math.PI); assert.ok(e.prop.state.y <= .4); assert.equal(hideFits(e.game.world, e.prop.state, e.prop.form, e.prop.propYaw), true); }
  e.seek(); e.input(e.hunter, 1, 0, 0, -1.2); const before = e.game.phaseEnd;
  for (let i = 0; i < 20; i++) e.game.action(e.hunter, { t: 'hide', a: 'shoot' });
  assert.equal(e.game.phaseEnd, before - HIDE_MISS_TICKS); e.step(HIDE_SHOT_TICKS - 1); e.game.action(e.hunter, { t: 'hide', a: 'shoot' }); assert.equal(e.game.phaseEnd, before - HIDE_MISS_TICKS);
  e.step(1); e.game.action(e.hunter, { t: 'hide', a: 'shoot' }); assert.equal(e.game.phaseEnd, before - HIDE_MISS_TICKS * 2);
});

test('review: leaving and rejoining preserves role but cannot restore payout eligibility; absent hunter cancels', () => {
  const e = setup(); e.prepare(); e.seek();
  e.game.removePlayer(e.prop.id); const restored = e.game.addHuman({ pid: e.prop.pid, nick: e.prop.nick, level: e.prop.level, outfit: e.prop.outfit }, { sendJson() {} })!;
  assert.equal(restored.id, e.prop.id); assert.equal(restored.role, 'prop'); assert.equal(restored.rewardEligible, false);
  e.game.removePlayer(e.hunter.id); e.step(HIDE_REJOIN_TICKS);
  assert.equal(e.game.result, 'cancelled'); assert.equal(e.rewards.length, 0);
});
