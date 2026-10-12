// Небо и море — общие шейдеры для всех миров; у каждого мира своя палитра (закат «Причала», ранний вечер набережной,
// дождь на набережной). Между палитрами можно плавно переходить: blendSky и blendFog.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';

type Rgb = [number, number, number];

export interface SkyPalette {
  /** Направление НА солнце */
  sunDir: THREE.Vector3;
  horizon: number;
  mid: number;
  zenith: number;
  sunGlow: number;
  /** Облака: теневая сторона и сторона к солнцу (линейные RGB) */
  cloud: Rgb;
  cloudLit: Rgb;
  /**
   * Облачность: cover — порог шума (меньше — больше неба в облаках), alpha — насколько облака плотные,
   * top — высота над горизонтом (0 — горизонт, 1 — зенит), к которой облака тают.
   */
  clouds: { cover: number; alpha: number; top: number };
  /** Звёзды: 0 — не видно, 1 — во всю силу */
  stars: number;
  /** Вода: глубина и мелководье */
  deep: number;
  shallow: number;
  /** Экспозиция тонмаппинга */
  exposure: number;
  fogNear: number;
  fogFar: number;
  /** Солнце видно: 1 — диск и блик на воде во всю силу, 0 — за тучами */
  sun: number;
}

/** «Причал»: закат над морем с запада (−X), чуть сбоку. */
export const SUNSET: SkyPalette = {
  sunDir: new THREE.Vector3(-1, 0.33, -0.14).normalize(),
  horizon: 0xf3c3a0,
  mid: 0xa9b8d4,
  zenith: 0x4f73a8,
  sunGlow: 0xff9a5a,
  cloud: [0.95, 0.62, 0.55],
  cloudLit: [1.0, 0.86, 0.72],
  clouds: { cover: 0.5, alpha: 0.72, top: 0.75 },
  stars: 0,
  deep: 0x1d4a57,
  shallow: 0x2f6f73,
  exposure: 1.0,
  fogNear: 70,
  fogFar: 460,
  sun: 1,
};

/**
 * Набережная: ранний вечер — солнце ещё над морем на западе (~12°), небо голубое, у горизонта золотое,
 * много облаков, подсвеченных солнцем. Светлее прежнего позднего заката, но гирлянды и окна уже горят.
 */
export const EVENING: SkyPalette = {
  sunDir: new THREE.Vector3(-1, 0.22, 0.32).normalize(),
  horizon: 0xffcf9a,
  mid: 0x8fb8e8,
  zenith: 0x3a6fc0,
  sunGlow: 0xffa860,
  cloud: [0.62, 0.66, 0.82],
  cloudLit: [1.05, 0.96, 0.84],
  clouds: { cover: 0.46, alpha: 0.95, top: 0.95 },
  stars: 0,
  deep: 0x17506a,
  shallow: 0x2a8796,
  exposure: 1.0,
  fogNear: 70,
  fogFar: 460,
  sun: 1,
};

/**
 * Набережная в дождь: небо затянуто светло-серыми тучами (на западе, где солнце, чуть светлее), солнца не видно,
 * туман ближе, море серо-зелёное. Серо, но не мрачно — летний дождь, а не буря.
 */
export const RAIN: SkyPalette = {
  sunDir: EVENING.sunDir.clone(),
  horizon: 0xb6babb,
  mid: 0x9ca4ac,
  zenith: 0x808a95,
  sunGlow: 0x8a7a6c,
  cloud: [0.3, 0.32, 0.36],
  cloudLit: [0.54, 0.55, 0.58],
  clouds: { cover: 0.24, alpha: 1.0, top: 1.3 },
  stars: 0,
  deep: 0x26424c,
  shallow: 0x3f666c,
  exposure: 0.92,
  fogNear: 22,
  fogFar: 230,
  sun: 0,
};

/** Цвет тумана и фона: как ACES в шейдерах three.js — чтобы туман совпал с тонированным небом у горизонта. */
export function fogColor(p: SkyPalette): THREE.Color {
  return acesFilmic(new THREE.Color(p.horizon), p.exposure);
}

/** Туман и фон между палитрами a и b (k: 0 — a, 1 — b). */
export function blendFog(a: SkyPalette, b: SkyPalette, k: number): THREE.Color {
  return acesFilmic(new THREE.Color(a.horizon).lerp(_col.set(b.horizon), k), a.exposure + (b.exposure - a.exposure) * k);
}

const _col = new THREE.Color();
const _vec = new THREE.Vector3();

/** Небо или море (makeSky, makeSea) — между палитрами a и b (k: 0 — a, 1 — b): плавная смена погоды. */
export function blendSky(mat: THREE.ShaderMaterial, a: SkyPalette, b: SkyPalette, k: number): void {
  const u = mat.uniforms;
  const col = (name: string, x: number, y: number) => (u[name].value as THREE.Color).set(x).lerp(_col.set(y), k);
  col('uHorizon', a.horizon, b.horizon);
  col('uMid', a.mid, b.mid);
  col('uZenith', a.zenith, b.zenith);
  col('uSunGlow', a.sunGlow, b.sunGlow);
  (u.uCloud.value as THREE.Vector3).fromArray(a.cloud).lerp(_vec.fromArray(b.cloud), k);
  (u.uCloudLit.value as THREE.Vector3).fromArray(a.cloudLit).lerp(_vec.fromArray(b.cloudLit), k);
  (u.uClouds.value as THREE.Vector3).set(a.clouds.cover, a.clouds.alpha, a.clouds.top).lerp(_vec.set(b.clouds.cover, b.clouds.alpha, b.clouds.top), k);
  u.uSunVis.value = a.sun + (b.sun - a.sun) * k;
  if (u.uDeep) col('uDeep', a.deep, b.deep);
  if (u.uShallow) col('uShallow', a.shallow, b.shallow);
}

function acesFilmic(c: THREE.Color, exposure: number): THREE.Color {
  const k = exposure / 0.6;
  const r = c.r * k;
  const g = c.g * k;
  const b = c.b * k;
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const f = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const fr = f(ir);
  const fg = f(ig);
  const fb = f(ib);
  const s = (v: number) => Math.min(1, Math.max(0, v));
  return new THREE.Color(
    s(1.60475 * fr - 0.53108 * fg - 0.07367 * fb),
    s(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb),
    s(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb),
  );
}

/** Купол неба (следует за камерой). Время — `material.uniforms.uTime`. */
export function makeSky(p: SkyPalette): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), makeSkyMaterial(p));
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

/** Море до горизонта на уровне воды. Время — `material.uniforms.uTime`, дождь (круги от капель) — `uRain` (0…1). */
export function makeSea(p: SkyPalette): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1), makeSeaMaterial(p));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WATER_Y;
  return sea;
}

// ------------------------------------------------------------ шейдеры

/** Цвет неба по направлению: skyColor(d, time). Нужны униформы skyUniforms (их можно взять у неба по ссылке). */
export const SKY_FN = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uSunGlow;
  uniform vec3 uCloud;
  uniform vec3 uCloudLit;
  uniform vec3 uClouds;
  uniform float uSunVis;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  vec3 skyColor(vec3 d, float time) {
    float h = d.y;
    float s = max(dot(d, uSunDir), 0.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
    col = mix(col, uZenith, smoothstep(0.18, 0.75, h));
    float lowSun = 1.0 - smoothstep(0.0, 0.45, h);
    col += uSunGlow * pow(s, 5.0) * 0.55 * lowSun;
    col += vec3(1.0, 0.75, 0.5) * pow(s, 48.0) * 0.9 * uSunVis;
    // облака: плоский слой над морем. Объём — сравнением плотности со сдвигом к солнцу:
    // где облако к солнцу редеет, там его освещённый край, где густеет — теневая сторона
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.12) * 1.15 + vec2(time * 0.004, 0.0);
      float n = fbm(uv);
      // узкая полоса — у облаков чёткий край, а не дымка
      float c = smoothstep(uClouds.x, uClouds.x + 0.14, n);
      if (c > 0.0) {
        vec2 toSun = normalize(uSunDir.xz + vec2(1e-4, 0.0));
        float lit = clamp(0.55 + (n - fbm(uv + toSun * 0.12)) * 3.5, 0.0, 1.0);
        vec3 cloudCol = mix(uCloud, uCloudLit, clamp(lit * 0.75 + pow(s, 3.0) * 0.5, 0.0, 1.0));
        col = mix(col, cloudCol, c * uClouds.y * smoothstep(0.02, 0.12, h) * (1.0 - smoothstep(uClouds.z - 0.35, uClouds.z, h)));
      }
    }
    return col;
  }
`;

/**
 * Круги от капель на воде (после SKY_FN — там hash): в каждой клетке сетки своя капля со своим временем, кольцо
 * расходится и гаснет; два слоя со сдвигом. Возвращает наклон поверхности (как градиент волн).
 */
export const RIPPLE_FN = /* glsl */ `
  vec2 ripple(vec2 p, float t) {
    vec2 id = floor(p);
    vec2 d = fract(p) - 0.5 - (vec2(hash(id + 3.7), hash(id + 9.1)) - 0.5) * 0.36;
    float ph = fract(t + hash(id));
    float len = length(d) + 1e-4;
    float x = (len - ph * 0.42) * 26.0;
    float fade = (1.0 - ph) * (1.0 - ph);
    return d / len * (3.0 * cos(3.0 * x) - 2.0 * x * sin(3.0 * x)) * exp(-x * x) * fade;
  }
  vec2 ripples(vec2 p, float t) {
    return ripple(p, t * 1.3) + ripple(mat2(0.8, -0.6, 0.6, 0.8) * p * 1.37 + 5.3, t * 1.1 + 0.5);
  }
`;

function skyUniforms(p: SkyPalette): Record<string, THREE.IUniform> {
  return {
    uTime: { value: 0 },
    uSunDir: { value: p.sunDir.clone() },
    uHorizon: { value: new THREE.Color(p.horizon) },
    uMid: { value: new THREE.Color(p.mid) },
    uZenith: { value: new THREE.Color(p.zenith) },
    uSunGlow: { value: new THREE.Color(p.sunGlow) },
    uCloud: { value: new THREE.Vector3(...p.cloud) },
    uCloudLit: { value: new THREE.Vector3(...p.cloudLit) },
    uClouds: { value: new THREE.Vector3(p.clouds.cover, p.clouds.alpha, p.clouds.top) },
    uSunVis: { value: p.sun },
  };
}

function makeSkyMaterial(p: SkyPalette): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: { ...skyUniforms(p), uStars: { value: p.stars } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position + cameraPosition, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStars;
      varying vec3 vDir;
      ${SKY_FN}
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(d, uTime);
        float disk = smoothstep(0.99955, 0.99975, dot(d, uSunDir));
        col += vec3(1.0, 0.86, 0.62) * disk * 3.0 * uSunVis;
        if (uStars > 0.0) {
          // звёзды: редкие ячейки сетки направлений, мерцают, гаснут к горизонту и у солнца
          vec3 g = d * 220.0;
          float n = hash3(floor(g));
          float star = step(0.9982, n) * smoothstep(0.5, 0.12, length(fract(g) - 0.5));
          float tw = 0.6 + 0.4 * sin(uTime * (1.3 + fract(n * 91.0) * 2.5) + n * 400.0);
          float away = 1.0 - pow(max(dot(d, uSunDir), 0.0), 3.0);
          col += vec3(1.0, 0.94, 0.86) * star * tw * uStars * smoothstep(0.1, 0.45, d.y) * away * 1.4;
        }
        if (d.y < 0.0) col = uHorizon;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function makeSeaMaterial(p: SkyPalette): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      skyUniforms(p),
      {
        uDeep: { value: new THREE.Color(p.deep) },
        uShallow: { value: new THREE.Color(p.shallow) },
        uRain: { value: 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uRain;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${SKY_FN}
      ${RIPPLE_FN}
      vec2 waveGrad(vec2 p, float t) {
        vec2 g = vec2(0.0);
        vec4 w[5];
        w[0] = vec4(0.8, 0.6, 0.35, 1.1);
        w[1] = vec4(-0.4, 0.9, 0.55, 1.6);
        w[2] = vec4(0.2, -1.0, 0.9, 2.3);
        w[3] = vec4(-0.9, -0.3, 1.7, 3.1);
        w[4] = vec4(0.6, -0.7, 2.9, 4.2);
        for (int i = 0; i < 5; i++) {
          vec2 d = normalize(w[i].xy);
          float k = w[i].z;
          float a = 0.06 / k;
          g += d * k * a * cos(dot(d, p) * k + t * w[i].w);
        }
        return g;
      }
      void main() {
        vec3 v = normalize(cameraPosition - vWorld);
        float dist = length(cameraPosition.xz - vWorld.xz);
        vec2 g = waveGrad(vWorld.xz, uTime) * (1.0 - smoothstep(60.0, 400.0, dist));
        if (uRain > 0.0) g += ripples(vWorld.xz * 1.5, uTime) * (0.12 * uRain * (1.0 - smoothstep(8.0, 45.0, dist)));
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        vec3 refl = skyColor(r, uTime);
        vec3 water = mix(uDeep, uShallow, 0.35 + 0.35 * n.x);
        vec3 col = mix(water, refl, fres);
        float sd = max(dot(r, uSunDir), 0.0);
        col += vec3(1.0, 0.8, 0.55) * (pow(sd, 260.0) * 6.0 + pow(sd, 24.0) * 0.25) * uSunVis;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}
