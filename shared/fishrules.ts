// Рыбалка 2.0: 51 морской вид в пяти категориях — 32 у пристани (8 из них только в дождь) и 19 на баркасе в открытом
// море (4 — только в дождь); сундук и хлам; цены, шансы и манера на шкале вываживания (shared/fishreel.ts).
// Названия, вес и вид рыб — в общей таблице FISH (shared/fishing.ts), здесь — правила. Решает сервер
// (server/lobby/fishing2.ts); клиент по этим же таблицам рисует шкалу, карточку улова, журнал, «Шансы сейчас».
//
// Сложность (fisheco, 03.10): чем ценнее рыба, тем она злее — зона меньше, рывки резче, успех ниже (BAND, CAL); у каждого
// вида свой характер: пара паттернов и где держится. Легенды и мифик делают «последний рывок» на 70 % прогресса.
// Баркас — своё море: рывки и резкость ×1,15, сопротивление ×1,2; блесна гасит рывки.
//
// 04.10 (патч рыбалки): божественная категория T_DIVINE = 7 (номера 0–6 уже в данных игроков) — дальневосточный кальмар,
// царь морей: у пристани и с баркаса, в любую погоду. Шансы считаются по категориям (tierOdds): база категории своего
// места × погода × бонусы, обычные — остаток; внутри категории — по весу вида. Гренландская акула в дождь клюёт и у
// пристани, и с баркаса.
//
// 04.10, причёсанные шансы (владелец): база мифической +0,4 п. п., божественная задана явно (+0,2 п. п.). Уровень,
// удочка, пиво, эль, пиво владыки, дождь и сезон умножают ВСЕ категории от редкой до божественной; блесна и водка —
// эпическую и выше (с божественной: «крупная рыба»). Дождь ×1,5 к ясной погоде, сезон рыбалки — ещё ×2 к дождю (×3).
// Потолок — сверху вниз: старшие категории получают свою долю целиком, нехватку отдают обычные (до пола 5 % рыбы —
// COMMON_FLOOR, чтобы пикарель ловилась у всех), потом редкие, потом эпические… Поэтому шанс «эта категория или выше» и
// ожидаемые жетоны и опыт за поклёвку от любого бонуса только растут.
//
// 10.10, остров «Последний свет» (флаг сервера ISLE; docs/superpowers/plans/2026-10-10-fishing-island.md): место 'isle' — свой
// пул из 20 видов (12 всегда и 8 только в туман), рыба злее (зона ×0,95, рывки ×1,3, сопротивление ×1,4), опыт ×2. Туман
// («Туман наступает») для шансов — как дождь (×1,5 к редким и выше, туманные виды платят ×1,5), сезон острова — ещё ×2. Кальмар и
// гренландская акула на острове не клюют. Виды острова — в своём счётчике (ISLE_COLLECTION, «Остров: N из 20»), коллекция 52
// видов (COLLECTION) от них не растёт. Цена видов острова (val) — сразу жетоны. С флагом рыба пристани и баркаса дешевле:
// ×0,4 вместо ×0,65 (setIsleEconomy). Шкала острова откалибрована по новым правилам (shared/fishability.ts reelStyle2) —
// docs/superpowers/plans/2026-10-10-fishing-island-reel.json.
import { FISH, fmtWeight } from './fishing.ts';
import type { FishZone } from './fishplaces.ts';
import type { ReelStyle, ReelPattern } from './fishreel.ts';
import type { FishCastMods } from './fishprogress.ts';
import { LORD, LURE_MAX } from './fishshop.ts';

// ------------------------------------------------------------ экономика

/**
 * Справочно: доход от рыбы обычного игрока 0-го уровня у пристани в ясную погоду, жетонов/мин (меряет тест на модели игрока;
 * сундуки отдельно). Было 17,1; хотфикс 10.10 (FISH_PRICE_CUT = 0,65) — 11,7: мелкая рыба режется сильнее из-за округления.
 */
export const FISH_TARGET_PER_MIN = 11.7;
/** То же с флагом острова (ISLE: рыба ×0,4 вместо ×0,65): 7,3 🪙/мин рыбой — плюс ~6,3 сундуками, вместе ~13,6 (ориентир 8–15) */
export const FISH_TARGET_PER_MIN_ISLE = 7.3;
/** Сколько очков ценности (поле val) в минуту набирает тот же игрок — меряет тест (04.10: мифик и божественная чаще — 13,7 → 14,2). */
export const FISH_POINTS_PER_MIN = 14.2;
/** Исходный курс выпуска 6: заморожен, чтобы +75 % считались от старой целой цены, а не от новой цели. */
export const COIN_PER_POINT = 13.5 / 13.7;
/** Калибровка только остальных рыб. Это не второй глобальный множитель для обычных. */
export const FISH_OTHER_PRICE_SCALE = 1.076;
/**
 * Хотфикс 10.10 (владелец): стоимость продажи рыбы скупщикам на пристани и баркасе −35 %. Множитель один на всю рыбу
 * коллекции (basePrice) — не на сундук, хлам, бонус за новый вид (NEW_BONUS2) и клад Посейдона. Опыт он не трогает: ни
 * опыт рыбалки, ни общий (server/lobby/fishing2.ts считает его по цене без множителя). Рыба, уже лежащая в рюкзаках,
 * сохраняет записанную цену (bag.p). Позже, с новым островом, цену доведут до −60 % — тогда здесь будет 0,4.
 */
export const FISH_PRICE_CUT = 0.65;
/**
 * С флагом острова (ISLE) рыба пристани и баркаса дешевле: −60 % к ценам до хотфикса (×0,40 вместо ×0,65). Виды острова
 * этот множитель не трогает — их цена (val) задана сразу в жетонах.
 */
export const ISLE_PRICE_CUT = 0.4;
let priceCut = FISH_PRICE_CUT;
/** Флаг острова на этом сервере (server/main.ts) или у клиента (приветствие набережной): цена рыбы ×0,4 вместо ×0,65 */
export function setIsleEconomy(on: boolean): void {
  priceCut = on ? ISLE_PRICE_CUT : FISH_PRICE_CUT;
}
/** Множитель цены рыбы пристани и баркаса сейчас: ×0,65 или с островом ×0,4 */
export function fishPriceCut(): number {
  return priceCut;
}
/** Баркас: доход и опыт за каждую рыбу ×1,25 (база видов баркаса — как у пристани в минуту) */
export const BARKAS_INCOME = 1.25;
export const BARKAS_XP = 1.25;
/** Море злее: рывки и резкость ×1,15, сопротивление ×1,2 — поверх манеры вида */
export const SEA_FIGHT = 1.15;
export const SEA_DRAIN = 1.2;
/** Остров злее моря: рывки и резкость ×1,3, сопротивление ×1,4, зона ×0,95 — поверх манеры вида; божественную место не трогает */
export const ISLE_FIGHT = 1.3;
export const ISLE_DRAIN = 1.4;
export const ISLE_ZONE = 0.95;
/** Остров: опыт за рыбу ×2 (баркас ×1,25). Доход место не множит: цена видов острова уже в жетонах */
export const ISLE_XP = 2;
/** Легенды и выше острова «чуют ловушку»: зона 1 с у края без рыбы (лисья и плащеносная — 0,5 с) или 4 с у края даже с рыбой */
export const ISLE_WARY = 60;
export const ISLE_WARY_HOLD = 240;
const ISLE_WARY_TUNE: Readonly<Record<string, number>> = { thresher: 30, frilledshark: 30 };
/** Опыт за рыбу: прежняя формула ×0,4 (было ×0,3333 — +20 %) */
export const XP_SCALE = 0.4;
/** Сорвалась эпическая и выше после стольких тиков борьбы (3 с) — утешение: четверть опыта за поимку */
export const CONSOLATION_TICKS = 180;
export const CONSOLATION_SHARE = 0.25;

// ------------------------------------------------------------ категории

export const T_COMMON = 0;
export const T_RARE = 1;
export const T_EPIC = 2;
export const T_LEGEND = 3;
export const T_MYTH = 4;
export const T_JUNK = 5;
export const T_CHEST = 6;
/** Божественная: выше мифической (номер 7 — после хлама и сундука, старые номера в данных игроков не сдвигаются) */
export const T_DIVINE = 7;
export const TIER_NAMES = ['обычная', 'редкая', 'эпическая', 'легендарная', 'мифическая', 'находка', 'сундук', 'божественная'] as const;
/** Во множественном числе — для журнала */
export const TIER_TITLES = ['Обычные', 'Редкие', 'Эпические', 'Легендарные', 'Мифические', 'Находки', 'Сундук', 'Божественные'] as const;
/** Коротко — для полосы «Шансы сейчас» */
export const TIER_SHORT = ['обычн.', 'редк.', 'эпик', 'лег.', 'миф.', 'хлам', 'сундук', 'бож.'] as const;
/** Цвет категории: рамки, подписи, шкала */
export const TIER_CSS = ['#8f9aa3', '#2f86d8', '#9a4ee0', '#eb9a12', '#e8364f', '#8a7766', '#d9a521', '#18b7a6'] as const;
/** Новый вид в коллекции — бонус, жетонов (один раз) */
export const NEW_BONUS2 = [5, 10, 20, 40, 100, 0, 0, 250] as const;
/** С этой категории улов объявляется в общем чате */
export const ANNOUNCE_TIER = T_EPIC;
/** Категории рыб по ценности (журнал, «Шансы сейчас»): обычная … мифическая, божественная */
export const FISH_TIERS: readonly number[] = [T_COMMON, T_RARE, T_EPIC, T_LEGEND, T_MYTH, T_DIVINE];

/** Рыба коллекции (не хлам и не сундук) */
export function isFishTier(tier: number): boolean {
  return (tier >= T_COMMON && tier <= T_MYTH) || tier === T_DIVINE;
}

/** Ранг ценности категории: обычная 0 … мифическая 4, божественная 5; хлам и сундук — −1. Сравнения «эпическая и выше» — по нему. */
export function tierRank(tier: number): number {
  return tier === T_DIVINE ? 5 : tier >= T_COMMON && tier <= T_MYTH ? tier : -1;
}

/** Дождевые виды платят ×3/2 */
export const RAIN_NUM = 3;
export const RAIN_DEN = 2;
/** В дождь шанс всех категорий от редкой до божественной — ×1,5 к ясной погоде (обычные — остаток) */
export const RAIN_MUL = 1.5;
/** Прежнее имя RAIN_MUL (подписи клиента): дождь ×1,5 — у всех категорий от редкой до божественной */
export const RAIN_TOP_MUL = RAIN_MUL;
/** Сезон рыбалки (особый дождь): ещё ×2 к дождю — ко всем твоим шансам от редкой до божественной (к ясной погоде ×3) */
export const SEASON_MUL = 2;
/** Божественная дороже мифических своего места в 2,5 раза (цена и опыт); её шанс задан явно — DIVINE_BASE */
export const DIVINE_RATIO = 2.5;
/** Мифическая: +0,4 п. п. ко всем поклёвкам новичка в ясную погоду сверх весов видов (у пристани 0,587 → 0,987 %, на баркасе 0,555 → 0,955 %) */
export const MYTH_ADD = 0.004;
/** Божественная — явно, доля всех поклёвок новичка в ясную погоду (было мифическая / 2,5: 0,23 и 0,22 % — стало +0,2 п. п.) */
export const DIVINE_BASE: Readonly<Record<FishZone, number>> = { pier: 0.0043, barkas: 0.0042, isle: 0.0043 };
/**
 * Пол обычных: не меньше этой доли поклёвок рыбы при любых бонусах и погоде — редкие и выше делят не больше 95 %. Иначе
 * у прокачанного рыбака в дождь обычных не остаётся и пикарель (обычная дождевая) не ловится — коллекцию не закрыть.
 */
export const COMMON_FLOOR = 0.05;
/** В дождь опыт рыбалки ×1,15 (за любую рыбу, пойманную, пока идёт дождь) */
export const RAIN_XP = 1.15;
/**
 * Зелёная зона (хитбокс и то, что видно) — ×0,9 от прежней на всех категориях: владелец 03.10 захотел чуть сложнее;
 * шансы поимки после этого обратно не подтягивали (цифры — в docs/superpowers/plans/2026-10-03-fisheco.md).
 */
export const ZONE_BASE = 0.9;

/** Сундук вместо улова: на столько поклёвок из 10 000 (3 %) */
export const CHEST_PER_10K = 300;
/** Хлам (сапог, бутылка): на столько поклёвок из 10 000 — у новичка; с каждым уровнем рыбалки на десятую меньше */
export const JUNK_PER_10K = 450;

/** Хлам на уровне рыбалки level: 450 из 10 000 у новичка, на 10-м — ни одного (освободившееся — рыбе) */
export function junkPer10k(level = 0): number {
  const l = Number.isFinite(level) ? Math.min(10, Math.max(0, Math.trunc(level))) : 0;
  return Math.round(JUNK_PER_10K * (10 - l) / 10);
}
/**
 * Сколько в сундуке: полосы «от, до, вес» — крупное реже; 250 — самый крупный обычный сундук, а не джекпот (джекпот в
 * рыбалке один — «Сокровища Посейдона», POSEIDON_COINS). 04.10: все суммы ×1,25 к прежним (25–50, 51–100, 101–150, 151–199
 * и 200), веса полос те же — средний сундук стал на 25 % богаче (было 57,4 🪙, стало 71,9 🪙).
 */
export const CHEST_BANDS: ReadonlyArray<readonly [number, number, number]> = [
  [31, 63, 650],
  [64, 125, 250],
  [126, 188, 70],
  [189, 249, 25],
  [250, 250, 5],
];
/** С этой суммы сундук объявляется в общем чате: верхние две полосы (3 % сундуков) — прежние 151 ×1,25 */
export const CHEST_ANNOUNCE = 189;
/** Самый крупный обычный сундук — последняя полоса (прежние 200 ×1,25). Обычный, без джекпота: джекпот — только клад Посейдона. */
export const CHEST_MAX = 250;
/** «Сокровища Посейдона»: так много жетонов в кладе (вместо обычной суммы), ничем не множится */
export const POSEIDON_COINS = 1500;
/** Максимальная доля сундуков с кладом Посейдона, с 15-го уровня рыбалки */
export const POSEIDON_SHARE = 0.03;
/** До 1-го уровня включительно — 1 % сундуков с кладом; дальше линейно до 3 % на 15-м. */
export function poseidonShare(level = 0): number {
  const l = Number.isFinite(level) ? Math.min(15, Math.max(1, Math.floor(level))) : 1;
  return 0.01 + (POSEIDON_SHARE - 0.01) * (l - 1) / 14;
}
/** Клад Посейдона по сумме в сундуке: обычный сундук столько не вмещает (самый крупный — CHEST_MAX) */
export function isPoseidon(coins: number): boolean {
  return coins >= POSEIDON_COINS;
}

// ------------------------------------------------------------ полосы сложности

/**
 * Полоса категории: зона игрока % и резкость 1–10 растут с ценностью и одинаковы у всей категории (их видно на шкале).
 * Скорость, рывок, размах, цикл и сопротивление — отправная точка калибровки (tools/fish/calibrate.ts), у видов свои
 * цифры (CAL ниже). Уровень, удочка и блесна поднимают успех (docs/superpowers/plans/2026-10-03-fisheco.md).
 */
export const BAND: ReadonlyArray<{ zone: number; spd: number; dart: number; amp: number; per: number; drain: number; sharp: number }> = [
  { zone: 37, spd: 20, dart: 70, amp: 32, per: 170, drain: 12, sharp: 5 },
  { zone: 30.5, spd: 27, dart: 100, amp: 42, per: 150, drain: 16, sharp: 6 },
  { zone: 27.5, spd: 33, dart: 130, amp: 52, per: 135, drain: 16, sharp: 7 },
  { zone: 25, spd: 38, dart: 160, amp: 62, per: 125, drain: 14, sharp: 8 },
  { zone: 22.5, spd: 43, dart: 190, amp: 70, per: 115, drain: 12, sharp: 9 },
  // божественная (по рангу 5): зона меньше всех, резкость — предел
  { zone: 20, spd: 48, dart: 220, amp: 76, per: 110, drain: 12, sharp: 10 },
];
/** «Последний рывок» легенд и мификов: скорость ×1,3 на один цикл */
export const LAST_STAND = 130;
/** «Последний рывок» божественной: ×1,5 */
export const LAST_STAND_DIVINE = 150;

// ------------------------------------------------------------ виды

export interface FishRule {
  /** Номер в FISH */
  sp: number;
  id: string;
  tier: number;
  /** Где ловится: у пристани, на баркасе в открытом море или у острова (родное место: журнал, опыт) */
  zone: FishZone;
  /** Все места, где клюёт (гренландская акула и кальмар — и там, и там) */
  zones: readonly FishZone[];
  /** Как часто клюёт: вес внутри своей категории в пуле места (дождевые добавляются в дождь) */
  bite: number;
  /** Только в дождь (и платит ×1,5); у видов острова — только в туман («Туман наступает») */
  rain: boolean;
  /** Ценность, очки: за самую лёгкую и за самую тяжёлую (жетоны — через COIN_PER_POINT) */
  val: readonly [number, number];
  /** Замороженная сложность выпуска 6 — из неё опыт у видов пристани (fishCatchXp) */
  xpDifficulty: number;
  /** База опыта (до «идеально», легенд ×5 и ×0,4) — у видов баркаса задана прямо (03.10 +4,5 %: после −10 % зоны опыт баркаса снова ×1,25 к пристани) */
  xpBase?: number;
  /** Манера на шкале */
  style: ReelStyle;
  /** Манера словами — для журнала */
  note: string;
}

interface Raw {
  tier: number;
  bite: number;
  rain: boolean;
  val: readonly [number, number];
  zone?: FishZone;
  /** Клюёт и во втором месте (по умолчанию — только в своём) */
  also?: FishZone;
  xpBase?: number;
  /** Главный и второй паттерн (скорость, рывок, размах, цикл и сопротивление — в таблице CAL) */
  pat: readonly [ReelPattern, ReelPattern];
  /** Где держится, % шкалы снизу; доля рывков вверх, % */
  lo?: number;
  hi?: number;
  up?: number;
  note: string;
}

// Порядок внутри категории — порядок журнала. Новое — только в конец своего места (ключи альбома не меняются).
const RAW: Record<string, Raw> = {
  // --- пристань: обычные — широкая зона, мягкие, по ним учатся
  hamsa: { tier: T_COMMON, bite: 70, rain: false, val: [2, 3], pat: ['Nervous', 'Dash'], lo: 35, hi: 95, note: 'мелкая суета у поверхности' },
  goby: { tier: T_COMMON, bite: 75, rain: false, val: [2, 4], pat: ['HoverDash', 'SlowMigration'], lo: 0, hi: 40, up: 70, note: 'сидит у дна, короткие подскоки' },
  scad: { tier: T_COMMON, bite: 70, rain: false, val: [2, 5], pat: ['Dash', 'Wave'], note: 'ровные быстрые проходы' },
  redmullet: { tier: T_COMMON, bite: 60, rain: false, val: [2, 5], pat: ['SlowMigration', 'Sawtooth'], lo: 0, hi: 45, note: 'роется у самого дна' },
  wrasse: { tier: T_COMMON, bite: 60, rain: false, val: [2, 4], pat: ['FakeDash', 'Nervous'], lo: 20, hi: 75, note: 'снуёт у камней' },
  karas: { tier: T_COMMON, bite: 55, rain: false, val: [2, 4], pat: ['Wave', 'SlowMigration'], note: 'плавные широкие ходы' },
  blenny: { tier: T_COMMON, bite: 45, rain: false, val: [2, 3], pat: ['Ambush', 'HoverDash'], lo: 0, hi: 55, up: 65, note: 'сидит на камне, вдруг прыгает' },
  sardine: { tier: T_COMMON, bite: 55, rain: false, val: [2, 3], pat: ['Sawtooth', 'Nervous'], lo: 40, hi: 100, note: 'зигзаги стайки у поверхности' },
  whiting: { tier: T_COMMON, bite: 55, rain: false, val: [2, 5], pat: ['SlowMigration', 'Wave'], lo: 15, hi: 75, note: 'ровно ходит в толще' },
  picarel: { tier: T_COMMON, bite: 180, rain: true, val: [2, 3], pat: ['Nervous', 'DoubleDash'], lo: 30, hi: 85, note: 'вертлявая, держится стайкой' },
  // --- редкие: зона меньше, у каждой свой норов
  mullet: { tier: T_RARE, bite: 48, rain: false, val: [4, 12], pat: ['Breach', 'DoubleDash'], up: 80, note: 'прыгает свечками вверх' },
  mackerel: { tier: T_RARE, bite: 48, rain: false, val: [4, 10], pat: ['DoubleDash', 'SlowMigration'], note: 'носится без остановки' },
  garfish: { tier: T_RARE, bite: 42, rain: false, val: [4, 10], pat: ['Breach', 'EdgeSnapback'], lo: 45, hi: 100, up: 80, note: 'у самой поверхности, свечки' },
  scorpion: { tier: T_RARE, bite: 42, rain: false, val: [5, 12], pat: ['Ambush', 'FakeDash'], lo: 0, hi: 50, note: 'засада: стоит — и бросок' },
  flounder: { tier: T_RARE, bite: 42, rain: false, val: [5, 13], pat: ['HoverDash', 'Wave'], lo: 0, hi: 35, up: 70, note: 'лежит на дне, взлетает и планирует' },
  gurnard: { tier: T_RARE, bite: 38, rain: false, val: [5, 12], pat: ['Sawtooth', 'HoverDash'], lo: 0, hi: 45, note: 'шагает по дну перебежками' },
  eel: { tier: T_RARE, bite: 140, rain: true, val: [5, 13], pat: ['Wave', 'FakeDash'], lo: 0, hi: 60, note: 'извивается, то туда, то сюда' },
  meagre: { tier: T_RARE, bite: 130, rain: true, val: [5, 13], pat: ['SlowMigration', 'EdgeSnapback'], note: 'тяжёлые мощные проводки' },
  shad: { tier: T_RARE, bite: 150, rain: true, val: [4, 10], pat: ['FakeDash', 'Dash'], lo: 35, hi: 100, note: 'серебряная молния у поверхности' },
  // --- эпические: быстрые, резкие, частые рывки
  bluefish: { tier: T_EPIC, bite: 28, rain: false, val: [10, 26], pat: ['DoubleDash', 'FakeDash'], note: 'агрессивный, резкие броски' },
  dogfish: { tier: T_EPIC, bite: 26, rain: false, val: [11, 28], pat: ['Dash', 'EdgeSnapback'], note: 'акулья хватка, длинные проводки' },
  ray: { tier: T_EPIC, bite: 24, rain: false, val: [11, 28], pat: ['Wave', 'HoverDash'], lo: 0, hi: 55, note: 'планирует дугами, липнет ко дну' },
  turbot: { tier: T_EPIC, bite: 22, rain: false, val: [13, 32], pat: ['Ambush', 'EdgeSnapback'], lo: 0, hi: 40, up: 75, note: 'лежит пластом — и взмывает' },
  seabass: { tier: T_EPIC, bite: 110, rain: true, val: [11, 28], pat: ['FakeDash', 'DoubleDash'], note: 'мощные рывки в прибое' },
  leerfish: { tier: T_EPIC, bite: 100, rain: true, val: [13, 32], pat: ['EdgeSnapback', 'DoubleDash'], note: 'сильный хищник прибоя' },
  // --- легендарные: испытание, «последний рывок»
  sturgeon: { tier: T_LEGEND, bite: 10, rain: false, val: [36, 105], pat: ['Sound', 'Ambush'], lo: 0, hi: 50, up: 25, note: 'уходит на дно и тянет мощными рывками' },
  tuna: { tier: T_LEGEND, bite: 8, rain: false, val: [40, 110], pat: ['Dash', 'Sawtooth'], note: 'неутомимый: носится по всей шкале' },
  swordfish: { tier: T_LEGEND, bite: 8, rain: false, val: [40, 110], pat: ['Breach', 'Dash'], up: 80, note: 'свечки и прыжки вверх' },
  angler: { tier: T_LEGEND, bite: 8, rain: false, val: [32, 95], pat: ['Ambush', 'Nervous'], lo: 0, hi: 50, note: 'замирает надолго — и взрывной бросок' },
  bluemarlin: { tier: T_LEGEND, bite: 20, rain: true, val: [45, 125], pat: ['EdgeSnapback', 'Wave'], up: 70, note: 'длинные быстрые проходы и свечки' },
  // --- мифические: событие на весь пирс
  // ВНИМАНИЕ: id 'whiteshark' показывает РЫБУ-МОЛОТ, а 'hammerhead' (легенда баркаса, только в дождь) — БОЛЬШУЮ БЕЛУЮ АКУЛУ.
  // Обмен 10.10 (владелец): поменяли только лицо (имя, вес, цвета, картинку — shared/fishing.ts), а категория, место, шанс,
  // цена, паттерны, CAL и опыт остались за id — ключи альбомов игроков не меняются, «кто уже ловил» зачтено.
  whiteshark: { tier: T_MYTH, bite: 6, rain: false, val: [200, 400], pat: ['FakeDash', 'Ambush'], note: 'всё сразу: скорость, рывки, сила' },
  greenlandshark: { tier: T_MYTH, also: 'barkas', bite: 3, rain: true, val: [220, 480], pat: ['SlowMigration', 'Sound'], lo: 0, hi: 70, up: 30, note: 'глубокие тяжёлые проводки, мощное сопротивление; в дождь — и у пристани, и с баркаса' },

  // --- баркас, открытое море: свой пул; доход и опыт ×1,25, рыба злее (SEA_FIGHT, SEA_DRAIN)
  sprat: { tier: T_COMMON, zone: 'barkas', bite: 165, rain: false, val: [2.6, 4], xpBase: 17.8, pat: ['Zigzag', 'Nervous'], lo: 40, hi: 100, note: 'стайка мечется зигзагами' },
  flyingfish: { tier: T_COMMON, zone: 'barkas', bite: 130, rain: false, val: [2.6, 5.3], xpBase: 17.8, pat: ['Breach', 'Nervous'], lo: 45, hi: 100, up: 85, note: 'выпрыгивает из воды и планирует' },
  haddock: { tier: T_COMMON, zone: 'barkas', bite: 145, rain: false, val: [2.6, 6.5], xpBase: 17.8, pat: ['Nervous', 'Wave'], lo: 0, hi: 50, note: 'кивает и дёргается у дна' },
  hake: { tier: T_COMMON, zone: 'barkas', bite: 137, rain: false, val: [2.6, 6.5], xpBase: 17.8, pat: ['SlowMigration', 'Dash'], lo: 10, hi: 70, note: 'уходит в глубину и хватает пастью' },
  redfish: { tier: T_RARE, zone: 'barkas', bite: 72, rain: false, val: [5.2, 13.7], xpBase: 29.3, pat: ['HoverDash', 'Sawtooth'], lo: 0, hi: 60, note: 'упирается колючками, рвётся рывками' },
  bonito: { tier: T_RARE, zone: 'barkas', bite: 72, rain: false, val: [5.2, 13.7], xpBase: 29.3, pat: ['Dash', 'Zigzag'], note: 'быстрые броски, как у маленького тунца' },
  cod: { tier: T_RARE, zone: 'barkas', bite: 69, rain: false, val: [5.2, 14.9], xpBase: 29.3, pat: ['Sound', 'DoubleDash'], lo: 0, hi: 55, up: 35, note: 'тяжело тянет вниз' },
  barracuda: { tier: T_RARE, zone: 'barkas', bite: 62, rain: false, val: [5.2, 14.9], xpBase: 29.3, pat: ['Ambush', 'Dash'], note: 'стоит в засаде — и молнией' },
  wolffish: { tier: T_EPIC, zone: 'barkas', bite: 38, rain: false, val: [11.4, 28.4], xpBase: 34.5, pat: ['Ambush', 'Sawtooth'], lo: 0, hi: 50, note: 'кусается: стоит у дна и резко бьёт' },
  mahi: { tier: T_EPIC, zone: 'barkas', bite: 36, rain: false, val: [11.4, 29.4], xpBase: 34.5, pat: ['Breach', 'FakeDash'], up: 75, note: 'акробат: свечки и обманные броски' },
  amberjack: { tier: T_EPIC, zone: 'barkas', bite: 32, rain: false, val: [12.3, 31.4], xpBase: 34.5, pat: ['DoubleDash', 'Sound'], up: 30, note: 'рвёт вниз, к самому дну' },
  sunfish: { tier: T_LEGEND, zone: 'barkas', bite: 11, rain: false, val: [30.6, 89.1], xpBase: 35.7, pat: ['SlowMigration', 'Circle'], note: 'огромная и медленная, но неудержимая' },
  halibut: { tier: T_LEGEND, zone: 'barkas', bite: 14, rain: false, val: [32.2, 91.8], xpBase: 35.7, pat: ['HoverDash', 'Sound'], lo: 0, hi: 45, up: 30, note: 'лежит пластом и тянет вниз всем весом' },
  mako: { tier: T_LEGEND, zone: 'barkas', bite: 11, rain: false, val: [34, 97.6], xpBase: 35.7, pat: ['Dash', 'Breach'], up: 70, note: 'самая быстрая акула: броски и прыжки' },
  oarfish: { tier: T_MYTH, zone: 'barkas', bite: 6, rain: false, val: [187, 373], xpBase: 39.5, pat: ['Circle', 'Sound'], note: 'змеится по всей шкале — и уходит в глубину' },
  hairtail: { tier: T_RARE, zone: 'barkas', bite: 330, rain: true, val: [5.2, 13.7], xpBase: 29.3, pat: ['Wave', 'Zigzag'], lo: 20, hi: 90, note: 'вьётся серебряной лентой' },
  wahoo: { tier: T_EPIC, zone: 'barkas', bite: 150, rain: true, val: [12.3, 31.4], xpBase: 34.5, pat: ['Zigzag', 'DoubleDash'], note: 'самый быстрый: длинные рывки зигзагом' },
  blueshark: { tier: T_EPIC, zone: 'barkas', bite: 120, rain: true, val: [11.4, 29.4], xpBase: 34.5, pat: ['Circle', 'FakeDash'], note: 'кружит и обманывает' },
  hammerhead: { tier: T_LEGEND, zone: 'barkas', bite: 30, rain: true, val: [38.3, 106.1], xpBase: 35.7, pat: ['Circle', 'EdgeSnapback'], note: 'широкие круги и рывки к краю' },

  // --- божественная: царь морей — у пристани и с баркаса, в любую погоду; цена и опыт ×2,5 к мифику (и шанс в 2,5 раза меньше)
  kalmar: { tier: T_DIVINE, also: 'barkas', bite: 1, rain: false, val: [500, 1000], xpBase: 98, pat: ['Jet', 'Sound'], up: 60, note: 'царь морей: реактивные рывки во всю шкалу, чернильный обман и уход в глубину' },

  // --- остров «Последний свет» (флаг ISLE): свой пул; rain — только в туман («Туман наступает»), цена val — сразу жетоны.
  // Обычные и редкие — мелкие северные рыбы, эпические и выше — глубоководные; мифики и божественная — со способностью
  // (shared/fishability.ts ISLE_ABILITY). Цены — таблица плана острова ×1,1 (10.10, внедрение): после калибровки способностей
  // (мифики 55 %, божественная 50 % вместо 66 и 70 %) доход «обычного» 10-го уровня на «Нортсильвере» упал к 6 000 🪙/ч — с ×1,1 он
  // снова в середине коридора 6 000–7 000 (~6 550, tools/fish/isle-income.ts). Только в конец, ключи альбома не менять.
  capelin: { tier: T_COMMON, zone: 'isle', bite: 180, rain: false, val: [7, 11], xpBase: 17.8, pat: ['Zigzag', 'Sawtooth'], lo: 40, note: 'стайка у поверхности: зигзаг и пила' },
  smelt: { tier: T_COMMON, zone: 'isle', bite: 170, rain: false, val: [7, 14], xpBase: 17.8, pat: ['Nervous', 'Circle'], lo: 25, hi: 90, note: 'вертится кругами и пахнет свежим огурцом' },
  navaga: { tier: T_COMMON, zone: 'isle', bite: 170, rain: false, val: [7, 15], xpBase: 17.8, pat: ['HoverDash', 'Zigzag'], lo: 0, hi: 50, up: 70, note: 'северная тресочка: у дна, подскоки зигзагом' },
  lanternfish: { tier: T_COMMON, zone: 'isle', bite: 200, rain: true, val: [7, 12], xpBase: 17.8, pat: ['FakeDash', 'Zigzag'], lo: 50, note: 'мигает огоньками в тумане и обманывает бросками' },
  lumpfish: { tier: T_RARE, zone: 'isle', bite: 140, rain: false, val: [15, 36], xpBase: 29.3, pat: ['Ambush', 'SlowMigration'], lo: 0, hi: 45, note: 'присосался к камню — и вдруг отрывается' },
  saithe: { tier: T_RARE, zone: 'isle', bite: 140, rain: false, val: [15, 39], xpBase: 29.3, pat: ['DoubleDash', 'Wave'], note: 'ходит стаей: двойные броски волной' },
  grenadier: { tier: T_RARE, zone: 'isle', bite: 150, rain: true, val: [15, 36], xpBase: 29.3, pat: ['Sound', 'Wave'], lo: 0, hi: 55, up: 35, note: 'длинный хвост: волной уходит в глубину' },
  lamprey: { tier: T_RARE, zone: 'isle', bite: 150, rain: true, val: [15, 36], xpBase: 29.3, pat: ['EdgeSnapback', 'Nervous'], note: 'присасывается к краю и мечется назад' },
  salmon: { tier: T_EPIC, zone: 'isle', bite: 65, rain: false, val: [31, 77], xpBase: 34.5, pat: ['Breach', 'Sawtooth'], up: 80, note: 'свечки над водой и упрямая пила' },
  ling: { tier: T_EPIC, zone: 'isle', bite: 65, rain: false, val: [31, 77], xpBase: 34.5, pat: ['Sound', 'Sawtooth'], lo: 0, hi: 55, up: 30, note: 'длинная, как налим: тянет вниз ступеньками' },
  chimaera: { tier: T_EPIC, zone: 'isle', bite: 110, rain: true, val: [31, 73], xpBase: 34.5, pat: ['Circle', 'Wave'], lo: 10, hi: 70, note: 'призрак глубин: плавные круги и волны' },
  roughy: { tier: T_EPIC, zone: 'isle', bite: 110, rain: true, val: [31, 73], xpBase: 34.5, pat: ['HoverDash', 'Breach'], up: 70, note: 'долго висит в толще — и свечкой вверх' },
  opah: { tier: T_LEGEND, zone: 'isle', bite: 28, rain: false, val: [77, 220], xpBase: 35.7, pat: ['Circle', 'Dash'], note: 'тёплая рыба-щит: широкие круги и броски' },
  albacore: { tier: T_LEGEND, zone: 'isle', bite: 27, rain: false, val: [77, 210], xpBase: 35.7, pat: ['Zigzag', 'EdgeSnapback'], note: 'длинные плавники: зигзагом к краю и назад' },
  coelacanth: { tier: T_LEGEND, zone: 'isle', bite: 25, rain: true, val: [77, 220], xpBase: 35.7, pat: ['Ambush', 'Wave'], lo: 0, hi: 60, note: 'живое ископаемое: замирает и плывёт волной' },
  goblinshark: { tier: T_LEGEND, zone: 'isle', bite: 25, rain: true, val: [83, 230], xpBase: 35.7, pat: ['Ambush', 'Circle'], note: 'выстреливает челюстями из засады и кружит' },
  beluga: { tier: T_MYTH, zone: 'isle', bite: 4, rain: false, val: [330, 660], xpBase: 39.5, pat: ['Sound', 'EdgeSnapback'], lo: 0, hi: 60, up: 35, note: 'древняя и могучая: уходит на дно и рвёт к краю; «Второе дыхание»' },
  thresher: { tier: T_MYTH, zone: 'isle', bite: 4, rain: false, val: [330, 660], xpBase: 39.5, pat: ['FakeDash', 'Sawtooth'], note: 'хвост-хлыст: обманные броски пилой; «Хлыст»' },
  baskingshark: { tier: T_MYTH, zone: 'isle', bite: 5, rain: true, val: [350, 700], xpBase: 39.5, pat: ['SlowMigration', 'Breach'], note: 'огромная и неспешная, выныривает из тумана; «Пелена»' },
  // божественная острова: царь острова — без множителей места (как кальмар), цена ×2,5 к мифику
  frilledshark: { tier: T_DIVINE, zone: 'isle', bite: 1, rain: false, val: [825, 1650], xpBase: 98, pat: ['Zigzag', 'Sound'], note: 'морской змей: извивается и уходит в глубину; «Острые зубы»' },

  // --- не рыбы: лежат мёртвым грузом
  boot: { tier: T_JUNK, bite: 0, rain: false, val: [0, 0], pat: ['SlowMigration', 'SlowMigration'], note: 'не сопротивляется' },
  bottle: { tier: T_JUNK, bite: 0, rain: false, val: [0, 0], pat: ['SlowMigration', 'SlowMigration'], note: 'не сопротивляется' },
  chest: { tier: T_CHEST, bite: 0, rain: false, val: [0, 0], pat: ['SlowMigration', 'SlowMigration'], note: 'тяжёлый и не бьётся' },
};

/** Хлам и сундук: прежняя манера без паттернов — тянутся мёртвым грузом */
const DEAD: Record<string, ReelStyle> = {
  boot: { spd: 8, sharp: 2, turn: 2, dart: 0, dartSpd: 0, dartUp: 0, hover: 1500, hoverP: 90, lo: 0, hi: 20, roam: 10, zone: 40, drain: 7 },
  bottle: { spd: 10, sharp: 2, turn: 3, dart: 0, dartSpd: 0, dartUp: 0, hover: 1500, hoverP: 90, lo: 0, hi: 25, roam: 12, zone: 40, drain: 7 },
  chest: { spd: 8, sharp: 2, turn: 2, dart: 0, dartSpd: 0, dartUp: 0, hover: 1500, hoverP: 90, lo: 0, hi: 15, roam: 10, zone: 40, drain: 7 },
};

// Frozen released cost-to-success of release 6: XP base of pier species (see fishCatchXp).
const XP_DIFFICULTY: Record<string, number> = {
  hamsa: 348.6, goby: 326.5, scad: 343.7, redmullet: 330.3, wrasse: 335.7, karas: 329.6, blenny: 329.1, sardine: 350.6, whiting: 328.9, picarel: 349.5,
  mullet: 476.2, mackerel: 472.4, garfish: 535.4, scorpion: 493.9, flounder: 441.8, gurnard: 484.4, eel: 505, meagre: 461.7, shad: 539.5,
  bluefish: 623.8, dogfish: 661.7, ray: 618.6, turbot: 677.8, seabass: 664.8, leerfish: 644.2,
  sturgeon: 902.5, tuna: 835.4, swordfish: 895.1, angler: 961, whiteshark: 1393.5,
  bluemarlin: 879.9, greenlandshark: 1704.6,
};

/**
 * Подобрано tools/fish/calibrate.ts (03.10): скорость %/с, рывок %/с, размах %, сопротивление %/с, цикл (тики). Паттерн
 * сильно меняет сложность, поэтому у каждого вида свои цифры: «обычный» игрок модели (test/fishbot.ts) 0-го уровня без
 * бонусов вытаскивает обычных ~99 %, редких ~93, эпических ~80, легенд ~55, мифических ~36 % за ~6/9/12/15/18 с боя.
 * Трудные паттерны спокойнее (медленнее, меньше размах, длиннее цикл), но злее сопротивлением. Баркас сверху злее (SEA_*).
 * Перекалибровано под «леску провисла» (зона без нажатий уходит под шкалу): рыбу у дна теперь надо держать зоной.
 * Меч-рыба подобрана на более спокойной сетке (GRID от −1,8): на обычной её бой тянулся 25 с. Махи-махи море ломало
 * сильнее соседей (успех 38 % против 63 %) — она подобрана уже в море, к успеху соседей (SEA=0.63).
 * 04.10: зона у дна пружинит, как у верха, а «леска провисла» — только когда зона лежит на дне. Сопротивление
 * (4-я цифра) пересчитано у каждого вида так, чтобы успех «обычного» остался прежним (±1 п. п.). Ремень-рыбе — середина
 * между «обычным» и «опытным»: под прежние 33 % «обычного» «опытный» падал с 90 до 42 %, теперь 44 и 77 %. Донным
 * барабульке, губану и треске — мягче: успех тот же (~100 %), а бой не вдвое длиннее прежнего (6–7 с).
 */
const CAL: Record<string, readonly [number, number, number, number, number]> = {
  hamsa: [14, 49, 27.2, 14.73, 170],
  goby: [9.1, 31.85, 19.58, 23.08, 218],
  scad: [11.2, 39.2, 22.85, 29.7, 197],
  redmullet: [14, 49, 27.2, 10.47, 170],
  wrasse: [7, 24.5, 16.32, 5.9, 238],
  karas: [12.95, 45.33, 25.57, 19.08, 180],
  blenny: [7, 24.5, 16.32, 27.6, 238],
  sardine: [24, 84, 36.8, 28.8, 170],
  whiting: [21.5, 75.25, 34.4, 24.64, 170],
  picarel: [21.5, 75.25, 34.4, 29.85, 170],
  sprat: [7, 24.5, 16.32, 19.6, 238],
  flyingfish: [7, 24.5, 16.32, 49, 238],
  haddock: [24, 84, 36.8, 20.47, 170],
  hake: [12.95, 45.33, 25.57, 21.86, 180],
  mullet: [9, 33.3, 21.42, 27.45, 210],
  mackerel: [21, 77.7, 38.85, 29.55, 150],
  garfish: [9, 33.3, 21.42, 28.05, 210],
  scorpion: [11.7, 43.29, 25.7, 34.65, 192],
  flounder: [11.7, 43.29, 25.7, 35.7, 192],
  gurnard: [24, 88.8, 42, 28.35, 150],
  eel: [21, 77.7, 38.85, 25.95, 150],
  meagre: [30, 111, 48.3, 25.95, 150],
  shad: [14.4, 53.28, 29.99, 26.4, 174],
  redfish: [14.4, 53.28, 29.99, 26.63, 174],
  bonito: [11.7, 43.29, 25.7, 32, 192],
  cod: [16.65, 61.61, 33.56, 7.65, 159],
  barracuda: [14.4, 53.28, 29.99, 28.25, 174],
  hairtail: [21, 77.7, 38.85, 26, 150],
  bluefish: [14.3, 55.77, 31.82, 31.2, 173],
  dogfish: [14.3, 55.77, 31.82, 27.9, 173],
  ray: [20.35, 79.37, 41.55, 18.9, 143],
  turbot: [11, 42.9, 26.52, 47.4, 189],
  seabass: [14.3, 55.77, 31.82, 23.25, 173],
  leerfish: [14.3, 55.77, 31.82, 33, 173],
  wolffish: [14.3, 55.77, 31.82, 34, 173],
  mahi: [8.8, 34.32, 22.98, 26.5, 200],
  amberjack: [17.6, 68.64, 37.13, 27, 157],
  wahoo: [11, 42.9, 26.52, 26, 189],
  blueshark: [22, 85.8, 44.2, 30.12, 135],
  sturgeon: [42, 176.4, 71.3, 52.95, 125],
  tuna: [13, 54.6, 31.62, 36, 175],
  swordfish: [7.8, 32.76, 23.19, 34.65, 195],
  angler: [16.9, 70.98, 37.94, 28.5, 160],
  bluemarlin: [13, 54.6, 31.62, 49.95, 175],
  sunfish: [34, 142.8, 62, 37.5, 125],
  halibut: [13, 54.6, 31.62, 31.63, 175],
  mako: [13, 54.6, 31.62, 27.25, 175],
  hammerhead: [34, 142.8, 62, 26.13, 125],
  whiteshark: [15, 66, 35.7, 18, 161],
  greenlandshark: [27.75, 122.1, 55.93, 46.2, 122],
  oarfish: [27.75, 122.1, 55.93, 56, 122],
  // божественная (04.10): труднее всех и везде одинаково (море его не злит). «Обычный» / «опытный»: ур. 0 — 5 / 7 %,
  // ур. 3 с удочкой — 22 / 28 %, ур. 5 — 45 / 44 %, ур. 10 с легендарной удочкой и платиновой блесной — 66 / 91 %
  // (мифики там же: 9–19 / 98 %, 35–47 / 77–100 %, 62–80 / 96–100 %, 77–100 / 100 %)
  kalmar: [31.6, 190, 64.7, 7.5, 135.6],
  // остров (10.10, tools/fish/isle-reel.ts → 2026-10-10-fishing-island-reel.json): по новым правилам (reelStyle2), сопротивление — до
  // места острова; мифики и божественная — под цель со способностью. «Обычный» 10-го уровня (удочка 4, платина): обычные 97–99,
  // редкие 89–91, эпические 81–83, легенды 70–71, мифики 55–57, божественная 50 %. Гигантская — ход ×0,75 уже внутри
  capelin: [9.1, 31.85, 19.58, 30.83, 218],
  smelt: [7, 24.5, 16.32, 26.75, 238],
  navaga: [14, 49, 27.2, 31.85, 170],
  lanternfish: [12.95, 45.33, 25.57, 18.9, 180],
  lumpfish: [11.7, 43.29, 25.7, 38.25, 192],
  saithe: [14.4, 53.28, 29.99, 38.1, 174],
  grenadier: [21, 77.7, 38.85, 25.59, 150],
  lamprey: [11.7, 43.29, 25.7, 34.32, 192],
  salmon: [11, 42.9, 26.52, 22.54, 189],
  ling: [36, 140.4, 59.8, 36.5, 135],
  chimaera: [36, 140.4, 59.8, 33.88, 135],
  roughy: [20.35, 79.37, 41.55, 19.92, 143],
  opah: [42, 176.4, 71.3, 26.32, 125],
  albacore: [13, 54.6, 31.62, 24.72, 175],
  coelacanth: [16.9, 70.98, 37.94, 28.21, 160],
  goblinshark: [20.8, 87.36, 44.27, 23.55, 145],
  beluga: [24, 105.6, 49.98, 27.19, 133],
  thresher: [15, 66, 35.7, 14.97, 161],
  baskingshark: [36, 158.4, 60.38, 7.26, 115],
  frilledshark: [20.8, 124.8, 46.51, 15.26, 141],
};

/** Манера вида на шкале: паттерны и место вида, цифры из CAL, зона и резкость — по категории. */
function styleOf(id: string, r: Raw): ReelStyle {
  const rank = tierRank(r.tier);
  if (rank < 0) return { ...DEAD[id] };
  const b = BAND[rank];
  const [spd, dartSpd, amp, drain, per] = CAL[id] ?? [b.spd, b.dart, b.amp, b.drain, b.per];
  return {
    mainPattern: r.pat[0],
    secondaryPattern: r.pat[1],
    patternPeriod: per,
    patternAmplitude: amp,
    ...(rank >= T_LEGEND ? { lastStand: r.tier === T_DIVINE ? LAST_STAND_DIVINE : LAST_STAND } : {}),
    spd,
    sharp: b.sharp,
    turn: 10,
    dart: 8,
    dartSpd,
    dartUp: r.up ?? 50,
    hover: 300,
    hoverP: 30,
    lo: r.lo ?? 0,
    hi: r.hi ?? 100,
    roam: 30,
    zone: b.zone * ZONE_BASE,
    drain,
    // остров — новый контент: «АФК у дна» у легенд и выше закрыт сразу (рыба чует ловушку)
    ...(r.zone === 'isle' && rank >= T_LEGEND ? { wary: ISLE_WARY_TUNE[id] ?? ISLE_WARY, waryHold: ISLE_WARY_HOLD } : {}),
  };
}

/** Правило по номеру в FISH; null — вида нет в рыбалке 2.0 (золотая рыбка — только старая находка в альбоме) */
export const RULE: ReadonlyArray<FishRule | null> = FISH.map((f, sp) => {
  const r = RAW[f.id];
  if (!r) return null;
  const zone = r.zone ?? 'pier';
  return {
    sp, id: f.id, tier: r.tier, zone, zones: r.also && r.also !== zone ? [zone, r.also] : [zone], bite: r.bite, rain: r.rain, val: r.val, note: r.note,
    style: styleOf(f.id, r), xpDifficulty: XP_DIFFICULTY[f.id] ?? 0, ...(r.xpBase ? { xpBase: r.xpBase } : {}),
  };
});

function spOf(id: string): number {
  const i = FISH.findIndex((f) => f.id === id);
  if (i < 0 || !RULE[i]) throw new Error(`fishrules: нет вида ${id}`);
  return i;
}

const ORDER = Object.keys(RAW);
/** Рыбы по порядку журнала: по категориям (божественная — последней), внутри — как в таблице */
function journal(pick: (r: FishRule) => boolean): number[] {
  return RULE.filter((r): r is FishRule => r !== null && isFishTier(r.tier) && pick(r))
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
    .map((r) => r.sp);
}
/**
 * Все виды коллекции (пристань и баркас) — по порядку журнала: по категориям (божественная — последней), внутри — пристань,
 * потом баркас, как в таблице. Виды острова сюда не входят: у них свой счётчик (ISLE_COLLECTION).
 */
export const COLLECTION: readonly number[] = journal((r) => r.zone !== 'isle');
/** Сколько видов в коллекции (52): число не зашито — растёт с таблицей (без видов острова) */
export const COLLECTION_SIZE = COLLECTION.length;
/** Виды острова «Последний свет» по порядку журнала — свой счётчик «Остров: N из 20» (shared/islestyle.ts isleCaught, тот же список — ISLE_SPECIES) */
export const ISLE_COLLECTION: readonly number[] = journal((r) => r.zone === 'isle');
/** Сколько видов у острова (20) */
export const ISLE_SIZE = ISLE_COLLECTION.length;
/** Все рыбы, что где-то клюют: коллекция и виды острова */
const ALL_FISH: readonly number[] = [...COLLECTION, ...ISLE_COLLECTION];
/** Хлам и сундук */
export const SP_BOOT = spOf('boot');
export const SP_BOTTLE = spOf('bottle');
export const SP_CHEST = spOf('chest');
/** Старые находки: в альбоме остаются, в рыбалке 2.0 не клюют (золотая рыбка — не морская) */
export const LEGACY_IDS: readonly string[] = FISH.filter((_, sp) => !RULE[sp]).map((f) => f.id);

export function ruleOf(sp: number): FishRule | null {
  return RULE[sp] ?? null;
}

/** Виды места: пристань, баркас (гренландская акула и кальмар — в обоих) или остров */
export function zoneSpecies(zone: FishZone): number[] {
  return ALL_FISH.filter((sp) => RULE[sp]!.zones.includes(zone));
}

function factor(value: number | undefined, max: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(1, value)) : 1;
}

/** Зона от уровня и удочки — не больше этого: 15-й уровень (×1,375, +2,5 % за уровень) × легендарная удочка (×1,4). До 04.10 потолок был на 10-м уровне. */
export const ZONE_SCALE_MAX = (1 + 0.025 * 15) * (1 + 0.4);

/**
 * Манера на шкале с бонусами заброса: зона — от уровня и удочки (водка — на 20 % меньше); рывки и резкость — мягче от блесны
 * (calm), злее в море (sea); сопротивление — злее в море (seaDrain). Божественную море
 * не злит: царь морей везде одинаков. Таблицу вида и снимок заброса не меняет.
 */
export function reelStyleFor(sp: number, mods?: Readonly<FishCastMods>): ReelStyle {
  const r = ruleOf(sp);
  if (!r) throw new RangeError(`fishrules: unknown reel species ${sp}`);
  const fish = isFishTier(r.tier);
  const calm = mods?.calm !== undefined && Number.isFinite(mods.calm) ? Math.min(LURE_MAX.calm, Math.max(0, mods.calm)) : 0;
  // царь морей везде одинаково зол: море не злит его сильнее (иначе с баркаса его почти не вытащить)
  const wild = fish && r.tier !== T_DIVINE;
  const isle = mods?.zone === 'isle';
  const sea = wild ? factor(mods?.sea, isle ? ISLE_FIGHT : SEA_FIGHT) : 1;
  const seaDrain = wild ? factor(mods?.seaDrain, isle ? ISLE_DRAIN : SEA_DRAIN) : 1;
  const place = wild && isle ? ISLE_ZONE : 1;
  // Только у рыбы: водка уменьшает зону; прежние снимки модификаторов поддерживают ускорение рывков до ×1,2.
  const cut = fish && mods?.zoneMul !== undefined && Number.isFinite(mods.zoneMul) ? Math.min(1, Math.max(0.5, mods.zoneMul)) : 1;
  const fast = fish ? factor(mods?.jerkMul, 1.2) : 1;
  const jerk = (1 - calm) * sea;
  return {
    ...r.style,
    zone: r.style.zone * factor(mods?.zoneScale, ZONE_SCALE_MAX) * cut * place,
    dartSpd: r.style.dartSpd * jerk * fast,
    sharp: r.style.sharp * jerk,
    drain: r.style.drain * seaDrain,
  };
}

/** Рыба (не хлам и не сундук): одна из 52 видов коллекции или из 20 видов острова */
export function isCollected(sp: number): boolean {
  const r = RULE[sp];
  return !!r && isFishTier(r.tier);
}

// ------------------------------------------------------------ улов

export interface Hooked {
  sp: number;
  g: number;
  /** Сундук: сколько жетонов в нём (0 — не сундук) */
  coins: number;
}

/** Сколько в сундуке: полоса по весу, внутри — поровну. */
export function rollChest(rand: () => number): number {
  const total = CHEST_BANDS.reduce((s, b) => s + b[2], 0);
  let r = rand() * total;
  for (const [lo, hi, w] of CHEST_BANDS) {
    r -= w;
    if (r < 0) return lo + Math.min(hi - lo, Math.floor(rand() * (hi - lo + 1)));
  }
  return CHEST_BANDS[0][0];
}

/** Вес улова: ближе к лёгкому (крупные редки); от килограмма — с точностью до 10 г. */
export function rollWeight(sp: number, rand: () => number): number {
  const f = FISH[sp];
  const u = rand();
  const raw = f.g[0] + (f.g[1] - f.g[0]) * u * u;
  const g = raw >= 1000 ? Math.round(raw / 10) * 10 : Math.round(raw);
  return Math.min(f.g[1], Math.max(f.g[0], g));
}

/** Погода для шансов: 0 — ясно, 1 — дождь, 2 — сезон рыбалки (особый дождь: виды дождя клюют, как в дождь) */
export type FishWeather = 0 | 1 | 2;

/** Погода по флагам: сезон — сам по себе дождь */
export function fishWeather(rain: boolean, season = false): FishWeather {
  return season ? 2 : rain ? 1 : 0;
}

/** Пул места и погоды: виды, их ранги и веса, сумма весов по рангам (0 — обычные … 5 — божественная) */
interface Pool {
  sps: number[];
  rank: number[];
  w: number[];
  rankW: number[];
}

function makePool(zone: FishZone, rain: boolean): Pool {
  const sps: number[] = [];
  const rank: number[] = [];
  const w: number[] = [];
  const rankW = [0, 0, 0, 0, 0, 0];
  for (const sp of ALL_FISH) {
    const r = RULE[sp]!;
    if (!r.zones.includes(zone) || (r.rain && !rain)) continue;
    const k = tierRank(r.tier);
    sps.push(sp);
    rank.push(k);
    w.push(r.bite);
    rankW[k] += r.bite;
  }
  return { sps, rank, w, rankW };
}

const POOLS: Record<FishZone, readonly [Pool, Pool]> = {
  pier: [makePool('pier', false), makePool('pier', true)],
  barkas: [makePool('barkas', false), makePool('barkas', true)],
  // остров: «дождь» — туман («Туман наступает») и сезон острова
  isle: [makePool('isle', false), makePool('isle', true)],
};

/**
 * База категорий места (ясно, без бонусов), доли поклёвок рыбы по рангам 0…5: обычные … мифические — по весам видов
 * ясной погоды, мифическим ещё MYTH_ADD, божественная — DIVINE_BASE (обе прибавки — из обычных: им остаток).
 * MYTH_ADD и DIVINE_BASE — доли всех поклёвок новичка, а здесь доли рыбы: делим на долю рыбы у новичка (92,5 %).
 */
function makeBase(zone: FishZone): readonly number[] {
  const p = POOLS[zone][0];
  const total = p.rankW.slice(0, 5).reduce((a, b) => a + b, 0);
  const out = p.rankW.map((w) => (total > 0 ? w / total : 0));
  const novice = 1 - (CHEST_PER_10K + junkPer10k(0)) / 10_000;
  out[4] += MYTH_ADD / novice;
  out[5] = DIVINE_BASE[zone] / novice;
  out[0] = 1 - out.slice(1).reduce((a, b) => a + b, 0);
  return out;
}

const BASE: Record<FishZone, readonly number[]> = { pier: makeBase('pier'), barkas: makeBase('barkas'), isle: makeBase('isle') };
/** База категорий места — для страницы /fishing (tools/fishing-guide): доли рыбы по рангам 0…5 в ясную погоду без бонусов */
export const TIER_BASE: Readonly<Record<FishZone, readonly number[]>> = BASE;

function placeOf(mods?: Readonly<FishCastMods>): FishZone {
  return mods?.zone === 'barkas' ? 'barkas' : mods?.zone === 'isle' ? 'isle' : 'pier';
}

function poolOf(rain: boolean, mods?: Readonly<FishCastMods>): Pool {
  return POOLS[placeOf(mods)][rain ? 1 : 0];
}

/** Множитель шанса всех от редкой до божественной: уровень × удочка × напиток (снимок заброса) */
function rareMul(mods?: Readonly<FishCastMods>): number {
  return mods?.rareMultiplier !== undefined && Number.isFinite(mods.rareMultiplier) ? Math.min(4, Math.max(1, mods.rareMultiplier)) : 1;
}

/**
 * Ещё множитель эпической и выше (с божественной): блесна. На редких не действует нарочно: иначе у прокачанного
 * рыбака (14–15-й уровень с платиновой) в любой дождь не остаётся обычных и пикарель (обычная дождевая) не клюёт вовсе.
 */
function epicMul(mods?: Readonly<FishCastMods>): number {
  return mods?.epicMultiplier !== undefined && Number.isFinite(mods.epicMultiplier) ? Math.min(LURE_MAX.epic, Math.max(1, mods.epicMultiplier)) : 1;
}

/** Ещё множитель эпической и выше (с божественной): водка (×2) — крупная рыба «на риск» */
function topMul(mods?: Readonly<FishCastMods>): number {
  return mods?.topMultiplier !== undefined && Number.isFinite(mods.topMultiplier) ? Math.min(2, Math.max(1, mods.topMultiplier)) : 1;
}

/** Погода по рангу категории: от редкой до божественной — дождь ×1,5, сезон ещё ×2 (всё вместе ×3); обычным — остаток */
export function weatherMul(rank: number, weather: FishWeather): number {
  if (weather === 0 || rank < 1) return 1;
  return weather === 2 ? RAIN_MUL * SEASON_MUL : RAIN_MUL;
}

/** Множитель категории (ранг 1…5) от бонусов: всё, кроме погоды */
export function bonusMul(rank: number, mods?: Readonly<FishCastMods>): number {
  if (rank < 1) return 1;
  let k = rareMul(mods);
  if (rank >= 2) k *= epicMul(mods) * topMul(mods);
  return k;
}

/**
 * Доли поклёвок рыбы по рангам 0…5 (сумма 1): база места × погода × бонусы у редких и выше, обычным — остаток.
 * Потолок — сверху вниз: божественная, мифическая, легендарная… получают свою долю целиком, пока есть место (всего у
 * редких и выше — до 95 %, обычным пол COMMON_FLOOR); нехватку отдают обычные, потом редкие, потом эпические. Шанс «эта
 * категория или выше» = min(95 %, сумма желаемых долей) — от любого бонуса не падает, а ниже потолка каждая категория —
 * ровно база × погода × бонусы.
 */
function rankShares(weather: FishWeather, mods?: Readonly<FishCastMods>): number[] {
  const base = BASE[placeOf(mods)];
  const out = [0, 0, 0, 0, 0, 0];
  let left = 1 - COMMON_FLOOR;
  for (let k = 5; k >= 1; k--) {
    out[k] = Math.min(left, base[k] * weatherMul(k, weather) * bonusMul(k, mods));
    left -= out[k];
  }
  out[0] = left + COMMON_FLOOR;
  return out;
}

/** Доля каждого вида пула среди поклёвок рыбы: доля категории делится по весам видов внутри неё */
function speciesShares(p: Pool, weather: FishWeather, mods?: Readonly<FishCastMods>): number[] {
  const shares = rankShares(weather, mods);
  return p.w.map((w, i) => (p.rankW[p.rank[i]] > 0 ? shares[p.rank[i]] * w / p.rankW[p.rank[i]] : 0));
}

/** Кто клюёт: сундук (3 %), хлам (меньше с уровнем), иначе рыба своего места по категориям — в дождь и сезон вместе с дождевыми. */
export function rollCatch2(rain: boolean, rand: () => number, mods?: Readonly<FishCastMods>, season = false): Hooked {
  const roll = rand();
  const r = roll * 10_000;
  if (r < CHEST_PER_10K) {
    const g = rollWeight(SP_CHEST, rand);
    const coins = rollChest(rand);
    // Клад — нижние 1…3 % полосы сундука по уровню заброса. Поток случайных чисел тот же, что у обычного сундука.
    return { sp: SP_CHEST, g, coins: roll < (CHEST_PER_10K / 10_000) * poseidonShare(mods?.level) ? POSEIDON_COINS : coins };
  }
  if (r < CHEST_PER_10K + junkPer10k(mods?.level)) {
    const sp = rand() < 0.7 ? SP_BOOT : SP_BOTTLE;
    return { sp, g: rollWeight(sp, rand), coins: 0 };
  }
  const weather = fishWeather(rain, season);
  const pool = poolOf(weather > 0, mods);
  const w = speciesShares(pool, weather, mods);
  let x = rand();
  let sp = pool.sps[pool.sps.length - 1];
  for (let i = 0; i < pool.sps.length; i++) {
    x -= w[i];
    if (x < 0) {
      sp = pool.sps[i];
      break;
    }
  }
  return { sp, g: rollWeight(sp, rand), coins: 0 };
}

/** Насколько на деле выросли шансы редких (с потолком — когда обычным остался пол) против той же погоды без бонусов. Для проверок. */
export function effectiveRareMultiplier(rain: boolean, mods?: Readonly<FishCastMods>, season = false): number {
  const weather = fishWeather(rain, season);
  const plain = rankShares(weather, mods ? { ...mods, rareMultiplier: 1, epicMultiplier: 1, topMultiplier: 1 } : undefined);
  const now = rankShares(weather, mods);
  return plain[1] > 0 ? now[1] / plain[1] : 1;
}

/** Доля поклёвок вида среди рыб своего места (для журнала и проверок); вид другого места — 0 */
export function biteShare(sp: number, rain: boolean, mods?: Readonly<FishCastMods>, season = false): number {
  const weather = fishWeather(rain, season);
  const p = poolOf(weather > 0, mods);
  const i = p.sps.indexOf(sp);
  if (i < 0) return 0;
  return speciesShares(p, weather, mods)[i];
}

/**
 * «Шансы сейчас»: доли всех поклёвок по номерам категорий — обычные … мифические [0…4], хлам [5], сундук [6],
 * божественная [7]; сумма 1. Те же формулы, что у броска сервера (rollCatch2).
 */
export function tierOdds(rain: boolean, mods?: Readonly<FishCastMods>, season = false): number[] {
  const shares = rankShares(fishWeather(rain, season), mods);
  const junk = junkPer10k(mods?.level);
  const fish = 1 - (CHEST_PER_10K + junk) / 10_000;
  return [...shares.slice(0, 5).map((x) => fish * x), junk / 10_000, CHEST_PER_10K / 10_000, fish * shares[5]];
}

/**
 * Из чего сложен шанс категории (для «Шансов сейчас»): база места, погода, бонусы и итог — доли всех поклёвок. Итог
 * меньше base × weather × bonus только у нижней категории под потолком: старшие забрали своё, ей — остаток.
 */
export function tierOddsParts(rank: number, rain: boolean, mods?: Readonly<FishCastMods>, season = false): { base: number; weather: number; bonus: number; now: number } {
  const weather = fishWeather(rain, season);
  const junk = junkPer10k(mods?.level);
  const fish = 1 - (CHEST_PER_10K + junk) / 10_000;
  const base = BASE[placeOf(mods)][rank] ?? 0;
  return { base: fish * base, weather: weatherMul(rank, weather), bonus: bonusMul(rank, mods), now: fish * (rankShares(weather, mods)[rank] ?? 0) };
}

/**
 * Цена без напитка и места: обычные — старая целая цена +75 %, остальные откалиброваны; дождевые ×1,5; потом рыба
 * дешевеет на FISH_PRICE_CUT (с флагом острова — ISLE_PRICE_CUT; cut = 1 — цена без него: от неё считается общий опыт, он не
 * режется). Виды острова — val сразу в жетонах (туманные ×1,5), без поправок и без множителя цены.
 */
export function basePrice(sp: number, g: number, cut = priceCut): number {
  const r = RULE[sp];
  if (!r || !isFishTier(r.tier)) return 0;
  const f = FISH[sp];
  const k = f.g[1] > f.g[0] ? Math.min(1, Math.max(0, (g - f.g[0]) / (f.g[1] - f.g[0]))) : 0;
  const event = r.rain ? RAIN_NUM / RAIN_DEN : 1;
  if (r.zone === 'isle') return Math.max(1, Math.round((r.val[0] + (r.val[1] - r.val[0]) * k) * event));
  const v = (r.val[0] + (r.val[1] - r.val[0]) * k) * COIN_PER_POINT;
  const full = r.tier === T_COMMON
    ? Math.round(Math.round(Math.max(1, Math.round(v)) * 1.75) * event)
    : Math.max(1, Math.round(v * FISH_OTHER_PRICE_SCALE * event));
  return cut === 1 ? full : Math.max(1, Math.round(full * cut));
}

/** Цена улова (в рюкзак — фиксируется при поимке): база × напиток (×1,1 пиво, ×1,15 эль, ×1,2 пиво владыки) × баркас 1,25, одно округление. */
export function fishPrice2(sp: number, g: number, coins = 0, mods?: Readonly<FishCastMods>, cut = priceCut): number {
  const r = RULE[sp];
  if (!r) return 0;
  if (r.tier === T_CHEST) return coins;
  if (r.tier === T_JUNK) return 0;
  const place = mods?.zone === 'barkas' ? BARKAS_INCOME : 1;
  return Math.round(basePrice(sp, g, cut) * factor(mods?.incomeScale, LORD.income) * place);
}

/** Цена вида: за самую лёгкую и самую тяжёлую (для журнала) — у видов баркаса сразу с ×1,25 */
export function priceRange(sp: number): [number, number] {
  const f = FISH[sp];
  const zone = RULE[sp]?.zone;
  const mods = zone === 'barkas' || zone === 'isle' ? ({ zone } as FishCastMods) : undefined;
  return [fishPrice2(sp, f.g[0], 0, mods), fishPrice2(sp, f.g[1], 0, mods)];
}

// ------------------------------------------------------------ коллекция (награды за неё — лестница shared/fishstyle.ts)

/** Сколько видов коллекции уже есть в альбоме */
export function collectionCount(album: Record<string, readonly [number, number]>): number {
  let n = 0;
  for (const sp of COLLECTION) if (album[FISH[sp].id]) n++;
  return n;
}

// ------------------------------------------------------------ доски рекордов

/** Строк в каждом списке доски */
export const FISH_TOP_ROWS = 10;

export interface FishTopRow {
  pid: number;
  nick: string;
  /** Штук или граммов */
  v: number;
}

/**
 * Доска у мостков: «Сегодня» (по Москве) и «За всё время» — по числу рыб и по весу улова (граммы), и «Коллекция» (04.10) —
 * у кого сколько видов из COLLECTION_SIZE закрыто в журнале (v — число видов).
 */
export interface FishTop {
  day: string;
  dn: FishTopRow[];
  dg: FishTopRow[];
  an: FishTopRow[];
  ag: FishTopRow[];
  /** Коллекция: игроки по числу закрытых видов (нет — старый сервер; для клиента это пустой список) */
  cl?: FishTopRow[];
}

export function emptyTop(day = ''): FishTop {
  return { day, dn: [], dg: [], an: [], ag: [], cl: [] };
}

/** Номер календарного дня по Москве (UTC+3) — для счётчиков «сегодня» в профиле */
export function mskDayNum(ms: number): number {
  return Math.floor((ms + 3 * 3600_000) / 86_400_000);
}

/** Вес улова для доски: «850 г», «12,4 кг», «1 234 кг». */
export function fmtKg(g: number): string {
  if (g < 1000) return `${Math.round(g)} г`;
  const kg = g / 1000;
  if (kg < 100) return `${(Math.round(kg * 10) / 10).toFixed(1).replace('.', ',')} кг`;
  return `${Math.round(kg).toLocaleString('ru-RU').replace(/\s/g, ' ')} кг`;
}

/** Вес улова на карточке и в журнале: до 100 кг — как везде («1,24 кг»), дальше — целыми килограммами */
export function fmtCatch(g: number): string {
  return g >= 100_000 ? fmtKg(g) : fmtWeight(g);
}

export { fmtWeight };
