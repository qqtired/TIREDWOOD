// Аура элиток «Крепости» (с FORT50; новый вид включает setEliteEnabled, client/fort/elite/flag.ts): свечение идёт от самой 3D-модели, как в Solo Leveling. Две части:
//  - контур по краю силуэта и глаза в цвет ауры — в общем материале мобов (client/fort/elite/rim.ts), без новой
//    программы и без новых отрисовок: ступень особи едет в атрибуте вспышки (MobRenderer.add(…, tier));
//  - языки пламени, дым или искры — один пул квадратов, повёрнутых к камере (EliteAura): одна отрисовка и одна программа
//    на все ауры в кадре. Частицы рождаются на поверхности модели в её текущей позе (точки на треугольниках частей,
//    по костям), чаще — у края силуэта со стороны камеры, и живут в мире: идущая элитка тянет за собой шлейф.
// Без настоящих ламп, пост-эффектов и размытия. Вид (вариант и цвет) — setAuraLook; стенд — lab/fort-elite.
// Выбор владельца 01.11: «А по рангу делаем со свечениями» — вариант A2 (пламя A + контур и искры C), цвет по рангу.
import * as THREE from 'three';
import { BODY_H, bodyR } from '../../render/outfit3d.ts';
import type { Quality } from '../../settings.ts';
import { BONES, newPose, type MobAnim, type MobDef, type MobPose } from '../mobs/kit.ts';
import { AURA_RIM } from './rim.ts';

export type AuraVariant = 'A' | 'B' | 'C' | 'A2';
export type AuraColorMode = 'rank' | 'mono';

/** Подписи вариантов — для стенда и страницы выбора */
export const AURA_VARIANTS: Readonly<Record<AuraVariant, { name: string; hint: string }>> = {
  A: { name: 'Тёмное пламя', hint: 'языки пламени поднимаются от силуэта, глаза горят и оставляют след' },
  B: { name: 'Дымные тени', hint: 'тёмный дым стекает с тела и тянется следом, край светится' },
  C: { name: 'Искры и контур', hint: 'яркий контур по краю силуэта и поднимающиеся искры' },
  A2: { name: 'A + свечение', hint: 'пламя со светлой сердцевиной, светящийся контур тела и глаза, искры вверх' },
};

/** Вариант игры (выбор владельца 01.11) */
export const GAME_AURA: AuraVariant = 'A2';

/** Желейка без модели: тело — профиль outfit3d в осях тела (ноги в 0, лицо к −Z) */
export const AURA_JELLY = 'jelly' as const;
/** Модели нет (осадные GLB): частицы — по хитбоксу, цилиндр радиуса r и высоты h в осях корня. Объект можно переиспользовать */
export interface AuraHull {
  hull: true;
  r: number;
  h: number;
}
export type AuraSource = MobDef | typeof AURA_JELLY | AuraHull;

/** Частиц в кадре на все ауры: ~50 на элитку, у чемпиона больше */
export const AURA_CAP = 2048;

interface Pal {
  core: number;
  mid: number;
  deep: number;
}
/** Цвета: элита — сине-фиолетовая, чемпион — золотисто-оранжевая; «один цвет» — фиолетовая у всех */
const VIOLET: Pal = { core: 0xf1ebff, mid: 0x7f5cff, deep: 0x2c1680 };
const GOLD: Pal = { core: 0xfff4c6, mid: 0xffa126, deep: 0xa13a08 };
const SMOKE_VIOLET: Pal = { core: 0xe9ddff, mid: 0x9b6bff, deep: 0x1b1030 };
const SMOKE_GOLD: Pal = { core: 0xfff0c0, mid: 0xffa13a, deep: 0x2a1408 };
/** A2: золото светлее и желтее (почти белая сердцевина) — аура, а не поджог жаровни (оранжевые языки) */
const VIOLET_LIT: Pal = { core: 0xc4b2ff, mid: 0x7350ff, deep: 0x2e159a };
const GOLD_LIT: Pal = { core: 0xfffdf2, mid: 0xffd04a, deep: 0xd98a12 };

const SHAPE_FLAME = 0;
const SHAPE_SMOKE = 1;
const SHAPE_SPARK = 2;
const SHAPE_EYE = 3;

interface Style {
  /** Контур: резкость, яркость, «языки», притемнение тела */
  rim: [number, number, number, number];
  /** Глаза: яркость, доля цвета ауры */
  eye: [number, number];
  shape: number;
  /** Частиц в секунду на элитку ростом 1,6 м при масштабе 1 */
  rate: number;
  life: [number, number];
  /** Размер в начале и в конце жизни, м (на масштаб 1) */
  size: [number, number];
  /** Скорость вверх, м/с */
  rise: [number, number];
  /** Отрыв от поверхности по нормали, м/с */
  push: number;
  /** Сопротивление, 1/с, и подъёмная сила, м/с² */
  drag: number;
  lift: number;
  /** Колыхание вбок, м/с */
  swirl: number;
  /** Рождать ниже по телу (дым стекает) */
  low: boolean;
  /** След глаз: частиц в секунду на глаз (0 — без следа) */
  eyes: number;
  alpha: number;
  /** Вытянутость языка или искры по вертикали */
  stretch: number;
  glow: number;
  pal: [Pal, Pal];
  /** Сердцевина языка: 0 — тёмная (A), 1 — светлая, почти белая (A2) */
  core?: number;
  /** Искры сверх основного вида: в секунду на элитку (A2) */
  sparks?: number;
}

const STYLES: Record<AuraVariant, Style> = {
  A: {
    rim: [3.0, 1.3, 0.75, 0.22], eye: [2.4, 1], shape: SHAPE_FLAME, rate: 70, life: [0.36, 0.7], size: [0.36, 0.12], rise: [1.1, 1.8],
    push: 0.35, drag: 1.2, lift: 1.4, swirl: 0.35, low: false, eyes: 22, alpha: 0.95, stretch: 1.75, glow: 1.15, pal: [VIOLET, GOLD],
  },
  B: {
    rim: [2.8, 1.2, 0.25, 0.38], eye: [2.4, 1], shape: SHAPE_SMOKE, rate: 40, life: [1.1, 1.8], size: [0.45, 1.05], rise: [0.3, 0.6],
    push: 0.45, drag: 1.4, lift: 0.2, swirl: 0.35, low: true, eyes: 0, alpha: 0.6, stretch: 1, glow: 1.2, pal: [SMOKE_VIOLET, SMOKE_GOLD],
  },
  C: {
    rim: [3.0, 2.8, 0.3, 0.06], eye: [2.6, 1], shape: SHAPE_SPARK, rate: 70, life: [0.5, 1.0], size: [0.09, 0.035], rise: [1.6, 2.8],
    push: 0.5, drag: 0.6, lift: 0.6, swirl: 0.7, low: false, eyes: 0, alpha: 0.9, stretch: 1.7, glow: 1.5, pal: [VIOLET, GOLD],
  },
  A2: {
    rim: [3.0, 2.4, 0.45, 0.08], eye: [3.0, 1], shape: SHAPE_FLAME, rate: 64, life: [0.36, 0.7], size: [0.34, 0.1], rise: [1.2, 1.9],
    push: 0.35, drag: 1.0, lift: 1.4, swirl: 0.4, low: false, eyes: 22, alpha: 0.9, stretch: 1.7, glow: 1.2, pal: [VIOLET_LIT, GOLD_LIT],
    core: 1, sparks: 26,
  },
};

/** Чемпион против элиты: частиц, размер, высота языков, яркость (в режиме «один цвет» — заметнее) */
const CHAMP = { rank: { rate: 1.45, size: 1.12, rise: 1.15, glow: 1.15 }, mono: { rate: 1.8, size: 1.3, rise: 1.35, glow: 1.55 } };

// ------------------------------------------------------------ точки на поверхности модели

/** Точки рождения: на треугольниках частей (по площади), в осях своей кости, с нормалью; глаза — центры светящихся частей */
interface Surface {
  n: number;
  bone: Uint8Array;
  p: Float32Array;
  nrm: Float32Array;
  eyeBone: number[];
  eyeP: number[];
}

const SURF_N = 192;
const surfaces = new WeakMap<MobDef, Surface>();
let jellySurf: Surface | null = null;
let hullSurf: Surface | null = null;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

function surfaceOf(def: MobDef): Surface {
  const got = surfaces.get(def);
  if (got) return got;
  // треугольники всех несветящихся частей с площадью — для выбора по площади
  const tris: Array<{ part: number; i0: number; i1: number; i2: number; area: number }> = [];
  let total = 0;
  def.parts.forEach((part, pi) => {
    if (part.glow) return;
    const pos = part.geo.getAttribute('position');
    const idx = part.geo.index;
    const count = idx ? idx.count : pos.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const i0 = idx ? idx.getX(t) : t;
      const i1 = idx ? idx.getX(t + 1) : t + 1;
      const i2 = idx ? idx.getX(t + 2) : t + 2;
      _a.fromBufferAttribute(pos, i0);
      _b.fromBufferAttribute(pos, i1).sub(_a);
      _c.fromBufferAttribute(pos, i2).sub(_a);
      const area = _n.crossVectors(_b, _c).length() * 0.5;
      if (area < 1e-6) continue;
      tris.push({ part: pi, i0, i1, i2, area });
      total += area;
    }
  });
  const r = rng(hash(def.id));
  const n = tris.length ? SURF_N : 0;
  const s: Surface = { n, bone: new Uint8Array(n), p: new Float32Array(n * 3), nrm: new Float32Array(n * 3), eyeBone: [], eyeP: [] };
  for (let k = 0; k < n; k++) {
    let x = r() * total;
    let t = tris[tris.length - 1];
    for (const tr of tris) {
      x -= tr.area;
      if (x <= 0) { t = tr; break; }
    }
    const part = def.parts[t.part];
    const pos = part.geo.getAttribute('position');
    let u = r();
    let v = r();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    _a.fromBufferAttribute(pos, t.i0);
    _b.fromBufferAttribute(pos, t.i1);
    _c.fromBufferAttribute(pos, t.i2);
    const px = _a.x + (_b.x - _a.x) * u + (_c.x - _a.x) * v;
    const py = _a.y + (_b.y - _a.y) * u + (_c.y - _a.y) * v;
    const pz = _a.z + (_b.z - _a.z) * u + (_c.z - _a.z) * v;
    _b.sub(_a);
    _c.sub(_a);
    _n.crossVectors(_b, _c).normalize();
    s.bone[k] = BONES.indexOf(part.bone);
    s.p.set([px, py, pz], k * 3);
    s.nrm.set([_n.x, _n.y, _n.z], k * 3);
  }
  // глаза: светящиеся части, слева и справа отдельно (у большинства мобов это два глаза)
  for (const part of def.parts) {
    if (!part.glow) continue;
    const pos = part.geo.getAttribute('position');
    for (const side of [-1, 1]) {
      let sx = 0, sy = 0, sz = 0, m = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        if (side < 0 ? x >= 0 : x < 0) continue;
        sx += x; sy += pos.getY(i); sz += pos.getZ(i); m++;
      }
      if (!m) continue;
      s.eyeBone.push(BONES.indexOf(part.bone));
      s.eyeP.push(sx / m, sy / m, sz / m);
    }
  }
  surfaces.set(def, s);
  return s;
}

/** Желейка: точки на теле вращения (профиль outfit3d), глаза — как у лица желейки в zombies3d */
function jellySurface(): Surface {
  if (jellySurf) return jellySurf;
  const r = rng(77);
  const n = SURF_N;
  const s: Surface = { n, bone: new Uint8Array(n), p: new Float32Array(n * 3), nrm: new Float32Array(n * 3), eyeBone: [0, 0], eyeP: [-0.14, 1.17, -0.43, 0.14, 1.15, -0.43] };
  for (let k = 0; k < n; k++) {
    const y = (0.08 + r() * 0.86) * BODY_H;
    const rad = bodyR(y);
    const slope = (bodyR(y + 0.03) - bodyR(y - 0.03)) / 0.06;
    const a = r() * Math.PI * 2;
    _n.set(Math.cos(a), -slope, Math.sin(a)).normalize();
    s.p.set([Math.cos(a) * rad, y, Math.sin(a) * rad], k * 3);
    s.nrm.set([_n.x, _n.y, _n.z], k * 3);
  }
  jellySurf = s;
  return s;
}

/** Хитбокс без модели: точки на боку единичного цилиндра (r = 1, h = 1) и на верхушке */
function hullSurface(): Surface {
  if (hullSurf) return hullSurf;
  const r = rng(91);
  const n = SURF_N;
  const s: Surface = { n, bone: new Uint8Array(n), p: new Float32Array(n * 3), nrm: new Float32Array(n * 3), eyeBone: [], eyeP: [] };
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2;
    const top = r() < 0.2;
    const y = top ? 1 : 0.06 + r() * 0.9;
    const rad = top ? Math.sqrt(r()) * 0.85 : 1;
    s.p.set([Math.cos(a) * rad, y, Math.sin(a) * rad], k * 3);
    s.nrm.set(top ? [0, 1, 0] : [Math.cos(a), 0, Math.sin(a)], k * 3);
  }
  hullSurf = s;
  return s;
}

// ------------------------------------------------------------ шейдер частиц

const VERT = /* glsl */ `
attribute vec4 iA;
attribute vec4 iB;
uniform float uStretch;
uniform float uSparkStretch;
varying vec2 vUv;
varying vec4 vB;
void main() {
  vUv = position.xy;
  vB = iB;
  float shape = iB.w;
  float st = shape < 0.5 ? uStretch : ( shape > 1.5 && shape < 2.5 ) ? uSparkStretch : 1.0;
  float lift = shape < 0.5 ? 0.3 : 0.0;
  vec4 mv = modelViewMatrix * vec4( iA.xyz, 1.0 );
  mv.xy += vec2( position.x, ( position.y + lift ) * st ) * iA.w;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uE0;
uniform vec3 uE1;
uniform vec3 uE2;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uAlpha;
uniform float uGlow;
uniform float uChampGlow;
uniform float uTime;
uniform float uFlameCore;
varying vec2 vUv;
varying vec4 vB;
void main() {
  float age = vB.x;
  float seed = vB.y;
  float shape = vB.w;
  float champ = step( 1.5, vB.z );
  vec3 core = mix( uE0, uC0, champ );
  vec3 mid = mix( uE1, uC1, champ );
  vec3 deep = mix( uE2, uC2, champ );
  float glow = uGlow * mix( 1.0, uChampGlow, champ );
  vec2 p = vUv;
  vec3 rgb;
  float a;
  if ( shape < 0.5 ) {
    // язык пламени: широкий низ, острый колышущийся верх, горячая сердцевина
    float y = clamp( p.y + 0.5, 0.0, 1.0 );
    float wob = sin( y * 6.0 - uTime * 10.0 + seed * 40.0 ) * 0.11 * y + sin( y * 13.0 + seed * 17.0 - uTime * 7.0 ) * 0.03;
    float w = mix( 0.46, 0.03, pow( y, 0.75 ) ) * ( 1.0 - 0.3 * age );
    float d = abs( p.x - wob ) / w;
    float body = ( 1.0 - smoothstep( 0.5, 1.0, d ) ) * smoothstep( 0.0, 0.16, y ) * ( 1.0 - smoothstep( 0.72, 1.0, y ) );
    float fade = ( 1.0 - age ) * smoothstep( 0.0, 0.1, age );
    // тёмная сердцевина и светящийся край (как «тёмное пламя»), у основания — немного жара
    float edge = smoothstep( 0.2, 0.9, d );
    float hot = ( 1.0 - smoothstep( 0.0, 0.5, d ) ) * ( 1.0 - smoothstep( 0.0, 0.35, y ) ) * ( 1.0 - age );
    vec3 c = mix( deep, mid * 1.35, edge );
    c = mix( c, deep, smoothstep( 0.55, 1.0, y ) * 0.45 );
    c += core * hot * 0.3;
    // светлая сердцевина (A2): белое ядро внизу языка, к краю — цвет ауры, кончик гаснет в цвет
    float inner = ( 1.0 - edge ) * ( 1.0 - smoothstep( 0.2, 0.8, y ) ) * 0.9;
    vec3 lit = mix( mid * 1.15, core * 1.3, inner );
    lit = mix( lit, mid, smoothstep( 0.72, 1.0, y ) * 0.5 );
    c = mix( c, lit, uFlameCore );
    a = body * fade * uAlpha;
    rgb = c * a * glow;
    a *= 0.95;
  } else if ( shape < 1.5 ) {
    // клуб дыма: тёмная середина с рваным краем, край светится цветом ауры
    float r = length( p ) * 2.0 + 0.08 * sin( atan( p.y, p.x ) * 2.0 + seed * 20.0 + uTime * 0.8 );
    float dens = max( 0.0, exp( -r * r * 2.6 ) - 0.07 ) / 0.93;
    float fade = smoothstep( 0.0, 0.2, age ) * ( 1.0 - smoothstep( 0.35, 1.0, age ) );
    float hot = 1.0 - smoothstep( 0.0, 0.32, age );
    vec3 c = mix( deep, mid, hot * 0.5 );
    a = dens * fade * uAlpha;
    rgb = c * a * mix( 0.7, glow, hot * 0.8 );
  } else {
    // искра (2) и след глаза (3): белая точка в цветном ореоле
    float r = length( p ) * 2.0;
    float c0 = exp( -r * r * 16.0 );
    float halo = exp( -r * r * 4.5 );
    float fade = shape > 2.5 ? ( 1.0 - age ) * ( 1.0 - age ) : ( 1.0 - age * age ) * smoothstep( 0.0, 0.08, age );
    rgb = ( core * c0 * 1.5 + mid * halo * 0.95 ) * fade * glow;
    a = ( c0 * 0.55 + halo * 0.4 ) * fade * uAlpha;
  }
  if ( a < 0.003 && rgb.r + rgb.g + rgb.b < 0.006 ) discard;
  // заранее умноженная прозрачность: тёмное закрывает фон, светлое — добавляется (одна смесь на пламя, дым и искры)
  gl_FragColor = vec4( rgb, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------ вид

let style: Style = STYLES.A;
let mode: AuraColorMode = 'rank';
let enabled = true;
const pools = new Set<EliteAura>();

/**
 * Вид ауры на всех: вариант A/B/C и цвет («по рангу» — элита фиолетовая, чемпион золотой; «один цвет» — фиолетовая у
 * всех, чемпион ярче и выше). on = false — ауры нет совсем (контур выключен, частицы не рождаются).
 */
export function setAuraLook(variant: AuraVariant, colorMode: AuraColorMode = 'rank', on = true): void {
  style = STYLES[variant];
  mode = colorMode;
  enabled = on;
  const [p1, p2] = colorMode === 'rank' ? style.pal : [style.pal[0], style.pal[0]];
  const ck = CHAMP[colorMode];
  AURA_RIM.uAuraCol1.value.setHex(p1.mid);
  AURA_RIM.uAuraCol2.value.setHex(p2.mid);
  AURA_RIM.uAuraRim.value.set(style.rim[0], on ? style.rim[1] : 0, style.rim[2], on ? style.rim[3] : 0);
  AURA_RIM.uAuraEye.value.set(style.eye[0], on ? style.eye[1] : 0, ck.glow);
  for (const pool of pools) pool.applyLook(p1, p2);
}

export function auraLook(): { style: Style; mode: AuraColorMode; enabled: boolean } {
  return { style, mode, enabled };
}

// ------------------------------------------------------------ пул частиц

const _wp = new THREE.Vector3();
const _wn = new THREE.Vector3();
const _fw = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/** Пул частиц всех аур: begin(dt) → add() на каждую элитку → end(). Одна отрисовка, одна программа. */
export class EliteAura {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly iA: THREE.InstancedBufferAttribute;
  private readonly iB: THREE.InstancedBufferAttribute;
  // состояние частиц (живые — первые n)
  private n = 0;
  private readonly pos = new Float32Array(AURA_CAP * 3);
  private readonly vel = new Float32Array(AURA_CAP * 3);
  private readonly age = new Float32Array(AURA_CAP);
  private readonly life = new Float32Array(AURA_CAP);
  private readonly s0 = new Float32Array(AURA_CAP);
  private readonly s1 = new Float32Array(AURA_CAP);
  private readonly seed = new Float32Array(AURA_CAP);
  private readonly shape = new Uint8Array(AURA_CAP);
  private readonly tier = new Uint8Array(AURA_CAP);
  private readonly sw = new Float32Array(AURA_CAP);
  private readonly pose: MobPose = newPose();
  private readonly bones = Array.from({ length: BONES.length }, () => new THREE.Matrix4());
  private readonly boneOk = new Uint8Array(BONES.length);
  private dt = 0;
  private time = 0;
  private qualityK = 1;
  /** Источник текущей особи: 0 — модель, 1 — желейка, 2 — хитбокс (hullR, hullH) */
  private src = 0;
  private hullR = 1;
  private hullH = 1;

  constructor(parent: THREE.Object3D) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(quad.index);
    geo.setAttribute('position', quad.getAttribute('position'));
    this.iA = new THREE.InstancedBufferAttribute(new Float32Array(AURA_CAP * 4), 4);
    this.iB = new THREE.InstancedBufferAttribute(new Float32Array(AURA_CAP * 4), 4);
    this.iA.setUsage(THREE.DynamicDrawUsage);
    this.iB.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iA', this.iA);
    geo.setAttribute('iB', this.iB);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uE0: { value: new THREE.Color() }, uE1: { value: new THREE.Color() }, uE2: { value: new THREE.Color() },
        uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() },
        uAlpha: { value: 1 }, uGlow: { value: 1 }, uChampGlow: { value: 1 }, uStretch: { value: 1 }, uSparkStretch: { value: 1.7 }, uFlameCore: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'elite-aura';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    parent.add(this.mesh);
    pools.add(this);
    const [p1, p2] = mode === 'rank' ? style.pal : [style.pal[0], style.pal[0]];
    this.applyLook(p1, p2);
  }

  /** Частиц в последнем кадре */
  get count(): number {
    return this.n;
  }

  /** @internal — из setAuraLook */
  applyLook(p1: Pal, p2: Pal): void {
    const u = this.mat.uniforms;
    (u.uE0.value as THREE.Color).setHex(p1.core);
    (u.uE1.value as THREE.Color).setHex(p1.mid);
    (u.uE2.value as THREE.Color).setHex(p1.deep);
    (u.uC0.value as THREE.Color).setHex(p2.core);
    (u.uC1.value as THREE.Color).setHex(p2.mid);
    (u.uC2.value as THREE.Color).setHex(p2.deep);
    u.uAlpha.value = style.alpha;
    u.uGlow.value = style.glow;
    u.uChampGlow.value = CHAMP[mode].glow;
    u.uStretch.value = style.stretch;
    u.uSparkStretch.value = style.shape === SHAPE_SPARK ? style.stretch : 1.7;
    u.uFlameCore.value = style.core ?? 0;
  }

  /**
   * Качество графики: на низком частиц втрое меньше, на среднем — на четверть (как MobRenderer.setQuality: auto — по
   * скорости машины).
   */
  setQuality(q: Quality, slow = false): void {
    const tier = q === 'auto' ? (slow ? 'low' : 'medium') : q;
    this.qualityK = tier === 'low' ? 0.35 : tier === 'medium' ? 0.75 : 1;
  }

  /** Начало кадра: состарить и сдвинуть живые частицы, мёртвые убрать. camPos — откуда смотрят (край силуэта). */
  begin(dt: number, camPos: THREE.Vector3): void {
    this.dt = dt;
    this.time += dt;
    AURA_RIM.uAuraTime.value = this.time;
    this.mat.uniforms.uTime.value = this.time;
    _cam.copy(camPos);
    if (dt <= 0) return;
    const st = style;
    const drag = Math.exp(-st.drag * dt);
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const age = this.age[i] + dt;
      if (age >= this.life[i]) continue;
      const i3 = i * 3;
      let vx = this.vel[i3] * drag;
      let vy = this.vel[i3 + 1] * drag + st.lift * dt;
      let vz = this.vel[i3 + 2] * drag;
      if (this.shape[i] !== SHAPE_EYE) {
        // колыхание вбок: у дыма — медленные завитки, у искр — зигзаг
        const ph = age * (this.shape[i] === SHAPE_SPARK ? 9 : 3.2) + this.seed[i] * 40;
        vx += Math.sin(ph) * this.sw[i] * dt * 6;
        vz += Math.cos(ph * 0.8) * this.sw[i] * dt * 6;
      }
      const w3 = w * 3;
      this.pos[w3] = this.pos[i3] + vx * dt;
      this.pos[w3 + 1] = this.pos[i3 + 1] + vy * dt;
      this.pos[w3 + 2] = this.pos[i3 + 2] + vz * dt;
      this.vel[w3] = vx;
      this.vel[w3 + 1] = vy;
      this.vel[w3 + 2] = vz;
      this.age[w] = age;
      this.life[w] = this.life[i];
      this.s0[w] = this.s0[i];
      this.s1[w] = this.s1[i];
      this.seed[w] = this.seed[i];
      this.shape[w] = this.shape[i];
      this.tier[w] = this.tier[i];
      this.sw[w] = this.sw[i];
      w++;
    }
    this.n = w;
  }

  /**
   * Аура одной элитки в кадр. src — модель (MobDef), AURA_JELLY или хитбокс (AuraHull, осадные GLB); root — корень особи
   * (mobRoot, с масштабом ступени) или у желейки — матрица тела; anim — та же поза, что у модели; tier — 1 элита, 2 чемпион;
   * scale — масштаб ступени (ELITE_SCALE). Дальние элитки рождают меньше частиц (от 22 м), на низком качестве — ещё меньше.
   */
  add(src: AuraSource, root: THREE.Matrix4, anim: MobAnim | null, tier: number, scale: number): void {
    if (!enabled || tier <= 0 || this.dt <= 0) return;
    const jelly = src === AURA_JELLY;
    const hull = typeof src === 'object' && 'hull' in src ? src : null;
    const def = typeof src === 'object' && !('hull' in src) ? src : null;
    this.src = jelly ? 1 : hull ? 2 : 0;
    if (hull) {
      this.hullR = hull.r;
      this.hullH = hull.h;
    }
    const surf = def ? surfaceOf(def) : hull ? hullSurface() : jellySurface();
    if (!surf.n) return;
    const st = style;
    const champ = tier >= 2;
    const ck = CHAMP[mode];
    const height = def ? def.height : hull ? hull.h : BODY_H;
    const hk = Math.sqrt(Math.max(0.6, height) / 1.6);
    // даль: до 22 м — всё, дальше реже (не меньше четверти), языки чуть крупнее — чтобы читалось издалека
    const e = root.elements;
    const dist = Math.hypot(e[12] - _cam.x, e[13] - _cam.y, e[14] - _cam.z);
    const lod = (dist <= 22 ? 1 : Math.max(0.25, Math.pow(22 / dist, 1.2))) * this.qualityK;
    const sizeK = Math.sqrt(scale) * hk * (champ ? ck.size : 1) * (1 + 0.35 * (1 - Math.min(1, lod)));
    const riseK = Math.sqrt(scale) * hk * (champ ? ck.rise : 1);
    this.boneOk.fill(0);
    if (def && anim) {
      for (const b of BONES) this.pose[b].identity();
      def.pose(anim, this.pose);
    }
    // сколько родить в этот кадр: дробная часть — случаем
    const want = st.rate * hk * scale * (champ ? ck.rate : 1) * lod * this.dt;
    let count = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
    while (count-- > 0 && this.n < AURA_CAP) {
      // из трёх случайных точек — та, что ближе к краю силуэта (нормаль поперёк взгляда); у дыма — ещё и пониже
      let best = -1;
      let bestScore = Infinity;
      for (let t = 0; t < 3; t++) {
        const k = (Math.random() * surf.n) | 0;
        this.world(surf, k, root, _tmp, _n);
        const toCam = _c.subVectors(_cam, _tmp).normalize();
        let score = Math.abs(_n.dot(toCam));
        if (st.low) score += (_tmp.y - root.elements[13]) / Math.max(0.5, height * scale) * 0.9;
        if (score < bestScore) {
          bestScore = score;
          best = k;
          _wp.copy(_tmp);
          _wn.copy(_n);
        }
      }
      if (best < 0) break;
      const i = this.n++;
      const i3 = i * 3;
      const rise = (st.rise[0] + Math.random() * (st.rise[1] - st.rise[0])) * riseK;
      const push = st.push * (0.5 + Math.random() * 0.8) * Math.sqrt(scale);
      this.pos[i3] = _wp.x + _wn.x * 0.03 * scale;
      this.pos[i3 + 1] = _wp.y + _wn.y * 0.03 * scale;
      this.pos[i3 + 2] = _wp.z + _wn.z * 0.03 * scale;
      this.vel[i3] = _wn.x * push + (Math.random() - 0.5) * 0.2;
      this.vel[i3 + 1] = Math.max(0, _wn.y) * push * 0.5 + rise;
      this.vel[i3 + 2] = _wn.z * push + (Math.random() - 0.5) * 0.2;
      this.age[i] = 0;
      this.life[i] = (st.life[0] + Math.random() * (st.life[1] - st.life[0])) * (champ ? Math.sqrt(ck.rise) : 1);
      const sz = 0.75 + Math.random() * 0.5;
      this.s0[i] = st.size[0] * sizeK * sz;
      this.s1[i] = st.size[1] * sizeK * sz;
      this.seed[i] = Math.random();
      this.shape[i] = st.shape;
      this.tier[i] = champ ? 2 : 1;
      this.sw[i] = st.swirl * (0.4 + Math.random() * 0.8) * Math.sqrt(scale);
    }
    // искры сверх пламени (A2): из любой точки тела, быстро вверх с зигзагом
    const wantS = (st.sparks ?? 0) * hk * scale * (champ ? ck.rate : 1) * lod * this.dt;
    let cs = Math.floor(wantS) + (Math.random() < wantS % 1 ? 1 : 0);
    while (cs-- > 0 && this.n < AURA_CAP) {
      this.world(surf, (Math.random() * surf.n) | 0, root, _wp, _wn);
      const i = this.n++;
      const i3 = i * 3;
      this.pos[i3] = _wp.x + _wn.x * 0.05 * scale;
      this.pos[i3 + 1] = _wp.y + _wn.y * 0.05 * scale;
      this.pos[i3 + 2] = _wp.z + _wn.z * 0.05 * scale;
      this.vel[i3] = _wn.x * 0.5 + (Math.random() - 0.5) * 0.3;
      this.vel[i3 + 1] = (1.8 + Math.random() * 1.4) * riseK;
      this.vel[i3 + 2] = _wn.z * 0.5 + (Math.random() - 0.5) * 0.3;
      this.age[i] = 0;
      this.life[i] = 0.55 + Math.random() * 0.5;
      this.s0[i] = 0.1 * sizeK;
      this.s1[i] = 0.04 * sizeK;
      this.seed[i] = Math.random();
      this.shape[i] = SHAPE_SPARK;
      this.tier[i] = champ ? 2 : 1;
      this.sw[i] = 0.6 * Math.sqrt(scale);
    }
    // след глаз (вариант A): короткие огоньки у глаз — на ходу тянутся полосой; издалека не нужен
    if (st.eyes > 0 && surf.eyeBone.length && dist < 35 && this.qualityK > 0.5) {
      for (let ei = 0; ei < surf.eyeBone.length; ei++) {
        const wantE = st.eyes * (champ ? 1.3 : 1) * this.dt;
        let ce = Math.floor(wantE) + (Math.random() < wantE % 1 ? 1 : 0);
        if (!ce) continue;
        const m = this.boneMatrix(surf.eyeBone[ei], root);
        _wp.set(surf.eyeP[ei * 3], surf.eyeP[ei * 3 + 1], surf.eyeP[ei * 3 + 2]).applyMatrix4(m);
        // чуть вперёд от лица, чтобы огонёк не прятался в глазнице
        _fw.set(m.elements[8], m.elements[9], m.elements[10]).normalize().multiplyScalar(jelly ? -0.05 * scale : 0.05 * scale);
        while (ce-- > 0 && this.n < AURA_CAP) {
          const i = this.n++;
          const i3 = i * 3;
          this.pos[i3] = _wp.x + _fw.x;
          this.pos[i3 + 1] = _wp.y + _fw.y;
          this.pos[i3 + 2] = _wp.z + _fw.z;
          this.vel[i3] = (Math.random() - 0.5) * 0.1;
          this.vel[i3 + 1] = 0.25;
          this.vel[i3 + 2] = (Math.random() - 0.5) * 0.1;
          this.age[i] = 0;
          this.life[i] = 0.32 + Math.random() * 0.12;
          this.s0[i] = 0.2 * sizeK;
          this.s1[i] = 0.06 * sizeK;
          this.seed[i] = Math.random();
          this.shape[i] = SHAPE_EYE;
          this.tier[i] = champ ? 2 : 1;
          this.sw[i] = 0;
        }
      }
    }
  }

  /** Конец кадра: живые частицы — в буферы, одной отрисовкой */
  end(): void {
    const n = this.n;
    const a = this.iA.array as Float32Array;
    const b = this.iB.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const k = this.age[i] / this.life[i];
      const i4 = i * 4;
      const i3 = i * 3;
      a[i4] = this.pos[i3];
      a[i4 + 1] = this.pos[i3 + 1];
      a[i4 + 2] = this.pos[i3 + 2];
      a[i4 + 3] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      b[i4] = k;
      b[i4 + 1] = this.seed[i];
      b[i4 + 2] = this.tier[i];
      b[i4 + 3] = this.shape[i];
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.iA.clearUpdateRanges();
      this.iA.addUpdateRange(0, n * 4);
      this.iA.needsUpdate = true;
      this.iB.clearUpdateRanges();
      this.iB.addUpdateRange(0, n * 4);
      this.iB.needsUpdate = true;
    }
  }

  /** Убрать все частицы (выход из режима, смена вида) */
  clear(): void {
    this.n = 0;
    this.end();
  }

  dispose(): void {
    pools.delete(this);
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }

  /** Матрица кости в мире (корень × кость), по разу на кость за особь */
  private boneMatrix(bone: number, root: THREE.Matrix4): THREE.Matrix4 {
    if (this.src !== 0) return root;
    const m = this.bones[bone];
    if (!this.boneOk[bone]) {
      m.multiplyMatrices(root, this.pose[BONES[bone]]);
      this.boneOk[bone] = 1;
    }
    return m;
  }

  /** Точка k поверхности и её нормаль — в мир */
  private world(surf: Surface, k: number, root: THREE.Matrix4, outP: THREE.Vector3, outN: THREE.Vector3): void {
    const m = this.boneMatrix(surf.bone[k], root);
    const hr = this.src === 2 ? this.hullR : 1;
    const hh = this.src === 2 ? this.hullH : 1;
    outP.set(surf.p[k * 3] * hr, surf.p[k * 3 + 1] * hh, surf.p[k * 3 + 2] * hr).applyMatrix4(m);
    outN.set(surf.nrm[k * 3], surf.nrm[k * 3 + 1], surf.nrm[k * 3 + 2]).transformDirection(m);
  }
}
