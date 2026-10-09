import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPaintClapState, paintClapCanReflect, stepPaintClap } from '../shared/lab-paint-clap.ts';

test('paint clap reflects a visible shot inside the final reaction window', () => {
  const ready = createPaintClapState();
  const flying = stepPaintClap(ready, { type: 'start' });
  const near = stepPaintClap(flying, { type: 'tick', dt: 1.75 });
  assert.equal(paintClapCanReflect(near), true);
  const reflected = stepPaintClap(near, { type: 'clap' });
  assert.equal(reflected.phase, 'result');
  assert.deepEqual(reflected.results, ['reflected']);
  assert.equal(reflected.clapAt, 1.75);
  assert.deepEqual(ready.results, []);
  assert.equal(flying.elapsed, 0);
});

test('paint clap consumes an early defense and cannot retry on the same shot', () => {
  let state = stepPaintClap(createPaintClapState(), { type: 'start' });
  state = stepPaintClap(state, { type: 'tick', dt: 0.5 });
  state = stepPaintClap(state, { type: 'clap' });
  assert.equal(state.phase, 'flight');
  assert.equal(state.clapAt, 0.5);
  state = stepPaintClap(state, { type: 'tick', dt: 1.25 });
  assert.equal(paintClapCanReflect(state), false);
  const repeated = stepPaintClap(state, { type: 'clap' });
  assert.strictEqual(repeated, state);
  state = stepPaintClap(repeated, { type: 'tick', dt: 0.25 });
  assert.deepEqual(state.results, ['early']);
});

test('paint clap window includes its opening but an earlier press is spent', () => {
  const start = stepPaintClap(createPaintClapState(), { type: 'start' });
  const before = stepPaintClap(start, { type: 'tick', dt: 1.67 });
  const opening = stepPaintClap(start, { type: 'tick', dt: 1.68 });
  assert.equal(paintClapCanReflect(before), false);
  assert.equal(paintClapCanReflect(opening), true);
  assert.deepEqual(stepPaintClap(opening, { type: 'clap' }).results, ['reflected']);
});

test('paint clap resolves an unblocked impact once even after a long frame', () => {
  const flying = stepPaintClap(createPaintClapState(), { type: 'start' });
  const hit = stepPaintClap(flying, { type: 'tick', dt: 20 });
  assert.equal(hit.elapsed, 2);
  assert.deepEqual(hit.results, ['hit']);
  assert.strictEqual(stepPaintClap(hit, { type: 'tick', dt: 20 }), hit);
  assert.strictEqual(stepPaintClap(hit, { type: 'clap' }), hit);
});

test('paint clap cannot launch again while the current shot is flying', () => {
  const flying = stepPaintClap(createPaintClapState(), { type: 'start' });
  const advanced = stepPaintClap(flying, { type: 'tick', dt: 1 });
  assert.strictEqual(stepPaintClap(advanced, { type: 'start' }), advanced);
  assert.deepEqual(advanced.results, []);
});

test('paint clap ends the series after exactly three attempts and resets fully', () => {
  let state = createPaintClapState();
  for (let i = 0; i < 3; i++) {
    state = stepPaintClap(state, { type: 'start' });
    assert.equal(state.attempt, i);
    state = stepPaintClap(state, { type: 'tick', dt: 10 });
  }
  assert.equal(state.phase, 'complete');
  assert.deepEqual(state.results, ['hit', 'hit', 'hit']);
  assert.strictEqual(stepPaintClap(state, { type: 'start' }), state);
  const reset = stepPaintClap(state, { type: 'reset' });
  assert.deepEqual(reset, createPaintClapState());
  assert.equal(stepPaintClap(reset, { type: 'start' }).phase, 'flight');
});

test('paint clap gives the next shot a fresh defense and its own flight time', () => {
  let state = stepPaintClap(createPaintClapState(), { type: 'start' });
  state = stepPaintClap(state, { type: 'clap' });
  state = stepPaintClap(state, { type: 'tick', dt: 2 });
  state = stepPaintClap(state, { type: 'start' });
  assert.equal(state.clapAt, null);
  assert.equal(state.elapsed, 0);
  state = stepPaintClap(state, { type: 'tick', dt: 1.6 });
  assert.equal(paintClapCanReflect(state), true);
  state = stepPaintClap(state, { type: 'clap' });
  assert.deepEqual(state.results, ['early', 'reflected']);
});

test('paint clap reset cancels an in-flight shot and spent clap', () => {
  let state = stepPaintClap(createPaintClapState(), { type: 'start' });
  state = stepPaintClap(state, { type: 'tick', dt: 0.2 });
  state = stepPaintClap(state, { type: 'clap' });
  state = stepPaintClap(state, { type: 'reset' });
  assert.equal(state.phase, 'ready');
  assert.equal(state.clapAt, null);
  assert.deepEqual(stepPaintClap(state, { type: 'tick', dt: 10 }).results, []);
});

test('paint clap outcome is independent of frame subdivision', () => {
  const start = stepPaintClap(createPaintClapState(), { type: 'start' });
  let smallFrames = start;
  for (let i = 0; i < 105; i++) smallFrames = stepPaintClap(smallFrames, { type: 'tick', dt: 1 / 60 });
  const largeFrame = stepPaintClap(start, { type: 'tick', dt: 1.75 });
  assert.deepEqual(stepPaintClap(smallFrames, { type: 'clap' }).results, ['reflected']);
  assert.deepEqual(stepPaintClap(largeFrame, { type: 'clap' }).results, ['reflected']);
});

test('paint clap ignores invalid time steps and idle button presses', () => {
  const ready = createPaintClapState();
  assert.strictEqual(stepPaintClap(ready, { type: 'clap' }), ready);
  assert.equal(paintClapCanReflect(ready), false);
  const start = stepPaintClap(ready, { type: 'start' });
  for (const dt of [0, -1, NaN, Infinity]) {
    assert.strictEqual(stepPaintClap(start, { type: 'tick', dt }), start);
  }
});
