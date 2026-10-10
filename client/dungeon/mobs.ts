// «Подземелье»: сотни врагов — одна отрисовка на вид. Модель врага — жёсткие части с анимацией узлов (README-mobs):
// при загрузке все клипы сэмплируются по кадрам (24 к/с) в позы частей и кладутся в маленькую текстуру
// (строка — кадр, по 3 текселя на часть: матрица 3×4 относительно корня). Части склеены в одну геометрию с номером
// части в вершине, цвета материалов — в цветах вершин (свечение глаз и шероховатость — тоже по вершинам).
// В шейдере вершина берёт матрицу своей части из двух строк текстуры и смешивает их (между кадрами или «бег + вздрог»).
// На экземпляр — только матрица корня и vec4 (строка A, строка B, доля B, вспышка). Шейдер один на всех врагов.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { DungeonAssets, MobModel } from './assets.ts';
import type { MobKind } from './view.ts';

const FPS = 24;

export type ClipKey = 'walk' | 'attack' | 'hit' | 'death' | 'special' | 'emerge';

interface ClipRows {
  start: number;
  frames: number;
  loop: boolean;
  duration: number;
}

interface Baked {
  geo: THREE.BufferGeometry;
  tex: THREE.DataTexture;
  clips: Partial<Record<ClipKey, ClipRows>>;
}

/** Вид врага → модель и масштаб */
const KIND_MODEL: Record<MobKind, { model: MobModel; scale: number; cap: number }> = {
  rat: { model: 'rat', scale: 1, cap: 340 },
  bat: { model: 'bat', scale: 1, cap: 160 },
  slime: { model: 'slug', scale: 1.1, cap: 160 },
  slimelet: { model: 'slug', scale: 0.62, cap: 0 },
  shroom: { model: 'shroom', scale: 1, cap: 120 },
  beetle: { model: 'beetle', scale: 1, cap: 120 },
  spitter: { model: 'spitter', scale: 1, cap: 100 },
  larva: { model: 'larva', scale: 1.15, cap: 90 },
  barrel: { model: 'cooper', scale: 1, cap: 8 },
  shaman: { model: 'shaman', scale: 1.05, cap: 8 },
};

/** Имена клипов в GLB: <модель>_<действие> */
const CLIP_NAMES: Record<MobModel, Partial<Record<ClipKey, string>>> = {
  rat: { walk: 'rat_walk', attack: 'rat_attack', hit: 'rat_hit', death: 'rat_death' },
  bat: { walk: 'bat_fly', attack: 'bat_attack', hit: 'bat_hit', death: 'bat_death' },
  slug: { walk: 'slug_walk', attack: 'slug_attack', hit: 'slug_hit', death: 'slug_death' },
  shroom: { walk: 'shroom_walk', attack: 'shroom_attack', hit: 'shroom_hit', death: 'shroom_death' },
  beetle: { walk: 'beetle_walk', attack: 'beetle_attack', hit: 'beetle_hit', death: 'beetle_death', special: 'beetle_shield_bash' },
  spitter: { walk: 'spitter_walk', attack: 'spitter_attack', hit: 'spitter_hit', death: 'spitter_death', special: 'spitter_spit' },
  larva: { walk: 'larva_walk', attack: 'larva_attack', hit: 'larva_hit', death: 'larva_death', emerge: 'larva_emerge' },
  cooper: { walk: 'cooper_walk', attack: 'cooper_attack', hit: 'cooper_hit', death: 'cooper_death', special: 'cooper_charge' },
  shaman: { walk: 'shaman_walk', attack: 'shaman_attack', hit: 'shaman_hit', death: 'shaman_death', special: 'shaman_cast' },
};

/** Скорость, при которой цикл ходьбы не скользит (м/с) — для темпа шага */
export const WALK_REF: Record<MobKind, number> = {
  rat: 3.6, bat: 4.5, slime: 1.8, slimelet: 2.6, shroom: 1.9, beetle: 2.4, spitter: 2.2, larva: 4.2, barrel: 2.2, shaman: 1.8,
};

/** Длительность клипа (с) — для того, кто держит трупы */
export function clipDuration(m: MobRenderer, kind: MobKind, key: ClipKey): number {
  return m.duration(kind, key);
}

function bake(gltf: GLTF, model: MobModel): Baked {
  const root = gltf.scene.getObjectByName(model) ?? gltf.scene.children[0];
  const animated = new Set<string>();
  for (const c of gltf.animations) for (const t of c.tracks) animated.add(THREE.PropertyBinding.parseTrackName(t.name).nodeName);
  const joints: THREE.Object3D[] = [root];
  root.traverse((o) => {
    if (o !== root && animated.has(o.name)) joints.push(o);
  });
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();

  // геометрия: каждая часть — в системе своего сустава, номер части в вершине
  const geos: THREE.BufferGeometry[] = [];
  const rel = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let j: THREE.Object3D | null = mesh;
    while (j && !joints.includes(j)) j = j.parent;
    const ji = j ? joints.indexOf(j) : 0;
    const joint = joints[ji];
    rel.copy(joint.matrixWorld).invert().multiply(mesh.matrixWorld);
    const g = mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(rel);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const emi = new Float32Array(n * 3);
    const rough = new Float32Array(n);
    const part = new Float32Array(n);
    const c = mat.color ?? new THREE.Color(0.5, 0.5, 0.5);
    const e = mat.emissive ? mat.emissive.clone().multiplyScalar(Math.min(3, mat.emissiveIntensity ?? 1)) : new THREE.Color(0, 0, 0);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      emi[i * 3] = e.r;
      emi[i * 3 + 1] = e.g;
      emi[i * 3 + 2] = e.b;
      rough[i] = mat.roughness ?? 0.7;
      part[i] = ji;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aEmi', new THREE.BufferAttribute(emi, 3));
    g.setAttribute('aRough', new THREE.BufferAttribute(rough, 1));
    g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
    geos.push(g.index ? g : g);
  });
  const indexed = geos.every((g) => g.index);
  const geo = mergeGeometries(indexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  geo.computeBoundingSphere();

  // позы: кадры всех клипов подряд
  const mixer = new THREE.AnimationMixer(root);
  const clips: Partial<Record<ClipKey, ClipRows>> = {};
  const names = CLIP_NAMES[model];
  const order: [ClipKey, THREE.AnimationClip][] = [];
  for (const key of Object.keys(names) as ClipKey[]) {
    const clip = THREE.AnimationClip.findByName(gltf.animations, names[key]!);
    if (clip) order.push([key, clip]);
  }
  let rows = 0;
  for (const [key, clip] of order) {
    const frames = Math.max(1, Math.round(clip.duration * FPS)) + 1;
    clips[key] = { start: rows, frames, loop: key === 'walk', duration: clip.duration };
    rows += frames;
  }
  rows = Math.max(1, rows);
  const width = joints.length * 3;
  const data = new Float32Array(width * rows * 4);
  const m = new THREE.Matrix4();
  for (const [key, clip] of order) {
    const info = clips[key]!;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.reset().play();
    for (let f = 0; f < info.frames; f++) {
      mixer.setTime(Math.min(f / FPS, clip.duration - 1e-4));
      root.updateMatrixWorld(true);
      for (let j = 0; j < joints.length; j++) {
        m.copy(rootInv).multiply(joints[j].matrixWorld);
        const e = m.elements;
        const o = ((info.start + f) * width + j * 3) * 4;
        // строки матрицы (elements — по столбцам)
        data[o] = e[0]; data[o + 1] = e[4]; data[o + 2] = e[8]; data[o + 3] = e[12];
        data[o + 4] = e[1]; data[o + 5] = e[5]; data[o + 6] = e[9]; data[o + 7] = e[13];
        data[o + 8] = e[2]; data[o + 9] = e[6]; data[o + 10] = e[10]; data[o + 11] = e[14];
      }
    }
    action.stop();
  }
  const tex = new THREE.DataTexture(data, width, rows, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { geo, tex, clips };
}

const VERT_HEAD = /* glsl */ `
attribute float aPart;
attribute vec3 aEmi;
attribute float aRough;
attribute vec4 aAnim;
attribute float aRage;
uniform highp sampler2D uPose;
varying vec3 vEmi;
varying float vRough;
varying float vFlash;
varying float vRage;
mat4 dgPose(int row, int part) {
  int x = part * 3;
  vec4 r0 = texelFetch(uPose, ivec2(x, row), 0);
  vec4 r1 = texelFetch(uPose, ivec2(x + 1, row), 0);
  vec4 r2 = texelFetch(uPose, ivec2(x + 2, row), 0);
  return mat4(r0.x, r1.x, r2.x, 0.0, r0.y, r1.y, r2.y, 0.0, r0.z, r1.z, r2.z, 0.0, r0.w, r1.w, r2.w, 1.0);
}
`;

/** Время для пульса озверения (одно на все виды) */
const uTime = { value: 0 };

/**
 * Озверение (aRage: целая часть — уровень 0…3, дробная — вспышка в момент озверения, 0…0,9): глаза и светящиеся
 * части краснеют и горят ярче с каждым уровнем, тело слегка уходит в сливово-красный, на 3-м — пульс; вспышка — алая.
 */
/**
 * Читаемость на узорном полу: светлая кромка по силуэту (френель в видовых координатах — бока светятся, макушка нет).
 */
const RIM_FRAG = /* glsl */ `
  float dgF = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
  totalEmissiveRadiance += vec3(1.0, 0.86, 0.72) * pow(dgF, 2.6) * 0.55;
`;

const RAGE_FRAG = /* glsl */ `
  float dgLv = floor(vRage + 0.001);
  float dgRf = fract(vRage + 0.001) / 0.9;
  float dgPulse = dgLv > 2.5 ? 0.5 + 0.5 * sin(uTime * 7.0) : 0.0;
  vec3 dgRed = vec3(1.0, 0.1, 0.25);
  float dgEye = max(vEmi.r, max(vEmi.g, vEmi.b));
  totalEmissiveRadiance += dgRed * dgEye * dgLv * 1.6;
  totalEmissiveRadiance += dgRed * (0.05 * dgLv * dgLv / 3.0 + 0.13 * dgPulse) + vec3(1.0, 0.3, 0.45) * dgRf * 0.9;
`;

function mobMaterial(tex: THREE.DataTexture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPose = { value: tex };
    sh.uniforms.uTime = uTime;
    sh.vertexShader = VERT_HEAD + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `
        int dgPart = int(aPart + 0.5);
        mat4 dgM = dgPose(int(aAnim.x + 0.5), dgPart) * (1.0 - aAnim.z) + dgPose(int(aAnim.y + 0.5), dgPart) * aAnim.z;
        vec3 objectNormal = mat3(dgM) * normal;
        vEmi = aEmi; vRough = aRough; vFlash = aAnim.w; vRage = aRage;
      `)
      .replace('#include <begin_vertex>', 'vec3 transformed = (dgM * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uTime;\nvarying vec3 vEmi;\nvarying float vRough;\nvarying float vFlash;\nvarying float vRage;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.05, 0.14), 0.2 * floor(vRage + 0.001));\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.97, 0.92), vFlash);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = vRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vEmi + diffuseColor.rgb * 0.22 + vec3(0.9, 0.85, 0.8) * vFlash;\n' + RIM_FRAG + RAGE_FRAG);
  };
  mat.customProgramCacheKey = () => 'dg-mob-vat';
  return mat;
}

interface KindMesh {
  kind: MobKind;
  baked: Baked;
  mesh: THREE.InstancedMesh;
  anim: THREE.InstancedBufferAttribute;
  rage: THREE.InstancedBufferAttribute;
  n: number;
  cap: number;
  scale: number;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Отрисовка всех врагов: begin → push на каждого живого и каждый труп → end */
export class MobRenderer {
  readonly root = new THREE.Group();
  private readonly kinds = new Map<MobKind, KindMesh>();
  private readonly bakedBy = new Map<MobModel, Baked>();

  constructor(assets: DungeonAssets) {
    this.root.name = 'dg-mobs';
    for (const kind of Object.keys(KIND_MODEL) as MobKind[]) {
      const spec = KIND_MODEL[kind];
      let baked = this.bakedBy.get(spec.model);
      if (!baked) {
        baked = bake(assets.mobs[spec.model], spec.model);
        this.bakedBy.set(spec.model, baked);
      }
      // слизнята рисуются тем же мешем, что слизни (меньше)
      if (spec.cap === 0) continue;
      const cap = spec.cap + (kind === 'slime' ? 120 : 0);
      const geo = baked.geo.clone();
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      anim.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAnim', anim);
      const rage = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      rage.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aRage', rage);
      const mesh = new THREE.InstancedMesh(geo, mobMaterial(baked.tex), cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.name = `dg-mob-${kind}`;
      this.root.add(mesh);
      this.kinds.set(kind, { kind, baked, mesh, anim, rage, n: 0, cap, scale: spec.scale });
    }
  }

  private target(kind: MobKind): KindMesh | undefined {
    return this.kinds.get(kind === 'slimelet' ? 'slime' : kind);
  }

  duration(kind: MobKind, key: ClipKey): number {
    return this.target(kind)?.baked.clips[key]?.duration ?? 1;
  }

  has(kind: MobKind, key: ClipKey): boolean {
    return !!this.target(kind)?.baked.clips[key];
  }

  begin(): void {
    uTime.value = performance.now() / 1000;
    for (const k of this.kinds.values()) k.n = 0;
  }

  /**
   * Один враг. t — время клипа, с (цикл ходьбы крутится сам); over — второй клип поверх с весом w (вздрог при
   * попадании); flash 0…1 — белая вспышка; s — масштаб сверх обычного (элиты из сундука, рождение); rage — озверение
   * (уровень 0…3, дробная часть — вспышка озверения).
   */
  push(kind: MobKind, x: number, y: number, z: number, yaw: number, key: ClipKey, t: number, flash: number, s = 1, over: ClipKey | null = null, overT = 0, overW = 0, rage = 0): void {
    const km = this.target(kind);
    if (!km || km.n >= km.cap) return;
    const i = km.n++;
    const scale = (kind === 'slimelet' ? KIND_MODEL.slimelet.scale : km.scale) * s;
    tmpP.set(x, y, z);
    tmpQ.setFromAxisAngle(UP, yaw);
    tmpS.set(scale, scale, scale);
    tmpM.compose(tmpP, tmpQ, tmpS);
    km.mesh.setMatrixAt(i, tmpM);
    const clip = km.baked.clips[key] ?? km.baked.clips.walk;
    let a = 0;
    let b = 0;
    let f = 0;
    if (clip) {
      const fr = frameAt(clip, t);
      a = clip.start + Math.floor(fr);
      b = clip.start + Math.min(clip.frames - 1, Math.floor(fr) + 1);
      f = fr - Math.floor(fr);
    }
    const oc = over ? km.baked.clips[over] : undefined;
    if (oc && overW > 0) {
      // поверх: строка A — текущий кадр основного клипа, B — кадр второго, доля — вес
      const fr = frameAt(oc, overT);
      b = oc.start + Math.round(fr);
      f = overW;
    }
    const arr = km.anim.array as Float32Array;
    arr[i * 4] = a;
    arr[i * 4 + 1] = b;
    arr[i * 4 + 2] = f;
    arr[i * 4 + 3] = flash;
    (km.rage.array as Float32Array)[i] = rage;
  }

  end(): void {
    for (const k of this.kinds.values()) {
      k.mesh.count = k.n;
      k.mesh.visible = k.n > 0;
      if (k.n > 0) {
        k.mesh.instanceMatrix.clearUpdateRanges();
        k.mesh.instanceMatrix.addUpdateRange(0, k.n * 16);
        k.mesh.instanceMatrix.needsUpdate = true;
        k.anim.clearUpdateRanges();
        k.anim.addUpdateRange(0, k.n * 4);
        k.anim.needsUpdate = true;
        k.rage.clearUpdateRanges();
        k.rage.addUpdateRange(0, k.n);
        k.rage.needsUpdate = true;
      }
    }
  }

  /** Для прогрева шейдера: показать по одному экземпляру каждого вида */
  warm(x: number, z: number): void {
    this.begin();
    for (const k of this.kinds.values()) this.push(k.kind, x, -50, z, 0, 'walk', 0, 0);
    this.end();
  }

  get drawn(): number {
    let n = 0;
    for (const k of this.kinds.values()) n += k.n;
    return n;
  }

  dispose(): void {
    for (const k of this.kinds.values()) {
      k.mesh.geometry.dispose();
      (k.mesh.material as THREE.Material).dispose();
    }
    for (const b of this.bakedBy.values()) {
      b.geo.dispose();
      b.tex.dispose();
    }
  }
}

function frameAt(clip: ClipRows, t: number): number {
  const last = clip.frames - 1;
  if (clip.loop) {
    const d = clip.duration;
    const tt = ((t % d) + d) % d;
    return Math.min(last, (tt / d) * last);
  }
  return Math.max(0, Math.min(last, t * FPS));
}
