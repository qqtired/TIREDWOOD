// Рекорд крепости в бою (FortUi). Плашка в полосе сверху — «🏆 Рекорд 47 · твой 12» всю игру: рекордная волна идёт —
// плашка зовёт, команда побила рекорд — золотая «Ваш! 48 · было 47» и число растёт с каждой волной. Плашка узкая и
// одной ширины (полоса не наезжает на жетоны справа). Баннеры: при входе («Рекорд: 47 волн — ники», «Твой рекорд: 12»),
// рекордная волна, рекорд повторён, побит (всем), свой рекорд (себе).
// Числа — от сервера: приветствие `fort` (rec) и события `frec`; сколько волн отбито сейчас — из снимка (cleared).
import { FT_END, FT_WAVE } from '../../../shared/fort.ts';
import { namesLine, recWhen, wavesText, type FortRecIntro, type FortRecKind } from '../../../shared/fortrecord.ts';
import type { BannerSpec } from './banners.ts';
import { el, replay, setText } from './dom.ts';

export class RecordPlate {
  readonly root: HTMLElement;
  private readonly label: HTMLElement;
  private readonly num: HTMLElement;
  private readonly mineEl: HTMLElement;
  private intro: FortRecIntro | null = null;
  /** Свой рекорд в этой игре (события me) */
  private my = 0;
  private key = '';
  private oursWas = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'fu-plate fu-rec', parent);
    el('i', 'fu-rec-cup', this.root, '🏆');
    const body = el('div', 'fu-rec-body', this.root);
    const line = el('div', 'fu-rec-line', body);
    this.label = el('span', 'fu-rec-label', line, 'Рекорд');
    this.num = el('b', 'fu-rec-n', line, '—');
    this.mineEl = el('span', 'fu-rec-me', body, '');
    this.root.hidden = true;
  }

  /** Рекорды от сервера (вход в крепость или новая игра): рекорд сейчас, рекорд до этой игры, свой — до игры и в ней */
  set(r: FortRecIntro): void {
    this.intro = r;
    this.my = r.my;
    this.key = '';
    this.oursWas = false;
    this.root.hidden = false;
  }

  /** Свой рекорд вырос (событие me) */
  grow(wave: number): void {
    this.my = Math.max(this.my, wave);
  }

  /** Рекорд крепости до этой игры (его бьют); 0 — не было */
  get base(): number {
    return this.intro?.base ?? 0;
  }

  /** Свой рекорд сейчас */
  get mine(): number {
    return Math.max(this.intro?.best ?? 0, this.my);
  }

  /** Эта волна — рекордная: отобьют — рекорд крепости их */
  recordWave(wave: number): boolean {
    return this.base > 0 && wave === this.base + 1;
  }

  /** Кадр: сколько волн отбито, какая идёт, фаза. true — команда только что стала рекордсменом */
  update(cleared: number, wave: number, phase: number): boolean {
    const r = this.intro;
    if (!r) return false;
    const ours = cleared > 0 && cleared > r.base;
    const rec = ours ? cleared : r.base;
    const hot = !ours && phase === FT_WAVE && this.recordWave(wave);
    const tie = !ours && r.base > 0 && cleared === r.base && phase !== FT_END;
    const mine = this.mine;
    const key = `${rec}|${ours}|${hot}|${tie}|${mine}`;
    const became = ours && !this.oursWas;
    this.oursWas = ours;
    if (key === this.key) return became;
    this.key = key;
    setText(this.label, ours ? 'Ваш!' : 'Рекорд');
    setText(this.num, rec > 0 ? String(rec) : '—');
    setText(this.mineEl, ours ? (r.base > 0 ? `было ${r.base}` : 'первый!') : hot ? 'бьём рекорд!' : tie ? 'ещё волна!' : `твой ${mine > 0 ? mine : '—'}`);
    this.root.classList.toggle('ours', ours);
    this.root.classList.toggle('hot', hot || tie);
    if (became) replay(this.root, 'flash');
    const who = r.top && !r.top.live && !ours ? ` — ${namesLine(r.top.names, 6)}${r.top.at ? `, ${recWhen(r.top.at, Date.now())}` : ''}` : '';
    this.root.title = rec > 0
      ? `Рекорд крепости: ${wavesText(rec)}${ours ? ' — ставите прямо сейчас' : who}. Твой рекорд: ${mine > 0 ? wavesText(mine) : 'пока нет'}`
      : 'Рекордов крепости ещё нет — отбейте первую волну';
    return became;
  }

  reset(): void {
    this.intro = null;
    this.my = 0;
    this.key = '';
    this.oursWas = false;
    this.root.hidden = true;
  }
}

/** Баннер при входе в крепость: «Рекорд: 47 волн — ники» и «Твой рекорд: 12» */
export function introBanner(r: FortRecIntro, now: number): BannerSpec {
  const mine = Math.max(r.best, r.my);
  const mineText = `Твой рекорд: ${mine > 0 ? wavesText(mine) : 'пока нет — отбей хоть одну волну'}`;
  const base = { key: 'rec-intro', badge: '🏆', tone: 'gold' as const, prio: 1, ms: 6500 };
  if (!r.top) return { ...base, title: 'Рекордов крепости ещё нет', sub: 'Отбейте первую волну — и рекорд ваш' };
  if (r.top.live) {
    return { ...base, title: `Рекорд бьют прямо сейчас: ${wavesText(r.top.wave)}!`, sub: `${r.base > 0 ? `Прежний — ${r.base} · ` : ''}${mineText}` };
  }
  const when = recWhen(r.top.at, now);
  return { ...base, title: `Рекорд: ${wavesText(r.top.wave)} — ${namesLine(r.top.names)}`, sub: `${mineText}${when ? ` · рекорд поставлен ${when}` : ''}` };
}

/** Рекордная волна началась */
export function hotBanner(wave: number): BannerSpec {
  return { key: 'rec-hot', badge: '🏆', tone: 'gold', prio: 1, ms: 3200, title: 'Рекордная волна!', sub: `Отбейте ${wave}-ю — и рекорд крепости ваш` };
}

/** Событие рекорда после отбитой волны: побит (всем), повторён, свой */
export function eventBanner(k: FortRecKind, wave: number, prev: number): BannerSpec {
  if (k === 'team') {
    return { key: 'rec', badge: '🏆', tone: 'record', prio: 2, ms: 5600, title: 'Новый рекорд крепости!', sub: `${wavesText(wave)} — прежний рекорд ${prev}. Держимся дальше!` };
  }
  if (k === 'tie') return { key: 'rec', badge: '⚔️', tone: 'gold', prio: 2, ms: 4200, title: 'Рекорд повторён!', sub: `${wavesText(wave)} — ещё одна волна, и рекорд ваш` };
  return { key: 'rec-me', badge: '⭐', tone: 'gold', prio: 1, ms: 4000, title: 'Твой новый рекорд!', sub: `${wavesText(wave)} — было ${prev}` };
}
