// Модели набора A (mobs-a): шаркун, шустрик, бугай — по 2–3 варианта (каждая модель — свой файл в этой папке).
import { BRUTE_BEAR } from './brute-bear.ts';
import { BRUTE_TROLL } from './brute-troll.ts';
import type { MobDef } from './kit.ts';
import { RUNNER_HARE } from './runner-hare.ts';
import { RUNNER_LIZARD } from './runner-lizard.ts';
import { WALKER_JELLY } from './walker-jelly.ts';
import { WALKER_MUSHROOM } from './walker-mushroom.ts';
import { WALKER_SCARECROW } from './walker-scarecrow.ts';

export const MOBS_A: MobDef[] = [WALKER_MUSHROOM, WALKER_SCARECROW, WALKER_JELLY, RUNNER_HARE, RUNNER_LIZARD, BRUTE_TROLL, BRUTE_BEAR];
