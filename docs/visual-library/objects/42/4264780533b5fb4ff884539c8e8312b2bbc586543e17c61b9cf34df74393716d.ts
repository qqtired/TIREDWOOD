// События: что происходит на набережной по расписанию.
import { COLOR, awning, boat, camera, crate, dolphin, fish, jelly, label, lantern, pier, rod, scene, spark, star, trophyBadge } from '../art.ts';
import type { Idea } from '../types.ts';

export const EVENT_IDEAS: Idea[] = [
  {
    id: 'ferry-dolphins',
    n: 24,
    title: 'Дельфины у борта',
    category: 'event',
    size: 'M',
    net: true,
    island: true,
    pitch: 'В рейсе справа выпрыгивают дельфины. Все бегут к борту, кто успел нажать F — снимок в журнал морских встреч.',
    fun: 'Общее «о-о-о» и коллекция морских встреч.',
    touches: 'Море и паром у boats и barkas: нужны только событие и журнал снимков.',
    art: () =>
      scene('sea', 'С палубы парома видно, как из воды выпрыгивают два дельфина', [
        `<path d="M160 118Q210 40 262 118" stroke="${COLOR.ink}" stroke-width="2" fill="none" stroke-dasharray="3 7" opacity=".35"/>`,
        dolphin(210, 62, 1.1, -14),
        dolphin(282, 118, 0.8, 24),
        `<ellipse cx="262" cy="132" rx="22" ry="5" fill="none" stroke="#fff" stroke-width="2.4"/><ellipse cx="186" cy="118" rx="16" ry="4" fill="none" stroke="#fff" stroke-width="2.4"/>`,
        `<rect x="0" y="146" width="320" height="54" fill="${COLOR.deck}"/><rect x="0" y="146" width="320" height="6" fill="${COLOR.deckDark}"/><path d="M0 146H320" stroke="#fff" stroke-width="4"/>`,
        `<g fill="#fff" stroke="#c9d4de" stroke-width="1.5"><rect x="22" y="120" width="6" height="28" rx="2"/><rect x="82" y="120" width="6" height="28" rx="2"/><rect x="142" y="120" width="6" height="28" rx="2"/></g><path d="M25 124H145" stroke="#c9d4de" stroke-width="3"/>`,
        jelly({ x: 52, y: 184, c: 'orange', face: 'oh', arms: 'up', s: 0.8, look: 1 }),
        jelly({ x: 112, y: 188, c: 'pink', face: 'cheer', arms: 'up', s: 0.8, look: 1 }),
        camera(176, 186, 0.9), spark(194, 150, 7, '#fff'),
        `<rect x="228" y="168" width="26" height="22" rx="6" fill="#fff" stroke="${COLOR.ink}" stroke-width="2.4"/>${label(241, 185, 'F', 15, COLOR.ink, 900)}`,
      ]),
  },
  {
    id: 'merchant-boat',
    n: 25,
    title: 'Странствующий купец',
    category: 'event',
    size: 'M',
    net: true,
    island: true,
    pitch: 'Раз в вечер к пристани на 10 минут причаливает лодка купца: редкие вещи и «подарок дня».',
    fun: 'Ожидание и спешка; друзья советуют друг другу, что брать.',
    touches: 'Море и причал у boats и barkas: делаем только картинку и расписание.',
    art: () =>
      scene('sea', 'Лодка купца с полосатым навесом, ящиками и фонарями причалила к пирсу', [
        pier(232, 150, 100),
        boat(120, 150, 1.5),
        crate(76, 130, 1), crate(104, 130, 0.9, '#cf8f45'),
        `<rect x="150" y="76" width="5" height="70" fill="${COLOR.woodDark}"/><rect x="62" y="76" width="5" height="52" fill="${COLOR.woodDark}"/>`,
        awning(58, 72, 100),
        lantern(70, 98, 1), lantern(146, 98, 1),
        jelly({ x: 126, y: 128, c: 'purple', hat: 'tophat', face: 'smug', arms: 'hold', s: 0.62 }),
        trophyBadge(258, 78, 'Редкое!', 72),
        `<g transform="translate(262 146)"><rect x="-13" y="-22" width="26" height="22" rx="3" fill="${COLOR.red}"/><rect x="-3" y="-22" width="6" height="22" fill="${COLOR.yellow}"/><path d="M0-22Q-12-34-6-26M0-22Q12-34 6-26" stroke="${COLOR.yellow}" stroke-width="3" fill="none" stroke-linecap="round"/></g>`,
        star(284, 112, 7), spark(244, 118, 6, '#fff'),
        jelly({ x: 284, y: 148, c: 'sky', face: 'cheer', arms: 'up', s: 0.5 }),
      ]),
  },
  {
    id: 'fishing-derby',
    n: 26,
    title: 'Рыбацкий турнир',
    category: 'event',
    size: 'M',
    net: true,
    pitch: 'Гудок — 5 минут все ловят; живой счёт на экране; победитель встаёт на подиум и носит значок дня.',
    fun: 'Любимая рыбалка превращается в зрелище с болельщиками (доска и подиум уже есть).',
    touches: 'Доска, подиум и награды рыбалки у fisheco, fishstyle и barkas: награду придумать вместе, здесь только значок дня.',
    art: () =>
      scene('sea', 'Четыре рыбака на пирсе, справа табло с живым счётом', [
        pier(0, 150, 226),
        ...[40, 92, 144, 196].flatMap((x, i) => [
          jelly({ x, y: 148, c: (['orange', 'sky', 'pink', 'green'] as const)[i], hat: i % 2 ? 'straw' : 'none', face: i === 1 ? 'cheer' : 'smile', arms: 'hold', s: 0.62 }),
          rod(x + 8, 120, 0.8, -8),
        ]),
        fish(116, 116, 0.9, -30),
        `<rect x="236" y="52" width="76" height="82" rx="8" fill="${COLOR.paper}" stroke="${COLOR.woodDark}" stroke-width="4"/>`,
        label(274, 70, 'СЧЁТ', 11, COLOR.ink, 900),
        label(274, 88, 'Миша 12', 10, COLOR.ink, 700), label(274, 104, 'Аня 9', 10, COLOR.ink, 700), label(274, 120, 'Коля 7', 10, COLOR.ink, 700),
        `<path d="M236 134L248 150M312 134L300 150" stroke="${COLOR.woodDark}" stroke-width="4"/>`,
      ]),
  },
];
