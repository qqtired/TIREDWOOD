// Мяч у клиента. Считаем его сами тем же кодом, что сервер, — «сейчас», как свою желейку: каждый свой тик шагаем
// мяч (свой пинок виден сразу, без задержки сети), а со снимком берём точный мяч сервера и заново пересчитываем
// тики, которые сервер ещё не подтвердил. Чужие желейки для мяча — неподвижные тела там, где они были в снимке.
// Показываем мяч из истории этих тиков с задержкой tau: рядом со своей желейкой (или только что сам пнул) — «сейчас»,
// вдали — во времени чужих желеек (они видны с задержкой сети), иначе чужой пинок начинался бы раньше, чем
// желейка добежала до мяча. tau меняется плавно — мяч на полсекунды чуть быстрее или медленнее, но без рывков.
// Звуки и эффекты — события с номером тика: срабатывают, когда до них доходит показ. Здесь только счёт, без three.js.
import {
  BALL_KICK_TICKS, ballShown, copyBall, makeBall, readBall, stepBall, touchBall, type Ball, type BallKicker,
} from '../../shared/ball.ts';
import { TICK_RATE } from '../../shared/constants.ts';
import type { EntitySnap } from '../../shared/protocol.ts';
import type { PlayerState } from '../../shared/sim.ts';
import type { CollisionWorld } from '../../shared/world.ts';

/** История своих входов (Predictor): состояние желейки после входа seq и «сидит ли» она */
export interface InputHistory {
  readonly newestSeq: number;
  at(seq: number): { readonly after: PlayerState; readonly hold: number } | null;
}

export const EV_KICK = 0;
export const EV_BOUNCE = 1;
export const EV_TRAMP = 2;
export const EV_SPLASH = 3;
export const EV_APPEAR = 4;

/** Пинок, стук, батут, всплеск или появление дома — на тике seq; speed — скорость мяча после него */
export interface BallEvent {
  kind: number;
  /** Пинок и стук — номер по счётчику (так один и тот же пинок узнаём при пересчёте) */
  id: number;
  seq: number;
  speed: number;
  stale: boolean;
}

/** Что показать в кадре */
export interface BallShow {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  shown: boolean;
  grounded: boolean;
  wet: boolean;
}

const RING = 128;
/** Пересчитываем не больше стольких тиков (огромный лаг — мяч чуть отстанет, зато без подвисаний) */
const MAX_REPLAY = 120;
/** Показ сдвинулся дальше — это телепорт (домой), без сглаживания */
const SNAP_DIST = 3;
/** Ближе к своей желейке — мяч «сейчас» (с разбега показ успевает догнать до пинка); после своего пинка — ещё столько тиков */
const NEAR = 6;
const MINE_TICKS = 60;
/** Задержка показа меняется не быстрее стольких тиков за тик; больше TAU_MAX не бывает */
const TAU_RATE = 0.4;
const TAU_MAX = 40;
/** Всплеск и появление ближе стольких тиков друг к другу — одно и то же */
const PROX = 40;
const F_SHOWN = 1;
const F_GROUNDED = 2;
const F_WET = 4;

export class BallPredictor {
  /** Мяч «сейчас» — после последнего своего входа */
  readonly ball: Ball = makeBall();
  /** Визуальная поправка после пересчёта (затухает) */
  readonly offset = { x: 0, y: 0, z: 0 };
  /** Показ в этом кадре и события, до которых он дошёл (после frame) */
  readonly show: BallShow = { x: 0, y: 0, z: 0, vx: 0, vz: 0, shown: true, grounded: true, wet: false };
  readonly fired: BallEvent[] = [];
  /** Есть мяч с сервера (до первого снимка — лежит дома) */
  known = false;
  corrections = 0;
  /** Задержка показа, тиков */
  tau = 0;
  private readonly world: CollisionWorld;
  private readonly bodies: BallKicker[] = [];
  private nBodies = 0;
  /** История мяча по номерам своих входов: положение, флаги, счётчики пинков и стуков */
  private readonly hx = new Float64Array(RING);
  private readonly hy = new Float64Array(RING);
  private readonly hz = new Float64Array(RING);
  private readonly hf = new Uint8Array(RING);
  private readonly hk = new Uint8Array(RING);
  private readonly hb = new Uint8Array(RING);
  private readonly hs = new Int32Array(RING);
  private newest = -1;
  /** Где показ (номер тика с долей) */
  private sDisp = -1;
  private readonly events: BallEvent[] = [];
  /** Последние показанные: пинок и стук — по счётчику, всплеск и появление — по тику */
  private doneKick = 0;
  private doneBounce = 0;
  private doneSplash = -1e9;
  private doneAppear = -1e9;
  /** Свои пинки (номера входов) — для перезарядки при пересчёте */
  private readonly myKicks: number[] = [];
  private lastKick = -1e9;
  private readonly tmp: BallShow = { x: 0, y: 0, z: 0, vx: 0, vz: 0, shown: true, grounded: true, wet: false };

  constructor(world: CollisionWorld) {
    this.world = world;
    this.reset();
  }

  /** Заново: мяч лежит дома, с сервера ещё ничего. */
  reset(): void {
    copyBall(this.ball, makeBall());
    this.known = false;
    this.nBodies = 0;
    this.myKicks.length = 0;
    this.lastKick = -1e9;
    this.hs.fill(-1);
    this.newest = -1;
    this.sDisp = -1;
    this.tau = 0;
    this.events.length = 0;
    this.fired.length = 0;
    this.offset.x = this.offset.y = this.offset.z = 0;
    this.settleCounters();
    this.present(this.show);
  }

  /** Чужие желейки из снимка — тела, от которых мяч отскакивает. */
  setBodies(ents: readonly EntitySnap[], n: number, myId: number): void {
    let k = 0;
    for (let i = 0; i < n; i++) {
      const e = ents[i];
      if (e.id === myId) continue;
      const b = this.bodies[k] ?? (this.bodies[k] = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: 1, dashT: 0 });
      b.x = e.x;
      b.y = e.y;
      b.z = e.z;
      k++;
    }
    this.nBodies = k;
  }

  /** Свой тик: желейка уже шагнула (me — после входа seq). */
  tick(seq: number, me: PlayerState, hold: number): void {
    if (!this.known) return;
    this.step(seq, me, hold);
    this.write(seq);
    this.newest = seq;
  }

  /**
   * Снимок: мяч сервера (в DataView с байта at) — после того тика, где сервер применил мой вход ack.
   * Переигрываем мои входы после ack — получаем мяч «сейчас» и поправленную историю.
   */
  rebase(v: DataView, at: number, ack: number, hist: InputHistory): void {
    const b = this.ball;
    const had = this.known && this.newest >= 0 && this.sDisp >= 0;
    const before = this.tmp;
    if (had) this.sample(this.sDisp, before);
    const bx = before.x;
    const by = before.y;
    const bz = before.z;
    const bShown = before.shown;
    readBall(v, at, b);
    const newest = hist.newestSeq;
    const from = Math.max(ack + 1, newest - MAX_REPLAY);
    if (from === ack + 1 && ack >= 0) {
      // то, чего мы не предсказали (пинок чужой желейки, вода), — видно по разнице с нашей записью этого тика
      const k = this.slot(ack);
      if (k >= 0) {
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        if (ahead(b.kicks, this.hk[k])) this.note(EV_KICK, b.kicks, ack, sp);
        if (ahead(b.bounces, this.hb[k])) this.note(EV_BOUNCE, b.bounces, ack, sp);
        if (!(this.hf[k] & F_WET) && b.wet > 0 && ballShown(b)) this.note(EV_SPLASH, 0, ack, 0);
        if (!(this.hf[k] & F_SHOWN) && ballShown(b)) this.note(EV_APPEAR, 0, ack, 0);
      }
      this.write(ack);
    }
    // ждущие показа события после ack — пересчёт подтвердит заново; до ack — решают счётчики сервера
    for (const e of this.events) {
      if (e.seq > ack) e.stale = true;
      else if (e.kind === EV_KICK) e.stale = ahead(e.id, b.kicks);
      else if (e.kind === EV_BOUNCE || e.kind === EV_TRAMP) e.stale = ahead(e.id, b.bounces);
    }
    // мои пинки после ack сервер ещё не видел — пересчёт найдёт их заново
    while (this.myKicks.length && this.myKicks[this.myKicks.length - 1] > ack) this.myKicks.pop();
    this.lastKick = this.myKicks.length ? this.myKicks[this.myKicks.length - 1] : -1e9;
    for (let s = from; s <= newest; s++) {
      const e = hist.at(s);
      this.step(s, e ? e.after : null, e ? e.hold : 1);
      this.write(s);
    }
    if (newest >= 0) this.newest = newest;
    let n = 0;
    for (const e of this.events) if (!e.stale) this.events[n++] = e;
    this.events.length = n;
    if (!this.known) {
      // первый снимок: всё, что было раньше, — уже не новости
      this.known = true;
      this.events.length = 0;
      this.settleCounters();
      return;
    }
    if (!had) return;
    const after = this.tmp;
    this.sample(this.sDisp, after);
    const dx = after.x - bx;
    const dy = after.y - by;
    const dz = after.z - bz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > SNAP_DIST * SNAP_DIST || after.shown !== bShown) {
      // телепорт (домой) — сразу на место
      this.offset.x = this.offset.y = this.offset.z = 0;
    } else {
      if (d2 > 1e-6) this.corrections++;
      this.offset.x -= dx;
      this.offset.y -= dy;
      this.offset.z -= dz;
    }
  }

  /**
   * Кадр: alpha — доля до следующего тика (как у своей желейки), (meX, meZ) — своя желейка «сейчас»,
   * remote — номер своего входа, во времени которого сейчас видны чужие желейки (null — не знаем).
   * Заполняет show и fired.
   */
  frame(dt: number, alpha: number, meX: number, meZ: number, remote: number | null): void {
    this.fired.length = 0;
    if (!this.known || this.newest < 0) {
      // ещё не тикаем: что было до этого — не новости
      this.events.length = 0;
      this.settleCounters();
      this.present(this.show);
      this.decay(dt);
      this.addOffset();
      return;
    }
    const b = this.ball;
    const now = this.newest - 1 + alpha;
    const mine = Math.hypot(b.x - meX, b.z - meZ) < NEAR || this.newest - this.lastKick < MINE_TICKS;
    const target = mine || remote === null ? 0 : Math.min(TAU_MAX, Math.max(0, now - remote));
    const lim = TAU_RATE * dt * TICK_RATE;
    this.tau += Math.max(-lim, Math.min(lim, target - this.tau));
    // показ вперёд и только вперёд
    const s = Math.max(now - this.tau, this.sDisp);
    this.sDisp = s;
    this.sample(s, this.show);
    this.decay(dt);
    this.addOffset();
    // события, до которых дошёл показ, — по порядку
    let n = 0;
    for (const e of this.events) {
      if (e.seq <= s) this.fired.push(e);
      else this.events[n++] = e;
    }
    this.events.length = n;
    if (this.fired.length > 1) this.fired.sort((p, q) => p.seq - q.seq);
    for (const e of this.fired) {
      if (e.kind === EV_KICK) this.doneKick = e.id;
      else if (e.kind === EV_BOUNCE || e.kind === EV_TRAMP) this.doneBounce = e.id;
      else if (e.kind === EV_SPLASH) this.doneSplash = e.seq;
      else this.doneAppear = e.seq;
    }
  }

  /** Тик мяча так же, как на сервере: сначала касания желеек (моя — может пнуть), потом полёт; что случилось — в события. */
  private step(seq: number, me: PlayerState | null, hold: number): void {
    const b = this.ball;
    const k0 = b.kicks;
    const b0 = b.bounces;
    const t0 = b.tramps;
    const wet0 = b.wet;
    const shown0 = ballShown(b);
    if (me) {
      const can = hold === 0 && seq - this.lastKick >= BALL_KICK_TICKS;
      if (touchBall(b, me, can)) {
        this.lastKick = seq;
        this.myKicks.push(seq);
        if (this.myKicks.length > 16) this.myKicks.shift();
      }
    }
    for (let i = 0; i < this.nBodies; i++) touchBall(b, this.bodies[i], false);
    stepBall(b, this.world);
    if (b.kicks !== k0) this.note(EV_KICK, b.kicks, seq, Math.hypot(b.vx, b.vy, b.vz));
    if (b.bounces !== b0) this.note(b.tramps > t0 ? EV_TRAMP : EV_BOUNCE, b.bounces, seq, Math.hypot(b.vx, b.vy, b.vz));
    if (wet0 === 0 && b.wet > 0) this.note(EV_SPLASH, 0, seq, 0);
    if (!shown0 && ballShown(b)) this.note(EV_APPEAR, 0, seq, 0);
  }

  /** Событие на тике seq: уже ждёт показа — обновить тик; уже показано — пропустить; иначе — в очередь. */
  private note(kind: number, id: number, seq: number, speed: number): void {
    const counted = kind <= EV_TRAMP;
    for (const e of this.events) {
      const same = counted
        ? (e.kind === EV_KICK) === (kind === EV_KICK) && e.kind <= EV_TRAMP && e.id === id
        : e.kind === kind && Math.abs(e.seq - seq) < PROX;
      if (!same) continue;
      e.kind = kind;
      e.seq = seq;
      e.speed = speed;
      e.stale = false;
      return;
    }
    if (kind === EV_KICK ? !ahead(id, this.doneKick) : counted ? !ahead(id, this.doneBounce) : false) return;
    if (kind === EV_SPLASH && Math.abs(seq - this.doneSplash) < PROX) return;
    if (kind === EV_APPEAR && Math.abs(seq - this.doneAppear) < PROX) return;
    if (this.events.length >= 32) this.events.shift();
    this.events.push({ kind, id, seq, speed, stale: false });
  }

  private write(seq: number): void {
    const b = this.ball;
    const k = seq & (RING - 1);
    this.hx[k] = b.x;
    this.hy[k] = b.y;
    this.hz[k] = b.z;
    this.hf[k] = (ballShown(b) ? F_SHOWN : 0) | (b.grounded ? F_GROUNDED : 0) | (b.wet > 0 ? F_WET : 0);
    this.hk[k] = b.kicks;
    this.hb[k] = b.bounces;
    this.hs[k] = seq;
  }

  private slot(seq: number): number {
    if (seq < 0) return -1;
    const k = seq & (RING - 1);
    return this.hs[k] === seq ? k : -1;
  }

  /** Мяч в момент s (номер тика с долей) — из истории; нет в ней — «сейчас». */
  private sample(s: number, out: BallShow): void {
    const i0 = Math.floor(s);
    let a = this.slot(i0);
    let c = this.slot(i0 + 1);
    if (a < 0 && c < 0) {
      this.present(out);
      return;
    }
    let f = s - i0;
    if (a < 0) {
      a = c;
      f = 0;
    } else if (c < 0) {
      c = a;
      f = 0;
    }
    const near = f < 0.5 ? a : c;
    const fl = this.hf[near];
    // пропал или появился между тиками — без «проезда» из воды домой
    if ((this.hf[a] & F_SHOWN) !== (this.hf[c] & F_SHOWN)) {
      a = c = near;
      f = 0;
    }
    out.x = this.hx[a] + (this.hx[c] - this.hx[a]) * f;
    out.y = this.hy[a] + (this.hy[c] - this.hy[a]) * f;
    out.z = this.hz[a] + (this.hz[c] - this.hz[a]) * f;
    out.vx = (this.hx[c] - this.hx[a]) * TICK_RATE;
    out.vz = (this.hz[c] - this.hz[a]) * TICK_RATE;
    if (a === c) {
      out.vx = this.ball.vx;
      out.vz = this.ball.vz;
    }
    out.shown = (fl & F_SHOWN) !== 0;
    out.grounded = (fl & F_GROUNDED) !== 0;
    out.wet = (fl & F_WET) !== 0;
  }

  private present(out: BallShow): void {
    const b = this.ball;
    out.x = b.x;
    out.y = b.y;
    out.z = b.z;
    out.vx = b.vx;
    out.vz = b.vz;
    out.shown = ballShown(b);
    out.grounded = b.grounded;
    out.wet = b.wet > 0;
  }

  private decay(dt: number): void {
    const k = Math.exp(-dt * 12);
    this.offset.x *= k;
    this.offset.y *= k;
    this.offset.z *= k;
  }

  private addOffset(): void {
    this.show.x += this.offset.x;
    this.show.y += this.offset.y;
    this.show.z += this.offset.z;
  }

  /** Всё, что уже есть у мяча, — показано (без звуков задним числом). */
  private settleCounters(): void {
    this.doneKick = this.ball.kicks;
    this.doneBounce = this.ball.bounces;
    this.doneSplash = -1e9;
    this.doneAppear = -1e9;
  }
}

/** Счётчик a (по кругу 0–255) впереди b */
function ahead(a: number, b: number): boolean {
  const d = (a - b) & 255;
  return d > 0 && d < 128;
}
