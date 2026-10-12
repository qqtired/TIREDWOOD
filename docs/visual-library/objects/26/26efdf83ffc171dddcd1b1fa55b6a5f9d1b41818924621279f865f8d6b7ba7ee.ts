// Небо и море нового вида (look v2, см. look.ts): облака крупнее и пушистее — светлые к солнцу и сверху, голубоватые
// в тени, с серебристой каймой у солнца; на воде — искры там, где рябь ловит солнце. Это правки шейдеров неба и моря
// из sky.ts (до первой компиляции): тот же проход, пара шумов сверху.
import type * as THREE from 'three';
import { EVENING, type SkyPalette } from './sky.ts';

/**
 * Палитра нового вида: та же, что у набережной (горизонт и дымка «запечены» в дальний берег по ней), а облака
 * белее и плотнее, их тень — голубая, вода — бирюзовее.
 */
export const LOOK_EVENING: SkyPalette = {
  ...EVENING,
  zenith: 0x2a66d4,
  cloud: [0.6, 0.66, 0.9],
  cloudLit: [1.12, 1.06, 0.98],
  clouds: { cover: 0.45, alpha: 1.0, top: 1.0 },
  deep: 0x165c86,
  shallow: 0x2a9fb4,
};

/** Облака в SKY_FN (sky.ts) — старый кусок и новый */
const CLOUDS_OLD = /* glsl */ `      vec2 uv = d.xz / (h + 0.12) * 1.15 + vec2(time * 0.004, 0.0);
      float n = fbm(uv);
      // узкая полоса — у облаков чёткий край, а не дымка
      float c = smoothstep(uClouds.x, uClouds.x + 0.14, n);
      if (c > 0.0) {
        vec2 toSun = normalize(uSunDir.xz + vec2(1e-4, 0.0));
        float lit = clamp(0.55 + (n - fbm(uv + toSun * 0.12)) * 3.5, 0.0, 1.0);
        vec3 cloudCol = mix(uCloud, uCloudLit, clamp(lit * 0.75 + pow(s, 3.0) * 0.5, 0.0, 1.0));`;

const CLOUDS_NEW = /* glsl */ `      // крупные кучевые: слой ниже и шире, края взбиты сдвигом координат, ядро плотнее края
      vec2 uv = d.xz / (h + 0.2) * 0.78 + vec2(time * 0.003, 0.0);
      uv += (vec2(noise(uv * 1.9 + 3.1), noise(uv * 1.9 - 4.7)) - 0.5) * 0.42;
      float n = fbm(uv);
      float c = smoothstep(uClouds.x, uClouds.x + 0.075, n);
      if (c > 0.0) {
        vec2 toSun = normalize(uSunDir.xz + vec2(1e-4, 0.0));
        float lit = clamp(0.6 + (n - fbm(uv + toSun * 0.1)) * 4.2, 0.0, 1.0);
        float core = smoothstep(uClouds.x + 0.04, uClouds.x + 0.3, n);
        // верх облака (дальше от горизонта) светлее, к солнцу — серебристая кайма по краю
        float up = smoothstep(0.05, 0.45, h);
        vec3 cloudCol = mix(uCloud, uCloudLit, clamp(lit * 0.62 + up * 0.22 + (1.0 - core) * 0.18 + pow(s, 3.0) * 0.35, 0.0, 1.0));
        cloudCol += uSunGlow * pow(s, 6.0) * (1.0 - core) * 0.5;`;

/** Искры на воде: в клетках по 0,6 м — своя «грань» ряби; если она отражает солнце — вспыхивает точка */
const SEA_OLD = 'col += vec3(1.0, 0.8, 0.55) * (pow(sd, 260.0) * 6.0 + pow(sd, 24.0) * 0.25) * uSunVis;';
const SEA_NEW = /* glsl */ `${SEA_OLD}
        if (uSunVis > 0.0 && dist < 240.0) {
          vec2 q = vWorld.xz * 1.7 + vec2(uTime * 0.45, uTime * 0.17);
          vec2 cell = floor(q);
          float hs = hash(cell);
          vec2 jit = vec2(hash(cell + 1.7), hash(cell + 4.1)) - 0.5;
          vec3 sn = normalize(n + vec3(jit.x, 0.0, jit.y) * 0.5);
          float glint = pow(max(dot(reflect(-v, sn), uSunDir), 0.0), 140.0);
          float spot = smoothstep(0.3, 0.0, length(fract(q) - 0.5 - jit * 0.4));
          float tw = 0.55 + 0.45 * sin(uTime * 6.0 + hs * 40.0);
          col += vec3(1.0, 0.92, 0.75) * glint * spot * tw * step(0.6, hs) * 2.2 * uSunVis * (1.0 - smoothstep(25.0, 200.0, dist));
        }`;

/** Небо: пушистые облака. До первой компиляции. */
export function lookSky(m: THREE.ShaderMaterial): void {
  if (!m.fragmentShader.includes(CLOUDS_OLD)) return;
  m.fragmentShader = m.fragmentShader.replace(CLOUDS_OLD, CLOUDS_NEW);
  m.needsUpdate = true;
}

/** Море: те же облака в отражении и искры на ряби. До первой компиляции. */
export function lookSea(m: THREE.ShaderMaterial): void {
  lookSky(m);
  if (!m.fragmentShader.includes(SEA_OLD)) return;
  m.fragmentShader = m.fragmentShader.replace(SEA_OLD, SEA_NEW);
  m.needsUpdate = true;
}
