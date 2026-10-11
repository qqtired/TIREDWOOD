// Кит нарисован в пикселях сцены 1440×900. Весь HUD и окна масштабируются одним zoom: var(--hud-k).
const W = 1440;
const H = 900;
const MIN = 0.8;
const MAX = 1.6;

export function hudScale(vw: number, vh: number, uiScale: number): number {
  const k = Math.min(MAX, Math.max(MIN, Math.min(vw / W, vh / H)));
  return Math.round(k * uiScale * 100) / 100;
}

export function bindHudScale(root: HTMLElement, getUiScale: () => number): () => void {
  const apply = (): void => { root.style.setProperty('--hud-k', String(hudScale(innerWidth, innerHeight, getUiScale()))); };
  apply();
  addEventListener('resize', apply);
  return () => removeEventListener('resize', apply);
}
