// Зазывалы входов: наряды и реплики (без three.js и DOM — их проверяют тесты). Позиции — у строителей входов.
// Реплика в облачке — не длиннее BUBBLE_CHARS (60) знаков: больше обрежется.
import type { Outfit } from '../../../shared/outfit.ts';

export type ToutKey = 'paint' | 'fort' | 'sky' | 'kart' | 'hide' | 'regatta' | 'boat' | 'fight' | 'cafe' | 'aqua';

export interface ToutInfo {
  id: number;
  name: string;
  accent: string;
  outfit: Outfit;
  /** Реплики по умолчанию (без живого статуса) */
  lines: readonly string[];
}

export const TOUT_INFO: Readonly<Record<ToutKey, ToutInfo>> = {
  paint: {
    id: 960, name: 'Краскомёт Паша', accent: '#ff5a4d',
    outfit: { c: 5, c2: 14, p: 'camo', e: 'shades', h: 'helmet', a: 'none' },
    lines: ['Пейнтбол! Шарики с краской — бесплатно', 'Встань в круг у ворот — и сразу в бой', 'Красные против синих, всё по-честному'],
  },
  fort: {
    id: 961, name: 'Зомби Зуко', accent: '#9bd13b',
    outfit: { c: 6, c2: 5, p: 'spots', e: 'sleepy', h: 'none', a: 'scarf' },
    lines: ['Мозги... то есть защитники! Заходи', 'На стенах не хватает рук. Живых', 'Волна за волной — держи стену'],
  },
  sky: {
    id: 962, name: 'Верхолаз Вова', accent: '#5ab8ff',
    outfit: { c: 8, c2: 15, p: 'stripes', e: 'glasses', h: 'helmet', a: 'scarf' },
    lines: ['Выше облаков! Кто со мной на каланчу?', 'Прыгай, лезь, не падай — места есть', 'С верхушки видно всю набережную'],
  },
  kart: {
    id: 963, name: 'Механик Гена', accent: '#ff8a1c',
    outfit: { c: 3, c2: 15, p: 'none', e: 'happy', h: 'cap', a: 'headphones' },
    lines: ['Картинг! Встань в круг — и на трассу', 'Три круга по порту. Тормоз — для слабаков', 'Шлем не нужен: ты и так мягкий'],
  },
  hide: {
    id: 964, name: 'Бочка', accent: '#d9913c',
    outfit: { c: 13, c2: 15, p: 'none', e: 'sleepy', h: 'fisher', a: 'mustache' },
    lines: ['Я — бочка. Самая обычная бочка', 'Тут никого нет. Только рыба и бочки', 'Рыбный двор: спрячься — или найди'],
  },
  regatta: {
    id: 965, name: 'Боцман Борис', accent: '#5ab8ff',
    outfit: { c: 9, c2: 15, p: 'stripes', e: 'normal', h: 'sailor', a: 'mustache' },
    lines: ['Портовая регата! Катера — на старт!', 'До шести катеров, победитель — один', 'Три круга по бухте. Кто первый — герой'],
  },
  boat: {
    id: 966, name: 'Капитан Сева', accent: '#ffd23f',
    outfit: { c: 15, c2: 9, p: 'stripes', e: 'happy', h: 'captain', a: 'tunic' },
    lines: ['Катер «Ласточка»! Минута по бухте', 'Первый платит десять, друзьям — бесплатно', 'Четыре места. Прыгай в катер, жми E'],
  },
  fight: {
    id: 967, name: 'Вышибала Макс', accent: '#ff4d6d',
    outfit: { c: 2, c2: 15, p: 'none', e: 'shades', h: 'none', a: 'chain' },
    lines: ['Fight Club: подвал, кулаки, чай потом', 'Встань в круг мелом — и вниз', 'Строго по очереди. Я слежу'],
  },
  cafe: {
    id: 968, name: 'Бариста Тоня', accent: '#ffd23f',
    outfit: { c: 12, c2: 15, p: 'dots', e: 'happy', h: 'bandana', a: 'bowtie' },
    lines: ['Афиша на окне: что сегодня в городе', 'Чай, карты и последние новости', 'Заходи на террасу — столы свободны'],
  },
  aqua: {
    id: 969, name: 'Спасатель Лёва', accent: '#ff4d6d',
    outfit: { c: 0, c2: 15, p: 'none', e: 'shades', h: 'panama', a: 'lifebuoy' },
    lines: [
      'Аквапарк «Волна»! Сойди с мостика — пойдёт время',
      'Упал в воду — не беда, вернёшься на мостик',
      'Зелёный батут — на ступень, красный — на башню',
      'Верхняя палуба — только на лифте',
    ],
  },
};

