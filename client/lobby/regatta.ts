// «Портовая регата» у себя: катера на воде (у всех — по снимкам с плавностью, свой — предсказанием), трасса с табло,
// моторы, брызги и удары; гонщику — камера погони, интерфейс, отсчёт, итоги и «Ещё!». Без мгновенных переносов:
// желейка прыгает из круга сбора в катер дугой и после итогов так же обратно на площадь, камера пролетает за 0,6 с.
// Сцена набережной (scene.ts) зовёт: onJson / onBinary (сеть), tickInput (свой вход), frame, camera, avatarPose.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import { BOAT_RACE_CIRCLE } from '../../shared/maps/lobby.ts';
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import { E_GROUNDED } from '../../shared/protocol.ts';
import {
  MSG_REGATTA, RG_FL_AIR, RG_FL_BOOST, RG_FL_DONE, RG_FL_DRIFT, RG_FL_DRIFT_RIGHT, RG_FL_FLAG, decodeRegatta, emptyRgView, type RgCityBoat,
  type RgDecoded, type RgEntry, type RgRecordRow, type RgView,
} from '../../shared/regatta.ts';
import { RG_HIT_BOAT, RG_HIT_BUOY, RG_HIT_ROPE, RG_MINI1, RG_MINI2, makeRgBoat } from '../../shared/regattaphysics.ts';
import type { Input } from '../../shared/sim.ts';
import type { GatherStatus } from '../../shared/startzones.ts';
import type { Sound } from '../audio.ts';
import type { AvatarPose } from '../render/avatar.ts';
import type { Effects } from '../render/effects.ts';
import { TOUCH } from '../touch.ts';
import type { LobbyCamera } from './camera.ts';
import { BoatModel, HOP_S, hopArc } from './regattaboat.ts';
import { RegattaCourse3D, type RgBoardRow } from './regattacourse3d.ts';
import { RegattaHud, fmtRg, type RgHudRow, type RgResultRow } from './regattahud.ts';
import { RgPredictor } from './regattapredict.ts';
import { BoatWake, type WakeBoat } from './regattawake.ts';

/** Голоса моторов катеров (номер катера + это; лодка в заливе — 9000, «Ласточка» — 9001) */
const ENGINE_ID = 9100;
/** Слышно моторов чужих катеров — ближайших */
const NEAR_ENGINES = 3;
/** Камера погони: за кормой, над водой, куда смотрит (вперёд по курсу) */
const CAM_BACK = 6;
const CAM_UP = 2.2;
const CAM_LOOK = 8;
/** Табло на арке перерисовываем не чаще */
const BOARD_EVERY = 0.25;
const HELP = 'W — газ · S — тормоз · A/D — руль · Shift или Пробел — занос · R — к воротам';
const TIP = 'Жёлтые флажки — ускорение! Проходи между ними';

export interface RegattaDeps {
  scene: THREE.Scene;
  effects: Effects;
  sound: Sound;
  hudRoot: HTMLElement;
  toast: (text: string, ms?: number) => void;
  send: (msg: ClientMsg) => void;
  /** «Нажать» E (кнопка «Ещё!» на экране) */
  tapUse: () => void;
  low: () => boolean;
}

/** Катер на экране: где, куда носом, скорость, руль, признаки, круг, ворота, место, удары */
interface DrawPose {
  x: number;
  z: number;
  y: number;
  hx: number;
  hz: number;
  speed: number;
  steer: number;
  fl: number;
  lap: number;
  cp: number;
  place: number;
  hits: number;
}

function makePose(): DrawPose {
  return { x: 0, z: 0, y: 0, hx: 1, hz: 0, speed: 0, steer: 0, fl: 0, lap: 1, cp: 0, place: 0, hits: 0 };
}

interface Sample extends DrawPose {
  tick: number;
}

/** Снимки одного катера по тикам сервера: картинка — между двумя соседними (как у желеек). */
class BoatTrack {
  readonly s: Sample[] = [];

  push(tick: number, b: RgCityBoat): void {
    const last = this.s[this.s.length - 1];
    if (last && tick <= last.tick) {
      // сервер перезапустился или тики пошли заново — с начала
      if (tick < last.tick - 600) this.s.length = 0;
      else return;
    }
    this.s.push({ tick, x: b.x, z: b.z, y: b.y, hx: b.hx, hz: b.hz, speed: b.speed, steer: b.steer, fl: b.fl, lap: b.lap, cp: b.cp, place: b.place, hits: b.hits });
    if (this.s.length > 12) this.s.shift();
  }

  sample(t: number, out: DrawPose): boolean {
    const s = this.s;
    if (!s.length) return false;
    let a = s[0];
    let b = a;
    if (t >= s[s.length - 1].tick) a = b = s[s.length - 1];
    else if (t > s[0].tick) {
      for (let i = 0; i < s.length - 1; i++) {
        if (s[i + 1].tick > t) {
          a = s[i];
          b = s[i + 1];
          break;
        }
      }
    }
    let k = b.tick > a.tick ? (t - a.tick) / (b.tick - a.tick) : 0;
    // скачок (R, новый заезд) — без «проезда» между точками
    if (Math.hypot(b.x - a.x, b.z - a.z) > 10) k = k < 0.5 ? 0 : 1;
    const near = k < 0.5 ? a : b;
    out.x = a.x + (b.x - a.x) * k;
    out.z = a.z + (b.z - a.z) * k;
    out.y = a.y + (b.y - a.y) * k;
    let hx = a.hx + (b.hx - a.hx) * k;
    let hz = a.hz + (b.hz - a.hz) * k;
    const l = Math.hypot(hx, hz) || 1;
    hx /= l;
    hz /= l;
    out.hx = hx;
    out.hz = hz;
    out.speed = a.speed + (b.speed - a.speed) * k;
    out.steer = a.steer + (b.steer - a.steer) * k;
    out.fl = near.fl;
    out.lap = near.lap;
    out.cp = near.cp;
    out.place = b.place;
    out.hits = b.hits;
    return true;
  }
}

interface Boat {
  e: RgEntry;
  key: string;
  model: BoatModel;
  pose: DrawPose;
  valid: boolean;
  /** Сколько ударов и какие признаки видели в прошлом кадре (брызги и звук — на новые) */
  hits: number;
  fl: number;
}

interface Spot {
  x: number;
  y: number;
  z: number;
  at: number;
}

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

function identity(e: RgEntry): string {
  return e.bot ? `b${e.id}:${e.nick}` : `p${e.id}:${e.pid}:${e.slot}`;
}

export class RegattaClient {
  readonly course3d: RegattaCourse3D;
  private readonly d: RegattaDeps;
  private readonly hud: RegattaHud;
  private readonly wake: BoatWake;
  private readonly pred = new RgPredictor();
  private readonly dec: RgDecoded = { tick: 0, n: 0, boats: [], self: false, ack: 0, reset: 0, state: makeRgBoat() };
  private view: RgView = emptyRgView();
  /** Круг сбора у пирса (null — регата выключена) */
  queue: GatherStatus | null = null;
  /** Рекорды бухты: лучшие круги */
  top: RgRecordRow[] = [];
  private myId = -1;
  private my: RgEntry | null = null;
  private readonly tracks = new Map<number, BoatTrack>();
  private readonly boats = new Map<number, Boat>();
  private readonly wakeBoats: Array<WakeBoat | null> = [null, null, null, null, null, null];
  /** Желейки по номерам в снимке: где стояли на площади, где сидели в катере, в катере ли сейчас, прыжок на площадь */
  private readonly walk = new Map<number, Spot>();
  private readonly seats = new Map<number, Spot>();
  private readonly racing0 = new Map<number, boolean>();
  private readonly landings = new Map<number, Spot>();
  private readonly hopPose: AvatarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0 };
  private readonly cam = new THREE.Vector3();
  private camReady = false;
  private flying = false;
  private camHx = 1;
  private camHz = 0;
  private shake = 0;
  private kick = 0;
  private time = 0;
  private renderTick = 0;
  /** «Марш!» показан для этого старта; когда (время кадра) — стартёр машет */
  private goStart = 0;
  private goAt = -100;
  private beep = 0;
  private wrongT = 0;
  private boardT = 0;
  private engines = new Set<number>();
  private enginesNext = new Set<number>();
  private finish: { place: number; ticks: number; best: number; record: number; pb: boolean } | null = null;
  private lastStep = 0;

  constructor(d: RegattaDeps) {
    this.d = d;
    this.course3d = new RegattaCourse3D(d.scene);
    this.wake = new BoatWake(d.scene);
    this.hud = new RegattaHud(d.hudRoot);
    this.hud.onAgain = () => d.tapUse();
    this.pred.drive = (t) => this.drive(t);
  }

  /** Своя лодка в заезде (на сетке, в гонке, на итогах) */
  get racing(): boolean {
    return this.my !== null;
  }

  get phase(): RgView['phase'] {
    return this.view.phase;
  }

  /** Гонка идёт для входа с меткой t — как решает сервер (server/lobby/regatta.ts). */
  private drive(t: number): boolean {
    const v = this.view;
    return v.phase !== 'idle' && v.start > 0 && t >= v.start && (v.stop === 0 || t < v.stop);
  }

  setMyId(id: number): void {
    this.myId = id;
    this.syncMine();
  }

  /** Вход на набережную или выход: всё с нуля (трасса остаётся). */
  reset(): void {
    this.view = emptyRgView();
    this.queue = null;
    this.my = null;
    for (const [id, b] of this.boats) this.drop(b, id);
    this.tracks.clear();
    this.walk.clear();
    this.seats.clear();
    this.racing0.clear();
    this.landings.clear();
    this.pred.stop();
    this.hud.show(false);
    this.hud.setResults(null);
    this.enginesOff();
    this.wake.clear();
    this.camReady = false;
    this.finish = null;
  }

  welcome(w: { v: RgView; q: GatherStatus; top: RgRecordRow[] } | null | undefined): void {
    this.queue = w?.q ?? null;
    this.top = w?.top ?? [];
    this.setView(w?.v ?? emptyRgView());
  }

  onJson(msg: ServerMsg): boolean {
    switch (msg.t) {
      case 'rg':
        this.setView(msg.v);
        return true;
      case 'rgQ':
        this.queue = msg.v;
        return true;
      case 'rgTop':
        this.top = msg.top;
        return true;
      case 'rgFin':
        this.onFinish(msg.place, msg.ticks, msg.best, msg.record, msg.pb);
        return true;
    }
    return false;
  }

  /** Двоичное «катера регаты»: true — наше (сцена дальше не разбирает). */
  onBinary(buf: ArrayBuffer): boolean {
    if (buf.byteLength < 1 || new Uint8Array(buf, 0, 1)[0] !== MSG_REGATTA) return false;
    const n = decodeRegatta(buf, this.dec);
    if (n < 0) return true;
    for (let i = 0; i < n; i++) {
      const b = this.dec.boats[i];
      let tr = this.tracks.get(b.id);
      if (!tr) {
        tr = new BoatTrack();
        this.tracks.set(b.id, tr);
      }
      tr.push(this.dec.tick, b);
    }
    if (this.dec.self && this.my) this.pred.accept(this.dec.ack, this.dec.state, this.dec.reset);
    return true;
  }

  private setView(v: RgView): void {
    const prev = this.view;
    this.view = v;
    if (v.start !== prev.start) {
      // новый заезд (и «Ещё!»): следы и снимки старых катеров — прочь
      this.tracks.clear();
      this.wake.clear();
      this.finish = null;
    }
    this.syncBoats();
    this.syncMine();
  }

  private syncMine(): void {
    const was = this.my;
    const v = this.view;
    this.my = v.phase === 'idle' ? null : (v.boats.find((e) => !e.bot && e.slot === this.myId) ?? null);
    if (this.my && !was) {
      this.hud.show(true);
      this.camReady = false;
    } else if (!this.my && was) {
      this.pred.stop();
      this.hud.show(false);
      this.hud.setResults(null);
      this.hud.setCount(null);
      this.finish = null;
    }
  }

  private syncBoats(): void {
    const want = new Set<number>();
    if (this.view.phase !== 'idle') {
      for (const e of this.view.boats) {
        want.add(e.id);
        const key = identity(e);
        let b = this.boats.get(e.id);
        if (b && b.key !== key) {
          this.drop(b, e.id);
          b = undefined;
        }
        if (!b) this.make(e, key);
        else if (b.e.nick !== e.nick || b.e.o !== e.o || b.e.level !== e.level) {
          b.model.outfit(e.o, e.nick, e.level);
          b.e = e;
        } else b.e = e;
      }
    }
    for (const [id, b] of this.boats) if (!want.has(id)) this.drop(b, id);
  }

  private make(e: RgEntry, key: string): void {
    const human = !e.bot;
    const model = new BoatModel(this.d.scene, e.id, human ? e.slot : -100 - e.id, human, e.o, e.nick);
    model.rider.setLevel(e.level);
    const g = this.course3d.course.grid[e.id % this.course3d.course.grid.length];
    const pose = makePose();
    pose.x = g.x;
    pose.z = g.z;
    pose.hx = g.hx;
    pose.hz = g.hz;
    this.boats.set(e.id, { e, key, model, pose, valid: false, hits: -1, fl: 0 });
    if (!human) return;
    // прыжок в катер — из того места, где желейка стояла (только что), иначе — из круга сбора;
    // «Ещё!» (сидел в катере секунду назад) — без прыжка
    const seat = this.seats.get(e.slot);
    if (seat && this.time - seat.at < 3) return;
    const w = this.walk.get(e.slot);
    if (w && this.time - w.at < 1.5) model.hop(w.x, w.y, w.z);
    else model.hop(BOAT_RACE_CIRCLE.x, 0, BOAT_RACE_CIRCLE.z);
  }

  private drop(b: Boat, id: number): void {
    b.model.dispose(this.d.scene);
    this.boats.delete(id);
    this.d.sound.engineStop(ENGINE_ID + id);
    this.engines.delete(id);
  }

  /** Сойти на берег (пауза → «Сойти на берег»). */
  quit(): void {
    if (this.my) this.d.send({ t: 'rg', a: 'quit' });
  }

  /** Клавиши в катере: эмоции, журнал, F — не к месту (движение, E и R идут во вход). */
  onKey(code: string): boolean {
    return /^Digit\d$|^Key[JFQ]$/.test(code);
  }

  // ------------------------------------------------------------ свой вход

  /** Каждый свой вход (60 в секунду): шаг своего катера и отдача — звук, тряска, баннеры. */
  tickInput(inp: Input): void {
    if (!this.my && this.pred.ready) this.pred.stop();
    this.pred.input(inp);
    if (!this.my || !this.pred.ready) return;
    const s = this.pred.state;
    const ev = this.pred.events;
    const { sound, effects } = this.d;
    this.lastStep = this.time;
    if (ev.start === 1) {
      this.hud.flash('Отличный старт!', true, 'ускорение');
      sound.kartBoost(null, 2);
      this.kick = Math.max(this.kick, 0.6);
    } else if (ev.start === -1) this.hud.flash('Мотор захлебнулся!', false, 'газ — на «1», не раньше');
    if (ev.flag >= 0) {
      this.hud.flash('Флажки!', true, 'ускорение');
      sound.whoosh(null);
      sound.kartBoost(null, 3);
      this.kick = 1;
      this.shake = Math.max(this.shake, 0.08);
    }
    if (ev.mini) {
      sound.kartBoost(null, ev.mini);
      this.kick = Math.max(this.kick, ev.mini === 2 ? 0.7 : 0.45);
    }
    if (s.drift === RG_MINI1 || s.drift === RG_MINI2) sound.driftCharge(s.drift === RG_MINI2 ? 2 : 1);
    if (ev.hit > 0) {
      const k = ev.hitKind;
      this.shake = Math.max(this.shake, k === RG_HIT_ROPE ? 0.12 : k === RG_HIT_BUOY ? 0.25 : k === RG_HIT_BOAT ? 0.3 : 0.55);
      sound.kartBump(null, ev.hit * (k === RG_HIT_ROPE ? 0.5 : 1.2));
      if (k !== RG_HIT_ROPE) {
        effects.waterSplash(s.x + s.hx * 2, s.z + s.hz * 2, ev.hit > 6);
        sound.splash(null);
      }
    }
    if (ev.jump) {
      sound.whoosh(null);
      this.kick = Math.max(this.kick, 0.4);
    }
    if (ev.land) {
      effects.waterSplash(s.x, s.z, true);
      sound.splash(null);
      this.shake = Math.max(this.shake, ev.land === 1 ? 0.15 : 0.4);
      this.hud.flash(ev.land === 1 ? 'Чисто!' : 'Боком!', ev.land === 1, ev.land === 1 ? 'ускорение' : '−20 % скорости');
    }
    if (ev.respawn) {
      effects.waterSplash(s.x, s.z, false);
      sound.splash(null);
    }
    if (ev.lap) {
      const last = s.lap >= this.view.laps;
      this.hud.flash(last ? 'Последний круг!' : `Круг ${s.lap}`, last, ev.best ? `лучший: ${fmtRg(ev.lapTicks)}` : fmtRg(ev.lapTicks));
      sound.countBeep(true);
    }
    if (ev.finish) {
      this.hud.flash('Финиш!', true, fmtRg(s.rt));
      sound.fanfare(null);
    }
  }

  private onFinish(place: number, ticks: number, best: number, record: number, pb: boolean): void {
    this.finish = { place, ticks, best, record, pb };
    const sub = record === 0 ? 'рекорд бухты!' : record > 0 ? `${record + 1}-е место на доске бухты` : pb ? 'твой лучший круг!' : fmtRg(ticks);
    this.hud.flash(`Финиш! ${place}-е место`, place === 1, sub);
  }

  // ------------------------------------------------------------ кадр

  /** Позиции катеров (свой — по предсказанию между тиками), модели, след, звук, трасса, табло, интерфейс. */
  frame(dt: number, renderTick: number, alpha: number, camPos: THREE.Vector3): void {
    this.time += dt;
    this.renderTick = renderTick;
    this.pred.decay(dt);
    const v = this.view;
    const { sound } = this.d;
    // «Марш!»: по часам отрисовки (на них же метки входов — катер поедет ровно тогда)
    if (v.phase !== 'idle' && v.start > 0 && v.start !== this.goStart && renderTick >= v.start && renderTick < v.start + 120) {
      this.goStart = v.start;
      this.goAt = this.time;
      if (this.my) {
        sound.countBeep(true);
        sound.horn(0.3);
        this.hud.setCount('Марш!');
      } else if (Math.hypot(camPos.x - this.course3d.course.gates[0].x, camPos.z - this.course3d.course.gates[0].z) < 140) {
        const g = this.course3d.course.gates[0];
        sound.horn(0.45, [g.x, 6, g.z]);
      }
    }
    // катера
    for (const b of this.boats.values()) {
      const p = b.pose;
      const mine = this.my !== null && b.e.id === this.my.id;
      if (mine && this.pred.ready) {
        this.myPose(alpha, p);
        b.valid = true;
      } else {
        const tr = this.tracks.get(b.e.id);
        if (tr && tr.sample(renderTick, p)) b.valid = true;
      }
      const drift = (p.fl & RG_FL_DRIFT) !== 0 ? ((p.fl & RG_FL_DRIFT_RIGHT) !== 0 ? -1 : 1) : 0;
      b.model.update(p.x, p.z, p.y, p.hx, p.hz, p.steer, p.speed, drift, this.time, dt, camPos, mine);
      if (!b.e.bot) this.seats.set(b.e.slot, { x: b.model.seat.x, y: b.model.seat.y, z: b.model.seat.z, at: this.time });
      // чужие: новый удар — брызги и «бум», ускорение от флажков — свист
      if (!mine) this.cityFx(b);
      const w = this.wakeBoats[b.e.id] ?? (this.wakeBoats[b.e.id] = { x: 0, z: 0, y: 0, hx: 1, hz: 0, speed: 0, drift: 0, boost: false });
      w.x = p.x;
      w.z = p.z;
      w.y = p.y;
      w.hx = p.hx;
      w.hz = p.hz;
      w.speed = b.valid ? p.speed : 0;
      w.drift = drift;
      w.boost = (p.fl & RG_FL_BOOST) !== 0;
    }
    for (let k = 0; k < this.wakeBoats.length; k++) if (!this.boats.has(k)) this.wakeBoats[k] = null;
    this.wake.update(this.time, this.wakeBoats, this.d.low());
    this.engineSounds(camPos);
    // трасса: гонщику — следующие ворота и взятые флажки; стартёр машет на «Марш!»
    const s = this.pred.state;
    const racing = this.my !== null && this.pred.ready && !s.done && v.phase !== 'results';
    const next = racing ? (s.cp + 1 < this.course3d.course.gates.length ? s.cp + 1 : 0) : -1;
    const wave = this.goStart === v.start && v.phase !== 'idle' ? this.time - this.goAt : 0;
    const ready = v.phase === 'grid' && renderTick < v.start;
    this.course3d.update(this.time, dt, camPos, next, racing ? s.flags : 0, wave, ready);
    this.boardT -= dt;
    if (this.boardT <= 0) {
      this.boardT = BOARD_EVERY;
      this.board();
    }
    if (this.my) this.updateHud(dt);
  }

  /** Свой катер на экране: между двумя последними шагами и со сдвигом после поправки. */
  private myPose(alpha: number, out: DrawPose): DrawPose {
    const s = this.pred.state;
    const p = this.pred.prev;
    const o = this.pred.offset;
    // R и новый заезд — без «проезда»
    const a = Math.hypot(s.x - p.x, s.z - p.z) > 5 ? 1 : alpha;
    out.x = p.x + (s.x - p.x) * a + o.x;
    out.z = p.z + (s.z - p.z) * a + o.z;
    out.y = p.y + (s.y - p.y) * a;
    let hx = p.hx + (s.hx - p.hx) * a;
    let hz = p.hz + (s.hz - p.hz) * a;
    const l = Math.hypot(hx, hz) || 1;
    hx /= l;
    hz /= l;
    out.hx = hx;
    out.hz = hz;
    out.speed = Math.hypot(s.vx, s.vz);
    out.steer = p.steer + (s.steer - p.steer) * a;
    let fl = 0;
    if (s.boost > 0) fl |= RG_FL_BOOST;
    if (s.boost > 0 && s.boostTop > 22) fl |= RG_FL_FLAG;
    if (s.drift > 0) fl |= RG_FL_DRIFT | (s.driftDir < 0 ? RG_FL_DRIFT_RIGHT : 0);
    if (s.done) fl |= RG_FL_DONE;
    if (s.air) fl |= RG_FL_AIR;
    out.fl = fl;
    out.lap = s.lap;
    out.cp = s.cp;
    const city = this.my ? this.tracks.get(this.my.id)?.s : undefined;
    out.place = city?.length ? city[city.length - 1].place : out.place;
    out.hits = s.hits;
    return out;
  }

  private cityFx(b: Boat): void {
    const p = b.pose;
    if (!b.valid) return;
    if (b.hits >= 0 && p.hits > b.hits) {
      this.d.effects.waterSplash(p.x + p.hx * 2, p.z + p.hz * 2, true);
      this.d.sound.kartBump([p.x, WATER_Y + 0.5, p.z], 8);
    }
    b.hits = p.hits;
    if ((p.fl & RG_FL_FLAG) !== 0 && (b.fl & RG_FL_FLAG) === 0) this.d.sound.whoosh([p.x, WATER_Y + 0.8, p.z]);
    b.fl = p.fl;
  }

  /** Моторы: свой — без объёма, чужие — ближайшие три, в объёме. */
  private engineSounds(camPos: THREE.Vector3): void {
    const { sound } = this.d;
    const next = this.enginesNext;
    next.clear();
    const list: Boat[] = [];
    for (const b of this.boats.values()) {
      if (!b.valid || (b.pose.fl & RG_FL_DONE) !== 0) continue;
      if (this.my && b.e.id === this.my.id) {
        const p = b.pose;
        sound.engine(ENGINE_ID + b.e.id, null, p.speed * 1.4, (p.fl & RG_FL_BOOST) !== 0, 0, 0.3);
        next.add(b.e.id);
      } else list.push(b);
    }
    list.sort((a, b) => dist2(a.pose, camPos) - dist2(b.pose, camPos));
    for (let k = 0; k < Math.min(NEAR_ENGINES, list.length); k++) {
      const p = list[k].pose;
      if (dist2(p, camPos) > 110 * 110) break;
      sound.engine(ENGINE_ID + list[k].e.id, [p.x, WATER_Y + 0.6, p.z], p.speed * 1.4, (p.fl & RG_FL_BOOST) !== 0, 0, 0.2);
      next.add(list[k].e.id);
    }
    for (const id of this.engines) if (!next.has(id)) sound.engineStop(ENGINE_ID + id);
    this.enginesNext = this.engines;
    this.engines = next;
  }

  private enginesOff(): void {
    for (const id of this.engines) this.d.sound.engineStop(ENGINE_ID + id);
    this.engines.clear();
  }

  // ------------------------------------------------------------ камера и желейки

  /** Камера погони за своим катером. false — не в катере (камера набережной). */
  camera(cam: THREE.PerspectiveCamera, lc: LobbyCamera, dt: number, fovBase: number): boolean {
    const b = this.my ? this.boats.get(this.my.id) : undefined;
    if (!b) {
      this.camReady = false;
      return false;
    }
    const p = b.pose;
    const drifting = (p.fl & RG_FL_DRIFT) !== 0;
    if (!this.camReady) {
      this.camHx = p.hx;
      this.camHz = p.hz;
    } else {
      // курс камеры отстаёт от катера: в повороте виден борт, в заносе — сильнее
      const k = 1 - Math.exp(-dt * (drifting ? 2.6 : 4.5));
      this.camHx += (p.hx - this.camHx) * k;
      this.camHz += (p.hz - this.camHz) * k;
      const l = Math.hypot(this.camHx, this.camHz) || 1;
      this.camHx /= l;
      this.camHz /= l;
    }
    const back = CAM_BACK + p.speed * 0.05;
    _t.set(p.x - this.camHx * back, WATER_Y + CAM_UP + p.y * 0.7, p.z - this.camHz * back);
    if (!this.camReady) {
      this.cam.copy(_t);
      this.camReady = true;
      this.flying = false;
    } else if (this.flying || this.cam.distanceTo(_t) > 12) {
      // катер перенесло (R, «Ещё!») — камера долетает за полсекунды
      this.flying = true;
      this.cam.lerp(_t, 1 - Math.exp(-dt * 7));
      if (this.cam.distanceTo(_t) < 0.3) this.flying = false;
    } else this.cam.copy(_t);
    const sh = this.shake;
    this.shake *= Math.exp(-dt * 7);
    this.kick *= Math.exp(-dt * 2.2);
    const fov = fovBase + Math.min(12, p.speed * 0.55) + this.kick * 8;
    cam.up.set(0, 1, 0);
    lc.chase(cam, dt, this.cam.x + (Math.random() - 0.5) * sh, this.cam.y + (Math.random() - 0.5) * sh, this.cam.z + (Math.random() - 0.5) * sh,
      p.x + this.camHx * CAM_LOOK, WATER_Y + 0.9 + p.y * 0.6, p.z + this.camHz * CAM_LOOK, fov);
    return true;
  }

  /**
   * Желейка игрока slot на площади: в катере — не видна (её рисует катер); только что сошла — летит дугой из катера
   * на своё место (0,6 с). Остальное — как есть.
   */
  avatarPose(slot: number, racing: boolean, pose: AvatarPose | null): AvatarPose | null {
    const was = this.racing0.get(slot) ?? false;
    if (racing !== was) {
      this.racing0.set(slot, racing);
      if (!racing) {
        const s = this.seats.get(slot);
        if (s && this.time - s.at < 2) this.landings.set(slot, { x: s.x, y: s.y, z: s.z, at: this.time });
      }
    }
    if (racing || !pose) return null;
    this.walk.set(slot, { x: pose.x, y: pose.y, z: pose.z, at: this.time });
    const l = this.landings.get(slot);
    if (!l) return pose;
    const k = (this.time - l.at) / HOP_S;
    if (k >= 1) {
      this.landings.delete(slot);
      return pose;
    }
    hopArc(l.x, l.y, l.z, pose.x, pose.y, pose.z, Math.max(0, k), _v);
    const h = this.hopPose;
    h.x = _v.x;
    h.y = _v.y;
    h.z = _v.z;
    h.yaw = pose.yaw;
    h.pitch = pose.pitch;
    h.flags = pose.flags & ~E_GROUNDED;
    return h;
  }

  // ------------------------------------------------------------ табло и интерфейс

  private board(): void {
    const v = this.view;
    const rows: RgBoardRow[] = [];
    let phase = '';
    let foot = '';
    const rec = this.top[0];
    if (v.phase === 'idle') {
      this.top.slice(0, 5).forEach((r, k) => rows.push({ place: String(k + 1), nick: r.nick, info: fmtMs(r.ms), me: false, medal: k + 1 <= 3 ? k + 1 : 0 }));
      phase = 'РЕКОРДЫ';
      const q = this.queue;
      foot = q && q.phase === 'count' ? `Старт через ${Math.max(1, Math.ceil(q.left))} с · в круге у пирса: ${q.n}` : rows.length ? 'Круг сбора у пирса · 1–6 игроков' : 'Рекордов ещё нет — встань в круг у пирса!';
    } else if (v.phase === 'grid') {
      const left = Math.ceil((v.start - this.renderTick) / 60);
      phase = left > 0 ? `СТАРТ ЧЕРЕЗ ${left}` : 'МАРШ!';
      for (const e of v.boats) rows.push({ place: String(e.id + 1), nick: e.nick, info: e.bot ? 'бот' : '', me: e.slot === this.myId && !e.bot, medal: 0 });
      foot = rec ? `Рекорд бухты: ${rec.nick} — ${fmtMs(rec.ms)}` : 'Три круга по бухте';
    } else if (v.phase === 'race') {
      const list = [...this.boats.values()].filter((b) => b.valid).sort((a, b) => (a.pose.place || 99) - (b.pose.place || 99));
      const lead = list[0]?.pose.lap ?? 1;
      phase = `КРУГ ${Math.min(lead, v.laps)}/${v.laps}`;
      for (const b of list) {
        const done = (b.pose.fl & RG_FL_DONE) !== 0;
        rows.push({ place: String(b.pose.place || '—'), nick: b.e.nick, info: done ? 'финиш' : `${Math.min(b.pose.lap, v.laps)}/${v.laps}`, me: !b.e.bot && b.e.slot === this.myId, medal: b.pose.place <= 3 ? b.pose.place : 0 });
      }
      foot = rec ? `Рекорд бухты: ${rec.nick} — ${fmtMs(rec.ms)}` : '';
    } else {
      phase = 'ИТОГИ';
      for (const r of v.rows) {
        const info = r.finished ? fmtRg(r.ticks) : r.left ? 'сошёл' : 'не доплыл';
        const me = this.my !== null && !r.bot && !r.left && r.id === this.my.id;
        rows.push({ place: r.pos ? String(r.pos) : '—', nick: r.nick, info, me, medal: r.pos > 0 && r.pos <= 3 ? r.pos : 0 });
      }
      foot = rec ? `Рекорд бухты: ${rec.nick} — ${fmtMs(rec.ms)}` : '';
    }
    this.course3d.setBoard({ title: 'ПОРТОВАЯ РЕГАТА', phase, rows, foot });
  }

  private updateHud(dt: number): void {
    const v = this.view;
    const my = this.my!;
    const hud = this.hud;
    const s = this.pred.state;
    const b = this.boats.get(my.id);
    const before = v.phase === 'grid' && this.renderTick < v.start;
    // отсчёт: 3, 2, 1 — с писком; «Марш!» ставит frame
    if (before) {
      const left = Math.ceil((v.start - this.renderTick) / 60);
      if (left <= 3 && left >= 1) {
        hud.setCount(String(left));
        if (left !== this.beep) this.d.sound.countBeep(false);
      } else hud.setCount(null);
      this.beep = left;
    } else if (this.time - this.goAt > 1.4) hud.setCount(null);
    const total = v.boats.length;
    hud.setStand(b?.pose.place ?? 0, total, s.lap, v.laps, s.rt, s.best, (b?.pose.speed ?? 0) * 3.6, !!s.done);
    const rows: RgHudRow[] = [...this.boats.values()]
      .filter((x) => x.valid)
      .sort((a, c) => (a.pose.place || 99) - (c.pose.place || 99))
      .map((x) => ({
        place: x.pose.place, nick: x.e.nick, me: x.e.id === my.id, bot: x.e.bot,
        info: (x.pose.fl & RG_FL_DONE) !== 0 ? 'финиш' : `${Math.min(x.pose.lap, v.laps)}/${v.laps}`,
      }));
    hud.setRows(rows);
    const early = before || (v.phase === 'race' && s.lap === 1 && this.time - this.goAt < 14);
    hud.setTip(early ? TIP : null);
    hud.setHelp(!TOUCH && (before || (v.phase === 'race' && s.lap === 1 && !s.done)) ? HELP : null);
    // «Не туда!»: нос против хода трассы на ходу больше секунды
    const tr = this.course3d.course.track;
    const seg = Math.max(0, Math.min(tr.n - 1, s.seg));
    const along = s.hx * tr.tx[seg] + s.hz * tr.tz[seg];
    const moving = s.vx * tr.tx[seg] + s.vz * tr.tz[seg];
    if (v.phase === 'race' && !s.done && along < -0.4 && moving < -1) this.wrongT += dt;
    else this.wrongT = 0;
    hud.setWrong(this.wrongT > 1);
    // итоги
    if (v.phase === 'results') {
      const voted = v.again.includes(my.id);
      const rows2: RgResultRow[] = v.rows.map((r) => ({
        place: r.pos ? String(r.pos) : '—', nick: r.nick + (r.bot ? ' 🤖' : ''), time: r.finished ? fmtRg(r.ticks) : r.left ? 'сошёл' : '—',
        best: r.best > 0 ? fmtRg(r.best) : '—', me: r.id === my.id && !r.left, dim: !r.finished, again: v.again.includes(r.id) && !r.left,
      }));
      const mine = v.rows.find((r) => r.id === my.id && !r.left);
      const place = mine?.pos ?? 0;
      const title = place === 1 ? 'Победа!' : place > 0 ? `${place}-е место` : 'Регата окончена';
      const subParts: string[] = [];
      if (mine && mine.reward > 0) subParts.push(`+${mine.reward} 🪙`);
      if (this.finish?.record === 0) subParts.push('рекорд бухты!');
      else if (this.finish?.pb) subParts.push('твой лучший круг!');
      const secs = (t: number) => Math.max(0, Math.ceil((t - this.renderTick) / 60));
      const foot = voted ? `Ты в деле! Новый заезд через ${secs(v.rematch)} с` : v.rematch > 0 ? `Кто нажал «Ещё!» — снова на старте через ${secs(v.rematch)} с · остальные — на площадь`
        : `На площадь через ${secs(v.end)} с`;
      hud.setResults({ title, win: place === 1, sub: subParts.join(' · '), rows: rows2, foot, canAgain: !voted });
    } else {
      hud.setResults(null);
    }
  }

  debug(): Record<string, unknown> {
    const s = this.pred.state;
    return {
      phase: this.view.phase, start: this.view.start, stop: this.view.stop, boats: this.boats.size, racing: this.racing, myBoat: this.my?.id ?? -1,
      pred: { ready: this.pred.ready, corrections: this.pred.corrections, lap: s.lap, cp: s.cp, rt: s.rt, x: s.x, z: s.z, speed: Math.hypot(s.vx, s.vz), done: s.done, flags: s.flags },
      engines: [...this.engines], queue: this.queue, top: this.top.length, course: this.course3d.debug(), lastStep: this.lastStep,
    };
  }
}

function dist2(p: { x: number; z: number }, c: THREE.Vector3): number {
  return (p.x - c.x) * (p.x - c.x) + (p.z - c.z) * (p.z - c.z);
}

/** Мс → «0:41.20» */
function fmtMs(ms: number): string {
  return fmtRg((ms * 60) / 1000);
}
