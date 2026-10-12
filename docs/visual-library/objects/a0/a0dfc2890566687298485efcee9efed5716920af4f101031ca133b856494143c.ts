// Кит нарисован в пикселях сцены 1440×900. --ui-base-k сохраняет прежний размер окон/входа;
// HUD дополнительно меньше на 10%. Обе переменные пишет только этот файл при старте, resize и смене настройки.
const W = 1440;
const H = 900;
const MIN = 0.8;
const MIN_TOUCH = 0.6;
const MAX = 1.6;

export function hudScale(vw: number, vh: number, uiScale: number, coarse = false): number {
  return Math.round(uiBaseScale(vw, vh, uiScale, coarse) * 0.9 * 1000) / 1000;
}

/** Прежний responsive × «Размер интерфейса»: окна, вход и переход между комнатами. */
export function uiBaseScale(vw: number, vh: number, uiScale: number, coarse = false): number {
  const k = Math.min(MAX, Math.max(coarse ? MIN_TOUCH : MIN, Math.min(vw / W, vh / H)));
  return Math.round(k * uiScale * 100) / 100;
}

/** Числовые масштабы: HUD для экранных координат, прежняя база отдельно для окон и входа. */
export function applyHudScale(root: HTMLElement, uiScale: number): void {
  const coarse = matchMedia('(pointer: coarse)').matches;
  root.style.setProperty('--ui-base-k', String(uiBaseScale(innerWidth, innerHeight, uiScale, coarse)));
  root.style.setProperty('--hud-k', String(hudScale(innerWidth, innerHeight, uiScale, coarse)));
}

export function bindHudScale(root: HTMLElement, getUiScale: () => number): () => void {
  const apply = (): void => applyHudScale(root, getUiScale());
  apply();
  addEventListener('resize', apply);
  return () => removeEventListener('resize', apply);
}
