// «Последний паром» — эмо-трэп, си минор, 78 (половинная доля). Мечтательная чистая гитара перебором с хорусом и
// залом, глубокий «808» с глайдами, трэп-хэты с роллами, редкий малый с хлопком на 3, воздушный пэд и лёгкий треск
// пластинки; в припеве — колокольчик-шкатулка, в середине — тихая флейта. Грустно и тепло, как ночной причал.
// Особая песня автомата (дороже обычных). Мелодия, гармония и перебор — свои.
import type { Part, SongDef } from '../song.ts';

const LOOP = 'Bm9 | Gmaj7 | Em9 | F#7sus4 F#7';
/** Перебор: бас аккорда, тихая педаль и нисходящий верхний голос — каждый такт на терцию ниже */
const GTR = [
  'b3/0.5 f#4/0.5? d5/0.5 f#4/0.5? c#5/0.5 f#4/0.5? a4/0.5 f#4/0.5?',
  'g3/0.5 d4/0.5? b4/0.5 d4/0.5? a4/0.5 d4/0.5? f#4/0.5 d4/0.5?',
  'e3/0.5 b3/0.5? g4/0.5 b3/0.5? f#4/0.5 b3/0.5? d4/0.5 b3/0.5?',
  'f#3/0.5 c#4/0.5? b4/0.5 c#4/0.5? a#4/0.5 c#4/0.5? e4/0.5 c#4/0.5?',
];
const GTR_BRIDGE = [
  GTR[1],
  'f#3/0.5 c#4/0.5? a4/0.5 c#4/0.5? e4/0.5 c#4/0.5? f#4/0.5 c#4/0.5?',
  GTR[2],
  GTR[3],
];
const GTR_OUT = [GTR[0], GTR[1], 'e3/0.5 b3/0.5? g4/0.5 b3/0.5? a#3/0.5 c#4/0.5? e4/0.5 c#4/0.5?', 'b3/0.5 f#4/0.5? d5/0.5 f#4/0.5? c#5/2'];
/** Припев: колокольчик-шкатулка, мотив каждый такт на терцию ниже, ответ — выше */
const HOOK = [
  'r/0.5 f#5/0.5 a5/0.5 f#5/1 e5/0.5 d5/1',
  'r/0.5 d5/0.5 f#5/0.5 d5/1 b4/0.5 a4/1',
  'r/0.5 b4/0.5 d5/0.5 b4/1 a4/0.5 g4/1',
  'f#4/2 a#4/1 c#5/1',
  'r/0.5 f#5/0.5 b5/0.5 a5/1 f#5/0.5 e5/1',
  'd5/1.5 e5/0.5 f#5/1 d5/1',
  'e5/1 g5/1 f#5/1 e5/1',
  'c#5/2 a#4/2',
].join(' | ');
const BRIDGE = 'b5/3 a5/1 | a5/2 e5/1 f#5/1 | g5/2 f#5/1 e5/1 | f#5/2 e5/2';
/** «808»: удары с местом под малый на 3, глайды вверх и вниз (нота с «>» скользит из прошлой) */
const BOOM = 'b1/1.5 b1/0.5 r/0.5 b1/0.5 >f#2/1 | g1/1.5 g1/0.5 r/0.5 g1/0.5 >d2/1 | e1/1.5 e1/0.5 r/0.5 e2/0.5 >b1/1 | f#1/1.5 f#1/0.5 r/0.5 >c#2/0.5 >f#2/1';
const BOOM_HOOK = 'b1/0.75 b1/0.75 b1/0.5 r/0.5 b1/0.5 >a1/0.5 >b1/0.5 | g1/0.75 g1/0.75 g1/0.5 r/0.5 g1/0.5 >b1/0.5 >d2/0.5 | e1/0.75 e1/0.75 e2/0.5 r/0.5 e2/0.5 >d2/0.5 >b1/0.5 | f#1/0.75 f#1/0.75 f#1/0.5 r/0.5 c#2/0.5 >e2/0.5 >f#2/0.5';

const x2 = (bars: string[] | string): string => (Array.isArray(bars) ? bars.join(' | ') : bars).concat(' | ', Array.isArray(bars) ? bars.join(' | ') : bars);

// хэты: восьмые, шестнадцатые, ролл тридцать вторыми и триолями (сетка такта — 16, 24 или 32 шага)
const H8 = 'x.x.x.x.x.x.x.x.';
const H16 = 'x.x.x.x.x.xox.x.';
const ROLL32 = 'x...x...x...x...x...x...oxoxoxXx';
const ROLL3 = 'x..x..x..x..x..x..oxoxox';
const CRACKLE = 'x...............';

const guitar = (bars: string[], vel = 0.85): Part => ({ i: 'guitar', mel: bars.join(' | '), vel, len: 2.6 });
const pad = (vel = 0.42): Part => ({ i: 'pad', pad: true, n: 4, lo: 50, hi: 69, vel });

export const parom: SongDef = {
  id: 'parom',
  key: 'Bm',
  gain: 0.73,
  reverb: { wet: 0.36, decay: 3 },
  echo: { beats: 0.75, feedback: 0.36, wet: 0.24, on: ['bell', 'whistle'] },
  chorus: { ms: 12, depth: 3.5, rate: 0.55, wet: 0.55, on: ['guitar'] },
  mix: { guitar: 1.2, boom: 0.265, bell: 0.43, whistle: 0.49, pad: 0.215, trap: 0.4 },
  sections: {
    intro: {
      chords: LOOP,
      parts: [
        guitar(GTR, 0.75),
        { i: 'pad', pad: true, n: 4, lo: 50, hi: 69, vel: 0.3 },
        { kit: 'trap', vel: 0.8, drums: { v: CRACKLE, h: '................|................|................|................x.x.x.x.oxoxoxox' } },
      ],
    },
    verse: {
      chords: `${LOOP} | ${LOOP}`,
      parts: [
        guitar([...GTR, ...GTR]),
        pad(0.35),
        { i: 'boom', mel: x2(BOOM), vel: 0.85, len: 1 },
        {
          kit: 'trap', vel: 0.85,
          drums: { v: CRACKLE, k: 'x.........x.....', s: '........x.......', h: `${H8}|${H16}|${H8}|${ROLL32}` },
          first: { y: 'x...............' },
          fill: { h: ROLL3, s: '........x.....oo' },
        },
      ],
    },
    hook: {
      chords: `${LOOP} | ${LOOP}`,
      parts: [
        { i: 'bell', mel: HOOK, vel: 0.75 },
        guitar([...GTR, ...GTR]),
        pad(0.45),
        { i: 'boom', mel: x2(BOOM_HOOK), vel: 0.9, len: 1 },
        {
          kit: 'trap', vel: 0.9,
          drums: { v: CRACKLE, k: 'x.....x...x.....', s: '........x.......', c: '........x.......', o: '......x.........', h: `${H8}|${ROLL3}|${H16}|${ROLL32}` },
          first: { y: 'x...............' },
        },
      ],
    },
    bridge: {
      chords: 'Gmaj7 | F#m7 | Em9 | F#7sus4 F#7',
      parts: [
        { i: 'whistle', mel: BRIDGE, vel: 0.6 },
        guitar(GTR_BRIDGE, 0.8),
        pad(0.5),
        { i: 'boom', mel: 'g1/4 | f#1/4 | e1/4 | f#1/2 >c#2/1 >f#2/1', vel: 0.8, len: 1 },
        {
          kit: 'trap', vel: 0.8,
          drums: { v: CRACKLE, h: 'x.......x.......|x.......x.......|x...x...x...x...|x.x.x.x.xxxxxxxx' },
          fill: { s: 'x...x...x.x.xxxx', k: 'x...............' },
        },
      ],
    },
    hook2: {
      chords: `${LOOP} | ${LOOP}`,
      parts: [
        { i: 'bell', mel: HOOK, vel: 0.78 },
        { i: 'whistle', mel: HOOK, oct: -1, vel: 0.4 },
        guitar([...GTR, ...GTR]),
        pad(0.5),
        { i: 'boom', mel: x2(BOOM_HOOK), vel: 0.9, len: 1 },
        {
          kit: 'trap', vel: 0.9,
          drums: { v: CRACKLE, k: 'x.....x...x.....', s: '........x.......', c: '........x.......', o: '......x.......x.', h: `${H8}|${ROLL3}|${H16}|${ROLL32}` },
          first: { y: 'x...............' },
          fill: { h: H8, o: '................', s: '........x.......', k: 'x...............' },
        },
      ],
    },
    outro: {
      chords: 'Bm9 | Gmaj7 | Em9 F#7 | Bm9',
      parts: [
        guitar(GTR_OUT, 0.75),
        { i: 'pad', pad: true, n: 4, lo: 50, hi: 69, vel: 0.4 },
        { i: 'boom', mel: 'b1/4 | r/4 | r/4 | r/4', vel: 0.75, len: 1 },
        { kit: 'trap', vel: 0.75, drums: { v: CRACKLE } },
      ],
    },
  },
  form: ['intro', 'verse', 'hook', 'bridge', 'hook2', 'outro'],
};
