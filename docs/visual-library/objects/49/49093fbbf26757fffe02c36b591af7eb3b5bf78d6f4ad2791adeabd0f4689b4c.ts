// Рыбаки у маяка без three.js (проверяется тестом): живут по тому же распорядку, что удочка игрока на сервере —
// заброс, пробы, поклёвка, подсечка (или сорвалась), вываживание, улов в руках, в ведро — те же события.
import { TICK_RATE } from '../../shared/constants.ts';
import {
  CAST_TICKS, FE_BITE, FE_CAST, FE_DONE, FE_EARLY, FE_HOOK, FE_LAND, FE_MISS, FE_NIBBLE, FISH, GOLDFISH, R_JUNK, planBite, reelTicks, rollCatch,
} from '../../shared/fishing.ts';

/** Ждут поклёвку дольше игроков (во столько раз): соседи ловят неспешно */
const FISHER_WAIT_K = 2;
/** Подсекают вовремя с такой вероятностью; на пробе дёргают зря — с такой */
const FISHER_HOOK_P = 0.8;
const FISHER_EARLY_P = 0.08;
/** Поплавок падает в столько метров перед рыбаком (и до SIDE вбок) */
const FISHER_CAST: readonly [number, number] = [5.5, 8];
const FISHER_SIDE = 1.2;

const F_REST = 0;
const F_FLY = 1;
const F_WAIT = 2;
const F_BITE = 3;
const F_REEL = 4;
const F_HOLD = 5;

export type FishEmit = (kind: number, a: number, b: number) => void;

/** Распорядок рыбака: сам решает, когда клюёт и что попалось, и говорит событиями удочки (FE_*). */
export class FisherBrain {
  private readonly x: number;
  private readonly z: number;
  private readonly yaw: number;
  private readonly rnd: () => number;
  /** Что сейчас делает (F_*) и сколько до следующего шага, с */
  st = F_REST;
  private t: number;
  /** С приземления поплавка, с; пробы и поклёвка — тоже от приземления */
  private wait = 0;
  private nibbles: number[] = [];
  private bite = 0;
  private n = 0;
  private sp = -1;
  private g = 0;
  /** Сколько поймано (для отладки) */
  caught = 0;
  /** Что клюёт (с рыбалкой 2.0 — её виды, folk.ts) */
  roll: (rand: () => number) => { sp: number; g: number } = rollCatch;

  constructor(x: number, z: number, yaw: number, rnd: () => number) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.rnd = rnd;
    this.t = 1 + rnd() * 5;
  }

  step(dt: number, emit: FishEmit): void {
    const r = this.rnd;
    this.t -= dt;
    switch (this.st) {
      case F_REST:
        if (this.t <= 0) this.cast(emit);
        break;
      case F_FLY:
        if (this.t <= 0) {
          this.st = F_WAIT;
          this.wait = 0;
        }
        break;
      case F_WAIT:
        this.wait += dt;
        while (this.nibbles.length > 0 && this.wait >= this.nibbles[0]) {
          this.nibbles.shift();
          emit(FE_NIBBLE, ++this.n, 0);
          if (r() < FISHER_EARLY_P) {
            // дёрнул на пробе — сорвалась
            emit(FE_EARLY, 1, 0);
            this.rest(2.5, 5);
            return;
          }
        }
        if (this.wait >= this.bite) {
          const c = this.roll(r);
          this.sp = c.sp;
          this.g = c.g;
          emit(FE_BITE, ++this.n, 0);
          this.st = F_BITE;
          this.t = 0.3 + r() * 0.6;
        }
        break;
      case F_BITE:
        if (this.t > 0) break;
        if (r() < FISHER_HOOK_P) {
          emit(FE_HOOK, this.sp, this.g);
          this.st = F_REEL;
          this.t = reelTicks(this.g) / TICK_RATE;
        } else {
          emit(FE_MISS, 0, 0);
          this.rest(2.5, 5);
        }
        break;
      case F_REEL:
        if (this.t <= 0) {
          emit(FE_LAND, this.sp, this.g);
          this.caught++;
          this.st = F_HOLD;
          this.t = 2.2 + r() * 1.4;
        }
        break;
      case F_HOLD:
        if (this.t <= 0) {
          // рыбу — в ведро, золотую рыбку и хлам — обратно в море
          const back = this.sp === GOLDFISH || FISH[this.sp]?.rarity === R_JUNK;
          emit(FE_DONE, back ? 0 : 2, 0);
          this.rest(3, 7);
        }
        break;
    }
  }

  private cast(emit: FishEmit): void {
    const r = this.rnd;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const d = FISHER_CAST[0] + r() * (FISHER_CAST[1] - FISHER_CAST[0]);
    const side = (r() - 0.5) * 2 * FISHER_SIDE;
    emit(FE_CAST, this.x + fx * d - fz * side, this.z + fz * d + fx * side);
    const plan = planBite(r);
    this.nibbles = plan.nibbles.map((t) => (t * FISHER_WAIT_K) / TICK_RATE);
    this.bite = (plan.bite * FISHER_WAIT_K) / TICK_RATE;
    this.n = 0;
    this.sp = -1;
    this.st = F_FLY;
    this.t = CAST_TICKS / TICK_RATE;
  }

  private rest(lo: number, hi: number): void {
    this.st = F_REST;
    this.t = lo + this.rnd() * (hi - lo);
  }
}
