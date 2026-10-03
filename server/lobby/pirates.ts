import { DT, MAX_REWIND_TICKS } from '../../shared/constants.ts';
import { PIRATE_CHEST, PIRATE_END, PIRATE_LANDINGS, PIRATE_LIMIT, PIRATE_MAX, PIRATE_RANGE, PIRATE_SWING, PIRATE_WARN,
  emptyPirates, emptyPirateTail, noRaidKnock, pirateCount, pirateReward, type PirateSnap, type PirateTail, type PirateView, type RaidKnock } from '../../shared/pirates.ts';
import type { Input } from '../../shared/sim.ts';
import type { GameMap } from '../../shared/maps/types.ts';
import { makeRayHit, type CollisionWorld } from '../../shared/world.ts';
import type { EventHost, EventPlayer, LargeEvent } from './events.ts';
import { PirateNav } from './piratenav.ts';
interface Actor extends PirateSnap { attackAt: number; landing: number }
interface Participant { pid: number; nick: string; hits: number; kos: number; swingAt: number }
interface Frame { tick: number; actors: Array<{ id: number; x: number; z: number }>; players: Array<{ pid: number; x: number; y: number; z: number }> }
export interface PirateHooks extends EventHost { broadcast(view: PirateView): void }
/** Server-only raid. .swing consumes BTN_FIRE via the room input path, never a client target ID. */
export class Pirates implements LargeEvent {
  private readonly host: PirateHooks;
  private readonly world: CollisionWorld;
  readonly nav: PirateNav;
  private state = emptyPirates();
  private tick = 0;
  private actors: Actor[] = [];
  private nextId = 1;
  private nextWave = 0;
  private chestX = PIRATE_CHEST.x;
  private chestZ = PIRATE_CHEST.z;
  private carrier = 0;
  private pickupAt = 0;
  private readonly people = new Map<number, Participant>();
  private readonly knocks = new Map<number, RaidKnock>();
  private readonly history: Array<Frame | undefined> = Array(32);
  private readonly ray = makeRayHit();
  constructor(host: PirateHooks, map: GameMap, world: CollisionWorld) { this.host = host; this.world = world; this.nav = new PirateNav(map); }
  get active(): boolean { return this.state.phase !== 'idle'; }
  view(): PirateView { return { ...this.state, results: this.state.results.map(r => ({ ...r })) }; }
  start(tick: number, id: string): void {
    if (this.active) return;
    this.tick = tick; this.actors = []; this.nextId = 1; this.carrier = 0; this.nextWave = 0; this.pickupAt = 0;
    this.chestX = PIRATE_CHEST.x; this.chestZ = PIRATE_CHEST.z; this.people.clear(); this.knocks.clear(); this.history.fill(undefined);
    this.state = { ...emptyPirates(), id, phase: 'warn', start: tick, end: tick + PIRATE_WARN };
    this.enroll(); this.host.chat('🏴‍☠️ Пираты! Через 40 секунд высадка. Защити кассу на площади — ЛКМ: швабра!'); this.send();
  }
  private enroll(): void {
    for (const p of this.host.players()) if (p.eligible && !this.people.has(p.pid)) {
      this.people.set(p.pid, { pid: p.pid, nick: p.nick, hits: 0, kos: 0, swingAt: -1e9 });
      this.host.award(p.pid, 0, { prRaids: 1 });
    }
  }
  step(tick: number): void {
    this.tick = tick;
    if (!this.active) return;
    if (this.state.phase === 'warn' || this.state.phase === 'raid') this.enroll();
    if (this.state.phase === 'warn' && tick >= this.state.end) {
      this.state.phase = 'raid'; this.state.start = tick; this.state.end = tick + PIRATE_LIMIT; this.spawnWave();
    }
    if (this.state.phase === 'raid') {
      if (tick >= this.state.end) { this.finish(false); return; }
      this.actors = this.actors.filter(a => a.hp > 0);
      if (!this.actors.length) {
        if (this.state.wave === 3) { this.finish(true); return; }
        if (!this.nextWave) this.nextWave = tick + 4 * 60;
        if (tick >= this.nextWave) this.spawnWave();
      }
      for (const a of this.actors) this.move(a);
      this.record();
    }
    if (this.state.phase === 'end' && tick >= this.state.end) { this.state.phase = 'idle'; this.actors = []; this.knocks.clear(); this.send(); }
    else if (tick % 60 === 0) this.send();
  }
  private spawnWave(): void {
    this.state.wave++; this.nextWave = 0;
    const n = pirateCount(this.state.wave, this.host.players().filter(p => p.eligible).length);
    for (let i = 0; i < n && this.actors.length < PIRATE_MAX; i++) {
      const landing = i % PIRATE_LANDINGS.length, base = PIRATE_LANDINGS[landing];
      const pos = this.nav.nearest(base.x + (Math.floor(i / 3) % 3 - 1) * 1.1, base.z - Math.floor(i / 9) * 1.1);
      const captain = this.state.wave === 3 && i === n - 1;
      this.actors.push({ id: this.nextId++, ...pos, hp: captain ? 12 : 3, captain, rage: false, carrying: false, yaw: 0, attackAt: this.tick + 60, landing });
    }
    this.host.chat(`🏴‍☠️ Волна ${this.state.wave}/3 · ${n} пиратов${this.state.wave === 3 ? ' и капитан среди них' : ''}`); this.send();
  }
  private move(a: Actor): void {
    if (this.state.phase !== 'raid') return;
    const carrying = this.carrier === a.id;
    if (!this.carrier && this.tick >= this.pickupAt && Math.hypot(a.x - this.chestX, a.z - this.chestZ) < .85) {
      this.carrier = a.id; a.carrying = true; this.host.chat('🧰 Пират поднял кассу! Сбей носильщика — сундук упадёт.');
    }
    const target = carrying ? PIRATE_LANDINGS[a.landing] : { x: this.chestX, z: this.chestZ };
    const next = this.nav.next(a.x, a.z, target.x, target.z), dx = next.x - a.x, dz = next.z - a.z, d = Math.hypot(dx, dz);
    const helper = carrying && this.actors.some(b => b !== a && b.hp > 0 && Math.hypot(b.x - a.x, b.z - a.z) < 2.2);
    const speed = carrying ? helper ? 1.5 : .85 : a.rage ? 3.8 : 2.6;
    if (d > .01) { const step = Math.min(d, speed * DT); const x = a.x + dx / d * step, z = a.z + dz / d * step;
      if (this.nav.isFree(x, z)) { a.x = x; a.z = z; } a.yaw = Math.atan2(-dx, -dz);
    }
    if (this.carrier === a.id) {
      this.chestX = a.x; this.chestZ = a.z;
      const boat = PIRATE_LANDINGS[a.landing];
      if (Math.hypot(a.x - boat.x, a.z - boat.z) < 1) { this.finish(false); return; }
    }
    if (this.tick >= a.attackAt) {
      const p = this.host.players().find(p => p.eligible && p.state.y < 1.2 && p.state.y > -.3 && Math.hypot(p.state.x - a.x, p.state.z - a.z) < 1.7 && this.visible(a.x, a.z, p.state.x, p.state.z));
      if (p) this.knock(a, p);
    }
  }
  private visible(x: number, z: number, tx: number, tz: number): boolean {
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
    return d < .05 || !this.world.raycast(x, .8, z, dx / d, 0, dz / d, Math.max(0, d - .15), this.ray, true);
  }
  private knock(a: Actor, p: EventPlayer): void {
    a.attackAt = this.tick + 90;
    const dx = p.state.x - a.x, dz = p.state.z - a.z, d = Math.hypot(dx, dz) || 1;
    // Quantize identically to binary self tail, so prediction never uses a different push vector.
    this.knocks.set(p.pid, { at: this.tick, until: this.tick + 30, vx: Math.round(dx / d * 6 * 4) / 4, vz: Math.round(dz / d * 6 * 4) / 4 });
  }
  knockOf(pid: number): RaidKnock { return this.state.phase === 'raid' && this.host.players().some(p => p.pid === pid && p.eligible) ? this.knocks.get(pid) ?? noRaidKnock() : noRaidKnock(); }
  /** Lag compensation uses bounded history of BOTH attacker and pirate, with current static-cover checks. */
  swing(pid: number, input: Pick<Input, 'yaw' | 'viewTick'>): boolean {
    if (this.state.phase !== 'raid' || !Number.isFinite(input.yaw)) return false;
    const player = this.host.players().find(p => p.pid === pid && p.eligible), part = this.people.get(pid);
    if (!player || !part || this.tick - part.swingAt < PIRATE_SWING || this.knockOf(pid).until > this.tick) return false;
    part.swingAt = this.tick;
    const wanted = Math.floor(Math.max(this.tick - MAX_REWIND_TICKS, Math.min(this.tick, Number.isFinite(input.viewTick) ? input.viewTick : this.tick)));
    const old = this.history[((wanted % 32) + 32) % 32]; const frame = old?.tick === wanted ? old : undefined;
    const origin = frame?.players.find(p => p.pid === pid) ?? player.state;
    const fx = -Math.sin(input.yaw), fz = -Math.cos(input.yaw);
    let hit = false;
    for (const a of this.actors) {
      if (a.hp <= 0) continue;
      const target = frame?.actors.find(z => z.id === a.id) ?? a;
      const dx = target.x - origin.x, dz = target.z - origin.z, dist = Math.hypot(dx, dz);
      if (origin.y > 1.4 || origin.y < -.3 || dist > PIRATE_RANGE || dist > .1 && (dx * fx + dz * fz) / dist < .5 || !this.visible(origin.x, origin.z, target.x, target.z)) continue;
      a.hp--; a.rage = a.captain && a.hp <= 6; part.hits++; hit = true;
      if (a.hp === 0) {
        part.kos++; if (this.carrier === a.id) { this.carrier = 0; a.carrying = false; this.pickupAt = this.tick + 60; this.host.chat('🧰 Носильщик сбит — касса на земле!'); }
      } else if (this.tick >= a.attackAt && Math.hypot(a.x - player.state.x, a.z - player.state.z) < 2.7 && this.visible(a.x, a.z, player.state.x, player.state.z)) this.knock(a, player);
    }
    return hit;
  }
  private record(): void {
    this.history[this.tick % 32] = { tick: this.tick, actors: this.actors.map(a => ({ id: a.id, x: a.x, z: a.z })),
      players: this.host.players().filter(p => p.eligible).map(p => ({ pid: p.pid, x: p.state.x, y: p.state.y, z: p.state.z })) };
  }
  private finish(win: boolean): void {
    if (this.state.phase !== 'raid') return;
    this.state.phase = 'end'; this.state.start = this.tick; this.state.end = this.tick + PIRATE_END; this.state.win = win; this.knocks.clear();
    const parts = [...this.people.values()].filter(p => p.hits > 0);
    const mvp = [...parts].sort((a, b) => b.kos - a.kos || b.hits - a.hits || a.pid - b.pid)[0];
    this.state.results = parts.map(p => {
      const best = win && p === mvp, tokens = pirateReward(p.kos, win, best);
      this.host.award(p.pid, tokens, { prKos: p.kos, prWins: win ? 1 : 0 });
      return { pid: p.pid, nick: p.nick, kos: p.kos, tokens, mvp: best };
    });
    this.host.chat(win ? `🎆 Пираты отбиты! Лучший защитник: ${mvp?.nick ?? 'команда'}.` : '🏴‍☠️ Пираты утащили кассу! Награда — только за сбитых.'); this.send();
  }
  tail(pid: number): PirateTail {
    const visible = this.active && this.host.players().some(p => p.pid === pid && p.eligible);
    if (!visible) return emptyPirateTail();
    return { visible, wave: this.state.wave, chestX: this.chestX, chestZ: this.chestZ, carrier: this.carrier, knock: { ...this.knockOf(pid) },
      pirates: this.actors.filter(a => a.hp > 0).map(a => ({ id: a.id, x: a.x, z: a.z, hp: a.hp, captain: a.captain, rage: a.rage, carrying: a.carrying, yaw: a.yaw })) };
  }
  private send(): void { this.host.broadcast(this.view()); }
}
