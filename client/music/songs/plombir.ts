// «Пломбир на пирсе» — летний поп, ре мажор, 112. Свист ведёт мелодию, маримба — позывной вступления, нейлоновая
// гитара бренчит, в припеве колокольчик дублирует свист, бочка «в пол».
import type { Part, SongDef } from '../song.ts';

const HOOK = 'f#5/0.5 a5/0.5 c#6/0.5 a5/0.5 f#5/0.5 e5/0.5 d5/1 | b4/0.5 d5/0.5 f#5/0.5 d5/0.5 b4/0.5 a4/0.5 g4/1 | f#5/0.5 a5/0.5 c#6/0.5 a5/0.5 f#5/0.5 a5/0.5 e5/1 | d5/0.5 b4/0.5 g4/0.5 b4/0.5 c#5/0.5 e5/0.5 a5/1';
const OUTRO = 'f#5/0.5 a5/0.5 c#6/0.5 a5/0.5 f#5/0.5 e5/0.5 d5/1 | b4/0.5 d5/0.5 f#5/0.5 d5/0.5 b4/0.5 a4/0.5 g4/1 | f#5/0.5 a5/0.5 c#6/0.5 a5/0.5 f#5/0.5 a5/0.5 e5/1 | d5/1 a4/0.5 d5/2.5';
const VERSE = [
  'r/1 a4/0.5 f#4/0.5 a4/0.5 b4/0.5 a4/1',
  'f#4/0.5 e4/0.5 f#4/1 ~/0.5 c#4/0.5 e4/1',
  'r/0.5 b4/0.5 d5/0.5 b4/0.5 d5/0.5 e5/0.5 f#5/1',
  'e5/1.5 c#5/0.5 ~/1 r/1',
  'r/1 a4/0.5 f#4/0.5 a4/0.5 b4/0.5 d5/1',
  'c#5/0.5 b4/0.5 a4/1 ~/0.5 f#4/0.5 a4/1',
  'g4/0.5 a4/0.5 b4/1 d5/0.5 b4/0.5 a4/0.5 g4/0.5',
  'b4/1.5 a4/0.5 c#5/1 e5/1',
].join(' | ');
const CHORUS = [
  'd5/0.5 d5/0.5 b4/0.5 d5/1 e5/0.5 d5/1',
  'c#5/0.5 c#5/0.5 a4/0.5 c#5/1 e5/0.5 c#5/1',
  'a4/0.5 a4/0.5 f#4/0.5 a4/1 c#5/0.5 b4/1',
  'b4/2 r/0.5 a4/0.5 b4/0.5 d5/0.5',
  'e5/0.5 e5/0.5 d5/0.5 e5/1 g5/0.5 e5/1',
  'f#5/1 e5/0.5 c#5/0.5 ~/1 a4/0.5 b4/0.5',
  'd5/1.5 a4/0.5 b4/1 d5/1',
  'e5/1 g5/0.5 f#5/0.5 e5/2',
].join(' | ');
const TAG = 'd5/0.5 d5/0.5 b4/0.5 d5/1 e5/0.5 d5/1 | c#5/0.5 c#5/0.5 a4/0.5 c#5/1 e5/0.5 c#5/1 | a4/0.5 a4/0.5 c#5/1 d5/1 f#5/1 | e5/1 g5/1 e5/1 c#5/1';

const INTRO_CHORDS = 'Dmaj7 | Gmaj7 | Dmaj7 | Gmaj7 A';
const VERSE_CHORDS = 'D | F#m7 | Gmaj7 | A | D | F#m7 | Em7 | G A';
const CHORUS_CHORDS = 'G | A | F#m7 | Bm7 | Em7 | A | D Bm7 | Em7 A';

const strum = (comp: string, vel = 0.62): Part => ({ i: 'nylon', comp, n: 4, lo: 52, hi: 69, strum: 0.014, vel });
const bassV: Part = { i: 'bass', bass: '1/0.75 1/0.25 r/0.5 1/0.5 5/0.5 r/0.5 8/0.5 >/0.5', lo: 33, vel: 0.85, len: 0.85 };
const bassC: Part = { i: 'bass', bass: '1/0.5 1/0.5 1/0.5 8/0.5 1/0.5 1/0.5 5/0.5 >/0.5', lo: 33, vel: 0.85, len: 0.8 };
const drumsVerse: Part = {
  kit: 'pop', vel: 0.85,
  drums: { k: 'x.....x.x.......', c: '....x.......x...', s: '....o.......o...', h: 'o.x.o.x.o.x.o.x.', p: '.o.o.o.o.o.o.o.o' },
  fill: { k: 'x.....x.x...x...', s: '....o.......xoxx', c: '....x...........' },
};
const drumsChorus: Part = {
  kit: 'pop', vel: 0.9,
  drums: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', o: '..x...x...x...x.', p: 'oooooooooooooooo' },
  first: { y: 'X...............' },
  fill: { k: 'x...x...x.......', s: '....x.......x.xx', c: '....x...........', m: '........x.x.....', t: '............x...', o: '..x...x.........' },
};

export const plombir: SongDef = {
  id: 'plombir',
  key: 'D',
  gain: 0.45,
  reverb: { wet: 0.22, decay: 1.8 },
  echo: { beats: 0.75, feedback: 0.3, wet: 0.16, on: ['whistle', 'marimba'] },
  mix: { whistle: 0.75, bell: 0.28, marimba: 0.73, nylon: 0.45, epiano: 0.21, bass: 0.25, pad: 0.31, pop: 0.59 },
  sections: {
    intro: {
      chords: INTRO_CHORDS,
      parts: [
        { i: 'marimba', mel: HOOK, vel: 0.75 },
        strum('x/1 o/0.5 x/1 o/0.5 x/1', 0.5),
        { i: 'bass', bass: '1/2.5 5/1 >/0.5', lo: 33, vel: 0.75 },
        { kit: 'pop', vel: 0.7, drums: { k: 'x.......x.......', p: 'o.x.o.x.o.x.o.x.', h: '..o...o...o...o.' }, fill: { c: '....x.......x.x.', k: 'x.......x.....x.' } },
      ],
    },
    verse: {
      chords: VERSE_CHORDS,
      parts: [{ i: 'whistle', mel: VERSE, oct: 1, vel: 0.8 }, strum('x/0.5 o/0.5 x/0.5 o/0.5 r/0.5 x/0.5 o/0.5 x/0.5'), bassV, drumsVerse],
    },
    chorus: {
      chords: CHORUS_CHORDS,
      parts: [
        { i: 'whistle', mel: CHORUS, oct: 1, vel: 0.85 },
        { i: 'bell', mel: CHORUS, vel: 0.5 },
        strum('x/0.5 o/0.5 x/0.5 x/0.5 o/0.5 x/0.5 o/0.5 x/0.5', 0.68),
        { i: 'epiano', comp: 'x/2 x/2', n: 4, lo: 57, hi: 76, vel: 0.45 },
        bassC, drumsChorus,
      ],
    },
    inter: {
      chords: INTRO_CHORDS,
      parts: [
        { i: 'marimba', mel: HOOK, vel: 0.8 },
        strum('x/0.5 o/0.5 x/0.5 o/0.5 r/0.5 x/0.5 o/0.5 x/0.5'),
        bassV,
        { ...drumsVerse, first: { y: 'x...............' } },
      ],
    },
    verse2: {
      chords: VERSE_CHORDS,
      parts: [
        { i: 'whistle', mel: VERSE, oct: 1, vel: 0.8 },
        { i: 'marimba', arp: '0/0.5 1/0.5 2/0.5 1/0.5 3/0.5 2/0.5 1/0.5 2/0.5', n: 4, lo: 62, hi: 81, vel: 0.32 },
        strum('x/0.5 o/0.5 x/0.5 o/0.5 r/0.5 x/0.5 o/0.5 x/0.5'), bassV, drumsVerse,
      ],
    },
    chorus2: {
      chords: CHORUS_CHORDS,
      parts: [
        { i: 'whistle', mel: CHORUS, oct: 1, vel: 0.88 },
        { i: 'bell', mel: CHORUS, vel: 0.55 },
        strum('x/0.5 o/0.5 x/0.5 x/0.5 o/0.5 x/0.5 o/0.5 x/0.5', 0.68),
        { i: 'pad', pad: true, n: 4, lo: 50, hi: 69, vel: 0.5 },
        bassC, { ...drumsChorus, fill: undefined },
      ],
    },
    tag: {
      chords: 'G | A | F#m7 Bm7 | Em7 A',
      parts: [
        { i: 'whistle', mel: TAG, oct: 1, vel: 0.88 },
        { i: 'bell', mel: TAG, vel: 0.55 },
        strum('x/0.5 o/0.5 x/0.5 x/0.5 o/0.5 x/0.5 o/0.5 x/0.5', 0.68),
        { i: 'pad', pad: true, n: 4, lo: 50, hi: 69, vel: 0.5 },
        bassC,
        { ...drumsChorus, first: undefined, fill: { k: 'x...x...x...x...', s: '....x...x.x.xxxx', c: '....x...........', o: '..x.............' } },
      ],
    },
    outro: {
      chords: 'Dmaj7 | Gmaj7 | Dmaj7 | D',
      parts: [
        { i: 'marimba', mel: OUTRO, vel: 0.8 },
        strum('x/1 o/0.5 x/1 o/0.5 x/1 | x/1 o/0.5 x/1 o/0.5 x/1 | x/1 o/0.5 x/1 o/0.5 x/1 | X/4', 0.55),
        { i: 'pad', pad: true, n: 4, lo: 50, hi: 69, vel: 0.45 },
        { i: 'bass', bass: '1/2 5/2 | 1/2 5/2 | 1/2 5/2 | 1/4', lo: 33, vel: 0.75 },
        { kit: 'pop', vel: 0.75, drums: { k: 'x.......x.......', p: 'o.x.o.x.o.x.o.x.', c: '....x.......x...' }, first: { y: 'X...............' }, fill: { k: 'X...............', y: 'x...............', p: '................', c: '................' } },
      ],
    },
  },
  form: ['intro', 'verse', 'chorus', 'inter', 'verse2', 'chorus2', 'tag', 'outro'],
};
