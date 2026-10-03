// Модели набора D — боссы на суше (помощник mobs-d): Барон Варенья, Таран, Валун. Каждая модель — свой файл.
import type { MobDef } from './kit.ts';
import { BARON } from './boss-baron.ts';
import { GOLEM } from './boss-golem.ts';
import { RAM } from './boss-ram.ts';

export const MOBS_D: MobDef[] = [BARON, RAM, GOLEM];
