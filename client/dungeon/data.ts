// «Подземелье»: подписи и значки для интерфейса (числа и правила — в симуляции и docs/survivors/design-data.json).
import type { MobKind } from './view.ts';

export interface ItemInfo {
  name: string;
  icon: string;
  max: number;
  text: string;
}

export const WEAPONS: Record<string, ItemInfo> = {
  lantern: { name: 'Фонарь', icon: '🏮', max: 7, text: 'Вспышка конусом в ближайшего' },
  embers: { name: 'Угольки', icon: '🔥', max: 7, text: 'Самонаводящиеся угольки' },
  pickaxe: { name: 'Кирка', icon: '⛏', max: 7, text: 'Летит по ходу и возвращается' },
  fireflies: { name: 'Светляки', icon: '✨', max: 7, text: 'Кружат вокруг героя' },
  spark: { name: 'Искра', icon: '⚡', max: 7, text: 'Бьёт цепью по врагам' },
  stalactites: { name: 'Сталактиты', icon: '🪨', max: 7, text: 'Падают на толпу сверху' },
  charges: { name: 'Шашки', icon: '🧨', max: 7, text: 'Ловушки на полу' },
  beam: { name: 'Маячный луч', icon: '🔦', max: 7, text: 'Луч насквозь через толпу' },
  lantern_evo: { name: 'Негасимый фонарь', icon: '🏮', max: 1, text: 'Вспышки вперёд и назад, поджигают' },
  stalactites_evo: { name: 'Обвал', icon: '🪨', max: 1, text: 'Чаще и глыба на толпу' },
  beam_evo: { name: 'Маяк', icon: '🗼', max: 1, text: 'Два луча крутятся вокруг' },
  fireflies_evo: { name: 'Рой светляков', icon: '✨', max: 1, text: 'Два кольца, лечат' },
};

export const PASSIVES: Record<string, ItemInfo> = {
  might: { name: 'Фитиль', icon: '🕯', max: 5, text: '+10 % урона' },
  cooldown: { name: 'Лампадное масло', icon: '🫗', max: 5, text: '−8 % перезарядки' },
  area: { name: 'Линза', icon: '🔍', max: 5, text: '+10 % области' },
  amount: { name: 'Кремень', icon: '🪨', max: 2, text: '+1 снаряд всем' },
  maxhp: { name: 'Кожаный фартук', icon: '🦺', max: 5, text: '+20 здоровья' },
  armor: { name: 'Каска', icon: '⛑', max: 5, text: '−1 к каждому удару' },
  speed: { name: 'Подкованные сапоги', icon: '🥾', max: 5, text: '+8 % скорости, рывок чаще' },
  magnet: { name: 'Подкова', icon: '🧲', max: 5, text: '+25 % подбора' },
};

export const MISC: Record<string, ItemInfo> = {
  stew: { name: 'Похлёбка', icon: '🍲', max: 99, text: '+30 HP' },
  temper: { name: 'Закалка', icon: '⚒', max: 15, text: '+2 % урона' },
};

export const MOBS: Record<MobKind, { name: string; icon: string }> = {
  rat: { name: 'Крыса', icon: '🐀' },
  bat: { name: 'Мышь', icon: '🦇' },
  slime: { name: 'Слизень', icon: '🫐' },
  slimelet: { name: 'Слизнёнок', icon: '🫐' },
  shroom: { name: 'Грибник', icon: '🍄' },
  beetle: { name: 'Щитожук', icon: '🪲' },
  spitter: { name: 'Плевун', icon: '🐸' },
  larva: { name: 'Личинка', icon: '🐛' },
  barrel: { name: 'Бочар', icon: '🛢' },
  shaman: { name: 'Грибной шаман', icon: '🧙' },
};

export const BUFFS: Record<string, { name: string; icon: string }> = {
  fury: { name: 'Ярость', icon: '💢' },
  haste: { name: 'Спешка', icon: '⏩' },
  wind: { name: 'Ветер', icon: '🌬' },
  pull: { name: 'Притяжение', icon: '🧲' },
};

export const BOSS_NAME = 'Старый Повидл';

/** Склонение: 1 волна, 2 волны, 5 волн */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
