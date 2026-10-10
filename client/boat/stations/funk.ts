// «Морской фанк» — радио для прогулки с друзьями: курортный фанк и диско, ля минор (дорийский) и до мажор, 112 уд/мин.
// Упругий бас шестнадцатыми, «чикен-скретч» электрогитары, электропиано, хлопки и открытые хэты, медь из «суперпилы»
// и синт-соло; в куплете маримба отвечает короткими фразами. Середина между гоночным «Форсажем» и сонной «Заводью»:
// под неё приятно идти вдоль берега всей компанией. Круг из 12 отрезков (~3,5 мин), тональность — по кругам.
import type { Part, Section } from '../../music/song.ts';
import { genMelody, pick, type Rng } from '../radiogen.ts';
import type { StationDef } from '../radiostream.ts';

const VAMP = ['Am7 | D9 | Am7 | D9 | Am7 | D9 | Fmaj7 | E7', 'Am7 | Am7 | D9 | D9 | Fmaj7 | Em7 | Dm7 | E7'];
const HOOK = 'Fmaj7 | Em7 | Dm7 | Em7 | Fmaj7 | Em7 | Dm7 G | Am7';
const BRIDGE = 'Fmaj7 | G | Em7 | Am7 | Dm7 | G | Cmaj7 | E7';

const HOOK_LEAD = [
  'a5/0.5 g5/0.25 a5/0.25 r/0.5 c6/0.5 a5/0.5 g5/0.5 e5/1',
  'g5/0.75 e5/0.25 r/1 d5/0.5 e5/0.5 g5/1',
  'f5/0.5 e5/0.25 f5/0.25 r/0.5 a5/0.5 f5/0.5 e5/0.5 d5/1',
  'e5/1.5 r/0.5 g5/0.5 b5/0.5 d6/1',
  'a5/0.5 g5/0.25 a5/0.25 r/0.5 c6/0.5 a5/0.5 g5/0.5 e5/1',
  'g5/0.75 e5/0.25 r/1 b5/0.5 a5/0.5 g5/1',
  'f5/0.5 a5/0.5 d6/1 b5/0.5 g5/0.5 f5/1',
  'e5/1.5 r/0.5 a4/0.5 c5/0.5 e5/0.5 g5/0.5',
].join(' | ');
const HOOK_BRASS = [
  'c5/0.25 c5/0.25 r/0.5 a4/0.5 c5/0.5 r/1 f5/0.5 e5/0.5',
  'd5/0.5 e5/0.5 r/1 b4/0.5 d5/0.5 r/1',
  'c5/0.25 c5/0.25 r/0.5 a4/0.5 c5/0.5 r/1 f5/0.5 e5/0.5',
  'd5/0.5 e5/0.5 g5/0.5 b5/0.5 r/2',
  'c5/0.25 c5/0.25 r/0.5 a4/0.5 c5/0.5 r/1 f5/0.5 e5/0.5',
  'd5/0.5 e5/0.5 r/1 b4/0.5 d5/0.5 r/1',
  'f5/0.5 f5/0.5 r/0.5 d5/0.5 r/0.5 b4/0.5 d5/0.5 g5/0.5',
  'e5/1 r/1 c5/0.5 e5/0.5 a5/1',
].join(' | ');
const VERSE_ANSWER = [
  'r/2 e5/0.25 g5/0.25 a5/0.5 r/0.5 g5/0.5',
  'f#5/0.5 r/0.5 e5/0.25 d5/0.25 r/0.5 a4/1 r/1',
  'r/2 c5/0.25 d5/0.25 e5/0.5 g5/0.5 a5/0.5',
  'b5/0.5 a5/0.5 f#5/0.5 r/0.5 e5/1 r/1',
  'r/2 e5/0.25 g5/0.25 a5/0.5 r/0.5 g5/0.5',
  'f#5/0.5 r/0.5 e5/0.25 d5/0.25 r/0.5 a4/1 r/1',
  'r/1 a5/0.5 g5/0.5 e5/0.5 c5/0.5 r/1',
  'g#5/1 b5/0.5 d6/0.5 r/0.5 b5/0.25 g#5/0.25 e5/1',
].join(' | ');

/** Пентатоника ля минор: ля, до, ре, ми, соль */
const PENTA = [9, 0, 2, 4, 7];
const FUNKY = [
  'n/0.5 n/0.25 n/0.25 r/0.5 n/0.5 n/1 r/1',
  'r/0.5 n/0.25 n/0.25 n/0.5 n/0.5 r/0.5 n/0.5 n/1',
  'n/0.75 n/0.25 r/0.5 n/0.5 n/0.25 n/0.25 n/0.5 r/1',
  'r/1 n/0.5 n/0.5 n/0.25 n/0.25 n/0.5 n/1',
];
const CADENCE = ['n/1.5 r/0.5 n/2', 'n/2 r/2'];

const BASS = [
  '1/0.75 1/0.25 r/0.5 8/0.25 r/0.25 7/0.5 5/0.5 r/0.25 1/0.25 r/0.5',
  '1/0.5 r/0.25 1/0.25 8/0.25 r/0.25 1/0.5 r/0.25 5/0.25 7/0.25 8/0.25 r/0.5 5/0.25 >/0.25',
  '1/0.5 8/0.5 1/0.5 8/0.5 1/0.5 8/0.5 1/0.5 8/0.5',
];
const bass = (r: Rng, which?: number): Part => ({ i: 'bass', bass: which === undefined ? pick(r, BASS) : BASS[which], lo: 33, vel: 0.95, len: 0.75 });
const CHOPS = [
  'r/0.25 x/0.25 r/0.25 o/0.25 r/0.25 x/0.25 o/0.25 r/0.25 r/0.25 x/0.25 r/0.25 o/0.25 r/0.25 x/0.25 o/0.25 r/0.25',
  'x/0.25 r/0.25 o/0.25 x/0.25 r/0.5 x/0.25 o/0.25 r/0.25 x/0.25 r/0.5 o/0.25 x/0.25 r/0.5',
];
const chops = (r: Rng, vel = 0.5): Part => ({ i: 'guitar', comp: pick(r, CHOPS), n: 3, lo: 64, hi: 79, vel, len: 0.35, strum: 0.004 });
const KEYS = ['x/0.75 o/0.25 r/1 x/0.5 r/0.5 o/0.5 r/0.5', 'r/0.5 x/0.5 r/1 o/0.5 x/0.5 r/1'];
const keys = (r: Rng, vel = 0.55): Part => ({ i: 'epiano', comp: pick(r, KEYS), n: 4, lo: 57, hi: 76, vel, len: 0.8 });
const strings = (vel = 0.45): Part => ({ i: 'strings', pad: true, n: 4, lo: 60, hi: 79, vel });

const FILL = { s: '....x.......xxXX', k: 'x.....x.........', h: 'x.x.x.x.x.......', m: '..........x.....', t: '...........x....' };
const GROOVES: Record<string, Part> = {
  funk: { kit: 'pop', vel: 0.85, drums: { k: 'x.....x...x..x..', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', c: '....x.......x...' }, fill: FILL },
  disco: { kit: 'pop', vel: 0.85, drums: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', h: 'x...x...x...x...', o: '..x...x...x...x.' }, first: { y: 'X...............' }, fill: FILL },
  ghost: { kit: 'pop', vel: 0.85, drums: { k: 'x..x......x.....', s: '....x..o.o..x..o', h: 'xoxoxoxoxoxoxoxo', p: '..x...x...x...x.' }, fill: FILL },
};
const groove = (r: Rng, names: string[]): Part => GROOVES[pick(r, names)];

function intro(r: Rng): Section {
  return { chords: pick(r, VAMP), parts: [bass(r), chops(r), groove(r, ['funk', 'ghost'])] };
}

function verse(r: Rng): Section {
  const chords = VAMP[0];
  return {
    chords,
    parts: [{ i: pick(r, ['marimba', 'bell'] as const), mel: VERSE_ANSWER, vel: 0.7 }, bass(r), chops(r, 0.42), keys(r, 0.5), groove(r, ['funk', 'ghost'])],
  };
}

function hook(r: Rng): Section {
  const parts: Part[] = [
    { i: 'lead', mel: HOOK_LEAD, vel: 0.85 },
    bass(r, r() < 0.5 ? 2 : 0),
    chops(r, 0.4),
    strings(0.4),
    groove(r, ['disco', 'disco', 'funk']),
  ];
  if (r() < 0.6) parts.push({ i: 'saw', mel: HOOK_BRASS, vel: 0.75, len: 0.7 });
  else parts.push(keys(r, 0.5));
  return { chords: HOOK, parts };
}

function brk(r: Rng): Section {
  return {
    chords: pick(r, VAMP),
    parts: [
      bass(r, 1),
      { kit: 'pop', vel: 0.9, drums: { k: 'x.x.......x.....', s: '....x..o.o..x...', h: 'xoxoxoxoxoxoxoxo', c: '............x...' }, fill: FILL },
      { i: 'saw', comp: 'r/1 X/0.25 r/0.75 r/1 x/0.25 x/0.25 r/0.5', n: 3, lo: 60, hi: 76, vel: 0.7, len: 0.5 },
    ],
  };
}

function solo(r: Rng): Section {
  const chords = pick(r, VAMP);
  const inst = pick(r, ['lead', 'saw', 'marimba'] as const);
  return {
    chords,
    parts: [
      { i: inst, mel: genMelody(r, chords, 4, { scale: PENTA, lo: 69, hi: 86, rhythms: FUNKY, cadence: CADENCE, phrase: 4, rest: 0.1, start: 76 }), vel: 0.82 },
      bass(r), chops(r, 0.42), keys(r, 0.45), groove(r, ['funk', 'ghost']),
    ],
  };
}

function bridge(r: Rng): Section {
  return {
    chords: BRIDGE,
    parts: [
      strings(0.5),
      keys(r, 0.55),
      bass(r, 2),
      { i: 'bell', mel: genMelody(r, BRIDGE, 4, { scale: [0, 2, 4, 7, 9], lo: 72, hi: 91, rhythms: ['n/1 n/1 n/2', 'n/1.5 n/0.5 n/2', 'r/1 n/1 n/1 n/1'], cadence: ['n/4'], phrase: 4, start: 79 }), vel: 0.6 },
      GROOVES.disco,
    ],
  };
}

export const funk: StationDef = {
  id: 'funk',
  key: 'Am',
  swing: 0.12,
  swingUnit: 0.25,
  gain: 0.64,
  reverb: { wet: 0.2, decay: 1.6 },
  echo: { beats: 0.75, feedback: 0.25, wet: 0.14, on: ['lead', 'marimba', 'bell'] },
  mix: { lead: 0.55, saw: 0.45, guitar: 0.55, epiano: 0.35, bass: 0.2, strings: 0.18, marimba: 0.6, bell: 0.5, pop: 0.5 },
  insts: ['lead', 'saw', 'guitar', 'epiano', 'bass', 'strings', 'marimba', 'bell'],
  kits: ['pop'],
  form: ['groove', 'verse', 'hook', 'verse', 'hook', 'break', 'solo', 'bridge', 'hook', 'groove', 'solo', 'hook'],
  keys: [0, 2, -2, 3],
  block(role, r) {
    switch (role) {
      case 'groove': return intro(r);
      case 'verse': return verse(r);
      case 'hook': return hook(r);
      case 'break': return brk(r);
      case 'bridge': return bridge(r);
      default: return solo(r);
    }
  },
};
