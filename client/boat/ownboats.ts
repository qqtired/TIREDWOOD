// Свои лодки у себя (флаг ISLE, shared/ownboat.ts; сервер — server/lobby/ownboats.ts). Лодки у всех — по сообщениям
// ob (состав и где стоят) и obPos (на ходу, плавно на 3 тика позже часов отрисовки), своя у штурмана — предсказанием
// тем же шагом, что на сервере (сверка с obMe). Рисуются инстансами (client/boat/models.ts), пирс-стоянка за домом
// Семёна — тоже здесь. Желейки в лодке сидят на своих местах по позе лодки на экране. Интерфейс лодки: скорость,
// стрелки к острову (по бакенам F1–F6) и к стоянке, якорь Z, гудок — пробел, «Продать улов» (R) у причала, место под
// кнопку радио (пакет радио: radioSlot и onBoat). E у таблички места: своя лодка — за штурвал, чужая — пассажиром,
// свободное место — окно вызова (client/boat/boatui.ts). Вкладка «⛵ Лодки» у Семёна — там же.
// Сцена набережной (scene.ts) зовёт: welcome, onJson, tickInput, frameInput, frame, avatarPose, selfPose, onKey, onUse,
// useBerth, hint, berthHint, debug, reset.
import * as THREE from 'three';
import { TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import { BOATS } from '../../shared/fishboat.ts';
import { ISLE_CENTER } from '../../shared/fishisle.ts';
import { BOAT_FISH_SPOTS, boatSpotOf } from '../../shared/fishplaces.ts';
import { fishLevel } from '../../shared/fishprogress.ts';
import { ACT_FISH, ACT_OWNBOAT } from '../../shared/lobby.ts';
import { ISLE_ROUTE_BUOYS } from '../../shared/maps/isle.ts';
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import {
  BERTHS, ISLE_DOCK_CENTER, OB_ANCHORED, OB_DOCK, OB_DROP, OB_MOOR, OB_PASSENGER_LEVEL, OB_POS_N, OB_RAISE, OB_SEA, OB_SUMMON, PARK_CENTER,
  anchorZone, canAnchorAt, copyObState, isParkBerth, makeObState, nearDock, readObState, sameObState, seatCastYaw, seatWorld, stepOwnBoat,
  type ObState, type ObView,
} from '../../shared/ownboat.ts';
import type { Input as NetInput } from '../../shared/sim.ts';
import type { Sound } from '../audio.ts';
import type { Input } from '../input.ts';
import type { Avatar, AvatarPose } from '../render/avatar.ts';
import type { MeState } from '../scene.ts';
import type { FishNpcDialog } from '../lobby/fishnpcdialog.ts';
import { BoatHud, BoatShopTab, SummonDialog, km } from './boatui.ts';
import { BoatFleet, PierModel, type FleetPose, type PlateInfo } from './models.ts';
import './ownboats.css';

/** Чужую лодку рисуем на столько тиков позже часов отрисовки (позиции приходят раз в 2 тика) */
const VIEW_DELAY = 3;
const EXTRAPOLATE = 8;
const RING = 256;
/** Голоса моторов: лодка i — ENGINE + i, своя (без объёма) — ENGINE_MINE */
const ENGINE = 9600;
const ENGINE_MINE = 9650;
/** Мотор чужой лодки слышно ближе, м */
const ENGINE_HEAR = 150;
/** Сидящая желейка: низ — на подушке сиденья */
const SIT_DROP = 0.3;

export interface OwnBoatsDeps {
  scene: THREE.Scene;
  sound: Sound;
  hudRoot: HTMLElement;
  overlay: HTMLElement;
  input: Input;
  npc: FishNpcDialog;
  toast: (text: string, ms?: number) => void;
  send: (msg: ClientMsg) => void;
  me: () => MeState;
  /** Номер своей желейки в снимке */
  myId: () => number;
  /** Окно открылось (отпустить мышь) или закрылось (захватить снова) */
  modal: (open: boolean) => void;
  /** Твёрдое пирса-стоянки: включить, когда лодки есть (флаг ISLE) */
  setParkBoxes: (on: boolean) => void;
}

/** Событие для радио на лодке (пакет радио): лодка появилась/исчезла, своя ли */
export interface ObBoatEvent {
  i: number;
  pid: number;
  mine: boolean;
  on: boolean;
}

interface Sample {
  tick: number;
  s: ObState;
}

interface Entry {
  seq: number;
  buttons: number;
  yaw: number;
  pitch: number;
  stepped: boolean;
  state: ObState;
}

/** Предсказание своей лодки штурманом: шаг тот же, что на сервере; obMe — сверка и переигровка своих входов. */
class ObPredictor {
  readonly state = makeObState();
  readonly prev = makeObState();
  readonly offset = new THREE.Vector3();
  ready = false;
  i = -1;
  /** С какого своего входа — якорь (бросить или поднять); так же решает сервер */
  anchorAt = Infinity;
  corrections = 0;
  private readonly ring: Entry[] = [];
  private newest = 0;
  private readonly tmp: NetInput = { seq: 0, buttons: 0, yaw: 0, pitch: 0, viewTick: 0 };

  constructor() {
    for (let i = 0; i < RING; i++) this.ring.push({ seq: -1, buttons: 0, yaw: 0, pitch: 0, stepped: false, state: makeObState() });
  }

  input(inp: NetInput): void {
    const e = this.ring[inp.seq % RING];
    e.seq = inp.seq;
    e.buttons = inp.buttons;
    e.yaw = inp.yaw;
    e.pitch = inp.pitch;
    e.stepped = this.ready;
    this.newest = inp.seq;
    if (!this.ready) return;
    copyObState(this.prev, this.state);
    stepOwnBoat(this.state, inp, inp.seq === this.anchorAt);
    copyObState(e.state, this.state);
  }

  accept(i: number, ack: number, server: ObState): void {
    const e = this.ring[ack % RING];
    if (this.ready && this.i === i && e.seq === ack && e.stepped && sameObState(e.state, server)) {
      if (ack >= this.anchorAt) this.anchorAt = Infinity;
      return;
    }
    const fresh = !this.ready || this.i !== i;
    const x = this.state.x;
    const z = this.state.z;
    this.i = i;
    copyObState(this.state, server);
    copyObState(this.prev, server);
    this.ready = true;
    if (!fresh) this.corrections++;
    const inp = this.tmp;
    for (let seq = Math.max(ack + 1, this.newest - RING + 1); seq <= this.newest; seq++) {
      const r = this.ring[seq % RING];
      if (r.seq !== seq) continue;
      inp.seq = seq;
      inp.buttons = r.buttons;
      inp.yaw = r.yaw;
      inp.pitch = r.pitch;
      copyObState(this.prev, this.state);
      stepOwnBoat(this.state, inp, seq === this.anchorAt);
      copyObState(r.state, this.state);
      r.stepped = true;
    }
    if (ack >= this.anchorAt) this.anchorAt = Infinity;
    const dx = x - this.state.x;
    const dz = z - this.state.z;
    if (fresh || Math.hypot(dx, dz) > 8) this.offset.set(0, 0, 0);
    else this.offset.add(new THREE.Vector3(dx, 0, dz));
  }

  stop(): void {
    this.ready = false;
    this.i = -1;
    this.anchorAt = Infinity;
    this.offset.set(0, 0, 0);
  }

  decay(dt: number): void {
    this.offset.multiplyScalar(Math.exp(-dt * 6));
  }
}

/** Лодка у себя: вид с сервера, последнее состояние, позиции на ходу, поза на экране */
interface Boat {
  v: ObView;
  s: ObState;
  track: Sample[];
  pose: FleetPose;
  /** Скорость и руль на экране (для крена, мотора) */
  speed: number;
  steer: number;
}

function wrap(a: number): number {
  return a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
}

export class OwnBoatsClient {
  /** Флаг сервера ISLE: лодки и стоянка есть (пришло сообщение ob) */
  enabled = false;
  /** Пакет радио: лодка появилась или исчезла (своя — mine) */
  readonly onBoat: Array<(e: ObBoatEvent) => void> = [];
  readonly pred = new ObPredictor();
  private readonly d: OwnBoatsDeps;
  private readonly boats = new Map<number, Boat>();
  private readonly fleet: BoatFleet;
  private readonly pier: PierModel;
  private readonly hud: BoatHud;
  private readonly summon: SummonDialog;
  /** Вкладка «⛵ Лодки» у Семёна */
  readonly shop: BoatShopTab;
  private renderTick = 0;
  private time = 0;
  private lastSeq = 0;
  /** Своё действие и аргумент (последний кадр) */
  private act = 0;
  private arg = 0;
  private engines = new Set<number>();
  private readonly drawList: FleetPose[] = [];
  private readonly seatTmp = { x: 0, y: 0, z: 0 };

  constructor(d: OwnBoatsDeps) {
    this.d = d;
    this.fleet = new BoatFleet(d.scene);
    this.pier = new PierModel(d.scene);
    this.hud = new BoatHud(d.hudRoot, {
      anchor: () => this.askAnchor(),
      sell: () => this.askSell(),
    });
    this.summon = new SummonDialog(d.overlay, {
      send: (berth, boat) => d.send({ t: 'ob', a: 'summon', b: berth, boat }),
      onOpen: () => d.modal(true),
      onClose: () => d.modal(false),
    });
    this.shop = new BoatShopTab(d.npc, d.me);
  }

  /** Место под кнопку радио в интерфейсе лодки (пакет радио кладёт сюда свою кнопку) */
  get radioSlot(): HTMLElement {
    return this.hud.radio;
  }

  /** Открыто окно вызова лодки (мышь свободна, клавиши — ему) */
  get modalOpen(): boolean {
    return this.summon.isOpen;
  }

  /** Своя лодка (номер в мире) или −1 */
  get mine(): number {
    const pid = this.d.me().pid;
    for (const b of this.boats.values()) if (b.v.pid === pid) return b.v.i;
    return -1;
  }

  /** Поза лодки i на экране (для звука радио и т. п.) */
  boatPose(i: number): Readonly<FleetPose> | null {
    return this.boats.get(i)?.pose ?? null;
  }

  /** Приветствие набережной: до сообщения ob лодок нет (флаг ISLE выключен) */
  welcome(): void {
    this.reset();
    for (const i of [...this.boats.keys()]) this.drop(i);
    this.enabled = false;
    this.pier.visible = false;
    this.d.setParkBoxes(false);
  }

  reset(): void {
    this.pred.stop();
    this.summon.close();
    this.hud.hide();
    for (const id of this.engines) this.d.sound.engineStop(id);
    this.engines.clear();
  }

  onJson(msg: ServerMsg): void {
    if (msg.t === 'ob') this.onRoster(msg.k, msg.boats, msg.pos);
    else if (msg.t === 'obPos') this.onPos(msg.k, msg.p);
    else if (msg.t === 'obMe') {
      const s = readObState(msg.s, makeObState());
      if (s && this.act === ACT_OWNBOAT && this.seatOf(this.act, this.arg)?.seat === 0) this.pred.accept(msg.i, msg.ack, s);
    } else if (msg.t === 'obHorn') {
      const b = this.boats.get(msg.i);
      if (b) this.d.sound.horn(0.4, [b.pose.x, WATER_Y + 1, b.pose.z]);
    }
  }

  private onRoster(k: number, views: ObView[], pos: number[]): void {
    if (!this.enabled) {
      this.enabled = true;
      this.pier.visible = true;
      this.fleet.load();
      this.d.setParkBoxes(true);
    }
    const seen = new Set<number>();
    const pid = this.d.me().pid;
    for (const v of views) {
      seen.add(v.i);
      let b = this.boats.get(v.i);
      if (!b || b.v.pid !== v.pid) {
        if (b) this.drop(v.i);
        b = { v, s: makeObState(v.k), track: [], pose: { kind: v.k, x: 0, y: WATER_Y, z: 0, yaw: 0, pitch: 0, roll: 0, anchor: 0 }, speed: 0, steer: 0 };
        this.boats.set(v.i, b);
        for (const f of this.onBoat) f({ i: v.i, pid: v.pid, mine: v.pid === pid, on: true });
      }
      b.v = v;
    }
    for (const i of [...this.boats.keys()]) if (!seen.has(i)) this.drop(i);
    this.onPos(k, pos, true);
    this.updatePlates();
    this.summon.update(this.berthInfo(), this.owned());
  }

  private drop(i: number): void {
    const b = this.boats.get(i);
    if (!b) return;
    this.boats.delete(i);
    if (this.engines.delete(ENGINE + i)) this.d.sound.engineStop(ENGINE + i);
    for (const f of this.onBoat) f({ i, pid: b.v.pid, mine: b.v.pid === this.d.me().pid, on: false });
  }

  private onPos(k: number, p: unknown, full = false): void {
    if (!Array.isArray(p)) return;
    for (let o = 0; o + OB_POS_N <= p.length; o += OB_POS_N) {
      const a = p.slice(o, o + OB_POS_N) as number[];
      if (a.some((x) => typeof x !== 'number' || !Number.isFinite(x))) continue;
      const b = this.boats.get(a[0]);
      if (!b) continue;
      const s = b.s;
      [s.ph, s.x, s.z, s.yaw, s.v, s.steer, s.k, s.t, s.fx, s.fz, s.fyaw, s.b] = a.slice(1);
      s.kind = b.v.k;
      const tr = b.track;
      const last = tr[tr.length - 1];
      if (last && k <= last.tick) {
        if (k < last.tick - 600) tr.length = 0;
        else if (!full) continue;
        else tr.length = 0;
      }
      tr.push({ tick: k, s: copyObState(makeObState(), s) });
      if (tr.length > 16) tr.shift();
      // на якоре: места рыбалки в лодке (поплавки и леска — от них) — как у сервера
      if (s.ph === OB_ANCHORED) this.anchorSpots(b);
    }
  }

  private anchorSpots(b: Boat): void {
    const kind = BOATS[b.v.k];
    for (let seat = 0; seat < 3; seat++) {
      const at = seatWorld(b.s, kind, seat, this.seatTmp);
      const spot = BOAT_FISH_SPOTS[b.v.i * 3 + seat];
      spot.x = at.x;
      spot.z = at.z;
      spot.yaw = seatCastYaw(b.s.yaw, seat);
      spot.zone = anchorZone(at.x, at.z);
      spot.sonar = kind.sonar;
    }
  }

  /** Что стоит у бертов: ник хозяина и своя ли (для табличек и окна вызова) */
  private berthInfo(): Array<PlateInfo | null> {
    const pid = this.d.me().pid;
    const out: Array<PlateInfo | null> = BERTHS.map(() => null);
    for (const b of this.boats.values()) {
      const s = b.s;
      if (s.b >= 0 && (s.ph === OB_DOCK || s.ph === OB_MOOR || s.ph === OB_SUMMON)) out[s.b] = { nick: b.v.nick, mine: b.v.pid === pid };
    }
    return out;
  }

  private updatePlates(): void {
    this.pier.plates(this.berthInfo().slice(0, 10));
  }

  private owned(): string[] {
    return this.d.me().fishing.boats ?? [];
  }

  // ------------------------------------------------------------ ввод

  /** Свой вход (каждый тик): штурману — шаг предсказания */
  tickInput(inp: NetInput): void {
    this.lastSeq = inp.seq;
    if (this.driving) this.pred.input(inp);
  }

  /** Я за штурвалом своей лодки */
  get driving(): boolean {
    return this.act === ACT_OWNBOAT && this.seatOf(this.act, this.arg)?.seat === 0;
  }

  /** Место в лодке по действию: на сиденье (ACT_OWNBOAT) или с удочкой на якоре (ACT_FISH на месте лодки) */
  seatOf(act: number, arg: number): { boat: number; seat: number } | null {
    if (act === ACT_OWNBOAT) return { boat: arg >> 2, seat: arg & 3 };
    if (act === ACT_FISH) return boatSpotOf(arg);
    return null;
  }

  /** Камера штурмана на ходу сама плавно разворачивается за носом (мышью — осмотреться) */
  frameInput(dt: number, act: number, arg: number): void {
    this.act = act;
    this.arg = arg;
    if (!this.driving || !this.pred.ready) return;
    const s = this.pred.state;
    const kind = BOATS[s.kind];
    const k = Math.min(1, Math.abs(s.v) / (kind.speed * 0.5));
    if (k > 0.05) {
      const inp = this.d.input;
      inp.yaw += wrap(s.yaw - inp.yaw) * (1 - Math.exp(-dt * 1.4 * k));
    }
  }

  /** E в лодке: у причала — сойти, штурману у стоянки или причала острова — пришвартоваться. true — съели. */
  onUse(act: number, arg: number): boolean {
    if (!this.enabled || act !== ACT_OWNBOAT) return false;
    void arg;
    this.d.send({ t: 'ob', a: 'e' });
    return true;
  }

  /** E у таблички места: стоит лодка — сесть (решает сервер), свободно — окно вызова */
  useBerth(id: number, berth: number): void {
    const info = this.berthInfo();
    if (info[berth]) {
      this.d.send({ t: 'use', id });
      return;
    }
    this.summon.open(berth, info, this.owned());
  }

  /** Клавиши в лодке: Z — якорь, пробел — гудок, R — продать улов. true — съели. */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    // в лодке (на сиденье или с удочкой на якоре); пробел с удочкой — вываживание, гудок — только за штурвалом
    if (!this.enabled || !this.seatOf(this.act, this.arg)) return false;
    if (this.summon.isOpen) return false;
    if (!down || e.repeat) return code === 'KeyZ' || (code === 'Space' && this.driving) || code === 'KeyR';
    if (code === 'KeyZ') {
      this.askAnchor();
      return true;
    }
    if (code === 'Space' && this.driving) {
      this.d.send({ t: 'ob', a: 'horn' });
      return true;
    }
    if (code === 'KeyR') {
      this.askSell();
      return true;
    }
    return false;
  }

  private askAnchor(): void {
    const at0 = this.seatOf(this.act, this.arg);
    const b = at0 ? this.boats.get(at0.boat) : undefined;
    if (!at0 || !b || at0.seat !== 0 || b.v.pid !== this.d.me().pid) {
      if (at0) this.d.toast('Якорем управляет хозяин лодки');
      return;
    }
    // с удочкой на якоре (лодка стоит, предсказания нет) — просто просим сервер поднять якорь
    if (!this.driving || !this.pred.ready) {
      this.d.send({ t: 'ob', a: 'anchor', at: this.lastSeq + 1 });
      return;
    }
    const s = this.pred.state;
    if (this.pred.anchorAt !== Infinity) return;
    if (s.ph === OB_SEA && !canAnchorAt(s.x, s.z)) {
      this.d.toast('Здесь фарватер — отойди подальше от причалов');
      return;
    }
    if (s.ph !== OB_SEA && s.ph !== OB_ANCHORED && s.ph !== OB_DROP) {
      if (s.ph === OB_DOCK) this.d.toast('У причала якорь не нужен — отойди в море');
      return;
    }
    const at = this.lastSeq + 1;
    this.pred.anchorAt = at;
    this.d.send({ t: 'ob', a: 'anchor', at });
  }

  private askSell(): void {
    const i = this.mine;
    const b = i >= 0 ? this.boats.get(i) : null;
    if (!b || this.seatOf(this.act, this.arg)?.boat !== i) return;
    this.d.send({ t: 'ob', a: 'sell' });
  }

  // ------------------------------------------------------------ кадр

  frame(dt: number, renderTick: number, alpha: number, camPos: THREE.Vector3, act: number, arg: number): void {
    if (!this.enabled) return;
    this.time += dt;
    this.renderTick = renderTick;
    this.act = act;
    this.arg = arg;
    if (!this.driving && this.pred.ready) this.pred.stop();
    this.pred.decay(dt);
    const list = this.drawList;
    list.length = 0;
    for (const b of this.boats.values()) {
      this.place(b, alpha);
      list.push(b.pose);
    }
    this.fleet.draw(list, camPos);
    this.sounds(camPos);
    this.hudUpdate();
  }

  /** Поза лодки на экране: своя у штурмана — предсказание, у берта и на якоре — как стоит, на ходу — плавно по позициям */
  private place(b: Boat, alpha: number): void {
    const p = b.pose;
    const kind = BOATS[b.v.k];
    p.kind = b.v.k;
    let x: number;
    let z: number;
    let yaw: number;
    let v: number;
    let steer: number;
    let k: number;
    if (this.driving && this.pred.ready && this.pred.i === b.v.i) {
      const a = this.pred.prev;
      const s = this.pred.state;
      const o = this.pred.offset;
      x = a.x + (s.x - a.x) * alpha + o.x;
      z = a.z + (s.z - a.z) * alpha + o.z;
      yaw = a.yaw + wrap(s.yaw - a.yaw) * alpha;
      v = s.v;
      steer = s.steer;
      k = s.k;
    } else {
      const s = this.sample(b, this.renderTick - VIEW_DELAY);
      x = s.x;
      z = s.z;
      yaw = s.yaw;
      v = s.v;
      steer = s.steer;
      k = s.k;
    }
    b.speed = v;
    b.steer = steer;
    // качка у берта и на якоре; на ходу нос приподнят, в повороте лодка кренится внутрь
    const run = Math.min(1, Math.abs(v) / kind.speed);
    const t = this.time + b.v.i * 1.7;
    p.x = x;
    p.z = z;
    p.yaw = yaw;
    p.y = WATER_Y + Math.sin(t * 1.25) * 0.035 * (1 - run * 0.6);
    p.pitch = Math.sin(t * 0.9) * 0.018 + (v > 0 ? run * 0.075 : 0);
    p.roll = Math.sin(t * 1.1) * 0.025 + steer * run * 0.13;
    p.anchor = k;
  }

  private readonly smp = makeObState();

  private sample(b: Boat, t: number): ObState {
    const tr = b.track;
    const out = this.smp;
    const s = b.s;
    if (s.ph === OB_DOCK || s.ph === OB_ANCHORED || !tr.length) return copyObState(out, s);
    const last = tr[tr.length - 1];
    if (last.tick < this.renderTick - 60) return copyObState(out, last.s);
    if (t >= last.tick) {
      copyObState(out, last.s);
      const prev = tr.length > 1 ? tr[tr.length - 2] : last;
      const span = last.tick - prev.tick;
      if (span > 0 && span <= 12) {
        const k = Math.min(t - last.tick, EXTRAPOLATE) / span;
        out.x += (last.s.x - prev.s.x) * k;
        out.z += (last.s.z - prev.s.z) * k;
        out.yaw += wrap(last.s.yaw - prev.s.yaw) * k;
      }
      return out;
    }
    let a = tr[0];
    let c = a;
    if (t > a.tick) {
      for (let i = 0; i < tr.length - 1; i++) {
        if (tr[i + 1].tick > t) {
          a = tr[i];
          c = tr[i + 1];
          break;
        }
      }
    }
    let k = c.tick > a.tick ? (t - a.tick) / (c.tick - a.tick) : 0;
    if (c.tick - a.tick > 40) k = k < 0.5 ? 0 : 1;
    copyObState(out, k < 0.5 ? a.s : c.s);
    out.x = a.s.x + (c.s.x - a.s.x) * k;
    out.z = a.s.z + (c.s.z - a.s.z) * k;
    out.yaw = a.s.yaw + wrap(c.s.yaw - a.s.yaw) * k;
    out.v = a.s.v + (c.s.v - a.s.v) * k;
    out.steer = a.s.steer + (c.s.steer - a.s.steer) * k;
    out.k = a.s.k + (c.s.k - a.s.k) * k;
    return out;
  }

  /** Моторы: своя (без объёма) по газу, чужие — ближе 150 м, когда на ходу */
  private sounds(camPos: THREE.Vector3): void {
    const { sound } = this.d;
    const want = new Set<number>();
    const mine = this.seatOf(this.act, this.arg)?.boat ?? -1;
    for (const b of this.boats.values()) {
      const s = b.s;
      const moving = s.ph !== OB_DOCK && s.ph !== OB_ANCHORED && Math.abs(b.speed) > 0.2;
      if (!moving) continue;
      const kind = BOATS[b.v.k];
      const run = Math.min(1, Math.abs(b.speed) / kind.speed);
      // тон: у «Волжанки» ниже, у «Нортсильвера» выше
      const tone = 5 + b.v.k * 3 + run * 14;
      if (b.v.i === mine) {
        want.add(ENGINE_MINE);
        sound.engine(ENGINE_MINE, null, tone, false, 0, 0.03 + run * 0.05);
      } else if (Math.hypot(b.pose.x - camPos.x, b.pose.z - camPos.z) < ENGINE_HEAR) {
        want.add(ENGINE + b.v.i);
        sound.engine(ENGINE + b.v.i, [b.pose.x, WATER_Y + 0.5, b.pose.z], tone, false, 0, 0.3 + run * 0.4);
      }
    }
    for (const id of this.engines) if (!want.has(id)) sound.engineStop(id);
    this.engines = want;
  }

  // ------------------------------------------------------------ желейки в лодке

  /**
   * Поза желейки в лодке: на своём месте по позе лодки на экране (с удочкой на якоре — лицом за борт). Не в лодке —
   * как пришла. Штурман — за штурвалом (поза «за рулём»), пассажиры сидят.
   */
  avatarPose(av: Avatar, act: number, arg: number, pose: AvatarPose | null): AvatarPose | null {
    const at = this.enabled && pose ? this.seatOf(act, arg) : null;
    const b = at ? this.boats.get(at.boat) : undefined;
    if (!at || !b || !pose) {
      if (av.driving && av.action !== ACT_OWNBOAT) av.driving = false;
      return pose;
    }
    this.seatPose(b, at.seat, act === ACT_FISH, pose);
    av.driving = act === ACT_OWNBOAT && at.seat === 0;
    av.steer = av.driving ? b.steer : 0;
    return pose;
  }

  /** Своя желейка в лодке: поза на месте (true — поставили) */
  selfPose(act: number, arg: number, pose: AvatarPose): boolean {
    const at = this.enabled ? this.seatOf(act, arg) : null;
    const b = at ? this.boats.get(at.boat) : undefined;
    if (!at || !b) return false;
    this.seatPose(b, at.seat, act === ACT_FISH, pose);
    return true;
  }

  private seatPose(b: Boat, seat: number, fishing: boolean, pose: AvatarPose): void {
    const p = b.pose;
    const at = seatWorld(p, BOATS[b.v.k], seat, this.seatTmp);
    pose.x = at.x;
    pose.y = at.y + (p.y - WATER_Y) - (fishing ? 0.05 : SIT_DROP);
    pose.z = at.z;
    pose.yaw = fishing ? seatCastYaw(p.yaw, seat) : p.yaw;
    pose.pitch = 0;
  }

  // ------------------------------------------------------------ подсказки и интерфейс

  /** Подсказка в лодке: [клавиши, текст] */
  hint(): [string[], string] {
    const at = this.seatOf(this.act, this.arg);
    const b = at ? this.boats.get(at.boat) : undefined;
    if (!at || !b) return [[], ''];
    const s = this.driving && this.pred.ready ? this.pred.state : b.s;
    if (s.ph === OB_DOCK) return [['E'], at.seat === 0 ? `сойти на берег · ${isParkBerth(s.b) ? 'S — отойти задним ходом' : 'W — от причала'}` : 'сойти на берег'];
    if (at.seat !== 0) return [[], s.ph === OB_ANCHORED ? 'На якоре — E, чтобы снова взять удочку' : `Ты в лодке ${b.v.nick} · сойти — у стоянки или причала острова · мышь — осмотреться`];
    if (s.ph === OB_MOOR) return [[], 'Швартуемся…'];
    if (s.ph === OB_DROP) return [[], 'Якорь идёт вниз…'];
    if (s.ph === OB_RAISE) return [[], 'Поднимаем якорь…'];
    if (s.ph === OB_ANCHORED) return [['Z'], 'поднять якорь · E — снова взять удочку'];
    const dock = nearDock(s.x, s.z);
    if (dock) return [['E'], `пришвартоваться у ${dock === 'park' ? 'стоянки' : 'причала острова'} · Z — якорь`];
    return [['W', 'S', 'A', 'D'], 'газ и руль · Z — якорь · пробел — гудок · мышь — осмотреться'];
  }

  /** Подсказка у таблички места */
  berthHint(berth: number): [string[], string] {
    const info = this.berthInfo()[berth];
    const label = isParkBerth(berth) ? berth + 1 : berth - 9;
    if (info?.mine) return [['E'], `за штурвал своей лодки · место ${label}`];
    if (info) {
      const lvl = fishLevel(this.d.me().fishing.xp);
      return [['E'], lvl < OB_PASSENGER_LEVEL ? `лодка ${info.nick} · пассажиром — с ${OB_PASSENGER_LEVEL}-го уровня рыбалки` : `сесть к ${info.nick} пассажиром (когда хозяин за штурвалом)`];
    }
    return [['E'], this.owned().length ? `вызвать свою лодку к месту ${label}` : `место ${label} · свои лодки продаёт Дед Семён`];
  }

  private hudUpdate(): void {
    const at = this.seatOf(this.act, this.arg);
    const b = at ? this.boats.get(at.boat) : undefined;
    if (!at || !b) {
      this.hud.hide();
      return;
    }
    const s = this.driving && this.pred.ready ? this.pred.state : b.s;
    const p = b.pose;
    const kind = BOATS[b.v.k];
    const isle = this.isleTarget(p.x, p.z);
    const home = nearDock(p.x, p.z, 60) === 'isle' || Math.hypot(p.x - ISLE_CENTER.x, p.z - ISLE_CENTER.z) < 600
      ? { x: ISLE_DOCK_CENTER.x, z: ISLE_DOCK_CENTER.z } : null;
    const yaw = this.d.input.yaw;
    const mine = b.v.pid === this.d.me().pid;
    const docked = s.ph === OB_DOCK || nearDock(p.x, p.z, 10) !== null;
    this.hud.show({
      title: `«${kind.name}»${mine ? '' : ` · лодка ${b.v.nick}`}`,
      speed: `${Math.round(Math.abs(b.speed) * 3.6)} км/ч`,
      phase: s.ph === OB_ANCHORED ? '⚓ на якоре' : s.ph === OB_DROP ? '⚓ якорь идёт вниз' : s.ph === OB_RAISE ? '⚓ поднимаем якорь' : s.ph === OB_DOCK ? 'у причала'
        : s.ph === OB_MOOR ? 'швартуемся' : b.speed < -0.3 ? 'задний ход' : '',
      isle: { label: isle.label, dist: km(isle.d), rot: this.arrow(p.x, p.z, isle.x, isle.z, yaw) },
      park: { label: home ? 'Причал острова' : 'Стоянка у Семёна', dist: km(Math.hypot((home ?? PARK_CENTER).x - p.x, (home ?? PARK_CENTER).z - p.z)),
        rot: this.arrow(p.x, p.z, (home ?? PARK_CENTER).x, (home ?? PARK_CENTER).z, yaw) },
      sonar: `эхолот: поклёвка с якоря на ${Math.round(kind.sonar * 100)} % быстрее`,
      anchor: mine && at.seat === 0 && (s.ph === OB_SEA || s.ph === OB_ANCHORED),
      anchorDown: s.ph === OB_ANCHORED,
      sell: mine && docked,
    });
  }

  /** Куда вести к острову: следующий бакен F1–F6 по пути (ближе к острову, чем лодка), за ними — сам остров */
  private isleTarget(x: number, z: number): { label: string; x: number; z: number; d: number } {
    const me = Math.hypot(x - ISLE_CENTER.x, z - ISLE_CENTER.z);
    const island = { label: 'Остров «Последний свет»', x: ISLE_CENTER.x, z: ISLE_CENTER.z, d: me };
    if (me < 700) return island;
    for (const b of ISLE_ROUTE_BUOYS) {
      const bd = Math.hypot(b.x - ISLE_CENTER.x, b.z - ISLE_CENTER.z);
      if (bd < me - 40) return { label: `Бакен ${b.id} → остров ${km(me)}`, x: b.x, z: b.z, d: Math.hypot(b.x - x, b.z - z) };
    }
    return island;
  }

  /** Поворот стрелки на экране: 0 — прямо по взгляду камеры, плюс — по часовой */
  private arrow(x: number, z: number, tx: number, tz: number, camYaw: number): number {
    const bearing = Math.atan2(-(tx - x), -(tz - z));
    return -wrap(bearing - camYaw);
  }

  debug(): object {
    return {
      enabled: this.enabled, driving: this.driving, ready: this.pred.ready, corrections: this.pred.corrections, fleet: this.fleet.ready, drawn: this.fleet.drawn,
      boats: [...this.boats.values()].map((b) => ({ i: b.v.i, kind: BOATS[b.v.k].id, nick: b.v.nick, ph: b.s.ph, b: b.s.b, x: Math.round(b.pose.x * 10) / 10, z: Math.round(b.pose.z * 10) / 10, seats: b.v.s })),
      pred: this.pred.ready ? { ...this.pred.state } : null,
    };
  }
}

export { TICK_RATE };
