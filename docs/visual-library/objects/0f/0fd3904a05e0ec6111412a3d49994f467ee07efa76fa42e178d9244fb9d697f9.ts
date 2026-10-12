// Предсказание своего игрока: считаем движение сразу, а когда приходит
// подтверждение сервера — сверяем; при расхождении откатываемся и переигрываем
// неподтверждённые тики, а визуальную разницу плавно «растворяем».
// На набережной есть «сидение» (место, автомат): маска hold — та же, что на сервере (shared/lobby.ts), и препятствия
// аквапарка вокруг шага (StepHook — shared/aquadyn.ts): их время — метка самого входа, поэтому и при переигровке оно то же.
import { stepHeld } from '../shared/lobby.ts';
import { makeEvents, makeState, copyState, statesEqual, type Input, type PlayerState, type StepEvents } from '../shared/sim.ts';
import type { CollisionWorld } from '../shared/world.ts';

const RING = 256;

/** Что делать вокруг шага входа inp (набережная: препятствия аквапарка). prev — метка времени прошлого входа (NaN — неизвестна). */
export interface StepHook {
  before(s: PlayerState, inp: Input, prevViewTick: number): Input | void;
  after(s: PlayerState, inp: Input, ev: StepEvents): void;
}

interface Entry {
  seq: number;
  input: Input;
  canFire: boolean;
  /** Маска «сидения» после этого входа */
  hold: number;
  after: PlayerState;
}

export class Predictor {
  readonly state: PlayerState = makeState();
  readonly prev: PlayerState = makeState();
  /** Визуальная поправка после расхождения (затухает) */
  readonly offset = { x: 0, y: 0, z: 0 };
  readonly events: StepEvents = makeEvents();
  private readonly replayEvents: StepEvents = makeEvents();
  private readonly ring: Entry[] = [];
  private newest = -1;
  seed = 0;
  corrections = 0;
  /** Сидит (маска клавиш, которыми встают) или 0 */
  hold = 0;
  private readonly world: CollisionWorld;
  private readonly hook: StepHook | null;

  constructor(world: CollisionWorld, hook: StepHook | null = null) {
    this.world = world;
    this.hook = hook;
    for (let i = 0; i < RING; i++) {
      this.ring.push({ seq: -1, input: { seq: 0, buttons: 0, yaw: 0, pitch: 0, viewTick: 0 }, canFire: false, hold: 0, after: makeState() });
    }
  }

  /** Жёстко встать в состояние сервера (спавн, телепорт, сел). hold — маска «сидения» по серверу. */
  reset(server: PlayerState, ack: number, hold = 0): void {
    copyState(this.state, server);
    copyState(this.prev, server);
    this.hold = hold;
    this.offset.x = 0;
    this.offset.y = 0;
    this.offset.z = 0;
    // метка времени входа ack нужна первому переигранному шагу (препятствия едут от неё)
    const base = this.ring[ack % RING];
    const baseVt = ack >= 0 && base.seq === ack ? base.input.viewTick : NaN;
    for (const e of this.ring) if (e.seq <= ack) e.seq = -1;
    // неподтверждённые входы переигрываем от нового состояния
    this.replayFrom(ack, baseVt);
    copyState(this.prev, this.state);
  }

  /** Тик предсказания. Возвращает события (прыжок, выстрел…). */
  step(inp: Input, canFire: boolean): StepEvents {
    copyState(this.prev, this.state);
    this.advance(this.state, inp, canFire, this.viewTickOf(inp.seq - 1), this.events);
    this.store(inp, canFire, this.state);
    return this.events;
  }

  /** Один шаг входа: hold, препятствия вокруг (если есть), сама физика. */
  private advance(s: PlayerState, inp: Input, canFire: boolean, prevVt: number, ev: StepEvents): void {
    const stepInput = this.hook?.before(s, inp, prevVt) ?? inp;
    this.hold = stepHeld(s, this.hold, stepInput, this.world, canFire, this.seed, ev);
    this.hook?.after(s, stepInput, ev);
  }

  /** Метка времени входа seq, пока он в истории (NaN — нет). */
  private viewTickOf(seq: number): number {
    const e = this.ring[((seq % RING) + RING) % RING];
    return seq >= 0 && e.seq === seq ? e.input.viewTick : NaN;
  }

  /** Номер последнего предсказанного входа */
  get newestSeq(): number {
    return this.newest;
  }

  /** Что было после входа seq, пока он в истории: состояние и «сидение» (мячу — пересчитать свои тики). */
  at(seq: number): { readonly after: PlayerState; readonly hold: number } | null {
    const e = this.ring[seq % RING];
    return seq >= 0 && e.seq === seq ? e : null;
  }

  /** Записать вход без симуляции (пока мёртв) — чтобы номера не рвались. */
  record(inp: Input, canFire: boolean): void {
    this.store(inp, canFire, this.state);
  }

  private store(inp: Input, canFire: boolean, after: PlayerState): void {
    const e = this.ring[inp.seq % RING];
    e.seq = inp.seq;
    e.input.seq = inp.seq;
    e.input.buttons = inp.buttons;
    e.input.yaw = inp.yaw;
    e.input.pitch = inp.pitch;
    e.input.viewTick = inp.viewTick;
    e.canFire = canFire;
    e.hold = this.hold;
    copyState(e.after, after);
    this.newest = inp.seq;
  }

  /**
   * Сверка с сервером: server — состояние после входа ack, hold — маска «сидения» по серверу.
   * Возвращает true, если пришлось поправляться.
   */
  reconcile(ack: number, server: PlayerState, hold = 0): boolean {
    const e = this.ring[ack % RING];
    if (e.seq !== ack) {
      // такого входа уже нет в истории (очень старый) — просто встаём как сервер
      if (ack > this.newest) return false;
      this.hardSet(server, ack, hold);
      return true;
    }
    if (e.hold === hold && statesEqual(e.after, server)) return false;
    this.corrections++;
    const bx = this.state.x;
    const by = this.state.y;
    const bz = this.state.z;
    copyState(e.after, server);
    e.hold = hold;
    copyState(this.state, server);
    this.hold = hold;
    this.replayFrom(ack, e.input.viewTick);
    const sx = this.state.x - bx;
    const sy = this.state.y - by;
    const sz = this.state.z - bz;
    if (sx * sx + sy * sy + sz * sz > 4) {
      // улетели далеко (респаун/телепорт) — без сглаживания
      this.offset.x = this.offset.y = this.offset.z = 0;
      copyState(this.prev, this.state);
    } else {
      this.prev.x += sx;
      this.prev.y += sy;
      this.prev.z += sz;
      this.offset.x -= sx;
      this.offset.y -= sy;
      this.offset.z -= sz;
    }
    return true;
  }

  private hardSet(server: PlayerState, ack: number, hold: number): void {
    const bx = this.state.x;
    const by = this.state.y;
    const bz = this.state.z;
    copyState(this.state, server);
    this.hold = hold;
    this.replayFrom(ack, NaN);
    const d = Math.hypot(this.state.x - bx, this.state.y - by, this.state.z - bz);
    if (d > 2) copyState(this.prev, this.state);
  }

  /** Переиграть входы после ack; prevVt — метка времени входа ack (NaN — неизвестна). */
  private replayFrom(ack: number, prevVt: number): void {
    for (let seq = ack + 1; seq <= this.newest; seq++) {
      const e = this.ring[seq % RING];
      if (e.seq !== seq) continue;
      this.advance(this.state, e.input, e.canFire, prevVt, this.replayEvents);
      prevVt = e.input.viewTick;
      e.hold = this.hold;
      copyState(e.after, this.state);
    }
  }

  /** Плавно гасим визуальную поправку. */
  decay(dt: number): void {
    const k = Math.exp(-dt * 14);
    this.offset.x *= k;
    this.offset.y *= k;
    this.offset.z *= k;
  }
}
