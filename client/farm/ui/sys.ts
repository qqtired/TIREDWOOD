// Сообщения части B1 (shared/farmsys.ts) для окон: тост награды (farmGot) и сводка при входе (farmAway). Фургон (farmVan),
// Древо (farmBoss) и итог Древа (farmBossEnd) хранит FarmHud и отдаёт окнам. farmBossFx (чих, шишки) рисует 3D (B3).
import { ACHIEVEMENTS, BUFFS, REP_LEVELS, type FarmBuffKind } from '../../../shared/farmdata.ts';
import { orderTemplate } from '../../../shared/farmorders.ts';
import type { FarmGot } from '../../../shared/farmsys.ts';
import type { FarmToast } from './common.ts';
import { rewardName } from './names.ts';

/** «+25 🪙 · +120 XP · +2 репутации · Значок «Росток»» */
function gotLine(g: FarmGot): string {
  const parts: string[] = [];
  if (g.coins > 0) parts.push(`+${g.coins} 🪙`);
  if (g.xp > 0) parts.push(`+${g.xp} XP`);
  if (g.rep > 0) parts.push(`+${g.rep} репутации`);
  for (const id of g.items) parts.push(id.startsWith('buff:') ? `бафф на сутки: ${BUFFS[id.slice(5) as FarmBuffKind]?.name ?? id}` : rewardName(id));
  return parts.join(' · ');
}

/** Тост по награде */
export function gotToast(g: FarmGot): FarmToast {
  const line = gotLine(g);
  switch (g.src) {
    case 'order': return { key: 'farm-got', tone: 'reward', icon: 'ui:scroll', title: `Заказ выполнен: «${orderTemplate(g.id)?.name ?? 'заказ'}»`, sub: line };
    case 'ach': return { key: 'farm-got', tone: 'reward', icon: 'star', title: `Достижение: «${ACHIEVEMENTS.find((a) => a.id === g.id)?.name ?? g.id}»`, sub: line };
    case 'rep': return { key: 'farm-got', tone: 'reward', icon: 'help-hands', title: `Репутация: «${REP_LEVELS.find((r) => String(r.level) === g.id)?.name ?? g.id}»`, sub: line };
    case 'help': return { key: 'farm-got', tone: 'good', icon: 'help-hands', title: 'Спасибо, что помог соседу', sub: line };
    case 'boss': return { key: 'farm-got', tone: 'reward', icon: 'life-fruit', title: 'Древо расцвело — твоя награда', sub: line };
  }
}
