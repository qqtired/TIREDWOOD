// Мир фермы: вечерняя палитра набережной (без скачка света при переходе), земля и дорожки, вся неподвижная постройка
// из моделей Blender (склейка по материалу — несколько отрисовок), грядки 20 участков и растения — инстансами
// (стадии роста, «выпрыгивание» на смене стадии, мягкое свечение спелых яркостью материала, золотые искорки), жители
// и Фургон с Тётей Зиной (3d/npcs.ts, 3d/van.ts), Древо разлома (3d/boss.ts), задний двор участков (3d/yard.ts),
// ходячие питомцы (3d/pets.ts) и частицы (3d/fx.ts). Планировка — shared/farmlayout.ts (docs/farm/level/layout.json).
// Посадка, полив, сбор и помощь видны по изменению участка (setPlot): «пуф» земли, брызги, искорка в Древо.
import * as THREE from 'three';
import { bedStage } from '../../shared/farm.ts';
import { FARM_BEDS, FARM_PLOTS, cropById } from '../../shared/farmdata.ts';
import { FARM_LAYOUT } from '../../shared/farmlayout.ts';
import { bedWorld, buildFarmMap, setFarmToggle } from '../../shared/farmmap.ts';
import type { FarmBedView, FarmEvent, FarmPlotView } from '../../shared/farmnet.ts';
import type { FarmSysMsg } from '../../shared/farmsys.ts';
import { makeRng } from '../../shared/math.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { Gulls, fitShadow } from '../render/kit.ts';
import { LOOK2 } from '../render/look.ts';
import { installLookTone, lookTone, paintMaterial, paintable, type PaintOptions } from '../render/lookpaint.ts';
import { LOOK_EVENING, lookSea, lookSky } from '../render/looksky.ts';
import { LOCAL_WALKER } from '../render/outfitfarm.ts';
import type { Renderer } from '../render/renderer.ts';
import { EVENING, fogColor, makeSea, makeSky, type SkyPalette } from '../render/sky.ts';
import { TOUCH } from '../touch.ts';
import { FarmBoss } from './3d/boss.ts';
import { FarmFx } from './3d/fx.ts';
import { FarmNpcs, type NpcId } from './3d/npcs.ts';
import { WalkPets } from './3d/pets.ts';
import { FarmVan } from './3d/van.ts';
import { FarmYard } from './3d/yard.ts';
import { FarmDecor } from './decor/decor.ts';
import { PartInstances, StaticBatch, loadModel, type FarmModel, type Part } from './models.ts';

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
  'decor', 'trees', 'hive', 'npc-grib', 'npc-semechkin', 'npc-zina', 'boss-tree', 'boss-cone', 'truffle-pig', 'pig-pen', 'compost',
];
const ALL_BEDS = FARM_PLOTS * FARM_BEDS;
/** «Выпрыгивание» растения при посадке и смене стадии: 0 → 1,1 → 1 за 0,3 с */
const POP_S = 0.3;
function popScale(t: number): number {
  if (t >= POP_S) return 1;
  return t < 0.2 ? Math.max(0.01, (t / 0.2) * 1.1) : 1.1 - ((t - 0.2) / 0.1) * 0.1;
}
/** Мягкое свечение спелых: тёплый эмиссив материала, пульс яркостью */
const RIPE_GLOW = new THREE.Color(0x6a4a14);
const RIPE_SPARK_R = 30;

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

export class FarmWorld {
  readonly renderer: Renderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 1500);
  readonly collision = new CollisionWorld(buildFarmMap(['van', 'boss']));
  readonly sun = new THREE.DirectionalLight(0xffc48a, SUN);
  readonly hemi = new THREE.HemisphereLight(HEMI[1], HEMI[2], HEMI[0]);
  /** Модели ещё грузятся (экран загрузки ждёт) */
  loading = true;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly seaMat: THREE.ShaderMaterial;
  private readonly gulls: Gulls;
  private readonly decor: FarmDecor;
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
  /** Когда грядка сменила стадию (для «выпрыгивания»), с */
  private readonly popAt: number[] = [];
  private popping = false;
  /** Материалы спелых растений и ободка: пульсируют яркостью */
  private readonly ripeMats = new Map<THREE.Material, THREE.Material>();
  private rimMat: THREE.MeshBasicMaterial | null = null;
  private readonly ripeSpots: { x: number; z: number }[] = [];
  private ripeSparkT = 0;
  /** Первое состояние Древа — без роликов */
  private bossSeen = false;
  readonly fx: FarmFx;
  private npcs: FarmNpcs | null = null;
  private van: FarmVan | null = null;
  private boss: FarmBoss | null = null;
  private yard: FarmYard | null = null;
  readonly pets: WalkPets;
  /** Сообщения, пришедшие до загрузки моделей */
  private readonly early: FarmSysMsg[] = [];

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    // Фургон и ствол Древа твёрдые только по сообщению сервера (onSys)
    setFarmToggle(this.collision, 'van', false);
    setFarmToggle(this.collision, 'boss', false);
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
    this.decor = new FarmDecor(scene, this.camera);
    scene.add(this.cropGroup);
    this.gulls = new Gulls(scene, 0, 60);
    this.fx = new FarmFx(scene);
    this.pets = new WalkPets(scene, this.fx);
    if (typeof location !== 'undefined' && (import.meta.env?.DEV || location.search.includes('debug'))) (window as unknown as Record<string, unknown>).__farmWorld = this;

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

  // ------------------------------------------------------------ модели

  private async load(): Promise<void> {
    const names = [...STATIC_MODELS, ...CROP_IDS.map((c) => `crop_${c}`)];
    const list = await Promise.all(names.map((n) => loadModel(n)));
    for (const m of list) this.models.set(m.name, m);
    await this.decor.ready;
    this.buildStatic();
    this.buildBeds();
    this.npcs = new FarmNpcs(this.scene, this.models);
    const shadows = () => this.renderer.refreshShadows();
    this.van = new FarmVan(this.scene, this.models, shadows);
    this.boss = new FarmBoss(this.scene, this.models, this.fx, shadows);
    this.yard = new FarmYard(this.scene, this.models, this.fx, shadows);
    this.yard.setPlots(this.plots);
    for (const m of this.early.splice(0)) this.onSys(m);
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

  // ------------------------------------------------------------ грядки и растения

  setPlots(list: readonly FarmPlotView[]): void {
    this.plots = [];
    for (const v of list) this.plots[v.i] = v;
    this.bedsDirty = true;
    this.yard?.setPlots(this.plots);
  }

  /**
   * Сообщения части B1 (shared/farmsys.ts): Фургон открыт или уехал, Древо — состояние, шишки, чих, итог. Окна и тосты —
   * у FarmHud.onSys; здесь только 3D.
   */
  onSys(m: FarmSysMsg): void {
    // твёрдые Фургон и ствол Древа — как на сервере (server/farm/room.ts toggles), и пока сцена грузится
    if (m.t === 'farmVan') setFarmToggle(this.collision, 'van', m.v.open);
    else if (m.t === 'farmBoss') setFarmToggle(this.collision, 'boss', m.b.st === 'awake');
    else if (m.t === 'farmBossEnd') setFarmToggle(this.collision, 'boss', false);
    if (this.loading) {
      if (m.t === 'farmVan' || m.t === 'farmBoss' || m.t === 'farmBossEnd') this.early.push(m);
      return;
    }
    switch (m.t) {
      case 'farmVan':
        this.van?.setServer(m.v.open, m.v.next);
        return;
      case 'farmBoss': {
        const b = m.b;
        const phase = b.st === 'awake' ? 'awake' : b.st === 'bloom' ? 'won' : b.st === 'gone' ? 'lost' : 'sleep';
        const first = !this.bossSeen;
        this.bossSeen = true;
        this.boss?.setState(phase, b.hp > 0 ? b.bloom / b.hp : 0, b.phase, first);
        if (phase === 'awake') this.boss?.setCones(b.cones);
        return;
      }
      case 'farmBossEnd':
        this.boss?.setState(m.r.bloom ? 'won' : 'lost');
        return;
      case 'farmBossFx':
        if (m.k === 'sneeze') this.boss?.sneeze();
        else if (m.id !== undefined) this.boss?.removeCone(m.id);
        return;
    }
  }

  /**
   * События фермы (farmEv), которые не видны по участку: продажа — Гриб платит (у Фургона — Зина ставит галочку),
   * новый уровень и сбор — радуется свой питомец. Подключение в scene.ts: `this.world.onEvent(e)` рядом с `this.onEvent(e)`.
   */
  onEvent(e: FarmEvent): void {
    const me = LOCAL_WALKER.get(this.scene);
    switch (e.k) {
      case 'sold': {
        // сделка Фургона приходит тем же 'sold': стоишь у Фургона — кивает Зина, иначе платит Гриб
        const van = L.objects.find((o) => o.id === 'van')!;
        if (me && this.van?.here && Math.hypot(me.x - van.x, me.z - van.z) < 6) this.van.accept();
        else this.npcs?.cue('grib', e.coins >= 150 ? 'bigsale' : 'sold');
        return;
      }
      case 'level':
      case 'harvest':
        if (me) this.pets.cheerNear(me.x, me.z, 1);
        return;
    }
  }

  /** Окно жителя открыто/закрыто (Гриб, Семечкин): пока открыто — разговаривает. Подключение — в scene.ts */
  talk(id: string, on: boolean): void {
    if (id === 'grib' || id === 'semechkin') this.npcs?.setTalking(id as NpcId, on);
  }

  /**
   * Шишка-ворчунья под ногами (прошёл сквозь неё — подобрал): id для действия {a: 'cone', id} или null. Сцене —
   * спрашивать каждый кадр и слать не чаще раза в 0,5 с
   */
  coneAt(x: number, z: number, r = 0.8): number | null {
    return this.boss?.coneAt(x, z, r) ?? null;
  }

  setPlot(v: FarmPlotView): void {
    const old = this.plots[v.i];
    this.plots[v.i] = v;
    this.bedsDirty = true;
    this.yard?.setPlots(this.plots);
    if (old && old.pid === v.pid) this.diffPlot(old, v);
  }

  /** Что случилось на участке: посадка, полив, помощь, сбор — частицы, искорка в Древо, радость питомца и Семечкина */
  private diffPlot(a: FarmPlotView, b: FarmPlotView): void {
    const me = LOCAL_WALKER.get(this.scene);
    for (let n = 0; n < b.beds.length; n++) {
      const was: FarmBedView | undefined = a.beds[n];
      const now = b.beds[n];
      if (!was) continue;
      const { x, z } = bedWorld(b.i, n);
      if (was.c && !now.c) {
        // сбор: «пуф» земли и листочки; во время Древа — искорка роста
        this.fx.burst({ x, y: 0.2, z, n: 14, color: 0x8a6440, spread: 1, up: 1.6, life: 0.7, size: 0.16 });
        this.fx.burst({ x, y: 0.5, z, n: 10, color: 0xffd36a, spread: 0.8, up: 1.8, life: 0.8, size: 0.12, glow: true, gravity: 1 });
        this.boss?.spark(x, z, cropById(was.c)?.xp ?? 5);
        this.pets.cheerNear(x, z, 5);
      } else if (!was.c && now.c) {
        this.fx.burst({ x, y: 0.2, z, n: 16, color: 0x8a6440, spread: 1.1, up: 1.4, life: 0.6, size: 0.18 });
        this.popAt[b.i * FARM_BEDS + n] = this.time;
        if (me && Math.hypot(me.x - x, me.z - z) < 6) this.npcs?.cue('semechkin', 'happy');
      } else if (now.c && ((!was.w && now.w) || now.h > was.h)) {
        // полив и помощь соседа: брызги
        this.fx.burst({ x, y: 0.45, z, n: 22, color: 0x7cc4ff, spread: 0.9, up: 1.2, life: 0.55, size: 0.1, gravity: 4 });
      }
    }
  }

  private cropParts(crop: string, stage: number): PartInstances | null {
    let list = this.crops.get(crop);
    if (!list) {
      const model = this.models.get(`crop_${crop}`);
      if (!model) return null;
      list = [0, 1, 2, 3].map((s) => {
        let parts: readonly Part[] | undefined = model.nodes.get(`stage${s}`);
        // спелая стадия — свои материалы с тёплым свечением (та же программа шейдера, пульс — яркостью)
        if (s === 3 && parts) parts = parts.map((p) => ({ ...p, mat: this.ripeMat(p.mat) }));
        const pi = new PartInstances(parts, ALL_BEDS);
        pi.addTo(this.cropGroup);
        return pi;
      });
      this.crops.set(crop, list);
    }
    return list[stage] ?? null;
  }

  private ripeMat(src: THREE.Material): THREE.Material {
    let m = this.ripeMats.get(src);
    if (m) return m;
    const s = src as THREE.MeshStandardMaterial;
    if (!s.isMeshStandardMaterial) m = src;
    else {
      m = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: s.roughness, metalness: s.metalness, side: s.side, emissive: RIPE_GLOW.clone(), emissiveIntensity: 0.6,
      });
      m.name = `${src.name}_ripe`;
    }
    this.ripeMats.set(src, m);
    return m;
  }

  /** Перестроить грядки: при изменении участков, при смене стадии роста (раз в полсекунды) и пока растения «выпрыгивают» */
  private updateBeds(now: number): void {
    const beds = this.beds;
    if (!beds) return;
    // стадии меняются со временем: пересчёт, только если хоть одна поменялась
    let changed = this.bedsDirty || this.popping;
    for (let i = 0; i < L.plots.length; i++) {
      const v = this.plots[i];
      for (let n = 0; n < FARM_BEDS; n++) {
        const k = i * FARM_BEDS + n;
        const b = v?.pid ? v.beds[n] : undefined;
        const st = b?.c ? bedStage({ crop: b.c, plantedAt: b.p, ripeAt: b.r, watered: b.w, helpers: [] }, now) : -1;
        const was = this.stageKey[k];
        if (was !== st) {
          // новая стадия на глазах — растение «выпрыгивает» (при входе на ферму — нет)
          if (was !== undefined && st >= 0 && was >= 0) this.popAt[k] = this.time;
          this.stageKey[k] = st;
          changed = true;
        }
      }
    }
    if (!changed) return;
    this.bedsDirty = false;
    this.popping = false;
    for (const pi of Object.values(beds)) pi.begin();
    for (const list of this.crops.values()) for (const pi of list) pi.begin();
    this.ripeSpots.length = 0;
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
        const st = this.stageKey[i * FARM_BEDS + n];
        if (st === 3) {
          beds.rim.push(m);
          this.ripeSpots.push({ x, z });
        }
        const age = this.time - (this.popAt[i * FARM_BEDS + n] ?? -9);
        if (age < POP_S) this.popping = true;
        this.cropParts(b.c, st)?.push(at(x, 0, z, plot.yaw, popScale(age)));
      }
    }
    for (const pi of Object.values(beds)) pi.end();
    for (const list of this.crops.values()) for (const pi of list) pi.end();
    if (!this.rimMat) {
      // ободок спелой грядки — свой материал: пульсирует яркостью
      const rim = beds.rim.meshes[0]?.material as THREE.MeshBasicMaterial | undefined;
      if (rim?.isMeshBasicMaterial) {
        this.rimMat = rim.clone();
        for (const mesh of beds.rim.meshes) mesh.material = this.rimMat;
      }
    }
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
    this.decor.update(t);
    if (this.bedsDirty || this.popping || t - this.stagesAt > 0.5) {
      this.stagesAt = t;
      this.updateBeds(now);
    }
    // спелое: мягкий пульс яркостью и редкие золотые искорки над ближними грядками
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    for (const m of this.ripeMats.values()) if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) (m as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + 0.5 * pulse;
    this.rimMat?.color.setScalar(0.8 + 0.45 * pulse);
    const cam = this.camera.position;
    this.ripeSparkT -= dt;
    if (this.ripeSparkT <= 0 && this.ripeSpots.length) {
      this.ripeSparkT = 0.12;
      const s = this.ripeSpots[Math.floor(Math.random() * this.ripeSpots.length)];
      if (Math.hypot(s.x - cam.x, s.z - cam.z) < RIPE_SPARK_R) {
        this.fx.one(s.x + (Math.random() - 0.5) * 1.3, 0.35 + Math.random() * 0.5, s.z + (Math.random() - 0.5) * 1.3, 0, 0.35, 0, 0xffd36a, 1.4, 0.09);
      }
    }
    const me = LOCAL_WALKER.get(this.scene);
    const meHere = me && performance.now() - me.at < 500 ? me : null;
    this.npcs?.update(dt, meHere?.x ?? null, meHere?.z ?? null);
    this.van?.update(dt, now, t);
    this.boss?.update(dt);
    this.yard?.update(dt, cam, meHere);
    this.pets.update(dt, cam);
    this.fx.setView(this.renderer.canvas.height || 720, this.camera.fov);
    this.fx.update(dt);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera, SKY.exposure);
  }
}

export type { V3 };
