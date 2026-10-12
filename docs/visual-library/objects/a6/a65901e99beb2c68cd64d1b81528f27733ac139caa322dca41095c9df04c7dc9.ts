// «Кофе на террасе» — босса-нова, до мажор, 124. Нейлоновая гитара в синкопах «три-три-два», бас «дум… да-дум»,
// щётки и обод с клаве, шейкер шестнадцатыми; мелодия — флейта-свисток, в середине соло электропиано, струнные
// подстилают второй куплет. Концовка — повтор каденции, как в кафе на закате.
import type { Part, SongDef } from '../song.ts';

const A = [
  'e5/1.5 d5/0.5 e5/1 g5/1',
  'b4/1.5 a4/0.5 b4/2',
  'f#5/1.5 e5/0.5 f#5/1 a5/1',
  'c5/1.5 b4/0.5 c5/2',
  'f5/1.5 e5/0.5 f5/1 a5/1',
  'e5/1 f5/0.5 e5/0.5 d5/1 b4/1',
  'g5/1 e5/1 g5/0.5 f5/0.5 e5/0.5 c#5/0.5',
  'd5/1.5 f5/0.5 e5/2',
];
const B = [
  'a5/1.5 g5/0.5 a5/1 c6/1',
  'ab5/1.5 g5/0.5 f5/2',
  'g5/1.5 f#5/0.5 g5/1 b5/1',
  'bb5/1.5 a5/0.5 g5/1 e5/1',
  'f5/1 a5/1 c6/1 a5/1',
  'b5/1 a5/0.5 g5/0.5 f5/1 e5/1',
  'g5/1 e5/1 g5/0.5 f5/0.5 e5/0.5 c#5/0.5',
  'd5/1 f5/1 a5/1 g5/1',
];
const SOLO = [
  'e5/0.5 g5/0.5 b5/0.5 a5/0.5 g5/0.5 e5/0.5 c5/1',
  'f#5/0.5 a5/0.5 c6/0.5 e6/0.5 d6/1 a5/1',
  'f5/0.5 a5/0.5 c6/0.5 e6/0.5 d6/1 a5/1',
  'b5/0.5 a5/0.5 f5/0.5 e5/0.5 d5/1 b4/1',
  'g5/0.5 b5/0.5 d6/0.5 b5/0.5 g5/0.5 e5/0.5 d5/1',
  'c#5/0.5 e5/0.5 g5/0.5 bb5/0.5 a5/1 g5/1',
  'f5/1.5 e5/0.5 d5/1 c5/1',
  'c5/1 d5/1 b4/2',
];

const A_CHORDS = 'Cmaj9 | Cmaj9 | D9 | D9 | Dm9 | G13 | Em7 A7b9 | Dm9 G13';
const guitar = (vel = 0.6): Part => ({ i: 'nylon', comp: 'x/1.5 x/1.5 x/1 | r/0.5 x/1.5 x/1.5 x/0.5', n: 4, lo: 52, hi: 69, strum: 0.008, vel, len: 0.75 });
const bass: Part = { i: 'bass', bass: '1/1.5 1/0.5 5/1.5 5/0.5', lo: 36, vel: 0.75, len: 0.85 };
const drums: Part = {
  kit: 'brush', vel: 0.8,
  drums: { r: 'x.....x.....x...|....x.....x.....', p: 'xoooxoooxoooxooo', k: 'x......ox.......', w: '....x.......x...' },
};

export const bossa: SongDef = {
  id: 'bossa',
  key: 'C',
  gain: 0.64,
  reverb: { wet: 0.2, decay: 1.6 },
  echo: { beats: 1.5, feedback: 0.22, wet: 0.1, on: ['whistle'] },
  mix: { whistle: 0.65, epiano: 0.52, nylon: 0.62, bass: 0.19, strings: 0.22, brush: 0.73 },
  sections: {
    intro: {
      chords: 'Dm9 | G13 | Cmaj9 | A7b9',
      parts: [
        guitar(0.7),
        { i: 'bass', bass: 'r/4 | r/4 | 1/1.5 1/0.5 5/1.5 5/0.5 | 1/1.5 1/0.5 5/1.5 >/0.5', lo: 36, vel: 0.7, len: 0.85 },
        { kit: 'brush', vel: 0.75, drums: { p: 'xoooxoooxoooxooo', r: '................|................|x.....x.....x...|....x.....x.....' } },
      ],
    },
    a: { chords: A_CHORDS, parts: [{ i: 'whistle', mel: A.join(' | '), vel: 0.75 }, guitar(), bass, drums] },
    b: {
      chords: 'Fmaj9 | Fm6 | Em7 | A7b9 | Dm9 | G13 | Em7 A7b9 | Dm9 G13',
      parts: [{ i: 'whistle', mel: B.join(' | '), vel: 0.78 }, guitar(), { i: 'strings', pad: true, n: 4, lo: 55, hi: 74, vel: 0.45 }, bass, drums],
    },
    a2: {
      chords: A_CHORDS,
      parts: [{ i: 'whistle', mel: A.join(' | '), vel: 0.75 }, guitar(), { i: 'strings', pad: true, n: 4, lo: 55, hi: 74, vel: 0.4 }, bass, drums],
    },
    solo: {
      chords: 'Am9 | D9 | Dm9 | G13 | Em7 | A7b9 | Dm9 | G7sus4 G13',
      parts: [{ i: 'epiano', mel: SOLO.join(' | '), vel: 0.8 }, guitar(0.5), bass, drums],
    },
    a3: {
      chords: 'Cmaj9 | D9 | Dm9 G13 | Cmaj9',
      parts: [{ i: 'whistle', mel: 'e5/1.5 d5/0.5 e5/1 g5/1 | f#5/1.5 e5/0.5 f#5/1 a5/1 | f5/1 a5/1 e5/1 d5/1 | e5/4', vel: 0.75 }, guitar(), bass, drums],
    },
    outro: {
      chords: 'Dm9 G13 | Cmaj9 | Dm9 G13 | C69',
      parts: [
        { i: 'whistle', mel: 'f5/1 e5/1 d5/1 b4/1 | c5/4 | f5/1 e5/1 d5/1 b4/1 | c5/4', vel: 0.7 },
        { ...guitar(0.5), comp: 'x/1.5 x/1.5 x/1 | r/0.5 x/1.5 x/1.5 x/0.5 | x/1.5 x/1.5 x/1 | x/4' },
        { i: 'bass', bass: '1/1.5 1/0.5 5/1.5 5/0.5 | % | % | 1/4', lo: 36, vel: 0.7, len: 0.85 },
        { ...drums, fill: { r: '................', p: 'xooox...........', k: 'x...............', w: '................' } },
      ],
    },
  },
  form: ['intro', 'a', 'b', 'a2', 'solo', 'a3', 'outro'],
};
