// Одежда: костюмы, зонтик, следы. Прототипов нет: гардероб ограничен аудитом (не плодить дорогие вещи без проверки сочетаний).
import { COLOR, heart, jelly, raft, scene, spark, trophyBadge, umbrella } from '../art.ts';
import type { Idea } from '../types.ts';

const bubbles = (list: Array<[number, number, number]>): string =>
  list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity=".35" stroke="#7ad0e8" stroke-width="2"/>`).join('');

export const OUTFIT_IDEAS: Idea[] = [
  {
    id: 'umbrella-glider',
    n: 12,
    title: 'Зонтик-планер',
    category: 'outfit',
    size: 'M',
    net: true,
    pitch: 'Зонтик от дождя и парашют: прыгнул с колеса или маяка — спланировал на плот-мишень.',
    fun: 'Мэри Поппинс плюс турнир «кто ближе к центру»; в дождь ещё и красиво.',
    touches: 'Меняет общую физику (shared/sim.ts): осторожно с «Выше облаков». Делаем после проверки гардероба.',
    art: () =>
      scene('sky', 'Желейка плавно спускается под красным зонтиком к плоту-мишени', [
        `<path d="M40 40Q120 30 190 150" stroke="${COLOR.ink}" stroke-width="2.4" fill="none" stroke-dasharray="3 7" stroke-linecap="round" opacity=".45"/>`,
        umbrella(150, 98, 1.05, 8),
        jelly({ x: 150, y: 132, c: 'purple', face: 'cheer', arms: 'up', s: 0.55, rot: 8, shadow: false }),
        raft(236, 186, 1.2),
        spark(40, 40, 7, '#fff'),
      ]),
  },
  {
    id: 'food-costumes',
    n: 13,
    title: 'Костюмы-еда',
    category: 'outfit',
    size: 'M',
    net: true,
    pitch: 'Весь корпус желейки в виде арбуза, пончика, пельменя, суши (не шапка, а целый костюм).',
    fun: 'Групповые снимки «мы — обед»; арбузная каска из «Горячего арбуза» становится трофеем.',
    touches: 'Гардероб: не плодить дорогие вещи, пока не проверены сочетания с катером и сиденьем.',
    art: () =>
      scene('deck', 'Три желейки в костюмах арбуза, пончика и суши', [
        jelly({
          x: 62, y: 186, c: 'melon', face: 'cheer', arms: 'up', s: 1,
          body: `<path d="M-22-70Q-30-35-22-6M0-80V4M22-70Q30-35 22-6" stroke="#2c8a3c" stroke-width="6" fill="none" stroke-linecap="round" opacity=".75"/>`,
        }),
        jelly({
          x: 160, y: 186, c: 'donut', face: 'smile', arms: 'up', s: 1,
          body:
            `<path d="M-36-34C-43-62-30-79 0-83C30-79 43-62 36-34Q29-24 22-34Q15-22 7-34Q0-22-8-34Q-16-22-23-34Q-30-24-36-34Z" fill="#ff9ec7"/>` +
            `<rect x="-20" y="-64" width="6" height="2.6" rx="1.3" fill="#fff" transform="rotate(30 -17 -63)"/><rect x="6" y="-70" width="6" height="2.6" rx="1.3" fill="#4a63ff" transform="rotate(-20 9 -69)"/><rect x="18" y="-52" width="6" height="2.6" rx="1.3" fill="#ffd23f" transform="rotate(60 21 -51)"/><rect x="-26" y="-46" width="6" height="2.6" rx="1.3" fill="#5ccf7a" transform="rotate(-50 -23 -45)"/>`,
        }),
        jelly({
          x: 258, y: 186, c: 'white', face: 'cheer', arms: 'up', s: 1,
          body:
            `<path d="M-39-52Q0-46 39-52V-28Q0-22-39-28Z" fill="#2d3a2e"/>` +
            `<ellipse cx="0" cy="-80" rx="22" ry="8" fill="#ff8a6a"/><path d="M-16-80Q0-86 16-80" stroke="#ffd0c0" stroke-width="2" fill="none"/>`,
        }),
        spark(112, 60, 8, '#fff'), spark(212, 54, 7, '#fff'),
        `<g fill="none" stroke="${COLOR.ink}" stroke-width="2.4" stroke-linecap="round" opacity=".5"><path d="M24 26h16v-8M296 26h-16v-8M24 120h16v8M296 120h-16v8" transform="translate(0 0)"/></g>`,
      ]),
  },
  {
    id: 'trails',
    n: 14,
    title: 'Следы и эффекты',
    category: 'outfit',
    size: 'M',
    net: true,
    pitch: 'Цветы, пузыри, сердечки или радуга за ногами, писк при шаге. Покупается на 10 минут за жетоны.',
    fun: '«Я тут был»; по следам находишь друга; ещё один повод потратить жетоны.',
    touches: 'Гардероб: не плодить дорогие вещи; эффекты видны всем, нужен протокол.',
    art: () =>
      scene('grass', 'Желейка идёт и оставляет за собой цветы, сердечки и пузыри', [
        `<g>${[40, 70, 100, 130].map((x, i) => `<g transform="translate(${x} ${178 + (i % 2) * 6})"><circle cx="0" cy="-4" r="4" fill="${i % 2 ? '#fff' : '#ffd23f'}"/>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-10" rx="3.4" ry="5" transform="rotate(${a} 0 -4)" fill="${i % 2 ? '#ff9ec7' : '#ff7a7a'}"/>`).join('')}</g>`).join('')}</g>`,
        heart(60, 150, 1.1, COLOR.pink), heart(110, 158, 1, '#ff7a9c'),
        bubbles([[84, 140, 8], [132, 130, 6], [152, 150, 5]]),
        jelly({ x: 218, y: 184, c: 'yellow', face: 'cheer', arms: 'out', s: 1 }),
        trophyBadge(250, 28, 'на 10 минут', 92),
      ]),
  },
];
