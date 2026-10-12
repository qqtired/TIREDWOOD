// Лодка Семёна «Удалая» на сервере: кто на какой банке и что с лодкой — стоит у Семёна, отсчёт до отхода, рейс
// к баркасу, ждёт у баркаса, рейс назад (shared/ferry.ts). Самих пассажиров (действие, где стоят) двигает комната:
// этот класс только решает, когда отходить и приходить. Плюс Саня на баркасе: за жетоны — на пирс к Семёну.
import { SANYA_PRICE, SANYA_USE } from '../../shared/barkas.ts';
import {
  FE_AWAY, FE_BACK, FE_BOARD, FE_HOME, FE_OUT, FERRY_BACK_TICKS, FERRY_BOARD_TICKS, FERRY_CALL_TICKS, FERRY_FULL_TICKS, FERRY_OUT_TICKS,
  FERRY_SEATS, FERRY_WAIT_TICKS,
} from '../../shared/ferry.ts';
import type { FerryStatus } from '../../shared/messages.ts';

/**
 * Что случилось за тик: отошли от Семёна (depart), пришли к баркасу (arrive), отошли от баркаса (leave), пришли
 * к Семёну (home), позвали — у Семёна пошёл отсчёт (call), отсчёт отменён — все вышли (cancel).
 */
export type FerryStep = 'depart' | 'arrive' | 'leave' | 'home' | 'call' | 'cancel' | null;

/** Что ответить на колокол у калитки баркаса */
export type FerryCall = 'here' | 'coming' | 'soon' | 'busy';

export class FerryRide {
  phase = FE_HOME;
  /** Отсчёт и стоянка у баркаса — тик отхода; рейс — тик, когда отошли */
  at = 0;
  /** Позвали колоколом с баркаса: лодка выйдет и пустой */
  called = false;
  /** Банки: номер игрока в снимке (0 — свободно) */
  readonly seats: number[] = new Array<number>(FERRY_SEATS).fill(0);

  get riders(): number {
    let n = 0;
    for (const s of this.seats) if (s !== 0) n++;
    return n;
  }

  get full(): boolean {
    return this.seats.indexOf(0) < 0;
  }

  /** У стоянки и можно садиться: у Семёна (стоит или отсчёт) или у баркаса */
  get docked(): boolean {
    return this.phase === FE_HOME || this.phase === FE_BOARD || this.phase === FE_AWAY;
  }

  /** Стоит у баркаса */
  get away(): boolean {
    return this.phase === FE_AWAY;
  }

  seatOf(slot: number): number {
    return this.seats.indexOf(slot);
  }

  /**
   * Сесть на свободную банку (−1 — мест нет или лодка не у стоянки). У Семёна первый запускает отсчёт 10 с; заняли
   * последнее место — отход через 3 с, если позже.
   */
  take(slot: number, tick: number): number {
    if (!this.docked) return -1;
    const k = this.seats.indexOf(0);
    if (k < 0) return -1;
    this.seats[k] = slot;
    if (this.phase === FE_HOME) {
      this.phase = FE_BOARD;
      this.at = tick + FERRY_BOARD_TICKS;
    }
    if (this.full) this.at = Math.min(this.at, tick + FERRY_FULL_TICKS);
    return k;
  }

  /** Встал с банки или вышел из игры. Отсчёт у Семёна без пассажиров (и без вызова) отменяется сразу: true. */
  leave(slot: number): boolean {
    const k = this.seats.indexOf(slot);
    if (k < 0) return false;
    this.seats[k] = 0;
    if (this.phase === FE_BOARD && this.riders === 0 && !this.called) {
      this.phase = FE_HOME;
      this.at = 0;
      return true;
    }
    return false;
  }

  /** Колокол у калитки баркаса: лодка у борта — садись; стоит у Семёна — выйдет через 3 с; уже идёт — скоро будет. */
  call(tick: number): FerryCall {
    if (this.phase === FE_AWAY) return 'here';
    if (this.phase === FE_OUT) return 'coming';
    if (this.called) return 'busy';
    this.called = true;
    if (this.phase === FE_HOME) {
      this.phase = FE_BOARD;
      this.at = tick + FERRY_CALL_TICKS;
    } else if (this.phase === FE_BOARD) this.at = Math.min(this.at, tick + FERRY_CALL_TICKS);
    return 'soon';
  }

  /** Тик: пора отходить, пришли, отсчёт кончился без пассажиров. */
  step(tick: number): FerryStep {
    switch (this.phase) {
      case FE_HOME:
        return null;
      case FE_BOARD:
        if (tick < this.at) return null;
        if (this.riders === 0 && !this.called) {
          this.phase = FE_HOME;
          this.at = 0;
          return 'cancel';
        }
        this.phase = FE_OUT;
        this.at = tick;
        this.called = false;
        return 'depart';
      case FE_OUT:
        if (tick - this.at < FERRY_OUT_TICKS) return null;
        this.phase = FE_AWAY;
        this.at = tick + FERRY_WAIT_TICKS;
        return 'arrive';
      case FE_AWAY:
        if (tick < this.at) return null;
        this.phase = FE_BACK;
        this.at = tick;
        return 'leave';
      case FE_BACK:
        if (tick - this.at < FERRY_BACK_TICKS) return null;
        if (this.called) {
          // пока шла назад, позвали с баркаса — у Семёна сразу отсчёт (можно подсесть) и снова в море
          this.phase = FE_BOARD;
          this.at = tick + FERRY_CALL_TICKS;
        } else {
          this.phase = FE_HOME;
          this.at = 0;
        }
        return 'home';
    }
    return null;
  }

  status(): FerryStatus {
    return { ph: this.phase, at: this.at, n: this.riders, c: this.called ? 1 : 0 };
  }
}

/** Что нужно Сане от комнаты */
export interface SanyaHost {
  /** Списать жетоны (false — не хватает) */
  spend(n: number): boolean;
  /** Перенести на пирс к Семёну */
  move(): void;
}

/** Где стоит игрок (для проверки «рядом с Саней») */
export interface Where {
  x: number;
  y: number;
  z: number;
}

/** Рядом с Саней: в радиусе его точки разговора (+0,5 м на задержку), на той же палубе */
export function nearSanya(s: Where): boolean {
  return Math.hypot(s.x - SANYA_USE.x, s.z - SANYA_USE.z) <= SANYA_USE.r + 0.5 && Math.abs(s.y - SANYA_USE.y) < 2;
}

/**
 * Саня отправляет на пирс к Семёну за SANYA_PRICE жетонов: проверяет, что игрок рядом, и баланс, списывает и переносит.
 * Возвращает, что вышло: ok — уже у Семёна; far — отошёл от Сани; poor — не хватает жетонов.
 */
export function sanyaHome(at: Where, host: SanyaHost): 'ok' | 'far' | 'poor' {
  if (!nearSanya(at)) return 'far';
  if (!host.spend(SANYA_PRICE)) return 'poor';
  host.move();
  return 'ok';
}
