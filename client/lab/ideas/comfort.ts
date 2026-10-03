// Удобство: мелочи, которые экономят друзьям время. «Зов на игру» — самая нужная: у него метка «очень полезно».
import { COLOR, bubble, beam, camera, confetti, heart, jelly, label, megaphone, scene, spark, wheel } from '../art.ts';
import type { Idea } from '../types.ts';

export const COMFORT_IDEAS: Idea[] = [
  {
    id: 'ping-beacon',
    n: 27,
    title: 'Маячок «все ко мне»',
    category: 'comfort',
    size: 'S',
    net: true,
    pitch: 'Клавиша G ставит световой столб и стрелку в точку, куда смотришь; видят все в комнате 8 секунд.',
    fun: 'Собраться без «у колеса… нет, у другого колеса».',
    art: () =>
      scene('deck', 'Над настилом стоит световой столб со стрелкой, все смотрят на него', [
        beam(250, 176, 120, COLOR.yellow),
        jelly({ x: 52, y: 188, c: 'orange', face: 'smile', arms: 'wave', s: 0.8, look: 1 }),
        jelly({ x: 112, y: 184, c: 'sky', face: 'oh', arms: 'down', s: 0.7, look: 1 }),
        jelly({ x: 168, y: 186, c: 'pink', face: 'cheer', arms: 'up', s: 0.75, look: 1 }),
        `<rect x="20" y="24" width="30" height="26" rx="6" fill="#fff" stroke="${COLOR.ink}" stroke-width="2.4"/>${label(35, 43, 'G', 16, COLOR.ink, 900)}`,
        spark(210, 90, 6, '#fff'), spark(286, 70, 5, '#fff'),
      ]),
  },
  {
    id: 'call-to-play',
    n: 28,
    title: 'Зов на игру',
    category: 'comfort',
    size: 'M',
    net: true,
    priority: true,
    pitch: 'Кнопка «зову на картинг/дурака»: всем приходит приглашение, по «Иду» человек встаёт в круг.',
    fun: 'Главная боль компании — собраться в одну игру.',
    touches: 'Сбор в круге и ожидание пересекаются с loading: переиспользовать ModeQueue.',
    art: () =>
      scene('deck', 'Желейка зовёт друзей в игру в рупор, они отвечают «Иду!»', [
        jelly({ x: 62, y: 186, c: 'orange', face: 'cheer', arms: 'hold', s: 1 }),
        megaphone(100, 128, 1, -8),
        bubble(100, 40, 128, 'Зову на картинг!', 'l', 12),
        `<ellipse cx="248" cy="182" rx="62" ry="14" fill="none" stroke="${COLOR.red}" stroke-width="3" stroke-dasharray="8 6"/>`,
        jelly({ x: 218, y: 180, c: 'sky', face: 'laugh', arms: 'up', s: 0.7 }),
        jelly({ x: 258, y: 186, c: 'pink', face: 'cheer', arms: 'up', s: 0.7 }),
        jelly({ x: 292, y: 180, c: 'green', face: 'cheer', arms: 'up', s: 0.7, flip: true }),
        bubble(236, 76, 64, 'Иду!', 'r', 12),
        heart(176, 120, 0.9),
        confetti(3, 200, 110, 310, 150, 10),
      ]),
  },
  {
    id: 'photo-mode',
    n: 29,
    title: 'Фоторежим',
    category: 'comfort',
    size: 'S',
    pitch: 'Клавиша P: без интерфейса, свободная камера, рамки, таймер на 5 секунд.',
    fun: 'Готовые кадры для друзей, не нужен скриншот с интерфейсом.',
    art: () =>
      scene('sand', 'Желейка позирует внутри рамки видоискателя, на экране таймер 5', [
        jelly({ x: 160, y: 188, c: 'yellow', hat: 'straw', face: 'cheer', arms: 'wave', s: 1.1 }),
        `<g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M36 50V30H56M284 50V30H264M36 150V170H56M284 150V170H264"/></g>`,
        `<rect x="246" y="38" width="32" height="32" rx="8" fill="#fff" stroke="${COLOR.ink}" stroke-width="2.4"/>${label(262, 62, '5', 22, COLOR.ink, 900)}`,
        camera(52, 190, 0.8),
        spark(214, 80, 8, '#fff'), spark(110, 70, 6, '#fff'),
      ]),
  },
  {
    id: 'emote-wheel',
    n: 30,
    title: 'Колесо эмоций',
    category: 'comfort',
    size: 'M',
    net: true,
    pitch: 'Держишь клавишу — колесо из 8–10 жестов: поклон, фейспалм, шпагат, сальто, конфетти-хлопушка.',
    fun: 'Больше способов выглядеть смешно, чем четыре эмоции.',
    art: () =>
      scene('deck', 'Желейка выбирает жест на круговом колесе', [
        wheel(212, 98, 78),
        jelly({ x: 62, y: 188, c: 'purple', face: 'laugh', arms: 'up', s: 1 }),
        confetti(9, 14, 80, 110, 150, 12),
        label(62, 30, 'держи клавишу', 11, COLOR.ink, 700),
      ]),
  },
];
