// Текст для общих деталей режимов (client/ui/kit/modes.ts) — без DOM, чтобы проверять в тестах (test/ui-modes.test.ts).

/**
 * Строка награды сервера → крупное число и подпись: «+40 жетонов за второе место» → { plus: '+40', rest: 'жетонов за второе место' },
 * «🪙 +12 · лучший защитник» → { plus: '+12', rest: '· лучший защитник' }. Без «+N» в начале — null (покажем строку как есть).
 */
export function rewardParts(text: string): { plus: string; rest: string } | null {
  const m = /^\s*(?:\u{1FA99}️?\s*)?\+(\d[\d\s ]*\d|\d)\s*(?:\u{1FA99}️?)?\s*(.*)$/u.exec(text);
  if (!m) return null;
  return { plus: `+${m[1].replace(/[\s ]/g, ' ').trim()}`, rest: m[2].trim() || 'жетонов' };
}
