// Режимы: игры, в которые играют раундами. Прототип этой категории — «Горячий арбуз» (proto/hot-melon.ts).
import { COLOR, bubble, chest, confetti, easel, heart, jelly, label, mapPiece, palm, scene, spark, star } from '../art.ts';
import type { Idea } from '../types.ts';

export const MODE_IDEAS: Idea[] = [
  {
    id: 'jelly-freeze',
    n: 2,
    title: 'Застывшие желейки',
    category: 'mode',
    size: 'M',
    pitch: 'Салки: водящий превращает догнанных в застывшее желе, свободные расколдовывают их объятием (клавиша 6, она уже есть).',
    fun: 'Беготня и спасение друзей; объятия получают смысл; одного водящего ловят втроём.',
    net: true,
    art: () =>
      scene('deck', 'Желейка застыла как лёд, к ней бежит друг с раскрытыми руками', [
        jelly({ x: 150, y: 184, c: 'ice', face: 'oh', arms: 'up', s: 1.05 }),
        `<path d="M118 178L126 150L134 178ZM170 180L180 142L190 180ZM150 186L158 164L166 186Z" fill="#e4f6ff" stroke="#9fd3ee" stroke-width="2" stroke-linejoin="round" opacity=".9"/>`,
        spark(120, 110, 8, '#fff'), spark(190, 96, 6, '#dff4ff'), spark(168, 70, 5, '#fff'),
        jelly({ x: 52, y: 188, c: 'sky', face: 'cheer', arms: 'out', s: 0.85 }),
        heart(60, 92, 1.3),
        jelly({ x: 268, y: 186, c: 'orange', face: 'smug', arms: 'up', s: 0.85, flip: true }),
        `<path d="M240 140l-16 2M240 152l-20 2" stroke="${COLOR.ink}" stroke-width="2.4" stroke-linecap="round" opacity=".4"/>`,
      ]),
  },
  {
    id: 'draw-guess',
    n: 3,
    title: 'Рисуй и угадывай',
    category: 'mode',
    size: 'M',
    pitch: 'Один рисует слово на большой доске у кафе (подошёл — мышь свободна, как за столом дурака), остальные угадывают в чате. Рисунки остаются висеть.',
    fun: 'Любой рисунок выходит смешным; идеально под голосовой чат.',
    art: () =>
      scene('deck', 'Желейка рисует на большой доске, остальные гадают', [
        easel(120, 178, 1.2),
        jelly({ x: 206, y: 184, c: 'purple', hat: 'straw', face: 'smug', arms: 'wave', s: 0.9, flip: true }),
        jelly({ x: 40, y: 188, c: 'mint', face: 'oh', arms: 'up', s: 0.8 }),
        jelly({ x: 280, y: 188, c: 'pink', face: 'cheer', arms: 'up', s: 0.8, flip: true }),
        bubble(14, 70, 52, 'кот?', 'l', 12),
        bubble(246, 66, 62, 'рыба!', 'r', 12),
      ]),
  },
  {
    id: 'cafe-rush',
    n: 4,
    title: 'Кафе в запаре',
    category: 'mode',
    size: 'L',
    pitch: 'Кооператив на 2–4: заказы котов-посетителей, плита, чайник, стойка. Не сжечь и не уронить.',
    fun: 'Общий пожар на кухне сплачивает лучше любой стратегии: друзья кричат друг на друга и смеются.',
    touches: 'Кафе «Чайка» занято картами: это отдельная комната, но решение за вами.',
    art: () =>
      scene('deck', 'Две желейки в поварских колпаках спасают кухню, на плите пламя', [
        jelly({ x: 90, y: 170, c: 'orange', hat: 'chef', face: 'oh', arms: 'up', s: 0.95 }),
        jelly({ x: 214, y: 170, c: 'mint', hat: 'chef', face: 'laugh', arms: 'hold', s: 0.95, flip: true }),
        `<rect x="14" y="146" width="292" height="34" rx="6" fill="#cf8f45" stroke="${COLOR.woodDark}" stroke-width="3"/><rect x="14" y="146" width="292" height="9" rx="4" fill="#e8b06b"/>`,
        // сковорода с огнём
        `<ellipse cx="62" cy="144" rx="26" ry="6" fill="#46505a"/><path d="M88 142L116 136" stroke="#46505a" stroke-width="5" stroke-linecap="round"/>`,
        `<path d="M62 142C48 140 50 120 62 104C74 120 76 140 62 142Z" fill="${COLOR.orange}"/><path d="M62 142C55 140 56 130 62 120C68 130 69 140 62 142Z" fill="${COLOR.yellow}"/>`,
        `<circle cx="52" cy="88" r="9" fill="#9aa6b0" opacity=".7"/><circle cx="64" cy="72" r="11" fill="#9aa6b0" opacity=".55"/>`,
        // чайник
        `<path d="M248 146C244 126 252 118 264 118C276 118 284 126 280 146Z" fill="#8fd0ff" stroke="#4f9fd6" stroke-width="2.4" stroke-linejoin="round"/><path d="M280 128Q294 124 292 116" stroke="#4f9fd6" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M256 118Q264 108 272 118" stroke="#4f9fd6" stroke-width="3" fill="none"/>`,
        // заказы на ниточке
        `<path d="M130 36Q160 46 190 36" stroke="${COLOR.ink}" stroke-width="1.6" fill="none"/><rect x="134" y="38" width="22" height="26" rx="2" fill="${COLOR.paper}" stroke="${COLOR.ink}" stroke-width="1.6"/><rect x="164" y="42" width="22" height="26" rx="2" fill="#fff" stroke="${COLOR.ink}" stroke-width="1.6"/>`,
        `<path d="M139 46h12M139 53h8M169 50h12M169 57h9" stroke="${COLOR.red}" stroke-width="2" stroke-linecap="round"/>`,
        label(160, 24, 'ЗАКАЗЫ', 10, COLOR.ink, 900),
      ]),
  },
  {
    id: 'treasure-quarters',
    n: 5,
    title: 'Клад на четверых',
    category: 'mode',
    size: 'L',
    island: true,
    pitch: 'Карта клада разорвана на 4 куска, у каждого игрока свой. Собрать маршрут голосом и выкопать сундук (остров).',
    fun: 'Без разговора не пройти: голос становится частью механики.',
    art: () =>
      scene('sand', 'Четыре желейки с кусками карты и сундук под песком', [
        palm(286, 150, 0.9),
        chest(250, 178, 0.95),
        mapPiece(64, 52, -8, `<path d="M-14 8Q-4-6 6 4T16-8" stroke="${COLOR.blue}" stroke-width="2.4" fill="none"/>`),
        mapPiece(116, 40, 6, `<circle cx="-4" cy="2" r="5" fill="${COLOR.green}"/><path d="M-4 2v-9" stroke="${COLOR.brown}" stroke-width="2"/>`),
        mapPiece(168, 52, -4, `<path d="M-12 8L-4-6L2 2L10-8" stroke="${COLOR.gray}" stroke-width="3" fill="none" stroke-linejoin="round"/>`),
        mapPiece(220, 40, 8, `<path d="M-8-8L8 8M8-8L-8 8" stroke="${COLOR.red}" stroke-width="4" stroke-linecap="round"/>`),
        jelly({ x: 64, y: 186, c: 'orange', face: 'smile', arms: 'up', s: 0.62 }),
        jelly({ x: 116, y: 186, c: 'sky', face: 'oh', arms: 'up', s: 0.62 }),
        jelly({ x: 168, y: 186, c: 'pink', face: 'cheer', arms: 'up', s: 0.62 }),
        jelly({ x: 220, y: 188, c: 'green', face: 'smug', arms: 'up', s: 0.62 }),
        star(290, 40, 8),
        confetti(5, 20, 100, 300, 130, 8),
      ]),
  },
];
