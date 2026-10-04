// fisheco: подписи бонусов одним языком везде (лавка, рюкзак, «Шансы сейчас», карточка улова, шкала) и картинки лавки.
import {
  BAG_ALE, BAG_BARKAS, BAG_BEER, BAG_LORD, BAG_RAIN, FISH_MAX_LEVEL, FISH_XP_LEVELS, fishLevel, levelOdds, rodOdds, type FishCastMods, type FishProgress,
} from '../../shared/fishprogress.ts';
import { ALE, BAGS, BARKAS_LEVEL, BEER, LORD, LURES, VODKA, lureOf } from '../../shared/fishshop.ts';
import { BARKAS_INCOME, RAIN_NUM, RAIN_DEN, RAIN_MUL, SEASON_MUL, SEA_DRAIN, SEA_FIGHT } from '../../shared/fishrules.ts';

const SHOP = import.meta.glob('../assets/fishshop/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Картинка вещи лавки (bag1…3, lure1…4, beer, ale, vodka, drum) или null */
export function shopImg(id: string): string | null {
  for (const [file, url] of Object.entries(SHOP)) if (file.endsWith(`/${id}.webp`)) return url;
  return null;
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

/** Множители рыбы в рюкзаке (биты BAG_*) значками */
export function bagMarks(m: number): string[] {
  const out: string[] = [];
  if (m & BAG_BARKAS) out.push(`⚓ ${mul(BARKAS_INCOME)}`);
  if (m & BAG_RAIN) out.push(`🌧 ${mul(RAIN_NUM / RAIN_DEN)}`);
  if (m & BAG_LORD) out.push(`🔱 ${pct(LORD.income)}`);
  else if (m & BAG_ALE) out.push(`🍻 ${pct(ALE.income)}`);
  else if (m & BAG_BEER) out.push(`🍺 ${pct(BEER.income)}`);
  return out;
}

/** Что даёт уровень рыбалки: зона и шанс редких и выше (+2,5 % за уровень от базы) */
export function levelPerks(level: number): string {
  return `зона +${(level * 2.5).toLocaleString('ru-RU')}% · редкие, эпик, лег., миф. и бож. ${mul(levelOdds(level))}`;
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
  return `🎣 Уровень рыбалки ${level}: ${levelPerks(level)}${opens.length ? ` · открылось: ${opens.join(', ')}` : ''}`;
}

/** Сколько опыта ещё до уровня level (0 — уже есть) */
export function xpTo(progress: Readonly<FishProgress>, level: number): number {
  return fishLevel(progress.xp) >= level ? 0 : Math.max(0, FISH_XP_LEVELS[Math.min(FISH_MAX_LEVEL, level)] - progress.xp);
}

/**
 * Разбивка шанса и манеры для подсказок: что сейчас поднимает редких и выше и что делает рыбу мягче/злее. Тот же
 * порядок и те же множители, что в броске сервера (shared/fishrules.ts: погода × уровень × удочка × напиток × блесна).
 * Уровень, удочка, пиво и погода умножают все категории от редкой до божественной; блесна и водка — эпическую и выше.
 */
export function oddsParts(mods: Readonly<FishCastMods>, rain: boolean, season = false): string[] {
  const parts: string[] = [];
  if (season) parts.push(`сезон рыбалки: виды дождя, все шансы ${mul(SEASON_MUL)} к дождю — редкие и выше ${mul(RAIN_MUL * SEASON_MUL)}`);
  else if (rain) parts.push(`дождь: виды дождя, редкие и выше ${mul(RAIN_MUL)}`);
  parts.push(`ур. ${mods.level} ${mul(levelOdds(mods.level))}`);
  if (mods.rod) parts.push(`удочка ${mul(rodOdds(mods.rod))}`);
  if (mods.drink === 4) parts.push(`водка: эпик и выше ${mul(VODKA.top ?? 1)}, зона ${mul(VODKA.zone ?? 1)}`);
  else if (mods.drink === 3) parts.push(`пиво владыки ${mul(LORD.rare)}`);
  else if (mods.drink === 2) parts.push(`эль ${mul(ALE.rare)}`);
  else if (mods.drink === 1) parts.push(`пиво ${mul(BEER.rare)}`);
  const lure = lureOf(mods.lure);
  if (lure) parts.push(`${lure.name.split(' ')[0].toLowerCase()} блесна: эпик и выше ${mul(lure.epic)}`);
  if (mods.zone === 'barkas') parts.push(`баркас: цена и опыт ${mul(BARKAS_INCOME)}`);
  return parts;
}

/** Рывки рыбы: блесна мягче, море и водка злее */
export function dartParts(mods: Readonly<FishCastMods>): string[] {
  const out: string[] = [];
  if (mods.calm > 0) out.push(`рывки −${Math.round(mods.calm * 100)}% блесна`);
  if (mods.zone === 'barkas') out.push(`рывки +${Math.round((SEA_FIGHT - 1) * 100)}% море · сопротивление +${Math.round((SEA_DRAIN - 1) * 100)}%`);
  if (mods.drink === 4) out.push(`водка: зона −${Math.round((1 - (VODKA.zone ?? 1)) * 100)}% · рывки +${Math.round(((VODKA.jerk ?? 1) - 1) * 100)}%`);
  return out;
}
