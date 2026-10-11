// Кит нарисован в пикселях сцены 1440×900. Базовый масштаб — --hud-k; окна дополнительно уменьшает kit.css (--window-k).
// --hud-k пишет только этот файл: при старте, на resize (bindHudScale) и при смене «Размера интерфейса» (applyInterface).
const W = 1440;
const H = 900;
const MIN = 0.8;
const MIN_TOUCH = 0.6;
const MAX = 1.6;

export function hudScale(vw: number, vh: number, uiScale: number, coarse = false): number {
  const k = Math.min(MAX, Math.max(coarse ? MIN_TOUCH : MIN, Math.min(vw / W, vh / H)));
  return Math.round(k * uiScale * 100) / 100;
}

/** Поставить --hud-k на root по текущему окну, указателю (палец — MIN 0,6) и выбору игрока */
export function applyHudScale(root: HTMLElement, uiScale: number): void {
  const coarse = matchMedia('(pointer: coarse)').matches;
  root.style.setProperty('--hud-k', String(hudScale(innerWidth, innerHeight, uiScale, coarse)));
}

export function bindHudScale(root: HTMLElement, getUiScale: () => number): () => void {
  const apply = (): void => applyHudScale(root, getUiScale());
  apply();
  addEventListener('resize', apply);
  return () => removeEventListener('resize', apply);
}
