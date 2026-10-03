// Все модели мобов «Крепости»: пять наборов от пяти помощников (mobs-a … mobs-e).
import type { MobDef } from './kit.ts';
import { MOBS_A } from './set-a.ts';
import { MOBS_B } from './set-b.ts';
import { MOBS_C } from './set-c.ts';
import { MOBS_D } from './set-d.ts';
import { MOBS_E } from './set-e.ts';

export const ALL_MOBS: readonly MobDef[] = [...MOBS_A, ...MOBS_B, ...MOBS_C, ...MOBS_D, ...MOBS_E];
