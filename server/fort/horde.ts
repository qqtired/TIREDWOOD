// Орда «Крепости»: зомби — появление по расписанию волны, шаг по полю расстояний, расталкивание, ворота (встают
// перед створками и бьют), кристалл, люди на земле рядом, липучки (лезут на стену, стоят на ходу, прыгают во двор),
// пузыри (лопаются, задевая соседей, — цепочкой), застрявшие (обратно в начало дороги), история позиций для отката
// выстрелов. Пул на FORT_MAX_ALIVE мест, в тике без аллокаций. Люди, ворота, кристалл и очки — через HordeHost (game.ts).
import { DT, TICK_RATE } from '../../shared/constants.ts';
import {
  BOSS_ARMOR, BOSS_BOMB_R, BOSS_CRYSTAL_DMG, BOSS_GATE_DMG, BOSS_OPEN_TICKS, BOSS_PULSE_R, BOSS_WARN_TICKS,
  FLY_CRYSTAL_DMG, FLY_DIVE_TICKS, FLY_R, FLY_RECOVER_TICKS, FLY_WARN_TICKS,
  CLIMB_DROP_TICKS, CLIMB_SPEED, CLIMB_TOP_TICKS, FORT_MAX_ALIVE, POP_CRYSTAL, POP_GATE, POP_PLAYER, POP_R, POP_ZOMBIE, ZK, ZS_ATTACK, ZS_CLIMB,
  ZS_DROP, ZS_TOP, ZS_WALK, Z_AGGRO, Z_BLOATER, Z_BRUTE, Z_CLIMBER, Z_GATE_EVERY, Z_GATE_GAP, Z_HIT_EVERY, Z_KINDS, Z_STUCK_TICKS, waveCounts,
  Z_BOSS, Z_FLYER, Z_RUNNER, ZS_BOSS_APPROACH, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_OPEN, ZS_BOSS_PULSE,
  ZS_FLY_DIVE, ZS_FLY_RECOVER, ZS_FLY_WARN, defenderCount, waveRole, waveSpawnTicks, zombieHp, type FortEvent,
} from '../../shared/fort.ts';
import { CLIMBS, CRYSTAL, GATE, PARAPET_H, PEDESTAL, ROADS, WALL_H, WALL_T, insideFort } from '../../shared/fortmap.ts';
import type { ZombieSnap } from '../../shared/fortnet.ts';
import { FortNav, rectDist } from './nav.ts';

/** История для отката выстрелов: тиков (откат — до MAX_REWIND_TICKS) */
export const ZHIST_TICKS = 32;
/** Человек — цель: номер, ноги */
export interface HordeTarget {
  id: number;
  x: number;
  y: number;
  z: number;
}

export interface HordeHost {
  readonly tick: number;
  /** Створки ворот стоят */
  gateUp(): boolean;
  hitGate(dmg: number): void;
  hitCrystal(dmg: number): void;
  /** Живые люди (обновляет хозяин перед шагом) */
  targets(): readonly HordeTarget[];
  hitPlayer(zid: number, pid: number, dmg: number): void;
  /** First solid obstacle on an attack segment. out is collision point (or endpoint); true means blocked. */
  traceAttack(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, out: { x: number; y: number; z: number }): boolean;
  /** Во сколько раз медленнее в этой точке (лужи варенья): 1 — как обычно */
  slow(x: number, z: number): number;
  /** Сбит: кем (0 — никем: краскомёт, сам лопнул у цели) */
  killed(z: Zombie, by: number): void;
  event(e: FortEvent): void;
}

export class Zombie {
  readonly slot: number;
  id = 0;
  kind = 0;
  state = ZS_WALK;
  alive = false;
  hp = 0;
  maxHp = 1;
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  vx = 0;
  vz = 0;
  /** С какой дороги пришёл (застрял — туда же обратно) */
  road = 0;
  /** Липучка: номер точки на стене (−1 — уже во дворе или не липучка) */
  climb = -1;
  /** Бьёт: перезарядка удара и счётчик ударов (для взмаха на клиенте) */
  atkCd = 0;
  atk = 0;
  /** Кого преследует (номер человека, 0 — никого) */
  chase = 0;
  /** Таймер подъёма, стояния на стене, прыжка */
  t = 0;
  fromX = 0;
  fromY = 0;
  fromZ = 0;
  toX = 0;
  toY = 0;
  toZ = 0;
  /** Boss health phase and attack index. */
  stage = 0;
  attackIndex = 0;
  addsMask = 0;
  /** Лучшее расстояние до цели и сколько тиков не приближался */
  bestD = 1e9;
  stuck = 0;
  /** Кто последним попал (пузырь, лопнувший от краски, — его выстрел) */
  lastBy = 0;
  readonly damageBy = new Map<number, number>();

  constructor(slot: number) {
    this.slot = slot;
  }
}

interface Spawn {
  at: number;
  kind: number;
  road: number;
}

/** Шаг сетки расталкивания: не меньше двух самых больших радиусов */
const HASH = 1.6;
/** Сколько до игрока — «дотянулся» (радиус зомби + полкорпуса игрока + руки) */
const REACH = 0.42 + 0.4;
/** Ближе этого к воротам или постаменту — ждёт в толпе, а не «застрял» */
const QUEUE_GATE = 12;
const QUEUE_CRYSTAL = 7;

const _p = { x: 0, z: 0 };
const _d = { x: 0, z: 0 };
const _attack = { x: 0, y: 0, z: 0 };

export class Horde {
  readonly nav: FortNav;
  readonly zombies: Zombie[] = [];
  private readonly host: HordeHost;
  private readonly rng: () => number;
  private nextId = 1;
  private queue: Spawn[] = [];
  private queueAt = 0;
  /** Сколько живых */
  alive = 0;
  // расталкивание
  private readonly hcols: number;
  private readonly hrows: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;
  // история: на тик — по месту x, y, z, номер (0 — пусто)
  private readonly histTick = new Int32Array(ZHIST_TICKS).fill(-1);
  private readonly hist = new Float64Array(ZHIST_TICKS * FORT_MAX_ALIVE * 4);
  /** Пузыри, которые лопнут в этом же тике (цепочка), и кто их лопнул */
  private readonly pops: Zombie[] = [];
  private readonly popBy: number[] = [];

  constructor(nav: FortNav, host: HordeHost, rng: () => number) {
    this.nav = nav;
    this.host = host;
    this.rng = rng;
    for (let i = 0; i < FORT_MAX_ALIVE; i++) this.zombies.push(new Zombie(i));
    this.hcols = Math.ceil((nav.cols * 0.5) / HASH) + 1;
    this.hrows = Math.ceil((nav.rows * 0.5) / HASH) + 1;
    this.head = new Int32Array(this.hcols * this.hrows);
    this.next = new Int32Array(FORT_MAX_ALIVE);
  }

  /** Сколько ещё выйдет в этой волне */
  get pending(): number {
    return this.queue.length - this.queueAt;
  }

  /** В волне: ещё не вышли + живые */
  get left(): number {
    return this.pending + this.alive;
  }

  /** Все вышли и все сбиты */
  get cleared(): boolean {
    return this.pending === 0 && this.alive === 0;
  }

  /** Убрать всех (новая игра) */
  clear(): void {
    for (const z of this.zombies) z.alive = false;
    this.alive = 0;
    this.queue = [];
    this.queueAt = 0;
    this.pops.length = 0;
    this.popBy.length = 0;
    this.wave = 0;
    this.hpHumans = 1;
  }

  /** Расписание волны: состав по числу людей, вперемешку, равномерно за waveSpawnTicks (бугаи — во второй половине). */
  startWave(wave: number, humans: number, tick: number): void {
    humans = defenderCount(humans);
    this.wave = wave;
    const counts = waveCounts(wave, humans);
    const kinds: number[] = [];
    for (let k = 0; k < Z_KINDS; k++) for (let i = 0; i < counts[k]; i++) kinds.push(k);
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    // бугаи — не в первых 40 %: сначала мелочь, громилы подходят, когда на стенах уже жарко
    const early = Math.floor(kinds.length * 0.4);
    for (let i = 0; i < early; i++) {
      if (kinds[i] !== Z_BRUTE) continue;
      for (let tries = 0; tries < 20; tries++) {
        const j = early + Math.floor(this.rng() * (kinds.length - early));
        if (kinds[j] === Z_BRUTE) continue;
        [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
        break;
      }
    }
    // Boss comes first and shares the same live pool. Each pulse has a visible direction and a gap afterwards.
    const bossAt = kinds.indexOf(Z_BOSS);
    if (bossAt >= 0) [kinds[0], kinds[bossAt]] = [kinds[bossAt], kinds[0]];
    const span = waveSpawnTicks(wave);
    const role = waveRole(wave);
    this.queue = kinds.map((kind, i) => {
      const pulse = Math.min(role.pulses - 1, Math.floor(i * role.pulses / kinds.length));
      const start = Math.ceil(pulse * kinds.length / role.pulses);
      const end = Math.ceil((pulse + 1) * kinds.length / role.pulses);
      const within = (i - start) / Math.max(1, end - start);
      return { at: tick + 30 + Math.floor(span * (pulse + within * (role.pulses === 1 ? 1 : 0.5)) / role.pulses), kind,
        road: kind === Z_BOSS ? 1 : role.roads[pulse % role.roads.length] };
    });
    this.queueAt = 0;
    this.hpHumans = humans;
  }

  private hpHumans = 1;
  private wave = 0;

  get defenders(): number { return this.hpHumans; }

  /** Peak concurrent roster within this wave. Departures never cancel committed pressure.
   * Add only a quota delta, retaining spent/dead enemies and existing damage fraction. */
  raiseDefenders(humans: number, tick: number): boolean {
    const n = defenderCount(humans);
    if (!this.wave || n <= this.hpHumans) return false;
    const before = waveCounts(this.wave, this.hpHumans);
    const after = waveCounts(this.wave, n);
    this.hpHumans = n;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const fraction = z.hp / z.maxHp;
      z.maxHp = zombieHp(z.kind, n);
      z.hp = z.maxHp * fraction;
    }
    const extra: Spawn[] = [];
    const roads = waveRole(this.wave).roads;
    for (let kind = 0; kind < Z_KINDS; kind++) {
      for (let i = before[kind]; i < after[kind]; i++) {
        const at = extra.length;
        extra.push({ at: tick + 3 * TICK_RATE + at * 10, kind, road: roads[at % roads.length] });
      }
    }
    // Consumed prefix is discarded; quota still derives from the locked roster, not queue length.
    this.queue = this.queue.slice(this.queueAt).concat(extra).sort((a, b) => a.at - b.at);
    this.queueAt = 0;
    return true;
  }

  /** Выпустить зомби kind с дороги road (тесты и расписание). null — мест нет. */
  spawn(kind: number, road: number, hpHumans = this.hpHumans): Zombie | null {
    if (!ZK[kind] || !ROADS[road]) return null;
    let z: Zombie | null = null;
    for (const c of this.zombies) {
      if (!c.alive) {
        z = c;
        break;
      }
    }
    if (!z) return null;
    const pts = ROADS[road].pts;
    const [sx, sz] = pts[0];
    const [nx, nz] = pts[1];
    let x = sx;
    let zz = sz;
    for (let i = 0; i < 8; i++) {
      const tx = sx + (this.rng() - 0.5) * 5;
      const tz = sz + (this.rng() - 0.5) * 5;
      if (this.nav.isFree(tx, tz)) {
        x = tx;
        zz = tz;
        break;
      }
    }
    z.id = this.nextId;
    this.nextId = this.nextId >= 65535 ? 1 : this.nextId + 1;
    z.kind = kind;
    z.state = kind === Z_BOSS ? ZS_BOSS_APPROACH : ZS_WALK;
    z.alive = true;
    z.maxHp = zombieHp(kind, hpHumans);
    z.hp = z.maxHp;
    z.x = x;
    z.y = kind === Z_FLYER ? WALL_H + 4 : 0;
    z.z = zz;
    z.yaw = Math.atan2(-(nx - sx), -(nz - sz));
    z.vx = 0;
    z.vz = 0;
    z.road = road;
    z.climb = kind === Z_CLIMBER ? climbFor(road, this.rng()) : -1;
    z.atkCd = 0;
    z.atk = 0;
    z.chase = 0;
    z.t = 0;
    z.bestD = 1e9;
    z.stuck = 0;
    z.lastBy = 0;
    z.damageBy.clear();
    z.stage = kind === Z_BOSS ? 1 : 0;
    z.attackIndex = 0;
    z.addsMask = 0;
    z.fromY = z.toY = 0;
    z.fromX = z.toX = z.fromZ = z.toZ = 0;
    this.alive++;
    return z;
  }

  // ------------------------------------------------------------ урон

  /** Попадание (выстрел — by = номер стрелка, краскомёт — 0). */
  damage(z: Zombie, dmg: number, by: number, head: boolean, hx: number, hy: number, hz: number): void {
    if (!z.alive) return;
    if (!(dmg > 0) || !Number.isFinite(dmg)) return;
    if (z.kind === Z_BOSS && z.state !== ZS_BOSS_OPEN) dmg *= BOSS_ARMOR;
    z.hp -= dmg;
    if (by) {
      z.lastBy = by;
      z.damageBy.set(by, (z.damageBy.get(by) ?? 0) + Math.max(0, Math.min(dmg, z.hp + dmg)));
    }
    this.host.event(['zhit', by, z.id, Math.round(dmg), head ? 1 : 0, r2(hx), r2(hy), r2(hz)]);
    if (z.hp <= 0.5) this.kill(z, by);
    this.drainPops();
  }

  private kill(z: Zombie, by: number): void {
    if (!z.alive) return;
    z.alive = false;
    z.hp = 0;
    this.alive--;
    this.host.event(['zdie', z.id, by, r2(z.x), r2(z.y), r2(z.z), z.kind]);
    this.host.killed(z, by);
    if (z.kind === Z_BLOATER) {
      this.pops.push(z);
      this.popBy.push(by);
    }
  }

  /** Пузырь лопнул: ворота, кристалл, люди и зомби рядом; сбитые им пузыри лопаются следом (тут же, очередью). */
  private drainPops(): void {
    for (let i = 0; i < this.pops.length; i++) {
      const b = this.pops[i];
      const by = this.popBy[i];
      const host = this.host;
      host.event(['pop', r2(b.x), r2(b.y + 0.8), r2(b.z)]);
      if (host.gateUp() && rectDist(b.x, b.z, GATE.x0, GATE.face - 0.5, GATE.x1, GATE.z1) < POP_R
        && !host.traceAttack(b.x, b.y + 0.8, b.z, clamp(b.x, GATE.x0, GATE.x1), clamp(b.y + 0.8, 0, GATE.h), clamp(b.z, GATE.face, GATE.z1), _attack)) host.hitGate(POP_GATE);
      const D = PEDESTAL;
      if (rectDist(b.x, b.z, D.x0, D.z0, D.x1, D.z1) < POP_R && b.y < 2
        && !host.traceAttack(b.x, b.y + 0.8, b.z, clamp(b.x, D.x0, D.x1), Math.min(D.h, b.y + 0.8), clamp(b.z, D.z0, D.z1), _attack)) host.hitCrystal(POP_CRYSTAL);
      for (const p of host.targets()) {
        if (Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) < POP_R
          && !host.traceAttack(b.x, b.y + 0.8, b.z, p.x, p.y + 0.8, p.z, _attack)) host.hitPlayer(b.id, p.id, POP_PLAYER);
      }
      for (const o of this.zombies) {
        if (!o.alive || o === b) continue;
        if (Math.hypot(o.x - b.x, o.y - b.y, o.z - b.z) >= POP_R) continue;
        if (host.traceAttack(b.x, b.y + 0.8, b.z, o.x, o.y + ZK[o.kind].hcy, o.z, _attack)) continue;
        o.hp -= POP_ZOMBIE;
        if (o.hp <= 0.5) this.kill(o, by);
      }
    }
    this.pops.length = 0;
    this.popBy.length = 0;
  }

  // ------------------------------------------------------------ тик

  step(): void {
    const tick = this.host.tick;
    // расписание волны
    while (this.queueAt < this.queue.length && this.queue[this.queueAt].at <= tick) {
      const s = this.queue[this.queueAt];
      if (!this.spawn(s.kind, s.road)) break; // мест нет — подождут
      this.queueAt++;
    }
    const gateUp = this.host.gateUp();
    for (const z of this.zombies) {
      if (!z.alive) continue;
      if (z.atkCd > 0) z.atkCd--;
      if (z.kind === Z_FLYER) this.stepFlyer(z);
      else if (z.kind === Z_BOSS) this.stepBoss(z);
      else if (z.state === ZS_CLIMB || z.state === ZS_TOP || z.state === ZS_DROP) this.stepClimber(z);
      else this.stepGround(z, gateUp);
    }
    this.separate();
    for (const z of this.zombies) {
      if (!z.alive || z.kind === Z_BOSS || z.y > 0.01) continue;
      const r = ZK[z.kind].r;
      _p.x = z.x;
      _p.z = z.z;
      this.nav.collide(_p, r, gateUp);
      z.x = _p.x;
      z.z = _p.z;
      // створки стоят — встаём в Z_GATE_GAP от них (сверху видно, по кому стрелять)
      if (gateUp && z.z < GATE.face && Math.abs(z.x) < GATE.x1) z.z = Math.min(z.z, GATE.face - Z_GATE_GAP - r);
    }
    this.drainPops();
    this.record(tick);
  }

  /** Flyers use 3D approaches over the parapet and commit to a fixed mark before the dive. */
  private stepFlyer(z: Zombie): void {
    if (z.state === ZS_FLY_WARN) {
      if (--z.t > 0) return;
      z.state = ZS_FLY_DIVE;
      z.t = FLY_DIVE_TICKS;
      z.fromX = z.x;
      z.fromY = z.y;
      z.fromZ = z.z;
      return;
    }
    if (z.state === ZS_FLY_DIVE) {
      const u = 1 - Math.max(0, --z.t) / FLY_DIVE_TICKS;
      const x = z.fromX + (z.toX - z.fromX) * u;
      const y = z.fromY + (z.toY - z.fromY) * u;
      const zz = z.fromZ + (z.toZ - z.fromZ) * u;
      const blocked = this.host.traceAttack(z.x, z.y + ZK[Z_FLYER].hcy, z.z, x, y + ZK[Z_FLYER].hcy, zz, _attack);
      if (blocked) {
        z.state = ZS_FLY_RECOVER;
        z.t = FLY_RECOVER_TICKS;
        return;
      }
      z.x = x;
      z.y = y;
      z.z = zz;
      if (z.t > 0) return;
      for (const p of this.host.targets()) {
        if (Math.hypot(p.x - z.toX, p.y + 0.8 - z.toY, p.z - z.toZ) < FLY_R
          && !this.host.traceAttack(z.x, z.y + 0.5, z.z, p.x, p.y + 0.8, p.z, _attack)) this.host.hitPlayer(z.id, p.id, ZK[Z_FLYER].hit);
      }
      if (!z.chase) this.host.hitCrystal(FLY_CRYSTAL_DMG);
      z.atk = (z.atk + 1) & 255;
      this.host.event(['blast', ZS_FLY_DIVE, r2(z.toX), r2(z.toY), r2(z.toZ), FLY_R]);
      z.state = ZS_FLY_RECOVER;
      z.t = FLY_RECOVER_TICKS;
      return;
    }
    if (z.state === ZS_FLY_RECOVER) {
      z.y += (WALL_H + 4 - z.y) * 0.045;
      if (--z.t <= 0) z.state = ZS_WALK;
      return;
    }
    let target: HordeTarget | null = null;
    let best = Infinity;
    for (const p of this.host.targets()) {
      if (p.y < WALL_H - 0.4) continue;
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      if (d < best) { best = d; target = p; }
    }
    const tx = target ? target.x : CRYSTAL.x;
    const ty = target ? target.y + 0.8 : CRYSTAL.y;
    const tz = target ? target.z : CRYSTAL.z;
    const hoverY = Math.max(WALL_H + 3.8, ty + 3);
    const dx = tx - z.x;
    const dy = hoverY - z.y;
    const dz = tz - 4.5 - z.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 1.2) {
      const move = Math.min(d, ZK[Z_FLYER].speed * DT);
      z.x += dx / d * move;
      z.y += dy / d * move;
      z.z += dz / d * move;
      z.yaw = turnTo(z.yaw, Math.atan2(-dx, -dz), 0.15);
      return;
    }
    z.chase = target?.id ?? 0;
    z.toX = tx;
    z.toY = ty;
    z.toZ = tz;
    z.yaw = Math.atan2(-(tx - z.x), -(tz - z.z));
    z.state = ZS_FLY_WARN;
    z.t = FLY_WARN_TICKS;
    this.host.event(['warn', z.id, ZS_FLY_WARN, r2(tx), r2(ty), r2(tz), FLY_R, this.host.tick + z.t + FLY_DIVE_TICKS]);
  }

  /** The Baron attacks from the north: fixed bomb marks, gate slam, then a broad wall shockwave. */
  private stepBoss(z: Zombie): void {
    const stage = z.hp / z.maxHp <= 1 / 3 ? 3 : z.hp / z.maxHp <= 2 / 3 ? 2 : 1;
    if (stage > z.stage) {
      z.stage = stage;
      this.host.event(['bossphase', z.id, stage]);
    }
    // One bounded pack per threshold. Full pool means the pack is skipped, never queued without a bound.
    for (let s = 2; s <= z.stage; s++) {
      if (z.addsMask & (1 << s)) continue;
      z.addsMask |= 1 << s;
      const count = (s === 2 ? 2 : 4) + Math.ceil((this.hpHumans - 1) * (s === 2 ? .6 : 1));
      for (let i = 0; i < count; i++) {
        const add = this.spawn(s === 2 ? Z_FLYER : Z_RUNNER, i % 2 ? 0 : 2);
        if (add) {
          add.x = (i % 2 ? -1 : 1) * (7 + i);
          add.z = -29 - i * 2;
        }
      }
    }
    if (z.state === ZS_BOSS_APPROACH) {
      const dx = -z.x;
      const dz = -23 - z.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        const move = Math.min(d, ZK[Z_BOSS].speed * DT);
        z.x += dx / d * move;
        z.z += dz / d * move;
        z.yaw = turnTo(z.yaw, Math.atan2(-dx, -dz), 0.12);
        return;
      }
      z.state = ZS_WALK;
      z.t = z.stage === 3 ? 24 : z.stage === 2 ? 45 : 60;
    }
    if (z.state === ZS_BOSS_OPEN) {
      if (--z.t > 0) return;
      z.state = ZS_WALK;
      z.t = z.stage === 3 ? 24 : z.stage === 2 ? 45 : 60;
      return;
    }
    if (z.state === ZS_BOSS_GATE || z.state === ZS_BOSS_BOMB || z.state === ZS_BOSS_PULSE) {
      if (--z.t > 0) return;
      const attack = z.state;
      const r = attack === ZS_BOSS_PULSE ? BOSS_PULSE_R : attack === ZS_BOSS_GATE ? 6 : BOSS_BOMB_R;
      let covered = false;
      if (attack === ZS_BOSS_BOMB) {
        covered = this.host.traceAttack(z.toX, z.toY + 15, z.toZ, z.toX, z.toY, z.toZ, _attack);
        if (covered) z.toY = _attack.y + 0.06;
      }
      for (const p of this.host.targets()) {
        const inArea = attack === ZS_BOSS_PULSE
          ? Math.hypot(p.x - z.toX, p.z - z.toZ) < r && p.y >= WALL_H - 0.4 && p.y < WALL_H + 1.2
          : Math.hypot(p.x - z.toX, p.y + 0.8 - z.toY, p.z - z.toZ) < r;
        const visible = !this.host.traceAttack(z.toX, z.toY + 0.05, z.toZ, p.x, p.y + 0.8, p.z, _attack);
        if (inArea && visible) this.host.hitPlayer(z.id, p.id, attack === ZS_BOSS_GATE ? 20 : attack === ZS_BOSS_BOMB ? 24 : ZK[Z_BOSS].hit);
      }
      if (attack === ZS_BOSS_GATE) {
        if (this.host.gateUp()) this.host.hitGate(BOSS_GATE_DMG);
      } else if (attack === ZS_BOSS_BOMB && !z.chase && !covered) this.host.hitCrystal(BOSS_CRYSTAL_DMG);
      z.atk = (z.atk + 1) & 255;
      this.host.event(['blast', attack, r2(z.toX), r2(z.toY), r2(z.toZ), r]);
      z.state = ZS_BOSS_OPEN;
      z.t = BOSS_OPEN_TICKS;
      return;
    }
    if (z.t > 0 && --z.t > 0) return;
    const index = z.attackIndex++;
    const attack = index % 2 === 0 && this.host.gateUp() ? ZS_BOSS_GATE
      : z.stage >= 2 && index % 3 === 2 ? ZS_BOSS_PULSE : ZS_BOSS_BOMB;
    let target: HordeTarget | null = null;
    if (attack === ZS_BOSS_BOMB) {
      const targets = this.host.targets();
      // Rotate targets; the marked location never follows a player after the windup begins.
      if (targets.length) target = targets[index % targets.length];
    }
    z.chase = attack === ZS_BOSS_GATE ? -1 : target?.id ?? 0;
    z.toX = attack === ZS_BOSS_GATE || attack === ZS_BOSS_PULSE ? 0 : target?.x ?? CRYSTAL.x;
    z.toY = attack === ZS_BOSS_GATE ? 1.5 : attack === ZS_BOSS_PULSE ? WALL_H + 0.8 : target ? target.y + 0.8 : CRYSTAL.y;
    z.toZ = attack === ZS_BOSS_GATE ? GATE.face : attack === ZS_BOSS_PULSE ? -14.6 : target?.z ?? CRYSTAL.z;
    // Lock the actual roof interception before warning snapshots, so its circle marks the eventual blast.
    if (attack === ZS_BOSS_BOMB && this.host.traceAttack(z.toX, z.toY + 15, z.toZ, z.toX, z.toY, z.toZ, _attack)) z.toY = _attack.y + 0.06;
    z.state = attack;
    // Rage is faster between attacks, but every warning keeps the full readable duration.
    z.t = BOSS_WARN_TICKS;
    const r = attack === ZS_BOSS_PULSE ? BOSS_PULSE_R : attack === ZS_BOSS_GATE ? 6 : BOSS_BOMB_R;
    this.host.event(['warn', z.id, attack, r2(z.toX), r2(z.toY), r2(z.toZ), r, this.host.tick + z.t]);
  }

  /** Ходок: цель (человек рядом, точка липучки, ворота, кристалл), удар или шаг по полю. */
  private stepGround(z: Zombie, gateUp: boolean): void {
    const k = ZK[z.kind];
    const host = this.host;
    const inside = insideFort(z.x, z.z);
    let dx = 0;
    let dz = 0;
    let attacking = false;
    let field: Float32Array | null = null;

    // человек на земле по ту же сторону стены
    let target: HordeTarget | null = null;
    let best = z.chase ? Z_AGGRO + 2 : Z_AGGRO;
    for (const p of host.targets()) {
      if (p.y > 1 || insideFort(p.x, p.z) !== inside) continue;
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      if (d < best && !host.traceAttack(z.x, z.y + k.hcy, z.z, p.x, p.y + 0.8, p.z, _attack)) {
        best = d;
        target = p;
      }
    }
    if (target) {
      z.chase = target.id;
      const tx = target.x - z.x;
      const tz = target.z - z.z;
      if (best <= k.r + REACH) {
        attacking = true;
        z.yaw = Math.atan2(-tx, -tz);
        if (z.atkCd === 0) {
          z.atkCd = Z_HIT_EVERY;
          z.atk = (z.atk + 1) & 255;
          if (z.kind === Z_BLOATER) {
            this.kill(z, 0);
            return;
          }
          host.hitPlayer(z.id, target.id, k.hit);
        }
      } else if (best > 1e-6) {
        dx = tx / best;
        dz = tz / best;
      }
    } else {
      z.chase = 0;
      if (z.climb >= 0 && !inside) {
        const c = CLIMBS[z.climb];
        const cx = c.x + c.nx * (k.r + 0.05);
        const cz = c.z + c.nz * (k.r + 0.05);
        if (Math.hypot(cx - z.x, cz - z.z) < 0.7) {
          // у стены: лезем
          z.state = ZS_CLIMB;
          z.x = cx;
          z.z = cz;
          z.vx = 0;
          z.vz = 0;
          z.yaw = Math.atan2(c.nx, c.nz);
          return;
        }
        field = this.nav.toClimb[z.climb];
      } else {
        field = this.nav.toCrystal;
        if (!inside && gateUp && Math.abs(z.x) < GATE.x1 - 0.15 && z.z < GATE.face && z.z + k.r >= GATE.face - Z_GATE_GAP - 0.2) {
          // перед створками: бьём ворота
          attacking = true;
          z.yaw = 0;
          if (z.atkCd === 0) {
            z.atkCd = Z_GATE_EVERY;
            z.atk = (z.atk + 1) & 255;
            if (z.kind === Z_BLOATER) {
              this.kill(z, 0);
              return;
            }
            host.hitGate((k.gateDps * Z_GATE_EVERY) / TICK_RATE);
          }
        } else if (inside) {
          const D = PEDESTAL;
          if (rectDist(z.x, z.z, D.x0, D.z0, D.x1, D.z1) <= k.r + 0.35) {
            attacking = true;
            z.yaw = Math.atan2(-(clamp(z.x, D.x0, D.x1) - z.x), -(clamp(z.z, D.z0, D.z1) - z.z));
            if (z.atkCd === 0) {
              z.atkCd = Z_GATE_EVERY;
              z.atk = (z.atk + 1) & 255;
              if (z.kind === Z_BLOATER) {
                this.kill(z, 0);
                return;
              }
              host.hitCrystal((k.crystalDps * Z_GATE_EVERY) / TICK_RATE);
            }
          }
        }
      }
      if (!attacking && field) {
        // у самой цели поле кончается (клетки у стен заняты запасом на радиус) — последние шаги прямо к ней
        let gx = 0;
        let gz = 0;
        let gd = Infinity;
        if (z.climb >= 0 && !inside) {
          const c = CLIMBS[z.climb];
          gx = c.x + c.nx * (k.r + 0.05);
          gz = c.z + c.nz * (k.r + 0.05);
          gd = Math.hypot(gx - z.x, gz - z.z);
        } else if (inside) {
          const D = PEDESTAL;
          gx = clamp(z.x, D.x0, D.x1);
          gz = clamp(z.z, D.z0, D.z1);
          gd = Math.hypot(gx - z.x, gz - z.z);
        }
        if (gd < 2.2 && gd > 1e-6) {
          dx = (gx - z.x) / gd;
          dz = (gz - z.z) / gd;
        } else {
          this.nav.flow(field, z.x, z.z, _d);
          dx = _d.x;
          dz = _d.z;
        }
      }
    }

    z.state = attacking ? ZS_ATTACK : ZS_WALK;
    const speed = attacking ? 0 : k.speed * host.slow(z.x, z.z);
    z.vx += (dx * speed - z.vx) * 0.25;
    z.vz += (dz * speed - z.vz) * 0.25;
    z.x += z.vx * DT;
    z.z += z.vz * DT;
    if (!attacking && z.vx * z.vx + z.vz * z.vz > 0.04) {
      const want = Math.atan2(-z.vx, -z.vz);
      z.yaw = turnTo(z.yaw, want, 0.18);
    }

    // застрял: долго не приближается к цели (в очереди у ворот и у кристалла — ждёт, это не «застрял»)
    if (attacking || target || !field) {
      z.stuck = 0;
      return;
    }
    const d = this.nav.dist(field, z.x, z.z);
    const queued = (gateUp && !inside && Math.hypot(z.x, z.z - GATE.face) < QUEUE_GATE)
      || (inside && rectDist(z.x, z.z, PEDESTAL.x0, PEDESTAL.z0, PEDESTAL.x1, PEDESTAL.z1) < QUEUE_CRYSTAL);
    if (d < z.bestD - 0.5) {
      z.bestD = d;
      z.stuck = 0;
    } else if (!queued && ++z.stuck > Z_STUCK_TICKS) {
      this.restart(z);
    }
  }

  /** Обратно в начало своей дороги */
  private restart(z: Zombie): void {
    const [sx, sz] = ROADS[z.road].pts[0];
    z.x = sx;
    z.z = sz;
    z.y = 0;
    z.vx = 0;
    z.vz = 0;
    z.state = ZS_WALK;
    z.bestD = 1e9;
    z.stuck = 0;
  }

  /** Липучка: лезет по наружной грани, стоит на ходу стены (бьёт тех, кто рядом), прыгает во двор. */
  private stepClimber(z: Zombie): void {
    const c = CLIMBS[z.climb] ?? CLIMBS[0];
    const k = ZK[z.kind];
    if (z.state === ZS_CLIMB) {
      z.y += CLIMB_SPEED * DT;
      if (z.y >= WALL_H + PARAPET_H) {
        z.state = ZS_TOP;
        z.t = CLIMB_TOP_TICKS;
        z.x = c.x - c.nx * 1.7;
        z.z = c.z - c.nz * 1.7;
        z.y = WALL_H;
        this.host.event(['climb', z.id]);
      }
      return;
    }
    if (z.state === ZS_TOP) {
      // на ходу стены: бьёт того, кто рядом, иначе смотрит во двор
      let target: HordeTarget | null = null;
      let best = k.r + REACH + 0.3;
      for (const p of this.host.targets()) {
        if (Math.abs(p.y - z.y) > 0.8) continue;
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        if (d < best && !this.host.traceAttack(z.x, z.y + k.hcy, z.z, p.x, p.y + 0.8, p.z, _attack)) {
          best = d;
          target = p;
        }
      }
      if (target) {
        z.yaw = Math.atan2(-(target.x - z.x), -(target.z - z.z));
        if (z.atkCd === 0) {
          z.atkCd = Z_HIT_EVERY;
          z.atk = (z.atk + 1) & 255;
          this.host.hitPlayer(z.id, target.id, k.hit);
        }
      } else {
        z.yaw = Math.atan2(c.nx, c.nz);
      }
      if (--z.t <= 0) {
        z.state = ZS_DROP;
        z.t = CLIMB_DROP_TICKS;
        z.fromX = z.x;
        z.fromZ = z.z;
        z.toX = c.x - c.nx * (WALL_T + 1);
        z.toZ = c.z - c.nz * (WALL_T + 1);
        z.yaw = Math.atan2(c.nx, c.nz);
      }
      return;
    }
    // прыжок во двор: дуга с хода стены на землю
    z.t--;
    const u = 1 - z.t / CLIMB_DROP_TICKS;
    z.x = z.fromX + (z.toX - z.fromX) * u;
    z.z = z.fromZ + (z.toZ - z.fromZ) * u;
    z.y = Math.max(0, WALL_H * (1 - u * u) + 1.2 * u * (1 - u));
    if (z.t <= 0) {
      z.y = 0;
      z.state = ZS_WALK;
      z.climb = -1;
      z.bestD = 1e9;
      z.stuck = 0;
    }
  }

  /** Расталкивание стоящих на земле: пары ближе суммы радиусов расходятся (лёгкие — сильнее). */
  private separate(): void {
    const head = this.head;
    const next = this.next;
    head.fill(-1);
    const x0 = this.nav.x0;
    const z0 = this.nav.z0;
    for (const z of this.zombies) {
      if (!z.alive || z.kind === Z_BOSS || z.y > 0.01) continue;
      const c = Math.floor((z.x - x0) / HASH);
      const r = Math.floor((z.z - z0) / HASH);
      if (c < 0 || r < 0 || c >= this.hcols || r >= this.hrows) continue;
      const h = r * this.hcols + c;
      next[z.slot] = head[h];
      head[h] = z.slot;
    }
    for (const a of this.zombies) {
      if (!a.alive || a.kind === Z_BOSS || a.y > 0.01) continue;
      const ka = ZK[a.kind];
      const c = Math.floor((a.x - x0) / HASH);
      const r = Math.floor((a.z - z0) / HASH);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc;
          const rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= this.hcols || rr >= this.hrows) continue;
          for (let j = head[rr * this.hcols + cc]; j >= 0; j = next[j]) {
            if (j <= a.slot) continue;
            const b = this.zombies[j];
            const kb = ZK[b.kind];
            const minD = ka.r + kb.r;
            let dx = b.x - a.x;
            let dz = b.z - a.z;
            const d2 = dx * dx + dz * dz;
            if (d2 >= minD * minD) continue;
            let d = Math.sqrt(d2);
            if (d < 1e-4) {
              dx = (a.slot & 1) ? 1 : -1;
              dz = 0.3;
              d = Math.hypot(dx, dz);
            }
            const push = (minD - d) * 0.5;
            const ma = ka.r * ka.r;
            const mb = kb.r * kb.r;
            const wa = mb / (ma + mb);
            const wb = ma / (ma + mb);
            const ux = dx / d;
            const uz = dz / d;
            a.x -= ux * push * 2 * wa;
            a.z -= uz * push * 2 * wa;
            b.x += ux * push * 2 * wb;
            b.z += uz * push * 2 * wb;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ история и снимок

  private record(tick: number): void {
    const s = tick % ZHIST_TICKS;
    this.histTick[s] = tick;
    const base = s * FORT_MAX_ALIVE * 4;
    for (const z of this.zombies) {
      const o = base + z.slot * 4;
      this.hist[o] = z.x;
      this.hist[o + 1] = z.y;
      this.hist[o + 2] = z.z;
      this.hist[o + 3] = z.alive ? z.id : 0;
    }
  }

  /** Где был зомби в дробный тик t (тот же номер — тот же зомби). false — его тогда не было. */
  sample(z: Zombie, t: number, out: { x: number; y: number; z: number }): boolean {
    const t0 = Math.floor(t);
    const f = t - t0;
    const a = this.slotOf(t0);
    if (a < 0) return false;
    const oa = (a * FORT_MAX_ALIVE + z.slot) * 4;
    if (this.hist[oa + 3] !== z.id) return false;
    const b = f > 0 ? this.slotOf(t0 + 1) : -1;
    const ob = (b * FORT_MAX_ALIVE + z.slot) * 4;
    if (b < 0 || this.hist[ob + 3] !== z.id) {
      out.x = this.hist[oa];
      out.y = this.hist[oa + 1];
      out.z = this.hist[oa + 2];
      return true;
    }
    out.x = this.hist[oa] + (this.hist[ob] - this.hist[oa]) * f;
    out.y = this.hist[oa + 1] + (this.hist[ob + 1] - this.hist[oa + 1]) * f;
    out.z = this.hist[oa + 2] + (this.hist[ob + 2] - this.hist[oa + 2]) * f;
    return true;
  }

  private slotOf(tick: number): number {
    if (tick < 0) return -1;
    const s = tick % ZHIST_TICKS;
    return this.histTick[s] === tick ? s : -1;
  }

  /** Живые — в список снимка; возвращает их число */
  snap(out: ZombieSnap[]): number {
    let n = 0;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const s = out[n] ?? (out[n] = { id: 0, kind: 0, state: 0, hp: 1, x: 0, y: 0, z: 0, yaw: 0, atk: 0 });
      s.id = z.id;
      s.kind = z.kind;
      s.state = z.state;
      s.hp = z.hp / z.maxHp;
      s.x = z.x;
      s.y = z.y;
      s.z = z.z;
      s.yaw = z.yaw;
      s.atk = z.atk;
      s.wind = z.t;
      s.tx = z.toX;
      s.ty = z.toY;
      s.tz = z.toZ;
      s.stage = z.stage;
      n++;
    }
    return n;
  }

  /** Живой зомби по номеру (для тестов и краскомётов) */
  byId(id: number): Zombie | null {
    for (const z of this.zombies) if (z.alive && z.id === id) return z;
    return null;
  }
}

/** Точка липучки для дороги: с запада — западная грань, с севера — северная, с востока — восточная */
function climbFor(road: number, u: number): number {
  const pair = road === 0 ? [2, 3] : road === 1 ? [0, 1] : [4, 5];
  return pair[u < 0.5 ? 0 : 1];
}

function turnTo(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
