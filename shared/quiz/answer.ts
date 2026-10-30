/** Общая проверка ответа «Ракушки» (brief.md: «Проверка ответа»). Без словарей и морфологии. */
const NUMBERS = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять',
  'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать', 'двадцать'];
const SMALL = new Set(['и', 'а', 'но', 'в', 'во', 'на', 'с', 'со', 'к', 'ко', 'у', 'о', 'об', 'от', 'до', 'из', 'за', 'по', 'под', 'над', 'для', 'же', 'ли', 'бы']);

function words(text: string): string[] {
  return text.normalize('NFC').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean).map(w => {
    const n = NUMBERS.indexOf(w);
    return n >= 0 ? String(n) : w === 'одна' || w === 'одно' ? '1' : w === 'две' ? '2' : w;
  });
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + Number(a[i - 1] !== b[j - 1]));
    prev = row;
  }
  return prev[b.length];
}

export function checkAnswer(text: string, answer: string): 'yes' | 'near' | 'no' {
  const guess = words(text);
  if (!guess.length) return 'no';
  let near = false;
  for (const raw of answer.replace(/\(\s*принимается\s*:[^)]*\)/gi, ' ').split('/')) {
    const all = words(raw);
    const significant = all.filter(w => !SMALL.has(w));
    const target = significant.length ? significant : all;
    if (!target.length) continue;
    const left = [...guess];
    let edits = 0;
    // Сначала точные слова: они не должны достаться похожему слову раньше своего.
    const missing = target.filter(w => {
      const i = left.indexOf(w);
      if (i < 0) return true;
      left.splice(i, 1); return false;
    });
    if (!missing.length) return 'yes';
    for (const w of missing) {
      let best = Infinity, index = -1;
      left.forEach((g, i) => { const d = distance(g, w); if (d < best) { best = d; index = i; } });
      edits += best;
      if (index >= 0) left.splice(index, 1);
    }
    const length = target.join('').length;
    const limit = length >= 8 ? 2 : length >= 4 ? 1 : 0;
    if (limit && edits <= limit) near = true;
  }
  return near ? 'near' : 'no';
}
