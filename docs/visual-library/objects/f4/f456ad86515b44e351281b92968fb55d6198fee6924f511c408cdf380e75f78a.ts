// Гидроплан «Стриж» у себя (shared/plane.ts): самолёт на воде у западного края площади и в небе — у всех по сообщениям
// planePos с плавностью (на 3 тика позже часов отрисовки, при задержке — по скорости вперёд), у пилота — предсказанием
// тем же шагом, что на сервере (сверка с planeMe). Пилоту: камера сзади и чуть сверху (колесо — ближе/дальше),
// мышь ведёт нос (цель — кружок впереди), интерфейс с временем и «сесть раньше» (E дважды), мотор и ветер.
// Баннер: у таблички E — окошко заказа пролёта с надписью, в своём полёте B — прицепить баннер (planebanner.ts).
// Сцена набережной (scene.ts) зовёт: welcome, onJson, tickInput, frameInput, frame, camera, avatarPose, hint, onKey.
import * as THREE from 'three';
import { TICK_RATE } from '../../shared/constants.ts';
import { ACT_PLANE } from '../../shared/lobby.ts';
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import {
  BANNER_MAX, BANNER_PRICE, BANNER_TRIP_TICKS, PL_DOCK, PL_FLY, PL_HOME, PL_LAND, PL_START, PLANE_DOCK, PLANE_FAST, PLANE_FLOAT_Y, PLANE_FLY_TICKS,
  PLANE_LEAD, PLANE_PITCH_MAX, PLANE_PRICE, PLANE_TRIP_TICKS, copyPlane, emptyPlaneView, makePlane, planeCeil, planeFloor, readPlane, samePlane,
  stepPlane, wrapAngle, type PlaneState, type PlaneView,
} from '../../shared/plane.ts';
import type { Input as NetInput } from '../../shared/sim.ts';
import type { Sound } from '../audio.ts';
import type { Input } from '../input.ts';
import type { AvatarPose } from '../render/avatar.ts';
import { TOUCH } from '../touch.ts';
import { PlaneModel, PlaneSign } from './plane3d.ts';
import { BannerPanel } from './planebanner.ts';
import './plane.css';

/** Голоса мотора: чужой самолёт (в мире) и свой (без объёма) */
const ENGINE_ID = 9500;
const ENGINE_MINE = 9501;
/** Чужой самолёт рисуем на столько тиков позже часов отрисовки (позиции приходят раз в 4 тика) */
const VIEW_DELAY = 3;
/** Дальше последней позиции — по скорости вперёд, не больше стольких тиков */
const EXTRAPOLATE = 8;
/** Камера: расстояние по умолчанию и пределы колеса */
const CAM_DIST = 12;
const CAM_MIN = 6;
const CAM_MAX = 26;
/** С баннером камера не дальше этого — полотнище висит за ней (трос — planebanner.ts) */
const CAM_MAX_BANNER = 13;
/** «Сесть сейчас» — второе нажатие E в течение 3 с */
const ASK_MS = 3000;
const RING = 256;

export interface PlaneDeps {
  scene: THREE.Scene;
  sound: Sound;
  hudRoot: HTMLElement;
  input: Input;
  toast: (text: string, ms?: number) => void;
  send: (msg: ClientMsg) => void;
  me: () => { nick: string; tokens: number };
  /** Окошко баннера открылось (отпустить мышь) или закрылось (захватить снова) */
  modal: (open: boolean) => void;
}

interface Pose {
  ph: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  v: number;
}

interface Sample extends Pose {
  k: number;
}

function dockPose(p: Pose): Pose {
  p.ph = PL_DOCK;
  p.x = PLANE_DOCK.x;
  p.y = PLANE_FLOAT_Y;
  p.z = PLANE_DOCK.z;
  p.yaw = PLANE_DOCK.yaw;
  p.pitch = 0;
  p.roll = 0;
  p.v = 0;
  return p;
}

/** Позиции самолёта по тикам сервера: картинка — между двумя соседними. */
class PlaneTrack {
  readonly s: Sample[] = [];

  push(k: number, a: number[]): void {
    if (a.length < 8 || a.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return;
    const last = this.s[this.s.length - 1];
    if (last && k <= last.k) {
      // сервер перезапустился — с начала
      if (k < last.k - 600) this.s.length = 0;
      else return;
    }
    this.s.push({ k, ph: a[0], x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], roll: a[6], v: a[7] });
    if (this.s.length > 16) this.s.shift();
  }

  /** Есть ли позиции не старше tick − 30 */
  fresh(tick: number): boolean {
    const last = this.s[this.s.length - 1];
    return !!last && last.k > tick - 30;
  }

  sample(t: number, out: Pose): boolean {
    const s = this.s;
    if (!s.length) return false;
    const last = s[s.length - 1];
    if (t >= last.k) {
      // впереди позиций: по скорости последних двух (не дальше EXTRAPOLATE тиков)
      const prev = s.length > 1 ? s[s.length - 2] : last;
      Object.assign(out, last);
      const span = last.k - prev.k;
      if (span > 0 && span <= 12 && last.ph !== PL_DOCK) {
        const k = Math.min(t - last.k, EXTRAPOLATE) / span;
        out.x += (last.x - prev.x) * k;
        out.y += (last.y - prev.y) * k;
        out.z += (last.z - prev.z) * k;
        out.yaw += wrapAngle(last.yaw - prev.yaw) * k;
      }
      return true;
    }
    let a = s[0];
    let b = a;
    if (t > s[0].k) {
      for (let i = 0; i < s.length - 1; i++) {
        if (s[i + 1].k > t) {
          a = s[i];
          b = s[i + 1];
          break;
        }
      }
    }
    let k = b.k > a.k ? (t - a.k) / (b.k - a.k) : 0;
    // большой разрыв (новый полёт) — без «проезда» между точками
    if (b.k - a.k > 30) k = k < 0.5 ? 0 : 1;
    out.ph = k < 0.5 ? a.ph : b.ph;
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    out.z = a.z + (b.z - a.z) * k;
    out.yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * k;
    out.pitch = a.pitch + (b.pitch - a.pitch) * k;
    out.roll = a.roll + (b.roll - a.roll) * k;
    out.v = a.v + (b.v - a.v) * k;
    return true;
  }
}

interface Entry {
  seq: number;
  buttons: number;
  yaw: number;
  pitch: number;
  stepped: boolean;
  readonly state: PlaneState;
}

/** Предсказание своего самолёта: тот же шаг, что на сервере, на каждом своём входе; сверка — по planeMe. */
export class PlanePredictor {
  readonly state = makePlane();
  readonly prev = makePlane();
  readonly offset = new THREE.Vector3();
  ready = false;
  /** С какого своего входа — домой («Сесть сейчас»; так же решает сервер) */
  landAt = Infinity;
  corrections = 0;
  private readonly ring: Entry[] = [];
  private newest = 0;
  private readonly tmp: NetInput = { seq: 0, buttons: 0, yaw: 0, pitch: 0, viewTick: 0 };

  constructor() {
    for (let i = 0; i < RING; i++) this.ring.push({ seq: -1, buttons: 0, yaw: 0, pitch: 0, stepped: false, state: makePlane() });
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
    copyPlane(this.prev, this.state);
    stepPlane(this.state, inp, inp.seq >= this.landAt);
    copyPlane(e.state, this.state);
  }

  /** Точное состояние после входа ack: совпало с предсказанием — ничего; нет — ставим его и переигрываем свои входы. */
  accept(ack: number, server: PlaneState): void {
    const e = this.ring[ack % RING];
    if (this.ready && e.seq === ack && e.stepped && samePlane(e.state, server)) return;
    const fresh = !this.ready;
    const x = this.state.x;
    const y = this.state.y;
    const z = this.state.z;
    copyPlane(this.state, server);
    copyPlane(this.prev, server);
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
      copyPlane(this.prev, this.state);
      stepPlane(this.state, inp, seq >= this.landAt);
      copyPlane(r.state, this.state);
      r.stepped = true;
    }
    const dx = x - this.state.x;
    const dy = y - this.state.y;
    const dz = z - this.state.z;
    if (fresh || Math.hypot(dx, dy, dz) > 10) this.offset.set(0, 0, 0);
    else this.offset.add(new THREE.Vector3(dx, dy, dz));
  }

  stop(): void {
    this.ready = false;
    this.landAt = Infinity;
    this.offset.set(0, 0, 0);
  }

  decay(dt: number): void {
    this.offset.multiplyScalar(Math.exp(-dt * 8));
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

/** Тики → «2:05» */
function clock(ticks: number): string {
  const s = Math.max(0, Math.ceil(ticks / TICK_RATE));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Тики → «через 40 с» / «через 3 мин» */
function soon(ticks: number): string {
  const s = Math.max(1, Math.ceil(ticks / TICK_RATE));
  return s < 90 ? `${s} с` : `${Math.round(s / 60)} мин`;
}

const _v = new THREE.Vector3();

export class PlaneClient {
  /** Флаг сервера PLANE: самолёт есть на набережной */
  enabled = false;
  view: PlaneView = emptyPlaneView();
  readonly pred = new PlanePredictor();
  readonly pose: Pose = dockPose({ ph: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, v: 0 });
  private readonly d: PlaneDeps;
  private readonly model: PlaneModel;
  private readonly sign: PlaneSign;
  private readonly track = new PlaneTrack();
  private mine = false;
  private lastSeq = 0;
  private renderTick = 0;
  private time = 0;
  private prop = 0;
  private engine = 0;
  private windT = 0;
  private askUntil = 0;
  private lastPh = PL_DOCK;
  /** Камера пилота */
  private camOn = false;
  private camT = 0;
  private camYaw = 0;
  private camPitch = 0;
  private zoom = CAM_DIST;
  private readonly camFrom = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private readonly hud: HTMLElement;
  private readonly hudTitle: HTMLElement;
  private readonly hudSub: HTMLElement;
  private readonly hudHelp: HTMLElement;
  private readonly hudLand: HTMLButtonElement;
  private readonly hudBanner: HTMLButtonElement;
  private readonly aim: HTMLElement;
  private hudKey = '';
  private readonly panel: BannerPanel;

  constructor(d: PlaneDeps) {
    this.d = d;
    this.model = new PlaneModel(d.scene);
    this.sign = new PlaneSign(d.scene);
    this.model.visible = false;
    this.sign.visible = false;
    this.hud = el('div', 'pl-hud', d.hudRoot);
    this.hud.hidden = true;
    const top = el('div', 'pl-top', this.hud);
    this.hudTitle = el('div', 'pl-title', top);
    this.hudSub = el('div', 'pl-sub', top);
    this.hudHelp = el('div', 'pl-help', this.hud);
    this.hudLand = el('button', 'pl-land', this.hud, 'Сесть сейчас');
    this.hudLand.type = 'button';
    this.hudLand.addEventListener('click', () => this.askLand());
    this.hudBanner = el('button', 'pl-banner', this.hud, `${TOUCH ? '' : 'B — '}баннер +${BANNER_PRICE} 🪙`);
    this.hudBanner.type = 'button';
    this.hudBanner.addEventListener('click', () => this.openBanner());
    this.aim = el('div', 'pl-aim', this.hud);
    this.panel = new BannerPanel({
      root: d.hudRoot,
      send: (text) => d.send({ t: 'plane', a: 'banner', text }),
      onOpen: () => d.modal(true),
      onClose: () => d.modal(false),
    });
    window.addEventListener('wheel', (e) => {
      if (this.flying && this.d.input.locked && !this.d.input.blocked) this.zoom = Math.min(CAM_MAX, Math.max(CAM_MIN, this.zoom * (1 + e.deltaY * 0.0012)));
    }, { passive: true });
  }

  /** Я — пилот и самолёт не у стоянки */
  get flying(): boolean {
    return this.mine && this.pose.ph !== PL_DOCK;
  }

  /** Открыто окошко баннера (мышь свободна, клавиши — ему) */
  get bannerOpen(): boolean {
    return this.panel.isOpen;
  }

  /**
   * Окошко баннера: в своём полёте (взлёт или свободный полёт, баннера ещё нет) — прицепить к самолёту, иначе —
   * заказать пролёт над набережной.
   */
  openBanner(): void {
    if (!this.enabled || this.panel.isOpen) return;
    if (this.flying) {
      const ph = this.pred.state.ph;
      if (this.view.b) this.d.toast('Баннер уже летит за самолётом');
      else if (ph !== PL_START && ph !== PL_FLY) this.d.toast('Самолёт уже идёт на посадку — баннер в следующий раз');
      else this.panel.open(true, `${BANNER_MAX} знаков · ${BANNER_PRICE} 🪙 — сразу`);
      return;
    }
    this.panel.open(false, this.bannerNote());
  }

  /** Когда взлетит заказанный сейчас баннер */
  private bannerNote(): string {
    const v = this.view;
    if (v.ph === PL_DOCK && !v.hold && v.q.length === 0) return 'Небо свободно — взлетит сразу';
    let t = v.ph === PL_DOCK ? (v.hold ? PLANE_TRIP_TICKS : 0) : this.eta();
    for (let i = 0; i < v.q.length; i++) t += v.qb[i] ? BANNER_TRIP_TICKS : PLANE_TRIP_TICKS;
    return `Небо занято — взлетит через ~${soon(t)} · оплата при взлёте`;
  }


  /** Приветствие набережной: есть ли самолёт (флаг сервера) и что с ним. */
  welcome(v: PlaneView | undefined): void {
    this.enabled = !!v;
    this.view = v ?? emptyPlaneView();
    this.model.visible = this.enabled;
    this.sign.visible = this.enabled;
    this.applyView();
  }

  reset(): void {
    this.panel.close();
    this.pred.stop();
    this.track.s.length = 0;
    this.mine = false;
    this.camOn = false;
    this.hud.hidden = true;
    this.d.sound.engineStop(ENGINE_ID);
    this.d.sound.engineStop(ENGINE_MINE);
    this.engine = 0;
  }

  onJson(msg: ServerMsg): void {
    if (msg.t === 'plane') {
      this.view = msg.v;
      this.applyView();
    } else if (msg.t === 'planePos') {
      if (Array.isArray(msg.p)) this.track.push(msg.k, msg.p);
    } else if (msg.t === 'planeMe') {
      const s = readPlane(msg.s, makePlane());
      if (s && this.mine && s.ph !== PL_DOCK) this.pred.accept(msg.ack, s);
    }
  }

  private applyView(): void {
    const v = this.view;
    this.model.setPilot(v.slot, v.nick, v.o, v.level);
    this.model.setBanner(v.ph !== PL_DOCK ? (v.b ?? '') : '');
    // мой баннер летит или стоит в очереди — заказ принят, поле окошка очищаем (при отказе текст остаётся)
    const me = this.d.me();
    if ((v.ph !== PL_DOCK && v.b && v.bn === me.nick) || v.q.some((n, j) => n === me.nick && v.qb?.[j])) this.panel.accepted();
  }

  /** Свой вход (каждый тик): пилоту — шаг предсказания. */
  tickInput(inp: NetInput): void {
    this.lastSeq = inp.seq;
    if (this.mine) this.pred.input(inp);
  }

  /**
   * Мышь пилота: в свободном полёте цель не дальше PLANE_LEAD от носа (не «накручивается»), вверх-вниз — в пределах
   * набора и снижения, у пола и потолка — без запаса, сама плавно выравнивается; на взлёте и автопилоте — по носу.
   */
  frameInput(dt: number, act: number): void {
    this.mine = act === ACT_PLANE;
    if (!this.mine || !this.pred.ready) return;
    const s = this.pred.state;
    const inp = this.d.input;
    if (s.ph === PL_FLY) {
      if (this.lastPh !== PL_FLY) {
        inp.yaw = s.yaw;
        inp.pitch = 0;
      }
      inp.yaw = s.yaw + Math.max(-PLANE_LEAD, Math.min(PLANE_LEAD, wrapAngle(inp.yaw - s.yaw)));
      const floor = planeFloor(s.x, s.z);
      const lo = s.y - floor < 4 ? -0.05 : -PLANE_PITCH_MAX;
      const hi = planeCeil(floor) - s.y < 4 ? 0.05 : PLANE_PITCH_MAX;
      inp.pitch = Math.max(lo, Math.min(hi, inp.pitch * Math.exp(-dt / 3.5)));
    } else if (s.ph === PL_START) {
      inp.yaw = s.yaw;
      inp.pitch = 0;
    } else {
      // автопилот: мышь — осмотреться (камера), самолёту она не нужна
      inp.yaw = s.yaw + Math.max(-2.6, Math.min(2.6, wrapAngle(inp.yaw - s.yaw)));
      inp.pitch = Math.max(-0.7, Math.min(0.4, inp.pitch));
    }
    this.lastPh = s.ph;
  }

  frame(dt: number, renderTick: number, alpha: number, camPos: THREE.Vector3, act: number): void {
    if (!this.enabled) return;
    this.time += dt;
    this.renderTick = renderTick;
    this.mine = act === ACT_PLANE;
    if (!this.mine && this.pred.ready) this.pred.stop();
    this.pred.decay(dt);
    const p = this.pose;
    if (this.mine && this.pred.ready) {
      const a = this.pred.prev;
      const b = this.pred.state;
      const o = this.pred.offset;
      p.ph = b.ph;
      p.x = a.x + (b.x - a.x) * alpha + o.x;
      p.y = a.y + (b.y - a.y) * alpha + o.y;
      p.z = a.z + (b.z - a.z) * alpha + o.z;
      p.yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * alpha;
      p.pitch = a.pitch + (b.pitch - a.pitch) * alpha;
      p.roll = a.roll + (b.roll - a.roll) * alpha;
      p.v = b.v;
    } else if (!(this.view.ph !== PL_DOCK || this.track.fresh(renderTick)) || !this.track.sample(renderTick - VIEW_DELAY, p)) {
      dockPose(p);
    }
    // винт: у стоянки без пилота стоит, на взлёте раскручивается, в полёте — по скорости
    const want = p.ph === PL_DOCK ? 0 : Math.min(1, 0.5 + p.v / (PLANE_FAST * 1.1));
    this.prop += (want - this.prop) * (1 - Math.exp(-dt * (want > this.prop ? 1.2 : 2)));
    const docked = p.ph === PL_DOCK;
    this.model.update(p.x, p.y, p.z, p.yaw, p.pitch, p.roll, this.prop, docked, !this.mine && !docked && this.view.nick !== '', dt, this.time, camPos, this.mine);
    this.sounds(dt);
    this.signUpdate();
    this.hudUpdate();
  }

  private sounds(dt: number): void {
    const { sound } = this.d;
    const p = this.pose;
    const level = this.prop;
    const want = level > 0.03 ? (this.mine ? ENGINE_MINE : ENGINE_ID) : 0;
    if (this.engine !== want && this.engine) sound.engineStop(this.engine);
    this.engine = want;
    if (want === ENGINE_MINE) sound.engine(ENGINE_MINE, null, 4 + p.v * 0.2, false, 0, 0.025 + level * 0.05);
    else if (want === ENGINE_ID) sound.engine(ENGINE_ID, [p.x, p.y, p.z], 4 + p.v * 0.2, false, 0, level * 0.6);
    // ветер — только своему пилоту, в воздухе
    if (this.mine && p.y > PLANE_FLOAT_Y + 3) {
      this.windT -= dt;
      if (this.windT <= 0) {
        this.windT = 1.0 + Math.random() * 0.6;
        sound.planeWind(Math.min(1, p.v / PLANE_FAST));
      }
    }
  }

  /** Сколько тиков до возвращения самолёта (по виду с сервера) */
  private eta(): number {
    const v = this.view;
    return Math.max(0, v.k + v.eta - this.renderTick);
  }

  private signUpdate(): void {
    const v = this.view;
    let line: string;
    let color: string;
    if (v.ph !== PL_DOCK) {
      line = v.nick ? `В полёте: ${v.nick} · вернётся через ${soon(this.eta())}` : v.b ? `Катает баннер ${v.bn} · вернётся через ${soon(this.eta())}`
        : `Летит домой · будет через ${soon(this.eta())}`;
      color = '#9fd6ff';
    } else if (v.hold) {
      line = `Ждёт ${v.hold} по очереди · ${Math.max(1, Math.ceil((v.hu - this.renderTick) / TICK_RATE))} с`;
      color = '#ffd35c';
    } else {
      line = 'Свободен — подойди и нажми E';
      color = '#8ff0a4';
    }
    const q = v.q.map((n, i) => (v.qb?.[i] ? `${n} (баннер)` : n));
    this.sign.update(line, color, q.length ? `В очереди: ${q.length} · ${q.slice(0, 3).join(', ')}${q.length > 3 ? '…' : ''}` : '');
    if (this.panel.isOpen && !this.flying) this.panel.setNote(this.bannerNote());
  }

  private hudUpdate(): void {
    const show = this.flying && this.pred.ready;
    this.hud.hidden = !show;
    if (!show) return;
    const s = this.pred.state;
    const p = this.pose;
    const asking = performance.now() < this.askUntil;
    let title: string;
    let help: string;
    if (s.ph === PL_START) {
      title = 'Взлёт';
      help = s.v < 1 ? 'Заводим мотор…' : 'Разбег по воде — сейчас оторвёмся';
    } else if (s.ph === PL_FLY) {
      title = `Полёт · осталось <b>${clock(PLANE_FLY_TICKS - s.t)}</b>`;
      help = asking ? 'Нажми E ещё раз — летим домой и садимся' : TOUCH ? 'Палец — куда лететь · «Сесть сейчас» — домой' : 'Мышь — куда лететь · Shift — быстрее · S — медленнее · колесо — камера · E — сесть';
    } else if (s.ph === PL_HOME) {
      title = 'Автопилот: летим домой';
      help = TOUCH ? 'Пальцем — осмотреться' : 'Мышь — осмотреться · колесо — камера';
    } else {
      title = 'Посадка на воду';
      help = TOUCH ? 'Пальцем — осмотреться' : 'Мышь — осмотреться · колесо — камера';
    }
    const sub = `высота ${Math.max(0, Math.round(p.y - PLANE_FLOAT_Y))} м · ${Math.round(p.v * 3.6)} км/ч`;
    const key = `${title}|${help}|${sub}|${asking}|${s.ph}|${this.view.b}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    this.hudTitle.innerHTML = `✈ «Стриж» · ${title}`;
    this.hudSub.textContent = sub;
    this.hudHelp.textContent = help;
    this.hudHelp.classList.toggle('pl-ask', asking);
    this.hudLand.hidden = s.ph !== PL_FLY;
    this.hudLand.textContent = asking ? 'Точно сесть?' : 'Сесть сейчас';
    this.hudBanner.hidden = (s.ph !== PL_START && s.ph !== PL_FLY) || !!this.view.b;
  }

  /** E в полёте: первый раз — спросить, второй (в течение 3 с) — домой. */
  private askLand(): void {
    if (!this.flying || this.pred.state.ph !== PL_FLY || this.pred.landAt !== Infinity) return;
    const now = performance.now();
    if (now >= this.askUntil) {
      this.askUntil = now + ASK_MS;
      return;
    }
    this.askUntil = 0;
    const at = this.lastSeq + 1;
    this.pred.landAt = at;
    this.d.send({ t: 'plane', a: 'land', at });
  }

  /** Клавиши пилота: E — «сесть сейчас», Ctrl — медленнее (как S). true — съели. */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (!this.flying) return false;
    if (code === 'ControlLeft' || code === 'ControlRight') {
      if (!e.repeat) this.d.input.tap('KeyS', down);
      return true;
    }
    if (down && !e.repeat && code === 'KeyE') {
      this.askLand();
      return true;
    }
    if (code === 'KeyB') {
      if (down && !e.repeat) this.openBanner();
      return true;
    }
    return false;
  }

  /**
   * Камера пилота: сзади и чуть сверху, по курсу (в повороте чуть заглядывает в его сторону), плавно; на автопилоте
   * мышью можно осмотреться. Влетает из обычной камеры за 0,8 с. false — не пилот, камера обычная.
   */
  camera(cam: THREE.PerspectiveCamera, dt: number, fov: number): boolean {
    if (!this.flying || !this.pred.ready) {
      this.camOn = false;
      this.aim.hidden = true;
      return false;
    }
    const p = this.pose;
    const inp = this.d.input;
    const s = this.pred.state;
    const look = s.ph === PL_FLY ? wrapAngle(inp.yaw - p.yaw) * 0.3 : s.ph === PL_START ? 0 : wrapAngle(inp.yaw - p.yaw);
    const lookPitch = s.ph === PL_HOME || s.ph === PL_LAND ? inp.pitch * 0.8 : 0;
    if (!this.camOn) {
      this.camOn = true;
      this.camT = 0;
      this.camYaw = p.yaw;
      this.camPitch = 0;
      this.camFrom.copy(cam.position);
    }
    const k = 1 - Math.exp(-dt * 3.2);
    this.camYaw += wrapAngle(p.yaw + look - this.camYaw) * k;
    this.camPitch += (p.pitch * 0.6 + lookPitch - this.camPitch) * k;
    const cp = Math.max(-0.8, Math.min(0.6, this.camPitch));
    const fx = -Math.sin(this.camYaw) * Math.cos(cp);
    const fz = -Math.cos(this.camYaw) * Math.cos(cp);
    const fy = Math.sin(cp);
    const dist = this.view.b ? Math.min(this.zoom, CAM_MAX_BANNER) : this.zoom;
    _v.set(p.x - fx * dist, p.y - fy * dist + 1.7 + dist * 0.17, p.z - fz * dist);
    if (_v.y < PLANE_FLOAT_Y + 1.2) _v.y = PLANE_FLOAT_Y + 1.2;
    this.camLook.set(p.x + fx * 10, p.y + fy * 10 + 0.9, p.z + fz * 10);
    // влёт из обычной камеры
    this.camT = Math.min(1, this.camT + dt / 0.8);
    const b = this.camT * this.camT * (3 - 2 * this.camT);
    if (b < 1) _v.lerpVectors(this.camFrom, _v, b);
    cam.position.copy(_v);
    cam.lookAt(this.camLook);
    const wantFov = fov + Math.max(0, (p.v - 18) / (PLANE_FAST - 18)) * 7;
    if (Math.abs(cam.fov - wantFov) > 0.05) {
      cam.fov += (wantFov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }
    this.placeAim(cam);
    return true;
  }

  /** Кружок «куда летим» — точка в 60 м по цели мыши */
  private placeAim(cam: THREE.PerspectiveCamera): void {
    const s = this.pred.state;
    if (s.ph !== PL_FLY || TOUCH) {
      this.aim.hidden = true;
      return;
    }
    const inp = this.d.input;
    const p = this.pose;
    _v.set(p.x - Math.sin(inp.yaw) * Math.cos(inp.pitch) * 60, p.y + Math.sin(inp.pitch) * 60 + 0.9, p.z - Math.cos(inp.yaw) * Math.cos(inp.pitch) * 60);
    cam.updateMatrixWorld();
    _v.project(cam);
    if (_v.z > 1 || Math.abs(_v.x) > 1.2 || Math.abs(_v.y) > 1.2) {
      this.aim.hidden = true;
      return;
    }
    const r = this.hud.getBoundingClientRect();
    this.aim.hidden = false;
    this.aim.style.left = `${((_v.x + 1) / 2) * r.width}px`;
    this.aim.style.top = `${((1 - _v.y) / 2) * r.height}px`;
  }

  /** Желейка пилота на набережной не видна — она в кабине (рисует модель самолёта). */
  avatarPose(slot: number, piloting: boolean, pose: AvatarPose | null): AvatarPose | null {
    if (!this.enabled || !pose) return pose;
    return piloting || (slot > 0 && slot === this.view.slot && this.view.ph !== PL_DOCK) ? null : pose;
  }

  /** Подсказка у самолёта: [клавиши, текст] */
  hint(): [string[], string] {
    const v = this.view;
    const me = this.d.me();
    if (v.ph === PL_DOCK) {
      if (v.hold && v.hold !== me.nick) return [['E'], `в очередь · самолёт ждёт ${v.hold}`];
      return [['E'], `полёт над городом — ${PLANE_PRICE} 🪙 · 3 минуты${me.tokens < PLANE_PRICE ? ` (у тебя ${me.tokens})` : ''}`];
    }
    const i = v.q.findIndex((n, j) => n === me.nick && !v.qb?.[j]);
    if (i >= 0) return [[], `Ты ${i + 1}-й в очереди на самолёт · он вернётся через ${soon(this.eta())}`];
    return [['E'], `в очередь на самолёт · сейчас ${v.nick ? `летит ${v.nick}` : v.b ? `катает баннер ${v.bn}` : 'летит домой'}, вернётся через ${soon(this.eta())}`];
  }

  /** Подсказка у таблички: заказать баннер */
  bannerHint(): [string[], string] {
    const v = this.view;
    const me = this.d.me();
    if (v.q.some((n, j) => n === me.nick && v.qb?.[j])) return [[], 'Твой баннер в очереди — взлетит, когда небо освободится'];
    return [['E'], `баннер с надписью над набережной — ${BANNER_PRICE} 🪙${me.tokens < BANNER_PRICE ? ` (у тебя ${me.tokens})` : ''}`];
  }

  debug(): object {
    const s = this.pred.state;
    return {
      enabled: this.enabled, mine: this.mine, flying: this.flying, view: this.view, pose: { ...this.pose }, ready: this.pred.ready,
      corrections: this.pred.corrections, state: { ph: s.ph, t: s.t, x: s.x, y: s.y, z: s.z, yaw: s.yaw }, samples: this.track.s.length, zoom: this.zoom,
    };
  }
}

export { PL_HOME, PL_LAND, PL_START };
