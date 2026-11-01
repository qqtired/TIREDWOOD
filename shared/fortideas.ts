// Пакет «Т-идеи» крепости и элитки (вместе с FORT50, своих флагов нет): контракт между сервером, клиентом и моделями.
// Бриф с решениями владельца — docs/fort50/brief-ideas.md. Числа меняет ведущий; имена и коды — договор групп.

/** Золотой краб (Т-16) — новый вид в орде. В shared/fortkinds.ts — тот же номер (Z_KINDS = 32) и строка ZK */
export { Z_GOLDCRAB, ZS_CRAB_DIVE } from './fortkinds.ts';

// ------------------------------------------------------------ Т-4 ремесло

export const CRAFT_NONE = 0;
export const CRAFT_MASON = 1;
export const CRAFT_GUNNER = 2;
export const CRAFT_SAPPER = 3;
export const CRAFT_RIFLE = 4;

export interface CraftDef {
  id: number;
  name: string;
  /** Ключ шапки в shared/outfit.ts (в гардеробе не продаётся) и значка в client/assets/ui/icons */
  hat: string;
  /** Одна строка для окна вешалки и Tab */
  text: string;
}

export const CRAFTS: readonly CraftDef[] = [
  { id: CRAFT_MASON, name: 'Каменщик', hat: 'craft-mason', text: 'ремонт на 30 % дешевле и на 40 % быстрее' },
  { id: CRAFT_GUNNER, name: 'Канонир', hat: 'craft-gunner', text: 'башни команды +15 % урона, свои башни на 15 % дешевле' },
  { id: CRAFT_SAPPER, name: 'Подрывник', hat: 'craft-sapper', text: '+1 граната, взрыв на 25 % шире' },
  { id: CRAFT_RIFLE, name: 'Стрелок', hat: 'craft-rifle', text: 'крит +10 %, по осаде урон ×2' },
];

/** Вешалка во дворе: E рядом — окно выбора */
// у подножия западной лестницы на террасу, на ровном полу двора (на самой лестнице E не доставал: сервер требует y ≈ 0)
export const RACK = { x: -5, z: -0.5 };
export const RACK_REACH = 2.2;
/** «Полный расчёт»: все четыре ремесла среди игроков в крепости — золото забега всем ×1,1 */
export const FULL_CREW_GOLD = 1.1;

// ------------------------------------------------------------ Т-18 батуты

/** Отмеченные места во дворе (центр батута, земля y = 0) */
export const TRAMP_SPOTS: readonly { x: number; z: number }[] = [
  { x: -12.9, z: -4 },
  { x: 12.9, z: -4 },
  // у северной стены (внутренняя грань z = −13): край батута в ~1 м от неё
  { x: -8, z: -10.9 },
  { x: 8, z: -10.9 },
];
export const TRAMP_REACH = 2.0;
export function trampPrice(wave: number): number {
  return 150 + 5 * Math.max(1, wave);
}
/** Подброс батута крепости: вершина ~4 м над землёй (ход стены 3,4 м). Набережная — TRAMPOLINE_VELOCITY */
export const FORT_TRAMP_VELOCITY = 13.2;

// ------------------------------------------------------------ Т-8 карточки

export interface CardDef {
  id: string;
  name: string;
  text: string;
  gold: boolean;
}

export const CARDS: readonly CardDef[] = [
  { id: 'pierce', name: 'Пробивной болт', text: 'арбалет прошивает на 2 цели больше', gold: false },
  { id: 'stones', name: 'Тяжёлые камни', text: 'камни со стены бьют вдвое сильнее', gold: false },
  { id: 'repair', name: 'Дешёвый ремонт', text: 'весь ремонт на 30 % дешевле', gold: false },
  { id: 'tar', name: 'Смола из гранат', text: 'граната оставляет лужу смолы на 4 с', gold: false },
  { id: 'towers', name: 'Быстрые башни', text: 'башни стреляют на 25 % чаще', gold: false },
  { id: 'bounty', name: 'Жирный общак', text: 'награда за врагов +20 %', gold: false },
  { id: 'mag', name: 'Полный магазин', text: 'магазин оружия +30 %', gold: false },
  { id: 'bandage', name: 'Перевязка', text: 'в начале волны всем +50 % здоровья', gold: false },
  { id: 'crystal', name: 'Крепкий кристалл', text: 'кристалл +20 % прочности', gold: false },
  { id: 'eye', name: 'Меткий глаз', text: 'в голову +30 % урона', gold: false },
  { id: 'goldtowers', name: 'Золотые башни', text: 'урон башен ×1,5', gold: true },
  { id: 'squall', name: 'Шквал', text: 'всё оружие стреляет на 25 % чаще', gold: true },
  { id: 'stonewalls', name: 'Каменные стены', text: 'стены +30 % прочности и чинятся сразу', gold: true },
  { id: 'grenadebox', name: 'Ящик гранат', text: '+2 гранаты к запасу и полный запас', gold: true },
];

export const CARD_VOTE_S = 15;

// ------------------------------------------------------------ Т-16 краб

export const CRAB_HITS = 30;
export const CRAB_JACKPOT = 10;
export const CRAB_DELAY_S = 6;
export const CRAB_RUN_S = 20;
/** Золото всем за одно попадание в краба (mul — множитель золота F50) */
export function crabGold(wave: number, mul: number): number {
  return Math.round((2 + Math.floor(wave / 5)) * mul);
}

// ------------------------------------------------------------ Т-27 замедление

export const SLOW_S = 1.5;
export const SLOW_RATE = 0.3;
export const SLOW_GAP_S = 8;

// ------------------------------------------------------------ элитки

/** Рост по ступени: обычный, элита, чемпион — модель, корона, хитбокс и слабые места */
export const ELITE_SCALE: readonly number[] = [1, 1.25, 1.5];

// ------------------------------------------------------------ действия и сообщения

/** Действия — через существующее { t: 'use', id } */
// 5000–5301 заняты стенами, камнями и лагерем (shared/fort50.ts), 5400 — щит клавишей J (shared/fort.ts)
export const USE_TRAMP = 5600; // + номер места
export const USE_CRAFT = 5700; // + ремесло (CRAFT_NONE — снять шапку)
export const USE_CARD = 5800; // + 0…2 — голос за карточку

/** Сервер → игрок: при входе в крепость и при каждом изменении. Новые поля JSON-ом, без смены формата снимка */
export interface FortIdeasMsg {
  t: 'fideas';
  ideas: boolean;
  elite: boolean;
  /** [номер игрока, ремесло] — у кого есть ремесло */
  crafts: [number, number][];
  /** «Полный расчёт» действует */
  full: boolean;
  /** Купленные батуты: бит на место */
  tramps: number;
  /** Взятые карточки по порядку */
  taken: string[];
  /** Идёт голосование: три карточки, голоса, свой голос (−1 — нет), тик конца */
  vote: { ids: string[]; votes: number[]; mine: number; end: number } | null;
}

export type FortIdeasEvent =
  | ['craft', number, number]
  | ['tramp', number, number]
  | ['card', string]
  | ['weak', number, number]
  | ['slow', number]
  | ['crab', 'run' | 'caught' | 'gone', number]
  | ['crabgold', number, number, number]
  /** Лужа гранаты: id, x, z, радиус, тик конца (смола котла, без урона). */
  | ['gtar', number, number, number, number, number];

// События в потоке fev (как 'zdie', 'crit'):
//   ['craft', pid, craft]           — сменил ремесло
//   ['tramp', spot, pid]            — купил батут
//   ['card', id]                    — команда выбрала карточку
//   ['weak', zid, pid]              — попадание в слабое место (Т-23)
//   ['slow', endTick]               — замедление до тика (Т-27)
//   ['crab', 'run' | 'caught' | 'gone', zid]
//   ['crabgold', zid, gold, hits]   — попадание в краба: всем +gold, всего попаданий hits
