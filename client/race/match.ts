// Заезд на клиенте: предсказание своего карта, интерполяция чужих, события гонки, камера погони, звук и интерфейс.
// Свой карт едет сразу по нажатию (KartPredictor), сервер поправляет; чужие — по снимкам чуть в прошлом.
// Один объект на одну гонку; мир трассы, эффекты и интерфейс — у сцены, соединение — у оболочки.
import * as THREE from 'three';
import { TICK_MS, TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import type { RcReward } from '../../shared/economy.ts';
import {
  BOOST_TURBO, ITEM_BUBBLE, ITEM_CLAP, ITEM_HINTS, ITEM_ICONS, ITEM_NAMES, ITEM_NONE, ITEM_TURBO, RC_GRID, RC_LAPS, RC_MAX_TICKS,
  RC_RACE, RC_RESULTS, RC_RESULTS_TICKS, makeKartState, sparkLevel, type KartEvents,
} from '../../shared/kart.ts';
import {
  KE_BOOST, KE_DRIFT, KE_GROUND, KE_ON, KE_PAINT, KM_BUBBLE, decodeKartSnapshot, kartFlags, kartMisc, kartYaw, makeKartHeader,
  type KartSnap, type TrapSnap,
} from '../../shared/kartnet.ts';
import { clamp, damp, lerpAngle, wrapAngle } from '../../shared/math.ts';
import type { KartInfo, RaceEvent, RaceResultRow, ServerMsg } from '../../shared/messages.ts';
import { SNAP_HAS_SELF, SNAP_SELF_RESET, encodeInputs, type EntitySnap } from '../../shared/protocol.ts';
import { makeInput, type Input } from '../../shared/sim.ts';
import { SURF_SAND, locate, makeLoc } from '../../shared/track.ts';
import type { Sound } from '../audio.ts';
import type { Chat } from '../chat.ts';
import type { Input as InputDevice } from '../input.ts';
import { ClockSync, type Net } from '../net.ts';
import { RemoteTrack, type RemoteSample } from '../remote.ts';
import { tickAvatarShared } from '../render/avatar.ts';
import { narrowFov } from '../render/renderer.ts';
import type { Settings } from '../settings.ts';
import type { Toasts } from '../ui/toasts.ts';
import type { MapDot, RaceHud } from './hud.ts';
import { KART_COLORS, Kart3D, makeKartPose, type KartFx, type KartPose } from './kart3d.ts';
import { KartPredictor } from './predict.ts';
import type { RaceWorld } from './world.ts';

export interface RaceMatchDeps {
  world: RaceWorld;
  fx: KartFx;
  hud: RaceHud;
  chat: Chat;
  toasts: Toasts;
  sound: Sound;
  input: InputDevice;
  settings: Settings;
  net: Net;
}

/** Снимки гонки — каждый второй тик: задержка интерполяции чужих как на набережной */
const MIN_DELAY = 2.6;
/** Камера погони: позади, выше, смотрит вперёд (м); не дальше стольких метров за краем дороги */
const CAM_BACK = 6.2;
const CAM_UP = 2.4;
const CAM_AHEAD = 4;
const CAM_MARGIN = 1;
/** Камера не ниже стольких метров над землёй и дорогой под собой (склоны серпантина, гребень) */
const CAM_CLEAR = 1.15;
/** Поле зрения по вертикали: 70 на месте → 78 на полной скорости, +6 в турбо */
const FOV_MIN = 70;
const FOV_SPEED = 8;
const FOV_TURBO = 6;
/** После финиша камера облетает карт — до стольких радиан */
const ORBIT_MAX = 2.4;
/**
 * Камера догоняет карт как пружина без перелёта (собственная частота, 1/с): в повороте видно, как карт
 * поворачивает, а не крутится весь мир. Отстаёт не больше чем на CAM_LAG рад.
 */
const CAM_FOLLOW = 5.5;
const CAM_LAG = 0.42;
/** Едет вперёд — камера смотрит туда, куда он едет (в заносе — по скорости, не по носу), но не дальше от носа */
const CAM_SLIP = 0.7;
/** Мышью можно оглянуться: взгляд держится секунду после мыши, потом плавно возвращается за карт */
const LOOK_MAX = 2.8;
const LOOK_HOLD = 1;
const LOOK_RETURN = 2.2;
/** Слышно моторы стольких ближайших чужих картов (дальше 80 м — нет) */
const ENGINE_VOICES = 3;
const ENGINE_FAR = 80;
/** «Не туда!» — едет против хода дольше стольких секунд */
const WRONG_WAY_S = 1;
/** Краска летит столько секунд; цвет — как клякса на карте */
const PAINT_FLY_S = 0.45;
const PAINT_COLOR = 0xff3fb0;
/** Подсказка по клавишам — на решётке и первые секунды гонки */
const HELP_TICKS = 4 * TICK_RATE;
/** Финишировал сам — итоги через столько мс: сначала баннер, фанфары и облёт камеры */
const FINISH_SHOW_MS = 2200;

const KART_CSS = KART_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);

const _v = new THREE.Vector3();

interface Remote {
  id: number;
  track: RemoteTrack;
  pose: KartPose;
  valid: boolean;
  /** Искры и ускорение — из последнего снимка */
  misc: number;
  dist: number;
}

interface PaintShot {
  x: number;
  y: number;
  z: number;
  to: number;
  t: number;
}

export class RaceMatch {
  private readonly d: RaceMatchDeps;
  private readonly clock = new ClockSync(MIN_DELAY);
  private readonly predictor: KartPredictor;
  private readonly header = makeKartHeader();
  private readonly selfSnap = makeKartState();
  private readonly list: KartSnap[] = [];
  private readonly trapList: TrapSnap[] = [];
  /** Где лежали банки: «наехал» приходит, когда банки в снимке уже нет */
  private readonly trapPos = new Map<number, { x: number; y: number; z: number }>();
  private readonly remotes = new Map<number, Remote>();
  private readonly infos = new Map<number, KartInfo>();
  private readonly karts = new Map<number, Kart3D>();
  private readonly seen = new Set<number>();
  private readonly voices = new Set<number>();
  private readonly near: Remote[] = [];
  private readonly snap: EntitySnap = { id: 0, flags: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 0, armor: 0 };
  private readonly sample: RemoteSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, extra: 0 };
  private readonly myPose: KartPose = makeKartPose();
  private readonly loc = makeLoc();
  private readonly camLoc = makeLoc();
  private readonly floorLoc = makeLoc();
  /** Сглаженный «пол» камеры (−∞ — ещё не было) */
  private camFloorY = -Infinity;
  private readonly dots: MapDot[] = [];
  private readonly shots: PaintShot[] = [];

  myId = 0;
  ready = false;
  phase = RC_GRID;
  phaseEnd = 0;
  private hasSelf = false;
  /** Конец решётки — он же тик старта гонки (0 — ещё не знаем) */
  private gridEnd = 0;
  private raceStart = 0;
  private myPlace = 0;
  private total = 0;
  private selfPainted = false;
  /** Свой пузырь — из снимка сервера (KM_BUBBLE) */
  private selfBubble = false;

  // тики и ввод
  private seq = 0;
  private acc = 0;
  private queueAvg = 1;
  private readonly inputs: Input[] = [makeInput()];

  // гонка глазами игрока
  private lapShown = 0;
  private lapSeq = 0;
  private bestMs = 0;
  private finishMs = 0;
  private countShown = -1;
  private wrongT = 0;
  private sparkLvl = 0;
  /** Тиков подряд на луже и контрольных точек подряд (срезка) */
  private slickTicks = 0;

  private rolling = false;
  private rollTickAt = 0;
  private reward: string | null = null;
  /** Когда пришёл свой финиш (часы браузера) и отложенный показ итогов */
  private finishAt = 0;
  private resultsTimer = 0;

  // камера
  private camInit = false;
  private camYaw = 0;
  private camVel = 0;
  /** Сколько секунд мышь не двигалась */
  private lookIdle = 0;
  private camY = 0;
  private look = 0;
  private mouseYaw: number;
  private orbit = 0;
  private shake = 0;
  private fovKick = 0;
  private curFov = FOV_MIN;

  // служебное
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;

  constructor(deps: RaceMatchDeps) {
    this.d = deps;
    const { world } = deps;
    this.predictor = new KartPredictor(world.track);
    this.mouseYaw = deps.input.yaw;
    deps.hud.reset();
    world.setCrates((1 << world.track.crates.length) - 1);
    world.setTraps([], 0);
    world.items.clear();
    // пока нет первого снимка — смотрим на решётку из-за последнего места
    const g = world.track.grid[0];
    const cam = world.camera;
    cam.position.set(g.x - g.hx * 22, 6, g.z - g.hz * 22);
    cam.lookAt(g.x + g.hx * 6, 0.8, g.z + g.hz * 6);
    cam.fov = FOV_MIN;
    cam.updateProjectionMatrix();
  }

  dispose(): void {
    const { world, sound, hud } = this.d;
    clearTimeout(this.resultsTimer);
    for (const v of this.karts.values()) v.dispose(world.scene);
    this.karts.clear();
    this.remotes.clear();
    this.shots.length = 0;
    sound.enginesOff();
    hud.reset();
    world.setTraps([], 0);
    world.items.clear();
    world.setCrates((1 << world.track.crates.length) - 1);
  }

  // ------------------------------------------------------------ клавиши

  /** Клавиши сверх управления: «/» — команда в чат. E и ЛКМ уходят серверу кнопками ввода. */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    const { chat, input } = this.d;
    if (!down || chat.isOpen || !input.locked) return false;
    if (code === 'Slash') {
      e.preventDefault();
      chat.open('/');
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ сеть: JSON

  onJson(m: ServerMsg): void {
    switch (m.t) {
      case 'race':
        this.myId = m.id;
        this.ready = true;
        this.setPhase(m.phase, m.phaseEnd);
        this.setRoster(m.karts);
        this.d.hud.banner(`🏁 ${this.d.world.track.name} <small>${RC_LAPS} круга</small>`, 2600);
        break;
      case 'rroster':
        this.setRoster(m.karts);
        break;
      case 'rev':
        this.onEvents(m.e);
        break;
      case 'raceEnd':
        this.onEnd(m.results);
        break;
      case 'raceReward':
        this.onReward(m);
        break;
      case 'cheer':
        this.d.toasts.show(`📣 ${m.nick} болеет за вас у табло на набережной`, 2600);
        this.d.sound.applause(null);
        break;
    }
  }

  private setPhase(phase: number, end: number): void {
    if (phase === RC_GRID && end > 0) this.gridEnd = end;
    // старт гонки — конец решётки; если решётку не застали — по сроку гонки (до первого финиша он не меняется)
    if (phase !== RC_GRID && this.raceStart === 0) this.raceStart = this.gridEnd || Math.max(1, end - RC_MAX_TICKS);
    this.phase = phase;
    this.phaseEnd = end;
  }

  private setRoster(list: KartInfo[]): void {
    this.infos.clear();
    for (const k of list) this.infos.set(k.id, k);
    for (const k of list) this.kartOf(k.id).setDriver(k.bot ? `🤖 ${k.nick}` : k.nick, k.o, k.level ?? 1);
    for (const [id, v] of this.karts) {
      if (this.infos.has(id)) continue;
      v.dispose(this.d.world.scene);
      this.karts.delete(id);
      this.dropRemote(id);
    }
  }

  private kartOf(id: number): Kart3D {
    let v = this.karts.get(id);
    if (!v) {
      v = new Kart3D(id, KART_COLORS[this.colorOf(id)], id);
      v.addTo(this.d.world.scene);
      this.karts.set(id, v);
    }
    return v;
  }

  /** Цвет карта — место на решётке (номер в снимке − 1) */
  private colorOf(id: number): number {
    return (this.infos.get(id)?.color ?? id - 1) % KART_COLORS.length;
  }

  private cssOf(id: number): string {
    return KART_CSS[this.colorOf(id)];
  }

  private nickOf(id: number): string {
    return this.infos.get(id)?.nick ?? '???';
  }

  private dropRemote(id: number): void {
    this.remotes.delete(id);
    if (this.voices.delete(id)) this.d.sound.engineStop(id);
  }

  // ------------------------------------------------------------ сеть: снимки

  onSnapshot(buf: ArrayBuffer, at: number): void {
    if (!this.ready) return;
    const n = decodeKartSnapshot(buf, this.header, this.selfSnap, this.list, this.trapList);
    if (!n) return;
    const h = this.header;
    const { world } = this.d;
    this.clock.addSample(h.tick, at);
    this.queueAvg += (h.queue - this.queueAvg) * 0.05;
    this.setPhase(h.phase, h.phaseEnd);
    world.setCrates(h.crates);
    for (let i = 0; i < n.traps; i++) {
      const t = this.trapList[i];
      const p = this.trapPos.get(t.id);
      if (p) {
        p.x = t.x;
        p.y = t.y;
        p.z = t.z;
      } else this.trapPos.set(t.id, { x: t.x, y: t.y, z: t.z });
    }
    world.setTraps(this.trapList, n.traps);

    this.total = n.karts;
    this.seen.clear();
    const es = this.snap;
    for (let i = 0; i < n.karts; i++) {
      const k = this.list[i];
      if (k.id === this.myId) {
        this.myPlace = k.place;
        this.selfPainted = (k.flags & KE_PAINT) !== 0;
        this.selfBubble = (k.misc & KM_BUBBLE) !== 0;
        continue;
      }
      let r = this.remotes.get(k.id);
      if (!r) {
        r = { id: k.id, track: new RemoteTrack(k.id), pose: makeKartPose(), valid: false, misc: 0, dist: 0 };
        this.remotes.set(k.id, r);
        this.kartOf(k.id);
      }
      // руль едет в pitch, круг и место — в hp и armor
      es.id = k.id;
      es.flags = k.flags;
      es.x = k.x;
      es.y = k.y;
      es.z = k.z;
      es.yaw = k.yaw;
      es.pitch = k.steer;
      es.hp = k.lap;
      es.armor = k.place;
      r.track.push(h.tick, es);
      r.misc = k.misc;
      this.seen.add(k.id);
    }
    for (const id of this.remotes.keys()) if (!this.seen.has(id)) this.dropRemote(id);

    if (h.flags & SNAP_HAS_SELF) {
      if (h.flags & SNAP_SELF_RESET || !this.hasSelf) {
        this.predictor.reset(this.selfSnap, h.ack);
        this.hasSelf = true;
        this.camInit = false;
      } else {
        this.predictor.reconcile(h.ack, this.selfSnap);
      }
    }
  }

  // ------------------------------------------------------------ события гонки

  private onEvents(list: RaceEvent[]): void {
    const { fx, sound, hud, world } = this.d;
    for (const e of list) {
      switch (e[0]) {
        case 'crate': {
          const [, idx, kart] = e;
          const c = world.track.crates[idx];
          if (!c) break;
          fx.cratePop(c.x, c.y + 0.85, c.z);
          sound.crate(kart === this.myId ? null : [c.x, c.y + 0.8, c.z]);
          break;
        }
        case 'item': {
          // свой бонус уже прозвучал по предсказанию
          const [, kart, item] = e;
          if (kart === this.myId && item === ITEM_BUBBLE) hud.banner('🫧 Пузырь <small>8 с · один удар бонусом</small>', 1600);
          const p = kart === this.myId ? null : this.posOf(kart);
          if (!p) break;
          if (item === ITEM_TURBO) sound.kartBoost([p.x, p.y + 0.5, p.z], BOOST_TURBO);
          else if (item === ITEM_BUBBLE) sound.bubbleUp([p.x, p.y + 0.6, p.z]);
          else if (item !== ITEM_CLAP) sound.whoosh([p.x, p.y + 0.8, p.z]);
          break;
        }
        case 'clap': {
          const [, from, hit] = e;
          const p = this.posOf(from);
          if (p) {
            world.items.clap(p.x, p.y, p.z);
            fx.confetti(p.x, p.y + 0.8, p.z, 36, 4.5);
          }
          sound.clap(from === this.myId || !p ? null : [p.x, p.y + 0.6, p.z]);
          if (hit.includes(this.myId)) {
            hud.banner('💥 Хлопок! <small>закрутило</small>', 1300);
            this.shake = Math.min(1, this.shake + 0.45);
          } else if (from === this.myId) hud.banner(hit.length ? `💥 Хлопок · задело: ${hit.length}` : '💥 Хлопок · рядом никого', 1500);
          break;
        }
        case 'pop': {
          const [, kart, from] = e;
          const p = this.posOf(kart);
          sound.bubblePop(kart === this.myId || !p ? null : [p.x, p.y + 0.6, p.z]);
          if (kart === this.myId) hud.banner(from ? '🫧 Пузырь спас!' : '🫧 Пузырь лопнул', 1300, from ? 'gold' : '');
          break;
        }
        case 'jam': {
          const [, id, kart] = e;
          const t = this.trapPos.get(id);
          this.trapPos.delete(id);
          if (!t || !kart) break;
          fx.jamSplat(t.x, t.y, t.z);
          sound.jamHit(kart === this.myId ? null : [t.x, t.y + 0.3, t.z]);
          if (kart === this.myId) {
            this.shake = Math.min(1, this.shake + 0.5);
            hud.banner('🍯 Варенье! <small>скользко</small>', 1400);
          }
          break;
        }
        case 'paint': {
          const [, from, to] = e;
          if (!to) {
            if (from === this.myId) hud.banner('🎨 Мимо: впереди никого', 1600);
            break;
          }
          const p = this.posOf(from);
          if (p) this.shots.push({ x: p.x, y: p.y + 0.9, z: p.z, to, t: 0 });
          else this.paintHit(to);
          break;
        }
        case 'finish': {
          const [, kart, place, ms] = e;
          if (kart === this.myId) {
            this.finishMs = ms;
            this.finishAt = performance.now();
            hud.banner(place === 1 ? '🏆 Финиш!' : '🏁 Финиш!', 3000, place === 1 ? 'gold' : '');
            hud.celebrate(place, Math.max(place, this.total));
            const s = this.predictor.state;
            fx.confetti(s.x, s.y + 1.2, s.z, place <= 3 ? 90 : 50, place === 1 ? 8 : 6);
            sound.fanfare(null);
            if (place <= 3) sound.applause(null);
          } else if (place === 1 && !this.predictor.state.done) {
            hud.banner(`🏁 ${escapeHtml(this.nickOf(kart))} — первый на финише`, 2200);
          }
          break;
        }
        case 'splash': {
          // свой плюх уже показан по предсказанию
          const [, kart, x, z] = e;
          if (kart === this.myId) break;
          fx.splash(x, z);
          sound.splash([x, WATER_Y, z]);
          break;
        }
        case 'bump': {
          const [, strength, x, z] = e;
          const y = world.groundAt(x, z, this.loc) + 0.45;
          fx.wallHit(x, y, z, 0, 0, strength);
          sound.kartBump([x, y, z], strength);
          const me = this.myPose;
          if (this.hasSelf && (me.x - x) ** 2 + (me.z - z) ** 2 < 4) this.shake = Math.min(1, this.shake + strength / 16);
          break;
        }
        case 'hit': {
          // свой удар о помеху уже показан по предсказанию
          const [, kart, strength, x, z] = e;
          if (kart === this.myId) break;
          const y = world.groundAt(x, z, this.loc) + 0.45;
          fx.wallHit(x, y, z, 0, 0, strength);
          sound.kartBump([x, y, z], strength);
          break;
        }
      }
    }
  }

  /** Краска долетела: клякса на карте, у себя — на весь экран. */
  private paintHit(to: number): void {
    const { fx, sound, hud } = this.d;
    const p = this.posOf(to);
    if (p) fx.paintSplat(p.x, p.y + 0.8, p.z);
    if (to === this.myId) {
      hud.paint();
      sound.tomatoSplat(null);
      this.shake = Math.min(1, this.shake + 0.35);
    } else if (p) {
      sound.tomatoSplat([p.x, p.y + 0.8, p.z]);
    }
  }

  private onEnd(rows: RaceResultRow[]): void {
    const { hud, sound } = this.d;
    hud.wrongWay(false);
    hud.setCount(null);
    const show = () => {
      hud.showResults(rows, this.myId, (id) => this.cssOf(id));
      if (this.reward) hud.setReward(this.reward);
    };
    const me = rows.find((r) => r.id === this.myId);
    // доехал последним: конец гонки приходит раньше события «финиш» (оно едет со снимком тика) — праздник всё равно покажем
    if (this.finishAt === 0 && me && me.place > 0) this.finishAt = performance.now();
    // только что финишировал сам — таблица чуть позже, иначе (время вышло) — сразу
    const wait = this.finishAt > 0 ? FINISH_SHOW_MS - (performance.now() - this.finishAt) : 0;
    if (wait > 0) this.resultsTimer = window.setTimeout(show, wait);
    else show();
    if (me && me.place === 0) sound.horn(0.3);
  }

  /** Жетоны за гонку — строкой в окне итогов (баланс придёт отдельным сообщением). */
  private onReward(r: RcReward): void {
    const parts = [`финиш +${r.finish}`];
    if (r.place) parts.push(`${r.pos}-е место +${r.place}`);
    this.reward = `+${r.total} ${plural(r.total, 'жетон', 'жетона', 'жетонов')}: ${parts.join(' · ')}`;
    this.d.hud.setReward(this.reward);
  }

  /** Где карт на экране (свой — по предсказанию, чужие — по интерполяции). */
  private posOf(id: number): KartPose | null {
    if (id === this.myId) return this.hasSelf ? this.myPose : null;
    const r = this.remotes.get(id);
    return r && r.valid ? r.pose : null;
  }

  // ------------------------------------------------------------ тик предсказания

  /** Серверный тик, на котором обработают ввод, отправленный сейчас: часы + пинг + очередь на сервере. */
  private predTick(now: number): number {
    return this.clock.estimate(now) + this.d.net.pingMs / TICK_MS + this.queueAvg;
  }

  private tick(now: number): void {
    const inp = this.inputs[0];
    inp.seq = ++this.seq;
    inp.buttons = this.d.input.sample();
    // ехать можно с конца решётки — тот же тик, что у сервера (ошибку на тик поправит сверка)
    const canDrive = this.phase === RC_RACE || (this.phase === RC_GRID && this.gridEnd > 0 && this.predTick(now) >= this.gridEnd);
    const ev = this.predictor.step(inp, canDrive);
    this.onLocalEvents(ev, now);
    this.d.net.sendBinary(encodeInputs(this.inputs, 0, 1, this.d.net.epoch));
  }

  private onLocalEvents(ev: KartEvents, now: number): void {
    const { fx, sound, hud, world } = this.d;
    const s = this.predictor.state;
    const p = this.predictor.prev;
    if (ev.used === ITEM_TURBO) {
      sound.kartBoost(null, BOOST_TURBO);
      this.fovKick = Math.max(this.fovKick, 4);
    } else if (ev.used === ITEM_BUBBLE) {
      sound.bubbleUp(null);
    } else if (ev.used !== ITEM_NONE && ev.used !== ITEM_CLAP) {
      sound.whoosh(null);
    }
    if (ev.mt) {
      sound.kartBoost(null, ev.mt);
      this.fovKick = Math.max(this.fovKick, 2 + ev.mt);
    }
    if (ev.rocket === 1) {
      hud.banner('🚀 Ракетный старт!', 1500, 'gold');
      sound.kartBoost(null, 2);
      this.fovKick = Math.max(this.fovKick, 5);
    } else if (ev.rocket === 2) {
      hud.banner('Рано! <small>колёса буксуют</small>', 1300);
      sound.skid(0.6);
    }
    if (ev.trick === 1) sound.trick();
    else if (ev.trick === 2) {
      hud.banner('✨ Трюк! <small>ускорение</small>', 1000);
      sound.kartBoost(null, 1);
      this.fovKick = Math.max(this.fovKick, 3);
    }
    if (ev.offroad !== 0) sound.offroad(ev.offroad === SURF_SAND);
    if (ev.wall > 3) {
      // искры — с той стороны, где стена; веер — обратно к дороге
      const tr = world.track;
      locate(tr, s.x, s.z, s.seg, this.loc);
      const sd = this.loc.lat > 0 ? 1 : -1;
      const rx = -tr.tz[s.seg] * sd;
      const rz = tr.tx[s.seg] * sd;
      fx.wallHit(s.x + rx * 0.7, s.y + 0.3, s.z + rz * 0.7, -rx, -rz, ev.wall);
      sound.kartBump(null, ev.wall);
      this.shake = Math.min(1, this.shake + ev.wall / 14);
    }
    if (ev.dash) {
      // плита-ускоритель
      sound.kartBoost(null, BOOST_TURBO);
      this.fovKick = Math.max(this.fovKick, 4);
    }
    if (ev.slick) {
      // лужа: брызги из-под колёс не каждый тик
      if (++this.slickTicks % 3 === 1) fx.slick(s.x - s.hx * 0.6, s.y, s.z - s.hz * 0.6, s.vx, s.vz, ev.slick === 2);
    } else this.slickTicks = 0;
    if (ev.hit > 0) {
      // бочка, блок или движущаяся помеха: искры от места удара, толчок камеры (от движущейся — сильнее)
      fx.wallHit(s.x + s.hx * 0.7, s.y + 0.4, s.z + s.hz * 0.7, -s.hx, -s.hz, ev.hit);
      sound.kartBump(null, ev.hit);
      this.shake = Math.min(1, this.shake + ev.hit / (ev.hitKind === 2 ? 8 : 14));
    }
    if (ev.hop) sound.kartHop(false);
    if (ev.land > 4) {
      fx.dust(s.x, s.y, s.z, Math.min(8, Math.round(ev.land / 2)));
      sound.land(ev.land);
      this.shake = Math.min(1, this.shake + Math.min(0.5, ev.land / 24));
    } else if (ev.land > 1) {
      sound.kartHop(true);
    }
    if (ev.splash) {
      fx.splash(p.x, p.z);
      sound.splash(null);
      this.camInit = false;
    }
    if (ev.respawn) {
      sound.whoosh(null);
      this.camInit = false;
    }
    if (ev.lap) {
      // круг — от линии до линии (первое пересечение — старт первого круга)
      if (s.lap > 1 && this.lapSeq > 0) {
        const t = (this.seq - this.lapSeq) * TICK_MS;
        if (this.bestMs === 0 || t < this.bestMs) this.bestMs = t;
      }
      this.lapSeq = this.seq;
      if (s.lap > this.lapShown) {
        this.lapShown = s.lap;
        if (s.lap === RC_LAPS) hud.banner('🔔 Последний круг!', 2000, 'gold');
        else if (s.lap > 1 && s.lap < RC_LAPS) hud.banner(`Круг ${s.lap}/${RC_LAPS}`, 1800);
      }
    }
    if (ev.finish && this.finishMs === 0 && this.raceStart > 0) {
      // до ответа сервера — своё время; точное придёт в событии «финиш»
      this.finishMs = Math.max(1, (this.predTick(now) - this.raceStart) * TICK_MS);
    }
    // занос копит мини-турбо: искры сменили цвет
    const lvl = sparkLevel(s);
    if (lvl > this.sparkLvl) sound.driftCharge(lvl);
    this.sparkLvl = lvl;
    // рулетка бонуса остановилась
    const rolling = s.itemT > 0;
    if (this.rolling && !rolling && s.item !== ITEM_NONE) {
      sound.itemReady();
      hud.banner(`${ITEM_ICONS[s.item]} ${ITEM_NAMES[s.item]} <small>${ITEM_HINTS[s.item]}</small>`, 1500);
    }
    this.rolling = rolling;
  }

  // ------------------------------------------------------------ кадр

  frame(now: number, dtRaw: number): void {
    const d = this.d;
    const dt = Math.min(0.1, dtRaw);
    this.fpsFrames++;
    this.fpsTime += dtRaw;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    this.clock.update(now, dt * 1000);
    if (this.ready && this.hasSelf && this.clock.ready) {
      // темп тиков подстраиваем по очереди на сервере: держим там ~1 вход в запасе
      const rate = clamp(1 - (this.queueAvg - 1.2) * 0.02, 0.97, 1.03);
      this.acc += dt * 1000 * rate;
      let n = 0;
      while (this.acc >= TICK_MS && n < 8) {
        this.acc -= TICK_MS;
        this.tick(now);
        n++;
      }
      if (this.acc > TICK_MS * 4) this.acc = 0;
    }
    const alpha = clamp(this.acc / TICK_MS, 0, 1);
    this.predictor.decay(dt);

    d.world.update(dt);
    // подвижные помехи — на момент, в котором нарисован свой карт (между прошлым тиком и этим)
    d.world.setHazardTime(this.hasSelf ? Math.max(0, this.predictor.state.rt - 1 + alpha) : 0);
    tickAvatarShared(d.world.time);
    if (this.hasSelf) {
      this.localPose(alpha);
      this.updateCamera(dt);
    }
    this.updateKarts(dt);
    this.updateShots(dt);
    d.fx.update(dt);
    this.updateHud(now, dt);
    this.updateSound();

    const cam = d.world.camera;
    cam.getWorldDirection(_v);
    d.sound.setListener(cam.position.x, cam.position.y, cam.position.z, _v.x, _v.y, _v.z);
    d.sound.tick(dt);
    d.world.render();
  }

  /** Свой карт: между тиками предсказания, с затухающей поправкой. */
  private localPose(alpha: number): void {
    const s = this.predictor.state;
    const p = this.predictor.prev;
    const o = this.predictor.offset;
    const q = this.myPose;
    q.x = p.x + (s.x - p.x) * alpha + o.x;
    q.y = p.y + (s.y - p.y) * alpha + o.y;
    q.z = p.z + (s.z - p.z) * alpha + o.z;
    q.yaw = lerpAngle(kartYaw(p), kartYaw(s), alpha);
    q.steer = p.steer + (s.steer - p.steer) * alpha;
    q.flags = kartFlags(s, true, this.selfPainted && !this.paintFlying(this.myId));
    q.misc = kartMisc(s) | (this.selfBubble ? KM_BUBBLE : 0);
  }

  /** В карт летит краска: кляксы на корпусе — когда долетит */
  private paintFlying(id: number): boolean {
    for (const sh of this.shots) if (sh.to === id) return true;
    return false;
  }

  private updateKarts(dt: number): void {
    const { world, fx } = this.d;
    const cam = world.camera.position;
    const t = this.clock.renderTick;
    for (const [id, v] of this.karts) {
      if (id === this.myId) {
        v.update(this.hasSelf ? this.myPose : null, dt, world.time, world, fx, cam, true);
        continue;
      }
      const r = this.remotes.get(id);
      if (r) r.valid = r.track.sample(t, this.sample);
      if (!r || !r.valid) {
        v.update(null, dt, world.time, world, fx, cam, false);
        continue;
      }
      const s = this.sample;
      const q = r.pose;
      q.x = s.x;
      q.y = s.y;
      q.z = s.z;
      q.yaw = s.yaw;
      q.steer = s.pitch;
      q.flags = this.paintFlying(id) ? s.flags & ~KE_PAINT : s.flags;
      q.misc = r.misc;
      v.update(q, dt, world.time, world, fx, cam, false);
    }
  }

  /** Летящая краска: розовый комок по дуге к цели. */
  private updateShots(dt: number): void {
    const fx = this.d.fx;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      sh.t += dt / PAINT_FLY_S;
      const dst = this.posOf(sh.to);
      if (!dst) {
        this.shots.splice(i, 1);
        continue;
      }
      const k = Math.min(1, sh.t);
      const x = sh.x + (dst.x - sh.x) * k;
      const y = sh.y + (dst.y + 0.9 - sh.y) * k + Math.sin(k * Math.PI) * 2;
      const z = sh.z + (dst.z - sh.z) * k;
      fx.glow(x, y, z, 0, 0, 0, PAINT_COLOR, 0.7, 0.1);
      fx.puff(x, y, z, 0, 0, 0, PAINT_COLOR, 0.85, 0.32, 0.4, 0.2, 0, 1);
      if (sh.t >= 1) {
        this.shots.splice(i, 1);
        this.paintHit(sh.to);
      }
    }
  }

  // ------------------------------------------------------------ камера

  /**
   * Камера погони: смотрит туда, куда карт едет (стоит или пятится — по носу), догоняет мягко, пружиной, и отстаёт
   * не больше CAM_LAG; высота — плавно, поле зрения шире на скорости и в турбо, тряска от стен и приземлений.
   * За край дороги — не дальше чем на 1 м.
   */
  private updateCamera(dt: number): void {
    const { world, input } = this.d;
    const cam = world.camera;
    const tr = world.track;
    const s = this.predictor.state;
    const p = this.myPose;
    const speed = Math.hypot(s.vx, s.vz);
    let target = p.yaw;
    if (s.vx * s.hx + s.vz * s.hz > 3) target += clamp(wrapAngle(Math.atan2(-s.vx, -s.vz) - p.yaw), -CAM_SLIP, CAM_SLIP);
    if (!this.camInit) {
      this.camInit = true;
      this.camYaw = target;
      this.camVel = 0;
      this.camY = p.y + CAM_UP;
      this.look = 0;
    }
    // пружина без перелёта: мягко трогается и мягко догоняет
    this.camVel += (CAM_FOLLOW * CAM_FOLLOW * wrapAngle(target - this.camYaw) - 2 * CAM_FOLLOW * this.camVel) * dt;
    this.camYaw += this.camVel * dt;
    const lag = wrapAngle(target - this.camYaw);
    if (lag > CAM_LAG || lag < -CAM_LAG) this.camYaw = target - clamp(lag, -CAM_LAG, CAM_LAG);
    this.camY = Math.abs(p.y + CAM_UP - this.camY) > 6 ? p.y + CAM_UP : damp(this.camY, p.y + CAM_UP, 8, dt);

    // мышью — оглядеться; взгляд держится, пока мышь двигают, и ещё секунду, потом плавно за карт
    const dm = wrapAngle(input.yaw - this.mouseYaw);
    this.mouseYaw = input.yaw;
    this.lookIdle = dm !== 0 ? 0 : this.lookIdle + dt;
    this.look = clamp(this.look + dm, -LOOK_MAX, LOOK_MAX);
    if (this.lookIdle > LOOK_HOLD) this.look *= Math.exp(-dt * LOOK_RETURN);
    if (s.done) this.orbit = Math.min(ORBIT_MAX, this.orbit + dt * 0.45);

    const yaw = this.camYaw + this.look + this.orbit;
    const hx = -Math.sin(yaw);
    const hz = -Math.cos(yaw);
    let cx = p.x - hx * CAM_BACK;
    let cz = p.z - hz * CAM_BACK;
    locate(tr, cx, cz, s.seg, this.camLoc);
    const lim = this.camLoc.hw + CAM_MARGIN;
    const lat = this.camLoc.lat;
    if (lat > lim || lat < -lim) {
      const ex = lat - Math.sign(lat) * lim;
      const j = this.camLoc.seg;
      cx -= -tr.tz[j] * ex;
      cz -= tr.tx[j] * ex;
    }

    this.shake *= Math.exp(-dt * 7);
    this.fovKick *= Math.exp(-dt * 3);
    const sh = this.shake * this.shake;
    const t = world.time;
    const ox = (Math.sin(t * 41) + Math.sin(t * 27)) * 0.05 * sh;
    const oy = Math.sin(t * 33) * 0.07 * sh;
    // пол: земля и дорога под камерой — сглажен, чтобы на изломах не дёргался
    this.floorLoc.seg = this.camLoc.seg;
    const floor = world.camFloor(cx, cz, this.floorLoc) + CAM_CLEAR;
    this.camFloorY = this.camFloorY === -Infinity || Math.abs(floor - this.camFloorY) > 8 ? floor : damp(this.camFloorY, floor, 10, dt);
    cam.position.set(cx + ox, Math.max(this.camY, this.camFloorY) + oy, cz);
    cam.lookAt(p.x + hx * CAM_AHEAD + ox * 0.5, p.y + 0.8 + oy * 0.5, p.z + hz * CAM_AHEAD);

    const lvl = s.boostT > 0 ? s.boostLvl : 0;
    const fov = FOV_MIN + Math.min(1, speed / 26) * FOV_SPEED + (lvl === BOOST_TURBO ? FOV_TURBO : lvl > 0 ? (FOV_TURBO * (1 + lvl)) / 8 : 0) + this.fovKick;
    this.curFov = damp(this.curFov, fov, 6, dt);
    const f = narrowFov(this.curFov, cam.aspect);
    if (Math.abs(cam.fov - f) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------ интерфейс и звук

  private updateHud(now: number, dt: number): void {
    const { hud, settings, sound } = this.d;
    const s = this.predictor.state;
    const pt = this.predTick(now);
    hud.setStanding(this.myPlace, this.total || this.karts.size, s.done ? RC_LAPS : clamp(s.lap, 1, RC_LAPS), RC_LAPS);
    hud.setTimes(this.raceTime(pt), this.bestMs || null);
    hud.setSpeed(Math.hypot(s.vx, s.vz) * 3.6);
    hud.setCharge(this.hasSelf && s.drift !== 0 && !s.done ? s.driftT : null);
    // линии скорости: турбо — в полную силу, мини-турбо — слабее
    const boost = this.hasSelf && !s.done && s.boostT > 0 ? s.boostLvl : 0;
    hud.setSpeedLines(dt, boost === BOOST_TURBO ? 1 : boost === 3 ? 0.8 : boost === 2 ? 0.6 : boost === 1 ? 0.45 : 0);
    const rolling = this.hasSelf && s.itemT > 0;
    hud.setItem(this.hasSelf ? s.item : ITEM_NONE, rolling, now);
    if (rolling && now - this.rollTickAt > 90) {
      this.rollTickAt = now;
      sound.reelTick();
    }
    this.updateCount(pt);
    hud.setHelp(this.phase === RC_GRID || (this.phase === RC_RACE && this.gridEnd > 0 && pt - this.gridEnd < HELP_TICKS));

    // «Не туда!»: смотрит и едет против хода трассы
    const tr = this.d.world.track;
    const f = s.vx * s.hx + s.vz * s.hz;
    const wrong = this.phase === RC_RACE && !s.done && f > 3 && s.hx * tr.tx[s.seg] + s.hz * tr.tz[s.seg] < -0.35;
    this.wrongT = wrong ? this.wrongT + dt : 0;
    hud.wrongWay(this.wrongT > WRONG_WAY_S);

    if (this.phase === RC_RESULTS && hud.resultsShown) hud.setResultsLeft((this.phaseEnd - this.clock.estimate(now)) / TICK_RATE);
    this.updateMap();
    hud.setStats(
      settings.showStats
        ? `${this.fps} FPS · ${Math.round(this.d.net.pingMs)} мс · буфер ${this.clock.delay.toFixed(1)} т · поправок ${this.predictor.corrections}`
        : null,
    );
  }

  /** Время гонки, мс: идёт со старта, после финиша — время финиша, после конца гонки — стоит. */
  private raceTime(pt: number): number | null {
    if (this.finishMs > 0) return this.finishMs;
    if (this.raceStart <= 0) return null;
    const end = this.phase === RC_RESULTS ? this.phaseEnd - RC_RESULTS_TICKS : pt;
    return Math.max(0, (end - this.raceStart) * TICK_MS);
  }

  /** Отсчёт «3 · 2 · 1 · Вперёд!» по тем же часам, по которым свой карт трогается. */
  private updateCount(pt: number): void {
    const { hud, sound } = this.d;
    if (this.gridEnd <= 0 || this.countShown === 0) return;
    const left = this.gridEnd - pt;
    if (left > 0) {
      const n = Math.ceil(left / TICK_RATE);
      if (n <= 3 && n !== this.countShown) {
        this.countShown = n;
        hud.setCount(n);
        sound.countBeep(false);
      }
    } else if (this.countShown > 0 || left > -TICK_RATE) {
      this.countShown = 0;
      hud.setCount(0);
      sound.countBeep(true);
    }
  }

  private updateMap(): void {
    let n = 0;
    const dot = (x: number, z: number, color: string, me: boolean) => {
      const d = this.dots[n] ?? (this.dots[n] = { x: 0, z: 0, color: '', me: false });
      d.x = x;
      d.z = z;
      d.color = color;
      d.me = me;
      n++;
    };
    for (const r of this.remotes.values()) if (r.valid && r.pose.flags & KE_ON) dot(r.pose.x, r.pose.z, this.cssOf(r.id), false);
    if (this.hasSelf) dot(this.myPose.x, this.myPose.z, this.cssOf(this.myId), true);
    this.dots.length = n;
    this.d.hud.drawMap(this.dots);
  }

  /** Свой мотор и моторы ближайших чужих картов. */
  private updateSound(): void {
    const { sound, world } = this.d;
    if (this.hasSelf) {
      const s = this.predictor.state;
      const speed = Math.hypot(s.vx, s.vz);
      const skid = s.drift !== 0 && s.grounded ? Math.min(1, speed / 12) : 0;
      sound.engine(this.myId, null, speed, s.boostT > 0, skid, this.phase === RC_RESULTS ? 0.22 : 0.4);
    }
    const cam = world.camera.position;
    const near = this.near;
    near.length = 0;
    for (const r of this.remotes.values()) {
      if (!r.valid || !(r.pose.flags & KE_ON)) continue;
      r.dist = Math.hypot(r.pose.x - cam.x, r.pose.y - cam.y, r.pose.z - cam.z);
      if (r.dist < ENGINE_FAR) near.push(r);
    }
    near.sort((a, b) => a.dist - b.dist);
    if (near.length > ENGINE_VOICES) near.length = ENGINE_VOICES;
    for (const id of this.voices) {
      if (near.some((r) => r.id === id)) continue;
      this.voices.delete(id);
      sound.engineStop(id);
    }
    for (const r of near) {
      const f = r.pose.flags;
      const skid = f & KE_DRIFT && f & KE_GROUND ? 0.7 : 0;
      sound.engine(r.id, [r.pose.x, r.pose.y + 0.4, r.pose.z], this.karts.get(r.id)?.speed ?? 0, (f & KE_BOOST) !== 0, skid, 0.3);
      this.voices.add(r.id);
    }
  }

  /** Для отладки и тестов в браузере. */
  debugState(): Record<string, unknown> {
    const s = this.predictor.state;
    const c = this.d.world.camera.position;
    return {
      id: this.myId, phase: this.phase, pos: [s.x, s.y, s.z], speed: Math.hypot(s.vx, s.vz), lap: s.lap, cp: s.cp, done: s.done,
      place: this.myPlace, item: s.item, itemT: s.itemT, corrections: this.predictor.corrections, renderTick: this.clock.renderTick,
      delay: this.clock.delay, remotes: this.remotes.size, queue: this.queueAvg, fps: this.fps, cam: [c.x, c.y, c.z], fov: this.curFov,
      gridEnd: this.gridEnd, best: this.bestMs, finish: this.finishMs, rt: s.rt,
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
