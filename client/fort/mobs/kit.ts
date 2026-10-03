// Мобы «Крепости» — общий договор моделей. Модели рисуют помощники (каждый в своём файле), крепость вставляет их
// в орду. Модель — набор жёстких частей, каждая висит на «кости». Поза — матрицы костей относительно корня:
// корень стоит ногами на y = 0 и смотрит по +Z, единицы — метры. Орду рисует MobRenderer инстансами
// (одна часть одной модели = один InstancedMesh), превью и стенд — обычной группой (buildPreview).
// Договор только расширяем: не переименовывай и не меняй смысл полей — по нему пишут три помощника сразу.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BONES = ['body', 'head', 'armL', 'armR', 'legL', 'legR', 'tail', 'wingL', 'wingR', 'prop', 'extra'] as const;
export type BoneName = (typeof BONES)[number];

/** Длина шага походки, м: anim.gait проходит 0…1 за столько пути. Модель с короткими ногами делает за период N шагов (N целое). */
export const MOB_STRIDE = 1.25;

/** Общие цвета войска Барона Варенья: фиолетовые пятна и капли варенья, светящиеся сиреневые глаза (часть glow) */
export const ARMY = {
  jam: 0x7e2fa8,
  jamDark: 0x52206f,
  jamLight: 0xb06ad8,
  eye: 0xc17bff,
} as const;

/** Часть модели: геометрия с цветами вершин (атрибут color), в осях своей кости (точка подвеса — начало координат) */
export interface MobPart {
  bone: BoneName;
  geo: THREE.BufferGeometry;
  /** Светится сама: глаза, фитиль, ядро босса — не темнеет в тени */
  glow?: boolean;
}

/** Всё, из чего строится поза моба в кадре */
export interface MobAnim {
  /** Секунды с появления: дыхание, моргание, покачивание */
  t: number;
  /** Фаза шага 0…1, растёт с пройденным путём (рендерер сам интегрирует скорость) */
  gait: number;
  /** Скорость по земле сейчас, м/с */
  speed: number;
  /** Состояние с сервера — ZS_* из shared/fort.ts */
  st: number;
  /**
   * Секунд в этом состоянии. В ZS_ATTACK — секунд с последнего удара: крепость обнуляет на каждом ударе (ворота —
   * раз в 0,5 с, игрок — раз в 0,8 с), так что замах начинается с 0 и опускается к ~0,2 с.
   */
  stT: number;
  /** 1 → 0 после попадания: вздрогнуть, отшатнуться */
  hit: number;
  /** 0 — жив, дальше до 1 — анимация гибели (упал, лопнул, рассыпался) */
  die: number;
  /** 0…1, постоянное для особи: разброс роста, походки, мелочей */
  seed: number;
  /** В ярости (ZF_RAGE): босс или элита разозлены */
  rage: boolean;
  /** Признаки ZF_* из снимка (shared/fortnet.ts): щит цел, несёт бочку, светится, экипаж, ступень. Может не быть — тогда 0 */
  flags?: number;
  /**
   * Байт stage из снимка (ZombieSnap.stage) как есть, смысл — по виду: у босса — фаза 1…3, у щупальца — номер,
   * у лодки — сколько экипажа ещё в ней (столько пассажиров и показать). Может не быть — тогда 0.
   */
  stage?: number;
}

/**
 * Матрицы костей. Масштаб может быть неравномерным и у костей (сплющился, раздулся), и у корня особи (босс
 * протискивается в ворота): нормали инстансов считаются точно. Только не ноль и не зеркало — бери ≥ 0,02.
 */
export type MobPose = Record<BoneName, THREE.Matrix4>;

export interface MobDef {
  /** Латиницей, уникально: 'walker-mushroom' */
  id: string;
  /** Как зовут на русском: «Грибник» */
  name: string;
  /** Какие виды врагов (Z_* из shared/fortkinds.ts) рисует эта модель */
  kinds: number[];
  /** Доля среди вариантов одного вида (выбор по seed); по умолчанию 1 */
  weight?: number;
  /** Рост, м — сверяется с хитбоксом вида на стенде */
  height: number;
  parts: MobPart[];
  /**
   * Заполняет матрицы костей (относительно корня) для этой позы. Кости, на которых нет частей, можно не трогать.
   * Вызывается каждый кадр для каждой особи — без выделений памяти (бери заранее созданные векторы).
   */
  pose(a: MobAnim, out: MobPose): void;
}

export function newPose(): MobPose {
  const p = {} as MobPose;
  for (const b of BONES) p[b] = new THREE.Matrix4();
  return p;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Поставить кость: перенос, поворот (порядок YXZ, радианы), масштаб — без выделений памяти */
export function setBone(m: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(s, s, s);
  return m.compose(_p, _q, _s);
}

/** То же с разным масштабом по осям (сжаться при прыжке, раздуться перед взрывом) */
export function setBoneS(m: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return m.compose(_p, _q, _s);
}

const _local = new THREE.Matrix4();

/** Дочерняя кость: m = parent × (перенос, поворот YXZ, масштаб) — голова на теле, кисть на руке; без выделений памяти */
export function setChild(m: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.Matrix4 {
  setBone(_local, x, y, z, rx, ry, rz, s);
  return m.multiplyMatrices(parent, _local);
}

/** То же с разным масштабом по осям */
export function setChildS(m: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  setBoneS(_local, x, y, z, rx, ry, rz, sx, sy, sz);
  return m.multiplyMatrices(parent, _local);
}

/** Покрасить геометрию одним цветом (атрибут color) — для сборки частей из примитивов */
export function colored(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** Склеить окрашенные куски в одну часть (у всех должны быть position, normal, color и не быть индекса или быть у всех) */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of list) {
    g.deleteAttribute('uv');
    g.deleteAttribute('uv1');
  }
  const out = mergeGeometries(list, false);
  if (!out) throw new Error('mobs: не склеилось — у кусков разные атрибуты');
  return out;
}

/** Вариант вида по seed с учётом weight; null — для вида нет модели (крепость рисует как раньше) */
export function pickVariant(defs: readonly MobDef[], kind: number, seed: number): MobDef | null {
  let total = 0;
  let last: MobDef | null = null;
  for (const d of defs) {
    if (!d.kinds.includes(kind)) continue;
    total += d.weight ?? 1;
    last = d;
  }
  if (total <= 0) return null;
  // seed вне [0, 1) (или NaN) не должен терять модель: прижимаем, а «хвост» отдаём последнему варианту
  let r = (seed >= 0 && seed < 1 ? seed : seed >= 1 ? 0.999999 : 0) * total;
  for (const d of defs) {
    if (!d.kinds.includes(kind)) continue;
    r -= d.weight ?? 1;
    if (r < 0) return d;
  }
  return last;
}

/** Ручки материала моба: вспышка от попадания (в белый) и оттенок (rgb + доля смешивания) для превью без инстансов */
export interface MobFxUniforms {
  uMobFlash: { value: number };
  uMobTint: { value: THREE.Vector4 };
}

// Вспышка и оттенок: у инстансов — атрибуты mobFlash (float) и mobTint (vec4: цвет и доля) на каждую особь,
// у обычной сетки — uniform. Светящиеся части (MOB_GLOW) светятся своим цветом вершин и не темнеют в тени.
const FX_VERTEX_PARS = /* glsl */ `#include <common>
#ifdef USE_INSTANCING
attribute float mobFlash;
attribute vec4 mobTint;
#else
uniform float uMobFlash;
uniform vec4 uMobTint;
#endif
varying float vMobFlash;
varying vec4 vMobTint;`;
const FX_VERTEX = /* glsl */ `#include <color_vertex>
#ifdef USE_INSTANCING
vMobFlash = mobFlash;
vMobTint = mobTint;
#else
vMobFlash = uMobFlash;
vMobTint = uMobTint;
#endif`;
// Нормаль инстанса — присоединённой матрицей (три векторных произведения): точно при любом неравномерном масштабе
// корня и костей вместе с поворотами (у three — приближение без сдвига, в сжатом боссе свет бы поплыл).
const FX_NORMAL = /* glsl */ `vec3 transformedNormal = objectNormal;
#ifdef USE_INSTANCING
mat3 mobIm = mat3( instanceMatrix );
transformedNormal = mat3( cross( mobIm[ 1 ], mobIm[ 2 ] ), cross( mobIm[ 2 ], mobIm[ 0 ] ), cross( mobIm[ 0 ], mobIm[ 1 ] ) ) * transformedNormal;
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
vec3 transformedTangent = objectTangent;
#ifdef USE_INSTANCING
transformedTangent = mat3( instanceMatrix ) * transformedTangent;
#endif
transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`;
const FX_FRAGMENT_PARS = /* glsl */ `#include <common>
varying float vMobFlash;
varying vec4 vMobTint;`;
const FX_FRAGMENT = /* glsl */ `#include <color_fragment>
#ifdef MOB_GLOW
totalEmissiveRadiance *= diffuseColor.rgb;
diffuseColor.rgb *= 0.35;
#else
diffuseColor.rgb = mix( diffuseColor.rgb, vMobTint.rgb, clamp( vMobTint.a, 0.0, 1.0 ) );
#endif
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), clamp( vMobFlash, 0.0, 1.0 ) );
totalEmissiveRadiance += vec3( 0.6 * clamp( vMobFlash, 0.0, 1.0 ) );`;

/**
 * Общий материал моделей: цвета вершин, мягкий блеск игрушки, вспышка от попадания и оттенок (крепость, стенд и превью
 * рисуют одним и тем же). glow — светится цветом вершин (глаза, фитиль, ядро). Ручки для превью — userData.mobFx.
 */
export function mobMaterial(glow = false): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: glow ? 0.4 : 0.62, metalness: 0, emissive: glow ? 0xffffff : 0x000000, emissiveIntensity: glow ? 0.85 : 1 });
  const fx: MobFxUniforms = { uMobFlash: { value: 0 }, uMobTint: { value: new THREE.Vector4(1, 1, 1, 0) } };
  if (glow) mat.defines = { MOB_GLOW: '' };
  mat.userData.mobFx = fx;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMobFlash = fx.uMobFlash;
    shader.uniforms.uMobTint = fx.uMobTint;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', FX_VERTEX_PARS).replace('#include <color_vertex>', FX_VERTEX)
      .replace('#include <defaultnormal_vertex>', FX_NORMAL);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', FX_FRAGMENT_PARS).replace('#include <color_fragment>', FX_FRAGMENT);
  };
  mat.customProgramCacheKey = () => (glow ? 'mob-glow' : 'mob');
  return mat;
}

/** Превью одной особи обычной группой (стенд, превью, отладка). update — каждый кадр; flash 0…1 — вспышка в белый. */
export function buildPreview(def: MobDef): { group: THREE.Group; update(a: MobAnim, flash?: number, tint?: THREE.Color | null, tintMix?: number): void } {
  const group = new THREE.Group();
  const pose = newPose();
  const meshes: Array<{ mesh: THREE.Mesh; bone: BoneName; fx: MobFxUniforms }> = [];
  for (const part of def.parts) {
    const mat = mobMaterial(part.glow);
    const mesh = new THREE.Mesh(part.geo, mat);
    mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    meshes.push({ mesh, bone: part.bone, fx: mat.userData.mobFx as MobFxUniforms });
  }
  return {
    group,
    update(a: MobAnim, flash = 0, tint: THREE.Color | null = null, tintMix = 0.35) {
      def.pose(a, pose);
      for (const { mesh, bone, fx } of meshes) {
        mesh.matrix.copy(pose[bone]);
        mesh.matrixWorldNeedsUpdate = true;
        fx.uMobFlash.value = flash;
        if (tint) fx.uMobTint.value.set(tint.r, tint.g, tint.b, tintMix);
        else fx.uMobTint.value.w = 0;
      }
    },
  };
}
