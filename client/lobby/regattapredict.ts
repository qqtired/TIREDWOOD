// Предсказание своего катера регаты: тот же шаг, что на сервере (shared/regattaphysics.ts), на каждом своём входе.
// Входы (кнопки и метка времени) помним всегда — и до посадки: первое точное состояние от сервера приходит с номером
// последнего его входа, дальше переигрываем свои. Едет ли катер на входе — по метке входа и старту/остановке гонки
// (как решает сервер); старт и остановку узнаём из вида гонки, поэтому при сверке «едет ли» считаем заново.
import { regattaCourse } from '../../shared/regattacourse.ts';
import { RG_KEYS, makeRgBoat, makeRgEvents, stepRgBoat, type RgBoat, type RgEvents } from '../../shared/regattaphysics.ts';
import { makeInput, type Input } from '../../shared/sim.ts';

const RING = 256;
/** Поправку больше 5 м не размазываем (R, новый заезд) — сразу на место */
const SNAP_M = 5;

interface Entry {
  seq: number;
  buttons: number;
  viewTick: number;
  /** Шагнули ли этим входом (катер уже был) и состояние после шага */
  stepped: boolean;
  readonly state: RgBoat;
}

function copy(dst: RgBoat, src: RgBoat): void {
  for (const k of RG_KEYS) dst[k] = src[k];
}

function same(a: RgBoat, b: RgBoat): boolean {
  for (const k of RG_KEYS) if (a[k] !== b[k]) return false;
  return true;
}

export class RgPredictor {
  readonly course = regattaCourse();
  readonly state = makeRgBoat();
  /** Состояние до последнего шага — для плавности между тиками */
  readonly prev = makeRgBoat();
  /** События последнего шага (не при переигрывании) */
  readonly events: RgEvents = makeRgEvents();
  /** Сдвиг картинки после поправки: гаснет за ~0,1 с */
  readonly offset = { x: 0, z: 0 };
  corrections = 0;
  /** Есть своё состояние от сервера (катер на воде) и его счётчик заездов */
  ready = false;
  reset = -1;
  private readonly ring: Entry[] = [];
  private newest = 0;
  private readonly tmpEv = makeRgEvents();
  private readonly tmpIn = makeInput();
  /** Едет ли катер на входе с такой меткой (вид гонки) */
  drive: (viewTick: number) => boolean = () => false;

  constructor() {
    for (let i = 0; i < RING; i++) this.ring.push({ seq: -1, buttons: 0, viewTick: 0, stepped: false, state: makeRgBoat() });
  }

  /** Свой вход (каждый тик, и до посадки): шаг катера, если он на воде. */
  input(inp: Input): void {
    const e = this.ring[inp.seq % RING];
    e.seq = inp.seq;
    e.buttons = inp.buttons;
    e.viewTick = inp.viewTick;
    e.stepped = this.ready;
    this.newest = inp.seq;
    if (!this.ready) return;
    copy(this.prev, this.state);
    stepRgBoat(this.state, inp, this.course, this.events, this.drive(inp.viewTick));
    copy(e.state, this.state);
  }

  /**
   * Точное состояние от сервера после входа ack; reset — счётчик заездов (сменился — новый катер, без сверки).
   * Совпало с предсказанием — ничего; нет — ставим его и переигрываем свои входы после ack.
   */
  accept(ack: number, server: RgBoat, reset: number): void {
    const fresh = !this.ready || reset !== this.reset;
    const e = this.ring[ack % RING];
    if (!fresh && e.seq === ack && e.stepped && same(e.state, server)) return;
    const x = this.state.x;
    const z = this.state.z;
    copy(this.state, server);
    this.ready = true;
    this.reset = reset;
    if (!fresh) this.corrections++;
    const inp = this.tmpIn;
    copy(this.prev, this.state);
    for (let seq = Math.max(ack + 1, this.newest - RING + 1); seq <= this.newest; seq++) {
      const r = this.ring[seq % RING];
      if (r.seq !== seq) continue;
      inp.seq = seq;
      inp.buttons = r.buttons;
      inp.viewTick = r.viewTick;
      copy(this.prev, this.state);
      stepRgBoat(this.state, inp, this.course, this.tmpEv, this.drive(r.viewTick));
      copy(r.state, this.state);
      r.stepped = true;
    }
    const dx = this.state.x - x;
    const dz = this.state.z - z;
    if (fresh || Math.hypot(dx, dz) > SNAP_M) this.offset.x = this.offset.z = 0;
    else {
      this.offset.x -= dx;
      this.offset.z -= dz;
    }
  }

  /** Катер сошёл на берег (или заезд кончился): дальше не шагаем, пока сервер не пришлёт новое состояние. */
  stop(): void {
    this.ready = false;
    this.reset = -1;
    this.offset.x = this.offset.z = 0;
  }

  decay(dt: number): void {
    const k = Math.exp(-dt * 12);
    this.offset.x *= k;
    this.offset.z *= k;
  }
}
