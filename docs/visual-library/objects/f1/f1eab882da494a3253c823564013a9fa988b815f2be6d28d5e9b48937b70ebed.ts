// «Утро на грядках» — своя спокойная тема фермы (docs/farm/design-v11.md §15): соль мажор, 80, без барабанов.
// Нейлоновая гитара перебором (бас большим пальцем), мягкие струнные подстилают; мелодию по очереди ведут свирель,
// аккордеон и колокольчик, в середине гитара поёт одна. Играет по кругу без шва: последний такт (D7) ведёт в первый
// (G), а следующий круг начинается на другом проигрывателе, пока у прошлого дозвучивают хвосты (farmaudio.ts).
// Это не песня автомата: в каталог shared/jukebox.ts не входит, своё описание — FARM_THEME_META.
import type { JukeSong } from '../../../shared/jukebox.ts';
import type { Part, SongDef } from '../../music/song.ts';

/** Темп, размер и длина: 48 тактов × 4 доли × 0,75 с = 2:24 (хвост — только для последнего круга) */
export const FARM_THEME_META: JukeSong = { id: 'farmTheme', title: 'Утро на грядках', mood: 'тема фермы', emoji: '🌾', bpm: 80, meter: 4, bars: 48, tail: 3 };

const A_CHORDS = 'G | D/F# | Em | C | G | Am7 | D7sus4 D7 | G';
/** Свирель: главная тема */
const A_MEL = [
  'd5/1 g5/1.5 a5/0.5 b5/1', 'a5/2 f#5/1 d5/1', 'e5/1.5 f#5/0.5 g5/1 b5/1', 'a5/1 g5/1 e5/2',
  'd5/1 g5/1 b5/1 d6/1', 'c6/1.5 b5/0.5 a5/1 e5/1', 'g5/1 a5/1 f#5/1 e5/0.5 f#5/0.5', 'g5/3 r/1',
];
/** Аккордеон: та же тема своими словами, ниже */
const B_MEL = [
  'b4/1 d5/1 g5/1 f#5/0.5 e5/0.5', 'f#5/1.5 e5/0.5 d5/2', 'e5/1 g5/1 b5/1.5 a5/0.5', 'g5/1 e5/1 c5/2',
  'd5/1 b4/1 d5/1 g5/1', 'e5/1.5 d5/0.5 c5/1 a4/1', 'd5/1 g5/1 f#5/1.5 e5/0.5', 'd5/2 b4/1 r/1',
];
/** Аккордеон под свирелью во втором проведении: долгие ноты на терцию-сексту ниже */
const A2_ACC = ['b4/2 d5/2', 'd5/2 a4/2', 'b4/2 e5/2', 'e5/2 c5/2', 'g4/2 b4/2', 'a4/2 c5/2', 'd5/2 c5/2', 'b4/3 r/1'];
/** Середина: колокольчик спрашивает, свирель отвечает */
const C_CHORDS = 'C | G/B | Am7 | Em | C | G/B | Am7 | D7sus4 D7';
const C_BELL = ['e5/1 g5/1 c6/2', 'b5/1.5 a5/0.5 g5/2', 'r/4', 'r/4', 'g5/1 e5/1 c5/2', 'd5/1.5 g5/0.5 b5/2', 'r/4', 'r/4'];
const C_WHISTLE = ['r/4', 'r/4', 'a5/1 c6/1 e6/1.5 d6/0.5', 'b5/2 g5/1 e5/1', 'r/4', 'r/4', 'c6/1 a5/1 e5/1 g5/1', 'g5/2 f#5/2'];
/** Передышка: гитара поёт одна */
const D_CHORDS = 'Em | C | G | D/F# | Em | C | Am7 | D7sus4 D7';
const D_GUITAR = [
  'e5/0.5 f#5/0.5 g5/1 b5/1.5 a5/0.5', 'g5/1 e5/1 c5/1.5 d5/0.5', 'b4/0.5 d5/0.5 g5/1 b5/1 a5/0.5 g5/0.5', 'a5/2 f#5/1 d5/1',
  'e5/0.5 g5/0.5 b5/1 e6/1.5 d6/0.5', 'c6/1 g5/1 e5/1 g5/1', 'a5/1 e5/1 c5/1 e5/1', 'd5/1 g5/1 f#5/1.5 a5/0.5',
];

/** Перебор: большой палец на 1 и 3 (thumb), три пальца рябью вверх */
const PICK = 'r/0.5 0/0.5 1/0.5 2/0.5 r/0.5 0/0.5 1/0.5 2/0.5';
const PICK_B = 'r/0.5 0/0.5 1/0.5 2/0.5 1/0.5 0/0.5 1/0.5 2/0.5';
const PICK_SOFT = 'r/0.5 0/0.5 r/0.5 1/0.5 r/0.5 2/0.5 r/0.5 1/0.5';
const pick = (vel = 0.5, arp = PICK): Part => ({ i: 'nylon', arp, n: 3, lo: 55, hi: 72, vel, len: 1.8 });
const thumb = (vel = 0.6): Part => ({ i: 'nylon', bass: '1/2 5/2', lo: 40, vel, len: 0.95 });
const strings = (vel = 0.4): Part => ({ i: 'strings', pad: true, n: 4, lo: 52, hi: 71, vel });
const bass: Part = { i: 'bass', bass: '1/4', lo: 36, vel: 0.45, len: 0.95 };

export const farmTheme: SongDef = {
  id: FARM_THEME_META.id,
  key: 'G',
  gain: 0.62,
  reverb: { wet: 0.26, decay: 2.3 },
  echo: { beats: 1.5, feedback: 0.24, wet: 0.12, on: ['whistle', 'bell'] },
  mix: { whistle: 0.5, accordion: 0.34, nylon: 0.62, bell: 0.3, strings: 0.16, bass: 0.13 },
  sections: {
    intro: {
      chords: 'G | C/G | G | D7sus4 D7',
      parts: [pick(0.5), thumb(0.55), strings(0.3), { i: 'bell', mel: 'r/4 | r/4 | d6/1 b5/1 g5/2 | a5/2 f#5/2', vel: 0.55 }],
    },
    a: { chords: A_CHORDS, parts: [{ i: 'whistle', mel: A_MEL.join(' | '), vel: 0.72 }, pick(), thumb(), strings(), bass] },
    b: {
      chords: A_CHORDS,
      parts: [
        { i: 'accordion', mel: B_MEL.join(' | '), vel: 0.7 },
        { i: 'bell', mel: 'r/4 | r/4 | r/4 | r/2 g6/1 e6/1 | r/4 | r/4 | r/4 | r/2 b5/1 d6/1', vel: 0.4 },
        pick(0.5, PICK_B), thumb(), strings(0.3), bass,
      ],
    },
    c: {
      chords: C_CHORDS,
      parts: [
        { i: 'bell', mel: C_BELL.join(' | '), vel: 0.6 },
        { i: 'whistle', mel: C_WHISTLE.join(' | '), vel: 0.7 },
        pick(0.48, PICK_B), thumb(0.55), strings(0.45), bass,
      ],
    },
    a2: {
      chords: A_CHORDS,
      parts: [
        { i: 'whistle', mel: A_MEL.join(' | '), vel: 0.75 },
        { i: 'accordion', mel: A2_ACC.join(' | '), vel: 0.35, len: 0.96 },
        pick(), thumb(), strings(0.35), bass,
      ],
    },
    d: {
      chords: D_CHORDS,
      parts: [{ i: 'nylon', mel: D_GUITAR.join(' | '), vel: 0.95, len: 1 }, pick(0.36, PICK_SOFT), thumb(0.5), strings(0.55)],
    },
    outro: {
      chords: 'C | G/B | Am7 | D7sus4 D7',
      parts: [
        { i: 'bell', mel: 'e6/1 d6/1 c6/2 | b5/1 g5/1 d5/2 | c5/1 e5/1 a5/2 | g5/2 f#5/2', vel: 0.55 },
        { i: 'accordion', mel: 'e5/4 | d5/4 | c5/4 | c5/2 a4/2', vel: 0.35, len: 0.97 },
        pick(0.45), thumb(0.5), strings(0.35),
      ],
    },
  },
  form: ['intro', 'a', 'b', 'c', 'a2', 'd', 'outro'],
};
