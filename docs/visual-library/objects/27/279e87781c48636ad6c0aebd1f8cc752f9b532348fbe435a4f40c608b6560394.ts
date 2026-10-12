import type { Quality } from '../settings.ts';

export interface FightVisualBudget {
  samples: number;
  scale: number;
  grain: number;
  crowdRows: number;
  crowdHz: number;
  dust: number;
  cones: boolean;
}

export function fightVisualBudget(q: Quality, slow = false, touch = false, maxSamples = 4): FightVisualBudget {
  const tier = q === 'auto' ? (slow ? 'low' : touch ? 'medium' : 'high') : q;
  if (tier === 'low') return { samples: 0, scale: 0.75, grain: 0, crowdRows: 2, crowdHz: 18, dust: 60, cones: false };
  if (tier === 'medium') return { samples: 0, scale: 1, grain: 0.5, crowdRows: 3, crowdHz: 30, dust: 150, cones: true };
  return { samples: Math.max(0, Math.min(2, Math.floor(maxSamples))), scale: 1, grain: 1, crowdRows: 4, crowdHz: 60, dust: 320, cones: true };
}

export function gradeSize(w: number, h: number, scale: number): [number, number] {
  return [Math.max(1, Math.floor(w * scale)), Math.max(1, Math.floor(h * scale))];
}
