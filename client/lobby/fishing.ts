// Рыбалка с мостков в 3D: удочка в руках у рыбака, леска с провисом, поплавок (пробы — дёргается, поклёвка — уходит
// под воду), вываживание с брызгами, рыба из воды — в руки над головой (удочка — на настил), потом в альбом или на
// продажу. Что и когда — по событиям сервера (lev 'fish'); вошедшему — по виду мест из приветствия. Свои заброс и
// подсечку показываем сразу, не дожидаясь сервера. Звуки своей удочки — без объёма. Те же удочки — у рыбаков-соседей
// на площадке маяка (folk.ts): у них свои места и события придумывает сам клиент, а улов идёт в ведро (FE_DONE, a = 2).
// Рыбалка 2.0 (v2): вываживание длится, сколько игрок бьётся на шкале, — до FE_LAND или FE_LOST; у своего места рыба
// подходит к мосткам по прогрессу шкалы (setProgress).
import * as THREE from 'three';
import { TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import {
  CAST_TICKS, FE_BITE, FE_CAST, FE_DONE, FE_EARLY, FE_HOOK, FE_LAND, FE_LOST, FE_MISS, FE_NIBBLE, FE_OFF, FISH, FP_BITE, FP_CAST, FP_HOLD,
  FP_IDLE, FP_REEL, FP_WAIT, GOLDFISH, R_RARE, fmtWeight, reelTicks, type FishSpotView,
} from '../../shared/fishing.ts';
import { FISH_SPOTS } from '../../shared/fishplaces.ts';
import type { Sound } from '../audio.ts';
import type { Avatar } from '../render/avatar.ts';
import type { Effects } from '../render/effects.ts';
import { makeFish3D } from './fishart.ts';
import type { LobbyFx } from './fx.ts';

/** Удилище: три колена (от рукоятки к кончику), длина и толщина у начала и конца, м */
const SEGS: ReadonlyArray<readonly [number, number, number]> = [[0.8, 0.014, 0.0105], [0.7, 0.0105, 0.0075], [0.6, 0.0075, 0.004]];
/** Колено гнётся в двух местах (изгиб плавнее); доля изгиба на каждом сгибе — к кончику больше */
const SUB = 2;
const BEND_W = [0.09, 0.11, 0.15, 0.2, 0.22, 0.23];
/** Красный кончик, м */
const TIP_LEN = 0.12;
/** Рукоятка: столько позади руки и впереди до катушки */
const HANDLE_BACK = 0.2;
const HANDLE_FWD = 0.16;
/** Где правая рука держит рукоятку (оси желейки: +X вправо, −Z вперёд) */
const GRIP = new THREE.Vector3(0.18, 0.92, -0.5);
/** Левая рука — на удилище дальше по нему */
const LEFT_ON_ROD = 0.36;
/** Наклон удочки вверх от горизонта, рад: с удочкой, ждёт поклёвку, замах назад */
const PITCH_IDLE = 0.8;
const PITCH_WAIT = 0.5;
const PITCH_BACK = 2.15;
/** Заброс: замах назад, бросок вперёд, отпустил поплавок — с; полёт до воды — до конца CAST_TICKS */
const CAST_S = CAST_TICKS / TICK_RATE;
const BACK_S = 0.28;
const FWD_S = 0.42;
const RELEASE_S = 0.36;
/** Свой заброс начат до ответа сервера: столько ждём, потом отменяем */
const CAST_WAIT_S = 0.8;
/** Леска у не заброшенной удочки, м */
const DANGLE = 0.5;
/** Смотал после ранней подсечки или упущенной рыбы: поплавок летит к удочке, с */
const REELIN_S = 0.45;
/** Рыба вылетает из воды в руки, с; потом удочка ложится на настил */
const LAND_S = 0.5;
const LIE_S = 0.25;
/** Рыба уходит из рук (в альбом, продана, отпущена), с; удочка возвращается в руки с DONE_BACK_S */
const DONE_S = 0.6;
const DONE_BACK_S = 0.35;
/** Руки с уловом над головой */
const HOLD_HANDS_Y = 1.7;
/** Точек на леске */
const LINE_N = 16;
/** Поплавок: радиус и антенна */
const FLOAT_R = 0.085;
/** Рыбалка 2.0: за сколько секунд чужая рыба подходит к мосткам (бой длится, сколько длится); треск катушки, с */
const REEL2_S = 14;
const REEL2_SOUND_S = 3;

/** Место рыбака: где стоит (сидит) и куда смотрит; bucket — ведро рядом (у рыбаков-соседей: улов летит туда) */
export interface FishPlace {
  x: number;
  z: number;
  yaw: number;
  bucket?: readonly [number, number, number];
}

/** FE_DONE у рыбаков-соседей: улов — в ведро */
export const DONE_BUCKET = 2;
/** Верх ведра над его дном, м: туда падает рыба */
const BUCKET_TOP = 0.3;

const A_NONE = 0;
const A_CAST = 1;
const A_REELIN = 2;
const A_LAND = 3;
const A_DONE = 4;

interface Rig {
  root: THREE.Group;
  joints: THREE.Group[];
  tip: THREE.Object3D;
  crank: THREE.Group;
}

interface Spot {
  ph: number;
  /** Куда упал поплавок */
  x: number;
  z: number;
  /** На крючке и в руках: вид и граммы */
  sp: number;
  g: number;
  /** Номер последнего события поплавка (для подсечки) */
  n: number;
  /** С начала фазы, с */
  t: number;
  anim: number;
  animT: number;
  /** Свой заброс показан, ответа сервера ещё нет */
  pending: boolean;
  /** С последней пробы, с */
  nibT: number;
  /** С последней своей подсечки (рывок удочкой), с */
  jerkT: number;
  reelDur: number;
  /** Своё вываживание 2.0: прогресс шкалы 0…1 (−1 — нет, рыба подходит по времени) */
  prog: number;
  /** До следующих брызг или кругов, с */
  fxT: number;
  /** Рыба ушла из рук: в альбом */
  kept: boolean;
  /** Рыба летит в ведро (рыбак-сосед) */
  toBucket: boolean;
  /** Откуда летит поплавок или рыба (вода) */
  from: THREE.Vector3;
  /** Поплавок на леске у не заброшенной удочки (качается, как маятник) и его прошлое место */
  fp: THREE.Vector3;
  fpPrev: THREE.Vector3;
  fpFree: boolean;
  av: Avatar | null;
  rig: Rig;
  float: THREE.Group;
  line: THREE.Line;
  linePos: Float32Array;
  fish: THREE.Group | null;
  /** Половина размеров рыбы: вдоль, по высоте */
  fishHalf: THREE.Vector3;
}

let rodRes: { parts: Array<[number, number, number]>; blank: THREE.BufferGeometry[]; tipGeo: THREE.BufferGeometry; handle: THREE.BufferGeometry; spool: THREE.BufferGeometry; stem: THREE.BufferGeometry; arm: THREE.BufferGeometry; knob: THREE.BufferGeometry; blankMat: THREE.Material; tipMat: THREE.Material; corkMat: THREE.Material; metalMat: THREE.Material } | null = null;
let floatRes: { top: THREE.BufferGeometry; bottom: THREE.BufferGeometry; stick: THREE.BufferGeometry; red: THREE.Material; white: THREE.Material } | null = null;
let lineMat: THREE.LineBasicMaterial | null = null;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _t = new THREE.Vector3();

export class FishingSpots {
  private readonly scene: THREE.Scene;
  private readonly effects: Effects;
  private readonly fx: LobbyFx;
  private readonly sound: Sound;
  /** Своя желейка: её события — без объёма */
  private readonly me: Avatar | null;
  private readonly places: readonly FishPlace[];
  private readonly spots: Spot[];
  private time = 0;
  /** Рыбалка 2.0: вываживание — до улова или срыва, не по весу */
  v2 = false;

  /** places — места рыбалки: на мостках (по умолчанию) или у рыбаков-соседей */
  constructor(scene: THREE.Scene, effects: Effects, fx: LobbyFx, sound: Sound, me: Avatar | null, places: readonly FishPlace[] = FISH_SPOTS) {
    this.scene = scene;
    this.effects = effects;
    this.fx = fx;
    this.sound = sound;
    this.me = me;
    this.places = places;
    this.spots = places.map(() => this.makeSpot());
  }

  // ------------------------------------------------------------ состояние

  /** Фаза места, как её видит клиент (заброс кончается, когда поплавок долетел). */
  phaseOf(spot: number): number {
    return this.spots[spot]?.ph ?? FP_IDLE;
  }

  /** Последнее событие поплавка, которое мы видели: его номер уходит с подсечкой. */
  lastN(spot: number): number {
    return this.spots[spot]?.n ?? 0;
  }

  /** Свой заброс: замах сразу; false — уже замахиваемся (не слать второй раз). */
  castLocal(spot: number): boolean {
    const s = this.spots[spot];
    if (!s || s.ph !== FP_IDLE || (s.anim === A_CAST && s.pending)) return false;
    this.finishAnim(s);
    s.anim = A_CAST;
    s.animT = 0;
    s.pending = true;
    return true;
  }

  /** Своё вываживание 2.0: прогресс шкалы 0…1 — рыба у поверхности подходит к мосткам по нему. */
  setProgress(spot: number, p: number): void {
    const s = this.spots[spot];
    if (s && s.ph === FP_REEL) s.prog = Math.max(0, Math.min(1, p));
  }

  /** Своя подсечка: удочка дёргается вверх сразу. */
  jerk(spot: number): void {
    const s = this.spots[spot];
    if (s) s.jerkT = 0;
  }

  /** Всё заново: вид мест из приветствия (null — пусто, ушли с набережной). */
  reset(views: readonly FishSpotView[] | null): void {
    this.spots.forEach((s, i) => {
      this.clearSpot(s);
      this.seat(s, null);
      const v = views?.[i];
      if (!v) return;
      s.ph = v.ph === FP_CAST ? FP_WAIT : v.ph;
      s.x = v.x;
      s.z = v.z;
      s.sp = v.sp;
      s.g = v.g;
      if (s.ph === FP_REEL) s.reelDur = this.v2 ? REEL2_S : reelTicks(s.g) / TICK_RATE;
      if (s.ph === FP_HOLD && s.sp >= 0) this.giveFish(s);
    });
  }

  // ------------------------------------------------------------ события сервера

  onEvent(kind: number, spot: number, a: number, b: number): void {
    const s = this.spots[spot];
    if (!s) return;
    const mine = this.me !== null && s.av === this.me;
    const at = (x: number, y: number, z: number): [number, number, number] | null => (mine ? null : [x, y, z]);
    const sx = this.places[spot].x;
    const sz = this.places[spot].z;
    switch (kind) {
      case FE_CAST:
        // свой замах уже идёт — продолжаем его (не дальше верхней точки), иначе с начала
        if (s.anim === A_CAST && s.pending) {
          s.animT = Math.min(s.animT, BACK_S);
        } else {
          this.finishAnim(s);
          s.anim = A_CAST;
          s.animT = 0;
        }
        s.pending = false;
        s.ph = FP_CAST;
        s.t = 0;
        s.x = a;
        s.z = b;
        s.n = 0;
        s.nibT = 99;
        s.fxT = 2 + Math.random() * 2;
        this.sound.fishCast(at(sx, 1.5, sz));
        break;
      case FE_NIBBLE:
        if (s.ph === FP_CAST) this.landFloat(s, mine);
        s.ph = FP_WAIT;
        s.n = a;
        s.nibT = 0;
        this.effects.ripple(s.x, s.z, 0.9, 0.9);
        this.effects.burst(s.x, WATER_Y + 0.05, s.z, 0xdff4ff, 3, 1.4, 0, 1, 0, 0.03);
        this.sound.fishNibble(at(s.x, WATER_Y, s.z));
        break;
      case FE_BITE:
        if (s.ph === FP_CAST) this.landFloat(s, mine);
        s.ph = FP_BITE;
        s.n = a;
        s.t = 0;
        s.fxT = 0.25;
        this.effects.ripple(s.x, s.z, 1.6, 1.1);
        this.effects.burst(s.x, WATER_Y + 0.05, s.z, 0xdff4ff, 8, 2.4, 0, 1, 0, 0.04);
        this.sound.fishBite(at(s.x, WATER_Y, s.z));
        break;
      case FE_HOOK:
        s.ph = FP_REEL;
        s.sp = a;
        s.g = b;
        s.t = 0;
        s.fxT = 0;
        s.reelDur = this.v2 ? REEL2_S : reelTicks(b) / TICK_RATE;
        s.prog = -1;
        this.sound.fishReel(at(s.x, WATER_Y, s.z), this.v2 ? REEL2_SOUND_S : s.reelDur);
        break;
      case FE_LOST:
        // рыба сорвалась со шкалы: леска ослабла, поплавок летит к удочке от того места, где она билась
        if (s.ph === FP_REEL) {
          this.reelPoint(s, spot, s.from);
          this.finishAnim(s);
          s.anim = A_REELIN;
          s.animT = 0;
          this.effects.ripple(s.from.x, s.from.z, 1.3, 0.9);
        }
        s.ph = FP_IDLE;
        s.sp = -1;
        this.sound.fishEscape(at(s.x, WATER_Y, s.z));
        break;
      case FE_EARLY:
      case FE_MISS:
        // смотал: поплавок (ушёл под воду — сперва всплыл) летит обратно к удочке
        if (s.ph === FP_BITE || s.ph === FP_WAIT || s.ph === FP_CAST) {
          s.from.set(s.x, WATER_Y, s.z);
          this.finishAnim(s);
          s.anim = A_REELIN;
          s.animT = 0;
          this.effects.ripple(s.x, s.z, 1.1, 0.8);
        }
        s.ph = FP_IDLE;
        s.sp = -1;
        if (kind === FE_MISS || a === 1) this.sound.fishEscape(at(s.x, WATER_Y, s.z));
        break;
      case FE_LAND: {
        s.ph = FP_HOLD;
        s.sp = a;
        s.g = b;
        s.t = 0;
        this.finishAnim(s);
        s.anim = A_LAND;
        s.animT = 0;
        this.nearWater(spot, s.from);
        this.giveFish(s);
        // пока летит — в мире, в руки перейдёт по прилёте
        if (s.fish) {
          this.scene.attach(s.fish);
          s.fish.position.copy(s.from);
        }
        this.effects.waterSplash(s.from.x, s.from.z, false);
        const f = FISH[a];
        this.sound.fishCatch(at(s.from.x, WATER_Y, s.from.z), (f?.rarity ?? 0) >= R_RARE && f?.price[1] !== 0);
        if (s.av && !mine && f) s.av.say(`🎣 ${f.name} · ${fmtWeight(b)}`);
        break;
      }
      case FE_DONE: {
        s.ph = FP_IDLE;
        s.kept = a === 1;
        this.finishAnim(s);
        if (!s.fish) break;
        s.anim = A_DONE;
        s.animT = 0;
        const pl = this.places[spot];
        const npc = pl.bucket !== undefined;
        s.toBucket = npc && a === DONE_BUCKET;
        const p = s.fish.getWorldPosition(_v);
        if (s.kept) this.fx.sparkle(p.x, p.y, p.z, 22);
        else if (!npc && (FISH[s.sp]?.price[1] ?? 0) > 0 && s.sp !== GOLDFISH) this.fx.coins(p.x, p.y, p.z, 6, -Math.sin(pl.yaw), -Math.cos(pl.yaw));
        // золотую рыбку отпускают (рыбаки-соседи — и хлам): летит в море; в ведро — тоже из рук в мир
        if (s.toBucket || (!s.kept && (s.sp === GOLDFISH || npc))) {
          this.scene.attach(s.fish);
          s.from.copy(s.fish.position);
        }
        break;
      }
      case FE_OFF:
        this.clearSpot(s);
        break;
    }
  }

  // ------------------------------------------------------------ кадр

  /** occupants — кто стоит на каждом месте (желейка) или null. */
  update(dt: number, time: number, occupants: ReadonlyArray<Avatar | null>): void {
    this.time = time;
    this.spots.forEach((s, i) => {
      const av = occupants[i] ?? null;
      if (av !== s.av) this.seat(s, av);
      s.t += dt;
      s.animT += dt;
      s.nibT += dt;
      s.jerkT += dt;
      if (!av) {
        s.float.visible = false;
        s.line.visible = false;
        return;
      }
      this.updateSpot(s, i, dt);
    });
    this.tickDone(dt);
  }

  private updateSpot(s: Spot, spot: number, dt: number): void {
    const av = s.av!;
    const at = this.places[spot];
    const mine = av === this.me;
    // свой заброс так и не подтвердили — опускаем удочку
    if (s.anim === A_CAST && s.pending && s.animT > CAST_WAIT_S) s.anim = A_NONE;
    // поплавок долетел до воды
    if (s.ph === FP_CAST && s.anim === A_CAST && s.animT >= CAST_S) this.landFloat(s, mine);
    if (s.anim === A_CAST && !s.pending && s.animT >= CAST_S) s.anim = A_NONE;
    if (s.anim === A_REELIN && s.animT >= REELIN_S) {
      s.anim = A_NONE;
      s.fpFree = false;
    }
    if (s.anim === A_LAND && s.animT >= LAND_S) this.fishToHands(s);
    // отпущенную в море доводит до воды tickDone
    if (s.anim === A_DONE && s.animT >= DONE_S && s.fish?.parent !== this.scene) this.finishAnim(s);

    // --- удочка: наклон, изгиб, лежит ли на настиле
    let pitch = PITCH_IDLE + Math.sin(this.time * 1.3 + spot) * 0.03;
    let bend = 0.05;
    let lie = 0;
    let crank = false;
    const heavy = Math.min(1, Math.max(0, Math.log10(Math.max(1, s.g) / 100) / 2.6));
    if (s.anim === A_CAST) {
      const u = s.pending ? Math.min(s.animT, BACK_S) : s.animT;
      if (u < BACK_S) {
        const k = smooth(u / BACK_S);
        pitch = lerp(PITCH_IDLE, PITCH_BACK, k);
        bend = -0.1 * k;
      } else if (u < FWD_S) {
        const k = (u - BACK_S) / (FWD_S - BACK_S);
        pitch = lerp(PITCH_BACK, 0.3, k * k);
        bend = -0.35 * Math.sin(Math.PI * k);
      } else {
        const k = smooth(Math.min(1, (u - FWD_S) / (CAST_S - FWD_S)));
        pitch = lerp(0.3, PITCH_WAIT, k);
        bend = 0.12 * Math.sin(Math.PI * k);
      }
    } else if (s.ph === FP_WAIT) {
      pitch = PITCH_WAIT + Math.sin(this.time * 0.9 + spot) * 0.015;
      bend = 0.08;
      if (s.nibT < 0.22) {
        const k = Math.sin((Math.PI * s.nibT) / 0.22);
        bend += 0.14 * k;
        pitch -= 0.05 * k;
      }
    } else if (s.ph === FP_BITE) {
      pitch = 0.42 + Math.sin(s.t * 14) * 0.04;
      bend = 0.32 + Math.sin(s.t * 17) * 0.08;
    } else if (s.ph === FP_REEL) {
      pitch = 0.95 + Math.sin(s.t * 9) * 0.06;
      bend = 0.55 + heavy * 0.35 + Math.sin(s.t * 21) * 0.07;
      crank = true;
    } else if (s.anim === A_LAND) {
      const k = s.animT / LAND_S;
      pitch = lerp(1.0, 1.3, smooth(k));
      bend = 0.6 * (1 - k);
    }
    if (s.anim === A_REELIN) {
      const k = s.animT / REELIN_S;
      pitch += Math.sin(Math.PI * Math.min(1, k * 1.4)) * 0.4;
    }
    pitch += Math.exp(-s.jerkT * 9) * 0.4;
    if (s.ph === FP_HOLD && s.anim !== A_LAND) lie = smooth(Math.min(1, s.t > LAND_S ? (s.t - LAND_S) / LIE_S : 0));
    if (s.anim === A_DONE) lie = 1 - smooth(Math.min(1, Math.max(0, (s.animT - DONE_BACK_S) / LIE_S)));
    this.poseRig(s.rig, pitch, bend, lie, crank ? s.t * 15 : 0);

    // --- руки: на удочке (при вываживании левая крутит катушку) или с уловом над головой
    const hands = av.hands ?? (av.hands = [0, 0, 0, 0, 0, 0]);
    rodPoint(pitch, -0.035, 0, -LEFT_ON_ROD, _v);
    if (crank) {
      const a = s.t * 15;
      rodPoint(pitch, -0.07, -0.07 + Math.cos(a) * 0.045, -0.06 + Math.sin(a) * 0.045, _v);
    }
    let lx = _v.x;
    let ly = _v.y;
    let lz = _v.z;
    let rx = GRIP.x;
    let ry = GRIP.y;
    let rz = GRIP.z;
    if (s.fish && s.fish.parent === av.held) {
      // держит улов: хват по длине рыбы, гордо подпрыгивает первые секунды
      const hx = Math.min(0.5, Math.max(0.14, s.fishHalf.x * 0.6));
      const bob = Math.max(0, Math.sin(s.t * 4.5)) * 0.04 * Math.max(0, 1 - s.t / 3);
      const k = s.anim === A_DONE ? 1 - smooth(Math.min(1, s.animT / DONE_BACK_S)) : lie;
      lx = lerp(lx, -hx, k);
      ly = lerp(ly, HOLD_HANDS_Y + bob, k);
      lz = lerp(lz, -0.12, k);
      rx = lerp(rx, hx, k);
      ry = lerp(ry, HOLD_HANDS_Y + bob, k);
      rz = lerp(rz, -0.12, k);
      this.poseHeldFish(s, bob);
    }
    hands[0] = lx;
    hands[1] = ly;
    hands[2] = lz;
    hands[3] = rx;
    hands[4] = ry;
    hands[5] = rz;

    // --- поплавок и леска
    s.rig.tip.updateWorldMatrix(true, false);
    const tip = s.rig.tip.getWorldPosition(_t);
    const fp = _w;
    let showFloat = true;
    let showLine = true;
    let sag = 0;
    let lineTo = fp;
    if ((s.ph === FP_HOLD && s.anim !== A_LAND) || lie > 0.5) {
      showFloat = false;
      showLine = false;
    } else if (s.anim === A_LAND && s.fish) {
      // рыба летит из воды в руки дугой и бьётся
      const k = Math.min(1, s.animT / LAND_S);
      const to = av.held.localToWorld(_v.set(0, HOLD_HANDS_Y + 0.08 + s.fishHalf.y, -0.12));
      const f = s.fish;
      f.position.set(lerp(s.from.x, to.x, k), lerp(s.from.y, to.y, k) + 4 * 1.1 * k * (1 - k), lerp(s.from.z, to.z, k));
      f.rotation.set(0, av.root.rotation.y, Math.sin(s.animT * 30) * 0.5 * (1 - k));
      lineTo = _v.copy(f.position);
      showFloat = false;
    } else if (s.anim === A_CAST && !s.pending && s.animT >= RELEASE_S) {
      // полёт: дуга от кончика (где отпустил) к месту падения
      const k = Math.min(1, (s.animT - RELEASE_S) / (CAST_S - RELEASE_S));
      const top = Math.max(s.fp.y, WATER_Y) + 2.2;
      fp.set(lerp(s.fp.x, s.x, k), 0, lerp(s.fp.z, s.z, k));
      fp.y = lerp(s.fp.y, WATER_Y, k) + 4 * (top - Math.max(s.fp.y, WATER_Y)) * k * (1 - k);
    } else if (s.anim === A_CAST) {
      // замах: поплавок висит и качается (s.fp — откуда он полетит)
      this.swingFloat(s, tip, dt);
      fp.copy(s.fp);
    } else if (s.anim === A_REELIN) {
      // смотал: от воды к удочке, дугой
      const k = smooth(s.animT / REELIN_S);
      this.danglePoint(tip, _v);
      fp.set(lerp(s.from.x, _v.x, k), lerp(s.from.y, _v.y, k) + Math.sin(Math.PI * k) * 0.9, lerp(s.from.z, _v.z, k));
      s.fp.copy(fp);
      s.fpPrev.copy(fp);
      s.fpFree = true;
    } else if (s.ph === FP_WAIT || s.ph === FP_CAST) {
      const dip = s.nibT < 0.5 ? -0.08 * Math.sin(Math.PI * Math.min(1, s.nibT / 0.18)) * Math.exp(-s.nibT * 4) : 0;
      fp.set(s.x, WATER_Y + Math.sin(this.time * 2.2 + spot) * 0.012 + dip, s.z);
      sag = 0.06;
      s.fxT -= dt;
      if (s.fxT <= 0) {
        s.fxT = 2.5 + Math.random() * 2;
        this.effects.ripple(s.x, s.z, 0.6, 1.2);
      }
    } else if (s.ph === FP_BITE) {
      // под водой и тянет вбок
      const fx = -Math.sin(at.yaw);
      const fz = -Math.cos(at.yaw);
      const side = Math.sin(s.t * 4) * 0.25;
      fp.set(s.x - fz * side, WATER_Y - 0.3, s.z + fx * side);
      s.fxT -= dt;
      if (s.fxT <= 0) {
        s.fxT = 0.3;
        this.effects.ripple(fp.x, fp.z, 1.3, 0.9);
      }
    } else if (s.ph === FP_REEL) {
      // рыба бьётся у поверхности и приближается к мосткам
      this.reelPoint(s, spot, fp);
      s.fxT -= dt;
      if (s.fxT <= 0) {
        s.fxT = 0.16 + Math.random() * 0.16;
        this.effects.burst(fp.x, WATER_Y + 0.05, fp.z, 0xdff4ff, 5 + Math.round(heavy * 6), 2.2 + heavy * 1.5, 0, 1, 0, 0.035 + heavy * 0.02);
        this.effects.ripple(fp.x, fp.z, 0.9 + heavy * 0.8, 0.8);
      }
    } else {
      // висит на леске у кончика, качается
      this.swingFloat(s, tip, dt);
      fp.copy(s.fp);
    }
    s.float.visible = showFloat;
    if (showFloat) {
      s.float.position.copy(fp);
      s.float.rotation.z = s.ph === FP_WAIT || s.ph === FP_REEL ? Math.sin(this.time * 1.7 + spot) * 0.08 : 0;
    }
    s.line.visible = showLine;
    if (showLine) this.drawLine(s, tip, lineTo, sag);
    if (s.fish) s.fish.visible = true;
  }

  /** Поплавок на леске длиной DANGLE: падает и качается за кончиком удочки. */
  private swingFloat(s: Spot, tip: THREE.Vector3, dt: number): void {
    if (!s.fpFree) {
      this.danglePoint(tip, s.fp);
      s.fpPrev.copy(s.fp);
      s.fpFree = true;
      return;
    }
    const vx = (s.fp.x - s.fpPrev.x) * 0.985;
    const vy = (s.fp.y - s.fpPrev.y) * 0.985;
    const vz = (s.fp.z - s.fpPrev.z) * 0.985;
    s.fpPrev.copy(s.fp);
    s.fp.x += vx;
    s.fp.y += vy - 9.8 * dt * dt;
    s.fp.z += vz;
    const dx = s.fp.x - tip.x;
    const dy = s.fp.y - tip.y;
    const dz = s.fp.z - tip.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > DANGLE) {
      const k = DANGLE / d;
      s.fp.set(tip.x + dx * k, tip.y + dy * k, tip.z + dz * k);
    }
  }

  private danglePoint(tip: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.set(tip.x, tip.y - DANGLE, tip.z);
  }

  /** Где бьётся рыба при вываживании: от поплавка к мосткам, зигзагом (ближе — меньше). */
  private reelPoint(s: Spot, spot: number, out: THREE.Vector3): THREE.Vector3 {
    const k = s.prog >= 0 ? s.prog : Math.min(1, s.t / Math.max(0.1, s.reelDur));
    const u = smooth(k);
    this.nearWater(spot, _v);
    const dx = _v.x - s.x;
    const dz = _v.z - s.z;
    const l = Math.hypot(dx, dz) || 1;
    const side = Math.sin(s.t * 3.1) * 0.9 * (1 - u);
    return out.set(lerp(s.x, _v.x, u) - (dz / l) * side, WATER_Y + 0.02, lerp(s.z, _v.z, u) + (dx / l) * side);
  }

  /** Вода у края мостков перед местом: отсюда рыба вылетает в руки. */
  private nearWater(spot: number, out: THREE.Vector3): THREE.Vector3 {
    const at = this.places[spot];
    return out.set(at.x - Math.sin(at.yaw) * 1.0, WATER_Y, at.z - Math.cos(at.yaw) * 1.0);
  }

  /** Поплавок долетел: «плюп» и круги. */
  private landFloat(s: Spot, mine: boolean): void {
    s.ph = FP_WAIT;
    this.effects.ripple(s.x, s.z, 1.2, 1.1);
    this.effects.burst(s.x, WATER_Y + 0.05, s.z, 0xdff4ff, 5, 1.8, 0, 1, 0, 0.03);
    this.sound.fishPlop(mine ? null : [s.x, WATER_Y, s.z]);
  }

  /** Леска от кончика до поплавка: квадратичная кривая, провис — sag на метр длины. */
  private drawLine(s: Spot, a: THREE.Vector3, b: THREE.Vector3, sag: number): void {
    const p = s.linePos;
    const d = a.distanceTo(b);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - d * sag;
    const mz = (a.z + b.z) / 2;
    for (let i = 0; i <= LINE_N; i++) {
      const t = i / LINE_N;
      const u = 1 - t;
      p[i * 3] = u * u * a.x + 2 * u * t * mx + t * t * b.x;
      p[i * 3 + 1] = u * u * a.y + 2 * u * t * my + t * t * b.y;
      p[i * 3 + 2] = u * u * a.z + 2 * u * t * mz + t * t * b.z;
    }
    (s.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Удочка: в руках (наклон pitch, изгиб bend к кончику) или лежит на настиле (lie = 1); crank — поворот ручки катушки. */
  private poseRig(r: Rig, pitch: number, bend: number, lie: number, crank: number): void {
    r.root.position.set(lerp(GRIP.x, 0.55, lie), lerp(GRIP.y, 0.05, lie), lerp(GRIP.z, -0.1, lie));
    r.root.rotation.set(lerp(pitch, 0, lie), lerp(0, 0.25, lie), lerp(0, Math.PI / 2, lie));
    const b = lerp(bend, 0, lie);
    r.joints.forEach((j, i) => (j.rotation.x = -b * BEND_W[i]));
    r.crank.rotation.x = crank;
  }

  /** Улов в руках над головой: бьётся сразу после поимки и время от времени потом. */
  private poseHeldFish(s: Spot, bob: number): void {
    const f = s.fish!;
    if (s.anim === A_DONE) return;
    f.position.set(0, HOLD_HANDS_Y + 0.08 + s.fishHalf.y + bob, -0.12);
    const flap = Math.max(Math.exp(-s.t * 1.1), (s.t % 2.6) < 0.6 ? Math.sin(((s.t % 2.6) / 0.6) * Math.PI) : 0);
    f.rotation.set(0, Math.sin(s.t * 17) * 0.3 * flap, Math.sin(s.t * 11) * 0.12 * flap);
  }

  // ------------------------------------------------------------ рыба

  /** Рыба вида s.sp: создать — в руках у рыбака (его ещё не видно — дадим, когда появится). */
  private giveFish(s: Spot): void {
    this.dropFish(s);
    if (s.sp < 0 || !FISH[s.sp]) return;
    const f = makeFish3D(s.sp, s.g);
    s.fish = f;
    s.fishHalf.copy(f.userData.half as THREE.Vector3);
    s.av?.held.add(f);
  }

  /** Долетела до рук: в узел рук желейки (рыбака не видно — ждёт его). */
  private fishToHands(s: Spot): void {
    s.anim = A_NONE;
    const f = s.fish;
    if (!f) return;
    f.removeFromParent();
    f.position.set(0, HOLD_HANDS_Y + 0.08 + s.fishHalf.y, -0.12);
    f.rotation.set(0, 0, 0);
    f.scale.setScalar(f.userData.len as number);
    s.av?.held.add(f);
  }

  private dropFish(s: Spot): void {
    if (!s.fish) return;
    s.fish.removeFromParent();
    s.fish = null;
  }

  /** Довести анимацию до конца (новое событие пришло раньше, чем она кончилась). */
  private finishAnim(s: Spot): void {
    if (s.anim === A_LAND) this.fishToHands(s);
    if (s.anim === A_DONE) this.dropFish(s);
    s.anim = A_NONE;
    s.pending = false;
  }

  // ------------------------------------------------------------ места

  /** На месте сменился рыбак: удочка и руки — новому (или прячем). */
  private seat(s: Spot, av: Avatar | null): void {
    if (s.av) s.av.hands = null;
    s.rig.root.removeFromParent();
    // рыба в руках (или ждёт рук) уходит вместе с рыбаком; в полёте — остаётся в мире
    const inHands = s.fish !== null && s.fish.parent !== this.scene;
    if (inHands) s.fish!.removeFromParent();
    s.av = av;
    s.fpFree = false;
    if (!av) return;
    av.held.add(s.rig.root);
    if (inHands) av.held.add(s.fish!);
  }

  private clearSpot(s: Spot): void {
    s.ph = FP_IDLE;
    s.sp = -1;
    s.g = 0;
    s.n = 0;
    s.t = 0;
    s.anim = A_NONE;
    s.pending = false;
    s.nibT = 99;
    s.jerkT = 99;
    s.fpFree = false;
    s.toBucket = false;
    this.dropFish(s);
  }

  private makeSpot(): Spot {
    const linePos = new Float32Array((LINE_N + 1) * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
    lineMat ??= new THREE.LineBasicMaterial({ color: 0xf4f2ec, transparent: true, opacity: 0.8 });
    const line = new THREE.Line(lg, lineMat);
    line.frustumCulled = false;
    line.visible = false;
    this.scene.add(line);
    const float = makeFloat();
    float.visible = false;
    this.scene.add(float);
    return {
      ph: FP_IDLE, x: 0, z: 0, sp: -1, g: 0, n: 0, t: 0, anim: A_NONE, animT: 0, pending: false, nibT: 99, jerkT: 99, reelDur: 1, prog: -1, fxT: 0,
      kept: false, toBucket: false, from: new THREE.Vector3(), fp: new THREE.Vector3(), fpPrev: new THREE.Vector3(), fpFree: false,
      av: null, rig: makeRig(), float, line, linePos, fish: null, fishHalf: new THREE.Vector3(0.15, 0.05, 0.03),
    };
  }

  /**
   * Анимация ухода рыбы из рук: в альбом — вверх и тает, продана — тает, золотая рыбка (у соседей и хлам) — дугой
   * в море, в ведро — дугой в ведро.
   */
  private tickDone(dt: number): void {
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (s.anim !== A_DONE || !s.fish) continue;
      const k = Math.min(1, s.animT / DONE_S);
      const f = s.fish;
      const b = this.places[i].bucket;
      if (f.parent === this.scene && s.toBucket && b) {
        // в ведро: невысокой дугой, носом вниз; плюх — брызги над ведром
        const ty = b[1] + BUCKET_TOP;
        f.position.set(lerp(s.from.x, b[0], k), lerp(s.from.y, ty, k) + Math.sin(Math.PI * k) * 0.5, lerp(s.from.z, b[2], k));
        f.rotation.z = -k * 1.4;
        if (k >= 1) {
          this.effects.burst(b[0], ty + 0.02, b[2], 0xdff4ff, 6, 1.6, 0, 1, 0, 0.025);
          this.sound.fishPlop([b[0], ty, b[2]]);
          this.finishAnim(s);
        }
      } else if (f.parent === this.scene) {
        // отпустили в море: дугой к воде перед мостками
        const at = this.places[i];
        const tx = at.x - Math.sin(at.yaw) * 3;
        const tz = at.z - Math.cos(at.yaw) * 3;
        f.position.set(lerp(s.from.x, tx, k), lerp(s.from.y, WATER_Y, k) + Math.sin(Math.PI * k) * 1.4, lerp(s.from.z, tz, k));
        f.rotation.z = -k * 2.2;
        if (k >= 1) {
          this.effects.waterSplash(tx, tz, false);
          if (s.sp === GOLDFISH) this.fx.sparkle(tx, WATER_Y + 0.3, tz, 26);
          this.finishAnim(s);
        }
      } else {
        const sc = Math.max(0.001, 1 - smooth(k));
        f.scale.setScalar((f.userData.len as number) * sc);
        f.position.y += (s.kept ? 1.2 : 0.3) * dt;
      }
    }
  }

  debug(): Array<{ ph: number; anim: number; n: number; sp: number }> {
    return this.spots.map((s) => ({ ph: s.ph, anim: s.anim, n: s.n, sp: s.sp }));
  }
}

/** Точка на удочке (оси удочки: −Z вдоль удилища) в осях желейки при наклоне pitch. */
function rodPoint(pitch: number, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  return out.set(GRIP.x + x, GRIP.y + y * c - z * s, GRIP.z + y * s + z * c);
}

function makeRig(): Rig {
  if (!rodRes) {
    const along = (r0: number, r1: number, len: number, z0: number) => {
      const g = new THREE.CylinderGeometry(r1, r0, len, 8, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0, z0 - len / 2);
      return g;
    };
    const spool = new THREE.CylinderGeometry(0.045, 0.045, 0.035, 14);
    spool.rotateZ(Math.PI / 2);
    spool.translate(0, -0.075, -0.08);
    // колено — SUB частей, у каждой свой сгиб
    const parts = SEGS.flatMap(([len, r0, r1]) =>
      Array.from({ length: SUB }, (_, k): [number, number, number] => [len / SUB, lerp(r0, r1, k / SUB), lerp(r0, r1, (k + 1) / SUB)]));
    const last = parts.length - 1;
    rodRes = {
      parts,
      blank: parts.map(([len, r0, r1], i) => along(r0, r1, i === last ? len - TIP_LEN : len, 0)),
      tipGeo: along(parts[last][2] * 1.6, parts[last][2], TIP_LEN, -(parts[last][0] - TIP_LEN)),
      handle: along(0.024, 0.02, HANDLE_BACK + HANDLE_FWD, HANDLE_BACK),
      spool,
      stem: new THREE.BoxGeometry(0.012, 0.05, 0.012).translate(0, -0.035, -0.08),
      arm: new THREE.BoxGeometry(0.012, 0.012, 0.06).translate(0, 0, -0.03),
      knob: new THREE.SphereGeometry(0.014, 8, 6).translate(0, 0, -0.06),
      blankMat: new THREE.MeshStandardMaterial({ color: 0x24313f, roughness: 0.35, metalness: 0.3 }),
      tipMat: new THREE.MeshStandardMaterial({ color: 0xe0452f, roughness: 0.4 }),
      corkMat: new THREE.MeshStandardMaterial({ color: 0xc89b6a, roughness: 0.85 }),
      metalMat: new THREE.MeshStandardMaterial({ color: 0x8d979f, roughness: 0.3, metalness: 0.7 }),
    };
  }
  const r = rodRes;
  const root = new THREE.Group();
  root.add(new THREE.Mesh(r.handle, r.corkMat));
  root.add(new THREE.Mesh(r.spool, r.metalMat));
  root.add(new THREE.Mesh(r.stem, r.metalMat));
  const crank = new THREE.Group();
  crank.position.set(-0.03, -0.075, -0.08);
  crank.add(new THREE.Mesh(r.arm, r.metalMat), new THREE.Mesh(r.knob, r.corkMat));
  root.add(crank);
  const joints: THREE.Group[] = [];
  let parent: THREE.Object3D = root;
  let z = -HANDLE_FWD;
  const last = r.parts.length - 1;
  r.parts.forEach(([len], i) => {
    const j = new THREE.Group();
    j.position.z = z;
    j.add(new THREE.Mesh(r.blank[i], r.blankMat));
    if (i === last) j.add(new THREE.Mesh(r.tipGeo, r.tipMat));
    parent.add(j);
    joints.push(j);
    parent = j;
    z = -len;
  });
  const tip = new THREE.Object3D();
  tip.position.z = -r.parts[last][0];
  parent.add(tip);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { root, joints, tip, crank };
}

function makeFloat(): THREE.Group {
  if (!floatRes) {
    floatRes = {
      top: new THREE.SphereGeometry(FLOAT_R, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.3, 1),
      bottom: new THREE.SphereGeometry(FLOAT_R, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 1.3, 1),
      stick: new THREE.CylinderGeometry(0.009, 0.009, 0.16, 6).translate(0, FLOAT_R * 1.3 + 0.07, 0),
      red: new THREE.MeshStandardMaterial({ color: 0xe8392a, roughness: 0.35, emissive: 0x3a0804 }),
      white: new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.4 }),
    };
  }
  const f = floatRes;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(f.top, f.red), new THREE.Mesh(f.bottom, f.white), new THREE.Mesh(f.stick, f.red));
  return g;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}
