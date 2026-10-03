// Экран загрузки режима: название, подпись, рисунок (inline SVG в палитре игры) и подсказки.
// Подсказки — короткие и общие: режимы переделываются, точные клавиши живут в их собственном интерфейсе.
import type { RoomKind } from '../../shared/messages.ts';

export interface ModeCard {
  title: string;
  sub: string;
  /** Что пишем, пока строим мир */
  build: string;
  /** Слово на старте после отсчёта 3-2-1 */
  go: string;
  tips: readonly string[];
  /** Рисунок 120×120 */
  svg: string;
  /** Цвет подложки медальона */
  tint: string;
}

const svg = (body: string): string => `<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">${body}</svg>`;

const WAVES = '<path d="M4 98c9-6 17 5 26 0s17-6 26 0 17 6 26 0 17-6 26 0 8 5 8 5v17H4z" fill="#3fb6a8"/>'
  + '<path d="M4 106c9-5 17 4 26 0s17-5 26 0 17 5 26 0 17-5 26 0 8 4 8 4v8H4z" fill="#2c8f86"/>';

export const MODE_CARDS: Record<RoomKind, ModeCard> = {
  lobby: {
    title: 'Набережная',
    sub: 'Возвращаемся в город',
    build: 'Открываем набережную…',
    go: 'Привет!',
    tint: '#ffd35a',
    tips: [
      'Tab — кто где и кто во что играет',
      'Жетоны тратятся на автоматы и наряды в примерочной',
      'Enter — чат, 1–4 — эмоции',
      'В воду не падай 🌊',
    ],
    svg: svg(
      '<circle cx="93" cy="27" r="11" fill="#ffd35a"/>'
      + '<path d="M51 36h18l7 58H44z" fill="#fff3de"/>'
      + '<path d="M48.6 55h22.8l1.5 12H47.1zM46.2 75h27.6l1.4 11H44.8z" fill="#e0283a"/>'
      + '<rect x="47" y="24" width="26" height="13" rx="3" fill="#2a1f24"/>'
      + '<rect x="51" y="27" width="18" height="7" rx="2" fill="#ffd35a"/>'
      + '<path d="M45 25l15-12 15 12z" fill="#e0283a"/>'
      + WAVES,
    ),
  },
  paintball: {
    title: 'Пейнтбол',
    sub: 'Бой на складе: Черника против Мандарина',
    build: 'Расставляем ящики на складе…',
    go: 'В бой!',
    tint: '#93a2ff',
    tips: [
      'В разминку дёргай рычаг автомата — бонусы на весь раунд',
      'AWP лежит на кресте — кто первый добежал, у того снайперка',
      'После появления пару секунд в тебя не попасть — осмотрись',
      '/team — сменить команду, /kill — снова на базу',
    ],
    svg: svg(
      '<circle cx="50" cy="52" r="27" fill="#4a63ff"/>'
      + '<circle cx="24" cy="34" r="7" fill="#4a63ff"/><circle cx="80" cy="30" r="6" fill="#4a63ff"/>'
      + '<circle cx="20" cy="70" r="5" fill="#4a63ff"/><circle cx="62" cy="88" r="7" fill="#4a63ff"/>'
      + '<circle cx="34" cy="20" r="3.5" fill="#4a63ff"/><circle cx="88" cy="50" r="4" fill="#4a63ff"/>'
      + '<circle cx="80" cy="82" r="19" fill="#ff8a1c"/><circle cx="73" cy="75" r="6" fill="#ffb36b"/>'
      + '<circle cx="42" cy="44" r="7" fill="#93a2ff" opacity=".55"/>',
    ),
  },
  race: {
    title: 'Картинг',
    sub: 'Гонка на картах',
    build: 'Размечаем трассу…',
    go: 'Вперёд!',
    tint: '#ffb36b',
    tips: [
      'Пробел с рулём — занос, отпусти — ускорение',
      'E — бонус из ящика',
      'R — вернуться на трассу, если застрял',
    ],
    svg: svg(
      '<rect x="24" y="14" width="6" height="92" rx="3" fill="#2a1f24"/>'
      + '<path d="M30 16h62v42H30z" fill="#fff3de"/>'
      + '<path d="M30 16h12.4v10.5H30zM54.8 16h12.4v10.5H54.8zM79.6 16H92v10.5H79.6zM42.4 26.5h12.4V37H42.4zM67.2 26.5h12.4V37H67.2zM30 37h12.4v10.5H30zM54.8 37h12.4v10.5H54.8zM79.6 37H92v10.5H79.6zM42.4 47.5h12.4V58H42.4zM67.2 47.5h12.4V58H67.2z" fill="#2a1f24"/>'
      + '<circle cx="80" cy="88" r="20" fill="#2a1f24"/><circle cx="80" cy="88" r="10" fill="#ff8a1c"/><circle cx="80" cy="88" r="4" fill="#fff3de"/>',
    ),
  },
  fort: {
    title: 'Крепость',
    sub: 'Держим ворота и кристалл вместе',
    build: 'Поднимаем стены…',
    go: 'Волна!',
    tint: '#7bd88f',
    tips: [
      'Между волнами на террасе открыта лавка',
      'Колокол — «готов»: если готовы все, волна начнётся раньше',
      'Разбили кристалл — игра окончена. Берегите ворота',
    ],
    svg: svg(
      '<path d="M22 44h14v-9h10v9h10v-9h10v9h10v-9h10v9h12v62H22z" fill="#c9b38f"/>'
      + '<path d="M22 44h76v8H22z" fill="#a8916d"/>'
      + '<path d="M48 106V82a12 12 0 0 1 24 0v24z" fill="#2a1f24"/>'
      + '<rect x="32" y="60" width="9" height="13" rx="3" fill="#2a1f24"/><rect x="79" y="60" width="9" height="13" rx="3" fill="#2a1f24"/>'
      + '<path d="M60 8l10 14-10 14-10-14z" fill="#7bd88f"/><path d="M60 8l10 14H50z" fill="#b8f5c4"/>',
    ),
  },
  fight: {
    title: 'Fight Club',
    sub: 'Подвал. Правила ты знаешь',
    build: 'Включаем лампы в подвале…',
    go: 'Бой!',
    tint: '#ff6b6b',
    tips: [
      'ЛКМ — джеб, три подряд — серия; ПКМ — тяжёлый',
      'Q — блок, Shift — уклон, E — захват и бросок',
      'Лампы гаснут — держись света, в темноте больнее',
      'Первое правило Fight Club…',
    ],
    svg: svg(
      '<path d="M34 50c0-18 12-28 30-28h6c16 0 26 11 26 27v14c0 13-8 22-20 24H50c-10 0-16-6-16-15z" fill="#e0283a"/>'
      + '<path d="M42 44c6-6 16-6 22 0" stroke="#ff6b6b" stroke-width="6" fill="none" stroke-linecap="round"/>'
      + '<path d="M28 60c0-7 5-12 12-12h4v26h-4c-7 0-12-6-12-14z" fill="#c21d2e"/>'
      + '<rect x="46" y="86" width="34" height="20" rx="5" fill="#fff3de"/>'
      + '<path d="M46 93h34" stroke="#e8d5b5" stroke-width="3"/>',
    ),
  },
  skill: {
    title: 'Выше облаков',
    sub: 'Полоса препятствий над облаками',
    build: 'Развешиваем острова над облаками…',
    go: 'Старт!',
    tint: '#9ec0e6',
    tips: [
      'Падение возвращает на последнюю контрольную точку',
      'Таймер начнётся, когда сойдёшь со стартового острова',
      'Друзья видны на полосе — можно идти наперегонки',
    ],
    svg: svg(
      '<path d="M60 10l12 16H64v14h-8V26h-8z" fill="#ff8a1c"/>'
      + '<path d="M18 60h30l-4 10H22zM68 44h34l-4 10H72z" fill="#a8916d"/><path d="M18 60h30v-4H18zM68 44h34v-4H68z" fill="#7bd88f"/>'
      + '<path d="M10 92c0-8 7-13 14-11 3-9 16-11 22-3 8-4 17 2 16 11 6 1 9 5 9 9H10z" fill="#fff3de"/>'
      + '<path d="M58 104c0-7 6-11 12-9 3-8 14-9 19-2 7-3 15 2 14 9 5 1 8 4 8 8H58z" fill="#f3dfbd"/>',
    ),
  },
  hide: {
    title: 'Прятки',
    sub: 'Предметы против искателя',
    build: 'Расставляем бочки и скамейки…',
    go: 'Прячьтесь!',
    tint: '#ffd35a',
    tips: [
      'Предмет: прячься среди похожих и не шевелись',
      'Искатель: каждый промах отнимает время',
      'Прислушивайся: шорох выдаёт, где кто-то прячется',
    ],
    svg: svg(
      '<path d="M32 30c0-6 56-6 56 0l6 38-6 38c0 6-56 6-56 0l-6-38z" fill="#b5763f"/>'
      + '<path d="M28 50h64M27 86h66" stroke="#2a1f24" stroke-width="6"/>'
      + '<ellipse cx="60" cy="29" rx="28" ry="6" fill="#8f5a2c"/>'
      + '<ellipse cx="49" cy="68" rx="8" ry="9" fill="#fff8e8"/><ellipse cx="71" cy="68" rx="8" ry="9" fill="#fff8e8"/>'
      + '<circle cx="52" cy="70" r="3.6" fill="#30242d"/><circle cx="74" cy="70" r="3.6" fill="#30242d"/>',
    ),
  },
  boatrace: {
    title: 'Гонка катеров',
    sub: 'По бухте до финиша',
    build: 'Спускаем катера на воду…',
    go: 'Вперёд!',
    tint: '#3fb6a8',
    tips: ['Газ, руль и немного удачи на волнах'],
    svg: svg(
      '<path d="M18 74h84l-12 16H34z" fill="#fff3de"/><path d="M40 74V52h26l14 22z" fill="#ff8a1c"/>'
      + '<rect x="46" y="57" width="10" height="9" rx="2" fill="#9ec0e6"/>' + WAVES,
    ),
  },
};

/** Подсказка: по кругу, чтобы при повторном входе была новая. */
const shown = new Map<RoomKind, number>();
export function nextTip(kind: RoomKind): string {
  const list = MODE_CARDS[kind].tips;
  const n = shown.get(kind) ?? Math.floor(Math.random() * list.length);
  shown.set(kind, n + 1);
  return list[n % list.length];
}
