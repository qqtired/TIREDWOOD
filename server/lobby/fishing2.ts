// Рыбалка 2.0 с мостков к маяку (флаг сервера FISH2): заброс, пробы и поклёвка — как в старой рыбалке
// (server/lobby/fishing.ts); что клюёт — по погоде (дождевые виды — только в дождь), 3 % — сундук (в каждом пятом ещё
// и пиво подводного владыки — выпивается сразу, а в 3 % сундуков вместо суммы «Сокровища Посейдона»: 3000 🪙, строка в
// чат и крупный тост всем на сервере), хлам — реже с каждым уровнем рыбалки; подсёк вовремя —
// шкала вываживания (shared/fishreel.ts). Клиент играет её у себя и шлёт нажатия, сервер повторяет вываживание своим
// сидом и засчитывает улов, только если его повтор дошёл до 100 %. Улов: рыба — в рюкзак по цене поимки (продаётся
// Семёну или Сане, server/lobby/fishnpc.ts), сундук и бонус за новый вид — сразу жетонами; коллекция (альбом), опыт
// рыбалки и общий опыт (по цене рыбы), счётчики доски рекордов, награды лестницы коллекции (server/fishstyle.ts).
// Полный рюкзак — заброс не уходит. Эпическая и выше сорвалась после 3 с борьбы — утешительный опыт (fishLostXp).
// В дождь опыт рыбалки ×1,15 (и за поимку, и утешительный). Сезон рыбалки (server/lobby/fishseason.ts) — особый дождь:
// клюют виды дождя, эпик, лег, мифик и божественный кальмар ×3 от базы; опыт — как в дождь.
//
// Подделать трудно: тики нажатий — целые, по возрастанию, не раньше уже подтверждённого; клиент не может досчитать
// дальше, чем прошло настоящего времени с начала вываживания (+0,5 с), — ускорить бой нельзя; отстал больше чем на 4 с
// (молчит) — рыба сорвалась; кривое сообщение — сорвалась.
import { TICK_RATE } from '../../shared/constants.ts';
import {
  CAST_TICKS, FE_BITE, FE_CAST, FE_DONE, FE_EARLY, FE_HOOK, FE_LAND, FE_LOST, FE_MISS, FE_NIBBLE, FE_OFF, FISH, FP_BITE, FP_CAST, FP_HOLD, FP_IDLE,
  FP_REEL, FP_WAIT, albumNews, hookTicks, planBite,
} from '../../shared/fishing.ts';
import {
  BAG_ALE, BAG_BARKAS, BAG_BEER, BAG_LORD, BAG_RAIN, bagSlots, emptyFishProgress, fishCastMods, fishCatchXp, fishLostXp, questNeed, type FishCastMods,
} from '../../shared/fishprogress.ts';
import { spotZone } from '../../shared/fishplaces.ts';
import { LORD_CHEST_CHANCE } from '../../shared/fishshop.ts';
import { REEL_MAX_TICKS, reelRun, reelStart, type Reel } from '../../shared/fishreel.ts';
import {
  ANNOUNCE_TIER, CHEST_ANNOUNCE, CHEST_JACKPOT, NEW_BONUS2, RULE, T_CHEST, T_DIVINE, T_JUNK, T_MYTH, basePrice, collectionCount, fishPrice2, fmtCatch,
  isCollected, isPoseidon, reelStyleFor, rollCatch2, type Hooked,
} from '../../shared/fishrules.ts';
import type { FishBoardView, FishSpotSnapshot } from '../../shared/messages.ts';
import { FISH_SPOTS } from '../../shared/maps/lobby.ts';
import type { Profiles } from '../profiles.ts';
import type { Store } from '../store.ts';
import type { FishingHost } from './fishing.ts';
import { FishBoard, countCatch } from './fishtop.ts';
import { grantLadder, ladderAnnounce } from '../fishstyle.ts';

/** Рыба в руках (для остальных — в руках у рыбака): столько тиков, потом удочка снова пустая; заброс — сразу */
export const HOLD2_TICKS = 3 * TICK_RATE;
/** Клиент может обогнать настоящее время с начала вываживания не больше чем на столько тиков (разброс часов) */
export const REEL_AHEAD = 30;
/** Отстал от настоящего времени больше чем на столько тиков (молчит, вкладка спит) — сорвалась */
export const REEL_LAG = 4 * TICK_RATE;
/** Переключений в одном сообщении не больше */
export const REEL_BATCH = 120;
/** Сообщений за одно вываживание не больше (клиент шлёт до 20 в секунду) */
export const REEL_MSGS = REEL_MAX_TICKS / 2;
/** Подсказка, когда рюкзак полон */
export const BAG_FULL_TEXT = 'Рюкзак полон — продай улов Семёну или Сане';

/** Флаг сервера FISH2: 1 — рыбалка 2.0, иначе старая (до включения по умолчанию) */
export function fish2Enabled(v: string | undefined): boolean {
  return v === '1';
}

/** Что ещё нужно рыбалке 2.0 от комнаты */
export interface FishingHost2 extends FishingHost {
  /** Идёт ли сейчас дождь */
  rain(): boolean;
  /** Идёт ли сейчас сезон рыбалки (особый дождь); нет метода — сезона нет */
  season?(): boolean;
  /** Доска рекордов поменялась — разослать всем на набережной */
  top(top: FishBoardView): void;
  /** Наряд рыбака поменялся (снасти из наград надеты сами) — разослать всем на набережной */
  outfit?(slot: number): void;
  /** Крупный тост всем игрокам сервера, в любой комнате («Сокровища Посейдона»); нет метода — только строка в чат */
  shout?(text: string): void;
}

interface Spot {
  slot: number;
  phase: number;
  /** Конец фазы (тик): приземление поплавка, конец окна подсечки, конец «в руках» */
  until: number;
  x: number;
  z: number;
  nibbles: number[];
  biteAt: number;
  n: number;
  nibbled: boolean;
  /** На крючке или в руках: вид (−1 — ничего), граммы, что в сундуке */
  sp: number;
  g: number;
  coins: number;
  /** Вываживание: повтор сервера, все переключения кнопки, сколько из них позади, до какого тика досчитал клиент */
  reel: Reel | null;
  toggles: number[];
  k: number;
  ack: number;
  /** Когда началось (мс) и сколько сообщений пришло */
  startMs: number;
  msgs: number;
  /** Уровень/удочка/бафф заморожены в момент заброса — одинаковы для roll, replay и продажи. */
  mods: FishCastMods;
}

function emptySpot(): Spot {
  return {
    slot: 0, phase: FP_IDLE, until: 0, x: 0, z: 0, nibbles: [], biteAt: 0, n: 0, nibbled: false, sp: -1, g: 0, coins: 0, reel: null, toggles: [],
    k: 0, ack: 0, startMs: 0, msgs: 0, mods: fishCastMods(emptyFishProgress(), 0),
  };
}

export class FishingHall2 {
  /** Случайное 0…1 и что клюнуло (в тестах подменяются) */
  rand: () => number;
  roll: (rain: boolean, rand: () => number, mods?: Readonly<FishCastMods>, season?: boolean) => Hooked = rollCatch2;
  /** Шанс пива подводного владыки в сундуке (в тестах и в разработке подменяется) */
  lordChance = LORD_CHEST_CHANCE;
  readonly board: FishBoard;
  private readonly spots: Spot[] = FISH_SPOTS.map(emptySpot);
  private readonly host: FishingHost2;
  private readonly profiles: Profiles;
  private readonly store: Store;
  private readonly now: () => number;

  constructor(host: FishingHost2, profiles: Profiles, store: Store, now: () => number = Date.now, rand: () => number = Math.random) {
    this.host = host;
    this.profiles = profiles;
    this.store = store;
    this.now = now;
    this.rand = rand;
    this.board = new FishBoard(store, now);
  }

  occupant(spot: number): number {
    return this.spots[spot]?.slot ?? 0;
  }

  phase(spot: number): number {
    return this.spots[spot]?.phase ?? FP_IDLE;
  }

  views(): FishSpotSnapshot[] {
    return this.spots.map((s) => ({ ph: s.slot ? s.phase : FP_IDLE, x: s.x, z: s.z, sp: s.phase >= FP_REEL ? s.sp : -1, g: s.phase >= FP_REEL ? s.g : 0,
      ...(s.slot && s.phase !== FP_IDLE ? { mods: { ...s.mods } } : {}) }));
  }

  sit(spot: number, slot: number): void {
    const s = this.spots[spot];
    if (!s) return;
    Object.assign(s, emptySpot());
    s.slot = slot;
  }

  /** Ушёл с места: на шкале — рыба сорвалась (улов уже засчитан, если был). */
  stand(spot: number, slot: number): void {
    const s = this.spots[spot];
    if (!s || s.slot !== slot) return;
    if (s.phase === FP_BITE || s.phase === FP_REEL) this.countLost(s);
    Object.assign(s, emptySpot());
    this.host.event(['fish', FE_OFF, spot, 0, 0]);
  }

  /** Забросить (и из «в руках» — сразу), подсечь (n — последнее событие поплавка, которое рыбак видел). */
  act(spot: number, slot: number, a: unknown, n: unknown, tick: number): void {
    const s = this.spots[spot];
    if (!s || s.slot !== slot) return;
    if (a === 'cast') {
      if (s.phase === FP_HOLD) this.done(s, spot);
      if (s.phase === FP_IDLE) this.cast(s, spot, tick);
    } else if (a === 'hook') {
      this.hook(s, spot, n);
    }
  }

  /** Нажатия на шкале: i — номер первого переключения в k, k — тики переключений, u — до какого тика досчитал клиент. */
  reel(spot: number, slot: number, i: unknown, k: unknown, u: unknown, d: unknown, tick: number): void {
    const s = this.spots[spot];
    if (!s || s.slot !== slot || s.phase !== FP_REEL || !s.reel) return;
    if (++s.msgs > REEL_MSGS || !Array.isArray(k) || k.length > REEL_BATCH || i !== s.toggles.length || !Number.isInteger(u)) {
      this.lose(s, spot);
      return;
    }
    const upTo = u as number;
    const elapsed = Math.floor(((this.now() - s.startMs) * TICK_RATE) / 1000);
    if (upTo < s.ack || upTo > elapsed + REEL_AHEAD) {
      this.lose(s, spot);
      return;
    }
    let last = s.toggles.length > 0 ? s.toggles[s.toggles.length - 1] : -1;
    for (const t of k as unknown[]) {
      if (!Number.isInteger(t) || (t as number) < s.ack || (t as number) <= last || (t as number) > upTo) {
        this.lose(s, spot);
        return;
      }
      last = t as number;
    }
    for (const t of k as number[]) s.toggles.push(t);
    s.ack = upTo;
    s.k = reelRun(s.reel, s.toggles, upTo, s.k);
    if (s.reel.done === 1) this.land(s, spot, tick);
    else if (s.reel.done === -1 || d === 1) this.lose(s, spot);
  }

  step(tick: number): void {
    this.spots.forEach((s, spot) => {
      if (s.slot === 0) return;
      switch (s.phase) {
        case FP_CAST:
          if (tick >= s.until) s.phase = FP_WAIT;
          break;
        case FP_WAIT:
          while (s.nibbles.length > 0 && tick >= s.nibbles[0]) {
            s.nibbles.shift();
            s.nibbled = true;
            this.host.event(['fish', FE_NIBBLE, spot, ++s.n, 0]);
          }
          if (tick >= s.biteAt) this.bite(s, spot, tick);
          break;
        case FP_BITE:
          if (tick >= s.until) {
            this.countLost(s);
            s.phase = FP_IDLE;
            s.sp = -1;
            this.host.event(['fish', FE_MISS, spot, 0, 0]);
          }
          break;
        case FP_REEL: {
          // клиент отстал от настоящего времени (молчит) — сорвалась
          const elapsed = Math.floor(((this.now() - s.startMs) * TICK_RATE) / 1000);
          if (elapsed - s.ack > REEL_LAG || elapsed > REEL_MAX_TICKS + REEL_LAG) this.lose(s, spot);
          break;
        }
        case FP_HOLD:
          if (tick >= s.until) this.done(s, spot);
          break;
      }
    });
    if (tick % TICK_RATE === 0) {
      const top = this.board.check();
      if (top) this.host.top(top);
    }
  }

  /** Сменили ник — на доске новый. */
  renamed(): void {
    this.board.touch();
  }

  /** Сезон рыбалки сейчас */
  private season(): boolean {
    return this.host.season?.() ?? false;
  }

  /** Дождь для рыбы: настоящий или сезон (он сам по себе дождь) */
  private wet(): boolean {
    return this.host.rain() || this.season();
  }

  private cast(s: Spot, spot: number, tick: number): void {
    const prof = this.host.who(s.slot)?.profile;
    if (!prof) return;
    if (prof.fishing.bag.length >= bagSlots(prof.fishing)) {
      this.host.toast(s.slot, BAG_FULL_TEXT);
      return;
    }
    this.profiles.refreshFishing(prof);
    s.mods = Object.freeze(fishCastMods(prof.fishing, this.now(), spotZone(spot)));
    prof.stats.fsCasts++;
    this.store.markDirty();
    this.host.changed(s.slot);
    const at = FISH_SPOTS[spot];
    const fx = -Math.sin(at.yaw);
    const fz = -Math.cos(at.yaw);
    const d = 6.5 + this.rand() * 3;
    const side = (this.rand() - 0.5) * 2.4;
    s.x = round2(at.x + fx * d - fz * side);
    s.z = round2(at.z + fz * d + fx * side);
    s.phase = FP_CAST;
    s.until = tick + CAST_TICKS;
    const plan = planBite(this.rand);
    s.nibbles = plan.nibbles.map((t) => s.until + Math.max(1, Math.round(t / s.mods.biteSpeed)));
    s.biteAt = s.until + Math.max(1, Math.round(plan.bite / s.mods.biteSpeed));
    s.n = 0;
    s.nibbled = false;
    s.sp = -1;
    s.g = 0;
    s.coins = 0;
    this.host.event(['fish', FE_CAST, spot, s.x, s.z]);
  }

  /** Поклёвка: что клюнуло — решено сейчас, по погоде сейчас (и сезону); окно подсечки — по категории и пингу. */
  private bite(s: Spot, spot: number, tick: number): void {
    const season = this.season();
    const c = this.roll(this.host.rain() || season, this.rand, s.mods, season);
    const prof = this.host.who(s.slot)?.profile;
    if (prof) {
      prof.stats.fsBites++;
      this.store.markDirty();
      this.host.changed(s.slot);
    }
    s.sp = c.sp;
    s.g = c.g;
    s.coins = c.coins;
    s.n++;
    s.phase = FP_BITE;
    s.until = tick + hookTicks(RULE[c.sp]?.tier ?? 0, this.host.who(s.slot)?.ping ?? 0);
    this.host.event(['fish', FE_BITE, spot, s.n, 0]);
  }

  /** Подсечка вовремя — шкала: сид — рыбаку, повтор — у сервера. */
  private hook(s: Spot, spot: number, n: unknown): void {
    if (s.phase === FP_WAIT || (s.phase === FP_BITE && n !== s.n)) {
      if (s.phase === FP_BITE) this.countLost(s);
      this.host.event(['fish', FE_EARLY, spot, s.nibbled ? 1 : 0, 0]);
      s.phase = FP_IDLE;
      s.sp = -1;
      return;
    }
    if (s.phase !== FP_BITE) return;
    const rule = RULE[s.sp];
    if (!rule) return;
    const seed = Math.floor(this.rand() * 0x1_0000_0000) | 0;
    s.phase = FP_REEL;
    s.reel = reelStart(reelStyleFor(s.sp, s.mods), seed);
    s.toggles = [];
    s.k = 0;
    s.ack = 0;
    s.msgs = 0;
    s.startMs = this.now();
    this.host.send(s.slot, { t: 'fishReel', spot, sp: s.sp, seed, mods: { ...s.mods } });
    this.host.event(['fish', FE_HOOK, spot, s.sp, s.g]);
  }

  private lose(s: Spot, spot: number): void {
    this.countLost(s);
    // эпическая и выше сорвалась после 3 с борьбы — утешительный опыт рыбалки (вид не раскрываем, только категорию)
    const xp = fishLostXp(s.sp, s.ack, s.mods, this.wet());
    const prof = xp > 0 ? this.host.who(s.slot)?.profile : undefined;
    if (prof) {
      prof.fishing.xp = Math.min(Number.MAX_SAFE_INTEGER, prof.fishing.xp + xp);
      this.store.markDirty();
      this.host.send(s.slot, { t: 'fishLost', tier: RULE[s.sp]?.tier ?? 0, xp });
      this.host.changed(s.slot);
    }
    s.phase = FP_IDLE;
    s.sp = -1;
    s.g = 0;
    s.coins = 0;
    s.reel = null;
    s.toggles = [];
    this.host.event(['fish', FE_LOST, spot, 0, 0]);
  }

  private countLost(s: Spot): void {
    if (!isCollected(s.sp)) return;
    const prof = this.host.who(s.slot)?.profile;
    if (!prof) return;
    prof.stats.fsLost++;
    this.store.markDirty();
    this.host.changed(s.slot);
  }

  /** «В руках» кончилось (или снова забросил) — удочка пустая. */
  private done(s: Spot, spot: number): void {
    this.host.event(['fish', FE_DONE, spot, 1, 0]);
    s.phase = FP_IDLE;
    s.sp = -1;
    s.g = 0;
    s.coins = 0;
  }

  /** Повтор дошёл до 100 %: рыба — в рюкзак и коллекцию, опыт, счётчики; сундук и бонус — жетонами; награды лестницы, объявление. */
  private land(s: Spot, spot: number, tick: number): void {
    const perfect = s.reel?.perfect ?? false;
    s.phase = FP_HOLD;
    s.until = tick + HOLD2_TICKS;
    s.reel = null;
    s.toggles = [];
    this.host.event(['fish', FE_LAND, spot, s.sp, s.g]);
    const w = this.host.who(s.slot);
    const rule = RULE[s.sp];
    if (!w || !rule) return;
    const prof = w.profile;
    const f = FISH[s.sp];
    const fish = isCollected(s.sp);
    const news = albumNews(prof.album, s.sp, s.g);
    const best = prof.album[f.id]?.[0] ?? 0;
    const e = prof.album[f.id];
    prof.album[f.id] = [Math.max(e?.[0] ?? 0, s.g), (e?.[1] ?? 0) + 1];
    const price = fishPrice2(s.sp, s.g, s.coins, s.mods);
    const bonus = fish && news.fresh ? NEW_BONUS2[rule.tier] : 0;
    const st = prof.stats;
    st.fsCaught++;
    let xp = 0;
    let bagFull = false;
    const m = (s.mods.zone === 'barkas' ? BAG_BARKAS : 0) | (rule.rain ? BAG_RAIN : 0) | (s.mods.drink === 1 ? BAG_BEER : 0) | (s.mods.drink === 2 ? BAG_ALE : 0)
      | (s.mods.drink === 3 ? BAG_LORD : 0);
    let lord = false;
    if (fish) {
      // рыба — в рюкзак по цене поимки; общий опыт — сейчас (по цене), жетоны — при продаже
      const put = this.profiles.bagPut(prof, { f: f.id, g: s.g, p: price, m });
      bagFull = !put;
      if (put) this.profiles.modeXp(prof, price);
      st.fsMaxGrams = Math.max(st.fsMaxGrams, s.g);
      xp = fishCatchXp(s.sp, perfect, s.mods, this.wet());
      prof.fishing.xp = Math.min(Number.MAX_SAFE_INTEGER, prof.fishing.xp + xp);
      prof.fishing.questCaught = Math.min(questNeed(prof.fishing.questsDone), prof.fishing.questCaught + 1);
      countCatch(prof, s.g, this.now());
      this.board.record(prof, s.sp, s.g);
    } else if (rule.tier === T_CHEST) {
      st.fsChests++;
      this.profiles.credit(prof, price, 'mode');
      st.fsEarned += price;
      // в каждом пятом сундуке — пиво подводного владыки: выпивается сразу (сильнее пива и эля, заменяет их)
      lord = this.rand() < this.lordChance;
      if (lord) this.profiles.drinkFishLord(prof);
    }
    if (bonus > 0) {
      this.profiles.credit(prof, bonus, 'mode');
      st.fsEarned += bonus;
    }
    const got = collectionCount(prof.album);
    // награды лестницы коллекции (server/fishstyle.ts): всё положенное по числу видов; full — выдан финал
    const ladder = fish ? grantLadder(this.profiles, prof) : null;
    const full = ladder?.master ?? false;
    this.store.markDirty();
    this.host.send(s.slot, {
      t: 'fishLand', sp: s.sp, g: s.g, price, coins: s.coins, bonus, fresh: news.fresh, record: news.record, best, got, full,
      ...(fish ? { base: basePrice(s.sp, s.g), m, xp, perfect, bag: prof.fishing.bag.length, cap: bagSlots(prof.fishing), ...(bagFull ? { bagFull } : {}) } : {}),
      ...(ladder?.items.length ? { rw: ladder.items } : {}),
      ...(lord ? { lord: true } : {}),
    });
    this.host.changed(s.slot);
    if (ladder?.outfit) this.host.outfit?.(s.slot);
    this.announce(w.nick, s, rule.tier, rule.rain, lord);
    for (const line of ladder ? ladderAnnounce(w.nick, ladder) : []) this.host.announce(line);
    // финал: фанфары и золотые искры у рыбака — слышат и видят все рядом
    if (full) this.host.event(['fishMaster', s.slot]);
  }

  private announce(nick: string, s: Spot, tier: number, rain: boolean, lord = false): void {
    const f = FISH[s.sp];
    if (tier === T_CHEST) {
      if (isPoseidon(s.coins)) {
        // клад Посейдона: строка в общий чат и крупный тост — всем на сервере, где бы они ни были
        this.host.announce(`🔱 ${nick} нашёл Сокровища Посейдона! ${s.coins} 🪙${lord ? ' и пиво подводного владыки' : ''}`);
        this.host.shout?.(`🔱 ${nick} нашёл Сокровища Посейдона! ${s.coins} 🪙`);
      } else if (lord) this.host.announce(`🔱 ${nick} вылавливает сундук: ${s.coins} 🪙 и пиво подводного владыки!`);
      else if (s.coins >= CHEST_ANNOUNCE) this.host.announce(`💰 ${nick} вылавливает сундук${s.coins >= CHEST_JACKPOT ? ' с джекпотом' : ''}: ${s.coins} 🪙!`);
      return;
    }
    if (tier === T_JUNK || tier < ANNOUNCE_TIER) return;
    const sea = s.mods.zone === 'barkas';
    if (tier === T_DIVINE) {
      // божественная: отдельная строка на весь пирс — царь морей
      this.host.announce(`🦑 ${nick} вытаскивает ${f.acc} на ${fmtCatch(s.g)}${sea ? ' в открытом море' : ''}! Божественный улов — сам царь морей!`);
      return;
    }
    const mark = tier === T_MYTH ? '🦈' : rain ? '🌧' : sea ? '⚓' : '🎣';
    const what = tier === T_MYTH ? ' Мифическая рыба!' : '';
    this.host.announce(`${mark} ${nick} вытаскивает ${f.acc} на ${fmtCatch(s.g)}${sea ? ' в открытом море' : ''}!${what}`);
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
