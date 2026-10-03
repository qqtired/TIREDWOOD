// Модели набора A (mobs-a): шаркун, шустрик, бугай — по 2–3 варианта (каждая модель — свой файл в этой папке).
import type { MobDef } from './kit.ts';
import { WALKER_JELLY } from './walker-jelly.ts';
import { WALKER_MUSHROOM } from './walker-mushroom.ts';
import { WALKER_SCARECROW } from './walker-scarecrow.ts';

export const MOBS_A: MobDef[] = [WALKER_MUSHROOM, WALKER_SCARECROW, WALKER_JELLY];
