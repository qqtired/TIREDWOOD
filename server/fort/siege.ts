// Осадные враги пользуются тем же пулом, уроном, телеграфами и снимком, что старая орда.
// Нет дополнительных волн/бесконечных пассажиров: канат, башня и гриб переводят уже живых ходоков.
import { TICK_RATE } from '../../shared/constants.ts';
import { CLIMB_TOP_TICKS, ZS_BOAT, ZS_BOAT_LAND, ZS_BOAT_LEAVE, ZS_BOSS_APPROACH, ZS_TOP, ZS_WALK, type FortEvent } from '../../shared/fort.ts';
import { BOAT_LEAVE_TICKS, Z_BOAT, Z_CLIMBER, Z_RUNNER, Z_WALKER, ZK } from '../../shared/fortkinds.ts';
import { CLIMBS, CLIMB_SEA_E, CLIMB_SEA_W, CRYSTAL, GATE, WALL_H, insideFort } from '../../shared/fortmap.ts';
import * as S from '../../shared/fortsiege.ts';
import type { Horde, HordeHost, Zombie } from './horde.ts';
import { r2, rageCheck, targetOf, walk } from './boss-kit.ts';
import { bossSpeed, type BossCtx } from './bosses.ts';

interface Pool { id: number; x: number; y: number; z: number; until: number; source: number }
interface Shell { id: number; markId: number; x: number; y: number; z: number; at: number; gate: boolean; dmg: number; pool?: boolean }
type Warning = Extract<FortEvent, ['warn', ...number[]]>;
const hit = { x: 0, y: 0, z: 0 };
const escortKind = (k: number) => k === Z_WALKER || k === Z_RUNNER || k === Z_CLIMBER;
const active = (z: Zombie) => z.state === S.ZS_SIEGE_DEPLOY || z.state === S.ZS_SIEGE_WINDUP || z.state === S.ZS_SIEGE_ACTION;

export class Siege {
  private readonly c: BossCtx;
  private readonly horde: Horde;
  private readonly host: HordeHost;
  private nextStart = 0;
  private lastDeadline = -Infinity;
  private pools: Pool[] = [];
  private shells: Shell[] = [];
  private nextMark = 2_000_000;
  private readonly phases = new Map<number, S.SiegePhaseClock>();
  /** Only source-owned marks. Launched projectiles keep their independent IDs in shells. */
  private readonly warnings = new Map<number, Warning>();
  failed = false;
  constructor(horde: Horde, host: HordeHost) { this.horde = horde; this.host = host; this.c = { horde, host }; }
  get pending(): number { return this.shells.length; }

  clear(): void {
    for (const p of this.pools) this.host.event(['siegepool', p.id, p.x, p.y, p.z, S.PUMP_POOL_RADIUS, 0]);
    for (const s of this.shells) this.host.event(['warnend', s.markId]);
    for (const id of this.warnings.keys()) this.host.event(['warnend', id]);
    this.warnings.clear();
    this.phases.clear();
    this.pools.length = this.shells.length = 0;
    this.nextStart = 0;
    this.lastDeadline = -Infinity;
    this.failed = false;
  }

  tick(): void {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      if (this.host.tick < s.at) continue;
      this.host.event(['warnend', s.markId]);
      if (s.pool) {
        this.pool(s.x, s.y, s.z, S.Z_JAMPUMP, s.markId);
        for (const p of this.host.targets()) if (Math.hypot(p.x - s.x, p.z - s.z) < S.PUMP_POOL_RADIUS && Math.abs(p.y - s.y) < 1)
          this.host.hitPlayer(s.id, p.id, s.dmg);
        this.shells.splice(i, 1);
        continue;
      }
      // Выпущенное ядро имеет собственное время: гибель расчёта его не отменяет.
      if (s.gate) { if (this.host.gateUp()) { this.host.hitGate(s.dmg); this.failed = true; } }
      else { this.host.hitCrystal(s.dmg); this.failed = true; }
      for (const p of this.host.targets()) if (Math.hypot(p.x - s.x, p.y + .8 - s.y, p.z - s.z) < 3
        && !this.host.traceAttack(s.x, s.y + .1, s.z, p.x, p.y + .8, p.z, hit)) this.host.hitPlayer(s.id, p.id, 35);
      this.host.event(['blast', S.ZS_SIEGE_SHELL, s.x, s.y, s.z, 3]);
      this.shells.splice(i, 1);
    }
    for (let i = this.pools.length - 1; i >= 0; i--) if (this.host.tick >= this.pools[i].until) {
      const p = this.pools[i];
      this.host.event(['siegepool', p.id, p.x, p.y, p.z, S.PUMP_POOL_RADIUS, 0]);
      this.pools.splice(i, 1);
    }
  }

  playerSlow(x: number, y: number, z: number): number {
    return this.pools.some((p) => this.host.tick < p.until && Math.abs(p.y - y) < 1
      && Math.hypot(x - p.x, z - p.z) < S.PUMP_POOL_RADIUS) ? S.PUMP_POOL_SLOW : 1;
  }

  replay(): FortEvent[] {
    const events: FortEvent[] = this.pools.map((p) => ['siegepool', p.id, p.x, p.y, p.z, S.PUMP_POOL_RADIUS, p.until, p.source]);
    for (const s of this.shells) events.push(['warn', s.markId, s.pool ? S.ZS_SIEGE_GLOB : S.ZS_SIEGE_SHELL, s.x, s.y, s.z,
      s.pool ? S.PUMP_POOL_RADIUS : 3, s.at]);
    for (const z of this.horde.zombies) if (z.alive) {
      const phase = this.phases.get(z.id);
      if (!phase || phase.state !== z.state) continue;
      // This event precedes warn: a new client knows the source kind before its first binary snapshot.
      events.push(['siegephase', z.id, phase.kind, phase.state, phase.start, phase.end]);
      const warning = this.warnings.get(z.id);
      if (warning && warning[7] >= this.host.tick) events.push([...warning]);
      // An old walker using BOARD needs a flight clock, never a new mechanical weak-point counter.
      if (z.kind < S.Z_ROPECRAB && !z.anchor) continue;
      const total = this.hitTotal(z);
      events.push(['siege', z.id, z.kind === Z_BOAT || z.kind === S.Z_ROPECRAB ? 1 : z.kind === S.Z_CANOPY ? 2
        : z.kind === S.Z_CRABCRANE || z.kind === S.Z_MILLER ? 3 : 0, Math.max(0, total - z.siegeHits), total, z.state]);
    }
    return events;
  }

  private wind(z: Zombie, x: number, y: number, zz: number, r: number, ticks: number, impactLag = 0): void {
    z.state = S.ZS_SIEGE_WINDUP; z.t = ticks; z.toX = x; z.toY = y; z.toZ = zz;
    this.mark(['warn', z.id, z.state, x, y, zz, r, this.host.tick + ticks + impactLag]);
  }

  private mark(event: Warning): void {
    this.warnings.set(event[1], event);
    this.host.event(event);
  }

  private clearWarning(id: number, announce = false): void {
    if (this.warnings.delete(id) || announce) this.host.event(['warnend', id]);
  }

  /** The ordinary tick countdown preserves end. A timer reset in the same state creates a new start. */
  private syncPhase(z: Zombie): void {
    if (!z.alive) return;
    if (z.kind < S.Z_ROPECRAB && !z.anchor && (z.state < S.ZS_SIEGE_APPROACH || z.state > S.ZS_BOARD)) {
      this.phases.delete(z.id);
      this.clearWarning(z.id);
      return;
    }
    const timed = S.SIEGE_TIMED.some((state) => state === z.state);
    const end = timed && z.t > 0 ? this.host.tick + z.t : 0;
    const previous = this.phases.get(z.id);
    const restarted = !previous || previous.kind !== z.kind || previous.state !== z.state || end > previous.end;
    if (!restarted && previous.end === end) return;
    const phase = { id: z.id, kind: z.kind, state: z.state, start: restarted ? this.host.tick : previous.start, end };
    this.phases.set(z.id, phase);
    this.host.event(['siegephase', z.id, z.kind, z.state, phase.start, phase.end]);
    if (!active(z)) this.clearWarning(z.id);
  }

  private pool(x: number, y: number, z: number, source: number, id = this.nextMark++): void {
    const p = { id, x, y, z, source, until: this.host.tick + S.PUMP_POOL_TICKS };
    this.pools.push(p);
    this.host.event(['siegepool', id, x, y, z, S.PUMP_POOL_RADIUS, p.until, source]);
  }

  private launch(z: Zombie, ticks: number, pool = false): void {
    const markId = this.nextMark++;
    const gate = z.chase === -1;
    const foreman = z.kind === S.Z_FOREMAN;
    const s: Shell = { id: z.id, markId, x: z.toX, y: z.toY, z: z.toZ, at: this.host.tick + ticks, gate, pool,
      dmg: pool ? Math.min(45, this.horde.dmgOf(z, 12)) : this.horde.dmgOf(z, foreman ? gate ? 160 : 90 : gate ? S.BATTERY_GATE_DAMAGE : S.BATTERY_CRYSTAL_DAMAGE) };
    this.shells.push(s);
    this.clearWarning(z.id, true);
    this.host.event(['warn', markId, pool ? S.ZS_SIEGE_GLOB : S.ZS_SIEGE_SHELL, s.x, s.y, s.z, pool ? S.PUMP_POOL_RADIUS : 3, s.at]);
    const muzzle = pool || foreman ? 0 : 1.35;
    this.host.event(['throw', r2(z.x - muzzle * Math.sin(z.yaw)), r2(z.y + (muzzle ? 1.03 : 1.2)),
      r2(z.z - muzzle * Math.cos(z.yaw)), s.x, s.y, s.z, ticks, pool ? S.ZS_SIEGE_GLOB : S.ZS_SIEGE_SHELL]);
  }

  /** Два новых действия максимум; босс занимает два очка и не получает параллельной осадной работы. */
  private reserve(z: Zombie, lead = 0): boolean {
    if (this.host.tick < this.nextStart) return false;
    const deadline = this.host.tick + lead;
    if (Math.abs(deadline - this.lastDeadline) < S.SIEGE_DEADLINE_GAP) return false;
    let count = 0;
    let slots = 0;
    for (const o of this.horde.zombies) if (o !== z && o.alive && o.kind !== S.Z_CANOPY && active(o)) {
      count++;
      slots += o.kind === S.Z_FOREMAN || o.kind === S.Z_CRABCRANE || o.kind === S.Z_MILLER ? 2 : 1;
    }
    const need = z.kind === S.Z_FOREMAN || z.kind === S.Z_CRABCRANE || z.kind === S.Z_MILLER ? 2 : 1;
    if (count >= 2 || slots + need > S.urgentSlots(this.horde.defenders)) return false;
    this.nextStart = this.host.tick + S.SIEGE_DEADLINE_GAP;
    this.lastDeadline = deadline;
    z.siegeHits = 0;
    return true;
  }

  step(z: Zombie): boolean {
    const handled = this.advance(z);
    this.syncPhase(z);
    return handled;
  }

  private advance(z: Zombie): boolean {
    if (z.state === S.ZS_BOARD) { this.boardStep(z); return true; }
    if (z.siegeCarrier) {
      const source = this.horde.byId(z.siegeCarrier);
      if (!source || source.state !== S.ZS_SIEGE_ACTION) { z.siegeCarrier = 0; z.state = ZS_WALK; return false; }
      const distance = Math.hypot(source.x - z.x, source.z - z.z);
      if (distance > ZK[source.kind].r + ZK[z.kind].r + .5) {
        walk(z, source.x, source.z, this.horde.groundSpeed(z)); return true;
      }
      this.board(z, source.climb);
      source.siegeUsed++; source.atk = (source.atk + 1) & 255; source.atkCd = S.BOARD_EVERY;
      if (source.kind === S.Z_SIEGE_TOWER) this.failed = true;
      return true;
    }
    if (z.kind === Z_BOAT) return this.boat(z);
    if (z.kind < S.Z_ROPECRAB) return false;
    if (z.kind === S.Z_CRABCRANE || z.kind === S.Z_MILLER) { this.boss(z); return true; }
    if (z.kind === S.Z_CANOPY) {
      const wasFolded = z.state === S.ZS_SIEGE_OPEN;
      const folded = z.state === S.ZS_SIEGE_OPEN && --z.t > 0;
      this.horde.stepGround(z, this.host.gateUp());
      z.state = folded ? S.ZS_SIEGE_OPEN : S.ZS_SIEGE_ACTION;
      if (!folded) z.t = 0;
      if (wasFolded && !folded) { z.siegeHits = 0; this.progress(z); }
      return true;
    }
    if (z.kind === S.Z_JAMPUMP) { this.pump(z); return true; }
    if (z.kind === S.Z_FOREMAN || z.kind === S.Z_BATTERY) { this.battery(z); return true; }
    this.transport(z);
    return true;
  }

  /** Одно прицельное попадание за вызов damage: дробовик уже свёл дробины, автобашни не чинят игроку контрход. */
  precision(z: Zombie, by: number): void {
    if (by <= 0 || by >= 250 || z.kind < S.Z_ROPECRAB || z.state === S.ZS_SIEGE_SPENT) return;
    if (z.kind === S.Z_CANOPY) {
      z.state = S.ZS_SIEGE_OPEN; z.t = S.CANOPY_OPEN_TICKS; z.siegeHits = 1; this.progress(z); this.syncPhase(z); return;
    }
    if (!active(z)) return;
    const total = this.hitTotal(z);
    z.siegeHits++;
    this.progress(z);
    if (z.siegeHits < total) return;
    this.clearWarning(z.id, true);
    if (z.kind === S.Z_SIEGE_TOWER || z.kind === S.Z_BATTERY) {
      z.state = S.ZS_SIEGE_SPENT;
      this.horde.kill(z, by);
    } else {
      z.state = S.ZS_SIEGE_OPEN;
      z.t = z.kind === S.Z_SPRING || z.kind === S.Z_ROPECRAB ? 4 * TICK_RATE : S.SIEGE_OPEN_TICKS;
      z.atkCd = 12 * TICK_RATE;
    }
    this.progress(z);
    this.syncPhase(z);
  }

  private hitTotal(z: Zombie): number {
    return z.kind === S.Z_CANOPY ? 1 : z.kind === S.Z_JAMPUMP ? 2
      : z.kind === S.Z_FOREMAN || z.kind === S.Z_SIEGE_TOWER || z.kind === S.Z_BATTERY ? 4 : 3;
  }
  private progress(z: Zombie): void {
    const total = this.hitTotal(z);
    const part = z.kind === Z_BOAT || z.kind === S.Z_ROPECRAB ? 1 : z.kind === S.Z_CANOPY ? 2
      : z.kind === S.Z_CRABCRANE || z.kind === S.Z_MILLER ? 3 : 0;
    this.host.event(['siege', z.id, part, Math.max(0, total - z.siegeHits), total, z.state]);
  }

  death(z: Zombie): void {
    if (z.kind >= S.Z_ROPECRAB || z.anchor) this.host.event(['warnend', z.id]);
    this.warnings.delete(z.id);
    this.phases.delete(z.id);
  }

  /** Навес защищает до трёх ближайших обычных соседей; взрыв вызывает areaDamage и сюда не попадает. */
  cover(z: Zombie, ox: number, oz: number): number {
    if (!escortKind(z.kind) || z.shield > 0) return 1;
    for (const canopy of this.horde.zombies) {
      if (!canopy.alive || canopy.kind !== S.Z_CANOPY || canopy.state === S.ZS_SIEGE_OPEN) continue;
      const d = Math.hypot(z.x - canopy.x, z.z - canopy.z);
      if (d > 5 || Math.abs(z.y - canopy.y) > 1) continue;
      const front = -(ox - canopy.x) * Math.sin(canopy.yaw) - (oz - canopy.z) * Math.cos(canopy.yaw);
      if (front <= 0) continue;
      let closer = 0;
      for (const o of this.horde.zombies) if (o.alive && o !== z && escortKind(o.kind)
        && (Math.hypot(o.x - canopy.x, o.z - canopy.z) < d || Math.hypot(o.x - canopy.x, o.z - canopy.z) === d && o.id < z.id)) closer++;
      if (closer < 3) return S.CANOPY_REDUCTION;
    }
    return 1;
  }

  private transport(z: Zombie): void {
    if (z.state === S.ZS_SIEGE_SPENT) return;
    if (z.state === S.ZS_SIEGE_OPEN) {
      if (--z.t <= 0) { z.state = S.ZS_SIEGE_APPROACH; z.siegeUsed = 0; }
      return;
    }
    const ci = z.x < 0 ? 0 : 1;
    const cp = CLIMBS[ci];
    if (z.state === ZS_WALK || z.state === S.ZS_SIEGE_APPROACH) {
      z.state = S.ZS_SIEGE_APPROACH;
      if (walk(z, cp.x, cp.z - (z.kind === S.Z_SIEGE_TOWER ? 2.6 : 1.6), this.horde.groundSpeed(z))) return;
      if (z.atkCd > 0 || !this.reserve(z, z.kind === S.Z_SPRING ? S.SPRING_DEPLOY_TICKS : S.SIEGE_DEPLOY_TICKS)) return;
      z.climb = ci;
      z.toX = cp.x; z.toY = WALL_H; z.toZ = cp.z + 1.7;
      z.state = S.ZS_SIEGE_DEPLOY;
      z.t = z.kind === S.Z_SPRING ? S.SPRING_DEPLOY_TICKS : S.SIEGE_DEPLOY_TICKS;
      z.siegeUsed = 0;
      this.progress(z);
      this.mark(['warn', z.id, z.state, z.toX, z.toY, z.toZ, 2, this.host.tick + z.t]);
      return;
    }
    if (z.state === S.ZS_SIEGE_DEPLOY) {
      if (--z.t > 0) return;
      z.state = S.ZS_SIEGE_ACTION; z.t = S.SIEGE_ACTIVE_TICKS; z.atkCd = 0;
      this.mark(['warn', z.id, S.ZS_SIEGE_DEPLOY, z.toX, z.toY, z.toZ, 2, this.host.tick + z.t]);
      return;
    }
    if (z.state !== S.ZS_SIEGE_ACTION) return;
    const limit = z.kind === S.Z_SPRING ? 3 : z.kind === S.Z_ROPECRAB ? 4 : S.siegePassengerLimit(this.horde.defenders);
    if (--z.t <= 0 || z.siegeUsed >= limit) {
      z.state = S.ZS_SIEGE_OPEN; z.t = S.SIEGE_OPEN_TICKS; z.atkCd = 12 * TICK_RATE;
      if (z.kind === S.Z_SIEGE_TOWER) { z.state = S.ZS_SIEGE_SPENT; this.horde.kill(z, 0); }
      return;
    }
    if (z.atkCd > 0) return;
    if (this.horde.zombies.some((o) => o.alive && o.siegeCarrier === z.id)) return;
    let best: Zombie | undefined;
    let dist = 13;
    for (const o of this.horde.zombies) {
      if (!o.alive || !escortKind(o.kind) || o.y > .1 || insideFort(o.x, o.z) || o.state === S.ZS_BOARD || o.siegeCarrier) continue;
      const d = Math.hypot(z.x - o.x, z.z - o.z);
      if (d < dist) { dist = d; best = o; }
    }
    if (!best) return;
    best.siegeCarrier = z.id;
    best.state = S.ZS_SIEGE_APPROACH;
  }

  board(z: Zombie, climb: number): void {
    const c = CLIMBS[climb];
    z.climb = climb;
    z.siegeCarrier = 0;
    z.fromX = z.x; z.fromY = z.y; z.fromZ = z.z;
    z.toX = c.x - c.nx * 1.7; z.toY = WALL_H; z.toZ = c.z - c.nz * 1.7;
    z.state = S.ZS_BOARD; z.t = S.BOARD_TICKS; z.vx = z.vz = 0;
    this.syncPhase(z);
  }
  private boardStep(z: Zombie): void {
    const u = 1 - Math.max(0, --z.t) / S.BOARD_TICKS;
    z.x = z.fromX + (z.toX - z.fromX) * u;
    z.y = z.fromY + (z.toY - z.fromY) * u + 4 * 4.5 * u * (1 - u);
    z.z = z.fromZ + (z.toZ - z.fromZ) * u;
    if (z.t <= 0) { z.state = ZS_TOP; z.t = CLIMB_TOP_TICKS; this.host.event(['climb', z.id]); }
  }

  private boat(z: Zombie): boolean {
    if (!z.anchor && z.state !== S.ZS_SIEGE_OPEN) return false;
    if (z.state === ZS_BOAT) return false;
    if (z.state === ZS_BOAT_LAND) {
      if (!this.reserve(z, S.SIEGE_DEPLOY_TICKS)) return true;
      z.state = S.ZS_SIEGE_DEPLOY; z.t = S.SIEGE_DEPLOY_TICKS;
      const c = CLIMBS[z.x < 0 ? CLIMB_SEA_W : CLIMB_SEA_E];
      z.toX = c.x; z.toY = WALL_H; z.toZ = c.z - 1.7;
      this.progress(z);
      this.mark(['warn', z.id, z.state, z.toX, z.toY, z.toZ, 2, this.host.tick + z.t]);
      return true;
    }
    if (z.state === S.ZS_SIEGE_DEPLOY) {
      if (--z.t > 0) return true;
      z.state = S.ZS_SIEGE_ACTION; z.t = 1;
      this.mark(['warn', z.id, S.ZS_SIEGE_DEPLOY, z.toX, z.toY, z.toZ, 2, this.host.tick + z.t + S.BOARD_TICKS]);
    }
    if (z.state === S.ZS_SIEGE_ACTION) {
      if (--z.t > 0) return true;
      if (!z.cargo.length) { z.state = ZS_BOAT_LEAVE; z.t = BOAT_LEAVE_TICKS; return false; }
      if (this.horde.unloadCrew(z, true)) this.failed = true;
      z.t = S.BOARD_EVERY;
      this.mark(['warn', z.id, S.ZS_SIEGE_DEPLOY, z.toX, z.toY, z.toZ, 2, this.host.tick + z.t + S.BOARD_TICKS]);
      return true;
    }
    if (z.state === S.ZS_SIEGE_OPEN) {
      if (--z.t <= 0) { z.state = ZS_BOAT_LAND; z.t = 1; }
      return true;
    }
    return false;
  }

  cutAnchor(z: Zombie, by: number, hits = 1): void {
    if (!z.alive || !z.anchor || !active(z)) return;
    z.siegeHits += hits;
    this.progress(z);
    if (z.siegeHits < 3) return;
    z.anchor = false; z.stage &= ~S.BOAT_ANCHOR_FLAG;
    z.state = S.ZS_SIEGE_OPEN; z.t = S.SIEGE_OPEN_TICKS;
    this.clearWarning(z.id, true);
    this.host.event(['zhit', by, z.id, 0, 4, z.toX, z.toY + .5, z.toZ]);
    this.progress(z);
    this.syncPhase(z);
  }

  hitRopeTarget(z: Zombie, by: number): void {
    if (z.kind === S.Z_ROPECRAB) this.precision(z, by);
    else this.cutAnchor(z, by);
  }

  /** Канат у стены имеет собственную доступную цель; твёрдая стена ограничивает луч до этой проверки. */
  anchorRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { boat: Zombie; t: number } | null {
    let result: { boat: Zombie; t: number } | null = null;
    for (const z of this.horde.zombies) {
      if (!z.alive || (!z.anchor && z.kind !== S.Z_ROPECRAB) || !active(z)) continue;
      const t = raySphere(ox, oy, oz, dx, dy, dz, z.toX, z.toY + .5, z.toZ, .65);
      if (t >= 0 && t < max) { max = t; result = { boat: z, t }; }
    }
    return result;
  }

  private battery(z: Zombie): void {
    const foreman = z.kind === S.Z_FOREMAN;
    if (z.state === S.ZS_SIEGE_OPEN) {
      if (--z.t <= 0) z.state = S.ZS_SIEGE_APPROACH;
      return;
    }
    if (z.state === S.ZS_SIEGE_SPENT) return;
    if (z.state === ZS_WALK || z.state === S.ZS_SIEGE_APPROACH) {
      z.state = S.ZS_SIEGE_APPROACH;
      if (walk(z, foreman ? 0 : z.id % 2 ? -10 : 10, foreman ? -20 : -30, this.horde.groundSpeed(z))) return;
      if (z.atkCd > 0 || !this.reserve(z, (foreman ? S.SIEGE_DEPLOY_TICKS : S.BATTERY_DEPLOY_TICKS) + S.BATTERY_WARN_TICKS + S.BATTERY_FLIGHT_TICKS)) return;
      z.state = S.ZS_SIEGE_DEPLOY; z.t = foreman ? S.SIEGE_DEPLOY_TICKS : S.BATTERY_DEPLOY_TICKS;
      z.yaw = Math.atan2(z.x, -(GATE.face - z.z));
      this.progress(z);
      return;
    }
    if (z.state === S.ZS_SIEGE_DEPLOY) {
      if (--z.t > 0) return;
      z.chase = this.host.gateUp() ? -1 : -2;
      this.wind(z, 0, z.chase === -1 ? 1.5 : CRYSTAL.y, z.chase === -1 ? GATE.face : CRYSTAL.z, 3, S.BATTERY_WARN_TICKS, S.BATTERY_FLIGHT_TICKS);
      return;
    }
    if (z.state === S.ZS_SIEGE_WINDUP) {
      if (--z.t > 0) return;
      z.state = S.ZS_SIEGE_ACTION; z.t = S.BATTERY_FLIGHT_TICKS; z.atk = (z.atk + 1) & 255;
      this.launch(z, z.t);
      return;
    }
    if (z.state === S.ZS_SIEGE_ACTION && --z.t <= 0) {
      z.attackIndex++;
      if (!foreman && z.attackIndex >= 3) { z.state = S.ZS_SIEGE_SPENT; this.horde.kill(z, 0); return; }
      z.state = S.ZS_SIEGE_OPEN; z.t = S.SIEGE_OPEN_TICKS; z.atkCd = foreman ? 16 * TICK_RATE : 0;
    }
  }

  private pump(z: Zombie): void {
    if (z.state === S.ZS_SIEGE_OPEN) { if (--z.t <= 0) z.state = S.ZS_SIEGE_APPROACH; return; }
    if (z.state === S.ZS_SIEGE_WINDUP) {
      if (--z.t > 0) return;
      z.state = S.ZS_SIEGE_ACTION; z.t = S.PUMP_ACTION_TICKS; z.atk = (z.atk + 1) & 255;
      this.launch(z, S.PUMP_FLIGHT_TICKS, true);
      return;
    }
    if (z.state === S.ZS_SIEGE_ACTION) {
      z.t--;
      if (z.t <= 0) { z.state = S.ZS_SIEGE_OPEN; z.t = S.SIEGE_OPEN_TICKS; z.atkCd = 10 * TICK_RATE; }
      return;
    }
    const target = this.host.targets().find((p) => Math.hypot(p.x - z.x, p.z - z.z) < 28);
    if (target && z.atkCd <= 0 && this.reserve(z, S.PUMP_WARN_TICKS + S.PUMP_FLIGHT_TICKS)) {
      this.wind(z, target.x, target.y, target.z, S.PUMP_POOL_RADIUS, S.PUMP_WARN_TICKS, S.PUMP_FLIGHT_TICKS);
      this.progress(z);
      return;
    }
    this.horde.stepGround(z, this.host.gateUp());
  }

  private boss(z: Zombie): void {
    const miller = z.kind === S.Z_MILLER;
    rageCheck(this.c, z);
    if (z.state === ZS_BOSS_APPROACH || z.state === S.ZS_SIEGE_APPROACH) {
      if (walk(z, 0, -25, bossSpeed(this.c, z))) return;
      if (!this.reserve(z, S.SIEGE_BOSS_DEPLOY_TICKS + S.SIEGE_BOSS_WINDUP_TICKS + (miller ? 0 : S.CRAB_IMPACT_REMAINING))) return;
      z.state = S.ZS_SIEGE_DEPLOY; z.t = S.SIEGE_BOSS_DEPLOY_TICKS;
      this.progress(z);
      return;
    }
    if (z.state === S.ZS_SIEGE_OPEN) {
      if (--z.t <= 0) { z.state = S.ZS_SIEGE_APPROACH; z.hits.length = 0; }
      return;
    }
    if (z.state === S.ZS_SIEGE_DEPLOY) {
      if (--z.t > 0) return;
      const p = targetOf(this.c, z.attackIndex);
      // Каждый второй мах краба — по одному указанному сооружению. Ветер сооружения не повреждает.
      if (!miller && z.attackIndex % 2 === 0) {
        z.chase = this.host.gateUp() ? -1 : -2;
        this.wind(z, 0, z.chase === -1 ? 1.5 : CRYSTAL.y, z.chase === -1 ? GATE.face : CRYSTAL.z, 3, S.SIEGE_BOSS_WINDUP_TICKS, S.CRAB_IMPACT_REMAINING);
      } else {
        z.chase = p?.id ?? 0;
        this.wind(z, p?.x ?? -8, p?.y ?? WALL_H, p?.z ?? -14.5, miller ? 4 : 3, S.SIEGE_BOSS_WINDUP_TICKS,
          miller ? S.MILLER_GUST_TICKS : S.CRAB_IMPACT_REMAINING);
      }
      return;
    }
    if (z.state === S.ZS_SIEGE_WINDUP) {
      if (--z.t > 0) return;
      z.state = S.ZS_SIEGE_ACTION; z.t = miller ? S.MILLER_GUST_TICKS : S.CRAB_ACTION_TICKS; z.hits.length = 0;
      z.atk = (z.atk + 1) & 255;
      return;
    }
    if (z.state !== S.ZS_SIEGE_ACTION) return;
    z.t--;
    const impact = miller ? z.t % 30 === 0 : z.t === S.CRAB_IMPACT_REMAINING;
    if (impact) {
      const radius = miller ? 4 : 3;
      if (miller && z.t === S.MILLER_GUST_TICKS - 30) {
        this.pool(z.toX - 1.5, z.toY, z.toZ, S.Z_MILLER);
        this.pool(z.toX + 1.5, z.toY, z.toZ, S.Z_MILLER);
      }
      for (const p of this.host.targets()) {
        const outside = miller ? Math.abs(p.x - z.toX) > 4 || Math.abs(p.z - z.toZ) > 1.6 : Math.hypot(p.x - z.toX, p.z - z.toZ) > radius;
        if (z.hits.includes(p.id) || Math.abs(p.y - z.toY) > 1.6 || outside) continue;
        const fromY = miller ? WALL_H + 2.2 : z.toY + 2;
        if (this.host.traceAttack(miller ? z.x : z.toX, fromY, miller ? z.z : z.toZ, p.x, p.y + .8, p.z, hit)) continue;
        z.hits.push(p.id);
        this.host.hitPlayer(z.id, p.id, Math.min(75, this.horde.dmgOf(z, 30)));
        this.host.pushPlayer?.(p.id, p.x < z.toX ? -2 : 2, 0);
      }
      if (!miller && z.chase === -1 && this.host.gateUp()) this.host.hitGate(this.horde.dmgOf(z, 260));
      else if (!miller && z.chase === -2) this.host.hitCrystal(this.horde.dmgOf(z, 140));
      this.host.event(['blast', S.ZS_SIEGE_ACTION, z.toX, z.toY, z.toZ, radius]);
    }
    if (z.t > 0) return;
    z.attackIndex++;
    if (z.stage >= 2 && z.combo === 0) {
      z.combo = 1; z.state = S.ZS_SIEGE_DEPLOY; z.t = S.SIEGE_BOSS_DEPLOY_TICKS; z.siegeHits = 0;
      this.progress(z);
    } else { z.combo = 0; z.state = S.ZS_SIEGE_OPEN; z.t = S.SIEGE_OPEN_TICKS; }
  }
}

/** Normalized ray against sphere: same linear projectile/counter geometry on server and client. */
export function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  x: number, y: number, z: number, r: number): number {
  const px = ox - x, py = oy - y, pz = oz - z;
  const b = px * dx + py * dy + pz * dz;
  const c = px * px + py * py + pz * pz - r * r;
  if (c <= 0) return 0;
  const d = b * b - c;
  return d >= 0 && -b - Math.sqrt(d) >= 0 ? -b - Math.sqrt(d) : -1;
}
