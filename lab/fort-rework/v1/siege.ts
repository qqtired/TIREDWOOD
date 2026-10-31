// «Было» для осадных мобов М-6…М-12 на странице lab/fort-rework: GLB первого варианта Codex (12.10, 69f2d650),
// как они шли в игре до 31.10. Файлы лежат рядом с новыми в client/assets/fort/approved; исходники v1 —
// ../concepts_blender/fort-mobs/v1/.
import type { ApprovedAsset } from '../../../client/fort/approved/renderer.ts';
import { APPROVED_ASSETS } from '../../../client/fort/approved/renderer.ts';
import { Z_ROPECRAB, Z_JAMPUMP, Z_CANOPY, Z_FOREMAN, Z_MILLER, Z_SIEGE_TOWER, Z_SPRING } from '../../../shared/fortsiege.ts';

const OLD: Record<number, string> = {
  [Z_ROPECRAB]: new URL('../../../client/assets/fort/approved/ropecrab-r2-07.glb', import.meta.url).href,
  [Z_JAMPUMP]: new URL('../../../client/assets/fort/approved/jampump-r2-06.glb', import.meta.url).href,
  [Z_CANOPY]: new URL('../../../client/assets/fort/approved/canopy-r2-07.glb', import.meta.url).href,
  [Z_FOREMAN]: new URL('../../../client/assets/fort/approved/foreman-r2-06.glb', import.meta.url).href,
  [Z_MILLER]: new URL('../../../client/assets/fort/approved/miller-r2-06.glb', import.meta.url).href,
  [Z_SIEGE_TOWER]: new URL('../../../client/assets/fort/approved/siegetower-r3-03.glb', import.meta.url).href,
  [Z_SPRING]: new URL('../../../client/assets/fort/approved/spring-r3-01.glb', import.meta.url).href,
};

/** Только переделанные виды, со старыми файлами */
export const V1_SIEGE: readonly ApprovedAsset[] = APPROVED_ASSETS.filter((a) => OLD[a.kind]).map((a) => ({ ...a, url: OLD[a.kind] }));
