// Социальное: то, что делают вместе. Прототипы этой категории: «Паровозик», «Лавка розыгрышей», «Самолёт с баннером» (proto/).
import { COLOR, balloon, cake, camera, confetti, cup, fireburst, heart, jelly, label, note, podium, scene, spark, star, trophyBadge, bubble } from '../art.ts';
import type { Idea } from '../types.ts';

export const SOCIAL_IDEAS: Idea[] = [
  {
    id: 'pyramid',
    n: 16,
    title: 'Живая пирамида',
    category: 'social',
    size: 'M',
    net: true,
    pitch: 'Круг у метки: по команде 3–7 игроков строят пирамиду 3-2-1 для общего фото, потом все валятся в воду.',
    fun: 'Готовый кадр для снимка и «упади красиво».',
    art: () =>
      scene('deck', 'Шесть желеек стоят пирамидой 3-2-1, снизу фотографирует друг', [
        jelly({ x: 112, y: 190, c: 'blue', face: 'smile', arms: 'hold', s: 0.62 }),
        jelly({ x: 160, y: 190, c: 'green', face: 'oh', arms: 'hold', s: 0.62 }),
        jelly({ x: 208, y: 190, c: 'pink', face: 'smile', arms: 'hold', s: 0.62 }),
        jelly({ x: 136, y: 142, c: 'mint', face: 'laugh', arms: 'hold', s: 0.62, shadow: false }),
        jelly({ x: 184, y: 142, c: 'purple', face: 'smile', arms: 'hold', s: 0.62, shadow: false }),
        jelly({ x: 160, y: 94, c: 'yellow', hat: 'crown', face: 'cheer', arms: 'up', s: 0.62, shadow: false }),
        camera(46, 186, 0.95),
        spark(68, 150, 8, '#fff'), spark(82, 138, 5, '#fff'),
        bubble(14, 62, 56, 'Сыр!', 'l', 13),
      ]),
  },
  {
    id: 'twirl-throw',
    n: 17,
    title: 'Карусель вдвоём',
    category: 'social',
    size: 'M',
    net: true,
    pitch: 'Новый жест вдвоём (клавиша 7): двое кружатся, повторное нажатие — друг улетает по дуге в воду. Дальность записывается.',
    fun: 'Согласованная «пакость» с рекордом броска; пары уже умеют «5» и «6».',
    art: () =>
      scene('deck', 'Две желейки кружатся, одна из них улетает по дуге в море', [
        jelly({ x: 64, y: 184, c: 'orange', face: 'laugh', arms: 'out', s: 0.85, rot: -10 }),
        jelly({ x: 118, y: 186, c: 'sky', face: 'laugh', arms: 'out', s: 0.85, rot: 10, flip: true }),
        `<path d="M40 130Q91 96 140 130M44 138Q91 160 138 140" stroke="${COLOR.ink}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".35"/>`,
        `<path d="M150 112Q220 20 290 126" stroke="${COLOR.ink}" stroke-width="2.4" fill="none" stroke-dasharray="3 7" stroke-linecap="round" opacity=".45"/>`,
        jelly({ x: 232, y: 66, c: 'pink', face: 'oh', arms: 'up', s: 0.55, rot: 38, shadow: false }),
        `<ellipse cx="290" cy="132" rx="22" ry="6" fill="none" stroke="#fff" stroke-width="2.4"/><ellipse cx="290" cy="132" rx="11" ry="3" fill="none" stroke="#fff" stroke-width="2.4"/>`,
        `<path d="M276 120l-6-14M290 118v-16M304 120l6-14" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
        trophyBadge(160, 24, 'бросок 9,4 м', 100),
      ]),
  },
  {
    id: 'party-for-friend',
    n: 20,
    title: 'Праздник в честь друга',
    category: 'social',
    size: 'S',
    net: true,
    pitch: 'За 100 жетонов — торт, шарики и салют в честь друга. Герой дня 10 минут ходит в короне.',
    fun: 'Ритуал внимания в компании; приятный сюрприз; жетоны не создаются.',
    art: () =>
      scene('deck', 'Торт со свечами, шарики и конфетти, именинник в короне', [
        confetti(11, 10, 20, 310, 150, 34),
        balloon(40, 62, COLOR.red, 1.2), balloon(70, 50, COLOR.yellow, 1.2), balloon(260, 52, COLOR.blue, 1.2), balloon(288, 66, COLOR.green, 1.2),
        `<rect x="104" y="140" width="112" height="9" rx="3" fill="${COLOR.wood}"/><rect x="116" y="148" width="8" height="30" fill="${COLOR.woodDark}"/><rect x="196" y="148" width="8" height="30" fill="${COLOR.woodDark}"/>`,
        cake(160, 140, 1.3),
        jelly({ x: 62, y: 186, c: 'yellow', hat: 'crown', face: 'cheer', arms: 'up', s: 0.95 }),
        jelly({ x: 262, y: 186, c: 'mint', hat: 'party', face: 'laugh', arms: 'up', s: 0.85, flip: true }),
        heart(96, 100, 1.1), heart(228, 108, 0.9, COLOR.pink),
      ]),
  },
  {
    id: 'titles',
    n: 21,
    title: 'Шуточные звания',
    category: 'social',
    size: 'M',
    net: true,
    pitch: '«Король плюхов», «Обнимашка», «Невезучий рыбак»: звание недели висит над ником, список на доске в кафе.',
    fun: 'В духе «Топа проигравших»: подколы с любовью, шанс есть у каждого.',
    touches: 'Показывается в профиле, которым занимается ветка menu. Лучше хранить отдельным файлом в DATA_DIR.',
    art: () =>
      scene('deck', 'Над тремя желейками висят шуточные звания', [
        `<g>${[
          [56, 'Король плюхов', 70],
          [160, 'Обнимашка', 84],
          [264, 'Невезучий рыбак', 62],
        ]
          .map(([x, text, y]) => trophyBadge(x as number, y as number, text as string, 98))
          .join('')}</g>`,
        star(56, 52, 7), heart(160, 66, 1), `<path d="M254 46l8 4l8-4l-2 9h-12Z" fill="${COLOR.gold}"/>`,
        jelly({ x: 56, y: 186, c: 'blue', hat: 'crown', face: 'smug', arms: 'hold', s: 0.78 }),
        jelly({ x: 160, y: 186, c: 'pink', face: 'cheer', arms: 'out', s: 0.78 }),
        jelly({ x: 264, y: 186, c: 'teal', hat: 'straw', face: 'dizzy', arms: 'down', s: 0.78 }),
      ]),
  },
  {
    id: 'weekly-cup',
    n: 22,
    title: 'Кубок недели',
    category: 'social',
    size: 'M',
    net: true,
    pitch: 'Кто заработал больше всех жетонов в режимах за неделю — тот носит золотой кубок до следующего воскресенья.',
    fun: 'Недельная вражда «отобрать кубок»; в воскресенье церемония с салютом.',
    touches: 'Показывается в профиле (ветка menu). Хранить отдельным файлом в DATA_DIR, профили не трогать.',
    art: () =>
      scene('deck', 'Победитель на пьедестале с золотым кубком, в небе салют', [
        fireburst(64, 50, 24, COLOR.red), fireburst(250, 44, 28, COLOR.yellow), fireburst(150, 28, 18, COLOR.blue),
        confetti(21, 20, 60, 300, 150, 28),
        podium(160, 190, 1.3),
        jelly({ x: 160, y: 118, c: 'orange', hat: 'crown', face: 'cheer', arms: 'up', s: 0.78, shadow: false }),
        cup(236, 150, 0.9),
        jelly({ x: 62, y: 188, c: 'sky', face: 'laugh', arms: 'up', s: 0.7 }),
        jelly({ x: 272, y: 190, c: 'green', face: 'oh', arms: 'up', s: 0.6, flip: true }),
      ]),
  },
  {
    id: 'deck-jam',
    n: 23,
    title: 'Джем на палубе',
    category: 'social',
    size: 'M',
    net: true,
    island: true,
    pitch: 'Укулеле, бубен, свисток: клавиши играют ноты общей гаммы, мимо не сыграешь. Остальные подтанцовывают.',
    fun: 'У компании появляется «своя музыка» на пароме и у костра.',
    art: () =>
      scene('deck', 'Желейки играют на укулеле и бубне, вокруг летают ноты', [
        jelly({ x: 70, y: 186, c: 'orange', hat: 'bandana', face: 'cheer', arms: 'hold', s: 0.95 }),
        `<g transform="translate(78 152) rotate(-24)"><ellipse cx="0" cy="0" rx="17" ry="13" fill="#d98b3f" stroke="${COLOR.woodDark}" stroke-width="2"/><circle cx="0" cy="0" r="4.4" fill="${COLOR.ink}"/><rect x="14" y="-3" width="40" height="6" rx="2" fill="${COLOR.wood}"/><path d="M-6 6H48M-6 -6H48" stroke="#fff" stroke-width="1" opacity=".6"/></g>`,
        jelly({ x: 170, y: 188, c: 'mint', face: 'laugh', arms: 'up', s: 0.88 }),
        `<g transform="translate(206 128)"><circle r="17" fill="#f6dc93" stroke="${COLOR.woodDark}" stroke-width="3"/><circle cx="0" cy="-17" r="3" fill="${COLOR.gray}"/><circle cx="17" cy="0" r="3" fill="${COLOR.gray}"/><circle cx="-17" cy="0" r="3" fill="${COLOR.gray}"/><circle cx="0" cy="17" r="3" fill="${COLOR.gray}"/></g>`,
        jelly({ x: 262, y: 186, c: 'pink', face: 'smile', arms: 'wave', s: 0.85, flip: true }),
        note(120, 80, 1.3, COLOR.blue), note(214, 70, 1.2, COLOR.red), note(30, 90, 1, COLOR.green), note(290, 90, 1.1, COLOR.purple),
        label(160, 30, 'ДО  РЕ  МИ', 12, COLOR.ink, 900),
      ]),
  },
];
