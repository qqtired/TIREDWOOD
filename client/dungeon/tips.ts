// «Подземелье»: три подсказки первого спуска — в той же латунной плашке под волной (DungeonHud.toast, стиль tip), только
// текст, новых окон нет. Каждая показывается один раз и запоминается в localStorage этого браузера (как настройки режима,
// prefs.ts): профиль и сервер не трогаем; в другом браузере подсказки покажутся ещё раз — это не страшно.
//   · «Зажми Q и отпусти в гуще» — в бою, когда вокруг героя стая (≥ 4 врагов ближе 8 м); не показываем тому, кто уже
//     держал Q дольше 0,6 с;
//   · «Пробел — рывок сквозь стаю» — в бою, когда стая вплотную (≥ 6 врагов ближе 5 м) или здоровья меньше 70 %; не
//     показываем тому, кто уже рывком пользовался;
//   · «Встань в круг и постой» — когда герой подошёл к постройке с кругом (алтарь, кузня, родник, фонарь) ближе 9 м.
// Не раньше чем через 6 с после начала забега и не чаще чем раз в 15 с (две плашки не встают друг на друга).
import { DG_HZ } from '../../shared/dungeon/api.ts';
import type { DgView } from './view.ts';

export type TipId = 'q' | 'dash' | 'circle';

export const TIP_TEXT: Record<TipId, string> = {
  q: 'Зажми Q и отпусти в гуще',
  dash: 'Пробел — рывок сквозь стаю',
  circle: 'Встань в круг и постой',
};

const KEY = 'dg.tips.v1';
/** первые секунды забега подсказок нет: игрок осматривается */
const START_S = 6;
/** между подсказками, с времени забега */
const GAP_S = 15;
const Q_PACK = { n: 4, r: 8 };
const DASH_PACK = { n: 6, r: 5 };
const CIRCLE_NEAR = 9;
/** Q держали дольше — значит, заряд уже знаком, с */
const Q_LEARNED_S = 0.6;
const CIRCLE_KINDS = new Set<string>(['altar', 'forge', 'spring', 'lamppost']);
const IDS: readonly TipId[] = ['q', 'dash', 'circle'];

const L = 240;
const wrap = (d: number): number => d - L * Math.round(d / L);

export interface TipStore {
  load(): string | null;
  save(v: string): void;
}

const browserStore: TipStore = {
  load: () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  save: (v) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // нет хранилища — подсказки не запомнятся дольше этой вкладки
    }
  },
};

/** Какие подсказки игрок уже видел (из сохранённой строки «q,dash») */
export function parseSeen(raw: string | null): Set<TipId> {
  const out = new Set<TipId>();
  for (const part of (raw ?? '').split(',')) if ((IDS as readonly string[]).includes(part)) out.add(part as TipId);
  return out;
}

export class DungeonTips {
  private readonly store: TipStore;
  private readonly seen: Set<TipId>;
  /** время забега (с), когда в последний раз показали; −∞ — ещё не показывали */
  private lastAt = -Infinity;
  private qDownAt = -1;

  constructor(store: TipStore = browserStore) {
    this.store = store;
    this.seen = parseSeen(store.load());
  }

  /** Новый забег: интервал между плашками считается заново (увиденное остаётся) */
  reset(): void {
    this.lastAt = -Infinity;
    this.qDownAt = -1;
  }

  has(id: TipId): boolean {
    return this.seen.has(id);
  }

  /** Q нажали / отпустили (t — время забега, с): долгий заряд — подсказка про Q больше не нужна */
  noteQ(down: boolean, t: number): void {
    if (down) this.qDownAt = t;
    else if (this.qDownAt >= 0 && t - this.qDownAt >= Q_LEARNED_S) this.mark('q');
  }

  /** Рывок сделан: подсказка про Пробел больше не нужна */
  noteDash(): void {
    this.mark('dash');
  }

  /**
   * Раз в несколько шагов: какая подсказка пора (null — никакая). Вызывающий показывает плашку и ничего больше не делает.
   * Окна (карточки, сундук), гибель героя и первые секунды — без подсказок.
   */
  next(v: DgView): TipId | null {
    const t = v.tick / DG_HZ;
    if (t < START_S || t - this.lastAt < GAP_S || v.hero.dead || v.cards || v.chest) return null;
    const fight = v.stage === 'wave' || v.stage === 'boss';
    let pick: TipId | null = null;
    if (fight && !this.seen.has('q') && this.pack(v, Q_PACK.r) >= Q_PACK.n) pick = 'q';
    else if (fight && !this.seen.has('dash') && (this.pack(v, DASH_PACK.r) >= DASH_PACK.n || v.hero.hp < v.hero.hpMax * 0.7)) pick = 'dash';
    else if (!this.seen.has('circle') && this.nearCircle(v)) pick = 'circle';
    if (!pick) return null;
    this.lastAt = t;
    this.mark(pick);
    return pick;
  }

  private pack(v: DgView, r: number): number {
    let n = 0;
    const r2 = r * r;
    for (const e of v.enemies) {
      const dx = wrap(e.x - v.hero.x);
      const dz = wrap(e.z - v.hero.z);
      if (dx * dx + dz * dz <= r2) n++;
    }
    return n;
  }

  private nearCircle(v: DgView): boolean {
    const r2 = CIRCLE_NEAR * CIRCLE_NEAR;
    for (const b of v.buildings) {
      if (!CIRCLE_KINDS.has(b.kind)) continue;
      const dx = wrap(b.x - v.hero.x);
      const dz = wrap(b.z - v.hero.z);
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }

  private mark(id: TipId): void {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.store.save([...this.seen].join(','));
  }
}
