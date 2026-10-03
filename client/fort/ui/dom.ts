// Мелочи для модулей интерфейса «Крепости»: создать элемент, число по-русски, поставить текст без лишних записей.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function num(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Текст элемента — только если поменялся (DOM не трогаем каждый кадр) */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

/** Перезапустить CSS-анимацию класса */
export function replay(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}

/** Стрелка-шеврон (SVG): смотрит вверх, крутится через transform */
export const ARROW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L20 15 L14.5 13.2 L14.5 21 L9.5 21 L9.5 13.2 L4 15 Z"/></svg>';

/** Римские цифры для кругов боссов: II, III … */
export function roman(n: number): string {
  const r: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let v = Math.max(1, Math.floor(n));
  for (const [k, s] of r) while (v >= k) { out += s; v -= k; }
  return out;
}
