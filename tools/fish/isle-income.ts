// Доход острова «Последний свет» по модели игрока (test/fishbot.ts): жетонов в час рыбой и сундуками, опыт в минуту — по
// настоящим таблицам (shared/fishrules.ts, виды острова) и шкале по правилам 10.10 (shared/fishability.ts reelStyle2).
// Снаряжение — как в плане острова (раздел 6.2): ур. 6 — удочка 2 и золото, ур. 8 — удочка 3 и платина, ур. 10 — удочка 4 и
// платина; без напитков. Эхолот лодки — ожидание поклёвки −5/−10/−15 % («Волжанка»/«Альбакор»/«Нортсильвер»).
// node tools/fish/isle-income.ts [N=300]
import { EXPERT, TYPICAL, fishIncome } from '../../test/fishbot.ts';
import { reelStyle2 } from '../../shared/fishability.ts';
import { FISH_XP_LEVELS, emptyFishProgress, fishCastMods, type FishCastMods } from '../../shared/fishprogress.ts';
import type { FishZone } from '../../shared/fishplaces.ts';

const N = Number(process.argv[2] ?? 300);
const gear = (level: number) => (level >= 10 ? { rod: 4, lure: 4 } : level >= 8 ? { rod: 3, lure: 4 } : level >= 6 ? { rod: 2, lure: 3 } : { rod: 0, lure: 0 });

/** Снимок заброса игрока уровня level у места zone; sonar — эхолот лодки (доля ожидания поклёвки) */
export function isleCaseMods(level: number, zone: FishZone = 'isle', sonar = 0): FishCastMods {
  const g = gear(level);
  const m = fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level], questsDone: [0, 1, 5, 10, 15][g.rod], rod: g.rod as 0, lure: g.lure as 0 }, 0, zone);
  return { ...m, biteSpeed: m.biteSpeed / (1 - sonar) };
}

if (import.meta.main) {
  const rows: Array<[string, number, number, boolean, boolean, typeof TYPICAL]> = [
    ['ур. 6, «Волжанка»', 6, 0.05, false, false, TYPICAL],
    ['ур. 8, «Альбакор»', 8, 0.1, false, false, TYPICAL],
    ['ур. 10, «Нортсильвер»', 10, 0.15, false, false, TYPICAL],
    ['ур. 10, «Нортсильвер», туман наступает', 10, 0.15, true, false, TYPICAL],
    ['ур. 10, «Нортсильвер», сезон острова', 10, 0.15, true, true, TYPICAL],
    ['ур. 10, с мола пешком', 10, 0, false, false, TYPICAL],
    ['ур. 10, «Нортсильвер», «опытный»', 10, 0.15, false, false, EXPERT],
  ];
  for (const [name, level, sonar, fog, season, skill] of rows) {
    const inc = fishIncome(skill, fog, N, isleCaseMods(level, 'isle', sonar), reelStyle2, season);
    console.log(`${name.padEnd(42)} рыба ${Math.round(inc.coins * 60)} + сундук ${Math.round(inc.chest * 60)} = ${Math.round((inc.coins + inc.chest) * 60)} 🪙/ч · рыб ${inc.fish.toFixed(2)}/мин · опыт ${inc.xp.toFixed(1)}/мин`);
  }
}
