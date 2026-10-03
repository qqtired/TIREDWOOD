import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessFrames, nextAutoQuality, sceneQuality } from '../client/render/quality.ts';

test('auto quality ignores isolated stalls and requires sustained slow windows', () => {
  const healthy = Array.from({ length: 72 }, (_, i) => i === 0 ? 200 : 16.6);
  assert.equal(assessFrames(healthy).slow, false);
  assert.deepEqual(nextAutoQuality(healthy, 1.5, 1), { ratio: 1.5, slowWindows: 0 });
  const slow = Array(72).fill(24);
  assert.deepEqual(nextAutoQuality(slow, 1.5, 0), { ratio: 1.5, slowWindows: 1 });
  assert.deepEqual(nextAutoQuality(slow, 1.5, 1), { ratio: 1.25, slowWindows: 0 });
});

test('repeated frame spikes reduce quality even when median FPS looks healthy', () => {
  const unstable = Array.from({ length: 72 }, (_, i) => i % 6 === 0 ? 45 : 16.5);
  assert.equal(assessFrames(unstable).p95, 45);
  assert.deepEqual(nextAutoQuality(unstable, 1, 1), { ratio: 0.75, slowWindows: 0 });
  assert.deepEqual(nextAutoQuality(unstable, 0.75, 1), { ratio: 0.75, slowWindows: 0 });
});

test('automatic floor reduces actual scene detail, manual quality remains selected', () => {
  assert.equal(sceneQuality('auto', 1.5, 1.5, false), 'high');
  assert.equal(sceneQuality('auto', 1.25, 1.5, false), 'medium');
  assert.equal(sceneQuality('auto', 0.75, 1.5, false), 'low');
  assert.equal(sceneQuality('auto', 1.25, 1.25, true), 'medium');
  assert.equal(sceneQuality('high', 0.75, 1.5, true), 'high');
});
