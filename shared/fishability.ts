// Рыбалка 2.0: способности мификов и божественной, +20 % времени в зоне и награды уровней 1–15 (10.10; дизайн —
// docs/superpowers/plans/2026-10-10-fishing-abilities.md, цифры — tools/fish/abilities-sim.ts). В игре с 10.10 (флаг FISH2).
//
// Сервер (server/lobby/fishing2.ts) и клиент (client/lobby/fishgame.ts) берут reelStyle2(sp, mods) вместо reelStyleFor —
// способность вида и бонусы уровня считаются из того же sp и mods.level, что уже есть в снимке заброса: новых полей в
// сообщениях нет, модель поменялась — PROTOCOL_VERSION 16. Окно подсечки — hookBonusMs(level) к hookTicks, «первая ошибка
// не в счёт» — gradeErrors(err, level) перед reelGrade. Рыбы острова (ISLE_ABILITY, WARY/WARY_HOLD острова) включаются сами,
// как только их виды появятся в FISH/RULE (по id).
import { FISH } from './fishing.ts';
import { LURE_MAX } from './fishshop.ts';
import { RULE, SEA_DRAIN, SEA_FIGHT, T_DIVINE, T_MYTH, isFishTier, ruleOf } from './fishrules.ts';
import type { FishCastMods } from './fishprogress.ts';
import { SLACK_TICKS, type AbilitySpec, type ReelStyle } from './fishreel.ts';

/** Мифик и божественная: время в зоне до поимки — 120 % (на 20 % дольше: 5 с → 6 с от начала до 100 %) */
export const BIG_FILL = 120;
/** Зона от уровня: +1,5 % за уровень (было +2,5 %), до 15-го */
export const ZONE_PER_LEVEL = 0.015;
/** Потолок зоны от уровня и удочки: 15-й уровень (×1,225) × легендарная удочка (×1,4) */
export const ZONE_SCALE_MAX2 = (1 + ZONE_PER_LEVEL * 15) * 1.4;

/** Селёдка — мелкая рыба мини-шкалы сельдяного короля: юркая, держится в середине мини-шкалы, зона мини-шкалы 32 % */
export const HERRING: ReelStyle = {
  mainPattern: 'Zigzag', secondaryPattern: 'Nervous', patternPeriod: 130, patternAmplitude: 38, spd: 24, sharp: 8, turn: 10, dart: 8,
  dartSpd: 90, dartUp: 50, hover: 300, hoverP: 30, lo: 15, hi: 90, roam: 30, zone: 32, drain: 1,
};

/**
 * Способности видов (ключ — id вида в FISH; id не меняются). Все срабатывают один раз за бой на 60…75 % улова (точка — по
 * сиду). warn — предупреждение, dur — действие (тики, 60 = 1 с); стойкость уровня режет dur (и full, need).
 */
export const SPECIES_ABILITY: Readonly<Record<string, AbilitySpec>> = {
  // Рыба-молот (мифик пристани; место whiteshark): разгон к краю 0,6 с — пролом, шкала +50 % в ту сторону, нырок туда;
  // шкала 150 % — до конца боя (решение владельца 10.10: «отрисовать новую полоску и её новые границы», без срастания)
  whiteshark: { id: 'breach', at: [60, 75], warn: 36, dur: 0, grow: 50, ampMul: 125 },
  // Гренландская акула (мифик, ненастье): ветер 5 с, сила 35 %, меняет сторону 1–2 раза
  greenlandshark: { id: 'wind', at: [60, 75], warn: 36, dur: 300, force: 35, turns: [1, 2] },
  // Сельдяной король (мифик баркаса): 3 селёдки по очереди, каждую — 0,5 с в зоне; король ждёт, улов −1,5 %/с (не ниже 10 %);
  // за 12 с не поймал всех — остальные уплывают
  oarfish: { id: 'herring', at: [60, 75], warn: 36, dur: 720, count: 3, need: 30, rollback: 15, floor: 10, minion: HERRING, standAfter: 130 },
  // Кальмар (божественная): чернила 1,5 с на всю шкалу, потом 1,5 с стекают сверху вниз; под чернилами — реактивный выстрел
  kalmar: { id: 'ink', at: [60, 75], warn: 30, dur: 180, full: 90, jet: true },
};

/**
 * Остров «Последний свет» (docs/superpowers/plans/2026-10-10-fishing-island.md, 5.1): способности тех же правил — один раз за
 * бой на 60…75 %, эффект — до конца боя (dur 0). Сила подобрана tools/fish/isle-reel.ts под «обычного» 10-го уровня
 * (удочка 4, платина): мифики ~55 %, божественная ~50 % (без способности — 62 %). Итог — 2026-10-10-fishing-island-reel.json.
 */
export const ISLE_ABILITY: Readonly<Record<string, AbilitySpec>> = {
  // Белуга: всплывает за воздухом 0,6 с — «второе дыхание»: улов −12 п. п. (не ниже 10 %), до конца боя быстрее ×1,1, зона ×0,95
  // (у соседа ×1,15 и ×0,9 — до конца боя это уже без отката улова злее цели)
  beluga: { id: 'surge', at: [60, 75], warn: 36, dur: 0, drop: 12, floor: 10, spdMul: 110, zoneMul: 95 },
  // Лисья акула: «хлыст» — до конца боя раз в 4–6 с замах 0,6 с (свист, видно куда) и удар: зону отбрасывает на 15 % шкалы, 2 из 3 — вниз
  // (у соседа ~25 %: до конца боя это −26 п. п., сопротивлению пришлось бы упасть так, что без хлыста бой — прогулка)
  thresher: { id: 'whip', at: [60, 75], warn: 36, dur: 0, every: [240, 360], swing: 36, kick: 15, down: 67 },
  // Гигантская акула (туман): «пелена» — до конца боя две полосы тумана по 15 % плывут 6–9 %/с, раз в 8 с — стена на 40 % шкалы 1,5 с
  // (у соседа 22 % и 50 % — весь бой; на шкале целиком это почти слепой бой)
  baskingshark: { id: 'fog', at: [60, 75], warn: 60, dur: 0, band: 15, drift: [6, 9], wall: 40, wallEvery: 480, wallDur: 90 },
  // Плащеносная акула (божественная): «острые зубы» — 2 зуба остаются на шкале до конца боя и щёлкают: острые 3,5 с, тупые 2 с
  // (проехать можно), 0,8 с мерцают «клац-клац». Острый задел — −50 % улова, второй раз — обрыв
  frilledshark: { id: 'teeth', at: [60, 75], warn: 48, dur: 0, count: 2, size: 5, cut: 50, cycle: [210, 120, 48] },
};

/** Каркас для нового острова: «Острые зубы» (божественная) — пример, цифры для соседнего дизайнера */
export const TEETH_EXAMPLE: AbilitySpec = { id: 'teeth', at: [60, 75], warn: 45, dur: 360, count: 2, size: 9, cut: 50 };

/** Кальмар: чует ловушку — зона ждёт у края без него 1 с — он к ней не подходит (выбор — вариант «Б» в документе) */
export const KALMAR_WARY = 60;

// ------------------------------------------------------------ награды уровней 1–15

export interface LevelPerk {
  level: number;
  /** Короткое имя для плашки «Новый уровень» и Семёна */
  name: string;
  /** Что даёт — от лица игрока */
  text: string;
}

/**
 * Бонус каждого уровня (сверх шанса +2,5 % и зоны +1,5 % за уровень). Повтор имени — ступень того же бонуса. Шанс поимки
 * меняют только «Мягкая леска», «Стойкость» и «Хватка» — и на единицы процентов (tools/fish/abilities-sim.ts perks);
 * остальное — удобство: подсечка, подсказки на экране, оценка. «Крепкая леска» (провисла через 1 с) давала осетру +24 п. п. —
 * вычеркнута.
 */
export const LEVEL_PERKS: readonly LevelPerk[] = [
  { level: 1, name: 'Быстрая подсечка I', text: 'на подсечку +0,1 с' },
  { level: 2, name: 'Мягкая леска I', text: 'рывки рыбы −2 %' },
  { level: 3, name: 'Знаток повадок', text: 'на шкале видно, как ходит рыба: «свечки», «засада»…' },
  { level: 4, name: 'Чутьё', text: 'рыба вздрагивает за 0,25 с до рывка' },
  { level: 5, name: 'Стойкость I', text: 'способности мификов короче на 10 %' },
  { level: 6, name: 'Быстрая подсечка II', text: 'на подсечку +0,2 с' },
  { level: 7, name: 'Метка мифика', text: 'на полосе улова видно, где мифик пустит в ход способность' },
  { level: 8, name: 'Мягкая леска II', text: 'рывки рыбы −4 %' },
  { level: 9, name: 'Спокойная рука', text: 'первая ошибка в бою не портит оценку' },
  { level: 10, name: 'Стойкость II', text: 'способности мификов короче на 20 %' },
  { level: 11, name: 'Быстрая подсечка III', text: 'на подсечку +0,3 с' },
  { level: 12, name: 'Острое чутьё', text: 'рывок видно за 0,4 с и стрелкой — куда' },
  { level: 13, name: 'Мягкая леска III', text: 'рывки рыбы −6 %' },
  { level: 14, name: 'Хватка', text: 'бой начинается с 27 % улова вместо 25' },
  { level: 15, name: 'Стойкость III · Мастер', text: 'способности мификов короче на 30 %, золотая рамка шкалы' },
];

/** Бонусы уровня для шкалы и подсечки */
export interface LevelBonus {
  /** Окно подсечки +мс */
  hookMs: number;
  /** Рывки и резкость мягче на долю */
  calm: number;
  /** Способности короче, % */
  resist: number;
  /** Провисла / натянута — через столько тиков */
  slack: number;
  /** Улов в начале боя, % */
  pStart: number;
  /** Рывок рыбы виден заранее, мс (только экран, 0 — нет); стрелка — куда */
  senseMs: number;
  senseArrow: boolean;
  /** Сколько первых ошибок не считаются для оценки */
  forgive: number;
  /** Подсказки на экране: повадка рыбы, метка способности на полосе улова, золотая рамка */
  habits: boolean;
  abilityMark: boolean;
  master: boolean;
}

export function levelBonus(level: number): LevelBonus {
  const l = Number.isFinite(level) ? Math.min(15, Math.max(0, Math.trunc(level))) : 0;
  return {
    hookMs: l >= 11 ? 300 : l >= 6 ? 200 : l >= 1 ? 100 : 0,
    calm: l >= 13 ? 0.06 : l >= 8 ? 0.04 : l >= 2 ? 0.02 : 0,
    resist: l >= 15 ? 30 : l >= 10 ? 20 : l >= 5 ? 10 : 0,
    slack: SLACK_TICKS,
    pStart: l >= 14 ? 27 : 25,
    senseMs: l >= 12 ? 400 : l >= 4 ? 250 : 0,
    senseArrow: l >= 12,
    forgive: l >= 9 ? 1 : 0,
    habits: l >= 3,
    abilityMark: l >= 7,
    master: l >= 15,
  };
}

/** Окно подсечки: прибавка уровня, мс (в hookTicks к HOOK_MS категории) */
export function hookBonusMs(level: number): number {
  return levelBonus(level).hookMs;
}

/** Ошибки для оценки: первые forgive не считаются */
export function gradeErrors(errors: number, level: number): number {
  return Math.max(0, errors - levelBonus(level).forgive);
}

function factor(value: number | undefined, max: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(1, value)) : 1;
}

/** Множитель зоны от уровня и удочки по новым правилам: (1 + 0,015·ур) × (1 + удочка) */
export function zoneScale2(mods?: Readonly<FishCastMods>): number {
  const level = Math.min(15, Math.max(0, Math.trunc(mods?.level ?? 0) || 0));
  const rod = mods ? (mods.zoneScale / (1 + 0.025 * level)) : 1;
  return Math.min(ZONE_SCALE_MAX2, (1 + ZONE_PER_LEVEL * level) * (Number.isFinite(rod) && rod > 0 ? rod : 1));
}

/**
 * Сопротивление мификов и божественной по новым правилам, %/с (до моря) — вместо 4-й цифры CAL в shared/fishrules.ts:
 * 120 % времени в зоне, способность и зона +1,5 % за уровень сдвинули равновесие, подобрано tools/fish/abilities-sim.ts cal
 * под цель «обычного» на 10-м уровне (удочка 3, золотая блесна). Нет вида — прежнее.
 */
export const BIG_DRAIN: Readonly<Record<string, number>> = { whiteshark: 25.17, greenlandshark: 34.5, oarfish: 31.3, kalmar: 6.2 };

/**
 * Ход мификов по новым правилам. Рыба-молот — новый характер вместо большой белой (место whiteshark): быстрее (×1,25) и короче броски (размах ×0,5), зато
 * злее сопротивление. Шкала 150 % до конца боя: с этим ходом «обычный» — 68 % на 10-м и 85 % на 15-м (с ходом ×1,05/×0,6 — 72 и 91 %).
 */
export const BIG_MOVE: Readonly<Record<string, Partial<Pick<ReelStyle, 'spd' | 'dartSpd' | 'patternAmplitude' | 'patternPeriod'>>>> = {
  whiteshark: { spd: 18.75, dartSpd: 82.5, patternAmplitude: 17.85 },
  // Сельдяной король: круги с периодом 122 тика при его скорости не успевали раскрыться — он дрожал в нижних 20 % шкалы, и его
  // вываживали, просто держа зону у дна (93–100 %). С периодом 480 он и правда змеится по всей шкале.
  oarfish: { patternPeriod: 480 },
};

/**
 * Чуют ловушку (тики ожидания зоны у края без рыбы): кальмар — вариант «Б», мифики — так же (tools/fish/abilities-sim.ts camp).
 * Остров (раздел 12.4 дизайна): легенды, мифики и божественная — 1 с, лисья и плащеносная — 0,5 с.
 */
export const WARY: Readonly<Record<string, number>> = {
  kalmar: KALMAR_WARY, whiteshark: 60, greenlandshark: 60, oarfish: 60,
  opah: 60, albacore: 60, coelacanth: 60, goblinshark: 60, beluga: 60, thresher: 30, baskingshark: 60, frilledshark: 30,
};

/**
 * Чуют ловушку и с рыбой в зоне: зона столько тиков подряд у края — рыба уходит из неё. Остров — легенды и выше (4 с).
 * Осётр (легенда пристани, донный): у дна его ловили «без игры» в 100 % боёв (раздел 7 дизайна) — 4 с, как на острове; кемпер
 * у дна 100 → 1–2 %. Честная игра у донного осетра от этого тоже труднее — сопротивление ниже (DRAIN2), см. ниже.
 */
export const WARY_HOLD: Readonly<Record<string, number>> = {
  sturgeon: 240,
  opah: 240, albacore: 240, coelacanth: 240, goblinshark: 240, beluga: 240, thresher: 240, baskingshark: 240, frilledshark: 240,
};

/**
 * Сопротивление по новым правилам, %/с до моря (вместо 4-й цифры CAL): мифики и божественная — BIG_DRAIN; осётр — 52,95 → 26
 * под «чует ловушку» (WARY_HOLD): «обычный» 36/42/48/59/61 → 43/72/88/97/97 % на ур. 0/3/5/10/15 (не ниже прежнего ни на
 * одном уровне; как у тунца и меч-рыбы: 41/64/77/93/95 и 43/78/89/98/99), «опытный» 76/95/99/100/100 → 91/100/100/100/100,
 * кемпер у дна 100 → 0–3 % (N = 400–800, бот tools/fish/abilitybot.ts). Бой дольше: 9 → 20 с — осётр больше не лежит у дна.
 */
export const DRAIN2: Readonly<Record<string, number>> = { ...BIG_DRAIN, sturgeon: 26 };

/**
 * Потолок «злости места» в манере: море баркаса — рывки ×1,15, сопротивление ×1,2 (SEA_FIGHT/SEA_DRAIN); остров «Последний
 * свет» — ×1,3 и ×1,4 (дизайн, 12.1). Снимок заброса больше не даст — значит, и подделанный не даст.
 */
export const PLACE_FIGHT_MAX = 1.3;
export const PLACE_DRAIN_MAX = 1.4;

export interface Style2Opts {
  /** Своё сопротивление вместо BIG_DRAIN (подбор), %/с до моря */
  drain?: number;
  /** Без бонусов уровня (только зона +1,5 %) — для сравнения */
  noPerks?: boolean;
  /** Без способности (только +20 % времени) — для сравнения */
  noAbility?: boolean;
  /** Своя способность вместо таблицы (подбор цифр) */
  ability?: AbilitySpec;
  /** Кальмар: свой паттерн и «чует ловушку» (подбор варианта) */
  kalmarPattern?: ReelStyle['mainPattern'];
  wary?: number;
}

/**
 * Манера на шкале по новым правилам (10.10): как reelStyleFor, но зона +1,5 % за уровень, бонусы уровня (мягче рывки,
 * стойкость, улов с 27 % на 14-м), у мификов и божественной — 120 % времени в зоне и своя способность вместо
 * «последнего рывка»; кальмар — чует ловушку.
 */
export function reelStyle2(sp: number, mods?: Readonly<FishCastMods>, opts: Style2Opts = {}): ReelStyle {
  const r = ruleOf(sp);
  if (!r) throw new RangeError(`fishability: unknown reel species ${sp}`);
  const fish = isFishTier(r.tier);
  const lv = opts.noPerks ? levelBonus(0) : levelBonus(mods?.level ?? 0);
  const calm = mods?.calm !== undefined && Number.isFinite(mods.calm) ? Math.min(LURE_MAX.calm, Math.max(0, mods.calm)) : 0;
  const wild = fish && r.tier !== T_DIVINE;
  const sea = wild ? factor(mods?.sea, Math.max(SEA_FIGHT, PLACE_FIGHT_MAX)) : 1;
  const seaDrain = wild ? factor(mods?.seaDrain, Math.max(SEA_DRAIN, PLACE_DRAIN_MAX)) : 1;
  const cut = fish && mods?.zoneMul !== undefined && Number.isFinite(mods.zoneMul) ? Math.min(1, Math.max(0.5, mods.zoneMul)) : 1;
  const fast = fish ? factor(mods?.jerkMul, 1.2) : 1;
  const jerk = (1 - calm) * (fish ? 1 - lv.calm : 1) * sea;
  const big = r.tier === T_MYTH || r.tier === T_DIVINE;
  const id = FISH[sp].id;
  const ability = opts.noAbility ? undefined : opts.ability ?? abilityOf(id);
  const drain = opts.drain ?? DRAIN2[id] ?? r.style.drain;
  const base = { ...r.style, ...(BIG_MOVE[id] ?? {}) };
  const style: ReelStyle = {
    ...base,
    zone: r.style.zone * zoneScale2(mods) * cut,
    dartSpd: base.dartSpd * jerk * fast,
    sharp: base.sharp * jerk,
    drain: drain * seaDrain,
    ...(fish ? { slack: lv.slack, pStart: lv.pStart } : {}),
  };
  if (big) style.fill = BIG_FILL;
  if (big && ability) {
    // способность — вместо «последнего рывка»: одна кульминация за бой
    delete style.lastStand;
    style.ability = ability;
    style.abilityResist = lv.resist;
  }
  if (id === 'kalmar' && opts.kalmarPattern) style.mainPattern = opts.kalmarPattern;
  const wary = opts.wary ?? WARY[id];
  if (wary) style.wary = wary;
  const hold = WARY_HOLD[id];
  if (hold) style.waryHold = hold;
  return style;
}

/** Способность вида по id (пристань и баркас, остров); нет — null */
export function abilityOf(id: string): AbilitySpec | undefined {
  return SPECIES_ABILITY[id] ?? ISLE_ABILITY[id];
}

/** Вид по id (для симуляций) */
export function spById(id: string): number {
  const sp = FISH.findIndex((f) => f.id === id);
  if (sp < 0 || !RULE[sp]) throw new Error(`fishability: нет вида ${id}`);
  return sp;
}
