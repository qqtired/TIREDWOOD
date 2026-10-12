// Справка «Клавиши» в меню: коротко, по группам — карточками кита с клавишами-колпачками (.k-key, мышь — значком .k-mouse).
// Подсказки режимов меняются вместе с режимами — это строки MODES. На телефоне — кнопки на экране (как на экране входа).
import { TOUCH } from '../../touch.ts';
import { iconImg } from '../kit/dom.ts';
import { el } from './controls.ts';

type Keys = ReadonlyArray<readonly [keys: readonly string[], what: string]>;

const GROUPS: ReadonlyArray<readonly [string, Keys]> = [
  ['Ходить', [
    [['W', 'A', 'S', 'D'], 'бег'],
    [['Пробел'], 'прыжок'],
    [['Shift'], 'рывок'],
    [['Мышь'], 'осмотреться'],
  ]],
  ['Действия', [
    [['E'], 'действие: сесть, сыграть, войти'],
    [['ЛКМ'], 'огонь, бросок'],
    [['ПКМ'], 'прицел'],
    [['R'], 'перезарядка'],
    [['1', '2', '3', '4', '5', '6'], 'эмоции: помахать, танец, устал, смех, дать пять, обняться (5 и 6 — с тем, кто перед тобой)'],
    [['7'], 'воздушный змей на набережной: мышь — вести, 7 или Esc — смотать'],
  ]],
  ['Общение', [
    [['Enter'], 'чат'],
    [['V'], 'говорить в голосе (держать)'],
    [['Tab'], 'кто где · счёт (держать); + ПКМ — мышь: громкость и «выгнать»'],
    [['Y', 'N'], 'голосование: за / против'],
  ]],
  ['Меню и звук', [
    [['Esc'], 'меню; ещё раз — закрыть'],
    [['M'], 'звук вкл / выкл'],
  ]],
  ['На набережной', [
    [['J'], 'журнал рыбака'],
    [['Пробел'], 'у автомата — крутить, с удочкой — заброс'],
    [['F'], 'сохранить снимок фотобудки'],
  ]],
];

/** Режимы: одна строка на режим */
const MODES: ReadonlyArray<readonly [string, string]> = [
  ['Пейнтбол', 'ЛКМ — огонь · ПКМ — прицел · R — перезарядка · Q — другое плечо · Tab — счёт'],
  ['Картинг', 'W / S — газ и тормоз · A / D — руль · Пробел — занос · E или ЛКМ — бонус · R — на трассу'],
  ['Катера', 'W — газ · S — тормоз / назад · A / D — руль · E или ЛКМ — нитро · R — к буям'],
  ['Выше облаков', 'Пробел — прыжок · Shift — рывок · R — к точке · N — сначала'],
  ['Прятки', 'искатель: ЛКМ или E — проверить · предмет: 1–4 — облик, E — замереть, R — повернуть, T — шорох'],
];

/** Телефон: «клавиша» — значок экранной кнопки (id в client/assets/ui/icons) или буква; жесты пальцем — словом */
const TOUCH_KEYS: ReadonlyArray<readonly [cap: string, what: string]> = [
  ['слева', 'пальцем — бег'],
  ['справа', 'пальцем — осмотреться'],
  ['⤒', 'прыжок'],
  ['E', 'действие: сесть, сыграть, войти'],
  ['@emote', 'эмоции'],
  ['@chat', 'чат'],
  ['@online', 'кто где · счёт · громкость'],
  ['☰', 'меню'],
];

/** Колпачок клавиши: ЛКМ / ПКМ / Мышь — значком мыши, @id — значком интерфейса */
function cap(text: string): HTMLElement {
  const k = el('kbd', text.length > 2 && !text.startsWith('@') ? 'k-key mn-key-wide' : 'k-key');
  const mouse = ({ ЛКМ: 'l', ПКМ: 'r', Мышь: 'move' } as Record<string, string>)[text];
  if (mouse) {
    const i = k.appendChild(el('i', `k-mouse k-mouse--${mouse}`));
    k.setAttribute('aria-label', text);
    i.setAttribute('aria-hidden', 'true');
    if (mouse === 'move') k.classList.add('mn-key-wide');
  } else if (text.startsWith('@')) {
    k.insertAdjacentHTML('beforeend', iconImg(text.slice(1)));
  } else k.textContent = text;
  return k;
}

export function keysHelp(): HTMLElement {
  const root = el('div', 'keys-help');
  const grid = root.appendChild(el('div', 'keys-grid'));
  const groups: ReadonlyArray<readonly [string, Keys]> = TOUCH ? [['Кнопки на экране', TOUCH_KEYS.map(([c, w]) => [[c], w] as const)]] : GROUPS;
  for (const [title, keys] of groups) {
    const box = grid.appendChild(el('div', 'k-cell keys-box'));
    box.appendChild(el('h3', 'keys-h', title));
    for (const [caps, what] of keys) {
      const row = box.appendChild(el('div', 'keys-row'));
      const k = row.appendChild(el('span', 'k-keys keys-caps'));
      for (const c of caps) k.appendChild(cap(c));
      row.appendChild(el('span', 'keys-what', what));
    }
  }
  if (!TOUCH) {
    const modes = root.appendChild(el('div', 'k-cell keys-box keys-modes'));
    modes.appendChild(el('h3', 'keys-h', 'В режимах'));
    for (const [name, text] of MODES) {
      const row = modes.appendChild(el('div', 'keys-mode'));
      row.appendChild(el('b', '', name));
      row.appendChild(el('span', '', text));
    }
  }
  return root;
}
