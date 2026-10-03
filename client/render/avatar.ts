// Желейка: мягкое тело с упругой «отдачей», наряд (узор, шапка, аксессуар, глаза), руки-варежки в эмоциях
// и у автомата, маркер (или подобранная AWP) в пейнтболе, командная экипировка (жилет, подсветка контура, значок над своими,
// см. teamgear.ts), табличка с именем и облачко чата; за столом дурака —
// помидор на лице и реакции над головой; в карте — сидит, варежки на руле; вдвоём — «дай пять» и обнимашки.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOAT_SIT_LIFT } from '../../shared/boat.ts';
import { TEAM_COLORS } from '../../shared/constants.ts';
import { REACTIONS } from '../../shared/durak.ts';
import {
  ACT_DANCE, ACT_DURAK, ACT_FIVE, ACT_HUG, ACT_LAUGH, ACT_NONE, ACT_RESPECT, ACT_SIT, ACT_SLOT, ACT_TIRED, ACT_WAVE, ACT_WHEEL, BUBBLE_CHARS, BUBBLE_MS, isAboard, isFerry, isPair,
} from '../../shared/lobby.ts';
import { clamp, lerp, lerpAngle } from '../../shared/math.ts';
import { DEFAULT_OUTFIT, PALETTE, PATTERN_INDEX, sameOutfit, slotKey, type Outfit } from '../../shared/outfit.ts';
import { SHELL_ACCS } from '../../shared/fishstyle.ts';
import { E_ADS, E_ALIVE, E_DASH, E_GROUNDED, E_PROTECTED, E_RELOAD } from '../../shared/protocol.ts';
import { AWP_MUZZLE, makeAwp } from './awp.ts';
import { headwearBounds, headwearLabelHeight, makeHatMaterial } from './hatpose.ts';
import { drawLevelTag } from './leveltag.ts';
import { LOOK2 } from './look.ts';
import { JellyFace } from './lookface.ts';
import { BODY_H, bodyProfile, bodyR, type Wear } from './outfit3d.ts';
import { PetRider, wearFor } from './outfitfish.ts';
import { JELLY_RIM_GLSL, JELLY_SWAY_GLSL, makeGearMaterial, pinTexture, vestGeometry, vestRadius, vestTexture } from './teamgear.ts';
import { emojiTexture, emoteTexture, metalEnvTexture, softDot, splatAtlas, tomatoSplatTexture } from './textures.ts';
import { isVoiceSpeaking, makeVoiceIndicator } from './voice-presence.ts';

const MUZZLE_LOCAL = new THREE.Vector3(0, 0.035, -0.62);
const WHITE = new THREE.Color(0xffffff);
const LEVEL_REDUCED_MOTION = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const GOLD = 0xd4a93a;
/** Сколько окружения отражает лак обычного желе (у золота — всё) */
const JELLY_GLOSS = 0.5;
const EYES_Y = 1.17;
const EYES_Z = -0.4;
/** Сидя тело выше (на сиденье) и чуть сжато */
const SIT_LIFT = 0.3;
const LEVER_S = 0.4;
/** Значок над своими в пейнтболе: высота (доля высоты экрана, не меньше MARK_PX пикселей — на телефоне) и зазор до ника */
const MARK_S = 0.03;
const MARK_PX = 20;
const MARK_GAP = 0.004;
const SPEECH_W = 0.265;
const SPEECH_H = 0.1035;
/** Projection scale at the ordinary 90° horizontal view on a 16:9 display. */
const SPEECH_REFERENCE_PROJECTION = 16 / 9;
/** Помидор на лице: сколько держится и за сколько до конца начинает таять, мс */
const TOMATO_MS = 8000;
const TOMATO_FADE_MS = 2000;
/** Реакция над головой: сколько висит, высота, на сколько всплывает, размер */
const REACT_S = 2.5;
const REACT_Y = 2.2;
const REACT_RISE = 0.35;
const REACT_SIZE = 0.44;
/**
 * Жест вдвоём: до какого расстояния между центрами сходятся (ладони встречаются посередине; обнимашки — вплотную,
 * желе чуть сминается), шаг навстречу — не больше PAIR_STEP. Шагают только на экране: на сервере стоят где стояли.
 */
const PAIR_GAP_FIVE = 1.2;
const PAIR_GAP_HUG = 0.94;
const PAIR_STEP = 0.6;
/** «Пять»: замах, удар (в конце удара ладони встречаются), держит, опускает — секунды от начала жеста */
export const FIVE_SWING = 0.22;
export const FIVE_HIT = 0.34;
const FIVE_HOLD = 0.9;
const FIVE_DOWN = 1.4;
/** Обнимашки: руки сходятся за спиной партнёра к HUG_HOLD, отпускают с HUG_LET (жест — 2,6 с) */
export const HUG_HOLD = 0.45;
const HUG_LET = 2.2;
const HUG_END = 2.6;

function smooth(t: number): number {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

/** В карте: руль перед животом (в осях желейки до сжатия), радиус обода, наклон верха от водителя, рад
 *  (колонка уходит от ступицы вниз и вперёд) */
export const DRIVE_WHEEL = { y: 0.6, z: -0.7, r: 0.2, tilt: 0.6 } as const;
/** В карте тело сжато: по высоте и вширь */
export const DRIVE_SQUASH = { y: 0.88, xz: 1.04 } as const;
/** Руль −1…1 поворачивает обод на столько, рад */
export const DRIVE_TURN = 0.9;

/** Где под желейкой опора (для тени) */
export interface GroundQuery {
  groundBelow(x: number, y: number, z: number): number;
}

/**
 * Срез века: оставить часть, где dot(p, n) + k·x² ≥ d (в системе глаза, +x — к носу); k — изгиб края.
 * null — глаз открыт.
 */
const LID_CUTS: Record<string, [number, number, number, number, number] | null> = {
  open: null,
  sleepy: [0, 1, 0, -0.035, 0],
  angry: [0.447, 0.894, 0, 0.027, 0],
  // «довольные»: снизу веко, край — дуга вверх (^^), из-под неё чуть видны зрачки
  happy: [0, -1, 0, 0, -6],
};
const LID_OF: Record<string, string> = { sleepy: 'sleepy', angry: 'angry', happy: 'happy' };

// ------------------------------------------------------------ общие ресурсы

let shared: ReturnType<typeof makeShared> | null = null;

function makeShared() {
  const body = new THREE.LatheGeometry(bodyProfile(), 36);
  body.computeVertexNormals();

  // глаза: белки и зрачки (оба глаза — одна геометрия); веко — копия белка чуть больше, её срезает плоскость
  const sclera = new THREE.SphereGeometry(0.105, 16, 12);
  sclera.scale(1, 1.15, 0.55);
  const pupil = new THREE.SphereGeometry(0.052, 12, 10);
  pupil.scale(1, 1.2, 0.5);
  const eyes = mergeGeometries([sclera.clone().translate(-0.13, 0, 0), sclera.clone().translate(0.13, 0, 0)], false)!;
  const pupils = mergeGeometries([pupil.clone().translate(-0.125, 0.005, -0.045), pupil.clone().translate(0.125, 0.005, -0.045)], false)!;
  // веко глубже белка и зрачка — закрывает их целиком, без мерцания на краю
  const lid = new THREE.SphereGeometry(0.105 * 1.08, 18, 12).scale(1, 1.15, 0.7);

  // маркер: корпус, ствол, баллон, рукоять (вершинные цвета), боковой бункер — отдельно (прозрачный)
  const colored = (g: THREE.BufferGeometry, hex: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(hex);
    const n = ng.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return ng;
  };
  const gunParts = [
    colored(new THREE.BoxGeometry(0.075, 0.11, 0.3).translate(0, 0, -0.2), 0x2c2f33),
    colored(new THREE.CylinderGeometry(0.024, 0.024, 0.3, 10).rotateX(Math.PI / 2).translate(0, 0.035, -0.47), 0x3a3f45),
    colored(new THREE.CylinderGeometry(0.032, 0.03, 0.05, 10).rotateX(Math.PI / 2).translate(0, 0.035, -0.6), 0x1d1f22),
    colored(new THREE.CylinderGeometry(0.042, 0.042, 0.22, 12).rotateX(Math.PI / 2).translate(0, -0.02, 0.06), 0x9aa3ab),
    colored(new THREE.BoxGeometry(0.05, 0.12, 0.06).rotateX(-0.25).translate(0, -0.1, -0.12), 0x1f2124),
    colored(new THREE.BoxGeometry(0.02, 0.03, 0.05).translate(0, 0.07, -0.08), 0xd8412f),
  ];
  const gun = mergeGeometries(gunParts, false)!;
  const hopper = new THREE.CapsuleGeometry(0.06, 0.1, 4, 10).rotateZ(0.5).translate(-0.085, 0.07, -0.22);
  const hands = mergeGeometries([
    new THREE.SphereGeometry(0.085, 14, 10).translate(0.02, -0.08, -0.12),
    new THREE.SphereGeometry(0.075, 14, 10).translate(-0.01, -0.02, -0.36),
  ], false)!;
  const mitten = new THREE.SphereGeometry(0.1, 14, 10).scale(1, 0.92, 0.88);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, emissive: 0x303030 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.15 });
  const gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 });
  const outfitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04, side: THREE.DoubleSide });
  const metalMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.9, roughness: 0.3, envMap: metalEnvTexture(), envMapIntensity: 1.15, side: THREE.DoubleSide });
  const shadowMat = new THREE.MeshBasicMaterial({ map: softDot('rgba(20,16,30,0.55)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const bubbleMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
        float pulse = 0.6 + 0.4 * sin(uTime * 6.0);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * f * 0.55 * pulse, 1.0);
      }`,
  });

  // брызги краски на теле (4 варианта развёртки атласа)
  const atlas = splatAtlas();
  const paintGeos: THREE.BufferGeometry[] = [];
  for (let v = 0; v < 4; v++) {
    const g = new THREE.PlaneGeometry(1, 1);
    const uv = g.getAttribute('uv');
    const ox = (v % 2) * 0.5;
    const oy = 0.5 - Math.floor(v / 2) * 0.5;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5 + ox, uv.getY(i) * 0.5 + oy);
    paintGeos.push(g);
  }
  const paintMats = TEAM_COLORS.map((c) => new THREE.MeshStandardMaterial({
    map: atlas, color: c, transparent: true, alphaTest: 0.35, depthWrite: false, roughness: 0.3,
    polygonOffset: true, polygonOffsetFactor: -2, emissive: new THREE.Color(c).multiplyScalar(0.12),
  }));

  return {
    body, eyes, pupils, lid, gun, hopper, hands, mitten,
    eyeMat, pupilMat, gunMat, outfitMat, metalMat, shadowMat, bubbleMat, paintGeos, paintMats,
    shadowGeo: new THREE.PlaneGeometry(1.35, 1.35).rotateX(-Math.PI / 2),
    bubbleGeo: new THREE.SphereGeometry(1, 24, 16),
    zzz: emoteTexture('zzz', '#cfe0ff'),
    haha: emoteTexture('ха-ха', '#ffe9a8'),
    tomato: tomatoSplatTexture(),
    tomatoGeo: tomatoGeometry(),
    reacts: REACTIONS.map((e) => emojiTexture(e)),
  };
}

/**
 * Клякса помидора перед глазами: кусок сферы вокруг оси тела (в системе узла глаз ось — на z = −EYES_Z),
 * чуть выше поверхности глаз, чтобы облегала лицо.
 */
function tomatoGeometry(): THREE.BufferGeometry {
  const r = Math.max(bodyR(EYES_Y), -EYES_Z) + 0.065;
  const g = new THREE.SphereGeometry(r, 20, 14, -Math.PI / 2 - 0.55, 1.1, Math.PI / 2 - 0.45, 0.9);
  g.translate(0, 0, -EYES_Z);
  return g;
}

function res() {
  shared ??= makeShared();
  return shared;
}

// ------------------------------------------------------------ материалы

/** Узоры желе по координатам тела vObj (до покачивания): одна программа на всех. */
const PATTERN_GLSL = /* glsl */ `
  uniform float uPattern;
  uniform vec3 uColor2;
  uniform float uMetal;
  varying vec3 vObj;
  float jHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float jNoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = mix(jHash(i), jHash(i + vec3(1.0, 0.0, 0.0)), u.x);
    float b = mix(jHash(i + vec3(0.0, 1.0, 0.0)), jHash(i + vec3(1.0, 1.0, 0.0)), u.x);
    float c = mix(jHash(i + vec3(0.0, 0.0, 1.0)), jHash(i + vec3(1.0, 0.0, 1.0)), u.x);
    float d = mix(jHash(i + vec3(0.0, 1.0, 1.0)), jHash(i + vec3(1.0, 1.0, 1.0)), u.x);
    return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
  }
  /** Ступенька со сглаживанием на ширину пикселя. */
  float jStep(float edge, float v) {
    float w = fwidth(v) * 0.75 + 1e-4;
    return smoothstep(edge - w, edge + w, v);
  }
  vec3 patternColor(vec3 base) {
    int p = int(uPattern + 0.5);
    float h = vObj.y / ${BODY_H.toFixed(2)};
    if (p == 1) {
      // тельняшка: полосы по высоте
      float tri = abs(fract(vObj.y * 6.5 + 0.25) - 0.5);
      return mix(base, uColor2, jStep(0.25, tri) * step(0.08, h) * step(h, 0.9));
    }
    if (p == 2) {
      // горошек: круглые точки по сетке «угол × высота», ряды со сдвигом
      float rowF = vObj.y * 4.5;
      float row = floor(rowF);
      float ang = atan(vObj.z, vObj.x) * (12.0 / 6.2831853) + 0.5 * mod(row, 2.0);
      vec2 f = vec2(fract(ang), fract(rowF)) - 0.5;
      float cw = 6.2831853 * length(vObj.xz) / 12.0;
      float d = length(vec2(f.x * cw, f.y * 0.222));
      return mix(base, uColor2, (1.0 - jStep(0.06, d)) * step(h, 0.85));
    }
    if (p == 3) {
      // пятна
      float n = jNoise(vObj * 3.2) * 0.65 + jNoise(vObj * 6.7 + 3.1) * 0.35;
      return mix(base, uColor2, jStep(0.6, n));
    }
    if (p == 4) {
      // закат: снизу вверх
      return mix(base, uColor2, smoothstep(0.1, 0.95, h));
    }
    if (p == 5) {
      // камуфляж: второй цвет и тёмные пятна
      float n1 = jNoise(vObj * 3.0 + 7.3) * 0.7 + jNoise(vObj * 7.0) * 0.3;
      float n2 = jNoise(vObj * 4.2 - 2.1) * 0.7 + jNoise(vObj * 9.0 + 1.7) * 0.3;
      vec3 c = mix(base, uColor2, jStep(0.55, n1));
      return mix(c, base * 0.42, jStep(0.62, n2));
    }
    if (p == 6) {
      // сахарная обсыпка: крупинки; издалека — ровная светлая дымка, без ряби
      float s = step(0.93, jHash(floor(vObj * 60.0)));
      float far = smoothstep(0.3, 1.0, fwidth(vObj.y * 60.0));
      return base + vec3(0.8) * mix(s, 0.07, far);
    }
    return base;
  }
`;

interface JellyUniforms {
  uTime: THREE.IUniform<number>;
  uWobble: THREE.IUniform<number>;
  uLean: THREE.IUniform<THREE.Vector2>;
  uFlash: THREE.IUniform<number>;
  uRim: THREE.IUniform<THREE.Color>;
  uRimK: THREE.IUniform<number>;
  uRimMix: THREE.IUniform<number>;
  uRimFar: THREE.IUniform<number>;
  uPattern: THREE.IUniform<number>;
  uColor2: THREE.IUniform<THREE.Color>;
  uMetal: THREE.IUniform<number>;
}

/**
 * Материал желе: блик-лак, подсветка по краю (как свет сквозь мармелад), вспышка при попадании, узор, золото.
 * Окружение у обычного желе отражает только лак (небо и закат бегут по бокам), у золота — весь материал.
 */
function jellyMaterial(u: JellyUniforms): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMap: metalEnvTexture(),
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = 'uniform float uTime;\nuniform float uWobble;\nuniform vec2 uLean;\nvarying vec3 vObj;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vObj = position;${JELLY_SWAY_GLSL}`,
    );
    shader.fragmentShader = 'uniform vec3 uRim;\nuniform float uFlash;\nuniform float uRimK;\nuniform float uRimMix;\nuniform float uRimFar;\n' + PATTERN_GLSL + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = patternColor(diffuseColor.rgb);')
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.85, uMetal);
        roughnessFactor = mix(roughnessFactor, 0.28, uMetal);`,
      )
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        // у обычного желе окружение только в лаке: блестит, а цвет не выцветает
        iblIrradiance *= uMetal;
        radiance *= uMetal;
        clearcoatRadiance *= mix(${JELLY_GLOSS.toFixed(2)}, 1.0, uMetal);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `${JELLY_RIM_GLSL}
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'jelly-v5';
  return mat;
}

/** Веко: цвет тела, видна только часть по одну сторону среза uCut (изгиб края — uCurve). */
function lidMaterial(cut: THREE.IUniform<THREE.Vector4>, curve: THREE.IUniform<number>): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCut = cut;
    shader.uniforms.uCurve = curve;
    shader.vertexShader = 'varying vec3 vLid;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLid = position;');
    shader.fragmentShader = 'uniform vec4 uCut;\nuniform float uCurve;\nvarying vec3 vLid;\n' + shader.fragmentShader.replace(
      'void main() {',
      'void main() {\n  if (dot(vLid, uCut.xyz) + uCurve * vLid.x * vLid.x < uCut.w) discard;',
    );
  };
  mat.customProgramCacheKey = () => 'jelly-lid';
  return mat;
}

export interface AvatarPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flags: number;
}

export interface AvatarOptions {
  /** Маркер в руках (пейнтбол) */
  gun?: boolean;
  /** False for preview/NPC avatars whose synthetic IDs do not belong to room players. */
  voice?: boolean;
}

/** Узел для вещи: обычная часть и золотая; сдвигается и наклоняется вместе с макушкой. */
interface Attach {
  node: THREE.Group;
  geo: THREE.Mesh;
  metal: THREE.Mesh;
  y: number;
  z: number;
  /** доля сдвига макушки на этой высоте: (y / 1.58)² */
  k: number;
  /** наклон на единицу сдвига макушки */
  tilt: number;
}

interface Gun {
  aim: THREE.Group;
  node: THREE.Group;
  hopperMat: THREE.MeshStandardMaterial;
  /** Корпус маркера и бункер — прячутся, когда в руках AWP (варежки остаются) */
  marker: THREE.Mesh[];
  /** Снайперская AWP (создаётся, когда впервые попадёт в руки) */
  awp: THREE.Group | null;
}

interface Speech {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
}

// ------------------------------------------------------------ желейка

export class Avatar {
  readonly id: number;
  readonly root = new THREE.Group();
  readonly shadow: THREE.Mesh;
  private readonly squashNode = new THREE.Group();
  private readonly eyesNode = new THREE.Group();
  /** Рот и румянец нового вида (look v2, lookface.ts); в прежнем виде — null, желейка как была */
  private readonly face = LOOK2 ? new JellyFace() : null;
  private readonly body: THREE.Mesh;
  private readonly lids: [THREE.Mesh, THREE.Mesh];
  private readonly mittens: [THREE.Mesh, THREE.Mesh];
  /** Командный жилет (пейнтбол): оболочка вокруг живота, общие uniforms с телом */
  private readonly gear: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** Значок над своими в пейнтболе (создаётся, когда впервые понадобится) */
  private mark: THREE.Sprite | null = null;
  private markTeam: 0 | 1 | null = null;
  /** На сколько (доля высоты экрана) ник и облачко подняты над значком */
  private lift = 0;
  private readonly hat: Attach;
  private readonly hatAnchor = { value: 0 };
  private hatBounds = { top: BODY_H, radius: 0 };
  private readonly acc: Attach;
  /** Аксессуары гнутся тем же шейдером, что шапки: якорь — своя высота */
  private readonly accAnchor = { value: 0 };
  private readonly eyewear: Attach;
  /** Питомец на плече (награда рыбалки) */
  private readonly pet: PetRider;
  /** Золотой якорь у ника: собрал все виды рыб */
  private badge = false;
  private readonly gun: Gun | null;
  private readonly protBubble: THREE.Mesh;
  private readonly tag: THREE.Sprite;
  private readonly tagCanvas: HTMLCanvasElement;
  private readonly tagTex: THREE.CanvasTexture;
  private readonly voiceEnabled: boolean;
  private voiceIndicator: THREE.Sprite | null = null;
  private tagKey = '';
  /** Как было до кадра с фотоаппарата: ник, облачко, сама желейка видны, куда смотрела */
  private photoWas: [boolean, boolean, boolean, number, boolean] = [false, false, false, 0, false];
  private speech: Speech | null = null;
  private speechUntil = 0;
  private emote: THREE.Sprite | null = null;
  private emoteKind = 0;
  private splat: THREE.Mesh | null = null;
  private splatMat: THREE.MeshStandardMaterial | null = null;
  private splatUntil = 0;
  private reactSprite: THREE.Sprite | null = null;
  /** Возраст реакции, с (−1 — нет) */
  private reactT = -1;
  private readonly u: JellyUniforms;
  private readonly lidCut: THREE.IUniform<THREE.Vector4> = { value: new THREE.Vector4(0, 1, 0, 0) };
  private readonly lidCurve: THREE.IUniform<number> = { value: 0 };
  private lidKey = '';
  private readonly bodyMat: THREE.MeshPhysicalMaterial;
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly lidMat: THREE.MeshStandardMaterial;
  private readonly paint: THREE.Mesh[] = [];
  private paintNext = 0;
  team: 0 | 1 | null = null;
  name = '';
  level = 1;
  mate = false;
  outfit: Outfit = { ...DEFAULT_OUTFIT };
  private outfitSet = false;
  /** Действие набережной (эмоция, сидит, у автомата) */
  action = ACT_NONE;
  arg = 0;
  /** видим ли (жив и не «лопнул») */
  shown = false;
  /** В мире: жива и не спрятана (своя может быть не видна, если камера вплотную, — а тут всё равно true) */
  inWorld = false;
  /** Своя желейка за столом дурака: камера смотрит из-за её головы — прячем */
  hidden = false;
  /** Сидит в карте: без подпрыгивания и дыхания, своей тени нет (есть у карта), варежки на руле */
  driving = false;
  /** Руль карта −1…1 (+ — влево) */
  steer = 0;
  /**
   * Руки задаёт сцена (удочка, рыба в руках): левая и правая варежки в осях желейки — [x, y, z, x, y, z];
   * null — как обычно (по действию)
   */
  hands: number[] | null = null;
  /** Что в руках (удочка, рыба): узел в осях желейки, сдвигается вместе с макушкой на высоте рук */
  readonly held = new THREE.Group();
  /** Жест вдвоём: где стоит партнёр (сцена ставит каждый кадр, пока он виден) */
  readonly partner = new THREE.Vector3();
  hasPartner = false;
  /** Сколько секунд идёт жест вдвоём */
  private pairT = 0;
  /** Шаг навстречу партнёру (плавно), куда, и сколько тянуться рукой до середины между двумя */
  private pairShift = 0;
  private pairDirX = 0;
  private pairDirZ = 0;
  private pairReach = PAIR_GAP_FIVE / 2;
  /** 0…1: насколько повернулась к партнёру */
  private pairFace = 0;
  /** Куда поворачиваться, отдавая честь (на набережной — к статуе; null — некуда) */
  honorAt: { readonly x: number; readonly z: number } | null = null;
  /** Насколько повернулась к статуе (0…1) и сколько уже отдаёт честь, с */
  private honorFace = 0;
  private honorT = 0;
  private pairYaw = 0;
  private readonly vpose: AvatarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0 };
  // анимация
  private squash = 0;
  private squashV = 0;
  private readonly lean = new THREE.Vector2();
  private readonly leanV = new THREE.Vector2();
  private readonly prevPos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly prevVel = new THREE.Vector3();
  private hasPrev = false;
  private wasGrounded = true;
  private hopPhase = 0;
  private blinkT = 2;
  private hurtT = 0;
  private recoil = 0;
  private adsT = 0;
  private reloadT = 0;
  private popT = -1;
  private leverT = 0;
  hp = 100;
  maxHp = 100;
  showHpUntil = 0;
  /** Смерть: прячем, пока не увидим «мёртв → жив» в интерполяции */
  hiddenUntilAlive = false;
  private sawDead = false;
  private hiddenAt = 0;

  constructor(id: number, opts: AvatarOptions = {}) {
    this.id = id;
    this.voiceEnabled = opts.voice !== false;
    const r = res();
    this.u = {
      uTime: { value: Math.random() * 100 },
      uWobble: { value: 0 },
      uLean: { value: new THREE.Vector2() },
      uFlash: { value: 0 },
      uRim: { value: new THREE.Color() },
      uRimK: { value: 0.6 },
      uRimMix: { value: 0 },
      uRimFar: { value: 0 },
      uPattern: { value: 0 },
      uColor2: { value: new THREE.Color() },
      uMetal: { value: 0 },
    };
    this.bodyMat = jellyMaterial(this.u);
    this.skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32 });
    this.lidMat = lidMaterial(this.lidCut, this.lidCurve);
    this.body = new THREE.Mesh(r.body, this.bodyMat);
    this.squashNode.add(this.body);

    // глаза смотрят вперёд (−Z), чуть наклоняются вслед за прицелом; веки — в том же узле (моргают вместе)
    this.eyesNode.add(new THREE.Mesh(r.eyes, r.eyeMat), new THREE.Mesh(r.pupils, r.pupilMat));
    const lidL = new THREE.Mesh(r.lid, this.lidMat);
    lidL.position.x = -0.13;
    const lidR = new THREE.Mesh(r.lid, this.lidMat);
    lidR.position.x = 0.13;
    lidR.scale.x = -1;
    this.lids = [lidL, lidR];
    this.eyesNode.add(lidL, lidR);
    this.eyesNode.position.set(0, EYES_Y, EYES_Z);
    this.squashNode.add(this.eyesNode);
    if (this.face) this.squashNode.add(this.face.node);

    this.hat = this.makeAttach();
    this.hat.geo.material = makeHatMaterial(r.outfitMat, this.u, this.hatAnchor);
    this.hat.metal.material = makeHatMaterial(r.metalMat, this.u, this.hatAnchor);
    this.acc = this.makeAttach();
    // аксессуары гнутся вместе с телом, как шапки: жилет и роба не тонут при ударе и не задираются на бегу
    this.acc.geo.material = makeHatMaterial(r.outfitMat, this.u, this.accAnchor);
    this.acc.metal.material = makeHatMaterial(r.metalMat, this.u, this.accAnchor);
    this.eyewear = this.makeAttach();
    this.pet = new PetRider(r.outfitMat, r.metalMat);
    this.squashNode.add(this.pet.node);

    // командный жилет: тело и жилет качаются одним шейдером, поэтому лежат друг на друге при любых прыжках
    this.gear = new THREE.Mesh(vestGeometry(), makeGearMaterial(this.u));
    this.gear.visible = false;
    this.squashNode.add(this.gear);

    const mitL = new THREE.Mesh(r.mitten, this.skinMat);
    const mitR = new THREE.Mesh(r.mitten, this.skinMat);
    mitL.visible = mitR.visible = false;
    this.mittens = [mitL, mitR];
    this.squashNode.add(mitL, mitR, this.held);

    if (opts.gun) {
      // маркер и «ручки»
      const aim = new THREE.Group();
      aim.position.set(0, 0.95, 0);
      const node = new THREE.Group();
      node.position.set(0.24, -0.02, -0.34);
      const hopperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, roughness: 0.2 });
      const marker = [new THREE.Mesh(r.gun, r.gunMat), new THREE.Mesh(r.hopper, hopperMat)];
      node.add(...marker, new THREE.Mesh(r.hands, this.skinMat));
      aim.add(node);
      this.squashNode.add(aim);
      this.gun = { aim, node, hopperMat, marker, awp: null };
    } else {
      this.gun = null;
    }

    this.protBubble = new THREE.Mesh(r.bubbleGeo, r.bubbleMat);
    this.protBubble.scale.set(0.95, 1.02, 0.95);
    this.protBubble.position.y = 0.8;
    this.protBubble.visible = false;
    this.squashNode.add(this.protBubble);

    this.root.add(this.squashNode);

    // табличка с именем: постоянный экранный размер, прячется за стенами
    this.tagCanvas = document.createElement('canvas');
    this.tagCanvas.width = 320;
    this.tagCanvas.height = 80;
    this.tagTex = new THREE.CanvasTexture(this.tagCanvas);
    this.tagTex.colorSpace = THREE.SRGBColorSpace;
    this.tagTex.minFilter = THREE.LinearFilter;
    this.tagTex.generateMipmaps = false;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, sizeAttenuation: false, depthWrite: false, transparent: true, fog: false }));
    this.tag.scale.set(0.18, 0.045, 1);
    this.tag.center.set(0.5, 0);
    this.tag.position.y = 1.9;
    this.tag.renderOrder = 5;
    this.root.add(this.tag);

    this.shadow = new THREE.Mesh(r.shadowGeo, r.shadowMat);
    this.shadow.renderOrder = 1;

    this.setOutfit(DEFAULT_OUTFIT);
    this.setTeam(null);
    this.root.visible = false;
    this.shadow.visible = false;
  }

  private makeAttach(): Attach {
    const r = res();
    const node = new THREE.Group();
    const geo = new THREE.Mesh(undefined, r.outfitMat);
    const metal = new THREE.Mesh(undefined, r.metalMat);
    geo.visible = metal.visible = false;
    node.add(geo, metal);
    this.squashNode.add(node);
    return { node, geo, metal, y: 0, z: 0, k: 0, tilt: 0 };
  }

  private applyWear(a: Attach, w: Wear, z = 0): void {
    a.geo.visible = w.geo !== null;
    if (w.geo) a.geo.geometry = w.geo;
    a.metal.visible = w.metal !== null;
    if (w.metal) a.metal.geometry = w.metal;
    const hh = w.y / BODY_H;
    a.y = w.y;
    a.z = z;
    a.k = hh * hh;
    a.tilt = (2 * hh) / BODY_H;
    a.node.position.set(0, w.y, z);
    a.node.rotation.set(0, 0, 0);
  }

  /** Наряд: цвет, узор, шапка, аксессуар, глаза. Тот же наряд второй раз не перестраивается. */
  setOutfit(o: Outfit): void {
    if (this.outfitSet && sameOutfit(o, this.outfit)) return;
    this.outfitSet = true;
    this.outfit = { ...o };
    const gold = o.p === 'gold';
    const c = new THREE.Color(gold ? GOLD : (PALETTE[o.c] ?? PALETTE[0]));
    this.bodyMat.color.copy(c);
    this.bodyMat.emissive.copy(c).multiplyScalar(gold ? 0.05 : 0.16);
    this.u.uColor2.value.set(PALETTE[o.c2] ?? PALETTE[15]);
    this.u.uPattern.value = PATTERN_INDEX[o.p] ?? 0;
    this.u.uMetal.value = gold ? 1 : 0;
    this.skinMat.color.copy(c);
    this.lidMat.color.copy(c);
    const hatWear = wearFor('h', o.h);
    this.applyWear(this.hat, hatWear);
    this.hatBounds = headwearBounds(hatWear);
    this.hatAnchor.value = this.hat.y;
    this.applyWear(this.acc, wearFor('a', o.a));
    this.accAnchor.value = this.acc.y;
    this.applyWear(this.eyewear, wearFor('e', o.e), EYES_Z);
    this.pet.set(slotKey(o, 's'), o.a);
    const badge = slotKey(o, 'n') === 'anchor';
    if (badge !== this.badge) {
      this.badge = badge;
      this.tagKey = '';
    }
    this.refreshShell();
    this.refreshColors();
  }

  /** Жилет, роба и китель — оболочки по телу: в пейнтболе под командным жилетом их не видно (иначе пересекутся). */
  private refreshShell(): void {
    this.acc.node.visible = !(this.team !== null && SHELL_ACCS.has(this.outfit.a));
  }

  /** Команда в пейнтболе (жилет, подсветка контура, баллон, табличка); null — набережная и другие режимы, как были. */
  setTeam(team: 0 | 1 | null): void {
    this.team = team;
    this.gear.visible = team !== null;
    if (team !== null) this.gear.material.map = vestTexture(team);
    this.refreshShell();
    this.refreshColors();
    this.tagKey = '';
  }

  private refreshColors(): void {
    const t = this.team;
    const c = t !== null ? new THREE.Color(TEAM_COLORS[t]) : this.bodyMat.color.clone();
    if (t === null) {
      // мягкий отсвет цвета тела
      this.u.uRim.value.copy(c).lerp(WHITE, 0.55);
      this.u.uRimK.value = 0.6;
      this.u.uRimMix.value = 0;
      this.u.uRimFar.value = 0;
    } else {
      // кайма цвета команды: у противника густая, у своих вдвое спокойнее; издали шире — иначе пропадает
      this.u.uRim.value.copy(c);
      this.u.uRimK.value = 0;
      this.u.uRimMix.value = this.mate ? 0.5 : 1;
      this.u.uRimFar.value = 1;
    }
    if (this.gun) this.gun.hopperMat.color.copy(c);
  }

  setLevel(level: number): void {
    const next = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
    if (this.level !== next) { this.level = next; this.tagKey = ''; }
  }

  setInfo(name: string, team: 0 | 1 | null, mate: boolean, level = this.level): void {
    this.setLevel(level);
    if (team !== this.team) this.setTeam(team);
    this.name = name;
    if (mate !== this.mate) {
      this.mate = mate;
      this.refreshColors();
    }
    this.tagKey = '';
  }

  /** Действие с сервера (эмоция, сидит, у автомата, жест вдвоём). */
  setAction(action: number, arg: number): void {
    // жест вдвоём начался (или сменился партнёр) — анимация с начала
    if (isPair(action) && arg !== 0 && (action !== this.action || arg !== this.arg)) this.pairT = 0;
    this.action = action;
    this.arg = arg;
  }

  /** Вместе с партнёром: идёт жест вдвоём (у позвавшего, пока ему не ответили, — нет). */
  private get together(): boolean {
    return isPair(this.action) && this.arg !== 0;
  }

  /**
   * Жест вдвоём: желейка поворачивается к партнёру и шагает навстречу — так, чтобы двое сошлись на нужное
   * расстояние (каждый проходит половину). Потом плавно возвращается. Без жеста — поза как есть.
   */
  private pairPose(pose: AvatarPose, dt: number): AvatarPose {
    // отдаёт честь: плавно поворачивается к статуе
    const honor = this.action === ACT_RESPECT && this.honorAt !== null;
    this.honorT = this.action === ACT_RESPECT ? this.honorT + dt : 0;
    this.honorFace += ((honor ? 1 : 0) - this.honorFace) * Math.min(1, dt * 7);
    const on = this.together && this.hasPartner;
    let want = 0;
    if (this.together) this.pairT += dt;
    if (on) {
      const dx = this.partner.x - pose.x;
      const dz = this.partner.z - pose.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        this.pairDirX = dx / d;
        this.pairDirZ = dz / d;
        this.pairYaw = Math.atan2(-dx, -dz);
        want = clamp((d - (this.action === ACT_HUG ? PAIR_GAP_HUG : PAIR_GAP_FIVE)) / 2, 0, PAIR_STEP);
        this.pairReach = clamp((d - 2 * want) / 2, 0.35, 0.75);
      }
    }
    // к концу жеста — обратно на своё место
    if (this.action === ACT_HUG && this.pairT > HUG_LET) want *= 1 - smooth((this.pairT - HUG_LET) / (HUG_END - HUG_LET));
    this.pairShift += (want - this.pairShift) * Math.min(1, dt * 9);
    this.pairFace += ((on ? 1 : 0) - this.pairFace) * Math.min(1, dt * 10);
    if (this.pairShift < 0.002 && this.pairFace < 0.002 && this.honorFace < 0.002) return pose;
    const v = this.vpose;
    v.x = pose.x + this.pairDirX * this.pairShift;
    v.y = pose.y;
    v.z = pose.z + this.pairDirZ * this.pairShift;
    v.yaw = lerpAngle(pose.yaw, this.pairYaw, this.pairFace);
    if (this.honorFace >= 0.002 && this.honorAt) {
      v.yaw = lerpAngle(v.yaw, Math.atan2(-(this.honorAt.x - pose.x), -(this.honorAt.z - pose.z)), this.honorFace);
    }
    v.pitch = pose.pitch;
    v.flags = pose.flags;
    return v;
  }

  /** Обнимашки: 0…1 — насколько обнялись (руки сошлись, тело тянется к партнёру). */
  private get hugK(): number {
    if (this.action !== ACT_HUG || this.arg === 0) return 0;
    const t = this.pairT;
    return t < HUG_LET ? smooth(t / HUG_HOLD) : 1 - smooth((t - HUG_LET) / (HUG_END - HUG_LET));
  }

  /** Рука на рычаг автомата. */
  pullLever(): void {
    this.leverT = LEVER_S;
  }

  /** Облачко над головой на 6 с. */
  say(text: string): void {
    const t = text.trim().slice(0, BUBBLE_CHARS);
    if (!t) return;
    const sp = (this.speech ??= this.makeSpeech());
    drawSpeech(sp.canvas, t);
    sp.tex.needsUpdate = true;
    this.speechUntil = performance.now() + BUBBLE_MS;
  }

  /**
   * Снимок у маяка, на время кадра с фотоаппарата: ник и облачко чата — интерфейс (их размер — в пикселях экрана),
   * на фото их нет; своя желейка видна, даже если камера игрока вплотную к ней; кто не в жесте вдвоём — лицом
   * к объективу (прибежал в кадр спиной — на фото всё равно лицом). lens — где объектив, null — вернуть как было.
   */
  photoPose(lens: THREE.Vector3 | null): void {
    const sp = this.speech?.sprite;
    const root = this.root;
    if (lens) {
      this.photoWas = [this.tag.visible, sp?.visible ?? false, root.visible, root.rotation.y, this.voiceIndicator?.visible ?? false];
      this.tag.visible = false;
      if (sp) sp.visible = false;
      if (this.voiceIndicator) this.voiceIndicator.visible = false;
      root.visible = this.inWorld;
      if (!this.together) root.rotation.y = Math.atan2(root.position.x - lens.x, root.position.z - lens.z);
    } else {
      [this.tag.visible, , root.visible, root.rotation.y] = this.photoWas;
      if (sp) sp.visible = this.photoWas[1];
      if (this.voiceIndicator) this.voiceIndicator.visible = this.photoWas[4];
    }
  }

  /** Удар кулаком («Fight Club»): желе ходит ходуном, вспышка и прищур — без краски. k — сила, 0…1,5. */
  jolt(k: number): void {
    this.u.uWobble.value = Math.min(1.8, this.u.uWobble.value + 0.5 + k * 0.7);
    this.u.uFlash.value = Math.min(0.7, 0.2 + k * 0.3);
    this.hurtT = 0.25 + k * 0.2;
  }

  /** Помидор в лицо: клякса перед глазами на 8 с, желейка вздрагивает и жмурится. */
  tomato(): void {
    this.u.uWobble.value = Math.min(1.6, this.u.uWobble.value + 1.2);
    this.u.uFlash.value = 0.3;
    this.hurtT = 0.6;
    if (!this.splat) {
      const r = res();
      this.splatMat = new THREE.MeshStandardMaterial({ map: r.tomato, transparent: true, depthWrite: false, roughness: 0.22 });
      this.splat = new THREE.Mesh(r.tomatoGeo, this.splatMat);
      this.splat.renderOrder = 2;
      this.eyesNode.add(this.splat);
    }
    this.splat.rotation.z = (Math.random() - 0.5) * 1.2;
    this.splat.visible = true;
    this.splatMat!.opacity = 1;
    this.splatUntil = performance.now() + TOMATO_MS;
  }

  /** Реакция (😂 👏 😡 🤔) над головой: выскакивает, всплывает и гаснет. */
  react(k: number): void {
    const map = res().reacts[k];
    if (!map) return;
    if (!this.reactSprite) {
      this.reactSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
      this.reactSprite.renderOrder = 6;
      this.root.add(this.reactSprite);
    }
    this.reactSprite.material.map = map;
    this.reactT = 0;
  }

  /** Помидор тает, реакция всплывает. */
  private updateTable(dt: number): void {
    if (this.splat?.visible) {
      const left = this.splatUntil - performance.now();
      if (left <= 0) this.splat.visible = false;
      else this.splatMat!.opacity = Math.min(1, left / TOMATO_FADE_MS);
    }
    const sp = this.reactSprite;
    if (!sp) return;
    if (this.reactT < 0) {
      sp.visible = false;
      return;
    }
    this.reactT += dt;
    const t = this.reactT;
    if (t >= REACT_S) {
      this.reactT = -1;
      sp.visible = false;
      return;
    }
    // выскочила с перелётом, всплывает с замедлением, в конце гаснет
    const pop = t < 0.12 ? (t / 0.12) * 1.18 : t < 0.26 ? 1.18 - ((t - 0.12) / 0.14) * 0.18 : 1;
    sp.visible = true;
    sp.scale.setScalar(REACT_SIZE * pop);
    sp.position.set(0, REACT_Y + REACT_RISE * (1 - Math.exp(-t * 1.6)), 0);
    sp.material.opacity = Math.min(1, (REACT_S - t) / 0.6);
  }

  private makeSpeech(): Speech {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 200;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthWrite: false, transparent: true, fog: false }));
    sprite.scale.set(SPEECH_W, SPEECH_H, 1);
    sprite.center.set(0.5, -0.42);
    sprite.position.y = 1.9;
    sprite.renderOrder = 6;
    sprite.visible = false;
    sprite.onBeforeRender = (_renderer, _scene, camera) => this.fitSpeechToCamera(camera);
    this.root.add(sprite);
    return { sprite, canvas, tex };
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.root, this.shadow);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root, this.shadow);
    this.bodyMat.dispose();
    (this.hat.geo.material as THREE.Material).dispose();
    (this.hat.metal.material as THREE.Material).dispose();
    (this.acc.geo.material as THREE.Material).dispose();
    (this.acc.metal.material as THREE.Material).dispose();
    this.skinMat.dispose();
    this.lidMat.dispose();
    this.gun?.hopperMat.dispose();
    this.gear.material.dispose();
    this.mark?.material.dispose();
    this.tag.material.dispose();
    this.tagTex.dispose();
    if (this.speech) {
      this.speech.sprite.material.dispose();
      this.speech.tex.dispose();
    }
    this.emote?.material.dispose();
    this.splatMat?.dispose();
    this.reactSprite?.material.dispose();
  }

  /** Попадание: всплеск, вспышка, клякса вражеской краски на теле. */
  onHit(wx: number, wy: number, wz: number, head: boolean): void {
    this.u.uWobble.value = Math.min(1.4, this.u.uWobble.value + (head ? 1 : 0.7));
    this.u.uFlash.value = head ? 0.55 : 0.35;
    this.hurtT = 0.28;
    this.stickPaint(wx, wy, wz);
  }

  private stickPaint(wx: number, wy: number, wz: number): void {
    const r = res();
    let m = this.paint[this.paintNext];
    const enemyTeam = (1 - (this.team ?? 0)) as 0 | 1;
    const variant = Math.floor(Math.random() * 4);
    if (!m) {
      m = new THREE.Mesh(r.paintGeos[variant], r.paintMats[enemyTeam]);
      this.paint.push(m);
      this.squashNode.add(m);
    } else {
      m.geometry = r.paintGeos[variant];
      m.material = r.paintMats[enemyTeam];
    }
    this.paintNext = (this.paintNext + 1) % 8;
    // в локальные координаты тела; ставим на поверхность по направлению от оси
    const local = this.squashNode.worldToLocal(new THREE.Vector3(wx, wy, wz));
    const y = THREE.MathUtils.clamp(local.y, 0.15, 1.45);
    const n = new THREE.Vector3(local.x, 0, local.z);
    if (n.lengthSq() < 1e-4) n.set(0, 0, -1);
    n.normalize();
    // в жилете краска ложится на него, а не под него
    const vest = this.team !== null ? vestRadius(y, Math.atan2(n.x, n.z)) : null;
    const rad = (vest ?? bodyR(y)) + 0.012;
    m.position.set(n.x * rad, y, n.z * rad);
    m.userData.base = m.position.clone();
    const hh = y / BODY_H;
    m.userData.hh = hh * hh;
    // нормаль с учётом наклона купола
    const tilt = y > 1.0 ? (y - 1.0) * 1.1 : 0;
    const normal = new THREE.Vector3(n.x, tilt, n.z).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(0.32 + Math.random() * 0.16);
    m.visible = true;
  }

  clearPaint(): void {
    for (const m of this.paint) m.visible = false;
  }

  onShot(): void {
    this.recoil = 1;
  }

  /** Лопнул (убит): короткое раздувание, потом прячемся до респауна. */
  pop(): void {
    this.popT = 0;
    this.hiddenUntilAlive = true;
    this.sawDead = false;
    this.hiddenAt = performance.now();
  }

  /** Мировая позиция дула (для трассеров чужих выстрелов); без маркера — перед глазами. */
  muzzle(out: THREE.Vector3): THREE.Vector3 {
    if (!this.gun) {
      this.eyesNode.updateWorldMatrix(true, false);
      return out.set(0, 0, -0.2).applyMatrix4(this.eyesNode.matrixWorld);
    }
    this.gun.node.updateWorldMatrix(true, false);
    return out.copy(this.awpOn ? AWP_MUZZLE : MUZZLE_LOCAL).applyMatrix4(this.gun.node.matrixWorld);
  }

  /** Пейнтбол: в руках снайперская AWP вместо маркера — всем видно, у кого она. Без маркера (набережная) — ничего. */
  setAwp(on: boolean): void {
    const g = this.gun;
    if (!g || this.awpOn === on) return;
    if (on && !g.awp) {
      g.awp = makeAwp();
      g.node.add(g.awp);
    }
    if (g.awp) g.awp.visible = on;
    for (const m of g.marker) m.visible = !on;
  }

  /** В руках AWP */
  get awpOn(): boolean {
    return this.gun?.awp?.visible ?? false;
  }

  /**
   * Кадр: pose — интерполированная поза, world — для тени.
   * local — своя желейка: прячется, если камера ближе 0,9 м (вид от первого лица, камера у стены).
   */
  update(rawPose: AvatarPose | null, dt: number, time: number, world: GroundQuery, camPos: THREE.Vector3, local: boolean): void {
    if (this.voiceIndicator) this.voiceIndicator.visible = false;
    const pose = rawPose && this.pairPose(rawPose, dt);
    const alive = pose !== null && (pose.flags & E_ALIVE) !== 0;
    if (this.hiddenUntilAlive) {
      if (!alive) this.sawDead = true;
      if ((this.sawDead && alive) || performance.now() - this.hiddenAt > 4000) {
        this.hiddenUntilAlive = false;
        this.clearPaint();
        this.hasPrev = false;
      }
    }
    // анимация «лопания»
    if (this.popT >= 0) {
      this.popT += dt;
      if (this.popT > 0.09) this.popT = -1;
    }
    const visible = alive && (!this.hiddenUntilAlive || this.popT >= 0);
    let near = false;
    if (visible && local && pose) {
      const dx = camPos.x - pose.x;
      const dz = camPos.z - pose.z;
      const dy = camPos.y - THREE.MathUtils.clamp(camPos.y, pose.y + 0.3, pose.y + 1.3);
      near = dx * dx + dy * dy + dz * dz < 0.81;
    }
    this.inWorld = visible && !this.hidden;
    this.shown = this.inWorld && !near;
    this.root.visible = this.shown;
    this.shadow.visible = visible && !this.driving;
    if (!visible || !pose) {
      this.hasPrev = false;
      return;
    }

    // скорость и ускорение по интерполированным позициям
    const p = this.root.position;
    p.set(pose.x, pose.y, pose.z);
    if (this.hasPrev && dt > 0) {
      this.prevVel.copy(this.vel);
      const vx = (p.x - this.prevPos.x) / dt;
      const vy = (p.y - this.prevPos.y) / dt;
      const vz = (p.z - this.prevPos.z) / dt;
      // телепорт — не считаем
      if (vx * vx + vz * vz > 40 * 40) this.vel.set(0, 0, 0);
      else this.vel.lerp(new THREE.Vector3(vx, vy, vz), Math.min(1, dt * 20));
    } else {
      this.vel.set(0, 0, 0);
      this.prevVel.set(0, 0, 0);
    }
    this.prevPos.copy(p);
    this.hasPrev = true;

    const grounded = (pose.flags & E_GROUNDED) !== 0;
    if (grounded && !this.wasGrounded) {
      this.squashV -= Math.min(3.2, 0.6 + Math.abs(this.prevVel.y) * 0.18);
    } else if (!grounded && this.wasGrounded && this.vel.y > 2) {
      this.squashV += 1.6;
    }
    this.wasGrounded = grounded;

    // пружины: сжатие и «запаздывание» макушки
    this.squashV += (-this.squash * 170 - this.squashV * 11) * dt;
    this.squash += this.squashV * dt;
    const yaw = pose.yaw;
    this.root.rotation.y = yaw;
    const ax = (this.vel.x - this.prevVel.x) / Math.max(dt, 1e-3);
    const az = (this.vel.z - this.prevVel.z) / Math.max(dt, 1e-3);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // ускорение в локальных осях (−Z вперёд)
    const lx = ax * c - az * s;
    const lz = ax * s + az * c;
    const tx = THREE.MathUtils.clamp(-lx * 0.0045, -0.16, 0.16);
    // в обнимашках тянется верхом к партнёру (вперёд — это −Z)
    const tz = THREE.MathUtils.clamp(-lz * 0.0045, -0.16, 0.16) - this.hugK * 0.13;
    this.leanV.x += ((tx - this.lean.x) * 140 - this.leanV.x * 9) * dt;
    this.leanV.y += ((tz - this.lean.y) * 140 - this.leanV.y * 9) * dt;
    this.lean.x += this.leanV.x * dt;
    this.lean.y += this.leanV.y * dt;
    this.u.uLean.value.copy(this.lean);
    // всё, что «приклеено» к телу, смещаем вместе с макушкой (сдвиг растёт как h²) и наклоняем по склону
    const lx2 = this.lean.x;
    const lz2 = this.lean.y;
    this.eyesNode.position.set(lx2 * 0.55, EYES_Y, EYES_Z + lz2 * 0.55);
    // Шапка и аксессуар следуют за каждой высотой тела в шейдере; жёсткий наклон вокруг узла проваливал их в желе
    // (жилет тонул при ударе и задирался на бегу). Общий squashNode передаёт им бег, прыжок, размеры и нокаут.
    const ew = this.eyewear;
    ew.node.position.set(lx2 * ew.k, ew.y, ew.z + lz2 * ew.k);
    ew.node.rotation.set(lz2 * ew.tilt, 0, -lx2 * ew.tilt);
    this.pet.update(time, dt, this.u.uTime.value, this.u.uWobble.value, this.lean);
    this.held.position.set(lx2 * 0.36, 0, lz2 * 0.36);
    if (this.gun) this.gun.aim.position.set(lx2 * 0.36, 0.95, lz2 * 0.36);
    for (const m of this.paint) {
      const base = m.userData.base as THREE.Vector3 | undefined;
      if (!base || !m.visible) continue;
      const k = m.userData.hh as number;
      m.position.set(base.x + lx2 * k, base.y, base.z + lz2 * k);
    }

    // походка вприпрыжку: в полёте вытянута, в момент касания приплюснута; стоит — чуть дышит
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let hop = 0;
    let contact = 0;
    let breath = 0;
    // за рулём карта, в катере и на колесе везут — ногами не перебирает
    if (this.driving || isAboard(this.action) || isFerry(this.action) || this.action === ACT_WHEEL) {
      this.hopPhase = 0;
    } else if (grounded && hs > 0.8) {
      this.hopPhase += dt * (5 + hs * 0.9);
      const amp = Math.min(1, hs / 8);
      const s1 = Math.abs(Math.sin(this.hopPhase));
      hop = s1 * amp;
      contact = Math.pow(1 - s1, 6) * amp;
    } else {
      this.hopPhase = 0;
      if (grounded) breath = Math.sin(time * 2.4) * 0.012;
    }

    // поза действия: сидит, устал, танцует, смеётся
    const act = this.action;
    const dash = (pose.flags & E_DASH) !== 0;
    const sq = this.squash + hop * 0.07 - contact * 0.08 + breath;
    let sy = 1 + sq;
    let sxz = 1 - sq * 0.5;
    let lift = 0;
    let sway = 0;
    let jitter = 0;
    if (this.driving) {
      sy *= DRIVE_SQUASH.y;
      sxz *= DRIVE_SQUASH.xz;
    } else if (act === ACT_SIT || act === ACT_DURAK || act === ACT_WHEEL || isAboard(act) || isFerry(act)) {
      // в катере и лодке «Удалая» стоит на полу, а подушка кресла и банка — выше скамейки
      lift = isAboard(act) || isFerry(act) ? BOAT_SIT_LIFT : SIT_LIFT;
      sy *= 0.88;
      sxz *= 1.04;
    } else if (act === ACT_TIRED) {
      sy *= 0.85;
      sxz *= 1.06;
    } else if (act === ACT_DANCE) {
      sway = Math.sin(time * 4.2) * 0.13;
      lift = Math.abs(Math.sin(time * 8.4)) * 0.08;
    } else if (act === ACT_LAUGH) {
      jitter = Math.sin(time * 47) * 0.012;
    } else if (act === ACT_RESPECT) {
      // смирно: чуть вытягивается
      const k = smooth(Math.min(1, this.honorT / 0.5));
      sy *= 1 + 0.04 * k;
      sxz *= 1 - 0.018 * k;
    } else if (act === ACT_HUG && this.arg !== 0) {
      // обнялись: чуть сминаются, покачиваются и тискают друг друга
      const k = this.hugK;
      sway = Math.sin(this.pairT * 3.1) * 0.045 * k;
      sy *= 1 - 0.05 * k + Math.sin(this.pairT * 6.2) * 0.02 * k;
      sxz *= 1 + 0.035 * k;
    } else if (act === ACT_FIVE && this.arg !== 0) {
      // хлопок: в момент удара вздрагивает
      const hit = this.pairT - FIVE_HIT;
      if (hit > 0 && hit < 0.25) sy *= 1 - Math.sin((hit / 0.25) * Math.PI) * 0.06;
    }
    this.squashNode.scale.set(sxz, sy, dash ? sxz * 1.18 : sxz);
    this.squashNode.position.set(jitter, hop * 0.11 + lift, 0);
    this.squashNode.rotation.z = sway;
    if (this.popT >= 0) {
      const k = 1 + this.popT * 5;
      this.squashNode.scale.multiplyScalar(k);
    }
    this.tag.position.y = headwearLabelHeight(this.hatBounds, this.squashNode.scale, sway, this.squashNode.position.y, lx2, this.u.uWobble.value);
    if (this.mark) this.mark.position.y = this.tag.position.y;
    this.updateMittens(time, dt, lx2, lz2);
    this.updateLids();
    this.face?.update(time, lx2, lz2, this.action, this.lidKey, this.hurtT > 0, this.speechUntil > performance.now());
    this.updateEmote(time);
    this.updateTable(dt);

    // прицел
    const ads = (pose.flags & E_ADS) !== 0;
    this.adsT += ((ads ? 1 : 0) - this.adsT) * Math.min(1, dt * 14);
    const reloading = (pose.flags & E_RELOAD) !== 0;
    this.reloadT += ((reloading ? 1 : 0) - this.reloadT) * Math.min(1, dt * 10);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    if (this.gun) {
      this.gun.aim.rotation.x = pose.pitch * 0.85;
      this.gun.node.position.set(0.24 - this.adsT * 0.1, -0.02 + this.adsT * 0.12, -0.34 + this.recoil * 0.06);
      this.gun.node.rotation.set(this.recoil * 0.15 - this.reloadT * 0.5, 0, -this.reloadT * 0.7 + Math.sin(time * 14) * this.reloadT * 0.08);
    }
    this.eyesNode.rotation.x = pose.pitch * 0.35;

    // моргание и прищур от боли
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 1.8 + Math.random() * 3.5;
    this.hurtT = Math.max(0, this.hurtT - dt);
    const eyeY = this.blinkT < 0 ? 0.12 : this.hurtT > 0 ? 0.45 : 1;
    this.eyesNode.scale.set(1, eyeY, 1);

    // желе
    this.u.uTime.value = time + this.id * 1.7;
    this.u.uWobble.value *= Math.exp(-dt * 4.5);
    this.u.uFlash.value *= Math.exp(-dt * 16);

    // защита после появления
    this.protBubble.visible = (pose.flags & E_PROTECTED) !== 0;

    // тень на ближайшей опоре (в карте тень у карта)
    const ground = this.driving ? -1000 : world.groundBelow(pose.x, pose.y + 0.05, pose.z);
    if (ground > -100) {
      const h = pose.y - ground;
      const k = Math.max(0, 1 - h / 7);
      this.shadow.position.set(pose.x, ground + 0.015, pose.z);
      this.shadow.scale.setScalar(0.55 + k * 0.45);
      this.shadow.visible = k > 0.02;
    } else {
      this.shadow.visible = false;
    }

    if (this.shown) {
      this.updateMark(camPos, local);
      // над своей желейкой табличка с ником не нужна
      if (local) this.tag.visible = false;
      else this.updateTag(camPos);
      this.updateSpeech(camPos);
      this.updateVoiceIndicator(local);
    }
  }

  private updateVoiceIndicator(local: boolean): void {
    if (!this.voiceEnabled || local || !this.tag.visible || !isVoiceSpeaking(this.id)) return;
    let badge = this.voiceIndicator;
    if (!badge) {
      badge = this.voiceIndicator = makeVoiceIndicator();
      badge.onBeforeRender = (renderer, _scene, camera) => {
        this.fitVoiceIndicator(renderer, camera);
        this.fitSpeechToCamera(camera);
      };
      this.root.add(badge);
    }
    badge.position.y = this.tag.position.y;
    badge.scale.set(0.03, 0.03, 1);
    this.positionVoiceIndicator();
    badge.visible = true;
  }

  /** 24 CSS pixels under the actual render camera, including wide FOV and scaled kart avatars. */
  private fitVoiceIndicator(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const badge = this.voiceIndicator!;
    const height = renderer.domElement?.clientHeight || viewH || 720;
    const projection = camera.projectionMatrix.elements[5];
    const root = this.root.matrixWorld.elements;
    const parentX = Math.hypot(root[0], root[1], root[2]);
    const parentY = Math.hypot(root[4], root[5], root[6]);
    if (!(height > 0 && projection > 0 && parentX > 0 && parentY > 0)) return;
    const size = 48 / (height * projection);
    badge.scale.set(size / parentX, size / parentY, 1);
    badge.updateMatrixWorld();
    this.positionVoiceIndicator();
  }

  private positionVoiceIndicator(): void {
    const badge = this.voiceIndicator;
    if (!badge) return;
    let top = this.lift + this.tag.scale.y;
    const speech = this.speech?.sprite;
    if (speech?.visible) top = Math.max(top, (1 - speech.center.y) * speech.scale.y);
    badge.center.set(0.5, -(top + 0.006) / badge.scale.y);
  }

  /** sizeAttenuation:false removes distance shrinkage, but Three still applies the camera's FOV. */
  private fitSpeechToCamera(camera: THREE.Camera): void {
    const speech = this.speech?.sprite;
    if (!speech?.visible) return;
    // Read the camera used for this draw: no previous-frame FOV and no per-scene camera plumbing.
    // Only enlarge wide views; close cameras and aiming keep their existing speech size.
    const factor = Math.max(1, SPEECH_REFERENCE_PROJECTION / camera.projectionMatrix.elements[5]);
    speech.scale.set(SPEECH_W * factor, SPEECH_H * factor, 1);
    speech.center.y = -(this.lift + this.tag.scale.y + 0.006) / speech.scale.y;
    speech.updateMatrixWorld();
    this.positionVoiceIndicator();
  }

  /** Руки-варежки: только в эмоциях, у автомата, на руле карта и когда их ставит сцена (удочка, улов). */
  private updateMittens(time: number, dt: number, lx: number, lz: number): void {
    const [l, r] = this.mittens;
    this.leverT = Math.max(0, this.leverT - dt);
    const act = this.action;
    const h = this.driving ? null : this.hands;
    l.visible = h !== null || this.driving || act === ACT_DANCE || act === ACT_LAUGH || act === ACT_SLOT || act === ACT_HUG;
    r.visible = l.visible || act === ACT_WAVE || act === ACT_FIVE || act === ACT_RESPECT;
    if (!r.visible) return;
    const put = (m: THREE.Mesh, x: number, y: number, z: number) => {
      const hh = y / BODY_H;
      m.position.set(x + lx * hh * hh, y, z + lz * hh * hh);
    };
    if (h) {
      put(l, h[0], h[1], h[2]);
      put(r, h[3], h[4], h[5]);
      return;
    }
    if (this.driving) {
      // руки «на девять и три» поворачиваются вместе с ободом (влево — против часовой, если смотреть водителю)
      const w = DRIVE_WHEEL;
      const a = this.steer * DRIVE_TURN;
      const c = Math.cos(a) * w.r;
      const sn = Math.sin(a) * w.r;
      const up = Math.cos(w.tilt);
      const back = Math.sin(w.tilt);
      put(l, -c, w.y - sn * up, w.z + sn * back);
      put(r, c, w.y + sn * up, w.z - sn * back);
      return;
    }
    switch (act) {
      case ACT_WAVE:
        put(r, 0.47 + Math.sin(time * 11) * 0.09, 1.34 + Math.abs(Math.sin(time * 11)) * 0.05, -0.12);
        break;
      case ACT_RESPECT: {
        // отдаёт честь: правая варежка поднимается к виску за полсекунды и замирает
        const k = smooth(Math.min(1, this.honorT / 0.5));
        put(r, lerp(0.44, 0.3, k), lerp(0.62, 1.47, k), lerp(-0.12, -0.33, k));
        break;
      }
      case ACT_DANCE:
        put(l, -0.42 + Math.sin(time * 8.4) * 0.04, 1.42 + Math.sin(time * 8.4) * 0.06, -0.05);
        put(r, 0.42 + Math.sin(time * 8.4 + 1) * 0.04, 1.42 + Math.sin(time * 8.4 + Math.PI) * 0.06, -0.05);
        break;
      case ACT_LAUGH:
        put(l, -0.27, 0.66 + Math.sin(time * 30) * 0.02, -0.45);
        put(r, 0.27, 0.66 + Math.sin(time * 30 + 1.3) * 0.02, -0.45);
        break;
      case ACT_SLOT: {
        const pull = this.leverT > 0 ? Math.sin(Math.PI * (1 - this.leverT / LEVER_S)) : 0;
        put(l, -0.2, 0.95, -0.55);
        put(r, 0.22 + pull * 0.05, 0.95 - pull * 0.25, -0.55);
        break;
      }
      case ACT_FIVE:
        if (this.arg === 0) {
          // позвал: ладонь поднята и подрагивает — «давай!»
          put(r, 0.42 + Math.sin(time * 6) * 0.025, 1.5 + Math.abs(Math.sin(time * 6)) * 0.035, -0.3);
        } else {
          const [x, y, z] = this.fiveHand();
          put(r, x, y, z);
        }
        break;
      case ACT_HUG:
        if (this.arg === 0) {
          // позвал: руки в стороны — «иди сюда»
          const bob = Math.sin(time * 4) * 0.04;
          put(l, -0.6, 1.12 + bob, -0.2);
          put(r, 0.6, 1.12 - bob, -0.2);
        } else {
          // руки сходятся за спиной партнёра и похлопывают
          const k = this.hugK;
          const back = this.pairReach * 2 + 0.18;
          const pat = Math.sin(this.pairT * 9) * 0.025 * k;
          const x = lerp(0.6, 0.42, k);
          const y = lerp(1.12, 1.0, k);
          const z = lerp(-0.2, -back, k);
          put(l, -x, y + pat, z);
          put(r, x, y - pat, z);
        }
        break;
    }
  }

  /** «Пять»: замах вверх-назад, удар в середину между двумя (на высоте 1,5 м), держит, опускает. */
  private fiveHand(): [number, number, number] {
    const t = this.pairT;
    const reach = this.pairReach - 0.06;
    if (t < FIVE_SWING) {
      const u = smooth(t / FIVE_SWING);
      return [lerp(0.42, 0.34, u), lerp(1.5, 1.68, u), lerp(-0.3, -0.12, u)];
    }
    if (t < FIVE_HIT) {
      // удар — с разгоном
      const u = Math.pow((t - FIVE_SWING) / (FIVE_HIT - FIVE_SWING), 2);
      return [lerp(0.34, 0.07, u), lerp(1.68, 1.5, u), lerp(-0.12, -reach, u)];
    }
    if (t < FIVE_HOLD) {
      // отскок после хлопка
      const b = Math.exp(-(t - FIVE_HIT) * 9) * 0.05;
      return [0.07, 1.5 + b * 0.5, -reach + b];
    }
    const u = smooth((t - FIVE_HOLD) / (FIVE_DOWN - FIVE_HOLD));
    return [lerp(0.07, 0.46, u), lerp(1.5, 1.0, u), lerp(-reach, -0.25, u)];
  }

  private updateLids(): void {
    let key = LID_OF[this.outfit.e] ?? 'open';
    if (this.action === ACT_TIRED) key = 'sleepy';
    else if (this.action === ACT_LAUGH || this.together) key = 'happy';
    if (key === this.lidKey) return;
    this.lidKey = key;
    const cut = LID_CUTS[key];
    this.lids[0].visible = this.lids[1].visible = cut !== null;
    if (cut) {
      this.lidCut.value.set(cut[0], cut[1], cut[2], cut[3]);
      this.lidCurve.value = cut[4];
    }
  }

  /** Надпись над головой: «zzz» у уставшего, «ха-ха» у смеющегося. */
  private updateEmote(time: number): void {
    const kind = this.action === ACT_TIRED ? 1 : this.action === ACT_LAUGH ? 2 : 0;
    if (kind === 0) {
      if (this.emote) this.emote.visible = false;
      return;
    }
    const r = res();
    if (!this.emote) {
      this.emote = new THREE.Sprite(new THREE.SpriteMaterial({ map: r.zzz, transparent: true, depthWrite: false }));
      this.emote.scale.set(0.72, 0.36, 1);
      this.root.add(this.emote);
    }
    if (kind !== this.emoteKind) {
      this.emoteKind = kind;
      this.emote.material.map = kind === 1 ? r.zzz : r.haha;
    }
    const ph = (time * (kind === 1 ? 0.55 : 0.9)) % 1;
    this.emote.visible = true;
    this.emote.position.set(0.62 + ph * 0.12 + Math.sin(time * 2) * 0.04, 1.4 + ph * 0.5, 0);
    this.emote.material.opacity = Math.sin(ph * Math.PI);
  }

  private updateSpeech(camPos: THREE.Vector3): void {
    const sp = this.speech;
    if (!sp) return;
    const left = this.speechUntil - performance.now();
    const d = camPos.distanceTo(this.root.position);
    sp.sprite.visible = left > 0 && d < 35;
    if (!sp.sprite.visible) return;
    sp.sprite.position.y = this.tag.position.y;
    sp.sprite.center.y = -(this.lift + this.tag.scale.y + 0.006) / sp.sprite.scale.y;
    sp.sprite.material.opacity = Math.min(1, left / 600, (35 - d) / 5);
  }

  /**
   * Значок над головой своего в пейнтболе: виден издалека и сквозь стены (свои — не секрет), вплотную гаснет.
   * Ник и облачко поднимаются над ним. У противников значка нет: они не светятся сквозь стены.
   */
  private updateMark(camPos: THREE.Vector3, local: boolean): void {
    const t = this.team;
    if (t === null || !this.mate || local) {
      if (this.mark) this.mark.visible = false;
      this.lift = 0;
      return;
    }
    const m = (this.mark ??= this.makeMark());
    if (this.markTeam !== t) {
      this.markTeam = t;
      m.material.map = pinTexture(t);
      m.material.needsUpdate = true;
    }
    const s = Math.max(MARK_S, viewH > 0 ? MARK_PX / viewH : 0);
    const op = clamp((camPos.distanceTo(this.root.position) - 2.5) / 4, 0, 1) * 0.95;
    m.visible = op > 0.02;
    m.material.opacity = op;
    m.scale.set(s, s, 1);
    this.lift = m.visible ? s + MARK_GAP : 0;
  }

  private makeMark(): THREE.Sprite {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, fog: false }));
    m.center.set(0.5, 0);
    m.position.y = this.tag.position.y;
    m.renderOrder = 7;
    this.root.add(m);
    return m;
  }

  private updateTag(camPos: THREE.Vector3): void {
    // без ника (жители набережной) — без таблички
    if (!this.name) {
      this.tag.visible = false;
      return;
    }
    const d = camPos.distanceTo(this.root.position);
    const now = performance.now();
    this.tag.center.y = -this.lift / this.tag.scale.y;
    const showHp = this.mate ? this.hp < this.maxHp : now < this.showHpUntil;
    const maxD = this.team === null ? 40 : this.mate ? 70 : 28;
    this.tag.visible = d < maxD;
    if (!this.tag.visible) return;
    const mat = this.tag.material;
    mat.opacity = Math.min(1, (maxD - d) / 6);
    const hpBucket = showHp ? Math.round((this.hp / Math.max(1, this.maxHp)) * 40) : -1;
    const phase = (now + this.level * 271 + this.name.length * 93) % 8000;
    const reduced = LEVEL_REDUCED_MOTION?.matches ?? false;
    const shine = this.level >= 15 && this.team === null && !reduced && phase < 800 ? 1 + Math.floor(phase / 100) : 0;
    const key = `${this.name}|${this.team}|${this.mate}|${hpBucket}|${this.level}|${shine}|${this.badge}`;
    if (key === this.tagKey) return;
    this.tagKey = key;
    const cv = this.tagCanvas;
    const ctx = cv.getContext('2d')!;
    drawLevelTag(ctx, cv.width, cv.height, { name: this.name, level: this.level, team: this.team, mate: this.mate, hpBucket, shine, anchor: this.badge });
    this.tagTex.needsUpdate = true;
  }
}

/** Облачко: белая плашка с хвостиком, до 3 строк, длинное обрезается многоточием. */
function drawSpeech(cv: HTMLCanvasElement, text: string): void {
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.font = '600 34px Rubik, system-ui, sans-serif';
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= 440 || !cur) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) {
    lines.length = 3;
    lines[2] = `${lines[2].replace(/.$/u, '')}…`;
  }
  for (let i = 0; i < lines.length; i++) {
    while (ctx.measureText(lines[i]).width > 460 && lines[i].length > 1) lines[i] = `${lines[i].slice(0, -2)}…`;
  }
  const lineH = 40;
  const w = Math.max(90, ...lines.map((l) => ctx.measureText(l).width)) + 40;
  const h = lines.length * lineH + 24;
  const x = (cv.width - w) / 2;
  const y = cv.height - 18 - h;
  ctx.fillStyle = 'rgba(255,252,246,0.96)';
  ctx.strokeStyle = 'rgba(40,32,28,0.35)';
  ctx.lineWidth = 3;
  roundRect(ctx, x, y, w, h, 22);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cv.width / 2 - 14, y + h - 1);
  ctx.lineTo(cv.width / 2, cv.height - 3);
  ctx.lineTo(cv.width / 2 + 14, y + h - 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a2420';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, cv.width / 2, y + 12 + lineH * (i + 0.5)));
}


function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Высота окна рисования, пкс: от неё размер значка над своими (на телефоне крупнее в долях экрана) */
let viewH = 0;

/** Для одновременного обновления «пузырей» защиты; viewHeight — высота холста, пкс (в пейнтболе, для значка). */
export function tickAvatarShared(time: number, viewHeight = 0): void {
  if (shared) shared.bubbleMat.uniforms.uTime.value = time;
  // Keep a valid pixel minimum across scenes that omit height, but reject camera world coordinates.
  if (Number.isFinite(viewHeight) && viewHeight >= 64) viewH = viewHeight;
}
