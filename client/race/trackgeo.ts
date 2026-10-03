// Дорога и её края для обеих трасс: асфальт лентой по рельефу, красно-белые бордюры на поворотах, обочины (трава
// полосами или песок) до ограждения, «юбки» под внешним краем (где земля ниже дороги — подпорная стенка), ограждения
// (порт — бетонные отбойники, холм — сухая каменная кладка; снаружи поворотов — стопки покрышек), щиты-шевроны
// снаружи поворотов и большие щиты перед шпильками, старт и решётка, трамплины над каналами с дощатым настилом,
// знаки «ПРЫЖОК» перед трамплинами и острыми гребнями. Всё статично и склеено по материалам.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Track } from '../../shared/track.ts';
import { buildGeo, paint, parts, place, staticMesh, type GeoParts, type V3 } from '../render/kit.ts';
import * as tex from '../render/textures.ts';
import { WHITE, face, same } from './geom.ts';
import { grassTexture, hairpinSignTexture, jumpSignTexture, sandTexture, stoneWallTexture } from './racetex.ts';

export type Theme = 'harbor' | 'hills';

/** Асфальт чуть выше физической высоты дороги, разметка и бордюры — над асфальтом */
export const ROAD_Y = 0.02;
export const MARK_Y = 0.035;
/** Асфальт: метров на повтор текстуры вдоль дороги (и ширина, под которую нарисованы линии) */
const ROAD_REF = 14;
/** Жёлтая кромка по открытому краю причала */
const EDGE_LINE = 0.28;
/** Бордюр снаружи поворота и внутри, м */
const KERB_OUT = 1.0;
const KERB_IN = 0.8;
/** Отбойник (порт): профиль (отступ наружу от линии стены, высота) — со скосом к дороге */
const BARRIER: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.12, 0.3], [0.18, 0.8], [0.42, 0.8], [0.6, 0]];
/** Кладка (холм): чуть сужается кверху, плоский верх */
const STONE: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.05, 0.86], [0.55, 0.86], [0.6, 0]];
const SOLID_T = 0.6;
/** Покрышки: стопка из трёх, радиус, высота, шаг; два ряда — центры на таком отступе от линии стены */
const TIRE_R = 0.31;
const TIRE_H = 0.72;
const TIRE_STEP = 0.62;
const TIRE_ROWS = [0.32, 0.93];
const TIRE_T = 1.25;
/** Борта трамплина выше настила; толщина бортов */
const RAMP_RAIL = 0.45;
const RAMP_SIDE = 0.15;
/** Щиты-стрелки на внешней стороне поворотов: примерно через столько метров */
const CHEVRON_EVERY = 22;
/** Шпилька: поворот круче стольких радиан — перед ней большой щит */
const HAIRPIN_TURN = 2.1;

export const WALL_NONE = 0;
export const WALL_SOLID = 1;
export const WALL_TIRES = 2;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Раскладка краёв: какая стена у каждого отрезка с каждой стороны и как далеко от края асфальта кончается
 * ограждение в каждой точке (земля вокруг трассы подстраивается под это).
 */
export interface EdgeLayout {
  /** Отрезок — подъём трамплина перед провалом (рисуется дощатым настилом) */
  rampDeck: Uint8Array;
  wallL: Uint8Array;
  wallR: Uint8Array;
  /** Внешний край ограждения (или обочины, если стены нет) от края асфальта, м — в точке */
  outL: Float64Array;
  outR: Float64Array;
}

/** Подъём трамплина: отрезки, по которым высота растёт подряд до самого провала */
export function rampDecks(tr: Track): Uint8Array {
  const n = tr.n;
  const out = new Uint8Array(n);
  for (let g = 0; g < n; g++) {
    if (!tr.gap[g] || tr.gap[(g - 1 + n) % n]) continue;
    for (let k = (g - 1 + n) % n, c = 0; c < n && tr.h[(k + 1) % n] > tr.h[k] + 1e-6 && !tr.gap[k]; k = (k - 1 + n) % n, c++) out[k] = 1;
  }
  return out;
}

export function edgeLayout(tr: Track, corner: Int8Array, walled: (i: number, sd: number) => boolean): EdgeLayout {
  const n = tr.n;
  const rampDeck = rampDecks(tr);
  const wallL = new Uint8Array(n);
  const wallR = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (const sd of [-1, 1]) {
      const kind = rampDeck[i] || !walled(i, sd) ? WALL_NONE : corner[i] === sd ? WALL_TIRES : WALL_SOLID;
      (sd < 0 ? wallL : wallR)[i] = kind;
    }
  }
  const thick = (k: number): number => (k === WALL_TIRES ? TIRE_T : k === WALL_SOLID ? SOLID_T : 0);
  const outL = new Float64Array(n);
  const outR = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n;
    outL[i] = tr.vl[i] + Math.max(thick(wallL[p]), thick(wallL[i]));
    outR[i] = tr.vr[i] + Math.max(thick(wallR[p]), thick(wallR[i]));
  }
  return { rampDeck, wallL, wallR, outL, outR };
}

export interface TrackGeoCtx {
  scene: THREE.Scene;
  track: Track;
  theme: Theme;
  /** Нормаль вправо в точках осевой */
  rx: Float64Array;
  rz: Float64Array;
  /** Отрезок на повороте: знак — внешняя сторона (+1 — справа), 0 — прямая */
  corner: Int8Array;
  layout: EdgeLayout;
  /** Высота земли под точкой (за ограждением) */
  ground: (x: number, z: number) => number;
  /** Под этим отрезком «юбку» не рисовать (мост: у него своё тело с аркой) */
  noSkirt?: (i: number) => boolean;
  /** Статика с вершинными цветами без текстур — склеивается миром */
  solid: THREE.BufferGeometry[];
  hazardTex: THREE.Texture;
  planks: THREE.Texture;
}

/** Грань с нормалью в каждой вершине; обход поправляется так, чтобы грань смотрела по ref */
function quadN(p: GeoParts, a: V3, b: V3, c: V3, d: V3, ref: V3, ns: [V3, V3, V3, V3], uvs: number[], cols: THREE.Color[]): void {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const acz = c[2] - a[2];
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const base = p.pos.length / 3;
  const order = nx * ref[0] + ny * ref[1] + nz * ref[2] >= 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
  const vs = [a, b, c, d];
  for (const k of order) {
    const v = vs[k];
    const n = ns[k];
    p.pos.push(v[0], v[1], v[2]);
    p.nor.push(n[0], n[1], n[2]);
    p.uv.push(uvs[k * 2], uvs[k * 2 + 1]);
    p.col.push(cols[k].r, cols[k].g, cols[k].b);
  }
  p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export class TrackGeo {
  private readonly c: TrackGeoCtx;
  private readonly tr: Track;
  /** Нормаль поверхности дороги в точке (по уклону) */
  private readonly upN: V3[] = [];
  private readonly marks = parts();

  constructor(c: TrackGeoCtx) {
    this.c = c;
    this.tr = c.track;
    const tr = this.tr;
    const n = tr.n;
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n;
      const j = (i + 1) % n;
      const g = (tr.h[j] - tr.h[p]) / (tr.len[p] + tr.len[i]);
      const tx = c.rz[i];
      const tz = -c.rx[i];
      const l = Math.sqrt(g * g + 1);
      this.upN.push([(-tx * g) / l, 1 / l, (-tz * g) / l]);
    }
    this.buildRoad();
    this.buildVerges();
    this.buildSkirts();
    this.buildRamps();
    this.buildWalls();
    this.buildMarkings();
    this.buildChevrons();
    this.buildHairpinBoards();
    this.buildJumpSigns();
    const marks = staticMesh(buildGeo(this.marks), new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }), false);
    marks.receiveShadow = true;
    marks.renderOrder = 1;
    c.scene.add(marks);
  }

  // ------------------------------------------------------------ помощники

  /** Точка у осевой: lat — вправо по ходу (по нормали в точке), y — высота */
  at(i: number, lat: number, y: number): V3 {
    const tr = this.tr;
    return [tr.px[i] + this.c.rx[i] * lat, y, tr.pz[i] + this.c.rz[i] * lat];
  }

  /** Точка за краем асфальта в точке i: sd — сторона (+1 справа), off — на сколько метров за краем */
  edge(i: number, sd: number, off: number, y: number): V3 {
    return this.at(i, sd * (this.tr.hw[i] + off), y);
  }

  private open(i: number, sd: number): boolean {
    return (sd > 0 ? this.tr.openR[i] : this.tr.openL[i]) === 1;
  }

  private verge(i: number, sd: number): number {
    return sd > 0 ? this.tr.vr[i] : this.tr.vl[i];
  }

  private wall(i: number, sd: number): number {
    return (sd > 0 ? this.c.layout.wallR : this.c.layout.wallL)[i];
  }

  private out(i: number, sd: number): number {
    return (sd > 0 ? this.c.layout.outR : this.c.layout.outL)[i];
  }

  private flat(i: number): boolean {
    return !this.tr.gap[i] && !this.c.layout.rampDeck[i];
  }

  private sv(j: number): number {
    return j === 0 ? this.tr.length : this.tr.s[j];
  }

  // ------------------------------------------------------------ асфальт, бордюры, кромка

  private buildRoad(): void {
    const tr = this.tr;
    const n = tr.n;
    const road = parts();
    const kerbs = parts();
    const yellow = new THREE.Color(0xe2c13e);
    const up: V3 = [0, 1, 0];
    for (let i = 0; i < n; i++) {
      if (!this.flat(i)) continue;
      const j = (i + 1) % n;
      const yi = tr.h[i] + ROAD_Y;
      const yj = tr.h[j] + ROAD_Y;
      const vi = tr.s[i] / ROAD_REF;
      const vj = this.sv(j) / ROAD_REF;
      const ni = this.upN[i];
      const nj = this.upN[j];
      quadN(road, this.at(i, -tr.hw[i], yi), this.at(i, tr.hw[i], yi), this.at(j, tr.hw[j], yj), this.at(j, -tr.hw[j], yj), up, [ni, ni, nj, nj], [0, vi, 1, vi, 1, vj, 0, vj], same(WHITE));
      const sd = this.c.corner[i];
      const ki = tr.s[i] / 3;
      const kj = this.sv(j) / 3;
      for (const side of [-1, 1]) {
        if (this.open(i, side)) {
          // кромка причала или берега: жёлтая полоса у самого края
          face(this.marks, this.edge(i, side, -EDGE_LINE, yi + 0.015), this.edge(i, side, 0, yi + 0.015), this.edge(j, side, 0, yj + 0.015), this.edge(j, side, -EDGE_LINE, yj + 0.015), up, [0, 0, 1, 0, 1, 1, 0, 1], same(yellow));
        } else if (sd !== 0) {
          const w = side === sd ? KERB_OUT : KERB_IN;
          quadN(kerbs, this.edge(i, side, -w, yi + 0.015), this.edge(i, side, 0, yi + 0.015), this.edge(j, side, 0, yj + 0.015), this.edge(j, side, -w, yj + 0.015), up, [ni, ni, nj, nj], [0, ki, 1, ki, 1, kj, 0, kj], same(WHITE));
        }
      }
    }
    const asphalt = tex.asphaltTexture(ROAD_REF);
    asphalt.anisotropy = 8;
    const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.86, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    // светлее и чуть теплее прежнего: ясный день, свежий асфальт
    roadMat.color.setRGB(1.5, 1.47, 1.42);
    const roadMesh = staticMesh(buildGeo(road), roadMat, false);
    roadMesh.receiveShadow = true;
    this.c.scene.add(roadMesh);
    const kerbMat = new THREE.MeshStandardMaterial({ map: tex.kerbTexture(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    kerbMat.color.setRGB(1.12, 1.08, 1.08);
    const kerbMesh = staticMesh(buildGeo(kerbs), kerbMat, false);
    kerbMesh.receiveShadow = true;
    kerbMesh.renderOrder = 1;
    this.c.scene.add(kerbMesh);
  }

  // ------------------------------------------------------------ обочины

  private buildVerges(): void {
    const tr = this.tr;
    const n = tr.n;
    const grass = parts();
    const sand = parts();
    const up: V3 = [0, 1, 0];
    for (let i = 0; i < n; i++) {
      if (!this.flat(i)) continue;
      const j = (i + 1) % n;
      const yi = tr.h[i] + ROAD_Y - 0.004;
      const yj = tr.h[j] + ROAD_Y - 0.004;
      const ni = this.upN[i];
      const nj = this.upN[j];
      for (const sd of [-1, 1]) {
        const wi = this.verge(i, sd);
        const wj = this.verge(j, sd);
        if (wi < 0.05 && wj < 0.05) continue;
        const isSand = (sd > 0 ? tr.sr[i] : tr.sl[i]) === 1;
        const k = isSand ? 5 : 4;
        const vi = tr.s[i] / k;
        const vj = this.sv(j) / k;
        quadN(isSand ? sand : grass, this.edge(i, sd, 0, yi), this.edge(i, sd, wi, yi), this.edge(j, sd, wj, yj), this.edge(j, sd, 0, yj), up, [ni, ni, nj, nj], [0, vi, wi / k, vi, wj / k, vj, 0, vj], same(WHITE));
      }
    }
    if (grass.idx.length) {
      const m = new THREE.MeshStandardMaterial({ map: grassTexture(true), roughness: 0.95 });
      m.color.setRGB(0.9, 0.97, 0.84);
      const mesh = staticMesh(buildGeo(grass), m, false);
      mesh.receiveShadow = true;
      this.c.scene.add(mesh);
    }
    if (sand.idx.length) {
      const mesh = staticMesh(buildGeo(sand), new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.97 }), false);
      mesh.receiveShadow = true;
      this.c.scene.add(mesh);
    }
  }

  /** «Юбки»: от внешнего края ограждения вниз до земли — где дорога выше земли (насыпь, подпорная стенка, мост) */
  private buildSkirts(): void {
    const tr = this.tr;
    const n = tr.n;
    const g = parts();
    const hills = this.c.theme === 'hills';
    const scale = hills ? 2.6 : 2;
    for (let i = 0; i < n; i++) {
      if (tr.gap[i] || this.c.noSkirt?.(i)) continue;
      const j = (i + 1) % n;
      for (const sd of [-1, 1]) {
        const oi = this.out(i, sd);
        const oj = this.out(j, sd);
        const a = this.edge(i, sd, oi, 0);
        const b = this.edge(j, sd, oj, 0);
        const pa = this.edge(i, sd, oi + 0.6, 0);
        const pb = this.edge(j, sd, oj + 0.6, 0);
        const ga = this.c.ground(pa[0], pa[2]);
        const gb = this.c.ground(pb[0], pb[2]);
        const ha = tr.h[i] + (this.c.layout.rampDeck[i] ? 0 : ROAD_Y);
        const hb = tr.h[j] + (this.c.layout.rampDeck[i] ? 0 : ROAD_Y);
        if (ha - ga < 0.12 && hb - gb < 0.12) continue;
        const ba = Math.min(ga, ha) - 0.5;
        const bb = Math.min(gb, hb) - 0.5;
        const ox = this.c.rx[i] * sd;
        const oz = this.c.rz[i] * sd;
        const ua = tr.s[i] / scale;
        const ub = this.sv(j) / scale;
        face(g, [a[0], ha, a[2]], [b[0], hb, b[2]], [b[0], bb, b[2]], [a[0], ba, a[2]], [ox, 0, oz], [ua, ha / scale, ub, hb / scale, ub, bb / scale, ua, ba / scale], same(WHITE));
      }
    }
    if (!g.idx.length) return;
    const map = hills ? stoneWallTexture() : tex.concreteTexture();
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.93 });
    if (hills) m.color.setRGB(1.02, 0.98, 0.92);
    this.c.scene.add(staticMesh(buildGeo(g), m, true));
  }

  // ------------------------------------------------------------ трамплины над каналами

  /** Дощатый настил по подъёму, жёлто-чёрные борта выше настила, торец над каналом, полоса на кромке */
  private buildRamps(): void {
    const tr = this.tr;
    const n = tr.n;
    const deck = parts();
    const steel = parts();
    const wood = new THREE.Color(0xd2a473);
    const rd = this.c.layout.rampDeck;
    for (let i = 0; i < n; i++) {
      if (!rd[i]) continue;
      const j = (i + 1) % n;
      const hi = tr.h[i];
      const hj = tr.h[j];
      const g = (hj - hi) / tr.len[i];
      const nl = Math.hypot(g, 1);
      const nrm: V3 = [(-tr.tx[i] * g) / nl, 1 / nl, (-tr.tz[i] * g) / nl];
      const vi = tr.s[i] / 2;
      const vj = tr.s[j] / 2;
      const ui = tr.hw[i] / 2;
      const uj = tr.hw[j] / 2;
      face(deck, this.at(i, -tr.hw[i], hi + ROAD_Y), this.at(i, tr.hw[i], hi + ROAD_Y), this.at(j, tr.hw[j], hj + ROAD_Y), this.at(j, -tr.hw[j], hj + ROAD_Y), nrm, [-ui, vi, ui, vi, uj, vj, -uj, vj], same(wood));
      for (const sd of [-1, 1]) {
        const out: V3 = [this.c.rx[i] * sd, 0, this.c.rz[i] * sd];
        const inn: V3 = [-out[0], 0, -out[2]];
        const ui2 = tr.s[i];
        const uj2 = tr.s[j];
        const e = (k: number, off: number, y: number): V3 => this.edge(k, sd, off, y);
        const gi = Math.min(0, this.c.ground(...xz(e(i, RAMP_SIDE, 0))));
        const gj = Math.min(0, this.c.ground(...xz(e(j, RAMP_SIDE, 0))));
        face(steel, e(i, 0, hi), e(j, 0, hj), e(j, 0, hj + RAMP_RAIL), e(i, 0, hi + RAMP_RAIL), inn, [ui2, hi, uj2, hj, uj2, hj + RAMP_RAIL, ui2, hi + RAMP_RAIL], same(WHITE));
        face(steel, e(i, 0, hi + RAMP_RAIL), e(j, 0, hj + RAMP_RAIL), e(j, RAMP_SIDE, hj + RAMP_RAIL), e(i, RAMP_SIDE, hi + RAMP_RAIL), [0, 1, 0], [ui2, 0, uj2, 0, uj2, 0.15, ui2, 0.15], same(WHITE));
        face(steel, e(i, RAMP_SIDE, gi), e(j, RAMP_SIDE, gj), e(j, RAMP_SIDE, hj + RAMP_RAIL), e(i, RAMP_SIDE, hi + RAMP_RAIL), out, [ui2, gi, uj2, gj, uj2, hj + RAMP_RAIL, ui2, hi + RAMP_RAIL], same(WHITE));
      }
      if (tr.gap[j]) {
        // торец над каналом и полоса «опасность» на кромке
        const h = hj;
        const w = tr.hw[j] + RAMP_SIDE;
        const fwd: V3 = [tr.tx[i], 0, tr.tz[i]];
        face(steel, this.at(j, -w, -1.2), this.at(j, w, -1.2), this.at(j, w, h + RAMP_RAIL), this.at(j, -w, h + RAMP_RAIL), fwd, [-w, -1.2, w, -1.2, w, h + RAMP_RAIL, -w, h + RAMP_RAIL], same(WHITE));
        const k = 1 / tr.len[i];
        const lip = (lat: number, back: number): V3 => {
          const q = this.at(j, lat, h + ROAD_Y + 0.012);
          return [q[0] - tr.tx[i] * back, q[1] - (h - hi) * k * back, q[2] - tr.tz[i] * back];
        };
        const hw = tr.hw[j];
        face(steel, lip(-hw, 1.1), lip(hw, 1.1), lip(hw, 0), lip(-hw, 0), [0, 1, 0], [-hw / 1.2, 0, hw / 1.2, 0, hw / 1.2, 1.1 / 1.2, -hw / 1.2, 1.1 / 1.2], same(WHITE));
      }
    }
    if (!deck.idx.length) return;
    this.c.scene.add(staticMesh(buildGeo(deck), new THREE.MeshStandardMaterial({ map: this.c.planks, vertexColors: true, roughness: 0.85 }), true));
    this.c.scene.add(staticMesh(buildGeo(steel), new THREE.MeshStandardMaterial({
      map: this.c.hazardTex, roughness: 0.55, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    }), true));
  }

  // ------------------------------------------------------------ ограждения

  private buildWalls(): void {
    const tr = this.tr;
    const n = tr.n;
    const hills = this.c.theme === 'hills';
    const prof = hills ? STONE : BARRIER;
    const g = parts();
    const light = new THREE.Color(hills ? 0xf4ede2 : 0xe6e2da);
    const foot = new THREE.Color(hills ? 0xb8ab98 : 0x9a968e);
    const tires: Array<{ x: number; y: number; z: number; color: number }> = [];
    let tireK = 0;
    for (const sd of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const kind = this.wall(i, sd);
        if (kind === WALL_NONE) continue;
        const j = (i + 1) % n;
        const vi = this.verge(i, sd);
        const vj = this.verge(j, sd);
        if (kind === WALL_TIRES) {
          TIRE_ROWS.forEach((o, row) => {
            const a = this.edge(i, sd, vi + o, tr.h[i]);
            const b = this.edge(j, sd, vj + o, tr.h[j]);
            const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
            const cnt = Math.max(1, Math.round(len / TIRE_STEP));
            for (let k = 0; k < cnt; k++) {
              const f = (k + 0.5) / cnt;
              const color = row === 0 ? ((tireK++ >> 1) & 1 ? 0xd8362c : 0xf4f2ec) : 0x2c2c2e;
              tires.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f, color });
            }
          });
          continue;
        }
        const shade = 0.96 + (i % 5) * 0.012;
        const top = light.clone().multiplyScalar(shade);
        const bot = foot.clone().multiplyScalar(shade);
        const pt = (k: number, p: number): V3 => {
          const [o, y] = prof[k];
          return this.edge(p, sd, (p === i ? vi : vj) + o, tr.h[p] + y);
        };
        const ua = tr.s[i] / 2;
        const ub = ua + tr.len[i] / 2;
        const ox = -tr.tz[i] * sd;
        const oz = tr.tx[i] * sd;
        for (let k = 0; k < prof.length - 1; k++) {
          const [o0, y0] = prof[k];
          const [o1, y1] = prof[k + 1];
          const dno = y1 - y0;
          const dny = o1 - o0;
          const nl = Math.hypot(dno, dny);
          const nrm: V3 = [(-ox * dno) / nl, dny / nl, (-oz * dno) / nl];
          const c0 = y0 > 0.5 ? top : bot;
          const c1 = y1 > 0.5 ? top : bot;
          face(g, pt(k, i), pt(k, j), pt(k + 1, j), pt(k + 1, i), nrm, [ua, (o0 + y0) / 2, ub, (o0 + y0) / 2, ub, (o1 + y1) / 2, ua, (o1 + y1) / 2], [c0, c0, c1, c1]);
        }
        // торцы — там, где сплошная стена кончается
        const before = (i - 1 + n) % n;
        for (const [p, dir, neighbor] of [[i, -1, before], [j, 1, j]] as const) {
          if (this.wall(neighbor, sd) === WALL_SOLID) continue;
          const nrm: V3 = [tr.tx[i] * dir, 0, tr.tz[i] * dir];
          const last = prof.length - 1;
          for (let k = 1; k < last; k++) {
            face(g, pt(last, p), pt(0, p), pt(k, p), pt(k + 1, p), nrm, [0.3, 0, 0, 0, 0.06, 0.3, 0.2, 0.4], [bot, bot, top, top]);
          }
        }
      }
    }
    const map = hills ? stoneWallTexture() : tex.concreteTexture();
    if (hills) map.repeat.set(1, 1.6);
    this.c.scene.add(staticMesh(buildGeo(g), new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.92 }), true));

    if (!tires.length) return;
    const side = new THREE.CylinderGeometry(TIRE_R, TIRE_R, TIRE_H, 12, 1, true);
    const cap = new THREE.CircleGeometry(TIRE_R, 12).rotateX(-Math.PI / 2).translate(0, TIRE_H / 2, 0);
    const capUv = cap.getAttribute('uv');
    for (let k = 0; k < capUv.count; k++) capUv.setXY(k, 0.5, 0.5);
    const geo = mergeGeometries([paint(side, 0xffffff), paint(cap, 0x262626)], false)!;
    geo.translate(0, TIRE_H / 2, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: tex.tireStackTexture(), vertexColors: true, roughness: 0.8 }), tires.length);
    tires.forEach((t, k) => {
      _q.setFromAxisAngle(UP, (k * 2.39996) % (Math.PI * 2));
      _m.compose(_p.set(t.x, t.y, t.z), _q, _s.set(1, 0.96 + ((k * 7) % 5) * 0.02, 1));
      mesh.setMatrixAt(k, _m);
      mesh.setColorAt(k, _c.set(t.color));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.c.scene.add(mesh);
  }

  // ------------------------------------------------------------ разметка

  /** Шахматная линия старта, рамки мест на решётке, полоса «опасность» у приземления за каналом */
  private buildMarkings(): void {
    const tr = this.tr;
    const start = parts();
    const hw0 = tr.hw[0];
    const y0 = tr.h[0] + MARK_Y + 0.006;
    const back = (lat: number, d: number): V3 => {
      const q = this.at(0, lat, y0);
      return [q[0] + tr.tx[0] * d, q[1], q[2] + tr.tz[0] * d];
    };
    face(start, back(-hw0, -0.8), back(hw0, -0.8), back(hw0, 0.8), back(-hw0, 0.8), [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], same(WHITE));
    const startMesh = staticMesh(buildGeo(start), new THREE.MeshStandardMaterial({
      map: tex.checkerTexture(Math.round(hw0 * 1.6), 2), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    }), false);
    startMesh.receiveShadow = true;
    startMesh.renderOrder = 2;
    this.c.scene.add(startMesh);

    const white = new THREE.Color(0xf4f2ec);
    for (const g of tr.grid) {
      const fx = g.hx;
      const fz = g.hz;
      const rx = -fz;
      const rz = fx;
      const y = tr.h[g.seg] + MARK_Y;
      const bar = (a: number, b: number, c: number, d: number) => {
        const p = (lat: number, fw: number): V3 => [g.x + rx * lat + fx * fw, y, g.z + rz * lat + fz * fw];
        face(this.marks, p(a, c), p(b, c), p(b, d), p(a, d), [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], same(white));
      };
      bar(-0.95, 0.95, 1.05, 1.18);
      bar(-0.95, -0.83, -0.2, 1.05);
      bar(0.83, 0.95, -0.2, 1.05);
    }

    const hazard = parts();
    for (let i = 0; i < tr.n; i++) {
      const j = (i + 1) % tr.n;
      if (!tr.gap[i] || tr.gap[j]) continue;
      const y = tr.h[j] + MARK_Y;
      const fw = (lat: number, d: number): V3 => {
        const q = this.at(j, lat, y);
        return [q[0] + tr.tx[j] * d, q[1], q[2] + tr.tz[j] * d];
      };
      const hw = tr.hw[j];
      face(hazard, fw(-hw, 0), fw(hw, 0), fw(hw, 1.2), fw(-hw, 1.2), [0, 1, 0], [-hw / 1.2, 0, hw / 1.2, 0, hw / 1.2, 1, -hw / 1.2, 1], same(WHITE));
    }
    if (!hazard.idx.length) return;
    const hz = staticMesh(buildGeo(hazard), new THREE.MeshStandardMaterial({
      map: this.c.hazardTex, roughness: 0.7, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    }), false);
    hz.receiveShadow = true;
    hz.renderOrder = 2;
    this.c.scene.add(hz);
  }

  // ------------------------------------------------------------ щиты

  /** Повороты: подряд идущие отрезки с одной внешней стороной (по кругу, начиная после прямой) */
  private corners(): Array<{ sd: number; run: number[] }> {
    const tr = this.tr;
    const n = tr.n;
    const corner = this.c.corner;
    const out: Array<{ sd: number; run: number[] }> = [];
    let s0 = 0;
    while (corner[s0] !== 0 && s0 < n - 1) s0++;
    for (let k = 0; k < n; k++) {
      const i = (s0 + k) % n;
      const sd = corner[i];
      if (sd === 0 || corner[(i - 1 + n) % n] === sd) continue;
      const run: number[] = [];
      for (let m = i; corner[m] === sd && run.length < n; m = (m + 1) % n) run.push(m);
      out.push({ sd, run });
    }
    return out;
  }

  /** Щиты с белыми стрелками на красном снаружи поворотов (за ограждением) — одним мешем */
  private buildChevrons(): void {
    const tr = this.tr;
    const g = parts();
    const W = 2.6;
    const H = 0.65;
    for (const { sd, run } of this.corners()) {
      const len = run.reduce((a, m) => a + tr.len[m], 0);
      const cnt = Math.max(1, Math.round(len / CHEVRON_EVERY));
      for (let c = 0; c < cnt; c++) {
        const p = run[Math.floor(((c + 0.5) / cnt) * run.length)];
        if (tr.gap[p] || this.wall(p, sd) === WALL_NONE) continue;
        const [x, , z] = this.edge(p, sd, this.out(p, sd) + 0.55, 0);
        const vx = this.c.rx[p] * sd;
        const vz = this.c.rz[p] * sd;
        // щит смотрит на дорогу; стрелки — по ходу: вправо или влево от зрителя
        const right = tr.tx[p] * -vz + tr.tz[p] * vx > 0;
        const y = tr.h[p] + 1.45;
        this.board(g, x, y, z, -vx, -vz, W, H, !right);
        const gy = Math.min(tr.h[p], this.c.ground(x, z));
        for (const s of [-1, 1]) this.post(x - vz * s * 1.0 + vx * 0.06, z + vx * s * 1.0 + vz * 0.06, gy, y + H / 2 - 0.05);
      }
    }
    if (!g.idx.length) return;
    const map = tex.chevronSignTexture();
    this.c.scene.add(staticMesh(buildGeo(g), new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.55 }), false));
  }

  /** Большой красно-белый щит перед каждой шпилькой: стоит снаружи, лицом к въезжающим */
  private buildHairpinBoards(): void {
    const tr = this.tr;
    const g = parts();
    const W = 3.8;
    const H = 1.9;
    for (const { sd, run } of this.corners()) {
      let turn = 0;
      for (const m of run) turn += Math.abs(tr.curv[m]) * tr.len[m];
      if (turn < HAIRPIN_TURN) continue;
      // щит там, где карт уже повернул на ~50°: прямо по взгляду въезжающего, за внешним ограждением
      const i0 = run[0];
      const fx = tr.tx[(i0 - 1 + tr.n) % tr.n];
      const fz = tr.tz[(i0 - 1 + tr.n) % tr.n];
      let acc = 0;
      let p = i0;
      for (const m of run) {
        acc += Math.abs(tr.curv[m]) * tr.len[m];
        p = m;
        if (acc > 0.85) break;
      }
      const [x, , z] = this.edge(p, sd, this.out(p, sd) + 1.1, 0);
      const y = tr.h[p] + 0.55 + H / 2;
      const rx = -fz;
      const rz = fx;
      // стрелки показывают поворот: внешняя сторона справа — поворот налево
      this.board(g, x, y, z, -fx, -fz, W, H, sd > 0);
      const gy = Math.min(tr.h[p], this.c.ground(x, z));
      for (const s of [-1, 1]) this.post(x + rx * s * (W / 2 - 0.25) + fx * 0.08, z + rz * s * (W / 2 - 0.25) + fz * 0.08, gy, y + H / 2 - 0.1, 0.12);
    }
    if (!g.idx.length) return;
    const map = hairpinSignTexture();
    this.c.scene.add(staticMesh(buildGeo(g), new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.5 }), false));
  }

  /** Щит: центр (x, y, z), смотрит по (nx, nz), размер w × h; flip — зеркально (стрелки в другую сторону) */
  private board(g: GeoParts, x: number, y: number, z: number, nx: number, nz: number, w: number, h: number, flip: boolean): void {
    // вправо от зрителя, который смотрит на щит (против нормали n): взгляд d = −n, вправо от d — (−dz, dx) = (nz, −nx)
    const rx = nz;
    const rz = -nx;
    const p = (a: number, b: number): V3 => [x + rx * a * (w / 2), y + b * (h / 2), z + rz * a * (w / 2)];
    const u0 = flip ? 1 : 0;
    const u1 = flip ? 0 : 1;
    face(g, p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), [nx, 0, nz], [u0, 0, u1, 0, u1, 1, u0, 1], same(WHITE));
    // оборот щита — серая жесть (сзади надпись не видна)
    this.c.solid.push(place(paint(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.05), 0x7a7e84), x - nx * 0.03, y, z - nz * 0.03, Math.atan2(nx, nz)));
  }

  private post(x: number, z: number, y0: number, y1: number, r = 0.05): void {
    const h = Math.max(0.2, y1 - y0);
    this.c.solid.push(place(paint(new THREE.BoxGeometry(r * 1.6, h, r * 1.6), 0x3a3d42), x, y0 + h / 2, z));
  }

  /** «ПРЫЖОК»: за 22 и 46 м до трамплина или острого гребня — слева (справа, если слева нет стены), лицом к едущим */
  private buildJumpSigns(): void {
    const tr = this.tr;
    const n = tr.n;
    const rd = this.c.layout.rampDeck;
    const spots: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n;
      if (rd[i] && !rd[p]) spots.push(i);
      // острый гребень: круто вверх, сразу круто вниз
      const up = (tr.h[i] - tr.h[p]) / tr.len[p];
      const down = (tr.h[(i + 1) % n] - tr.h[i]) / tr.len[i];
      if (!rd[i] && !tr.gap[i] && up > 0.06 && down < -0.06 && up - down > 0.16) spots.push(i);
    }
    if (!spots.length) return;
    const g = parts();
    for (const i of spots) {
      let k = i;
      let back = 0;
      for (const dist of [22, 46]) {
        while (back < dist) {
          k = (k - 1 + n) % n;
          back += tr.len[k];
        }
        const sd = this.wall(k, -1) === WALL_NONE ? 1 : -1;
        const [x, , z] = this.edge(k, sd, this.out(k, sd) + 1.2, 0);
        const y = tr.h[k] + 1.2 + 0.85;
        this.board(g, x, y, z, -tr.tx[k], -tr.tz[k], 1.7, 1.7, false);
        const gy = Math.min(tr.h[k], this.c.ground(x, z));
        const rx = -tr.tz[k];
        const rz = tr.tx[k];
        for (const s of [-1, 1]) this.post(x + rx * s * 0.7 + tr.tx[k] * 0.06, z + rz * s * 0.7 + tr.tz[k] * 0.06, gy, y + 0.8);
      }
    }
    const map = jumpSignTexture();
    this.c.scene.add(staticMesh(buildGeo(g), new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.6 }), false));
  }
}

function xz(v: V3): [number, number] {
  return [v[0], v[2]];
}
