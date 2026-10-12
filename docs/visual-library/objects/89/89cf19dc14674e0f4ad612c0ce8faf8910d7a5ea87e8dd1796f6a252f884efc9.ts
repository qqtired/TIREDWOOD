// «Закат над бухтой» — синти-закат, ля минор, 96. Тёплый пэд, бас пульсирует восьмыми, электропиано перебирает
// шестнадцатыми с эхом, певучий синт-лид, большие барабаны с залом; во втором припеве — струнные. Не неон, а тёплый
// вечер у воды.
import type { Part, SongDef } from '../song.ts';

const VERSE = [
  'e5/1.5 d5/0.5 c5/1 e5/1',
  'a5/2 g5/1 f5/1',
  'e5/1.5 d5/0.5 c5/1 g4/1',
  'b4/2 d5/2',
  'e5/1.5 d5/0.5 c5/1 e5/1',
  'a5/1 c6/1 b5/1 a5/1',
  'g5/1.5 e5/0.5 d5/1 c5/1',
  'd5/3 r/1',
];
const CHORUS = [
  'a5/0.5 c6/1 a5/0.5 c6/1 d6/1',
  'b5/0.5 d6/1 b5/0.5 d6/1 e6/1',
  'e6/2 d6/1 b5/1',
  'c6/3 b5/0.5 a5/0.5',
  'a5/0.5 c6/1 a5/0.5 f5/1 a5/1',
  'b5/0.5 d6/1 b5/0.5 g5/1 b5/1',
  'c6/1.5 b5/0.5 c6/1 e6/1',
  'd6/2 b5/1 g#5/1',
];
const CHORUS_END = [...CHORUS.slice(0, 6), 'c6/1.5 b5/0.5 a5/1 e5/1', 'a5/4'];
const BRIDGE = 'd5/1 f5/1 a5/1 c6/1 | e5/1 g5/1 b5/1 d6/1 | f5/1 a5/1 c6/1 e6/1 | b5/2 d6/2';

const arp: Part = { i: 'epiano', arp: '0/0.25 1/0.25 2/0.25 3/0.25 1/0.25 2/0.25 3/0.25 4/0.25 0/0.25 1/0.25 2/0.25 3/0.25 1/0.25 2/0.25 3/0.25 4/0.25', n: 4, lo: 57, hi: 76, vel: 0.45, len: 0.8 };
const pad: Part = { i: 'pad', pad: true, n: 4, lo: 52, hi: 72, vel: 0.55 };
const sub: Part = { i: 'sub', bass: '1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5', lo: 33, vel: 0.8, len: 0.7 };
const drumsV: Part = {
  kit: 'synth', vel: 0.8,
  drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  fill: { k: 'x.......x.......', s: '....x.......x.xx', h: 'x.x.x.x.x.x.....' },
};
const drumsC: Part = {
  kit: 'synth', vel: 0.85,
  drums: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo' },
  first: { y: 'X...............' },
  fill: { k: 'x...x...x.......', s: '....x...x.x.xxxx', m: '..........x.x...', t: '............x.x.' },
};

export const sunset: SongDef = {
  id: 'sunset',
  key: 'Am',
  gain: 0.93,
  reverb: { wet: 0.3, decay: 2.8 },
  echo: { beats: 0.75, feedback: 0.4, wet: 0.22, on: ['lead', 'epiano'] },
  mix: { lead: 0.6, epiano: 0.18, pad: 0.19, sub: 0.3, strings: 0.17, synth: 0.29 },
  sections: {
    intro: {
      chords: 'Am | F | C | G',
      parts: [
        arp, pad,
        { kit: 'synth', vel: 0.75, drums: { k: '................|................|x.......x.......|x.......x.......', h: '................|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.' }, fill: { s: '............xxxx' } },
      ],
    },
    verse: { chords: 'Am | F | C | G | Am | Fmaj7s11 | C | G', parts: [{ i: 'lead', mel: VERSE.join(' | '), vel: 0.75 }, arp, pad, sub, drumsV] },
    chorus: { chords: 'F | G | Em7 | Am | Dm7 | G | C | E7', parts: [{ i: 'lead', mel: CHORUS.join(' | '), vel: 0.82 }, arp, pad, sub, drumsC] },
    bridge: {
      chords: 'Dm7 | Em7 | Fmaj7 | G',
      parts: [
        { i: 'lead', mel: BRIDGE, vel: 0.75 },
        pad,
        { ...sub, bass: '1/1 1/1 1/1 1/1' },
        { kit: 'synth', vel: 0.8, drums: { k: 'x.......x.......', h: 'x.x.x.x.x.x.x.x.' }, fill: { s: 'x.x.x.x.xxxxXXXX', k: 'x...x...x...x...' } },
      ],
    },
    verse2: {
      chords: 'Am | F | C | G | Am | Fmaj7s11 | C | G',
      parts: [{ i: 'lead', mel: VERSE.join(' | '), vel: 0.78 }, arp, pad, { i: 'strings', pad: true, n: 3, lo: 64, hi: 81, vel: 0.4 }, sub, drumsV],
    },
    chorus2: {
      chords: 'F | G | Em7 | Am | Dm7 | G | Fmaj7 | Am',
      parts: [
        { i: 'lead', mel: CHORUS_END.join(' | '), vel: 0.85 },
        { ...arp, arp: `${arp.arp} | % | % | % | % | % | % | 0/1 r/3` },
        pad,
        { i: 'strings', pad: true, n: 4, lo: 60, hi: 81, vel: 0.45 },
        { ...sub, bass: '1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 | % | % | % | % | % | % | 1/4' },
        { ...drumsC, fill: { k: 'X...............', y: 'X...............', s: '................', c: '................', h: '................' } },
      ],
    },
  },
  form: ['intro', 'verse', 'chorus', 'bridge', 'verse2', 'chorus2'],
};
