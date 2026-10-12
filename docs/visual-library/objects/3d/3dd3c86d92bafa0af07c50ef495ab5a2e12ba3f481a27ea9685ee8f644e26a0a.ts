// Катер «Ласточка» на сервере: кто на каком месте и что с катером — стоит, посадка, поездка (shared/boat.ts).
// Самих пассажиров (действие, где стоят) двигает комната: этот класс только решает, когда отплывать и возвращаться.
import { BOAT_BOARD_TICKS, BOAT_FULL_TICKS, BOAT_RIDE_TICKS, BOAT_SEATS, BP_BOARD, BP_DOCK, BP_RIDE } from '../../shared/boat.ts';
import type { BoatStatus } from '../../shared/messages.ts';

/** Что случилось за тик: отплыли, вернулись к причалу, посадку отменили (все вышли) */
export type BoatStep = 'depart' | 'arrive' | 'cancel' | null;

export class BoatRide {
  phase = BP_DOCK;
  /** Места: номер игрока в снимке (0 — свободно); первое — за рулём */
  readonly seats: number[] = new Array<number>(BOAT_SEATS).fill(0);
  /** Посадка — тик отплытия; поездка — тик, когда отплыли */
  at = 0;
  /** Кто заплатил (капитан) */
  nick = '';

  get riders(): number {
    let n = 0;
    for (const s of this.seats) if (s !== 0) n++;
    return n;
  }

  /** Все места заняты */
  get full(): boolean {
    return this.seats.indexOf(0) < 0;
  }

  seatOf(slot: number): number {
    return this.seats.indexOf(slot);
  }

  /** Заплатил первый: посадка 30 с, он садится за руль. Возвращает его место. */
  start(slot: number, nick: string, tick: number): number {
    this.phase = BP_BOARD;
    this.at = tick + BOAT_BOARD_TICKS;
    this.nick = nick;
    this.seats.fill(0);
    return this.take(slot, tick);
  }

  /** Сесть на первое свободное место (−1 — мест нет). Заняли последнее — отплытие через 3 с, если позже. */
  take(slot: number, tick: number): number {
    const k = this.seats.indexOf(0);
    if (k < 0) return -1;
    this.seats[k] = slot;
    if (this.full) this.at = Math.min(this.at, tick + BOAT_FULL_TICKS);
    return k;
  }

  /** Встал с места: вышел на причал или из игры. */
  leave(slot: number): void {
    const k = this.seats.indexOf(slot);
    if (k >= 0) this.seats[k] = 0;
  }

  /** Тик: пора отплывать (некому — посадка отменяется, плата не возвращается) или пора к причалу. */
  step(tick: number): BoatStep {
    if (this.phase === BP_BOARD && tick >= this.at) {
      if (this.riders === 0) {
        this.phase = BP_DOCK;
        return 'cancel';
      }
      this.phase = BP_RIDE;
      this.at = tick;
      return 'depart';
    }
    if (this.phase === BP_RIDE && tick - this.at >= BOAT_RIDE_TICKS) {
      this.phase = BP_DOCK;
      return 'arrive';
    }
    return null;
  }

  status(): BoatStatus {
    return { ph: this.phase, at: this.at, n: this.riders, nick: this.phase === BP_DOCK ? '' : this.nick };
  }
}
