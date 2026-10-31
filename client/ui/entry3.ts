// Вход 3.0 (UI 3.0, второй шаг — docs/ui3/entry.md): за меню входа вместо картины — живая набережная в 3D
// (облёт камеры client/lobby/menucam.ts), карточка и плашки — в стиле «Веранды v3» (client/ui/kit/hud3/entry3.css).
// Включается вместе с HUD v3 флагом сервера UI3; без него вход ровно как раньше.
// Для сравнения в адресе: ?entry3=0 — прежний вход, ?entry3=b — светлая карточка «Крем» вместо «Сливы».
import { UI3 } from '../../shared/ui3.ts';

const q = new URLSearchParams(globalThis.location?.search ?? '');

export const ENTRY3: boolean = UI3 && q.get('entry3') !== '0';
/** Вид карточки: a — «Слива» (как HUD v3), b — «Крем» (как кремовые таблички v3) */
export const ENTRY3_LOOK: 'a' | 'b' = q.get('entry3') === 'b' ? 'b' : 'a';

/**
 * Первая загрузка (index.html) показывает застывший первый кадр меню — снимок client/assets/loading/hd/menu.webp. Пока
 * обложка на экране, тот же снимок лежит и под меню; обложка ушла — снимок за 0,9 с растворяется в живой набережной.
 * url — снимок (artUrl('menu'), client/ui/transition-art.ts): этот файл без импортов из client/ui, его берёт и сцена.
 */
export function stillFade(scr: HTMLElement, url: string): void {
  if (!url || !document.getElementById('startup')) return;
  const still = document.createElement('img');
  still.className = 'en3-still';
  still.src = url;
  still.alt = '';
  still.draggable = false;
  scr.prepend(still);
  const wait = (): void => {
    if (document.getElementById('startup')) { requestAnimationFrame(wait); return; }
    still.classList.add('is-out');
    setTimeout(() => still.remove(), 1200);
  };
  requestAnimationFrame(wait);
}
