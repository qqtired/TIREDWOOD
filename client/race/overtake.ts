// Картинг, «Обгон!» (Э-8): следит за своим местом по снимкам сервера и говорит, когда оно сменилось насовсем.
// Места соседей в схватке мигают с тика на тик, поэтому новое место должно продержаться HOLD_MS — тогда это обгон;
// мигнуло и вернулось — молчим. Кого обошёл (или кто обошёл тебя) — по местам соседей до и после.
// Без DOM и three: тест test/race-overtake.test.ts.

/** Сколько мс новое место должно держаться, чтобы считаться обгоном */
export const PASS_HOLD_MS = 450;

export interface PassEvent {
  /** true — ты обогнал, false — тебя обогнали */
  up: boolean;
  from: number;
  to: number;
  /** Кто остался позади (up) или кто обошёл тебя (down); null — не определили */
  who: number | null;
}

export class PlaceWatch {
  private readonly hold: number;
  /** Подтверждённое место (0 — ещё не знаем) и места всех карт на тот момент */
  private stable = 0;
  private base = new Map<number, number>();
  /** Место-кандидат и с какого момента оно держится */
  private cand = 0;
  private since = 0;

  constructor(holdMs = PASS_HOLD_MS) {
    this.hold = holdMs;
  }

  reset(): void {
    this.stable = this.cand = this.since = 0;
    this.base = new Map();
  }

  /**
   * Раз в снимок. places — место каждого карта (id → место), running — гонка идёт и ты ещё не финишировал
   * (иначе наблюдатель сбрасывается). Возвращает событие, когда смена места подтвердилась.
   */
  update(now: number, myId: number, places: ReadonlyMap<number, number>, running: boolean): PassEvent | null {
    if (!running) {
      if (this.stable) this.reset();
      return null;
    }
    const mine = places.get(myId) ?? 0;
    if (mine <= 0) return null;
    if (this.stable === 0 || mine === this.stable) {
      this.stable = this.cand = mine;
      this.base = new Map(places);
      return null;
    }
    if (mine !== this.cand) {
      this.cand = mine;
      this.since = now;
      return null;
    }
    if (now - this.since < this.hold) return null;
    const from = this.stable;
    const event: PassEvent = { up: mine < from, from, to: mine, who: this.whoPassed(myId, from, mine, places) };
    this.stable = this.cand = mine;
    this.base = new Map(places);
    return event;
  }

  /** Сосед, чьё место сменилось в обратную сторону: ближайший к твоему старому месту */
  private whoPassed(myId: number, from: number, to: number, places: ReadonlyMap<number, number>): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    for (const [id, was] of this.base) {
      if (id === myId) continue;
      const now = places.get(id);
      if (now === undefined) continue;
      // обогнал: был впереди (место от to до from−1), стал позади; обогнали: был позади (from+1…to), стал впереди
      const ok = to < from ? was >= to && was < from && now > to : was > from && was <= to && now < to;
      if (!ok) continue;
      const dist = Math.abs(was - from);
      if (dist < bestDist) {
        best = id;
        bestDist = dist;
      }
    }
    return best;
  }
}
