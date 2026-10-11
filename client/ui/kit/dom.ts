// Помощники разметки кита (.k-*). Разметка — как в lab/ui/kit/KIT.md («Версия 2» и §3). Всё, что приходит
// строкой в html, собирает сам код игры; чужой текст (ники, чат) — только через textContent.
import { COIN_HTML } from '../coin.ts';
import { uiIcon } from './icons.ts';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const classes = (...list: Array<string | undefined>): string => list.filter(Boolean).join(' ');

/** Элемент с классом и (необязательно) готовой разметкой внутри */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Клавиша-колпачок: keyHtml('E'), keyHtml('I', 'tr', 'sm') — маленькая в правом верхнем углу родителя */
export function keyHtml(k: string, corner?: 'tr' | 'tl' | 'br' | 'bl' | 'b', size?: 'sm' | 'lg'): string {
  return `<kbd class="${classes('k-key', size && `k-key--${size}`, corner && `k-key--${corner}`)}">${esc(k)}</kbd>`;
}

/** Монетка-жетон (та же картинка, что во всей игре — ui/coin.ts) */
export function coinHtml(cls?: string): string {
  return COIN_HTML.replace('class="coin"', `class="${classes('k-coin', cls)}"`);
}

/** Иконка интерфейса по id (client/assets/ui/icons/<id>.webp); по умолчанию .k-ic — в строку текста. Нет файла — '' */
export function iconImg(id: string, cls = 'k-ic'): string {
  const src = uiIcon(id);
  return src ? `<img${cls ? ` class="${cls}"` : ''} src="${src}" alt="" draggable="false">` : '';
}

/** Полоса 0…1: meterHtml(.6, 'good'), meterHtml(.3, 'bad', 'k-meter--thin'). След (--g) экран ставит сам */
export function meterHtml(v: number, tone?: string, cls?: string): string {
  const k = Math.round(Math.min(1, Math.max(0, v || 0)) * 1000) / 1000;
  return `<span class="${classes('k-meter', tone && `k-meter--${tone}`, cls)}" style="--v:${k}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
}
