// Цвет «Fight Club» — только в подвале. Сцена рисуется в текстуру, потом один проход шейдером: тон (ACES), меньше
// насыщенности, тени в холодную бирюзу, света в болезненный жёлто-зелёный, S-кривая, виньетка и живое зерно плёнки.
// Поверх — белая вспышка удара, затемнение между раундами и кадр-вспышка (своя картинка на пару кадров).
import * as THREE from 'three';
import { flashCanvas } from './paint.ts';
import type { FightVisualBudget } from './quality.ts';
import { gradeSize } from './quality.ts';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tFrame;
  uniform float uTime;
  uniform float uExposure;
  uniform float uFlash;
  uniform float uFade;
  uniform float uFrame;
  uniform float uGrain;
  uniform float uDesat;
  uniform vec2 uRes;
  varying vec2 vUv;

  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 c = aces(texture2D(tScene, vUv).rgb * uExposure);
    vec3 g = pow(c, vec3(1.0 / 2.2));
    float l = dot(g, vec3(0.299, 0.587, 0.114));
    g = mix(vec3(l), g, 0.66 * (1.0 - uDesat));
    float sh = 1.0 - smoothstep(0.0, 0.5, l);
    float hi = smoothstep(0.4, 1.0, l);
    g += vec3(-0.035, 0.03, 0.045) * sh;
    g += vec3(0.05, 0.065, -0.06) * hi;
    g *= vec3(0.97, 1.03, 0.84);
    g = clamp(g, 0.0, 1.0);
    g = mix(g, g * g * (3.0 - 2.0 * g), 0.5);
    vec2 d = vUv - 0.5;
    d.x *= uRes.x / max(1.0, uRes.y);
    g *= mix(0.4, 1.0, smoothstep(0.98, 0.28, length(d)));
    g = mix(g, vec3(1.0, 0.97, 0.88), uFlash);
    float n = hash(floor(gl_FragCoord.xy * 0.75) + fract(uTime * 7.13) * 917.0) - 0.5;
    g += n * 0.09 * uGrain * (1.0 - 0.55 * l);
    if (uFrame > 0.5) {
      vec4 f = texture2D(tFrame, vUv);
      g = mix(g, f.rgb, f.a);
    }
    g *= 1.0 - uFade;
    gl_FragColor = vec4(g, 1.0);
  }`;

export class Grade {
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mat: THREE.ShaderMaterial;
  private readonly size = new THREE.Vector2();
  /** Белая вспышка (0…1), затемнение (0…1), бесцветность (нокаут — 0…1) */
  flash = 0;
  fade = 0;
  desat = 0;
  exposure = 1.05;
  /** Кадр-вспышка: сколько ещё кадров показывать картинку */
  private frameLeft = 0;
  private scale = 1;

  constructor(renderer: THREE.WebGLRenderer, samples: number) {
    const ext = renderer.extensions;
    const hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples, depthBuffer: true,
    });
    const frame = new THREE.CanvasTexture(flashCanvas());
    // картинка уже в цветах экрана: шейдер пишет её как есть
    frame.colorSpace = THREE.NoColorSpace;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: this.rt.texture }, tFrame: { value: frame }, uTime: { value: 0 }, uExposure: { value: 1 }, uFlash: { value: 0 },
        uFade: { value: 0 }, uFrame: { value: 0 }, uGrain: { value: 1 }, uDesat: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
      },
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const quad = new THREE.Mesh(g, this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setQuality(budget: FightVisualBudget): void {
    if (this.rt.samples !== budget.samples) {
      this.rt.samples = budget.samples;
      // Пересоздать GPU-хранилище того же target; ссылки шейдера на texture сохраняются.
      this.rt.dispose();
    }
    this.scale = budget.scale;
    this.mat.uniforms.uGrain.value = budget.grain;
  }

  debugState(): Record<string, unknown> {
    return { samples: this.rt.samples, scale: this.scale, width: this.rt.width, height: this.rt.height, grain: this.mat.uniforms.uGrain.value };
  }

  /** Показать кадр-вспышку на n кадров. */
  showFrame(n = 2): void {
    this.frameLeft = n;
  }

  render(r: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, time: number, overlay?: { scene: THREE.Scene; camera: THREE.Camera }): void {
    r.getDrawingBufferSize(this.size);
    const [w, h] = gradeSize(this.size.x, this.size.y, this.scale);
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uExposure.value = this.exposure;
    u.uFlash.value = this.flash;
    u.uFade.value = this.fade;
    u.uDesat.value = this.desat;
    u.uRes.value.set(w, h);
    u.uFrame.value = this.frameLeft > 0 ? 1 : 0;
    if (this.frameLeft > 0) this.frameLeft--;
    const autoClear = r.autoClear;
    r.autoClear = false;
    try {
      r.setRenderTarget(this.rt);
      r.clear();
      r.render(scene, camera);
      if (overlay) {
        r.clearDepth();
        r.render(overlay.scene, overlay.camera);
      }
      r.setRenderTarget(null);
      r.clear();
      r.render(this.scene, this.cam);
    } finally {
      r.autoClear = autoClear;
    }
  }

  dispose(): void {
    this.rt.dispose();
    this.mat.dispose();
    (this.mat.uniforms.tFrame.value as THREE.Texture).dispose();
  }
}
