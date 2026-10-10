// Косметика острова «Последний свет» (флаг ISLE, shared/fishstyle.ts ISLE_LADDER) из готовых GLB (client/assets/islecos/,
// PROVENANCE рядом): шапка и свитер смотрителя (h:keeper, a:keeper), тупик на плече (s:puffin), поплавки «Колокольный буй»
// (b:bellbuoy) и светящаяся «Золотая рыбка» (b:goldfish). GLB читается своим маленьким разборщиком прямо в те же
// интерфейсы, что у вещей из кода: Wear (outfit3d.ts), насест PetRider (outfitfish.ts), поплавок (fishgear.ts).
// Материалы GLB не используются: цвет в вершинах (× baseColor) и общие материалы игры, поэтому новых шейдеров нет.
// Модели грузятся один раз, когда их впервые кто-то надел; до тех пор вещь не видна, потом желейка переодевается сама.
// Удочка «Маячная» — из кода (fishgear.ts), окно «Туман» — CSS (ui/fishstyle.css), значок «Маяк» — канвас (leveltag.ts).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Outfit } from '../../shared/outfit.ts';
import { wear, type Wear } from './outfit3d.ts';
import { softDot } from './textures.ts';

/** Остров включён на сервере (флаг ISLE, приходит в me): без него «Золотая рыбка» прежняя, вещей острова не видно */
export const ISLE = { on: false };

// ------------------------------------------------------------ разбор GLB

type Geo = THREE.BufferGeometry;

export interface GlbPrim {
  geo: Geo;
  /** Имя материала GLB (fc_cloth, fc_glow…): по нему — обычный или светящийся */
  mat: string;
}

export interface GlbNode {
  name: string;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  extras: Record<string, unknown>;
  prims: GlbPrim[];
  children: GlbNode[];
}

export interface Glb {
  roots: GlbNode[];
  byName: Map<string, GlbNode>;
}

interface GltfJson {
  scene?: number;
  scenes: Array<{ nodes: number[] }>;
  nodes: Array<{ name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; extras?: Record<string, unknown> }>;
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number; material?: number }> }>;
  materials?: Array<{ name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }>;
  accessors: Array<{ bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }>;
  bufferViews: Array<{ byteOffset?: number; byteLength: number; byteStride?: number }>;
}

const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Разобрать GLB (glTF 2.0, один буфер, без разреженных данных — так экспортирует Blender) */
export function parseGlb(buf: ArrayBuffer): Glb {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('islegear: не GLB');
  const jsonLen = dv.getUint32(12, true);
  const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as GltfJson;
  const bin = 20 + jsonLen + 8;
  const read = (i: number): { data: Float32Array | Uint16Array | Uint32Array; size: number } => {
    const a = j.accessors[i];
    const bv = j.bufferViews[a.bufferView ?? 0];
    const size = SIZE[a.type];
    const bytes = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
    const stride = bv.byteStride ?? size * bytes;
    const base = bin + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const out = a.componentType === 5125 ? new Uint32Array(a.count * size) : a.componentType === 5123 && !a.normalized ? new Uint16Array(a.count * size) : new Float32Array(a.count * size);
    for (let e = 0; e < a.count; e++) {
      for (let k = 0; k < size; k++) {
        const at = base + e * stride + k * bytes;
        let v: number;
        if (a.componentType === 5126) v = dv.getFloat32(at, true);
        else if (a.componentType === 5125) v = dv.getUint32(at, true);
        else if (a.componentType === 5123) v = dv.getUint16(at, true) / (a.normalized ? 65535 : 1);
        else v = dv.getUint8(at) / (a.normalized ? 255 : 1);
        out[e * size + k] = v;
      }
    }
    return { data: out, size };
  };
  const meshes = (j.meshes ?? []).map((m) => m.primitives.map((p): GlbPrim => {
    const mat = j.materials?.[p.material ?? -1];
    const base = mat?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
    const g = new THREE.BufferGeometry();
    const pos = read(p.attributes.POSITION);
    g.setAttribute('position', new THREE.BufferAttribute(pos.data, 3));
    if (p.attributes.NORMAL !== undefined) g.setAttribute('normal', new THREE.BufferAttribute(read(p.attributes.NORMAL).data, 3));
    // цвет в вершинах: COLOR_0 × baseColor, всегда RGB float — как у вещей из кода (иначе другой вариант шейдера)
    const n = pos.data.length / 3;
    const col = new Float32Array(n * 3);
    const src = p.attributes.COLOR_0 !== undefined ? read(p.attributes.COLOR_0) : null;
    for (let v = 0; v < n; v++) {
      for (let k = 0; k < 3; k++) col[v * 3 + k] = (src ? src.data[v * src.size + k] : 1) * base[k];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (p.indices !== undefined) g.setIndex(new THREE.BufferAttribute(read(p.indices).data, 1));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return { geo: g, mat: mat?.name ?? '' };
  }));
  const byName = new Map<string, GlbNode>();
  const node = (i: number): GlbNode => {
    const d = j.nodes[i];
    const n: GlbNode = {
      name: d.name ?? `node${i}`,
      position: new THREE.Vector3(...((d.translation ?? [0, 0, 0]) as [number, number, number])),
      quaternion: new THREE.Quaternion(...((d.rotation ?? [0, 0, 0, 1]) as [number, number, number, number])),
      scale: new THREE.Vector3(...((d.scale ?? [1, 1, 1]) as [number, number, number])),
      extras: d.extras ?? {},
      prims: d.mesh !== undefined ? meshes[d.mesh] : [],
      children: (d.children ?? []).map(node),
    };
    byName.set(n.name, n);
    return n;
  };
  return { roots: j.scenes[j.scene ?? 0].nodes.map(node), byName };
}

function local(n: GlbNode): THREE.Matrix4 {
  return new THREE.Matrix4().compose(n.position, n.quaternion, n.scale);
}

/** Геометрии узла и всех его детей в осях узла from (по умолчанию — корня файла); filter — по материалу */
function gather(glb: Glb, filter: (mat: string) => boolean, from: GlbNode | null = null, skip: ReadonlySet<string> = new Set()): Geo[] {
  const out: Geo[] = [];
  const walk = (n: GlbNode, m: THREE.Matrix4, inside: boolean): void => {
    if (skip.has(n.name)) return;
    const here = n === from;
    const mm = here ? new THREE.Matrix4() : m.clone().multiply(local(n));
    if (inside || here) for (const p of n.prims) if (filter(p.mat)) out.push(p.geo.clone().applyMatrix4(mm));
    for (const c of n.children) walk(c, mm, inside || here);
  };
  for (const r of glb.roots) walk(r, new THREE.Matrix4(), from === null);
  return out;
}

/** Точка узла name в осях корня файла */
function nodePoint(glb: Glb, name: string): THREE.Vector3 | null {
  let hit: THREE.Vector3 | null = null;
  const walk = (n: GlbNode, m: THREE.Matrix4): void => {
    const mm = m.clone().multiply(local(n));
    if (n.name === name) hit = new THREE.Vector3().setFromMatrixPosition(mm);
    for (const c of n.children) walk(c, mm);
  };
  for (const r of glb.roots) walk(r, new THREE.Matrix4());
  return hit;
}

const isGlow = (mat: string): boolean => mat.startsWith('fc_glow') && mat !== 'fc_glowdisc';
const isBody = (mat: string): boolean => !mat.startsWith('fc_glow');

function mergeAll(list: Geo[]): Geo | null {
  if (!list.length) return null;
  const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
  if (!g) throw new Error('islegear: не склеилось');
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------ загрузка

export type IsleModel = 'bellbuoy' | 'goldfish-glow' | 'puffin' | 'keeper-hat' | 'keeper-sweater';

const URLS: Record<IsleModel, string> = {
  bellbuoy: new URL('../assets/islecos/bellbuoy.glb', import.meta.url).href,
  'goldfish-glow': new URL('../assets/islecos/goldfish-glow.glb', import.meta.url).href,
  puffin: new URL('../assets/islecos/puffin.glb', import.meta.url).href,
  'keeper-hat': new URL('../assets/islecos/keeper-hat.glb', import.meta.url).href,
  'keeper-sweater': new URL('../assets/islecos/keeper-sweater.glb', import.meta.url).href,
};

const ready = new Map<IsleModel, Glb>();
const waiting = new Map<IsleModel, Array<() => void>>();

/** Разобранная модель или null (тогда она начинает грузиться; cb — позовут, когда загрузится) */
export function isleGlb(name: IsleModel, cb?: () => void): Glb | null {
  const g = ready.get(name);
  if (g) return g;
  let list = waiting.get(name);
  if (!list) {
    list = [];
    waiting.set(name, list);
    fetch(URLS[name])
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => primeIsle(name, buf))
      // не загрузилось — попробуем снова, когда вещь понадобится в следующий раз
      .catch(() => waiting.delete(name));
  }
  if (cb) list.push(cb);
  return null;
}

/** Модель загружена (fetch или тест с диска): разобрать и разбудить ждущих */
export function primeIsle(name: IsleModel, buf: ArrayBuffer): void {
  ready.set(name, parseGlb(buf));
  const list = waiting.get(name) ?? [];
  waiting.delete(name);
  for (const cb of list) cb();
}

/** Что из GLB нужно наряду (шапка, свитер, питомец) */
function modelsOf(o: Outfit): IsleModel[] {
  const out: IsleModel[] = [];
  if (o.h === 'keeper') out.push('keeper-hat');
  if (o.a === 'keeper') out.push('keeper-sweater');
  if (o.s === 'puffin') out.push('puffin');
  return out;
}

/** Наряду нужна ещё не загруженная модель: cb позовут по загрузке (желейка переоденется); false — всё уже есть */
export function whenIsleOutfit(o: Outfit, cb: () => void): boolean {
  let wait = false;
  for (const name of modelsOf(o)) if (!isleGlb(name, cb)) wait = true;
  return wait;
}

// ------------------------------------------------------------ одежда: шапка и свитер смотрителя

const wears = new Map<string, Wear>();
const NO_WEAR: Wear = { geo: null, metal: null, y: 0 };

/** Вещь острова для слота h или a: undefined — не вещь острова, иначе Wear (пустой, пока модель грузится) */
export function isleWear(slot: 'h' | 'a' | 'e', key: string): Wear | undefined {
  if (key !== 'keeper' || slot === 'e') return undefined;
  const id = `${slot}:${key}`;
  const have = wears.get(id);
  if (have) return have;
  const glb = isleGlb(slot === 'h' ? 'keeper-hat' : 'keeper-sweater');
  if (!glb) return NO_WEAR;
  const root = glb.roots[0];
  const y = typeof root.extras.attach_y === 'number' ? root.extras.attach_y : slot === 'h' ? 1.42 : 0.7;
  // в осях тела желейки (начало — у ног), как вещи outfit3d.ts до wear(): сдвиг к креплению — там же
  const w = wear([mergeAll(gather(glb, isBody))!], [], y);
  const glow = mergeAll(gather(glb, isGlow));
  if (glow) w.glow = glow.translate(0, -y, 0);
  const h = nodePoint(glb, 'halo');
  const size = Number(glb.byName.get('halo')?.extras.halo_size ?? 0);
  if (h && size > 0) w.halo = { x: h.x, y: h.y - y, z: h.z, size };
  wears.set(id, w);
  return w;
}

// ------------------------------------------------------------ питомец: тупик

let puffinTpl: THREE.Group | null = null;

/** Образец тупика (узлы как в GLB: head, lid_L/R, capelin, wing_L/R, puffin_body), меши — по одному на узел; null — грузится */
export function islePuffin(cb?: () => void): THREE.Group | null {
  if (puffinTpl) return puffinTpl;
  const glb = isleGlb('puffin', cb);
  if (!glb) return null;
  const build = (n: GlbNode): THREE.Object3D => {
    const geo = mergeAll(n.prims.map((p) => p.geo));
    const o: THREE.Object3D = geo ? new THREE.Mesh(geo) : new THREE.Group();
    o.name = n.name;
    o.position.copy(n.position);
    o.quaternion.copy(n.quaternion);
    o.scale.copy(n.scale);
    for (const c of n.children) o.add(build(c));
    return o;
  };
  puffinTpl = build(glb.roots[0]) as THREE.Group;
  return puffinTpl;
}

// ------------------------------------------------------------ поплавки: «Колокольный буй» и светящаяся «Золотая рыбка»

const mats = new Map<string, THREE.Material>();
function mat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = mats.get(key) as T | undefined;
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

/** Цвет в вершинах — тот же набор параметров, что у питомцев и вещей желейки: одна программа шейдера на всех */
const vc = (): THREE.MeshStandardMaterial => mat('vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide }));
const glowMat = (key: string, emissive: THREE.Color | number, intensity: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
  mat(key, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, side: THREE.DoubleSide, emissive, emissiveIntensity: intensity, ...extra }));

/** Ореол тёплым светом, как у «Светлячка»; blink — свой материал (мигает своей прозрачностью) */
export function haloSprite(size: number, key = 'halo'): THREE.Sprite {
  const s = new THREE.Sprite(mat(`sprite:${key}`, () => new THREE.SpriteMaterial({
    map: softDot('rgba(255,160,50,0.8)', 'rgba(255,140,40,0)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  })));
  s.scale.setScalar(size);
  s.name = 'halo';
  return s;
}

/** Вспышка маяка 0…1: раз в period с, пик на 0,3 с; offset — свой сдвиг по времени */
export function beamFlash(ms: number, period = 6, offset = 0): number {
  const ph = (ms / 1000 + offset) % period;
  return Math.exp(-((ph - 0.3) ** 2) / 0.03);
}

const floats = new Map<string, THREE.Object3D[]>();

function bellbuoy(glb: Glb): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const root = glb.roots[0];
  // корпус — одним мешем; колокол — свой узел (качается на поклёвке); огонь — светится и мигает
  out.push(new THREE.Mesh(mergeAll(gather(glb, isBody, root, new Set(['bell', 'light'])))!, vc()));
  for (const name of ['bell', 'light']) {
    const n = glb.byName.get(name)!;
    const m = new THREE.Mesh(mergeAll(n.prims.map((p) => p.geo))!, name === 'light' ? glowMat('buoy-light', 0xffb43a, 1.6) : vc());
    m.name = name;
    m.position.copy(n.position);
    out.push(m);
  }
  const h = glb.byName.get('halo')!;
  const halo = haloSprite(Number(h.extras.halo_size ?? 0.4), 'buoy');
  halo.position.copy(h.position);
  out.push(halo);
  return out;
}

function goldfish(glb: Glb): THREE.Object3D[] {
  const root = glb.roots[0];
  // золото и плавники светятся (emissive ×1,6, как в GLB), глаза и корона-бусины — без свечения
  const gold = glowMat('goldfish', new THREE.Color().setRGB(0.56, 0.19, 0), 1.6, { roughness: 0.35, metalness: 0.45 });
  const out: THREE.Object3D[] = [
    new THREE.Mesh(mergeAll(gather(glb, isGlow, root))!, gold),
    new THREE.Mesh(mergeAll(gather(glb, (m) => isBody(m) && m !== 'fc_glowdisc', root))!, vc()),
  ];
  const h = glb.byName.get('halo')!;
  const halo = haloSprite(Number(h.extras.halo_size ?? 0.55));
  halo.position.copy(h.position);
  out.push(halo);
  // мягкий круг света на воде: над ватерлинией, без записи глубины (плоскости вплотную не кладём)
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2), mat('goldfish-disc', () => new THREE.MeshBasicMaterial({
    map: softDot('rgba(255,196,90,0.55)', 'rgba(255,170,60,0)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  })));
  disc.position.y = 0.03;
  disc.renderOrder = 2;
  out.push(disc);
  return out;
}

/**
 * Поплавок острова по ключу слота b: undefined — не поплавок острова (рисует fishgear.ts), null — модель грузится
 * (cb — позовут по загрузке), иначе образец (меши общие — поплавку копии).
 */
export function isleFloat(key: string, cb?: () => void): THREE.Object3D[] | null | undefined {
  const name: IsleModel | null = key === 'bellbuoy' ? 'bellbuoy' : key === 'goldfish' && ISLE.on ? 'goldfish-glow' : null;
  if (!name) return undefined;
  const have = floats.get(key);
  if (have) return have;
  const glb = isleGlb(name, cb);
  if (!glb) return null;
  const tpl = key === 'bellbuoy' ? bellbuoy(glb) : goldfish(glb);
  floats.set(key, tpl);
  return tpl;
}

const LIGHT_REDUCED = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * Оживить копию поплавка острова: колокол качается после ringFloat, огонь буя мигает (яркостью и ореолом, не visible).
 * Кадр — по часам страницы, без своего цикла: всё в onBeforeRender.
 */
export function animateIsleFloat(group: THREE.Group): void {
  const bell = group.getObjectByName('bell') as THREE.Mesh | undefined;
  const light = group.getObjectByName('light') as THREE.Mesh | undefined;
  if (bell) {
    bell.onBeforeRender = () => {
      const t = (performance.now() - ((group.userData.ringAt as number | undefined) ?? -1e9)) / 1000;
      const a = t >= 0 && t < 1.6 ? 0.42 * Math.exp(-2.4 * t) * Math.sin(t * Math.PI * 2 / 0.5) : 0;
      if (a !== bell.rotation.x) {
        bell.rotation.x = a;
        bell.updateMatrixWorld();
      }
    };
  }
  if (light) {
    const m = light.material as THREE.MeshStandardMaterial;
    const halo = group.getObjectByName('halo') as THREE.Sprite | undefined;
    light.onBeforeRender = () => {
      const f = LIGHT_REDUCED?.matches ? 0.5 : beamFlash(performance.now(), 2.5);
      m.emissiveIntensity = 0.7 + 2.2 * f;
      if (halo) halo.material.opacity = 0.35 + 0.65 * f;
    };
  }
}

/** Поклёвка: колокол буя качается («дзынь» играет fishing.ts); true — у поплавка есть колокол */
export function ringFloat(group: THREE.Group): boolean {
  if (!group.getObjectByName('bell')) return false;
  group.userData.ringAt = performance.now();
  return true;
}
