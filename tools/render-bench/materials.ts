import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { Material } from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, cos, mod, positionLocal, sin, uniform, vec3 } from 'three/tsl';
import type { SceneFlavor } from './types.ts';

export const MOTION = {
  jellyFrequency: 3.2, jellySpatial: 2.4, jellyAmplitude: 0.055,
  seaX: 0.2, seaZ: 0.18, seaTimeX: 0.6, seaTimeZ: 0.35, seaAmplitude: 0.12,
  rainHeight: 20, rainSpeed: 14,
} as const;

type Standard = MeshStandardMaterial | MeshStandardNodeMaterial;
type Basic = MeshBasicMaterial | MeshBasicNodeMaterial;

export function createMaterials(flavor: SceneFlavor) {
  const owned = new Set<Material>();
  const clock = { value: 0 };
  const nodeClock = uniform(0);
  function keep<T extends Material>(material: T): T { owned.add(material); return material; }
  function standard(color: number, roughness = 0.75, metalness = 0): Standard {
    const settings = { color, roughness, metalness };
    return keep(flavor === 'legacy' ? new MeshStandardMaterial(settings) : new MeshStandardNodeMaterial(settings));
  }
  function basic(color: number, opacity = 1): Basic {
    const settings = { color, opacity, transparent: opacity < 1, depthWrite: opacity === 1, side: DoubleSide };
    return keep(flavor === 'legacy' ? new MeshBasicMaterial(settings) : new MeshBasicNodeMaterial(settings));
  }
  function patch(material: MeshStandardMaterial | MeshBasicMaterial, key: string, declarations: string, displacement: string) {
    material.onBeforeCompile = shader => {
      shader.uniforms.benchTime = clock;
      shader.vertexShader = `uniform float benchTime;\n${declarations}\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${displacement}`);
    };
    material.customProgramCacheKey = () => `render-bench-v1-${key}`;
  }
  function jelly(color: number, phase: number): Standard {
    const material = standard(color, 0.28, 0.04);
    if (material instanceof MeshStandardMaterial) {
      // Phase is a uniform, so all characters reuse one compiled shader program.
      patch(material, 'jelly', 'uniform float benchPhase;',
        `float wobble = sin(benchTime * ${MOTION.jellyFrequency} + position.y * ${MOTION.jellySpatial} + benchPhase) * ${MOTION.jellyAmplitude};\ntransformed.x += position.x * wobble;\ntransformed.z += position.z * wobble;\ntransformed.y -= position.y * wobble * 0.5;`);
      const compile = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => { compile(shader, renderer); shader.uniforms.benchPhase = { value: phase }; };
    } else {
      const wobble = sin(nodeClock.mul(MOTION.jellyFrequency).add(positionLocal.y.mul(MOTION.jellySpatial)).add(uniform(phase))).mul(MOTION.jellyAmplitude);
      material.positionNode = positionLocal.add(vec3(positionLocal.x.mul(wobble), positionLocal.y.mul(wobble).mul(-0.5), positionLocal.z.mul(wobble)));
    }
    return material;
  }
  function sea(): Standard {
    const material = standard(0x2a99bd, 0.3, 0.12);
    if (material instanceof MeshStandardMaterial) {
      patch(material, 'sea', '', `transformed.y += sin(position.x * ${MOTION.seaX} + benchTime * ${MOTION.seaTimeX}) * cos(position.z * ${MOTION.seaZ} - benchTime * ${MOTION.seaTimeZ}) * ${MOTION.seaAmplitude};`);
    } else {
      const wave = sin(positionLocal.x.mul(MOTION.seaX).add(nodeClock.mul(MOTION.seaTimeX)))
        .mul(cos(positionLocal.z.mul(MOTION.seaZ).sub(nodeClock.mul(MOTION.seaTimeZ)))).mul(MOTION.seaAmplitude);
      material.positionNode = positionLocal.add(vec3(0, wave, 0));
    }
    return material;
  }
  function rain(): Basic {
    const material = basic(0xd5efff, 0.45);
    if (material instanceof MeshBasicMaterial) {
      patch(material, 'rain', 'attribute float benchRainPhase;',
        `transformed.y += mod(benchRainPhase * ${MOTION.rainHeight.toFixed(1)} - benchTime * ${MOTION.rainSpeed.toFixed(1)}, ${MOTION.rainHeight.toFixed(1)}) - ${(MOTION.rainHeight / 2).toFixed(1)};`);
    } else {
      const drop = mod(attribute('benchRainPhase', 'float').mul(MOTION.rainHeight).sub(nodeClock.mul(MOTION.rainSpeed)), MOTION.rainHeight).sub(MOTION.rainHeight / 2);
      material.positionNode = positionLocal.add(vec3(0, drop, 0));
    }
    return material;
  }
  return {
    standard, basic, jelly, sea, rain,
    tick(seconds: number) { clock.value = seconds; nodeClock.value = seconds; },
    dispose() { for (const material of owned) material.dispose(); owned.clear(); },
  };
}
