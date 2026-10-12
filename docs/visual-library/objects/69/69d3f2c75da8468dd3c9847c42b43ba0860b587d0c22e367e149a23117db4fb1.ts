// Экран загрузки режима: картина на весь экран, желейка-ведущая с подсказками в облачке, название, подпись,
// «что строим» и слово старта. Картины и желейки нарисованы Codex (client/assets/loading/, промпты — PROVENANCE.md).
// Подсказки — короткие и общие: режимы переделываются, точные клавиши живут в их собственном интерфейсе.
import type { RoomKind } from '../../shared/messages.ts';

/** Картинки экрана загрузки — свои файлы сборки: CSP пускает картинки только со своего адреса и data: */
const FILES = import.meta.glob('../assets/loading/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const file = (name: string): string => FILES[`../assets/loading/${name}.webp`] ?? '';

export interface ModeCard {
  title: string;
  sub: string;
  /** Что пишем, пока строим мир */
  build: string;
  /** Слово на старте после отсчёта 3-2-1 */
  go: string;
  tips: readonly string[];
  /** Картина на весь экран, 16:9 */
  art: string;
  /** Где в картине главное (object-position): на узком экране кадрируем вокруг него */
  focus: string;
  /** Желейка-ведущая, прозрачный фон */
  jelly: string;
  /** Цвет режима: небо, пока картина не пришла, и кружок отсчёта */
  tint: string;
}

const card = (kind: RoomKind, c: Omit<ModeCard, 'art' | 'jelly'>): ModeCard => ({ ...c, art: file(kind), jelly: file(`${kind}-jelly`) });

export const MODE_CARDS: Record<RoomKind, ModeCard> = {
  lobby: card('lobby', {
    title: 'Набережная',
    sub: 'Возвращаемся в город',
    build: 'Открываем набережную…',
    go: 'Привет!',
    tint: '#ffd35a',
    focus: '38% 50%',
    tips: [
      'Tab — кто где и кто во что играет',
      'Жетоны тратятся на автоматы и наряды в примерочной',
      'Enter — чат, 1–4 — эмоции',
      'В воду не падай 🌊',
    ],
  }),
  paintball: card('paintball', {
    title: 'Пейнтбол',
    sub: 'Бой на складе: Черника против Мандарина',
    build: 'Расставляем ящики на складе…',
    go: 'В бой!',
    tint: '#93a2ff',
    focus: '48% 50%',
    tips: [
      'В разминку дёргай рычаг автомата — бонусы на весь раунд',
      'AWP лежит на кресте — кто первый добежал, у того снайперка',
      'После появления пару секунд в тебя не попасть — осмотрись',
      '/team — сменить команду, /kill — снова на базу',
    ],
  }),
  race: card('race', {
    title: 'Картинг',
    sub: 'Гонка на картах',
    build: 'Размечаем трассу…',
    go: 'Вперёд!',
    tint: '#ffb36b',
    focus: '50% 50%',
    tips: [
      'Пробел с рулём — занос, отпусти — ускорение',
      'E — бонус из ящика',
      'R — вернуться на трассу, если застрял',
    ],
  }),
  fort: card('fort', {
    title: 'Крепость',
    sub: 'Держим ворота и кристалл вместе',
    build: 'Поднимаем стены…',
    go: 'Волна!',
    tint: '#7bd88f',
    focus: '50% 40%',
    tips: [
      'Между волнами на террасе открыта лавка',
      'Колокол — «готов»: если готовы все, волна начнётся раньше',
      'Разбили кристалл — игра окончена. Берегите ворота',
    ],
  }),
  fight: card('fight', {
    title: 'Fight Club',
    sub: 'Подвал. Правила ты знаешь',
    build: 'Включаем лампы в подвале…',
    go: 'Бой!',
    tint: '#ff6b6b',
    focus: '50% 50%',
    tips: [
      'ЛКМ — джеб, три подряд — серия; ПКМ — тяжёлый',
      'Q — блок, Shift — уклон, E — захват и бросок',
      'Лампы гаснут — держись света, в темноте больнее',
      'Первое правило Fight Club…',
    ],
  }),
  skill: card('skill', {
    title: 'Выше облаков',
    sub: 'Полоса препятствий над облаками',
    build: 'Развешиваем острова над облаками…',
    go: 'Старт!',
    tint: '#9ec0e6',
    focus: '50% 50%',
    tips: [
      'Падение возвращает на последнюю контрольную точку',
      'Таймер начнётся, когда сойдёшь со стартового острова',
      'Друзья видны на полосе — можно идти наперегонки',
    ],
  }),
  hide: card('hide', {
    title: 'Прятки',
    sub: 'Предметы против искателя',
    build: 'Расставляем бочки и скамейки…',
    go: 'Прячьтесь!',
    tint: '#ffd35a',
    focus: '50% 50%',
    tips: [
      'Предмет: прячься среди похожих и не шевелись',
      'Искатель: каждый промах отнимает время',
      'Прислушивайся: шорох выдаёт, где кто-то прячется',
    ],
  }),
};

/** Подсказки по кругу: на экране сменяются три (их место в CSS рассчитано на три), при следующем входе круг начнётся со следующей. */
const shown = new Map<RoomKind, number>();
export function nextTips(kind: RoomKind): string[] {
  const list = MODE_CARDS[kind].tips;
  const n = shown.get(kind) ?? Math.floor(Math.random() * list.length);
  shown.set(kind, n + 1);
  return [0, 1, 2].map((i) => list[(n + i) % list.length]);
}

/**
 * Картины всех режимов — заранее в кэш браузера (тихо, после входа в игру): на экране загрузки они готовы сразу,
 * а не догружаются, пока главный поток строит мир. Ссылки держим, чтобы браузер их не выбросил.
 */
let preloaded: HTMLImageElement[] | null = null;
export function preloadArt(): void {
  if (preloaded) return;
  preloaded = [];
  for (const c of Object.values(MODE_CARDS)) {
    for (const url of [c.art, c.jelly]) {
      if (!url) continue;
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = 'low';
      img.src = url;
      preloaded.push(img);
    }
  }
}
