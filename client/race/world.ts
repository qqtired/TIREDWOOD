// Мир «Портового кольца»: порт ясным днём (яркое солнце, белые облака, бирюзовое море). Дорога — лента по осевой
// трассы, ширина меняется от точки к точке: асфальт с белыми линиями, на поворотах красно-белые бордюры, по стенам —
// сплошные бетонные отбойники и стенки из покрышек, на открытых краях причала — жёлтая кромка. Суша — один контур
// вокруг дороги (shared/maps/ringland.ts) со стенками до воды; на ней штабеля контейнеров, склады, резервуары и
// портальные краны. Помехи (плиты-ускорители, лужи, бочки, блоки, настилы срезки, контейнеры на рельсах, груз крана,
// шлагбаум) рисует HazardVis. Статика склеена по материалам, тени от солнца считаются один раз. Живое — ящики с
// бонусами, банки-ловушки, чайки, лодки и буи.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../shared/constants.ts';
import { deckAt } from '../../shared/hazards.ts';
import type { TrapSnap } from '../../shared/kartnet.ts';
import { CRANE_HALF_X, type Ring, type Shed, type Tank } from '../../shared/maps/ring.ts';
import { buildRaceCourse, type RaceTrackId } from '../../shared/racecourse.ts';
import { landHas, rightNormal } from '../../shared/maps/ringland.ts';
import type { Deco } from '../../shared/maps/types.ts';
import { makeRng } from '../../shared/math.ts';
import { NO_GROUND, locate, locateAny, makeLoc, type Track, type TrackLoc } from '../../shared/track.ts';
import type { LobbyQuality } from '../lobby/world.ts';
import { Gulls, addBox, buildDeco, buildGeo, craneGeometry, fitShadow, glowSprite, glowTexture, paint, parts, place, staticMesh, updateFloaters, type Floater, type V3 } from '../render/kit.ts';
import type { Renderer } from '../render/renderer.ts';
import { fogColor, makeSea, makeSky, type SkyPalette } from '../render/sky.ts';
import * as tex from '../render/textures.ts';
import { WHITE, face, same } from './geom.ts';
import { RaceItemFx } from './itemfx.ts';
import { HazardVis } from './hazardvis.ts';
import { arrowSignTexture, jumpSignTexture } from './racetex.ts';

/** Небо ясного дня: солнце высоко на юго-западе, густая синева, белые кучевые облака, светлая бирюзовая вода */
const DAY: SkyPalette = {
  sunDir: new THREE.Vector3(-0.42, 0.74, 0.3).normalize(),
  horizon: 0xd4e8f6,
  mid: 0x8cc4f0,
  zenith: 0x2f78d4,
  sunGlow: 0xfff3d2,
  cloud: [0.74, 0.8, 0.94],
  cloudLit: [1.12, 1.1, 1.04],
  clouds: { cover: 0.42, alpha: 1.0, top: 1.0 },
  stars: 0,
  deep: 0x136790,
  shallow: 0x35b3bd,
  exposure: 1.0,
  fogNear: 140,
  fogFar: 760,
  sun: 1,
};

/** Асфальт чуть выше бетона суши, разметка и бордюры — над асфальтом */
const ROAD_Y = 0.02;
const MARK_Y = 0.035;
/** Асфальт: метров на повтор текстуры вдоль дороги (и ширина, под которую нарисованы линии) */
const ROAD_REF = 14;
/** Жёлтая кромка по открытому краю причала */
const EDGE_LINE = 0.28;
/** Бордюр снаружи поворота и внутри, м */
const KERB_OUT = 1.0;
const KERB_IN = 0.8;
/** Отрезок на повороте: сумма кривизн его концов больше этого (радиус меньше ~100 м) */
const CORNER_CURV = 0.02;
/** Отбойник: профиль (отступ от края дороги наружу, высота) — со скосом к дороге */
const BARRIER: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.12, 0.3], [0.18, 0.8], [0.42, 0.8], [0.6, 0]];
/** Покрышки: стопка из трёх, радиус, высота, шаг; два ряда — центры на таком отступе от края */
const TIRE_R = 0.31;
const TIRE_H = 0.72;
const TIRE_STEP = 0.62;
const TIRE_ROWS = [0.32, 0.93];
/** Борта трамплина выше настила; толщина бортов */
const RAMP_RAIL = 0.45;
const RAMP_SIDE = 0.15;
/** Проём в стене у пути контейнера: на столько метров шире контейнера с каждой стороны */
const GATE_PAD = 1.6;
/** Фонари вдоль прямых: первый через столько метров от начала прямой, дальше — с шагом */
const LAMP_FIRST = 6;
const LAMP_EVERY = 24;
/** Щиты-стрелки на внешней стороне поворотов: примерно через столько метров */
const CHEVRON_EVERY = 22;
const CRATE_SIZE = 0.9;
/** Ящик висит над дорогой */
const CRATE_HOVER = 0.85;
const MAX_TRAPS = 10;
const JAR_SCALE = 1.5;
/** Контейнеры: длина 40-футового, 20-футового, ширина, высота; шаг колонок, проход между блоками, зазор торцов */
const BOX_L = 12.19;
const BOX_S = 6.06;
const BOX_W = 2.44;
const BOX_H = 2.59;
const COL_STEP = 2.52;
const AISLE = 3.4;
const END_GAP = 0.9;
const CONTAINER_COLORS = [0x9a4a3a, 0x3f6f8f, 0x4c7a5a, 0xc07a3a, 0xb89a4a, 0x7a8288, 0xcfc8b8, 0x35507a, 0x8a5a7a, 0x5a8a8a];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _rn = { x: 0, z: 0 };
const UP = new THREE.Vector3(0, 1, 0);

interface CrateVis {
  group: THREE.Group;
  box: THREE.Mesh;
  shadow: THREE.Mesh;
  y: number;
  here: boolean;
  /** 1 → 0: ящик только что появился и «выскакивает» */
  pop: number;
}

interface JarVis {
  group: THREE.Group;
  /** Банка какой ловушки (−1 — свободна) */
  id: number;
  y: number;
  pop: number;
  seen: boolean;
}

export class RaceWorld {
  readonly renderer: Renderer;
  readonly scene = new THREE.Scene();
  readonly items = new RaceItemFx(this.scene);
  readonly camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.3, 1600);
  readonly ring: Ring;
  readonly track: Track;
  private readonly sun = new THREE.DirectionalLight(0xfff0d4, 3.2);
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly seaMat: THREE.ShaderMaterial;
  private readonly floaters: Floater[] = [];
  private readonly gulls: Gulls;
  private readonly crates: CrateVis[] = [];
  private readonly jars: JarVis[] = [];
  /** Нормаль вправо в точках осевой (по среднему направлению соседних отрезков) */
  private readonly rx: Float64Array;
  private readonly rz: Float64Array;
  /** Отрезок на повороте: знак — внешняя сторона (+1 — справа), 0 — прямая. С запасом в отрезок по краям */
  private readonly corner: Int8Array;
  /** Статика по материалам — склеивается в конце конструктора */
  private readonly solid: THREE.BufferGeometry[] = [];
  private readonly marks = parts();
  private readonly deco: Deco[] = [];
  private readonly rng = makeRng(77);
  private readonly planks = tex.plankTexture();
  private readonly hazardTex = tex.hazardTexture();
  private readonly hazards: HazardVis;
  /** Занятые места на суше (для мелочи): x, z, радиус */
  private readonly taken: Array<[number, number, number]> = [];
  private readonly toAxisLoc = makeLoc();
  time = 0;

  constructor(renderer: Renderer, quality: LobbyQuality = 'high', trackId: RaceTrackId = 'port') {
    this.ring = buildRaceCourse(trackId);
    this.renderer = renderer;
    this.track = this.ring.track;
    const scene = this.scene;
    const fog = fogColor(DAY);
    scene.fog = new THREE.Fog(fog, DAY.fogNear, DAY.fogFar);
    scene.background = fog.clone();

    // --- свет: яркое солнце высоко над головой, светлое небо даёт голубоватую подсветку теней
    scene.add(new THREE.HemisphereLight(0xcfe2ff, 0xb9ab94, 1.55));
    const toSun = DAY.sunDir.clone();
    const b = this.ring.land.box;
    const center = new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    this.sun.position.copy(center).addScaledVector(toSun, 320);
    this.sun.target.position.copy(center);
    this.sun.castShadow = true;
    fitShadow(this.sun, center, new THREE.Box3(new THREE.Vector3(b.x0, -1.5, b.z0), new THREE.Vector3(b.x1, 36, b.z1)));
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2;
    scene.add(this.sun, this.sun.target);

    // --- небо и море
    const sky = makeSky(DAY);
    this.skyMat = sky.material;
    scene.add(sky);
    const sea = makeSea(DAY);
    this.seaMat = sea.material;
    scene.add(sea);

    const tr = this.track;
    const n = tr.n;
    this.rx = new Float64Array(n);
    this.rz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      rightNormal(tr, i, _rn);
      this.rx[i] = _rn.x;
      this.rz[i] = _rn.z;
    }
    this.corner = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      const c = tr.curv[i] + tr.curv[(i + 1) % n];
      if (Math.abs(c) <= CORNER_CURV) continue;
      for (let d = -1; d <= 1; d++) this.corner[(i + d + n) % n] = Math.sign(c);
    }

    this.hazards = new HazardVis({ scene, solid: this.solid, planks: this.planks, hazard: this.hazardTex, rng: this.rng }, tr);
    this.buildLand();
    this.buildRoad();
    this.buildRamps();
    this.buildWalls();
    this.buildMarkings();
    this.buildContainers();
    this.buildBuildings();
    for (const c of this.ring.deco.cranes) this.solid.push(craneGeometry(c.x, 0, c.z, c.yaw, 1));
    this.buildClutter();
    this.buildGantry();
    this.buildLamps();
    this.buildChevrons();
    this.buildSigns();
    this.buildWaterLife();
    this.flush();
    buildDeco(scene, this.deco, this.floaters);
    this.buildFarShore();
    this.buildCrates();
    this.buildJars();
    this.gulls = new Gulls(scene, -8, 25);
    this.setQuality(quality);
  }

  // ------------------------------------------------------------ помощники

  /** Точка у осевой: lat — вправо по ходу (по нормали в точке), y — высота */
  private at(i: number, lat: number, y: number): V3 {
    const tr = this.track;
    return [tr.px[i] + this.rx[i] * lat, y, tr.pz[i] + this.rz[i] * lat];
  }

  /** Точка за краем дороги в точке i: sd — сторона (+1 справа), off — на сколько метров за краем */
  private edge(i: number, sd: number, off: number, y: number): V3 {
    return this.at(i, sd * (this.track.hw[i] + off), y);
  }

  /** На отрезке i — трамплин (подъём) */
  private ramp(i: number): boolean {
    const tr = this.track;
    return tr.h[i] > 0 || tr.h[(i + 1) % tr.n] > 0;
  }

  /** Край отрезка i с этой стороны без стены (причал) */
  private open(i: number, sd: number): boolean {
    return (sd > 0 ? this.track.openR[i] : this.track.openL[i]) === 1;
  }

  private onLand(x: number, z: number): boolean {
    return landHas(this.ring.land, x, z);
  }

  /** Расстояние от точки до осевой */
  private toAxis(x: number, z: number): number {
    const tr = this.track;
    let best = Infinity;
    for (let i = 0; i < tr.n; i++) {
      const dx = tr.tx[i] * tr.len[i];
      const dz = tr.tz[i] * tr.len[i];
      const t = Math.max(0, Math.min(1, ((x - tr.px[i]) * dx + (z - tr.pz[i]) * dz) / (tr.len[i] * tr.len[i])));
      best = Math.min(best, Math.hypot(x - tr.px[i] - dx * t, z - tr.pz[i] - dz * t));
    }
    return best;
  }

  /** Дальше от края дороги, чем на gap метров (по полуширине в ближайшей точке) */
  private clearOfRoad(x: number, z: number, gap: number): boolean {
    const l = locateAny(this.track, x, z, this.toAxisLoc);
    return Math.abs(l.lat) > l.hw + gap || this.toAxis(x, z) > this.track.half + gap + 40;
  }

  private box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0): void {
    this.solid.push(place(paint(new THREE.BoxGeometry(w, h, d), color), x, y, z, ry));
  }

  /** Склеить накопленную статику по материалам. */
  private flush(): void {
    const scene = this.scene;
    if (this.solid.length) {
      scene.add(staticMesh(mergeGeometries(this.solid, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.25 }), true));
    }
    const marks = staticMesh(buildGeo(this.marks), new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }), false);
    marks.receiveShadow = true;
    marks.renderOrder = 1;
    scene.add(marks);
  }

  // ------------------------------------------------------------ суша и вода

  /** Плита суши по контуру (бетон со швами), стенки причалов до воды с мокрой полосой, кранцы, кнехты. */
  private buildLand(): void {
    const land = this.ring.land;
    const poly = land.poly;
    const m = land.count;
    const contour: THREE.Vector2[] = [];
    for (let k = 0; k < m; k++) contour.push(new THREE.Vector2(poly[k * 2], poly[k * 2 + 1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const pos: number[] = [];
    const uv: number[] = [];
    for (const v of contour) {
      pos.push(v.x, 0, v.y);
      uv.push(v.x / 4, -v.y / 4);
    }
    const idx: number[] = [];
    for (const [a, b, c] of tris) {
      // грань смотрит вверх: (b − a) × (c − a) по y положительно
      const cross = (contour[b].y - contour[a].y) * (contour[c].x - contour[a].x) - (contour[b].x - contour[a].x) * (contour[c].y - contour[a].y);
      if (cross > 0) idx.push(a, b, c);
      else idx.push(a, c, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const tint = new THREE.Color(0xf2efe8);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(contour.flatMap(() => [tint.r, tint.g, tint.b]), 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const top = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex.deckTexture(), vertexColors: true, roughness: 0.93 }));
    top.receiveShadow = true;
    this.scene.add(top);

    // стенки причалов: сухой бетон сверху, мокрая полоса с водорослями у воды, ниже — темнота
    const wall = parts();
    const dry = new THREE.Color(0xc4beb1);
    const wet = new THREE.Color(0x5e6656);
    const deep = new THREE.Color(0x26302e);
    const wetY = WATER_Y + 0.45;
    const botY = WATER_Y - 2.5;
    let run = 0;
    for (let k = 0; k < m; k++) {
      const ax = poly[k * 2];
      const az = poly[k * 2 + 1];
      const bx = poly[((k + 1) % m) * 2];
      const bz = poly[((k + 1) % m) * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) continue;
      // вода справа по ходу обхода: наружу — вправо от направления
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const nrm: V3 = [nx, 0, nz];
      const ua = (ax + az) / 2;
      const ub = ua + len / 2;
      face(wall, [ax, wetY, az], [bx, wetY, bz], [bx, 0, bz], [ax, 0, az], nrm, [ua, wetY / 2, ub, wetY / 2, ub, 0, ua, 0], [wet, wet, dry, dry]);
      face(wall, [ax, botY, az], [bx, botY, bz], [bx, wetY, bz], [ax, wetY, az], nrm, [ua, botY / 2, ub, botY / 2, ub, wetY / 2, ua, wetY / 2], [deep, deep, wet, wet]);
      // кранцы на стенке — каждые 9 м по обходу, кнехты у края — там, где за краем дороги есть полоса бетона
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      let d = 9 - (run % 9);
      for (; d < len; d += 9) {
        const x = ax + dx * d;
        const z = az + dz * d;
        const ry = Math.atan2(nx, nz);
        this.solid.push(place(paint(new THREE.BoxGeometry(0.55, 1.5, 0.3), 0x232528), x + nx * 0.15, -0.85, z + nz * 0.15, ry));
        if (this.clearOfRoad(x, z, 2.2) && Math.round((run + d) / 9) % 2 === 0) this.deco.push({ kind: 'bollard', x: x - nx * 0.55, z: z - nz * 0.55 });
      }
      run += len;
    }
    this.scene.add(staticMesh(buildGeo(wall), new THREE.MeshStandardMaterial({ map: tex.concreteTexture(), vertexColors: true, roughness: 0.95 }), false));
  }

  // ------------------------------------------------------------ дорога

  /** Асфальт лентой по осевой (кроме трамплина и провала над каналом), жёлтая кромка причалов и бордюры на поворотах. */
  private buildRoad(): void {
    const tr = this.track;
    const n = tr.n;
    const road = parts();
    const kerbs = parts();
    const yellow = new THREE.Color(0xe2c13e);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (tr.gap[i] || this.ramp(i)) continue;
      const vi = tr.s[i] / ROAD_REF;
      const vj = (j === 0 ? tr.length : tr.s[j]) / ROAD_REF;
      face(road, this.at(i, -tr.hw[i], ROAD_Y), this.at(i, tr.hw[i], ROAD_Y), this.at(j, tr.hw[j], ROAD_Y), this.at(j, -tr.hw[j], ROAD_Y), [0, 1, 0], [0, vi, 1, vi, 1, vj, 0, vj], same(WHITE));
      const sd = this.corner[i];
      const ki = tr.s[i] / 3;
      const kj = (j === 0 ? tr.length : tr.s[j]) / 3;
      for (const side of [-1, 1]) {
        if (this.open(i, side)) {
          // кромка причала: широкая жёлтая полоса у самой воды
          const a = this.edge(i, side, -EDGE_LINE, MARK_Y);
          const b = this.edge(i, side, 0, MARK_Y);
          const c = this.edge(j, side, 0, MARK_Y);
          const d = this.edge(j, side, -EDGE_LINE, MARK_Y);
          face(this.marks, a, b, c, d, [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], same(yellow));
        } else if (sd !== 0) {
          // красно-белые полосы по 1,5 м: снаружи поворота шире, внутри — уже
          const w = side === sd ? KERB_OUT : KERB_IN;
          face(kerbs, this.edge(i, side, -w, MARK_Y), this.edge(i, side, 0, MARK_Y), this.edge(j, side, 0, MARK_Y), this.edge(j, side, -w, MARK_Y), [0, 1, 0], [0, ki, 1, ki, 1, kj, 0, kj], same(WHITE));
        }
      }
    }
    const roadMesh = staticMesh(buildGeo(road), new THREE.MeshStandardMaterial({
      map: tex.asphaltTexture(ROAD_REF), roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    }), false);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);
    const kerbMesh = staticMesh(buildGeo(kerbs), new THREE.MeshStandardMaterial({
      map: tex.kerbTexture(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }), false);
    kerbMesh.receiveShadow = true;
    kerbMesh.renderOrder = 1;
    this.scene.add(kerbMesh);
  }

  /** Трамплины над каналами: дощатый настил по подъёму, жёлто-чёрные борта выше настила, торец над каналом, полоса на кромке. */
  private buildRamps(): void {
    const tr = this.track;
    const n = tr.n;
    const deck = parts();
    const steel = parts();
    const wood = new THREE.Color(0xc79a6a);
    for (let i = 0; i < n; i++) {
      if (!this.ramp(i) || tr.gap[i]) continue;
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
      // борта: внутренняя стенка над настилом, верх, наружная стенка до земли
      for (const sd of [-1, 1]) {
        const out: V3 = [this.rx[i] * sd, 0, this.rz[i] * sd];
        const inn: V3 = [-out[0], 0, -out[2]];
        const ui2 = tr.s[i];
        const uj2 = tr.s[j];
        const e = (k: number, off: number, y: number): V3 => this.edge(k, sd, off, y);
        face(steel, e(i, 0, hi), e(j, 0, hj), e(j, 0, hj + RAMP_RAIL), e(i, 0, hi + RAMP_RAIL), inn, [ui2, hi, uj2, hj, uj2, hj + RAMP_RAIL, ui2, hi + RAMP_RAIL], same(WHITE));
        face(steel, e(i, 0, hi + RAMP_RAIL), e(j, 0, hj + RAMP_RAIL), e(j, RAMP_SIDE, hj + RAMP_RAIL), e(i, RAMP_SIDE, hi + RAMP_RAIL), [0, 1, 0], [ui2, 0, uj2, 0, uj2, 0.15, ui2, 0.15], same(WHITE));
        face(steel, e(i, RAMP_SIDE, 0), e(j, RAMP_SIDE, 0), e(j, RAMP_SIDE, hj + RAMP_RAIL), e(i, RAMP_SIDE, hi + RAMP_RAIL), out, [ui2, 0, uj2, 0, uj2, hj + RAMP_RAIL, ui2, hi + RAMP_RAIL], same(WHITE));
      }
      if (tr.gap[j]) {
        // торец над каналом (ниже — стенка причала) и полоса «опасность» на кромке
        const h = hj;
        const w = tr.hw[j] + RAMP_SIDE;
        const fwd: V3 = [tr.tx[i], 0, tr.tz[i]];
        face(steel, this.at(j, -w, 0), this.at(j, w, 0), this.at(j, w, h + RAMP_RAIL), this.at(j, -w, h + RAMP_RAIL), fwd, [-w, 0, w, 0, w, h + RAMP_RAIL, -w, h + RAMP_RAIL], same(WHITE));
        const k = 1 / tr.len[i];
        const lip = (lat: number, back: number): V3 => {
          const q = this.at(j, lat, h + ROAD_Y + 0.012);
          return [q[0] - tr.tx[i] * back, q[1] - (h - hi) * k * back, q[2] - tr.tz[i] * back];
        };
        const hw = tr.hw[j];
        face(steel, lip(-hw, 1.1), lip(hw, 1.1), lip(hw, 0), lip(-hw, 0), [0, 1, 0], [-hw / 1.2, 0, hw / 1.2, 0, hw / 1.2, 1.1 / 1.2, -hw / 1.2, 1.1 / 1.2], same(WHITE));
      }
    }
    this.scene.add(staticMesh(buildGeo(deck), new THREE.MeshStandardMaterial({ map: this.planks, vertexColors: true, roughness: 0.85 }), true));
    this.scene.add(staticMesh(buildGeo(steel), new THREE.MeshStandardMaterial({
      map: this.hazardTex, roughness: 0.55, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    }), true));
  }

  /** Край отрезка i с этой стороны: стена есть (не причал, не провал и не трамплин, не проём для контейнера) */
  private walled(i: number, sd: number): boolean {
    const tr = this.track;
    if (tr.gap[i] || this.ramp(i) || this.open(i, sd)) return false;
    const j = (i + 1) % tr.n;
    const [x, , z] = this.at(i, 0, 0);
    const mx = (x + tr.px[j]) / 2 + ((this.rx[i] + this.rx[j]) / 2) * sd * (tr.hw[i] + 0.4);
    const mz = (z + tr.pz[j]) / 2 + ((this.rz[i] + this.rz[j]) / 2) * sd * (tr.hw[i] + 0.4);
    for (const g of this.hazards.gates) {
      const ex = g.bx - g.ax;
      const ez = g.bz - g.az;
      const t = Math.max(0, Math.min(1, ((mx - g.ax) * ex + (mz - g.az) * ez) / (ex * ex + ez * ez)));
      if (Math.hypot(mx - g.ax - ex * t, mz - g.az - ez * t) < g.r + GATE_PAD) return false;
    }
    return true;
  }

  /** Края со стеной: сплошной бетонный отбойник, снаружи поворотов — два ряда покрышек. */
  private buildWalls(): void {
    const tr = this.track;
    const n = tr.n;
    const conc = parts();
    const light = new THREE.Color(0xdcd8cf);
    const foot = new THREE.Color(0x8e8a82);
    const tires: Array<{ x: number; z: number; y: number; color: number }> = [];
    let tireK = 0;
    for (const sd of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        if (!this.walled(i, sd)) continue;
        const j = (i + 1) % n;
        if (this.corner[i] === sd) {
          // покрышки рядами вдоль края (внешний ряд длиннее — в нём больше стопок)
          TIRE_ROWS.forEach((o, row) => {
            const a = this.edge(i, sd, o, 0);
            const b = this.edge(j, sd, o, 0);
            const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
            const cnt = Math.max(1, Math.round(len / TIRE_STEP));
            for (let k = 0; k < cnt; k++) {
              const f = (k + 0.5) / cnt;
              const color = row === 0 ? ((tireK++ >> 1) & 1 ? 0xd23b30 : 0xf2f0ea) : 0x2c2c2e;
              tires.push({ x: a[0] + (b[0] - a[0]) * f, y: 0, z: a[2] + (b[2] - a[2]) * f, color });
            }
          });
          continue;
        }
        // блок отбойника вдоль отрезка: профиль разворачивается по нормалям точек, стыки соседних отрезков общие
        const shade = 0.96 + (i % 5) * 0.012;
        const top = light.clone().multiplyScalar(shade);
        const bot = foot.clone().multiplyScalar(shade);
        const pt = (k: number, p: number): V3 => {
          const [o, y] = BARRIER[k];
          return this.edge(p, sd, o, y);
        };
        const ua = tr.s[i] / 2;
        const ub = ua + tr.len[i] / 2;
        // наружная нормаль отрезка
        const ox = -tr.tz[i] * sd;
        const oz = tr.tx[i] * sd;
        for (let k = 0; k < BARRIER.length - 1; k++) {
          const [o0, y0] = BARRIER[k];
          const [o1, y1] = BARRIER[k + 1];
          // наружная нормаль ребра профиля (профиль обходится по часовой: дорога → верх → задняя сторона)
          const dno = y1 - y0;
          const dny = o1 - o0;
          const nl = Math.hypot(dno, dny);
          const nrm: V3 = [(-ox * dno) / nl, dny / nl, (-oz * dno) / nl];
          const c0 = y0 > 0.5 ? top : bot;
          const c1 = y1 > 0.5 ? top : bot;
          face(conc, pt(k, i), pt(k, j), pt(k + 1, j), pt(k + 1, i), nrm, [ua, (o0 + y0) / 2, ub, (o0 + y0) / 2, ub, (o1 + y1) / 2, ua, (o1 + y1) / 2], [c0, c0, c1, c1]);
        }
        // торцы — там, где отбойник кончается (проём, причал, трамплин)
        const before = (i - 1 + n) % n;
        for (const [p, dir, neighbor] of [[i, -1, before], [j, 1, j]] as const) {
          if (this.walled(neighbor, sd) && this.corner[neighbor] !== sd) continue;
          const nrm: V3 = [tr.tx[i] * dir, 0, tr.tz[i] * dir];
          face(conc, pt(4, p), pt(0, p), pt(1, p), pt(2, p), nrm, [0.3, 0, 0, 0, 0.06, 0.15, 0.09, 0.4], [bot, bot, bot, top]);
          face(conc, pt(4, p), pt(2, p), pt(3, p), pt(3, p), nrm, [0.3, 0, 0.09, 0.4, 0.21, 0.4, 0.21, 0.4], [bot, top, top, top]);
        }
      }
    }
    this.scene.add(staticMesh(buildGeo(conc), new THREE.MeshStandardMaterial({ map: tex.concreteTexture(), vertexColors: true, roughness: 0.92 }), true));

    // покрышки: одна стопка — один экземпляр; бок — текстура трёх покрышек, верх тёмный
    const side = new THREE.CylinderGeometry(TIRE_R, TIRE_R, TIRE_H, 12, 1, true);
    const cap = new THREE.CircleGeometry(TIRE_R, 12).rotateX(-Math.PI / 2).translate(0, TIRE_H / 2, 0);
    const capUv = cap.getAttribute('uv');
    for (let k = 0; k < capUv.count; k++) capUv.setXY(k, 0.5, 0.5);
    const geo = mergeGeometries([paint(side, 0xffffff), paint(cap, 0x262626)], false)!;
    geo.translate(0, TIRE_H / 2, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: tex.tireStackTexture(), vertexColors: true, roughness: 0.85 }), tires.length);
    tires.forEach((t, k) => {
      _q.setFromAxisAngle(UP, (k * 2.39996) % (Math.PI * 2));
      _m.compose(_p.set(t.x, t.y, t.z), _q, _s.set(1, 0.96 + ((k * 7) % 5) * 0.02, 1));
      mesh.setMatrixAt(k, _m);
      mesh.setColorAt(k, _c.set(t.color));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
  }

  /** Разметка: шахматная линия старта, рамки мест на решётке, полоса «опасность» у приземления за каналом. */
  private buildMarkings(): void {
    const tr = this.track;
    // линия старта — отдельный меш со своей текстурой
    const start = parts();
    const hw0 = tr.hw[0];
    const back = (lat: number, d: number): V3 => {
      const q = this.at(0, lat, MARK_Y + 0.004);
      return [q[0] + tr.tx[0] * d, q[1], q[2] + tr.tz[0] * d];
    };
    face(start, back(-hw0, -0.7), back(hw0, -0.7), back(hw0, 0.7), back(-hw0, 0.7), [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], same(WHITE));
    const startMesh = staticMesh(buildGeo(start), new THREE.MeshStandardMaterial({
      map: tex.checkerTexture(22, 2), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    }), false);
    startMesh.receiveShadow = true;
    startMesh.renderOrder = 2;
    this.scene.add(startMesh);

    if (tr.strictCheckpoints) {
      const cyan = new THREE.Color(0x71c6bf);
      for (let cp = 1; cp < tr.cpSeg.length; cp++) {
        const i = tr.cpSeg[cp];
        const point = (lat: number, fw: number): V3 => [tr.px[i] - tr.tz[i] * lat + tr.tx[i] * fw, MARK_Y + 0.004, tr.pz[i] + tr.tx[i] * lat + tr.tz[i] * fw];
        face(this.marks, point(-tr.hw[i], -0.15), point(tr.hw[i], -0.15), point(tr.hw[i], 0.15), point(-tr.hw[i], 0.15), [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], same(cyan));
        for (const side of [-1, 1]) {
          const p = point(side * (tr.hw[i] + 0.8), 0);
          this.solid.push(place(paint(new THREE.BoxGeometry(0.14, 1.8, 0.14), 0x71c6bf), p[0], 0.9, p[2]));
        }
      }
    }

    // места на решётке: белая «скобка» — поперечная черта впереди и две короткие по бокам
    const white = new THREE.Color(0xeeece4);
    for (const g of tr.grid) {
      const fx = g.hx;
      const fz = g.hz;
      const rx = -fz;
      const rz = fx;
      const bar = (a: number, b: number, c: number, d: number) => {
        // a…b — вбок (вправо), c…d — вперёд
        const p = (lat: number, fw: number): V3 => [g.x + rx * lat + fx * fw, MARK_Y, g.z + rz * lat + fz * fw];
        face(this.marks, p(a, c), p(b, c), p(b, d), p(a, d), [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], same(white));
      };
      bar(-0.95, 0.95, 1.05, 1.18);
      bar(-0.95, -0.83, -0.2, 1.05);
      bar(0.83, 0.95, -0.2, 1.05);
    }

    // за каналом: полоса «опасность» поперёк дороги там, где приземляются
    const hazard = parts();
    for (let i = 0; i < tr.n; i++) {
      const j = (i + 1) % tr.n;
      if (!tr.gap[i] || tr.gap[j]) continue;
      const fw = (lat: number, d: number): V3 => {
        const q = this.at(j, lat, MARK_Y);
        return [q[0] + tr.tx[j] * d, q[1], q[2] + tr.tz[j] * d];
      };
      const hw = tr.hw[j];
      face(hazard, fw(-hw, 0), fw(hw, 0), fw(hw, 1.2), fw(-hw, 1.2), [0, 1, 0], [-hw / 1.2, 0, hw / 1.2, 0, hw / 1.2, 1, -hw / 1.2, 1], same(WHITE));
    }
    const hz = staticMesh(buildGeo(hazard), new THREE.MeshStandardMaterial({
      map: this.hazardTex, roughness: 0.7, transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    }), false);
    hz.receiveShadow = true;
    hz.renderOrder = 2;
    this.scene.add(hz);
  }

  // ------------------------------------------------------------ порт

  /** Штабеля контейнеров на площадках: блоки по три колонки, высота стопок разная, иногда — пустое место. */
  private buildContainers(): void {
    const cont = parts();
    const rng = makeRng(31);
    for (const y of this.ring.deco.yards) {
      const z = y.alongZ;
      // a — поперёк контейнеров (колонки), b — вдоль
      const a0 = z ? y.x0 : y.z0;
      const a1 = z ? y.x1 : y.z1;
      const b0 = z ? y.z0 : y.x0;
      const b1 = z ? y.z1 : y.x1;
      for (let a = a0 + 0.3; a + COL_STEP * 3 <= a1 + 0.01; a += COL_STEP * 3 + AISLE) {
        for (let col = 0; col < 3; col++) {
          const ca = a + col * COL_STEP;
          for (let b = b0 + 0.3; b + BOX_L <= b1 + 0.01; b += BOX_L + END_GAP) {
            if (rng() < 0.12) continue;
            const levels = 1 + Math.floor(rng() * rng() * 4.6);
            for (let l = 0; l < levels; l++) {
              // иногда вместо длинного — два коротких
              const halves = rng() < 0.18 ? [[b, b + BOX_S], [b + BOX_L - BOX_S, b + BOX_L]] : [[b, b + BOX_L]];
              for (const [s0, s1] of halves) {
                const y0 = l * BOX_H;
                const min = z ? [ca, y0, s0] : [s0, y0, ca];
                const max = z ? [ca + BOX_W, y0 + BOX_H, s1] : [s1, y0 + BOX_H, ca + BOX_W];
                addBox(cont, { min, max, color: CONTAINER_COLORS[Math.floor(rng() * CONTAINER_COLORS.length)], variant: Math.floor(rng() * 7) }, 'container', rng, 0.01);
              }
            }
          }
        }
      }
    }
    if (cont.idx.length) {
      this.scene.add(staticMesh(buildGeo(cont), new THREE.MeshStandardMaterial({ map: tex.containerTexture(), vertexColors: true, roughness: 0.62, metalness: 0.2 }), true));
    }
  }

  /** Склады и резервуары: вид издали, за штабелями. */
  private buildBuildings(): void {
    for (const s of this.ring.deco.sheds) this.shed(s);
    for (const t of this.ring.deco.tanks) this.tank(t);
  }

  /** Склад: коробка со светлой гофрой, двускатная крыша с козырьком, ворота на длинных стенах */
  private shed(s: Shed): void {
    const len = s.alongZ ? s.z1 - s.z0 : s.x1 - s.x0;
    const wid = s.alongZ ? s.x1 - s.x0 : s.z1 - s.z0;
    const pitch = 0.2;
    const list: THREE.BufferGeometry[] = [];
    const walls = new THREE.Color(s.color);
    list.push(place(paint(new THREE.BoxGeometry(len, s.h, wid), walls), 0, s.h / 2, 0));
    // крыша: два ската от гребня; ширина ската вдоль уклона
    const slope = wid / 2 / Math.cos(pitch) + 0.6;
    const rise = (wid / 4) * Math.tan(pitch);
    for (const sd of [-1, 1]) {
      list.push(place(paint(new THREE.BoxGeometry(len + 1.2, 0.22, slope), 0x8c9096), 0, s.h + rise + 0.1, (sd * wid) / 4, 0, sd * pitch));
    }
    list.push(place(paint(new THREE.BoxGeometry(len + 1.2, 0.3, 0.5), 0x70757c), 0, s.h + rise * 2 + 0.2, 0));
    // ворота на обеих длинных стенах
    const doors = Math.max(2, Math.floor(len / 16));
    for (let k = 0; k < doors; k++) {
      const x = -len / 2 + (len * (k + 0.5)) / doors;
      for (const sd of [-1, 1]) {
        list.push(place(paint(new THREE.BoxGeometry(5, 4.2, 0.2), 0x5b6770), x, 2.1, (sd * wid) / 2 + sd * 0.05));
        list.push(place(paint(new THREE.BoxGeometry(5.4, 0.3, 0.3), 0xe2b33c), x, 4.35, (sd * wid) / 2 + sd * 0.1));
      }
    }
    const g = mergeGeometries(list, false)!;
    if (s.alongZ) g.rotateY(Math.PI / 2);
    g.translate((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2);
    this.solid.push(g);
    this.taken.push([(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, Math.max(len, wid) / 2 + 1]);
  }

  /** Резервуар: белый цилиндр с поясом, куполом, лестницей и трубой у основания */
  private tank(t: Tank): void {
    const list: THREE.BufferGeometry[] = [];
    list.push(place(paint(new THREE.CylinderGeometry(t.r + 0.5, t.r + 0.6, 0.4, 32), 0x8e8a82), t.x, 0.2, t.z));
    list.push(place(paint(new THREE.CylinderGeometry(t.r, t.r, t.h, 32), 0xe7e5df), t.x, 0.4 + t.h / 2, t.z));
    list.push(place(paint(new THREE.CylinderGeometry(t.r + 0.04, t.r + 0.04, 0.7, 32), 0xc0392b), t.x, 0.4 + t.h * 0.78, t.z));
    list.push(place(paint(new THREE.CylinderGeometry(t.r * 0.25, t.r, 0.9, 32), 0xd9d6cf), t.x, 0.4 + t.h + 0.45, t.z));
    list.push(place(paint(new THREE.BoxGeometry(0.12, t.h + 1, 0.6), 0x4a4f55), t.x + t.r + 0.06, 0.4 + (t.h + 1) / 2, t.z));
    list.push(place(paint(new THREE.CylinderGeometry(0.3, 0.3, t.r * 1.2, 12), 0x6b7078), t.x - t.r * 0.9, 0.9, t.z, 0, Math.PI / 2));
    this.solid.push(mergeGeometries(list, false)!);
    this.taken.push([t.x, t.z, t.r + 1.5]);
  }

  /**
   * Мелочь на пустом бетоне: бытовка, бочки, поддоны с грузом, кабельные барабаны. Не ближе 3 м от края
   * дороги, 1 м от площадок, кранов, зданий и каналов, 1,5 м от воды.
   */
  private buildClutter(): void {
    const { yards, cranes, sheds } = this.ring.deco;
    const rng = makeRng(57);
    const free = (x: number, z: number, r: number): boolean => {
      const e = r + 1.5;
      if (![[-e, -e], [e, -e], [e, e], [-e, e]].every(([dx, dz]) => this.onLand(x + dx, z + dz))) return false;
      if (!this.clearOfRoad(x, z, 3 + r)) return false;
      if (yards.some((y) => x > y.x0 - r - 1 && x < y.x1 + r + 1 && z > y.z0 - r - 1 && z < y.z1 + r + 1)) return false;
      if (sheds.some((y) => x > y.x0 - r - 1 && x < y.x1 + r + 1 && z > y.z0 - r - 1 && z < y.z1 + r + 1)) return false;
      if (cranes.some((c) => Math.abs(x - c.x) < CRANE_HALF_X + r + 1 && Math.abs(z - c.z) < CRANE_HALF_X + r + 1)) return false;
      return this.taken.every(([ox, oz, or]) => Math.hypot(x - ox, z - oz) > r + or + 1.5);
    };
    // точка в осях предмета: lx — поперёк, lz — вдоль (после поворота на ry)
    const at = (x: number, z: number, ry: number, lx: number, lz: number): [number, number] =>
      [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];

    const cabin = (x: number, z: number, ry: number) => {
      this.taken.push([x, z, 3.5]);
      this.box(6, 2.6, 2.5, x, 1.3, z, 0xd9d3c4, ry);
      this.box(6.2, 0.14, 2.7, x, 2.67, z, 0x8a8f96, ry);
      for (const lx of [-1.9, -0.1]) {
        const [wx, wz] = at(x, z, ry, lx, 1.27);
        this.box(1.3, 0.8, 0.05, wx, 1.65, wz, 0x2c3a48, ry);
      }
      const [dx, dz] = at(x, z, ry, 1.9, 1.27);
      this.box(0.9, 2, 0.05, dx, 1, dz, 0x5a6470, ry);
      const [sx, sz] = at(x, z, ry, 1.9, 1.55);
      this.box(1.1, 0.2, 0.5, sx, 0.1, sz, 0x6a6e74, ry);
    };
    const BARRELS = [0x2f6f9f, 0xb8452f, 0x3f7f4a, 0xd0a03a, 0x5a5f66];
    const barrels = (x: number, z: number) => {
      this.taken.push([x, z, 1.4]);
      const n = 3 + Math.floor(rng() * 5);
      const base = BARRELS[Math.floor(rng() * BARRELS.length)];
      const ry = rng() * Math.PI;
      for (let k = 0; k < n; k++) {
        const row = Math.floor(k / 3);
        const [bx, bz] = at(x, z, ry, (k % 3) * 0.72 + (row % 2) * 0.36 - 0.72, row * 0.63 - 0.6);
        const color = rng() < 0.2 ? BARRELS[Math.floor(rng() * BARRELS.length)] : base;
        this.deco.push({ kind: 'barrel', x: bx, z: bz, color });
      }
    };
    const pallets = (x: number, z: number) => {
      this.taken.push([x, z, 1.8]);
      const n = 2 + Math.floor(rng() * 3);
      const ry = Math.floor(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.1;
      for (let k = 0; k < n; k++) {
        const [px, pz] = at(x, z, ry, k * 1.35 - (n - 1) * 0.675, 0);
        let y = 0;
        for (let l = rng() < 0.3 ? 2 : 1; l > 0; l--) {
          this.box(1.2, 0.14, 1, px, y + 0.07, pz, 0x9a7a52, ry);
          const h = 0.5 + rng() * 0.4;
          this.box(1.1, h, 0.92, px, y + 0.14 + h / 2, pz, rng() < 0.5 ? 0xd9d4ca : 0xa8845a, ry + (rng() - 0.5) * 0.08);
          y += 0.14 + h;
        }
      }
    };
    const drum = (x: number, z: number) => {
      const R = 0.6 + rng() * 0.25;
      this.taken.push([x, z, R + 0.3]);
      const ry = rng() * Math.PI;
      for (const side of [-0.45, 0.45]) {
        this.solid.push(place(paint(new THREE.CylinderGeometry(R, R, 0.07, 18), 0x8a6440), x + Math.sin(ry) * side, R, z + Math.cos(ry) * side, ry, Math.PI / 2));
      }
      this.solid.push(place(paint(new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.84, 16), 0x2a2c30), x, R, z, ry, Math.PI / 2));
    };

    const b = this.ring.land.box;
    for (let gx = Math.floor(b.x0 / 7) * 7; gx <= b.x1; gx += 7) {
      for (let gz = Math.floor(b.z0 / 7) * 7; gz <= b.z1; gz += 7) {
        const x = gx + rng() * 4;
        const z = gz + rng() * 4;
        const k = rng();
        if (rng() > 0.16) continue;
        if (k < 0.5) {
          if (free(x, z, 1.4)) barrels(x, z);
        } else if (k < 0.8) {
          if (free(x, z, 1.8)) pallets(x, z);
        } else if (free(x, z, 1)) {
          drum(x, z);
        }
      }
    }
    // бытовки — на пустых углах
    for (const [x, z, ry] of this.ring.deco.cabins) if (free(x, z, 3.5)) cabin(x, z, ry);
  }

  /** Портал над линией старта: жёлтые опоры за отбойниками, балки, кабина, шахматный баннер и вывеска трассы. */
  private buildGantry(): void {
    const tr = this.track;
    const yaw = Math.atan2(-tr.tx[0], -tr.tz[0]);
    const hw = tr.hw[0];
    const span = hw + 2.2;
    const H = 8;
    const yellow = 0xe2b33c;
    const list: THREE.BufferGeometry[] = [];
    // в осях портала: x — вправо по ходу, z — назад
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => {
      list.push(paint(new THREE.BoxGeometry(w, h, d), c).translate(x, y, z));
    };
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) box(0.7, H, 0.7, sx * span, H / 2, sz * 2.6, yellow);
      box(0.9, 0.7, 7, sx * span, 0.35, 0, yellow);
      for (const sz of [-1, 1]) box(0.5, 0.5, 0.9, sx * span, 0.25, sz * 3.1, 0x2a2c30);
      box(0.8, 0.9, 6, sx * span, H + 0.45, 0, yellow);
      // диагональная связь между передней и задней опорой (z ±2,6, y 1…7,4)
      const brace = new THREE.BoxGeometry(0.22, 8.2, 0.22).rotateX(0.68);
      list.push(paint(brace, yellow).translate(sx * span, 4.2, 0));
    }
    for (const sz of [-1, 1]) box(span * 2 + 1.2, 0.9, 0.8, 0, H + 0.45, sz * 2.6, yellow);
    // перекладина, на которой висит баннер
    box(span * 2, 0.3, 0.3, 0, H - 0.3, 0, 0x3a4048);
    box(3.4, 2, 3.2, span - 1.3, H + 1.9, 0, 0xe4ded2);
    box(3.6, 0.2, 3.4, span - 1.3, H + 3, 0, 0x8c3b30);
    const g = mergeGeometries(list, false)!;
    g.rotateY(yaw);
    g.translate(tr.px[0], 0, tr.pz[0]);
    this.solid.push(g);

    const frame = new THREE.Group();
    frame.position.set(tr.px[0], 0, tr.pz[0]);
    frame.rotation.y = yaw;
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2, 1.4),
      new THREE.MeshStandardMaterial({ map: tex.checkerTexture(16, 2), roughness: 0.8, side: THREE.DoubleSide }),
    );
    banner.position.set(0, H - 1.15, 0);
    frame.add(banner);
    // вывеска трассы на задней балке (её видно, когда подъезжаешь к линии) и на передней
    const signTex = tex.signTexture(tr.name.toUpperCase(), '#1f3f66', '#f4efe6', 1024, 128);
    for (const sz of [1, -1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.7 }));
      sign.position.set(0, H + 0.45, sz * 3.02);
      if (sz < 0) sign.rotation.y = Math.PI;
      frame.add(sign);
    }
    this.scene.add(frame);
  }

  /** Фонари вдоль прямых — за отбойником, плафон над краем дороги (с той стороны, где причала нет и стена цела). */
  private buildLamps(): void {
    const tr = this.track;
    const byLeg = new Map<number, number[]>();
    for (let i = 0; i < tr.n; i++) {
      if (tr.leg[i] < 0) continue;
      const list = byLeg.get(tr.leg[i]) ?? [];
      list.push(i);
      byLeg.set(tr.leg[i], list);
    }
    for (const pts of byLeg.values()) {
      const end = Math.max(...pts.map((i) => tr.legAt[i]));
      for (let d = LAMP_FIRST; d <= end - 4; d += LAMP_EVERY) {
        let i = pts[0];
        for (const k of pts) if (Math.abs(tr.legAt[k] - d) < Math.abs(tr.legAt[i] - d)) i = k;
        if (tr.gap[i] || this.ramp(i) || Math.abs(tr.s[i]) < 3) continue;
        const sd = tr.openR[i] ? -1 : 1;
        if (sd < 0 && tr.openL[i]) continue;
        if (!this.walled(i, sd)) continue;
        const [x, , z] = this.edge(i, sd, 1.1, 0);
        if (!this.onLand(x, z)) continue;
        this.lamp(x, z, Math.atan2(this.rx[i] * sd, this.rz[i] * sd));
      }
    }
  }

  /** Фонарь: столб, вынос над дорогой и плафон (днём не светится). yaw — куда смотрит вынос, назад от дороги */
  private lamp(x: number, z: number, yaw: number): void {
    const ax = -Math.sin(yaw) * 0.6;
    const az = -Math.cos(yaw) * 0.6;
    this.solid.push(place(paint(new THREE.CylinderGeometry(0.06, 0.09, 5.2, 8), 0x2f3a3a), x, 2.6, z));
    this.solid.push(place(paint(new THREE.BoxGeometry(0.06, 0.06, 1.2), 0x2f3a3a), x + ax, 5.1, z + az, yaw));
    const hx = x + ax * 2;
    const hz = z + az * 2;
    this.solid.push(place(paint(new THREE.CylinderGeometry(0.08, 0.28, 0.22, 12), 0x2f3a3a), hx, 5.0, hz));
    this.solid.push(place(paint(new THREE.SphereGeometry(0.13, 12, 8), 0xe8e4d6), hx, 4.88, hz));
  }

  /** Щиты с белыми стрелками на красном снаружи поворотов: стрелки показывают, куда поворачивать. */
  private buildChevrons(): void {
    const tr = this.track;
    const n = tr.n;
    const map = tex.chevronSignTexture();
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.6 });
    const geo = new THREE.PlaneGeometry(2.6, 0.65);
    // начало первого поворота — после прямой
    let s0 = 0;
    while (this.corner[s0] !== 0) s0++;
    for (let k = 0; k < n; k++) {
      const i = (s0 + k) % n;
      const sd = this.corner[i];
      if (sd === 0 || this.corner[(i - 1 + n) % n] === sd) continue;
      // поворот — подряд идущие отрезки с той же внешней стороной
      const run: number[] = [];
      for (let m = i; this.corner[m] === sd && run.length < n; m = (m + 1) % n) run.push(m);
      const len = run.reduce((a, m) => a + tr.len[m], 0);
      const cnt = Math.max(1, Math.round(len / CHEVRON_EVERY));
      for (let c = 0; c < cnt; c++) {
        const p = run[Math.floor(((c + 0.5) / cnt) * run.length)];
        if (tr.gap[p] || this.ramp(p) || this.open(p, sd)) continue;
        const [x, , z] = this.edge(p, sd, 1.75, 0);
        if (!this.onLand(x, z)) continue;
        // щит смотрит на дорогу; зритель смотрит наружу — стрелки по ходу вправо или влево от него
        const vx = this.rx[p] * sd;
        const vz = this.rz[p] * sd;
        const right = tr.tx[p] * -vz + tr.tz[p] * vx > 0;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, 1.45, z);
        m.rotation.y = Math.atan2(-vx, -vz);
        if (!right) m.scale.x = -1;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        this.scene.add(m);
        for (const side of [-1, 1]) {
          this.box(0.08, 1.45, 0.08, x - vz * side * 1.0 + vx * 0.06, 0.725, z + vx * side * 1.0 + vz * 0.06, 0x3a3d42);
        }
      }
    }
  }

  /** Щит на двух стойках: центр (x, z), смотрит по (fx, fz), размер w × h, низ на высоте y0 */
  private sign(x: number, z: number, fx: number, fz: number, w: number, h: number, y0: number, map: THREE.Texture): void {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.6 }),
    );
    m.position.set(x, y0 + h / 2, z);
    m.rotation.y = Math.atan2(fx, fz);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.scene.add(m);
    // стойки — вдоль щита (вправо от взгляда: (fz, −fx))
    const rx = fz;
    const rz = -fx;
    for (const side of [-1, 1]) this.box(0.1, y0 + h, 0.1, x + rx * side * (w / 2 - 0.15) - fx * 0.07, (y0 + h) / 2, z + rz * side * (w / 2 - 0.15) - fz * 0.07, 0x3a3d42);
  }

  /** Указатели: «ПРЫЖОК» перед каждым трамплином (слева, лицом к едущим) и «СРЕЗКА» у мыса. */
  private buildSigns(): void {
    const tr = this.track;
    const n = tr.n;
    const jump = jumpSignTexture();
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n;
      if (!(tr.h[i] === 0 && tr.h[(i + 1) % n] > 0) || tr.h[p] > 0) continue;
      // начало подъёма: щиты за 22 и 46 м до него, слева за стеной, лицом навстречу карту
      let k = i;
      let back = 0;
      for (const dist of [22, 46]) {
        while (back < dist) {
          k = (k - 1 + n) % n;
          back += tr.len[k];
        }
        const sd = this.open(k, -1) ? 1 : -1;
        const [x, , z] = this.edge(k, sd, 2.2, 0);
        this.sign(x, z, -tr.tx[k], -tr.tz[k], 1.7, 1.7, 1.2, jump);
      }
    }
    for (const s of this.ring.deco.signs) {
      this.sign(s.x, s.z, Math.sin(s.yaw), Math.cos(s.yaw), s.w, s.w / 3, 1.4, arrowSignTexture(s.text, s.bg, '#ffffff', s.dir));
    }
  }

  /** Лодки у причалов и буи у входа в бассейн (зелёный — справа, если входить с моря). */
  private buildWaterLife(): void {
    for (const d of this.ring.deco.water) this.deco.push(d);
  }

  /** Дальний берег: город на востоке под ярким солнцем, холмы, маяк на волнорезе и сухогруз на западе. Без тумана — дымка «запечена». */
  private buildFarShore(): void {
    const rng = makeRng(99);
    const geos: THREE.BufferGeometry[] = [];
    const haze = new THREE.Color(DAY.horizon);
    const pushBox = (w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color) => {
      geos.push(place(paint(new THREE.BoxGeometry(w, h, d), c), x, y, z));
    };
    for (let i = 0; i < 64; i++) {
      const z = -480 + i * 15 + rng() * 8;
      const h = 12 + rng() * 34 + (Math.abs(z) < 140 ? rng() * 28 : 0);
      const w = 10 + rng() * 14;
      const c = new THREE.Color().setHSL(0.08 + rng() * 0.06, 0.2, 0.62 + rng() * 0.16).lerp(haze, 0.5);
      pushBox(w, h, w, 470 + rng() * 60, WATER_Y + h / 2, z, c);
    }
    // холмы — пологие купола
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Color(0x7fa07e).lerp(haze, 0.5 + rng() * 0.1);
      const r = 110 + rng() * 80;
      const h = 40 + rng() * 45;
      const dome = paint(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, h / r, 1), c);
      geos.push(place(dome, 660 + rng() * 120, WATER_Y - 2, -560 + i * 150));
    }
    pushBox(6, 3, 150, -300, WATER_Y + 1, 40, new THREE.Color(0x8f8a82).lerp(haze, 0.35));
    pushBox(5, 14, 5, -300, WATER_Y + 8, -36, new THREE.Color(0xf4efe6).lerp(haze, 0.25));
    pushBox(5.2, 3, 5.2, -300, WATER_Y + 16, -36, new THREE.Color(0xc0392b).lerp(haze, 0.25));
    const dark = new THREE.Color(0x4a5560).lerp(haze, 0.3);
    pushBox(26, 10, 170, -520, WATER_Y + 4, 180, dark);
    pushBox(22, 14, 18, -520, WATER_Y + 16, 252, new THREE.Color(0xe8e2d8).lerp(haze, 0.4));
    for (let k = 0; k < 9; k++) {
      const c = new THREE.Color(CONTAINER_COLORS[k % 5]).lerp(haze, 0.45);
      pushBox(22, 5 + rng() * 5, 14, -520, WATER_Y + 11, 108 + k * 15, c);
    }
    this.scene.add(staticMesh(mergeGeometries(geos, false)!, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }), false));
  }

  // ------------------------------------------------------------ ящики и банки

  private buildCrates(): void {
    const mat = new THREE.MeshStandardMaterial({ map: tex.itemCrateTexture(), roughness: 0.72, emissive: 0x3a2a10, emissiveIntensity: 0.6 });
    const geo = new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: tex.softDot('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    });
    const shadowGeo = new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2);
    for (const c of this.track.crates) {
      const group = new THREE.Group();
      const box = new THREE.Mesh(geo, mat);
      group.add(box);
      const halo = glowSprite(0xffd27a, 2.2, 0.2);
      group.add(halo);
      group.position.set(c.x, c.y + CRATE_HOVER, c.z);
      this.scene.add(group);
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.position.set(c.x, c.y + MARK_Y + 0.01, c.z);
      shadow.renderOrder = 3;
      this.scene.add(shadow);
      this.crates.push({ group, box, shadow, y: c.y, here: true, pop: 0 });
    }
  }

  /** Ящики на месте: бит i — ящик i (как в снимке гонки). */
  setCrates(mask: number): void {
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i];
      const here = (mask & (1 << i)) !== 0;
      if (here === c.here) continue;
      c.here = here;
      c.group.visible = here;
      c.shadow.visible = here;
      if (here) c.pop = 1;
    }
  }

  /** Банки варенья — как на «Причале», только крупнее: их видно с дороги. Запас на MAX_TRAPS. */
  private buildJars(): void {
    const glass = new THREE.MeshStandardMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.1, depthWrite: false });
    const jam = new THREE.MeshStandardMaterial({ color: 0xb3122e, emissive: 0x5a0616, roughness: 0.35 });
    const cloth = new THREE.MeshStandardMaterial({ map: tex.ginghamTexture(), roughness: 0.9 });
    const string = new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.9 });
    const jamGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.3, 18);
    const glassGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.42, 18, 1, true);
    const lidGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.07, 18);
    const tieGeo = new THREE.TorusGeometry(0.225, 0.012, 5, 18);
    for (let i = 0; i < MAX_TRAPS; i++) {
      const g = new THREE.Group();
      const jamMesh = new THREE.Mesh(jamGeo, jam);
      jamMesh.position.y = 0.17;
      const glassMesh = new THREE.Mesh(glassGeo, glass);
      glassMesh.position.y = 0.21;
      const lid = new THREE.Mesh(lidGeo, cloth);
      lid.position.y = 0.45;
      const tie = new THREE.Mesh(tieGeo, string);
      tie.rotation.x = Math.PI / 2;
      tie.position.y = 0.4;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff6a7a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(1.3);
      halo.position.y = 0.25;
      g.add(jamMesh, glassMesh, lid, tie, halo);
      g.scale.setScalar(JAR_SCALE);
      g.visible = false;
      this.scene.add(g);
      this.jars.push({ group: g, id: -1, y: 0, pop: 0, seen: false });
    }
  }

  /** Банки на дороге по снимку: лежащие остаются на местах, новые «выскакивают», пропавшие убираются. */
  setTraps(list: readonly TrapSnap[], count: number): void {
    for (const j of this.jars) j.seen = false;
    for (let k = 0; k < count; k++) {
      const t = list[k];
      let jar = this.jars.find((j) => j.id === t.id);
      if (!jar) {
        jar = this.jars.find((j) => j.id < 0);
        if (!jar) continue;
        jar.id = t.id;
        jar.pop = 1;
        jar.group.visible = true;
      }
      jar.seen = true;
      jar.y = t.y;
      jar.group.position.x = t.x;
      jar.group.position.z = t.z;
    }
    for (const j of this.jars) {
      if (j.seen || j.id < 0) continue;
      j.id = -1;
      j.group.visible = false;
    }
  }

  // ------------------------------------------------------------ опора и кадр

  /** Полуширина дороги: у края из-под колёс летит пыль (сама полуширина — в TrackLoc.hw) */
  get roadHalf(): number {
    return this.track.half;
  }

  /**
   * Высота опоры под точкой (тень карта): дорога (с трамплином), настил срезки, суша или вода.
   * loc — свой у каждого карта: в нём подсказка отрезка, поиск идёт рядом с ней.
   */
  groundAt(x: number, z: number, loc: TrackLoc): number {
    const tr = this.track;
    locate(tr, x, z, loc.seg, loc);
    if (Math.abs(loc.lat) > loc.hw + 6) locateAny(tr, x, z, loc);
    let g = Math.abs(loc.lat) <= loc.hw + 0.5 && loc.ground !== NO_GROUND ? loc.ground : NO_GROUND;
    if (tr.hz.decks.length > 0) {
      const d = deckAt(tr.hz, x, z);
      if (d > g) g = d;
    }
    if (g !== NO_GROUND) return g;
    return this.onLand(x, z) ? 0 : WATER_Y;
  }

  /** Подвижные помехи — на момент rt (тики гонки, можно дробное): тот же, что у физики своего карта. */
  setHazardTime(rt: number): void {
    this.hazards.setTime(rt);
  }

  /** Карта теней: на всю трассу 4096, на слабом качестве — 2048 (пересчитывается один раз). */
  setQuality(q: LobbyQuality): void {
    const size = q === 'low' ? 2048 : 4096;
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      sh.map?.dispose();
      sh.map = null;
      this.renderer.refreshShadows();
    }
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.skyMat.uniforms.uTime.value = t;
    this.seaMat.uniforms.uTime.value = t;
    updateFloaters(this.floaters, t);
    this.gulls.update(t);
    this.hazards.update(dt);
    this.items.update(dt);
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i];
      if (!c.here) continue;
      // появился: вырастает с перелётом
      c.pop = Math.max(0, c.pop - dt * 3);
      const k = 1 - c.pop;
      const s = c.pop > 0 ? Math.max(0.01, k * (1 + Math.sin(k * Math.PI) * 0.5)) : 1;
      c.group.scale.setScalar(s);
      c.group.position.y = c.y + CRATE_HOVER + Math.sin(t * 2.3 + i * 1.7) * 0.12;
      c.group.rotation.y = t * 1.5 + i * 0.9;
      c.box.rotation.set(Math.sin(t * 1.1 + i) * 0.22, 0, Math.cos(t * 0.9 + i) * 0.22);
    }
    for (let i = 0; i < this.jars.length; i++) {
      const j = this.jars[i];
      if (j.id < 0) continue;
      j.pop = Math.max(0, j.pop - dt * 2.5);
      j.group.scale.setScalar(JAR_SCALE * (1 + Math.sin(j.pop * Math.PI) * 0.35));
      j.group.position.y = j.y + 0.05 + Math.sin(t * 2.2 + i) * 0.05;
      j.group.rotation.y = t * 0.8 + i;
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera, DAY.exposure);
  }
}
