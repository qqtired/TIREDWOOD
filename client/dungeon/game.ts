// «Подземелье»: забег на клиенте. Симуляция шагает 30 раз в секунду с накоплением времени (пауза, карточки и сундук —
// по правилам симуляции; Esc и свёрнутая вкладка — шаги стоят), рисование — каждый кадр с интерполяцией между двумя
// последними шагами. Карта-тор: всё хранится в координатах тора, камера живёт в обычных координатах, сущности
// рисуются в точке cam + wrap(p − cam). Ввод уходит событиями журнала (journal.ts) — их же получает сервер.
import * as THREE from 'three';
import type { DgClientMsg, DgEvent, DgServerMsg } from '../../shared/dungeon/api.ts';
import { DG_HZ, DG_MAP } from '../../shared/dungeon/api.ts';
import type { Input } from '../input.ts';
import type { Renderer } from '../render/renderer.ts';
import type { DungeonAssets } from './assets.ts';
import { BossView } from './boss.ts';
import { BuildingRenderer } from './buildings.ts';
import { BuildingZones } from './zones.ts';
import { BOSS_NAME, WEAPONS, plural } from './data.ts';
import { A_SOFT, A_SPARK, A_STAR, Billboards, D_BEAM, D_CONE, D_PUDDLE, D_RING, D_SHADOW, D_SOFT, D_SPLAT, D_TCIRCLE, D_TSECTOR, D_TSTRIP, FloorDecals, FxPool, ICONS } from './fx.ts';
import { HeroView } from './hero.ts';
import { DungeonHud } from './hud.ts';
import type { HudArrow, HudFrame, HudPoiKind, HudRadar, HudResults } from './hudtypes.ts';
import { Journal } from './journal.ts';
import { MobRenderer, WALK_REF, type ClipKey } from './mobs.ts';
import { DungeonSfx } from './sfx.ts';
import type { RunSource } from './source.ts';
import { ACT_ATTACK, ACT_LOOP, ACT_SPECIAL, ACT_STUN, type BuildingKind, type DgView, type MobKind, type VBuilding, type VFx } from './view.ts';
import { BTN_BACK, BTN_FORWARD, BTN_LEFT, BTN_RIGHT } from '../../shared/sim.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const L = DG_MAP;
const DT = 1 / DG_HZ;
const wrap = (d: number): number => d - L * Math.round(d / L);

/** Камера: наклон 62°, 31 м до точки взгляда, вертикальный угол 36° при 16:9 (level.md §6) */
const CAM_PITCH = (62 * Math.PI) / 180;
const CAM_DIST = 31;
const CAM_LOOK_Z = 2;
const HFOV_HALF_TAN = Math.tan((18 * Math.PI) / 180) * (16 / 9);
/** Стрелок у края экрана — не больше */
const ARROW_MAX = 6;
/** Радар: радиус, м, и сколько рядовых врагов рисовать */
const RADAR_RANGE = 70;
const RADAR_MOBS = 260;
/** Тряска камеры — не сильнее (владелец: «плавнее») */
const SHAKE_MAX = 0.42;
/** Цифры урона: попадания по одному врагу копятся столько секунд и всплывают одной цифрой */
const NUM_MERGE = 0.22;
/** Видно от камеры по x и z (для отсечения), м */
const VIEW_X = 30;
const VIEW_Z = 24;

export interface WorldLike {
  readonly root: THREE.Object3D;
  update(camX: number, camZ: number, time: number): void;
}

export interface GameDeps {
  renderer: Renderer;
  input: Input;
  sfx: DungeonSfx;
  hud: DungeonHud;
  send(m: DgClientMsg): void;
  /** «На набережную» */
  leave(): void;
  /** новый забег по зерну */
  makeRun(seed: number): RunSource;
}

interface Pos { x: number; z: number; yaw: number }

interface Corpse { kind: MobKind; x: number; z: number; yaw: number; t: number; dur: number; elite: boolean }

export class DungeonGame {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 16 / 9, 4, 110);
  private readonly d: GameDeps;
  private readonly world: WorldLike | null;
  private readonly mobs: MobRenderer;
  private readonly hero: HeroView;
  /** Модели боссов: по id червя (у Близнецов на 30-й волне их два); свободные ждут в запасе */
  private readonly bossViews = new Map<number, BossView>();
  private readonly bossSpare: BossView[] = [];
  private readonly bossGltf: DungeonAssets['boss'];
  /** Общая полоса здоровья: наибольшая сумма HP и число боссов за бой (знаменатель не прыгает, когда один пал) */
  private bossHpMax = 0;
  private bossCount = 0;
  private readonly buildings: BuildingRenderer;
  private readonly decN = new FloorDecals(1600, false, 1);
  private readonly decA = new FloorDecals(500, true, 2);
  private readonly bbN = new Billboards(500, false, false, 6);
  private readonly bbA = new Billboards(1400, true, true, 5);
  private readonly pool = new FxPool();
  private readonly zones = new BuildingZones();
  private readonly journal = new Journal();
  private readonly projMeshes = new Map<string, THREE.InstancedMesh>();
  private readonly gems: THREE.InstancedMesh;
  private run: RunSource | null = null;
  private view: DgView | null = null;
  private readonly prev = new Map<number, Pos>();
  private prevHero: Pos = { x: 0, z: 0, yaw: 0 };
  private readonly prevBosses = new Map<number, Pos>();
  private readonly firstSeen = new Map<number, number>();
  private readonly flashAt = new Map<number, number>();
  private readonly hitAt = new Map<number, number>();
  private corpses: Corpse[] = [];
  private acc = 0;
  private time = 0;
  /** время мира: стоит на паузе, в карточках и в сундуке (анимации врагов, частицы) */
  private wtime = 0;
  private prevRays: DgView['rays'] = [];
  private lastQFull = false;
  /** dgHash сразу после последнего шага (до событий следующего) — его и ждёт сервер в dg_log.h */
  private stepHash = 0;
  /** шагов симуляции за жизнь забега (для «шагов в секунду» в отладке) */
  private steps = 0;
  /** камера (несвёрнутые координаты) и герой в них же */
  private camX = 120;
  private camZ = 120;
  private heroUX = 120;
  private heroUZ = 120;
  private shake = 0;
  private hitStop = 0;
  private slowT = 0;
  private slowK = 1;
  private lanternK = 1;
  private paused = false;
  private ended = false;
  private endShownAt = -1;
  private results: HudResults | null = null;
  private queue: DgEvent[] = [];
  private lastMv = { x: 0, y: 0 };
  private qHeld = false;
  private seed = 0;
  private aspect = 16 / 9;
  private bossZoom = 0;
  private cardsKey = '';
  private wasChest = false;
  private lastDashReady = true;
  private lastQReady = true;
  private lastStage = '';
  private readonly tmpV = new THREE.Vector3();
  private vw = window.innerWidth / 2;
  private vh = window.innerHeight / 2;
  private radarAt = 0;
  /** герой на экране в этом кадре (несвёрнутые координаты) — для радара */
  private drawHX = 0;
  private drawHZ = 0;
  /** цифры урона в ожидании (по врагу): копим мелкие попадания и показываем суммой */
  private readonly numAcc = new Map<number, { n: number; x: number; z: number; t: number; blocked: boolean }>();

  constructor(d: GameDeps, assets: DungeonAssets, world: WorldLike | null) {
    this.d = d;
    this.world = world;
    const s = this.scene;
    s.background = new THREE.Color(0x120d0b);
    s.add(new THREE.HemisphereLight(0x9a7c62, 0x2a1c14, 2.4));
    if (world) s.add(world.root);
    else {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6e5644, roughness: 0.95 }));
      floor.name = 'dg-floor-stub';
      s.add(floor);
    }
    this.mobs = new MobRenderer(assets);
    s.add(this.mobs.root);
    this.hero = new HeroView(assets.hero);
    s.add(this.hero.root);
    this.bossGltf = assets.boss;
    this.bossSpare.push(this.makeBossView());
    this.buildings = new BuildingRenderer(assets.kits);
    s.add(this.buildings.root);
    s.add(this.decN.mesh, this.decA.mesh, this.bbN.mesh, this.bbA.mesh);
    // снаряды: простые формы, по отрисовке на вид
    const mk = (key: string, g: THREE.BufferGeometry, m: THREE.Material, cap = 200): void => {
      const im = new THREE.InstancedMesh(g, m, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      im.name = `dg-proj-${key}`;
      this.projMeshes.set(key, im);
      s.add(im);
    };
    mk('ember', new THREE.IcosahedronGeometry(0.17, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.75, 0.25) }));
    mk('firefly', new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.5, 0.5) }));
    mk('spit', new THREE.IcosahedronGeometry(0.26, 1), new THREE.MeshStandardMaterial({ color: 0x6b2a8c, roughness: 0.15, emissive: 0x3a0d55 }));
    mk('rock', new THREE.ConeGeometry(0.42, 1.5, 6).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.9 }), 60);
    mk('charge', new THREE.CylinderGeometry(0.11, 0.11, 0.42, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc23a2b, roughness: 0.6, emissive: 0x2a0500 }), 60);
    mk('pick', pickaxeGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), 40);
    this.gems = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.2, 0).scale(0.8, 1.25, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff }), 700);
    this.gems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gems.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(700 * 3), 3);
    this.gems.frustumCulled = false;
    this.gems.count = 0;
    s.add(this.gems);
  }

  /** Прогрев шейдеров: всё видимое разом (на экране загрузки) */
  private makeBossView(): BossView {
    const bv = new BossView(this.bossGltf);
    this.scene.add(bv.root);
    return bv;
  }

  /** Полоса босса в HUD: одна на всех (у Близнецов — общая, сумма HP живых к сумме в начале боя) */
  private bossHud(v: DgView): HudFrame['boss'] {
    const bs = v.bosses;
    if (bs.length === 0) {
      this.bossHpMax = 0;
      this.bossCount = 0;
      return null;
    }
    let hp = 0;
    let max = 0;
    for (const b of bs) {
      hp += Math.max(0, b.hp);
      max += b.hpMax;
    }
    this.bossHpMax = Math.max(this.bossHpMax, max);
    this.bossCount = Math.max(this.bossCount, bs.length);
    // отметки фаз (66 % и 33 %) — только у одиночного босса
    return { name: bs[0].name || BOSS_NAME, hp01: hp / this.bossHpMax, marks: this.bossCount > 1 ? [] : [0.66, 0.33], rage: bs.some((b) => b.rage) };
  }

  async warm(): Promise<void> {
    this.mobs.warm(this.camX, this.camZ);
    this.layoutCamera();
    try {
      await this.d.renderer.gl.compileAsync(this.scene, this.camera);
    } catch {
      this.d.renderer.gl.compile(this.scene, this.camera);
    }
    this.mobs.begin();
    this.mobs.end();
  }

  // ---------------------------------------------------------------- забег

  start(seed: number): void {
    this.seed = seed;
    this.run = this.d.makeRun(seed);
    this.view = this.run.view();
    this.stepHash = this.run.hash();
    this.journal.reset();
    this.prev.clear();
    this.firstSeen.clear();
    this.flashAt.clear();
    this.hitAt.clear();
    this.numAcc.clear();
    this.corpses = [];
    this.pool.clear();
    this.queue = [];
    this.lastMv = { x: 0, y: 0 };
    this.qHeld = false;
    this.acc = 0;
    this.ended = false;
    this.endShownAt = -1;
    this.results = null;
    this.paused = false;
    this.lanternK = 1;
    this.slowK = 1;
    this.slowT = 0;
    this.hitStop = 0;
    this.prevRays = [];
    this.prevBosses.clear();
    this.lastQFull = false;
    const h = this.view.hero;
    this.heroUX = h.x;
    this.heroUZ = h.z;
    this.camX = h.x;
    this.camZ = h.z;
    this.prevHero = { x: h.x, z: h.z, yaw: h.yaw };
    this.hero.revive();
    this.d.hud.results(null);
    this.d.hud.pause(false, 0);
    this.d.hud.cards(null);
    this.d.hud.chest(null);
    this.d.sfx.ambience(true);
  }

  get active(): boolean {
    return this.run !== null;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** ui — показать окно паузы (Esc, свёрнутая вкладка); пауза из меню оболочки — без него */
  setPaused(on: boolean, ui = true): void {
    if (!this.run || this.ended || on === this.paused) return;
    this.paused = on;
    this.d.send({ t: 'dg_pause', on: on ? 1 : 0 });
    this.d.hud.pause(on && ui, this.view?.wavesDone ?? 0);
    if (on) {
      this.flush();
      this.d.sfx.qCharge(false);
    }
    this.d.input.releaseAll();
  }

  /** Выйти из забега: дослать журнал и уйти на набережную (сервер засчитает отбитые волны) */
  quit(): void {
    this.flush();
    this.d.sfx.stopAll();
    this.d.leave();
  }

  again(): void {
    if (!this.ended) return;
    this.d.send({ t: 'dg_again' });
  }

  stop(): void {
    this.zones.hide();
    this.run = null;
    this.view = null;
    this.d.sfx.stopAll();
  }

  onServer(m: DgServerMsg): void {
    if (m.t === 'dg_hello') {
      this.start(m.seed);
    } else if (m.t === 'dg_ack') {
      this.journal.ack(m.n, m.need);
      if (m.need !== undefined) this.flush();
    } else if (m.t === 'dg_wave') {
      // волна засчитана (таймер или зачистка): маленькая плашка, жетоны дописываются в ту же
      if (m.coins > 0) this.d.hud.toast(`w${m.wave}`, `Волна ${m.wave} выстояна · +${m.coins} 🪙`, 'ok');
    } else if (m.t === 'dg_end') {
      const r = this.results ?? this.buildResults();
      const coins: { label: string; n: number }[] = [];
      if (m.pay) {
        if (m.pay.waves > 0) coins.push({ label: 'Волны', n: m.pay.waves });
        if (m.pay.bosses > 0) coins.push({ label: 'Боссы', n: m.pay.bosses });
        if (m.pay.record > 0) coins.push({ label: 'Новый рекорд', n: m.pay.record });
      } else if (m.coins > 0) coins.push({ label: m.newBest ? 'Волны, боссы и рекорд' : 'Волны и боссы', n: m.coins });
      this.results = { ...r, waves: m.result.waves, ms: m.result.ms, newBest: m.newBest, weekRank: m.weekRank, coins, coinsTotal: m.coins, pending: false };
      if (this.ended) this.d.hud.results(this.results);
    }
  }

  private flush(): void {
    if (!this.run) return;
    for (const m of this.journal.poll(0, this.run.tick, this.stepHash, true)) this.d.send(m);
  }

  // ---------------------------------------------------------------- ввод

  /** Клавиши режима. true — съели */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (!this.run) return false;
    if (code === 'Escape') {
      if (!down) return true;
      if (this.ended) this.d.leave();
      else this.setPaused(!this.paused);
      return true;
    }
    if (this.ended) {
      if (down && code === 'KeyR') this.again();
      return code === 'KeyR';
    }
    if (this.paused) return true;
    const v = this.view;
    if (v?.cards) {
      if (down && !e.repeat) {
        const i = code === 'Digit1' || code === 'Numpad1' ? 0 : code === 'Digit2' || code === 'Numpad2' ? 1 : code === 'Digit3' || code === 'Numpad3' ? 2 : -1;
        if (i >= 0) this.cardAction(i);
      }
      return code.startsWith('Digit') || code.startsWith('Numpad');
    }
    if (v?.chest) {
      if (down && !e.repeat && (code === 'Enter' || code === 'Space' || code === 'NumpadEnter')) this.chestDone();
      return code === 'Enter' || code === 'Space';
    }
    // Пробел и Shift — рывок (Shift нажимает кнопка «рывок» из оболочки на телефоне)
    if (code === 'Space' || code === 'ShiftLeft') {
      if (down && !e.repeat) this.push({ t: 0, k: 'dash' });
      return true;
    }
    if (code === 'KeyQ') {
      if (!e.repeat) this.setQ(down);
      return true;
    }
    if (code === 'KeyE') {
      if (down && !e.repeat) this.push({ t: 0, k: 'use' });
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter') && v?.stage === 'breather') {
      if (down && !e.repeat) this.go();
      return true;
    }
    return false;
  }

  /** Q: нажал — начал заряд, отпустил — удар */
  private setQ(down: boolean): void {
    if (down === this.qHeld) return;
    this.qHeld = down;
    this.push({ t: 0, k: 'q', on: down ? 1 : 0 });
  }

  /** Кнопка Q на экране телефона — то же, что клавиша; в окнах (пауза, карточки, сундук, итоги) не работает */
  touchQ(down: boolean): void {
    const v = this.view;
    if (!this.run || this.ended || this.paused || v?.cards || v?.chest) return;
    this.setQ(down);
  }

  private push(ev: DgEvent): void {
    this.queue.push(ev);
  }

  cardAction(i: number): void {
    if (!this.view?.cards) return;
    if (this.d.hud.banMode) {
      this.push({ t: 0, k: 'ban', i });
      this.d.hud.setBanMode(false);
      this.d.sfx.reroll();
    } else {
      this.push({ t: 0, k: 'pick', i });
      this.d.sfx.cardPick();
    }
  }

  reroll(): void {
    if (this.view?.cards && this.view.cards.rerolls > 0) {
      this.push({ t: 0, k: 'reroll' });
      this.d.sfx.reroll();
    }
  }

  ban(i: number): void {
    if (this.view?.cards && this.view.cards.banishes > 0) {
      this.push({ t: 0, k: 'ban', i });
      this.d.hud.setBanMode(false);
      this.d.sfx.reroll();
    }
  }

  /** E с кнопки телефона */
  use(): void {
    if (this.run && !this.paused && !this.ended) this.push({ t: 0, k: 'use' });
  }

  go(): void {
    this.push({ t: 0, k: 'go' });
    this.d.sfx.uiClick();
  }

  chestDone(): void {
    // сундук закрывает pick (любой i)
    this.push({ t: 0, k: 'pick', i: 0 });
    this.d.sfx.uiClick();
  }

  private sampleMove(): { x: number; y: number } {
    // клавиши движения — те же биты, что у Input (WASD и стрелки)
    const inp = this.d.input;
    const f = inp.isHeld(BTN_FORWARD);
    const b = inp.isHeld(BTN_BACK);
    const l = inp.isHeld(BTN_LEFT);
    const r = inp.isHeld(BTN_RIGHT);
    let x = (r ? 1 : 0) - (l ? 1 : 0);
    let y = (b ? 1 : 0) - (f ? 1 : 0);
    if (x && y) {
      x *= 71;
      y *= 71;
    } else {
      x *= 100;
      y *= 100;
    }
    return { x, y };
  }

  // ---------------------------------------------------------------- кадр

  frame(now: number, dt: number): void {
    const run = this.run;
    this.time += dt;
    if (run && this.view) {
      let sdt = dt;
      if (this.hitStop > 0) {
        this.hitStop -= dt;
        sdt = 0;
      } else if (this.slowT > 0) {
        this.slowT -= dt;
        sdt = dt * this.slowK;
      }
      // обрыв связи, чат, меню оболочки — мир стоит (как пауза, но без окна)
      const halt = this.paused || this.d.input.blocked;
      if (!halt && !run.frozen) this.wtime += sdt;
      if (!halt) {
        this.acc += sdt;
        let n = 0;
        while (this.acc >= DT && n < 6) {
          this.acc -= DT;
          n++;
          this.tick(run);
        }
        if (n === 6) this.acc = 0;
      }
      if (!this.paused) for (const m of this.journal.poll(dt, run.tick, this.stepHash, false)) this.d.send(m);
    }
    this.draw(now, dt);
  }

  private tick(run: RunSource): void {
    // ввод → события журнала с номером шага
    const mv = this.d.input.blocked ? { x: 0, y: 0 } : this.sampleMove();
    if (mv.x !== this.lastMv.x || mv.y !== this.lastMv.y) {
      this.lastMv = mv;
      this.queue.push({ t: 0, k: 'mv', x: mv.x, y: mv.y });
    }
    for (const ev of this.queue) {
      const e = { ...ev, t: run.tick } as DgEvent;
      run.apply(e);
      this.journal.push(e);
    }
    this.queue.length = 0;
    // позиции до шага — для интерполяции
    const v0 = run.view();
    this.prev.clear();
    for (const e of v0.enemies) this.prev.set(e.id, { x: e.x, z: e.z, yaw: e.yaw });
    for (const p of v0.projectiles) this.prev.set(-1000000 - p.id, { x: p.x, z: p.z, yaw: p.yaw });
    for (const p of v0.pickups) this.prev.set(-2000000 - p.id, { x: p.x, z: p.z, yaw: 0 });
    this.prevHero = { x: v0.hero.x, z: v0.hero.z, yaw: v0.hero.yaw };
    this.prevRays = v0.rays;
    this.prevBosses.clear();
    for (const b of v0.bosses) this.prevBosses.set(b.id, { x: b.x, z: b.z, yaw: b.yaw });
    run.step();
    this.stepHash = run.hash();
    this.steps++;
    const v = run.view();
    this.view = v;
    // герой в несвёрнутых координатах
    this.heroUX += wrap(v.hero.x - this.prevHero.x);
    this.heroUZ += wrap(v.hero.z - this.prevHero.z);
    for (const e of v.enemies) if (!this.firstSeen.has(e.id)) this.firstSeen.set(e.id, this.wtime);
    // забытые враги — из словарей (раз в 3 с)
    if (this.steps % 90 === 0) {
      const alive = new Set(v.enemies.map((e) => e.id));
      for (const m of [this.firstSeen, this.flashAt, this.hitAt]) for (const id of m.keys()) if (!alive.has(id)) m.delete(id);
    }
    for (const f of v.fx) this.onFx(f, v);
    if (this.numAcc.size) for (const id of this.numAcc.keys()) this.flushNum(id, false);
    this.syncUi(v);
  }

  private syncUi(v: DgView): void {
    const hud = this.d.hud;
    const ck = v.cards ? JSON.stringify(v.cards) : '';
    if (ck !== this.cardsKey) {
      this.cardsKey = ck;
      hud.cards(v.cards);
    }
    if (!!v.chest !== this.wasChest) {
      hud.chest(v.chest);
      if (v.chest) {
        this.d.sfx.chestSpin();
        window.setTimeout(() => this.d.sfx.chestOpen(!!v.chest?.items.some((i) => i.evo)), 1200);
      }
    }
    this.wasChest = !!v.chest;
    if (v.stage !== this.lastStage) {
      this.lastStage = v.stage;
      this.d.sfx.setTension(v.stage === 'boss' ? 0.8 : v.stage === 'wave' ? 0.3 : 0);
    }
    if (v.hero.dead && !this.ended) {
      this.ended = true;
      this.endShownAt = this.time + 1.6;
      this.slowT = 0.5;
      this.slowK = 0.3;
      this.d.sfx.qCharge(false);
      this.flush();
    }
  }

  /** Показать накопленную цифру урона врага (now — сразу, иначе когда накопилось NUM_MERGE с) */
  private flushNum(id: number, now: boolean): void {
    const a = this.numAcc.get(id);
    if (!a || (!now && this.wtime - a.t < NUM_MERGE)) return;
    this.numAcc.delete(id);
    this.pool.number(a.x, a.z, a.n, false, a.blocked ? 0.7 : 1, a.blocked ? 0.75 : 0.98, a.blocked ? 0.8 : 0.92);
  }

  private pan(x: number): number {
    return Math.max(-1, Math.min(1, wrap(x - this.camX) / 18));
  }

  private onFx(f: VFx, v: DgView): void {
    const sfx = this.d.sfx;
    const P = this.pool;
    switch (f.k) {
      case 'hit': {
        this.flashAt.set(f.id, this.wtime);
        this.hitAt.set(f.id, this.wtime);
        if (f.big) P.number(f.x, f.z, f.dmg, true, 1, 0.84, 0.35);
        else {
          const key = f.id === -1 ? -1 - (f.boss ?? 0) : f.id;
          const a = this.numAcc.get(key);
          if (a) {
            a.n += f.dmg;
            a.x = f.x;
            a.z = f.z;
            a.blocked &&= !!f.blocked;
          } else this.numAcc.set(key, { n: f.dmg, x: f.x, z: f.z, t: this.wtime, blocked: !!f.blocked });
        }
        if (f.blocked) {
          sfx.shieldBlock(this.pan(f.x));
          P.burst(f.x, 0.6, f.z, 4, 3, A_SPARK, 1, 0.9, 0.6, 0.25, 0.25);
        } else sfx.hit(this.pan(f.x), f.big, 0.7);
        if (f.id === -1) {
          // попали в босса: вспыхивает тот, в кого попали (нет id — все)
          const one = f.boss === undefined ? undefined : this.bossViews.get(f.boss);
          if (one) one.hitFlash();
          else for (const bv of this.bossViews.values()) bv.hitFlash();
        }
        break;
      }
      case 'kill': {
        this.flushNum(f.id, true);
        const prev = this.prev.get(f.id);
        const dur = this.mobs.duration(f.kind, 'death');
        this.corpses.push({ kind: f.kind, x: f.x, z: f.z, yaw: prev?.yaw ?? 0, t: this.wtime, dur: Math.min(dur, 1.3), elite: f.elite });
        const big = f.elite ? 2.2 : f.kind === 'shroom' || f.kind === 'beetle' || f.kind === 'slime' ? 1.1 : 0.75;
        P.decal({ x: f.x, z: f.z, yaw: P.rnd() * 6, shape: D_SPLAT, r0: big * 0.5, r1: big, len: 0, p1: 0, p2: 0, r: 0.3, g: 0.08, b: 0.42, a: 0.85, max: 2.4, add: false });
        P.burst(f.x, 0.5, f.z, f.elite ? 18 : 6, 3.2, A_SOFT, 0.55, 0.2, 0.8, 0.55, 0.32, false, 9, 3);
        sfx.kill(this.pan(f.x), 0.8);
        if (f.elite) {
          this.slowT = 0.3;
          this.slowK = 0.35;
          this.shake = Math.max(this.shake, 0.4);
        }
        break;
      }
      case 'pick':
        if (f.kind.startsWith('gem')) {
          sfx.gem();
          P.burst(v.hero.x, 1, v.hero.z, 2, 1.5, A_STAR, 0.5, 1, 0.95, 0.35, 0.22);
        } else {
          sfx.pickupItem();
          P.burst(v.hero.x, 1, v.hero.z, 12, 3, A_STAR, 1, 0.85, 0.4, 0.6, 0.3);
        }
        break;
      case 'level':
        sfx.level();
        this.hero.flash(1);
        this.d.hud.levelFlash(f.level);
        P.decal({ x: v.hero.x, z: v.hero.z, yaw: 0, shape: D_RING, r0: 0.6, r1: 4.2, len: 0, p1: 0.85, p2: 0.12, r: 1, g: 0.75, b: 0.3, a: 1, max: 0.55, add: true });
        P.decal({ x: v.hero.x, z: v.hero.z, yaw: 0, shape: D_SOFT, r0: 3, r1: 6, len: 0, p1: 1.5, p2: 0, r: 1, g: 0.7, b: 0.3, a: 0.9, max: 0.6, add: true });
        P.burst(v.hero.x, 1.2, v.hero.z, 26, 6, A_STAR, 1, 0.82, 0.35, 0.8, 0.35, true, 3, 3);
        break;
      case 'dash': {
        sfx.dash();
        this.hero.dash();
        const dx = wrap(f.tx - f.x);
        const dz = wrap(f.tz - f.z);
        P.decal({ x: f.x, z: f.z, yaw: Math.atan2(dx, dz), shape: D_BEAM, r0: 0.55, r1: 0.3, len: Math.hypot(dx, dz), p1: 0, p2: 0, r: 1, g: 0.85, b: 0.6, a: 0.85, max: 0.4, add: true });
        for (let i = 0; i < 10; i++) P.spark(f.x + dx * (i / 10), 0.9, f.z + dz * (i / 10), 0, 0.6, 0, 0.35, 0.5, A_SOFT, 1, 0.85, 0.6);
        break;
      }
      case 'q':
        this.hero.strike();
        if (f.full) {
          sfx.qBlast();
          this.hitStop = 0.05;
          this.shake = Math.max(this.shake, 0.35);
          P.decal({ x: f.x, z: f.z, yaw: 0, shape: D_RING, r0: 0.8, r1: f.r * 1.15, len: 0, p1: 0.86, p2: 0.1, r: 1, g: 0.9, b: 0.6, a: 1, max: 0.45, add: true });
          P.decal({ x: f.x, z: f.z, yaw: 0, shape: D_SOFT, r0: f.r, r1: f.r * 1.2, len: 0, p1: 1.2, p2: 0, r: 1, g: 0.7, b: 0.3, a: 1, max: 0.35, add: true });
          P.decal({ x: f.x, z: f.z, yaw: P.rnd() * 6, shape: D_SPLAT, r0: f.r * 0.5, r1: f.r * 0.55, len: 0, p1: 0, p2: 0, r: 0.12, g: 0.08, b: 0.06, a: 0.55, max: 2, add: false });
          P.burst(f.x, 0.3, f.z, 30, 9, A_SOFT, 0.8, 0.65, 0.45, 0.6, 0.45, false, 8, 2.5);
        } else {
          sfx.qTap(0);
          P.decal({ x: f.x, z: f.z, yaw: 0, shape: D_RING, r0: 0.5, r1: f.r, len: 0, p1: 0.86, p2: 0.12, r: 1, g: 0.75, b: 0.4, a: 0.9, max: 0.3, add: true });
        }
        break;
      case 'hurt':
        sfx.hurt();
        this.hero.hit();
        this.shake = Math.max(this.shake, 0.18);
        break;
      case 'cone':
        sfx.lantern(0, 0.7);
        P.decal({ x: f.x, z: f.z, yaw: f.yaw, shape: D_CONE, r0: f.range, r1: f.range * 1.05, len: 0, p1: 0, p2: f.angle, r: 1, g: 0.72, b: 0.32, a: 0.95, max: 0.22, add: true });
        if (f.evo) P.decal({ x: f.x, z: f.z, yaw: f.yaw + Math.PI, shape: D_CONE, r0: f.range, r1: f.range * 1.05, len: 0, p1: 0, p2: f.angle, r: 1, g: 0.6, b: 0.25, a: 0.95, max: 0.22, add: true });
        break;
      case 'chain': {
        sfx.spark(0, 0.8);
        const p = f.pts;
        for (let i = 0; i + 3 < p.length; i += 2) {
          const ax = p[i];
          const az = p[i + 1];
          const dx = wrap(p[i + 2] - ax);
          const dz = wrap(p[i + 3] - az);
          const n = Math.max(3, Math.ceil(Math.hypot(dx, dz) * 3));
          for (let k = 0; k <= n; k++) {
            const j = (P.rnd() - 0.5) * 0.35;
            P.spark(ax + dx * (k / n) + j, 1 + (P.rnd() - 0.5) * 0.3, az + dz * (k / n) - j, 0, 0, 0, 0.16, 0.42, A_SOFT, 0.7, 0.85, 1.3);
          }
          P.burst(ax + dx, 1, az + dz, 3, 3, A_SPARK, 0.7, 0.9, 1.3, 0.25, 0.3);
        }
        break;
      }
      case 'beam':
        sfx.beam(0, 0.8);
        P.decal({ x: f.x, z: f.z, yaw: f.yaw, shape: D_BEAM, r0: f.w * 0.6, r1: f.w * 0.3, len: f.len, p1: 0, p2: 0, r: 1, g: 0.95, b: 0.75, a: 1, max: 0.35, add: true });
        break;
      case 'boom': {
        const k = f.kind;
        if (k === 'rock') sfx.stalactite(this.pan(f.x), 0.8);
        else if (k === 'charge') sfx.charge(this.pan(f.x));
        else if (k === 'keg') { sfx.keg(); this.shake = Math.max(this.shake, 0.6); }
        else if (k === 'spit') sfx.splat(this.pan(f.x), 0.8);
        else { sfx.bossEmerge(); this.shake = Math.max(this.shake, 0.45); }
        const col = k === 'spit' ? [0.7, 0.3, 1] : k === 'rock' ? [0.75, 0.65, 0.5] : [1, 0.6, 0.25];
        P.decal({ x: f.x, z: f.z, yaw: 0, shape: D_RING, r0: f.r * 0.3, r1: f.r, len: 0, p1: 0.85, p2: 0.14, r: col[0], g: col[1], b: col[2], a: 0.9, max: 0.3, add: true });
        P.burst(f.x, 0.3, f.z, k === 'spit' ? 8 : 14, f.r * 2.5, A_SOFT, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 0.5, 0.35, false, 9, 2);
        break;
      }
      case 'shot':
        if (f.w === 'ember') sfx.ember(0, 0.6);
        else if (f.w === 'pick') sfx.pickaxe(0, 0.7);
        break;
      case 'elite':
        sfx.eliteHorn();
        this.d.hud.banner(`${f.name}!`, 'Элита', 'elite');
        break;
      case 'wave':
        sfx.waveStart(f.wave);
        this.d.hud.banner(f.title, f.sub, f.sub === 'Босс' ? 'boss' : 'wave');
        break;
      case 'waveWin':
        this.d.hud.toast(`w${f.wave}`, `Волна ${f.wave} выстояна`, 'ok');
        break;
      case 'sweep':
        sfx.waveWin();
        this.d.hud.banner('Зачистка!', f.xp > 0 ? `+${f.xp} опыта · передышка` : 'Передышка', 'clear');
        break;
      case 'rage':
        if (f.n > 0) this.d.hud.toast('rage', `${f.n} ${plural(f.n, 'враг озверел', 'врага озверели', 'врагов озверели')}`, 'warn');
        break;
      case 'event':
        this.d.hud.banner(f.title, '', 'warn');
        break;
      case 'boss':
        if (f.what === 'spawn') this.d.hud.banner(v.bosses[0]?.name || BOSS_NAME, 'Босс', 'boss');
        if (f.what === 'roar' || f.what === 'spawn' || f.what === 'phase') sfx.bossRoar();
        if (f.what === 'burrow') sfx.bossBurrow();
        if (f.what === 'emerge') { sfx.bossEmerge(); this.shake = Math.max(this.shake, 0.35); P.burst(f.x, 0.3, f.z, 30, 7, A_SOFT, 0.55, 0.45, 0.35, 0.8, 0.6, false, 8, 4); }
        if (f.what === 'slam') this.shake = Math.max(this.shake, 0.5);
        if (f.what === 'spit') sfx.spit(this.pan(f.x));
        if (f.what === 'death') { sfx.bossRoar(); this.slowT = 0.6; this.slowK = 0.3; }
        break;
      case 'spawnFx':
        P.burst(f.x, 0.2, f.z, 4, 1.5, A_SOFT, 0.4, 0.32, 0.26, 0.5, 0.4, false, 4, 1.5);
        break;
      case 'use':
        if (f.kind === 'altar') sfx.altar();
        else if (f.kind === 'spring') sfx.spring();
        else if (f.kind === 'brazier') sfx.brazierTip(this.pan(f.x));
        P.burst(f.x, 1, f.z, 16, 4, A_STAR, 1, 0.85, 0.45, 0.7, 0.3);
        break;
      case 'death':
        sfx.death();
        this.hero.die();
        break;
      case 'heal':
        P.number(v.hero.x, v.hero.z, f.n, false, 0.45, 1, 0.5);
        P.burst(v.hero.x, 1, v.hero.z, 8, 2, A_STAR, 0.5, 1, 0.55, 0.5, 0.25);
        break;
      case 'qfull':
        break;
      case 'atk':
        if (f.what === 'spit' || f.what === 'boss_spit' || f.what === 'boss_spit5') sfx.spit(this.pan(f.x));
        else if (f.what === 'boss_summon') sfx.bossRoar();
        break;
    }
  }

  // ---------------------------------------------------------------- рисование

  private layoutCamera(): void {
    const vfov = (2 * Math.atan(HFOV_HALF_TAN / this.aspect) * 180) / Math.PI;
    if (Math.abs(this.camera.fov - vfov) > 0.01 || this.camera.aspect !== this.aspect) {
      this.camera.fov = vfov;
      this.camera.aspect = this.aspect;
      this.camera.updateProjectionMatrix();
    }
    const dist = CAM_DIST * (1 + 0.08 * this.bossZoom);
    const sh = Math.min(SHAKE_MAX, this.shake) * 0.32;
    const sx = sh > 0 ? (Math.sin(this.time * 71) + Math.sin(this.time * 43)) * sh : 0;
    const sz = sh > 0 ? (Math.sin(this.time * 59) + Math.sin(this.time * 37)) * sh : 0;
    const tx = this.camX + sx;
    const tz = this.camZ + CAM_LOOK_Z + sz;
    this.camera.position.set(tx, Math.sin(CAM_PITCH) * dist, tz + Math.cos(CAM_PITCH) * dist);
    this.camera.lookAt(tx, 0, tz);
    this.camera.updateMatrixWorld();
  }

  private draw(now: number, dt: number): void {
    const v = this.view;
    const time = this.time;
    const alpha = Math.min(1, this.acc / DT);
    // герой: интерполяция и камера
    let hx = this.camX;
    let hz = this.camZ;
    if (v) {
      const ph = this.prevHero;
      hx = this.heroUX - wrap(v.hero.x - ph.x) * (1 - alpha);
      hz = this.heroUZ - wrap(v.hero.z - ph.z) * (1 - alpha);
      const k = 1 - Math.exp(-dt * 9);
      this.camX += (hx - this.camX) * k;
      this.camZ += (hz - this.camZ) * k;
      // камера ушла далеко от начала — сдвинуть всё на 240 (кадр не меняется)
      if (Math.abs(this.camX) > 480) {
        const s = Math.sign(this.camX) * L;
        this.camX -= s;
        this.heroUX -= s;
        hx -= s;
      }
      if (Math.abs(this.camZ) > 480) {
        const s = Math.sign(this.camZ) * L;
        this.camZ -= s;
        this.heroUZ -= s;
        hz -= s;
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.bossZoom += ((v && v.bosses.length > 0 ? 1 : 0) - this.bossZoom) * Math.min(1, dt * 1.5);
    this.drawHX = hx;
    this.drawHZ = hz;
    this.layoutCamera();
    this.world?.update(this.camX, this.camZ, time);
    const still = this.paused || this.d.input.blocked || !!this.run?.frozen;
    this.pool.step(still ? 0 : dt * (this.hitStop > 0 ? 0 : this.slowT > 0 ? this.slowK : 1));
    const wt = this.wtime;

    const cx = this.camX;
    const cz = this.camZ;
    const X = (x: number): number => cx + wrap(x - cx);
    const Z = (z: number): number => cz + wrap(z - cz);
    const near = (x: number, z: number, m = 0): boolean => Math.abs(wrap(x - cx)) < VIEW_X + m && Math.abs(wrap(z - cz)) < VIEW_Z + m;

    this.decN.begin(time);
    this.decA.begin(time);
    this.bbN.begin(this.camera);
    this.bbA.begin(this.camera);
    this.mobs.begin();
    this.buildings.begin();

    if (v) {
      const tick = v.tick;
      // враги
      for (const e of v.enemies) {
        if (!near(e.x, e.z, 2)) continue;
        const p = this.prev.get(e.id);
        let x = e.x;
        let z = e.z;
        let yaw = e.yaw;
        let spd = 0;
        if (p) {
          const dx = wrap(e.x - p.x);
          const dz = wrap(e.z - p.z);
          x = p.x + dx * alpha;
          z = p.z + dz * alpha;
          let dy = e.yaw - p.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          yaw = p.yaw + dy * alpha;
          spd = Math.hypot(dx, dz) * DG_HZ;
        }
        const fs = this.firstSeen.get(e.id) ?? 0;
        const born = Math.min(1, (wt - fs) / 0.3);
        const fl = this.flashAt.get(e.id);
        // вспышка попадания — не добела: под лучом и светляками враги иначе сплошь белые
        const flash = fl !== undefined && wt - fl < 0.07 ? 0.6 : 0;
        const hit = this.hitAt.get(e.id);
        const hitT = hit !== undefined ? wt - hit : 9;
        let key: ClipKey = 'walk';
        let t = wt * Math.max(0.5, Math.min(2.2, spd / WALK_REF[e.kind])) + (e.id % 17) * 0.137;
        if (e.act === ACT_SPECIAL) {
          key = 'special';
          t = (tick - e.actAt + alpha) * DT;
        } else if (e.act === ACT_ATTACK || e.act === ACT_LOOP) {
          // атака вплотную и таран — по кругу
          key = e.act === ACT_ATTACK ? 'attack' : 'special';
          t = ((tick - e.actAt + alpha) * DT) % Math.max(0.2, this.mobs.duration(e.kind, key));
        } else if (e.act === ACT_STUN) t = (e.id % 7) * 0.1;
        const over: ClipKey | null = hitT < 0.33 ? 'hit' : null;
        const s = (e.elite && e.kind !== 'barrel' && e.kind !== 'shaman' ? 1.35 : 1) * (0.2 + 0.8 * born);
        this.mobs.push(e.kind, X(x), born < 1 ? -0.4 * (1 - born) : 0, Z(z), yaw, key, t, flash, s, over, hitT, over ? 0.65 * (1 - hitT / 0.33) : 0, e.rage ?? 0);
        const r = e.elite ? 1.3 : e.kind === 'rat' || e.kind === 'slimelet' || e.kind === 'larva' ? 0.42 : e.kind === 'bat' ? 0.38 : 0.62;
        this.decN.add(X(x), 0.02, Z(z), r * 1.7, r * 1.7, 0, D_SHADOW, 0, 0, 0.02, 0.01, 0.02, 0.85);
        // светящиеся глаза у края экрана (сиреневые точки) — элите ореол
        if (e.elite) this.decA.add(X(x), 0.05, Z(z), 2.4, 2.4, 0, D_SOFT, 1.6, 0, 0.55, 0.25, 0.8, 0.5);
      }
      // трупы: клип смерти, потом исчезают
      this.corpses = this.corpses.filter((c) => wt - c.t < c.dur);
      for (const c of this.corpses) {
        if (!near(c.x, c.z, 2)) continue;
        this.mobs.push(c.kind, X(c.x), 0, Z(c.z), c.yaw, 'death', wt - c.t, 0, c.elite && c.kind !== 'barrel' && c.kind !== 'shaman' ? 1.35 : 1);
      }
      // герой
      const h = v.hero;
      const ph = this.prevHero;
      const hyaw = ph.yaw + Math.atan2(Math.sin(h.yaw - ph.yaw), Math.cos(h.yaw - ph.yaw)) * alpha;
      if (this.ended) this.lanternK = Math.max(0, this.lanternK - dt * 0.6);
      if (h.qCharge >= 0 && !this.hero.isCharging) this.hero.chargeStart();
      this.hero.update(still ? 0 : dt, hx, hz, hyaw, still ? 0 : h.speed, h.qCharge >= 0, h.invuln, time, this.lanternK, h.y);
      this.decN.add(hx, 0.02, hz, 0.95 / (1 + h.y * 0.3), 0.95 / (1 + h.y * 0.3), 0, D_SHADOW, 0, 0, 0.02, 0.01, 0.01, 0.85);
      // Маяк: два крутящихся луча из героя
      for (let i = 0; i < v.rays.length; i++) {
        const r = v.rays[i];
        const p = this.prevRays[i];
        const yaw = p ? p.yaw + Math.atan2(Math.sin(r.yaw - p.yaw), Math.cos(r.yaw - p.yaw)) * alpha : r.yaw;
        this.decA.add(hx, 0.06, hz, r.w * 0.6, r.len, yaw, D_BEAM, 0, 0, 1, 0.95, 0.7, 0.75);
        if (!still && this.pool.rnd() < 0.4) {
          const k = 2 + this.pool.rnd() * (r.len - 2);
          this.pool.spark(hx + Math.sin(yaw) * k, 0.4, hz + Math.cos(yaw) * k, 0, 0.8, 0, 0.3, 0.4, A_SOFT, 1, 0.9, 0.6);
        }
      }
      // заряд Q: янтарное кольцо растёт до радиуса удара, полный — белое
      if (h.qCharge >= 0) {
        const r = 2.5 + 2.5 * h.qCharge;
        const full = h.qCharge >= 1;
        this.decA.add(hx, 0.05, hz, r, r, 0, D_RING, 0.93, 0.05, 1, full ? 0.95 : 0.65, full ? 0.85 : 0.25, full ? 0.9 + 0.1 * Math.sin(time * 30) : 0.7);
        this.decA.add(hx, 0.05, hz, r, r, 0, D_SOFT, 2.5, 0, 1, 0.6, 0.2, 0.18 + 0.2 * h.qCharge);
        // риски тапа и полного удара
        this.decA.add(hx, 0.05, hz, 2.5, 2.5, 0, D_RING, 0.95, 0.03, 1, 0.75, 0.35, 0.35);
        this.decA.add(hx, 0.05, hz, 5, 5, 0, D_RING, 0.97, 0.02, 1, 0.75, 0.35, 0.35);
        this.d.sfx.qCharge(true);
        if (full && !this.lastQFull) this.d.sfx.qFull();
        this.lastQFull = full;
      } else {
        this.d.sfx.qCharge(false);
        this.lastQFull = false;
      }
      // готовность рывка и Q — щелчок
      const dashReady = v.dash01 >= 1;
      if (dashReady && !this.lastDashReady) this.d.sfx.dashReady();
      this.lastDashReady = dashReady;
      const qReady = v.q01 >= 1;
      if (qReady && !this.lastQReady) this.d.sfx.qReady();
      this.lastQReady = qReady;
      // боссы (у Близнецов два): у каждого своя модель, интерполяция и нора
      for (const b of v.bosses) {
        let bv = this.bossViews.get(b.id);
        if (!bv) {
          bv = this.bossSpare.pop() ?? this.makeBossView();
          this.bossViews.set(b.id, bv);
        }
        const pb = this.prevBosses.get(b.id) ?? b;
        const bx = X(pb.x + wrap(b.x - pb.x) * alpha);
        const bz = Z(pb.z + wrap(b.z - pb.z) * alpha);
        bv.update(still ? 0 : dt, b, bx, bz, (tick - b.animAt + alpha) * DT);
        const k = b.scale;
        if (b.anim === 'under') {
          // бугор по полу: тёмное пятно, трещины и пыль
          this.decN.add(bx, 0.03, bz, 2.6 * k, 2.6 * k, time, D_SPLAT, 0, 0, 0.1, 0.07, 0.05, 0.7, 3.1);
          if (!still && this.pool.rnd() < 0.5) this.pool.burst(bx, 0.2, bz, 2, 2.5, A_SOFT, 0.45, 0.38, 0.3, 0.6, 0.5, false, 6, 1.8);
        } else {
          // нора: (0, 0, −4,6) модели
          const s = Math.sin(b.yaw);
          const c = Math.cos(b.yaw);
          this.decN.add(bx - s * 4.6 * k, 0.03, bz - c * 4.6 * k, 3 * k, 3.6 * k, b.yaw, D_SPLAT, 0, 0, 0.05, 0.03, 0.03, 0.9, 7.7);
          this.decA.add(bx, 0.06, bz, 7 * k, 7 * k, 0, D_SOFT, 1.8, 0, 0.5, 0.2, 0.75, 0.45);
        }
      }
      // боссов, которых уже нет в забеге, — прячем, модель в запас
      if (this.bossViews.size > v.bosses.length) {
        for (const [id, bv] of this.bossViews) {
          if (v.bosses.some((b) => b.id === id)) continue;
          bv.update(dt, null, 0, 0, 0);
          this.bossViews.delete(id);
          this.bossSpare.push(bv);
        }
      }
      // постройки рядом
      for (const bd of v.buildings) {
        if (!near(bd.x, bd.z, 6)) continue;
        const x = X(bd.x);
        const z = Z(bd.z);
        this.buildings.add(bd, x, z, time);
        const fl = 0.85 + 0.15 * Math.sin(time * 9 + bd.id);
        if (bd.kind === 'brazier' && bd.s > 0) this.decA.add(x, 0.05, z, 4, 4, 0, D_SOFT, 1.5, 0, 1, 0.55, 0.2, 0.55 * fl);
        else if (bd.kind === 'lamppost' && bd.on) this.decA.add(x, 0.05, z, 7, 7, 0, D_SOFT, 1.6, 0, 1, 0.65, 0.3, 0.5 * fl);
        else if (bd.kind === 'altar' && bd.s >= 1) this.decA.add(x, 0.05, z, 5, 5, 0, D_SOFT, 1.4, 0, 1, 0.8, 0.35, 0.55 + 0.15 * Math.sin(time * 3));
        else if (bd.kind === 'spring') this.decA.add(x, 0.05, z, 4, 4, 0, D_SOFT, 1.5, 0, 0.3, 0.8, 0.75, 0.25 + 0.3 * bd.s);
        else if (bd.kind === 'chest' && bd.s > 0 && bd.on) this.decA.add(x, 0.05, z, 4, 4, 0, D_SOFT, 1.5, 0, 0.6, 0.25, 0.85, 0.5 * fl);
        else if (bd.kind === 'keg' && bd.on) this.decA.add(x, 0.05, z, 2, 2, 0, D_SOFT, 1.5, 0, 1, 0.3, 0.1, 0.6 * fl);
        else if (bd.kind === 'forge') this.decA.add(x, 0.05, z, 4, 4, 0, D_SOFT, 1.5, 0, 1, 0.45, 0.15, 0.5 * fl);
      }
      this.zones.draw(this.run, this.camera, X, Z, this.decN, this.decA, this.pool, time, still, dt);
      // метки, лужи
      for (const t of v.teles) {
        if (!near(t.x, t.z, 18)) continue;
        const col = t.tone === 'jam' ? [0.78, 0.45, 1] : t.tone === 'red' ? [1, 0.25, 0.2] : [1, 0.75, 0.3];
        const shape = t.shape === 'circle' ? D_TCIRCLE : t.shape === 'strip' ? D_TSTRIP : D_TSECTOR;
        const sx = t.shape === 'strip' ? t.w / 2 : t.r;
        this.decN.add(X(t.x), 0.04, Z(t.z), sx, t.shape === 'strip' ? t.r : t.r, t.yaw, shape, t.t01, t.shape === 'sector' ? t.w : 0, col[0], col[1], col[2], 0.85);
      }
      for (const p of v.puddles) {
        if (!near(p.x, p.z, 6)) continue;
        const spore = p.kind === 'spore';
        const a = Math.min(1, p.life * 3);
        this.decN.add(X(p.x), 0.03, Z(p.z), p.r, p.r, 0, D_PUDDLE, spore ? 0.2 : 1, 0, spore ? 0.55 : 0.32, spore ? 0.6 : 0.09, spore ? 0.35 : 0.45, (spore ? 0.45 : 0.85) * a, p.id * 1.37);
        if (spore && !still && this.pool.rnd() < 0.15) this.pool.spark(X(p.x) + (this.pool.rnd() - 0.5) * p.r * 1.5, 0.3, Z(p.z) + (this.pool.rnd() - 0.5) * p.r * 1.5, 0, 0.5, 0, 1.2, 0.35, A_SOFT, 0.6, 0.65, 0.35, false);
      }
      // снаряды
      for (const im of this.projMeshes.values()) im.count = 0;
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      const pv = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      for (const pr of v.projectiles) {
        if (!near(pr.x, pr.z, 3)) continue;
        const im = this.projMeshes.get(pr.kind);
        if (!im || im.count >= im.instanceMatrix.count) continue;
        const p = this.prev.get(-1000000 - pr.id);
        const x = X(p ? p.x + wrap(pr.x - p.x) * alpha : pr.x);
        const z = Z(p ? p.z + wrap(pr.z - p.z) * alpha : pr.z);
        q.setFromAxisAngle(up, pr.yaw);
        pv.set(x, pr.y, z);
        m4.compose(pv, q, one);
        im.setMatrixAt(im.count++, m4);
        if (pr.kind === 'ember') this.bbA.add(x, pr.y, z, 1.1, 1.1, 0, A_SOFT, 1, 0.55, 0.2, 0.9);
        else if (pr.kind === 'firefly') this.bbA.add(x, pr.y, z, 0.9, 0.9, 0, A_SOFT, 0.8, 1, 0.35, 0.9);
        else if (pr.kind === 'spit') this.bbA.add(x, pr.y, z, 1, 1, 0, A_SOFT, 0.6, 0.25, 0.9, 0.7);
        if (pr.kind === 'rock' || pr.kind === 'spit') this.decN.add(x, 0.025, z, 0.6, 0.6, 0, D_SHADOW, 0, 0, 0, 0, 0, 0.5);
        if (pr.kind === 'ember' && !still && this.pool.rnd() < 0.5) this.pool.spark(x, pr.y, z, 0, 0.2, 0, 0.25, 0.35, A_SOFT, 1, 0.5, 0.15);
      }
      for (const im of this.projMeshes.values()) {
        im.visible = im.count > 0;
        if (im.count) im.instanceMatrix.needsUpdate = true;
      }
      // подборы: осколки инстансами, прочее — значками
      let gn = 0;
      const gc = new THREE.Color();
      for (const pk of v.pickups) {
        if (!near(pk.x, pk.z, 2)) continue;
        const p = this.prev.get(-2000000 - pk.id);
        const x = X(p ? p.x + wrap(pk.x - p.x) * alpha : pk.x);
        const z = Z(p ? p.z + wrap(pk.z - p.z) * alpha : pk.z);
        const bob = 0.45 + Math.sin(time * 3 + pk.id) * 0.1;
        if (pk.kind.startsWith('gem')) {
          if (gn >= 700) continue;
          // у героя осколок втягивается: тает в последние 1,4 м
          const near01 = Math.min(1, Math.hypot(x - hx, z - hz) / 1.4);
          const big = (pk.kind === 'gem25' ? 1.9 : pk.kind === 'gem5' ? 1.35 : 1) * (0.25 + 0.75 * near01);
          q.setFromAxisAngle(up, time * 2 + pk.id);
          pv.set(x, bob, z);
          m4.compose(pv, q, new THREE.Vector3(big, big, big));
          this.gems.setMatrixAt(gn, m4);
          if (pk.kind === 'gem25') gc.setRGB(1.4, 1.0, 0.4);
          else if (pk.kind === 'gem5') gc.setRGB(0.5, 1.5, 1.1);
          else gc.setRGB(0.35, 1.2, 1.1);
          this.gems.setColorAt(gn, gc);
          gn++;
          this.bbA.add(x, bob, z, 0.7 * big, 0.7 * big, 0, A_SOFT, gc.r * 0.4, gc.g * 0.4, gc.b * 0.4, 0.7);
        } else if (pk.kind === 'chest' && pk.src) this.buildings.chest(pk.src, x, z, pk.id, time, this.decA);
        else {
          const cell = ICONS[pk.kind] ?? ICONS.chest;
          this.bbN.add(x, 0.9 + Math.sin(time * 3 + pk.id) * 0.12, z, 1.1, 1.1, 0, cell, 1, 1, 1, 1);
          this.decA.add(x, 0.05, z, 1.4, 1.4, 0, D_RING, 0.7, 0.15, 1, 0.85, 0.4, 0.6 + 0.3 * Math.sin(time * 4));
        }
      }
      this.gems.count = gn;
      this.gems.visible = gn > 0;
      if (gn) {
        this.gems.instanceMatrix.needsUpdate = true;
        this.gems.instanceColor!.needsUpdate = true;
      }
    }
    // эффекты во времени
    for (const d of this.pool.decals) {
      if (!near(d.x, d.z, 10)) continue;
      const k = 1 - d.life / d.max;
      const r = d.r0 + (d.r1 - d.r0) * Math.min(1, k * (d.shape === D_SPLAT ? 6 : 1));
      const fade = d.shape === D_SPLAT ? Math.min(1, (d.life / d.max) * 2.5) : 1 - k;
      const target = d.add ? this.decA : this.decN;
      if (d.shape === D_BEAM) target.add(X(d.x), 0.055, Z(d.z), r, d.len, d.yaw, d.shape, d.p1, d.p2, d.r, d.g, d.b, d.a * fade);
      else target.add(X(d.x), d.add ? 0.055 : 0.028, Z(d.z), r, r, d.yaw, d.shape, d.p1, d.p2, d.r, d.g, d.b, d.a * fade, d.seed);
    }
    for (const p of this.pool.parts) {
      const a = Math.min(1, (p.life / p.max) * 2);
      (p.add ? this.bbA : this.bbN).add(X(p.x), p.y, Z(p.z), p.size, p.size, 0, p.cell, p.r, p.gg, p.b, a);
    }
    for (const n of this.pool.nums) this.drawNumber(X(n.x), n.y, Z(n.z), n.n, n.big, n.r, n.g, n.b, Math.min(1, n.life * 4));

    this.mobs.end();
    this.buildings.end();
    this.decN.end();
    this.decA.end();
    this.bbN.end();
    this.bbA.end();

    this.d.renderer.render(this.scene, this.camera, 1);
    if (v) this.hudFrame(v, now);
  }

  private drawNumber(x: number, y: number, z: number, n: number, big: boolean, r: number, g: number, b: number, a: number): void {
    const s = String(n);
    const w = big ? 0.62 : 0.4;
    const x0 = -((s.length - 1) * w * 0.62) / 2;
    const right = (this.bbN.mat.uniforms.uRight.value as THREE.Vector3);
    for (let i = 0; i < s.length; i++) {
      const o = x0 + i * w * 0.62;
      this.bbN.add(x + right.x * o, y + right.y * o, z + right.z * o, w, w, 0, s.charCodeAt(i) - 48, r, g, b, a);
    }
  }

  private hudFrame(v: DgView, now: number): void {
    const hud = this.d.hud;
    hud.frame({
      stage: v.stage,
      wave: v.wave,
      timeLeft: v.timeLeft,
      squadLeft: v.squadLeft,
      squadTotal: v.squadTotal,
      hp: Math.ceil(v.hero.hp),
      hpMax: v.hero.hpMax,
      level: v.level,
      xp01: v.xp01,
      kills: v.kills,
      buffs: v.buffs,
      weapons: v.weapons,
      passives: v.passives,
      weaponSlots: 5,
      passiveSlots: 5,
      dash01: v.dash01,
      q01: v.q01,
      qCharge: v.hero.qCharge,
      dashLeft: v.dashLeft,
      qLeft: v.qLeft,
      boss: this.bossHud(v),
      breather: v.breather,
      old: v.old,
      alarm: v.alarm,
      lowHp: v.hero.hp < v.hero.hpMax * 0.25 && !v.hero.dead,
    }, now);
    hud.arrows(this.arrows(v));
    if (now - this.radarAt >= 80 || now < this.radarAt) {
      this.radarAt = now;
      this.radar(v, this.drawHX, this.drawHZ);
    }
    if (this.ended && this.endShownAt > 0 && this.time >= this.endShownAt) {
      this.endShownAt = -1;
      this.results ??= this.buildResults();
      hud.results(this.results);
    }
  }

  private buildResults(): HudResults {
    const v = this.view!;
    const r = this.run!.result();
    const dmg = Object.entries(r.dmg)
      .map(([id, n]) => ({ id, icon: WEAPONS[id]?.icon ?? (id === 'q' ? '💥' : '•'), name: WEAPONS[id]?.name ?? (id === 'q' ? 'Удар Q' : id), n: Math.round(n) }))
      .sort((a, b) => b.n - a.n);
    return {
      waves: r.waves,
      ms: r.ms,
      newBest: false,
      weekRank: 0,
      coins: [],
      coinsTotal: 0,
      killedBy: v.killedBy ? `Тебя одолел ${v.killedBy} на ${v.wave}-й волне` : '',
      weapons: v.weapons,
      passives: v.passives,
      dmg,
      kills: v.kills,
      level: v.level,
      chests: v.chests,
      pending: true,
    };
  }

  /**
   * Стрелки к целям за кадром: по одной ближайшей цели каждого вида (элит — до двух), у каждого вида своя дальность и
   * условие (родник — когда ранен, кузня — когда хватает опыта, жаровня — когда мало HP). Не больше ARROW_MAX, важные
   * первыми. Направление — на экране от центра кадра (с учётом наклона камеры).
   */
  private arrows(v: DgView): HudArrow[] {
    const hx = v.hero.x;
    const hz = v.hero.z;
    type Cand = { id: string; kind: HudPoiKind; x: number; z: number; pr: number; d: number };
    const cands: Cand[] = [];
    const dist = (x: number, z: number): number => Math.hypot(wrap(x - hx), wrap(z - hz));
    const hp01 = v.hero.hp / Math.max(1, v.hero.hpMax);
    for (const b of v.bosses) if (b.anim !== 'under') cands.push({ id: `boss${b.id}`, kind: 'boss', x: b.x, z: b.z, pr: 0, d: dist(b.x, b.z) });
    const elites = v.enemies.filter((e) => e.elite).map((e) => ({ e, d: dist(e.x, e.z) })).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const { e, d } of elites) cands.push({ id: `e${e.id}`, kind: 'elite', x: e.x, z: e.z, pr: 1, d });
    let chest: Cand | null = null;
    for (const p of v.pickups) {
      if (p.kind !== 'chest') continue;
      const d = dist(p.x, p.z);
      if (d < 160 && (!chest || d < chest.d)) chest = { id: `c${p.id}`, kind: 'chest', x: p.x, z: p.z, pr: 2, d };
    }
    if (chest) cands.push(chest);
    // постройки: [вид в HUD, приоритет, дальность, годится ли]
    const rules: Partial<Record<BuildingKind, [HudPoiKind, number, number, (b: VBuilding) => boolean]>> = {
      spring: ['spring', hp01 < 0.35 ? 1 : 3, 140, (b) => hp01 < 0.7 && b.s > 0.25],
      chest: ['cursed', 4, 110, (b) => b.s > 0],
      altar: ['altar', 5, 100, (b) => b.s >= 1],
      forge: ['forge', 6, 110, (b) => b.s > 0 && v.xp01 >= 0.5],
      minecart: ['cart', 7, 70, (b) => !b.on],
      keg: ['keg', 8, 55, (b) => !b.on],
      lamppost: ['lamp', 9, 50, (b) => !b.on],
      trampoline: ['tramp', 10, 40, (b) => b.s > 0],
      brazier: ['brazier', 11, 40, (b) => b.s > 0 && hp01 < 0.5],
    };
    const best = new Map<HudPoiKind, Cand>();
    for (const b of v.buildings) {
      const r = rules[b.kind];
      if (!r || !r[3](b)) continue;
      const d = dist(b.x, b.z);
      if (d > r[2]) continue;
      const cur = best.get(r[0]);
      if (!cur || d < cur.d) best.set(r[0], { id: `b${b.id}`, kind: r[0], x: b.x, z: b.z, pr: r[1], d });
    }
    cands.push(...best.values());
    cands.sort((a, b) => a.pr - b.pr || a.d - b.d);
    // на экране или нет и направление от центра кадра
    const cam = this.camera;
    const vec = this.tmpV;
    const lookX = this.camX;
    const lookZ = this.camZ + CAM_LOOK_Z;
    vec.set(lookX, 0, lookZ).project(cam);
    const c0x = vec.x;
    const c0y = vec.y;
    const out: HudArrow[] = [];
    for (const c of cands) {
      if (out.length >= ARROW_MAX) break;
      const dx = wrap(c.x - lookX);
      const dz = wrap(c.z - lookZ);
      vec.set(lookX + dx, 0.6, lookZ + dz).project(cam);
      if (Math.abs(vec.x) < 0.9 && Math.abs(vec.y) < 0.86 && vec.z < 1) continue;
      const n = Math.hypot(dx, dz) || 1;
      vec.set(lookX + (dx / n) * 8, 0, lookZ + (dz / n) * 8).project(cam);
      const angle = Math.atan2(-(vec.y - c0y) * this.vh, (vec.x - c0x) * this.vw);
      out.push({ id: c.id, kind: c.kind, angle, dist: c.d });
    }
    return out;
  }

  /** Радар: враги точками (с потолком), элиты и боссы, постройки и сундуки, рамка кадра; 12 раз в секунду */
  private radar(v: DgView, hx: number, hz: number): void {
    const R = RADAR_RANGE;
    const x0 = v.hero.x;
    const z0 = v.hero.z;
    const mobs: number[] = [];
    const elites: number[] = [];
    const bosses: number[] = [];
    for (const e of v.enemies) {
      const dx = wrap(e.x - x0);
      const dz = wrap(e.z - z0);
      if (e.elite) {
        if (elites.length < 16) elites.push(dx, dz);
        continue;
      }
      if (mobs.length >= RADAR_MOBS * 2 || Math.abs(dx) > R || Math.abs(dz) > R) continue;
      mobs.push(dx, dz);
    }
    for (const b of v.bosses) bosses.push(wrap(b.x - x0), wrap(b.z - z0));
    const pois: HudRadar['pois'] = [];
    const POI_OF: Record<BuildingKind, HudPoiKind> = {
      altar: 'altar', brazier: 'brazier', chest: 'cursed', spring: 'spring', lamppost: 'lamp', minecart: 'cart', keg: 'keg', trampoline: 'tramp', forge: 'forge',
    };
    for (const b of v.buildings) {
      const dx = wrap(b.x - x0);
      const dz = wrap(b.z - z0);
      if (dx * dx + dz * dz > R * R * 1.1) continue;
      const kind = POI_OF[b.kind];
      const on = b.kind === 'altar' ? b.s >= 1 : b.kind === 'spring' ? b.s > 0.25 : b.kind === 'lamppost' ? b.on : b.kind === 'keg' ? !b.on : b.kind === 'minecart' ? true : b.s > 0;
      pois.push({ kind, x: dx, z: dz, on });
    }
    for (const p of v.pickups) if (p.kind === 'chest') pois.push({ kind: 'chest', x: wrap(p.x - x0), z: wrap(p.z - z0), on: true });
    // углы кадра на полу (несвёрнутые координаты камеры) относительно героя
    const view: number[] = [];
    const cam = this.camera;
    const o = cam.position;
    for (const [nx, ny] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
      this.tmpV.set(nx, ny, 0.5).unproject(cam).sub(o);
      const t = this.tmpV.y < -1e-3 ? -o.y / this.tmpV.y : 200;
      view.push(o.x + this.tmpV.x * t - hx, o.z + this.tmpV.z * t - hz);
    }
    this.d.hud.radar({ range: R, yaw: v.hero.yaw, mobs, elites, bosses, pois, view });
  }

  resize(w: number, h: number): void {
    this.aspect = w / Math.max(1, h);
    this.vw = w / 2;
    this.vh = h / 2;
  }

  debugState(): Record<string, unknown> {
    const v = this.view;
    return {
      dungeon: v ? { tick: v.tick, stage: v.stage, wave: v.wave, enemies: v.enemies.length, drawnMobs: this.mobs.drawn, hp: v.hero.hp, level: v.level, cards: !!v.cards, paused: this.paused, ended: this.ended, journal: this.journal.total, pending: this.journal.pending, seed: this.seed, steps: this.steps } : null,
    };
  }

  /** Прыжок героя по карте (отладка) */
  get heroDraw(): { x: number; z: number } {
    return { x: this.heroUX, z: this.heroUZ };
  }

  plural(n: number): string {
    return `${n} ${plural(n, 'волну', 'волны', 'волн')}`;
  }
}

/** Кирка: рукоять и железо, цвета в вершинах */
function pickaxeGeo(): THREE.BufferGeometry {
  const paint = (g: THREE.BufferGeometry, c: number): THREE.BufferGeometry => {
    const col = new THREE.Color(c);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const handle = paint(new THREE.BoxGeometry(0.09, 0.09, 1.0), 0x7a5232);
  const head = paint(new THREE.BoxGeometry(0.95, 0.1, 0.12).translate(0, 0, 0.45), 0x9aa0a8);
  return mergeGeometries([handle, head], false)!;
}
