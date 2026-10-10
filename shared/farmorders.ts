// Ферма: доска заказов (design-v11 §10.3). Личная: 3 заказа в МСК-сутки (слот A «Вырасти», B «Соседи / Фургон»,
// C «Особый»), 2 замены, прогресс — только за действия после выдачи, награда — один раз (не режется дневным потолком).
// Генератор и прогресс — чистые функции; выдачу, замену и награды проводит server/farm/orders.ts.
import { mskDay } from './economy.ts';
import { farmLevel, upgradeStep, type FarmOrder, type FarmProgress } from './farm.ts';
import {
  CROPS, ORDER_EXACT_CROP, ORDER_GROW_WEIGHTS, ORDER_TEMPLATES, UPGRADES, cropById, type CropDef, type OrderTemplate,
  type UpgradeKind,
} from './farmdata.ts';
import { helpTargetsToday } from './farmhelp.ts';

/** Группы «Вырасти»: 🟢 до 5 мин, 🟡 до 30 мин, 🟠 45–120 мин, 🟠 6–12 ч */
const GROW_TPL = ['grow-fast', 'grow-mid', 'grow-long', 'grow-night'] as const;
const GROUP_OF: Readonly<Record<string, number>> = { 'grow-fast': 0, 'grow-mid': 1, 'grow-long': 2, 'grow-night': 3 };
/** «Сложный» заказ на помощь — ещё и 3 разным соседям */
const HELP_HARD_TARGETS = 3;
const TOOL_KINDS: readonly UpgradeKind[] = ['rake', 'shovel', 'can', 'bag'];

export function orderTemplate(id: string): OrderTemplate | undefined {
  return ORDER_TEMPLATES.find((t) => t.id === id);
}

function growGroup(c: CropDef): number {
  if (c.min <= 5) return 0;
  if (c.min <= 30) return 1;
  if (c.min <= 120) return 2;
  return c.min >= 360 ? 3 : -1;
}

/** Что известно генератору об игроке */
export interface OrderEnv {
  level: number;
  beds: number;
  /** За 3 суток на ферме был кто-то ещё — можно заказы на помощь */
  social: boolean;
  /** Древо проснулось — можно заказы на Древо */
  boss: boolean;
  /** Есть улучшение инструмента по уровню / следующая грядка по уровню */
  toolUp: boolean;
  bedUp: boolean;
}

export function orderEnv(f: FarmProgress, social: boolean, boss: boolean): OrderEnv {
  const level = farmLevel(f.xp);
  const avail = (kinds: readonly UpgradeKind[]): boolean =>
    UPGRADES.some((u) => kinds.includes(u.kind) && upgradeStep(f, u) === u.step - 1 && level >= u.level);
  return { level, beds: f.beds.length, social, boss, toolUp: avail(TOOL_KINDS), bedUp: avail(['bed']) };
}

function weighted(w: readonly number[], r: number): number {
  const total = w.reduce((s, x) => s + x, 0);
  let x = r * total;
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x < 0) return i;
  }
  return w.length - 1;
}

/** Слот A: группа по весам уровня, с вероятностью 50 % — конкретная открытая культура группы */
export function growOrder(env: OrderEnv, rng: () => number): FarmOrder {
  let w = ORDER_GROW_WEIGHTS[0].w;
  for (const row of ORDER_GROW_WEIGHTS) if (env.level >= row.level) w = row.w;
  const open = CROPS.filter((c) => c.level <= env.level);
  const byGroup = [0, 1, 2, 3].map((g) => open.filter((c) => growGroup(c) === g));
  const g = weighted(w.map((x, i) => (byGroup[i].length ? x : 0)), rng());
  const tpl = orderTemplate(GROW_TPL[g])!;
  const t = (Math.max(1, env.beds) - 1) / 7;
  const order: FarmOrder = { t: tpl.id, need: Math.round(tpl.need[0] + (tpl.need[1] - tpl.need[0]) * t), got: 0, done: false };
  const exact = rng() < ORDER_EXACT_CROP;
  const pickN = rng();
  if (exact && byGroup[g].length) order.crop = byGroup[g][Math.floor(pickN * byGroup[g].length)].id;
  return order;
}

function fixed(id: string): FarmOrder {
  return { t: id, need: orderTemplate(id)!.need[0], got: 0, done: false };
}

/** Слот B: «Помоги» или «Фургон» поровну; сложность по уровню */
export function socialOrder(env: OrderEnv, rng: () => number): FarmOrder | null {
  const kinds = [env.social ? 'help' : '', env.level >= 3 ? 'van' : ''].filter(Boolean);
  const r1 = rng();
  const r2 = rng();
  if (kinds.length === 0) return null;
  const kind = kinds[Math.floor(r1 * kinds.length)];
  const diff = env.level < 4 ? 'easy' : env.level < 8 ? (r2 < 0.5 ? 'easy' : 'mid') : r2 < 0.5 ? 'mid' : 'hard';
  return fixed(`${kind}-${diff}`);
}

/** Слот C: случайный особый из подходящих, не повторяет цель A и B */
export function specialOrder(env: OrderEnv, rng: () => number, a: FarmOrder | null, b: FarmOrder | null, not?: string): FarmOrder | null {
  const ok = (id: string): boolean => {
    switch (id) {
      case 'crystal-garden': return env.level >= (cropById('crystal')?.level ?? 99) && a?.crop !== 'crystal';
      case 'night-gardener': return CROPS.some((c) => c.min >= 360 && c.level <= env.level) && a?.t !== 'grow-night';
      case 'patient': return CROPS.some((c) => c.min >= 45 && c.level <= env.level) && a?.t !== 'grow-long' && a?.t !== 'grow-night';
      case 'tool-master': return env.toolUp;
      case 'host': return env.bedUp;
      case 'neighbor-friend': return env.social && !b?.t.startsWith('help');
      case 'tree-sprout': case 'tree-fest': return env.boss;
      default: return true;
    }
  };
  const list = ORDER_TEMPLATES.filter((t) => t.kind === 'special' && t.id !== not && ok(t.id));
  const r = rng();
  return list.length ? fixed(list[Math.floor(r * list.length)].id) : null;
}

/** Заказ слота i (0 — A, 1 — B, 2 — C); не хватает подходящих — повторяемый «Вырасти» (v10) */
export function slotOrder(i: number, env: OrderEnv, rng: () => number, list: readonly FarmOrder[], not?: string): FarmOrder {
  let o: FarmOrder | null = null;
  if (i === 1) o = socialOrder(env, rng);
  if (i === 2) o = specialOrder(env, rng, list[0] ?? null, list[1] ?? null, not);
  return o ?? growOrder(env, rng);
}

export function makeOrders(env: OrderEnv, rng: () => number): FarmOrder[] {
  const list: FarmOrder[] = [];
  for (let i = 0; i < 3; i++) list.push(slotOrder(i, env, rng, list));
  return list;
}

/** Когда доска обновится: ближайшая полночь по Москве */
export function ordersResetAt(now: number): number {
  return Date.parse(mskDay(now) + 'T00:00:00Z') - 3 * 3600_000 + 86_400_000;
}

/** Заказ выполнен и награду можно забрать */
export function orderReady(f: FarmProgress, o: FarmOrder, now: number): boolean {
  if (o.done || o.got < o.need) return false;
  return o.t !== 'help-hard' || helpTargetsToday(f, now) >= HELP_HARD_TARGETS;
}

/** Что произошло у игрока — для прогресса заказов */
export type OrderEvent =
  | { k: 'harvest'; items: readonly { crop: string; res: string | null }[] }
  | { k: 'help'; n: number }
  | { k: 'van' }
  | { k: 'upgrade'; kind: UpgradeKind }
  | { k: 'water'; n: number }
  | { k: 'sold'; coins: number }
  /** Вклад ≥ 1 % в проснувшееся Древо / Древо расцвело с таким вкладом */
  | { k: 'boss' }
  | { k: 'bloom' };

/** Двинуть прогресс сегодняшних заказов; true — что-то изменилось */
export function orderProgress(f: FarmProgress, e: OrderEvent, now: number): boolean {
  if (f.orders.day !== mskDay(now)) return false;
  let changed = false;
  for (const o of f.orders.list) {
    if (o.done) continue;
    const before = o.got;
    o.got = Math.min(o.need, o.got + gain(o, e));
    if (o.t === 'neighbor-friend' && e.k === 'help') o.got = Math.min(o.need, Math.max(o.got, helpTargetsToday(f, now)));
    if (o.got !== before) changed = true;
  }
  return changed;
}

function gain(o: FarmOrder, e: OrderEvent): number {
  switch (e.k) {
    case 'harvest': {
      let n = 0;
      for (const it of e.items) {
        const c = cropById(it.crop);
        if (!c) continue;
        if (o.t in GROUP_OF) { if (o.crop ? o.crop === c.id : growGroup(c) === GROUP_OF[o.t]) n++; }
        else if (o.t === 'crystal-garden') { if (c.id === 'crystal') n++; }
        else if (o.t === 'night-gardener') { if (c.min >= 360) n++; }
        else if (o.t === 'patient') { if (c.min >= 45) n++; }
        else if (o.t === 'collector') { if (it.res) n++; }
      }
      return n;
    }
    case 'help': return o.t.startsWith('help-') ? e.n : 0;
    case 'van': return o.t.startsWith('van-') ? 1 : 0;
    case 'upgrade': return (o.t === 'tool-master' && TOOL_KINDS.includes(e.kind)) || (o.t === 'host' && e.kind === 'bed') ? 1 : 0;
    case 'water': return o.t === 'waterer' ? e.n : 0;
    case 'sold': return o.t === 'rich' ? e.coins : 0;
    case 'boss': return o.t === 'tree-sprout' ? 1 : 0;
    case 'bloom': return o.t === 'tree-fest' ? 1 : 0;
  }
}

/** «Все свои»: серия дней входа (сутки в заказе одни, поэтому считается сама серия) */
export function orderStreak(f: FarmProgress): boolean {
  let changed = false;
  for (const o of f.orders.list) {
    if (o.t !== 'all-mine' || o.done) continue;
    const got = Math.min(o.need, f.streak);
    if (got !== o.got) { o.got = got; changed = true; }
  }
  return changed;
}
