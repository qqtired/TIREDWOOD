// Модели набора C — список заполняет помощник mobs-c (каждая модель — свой файл в этой папке).
// Плевальщик — улитка с раковиной-мортиркой, подрывник — бобёр с бочкой, лекарь — сова в очках, броненосец в латах.
import type { MobDef } from './kit.ts';
import { ARMORED_ARMADILLOS } from './armored-armadillo.ts';
import { MEDIC_OWLS } from './medic-owl.ts';
import { SAPPER_BEAVERS } from './sapper-beaver.ts';
import { SPITTER_SNAILS } from './spitter-snail.ts';

export const MOBS_C: MobDef[] = [...SPITTER_SNAILS, ...SAPPER_BEAVERS, ...MEDIC_OWLS, ...ARMORED_ARMADILLOS];
