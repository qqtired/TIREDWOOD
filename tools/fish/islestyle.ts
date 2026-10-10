// Остров «Последний свет» (10.10, прототип): манера вида острова на шкале по новым правилам — как reelStyle2
// (shared/fishability.ts), но вид берётся из species плана острова (docs/superpowers/plans/2026-10-10-fishing-island.json),
// а не из FISH, и сверху — множители места острова. Виды острова ещё не в игре, поэтому это — в tools; при внедрении
// они встанут в RAW/CAL shared/fishrules.ts, а место — в fishCastMods (zone 'isle').
import { readFileSync } from 'node:fs';
import { BAND, LAST_STAND, LAST_STAND_DIVINE, T_DIVINE, T_LEGEND, T_MYTH, ZONE_BASE, tierRank } from '../../shared/fishrules.ts';
import { FISH_XP_LEVELS, emptyFishProgress, fishCastMods, type FishCastMods } from '../../shared/fishprogress.ts';
import type { AbilitySpec, ReelPattern, ReelStyle } from '../../shared/fishreel.ts';
import { BIG_FILL, ISLE_ABILITY, levelBonus, zoneScale2 } from '../../shared/fishability.ts';
import { LURE_MAX } from '../../shared/fishshop.ts';

/** Место острова (план острова, economy.islePlace): рывки и резкость ×1,3, сопротивление ×1,4, зона ×0,95. Божественную не трогает */
export const ISLE_PLACE = { fight: 1.3, drain: 1.4, zone: 0.95 } as const;
/** Чуют ловушку (тики): мифики и божественная острова — как мифики пристани и баркаса */
export const ISLE_WARY = 60;

/**
 * Поправки вида к плану соседа (tools/fish/isle-reel.ts): гигантская акула — ход ×0,75 (с ходом соседа «обычный» 0 % на 6-м
 * и 97 % на 15-м, бой 45 с); лисья и плащеносная акулы — чуют ловушку через 0,5 с (за 1 с кемпер у дна брал их в 81 и 46 %
 * боёв: рывки проскакивают зону).
 */
export const ISLE_TUNE: Readonly<Record<string, { move?: number; wary?: number }>> = {
  baskingshark: { move: 0.75 },
  thresher: { wary: 30 },
  frilledshark: { wary: 30 },
};

/** Вид острова: то, что нужно шкале (из species плана острова) */
export interface IsleSpecies {
  id: string;
  name: string;
  tier: number;
  when: string;
  pat: readonly [ReelPattern, ReelPattern];
  lo: number;
  hi: number;
  up: number;
  /** Ход: скорость %/с, рывок %/с, размах %, сопротивление %/с (до места), цикл (тики) — как CAL в shared/fishrules.ts */
  cal: readonly [number, number, number, number, number];
}

/** Виды из плана острова (calEstimate — ход соседа; сопротивление потом подбирает isle-reel.ts) */
export function loadIsleSpecies(path: string): IsleSpecies[] {
  const j = JSON.parse(readFileSync(path, 'utf8')) as { species: Array<Record<string, unknown>> };
  return j.species.map((s) => {
    const c = s.calEstimate as { spd: number; dartSpd: number; amp: number; drain: number; per: number };
    return {
      id: s.id as string, name: s.name as string, tier: s.tier as number, when: s.when as string, pat: s.pat as [ReelPattern, ReelPattern],
      lo: (s.lo as number) ?? 0, hi: (s.hi as number) ?? 100, up: (s.up as number) ?? 50, cal: [c.spd, c.dartSpd, c.amp, c.drain, c.per],
    };
  });
}

/** Снаряжение уровня на острове (как в плане острова): 6 — удочка 2 и золото, 8 — удочка 3 и платина, 10+ — удочка 4 и платина */
export function isleGear(level: number): { rod: number; lure: number } {
  if (level >= 10) return { rod: 4, lure: 4 };
  if (level >= 8) return { rod: 3, lure: 4 };
  if (level >= 6) return { rod: 2, lure: 3 };
  const g = level >= 5 ? 2 : level >= 1 ? 1 : 0;
  return { rod: g, lure: g };
}

export function isleMods(level: number, rod = isleGear(level).rod, lure = isleGear(level).lure): FishCastMods {
  return fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level], questsDone: [0, 1, 5, 10, 15][rod], rod: rod as 0, lure: lure as 0 }, 0, 'pier');
}

export interface IsleOpts {
  /** Своё сопротивление (до места), %/с */
  drain?: number;
  /** Ход спокойнее: скорость, рывок и размах ×move */
  move?: number;
  /** Без способности (мифик и божественная — с «последним рывком», как раньше) */
  noAbility?: boolean;
  /** Своя способность (подбор силы) */
  ability?: AbilitySpec;
  /** Свой «чует ловушку» (0 — нет) */
  wary?: number;
}

/** Манера вида острова: база по категории (BAND) и ход вида, правила 10.10 (зона +1,5 %/ур., бонусы, 120 %, способность), место острова */
export function isleStyle(s: IsleSpecies, mods: Readonly<FishCastMods>, o: IsleOpts = {}): ReelStyle {
  const rank = tierRank(s.tier);
  const b = BAND[rank];
  const divine = s.tier === T_DIVINE;
  const big = s.tier === T_MYTH || divine;
  const place = divine ? { fight: 1, drain: 1, zone: 1 } : ISLE_PLACE;
  const lv = levelBonus(mods.level);
  const calm = Math.min(LURE_MAX.calm, Math.max(0, mods.calm));
  const jerk = (1 - calm) * (1 - lv.calm) * place.fight;
  const [spd, dart, amp, drain, per] = s.cal;
  const tune = ISLE_TUNE[s.id] ?? {};
  const mv = o.move ?? tune.move ?? 1;
  const style: ReelStyle = {
    mainPattern: s.pat[0], secondaryPattern: s.pat[1], patternPeriod: per, patternAmplitude: amp * mv,
    ...(rank >= T_LEGEND ? { lastStand: divine ? LAST_STAND_DIVINE : LAST_STAND } : {}),
    spd: spd * mv, sharp: b.sharp * jerk, turn: 10, dart: 8, dartSpd: dart * mv * jerk, dartUp: s.up, hover: 300, hoverP: 30,
    lo: s.lo, hi: s.hi, roam: 30, zone: b.zone * ZONE_BASE * zoneScale2(mods) * place.zone, drain: (o.drain ?? drain) * place.drain,
    slack: lv.slack, pStart: lv.pStart,
  };
  if (big) {
    style.fill = BIG_FILL;
    const ability = o.noAbility ? undefined : o.ability ?? ISLE_ABILITY[s.id];
    if (ability) {
      delete style.lastStand;
      style.ability = ability;
      style.abilityResist = lv.resist;
    }
    const wary = o.wary ?? tune.wary ?? ISLE_WARY;
    if (wary) style.wary = wary;
  }
  return style;
}
