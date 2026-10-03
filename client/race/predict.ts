// Предсказание своего карта: шаг физики считаем сразу по нажатию, а когда приходит снимок — сверяем с сервером.
// Расхождение (ящик, банка, толчок, старт на тик раньше) — откат к серверу и переигровка неподтверждённых
// тиков, а визуальная разница гаснет плавно. Устроено как Predictor у желеек, только физика — карта.
import { copyKart, kartsEqual, makeKartEvents, makeKartState, stepKart, type KartEvents, type KartState } from '../../shared/kart.ts';
import { makeInput, type Input } from '../../shared/sim.ts';
import type { Track } from '../../shared/track.ts';

const RING = 256;
/** Сдвиг больше стольких метров — без сглаживания (возврат на трассу, решётка) */
const SNAP_DIST = 2;

interface Entry {
  seq: number;
  buttons: number;
  /** Можно ли было ехать (фаза гонки) — так же при переигровке */
  canDrive: boolean;
  after: KartState;
}

export class KartPredictor {
  readonly state: KartState = makeKartState();
  readonly prev: KartState = makeKartState();
  /** Визуальная поправка после расхождения (затухает) */
  readonly offset = { x: 0, y: 0, z: 0 };
  readonly events: KartEvents = makeKartEvents();
  corrections = 0;
  private readonly replayEvents: KartEvents = makeKartEvents();
  private readonly before: KartState = makeKartState();
  private readonly ring: Entry[] = [];
  private readonly input: Input = makeInput();
  private newest = -1;
  private readonly tr: Track;

  constructor(tr: Track) {
    this.tr = tr;
    for (let i = 0; i < RING; i++) this.ring.push({ seq: -1, buttons: 0, canDrive: false, after: makeKartState() });
  }

  /** Жёстко встать в состояние сервера (старт, SNAP_SELF_RESET) и переиграть то, что он ещё не видел. */
  reset(server: KartState, ack: number): void {
    copyKart(this.state, server);
    this.offset.x = 0;
    this.offset.y = 0;
    this.offset.z = 0;
    for (const e of this.ring) if (e.seq <= ack) e.seq = -1;
    this.replayFrom(ack);
    copyKart(this.prev, this.state);
  }

  /** Тик предсказания. Возвращает события (занос, мини-турбо, стена, круг…). */
  step(inp: Input, canDrive: boolean): KartEvents {
    copyKart(this.prev, this.state);
    stepKart(this.state, inp, this.tr, this.events, canDrive);
    const e = this.ring[inp.seq % RING];
    e.seq = inp.seq;
    e.buttons = inp.buttons;
    e.canDrive = canDrive;
    copyKart(e.after, this.state);
    this.newest = inp.seq;
    return this.events;
  }

  /** Сверка: server — состояние после входа ack. true — пришлось поправляться. */
  reconcile(ack: number, server: KartState): boolean {
    const e = this.ring[ack % RING];
    if (e.seq !== ack) {
      // такого входа нет в истории (ещё ничего не подтверждено или очень старый) — встаём как сервер
      if (ack > this.newest) return false;
      return this.hardSet(server, ack);
    }
    if (kartsEqual(e.after, server)) return false;
    this.corrections++;
    const bx = this.state.x;
    const by = this.state.y;
    const bz = this.state.z;
    copyKart(e.after, server);
    copyKart(this.state, server);
    this.replayFrom(ack);
    const sx = this.state.x - bx;
    const sy = this.state.y - by;
    const sz = this.state.z - bz;
    if (sx * sx + sy * sy + sz * sz > SNAP_DIST * SNAP_DIST) {
      this.offset.x = this.offset.y = this.offset.z = 0;
      copyKart(this.prev, this.state);
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

  /** Встать как сервер и переиграть то, что осталось в истории. true — что-то поменялось. */
  private hardSet(server: KartState, ack: number): boolean {
    const b = copyKart(this.before, this.state);
    copyKart(this.state, server);
    this.replayFrom(ack);
    const dx = this.state.x - b.x;
    const dy = this.state.y - b.y;
    const dz = this.state.z - b.z;
    if (dx * dx + dy * dy + dz * dz > SNAP_DIST * SNAP_DIST) {
      this.offset.x = this.offset.y = this.offset.z = 0;
      copyKart(this.prev, this.state);
    }
    return !kartsEqual(b, this.state);
  }

  private replayFrom(ack: number): void {
    const inp = this.input;
    for (let seq = ack + 1; seq <= this.newest; seq++) {
      const e = this.ring[seq % RING];
      if (e.seq !== seq) continue;
      inp.seq = seq;
      inp.buttons = e.buttons;
      stepKart(this.state, inp, this.tr, this.replayEvents, e.canDrive);
      copyKart(e.after, this.state);
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
