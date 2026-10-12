// Модели набора F (fort-bosses): новые боссы «Крепости» — Король-Тыква, Ткачиха, Леший (каждый — свой файл в этой
// папке, общие заготовки — set-f-shapes.ts).
import { BOSS_LESHY } from './boss-leshy.ts';
import { BOSS_PUMPKIN } from './boss-pumpkin.ts';
import { BOSS_WEAVER } from './boss-weaver.ts';
import type { MobDef } from './kit.ts';

export const MOBS_F: MobDef[] = [BOSS_PUMPKIN, BOSS_WEAVER, BOSS_LESHY];
