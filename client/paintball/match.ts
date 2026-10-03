// Матч пейнтбола: предсказание своего движения, интерполяция чужих, события, камера, звук и интерфейс.
// Вид от третьего лица: камера над плечом (Q — другое плечо), своя желейка в кадре, шарик летит из её маркера
// в точку под прицелом — по тем же формулам, что и на сервере (shared/aim.ts).
// AWP с верха креста: у кого она — видно по хвосту снимка (в руках у желейки длинная винтовка), выстрел — трассер,
// в прицеле — оптика (сильное приближение и тёмный круг с перекрестьем).
// Один объект на одно посещение склада; соединение и общий интерфейс — у оболочки.
import * as THREE from 'three';
import {
  BASE_HEALTH, DASH_COOLDOWN_TICKS, EYE_HEIGHT, HITBOX_CY, HITBOX_RX, HITBOX_RY, PHASE_END, PHASE_PLAY, PHASE_WARMUP,
  RESPAWN_TICKS, SCORE_LIMIT, TEAM_COLORS, TEAM_CSS, TICK_MS, TICK_RATE, WATER_Y,
} from '../../shared/constants.ts';
import { AIM_FALLBACK, PIVOT_Y, RIG_PB, RIG_PB_ADS, aimPoint, cameraRig, tpsShotDir, type RigParams, type V3 } from '../../shared/aim.ts';
import type { GameMap } from '../../shared/maps/types.ts';
import { clamp, damp, viewDir, wrapAngle } from '../../shared/math.ts';
import {
  AWP_LYING, E_ADS, E_ALIVE, E_DASH, E_GROUNDED, E_PROTECTED, E_RELOAD, E_TEAM, PB_TAIL_BYTES, SNAP_HAS_SELF, SNAP_SELF_RESET, decodeSnapshot,
  encodeInputs, makeHeader, type EntitySnap,
} from '../../shared/protocol.ts';
import type { PbReward } from '../../shared/economy.ts';
import { type GameEvent, type RosterEntry, type ServerMsg, type SlotBonus } from '../../shared/messages.ts';
import {
  AWP_INTERVAL, AWP_SHOTS, BTN_ADS, BTN_SHOULDER, MAG_SIZE, RELOAD_TICKS, SHOT_RANGE, currentSpread, makeInput, makeState, type Input,
  type PlayerState, type StepEvents,
} from '../../shared/sim.ts';
import { CollisionWorld, makeRayHit, rayEllipsoid } from '../../shared/world.ts';
import type { Sound } from '../audio.ts';
import type { Chat } from '../chat.ts';
import type { Input as InputDevice } from '../input.ts';
import { ClockSync, type Net } from '../net.ts';
import { Predictor } from '../predict.ts';
import { RemoteTrack, type RemoteSample } from '../remote.ts';
import { Avatar, tickAvatarShared, type AvatarPose } from '../render/avatar.ts';
import type { Effects } from '../render/effects.ts';
import { narrowFov } from '../render/renderer.ts';
import type { World } from '../render/world.ts';
import type { MeState } from '../scene.ts';
import type { Settings } from '../settings.ts';
import { TOUCH } from '../touch.ts';
import type { Hud } from './hud.ts';
import type { SlotMachine } from './slot.ts';
import type { Tracers } from './tracers.ts';

export interface MatchDeps {
  map: GameMap;
  collision: CollisionWorld;
  world: World;
  effects: Effects;
  tracers: Tracers;
  hud: Hud;
  chat: Chat;
  slot: SlotMachine;
  sound: Sound;
  input: InputDevice;
  settings: Settings;
  net: Net;
  me: () => MeState;
}

interface Pose extends AvatarPose {
  valid: boolean;
}

/** Прицеливание: поле зрения во столько раз уже */
const ADS_ZOOM = 1.25;
/** Оптика AWP: приближение и мышь (палец) — во столько раз медленнее обычного прицела */
const AWP_ZOOM = 4;
const AWP_SENS = 0.35;
/** Крестик блокировки: мир ближе точки прицела хотя бы на столько (м) */
const BLOCK_MARGIN = 0.3;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _look = new THREE.Vector3();
const _f = { x: 0, y: 0, z: 0 };
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();

export class Match {
  private readonly d: MatchDeps;
  private readonly clock = new ClockSync();
  private readonly predictor: Predictor;
  private readonly tracks = new Map<number, RemoteTrack>();
  private readonly avatars = new Map<number, Avatar>();
  private readonly poses = new Map<number, Pose>();
  private readonly roster = new Map<number, RosterEntry>();
  private rosterList: RosterEntry[] = [];
  private readonly header = makeHeader();
  private readonly selfSnap: PlayerState = makeState();
  private readonly ents: EntitySnap[] = [];
  private readonly sample: RemoteSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, extra: 0 };
  private readonly seen = new Set<number>();
  private readonly hit = makeRayHit();
  private readonly localAvatar: Avatar;
  private readonly steps = new Map<number, number>();

  myId = 0;
  myTeam: 0 | 1 = 0;
  ready = false;
  phase = PHASE_WARMUP;
  phaseEnd = 0;
  scoreA = 0;
  scoreB = 0;
  private pickups = -1;
  /** Где AWP (хвост снимка): AWP_LYING — на кресте, 0 — нет, иначе номер того, у кого в руках; −1 — ещё не знаем */
  private awpAt = -1;
  /** Смотрю в оптику AWP */
  private scoped = false;

  // свой игрок
  private alive = false;
  private hp = 100;
  private armor = 0;
  private protectedNow = false;
  private bonus: SlotBonus | null = null;
  private reels: number[] = [];
  private respawnAt = 0;
  private deathX = 0;
  private deathY = 0;
  private deathZ = 0;
  private killer = 0;
  private stepDist = 0;

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
  /** Плечо камеры: +1 — правое, −1 — левое (Q); sideSmooth — плавно к нему */
  private shoulder: 1 | -1 = 1;
  private sideSmooth = 1;
  /** 0 — от бедра, 1 — прицеливание (плавно) */
  private adsT = 0;
  private readonly rig: RigParams = { ...RIG_PB };
  private readonly camV: V3 = { x: 0, y: 0, z: 0 };
  /** Опора камеры (ноги своей желейки в этом кадре) и взгляд с отдачей — для крестика блокировки */
  private readonly pivot: V3 = { x: 0, y: 0, z: 0 };
  private viewYaw = 0;
  private viewPitch = 0;
  private readonly aimP: V3 = { x: 0, y: 0, z: 0 };
  /** Живые противники тройками (x, y ног, z): цели прицела и своего выстрела */
  private readonly tg: number[] = [];
  private readonly shotDir = { dirX: 0, dirY: 0, dirZ: -1 };

  // служебное
  private time = 0;
  private boardHeld = false;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private lastFrameMs = 0;

  constructor(deps: MatchDeps) {
    this.d = deps;
    this.predictor = new Predictor(deps.collision);
    this.localAvatar = new Avatar(0, { gun: true });
    this.localAvatar.setOutfit(deps.me().outfit);
    // своя желейка — как свои: жилет цвета команды и спокойный контур (ника у неё нет)
    this.localAvatar.setInfo(deps.me().nick, 0, true, deps.me().level ?? 1);
    this.localAvatar.addTo(deps.world.scene);
    deps.effects.clearSplats();
    deps.effects.onBallHitsPlayer = (victim, x, y, z, head) => {
      this.avatars.get(victim)?.onHit(x, y, z, head);
    };
    deps.effects.onImpact = (x, y, z, kind) => {
      const dist = this.camPos.distanceTo(_v.set(x, y, z));
      if (kind === 0) this.d.sound.splat([x, y, z], dist);
    };

    deps.slot.onPull = () => deps.net.send({ t: 'pull' });
    // бонус попадает в интерфейс, только когда барабаны остановятся, — без спойлера
    deps.slot.onReveal = (reels, bonus) => {
      this.bonus = bonus;
      this.reels = reels;
    };
  }

  dispose(): void {
    for (const av of this.avatars.values()) av.dispose(this.d.world.scene);
    this.avatars.clear();
    this.localAvatar.dispose(this.d.world.scene);
    this.d.effects.clearSplats();
    this.d.tracers.clear();
    this.d.input.scopeSens = 1;
    this.d.hud.setScope(false);
    this.d.slot.reset();
    this.d.hud.hideDeath();
    this.d.hud.hideEnd();
    this.d.hud.showBoard(false, [], 0);
  }

  // ------------------------------------------------------------ клавиши

  /** Клавиши, которые не про движение: таблица, команды. Возвращает true, если съели. */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    const { chat, input } = this.d;
    if (code === 'Tab') {
      e.preventDefault();
      this.boardHeld = down;
      return true;
    }
    if (!down || chat.isOpen || !input.locked) return false;
    if (code === 'KeyQ') {
      // камера на другое плечо — выглянуть из-за другого края укрытия
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

  /** ЛКМ или E: во время разминки — рычаг автомата. */
  onUse(): void {
    if (this.phase === PHASE_WARMUP && this.d.slot.visible) this.d.slot.tryPull();
  }

  // ------------------------------------------------------------ сеть: JSON

  onJson(m: ServerMsg): void {
    const { slot } = this.d;
    switch (m.t) {
      case 'welcome': {
        this.myId = m.id;
        this.myTeam = m.team;
        this.predictor.seed = m.seed;
        this.phase = m.phase;
        this.phaseEnd = m.phaseEnd;
        this.ready = true;
        this.setRoster(m.roster);
        this.localAvatar.setTeam(m.team);
        if (m.phase === PHASE_WARMUP) slot.show(this.roster.get(m.id)?.reels ?? []);
        break;
      }
      case 'roster':
        this.setRoster(m.players);
        break;
      case 'ev':
        this.onEvents(m.k, m.e);
        break;
      case 'slot':
        slot.spin(m.reels, m.bonus, m.auto);
        break;
      case 'round':
        this.onRound(m.phase, m.end, m.scores, m.winner, m.mvp);
        break;
      case 'pbReward':
        this.onReward(m);
        break;
    }
  }

  /** Жетоны за раунд — строкой в финальном окне (баланс придёт отдельным сообщением). */
  private onReward(r: PbReward): void {
    const parts = [`раунд +${r.round}`];
    if (r.kills) parts.push(`сбитые +${r.kills}`);
    if (r.win) parts.push(`победа +${r.win}`);
    if (r.mvp) parts.push(`лучший +${r.mvp}`);
    this.d.hud.showReward(`+${r.total} ${plural(r.total, 'жетон', 'жетона', 'жетонов')}: ${parts.join(' · ')}`);
  }

  private setRoster(list: RosterEntry[]): void {
    this.rosterList = list;
    this.roster.clear();
    for (const r of list) this.roster.set(r.id, r);
    const me = this.roster.get(this.myId);
    if (me && me.team !== this.myTeam) {
      this.myTeam = me.team;
      this.localAvatar.setTeam(me.team);
    }
    for (const [id, av] of this.avatars) {
      const r = this.roster.get(id);
      if (r) {
        av.setInfo(r.name, r.team, r.team === this.myTeam, r.level ?? 1);
        av.setOutfit(r.o);
      }
    }
    if (me) {
      this.localAvatar.setInfo(me.name, me.team, true, me.level ?? 1);
      this.localAvatar.setOutfit(me.o);
    }
  }

  private teamOf(id: number): 0 | 1 {
    const r = this.roster.get(id);
    if (r) return r.team;
    const t = this.tracks.get(id);
    return t && t.lastFlags & E_TEAM ? 1 : 0;
  }

  private nameOf(id: number): string {
    return this.roster.get(id)?.name ?? '???';
  }

  private onRound(phase: number, end: number, scores: [number, number], winner: number, mvp: number): void {
    const { hud, slot, sound, effects } = this.d;
    this.phase = phase;
    this.phaseEnd = end;
    this.scoreA = scores[0];
    this.scoreB = scores[1];
    if (phase === PHASE_WARMUP) {
      effects.clearSplats();
      for (const av of this.avatars.values()) av.clearPaint();
      hud.hideEnd();
      this.bonus = null;
      this.reels = [];
      slot.show([]);
      hud.centerMessage('Разминка', TOUCH ? 'Дёрни рычаг автомата — нажми на него или 💥' : 'Дёрни рычаг автомата — ЛКМ или E', '', 2600);
    } else if (phase === PHASE_PLAY) {
      if (slot.visible) slot.hide(1400);
      hud.hideEnd();
      sound.whistle();
      hud.centerMessage('Бой!', `Первые до ${SCORE_LIMIT} побеждают`, '', 2000);
    } else if (phase === PHASE_END) {
      sound.horn(0.4);
      hud.showEnd(winner, this.roster.get(mvp) ?? null, scores, this.rosterList, this.myId, this.myTeam);
    }
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
    this.scoreA = h.scoreA;
    this.scoreB = h.scoreB;
    if (h.pickups !== this.pickups) {
      for (let i = 0; i < this.d.world.jars.length; i++) this.d.world.setJar(i, (h.pickups & (1 << i)) !== 0);
      this.pickups = h.pickups;
    }
    if (buf.byteLength >= h.tail + PB_TAIL_BYTES) {
      const at = new DataView(buf).getUint8(h.tail);
      if (at !== this.awpAt) {
        this.awpAt = at;
        this.d.world.setAwp(at === AWP_LYING);
      }
    }

    let selfFlags = -1;
    this.seen.clear();
    for (let i = 0; i < n; i++) {
      const e = this.ents[i];
      if (e.id === this.myId) {
        selfFlags = e.flags;
        this.hp = e.hp;
        this.armor = e.armor;
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
      if (!this.seen.has(id)) {
        this.tracks.delete(id);
        this.poses.delete(id);
        const av = this.avatars.get(id);
        if (av) {
          av.dispose(this.d.world.scene);
          this.avatars.delete(id);
        }
      }
    }

    const wasAlive = this.alive;
    if (selfFlags >= 0) {
      this.alive = (selfFlags & E_ALIVE) !== 0;
      this.protectedNow = (selfFlags & E_PROTECTED) !== 0;
    }
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

  private onLocalSpawn(): void {
    this.d.hud.hideDeath();
    this.stepSmooth = 0;
    this.camInit = false;
  }

  private onLocalDown(): void {
    const s = this.predictor.state;
    this.deathX = s.x;
    this.deathY = s.y;
    this.deathZ = s.z;
    if (!this.respawnAt || this.respawnAt < this.clock.estimate(performance.now())) {
      this.respawnAt = this.clock.estimate(performance.now()) + RESPAWN_TICKS;
    }
  }

  // ------------------------------------------------------------ события

  private onEvents(k: number, list: GameEvent[]): void {
    const { hud, sound, effects, world } = this.d;
    const now = performance.now();
    for (const e of list) {
      switch (e[0]) {
        case 'shot': {
          const [, pid, ox, oy, oz, ex, ey, ez, kind, nx, ny, nz] = e;
          if (pid === this.myId) break; // свой выстрел уже нарисован предсказанием
          const av = this.avatars.get(pid);
          const color = TEAM_COLORS[this.teamOf(pid)];
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
          // Летит в меня: обрываем шарик за метр до лица, дальше — клякса на «маске» в интерфейсе
          let tx = ex;
          let ty = ey;
          let tz = ez;
          let impact = kind;
          if (kind === 1 && this.alive && this.camPos.distanceTo(_v.set(ex, ey, ez)) < 1.8) {
            const dx = ex - sx;
            const dy = ey - sy;
            const dz = ez - sz;
            const len = Math.hypot(dx, dy, dz) || 1;
            const k = Math.max(0, len - 1.1) / len;
            tx = sx + dx * k;
            ty = sy + dy * k;
            tz = sz + dz * k;
            impact = 2;
          }
          effects.shootBall(sx, sy, sz, tx, ty, tz, color, pid, { kind: impact, nx, ny, nz, victim: 0, head: false });
          sound.shot([sx, sy, sz], this.camPos.distanceTo(_v.set(sx, sy, sz)));
          break;
        }
        case 'snipe': {
          const [, pid, ox, oy, oz, ex, ey, ez, kind, nx, ny, nz] = e;
          if (pid === this.myId) break; // свой выстрел уже нарисован предсказанием
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
          }
          this.awpShotFx(sx, sy, sz, ex, ey, ez, kind, nx, ny, nz, TEAM_COLORS[this.teamOf(pid)], false);
          break;
        }
        case 'awp': {
          const [, what, pid] = e;
          const a = world.awp;
          if (!a) break;
          const p = a.group.position;
          if (what === 1) {
            effects.burst(p.x, p.y + 1.2, p.z, 0xffc94d, 22, 4, 0, 1, 0, 0.04);
            sound.awpTake(pid === this.myId ? null : [p.x, p.y + 1.2, p.z]);
            if (pid === this.myId) {
              // на телефоне короче: оптика — та же кнопка «прицел», а длинная строка налезает на кнопки
              hud.bannerMessage(TOUCH ? `🎯 AWP! <b>${AWP_SHOTS} выстрела</b> — сбивает с одного` : `🎯 AWP! <b>${AWP_SHOTS} выстрела</b> — сбивает с одного · ПКМ — оптика`, 2800);
            }
          } else {
            effects.puff(p.x, p.y + 1.2, p.z, 1.6, 0xfff1c8, 0.6, 0.5, 0.5);
            sound.awpBack([p.x, p.y + 1.2, p.z]);
          }
          break;
        }
        case 'hit': {
          const [, attacker, victim, dmg, head, hx, hy, hz] = e;
          const isHead = head === 1;
          if (attacker === this.myId) {
            hud.hitmarker(isHead, false);
            sound.hitmarker(isHead);
            hud.damageNumber(hx, hy, hz, dmg, isHead);
            const av = this.avatars.get(victim);
            if (av) av.showHpUntil = now + 2600;
          }
          if (victim === this.myId) {
            const ang = this.angleTo(attacker, hx, hz);
            hud.damageFrom(ang, dmg >= 25);
            hud.paintSplat(TEAM_CSS[this.teamOf(attacker)], ang, isHead);
            sound.hurt(isHead);
            this.shake = Math.min(1, this.shake + (isHead ? 0.6 : 0.35));
          } else {
            const ball = effects.lastBallOf(attacker);
            if (ball) {
              ball.impact.kind = 1;
              ball.impact.victim = victim;
              ball.impact.head = isHead;
            } else {
              this.avatars.get(victim)?.onHit(hx, hy, hz, isHead);
            }
          }
          break;
        }
        case 'kill': {
          const [, killer, victim, head, how] = e;
          const isHead = head === 1;
          const mine = killer === this.myId || victim === this.myId;
          hud.killfeed(killer ? this.nameOf(killer) : '', this.teamOf(killer), this.nameOf(victim), this.teamOf(victim), isHead, how, mine);
          const vColor = TEAM_COLORS[this.teamOf(victim)];
          if (victim === this.myId) {
            const s = this.predictor.state;
            this.killer = killer;
            this.respawnAt = k + RESPAWN_TICKS;
            hud.showDeath(killer ? this.nameOf(killer) : null, this.teamOf(killer), how);
            sound.death();
            if (how !== 'drown') effects.deathSplat(s.x, s.y, s.z, vColor);
            this.deathX = s.x;
            this.deathY = s.y;
            this.deathZ = s.z;
          } else {
            const av = this.avatars.get(victim);
            const p = this.poses.get(victim);
            if (av && p && p.valid && how !== 'drown') {
              effects.deathSplat(p.x, p.y, p.z, vColor);
              sound.popAt([p.x, p.y + 0.8, p.z], this.camPos.distanceTo(_v.set(p.x, p.y, p.z)));
            }
            av?.pop();
          }
          if (killer === this.myId && victim !== this.myId) {
            sound.kill(isHead);
            hud.hitmarker(isHead, true);
            const who = `<b style="color:${TEAM_CSS[this.teamOf(victim)]}">${escapeHtml(this.nameOf(victim))}</b>`;
            hud.bannerMessage(how === 'awp' ? `🎯 Снят из AWP: ${who}` : `${isHead ? '🎯 ' : ''}Сбит ${who}`);
          }
          break;
        }
        case 'spawn': {
          const [, id, x, y, z, yaw] = e;
          if (id === this.myId) {
            this.d.input.yaw = yaw;
            this.d.input.pitch = 0;
            this.killer = 0;
          } else {
            effects.puff(x, y + 0.8, z, 1.5, 0xfff4e0, 0.45, 0.6, 0.5);
          }
          break;
        }
        case 'jam': {
          const [, i, taken, pid] = e;
          world.setJar(i, taken === 0);
          const j = world.jars[i];
          if (taken === 1 && j) {
            effects.burst(j.x, j.y + 0.6, j.z, 0xc0162f, 18, 3.5, 0, 1, 0, 0.05);
            sound.jam(pid === this.myId ? null : [j.x, j.y, j.z]);
            if (pid === this.myId) hud.bannerMessage('🍓 Варенье! <b>+45 HP</b>', 1400);
          }
          break;
        }
        case 'splash': {
          const [, x, z, pid] = e;
          effects.waterSplash(x, z, true);
          sound.splash(pid === this.myId ? null : [x, WATER_Y, z]);
          break;
        }
        case 'streak': {
          const [, id, n] = e;
          if (id === this.myId) {
            hud.bannerMessage(`🔥 Серия: <b>${n}</b> подряд!`, 1800);
            sound.streak(n);
          } else if (n === 3 || n === 5 || n === 7 || n >= 10) {
            this.d.chat.note(`🔥 ${this.nameOf(id)} разошёлся: ${n} подряд`);
          }
          break;
        }
      }
    }
  }

  /** Угол на атакующего относительно взгляда (0 — впереди, по часовой). */
  private angleTo(attacker: number, fallbackX: number, fallbackZ: number): number {
    const p = this.poses.get(attacker);
    const s = this.predictor.state;
    const tx = p && p.valid ? p.x : fallbackX;
    const tz = p && p.valid ? p.z : fallbackZ;
    const a = Math.atan2(-(tx - s.x), -(tz - s.z));
    return -wrapAngle(a - this.d.input.yaw);
  }

  // ------------------------------------------------------------ тик предсказания

  private tick(): void {
    const { input } = this.d;
    const inp = this.inputs[0];
    inp.seq = ++this.seq;
    // плечо — серверу: от него зависит, куда полетит шарик
    inp.buttons = input.sample() | (this.shoulder < 0 ? BTN_SHOULDER : 0);
    inp.yaw = Math.fround(input.yaw);
    inp.pitch = Math.fround(input.pitch);
    inp.viewTick = Math.max(0, this.clock.renderTick);
    const canFire = this.phase === PHASE_PLAY;
    if (this.alive) {
      const ev = this.predictor.step(inp, canFire);
      this.onLocalEvents(ev, inp);
    } else {
      this.predictor.record(inp, canFire);
    }
    this.d.net.sendBinary(encodeInputs(this.inputs, 0, 1, this.d.net.epoch));
  }

  private onLocalEvents(ev: StepEvents, inp: Input): void {
    const { sound, world } = this.d;
    const s = this.predictor.state;
    if (ev.fired) this.localShot(s, ev, (inp.buttons & BTN_ADS) !== 0);
    if (ev.awp && s.awp === 0) this.d.hud.bannerMessage('AWP пуста — снова маркер', 1500);
    if (ev.jumped) sound.jump();
    if (ev.landed) {
      sound.land(ev.landSpeed);
      this.dipV -= Math.min(2.2, ev.landSpeed * 0.1);
    }
    if (ev.bounced) {
      sound.trampoline(null);
      world.bounceTrampoline(s.x, s.z, 1.3);
      this.fovKick = Math.max(this.fovKick, 5);
      this.dipV -= 1.2;
    }
    if (ev.dashed) {
      sound.dash();
      this.fovKick = Math.max(this.fovKick, 7);
    }
    if (ev.reloadStart) sound.reload();
    if (ev.dry) sound.dry();
    if (ev.stepUp > 0) this.stepSmooth = Math.max(-0.6, this.stepSmooth - ev.stepUp);
    // шаги
    if (s.grounded) {
      const hs = Math.hypot(s.vx, s.vz);
      this.stepDist += hs / TICK_RATE;
      if (this.stepDist > 2.1) {
        this.stepDist = 0;
        sound.step(null);
      }
    }
  }

  /**
   * Свой выстрел: куда полетит шарик — считаем сразу, не дожидаясь сервера, и так же, как он:
   * луч из камеры по центру экрана → точка прицела → из глаз в неё, с тем же разбросом.
   */
  private localShot(s: PlayerState, ev: StepEvents, ads: boolean): void {
    const { collision, effects, sound } = this.d;
    const n = this.collectTargets();
    const tg = this.tg;
    const dir = this.shotDir;
    tpsShotDir(s, ev.aimYaw, ev.aimPitch, ev.spread, this.predictor.seed, s.shots, this.shoulder, ads, collision, tg, n, dir);
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
    for (let i = 0; i < n; i++) {
      const t = rayEllipsoid(ox, oy, oz, dx, dy, dz, tg[i * 3], tg[i * 3 + 1] + HITBOX_CY, tg[i * 3 + 2], HITBOX_RX, HITBOX_RY);
      if (t >= 0 && t < best) {
        best = t;
        kind = 1;
      }
    }
    // шарик вылетает из маркера своей желейки (с AWP — трассер из её дула)
    const av = this.localAvatar;
    av.muzzle(_v);
    av.onShot();
    if (ev.awp) {
      this.awpShotFx(_v.x, _v.y, _v.z, ox + dx * best, oy + dy * best, oz + dz * best, kind, nx, ny, nz, TEAM_COLORS[this.myTeam], true);
      this.shake = Math.min(1, this.shake + 0.5);
      return;
    }
    effects.puff(_v.x, _v.y, _v.z, 0.35, 0xffffff, 0.14, 0.3, 0.45, 1.4);
    effects.shootBall(_v.x, _v.y, _v.z, ox + dx * best, oy + dy * best, oz + dz * best, TEAM_COLORS[this.myTeam], this.myId, { kind, nx, ny, nz, victim: 0, head: false });
    sound.shot(null);
  }

  /**
   * Выстрел AWP: вспышка у дула, трассер, на стене — большая клякса, в игроке — брызги; звук тяжёлый,
   * слышно на весь причал. mine — свой (звук без объёма, со щелчком затвора).
   */
  private awpShotFx(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number, kind: number, nx: number, ny: number, nz: number, color: number, mine: boolean): void {
    const { effects, sound, tracers } = this.d;
    effects.puff(sx, sy, sz, 0.7, 0xffffff, 0.25, 0.4, 0.7, 2.2);
    effects.puff(sx, sy, sz, 0.45, 0xfff0b0, 0.08, 0, 0.9, 1.2);
    tracers.shoot(sx, sy, sz, ex, ey, ez, color);
    if (kind === 0) {
      effects.splat(ex, ey, ez, nx, ny, nz, 1 + Math.random() * 0.3, color, -1);
      effects.burst(ex, ey, ez, color, 16, 5, nx, ny, nz, 0.045);
      effects.puff(ex, ey, ez, 0.8, 0xe8e2d4, 0.5, 0.3, 0.35);
    } else if (kind === 1) {
      effects.burst(ex, ey, ez, color, 26, 6, 0, 0.4, 0, 0.05);
    }
    sound.awpShot(mine ? null : [sx, sy, sz], mine ? 0 : this.camPos.distanceTo(_v2.set(sx, sy, sz)));
    if (kind === 0) sound.splat([ex, ey, ez], this.camPos.distanceTo(_v2.set(ex, ey, ez)));
  }

  /** Живые противники по интерполяции — то, что видно на экране (сервер отматывает к тому же моменту). */
  private collectTargets(): number {
    const tg = this.tg;
    let n = 0;
    for (const [id, p] of this.poses) {
      if (!p.valid || !(p.flags & E_ALIVE) || this.teamOf(id) === this.myTeam) continue;
      tg[n * 3] = p.x;
      tg[n * 3 + 1] = p.y;
      tg[n * 3 + 2] = p.z;
      n++;
    }
    return n;
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
      // темп тиков подстраиваем по очереди на сервере: держим там ~1 вход в запасе
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

    d.effects.update(dt);
    d.tracers.update(dt);
    d.world.update(dt);
    tickAvatarShared(this.time, d.world.renderer.canvas.clientHeight || window.innerHeight);
    this.updateHud(dt);

    const cam = d.world.camera;
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
        const team = info ? info.team : tr.lastFlags & E_TEAM ? 1 : 0;
        av = new Avatar(id, { gun: true });
        av.setTeam(team);
        if (info) {
          av.setInfo(info.name, info.team, info.team === this.myTeam, info.level ?? 1);
          av.setOutfit(info.o);
        }
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
        const team = s.flags & E_TEAM ? 1 : 0;
        if (team !== av.team) av.setInfo(info?.name ?? av.name, team, team === this.myTeam, info?.level ?? av.level);
        // шаги чужих — по пройденному пути
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
      av.maxHp = info?.maxHp ?? 100;
      av.setAwp(this.awpAt === id);
      av.update(ok ? pose : null, dt, this.time, collision, this.camPos, false);
    }
  }

  /** Своя желейка в кадре; прячется, только если камера к ней ближе 0,9 м (прижало к стене). */
  private updateLocalAvatar(dt: number, alpha: number): void {
    const s = this.predictor.state;
    const p = this.predictor.prev;
    const o = this.predictor.offset;
    const ads = this.d.input.isHeld(BTN_ADS);
    const flags = E_ALIVE | (s.grounded ? E_GROUNDED : 0) | (ads ? E_ADS : 0) | (s.reloadT > 0 ? E_RELOAD : 0)
      | (s.dashT > 0 ? E_DASH : 0) | (this.protectedNow ? E_PROTECTED : 0);
    const pose: AvatarPose = {
      x: p.x + (s.x - p.x) * alpha + o.x,
      y: p.y + (s.y - p.y) * alpha + o.y,
      z: p.z + (s.z - p.z) * alpha + o.z,
      yaw: this.d.input.yaw,
      pitch: this.d.input.pitch,
      flags: this.alive ? flags : 0,
    };
    this.localAvatar.setAwp(this.alive && s.awp > 0);
    // в оптике своя желейка не мешает смотреть
    this.localAvatar.hidden = this.scoped;
    this.localAvatar.update(this.alive ? pose : null, dt, this.time, this.d.collision, this.camPos, true);
  }

  private updateCamera(dt: number, alpha: number): void {
    const { world, input, settings } = this.d;
    const cam = world.camera;
    const s = this.predictor.state;
    const p = this.predictor.prev;
    const o = this.predictor.offset;

    // пружина приседания при приземлении
    this.dipV += (-this.dip * 180 - this.dipV * 16) * dt;
    this.dip += this.dipV * dt;
    this.stepSmooth *= Math.exp(-dt * 16);
    this.shake *= Math.exp(-dt * 7);
    this.fovKick *= Math.exp(-dt * 6);

    // плечо и прицеливание — плавно (сервер берёт точные: плечо ±1, прицел — по кнопке)
    const ads = this.alive && input.isHeld(BTN_ADS);
    const awp = this.alive && s.awp > 0;
    this.adsT = damp(this.adsT, ads ? 1 : 0, 14, dt);
    this.scoped = awp && ads && this.adsT > 0.6;
    input.scopeSens = awp ? AWP_SENS : 1;
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
      // камера смерти: поднимаемся над местом, где лопнули, и смотрим на того, кто попал
      const kp = this.killer ? this.poses.get(this.killer) : undefined;
      let tx = this.deathX;
      let ty = this.deathY + 0.8;
      let tz = this.deathZ;
      if (kp && kp.valid && kp.flags & E_ALIVE) {
        tx = kp.x;
        ty = kp.y + 1;
        tz = kp.z;
      }
      const dx = tx - this.deathX;
      const dz = tz - this.deathZ;
      const dl = Math.hypot(dx, dz) || 1;
      const want = _v.set(this.deathX - (dx / dl) * 1.8, Math.max(this.deathY, WATER_Y) + 3.2, this.deathZ - (dz / dl) * 1.8);
      // не залезать в стены
      const fromY = Math.max(this.deathY, WATER_Y) + 1.2;
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
      const kpos = 1 - Math.exp(-dt * 3.5);
      this.camPos.lerp(want, kpos);
      _m.lookAt(this.camPos, _look.set(tx, ty, tz), _v2.set(0, 1, 0));
      _q.setFromRotationMatrix(_m);
      this.camQuat.slerp(_q, 1 - Math.exp(-dt * 4));
      cam.position.copy(this.camPos);
      cam.quaternion.copy(this.camQuat);
      // чтобы после появления взгляд не прыгал — держим ввод в том же направлении
      _e.setFromQuaternion(this.camQuat, 'YXZ');
    }

    // поле зрения: настройка — горизонталь для 16:9
    const vBase = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(settings.fov) / 2) / (16 / 9)) * 180) / Math.PI;
    const zoom = ads ? (awp ? AWP_ZOOM : ADS_ZOOM) : 1;
    const target = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vBase) / 2) / zoom) * 180) / Math.PI + this.fovKick;
    this.curFov = damp(this.curFov, target, 18, dt);
    const f = narrowFov(this.curFov, cam.aspect);
    if (Math.abs(cam.fov - f) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  }

  private updateHud(dt: number): void {
    const { hud, world, settings, input, slot } = this.d;
    const now = performance.now();
    const est = this.clock.estimate(now);
    const left = (this.phaseEnd - est) / TICK_RATE;
    const phaseText = this.phase === PHASE_WARMUP ? 'Разминка' : this.phase === PHASE_END ? 'Финал' : 'Бой';
    hud.setClock(phaseText, left, this.phase === PHASE_PLAY && left < 30);
    hud.setScores(this.scoreA, this.scoreB, SCORE_LIMIT);

    // Пока барабаны крутятся, сервер уже выдал бонус, но показываем здоровье и броню как без него
    const maxHp = BASE_HEALTH + (this.bonus?.hp ?? 0);
    const hp = this.alive ? Math.min(this.hp, maxHp) : 0;
    hud.setVitals(hp, maxHp, this.bonus ? this.armor : 0, this.bonus?.armor ?? 0, this.alive && this.protectedNow);
    hud.setBonus(this.bonus, this.reels);
    const s = this.predictor.state;
    // с AWP — сколько выстрелов осталось и полоска затвора; иначе магазин маркера
    hud.setAwp(s.awp > 0);
    if (s.awp > 0) {
      hud.setAmmo(s.awp, AWP_SHOTS, s.fireCd > 0 ? clamp(1 - s.fireCd / AWP_INTERVAL, 0, 1) : null, 1);
    } else {
      const reload = s.reloadT > 0 ? clamp(1 - s.reloadT / RELOAD_TICKS, 0, 1) : null;
      hud.setAmmo(s.ammo, MAG_SIZE, reload);
    }
    hud.setScope(this.scoped);
    hud.setDash(1 - s.dashCd / DASH_COOLDOWN_TICKS);

    const ads = input.isHeld(BTN_ADS);
    const cam = world.camera;
    const h = world.renderer.canvas.clientHeight || window.innerHeight;
    const spread = currentSpread(s, ads);
    const gap = 3 + (Math.tan(spread) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) * (h / 2);
    const aiming = this.alive && !(this.phase === PHASE_WARMUP && slot.visible);
    hud.setCrosshair(gap, aiming && !this.scoped, ads);
    this.updateBlocked(aiming);
    hud.setAliveUi(this.alive);
    if (!this.alive) hud.setRespawn(Math.max(0, (this.respawnAt - est) / TICK_RATE));

    hud.showBoard(this.boardHeld && this.phase !== PHASE_END, this.rosterList, this.myId);
    hud.updateFloaters(dt, cam, window.innerWidth, window.innerHeight);
    hud.setStats(settings.showStats ? `${this.fps} FPS · ${Math.round(this.d.net.pingMs)} мс · буфер ${this.clock.delay.toFixed(1)} т · кадр ${this.lastFrameMs.toFixed(1)} мс` : null);
  }

  /**
   * Крестик блокировки: шарик летит из глаз, а не из камеры. Если на пути из глаз к точке прицела
   * есть стена (угол контейнера у лица) — показываем, куда он на самом деле попадёт.
   */
  private updateBlocked(aiming: boolean): void {
    const { hud, collision, world } = this.d;
    if (!aiming) {
      hud.setBlocked(0, 0, false);
      return;
    }
    const pv = this.pivot;
    const n = this.collectTargets();
    aimPoint(this.camV, pv.x, pv.y + PIVOT_Y, pv.z, this.viewYaw, this.viewPitch, collision, this.tg, n, this.aimP);
    const ex = pv.x;
    const ey = pv.y + EYE_HEIGHT;
    const ez = pv.z;
    let vx = this.aimP.x - ex;
    let vy = this.aimP.y - ey;
    let vz = this.aimP.z - ez;
    const len = Math.hypot(vx, vy, vz);
    viewDir(this.viewYaw, this.viewPitch, _f);
    // точка прицела почти у лица — сервер стреляет прямо по взгляду, блокировки нет
    if (len < 1e-6 || vx * _f.x + vy * _f.y + vz * _f.z < AIM_FALLBACK) {
      hud.setBlocked(0, 0, false);
      return;
    }
    vx /= len;
    vy /= len;
    vz /= len;
    if (len <= BLOCK_MARGIN || !collision.raycast(ex, ey, ez, vx, vy, vz, len - BLOCK_MARGIN, this.hit, true)) {
      hud.setBlocked(0, 0, false);
      return;
    }
    const cam = world.camera;
    cam.updateMatrixWorld();
    _v.set(ex + vx * this.hit.t, ey + vy * this.hit.t, ez + vz * this.hit.t).project(cam);
    if (_v.z > 1) {
      hud.setBlocked(0, 0, false);
      return;
    }
    const canvas = world.renderer.canvas;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    hud.setBlocked((_v.x * 0.5 + 0.5) * w, (-_v.y * 0.5 + 0.5) * h, true);
  }

  /** Для отладки и тестов в браузере. */
  debugState(): Record<string, unknown> {
    const s = this.predictor.state;
    const c = this.d.world.camera.position;
    return {
      id: this.myId, team: this.myTeam, alive: this.alive, hp: this.hp, phase: this.phase,
      pos: [s.x, s.y, s.z], ammo: s.ammo, corrections: this.predictor.corrections,
      renderTick: this.clock.renderTick, delay: this.clock.delay, jitter: this.clock.jitter,
      remotes: this.tracks.size, queue: this.queueAvg, fps: this.fps,
      shoulder: this.shoulder, side: this.sideSmooth, adsT: this.adsT, cam: [c.x, c.y, c.z], meShown: this.localAvatar.shown,
      awp: s.awp, awpAt: this.awpAt, scoped: this.scoped, fov: this.d.world.camera.fov,
    };
  }
}

/** 1 жетон, 2 жетона, 5 жетонов */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
