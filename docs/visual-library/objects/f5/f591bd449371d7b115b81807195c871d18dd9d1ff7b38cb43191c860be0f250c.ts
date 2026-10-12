// Эффекты событий «Крепости» (вид; механика, метки атак и маяк ящика, звук и тряска — у сервера, marks.ts и match.ts):
// - метеор: огненный ком варенья в языках пламени, со шлейфом огня, дыма и капель; к удару земля под ним разгорается
//   отсветом; удар — вспышка, огненный шар, брызги варенья и комья земли, ударная волна, дым столбом и кратер-клякса,
//   который тлеет и через ~12 с тает;
// - ящик припасов: спускается на полосатом парашюте с жёлтым дымом (на землю, ход стены, террасу, крышу телеги); лежит —
//   дым столбом, искры, купол парашюта рядом; подобран — крышка слетает, золотые искры, ящик исчезает;
// - лёгкий морской туман: клочья над морем, низкий слой над водой, двором и лугом (ниже головы), дымка у горизонта.
//   Дальность и цвет тумана сцены — механика видимости, их ведёт match.ts; здесь scene.fog только читается;
// - «золотая лихорадка»: тёплое золотое небо и свет, золотая пыль в воздухе, монеты из сбитых (coins()).
// Всё — заранее созданные пулы: частицы-спрайты (4 материала), пятна на земле (3), инстансы метеоров и монет. В кадре
// нет выделений памяти и пост-эффектов. Туман и золото плавно меняют солнце, небесный свет и полупрозрачный купол (в
// 460 м вокруг камеры: дальние холмы и горизонт тонут в дымке цвета тумана сцены), выключенные — возвращают свет.
import * as THREE from 'three';
import { makeRng } from '../../shared/math.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import type { Quality } from '../settings.ts';

/** Ящик припасов для crate(): как в хвосте снимка — 0 нет (подобран или волна кончилась), 1 летит, 2 лежит */
export const CRATE_NONE = 0;
export const CRATE_FALL = 1;
export const CRATE_DOWN = 2;
/** Внутреннее: ящик уходит (подобран или растаял) — доигрывается и гаснет */
const CRATE_GONE = 3;
/** Ящик спускается на парашюте столько секунд (сервер держит «летит» столько же) */
export const CRATE_FALL_S = 7;
/** Радиус удара метеора по умолчанию, м (свечение цели и кратер — от него) */
export const METEOR_R = 3;

/** Ящик: с какой высоты спускается, на сколько висит под куполом, размер */
const DROP_H = 34;
const HANG = 3.1;
const BOX = 0.9;
const MAX_METEORS = 12;
const MAX_COINS = 160;
const GOLD_DUST = 72;
/** Монета: радиус, м (крупная, игрушечная — читается с 20 м) */
const COIN_R = 0.2;
const WISPS = 12;
/** В тумане солнце слабее во столько раз (небесный свет чуть сильнее — тени мягче) */
const FOG_SUN = 0.8;

// ------------------------------------------------------------ цвета (линейные; «дисплейные» помечены)

const col = (hex: number) => new THREE.Color(hex);
/**
 * Купол и слои пишут цвет в кадр как есть («дисплейный», без тонмаппинга). Цвет тумана сцены берётся из scene.fog.color
 * и переводится в sRGB — так three.js сам подмешивает туман к уже готовому цвету. Этот — если у сцены тумана нет.
 */
const FOG_COLOR = new THREE.Color().setRGB(0.88, 0.91, 0.93);
const GOLD_DOME = new THREE.Color().setRGB(1.0, 0.8, 0.45);
const GOLD_SUN = col(0xffcf7a);
const GOLD_SKY = col(0xffdca0);
const GOLD_GROUND = col(0xa99050);
const FOG_SKY = col(0xe8eef2);

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _c3 = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// ------------------------------------------------------------ пулы частиц и пятен

/** Поля частицы (Float32Array, шаг F) */
const F = 24;
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, LIFE = 6, MAX = 7, S0 = 8, S1 = 9;
const R0 = 10, G0 = 11, B0 = 12, A0 = 13, R1 = 14, G1 = 15, B1 = 16, A1 = 17;
const GRAV = 18, DRAG = 19, ROT = 20, SPIN = 21, STRETCH = 22, FADEIN = 23;

/** Как пул пишет 4-й атрибут: вытянуть по скорости, повернуть спрайт, повернуть пятно на земле */
const M_STRETCH = 0;
const M_ROT = 1;
const M_DECAL = 2;

/** Новая частица: один объект на модуль, заполняется перед emit — без выделений */
interface Spec {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; s0: number; s1: number; c0: THREE.Color; a0: number; c1: THREE.Color; a1: number;
  grav: number; drag: number; rot: number; spin: number; stretch: number; fadeIn: number;
}

const SP: Spec = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, s0: 1, s1: 1, c0: new THREE.Color(), a0: 1, c1: new THREE.Color(), a1: 0,
  grav: 0, drag: 0, rot: 0, spin: 0, stretch: 0, fadeIn: 0,
};

function at(x: number, y: number, z: number, life: number, s0: number, s1: number): Spec {
  SP.x = x;
  SP.y = y;
  SP.z = z;
  SP.vx = SP.vy = SP.vz = 0;
  SP.life = life;
  SP.s0 = s0;
  SP.s1 = s1;
  SP.a0 = 1;
  SP.a1 = 0;
  SP.grav = SP.drag = SP.rot = SP.spin = SP.stretch = SP.fadeIn = 0;
  return SP;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Пул: частицы считаются на процессоре, рисуются одним вызовом (инстансы квадрата); put — разовый спрайт на кадр. */
class Pool {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly ext: Float32Array;
  private readonly p: Float32Array;
  private readonly out: number;
  private readonly mode: number;
  private next = 0;
  private n = 0;
  live = 0;

  constructor(cap: number, extra: number, material: THREE.ShaderMaterial, mode: number, renderOrder: number) {
    this.mode = mode;
    this.p = new Float32Array(cap * F);
    this.out = cap + extra;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(base.index);
    geo.setAttribute('position', base.getAttribute('position'));
    this.pos = new Float32Array(this.out * 4);
    this.col = new Float32Array(this.out * 4);
    this.ext = new Float32Array(this.out * 4);
    const make = (a: Float32Array) => new THREE.InstancedBufferAttribute(a, 4).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    this.attrs = [make(this.pos), make(this.col), make(this.ext)];
    geo.setAttribute('aPos', this.attrs[0]);
    geo.setAttribute('aCol', this.attrs[1]);
    geo.setAttribute('aExt', this.attrs[2]);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.mesh.userData.fx = true;
  }

  private get cap(): number {
    return this.p.length / F;
  }

  emit(s: Spec): void {
    const i = this.next;
    this.next = (i + 1) % this.cap;
    const p = this.p;
    const o = i * F;
    p[o + PX] = s.x;
    p[o + PY] = s.y;
    p[o + PZ] = s.z;
    p[o + VX] = s.vx;
    p[o + VY] = s.vy;
    p[o + VZ] = s.vz;
    p[o + LIFE] = s.life;
    p[o + MAX] = s.life;
    p[o + S0] = s.s0;
    p[o + S1] = s.s1;
    p[o + R0] = s.c0.r;
    p[o + G0] = s.c0.g;
    p[o + B0] = s.c0.b;
    p[o + A0] = s.a0;
    p[o + R1] = s.c1.r;
    p[o + G1] = s.c1.g;
    p[o + B1] = s.c1.b;
    p[o + A1] = s.a1;
    p[o + GRAV] = s.grav;
    p[o + DRAG] = s.drag;
    p[o + ROT] = s.rot;
    p[o + SPIN] = s.spin;
    p[o + STRETCH] = s.stretch;
    p[o + FADEIN] = s.fadeIn;
  }

  begin(): void {
    this.n = 0;
  }

  simulate(dt: number): void {
    const p = this.p;
    const cap = this.cap;
    let live = 0;
    for (let i = 0; i < cap; i++) {
      const o = i * F;
      let life = p[o + LIFE];
      if (life <= 0) continue;
      life -= dt;
      p[o + LIFE] = life;
      if (life <= 0) continue;
      live++;
      const k = 1 - life / p[o + MAX];
      let vx = p[o + VX];
      let vy = p[o + VY] - p[o + GRAV] * dt;
      let vz = p[o + VZ];
      const drag = p[o + DRAG];
      if (drag > 0) {
        const d = 1 / (1 + drag * dt);
        vx *= d;
        vy *= d;
        vz *= d;
      }
      p[o + VX] = vx;
      p[o + VY] = vy;
      p[o + VZ] = vz;
      const x = (p[o + PX] += vx * dt);
      const y = (p[o + PY] += vy * dt);
      const z = (p[o + PZ] += vz * dt);
      const rot = (p[o + ROT] += p[o + SPIN] * dt);
      let a = p[o + A0] + (p[o + A1] - p[o + A0]) * k;
      const fi = p[o + FADEIN];
      if (fi > 0 && k < fi) a *= k / fi;
      const size = p[o + S0] + (p[o + S1] - p[o + S0]) * k;
      const r = p[o + R0] + (p[o + R1] - p[o + R0]) * k;
      const g = p[o + G0] + (p[o + G1] - p[o + G0]) * k;
      const b = p[o + B0] + (p[o + B1] - p[o + B0]) * k;
      if (this.mode === M_STRETCH) this.put(x, y, z, size, r, g, b, a, vx, vy, vz, p[o + STRETCH]);
      else if (this.mode === M_ROT) this.put(x, y, z, size, r, g, b, a, 0, 0, 0, rot);
      else this.put(x, y, z, size, r, g, b, a, rot, 0, 0, 0);
    }
    this.live = live;
  }

  /** Спрайт на один кадр (ореол, шлейф, метка): e — скорость и вытяжка, поворот или поворот пятна (как у пула) */
  put(x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number, e0: number, e1: number, e2: number, e3: number): void {
    if (this.n >= this.out || a <= 0.001) return;
    const j = this.n++ * 4;
    this.pos[j] = x;
    this.pos[j + 1] = y;
    this.pos[j + 2] = z;
    this.pos[j + 3] = size;
    this.col[j] = r;
    this.col[j + 1] = g;
    this.col[j + 2] = b;
    this.col[j + 3] = a;
    this.ext[j] = e0;
    this.ext[j + 1] = e1;
    this.ext[j + 2] = e2;
    this.ext[j + 3] = e3;
  }

  end(): void {
    const n = this.n;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    for (let i = 0; i < this.attrs.length; i++) {
      const a = this.attrs[i];
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
  }

  clear(): void {
    const p = this.p;
    for (let i = LIFE; i < p.length; i += F) p[i] = 0;
    this.n = 0;
    this.live = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }
}

// ------------------------------------------------------------ шейдеры частиц и пятен

const SPRITE_VERT = /* glsl */ `
  attribute vec4 aPos;
  attribute vec4 aCol;
  attribute vec4 aExt;
  uniform float uNear;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vShade;
  #include <fog_pars_vertex>
  void main() {
    vUv = position.xy + 0.5;
    vCol = aCol;
    vec4 mvPosition = modelViewMatrix * vec4(aPos.xyz, 1.0);
    vec2 q = position.xy * aPos.w;
  #ifdef STRETCH
    // вытянуть вдоль скорости на экране: длина растёт со скоростью (aExt.w — сколько)
    vec3 v = (modelViewMatrix * vec4(aExt.xyz, 0.0)).xyz;
    float l = length(v.xy);
    vec2 ax = l > 1e-5 ? v.xy / l : vec2(1.0, 0.0);
    q = ax * (q.x * (1.0 + aExt.w * l)) + vec2(-ax.y, ax.x) * q.y;
  #else
    float c = cos(aExt.w);
    float s = sin(aExt.w);
    q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  #endif
    vShade = 0.5 + q.y / max(aPos.w, 1e-4);
    mvPosition.xy += q;
    // у самой камеры гаснет: дым и искры не закрывают взгляд
    vCol.a *= smoothstep(uNear * 0.3, uNear, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const DECAL_VERT = /* glsl */ `
  attribute vec4 aPos;
  attribute vec4 aCol;
  attribute vec4 aExt;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vShade;
  #include <fog_pars_vertex>
  void main() {
    vUv = position.xy + 0.5;
    vCol = aCol;
    vShade = 1.0;
    float c = cos(aExt.x);
    float s = sin(aExt.x);
    vec2 q = position.xy * aPos.w;
    q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    vec4 mvPosition = modelViewMatrix * vec4(aPos.x + q.x, aPos.y, aPos.z + q.y, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/** Форма — по define: SHAPE_STAR (искра-звёздочка), SHAPE_PUFF (клуб дыма, текстура), SHAPE_BLOB (капля), SHAPE_RING,
 *  SHAPE_MAP (пятно-текстура); без них — мягкое пятно света. ADDITIVE — светится (в тумане гаснет, а не белеет). */
const FX_FRAG = /* glsl */ `
  #if defined(SHAPE_PUFF) || defined(SHAPE_MAP)
  uniform sampler2D map;
  #endif
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vShade;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    vec3 rgb = vCol.rgb;
    float a;
  #if defined(SHAPE_STAR)
    float r = length(p);
    float core = exp(-r * r * 14.0);
    float rays = exp(-abs(p.x) * 20.0) * (1.0 - abs(p.y)) + exp(-abs(p.y) * 20.0) * (1.0 - abs(p.x));
    a = clamp(core * 1.5 + rays, 0.0, 1.0) * (1.0 - smoothstep(0.8, 1.0, r));
  #elif defined(SHAPE_PUFF)
    vec4 t = texture2D(map, vUv);
    a = t.a;
    rgb *= mix(0.74, 1.1, clamp(vShade, 0.0, 1.0));
  #elif defined(SHAPE_BLOB)
    float d = length(p);
    a = 1.0 - smoothstep(0.74, 1.0, d);
    vec2 h = p - vec2(-0.3, 0.36);
    rgb = rgb * (0.8 + 0.25 * clamp(vShade, 0.0, 1.0)) + exp(-dot(h, h) * 10.0) * 0.4;
  #elif defined(SHAPE_RING)
    float d = length(p);
    a = smoothstep(0.66, 0.84, d) * (1.0 - smoothstep(0.86, 1.0, d));
  #elif defined(SHAPE_MAP)
    vec4 t = texture2D(map, vUv);
    rgb *= t.rgb;
    a = t.a;
  #else
    a = clamp(exp(-dot(p, p) * 3.4) * 1.04 - 0.04, 0.0, 1.0);
  #endif
    a *= vCol.a;
  #ifdef ADDITIVE
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        a *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
      #endif
    #endif
    if (a < 0.002) discard;
    gl_FragColor = vec4(rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  #else
    if (a < 0.004) discard;
    gl_FragColor = vec4(rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  #endif
  }
`;

function fxMaterial(vert: string, defines: Record<string, string>, additive: boolean, map: THREE.Texture | null, decal: boolean): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: FX_FRAG,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uNear: { value: 1.4 }, map: { value: null } }]),
    defines: additive ? { ...defines, ADDITIVE: '' } : defines,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  // после merge: он копирует текстуры
  m.uniforms.map.value = map;
  if (decal) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -6;
  }
  return m;
}

// ------------------------------------------------------------ туман: купол дымки и низкие слои

const DOME_VERT = /* glsl */ `
  uniform float uRadius;
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * viewMatrix * vec4(normalize(position) * uRadius + cameraPosition, 1.0);
  }
`;

/**
 * Полупрозрачный купол вокруг камеры: дымка у горизонта (за ним — холмы, даль моря, небо). Радиус — 460 м или чуть
 * дальше границы тумана сцены, если она ближе: холмы без тумана не торчат из сплошной дымки.
 */
const DOME_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLow;
  uniform float uHigh;
  uniform vec3 uSunDir;
  uniform float uSun;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float a = mix(uLow, uHigh, smoothstep(0.0, 0.42, d.y));
    a += uSun * pow(max(dot(d, uSunDir), 0.0), 5.0) * 0.4;
    gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
  }
`;

const SHEET_VERT = /* glsl */ `
  attribute float aLayer;
  varying vec3 vWorld;
  varying float vLayer;
  #include <fog_pars_vertex>
  void main() {
    vLayer = aLayer;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/**
 * Низкий туман: три горизонтальных слоя с шумом (клочья плывут). Над морем — все три (до 1,7 м), над двором и лугом —
 * два нижних (по колено и пояс), чтобы головы врагов оставались видны. У камеры и у краёв слоя — тает.
 */
const SHEET_FRAG = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform float uK;
  uniform vec3 uColor;
  varying vec3 vWorld;
  varying float vLayer;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vWorld.xz;
    float seed = vLayer * 0.37;
    float n1 = texture2D(uNoise, p * 0.019 + vec2(uTime * 0.0042 + seed, uTime * 0.0013)).r;
    float n2 = texture2D(uNoise, p * 0.052 + vec2(-uTime * 0.0061, uTime * 0.0034 + seed * 1.9)).r;
    float dens = smoothstep(0.32, 0.8, n1 * 0.62 + n2 * 0.38);
    float sea = smoothstep(21.0, 32.0, vWorld.z);
    float land = vLayer < 1.5 ? 0.55 * (1.0 - smoothstep(38.0, 78.0, abs(vWorld.x))) * smoothstep(-72.0, -36.0, vWorld.z) : 0.0;
    float edge = (1.0 - smoothstep(105.0, 130.0, abs(vWorld.x))) * smoothstep(-96.0, -74.0, vWorld.z) * (1.0 - smoothstep(118.0, 145.0, vWorld.z));
    float dist = distance(cameraPosition, vWorld);
    float nearF = smoothstep(1.5, 9.0, dist);
    // за границей тумана сцены слои не нужны (там и так всё в дымке) — и не рисуют светлую полосу у горизонта
    #if defined(USE_FOG) && !defined(FOG_EXP2)
      nearF *= 1.0 - smoothstep(fogFar * 0.7, fogFar * 1.15, dist);
    #endif
    float a = dens * max(sea, land) * edge * nearF * uK * (vLayer > 1.5 ? 0.42 : 0.3);
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <fog_fragment>
  }
`;

// ------------------------------------------------------------ процедурные текстуры (без canvas)

function dataTexture(S: number, fn: (u: number, v: number, out: Float32Array) => void, srgb: boolean, repeat: boolean): THREE.DataTexture {
  const data = new Uint8Array(S * S * 4);
  const out = new Float32Array(4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      out.fill(0);
      fn((x + 0.5) / S, (y + 0.5) / S, out);
      const o = (y * S + x) * 4;
      for (let k = 0; k < 4; k++) data[o + k] = Math.max(0, Math.min(255, Math.round(out[k] * 255)));
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Клуб дыма: несколько гауссовых комков, мягкий рваный край */
function puffTexture(): THREE.DataTexture {
  const rng = makeRng(503);
  const blobs: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const r = i === 0 ? 0 : 0.18 + rng() * 0.22;
    blobs.push([Math.cos(a) * r, Math.sin(a) * r, 0.22 + rng() * 0.16, 0.55 + rng() * 0.45]);
  }
  return dataTexture(64, (u, v, out) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    let s = 0;
    for (const [bx, by, br, bw] of blobs) s += bw * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (br * br));
    const a = Math.min(1, s * 0.85) * (1 - smooth(0.82, 1, Math.hypot(x, y)));
    out[0] = out[1] = out[2] = 0.9 + 0.1 * Math.min(1, s);
    out[3] = a;
  }, false, false);
}

/** Кратер-клякса: тёмный опалённый центр, варенье с глянцем и потёками-лучами, капли вокруг */
function craterTexture(): THREE.DataTexture {
  const rng = makeRng(611);
  const waves: Array<[number, number, number]> = [];
  for (let k = 2; k <= 7; k++) waves.push([k, rng() * Math.PI * 2, (0.05 / k) * (1 + rng())]);
  const rays: Array<[number, number, number]> = [];
  for (let i = 0; i < 9; i++) rays.push([rng() * Math.PI * 2, 0.16 + rng() * 0.2, 0.05 + rng() * 0.05]);
  const drops: Array<[number, number, number]> = [];
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.68 + rng() * 0.26;
    drops.push([Math.cos(a) * r, Math.sin(a) * r, 0.03 + rng() * 0.05]);
  }
  return dataTexture(128, (u, v, out) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const d = Math.hypot(x, y);
    const th = Math.atan2(y, x);
    let R = 0.56;
    for (const [k, ph, amp] of waves) R += amp * Math.sin(k * th + ph);
    for (const [ra, len, w] of rays) {
      let dth = Math.abs(th - ra);
      if (dth > Math.PI) dth = Math.PI * 2 - dth;
      R += len * Math.exp(-(dth * dth) / (w * w)) * (1 - smooth(0.6, 1.0, d) * 0.3);
    }
    let a = 1 - smooth(R - 0.025, R + 0.02, d);
    for (const [dx, dy, dr] of drops) a = Math.max(a, 1 - smooth(dr - 0.012, dr + 0.012, Math.hypot(x - dx, y - dy)));
    // варенье: тёмно-малиновое, у края светлее (глянцевый валик), в центре — опалённая земля
    const rim = Math.exp(-((d - R + 0.06) ** 2) / 0.003);
    const scorch = 1 - smooth(0.06, 0.4, d);
    let r = 0.55 + rim * 0.25;
    let g = 0.08 + rim * 0.06;
    let b = 0.26 + rim * 0.14;
    r = r * (1 - scorch) + 0.16 * scorch;
    g = g * (1 - scorch) + 0.1 * scorch;
    b = b * (1 - scorch) + 0.11 * scorch;
    // блики глянца
    const gl = Math.exp(-((x + 0.22) ** 2 + (y - 0.3) ** 2) / 0.004) + Math.exp(-((x - 0.34) ** 2 + (y + 0.12) ** 2) / 0.002);
    out[0] = r + gl * 0.5;
    out[1] = g + gl * 0.4;
    out[2] = b + gl * 0.45;
    out[3] = a * 0.96;
  }, true, false);
}

/** Шум для низкого тумана: два октава сглаженного шума, тайлится */
function noiseTexture(): THREE.DataTexture {
  const rng = makeRng(701);
  const grid = (n: number) => Array.from({ length: n * n }, () => rng());
  const g1 = grid(6);
  const g2 = grid(13);
  const sample = (g: number[], n: number, u: number, v: number) => {
    const x = u * n;
    const y = v * n;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at2 = (i: number, j: number) => g[((j % n) + n) % n * n + (((i % n) + n) % n)];
    const a = at2(x0, y0) + (at2(x0 + 1, y0) - at2(x0, y0)) * sx;
    const b = at2(x0, y0 + 1) + (at2(x0 + 1, y0 + 1) - at2(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
  return dataTexture(128, (u, v, out) => {
    const n = sample(g1, 6, u, v) * 0.66 + sample(g2, 13, u, v) * 0.34;
    out[0] = out[1] = out[2] = out[3] = n;
  }, false, true);
}

/** Доски ящика припасов с рамкой и жёлтым кругом с крестом на каждой грани */
function crateTexture(): THREE.DataTexture {
  const rng = makeRng(809);
  const tones = Array.from({ length: 6 }, () => 0.85 + rng() * 0.25);
  return dataTexture(64, (u, v, out) => {
    const plank = Math.floor(v * 5);
    let k = tones[plank % tones.length] * (0.94 + 0.06 * Math.sin(u * 60 + plank * 7));
    if (Math.abs(v * 5 - Math.round(v * 5)) < 0.06) k *= 0.55;
    let r = 0.62 * k;
    let g = 0.42 * k;
    let b = 0.24 * k;
    const frame = Math.min(u, v, 1 - u, 1 - v);
    if (frame < 0.1) {
      r = 0.44;
      g = 0.29;
      b = 0.16;
      if (frame < 0.03) r = g = b = 0.3;
    }
    const d = Math.hypot(u - 0.5, v - 0.5);
    if (d < 0.25) {
      r = 1.0;
      g = 0.78;
      b = 0.2;
      if (d > 0.225) r = g = b = 0.22;
      const cross = (Math.abs(u - 0.5) < 0.045 && Math.abs(v - 0.5) < 0.16) || (Math.abs(v - 0.5) < 0.045 && Math.abs(u - 0.5) < 0.16);
      if (cross) {
        r = 0.78;
        g = 0.16;
        b = 0.12;
      }
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
    out[3] = 1;
  }, true, false);
}

// ------------------------------------------------------------ модели

/** Ком варенья: бугристый шар, малиновый с жёлто-оранжевыми трещинами (светится сам, без освещения) */
function meteorGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.8, 2);
  const p = g.getAttribute('position');
  const colors = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = Math.sin(v.x * 3.1 + 1.3) * Math.sin(v.y * 2.7 + 0.4) * Math.sin(v.z * 3.3 + 2.1) + 0.45 * Math.sin(v.x * 6.3 + v.y * 5.1 + v.z * 4.7);
    const crack = Math.max(0, 1 - Math.abs(Math.sin(v.x * 7.7 - v.y * 6.1 + v.z * 5.3) + 0.4 * Math.sin(v.y * 11 + v.z * 9)) * 2.4);
    v.multiplyScalar(0.8 * (1 + 0.17 * n));
    p.setXYZ(i, v.x, v.y, v.z);
    // тёмно-вишнёвое варенье, сквозь трещины — раскалённое оранжевое нутро
    const hot = Math.min(1, crack * crack * 1.4);
    colors[i * 3] = (0.5 + 0.12 * n) * (1 - hot) + 2.6 * hot;
    colors[i * 3 + 1] = 0.035 * (1 - hot) + 1.05 * hot;
    colors[i * 3 + 2] = (0.07 + 0.03 * n) * (1 - hot) + 0.12 * hot;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Монета: золотой диск ребром к z, грань светлее ребра */
function coinGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.045, 18).toNonIndexed();
  g.rotateX(Math.PI / 2);
  const n = g.getAttribute('normal');
  const colors = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const face = Math.abs(n.getZ(i)) > 0.5;
    colors[i * 3] = face ? 1 : 0.85;
    colors[i * 3 + 1] = face ? 0.74 : 0.52;
    colors[i * 3 + 2] = face ? 0.22 : 0.12;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Купол парашюта: оранжевые и кремовые клинья */
function canopyGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, Math.PI * 0.42).toNonIndexed();
  g.scale(2.3, 1.25, 2.3);
  const p = g.getAttribute('position');
  const colors = new Float32Array(p.count * 3);
  const orange = col(0xff8a1c);
  const cream = col(0xfff1dc);
  // клин по центру треугольника, чтобы полосы не расплывались
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const a = Math.atan2(cz, cx) + Math.PI;
    const c = Math.floor(a / ((Math.PI * 2) / 12)) % 2 ? cream : orange;
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r;
      colors[(i + k) * 3 + 1] = c.g;
      colors[(i + k) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// ------------------------------------------------------------ состояние

interface Meteor {
  on: boolean;
  fx: number; fy: number; fz: number;
  tx: number; ty: number; tz: number;
  dur: number; t: number; r: number;
  /** Последняя точка, где сыпали шлейф */
  ex: number; ey: number; ez: number;
  smoke: number; drip: number; spin: number;
}

interface LightBase {
  sun: THREE.Color; sunI: number; sky: THREE.Color; ground: THREE.Color; hemiI: number;
}

/** Монета: поля в Float32Array (шаг C) */
const C = 12;
const CX = 0, CY = 1, CZ = 2, CVX = 3, CVY = 4, CVZ = 5, CLIFE = 6, CMAX = 7, CANG = 8, CSPIN = 9, CGROUND = 10, CYAW = 11;

/**
 * Эффекты событий. Создать один раз на мир крепости (сцена живёт между заходами), звать update(dt) каждый кадр после
 * камеры, clear() — при выходе из крепости и в начале новой игры, dispose() — когда мир разбирают.
 */
export class EventFx {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly world: CollisionWorld | null;
  private time = 0;
  private density = 1;

  // пулы
  private readonly fire: Pool;
  private readonly glint: Pool;
  private readonly smoke: Pool;
  private readonly blob: Pool;
  private readonly glow: Pool;
  private readonly ring: Pool;
  private readonly crater: Pool;
  private readonly pools: Pool[];

  // метеоры
  private readonly meteors: Meteor[] = [];
  private readonly rocks: THREE.InstancedMesh;

  // монеты
  private readonly coinData = new Float32Array(MAX_COINS * C);
  private coinNext = 0;
  private readonly coinMesh: THREE.InstancedMesh;

  // ящик
  private readonly crateRoot = new THREE.Group();
  private readonly swing = new THREE.Group();
  private readonly box: THREE.Mesh;
  private readonly lid: THREE.Mesh;
  private readonly canopy: THREE.Mesh;
  private readonly lines: THREE.LineSegments;
  private readonly flare: THREE.Mesh;
  private cState = CRATE_NONE;
  private cX = 0;
  private cZ = 0;
  private cY = 0;
  /** Время в текущем состоянии ящика; когда сел (для купола), сдвиг купола в сторону */
  private cT = 0;
  private landT = -1;
  private lidVy = 0;
  private takenAt = -9;
  private smokeAcc = 0;
  /** Снимок «нет» без подбора: облачко — в следующем кадре, если событие подбора не пришло в этом же */
  private poof = false;
  /** Где лежит купол парашюта (в осях ящика) или накрыл ящик, если сбоку нет опоры (край стены, крыша телеги) */
  private canX = 1.9;
  private canZ = 0.7;
  private canDrape = false;

  // туман и золото
  private wantFog = false;
  private wantGold = false;
  private kFog = 0;
  private kGold = 0;
  private base: LightBase | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private hemi: THREE.HemisphereLight | null = null;
  private readonly dome: THREE.Mesh;
  private readonly domeMat: THREE.ShaderMaterial;
  private readonly sheets: THREE.Mesh;
  private readonly sheetMat: THREE.ShaderMaterial;
  private readonly dust = new Float32Array(GOLD_DUST * 4);
  private readonly wisps = new Float32Array(WISPS * 5);

  constructor(scene: THREE.Scene, camera: THREE.Camera, world: CollisionWorld | null = null) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    const puff = puffTexture();
    this.smoke = new Pool(420, WISPS + MAX_METEORS * 3 + 4, fxMaterial(SPRITE_VERT, { SHAPE_PUFF: '' }, false, puff, false), M_ROT, 4);
    this.blob = new Pool(320, 0, fxMaterial(SPRITE_VERT, { SHAPE_BLOB: '', STRETCH: '' }, false, null, false), M_STRETCH, 4);
    this.fire = new Pool(640, MAX_METEORS * 4, fxMaterial(SPRITE_VERT, { STRETCH: '' }, true, null, false), M_STRETCH, 5);
    this.glint = new Pool(260, GOLD_DUST + MAX_COINS / 4, fxMaterial(SPRITE_VERT, { SHAPE_STAR: '' }, true, null, false), M_ROT, 6);
    this.crater = new Pool(24, 0, fxMaterial(DECAL_VERT, { SHAPE_MAP: '' }, false, craterTexture(), true), M_DECAL, 2);
    this.glow = new Pool(40, MAX_METEORS + 4, fxMaterial(DECAL_VERT, {}, true, null, true), M_DECAL, 3);
    this.ring = new Pool(24, 4, fxMaterial(DECAL_VERT, { SHAPE_RING: '' }, true, null, true), M_DECAL, 3);
    this.pools = [this.crater, this.glow, this.ring, this.smoke, this.blob, this.fire, this.glint];
    for (const p of this.pools) scene.add(p.mesh);
    // огонь и искры гаснут ближе к камере, дым — чуть дальше (не закрывает прицел)
    (this.smoke.mesh.material as THREE.ShaderMaterial).uniforms.uNear.value = 2.5;

    for (let i = 0; i < MAX_METEORS; i++) {
      this.meteors.push({ on: false, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, dur: 1, t: 0, r: METEOR_R, ex: 0, ey: 0, ez: 0, smoke: 0, drip: 0, spin: 0 });
    }
    this.rocks = new THREE.InstancedMesh(meteorGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), MAX_METEORS);
    this.rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rocks.count = 0;
    this.rocks.frustumCulled = false;
    this.rocks.visible = false;
    this.rocks.userData.fx = true;
    scene.add(this.rocks);

    this.coinMesh = new THREE.InstancedMesh(coinGeometry(), new THREE.MeshStandardMaterial({
      vertexColors: true, metalness: 0.35, roughness: 0.32, emissive: 0x7a4c00, emissiveIntensity: 0.55,
    }), MAX_COINS);
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.count = 0;
    this.coinMesh.frustumCulled = false;
    this.coinMesh.visible = false;
    this.coinMesh.userData.fx = true;
    scene.add(this.coinMesh);

    // ящик: корень — у кромки купола; под ним на стропах ящик, на ящике — фальшфейер
    const wood = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.8 });
    this.box = new THREE.Mesh(new THREE.BoxGeometry(BOX, BOX, BOX), wood);
    this.box.position.y = -HANG;
    this.lid = new THREE.Mesh(new THREE.BoxGeometry(BOX + 0.06, 0.09, BOX + 0.06), new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.85 }));
    this.canopy = new THREE.Mesh(canopyGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }));
    const lp: number[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      lp.push(Math.cos(a) * 2.2, 0.32, Math.sin(a) * 2.2, Math.cos(a) * 0.32, -HANG + BOX / 2, Math.sin(a) * 0.32);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xf4efe4, transparent: true, opacity: 0.9 }));
    this.flare = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 8), new THREE.MeshBasicMaterial({ color: 0xff5a3a }));
    this.swing.add(this.canopy, this.lines, this.box, this.lid, this.flare);
    this.crateRoot.add(this.swing);
    this.crateRoot.visible = false;
    this.crateRoot.userData.fx = true;
    scene.add(this.crateRoot);

    // купол дымки и низкий туман
    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color() }, uLow: { value: 0 }, uHigh: { value: 0 }, uRadius: { value: 460 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: 0 },
      },
      transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.BackSide,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(460, 32, 16), this.domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -9;
    this.dome.visible = false;
    this.dome.userData.fx = true;
    scene.add(this.dome);

    this.sheetMat = new THREE.ShaderMaterial({
      vertexShader: SHEET_VERT,
      fragmentShader: SHEET_FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uNoise: { value: null }, uTime: { value: 0 }, uK: { value: 0 }, uColor: { value: FOG_COLOR.clone() },
      }]),
      transparent: true, depthWrite: false, fog: true, toneMapped: false, side: THREE.DoubleSide,
    });
    this.sheetMat.uniforms.uNoise.value = noiseTexture();
    const sheet = new THREE.BufferGeometry();
    const sp: number[] = [];
    const sl: number[] = [];
    const heights = [0.32, 0.88, 1.7];
    heights.forEach((h, layer) => {
      const [x0, x1, z0, z1] = [-130, 130, -96, 145];
      sp.push(x0, h, z0, x0, h, z1, x1, h, z0, x1, h, z0, x0, h, z1, x1, h, z1);
      for (let k = 0; k < 6; k++) sl.push(layer);
    });
    sheet.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sheet.setAttribute('aLayer', new THREE.Float32BufferAttribute(sl, 1));
    this.sheets = new THREE.Mesh(sheet, this.sheetMat);
    this.sheets.frustumCulled = false;
    this.sheets.renderOrder = 3;
    this.sheets.visible = false;
    this.sheets.userData.fx = true;
    scene.add(this.sheets);

    // золотая пыль и клочья тумана над морем: случайные места, считаются от камеры и времени
    const rng = makeRng(1201);
    for (let i = 0; i < GOLD_DUST; i++) {
      this.dust[i * 4] = rng() * 48 - 24;
      this.dust[i * 4 + 1] = 0.6 + rng() * 8.5;
      this.dust[i * 4 + 2] = rng() * 48 - 24;
      this.dust[i * 4 + 3] = rng() * 100;
    }
    for (let i = 0; i < WISPS; i++) {
      this.wisps[i * 5] = -110 + rng() * 220;
      this.wisps[i * 5 + 1] = 1.2 + rng() * 3.6;
      this.wisps[i * 5 + 2] = 34 + rng() * 80;
      this.wisps[i * 5 + 3] = 16 + rng() * 14;
      this.wisps[i * 5 + 4] = rng() * 6;
    }
  }

  // ------------------------------------------------------------ метеор

  /**
   * Метеор летит из (fx, fy, fz) в (tx, ty, tz) за seconds: ком в пламени, шлейф огня и дыма, капли варенья; земля под
   * ним к удару разгорается отсветом (метку атаки рисует marks.ts). Сам удар — meteorHit (событие blast); долетел раньше
   * события — ждёт на месте до 0,3 с.
   */
  meteor(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, seconds: number, r = METEOR_R): void {
    let m = this.meteors.find((q) => !q.on);
    if (!m) {
      // все заняты — заменить того, кто ближе всех к удару
      m = this.meteors[0];
      for (const q of this.meteors) if (q.t / q.dur > m.t / m.dur) m = q;
    }
    m.on = true;
    m.fx = fx; m.fy = fy; m.fz = fz;
    m.tx = tx; m.ty = ty; m.tz = tz;
    m.dur = Math.max(0.2, seconds);
    m.t = 0;
    m.r = r > 0 ? r : METEOR_R;
    m.ex = fx; m.ey = fy; m.ez = fz;
    m.smoke = 0;
    m.drip = 0;
    m.spin = Math.random() * 6;
  }

  /** Удар метеора: вспышка, огненный шар, брызги варенья и земли, ударная волна, дым, кратер-клякса */
  meteorHit(x: number, y: number, z: number, r = METEOR_R): void {
    for (const m of this.meteors) if (m.on && Math.abs(m.tx - x) < 2.5 && Math.abs(m.tz - z) < 2.5) m.on = false;
    const k = this.density;
    const R = r > 0 ? r : METEOR_R;
    // вспышка (свет) и огненный шар (плотные клубы: днём читаются лучше свечения)
    let s = at(x, y + 0.8, z, 0.22, R * 1.3, R * 2.4);
    s.c0.setRGB(1.4, 0.62, 0.2);
    s.c1.setRGB(1.0, 0.3, 0.1);
    s.a0 = 0.55;
    this.fire.emit(s);
    for (let i = 0; i < Math.round(16 * k); i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * 0.45 * R;
      s = at(x + Math.cos(a) * rr, y + rand(0.3, 1.2), z + Math.sin(a) * rr, rand(0.6, 1.0), rand(2.6, 3.4), rand(4.2, 5.6));
      s.vx = Math.cos(a) * rand(1.5, 4);
      s.vy = rand(2.5, 6);
      s.vz = Math.sin(a) * rand(1.5, 4);
      s.drag = 2.4;
      s.rot = Math.random() * 6;
      s.spin = rand(-1.5, 1.5);
      if (i % 3 === 0) s.c0.setRGB(2.0, 1.25, 0.32);
      else s.c0.setRGB(1.6, 0.6, 0.12);
      s.c1.setRGB(0.3, 0.07, 0.1);
      s.a0 = 1;
      this.smoke.emit(s);
    }
    // угольки
    for (let i = 0; i < Math.round(26 * k); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(4, 11);
      s = at(x, y + 0.4, z, rand(0.7, 1.4), rand(0.12, 0.22), 0.06);
      s.vx = Math.cos(a) * sp;
      s.vz = Math.sin(a) * sp;
      s.vy = rand(4, 10);
      s.grav = 11;
      s.drag = 0.6;
      s.stretch = 0.08;
      s.c0.setRGB(2.2, 1.3, 0.4);
      s.c1.setRGB(1.2, 0.3, 0.1);
      this.fire.emit(s);
    }
    // брызги варенья и комья земли
    for (let i = 0; i < Math.round(40 * k); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(3.5, 9.5);
      const jam = i % 3 !== 0;
      s = at(x + Math.cos(a) * 0.4, y + 0.3, z + Math.sin(a) * 0.4, rand(0.9, 1.4), jam ? rand(0.2, 0.38) : rand(0.16, 0.28), 0.1);
      s.vx = Math.cos(a) * sp;
      s.vz = Math.sin(a) * sp;
      s.vy = rand(4, 9);
      s.grav = 15;
      s.stretch = 0.05;
      if (jam) {
        s.c0.setRGB(rand(0.5, 0.75), 0.05, rand(0.2, 0.32));
        s.c1.copy(s.c0);
      } else {
        s.c0.setRGB(0.36, 0.26, 0.17);
        s.c1.setRGB(0.3, 0.22, 0.15);
      }
      s.a1 = 0.9;
      this.blob.emit(s);
    }
    // дым столбом (тёмный, «вареньевый») и пыльное кольцо
    for (let i = 0; i < Math.round(11 * k); i++) {
      s = at(x + rand(-0.5, 0.5) * R, y + rand(0.8, 2.2), z + rand(-0.5, 0.5) * R, rand(3.0, 4.6), rand(2.0, 2.8), rand(5.0, 7.0));
      s.vx = rand(-0.5, 0.5);
      s.vy = rand(1.6, 3.2);
      s.vz = rand(-0.5, 0.5);
      s.drag = 0.5;
      s.rot = Math.random() * 6;
      s.spin = rand(-0.4, 0.4);
      s.c0.setRGB(0.17, 0.1, 0.15);
      s.c1.setRGB(0.46, 0.42, 0.47);
      s.a0 = 0.95;
      s.fadeIn = 0.12;
      this.smoke.emit(s);
    }
    for (let i = 0; i < Math.round(12 * k); i++) {
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
      s = at(x + Math.cos(a) * R * 0.6, y + 0.35, z + Math.sin(a) * R * 0.6, rand(1.0, 1.5), 1.3, rand(3, 4));
      s.vx = Math.cos(a) * rand(3.5, 6);
      s.vz = Math.sin(a) * rand(3.5, 6);
      s.vy = 0.4;
      s.drag = 2.4;
      s.rot = Math.random() * 6;
      s.c0.setRGB(0.72, 0.64, 0.52);
      s.c1.setRGB(0.8, 0.75, 0.66);
      s.a0 = 0.55;
      this.smoke.emit(s);
    }
    // ударная волна, тлеющий кратер и сама клякса
    const ground = y + 0.03;
    s = at(x, ground + 0.02, z, 0.5, R * 0.6, R * 3.2);
    s.c0.setRGB(1.4, 0.6, 0.22);
    s.c1.setRGB(0.9, 0.3, 0.12);
    s.a0 = 0.75;
    this.ring.emit(s);
    s = at(x, ground + 0.01, z, 3, R * 1.7, R * 1.3);
    s.c0.setRGB(1.3, 0.38, 0.1);
    s.c1.setRGB(0.7, 0.12, 0.04);
    s.a0 = 0.75;
    s.rot = Math.random() * 6;
    this.glow.emit(s);
    const size = this.surfaceRadius(x, y, z, R * 0.85) * 2;
    s = at(x, ground, z, 12, size * 0.82, size);
    s.c0.setRGB(0.9, 0.9, 0.9);
    s.c1.setRGB(0.9, 0.9, 0.9);
    s.a0 = 1;
    s.a1 = 0;
    s.fadeIn = 0.012;
    s.rot = Math.random() * Math.PI * 2;
    this.crater.emit(s);
  }

  // ------------------------------------------------------------ ящик припасов

  /**
   * Ящик по хвосту снимка: звать каждый снимок, повторы ничего не ломают. 1 — начал спускаться (CRATE_FALL_S с
   * парашютом и жёлтым дымом); 2 — сел или лежит (если спуска не видели — сразу лежит); 0 — пропал (подобран или волна
   * кончилась: тает облачком). y — поверхность, куда садится (ход стены, терраса, крыша телеги), без y — земля.
   */
  crate(state: number, x: number, z: number, y = 0): void {
    const moved = Math.hypot(x - this.cX, z - this.cZ) > 0.5 || Math.abs(y - this.cY) > 0.5;
    if (state === CRATE_FALL) {
      // «летит» идёт в снимках, пока сервер не скажет «лежит»: сел по своим часам чуть раньше — не начинать заново
      if (this.cState === CRATE_NONE || this.cState === CRATE_GONE || moved) this.startCrate(x, y, z, true);
    } else if (state === CRATE_DOWN) {
      // только что подобрали — запоздавший снимок не возвращает ящик
      if (this.time - this.takenAt < 1 && !moved) return;
      if (this.cState === CRATE_FALL && !moved) this.landCrate(false);
      else if (this.cState !== CRATE_DOWN || moved) {
        this.startCrate(x, y, z, false);
        this.landCrate(true);
      }
    } else if (this.cState === CRATE_DOWN || this.cState === CRATE_FALL) {
      this.leaveCrate(false);
    }
  }

  /** Ящик подобран (событие supply): крышка слетает, золотые искры и вспышка. С crate(0) — в любом порядке */
  cratePicked(x: number, y: number, z: number): void {
    const here = this.cState !== CRATE_NONE && Math.hypot(x - this.cX, z - this.cZ) < 2.5;
    if (here && this.cState !== CRATE_GONE) this.leaveCrate(true);
    else if (here && this.lidVy === 0 && this.cT < 0.3) this.lidVy = 6.5;
    this.takenAt = this.time;
    const by = here ? this.cY : y;
    for (let i = 0; i < Math.round(28 * this.density); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = at(x, by + BOX * 0.6, z, rand(0.6, 1.1), rand(0.35, 0.6), 0.1);
      s.vx = Math.cos(a) * rand(1.5, 4);
      s.vz = Math.sin(a) * rand(1.5, 4);
      s.vy = rand(2.5, 6.5);
      s.grav = 5;
      s.drag = 1.2;
      s.rot = Math.random() * 3;
      s.spin = rand(-3, 3);
      s.c0.setRGB(2.2, 1.7, 0.6);
      s.c1.setRGB(1.4, 0.9, 0.3);
      this.glint.emit(s);
    }
    const s = at(x, by + BOX * 0.6, z, 0.35, 1.2, 3.2);
    s.c0.setRGB(1.8, 1.5, 0.7);
    s.c1.setRGB(1.2, 0.8, 0.3);
    s.a0 = 0.8;
    this.fire.emit(s);
  }

  private startCrate(x: number, y: number, z: number, fall: boolean): void {
    this.cState = fall ? CRATE_FALL : CRATE_DOWN;
    this.cX = x;
    this.cZ = z;
    this.cY = y;
    this.cT = 0;
    this.landT = -1;
    this.crateRoot.visible = true;
    this.crateRoot.position.set(x, this.cY + (fall ? DROP_H : 0) + HANG + BOX / 2, z);
    this.crateRoot.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.swing.rotation.set(0, 0, 0);
    this.box.scale.setScalar(1);
    this.box.position.set(0, -HANG, 0);
    this.lid.visible = true;
    this.lid.position.set(0, -HANG + BOX / 2 + 0.045, 0);
    this.lid.rotation.set(0, 0, 0);
    this.lid.scale.setScalar(1);
    this.flare.visible = true;
    this.flare.position.set(BOX * 0.32, -HANG + BOX / 2 + 0.17, BOX * 0.32);
    this.canopy.visible = true;
    this.canopy.position.set(0, 0, 0);
    this.canopy.rotation.set(0, 0, 0);
    this.canopy.scale.setScalar(1);
    this.lines.visible = true;
    (this.lines.material as THREE.LineBasicMaterial).opacity = 0.9;
  }

  /** Сел: пыль от посадки, купол оседает рядом. instant — уже лежал (зашли посреди волны): купол сразу лежит, без пыли */
  private landCrate(instant: boolean): void {
    this.cState = CRATE_DOWN;
    this.cT = 0;
    this.landT = instant ? 1.2 : 0;
    this.crateRoot.position.y = this.cY + HANG + BOX / 2;
    this.swing.rotation.set(0, 0, 0);
    this.canopySpot();
    if (instant) return;
    // пыль от посадки
    for (let i = 0; i < Math.round(10 * this.density); i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = at(this.cX + Math.cos(a) * 0.6, this.cY + 0.25, this.cZ + Math.sin(a) * 0.6, rand(0.8, 1.2), 0.8, 2.2);
      s.vx = Math.cos(a) * rand(2, 3.5);
      s.vz = Math.sin(a) * rand(2, 3.5);
      s.vy = 0.3;
      s.drag = 2.5;
      s.rot = Math.random() * 6;
      s.c0.setRGB(0.78, 0.7, 0.56);
      s.c1.setRGB(0.85, 0.8, 0.7);
      s.a0 = 0.5;
      this.smoke.emit(s);
    }
  }

  /** Ящик уходит: подобран — крышка слетает (искры — cratePicked); растаял — облачко */
  private leaveCrate(picked: boolean): void {
    this.cState = CRATE_GONE;
    this.cT = 0;
    this.lidVy = picked ? 6.5 : 0;
    this.poof = !picked;
  }

  /** Куда ляжет купол: сбоку от ящика, если там та же опора; иначе (край хода стены, крыша телеги) — накроет ящик */
  private canopySpot(): void {
    const yaw = this.crateRoot.rotation.y;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    for (let i = 0; i < 4; i++) {
      const lx = i === 0 ? 1.9 : i === 1 ? -1.9 : i === 2 ? 0.7 : -0.7;
      const lz = i === 0 ? 0.7 : i === 1 ? -0.7 : i === 2 ? -1.9 : 1.9;
      if (this.sameSurface(this.cX + lx * c + lz * sn, this.cZ - lx * sn + lz * c)) {
        this.canX = lx;
        this.canZ = lz;
        this.canDrape = false;
        return;
      }
    }
    this.canX = this.canZ = 0;
    this.canDrape = true;
  }

  /** Купол (≈2,5 м в поперечнике) целиком лёг бы на ту же опору: середина и четыре края */
  private sameSurface(x: number, z: number): boolean {
    const w = this.world;
    if (!w) return true;
    for (let i = 0; i < 5; i++) {
      const px = x + (i === 1 ? 1.4 : i === 2 ? -1.4 : 0);
      const pz = z + (i === 3 ? 1.4 : i === 4 ? -1.4 : 0);
      const g = w.groundBelow(px, this.cY + 0.5, pz);
      if (Math.abs((Number.isFinite(g) ? Math.max(0, g) : 0) - this.cY) > 0.3) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ туман и золото

  /**
   * Лёгкий морской туман: включить (плавно за ~3 с) или выключить. Только вид: слои, клочья, дымка горизонта, чуть
   * слабее солнце. Дальность тумана сцены (видимость) и глаза зомби — match.ts; цвет дымки берётся из scene.fog.
   */
  fog(on: boolean): void {
    this.wantFog = on;
  }

  /** «Золотая лихорадка»: тёплое золотое небо и свет, золотая пыль; монеты из сбитых — coins() */
  goldRush(on: boolean): void {
    this.wantGold = on;
  }

  /**
   * Монеты брызжут из сбитого (match.ts зовёт в золотую лихорадку на каждого сбитого; big — босс или чемпион). y — откуда
   * брызжут (ноги или середина тела — всё равно): падают монеты на опору под этой точкой (земля, ход стены, крыша).
   */
  coins(x: number, y: number, z: number, big = false): void {
    const n = Math.round((big ? 18 : 7) * Math.max(0.6, this.density));
    const below = this.world ? this.world.groundBelow(x, y + 0.2, z) : 0;
    const ground = Number.isFinite(below) ? Math.max(0, below) : 0;
    const by = Math.max(y, ground + 0.6);
    for (let i = 0; i < n; i++) {
      const j = this.coinNext;
      this.coinNext = (j + 1) % MAX_COINS;
      const o = j * C;
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1.2, big ? 4.5 : 3.2);
      const d = this.coinData;
      d[o + CX] = x + Math.cos(a) * 0.2;
      d[o + CY] = by + 0.2;
      d[o + CZ] = z + Math.sin(a) * 0.2;
      d[o + CVX] = Math.cos(a) * sp;
      d[o + CVY] = rand(4.5, big ? 9 : 7.5);
      d[o + CVZ] = Math.sin(a) * sp;
      d[o + CLIFE] = d[o + CMAX] = rand(1.2, 1.7);
      d[o + CANG] = Math.random() * 6;
      d[o + CSPIN] = rand(9, 16) * (Math.random() < 0.5 ? -1 : 1);
      d[o + CGROUND] = ground + 0.02;
      d[o + CYAW] = Math.random() * 6;
    }
    for (let i = 0; i < Math.round(10 * this.density); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = at(x, by + 0.3, z, rand(0.4, 0.8), rand(0.3, 0.5), 0.1);
      s.vx = Math.cos(a) * rand(1, 3);
      s.vz = Math.sin(a) * rand(1, 3);
      s.vy = rand(1.5, 4.5);
      s.drag = 2;
      s.grav = 2;
      s.rot = Math.random() * 3;
      s.spin = rand(-4, 4);
      s.c0.setRGB(2.2, 1.7, 0.6);
      s.c1.setRGB(1.6, 1.0, 0.3);
      this.glint.emit(s);
    }
    const s = at(x, by + 0.3, z, 0.22, 1.2, 2.4);
    s.c0.setRGB(1.6, 1.2, 0.4);
    s.c1.setRGB(1.2, 0.7, 0.2);
    s.a0 = 0.7;
    this.fire.emit(s);
  }

  // ------------------------------------------------------------ кадр

  setQuality(q: Quality, slow = false): void {
    const tier = q === 'auto' ? (slow ? 'low' : 'medium') : q;
    this.density = tier === 'low' ? 0.5 : tier === 'medium' ? 0.75 : 1;
    // на низком качестве — один слой низкого тумана вместо трёх
    this.sheets.geometry.setDrawRange(0, tier === 'low' ? 6 : 18);
  }

  update(dtRaw: number): void {
    const dt = Math.max(0, Math.min(0.1, dtRaw));
    this.time += dt;
    for (const p of this.pools) {
      p.begin();
      p.simulate(dt);
    }
    this.updateAtmosphere(dt);
    this.updateMeteors(dt);
    this.updateCrate(dt);
    this.updateCoins(dt);
    this.updateGoldDust();
    this.updateWisps();
    for (const p of this.pools) p.end();
  }

  /** Всё убрать и вернуть туман, свет и небо как было (выход из крепости, новая игра) */
  clear(): void {
    for (const p of this.pools) p.clear();
    for (const m of this.meteors) m.on = false;
    this.rocks.count = 0;
    this.rocks.visible = false;
    for (let i = CLIFE; i < this.coinData.length; i += C) this.coinData[i] = 0;
    this.coinMesh.count = 0;
    this.coinMesh.visible = false;
    this.cState = CRATE_NONE;
    this.crateRoot.visible = false;
    this.takenAt = -9;
    this.poof = false;
    this.wantFog = this.wantGold = false;
    this.kFog = this.kGold = 0;
    this.applyAtmosphere();
  }

  /** Убрать всё из сцены и освободить видеопамять (мир крепости разбирают); свет вернуть как было */
  dispose(): void {
    this.clear();
    const roots: THREE.Object3D[] = [...this.pools.map((p) => p.mesh), this.rocks, this.coinMesh, this.crateRoot, this.dome, this.sheets];
    for (const root of roots) {
      this.scene.remove(root);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.geometry) return;
        m.geometry.dispose();
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
          const u = (mat as THREE.ShaderMaterial).uniforms;
          if (u) for (const key in u) if (u[key].value instanceof THREE.Texture) (u[key].value as THREE.Texture).dispose();
          mat.dispose();
        }
      });
    }
  }

  /** Для проверок и превью: сколько чего сейчас на экране */
  stats(): { particles: number; meteors: number; coins: number; crate: number; fog: number; gold: number } {
    let particles = 0;
    for (const p of this.pools) particles += p.live;
    return { particles, meteors: this.meteors.filter((m) => m.on).length, coins: this.coinMesh.count, crate: this.cState, fog: this.kFog, gold: this.kGold };
  }

  // ------------------------------------------------------------ кадр: части

  private updateMeteors(dt: number): void {
    let n = 0;
    const k = this.density;
    for (const m of this.meteors) {
      if (!m.on) continue;
      m.t += dt;
      // долетел, а удара ещё нет — ждём событие на месте (немного), потом гаснем сами
      if (m.t > m.dur + 0.3) {
        m.on = false;
        continue;
      }
      const u = Math.min(1, m.t / m.dur);
      // чуть разгоняется: вверху виден дольше, к земле быстрее
      const w = u * (0.72 + 0.28 * u);
      const x = m.fx + (m.tx - m.fx) * w;
      const y = m.fy + (m.ty - m.fy) * w;
      const z = m.fz + (m.tz - m.fz) * w;
      let dx = m.tx - m.fx;
      let dy = m.ty - m.fy;
      let dz = m.tz - m.fz;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
      const speed = (len / m.dur) * (0.72 + 0.56 * u);
      // ком
      _e.set(m.spin + m.t * 2.3, m.spin * 0.6 + m.t * 3.1, 0);
      _q.setFromEuler(_e);
      const pulse = 1.5 * (1 + 0.07 * Math.sin(this.time * 31 + m.spin));
      this.rocks.setMatrixAt(n++, _m.compose(_p.set(x, y, z), _q, _s.set(pulse, pulse, pulse)));
      // ком в языках пламени: мягкий оранжевый ореол, внешнее и внутреннее пламя рвутся назад (плотные клубы — на светлом
      // небе читаются лучше свечения: сложение с небом даёт белое), горячая сердцевина и хвост-полоса
      const fl = Math.sin(this.time * 23 + m.spin);
      this.smoke.put(x - dx * 0.4, y - dy * 0.4, z - dz * 0.4, 10, 1.3, 0.45, 0.08, 0.4, 0, 0, 0, m.spin);
      this.smoke.put(x - dx * 1.5, y - dy * 1.5, z - dz * 1.5, 4.8 + 0.4 * fl, 1.5, 0.52, 0.1, 0.92, 0, 0, 0, this.time * 2 + m.spin);
      this.smoke.put(x - dx * 0.7, y - dy * 0.7, z - dz * 0.7, 3.6 + 0.3 * fl, 2.0, 1.2, 0.3, 0.95, 0, 0, 0, -this.time * 3 - m.spin);
      // и спереди (со стороны камеры) полупрозрачные языки: ком горит, а не просто летит
      const cam = this.camera.position;
      const cd = Math.hypot(cam.x - x, cam.y - y, cam.z - z) || 1;
      const ff = Math.min(1.5, cd * 0.5) / cd;
      this.smoke.put(x + (cam.x - x) * ff, y + (cam.y - y) * ff, z + (cam.z - z) * ff, 3.1 + 0.3 * fl, 1.7, 0.62, 0.1, 0.42, 0, 0, 0, this.time * 5 + m.spin);
      this.fire.put(x, y, z, 3.4, 1.2, 0.5, 0.12, 0.3, 0, 0, 0, 0);
      const tail = Math.min(14, 4 + speed * 0.22);
      this.fire.put(x - dx * tail * 0.5, y - dy * tail * 0.5, z - dz * tail * 0.5, 1.6, 1.4, 0.5, 0.15, 0.5, dx, dy, dz, tail / 1.6 - 1);
      // земля под ним к удару разгорается отсветом огня (метку атаки рисует marks.ts)
      const heat = Math.max(0, (u - 0.45) / 0.55);
      this.glow.put(m.tx, m.ty + 0.04, m.tz, m.r * (1.3 + 1.1 * heat), 1.6, 0.42, 0.1, 0.8 * heat * heat, 0, 0, 0, 0);
      // шлейф: пламя (плотные клубы) через каждые ~0,35 м пути, дым — через ~0,8 м, капли варенья — по времени
      const gap = Math.hypot(x - m.ex, y - m.ey, z - m.ez);
      const step = 0.35 / Math.max(0.5, k);
      const steps = Math.min(18, Math.floor(gap / step));
      for (let i = 1; i <= steps; i++) {
        const f = (i * step) / gap;
        const px = m.ex + (x - m.ex) * f;
        const py = m.ey + (y - m.ey) * f;
        const pz = m.ez + (z - m.ez) * f;
        let s = at(px - dx * 0.9 + rand(-0.3, 0.3), py - dy * 0.9 + rand(-0.3, 0.3), pz - dz * 0.9 + rand(-0.3, 0.3), rand(0.35, 0.6), rand(2.0, 2.6), rand(0.7, 1.0));
        s.vx = -dx * speed * 0.06 + rand(-0.8, 0.8);
        s.vy = -dy * speed * 0.06 + rand(0, 1.2);
        s.vz = -dz * speed * 0.06 + rand(-0.8, 0.8);
        s.drag = 1.5;
        s.rot = Math.random() * 6;
        s.spin = rand(-2, 2);
        s.c0.setRGB(1.8, 1.05, 0.25);
        s.c1.setRGB(0.7, 0.08, 0.22);
        s.a0 = 1;
        this.smoke.emit(s);
        if (Math.random() < 0.5) {
          s = at(px + rand(-0.3, 0.3), py + rand(-0.3, 0.3), pz + rand(-0.3, 0.3), rand(0.25, 0.45), rand(0.9, 1.3), 0.2);
          s.vx = -dx * speed * 0.1 + rand(-1, 1);
          s.vy = -dy * speed * 0.1 + rand(0, 1.5);
          s.vz = -dz * speed * 0.1 + rand(-1, 1);
          s.drag = 1.5;
          s.c0.setRGB(1.8, 0.8, 0.3);
          s.c1.setRGB(0.9, 0.15, 0.3);
          s.a0 = 0.8;
          this.fire.emit(s);
        }
        m.smoke += step;
        if (m.smoke > 0.8) {
          m.smoke = 0;
          s = at(px - dx, py - dy, pz - dz, rand(2.0, 3.0), rand(1.2, 1.6), rand(3.6, 4.8));
          s.vx = rand(-0.4, 0.4);
          s.vy = rand(0.3, 0.9);
          s.vz = rand(-0.4, 0.4);
          s.drag = 0.8;
          s.rot = Math.random() * 6;
          s.spin = rand(-0.6, 0.6);
          s.c0.setRGB(0.26, 0.14, 0.22);
          s.c1.setRGB(0.58, 0.52, 0.58);
          s.a0 = 0.78;
          s.fadeIn = 0.1;
          this.smoke.emit(s);
        }
      }
      if (steps > 0) {
        const f = (steps * step) / gap;
        m.ex += (x - m.ex) * f;
        m.ey += (y - m.ey) * f;
        m.ez += (z - m.ez) * f;
      }
      m.drip += dt;
      if (m.drip > 0.09 / k) {
        m.drip = 0;
        const s = at(x + rand(-0.4, 0.4), y - 0.3, z + rand(-0.4, 0.4), 0.9, rand(0.22, 0.32), 0.12);
        s.vx = dx * speed * 0.25;
        s.vy = dy * speed * 0.25 - 1;
        s.vz = dz * speed * 0.25;
        s.grav = 12;
        s.stretch = 0.05;
        s.c0.setRGB(0.6, 0.06, 0.24);
        s.c1.setRGB(0.5, 0.05, 0.2);
        s.a1 = 1;
        this.blob.emit(s);
      }
    }
    this.rocks.count = n;
    this.rocks.visible = n > 0;
    if (n) this.rocks.instanceMatrix.needsUpdate = true;
  }

  private updateCrate(dt: number): void {
    if (this.cState === CRATE_NONE) return;
    this.cT += dt;
    const t = this.time;
    const root = this.crateRoot;
    const x = this.cX;
    const z = this.cZ;
    if (this.cState === CRATE_FALL) {
      const u = Math.min(1, this.cT / CRATE_FALL_S);
      const h = DROP_H * (1 - u);
      root.position.y = this.cY + h + HANG + BOX / 2;
      root.rotation.y += dt * 0.3;
      const sway = Math.min(1, h / 5);
      this.swing.rotation.set(Math.sin(t * 2.3) * 0.13 * sway, 0, Math.sin(t * 1.6 + 1) * 0.1 * sway);
      this.canopy.scale.set(1 + Math.sin(t * 3.1) * 0.03, 1 - Math.sin(t * 3.1) * 0.05, 1 + Math.sin(t * 3.1) * 0.03);
      // жёлтый дым тянется за ящиком лентой (метку посадки и маяк рисует marks.ts)
      this.smokeAcc += dt;
      if (this.smokeAcc > 0.07 / this.density) {
        this.smokeAcc = 0;
        this.flare.getWorldPosition(_p);
        const s = at(_p.x, _p.y, _p.z, 2.8, 0.5, 2.6);
        s.vx = rand(0.3, 0.8);
        s.vy = rand(0.6, 1.2);
        s.vz = rand(0, 0.4);
        s.drag = 0.4;
        s.rot = Math.random() * 6;
        s.spin = rand(-0.5, 0.5);
        s.c0.setRGB(1.15, 0.9, 0.18);
        s.c1.setRGB(1.0, 0.92, 0.66);
        s.a0 = 0.8;
        this.smoke.emit(s);
      }
      if (u >= 1) this.landCrate(false);
      return;
    }
    if (this.cState === CRATE_DOWN) {
      // купол оседает рядом с ящиком
      if (this.landT >= 0 && this.landT < 1.3) {
        this.landT += dt;
        const f = Math.min(1, this.landT / 1.2);
        const e = f * f * (3 - 2 * f);
        if (this.canDrape) {
          // сбоку опоры нет — купол оседает на сам ящик
          this.canopy.position.set(0, (-HANG + BOX / 2 + 0.02) * e, 0);
          this.canopy.scale.set(1 - 0.5 * e, 1 - 0.72 * e, 1 - 0.5 * e);
        } else {
          this.canopy.position.set(this.canX * e, (-HANG - BOX / 2 + 0.02) * e, this.canZ * e);
          this.canopy.scale.set(1 + 0.12 * e, 1 - 0.9 * e, 1 + 0.12 * e);
          this.canopy.rotation.z = -0.25 * e * Math.sign(this.canX || 1);
        }
        (this.lines.material as THREE.LineBasicMaterial).opacity = 0.9 * (1 - e);
        this.lines.visible = f < 1;
      }
      // дым столбом от фальшфейера и искры вокруг ящика
      this.smokeAcc += dt;
      if (this.smokeAcc > 0.1 / this.density) {
        this.smokeAcc = 0;
        this.flare.getWorldPosition(_p);
        let s = at(_p.x, _p.y + 0.1, _p.z, 3.6, 0.45, 3.0);
        s.vx = rand(0.2, 0.6);
        s.vy = rand(1.6, 2.3);
        s.vz = rand(0, 0.3);
        s.drag = 0.25;
        s.rot = Math.random() * 6;
        s.spin = rand(-0.5, 0.5);
        s.c0.setRGB(1.15, 0.9, 0.18);
        s.c1.setRGB(1.0, 0.94, 0.72);
        s.a0 = 0.78;
        this.smoke.emit(s);
        s = at(_p.x, _p.y + 0.05, _p.z, rand(0.25, 0.45), 0.14, 0.05);
        s.vx = rand(-1, 1);
        s.vy = rand(2, 3.5);
        s.vz = rand(-1, 1);
        s.grav = 6;
        s.stretch = 0.08;
        s.c0.setRGB(2.4, 1.6, 0.5);
        s.c1.setRGB(1.6, 0.6, 0.2);
        this.fire.emit(s);
        if (Math.random() < 0.5) {
          const a = Math.random() * Math.PI * 2;
          s = at(x + Math.cos(a) * 0.9, this.cY + rand(0.2, 0.9), z + Math.sin(a) * 0.9, rand(0.9, 1.4), rand(0.3, 0.45), 0.05);
          s.vy = rand(0.6, 1.2);
          s.rot = Math.random() * 3;
          s.spin = rand(-2, 2);
          s.c0.setRGB(2.0, 1.6, 0.55);
          s.c1.setRGB(1.4, 1.0, 0.35);
          s.fadeIn = 0.25;
          this.glint.emit(s);
        }
      }
      return;
    }
    // ушёл (подобран или растаял): крышка слетает, ящик и купол сжимаются
    if (this.poof) {
      this.poof = false;
      if (this.lidVy === 0) {
        const s = at(this.cX, this.cY + 0.5, this.cZ, 1, 1.2, 2.6);
        s.rot = Math.random() * 6;
        s.c0.setRGB(0.85, 0.8, 0.7);
        s.c1.setRGB(0.9, 0.88, 0.8);
        s.a0 = 0.5;
        this.smoke.emit(s);
      }
    }
    const f = Math.min(1, this.cT / 0.45);
    this.box.scale.setScalar(Math.max(0.001, 1 - f));
    this.canopy.scale.multiplyScalar(Math.max(0, 1 - dt * 4));
    this.lines.visible = false;
    this.flare.visible = false;
    if (this.lidVy !== 0) {
      this.lidVy -= 14 * dt;
      this.lid.position.y += this.lidVy * dt;
      this.lid.rotation.x += dt * 7;
      this.lid.rotation.z += dt * 4;
      this.lid.scale.setScalar(Math.max(0.001, 1 - Math.max(0, this.cT - 0.5) * 2.5));
    } else {
      this.lid.scale.setScalar(Math.max(0.001, 1 - f));
    }
    if (this.cT > 0.95) {
      this.cState = CRATE_NONE;
      root.visible = false;
    }
  }

  private updateCoins(dt: number): void {
    const d = this.coinData;
    let n = 0;
    for (let i = 0; i < MAX_COINS; i++) {
      const o = i * C;
      let life = d[o + CLIFE];
      if (life <= 0) continue;
      life -= dt;
      d[o + CLIFE] = life;
      if (life <= 0) continue;
      d[o + CVY] -= 15 * dt;
      d[o + CX] += d[o + CVX] * dt;
      d[o + CY] += d[o + CVY] * dt;
      d[o + CZ] += d[o + CVZ] * dt;
      if (d[o + CY] < d[o + CGROUND] + COIN_R && d[o + CVY] < 0) {
        // отскок от земли, потом катятся и гаснут
        d[o + CY] = d[o + CGROUND] + COIN_R;
        d[o + CVY] = -d[o + CVY] * 0.38;
        d[o + CVX] *= 0.55;
        d[o + CVZ] *= 0.55;
        d[o + CSPIN] *= 0.6;
      }
      d[o + CANG] += d[o + CSPIN] * dt;
      const k = life / d[o + CMAX];
      const sc = k < 0.25 ? k / 0.25 : 1;
      _e.set(d[o + CANG], d[o + CYAW], 0, 'YXZ');
      _q.setFromEuler(_e);
      _e.order = 'XYZ';
      this.coinMesh.setMatrixAt(n++, _m.compose(_p.set(d[o + CX], d[o + CY], d[o + CZ]), _q, _s.set(sc, sc, sc)));
      // монеты поблёскивают
      if (Math.sin(this.time * 17 + i * 1.7) > 0.82) this.glint.put(d[o + CX], d[o + CY], d[o + CZ], 0.42 * sc, 2.2, 1.8, 0.8, 0.9, 0, 0, 0, i);
    }
    this.coinMesh.count = n;
    this.coinMesh.visible = n > 0;
    if (n) this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  /** Золотая пыль вокруг камеры: блёстки медленно плывут и мерцают */
  private updateGoldDust(): void {
    const g = this.kGold;
    if (g < 0.01) return;
    const cam = this.camera.position;
    const t = this.time;
    const n = Math.round(GOLD_DUST * Math.max(0.5, this.density));
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const ph = this.dust[o + 3];
      const lx = wrap(this.dust[o] + t * 0.35, 24);
      const lz = wrap(this.dust[o + 2] + t * 0.18, 24);
      const y = this.dust[o + 1] + Math.sin(t * 0.7 + ph) * 0.5;
      const edge = Math.min(1, (24 - Math.abs(lx)) / 4, (24 - Math.abs(lz)) / 4);
      const tw = Math.max(0, Math.sin(t * 2.4 + ph));
      const a = g * edge * (0.25 + 0.75 * tw * tw * tw);
      this.glint.put(cam.x + lx, y, cam.z + lz, 0.24 + 0.12 * tw, 2.0, 1.55, 0.55, a, 0, 0, 0, ph);
    }
  }

  /** Клочья тумана над морем: большие, медленно плывут вдоль берега, у камеры тают */
  private updateWisps(): void {
    const f = this.kFog;
    if (f < 0.01) return;
    const cam = this.camera.position;
    const t = this.time;
    for (let i = 0; i < WISPS; i++) {
      const o = i * 5;
      const x = wrap(this.wisps[o] + t * 0.7, 120);
      const y = this.wisps[o + 1];
      const z = this.wisps[o + 2];
      const size = this.wisps[o + 3];
      const d = Math.hypot(x - cam.x, z - cam.z);
      const near = Math.max(0, Math.min(1, (d - 10) / 22));
      const edge = Math.min(1, (120 - Math.abs(x)) / 20);
      this.smoke.put(x, y, z, size, 1.05, 1.07, 1.08, 0.26 * f * near * edge, 0, 0, 0, this.wisps[o + 4] + t * 0.02);
    }
  }

  private updateAtmosphere(dt: number): void {
    const fogTo = this.wantFog ? 1 : 0;
    const goldTo = this.wantGold ? 1 : 0;
    // всё выключено и уже вернули как было — ничего не трогаем
    if (this.kFog === 0 && this.kGold === 0 && fogTo === 0 && goldTo === 0 && !this.base) return;
    this.kFog = approach(this.kFog, fogTo, dt / (fogTo ? 3 : 3.5));
    this.kGold = approach(this.kGold, goldTo, dt / (goldTo ? 1.6 : 2.2));
    // каждый кадр, пока включено: цвет тумана сцены может поменять match.ts
    this.applyAtmosphere();
  }

  /** Солнце, небесный свет, купол дымки и низкий туман — между «как было» и туманом/золотом; scene.fog только читаем */
  private applyAtmosphere(): void {
    const f = ease(this.kFog);
    const g = ease(this.kGold);
    const fog = this.scene.fog as THREE.Fog | THREE.FogExp2 | null;
    if (f <= 0 && g <= 0) {
      // всё выключено — вернуть свет как было и больше не трогать
      if (this.base) {
        const b = this.base;
        if (this.sun) {
          this.sun.color.copy(b.sun);
          this.sun.intensity = b.sunI;
        }
        if (this.hemi) {
          this.hemi.color.copy(b.sky);
          this.hemi.groundColor.copy(b.ground);
          this.hemi.intensity = b.hemiI;
        }
        this.base = null;
      }
      this.dome.visible = false;
      this.sheets.visible = false;
      return;
    }
    if (!this.base) this.capture();
    const b = this.base!;
    const fogColor = fog ? _c3.copy(fog.color).convertLinearToSRGB() : FOG_COLOR;
    if (this.sun) {
      this.sun.color.copy(b.sun).lerp(GOLD_SUN, g * 0.85);
      this.sun.intensity = b.sunI * (1 - (1 - FOG_SUN) * f) * (1 + 0.06 * g);
    }
    if (this.hemi) {
      this.hemi.color.copy(b.sky).lerp(GOLD_SKY, g * 0.6).lerp(FOG_SKY, f * 0.35);
      this.hemi.groundColor.copy(b.ground).lerp(GOLD_GROUND, g * 0.45);
      this.hemi.intensity = b.hemiI * (1 + 0.14 * f);
    }
    // купол: у горизонта — почти сплошная дымка в туман и тёплое золото в лихорадку, к зениту — слабее
    const u = this.domeMat.uniforms;
    const wFog = f / (f + g);
    (u.uColor.value as THREE.Color).copy(GOLD_DOME).lerp(fogColor, wFog);
    u.uLow.value = Math.min(0.97, f * 0.95 + g * 0.4);
    u.uHigh.value = f * 0.38 + g * 0.16;
    u.uRadius.value = fog instanceof THREE.Fog ? Math.max(40, Math.min(460, fog.far * 1.25)) : 460;
    u.uSun.value = g * (1 - f);
    if (this.sun) (u.uSunDir.value as THREE.Vector3).copy(this.sun.position).normalize();
    this.dome.visible = true;
    // низкий туман
    this.sheetMat.uniforms.uK.value = f;
    this.sheetMat.uniforms.uTime.value = this.time;
    (this.sheetMat.uniforms.uColor.value as THREE.Color).copy(_c2.copy(fogColor).lerp(_c.setRGB(1, 1, 1), 0.35));
    this.sheets.visible = f > 0.005;
  }

  /** Запомнить свет сцены до события (солнце — направленный свет с тенью, небо — полусферный) */
  private capture(): void {
    if (!this.sun || !this.hemi) {
      this.scene.traverse((o) => {
        if (!this.sun && (o as THREE.DirectionalLight).isDirectionalLight) this.sun = o as THREE.DirectionalLight;
        if (!this.hemi && (o as THREE.HemisphereLight).isHemisphereLight) this.hemi = o as THREE.HemisphereLight;
      });
    }
    this.base = {
      sun: this.sun ? this.sun.color.clone() : new THREE.Color(),
      sunI: this.sun?.intensity ?? 0,
      sky: this.hemi ? this.hemi.color.clone() : new THREE.Color(),
      ground: this.hemi ? this.hemi.groundColor.clone() : new THREE.Color(),
      hemiI: this.hemi?.intensity ?? 0,
    };
  }

  // ------------------------------------------------------------ земля

  /** Кратер не свисает с края стены или башни: радиус не больше расстояния до края опоры (с небольшим запасом) */
  private surfaceRadius(x: number, y: number, z: number, want: number): number {
    const w = this.world;
    if (!w) return want;
    let best = -1;
    for (let i = 0; i < w.n; i++) {
      if (w.invisible[i] || Math.abs(w.maxY[i] - y) > 0.3) continue;
      if (x < w.minX[i] || x > w.maxX[i] || z < w.minZ[i] || z > w.maxZ[i]) continue;
      const d = Math.min(x - w.minX[i], w.maxX[i] - x, z - w.minZ[i], w.maxZ[i] - z);
      if (d > best) best = d;
    }
    return best < 0 ? want : Math.max(0.7, Math.min(want, best * 1.15 + 0.2));
  }
}

function approach(v: number, to: number, step: number): number {
  return v < to ? Math.min(to, v + step) : Math.max(to, v - step);
}

function ease(k: number): number {
  return k * k * (3 - 2 * k);
}

/** Свернуть в [−r, r) */
function wrap(v: number, r: number): number {
  const s = r * 2;
  return ((((v + r) % s) + s) % s) - r;
}
