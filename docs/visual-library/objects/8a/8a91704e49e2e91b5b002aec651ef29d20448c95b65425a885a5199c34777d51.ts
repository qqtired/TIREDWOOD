// «Форсаж» — радио для гонки по волнам: электро-рок с брейкбитом, ми минор, 164 уд/мин (в духе гоночных игр).
// Перегруженная гитара рубит «пауэр-аккорды» (глушёные восьмые и галоп в куплете, тянутые в припеве), «суперпила»
// бежит шестнадцатыми, саб-бас качает восьмыми, синт-соло ведёт припев. Круг из 14 отрезков: разгон → куплеты →
// припевы → «нитро» (вершина) → спад на половинном ритме; каждый круг — новая тональность (ми, соль, ре, фа-диез минор).
import type { Part, Section } from '../../music/song.ts';
import { pick, rep, type Rng } from '../radiogen.ts';
import type { StationDef } from '../radiostream.ts';

// ------------------------------------------------------------ аккорды (8 тактов)

const VERSE = ['Em | Em | C | D | Em | Em | C | D', 'Em | Em | G | D | Em | Em | C | B'];
const HOOK = 'Em | C | G | D | Em | C | Am | B';
const NITRO = 'C | D | Em | Em | C | D | B | B';
const BURN = 'Am | Am | Em | Em | C | C | D | B';

// ------------------------------------------------------------ гитара: ноты — корни «пауэр-аккордов»

const RIFF_CHUG = [
  'e2/0.5 e2/0.5 r/0.5 e2/0.5 e2/0.5 r/0.5 g2/0.5 e2/0.5',
  'e2/0.5 e2/0.5 r/0.5 e2/0.5 d3/0.5 r/0.5 b2/0.5 g2/0.5',
  'c3/0.5 c3/0.5 r/0.5 c3/0.5 c3/0.5 r/0.5 d3/0.5 c3/0.5',
  'd3/0.5 d3/0.5 r/0.5 d3/0.5 a2/0.5 a2/0.5 b2/0.5 d3/0.5',
];
const RIFF_CHUG_END = 'd3/0.5 d3/0.5 r/0.5 d3/0.5 d3/0.25 d3/0.25 d3/0.25 d3/0.25 e3/1';
const gallop = (a: string, b: string): string => `${a}/0.5 ${a}/0.25 ${a}/0.25 ${a}/0.5 ${a}/0.25 ${a}/0.25 ${a}/0.5 ${a}/0.25 ${a}/0.25 ${b}/0.5 ${a}/0.5`;
/** Рифф по корням тактов */
function riff(kind: 'chug' | 'gallop', roots: string[]): string {
  if (kind === 'chug' && roots.join() === 'e2,e2,c3,d3,e2,e2,c3,d3') return [...RIFF_CHUG, ...RIFF_CHUG.slice(0, 3), RIFF_CHUG_END].join(' | ');
  return roots.map((r, i) => {
    const next = roots[(i + 1) % roots.length];
    if (kind === 'chug') return `${r}/0.5 ${r}/0.5 r/0.5 ${r}/0.5 ${r}/0.5 r/0.5 ${r}/0.5 ${next}/0.5`;
    return gallop(r, next === r ? (r === 'e2' ? 'g2' : r) : next);
  }).join(' | ');
}
/** Тянутые аккорды припева: удар, подхват, удар */
const held = (roots: string[]): string => roots.map((r) => `${r}/1.5 ${r}/0.5 r/1 ${r}/0.5 ${r}/0.5`).join(' | ');
const ROOTS: Record<string, string[]> = {
  [VERSE[0]]: ['e2', 'e2', 'c3', 'd3', 'e2', 'e2', 'c3', 'd3'],
  [VERSE[1]]: ['e2', 'e2', 'g2', 'd3', 'e2', 'e2', 'c3', 'b2'],
  [HOOK]: ['e2', 'c3', 'g2', 'd3', 'e2', 'c3', 'a2', 'b2'],
  [NITRO]: ['c3', 'd3', 'e2', 'e2', 'c3', 'd3', 'b2', 'b2'],
  [BURN]: ['a2', 'a2', 'e2', 'e2', 'c3', 'c3', 'd3', 'b2'],
};

// ------------------------------------------------------------ соло (синт): припев, вершина, спад

const HOOK_MEL = [
  [
    'b4/1 e5/0.5 f#5/0.5 g5/1 f#5/0.5 e5/0.5',
    'e5/1.5 d5/0.5 c5/1 g4/1',
    'd5/1 g5/0.5 a5/0.5 b5/1.5 a5/0.5',
    'a5/2 f#5/1 d5/1',
    'b4/1 e5/0.5 f#5/0.5 g5/1 b5/1',
    'c6/1.5 b5/0.5 g5/1 e5/1',
    'a5/1 g5/0.5 f#5/0.5 e5/1 c5/1',
    'd#5/2 f#5/1 b5/1',
  ],
  [
    'e5/0.5 e5/0.5 g5/0.5 e5/0.5 b5/1 a5/0.5 g5/0.5',
    'g5/0.5 e5/1 c5/0.5 e5/1 g5/1',
    'd5/0.5 d5/0.5 g5/0.5 d5/0.5 b5/1 a5/0.5 g5/0.5',
    'f#5/1.5 e5/0.5 d5/1 a4/1',
    'e5/0.5 e5/0.5 g5/0.5 e5/0.5 b5/1 c6/0.5 b5/0.5',
    'g5/1 e5/0.5 g5/0.5 c6/1 g5/1',
    'a5/0.5 b5/0.5 c6/0.5 b5/0.5 a5/1 e5/1',
    'f#5/1 d#5/1 b4/2',
  ],
];
const NITRO_MEL = [
  [
    'g5/1.5 e5/0.5 g5/1 c6/1',
    'a5/1.5 f#5/0.5 a5/1 d6/1',
    'b5/3 a5/0.5 g5/0.5',
    'e5/2 g5/1 a5/1',
    'g5/1.5 e5/0.5 g5/1 c6/1',
    'd6/1.5 c6/0.5 a5/1 f#5/1',
    'd#6/2 b5/1 f#5/1',
    'f#5/2 d#5/1 b4/1',
  ],
  [
    'e5/0.5 g5/0.5 c6/0.5 g5/0.5 e6/1 d6/0.5 c6/0.5',
    'd6/0.5 a5/0.5 f#5/0.5 a5/0.5 d6/1 e6/0.5 d6/0.5',
    'b5/1 g5/0.5 b5/0.5 e6/1.5 d6/0.5',
    'b5/2 g5/1 e5/1',
    'e5/0.5 g5/0.5 c6/0.5 g5/0.5 e6/1 d6/0.5 c6/0.5',
    'd6/1 c6/0.5 a5/0.5 f#5/1 a5/1',
    'b5/1 d#6/1 f#6/1 d#6/1',
    'b5/3 r/1',
  ],
];
const BURN_MEL = 'e5/2 c5/1 a4/1 | a4/2 c5/1 d5/1 | e5/3 g5/1 | g5/2 e5/1 b4/1 | c5/2 e5/1 g5/1 | g5/3 e5/1 | f#5/2 a5/1 d5/1 | d#5/2 f#5/2';

// ------------------------------------------------------------ ритм-секция

const SUB_8 = '1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5 1/0.5';
const SUB_OCT = '1/0.5 8/0.5 1/0.5 8/0.5 1/0.5 8/0.5 1/0.5 >/0.5';
const SUB_DRIVE = '1/0.75 1/0.25 r/0.5 1/0.5 8/0.5 1/0.5 5/0.5 >/0.5';
const sub = (bass: string, vel = 0.85): Part => ({ i: 'sub', bass, lo: 36, vel, len: 0.85 });

const ARPS = [
  '0/0.25 1/0.25 2/0.25 1/0.25 0/0.25 1/0.25 2/0.25 1/0.25 0/0.25 1/0.25 2/0.25 1/0.25 0/0.25 1/0.25 2/0.25 3/0.25',
  '0/0.25 2/0.25 1/0.25 3/0.25 2/0.25 1/0.25 0/0.25 2/0.25 0/0.25 2/0.25 1/0.25 3/0.25 2/0.25 1/0.25 3/0.25 2/0.25',
  '0/0.5 2/0.5 1\'/0.5 2/0.5 0/0.5 2/0.5 1\'/0.5 3/0.5',
];
const arp = (r: Rng, vel = 0.62): Part => ({ i: 'saw', arp: pick(r, ARPS), n: 3, lo: 64, hi: 79, vel, len: 0.7 });

const FILL = { s: '....x...x.x.xxXX', k: 'x.........x.....', h: 'x.x.x.x.........', t: '..............x.' };
const DRUMS: Record<string, Part> = {
  two: { kit: 'break', vel: 0.9, drums: { k: 'x.........x.....', s: '....x..o.o..x...', h: 'x.x.x.x.x.x.x.x.' }, first: { y: 'X...............' }, fill: FILL },
  amen: {
    kit: 'break', vel: 0.9,
    drums: { k: 'x.x.......xx....|x.x.......x.....', s: '....x..o.o..x..o|.o..x..o.o..x...', h: 'x.x.x.x.x.x.x.x.' },
    first: { y: 'X...............' }, fill: FILL,
  },
  rock: { kit: 'break', vel: 0.9, drums: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..............x.' }, first: { y: 'X...............' }, fill: FILL },
  drive: { kit: 'break', vel: 0.92, drums: { k: 'x.....x...x.....', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', y: 'X...............|................|................|................' }, fill: { ...FILL, y: '................' } },
  half: { kit: 'break', vel: 0.85, drums: { k: 'x.........x.....|x...............', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' }, first: { y: 'X...............' }, fill: { s: '........x...xxXX', k: 'x.........x.....', h: 'x.x.x.x.........' } },
};

function ignite(r: Rng): Section {
  const chords = pick(r, VERSE);
  return {
    chords,
    parts: [
      arp(r, 0.55),
      { i: 'strings', pad: true, n: 4, lo: 52, hi: 71, vel: 0.5 },
      { i: 'sub', bass: `${rep('1/4', 4)} | ${rep(SUB_8, 4)}`, lo: 36, vel: 0.8, len: 0.9 },
      { i: 'dist', mel: `${rep('r/4', 4)} | ${ROOTS[chords].slice(4).map((x) => `${x}/4`).join(' | ')}`, vel: 0.75, len: 0.95 },
      {
        kit: 'break', vel: 0.85,
        drums: {
          h: '................|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|xxxxxxxxxxxxxxxx|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.',
          k: '................|................|x...x...x...x...|x...x...x...x...|x...x...x...x...|x...x...x...x...|x...x...x...x...|x...x...x...x...',
          s: '................|................|................|................|....x.......x...|....x...x...x...|x...x...x...x.x.|x.x.x.x.xxxxXXXX',
        },
      },
    ],
  };
}

function run(r: Rng): Section {
  const chords = pick(r, VERSE);
  const parts: Part[] = [
    { i: 'dist', mel: riff(r() < 0.55 ? 'chug' : 'gallop', ROOTS[chords]), vel: 0.85, len: 0.5 },
    sub(pick(r, [SUB_8, SUB_DRIVE])),
    DRUMS[pick(r, ['two', 'amen', 'amen'])],
  ];
  if (r() < 0.6) parts.push(arp(r, 0.5));
  else parts.push({ i: 'saw', comp: 'X/0.5 r/1 x/0.5 r/0.5 x/0.5 r/1', n: 3, lo: 60, hi: 76, vel: 0.6, len: 0.5 });
  return { chords, parts };
}

function hook(r: Rng): Section {
  const lead = pick(r, ['lead', 'lead', 'saw'] as const);
  return {
    chords: HOOK,
    parts: [
      { i: lead, mel: pick(r, HOOK_MEL).join(' | '), vel: 0.9 },
      { i: 'dist', mel: held(ROOTS[HOOK]), vel: 0.8, len: 0.95 },
      sub(SUB_OCT),
      arp(r, 0.42),
      DRUMS[pick(r, ['rock', 'two'])],
    ],
  };
}

function nitro(r: Rng): Section {
  const mel = pick(r, NITRO_MEL);
  return {
    chords: NITRO,
    parts: [
      { i: 'lead', mel: mel.join(' | '), vel: 0.92 },
      ...(r() < 0.5 ? [{ i: 'saw' as const, mel: mel.join(' | '), oct: -1, vel: 0.45 }] : []),
      { i: 'dist', mel: riff('chug', ROOTS[NITRO]), vel: 0.85, len: 0.6 },
      sub(SUB_DRIVE, 0.9),
      arp(r, 0.4),
      DRUMS.drive,
    ],
  };
}

function burn(r: Rng): Section {
  return {
    chords: BURN,
    parts: [
      { i: pick(r, ['lead', 'square'] as const), mel: BURN_MEL, vel: 0.8 },
      { i: 'strings', pad: true, n: 4, lo: 52, hi: 71, vel: 0.6 },
      { i: 'dist', mel: ROOTS[BURN].map((x) => `${x}/4`).join(' | '), vel: 0.7, len: 0.95 },
      { i: 'sub', bass: '1/2.5 1/1 >/0.5', lo: 36, vel: 0.8, len: 0.9 },
      DRUMS.half,
    ],
  };
}

export const forsazh: StationDef = {
  id: 'forsazh',
  key: 'Em',
  gain: 0.75,
  reverb: { wet: 0.16, decay: 1.4 },
  echo: { beats: 0.75, feedback: 0.28, wet: 0.16, on: ['lead', 'square'] },
  mix: { lead: 0.6, square: 0.55, dist: 0.5, sub: 0.27, saw: 0.6, strings: 0.2, break: 0.28 },
  insts: ['lead', 'square', 'dist', 'sub', 'saw', 'strings'],
  kits: ['break'],
  form: ['ignite', 'run', 'run', 'hook', 'hook', 'run', 'burn', 'nitro', 'nitro', 'run', 'hook', 'hook', 'burn', 'nitro'],
  keys: [0, 3, -2, 2],
  block(role, r) {
    switch (role) {
      case 'ignite': return ignite(r);
      case 'hook': return hook(r);
      case 'nitro': return nitro(r);
      case 'burn': return burn(r);
      default: return run(r);
    }
  },
};
