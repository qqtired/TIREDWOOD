// Headwear uses the very same per-height bend and impact deformation as the body.
// Geometry is local to its measured attachment height; squash/run bob/KO remain on their common parent.
import * as THREE from 'three';
import { BODY_H, type Wear } from './outfit3d.ts';
import { JELLY_SWAY_GLSL } from './teamgear.ts';

interface PoseUniforms {
  uTime: THREE.IUniform<number>;
  uWobble: THREE.IUniform<number>;
  uLean: THREE.IUniform<THREE.Vector2>;
}

export function makeHatMaterial(base: THREE.MeshStandardMaterial, uniforms: PoseUniforms, anchor: THREE.IUniform<number>): THREE.MeshStandardMaterial {
  const material = base.clone();
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { uWearY: anchor });
    shader.vertexShader = 'uniform float uTime;\nuniform float uWobble;\nuniform vec2 uLean;\nuniform float uWearY;\n'
      + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n' + JELLY_SWAY_GLSL.replace('position.y /', '(position.y + uWearY) /'));
  };
  material.customProgramCacheKey = () => 'jelly-headwear-v1';
  return material;
}

/** CPU geometry probe of the shader transform, in body coordinates (before their shared parent). */
export function posedHatPoint(local: THREE.Vector3, anchorY: number, time: number, wobble: number, lean: THREE.Vector2): THREE.Vector3 {
  const y = local.y + anchorY;
  const h = THREE.MathUtils.clamp(y / BODY_H, 0, 1);
  const wob = Math.sin(time * 2.7 + h * 2.5) * 0.014 + wobble * Math.sin(time * 23 - h * 6) * h * 0.17;
  return new THREE.Vector3(local.x * (1 + wob) + lean.x * h * h, y, local.z * (1 + wob) + lean.y * h * h);
}

export interface HeadwearBounds { top: number; radius: number }

/** Cached geometry bounds, in body coordinates; no allocation or vertex scan each frame. */
export function headwearBounds(wear: Wear): HeadwearBounds {
  let top = BODY_H;
  let radius = 0;
  for (const geometry of [wear.geo, wear.metal]) {
    if (!geometry) continue;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const b = geometry.boundingBox!;
    top = Math.max(top, wear.y + b.max.y);
    radius = Math.max(radius, Math.abs(b.min.x), Math.abs(b.max.x));
  }
  return { top, radius };
}

/** Upper support bound after the SAME scale, wobble, lean and dance tilt; keeps names above tall headwear. */
export function headwearLabelHeight(bounds: HeadwearBounds, scale: THREE.Vector3, sway: number, lift: number, leanX: number, wobble: number): number {
  const width = bounds.radius * (1.014 + Math.abs(wobble) * .17) + Math.abs(leanX);
  return Math.max(1.9, lift + bounds.top * scale.y * Math.cos(sway) + width * scale.x * Math.abs(Math.sin(sway)) + .14);
}
