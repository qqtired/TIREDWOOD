import type { Camera, Scene } from 'three';

export type Variant = 'legacy' | 'modern-webgl' | 'webgpu';
export const VARIANTS: readonly Variant[] = ['legacy', 'modern-webgl', 'webgpu'];
export type SceneFlavor = 'legacy' | 'nodes';

export interface SceneConfig {
  seed: number;
  players: number;
  rain: boolean;
  complexity?: 1 | 10;
}

export interface SceneManifest {
  name: string;
  seed: number;
  players: number;
  rain: boolean;
  complexity: 1 | 10;
  buildings: number;
  trees: number;
  rainDrops: number;
  waterSegments: [number, number];
  waterTriangles: number;
  characterMeshes: number;
  meshes: number;
  triangles: number;
  instances: number;
  signature: string;
  notes: string[];
}

export interface BenchScene {
  scene: Scene;
  camera: Camera;
  manifest: SceneManifest;
  tick(seconds: number): void;
  dispose(): void;
}

export interface FrameSample {
  frameMs: number;
  cpuMs: number;
  gpuMs: number | null;
  drawCalls: number;
  triangles: number;
}

export interface Distribution {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
}

export interface SampleSummary {
  frame: Distribution | null;
  cpu: Distribution | null;
  gpu: Distribution | null;
  fps: number | null;
  over20Ms: number;
  over33Ms: number;
  over50Ms: number;
}
