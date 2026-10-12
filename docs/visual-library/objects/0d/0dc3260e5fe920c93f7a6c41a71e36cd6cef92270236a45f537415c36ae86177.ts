// Животные. Классы животных переделывает ветка critters, поэтому здесь только карточки-идеи (без живых сцен).
import { COLOR, bucket, cat, crab, gull, heart, jelly, scene } from '../art.ts';
import type { Idea } from '../types.ts';

export const ANIMAL_IDEAS: Idea[] = [
  {
    id: 'pet-buddy',
    n: 10,
    title: 'Питомец-попутчик',
    category: 'animals',
    size: 'L',
    net: true,
    pitch: 'Краб в ведёрке, чайка или котёнок ходят за тобой, садятся рядом, реагируют на эмоции. Видят все.',
    fun: 'Своя личность и хвастовство перед друзьями; питомцы между собой ссорятся.',
    touches: 'Животные: их классы переделывает critters. Делать после слияния, поэтому здесь только идея, без живой сцены.',
    art: () =>
      scene('sand', 'Желейка гуляет с котёнком, крабом в ведёрке и чайкой на столбике', [
        `<rect x="26" y="130" width="12" height="34" rx="3" fill="${COLOR.wood}"/>`,
        gull(32, 128, 0.85, 6),
        jelly({ x: 124, y: 184, c: 'teal', hat: 'straw', face: 'cheer', arms: 'wave', s: 1 }),
        cat(190, 186, 1.15, true),
        heart(184, 128, 1.1),
        crab(262, 176, 1.2),
        bucket(262, 190, 1.1),
        heart(124, 56, 0.9, COLOR.pink),
      ]),
  },
  {
    id: 'gull-thief',
    n: 11,
    title: 'Чайка-воришка',
    category: 'animals',
    size: 'M',
    net: true,
    pitch: 'Чайка пикирует и хватает шапку или рыбу из рук. Ничего не пропадает насовсем: догнал — вещь вернулась, не догнал — вернётся сама через 10 секунд.',
    fun: 'Комедия положений: вся пристань бежит отбивать чужую шапку.',
    touches: 'Животные: пересекается с critters. Улов и рюкзаки — зона fisheco, поэтому ничего не отбирает насовсем.',
    art: () =>
      scene('sea', 'Чайка улетает с соломенной шляпой в клюве, желейки бегут за ней по пирсу', [
        gull(200, 56, 1.4, -12),
        `<ellipse cx="236" cy="70" rx="22" ry="6" fill="#f1cf79" stroke="#d9ab45" stroke-width="2" transform="rotate(-12 236 70)"/><path d="M224 68C226 56 246 56 248 64Z" fill="#f6dc93" transform="rotate(-12 236 70)"/>`,
        `<path d="M170 90q-20 6-40 24M168 100q-24 10-44 34" stroke="${COLOR.ink}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".35"/>`,
        `<rect x="0" y="144" width="320" height="14" rx="3" fill="${COLOR.deck}" stroke="${COLOR.deckSeam}" stroke-width="2"/><rect x="0" y="158" width="320" height="42" fill="${COLOR.deckDark}"/>`,
        jelly({ x: 70, y: 168, c: 'orange', face: 'angry', arms: 'up', s: 0.9, flip: true }),
        jelly({ x: 150, y: 172, c: 'pink', face: 'oh', arms: 'up', s: 0.85, look: 1 }),
        jelly({ x: 264, y: 170, c: 'sky', face: 'dizzy', arms: 'up', s: 0.9 }),
      ]),
  },
];
