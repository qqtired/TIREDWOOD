// Воспроизведение: Node24+ docs/farm/review3-balance.mjs; --json для машиночитаемого результата.
import { emptyBed, emptyFarm } from '../../shared/farm.ts';
import { CROPS, FARM_XP_TOTAL, REP_LEVELS, UPGRADES } from '../../shared/farmdata.ts';
import { farmIncome } from '../../shared/farmeconomy.ts';

const now = Date.UTC(2026, 9, 12, 12);
function farm(level, improved) {
  const f = emptyFarm(now);
  f.xp = FARM_XP_TOTAL[level - 1];
  const upgrades = UPGRADES.filter(u => u.level <= level);
  f.beds = Array.from({ length: Math.max(3, ...upgrades.filter(u => u.kind === 'bed').map(u => u.step)) }, emptyBed);
  if (improved) {
    f.rep = REP_LEVELS.at(-1).need;
    for (const kind of ['shovel', 'rake', 'bag', 'can']) f.tools[kind] = Math.max(1, ...upgrades.filter(u => u.kind === kind).map(u => u.step));
    f.built.compost = upgrades.some(u => u.kind === 'compost');
    f.built.bees = upgrades.some(u => u.kind === 'bees');
  }
  return f;
}
const round = n => Math.round(n * 100) / 100;
const mature = farm(13, true);
const crops = CROPS.map(c => {
  const base = farmIncome(farm(c.level, false), c, now);
  const regular = farmIncome(farm(c.level, true), c, now, true);
  const full = farmIncome(mature, c, now, true);
  const price = farm(13, true); price.buffs = [{ kind: 'price', until: now + 86400000 }];
  const grow = farm(13, true); grow.buffs = [{ kind: 'grow', until: now + 86400000 }];
  const both = farm(13, true); both.buffs = [...price.buffs, ...grow.buffs];
  return {
    id: c.id, name: c.name, level: c.level, beds: base.beds, min: c.min, seed: c.seed, sale: c.sale,
    baseNet: round(base.net), regularNet: round(regular.net), matureNet: round(full.net),
    priceBuffNet: round(farmIncome(price, c, now, true).net), growBuffNet: round(farmIncome(grow, c, now, true).net),
    bothBuffsNet: round(farmIncome(both, c, now, true).net), threeHelpersNet: round(farmIncome(mature, c, now, true, 3).net),
    resource: c.res, resourcesPerHour: round(full.resources), resourceXpPerHour: round(full.resourceXp),
  };
});
const levels = Array.from({ length: 13 }, (_, i) => {
  const level = i + 1, base = farm(level, false), regular = farm(level, true), open = CROPS.filter(c => c.level <= level);
  const best = (f, water) => open.map(c => ({ crop: c.name, net: farmIncome(f, c, now, water).net })).sort((a, b) => b.net - a.net)[0];
  const b = best(base, false), r = best(regular, true);
  return { level, beds: base.beds.length, baseCrop: b.crop, baseNet: round(b.net), regularCrop: r.crop, regularNet: round(r.net) };
});
if (process.argv.includes('--json')) console.log(JSON.stringify({ crops, levels }, null, 2));
else {
  console.log('База: без улучшений, репутации и полива. Регулярный: все доступные по уровню улучшения, репутация3000, свой полив сразу. Развитая: уровень13,10грядок, те же условия. Дробные выплаты копятся; ресурсы дают XP, не монеты. Везде математическое ожидание непрерывного сбора, без бесплатного первого семени, заказов и Фургона.\n');
  console.log('| Культура | Ур. | Грядки | Мин. | Семя | Продажа | База/ч | Регулярный/ч | Развитая/ч | Ресурсы/ч | XP ресурсов/ч |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of crops) console.log(`| ${c.name} | ${c.level} | ${c.beds} | ${c.min} | ${c.seed} | ${c.sale} | ${c.baseNet} | ${c.regularNet} | ${c.matureNet} | ${c.resourcesPerHour} | ${c.resourceXpPerHour} |`);
  console.log('\n| Уровень | Грядки | Лучшее без бонусов | База/ч | Лучшее с улучшениями | Регулярный/ч |\n|---|---:|---|---:|---|---:|');
  for (const l of levels) console.log(`| ${l.level} | ${l.beds} | ${l.baseCrop} | ${l.baseNet} | ${l.regularCrop} | ${l.regularNet} |`);
  console.log('\nВременные сценарии развитой фермы,10грядок:\n\n| Культура | Обычно | Бафф цены | Бафф роста | Оба баффа | Помощь3соседей |\n|---|---:|---:|---:|---:|---:|');
  for (const c of crops.filter(c => c.level >= 10)) console.log(`| ${c.name} | ${c.matureNet} | ${c.priceBuffNet} | ${c.growBuffNet} | ${c.bothBuffsNet} | ${c.threeHelpersNet} |`);
}
