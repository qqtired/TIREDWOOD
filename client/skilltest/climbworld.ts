// «Выше облаков» v3 — «Город вверх»: мир долгой трассы, построенный кодом из физической карты (shared/skillclimb.ts).
// Каждая опора рисуется своим предметом ровно в свой бокс (client/skilltest/climb/kit.ts): верх бокса — то, на чём
// стоят ноги. Подвижное и ловушки анимируются теми же функциями, что считает физика (moverAt, sackAt, cloudState,
// crumbleState, ramState, windState, spinAngle) — что видно, то и держит. Под трассой — море, берег и городок
// (climb/env.ts). Неподвижное склеено по участкам (7 кусков × материалы), подвижное — один меш на предмет.
import * as THREE from 'three';
import type { SkillMap, SkillMover, SkillPad, SkillRect } from '../../shared/skillmap.ts';
import { cloudHeldBy, makeSackPose, moverAt, sackAt, stepHeldBy, stepState } from '../../shared/skillphysics.ts';
import { cloudReform, cloudState, orbitAngle, ramState, spinAngle, windState, type RamPhase } from '../../shared/skilltraps.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { fitShadow } from '../render/kit.ts';
import type { Renderer } from '../render/renderer.ts';
import { fogColor, makeSky, type SkyPalette } from '../render/sky.ts';
import type { Quality } from '../settings.ts';
import { ClimbEnv, GROUND_Y, SEA_Y, type EnvPlan } from './climb/env.ts';
import * as kit from './climb/kit.ts';
import { K, hash, pick, type Box } from './climb/kit.ts';
import { makeClimbMaterials, type ClimbMats } from './climb/mats.ts';
import type { SkillMe } from './cloudworld.ts';
import { Batch, SKY_DAY, puffGeometry, type MatKey } from './look.ts';

/** Яркий день над приморским городком: бирюзовое море, дальний туман — вся трасса видна с вершины. */
export const SKY_CLIMB: SkyPalette = {
  ...SKY_DAY,
  deep: 0x2a8a9c,
  shallow: 0x63c9c2,
  fogNear: 320,
  fogFar: 1700,
};

type Theme = 'port' | 'roofs' | 'wheel' | 'build' | 'wires' | 'sky' | 'clouds';
/** Участки по отрезкам брифа: 0–3 порт, 4–8 крыши, 9–10 колесо и канатка, 11–15 стройка, 16–18 провода, 19–23 шары, 24+ облака */
export function themeOf(sec: number): Theme {
  return sec <= 3 ? 'port' : sec <= 8 ? 'roofs' : sec <= 10 ? 'wheel' : sec <= 15 ? 'build' : sec <= 18 ? 'wires' : sec <= 23 ? 'sky' : 'clouds';
}

/** Один меш на предмет: все ключи материалов — в один (цвет в вершинах). */
class Mono extends Batch {
  override add(_key: MatKey, g: THREE.BufferGeometry, color: number): void {
    super.add('paint', g, color);
  }
}

/** Добавить уже раскрашенную геометрию (облако, оболочка): add() красит в один цвет, возвращаем свой. */
function addColored(b: Batch, key: MatKey, g: THREE.BufferGeometry): void {
  const geo = g.index ? g.toNonIndexed() : g;
  const col = geo.getAttribute('color')?.clone();
  b.add(key, geo, 0xffffff);
  if (col) geo.setAttribute('color', col);
}

const boxOf = (b: { min: number[]; max: number[] }): Box => ({ x0: b.min[0], y0: b.min[1], z0: b.min[2], x1: b.max[0], y1: b.max[1], z1: b.max[2] });

type MovingVisual = { root: THREE.Group; box: number; squash: number; mover: SkillMover };
type CloudVisual = { root: THREE.Group; mat: THREE.MeshStandardMaterial; state: number };
type FlagRec = { cp: number; base: Float32Array; start: number; count: number; nx: number; nz: number };
interface Chunk { b: Batch; tiles: Batch; fronts: Batch; group: THREE.Group }

export interface ClimbTopRow { nick: string; ticks: number }

export class ClimbWorld {
  readonly map: SkillMap;
  readonly collision: CollisionWorld;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.1, 2600);
  loading = false;
  loadError: string | null = null;
  onPuff: ((x: number, y: number, z: number, kind: 'dust' | 'cloud' | 'step') => void) | null = null;

  private readonly renderer: Renderer;
  private readonly sections: ReadonlyArray<{ name: string }>;
  private readonly mats: ClimbMats;
  private readonly monoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
  private readonly sun = new THREE.DirectionalLight(0xfff1d9, 2.6);
  private readonly env: ClimbEnv;
  private readonly chunks = new Map<number, Chunk>();
  private readonly staticBoxes: Box[] = [];
  private coast = 48;
  private readonly jetties: EnvPlan['jetties'] = [];
  private readonly moving: MovingVisual[] = [];
  private readonly springs: Array<{ root: THREE.Group; box: number; squash: number }> = [];
  private readonly clouds: CloudVisual[] = [];
  private readonly steps: THREE.Group[] = [];
  private readonly sacks: THREE.Group[] = [];
  private readonly rams: Array<{ arm: THREE.Group; light: THREE.MeshStandardMaterial; rod: THREE.Mesh }> = [];
  private readonly wheels: Array<{ root: THREE.Group; period: number }> = [];
  private readonly carousels: Array<{ disc: THREE.Group; bar: THREE.Group }> = [];
  private readonly socks: Array<{ root: THREE.Group; zone: number; dx: number; dz: number }> = [];
  private streaks: THREE.InstancedMesh | null = null;
  private readonly streams: Array<{ mesh: THREE.InstancedMesh; y0: number; y1: number; x: number; z: number; r: number }> = [];
  private readonly kites: Array<{ mover: number; ax: number; ay: number; az: number }> = [];
  private kiteLines: THREE.LineSegments | null = null;
  private flagMesh: THREE.Mesh | null = null;
  private readonly flagRecs: FlagRec[] = [];
  private readonly flagTips: Array<[number, number, number]> = [];
  private flagCp = -1;
  private readonly bell = new THREE.Group();
  private readonly labels = new THREE.Group();
  private board: { tex: THREE.CanvasTexture; canvas: HTMLCanvasElement; key: string } | null = null;
  private readonly point = { x: 0, y: 0, z: 0 };
  private readonly sack = makeSackPose();
  private readonly ram = { e: 0, phase: 'rest' as RamPhase, k: 0 };
  private readonly dummy = new THREE.Object3D();
  private readonly chimneys: Array<[number, number, number]> = [];
  private shadowY = -1e9;
  private shadowZ = -1e9;
  private bellPower = 0;
  private bellTime = 0;
  private time = 0;

  constructor(renderer: Renderer, map: SkillMap, sections: ReadonlyArray<{ name: string }>) {
    this.renderer = renderer;
    this.map = map;
    this.collision = new CollisionWorld(map);
    this.sections = sections;
    this.mats = makeClimbMaterials();
    const fog = fogColor(SKY_CLIMB);
    this.scene.background = fog.clone();
    this.scene.fog = new THREE.Fog(fog, SKY_CLIMB.fogNear, SKY_CLIMB.fogFar);
    this.scene.add(new THREE.HemisphereLight(0xe9f4ff, 0xc5aa88, 1.3));
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(makeSky(SKY_CLIMB));
    for (const p of map.pads) this.staticBoxes.push(boxOf(map.boxes[p.box]));
    this.planShore();
    this.buildPads();
    this.buildMovers();
    this.buildTraps();
    this.buildFlags();
    this.buildBell();
    this.buildBoard();
    for (const c of this.chunks.values()) {
      c.b.flush(c.group, this.mats);
      c.tiles.flush(c.group, { ...this.mats, deck: this.mats.tile });
      c.fronts.flush(c.group, { ...this.mats, deck: this.mats.facade });
      this.scene.add(c.group);
    }
    this.env = new ClimbEnv(SKY_CLIMB, this.envPlan());
    this.scene.add(this.env.root, this.labels);
    this.update(0, 0, 0);
  }

  // ---------------------------------------------------------------- план берега

  private padsOf(pred: (p: SkillPad) => boolean): Box[] {
    return this.map.pads.filter(pred).map((p) => boxOf(this.map.boxes[p.box]));
  }

  /** Берег — севернее порта; бетонные пирсы под нижними опорами порта. */
  private planShore(): void {
    const port = this.padsOf((p) => themeOf(p.sec) === 'port');
    const town = this.padsOf((p) => themeOf(p.sec) === 'roofs');
    const portMin = port.length ? Math.min(...port.map((b) => b.z0)) : 45;
    this.coast = Math.max(20, Math.min(portMin - 2, town.length ? Math.max(...town.map((b) => b.z1)) + 6 : 48));
    // пирс — под всем низким в порту (низ ящиков ≈ на причале)
    const low = port.filter((b) => b.y0 < 1.2);
    if (low.length && Math.min(...low.map((b) => b.y0)) > SEA_Y + 0.3) {
      const y = Math.min(...low.map((b) => b.y0));
      const x0 = Math.min(...low.map((b) => b.x0)) - 3, x1 = Math.max(...low.map((b) => b.x1)) + 3;
      const z1 = Math.max(...low.map((b) => b.z1)) + 3;
      this.jetties.push({ x0, z0: this.coast - 1, x1, z1, y: Math.min(0, y) });
    }
  }

  private envPlan(): EnvPlan {
    const xs = this.staticBoxes.map((b) => (b.x0 + b.x1) / 2), zs = this.staticBoxes.map((b) => (b.z0 + b.z1) / 2);
    const avoid: EnvPlan['avoid'] = this.staticBoxes.map((b) => [b.x0 - 4, b.z0 - 4, b.x1 + 4, b.z1 + 4]);
    for (const m of this.map.movers) avoid.push([Math.min(m.x, m.x + m.dx) - m.r - 6, Math.min(m.z, m.z + m.dz) - 6, Math.max(m.x, m.x + m.dx) + m.r + 6, Math.max(m.z, m.z + m.dz) + 6]);
    for (const j of this.jetties) avoid.push([j.x0, j.z0, j.x1, j.z1]);
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0, cz = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
    return { coast: this.coast, avoid, jetties: this.jetties, center: [cx, cz], chimneys: this.chimneys };
  }

  /** Что под точкой: верх ближайшего неподвижного бокса ниже y в пятне (x0..x1, z0..z1), иначе земля, причал или дно. */
  private below(x: Box, skip?: Box): number {
    let top = this.groundAt((x.x0 + x.x1) / 2, (x.z0 + x.z1) / 2);
    for (const o of this.staticBoxes) {
      if (o === skip || o.y1 > x.y0 + 0.01 || o.y1 <= top) continue;
      if (o.x1 <= x.x0 + 0.05 || o.x0 >= x.x1 - 0.05 || o.z1 <= x.z0 + 0.05 || o.z0 >= x.z1 - 0.05) continue;
      top = o.y1;
    }
    return top;
  }

  private groundAt(x: number, z: number): number {
    for (const j of this.jetties) if (x > j.x0 && x < j.x1 && z > j.z0 && z < j.z1) return j.y;
    return z < this.coast ? GROUND_Y : SEA_Y - 4;
  }

  private chunk(sec: number): Chunk {
    const id = Math.floor(sec / 4);
    let c = this.chunks.get(id);
    if (!c) {
      c = { b: new Batch(), tiles: new Batch(), fronts: new Batch(), group: new THREE.Group() };
      this.chunks.set(id, c);
    }
    return c;
  }

  /** Середина участка в плане — «откуда приходит игрок»: инфраструктуру ставим с обратной стороны. */
  private secCenter(sec: number): [number, number] {
    const list = this.padsOf((p) => p.sec === sec);
    if (!list.length) return [0, 0];
    return [list.reduce((s, b) => s + (b.x0 + b.x1) / 2, 0) / list.length, list.reduce((s, b) => s + (b.z0 + b.z1) / 2, 0) / list.length];
  }

  // ---------------------------------------------------------------- опоры трассы

  private buildPads(): void {
    for (const [i, p] of this.map.pads.entries()) {
      const look = p.look as string;
      if (look === 'disc' || look === 'housing' || look === 'tower' || look === 'belfry') {
        if (look === 'housing') this.housing(p);
        continue;
      }
      const x = this.staticBoxes[i];
      if (p.bounce) {
        this.springPad(p, x, look);
        continue;
      }
      this.pad(p, x, look, i);
    }
    // карусели крыш
    for (const c of this.map.carousels ?? []) this.carousel(c);
    this.escapeStringers();
  }

  private pad(p: SkillPad, x: Box, look: string, n: number): void {
    const th = themeOf(p.sec), { b } = this.chunk(p.sec);
    const w = x.x1 - x.x0, d = x.z1 - x.z0, h = x.y1 - x.y0;
    const small = w <= 2.4 && d <= 2.4;
    const gap = x.y0 - this.below(x);
    const legs = (wood = true): void => {
      if (gap < 0.3) return;
      if (gap < 28) kit.legs(b, x, x.y0 - gap, wood ? K.woodDark : K.steel, wood);
      else this.column(b, x, x.y0 - gap);
    };
    if (look === 'cp' || look === 'start' || ((look === 'deck' || look === 'pocket' || look === 'block') && p.cp !== undefined)) {
      this.cpPad(p, x, th, gap, n);
      return;
    }
    switch (look) {
      case 'crate': this.crates(b, x, n); this.stackCrates(b, x, gap, n); return;
      case 'barrel': this.barrels(b, x, n); return;
      case 'container': this.containers(b, x, n); this.stackContainers(b, x, gap, n); return;
      case 'boat': kit.boat(b, w, d, h, n); return;
      case 'gangway': kit.gangway(b, x); legs(); return;
      case 'rung': kit.rung(b, x); return;
      case 'cab': kit.cab(b, x); return;
      case 'jib': kit.jib(b, x); return;
      case 'roof': this.houseStack(x, gap, n, p.sec); return;
      case 'ledge': kit.ledge(b, x); return;
      case 'chimney': kit.chimney(b, x, n); if (gap > 0.3) b.span('brick', 0xb85a42, x.x0 + 0.12, x.y0 - gap, x.z0 + 0.12, x.x1 - 0.12, x.y0 + 0.01, x.z1 - 0.12); return;
      case 'watertower': kit.waterTank(b, x); if (gap > 0.3) kit.legs(b, x, x.y0 - gap, K.woodDark, true); return;
      case 'ladder':
        if (th === 'roofs' && x.y1 - x.y0 < 1) this.fireEscape(b, x);
        else { kit.stair(b, x); legs(); }
        return;
      case 'stair': kit.stair(b, x); legs(); return;
      case 'scaffold': kit.scaffold(b, x, Math.min(gap, 40)); return;
      case 'girder': kit.girder(b, x); return;
      case 'mast': this.mast(b, x); return;
      case 'wire': kit.cables(b, x); return;
      case 'insulator': kit.insulator(b, x); return;
      case 'pole':
        kit.pole(b, x);
        if (th === 'sky' || th === 'clouds') this.hangFromBalloon(b, x, n);
        else if (gap > 0.5) this.pylon(b, x, x.y0 - gap);
        return;
      case 'garland': kit.garland(b, x, n); return;
      case 'cloud': this.cloudPad(b, x, n); return;
      case 'pier':
        if (th === 'sky' || th === 'clouds' || th === 'wires') this.skyDock(b, x, n);
        else if (x.y1 - x.y0 > 3) this.timberTower(b, x);
        else kit.pier(b, x, x.y0 - gap);
        return;
      case 'core': this.core(b, x); return;
      case 'balcony': this.balcony(b, x); return;
      case 'station':
        b.deck(x.x0, x.x1, x.z0, x.z1, x.y1, Math.min(h, 0.6), K.red);
        if (h > 0.6) b.span('metal', K.steelDark, x.x0 + 0.1, x.y0, x.z0 + 0.1, x.x1 - 0.1, x.y1 - 0.6, x.z1 - 0.1);
        if (gap > 0.5) { if (gap < 28) kit.legs(b, x, x.y0 - gap, K.steel, false); else this.column(b, x, x.y0 - gap); }
        return;
      case 'post': b.span('wood', K.woodDark, x.x0, x.y0, x.z0, x.x1, x.y1, x.z1); return;
      default: break;
    }
    // старые и общие виды — по теме участка
    if (look === 'plank') {
      if (th === 'roofs') { this.plankLaundry(b, x, n); return; }
      if (th === 'port') { kit.gangway(b, x); return; }
      if (th === 'build') { kit.scaffold(b, x, Math.min(gap, 40)); return; }
      if (th === 'wires') { kit.cables(b, x); return; }
      if (th === 'sky') { kit.garland(b, x, n); return; }
      if (th === 'clouds') { this.cloudPad(b, x, n); return; }
    }
    if (look === 'block') {
      if (th === 'port') { kit.container(b, x, n); this.stackContainers(b, x, gap, n); return; }
      if (th === 'roofs') { this.houseStack(x, gap, n, p.sec); return; }
    }
    switch (th) {
      case 'port':
        if (small) { kit.crate(b, x, n); this.stackCrates(b, x, gap, n); } else { kit.pier(b, x, x.y0 - gap); }
        return;
      case 'roofs':
        if (h >= 2.5 || gap > 6) this.houseStack(x, gap, n, p.sec);
        else { b.deck(x.x0, x.x1, x.z0, x.z1, x.y1, h, K.terracotta); legs(); }
        return;
      case 'wheel':
        b.deck(x.x0, x.x1, x.z0, x.z1, x.y1, Math.min(h, 0.5), K.red);
        legs(false);
        return;
      case 'build':
        kit.scaffold(b, x, Math.min(gap, 40));
        return;
      case 'wires':
        b.deck(x.x0, x.x1, x.z0, x.z1, x.y1, Math.min(h, 0.5), K.steelDark);
        if (gap > 0.5) this.column(b, x, x.y0 - gap);
        return;
      case 'sky':
        this.skyDock(b, x, n);
        return;
      case 'clouds':
        this.cloudPad(b, x, n);
        return;
    }
  }

  /** Площадка флага: по теме — бетонный причал, крыша, станция, леса, площадка на мачте, причал на шарах, облако. */
  private cpPad(p: SkillPad, x: Box, th: Theme, gap: number, n: number): void {
    const { b } = this.chunk(p.sec);
    const h = x.y1 - x.y0;
    if (th === 'clouds') { this.cloudPad(b, x, n); return; }
    if (th === 'roofs' && (h >= 2.5 || gap > 6)) { this.houseStack(x, gap, n, p.sec); return; }
    if (th === 'port') {
      b.span('plaster', K.concrete, x.x0, x.y0, x.z0, x.x1, x.y1 - 0.06, x.z1);
      b.deck(x.x0, x.x1, x.z0, x.z1, x.y1, 0.3, K.woodDark);
      // кнехты по краю — ниже ног
      for (let s = x.x0 + 1; s < x.x1 - 0.5; s += 3) b.cyl('metal', K.steelDark, s, x.y1 - 0.25, x.z0 - 0.12, 0.13, 0.4, 8);
      if (gap > 0.3) kit.pier(b, { ...x, y1: x.y0 }, x.y0 - gap);
      return;
    }
    if (th === 'sky') { this.skyDock(b, x, n); return; }
    const side = th === 'wheel' ? K.red : th === 'build' ? K.orange : th === 'wires' ? K.steelDark : K.terracotta;
    b.deck(x.x0, x.x1, x.z0, x.z1, x.y1, Math.min(h, 0.5), side);
    if (h > 0.5) b.span('wood', K.woodDark, x.x0 + 0.1, x.y0, x.z0 + 0.1, x.x1 - 0.1, x.y1 - 0.5, x.z1 - 0.1);
    if (gap < 0.3) return;
    if (th === 'wires' || gap >= 28) this.column(b, x, x.y0 - gap);
    else kit.legs(b, x, x.y0 - gap, th === 'build' ? K.steel : K.woodDark, th !== 'build');
  }

  /** Крыша с домом под ней, ниже — стопка домов до опоры («город, сложенный вверх»). */
  private houseStack(x: Box, gap: number, n: number, sec: number): void {
    const { b, tiles, fronts } = this.chunk(sec);
    const body = Math.max(x.y1 - x.y0, Math.min(5.5, x.y1 - x.y0 + gap));
    const top: Box = { ...x, y0: x.y1 - body };
    kit.house(b, tiles, top, n, true, fronts);
    let y = top.y0;
    const bottom = x.y0 - gap;
    let level = 0;
    let inset = 0;
    while (y - bottom > 2.5 && level < 14) {
      const hh = Math.min(y - bottom, 5.2 + hash(n * 7 + level) * 2.6);
      inset = Math.min(0.25 + hash(n + level * 3) * 0.9, Math.min(x.x1 - x.x0, x.z1 - x.z0) / 2 - 1.3);
      const sx = (hash(n * 5 + level) - 0.5) * inset, sz = (hash(n * 9 + level) - 0.5) * inset;
      const m: Box = { x0: x.x0 + inset + sx, x1: x.x1 - inset + sx, z0: x.z0 + inset + sz, z1: x.z1 - inset + sz, y0: y - hh, y1: y - 0.7 };
      kit.house(b, tiles, m, n * 13 + level + 1, false, fronts);
      // черепичный скат по периметру — «крыша» этого дома под следующим
      kit.roofSkirt(b, m.x0 - 0.45, m.z0 - 0.45, m.x1 + 0.45, m.z1 + 0.45, y - 0.7, 0.75, level % 2 ? K.tile : K.terracotta);
      y -= hh;
      level++;
    }
    if (y - bottom > 0.3) kit.legs(b, { ...x, y0: y }, bottom, 0xa65a43, false);
  }

  private stackContainers(b: Batch, x: Box, gap: number, n: number): void {
    let y = x.y0;
    const bottom = x.y0 - gap;
    let k = 1;
    while (y - bottom > 2.2 && k < 12) {
      const hh = Math.min(2.6, y - bottom);
      kit.container(b, { ...x, y0: y - hh, y1: y - 0.02 }, n + k * 3);
      y -= hh;
      k++;
    }
    if (y - bottom > 0.3) kit.legs(b, { ...x, y0: y }, bottom, K.steel, false);
  }

  private stackCrates(b: Batch, x: Box, gap: number, n: number): void {
    if (gap < 0.3) return;
    if (gap < 3.5) {
      let y = x.y0, k = 1;
      while (y - (x.y0 - gap) > 0.2) {
        const hh = Math.min(x.y1 - x.y0, y - (x.y0 - gap));
        kit.crate(b, { ...x, y0: y - hh, y1: y - 0.01 }, n + k);
        y -= hh;
        k++;
      }
      return;
    }
    kit.legs(b, x, x.y0 - gap, K.woodDark, true);
  }

  /** Узкая доска между крышами и бельё на верёвке рядом (сбоку и выше, не над доской). */
  private plankLaundry(b: Batch, x: Box, n: number): void {
    kit.gangway(b, x);
    const along = x.x1 - x.x0 >= x.z1 - x.z0;
    const off = (along ? x.z1 - x.z0 : x.x1 - x.x0) / 2 + 1.1;
    const side = hash(n) < 0.5 ? -1 : 1;
    const y = x.y1 + 2.1;
    const a: [number, number, number] = along ? [x.x0 + 0.3, y, (x.z0 + x.z1) / 2 + side * off] : [(x.x0 + x.x1) / 2 + side * off, y, x.z0 + 0.3];
    const c: [number, number, number] = along ? [x.x1 - 0.3, y, a[2]] : [a[0], y, x.z1 - 0.3];
    kit.rope(b, K.white, a, c, 0.35, 0.02, 6);
    const len = along ? x.x1 - x.x0 : x.z1 - x.z0;
    const cols = [K.white, K.pink, K.red, K.mint, K.cream, K.peach];
    for (let s = 0.7; s < len - 0.6; s += 0.85) {
      const k = s / len, sag = Math.sin(k * Math.PI) * 0.35;
      const hw = 0.28 + hash(n + s) * 0.12, hh = 0.5 + hash(n * 3 + s) * 0.45;
      const px = along ? x.x0 + s : a[0], pz = along ? a[2] : x.z0 + s;
      if (along) b.span('cloth', pick(cols, n + s * 7), px - hw, y - sag - hh, pz - 0.015, px + hw, y - sag - 0.03, pz + 0.015);
      else b.span('cloth', pick(cols, n + s * 7), px - 0.015, y - sag - hh, pz - hw, px + 0.015, y - sag - 0.03, pz + hw);
    }
    // столбики верёвки — ниже доски, к пустоте
    for (const p of [a, c]) b.beam('wood', K.woodDark, [p[0], x.y1 - 2.5, p[2]], [p[0], y + 0.1, p[2]], 0.05, 5);
  }

  /** Штабель контейнеров в боксе: по 2,6 м, разные цвета, верхний — целиком в верх бокса. */
  private containers(b: Batch, x: Box, n: number): void {
    const H = x.y1 - x.y0;
    const k = Math.max(1, Math.floor(H / 2.6 + 0.15));
    const h = Math.min(2.6, H / k);
    for (let i = 0; i < k; i++) kit.container(b, { ...x, y1: x.y1 - h * i - (i > 0 ? 0.02 : 0), y0: x.y1 - h * (i + 1) }, n * 7 + i);
    const rest = H - h * k;
    if (rest > 0.05) {
      // бетонный причал под штабелем с тёмной полосой у воды
      b.span('plaster', K.concrete, x.x0 - 0.15, x.y0, x.z0 - 0.15, x.x1 + 0.15, x.y1 - h * k - 0.02, x.z1 + 0.15);
      b.span('plaster', 0x7d776c, x.x0 - 0.16, x.y0, x.z0 - 0.16, x.x1 + 0.16, Math.min(x.y1 - h * k - 0.05, SEA_Y + 0.45), x.z1 + 0.16);
    }
  }

  private barrels(b: Batch, x: Box, n: number): void {
    const H = x.y1 - x.y0, k = Math.max(1, Math.round(H / 1.3)), h = H / k;
    for (let i = 0; i < k; i++) kit.barrel(b, { ...x, y0: x.y0 + h * i, y1: x.y0 + h * (i + 1) - (i < k - 1 ? 0.01 : 0) }, n * 3 + i);
  }

  /** Площадки пожарной лестницы одного участка — по высоте, соседние связаны двумя стальными косоурами; нижняя — колонной вниз. */
  private escapeStringers(): void {
    const bySec = new Map<number, Box[]>();
    for (const [i, p] of this.map.pads.entries()) if ((p.look as string) === 'ladder' && themeOf(p.sec) === 'roofs' && this.staticBoxes[i].y1 - this.staticBoxes[i].y0 < 1) bySec.set(p.sec, [...(bySec.get(p.sec) ?? []), this.staticBoxes[i]]);
    for (const [sec, list] of bySec) {
      const { b } = this.chunk(sec);
      list.sort((a, c) => a.y1 - c.y1);
      for (let i = 0; i + 1 < list.length; i++) {
        const a = list[i], c = list[i + 1];
        const ac: [number, number, number] = [(a.x0 + a.x1) / 2, a.y1 - 0.2, (a.z0 + a.z1) / 2], cc: [number, number, number] = [(c.x0 + c.x1) / 2, c.y1 - 0.2, (c.z0 + c.z1) / 2];
        for (const o of [-0.35, 0.35]) kit.strut(b, 'metal', K.red, [ac[0] + o, ac[1], ac[2] - o], [cc[0] + o, cc[1], cc[2] - o], 0.045, 4);
        kit.strut(b, 'metal', K.steelDark, [ac[0], ac[1] - 0.1, ac[2]], [cc[0], c.y1 - 1.6, cc[2]], 0.04, 4);
      }
      const low = list[0], gap = low.y0 - this.below(low);
      if (gap > 0.3) { if (gap < 28) kit.legs(b, low, low.y0 - gap, K.steelDark, false); else this.column(b, low, low.y0 - gap); }
    }
  }

  /** Пожарная лестница: стальная площадка-решётка, красная кромка, раскос к стене. */
  private fireEscape(b: Batch, x: Box): void {
    b.span('metal', K.steelDark, x.x0, x.y1 - 0.08, x.z0, x.x1, x.y1, x.z1);
    b.span('metal', K.red, x.x0 - 0.02, x.y1 - 0.2, x.z0 - 0.02, x.x1 + 0.02, x.y1 - 0.08, x.z1 + 0.02);
    for (let u = x.x0 + 0.15; u < x.x1 - 0.1; u += 0.3) b.span('metal', 0x6c737a, u, x.y1 - 0.1, x.z0 + 0.02, u + 0.06, x.y1 - 0.005, x.z1 - 0.02);
    const side = this.wallSide(x);
    if (!side) return;
    const along = side === 'z0' || side === 'z1';
    const wall = side === 'x0' ? x.x0 : side === 'x1' ? x.x1 : side === 'z0' ? x.z0 : x.z1;
    const out = side === 'x0' ? x.x1 : side === 'x1' ? x.x0 : side === 'z0' ? x.z1 : x.z0;
    for (const k of [0.15, 0.85]) {
      const u = along ? x.x0 + (x.x1 - x.x0) * k : x.z0 + (x.z1 - x.z0) * k;
      b.beam('metal', K.steelDark, along ? [u, x.y1 - 1.2, wall] : [wall, x.y1 - 1.2, u], along ? [u, x.y1 - 0.2, out] : [out, x.y1 - 0.2, u], 0.04, 4);
    }
  }

  private crates(b: Batch, x: Box, n: number): void {
    const H = x.y1 - x.y0;
    const k = Math.max(1, Math.round(H / 1.4)), h = H / k;
    for (let i = 0; i < k; i++) kit.crate(b, { ...x, y0: x.y0 + h * i, y1: x.y0 + h * (i + 1) - (i < k - 1 ? 0.015 : 0) }, n * 5 + i);
  }

  /** Высокая деревянная опора-клеть (портовый причал-башня): брёвна по углам, крестовины, настил сверху. */
  private timberTower(b: Batch, x: Box): void {
    b.span('wood', 0x7a5a3d, x.x0 + 0.25, x.y0, x.z0 + 0.25, x.x1 - 0.25, x.y1 - 0.4, x.z1 - 0.25);
    b.deck(x.x0, x.x1, x.z0, x.z1, x.y1, 0.4, K.woodDark);
    kit.legs(b, { ...x, x0: x.x0 + 0.1, x1: x.x1 - 0.1, z0: x.z0 + 0.1, z1: x.z1 - 0.1, y0: x.y1 - 0.4 }, x.y0, 0x6f4f35, true);
  }

  /** Ядро стройки: бетонный каркас — пояса перекрытий, тёмные проёмы. */
  private core(b: Batch, x: Box): void {
    b.span('plaster', K.concrete, x.x0 + 0.05, x.y0, x.z0 + 0.05, x.x1 - 0.05, x.y1 - 0.2, x.z1 - 0.05);
    b.span('plaster', 0xd6d0c4, x.x0, x.y1 - 0.2, x.z0, x.x1, x.y1, x.z1);
    for (let y = x.y0 + 3.4; y < x.y1 - 1; y += 3.4) b.span('plaster', 0xd6d0c4, x.x0 - 0.08, y - 0.3, x.z0 - 0.08, x.x1 + 0.08, y, x.z1 + 0.08);
    for (let y = x.y0 + 0.9; y < x.y1 - 2.5; y += 3.4) {
      for (let u = x.x0 + 1.2; u < x.x1 - 1.4; u += 2.6) for (const z of [x.z0 - 0.02, x.z1 - 0.02]) b.span('glass', 0x3b3f44, u, y, z, u + 1.4, y + 1.9, z + 0.04);
      for (let u = x.z0 + 1.2; u < x.z1 - 1.4; u += 2.6) for (const xx of [x.x0 - 0.02, x.x1 - 0.02]) b.span('glass', 0x3b3f44, xx, y, u, xx + 0.04, y + 1.9, u + 1.4);
    }
  }

  /** С какой стороны стена (соседний бокс вплотную, выше верха): −x, +x, −z, +z или null. */
  private wallSide(x: Box): 'x0' | 'x1' | 'z0' | 'z1' | null {
    for (const o of this.staticBoxes) {
      if (o === x || o.y0 > x.y1 || o.y1 < x.y1 + 0.5) continue;
      const zo = o.z1 > x.z0 + 0.1 && o.z0 < x.z1 - 0.1, xo = o.x1 > x.x0 + 0.1 && o.x0 < x.x1 - 0.1;
      if (zo && Math.abs(o.x1 - x.x0) < 0.35) return 'x0';
      if (zo && Math.abs(o.x0 - x.x1) < 0.35) return 'x1';
      if (xo && Math.abs(o.z1 - x.z0) < 0.35) return 'z0';
      if (xo && Math.abs(o.z0 - x.z1) < 0.35) return 'z1';
    }
    return null;
  }

  /** Балкон: каменная плита с кантом, под ней — консоли к стене. */
  private balcony(b: Batch, x: Box): void {
    b.span('plaster', K.cream, x.x0, x.y1 - 0.18, x.z0, x.x1, x.y1, x.z1);
    b.span('plaster', K.white, x.x0 - 0.04, x.y1 - 0.3, x.z0 - 0.04, x.x1 + 0.04, x.y1 - 0.18, x.z1 + 0.04);
    const side = this.wallSide(x) ?? 'z0';
    const along = side === 'z0' || side === 'z1';
    const len = along ? x.x1 - x.x0 : x.z1 - x.z0;
    const wall = side === 'x0' ? x.x0 : side === 'x1' ? x.x1 : side === 'z0' ? x.z0 : x.z1;
    const out = side === 'x0' ? x.x1 : side === 'x1' ? x.x0 : side === 'z0' ? x.z1 : x.z0;
    for (const k of [0.2, 0.8]) {
      const u = (along ? x.x0 : x.z0) + len * k;
      const a: [number, number, number] = along ? [u, x.y1 - 1.1, wall] : [wall, x.y1 - 1.1, u];
      const c: [number, number, number] = along ? [u, x.y1 - 0.3, out * 0.6 + wall * 0.4] : [out * 0.6 + wall * 0.4, x.y1 - 0.3, u];
      b.beam('metal', K.steelDark, a, c, 0.05, 4);
    }
  }

  /** Тонкая стальная колонна до земли (высокие площадки): ствол, оголовок-консоль под площадкой, хомуты через 15 м. */
  private column(b: Batch, x: Box, bottom: number): void {
    const cx = (x.x0 + x.x1) / 2, cz = (x.z0 + x.z1) / 2, top = x.y0;
    if (top - bottom < 0.4) return;
    const r = Math.min(0.32, Math.min(x.x1 - x.x0, x.z1 - x.z0) * 0.12);
    kit.strut(b, 'metal', K.steelDark, [cx, bottom, cz], [cx, top, cz], r, 8);
    b.cyl('metal', K.steel, cx, bottom + 0.3, cz, r * 2.6, 0.6, 8);
    for (let y = top - 15; y > bottom + 3; y -= 15) b.cyl('metal', K.red, cx, y, cz, r * 1.35, 0.35, 8);
    // консоль: четыре раскоса к углам площадки
    for (const [px, pz] of [[x.x0 + 0.2, x.z0 + 0.2], [x.x1 - 0.2, x.z0 + 0.2], [x.x1 - 0.2, x.z1 - 0.2], [x.x0 + 0.2, x.z1 - 0.2]]) kit.strut(b, 'metal', K.steelDark, [cx, top - 1.6, cz], [px, top - 0.02, pz], 0.06, 4);
  }

  /** Опора в небе висит под шаром: оболочка выше и в сторону, стропа к опоре. */
  private hangFromBalloon(b: Batch, x: Box, n: number): void {
    const cx = (x.x0 + x.x1) / 2, cz = (x.z0 + x.z1) / 2, R = 2.2;
    const ox = cx + (hash(n) - 0.5) * 2, oz = cz + (hash(n + 1) - 0.5) * 2;
    const cy = x.y1 + 6.5 + R * 0.945;
    kit.balloonEnvelope(b, ox, cy, oz, R, n);
    kit.strut(b, 'metal', K.rope, [cx, x.y1, cz], [ox, cy - R * 0.945 - 0.2, oz], 0.03, 3);
    kit.strut(b, 'metal', K.rope, [cx, x.y0, cz], [cx, x.y0 - 1.2, cz], 0.03, 3);
  }

  /** Опора столба проводов: стройная красно-белая решётчатая мачта до земли или крыши дома. Если прямо под столбом
   *  чужой предмет трассы (бак, доска), мачта отходит в сторону на 2–5 м и держит столб кронштейном. */
  private pylon(b: Batch, x: Box, bottom: number): void {
    const cx = (x.x0 + x.x1) / 2, cz = (x.z0 + x.z1) / 2, top = x.y0;
    if (top - bottom < 0.4) return;
    let sx = cx, sz = cz, bot = bottom;
    found: for (const d of [0, 2.2, 3.6, 5]) {
      for (let k = 0; k < (d ? 8 : 1); k++) {
        const px = cx + Math.cos((k * Math.PI) / 4) * d, pz = cz + Math.sin((k * Math.PI) / 4) * d;
        const foot: Box = { x0: px - 0.9, x1: px + 0.9, z0: pz - 0.9, z1: pz + 0.9, y0: top - 0.6, y1: top - 0.6 };
        const bt = this.below(foot);
        const on = this.staticBoxes.findIndex((o) => Math.abs(o.y1 - bt) < 0.01 && o.x1 > foot.x0 && o.x0 < foot.x1 && o.z1 > foot.z0 && o.z0 < foot.z1);
        const look = on < 0 ? 'ground' : (this.map.pads[on].look as string);
        if (look === 'ground' || look === 'roof' || look === 'core') { sx = px; sz = pz; bot = bt; break found; }
      }
    }
    const h = 0.6, mtop = top - (sx === cx && sz === cz ? 0.05 : 0.9);
    kit.lattice(b, sx - h, sz - h, sx + h, sz + h, bot, mtop, K.red, 0.06, mtop - bot > 60 ? 3.2 : 1.8, K.white);
    b.span('metal', K.steelDark, sx - 0.9, bot, sz - 0.9, sx + 0.9, bot + 0.5, sz + 0.9);
    if (sx !== cx || sz !== cz) {
      // кронштейн от мачты к столбу: балка и подкос
      b.beam('metal', K.steelDark, [sx, mtop, sz], [cx, top - 0.05, cz], 0.09, 5);
      b.beam('metal', K.steelDark, [sx, mtop - 2.4, sz], [cx, top - 0.1, cz], 0.05, 4);
    }
  }

  /** Мачта (сплошной бокс): красно-белая решётка вокруг тёмного ствола. */
  private mast(b: Batch, x: Box): void {
    b.span('metal', K.steelDark, x.x0 + 0.12, x.y0, x.z0 + 0.12, x.x1 - 0.12, x.y1 - 0.06, x.z1 - 0.12);
    b.span('metal', K.white, x.x0, x.y1 - 0.08, x.z0, x.x1, x.y1, x.z1);
    kit.lattice(b, x.x0 + 0.04, x.z0 + 0.04, x.x1 - 0.04, x.z1 - 0.04, x.y0, x.y1 - 0.1, K.red, 0.06, 1.6, K.white);
  }

  /** Облако-площадка (не тающее): пухлая подушка с золотистым верхом. */
  private cloudPad(b: Batch, x: Box, n: number): void {
    const w = x.x1 - x.x0, d = x.z1 - x.z0, half = Math.min(w, d) / 2;
    void half;
    const g = kit.cloudGeo(n * 17 + 3, w, d, Math.min(1.6, Math.max(0.8, (x.y1 - x.y0) / 0.7)));
    g.translate((x.x0 + x.x1) / 2, x.y1, (x.z0 + x.z1) / 2);
    addColored(b, 'paint', g);
  }

  /** Площадка в небе (участки шаров): дощатый причал, подвешенный к двум шарам. */
  private skyDock(b: Batch, x: Box, n: number): void {
    const h = x.y1 - x.y0;
    b.deck(x.x0, x.x1, x.z0, x.z1, x.y1, Math.min(0.5, h), K.woodDark);
    if (h > 0.5) b.span('wood', K.woodDark, x.x0 + 0.1, x.y0, x.z0 + 0.1, x.x1 - 0.1, x.y1 - 0.5, x.z1 - 0.1);
    // шары — по бокам площадки, высоко: камера за игроком смотрит вдоль причала, трос не встаёт перед ней
    const along = x.x1 - x.x0 >= x.z1 - x.z0;
    const S = along ? x.z1 - x.z0 : x.x1 - x.x0, cx = (x.x0 + x.x1) / 2, cz = (x.z0 + x.z1) / 2;
    for (const k of [0, 1]) {
      const R = 2.1, sg = k === 0 ? -1 : 1, u = sg * (S / 2 - 0.3), shift = (hash(n + k * 3) - 0.5) * 1.5;
      const ex = along ? cx + shift : cx + u, ez = along ? cz + u : cz + shift;
      const ox = along ? ex : ex + sg * 3.2, oz = along ? ez + sg * 3.2 : ez;
      const cy = x.y1 + 9 + hash(n + k) * 1.5 + R * 0.945;
      kit.balloonEnvelope(b, ox, cy, oz, R, n + k);
      b.beam('metal', K.rope, [ex, x.y1 - 0.05, ez], [ox, cy - R * 0.945 - 0.2, oz], 0.03, 3);
    }
  }

  // ---------------------------------------------------------------- батуты, карусели, корпуса таранов

  private springPad(p: SkillPad, x: Box, look: string): void {
    const w = x.x1 - x.x0, d = x.z1 - x.z0;
    const root = new THREE.Group();
    const m = new Mono();
    const th = themeOf(p.sec);
    if (look === 'dome' || (th === 'sky' && look !== 'awning')) kit.domeTop(m, w, d, p.box);
    else if (look === 'awning' || th === 'roofs') {
      kit.awning(m, w, d, p.box);
      // кронштейны к стене: вниз-назад на 1,5 м
      const gap = x.y0 - this.below(x);
      for (const sx of [-1, 1]) m.beam('metal', K.steelDark, [sx * (w / 2 - 0.1), -0.14, 0], [sx * (w / 2 - 0.1), -Math.min(1.6, Math.max(0.3, gap)), 0], 0.04, 4);
    } else {
      // батут: тугой чёрный круг, красный обод, ножки
      const r = Math.min(w, d) / 2;
      m.cyl('cloth', 0x3d3a38, 0, -0.06, 0, r * 0.82, 0.1, 20);
      const rim = new THREE.TorusGeometry(r * 0.88, 0.12, 6, 24);
      rim.rotateX(Math.PI / 2);
      rim.translate(0, -0.08, 0);
      m.add('paint', rim, K.red);
      m.span('wood', K.woodDark, -w / 2, -0.4, -d / 2, w / 2, -0.18, d / 2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.beam('metal', K.steelDark, [sx * r * 0.7, -0.15, sz * r * 0.7], [sx * r * 0.8, -0.9, sz * r * 0.8], 0.05, 5);
    }
    m.flush(root, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, true);
    root.position.set((x.x0 + x.x1) / 2, x.y1, (x.z0 + x.z1) / 2);
    this.scene.add(root);
    this.springs.push({ root, box: p.box, squash: 0 });
  }

  /** Стена с окном за тараном-ставней: сам корпус (физический бокс) — кусок дома. */
  private housing(p: SkillPad): void {
    const x = boxOf(this.map.boxes[p.box]);
    const { b } = this.chunk(p.sec);
    b.span('plaster', pick(kit.WALLS, p.box), x.x0, x.y0, x.z0, x.x1, x.y1, x.z1);
    b.span('plaster', K.white, x.x0 - 0.05, x.y1 - 0.25, x.z0 - 0.05, x.x1 + 0.05, x.y1, x.z1 + 0.05);
  }

  private carousel(c: NonNullable<SkillMap['carousels']>[number]): void {
    const d = c.disc, disc = new THREE.Group(), bar = new THREE.Group();
    const m = new Mono();
    // диск: сектора красный/белый/оранжевый, медный обод с лампочками
    const k = 12;
    for (let i = 0; i < k; i++) {
      const g = new THREE.CylinderGeometry(d.r, d.r, 0.05, 4, 1, false, (i / k) * Math.PI * 2, (Math.PI * 2) / k);
      g.translate(0, 0.02 - 0.025, 0);
      m.add('paint', g, [K.red, K.white, K.orange][i % 3]);
    }
    const rim = new THREE.TorusGeometry(d.r - 0.05, 0.08, 6, 36);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, -0.06, 0);
    m.add('metal', rim, K.gold);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, s = new THREE.SphereGeometry(0.07, 6, 4);
      s.translate(Math.cos(a) * (d.r - 0.05), 0.0, Math.sin(a) * (d.r - 0.05));
      m.add('paint', s, i % 2 ? 0xfff2c0 : K.red);
    }
    // лошадки на шестах — это столбики-отбойники физики
    for (const bp of c.bumpers) {
      const bx = Math.cos(bp.a0) * bp.r0, bz = Math.sin(bp.a0) * bp.r0;
      m.cyl('metal', K.gold, bx, (bp.y0 + bp.y1) / 2 - d.top, bz, bp.rad * 0.35, bp.y1 - bp.y0, 8);
      const horse = new THREE.BoxGeometry(bp.rad * 2.2, bp.rad * 0.9, bp.rad * 0.7);
      horse.rotateY(-bp.a0 + Math.PI / 2);
      horse.translate(bx, (bp.y0 + bp.y1) / 2 - d.top + 0.1, bz);
      m.add('paint', horse, K.white);
      const head = new THREE.BoxGeometry(bp.rad * 0.6, bp.rad * 1.0, bp.rad * 0.55);
      head.translate(bx + Math.cos(bp.a0 + Math.PI / 2) * bp.rad, (bp.y0 + bp.y1) / 2 - d.top + 0.45, bz + Math.sin(bp.a0 + Math.PI / 2) * bp.rad);
      m.add('paint', head, K.white);
    }
    m.flush(disc, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, false);
    disc.position.set(d.cx, d.top, d.cz);
    this.scene.add(disc);
    // основание диска (неподвижное): барабан под кругом
    const { b } = this.chunk(this.map.pads.find((p) => d.boxes.includes(p.box))?.sec ?? 8);
    b.cyl('plaster', K.cream, d.cx, d.top - 0.45, d.cz, d.r - 0.02, 0.8, 32);
    b.cyl('paint', K.red, d.cx, d.top - 0.82, d.cz, d.r + 0.02, 0.12, 32);
    // перекладина: красно-белый шест
    const bm = new Mono();
    const L = c.bar.len * 2, seg = 10;
    for (let i = 0; i < seg; i++) {
      const g = new THREE.CylinderGeometry(c.bar.r, c.bar.r, L / seg, 10);
      g.rotateZ(Math.PI / 2);
      g.translate(-L / 2 + (L / seg) * (i + 0.5), 0, 0);
      bm.add('paint', g, i % 2 ? K.red : K.white);
    }
    bm.cyl('metal', K.gold, 0, -0.1, 0, c.bar.r * 1.6, 0.3, 10);
    bm.flush(bar, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, false);
    bar.position.set(d.cx, (c.bar.y0 + c.bar.y1) / 2, d.cz);
    this.scene.add(bar);
    this.carousels.push({ disc, bar });
  }

  // ---------------------------------------------------------------- подвижное

  private buildMovers(): void {
    const kiteLines: number[] = [];
    const orbits = new Map<string, SkillMover[]>();
    for (const [i, mv] of this.map.movers.entries()) {
      const look = mv.look as string, th = themeOf(mv.sec);
      const m = new Mono(), root = new THREE.Group();
      const { w, d, h } = mv;
      const [scx, scz] = this.secCenter(mv.sec);
      if (mv.kind === 'orbit' || look === 'gondola') kit.gondolaCar(m, w, d, i);
      else if (look === 'boat') kit.boat(m, w, d, h, i);
      else if (look === 'cablecar') kit.cableCar(m, w, d, 3.9);
      else if (look === 'funicular') kit.funicular(m, w, d);
      else if (look === 'cage') kit.cage(m, w, d);
      else if (look === 'basket') kit.balloonBasket(m, w, d, i, (mv.bodies ?? []).map((v) => ({ min: v.min as [number, number, number], max: v.max as [number, number, number] })));
      else if (look === 'kite') {
        kit.kite(m, w, d, i);
        this.kites.push({ mover: i, ax: mv.x + mv.dx / 2 + 20 * Math.sign(mv.x - scx || 1), ay: SEA_Y, az: mv.z + 60 });
        kiteLines.push(0, 0, 0, 0, 0, 0);
      } else if (look === 'girder') {
        kit.girder(m, { x0: -w / 2, x1: w / 2, y0: -h, y1: 0, z0: -d / 2, z1: d / 2 });
        // стропы к крюку крана
        const along = w >= d, L = (along ? w : d) / 2 - 0.3;
        const ends: Array<[number, number]> = along ? [[-L, 0], [L, 0]] : [[0, -L], [0, L]];
        for (const [ex, ez] of ends) m.beam('metal', 0x3c3f42, [ex, 0, ez], [0, 3.2, 0], 0.03, 3);
        m.cyl('metal', K.orange, 0, 3.35, 0, 0.22, 0.4, 8);
        m.beam('metal', 0x3c3f42, [0, 3.5, 0], [0, 14, 0], 0.035, 3);
      } else if (look === 'shuttle' || (th === 'port' && look === 'cart')) {
        kit.container(m, { x0: -w / 2, x1: w / 2, y0: -h, y1: 0, z0: -d / 2, z1: d / 2 }, i);
        const jibAbove = this.staticBoxes.find((b, k) => (this.map.pads[k].look as string) === 'jib' && b.y0 > mv.y && mv.x > b.x0 - 3 && mv.x < b.x1 + 3 && mv.z > b.z0 - 3 && mv.z < b.z1 + 3);
        const up = jibAbove ? Math.max(3, jibAbove.y0 - 1.6 - mv.y) : 8;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.beam('metal', 0x3c3f42, [sx * (w / 2 - 0.2), 0, sz * (d / 2 - 0.2)], [0, Math.min(2.2, up * 0.4), 0], 0.025, 3);
        m.span('metal', K.orange, -0.5, Math.min(2.2, up * 0.4), -0.3, 0.5, Math.min(2.2, up * 0.4) + 0.35, 0.3);
        m.beam('metal', 0x3c3f42, [0, Math.min(2.2, up * 0.4) + 0.35, 0], [0, up, 0], 0.035, 3);
        m.span('metal', K.steelDark, -0.6, up, -0.5, 0.6, up + 0.5, 0.5);
      } else if (th === 'sky' || look === 'cart' && th !== 'port') {
        kit.balloonBasket(m, w, d, i);
      } else if (th === 'build') kit.cage(m, w, d);
      else if (th === 'clouds') {
        addColored(m, 'paint', kit.cloudGeo(i * 31 + 5, w, d));
      }
      else if (th === 'wheel') kit.cableCar(m, w, d, 3.9);
      else {
        m.deck(-w / 2, w / 2, -d / 2, d / 2, 0, h, K.red);
      }
      if (mv.bodies && look !== 'basket') {
        const col = look === 'cage' ? K.orange : look === 'gondola' || mv.kind === 'orbit' ? K.white : look === 'cablecar' ? K.cream : K.woodDark;
        for (const v of mv.bodies) {
          // борт: панель и поручень сверху, у кабин — окно-просвет
          m.span('paint', col, v.min[0], v.min[1], v.min[2], v.max[0], v.max[1] - 0.08, v.max[2]);
          m.span('metal', look === 'cablecar' ? K.red : K.steelDark, v.min[0] - 0.02, v.max[1] - 0.08, v.min[2] - 0.02, v.max[0] + 0.02, v.max[1], v.max[2] + 0.02);
        }
      }
      m.flush(root, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, true);
      root.name = `climb_mover_${i}`;
      this.scene.add(root);
      this.moving.push({ root, box: mv.box, squash: 0, mover: mv });
      if (mv.kind === 'orbit') {
        const key = `${mv.x}|${mv.y}|${mv.z}|${mv.r}|${mv.period}`;
        orbits.set(key, [...(orbits.get(key) ?? []), mv]);
      } else this.moverRig(mv, look, th, scx, scz);
    }
    for (const list of orbits.values()) this.wheel(list);
    if (kiteLines.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(kiteLines, 3));
      this.kiteLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xf8f4ea, transparent: true, opacity: 0.7 }));
      this.kiteLines.frustumCulled = false;
      this.scene.add(this.kiteLines);
    }
  }

  /** Неподвижная «оснастка» хода: трос канатки, рельсы фуникулёра, мачта подъёмника. */
  private moverRig(mv: SkillMover, look: string, th: Theme, scx: number, scz: number): void {
    const { b } = this.chunk(mv.sec);
    const a: [number, number, number] = [mv.x, mv.y, mv.z], e: [number, number, number] = [mv.x + mv.dx, mv.y + mv.dy, mv.z + mv.dz];
    const len = Math.hypot(mv.dx, mv.dy, mv.dz);
    if (len < 0.5) return;
    const ux = mv.dx / len, uy = mv.dy / len, uz = mv.dz / len;
    if (look === 'cablecar' || (th === 'wheel' && look !== 'gondola')) {
      const hang = 3.9;
      const p0: [number, number, number] = [a[0] - ux * 3, a[1] + hang - uy * 3, a[2] - uz * 3];
      const p1: [number, number, number] = [e[0] + ux * 3, e[1] + hang + uy * 3, e[2] + uz * 3];
      b.beam('metal', 0x2f3235, p0, p1, 0.05, 5);
      for (const p of [p0, p1]) {
        // шкив на портале
        b.cyl('metal', K.red, p[0], p[1] + 0.2, p[2], 0.6, 0.25, 12);
        const bot = this.groundUnder(p[0], p[2], p[1] - 0.5);
        if (p[1] - bot > 1) kit.lattice(b, p[0] - 0.5, p[2] - 0.5, p[0] + 0.5, p[2] + 0.5, bot, p[1] - 0.1, K.steel, 0.06, 2.4, K.red);
      }
      return;
    }
    if (look === 'funicular') {
      for (const s of [-0.7, 0.7]) {
        const ox = -uz * s, oz = ux * s;
        b.beam('metal', K.steelDark, [a[0] + ox, a[1] - 0.6, a[2] + oz], [e[0] + ox, e[1] - 0.6, e[2] + oz], 0.06, 4);
      }
      for (let k = 0; k <= len; k += 1.2) {
        const p: [number, number, number] = [a[0] + ux * k, a[1] + uy * k - 0.7, a[2] + uz * k];
        b.span('wood', K.woodDark, p[0] - 0.9, p[1] - 0.08, p[2] - 0.15, p[0] + 0.9, p[1], p[2] + 0.15);
        if (k % 6 < 1.2) {
          const bot = this.groundUnder(p[0], p[2], p[1] - 0.2);
          if (p[1] - bot > 0.5 && p[1] - bot < 120) b.beam('metal', K.steel, [p[0], bot, p[2]], [p[0], p[1] - 0.1, p[2]], 0.1, 5);
        }
      }
      return;
    }
    if (look === 'cage' || (th === 'build' && mv.dy > 2)) {
      // мачта подъёмника — с дальней от трассы стороны
      const sx = look === 'cage' ? 1 : mv.x - scx, sz = look === 'cage' ? 0 : mv.z - scz;
      const alongX = Math.abs(sx) > Math.abs(sz);
      const ox = alongX ? Math.sign(sx || 1) * (mv.w / 2 + 0.75) : 0, oz = alongX ? 0 : Math.sign(sz || 1) * (mv.d / 2 + 0.75);
      const bot = this.groundUnder(mv.x + ox, mv.z + oz, Math.min(a[1], e[1]) - 1);
      kit.lattice(b, mv.x + ox - 0.6, mv.z + oz - 0.6, mv.x + ox + 0.6, mv.z + oz + 0.6, bot, Math.max(a[1], e[1]) + 4, K.orange, 0.06, 1.5, K.white);
      b.cyl('metal', K.steelDark, mv.x + ox, Math.max(a[1], e[1]) + 4.3, mv.z + oz, 0.5, 0.6, 10);
    }
  }

  /** Точка внутри неподвижной опоры трассы (с запасом 0,1 м). */
  private solidAt(x: number, y: number, z: number): boolean {
    return this.staticBoxes.some((o) => x > o.x0 - 0.1 && x < o.x1 + 0.1 && z > o.z0 - 0.1 && z < o.z1 + 0.1 && y > o.y0 - 0.1 && y < o.y1 + 0.1);
  }

  private groundUnder(x: number, z: number, y: number): number {
    return this.below({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: y, y1: y });
  }

  /** Колесо обозрения: обода по обе стороны люлек, спицы к точкам подвеса, ступица, А-образные опоры. */
  private wheel(list: SkillMover[]): void {
    const mv = list[0], hang = 3.9, r = mv.r, half = Math.max(...list.map((m) => m.d)) / 2 + 0.45;
    const root = new THREE.Group(), b = new Mono();
    for (const s of [-half, half]) {
      const rim = new THREE.TorusGeometry(r, 0.13, 6, 64);
      rim.translate(0, 0, s);
      b.add('metal', rim, K.white);
      const inner = new THREE.TorusGeometry(r * 0.62, 0.08, 6, 48);
      inner.translate(0, 0, s);
      b.add('metal', inner, K.red);
    }
    for (const g of list) {
      const al = (Math.PI * 2 * g.phase) / g.period;
      const px = r * Math.sin(al), py = -r * Math.cos(al);
      for (const s of [-half, half]) b.beam('metal', K.white, [0, 0, s], [px, py, s], 0.07, 4);
      b.beam('metal', K.steelDark, [px, py, -half], [px, py, half], 0.07, 5);
      // лампочки по ободу
      for (let k = 0; k < 3; k++) {
        const a2 = al + ((k + 1) / 4) * ((Math.PI * 2) / list.length);
        const s = new THREE.SphereGeometry(0.12, 6, 4);
        s.translate(r * Math.sin(a2), -r * Math.cos(a2), half + 0.05);
        b.add('paint', s, 0xfff0b8);
      }
    }
    b.cyl('metal', K.red, 0, 0, 0, 0.7, half * 2 + 0.4, 16);
    const hub = new THREE.CylinderGeometry(0.7, 0.7, half * 2 + 0.4, 16);
    hub.rotateX(Math.PI / 2);
    b.add('metal', hub, K.red);
    b.flush(root, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, true);
    root.position.set(mv.x, mv.y + hang, mv.z);
    this.scene.add(root);
    this.wheels.push({ root, period: mv.period });
    // опоры: А-рама с каждой стороны до земли
    const { b: sb } = this.chunk(mv.sec);
    const bot = this.groundUnder(mv.x, mv.z, mv.y - r - 1);
    for (const s of [-half - 0.6, half + 0.6]) {
      for (const sx of [-1, 1]) sb.beam('metal', K.white, [mv.x, mv.y + hang, mv.z + s], [mv.x + sx * (r * 0.75), bot, mv.z + s * 1.4], 0.22, 6);
      sb.beam('metal', K.white, [mv.x - r * 0.4, mv.y + hang - (mv.y + hang - bot) * 0.55, mv.z + s * 1.2], [mv.x + r * 0.4, mv.y + hang - (mv.y + hang - bot) * 0.55, mv.z + s * 1.2], 0.12, 5);
    }
    sb.beam('metal', K.red, [mv.x, mv.y + hang, mv.z - half - 0.8], [mv.x, mv.y + hang, mv.z + half + 0.8], 0.3, 10);
  }

  // ---------------------------------------------------------------- ловушки

  private buildTraps(): void {
    const map = this.map;
    // тающие облака
    for (const [i, c] of map.clouds.entries()) {
      const r = c.rect, w = r.x1 - r.x0, d = r.z1 - r.z0;
      const g = kit.cloudGeo(i * 13 + 101, w, d);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, transparent: true });
      const root = new THREE.Group();
      root.add(new THREE.Mesh(g, mat));
      root.position.set((r.x0 + r.x1) / 2, r.y, (r.z0 + r.z1) / 2);
      this.scene.add(root);
      this.clouds.push({ root, mat, state: 0 });
    }
    // осыпающиеся ступени: на стройке — доски лесов, в облаках — облачка
    for (const [i, st] of map.steps.entries()) {
      const r = st.rect, w = r.x1 - r.x0, d = r.z1 - r.z0;
      const root = new THREE.Group(), m = new Mono();
      const high = r.y > 260;
      if (high || (st.look as string | undefined) === 'cloud') {
        addColored(m, 'paint', kit.cloudGeo(i * 7 + 55, w, d, 0.6));
      } else kit.scaffold(m, { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2, y0: -0.45, y1: 0 }, 0);
      m.flush(root, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, true);
      root.position.set((r.x0 + r.x1) / 2, r.y, (r.z0 + r.z1) / 2);
      this.scene.add(root);
      this.steps.push(root);
    }
    // маятники: в порту — сетка с рыбой на портальной раме, у шаров — мешок с песком под шаром
    for (const k of map.sacks) {
      const th = themeOf(k.sec), root = new THREE.Group(), m = new Mono();
      m.beam('metal', th === 'port' ? 0x6b5a3a : K.rope, [0, 0, 0], [0, -k.len + k.r * 1.1, 0], 0.04, 4);
      const bag = new Mono();
      if (k.sec === 3) {
        // крюк портового крана: оранжевая обойма и крюк
        bag.span('paint', K.orange, -k.r * 0.7, -k.r * 0.2, -k.r * 0.45, k.r * 0.7, k.r * 0.9, k.r * 0.45);
        bag.cyl('metal', K.steelDark, 0, k.r * 0.35, -k.r * 0.5, k.r * 0.45, 0.12, 12);
        const hook = new THREE.TorusGeometry(k.r * 0.45, k.r * 0.13, 6, 14, Math.PI * 1.4);
        hook.rotateZ(Math.PI * 0.8);
        hook.translate(0, -k.r * 0.55, 0);
        bag.add('metal', hook, K.steelDark);
      } else if (th === 'port') kit.netBag(bag, k.r);
      else kit.sandBag(bag, k.r);
      m.flush(root, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, false);
      const bagRoot = new THREE.Group();
      bag.flush(bagRoot, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, true);
      bagRoot.position.y = -k.len;
      root.add(bagRoot);
      root.position.set(k.px, k.py, k.pz);
      this.scene.add(root);
      this.sacks.push(root);
      const { b } = this.chunk(k.sec);
      const across = k.axis === 'x' ? [0, 1] : [1, 0];
      if (th === 'sky') {
        kit.balloonEnvelope(b, k.px, k.py + 0.4 + 2.4 * 0.945, k.pz, 2.4, k.sec + Math.round(k.px));
      } else {
        for (const s of [-1, 1]) b.beam('wood', K.woodDark, [k.px + across[0] * 1.7 * s, k.py - k.len - 1.2, k.pz + across[1] * 1.7 * s], [k.px + across[0] * 1.7 * s, k.py + 0.15, k.pz + across[1] * 1.7 * s], 0.1, 6);
        b.beam('wood', K.woodDark, [k.px - across[0] * 1.9, k.py, k.pz - across[1] * 1.9], [k.px + across[0] * 1.9, k.py, k.pz + across[1] * 1.9], 0.13, 6);
        b.cyl('metal', K.steelDark, k.px, k.py - 0.05, k.pz, 0.12, 0.25, 8);
      }
    }
    // тараны: ставни из стены (на крышах) или поршни
    for (const r of map.rams) {
      const th = themeOf(r.sec), h = r.y1 - r.y0;
      const root = new THREE.Group();
      root.position.set(r.fx, (r.y0 + r.y1) / 2, r.fz);
      root.rotation.y = Math.atan2(r.dx, r.dz);
      const frame = new Mono();
      // окно в стене: наличник и тёмный проём, над ним — красная лампа-предупреждение
      frame.span('plaster', K.white, -r.w / 2 - 0.2, -h / 2 - 0.2, -0.14, r.w / 2 + 0.2, h / 2 + 0.2, -0.02);
      frame.span('glass', 0x2d3236, -r.w / 2, -h / 2, -0.12, r.w / 2, h / 2, -0.01);
      frame.span('plaster', K.white, -r.w / 2 - 0.3, -h / 2 - 0.32, -0.1, r.w / 2 + 0.3, -h / 2 - 0.2, 0.12);
      frame.flush(root, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, false);
      const light = new THREE.MeshStandardMaterial({ color: K.red, emissive: K.red, emissiveIntensity: 0.1, roughness: 0.5 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 6), light);
      lamp.position.set(0, h / 2 + 0.38, 0.02);
      root.add(lamp);
      const arm = new THREE.Group(), panel = new Mono();
      const slats = Math.max(3, Math.round(h / 0.22));
      const col = th === 'roofs' ? K.shutterGreen : K.red;
      for (let i = 0; i < slats; i++) panel.span('wood', i % 2 ? col : new THREE.Color(col).multiplyScalar(0.85).getHex(), -r.w / 2, -h / 2 + (h / slats) * i + 0.01, -0.09, r.w / 2, -h / 2 + (h / slats) * (i + 1) - 0.01, 0.09);
      // красно-белая кромка удара
      const st = 6;
      for (let i = 0; i < st; i++) panel.span('paint', i % 2 ? K.red : K.white, -r.w / 2 + (r.w / st) * i, -h / 2, 0.09, -r.w / 2 + (r.w / st) * (i + 1), h / 2, 0.12);
      panel.flush(arm, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, true);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 8), new THREE.MeshStandardMaterial({ color: K.steelDark, metalness: 0.6, roughness: 0.35 }));
      rod.rotation.x = Math.PI / 2;
      root.add(arm, rod);
      this.scene.add(root);
      this.rams.push({ arm, light, rod });
    }
    // ветер: колдуны (полосатые конусы) на краю зоны и полосы-потоки в порыв
    const streakCount = map.winds.length * 18;
    if (streakCount) {
      const g = new THREE.BoxGeometry(0.04, 0.04, 2.2);
      this.streaks = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), streakCount);
      this.streaks.frustumCulled = false;
      this.scene.add(this.streaks);
    }
    for (const [zi, w] of map.winds.entries()) {
      const inside = this.map.pads.filter((p) => {
        const b = this.staticBoxes[this.map.pads.indexOf(p)];
        return b.y1 >= w.y0 && b.y1 <= w.y1 && b.x1 > w.x0 && b.x0 < w.x1 && b.z1 > w.z0 && b.z0 < w.z1 && (b.x1 - b.x0) * (b.z1 - b.z0) > 1.2;
      }).map((p) => this.staticBoxes[this.map.pads.indexOf(p)]);
      // на две площадки ближе к наветренной стороне — по колдуну
      inside.sort((a, b) => ((a.x0 + a.x1) * w.dx + (a.z0 + a.z1) * w.dz) - ((b.x0 + b.x1) * w.dx + (b.z0 + b.z1) * w.dz));
      for (const b of inside.slice(0, 2)) {
        const px = w.dx > 0 ? b.x0 + 0.08 : w.dx < 0 ? b.x1 - 0.08 : b.x1 - 0.08, pz = w.dz > 0 ? b.z0 + 0.08 : w.dz < 0 ? b.z1 - 0.08 : b.z1 - 0.08;
        this.windsock(px, b.y1, pz, zi, w.dx, w.dz, b);
      }
    }
    // укрытия: щит на стойках (провода и ниже) или облачная стенка (облака)
    for (const s of map.shelters) {
      if (this.map.pads.some((p, i) => (p.look as string) === 'mast' && this.staticBoxes[i].x0 < s.x1 + 0.6 && this.staticBoxes[i].x1 > s.x0 - 0.6 && this.staticBoxes[i].z0 < s.z1 + 0.6 && this.staticBoxes[i].z1 > s.z0 - 0.6 && this.staticBoxes[i].y1 > s.y0)) continue;
      const wind = map.winds.find((w) => s.y0 >= w.y0 - 2 && s.y0 <= w.y1 && s.x1 > w.x0 && s.x0 < w.x1 && s.z1 > w.z0 && s.z0 < w.z1) ?? map.winds[0];
      const dx = wind?.dx ?? 1, dz = wind?.dz ?? 0;
      const root = new THREE.Group(), m = new Mono();
      const across = Math.abs(dx) > Math.abs(dz) ? s.z1 - s.z0 : s.x1 - s.x0;
      const sec = this.secOfY(s.y0);
      const h = Math.min(2.8, s.y1 - s.y0);
      if (themeOf(sec) === 'clouds') {
        const g = puffGeometry(across * 0.55, h * 0.6, 0.9, Math.round(s.x0 * 7 + s.z0), 7);
        g.translate(0, h * 0.55, 0);
        addColored(m, 'paint', g);
      } else kit.shield(m, Math.max(1.2, across), h);
      m.flush(root, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, true);
      // щит — с наветренной стороны укрытия
      const cx = (s.x0 + s.x1) / 2 - dx * ((s.x1 - s.x0) / 2 - 0.1) * Math.abs(dx), cz = (s.z0 + s.z1) / 2 - dz * ((s.z1 - s.z0) / 2 - 0.1) * Math.abs(dz);
      root.position.set(Math.abs(dx) > Math.abs(dz) ? s.x0 + (dx > 0 ? 0.1 : s.x1 - s.x0 - 0.1) : cx, s.y0, Math.abs(dx) > Math.abs(dz) ? cz : s.z0 + (dz > 0 ? 0.1 : s.z1 - s.z0 - 0.1));
      root.rotation.y = Math.atan2(dx, dz);
      this.scene.add(root);
    }
    // восходящие потоки: из трубы (крыши) или просто тёплый воздух; дымок над трубой
    for (const u of map.updrafts) {
      const sec = this.secOfY(u.y0), th = themeOf(sec), { b } = this.chunk(sec);
      if (th === 'roofs' || th === 'port') {
        const foot: Box = { x0: u.x - u.r * 0.8, x1: u.x + u.r * 0.8, z0: u.z - u.r * 0.8, z1: u.z + u.r * 0.8, y0: u.y0 - 0.6, y1: u.y0 - 0.6 };
        const bot = this.below(foot);
        if (u.y0 - 0.6 - bot > 0.5) {
          b.cyl('brick', 0xb85a42, u.x, (bot + u.y0 - 0.6) / 2, u.z, u.r * 0.8, u.y0 - 0.6 - bot, 16, u.r * 0.7);
          b.cyl('plaster', K.concrete, u.x, u.y0 - 0.65, u.z, u.r * 0.86, 0.3, 16);
          b.cyl('metal', 0x2a2522, u.x, u.y0 - 0.5, u.z, u.r * 0.66, 0.05, 16);
        }
        this.chimneys.push([u.x, u.y0, u.z]);
      } else {
        // тёплый поток в небе: кольцо красно-белых вымпелов на тросах шара, чтобы было видно, где он
        kit.balloonEnvelope(b, u.x + u.r + 3.5, u.y1 + 4, u.z, 2.6, sec);
      }
      const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.17, 0), new THREE.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.55, depthWrite: false }), 36);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.streams.push({ mesh, y0: u.y0, y1: u.y1, x: u.x, z: u.z, r: u.r });
      // столб тёплого воздуха — еле заметный
      const col = new THREE.Mesh(new THREE.CylinderGeometry(u.r, u.r * 0.85, u.y1 - u.y0, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      col.position.set(u.x, (u.y0 + u.y1) / 2, u.z);
      this.scene.add(col);
    }
  }

  private windsock(x: number, y: number, z: number, zone: number, dx: number, dz: number, _on: Box): void {
    const { b } = this.chunk(this.secOfY(y));
    b.beam('metal', K.steelDark, [x, y - 0.3, z], [x, y + 2.6, z], 0.04, 5);
    const root = new THREE.Group(), m = new Mono();
    // конус вдоль +z: 5 полос красный/белый
    for (let i = 0; i < 5; i++) {
      const g = new THREE.CylinderGeometry(0.3 - i * 0.04, 0.3 - (i + 1) * 0.04, 0.32, 10, 1, true);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, 0.16 + i * 0.32);
      m.add('cloth', g, i % 2 ? K.white : K.red);
    }
    const ring = new THREE.TorusGeometry(0.3, 0.025, 4, 12);
    m.add('metal', ring, K.steelDark);
    m.flush(root, { paint: this.monoMat } as unknown as Record<MatKey, THREE.Material>, false);
    root.position.set(x, y + 2.5, z);
    this.scene.add(root);
    this.socks.push({ root, zone, dx, dz });
  }

  private secOfY(y: number): number {
    let s = 0;
    for (const [i, c] of this.map.checkpoints.entries()) if (c.y <= y + 0.5) s = i;
    return s;
  }

  // ---------------------------------------------------------------- флаги, колокол, табло

  private buildFlags(): void {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const SX = 8, SY = 4, FW = 1.5, FH = 0.95;
    for (const [i, c] of this.map.checkpoints.entries()) {
      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
      const mx = (c.x0 + c.x1) / 2, mz = (c.z0 + c.z1) / 2;
      // угол площадки «впереди-справа» от точки появления — флаг сразу виден
      let best = -1e9, px = c.x1, pz = c.z1;
      for (const [cx, cz] of [[c.x0 + 0.3, c.z0 + 0.3], [c.x1 - 0.3, c.z0 + 0.3], [c.x0 + 0.3, c.z1 - 0.3], [c.x1 - 0.3, c.z1 - 0.3]]) {
        // полотнище и табличка не должны уходить в стену рядом: такой угол — в последнюю очередь
        const hit = [[1.6, 2.6], [0.9, 1.45], [-0.9, 1.45], [0.8, 3]].some(([k, h]) => this.solidAt(cx + rx * k, c.y + h, cz + rz * k));
        const s = (cx - mx) * (fx + rx * 0.6) + (cz - mz) * (fz + rz * 0.6) - (hit ? 100 : 0);
        if (s > best) { best = s; px = cx; pz = cz; }
      }
      const { b } = this.chunk(c.sec ?? i);
      kit.flagPole(b, px, c.y, pz);
      this.flagTips.push([px + rx * 0.7, c.y + 2.6, pz + rz * 0.7]);
      // полотнище: от древка вправо, плоскость — поперёк взгляда
      const start = pos.length / 3;
      for (let yy = 0; yy <= SY; yy++) for (let xx = 0; xx <= SX; xx++) {
        const u = (xx / SX) * FW, v = 3.05 - (yy / SY) * FH;
        pos.push(px + rx * u, c.y + v, pz + rz * u);
        col.push(1, 1, 1);
      }
      for (let yy = 0; yy < SY; yy++) for (let xx = 0; xx < SX; xx++) {
        const a = start + yy * (SX + 1) + xx, bb = a + 1, cc = a + SX + 1, dd = cc + 1;
        idx.push(a, cc, bb, bb, cc, dd);
      }
      this.flagRecs.push({ cp: i, base: new Float32Array(0), start, count: (SX + 1) * (SY + 1), nx: fx, nz: fz });
      // табличка «Флаг 7 · 63 м» и участок — на древке, лицом к точке появления
      if (i > 0 && i < this.map.checkpoints.length) {
        const name = this.sections[Math.min(i, this.sections.length - 1)]?.name ?? '';
        const tex = signCanvas(`Флаг ${i} · ${Math.round(c.y)} м`, name);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.64), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        sign.position.set(px - fx * 0.08, c.y + 1.45, pz - fz * 0.08);
        sign.rotation.y = c.yaw;
        this.labels.add(sign);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const base = new Float32Array(pos);
    for (const r of this.flagRecs) r.base = base;
    this.flagMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    this.flagMesh.frustumCulled = false;
    this.flagMesh.castShadow = false;
    this.scene.add(this.flagMesh);
  }

  /** Цвета флагов: взятые — зелёные, следующий — красно-белый ярче, остальные — красно-белые. */
  private paintFlags(cp: number): void {
    if (!this.flagMesh || cp === this.flagCp) return;
    this.flagCp = cp;
    const col = this.flagMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    // взятые — зелёные, следующий — красный, дальние — терракота; к свободному краю полотнище чуть светлее
    const red = new THREE.Color(K.red), far = new THREE.Color(0xc96a4a), green = new THREE.Color(0x3fb25a), c = new THREE.Color();
    for (const r of this.flagRecs) {
      const base = r.cp <= cp ? green : r.cp === cp + 1 ? red : far;
      for (let k = 0; k < r.count; k++) {
        const xx = k % 9;
        c.copy(base).lerp(new THREE.Color(0xffffff), (xx / 8) * 0.18);
        col.setXYZ(r.start + k, c.r, c.g, c.b);
      }
    }
    col.needsUpdate = true;
  }

  private buildBell(): void {
    const bl = this.map.bell, x = (bl.x0 + bl.x1) / 2, z = (bl.z0 + bl.z1) / 2;
    const R = Math.max(0.8, (bl.x1 - bl.x0) / 2), H = Math.max(1.6, bl.y1 - bl.y0);
    const pts = [[1, -1], [1.02, -0.94], [0.8, -0.78], [0.62, -0.35], [0.36, -0.05], [0.0, 0]].map(([a, y]) => new THREE.Vector2(a * R, y * H));
    const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshStandardMaterial({ color: 0xd9a53a, metalness: 0.75, roughness: 0.28, side: THREE.DoubleSide }));
    shell.castShadow = true;
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(R * 0.18, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.6, roughness: 0.4 }));
    tongue.position.y = -H * 0.85;
    this.bell.add(shell, tongue);
    this.bell.position.set(x, bl.y1, z);
    this.scene.add(this.bell);
    // звонница: четыре столба по углам галереи, шатёр с флюгером
    const g = this.map.gallery, b = new Batch();
    const top = bl.y1 + 0.5;
    const corners: Array<[number, number]> = [[g.x0 + 0.15, g.z0 + 0.15], [g.x1 - 0.15, g.z0 + 0.15], [g.x1 - 0.15, g.z1 - 0.15], [g.x0 + 0.15, g.z1 - 0.15]];
    for (const [cx, cz] of corners) b.beam('wood', K.white, [cx, g.y, cz], [cx, top, cz], 0.12, 8);
    b.span('wood', K.woodDark, g.x0, top, g.z0, g.x1, top + 0.3, g.z1);
    b.beam('wood', K.woodDark, [x, top, g.z0], [x, top, g.z1], 0.1, 6);
    b.beam('metal', K.steelDark, [x, bl.y1, z], [x, top, z], 0.06, 6);
    const roof = new THREE.ConeGeometry(Math.max(g.x1 - g.x0, g.z1 - g.z0) * 0.78, 2.6, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.translate((g.x0 + g.x1) / 2, top + 0.3 + 1.3, (g.z0 + g.z1) / 2);
    b.add('roof', roof, K.tile);
    b.beam('metal', K.gold, [(g.x0 + g.x1) / 2, top + 2.9, (g.z0 + g.z1) / 2], [(g.x0 + g.x1) / 2, top + 4, (g.z0 + g.z1) / 2], 0.05, 5);
    b.flush(this.scene, this.mats);
    // большой вымпел над звонницей — видно снизу издалека
    const pen = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.MeshStandardMaterial({ color: K.red, side: THREE.DoubleSide, roughness: 0.8 }));
    pen.position.set((g.x0 + g.x1) / 2 + 1.2, top + 3.6, (g.z0 + g.z1) / 2);
    this.scene.add(pen);
  }

  /** Табло лучших 10 у старта: деревянная доска на двух ногах лицом к точке появления. */
  private buildBoard(): void {
    const c = this.map.checkpoints[0];
    if (!c) return;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    const w = c.x1 - c.x0, d = c.z1 - c.z0;
    const halfAlong = Math.abs(fx) * w / 2 + Math.abs(fz) * d / 2, halfSide = Math.abs(rx) * w / 2 + Math.abs(rz) * d / 2;
    const mx = (c.x0 + c.x1) / 2, mz = (c.z0 + c.z1) / 2;
    // впереди-справа от старта, на сваях в воде: трасса уходит влево, справа — открытая вода
    const x = mx + fx * (halfAlong + 1) + rx * (halfSide + 3.4), z = mz + fz * (halfAlong + 1) + rz * (halfSide + 3.4);
    const y = Math.max(c.y, this.groundUnder(x, z, c.y + 0.5));
    const pile = Math.min(0, SEA_Y - 0.6 - y);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 640;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.board = { tex, canvas, key: '' };
    this.drawBoard([]);
    const root = new THREE.Group();
    const b = new Batch();
    // сваи — за щитом, чтобы не закрывали строки
    b.beam('wood', K.woodDark, [-1.3, pile, -0.24], [-1.3, 4.3, -0.24], 0.12, 6);
    b.beam('wood', K.woodDark, [1.3, pile, -0.24], [1.3, 4.3, -0.24], 0.12, 6);
    if (pile < 0) b.span('wood', K.woodDark, -1.6, -0.3, -0.45, 1.6, -0.05, 0.05);
    b.span('wood', K.woodDark, -1.6, 0.85, -0.1, 1.6, 4.45, -0.02);
    b.span('roof', K.tile, -1.8, 4.45, -0.4, 1.8, 4.65, 0.25);
    b.flush(root, this.mats);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.96, 3.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    face.position.set(0, 2.66, 0.0);
    root.add(face);
    root.position.set(x, y, z);
    // лицом к середине стартовой площадки
    root.rotation.y = Math.atan2(mx - x, mz - z);
    this.scene.add(root);
  }

  /** Обновить табло: строки (ник и время в тиках), лучшие сверху. */
  setTop(rows: ReadonlyArray<ClimbTopRow>, myNick = ''): void {
    const key = rows.map((r) => `${r.nick}:${r.ticks}`).join('|') + '#' + myNick;
    if (!this.board || key === this.board.key) return;
    this.board.key = key;
    this.drawBoard(rows, myNick);
  }

  private drawBoard(rows: ReadonlyArray<ClimbTopRow>, myNick = ''): void {
    if (!this.board) return;
    const g = this.board.canvas.getContext('2d')!;
    const W = 512, H = 640;
    g.fillStyle = '#f4ead4';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#c0643f';
    g.fillRect(0, 0, W, 96);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 46px Rubik, sans-serif';
    g.fillText('Лучшие подъёмы', W / 2, 50);
    g.font = '500 30px Rubik, sans-serif';
    if (!rows.length) {
      g.fillStyle = '#7a5a3c';
      g.fillText('Пока никто не звонил', W / 2, 260);
      g.fillText('в колокол — будь первым!', W / 2, 304);
    }
    rows.slice(0, 10).forEach((r, i) => {
      const y = 132 + i * 50;
      const mine = myNick !== '' && r.nick === myNick;
      if (mine) { g.fillStyle = 'rgba(224,170,60,0.35)'; g.fillRect(14, y - 22, W - 28, 44); }
      g.fillStyle = i < 3 ? ['#c99327', '#8d969d', '#b0703c'][i] : '#7a5a3c';
      g.textAlign = 'left';
      g.font = '700 30px Rubik, sans-serif';
      g.fillText(`${i + 1}`, 28, y);
      g.fillStyle = '#3d2a1c';
      g.font = `${mine ? 700 : 500} 30px Rubik, sans-serif`;
      let nick = r.nick;
      while (g.measureText(nick).width > 262 && nick.length > 2) nick = nick.slice(0, -1);
      g.fillText(nick === r.nick ? nick : `${nick}…`, 70, y);
      g.textAlign = 'right';
      g.font = '700 30px Rubik, sans-serif';
      g.fillText(clock(r.ticks), W - 28, y);
    });
    this.board.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- кадр

  update(t: number, cp: number, dt: number, me?: SkillMe): void {
    this.time += dt;
    for (const v of this.moving) {
      const p = moverAt(v.mover, t, this.point);
      v.root.position.set(p.x, p.y, p.z);
      v.squash = Math.max(0, v.squash - dt * 4);
      if (v.mover.bounce) v.root.scale.y = 1 - v.squash * 0.18;
    }
    for (const v of this.springs) {
      v.squash = Math.max(0, v.squash - dt * 4);
      v.root.scale.y = 1 - v.squash * 0.18;
    }
    for (const w of this.wheels) w.root.rotation.z = -orbitAngle(w.period, 0, t);
    for (const [i, root] of this.sacks.entries()) {
      const k = this.map.sacks[i], pose = sackAt(k, t, this.sack);
      if (k.axis === 'x') root.rotation.z = pose.a;
      else root.rotation.x = -pose.a;
    }
    for (const [i, v] of this.rams.entries()) {
      const r = this.map.rams[i], st = ramState(r.phase, t, this.ram);
      v.arm.position.z = st.e * r.stroke;
      v.rod.scale.y = Math.max(0.05, st.e * r.stroke + 0.2);
      v.rod.position.z = (st.e * r.stroke) / 2 - 0.1;
      v.light.emissiveIntensity = st.phase === 'wind' ? 0.8 + Math.sin(t * 0.7) * 0.6 : st.phase === 'strike' ? 1.6 : 0.08;
    }
    for (const [i, v] of this.clouds.entries()) {
      const c = this.map.clouds[i], st = cloudState(c.phase, t);
      const held = me ? cloudHeldBy(c, me.x, me.y, me.z) : false;
      if (st < 0 && v.state >= 0) this.onPuff?.(v.root.position.x, c.rect.y, v.root.position.z, 'cloud');
      v.state = st;
      const reform = cloudReform(c.phase, t);
      v.root.visible = st >= 0 || reform > 0;
      v.mat.opacity = st >= 0 ? (held ? 0.18 : 1) : reform * 0.25;
      v.mat.color.setHex(st > 0 ? 0xf2b8a0 : 0xffffff);
      v.root.position.y = c.rect.y + (st > 0 ? Math.sin(t * 2.8) * 0.035 * st : 0);
      v.root.position.x = (c.rect.x0 + c.rect.x1) / 2 + (st > 0 ? Math.sin(t * 3.7) * 0.03 * st : 0);
    }
    for (const [i, root] of this.steps.entries()) {
      const s = this.map.steps[i], state = stepState(s, t), held = me ? stepHeldBy(s, me.x, me.y, me.z, t) : false;
      if (state < 0 && root.visible) this.onPuff?.(root.position.x, s.rect.y, root.position.z, 'step');
      root.visible = state >= 0 && !held;
      root.position.y = s.rect.y + (state > 0 ? Math.sin(t * 2.7) * 0.03 * state : 0);
      root.rotation.z = state > 0 ? Math.sin(t * 3.1) * 0.02 * state : 0;
    }
    const cs = this.map.carousels ?? [];
    for (const [i, v] of this.carousels.entries()) {
      const c = cs[i];
      v.disc.rotation.y = -(c.disc.dir ?? 1) * spinAngle(c.disc.period, t);
      v.bar.rotation.y = -c.bar.dir * spinAngle(c.bar.period, t);
    }
    this.updateWind(t);
    this.updateStreams(t);
    this.updateKites(t);
    this.paintFlags(cp);
    this.waveFlags();
    this.bellTime += dt;
    this.bellPower = Math.max(0, this.bellPower - dt * 0.25);
    this.bell.rotation.z = Math.sin(this.bellTime * 5) * this.bellPower * 0.24;
    this.env.update(this.time);
    const y = me?.y ?? this.map.checkpoints[cp]?.y ?? 0;
    const zz = me?.z ?? this.map.checkpoints[cp]?.pz ?? 0, xx = me?.x ?? this.map.checkpoints[cp]?.px ?? 0;
    if (Math.abs(y - this.shadowY) > 6 || Math.abs(zz - this.shadowZ) > 10) {
      this.shadowY = y;
      this.shadowZ = zz;
      const center = new THREE.Vector3(xx, y + 6, zz);
      this.sun.position.copy(center).addScaledVector(SKY_CLIMB.sunDir, 200);
      this.sun.target.position.copy(center);
      fitShadow(this.sun, center, new THREE.Box3(new THREE.Vector3(xx - 34, y - 18, zz - 34), new THREE.Vector3(xx + 34, y + 30, zz + 34)));
      this.renderer.refreshShadows();
    }
    for (const label of this.labels.children) label.visible = Math.abs(label.position.y - y) < 22 && Math.hypot(label.position.x - xx, label.position.z - zz) < 60;
  }

  private updateWind(t: number): void {
    const map = this.map;
    for (const s of this.socks) {
      const w = windState(map.winds[s.zone].phase, t);
      const flap = Math.sin(t * (0.25 + w * 0.5) + s.zone) * (0.08 + w * 0.12);
      // тихо — повис, предупреждение — дёргается, порыв — вытянут по ветру
      s.root.rotation.set(-(1 - Math.min(1, w * 1.3)) * 1.25 + flap, Math.atan2(s.dx, s.dz) + flap * 0.6, 0, 'YXZ');
    }
    if (this.streaks) {
      const d = this.dummy;
      let k = 0;
      for (const w of map.winds) {
        const st = windState(w.phase, t);
        for (let i = 0; i < 18; i++, k++) {
          const show = st >= 1 ? 1 : st > 0 ? st * 0.4 : 0;
          const u = ((t * 0.25 + i * 0.37) % 1);
          const x = w.dx > 0 ? w.x0 + u * (w.x1 - w.x0) : w.dx < 0 ? w.x1 - u * (w.x1 - w.x0) : w.x0 + hash(i) * (w.x1 - w.x0);
          const z = w.dz > 0 ? w.z0 + u * (w.z1 - w.z0) : w.dz < 0 ? w.z1 - u * (w.z1 - w.z0) : w.z0 + hash(i) * (w.z1 - w.z0);
          d.position.set(Math.abs(w.dx) > 0.5 ? x : w.x0 + hash(i + 3) * (w.x1 - w.x0), w.y0 + hash(i + 7) * (w.y1 - w.y0), Math.abs(w.dz) > 0.5 ? z : w.z0 + hash(i + 5) * (w.z1 - w.z0));
          d.rotation.set(0, Math.atan2(w.dx, w.dz), 0);
          d.scale.setScalar(show > 0 ? 0.4 + show * 0.8 : 0.0001);
          d.updateMatrix();
          this.streaks.setMatrixAt(k, d.matrix);
        }
      }
      this.streaks.instanceMatrix.needsUpdate = true;
    }
  }

  private updateStreams(t: number): void {
    const d = this.dummy;
    for (const s of this.streams) {
      // пузырьки тёплого воздуха: поднимаются и тают к верху потока
      const H = s.y1 - s.y0;
      for (let i = 0; i < 36; i++) {
        const a = i * 2.4 + t * 0.02;
        const rr = s.r * (0.25 + (i % 5) * 0.15);
        const k = ((t * 0.09 + i * 0.73) % H) / H;
        d.position.set(s.x + Math.sin(a) * rr, s.y0 + k * H, s.z + Math.cos(a) * rr);
        d.rotation.set(0, 0, 0);
        const sc = (1 - k * 0.85) * (0.8 + (i % 3) * 0.25);
        d.scale.set(sc, sc, sc);
        d.updateMatrix();
        s.mesh.setMatrixAt(i, d.matrix);
      }
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateKites(t: number): void {
    if (!this.kiteLines) return;
    const pos = this.kiteLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (const [i, k] of this.kites.entries()) {
      const p = moverAt(this.map.movers[k.mover], t, this.point);
      pos.setXYZ(i * 2, p.x, p.y - 0.12, p.z + (this.map.movers[k.mover].d / 2));
      pos.setXYZ(i * 2 + 1, k.ax, k.ay, k.az);
    }
    pos.needsUpdate = true;
  }

  private waveFlags(): void {
    if (!this.flagMesh) return;
    const p = this.flagMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const tt = this.time;
    for (const r of this.flagRecs) {
      for (let k = 0; k < r.count; k++) {
        const xx = k % 9, i = (r.start + k) * 3, u = xx / 8;
        const wave = Math.sin(u * 5 - tt * 4.5 + r.cp) * 0.09 * u;
        p.setXYZ(r.start + k, r.base[i] + r.nx * wave, r.base[i + 1] - u * u * 0.06, r.base[i + 2] + r.nz * wave);
      }
    }
    p.needsUpdate = true;
  }

  /** Где полотнище флага i (искры на взятии) */
  flagTip(i: number): [number, number, number] {
    return this.flagTips[i] ?? [0, 0, 0];
  }

  ringBell(power = 1): void {
    this.bellPower = Math.max(this.bellPower, power);
    this.bellTime = 0;
  }

  squashAt(box: number): void {
    const v = [...this.moving, ...this.springs].find((s) => s.box === box);
    if (v) v.squash = 1;
  }

  bouncerUnder(x: number, y: number, z: number): number {
    for (const p of [...this.map.pads, ...this.map.movers]) {
      if (!p.bounce) continue;
      const i = p.box, w = this.collision;
      if (Math.abs(y - w.maxY[i]) < 0.5 && x > w.minX[i] - 0.42 && x < w.maxX[i] + 0.42 && z > w.minZ[i] - 0.42 && z < w.maxZ[i] + 0.42) return i;
    }
    return -1;
  }

  setQuality(q: Quality, slow = false): void {
    this.env.setQuality(slow || q === 'low');
    this.renderer.refreshShadows();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera, SKY_CLIMB.exposure);
  }

  rectOf(cp: number): SkillRect {
    return this.map.checkpoints[Math.min(cp, this.map.checkpoints.length - 1)];
  }

  /** Для отчёта: сколько всего в мире */
  stats(): Record<string, number> {
    let tris = 0, meshes = 0;
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      meshes++;
      const g = o.geometry as THREE.BufferGeometry, n = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
      tris += o instanceof THREE.InstancedMesh ? n * o.count : n;
    });
    return { meshes, tris: Math.round(tris), pads: this.map.pads.length, movers: this.map.movers.length };
  }
}

function clock(ticks: number): string {
  const sec = Math.max(0, ticks) / 60;
  return `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`;
}

/** Табличка флага: кремовая доска с тёмным текстом (крупно — номер и высота, ниже — участок). */
function signCanvas(title: string, sub: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8a5a33';
  g.beginPath();
  g.roundRect(0, 0, 512, 192, 22);
  g.fill();
  g.fillStyle = '#f6ecd6';
  g.beginPath();
  g.roundRect(8, 8, 496, 176, 16);
  g.fill();
  g.fillStyle = '#3d2a1c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 60px Rubik, sans-serif';
  g.fillText(title, 256, sub ? 72 : 96, 470);
  if (sub) {
    g.fillStyle = '#a14a2c';
    g.font = '600 38px Rubik, sans-serif';
    g.fillText(sub, 256, 140, 470);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
