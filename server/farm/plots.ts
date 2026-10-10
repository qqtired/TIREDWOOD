// Участки фермы: кто держит какой из 20 (level.md §7, design-v11 §15). Хозяин ушёл — участок ждёт его 5 минут (место
// в комнате занято), потом засыпает: «💤 Ник», растения видны, соседи могут поливать. Спящий участок отдают новичку,
// только когда свободных нет (сначала тот, чей хозяин дольше всех не заходил). Растения хранятся у игрока, поэтому
// вернувшийся на другой участок ничего не теряет. Места — в State.farmPlots и переживают перезапуск.
import { FARM_PLOTS, PLOT_MOVE_MS, PLOT_WAIT_MS } from '../../shared/farmdata.ts';
import { FARM_PLOT_ORDER } from '../../shared/farmmap.ts';

export interface PlotSeat {
  pid: number;
  /** Когда хозяин был на участке последний раз (мс); пока он на ферме — время входа */
  seen: number;
}

export class FarmPlots {
  readonly seats: (PlotSeat | null)[];
  /** Кто сейчас на ферме */
  private readonly present = new Set<number>();
  /** Когда игрок последний раз переезжал */
  private readonly movedAt = new Map<number, number>();

  constructor(saved: readonly (PlotSeat | null)[] | undefined) {
    this.seats = Array.from({ length: FARM_PLOTS }, (_, i) => (saved?.[i] ? { ...saved[i]! } : null));
  }

  plotOf(pid: number): number {
    return this.seats.findIndex((s) => s?.pid === pid);
  }

  isPresent(pid: number): boolean {
    return this.present.has(pid);
  }

  /** Хозяин ушёл меньше 5 минут назад: место ждёт его */
  waiting(i: number, now: number): boolean {
    const s = this.seats[i];
    return !!s && !this.present.has(s.pid) && now - s.seen < PLOT_WAIT_MS;
  }

  sleeping(i: number, now: number): boolean {
    const s = this.seats[i];
    return !!s && !this.present.has(s.pid) && now - s.seen >= PLOT_WAIT_MS;
  }

  /** Сколько мест занимают ждущие хозяев участки (кроме участка самого pid) */
  waitingCount(now: number, except = 0): number {
    let n = 0;
    for (let i = 0; i < this.seats.length; i++) if (this.waiting(i, now) && this.seats[i]!.pid !== except) n++;
    return n;
  }

  /** Есть ли участок для pid: свой, свободный или спящий */
  canEnter(pid: number, now: number): boolean {
    if (this.present.size + this.waitingCount(now, pid) >= FARM_PLOTS) return false;
    return this.plotOf(pid) >= 0 || this.seats.some((s, i) => !s || this.sleeping(i, now));
  }

  /** Вход: свой участок, иначе первый свободный по порядку (ближе к точке появления), иначе спящий. −1 — мест нет. */
  enter(pid: number, now: number): number {
    let i = this.plotOf(pid);
    if (i < 0) i = FARM_PLOT_ORDER.find((k) => !this.seats[k]) ?? -1;
    if (i < 0) {
      let best = -1;
      for (let k = 0; k < this.seats.length; k++) {
        if (this.sleeping(k, now) && (best < 0 || this.seats[k]!.seen < this.seats[best]!.seen)) best = k;
      }
      i = best;
    }
    if (i < 0) return -1;
    this.seats[i] = { pid, seen: now };
    this.present.add(pid);
    return i;
  }

  leave(pid: number, now: number): void {
    this.present.delete(pid);
    const i = this.plotOf(pid);
    if (i >= 0) this.seats[i] = { pid, seen: now };
  }

  /** Переезд на свободный участок: не чаще раза в минуту. true — переехал. */
  move(pid: number, to: number, now: number): boolean {
    if (!Number.isInteger(to) || to < 0 || to >= this.seats.length || this.seats[to]) return false;
    if (now - (this.movedAt.get(pid) ?? -Infinity) < PLOT_MOVE_MS) return false;
    const from = this.plotOf(pid);
    if (from >= 0) this.seats[from] = null;
    this.seats[to] = { pid, seen: now };
    this.movedAt.set(pid, now);
    return true;
  }

  save(): (PlotSeat | null)[] {
    return this.seats.map((s) => (s ? { ...s } : null));
  }
}
