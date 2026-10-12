// Колесо обозрения на сервере: кто на каком месте и когда его кабинка снова внизу (колесо и места — shared/wheel.ts).
// Двигает сидящих и высаживает приехавших комната; этот класс только помнит места.
import { WHEEL_CABINS, WHEEL_SEATS, bottomCabin, wheelArrival } from '../../shared/wheel.ts';

export class WheelRide {
  /** Кто сидит на каждом месте (номер места — кабинка × WHEEL_SEATS + место): номер игрока, 0 — свободно */
  readonly seats = new Array<number>(WHEEL_CABINS * WHEEL_SEATS).fill(0);
  /** Тик, когда кабинка с этим пассажиром снова внизу — тогда он выходит */
  readonly until = new Array<number>(WHEEL_CABINS * WHEEL_SEATS).fill(0);

  /** Сесть в нижнюю кабинку: номер места или −1 — в ней все места заняты. */
  board(slot: number, tick: number): number {
    const { c } = bottomCabin(tick);
    for (let k = 0; k < WHEEL_SEATS; k++) {
      const i = c * WHEEL_SEATS + k;
      if (this.seats[i] !== 0) continue;
      this.seats[i] = slot;
      this.until[i] = wheelArrival(c, tick);
      return i;
    }
    return -1;
  }

  seatOf(slot: number): number {
    return this.seats.indexOf(slot);
  }

  /** Встал с места (вышел из игры). */
  leave(slot: number): void {
    const i = this.seats.indexOf(slot);
    if (i >= 0) this.seats[i] = 0;
  }

  /** Места, чья кабинка приехала вниз к этому тику (их освобождает комната, высаживая пассажиров). */
  arrived(tick: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.seats.length; i++) if (this.seats[i] !== 0 && tick >= this.until[i]) out.push(i);
    return out;
  }
}
