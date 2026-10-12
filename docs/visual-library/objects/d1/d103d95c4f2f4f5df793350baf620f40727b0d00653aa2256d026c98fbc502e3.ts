// Доска рекордов рыбалки 2.0 у мостков: «Сегодня» (календарный день по Москве) и «За всё время», в каждой —
// по числу рыб и по весу улова, по 10 строк; и «Коллекция» — у кого сколько видов закрыто в журнале (альбом профиля).
// Считается по профилям (stats.fsFish, fsGrams, fsDay, fsDayFish, fsDayGrams, album) — их немного, пересчёт только
// по событиям (улов, смена ника, полночь), не чаще раза в секунду.
import { FISH_TOP_ROWS, collectionCount, isCollected, mskDayNum, type FishTopRow } from '../../shared/fishrules.ts';
import { mskDay } from '../../shared/economy.ts';
import type { FishBoardView, FishPodiumCatch } from '../../shared/messages.ts';
import type { Profile, Store } from '../store.ts';

/** Доска на момент now: больше — выше, поровну — чей профиль старше (меньше id), так порядок не скачет. */
export function buildFishTop(profiles: readonly Profile[], now: number, catches: readonly FishPodiumCatch[] = []): FishBoardView {
  const day = mskDayNum(now);
  const rows = (score: (p: Profile) => number): FishTopRow[] => {
    const out: FishTopRow[] = [];
    for (const p of profiles) {
      const v = score(p);
      if (v > 0) out.push({ pid: p.id, nick: p.nick, v });
    }
    out.sort((a, b) => b.v - a.v || a.pid - b.pid);
    return out.slice(0, FISH_TOP_ROWS);
  };
  const today = (p: Profile): boolean => p.stats.fsDay === day;
  return {
    day: mskDay(now),
    dn: rows((p) => (today(p) ? p.stats.fsDayFish : 0)),
    dg: rows((p) => (today(p) ? p.stats.fsDayGrams : 0)),
    an: rows((p) => p.stats.fsFish),
    ag: rows((p) => p.stats.fsGrams),
    cl: rows((p) => collectionCount(p.album)),
    podium: catches.filter((c) => mskDay(c.at) === mskDay(now))
      .map((c) => ({ ...c, nick: profiles.find((p) => p.id === c.pid)?.nick ?? c.nick }))
      .sort((a, b) => b.g - a.g || a.at - b.at || a.pid - b.pid || a.sp - b.sp).slice(0, 5),
  };
}

/** Улов в счётчики профиля: за всё время и за сегодня (новый день по Москве — «сегодня» с нуля). */
export function countCatch(p: Profile, g: number, now: number): void {
  const s = p.stats;
  const day = mskDayNum(now);
  if (s.fsDay !== day) {
    s.fsDay = day;
    s.fsDayFish = 0;
    s.fsDayGrams = 0;
  }
  s.fsFish++;
  s.fsGrams += g;
  s.fsDayFish++;
  s.fsDayGrams += g;
}

export class FishBoard {
  private readonly store: Store;
  private readonly now: () => number;
  private board: FishBoardView;
  private shown: string;
  private dirty = false;

  constructor(store: Store, now: () => number) {
    this.store = store;
    this.now = now;
    this.resetDay(now());
    this.board = buildFishTop(store.state.profiles, now(), store.state.fishPodium.catches);
    this.shown = JSON.stringify(this.board);
  }

  get top(): FishBoardView {
    const now = this.now();
    this.resetDay(now);
    // Входящему нужен свежий снимок, но он не должен потреблять ещё не разосланное изменение.
    return buildFishTop(this.store.state.profiles, now, this.store.state.fishPodium.catches);
  }

  record(p: Profile, sp: number, g: number): void {
    if (!isCollected(sp)) return;
    const now = this.now();
    this.resetDay(now);
    const podium = this.store.state.fishPodium;
    podium.catches.push({ pid: p.id, nick: p.nick, sp, g, at: Math.floor(now) });
    podium.catches.sort((a, b) => b.g - a.g || a.at - b.at || a.pid - b.pid || a.sp - b.sp);
    podium.catches.length = Math.min(5, podium.catches.length);
    this.store.markDirty();
    this.touch();
  }

  private resetDay(now: number): void {
    const day = mskDay(now);
    if (this.store.state.fishPodium.day === day) return;
    this.store.state.fishPodium = { day, catches: [] };
    this.store.markDirty();
  }

  /** Что-то поменялось (улов, ник) — пересчитать при следующей проверке. */
  touch(): void {
    this.dirty = true;
  }

  /** Раз в секунду: было изменение или наступил новый день — пересчёт. Новая доска, если она поменялась, иначе null. */
  check(): FishBoardView | null {
    const now = this.now();
    if (!this.dirty && mskDay(now) === this.board.day) return null;
    this.dirty = false;
    this.resetDay(now);
    const next = buildFishTop(this.store.state.profiles, now, this.store.state.fishPodium.catches);
    const key = JSON.stringify(next);
    if (key === this.shown) return null;
    this.shown = key;
    this.board = next;
    return next;
  }
}
