import { VARIANTS } from './types.ts';
import type { Distribution, FrameSample, SampleSummary, Variant } from './types.ts';

/** Milliseconds: ignore unavailable or invalid observations without mutating the input. */
export function summarize(values: readonly number[]): Distribution | null {
  const sorted = values.filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) return null;
  const middle = Math.floor(count / 2);
  return {
    count,
    min: sorted[0]!,
    max: sorted[count - 1]!,
    mean: sorted.reduce((sum, value) => sum + value, 0) / count,
    median: count % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!,
    p95: sorted[Math.ceil(count * 0.95) - 1]!,
    p99: sorted[Math.ceil(count * 0.99) - 1]!,
  };
}

export function summarizeSamples(samples: readonly FrameSample[]): SampleSummary {
  const frameValues = samples.map(sample => sample.frameMs).filter(value => Number.isFinite(value) && value > 0);
  const frame = summarize(frameValues);
  return {
    frame,
    cpu: summarize(samples.map(sample => sample.cpuMs)),
    gpu: summarize(samples.flatMap(sample =>
      sample.gpuMs !== null && Number.isFinite(sample.gpuMs) && sample.gpuMs > 0 ? [sample.gpuMs] : [])),
    fps: frame === null ? null : 1000 / frame.mean,
    over20Ms: frameValues.filter(value => value > 20).length,
    over33Ms: frameValues.filter(value => value > 33.3333333333).length,
    over50Ms: frameValues.filter(value => value > 50).length,
  };
}

/** Rotate A/B/C to avoid always measuring one renderer first. */
export function rotatedOrder(repetition: number): Variant[] {
  if (!Number.isInteger(repetition) || repetition < 0) {
    throw new Error('Benchmark repetition must be a nonnegative integer.');
  }
  const offset = repetition % VARIANTS.length;
  return [...VARIANTS.slice(offset), ...VARIANTS.slice(0, offset)];
}

/** A silent WebGPU → WebGL fallback must never be labelled as a WebGPU result. */
export function validateBackend(variant: Variant, actual: 'webgl2' | 'webgpu'): void {
  const expected = variant === 'webgpu' ? 'webgpu' : 'webgl2';
  if (actual === expected) return;
  const fallback = variant === 'webgpu' ? ' WebGPU fallback is not a valid measurement.' : '';
  throw new Error(`Renderer ${variant}: expected ${expected}, got ${actual}.${fallback}`);
}
