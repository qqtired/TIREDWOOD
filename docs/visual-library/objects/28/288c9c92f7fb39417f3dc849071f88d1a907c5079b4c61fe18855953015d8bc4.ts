// Ноты и аккорды для песен автомата: «c4» → MIDI 60, «Am7» → корень и интервалы, раскладка аккорда рядом с прошлой
// (плавное голосоведение), ступени для баса («3» — терция этого аккорда, «7» — его септима).

const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NAMES = ['c', 'c#', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b'];

/** «c4», «f#5», «bb3», «eb4» → MIDI (c4 = 60) */
export function noteMidi(s: string): number {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(s);
  if (!m) throw new Error(`не нота: «${s}»`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export function midiName(m: number): string {
  return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Интервалы от корня (полутона) по качеству аккорда */
const QUALITY: Record<string, readonly number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  '9': [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], '69': [0, 4, 7, 9, 14],
  sus4: [0, 5, 7], sus2: [0, 2, 7], '7sus4': [0, 5, 7, 10], dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
  '13': [0, 4, 10, 14, 21], '7b9': [0, 4, 7, 10, 13], m11: [0, 3, 7, 10, 14, 17], maj7s11: [0, 4, 7, 11, 18],
};

export interface Chord {
  name: string;
  /** Корень, класс высоты 0…11 */
  root: number;
  /** Интервалы от корня */
  iv: readonly number[];
  /** Бас (класс высоты): корень или нота после «/» */
  bass: number;
}

/** «C», «Am7», «F#m7b5», «Bb/D», «G13» */
export function parseChord(s: string): Chord {
  const m = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/.exec(s);
  if (!m || !(m[3] in QUALITY)) throw new Error(`не аккорд: «${s}»`);
  const acc = (a: string | undefined): number => (a === '#' ? 1 : a === 'b' ? -1 : 0);
  const root = (PC[m[1].toLowerCase()] + acc(m[2]) + 12) % 12;
  const bass = m[4] ? (PC[m[4].toLowerCase()] + acc(m[5]) + 12) % 12 : root;
  return { name: s, root, iv: QUALITY[m[3]], bass };
}

/** Классы высот аккорда */
export function chordPcs(c: Chord): number[] {
  return c.iv.map((i) => (c.root + i) % 12);
}

/**
 * Ступень для баса и мелодических рисунков, полутона от корня: 1, 2, 3 (терция аккорда — большая, малая или кварта
 * у sus), 4, 5 (квинта аккорда), 6, 7 (септима аккорда, нет — малая), 8; «b3», «b7», «#4» — как написано.
 */
export function degree(c: Chord, d: string): number {
  const has = (x: number): boolean => c.iv.some((i) => i % 12 === x);
  switch (d) {
    case '1': return 0;
    case '2': return 2;
    case '3': return has(4) ? 4 : has(3) ? 3 : has(5) ? 5 : has(2) ? 2 : 4;
    case '4': return 5;
    case '5': return has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7;
    case '6': return 9;
    case '7': return has(10) ? 10 : has(11) ? 11 : has(9) && c.iv.includes(6) ? 9 : 10;
    case '8': return 12;
    case 'b3': return 3;
    case 'b7': return 10;
    case '#4': return 6;
    case 'b6': return 8;
    case 'b2': return 1;
    default: throw new Error(`ступень? «${d}»`);
  }
}

/** Важность тонов аккорда для раскладки: терция и септима, расширения, корень, квинта */
function weight(iv: number): number {
  const x = iv % 12;
  if (x === 3 || x === 4) return 0;
  if (x === 10 || x === 11 || (x === 9 && iv < 12)) return 1;
  if (iv > 12 || x === 2 || x === 5 || x === 1 || x === 6 || x === 8) return 2;
  if (x === 0) return 3;
  return 4;
}

/**
 * Раскладка аккорда из n голосов в диапазоне [lo, hi], ближе всего к прошлой (prev) или к середине диапазона.
 * Без кластеров: соседние голоса — не ближе тона. Возвращает MIDI по возрастанию.
 */
export function voicing(c: Chord, n: number, lo: number, hi: number, prev: readonly number[] | null): number[] {
  const tones = [...c.iv].sort((a, b) => weight(a) - weight(b) || a - b);
  const pick: number[] = [];
  for (let i = 0; pick.length < n; i++) {
    if (i < tones.length) pick.push((c.root + tones[i]) % 12);
    else pick.push((c.root + tones[(i - tones.length) % tones.length]) % 12);
  }
  const center = prev && prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : (lo + hi) / 2;
  const notes = pick.map((pc) => {
    let best = -1;
    let bestD = Infinity;
    for (let m = lo - (lo % 12) - 12; m <= hi + 12; m += 12) {
      const v = m + pc;
      if (v < lo || v > hi) continue;
      const near = prev && prev.length ? Math.min(...prev.map((p) => Math.abs(p - v))) : 0;
      const d = Math.abs(v - center) * 0.6 + near;
      if (d < bestD) { bestD = d; best = v; }
    }
    return best < 0 ? Math.min(hi, Math.max(lo, lo - (lo % 12) + pc)) : best;
  });
  notes.sort((a, b) => a - b);
  // одинаковые и через полтона — разводим на октаву (вверх, если влезает, иначе вниз)
  for (let i = 1; i < notes.length; i++) {
    if (notes[i] - notes[i - 1] < 2) {
      if (notes[i] + 12 <= hi) notes[i] += 12;
      else if (notes[i - 1] - 12 >= lo) notes[i - 1] -= 12;
      notes.sort((a, b) => a - b);
    }
  }
  return notes;
}

/** Лад тональности: «C» — мажор, «Am» — натуральный минор (+ гармонический VII); классы высот */
export function keyScale(key: string): Set<number> {
  const m = /^([A-G])(#|b)?(m?)$/.exec(key);
  if (!m) throw new Error(`тональность? «${key}»`);
  const root = (PC[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const steps = m[3] ? [0, 2, 3, 5, 7, 8, 10, 11] : [0, 2, 4, 5, 7, 9, 11];
  return new Set(steps.map((s) => (root + s) % 12));
}
