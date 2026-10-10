// Ферма: прогресс игрока (profile.farm) и чистые правила. Ничего не тикает — всё считается лениво от серверного
// времени (design-v11 §18.3): рост по plantedAt/ripeAt, вода в колодце, свин, дневные счётчики. Числа — shared/farmdata.ts.
// Функции меняют переданный FarmProgress и возвращают итог или причину отказа; жетоны, общий опыт и вещи профиля
// выдаёт сервер (server/farm/). Случайность — только через переданный rng (сервер даёт свой ГСЧ, тесты — свой).
import { mskDay } from './economy.ts';
import {
  AFTER_CAP, BAG_PLACES, BEES_BONUS, BUFFS, CAN_CHARGES, COMPOST_GROW, CROPS, DAILY_CAP, FARM_BEDS, FARM_COUNTERS,
  FARM_MAX_LEVEL, FARM_STAR_XP, FARM_XP_TOTAL, GENERAL_XP, GENERAL_XP_DAY_CAP, LONG_HARVEST_MIN, MORNING_HOURS,
  NIGHT_HARVEST_MIN, PIG_EVERY_MS, PIG_STORE, RAKE_BEDS, REP_LEVELS, RESOURCES, SHOVEL_DOUBLE, TRUFFLE, TRUFFLE_PRICE,
  TUTORIAL_COINS, TUTORIAL_STEPS, TUTORIAL_XP, WATER_CUT, WELL_REFILL_MS, WELL_SETS, cropById, cropGroup, resourceById,
  upgradeById, type CropDef, type FarmBuffKind, type ResourceId, type UpgradeDef,
} from './farmdata.ts';

// ------------------------------------------------------------ данные в профиле (§18.2)

export interface FarmBed {
  /** id культуры или null — грядка пустая */
  crop: string | null;
  plantedAt: number;
  ripeAt: number;
  /** Хозяин уже поливал в этом цикле */
  watered: boolean;
  /** pid соседей, помогших в этом цикле (не больше HELPS_PER_BED) */
  helpers: number[];
}

/** Заказ доски (§10.3): шаблон ORDER_TEMPLATES, сколько нужно и сделано; crop — если заказ на конкретную культуру */
export interface FarmOrder {
  t: string;
  need: number;
  got: number;
  crop?: string;
  /** Награда забрана */
  done: boolean;
}

export interface FarmLook {
  title?: string;
  frame?: string;
  can?: string;
  shovel?: string;
  fence?: string;
  decor?: string;
}

export interface FarmProgress {
  v: 1;
  xp: number;
  /** Открытые грядки по порядку (1–8): длина массива = сколько открыто */
  beds: FarmBed[];
  tools: { rake: number; can: number; shovel: number; bag: number };
  /** Заряды лейки ×100: дробная часть от мини-игры копится */
  water: number;
  /** Основной урожай по id культуры и TRUFFLE */
  bag: Record<string, number>;
  /** Вторичные ресурсы по ResourceId, без лимита */
  cellar: Record<string, number>;
  built: { compost: boolean; bees: boolean; pig: { since: number; stored: number } | null };
  rep: number;
  repHelpDay: string;
  repHelpToday: number;
  /** Очки помощи; coinsBy — по pid соседа время выплат жетонов за помощь (для лимита в час) */
  help: { points: number; resetAt: number; coinsBy: Record<string, number[]> };
  orders: { day: string; list: FarmOrder[]; rerolls: number };
  /** Фургон: номер цикла и сданные в нём слоты (ассортимент — из зерна, не хранится) */
  van: { cycle: number; done: number[] };
  /** Наборы воды колодца 0–4 и с какого момента копится следующий */
  well: { sets: number; since: number };
  buffs: { kind: FarmBuffKind; until: number }[];
  counters: Record<string, number>;
  achievements: string[];
  /** Культуры, первая посадка которых уже была (первая — бесплатно) */
  firstPlanted: string[];
  /** Шаг обучения Семечкина: 0–5 — текущий, 6 — пройдено, −1 — закрыто крестиком */
  tutorial: number;
  look: FarmLook;
  /** Убранство (эмоции, титулы, рамки, скины инструментов, вещи участка): id из FARM_DECOR */
  decor: string[];
  generalXpDay: string;
  generalXpToday: number;
  /** МСК-день последнего входа и сколько дней подряд */
  lastDay: string;
  streak: number;
  /** Дневной потолок: выплачено Грибом и Фургоном за МСК-сутки и дробный остаток жетонов */
  sold: { day: string; coins: number; frac: number };
}

export function emptyBed(): FarmBed {
  return { crop: null, plantedAt: 0, ripeAt: 0, watered: false, helpers: [] };
}

/** Новый фермер: 1 грядка, инструменты 1, лейка пустая (шаг 2 обучения — колодец), 4 набора воды */
export function emptyFarm(now: number): FarmProgress {
  return {
    v: 1, xp: 0, beds: [emptyBed()], tools: { rake: 1, can: 1, shovel: 1, bag: 1 }, water: 0, bag: {}, cellar: {},
    built: { compost: false, bees: false, pig: null }, rep: 0, repHelpDay: '', repHelpToday: 0,
    help: { points: 0, resetAt: 0, coinsBy: {} }, orders: { day: '', list: [], rerolls: 0 }, van: { cycle: -1, done: [] },
    well: { sets: WELL_SETS, since: now }, buffs: [], counters: {}, achievements: [], firstPlanted: [], tutorial: 0,
    look: {}, decor: [], generalXpDay: '', generalXpToday: 0, lastDay: '', streak: 0, sold: { day: '', coins: 0, frac: 0 },
  };
}

// ------------------------------------------------------------ нормализация старых и битых сохранений

function num(v: unknown, min: number, max: number, def: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}
function int(v: unknown, min: number, max: number, def: number): number {
  return Math.floor(num(v, min, max, def));
}
function str(v: unknown, max = 40): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function strList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40))].slice(0, max);
}
function counts(v: unknown, allowed: (k: string) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(obj(v))) {
    const c = int(n, 0, 1e9, 0);
    if (c > 0 && allowed(k)) out[k] = c;
  }
  return out;
}

const BIG = 1e15;

function normalizeBed(raw: unknown): FarmBed {
  const r = obj(raw);
  const crop = cropById(r.crop);
  if (!crop) return emptyBed();
  const plantedAt = num(r.plantedAt, 0, BIG, 0);
  const grow = crop.min * 60_000;
  // Время роста не может стать больше исходного: ripeAt в [plantedAt, plantedAt + рост]
  const ripeAt = num(r.ripeAt, plantedAt, plantedAt + grow, plantedAt + grow);
  const helpers = Array.isArray(r.helpers)
    ? [...new Set(r.helpers.filter((x): x is number => Number.isSafeInteger(x) && x > 0))].slice(0, 3)
    : [];
  return { crop: crop.id, plantedAt, ripeAt, watered: r.watered === true, helpers };
}

/** Профиль из сохранения → корректный FarmProgress. Неизвестные культуры — грядка пустеет; ничего не выдумывает. */
export function normalizeFarm(raw: unknown, now = Date.now()): FarmProgress {
  const r = obj(raw);
  const f = emptyFarm(now);
  f.xp = int(r.xp, 0, 1e12, 0);
  const beds = Array.isArray(r.beds) ? r.beds.slice(0, FARM_BEDS).map(normalizeBed) : [];
  f.beds = beds.length > 0 ? beds : [emptyBed()];
  const t = obj(r.tools);
  f.tools = {
    rake: int(t.rake, 1, RAKE_BEDS.length, 1), can: int(t.can, 1, CAN_CHARGES.length, 1),
    shovel: int(t.shovel, 1, SHOVEL_DOUBLE.length, 1), bag: int(t.bag, 1, BAG_PLACES.length, 1),
  };
  f.water = int(r.water, 0, canMax(f), 0);
  f.bag = counts(r.bag, (k) => k === TRUFFLE || !!cropById(k));
  f.cellar = counts(r.cellar, (k) => !!resourceById(k));
  const b = obj(r.built);
  const pig = obj(b.pig);
  f.built = {
    compost: b.compost === true, bees: b.bees === true,
    pig: b.pig ? { since: num(pig.since, 0, BIG, now), stored: int(pig.stored, 0, PIG_STORE, 0) } : null,
  };
  f.rep = int(r.rep, 0, 1e9, 0);
  f.repHelpDay = str(r.repHelpDay, 10);
  f.repHelpToday = int(r.repHelpToday, 0, 1e6, 0);
  const h = obj(r.help);
  const coinsBy: Record<string, number[]> = {};
  for (const [k, list] of Object.entries(obj(h.coinsBy)).slice(0, 200)) {
    if (!/^\d{1,9}$/.test(k) || !Array.isArray(list)) continue;
    const ts = list.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0).slice(-10);
    if (ts.length) coinsBy[k] = ts;
  }
  f.help = { points: int(h.points, 0, 1000, 0), resetAt: num(h.resetAt, 0, BIG, 0), coinsBy };
  const o = obj(r.orders);
  f.orders = {
    day: str(o.day, 10), rerolls: int(o.rerolls, 0, 10, 0),
    list: (Array.isArray(o.list) ? o.list : []).slice(0, 6).flatMap((x) => {
      const q = obj(x);
      const tt = str(q.t);
      if (!tt) return [];
      const order: FarmOrder = { t: tt, need: int(q.need, 1, 1e6, 1), got: int(q.got, 0, 1e6, 0), done: q.done === true };
      if (cropById(q.crop)) order.crop = q.crop as string;
      return [order];
    }),
  };
  const v = obj(r.van);
  f.van = { cycle: int(v.cycle, -1, 1e9, -1), done: [...new Set((Array.isArray(v.done) ? v.done : []).filter((x): x is number => Number.isInteger(x) && x >= 0 && x < 6))] };
  const w = obj(r.well);
  f.well = { sets: int(w.sets, 0, WELL_SETS, WELL_SETS), since: num(w.since, 0, BIG, now) };
  f.buffs = (Array.isArray(r.buffs) ? r.buffs : []).slice(0, 6).flatMap((x) => {
    const q = obj(x);
    return q.kind === 'xp' || q.kind === 'price' || q.kind === 'grow' ? [{ kind: q.kind, until: num(q.until, 0, BIG, 0) }] : [];
  });
  f.counters = counts(r.counters, (k) => k.length <= 40);
  f.achievements = strList(r.achievements, 100);
  f.firstPlanted = strList(r.firstPlanted, CROPS.length).filter((id) => !!cropById(id));
  f.tutorial = int(r.tutorial, -1, TUTORIAL_STEPS, 0);
  const l = obj(r.look);
  f.look = {};
  for (const k of ['title', 'frame', 'can', 'shovel', 'fence', 'decor'] as const) if (typeof l[k] === 'string') f.look[k] = str(l[k]);
  f.decor = strList(r.decor, 100);
  f.generalXpDay = str(r.generalXpDay, 10);
  f.generalXpToday = int(r.generalXpToday, 0, GENERAL_XP_DAY_CAP, 0);
  f.lastDay = str(r.lastDay, 10);
  f.streak = int(r.streak, 0, 1e6, 0);
  const s = obj(r.sold);
  f.sold = { day: str(s.day, 10), coins: num(s.coins, 0, 1e9, 0), frac: num(s.frac, 0, 0.999999, 0) };
  return f;
}

// ------------------------------------------------------------ уровень (§3)

export interface FarmLevelInfo {
  level: number;
  /** Опыт внутри уровня и сколько нужно до следующего (на 13 — до следующей звезды) */
  into: number;
  need: number;
  /** «Звёзды фермы» после 13 */
  stars: number;
}

export function farmLevel(xp: number): number {
  let lv = 1;
  while (lv < FARM_MAX_LEVEL && xp >= FARM_XP_TOTAL[lv]) lv++;
  return lv;
}

export function farmLevelInfo(xp: number): FarmLevelInfo {
  const level = farmLevel(xp);
  if (level >= FARM_MAX_LEVEL) {
    const over = xp - FARM_XP_TOTAL[FARM_MAX_LEVEL - 1];
    return { level, into: over % FARM_STAR_XP, need: FARM_STAR_XP, stars: Math.floor(over / FARM_STAR_XP) };
  }
  return { level, into: xp - FARM_XP_TOTAL[level - 1], need: FARM_XP_TOTAL[level] - FARM_XP_TOTAL[level - 1], stars: 0 };
}

/** Добавить опыт фермы; вернёт уровни, на которые поднялся (для наград и экрана уровня) */
export function addFarmXp(f: FarmProgress, n: number): number[] {
  if (!(n > 0)) return [];
  const from = farmLevel(f.xp);
  f.xp = Math.min(1e12, f.xp + Math.round(n));
  const to = farmLevel(f.xp);
  const out: number[] = [];
  for (let lv = from + 1; lv <= to; lv++) out.push(lv);
  return out;
}

export function repLevel(rep: number): number {
  let lv = 1;
  for (const r of REP_LEVELS) if (rep >= r.need) lv = r.level;
  return lv;
}

export function repBonus(rep: number): number {
  return REP_LEVELS[repLevel(rep) - 1].bonus;
}

// ------------------------------------------------------------ сутки по Москве

/** Новый МСК-день: обнуляет дневные счётчики (потолок продаж, общий XP, репутацию за помощь). Зовётся при любом действии. */
export function rollDay(f: FarmProgress, now: number): void {
  const day = mskDay(now);
  if (f.sold.day !== day) f.sold = { day, coins: 0, frac: f.sold.frac };
  if (f.generalXpDay !== day) { f.generalXpDay = day; f.generalXpToday = 0; }
  if (f.repHelpDay !== day) { f.repHelpDay = day; f.repHelpToday = 0; }
}

/** Вход на ферму: серия дней (заказ «Все свои»); вернёт true, если это первый вход за сутки (+1 репутации, §8.2) */
export function enterDay(f: FarmProgress, now: number): boolean {
  const day = mskDay(now);
  if (f.lastDay === day) return false;
  const yesterday = mskDay(now - 86_400_000);
  f.streak = f.lastDay === yesterday ? f.streak + 1 : 1;
  f.lastDay = day;
  return true;
}

// ------------------------------------------------------------ баффы, вода, свин

export function hasBuff(f: FarmProgress, kind: FarmBuffKind, now: number): boolean {
  return f.buffs.some((b) => b.kind === kind && b.until > now);
}

export function canMax(f: FarmProgress): number {
  return CAN_CHARGES[f.tools.can - 1] * 100;
}

export function bagCap(f: FarmProgress): number {
  return BAG_PLACES[f.tools.bag - 1];
}

export function bagUsed(f: FarmProgress): number {
  let n = 0;
  for (const c of Object.values(f.bag)) n += c;
  return n;
}

/** Наборы воды колодца лениво: +1 за 15 мин до 4; на полных часы стоят (§18.3) */
export function wellTick(f: FarmProgress, now: number): void {
  const w = f.well;
  if (w.sets >= WELL_SETS) { w.sets = WELL_SETS; w.since = now; return; }
  if (now < w.since) { w.since = now; return; }
  const n = Math.floor((now - w.since) / WELL_REFILL_MS);
  if (n <= 0) return;
  w.sets = Math.min(WELL_SETS, w.sets + n);
  w.since = w.sets >= WELL_SETS ? now : w.since + n * WELL_REFILL_MS;
}

/** Когда будет следующий набор (0 — колодец полон) */
export function wellNextAt(f: FarmProgress): number {
  return f.well.sets >= WELL_SETS ? 0 : f.well.since + WELL_REFILL_MS;
}

/** Взять набор воды на попытку мини-игры; false — наборов нет */
export function wellTake(f: FarmProgress, now: number): boolean {
  wellTick(f, now);
  if (f.well.sets <= 0) return false;
  if (f.well.sets >= WELL_SETS) f.well.since = now;
  f.well.sets--;
  return true;
}

/** Итог мини-игры: доля 0–1 от полной лейки → заряды ×100 (наливать можно и неполную: до максимума) */
export function wellFill(f: FarmProgress, share: number): number {
  const add = Math.round(Math.min(1, Math.max(0, share)) * canMax(f));
  const before = f.water;
  f.water = Math.min(canMax(f), f.water + add);
  return f.water - before;
}

/** Свин лениво: 1 трюфель за 3 ч, хранит до 3; при 3 часы стоят (§18.3) */
export function pigTick(f: FarmProgress, now: number): void {
  const p = f.built.pig;
  if (!p) return;
  if (p.stored >= PIG_STORE) { p.since = now; return; }
  if (now < p.since) { p.since = now; return; }
  const n = Math.floor((now - p.since) / PIG_EVERY_MS);
  if (n <= 0) return;
  p.stored = Math.min(PIG_STORE, p.stored + n);
  p.since = p.stored >= PIG_STORE ? now : p.since + n * PIG_EVERY_MS;
}

// ------------------------------------------------------------ грядки: стадии, посадка, полив

/** −1 пусто, 0–2 растёт (модели stage0–stage2), 3 — спелая (stage3) */
export function bedStage(b: FarmBed, now: number): number {
  if (!b.crop) return -1;
  if (now >= b.ripeAt) return 3;
  const span = b.ripeAt - b.plantedAt;
  if (span <= 0) return 3;
  return Math.min(2, Math.floor(((now - b.plantedAt) / span) * 3));
}

export type FarmFail =
  | 'bed' | 'busy' | 'empty' | 'unripe' | 'level' | 'crop' | 'coins' | 'res' | 'water' | 'watered' | 'bag' | 'item'
  | 'count' | 'max' | 'order' | 'well';

/** Культура открыта на этом уровне фермы */
export function cropOpen(c: CropDef, level: number): boolean {
  return level >= c.level;
}

/** Цена посадки: первая посадка каждой новой культуры — бесплатно (§1.4) */
export function seedPrice(f: FarmProgress, c: CropDef): number {
  return f.firstPlanted.includes(c.id) ? c.seed : 0;
}

/** Время роста с компостом и баффом Древа «рост» — фиксируется в момент посадки */
export function growMs(f: FarmProgress, c: CropDef, now: number): number {
  return Math.round(c.min * 60_000 * (f.built.compost ? COMPOST_GROW : 1) * (hasBuff(f, 'grow', now) ? BUFFS.grow.mult : 1));
}

/**
 * Посадить культуру на грядки (Грабли — до RAKE_BEDS штук за раз). Списывает жетоны через pay(сумма): сервер даёт
 * колбэк со списанием из профиля; false — не хватило. Вернёт посаженные грядки или причину отказа.
 */
export function plant(
  f: FarmProgress, beds: readonly number[], cropId: string, now: number, pay: (coins: number) => boolean,
): { ok: true; beds: number[]; paid: number } | { ok: false; why: FarmFail } {
  const c = cropById(cropId);
  if (!c) return { ok: false, why: 'crop' };
  if (!cropOpen(c, farmLevel(f.xp))) return { ok: false, why: 'level' };
  const list = pickBeds(f, beds);
  if (!list) return { ok: false, why: 'bed' };
  const free = list.filter((i) => !f.beds[i].crop);
  if (free.length === 0) return { ok: false, why: 'busy' };
  // Первая посадка бесплатна только для одной грядки; остальные — по цене
  const firstFree = !f.firstPlanted.includes(c.id);
  const paid = c.seed * free.length - (firstFree ? c.seed : 0);
  if (paid > 0 && !pay(paid)) return { ok: false, why: 'coins' };
  const grow = growMs(f, c, now);
  for (const i of free) f.beds[i] = { crop: c.id, plantedAt: now, ripeAt: now + grow, watered: false, helpers: [] };
  if (firstFree) f.firstPlanted.push(c.id);
  return { ok: true, beds: free, paid };
}

/** Индексы грядок от клиента → проверенный список без повторов, не больше, чем берут Грабли */
export function pickBeds(f: FarmProgress, beds: readonly unknown[]): number[] | null {
  if (!Array.isArray(beds) || beds.length === 0) return null;
  const out: number[] = [];
  for (const i of beds) {
    if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= f.beds.length) return null;
    if (!out.includes(i as number)) out.push(i as number);
  }
  return out.length <= RAKE_BEDS[f.tools.rake - 1] ? out : null;
}

/** Полив: −20 % оставшегося времени (§2, решение 11) */
export function cutRemaining(b: FarmBed, now: number): void {
  b.ripeAt = now + (b.ripeAt - now) * (1 - WATER_CUT);
}

/** Хозяин поливает свои грядки: 1 раз за цикл, заряд за каждую; вернёт политые */
export function water(f: FarmProgress, beds: readonly number[], now: number): { ok: true; beds: number[] } | { ok: false; why: FarmFail } {
  const list = pickBeds(f, beds);
  if (!list) return { ok: false, why: 'bed' };
  const can = list.filter((i) => { const b = f.beds[i]; return !!b.crop && now < b.ripeAt && !b.watered; });
  if (can.length === 0) {
    const anyGrowing = list.some((i) => !!f.beds[i].crop && now < f.beds[i].ripeAt);
    return { ok: false, why: anyGrowing ? 'watered' : 'empty' };
  }
  if (f.water < 100) return { ok: false, why: 'water' };
  const done: number[] = [];
  for (const i of can) {
    if (f.water < 100) break;
    f.water -= 100;
    f.beds[i].watered = true;
    cutRemaining(f.beds[i], now);
    done.push(i);
  }
  return { ok: true, beds: done };
}

// ------------------------------------------------------------ сбор (§4, §5, §6)

export interface HarvestItem {
  bed: number;
  crop: string;
  /** Основной урожай в сумку: 1 или 2 (двойной) */
  n: number;
  res: ResourceId | null;
  xp: number;
}

export interface HarvestResult {
  items: HarvestItem[];
  /** Опыт фермы за все грядки и общий опыт игрока (с учётом дневного потолка) */
  xp: number;
  generalXp: number;
  /** Сумка заполнилась — часть спелых осталась на грядках */
  bagFull: boolean;
}

/** Собрать спелые грядки. Сумка полна → растение остаётся спелым. Счётчики достижений обновляются здесь. */
export function harvest(
  f: FarmProgress, beds: readonly number[], now: number, rng: () => number,
): { ok: true; r: HarvestResult } | { ok: false; why: FarmFail } {
  const list = pickBeds(f, beds);
  if (!list) return { ok: false, why: 'bed' };
  const ripe = list.filter((i) => bedStage(f.beds[i], now) === 3);
  if (ripe.length === 0) return { ok: false, why: list.some((i) => f.beds[i].crop) ? 'unripe' : 'empty' };
  rollDay(f, now);
  const r: HarvestResult = { items: [], xp: 0, generalXp: 0, bagFull: false };
  const xpMult = hasBuff(f, 'xp', now) ? BUFFS.xp.mult : 1;
  for (const i of ripe) {
    const free = bagCap(f) - bagUsed(f);
    if (free < 1) { r.bagFull = true; break; }
    const b = f.beds[i];
    const c = cropById(b.crop)!;
    const n = rng() < SHOVEL_DOUBLE[f.tools.shovel - 1] && free >= 2 ? 2 : 1;
    const res = rng() < c.chance + (f.built.bees ? BEES_BONUS : 0) ? c.res : null;
    const xp = Math.round(c.xp * xpMult);
    f.bag[c.id] = (f.bag[c.id] ?? 0) + n;
    if (res) f.cellar[res] = (f.cellar[res] ?? 0) + 1;
    r.xp += xp;
    const gx = Math.min(GENERAL_XP[cropGroup(c)], GENERAL_XP_DAY_CAP - f.generalXpToday);
    if (gx > 0) { f.generalXpToday += gx; r.generalXp += gx; }
    countHarvest(f, c, res, now);
    f.beds[i] = emptyBed();
    r.items.push({ bed: i, crop: c.id, n, res, xp });
  }
  if (r.items.length === 0) return { ok: false, why: 'bag' };
  return { ok: true, r };
}

function bump(f: FarmProgress, key: string, n = 1): number {
  f.counters[key] = (f.counters[key] ?? 0) + n;
  return f.counters[key];
}

/** Счётчики достижений за один сбор (двойной урожай — один сбор) */
function countHarvest(f: FarmProgress, c: CropDef, res: ResourceId | null, now: number): void {
  const K = FARM_COUNTERS;
  bump(f, K.harvests);
  if (bump(f, K.harvestOf + c.id) === 1) bump(f, K.uniqueCrops);
  if (res && bump(f, K.resOf + res) === 1) bump(f, K.resTypes);
  if (c.min >= LONG_HARVEST_MIN) bump(f, K.longHarvests);
  if (c.min >= NIGHT_HARVEST_MIN) bump(f, K.nightHarvests);
  const day = mskDay(now);
  if (f.counters['lastHarvestDay'] !== dayNum(day)) { f.counters['lastHarvestDay'] = dayNum(day); bump(f, K.harvestDays); }
  const hour = new Date(now + 3 * 3600_000).getUTCHours();
  if (hour >= MORNING_HOURS[0] && hour < MORNING_HOURS[1]) bump(f, K.morning);
}

function dayNum(day: string): number {
  return Math.floor(Date.parse(day + 'T00:00:00Z') / 86_400_000);
}

// ------------------------------------------------------------ продажа и дневной потолок (§9.3, §10.1)

/** Цена 1 шт. у Гриба до потолка: продажа × (1 + репутация) × (1,1 при баффе «цена») */
export function saleUnit(f: FarmProgress, c: CropDef, now: number): number {
  return c.sale * (1 + repBonus(f.rep)) * (hasBuff(f, 'price', now) ? BUFFS.price.mult : 1);
}

/**
 * Сколько заплатить за выручку raw с учётом дневного потолка: до 700 — полностью, остаток ×0,25, но за штуку не
 * дешевле посадки (floorShare = посадка / цена штуки). Ничего не меняет — для подсказок в окнах.
 */
export function capPay(soldToday: number, raw: number, floorShare: number): number {
  const room = Math.max(0, DAILY_CAP - soldToday);
  if (raw <= room) return raw;
  return room + (raw - room) * Math.min(1, Math.max(AFTER_CAP, floorShare));
}

/** Провести выплату через потолок: копит дробную часть, вернёт целые жетоны к начислению */
export function payCapped(f: FarmProgress, raw: number, floorShare: number, now: number): number {
  rollDay(f, now);
  const pay = capPay(f.sold.coins, raw, floorShare);
  f.sold.coins += pay;
  const total = pay + f.sold.frac;
  const coins = Math.floor(total + 1e-9);
  f.sold.frac = Math.max(0, total - coins);
  return coins;
}

/** Продать Грибу n шт. урожая (id культуры) или трюфели. Вернёт жетоны к начислению. */
export function sell(
  f: FarmProgress, item: string, n: number, now: number,
): { ok: true; coins: number; n: number } | { ok: false; why: FarmFail } {
  if (!Number.isInteger(n) || n < 1) return { ok: false, why: 'count' };
  const have = f.bag[item] ?? 0;
  if (have < 1) return { ok: false, why: 'item' };
  const k = Math.min(n, have);
  let coins: number;
  if (item === TRUFFLE) {
    // Трюфели — всегда по полной цене и в счётчик потолка не идут
    coins = k * TRUFFLE_PRICE;
  } else {
    const c = cropById(item);
    if (!c) return { ok: false, why: 'item' };
    const unit = saleUnit(f, c, now);
    coins = payCapped(f, unit * k, c.seed / unit, now);
    bump(f, FARM_COUNTERS.soldNpc, k);
  }
  f.bag[item] = have - k;
  if (f.bag[item] <= 0) delete f.bag[item];
  return { ok: true, coins, n: k };
}

/** Конвертировать вторичные ресурсы в XP фермы у Гриба (§5) */
export function convert(f: FarmProgress, res: string, n: number): { ok: true; xp: number; n: number } | { ok: false; why: FarmFail } {
  const r = resourceById(res);
  if (!r) return { ok: false, why: 'item' };
  if (!Number.isInteger(n) || n < 1) return { ok: false, why: 'count' };
  const have = f.cellar[r.id] ?? 0;
  if (have < n) return { ok: false, why: 'res' };
  f.cellar[r.id] = have - n;
  if (f.cellar[r.id] <= 0) delete f.cellar[r.id];
  bump(f, FARM_COUNTERS.converts);
  return { ok: true, xp: n * r.xp, n };
}

// ------------------------------------------------------------ улучшения (§6)

/** Текущая ступень того, что улучшает это улучшение (грядки — число открытых, постройки — 0/1) */
export function upgradeStep(f: FarmProgress, u: UpgradeDef): number {
  switch (u.kind) {
    case 'bed': return f.beds.length;
    case 'rake': case 'shovel': case 'can': case 'bag': return f.tools[u.kind];
    case 'pig': return f.built.pig ? 1 : 0;
    case 'bees': return f.built.bees ? 1 : 0;
    case 'compost': return f.built.compost ? 1 : 0;
  }
}

/** Можно ли купить (без жетонов: их проверяет сервер по профилю). Причина — для окна: 'level', 'res', 'max', 'order'. */
export function upgradeBlock(f: FarmProgress, u: UpgradeDef): FarmFail | null {
  const step = upgradeStep(f, u);
  if (step >= u.step) return 'max';
  if (step !== u.step - 1) return 'order';
  if (farmLevel(f.xp) < u.level) return 'level';
  for (const [res, n] of Object.entries(u.res)) if ((f.cellar[res] ?? 0) < (n ?? 0)) return 'res';
  return null;
}

/** Купить улучшение: проверка, списание ресурсов и жетонов (pay), применение */
export function upgrade(
  f: FarmProgress, id: string, now: number, pay: (coins: number) => boolean,
): { ok: true; u: UpgradeDef } | { ok: false; why: FarmFail } {
  const u = upgradeById(id);
  if (!u) return { ok: false, why: 'item' };
  const block = upgradeBlock(f, u);
  if (block) return { ok: false, why: block };
  if (u.coins > 0 && !pay(u.coins)) return { ok: false, why: 'coins' };
  for (const [res, n] of Object.entries(u.res)) {
    f.cellar[res] = (f.cellar[res] ?? 0) - (n ?? 0);
    if (f.cellar[res] <= 0) delete f.cellar[res];
  }
  switch (u.kind) {
    case 'bed': f.beds.push(emptyBed()); break;
    case 'rake': case 'shovel': case 'can': case 'bag': f.tools[u.kind] = u.step; break;
    case 'pig': f.built.pig = { since: now, stored: 0 }; break;
    case 'bees': f.built.bees = true; bump(f, FARM_COUNTERS.bees); break;
    case 'compost': f.built.compost = true; bump(f, FARM_COUNTERS.compost); break;
  }
  return { ok: true, u };
}

// ------------------------------------------------------------ обучение Семечкина (§1.4)

export type TutorialEvent = 'plant' | 'fill' | 'water' | 'harvest' | 'sell';
/** Что двигает каждый шаг: 1 посадить, 2 набрать лейку, 3 полить, 4 собрать, 5 продать, 6 посадить ещё */
const TUTORIAL_EVENTS: readonly TutorialEvent[] = ['plant', 'fill', 'water', 'harvest', 'sell', 'plant'];

/** Событие игрока → награда шага, если он закрыт ({xp, coins}); иначе null */
export function tutorialEvent(f: FarmProgress, ev: TutorialEvent): { step: number; xp: number; coins: number } | null {
  const step = f.tutorial;
  if (step < 0 || step >= TUTORIAL_STEPS || TUTORIAL_EVENTS[step] !== ev) return null;
  f.tutorial = step + 1;
  return { step: step + 1, xp: TUTORIAL_XP[step], coins: step + 1 === TUTORIAL_STEPS ? TUTORIAL_COINS : 0 };
}

// ------------------------------------------------------------ справка для окон и тестов

export const ALL_RESOURCES = RESOURCES.map((r) => r.id);
