// «Кадриль с притопом» — полька-кадриль, до мажор (трио — фа мажор), 128. Аккордеон заливается восьмыми, туба
// «умпа», мандолина «па», барабан с малым на слабые доли; во второй раз свисток подпевает, в трио — притопы.
import type { Part, SongDef } from '../song.ts';

const A = [
  'e5/0.5 g5/0.5 c6/0.5 g5/0.5 e5/0.5 g5/0.5 c6/1',
  'e6/0.5 d6/0.5 c6/0.5 b5/0.5 c6/1 r/1',
  'd5/0.5 f5/0.5 b5/0.5 f5/0.5 d5/0.5 f5/0.5 b5/1',
  'd6/0.5 c6/0.5 b5/0.5 a5/0.5 b5/1 r/1',
  'g5/0.5 b5/0.5 d6/0.5 b5/0.5 g5/0.5 f5/0.5 d5/1',
  'f5/0.5 e5/0.5 d5/0.5 c5/0.5 b4/1 g4/1',
  'c5/0.5 e5/0.5 g5/0.5 c6/0.5 b5/0.5 d6/0.5 f6/0.5 d6/0.5',
  'c6/1 g5/1 c5/1 r/1',
];
const B = [
  'a5/1 c6/1 a5/0.5 g5/0.5 f5/1',
  'c5/0.5 d5/0.5 e5/0.5 f5/0.5 a5/2',
  'g5/1 e5/1 c5/0.5 d5/0.5 e5/1',
  'c#5/0.5 e5/0.5 a5/0.5 g5/0.5 e5/2',
  'f5/1 a5/1 d6/0.5 c6/0.5 a5/1',
  'b5/1 g5/1 f5/0.5 e5/0.5 d5/1',
  'e5/0.5 g5/0.5 c6/0.5 e6/0.5 c6/1 g5/1',
  'f5/0.5 e5/0.5 d5/0.5 b4/0.5 g4/1 r/1',
];
const TRIO = [
  'a5/1.5 g5/0.5 f5/1 c5/1',
  'd5/1.5 f5/0.5 bb5/2',
  'bb5/1 g5/1 e5/1 c5/1',
  'f5/1 a5/1 r/2',
  'a5/1.5 g5/0.5 f5/1 a5/1',
  'd6/1.5 c6/0.5 bb5/1 f5/1',
  'e5/1 g5/1 c6/1 bb5/1',
  'a5/1 f5/1 r/2',
];
const CODA = 'e5/0.5 g5/0.5 c6/0.5 g5/0.5 e5/0.5 g5/0.5 c6/1 | b5/0.5 d6/0.5 f6/0.5 d6/0.5 b5/1 g5/1 | c6/1 e6/1 d6/1 b5/1 | c6/1 r/1 c5/1 r/1';

const A_CHORDS = 'C | C | G7 | G7 | G7 | G7 | C G7 | C';
const tuba: Part = { i: 'tuba', bass: '1/1 r/1 5,/1 r/1', lo: 36, vel: 0.85, len: 0.7 };
const pah: Part = { i: 'mando', comp: 'r/1 x/1 r/1 x/1', n: 3, lo: 59, hi: 74, vel: 0.55, len: 0.4, strum: 0.008 };
const drums: Part = {
  kit: 'pop', vel: 0.75,
  drums: { k: 'x.......x.......', s: '....x.......x...', h: '..o...o...o...o.' },
  fill: { k: 'x.......x.......', s: '....x...x.x.xxxx', h: '................' },
};

export const polka: SongDef = {
  id: 'polka',
  key: 'C',
  gain: 0.78,
  reverb: { wet: 0.18, decay: 1.4 },
  mix: { accordion: 0.55, whistle: 0.23, tuba: 0.24, mando: 0.96, pop: 0.48 },
  sections: {
    intro: {
      chords: 'C | G7 | C | G7',
      parts: [
        { i: 'accordion', mel: 'r/4 | r/4 | r/4 | r/2 g4/0.5 b4/0.5 d5/0.5 f5/0.5', vel: 0.8 },
        { i: 'accordion', comp: 'r/1 x/1 r/1 x/1 | % | % | r/1 x/1 r/2', n: 3, lo: 55, hi: 67, vel: 0.5, len: 0.4 },
        tuba,
        { kit: 'pop', vel: 0.7, drums: { k: 'x.......x.......', h: '..o...o...o...o.' }, fill: { s: '........x.x.xxxx' } },
      ],
    },
    a: { chords: A_CHORDS, parts: [{ i: 'accordion', mel: A.join(' | '), vel: 0.82 }, pah, tuba, drums] },
    a2: {
      chords: A_CHORDS,
      parts: [{ i: 'accordion', mel: A.join(' | '), vel: 0.85 }, { i: 'whistle', mel: A.join(' | '), vel: 0.5 }, pah, tuba, { ...drums, first: { y: 'X...............' } }],
    },
    b: {
      chords: 'F | F | C | A7 | Dm | G7 | C | G7',
      parts: [{ i: 'accordion', mel: B.join(' | '), vel: 0.82 }, pah, tuba, { ...drums, first: { y: 'x...............' } }],
    },
    trio: {
      chords: 'F | Bb | C7 | F | F | Bb | C7 | F',
      parts: [
        { i: 'accordion', mel: TRIO.join(' | '), vel: 0.85 },
        { i: 'whistle', mel: TRIO.join(' | '), oct: 1, vel: 0.35 },
        pah, tuba,
        {
          kit: 'pop', vel: 0.85,
          drums: {
            k: 'x.......x.......|x.......x.......|x.......x.......|x.......X...X...',
            s: '....x.......x...|....x.......x...|....x.......x...|....x...........',
            c: '................|................|................|........X...X...',
            h: '..o...o...o...o.',
          },
          first: { y: 'X...............' },
        },
      ],
    },
    coda: {
      chords: 'C | G7 | C G7 | C',
      parts: [
        { i: 'accordion', mel: CODA, vel: 0.85 },
        { ...pah, comp: 'r/1 x/1 r/1 x/1 | % | % | X/1 r/1 X/1 r/1' },
        { ...tuba, bass: '1/1 r/1 5,/1 r/1 | % | % | 1/1 r/1 1/1 r/1' },
        { kit: 'pop', vel: 0.85, drums: { k: 'x.......x.......', s: '....x.......x...', h: '..o...o...o...o.' }, fill: { k: 'X.......X.......', c: 'X.......X.......', s: '................', h: '................', y: '........X.......' } },
      ],
    },
  },
  form: ['intro', 'a', 'a2', 'b', 'a2', 'trio', 'coda'],
};
