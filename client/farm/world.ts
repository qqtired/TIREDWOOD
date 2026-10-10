// Мир фермы: вечерняя палитра набережной (без скачка света при переходе), земля и дорожки, вся неподвижная постройка
// из моделей Blender (склейка по материалу — несколько отрисовок), грядки 20 участков и растения — инстансами,
// жители Семечкин и Дядюшка Гриб. Планировка — shared/farmlayout.ts (docs/farm/level/layout.json).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bedStage } from '../../shared/farm.ts';
import { FARM_BEDS, FARM_PLOTS } from '../../shared/farmdata.ts';
import { FARM_LAYOUT } from '../../shared/farmlayout.ts';
import { buildFarmMap } from '../../shared/farmmap.ts';
import type { FarmPlotView } from '../../shared/farmnet.ts';
import type { FarmSysMsg } from '../../shared/farmsys.ts';
import { makeRng } from '../../shared/math.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { Gulls, fitShadow } from '../render/kit.ts';
import { LOOK2 } from '../render/look.ts';
import { installLookTone, lookTone, paintMaterial, paintable, type PaintOptions } from '../render/lookpaint.ts';
import { LOOK_EVENING, lookSea, lookSky } from '../render/looksky.ts';
import type { Renderer } from '../render/renderer.ts';
import { EVENING, fogColor, makeSea, makeSky, type SkyPalette } from '../render/sky.ts';
import { TOUCH } from '../touch.ts';
import { PartInstances, StaticBatch, loadModel, type FarmModel } from './models.ts';

const L = FARM_LAYOUT;
const SKY: SkyPalette = LOOK2 ? LOOK_EVENING : EVENING;
/** Как на набережной: тёплое низкое солнце, светлое небо */
const SUN = 3.3;
const HEMI: readonly [number, number, number] = [1.45, 0xc6d6ee, 0xa98a6c];
/** Море под обрывом: ферма на холме */
const SEA_DROP = 14;
const CROP_IDS = [
  'radish', 'wheat', 'lettuce', 'onion', 'pumpkin', 'carrot', 'sunflower', 'strawberry', 'giant-mushroom', 'dill', 'chili',
  'crystal', 'microgreens', 'lotus', 'life-tree', 'golden-apple', 'dragon-fruit', 'star-flower', 'mythic-mushroom',
];
const STATIC_MODELS = [
  'bed', 'plot', 'well', 'seed_stall', 'grib_kiosk', 'order_board', 'notice_board', 'cart_town', 'campfire', 'pedestal', 'van',
  'decor', 'trees', 'hive', 'npc-grib', 'npc-semechkin',
];
const ALL_BEDS = FARM_PLOTS * FARM_BEDS;

type V3 = [number, number, number];
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _y = new THREE.Vector3(0, 1, 0);

/** Матрица: точка (x, y, z), поворот вокруг вертикали yaw (как у желейки: вперёд — (−sin, −cos)) */
function at(x: number, y: number, z: number, yaw = 0, scale = 1): THREE.Matrix4 {
  _q.setFromAxisAngle(_y, yaw);
  _s.set(scale, scale, scale);
  return _m.compose(_p.set(x, y, z), _q, _s);
}

/** Точка участка в мире (как plotToWorld): lx, lz — в осях участка, +Z — к калитке */
function plotPoint(plot: number, lx: number, lz: number): [number, number] {
  const p = L.plots[plot];
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}

/** Плоская полоса (дорожка) из точек ломаной */
function strip(points: readonly (readonly [number, number])[], width: number, y: number, color: THREE.Color): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = flat(new THREE.PlaneGeometry(width, len + width * 0.5), color);
    g.applyMatrix4(at((x0 + x1) / 2, y, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0)));
    out.push(g);
  }
  return out;
}

/** Горизонтальная плоскость цвета color с лёгким шумом по вершинам */
function flat(g: THREE.BufferGeometry, color: THREE.Color, noise = 0.05, seed = 1): THREE.BufferGeometry {
  return colored(g.rotateX(-Math.PI / 2), color, noise, seed);
}

/** Цвет в вершины (без развёртки) с лёгким шумом */
function colored(g: THREE.BufferGeometry, color: THREE.Color, noise = 0.05, seed = 1): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  src.deleteAttribute('uv');
  const n = src.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  const rng = makeRng(seed);
  for (let i = 0; i < n; i++) {
    const k = 1 + (rng() - 0.5) * noise;
    c[i * 3] = color.r * k;
    c[i * 3 + 1] = color.g * k;
    c[i * 3 + 2] = color.b * k;
  }
  src.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return src;
}

export class FarmWorld {
  readonly renderer: Renderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 1500);
  readonly collision = new CollisionWorld(buildFarmMap());
  readonly sun = new THREE.DirectionalLight(0xffc48a, SUN);
  readonly hemi = new THREE.HemisphereLight(HEMI[1], HEMI[2], HEMI[0]);
  /** Модели ещё грузятся (экран загрузки ждёт) */
  loading = true;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly seaMat: THREE.ShaderMaterial;
  private readonly gulls: Gulls;
  private readonly mixers: THREE.AnimationMixer[] = [];
  private painted = false;
  private time = 0;
  private models = new Map<string, FarmModel>();
  /** Части грядок: рамка, дёрн, замок, пустая, вскопанная, политая, золотой ободок спелой */
  private beds: Record<'frame' | 'turf' | 'lock' | 'empty' | 'dug' | 'wet' | 'rim', PartInstances> | null = null;
  /** Растения: культура → стадия 0–3 → инстансы (создаются при первом появлении) */
  private readonly crops = new Map<string, PartInstances[]>();
  private readonly cropGroup = new THREE.Group();
  private plots: FarmPlotView[] = [];
  private bedsDirty = true;
  private stagesAt = 0;
  private readonly stageKey: number[] = [];

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.camera.rotation.order = 'YXZ';
    const scene = this.scene;
    const fog = LOOK2 ? new THREE.Color(SKY.horizon) : fogColor(SKY);
    if (LOOK2) {
      installLookTone();
      scene.userData.toneMapping = THREE.CustomToneMapping;
      lookTone(fog, SKY.exposure);
    }
    scene.fog = new THREE.Fog(fog, 120, 900);
    scene.background = fog.clone();

    scene.add(this.hemi);
    const center = new THREE.Vector3(0, 2, 0);
    const toSun = new THREE.Vector3(SKY.sunDir.x, Math.max(SKY.sunDir.y, 0.24), SKY.sunDir.z).normalize();
    this.sun.position.copy(center).addScaledVector(toSun, 160);
    this.sun.target.position.copy(center);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);
    this.sun.updateMatrixWorld();
    this.sun.target.updateMatrixWorld();
    fitShadow(this.sun, center, new THREE.Box3(new THREE.Vector3(-38, -1, -38), new THREE.Vector3(38, 7, 38)));

    const sky = makeSky(SKY);
    const sea = makeSea(SKY);
    sea.position.y -= SEA_DROP;
    this.skyMat = sky.material;
    this.seaMat = sea.material;
    if (LOOK2) { lookSky(this.skyMat); lookSea(this.seaMat); }
    scene.add(sky, sea);
    this.buildGround();
    scene.add(this.cropGroup);
    this.gulls = new Gulls(scene, 0, 60);

    if (LOOK2) {
      const paint: PaintOptions = { grain: !TOUCH, uniforms: { uLookShade: { value: new THREE.Color(0.92, 0.97, 1.18) }, uLookSunInv: { value: 1.6 / (this.sun.intensity * 0.95) } } };
      scene.onBeforeRender = () => {
        if (this.painted) return;
        this.painted = true;
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh || o.userData.noPaint) return;
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (!paintable(m) || m.customProgramCacheKey().startsWith('jelly') || m.transparent || m.userData.farmPainted) continue;
            m.userData.farmPainted = true;
            paintMaterial(m, paint);
          }
        });
      };
    }
    void this.load();
  }

  // ------------------------------------------------------------ земля, дорожки, дальний фон

  private buildGround(): void {
    const grass = new THREE.Color(0x7fae4f);
    const field = new THREE.Color(0x8fb35a);
    const dirt = new THREE.Color(0xc9a77a);
    const stone = new THREE.Color(0xbfb6a6);
    const soil = new THREE.Color(0xa88a62);
    // земля фермы и поля вокруг — до обрыва на юге
    const parts: THREE.BufferGeometry[] = [];
    parts.push(flat(new THREE.PlaneGeometry(80, 80, 20, 20), grass, 0.08, 3));
    const far = flat(new THREE.PlaneGeometry(900, 460, 30, 15), field, 0.12, 4);
    far.translate(0, -0.03, 38 - 230);
    parts.push(far);
    // обрыв к морю
    const cliffColor = new THREE.Color(0xb59a76);
    const cliff = new THREE.PlaneGeometry(900, SEA_DROP + 1, 30, 2);
    cliff.translate(0, -(SEA_DROP + 1) / 2 - 0.03, 38);
    parts.push(colored(cliff, cliffColor, 0.15, 5));
    const ground = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false;
    this.scene.add(ground);

    // дорожки и дворы участков: лентой чуть выше земли (зазор и polygonOffset — без мерцания)
    const ways: THREE.BufferGeometry[] = [];
    const y = 0.015;
    const apron = flat(new THREE.CircleGeometry(L.paths.apron.r, 40), stone, 0.06, 6);
    apron.translate(L.paths.apron.x, y, L.paths.apron.z);
    ways.push(apron);
    const ring = flat(new THREE.RingGeometry(L.paths.ring.in, L.paths.ring.out, 96, 1), dirt, 0.08, 7);
    ring.translate(0, y, 0);
    ways.push(ring);
    for (const r of L.paths.radial) ways.push(...strip([r.from as unknown as [number, number], r.to as unknown as [number, number]], r.width, y, dirt));
    ways.push(...strip(L.paths.road.points as unknown as [number, number][], L.paths.road.width, y, dirt));
    for (const f of L.paths.foot) if ('points' in f) ways.push(...strip(f.points as unknown as [number, number][], f.width, y, dirt));
    for (let i = 0; i < L.plots.length; i++) {
      const p = L.plots[i];
      const yard = flat(new THREE.PlaneGeometry(L.plot.w - 0.3, L.plot.l - 0.3), soil, 0.06, 10 + i);
      yard.applyMatrix4(at(p.x, y + 0.002, p.z, p.yaw));
      ways.push(yard);
      // дорожка от калитки участка к кольцу
      const [gx, gz] = plotPoint(i, 0, L.plot.l / 2);
      const [ox, oz] = plotPoint(i, 0, L.plot.l / 2 + 1.6);
      ways.push(...strip([[gx, gz], [ox, oz]], 1.2, y + 0.001, dirt));
    }
    const path = new THREE.Mesh(mergeGeometries(ways.map((g) => (g.index ? g.toNonIndexed() : g)))!, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    path.receiveShadow = true;
    path.matrixAutoUpdate = false;
    this.scene.add(path);

    // дальние холмы на севере, востоке и западе
    const hills: THREE.BufferGeometry[] = [];
    const rng = makeRng(42);
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * 0.95 + (i / 25) * Math.PI * 1.9 + (rng() - 0.5) * 0.1;
      const d = 170 + rng() * 140;
      const r = 50 + rng() * 60;
      const g = new THREE.IcosahedronGeometry(1, 2);
      g.scale(r, r * (0.25 + rng() * 0.2), r);
      const x = Math.sin(a) * d;
      const z = -Math.cos(a) * d;
      if (z > 10) continue;
      g.translate(x, -r * 0.08, z);
      const c = new THREE.Color().setHSL(0.23 + rng() * 0.06, 0.38, 0.38 + rng() * 0.1);
      const src = g.toNonIndexed();
      const n = src.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
      src.setAttribute('color', new THREE.BufferAttribute(col, 3));
      src.deleteAttribute('uv');
      hills.push(src);
    }
    const hillMesh = new THREE.Mesh(mergeGeometries(hills)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    hillMesh.matrixAutoUpdate = false;
    this.scene.add(hillMesh);
  }

  // ------------------------------------------------------------ модели

  private async load(): Promise<void> {
    const names = [...STATIC_MODELS, ...CROP_IDS.map((c) => `crop_${c}`)];
    const list = await Promise.all(names.map((n) => loadModel(n)));
    for (const m of list) this.models.set(m.name, m);
    this.buildStatic();
    this.buildBeds();
    this.buildNpcs();
    this.loading = false;
    this.painted = false;
    this.bedsDirty = true;
    this.renderer.refreshShadows();
  }

  private node(model: string, node: string) {
    return this.models.get(model)?.nodes.get(node);
  }

  private buildStatic(): void {
    const b = new StaticBatch();
    const put = (model: string, node: string, x: number, y: number, z: number, yaw = 0, scale = 1): void => b.add(this.node(model, node), at(x, y, z, yaw, scale));
    // колодец и корыта
    put('well', 'well', L.well.x, 0, L.well.z);
    for (const t of L.troughs) put('well', 'trough', t.x, 0, t.z, t.id === 'E' || t.id === 'W' ? Math.PI / 2 : 0);
    // лавки, доски, телега, костёр, пьедестал, табличка «Фургон уехал»
    const obj = (id: string) => L.objects.find((o) => o.id === id)!;
    const s = obj('semechkin');
    put('seed_stall', 'seed_stall', s.x, 0, s.z, s.yaw);
    const g = obj('grib');
    put('grib_kiosk', 'grib_kiosk', g.x, 0, g.z, g.yaw);
    const o = obj('orders');
    put('order_board', 'order_board', o.x, 0, o.z, o.yaw);
    const fb = obj('farmBoard');
    put('notice_board', 'notice_board', fb.x, 0, fb.z, fb.yaw);
    const cart = obj('cart');
    put('cart_town', 'cart_town', cart.x, 0, cart.z, cart.yaw);
    const fire = obj('campfire') as (typeof L.objects)[number] & { logs: number[][][] };
    put('campfire', 'campfire', fire.x, 0, fire.z);
    for (const log of fire.logs) {
      const cx = log.reduce((a, p) => a + p[0], 0) / log.length;
      const cz = log.reduce((a, p) => a + p[1], 0) / log.length;
      put('campfire', 'campfire_seat', cx, 0, cz, Math.atan2(cx - fire.x, cz - fire.z));
    }
    const boss = obj('boss');
    put('pedestal', 'boss_plinth', boss.x, 0, boss.z, boss.yaw);
    put('pedestal', 'boss_stump', boss.x, 0.3, boss.z, boss.yaw);
    const van = obj('van') as (typeof L.objects)[number] & { awaySign: { x: number; z: number } };
    put('van', 'van_away_sign', van.awaySign.x, 0, van.awaySign.z, Math.PI / 2);
    for (const id of ['lanternN', 'lanternE', 'lanternS', 'lanternW']) {
      const l = obj(id);
      put('decor', 'lantern_post', l.x, 0, l.z, Math.atan2(l.x, l.z));
    }
    // деревья, уголки (пасека, смотровая, дорога), стога
    const treeNode: Record<string, string> = { apple: 'tree_apple', cypress: 'tree_cypress', linden: 'tree_linden' };
    const rng = makeRng(7);
    for (const t of L.trees) put('trees', treeNode[t.kind] ?? 'tree_apple', t.x, 0, t.z, rng() * Math.PI * 2, 0.9 + rng() * 0.2);
    for (const nook of L.nooks) {
      for (const it of nook.items as readonly { kind: string; x: number; z: number; yaw?: number }[]) {
        if (it.kind === 'hiveDecor') put('hive', 'hive', it.x, 0, it.z, rng() * Math.PI * 2);
        else if (it.kind === 'bench') put('decor', 'bench', it.x, 0, it.z, it.yaw ?? 0);
        else if (it.kind === 'telescope') put('decor', 'telescope', it.x, 0, it.z, Math.PI * 0.75);
        else if (it.kind === 'haystack') put('decor', 'haystack', it.x, 0, it.z, rng() * Math.PI * 2);
        else if (it.kind === 'farmGate' || it.kind === 'vanGate') put('decor', 'gate_big', it.x, 0, it.z, Math.PI / 2);
      }
    }
    // забор по краю (с проёмами под ворота) и белые перила над обрывом на юге
    const B = L.bounds;
    const gaps = [{ x: B.minX, z: -27 }, { x: B.maxX, z: 27 }];
    const seg = 2.4;
    for (let v = B.minX; v < B.maxX - 0.1; v += seg) {
      put('decor', 'fence_segment', v, 0, B.minZ);
      put('decor', 'railing_segment', v, 0, B.maxZ);
    }
    for (const x of [B.minX, B.maxX]) {
      for (let v = B.minZ; v < B.maxZ - 0.1; v += seg) {
        if (gaps.some((gp) => gp.x === x && v + seg > gp.z - 1.9 && v < gp.z + 1.9)) continue;
        put('decor', 'fence_segment', x, 0, v, -Math.PI / 2);
      }
    }
    // участки: плетень, калитка, табличка (вымпел — тоже, цвет хозяина добавит 3D-часть)
    const pl = L.plotLocal;
    for (let i = 0; i < L.plots.length; i++) {
      const p = L.plots[i];
      b.add(this.node('plot', 'plot_fence'), at(p.x, 0, p.z, p.yaw));
      const [gx, gz] = plotPoint(i, pl.gatePosts[0][0] + 0.08, pl.gatePosts[0][1]);
      b.add(this.node('plot', 'plot_gate'), at(gx, 0, gz, p.yaw));
      const [sx, sz] = plotPoint(i, pl.sign.x, pl.sign.z);
      b.add(this.node('plot', 'plot_sign'), at(sx, 0, sz, p.yaw));
    }
    for (const mesh of b.build()) this.scene.add(mesh);
  }

  private buildBeds(): void {
    const mk = (node: string) => {
      const pi = new PartInstances(this.node('bed', node), ALL_BEDS);
      pi.addTo(this.scene);
      return pi;
    };
    this.beds = { frame: mk('bed_frame'), turf: mk('bed_turf'), lock: mk('bed_lock'), empty: mk('bed_empty'), dug: mk('bed_dug'), wet: mk('bed_wet'), rim: mk('bed_ripe_rim') };
  }

  /** Жители: модель со скелетом целиком (по одной), анимация «стоит» */
  private buildNpcs(): void {
    for (const [id, model] of [['semechkin', 'npc-semechkin'], ['grib', 'npc-grib']] as const) {
      const m = this.models.get(model);
      const o = L.objects.find((x) => x.id === id) as { npc?: { x: number; z: number; yaw: number } } | undefined;
      if (!m || !o?.npc) continue;
      const root = m.gltf.scene;
      root.position.set(o.npc.x, 0, o.npc.z);
      root.rotation.y = o.npc.yaw;
      root.traverse((x) => { x.castShadow = (x as THREE.Mesh).isMesh; });
      this.scene.add(root);
      const idle = m.gltf.animations.find((a) => a.name === 'idle') ?? m.gltf.animations[0];
      if (idle) {
        const mixer = new THREE.AnimationMixer(root);
        mixer.clipAction(idle).play();
        this.mixers.push(mixer);
      }
    }
  }

  // ------------------------------------------------------------ грядки и растения

  setPlots(list: readonly FarmPlotView[]): void {
    this.plots = [...list];
    this.bedsDirty = true;
  }

  /** Сообщения частей B1 (shared/farmsys.ts): Фургон приехал, босс проснулся — 3D-часть B3 */
  onSys(_m: FarmSysMsg): void {}

  setPlot(v: FarmPlotView): void {
    this.plots[v.i] = v;
    this.bedsDirty = true;
  }

  private cropParts(crop: string, stage: number): PartInstances | null {
    let list = this.crops.get(crop);
    if (!list) {
      const model = this.models.get(`crop_${crop}`);
      if (!model) return null;
      list = [0, 1, 2, 3].map((s) => {
        const pi = new PartInstances(model.nodes.get(`stage${s}`), ALL_BEDS);
        pi.addTo(this.cropGroup);
        return pi;
      });
      this.crops.set(crop, list);
    }
    return list[stage] ?? null;
  }

  /** Перестроить грядки: при изменении участков и при смене стадии роста (раз в полсекунды) */
  private updateBeds(now: number): void {
    const beds = this.beds;
    if (!beds) return;
    // стадии меняются со временем: пересчёт, только если хоть одна поменялась
    let changed = this.bedsDirty;
    let k = 0;
    for (const v of this.plots) {
      if (!v) continue;
      for (const b of v.beds) {
        const st = b.c ? bedStage({ crop: b.c, plantedAt: b.p, ripeAt: b.r, watered: b.w, helpers: [] }, now) : -1;
        if (this.stageKey[k] !== st) { this.stageKey[k] = st; changed = true; }
        k++;
      }
    }
    if (!changed) return;
    this.bedsDirty = false;
    for (const pi of Object.values(beds)) pi.begin();
    for (const list of this.crops.values()) for (const pi of list) pi.begin();
    const pl = L.plotLocal;
    for (let i = 0; i < L.plots.length; i++) {
      const v = this.plots[i];
      const plot = L.plots[i];
      const open = v && v.pid ? v.beds.length : 0;
      for (let n = 0; n < FARM_BEDS; n++) {
        const local = pl.beds[n];
        const [x, z] = plotPoint(i, local.x, local.z);
        const m = at(x, 0, z, plot.yaw);
        beds.frame.push(m);
        if (n >= open) {
          beds.turf.push(m);
          if (v && v.pid) beds.lock.push(m);
          continue;
        }
        const b = v.beds[n];
        if (!b.c) { beds.empty.push(m); continue; }
        (b.w ? beds.wet : beds.dug).push(m);
        const st = bedStage({ crop: b.c, plantedAt: b.p, ripeAt: b.r, watered: b.w, helpers: [] }, now);
        this.cropParts(b.c, st)?.push(m);
        if (st === 3) beds.rim.push(m);
      }
    }
    for (const pi of Object.values(beds)) pi.end();
    for (const list of this.crops.values()) for (const pi of list) pi.end();
    this.painted = false;
  }

  // ------------------------------------------------------------ кадр

  setQuality(q: 'low' | 'medium' | 'high'): void {
    const size = q === 'low' ? 1024 : 2048;
    const sh = this.sun.shadow;
    if (sh.mapSize.x === size) return;
    sh.mapSize.set(size, size);
    sh.map?.dispose();
    sh.map = null;
    this.renderer.refreshShadows();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** now — серверное время (мс): по нему растения растут */
  update(dt: number, now: number): void {
    this.time += dt;
    const t = this.time;
    this.skyMat.uniforms.uTime.value = t;
    this.seaMat.uniforms.uTime.value = t;
    this.gulls.update(t);
    for (const m of this.mixers) m.update(dt);
    if (this.bedsDirty || t - this.stagesAt > 0.5) {
      this.stagesAt = t;
      this.updateBeds(now);
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera, SKY.exposure);
  }
}

export type { V3 };
