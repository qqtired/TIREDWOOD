// Карточка волны «Крепости»: в бою — что идёт (значки и число), откуда (стрелки дорог, якорь десанта), элита, босс,
// событие; в передышке — «Дальше: волна N» с тем же набором. В начале волны — крупное «ВОЛНА N» на полторы секунды,
// которое уезжает в полосу, и для нового врага — карточка «Новый враг: кто — как с ним быть» (раз за посещение).
import { ZK, type FortWaveCard } from '../../shared/fort.ts';
import { EV_FOG, EV_GOLD, EV_METEORS, EV_SUPPLY } from '../../shared/fortwaves.ts';

/** Дороги: 0 — запад, 1 — север, 2 — восток */
const ROAD_ARROW = ['↖ З', '⬆ С', '↗ В'];

export const EVENT_INFO: Readonly<Record<number, { icon: string; name: string; hint: string }>> = {
  [EV_METEORS]: { icon: '☄', name: 'Метеоры', hint: 'красные круги бьют всех — держи орду подальше от ворот' },
  [EV_SUPPLY]: { icon: '📦', name: 'Сброс припасов', hint: 'ящик с жёлтым дымом — подбери (E)' },
  [EV_GOLD]: { icon: '🌟', name: 'Золотая лихорадка', hint: 'враги быстрее, награда ×2' },
  [EV_FOG]: { icon: '🌫', name: 'Морской туман', hint: 'видно недалеко — смотри на светящиеся глаза' },
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** Строка фишек для карточки: «🧟 ×12 · 🏃 ×5 …» — и для подсказок, и для тестов */
export function cardChips(card: FortWaveCard): Array<{ icon: string; n: number; name: string; cls: string }> {
  const out: Array<{ icon: string; n: number; name: string; cls: string }> = [];
  for (let i = 0; i + 1 < card.chips.length; i += 2) {
    const k = ZK[card.chips[i]];
    if (k) out.push({ icon: k.icon, n: card.chips[i + 1], name: k.name, cls: card.fresh.includes(card.chips[i]) ? 'fresh' : '' });
  }
  if (card.elite > 0) out.push({ icon: '★', n: card.elite, name: 'элита: толще и злее, награда ×2', cls: 'elite' });
  if (card.champ > 0) out.push({ icon: '✪', n: card.champ, name: 'чемпионы: ×6 HP, награда ×5', cls: 'champ' });
  return out;
}

export class WaveCardView {
  readonly root: HTMLElement;
  private readonly head: HTMLElement;
  private readonly title: HTMLElement;
  private readonly chips: HTMLElement;
  private readonly from: HTMLElement;
  private readonly intro: HTMLElement;
  private readonly fresh: HTMLElement;
  private key = '';
  private introTimer = 0;
  private freshTimer = 0;
  /** Кого уже представили в это посещение */
  private readonly met = new Set<number>();

  constructor(briefing: HTMLElement, hudRoot: HTMLElement) {
    this.root = el('div', 'ft-card', briefing);
    this.root.setAttribute('aria-live', 'polite');
    this.head = el('span', 'ft-card-head', this.root);
    this.title = el('b', 'ft-card-title', this.root);
    this.chips = el('span', 'ft-card-chips', this.root);
    this.from = el('span', 'ft-card-from', this.root);
    this.intro = el('div', 'ft-intro', hudRoot);
    this.fresh = el('div', 'ft-fresh', hudRoot);
  }

  /** Карточка: next — это следующая волна (передышка), иначе идущая */
  set(card: FortWaveCard | null, next: boolean): void {
    const key = card ? `${next}|${JSON.stringify(card)}` : '';
    if (key === this.key) return;
    this.key = key;
    this.root.hidden = !card;
    if (!card) return;
    this.head.textContent = next ? `Дальше: волна ${card.w}` : `Волна ${card.w}`;
    this.title.textContent = card.title;
    this.root.classList.toggle('boss', card.boss >= 0);
    this.chips.textContent = '';
    for (const c of cardChips(card)) {
      const chip = el('i', `ft-chip ${c.cls}`, this.chips);
      chip.title = c.name;
      el('span', 'ft-chip-icon', chip, c.icon);
      el('span', 'ft-chip-n', chip, `×${c.n}`);
    }
    if (card.boss >= 0) {
      const k = ZK[card.boss];
      const chip = el('i', 'ft-chip boss', this.chips);
      chip.title = k ? `${k.name}: ${k.hint}` : '';
      el('span', 'ft-chip-icon', chip, k?.icon ?? '👑');
      el('span', 'ft-chip-n', chip, card.tier > 0 ? romanTier(card.tier + 1) : 'босс');
    }
    const from: string[] = card.roads.map((r) => ROAD_ARROW[r] ?? '');
    if (card.boats > 0) from.push(`⚓ ${card.boats} × ${card.crew}`);
    const ev = EVENT_INFO[card.event];
    if (ev) from.push(`${ev.icon} ${ev.name}`);
    if (card.early) from.push('🔔 +10 % золота');
    this.from.textContent = from.join('  ');
  }

  /**
   * Начало волны: крупный номер на полторы секунды (intro; в игре его показывает баннер FortUi) и знакомство с
   * новыми врагами и событием.
   */
  announce(card: FortWaveCard, intro = true): void {
    const ev = EVENT_INFO[card.event];
    if (intro) {
      this.intro.innerHTML = '';
      el('b', 'ft-intro-n', this.intro, `ВОЛНА ${card.w}`);
      el('span', 'ft-intro-title', this.intro, card.title + (ev ? ` · ${ev.icon} ${ev.name}` : ''));
      this.intro.classList.remove('show', 'boss');
      void this.intro.offsetWidth;
      this.intro.classList.add('show');
      this.intro.classList.toggle('boss', card.boss >= 0);
      clearTimeout(this.introTimer);
      this.introTimer = window.setTimeout(() => this.intro.classList.remove('show'), card.boss >= 0 ? 2600 : 1600);
    }
    const fresh = card.fresh.filter((k) => !this.met.has(k));
    if (card.boss >= 0 && !this.met.has(card.boss)) fresh.push(card.boss);
    if (!fresh.length && !ev) return;
    this.fresh.innerHTML = '';
    for (const k of fresh) {
      this.met.add(k);
      const z = ZK[k];
      if (!z) continue;
      const row = el('div', 'ft-fresh-row', this.fresh);
      el('span', 'ft-fresh-icon', row, z.icon);
      const text = el('span', 'ft-fresh-text', row);
      el('b', '', text, `Новый враг: ${z.name}`);
      el('span', '', text, z.hint);
    }
    if (ev) {
      const row = el('div', 'ft-fresh-row event', this.fresh);
      el('span', 'ft-fresh-icon', row, ev.icon);
      const text = el('span', 'ft-fresh-text', row);
      el('b', '', text, ev.name);
      el('span', '', text, ev.hint);
    }
    this.fresh.classList.remove('show');
    void this.fresh.offsetWidth;
    this.fresh.classList.add('show');
    clearTimeout(this.freshTimer);
    this.freshTimer = window.setTimeout(() => this.fresh.classList.remove('show'), 7000);
  }

  hideAll(): void {
    this.set(null, false);
    this.intro.classList.remove('show');
    this.fresh.classList.remove('show');
  }

  /** Новая игра — знакомим заново */
  reset(): void {
    this.met.clear();
  }
}

/** Круг босса: 2 → II */
export function romanTier(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}
