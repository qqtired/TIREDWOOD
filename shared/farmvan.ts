// Ферма: Фургон (design-v11 §10.2). Открыт в чётные часы по Москве, закрыт в нечётные. Предложения не хранятся:
// зерно = хэш(игрок, номер цикла), их можно пересчитать на сервере и на клиенте. Ящик сдаётся целиком из сумки.
// Числа — shared/farmdata.ts. Сдачу ящика проводит сервер (server/farm/van.ts).
import { bagCap, farmLevel, hasBuff, repBonus, repLevel, type FarmProgress } from './farm.ts';
import {
  BUFFS, CROPS, REP_LEVELS, TRUFFLE, TRUFFLE_PRICE, VAN_ASSORTMENT, VAN_BAG_SHARE, VAN_CYCLE_MS, VAN_EXPENSIVE_LEVEL,
  VAN_FAST_MAX_MIN, VAN_GOURMET_CHANCE, VAN_GOURMET_LEVEL, VAN_GOURMET_MULT, VAN_GOURMET_N, VAN_GROW_WINDOW_MIN,
  VAN_MAX_SLOTS, VAN_MULTS, VAN_RECENT, VAN_SLOTS_BY_LEVEL, VAN_U, VAN_XP_MIN, VAN_XP_SHARE, cropById, cropGroup, vanQ,
  type CropDef,
} from './farmdata.ts';
import { hash32, makeRng } from './math.ts';

const MSK = 3 * 3600_000;
const HALF = VAN_CYCLE_MS / 2;

export interface VanTime {
  /** Номер двухчасового цикла по Москве */
  cycle: number;
  open: boolean;
  /** Когда уедет (open) или приедет */
  next: number;
}

export function vanTime(now: number): VanTime {
  const cycle = Math.floor((now + MSK) / VAN_CYCLE_MS);
  const start = cycle * VAN_CYCLE_MS - MSK;
  const open = now < start + HALF;
  return { cycle, open, next: open ? start + HALF : start + VAN_CYCLE_MS };
}

/** Слоты: ур. 3–4 → 1, 5–9 → 2, 10–13 → 3, +1 за репутацию 2, 4, 6; до ур. 3 Фургона нет */
export function vanSlotCount(level: number, rep: number): number {
  let base = 0;
  for (const s of VAN_SLOTS_BY_LEVEL) if (level >= s.level) base = s.slots;
  if (base === 0) return 0;
  const rl = repLevel(rep);
  const extra = REP_LEVELS.filter((r) => r.vanSlot && r.level <= rl).length;
  return Math.min(VAN_MAX_SLOTS, base + extra);
}

/** Чем откроется закрытый слот i: ближайший уровень фермы и/или ступень репутации */
export function vanSlotLock(level: number, rep: number, i: number): { level?: number; rep?: number } {
  const out: { level?: number; rep?: number } = {};
  for (let lv = level + 1; lv <= 13; lv++) if (vanSlotCount(lv, rep) > i) { out.level = lv; break; }
  for (const r of REP_LEVELS) if (r.level > repLevel(rep) && vanSlotCount(level, r.need) > i) { out.rep = r.level; break; }
  return out;
}

/** Культуры, которые Фургон берёт у этого уровня (по ассортименту и открытые игроку) */
export function vanCrops(level: number): CropDef[] {
  const ids = new Set<string>();
  for (const a of VAN_ASSORTMENT) if (level >= a.level) for (const id of a.crops) ids.add(id);
  return CROPS.filter((c) => ids.has(c.id) && c.level <= level);
}

export type VanKind = 'fast' | 'season' | 'expensive' | 'any' | 'gourmet';

/** Ящик: сдать n × item (id культуры или 'truffle') → coins 🪙 (до дневного потолка) + xp */
export interface VanOffer {
  slot: number;
  kind: VanKind;
  item: string;
  n: number;
  mult: number;
  coins: number;
  xp: number;
}

function pick(list: readonly CropDef[], weight: (c: CropDef) => number, used: ReadonlySet<string>, r: number): CropDef | null {
  let pool = list.filter((c) => !used.has(c.id));
  if (pool.length === 0) pool = [...list];
  if (pool.length === 0) return null;
  const total = pool.reduce((s, c) => s + weight(c), 0);
  let x = r * total;
  for (const c of pool) {
    x -= weight(c);
    if (x < 0) return c;
  }
  return pool[pool.length - 1];
}

/**
 * Предложения цикла для игрока pid. Случайность — только из зерна (pid, cycle) и тратится одинаково при любых сумке,
 * репутации и баффе: они меняют количество и цену, но не выбор культур.
 */
export function vanOffers(f: FarmProgress, pid: number, cycle: number, now: number): VanOffer[] {
  const level = farmLevel(f.xp);
  const slots = vanSlotCount(level, f.rep);
  const rng = makeRng(hash32(pid, cycle));
  const crops = vanCrops(level);
  const recent = new Set([...crops].sort((a, b) => a.level - b.level || CROPS.indexOf(a) - CROPS.indexOf(b)).slice(-VAN_RECENT).map((c) => c.id));
  const price = (1 + repBonus(f.rep)) * (hasBuff(f, 'price', now) ? BUFFS.price.mult : 1);
  const bagMax = Math.max(1, Math.floor(bagCap(f) * VAN_BAG_SHARE));
  const used = new Set<string>();
  const out: VanOffer[] = [];
  for (let i = 0; i < slots; i++) {
    const r1 = rng();
    const r2 = rng();
    const u = VAN_U[0] + rng() * (VAN_U[1] - VAN_U[0]);
    const mult = VAN_MULTS[Math.min(VAN_MULTS.length - 1, Math.floor(rng() * VAN_MULTS.length))];
    if (i === 2 && level >= VAN_GOURMET_LEVEL && r1 < VAN_GOURMET_CHANCE) {
      const n = VAN_GOURMET_N[0] + Math.floor(r2 * (VAN_GOURMET_N[1] - VAN_GOURMET_N[0] + 1));
      out.push({ slot: i, kind: 'gourmet', item: TRUFFLE, n, mult: VAN_GOURMET_MULT, coins: Math.round(n * TRUFFLE_PRICE * VAN_GOURMET_MULT), xp: VAN_XP_MIN });
      continue;
    }
    let kind: VanKind = i === 0 ? 'fast' : i === 1 ? 'season' : i === 2 ? (level >= VAN_EXPENSIVE_LEVEL ? 'expensive' : 'season') : 'any';
    let list = crops;
    if (kind === 'fast') list = crops.filter((c) => c.min <= VAN_FAST_MAX_MIN);
    if (kind === 'expensive') list = crops.filter((c) => cropGroup(c) === 'long');
    if (list.length === 0) { list = crops; kind = 'any'; }
    const c = pick(list, (x) => (kind === 'season' && recent.has(x.id) ? 2 : 1), used, r2);
    if (!c) continue;
    used.add(c.id);
    let n = Math.max(1, Math.round(vanQ(c) * u));
    if (c.min <= 60) n = Math.min(n, f.beds.length * Math.floor(VAN_GROW_WINDOW_MIN / c.min));
    n = Math.max(1, Math.min(n, bagMax));
    out.push({
      slot: i, kind, item: c.id, n, mult, coins: Math.round(n * c.sale * mult * price),
      xp: Math.max(VAN_XP_MIN, Math.round(VAN_XP_SHARE * c.xp * n)),
    });
  }
  return out;
}

/** Доля «не дешевле посадки» для дневного потолка: посадка партии / цена ящика (как у Гриба) */
export function vanFloorShare(o: VanOffer): number {
  const c = cropById(o.item);
  return c && o.coins > 0 ? (c.seed * o.n) / o.coins : 1;
}
