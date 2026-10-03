// Ореолы огней баркаса одним вызовом отрисовки: квадраты-«спрайты» (всегда лицом к камере) с мягкой точкой,
// аддитивно — как glowSprite из render/kit.ts, только все сразу (было 8 спрайтов — 8 вызовов). Яркость каждого —
// своя (мерцание, дождь); тон и цветовое пространство — как у обычных материалов.
import * as THREE from 'three';
import { glowTexture } from '../../render/kit.ts';

export interface Halo {
  color: number;
  /** Размер ореола, м (как scale у спрайта) */
  size: number;
  x: number;
  y: number;
  z: number;
  opacity: number;
}

export class Halos {
  readonly mesh: THREE.Mesh;
  private readonly alpha: THREE.InstancedBufferAttribute;
  private readonly base: number[];

  constructor(list: readonly Halo[]) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    const pos = new Float32Array(list.length * 3);
    const size = new Float32Array(list.length);
    const color = new Float32Array(list.length * 3);
    const c = new THREE.Color();
    list.forEach((h, i) => {
      pos.set([h.x, h.y, h.z], i * 3);
      size[i] = h.size;
      c.setHex(h.color);
      color.set([c.r, c.g, c.b], i * 3);
    });
    this.base = list.map((h) => h.opacity);
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 1));
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(color, 3));
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(this.base), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iAlpha', this.alpha);
    geo.instanceCount = list.length;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture() } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute float iSize;
        attribute vec3 iColor;
        attribute float iAlpha;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          mv.xy += position.xy * iSize;
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vColor = iColor;
          vAlpha = iAlpha;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float a = texture2D(uMap, vUv).a * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /** Огни горят всегда, в дождь ярче (rain 0…1), чуть мерцают */
  update(t: number, rain: number): void {
    const a = this.alpha.array as Float32Array;
    for (let i = 0; i < a.length; i++) a[i] = this.base[i] * (1 + 0.45 * rain) * (0.93 + 0.07 * Math.sin(t * 7.3 + i * 1.7));
    this.alpha.needsUpdate = true;
  }
}
