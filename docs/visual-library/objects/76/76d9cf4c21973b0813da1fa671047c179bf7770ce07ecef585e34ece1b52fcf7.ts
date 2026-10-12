// Кирпичики настроек на ките (.k-row, .k-slider, .k-switch, .k-seg) — один набор на «Графику», «Звук», «Управление»,
// «Интерфейс» и «Голос» (client/ui/voicepanel.ts): строка «название и пояснение слева, управление справа».
// Разметка — lab/ui/kit/KIT.md, раздел «Настройки».

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Клавиши внутри полей и ползунков не уходят в игру; M (звук) и Esc (меню) пропускаем: фокус после клика остаётся тут */
export function ownKeys(e: KeyboardEvent): void {
  if (e.code !== 'KeyM' && e.code !== 'Escape') e.stopPropagation();
}

export interface KRow {
  root: HTMLElement;
  title: HTMLElement;
  hint: HTMLElement;
  ctl: HTMLElement;
}

/** Строка: название с пояснением слева, управление справа. whole — вся строка нажимается (переключатель) */
export function kRow(parent: HTMLElement, title: string, hint = '', whole = false, extra = ''): KRow {
  const root = parent.appendChild(el(whole ? 'label' : 'div', `k-row${extra ? ` ${extra}` : ''}`));
  const text = root.appendChild(el('div', 'k-row-text'));
  const t = text.appendChild(el('div', 'k-row-title', title));
  const h = text.appendChild(el('div', 'k-row-hint', hint));
  return { root, title: t, hint: h, ctl: root.appendChild(el('div', 'k-row-ctl')) };
}

/** Заливка ползунка (--v, 0…1): kit.css красит золотом всё слева от бегунка */
export function paintSlider(input: HTMLInputElement): void {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 1;
  const v = max > min ? (Number(input.value) - min) / (max - min) : 0;
  input.style.setProperty('--v', String(Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000));
}

export function kSlider(label: string, min: number, max: number, step: number): HTMLInputElement {
  const input = el('input', 'k-slider');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.setAttribute('aria-label', label);
  input.addEventListener('input', () => paintSlider(input));
  return input;
}

/** Поставить значение ползунка снаружи (не трогаем тот, что сейчас тянут) */
export function setSlider(input: HTMLInputElement, value: string): void {
  if (input.value !== value) input.value = value;
  paintSlider(input);
}

/** Переключатель: корень — span (внутри строки-label) или label (сам по себе) */
export function kSwitch(label: string, tag: 'span' | 'label' = 'span'): { root: HTMLElement; input: HTMLInputElement } {
  const root = el(tag, 'k-switch');
  const input = root.appendChild(el('input'));
  input.type = 'checkbox';
  input.setAttribute('aria-label', label);
  root.appendChild(el('span', 'k-switch-track'));
  return { root, input };
}

/** Выбор из нескольких: ряд кнопок, нажатая — золотая (aria-pressed) */
export function kSeg(label: string): HTMLElement {
  const g = el('div', 'k-seg');
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', label);
  return g;
}

export function kButton(cls: string, text: string): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}
