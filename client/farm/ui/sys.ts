// Сообщения части B1 (shared/farmsys.ts) для окон: тост награды (farmGot) и сводка при входе (farmAway). Фургон (farmVan),
// Древо (farmBoss) и итог Древа (farmBossEnd) хранит FarmHud и отдаёт окнам. farmBossFx (чих, шишки) рисует 3D (B3).
import { ACHIEVEMENTS, BUFFS, REP_LEVELS, type FarmBuffKind } from '../../../shared/farmdata.ts';
import { orderTemplate } from '../../../shared/farmorders.ts';
import type { FarmGot } from '../../../shared/farmsys.ts';
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

/** Тост по награде: [заголовок, подпись] */
export function gotToast(g: FarmGot): [string, string] {
  const line = gotLine(g);
  switch (g.src) {
    case 'order': return [`Заказ выполнен: «${orderTemplate(g.id)?.name ?? 'заказ'}»`, line];
    case 'ach': return [`Достижение: «${ACHIEVEMENTS.find((a) => a.id === g.id)?.name ?? g.id}»`, line];
    case 'rep': return [`Репутация: «${REP_LEVELS.find((r) => String(r.level) === g.id)?.name ?? g.id}»`, line];
    case 'help': return ['Спасибо, что помог соседу', line];
    case 'boss': return ['Древо расцвело — твоя награда', line];
  }
}
