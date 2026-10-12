// Зал автоматов набережной: кто за каким автоматом стоит, вращения, банк джекпота, экран «Топ проигравших».
// Исход считается сразу при нажатии; клиенты только докручивают барабаны до него.
import { randomInt } from 'node:crypto';
import { JACKPOT_ITEMS } from '../../shared/outfit.ts';
import {
  REEL_SIZE, SLOT_AFK_TICKS, SLOT_AFK_WARN_TICKS, SPIN_READY_TICKS, SPIN_TICKS, STAKES, evaluate, jackpotPayout, poolAfterStake, symbolFromRoll,
} from '../../shared/slots.ts';
import type { Profiles } from '../profiles.ts';
import type { Profile, Store } from '../store.ts';
import { LosersBoard } from './losers.ts';

export interface Machine {
  stake: number;
  /** Место игрока на набережной (0 — свободен) */
  occupant: number;
  /** До какого тика барабаны ещё крутятся */
  busyUntil: number;
  /** С какого тика стоящий у автомата не крутит (подошёл или последнее вращение) */
  idleFrom: number;
  /** Уже предупредили, что скоро освободим */
  warned: boolean;
}

/** Кто у автомата не крутит: предупредить или поднять */
export interface SlotAfk {
  who: number;
  kick: boolean;
}

export interface SpinResult {
  m: number;
  reels: [number, number, number];
  stake: number;
  win: number;
  /** Номер строки таблицы выплат этого автомата (−1 — ничего) */
  line: number;
  jackpot: boolean;
  /** Вещь, выданная за джекпот (или null) */
  item: string | null;
  /** Жетоны сразу после ставки и после выигрыша */
  afterStake: number;
  final: number;
  pool: number;
}

export class SlotHall {
  readonly machines: Machine[] = STAKES.map((stake) => ({ stake, occupant: 0, busyUntil: 0, idleFrom: 0, warned: false }));
  /** Экран «Топ проигравших» на стене павильона: рассылает комната (step, onRename) */
  readonly losers: LosersBoard;
  private readonly profiles: Profiles;
  private readonly store: Store;
  private readonly roll: () => number;
  private readonly now: () => number;

  /** roll — случайное число 0..63 для одного барабана (положение на ленте) */
  constructor(profiles: Profiles, store: Store, roll: () => number = () => randomInt(REEL_SIZE), now: () => number = Date.now) {
    this.profiles = profiles;
    this.store = store;
    this.roll = roll;
    this.now = now;
    this.losers = new LosersBoard(() => store.state.profiles);
  }

  occupy(m: number, who: number, tick: number): boolean {
    const mc = this.machines[m];
    if (!mc || (mc.occupant !== 0 && mc.occupant !== who)) return false;
    this.release(who);
    mc.occupant = who;
    mc.idleFrom = tick;
    mc.warned = false;
    return true;
  }

  /** Раз в секунду: кого предупредить (за 10 с), кого поднять (минута без вращения). Поднимает комната. */
  afk(tick: number): SlotAfk[] {
    const out: SlotAfk[] = [];
    for (const mc of this.machines) {
      if (mc.occupant === 0 || tick < mc.busyUntil) continue;
      const idle = tick - mc.idleFrom;
      if (idle >= SLOT_AFK_TICKS) out.push({ who: mc.occupant, kick: true });
      else if (idle >= SLOT_AFK_WARN_TICKS && !mc.warned) {
        mc.warned = true;
        out.push({ who: mc.occupant, kick: false });
      }
    }
    return out;
  }

  release(who: number): void {
    for (const mc of this.machines) if (mc.occupant === who) mc.occupant = 0;
  }

  machineOf(who: number): number {
    return this.machines.findIndex((mc) => mc.occupant === who);
  }

  spin(who: number, p: Profile, tick: number): SpinResult | 'not_here' | 'busy' | 'no_tokens' {
    const m = this.machineOf(who);
    if (m < 0) return 'not_here';
    const mc = this.machines[m];
    if (tick < mc.busyUntil) return 'busy';
    if (!this.profiles.spend(p, mc.stake)) return 'no_tokens';
    const afterStake = p.tokens;
    const st = this.store.state;
    st.jackpot = poolAfterStake(st.jackpot, mc.stake);
    const reels: [number, number, number] = [symbolFromRoll(m, 0, this.roll()), symbolFromRoll(m, 1, this.roll()), symbolFromRoll(m, 2, this.roll())];
    const ev = evaluate(m, reels);
    let win = ev.win;
    let item: string | null = null;
    if (ev.jackpot) {
      const jp = jackpotPayout(mc.stake, st.jackpot);
      win = jp.win;
      st.jackpot = jp.poolAfter;
      item = JACKPOT_ITEMS.find((id) => !p.owned.includes(id)) ?? null;
      if (item) this.profiles.grant(p, item);
      st.lastJackpot = { nick: p.nick, win, at: this.now() };
      p.stats.jackpots++;
    }
    this.profiles.credit(p, win);
    p.stats.spins++;
    p.stats.slotWon += win;
    if (win > p.stats.bestWin) p.stats.bestWin = win;
    // «Топ проигравших»: ставка и выигрыш — в счёт, на экран — когда докрутятся барабаны
    p.stats.slotBet += mc.stake;
    p.stats.slotPaid += win;
    this.losers.spun(p.id, mc.stake - win, tick + SPIN_TICKS);
    mc.busyUntil = tick + SPIN_READY_TICKS;
    mc.idleFrom = tick;
    mc.warned = false;
    this.store.markDirty();
    return { m, reels, stake: mc.stake, win, line: ev.line, jackpot: ev.jackpot, item, afterStake, final: p.tokens, pool: st.jackpot };
  }
}
