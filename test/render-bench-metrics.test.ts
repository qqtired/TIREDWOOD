import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rotatedOrder, summarize, summarizeSamples, validateBackend } from '../tools/render-bench/metrics.ts';
import type { FrameSample, Variant } from '../tools/render-bench/types.ts';

const sample = (frameMs: number, cpuMs = 0, gpuMs: number | null = null): FrameSample =>
  ({ frameMs, cpuMs, gpuMs, drawCalls: 1, triangles: 10 });

test('distribution: conventional median, nearest-rank p95/p99, input preserved', () => {
  const values = [40, 10, 30, 20];
  assert.deepEqual(summarize(values), {
    count: 4, min: 10, max: 40, mean: 25, median: 25, p95: 40, p99: 40,
  });
  assert.deepEqual(values, [40, 10, 30, 20]);
  const ordered = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.deepEqual(summarize(ordered), {
    count: 100, min: 1, max: 100, mean: 50.5, median: 50.5, p95: 95, p99: 99,
  });
  assert.equal(summarize([9, 1, 3])?.median, 3);
});

test('distribution: ignores invalid numbers, accepts zero and returns null when absent', () => {
  assert.deepEqual(summarize([NaN, Infinity, -Infinity, -1, 0, 4]), {
    count: 2, min: 0, max: 4, mean: 2, median: 2, p95: 4, p99: 4,
  });
  assert.equal(summarize([]), null);
  assert.equal(summarize([NaN, Infinity, -1]), null);
});

test('samples: positive frame durations, zero CPU, missing GPU stays null', () => {
  const result = summarizeSamples([
    sample(10, 0), sample(30, 2), sample(0, NaN), sample(-1, Infinity), sample(NaN, -1),
  ]);
  assert.deepEqual(result.frame, {
    count: 2, min: 10, max: 30, mean: 20, median: 20, p95: 30, p99: 30,
  });
  assert.equal(result.fps, 50);
  assert.equal(result.cpu?.count, 2);
  assert.equal(result.cpu?.mean, 1);
  assert.equal(result.gpu, null);
  assert.deepEqual(summarizeSamples([]), {
    frame: null, cpu: null, gpu: null, fps: null, over20Ms: 0, over33Ms: 0, over50Ms: 0,
  });
});

test('samples: GPU zero and invalid timings are excluded independently', () => {
  const result = summarizeSamples([
    sample(16, 0, null), sample(16, NaN, 0), sample(16, Infinity, -1),
    sample(Infinity, -1, NaN), sample(16, 2, Infinity), sample(16, 4, 2), sample(16, 6, 6),
  ]);
  assert.equal(result.frame?.count, 6);
  assert.equal(result.cpu?.count, 4);
  assert.equal(result.cpu?.mean, 3);
  assert.equal(result.gpu?.count, 2);
  assert.equal(result.gpu?.mean, 4);
});

test('samples: slow-frame counts use strict thresholds and finite positive frames', () => {
  const result = summarizeSamples([
    20, 20.001, 33.3333333333, 33.334, 50, 50.001, Infinity, NaN, 0, -1,
  ].map(value => sample(value)));
  assert.equal(result.over20Ms, 5);
  assert.equal(result.over33Ms, 3);
  assert.equal(result.over50Ms, 1);
});

test('rotated order cycles A/B/C and returns independent arrays', () => {
  assert.deepEqual(rotatedOrder(0), ['legacy', 'modern-webgl', 'webgpu']);
  assert.deepEqual(rotatedOrder(1), ['modern-webgl', 'webgpu', 'legacy']);
  assert.deepEqual(rotatedOrder(2), ['webgpu', 'legacy', 'modern-webgl']);
  assert.deepEqual(rotatedOrder(3), rotatedOrder(0));
  rotatedOrder(0).reverse();
  assert.deepEqual(rotatedOrder(0), ['legacy', 'modern-webgl', 'webgpu']);
  for (const invalid of [-1, 0.5, NaN, Infinity]) {
    assert.throws(() => rotatedOrder(invalid), /repetition.*integer/i);
  }
});

test('backend validation refuses fallback and incorrectly labelled WebGPU', () => {
  for (const variant of ['legacy', 'modern-webgl'] as Variant[]) {
    assert.doesNotThrow(() => validateBackend(variant, 'webgl2'));
    assert.throws(() => validateBackend(variant, 'webgpu'), /webgl2.*webgpu/i);
  }
  assert.doesNotThrow(() => validateBackend('webgpu', 'webgpu'));
  assert.throws(() => validateBackend('webgpu', 'webgl2'), /fallback/i);
});
