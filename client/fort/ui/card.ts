// Мини-карта и колокол остаются в углу; ворота и кристалл — в общей верхней панели.
import { TICK_RATE } from '../../../shared/constants.ts';
import { CRYSTAL_TIERS, GATE_TIERS } from '../../../shared/fortarsenal.ts';
import { el, setText } from './dom.ts';
import { fortImg } from './icons.ts';

/** Сколько держится «вздрагивание» после удара, мс */
const HIT_MS = 650;

class HpRow {
  readonly root: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly pips: readonly HTMLElement[];
  private readonly level: HTMLElement;
  private tier = -1;
  private last = '';
  private hitTimer = 0;
  private hpWas = -1;
  private maxWas = -1;
  private readonly tone: string;
  private readonly maxTier: number;
  /** Подпись при нуле: «Ворота пали», «Кристалл пал» */
  private readonly downWord: string;

  constructor(parent: HTMLElement, name: string, icon: string, tone: string, downWord: string, maxTier: number) {
    this.tone = tone;
    this.maxTier = maxTier;
    this.downWord = downWord;
    this.root = el('div', 'ft-hp', parent);
    this.root.setAttribute('aria-label', name);
    this.root.title = name;
    this.root.dataset.structure = icon;
    this.root.insertAdjacentHTML('beforeend', fortImg(icon, 'ft-hp-ic'));
    this.pct = el('b', 'ft-hp-pct', this.root);
    this.bar = el('span', `k-meter ${tone}`, this.root);
    this.bar.innerHTML = '<i class="k-meter-ghost"></i><i class="k-meter-fill"></i>';
    this.level = el('span', 'ft-hp-up', this.root);
    this.level.setAttribute('role', 'img');
    const pips = el('span', 'ft-pips', this.level);
    pips.setAttribute('aria-hidden', 'true');
    this.pips = Array.from({ length: maxTier }, () => el('i', '', pips));
    this.setTier(0);
  }

  /** Реальная ступень укрепления из снимка арсенала, не доля здоровья */
  setTier(tier: number): void {
    if (tier === this.tier) return;
    this.tier = tier;
    for (const [i, pip] of this.pips.entries()) pip.classList.toggle('on', i < tier);
    this.level.setAttribute('aria-label', `Прокачка: ${tier} из ${this.maxTier}`);
    this.level.title = `Прокачка: ${tier} из ${this.maxTier}`;
  }

  set(hp: number, max: number): void {
    if (this.hpWas >= 0 && max === this.maxWas && hp < this.hpWas) this.hurt();
    this.hpWas = hp; this.maxWas = max;
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
    this.hpWas = this.maxWas = -1;
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

  constructor(slot: HTMLElement, structures: HTMLElement) {
    this.root = el('div', 'k-plate ft-fort');
    this.root.dataset.mode = 'fort';
    const box = el('div', 'ft-map', this.root);
    this.map = el('canvas', 'ft-map-cv', box);
    const side = el('div', 'ft-hps', structures);
    this.gate = new HpRow(side, 'Ворота', 'gate', 'k-meter--mode', 'пали', GATE_TIERS);
    this.crystal = new HpRow(side, 'Кристалл', 'crystal', 'k-meter--info', 'пал', CRYSTAL_TIERS);
    this.bell = el('div', 'ft-bell', this.root);
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
