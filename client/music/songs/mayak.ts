// «Сонный маяк» — лоу-фай, до мажор (с фа-минорной грустинкой), 78, свинг шестнадцатыми. Ленивые аккорды
// электропиано вразвалку, тёплый бас, мягкие барабаны; мелодию ведёт тихая флейта-свисток, потом колокольчик — как
// огонёк маяка в сумерках.
import type { Part, SongDef } from '../song.ts';

const A_MEL = [
  'r/0.5 c5/0.5 e5/0.5 g5/1.5 e5/0.5 c5/0.5',
  'd5/1 b4/0.5 g4/0.5 ~/1 r/1',
  'r/0.5 a4/0.5 c5/0.5 e5/1.5 d5/0.5 c5/0.5',
  'b4/1.5 g4/0.5 e4/2',
  'r/0.5 c5/0.5 e5/0.5 g5/1 a5/0.5 g5/0.5 e5/0.5',
  'd5/1.5 e5/0.25 d5/0.25 b4/1 g4/1',
  'a4/0.5 c5/0.5 f5/0.5 e5/1 d5/0.5 c5/1',
  'd5/2 b4/1 r/1',
];
const B_MEL = [
  'e5/0.5 g5/0.5 b5/1 a5/0.5 g5/0.5 e5/1',
  'f5/1.5 e5/0.5 d5/1 c5/1',
  'b4/0.5 d5/0.5 f5/0.5 a5/1.5 g5/0.5 e5/0.5',
  'e5/3 r/1',
  'c5/0.5 e5/0.5 g5/1 b5/1 a5/1',
  'a5/1.5 g5/0.5 f5/1 e5/1',
  'ab5/1.5 g5/0.5 f5/1 d5/1',
  'c5/2 b4/2',
];

const keys = (vel = 0.6): Part => ({ i: 'epiano', comp: 'x/1.5 o/1 r/0.5 o/1', n: 4, lo: 55, hi: 74, strum: 0.022, vel, len: 0.95 });
const bass: Part = { i: 'bass', bass: '1/1.5 1/0.5 r/1 5/0.5 >/0.5', lo: 36, vel: 0.8, len: 0.9 };
const pad: Part = { i: 'pad', pad: true, n: 4, lo: 53, hi: 72, vel: 0.45 };
const drums: Part = {
  kit: 'lofi', vel: 0.8,
  drums: { k: 'x.........x..x..', s: '....x.......x...', h: 'x.xox.x.x.xox.x.' },
  fill: { k: 'x.........x.....', s: '....x.......x.oo', h: 'x.xox.x.x.x.....' },
};

export const mayak: SongDef = {
  id: 'mayak',
  key: 'C',
  swing: 0.28,
  swingUnit: 0.25,
  gain: 0.63,
  reverb: { wet: 0.3, decay: 2.6 },
  echo: { beats: 0.75, feedback: 0.36, wet: 0.2, on: ['bell', 'whistle'] },
  mix: { whistle: 0.7, bell: 0.6, epiano: 0.25, bass: 0.22, pad: 0.27, lofi: 0.77 },
  sections: {
    intro: {
      chords: 'Fmaj9 | Em7 | Dm9 | Cmaj7',
      parts: [
        keys(0.5), pad,
        { i: 'bass', bass: 'r/4 | r/4 | 1/1.5 1/0.5 r/1 5/0.5 >/0.5 | 1/1.5 1/0.5 r/1 5/0.5 >/0.5', lo: 36, vel: 0.75, len: 0.9 },
        { kit: 'lofi', vel: 0.75, drums: { h: '................|x.x.x.x.x.x.x.x.|x.xox.x.x.xox.x.|x.xox.x.x.xox.x.', k: '................|................|x.........x..x..|x.........x.....', s: '................|................|....x.......x...|....x.......x.oo' } },
      ],
    },
    a: {
      chords: 'Fmaj9 | Em7 | Dm9 | Cmaj7 | Fmaj9 | Em7 | Dm9 | G7sus4 G7',
      parts: [{ i: 'whistle', mel: A_MEL.join(' | '), vel: 0.75 }, keys(), pad, bass, drums],
    },
    b: {
      chords: 'Am9 | Dm9 | G13 | Cmaj9 | Am9 | Dm9 | Fm6 | G7sus4 G7',
      parts: [{ i: 'bell', mel: B_MEL.join(' | '), vel: 0.7 }, keys(), pad, bass, drums],
    },
    a2: {
      chords: 'Fmaj9 | Em7 | Dm9 | Cmaj7',
      parts: [{ i: 'whistle', mel: A_MEL.slice(0, 4).join(' | '), vel: 0.75 }, { i: 'bell', mel: A_MEL.slice(0, 4).join(' | '), oct: 1, vel: 0.3 }, keys(), pad, bass, drums],
    },
    outro: {
      chords: 'Fmaj9 | Em7 | Dm9 | Cmaj9',
      parts: [
        { i: 'bell', mel: 'r/2 g5/1 e5/1 | d5/2 b4/2 | r/2 e5/1 d5/1 | c5/4', vel: 0.7 },
        { ...keys(0.5), comp: 'x/1.5 o/1 r/0.5 o/1 | % | % | x/4' },
        pad,
        { i: 'bass', bass: '1/1.5 1/0.5 r/1 5/0.5 >/0.5 | % | % | 1/4', lo: 36, vel: 0.75, len: 0.9 },
        { kit: 'lofi', vel: 0.7, drums: { k: 'x.........x..x..|x.........x..x..|x.........x.....|x...............', s: '....x.......x...|....x.......x...|....x...........|................', h: 'x.xox.x.x.xox.x.|x.xox.x.x.xox.x.|x.x.x.x.x.x.x.x.|................' } },
      ],
    },
  },
  form: ['intro', 'a', 'b', 'a2', 'outro'],
};
