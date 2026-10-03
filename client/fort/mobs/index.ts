// Все модели мобов «Крепости»: три набора от трёх помощников (mobs-a, mobs-b, mobs-c).
import type { MobDef } from './kit.ts';
import { MOBS_A } from './set-a.ts';
import { MOBS_B } from './set-b.ts';
import { MOBS_C } from './set-c.ts';

export const ALL_MOBS: readonly MobDef[] = [...MOBS_A, ...MOBS_B, ...MOBS_C];
