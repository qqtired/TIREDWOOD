import { QUIZ_VENUE, QUIZ_AREA_TOP, insideFence } from '../../../shared/quiz/venue.ts';

/** Вход без запаса, выход за 0,5 м. Высота и поездки используют ту же границу, что присутствие. */
export function quizVoiceSpot(enabled: boolean, previous: 'stage' | null, p: { x: number; y: number; z: number; riding: boolean; ephemeral: boolean }): 'stage' | null {
  if (!enabled || p.ephemeral || p.riding || p.y - (QUIZ_VENUE.world.y ?? 0) >= QUIZ_AREA_TOP) return null;
  return insideFence(p.x, p.z, previous === 'stage' ? 0.5 : 0) ? 'stage' : null;
}
