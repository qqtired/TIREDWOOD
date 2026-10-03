// P1: попадание по бегущему предмету — там, где его видел ищущий (откат не дальше 0,4 с), а не там, где он сейчас на сервере.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HIDE_MAX_REWIND } from '../shared/hide.ts';
import { HIDE_KIND } from '../shared/hideprops.ts';
import { BTN_RIGHT } from '../shared/sim.ts';
import { aimAt, hideSetup, shoot, toSeek } from './hide-helpers.ts';

/** Ящик бежит вправо по двору (z=8), ищущий стоит в 5 м сбоку и целится туда, где видел его `lag` тиков назад. */
function run(lag: number, view: (tick: number) => number, ticks = 30) {
  const { game, ps, events } = hideSetup(2);
  toSeek(game); game.decor = [];
  const hunter = ps.find(p => p.role === 'hunter')!, prop = ps.find(p => p.role === 'prop')!;
  prop.kind = 'crate'; prop.propYaw = 0;
  Object.assign(prop.state, { x: 0, y: 0, z: 8, vx: 0, vy: 0, vz: 0, grounded: 1 });
  Object.assign(hunter.state, { x: 5, y: 0, z: 13.3 });
  const seen = new Map<number, { x: number; y: number; z: number }>();
  let seq = prop.input.lastSeq;
  for (let i = 0; i < ticks; i++) {
    prop.input.push([{ seq: ++seq, buttons: BTN_RIGHT, yaw: 0, pitch: 0, viewTick: 0 }], 1);
    game.step();
    seen.set(game.tick, { x: prop.state.x, y: prop.state.y, z: prop.state.z });
  }
  const T = game.tick, at = seen.get(T - lag)!;
  const shift = prop.state.x - at.x;
  shoot(game, hunter, aimAt(hunter, at.x, at.y + HIDE_KIND.crate.h / 2, at.z), view(T));
  const shot = events(hunter.pid).find(e => e.k === 'shot')!;
  return { prop, shift, shot, game };
}

test('a running crate is hit where the hunter saw it 8 ticks ago', () => {
  const { prop, shift, shot } = run(8, T => T - 8);
  assert.ok(shift > 0.8, `crate really moved ${shift.toFixed(2)} m since then`);
  assert.equal(prop.hits, 1);
  assert.ok(shot.k === 'shot' && shot.hit === 'prop');
});

test('without rewind the same aim misses — the crate already ran away', () => {
  const { prop, shot } = run(8, T => T + 1);
  assert.equal(prop.hits, 0);
  assert.ok(shot.k === 'shot' && shot.hit !== 'prop');
});

test('rewind is capped at 0.4 s: a 40-tick-old view cannot hit', () => {
  const { prop } = run(40, T => T - 40, 60);
  assert.equal(prop.hits, 0);
  assert.equal(HIDE_MAX_REWIND, 24);
});

test('a view from the future is treated as now', () => {
  const { prop } = run(0, T => T + 500);
  assert.equal(prop.hits, 1);
});

test('the shot waits for the input it was fired with (or 10 ticks)', () => {
  const { game, ps } = hideSetup(2);
  toSeek(game); game.decor = [];
  const hunter = ps.find(p => p.role === 'hunter')!;
  Object.assign(hunter.state, { x: 5, y: 0, z: 13.3 });
  const seq = hunter.input.lastSeq;
  game.action(hunter, { t: 'hide', a: 'shoot', aim: [Math.PI, -0.3], view: game.tick, seq: seq + 3 });
  game.step(); game.step();
  assert.ok(hunter.pending, 'inputs up to seq+3 have not arrived');
  hunter.input.push([1, 2, 3].map(k => ({ seq: seq + k, buttons: 0, yaw: Math.PI, pitch: -0.3, viewTick: 0 })), 3);
  game.step(); game.step(); assert.ok(hunter.pending, 'one input per tick from a short queue');
  game.step(); assert.equal(hunter.pending, null);
  assert.equal(hunter.shots, 1);
  // без входов — выстрел всё равно уходит через 10 тиков
  for (let i = 0; i < 30; i++) game.step();
  game.action(hunter, { t: 'hide', a: 'shoot', aim: [Math.PI, -0.3], view: game.tick, seq: seq + 99 });
  for (let i = 0; i < 9; i++) game.step();
  assert.ok(hunter.pending);
  game.step(); assert.equal(hunter.pending, null); assert.equal(hunter.shots, 2);
});
