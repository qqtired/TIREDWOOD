// Картинки шаров для панели и табло бильярда — все места берут их только отсюда. Подменить картинку — заменить файл
// с тем же именем в client/assets/billiards/ (128×128 WebP с прозрачным фоном): ball — шар «американки» (слоновая кость),
// cue — красный биток, ball8 — шар с восьмёркой («до 8»). Нарисованы GPT через Codex CLI — client/assets/billiards/PROVENANCE.json.
import ballUrl from '../assets/billiards/ball.webp';
import ball8Url from '../assets/billiards/ball8.webp';
import cueUrl from '../assets/billiards/cue.webp';

const URLS = { ball: ballUrl, cue: cueUrl, ball8: ball8Url } as const;
export type BallKind = keyof typeof URLS;

/** Шар картинкой: размер — классом (cls) в CSS. */
export function ballImg(kind: BallKind, cls = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.className = `bl-ballimg${cls ? ` ${cls}` : ''}`;
  img.src = URLS[kind];
  img.alt = '';
  img.draggable = false;
  return img;
}

/** Те же картинки CSS-переменными (--bl-ball, --bl-cue, --bl-ball8) — для рядов шаров на табло фоном. */
export function setBallVars(el: HTMLElement): void {
  for (const [kind, url] of Object.entries(URLS)) el.style.setProperty(`--bl-${kind}`, `url("${url}")`);
}
