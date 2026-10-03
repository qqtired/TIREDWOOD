// Мир «Солнечного серпантина» вокруг дороги: приморский городок на холме в ясный полдень. Земля — сетка высот:
// под дорогой и ограждением — точно по дороге, дальше — плавно к «природному» рельефу (холм с серпантином, горы на
// севере и западе, пляж и море на юге), но не круче откоса от края ограждения (где дорога выше — подпорная
// стенка, её рисует trackgeo.ts). Река с севера течёт под каменный мост в пруд; срезка через неё — с причала на
// мостки. Кипарисы, пинии и оливы — инстансами, виноградник рядами вдоль спуска, деревня с черепичными крышами и
// переездом, фонтан с брызгами в центре дуги, арка старта, трибуны со зрителями-желейками, флажки.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../shared/constants.ts';
import type { Deck } from '../../shared/hazards.ts';
import { hillsFountain } from '../../shared/maps/hills.ts';
import type { Track } from '../../shared/track.ts';
import { buildGeo, paint, parts, place, staticMesh, type GeoParts, type V3 } from '../render/kit.ts';
import * as tex from '../render/textures.ts';
import { buildGrandstand, type Festive } from './crowd.ts';
import { face, same, WHITE } from './geom.ts';
import { arrowSignTexture, bannerTexture, grassTexture, rippleTexture, roofTexture, sandTexture, stoneWallTexture } from './racetex.ts';
import type { EdgeLayout } from './trackgeo.ts';

/** Река: русло между x0 и x1 с севера до пруда; пруд — круг */
const RIVER_X0 = 52.6;
const RIVER_X1 = 61.4;
const POND = { x: 57, z: -35, r: 16 };
/** Берег: на стольких метрах от воды земля спускается к ней */
const BANK = 2.6;
const RIVER_BED = WATER_Y - 1.1;
/** Шаг сетки земли у трассы и вдали; вдаль сетка уходит на столько метров за рамку суши */
const GRID = 2.5;
const FAR = 8;
const FAR_PAD = 280;
/** Откос от края ограждения: на метр от стены земля поднимается не больше чем на столько */
const SLOPE = 0.55;
/** Дорога влияет на землю не дальше чем на столько метров (и плавно слабеет к этой границе) */
const REACH = 34;
const CELL = 12;
/** Вес «природного» рельефа против дороги */
const W_NATURAL = 4e-4;

const smooth01 = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** Природный рельеф без дороги: холм серпантина, горы на севере и западе, холмы на востоке, пляж и море на юге */
export function naturalHeight(x: number, z: number): number {
  const dx = x + 45;
  const dz = z - 50;
  let h = 12.5 * Math.exp(-(dx * dx + dz * dz) / (2 * 78 * 78));
  h += 24 * smooth01((-95 - x) / 120);
  h += 30 * smooth01((-112 - z) / 130);
  h += 14 * smooth01((x - 205) / 120);
  // волны: у деревни и фонтана — тише
  const calm = 1 - 0.75 * smooth01((x - 85) / 30) * smooth01((z + 110) / 20);
  h += (1.7 * Math.sin(x * 0.045 + 1.3) * Math.sin(z * 0.038 + 0.7) + 0.8 * Math.sin(x * 0.11 + z * 0.07 + 2.1)) * calm;
  // долина реки
  const rx = x - (RIVER_X0 + RIVER_X1) / 2;
  h -= 5 * Math.exp(-(rx * rx) / (2 * 16 * 16)) * smooth01((-25 - z) / 40);
  // пляж и море
  if (z > 184) {
    const beach = 0.7 - (z - 184) * 0.085;
    const k = smooth01((z - 184) / 10);
    h = h * (1 - k) + Math.min(h, beach) * k;
    if (z > 196) h = Math.min(h, beach);
  }
  return h;
}

/** Насколько точка внутри воды реки или пруда (м, > 0 — в воде) */
function waterInside(x: number, z: number): number {
  let inside = -Infinity;
  if (z < POND.z) inside = Math.min(x - RIVER_X0, RIVER_X1 - x);
  const p = POND.r - Math.hypot(x - POND.x, z - POND.z);
  return Math.max(inside, p);
}

/** Земля вокруг трассы: высота в точке и расстояние до ограждения ближайшей дороги */
export class HillsTerrain {
  private readonly tr: Track;
  private readonly lay: EdgeLayout;
  private readonly decks: readonly Deck[];
  private readonly x0: number;
  private readonly z0: number;
  private readonly nx: number;
  private readonly nz: number;
  private readonly cells: Int32Array[];
  /** Последний замер: до ограждения ближайшей дороги (м, < 0 — внутри), высота её дороги */
  edge = Infinity;
  roadY = 0;

  constructor(tr: Track, lay: EdgeLayout, decks: readonly Deck[], box: { x0: number; z0: number; x1: number; z1: number }) {
    this.tr = tr;
    this.lay = lay;
    this.decks = decks;
    this.x0 = box.x0 - FAR_PAD;
    this.z0 = box.z0 - FAR_PAD;
    this.nx = Math.ceil((box.x1 - box.x0 + FAR_PAD * 2) / CELL) + 1;
    this.nz = Math.ceil((box.z1 - box.z0 + FAR_PAD * 2) / CELL) + 1;
    const lists: number[][] = [];
    for (let k = 0; k < this.nx * this.nz; k++) lists.push([]);
    const n = tr.n;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const pad = REACH + tr.hw[k] + Math.max(lay.outL[k], lay.outR[k]) + 2;
      const cx0 = Math.floor((Math.min(tr.px[k], tr.px[j]) - pad - this.x0) / CELL);
      const cx1 = Math.floor((Math.max(tr.px[k], tr.px[j]) + pad - this.x0) / CELL);
      const cz0 = Math.floor((Math.min(tr.pz[k], tr.pz[j]) - pad - this.z0) / CELL);
      const cz1 = Math.floor((Math.max(tr.pz[k], tr.pz[j]) + pad - this.z0) / CELL);
      for (let cz = Math.max(0, cz0); cz <= Math.min(this.nz - 1, cz1); cz++) {
        for (let cx = Math.max(0, cx0); cx <= Math.min(this.nx - 1, cx1); cx++) lists[cz * this.nx + cx].push(k);
      }
    }
    this.cells = lists.map((l) => Int32Array.from(l));
  }

  /** Высота земли в точке (заодно edge и roadY — про ближайшую дорогу) */
  height(x: number, z: number): number {
    const tr = this.tr;
    const lay = this.lay;
    const n = tr.n;
    const cx = Math.floor((x - this.x0) / CELL);
    const cz = Math.floor((z - this.z0) / CELL);
    let wsum = 0;
    let hsum = 0;
    let env = Infinity;
    let corr = Infinity;
    let emin = Infinity;
    let roadY = 0;
    if (cx >= 0 && cz >= 0 && cx < this.nx && cz < this.nz) {
      const list = this.cells[cz * this.nx + cx];
      for (let q = 0; q < list.length; q++) {
        const k = list[q];
        const j = (k + 1) % n;
        const ex = tr.px[j] - tr.px[k];
        const ez = tr.pz[j] - tr.pz[k];
        const l2 = ex * ex + ez * ez;
        let t = l2 > 1e-9 ? ((x - tr.px[k]) * ex + (z - tr.pz[k]) * ez) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - tr.px[k] - ex * t;
        const dz = z - tr.pz[k] - ez * t;
        const d = Math.sqrt(dx * dx + dz * dz);
        const right = -ez * dx + ex * dz > 0;
        const out = right ? lay.outR[k] + (lay.outR[j] - lay.outR[k]) * t : lay.outL[k] + (lay.outL[j] - lay.outL[k]) * t;
        const e = d - (tr.hw[k] + (tr.hw[j] - tr.hw[k]) * t + out);
        if (e > REACH) continue;
        const hh = tr.h[k] + (tr.h[j] - tr.h[k]) * t;
        if (e < 0.3 && hh - 0.12 < corr) corr = hh - 0.12;
        const ev = hh - 0.12 + SLOPE * Math.max(0, e - 0.3);
        if (ev < env) env = ev;
        if (e < emin) {
          emin = e;
          roadY = hh;
        }
        const ep = Math.max(0, e) + 4;
        const w = (1 - smooth01((e - REACH * 0.6) / (REACH * 0.4))) / (ep * ep * ep);
        wsum += w;
        hsum += w * hh;
      }
    }
    const nat = naturalHeight(x, z);
    let h = corr < Infinity ? corr : Math.min((hsum + W_NATURAL * nat) / (wsum + W_NATURAL), env);
    // под настилами срезки — ниже досок
    for (const d of this.decks) {
      const rx = x - d.x;
      const rz = z - d.z;
      const a = rx * d.fx + rz * d.fz;
      const b = -rx * d.fz + rz * d.fx;
      if (Math.abs(a) > d.hl + 1.5 || Math.abs(b) > d.hw + 1.5) continue;
      const k = Math.min(1, Math.max(0, (a + d.hl) / (2 * d.hl)));
      h = Math.min(h, d.y0 + (d.y1 - d.y0) * k - 0.4);
    }
    // река и пруд: берег спускается к воде, русло — под водой
    const wi = waterInside(x, z);
    if (wi > -BANK) {
      const bed = wi >= 0 ? RIVER_BED + (WATER_Y - 0.25 - RIVER_BED) * Math.max(0, 1 - wi / 1.2) : WATER_Y - 0.25 + (wi + BANK) * 0;
      const bank = wi >= 0 ? bed : Math.min(h, WATER_Y - 0.25 + ((wi + BANK) / BANK) * 0 + (-wi / BANK) * (h - (WATER_Y - 0.25)));
      h = Math.min(h, wi >= 0 ? bed : bank);
    }
    this.edge = emin;
    this.roadY = roadY;
    return h;
  }

  /** Насколько точка в воде (м; > 0 — в реке или пруду) */
  water(x: number, z: number): number {
    return waterInside(x, z);
  }
}

export interface HillsCtx {
  scene: THREE.Scene;
  track: Track;
  layout: EdgeLayout;
  /** Статика с вершинными цветами (склеивается миром) */
  solid: THREE.BufferGeometry[];
  box: { x0: number; z0: number; x1: number; z1: number };
  festive: Festive;
  rng: () => number;
  /** Телефон: меньше деревьев, лоз и зрителей */
  lite: boolean;
}

interface Drop {
  jet: number;
  ph: number;
  vh: number;
  vy: number;
  curtain: boolean;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Дома деревни: тёплые штукатурки и ставни */
const WALLS = [0xf6eedc, 0xf3e2c0, 0xeec98a, 0xf2bf9a, 0xf0cfc8, 0xf5df96, 0xfaf6ee, 0xe9d7b5];
const SHUTTERS = [0x3f7fb5, 0x4f8a5a, 0x2f9a9a, 0x7a5a3a, 0x5c74c8];

export class HillsScene {
  readonly terrain: HillsTerrain;
  private readonly c: HillsCtx;
  private readonly tr: Track;
  /** Брызги фонтана */
  private spray: THREE.Points | null = null;
  private readonly drops: Drop[] = [];
  private fountainY = 0;
  private readonly fountain: { x: number; z: number };
  private ripple: THREE.Texture | null = null;
  /** Занятые места (дома, трибуны, фонтан): x, z, радиус — деревья туда не ставим */
  private readonly taken: Array<[number, number, number]> = [];

  constructor(c: HillsCtx) {
    this.c = c;
    this.tr = c.track;
    this.terrain = new HillsTerrain(c.track, c.layout, c.track.hz.decks, c.box);
    this.fountain = hillsFountain();
    this.buildTerrain();
    this.buildBridge();
    this.buildFountain();
    this.buildVillage();
    this.buildRailway();
    this.buildStart();
    this.buildFans();
    this.buildVineyard();
    this.buildTrees();
    this.buildShortcutSign();
  }

  /** Высота земли под точкой */
  ground(x: number, z: number): number {
    return this.terrain.height(x, z);
  }

  /** Мост: под ним «юбки» не нужны — у моста своё тело с аркой */
  noSkirt(i: number): boolean {
    return this.tr.leg[i] === 12;
  }

  // ------------------------------------------------------------ земля

  private buildTerrain(): void {
    const b = this.c.box;
    const t = this.terrain;
    // ближняя сетка: от рамки суши с запасом
    const x0 = Math.floor(b.x0 / GRID) * GRID;
    const z0 = Math.floor(b.z0 / GRID) * GRID;
    const nx = Math.ceil((b.x1 - x0) / GRID) + 1;
    const nz = Math.ceil((b.z1 - z0) / GRID) + 1;
    this.c.scene.add(this.grid(x0, z0, GRID, nx, nz, (x, z) => t.height(x, z), null));
    // дальняя: кольцо вокруг, внутрь рамки заходит на клетку и чуть ниже (шов не светится)
    const fx0 = Math.floor((b.x0 - FAR_PAD) / FAR) * FAR;
    const fz0 = Math.floor((b.z0 - FAR_PAD) / FAR) * FAR;
    const fnx = Math.ceil((b.x1 + FAR_PAD - fx0) / FAR) + 1;
    const fnz = Math.ceil((b.z1 + FAR_PAD - fz0) / FAR) + 1;
    const inner = (x: number, z: number): boolean => x > b.x0 + FAR && x < b.x1 - FAR && z > b.z0 + FAR && z < b.z1 - FAR;
    const far = this.grid(fx0, fz0, FAR, fnx, fnz, (x, z) => {
      let h = naturalHeight(x, z);
      const wi = waterInside(x, z);
      if (wi > -BANK * 2) h = Math.min(h, wi >= 0 ? RIVER_BED : WATER_Y - 0.25 - (wi / (BANK * 2)) * (h - WATER_Y));
      const inside = x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
      return inside ? Math.min(h, t.height(x, z)) - 0.3 : h;
    }, inner);
    this.c.scene.add(far);
  }

  /**
   * Сетка высот nx × nz с шагом step от (x0, z0). skip — клетки, которые не строим (внутри ближней сетки).
   * Цвет: трава с пятнами, у воды и на пляже — песок (вершинный вес смешивания двух текстур).
   */
  private grid(x0: number, z0: number, step: number, nx: number, nz: number, hf: (x: number, z: number) => number, skip: ((x: number, z: number) => boolean) | null): THREE.Mesh {
    const count = nx * nz;
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const col = new Float32Array(count * 3);
    const sand = new Float32Array(count);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const k = iz * nx + ix;
        const x = x0 + ix * step;
        const z = z0 + iz * step;
        const h = hf(x, z);
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        uv[k * 2] = x / 7;
        uv[k * 2 + 1] = z / 7;
        // песок: пляж, берег реки, сухая земля виноградника
        const wi = waterInside(x, z);
        let s = 0;
        if (wi > -BANK - 1.5) s = Math.max(s, smooth01((wi + BANK + 1.5) / 1.5));
        if (z > 182) s = Math.max(s, smooth01((z - 186) / 5) * smooth01((2.2 - h) / 1.2));
        if (h < WATER_Y + 0.3) s = 1;
        if (inVineyard(x, z)) s = Math.max(s, 0.42);
        sand[k] = s;
        // пятна: светлее на склонах к солнцу и выше, темнее в низинах
        const n1 = Math.sin(x * 0.07 + z * 0.023) * Math.sin(z * 0.061 - x * 0.017);
        const n2 = Math.sin(x * 0.19 + 1.7) * Math.sin(z * 0.17 + 0.3);
        const lift = smooth01((h - 2) / 18);
        _c.setRGB(0.95 + 0.07 * n1 + 0.08 * lift, 1.0 + 0.04 * n2, 0.88 + 0.05 * n1 - 0.04 * lift);
        col[k * 3] = _c.r;
        col[k * 3 + 1] = _c.g;
        col[k * 3 + 2] = _c.b;
      }
    }
    const idx: number[] = [];
    for (let iz = 0; iz < nz - 1; iz++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        const x = x0 + (ix + 0.5) * step;
        const z = z0 + (iz + 0.5) * step;
        if (skip && skip(x, z)) continue;
        const a = iz * nx + ix;
        const b2 = a + 1;
        const c2 = a + nx;
        const d = c2 + 1;
        // диагональ — по меньшему перепаду (ровнее берега и откосы)
        const ha = pos[a * 3 + 1];
        const hb = pos[b2 * 3 + 1];
        const hc = pos[c2 * 3 + 1];
        const hd = pos[d * 3 + 1];
        if (Math.abs(ha - hd) < Math.abs(hb - hc)) idx.push(a, c2, d, a, d, b2);
        else idx.push(a, c2, b2, b2, c2, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSand', new THREE.BufferAttribute(sand, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = staticMesh(g, this.terrainMat(), false);
    mesh.receiveShadow = true;
    return mesh;
  }

  private terrainMatCache: THREE.MeshStandardMaterial | null = null;

  /** Трава и песок одним материалом: вес песка — в вершинах */
  private terrainMat(): THREE.MeshStandardMaterial {
    if (this.terrainMatCache) return this.terrainMatCache;
    const m = new THREE.MeshStandardMaterial({ map: grassTexture(false), vertexColors: true, roughness: 0.96 });
    const sandMap = sandTexture();
    m.onBeforeCompile = (s) => {
      s.uniforms.uSandMap = { value: sandMap };
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSand;\nvarying float vSand;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSand = aSand;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uSandMap;\nvarying float vSand;')
        .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 gTex = texture2D( map, vMapUv );
  vec4 sTex = texture2D( uSandMap, vMapUv * 1.4 );
  // трава чуть ярче к свету; песок — тёплый, чистый
  diffuseColor *= mix( gTex * vec4( 0.92, 0.96, 0.84, 1.0 ), sTex * vec4( 1.02, 0.98, 0.92, 1.0 ), smoothstep( 0.0, 1.0, vSand ) );
#endif`);
    };
    m.customProgramCacheKey = () => 'race-hills-terrain';
    this.terrainMatCache = m;
    return m;
  }

  // ------------------------------------------------------------ мост

  /** Каменный мост на ноге 12: тело от берега до берега с аркой над рекой (парапеты — ограждение дороги) */
  private buildBridge(): void {
    const tr = this.tr;
    const segs: number[] = [];
    for (let i = 0; i < tr.n; i++) if (tr.leg[i] === 12) segs.push(i);
    if (!segs.length) return;
    const i0 = segs[0];
    const i1 = (segs[segs.length - 1] + 1) % tr.n;
    // ось моста — от начала до конца ноги
    const ax = tr.px[i0];
    const az = tr.pz[i0];
    const ux = tr.tx[i0];
    const uz = tr.tz[i0];
    const L = (tr.px[i1] - ax) * ux + (tr.pz[i1] - az) * uz;
    const half = Math.max(tr.hw[i0], tr.hw[i1]) + 0.6;
    // где над рекой: проекция берегов на ось
    const along = (x: number): number => (x - ax) * ux;
    const r0 = Math.min(along(RIVER_X0), along(RIVER_X1));
    const r1 = Math.max(along(RIVER_X0), along(RIVER_X1));
    const roadAt = (u: number): number => {
      let best = i0;
      for (const i of segs) if (Math.abs((tr.px[i] - ax) * ux + (tr.pz[i] - az) * uz - u) < Math.abs((tr.px[best] - ax) * ux + (tr.pz[best] - az) * uz - u)) best = i;
      return tr.h[best];
    };
    const shape = new THREE.Shape();
    const bottom = RIVER_BED - 0.6;
    const u0 = -1.5;
    const u1 = L + 1.5;
    shape.moveTo(u0, bottom);
    shape.lineTo(u1, bottom);
    for (let u = u1; u >= u0 - 1e-6; u -= 0.5) shape.lineTo(u, roadAt(Math.min(L, Math.max(0, u))) + 0.01);
    shape.lineTo(u0, bottom);
    // арка: полуэллипс от берега до берега, пята под водой
    const hole = new THREE.Path();
    const mid = (r0 + r1) / 2;
    const span = (r1 - r0) / 2;
    const top = roadAt(mid) - 0.75;
    const spring = WATER_Y - 0.25;
    hole.moveTo(r0, bottom + 0.15);
    hole.lineTo(r0, spring);
    for (let k = 1; k < 24; k++) {
      const a = Math.PI - (k / 24) * Math.PI;
      hole.lineTo(mid + Math.cos(a) * span, spring + Math.sin(a) * (top - spring));
    }
    hole.lineTo(r1, spring);
    hole.lineTo(r1, bottom + 0.15);
    hole.lineTo(r0, bottom + 0.15);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: half * 2, bevelEnabled: false, curveSegments: 4 });
    // в осях моста: x — вдоль, y — вверх, z — поперёк (от −half до +half)
    geo.translate(0, 0, -half);
    const yaw = Math.atan2(-uz, ux);
    geo.rotateY(yaw);
    geo.translate(ax, 0, az);
    const map = stoneWallTexture();
    map.repeat.set(0.38, 0.75);
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.92 });
    mat.color.setRGB(1.04, 1.0, 0.94);
    this.c.scene.add(staticMesh(geo, mat, true));
  }

  // ------------------------------------------------------------ фонтан

  private buildFountain(): void {
    const { x, z } = this.fountain;
    const y = this.terrain.height(x, z) + 0.12;
    this.fountainY = y;
    this.taken.push([x, z, 6]);
    const stone = 0xeee4d2;
    const dark = 0xc9bba3;
    const out = this.c.solid;
    // площадка, чаша, борт
    out.push(place(paint(new THREE.CylinderGeometry(4.6, 4.7, 0.3, 40), 0xe2d6c0), x, y - 0.05, z));
    out.push(place(paint(new THREE.CylinderGeometry(4.25, 4.35, 0.75, 40, 1, true), stone), x, y + 0.45, z));
    out.push(place(paint(new THREE.TorusGeometry(4.3, 0.17, 6, 48).rotateX(Math.PI / 2), 0xf6efe2), x, y + 0.83, z));
    out.push(place(paint(new THREE.CylinderGeometry(3.95, 3.95, 0.7, 40, 1, true), dark), x, y + 0.45, z));
    // колонна и две чаши
    out.push(place(paint(new THREE.CylinderGeometry(0.42, 0.62, 1.9, 16), stone), x, y + 1.05, z));
    out.push(place(paint(new THREE.CylinderGeometry(1.9, 0.5, 0.45, 28), stone), x, y + 2.1, z));
    out.push(place(paint(new THREE.CylinderGeometry(0.28, 0.36, 1.0, 12), stone), x, y + 2.7, z));
    out.push(place(paint(new THREE.CylinderGeometry(0.95, 0.3, 0.3, 20), stone), x, y + 3.25, z));
    out.push(place(paint(new THREE.SphereGeometry(0.28, 12, 8), 0xd9b25a), x, y + 3.6, z));
    // вода в чаше и в верхней чаше
    const water = new THREE.MeshStandardMaterial({ color: 0x3fb6e0, roughness: 0.08, metalness: 0.1, emissive: 0x0b3a52, emissiveIntensity: 0.35 });
    const w1 = new THREE.Mesh(new THREE.CircleGeometry(3.95, 40).rotateX(-Math.PI / 2), water);
    w1.position.set(x, y + 0.66, z);
    const w2 = new THREE.Mesh(new THREE.CircleGeometry(1.75, 28).rotateX(-Math.PI / 2), water);
    w2.position.set(x, y + 2.31, z);
    this.ripple = rippleTexture();
    this.ripple.repeat.set(2, 2);
    const rip = new THREE.Mesh(new THREE.CircleGeometry(3.95, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.ripple, transparent: true, opacity: 0.55, depthWrite: false }));
    rip.position.set(x, y + 0.675, z);
    this.c.scene.add(w1, w2, rip);
    // брызги: 8 струй с верхушки в чашу и «занавес» с края верхней чаши
    const N = this.c.lite ? 90 : 180;
    for (let k = 0; k < N; k++) {
      const curtain = k % 4 === 3;
      this.drops.push({ jet: k % 8, ph: (k * 0.618) % 1, vh: 2.3 + ((k * 37) % 11) * 0.06, vy: 1.8 + ((k * 53) % 7) * 0.08, curtain });
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const pm = new THREE.PointsMaterial({
      map: tex.softDot('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)'), color: 0xe4f7ff, size: 0.32, transparent: true, depthWrite: false, sizeAttenuation: true,
    });
    this.spray = new THREE.Points(pg, pm);
    this.spray.frustumCulled = false;
    this.c.scene.add(this.spray);
    this.updateSpray(0);
  }

  private updateSpray(t: number): void {
    const sp = this.spray;
    if (!sp) return;
    const { x, z } = this.fountain;
    const y0 = this.fountainY;
    const arr = sp.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = arr.array as Float32Array;
    this.drops.forEach((d, k) => {
      const ang = (d.jet / 8) * Math.PI * 2 + (d.curtain ? k * 0.37 : 0);
      if (d.curtain) {
        // с края верхней чаши — вниз, чуть наружу
        const tt = ((t * 0.9 + d.ph) % 1) * 0.62;
        const r = 1.9 + tt * 0.5;
        a[k * 3] = x + Math.cos(ang) * r;
        a[k * 3 + 1] = y0 + 2.3 - 4.9 * tt * tt;
        a[k * 3 + 2] = z + Math.sin(ang) * r;
        return;
      }
      const T = 0.98;
      const tt = ((t * 1.1 + d.ph) % 1) * T;
      const r = 0.25 + d.vh * tt;
      a[k * 3] = x + Math.cos(ang) * r;
      a[k * 3 + 1] = y0 + 3.7 + d.vy * tt - 4.9 * tt * tt;
      a[k * 3 + 2] = z + Math.sin(ang) * r;
    });
    arr.needsUpdate = true;
  }

  // ------------------------------------------------------------ деревня

  /** Дома вдоль улиц деревни (ноги 15 и 18) с обеих сторон: штукатурка, черепица, окна со ставнями и цветами */
  private buildVillage(): void {
    const tr = this.tr;
    const rng = this.c.rng;
    const roof = parts();
    const geos = this.c.solid;
    for (const leg of [15, 18]) {
      const pts: number[] = [];
      for (let i = 0; i < tr.n; i++) if (tr.leg[i] === leg) pts.push(i);
      if (pts.length < 2) continue;
      const first = pts[0];
      const last = pts[pts.length - 1];
      const fx = tr.tx[first];
      const fz = tr.tz[first];
      const legLen = tr.legAt[last];
      for (const sd of [-1, 1]) {
        let a = 6 + rng() * 4;
        while (a < legLen - 8) {
          const w = 6.5 + rng() * 3.5;
          const d = 6 + rng() * 2.5;
          const at = a + w / 2;
          // точка на ноге
          let i = first;
          for (const k of pts) if (Math.abs(tr.legAt[k] - at) < Math.abs(tr.legAt[i] - at)) i = k;
          const rx = -fz * sd;
          const rz = fx * sd;
          const off = tr.hw[i] + (sd > 0 ? this.c.layout.outR[i] : this.c.layout.outL[i]) + 1.6 + d / 2;
          const cx = tr.px[i] + rx * off;
          const cz = tr.pz[i] + rz * off;
          a += w + 0.4 + (rng() < 0.3 ? 2.5 + rng() * 3 : 0);
          // не на чужой дороге и не у переезда, качелей и тюков
          if (!this.rectFree(cx, cz, fx, fz, w + 1, d + 1, 0.6)) continue;
          if (this.nearMover(cx, cz, 9)) continue;
          this.house(geos, roof, cx, cz, -rx, -rz, w, d, rng);
        }
      }
    }
    if (roof.idx.length) {
      const map = roofTexture();
      this.c.scene.add(staticMesh(buildGeo(roof), new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.78 }), true));
    }
  }

  /** Подвижная помеха или блок рядом (дома и деревья не загораживают переезд и качели) */
  private nearMover(x: number, z: number, r: number): boolean {
    const hz = this.tr.hz;
    for (const m of hz.movers) if (Math.hypot(m.cx - x, m.cz - z) < r + Math.sqrt(m.reach2) * 0.5) return true;
    return false;
  }

  /** Прямоугольник (центр, ось a вдоль (ax, az), размер w × d) дальше clear от ограждений, не в воде, не занят */
  private rectFree(cx: number, cz: number, ax: number, az: number, w: number, d: number, clear: number): boolean {
    const t = this.terrain;
    const nx = -az;
    const nz = ax;
    for (const u of [-0.5, 0, 0.5]) {
      for (const v of [-0.5, 0, 0.5]) {
        const x = cx + ax * u * w + nx * v * d;
        const z = cz + az * u * w + nz * v * d;
        t.height(x, z);
        if (t.edge < clear || t.water(x, z) > -1.5) return false;
      }
    }
    const r = Math.max(w, d) / 2;
    return this.taken.every(([ox, oz, or]) => Math.hypot(cx - ox, cz - oz) > r * 0.7 + or);
  }

  /** Место свободно: дальше clear метров от ограждения любой дороги (по углам квадрата r), не в воде, не занято */
  private free(x: number, z: number, r: number, clear: number): boolean {
    const t = this.terrain;
    for (const [dx, dz] of [[0, 0], [-r, -r], [r, -r], [r, r], [-r, r]]) {
      t.height(x + dx, z + dz);
      if (t.edge < clear) return false;
      if (t.water(x + dx, z + dz) > -1.5) return false;
    }
    return this.taken.every(([ox, oz, or]) => Math.hypot(x - ox, z - oz) > r + or);
  }

  /** Дом: фасад смотрит на улицу по (nx, nz); стены уходят в землю (на склоне не висят) */
  private house(out: THREE.BufferGeometry[], roof: GeoParts, cx: number, cz: number, nx: number, nz: number, w: number, d: number, rng: () => number): void {
    const t = this.terrain;
    const ry = Math.atan2(nx, nz);
    // ось вдоль фасада: (cos ry, −sin ry); вглубь — −n
    const ax = Math.cos(ry);
    const az = -Math.sin(ry);
    let base = -Infinity;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) base = Math.max(base, t.height(cx + ax * u * (w / 2) + nx * v * (d / 2), cz + az * u * (w / 2) + nz * v * (d / 2)));
    const floors = rng() < 0.55 ? 2 : 1;
    const fh = 3.1;
    const h = floors * fh + 0.4;
    const color = WALLS[Math.floor(rng() * WALLS.length)];
    const shutter = SHUTTERS[Math.floor(rng() * SHUTTERS.length)];
    const P = (u: number, y: number, v: number): [number, number, number] => [cx + ax * u + nx * v, base + y, cz + az * u + nz * v];
    const box = (bw: number, bh: number, bd: number, u: number, y: number, v: number, c: number): void => {
      const [x, yy, z] = P(u, y + bh / 2, v);
      out.push(place(paint(new THREE.BoxGeometry(bw, bh, bd), c), x, yy, z, ry));
    };
    // стены (на 1,5 м в землю) и цоколь
    box(w, h + 1.5, d, 0, -1.5, 0, color);
    box(w + 0.08, 0.55, d + 0.08, 0, -0.05, 0, 0xc9b79c);
    // окна: стекло, рама, ставни, ящик с геранью; дверь в середине первого этажа
    const n = Math.max(1, Math.floor(w / 2.4));
    const glass = 0x2f4458;
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < n; k++) {
        const u = -w / 2 + (w * (k + 0.5)) / n;
        const y = f * fh + 1.15;
        if (f === 0 && k === Math.floor(n / 2)) {
          box(1.1, 2.15, 0.1, u, 0.3, d / 2 + 0.02, 0x7a4a2a);
          box(1.3, 0.12, 0.2, u, 2.45, d / 2 + 0.05, 0xf6f2ea);
          continue;
        }
        box(1.02, 1.32, 0.06, u, y - 0.06, d / 2 + 0.01, 0xfaf8f2);
        box(0.86, 1.15, 0.06, u, y + 0.02, d / 2 + 0.035, glass);
        for (const s of [-1, 1]) box(0.44, 1.18, 0.05, u + s * 0.68, y, d / 2 + 0.04, shutter);
        if (rng() < 0.6) {
          box(0.95, 0.2, 0.28, u, y - 0.22, d / 2 + 0.14, 0x9a5a3a);
          box(0.9, 0.18, 0.24, u, y - 0.04, d / 2 + 0.15, rng() < 0.5 ? 0xe8364a : 0xff6fae);
        }
      }
    }
    // крыша: два ската вдоль улицы, свес 0,35 м, фронтоны — цвета стен
    const pitch = 0.5;
    const over = 0.35;
    const rise = (d / 2 + over) * pitch;
    const yE = h;
    const yR = h + rise;
    const wc = new THREE.Color(1, 1, 1);
    for (const v of [-1, 1]) {
      const eA = P(-w / 2 - over, yE - over * pitch, v * (d / 2 + over));
      const eB = P(w / 2 + over, yE - over * pitch, v * (d / 2 + over));
      const rB = P(w / 2 + over, yR, 0);
      const rA = P(-w / 2 - over, yR, 0);
      const sl = Math.hypot(d / 2 + over, rise + over * pitch);
      const nrm: V3 = [nx * v * pitch, 1, nz * v * pitch];
      face(roof, eA, eB, rB, rA, nrm, [0, 0, (w + over * 2) / 2, 0, (w + over * 2) / 2, sl / 2, 0, sl / 2], same(wc));
    }
    // фронтоны: треугольники цвета стен на торцах
    const gable = new THREE.BufferGeometry();
    const tri: number[] = [];
    for (const u of [-w / 2, w / 2]) {
      const a = P(u, yE, -d / 2);
      const b = P(u, yE, d / 2);
      const c = P(u, yR - 0.05, 0);
      tri.push(...a, ...b, ...c, ...a, ...c, ...b);
    }
    gable.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    gable.computeVertexNormals();
    out.push(paint(gable, color));
    // труба
    if (rng() < 0.5) box(0.6, 1.4, 0.6, w * 0.25, h + rise * 0.4, -d * 0.15, 0xd8c8b0);
    this.taken.push([cx, cz, Math.max(w, d) / 2 + 0.5]);
    void same;
    void WHITE;
  }

  /** Переезд: рельсы поперёк улицы у шлагбаумов и знаки «крест» */
  private buildRailway(): void {
    const tr = this.tr;
    const gates = tr.hz.movers.filter((m) => m.kind === 3);
    if (!gates.length) return;
    const g0 = gates[0];
    // ось улицы в точке шлагбаума: перпендикуляр к стреле
    const fx = -g0.uz;
    const fz = g0.ux;
    const cx = gates.reduce((a, m) => a + m.cx, 0) / gates.length + fx * 3.2;
    const cz = gates.reduce((a, m) => a + m.cz, 0) / gates.length + fz * 3.2;
    const out = this.c.solid;
    const t = this.terrain;
    const ry = Math.atan2(-g0.uz, g0.ux);
    // поперёк улицы на ±24 м: шпалы и две нитки
    for (let u = -24; u <= 24; u += 0.7) {
      const x = cx + g0.ux * u;
      const z = cz + g0.uz * u;
      const y = Math.max(t.height(x, z) + 0.12, roadNear(t, x, z));
      out.push(place(paint(new THREE.BoxGeometry(0.24, 0.07, 2.4), 0x6b4f36), x, y + 0.01, z, ry));
      for (const s of [-0.72, 0.72]) out.push(place(paint(new THREE.BoxGeometry(0.72, 0.09, 0.08), 0x8c9096), x + fx * s, y + 0.07, z + fz * s, ry));
    }
  }

  // ------------------------------------------------------------ старт: арка, трибуны, флажки

  private buildStart(): void {
    const tr = this.tr;
    const fest = this.c.festive;
    const out = this.c.solid;
    const lay = this.c.layout;
    // арка над линией старта
    const i = 0;
    const fx = tr.tx[i];
    const fz = tr.tz[i];
    const rx = -fz;
    const rz = fx;
    const y = tr.h[i];
    const span = tr.hw[i] + Math.max(lay.outL[i], lay.outR[i]) + 0.9;
    const H = 7.2;
    const ry = Math.atan2(fx, fz);
    for (const s of [-1, 1]) {
      const x = tr.px[i] + rx * span * s;
      const z = tr.pz[i] + rz * span * s;
      const g = this.terrain.height(x, z);
      out.push(place(paint(new THREE.BoxGeometry(1.2, H + (y - g) + 0.5, 1.2), 0xf4f1ea), x, (g + y + H) / 2 - 0.25, z, ry));
      for (const b of [1.4, 3.4, 5.4]) out.push(place(paint(new THREE.BoxGeometry(1.26, 0.7, 1.26), 0xd8362c), x, y + b, z, ry));
      fest.flag(x, y + H + 0.9, z, 3.2, Math.atan2(-fz, fx), s > 0 ? 0xffd23f : 0x2f8fe0, 1.7);
    }
    const cx = tr.px[i];
    const cz = tr.pz[i];
    out.push(place(paint(new THREE.BoxGeometry(span * 2 + 1.4, 1.9, 0.7), 0xf4f1ea), cx, y + H + 0.1, cz, ry));
    const banner = bannerTexture('TIREDWOOD GRAND PRIX', '#1e4fa8', '#ffffff', '#ffd23f');
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 0.6, 1.6), new THREE.MeshStandardMaterial({ map: banner, emissiveMap: banner, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.6 }));
      m.position.set(cx - fx * 0.37 * s, y + H + 0.1, cz - fz * 0.37 * s);
      m.rotation.y = Math.atan2(-fx * s, -fz * s);
      this.c.scene.add(m);
    }
    const checker = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 0.6, 0.6), new THREE.MeshStandardMaterial({ map: tex.checkerTexture(Math.round(span * 3), 1), roughness: 0.7, side: THREE.DoubleSide }));
    checker.position.set(cx, y + H - 1.1, cz);
    checker.rotation.y = Math.atan2(fx, fz);
    this.c.scene.add(checker);
    // гирлянды от арки вдоль прямой
    for (const s of [-1, 1]) {
      const ax = cx + rx * span * s;
      const az = cz + rz * span * s;
      fest.bunting(ax, y + H - 0.2, az, ax + fx * 26, y + 4.5, az + fz * 26, 0.6);
      fest.bunting(ax, y + H - 0.2, az, ax - fx * 26, y + 4.5, az - fz * 26, 0.6);
    }
    // трибуна слева от прямой (на юг, к морю)
    const off = tr.hw[i] + lay.outL[i] + 1.8;
    const [sx, sz] = [tr.px[i] - rx * off, tr.pz[i] - rz * off];
    const sy = Math.min(y, this.terrain.height(sx, sz));
    this.taken.push(buildGrandstand(this.c.scene, out, fest, { x: tr.px[i], z: tr.pz[i], fx, fz, sd: -1, a0: -40, a1: 34, off, y0: y, floor: sy }));
  }

  /** Болельщики на склонах у шпилек и на гребне: кучки желеек на траве за ограждением */
  private buildFans(): void {
    const tr = this.tr;
    const fest = this.c.festive;
    const rng = this.c.rng;
    const spots: Array<[number, number]> = [];
    // снаружи узлов-шпилек (3, 5, 7) и у гребня (нога 9)
    for (const node of [3, 5, 7, 9]) {
      let i = -1;
      for (let k = 0; k < tr.n; k++) if (tr.node[k] === node) {
        i = k;
        break;
      }
      if (i < 0) continue;
      spots.push([i, 1]);
    }
    for (let k = 0; k < tr.n; k++) if (tr.leg[k] === 9 && Math.abs(tr.legAt[k] - 30) < 1.1) spots.push([k, -1]);
    for (const [i, s] of spots) {
      const sd = (tr.curv[i] > 0 ? 1 : -1) * s;
      const off = tr.hw[i] + (sd > 0 ? this.c.layout.outR[i] : this.c.layout.outL[i]) + 3;
      const rx = -tr.tz[i] * sd;
      const rz = tr.tx[i] * sd;
      for (let k = 0; k < 9; k++) {
        const x = tr.px[i] + rx * (off + rng() * 3.5) + tr.tx[i] * (rng() - 0.5) * 9;
        const z = tr.pz[i] + rz * (off + rng() * 3.5) + tr.tz[i] * (rng() - 0.5) * 9;
        this.terrain.height(x, z);
        if (this.terrain.edge < 1.5) continue;
        const y = this.terrain.height(x, z);
        fest.seat({ x, y, z, yaw: Math.atan2(-rx, -rz) });
      }
      this.taken.push([tr.px[i] + rx * (off + 1.7), tr.pz[i] + rz * (off + 1.7), 5]);
    }
  }

  // ------------------------------------------------------------ виноградник и деревья

  private buildVineyard(): void {
    const rng = this.c.rng;
    const t = this.terrain;
    const list: Array<[number, number, number, number]> = [];
    const step = this.c.lite ? 2.2 : 1.5;
    for (const blk of VINEYARD) {
      for (let x = blk.x0; x <= blk.x1; x += 2.8) {
        for (let z = blk.z0; z <= blk.z1; z += step) {
          const y = t.height(x, z);
          if (t.edge < 2.5 || t.water(x, z) > -3) continue;
          list.push([x + (rng() - 0.5) * 0.2, y, z, rng()]);
        }
      }
    }
    if (!list.length) return;
    // куст лозы на колышке: зелёный ком и тёмный ствол
    const bush = new THREE.IcosahedronGeometry(0.55, 0);
    bush.scale(1, 0.85, 1.25);
    bush.translate(0, 1.0, 0);
    const stake = new THREE.CylinderGeometry(0.04, 0.05, 1.4, 5).translate(0, 0.7, 0);
    const geo = mergeGeometries([shade(bush, 0x5f9a35, 0.5, 1.5), shade(stake, 0x5a4330, 0, 1.4)], false)!;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), list.length);
    list.forEach(([x, y, z, r], k) => {
      _q.setFromAxisAngle(UP, r * 6.28);
      _m.compose(_p.set(x, y - 0.05, z), _q, _s.set(0.85 + r * 0.3, 0.85 + r * 0.3, 0.85 + r * 0.3));
      mesh.setMatrixAt(k, _m);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.c.scene.add(mesh);
  }

  private buildTrees(): void {
    const rng = this.c.rng;
    const t = this.terrain;
    const b = this.c.box;
    const cyp: number[][] = [];
    const pine: number[][] = [];
    const round: number[][] = [];
    const add = (x: number, z: number, near: boolean): void => {
      if (inVineyard(x, z)) return;
      const y = t.height(x, z);
      if (y < WATER_Y + 0.6) return;
      if (near && !this.free(x, z, 1.2, 3)) return;
      if (!near && t.water(x, z) > -3) return;
      const k = rng();
      const sc = 0.8 + rng() * 0.5;
      // у воды — круглые (ивы), на склонах — кипарисы и оливы, пинии — подальше от дороги (широкий зонтик)
      const wet = t.water(x, z) > -10;
      if (wet || k < 0.36) round.push([x, y, z, sc, wet ? 1 : 0]);
      else if (k < 0.82 || (near && t.edge < 6)) cyp.push([x, y, z, sc, 0]);
      else pine.push([x, y, z, sc, 0]);
    };
    const dense = this.c.lite ? 13 : 9;
    for (let x = b.x0; x < b.x1; x += dense) {
      for (let z = b.z0; z < b.z1; z += dense) {
        const x1 = x + rng() * dense;
        const z1 = z + rng() * dense;
        if (z1 > 184) continue;
        if (rng() > 0.45) continue;
        add(x1, z1, true);
      }
    }
    // вдали на склонах — реже
    const far = this.c.lite ? 30 : 20;
    for (let x = b.x0 - 200; x < b.x1 + 200; x += far) {
      for (let z = b.z0 - 200; z < b.z1 + 60; z += far) {
        if (x > b.x0 - 4 && x < b.x1 + 4 && z > b.z0 - 4 && z < b.z1 + 4) continue;
        const x1 = x + rng() * far;
        const z1 = z + rng() * far;
        if (z1 > 186) continue;
        add(x1, z1, false);
      }
    }
    // кипарис: веретено с заострённым верхом
    const cypress = mergeGeometries([shade(spindle(), 0x2f6a34, 0, 7), shade(new THREE.CylinderGeometry(0.16, 0.2, 1.2, 6).translate(0, 0.3, 0), 0x5a4330, 0, 1)], false)!;
    // пиния: высокий голый ствол и плоский зонтик
    const crown = new THREE.SphereGeometry(1, 12, 6);
    crown.scale(3.4, 1.15, 3.4).translate(0, 6.6, 0);
    const pineGeo = mergeGeometries([shade(crown, 0x3f7a35, 5.6, 7.6), shade(new THREE.CylinderGeometry(0.2, 0.32, 6.4, 7).translate(0, 3.2, 0), 0x6a4a34, 0, 6)], false)!;
    // круглое дерево (олива, ива): ствол и три кома
    const blobs = [new THREE.IcosahedronGeometry(1.9, 1).translate(0, 3.6, 0), new THREE.IcosahedronGeometry(1.4, 1).translate(1.2, 3.0, 0.4), new THREE.IcosahedronGeometry(1.3, 1).translate(-1.0, 3.2, -0.7)];
    const roundGeo = mergeGeometries([...blobs.map((g) => shade(g, 0x6f9d3d, 1.8, 5.4)), shade(new THREE.CylinderGeometry(0.22, 0.32, 2.6, 7).translate(0, 1.3, 0), 0x6a4a34, 0, 2.6)], false)!;
    for (const [geo, list] of [[cypress, cyp], [pineGeo, pine], [roundGeo, round]] as const) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }), list.length);
      list.forEach(([x, y, z, sc, wet], k) => {
        _q.setFromAxisAngle(UP, (k * 2.39996) % 6.283);
        const sy = geo === cypress ? sc * (0.9 + ((k * 13) % 7) * 0.06) : sc;
        _m.compose(_p.set(x, y - 0.1, z), _q, _s.set(sc, sy, sc));
        mesh.setMatrixAt(k, _m);
        mesh.setColorAt(k, _c.setRGB(wet ? 1.12 : 0.92 + ((k * 7) % 5) * 0.04, wet ? 1.1 : 1, wet ? 0.8 : 0.95));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.c.scene.add(mesh);
    }
  }

  /** Указатель «СРЕЗКА» у съезда на причал */
  private buildShortcutSign(): void {
    const decks = this.tr.hz.decks;
    if (!decks.length) return;
    const d = decks[0];
    // слева от начала первого настила, лицом к едущим
    const x = d.x - d.fx * (d.hl + 1.5) - d.fz * (d.hw + 1.2);
    const z = d.z - d.fz * (d.hl + 1.5) + d.fx * (d.hw + 1.2);
    const y = this.terrain.height(x, z);
    const map = arrowSignTexture('СРЕЗКА', '#1d5fae', '#ffffff', 0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.4), new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.6 }));
    m.position.set(x, y + 2.2, z);
    m.rotation.y = Math.atan2(-d.fx, -d.fz);
    this.c.scene.add(m);
    for (const s of [-1, 1]) this.c.solid.push(place(paint(new THREE.BoxGeometry(0.1, 2.7, 0.1), 0x3a3d42), x - d.fz * s * 1.8 * -1 + 0, y + 1.35, z + d.fx * s * 1.8 * -1));
  }

  update(_dt: number, t: number): void {
    this.updateSpray(t);
    if (this.ripple) this.ripple.offset.set((t * 0.03) % 1, (t * 0.05) % 1);
  }
}

/** Виноградник: два участка у спуска с гребня */
const VINEYARD = [
  { x0: -30, z0: -88, x1: 24, z1: -14 },
  { x0: -112, z0: -78, x1: -74, z1: -12 },
];

function inVineyard(x: number, z: number): boolean {
  for (const v of VINEYARD) if (x > v.x0 - 1 && x < v.x1 + 1 && z > v.z0 - 1 && z < v.z1 + 1) return true;
  return false;
}

/** Высота дороги рядом (для рельсов на улице): если точка на асфальте — его высота, иначе −∞ */
function roadNear(t: HillsTerrain, x: number, z: number): number {
  t.height(x, z);
  return t.edge < 0 ? t.roadY + 0.02 : -Infinity;
}

/** Покрасить геометрию: темнее книзу (тень внутри кроны) */
function shade(g: THREE.BufferGeometry, hex: number, y0: number, y1: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(hex);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / Math.max(0.01, y1 - y0)));
    _c.copy(base).multiplyScalar(0.62 + 0.48 * t);
    col.set([_c.r, _c.g, _c.b], i * 3);
  }
  src.setAttribute('color', new THREE.BufferAttribute(col, 3));
  src.deleteAttribute('uv');
  return src;
}

/** Кипарис: веретено высотой 7 м */
function spindle(): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  const shape = [0.2, 0.75, 1.05, 1.1, 1.0, 0.85, 0.65, 0.42, 0.18, 0.0];
  for (let i = 0; i <= 9; i++) prof.push(new THREE.Vector2(Math.max(0.001, shape[i]), 0.8 + (i / 9) * 6.4));
  const g = new THREE.LatheGeometry(prof, 9);
  g.computeVertexNormals();
  return g;
}
