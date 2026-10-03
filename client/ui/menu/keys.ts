// Справка «Клавиши» в меню: коротко, по группам. Подсказки режимов меняются вместе с режимами — это строки MODES.
// На телефоне — кнопки на экране (как на экране входа).
import { TOUCH } from '../../touch.ts';

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
    [['1', '2', '3', '4'], 'эмоции'],
    [['5', '6'], 'дать пять, обняться'],
  ]],
  ['Общение', [
    [['Enter'], 'чат'],
    [['V'], 'говорить в голосе (держать)'],
    [['Tab'], 'кто где · счёт'],
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

const TOUCH_KEYS: Keys = [
  [['🕹'], 'слева пальцем — бег'],
  [['👆'], 'справа пальцем — осмотреться'],
  [['⤒'], 'прыжок'],
  [['E'], 'действие: сесть, сыграть, войти'],
  [['😊'], 'эмоции'],
  [['💬'], 'чат'],
  [['👥'], 'кто где · счёт'],
  [['☰'], 'меню'],
];

export function keysHelp(): HTMLElement {
  const root = el('div', 'keys-help');
  const grid = root.appendChild(el('div', 'keys-grid'));
  for (const [title, keys] of TOUCH ? [['Кнопки на экране', TOUCH_KEYS] as const] : GROUPS) {
    const box = grid.appendChild(el('div', 'keys-box'));
    box.appendChild(el('h3', '', title));
    for (const [caps, what] of keys) {
      const row = box.appendChild(el('div', 'keys-row'));
      const k = row.appendChild(el('span', 'keys-caps'));
      for (const cap of caps) k.appendChild(el('kbd', cap.length > 2 ? 'wide' : '', cap));
      row.appendChild(el('span', 'keys-what', what));
    }
  }
  if (!TOUCH) {
    const modes = root.appendChild(el('div', 'keys-box keys-modes'));
    modes.appendChild(el('h3', '', 'В режимах'));
    for (const [name, text] of MODES) {
      const row = modes.appendChild(el('div', 'keys-mode'));
      row.appendChild(el('b', '', name));
      row.appendChild(el('span', '', text));
    }
  }
  return root;
}

function el(tag: string, cls: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
