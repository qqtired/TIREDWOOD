// Картинки интерфейса «Крепости»: общие иконки кита (client/assets/ui/icons/) и свои (client/assets/fort/: ворота,
// кристалл, стволы, прокачка, башни). Только для Vite (import.meta.glob) — в тестах не грузится.
import { uiIcon } from '../../ui/kit/icons.ts';

const FORT = import.meta.glob('../../assets/fort/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Своя картинка крепости (client/assets/fort/<имя>.webp) или null */
export function iconUrl(name: string): string | null {
  return FORT[`../../assets/fort/${name}.webp`] ?? null;
}

/** Картинка по id: сначала своя крепостная, потом общая кита; нет ни той, ни другой — «внимание» */
export function fortIcon(id: string): string {
  return iconUrl(id) ?? (uiIcon(id) || uiIcon('warn'));
}

/** <img> по id (alt пустой — рядом всегда есть подпись) */
export function fortImg(id: string, cls = ''): string {
  return `<img${cls ? ` class="${cls}"` : ''} src="${fortIcon(id)}" alt="" draggable="false">`;
}
