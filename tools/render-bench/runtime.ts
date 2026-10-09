import { createBenchScene } from './scene.ts';
import { summarizeSamples, validateBackend } from './metrics.ts';
import { createRenderer } from './renderer.ts';
import type { RendererAdapter } from './renderer.ts';
import type { BenchScene, FrameSample, SampleSummary, SceneConfig, SceneManifest, Variant } from './types.ts';
export { UnsupportedBackendError } from './renderer.ts';

export interface SetupTimes {
  initMs: number;
  buildMs: number;
  compileMs: number;
  firstFrameMs: number;
  totalMs: number;
}
export interface BenchSession {
  canvas: HTMLCanvasElement;
  variant: Variant;
  backend: 'webgl2' | 'webgpu';
  sceneConfig: SceneConfig;
  manifest: SceneManifest;
  environment: Record<string, unknown>;
  setupMs: SetupTimes;
  instrumentation: 'clean' | 'gpu-timestamps';
  warnings: string[];
  invalidReasons: string[];
  renderAt(seconds: number, sample?: FrameSample): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}
export interface RunResult {
  variant: Variant;
  backend: 'webgl2' | 'webgpu';
  sceneConfig: SceneConfig;
  manifest: SceneManifest;
  environment: Record<string, unknown>;
  setupMs: SetupTimes;
  instrumentation: 'clean' | 'gpu-timestamps';
  startedAt: string;
  measuredMs: number;
  warmupMs: number;
  measureMs: number;
  samples: FrameSample[];
  summary: SampleSummary;
  warnings: string[];
  status: 'ok' | 'invalid';
  invalidReasons: string[];
}

export async function createSession(
  canvas: HTMLCanvasElement, variant: Variant, sceneConfig: SceneConfig,
  width: number, height: number, gpuTiming = false,
): Promise<BenchSession> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Размер canvas должен быть положительным целым числом.');
  }
  const start = performance.now();
  const invalidReasons: string[] = [];
  let disposed = false;
  const invalidate = (reason: string) => { if (!disposed && !invalidReasons.includes(reason)) invalidReasons.push(reason); };
  const onHidden = () => { if (document.visibilityState !== 'visible') invalidate('Страница скрыта во время сессии.'); };
  const onResize = () => invalidate('Размер окна изменился во время сессии.');
  const onLost = (event: Event) => { event.preventDefault(); invalidate('Потерян WebGL context.'); };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('resize', onResize);
  canvas.addEventListener('webglcontextlost', onLost);
  const removeListeners = () => {
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('resize', onResize);
    canvas.removeEventListener('webglcontextlost', onLost);
  };
  let adapter: RendererAdapter | undefined;
  let bench: BenchScene | undefined;
  try {
    adapter = await createRenderer(canvas, variant, width, height, gpuTiming, invalidate);
    validateBackend(variant, adapter.backend);
    const buildStart = performance.now();
    bench = createBenchScene(sceneConfig, variant === 'legacy' ? 'legacy' : 'nodes');
    const buildMs = performance.now() - buildStart;
    const camera = bench.camera as BenchScene['camera'] & { aspect?: number; updateProjectionMatrix?: () => void };
    if (camera.aspect !== undefined) { camera.aspect = width / height; camera.updateProjectionMatrix?.(); }
    const compileStart = performance.now();
    await adapter.compile(bench);
    const compileMs = performance.now() - compileStart;
    if (invalidReasons.length) throw new Error(invalidReasons.join(' '));
    const firstStart = performance.now();
    adapter.render(bench, 0);
    await adapter.flush();
    const firstFrameMs = performance.now() - firstStart;
    onHidden();
    if (invalidReasons.length) throw new Error(invalidReasons.join(' '));
    const environment = {
      ...adapter.environment, userAgent: navigator.userAgent, platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency, screenWidth: screen.width, screenHeight: screen.height,
      devicePixelRatio: window.devicePixelRatio, initialVisibility: document.visibilityState, isSecureContext: window.isSecureContext,
      setupScope: 'Scene construction/init/compile/first GPU completion; browser and driver caches are not reset.',
    };
    const setupMs = { initMs: adapter.initMs, buildMs, compileMs, firstFrameMs, totalMs: performance.now() - start };
    const renderer = adapter;
    const scene = bench;
    return {
      canvas, variant, backend: renderer.backend, sceneConfig: { ...sceneConfig }, manifest: scene.manifest,
      environment, setupMs, instrumentation: gpuTiming ? 'gpu-timestamps' : 'clean',
      warnings: renderer.warnings, invalidReasons,
      renderAt(seconds, sample) {
        if (disposed) throw new Error('Benchmark session уже закрыта.');
        onHidden();
        if (canvas.width !== width || canvas.height !== height) invalidate('Размер буфера canvas изменился во время сессии.');
        if (invalidReasons.length) throw new Error(invalidReasons.join(' '));
        renderer.render(scene, seconds, sample);
      },
      flush() { return renderer.flush(); },
      async dispose() {
        if (disposed) return;
        disposed = true;
        removeListeners();
        scene.dispose();
        await renderer.dispose();
      },
    };
  } catch (error) {
    disposed = true;
    removeListeners();
    bench?.dispose();
    await adapter?.dispose();
    throw error;
  }
}

export async function runSession(
  session: BenchSession, options: { warmupMs: number; measureMs: number },
  onProgress?: (phase: string, progress: number) => void, signal?: AbortSignal,
): Promise<RunResult> {
  const { warmupMs, measureMs } = options;
  if (!Number.isFinite(warmupMs) || warmupMs < 0 || !Number.isFinite(measureMs) || measureMs <= 0) {
    throw new Error('Длительности: warmupMs ≥ 0 и measureMs > 0.');
  }
  const startedAt = new Date().toISOString();
  const samples: FrameSample[] = [];
  const invalidReasons = [...session.invalidReasons];
  const invalidate = (reason: string) => { if (!invalidReasons.includes(reason)) invalidReasons.push(reason); };
  let measuredMs = 0;
  const check = () => {
    session.invalidReasons.forEach(invalidate);
    if (document.visibilityState !== 'visible') invalidate('Страница скрыта во время измерения.');
    if (signal?.aborted) invalidate('Измерение отменено.');
    if (invalidReasons.length) throw new Error(invalidReasons.join(' '));
  };
  // Visibility and abort events can terminate even when a hidden page no longer gets rAF callbacks.
  const phase = (name: 'warmup' | 'measure', duration: number) => new Promise<void>((resolve, reject) => {
    let frame = 0;
    let start: number | null = null;
    let previous: number | null = null;
    let previousSample: FrameSample | undefined;
    let lastProgress = -Infinity;
    const finish = (error?: unknown) => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', interrupt);
      signal?.removeEventListener('abort', interrupt);
      if (error) reject(error); else resolve();
    };
    const interrupt = () => { try { check(); } catch (error) { finish(error); } };
    document.addEventListener('visibilitychange', interrupt);
    signal?.addEventListener('abort', interrupt, { once: true });
    const step = (now: number) => {
      try {
        check();
        start ??= now;
        const elapsed = now - start;
        if (name === 'measure') measuredMs = elapsed;
        // A rendered frame's duration becomes known at the following rAF callback.
        // Close that sample before ending the phase, including a stall at the endpoint.
        if (previousSample && previous !== null) {
          previousSample.frameMs = now - previous;
          samples.push(previousSample);
          previousSample = undefined;
        }
        if (elapsed >= duration) { onProgress?.(name, 1); finish(); return; }
        const sample = name === 'measure' ? {
          frameMs: 0, cpuMs: 0, gpuMs: null, drawCalls: 0, triangles: 0,
        } satisfies FrameSample : undefined;
        session.renderAt(elapsed / 1000, sample);
        previousSample = sample;
        previous = now;
        // UI work stays outside CPU timing and is throttled equally for all backends.
        if (elapsed - lastProgress >= 250) { onProgress?.(name, elapsed / duration); lastProgress = elapsed; }
        frame = requestAnimationFrame(step);
      } catch (error) { finish(error); }
    };
    try { check(); frame = requestAnimationFrame(step); } catch (error) { finish(error); }
  });
  try {
    if (warmupMs > 0) await phase('warmup', warmupMs);
    check();
    await phase('measure', measureMs);
    // GPU completion/readback is outside both the wall-clock measurement and per-frame CPU timing.
    await session.flush();
    check();
  } catch (error) { invalidate(error instanceof Error ? error.message : String(error)); }
  if (samples.length < 2) invalidate('Недостаточно кадров для измерения.');
  const finalSamples = samples.map(sample => ({ ...sample }));
  return {
    variant: session.variant, backend: session.backend, sceneConfig: session.sceneConfig,
    manifest: session.manifest, environment: session.environment, setupMs: session.setupMs,
    instrumentation: session.instrumentation, startedAt, measuredMs, warmupMs, measureMs,
    samples: finalSamples, summary: summarizeSamples(finalSamples), warnings: [...session.warnings],
    status: invalidReasons.length ? 'invalid' : 'ok', invalidReasons,
  };
}
