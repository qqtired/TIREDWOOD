// «Тихая заводь» — радио для ловли с якоря: лоу-фай и эмбиент, фа мажор, 72 уд/мин, свинг шестнадцатыми.
// Ленивые аккорды электропиано, тёплый бас, мягкие барабаны и треск пластинки; мелодию ведут свирель, колокольчик или
// маримба — то написанная, то сочинённая на ходу по пентатонике (без «кислых» нот). Между грувами — отрезки без
// барабанов: пэд и перебор нейлоновой гитары, как туман над водой. Круг из 12 отрезков (~5 мин), тональность — по кругам.
import type { Part, Section } from '../../music/song.ts';
import { genMelody, pick, rep, type Rng } from '../radiogen.ts';
import type { StationDef } from '../radiostream.ts';

const Z1 = 'Fmaj9 | Em7 | Dm9 | Cmaj7 | Bbmaj7 | Am7 | Gm7 | C7sus4';
const Z2 = 'Bbmaj7 | Am7 | Gm9 | Fmaj7 | Bbmaj7 | Am7 | Gm7 | C9';
const Z3 = 'Dm9 | Bbmaj7 | Fmaj9 | Cadd9 | Dm9 | Bbmaj7 | Gm7 | Am7';
const Z4 = 'Gm9 | C9 | Fmaj9 | Dm9 | Gm9 | C9 | Fmaj7 | Fmaj7';
const PROGS = [Z1, Z2, Z3, Z4];

/** Написанные мелодии: прогрессия и ноты */
const TUNES: ReadonlyArray<{ chords: string; mel: string; inst: readonly ('whistle' | 'bell' | 'marimba' | 'epiano')[]; oct?: number }> = [
  {
    chords: Z1, inst: ['whistle', 'whistle', 'marimba'],
    mel: 'r/0.5 a4/0.5 c5/0.5 e5/1.5 c5/0.5 a4/0.5 | g4/1 b4/0.5 d5/0.5 ~/1 r/1 | r/0.5 f4/0.5 a4/0.5 c5/1.5 e5/0.5 d5/0.5 | c5/1.5 b4/0.5 g4/2 | r/0.5 f4/0.5 a4/0.5 d5/1 c5/0.5 a4/0.5 f4/0.5 | e4/1.5 g4/0.5 c5/1 a4/1 | bb4/1 a4/0.5 g4/0.5 f4/1 d4/1 | f4/1.5 g4/0.5 c4/2',
  },
  {
    chords: Z1, inst: ['bell', 'marimba'],
    mel: 'c6/1.5 a5/0.5 g5/1 e5/1 | d5/2 b4/1 r/1 | a5/1.5 f5/0.5 e5/1 c5/1 | e5/3 r/1 | d5/1.5 f5/0.5 a5/1 c6/1 | c6/1.5 a5/0.5 e5/2 | f5/1.5 d5/0.5 bb4/1 g4/1 | g4/2 f4/2',
  },
  {
    chords: Z2, inst: ['whistle', 'epiano', 'marimba'],
    mel: 'd5/1 f5/0.5 a5/1.5 f5/0.5 d5/0.5 | c5/2 e5/1 r/1 | r/0.5 bb4/0.5 d5/0.5 f5/1.5 a5/0.5 g5/0.5 | a5/2 r/0.5 g5/0.5 f5/0.5 e5/0.5 | d5/1 f5/0.5 a5/1 c6/1 a5/0.5 | g5/1.5 e5/0.5 c5/2 | bb4/1 d5/0.5 f5/0.5 g5/1 f5/1 | e5/2 d5/1 c5/1',
  },
];

/** Пентатоника фа мажор: фа, соль, ля, до, ре */
const PENTA = [5, 7, 9, 0, 2];
const LAZY = ['r/1 n/1 n/1.5 n/0.5', 'n/1.5 n/0.5 n/2', 'r/0.5 n/0.5 n/0.5 n/1.5 r/1', 'n/1 n/1 n/2', 'r/2 n/1 n/1', 'n/0.5 n/0.5 n/1 n/2'];
const SPARSE = ['r/2 n/2', 'n/3 r/1', 'r/1 n/1 r/2', 'r/4'];
const CADENCE = ['n/3 r/1', 'n/2 n/2', 'n/4'];

const KEYS = ['x/1.5 o/1 r/0.5 o/1', 'x/2.5 o/1.5', 'r/0.5 x/1.5 o/1 r/1', 'x/1 r/0.5 o/1 o/1.5'];
const keys = (r: Rng, vel = 0.55): Part => ({ i: 'epiano', comp: pick(r, KEYS), n: 4, lo: 55, hi: 74, strum: 0.024, vel, len: 0.95 });
const pad = (vel = 0.42): Part => ({ i: 'pad', pad: true, n: 4, lo: 53, hi: 72, vel });
const BASS = ['1/1.5 1/0.5 r/1 5/0.5 >/0.5', '1/2 r/1 5/1', '1/1.5 r/0.5 8/0.5 r/0.5 5/1'];
const bass = (r: Rng, vel = 0.75): Part => ({ i: 'bass', bass: pick(r, BASS), lo: 36, vel, len: 0.9 });
const ARP = ['0/0.5 1/0.5 2/0.5 3/0.5 2/0.5 1/0.5 0/1', '0/0.5 2/0.5 1/0.5 3/0.5 0/0.5 2/0.5 1/1', '0/1 2/0.5 3/0.5 1/1 2/1'];
const nylon = (r: Rng, vel = 0.5): Part => ({ i: 'nylon', arp: pick(r, ARP), n: 4, lo: 52, hi: 72, vel, len: 1 });
const CRACKLE = { v: 'x...............' };
const GROOVES = [
  { k: 'x.........x..x..', s: '....x.......x...', h: 'x.xox.x.x.xox.x.' },
  { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  { k: 'x.........x.....|x......x..x.....', s: '....x.......x...', h: 'x.xox.xox.xox.x.' },
];
const groove = (r: Rng, vel = 0.72): Part => ({
  kit: 'lofi', vel, drums: { ...pick(r, GROOVES), ...CRACKLE },
  fill: { k: 'x.........x.....', s: '....x.......x.oo', h: 'x.xox.x.x.x.....', v: 'x...............' },
});

const gen = (r: Rng, chords: string, rhythms: readonly string[], rest: number, lo = 65, hi = 86): string =>
  genMelody(r, chords, 4, { scale: PENTA, lo, hi, rhythms, cadence: CADENCE, phrase: 4, rest, start: 72 + Math.floor(r() * 7) });

function mist(r: Rng): Section {
  const chords = pick(r, PROGS);
  return {
    chords,
    parts: [
      pad(0.6),
      nylon(r, 0.62),
      { i: pick(r, ['bell', 'marimba'] as const), mel: gen(r, chords, SPARSE, 0.35, 69, 88), vel: 0.66 },
      { i: 'bass', bass: `${rep('r/4', 4)} | ${rep('1/4', 4)}`, lo: 36, vel: 0.6, len: 0.95 },
      { kit: 'lofi', vel: 0.6, drums: { ...CRACKLE, p: `${rep('................', 4)} | ${rep('..o...o...o...o.', 4)}` } },
    ],
  };
}

function drift(r: Rng): Section {
  const chords = pick(r, PROGS);
  return {
    chords,
    parts: [
      pad(0.4),
      keys(r, 0.42),
      { i: 'bass', bass: '1/2 5/2', lo: 36, vel: 0.65, len: 0.95 },
      { i: 'marimba', mel: gen(r, chords, [...SPARSE, ...LAZY], 0.3), vel: 0.5 },
      { kit: 'lofi', vel: 0.6, drums: { ...CRACKLE, p: '..o...o...o...o.', r: '................|............x...' } },
    ],
  };
}

function sway(r: Rng): Section {
  const chords = pick(r, PROGS);
  const parts: Part[] = [keys(r), bass(r), groove(r), pad(0.3)];
  if (r() < 0.5) parts.push(nylon(r, 0.36));
  return { chords, parts };
}

function tune(r: Rng): Section {
  const t = pick(r, TUNES);
  const inst = pick(r, t.inst);
  return {
    chords: t.chords,
    parts: [{ i: inst, mel: t.mel, vel: inst === 'epiano' ? 0.75 : 0.72, ...(inst === 'marimba' && !t.mel.includes('c6') ? { oct: 1 } : {}) }, keys(r), bass(r), groove(r), pad(0.3)],
  };
}

function float(r: Rng): Section {
  const chords = pick(r, PROGS);
  const inst = pick(r, ['bell', 'marimba', 'whistle'] as const);
  return {
    chords,
    parts: [{ i: inst, mel: gen(r, chords, LAZY, 0.12), vel: inst === 'whistle' ? 0.56 : 0.48 }, keys(r, 0.5), bass(r), groove(r, 0.66), pad(0.3)],
  };
}

function ebb(r: Rng): Section {
  const chords = pick(r, PROGS);
  return {
    chords,
    parts: [
      keys(r, 0.5),
      pad(0.4),
      { i: 'bass', bass: '1/2 r/1 5/1', lo: 36, vel: 0.7, len: 0.9 },
      { kit: 'lofi', vel: 0.62, drums: { k: 'x.........x.....', r: '....x.......x...', h: 'x...x...x...x...', ...CRACKLE }, fill: { k: 'x...............', r: '....x...........', h: 'x...x...........', v: 'x...............' } },
    ],
  };
}

export const zavod: StationDef = {
  id: 'zavod',
  key: 'F',
  swing: 0.26,
  swingUnit: 0.25,
  gain: 0.72,
  reverb: { wet: 0.32, decay: 2.8 },
  echo: { beats: 0.75, feedback: 0.34, wet: 0.2, on: ['bell', 'whistle', 'marimba'] },
  mix: { whistle: 0.62, bell: 0.55, marimba: 0.62, epiano: 0.27, bass: 0.22, pad: 0.26, nylon: 0.5, lofi: 0.72 },
  insts: ['whistle', 'bell', 'marimba', 'epiano', 'bass', 'pad', 'nylon'],
  kits: ['lofi'],
  form: ['mist', 'drift', 'sway', 'tune', 'float', 'sway', 'tune', 'ebb', 'mist', 'float', 'tune', 'ebb'],
  keys: [0, -3, 2, -1],
  block(role, r) {
    switch (role) {
      case 'mist': return mist(r);
      case 'drift': return drift(r);
      case 'tune': return tune(r);
      case 'float': return float(r);
      case 'ebb': return ebb(r);
      default: return sway(r);
    }
  },
};
