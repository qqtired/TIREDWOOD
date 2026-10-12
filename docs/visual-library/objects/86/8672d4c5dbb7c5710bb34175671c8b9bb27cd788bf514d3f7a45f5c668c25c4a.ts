// Орда «Крепости»: враги — появление по плану волны (director.ts: состав, ступени, дороги, HP и урон волны), шаг по
// полю расстояний, расталкивание, ворота (встают перед створками и бьют), кристалл, люди на земле рядом, липучки
// (лезут на стену, стоят на ходу, прыгают во двор), пузыри (лопаются, задевая соседей, — цепочкой), застрявшие (обратно
// на дорогу), урон по области (гранаты arsenal, метеоры), история позиций для отката выстрелов. Пул на FORT_MAX_ALIVE
// мест, в тике без аллокаций. Люди, ворота, кристалл и награды — через HordeHost (game.ts).
import { DT, TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import {
  BOSS_ARMOR, BOSS_BOMB_R, BOSS_PULSE_R,
  FLY_CRYSTAL_DMG, FLY_DIVE_TICKS, FLY_R, FLY_RECOVER_TICKS, FLY_WARN_TICKS,
  CLIMB_DROP_TICKS, CLIMB_SPEED, CLIMB_TOP_TICKS, FORT_MAX_ALIVE, POP_CRYSTAL, POP_GATE, POP_PLAYER, POP_R, POP_ZOMBIE, ZK, ZS_ATTACK, ZS_CLIMB,
  ZS_DROP, ZS_TOP, ZS_WALK, Z_AGGRO, Z_BLOATER, Z_CLIMBER, Z_GATE_EVERY, Z_GATE_GAP, Z_HIT_EVERY, Z_KINDS, Z_STUCK_TICKS,
  Z_BOSS, Z_FLYER, ZS_BOSS_APPROACH, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_OPEN, ZS_BOSS_PULSE,
  ZS_FLY_DIVE, ZS_FLY_RECOVER, ZS_FLY_WARN, ZS_BARREL, ZS_PLANT, ZS_SPIT, ZS_CHARGE, ZS_CHARGE_WARN, ZS_QUAKE, ZS_STOMP, ZS_THROW,
  ZS_BOAT, ZS_HOP,
  ZS_KRAKEN_DIVE, ZS_KRAKEN_SPIT, ZS_TENT_REST, ZS_TENT_SLAM, Z_KRAKEN, Z_TENTACLE,
  isBossKind, kindFlags, type FortEvent,
} from '../../shared/fort.ts';
import {
  ARMOR_MIN_PASS, BOSS_BASE_HP, EV_GOLD, GOLD_HASTE, TIER_CHAMP, TIER_DMG, TIER_HP, TIER_SPEED, armorFor, bossTeamMul, defenders,
  shieldHp, teamHpMul, waveHpMul,
} from '../../shared/fortwaves.ts';
import {
  BARREL_CRYSTAL, BARREL_GATE, BARREL_PLAYER, BARREL_R, BARREL_SHOT_MUL, BARREL_ZOMBIE, CHAMP_AURA_R, CHAMP_HASTE, FUSE_TICKS,
  HEAL_EVERY, HEAL_FRAC, HEAL_R, MEDIC_HOLD, SPIT_COOLDOWN, SPIT_DMG, SPIT_FLIGHT_TICKS, SPIT_MIN, SPIT_R, SPIT_RANGE,
  SPIT_WARN_TICKS, Z_ARMORED, Z_MEDIC, Z_SAPPER, Z_SHIELD, Z_SPITTER, Z_RAM, Z_GOLEM, RAM_LANE, STOMP_R, ROCK_R, QUAKE_R,
  isWalkerKind, Z_BOAT, BOAT_FROM_Z, BOAT_LANE_X, HOP_TICKS, SHORE_Z,
} from '../../shared/fortkinds.ts';
import { CLIMBS, CLIMB_SEA_E, CLIMB_SEA_W, CRYSTAL, GATE, PARAPET_H, PEDESTAL, ROADS, WALL_H, WALL_T, insideFort } from '../../shared/fortmap.ts';
import { ZF_CARRY, ZF_CREW, ZF_LIT, ZF_RAGE, ZF_SHIELD, type ZombieSnap } from '../../shared/fortnet.ts';
import { KRAKEN_DIVE_R, KRAKEN_SPIT_R, TENT_SLAM_R } from '../../shared/fortkraken.ts';
import { raging, stepBaron, stepGolem, stepRam, type BossCtx } from './bosses.ts';
import { stepLeshy } from './boss-leshy.ts';
import { stepPumpkin } from './boss-pumpkin.ts';
import { stepWeaver } from './boss-weaver.ts';
import { Z_LESHY, Z_PUMPKIN, Z_WEAVER } from '../../shared/fortkinds.ts';
import { newBossRadius } from '../../shared/fortbosses.ts';
import { stepBoat, stepHop, type SeaCtx } from './sea.ts';
import { krakenArmor, stepKraken, stepTentacle, tentacleRage } from './kraken.ts';
import { planCounts, type WavePlan } from './director.ts';
import { FortNav, rectDist } from './nav.ts';

/** История для отката выстрелов: тиков (откат — до MAX_REWIND_TICKS) */
export const ZHIST_TICKS = 32;
/** Человек — цель: номер, ноги */
export interface HordeTarget {
  id: number;
  x: number;
  y: number;
  z: number;
  /** В прыжке (не на опоре) — топот и землетрясение не достают */
  air: boolean;
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
  /** Ступень: 0 — обычный, 1 — элита, 2 — чемпион (TIER_*) */
  tier = 0;
  /** Абордажник с лодки */
  crew = false;
  /** Щит щитоносца (прочность), бочка подрывника, отсчёт лекаря, рядом чемпион */
  shield = 0;
  carry = false;
  healT = 0;
  hasted = false;
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
  /** Босс: сколько ещё атак подряд (ярость), кого уже задел рывком, x стоянки (Барон переходит вдоль поля) */
  combo = 0;
  homeX = 0;
  readonly hits: number[] = [];
  /** Лодка: экипаж на борту (типы и ступени) */
  readonly cargo: number[] = [];
  readonly cargoTier: number[] = [];
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
  tier: number;
  /** Лодка: борт (−1 запад, 1 восток) и экипаж с его ступенями */
  lane?: number;
  crew?: readonly number[];
  tiers?: readonly number[];
}

/** Шаг сетки расталкивания: не меньше двух самых больших радиусов */
const HASH = 1.6;
/** Сколько до игрока — «дотянулся» (радиус зомби + полкорпуса игрока + руки) */
const REACH = 0.42 + 0.4;
/** Ближе этого к воротам или постаменту — ждёт в толпе, а не «застрял» */
const QUEUE_GATE = 12;
const QUEUE_CRYSTAL = 7;
/** Появляются на дороге в стольких метрах от её конца у ворот (плюс разброс): первые подходят через ~15 с, а не 26 */
const SPAWN_NEAR = 38;
const SPAWN_SPREAD = 18;

const _p = { x: 0, z: 0 };
const _d = { x: 0, z: 0 };
const _attack = { x: 0, y: 0, z: 0 };

export class Horde {
  readonly nav: FortNav;
  readonly zombies: Zombie[] = [];
  private readonly host: HordeHost;
  private readonly rng: () => number;
  private readonly bossCtx: BossCtx;
  private readonly seaCtx: SeaCtx;
  /** Абордажники ещё в лодках (в море и у берега) — в «осталось» */
  cargo = 0;
  /** Утонувший абордажник — для награды (в пуле его нет) */
  private readonly ghost = new Zombie(-1);
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
  /** Пузыри и бочки, которые лопнут в этом же тике (цепочка), и кто их лопнул */
  private readonly pops: Zombie[] = [];
  private readonly popBy: number[] = [];
  private readonly barrels: Zombie[] = [];
  private readonly barrelMul: number[] = [];

  constructor(nav: FortNav, host: HordeHost, rng: () => number) {
    this.nav = nav;
    this.host = host;
    this.rng = rng;
    this.bossCtx = { host, horde: this };
    this.seaCtx = this.bossCtx;
    for (let i = 0; i < FORT_MAX_ALIVE; i++) this.zombies.push(new Zombie(i));
    this.hcols = Math.ceil((nav.cols * 0.5) / HASH) + 1;
    this.hrows = Math.ceil((nav.rows * 0.5) / HASH) + 1;
    this.head = new Int32Array(this.hcols * this.hrows);
    this.next = new Int32Array(FORT_MAX_ALIVE);
  }

  /** Сколько ещё выйдет в этой волне (с экипажами лодок, которые ещё не вышли в море) */
  get pending(): number {
    let n = this.queue.length - this.queueAt;
    for (let i = this.queueAt; i < this.queue.length; i++) n += this.queue[i].crew?.length ?? 0;
    return n;
  }

  /** В волне: ещё не вышли + живые + экипажи в лодках */
  get left(): number {
    return this.pending + this.alive + this.cargo;
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
    this.barrels.length = 0;
    this.barrelMul.length = 0;
    this.cargo = 0;
    this.wave = 0;
    this.hpHumans = 1;
    this.plan = null;
    this.replan = null;
    this.hpScale = 1;
    this.dmgMul = 1;
    this.haste = 1;
  }

  /**
   * Волна по плану директора: очередь выхода (босс — первым), HP и урон волны. replan(n) — тот же план для n защитников
   * (подкрепление, когда в волну входят новые).
   */
  startWave(plan: WavePlan, tick: number, replan: ((humans: number) => WavePlan) | null = null): void {
    this.plan = plan;
    this.replan = replan;
    this.wave = plan.w;
    this.hpHumans = plan.defenders;
    this.hpScale = plan.hpScale;
    this.dmgMul = plan.dmgMul;
    this.haste = plan.event === EV_GOLD ? GOLD_HASTE : 1;
    const queue: Spawn[] = plan.spawns.map((s) => ({ at: tick + s.at, kind: s.kind, road: s.road, tier: s.tier }));
    if (plan.boss >= 0) queue.unshift({ at: tick + 30, kind: plan.boss, road: 1, tier: 0 });
    for (const b of plan.boats) queue.push({ at: tick + b.at, kind: Z_BOAT, road: 1, tier: 0, lane: b.lane, crew: b.crew, tiers: b.tiers });
    if (plan.kraken) queue.unshift({ at: tick + 30, kind: Z_KRAKEN, road: 1, tier: 0 });
    this.queue = queue.sort((a, b) => a.at - b.at);
    this.queueAt = 0;
  }

  private hpHumans = 1;
  private wave = 0;
  private plan: WavePlan | null = null;
  private replan: ((humans: number) => WavePlan) | null = null;
  /** HP врага = база типа × hpScale × ступень; урон врагов × dmgMul; скорость пеших и крылаток × haste (лихорадка) */
  hpScale = 1;
  dmgMul = 1;
  haste = 1;

  get defenders(): number { return this.hpHumans; }

  /** Круг босса этой волны (0 — первый, 1 — II …) */
  get bossTier(): number { return this.plan?.bossTier ?? 0; }

  /** План идущей волны (null — между волнами и в тестах без волны) */
  get current(): WavePlan | null { return this.plan; }

  /** Peak concurrent roster within this wave. Departures never cancel committed pressure.
   * Add only a quota delta, retaining spent/dead enemies and existing damage fraction. */
  raiseDefenders(humans: number, tick: number): boolean {
    const n = defenders(humans);
    if (!this.wave || n <= this.hpHumans) return false;
    const old = this.plan;
    const next = this.replan && old ? this.replan(n) : null;
    const prevHumans = this.hpHumans;
    this.hpHumans = n;
    const scale = next ? next.hpScale : this.hpScale * teamHpMul(n) / teamHpMul(prevHumans);
    const ratio = scale / this.hpScale;
    const bossRatio = bossTeamMul(n) / bossTeamMul(prevHumans);
    this.hpScale = scale;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const fraction = z.hp / z.maxHp;
      z.maxHp *= isBossKind(z.kind) ? bossRatio : ratio;
      z.hp = z.maxHp * fraction;
    }
    const extra: Spawn[] = [];
    if (old && next) {
      const before = planCounts(old);
      const after = planCounts(next);
      const roads = next.roads;
      for (let kind = 0; kind < Z_KINDS; kind++) {
        const tiers = next.spawns.filter((s) => s.kind === kind).map((s) => s.tier);
        for (let i = before[kind]; i < after[kind]; i++) {
          const at = extra.length;
          extra.push({ at: tick + 3 * TICK_RATE + at * 10, kind, road: roads[at % roads.length], tier: tiers[i] ?? 0 });
        }
      }
      this.plan = { ...next, spawns: old.spawns, boats: old.boats };
    }
    // Consumed prefix is discarded; quota still derives from the locked roster, not queue length.
    this.queue = this.queue.slice(this.queueAt).concat(extra).sort((a, b) => a.at - b.at);
    this.queueAt = 0;
    return true;
  }

  /** HP врага на этой волне: босс — по формуле боссов, остальные — база × нормировка волны × ступень */
  hpFor(kind: number, tier: number, hpHumans = this.hpHumans): number {
    if (isBossKind(kind)) {
      if (this.plan && this.plan.boss === kind) return this.plan.bossHp * bossTeamMul(hpHumans) / bossTeamMul(this.plan.defenders);
      return BOSS_BASE_HP * waveHpMul(Math.max(1, this.wave)) * bossTeamMul(hpHumans);
    }
    const scale = this.plan ? this.hpScale * teamHpMul(hpHumans) / teamHpMul(this.hpHumans) : teamHpMul(hpHumans) * waveHpMul(Math.max(1, this.wave));
    return ZK[kind].hp * scale * (TIER_HP[tier] ?? 1);
  }

  /** Урон врага z (по игроку, воротам, кристаллу): волна × ступень */
  dmgOf(z: Zombie, base: number): number {
    return base * this.dmgMul * (TIER_DMG[z.tier] ?? 1);
  }

  /** Выпустить врага kind с дороги road (тесты и расписание). null — мест нет. */
  spawn(kind: number, road: number, hpHumans = this.hpHumans, tier = 0): Zombie | null {
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
    // босс и крылатки — с конца дороги (у леса); остальные — ближе, на SPAWN_NEAR…+SPREAD м от ворот по дороге
    const far = isBossKind(kind) || kind === Z_FLYER;
    roadPoint(pts, far ? 1e9 : SPAWN_NEAR + this.rng() * SPAWN_SPREAD, _road);
    const sx = _road.x;
    const sz = _road.z;
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
    z.tier = isBossKind(kind) ? 0 : Math.max(0, Math.min(2, tier | 0));
    z.crew = false;
    z.state = isBossKind(kind) ? ZS_BOSS_APPROACH : ZS_WALK;
    z.alive = true;
    z.maxHp = this.hpFor(kind, z.tier, hpHumans);
    z.hp = z.maxHp;
    z.x = x;
    z.y = kind === Z_FLYER ? WALL_H + 4 : 0;
    z.z = zz;
    z.yaw = Math.atan2(-_road.dx, -_road.dz);
    z.vx = 0;
    z.vz = 0;
    z.road = road;
    z.climb = kind === Z_CLIMBER ? climbFor(road, this.rng()) : -1;
    z.shield = kind === Z_SHIELD ? shieldHp(Math.max(1, this.wave), hpHumans) * (1 + 0.5 * z.tier) : 0;
    z.carry = kind === Z_SAPPER;
    z.healT = kind === Z_MEDIC ? 60 + Math.floor(this.rng() * HEAL_EVERY) : 0;
    z.hasted = false;
    z.atkCd = 0;
    z.atk = 0;
    z.chase = 0;
    z.t = 0;
    z.bestD = 1e9;
    z.stuck = 0;
    z.lastBy = 0;
    z.damageBy.clear();
    z.stage = isBossKind(kind) ? 1 : 0;
    z.attackIndex = 0;
    z.addsMask = 0;
    z.combo = 0;
    z.homeX = 0;
    z.hits.length = 0;
    z.cargo.length = 0;
    z.cargoTier.length = 0;
    z.fromY = z.toY = 0;
    z.fromX = z.toX = z.fromZ = z.toZ = 0;
    this.alive++;
    return z;
  }

  // ------------------------------------------------------------ урон

  /**
   * Попадание (выстрел — by = номер стрелка, краскомёт — 0). ox, oz — откуда стреляли (для щита: спереди держит,
   * голову не закрывает). Чугунок гасит попадание в тело на броню волны (не меньше 30 % проходит), голову — нет.
   */
  damage(z: Zombie, dmg: number, by: number, head: boolean, hx: number, hy: number, hz: number, ox = hx, oz = hz): void {
    if (!z.alive) return;
    if (!(dmg > 0) || !Number.isFinite(dmg)) return;
    if (z.kind === Z_KRAKEN || z.kind === Z_TENTACLE) dmg *= krakenArmor(this, z);
    else if (isBossKind(z.kind) && z.state !== ZS_BOSS_OPEN) dmg *= BOSS_ARMOR;
    if (!(dmg > 0)) return;
    let mark = head ? 1 : 0;
    if (!head && z.kind === Z_ARMORED) {
      const armor = armorFor(Math.max(1, this.wave)) * (1 + 0.5 * z.tier);
      dmg = Math.max(dmg * ARMOR_MIN_PASS, dmg - armor);
      mark = 3;
    }
    if (!head && z.shield > 0 && frontOf(z, ox, oz)) {
      const taken = Math.min(z.shield, dmg);
      z.shield -= taken;
      dmg -= taken;
      this.host.event(['zhit', by, z.id, Math.round(taken), 2, r2(hx), r2(hy), r2(hz)]);
      if (z.shield <= 0) {
        z.shield = 0;
        this.host.event(['shield', z.id, r2(z.x), r2(z.y + ZK[z.kind].hcy), r2(z.z)]);
      }
      if (dmg <= 0) return;
    }
    this.hurt(z, dmg, by, mark, hx, hy, hz);
    this.drainPops();
  }

  /**
   * Урон по области (гранаты и снаряды arsenal, метеоры): всем живым, чей хитбокс задевает шар r вокруг (x, y, z).
   * Взрыв обходит щит и кастрюлю Чугунка (урон полный), броня боссов вне окна уязвимости — как от выстрела.
   * by — кто бросил (0 — никто). Возвращает, скольких задело.
   */
  areaDamage(x: number, y: number, z: number, r: number, dmg: number, by: number): number {
    if (!(dmg > 0) || !Number.isFinite(dmg) || !(r > 0)) return 0;
    let hits = 0;
    for (const o of this.zombies) {
      if (!o.alive) continue;
      const k = ZK[o.kind];
      const d = Math.hypot(o.x - x, o.y + k.hcy - y, o.z - z) - Math.max(k.hrx, k.hry) * 0.6;
      if (d > r) continue;
      let amount = dmg;
      if (o.kind === Z_KRAKEN || o.kind === Z_TENTACLE) amount *= krakenArmor(this, o);
      else if (isBossKind(o.kind) && o.state !== ZS_BOSS_OPEN) amount *= BOSS_ARMOR;
      if (!(amount > 0)) continue;
      this.hurt(o, amount, by, 0, o.x, o.y + k.hcy, o.z);
      hits++;
    }
    this.drainPops();
    return hits;
  }

  /**
   * Удар сверху (метеор): всем в круге r по горизонтали (по высоте — от 1,5 м ниже до 3 м выше точки удара) — доля
   * frac их макс. HP. Щит и кастрюля не спасают, броня боссов вне окна — как от выстрела. Лодки и крылатки в небе —
   * мимо. Сбитые — ничьи (by 0). Возвращает, скольких задело.
   */
  skyStrike(x: number, y: number, z: number, r: number, frac: number): number {
    if (!(frac > 0) || !(r > 0)) return 0;
    let hits = 0;
    for (const o of this.zombies) {
      if (!o.alive || o.kind === Z_BOAT) continue;
      if (o.y < y - 1.5 || o.y > y + 3) continue;
      const k = ZK[o.kind];
      if (Math.hypot(o.x - x, o.z - z) > r + k.r) continue;
      let amount = o.maxHp * frac;
      if (isBossKind(o.kind) && o.state !== ZS_BOSS_OPEN) amount *= BOSS_ARMOR;
      this.hurt(o, amount, 0, 0, o.x, o.y + k.hcy, o.z);
      hits++;
    }
    this.drainPops();
    return hits;
  }

  /** Признаки типа (KF_AIR, KF_SEA, KF_BOSS, KF_ARMORED) — для башен arsenal */
  flagsOf(z: Zombie): number {
    return kindFlags(z.kind);
  }

  /** Урон по HP: mark — как отметить попадание (0 тело, 1 голова, 2 щит, 3 броня) */
  private hurt(z: Zombie, dmg: number, by: number, mark: number, hx: number, hy: number, hz: number): void {
    if (!z.alive) return;
    z.hp -= dmg;
    if (by) {
      z.lastBy = by;
      z.damageBy.set(by, (z.damageBy.get(by) ?? 0) + Math.max(0, Math.min(dmg, z.hp + dmg)));
    }
    this.host.event(['zhit', by, z.id, Math.round(dmg), mark, r2(hx), r2(hy), r2(hz)]);
    if (z.hp <= 0.5) this.kill(z, by);
  }

  /** Сбит (by — кто; 0 — взрыв, сам, краскомёт без хозяина). Пузырь и бочка рвутся следом, очередью. */
  kill(z: Zombie, by: number): void {
    if (!z.alive) return;
    z.alive = false;
    z.hp = 0;
    this.alive--;
    this.host.event(['zdie', z.id, by, r2(z.x), r2(z.y), r2(z.z), z.kind, z.tier]);
    this.host.killed(z, by);
    if (z.kind === Z_BLOATER) {
      this.pops.push(z);
      this.popBy.push(by);
    }
    if (z.kind === Z_BOAT && z.cargo.length) this.drown(z, by);
    if (z.kind === Z_SAPPER && z.carry) {
      z.carry = false;
      this.barrels.push(z);
      // догорел фитиль — полный взрыв; сбили раньше — бочка рвётся на месте, строениям достаётся меньше
      this.barrelMul.push(z.stage === 2 ? 1 : BARREL_SHOT_MUL);
    }
  }

  /** Лодку потопили: экипаж тонет — каждый как сбитый абордажник (награда — тем, кто топил) */
  private drown(boat: Zombie, by: number): void {
    const g = this.ghost;
    g.id = boat.id;
    g.crew = true;
    g.damageBy.clear();
    for (const [pid, dmg] of boat.damageBy) g.damageBy.set(pid, dmg);
    for (let i = 0; i < boat.cargo.length; i++) {
      g.kind = boat.cargo[i];
      g.tier = boat.cargoTier[i] ?? 0;
      this.host.killed(g, by);
    }
    this.cargo -= boat.cargo.length;
    this.host.event(['boat', 0, by, r2(boat.x), r2(boat.y), r2(boat.z)]);
    boat.cargo.length = 0;
    boat.cargoTier.length = 0;
  }

  /** Лодка выходит в море со своим экипажем. false — мест в орде нет. */
  private launchBoat(s: Spawn): boolean {
    const z = this.spawn(Z_BOAT, s.road, this.hpHumans, 0);
    if (!z) return false;
    const lane = (s.lane ?? 1) < 0 ? -1 : 1;
    z.x = lane * BOAT_LANE_X + (this.rng() - 0.5) * 2;
    z.y = WATER_Y;
    z.z = BOAT_FROM_Z + this.rng() * 8;
    z.yaw = 0;
    z.state = ZS_BOAT;
    for (const k of s.crew ?? []) z.cargo.push(k);
    for (let i = 0; i < z.cargo.length; i++) z.cargoTier.push(s.tiers?.[i] ?? 0);
    z.stage = z.cargo.length;
    this.cargo += z.cargo.length;
    return true;
  }

  /** Абордажник прыгает из лодки на берег (последний в списке). false — мест в орде нет, ждёт. */
  unloadCrew(boat: Zombie): boolean {
    const n = boat.cargo.length;
    if (!n) return false;
    const z = this.spawn(boat.cargo[n - 1], 1, this.hpHumans, boat.cargoTier[n - 1] ?? 0);
    if (!z) return false;
    boat.cargo.length = n - 1;
    boat.cargoTier.length = n - 1;
    boat.stage = n - 1;
    this.cargo--;
    z.crew = true;
    z.climb = boat.x < 0 ? CLIMB_SEA_W : CLIMB_SEA_E;
    z.state = ZS_HOP;
    z.t = HOP_TICKS;
    z.fromX = boat.x + (this.rng() - 0.5) * 0.8;
    z.fromY = boat.y + 0.7;
    z.fromZ = boat.z - 0.8;
    z.toX = boat.x + (this.rng() - 0.5) * 3;
    z.toY = 0;
    z.toZ = SHORE_Z - this.rng() * 1.2;
    z.x = z.fromX;
    z.y = z.fromY;
    z.z = z.fromZ;
    z.yaw = 0;
    return true;
  }

  /** Убрать без награды и без «сбит» (пустая лодка ушла в море) */
  remove(z: Zombie): void {
    if (!z.alive) return;
    z.alive = false;
    this.alive--;
  }

  /** Пузыри и бочки: ворота, кристалл, люди и зомби рядом; сбитые ими лопаются следом (тут же, очередью). */
  private drainPops(): void {
    for (let guard = 0; guard < 8 && (this.pops.length || this.barrels.length); guard++) {
      this.drainBubbles();
      this.drainBarrels();
    }
  }

  private drainBarrels(): void {
    const host = this.host;
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      const mul = this.barrelMul[i];
      const y = b.y + 0.6;
      host.event(['blast', ZS_BARREL, r2(b.x), r2(y), r2(b.z), BARREL_R]);
      if (host.gateUp() && rectDist(b.x, b.z, GATE.x0, GATE.face - 0.5, GATE.x1, GATE.z1) < BARREL_R
        && !host.traceAttack(b.x, y, b.z, clamp(b.x, GATE.x0, GATE.x1), clamp(y, 0, GATE.h), clamp(b.z, GATE.face, GATE.z1), _attack)) host.hitGate(this.dmgOf(b, BARREL_GATE) * mul);
      const D = PEDESTAL;
      if (rectDist(b.x, b.z, D.x0, D.z0, D.x1, D.z1) < BARREL_R && b.y < 2
        && !host.traceAttack(b.x, y, b.z, clamp(b.x, D.x0, D.x1), Math.min(D.h, y), clamp(b.z, D.z0, D.z1), _attack)) host.hitCrystal(this.dmgOf(b, BARREL_CRYSTAL) * mul);
      for (const p of host.targets()) {
        if (Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) < BARREL_R
          && !host.traceAttack(b.x, y, b.z, p.x, p.y + 0.8, p.z, _attack)) host.hitPlayer(b.id, p.id, this.dmgOf(b, BARREL_PLAYER));
      }
      // своим — слабо (BARREL_ZOMBIE), и соседних подрывников не трогает: один взрыв не рвёт остальные бочки
      const hit = BARREL_ZOMBIE * waveHpMul(Math.max(1, this.wave));
      for (const o of this.zombies) {
        if (!o.alive || o === b || o.kind === Z_SAPPER) continue;
        if (Math.hypot(o.x - b.x, o.y - b.y, o.z - b.z) >= BARREL_R) continue;
        if (host.traceAttack(b.x, y, b.z, o.x, o.y + ZK[o.kind].hcy, o.z, _attack)) continue;
        o.hp -= isBossKind(o.kind) ? hit * BOSS_ARMOR : hit;
        if (o.hp <= 0.5) this.kill(o, b.lastBy);
      }
    }
    this.barrels.length = 0;
    this.barrelMul.length = 0;
  }

  private drainBubbles(): void {
    for (let i = 0; i < this.pops.length; i++) {
      const b = this.pops[i];
      const by = this.popBy[i];
      const host = this.host;
      host.event(['pop', r2(b.x), r2(b.y + 0.8), r2(b.z)]);
      if (host.gateUp() && rectDist(b.x, b.z, GATE.x0, GATE.face - 0.5, GATE.x1, GATE.z1) < POP_R
        && !host.traceAttack(b.x, b.y + 0.8, b.z, clamp(b.x, GATE.x0, GATE.x1), clamp(b.y + 0.8, 0, GATE.h), clamp(b.z, GATE.face, GATE.z1), _attack)) host.hitGate(this.dmgOf(b, POP_GATE));
      const D = PEDESTAL;
      if (rectDist(b.x, b.z, D.x0, D.z0, D.x1, D.z1) < POP_R && b.y < 2
        && !host.traceAttack(b.x, b.y + 0.8, b.z, clamp(b.x, D.x0, D.x1), Math.min(D.h, b.y + 0.8), clamp(b.z, D.z0, D.z1), _attack)) host.hitCrystal(this.dmgOf(b, POP_CRYSTAL));
      for (const p of host.targets()) {
        if (Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) < POP_R
          && !host.traceAttack(b.x, b.y + 0.8, b.z, p.x, p.y + 0.8, p.z, _attack)) host.hitPlayer(b.id, p.id, this.dmgOf(b, POP_PLAYER));
      }
      // по своим — как 100 HP шаркуна на этой волне: цепочка пузырей остаётся оружием и на высоких волнах
      const popZ = POP_ZOMBIE * waveHpMul(Math.max(1, this.wave));
      for (const o of this.zombies) {
        if (!o.alive || o === b) continue;
        if (Math.hypot(o.x - b.x, o.y - b.y, o.z - b.z) >= POP_R) continue;
        if (host.traceAttack(b.x, b.y + 0.8, b.z, o.x, o.y + ZK[o.kind].hcy, o.z, _attack)) continue;
        o.hp -= isBossKind(o.kind) ? popZ * BOSS_ARMOR : popZ;
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
      if (!(s.kind === Z_BOAT ? this.launchBoat(s) : this.spawn(s.kind, s.road, this.hpHumans, s.tier))) break; // мест нет — подождут
      this.queueAt++;
    }
    const gateUp = this.host.gateUp();
    if (tick % 15 === 0) this.auras();
    for (const z of this.zombies) {
      if (!z.alive) continue;
      if (z.atkCd > 0) z.atkCd--;
      if (z.state === ZS_HOP) stepHop(z);
      else if (z.kind === Z_BOAT) stepBoat(this.seaCtx, z);
      else if (z.kind === Z_FLYER) this.stepFlyer(z);
      else if (z.kind === Z_BOSS) stepBaron(this.bossCtx, z);
      else if (z.kind === Z_RAM) stepRam(this.bossCtx, z);
      else if (z.kind === Z_GOLEM) stepGolem(this.bossCtx, z);
      else if (z.kind === Z_KRAKEN) stepKraken(this.bossCtx, z);
      else if (z.kind === Z_TENTACLE) stepTentacle(this.bossCtx, z);
      else if (z.kind === Z_PUMPKIN) stepPumpkin(this.bossCtx, z);
      else if (z.kind === Z_WEAVER) stepWeaver(this.bossCtx, z);
      else if (z.kind === Z_LESHY) stepLeshy(this.bossCtx, z);
      else if (z.state === ZS_CLIMB || z.state === ZS_TOP || z.state === ZS_DROP) this.stepClimber(z);
      else if (z.kind === Z_SPITTER) this.stepSpitter(z, gateUp);
      else if (z.kind === Z_SAPPER) this.stepSapper(z, gateUp);
      else if (z.kind === Z_MEDIC) this.stepMedic(z, gateUp);
      else this.stepGround(z, gateUp);
    }
    this.separate();
    for (const z of this.zombies) {
      if (!z.alive || !isWalkerKind(z.kind) || z.y > 0.01) continue;
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
          && !this.host.traceAttack(z.x, z.y + 0.5, z.z, p.x, p.y + 0.8, p.z, _attack)) this.host.hitPlayer(z.id, p.id, this.dmgOf(z, ZK[Z_FLYER].hit));
      }
      if (!z.chase) this.host.hitCrystal(this.dmgOf(z, FLY_CRYSTAL_DMG));
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
      const move = Math.min(d, ZK[Z_FLYER].speed * (TIER_SPEED[z.tier] ?? 1) * this.haste * DT);
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

  /** Чемпионы ускоряют соседей (раз в 15 тиков) */
  private auras(): void {
    for (const z of this.zombies) z.hasted = false;
    for (const c of this.zombies) {
      if (!c.alive || c.tier !== TIER_CHAMP) continue;
      for (const o of this.zombies) {
        if (o.alive && o !== c && Math.abs(o.x - c.x) < CHAMP_AURA_R && Math.abs(o.z - c.z) < CHAMP_AURA_R
          && Math.hypot(o.x - c.x, o.z - c.z) < CHAMP_AURA_R) o.hasted = true;
      }
    }
  }

  /**
   * Плевальщик: снаружи, в 10–30 м от человека (на стене или во дворе), встаёт, замахивается (метка на месте
   * человека, 1,2 с) и плюёт навесом; перезарядка — держит дистанцию. Людей в досягаемости нет — идёт как все.
   */
  private stepSpitter(z: Zombie, gateUp: boolean): void {
    const host = this.host;
    if (z.state === ZS_SPIT) {
      z.t--;
      if (z.t === SPIT_FLIGHT_TICKS) {
        host.event(['throw', r2(z.x), r2(z.y + 1.3), r2(z.z), r2(z.toX), r2(z.toY), r2(z.toZ), SPIT_FLIGHT_TICKS, ZS_SPIT]);
      }
      if (z.t > 0) return;
      for (const p of host.targets()) {
        if (Math.hypot(p.x - z.toX, p.y + 0.8 - z.toY, p.z - z.toZ) >= SPIT_R + 0.4) continue;
        if (host.traceAttack(z.toX, z.toY + 0.05, z.toZ, p.x, p.y + 0.8, p.z, _attack)) continue;
        host.hitPlayer(z.id, p.id, this.dmgOf(z, SPIT_DMG));
      }
      z.atk = (z.atk + 1) & 255;
      host.event(['blast', ZS_SPIT, r2(z.toX), r2(z.toY), r2(z.toZ), SPIT_R]);
      z.state = ZS_WALK;
      z.atkCd = SPIT_COOLDOWN;
      return;
    }
    let target: HordeTarget | null = null;
    if (!insideFort(z.x, z.z)) {
      let best = Infinity;
      for (const p of host.targets()) {
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        if (d < SPIT_MIN || d > SPIT_RANGE) continue;
        // на стене — в первую очередь
        const score = d - (p.y > 1 ? 15 : 0);
        if (score < best) { best = score; target = p; }
      }
    }
    if (target && z.atkCd === 0) {
      z.toX = target.x;
      z.toY = target.y + 0.8;
      z.toZ = target.z;
      // крыша над человеком — метка на крыше (туда и плюнет)
      if (host.traceAttack(z.toX, z.toY + 15, z.toZ, z.toX, z.toY, z.toZ, _attack)) z.toY = _attack.y + 0.06;
      z.state = ZS_SPIT;
      z.t = SPIT_WARN_TICKS;
      z.chase = target.id;
      z.vx = z.vz = 0;
      z.yaw = Math.atan2(-(target.x - z.x), -(target.z - z.z));
      host.event(['warn', z.id, ZS_SPIT, r2(z.toX), r2(z.toY), r2(z.toZ), SPIT_R, host.tick + z.t]);
      return;
    }
    if (target) {
      // перезаряжается: стоит на дистанции и смотрит на цель
      z.vx *= 0.7;
      z.vz *= 0.7;
      z.x += z.vx * DT;
      z.z += z.vz * DT;
      z.yaw = turnTo(z.yaw, Math.atan2(-(target.x - z.x), -(target.z - z.z)), 0.15);
      z.state = ZS_WALK;
      z.stuck = 0;
      return;
    }
    this.stepGround(z, gateUp);
  }

  /** Подрывник: бежит к воротам (пали — к кристаллу), ставит бочку, фитиль 3 с с меткой — и взрыв. */
  private stepSapper(z: Zombie, gateUp: boolean): void {
    if (z.state === ZS_PLANT) {
      if (--z.t > 0) return;
      z.stage = 2;
      this.kill(z, 0);
      this.drainPops();
      return;
    }
    const k = ZK[z.kind];
    const inside = insideFort(z.x, z.z);
    let plant = false;
    if (!inside && gateUp && Math.abs(z.x) < GATE.x1 - 0.15 && z.z < GATE.face && z.z + k.r >= GATE.face - Z_GATE_GAP - 0.2) {
      plant = true;
      z.toX = z.x;
      z.toY = 0.6;
      z.toZ = GATE.face - 0.3;
    } else if (inside && rectDist(z.x, z.z, PEDESTAL.x0, PEDESTAL.z0, PEDESTAL.x1, PEDESTAL.z1) <= k.r + 0.35) {
      plant = true;
      z.toX = z.x;
      z.toY = 0.6;
      z.toZ = z.z;
    }
    if (plant) {
      z.state = ZS_PLANT;
      z.t = FUSE_TICKS;
      z.vx = z.vz = 0;
      this.host.event(['warn', z.id, ZS_PLANT, r2(z.toX), r2(z.toY), r2(z.toZ), BARREL_R, this.host.tick + z.t]);
      return;
    }
    this.stepGround(z, gateUp);
  }

  /** Лекарь: держится позади (к воротам не ближе 9 м), раз в 3 с лечит соседей зелёной волной. */
  private stepMedic(z: Zombie, gateUp: boolean): void {
    if (--z.healT <= 0) {
      z.healT = HEAL_EVERY;
      let healed = 0;
      for (const o of this.zombies) {
        if (!o.alive || o === z || o.hp >= o.maxHp) continue;
        if (Math.hypot(o.x - z.x, o.y - z.y, o.z - z.z) > HEAL_R) continue;
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * HEAL_FRAC * (isBossKind(o.kind) ? 0.2 : 1));
        healed++;
      }
      this.host.event(['heal', z.id, r2(z.x), r2(z.y), r2(z.z), HEAL_R]);
      if (healed) z.atk = (z.atk + 1) & 255;
    }
    if (gateUp && !insideFort(z.x, z.z) && Math.hypot(z.x, z.z - GATE.face) < MEDIC_HOLD && z.z < GATE.face) {
      z.vx *= 0.7;
      z.vz *= 0.7;
      z.x += z.vx * DT;
      z.z += z.vz * DT;
      z.yaw = turnTo(z.yaw, 0, 0.1);
      z.state = ZS_WALK;
      z.stuck = 0;
      return;
    }
    this.stepGround(z, gateUp);
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

    // человек на земле по ту же сторону стены (подрывник и лекарь заняты своим)
    let target: HordeTarget | null = null;
    let best = z.chase ? Z_AGGRO + 2 : Z_AGGRO;
    const busy = z.kind === Z_SAPPER || z.kind === Z_MEDIC;
    if (!busy) for (const p of host.targets()) {
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
          host.hitPlayer(z.id, target.id, this.dmgOf(z, k.hit));
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
            host.hitGate(this.dmgOf(z, (k.gateDps * Z_GATE_EVERY) / TICK_RATE));
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
              host.hitCrystal(this.dmgOf(z, (k.crystalDps * Z_GATE_EVERY) / TICK_RATE));
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
    const speed = attacking ? 0 : k.speed * (TIER_SPEED[z.tier] ?? 1) * (z.hasted ? CHAMP_HASTE : 1) * this.haste * host.slow(z.x, z.z);
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

  /** Обратно на свою дорогу (туда, где появляются) */
  private restart(z: Zombie): void {
    roadPoint(ROADS[z.road].pts, SPAWN_NEAR + SPAWN_SPREAD, _road);
    z.x = _road.x;
    z.z = _road.z;
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
          this.host.hitPlayer(z.id, target.id, this.dmgOf(z, k.hit));
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
      if (!z.alive || !isWalkerKind(z.kind) || z.y > 0.01) continue;
      const c = Math.floor((z.x - x0) / HASH);
      const r = Math.floor((z.z - z0) / HASH);
      if (c < 0 || r < 0 || c >= this.hcols || r >= this.hrows) continue;
      const h = r * this.hcols + c;
      next[z.slot] = head[h];
      head[h] = z.slot;
    }
    for (const a of this.zombies) {
      if (!a.alive || !isWalkerKind(a.kind) || a.y > 0.01) continue;
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
      const s = out[n] ?? (out[n] = { id: 0, kind: 0, state: 0, hp: 1, x: 0, y: 0, z: 0, yaw: 0, atk: 0, flags: 0 });
      s.id = z.id;
      s.kind = z.kind;
      s.state = z.state;
      s.flags = z.tier | (z.crew ? ZF_CREW : 0) | (z.shield > 0 ? ZF_SHIELD : 0) | (z.carry ? ZF_CARRY : 0)
        | (z.state === ZS_PLANT || (z.kind === Z_MEDIC && z.healT < 30) ? ZF_LIT : 0)
        | (isBossKind(z.kind) && raging(z) || tentacleRage(z) ? ZF_RAGE : 0);
      s.r = attackRadius(z.state);
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

const _road = { x: 0, z: 0, dx: 0, dz: 1 };

/**
 * Точка на дороге в dist метрах от её конца у ворот (больше длины — начало дороги); dx, dz — куда дальше идти.
 * Дорога — ломаная от начала к воротам.
 */
export function roadPoint(pts: ReadonlyArray<readonly [number, number]>, dist: number, out: { x: number; z: number; dx: number; dz: number }): void {
  let left = Math.max(0, dist);
  for (let i = pts.length - 1; i > 0; i--) {
    const [x1, z1] = pts[i];
    const [x0, z0] = pts[i - 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (left <= len || i === 1) {
      const u = len > 0 ? Math.max(0, 1 - Math.min(left, len) / len) : 0;
      out.x = x0 + (x1 - x0) * u;
      out.z = z0 + (z1 - z0) * u;
      out.dx = len > 0 ? (x1 - x0) / len : 0;
      out.dz = len > 0 ? (z1 - z0) / len : 1;
      return;
    }
    left -= len;
  }
  out.x = pts[0][0];
  out.z = pts[0][1];
  out.dx = 0;
  out.dz = 1;
}

/** Радиус метки атаки в состоянии (для снимка) */
function attackRadius(state: number): number {
  switch (state) {
    case ZS_FLY_WARN:
    case ZS_FLY_DIVE: return FLY_R;
    case ZS_BOSS_GATE: return 6;
    case ZS_BOSS_BOMB: return BOSS_BOMB_R;
    case ZS_BOSS_PULSE: return BOSS_PULSE_R;
    case ZS_SPIT: return SPIT_R;
    case ZS_PLANT: return BARREL_R;
    case ZS_CHARGE_WARN:
    case ZS_CHARGE: return RAM_LANE;
    case ZS_STOMP: return STOMP_R;
    case ZS_THROW: return ROCK_R;
    case ZS_QUAKE: return QUAKE_R;
    case ZS_TENT_SLAM:
    case ZS_TENT_REST: return TENT_SLAM_R;
    case ZS_KRAKEN_SPIT: return KRAKEN_SPIT_R;
    case ZS_KRAKEN_DIVE: return KRAKEN_DIVE_R;
    // новые боссы (Король-Тыква, Ткачиха, Леший) — shared/fortbosses.ts
    default: return newBossRadius(state);
  }
}

/** Стреляли спереди: точка выстрела по ту сторону, куда он смотрит (лицом — в −Z при курсе 0) */
function frontOf(z: Zombie, ox: number, oz: number): boolean {
  const fx = -Math.sin(z.yaw);
  const fz = -Math.cos(z.yaw);
  return (ox - z.x) * fx + (oz - z.z) * fz > 0;
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
