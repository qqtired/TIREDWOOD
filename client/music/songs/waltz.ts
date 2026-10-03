// «Вальс для баркаса» — морской вальс, соль мажор (середина — ми минор), 144, три четверти. Аккордеон с «мюзетом»
// поёт, туба вздыхает на раз, мандолина отвечает «па-па», щётки шуршат; середина — струнные, в репризе колокольчик.
// Кода с минорной субдоминантой — как прощание у причала.
import type { Part, SongDef } from '../song.ts';

const INTRO = ['d5/1 g5/1 b5/1', 'b5/2 g5/1', 'a5/1 g5/1 e5/1', 'f#5/2 d5/1', 'd5/1 g5/1 b5/1', 'e6/2 b5/1', 'c6/1 a5/1 e5/1', 'd5/1 e5/1 f#5/1'];
const A = [
  'd5/2 b4/1', 'g4/1 a4/1 b4/1', 'f#5/2 e5/1', 'd5/2 b4/1',
  'e5/2 g5/1', 'e5/1 d5/1 c5/1', 'b4/1.5 c5/0.5 d5/1', 'g4/3',
  'c5/2 e5/1', 'f#5/1.5 e5/0.5 d5/1', 'b4/2 d5/1', 'g5/2 e5/1',
  'e5/1 c5/1 a4/1', 'c5/1 a4/1 f#4/1', 'g4/1 b4/1 d5/1', 'g5/2 r/1',
];
const B = [
  'b4/2 e5/1', 'g5/1.5 f#5/0.5 e5/1', 'd#5/2 f#5/1', 'a5/2 f#5/1',
  'g5/2 e5/1', 'b5/1.5 a5/0.5 g5/1', 'a5/1 e5/1 c5/1', 'b4/2 d#5/1',
  'e5/2 g5/1', 'd5/1.5 c5/0.5 b4/1', 'c5/1 e5/1 a5/1', 'g5/2 e5/1',
  'c6/2 a5/1', 'b5/1 f#5/1 d#5/1', 'e5/3', 'f#5/1 a5/1 c6/1',
];
const CODA = ['e5/2 g5/1', 'eb5/2 g5/1', 'd5/2 b4/1', 'g#4/1 b4/1 d5/1', 'c5/2 e5/1', 'f#5/1 e5/1 c5/1', 'b4/1.5 a4/0.5 b4/1', 'g4/3'];

const A_CHORDS = 'G | G | Bm | Bm | C | C | G | G | Am | D7 | G | Em | Am | D7 | G | G';
const tuba: Part = { i: 'tuba', bass: '1/1 r/2 | 5,/1 r/2', lo: 36, vel: 0.8, len: 0.8 };
const pah: Part = { i: 'mando', comp: 'r/1 x/1 x/1', n: 3, lo: 59, hi: 74, vel: 0.5, len: 0.6, strum: 0.01 };
const drums: Part = { kit: 'brush', vel: 0.7, drums: { k: 'x.....', w: '..x.x.' } };

export const waltz: SongDef = {
  id: 'waltz',
  key: 'G',
  gain: 0.94,
  reverb: { wet: 0.26, decay: 2 },
  mix: { accordion: 0.55, tuba: 0.2, mando: 0.78, strings: 0.185, bell: 0.17, brush: 0.7 },
  sections: {
    intro: {
      chords: 'G | Em | Am7 | D7 | G | Em | Am7 | D7',
      parts: [{ i: 'accordion', mel: INTRO.join(' | '), vel: 0.7 }, pah, tuba],
    },
    a: { chords: A_CHORDS, parts: [{ i: 'accordion', mel: A.join(' | '), vel: 0.8 }, pah, tuba, drums] },
    b: {
      chords: 'Em | Em | B7 | B7 | Em | Em | Am | B7 | C | G | Am | Em | Am | B7 | Em | D7',
      parts: [{ i: 'accordion', mel: B.join(' | '), vel: 0.8 }, { i: 'strings', pad: true, n: 4, lo: 52, hi: 71, vel: 0.5 }, pah, tuba, drums],
    },
    a2: {
      chords: A_CHORDS,
      parts: [
        { i: 'accordion', mel: A.join(' | '), vel: 0.82 },
        { i: 'bell', mel: A.join(' | '), oct: 1, vel: 0.45 },
        { i: 'strings', pad: true, n: 4, lo: 52, hi: 71, vel: 0.4 },
        pah, tuba, drums,
      ],
    },
    coda: {
      chords: 'C | Cm | G | E7 | Am | D7 | G | G',
      parts: [
        { i: 'accordion', mel: CODA.join(' | '), vel: 0.78 },
        { i: 'strings', pad: true, n: 4, lo: 52, hi: 71, vel: 0.45 },
        { ...pah, comp: 'r/1 x/1 x/1 | % | % | % | % | % | % | x/3' },
        { ...tuba, bass: '1/1 r/2 | 5,/1 r/2 | 1/1 r/2 | 5,/1 r/2 | 1/1 r/2 | 5,/1 r/2 | 1/1 r/2 | 1/3' },
        { ...drums, fill: { k: 'x.....', w: '......' } },
      ],
    },
  },
  form: ['intro', 'a', 'b', 'a2', 'coda'],
};
