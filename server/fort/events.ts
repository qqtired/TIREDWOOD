// События волны «Крепости» (с 12-й, выбирает директор): ☄ метеоры, 📦 сброс припасов, 🌟 золотая лихорадка,
// 🌫 морской туман. Здесь — кто и что получил: круги метеоров (половина — в гущу орды, половина — рядом с людьми),
// ящик (куда упал, кто подобрал). Лихорадка ускоряет орду (horde.haste) и удваивает награду (game.goldMul), туман —
// только видимость на клиенте. Клиент рисует метки (client/fort/marks.ts) и эффекты (eventfx.ts, помощник fort-fx).
import { TICK_RATE } from '../../shared/constants.ts';
import { ZK, ZS_METEOR, type FortEvent } from '../../shared/fort.ts';
import { KF_AIR, Z_BOAT, isBossKind } from '../../shared/fortkinds.ts';
import {
  CRATE_DOWN, CRATE_FALL, CRATE_NONE, EV_FOG, EV_GOLD, EV_METEORS, EV_NONE, EV_SUPPLY, METEOR_COUNT, METEOR_CROWD_EVERY, METEOR_GATE, METEOR_PLAYER,
  METEOR_R, METEOR_TICKS, METEOR_WARN_TICKS, METEOR_ZOMBIE, SUPPLY_FALL_TICKS, SUPPLY_FIELD, SUPPLY_PICK_R, SUPPLY_TOUCH_R,
  releaseTicks,
} from '../../shared/fortwaves.ts';
import { GATE, WALL_H, insideFort } from '../../shared/fortmap.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import type { WavePlan } from './director.ts';
import type { Horde, HordeTarget, Zombie } from './horde.ts';

/** Что событиям нужно от игры (FortGame) */
export interface EventHost {
  readonly tick: number;
  readonly horde: Horde;
  readonly world: CollisionWorld;
  readonly rng: () => number;
  /** Живые защитники (собраны в начале тика) */
  targets(): readonly HordeTarget[];
  hitPlayer(zid: number, pid: number, dmg: number): void;
  hitGate(dmg: number): void;
  gateUp(): boolean;
  event(e: FortEvent): void;
  systemChat(text: string): void;
  /** Ящик подобран: награда (хук arsenal grantSupply) */
  supplyPicked(pid: number): void;
}

interface Strike {
  /** Тик удара; метка — за METEOR_WARN_TICKS до него */
  at: number;
  /** В гущу орды (иначе — рядом с людьми) */
  crowd: boolean;
  warned: boolean;
  x: number;
  y: number;
  z: number;
}

/** Откуда в небе прилетает метеор: с севера и чуть сбоку, высоко */
const SKY_H = 46;
const SKY_BACK = 34;

export class WaveEvents {
  private readonly host: EventHost;
  /** Событие идущей волны (EV_*) */
  kind = EV_NONE;
  private strikes: Strike[] = [];
  private meteorsOn = false;
  private meteorsDone = false;
  /** Ящик: CRATE_*, где, когда начал падать / сядет */
  crate = CRATE_NONE;
  crateX = 0;
  crateY = 0;
  crateZ = 0;
  private dropAt = -1;
  private landAt = 0;
  private readonly spot = { x: 0, y: 0, z: 0 };
  /** Кандидаты для удара в толпу (живые на земле) — без выделений памяти */
  private readonly ground: Zombie[] = [];

  constructor(host: EventHost) {
    this.host = host;
  }

  /** Волна началась: расписание по её плану */
  start(plan: WavePlan, tick: number): void {
    this.stop();
    this.kind = plan.event;
    if (this.kind === EV_NONE) return;
    let span = 0;
    for (const s of plan.spawns) span = Math.max(span, s.at);
    if (span <= 0) span = releaseTicks(plan.w);
    const rng = this.host.rng;
    if (this.kind === EV_METEORS) {
      const first = tick + clamp(Math.round(span * 0.45), 6 * TICK_RATE, 20 * TICK_RATE) + METEOR_WARN_TICKS;
      for (let i = 0; i < METEOR_COUNT; i++) {
        const jitter = Math.round((rng() - 0.5) * 16);
        const at = first + Math.round((i * METEOR_TICKS) / METEOR_COUNT) + (i > 0 ? jitter : 0);
        this.strikes.push({ at, crowd: i % METEOR_CROWD_EVERY === 0, warned: false, x: 0, y: 0, z: 0 });
      }
      this.strikes.sort((a, b) => a.at - b.at);
    } else if (this.kind === EV_SUPPLY) {
      this.dropAt = tick + clamp(Math.round(span * 0.25), 5 * TICK_RATE, 12 * TICK_RATE);
    } else if (this.kind === EV_GOLD) {
      this.host.event(['event', EV_GOLD, 1]);
      this.host.systemChat('🌟 Золотая лихорадка! Враги на 20 % быстрее, награда за них ×2');
    } else if (this.kind === EV_FOG) {
      this.host.event(['event', EV_FOG, 1]);
      this.host.systemChat('🌫 С моря пришёл туман — видно недалеко, ищите светящиеся глаза');
    }
  }

  /** Волна кончилась (отбили, пали, новая игра): всё убрать, клиентам — конец события */
  stop(): void {
    if (this.meteorsOn && !this.meteorsDone) this.host.event(['event', EV_METEORS, 0]);
    if (this.crate !== CRATE_NONE) {
      this.host.event(['supply', 3, 0, r2(this.crateX), r2(this.crateY), r2(this.crateZ)]);
      this.host.event(['event', EV_SUPPLY, 0]);
    }
    if (this.kind === EV_GOLD || this.kind === EV_FOG) this.host.event(['event', this.kind, 0]);
    this.kind = EV_NONE;
    this.strikes = [];
    this.meteorsOn = false;
    this.meteorsDone = false;
    this.crate = CRATE_NONE;
    this.dropAt = -1;
  }

  /** Тик волны (после хода орды) */
  step(): void {
    if (this.kind === EV_METEORS) this.stepMeteors();
    else if (this.kind === EV_SUPPLY) this.stepSupply();
  }

  /** E у ящика: подобрать, если дотянулся. true — подобрал. */
  use(pid: number, x: number, y: number, z: number): boolean {
    if (this.crate !== CRATE_DOWN) return false;
    if (Math.hypot(x - this.crateX, z - this.crateZ) > SUPPLY_PICK_R || Math.abs(y - this.crateY) > 2.5) return false;
    this.pick(pid);
    return true;
  }

  // ------------------------------------------------------------ метеоры

  private stepMeteors(): void {
    const tick = this.host.tick;
    let left = 0;
    for (const s of this.strikes) {
      if (s.at < 0) continue;
      if (!s.warned && tick >= s.at - METEOR_WARN_TICKS) this.warn(s);
      if (s.warned && tick >= s.at) {
        this.impact(s);
        s.at = -1;
        continue;
      }
      left++;
    }
    if (this.meteorsOn && !this.meteorsDone && left === 0) {
      this.meteorsDone = true;
      this.host.event(['event', EV_METEORS, 0]);
    }
  }

  private warn(s: Strike): void {
    if (!this.meteorsOn) {
      this.meteorsOn = true;
      this.host.event(['event', EV_METEORS, 1]);
      this.host.systemChat('☄ Метеоры! 14 с — не стойте на месте, уходите из красных кругов');
    }
    const p = this.spot;
    if (!(s.crowd ? this.crowdSpot(p) || this.peopleSpot(p) : this.peopleSpot(p) || this.crowdSpot(p))) this.fieldSpot(p);
    s.warned = true;
    s.x = p.x;
    s.y = p.y;
    s.z = p.z;
    const rng = this.host.rng;
    const side = (rng() - 0.5) * 30;
    this.host.event(['warn', 0, ZS_METEOR, r2(p.x), r2(p.y), r2(p.z), METEOR_R, s.at]);
    this.host.event(['throw', r2(p.x + side), SKY_H, r2(p.z - SKY_BACK), r2(p.x), r2(p.y), r2(p.z), s.at - this.host.tick, ZS_METEOR]);
  }

  private impact(s: Strike): void {
    const h = this.host;
    h.horde.skyStrike(s.x, s.y, s.z, METEOR_R, METEOR_ZOMBIE);
    for (const t of h.targets()) {
      if (Math.hypot(t.x - s.x, t.z - s.z) <= METEOR_R && Math.abs(t.y - s.y) < 2.5) h.hitPlayer(0, t.id, METEOR_PLAYER);
    }
    // ворота: круг задевает створки
    if (h.gateUp() && s.y < GATE.h + 1) {
      const gx = clamp(s.x, GATE.x0, GATE.x1);
      const gz = clamp(s.z, GATE.face, GATE.z1);
      if (Math.hypot(s.x - gx, s.z - gz) <= METEOR_R + 0.3) h.hitGate(METEOR_GATE);
    }
    h.event(['blast', ZS_METEOR, r2(s.x), r2(s.y + 0.3), r2(s.z), METEOR_R]);
  }

  /**
   * В гущу орды: из нескольких случайных живых на земле — тот, у кого больше соседей; с упреждением на время полёта.
   * Выбираем среди живых, а не среди мест орды: мест 60, и к концу волны случайные места почти все пустые.
   */
  private crowdSpot(out: { x: number; y: number; z: number }): boolean {
    const zs = this.host.horde.zombies;
    const rng = this.host.rng;
    const lead = METEOR_WARN_TICKS / TICK_RATE;
    const ground = this.ground;
    ground.length = 0;
    for (const z of zs) {
      if (z.alive && z.kind !== Z_BOAT && !isBossKind(z.kind) && !(ZK[z.kind].flags & KF_AIR) && z.y <= 0.5) ground.push(z);
    }
    let best = -1;
    for (let tries = 0; tries < 10 && ground.length; tries++) {
      const z = ground[Math.floor(rng() * ground.length)];
      const x = z.x + z.vx * lead;
      const zz = z.z + z.vz * lead;
      let near = 0;
      for (const o of zs) if (o.alive && o.y < 0.5 && Math.abs(o.x - x) < METEOR_R && Math.abs(o.z - zz) < METEOR_R) near++;
      if (near > best) {
        best = near;
        out.x = x;
        out.z = zz;
      }
    }
    if (best < 0) return false;
    out.y = this.surface(out.x, 1, out.z);
    return true;
  }

  /** Рядом с кем-то из защитников (не точно в него — шаг в сторону спасает) */
  private peopleSpot(out: { x: number; y: number; z: number }): boolean {
    const ts = this.host.targets();
    if (!ts.length) return false;
    const rng = this.host.rng;
    const t = ts[Math.floor(rng() * ts.length)];
    const a = rng() * Math.PI * 2;
    const d = rng() * 1.6;
    out.x = t.x + Math.cos(a) * d;
    out.z = t.z + Math.sin(a) * d;
    out.y = this.surface(out.x, t.y + 0.5, out.z);
    return true;
  }

  /** Никого нет — в поле перед воротами */
  private fieldSpot(out: { x: number; y: number; z: number }): void {
    const rng = this.host.rng;
    out.x = (rng() - 0.5) * 28;
    out.z = -20 - rng() * 12;
    out.y = 0;
  }

  /** Верх того, на что упадёт (не выше from) */
  private surface(x: number, from: number, z: number): number {
    const y = this.host.world.groundBelow(x, from, z);
    return Number.isFinite(y) ? y : 0;
  }

  // ------------------------------------------------------------ ящик

  private stepSupply(): void {
    const h = this.host;
    if (this.dropAt >= 0 && h.tick >= this.dropAt) {
      this.dropAt = -1;
      this.place();
      this.crate = CRATE_FALL;
      this.landAt = h.tick + SUPPLY_FALL_TICKS;
      h.event(['event', EV_SUPPLY, 1]);
      h.event(['supply', 0, 0, r2(this.crateX), r2(this.crateY), r2(this.crateZ)]);
      const out = this.crateY < 0.5 && !insideFort(this.crateX, this.crateZ);
      h.systemChat(out ? '📦 Сброс припасов — ящик падает в поле за стеной! Кто рискнёт? (назад — по лестницам на флангах)'
        : '📦 Сброс припасов — ящик падает в крепость, подберите (E)');
      return;
    }
    if (this.crate === CRATE_FALL && h.tick >= this.landAt) {
      this.crate = CRATE_DOWN;
      h.event(['supply', 1, 0, r2(this.crateX), r2(this.crateY), r2(this.crateZ)]);
    }
    if (this.crate !== CRATE_DOWN) return;
    for (const t of h.targets()) {
      if (Math.hypot(t.x - this.crateX, t.z - this.crateZ) <= SUPPLY_TOUCH_R && Math.abs(t.y - this.crateY) < 1.6) {
        this.pick(t.id);
        return;
      }
    }
  }

  private pick(pid: number): void {
    const h = this.host;
    this.crate = CRATE_NONE;
    h.event(['supply', 2, pid, r2(this.crateX), r2(this.crateY), r2(this.crateZ)]);
    h.event(['event', EV_SUPPLY, 0]);
    h.supplyPicked(pid);
  }

  /** Куда упадёт: в 40 % — в поле (север или фланги), иначе — во двор, на террасу или на ход по стене */
  private place(): void {
    const rng = this.host.rng;
    if (rng() < SUPPLY_FIELD) {
      const u = rng();
      if (u < 0.55) {
        this.crateX = (rng() - 0.5) * 40;
        this.crateZ = -22 - rng() * 14;
      } else {
        this.crateX = (u < 0.775 ? -1 : 1) * (24 + rng() * 10);
        this.crateZ = -14 + rng() * 26;
      }
      this.crateY = this.surface(this.crateX, 2, this.crateZ);
      return;
    }
    for (let tries = 0; tries < 12; tries++) {
      const wall = rng() < 0.25;
      let x: number;
      let z: number;
      if (wall) {
        const north = rng() < 0.5;
        x = north ? (rng() - 0.5) * 28 : (rng() < 0.5 ? -1 : 1) * (15.6 + rng() * 1.8);
        z = north ? -15.5 + rng() * 2 : -12 + rng() * 22;
      } else {
        x = (rng() - 0.5) * 27;
        z = -12 + rng() * 22.5;
      }
      const y = this.surface(x, WALL_H + 0.05, z);
      if (y > WALL_H + 0.05) continue;
      this.crateX = x;
      this.crateY = y;
      this.crateZ = z;
      return;
    }
    this.crateX = 0;
    this.crateY = 0;
    this.crateZ = -6;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
