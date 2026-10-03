// Своё движение в прятках: предсказание клиента (HideMotion) и сервер считают одно и то же по тем же входам,
// что идут по сети, — и у предмета, и у ловца, и после превращения. Чужие предметы приходят дельтой и не «едут» заранее.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HideMotion } from '../client/hide/motion.ts';
import { HIDE_KIND } from '../shared/hideprops.ts';
import { decodeInputs, encodeInputs } from '../shared/protocol.ts';
import { BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RIGHT, makeInput, statesEqual, type Input } from '../shared/sim.ts';
import type { HidePlayer } from '../server/hide/game.ts';
import { hideSetup, toSeek } from './hide-helpers.ts';

function rig() {
  const env = hideSetup(2);
  toSeek(env.game);
  const read = new Map<number, number>();
  /** Отдать клиенту всё, что сервер ему послал (снимки по порядку). */
  const feed = (p: HidePlayer, motion: HideMotion) => {
    const box = env.sent.get(p.pid)!;
    for (let i = read.get(p.pid) ?? 0; i < box.length; i++) { const m = box[i]; if (m.t === 'hide_state') motion.accept(m, (m.tick * 1000) / 60); }
    read.set(p.pid, box.length);
  };
  /** Вход: клиент предсказывает, сервер получает его через провод и делает тик. */
  const apply = (p: HidePlayer, motion: HideMotion, input: Input) => {
    motion.step(input);
    const wire: Input[] = [makeInput()];
    decodeInputs(encodeInputs([input], 0, 1, 1), wire);
    env.game.onInputs(p, wire, 1);
    env.game.step();
    feed(p, motion);
  };
  return { ...env, feed, apply, hunter: env.ps.find(p => p.role === 'hunter')!, prop: env.ps.find(p => p.role === 'prop')! };
}

test('prop prediction matches the server when it walks into yard props, jumps and lands', () => {
  const r = rig(), { game, prop } = r;
  // ящик двора прямо на пути; прячущийся — бочка в 0,4 м справа от него
  game.decor = [{ id: 501, kind: 'crate', x: 7, y: 0, z: 9, yaw: 0 }];
  prop.kind = 'barrel'; prop.propYaw = 0;
  Object.assign(prop.state, { x: 7 + HIDE_KIND.crate.w + HIDE_KIND.barrel.w + 0.4, y: 0, z: 9, vx: 0, vy: 0, vz: 0, grounded: 1 });
  prop.reset++; game.send(prop);
  const motion = new HideMotion();
  r.feed(prop, motion);
  for (let seq = 1; seq <= 90; seq++) {
    const buttons = BTN_LEFT | (seq === 40 ? BTN_JUMP : 0);
    r.apply(prop, motion, { ...makeInput(), seq, buttons, yaw: 0 });
    assert.ok(statesEqual(motion.predictor.state, prop.state), `diverged at input ${seq}: client x=${motion.predictor.state.x} y=${motion.predictor.state.y}, server x=${prop.state.x} y=${prop.state.y}`);
  }
  assert.ok(Math.abs(prop.state.x - 7) >= HIDE_KIND.crate.w + HIDE_KIND.barrel.w - 1e-6, 'stopped by the crate (or jumped onto it)');
  assert.equal(motion.predictor.corrections, 0);
});

test('hunter and prop follow 240 real wire inputs (turns, jumps) without a single correction', () => {
  for (const role of ['hunter', 'prop'] as const) {
    const r = rig(), p = r[role];
    r.game.decor = [];
    Object.assign(p.state, { x: 4, y: 0, z: 9, vx: 0, vy: 0, vz: 0, grounded: 1 });
    p.reset++; r.game.send(p);
    const motion = new HideMotion();
    r.feed(p, motion);
    for (let seq = 1; seq <= 240; seq++) {
      const input = { ...makeInput(), seq, buttons: BTN_FORWARD | (seq % 50 === 0 ? BTN_JUMP : 0), yaw: Math.fround(Math.floor((seq - 1) / 60) * (Math.PI / 2)) };
      r.apply(p, motion, input);
      assert.ok(statesEqual(motion.predictor.state, p.state), `${role}: diverged at input ${seq}`);
    }
    assert.equal(motion.predictor.corrections, 0, `${role}: no corrections`);
  }
});

test('transforming mid-run resets prediction to the new size and keeps matching', () => {
  const r = rig(), { game, prop } = r;
  game.decor = [{ id: 601, kind: 'bench', x: 4, y: 0, z: 10.5, yaw: 0 }, { id: 602, kind: 'bucket', x: 6.5, y: 0, z: 7.5, yaw: 6 }];
  prop.kind = 'crate'; prop.propYaw = 0;
  Object.assign(prop.state, { x: 4, y: 0, z: 8.6, vx: 0, vy: 0, vz: 0, grounded: 1 });
  prop.reset++; game.send(prop);
  const motion = new HideMotion();
  r.feed(prop, motion);
  let seq = 0;
  for (let i = 0; i < 20; i++) r.apply(prop, motion, { ...makeInput(), seq: ++seq, buttons: BTN_RIGHT, yaw: 0 });
  game.action(prop, { t: 'hide', a: 'take', id: 602 });
  assert.equal(prop.kind, 'bucket');
  r.feed(prop, motion);
  for (let i = 0; i < 40; i++) {
    r.apply(prop, motion, { ...makeInput(), seq: ++seq, buttons: BTN_RIGHT | BTN_FORWARD, yaw: 0 });
    assert.ok(statesEqual(motion.predictor.state, prop.state), `after transform: diverged at ${seq}`);
  }
  assert.equal(motion.physics.kind, 'bucket');
});

test('a yard object that stood still and then moves does not slide early on other screens', () => {
  const r = rig(), { game, prop, hunter } = r;
  game.decor = [];
  Object.assign(prop.state, { x: 2, y: 0, z: 9, vx: 0, vy: 0, vz: 0, grounded: 1 });
  prop.reset++;
  const watcher = new HideMotion();
  // стоит секунду (снимки без него), потом едет вправо
  for (let i = 0; i < 60; i++) { game.step(); r.feed(hunter, watcher); }
  let seq = prop.input.lastSeq;
  const startTick = game.tick;
  for (let i = 0; i < 60; i++) {
    prop.input.push([{ ...makeInput(), seq: ++seq, buttons: BTN_RIGHT, yaw: 0 }], 1);
    game.step(); r.feed(hunter, watcher);
  }
  // кадры 120 Гц на часах отрисовки, задержка — как у ClockSync
  const xs: { t: number; x: number }[] = [];
  for (let f = 0; f < 120; f++) {
    const now = ((startTick - 20) * 1000) / 60 + (f * 1000) / 120;
    watcher.clock.renderTick = startTick - 20 + f / 2;
    const v = (() => { watcher.render(now, 1 / 120, 0); return watcher.shown.find(b => b.id === prop.prop)!; })();
    xs.push({ t: watcher.clock.renderTick, x: v.x });
  }
  for (const s of xs) if (s.t <= startTick) assert.ok(Math.abs(s.x - 2) < 1e-6, `moved before it started: x=${s.x} at tick ${s.t}`);
  const after = xs.filter(s => s.t > startTick + 7);
  for (let i = 1; i < after.length; i++) assert.ok(after[i].x >= after[i - 1].x - 1e-9, 'moves only forward');
  assert.ok(after.at(-1)!.x > 2.5, 'and really moves');
});
