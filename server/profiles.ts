// Профили игроков: вход по ключу устройства, ники, коды для второго устройства,
// жетоны, покупки, наряды, доска почёта. Пароли не нужны: ключ лежит в браузере, на сервере — только его хеш.
import { createHash, randomInt } from 'node:crypto';
import { BOT_NAMES } from '../shared/constants.ts';
import { DAILY_BONUS, START_TOKENS, itemPrice, mskDay } from '../shared/economy.ts';
import {
  ALE_MS, ALE_PRICE, BEER_MS, BEER_PRICE, LORD_MS, VODKA_MS, VODKA_PRICE, bagSlots, bagValue, emptyFishProgress, fishLevel, questNeed, unlockedRod,
  type BagFish, type FishRod,
} from '../shared/fishprogress.ts';
import { BAGS, LURES, gearState, type GearState } from '../shared/fishshop.ts';
import { RECENT_ROWS, type RecentRow } from '../shared/messages.ts';
import { DEFAULT_OUTFIT, PALETTE, itemById, sanitizeOutfit, type Outfit } from '../shared/outfit.ts';
import { sanitizeName } from '../shared/text.ts';
import { FISHING_RESET_VERSION, LEVELS_VERSION, levelChange, levelFromXp, safeXp, type LevelUp } from '../shared/levels.ts';
import { RateLimiter } from './ratelimit.ts';
import { emptyStats, type Profile, type State, type Store } from './store.ts';

export { RateLimiter };

export type LoginCode = 'need_nick' | 'nick_taken' | 'bad_nick' | 'bad_code' | 'bad_key' | 'rate';
export type LoginResult = { ok: true; profile: Profile; created: boolean; daily: number } | { ok: false; code: LoginCode };

export const RESERVED_NICKS: readonly string[] = [...BOT_NAMES, 'Система', 'Бот', 'Админ', 'Проверка'];

const HOUR = 3600_000;
const CODE_TTL = 10 * 60_000;
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_KEYS = 5;

/** Ключ сравнения ников: без регистра, ё = е. */
export function nickKey(nick: string): string {
  return nick.toLowerCase().replace(/ё/g, 'е');
}

const RESERVED = new Set(RESERVED_NICKS.map(nickKey));

/** Ник после очистки или null: 2–16 символов, хотя бы одна буква, не занят ботами и системой. */
export function validNick(raw: unknown): string | null {
  const s = sanitizeName(raw);
  if (s.length < 2 || !/\p{L}/u.test(s) || RESERVED.has(nickKey(s))) return null;
  return s;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function validKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(key);
}

function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export interface HonorRow {
  nick: string;
  level: number;
  n: number;
}

export interface Honor {
  rich: HonorRow[];
  wins: HonorRow[];
  lastJackpot: State['lastJackpot'];
}

export class Profiles {
  readonly limits: RateLimiter;
  onLevel: ((profile: Profile, event: LevelUp) => void) | null = null;
  private readonly store: Store;
  private readonly now: () => number;
  private readonly byKey = new Map<string, Profile>();
  private readonly byNick = new Map<string, Profile>();
  private readonly ids = new Map<number, Profile>();
  /** код → профиль; у профиля не больше одного живого кода */
  private readonly codes = new Map<string, { pid: number; until: number }>();
  private readonly codeOf = new Map<number, string>();

  constructor(store: Store, opts: { now?: () => number } = {}) {
    this.store = store;
    this.now = opts.now ?? Date.now;
    this.limits = new RateLimiter(this.now);
    let recovered = false;
    for (const p of store.state.profiles) {
      this.index(p);
      if (p.durakEscrow) {
        p.tokens += p.durakEscrow.amount; p.durakEscrow = null; recovered = true;
      }
      if (p.blackjackEscrow) {
        p.tokens += p.blackjackEscrow.amount;
        p.blackjackEscrow = null;
        recovered = true;
      }
      // улов на рулетке, колесо не остановилось до рестарта: его цена — жетонами (столько дал бы Семён)
      if (p.rouletteEscrow) {
        p.tokens += p.rouletteEscrow.amount;
        p.rouletteEscrow = null;
        recovered = true;
      }
      // ставка на крысиных бегах, забег не кончился до рестарта: жетоны назад
      if (p.ratEscrow) {
        p.tokens += p.ratEscrow.amount;
        p.ratEscrow = null;
        recovered = true;
      }
      // ставка бильярда: партия не доиграна до рестарта — обратно хозяину
      if (p.billiardsEscrow) {
        p.tokens += p.billiardsEscrow.amount;
        p.billiardsEscrow = null;
        recovered = true;
      }
    }
    if (recovered) { store.markDirty(); store.flush(); }
  }

  private index(p: Profile): void {
    this.ids.set(p.id, p);
    this.byNick.set(nickKey(p.nick), p);
    for (const h of p.keyHashes) this.byKey.set(h, p);
  }

  byId(id: number): Profile | undefined {
    return this.ids.get(id);
  }

  get count(): number {
    return this.ids.size;
  }

  login(req: { key: unknown; nick?: unknown; code?: unknown }, ip: string): LoginResult {
    if (!validKey(req.key)) return { ok: false, code: 'bad_key' };
    const h = hashKey(req.key);
    const now = this.now();

    // Вход по коду с другого устройства: ключ этого устройства добавляется к профилю
    if (typeof req.code === 'string' && req.code.trim()) {
      const ipKey = `badcode:${ip || '*'}`;
      const limit = ip ? 10 : 30;
      if (!this.limits.peek(ipKey, limit, HOUR)) return { ok: false, code: 'rate' };
      const code = normalizeCode(req.code);
      const entry = this.codes.get(code);
      const p = entry && entry.until >= now ? this.ids.get(entry.pid) : undefined;
      if (!entry || !p) {
        if (entry) this.dropCode(code);
        this.limits.hit(ipKey, limit, HOUR);
        return { ok: false, code: 'bad_code' };
      }
      this.dropCode(code);
      const old = this.byKey.get(h);
      if (old && old !== p) {
        old.keyHashes = old.keyHashes.filter((x) => x !== h);
      }
      if (!p.keyHashes.includes(h)) {
        p.keyHashes.push(h);
        while (p.keyHashes.length > MAX_KEYS) this.byKey.delete(p.keyHashes.shift()!);
      }
      this.byKey.set(h, p);
      return this.enter(p, false);
    }

    const known = this.byKey.get(h);
    if (known) return this.enter(known, false);

    // Новый профиль
    if (req.nick === undefined || req.nick === null || (typeof req.nick === 'string' && !req.nick.trim())) {
      return { ok: false, code: 'need_nick' };
    }
    const nick = validNick(req.nick);
    if (!nick) return { ok: false, code: 'bad_nick' };
    if (this.byNick.has(nickKey(nick))) return { ok: false, code: 'nick_taken' };
    const createKey = `create:${ip || '*'}`;
    if (!this.limits.hit(createKey, ip ? 5 : 30, HOUR)) return { ok: false, code: 'rate' };
    const st = this.store.state;
    const p: Profile = {
      id: st.nextId++,
      nick,
      keyHashes: [h],
      createdAt: now,
      lastSeen: now,
      tokens: START_TOKENS,
      xp: 0, level: 1, levelsVersion: LEVELS_VERSION, fishingResetVersion: FISHING_RESET_VERSION,
      durakEscrow: null,
      rouletteEscrow: null,
      ratEscrow: null,
      blackjackEscrow: null,
      billiardsEscrow: null,
      owned: [],
      outfit: { ...DEFAULT_OUTFIT, c: randomInt(PALETTE.length) },
      daily: mskDay(now),
      stats: emptyStats(),
      foolUntil: 0,
      epUntil: 0,
      album: {},
      fishing: emptyFishProgress(),
    };
    st.profiles.push(p);
    this.index(p);
    this.store.markDirty();
    return { ok: true, profile: p, created: true, daily: 0 };
  }

  /** Вход в существующий профиль: ежедневный бонус и время последнего визита. */
  private enter(p: Profile, created: boolean): LoginResult {
    const now = this.now();
    const today = mskDay(now);
    let daily = 0;
    if (p.daily !== today) {
      p.daily = today;
      p.tokens += DAILY_BONUS;
      daily = DAILY_BONUS;
    }
    p.lastSeen = now;
    this.store.markDirty();
    return { ok: true, profile: p, created, daily };
  }

  rename(p: Profile, raw: unknown): 'ok' | 'nick_taken' | 'bad_nick' | 'rate' {
    const key = `rename:${p.id}`;
    if (!this.limits.peek(key, 1, 60_000)) return 'rate';
    const nick = validNick(raw);
    if (!nick) return 'bad_nick';
    const other = this.byNick.get(nickKey(nick));
    if (other && other !== p) return 'nick_taken';
    this.limits.hit(key, 1, 60_000);
    this.byNick.delete(nickKey(p.nick));
    p.nick = nick;
    this.byNick.set(nickKey(nick), p);
    this.store.markDirty();
    return 'ok';
  }

  /** Код для входа с другого устройства: 8 символов, 10 минут, один раз. Показывается как XXXX-XXXX. */
  issueCode(p: Profile): { code: string; until: number } {
    const old = this.codeOf.get(p.id);
    if (old) this.dropCode(old);
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    } while (this.codes.has(code));
    const until = this.now() + CODE_TTL;
    this.codes.set(code, { pid: p.id, until });
    this.codeOf.set(p.id, code);
    return { code: `${code.slice(0, 4)}-${code.slice(4)}`, until };
  }

  private dropCode(code: string): void {
    const e = this.codes.get(code);
    if (e && this.codeOf.get(e.pid) === code) this.codeOf.delete(e.pid);
    this.codes.delete(code);
  }

  credit(p: Profile, n: number, source: 'mode' | 'other' = 'other'): void {
    if (!Number.isFinite(n) || n < 1) return;
    const amount = Math.floor(n);
    p.tokens += amount;
    const change = source === 'mode' ? this.addModeXp(p, amount) : null;
    this.store.markDirty();
    if (change) this.onLevel?.(p, change);
  }

  /** Общий опыт за режим без жетонов (рыба легла в рюкзак: опыт сразу, жетоны — при продаже). */
  modeXp(p: Profile, n: number): void {
    if (!Number.isFinite(n) || n < 1) return;
    const change = this.addModeXp(p, Math.floor(n));
    this.store.markDirty();
    if (change) this.onLevel?.(p, change);
  }

  private addModeXp(p: Profile, amount: number): LevelUp | null {
    const from = levelFromXp(p.xp ?? 0);
    p.xp = safeXp((p.xp ?? 0) + amount);
    p.level = levelFromXp(p.xp);
    p.levelsVersion = LEVELS_VERSION;
    return levelChange(from, p.xp);
  }

  spend(p: Profile, n: number): boolean {
    if (n < 0 || p.tokens < n) return false;
    p.tokens -= n;
    this.store.markDirty();
    return true;
  }

  /** Списание и резерв попадают в один атомарный снимок до выдачи карт. */
  reserveBlackjack(pid: number, round: string, amount: number): boolean {
    const p = this.ids.get(pid);
    if (!p || !round || round.length > 100 || !Number.isSafeInteger(amount) || amount <= 0 || p.tokens < amount) return false;
    if (p.blackjackEscrow && p.blackjackEscrow.round !== round) return false;
    const total = (p.blackjackEscrow?.amount ?? 0) + amount;
    if (!Number.isSafeInteger(total)) return false;
    p.tokens -= amount;
    p.blackjackEscrow = { round, amount: total };
    this.store.markDirty();
    this.store.flush();
    return true;
  }

  /** Полный расчёт по профилю, даже если его сетевое место уже занято другим человеком. */
  settleBlackjack(pid: number, round: string, wager: number, payout: number): boolean {
    const p = this.ids.get(pid);
    if (!p || !Number.isSafeInteger(payout) || payout < 0 || !p.blackjackEscrow ||
        p.blackjackEscrow.round !== round || p.blackjackEscrow.amount !== wager) return false;
    p.tokens += payout;
    p.blackjackEscrow = null;
    this.store.markDirty();
    this.store.flush();
    return true;
  }

  /** Ставка бильярда в банк: у профиля не больше одной; списание и запись — в одном атомарном снимке. */
  reserveBilliards(pid: number, round: string, amount: number): boolean {
    const p = this.ids.get(pid);
    if (!p || !round || round.length > 100 || p.billiardsEscrow || !Number.isSafeInteger(amount) || amount <= 0 || p.tokens < amount) return false;
    p.tokens -= amount;
    p.billiardsEscrow = { round, amount };
    this.store.markDirty();
    this.store.flush();
    return true;
  }

  /**
   * Банк бильярдной записи round целиком: каждый, чья ставка в ней, — ровно один раз, выплаты в сумме равны ставкам
   * (комиссии нет). Возврат ставки — та же запись с payout = wager. XP — за выигрыш сверх своей ставки.
   */
  settleBilliards(round: string, payouts: readonly { pid: number; wager: number; payout: number }[]): boolean {
    const pending = [...this.ids.values()].filter((p) => p.billiardsEscrow?.round === round);
    if (!round || !pending.length || payouts.length !== pending.length) return false;
    const seen = new Set<number>();
    const entries: { p: Profile; wager: number; payout: number }[] = [];
    let bank = 0, returned = 0;
    for (const item of payouts) {
      const p = this.ids.get(item.pid);
      if (!p || seen.has(item.pid) || p.billiardsEscrow?.round !== round || p.billiardsEscrow.amount !== item.wager ||
          !Number.isSafeInteger(item.payout) || item.payout < 0) return false;
      seen.add(item.pid); bank += item.wager; returned += item.payout;
      entries.push({ p, wager: item.wager, payout: item.payout });
    }
    if (!Number.isSafeInteger(bank) || bank !== returned) return false;
    const events: { p: Profile; change: LevelUp }[] = [];
    for (const { p, wager, payout } of entries) {
      p.tokens += payout; p.billiardsEscrow = null;
      const change = payout > wager ? this.addModeXp(p, payout - wager) : null;
      if (change) events.push({ p, change });
    }
    this.store.markDirty(); this.store.flush();
    for (const { p, change } of events) this.onLevel?.(p, change);
    return true;
  }

  /** Вся партия резервируется одной записью: нехватка у одного не списывает у остальных. */
  reserveDurakBatch(round: string, bets: readonly { pid: number; amount: number }[]): boolean {
    if (!round || round.length > 100 || !bets.length || bets.length > 6) return false;
    const seen = new Set<number>();
    const entries: { p: Profile; amount: number }[] = [];
    let bank = 0;
    for (const bet of bets) {
      const p = this.ids.get(bet.pid);
      if (!p || seen.has(bet.pid) || p.durakEscrow || !Number.isSafeInteger(bet.amount) || bet.amount <= 0 || p.tokens < bet.amount) return false;
      seen.add(bet.pid); entries.push({ p, amount: bet.amount }); bank += bet.amount;
    }
    if (!Number.isSafeInteger(bank)) return false;
    for (const { p, amount } of entries) { p.tokens -= amount; p.durakEscrow = { round, amount }; }
    this.store.markDirty(); this.store.flush();
    return true;
  }

  /** Полный банк одной партии: без частичных выплат, повторов и XP за возврат своей ставки. */
  settleDurak(round: string, payouts: readonly { pid: number; wager: number; payout: number }[]): boolean {
    const pending = [...this.ids.values()].filter(p => p.durakEscrow?.round === round);
    if (!pending.length || payouts.length !== pending.length) return false;
    const seen = new Set<number>();
    const entries: { p: Profile; wager: number; payout: number }[] = [];
    let bank = 0, returned = 0;
    for (const item of payouts) {
      const p = this.ids.get(item.pid);
      if (!p || seen.has(item.pid) || p.durakEscrow?.round !== round || p.durakEscrow.amount !== item.wager ||
          !Number.isSafeInteger(item.payout) || item.payout < 0) return false;
      seen.add(item.pid); bank += item.wager; returned += item.payout;
      entries.push({ p, wager: item.wager, payout: item.payout });
    }
    if (!Number.isSafeInteger(bank) || !Number.isSafeInteger(returned) || bank !== returned) return false;
    const events: { p: Profile; change: LevelUp }[] = [];
    for (const { p, wager, payout } of entries) {
      p.tokens += payout; p.durakEscrow = null;
      const change = payout > wager ? this.addModeXp(p, payout - wager) : null;
      if (change) events.push({ p, change });
    }
    this.store.markDirty(); this.store.flush();
    for (const { p, change } of events) this.onLevel?.(p, change);
    return true;
  }

  /** Истёкшие пиво, эль, пиво владыки и водка снимаются по серверным часам, независимо от комнаты игрока. */
  refreshFishing(p: Profile): boolean {
    const f = p.fishing;
    const now = this.now();
    let changed = false;
    if (f.beerUntil > 0 && f.beerUntil <= now) { f.beerUntil = 0; changed = true; }
    if (f.aleUntil > 0 && f.aleUntil <= now) { f.aleUntil = 0; changed = true; }
    if (f.lordUntil !== undefined && f.lordUntil <= now) { delete f.lordUntil; changed = true; }
    if (f.vodkaUntil !== undefined && f.vodkaUntil <= now) { delete f.vodkaUntil; changed = true; }
    if (changed) this.store.markDirty();
    return changed;
  }

  /** Пиво подводного владыки из сундука: выпивается сразу, заменяет пиво, эль и водку (их остаток пропадает). */
  drinkFishLord(p: Profile): void {
    p.fishing.lordUntil = this.now() + LORD_MS;
    p.fishing.aleUntil = 0;
    p.fishing.beerUntil = 0;
    delete p.fishing.vodkaUntil;
    this.store.markDirty();
  }

  /** Пиво: не поверх эля и пива владыки (они сильнее) и не второе подряд; водку заменяет (действует последнее выпитое). */
  buyFishBeer(p: Profile): 'ok' | 'active' | 'ale' | 'lord' | 'no_tokens' {
    this.refreshFishing(p);
    if ((p.fishing.lordUntil ?? 0) > this.now()) return 'lord';
    if (p.fishing.aleUntil > this.now()) return 'ale';
    if (p.fishing.beerUntil > this.now()) return 'active';
    if (!this.spend(p, BEER_PRICE)) return 'no_tokens';
    p.fishing.beerUntil = this.now() + BEER_MS;
    delete p.fishing.vodkaUntil;
    this.store.markDirty();
    return 'ok';
  }

  /** Эль заменяет пиво и водку (их остаток пропадает), второй подряд — нет, поверх пива владыки — нет. */
  buyFishAle(p: Profile): 'ok' | 'active' | 'lord' | 'no_tokens' {
    this.refreshFishing(p);
    if ((p.fishing.lordUntil ?? 0) > this.now()) return 'lord';
    if (p.fishing.aleUntil > this.now()) return 'active';
    if (!this.spend(p, ALE_PRICE)) return 'no_tokens';
    p.fishing.aleUntil = this.now() + ALE_MS;
    p.fishing.beerUntil = 0;
    delete p.fishing.vodkaUntil;
    this.store.markDirty();
    return 'ok';
  }

  /**
   * Водка рыбацкая (shared/fishshop.ts VODKA): с пивом, элем и пивом владыки не складывается — действует последнее
   * выпитое, остаток прежнего напитка пропадает; вторая подряд — нет, пока действует первая.
   */
  buyFishVodka(p: Profile): 'ok' | 'active' | 'no_tokens' {
    this.refreshFishing(p);
    if ((p.fishing.vodkaUntil ?? 0) > this.now()) return 'active';
    if (!this.spend(p, VODKA_PRICE)) return 'no_tokens';
    p.fishing.vodkaUntil = this.now() + VODKA_MS;
    p.fishing.beerUntil = 0;
    p.fishing.aleUntil = 0;
    delete p.fishing.lordUntil;
    this.store.markDirty();
    return 'ok';
  }

  /** Рюкзак или блесна из лавки: навсегда, по уровню рыбалки; действует лучший купленный. */
  buyFishGear(p: Profile, item: unknown): { state: GearState; name: string } | null {
    const bag = BAGS.find((b) => b.id === item);
    const lure = LURES.find((l) => l.id === item);
    const g = bag ?? lure;
    if (!g) return null;
    const f = p.fishing;
    const state = gearState(bag ? 'bag' : 'lure', g.tier, bag ? f.bagTier : f.lure, fishLevel(f.xp), p.tokens);
    if (state !== 'ok' || !this.spend(p, g.price)) return { state: state === 'ok' ? 'tokens' : state, name: g.name };
    if (bag) f.bagTier = g.tier; else f.lure = g.tier;
    this.store.markDirty();
    this.store.flush();
    return { state: 'ok', name: g.name };
  }

  /** Рыба в рюкзак по цене поимки; null — места нет. */
  bagPut(p: Profile, fish: Omit<BagFish, 'n'>): BagFish | null {
    const f = p.fishing;
    if (f.bag.length >= bagSlots(f)) return null;
    const item: BagFish = { n: f.bagSeq, ...fish };
    f.bagSeq = Math.min(Number.MAX_SAFE_INTEGER, f.bagSeq + 1);
    f.bag.push(item);
    this.store.markDirty();
    return item;
  }

  /** Продать Семёну или Сане одну рыбу (n) или весь улов (n не задан): жетоны по цене поимки, без общего опыта. */
  sellFish(p: Profile, n?: number): { n: number; coins: number } {
    const f = p.fishing;
    const sold = n === undefined ? f.bag : f.bag.filter((x) => x.n === n);
    if (!sold.length) return { n: 0, coins: 0 };
    const coins = bagValue(sold);
    f.bag = n === undefined ? [] : f.bag.filter((x) => x.n !== n);
    if (coins > 0) this.credit(p, coins, 'other');
    p.stats.fsSold += sold.length;
    p.stats.fsEarned += coins;
    this.store.markDirty();
    return { n: sold.length, coins };
  }

  /** Отпустить рыбу из рюкзака: место освобождается, денег нет. */
  releaseFish(p: Profile, n: unknown): boolean {
    const f = p.fishing;
    const before = f.bag.length;
    f.bag = f.bag.filter((x) => x.n !== n);
    if (f.bag.length === before) return false;
    this.store.markDirty();
    return true;
  }

  /** Весь улов — на рулетку: рюкзак пустеет, его цена ждёт остановки колеса (переживает рестарт). */
  reserveRoulette(p: Profile, round: string): { stake: number; fish: number } | null {
    const f = p.fishing;
    if (!round || round.length > 100 || p.rouletteEscrow || !f.bag.length) return null;
    const stake = bagValue(f.bag);
    if (!Number.isSafeInteger(stake) || stake <= 0) return null;
    const fish = f.bag.length;
    f.bag = [];
    p.rouletteEscrow = { round, amount: stake };
    p.stats.rlSpins++;
    p.stats.rlStaked += stake;
    this.store.markDirty();
    this.store.flush();
    return { stake, fish };
  }

  /** Колесо остановилось: выигрыш (0 — улов пропал) жетонами, без общего опыта — его дали при поимке. */
  settleRoulette(pid: number, round: string, payout: number): boolean {
    const p = this.ids.get(pid);
    if (!p || !p.rouletteEscrow || p.rouletteEscrow.round !== round || !Number.isSafeInteger(payout) || payout < 0) return false;
    p.rouletteEscrow = null;
    p.tokens += payout;
    p.stats.rlWon += payout;
    this.store.markDirty();
    this.store.flush();
    return true;
  }

  /** Ставка на крысиных бегах: жетоны уходят в залог до конца забега (переживает рестарт — тогда возвращаются). */
  reserveRat(pid: number, round: string, amount: number): boolean {
    const p = this.ids.get(pid);
    if (!p || !round || round.length > 100 || p.ratEscrow || !Number.isSafeInteger(amount) || amount <= 0 || p.tokens < amount) return false;
    p.tokens -= amount;
    p.ratEscrow = { round, amount };
    this.store.markDirty();
    this.store.flush();
    return true;
  }

  /** Забег кончился: выигрыш (0 — ставка проиграла) жетонами, без общего опыта; по профилю, даже если игрок ушёл. */
  settleRat(pid: number, round: string, payout: number): boolean {
    const p = this.ids.get(pid);
    if (!p || !p.ratEscrow || p.ratEscrow.round !== round || !Number.isSafeInteger(payout) || payout < 0) return false;
    p.ratEscrow = null;
    p.tokens += payout;
    this.store.markDirty();
    this.store.flush();
    return true;
  }

  /** Получение награды обнуляет текущий счётчик, без переноса лишних уловов; повтор не может выдать его снова. */
  claimFishQuest(p: Profile): { ok: true; need: number; reward: number; rod: FishRod } | { ok: false } {
    const f = p.fishing;
    const need = questNeed(f.questsDone);
    if (f.questCaught < need) return { ok: false };
    const oldBest = unlockedRod(f.questsDone);
    f.questCaught = 0;
    f.questsDone++;
    const best = unlockedRod(f.questsDone);
    if (best > oldBest) f.rod = best;
    const reward = need * 5;
    this.credit(p, reward, 'mode');
    p.stats.fsEarned += reward;
    this.store.markDirty();
    return { ok: true, need, reward, rod: f.rod };
  }

  equipFishRod(p: Profile, rod: unknown): boolean {
    if (typeof rod !== 'number' || !Number.isInteger(rod) || rod < 0 || rod > unlockedRod(p.fishing.questsDone)) return false;
    p.fishing.rod = rod as FishRod;
    this.store.markDirty();
    return true;
  }

  buy(p: Profile, itemId: unknown): 'ok' | 'owned' | 'not_for_sale' | 'no_tokens' | 'unknown' {
    const item = typeof itemId === 'string' ? itemById(itemId) : undefined;
    if (!item) return 'unknown';
    if (item.tier === 'free' || p.owned.includes(item.id)) return 'owned';
    const price = itemPrice(item.tier);
    if (price === null) return 'not_for_sale';
    if (p.tokens < price) return 'no_tokens';
    p.tokens -= price;
    p.owned.push(item.id);
    this.store.markDirty();
    return 'ok';
  }

  /** Выдать вещь (джекпот). false — уже есть. */
  grant(p: Profile, itemId: string): boolean {
    if (p.owned.includes(itemId)) return false;
    p.owned.push(itemId);
    this.store.markDirty();
    return true;
  }

  /** Выдать набор одной синхронной записью; повтор не добавляет вещей и не меняет экипировку. */
  grantSet(p: Profile, itemIds: readonly string[]): 'granted' | 'already' | 'unavailable' {
    if (this.ids.get(p.id) !== p) return 'unavailable';
    const before = p.owned;
    const missing = [...new Set(itemIds)].filter((id) => !before.includes(id));
    if (!missing.length) return 'already';
    const revision = this.store.primaryRevision;
    p.owned = [...before, ...missing];
    try {
      this.store.markDirty();
      this.store.flush();
    } catch {
      // Отказ копии после rename основного файла не отменяет уже сохранённую выдачу.
      if (this.store.primaryRevision !== revision) return 'granted';
      p.owned = before;
      return 'unavailable';
    }
    return 'granted';
  }

  setOutfit(p: Profile, raw: unknown): Outfit {
    p.outfit = sanitizeOutfit(raw, p.owned);
    this.store.markDirty();
    return p.outfit;
  }

  touch(p: Profile): void {
    p.lastSeen = this.now();
    this.store.markDirty();
  }

  honor(): Honor {
    const all = this.store.state.profiles;
    const top = (score: (p: Profile) => number): HonorRow[] =>
      all
        .filter((p) => score(p) > 0)
        .sort((a, b) => score(b) - score(a) || a.id - b.id)
        .slice(0, 5)
        .map((p) => ({ nick: p.nick, level: p.level, n: score(p) }));
    return { rich: top((p) => p.tokens), wins: top((p) => p.stats.pbWins), lastJackpot: this.store.state.lastJackpot };
  }

  /**
   * «Последние входы»: сначала те, кто в игре (online), потом остальные — кто был позже, тот выше. lastSeen
   * обновляется при входе и выходе, так что у ушедшего это время ухода.
   */
  recent(online: (pid: number) => boolean): RecentRow[] {
    const now = this.now();
    return this.store.state.profiles
      .map((p) => ({ p, on: online(p.id) }))
      .sort((a, b) => Number(b.on) - Number(a.on) || b.p.lastSeen - a.p.lastSeen || a.p.id - b.p.id)
      .slice(0, RECENT_ROWS)
      .map(({ p, on }) => ({ nick: p.nick, ago: on ? 0 : Math.max(0, Math.round((now - p.lastSeen) / 1000)), on }));
  }
}
