// «Чайка на доске» — серф-рок, ля минор, 160. Звонкая гитара с эхом и «пружинным» залом, тремоло на длинных нотах,
// органчик в середине, бас бежит восьмыми, барабаны с томами; в середине — брейк на томах.
import type { Part, SongDef } from '../song.ts';

/** Тремоло: нота частыми шестнадцатыми на beats долей (на долю — акцент) */
const trem = (n: string, beats: number): string => Array.from({ length: beats * 4 }, (_, i) => `${n}/0.25${i % 4 === 0 ? '' : '?'}`).join(' ');

const A1 = [
  'e5/1 a5/0.5 g5/0.5 e5/1 c5/0.5 d5/0.5',
  `${trem('e5', 3)} r/0.5 a4/0.5`,
  'd5/1 g5/0.5 f5/0.5 d5/1 b4/0.5 c5/0.5',
  `${trem('d5', 3)} r/0.5 e5/0.5`,
  'c5/1 f5/0.5 e5/0.5 c5/1 a4/0.5 c5/0.5',
  `${trem('c5', 2)} a4/0.5 c5/0.5 d5/0.5 e5/0.5`,
  'g#4/0.5 b4/0.5 d5/0.5 e5/0.5 g#5/1 e5/1',
  'd5/0.5 b4/0.5 g#4/0.5 b4/0.5 e5/2',
];
const A2 = [
  'e5/1 a5/0.5 g5/0.5 e5/1 c5/0.5 d5/0.5',
  `${trem('e5', 2)} g5/0.5 a5/0.5 c6/0.5 b5/0.5`,
  'd6/1 b5/0.5 g5/0.5 d5/1 f5/0.5 g5/0.5',
  `${trem('b5', 2)} a5/0.5 g5/0.5 f5/0.5 e5/0.5`,
  'a5/1 g5/0.5 f5/0.5 e5/0.5 f5/0.5 c5/1',
  'b4/1 d5/0.5 e5/0.5 g#5/1 b5/1',
  trem('a5', 4),
  'a5/1 e5/0.5 c5/0.5 a4/2',
];
const B = [
  `${trem('f5', 2)} e5/0.5 d5/0.5 a4/1`,
  `d5/1 f5/1 ${trem('a5', 2)}`,
  `${trem('e5', 2)} c5/0.5 b4/0.5 a4/1`,
  `a4/1 c5/1 ${trem('e5', 2)}`,
  `${trem('f5', 2)} a5/1 f5/1`,
  `${trem('g5', 2)} b5/1 g5/1`,
  trem('g#5', 4),
  'e5/0.5 d5/0.5 c5/0.5 b4/0.5 a4/0.5 g#4/0.5 e4/1',
];
const OUT = [
  'e5/1 a5/0.5 g5/0.5 e5/1 c5/0.5 d5/0.5',
  'd5/1 g5/0.5 f5/0.5 d5/1 b4/0.5 c5/0.5',
  'c5/1 f5/0.5 e5/0.5 c5/1 a4/0.5 c5/0.5',
  'b4/1 d5/0.5 e5/0.5 g#5/1 b5/1',
  trem('a5', 4),
  `${trem('g5', 2)} b5/1 g5/1`,
  'a5/1 f5/1 g#5/1 e5/1',
  'a5/0.5 e5/0.5 c5/0.5 a4/2.5',
];

const rhythm: Part = { i: 'guitar', comp: 'x/0.5 o/0.5 x/0.5 o/0.5 x/0.5 o/0.5 x/0.5 o/0.5', n: 3, lo: 52, hi: 67, vel: 0.42, len: 0.45, strum: 0.006 };
const bassRun: Part = { i: 'bass', bass: '1/0.5 1/0.5 5/0.5 1/0.5 8/0.5 1/0.5 5/0.5 >/0.5', lo: 38, vel: 0.85, len: 0.8 };
const drumsA: Part = {
  kit: 'surf', vel: 0.85,
  drums: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  first: { y: 'X...............' },
  fill: { s: '....x...xxxx....', m: '............xx..', t: '..............xx', h: 'x.x.x.x.........' },
};

export const surf: SongDef = {
  id: 'surf',
  key: 'Am',
  gain: 0.92,
  reverb: { wet: 0.34, decay: 2.2 },
  echo: { beats: 0.75, feedback: 0.34, wet: 0.24, on: ['guitar'] },
  mix: { guitar: 0.6, accordion: 0.26, bass: 0.11, surf: 0.315 },
  sections: {
    intro: {
      chords: 'Am | Am | Am | E7',
      parts: [
        { i: 'guitar', mel: `${trem('a4', 4)} | ${trem('a4', 4)} | ${trem('c5', 4)} | b4/1 d5/1 e5/1 g#5/1`, vel: 0.8 },
        { i: 'bass', bass: '1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5', lo: 38, vel: 0.75, len: 0.7 },
        { kit: 'surf', vel: 0.8, drums: { k: 'x.......x.......', t: 'o.o.o.o.o.o.o.o.|x.x.x.x.x.x.x.x.|x.x.x.x.xxxxxxxx|................', s: '................|................|................|x.x.x.x.xxxxXXXX' } },
      ],
    },
    a: {
      chords: 'Am | Am | G | G | F | F | E7 | E7 | Am | Am | G | G | F | E7 | Am | Am',
      parts: [{ i: 'guitar', mel: [...A1, ...A2].join(' | '), vel: 0.9 }, rhythm, bassRun, drumsA],
    },
    b: {
      chords: 'Dm | Dm | Am | Am | F | G | E7 | E7',
      parts: [
        { i: 'guitar', mel: B.join(' | '), vel: 0.9 },
        { i: 'accordion', comp: 'r/1 x/1 r/1 x/1', n: 3, lo: 57, hi: 72, vel: 0.55, len: 0.7 },
        rhythm,
        { i: 'bass', bass: '1/1 5/1 8/1 5/0.5 >/0.5', lo: 38, vel: 0.85, len: 0.85 },
        { kit: 'surf', vel: 0.85, drums: { k: 'x.......x.......', s: '....x.......x...', h: 'X.x.X.x.X.x.X.x.' }, first: { y: 'X...............' }, fill: { s: '....x...xxxxXXXX', h: '................' } },
      ],
    },
    a2: {
      chords: 'Am | Am | G | G | F | E7 | Am | Am',
      parts: [{ i: 'guitar', mel: [...A1.slice(0, 4), ...A2.slice(4)].join(' | '), vel: 0.9 }, rhythm, bassRun, drumsA],
    },
    brk: {
      chords: 'Am | Am | Am | E7',
      parts: [
        { i: 'guitar', mel: 'r/4 | r/4 | r/4 | r/2 e4/0.5 g#4/0.5 b4/0.5 d5/0.5', vel: 0.85 },
        { i: 'bass', bass: '1/0.5 1/0.5 b3/0.5 1/0.5 4/0.5 1/0.5 b3/0.5 5/0.5', lo: 38, vel: 0.9, len: 0.75 },
        { kit: 'surf', vel: 0.9, drums: { k: 'x.......x.......', t: 'x.x.xx.xx.x.xx.x', m: '....x.......x...' }, fill: { t: '................', m: '................', s: 'x.x.x.x.xxxxXXXX' } },
      ],
    },
    outro: {
      chords: 'Am | G | F | E7 | Am | G | F E7 | Am',
      parts: [
        { i: 'guitar', mel: OUT.join(' | '), vel: 0.9 },
        { ...rhythm, comp: 'x/0.5 o/0.5 x/0.5 o/0.5 x/0.5 o/0.5 x/0.5 o/0.5 | % | % | % | % | % | % | X/4' },
        { i: 'bass', bass: '1/0.5 1/0.5 5/0.5 1/0.5 8/0.5 1/0.5 5/0.5 >/0.5 | % | % | % | % | % | % | 1/4', lo: 38, vel: 0.85, len: 0.8 },
        { ...drumsA, fill: { k: 'X...............', y: 'X...............', s: '................', h: '................' } },
      ],
    },
  },
  form: ['intro', 'a', 'b', 'a2', 'brk', 'b', 'outro'],
};
