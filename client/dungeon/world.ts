// Карта-тор «Подземелья» (docs/survivors/level.md §1–6): 10 × 10 кусков по 24 м. Кусок — до 3 отрисовок:
// (а) пол сеткой 1 м + все неподвижные пропы одной геометрией с цветами вершин и запечённым светом,
// (б) свечение (огонь, кристаллы, варенье, Жила-компас), (в) вода и варенье одним шейдером с волнами.
// Три материала на всю карту. Каждый кадр кусок ставится в ближайшую к камере копию по модулю 240.
// Пол рисуется текстурами зон (client/assets/dungeon/floor/, по одной на зону): вес зоны — в вершине (aZone),
// рисунок привязан к мировым x, z с периодом 10 м (делит 240, шва на стыке тора нет), второй слой повёрнут и с другим
// периодом — против явного повтора. Тон зоны и запечённый свет остаются в цвете вершины.
import * as THREE from 'three';
import { CHUNK, FBuf, L, NCH, UBuf, clamp, faceDist, hash3, hashAt, makeTpl, mod, segDist, smooth, vnoise, wrap } from './worldgeo.ts';
import type { Tpl } from './worldgeo.ts';

// ---------- данные уровня (поля level-data.json, которые нужны картинке) ----------

export interface LevelPoint {
  readonly x: number;
  readonly z: number;
}

/** Круг (t: 'c' — x, z, r) или капсула (t: 's' — x0, z0, x1, z1, r) */
export interface LevelShape {
  readonly t: string;
  readonly kind: string;
  readonly r: number;
  readonly x?: number;
  readonly z?: number;
  readonly x0?: number;
  readonly z0?: number;
  readonly x1?: number;
  readonly z1?: number;
  readonly h?: number;
}

export interface LevelData {
  readonly map: { readonly L: number; readonly chunk: number; readonly chunksPerSide: number };
  readonly zones: ReadonlyArray<{ readonly id: string; readonly seed: LevelPoint; readonly weight: number }>;
  readonly avenues: ReadonlyArray<{ readonly id: string; readonly kind: string; readonly width: number; readonly line: ReadonlyArray<ReadonlyArray<number>> }>;
  readonly landmarks: ReadonlyArray<{ readonly id: string; readonly x: number; readonly z: number; readonly r: number }>;
  readonly hazards: ReadonlyArray<LevelShape>;
  readonly obstacles: ReadonlyArray<LevelShape>;
  readonly buildings: { readonly brazier: ReadonlyArray<LevelPoint>; readonly cursedChest?: ReadonlyArray<LevelPoint> };
}

// ---------- палитра (level.md §6) ----------

const lin = (hex: number, k = 1): [number, number, number] => {
  const c = new THREE.Color().setHex(hex);
  return [c.r * k, c.g * k, c.b * k];
};

/** Пол зон */
const FLOOR: Record<string, number> = {
  cellars: 0x6e5644,
  mushrooms: 0x4f5a3a,
  crystals: 0x30535a,
  mine: 0x5f4f3c,
  jam: 0x4f3a52,
};
/** Средний цвет текстуры пола зоны (линейный; печатает tools/survivors/floor/make-tiles.mjs). Пол = цвет вершины ×
 *  текстура / средний: текстура даёт рисунок, общий тон зоны остаётся прежним. */
const FLOOR_MEAN: Record<string, [number, number, number]> = {
  cellars: [0.1884, 0.095, 0.0519],
  mushrooms: [0.1008, 0.0706, 0.0252],
  crystals: [0.1385, 0.0863, 0.0722],
  mine: [0.167, 0.0867, 0.0439],
  jam: [0.1489, 0.0705, 0.048],
};
/** Текстур пола в шейдере (по порядку зон level-data.json) */
const FLOOR_SLOTS = 5;
/** Период рисунка пола, м (делит 240); второй слой — 240 / 22 м, повёрнут на 90° */
const FLOOR_TILE = 10;
const FLOOR_TILE2 = 240 / 22;
/** Сила рисунка по зонам: 1 — как на картинке, меньше — спокойнее (мобы и эффекты читаются лучше) */
const FLOOR_K: Record<string, number> = { cellars: 0.85, mushrooms: 0.6, crystals: 0.85, mine: 0.8, jam: 0.85 };
const VOID = lin(0x120d0b);
const MOSS = lin(0x46622a);
const SLATE = lin(0x4f8088);
const PLUM = lin(0x35223c);
const RUST = lin(0x7a5636);
const ROAD = lin(0x8a735c);
const BALLAST = lin(0x3b3129);

/** Свет, запечённый в пол и пропы (множитель к цвету вершины, линейный) */
const FIRE = lin(0xffa040, 1.7);
const CRYSTAL = lin(0x7fe0d4, 1.2);
const JAM = lin(0xb25fd6, 1.0);
const MUSH = lin(0xe0c060, 0.8);
const DAY = lin(0xfff0d8, 1.3);
const VEIN_LIT = lin(0xb070f0, 0.9);
/** Сама жила в материале свечения */
const VEIN_GLOW = lin(0xc58cff, 1.7);

/** Общий свет без ламп: доля яркости пола (под ACES ~0,32 ≈ 35 % яркости, см. отчёт) */
const AMBIENT = 0.32;
/** Высота луж над полом */
const LIQUID_Y = 0.02;
/** Жила над полом и над лужами (≥ 1,5 см от обоих) */
const VEIN_Y = 0.04;
/** Порог переезда куска в другую копию, м */
const HYST = 2;

/** Части, которые не рисуем: висят над героем */
const SKIP = new Set(['well_stairs_grate', 'mushroom_patriarch_cap', 'gate_arch_top']);

/** Мелкий декор без коллизии по зонам */
const DECOR: Record<string, readonly string[]> = {
  cellars: ['floor_decal_kit_slabs', 'floor_decal_kit_slabs', 'floor_decal_kit_pebbles', 'floor_decal_kit_crack', 'floor_decal_kit_crack', 'floor_decal_kit_bottle', 'floor_decal_kit_bottle', 'floor_decal_kit_shards', 'floor_decal_kit_shards', 'floor_decal_kit_gravel', 'floor_decal_kit_chain'],
  mushrooms: ['floor_decal_kit_shroomlets', 'floor_decal_kit_shroomlets', 'floor_decal_kit_shroomlets', 'floor_decal_kit_moss', 'floor_decal_kit_moss', 'floor_decal_kit_moss', 'mushroom_cluster_a', 'mushroom_cluster_b', 'mushroom_cluster_c', 'floor_decal_kit_pebbles', 'floor_decal_kit_crack'],
  crystals: ['floor_decal_kit_crystal_shards', 'floor_decal_kit_crystal_shards', 'floor_decal_kit_crystal_shards', 'floor_decal_kit_pebbles', 'floor_decal_kit_pebbles', 'floor_decal_kit_gravel', 'floor_decal_kit_gravel', 'floor_decal_kit_crack', 'floor_decal_kit_crack', 'floor_decal_kit_slabs'],
  mine: ['floor_decal_kit_gravel', 'floor_decal_kit_gravel', 'floor_decal_kit_gravel', 'floor_decal_kit_sleeper', 'floor_decal_kit_sleeper', 'floor_decal_kit_chain', 'floor_decal_kit_pebbles', 'floor_decal_kit_pebbles', 'floor_decal_kit_crack', 'floor_decal_kit_shards'],
  jam: ['floor_decal_kit_jam_drops', 'floor_decal_kit_jam_drops', 'floor_decal_kit_jam_drops', 'floor_decal_kit_crack', 'floor_decal_kit_crack', 'floor_decal_kit_gravel', 'floor_decal_kit_pebbles', 'floor_decal_kit_bottle'],
};

// ---------- шейдер пола (вставка в MeshStandardMaterial пропов и пола) ----------

const FLOOR_FRAG = `
uniform sampler2D uFl0;
uniform sampler2D uFl1;
uniform sampler2D uFl2;
uniform sampler2D uFl3;
uniform sampler2D uFl4;
uniform vec3 uFlMean[${FLOOR_SLOTS}];
uniform float uFlK[${FLOOR_SLOTS}];
varying vec4 vZone;
varying vec2 vFlP;
// два слоя одной текстуры; где маска переходит, светлое (камень) ложится поверх тёмного (шов), без двойного рисунка
vec3 flTex(sampler2D t, vec2 a, vec2 ax, vec2 ay, vec2 b, vec2 bx, vec2 by, float m) {
  vec3 ca = textureGrad(t, a, ax, ay).rgb;
  vec3 cb = textureGrad(t, b, bx, by).rgb;
  float ha = dot(ca, vec3(0.3, 0.59, 0.11)) + 1.0 - m;
  float hb = dot(cb, vec3(0.3, 0.59, 0.11)) + m;
  float top = max(ha, hb) - 0.04;
  float wa = max(ha - top, 0.0);
  float wb = max(hb - top, 0.0);
  return (ca * wa + cb * wb) / (wa + wb);
}
`;

const FLOOR_APPLY = `
  {
    vec2 flA = vFlP * ${(1 / FLOOR_TILE).toFixed(6)};
    vec2 flB = vec2(vFlP.y, -vFlP.x) * ${(1 / FLOOR_TILE2).toFixed(6)} + vec2(0.37, 0.71);
    vec2 flAx = dFdx(flA);
    vec2 flAy = dFdy(flA);
    vec2 flBx = dFdx(flB);
    vec2 flBy = dFdy(flB);
    float zs = vZone.x + vZone.y + vZone.z + vZone.w;
    if (zs < 1.5) {
      // маска слоёв: периодична на 240 (целые кратные), пятна 10–20 м
      vec2 q = vFlP * ${((2 * Math.PI) / 240).toFixed(7)};
      float m = clamp(0.5 + 0.3 * sin(q.x * 6.0 + 1.7 * sin(q.y * 4.0)) + 0.3 * sin(q.y * 5.0 + 1.3 * sin(q.x * 8.0 + 0.5)), 0.0, 1.0);
      float w4 = max(1.0 - zs, 0.0);
      vec3 fl = vec3(0.0);
      float ws = 0.0;
      if (vZone.x > 0.01) { fl += vZone.x * mix(vec3(1.0), flTex(uFl0, flA, flAx, flAy, flB, flBx, flBy, m) / uFlMean[0], uFlK[0]); ws += vZone.x; }
      if (vZone.y > 0.01) { fl += vZone.y * mix(vec3(1.0), flTex(uFl1, flA, flAx, flAy, flB, flBx, flBy, m) / uFlMean[1], uFlK[1]); ws += vZone.y; }
      if (vZone.z > 0.01) { fl += vZone.z * mix(vec3(1.0), flTex(uFl2, flA, flAx, flAy, flB, flBx, flBy, m) / uFlMean[2], uFlK[2]); ws += vZone.z; }
      if (vZone.w > 0.01) { fl += vZone.w * mix(vec3(1.0), flTex(uFl3, flA, flAx, flAy, flB, flBx, flBy, m) / uFlMean[3], uFlK[3]); ws += vZone.w; }
      if (w4 > 0.01) { fl += w4 * mix(vec3(1.0), flTex(uFl4, flA, flAx, flAy, flB, flBx, flBy, m) / uFlMean[4], uFlK[4]); ws += w4; }
      diffuseColor.rgb *= fl / max(ws, 0.001);
    }
  }`;

// ---------- внутренние типы ----------

/** Фигура в координатах тора: центр [0, 240) и половина отрезка */
interface Shape {
  kind: string;
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  r: number;
  h: number;
}

/** Статический источник света: отрезок (или точка) с ядром rc и спадом R */
interface Light {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  rc: number;
  R: number;
  y: number;
  c: readonly number[];
  k: number;
}

interface Placement {
  tpl: string;
  x: number;
  z: number;
  y: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  tint: number;
}

/** Фигура/свет в координатах куска (от его угла) */
interface LSeg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  big: boolean;
}

interface LLight {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  rc: number;
  R: number;
  y: number;
  r: number;
  g: number;
  b: number;
}

interface Chunk {
  cx: number;
  cz: number;
  group: THREE.Group | null;
  kx: number;
  kz: number;
  tris: number;
  meshes: number;
}

class OpaqueBuf {
  pos = new FBuf(1 << 16);
  nor = new FBuf(1 << 16);
  col = new FBuf(1 << 16);
  lit = new FBuf(1 << 16);
  idx = new UBuf(1 << 17);
  n = 0;
}

class GlowBuf {
  pos = new FBuf(1 << 12);
  col = new FBuf(1 << 12);
  idx = new UBuf(1 << 13);
  n = 0;
}

class LiquidBuf {
  pos = new FBuf(1 << 11);
  dat = new FBuf(1 << 11);
  idx = new UBuf(1 << 12);
  n = 0;
}

export interface DungeonWorldInfo {
  chunks: number;
  trisMin: number;
  trisAvg: number;
  trisMax: number;
  meshesMax: number;
  buildMs: number;
  missingProps: string[];
}

export class DungeonWorld {
  readonly root: THREE.Group;
  /** Цифры сборки: для замера и экрана отладки */
  readonly info: DungeonWorldInfo = { chunks: 0, trisMin: 0, trisAvg: 0, trisMax: 0, meshesMax: 0, buildMs: 0, missingProps: [] };

  private readonly kits: Map<string, THREE.Object3D>;
  private readonly tpls = new Map<string, Tpl | null>();
  private readonly uTime = { value: 0 };
  private readonly uAmbient = { value: AMBIENT };
  /** Текстуры пола по зонам (пусто — пол как раньше, одним цветом вершин) */
  private readonly floorTex: (THREE.Texture | null)[] = [];
  private readonly matOpaque: THREE.MeshStandardMaterial;
  private readonly matGlow: THREE.MeshBasicMaterial;
  private readonly matLiquid: THREE.ShaderMaterial;

  private readonly zoneIds: string[] = [];
  private readonly zoneSeeds: { x: number; z: number; w: number }[] = [];
  private readonly zoneCol: [number, number, number][] = [];
  private readonly zw: Float64Array;
  private readonly zi: Record<string, number> = {};

  private readonly obstacles: Shape[] = [];
  private readonly pits: Shape[] = [];
  private readonly liquids: (Shape & { deep: number })[] = [];
  private readonly shafts: { x: number; z: number; half: number }[] = [];
  private readonly lights: Light[] = [];
  private readonly placements: Placement[][] = [];
  private readonly chunks: Chunk[] = [];

  private roadX = 120;
  private roadHalf = 3.5;
  private railZ = 204;
  private spur: number[] | null = [168, 204, 168, 200];
  private well: LevelPoint = { x: 120, z: 120 };
  private next = 0;
  private camX: number;
  private camZ: number;
  private buildMs = 0;

  /** kits — корневые узлы всех kit_*.glb по имени (позиция сброшена в 0); level — разобранный level-data.json.
   *  opts.lazy — не строить в конструкторе: тогда зовите buildStep() на экране загрузки, пока не вернёт true.
   *  opts.floor — текстуры пола по id зоны (worldlink.ts); без них пол одним цветом вершин, как раньше. */
  constructor(kits: Map<string, THREE.Object3D>, level: LevelData, opts?: { lazy?: boolean; floor?: ReadonlyMap<string, THREE.Texture> }) {
    const t0 = performance.now();
    this.kits = kits;
    this.root = new THREE.Group();
    this.root.name = 'dungeon-world';

    for (const z of level.zones) {
      this.zi[z.id] = this.zoneIds.length;
      this.zoneIds.push(z.id);
      this.zoneSeeds.push({ x: z.seed.x, z: z.seed.z, w: z.weight });
      this.zoneCol.push(lin(FLOOR[z.id] ?? 0x5f4f3c));
    }
    // текстуры пола: нужны все зоны (у каждой своя), иначе — прежний пол
    if (opts?.floor && this.zoneIds.length <= FLOOR_SLOTS && this.zoneIds.every((id) => opts.floor?.has(id) && FLOOR_MEAN[id])) {
      for (const id of this.zoneIds) this.floorTex.push(opts.floor.get(id) ?? null);
    }
    this.matOpaque = this.makeOpaque();
    this.matGlow = this.makeGlow();
    this.matLiquid = this.makeLiquid();
    this.zw = new Float64Array(this.zoneIds.length);
    this.camX = this.well.x;
    this.camZ = this.well.z;

    for (const a of level.avenues) {
      const p = a.line;
      if (a.kind === 'road' && p.length >= 2) {
        this.roadX = p[0][0];
        this.roadHalf = a.width / 2;
      } else if (a.id === 'rails' && p.length >= 2) this.railZ = p[0][1];
      else if (a.id === 'rail_spur' && p.length >= 2) this.spur = [p[0][0], p[0][1], p[1][0], p[1][1]];
    }
    const well = level.landmarks.find((l) => l.id === 'well');
    if (well) this.well = { x: well.x, z: well.z };
    this.camX = this.well.x;
    this.camZ = this.well.z;

    for (let i = 0; i < NCH * NCH; i++) this.placements.push([]);
    this.layout(level);
    for (let cz = 0; cz < NCH; cz++) {
      for (let cx = 0; cx < NCH; cx++) this.chunks.push({ cx, cz, group: null, kx: 0, kz: 0, tris: 0, meshes: 0 });
    }
    this.buildMs += performance.now() - t0;
    if (!opts?.lazy) while (!this.buildStep());
  }

  /** Построить следующий кусок. true — карта готова. */
  buildStep(): boolean {
    if (this.next >= this.chunks.length) return true;
    const t0 = performance.now();
    this.buildChunk(this.chunks[this.next++]);
    this.buildMs += performance.now() - t0;
    if (this.next >= this.chunks.length) {
      this.finishInfo();
      return true;
    }
    return false;
  }

  /** Камера в несвёрнутых координатах; time — секунды */
  update(camX: number, camZ: number, time: number): void {
    this.uTime.value = time;
    this.camX = camX;
    this.camZ = camZ;
    for (const ch of this.chunks) if (ch.group) this.place(ch, false);
  }

  /** Общий свет пола без ламп (0,32 ≈ 35 % яркости под ACES). Меняется без пересборки шейдеров. */
  setAmbient(v: number): void {
    this.uAmbient.value = v;
  }

  dispose(): void {
    for (const ch of this.chunks) {
      if (!ch.group) continue;
      for (const o of ch.group.children) (o as THREE.Mesh).geometry.dispose();
      this.root.remove(ch.group);
      ch.group = null;
    }
    this.matOpaque.dispose();
    for (const t of this.floorTex) t?.dispose();
    this.matGlow.dispose();
    this.matLiquid.dispose();
  }

  // ---------- материалы ----------

  private makeOpaque(): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    m.name = 'dungeon-opaque';
    // aLit.rgb — запечённые пятна света, aLit.a — доля общего света (у пола 1, у боков пропов меньше).
    // Светится как «излучение» поверх ламп сцены: пол читается и без фонаря героя.
    // Пол: aZone — веса зон 0–3 (вес зоны 4 = 1 − сумма); у пропов все 1 → текстуры нет.
    const tex = this.floorTex.length > 0;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uAmbient = this.uAmbient;
      let vs = 'attribute vec4 aLit;\nvarying vec4 vLit;\n';
      let vb = '#include <color_vertex>\n  vLit = aLit;';
      let fs = 'uniform float uAmbient;\nvarying vec4 vLit;\n';
      let fb = '#include <color_fragment>';
      if (tex) {
        const mean: THREE.Vector3[] = [];
        const k: number[] = [];
        for (let i = 0; i < FLOOR_SLOTS; i++) {
          const id = this.zoneIds[i] ?? this.zoneIds[0];
          sh.uniforms[`uFl${i}`] = { value: this.floorTex[i] ?? this.floorTex[0] };
          const c = FLOOR_MEAN[id];
          mean.push(new THREE.Vector3(c[0], c[1], c[2]));
          k.push(FLOOR_K[id] ?? 0.85);
        }
        sh.uniforms.uFlMean = { value: mean };
        sh.uniforms.uFlK = { value: k };
        vs += 'attribute vec4 aZone;\nvarying vec4 vZone;\nvarying vec2 vFlP;\n';
        vb += '\n  vZone = aZone;\n  vFlP = (modelMatrix * vec4(position, 1.0)).xz;';
        fs += FLOOR_FRAG;
        fb += FLOOR_APPLY;
      }
      sh.vertexShader = vs + sh.vertexShader.replace('#include <color_vertex>', vb);
      sh.fragmentShader = fs + sh.fragmentShader
        .replace('#include <color_fragment>', fb)
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * (uAmbient * vLit.a + vLit.rgb);',
        );
    };
    m.customProgramCacheKey = () => (tex ? 'dungeon-opaque-floor' : 'dungeon-opaque');
    return m;
  }

  private makeGlow(): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    m.name = 'dungeon-glow';
    // Огонь (красный > синего) мерцает, кристаллы и варенье медленно дышат. Фаза — от места.
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = 'uniform float uTime;\nvarying float vFlick;\n' + sh.vertexShader.replace(
        '#include <color_vertex>',
        `#include <color_vertex>
  vec4 gwp = modelMatrix * vec4(position, 1.0);
  float gph = dot(floor(gwp.xz * 0.8), vec2(1.7, 3.1));
  float gamp = clamp(color.r - color.b, 0.0, 1.0) * 0.12;
  vFlick = 1.0 + gamp * (0.6 * sin(uTime * 9.0 + gph) + 0.4 * sin(uTime * 15.3 + gph * 2.3)) + 0.07 * sin(uTime * 1.6 + gph);`,
      );
      sh.fragmentShader = 'varying float vFlick;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vFlick;');
    };
    m.customProgramCacheKey = () => 'dungeon-glow';
    return m;
  }

  private makeLiquid(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      name: 'dungeon-liquid',
      uniforms: { uTime: this.uTime },
      vertexShader: `
attribute vec3 aData;
varying vec3 vData;
varying vec2 vP;
void main() {
  vData = aData;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
      fragmentShader: `
uniform float uTime;
varying vec3 vData;
varying vec2 vP;
void main() {
  float edge = vData.y;
  float deep = vData.z;
  vec2 p = vP;
  float t = uTime;
  float w1 = sin(dot(p, vec2(0.83, 0.55)) * 2.1 + t * 1.3);
  float w2 = sin(dot(p, vec2(-0.47, 0.88)) * 2.9 - t * 1.7);
  float w3 = sin(dot(p, vec2(0.21, -0.98)) * 5.3 + t * 2.3);
  float wave = (w1 + w2 + 0.5 * w3) / 2.5;
  vec3 col;
  if (vData.x < 0.5) {
    // вода: тёмная, бирюзовый блик бежит по ряби, светлая кромка у берега
    col = mix(vec3(0.016, 0.05, 0.056), vec3(0.003, 0.009, 0.012), deep);
    float glint = pow(clamp(wave * 0.5 + 0.5, 0.0, 1.0), 7.0);
    col += vec3(0.11, 0.5, 0.44) * glint * mix(0.55, 0.22, deep);
    col += vec3(0.06, 0.2, 0.19) * smoothstep(0.84, 1.0, edge) * (0.65 + 0.35 * w2);
  } else {
    // варенье: густое сиреневое, глянцевые полосы, пузыри и свечение по краю
    col = mix(vec3(0.15, 0.022, 0.2), vec3(0.06, 0.008, 0.08), 0.5 + 0.25 * wave);
    float gl = pow(clamp(sin(dot(p, vec2(0.6, 0.8)) * 1.7 + t * 0.6 + w3 * 0.6) * 0.5 + 0.5, 0.0, 1.0), 14.0);
    col += vec3(0.85, 0.55, 1.0) * gl * 0.3;
    col += vec3(0.45, 0.11, 0.67) * smoothstep(0.55, 1.0, edge) * (1.1 + 0.3 * sin(t * 2.0 + p.x * 0.7 + p.y * 0.5));
    vec2 c = floor(p * 1.3);
    vec2 f = fract(p * 1.3) - 0.5;
    float h = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
    float life = fract(t * 0.35 + h);
    float bub = (1.0 - smoothstep(0.1 * life, 0.16 * life + 0.001, length(f - (h - 0.5) * 0.4))) * step(0.62, h) * (1.0 - life);
    col += vec3(0.5, 0.2, 0.7) * bub * 0.7;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    });
  }

  // ---------- зоны: силовая диаграмма на торе, граница — плавная полоса 12 м ----------

  /** Веса зон в точке (в this.zw, сумма 1); ответ — индекс главной зоны */
  private zoneAt(x: number, z: number): number {
    // волнистая граница: сдвигаем точку периодическим шумом
    const px = x + 6 * (vnoise(x, z, 24, 101) - 0.5) + 3 * (vnoise(x, z, 8, 103) - 0.5);
    const pz = z + 6 * (vnoise(x, z, 24, 102) - 0.5) + 3 * (vnoise(x, z, 8, 104) - 0.5);
    const n = this.zoneSeeds.length;
    let best = 0;
    let bestP = Infinity;
    const P = this.zw;
    for (let i = 0; i < n; i++) {
      const s = this.zoneSeeds[i];
      const dx = wrap(s.x - px);
      const dz = wrap(s.z - pz);
      P[i] = dx * dx + dz * dz - s.w;
      if (P[i] < bestP) {
        bestP = P[i];
        best = i;
      }
    }
    const sb = this.zoneSeeds[best];
    const bx = wrap(sb.x - px);
    const bz = wrap(sb.z - pz);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (i === best) {
        P[i] = 1;
      } else {
        const s = this.zoneSeeds[i];
        const sep = Math.hypot(wrap(s.x - px) - bx, wrap(s.z - pz) - bz);
        const e = sep > 1e-6 ? (P[i] - bestP) / (2 * sep) : 1e9;
        const w = clamp(1 - e / 6, 0, 1);
        P[i] = w * w * (3 - 2 * w);
      }
      sum += P[i];
    }
    for (let i = 0; i < n; i++) P[i] /= sum;
    return best;
  }

  // ---------- раскладка ----------

  private tpl(name: string): Tpl | null {
    let t = this.tpls.get(name);
    if (t !== undefined) return t;
    const node = this.kits.get(name);
    t = node ? makeTpl(node, SKIP) : null;
    if (!node) this.info.missingProps.push(name);
    this.tpls.set(name, t);
    return t;
  }

  private add(tpl: string, x: number, z: number, yaw: number, sx = 1, sy = sx, sz = sx, y = 0): void {
    if (!this.tpl(tpl)) return;
    const wx = mod(x, L);
    const wz = mod(z, L);
    const ci = Math.min(NCH - 1, Math.floor(wz / CHUNK)) * NCH + Math.min(NCH - 1, Math.floor(wx / CHUNK));
    const tint = 0.9 + 0.2 * hashAt(x, z, 991);
    this.placements[ci].push({ tpl, x: wx, z: wz, y, yaw, sx, sy, sz, tint });
  }

  private light(x: number, z: number, R: number, c: readonly number[], k: number, y = 1, rc = 0, hx = 0, hz = 0): void {
    this.lights.push({ cx: mod(x, L), cz: mod(z, L), hx, hz, rc, R, y, c, k });
  }

  /** Есть ли твёрдое ближе d к точке (через wrap) */
  private blocked(x: number, z: number, d: number): boolean {
    for (const s of this.obstacles) {
      const dx = wrap(s.cx - x);
      const dz = wrap(s.cz - z);
      if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
      if (segDist(0, 0, dx - s.hx, dz - s.hz, dx + s.hx, dz + s.hz) < s.r + d) return true;
    }
    return false;
  }

  private layout(level: LevelData): void {
    const norm = (o: LevelShape): Shape => {
      if (o.t === 's' && o.x0 !== undefined && o.z0 !== undefined && o.x1 !== undefined && o.z1 !== undefined) {
        const hx = wrap(o.x1 - o.x0) / 2;
        const hz = wrap(o.z1 - o.z0) / 2;
        return { kind: o.kind, cx: mod(o.x0 + hx, L), cz: mod(o.z0 + hz, L), hx, hz, r: o.r, h: o.h ?? 2 };
      }
      return { kind: o.kind, cx: mod(o.x ?? 0, L), cz: mod(o.z ?? 0, L), hx: 0, hz: 0, r: o.r, h: o.h ?? 2 };
    };
    for (const o of level.obstacles) this.obstacles.push(norm(o));

    // --- опасности ---
    const kop = level.landmarks.find((l) => l.id === 'kopyor');
    let lake: Shape | null = null;
    for (const o of level.hazards) {
      const s = norm(o);
      if (s.kind === 'pit') {
        if (kop && Math.hypot(wrap(s.cx - kop.x), wrap(s.cz - kop.z)) < 1) {
          this.shafts.push({ x: s.cx, z: s.cz, half: 1.3 });
        } else if (s.r >= 8) {
          lake = s;
        } else {
          this.pits.push(s);
          this.add('pit_rim', s.cx, s.cz, hashAt(s.cx, s.cz, 3) * Math.PI * 2, s.r / 3);
        }
      }
    }
    for (const o of level.hazards) {
      const s = norm(o);
      if (s.kind === 'water') {
        if (lake && Math.hypot(wrap(s.cx - lake.cx), wrap(s.cz - lake.cz)) < 1) continue;
        this.liquids.push({ ...s, deep: 0 });
        this.light(s.cx, s.cz, 1.4, CRYSTAL, 0.22, 0, s.r);
      } else if (s.kind === 'jam') {
        this.liquids.push({ ...s, deep: 0 });
        this.light(s.cx, s.cz, 2.0, JAM, 0.75, 0, s.r, s.hx, s.hz);
      }
    }
    if (lake) {
      const ring = level.hazards.find((o) => o.kind === 'water' && o.t === 'c' && Math.hypot(wrap((o.x ?? 0) - lake.cx), wrap((o.z ?? 0) - lake.cz)) < 1);
      const R = ring ? ring.r : lake.r + 4;
      this.liquids.push({ ...lake, kind: 'water', r: R, deep: lake.r });
      this.light(lake.cx, lake.cz, 2, CRYSTAL, 0.2, 0, R);
      this.add('lake_island', lake.cx, lake.cz, hashAt(lake.cx, lake.cz, 5) * Math.PI * 2, 1, 1, 1, LIQUID_Y);
      this.light(lake.cx, lake.cz, 6.5, CRYSTAL, 0.8, 1, 1.5);
    }
    if (kop) {
      this.add('kopyor', kop.x, kop.z, 0);
      this.light(kop.x, kop.z + 1.6, 3.5, FIRE, 0.5, 2.7);
    }

    // --- колодец: лестница, мозаика, столб дневного света ---
    this.add('well_stairs', this.well.x, this.well.z, 0);
    this.light(this.well.x, this.well.z, 7.5, DAY, 1.2, 0, 1);
    this.light(this.well.x - 5.35, this.well.z - 1.9, 3.2, FIRE, 0.8, 1.3);
    this.light(this.well.x - 5.35, this.well.z + 1.9, 3.2, FIRE, 0.8, 1.3);

    // --- препятствия → пропы ---
    const chests = level.buildings.cursedChest ?? [];
    const timbers = this.obstacles.filter((s) => s.kind === 'timber_support');
    const TAU = Math.PI * 2;
    const sc = (r: number, nominal: number): number => clamp(r / nominal, 0.85, 1.15);
    for (const s of this.obstacles) {
      const { cx: x, cz: z, r } = s;
      const h1 = hashAt(x, z, 7);
      const h2 = hashAt(x, z, 13);
      const h3 = hashAt(x, z, 17);
      const yawFree = h2 * TAU;
      switch (s.kind) {
        case 'stairs':
          break; // лестница — часть well_stairs у колодца
        case 'brick_pillar': {
          const v = h1 < 0.6 ? 'brick_pillar_a' : 'brick_pillar_b';
          const yaw = Math.floor(h2 * 4) * (Math.PI / 2);
          const k = sc(r, 0.8);
          this.add(v, x, z, yaw, k);
          if (h3 < 0.42) this.wallTorch(v, x, z, yaw, k, Math.floor(hashAt(x, z, 19) * 4));
          break;
        }
        case 'barrel_stack':
          this.add(h1 < 0.5 ? 'barrel_stack_a' : 'barrel_stack_b', x, z, yawFree, sc(r, 1.0));
          break;
        case 'crate_stack':
          this.add(h1 < 0.5 ? 'crate_stack_a' : 'crate_stack_b', x, z, yawFree, sc(r, 0.85));
          break;
        case 'wine_rack': {
          const len = 2 * Math.hypot(s.hx, s.hz) + 0.6;
          const n = Math.max(1, Math.round(len / 7.3));
          const yaw = Math.atan2(-s.hz, s.hx);
          for (let i = 0; i < n; i++) {
            const f = (i + 0.5) / n - 0.5;
            const v = (i + Math.floor(h1 * 2)) % 2 === 0 ? 'wine_rack_a' : 'wine_rack_b';
            this.add(v, x + 2 * s.hx * f, z + 2 * s.hz * f, yaw, len / n / 7.3, 1, 1);
          }
          break;
        }
        case 'giant_barrel':
          this.add('giant_barrel', x, z, yawFree, sc(r, 3.2));
          this.light(x, z, 6, FIRE, 0.45, 2);
          break;
        case 'ring_mushroom':
          this.add('ring_mushroom', x, z, yawFree, sc(r, 0.9));
          this.light(x, z, 2.8, MUSH, 0.6, 1.2);
          break;
        case 'mushroom_big': {
          const v = h1 < 0.34 ? 'mushroom_big_a' : h1 < 0.67 ? 'mushroom_big_b' : 'mushroom_big_c';
          const nom = v === 'mushroom_big_a' ? 1.6 : v === 'mushroom_big_b' ? 1.35 : 1.8;
          this.add(v, x, z, yawFree, sc(r, nom));
          this.light(x, z, 2.6 + r, MUSH, 0.55, 2);
          break;
        }
        case 'patriarch_stem':
          this.add('mushroom_patriarch', x, z, yawFree);
          this.light(x, z, 8, MUSH, 0.6, 2, 2);
          break;
        case 'puffball':
          this.add(h1 < 0.6 ? 'puffball_a' : 'puffball_b', x, z, yawFree, sc(r, 1.15));
          break;
        case 'root_ridge': {
          const len = 2 * Math.hypot(s.hx, s.hz) + 0.8 * r;
          const v = len < 7.4 ? 'root_ridge_5' : 'root_ridge_9';
          const base = v === 'root_ridge_5' ? 5.4 : 9.4;
          const yaw = Math.atan2(-s.hz, s.hx) + (h1 < 0.5 ? 0 : Math.PI);
          this.add(v, x, z, yaw, clamp(len / base, 0.75, 1.35), 1, 1);
          break;
        }
        case 'crystal_cluster': {
          const v = r < 0.95 ? 'crystal_cluster_s' : r < 1.3 ? 'crystal_cluster_m' : 'crystal_cluster_l';
          const nom = v === 'crystal_cluster_s' ? 0.7 : v === 'crystal_cluster_m' ? 1.1 : 1.5;
          this.add(v, x, z, yawFree, sc(r, nom));
          this.light(x, z, 2.2 + 1.4 * r, CRYSTAL, 0.9, 1.2);
          break;
        }
        case 'druse':
          this.add('crystal_druse', x, z, yawFree, sc(r, 2.6));
          this.light(x, z, 12, CRYSTAL, 0.85, 2, 2.6);
          break;
        case 'stalagmite': {
          const v = ['stalagmite_a', 'stalagmite_b', 'stalagmite_c', 'stalagmite_d'][Math.floor(h1 * 4)];
          this.add(v, x, z, yawFree, sc(r, 0.75));
          break;
        }
        case 'rock_mass': {
          const v = r < 5.5 ? 'rock_mass_a' : r < 6.5 ? 'rock_mass_b' : 'rock_mass_c';
          const nom = v === 'rock_mass_a' ? 5 : v === 'rock_mass_b' ? 6 : 7;
          const k = sc(r, nom);
          this.add(v, x, z, yawFree, k, 1, k); // срез ровно на 3 м — высоту не масштабируем
          break;
        }
        case 'rock_ridge': {
          const len = 2 * Math.hypot(s.hx, s.hz) + 1.4 * r;
          const v = len < 8.5 ? 'rock_ridge_6' : len < 12.5 ? 'rock_ridge_10' : 'rock_ridge_14';
          const base = v === 'rock_ridge_6' ? 5.8 : v === 'rock_ridge_10' ? 10 : 14.4;
          const yaw = Math.atan2(-s.hz, s.hx) + (h1 < 0.5 ? 0 : Math.PI);
          this.add(v, x, z, yaw, clamp(len / base, 0.8, 1.3), 1, clamp(r / 1.0, 0.9, 1.1));
          break;
        }
        case 'rubble':
          this.add(h1 < 0.5 ? 'rubble_a' : 'rubble_b', x, z, yawFree, sc(r, 1.35));
          break;
        case 'ore_pile':
          this.add(h1 < 0.5 ? 'ore_pile_a' : 'ore_pile_b', x, z, yawFree, sc(r, h1 < 0.5 ? 1.25 : 0.95));
          this.light(x, z, 2.2, CRYSTAL, 0.25, 0.5);
          break;
        case 'ore_heap':
          this.add('ore_heap', x, z, yawFree, sc(r, 3.4));
          this.light(x, z, 4.5, CRYSTAL, 0.3, 1, 2);
          break;
        case 'cart_wreck':
          this.add('minecart_broken', x, z, yawFree, sc(r, 1.1));
          break;
        case 'timber_support': {
          // пары через 5,2 м: подкос (+X пропа) — наружу от напарника
          let px = 0;
          let pz = 0;
          let best = 6.5;
          for (const o of timbers) {
            if (o === s) continue;
            const dx = wrap(o.cx - x);
            const dz = wrap(o.cz - z);
            const d = Math.hypot(dx, dz);
            if (d > 3.5 && d < best) {
              best = d;
              px = dx / d;
              pz = dz / d;
            }
          }
          const paired = best < 6.5;
          const yaw = paired ? Math.atan2(pz, -px) : yawFree;
          this.add(h1 < 0.75 ? 'timber_support_a' : 'timber_support_b', x, z, yaw);
          if (paired && h3 < 0.3) {
            const side = hashAt(x, z, 23) < 0.5 ? 1 : -1;
            const tx = x - pz * 1.3 * side;
            const tz = z + px * 1.3 * side;
            if (!this.blocked(tx, tz, 0.5)) {
              this.add('torch_stand_floor', tx, tz, yawFree);
              this.light(tx, tz, 4, FIRE, 1.0, 2.1);
            }
          }
          break;
        }
        case 'vat':
          this.add(h1 < 0.6 ? 'jam_vat_a' : 'jam_vat_b', x, z, yawFree, sc(r, 1.45));
          this.light(x, z, 2.4, JAM, 0.35, 1, r);
          break;
        case 'jam_rock':
          this.add(h1 < 0.5 ? 'jam_rock_a' : 'jam_rock_b', x, z, yawFree, sc(r, h1 < 0.5 ? 1.0 : 1.2));
          this.light(x, z, 2, JAM, 0.3, 0.6, r * 0.7);
          break;
        case 'cauldron':
          this.add('jam_cauldron', x, z, 0, sc(r, 4));
          this.light(x, z, 9, JAM, 0.6, 1.5, 4);
          this.light(x, z, 6, FIRE, 0.5, 1, 2);
          break;
        case 'chest_column': {
          let yaw = yawFree;
          for (const c of chests) {
            const dx = wrap(c.x - x);
            const dz = wrap(c.z - z);
            if (Math.hypot(dx, dz) < 20) yaw = Math.atan2(dx, dz);
          }
          // колонна тоньше коллизии r 1,1: шире, но не выше
          this.add('chest_column', x, z, yaw, 1.35, 1, 1.35);
          this.light(x, z, 2.6, JAM, 0.5, 3);
          break;
        }
        default:
          break;
      }
    }

    // --- жаровни: только пятно света (сами жаровни рисует режим) ---
    for (const b of level.buildings.brazier) this.light(b.x, b.z, 3.6, FIRE, 1.0, 1.4);

    // --- рельсы: кольцо по z = railZ и ветка к копру ---
    for (let i = 0; i < L / 4; i++) {
      const x = 2 + 4 * i;
      if (this.blocked(x, this.railZ, 0.6)) continue;
      this.add('rail_straight_4m', x, this.railZ, Math.PI / 2);
    }
    if (this.spur) {
      const [x0, z0, x1, z1] = this.spur;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len > 1) {
        // до стыка с кольцом не доходим на 0,6 м: шпалы не ложатся друг на друга
        const ux = (x1 - x0) / len;
        const uz = (z1 - z0) / len;
        const mx = x0 + ux * (0.6 + 2);
        const mz = z0 + uz * (0.6 + 2);
        this.add('rail_straight_4m', mx, mz, Math.atan2(ux, uz));
      }
    }

    this.gates();
  }

  /** Настенный факел на грани колонны: задняя пластина к колонне, огонь наружу */
  private wallTorch(pillar: string, x: number, z: number, yaw: number, k: number, face: number): void {
    const t = this.tpl(pillar);
    if (!t) return;
    const dirs = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ];
    const [dx, dz] = dirs[face & 3];
    const fd = (faceDist(t, dx, dz) || 0.6) * k + 0.02;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const wx = c * dx + s * dz;
    const wz = -s * dx + c * dz;
    this.add('torch_stand_wall', x + wx * fd, z + wz * fd, Math.atan2(wx, wz));
    this.light(x + wx * (fd + 0.4), z + wz * (fd + 0.4), 4.5, FIRE, 1.1, 2.1);
  }

  /** Ворота перехода там, где тракт или рельсы пересекают границу зон */
  private gates(): void {
    const scan = (alongX: boolean, fixed: number): void => {
      let prev = -1;
      for (let t = 0; t <= L; t++) {
        const x = alongX ? t : fixed;
        const z = alongX ? fixed : t;
        const b = this.zoneAt(x, z);
        if (prev >= 0 && b !== prev) {
          const ids = [this.zoneIds[prev], this.zoneIds[b]];
          const gx = alongX ? t - 0.5 : fixed;
          const gz = alongX ? fixed : t - 0.5;
          let tpl = '';
          let c: readonly number[] = FIRE;
          if (ids.includes('crystals')) {
            tpl = 'crystal_fangs';
            c = CRYSTAL;
          } else if (ids.includes('jam')) {
            tpl = 'jam_beams';
            c = JAM;
          } else if (ids.includes('cellars') && ids.includes('mine')) tpl = 'gate_arch';
          const nearCross = Math.hypot(wrap(gx - this.roadX), wrap(gz - this.railZ)) < 9;
          if (tpl && !nearCross && !this.blocked(gx, gz, 4.5) && !this.wet(gx, gz, 4)) {
            this.add(tpl, gx, gz, alongX ? Math.PI / 2 : 0);
            if (tpl === 'gate_arch') {
              const ox = alongX ? 0 : 3.6;
              const oz = alongX ? 3.6 : 0;
              this.light(gx + ox, gz + oz, 3.5, FIRE, 1.0, 2);
              this.light(gx - ox, gz - oz, 3.5, FIRE, 1.0, 2);
            } else this.light(gx, gz, 5, c, 0.6, 1.5);
          }
        }
        prev = b;
      }
    };
    scan(false, this.roadX);
    scan(true, this.railZ);
  }

  private wet(x: number, z: number, d: number): boolean {
    for (const s of [...this.liquids, ...this.pits]) {
      const dx = wrap(s.cx - x);
      const dz = wrap(s.cz - z);
      if (segDist(0, 0, dx - s.hx, dz - s.hz, dx + s.hx, dz + s.hz) < s.r + d) return true;
    }
    return false;
  }

  // ---------- постройка куска ----------

  private buildChunk(ch: Chunk): void {
    const ox = ch.cx * CHUNK;
    const oz = ch.cz * CHUNK;
    const mx = ox + CHUNK / 2;
    const mz = oz + CHUNK / 2;
    const near = (cx: number, cz: number, ext: number): [number, number] | null => {
      const dx = wrap(cx - mx);
      const dz = wrap(cz - mz);
      return Math.abs(dx) < CHUNK / 2 + ext && Math.abs(dz) < CHUNK / 2 + ext ? [CHUNK / 2 + dx, CHUNK / 2 + dz] : null;
    };
    const seg = (s: Shape, ext: number, big = false): LSeg | null => {
      const p = near(s.cx, s.cz, ext + s.r + Math.abs(s.hx) + Math.abs(s.hz));
      return p ? { ax: p[0] - s.hx, az: p[1] - s.hz, bx: p[0] + s.hx, bz: p[1] + s.hz, r: s.r, big } : null;
    };
    const lights: LLight[] = [];
    for (const l of this.lights) {
      const p = near(l.cx, l.cz, l.R + l.rc + Math.abs(l.hx) + Math.abs(l.hz) + 18);
      if (p) lights.push({ ax: p[0] - l.hx, az: p[1] - l.hz, bx: p[0] + l.hx, bz: p[1] + l.hz, rc: l.rc, R: l.R, y: l.y, r: l.c[0] * l.k, g: l.c[1] * l.k, b: l.c[2] * l.k });
    }
    const obs: LSeg[] = [];
    for (const s of this.obstacles) {
      const q = seg(s, 3, s.kind === 'rock_mass' || s.kind === 'rock_ridge' || s.h >= 3);
      if (q) obs.push(q);
    }
    const pits: LSeg[] = [];
    for (const s of this.pits) {
      const q = seg(s, 2);
      if (q) pits.push(q);
    }
    const wets: LSeg[] = [];
    for (const s of this.liquids) {
      const q = seg(s, 2);
      if (q) wets.push(q);
    }
    const shafts: { x: number; z: number; half: number }[] = [];
    for (const s of this.shafts) {
      const p = near(s.x, s.z, 3);
      if (p) shafts.push({ x: p[0], z: p[1], half: s.half });
    }

    const ob = new OpaqueBuf();
    const gb = new GlowBuf();
    const lb = new LiquidBuf();
    const lit = [0, 0, 0];

    // --- пол ---
    const S = CHUNK + 1;
    const hole = new Uint8Array(S * S);
    ob.pos.grow(S * S * 3);
    ob.nor.grow(S * S * 3);
    ob.col.grow(S * S * 3);
    ob.lit.grow(S * S * 4);
    const zc = this.zoneCol;
    const iC = this.zi.cellars ?? -1;
    const iM = this.zi.mushrooms ?? -1;
    const iK = this.zi.crystals ?? -1;
    const iS = this.zi.mine ?? -1;
    const iJ = this.zi.jam ?? -1;
    const W = this.zw;
    const wOf = (i: number): number => (i >= 0 ? W[i] : 0);
    const tex = this.floorTex.length > 0;
    // веса зон 0–3 у вершин пола (0–255); у пропов и декора — 255 (нет текстуры)
    const zone = tex ? new Uint8Array(S * S * 4) : null;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const wx = mod(ox + i, L);
        const wz = mod(oz + j, L);
        this.zoneAt(wx, wz);
        let r = 0;
        let g = 0;
        let b = 0;
        for (let k = 0; k < zc.length; k++) {
          r += W[k] * zc[k][0];
          g += W[k] * zc[k][1];
          b += W[k] * zc[k][2];
        }
        const wC = wOf(iC);
        const wM = wOf(iM);
        const wK = wOf(iK);
        const wS = wOf(iS);
        const wJ = wOf(iJ);
        const jit = hash3(wx, wz, 4);
        let br = 0.8 + 0.4 * (0.55 * vnoise(wx, wz, 24, 1) + 0.45 * vnoise(wx, wz, 48, 2)) + 0.16 * (vnoise(wx, wz, 4, 3) - 0.5) + 0.1 * (jit - 0.5);
        // погреба — плиты 3 × 3 м с тёмными швами (с текстурой плиты рисует она)
        if (wC > 0 && !tex) br *= wx % 3 === 0 || wz % 3 === 0 ? 1 - 0.16 * wC : 1 + 0.04 * wC;
        if (zone) for (let k = 0; k < 4; k++) zone[ob.n * 4 + k] = k < W.length ? Math.round(W[k] * 255) : 0;
        // шахта — тёмные колеи
        if (wS > 0) br *= 1 - 0.22 * wS * smooth(0.55, 0.8, vnoise(wx, wz, 6, 10));
        // трещины везде
        br *= 1 - 0.28 * smooth(0.86, 0.97, 1 - Math.abs(2 * vnoise(wx, wz, 12, 12) - 1));
        r *= br;
        g *= br;
        b *= br;
        const mix = (c: readonly number[], k: number): void => {
          if (k <= 0) return;
          r += (c[0] - r) * k;
          g += (c[1] - g) * k;
          b += (c[2] - b) * k;
        };
        if (wM > 0) mix(MOSS, wM * 0.7 * smooth(0.5, 0.7, 0.65 * vnoise(wx, wz, 12, 7) + 0.35 * vnoise(wx, wz, 4, 8)));
        if (wK > 0) mix(SLATE, wK * 0.45 * clamp(1 - Math.abs(vnoise(wx, wz, 8, 9) - 0.5) * 7, 0, 1));
        if (wJ > 0) mix(PLUM, wJ * 0.55 * smooth(0.6, 0.78, vnoise(wx, wz, 8, 11)));
        if (wS > 0 && jit > 0.88) mix(RUST, wS * 0.45);
        // Винный тракт — светлее, мощёный, тёмные бордюры
        const dR = Math.abs(wrap(wx - this.roadX));
        if (dR < this.roadHalf + 0.8) {
          const k = 1 - smooth(this.roadHalf - 0.5, this.roadHalf + 0.4, dR);
          const cob = ((wx + wz) & 1 ? 1.08 : 0.92) * (0.95 + 0.1 * jit);
          const rr = (r + (ROAD[0] - r) * 0.6) * cob;
          const rg = (g + (ROAD[1] - g) * 0.6) * cob;
          const rb = (b + (ROAD[2] - b) * 0.6) * cob;
          r += (rr - r) * k;
          g += (rg - g) * k;
          b += (rb - b) * k;
          if (dR >= this.roadHalf - 0.5) {
            r *= 0.84;
            g *= 0.84;
            b *= 0.84;
          }
        }
        // насыпь под рельсами
        const dL = Math.abs(wrap(wz - this.railZ));
        if (dL < 2.4) mix(BALLAST, 0.6 * (1 - smooth(1.3, 2.2, dL)));
        if (this.spur) {
          const [sx0, sz0, sx1, sz1] = this.spur;
          const d = segDist(0, 0, wrap(sx0 - wx), wrap(sz0 - wz), wrap(sx1 - wx), wrap(sz1 - wz));
          if (d < 2.4) mix(BALLAST, 0.6 * (1 - smooth(1.3, 2.2, d)));
        }
        // затенение у подножий и мокрый пол у луж
        let ao = 1;
        for (const o of obs) {
          const d = segDist(i, j, o.ax, o.az, o.bx, o.bz) - o.r * 0.9;
          const halo = o.big ? 2.6 : 1.5;
          if (d < halo) {
            const f = 1 - Math.max(d, 0) / halo;
            ao *= 1 - (o.big ? 0.55 : 0.42) * f * f;
          }
        }
        for (const o of wets) {
          const d = segDist(i, j, o.ax, o.az, o.bx, o.bz) - o.r;
          if (d < 0.9) ao *= 0.6 + 0.4 * smooth(-0.3, 0.9, d);
        }
        ao = Math.max(ao, 0.38);
        r *= ao;
        g *= ao;
        b *= ao;
        // провалы и ствол копра — «ничто», треугольники целиком внутри выкидываем
        let vo = false;
        for (const p of pits) if (segDist(i, j, p.ax, p.az, p.bx, p.bz) < p.r + 0.5) vo = true;
        for (const s of shafts) if (Math.abs(i - s.x) <= s.half && Math.abs(j - s.z) <= s.half) vo = true;
        if (vo) {
          r = VOID[0];
          g = VOID[1];
          b = VOID[2];
          hole[j * S + i] = 1;
          lit[0] = lit[1] = lit[2] = 0;
        } else {
          this.evalLights(lights, ox, oz, i, 0, j, lit, 1);
        }
        const v = ob.n * 3;
        ob.pos.a.set([i, 0, j], v);
        ob.nor.a.set([0, 1, 0], v);
        ob.col.a.set([r, g, b], v);
        ob.lit.a.set([lit[0], lit[1], lit[2], 1], ob.n * 4);
        ob.n++;
      }
    }
    ob.pos.n = ob.nor.n = ob.col.n = ob.n * 3;
    ob.lit.n = ob.n * 4;
    ob.idx.grow(CHUNK * CHUNK * 6);
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const a = j * S + i;
        const bb = a + 1;
        const c = a + S;
        const d = c + 1;
        const ia = ob.idx.a;
        if (!(hole[a] && hole[c] && hole[bb])) {
          ia[ob.idx.n++] = a;
          ia[ob.idx.n++] = c;
          ia[ob.idx.n++] = bb;
        }
        if (!(hole[bb] && hole[c] && hole[d])) {
          ia[ob.idx.n++] = bb;
          ia[ob.idx.n++] = c;
          ia[ob.idx.n++] = d;
        }
      }
    }

    // --- пропы куска ---
    for (const p of this.placements[ch.cz * NCH + ch.cx]) {
      const t = this.tpl(p.tpl);
      if (t) this.putProp(ob, gb, t, p.x - ox, p.z - oz, p.y, p.yaw, p.sx, p.sy, p.sz, p.tint, lights, ox, oz);
    }

    // --- мелкий декор ---
    this.decor(ch, ob, gb, obs, pits, wets, lights);

    // --- Жила-компас ---
    this.vein(gb, ox, oz);

    // --- вода и варенье ---
    for (const s of this.liquids) {
      const cx = Math.min(NCH - 1, Math.floor(s.cx / CHUNK));
      const cz = Math.min(NCH - 1, Math.floor(s.cz / CHUNK));
      if (cx !== ch.cx || cz !== ch.cz) continue;
      const lx = s.cx - ox;
      const lz = s.cz - oz;
      this.pool(lb, lx - s.hx, lz - s.hz, lx + s.hx, lz + s.hz, s.r, s.kind === 'jam' ? 1 : 0, s.deep, hashAt(s.cx, s.cz, 41));
    }

    // --- меши ---
    const grp = new THREE.Group();
    grp.name = `dungeon-chunk-${ch.cx}-${ch.cz}`;
    grp.matrixAutoUpdate = false;
    let tris = 0;
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string): void => {
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.matrixAutoUpdate = false;
      grp.add(m);
      tris += (geo.index ? geo.index.count : 0) / 3;
    };
    {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(ob.pos.out(), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(ob.nor.out(), 3));
      g.setAttribute('color', new THREE.BufferAttribute(ob.col.out(), 3));
      g.setAttribute('aLit', new THREE.BufferAttribute(ob.lit.out(), 4));
      if (zone) {
        const za = new Uint8Array(ob.n * 4).fill(255);
        za.set(zone);
        g.setAttribute('aZone', new THREE.BufferAttribute(za, 4, true));
      }
      g.setIndex(new THREE.BufferAttribute(ob.idx.out(), 1));
      mk(g, this.matOpaque, 'opaque');
    }
    if (gb.idx.n > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(gb.pos.out(), 3));
      g.setAttribute('color', new THREE.BufferAttribute(gb.col.out(), 3));
      g.setIndex(new THREE.BufferAttribute(gb.idx.out(), 1));
      mk(g, this.matGlow, 'glow');
    }
    if (lb.idx.n > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(lb.pos.out(), 3));
      g.setAttribute('aData', new THREE.BufferAttribute(lb.dat.out(), 3));
      g.setIndex(new THREE.BufferAttribute(lb.idx.out(), 1));
      mk(g, this.matLiquid, 'liquid');
    }
    ch.group = grp;
    ch.tris = tris;
    ch.meshes = grp.children.length;
    this.root.add(grp);
    this.place(ch, true);
  }

  /** Сумма запечённого света в точке куска (lx, y, lz) → out; k — ослабление (у пропов меньше) */
  private evalLights(ls: LLight[], ox: number, oz: number, lx: number, y: number, lz: number, out: number[], k: number): void {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const l of ls) {
      let d = segDist(lx, lz, l.ax, l.az, l.bx, l.bz) - l.rc;
      if (d < 0) d = 0;
      if (y > 0.05) {
        const dy = (y - l.y) * 0.6;
        d = Math.sqrt(d * d + dy * dy);
      }
      if (d >= l.R) continue;
      const f = 1 - d / l.R;
      const w = f * f;
      r += l.r * w;
      g += l.g * w;
      b += l.b * w;
    }
    // Жила-компас: сиреневый ореол ±1,8 м вдоль x − z ≡ 60
    const dv = Math.abs(wrap(ox + lx - (oz + lz) - 60)) * Math.SQRT1_2;
    if (dv < 1.8 && y < 1.5) {
      const f = 1 - dv / 1.8;
      const w = f * f * 0.6;
      r += VEIN_LIT[0] * w;
      g += VEIN_LIT[1] * w;
      b += VEIN_LIT[2] * w;
    }
    out[0] = r * k;
    out[1] = g * k;
    out[2] = b * k;
  }

  private putProp(ob: OpaqueBuf, gb: GlowBuf, t: Tpl, lx: number, lz: number, py: number, yaw: number, sx: number, sy: number, sz: number, tint: number, lights: LLight[], ox: number, oz: number): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const lit = [0, 0, 0];
    const tall = t.maxY > 1.0;
    {
      const P = t.op.pos;
      const N = t.op.nor;
      const C = t.op.col;
      const nv = P.length / 3;
      const base = ob.n;
      ob.pos.grow(nv * 3);
      ob.nor.grow(nv * 3);
      ob.col.grow(nv * 3);
      ob.lit.grow(nv * 4);
      const pa = ob.pos.a;
      const na = ob.nor.a;
      const ca = ob.col.a;
      const la = ob.lit.a;
      for (let i = 0; i < nv; i++) {
        const i3 = i * 3;
        const x0 = P[i3] * sx;
        const y = P[i3 + 1] * sy + py;
        const z0 = P[i3 + 2] * sz;
        const x = c * x0 + s * z0 + lx;
        const z = -s * x0 + c * z0 + lz;
        let nx = N[i3] / sx;
        const ny0 = N[i3 + 1] / sy;
        let nz = N[i3 + 2] / sz;
        const tx = c * nx + s * nz;
        nz = -s * nx + c * nz;
        nx = tx;
        const nl = Math.hypot(nx, ny0, nz) || 1;
        const ny = ny0 / nl;
        const o3 = ob.pos.n + i3;
        pa[o3] = x;
        pa[o3 + 1] = y;
        pa[o3 + 2] = z;
        na[o3] = nx / nl;
        na[o3 + 1] = ny;
        na[o3 + 2] = nz / nl;
        const ao = tall ? 0.62 + 0.38 * smooth(0, 1.1, y) : 1;
        const k = tint * ao;
        ca[o3] = C[i3] * k;
        ca[o3 + 1] = C[i3 + 1] * k;
        ca[o3 + 2] = C[i3 + 2] * k;
        this.evalLights(lights, ox, oz, x, Math.max(y, 0.06), z, lit, 0.75);
        const o4 = ob.lit.n + i * 4;
        la[o4] = lit[0];
        la[o4 + 1] = lit[1];
        la[o4 + 2] = lit[2];
        la[o4 + 3] = 0.45 + 0.55 * Math.max(ny, 0);
      }
      ob.pos.n += nv * 3;
      ob.nor.n += nv * 3;
      ob.col.n += nv * 3;
      ob.lit.n += nv * 4;
      ob.n += nv;
      const I = t.op.idx;
      ob.idx.grow(I.length);
      const ia = ob.idx.a;
      for (let k = 0; k < I.length; k++) ia[ob.idx.n++] = base + I[k];
    }
    {
      const P = t.gl.pos;
      const C = t.gl.col;
      const nv = P.length / 3;
      if (nv === 0) return;
      const base = gb.n;
      gb.pos.grow(nv * 3);
      gb.col.grow(nv * 3);
      const pa = gb.pos.a;
      const ca = gb.col.a;
      for (let i = 0; i < nv; i++) {
        const i3 = i * 3;
        const x0 = P[i3] * sx;
        const z0 = P[i3 + 2] * sz;
        const o3 = gb.pos.n + i3;
        pa[o3] = c * x0 + s * z0 + lx;
        pa[o3 + 1] = P[i3 + 1] * sy + py;
        pa[o3 + 2] = -s * x0 + c * z0 + lz;
        ca[o3] = C[i3];
        ca[o3 + 1] = C[i3 + 1];
        ca[o3 + 2] = C[i3 + 2];
      }
      gb.pos.n += nv * 3;
      gb.col.n += nv * 3;
      gb.n += nv;
      const I = t.gl.idx;
      gb.idx.grow(I.length);
      const ia = gb.idx.a;
      for (let k = 0; k < I.length; k++) ia[gb.idx.n++] = base + I[k];
    }
  }

  /** 15–25 мелочей на кусок по зоне, мимо твёрдого, луж, мозаики и рельсов */
  private decor(ch: Chunk, ob: OpaqueBuf, gb: GlowBuf, obs: LSeg[], pits: LSeg[], wets: LSeg[], lights: LLight[]): void {
    const ox = ch.cx * CHUNK;
    const oz = ch.cz * CHUNK;
    const salt = ch.cz * NCH + ch.cx;
    const want = 15 + Math.floor(hash3(salt, 0, 51) * 11);
    const placed: number[] = [];
    let n = 0;
    for (let a = 0; a < want * 4 && n < want; a++) {
      const lx = 0.5 + 23 * hash3(salt, a, 52);
      const lz = 0.5 + 23 * hash3(salt, a, 53);
      const wx = ox + lx;
      const wz = oz + lz;
      let bad = false;
      for (const o of obs) if (segDist(lx, lz, o.ax, o.az, o.bx, o.bz) < o.r + 0.9) bad = true;
      for (const o of pits) if (!bad && segDist(lx, lz, o.ax, o.az, o.bx, o.bz) < o.r * 1.45 + 0.5) bad = true;
      for (const o of wets) if (!bad && segDist(lx, lz, o.ax, o.az, o.bx, o.bz) < o.r + 0.7) bad = true;
      if (bad) continue;
      if (Math.hypot(wrap(wx - this.well.x), wrap(wz - this.well.z)) < 5.8) continue;
      if (Math.abs(wrap(wz - this.railZ)) < 1.1) continue;
      // плоские наклейки не кладём на жилу и друг на друга: иначе плоскости мерцают
      if (Math.abs(wrap(wx - wz - 60)) * Math.SQRT1_2 < 0.9) continue;
      for (let k = 0; k < placed.length; k += 2) if (Math.hypot(placed[k] - lx, placed[k + 1] - lz) < 1.7) bad = true;
      if (bad) continue;
      const zone = this.zoneIds[this.zoneAt(mod(wx, L), mod(wz, L))];
      const list = DECOR[zone] ?? DECOR.cellars;
      const name = list[Math.floor(hash3(salt, a, 54) * list.length)];
      const t = this.tpl(name);
      if (!t) continue;
      const k = (name.startsWith('mushroom_cluster') ? 0.6 : 1) * (0.85 + 0.3 * hash3(salt, a, 55));
      this.putProp(ob, gb, t, lx, lz, 0, hash3(salt, a, 56) * Math.PI * 2, k, k, k, 0.9 + 0.2 * hash3(salt, a, 57), lights, ox, oz);
      placed.push(lx, lz);
      n++;
    }
  }

  /** Светящаяся трещина x − z ≡ 60 (по модулю 240): ломаная с шагом 0,6 м, рисунок — от мировой z, шва нет */
  private vein(gb: GlowBuf, ox: number, oz: number): void {
    const STEP = 0.6;
    const PER = Math.round(L / STEP);
    const nx = Math.SQRT1_2;
    const nz = -Math.SQRT1_2;
    for (let k = -1; k <= 1; k++) {
      const c = 60 + L * k;
      const z0 = Math.max(oz, ox - c);
      const z1 = Math.min(oz + CHUNK, ox + CHUNK - c);
      if (z1 - z0 < STEP * 0.5) continue;
      const s0 = Math.round(z0 / STEP);
      const s1 = Math.round(z1 / STEP);
      const base = gb.n;
      const cnt = s1 - s0 + 1;
      gb.pos.grow(cnt * 6);
      gb.col.grow(cnt * 6);
      for (let s = s0; s <= s1; s++) {
        const z = s * STEP;
        const x = z + c;
        const id = mod(s, PER);
        const off = (hash3(id, 0, 77) - 0.5) * 0.44;
        const w = 0.07 + 0.11 * hash3(id, 1, 77);
        const br = 0.7 + 0.6 * hash3(id, 2, 77);
        const px = x + nx * off - ox;
        const pz = z + nz * off - oz;
        gb.pos.a.set([px + nx * w, VEIN_Y, pz + nz * w, px - nx * w, VEIN_Y, pz - nz * w], gb.pos.n);
        gb.pos.n += 6;
        const r = VEIN_GLOW[0] * br;
        const g = VEIN_GLOW[1] * br;
        const b = VEIN_GLOW[2] * br;
        gb.col.a.set([r, g, b, r, g, b], gb.col.n);
        gb.col.n += 6;
        gb.n += 2;
      }
      gb.idx.grow((cnt - 1) * 6);
      const ia = gb.idx.a;
      for (let q = 0; q < cnt - 1; q++) {
        const l0 = base + q * 2;
        const r0 = l0 + 1;
        const l1 = l0 + 2;
        const r1 = l0 + 3;
        ia[gb.idx.n++] = l0;
        ia[gb.idx.n++] = r0;
        ia[gb.idx.n++] = l1;
        ia[gb.idx.n++] = r0;
        ia[gb.idx.n++] = r1;
        ia[gb.idx.n++] = l1;
      }
    }
  }

  /** Лужа-капсула (или круг): кольца для свечения кромки; deep > 0 — радиус глубокой воды (озеро) */
  private pool(lb: LiquidBuf, ax: number, az: number, bx: number, bz: number, r: number, kind: number, deep: number, seed: number): void {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const ux = len > 1e-3 ? dx / len : 1;
    const uz = len > 1e-3 ? dz / len : 0;
    const px = -uz;
    const pz = ux;
    const M = Math.round(clamp((2 * Math.PI * r + 2 * len) / 0.6, 24, 72));
    const rings = deep > 0 ? [0, 0.35, 0.6, (deep - 0.6) / r, (deep + 0.6) / r, 0.88, 0.95, 1] : [0, 0.45, 0.72, 0.88, 1];
    const ph1 = seed * 6.283;
    const ph2 = seed * 17.1;
    const base = lb.n;
    lb.pos.grow(rings.length * M * 3);
    lb.dat.grow(rings.length * M * 3);
    for (const f of rings) {
      for (let k = 0; k < M; k++) {
        const ang = (k / M) * Math.PI * 2;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const cx = ca >= 0 ? bx : ax;
        const cz = ca >= 0 ? bz : az;
        const wob = 1 + f * (0.05 * Math.sin(3 * ang + ph1) + 0.035 * Math.sin(5 * ang + ph2));
        const rr = f * r * wob;
        lb.pos.a.set([cx + (ux * ca + px * sa) * rr, LIQUID_Y, cz + (uz * ca + pz * sa) * rr], lb.pos.n);
        lb.pos.n += 3;
        const dp = deep > 0 ? 1 - smooth(deep - 0.6, deep + 0.6, f * r) : 0;
        lb.dat.a.set([kind, f, dp], lb.dat.n);
        lb.dat.n += 3;
        lb.n++;
      }
    }
    lb.idx.grow((rings.length - 1) * M * 6);
    const ia = lb.idx.a;
    for (let q = 0; q < rings.length - 1; q++) {
      for (let k = 0; k < M; k++) {
        const i0 = base + q * M + k;
        const i1 = base + q * M + ((k + 1) % M);
        const o0 = i0 + M;
        const o1 = i1 + M;
        ia[lb.idx.n++] = i0;
        ia[lb.idx.n++] = o1;
        ia[lb.idx.n++] = o0;
        ia[lb.idx.n++] = i0;
        ia[lb.idx.n++] = i1;
        ia[lb.idx.n++] = o1;
      }
    }
  }

  // ---------- перестановка кусков ----------

  private place(ch: Chunk, force: boolean): void {
    const g = ch.group;
    if (!g) return;
    const ux = (this.camX - ch.cx * CHUNK - CHUNK / 2) / L;
    const uz = (this.camZ - ch.cz * CHUNK - CHUNK / 2) / L;
    let kx = ch.kx;
    let kz = ch.kz;
    const th = 0.5 + HYST / L;
    if (force || Math.abs(ux - kx) > th) kx = Math.round(ux);
    if (force || Math.abs(uz - kz) > th) kz = Math.round(uz);
    if (!force && kx === ch.kx && kz === ch.kz) return;
    ch.kx = kx;
    ch.kz = kz;
    g.matrix.makeTranslation(ch.cx * CHUNK + L * kx, 0, ch.cz * CHUNK + L * kz);
    g.matrixWorldNeedsUpdate = true;
  }

  private finishInfo(): void {
    const built = this.chunks.filter((c) => c.group);
    const tris = built.map((c) => c.tris);
    this.info.chunks = built.length;
    this.info.trisMin = Math.min(...tris);
    this.info.trisMax = Math.max(...tris);
    this.info.trisAvg = Math.round(tris.reduce((a, b) => a + b, 0) / Math.max(1, tris.length));
    this.info.meshesMax = Math.max(...built.map((c) => c.meshes));
    this.info.buildMs = Math.round(this.buildMs);
  }
}
