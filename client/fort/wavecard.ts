// Карточка волны «Крепости»: в передышке — «Дальше: волна N» целиком: что идёт (значки и число), откуда (стрелки дорог,
// якорь десанта), элита, босс, событие. В бою — одна строка: тема, самые многочисленные враги (остальные — «+N»), элита,
// босс и коротко «откуда»; номер волны — в верхней полосе. В начале волны — крупное «ВОЛНА N» на полторы секунды
// и для нового врага — карточка «Новый враг: кто — как с ним быть» (раз за посещение).
import { ZK, type FortWaveCard } from '../../shared/fort.ts';
import { EV_FOG, EV_GOLD, EV_METEORS, EV_SUPPLY } from '../../shared/fortwaves.ts';

/** Дороги: 0 — запад, 1 — север, 2 — восток */
const ROAD_ARROW = ['↖ З', '⬆ С', '↗ В'];
/** В бою — сколько типов врагов в строке (на узком экране меньше), остальные — фишкой «+N» */
const FIGHT_KINDS = 5;
const FIGHT_KINDS_NARROW = 2;

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

export interface CardChip {
  icon: string;
  n: number;
  name: string;
  cls: string;
  /** Подпись вместо «×n» */
  label?: string;
}

/** Строка фишек для карточки: «🧟 ×12 · 🏃 ×5 …» — и для подсказок, и для тестов */
export function cardChips(card: FortWaveCard): CardChip[] {
  const out: CardChip[] = [];
  for (let i = 0; i + 1 < card.chips.length; i += 2) {
    const k = ZK[card.chips[i]];
    if (k) out.push({ icon: k.icon, n: card.chips[i + 1], name: k.name, cls: card.fresh.includes(card.chips[i]) ? 'fresh' : '' });
  }
  if (card.elite > 0) out.push({ icon: '★', n: card.elite, name: 'элита: толще и злее, награда ×2', cls: 'elite' });
  if (card.champ > 0) out.push({ icon: '✪', n: card.champ, name: 'чемпионы: ×6 HP, награда ×5', cls: 'champ' });
  return out;
}

/**
 * Бой — одна строка: из типов врагов — новые и самые многочисленные (фишки уже по убыванию числа), не больше max;
 * остальные — одной фишкой «+N» (N — сколько их всего, имена — в подсказке). Элита и чемпионы — как есть.
 */
export function foldChips(chips: readonly CardChip[], max: number): CardChip[] {
  const isTier = (c: CardChip) => c.cls === 'elite' || c.cls === 'champ';
  const kinds = chips.filter((c) => !isTier(c));
  if (kinds.length <= max + 1) return chips.slice();
  const keep = new Set<CardChip>();
  for (const c of kinds) if (c.cls === 'fresh' && keep.size < max) keep.add(c);
  for (const c of kinds) if (keep.size < max) keep.add(c);
  const rest = kinds.filter((c) => !keep.has(c));
  const n = rest.reduce((a, c) => a + c.n, 0);
  return [
    ...kinds.filter((c) => keep.has(c)),
    { icon: '', n, name: `ещё: ${rest.map((c) => `${c.name} ×${c.n}`).join(', ')}`, cls: 'more', label: `+${n}` },
    ...chips.filter(isTier),
  ];
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
    const narrow = window.innerWidth <= 720;
    const key = card ? `${next}|${narrow}|${JSON.stringify(card)}` : '';
    if (key === this.key) return;
    this.key = key;
    this.root.hidden = !card;
    if (!card) return;
    const fight = !next;
    this.root.classList.toggle('fight', fight);
    this.head.textContent = next ? `Дальше: волна ${card.w}` : `Волна ${card.w}`;
    this.title.textContent = card.title;
    this.root.classList.toggle('boss', card.boss >= 0);
    this.chips.textContent = '';
    const chips = cardChips(card);
    for (const c of fight ? foldChips(chips, narrow ? FIGHT_KINDS_NARROW : FIGHT_KINDS) : chips) {
      const chip = el('i', `ft-chip ${c.cls}`, this.chips);
      chip.title = c.name;
      if (c.icon) el('span', 'ft-chip-icon', chip, c.icon);
      el('span', 'ft-chip-n', chip, c.label ?? `×${c.n}`);
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
    this.from.textContent = fight ? short(from) : from.join('  ');
    this.from.title = fight ? from.join(' · ') : '';
  }

  /** Начало волны: крупный номер на полторы секунды и знакомство с новыми врагами */
  announce(card: FortWaveCard): void {
    const ev = EVENT_INFO[card.event];
    this.intro.innerHTML = '';
    el('b', 'ft-intro-n', this.intro, `ВОЛНА ${card.w}`);
    el('span', 'ft-intro-title', this.intro, card.title + (ev ? ` · ${ev.icon} ${ev.name}` : ''));
    this.intro.classList.remove('show', 'boss');
    void this.intro.offsetWidth;
    this.intro.classList.add('show');
    this.intro.classList.toggle('boss', card.boss >= 0);
    clearTimeout(this.introTimer);
    this.introTimer = window.setTimeout(() => this.intro.classList.remove('show'), card.boss >= 0 ? 2600 : 1600);
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

/** «⬆ С  ⚓ 3 × 8  ☄ Метеоры» → «⬆ ⚓3 ☄» для строки в бою */
function short(from: readonly string[]): string {
  return from.map((s) => (s.startsWith('⚓') ? `⚓${s.split(' ')[1]}` : s.split(' ')[0])).join(' ');
}

/** Круг босса: 2 → II */
export function romanTier(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}
