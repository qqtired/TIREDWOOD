// Рыбалка 2.0 на клиенте — общее: включена ли (поле fish2 в приветствии набережной; без него — старая рыбалка),
// картинки рыб (нарисованы Codex CLI, лежат в client/assets/fish/<id>.webp — свои файлы сборки: CSP пускает только
// их и data:), картинка-силуэт для ещё не пойманных, подписи категорий.
import { FISH } from '../../shared/fishing.ts';
import { RULE, TIER_CSS, TIER_NAMES } from '../../shared/fishrules.ts';
import './fish2.css';

/** Включена ли рыбалка 2.0 (ставит набережная по приветствию; профиль и гардероб смотрят сюда же) */
export const FISH2 = { on: false };

const URLS = import.meta.glob('../assets/fish/*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const BY_ID = new Map<string, string>();
for (const [file, url] of Object.entries(URLS)) {
  const id = file.slice(file.lastIndexOf('/') + 1).replace(/\.(webp|png)$/, '');
  if (file.endsWith('.webp') || !BY_ID.has(id)) BY_ID.set(id, url);
}

/** Адрес картинки вида (null — картинки нет) */
export function fishImgUrl(sp: number): string | null {
  return BY_ID.get(FISH[sp]?.id ?? '') ?? null;
}

/** Картинка вида; known = false — тёмный силуэт (ещё не ловил). */
export function fishPic(sp: number, cls: string, known = true): HTMLElement {
  const url = fishImgUrl(sp);
  if (!url) {
    const d = document.createElement('div');
    d.className = `${cls} f2-nopic`;
    d.textContent = known ? '🐟' : '?';
    return d;
  }
  const img = document.createElement('img');
  img.className = known ? cls : `${cls} f2-shadow`;
  img.src = url;
  img.alt = known ? FISH[sp].name : '';
  img.draggable = false;
  img.decoding = 'async';
  return img;
}

/** Категория вида: подпись и цвет */
export function tierOf(sp: number): { tier: number; name: string; css: string } {
  const t = RULE[sp]?.tier ?? 0;
  return { tier: t, name: TIER_NAMES[t], css: TIER_CSS[t] };
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
