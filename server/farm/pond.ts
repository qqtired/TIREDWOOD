// Шесть мест пруда: адаптер общей рыбалки 2.0, профиль и торговля прежние.
import { POND_CAPACITY, POND_SPOTS, POND_USE, pondCastAt } from '../../shared/farmpond.ts';
import type { FarmPondClientMsg, PondIntent } from '../../shared/farmpondnet.ts';
import type { ClientMsg, LobbyEvent, ServerMsg } from '../../shared/messages.ts';
import type { Input, PlayerState } from '../../shared/sim.ts';
import type { Client } from '../hub.ts';
import type { Profiles } from '../profiles.ts';
import type { Store } from '../store.ts';
import { FishNpc, type NpcWho } from '../lobby/fishnpc.ts';
import { FishingHall2 } from '../lobby/fishing2.ts';

export interface PondPlayer {
  id: number;
  c: Client;
  state: PlayerState;
  last: Input;
  inq: { starve: number };
  pondSeat: number | null;
  selfReset: boolean;
  seat?: number;
  fill?: unknown;
}

export interface FarmPondHost {
  now(): number;
  players(): Iterable<PondPlayer>;
  send(p: PondPlayer, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
  changed(p: PondPlayer): void;
  outfitChanged(p: PondPlayer): void;
  limit(key: string, n: number, ms: number): boolean;
  announce(text: string): void;
  toast(p: PondPlayer, text: string): void;
  /** Общая доска набережной тоже должна заметить улов в другой комнате. */
  topChanged?(): void;
}

const RAW_FISH = new Set(['fish', 'reel', 'fishNpc', 'fishBag']);
const SHOP_ACTIONS = new Set(['open', 'beer', 'ale', 'vodka', 'claim', 'rod', 'buy', 'sell', 'sellAll', 'sellWell', 'sellEvery']);

export class FarmPond {
  readonly fishing: FishingHall2;
  private readonly npc: FishNpc;
  private readonly host: FarmPondHost;
  private readonly joined = new Map<PondPlayer, { epoch: number; turn: number }>();
  private turn = 0;
  private tick = 0;
  private viewKey = '';

  constructor(host: FarmPondHost, profiles: Profiles, store: Store) {
    this.host = host;
    const byId = (id: number): PondPlayer | undefined => [...host.players()].find((p) => p.id === id);
    this.fishing = new FishingHall2({
      event: (e) => this.event(e),
      who: (id) => { const c = byId(id)?.c; return c?.profile && !c.ephemeral ? { profile: c.profile, nick: c.nick, ping: c.ping } : null; },
      send: (id, msg) => { const p = byId(id); if (p) host.send(p, msg); },
      toast: (id, text) => { const p = byId(id); if (p) host.toast(p, text); },
      changed: (id) => { const p = byId(id); if (p) { host.changed(p); host.topChanged?.(); } },
      announce: (text) => host.announce(text), rain: () => false, top: () => host.topChanged?.(),
      outfit: (id) => { const p = byId(id); if (p) host.outfitChanged(p); },
      stalled: (id) => (byId(id)?.inq.starve ?? 999) > 8,
    }, profiles, store, () => host.now(), Math.random, {
      count: POND_CAPACITY, spotAt: (i) => POND_SPOTS[i], castAt: pondCastAt, zoneAt: () => 'pond',
    });
    this.npc = new FishNpc({
      now: () => host.now(), limit: (key) => host.limit(`pondNpc:${key}`, 6, 1000),
      changed: (who) => { const p = [...host.players()].find((p) => p.c.profile === who.profile); if (p) host.changed(p); },
      rainState: () => 'busy', startRain: () => {},
      use: (npc) => npc === 'pond' ? POND_USE : null,
      allowed: (npc, action) => npc === 'pond' && SHOP_ACTIONS.has(action),
    }, profiles);
  }

  join(p: PondPlayer): void {
    p.pondSeat = null;
    this.joined.set(p, { epoch: p.c.epoch, turn: ++this.turn });
    this.sendState(p);
  }

  leave(p: PondPlayer): void {
    this.stand(p);
    this.joined.delete(p);
  }

  seatOf(p: PondPlayer): number | null { return p.pondSeat; }
  renamed(): void { this.fishing.renamed(); this.host.topChanged?.(); }
  outfitChanged(p: PondPlayer): void { this.sendState(p); }

  private who(p: PondPlayer): NpcWho | null {
    return p.c.profile && !p.c.ephemeral ? {
      key: String(p.c.id), profile: p.c.profile, x: p.state.x, y: p.state.y, z: p.state.z,
      send: (msg) => this.host.send(p, msg),
    } : null;
  }

  stand(p: PondPlayer): void {
    if (p.pondSeat === null) return;
    this.fishing.stand(p.pondSeat, p.id);
    p.pondSeat = null;
    p.last.buttons = 0;
    p.selfReset = true;
    this.publish();
  }

  handle(p: PondPlayer, raw: ClientMsg): boolean {
    // Сообщения набережной без текущих epoch/turn здесь не исполняются.
    if (RAW_FISH.has(raw.t)) return true;
    if (raw.t !== 'farmPondSeat' && raw.t !== 'farmPondAct') return false;
    const msg = raw as FarmPondClientMsg;
    const session = this.joined.get(p);
    if (!session || msg.epoch !== p.c.epoch || msg.epoch !== session.epoch || !this.who(p)) return true;
    if (msg.t === 'farmPondSeat') {
      if (!this.host.limit(`pondSeat:${p.c.id}`, 6, 1000)) return true;
      if (msg.seat === null) { this.stand(p); return true; }
      const seat = msg.seat;
      if (!Number.isInteger(seat) || seat < 0 || seat >= POND_CAPACITY) return true;
      if (p.pondSeat === seat) return true;
      if (p.pondSeat !== null || (p.seat ?? -1) >= 0 || p.fill) { this.host.toast(p, 'Сначала закончи текущее дело'); return true; }
      const at = POND_SPOTS[seat];
      if (Math.hypot(p.state.x - at.x, p.state.z - at.z) > 1.65 || Math.abs(p.state.y - (at.y ?? 0)) > 1) {
        this.host.toast(p, 'Подойди к свободным мосткам'); return true;
      }
      if (this.fishing.occupant(seat)) { this.host.toast(p, 'Все 6 мест заняты или это место уже выбрали'); return true; }
      p.pondSeat = seat;
      this.fishing.sit(seat, p.id);
      Object.assign(p.state, { x: at.x, y: at.y ?? 0, z: at.z, vx: 0, vy: 0, vz: 0, grounded: 1 });
      p.last.yaw = at.yaw; p.last.buttons = 0; p.selfReset = true;
      this.publish();
      return true;
    }
    if (msg.turn !== session.turn || !msg.intent || typeof msg.intent !== 'object') return true;
    this.intent(p, msg.intent);
    this.publish();
    return true;
  }

  private intent(p: PondPlayer, msg: PondIntent): void {
    if (msg.t === 'fishNpc' || msg.t === 'fishBag') {
      const who = this.who(p);
      if (!who) return;
      if (msg.t === 'fishBag') this.npc.release(who, msg.n);
      else this.npc.handle(who, { ...msg, npc: 'pond' });
      return;
    }
    const seat = p.pondSeat;
    if (seat === null || this.fishing.occupant(seat) !== p.id) return;
    if (msg.t === 'fish' && this.host.limit(`pondFish:${p.c.id}`, 20, 1000)) this.fishing.act(seat, p.id, msg.a, msg.n, this.tick);
    if (msg.t === 'reel' && this.host.limit(`pondReel:${p.c.id}`, 60, 1000)) this.fishing.reel(seat, p.id, msg.i, msg.k, msg.u, msg.d, this.tick);
  }

  step(tick: number): void {
    this.tick = tick;
    this.fishing.step(tick);
    this.publish();
  }

  private event(e: LobbyEvent): void {
    for (const p of this.host.players()) if (this.joined.has(p)) this.host.send(p, { t: 'farmPondEv', e: [e], epoch: p.c.epoch });
  }

  private sendState(p: PondPlayer): void {
    const session = this.joined.get(p);
    if (!session) return;
    this.host.send(p, { t: 'farmPond', fish: this.fishing.views(), seats: POND_SPOTS.map((_, i) => this.fishing.occupant(i)),
      now: this.host.now(), epoch: p.c.epoch, turn: session.turn });
  }

  private publish(): void {
    const key = JSON.stringify([this.fishing.views(), POND_SPOTS.map((_, i) => this.fishing.occupant(i))]);
    if (key === this.viewKey) return;
    this.viewKey = key;
    for (const p of this.host.players()) this.sendState(p);
  }
}
