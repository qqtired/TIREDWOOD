import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSession } from '../tools/render-bench/runtime.ts';
import type { BenchSession } from '../tools/render-bench/runtime.ts';
import type { FrameSample } from '../tools/render-bench/types.ts';

function harness() {
  const names = ['document', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const original = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const callbacks = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => {
    callbacks.set(++sequence, callback); return sequence;
  } });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: (id: number) => callbacks.delete(id) });
  return {
    document, callbacks,
    async step(timestamp: number) {
      const pending = [...callbacks]; callbacks.clear();
      pending.forEach(([, callback]) => callback(timestamp));
      await Promise.resolve(); await Promise.resolve();
    },
    restore() {
      names.forEach((name, index) => {
        if (original[index]) Object.defineProperty(globalThis, name, original[index]!);
        else Reflect.deleteProperty(globalThis, name);
      });
    },
  };
}

function fakeSession(times: number[], samples: FrameSample[]): BenchSession {
  return {
    canvas: {} as HTMLCanvasElement, variant: 'legacy', backend: 'webgl2',
    sceneConfig: { seed: 1, players: 16, rain: false },
    manifest: { name: 'test', seed: 1, players: 16, rain: false, complexity: 1, buildings: 0, trees: 0, rainDrops: 0, waterSegments: [1, 1], waterTriangles: 2, characterMeshes: 0, meshes: 1, triangles: 2, instances: 0, signature: 'test', notes: [] },
    environment: {}, setupMs: { initMs: 0, buildMs: 0, compileMs: 0, firstFrameMs: 0, totalMs: 0 },
    instrumentation: 'clean', warnings: [], invalidReasons: [],
    renderAt(seconds, sample) {
      times.push(seconds);
      if (sample) { sample.cpuMs = 2; sample.drawCalls = 1; sample.triangles = 2; samples.push(sample); }
    },
    async flush() {}, async dispose() { throw new Error('runSession must not dispose the caller-owned session'); },
  };
}

test('runtime resets deterministic scene time after warmup and uses rAF intervals, without disposing', async () => {
  const h = harness();
  try {
    const times: number[] = [], raw: FrameSample[] = [];
    const pending = runSession(fakeSession(times, raw), { warmupMs: 32, measureMs: 64 });
    for (let timestamp = 16; timestamp <= 128; timestamp += 16) await h.step(timestamp);
    const result = await pending;
    assert.equal(result.status, 'ok');
    assert.deepEqual(times, [0, 0.016, 0, 0.016, 0.032, 0.048]);
    assert.equal(result.measuredMs, 64);
    assert.deepEqual(result.samples.map(sample => sample.frameMs), [16, 16, 16, 16]);
    assert.equal(result.summary.fps, 62.5);
    assert.equal(result.summary.gpu, null);
    raw[0]!.gpuMs = 999;
    assert.equal(result.samples[0]!.gpuMs, null, 'returned data is detached from pending asynchronous observations');
    assert.doesNotThrow(() => JSON.stringify(result));
  } finally { h.restore(); }
});

test('runtime closes the terminal frame interval, including a stall past the measurement endpoint', async () => {
  const h = harness();
  try {
    const times: number[] = [], raw: FrameSample[] = [];
    const pending = runSession(fakeSession(times, raw), { warmupMs: 0, measureMs: 100 });
    for (const timestamp of [0, 16, 32, 1000]) await h.step(timestamp);
    const result = await pending;
    assert.equal(result.status, 'ok');
    assert.equal(result.measuredMs, 1000);
    assert.deepEqual(times, [0, 0.016, 0.032]);
    assert.deepEqual(result.samples.map(sample => sample.frameMs), [16, 16, 968]);
    assert.equal(result.samples.reduce((sum, sample) => sum + sample.frameMs, 0), result.measuredMs);
    assert.equal(result.summary.fps, 3);
    assert.equal(result.summary.over50Ms, 1);
    assert.ok(result.samples.every(sample => sample.frameMs > 0), 'no fabricated initial zero interval');
    assert.deepEqual(result.samples.map(sample => sample.cpuMs), [2, 2, 2]);
  } finally { h.restore(); }
});

test('runtime abort stops immediately while waiting for rAF', async () => {
  const h = harness();
  try {
    const abort = new AbortController();
    const pending = runSession(fakeSession([], []), { warmupMs: 3000, measureMs: 10000 }, undefined, abort.signal);
    abort.abort();
    const result = await pending;
    assert.equal(result.status, 'invalid');
    assert.ok(result.invalidReasons.some(reason => reason.includes('отменено')));
    assert.equal(h.callbacks.size, 0);
  } finally { h.restore(); }
});

test('runtime hiding page invalidates even when hidden browser stops rAF', async () => {
  const h = harness();
  try {
    const pending = runSession(fakeSession([], []), { warmupMs: 0, measureMs: 10000 });
    h.document.visibilityState = 'hidden';
    h.document.dispatchEvent(new Event('visibilitychange'));
    const result = await pending;
    assert.equal(result.status, 'invalid');
    assert.ok(result.invalidReasons.some(reason => reason.includes('скрыта')));
    assert.equal(h.callbacks.size, 0);
  } finally { h.restore(); }
});
