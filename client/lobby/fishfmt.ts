// fisheco: подписи бонусов одним языком везде (лавка, рюкзак, карточка улова, тост уровня рыбалки).
import { rewardLabel, stepLabel, type RewardStep } from '../../shared/fishstyle.ts';
import { itemById } from '../../shared/outfit.ts';
import {
  BAG_ALE, BAG_BARKAS, BAG_BEER, BAG_LORD, BAG_RAIN, FISH_MAX_LEVEL, FISH_XP_LEVELS, fishLevel, levelOdds, type FishProgress,
} from '../../shared/fishprogress.ts';
import { ALE, BAGS, BARKAS_LEVEL, BEER, LORD, LURES } from '../../shared/fishshop.ts';
import { BARKAS_INCOME, RAIN_NUM, RAIN_DEN, RULE } from '../../shared/fishrules.ts';
import { FISH } from '../../shared/fishing.ts';
import { LEVEL_PERKS, ZONE_PER_LEVEL } from '../../shared/fishability.ts';

/** Ступень лестницы острова словами («поплавок «Колокольный буй»», последняя — «сет «Смотритель маяка»»); вещи острова — пакета E */
export function isleStepText(step: RewardStep): string {
  if (step.set) return stepLabel(step);
  return step.items.map((id) => (itemById(id) ? rewardLabel(id) : 'вещь острова')).join(' и ');
}

/** Вид острова «Последний свет» (по ключу альбома) */
export function isleFish(id: string): boolean {
  const sp = FISH.findIndex((f) => f.id === id);
  return sp >= 0 && RULE[sp]?.zone === 'isle';
}

const NUM = new Intl.NumberFormat('ru-RU');
export const num = (n: number): string => NUM.format(Math.round(n));

/** ×1,25 (два знака, без лишних нулей) */
export function mul(x: number): string {
  return `×${(Math.round(x * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`;
}

/** +10 % / −5 % от множителя (1,1 → «+10%») */
export function pct(x: number): string {
  const v = Math.round((x - 1) * 1000) / 10;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

/** Множители рыбы в рюкзаке (биты BAG_*) значками; id — вид: у видов острова «только в дождь» — это туман 🌫 */
export function bagMarks(m: number, id = ''): string[] {
  const out: string[] = [];
  if (m & BAG_BARKAS) out.push(`⚓ ${mul(BARKAS_INCOME)}`);
  if (m & BAG_RAIN) out.push(`${isleFish(id) ? '🌫' : '🌧'} ${mul(RAIN_NUM / RAIN_DEN)}`);
  if (m & BAG_LORD) out.push(`🔱 ${pct(LORD.income)}`);
  else if (m & BAG_ALE) out.push(`🍻 ${pct(ALE.income)}`);
  else if (m & BAG_BEER) out.push(`🍺 ${pct(BEER.income)}`);
  return out;
}

/** Зона от уровня, % («7,5»): +1,5 % за уровень (shared/fishability.ts ZONE_PER_LEVEL) */
export function levelZonePct(level: number): string {
  return (Math.round(level * ZONE_PER_LEVEL * 1000) / 10).toLocaleString('ru-RU');
}

/** Что даёт уровень рыбалки: зона (+1,5 % за уровень) и шанс редких и выше (+2,5 % за уровень от базы) */
function levelPerks(level: number): string {
  return `зона +${levelZonePct(level)}% · редкие, эпик, лег., миф. и бож. ${mul(levelOdds(level))}`;
}

/** Награда уровня 1–15 (shared/fishability.ts LEVEL_PERKS): «Стойкость I — способности мификов короче на 10 %»; нет — '' */
function levelPerkText(level: number): string {
  const p = LEVEL_PERKS.find((x) => x.level === level);
  return p ? `${p.name} — ${p.text}` : '';
}

/** «1 рыба», «3 рыбы», «12 рыб» */
export function fishCount(n: number): string {
  const d = n % 10, h = n % 100;
  return `${n} ${d === 1 && h !== 11 ? 'рыба' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'рыбы' : 'рыб'}`;
}

/** Что откроется на уровне рыбалки level: вещи лавки и баркас */
export function levelOpens(level: number): string[] {
  const out = [...BAGS, ...LURES].filter((g) => g.level === level).map((g) => g.name.toLowerCase());
  if (level === BARKAS_LEVEL) out.push('баркас в открытом море');
  return out;
}

/** Плашка нового уровня рыбалки: что дал уровень и что открылось (не путать с уровнем персонажа) */
export function fishLevelUpText(level: number): string {
  const opens = levelOpens(level);
  const perk = levelPerkText(level);
  return `🎣 Уровень рыбалки ${level}: ${perk ? `★ ${perk} · ` : ''}${levelPerks(level)}${opens.length ? ` · открылось: ${opens.join(', ')}` : ''}`;
}

/** Сколько опыта ещё до уровня level (0 — уже есть) */
export function xpTo(progress: Readonly<FishProgress>, level: number): number {
  return fishLevel(progress.xp) >= level ? 0 : Math.max(0, FISH_XP_LEVELS[Math.min(FISH_MAX_LEVEL, level)] - progress.xp);
}
