// «Набег пиратов» на набережной (флаг PIRATES): ход события на сервере. Корабль «Весёлый Мармелад» встаёт на рейд, спускает
// шлюпки; пираты-желейки высаживаются у причалов, берут ящики и бочки из куч и тащат обратно; защитники красят их маркером
// (ЛКМ), топят шлюпки и пробивают корабль береговыми пушками (ЛКМ у пушки), спасают брошенные ящики прикосновением.
// Решает только сервер: клиент шлёт обычный ввод (BTN_FIRE + взгляд + viewTick), а получает медленный вид события
// (`pirates`), быстрое состояние (`pnow`, 10 раз в секунду) и разовые эффекты (`pfx`). Событие никого не двигает и не
// трогает: игроки для пиратов и ядер не существуют. Награды — только начисления (shared/pirates.ts pirateReward).
import { DT, MAX_REWIND_TICKS, TICK_RATE } from '../../shared/constants.ts';
import { viewDir } from '../../shared/math.ts';
import type { GameMap } from '../../shared/maps/types.ts';
import type { Input } from '../../shared/sim.ts';
import { makeRayHit, type CollisionWorld } from '../../shared/world.ts';
import * as P from '../../shared/pirates.ts';
import type { EventHost, EventPlayer, LargeEvent } from './events.ts';
import { PirateNav } from './piratenav.ts';

export interface PirateHooks extends EventHost {
  view(v: P.PirateView): void;
  snap(m: P.PirateSnapMsg): void;
  fx(m: P.PirateFxMsg): void;
}

const sec = (s: number): number => Math.round(s * TICK_RATE);
/** Шлюпку спускают с борта (стоит), она швартуется (гребцы встают), прыжок на причал/обратно, схватить добычу, тонет */
const LOWER = sec(1.4), MOOR = sec(0.9), JUMP = sec(0.5), JUMP_GAP = sec(0.35), GRAB = sec(0.55), SUNK_FOR = sec(3.2);
/** Шлюпка ждёт своих у причала не дольше; брошенную добычу пираты не берут сразу, чтобы успели спасти */
const DOCK_MAX = sec(40), PICK_LOCK = sec(2.4);
const SNAP_EVERY = 6, HIST = 32;

interface Pirate {
  id: number; boat: number; seat: number; captain: boolean; rage: boolean; aboard: boolean;
  x: number; z: number; yaw: number; hp: number; st: number; until: number;
  /** Добыча в руках (капитан несёт две: loot2) и добыча, к которой идёт (номера вещей, −1 — нет) */
  loot: number; loot2: number; want: number;
  /** Куда идёт сейчас (точка пути), когда пересчитать, к какой цели считали */
  wx: number; wz: number; replan: number; tx: number; tz: number;
  /** Прыжок: 0 — на причал, 1 — обратно в шлюпку; откуда и куда */
  jk: number; jx0: number; jz0: number; jx1: number; jz1: number;
  /** Слот последнего, кто попал (цвет краски); скорость-множитель; с какого тика на причале */
  by: number; mult: number; born: number;
}
interface Boat {
  id: number; dock: number; st: number; since: number; born: number;
  d: number; x: number; z: number; yaw: number; vx: number; vz: number; hp: number;
  crew: number[]; cargo: number[]; dockedAt: number; landed: boolean; leaveAt: number;
}
interface Item {
  id: number; st: number; x: number; z: number; home: P.LootHome;
  /** Пират, что несёт (−1), шлюпка, где лежит (−1) и место в ней; когда упала; когда пираты смогут снова взять */
  holder: number; boat: number; slot: number; dropAt: number; lockUntil: number;
}
interface Shell { at: number; kind: number; ship: boolean; by: number; x: number; y: number; z: number }
interface Person { pid: number; slot: number; nick: string; kos: number; sinks: number; hits: number; saves: number }
interface Frame { tick: number; ids: number[]; xs: number[]; zs: number[] }
interface Launch { at: number; dock: number; crew: number; captain: boolean }

const r2 = (v: number): number => Math.round(v * 100) / 100;
function turnTo(from: number, to: number, max: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-max, Math.min(max, d));
}

/** Событие «Набег пиратов». Один экземпляр на комнату набережной; start/step зовёт режиссёр событий. */
export class Pirates implements LargeEvent {
  private readonly host: PirateHooks;
  private readonly world: CollisionWorld;
  private readonly random: () => number;
  readonly nav: PirateNav;
  private v: P.PirateView = P.emptyPirates();
  private tick = 0;
  private pirates: Pirate[] = [];
  private boats: Boat[] = [];
  private items: Item[] = [];
  private shells: Shell[] = [];
  private launches: Launch[] = [];
  private fxq: P.PirateFx[] = [];
  private readonly people = new Map<number, Person>();
  private readonly markerAt = new Map<number, number>();
  private cannonAt: number[] = P.PIRATE_CANNONS.map(() => 0);
  private readonly history: Array<Frame | undefined> = Array(HIST);
  private ppl: readonly EventPlayer[] = [];
  private nextId = 1;
  private nextBoat = 1;
  private waveAt = 0;
  private clearAt = 0;
  private shellAt = 0;
  private shellN = 0;
  private dockShift = 0;
  private dirty = false;
  private lootDirty = false;
  private sentEmpty = false;
  private readonly ray = makeRayHit();
  private readonly shot = P.makeShot();
  private readonly wp = { x: 0, z: 0 };
  private readonly rt = { x: 0, z: 0, yaw: 0 };

  constructor(host: PirateHooks, map: GameMap, world: CollisionWorld, random: () => number = Math.random) {
    this.host = host; this.world = world; this.random = random; this.nav = new PirateNav(map);
  }

  get active(): boolean { return this.v.phase !== 'idle'; }
  view(): P.PirateView { return { ...this.v, results: this.v.results.map(r => ({ ...r })) }; }

  // ------------------------------------------------------------------ жизнь события

  start(tick: number, id: string): void {
    if (this.active) return;
    this.reset();
    this.tick = tick;
    this.v = { ...P.emptyPirates(), id, phase: 'warn', t0: tick, start: tick, end: tick + P.PIRATE_WARN };
    this.items = P.PIRATE_LOOT_HOME.map((h, i) => ({ id: i, st: P.LS_PILE, x: h.x, z: h.z, home: h, holder: -1, boat: -1, slot: -1, dropAt: 0, lockUntil: 0 }));
    this.dockShift = Math.floor(this.random() * 3);
    this.count();
    this.host.chat('🏴‍☠️ Пираты на горизонте! Через 30 секунд высадка: краска (ЛКМ) по ворам, береговые пушки по шлюпкам, спасайте ящики с рыбой.');
    this.dirty = true;
    this.sendView();
  }

  /** Прервать сразу, без наград (команда разработчика) */
  abort(): void {
    if (!this.active) return;
    this.reset();
    this.sendView();
    this.host.snap({ t: 'pnow', k: this.tick, p: [], d: [], l: [] });
  }

  private reset(): void {
    this.v = P.emptyPirates();
    this.pirates = []; this.boats = []; this.items = []; this.shells = []; this.launches = []; this.fxq = [];
    this.people.clear(); this.markerAt.clear(); this.history.fill(undefined);
    this.cannonAt = P.PIRATE_CANNONS.map(() => 0);
    this.nextId = 1; this.nextBoat = 1; this.waveAt = 0; this.clearAt = 0; this.shellAt = 0; this.shellN = 0;
    this.dirty = false; this.lootDirty = false; this.sentEmpty = false;
  }

  step(tick: number): void {
    this.tick = tick;
    const v = this.v;
    if (v.phase === 'idle') return;
    this.ppl = this.host.players();
    if (v.phase === 'warn') {
      if (tick >= v.end) this.beginRaid();
      else if (tick % (2 * TICK_RATE) === 0) this.sendView();
      return;
    }
    if (v.phase === 'raid') this.stepRaid();
    else this.stepEnd();
    if (this.v.phase === 'idle') return;
    this.flush();
  }

  private beginRaid(): void {
    const v = this.v;
    v.phase = 'raid'; v.start = this.tick; v.end = this.tick + P.PIRATE_LIMIT;
    v.hpMax = P.shipHpMax(this.humans()); v.hp = v.hpMax;
    this.shellAt = this.tick + P.PIRATE_SHELL_FIRST;
    this.launchWave();
    this.sendView();
  }

  private humans(): number {
    let n = 0;
    for (const p of this.ppl) if (p.eligible) n++;
    return n;
  }

  /** Сколько вещей где: на причале (куча, на земле, в руках), украдено */
  private count(): void {
    let left = 0, stolen = 0;
    for (const it of this.items) {
      if (it.st === P.LS_STOLEN) stolen++;
      else if (it.st !== P.LS_BOAT) left++;
    }
    const v = this.v;
    if (v.left !== left || v.stolen !== stolen) { v.left = left; v.stolen = stolen; this.dirty = true; }
  }

  // ------------------------------------------------------------------ волны и шлюпки

  private launchWave(): void {
    const v = this.v;
    v.wave++;
    this.waveAt = this.tick; this.clearAt = 0;
    const plan = P.wavePlan(v.wave, this.humans());
    for (let i = 0; i < plan.boats; i++) {
      this.launches.push({ at: this.tick + sec(1 + 2 * i), dock: (this.dockShift + v.wave + i) % P.PIRATE_DOCKS.length, crew: plan.crew[i], captain: plan.captain && i === 0 });
    }
    this.dirty = true;
    this.fx(['wave', v.wave, plan.boats]);
    if (plan.captain) this.host.chat('🏴‍☠️ Последняя волна: с ними сам капитан!');
  }

  private spawnBoat(l: Launch): void {
    const route = P.PIRATE_ROUTES[l.dock];
    P.routeAt(route, 0, false, this.rt);
    const b: Boat = { id: this.nextBoat++, dock: l.dock, st: P.DS_IN, since: this.tick, born: this.tick, d: 0, x: this.rt.x, z: this.rt.z, yaw: this.rt.yaw,
      vx: 0, vz: 0, hp: P.PIRATE_BOAT_HP, crew: [], cargo: [], dockedAt: 0, landed: false, leaveAt: 0 };
    let seat = 0;
    for (let i = 0; i < l.crew; i++) {
      const cap = l.captain && i === 0;
      const s = cap ? 2 : seat++;
      const p: Pirate = { id: this.nextId++, boat: b.id, seat: s, captain: cap, rage: false, aboard: true, x: b.x, z: b.z, yaw: b.yaw,
        hp: cap ? P.PIRATE_CAPTAIN_HP : P.PIRATE_HP, st: s < 2 ? P.PS_ROW : P.PS_SEAT, until: 0, loot: -1, loot2: -1, want: -1, wx: 0, wz: 0, replan: 0, tx: 1e9, tz: 1e9,
        jk: 0, jx0: 0, jz0: 0, jx1: 0, jz1: 0, by: -1, mult: 0.92 + ((this.nextId * 37) % 17) / 100, born: this.tick };
      b.crew.push(p.id);
      this.pirates.push(p);
    }
    this.boats.push(b);
  }

  private boatOf(p: Pirate): Boat | undefined {
    for (const b of this.boats) if (b.id === p.boat) return b;
    return undefined;
  }

  private stepBoat(b: Boat): void {
    const route = P.PIRATE_ROUTES[b.dock], tick = this.tick;
    const px = b.x, pz = b.z;
    switch (b.st) {
      case P.DS_IN: {
        const age = tick - b.born;
        if (age >= LOWER) {
          const left = route.total - b.d;
          const sp = Math.max(0.8, P.PIRATE_ROW_IN * Math.min(1, left / 3.5)) * Math.min(1, (age - LOWER) / sec(1.5) + 0.35);
          b.d = Math.min(route.total, b.d + sp * DT);
          if (b.d >= route.total - 1e-4) { b.st = P.DS_MOOR; b.since = tick; }
        }
        break;
      }
      case P.DS_MOOR:
        if (tick - b.since >= MOOR) { b.st = P.DS_DOCK; b.since = tick; b.dockedAt = tick; }
        break;
      case P.DS_DOCK: this.stepDock(b); break;
      case P.DS_OUT: {
        const sp = P.PIRATE_ROW_OUT * Math.min(1, (tick - b.since) / sec(1.2) + 0.3);
        b.d = Math.max(0, b.d - sp * DT);
        if (b.d <= 0) this.arrive(b);
        break;
      }
      case P.DS_SUNK:
        if (tick - b.since >= SUNK_FOR) b.st = P.DS_GONE;
        break;
      default: break;
    }
    if (b.st === P.DS_IN || b.st === P.DS_OUT || b.st === P.DS_MOOR || b.st === P.DS_DOCK) {
      P.routeAt(route, b.d, b.st === P.DS_OUT, this.rt);
      b.x = this.rt.x; b.z = this.rt.z;
      b.yaw = turnTo(b.yaw, this.rt.yaw, (b.st === P.DS_OUT ? 2.6 : 1.6) * DT);
      b.vx = (b.x - px) / DT; b.vz = (b.z - pz) / DT;
    } else { b.vx = 0; b.vz = 0; }
  }

  /** У причала: высаживает по одному, ждёт своих с добычей, уходит, когда все на борту (или никого не осталось, или вышло время) */
  private stepDock(b: Boat): void {
    const tick = this.tick, t = tick - b.dockedAt;
    let aboard = 0, ashore = 0, k = 0;
    for (const id of b.crew) {
      const p = this.pirates.find(q => q.id === id);
      if (!p) continue;
      if (p.aboard) {
        if (!b.landed && t >= k * JUMP_GAP) this.jumpOut(p, b);
        else aboard++;
      } else ashore++;
      k++;
    }
    if (!b.landed && t >= k * JUMP_GAP + JUMP) b.landed = true;
    if (!b.landed) return;
    if (t >= DOCK_MAX) {
      for (const id of b.crew) { const p = this.pirates.find(q => q.id === id); if (p && !p.aboard) this.strand(p); }
      this.depart(b);
      return;
    }
    if (ashore === 0) {
      if (!b.leaveAt) b.leaveAt = tick + sec(aboard ? 0.7 : 1.4);
      else if (tick >= b.leaveAt) this.depart(b);
    } else b.leaveAt = 0;
  }

  private jumpOut(p: Pirate, b: Boat): void {
    const dock = P.PIRATE_DOCKS[b.dock];
    p.aboard = false; p.st = P.PS_JUMP; p.jk = 0; p.until = this.tick + JUMP;
    p.jx0 = b.x; p.jz0 = b.z - 0.9; p.jx1 = dock.exitX + (p.seat - 1) * 0.6; p.jz1 = dock.exitZ;
    p.x = p.jx0; p.z = p.jz0; p.yaw = P.yawOf(p.jx1 - p.jx0, p.jz1 - p.jz0); p.want = -1; p.born = this.tick;
  }

  private depart(b: Boat): void {
    b.st = P.DS_OUT; b.since = this.tick;
    for (const id of b.crew) { const p = this.pirates.find(q => q.id === id); if (p && p.aboard) p.st = b.cargo.length ? P.PS_CHEER : P.PS_SEAT; }
  }

  /** Шлюпка дошла до корабля: груз украден, экипаж на борту уходит вместе с ней */
  private arrive(b: Boat): void {
    b.st = P.DS_GONE;
    P.routeAt(P.PIRATE_ROUTES[b.dock], 0, false, this.rt);
    for (const id of b.cargo) {
      const it = this.items[id];
      it.st = P.LS_STOLEN; it.holder = -1; it.boat = -1;
      this.fx(['st', id, r2(this.rt.x), r2(this.rt.z)]);
    }
    b.cargo = [];
    this.pirates = this.pirates.filter(p => p.boat !== b.id);
    this.lootDirty = true;
    this.count();
  }

  // ------------------------------------------------------------------ пираты

  private speedOf(p: Pirate): number {
    if (p.captain) return (p.loot >= 0 ? 2.7 : P.PIRATE_CAPTAIN_RUN) * (p.rage ? 1.22 : 1);
    return (p.loot >= 0 ? P.PIRATE_CARRY : P.PIRATE_RUN) * p.mult;
  }

  private walk(p: Pirate, tx: number, tz: number, speed: number): void {
    if (this.tick >= p.replan || Math.hypot(tx - p.tx, tz - p.tz) > 0.4) {
      this.nav.next(p.x, p.z, tx, tz, this.wp);
      p.wx = this.wp.x; p.wz = this.wp.z; p.tx = tx; p.tz = tz; p.replan = this.tick + 6 + (p.id % 3);
    }
    const dx = p.wx - p.x, dz = p.wz - p.z, d = Math.hypot(dx, dz);
    if (d > 1e-3) {
      const s = Math.min(d, speed * DT);
      p.x += dx / d * s; p.z += dz / d * s;
      p.yaw = turnTo(p.yaw, P.yawOf(dx, dz), 9 * DT);
    }
  }

  private avail(it: Item): boolean {
    return it.st === P.LS_PILE || it.st === P.LS_DROPPED && this.tick >= it.lockUntil;
  }

  private target(p: Pirate): number {
    const dock = this.boatOf(p)?.dock ?? 0, pile = P.PIRATE_DOCKS[dock].pile;
    let best = -1, cost = Infinity;
    for (const it of this.items) {
      if (!this.avail(it) || this.pirates.some(q => q !== p && q.want === it.id)) continue;
      const c = Math.hypot(it.x - p.x, it.z - p.z) + (it.home.pile === pile ? 0 : 2.5);
      if (c < cost) { cost = c; best = it.id; }
    }
    return best;
  }

  private stepPirate(p: Pirate): void {
    const tick = this.tick;
    switch (p.st) {
      case P.PS_JUMP: {
        const u = Math.min(1, 1 - (p.until - tick) / JUMP);
        p.x = p.jx0 + (p.jx1 - p.jx0) * u; p.z = p.jz0 + (p.jz1 - p.jz0) * u;
        if (tick >= p.until) this.landed(p);
        break;
      }
      case P.PS_STUN:
        if (tick >= p.until) { p.st = P.PS_RUN; p.want = -1; }
        break;
      case P.PS_GRAB:
        if (tick >= p.until) this.takeLoot(p);
        break;
      case P.PS_RUN: this.run(p); break;
      case P.PS_CARRY: this.carry(p); break;
      case P.PS_FLEE: this.flee(p); break;
      default: break;
    }
  }

  /** Прыжок закончился: на причале — бежать за добычей; в шлюпке — сесть, добыча в груз */
  private landed(p: Pirate): void {
    const b = this.boatOf(p);
    if (p.jk === 0) { p.st = P.PS_RUN; p.want = -1; p.replan = 0; return; }
    if (!b || b.st !== P.DS_DOCK) { this.strand(p); return; }
    p.aboard = true;
    p.st = p.loot >= 0 ? P.PS_CHEER : p.seat < 2 ? P.PS_ROW : P.PS_SEAT;
    if (p.loot >= 0) {
      for (const id of [p.loot, p.loot2]) {
        const it = id >= 0 ? this.items[id] : undefined;
        if (!it) continue;
        it.st = P.LS_BOAT; it.holder = -1; it.boat = b.id; it.slot = b.cargo.length;
        b.cargo.push(it.id);
      }
      p.loot = -1; p.loot2 = -1;
      this.lootDirty = true; this.count();
    }
  }

  private run(p: Pirate): void {
    if (p.want < 0 || !this.avail(this.items[p.want])) p.want = this.target(p);
    const b = this.boatOf(p);
    if (!b || b.st !== P.DS_DOCK) { this.strand(p); return; }
    if (p.want < 0) {
      // добычи не осталось: назад в шлюпку
      this.toBoat(p, b, P.PIRATE_RUN * p.mult);
      return;
    }
    const it = this.items[p.want];
    this.walk(p, it.x, it.z, this.speedOf(p));
    if (Math.hypot(it.x - p.x, it.z - p.z) < 0.6) { p.st = P.PS_GRAB; p.until = this.tick + GRAB; p.yaw = P.yawOf(it.x - p.x, it.z - p.z); }
  }

  private takeLoot(p: Pirate): void {
    const it = p.want >= 0 ? this.items[p.want] : undefined;
    if (!it || !this.avail(it)) { p.st = P.PS_RUN; p.want = -1; return; }
    it.st = P.LS_CARRIED; it.holder = p.id; p.loot = it.id; p.want = -1; p.st = P.PS_CARRY; p.replan = 0;
    this.fx(['pk', it.id, p.id]);
    // капитан хватает сразу две вещи: вторую — ближайшую из той же кучи, что рядом
    if (p.captain) {
      let best: Item | null = null, d = 1.9;
      for (const o of this.items) {
        if (o === it || !this.avail(o) || this.pirates.some(q => q !== p && q.want === o.id)) continue;
        const dd = Math.hypot(o.x - it.x, o.z - it.z);
        if (dd < d) { d = dd; best = o; }
      }
      if (best) { best.st = P.LS_CARRIED; best.holder = p.id; p.loot2 = best.id; this.fx(['pk', best.id, p.id]); }
    }
    this.lootDirty = true;
  }

  private carry(p: Pirate): void {
    const b = this.boatOf(p);
    if (!b || b.st !== P.DS_DOCK) { this.strand(p); return; }
    this.toBoat(p, b, this.speedOf(p));
  }

  /** К точке выхода своего причала и прыжок в шлюпку */
  private toBoat(p: Pirate, b: Boat, speed: number): void {
    const dock = P.PIRATE_DOCKS[b.dock], ex = dock.exitX + (p.seat - 1) * 0.6, ez = dock.exitZ;
    this.walk(p, ex, ez, speed);
    if (Math.hypot(ex - p.x, ez - p.z) < 0.45) {
      p.st = P.PS_JUMP; p.jk = 1; p.until = this.tick + JUMP;
      p.jx0 = p.x; p.jz0 = p.z; p.jx1 = b.x; p.jz1 = b.z - 0.9;
      p.yaw = P.yawOf(p.jx1 - p.jx0, p.jz1 - p.jz0);
    }
  }

  /** Шлюпки нет (затонула, ушла): добычу бросает, бежит к кромке и прыгает в воду */
  private strand(p: Pirate): void {
    if (p.loot >= 0) this.drop(p);
    p.st = P.PS_FLEE; p.want = -1; p.replan = 0; p.tx = 1e9;
    this.nav.nearest(p.x, 21.8);
  }

  private flee(p: Pirate): void {
    const edge = this.nav.nearest(p.x, 21.8);
    this.walk(p, edge.x, edge.z, 3.8);
    if (p.z >= 21.4 || Math.hypot(edge.x - p.x, edge.z - p.z) < 0.4) {
      this.fx(['fl', p.id, r2(p.x), r2(p.z)]);
      this.removePirate(p);
    }
  }

  private removePirate(p: Pirate): void {
    this.pirates = this.pirates.filter(q => q !== p);
    const b = this.boatOf(p);
    if (b) b.crew = b.crew.filter(id => id !== p.id);
  }

  /** Бросил ношу (обе вещи капитана) там, где стоит */
  private drop(p: Pirate): void {
    let k = 0;
    for (const id of [p.loot, p.loot2]) {
      const it = id >= 0 ? this.items[id] : undefined;
      if (!it) continue;
      const a = k++ * 2.4;
      it.st = P.LS_DROPPED; it.holder = -1; it.x = p.x + Math.cos(a) * 0.4 * k; it.z = p.z + Math.sin(a) * 0.4 * k; it.dropAt = this.tick; it.lockUntil = this.tick + PICK_LOCK;
      this.fx(['dr', it.id, r2(it.x), r2(it.z)]);
    }
    p.loot = -1; p.loot2 = -1;
    this.lootDirty = true;
  }

  // ------------------------------------------------------------------ защитники

  private find(pid: number): EventPlayer | undefined {
    for (const p of this.ppl) if (p.pid === pid) return p;
    return undefined;
  }

  private person(pl: EventPlayer): Person {
    let p = this.people.get(pl.pid);
    if (!p) { p = { pid: pl.pid, slot: pl.slot, nick: pl.nick, kos: 0, sinks: 0, hits: 0, saves: 0 }; this.people.set(pl.pid, p); }
    p.slot = pl.slot;
    return p;
  }

  /**
   * ЛКМ защитника (кнопка огня из обычного ввода): у береговой пушки — выстрел ядром, иначе — маркер. Всё решает сервер:
   * клиент присылает только взгляд и тик, который видел. Возвращает true, если выстрел состоялся.
   */
  fire(pid: number, input: Pick<Input, 'yaw' | 'pitch' | 'viewTick'>): boolean {
    if (this.v.phase !== 'raid' || !Number.isFinite(input.yaw) || !Number.isFinite(input.pitch)) return false;
    const pl = this.find(pid);
    if (!pl || !pl.eligible || pl.state.y > 1.4 || pl.state.y < -0.4) return false;
    let ci = -1, near = P.PIRATE_CANNON_R;
    for (let i = 0; i < P.PIRATE_CANNONS.length; i++) {
      const c = P.PIRATE_CANNONS[i], d = Math.hypot(pl.state.x - c.x, pl.state.z - c.z);
      if (d <= near) { near = d; ci = i; }
    }
    return ci >= 0 ? this.fireCannon(pl, ci, input) : this.fireMarker(pl, input);
  }

  private aimBoats(): P.AimBoat[] {
    const list: P.AimBoat[] = [];
    for (const b of this.boats) if (b.st === P.DS_IN && this.tick - b.born >= LOWER || b.st === P.DS_MOOR || b.st === P.DS_DOCK || b.st === P.DS_OUT) list.push({ id: b.id, x: b.x, z: b.z, vx: b.vx, vz: b.vz });
    return list;
  }

  private fireCannon(pl: EventPlayer, ci: number, input: Pick<Input, 'yaw' | 'pitch'>): boolean {
    if (this.tick < this.cannonAt[ci]) return false;
    const c = P.PIRATE_CANNONS[ci], s = pl.state, o = P.aimOrigin(s.x, s.y, s.z, input.yaw);
    const shot = P.cannonSolve(c.x, c.z, o.x, o.y, o.z, input.yaw, input.pitch, this.aimBoats(), this.v.hp > 0, this.shot);
    if (!shot.ok) return false;
    this.cannonAt[ci] = this.tick + P.PIRATE_CANNON_CD;
    const per = this.person(pl);
    this.shells.push({ at: this.tick + shot.ticks, kind: shot.kind, ship: false, by: per.pid, x: shot.x, y: shot.y, z: shot.z });
    this.fx(['fire', ci, pl.slot, r2(shot.x), r2(shot.y), r2(shot.z), shot.ticks, shot.kind]);
    return true;
  }

  private fireMarker(pl: EventPlayer, input: Pick<Input, 'yaw' | 'pitch' | 'viewTick'>): boolean {
    const tick = this.tick;
    if (tick < (this.markerAt.get(pl.pid) ?? 0)) return false;
    this.markerAt.set(pl.pid, tick + P.PIRATE_MARKER_CD);
    const s = pl.state, f = { x: 0, y: 0, z: 0 };
    viewDir(input.yaw, input.pitch, f);
    const o = P.aimOrigin(s.x, s.y, s.z, input.yaw), ox = o.x, oy = o.y, oz = o.z;
    // цели такими, какими их видел стрелок (до MAX_REWIND_TICKS назад), сам стрелок — как сейчас
    const wanted = Math.floor(Math.max(tick - MAX_REWIND_TICKS, Math.min(tick, Number.isFinite(input.viewTick) ? input.viewTick : tick)));
    const old = this.history[((wanted % HIST) + HIST) % HIST];
    const frame = old?.tick === wanted ? old : undefined;
    let best: Pirate | null = null, bestT = P.PIRATE_MARKER_RANGE;
    for (let t = 0.6; t <= P.PIRATE_MARKER_RANGE && !best; t += 0.2) {
      const qx = ox + f.x * t, qy = oy + f.y * t, qz = oz + f.z * t;
      if (qy < -0.2 || qy > 2.1) { if (qy < -0.2) break; continue; }
      for (const p of this.pirates) {
        if (p.aboard || p.st === P.PS_JUMP) continue;
        let px = p.x, pz = p.z;
        if (frame) { const i = frame.ids.indexOf(p.id); if (i >= 0) { px = frame.xs[i]; pz = frame.zs[i]; } else continue; }
        const r = p.captain ? P.PIRATE_CAPTAIN_HIT_R : P.PIRATE_HIT_R;
        if ((qx - px) ** 2 + (qz - pz) ** 2 < r * r) { best = p; bestT = t; break; }
      }
    }
    // стена между стрелком и целью (невидимые столбы и кнехты не мешают)
    let end = bestT;
    if (this.world.raycast(ox, oy, oz, f.x, f.y, f.z, best ? bestT : P.PIRATE_MARKER_RANGE, this.ray, true, true) && this.ray.t > 0.25) { end = this.ray.t; best = null; }
    else if (!best) {
      end = P.PIRATE_MARKER_RANGE;
      if (f.y < -0.01) {
        const tg = -oy / f.y, tw = (-1.25 - oy) / f.y;
        const gz = oz + f.z * tg;
        end = Math.min(end, gz <= 21.95 ? tg : tw);
      }
    }
    this.fx(['pt', pl.slot, r2(ox), r2(oy), r2(oz), r2(ox + f.x * end), r2(oy + f.y * end), r2(oz + f.z * end), best ? 1 : 0]);
    if (best) this.paint(best, this.person(pl), pl.slot);
    return true;
  }

  /** Попали краской: оглушение (и бросает ношу); последнее попадание — заляпан, уходит с лужей краски */
  private paint(p: Pirate, per: Person, slot: number): void {
    per.hits++; p.by = slot;
    p.hp--;
    if (p.hp <= 0) {
      per.kos++;
      if (p.loot >= 0) this.drop(p);
      this.fx(['ko', p.id, slot, r2(p.x), r2(p.z)]);
      this.removePirate(p);
      return;
    }
    if (p.loot >= 0 && (!p.captain || p.hp % 2 === 0)) this.drop(p);
    p.st = P.PS_STUN; p.until = this.tick + (p.captain ? 12 : P.PIRATE_STUN); p.want = -1;
    if (p.captain && p.hp <= 4) p.rage = true;
    this.fx(['ph', p.id, slot, p.hp, r2(p.x), r2(p.z)]);
  }

  private rescue(): void {
    for (const it of this.items) {
      if (it.st !== P.LS_DROPPED || this.tick < it.dropAt + 12) continue;
      for (const pl of this.ppl) {
        if (!pl.eligible || Math.abs(pl.state.y) > 1.5 || Math.hypot(pl.state.x - it.x, pl.state.z - it.z) > P.PIRATE_SAVE_R) continue;
        const per = this.person(pl);
        per.saves++;
        this.fx(['rs', it.id, pl.slot, r2(it.x), r2(it.z)]);
        it.st = P.LS_PILE; it.x = it.home.x; it.z = it.home.z;
        this.lootDirty = true;
        break;
      }
    }
  }

  // ------------------------------------------------------------------ ядра

  private landShell(sh: Shell): void {
    if (sh.ship) { this.shipImpact(sh); return; }
    const per = this.people.get(sh.by);
    const slot = per?.slot ?? -1;
    if (sh.kind === P.SK_SHIP) {
      if (this.v.hp > 0 && this.v.phase === 'raid') {
        this.v.hp--; this.dirty = true;
        if (per) per.hits++;
        this.fx(['hit', slot, this.v.hp, r2(sh.x), r2(sh.y), r2(sh.z)]);
        if (this.v.hp <= 0) this.finish(true, 'ship');
      }
      return;
    }
    // шлюпка рядом с местом падения (радиус всплеска — щедрый)
    let hit: Boat | null = null, dd = P.PIRATE_SPLASH_R;
    for (const b of this.boats) {
      if (b.st !== P.DS_IN && b.st !== P.DS_MOOR && b.st !== P.DS_DOCK && b.st !== P.DS_OUT) continue;
      const d = Math.hypot(b.x - sh.x, b.z - sh.z);
      if (d < dd) { dd = d; hit = b; }
    }
    if (!hit) { this.fx(['wh', slot, r2(sh.x), r2(sh.z)]); return; }
    hit.hp--;
    if (per) per.hits++;
    if (hit.hp > 0) { this.fx(['dh', hit.id, hit.hp, slot, r2(hit.x), r2(hit.z)]); return; }
    this.sink(hit, per);
  }

  private sink(b: Boat, per: Person | undefined): void {
    let worth = b.cargo.length > 0;
    b.st = P.DS_SUNK; b.since = this.tick;
    for (const id of b.crew) {
      const p = this.pirates.find(q => q.id === id);
      if (!p) continue;
      if (p.aboard) { worth = true; this.fx(['fl', p.id, r2(b.x), r2(b.z)]); this.pirates = this.pirates.filter(q => q !== p); }
      else this.strand(p);
    }
    b.crew = b.crew.filter(id => this.pirates.some(q => q.id === id));
    for (const id of b.cargo) {
      const it = this.items[id];
      it.st = P.LS_PILE; it.holder = -1; it.boat = -1; it.x = it.home.x; it.z = it.home.z;
      this.fx(['rs', id, 0, r2(b.x), r2(b.z)]);
    }
    b.cargo = [];
    if (per && worth) per.sinks++;
    this.fx(['sink', b.id, per?.slot ?? -1, r2(b.x), r2(b.z)]);
    this.lootDirty = true;
    this.count();
  }

  /** Ядро корабля упало на причал: ящики рядом разлетаются и лежат на земле; людей и пиратов не трогает */
  private shipImpact(sh: Shell): void {
    this.fx(['sk', r2(sh.x), r2(sh.z)]);
    for (const it of this.items) {
      if (it.st !== P.LS_PILE || Math.hypot(it.x - sh.x, it.z - sh.z) > P.PIRATE_SHELL_R) continue;
      const a = Math.atan2(it.z - sh.z, it.x - sh.x) + (this.random() - 0.5) * 0.8, d = 1.2 + this.random() * 1.2;
      const to = this.nav.nearest(sh.x + Math.cos(a) * d, sh.z + Math.sin(a) * d);
      it.st = P.LS_DROPPED; it.x = to.x + (this.random() - 0.5) * 0.3; it.z = to.z + (this.random() - 0.5) * 0.3; it.dropAt = this.tick; it.lockUntil = this.tick + PICK_LOCK;
      this.fx(['dr', it.id, r2(it.x), r2(it.z)]);
      this.lootDirty = true;
    }
    this.count();
  }

  private shipFire(): void {
    const piles: number[][] = P.PIRATE_PILES.map(() => []);
    for (const it of this.items) if (it.st === P.LS_PILE) piles[it.home.pile].push(it.id);
    const total = piles.reduce((n, a) => n + a.length, 0);
    // пробитый корабль стреляет реже
    this.shellAt = this.tick + Math.round(P.PIRATE_SHELL_EVERY * (this.v.hp * 2 <= this.v.hpMax ? 1.5 : 1));
    if (!total) return;
    let k = Math.floor(this.random() * total), pile = 0;
    while (k >= piles[pile].length) { k -= piles[pile].length; pile++; }
    const c = P.PIRATE_PILES[pile], x = c.x + (this.random() - 0.5) * 2.2, z = c.z + (this.random() - 0.5) * 2.2;
    this.shells.push({ at: this.tick + P.PIRATE_SHELL_FLIGHT, kind: P.SK_WATER, ship: true, by: -1, x, y: 0, z });
    this.fx(['sh', this.shellN++ % 4, r2(x), r2(z), P.PIRATE_SHELL_FLIGHT]);
  }

  // ------------------------------------------------------------------ ход набега

  private stepRaid(): void {
    const tick = this.tick, v = this.v;
    for (let i = this.launches.length - 1; i >= 0; i--) if (this.launches[i].at <= tick) { this.spawnBoat(this.launches[i]); this.launches.splice(i, 1); }
    for (const b of [...this.boats]) this.stepBoat(b);
    for (const p of [...this.pirates]) if (!p.aboard || p.st === P.PS_JUMP) this.stepPirate(p);
    this.boats = this.boats.filter(b => b.st !== P.DS_GONE);
    for (let i = this.shells.length - 1; i >= 0; i--) if (this.shells[i].at <= tick) { const sh = this.shells[i]; this.shells.splice(i, 1); this.landShell(sh); if (v.phase !== 'raid') return; }
    if (tick >= this.shellAt && v.hp > 0) this.shipFire();
    this.rescue();
    this.count();
    // конец: утащили слишком много / корабль пробит / волны кончились / время
    if (v.stolen >= v.limit) { this.finish(false, 'stolen'); return; }
    const active = this.boats.some(b => b.st === P.DS_IN || b.st === P.DS_MOOR || b.st === P.DS_DOCK) || this.launches.length > 0 || this.pirates.some(p => !p.aboard);
    if (!active) {
      if (v.wave >= v.waves) { this.finish(true, 'waves'); return; }
      if (!this.clearAt) this.clearAt = tick + P.PIRATE_WAVE_GAP;
      else if (tick >= this.clearAt) this.launchWave();
    } else if (tick - this.waveAt >= P.PIRATE_WAVE_MAX && v.wave < v.waves && !this.launches.length) this.launchWave();
    if (tick >= v.end) { this.finish(v.stolen < v.limit, 'time'); return; }
    this.record();
  }

  private record(): void {
    const f: Frame = { tick: this.tick, ids: [], xs: [], zs: [] };
    for (const p of this.pirates) if (!p.aboard) { f.ids.push(p.id); f.xs.push(p.x); f.zs.push(p.z); }
    this.history[this.tick % HIST] = f;
  }

  // ------------------------------------------------------------------ финал

  private finish(win: boolean, why: string): void {
    const v = this.v;
    if (v.phase !== 'raid') return;
    v.phase = 'end'; v.start = this.tick; v.end = this.tick + P.PIRATE_END; v.win = win;
    v.fleeAt = this.tick + sec(win ? 2 : 3);
    this.launches = []; this.shells = [];
    // пираты на причале бегут в воду; шлюпки уходят: на победе — без добычи (она всплывает обратно), на поражении — с ней
    for (const p of [...this.pirates]) if (!p.aboard) this.strand(p);
    for (const b of this.boats) {
      if (b.st === P.DS_SUNK) continue;
      if (win) {
        for (const id of b.cargo) { const it = this.items[id]; it.st = P.LS_PILE; it.boat = -1; it.holder = -1; it.x = it.home.x; it.z = it.home.z; this.fx(['rs', id, 0, r2(b.x), r2(b.z)]); }
        b.cargo = [];
      }
      if (b.st !== P.DS_OUT) { b.st = P.DS_OUT; b.since = this.tick; }
      for (const id of b.crew) { const p = this.pirates.find(q => q.id === id); if (p && p.aboard) p.st = win ? P.PS_FLEE : P.PS_CHEER; }
    }
    if (win) for (const it of this.items) if (it.st === P.LS_DROPPED || it.st === P.LS_CARRIED) { it.st = P.LS_PILE; it.holder = -1; it.x = it.home.x; it.z = it.home.z; }
    this.lootDirty = true;
    this.count();
    // итоги и награды: один раз, только начисления
    const list = [...this.people.values()].filter(p => p.kos + p.sinks + p.hits + p.saves > 0);
    list.sort((a, b) => P.contribution(b) - P.contribution(a) || a.pid - b.pid);
    v.results = list.map((p, i) => {
      const mvp = i === 0;
      const tokens = P.pirateReward(p, win, mvp);
      this.host.award(p.pid, tokens, { prRaids: 1, prWins: win ? 1 : 0, prKos: p.kos });
      return { pid: p.pid, nick: p.nick, kos: p.kos, sinks: p.sinks, hits: p.hits, saves: p.saves, tokens, mvp };
    });
    const best = v.results[0]?.nick;
    this.host.chat(win
      ? `🏆 Набег отбит! ${why === 'ship' ? 'Корабль пробит и уходит' : 'Пираты уходят ни с чем'}. Украдено ${v.stolen} из ${v.total}.${best ? ` Лучший защитник: ${best}.` : ''}`
      : `🏴‍☠️ Пираты утащили добычу: ${v.stolen} из ${v.total}. Награда — за заслуги.${best ? ` Лучший защитник: ${best}.` : ''}`);
    this.fx([win ? 'win' : 'lose', v.stolen]);
    this.dirty = true;
    this.sendView();
    this.flush();
  }

  private stepEnd(): void {
    const tick = this.tick;
    for (const b of [...this.boats]) this.stepBoat(b);
    for (const p of [...this.pirates]) if (!p.aboard) this.stepPirate(p);
    this.boats = this.boats.filter(b => b.st !== P.DS_GONE);
    if (tick >= this.v.end) {
      this.reset();
      this.sendView();
      this.host.snap({ t: 'pnow', k: tick, p: [], d: [], l: [] });
    }
  }

  // ------------------------------------------------------------------ сообщения

  private fx(e: P.PirateFx): void { this.fxq.push(e); }

  private sendView(): void { this.dirty = false; this.host.view(this.view()); }

  /** Быстрое состояние для клиентов; full — вместе со всеми вещами (новому игроку) */
  snapshot(full = true): P.PirateSnapMsg | null {
    if (this.v.phase === 'idle') return null;
    const p: P.PirateRow[] = [];
    for (const q of this.pirates) {
      let flags = (q.captain ? P.PL_CAPTAIN : 0) | (q.rage ? P.PL_RAGE : 0);
      if (q.loot >= 0) flags |= P.lootIsBarrel(q.loot) ? P.PL_BARREL : P.PL_CRATE;
      if (q.loot2 >= 0) flags |= P.lootIsBarrel(q.loot2) ? P.PL_BARREL : P.PL_CRATE;
      if (q.aboard) { flags |= P.PL_ABOARD; p.push([q.id, q.boat, q.seat, r2(q.yaw), q.st, q.hp, flags, q.loot]); }
      else p.push([q.id, r2(q.x), r2(q.z), r2(q.yaw), q.st, q.hp, flags, q.loot]);
    }
    const d: P.DinghyRow[] = [];
    for (const b of this.boats) {
      let crew = 0;
      for (const id of b.crew) if (this.pirates.some(q => q.id === id && q.aboard)) crew++;
      d.push([b.id, r2(b.x), r2(b.z), r2(b.yaw), b.st, b.cargo.length, crew, b.hp]);
    }
    const m: P.PirateSnapMsg = { t: 'pnow', k: this.tick, p, d };
    if (full) m.l = this.items.map(it => [it.id, it.st, it.st === P.LS_BOAT ? it.boat : r2(it.x), it.st === P.LS_BOAT ? it.slot : r2(it.z)] as P.LootRow);
    return m;
  }

  private flush(): void {
    const tick = this.tick;
    if (this.fxq.length) { const e = this.fxq; this.fxq = []; this.host.fx({ t: 'pfx', k: tick, e }); }
    if (tick % SNAP_EVERY === 0) {
      const empty = !this.pirates.length && !this.boats.length;
      if (!empty || !this.sentEmpty || this.lootDirty) {
        const m = this.snapshot(this.lootDirty || tick % (2 * TICK_RATE) === 0);
        if (m) this.host.snap(m);
        this.lootDirty = false;
        this.sentEmpty = empty;
      }
      if (this.dirty) this.sendView();
    }
  }
}
