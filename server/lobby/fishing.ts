// Рыбалка с мостков к маяку: кто на каком месте, заброс, пробы и поклёвка, подсечка, улов — в альбом или на продажу.
// Сроки и что попалось решает сервер. Подсечка засчитывается, если пришла в окно после поклёвки (окно — с поправкой
// на пинг рыбака) и рыбак к этому времени уже видел поклёвку, а не дёрнул на пробу: с подсечкой клиент шлёт номер
// последнего события поплавка, которое ему пришло.
import {
  ANNOUNCE_FROM, CAST_TICKS, FE_BITE, FE_CAST, FE_DONE, FE_EARLY, FE_HOOK, FE_LAND, FE_MISS, FE_NIBBLE, FE_OFF, FISH, FP_BITE, FP_CAST,
  FP_HOLD, FP_IDLE, FP_REEL, FP_WAIT, GOLDFISH, HOLD_TICKS, NEW_BONUS, R_JUNK, R_LEGEND, albumNews, fishPrice, fmtWeight, hookTicks,
  planBite, reelTicks, rollCatch, type FishSpotView,
} from '../../shared/fishing.ts';
import { FISH_SPOTS } from '../../shared/maps/lobby.ts';
import type { LobbyEvent, ServerMsg } from '../../shared/messages.ts';
import type { Profiles } from '../profiles.ts';
import type { Profile, Store } from '../store.ts';

/** Что комната даёт рыбалке */
export interface FishingHost {
  /** Событие набережной: уходит всем со снимком */
  event(e: LobbyEvent): void;
  /** Рыбак по номеру на набережной: профиль, ник, пинг (мс); null — его уже нет */
  who(slot: number): { profile: Profile; nick: string; ping: number } | null;
  send(slot: number, msg: ServerMsg): void;
  toast(slot: number, text: string): void;
  /** Жетоны и альбом рыбака поменялись — разослать ему */
  changed(slot: number): void;
  announce(text: string): void;
}

interface Spot {
  /** Кто рыбачит (номер на набережной), 0 — свободно */
  slot: number;
  phase: number;
  /** Конец фазы (тик): приземление поплавка, конец окна подсечки, вываживания, ожидания выбора */
  until: number;
  /** Куда упал поплавок */
  x: number;
  z: number;
  /** Тики проб и поклёвки (пробы — по порядку) */
  nibbles: number[];
  biteAt: number;
  /** Номер последнего события поплавка с заброса: пробы и поклёвка считаются по порядку с 1 */
  n: number;
  nibbled: boolean;
  /** На крючке или в руках: вид (−1 — ничего) и граммы */
  sp: number;
  g: number;
}

function emptySpot(): Spot {
  return { slot: 0, phase: FP_IDLE, until: 0, x: 0, z: 0, nibbles: [], biteAt: 0, n: 0, nibbled: false, sp: -1, g: 0 };
}

export class FishingHall {
  /** Случайное 0…1 и что попалось на поклёвке (в тестах подменяются) */
  rand: () => number;
  roll: (rand: () => number) => { sp: number; g: number } = rollCatch;
  private readonly spots: Spot[] = FISH_SPOTS.map(emptySpot);
  private readonly host: FishingHost;
  private readonly profiles: Profiles;
  private readonly store: Store;

  constructor(host: FishingHost, profiles: Profiles, store: Store, rand: () => number = Math.random) {
    this.host = host;
    this.profiles = profiles;
    this.store = store;
    this.rand = rand;
  }

  /** Кто рыбачит на месте (0 — свободно). */
  occupant(spot: number): number {
    return this.spots[spot]?.slot ?? 0;
  }

  phase(spot: number): number {
    return this.spots[spot]?.phase ?? FP_IDLE;
  }

  /** Места для входящего на набережную: где поплавки, что на крючке и в руках. */
  views(): FishSpotView[] {
    return this.spots.map((s) => ({ ph: s.slot ? s.phase : FP_IDLE, x: s.x, z: s.z, sp: s.phase >= FP_REEL ? s.sp : -1, g: s.phase >= FP_REEL ? s.g : 0 }));
  }

  /** Встал на место с удочкой. */
  sit(spot: number, slot: number): void {
    const s = this.spots[spot];
    if (!s) return;
    Object.assign(s, emptySpot());
    s.slot = slot;
  }

  /** Ушёл с места: рыба в руках — туда, где выгоднее (новый вид или рекорд — в альбом, иначе — продать). */
  stand(spot: number, slot: number): void {
    const s = this.spots[spot];
    if (!s || s.slot !== slot) return;
    if (s.phase === FP_HOLD) this.settle(s, spot, null);
    Object.assign(s, emptySpot());
    this.host.event(['fish', FE_OFF, spot, 0, 0]);
  }

  /** Рыбак жмёт: забросить, подсечь (n — последнее событие поплавка, которое он видел), в альбом, продать. */
  act(spot: number, slot: number, a: unknown, n: unknown, tick: number): void {
    const s = this.spots[spot];
    if (!s || s.slot !== slot) return;
    if (a === 'cast') {
      if (s.phase === FP_IDLE) this.cast(s, spot, tick);
    } else if (a === 'hook') {
      this.hook(s, spot, n, tick);
    } else if (a === 'keep' || a === 'sell') {
      if (s.phase === FP_HOLD) this.settle(s, spot, a === 'keep');
    }
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
            // не успел — рыба ушла, поплавок всплыл
            s.phase = FP_IDLE;
            s.sp = -1;
            this.host.event(['fish', FE_MISS, spot, 0, 0]);
          }
          break;
        case FP_REEL:
          if (tick >= s.until) this.land(s, spot, tick);
          break;
        case FP_HOLD:
          if (tick >= s.until) this.settle(s, spot, null);
          break;
      }
    });
  }

  /** Заброс: поплавок падает в 6,5–9,5 м перед местом (чуть вбок), пробы и поклёвка — по плану от приземления. */
  private cast(s: Spot, spot: number, tick: number): void {
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
    s.nibbles = plan.nibbles.map((t) => s.until + t);
    s.biteAt = s.until + plan.bite;
    s.n = 0;
    s.nibbled = false;
    s.sp = -1;
    s.g = 0;
    this.host.event(['fish', FE_CAST, spot, s.x, s.z]);
  }

  /** Поклёвка: что попалось — решено сейчас; окно подсечки — по редкости и пингу рыбака. */
  private bite(s: Spot, spot: number, tick: number): void {
    const c = this.roll(this.rand);
    s.sp = c.sp;
    s.g = c.g;
    s.n++;
    s.phase = FP_BITE;
    s.until = tick + hookTicks(FISH[c.sp].rarity, this.host.who(s.slot)?.ping ?? 0);
    this.host.event(['fish', FE_BITE, spot, s.n, 0]);
  }

  private hook(s: Spot, spot: number, n: unknown, tick: number): void {
    if (s.phase === FP_WAIT || (s.phase === FP_BITE && n !== s.n)) {
      // рано: поклёвки ещё не было (или рыбак её не видел) — на пробе сорвалась, без проб — просто смотал
      this.host.event(['fish', FE_EARLY, spot, s.nibbled ? 1 : 0, 0]);
      s.phase = FP_IDLE;
      s.sp = -1;
      return;
    }
    if (s.phase !== FP_BITE) return;
    s.phase = FP_REEL;
    s.until = tick + reelTicks(s.g);
    this.host.event(['fish', FE_HOOK, spot, s.sp, s.g]);
  }

  /** Вытащил: рыба в руках, рыбаку — карточка улова; редкий улов — строка в общий чат. */
  private land(s: Spot, spot: number, tick: number): void {
    s.phase = FP_HOLD;
    s.until = tick + HOLD_TICKS;
    this.host.event(['fish', FE_LAND, spot, s.sp, s.g]);
    const w = this.host.who(s.slot);
    if (!w) return;
    const f = FISH[s.sp];
    const prof = w.profile;
    prof.stats.fsCaught++;
    this.store.markDirty();
    const news = albumNews(prof.album, s.sp, s.g);
    const best = prof.album[f.id]?.[0] ?? 0;
    this.host.send(s.slot, { t: 'fishCatch', sp: s.sp, g: s.g, price: fishPrice(s.sp, s.g), fresh: news.fresh, record: news.record, best });
    if (s.sp === GOLDFISH) this.host.announce(`✨🐟 ${w.nick} вытаскивает золотую рыбку! Можно загадать желание`);
    else if (f.rarity >= ANNOUNCE_FROM && f.rarity <= R_LEGEND) this.host.announce(`🎣 ${w.nick} вытаскивает ${f.acc} на ${fmtWeight(s.g)}!`);
  }

  /** keep: true — в альбом, false — продать (отпустить, выбросить), null — само: новый вид или рекорд — в альбом. */
  private settle(s: Spot, spot: number, keep: boolean | null): void {
    const f = FISH[s.sp];
    const w = this.host.who(s.slot);
    let kept = keep === true;
    if (f && w) {
      const prof = w.profile;
      const news = albumNews(prof.album, s.sp, s.g);
      kept = keep ?? (news.fresh || news.record);
      const wt = fmtWeight(s.g);
      if (kept) {
        const e = prof.album[f.id];
        prof.album[f.id] = [Math.max(e?.[0] ?? 0, s.g), (e?.[1] ?? 0) + 1];
        const bonus = news.fresh ? NEW_BONUS[f.rarity] : 0;
        if (bonus > 0) this.profiles.credit(prof, bonus, 'mode');
        const what = f.rarity === R_JUNK ? 'Новая находка' : 'Новый вид';
        if (news.fresh) this.host.toast(s.slot, `📖 ${what} в альбоме: ${f.name}, ${wt} · +${bonus} 🪙`);
        else if (news.record) this.host.toast(s.slot, `🏆 Новый рекорд: ${f.name}, ${wt}`);
        else this.host.toast(s.slot, `📖 ${f.name} — в альбоме (рекорд — ${fmtWeight(e![0])})`);
      } else {
        const price = fishPrice(s.sp, s.g);
        if (price > 0) {
          this.profiles.credit(prof, price, 'mode');
          prof.stats.fsSold++;
        }
        if (s.sp === GOLDFISH) this.host.toast(s.slot, `✨ Золотая рыбка уплыла и исполнила желание: +${price} 🪙`);
        else if (price > 0) this.host.toast(s.slot, `Продано: ${f.name}, ${wt} · +${price} 🪙`);
        else this.host.toast(s.slot, `${f.name} — в урну 🗑`);
      }
      this.store.markDirty();
      this.host.changed(s.slot);
    }
    this.host.event(['fish', FE_DONE, spot, kept ? 1 : 0, 0]);
    s.phase = FP_IDLE;
    s.sp = -1;
    s.g = 0;
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
