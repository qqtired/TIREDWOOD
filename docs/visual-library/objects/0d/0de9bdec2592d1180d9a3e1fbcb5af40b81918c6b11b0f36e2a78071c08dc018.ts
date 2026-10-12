import { ACESFilmicToneMapping, PCFShadowMap, REVISION, SRGBColorSpace, WebGLRenderer } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import type { BenchScene, FrameSample, Variant } from './types.ts';

export class UnsupportedBackendError extends Error {
  constructor(message: string) { super(message); this.name = 'UnsupportedBackendError'; }
}

// These members exist in Three r186 but are absent from its public type declarations.
interface BackendDetails {
  isWebGPUBackend?: boolean;
  isWebGLBackend?: boolean;
  compatibilityMode?: boolean;
  trackTimestamp: boolean;
  hasTimestamp: boolean;
  getTimestampFrames(type: string): number[];
  device?: {
    queue: { onSubmittedWorkDone(): Promise<void> };
    features: { has(name: string): boolean };
    adapterInfo?: { vendor?: string; architecture?: string; device?: string; description?: string; isFallbackAdapter?: boolean };
  };
}
interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

async function boundedCompletion(promise: Promise<unknown>): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([promise, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('GPU completion/readback timeout (2 s).')), 2000);
    })]);
  } finally { if (timeout !== undefined) clearTimeout(timeout); }
}

export interface RendererAdapter {
  backend: 'webgl2' | 'webgpu';
  environment: Record<string, unknown>;
  warnings: string[];
  initMs: number;
  compile(scene: BenchScene): Promise<void>;
  render(scene: BenchScene, seconds: number, sample?: FrameSample): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

export async function createRenderer(
  canvas: HTMLCanvasElement, variant: Variant, width: number, height: number,
  gpuTiming: boolean, invalidate: (reason: string) => void,
): Promise<RendererAdapter> {
  const start = performance.now();
  if (variant === 'webgpu' && !('gpu' in navigator)) {
    throw new UnsupportedBackendError('WebGPU недоступен: navigator.gpu отсутствует. Нужен поддерживаемый браузер и безопасный контекст.');
  }
  const legacy = variant === 'legacy' ? new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }) : null;
  const modern = legacy ? null : new WebGPURenderer({ canvas, antialias: true, samples: 4, alpha: false,
    forceWebGL: variant === 'modern-webgl', trackTimestamp: gpuTiming, powerPreference: 'high-performance' });
  const renderer = legacy ?? modern!;
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // Both classic WebGLRenderer and the new renderer's WebGLBackend log shader errors
  // through this hook without necessarily throwing from compile/render.
  renderer.debug.onShaderError = (gl: WebGL2RenderingContext, program: WebGLProgram, vertex: WebGLShader, fragment: WebGLShader) => {
    // Compiler diagnostics only: bound the entire message and never dump shader source.
    const reason = [
      'Ошибка компиляции WebGL shader.',
      `Program: ${gl.getProgramInfoLog(program) || '(empty)'}`,
      `Vertex: ${gl.getShaderInfoLog(vertex) || '(empty)'}`,
      `Fragment: ${gl.getShaderInfoLog(fragment) || '(empty)'}`,
    ].join('\n').slice(0, 1500);
    invalidate(reason);
    console.error(reason);
  };
  if (legacy) {
    legacy.shadowMap.autoUpdate = false;
    legacy.shadowMap.needsUpdate = true;
  }
  renderer.info.autoReset = false;
  if (modern) {
    modern.onDeviceLost = info => invalidate(`Потеря устройства ${info.api}: ${info.message}`);
    modern.onError = error => {
      const info = error as unknown as { type?: string; message?: string };
      invalidate(`Ошибка GPU: ${info.type ?? ''} ${info.message ?? String(error)}`);
    };
    try { await modern.init(); }
    catch (error) {
      await modern.dispose();
      if (variant === 'webgpu') throw new UnsupportedBackendError(`WebGPU не инициализирован: ${String(error)}`);
      throw error;
    }
  }
  const details = modern?.backend as unknown as BackendDetails | undefined;
  const backend = details?.isWebGPUBackend === true ? 'webgpu' : 'webgl2';
  if (variant === 'webgpu' && backend !== 'webgpu') {
    await modern!.dispose();
    throw new UnsupportedBackendError('WebGPU недоступен: Three переключился на WebGL 2. Такой результат не измеряется как WebGPU.');
  }
  if (modern && variant === 'modern-webgl' && details?.isWebGLBackend !== true) {
    await modern.dispose();
    throw new UnsupportedBackendError('Вариант B не использует ожидаемый WebGL 2 backend.');
  }
  const gl = backend === 'webgl2' ? renderer.getContext() as WebGL2RenderingContext : null;
  const warnings: string[] = [];
  const compatibilityMode = details?.compatibilityMode ?? false;
  const defaultFramebufferSamples = gl ? Number(gl.getParameter(gl.SAMPLES)) : null;
  // New renderer resolves an internal multisampled target before its canvas output pass.
  // The currently bound/default GL framebuffer cannot describe that target's MSAA.
  const samples = legacy ? defaultFramebufferSamples! : modern!.samples;
  if (samples !== 4) warnings.push(`Фактический MSAA: ${samples} вместо запрошенных 4; сравнение качества требует учёта этой разницы.`);
  if (compatibilityMode) warnings.push('WebGPU работает в compatibility mode; Three отключает MSAA в этом режиме.');
  const ext = gpuTiming && legacy && gl ? gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null : null;
  const modernGlExt = gpuTiming && modern && gl ? gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null : null;
  const timerSupported = !!ext || (gpuTiming && details?.trackTimestamp === true && details.hasTimestamp);
  if (gpuTiming) {
    warnings.push('Отдельный проход с GPU timestamp-инструментацией: накладные расходы не сравнивать с чистым проходом. GPU измеряется примерно каждый десятый кадр.');
    if (!timerSupported) warnings.push('GPU timestamp недоступен; gpuMs остаётся null.');
  }
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  const adapterInfo = details?.device?.adapterInfo;
  const environment: Record<string, unknown> = {
    threeRevision: REVISION, width, height, pixelRatio: 1, requestedSamples: 4, actualSamples: samples,
    actualSamplesSource: legacy ? 'GL default framebuffer SAMPLES' : 'renderer.samples (internal MSAA target configuration)',
    defaultFramebufferSamples,
    antialias: samples > 0, compatibilityMode, colorSpace: 'srgb', toneMapping: 'ACESFilmic', exposure: 1,
    modernConfiguredSamples: modern?.samples ?? null,
    webGpuFeatures: details?.device ? {
      timestampQuery: details.device.features.has('timestamp-query'),
      coreFeaturesAndLimits: details.device.features.has('core-features-and-limits'),
    } : null,
    webGpuAdapterInfo: adapterInfo ? {
      vendor: adapterInfo.vendor ?? null, architecture: adapterInfo.architecture ?? null,
      device: adapterInfo.device ?? null, description: adapterInfo.description ?? null,
      isFallbackAdapter: adapterInfo.isFallbackAdapter ?? null,
    } : null,
    shadow: { type: 'PCFShadowMap', autoUpdate: false, note: 'Один статический shadow pass при подготовке сцены.' },
    gpuTimingSupported: timerSupported, gpuTimingMethod: legacy ? (ext ? 'EXT_disjoint_timer_query_webgl2' : null) :
      (timerSupported ? 'Three.resolveTimestampsAsync(render), last-frame pass total in ms' : null),
    glVersion: gl ? String(gl.getParameter(gl.VERSION)) : null,
    glVendor: gl ? String(gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)) : null,
    glRenderer: gl ? String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)) : null,
  };
  let disposed = false;
  let frames = 0;
  let pending: Promise<void> | null = null;
  let disjointGeneration = 0;
  const queries: { query: WebGLQuery; sample: FrameSample }[] = [];
  const warn = (message: string) => { if (!warnings.includes(message)) warnings.push(message); };
  function pollQueries() {
    if (modernGlExt && gl?.getParameter(modernGlExt.GPU_DISJOINT_EXT)) {
      disjointGeneration++;
      warn('GPU disjoint: затронутые GPU samples отброшены.');
    }
    if (!gl || !ext) return;
    const disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
    for (let i = queries.length - 1; i >= 0; i--) {
      const entry = queries[i]!;
      if (disjoint || gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE)) {
        if (!disjoint) {
          const duration = Number(gl.getQueryParameter(entry.query, gl.QUERY_RESULT)) / 1e6;
          if (Number.isFinite(duration) && duration > 0) entry.sample.gpuMs = duration;
        } else warn('GPU disjoint: затронутые GPU samples отброшены.');
        gl.deleteQuery(entry.query);
        queries.splice(i, 1);
      }
    }
  }
  function resolveModern(sample?: FrameSample) {
    if (!modern || !details || !timerSupported || pending) return;
    const frame = modern.info.frame;
    const generation = disjointGeneration;
    pending = modern.resolveTimestampsAsync('render').then(duration => {
      // The pool can return its previous value after errors. Never attach it to a new frame.
      const resolved = details.getTimestampFrames('render');
      const disjoint = modernGlExt && gl?.getParameter(modernGlExt.GPU_DISJOINT_EXT);
      if (!disposed && sample && !disjoint && generation === disjointGeneration && resolved.at(-1) === frame && Number.isFinite(duration) && duration! > 0) {
        sample.gpuMs = duration!;
      }
    }).catch(error => { warn(`GPU timestamp readback не получен: ${String(error)}`); })
      .finally(() => {
        pending = null;
        if (!disposed && modernGlExt) details.trackTimestamp = true;
      });
    // r186's GL pool clears its whole pending batch after readback. Avoid adding queries
    // during that readback; otherwise they would be orphaned and their frame IDs lost.
    if (modernGlExt) details.trackTimestamp = false;
  }
  return {
    backend, environment, warnings, initMs: performance.now() - start,
    async compile(scene) { await renderer.compileAsync(scene.scene, scene.camera); },
    render(scene, seconds, sample) {
      if (disposed) throw new Error('Renderer session уже закрыт.');
      pollQueries();
      renderer.info.reset();
      if (sample) sample.gpuMs = null;
      frames++;
      const query = sample && ext && gl && frames % 10 === 0 ? gl.createQuery() : null;
      if (query) gl!.beginQuery(ext!.TIME_ELAPSED_EXT, query);
      const cpuStart = performance.now();
      try { scene.tick(seconds); renderer.render(scene.scene, scene.camera); }
      finally {
        const cpuMs = performance.now() - cpuStart;
        if (query) { gl!.endQuery(ext!.TIME_ELAPSED_EXT); queries.push({ query, sample: sample! }); }
        if (sample) {
          sample.cpuMs = cpuMs;
          sample.drawCalls = legacy ? legacy.info.render.calls : modern!.info.render.drawCalls;
          sample.triangles = renderer.info.render.triangles;
        }
      }
      // Keep the query pool from overflowing during warm-up too. Never await inside render submission.
      if (gpuTiming && frames % 10 === 0) resolveModern(sample);
    },
    async flush() {
      if (disposed) return;
      if (details?.device) await boundedCompletion(details.device.queue.onSubmittedWorkDone());
      else gl?.finish();
      if (pending) await boundedCompletion(pending);
      pollQueries();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of queries) gl?.deleteQuery(entry.query);
      queries.length = 0;
      await renderer.dispose();
      legacy?.forceContextLoss();
    },
  };
}
