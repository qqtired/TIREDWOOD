// Помощники станций радио на лодке: детерминированный случай (одно и то же у всех слушателей), выбор вариантов и
// «мелодия по аккордам» — на сильных долях звуки аккорда, между ними шаги по ладу, фраза садится на долгую ноту.
// Всё — строками нотного формата автомата (client/music/song.ts): дальше их собирает и проверяет compileSong.
import { chordPcs, midiName, parseChord, type Chord } from '../music/theory.ts';

export type Rng = () => number;

/** Случай от строки и номера: тот же вход — те же числа у всех клиентов */
export function rngOf(seed: string, n: number): Rng {
  let h = 2166136261 ^ (n * 2654435761);
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (n >>> 13), 2246822507);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function pick<T>(r: Rng, a: readonly T[]): T {
  return a[Math.floor(r() * a.length) % a.length];
}

/** Такт n раз через «|» */
export function rep(bar: string, n: number): string {
  return Array.from({ length: n }, () => bar).join(' | ');
}

/** Аккорды по тактам: «Am | F G | C:3 E7:1» → для каждого такта [{аккорд, с доли, долей}] */
export function chordBars(chords: string, meter: number): Array<Array<{ chord: Chord; b: number; beats: number }>> {
  const out: Array<Array<{ chord: Chord; b: number; beats: number }>> = [];
  for (const raw of chords.split('|')) {
    const s = raw.trim();
    if (s === '%' && out.length) { out.push(out[out.length - 1]); continue; }
    const items = s.split(/\s+/).filter(Boolean).map((tk) => {
      const [c, b] = tk.split(':');
      return { chord: parseChord(c), beats: b ? Number(b) : NaN };
    });
    const fixed = items.reduce((a, it) => a + (Number.isNaN(it.beats) ? 0 : it.beats), 0);
    const free = items.filter((it) => Number.isNaN(it.beats)).length;
    let b = 0;
    out.push(items.map((it) => {
      const beats = Number.isNaN(it.beats) ? (meter - fixed) / free : it.beats;
      const row = { chord: it.chord, b, beats };
      b += beats;
      return row;
    }));
  }
  return out;
}

export interface MelodyOpts {
  /** Классы высот лада (пентатоника — без «кислых» нот) */
  scale: readonly number[];
  lo: number;
  hi: number;
  /** Ритмы тактов: «n/1 r/0.5 n/0.5 …» — n заменится нотой, r — пауза; на каждый такт выбирается случайный */
  rhythms: readonly string[];
  /** Ритм последнего такта фразы (каждые phrase тактов): долгая нота на аккорде */
  cadence?: readonly string[];
  phrase?: number;
  /** С какой высоты начать (около неё) */
  start?: number;
  /** Доля тактов-пауз (тишина между фразами), 0…1 */
  rest?: number;
}

/**
 * Мелодия по аккордам: на долях и на долгих нотах — звук аккорда (ближайший к прошлой ноте), между — шаг по ладу в
 * текущем направлении; у края диапазона и иногда случайно направление меняется. Возвращает такты через «|».
 */
export function genMelody(r: Rng, chords: string, meter: number, o: MelodyOpts): string {
  const bars = chordBars(chords, meter);
  const phrase = o.phrase ?? 4;
  const inScale = (m: number): boolean => o.scale.includes(((m % 12) + 12) % 12);
  let prev = o.start ?? Math.round((o.lo + o.hi) / 2);
  let dir = r() < 0.5 ? -1 : 1;
  const out: string[] = [];
  bars.forEach((bar, i) => {
    const last = (i + 1) % phrase === 0;
    if (!last && o.rest && r() < o.rest) { out.push(`r/${meter}`); return; }
    const rhythm = last && o.cadence ? pick(r, o.cadence) : pick(r, o.rhythms);
    let b = 0;
    const toks: string[] = [];
    for (const tk of rhythm.split(/\s+/).filter(Boolean)) {
      const [head, len] = tk.split('/');
      const beats = Number(len);
      if (head === 'r') { toks.push(`r/${len}`); b += beats; continue; }
      const ch = bar.reduce((a, c) => (c.b <= b + 1e-6 ? c : a), bar[0]).chord;
      const pcs = chordPcs(ch);
      const strong = Math.abs(b - Math.round(b)) < 1e-6 || beats >= 1;
      let m = prev;
      if (strong) {
        // звук аккорда рядом с прошлой нотой (из лада, если можно), чуть в сторону направления
        let best = prev;
        let bestD = Infinity;
        for (let x = o.lo; x <= o.hi; x++) {
          if (!pcs.includes(x % 12)) continue;
          const d = Math.abs(x - (prev + dir * 2)) + (inScale(x) ? 0 : 1.5) + r() * 2.5;
          if (d < bestD) { bestD = d; best = x; }
        }
        m = best;
      } else {
        // шаг по ладу: на 1–2 ступени в сторону dir
        const steps = r() < 0.75 ? 1 : 2;
        let x = prev;
        for (let s = 0; s < steps; s++) {
          do x += dir; while (!inScale(x) && x > o.lo - 12 && x < o.hi + 12);
        }
        m = x;
      }
      if (m >= o.hi - 1 || m <= o.lo + 1 || r() < 0.18) dir = -dir;
      m = Math.max(o.lo, Math.min(o.hi, m));
      prev = m;
      toks.push(`${midiName(m)}/${len}`);
      b += beats;
    }
    out.push(toks.join(' '));
  });
  return out.join(' | ');
}
