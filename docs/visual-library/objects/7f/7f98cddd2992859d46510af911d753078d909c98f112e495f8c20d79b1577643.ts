// Комната «гонка» для хаба: одна на процесс. Хаб открывает её (open), переводит туда всех из круга «Старт»
// и запускает (launch). Итоги людям и «всех обратно» уходят наверх через хуки.
import { TICK_RATE } from '../../shared/constants.ts';
import { RC_LAPS, RC_MAX_KARTS, RC_RESULTS } from '../../shared/kart.ts';
import { RC_GRID } from '../../shared/kart.ts';
import { DEFAULT_TRACK, type RaceTrackId } from '../../shared/racecourse.ts';
import type { RcReward } from '../../shared/economy.ts';
import type { ClientMsg, KartStatus, RaceResultRow } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import type { Input } from '../../shared/sim.ts';
import type { Client, Room } from '../hub.ts';
import type { Profile } from '../store.ts';
import { Race, type Kart, type RaceOptions } from './race.ts';

export interface RaceRoomHooks {
  outfitOf(p: Profile): Outfit;
  /** Итог гонки человеку (reward null — не доехал) */
  result(c: Client, row: RaceResultRow, reward: RcReward | null): void;
  /** Итоги показаны — этих вернуть на набережную */
  over(clients: Client[]): void;
  announce(text: string): void;
}

export class RaceRoom implements Room {
  readonly kind = 'race' as const;
  race: Race | null = null;
  private readonly hooks: RaceRoomHooks;
  private readonly opts: RaceOptions;
  private readonly byClient = new Map<Client, Kart>();
  private readonly byKart = new Map<Kart, Client>();

  constructor(hooks: RaceRoomHooks, opts: RaceOptions = {}) {
    this.hooks = hooks;
    this.opts = opts;
  }

  /** Гонки нет — можно собирать новую */
  get idle(): boolean {
    return !this.race || this.race.closed;
  }

  get humans(): number {
    return this.byClient.size;
  }

  get tick(): number {
    return this.race?.tick ?? 0;
  }

  hasSpace(): boolean {
    return !!this.race && !this.race.started && !this.race.closed && this.race.karts.size < RC_MAX_KARTS;
  }

  /** Ожидание загрузки (server/readygate.ts): решётка стоит, пока все не загрузились */
  get prestart(): { phaseEnd: number } | null { const r = this.race; return r && r.started && !r.closed && r.phase === RC_GRID ? r : null; }

  /** Новая гонка: принимает людей до launch(). */
  open(track: RaceTrackId = this.opts.track ?? DEFAULT_TRACK): void {
    this.byClient.clear();
    this.byKart.clear();
    this.race = new Race(
      {
        result: (k, row, reward) => {
          const c = this.byKart.get(k);
          if (c) this.hooks.result(c, row, reward);
        },
        over: () => this.hooks.over([...this.byClient.keys()]),
        announce: (text) => this.hooks.announce(text),
      },
      { ...this.opts, track },
    );
  }

  /** Старт. Никто так и не сел (все отвалились по дороге) — гонку закрываем, круг снова свободен. */
  launch(): void {
    if (!this.race) return;
    if (this.byClient.size === 0) this.race.closed = true;
    else this.race.start();
  }

  /** Табло у гаража: гонка или итоги, сколько секунд до конца фазы, кто едет. null — гонки нет. */
  status(): KartStatus | null {
    const r = this.race;
    if (!r || r.closed) return null;
    const st = r.status();
    return {
      track: r.trackId,
      phase: r.phase === RC_RESULTS ? 'results' : 'race',
      left: Math.max(0, Math.ceil((r.phaseEnd - r.tick) / TICK_RATE)),
      n: st.names.length,
      names: st.names,
      lap: st.lap,
      laps: RC_LAPS,
      karts: r.board(),
    };
  }

  /** Табло: где карты (null — гонка не идёт) */
  positions(): number[] | null {
    const r = this.race;
    return r && r.started && !r.closed ? r.positions() : null;
  }

  /** Идёт гонка — за неё можно болеть */
  get cheerable(): boolean {
    const r = this.race;
    return !!r && r.started && !r.closed && r.phase !== RC_RESULTS;
  }

  /** Болеют с набережной: false — гонки нет или только что болели */
  cheer(nick: string): boolean {
    return this.cheerable && this.race!.cheer(nick);
  }

  join(c: Client): boolean {
    const prof = c.profile;
    if (!prof || !this.race || !this.hasSpace() || this.byClient.has(c)) return false;
    const k = this.race.addHuman({ pid: prof.id, nick: prof.nick, level: prof.level, outfit: this.hooks.outfitOf(prof) }, c.sink);
    if (!k) return false;
    this.byClient.set(c, k);
    this.byKart.set(k, c);
    return true;
  }

  leave(c: Client): void {
    const k = this.byClient.get(c);
    if (!k) return;
    // сначала гонка: уже доехавшему она начислит жетоны, а хук найдёт клиента по карту
    this.race?.removeKart(k.id);
    this.byClient.delete(c);
    this.byKart.delete(k);
  }

  /** Колпак дурака надели или сняли — новый наряд уйдёт в ближайшем списке картов. */
  outfitChanged(c: Client): void {
    const k = this.byClient.get(c);
    if (!k || !c.profile) return;
    k.level = c.profile.level;
    k.name = c.profile.nick;
    k.outfit = this.hooks.outfitOf(c.profile);
    this.race?.touchRoster();
  }

  kartOf(c: Client): Kart | undefined {
    return this.byClient.get(c);
  }

  /** Common room actor lookup used by public voice presence. */
  playerOf(c: Client): Kart | undefined {
    return this.kartOf(c);
  }

  onInputs(c: Client, inputs: Input[], count: number): void {
    const k = this.byClient.get(c);
    if (k && this.race) this.race.onInputs(k, inputs, count);
  }

  onMessage(_c: Client, _msg: ClientMsg): void {}

  step(): void {
    if (!this.idle) this.race!.step();
  }
}
