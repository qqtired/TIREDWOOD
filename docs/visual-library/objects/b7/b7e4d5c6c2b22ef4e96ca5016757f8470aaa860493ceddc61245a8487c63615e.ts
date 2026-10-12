// Мир: что можно делать на набережной, пирсе и острове. Прототипы этой категории: «Блинчики», «Силомер», «Костёр» (proto/).
import { COLOR, clockSign, ferry, jelly, label, note, pier, scene } from '../art.ts';
import type { Idea } from '../types.ts';

export const WORLD_IDEAS: Idea[] = [
  {
    id: 'ferry-horn',
    n: 8,
    title: 'Паром по расписанию',
    category: 'world',
    size: 'S',
    island: true,
    pitch: 'Паром отходит по часам: за 30 секунд гудок и сообщение в чате. Опоздавший машет вслед с причала.',
    fun: 'Общая суета «успеть» собирает всех в одну поездку; опоздавшему смешно.',
    touches: 'Море и причал у boats и barkas: делаем только картинку и расписание.',
    art: () =>
      scene('sea', 'Паром отходит от причала, опоздавшая желейка машет ему вслед', [
        ferry(96, 128, 1),
        `<circle cx="84" cy="48" r="9" fill="#fff" opacity=".9"/><circle cx="96" cy="38" r="12" fill="#fff" opacity=".8"/><circle cx="110" cy="28" r="9" fill="#fff" opacity=".7"/>`,
        label(124, 56, 'ТУ-УУ!', 13, COLOR.red, 900),
        pier(196, 150, 124),
        clockSign(280, 128, 0.9, '17:30'),
        jelly({ x: 228, y: 146, c: 'orange', face: 'oh', arms: 'wave', s: 0.72, flip: true, look: -1 }),
        note(150, 82, 0.9, COLOR.blue),
      ]),
  },
];
