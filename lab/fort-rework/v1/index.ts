// «Было» для страницы lab/fort-rework: М-1…М-5 в первом варианте (как до доработки 31.10), id с приставкой «v1:».
// Копии кода моделей из client/fort/mobs (общие детали — оттуда же); полный исходник v1 —
// ../concepts_blender/fort-mobs/v1/army/.
import type { MobDef } from '../../../client/fort/mobs/kit.ts';
import { bloaterPuffer } from './bloater-puffer.ts';
import { bloaterToad } from './bloater-toad.ts';
import { shieldTurtle } from './shield-turtle.ts';
import { shieldBeaver } from './shield-beaver.ts';
import { MEDIC_OWLS } from './medic-owl.ts';
import { CREW_CRAB } from './crew-crab.ts';
import { BOSS_LESHY } from './boss-leshy.ts';

export const V1_MOBS: MobDef[] = [bloaterPuffer, bloaterToad, shieldTurtle, shieldBeaver, MEDIC_OWLS[0], CREW_CRAB, BOSS_LESHY]
  .map((d) => ({ ...d, id: 'v1:' + d.id }));
