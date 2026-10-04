// Дождь на набережной. Капли — штрихи в коробке вокруг камеры (двигает шейдер, процессор их не трогает), брызги на
// земле и воде, лужи на плитке (отражают небо и фонари, по ним бегут круги), дорожки отблесков фонарей на мокром.
// Мокнут и сами материалы (wettable): темнеют и отражают небо, а под крышей сухо — где укрыто, знает CoverMap.
// Дальний город в дождь тонет в дымке (hazy). Насколько идёт дождь, ветер и насколько мокро — решает мир (0…1, плавно):
// в морось капли редкие и короткие, в ливень — густые, длинные и косые от ветра.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import type { MapBox } from '../../shared/maps/types.ts';
import { gfx } from '../render/gfx.ts';
import type { V3 } from '../render/kit.ts';
import { RIPPLE_FN, SKY_FN } from '../render/sky.ts';
import type { LobbyQuality } from './world.ts';

// ------------------------------------------------------------ укрытия

/** Клетка карты укрытий, м */
const CELL = 0.5;
/** Высота в байте: (y + 2) · 16 — от −2 до ~14 м, шаг 6 см */
const H_SCALE = 16;
const H_MIN = -2;

/**
 * Карта укрытий в шейдере (униформы uCover и uCoverBox): coverTop — высота верхней поверхности в точке
 * (как CoverMap.top), coverAt — она же и цвет того, что там стоит (линейный: для отражений в лужах).
 */
const COVER_FN = /* glsl */ `
  uniform sampler2D uCover;
  uniform vec4 uCoverBox;
  vec4 coverAt(vec2 xz) {
    vec2 uv = (xz - uCoverBox.xy) * uCoverBox.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec4(${WATER_Y.toFixed(3)}, 0.0, 0.0, 0.0);
    vec4 t = texture2D(uCover, uv);
    return vec4(t.r * ${(255 / H_SCALE).toFixed(4)} - ${(-H_MIN).toFixed(1)}, t.gba * t.gba);
  }
  float coverTop(vec2 xz) {
    return coverAt(xz).x;
  }
`;

/**
 * Карта укрытий: в каждой клетке 0,5 м — высота самой верхней поверхности, куда падает дождь (плитка, крыша, вода),
 * и её цвет. Капли ниже неё не рисуются, брызги — на ней, пол под крышей не мокнет, в лужах отражаются дома.
 * Тонкое (столбы, фонари) дождь не держит. В текстуре: R — высота, GBA — цвет.
 */
export class CoverMap {
  readonly texture: THREE.DataTexture;
  /** Для шейдеров: x0, z0, 1 / ширина, 1 / глубина (м) */
  readonly box: THREE.Vector4;
  private readonly data: Uint8Array;
  private readonly w: number;
  private readonly h: number;
  private readonly x0: number;
  private readonly z0: number;

  constructor(boxes: readonly MapBox[], x0: number, z0: number, x1: number, z1: number) {
    this.x0 = x0;
    this.z0 = z0;
    const w = (this.w = Math.round((x1 - x0) / CELL));
    const h = (this.h = Math.round((z1 - z0) / CELL));
    const data = (this.data = new Uint8Array(w * h * 4));
    for (let k = 0; k < w * h; k++) data[k * 4] = enc(WATER_Y);
    this.paint(boxes);
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    this.texture = t;
    this.box = new THREE.Vector4(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0));
  }

  /** Дописать крыши после постройки — навес, который включается флагом сервера (бильярд). */
  add(boxes: readonly MapBox[]): void {
    this.paint(boxes);
    this.texture.needsUpdate = true;
  }

  private paint(boxes: readonly MapBox[]): void {
    const { data, w, h, x0, z0 } = this;
    for (const b of boxes) {
      if (b.mat === 'invisible' || (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]) < 0.6) continue;
      // клетки, чей центр внутри бокса
      const i0 = Math.max(0, Math.floor((b.min[0] - x0) / CELL - 0.5) + 1);
      const i1 = Math.min(w - 1, Math.ceil((b.max[0] - x0) / CELL - 0.5) - 1);
      const j0 = Math.max(0, Math.floor((b.min[2] - z0) / CELL - 0.5) + 1);
      const j1 = Math.min(h - 1, Math.ceil((b.max[2] - z0) / CELL - 0.5) - 1);
      const top = enc(b.max[1]);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = (j * w + i) * 4;
          if (top <= data[k]) continue;
          data.set([top, (b.color >> 16) & 255, (b.color >> 8) & 255, b.color & 255], k);
        }
      }
    }
  }

  /** Высота верхней поверхности в точке */
  top(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / CELL);
    const j = Math.floor((z - this.z0) / CELL);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return WATER_Y;
    return this.data[(j * this.w + i) * 4] / H_SCALE + H_MIN;
  }
}

function enc(y: number): number {
  return Math.max(0, Math.min(255, Math.round((y - H_MIN) * H_SCALE)));
}

// ------------------------------------------------------------ мокрые и далёкие материалы

/** Для wettable: насколько мокро (0…1) и карта укрытий */
export interface WetUniforms {
  uWet: THREE.IUniform<number>;
  uCover: THREE.IUniform<THREE.Texture>;
  uCoverBox: THREE.IUniform<THREE.Vector4>;
}

/**
 * Материал мокнет под дождём: темнеет, а то, что смотрит вверх, становится гладким и отражает небо (envMap — небо
 * над головой); стены мокнут слабее, под крышей сухо. Когда сухо — вид прежний: отражение умножается на ноль.
 */
export function wettable(m: THREE.MeshStandardMaterial, u: WetUniforms, env: THREE.Texture): void {
  m.envMap = env;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWetPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWetPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uWet;\nvarying vec3 vWetPos;\n${COVER_FN}`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float wetK = 0.0;
        if (uWet > 0.0) {
          float up = smoothstep(0.4, 0.85, (vec4(normal, 0.0) * viewMatrix).y);
          float open = up > 0.0 ? step(coverTop(vWetPos.xz), vWetPos.y + 0.25) : 1.0;
          wetK = uWet * mix(0.3, open, up);
          diffuseColor.rgb *= 1.0 - 0.42 * wetK;
          roughnessFactor = mix(roughnessFactor, 0.26, wetK * up);
        }`,
      )
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nradiance *= wetK * 0.5;\niblIrradiance = vec3(0.0);');
  };
  m.customProgramCacheKey = () => 'wet';
}

/** Для hazy: насколько дымка (0…1) и её цвет (как туман на экране — в sRGB) */
export interface HazeUniforms {
  uHaze: THREE.IUniform<number>;
  uHazeColor: THREE.IUniform<THREE.Color>;
}

/** Далёкое с «запечённой» дымкой (город, дальний берег) в дождь тонет в тумане; огни (glow) — тускнеют. */
export function hazy(m: THREE.Material, u: HazeUniforms, glow = false): void {
  const prev = m.onBeforeCompile.bind(m);
  const key = m.customProgramCacheKey();
  const mix = glow
    ? 'gl_FragColor.rgb *= 1.0 - 0.75 * uHaze * smoothstep(40.0, 400.0, vHazeD);'
    : 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, uHaze * 0.9 * smoothstep(40.0, 400.0, vHazeD));';
  m.onBeforeCompile = (s, r) => {
    prev(s, r);
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vHazeD;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHazeD = length(mvPosition.xyz);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHaze;\nuniform vec3 uHazeColor;\nvarying float vHazeD;')
      .replace('#include <fog_fragment>', `#include <fog_fragment>\n${mix}`);
  };
  m.customProgramCacheKey = () => `${key}|haze${glow ? '-glow' : ''}`;
}

// ------------------------------------------------------------ сам дождь

/** Капли: коробки вокруг камеры — ближняя и дальняя (полуширина, высота, м); из пяти капель три — ближние */
const NEAR_BOX: readonly [number, number] = [9, 14];
const FAR_BOX: readonly [number, number] = [22, 26];
/** Капель «обычно»; запас на «Больше» (меню → Графика → «Эффекты и частицы»: меньше — вдвое, больше — в полтора раза) */
const BASE_DROPS = 6000;
const MAX_DROPS = 9000;
/**
 * Капля падает так (м/с): в морось медленнее, в ливень быстрее; ветер с моря сносит на восток и чуть на юг —
 * в штиль и в бурю (wind 0…1)
 */
const FALL_Y: readonly [number, number] = [6.2, 10];
const WIND_X: readonly [number, number] = [0.5, 3.6];
const WIND_Z: readonly [number, number] = [0.2, 1.2];
/** Длина штриха капли, м: в морось и в ливень */
const DROP_LEN: readonly [number, number] = [0.2, 0.85];
/** Прозрачность капель: в морось и в ливень */
const DROP_ALPHA: readonly [number, number] = [0.24, 0.46];
/** Брызги: сколько в секунду в полную силу, в каком радиусе от камеры, сколько живёт одна (с) */
const SPLASH_RATE = 260;
const SPLASH_R = 10;
const SPLASH_LIFE = 0.32;
const MAX_SPLASH = 200;

/** Лужи на плитке, где их никто не заслоняет: x, z, полуоси, поворот */
const PUDDLES: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-9.5, 3.5, 1.9, 1.2, 0.4],
  [4.5, -4, 1.7, 1.1, -0.3],
  [-19, 2, 1.6, 1.1, 1.1],
  [11, 7.5, 1.5, 1.0, 0.2],
  [-2.5, 13.5, 2.0, 1.25, -0.5],
  [-17.5, 10.5, 1.4, 1.0, 0.8],
  [5, -8.5, 1.5, 0.95, 0.1],
  [-8.5, -8, 1.3, 0.9, -0.7],
  [20, 18.5, 1.3, 0.9, 0.3],
  [-16, 40.2, 1.0, 0.75, 0.5],
  [24, -13, 1.2, 0.8, -0.2],
  [-26.5, 11, 1.1, 0.8, 1.3],
];
/** Тёплый свет ламп (как в мире) — в лужах и дорожках отблесков */
const LAMP = 0xffb46a;

export class RainFx {
  private readonly drops: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly splashes: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly splashAt: THREE.InstancedBufferAttribute;
  private readonly puddles: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly streaks: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly cover: CoverMap;
  private splashNext = 0;
  private splashAcc = 0;
  private splashK = 1;
  private lastSplash = -1;
  /** Своё время дождя, с (по кругу — чтобы не терять точность во float) */
  private t = 0;
  /** Сколько капли пролетели (м): ветер и скорость меняются плавно, а капли не прыгают */
  private readonly fallen = new THREE.Vector3();
  private readonly fall = new THREE.Vector3();

  /** sky — материал неба (лужи берут его униформы по ссылке), lamps — лампочки фонарей (отражаются в лужах) */
  constructor(scene: THREE.Scene, cover: CoverMap, sky: THREE.ShaderMaterial, lamps: readonly V3[]) {
    this.cover = cover;
    const coverU = { uCover: { value: cover.texture }, uCoverBox: { value: cover.box } };

    // --- капли: квадрат-штрих на каждую, место и падение считает шейдер
    const dg = new THREE.InstancedBufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
    dg.setIndex([0, 1, 2, 2, 1, 3]);
    const seed = new Float32Array(MAX_DROPS * 4);
    const box = new Float32Array(MAX_DROPS * 2);
    for (let i = 0; i < MAX_DROPS; i++) {
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
      box.set(i % 5 < 3 ? NEAR_BOX : FAR_BOX, i * 2);
    }
    dg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    dg.setAttribute('aBox', new THREE.InstancedBufferAttribute(box, 2));
    dg.instanceCount = MAX_DROPS;
    this.drops = new THREE.Mesh(dg, dropMaterial(coverU));
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 5;
    this.drops.visible = false;
    scene.add(this.drops);

    // --- брызги: корона капелек (стоит к камере) и колечко на земле (лежит)
    const sg = new THREE.InstancedBufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 2, 0, 1, 2, 0, -1, -1, 1, 1, -1, 1, -1, 1, 1, 1, 1, 1], 3));
    sg.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
    this.splashAt = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLASH * 4).fill(-1e4), 4);
    this.splashAt.setUsage(THREE.DynamicDrawUsage);
    const rnd = new Float32Array(MAX_SPLASH);
    for (let i = 0; i < MAX_SPLASH; i++) rnd[i] = Math.random();
    sg.setAttribute('aSplash', this.splashAt);
    sg.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 1));
    sg.instanceCount = MAX_SPLASH;
    this.splashes = new THREE.Mesh(sg, splashMaterial());
    this.splashes.frustumCulled = false;
    this.splashes.renderOrder = 5;
    this.splashes.visible = false;
    scene.add(this.splashes);

    // --- лужи: по четырёхугольнику на каждую, неровный край рисует шейдер
    const pos: number[] = [];
    const q: number[] = [];
    const sd: number[] = [];
    const idx: number[] = [];
    PUDDLES.forEach(([x, z, rx, rz, rot], n) => {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        pos.push(x + u * rx * c - v * rz * s, 0.012, z + u * rx * s + v * rz * c);
        q.push(u, v);
        sd.push(n * 0.137 + 0.05);
      }
      idx.push(n * 4, n * 4 + 2, n * 4 + 1, n * 4 + 1, n * 4 + 2, n * 4 + 3);
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pg.setAttribute('aQ', new THREE.Float32BufferAttribute(q, 2));
    pg.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
    pg.setIndex(idx);
    pg.computeBoundingSphere();
    this.puddles = new THREE.Mesh(pg, puddleMaterial(coverU, sky, lamps));
    this.puddles.renderOrder = 3;
    this.puddles.visible = false;
    scene.add(this.puddles);

    // --- дорожки отблесков фонарей на мокрой плитке: от фонаря к камере
    const lg = new THREE.InstancedBufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    lg.setIndex([0, 2, 1, 1, 2, 3]);
    lg.setAttribute('aLamp', new THREE.InstancedBufferAttribute(new Float32Array(lamps.flatMap(([x, y, z]) => [x, y, z, y > 4 ? 1 : 0.7])), 4));
    lg.instanceCount = lamps.length;
    this.streaks = new THREE.Mesh(lg, streakMaterial(coverU));
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 2;
    this.streaks.visible = false;
    scene.add(this.streaks);
  }

  /** Капли и брызги — по «Эффектам и частицам» (gfx.fx); уровень детализации здесь больше не нужен */
  setQuality(_q: LobbyQuality): void {
    this.drops.geometry.instanceCount = Math.min(MAX_DROPS, Math.round(BASE_DROPS * gfx.fx));
    this.splashK = gfx.fx;
  }

  /** Капли — вокруг этой точки (камера; для снимка фотоаппарата — его камера) */
  follow(at: THREE.Vector3): void {
    this.drops.material.uniforms.uCam.value.copy(at);
    this.streaks.material.uniforms.uCam.value.copy(at);
  }

  /** Раз в кадр: rain — сила дождя, wet — насколько мокро, wind — ветер (0…1) */
  update(dt: number, cam: THREE.Vector3, rain: number, wet: number, wind = 0.3): void {
    this.t = (this.t + dt) % 3600;
    const t = this.t;
    this.follow(cam);
    const du = this.drops.material.uniforms;
    const lerp = THREE.MathUtils.lerp;
    const wk = Math.min(1.2, Math.max(0, wind));
    this.fall.set(lerp(WIND_X[0], WIND_X[1], wk), -lerp(FALL_Y[0], FALL_Y[1], rain), lerp(WIND_Z[0], WIND_Z[1], wk));
    this.fallen.addScaledVector(this.fall, dt);
    if (this.fallen.lengthSq() > 4e6) this.fallen.set(0, 0, 0);
    du.uOffset.value.copy(this.fallen);
    du.uDir.value.copy(this.fall).normalize();
    du.uLen.value = lerp(DROP_LEN[0], DROP_LEN[1], rain);
    du.uAlpha.value = lerp(DROP_ALPHA[0], DROP_ALPHA[1], rain);
    du.uRain.value = rain;
    this.drops.visible = rain > 0.002;
    if (rain > 0.002) this.spawnSplashes(dt, cam, rain);
    this.splashes.material.uniforms.uTime.value = t;
    this.splashes.visible = this.lastSplash >= 0 && t - this.lastSplash < SPLASH_LIFE + 0.05;
    const pu = this.puddles.material.uniforms;
    pu.uTime.value = t;
    pu.uWet.value = wet;
    pu.uRain.value = rain;
    this.puddles.visible = wet > 0.08;
    this.streaks.material.uniforms.uK.value = wet;
    this.streaks.visible = wet > 0.02;
  }

  /** Брызги в случайных местах вокруг камеры (ближе — гуще): на верхней поверхности — плитке, воде, крыше. */
  private spawnSplashes(dt: number, cam: THREE.Vector3, rain: number): void {
    this.splashAcc = Math.min(this.splashAcc + dt * SPLASH_RATE * rain * this.splashK, 40);
    if (this.splashAcc < 1) return;
    const a = this.splashAt.array as Float32Array;
    for (; this.splashAcc >= 1; this.splashAcc--) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SPLASH_R;
      const x = cam.x + Math.cos(ang) * r;
      const z = cam.z + Math.sin(ang) * r;
      const y = this.cover.top(x, z);
      if (y > cam.y + 0.5) continue;
      a.set([x, y + 0.004, z, this.t], this.splashNext * 4);
      this.splashNext = (this.splashNext + 1) % MAX_SPLASH;
      this.lastSplash = this.t;
    }
    this.splashAt.needsUpdate = true;
  }
}

// ------------------------------------------------------------ шейдеры

function dropMaterial(coverU: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      ...coverU,
      uRain: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uOffset: { value: new THREE.Vector3() },
      uDir: { value: new THREE.Vector3(0, -1, 0) },
      uLen: { value: 0.5 },
      uColor: { value: new THREE.Color(0.68, 0.72, 0.78) },
      uAlpha: { value: 0.45 },
    },
    vertexShader: /* glsl */ `
      uniform float uRain;
      uniform vec3 uCam;
      uniform vec3 uOffset;
      uniform vec3 uDir;
      uniform float uLen;
      attribute vec4 aSeed;
      attribute vec2 aBox;
      varying vec2 vUv;
      varying float vA;
      ${COVER_FN}
      void main() {
        vUv = vec2(position.x + 0.5, position.y);
        vA = 0.0;
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        // слабый дождь — меньше капель
        if (aSeed.w > uRain) return;
        // коробка вокруг камеры: капля падает и, выйдя за край, возвращается с другой стороны
        vec3 size = vec3(2.0 * aBox.x, aBox.y, 2.0 * aBox.x);
        vec3 base = uCam - vec3(aBox.x, aBox.y * 0.4, aBox.x);
        vec3 p = aSeed.xyz * size + uOffset * (0.85 + 0.3 * fract(aSeed.w * 13.7));
        p = base + mod(p - base, size);
        // под крышей и под землёй дождя нет
        if (p.y < coverTop(p.xz)) return;
        // штрих вдоль падения, развёрнут к камере; вдали — шире (не тоньше пикселя), но прозрачнее
        vec3 axis = uDir;
        vec3 toCam = uCam - p;
        float dist = length(toCam);
        vec3 c = cross(axis, toCam);
        vec3 side = length(c) > 1e-4 ? normalize(c) : vec3(1.0, 0.0, 0.0);
        float w = max(0.008, dist * 0.0015);
        float len = uLen * (0.75 + 0.5 * fract(aSeed.w * 31.1));
        gl_Position = projectionMatrix * viewMatrix * vec4(p + side * (position.x * w) - axis * (position.y * len), 1.0);
        float edge = max(abs(toCam.x), abs(toCam.z)) / aBox.x;
        float vy = (p.y - base.y) / aBox.y;
        vA = min(1.0, 0.008 / w) * smoothstep(0.5, 1.5, dist) * (1.0 - smoothstep(0.75, 1.0, edge)) * (1.0 - smoothstep(0.86, 1.0, vy));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      varying vec2 vUv;
      varying float vA;
      void main() {
        float a = vA * uAlpha * (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, 0.12, vUv.y) * pow(1.0 - vUv.y, 0.8);
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }
    `,
  });
}

function splashMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0.74, 0.78, 0.84) },
      uAlpha: { value: 0.4 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec4 aSplash;
      attribute float aRnd;
      varying vec2 vUv;
      varying float vAge;
      varying float vRnd;
      varying float vFlat;
      void main() {
        vAge = (uTime - aSplash.w) / ${SPLASH_LIFE.toFixed(2)};
        vRnd = aRnd;
        vUv = position.xy;
        vFlat = position.z;
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        if (vAge < 0.0 || vAge > 1.0) return;
        float s = 0.07 + 0.04 * aRnd;
        vec3 p = aSplash.xyz;
        if (position.z > 0.5) {
          // колечко лежит на земле
          p += vec3(position.x, 0.0, position.y) * s * 1.3;
        } else {
          // корона стоит лицом к камере
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          p += right * (position.x * s) + vec3(0.0, position.y * s, 0.0);
        }
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      varying vec2 vUv;
      varying float vAge;
      varying float vRnd;
      varying float vFlat;
      void main() {
        float age = vAge;
        float fade = 1.0 - age;
        float a = 0.0;
        if (vFlat > 0.5) {
          a = exp(-pow((length(vUv) - age * 0.85) / 0.09, 2.0)) * fade * 0.7;
        } else {
          // капельки летят вверх и в стороны по параболе
          for (int k = 0; k < 4; k++) {
            float fk = float(k);
            float ang = vRnd * 6.283 + fk * 1.571;
            vec2 dp = vec2(cos(ang) * (0.7 + 0.4 * fract(vRnd * 7.0 + fk * 0.37)) * age,
                           0.05 + (2.0 + 0.9 * fract(vRnd * 3.0 + fk * 0.61)) * age - 3.0 * age * age);
            a = max(a, smoothstep(0.1, 0.035, length(vUv - dp)) * fade);
          }
        }
        a *= uAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }
    `,
  });
}

function puddleMaterial(coverU: Record<string, THREE.IUniform>, sky: THREE.ShaderMaterial, lamps: readonly V3[]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    defines: { LAMPS: lamps.length },
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      // небо — то же, что над головой (по ссылке: меняется вместе с погодой)
      ...sky.uniforms,
      ...coverU,
      uTime: { value: 0 },
      uWet: { value: 0 },
      uRain: { value: 0 },
      uLamps: { value: lamps.map(([x, y, z]) => new THREE.Vector3(x, y, z)) },
      uLampColor: { value: new THREE.Color(LAMP) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aQ;
      attribute float aSeed;
      varying vec3 vWorld;
      varying vec2 vQ;
      varying float vSeed;
      #include <fog_pars_vertex>
      void main() {
        vQ = aQ;
        vSeed = aSeed;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uWet;
      uniform float uRain;
      uniform vec3 uLamps[LAMPS];
      uniform vec3 uLampColor;
      varying vec3 vWorld;
      varying vec2 vQ;
      varying float vSeed;
      #include <fog_pars_fragment>
      ${SKY_FN}
      ${RIPPLE_FN}
      ${COVER_FN}
      // что видно в луже по лучу r: дома (идём по лучу над картой укрытий — упёрлись в стену) или небо
      vec3 mirror(vec3 o, vec3 r) {
        if (r.y < 0.8) {
          vec3 p = o;
          float st = 0.5;
          for (int i = 0; i < 28; i++) {
            p += r * st;
            st *= 1.09;
            if (p.y > 13.0) break;
            vec4 c = coverAt(p.xz);
            if (p.y < c.x) return c.yzw * (0.32 + 0.18 * clamp(p.y / 4.0, 0.0, 1.0));
          }
        }
        return skyColor(r, uTime);
      }
      void main() {
        // неровный край; чем мокрее, тем лужа больше
        float shape = 1.0 - length(vQ) + (fbm(vQ * 2.2 + vSeed * 7.3) - 0.5) * 0.9;
        float th = 0.6 - 0.5 * smoothstep(0.1, 1.0, uWet);
        float mask = smoothstep(th, th + 0.08, shape) * smoothstep(0.08, 0.3, uWet);
        if (mask < 0.004) discard;
        vec3 v = normalize(cameraPosition - vWorld);
        vec2 g = ripples(vWorld.xz * 2.5, uTime) * (0.045 * uRain);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        vec3 col = mix(vec3(0.045, 0.042, 0.04), mirror(vWorld, r), fres);
        // фонари в луже: яркие точки, дрожат от кругов
        float spec = 0.0;
        for (int i = 0; i < LAMPS; i++) spec += pow(max(dot(r, normalize(uLamps[i] - vWorld)), 0.0), 600.0);
        col += uLampColor * spec * (0.6 + 2.0 * fres);
        gl_FragColor = vec4(col, mask * mix(0.55, 1.0, fres));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

function streakMaterial(coverU: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    uniforms: { ...coverU, uCam: { value: new THREE.Vector3() }, uK: { value: 0 }, uColor: { value: new THREE.Color(LAMP).multiplyScalar(0.13) } },
    vertexShader: /* glsl */ `
      uniform vec3 uCam;
      attribute vec4 aLamp;
      varying vec2 vUv;
      varying vec2 vXZ;
      varying float vK;
      void main() {
        vUv = position.xy;
        // отражение лампы — в точке, где луч от камеры к лампе-под-землёй пересекает плитку; размыто к камере
        vec2 d = uCam.xz - aLamp.xz;
        float dist = max(length(d), 0.01);
        vec2 dir = d / dist;
        float m = dist * aLamp.y / (aLamp.y + max(uCam.y, 0.3));
        float along = mix(m * 0.5, max(m * 0.5, min(dist - 1.5, m * 1.15)), position.y);
        vec2 xz = aLamp.xz + dir * along + vec2(-dir.y, dir.x) * (position.x * (0.12 + 0.025 * aLamp.y));
        vK = aLamp.w * (1.0 - smoothstep(18.0, 40.0, dist));
        vXZ = xz;
        gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, 0.02, xz.y, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uK;
      varying vec2 vUv;
      varying vec2 vXZ;
      varying float vK;
      ${COVER_FN}
      void main() {
        // под крышей плитка сухая — отблеска нет
        if (coverTop(vXZ) > 0.25) discard;
        float t = vUv.y;
        // ярче всего — у зеркальной точки (t ≈ 0,77), к лампе и к камере гаснет
        float a = exp(-vUv.x * vUv.x * 3.5) * (t < 0.77 ? smoothstep(0.0, 0.77, t) : 1.0 - smoothstep(0.77, 1.0, t)) * uK * vK;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
