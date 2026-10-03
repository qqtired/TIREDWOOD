// fisheco: подписи бонусов одним языком везде (лавка, рюкзак, «Шансы сейчас», карточка улова, шкала) и картинки лавки.
import { BAG_ALE, BAG_BARKAS, BAG_BEER, BAG_RAIN, FISH_XP_LEVELS, fishLevel, type FishCastMods, type FishProgress } from '../../shared/fishprogress.ts';
import { ALE, BEER, lureOf } from '../../shared/fishshop.ts';
import { BARKAS_INCOME, RAIN_NUM, RAIN_DEN, RAIN_TOP_MUL, SEA_DRAIN, SEA_FIGHT } from '../../shared/fishrules.ts';

const SHOP = import.meta.glob('../assets/fishshop/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Картинка вещи лавки (bag1…3, lure1…3, beer, ale, drum) или null */
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
  if (m & BAG_ALE) out.push(`🍻 ${pct(ALE.income)}`);
  else if (m & BAG_BEER) out.push(`🍺 ${pct(BEER.income)}`);
  return out;
}

/** Что даёт уровень рыбалки: зона и шанс редких */
export function levelPerks(level: number): string {
  return `зона +${(level * 2.5).toLocaleString('ru-RU')}% · редкие и выше ${mul(1.025 ** level)}`;
}

/** Сколько опыта ещё до уровня level (0 — уже есть) */
export function xpTo(progress: Readonly<FishProgress>, level: number): number {
  return fishLevel(progress.xp) >= level ? 0 : Math.max(0, FISH_XP_LEVELS[Math.min(10, level)] - progress.xp);
}

/** Разбивка шанса и манеры для подсказок: что сейчас поднимает редких и что делает рыбу мягче/злее */
export function oddsParts(mods: Readonly<FishCastMods>, rain: boolean): string[] {
  const parts = [`ур. ${mods.level} ${mul(1.025 ** mods.level)}`];
  if (mods.rod) parts.push(`удочка ${mul(1 + 0.05 * mods.rod)}`);
  if (mods.drink === 2) parts.push(`эль ${mul(ALE.rare)}`);
  else if (mods.drink === 1) parts.push(`пиво ${mul(BEER.rare)}`);
  const lure = lureOf(mods.lure);
  if (lure) parts.push(`${lure.name.split(' ')[0].toLowerCase()}: эпик+ ${mul(lure.epic)}`);
  if (rain) parts.push(`дождь: виды дождя, лег/миф ${mul(RAIN_TOP_MUL)}`);
  if (mods.zone === 'barkas') parts.push(`баркас: цена и опыт ${mul(BARKAS_INCOME)}`);
  return parts;
}

/** Рывки рыбы: блесна мягче, море злее */
export function dartParts(mods: Readonly<FishCastMods>): string[] {
  const out: string[] = [];
  if (mods.calm > 0) out.push(`рывки −${Math.round(mods.calm * 100)}% блесна`);
  if (mods.zone === 'barkas') out.push(`рывки +${Math.round((SEA_FIGHT - 1) * 100)}% море · сопротивление +${Math.round((SEA_DRAIN - 1) * 100)}%`);
  return out;
}
