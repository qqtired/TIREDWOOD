// Карточка волны «Крепости» без DOM: фишки врагов («×12», новые, элита, чемпионы) и свёртка строки в бою (самые
// многочисленные и новые, остальные — «+N»). Рисует их плашка волны верх-центра — client/fort/ui/wave.ts.
import { ZK, type FortWaveCard } from '../../shared/fort.ts';

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
export function foldChips<T extends CardChip>(chips: readonly T[], max: number): CardChip[] {
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

/** Круг босса: 2 → II */
export function romanTier(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}
