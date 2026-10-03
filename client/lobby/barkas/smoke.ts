// Дымки баркаса: из трубы, из трубки боцмана, «тук-тук» выхлоп лодки. Все клубы — одни точки (один вызов отрисовки):
// клуб растёт, светлеет и тает, ветер сносит на восток. Процессор только двигает несколько десятков точек.
import * as THREE from 'three';
import { glowTexture } from '../../render/kit.ts';

const MAX = 72;
/** Ветер с моря: сносит клубы на восток и чуть на юг, м/с */
const WIND: readonly [number, number] = [0.55, 0.12];

interface Puff {
  life: number;
  age: number;
  size0: number;
  size1: number;
  vy: number;
  alpha: number;
}

export class Smoke {
  private readonly pos = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly alpha = new Float32Array(MAX);
  private readonly color = new Float32Array(MAX * 3);
  private readonly puffs: Puff[] = [];
  private readonly geo = new THREE.BufferGeometry();
  private next = 0;
  readonly points: THREE.Points;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < MAX; i++) this.puffs.push({ life: 0, age: 1, size0: 0, size1: 0, vy: 0, alpha: 0 });
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture() }, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        uniform float uScale;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / max(1.0, -mv.z);
          vAlpha = aAlpha;
          vColor = aColor;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  /** Высота экрана в пикселях — чтобы клубы были одного размера при любом окне */
  setViewport(h: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.9;
  }

  /** Выпустить клуб: где, цвет, сколько живёт, размер в начале и в конце, скорость вверх, плотность */
  puff(x: number, y: number, z: number, color: number, life: number, s0: number, s1: number, vy: number, alpha: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const p = this.puffs[i];
    p.life = life;
    p.age = 0;
    p.size0 = s0;
    p.size1 = s1;
    p.vy = vy;
    p.alpha = alpha;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    const c = _c.setHex(color);
    this.color[i * 3] = c.r;
    this.color[i * 3 + 1] = c.g;
    this.color[i * 3 + 2] = c.b;
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      const p = this.puffs[i];
      if (p.age >= p.life) {
        this.alpha[i] = 0;
        continue;
      }
      any = true;
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      this.pos[i * 3] += WIND[0] * k * dt * 2;
      this.pos[i * 3 + 1] += p.vy * (1 - 0.6 * k) * dt;
      this.pos[i * 3 + 2] += WIND[1] * k * dt * 2;
      this.size[i] = p.size0 + (p.size1 - p.size0) * Math.sqrt(k);
      this.alpha[i] = p.alpha * Math.min(1, p.age / 0.15) * (1 - k) * (1 - k);
    }
    this.points.visible = any;
    if (!any) return;
    this.geo.attributes.position.needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
  }
}

const _c = new THREE.Color();
