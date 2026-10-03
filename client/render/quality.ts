import type { Quality } from '../settings.ts';

/** Детализация сцены: у «авто» уменьшается вместе с разрешением, вплоть до низкой. */
export function sceneQuality(q: Quality, ratio: number, start: number, touch: boolean): Exclude<Quality, 'auto'> {
  if (q !== 'auto') return q;
  if (ratio < start && ratio <= 0.75) return 'low';
  return touch || ratio < start ? 'medium' : 'high';
}

export function assessFrames(samples: ArrayLike<number>): { median: number; p95: number; slow: boolean } {
  const sorted = Array.from(samples).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!sorted.length) return { median: 0, p95: 0, slow: false };
  const median = sorted[sorted.length >> 1];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { median, p95, slow: median > 17.6 || p95 > 26 };
}

/** Два плохих окна подряд: единичная загрузка или компиляция шейдера не размывает игру. */
export function nextAutoQuality(samples: ArrayLike<number>, ratio: number, slowWindows: number): { ratio: number; slowWindows: number } {
  if (!assessFrames(samples).slow || ratio <= 0.75) return { ratio, slowWindows: 0 };
  if (slowWindows < 1) return { ratio, slowWindows: slowWindows + 1 };
  return { ratio: Math.max(0.75, Math.round((ratio - 0.25) * 100) / 100), slowWindows: 0 };
}
