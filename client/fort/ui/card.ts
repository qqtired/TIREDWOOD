// Карточка крепости в верх-лево (кит: .k-plate, как на странице lab/ui «Крепость»): мини-карта 96 и справа — ворота
// и кристалл тонкими полосами с процентом (бьют — строка вздрагивает красным, мало — красное число) и строка колокола
// (щит готов / щит · 6 с / колокол через 23 с). Под карточкой — строка FPS (по настройке). Мини-карту рисует FortHud.
import { TICK_RATE } from '../../../shared/constants.ts';
import { el, setText } from './dom.ts';
import { fortImg } from './icons.ts';

/** Сколько держится «вздрагивание» после удара, мс */
const HIT_MS = 1200;

class HpRow {
  readonly root: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly bar: HTMLElement;
  private last = '';
  private hitTimer = 0;
  private readonly tone: string;
  /** Подпись при нуле: «Ворота пали», «Кристалл пал» */
  private readonly downWord: string;

  constructor(parent: HTMLElement, name: string, tone: string, downWord: string) {
    this.tone = tone;
    this.downWord = downWord;
    this.root = el('div', 'ft-hp', parent);
    el('span', 'ft-hp-name', this.root, name);
    this.pct = el('b', 'ft-hp-pct', this.root);
    this.bar = el('span', `k-meter ${tone}`, this.root);
    this.bar.innerHTML = '<i class="k-meter-ghost"></i><i class="k-meter-fill"></i>';
  }

  set(hp: number, max: number): void {
    const v = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
    const pct = Math.round(v * 100);
    const down = hp <= 0;
    const low = down || v < 0.35;
    const key = `${pct}|${down}|${low}`;
    if (key === this.last) return;
    this.last = key;
    setText(this.pct, down ? this.downWord : `${pct}%`);
    this.root.classList.toggle('is-low', low);
    this.bar.className = `k-meter ${low ? 'k-meter--bad' : this.tone}`;
    this.bar.style.setProperty('--v', String(v.toFixed(3)));
    this.bar.style.setProperty('--g', String(v.toFixed(3)));
  }

  hurt(): void {
    this.root.classList.add('is-hit');
    clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => this.root.classList.remove('is-hit'), HIT_MS);
  }

  reset(): void {
    clearTimeout(this.hitTimer);
    this.root.classList.remove('is-hit');
    this.last = '';
  }
}

export class FortCard {
  readonly root: HTMLElement;
  /** Холст мини-карты (рисует FortHud.drawMap) */
  readonly map: HTMLCanvasElement;
  readonly gate: HpRow;
  readonly crystal: HpRow;
  readonly stats: HTMLElement;
  private readonly bell: HTMLElement;
  private bellKey = '';

  constructor(slot: HTMLElement) {
    this.root = el('div', 'k-plate ft-fort');
    this.root.dataset.mode = 'fort';
    const box = el('div', 'ft-map', this.root);
    this.map = el('canvas', 'ft-map-cv', box);
    const side = el('div', 'ft-hps', this.root);
    this.gate = new HpRow(side, 'Ворота', 'k-meter--mode', 'пали');
    this.crystal = new HpRow(side, 'Кристалл', 'k-meter--info', 'пал');
    this.bell = el('div', 'ft-bell', side);
    this.stats = el('div', 'k-faint ft-stats');
    this.stats.hidden = true;
    slot.append(this.root, this.stats);
  }

  /** Колокол: rally — щит идёт (тики), cd — откат (тики), fight — идёт волна */
  setBell(fight: boolean, rally: number, cd: number): void {
    const key = rally > 0 ? `r${Math.ceil(rally / TICK_RATE)}` : fight && cd > 0 ? `c${Math.ceil(cd / TICK_RATE)}` : 'ready';
    if (key === this.bellKey) return;
    this.bellKey = key;
    const icon = fortImg('bell');
    if (rally > 0) this.bell.innerHTML = `${icon}<b class="k-gold">щит · ${Math.ceil(rally / TICK_RATE)} с</b>`;
    else if (key !== 'ready') this.bell.innerHTML = `${icon}<span class="k-dim">колокол · ${Math.ceil(cd / TICK_RATE)} с</span>`;
    else this.bell.innerHTML = `${icon}<b class="k-good">щит готов</b>`;
  }

  setStats(text: string | null): void {
    const t = text ?? '';
    this.stats.hidden = !t;
    setText(this.stats, t);
  }

  reset(): void {
    this.gate.reset();
    this.crystal.reset();
    this.bellKey = '';
  }
}
