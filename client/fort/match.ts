// Игра в крепости на клиенте: предсказание своего движения (тот же stepPlayer, что на сервере, и ворота в мире
// коллизий — по хвосту снимка), чужие защитники — интерполяцией, орда — zombies3d.ts, свой выстрел — сразу по тем же
// формулам, что у сервера (shared/fortaim.ts, цели — зомби на «часах отрисовки»), события (попадания, сбитые,
// удары по воротам и кристаллу, лавка, краскомёты, колокол), камера над плечом, звук, интерфейс и подсказки у стоек.
// Один объект на одно посещение крепости.
import * as THREE from 'three';
import { DASH_COOLDOWN_TICKS, EYE_HEIGHT, TICK_MS, TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import { AIM_FALLBACK, PIVOT_Y, RIG_PB, RIG_PB_ADS, cameraRig, type RigParams, type V3 } from '../../shared/aim.ts';
import {
  BUY_ANTIAIR, BUY_CRYSTAL, BUY_JAM, BUY_MAGAZINE, BUY_TURRET, CRYSTAL_FIX, CRYSTAL_HP, CRYSTAL_PRICE, FIX_HP, FIX_PRICE, FORT_HP, FORT_MAX_ALIVE, FORT_MAGAZINE,
  FORT_MIN_DELAY, FORT_RESPAWN_TICKS, FT_BREAK, FT_END, FT_GATHER, FT_WAVE, GATE_HP, JAM_PRICE, NEWGATE_PRICE, TURRET_PRICE, WAVE_PTS, ZK,
  Z_BLOATER, Z_BOSS, Z_BRUTE, Z_RUNNER, ZS_BOSS_OPEN, ZS_FLY_WARN, ZS_BOSS_GATE, ZS_BOSS_PULSE, isBossKind,
  ZS_BARREL, ZS_KRAKEN_SPIT, ZS_PLANT, ZS_SPIT, ZS_THROW, Z_FLYER, Z_SAPPER, Z_SPITTER, Z_RAM, Z_GOLEM,
  ZS_CHARGE, ZS_CHARGE_WARN, ZS_HOWL, ZS_QUAKE, ZS_STOMP, Z_BOAT, ZS_BOAT, ZS_BOAT_LEAVE,
  type FortEvent, type FortPlayerRow, type FortResultRow, type FortRunRec, type FortWaveCard, type FtReward,
} from '../../shared/fort.ts';
import { ZF_RAGE } from '../../shared/fortnet.ts';
import { afterFortWeapon, beforeFortWeapon } from '../../shared/fortweapon.ts';
import { FT_STRIDE, fortAimPoint, fortShotDir, nearestZombie } from '../../shared/fortaim.ts';
import { CRYSTAL, GATE, type FortMap, type FortStation } from '../../shared/fortmap.ts';
import { decodeFortTail, makeFortTail, type ZombieSnap } from '../../shared/fortnet.ts';
import { clamp, damp, viewDir, wrapAngle } from '../../shared/math.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { PALETTE } from '../../shared/outfit.ts';
import { E_ADS, E_ALIVE, E_DASH, E_GROUNDED, E_RELOAD, SNAP_HAS_SELF, SNAP_SELF_RESET, decodeSnapshot, encodeInputs, makeHeader, type EntitySnap } from '../../shared/protocol.ts';
import { BTN_ADS, BTN_SHOULDER, MAG_SIZE, RELOAD_TICKS, SHOT_RANGE, currentSpread, makeInput, makeState, type Input, type PlayerState, type StepEvents } from '../../shared/sim.ts';
import { CollisionWorld, makeRayHit } from '../../shared/world.ts';
import type { Sound } from '../audio.ts';
import type { Chat } from '../chat.ts';
import type { Input as InputDevice } from '../input.ts';
import { ClockSync, type Net } from '../net.ts';
import { Predictor } from '../predict.ts';
import { RemoteTrack, type RemoteSample } from '../remote.ts';
import { Avatar, tickAvatarShared, type AvatarPose } from '../render/avatar.ts';
import type { Effects } from '../render/effects.ts';
import { narrowFov } from '../render/renderer.ts';
import type { MeState } from '../scene.ts';
import type { Settings } from '../settings.ts';
import { TOUCH } from '../touch.ts';
import type { FortHud, MapDot } from './hud.ts';
import type { FortWorld } from './world.ts';
import type { Zombies3D } from './zombies3d.ts';
import { PJ_GLOB, PJ_INK, PJ_METEOR, PJ_ROCK, type Projectiles } from './projectiles.ts';

export interface FortMatchDeps {
  map: FortMap;
  collision: CollisionWorld;
  world: FortWorld;
  effects: Effects;
  zombies: Zombies3D;
  /** Броски дугой (плевки, камни, чернила, метеоры); в тестах можно не давать */
  projectiles?: Projectiles;
  hud: FortHud;
  chat: Chat;
  sound: Sound;
  input: InputDevice;
  settings: Settings;
  net: Net;
  me: () => MeState;
}

interface Pose extends AvatarPose {
  valid: boolean;
}

const ADS_ZOOM = 1.25;
const BLOCK_MARGIN = 0.3;
/** Подсказка стойки — чуть ближе, чем пускает сервер (r + 0,6): нажал — точно сработает */
const STATION_PAD = 0.35;
/** Зелёная слизь зомби (клякса на «маске», когда бьют) */
const SLIME_CSS = '#8fd06a';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _look = new THREE.Vector3();
const _f = { x: 0, y: 0, z: 0 };
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export class FortMatch {
  private readonly d: FortMatchDeps;
  private readonly clock = new ClockSync(FORT_MIN_DELAY);
  private readonly predictor: Predictor;
  private readonly tracks = new Map<number, RemoteTrack>();
  private readonly avatars = new Map<number, Avatar>();
  private readonly poses = new Map<number, Pose>();
  private readonly roster = new Map<number, FortPlayerRow>();
  private rosterList: FortPlayerRow[] = [];
  private readonly header = makeHeader();
  private readonly selfSnap: PlayerState = makeState();
  private readonly ents: EntitySnap[] = [];
  private readonly sample: RemoteSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, extra: 0 };
  private readonly seen = new Set<number>();
  private readonly hit = makeRayHit();
  private readonly near = { t: 0 };
  private readonly localAvatar: Avatar;
  private readonly tail = makeFortTail();
  private readonly zlist: ZombieSnap[] = [];
  private readonly steps = new Map<number, number>();

  myId = 0;
  ready = false;
  phase = FT_GATHER;
  phaseEnd = 0;
  wave = 0;
  cleared = 0;
  private gate = GATE_HP;
  private crystal = CRYSTAL_HP;
  private turrets = 0;
  private jams = 0;
  private left = 0;
  private tailSeen = false;
  /** Карточка волны: в бою — идущей, в передышке и сборе — следующей */
  private card: FortWaveCard | null = null;

  // свой защитник
  private alive = false;
  private hp = FORT_HP;
  private respawnAt = 0;
  private deathX = 0;
  private deathY = 0;
  private deathZ = 0;
  /** Кто повалил (номер зомби) — на него смотрит камера смерти */
  private downBy = 0;
  private stepDist = 0;
  private station: FortStation | null = null;
  private shopPending: number | null = null;
  private shopPendingAt = 0;

  // тики и ввод
  private seq = 0;
  private acc = 0;
  private queueAvg = 1;
  private readonly inputs: Input[] = [makeInput()];

  // камера
  private stepSmooth = 0;
  private dip = 0;
  private dipV = 0;
  private fovKick = 0;
  private shake = 0;
  private curFov = 60;
  private camInit = false;
  private readonly camPos = new THREE.Vector3();
  private readonly camQuat = new THREE.Quaternion();
  private shoulder: 1 | -1 = 1;
  private sideSmooth = 1;
  private adsT = 0;
  private readonly rig: RigParams = { ...RIG_PB };
  private readonly camV: V3 = { x: 0, y: 0, z: 0 };
  private readonly pivot: V3 = { x: 0, y: 0, z: 0 };
  private viewYaw = 0;
  private viewPitch = 0;
  private readonly aimP: V3 = { x: 0, y: 0, z: 0 };
  private readonly tg = new Float64Array(FORT_MAX_ALIVE * FT_STRIDE);
  private readonly shotDir = { dirX: 0, dirY: 0, dirZ: -1 };

  // служебное
  private time = 0;
  private boardHeld = false;
  private fps = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private lastFrameMs = 0;
  private mapTimer = 0;
  private readonly mapZ: MapDot[] = [];
  private readonly mapM: MapDot[] = [];
  /** Когда последний раз стучали по воротам, звенел кристалл, стонал зомби, кричали «липучка» (с, по time) */
  private gateSfxAt = -9;
  private gateAlertAt = -99;
  private crysSfxAt = -9;
  private crysAlertAt = -99;
  private groanAt = 0;
  private climbAlertAt = -99;
  private clangAt = -9;
  private shieldHintAt = -99;
  private armorHintAt = -99;
  private fuseAlertAt = -99;
  private steamAt = 0;
  private wakeAt = 0;

  constructor(deps: FortMatchDeps) {
    this.d = deps;
    let extraReload = false;
    this.predictor = new Predictor(deps.collision, {
      before: (s, inp) => { extraReload = beforeFortWeapon(s, inp, Boolean(this.roster.get(this.myId)?.mag)); },
      after: (s, _inp, ev) => afterFortWeapon(s, ev, Boolean(this.roster.get(this.myId)?.mag), extraReload),
    });
    this.localAvatar = new Avatar(0, { gun: true });
    this.localAvatar.setOutfit(deps.me().outfit);
    this.localAvatar.setInfo(deps.me().nick, null, true, deps.me().level ?? 1);
    this.localAvatar.addTo(deps.world.scene);
    deps.effects.clearSplats();
    deps.zombies.clear();
    if (deps.projectiles) {
      deps.projectiles.clear();
      deps.projectiles.onLand = (kind, x, y, z) => this.onProjectileLand(kind, x, y, z);
      deps.projectiles.trail = (kind, x, y, z) => {
        if (kind === PJ_METEOR) deps.effects.puff(x, y, z, 1.1, 0xffa060, 0.5, 0.2, 0.55);
        else deps.effects.puff(x, y, z, 0.6, 0xc8bfae, 0.35, 0.1, 0.35);
      };
    }
    deps.effects.onBallHitsPlayer = () => {};
    deps.effects.onImpact = (x, y, z, kind) => {
      if (kind === 0) deps.sound.splat([x, y, z], this.camPos.distanceTo(_v.set(x, y, z)));
    };
    deps.hud.onTapUse = () => this.useStation();
    deps.hud.onShopClose = () => this.closeShop(true);
    deps.hud.onShopBuy = (id) => {
      if (!this.calm || !deps.hud.shopShown || this.shopPending !== null) return;
      this.shopPending = id;
      this.shopPendingAt = this.time;
      deps.net.send({ t: 'use', id });
    };
    deps.hud.pb.setAwp(false);
    deps.hud.pb.setBonus(null, []);
    // ворота в мире коллизий — как на сервере (пока не знаем — стоят)
    deps.collision.setEnabled(deps.map.gateBox, true);
  }

  dispose(): void {
    this.closeShop(false);
    for (const av of this.avatars.values()) av.dispose(this.d.world.scene);
    this.avatars.clear();
    this.localAvatar.dispose(this.d.world.scene);
    this.d.effects.clearSplats();
    this.d.zombies.clear();
    this.d.hud.pb.hideDeath();
    this.d.hud.hideEnd();
    this.d.hud.showBoard(false, [], 0, 0);
    this.d.hud.setHint(null, 0, false, true);
    this.d.hud.onTapUse = () => {};
    this.d.hud.onShopBuy = () => {};
    this.d.hud.onShopClose = () => {};
  }

  // ------------------------------------------------------------ клавиши

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    const { chat, input } = this.d;
    if (this.d.hud.shopShown) {
      if (code === 'Escape' && down) { e.preventDefault(); this.closeShop(true); }
      // Native dialog owns Tab traversal; scene cannot open its scoreboard behind the modal.
      return true;
    }
    if (code === 'Tab') {
      e.preventDefault();
      this.boardHeld = down;
      return true;
    }
    if (!down || chat.isOpen || !input.locked) return false;
    if (code === 'KeyQ') {
      if (!e.repeat) this.shoulder = this.shoulder > 0 ? -1 : 1;
      return true;
    }
    if (code === 'Slash') {
      e.preventDefault();
      chat.open('/');
      return true;
    }
    return false;
  }

  /** E (не ЛКМ — она стреляет): у стойки — лавка, колокол. */
  onUse(mouse: boolean): void {
    if (!mouse) this.useStation();
  }

  private useStation(): void {
    if (!this.alive || !this.station) return;
    if (this.station.kind === 'shop') {
      if (!this.calm) return;
      this.d.hud.showShop();
      this.d.input.releaseAll();
      this.d.input.blocked = true;
      this.d.input.unlock();
      return;
    }
    this.d.net.send({ t: 'use', id: this.station.id });
  }

  private closeShop(resume: boolean): void {
    if (!this.d.hud.shopShown) return;
    this.d.hud.hideShop();
    this.shopPending = null;
    this.d.input.releaseAll();
    this.d.input.blocked = this.d.chat.isOpen;
    if (resume) void this.d.input.lock();
  }

  // ------------------------------------------------------------ сеть: JSON

  onJson(m: ServerMsg): void {
    switch (m.t) {
      case 'fort':
        this.myId = m.id;
        this.predictor.seed = m.seed;
        this.phase = m.phase;
        this.phaseEnd = m.phaseEnd;
        this.wave = m.wave;
        this.card = m.card ?? null;
        this.ready = true;
        this.setRoster(m.players);
        if (m.phase === FT_GATHER) this.d.hud.pb.centerMessage('Крепость', this.gatherSub(), '', 3200);
        break;
      case 'froster':
        this.setRoster(m.players);
        break;
      case 'fev':
        if (this.ready) this.onEvents(m.e);
        break;
      case 'fphase':
        if (m.card !== undefined) this.card = m.card;
        this.onPhase(m.phase, m.end, m.wave);
        break;
      case 'fend':
        this.onEnd(m.win, m.wave, m.mvp, m.rows, m.top ?? [], m.record ?? false, m.prev ?? 0);
        break;
      case 'fortReward':
        this.onReward(m);
        break;
      case 'toast':
        if (this.d.hud.shopShown) {
          this.shopPending = null;
          this.d.hud.shopMessage(m.text);
        }
        break;
    }
  }

  private gatherSub(): string {
    return TOUCH ? 'Волна скоро · колокол на террасе — «готов»' : 'Волна скоро · E у колокола на террасе — «готов»';
  }

  private setRoster(list: FortPlayerRow[]): void {
    this.rosterList = list;
    this.roster.clear();
    for (const r of list) this.roster.set(r.id, r);
    for (const [id, av] of this.avatars) {
      const r = this.roster.get(id);
      if (r) {
        av.setInfo(r.name, null, true, r.level ?? 1);
        av.setOutfit(r.o);
      }
    }
    const me = this.roster.get(this.myId);
    if (me) {
      this.localAvatar.setInfo(me.name, null, true, me.level ?? 1);
      this.localAvatar.setOutfit(me.o);
      this.d.hud.setPoints(me.pts);
    }
  }

  private nameOf(id: number): string {
    return this.roster.get(id)?.name ?? '???';
  }

  /** Цвет краски защитника — цвет его желейки */
  private colorOf(id: number): number {
    const o = id === this.myId ? (this.roster.get(id)?.o ?? this.d.me().outfit) : this.roster.get(id)?.o;
    return o ? (PALETTE[o.c] ?? 0xff8a1c) : 0xff8a1c;
  }

  private get myPts(): number {
    return this.roster.get(this.myId)?.pts ?? 0;
  }

  private onPhase(phase: number, end: number, wave: number): void {
    const { hud, sound, effects } = this.d;
    const same = phase === this.phase && wave === this.wave;
    this.phase = phase;
    this.phaseEnd = end;
    this.wave = wave;
    if (phase !== FT_GATHER && phase !== FT_BREAK) this.closeShop(true);
    if (same) {
      // все ударили в колокол — волна раньше (в передышке ещё и +10 % золота)
      if (phase === FT_GATHER || phase === FT_BREAK) {
        hud.pb.bannerMessage(phase === FT_BREAK ? '🔔 Все готовы — волна через 3 секунды · +10 % золота за неё!' : '🔔 Все готовы — волна через 3 секунды!', 2400);
      }
      return;
    }
    if (phase === FT_GATHER) {
      hud.hideEnd();
      hud.card.reset();
      effects.clearSplats();
      hud.pb.centerMessage('Новая игра', this.gatherSub(), '', 2800);
    } else if (phase === FT_WAVE) {
      const boss = this.card && this.card.boss >= 0;
      sound.horn(boss ? 0.5 : 0.32);
      sound.zombieGroan(null, boss ? 1.2 : 0.8);
      if (this.card) hud.card.announce(this.card);
      if (boss) this.shake = Math.max(this.shake, 0.55);
    } else if (phase === FT_BREAK) {
      sound.fanfare(null);
      hud.pb.centerMessage('Волна отбита!', `+${WAVE_PTS} ⭐ · передышка — лавка открыта`, '#ffd35a', 2600);
    }
  }

  private onEnd(win: boolean, wave: number, mvp: number, rows: FortResultRow[], top: readonly FortRunRec[], record: boolean, prev: number): void {
    const { hud, sound } = this.d;
    this.phase = FT_END;
    this.card = null;
    const mvpRow = rows.find((r) => r.id === mvp) ?? null;
    hud.showEnd(win, wave, mvpRow, rows, this.myId, top, record, prev);
    if (win || (record && wave > 0)) {
      sound.fanfare(null);
      sound.applause(null);
    } else {
      sound.foolHorn(null);
    }
  }

  private onReward(r: FtReward): void {
    const parts = [`волны ${r.n} · +${r.waves}`];
    if (r.kills) parts.push(`сбитые +${r.kills}`);
    if (r.win) parts.push(`победа +${r.win}`);
    if (r.mvp) parts.push(`лучший +${r.mvp}`);
    if (r.record) parts.push(`рекорд крепости +${r.record}`);
    this.d.hud.showReward(`+${r.total} ${plural(r.total, 'жетон', 'жетона', 'жетонов')}: ${parts.join(' · ')}`);
  }

  // ------------------------------------------------------------ сеть: снимки

  onSnapshot(buf: ArrayBuffer, at: number): void {
    if (!this.ready) return;
    const n = decodeSnapshot(buf, this.header, this.selfSnap, this.ents);
    if (n < 0) return;
    const h = this.header;
    this.clock.addSample(h.tick, at);
    this.queueAvg += (h.queue - this.queueAvg) * 0.05;
    this.phase = h.phase;
    this.phaseEnd = h.phaseEnd;
    this.wave = h.scoreA;
    this.cleared = h.scoreB;
    if (!this.calm) this.closeShop(true);
    const nz = decodeFortTail(buf, h.tail + 0, this.tail, this.zlist);
    if (nz >= 0) {
      this.zlist.length = nz;
      this.applyTail();
      this.d.zombies.push(h.tick, this.zlist, nz);
    }

    let selfFlags = -1;
    this.seen.clear();
    for (let i = 0; i < n; i++) {
      const e = this.ents[i];
      if (e.id === this.myId) {
        selfFlags = e.flags;
        this.hp = e.hp;
        continue;
      }
      let tr = this.tracks.get(e.id);
      if (!tr) {
        tr = new RemoteTrack(e.id);
        this.tracks.set(e.id, tr);
      }
      tr.push(h.tick, e);
      this.seen.add(e.id);
    }
    for (const id of this.tracks.keys()) {
      if (this.seen.has(id)) continue;
      this.tracks.delete(id);
      this.poses.delete(id);
      const av = this.avatars.get(id);
      if (av) {
        av.dispose(this.d.world.scene);
        this.avatars.delete(id);
      }
    }

    const wasAlive = this.alive;
    if (selfFlags >= 0) this.alive = (selfFlags & E_ALIVE) !== 0;
    if (h.flags & SNAP_HAS_SELF) {
      if (h.flags & SNAP_SELF_RESET) {
        this.predictor.reset(this.selfSnap, h.ack);
        if (this.alive) this.onLocalSpawn();
      } else if (this.alive && wasAlive) {
        this.predictor.reconcile(h.ack, this.selfSnap);
      }
    }
    if (wasAlive && !this.alive) this.onLocalDown();
  }

  /** Хвост: ворота (и коллизия), кристалл, краскомёты, лужи; удары по воротам и кристаллу — дрожь, звук, тревога. */
  private applyTail(): void {
    const { world, hud, sound, effects, collision, map } = this.d;
    const t = this.tail;
    const props = world.props;
    const first = !this.tailSeen;
    this.tailSeen = true;
    if (!first && t.gate < this.gate && t.gate > 0) {
      props.shakeGate(Math.min(1.5, (this.gate - t.gate) / 25));
      hud.hurt('gate');
      if (this.time - this.gateSfxAt > 0.22) {
        this.gateSfxAt = this.time;
        const x = GATE.x0 + Math.random() * (GATE.x1 - GATE.x0);
        sound.gateHit([x, 1.4, GATE.face]);
        effects.burst(x, 0.8 + Math.random() * 1.6, GATE.face - 0.1, 0x9a6b42, 6, 3, 0, 0.3, -1, 0.04);
      }
      if (this.time - this.gateAlertAt > 9) {
        this.gateAlertAt = this.time;
        hud.alert(t.gate / GATE_HP < 0.35 ? '🚪 Ворота вот-вот падут!' : '🚪 Ворота ломают!');
      }
    }
    if (!first && t.crystal < this.crystal) {
      props.flashCrystal();
      hud.hurt('crys');
      if (this.time - this.crysSfxAt > 0.3) {
        this.crysSfxAt = this.time;
        sound.crystalHit([CRYSTAL.x, CRYSTAL.y, CRYSTAL.z]);
        effects.burst(CRYSTAL.x, CRYSTAL.y, CRYSTAL.z, 0x8ef0ff, 6, 3.5, 0, 0.5, 0, 0.035);
      }
      if (this.time - this.crysAlertAt > 7) {
        this.crysAlertAt = this.time;
        hud.alert(t.crystal / CRYSTAL_HP < 0.3 ? '💎 Кристалл почти разбит!' : '💎 Зомби у кристалла!');
      }
    }
    if ((t.gate > 0) !== (this.gate > 0) || first) {
      collision.setEnabled(map.gateBox, t.gate > 0);
      this.d.world.renderer.refreshShadows();
    }
    this.gate = t.gate;
    this.crystal = t.crystal;
    this.left = t.left;
    props.setGate(t.gate);
    props.setCrystal(t.crystal);
    props.setRally((t.rally ?? 0) > 0);
    if (t.turrets !== this.turrets) {
      this.turrets = t.turrets;
      props.setTurrets(t.turrets);
    }
    if (t.jams !== this.jams) {
      this.jams = t.jams;
      props.setJams(t.jams);
    }
  }

  private onLocalSpawn(): void {
    this.d.hud.pb.hideDeath();
    this.stepSmooth = 0;
    this.camInit = false;
    this.downBy = 0;
  }

  private onLocalDown(): void {
    const s = this.predictor.state;
    this.deathX = s.x;
    this.deathY = s.y;
    this.deathZ = s.z;
    const est = this.clock.estimate(performance.now());
    if (!this.respawnAt || this.respawnAt < est) this.respawnAt = est + FORT_RESPAWN_TICKS;
  }

  // ------------------------------------------------------------ события

  private onEvents(list: FortEvent[]): void {
    const { hud, sound, effects, world, zombies, chat } = this.d;
    for (const e of list) {
      switch (e[0]) {
        case 'shot': {
          const [, pid, ox, oy, oz, ex, ey, ez, kind, nx, ny, nz] = e;
          if (pid === this.myId) break; // свой уже нарисован
          const av = this.avatars.get(pid);
          let sx = ox;
          let sy = oy;
          let sz = oz;
          if (av && av.shown) {
            av.muzzle(_v);
            sx = _v.x;
            sy = _v.y;
            sz = _v.z;
            av.onShot();
            effects.puff(sx, sy, sz, 0.35, 0xffffff, 0.14, 0.3, 0.45, 1.4);
          }
          effects.shootBall(sx, sy, sz, ex, ey, ez, this.colorOf(pid), pid, { kind, nx, ny, nz, victim: 0, head: false });
          sound.shot([sx, sy, sz], this.camPos.distanceTo(_v.set(sx, sy, sz)));
          break;
        }
        case 'zhit': {
          const [, pid, zid, dmg, head, x, y, z] = e;
          zombies.hit(zid);
          // 2 — в щит (щепки), 3 — в кастрюлю Чугунка (искры и звон)
          if (head === 2) effects.burst(x, y, z, 0x9a6b42, 4, 2.5, 0, 0.5, 0, 0.035);
          else if (head === 3) {
            effects.burst(x, y, z, 0xffe08a, 5, 4, 0, 0.6, 0, 0.025);
            if (this.time - this.clangAt > 0.08) {
              this.clangAt = this.time;
              sound.clang([x, y, z]);
            }
          }
          if (pid === this.myId) {
            const isHead = head === 1;
            hud.pb.hitmarker(isHead, false);
            if (head !== 3) sound.hitmarker(isHead);
            hud.pb.damageNumber(x, y, z, dmg, isHead);
            if (head === 2 && this.time - this.shieldHintAt > 12) {
              this.shieldHintAt = this.time;
              hud.alert('🛡 Попал в щит · стреляй в голову сверху или сбоку', 2200);
            } else if (head === 3 && this.time - this.armorHintAt > 12) {
              this.armorHintAt = this.time;
              hud.alert('🍳 Кастрюля гасит урон · целься в голову', 2200);
            }
          }
          break;
        }
        case 'shield': {
          const [, , x, y, z] = e;
          effects.burst(x, y, z, 0x9a6b42, 22, 6, 0, 0.6, 0, 0.07);
          effects.burst(x, y, z, 0x4a4f55, 6, 4, 0, 0.6, 0, 0.05);
          sound.planks([x, y, z]);
          break;
        }
        case 'heal': {
          const [, , x, y, z, r] = e;
          effects.puff(x, y + 0.8, z, r * 0.9, 0x9cff9a, 0.7, 0.2, 0.35, 1.4);
          effects.burst(x, y + 1, z, 0x7dffa0, 10, 3, 0, 1, 0, 0.04);
          if (this.camPos.distanceTo(_v.set(x, y, z)) < 40) sound.heal([x, y + 1, z]);
          break;
        }
        case 'throw': {
          const [, fx, fy, fz, tx, ty, tz, ticks, what] = e;
          const kind = what === ZS_SPIT ? PJ_GLOB : what === ZS_THROW ? PJ_ROCK : what === ZS_KRAKEN_SPIT ? PJ_INK : PJ_METEOR;
          this.d.projectiles?.launch(kind, fx, fy, fz, tx, ty, tz, ticks / TICK_RATE, kind === PJ_METEOR ? 0.05 : 0.3);
          if (kind === PJ_GLOB) sound.spit([fx, fy, fz]);
          break;
        }
        case 'zdie': {
          const [, zid, killer, x, y, z, kind, tier] = e;
          zombies.kill(zid);
          const k = ZK[kind] ?? ZK[0];
          const boss = isBossKind(kind);
          if (kind === Z_BOAT) {
            // лодка потоплена: всплеск, щепки, пена
            effects.burst(x, WATER_Y + 0.3, z, 0xeaf7ff, 40, 7, 0, 1, 0, 0.09);
            effects.burst(x, WATER_Y + 0.5, z, 0x8a5a34, 22, 5, 0, 1, 0, 0.07);
            effects.puff(x, WATER_Y + 0.6, z, 3.2, 0xffffff, 1.3, 1.1, 0.6);
            sound.sink([x, WATER_Y, z]);
          } else effects.deathSplat(x, y, z, k.color);
          if (boss) {
            effects.burst(x, y + 2, z, 0xffd35a, 46, 9, 0, 1.2, 1, 0.07);
            effects.puff(x, y + 1.5, z, 5, 0xf3c6ff, 0.9, 0.9, 0.7);
            sound.fanfare([x, y + 2, z]);
            this.shake = Math.max(this.shake, 0.7);
          }
          sound.popAt([x, y + 0.8, z], this.camPos.distanceTo(_v.set(x, y, z)));
          if (killer === this.myId) {
            sound.kill(false);
            hud.pb.hitmarker(false, true);
            if (kind === Z_BRUTE) hud.pb.bannerMessage('💪 Бугай сбит! Награда поделена с командой', 1800);
            else if ((tier ?? 0) >= 2) hud.pb.bannerMessage(`✪ Чемпион сбит: ${k.name}!`, 1800);
          }
          if (boss) hud.pb.centerMessage(`${k.icon} ${k.name} повержен!`, killer ? `Добил ${this.nameOf(killer)} · добейте оставшуюся орду` : 'Добейте оставшуюся орду', '#ffd35a', 2800);
          if ((kind === Z_BRUTE || (tier ?? 0) >= 2 || boss) && killer) hud.pb.killfeed(this.nameOf(killer), -1, k.name, -1, false, 'fort', killer === this.myId);
          break;
        }
        case 'pop': {
          const [, x, y, z] = e;
          effects.burst(x, y + 0.8, z, 0xff8a6a, 40, 7, 0, 0.7, 0, 0.06);
          effects.burst(x, y + 0.8, z, 0xffd04a, 18, 5, 0, 0.8, 0, 0.05);
          effects.puff(x, y + 1, z, 3.2, 0xffb08a, 0.5, 0.8, 0.6);
          effects.splat(x, 0.01, z, 0, 1, 0, 3.2, 0xff8a6a, -1);
          const dist = this.camPos.distanceTo(_v.set(x, y, z));
          sound.bloat([x, y + 0.8, z]);
          if (dist < 9) this.shake = Math.min(1, this.shake + (9 - dist) / 9);
          break;
        }
        case 'phit': {
          const [, zid, pid, dmg] = e;
          if (pid === this.myId) {
            const ang = this.angleToZombie(zid);
            hud.pb.damageFrom(ang, dmg >= 20);
            hud.pb.paintSplat(SLIME_CSS, ang, dmg >= 20);
            sound.hurt(false);
            this.shake = Math.min(1, this.shake + 0.35);
          } else {
            const p = this.poses.get(pid);
            if (p && p.valid) this.avatars.get(pid)?.onHit(p.x, p.y + 1, p.z, false);
          }
          break;
        }
        case 'pdown': {
          const [, pid, zid] = e;
          if (pid === this.myId) {
            const s = this.predictor.state;
            this.downBy = zid;
            this.respawnAt = this.clock.estimate(performance.now()) + FORT_RESPAWN_TICKS;
            hud.showDeath(zid ? downText(this.d.zombies.kindOf(zid)) : 'Снова на террасу');
            sound.death();
            effects.deathSplat(s.x, s.y, s.z, this.colorOf(pid));
            this.deathX = s.x;
            this.deathY = s.y;
            this.deathZ = s.z;
          } else {
            const p = this.poses.get(pid);
            if (p && p.valid) {
              effects.deathSplat(p.x, p.y, p.z, this.colorOf(pid));
              sound.popAt([p.x, p.y + 0.8, p.z], this.camPos.distanceTo(_v.set(p.x, p.y, p.z)));
            }
            this.avatars.get(pid)?.pop();
            hud.pb.killfeed('🧟', -1, this.nameOf(pid), -1, false, 'fort', false);
          }
          break;
        }
        case 'spawn': {
          const [, pid, x, y, z, yaw] = e;
          if (pid === this.myId) {
            this.d.input.yaw = yaw;
            this.d.input.pitch = 0;
          } else {
            effects.puff(x, y + 0.8, z, 1.5, 0xfff4e0, 0.45, 0.6, 0.5);
          }
          break;
        }
        case 'gate': {
          const [, what, by] = e;
          const cx = (GATE.x0 + GATE.x1) / 2;
          if (what === 0) {
            sound.gateBreak([cx, 1.5, GATE.face]);
            for (let i = 0; i < 4; i++) effects.burst(cx + (i - 1.5) * 1.2, 1 + Math.random(), GATE.face, 0x9a6b42, 14, 6, 0, 0.4, 1, 0.06);
            effects.puff(cx, 1.4, GATE.face, 4, 0xd8c8a8, 0.8, 0.8, 0.7);
            hud.pb.centerMessage('Ворота пали!', 'Зомби во дворе — защищайте кристалл', '#ff8a6a', 2400);
            if (this.camPos.distanceTo(_v.set(cx, 1.5, GATE.face)) < 25) this.shake = Math.min(1, this.shake + 0.6);
          } else if (what === 1) {
            sound.hammer([cx, 1.5, GATE.z1], 3);
            effects.burst(cx, 1.6, GATE.z1 + 0.3, 0xffe08a, 10, 3, 0, 0.5, 1, 0.03);
            if (by === this.myId) hud.pb.bannerMessage(`🔨 Ворота подлатаны: <b>+${FIX_HP}</b>`, 1500);
          } else {
            sound.hammer([cx, 1.5, GATE.z1], 6);
            effects.puff(cx, 1.5, GATE.z1, 3, 0xfff1d0, 0.7, 0.6, 0.6);
            if (by === this.myId) hud.pb.bannerMessage('🚪 Новые ворота стоят!', 1600);
          }
          break;
        }
        case 'buy': {
          const [, pid, what, arg] = e;
          const mine = pid === this.myId;
          if (mine) {
            sound.coin(null);
            this.shopPending = null;
            hud.shopMessage('Куплено · сервер обновил оборону');
          }
          if (what === BUY_CRYSTAL) {
            effects.burst(CRYSTAL.x, CRYSTAL.y, CRYSTAL.z, 0x8ef0ff, 16, 3, 0, 1, 0, 0.04);
            if (mine) hud.pb.bannerMessage(`💎 Кристалл подлечен: <b>+${CRYSTAL_FIX}</b>`, 1500);
          } else if (what === BUY_TURRET) {
            if (mine) hud.pb.bannerMessage('🎯 Краскомёт на башне — стреляет сам!', 1800);
          } else if (what === BUY_JAM) {
            const p = this.d.map.stations.find((s) => s.kind === 'jam' && s.arg === arg);
            if (p) sound.jam([p.x, p.y, p.z]);
            if (mine) hud.pb.bannerMessage('🍓 Варенье на дороге — зомби вязнут!', 1600);
          } else if (what === BUY_MAGAZINE) {
            if (mine) hud.pb.bannerMessage('Большой магазин установлен · 42 шарика', 1800);
          } else if (what === BUY_ANTIAIR) {
            if (mine) hud.pb.bannerMessage('Краскомёт следит за небом · двойной урон крылаткам', 2000);
          }
          // ворота (починка, новые) — звук и надпись в событии ворот
          break;
        }
        case 'tshot': {
          const [, spot, , ex, ey, ez] = e;
          if (!world.props.turretShot(spot, ex, ey, ez, _v)) break;
          effects.shootBall(_v.x, _v.y, _v.z, ex, ey, ez, 0xff8a1c, 0, { kind: 1, nx: 0, ny: 0, nz: 0, victim: 0, head: false });
          effects.puff(_v.x, _v.y, _v.z, 0.4, 0xffffff, 0.12, 0.3, 0.4, 1.4);
          sound.shot([_v.x, _v.y, _v.z], this.camPos.distanceTo(_v2.copy(_v)));
          break;
        }
        case 'climb': {
          if (this.time - this.climbAlertAt > 6) {
            this.climbAlertAt = this.time;
            hud.alert('🧗 Липучка лезет на стену!', 2200);
          }
          break;
        }
        case 'warn': {
          const [, , attack, tx, , tz, , end] = e;
          const sec = Math.max(0, (end - this.clock.estimate(performance.now())) / TICK_RATE);
          // плевки и бочки — часто: тревога только тому, у кого метка рядом
          const near = Math.hypot(tx - this.predictor.state.x, tz - this.predictor.state.z) < 6;
          if (attack === ZS_SPIT) {
            if (near) hud.alert('💦 Плевальщик целится в тебя · уйди с метки', Math.max(1200, sec * 1000));
            break;
          }
          if (attack === ZS_PLANT) {
            if (this.time - this.fuseAlertAt > 5) {
              this.fuseAlertAt = this.time;
              hud.alert('💣 Бочка у ворот · фитиль 3 с — сбейте подрывника!', 2600);
            }
            break;
          }
          if (attack === ZS_HOWL) {
            hud.alert('🐗 Таран воет · сейчас выбегут шустрики', 2200);
            sound.roar([tx, 2, tz], 1.2);
            break;
          }
          hud.alert(attack === ZS_FLY_WARN ? 'Крылатка пикирует · уйди с метки или сбей её'
            : attack === ZS_BOSS_GATE ? 'Барон бьёт по воротам · отойди от красного круга'
            : attack === ZS_BOSS_PULSE ? 'Волна Барона · выйди из круга или прыгни'
            : attack === ZS_CHARGE_WARN ? '🐗 Таран берёт разбег · уйди с красной дорожки'
            : attack === ZS_STOMP ? '🐗 Таран встаёт на дыбы · прыгай, когда круг заполнится'
            : attack === ZS_THROW ? (near ? '🪨 Камень летит в тебя · уйди из круга' : '🪨 Валун бросает камень · следи за тенью')
            : attack === ZS_QUAKE ? '🪨 Валун трясёт стену · прыгай, когда круг заполнится'
            : 'Залп Барона · уйди с красной метки', Math.max(1400, sec * 1000));
          sound.horn(attack === ZS_FLY_WARN ? 0.12 : 0.22);
          break;
        }
        case 'blast': {
          const [, attack, x, y, z, r] = e;
          const dist = this.camPos.distanceTo(_v.set(x, y, z));
          if (attack === ZS_SPIT) {
            effects.splat(x, y - 0.75, z, 0, 1, 0, r * 0.9, 0xb02a48, -1, 12);
            effects.burst(x, y, z, 0xb02a48, 14, 4, 0, 1, 0, 0.05);
            break;
          }
          if (attack === ZS_BARREL) {
            effects.burst(x, y, z, 0xffb347, 36, r * 2, 0, 1, 0, 0.07);
            effects.burst(x, y, z, 0x8a5a34, 16, r * 1.5, 0, 1, 0, 0.06);
            effects.puff(x, y + 0.6, z, r * 1.3, 0x6b625a, 1.1, 1.2, 0.6);
            effects.puff(x, y + 0.3, z, r * 0.9, 0xffa040, 0.35, 0.4, 0.8);
            sound.boom([x, y, z]);
            if (dist < r + 14) this.shake = Math.max(this.shake, Math.min(1, (r + 14 - dist) / 12));
            break;
          }
          if (attack === ZS_CHARGE) {
            // Таран врезался: щепки, пыль, гул
            effects.burst(x, y, z, 0x8a5a34, 28, 7, 0, 1, -1, 0.08);
            effects.burst(x, y, z, 0xd9c7a0, 18, 5, 0, 1, 0, 0.05);
            effects.puff(x, y, z, 2.6, 0xb8a888, 1.0, 1.0, 0.55);
            sound.boom([x, y, z], 1.3);
            if (dist < 26) this.shake = Math.max(this.shake, Math.min(1, (26 - dist) / 14));
            break;
          }
          if (attack === ZS_STOMP || attack === ZS_QUAKE) {
            // топот и землетрясение: кольцо пыли
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2;
              effects.puff(x + Math.cos(a) * r * 0.7, y + 0.3, z + Math.sin(a) * r * 0.7, 1.4, 0xc9b896, 0.9, 0.7, 0.5);
            }
            sound.rumble([x, y, z], attack === ZS_QUAKE ? 1.5 : 1);
            if (dist < r + 10) this.shake = Math.max(this.shake, 0.75);
            break;
          }
          if (attack === ZS_THROW) {
            // камень раскололся
            effects.burst(x, y, z, 0x7d7f77, 26, 6, 0, 1, 0, 0.09);
            effects.puff(x, y, z, r * 0.9, 0xb8b2a2, 0.9, 0.8, 0.55);
            sound.boom([x, y, z], 0.9);
            if (dist < r + 12) this.shake = Math.max(this.shake, 0.55);
            break;
          }
          effects.burst(x, y, z, attack === ZS_BOSS_OPEN ? 0x69e7ef : 0xff805c, 20, r, 0, 1, 0, 0.065);
          effects.puff(x, y, z, r * 1.1, 0xe883ae, 0.6, 0.65, 0.4);
          sound.bloat([x, y, z]);
          if (dist < r + 8) this.shake = Math.max(this.shake, 0.5);
          break;
        }
        case 'bossphase': {
          const [, id] = e;
          const kind = zombies.kindOf(id);
          hud.alert(kind === Z_RAM ? '🐗 Таран в ярости · рвётся два раза подряд'
            : kind === Z_GOLEM ? '🪨 Валун в ярости · бросает по два камня'
            : '👑 Барон в ярости · бьёт чаще и зовёт крылаток', 3200);
          const seen = zombies.where(id, _v);
          sound.roar(seen ? [_v.x, _v.y + 3, _v.z] : null, kind === Z_GOLEM ? 0.7 : kind === Z_RAM ? 1.1 : 0.9);
          this.shake = Math.max(this.shake, 0.6);
          break;
        }
        case 'boat': {
          const [, what, by, x] = e;
          if (what === 1) {
            hud.alert(`⚓ Десант у южной стены (${x < 0 ? 'запад' : 'восток'}) · абордажники лезут на морскую стену`, 3600);
            sound.horn(0.3);
          } else {
            hud.alert(by === this.myId ? '⛵ Лодка потоплена! Экипаж ко дну' : '⛵ Лодку потопили · экипаж ко дну', 2600);
            if (by === this.myId) hud.pb.hitmarker(false, true);
          }
          break;
        }
        case 'breach': {
          const [, id] = e;
          hud.alert('👑 Ворота пали — Барон протискивается во двор · к кристаллу!', 3600);
          const seen = zombies.where(id, _v);
          sound.roar(seen ? [_v.x, _v.y + 3, _v.z] : null, 0.8);
          break;
        }
        case 'early': {
          const [, pct] = e;
          hud.alert(`🔔 Волну вызвали раньше: +${pct} % золота за неё`, 2600);
          break;
        }
        case 'bell': {
          const [, pid] = e;
          world.props.ringBell();
          const st = this.d.map.stations.find((s) => s.kind === 'bell');
          sound.bell(st && pid !== this.myId ? [st.x, st.y + 2, st.z] : null);
          if (this.phase === FT_WAVE) hud.alert('🔔 Щит строений на 8 с · игроки уходят с меток', 3000);
          else if (pid !== this.myId) chat.note(`🔔 ${this.nameOf(pid)} готов к волне`);
          break;
        }
      }
    }
  }

  /** Бросок долетел: плевок — клякса (сама метка — в событии blast), камень — пыль, метеор — вспышка */
  private onProjectileLand(kind: number, x: number, y: number, z: number): void {
    const { effects } = this.d;
    if (kind === PJ_GLOB) effects.burst(x, y, z, 0xb02a48, 8, 3, 0, 1, 0, 0.04);
    else if (kind === PJ_ROCK) effects.puff(x, y, z, 2.2, 0xc8bfae, 0.9, 0.6, 0.6);
    else if (kind === PJ_INK) effects.burst(x, y, z, 0x5a2f6e, 14, 4, 0, 1, 0, 0.05);
    else effects.puff(x, y, z, 2.5, 0xffa060, 0.6, 0.8, 0.7);
  }

  /** Угол на зомби (или на ворота, если не видно) относительно взгляда: 0 — впереди, по часовой. */
  private angleToZombie(zid: number): number {
    const s = this.predictor.state;
    let tx = s.x;
    let tz = s.z - 1;
    if (this.d.zombies.where(zid, _v2)) {
      tx = _v2.x;
      tz = _v2.z;
    }
    const a = Math.atan2(-(tx - s.x), -(tz - s.z));
    return -wrapAngle(a - this.d.input.yaw);
  }

  // ------------------------------------------------------------ тик предсказания

  private tick(): void {
    const { input } = this.d;
    const inp = this.inputs[0];
    inp.seq = ++this.seq;
    inp.buttons = (this.d.hud.shopShown ? 0 : input.sample()) | (this.shoulder < 0 ? BTN_SHOULDER : 0);
    inp.yaw = Math.fround(input.yaw);
    inp.pitch = Math.fround(input.pitch);
    inp.viewTick = Math.max(0, this.clock.renderTick);
    // стрелять можно всегда (как на сервере): в сборе — по мишеням-стенам
    if (this.alive) {
      const ev = this.predictor.step(inp, true);
      this.onLocalEvents(ev, inp);
    } else {
      this.predictor.record(inp, true);
    }
    this.d.net.sendBinary(encodeInputs(this.inputs, 0, 1, this.d.net.epoch));
  }

  private onLocalEvents(ev: StepEvents, inp: Input): void {
    const { sound } = this.d;
    const s = this.predictor.state;
    if (ev.fired) this.localShot(s, ev, (inp.buttons & BTN_ADS) !== 0, inp.viewTick);
    if (ev.jumped) sound.jump();
    if (ev.landed) {
      sound.land(ev.landSpeed);
      this.dipV -= Math.min(2.2, ev.landSpeed * 0.1);
    }
    if (ev.dashed) {
      sound.dash();
      this.fovKick = Math.max(this.fovKick, 7);
    }
    if (ev.reloadStart) sound.reload();
    if (ev.dry) sound.dry();
    if (ev.stepUp > 0) this.stepSmooth = Math.max(-0.6, this.stepSmooth - ev.stepUp);
    if (s.grounded) {
      this.stepDist += Math.hypot(s.vx, s.vz) / TICK_RATE;
      if (this.stepDist > 2.1) {
        this.stepDist = 0;
        sound.step(null);
      }
    }
  }

  /** Свой выстрел: куда полетит шарик — сразу и так же, как решит сервер (цели — зомби на том же тике). */
  private localShot(s: PlayerState, ev: StepEvents, ads: boolean, viewTick: number): void {
    const { collision, effects, sound } = this.d;
    const n = this.d.zombies.targets(viewTick, this.tg);
    const dir = this.shotDir;
    fortShotDir(s, ev.aimYaw, ev.aimPitch, ev.spread, this.predictor.seed, s.shots, this.shoulder, ads, collision, this.tg, n, dir);
    const ox = s.x;
    const oy = s.y + EYE_HEIGHT;
    const oz = s.z;
    const dx = dir.dirX;
    const dy = dir.dirY;
    const dz = dir.dirZ;
    let best = SHOT_RANGE;
    let kind = 2;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (collision.raycast(ox, oy, oz, dx, dy, dz, SHOT_RANGE, this.hit, true)) {
      best = this.hit.t;
      kind = 0;
      nx = this.hit.nx;
      ny = this.hit.ny;
      nz = this.hit.nz;
    }
    if (nearestZombie(ox, oy, oz, dx, dy, dz, best, this.tg, n, this.near) >= 0) {
      best = this.near.t;
      kind = 1;
    }
    const av = this.localAvatar;
    av.muzzle(_v);
    av.onShot();
    effects.puff(_v.x, _v.y, _v.z, 0.35, 0xffffff, 0.14, 0.3, 0.45, 1.4);
    effects.shootBall(_v.x, _v.y, _v.z, ox + dx * best, oy + dy * best, oz + dz * best, this.colorOf(this.myId), this.myId, { kind, nx, ny, nz, victim: 0, head: false });
    sound.shot(null);
  }

  // ------------------------------------------------------------ кадр

  frame(now: number, dtRaw: number): void {
    const d = this.d;
    const dt = Math.min(0.1, dtRaw);
    this.time += dt;
    this.fpsFrames++;
    this.fpsTime += dtRaw;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.lastFrameMs = dtRaw * 1000;

    this.clock.update(now, dt * 1000);
    if (this.ready && this.clock.ready) {
      const rate = clamp(1 - (this.queueAvg - 1.2) * 0.02, 0.97, 1.03);
      this.acc += dt * 1000 * rate;
      let n = 0;
      while (this.acc >= TICK_MS && n < 8) {
        this.acc -= TICK_MS;
        this.tick();
        n++;
      }
      if (this.acc > TICK_MS * 4) this.acc = 0;
    }
    const alpha = clamp(this.acc / TICK_MS, 0, 1);
    this.predictor.decay(dt);

    this.updateRemotes(dt);
    this.updateCamera(dt, alpha);
    this.updateLocalAvatar(dt, alpha);
    const cam = d.world.camera;
    d.zombies.update(this.clock.renderTick, dt, this.time, cam);
    d.projectiles?.update(dt);
    d.effects.update(dt);
    d.world.update(dt, this.camPos);
    tickAvatarShared(this.time, d.world.renderer.canvas.clientHeight || window.innerHeight);
    this.updateStation();
    this.updateMarks();
    this.updateHud(dt);
    this.ambience();

    cam.getWorldDirection(_v);
    d.sound.setListener(cam.position.x, cam.position.y, cam.position.z, _v.x, _v.y, _v.z);
    d.sound.tick(dt);
    d.world.renderScene();
  }

  private updateRemotes(dt: number): void {
    const { world, collision, sound } = this.d;
    const t = this.clock.renderTick;
    for (const [id, tr] of this.tracks) {
      let av = this.avatars.get(id);
      const info = this.roster.get(id);
      if (!av) {
        av = new Avatar(id, { gun: true });
        av.setInfo(info?.name ?? '', null, true, info?.level ?? 1);
        if (info) av.setOutfit(info.o);
        av.addTo(world.scene);
        this.avatars.set(id, av);
      }
      let pose = this.poses.get(id);
      if (!pose) {
        pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, valid: false };
        this.poses.set(id, pose);
      }
      const ok = tr.sample(t, this.sample);
      const s = this.sample;
      if (ok) {
        if (pose.valid && s.flags & E_GROUNDED && s.flags & E_ALIVE) {
          const moved = Math.hypot(s.x - pose.x, s.z - pose.z);
          if (moved < 2) {
            const acc = (this.steps.get(id) ?? 0) + moved;
            if (acc > 1.8) {
              this.steps.set(id, 0);
              sound.step([s.x, s.y, s.z], this.camPos.distanceTo(_v.set(s.x, s.y, s.z)));
            } else {
              this.steps.set(id, acc);
            }
          }
        }
        pose.x = s.x;
        pose.y = s.y;
        pose.z = s.z;
        pose.yaw = s.yaw;
        pose.pitch = s.pitch;
        pose.flags = s.flags;
        pose.valid = true;
      } else {
        pose.valid = false;
      }
      av.hp = tr.hp;
      av.maxHp = FORT_HP;
      av.update(ok ? pose : null, dt, this.time, collision, this.camPos, false);
    }
  }

  private updateLocalAvatar(dt: number, alpha: number): void {
    const s = this.predictor.state;
    const p = this.predictor.prev;
    const o = this.predictor.offset;
    const ads = this.d.input.isHeld(BTN_ADS);
    const flags = E_ALIVE | (s.grounded ? E_GROUNDED : 0) | (ads ? E_ADS : 0) | (s.reloadT > 0 ? E_RELOAD : 0) | (s.dashT > 0 ? E_DASH : 0);
    const pose: AvatarPose = {
      x: p.x + (s.x - p.x) * alpha + o.x,
      y: p.y + (s.y - p.y) * alpha + o.y,
      z: p.z + (s.z - p.z) * alpha + o.z,
      yaw: this.d.input.yaw,
      pitch: this.d.input.pitch,
      flags: this.alive ? flags : 0,
    };
    this.localAvatar.update(this.alive ? pose : null, dt, this.time, this.d.collision, this.camPos, true);
  }

  private updateCamera(dt: number, alpha: number): void {
    const { world, input, settings } = this.d;
    const cam = world.camera;
    const s = this.predictor.state;
    const p = this.predictor.prev;
    const o = this.predictor.offset;

    this.dipV += (-this.dip * 180 - this.dipV * 16) * dt;
    this.dip += this.dipV * dt;
    this.stepSmooth *= Math.exp(-dt * 16);
    this.shake *= Math.exp(-dt * 7);
    this.fovKick *= Math.exp(-dt * 6);

    const ads = this.alive && input.isHeld(BTN_ADS);
    this.adsT = damp(this.adsT, ads ? 1 : 0, 14, dt);
    input.scopeSens = 1;
    this.sideSmooth = damp(this.sideSmooth, this.shoulder, 12, dt);

    if (this.alive) {
      const x = p.x + (s.x - p.x) * alpha + o.x;
      const y = p.y + (s.y - p.y) * alpha + o.y + this.stepSmooth + this.dip * 0.06;
      const z = p.z + (s.z - p.z) * alpha + o.z;
      const rp = p.recoilP + (s.recoilP - p.recoilP) * alpha;
      const ry = p.recoilY + (s.recoilY - p.recoilY) * alpha;
      const yaw = input.yaw + ry;
      const pitch = clamp(input.pitch + rp, -1.56, 1.56);
      const k = this.adsT;
      const rig = this.rig;
      rig.back = RIG_PB.back + (RIG_PB_ADS.back - RIG_PB.back) * k;
      rig.side = RIG_PB.side + (RIG_PB_ADS.side - RIG_PB.side) * k;
      rig.up = RIG_PB.up + (RIG_PB_ADS.up - RIG_PB.up) * k;
      cameraRig(x, y, z, yaw, pitch, rig, this.sideSmooth, this.d.collision, this.camV);
      cam.position.set(this.camV.x, this.camV.y, this.camV.z);
      this.pivot.x = x;
      this.pivot.y = y;
      this.pivot.z = z;
      this.viewYaw = yaw;
      this.viewPitch = pitch;
      const sh = this.shake * this.shake;
      const shp = (Math.sin(this.time * 47) + Math.sin(this.time * 31)) * 0.006 * sh;
      const shy = Math.sin(this.time * 39) * 0.006 * sh;
      cam.rotation.set(clamp(pitch + shp, -1.56, 1.56), yaw + shy, Math.sin(this.time * 23) * 0.01 * sh, 'YXZ');
      this.camPos.copy(cam.position);
      this.camQuat.copy(cam.quaternion);
      this.camInit = true;
    } else {
      // камера смерти: над местом, где повалили, смотрим на того зомби (или на кристалл)
      let tx = CRYSTAL.x;
      let ty = CRYSTAL.y;
      let tz = CRYSTAL.z;
      if (this.downBy && this.d.zombies.where(this.downBy, _v2)) {
        tx = _v2.x;
        ty = _v2.y + 1;
        tz = _v2.z;
      }
      const dx = tx - this.deathX;
      const dz = tz - this.deathZ;
      const dl = Math.hypot(dx, dz) || 1;
      const want = _v.set(this.deathX - (dx / dl) * 2.2, this.deathY + 4, this.deathZ - (dz / dl) * 2.2);
      const fromY = this.deathY + 1.2;
      const vx = want.x - this.deathX;
      const vy = want.y - fromY;
      const vz = want.z - this.deathZ;
      const vl = Math.hypot(vx, vy, vz);
      if (vl > 0 && this.d.collision.raycast(this.deathX, fromY, this.deathZ, vx / vl, vy / vl, vz / vl, vl, this.hit, false)) {
        const k = Math.max(0, this.hit.t - 0.3) / vl;
        want.set(this.deathX + vx * k, fromY + vy * k, this.deathZ + vz * k);
      }
      if (!this.camInit) {
        this.camPos.copy(cam.position);
        this.camQuat.copy(cam.quaternion);
        this.camInit = true;
      }
      this.camPos.lerp(want, 1 - Math.exp(-dt * 3.5));
      _m.lookAt(this.camPos, _look.set(tx, ty, tz), _v2.set(0, 1, 0));
      _q.setFromRotationMatrix(_m);
      this.camQuat.slerp(_q, 1 - Math.exp(-dt * 4));
      cam.position.copy(this.camPos);
      cam.quaternion.copy(this.camQuat);
    }

    const vBase = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(settings.fov) / 2) / (16 / 9)) * 180) / Math.PI;
    const zoom = ads ? ADS_ZOOM : 1;
    const target = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vBase) / 2) / zoom) * 180) / Math.PI + this.fovKick;
    this.curFov = damp(this.curFov, target, 18, dt);
    const f = narrowFov(this.curFov, cam.aspect);
    if (Math.abs(cam.fov - f) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------ стойки и таблички

  private get calm(): boolean {
    return this.phase === FT_GATHER || this.phase === FT_BREAK;
  }

  /** Ближайшая стойка в досягаемости (как проверит сервер, с запасом) и подсказка к ней. */
  private updateStation(): void {
    const { hud, map } = this.d;
    this.station = null;
    if (!this.alive || this.phase === FT_END || hud.shopShown) {
      hud.setHint(null, 0, false, true);
      return;
    }
    const s = this.predictor.state;
    let best: FortStation | null = null;
    let bd = Infinity;
    for (const st of map.stations) {
      const dist = Math.hypot(s.x - st.x, s.z - st.z);
      if (dist > st.r + STATION_PAD || Math.abs(s.y - st.y) > 1.5 || dist >= bd) continue;
      best = st;
      bd = dist;
    }
    this.station = best;
    const hint = best ? this.stationHint(best) : null;
    if (!hint) {
      hud.setHint(null, 0, false, true);
      return;
    }
    const [text, price, can] = hint;
    hud.setHint(text, price, can, price <= this.myPts);
  }

  /** Подсказка у стойки: текст, цена (0 — без цены), сработает ли E; null — сказать нечего (всё цело) */
  private stationHint(st: FortStation): [string, number, boolean] | null {
    switch (st.kind) {
      case 'bell': {
        if (this.phase === FT_WAVE) {
          const cd = this.tail.rallyCd ?? 0;
          return cd > 0 ? [`Щит восстановится через ${Math.ceil(cd / TICK_RATE)} с`, 0, false]
            : ['щит ворот и кристалла −50% урона на 8 с · откат 30 с', 0, true];
        }
        if (!this.calm) return null;
        const me = this.roster.get(this.myId);
        if (me?.ready) {
          const ready = this.rosterList.filter((r) => r.ready).length;
          return [`Ты готов — ждём остальных (${ready} из ${this.rosterList.length})`, 0, false];
        }
        return ['ударить в колокол — «готов к волне»', 0, true];
      }
      case 'shop': return this.calm ? ['открыть лавку · оборона, магазин, зенитка', 0, true] : ['Лавка откроется после волны', 0, false];
      case 'gate':
        if (this.gate <= 0) return this.calm ? ['поставить новые ворота', NEWGATE_PRICE, true] : ['Ворота разбиты — новые ставят в передышку', 0, false];
        if (this.gate >= GATE_HP) return null;
        return [`подлатать ворота (+${FIX_HP})`, FIX_PRICE, true];
      case 'crystal':
        if (this.crystal >= CRYSTAL_HP) return null;
        return [`подлечить кристалл (+${CRYSTAL_FIX})`, CRYSTAL_PRICE, true];
      case 'turret':
        if (this.turrets & (1 << st.arg)) return null;
        return ['поставить краскомёт — бьёт зомби у ворот', TURRET_PRICE, true];
      case 'jam':
        if (this.phase !== FT_WAVE) return ['Варенье льют на дорогу, когда идут зомби', 0, false];
        if (this.jams & (1 << st.arg)) return ['Лужа ещё не высохла', 0, false];
        return ['вылить варенье — зомби вязнут', JAM_PRICE, true];
    }
    return null;
  }

  /** Таблички над стойками: что можно купить и почём */
  private updateMarks(): void {
    const props = this.d.world.props;
    for (const st of this.d.map.stations) {
      let icon = '';
      let text = '';
      switch (st.kind) {
        case 'shop':
          if (this.calm) { icon = '🛠'; text = 'ЛАВКА'; }
          break;
        case 'bell':
          if (this.calm) icon = '🔔';
          else if (this.phase === FT_WAVE) { icon = '🛡'; text = (this.tail.rallyCd ?? 0) > 0 ? `${Math.ceil(this.tail.rallyCd! / TICK_RATE)}с` : 'ГОТОВ'; }
          break;
        case 'gate':
          if (this.gate <= 0 && this.calm) {
            icon = '🚪';
            text = String(NEWGATE_PRICE);
          } else if (this.gate > 0 && this.gate < GATE_HP) {
            icon = '🔨';
            text = String(FIX_PRICE);
          }
          break;
        case 'crystal':
          if (this.crystal < CRYSTAL_HP) {
            icon = '💎';
            text = String(CRYSTAL_PRICE);
          }
          break;
        case 'turret':
          if (!(this.turrets & (1 << st.arg))) {
            icon = '🎯';
            text = String(TURRET_PRICE);
          }
          break;
        case 'jam':
          if (this.phase === FT_WAVE && !(this.jams & (1 << st.arg))) {
            icon = '🍓';
            text = String(JAM_PRICE);
          }
          break;
      }
      props.setMark(st.id, icon, text);
    }
  }

  // ------------------------------------------------------------ интерфейс

  private updateHud(dt: number): void {
    const { hud, world, settings, input } = this.d;
    const pb = hud.pb;
    const est = this.clock.estimate(performance.now());
    const leftS = (this.phaseEnd - est) / TICK_RATE;
    let info = '';
    let urgent = false;
    if (this.phase === FT_WAVE) info = `🧟 ${this.left}`;
    else if (this.phase === FT_END) info = '';
    else {
      info = `⏱ ${Math.max(0, Math.ceil(leftS))} с`;
      urgent = leftS < 5.5;
    }
    hud.setWave(this.phase, this.wave, info, urgent);
    hud.setDefense(this.phase, this.tail.defenders ?? this.rosterList.length, this.tail.rally ?? 0, this.tail.rallyCd ?? 0);
    hud.setGate(this.gate, GATE_HP);
    hud.setCrystal(this.crystal, CRYSTAL_HP);
    hud.setCard(this.card, this.phase);
    const boss = this.zlist.find((z) => isBossKind(z.kind) && z.hp > 0);
    if (this.time - this.wakeAt > 0.18) {
      // пена за лодками на ходу
      this.wakeAt = this.time;
      for (const z of this.zlist) {
        if (z.kind !== Z_BOAT || z.hp <= 0 || (z.state !== ZS_BOAT && z.state !== ZS_BOAT_LEAVE)) continue;
        const back = z.state === ZS_BOAT ? 1.9 : -1.9;
        this.d.effects.puff(z.x + (Math.random() - 0.5) * 0.8, WATER_Y + 0.15, z.z + back, 0.7, 0xf4fbff, 0.9, 0.1, 0.55, 2.4);
      }
    }
    if (boss && ((boss.flags ?? 0) & ZF_RAGE) && this.time - this.steamAt > 0.14) {
      // ярость: красный пар над головой
      this.steamAt = this.time;
      const k = ZK[boss.kind] ?? ZK[0];
      const top = boss.y + k.hcy + k.hry;
      this.d.effects.puff(boss.x + (Math.random() - 0.5) * k.hrx, top, boss.z + (Math.random() - 0.5) * k.hrx, 1.1, 0xff8f7a, 0.9, 1.6, 0.45);
    }
    hud.setBoss(this.phase === FT_WAVE ? boss?.hp ?? 0 : 0, boss?.stage ?? 1, boss?.state ?? 0, boss?.wind ?? 0,
      boss?.kind ?? Z_BOSS, this.card?.tier ?? 0, ((boss?.flags ?? 0) & ZF_RAGE) !== 0);
    if (hud.shopShown) {
      if (this.shopPending !== null && this.time - this.shopPendingAt > 3) {
        this.shopPending = null;
        hud.shopMessage('Ответ задерживается · проверь связь и попробуй снова');
      }
      hud.updateShop({ phase: this.phase, pts: this.myPts, gate: this.gate, crystal: this.crystal, turrets: this.turrets,
        jams: this.jams, mag: Boolean(this.roster.get(this.myId)?.mag) }, this.wave, leftS, this.shopPending);
    }
    if (this.phase === FT_END && hud.endShown) hud.setEndTimer(leftS);

    pb.setVitals(this.alive ? this.hp : 0, FORT_HP, 0, 0, false);
    const s = this.predictor.state;
    pb.setAmmo(s.ammo, this.roster.get(this.myId)?.mag ? FORT_MAGAZINE : MAG_SIZE, s.reloadT > 0 ? clamp(1 - s.reloadT / RELOAD_TICKS, 0, 1) : null);
    pb.setDash(1 - s.dashCd / DASH_COOLDOWN_TICKS);
    const ads = input.isHeld(BTN_ADS);
    const cam = world.camera;
    const h = world.renderer.canvas.clientHeight || window.innerHeight;
    const spread = currentSpread(s, ads);
    const gap = 3 + (Math.tan(spread) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) * (h / 2);
    const aiming = this.alive && !hud.endShown && !hud.shopShown;
    pb.setCrosshair(gap, aiming, ads);
    this.updateBlocked(aiming);
    pb.setAliveUi(this.alive);
    if (!this.alive) pb.setRespawn(Math.max(0, (this.respawnAt - est) / TICK_RATE));

    hud.showBoard(this.boardHeld && this.phase !== FT_END, this.rosterList, this.myId, this.phase);
    pb.updateFloaters(dt, cam, window.innerWidth, window.innerHeight);
    pb.setStats(settings.showStats ? `${this.fps} FPS · ${Math.round(this.d.net.pingMs)} мс · буфер ${this.clock.delay.toFixed(1)} т · кадр ${this.lastFrameMs.toFixed(1)} мс · зомби ${this.d.zombies.count}` : null);

    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.1;
      const nz = this.d.zombies.dots(this.mapZ);
      let nm = 0;
      for (const p of this.poses.values()) {
        if (!p.valid || !(p.flags & E_ALIVE)) continue;
        const m = this.mapM[nm] ?? (this.mapM[nm] = { x: 0, z: 0, kind: 0 });
        m.x = p.x;
        m.z = p.z;
        nm++;
      }
      hud.drawMap(this.gate > 0, this.mapZ, nz, this.mapM, nm, s.x, s.z, input.yaw, this.alive);
    }
  }

  /** Крестик блокировки: шарик летит из глаз; стена между глазами и точкой прицела — покажем, куда попадёт. */
  private updateBlocked(aiming: boolean): void {
    const { hud, collision, world } = this.d;
    const pb = hud.pb;
    if (!aiming) {
      pb.setBlocked(0, 0, false);
      return;
    }
    const pv = this.pivot;
    const n = this.d.zombies.targets(this.clock.renderTick, this.tg);
    fortAimPoint(this.camV, pv.x, pv.y + PIVOT_Y, pv.z, this.viewYaw, this.viewPitch, collision, this.tg, n, this.aimP);
    const ex = pv.x;
    const ey = pv.y + EYE_HEIGHT;
    const ez = pv.z;
    let vx = this.aimP.x - ex;
    let vy = this.aimP.y - ey;
    let vz = this.aimP.z - ez;
    const len = Math.hypot(vx, vy, vz);
    viewDir(this.viewYaw, this.viewPitch, _f);
    if (len < 1e-6 || vx * _f.x + vy * _f.y + vz * _f.z < AIM_FALLBACK) {
      pb.setBlocked(0, 0, false);
      return;
    }
    vx /= len;
    vy /= len;
    vz /= len;
    if (len <= BLOCK_MARGIN || !collision.raycast(ex, ey, ez, vx, vy, vz, len - BLOCK_MARGIN, this.hit, true)) {
      pb.setBlocked(0, 0, false);
      return;
    }
    const cam = world.camera;
    cam.updateMatrixWorld();
    _v.set(ex + vx * this.hit.t, ey + vy * this.hit.t, ez + vz * this.hit.t).project(cam);
    if (_v.z > 1) {
      pb.setBlocked(0, 0, false);
      return;
    }
    const canvas = world.renderer.canvas;
    const w = canvas.clientWidth || window.innerWidth;
    const hh = canvas.clientHeight || window.innerHeight;
    pb.setBlocked((_v.x * 0.5 + 0.5) * w, (-_v.y * 0.5 + 0.5) * hh, true);
  }

  /** Стоны орды: в волну время от времени стонет кто-то из ближних зомби. */
  private ambience(): void {
    if (this.phase !== FT_WAVE || this.time < this.groanAt) return;
    this.groanAt = this.time + 1.2 + Math.random() * 2.4;
    const kind = this.d.zombies.randomNear(this.camPos.x, this.camPos.z, 32, _v);
    if (kind < 0) return;
    this.d.sound.zombieGroan([_v.x, _v.y, _v.z], kind === Z_BRUTE ? 0.7 : kind === Z_RUNNER ? 1.35 : kind === Z_BLOATER ? 0.85 : 1);
  }

  /** Для отладки и тестов в браузере (window.__opus.state()). */
  debugState(): Record<string, unknown> {
    const s = this.predictor.state;
    const c = this.d.world.camera.position;
    return {
      id: this.myId, alive: this.alive, hp: this.hp, phase: this.phase, wave: this.wave, cleared: this.cleared,
      gate: this.gate, crystal: this.crystal, left: this.left, turrets: this.turrets, jams: this.jams, pts: this.myPts,
      defenders: this.tail.defenders, rally: this.tail.rally, rallyCd: this.tail.rallyCd,
      pos: [s.x, s.y, s.z], ammo: s.ammo, corrections: this.predictor.corrections, zombies: this.d.zombies.count,
      station: this.station?.kind ?? null, renderTick: this.clock.renderTick, delay: this.clock.delay, remotes: this.tracks.size,
      fps: this.fps, cam: [c.x, c.y, c.z], end: this.d.hud.endShown,
    };
  }
}

/** 1 жетон, 2 жетона, 5 жетонов */
/** Почему повалили — по виду зомби, чтобы было понятно, от чего беречься */
function downText(kind: number): string {
  if (kind === Z_SPITTER) return 'Плевок попал — уходи с красной метки';
  if (kind === Z_SAPPER) return 'Бочка рванула рядом — бей подрывника издалека';
  if (kind === Z_BLOATER) return 'Пузырь лопнул рядом — бей его издалека';
  if (kind === Z_FLYER) return 'Крылатка спикировала — поглядывай в небо';
  if (isBossKind(kind)) return 'Босс достал — уходи с красных меток';
  return 'Зомби добрались до тебя — встанешь на террасе';
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
