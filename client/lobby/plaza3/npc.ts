// Жители новой набережной (флаг PLAZA3, WP11; docs/plaza3/tech-foundation.md §5.6): 17 желеек у входов. Модели —
// client/assets/plaza3/npc/<id>.glb (Blender, concepts_blender/plaza3/npc/models): жёсткие части с пивотами, найденные по
// userData.animation_part (body, eyes, lid, hand.L/R, prop / prop.L / prop.R, live, static, tag), клипов нет.
// Все жители склеены в ОДНУ сетку с жёсткими костями (часть = кость, вес 1) и рисуются одним материалом: шероховатость,
// лак и свечение — в атрибуте вершины. Таблички имён — один меш на всех (атлас), тени — один меш пятен, облачка — пул из 3.
// Итого 3 отрисовки + облачка, 2 новые программы (сетка жителей, таблички). Ожидание считается в JS: дыхание и
// покачивание, моргание, ходы цикла (npcdata.ts), взмах рукой подошедшему, поворот к нему, трепет шарфа (часть live).
// Дальше npcFar(дальность из меню) житель прячется (масштаб кости корня → 0): на «Далеко» — вся набережная, на «Близко» —
// 46 м, как зазывалы; дальше 30 м поза считается 8 раз в секунду. Отрисовка одна при любом числе видимых.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BUBBLE_CHARS, BUBBLE_MS } from '../../../shared/lobby.ts';
import { lerpAngle } from '../../../shared/math.ts';
import { ITEMS } from '../../../shared/outfit.ts';
import { metalEnvTexture, softDot } from '../../render/textures.ts';
import { dgStatus } from '../dgstatus.ts';
import { FISH_SEASON } from '../fishseason.ts';
import type { PlazaMode } from '../plaza/index.ts';
import { liveLines, type LiveIn } from '../plaza/live.ts';
import { TOUT_INFO, type ToutKey } from '../plaza/data.ts';
import { DECAL_LIFT } from './floor.ts';
import { p3View } from './perf.ts';
import { P3 } from '../../../shared/plaza3/layout.ts';
import { buildOccluders, openSight, makeFade, decideFade, stepFade, DITHER_FUNCTION, type FadeState } from './visibility.ts';
import { NPC_REQUIRED, NPCS, fashionOfDay, npcHandle, npcStatusLines, toward, type IdleMove, type NpcDef, type NpcHandle, type NpcStatusIn } from './npcdata.ts';

/** Дальше этого расстояния до камеры житель не рисуется на «Близко» (как зазывалы plaza2) */
export const NPC_FAR = 46;
/** …и на «Далеко»: вся набережная (сетка жителей — одна отрисовка, дальние стоят только вершинами) */
const NPC_FAR_MAX = 160;

/** Дальность жителей по меню (k — Renderer.viewK: «Далеко» 1, «Средне» 0,6, «Близко» 0,3) */
export function npcFar(k: number): number {
  return Math.max(NPC_FAR, NPC_FAR_MAX * Math.min(1, Number.isFinite(k) ? k : 1));
}
/** Ближе — говорит раз в 9–13 с */
const TALK = 15;
/** Ближе своей желейки — поворачивается к ней */
const TURN_R = 9;
/** Ближе — машет (не чаще раза в 22 с) */
const WAVE_R = 6.5;
const WAVE_S = 2.4;
const WAVE_COOL = 22;
/** Дальше — поза 8 раз в секунду */
const NEAR_R = 30;
/** Табличка имени: как у игрока (размер в долях высоты экрана, видна ближе 40 м) */
const TAG_W = 0.18;
const TAG_H = 0.045;
const TAG_FAR = 40;
/** Облачко: как у игрока */
const SPEECH_W = 0.265;
const SPEECH_H = 0.1035;
const SPEECH_REF = 16 / 9;
const SPEECH_FAR = 35;

const TOUT_KEYS = new Set<string>(Object.keys(TOUT_INFO));

// ------------------------------------------------------------ разбор модели и склейка (без DOM — проверяет тест)

/** Шероховатость, лак (0…1) и свечение (0…1) по имени материала модели (p3_gloss, p3_matte, p3_glow) */
export function surfOf(mat: THREE.Material | undefined): [number, number, number] {
  const name = mat?.name ?? '';
  const rough = (mat as THREE.MeshStandardMaterial | undefined)?.roughness;
  if (name.includes('glow')) return [1, 0, 1];
  if (name.includes('matte')) return [rough ?? 0.82, 0, 0];
  return [rough ?? 0.3, 1, 0];
}

/** Узел-часть: ближайший предок (или сам узел) с userData.animation_part */
function partOf(o: THREE.Object3D | null): THREE.Object3D | null {
  while (o) {
    if (typeof o.userData.animation_part === 'string') return o;
    o = o.parent;
  }
  return null;
}

/** Части модели по имени (userData.animation_part; точка в имени узла glTF выпадает — по имени узла не ищем) */
export function npcParts(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const out = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    const p = o.userData.animation_part;
    if (typeof p === 'string' && !out.has(p)) out.set(p, o);
  });
  return out;
}

/** Покой кости: положение, поворот, масштаб */
interface Rest {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
}

export interface Rig {
  def: NpcDef;
  /** Корень жителя: место и поворот на площади */
  root: THREE.Bone;
  /** Кости частей по имени части и их номера в общем скелете */
  bones: Map<string, THREE.Bone>;
  index: Map<string, number>;
  rest: Map<THREE.Bone, Rest>;
  /** Табличка имени в осях модели (над шапкой) */
  tag: THREE.Vector3;
  /** Первая вершина и число вершин в общей сетке */
  first: number;
  count: number;
}

export interface Crowd {
  geometry: THREE.BufferGeometry;
  bones: THREE.Bone[];
  rigs: Rig[];
  triangles: number;
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();

/**
 * Склеить жителей в одну геометрию с жёсткими костями: кость на часть (иерархия как в модели), вершины — в мировых
 * осях в позе покоя на своём месте (x, y, z, yaw), skinIndex — кость своей части, вес 1. Атрибуты: position, normal,
 * color (RGB), surf (шероховатость, лак, свечение), skinIndex, skinWeight.
 */
export function buildCrowd(list: ReadonlyArray<{ def: NpcDef; model: THREE.Object3D }>): Crowd {
  const bones: THREE.Bone[] = [];
  const rigs: Rig[] = [];
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const surf: number[] = [];
  const skin: number[] = [];
  const index: number[] = [];
  for (const { def, model } of list) {
    model.updateMatrixWorld(true);
    const parts = npcParts(model);
    const root = new THREE.Bone();
    root.name = `npc_${def.id}`;
    root.position.set(def.x, def.y, def.z);
    root.rotation.y = def.yaw;
    bones.push(root);
    const rig: Rig = { def, root, bones: new Map(), index: new Map(), rest: new Map(), tag: new THREE.Vector3(0, 1.86, 0), first: pos.length / 3, count: 0 };
    rig.rest.set(root, { p: root.position.clone(), q: root.quaternion.clone(), s: new THREE.Vector3(1, 1, 1) });
    // кости частей: родитель — ближайшая часть выше (иначе корень), покой — положение части относительно родителя
    const boneOf = new Map<THREE.Object3D, THREE.Bone>();
    model.traverse((o) => {
      const name = o.userData.animation_part;
      if (typeof name !== 'string' || rig.bones.has(name)) return;
      const up = partOf(o.parent);
      const parent = (up && boneOf.get(up)) ?? root;
      _inv.copy(up ? up.matrixWorld : model.matrixWorld).invert();
      _m.multiplyMatrices(_inv, o.matrixWorld);
      const b = new THREE.Bone();
      b.name = `${def.id}:${name}`;
      _m.decompose(b.position, b.quaternion, b.scale);
      parent.add(b);
      rig.index.set(name, bones.length);
      bones.push(b);
      boneOf.set(o, b);
      rig.bones.set(name, b);
      rig.rest.set(b, { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() });
    });
    const tagNode = parts.get('tag');
    if (tagNode) {
      _inv.copy(model.matrixWorld).invert();
      rig.tag.setFromMatrixPosition(_m.multiplyMatrices(_inv, tagNode.matrixWorld));
    }
    // сетки: в осях модели → на место жителя
    const place = new THREE.Matrix4().compose(new THREE.Vector3(def.x, def.y, def.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), def.yaw), new THREE.Vector3(1, 1, 1));
    const modelInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const owner = partOf(mesh);
      const bone = (owner && boneOf.get(owner)) ?? root;
      const bi = bones.indexOf(bone);
      _m.multiplyMatrices(place, _inv.multiplyMatrices(modelInv, mesh.matrixWorld));
      _nm.getNormalMatrix(_m);
      const g = mesh.geometry;
      const P = g.getAttribute('position');
      const N = g.getAttribute('normal');
      const Cl = g.getAttribute('color');
      const s = surfOf(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
      const base = pos.length / 3;
      for (let i = 0; i < P.count; i++) {
        _v.fromBufferAttribute(P, i).applyMatrix4(_m);
        pos.push(_v.x, _v.y, _v.z);
        if (N) _v.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
        else _v.set(0, 1, 0);
        nrm.push(_v.x, _v.y, _v.z);
        if (Cl) col.push(Cl.getX(i), Cl.getY(i), Cl.getZ(i));
        else col.push(1, 1, 1);
        surf.push(s[0], s[1], s[2]);
        skin.push(bi, 0, 0, 0);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) index.push(base + g.index.getX(i));
      else for (let i = 0; i < P.count; i++) index.push(base + i);
    });
    rig.count = pos.length / 3 - rig.first;
    rigs.push(rig);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setAttribute('surf', new THREE.Float32BufferAttribute(surf, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skin, 4));
  const w = new Float32Array(skin.length);
  for (let i = 0; i < w.length; i += 4) w[i] = 1;
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
  geometry.setIndex(index);
  return { geometry, bones, rigs, triangles: index.length / 3 };
}

/** Форма хода ожидания в момент u ∈ [0; 1] */
export function idleEase(m: IdleMove, u: number): number {
  switch (m.e) {
    case 'arc':
      return Math.sin(Math.PI * u);
    case 'osc':
      return Math.sin(2 * Math.PI * (m.n ?? 1) * u) * Math.sin(Math.PI * u);
    case 'spin':
      return u;
    default: {
      const r = 0.25;
      const a = Math.min(1, u / r);
      const b = Math.min(1, (1 - u) / r);
      return a * a * (3 - 2 * a) * b * b * (3 - 2 * b);
    }
  }
}

// ------------------------------------------------------------ загрузка

/** Адрес модели жителя (Vite кладёт файлы в сборку с хешем; CSP — свои ассеты) */
export function npcUrl(id: string): string {
  return new URL(`../../assets/plaza3/npc/${id}.glb`, import.meta.url).href;
}

// ------------------------------------------------------------ материалы

/**
 * Один материал на всех жителей: лак, как у желе игрока (окружение — только в лаке), ткань матовая, светящееся
 * (блики глаз, лампа Шуры) — по цвету вершины. Атрибут surf: шероховатость, доля лака, свечение.
 */
function npcMaterial(fades: Float32Array): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMap: metalEnvTexture(), side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNpcFade = { value: fades };
    sh.vertexShader = `attribute float npcId;\nuniform float uNpcFade[${fades.length}];\nvarying float vNpcFade;\nattribute vec3 surf;\nvarying vec3 vSurf;\n` + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vNpcFade = uNpcFade[int(npcId)];\n vSurf = surf;');
    sh.fragmentShader = 'varying float vNpcFade;\nvarying vec3 vSurf;\n' + DITHER_FUNCTION.replace(/p3Dither/g, 'npcDither') + '\n' + sh.fragmentShader
      .replace('void main() {', 'void main() {\n if (vNpcFade < npcDither(gl_FragCoord.xy)) discard;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = vSurf.x;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vSurf.z;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n  material.clearcoat *= vSurf.y;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n  iblIrradiance *= 0.0;\n  radiance *= 0.0;\n  clearcoatRadiance *= 0.5;')
      .replace(
        '#include <opaque_fragment>',
        `float npcRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.4);
  outgoingLight += mix(diffuseColor.rgb, vec3(1.0), 0.55) * npcRim * 0.35 * vSurf.y;
  #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'npc3-v2-fade';
  return m;
}

/** Табличка с именем как у игрока (client/render/leveltag.ts): кружок слева — цвет жителя вместо уровня */
function drawTag(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, accent: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.clearRect(0, 0, 320, 80);
  ctx.beginPath();
  ctx.arc(25, 25, 17, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(22,28,32,.94)';
  ctx.fill();
  ctx.strokeStyle = '#fff6e8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(25, 25, 10, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  let size = 30;
  ctx.font = `700 ${size}px Rubik,system-ui,sans-serif`;
  const avail = 320 - 62;
  while (size > 18 && ctx.measureText(name).width > avail) {
    size--;
    ctx.font = `700 ${size}px Rubik,system-ui,sans-serif`;
  }
  const cx = (320 + 44) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(30,24,20,.85)';
  ctx.strokeText(name, cx, 25, avail);
  ctx.fillStyle = '#fff6e8';
  ctx.fillText(name, cx, 25, avail);
  ctx.restore();
}

/** Облачко как у игрока (client/render/avatar.ts drawSpeech): белая плашка с хвостиком, до 3 строк */
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
  const lineH = 40;
  const w = Math.max(90, ...lines.map((l) => ctx.measureText(l).width)) + 40;
  const h = lines.length * lineH + 24;
  const x = (cv.width - w) / 2;
  const y = cv.height - 18 - h;
  ctx.fillStyle = 'rgba(255,252,246,0.96)';
  ctx.strokeStyle = 'rgba(40,32,28,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 22, y);
  ctx.arcTo(x + w, y, x + w, y + h, 22);
  ctx.arcTo(x + w, y + h, x, y + h, 22);
  ctx.arcTo(x, y + h, x, y, 22);
  ctx.arcTo(x, y, x + w, y, 22);
  ctx.closePath();
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

/** Таблички всех жителей: квадраты к камере с постоянным экранным размером (как спрайт sizeAttenuation: false) */
function tagMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uSize: { value: new THREE.Vector2(TAG_W, TAG_H) } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute float alpha;
      uniform vec2 uSize;
      varying vec2 vUv;
      varying float vA;
      void main() {
        vUv = uv;
        vA = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xy += corner * uSize * -mv.z;
        gl_Position = alpha > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      varying float vA;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a * vA < 0.01) discard;
        gl_FragColor = vec4(c.rgb, c.a * vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ------------------------------------------------------------ жители на площади

interface Bubble {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  owner: Npc | null;
  until: number;
}

interface Npc {
  rig: Rig;
  def: NpcDef;
  ext: NpcHandle | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** до камеры и до своей желейки */
  dist: number;
  distMe: number;
  hidden: boolean;
  fade: FadeState;
  phase: number;
  blinkIn: number;
  blinkT: number;
  waveT: number;
  waveCool: number;
  sayT: number;
  line: number;
  posedAt: number;
  extWaves: number;
  extLines: number;
  /** Табличка: мир */
  tag: THREE.Vector3;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const OFF = 9;
const NO_PLAYERS: ReadonlyArray<{ x: number; z: number }> = [];

export class NpcCrowd {
  private readonly scene: THREE.Scene;
  private readonly modes = new Map<PlazaMode, boolean>();
  private npcs: Npc[] = [];
  private mesh: THREE.SkinnedMesh | null = null;
  private tags: THREE.Mesh | null = null;
  private tagPos: THREE.BufferAttribute | null = null;
  private tagAlpha: THREE.BufferAttribute | null = null;
  private shadows: THREE.Mesh | null = null;
  private shadowPos: THREE.BufferAttribute | null = null;
  private readonly bubbles: Bubble[] = [];
  private status: NpcStatusIn = { dg: null, season: null, fashion: null };
  private statusAt = -1;
  /** Данные сцены для реплик Аси, Толика, Жетоныча и Лёни (раз в секунду): гидроплан, бега, автоматы, бильярд */
  private live: (() => Partial<NpcStatusIn>) | null = null;
  private triangles = 0;
  private boneCount = 0;
  private failed: string[] = [];
  /** Смещения частей за кадр: на кость — pos(3), rot(3), scl(3) */
  private off = new Float32Array(0);
  private fades = new Float32Array(0);
  private visibilityAt = -1;
  private readonly occluders = buildOccluders(P3.colliders);
  private readonly visibilityPoint = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    void this.load();
  }

  private async load(): Promise<void> {
    const loader = new GLTFLoader();
    const got = await Promise.all(NPCS.map(async (def) => {
      try {
        const gltf = await loader.loadAsync(npcUrl(def.id));
        const parts = npcParts(gltf.scene);
        if (!NPC_REQUIRED.every((p) => parts.has(p))) throw new Error('нет частей');
        return { def, model: gltf.scene as THREE.Object3D };
      } catch (e) {
        console.warn('[жители] модель', def.id, e);
        this.failed.push(def.id);
        return null;
      }
    }));
    this.build(got.filter((g): g is { def: NpcDef; model: THREE.Object3D } => g !== null));
  }

  private build(list: ReadonlyArray<{ def: NpcDef; model: THREE.Object3D }>): void {
    if (!list.length) return;
    const crowd = buildCrowd(list);
    this.triangles = crowd.triangles;
    this.boneCount = crowd.bones.length;
    this.off = new Float32Array(crowd.bones.length * OFF);
    // Одинаковый размер uniforms даже если один GLB не загрузился: shader key остаётся стабильным.
    this.fades = new Float32Array(NPCS.length);
    const ids = new Float32Array(crowd.geometry.getAttribute('position').count);
    crowd.rigs.forEach((r, i) => ids.fill(i, r.first, r.first + r.count));
    crowd.geometry.setAttribute('npcId', new THREE.BufferAttribute(ids, 1));
    const mesh = new THREE.SkinnedMesh(crowd.geometry, npcMaterial(this.fades));
    mesh.name = 'plaza3-npcs';
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.raycast = () => {};
    for (const r of crowd.rigs) mesh.add(r.root);
    mesh.bind(new THREE.Skeleton(crowd.bones));
    this.mesh = mesh;
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.npcs = crowd.rigs.map((rig) => ({
      rig, def: rig.def, ext: rig.def.ext ? npcHandle(rig.def.id) : null,
      x: rig.def.x, y: rig.def.y, z: rig.def.z, yaw: rig.def.yaw, dist: Infinity, distMe: Infinity, hidden: false, fade: makeFade(0),
      phase: rnd() * 10, blinkIn: 1 + rnd() * 4, blinkT: 0, waveT: 0, waveCool: 0, sayT: 2 + rnd() * 4, line: 0, posedAt: -1,
      extWaves: 0, extLines: 0, tag: new THREE.Vector3(),
    }));
    for (const n of this.npcs) if (n.ext) [n.extWaves, n.extLines] = [n.ext.waves, n.ext.lines];
    this.scene.add(mesh);
    this.buildTags();
    this.buildShadows();
    for (const n of this.npcs) this.setHidden(n, true);
  }

  /** Атлас имён (320×80 на жителя) и меш из квадратов: позиция — место таблички, corner — угол квадрата */
  private buildTags(): void {
    const n = this.npcs.length;
    const cols = 3;
    const rows = Math.ceil(n / cols);
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = rows * 80;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const draw = (): void => {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.npcs.forEach((p, i) => drawTag(ctx, (i % cols) * 320, Math.floor(i / cols) * 80, p.def.name, p.def.accent));
      tex.needsUpdate = true;
    };
    draw();
    void document.fonts?.ready.then(draw);
    const corner = new Float32Array(n * 8);
    const uv = new Float32Array(n * 8);
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      const u0 = ((i % cols) * 320) / canvas.width;
      const u1 = u0 + 320 / canvas.width;
      const v1 = 1 - (Math.floor(i / cols) * 80) / canvas.height;
      const v0 = v1 - 80 / canvas.height;
      corner.set([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1], i * 8);
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
      const b = i * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    this.tagPos = new THREE.BufferAttribute(new Float32Array(n * 12), 3).setUsage(THREE.DynamicDrawUsage);
    this.tagAlpha = new THREE.BufferAttribute(new Float32Array(n * 4), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.tagPos);
    g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('alpha', this.tagAlpha);
    g.setIndex(index);
    const m = new THREE.Mesh(g, tagMaterial(tex));
    m.name = 'plaza3-npc-tags';
    m.frustumCulled = false;
    m.renderOrder = 5;
    m.raycast = () => {};
    this.tags = m;
    this.scene.add(m);
  }

  /** Тени-пятна под жителями: один меш, квадраты переставляются при показе и прятании */
  private buildShadows(): void {
    const n = this.npcs.length;
    const uv = new Float32Array(n * 8);
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      const b = i * 4;
      index.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry();
    this.shadowPos = new THREE.BufferAttribute(new Float32Array(n * 12), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.shadowPos);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const ids = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) ids.fill(i, i * 4, i * 4 + 4);
    g.setAttribute('npcId', new THREE.BufferAttribute(ids, 1));
    g.setIndex(index);
    const mat = new THREE.MeshBasicMaterial({ map: softDot('rgba(20,16,30,0.55)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNpcFade = { value: this.fades };
      sh.vertexShader = `attribute float npcId;\nuniform float uNpcFade[${this.fades.length}];\nvarying float vNpcFade;\n` + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vNpcFade = uNpcFade[int(npcId)];');
      sh.fragmentShader = 'varying float vNpcFade;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vNpcFade;');
    };
    mat.customProgramCacheKey = () => 'npc3-shadow-fade';
    const m = new THREE.Mesh(g, mat);
    m.name = 'plaza3-npc-shadows';
    m.userData.p3keep = true;
    m.frustumCulled = false;
    m.renderOrder = 1;
    m.raycast = () => {};
    this.shadows = m;
    this.scene.add(m);
  }

  private shadowAt(i: number, n: Npc, on: boolean): void {
    const a = this.shadowPos;
    if (!a) return;
    const r = on ? (n.def.id === 'bochka' ? 0.8 : 0.675) : 0;
    const y = n.y + 0.02 + DECAL_LIFT;
    const arr = a.array as Float32Array;
    arr.set([n.x - r, y, n.z - r, n.x + r, y, n.z - r, n.x + r, y, n.z + r, n.x - r, y, n.z + r], i * 12);
    a.needsUpdate = true;
  }

  private setHidden(n: Npc, h: boolean): void {
    if (n.hidden === h) return;
    n.hidden = h;
    this.shadowAt(this.npcs.indexOf(n), n, !h);
    if (h) for (const b of this.bubbles) if (b.owner === n) b.until = 0;
  }

  /** Режим за флагом сервера включён или нет: жители его входа стоят только при включённом */
  setMode(mode: PlazaMode, on: boolean): void {
    this.modes.set(mode, on);
  }

  /** Облачко над жителем на 6 с (пул из трёх: занятое самым старым — перерисовывается) */
  private say(n: Npc, text: string): void {
    const t = text.trim().slice(0, BUBBLE_CHARS);
    if (!t) return;
    let b = this.bubbles.find((x) => x.owner === n) ?? this.bubbles.find((x) => x.until < performance.now());
    if (!b && this.bubbles.length < 3) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 200;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthWrite: false, transparent: true, fog: false }));
      sprite.scale.set(SPEECH_W, SPEECH_H, 1);
      sprite.center.set(0.5, -(TAG_H + 0.006) / SPEECH_H);
      sprite.renderOrder = 6;
      sprite.visible = false;
      sprite.onBeforeRender = (_r, _s, camera) => {
        const k = Math.max(1, SPEECH_REF / camera.projectionMatrix.elements[5]);
        sprite.scale.set(SPEECH_W * k, SPEECH_H * k, 1);
        sprite.center.y = -(TAG_H + 0.006) / sprite.scale.y;
        sprite.updateMatrixWorld();
      };
      this.scene.add(sprite);
      b = { sprite, canvas, tex, owner: null, until: 0 };
      this.bubbles.push(b);
    }
    b ??= this.bubbles.reduce((a, x) => (x.until < a.until ? x : a));
    drawSpeech(b.canvas, t);
    b.tex.needsUpdate = true;
    b.owner = n;
    b.until = performance.now() + BUBBLE_MS;
  }

  /** Живые реплики жителя: статус его режима (как у зазывал plaza2) или свой статус; пусто — обычные */
  private liveFor(n: Npc, live: LiveIn): readonly string[] {
    const t = n.def.talk;
    if (TOUT_KEYS.has(t)) return liveLines(t as ToutKey, live);
    return npcStatusLines(t, this.status);
  }

  /** Сцена набережной даёт источник данных для статусов в репликах (client/lobby/scene.ts) */
  setLive(source: () => Partial<NpcStatusIn>): void {
    this.live = source;
  }

  private refreshStatus(time: number): void {
    if (this.statusAt >= 0 && time - this.statusAt < 1 && time >= this.statusAt) return;
    this.statusAt = time;
    const dg = dgStatus();
    const rec = (r: { nick: string; waves: number } | undefined): { nick: string; waves: number } | null => (r ? { nick: r.nick, waves: r.waves } : null);
    this.status = {
      dg: dg ? { top: rec(dg.top[0]), week: rec(dg.week[0]) } : null,
      season: FISH_SEASON.state(),
      fashion: fashionOfDay(ITEMS, Date.now()),
      ...this.live?.(),
    };
  }

  /** Кадр: время мира, камера, своя желейка (x, z) или null, статусы режимов, чужие желейки (поворот к ближайшему игроку) */
  update(dt: number, time: number, cam: THREE.Vector3, me: { x: number; z: number } | null, live: LiveIn, others: ReadonlyArray<{ x: number; z: number }> = NO_PLAYERS): void {
    if (!this.mesh) return;
    this.refreshStatus(time);
    const now = performance.now();
    const tagPos = this.tagPos!.array as Float32Array;
    const tagA = this.tagAlpha!.array as Float32Array;
    const far = npcFar(p3View.k);
    const checkSight = time >= this.visibilityAt;
    if (checkSight) this.visibilityAt = time + .2;
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      const def = n.def;
      const ext = n.ext;
      if (ext) {
        if (ext.x !== n.x || ext.z !== n.z || ext.y !== n.y) {
          [n.x, n.y, n.z] = [ext.x, ext.y, ext.z];
          if (!n.hidden) this.shadowAt(i, n, true);
        }
      }
      const on = (def.mode ? this.modes.get(def.mode) === true : true) && (!ext || ext.on);
      const d = Math.hypot(cam.x - n.x, cam.z - n.z);
      n.dist = d;
      if (!on) n.fade = makeFade(0);
      else if (checkSight) {
        this.visibilityPoint.set(n.x, n.y + 1, n.z);
        const limit = d <= far || d > 110 ? far : openSight(cam, this.visibilityPoint, 1, this.occluders) ? Math.max(far, 110) : far;
        decideFade(n.fade, d, limit, time);
      }
      this.fades[i] = stepFade(n.fade, dt);
      this.setHidden(n, !on || n.fade.value === 0 && n.fade.target === 0);
      if (n.hidden) {
        tagA.fill(0, i * 4, i * 4 + 4);
        continue;
      }
      const dm = me ? Math.hypot(me.x - n.x, me.z - n.z) : Infinity;
      n.distMe = dm;
      // поворот: к ближайшему игроку (своей желейке или чужой), пока он рядом; иначе — на пост (у Гали — как велит калитка)
      let want = def.yaw;
      if (ext) want = ext.yaw;
      else {
        let near: { x: number; z: number } | null = null;
        let nearD = TURN_R;
        if (me && dm < nearD) {
          near = me;
          nearD = dm;
        }
        for (const p of others) {
          const dp = Math.hypot(p.x - n.x, p.z - n.z);
          if (dp < nearD) {
            near = p;
            nearD = dp;
          }
        }
        if (near) want = toward(n.x, n.z, near.x, near.z);
      }
      n.yaw = lerpAngle(n.yaw, want, Math.min(1, dt * 3.2));
      // взмах и приветствие
      n.waveCool -= dt;
      if (n.waveT > 0) n.waveT -= dt;
      if (ext) {
        if (ext.waves !== n.extWaves) {
          n.extWaves = ext.waves;
          n.waveT = WAVE_S;
        }
        if (ext.lines !== n.extLines) {
          n.extLines = ext.lines;
          this.say(n, ext.line);
        }
      } else {
        if (n.waveT <= 0 && dm < WAVE_R && n.waveCool <= 0) {
          n.waveT = WAVE_S;
          n.waveCool = WAVE_COOL;
          if (def.greet) {
            const lines = this.liveFor(n, live);
            const pool = lines.length ? lines : def.lines;
            if (pool.length) this.say(n, pool[n.line++ % pool.length]);
            n.sayT = Math.max(n.sayT, 6);
          }
        }
        // реплика: пока камера рядом, раз в 9–13 с (живой статус важнее обычных)
        if (d < TALK) {
          n.sayT -= dt;
          if (n.sayT <= 0) {
            const lines = this.liveFor(n, live);
            const pool = lines.length ? lines : def.lines;
            if (pool.length) this.say(n, pool[n.line++ % pool.length]);
            n.sayT = 9 + Math.random() * 4;
          }
        } else n.sayT = Math.min(n.sayT, 1.2);
      }
      // моргание
      n.blinkIn -= dt;
      if (n.blinkT > 0) n.blinkT -= dt;
      else if (n.blinkIn <= 0) {
        n.blinkT = 0.14;
        n.blinkIn = Math.random() < 0.12 ? 0.32 : 2.5 + Math.random() * 3.5;
      }
      const root = n.rig.root;
      root.position.set(n.x, n.y, n.z);
      root.rotation.y = n.yaw;
      if (d < NEAR_R || time - n.posedAt >= 0.125 || time < n.posedAt) {
        n.posedAt = time;
        this.pose(n, time);
      }
      // табличка: над шапкой, в осях корня (без покачиваний тела — не прыгает)
      const c = Math.cos(n.yaw);
      const s = Math.sin(n.yaw);
      const tg = n.rig.tag;
      n.tag.set(n.x + tg.x * c + tg.z * s, n.y + tg.y, n.z - tg.x * s + tg.z * c);
      for (let k = 0; k < 4; k++) tagPos.set([n.tag.x, n.tag.y, n.tag.z], (i * 4 + k) * 3);
      tagA.fill(d < TAG_FAR ? Math.min(1, (TAG_FAR - d) / 6) * n.fade.value : 0, i * 4, i * 4 + 4);
    }
    this.tagPos!.needsUpdate = true;
    this.tagAlpha!.needsUpdate = true;
    for (const b of this.bubbles) {
      const o = b.owner;
      const left = b.until - now;
      const d = o ? o.dist : Infinity;
      b.sprite.visible = !!o && !o.hidden && left > 0 && d < SPEECH_FAR;
      if (!b.sprite.visible || !o) continue;
      b.sprite.position.copy(o.tag);
      b.sprite.material.opacity = Math.min(1, left / 600, (SPEECH_FAR - d) / 5);
    }
  }

  /** Поза частей: покой + дыхание и покачивание + ходы цикла ожидания + взмах + моргание + трепет шарфа */
  private pose(n: Npc, time: number): void {
    const rig = n.rig;
    const def = n.def;
    const off = this.off;
    const add = (part: string, pos?: readonly number[], rot?: readonly number[], scl?: readonly number[], k = 1): void => {
      const bi = rig.index.get(part);
      if (bi === undefined || k === 0) return;
      const o = bi * OFF;
      if (pos) for (let j = 0; j < 3; j++) off[o + j] += pos[j] * k;
      if (rot) for (let j = 0; j < 3; j++) off[o + 3 + j] += rot[j] * k;
      if (scl) for (let j = 0; j < 3; j++) off[o + 6 + j] += scl[j] * k;
    };
    for (const bi of rig.index.values()) off.fill(0, bi * OFF, bi * OFF + OFF);
    const t = time + n.phase;
    // дыхание (объём сохраняется) и лёгкое покачивание
    const br = Math.sin(t * 1.85);
    add('body', undefined, [Math.sin(t * 0.7) * 0.012, 0, Math.sin(t * 1.19) * 0.018], [-0.006 * br, 0.012 * br, -0.006 * br]);
    const hb = Math.sin(t * 1.85 - 0.6) * 0.008;
    add('hand.L', [0, hb, 0]);
    add('hand.R', [0, -hb, 0]);
    // шарф по ветру
    add('live', undefined, [Math.sin(t * 6.7 + 0.4) * 0.08, Math.sin(t * 5.1) * 0.22 + Math.sin(t * 8.3 + 1) * 0.08, Math.sin(t * 4.3 + 2) * 0.1]);
    // взмах подошедшему: рука вверх и покачивание кистью, тело чуть кланяется; ходы этой руки на время взмаха гаснут
    let wk = 0;
    if (n.waveT > 0) {
      const w = WAVE_S - n.waveT;
      wk = Math.min(1, w / 0.3, n.waveT / 0.4);
      wk = wk * wk * (3 - 2 * wk);
      const side = def.wave.hand === 'hand.R' ? -1 : 1;
      add(def.wave.hand, def.wave.lift, [0, 0, side * 0.45 * Math.sin(w * Math.PI * 4.4)], undefined, wk);
      add('body', undefined, [-0.08, 0, 0], undefined, wk);
    }
    const waveHand = def.wave.hand;
    const waveProp = waveHand === 'hand.R' ? 'prop.R' : 'prop.L';
    const len = def.idle.len;
    const cyc = ((t % len) + len) % len;
    for (const m of def.idle.moves) {
      if (cyc < m.t || cyc > m.t + m.d) continue;
      let k = idleEase(m, (cyc - m.t) / m.d);
      if (wk > 0 && (m.p === waveHand || m.p === waveProp)) k *= 1 - wk;
      add(m.p, m.pos, m.rot, m.scl, k);
    }
    // моргание: глаза (с веками) сплющиваются до 0,12, как у игрока
    const blink = n.blinkT > 0 ? Math.sin(Math.PI * (1 - n.blinkT / 0.14)) : 0;
    for (const [name, b] of rig.bones) {
      const r = rig.rest.get(b)!;
      const o = rig.index.get(name)! * OFF;
      b.position.set(r.p.x + off[o], r.p.y + off[o + 1], r.p.z + off[o + 2]);
      _e.set(off[o + 3], off[o + 4], off[o + 5]);
      b.quaternion.copy(r.q).multiply(_q.setFromEuler(_e));
      b.scale.set(r.s.x * (1 + off[o + 6]), r.s.y * (1 + off[o + 7]), r.s.z * (1 + off[o + 8]));
      if (name === 'eyes' && blink > 0) b.scale.y *= 1 - 0.88 * blink;
    }
  }

  debug(): Record<string, unknown> {
    return {
      loaded: this.npcs.length, failed: this.failed, triangles: this.triangles, bones: this.boneCount,
      shown: this.npcs.filter((n) => !n.hidden).map((n) => [n.def.id, +n.dist.toFixed(1)]),
      bubbles: this.bubbles.filter((b) => b.sprite.visible).length,
    };
  }

  /** Все объекты жителей в сцене (для замера и прогрева) */
  objects(): THREE.Object3D[] {
    const out: THREE.Object3D[] = this.bubbles.map((b) => b.sprite);
    for (const o of [this.mesh, this.tags, this.shadows]) if (o) out.push(o);
    return out;
  }
}
