// Арсенал «Крепости» на сервере (агент arsenal): золото игры 💰 и награды за врагов, общак волны, прокачка, стволы
// (дробь, болт насквозь, очередь), гранаты, башни на стенах (баллиста, пушка, смоляной котёл, жаровня), ворота и
// кристалл (ремонт и укрепление). Цены и строки лавки — shared/fortarsenal.ts (их же рисует клиент), шаг стволов —
// shared/fortgun.ts. Всё, что даёт и забирает золото, — только здесь.
import { EYE_HEIGHT, MAX_REWIND_TICKS, TICK_RATE } from '../../shared/constants.ts';
import { FORT_MAX_ALIVE, FT_BREAK, FT_END, FT_GATHER, FT_WAVE, ZK, ZS_ATTACK, ZS_WALK, Z_BOSS, Z_BRUTE, Z_FLYER } from '../../shared/fort.ts';
import { FT_STRIDE, fortShotDir, nearestZombie, zombieHead, zombieRay } from '../../shared/fortaim.ts';
import {
  ACT_CRYSTAL, ACT_GATE, ACT_SHOP, ACT_TOWER, AR_TAIL_BYTES, BOAT_BOUNTY, BURN_TICKS, CANNON_SPEED, CLEAN_MULT, CRIT_MUL, CRYSTAL_TIERS,
  DOT_EVERY, GATE_TIERS, GREN_BUY, GREN_CD, GREN_DMG, GREN_EDGE, GREN_FUSE, GREN_KNOCK, GREN_PER_WAVE, GREN_R, GREN_START, GUNS, GUN_COUNT,
  GUN_MARKER, KILL_SHARE, LATE_SHARE, NOPE_FAR, NOPE_GOLD, NOPE_LOCKED, ROW_GRENADES, ROW_GUN0, ROW_POUCH, SHOP_ROWS, START_GOLD, TAR_SLOW,
  TAR_TICKS, TOWERS, TOWER_MAX_LEVEL,
  TOWER_SPOT_COUNT, TOWER_UPGRADE, TW_BALLISTA, TW_BRAZIER, TW_CANNON, TW_TAR, TW_TYPES, UP_CRIT, UP_DMG, UP_MAG, UP_POUCH, UP_RATE,
  bountyMul, crystalMax, crystalRows, critChance, dmgMul, encodeArsenalTail, gateMax, gateRows, grenadeMax, gunDamage, kindFlags, killBounty,
  makeArsenalTail, shopRows, towerMul, towerRows, waveBonus,
  type ArsenalRow, type Loadout, type PanelRow,
} from '../../shared/fortarsenal.ts';
import { grenadeLaunch, grenadeStep, makeGrenade, type Grenade } from '../../shared/fortgren.ts';
import { HEAVY_IN_HANDS, gunInHands, refillFort } from '../../shared/fortgun.ts';
import { TOWER_MUZZLE, TOWER_SPOTS, insideFort, type FortStation } from '../../shared/fortmap.ts';
import { hashFloat } from '../../shared/math.ts';
import { BTN_ADS, BTN_SHOULDER, SHOT_RANGE, applySpread, damageAt, type Input } from '../../shared/sim.ts';
import { makeRayHit } from '../../shared/world.ts';
import type { FortGame, FortPlayer } from './game.ts';
import type { Zombie } from './horde.ts';

/** Деньги и покупки защитника на эту игру (живут в p.run.arsenal: вышел и вернулся — всё на месте) */
export interface ArsenalRun {
  gold: number;
  /** Сколько заработал за игру (без стартовых) — опоздавшим считают среднее */
  earned: number;
  /** Ступени: урон, темп, магазин, крит, подсумок */
  lv: number[];
  /** Купленные тяжёлые стволы (бит на номер) и какой из них во второй руке */
  gn: number;
  hv: number;
  gr: number;
  /** Сколько золота вложил в башни */
  invest: number;
  /** Золото за сбитых (для «лучшего защитника») */
  killGold: number;
}

/**
 * Забег игрока по крепости. Структуру и жизненный цикл (создание, вход заново, выплата жетонов при выходе) ведёт
 * агент fort; поле arsenal — арсенала. Пока их кода нет — простая заглушка в FortGame.runs (по pid, до новой игры).
 */
export interface FortRun {
  arsenal: ArsenalRun;
}

export function makeArsenalRun(): ArsenalRun {
  return { gold: START_GOLD, earned: 0, lv: [0, 0, 0, 0, 0], gn: 0, hv: 0, gr: GREN_START, invest: 0, killGold: 0 };
}

/** Старый забег (из сохранения, от другой версии) — к нынешнему виду, ничего не теряя */
export function normalizeArsenalRun(a: Partial<ArsenalRun> | undefined): ArsenalRun {
  const r = makeArsenalRun();
  if (!a) return r;
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  r.gold = Math.max(0, Math.round(num(a.gold, r.gold)));
  r.earned = Math.max(0, num(a.earned, 0));
  r.lv = r.lv.map((d, i) => Math.max(0, Math.floor(num(a.lv?.[i], d))));
  r.gn = num(a.gn, 0) & 0xe;
  r.hv = r.gn & (1 << num(a.hv, 0)) ? num(a.hv, 0) : 0;
  r.gr = Math.max(0, Math.floor(num(a.gr, r.gr)));
  r.invest = Math.max(0, num(a.invest, 0));
  r.killGold = Math.max(0, num(a.killGold, 0));
  return r;
}

/** Номер «стрелка» для урона башни: 250 + место (у людей номера 1…249) */
export const TOWER_BY = 250;

interface TowerState {
  type: number;
  level: number;
  cd: number;
  /** Кто сколько вложил (pid → золото): им делится награда за урон башни */
  invest: Map<number, number>;
}

interface Flying {
  id: number;
  by: number;
  g: Grenade;
  t: number;
  dmg: number;
}

interface Ball {
  spot: number;
  x: number;
  y: number;
  z: number;
  at: number;
  dmg: number;
}

interface Burn {
  until: number;
  dps: number;
  by: number;
}

/** Мелочь, которую отбрасывает дробь, граната и ядро */
function knockable(z: Zombie): boolean {
  if (z.kind === Z_BOSS || z.kind === Z_BRUTE || z.kind === Z_FLYER) return false;
  const f = kindFlags(z.kind);
  if (f.boss || f.armored || f.air || f.superBoss) return false;
  return z.state === ZS_WALK || z.state === ZS_ATTACK;
}

/** Хуки агента fort (их веток здесь нет): урон по площади с бронёй и щитом, ранг и экипаж лодки у зомби */
interface HordeHooks {
  areaDamage?(x: number, y: number, z: number, r: number, dmg: number, by: number): void;
}
type ZombieExtra = Zombie & { rank?: number; crew?: boolean };

export class Arsenal {
  private readonly game: FortGame;
  readonly towers: TowerState[] = [];
  /** Лужи смолы: до какого тика и где */
  readonly tarUntil: number[] = new Array(TOWER_SPOT_COUNT).fill(0);
  readonly tarAt: Array<{ x: number; z: number }> = TOWER_SPOTS.map((s) => ({ x: s.x + s.nx * 4, z: s.z + s.nz * 4 }));
  private grenades: Flying[] = [];
  private balls: Ball[] = [];
  private readonly burns = new Map<Zombie, Burn>();
  /** Общак волны (40 % наград), сбитых своих за волну, падали ли ворота */
  pot = 0;
  downs = 0;
  gateFell = false;
  gateTier = 0;
  crystalTier = 0;
  private nextGren = 1;
  private readonly tail = makeArsenalTail();
  private readonly tg = new Float64Array(FORT_MAX_ALIVE * FT_STRIDE);
  private readonly who: Zombie[] = [];
  private readonly hit = makeRayHit();
  private readonly near = { t: 0 };
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly dir = { dirX: 0, dirY: 0, dirZ: 0 };
  private readonly pd = { dirX: 0, dirY: 0, dirZ: 0 };
  private readonly accDmg: number[] = [];
  private readonly accHits: number[] = [];
  private readonly accHead: boolean[] = [];
  private readonly accPt: number[] = [];
  private readonly touched: number[] = [];

  constructor(game: FortGame) {
    this.game = game;
    for (let i = 0; i < TOWER_SPOT_COUNT; i++) this.towers.push({ type: -1, level: 0, cd: 0, invest: new Map() });
  }

  // ------------------------------------------------------------ жизненный цикл

  /** Новая игра: башни, ступени ворот и кристалла, общак — с нуля (забеги игроков обнуляет хозяин) */
  newGame(): void {
    for (const t of this.towers) {
      t.type = -1;
      t.level = 0;
      t.cd = 0;
      t.invest.clear();
    }
    this.tarUntil.fill(0);
    this.grenades = [];
    this.balls = [];
    this.burns.clear();
    this.pot = 0;
    this.downs = 0;
    this.gateFell = false;
    this.gateTier = 0;
    this.crystalTier = 0;
  }

  /** Новый забег: стартовое золото; опоздавшему — ещё 75 % от среднего заработка команды */
  newRun(late: boolean): FortRun {
    const a = makeArsenalRun();
    if (late) {
      const list = [...this.game.players.values()];
      if (list.length) {
        const avg = list.reduce((n, p) => n + p.run.arsenal.earned, 0) / list.length;
        a.gold += Math.round(avg * LATE_SHARE);
        a.earned = Math.round(avg * LATE_SHARE);
      }
    }
    return { arsenal: a };
  }

  loadout(p: FortPlayer, out: Loadout): Loadout {
    const a = p.run.arsenal;
    out.heavy = a.hv;
    out.rate = a.lv[UP_RATE];
    out.mag = a.lv[UP_MAG];
    return out;
  }

  row(p: FortPlayer): ArsenalRow {
    const a = p.run.arsenal;
    return { g: Math.floor(a.gold), lv: a.lv.slice(), gn: a.gn, hv: a.hv, gr: a.gr };
  }

  onWaveStart(): void {
    this.pot = 0;
    this.downs = 0;
    this.gateFell = false;
    for (const p of this.game.players.values()) {
      const a = p.run.arsenal;
      const max = grenadeMax(a.lv[UP_POUCH]);
      if (a.gr < max) {
        a.gr = Math.min(max, a.gr + GREN_PER_WAVE);
        this.game.event(['grens', p.id, a.gr]);
      }
    }
    this.game.touchRoster();
  }

  /** Конец волны: общак поровну (чистая волна — ×1,5) и бонус волны каждому, кто в крепости */
  onWaveEnd(): void {
    const list = [...this.game.players.values()];
    const clean = this.downs === 0 && !this.gateFell;
    const bonus = waveBonus(this.game.wave);
    const share = list.length ? Math.round((this.pot * (clean ? CLEAN_MULT : 1)) / list.length) : 0;
    for (const p of list) {
      this.credit(p.run.arsenal, share + bonus);
      this.game.event(['pot', p.id, share, bonus, clean ? 1 : 0]);
    }
    this.pot = 0;
    this.game.touchRoster();
  }

  onDown(): void {
    this.downs++;
  }

  onGateFell(): void {
    this.gateFell = true;
  }

  private credit(a: ArsenalRun, v: number): void {
    if (!(v > 0)) return;
    a.gold += v;
    a.earned += v;
  }

  // ------------------------------------------------------------ награды

  /**
   * Враг сбит: награда × рост волны. 60 % — тем, кто его бил (по урону; урон башни — тем, кто в неё вложился),
   * 40 % — в общак волны. «+N» всплывает у каждого, кому досталось.
   */
  onKill(z: Zombie): void {
    const g = this.game;
    const extra = z as ZombieExtra;
    const shooter = killBounty(z.kind, Math.max(1, g.wave), extra.rank ?? 0, extra.crew ?? false);
    const total = shooter / KILL_SHARE;
    let given = 0;
    let dmgSum = 0;
    for (const v of z.damageBy.values()) dmgSum += v;
    if (dmgSum > 0) {
      const y = z.y + (ZK[z.kind]?.hcy ?? 1);
      for (const [id, d] of z.damageBy) {
        const part = (shooter * d) / dmgSum;
        if (id >= TOWER_BY && id < TOWER_BY + TOWER_SPOT_COUNT) given += this.payTower(id - TOWER_BY, part, z.x, y, z.z);
        else {
          const p = g.players.get(id);
          if (!p) continue;
          const v = Math.round(part);
          if (v <= 0) continue;
          this.credit(p.run.arsenal, v);
          p.run.arsenal.killGold += v;
          given += part;
          g.event(['gold', p.id, v, r2(z.x), r2(y), r2(z.z)]);
        }
      }
    }
    // доля ушедших и сам общак
    this.pot += total - given;
    g.touchRoster();
  }

  /** Доля башни — её вкладчикам по вкладу (ушедших — в общак: вернётся поровну) */
  private payTower(spot: number, part: number, x: number, y: number, z: number): number {
    const t = this.towers[spot];
    let sum = 0;
    for (const v of t.invest.values()) sum += v;
    if (sum <= 0) return 0;
    let given = 0;
    for (const [pid, v] of t.invest) {
      const p = this.byPid(pid);
      if (!p) continue;
      const amount = Math.round((part * v) / sum);
      if (amount <= 0) continue;
      this.credit(p.run.arsenal, amount);
      given += (part * v) / sum;
      this.game.event(['gold', p.id, amount, r2(x), r2(y), r2(z)]);
    }
    return given;
  }

  private byPid(pid: number): FortPlayer | null {
    for (const p of this.game.players.values()) if (p.pid === pid) return p;
    return null;
  }

  /** Награда команде поровну (затонувшая лодка десанта — хук для агента fort) */
  teamBounty(amount = BOAT_BOUNTY, x = 0, y = 0, z = 0): void {
    const list = [...this.game.players.values()];
    if (!list.length) return;
    const each = Math.round((amount * bountyMul(this.game.wave)) / list.length);
    for (const p of list) {
      this.credit(p.run.arsenal, each);
      this.game.event(['gold', p.id, each, r2(x), r2(y), r2(z)]);
    }
    this.game.touchRoster();
  }

  // ------------------------------------------------------------ стволы

  /** Цели — зомби там, где их видел стрелок (viewTick, не дальше MAX_REWIND_TICKS) */
  private collectTargets(viewTick: number): number {
    const g = this.game;
    let rewind = g.tick - viewTick;
    if (!(rewind >= 0)) rewind = 0;
    if (rewind > MAX_REWIND_TICKS) rewind = MAX_REWIND_TICKS;
    const t = g.tick - rewind;
    const tg = this.tg;
    let n = 0;
    for (const z of g.horde.zombies) {
      if (!z.alive || n >= FORT_MAX_ALIVE) continue;
      const pos = this.pos;
      if (rewind > 0) {
        if (!g.horde.sample(z, t, pos)) continue;
      } else {
        pos.x = z.x;
        pos.y = z.y;
        pos.z = z.z;
      }
      const o = n * FT_STRIDE;
      tg[o] = pos.x;
      tg[o + 1] = pos.y;
      tg[o + 2] = pos.z;
      tg[o + 3] = z.kind;
      this.who[n] = z;
      n++;
    }
    return n;
  }

  /**
   * Выстрел защитника из ствола в руках. Маркер — как раньше (событие 'shot'); дробовик — 8 дробин конусом (урон по
   * зомби суммируется, 3+ дробины отбрасывают мелочь); арбалет — болт насквозь до трёх целей; пулемёт — очередь.
   * Урон × «Урон», крит × 2,5 с шансом «Крита».
   */
  fire(p: FortPlayer, inp: Input): void {
    const g = this.game;
    const s = p.state;
    const gun = gunInHands(s, p.load);
    const spec = GUNS[gun];
    const n = this.collectTargets(inp.viewTick);
    const tg = this.tg;
    const side = (inp.buttons & BTN_SHOULDER) !== 0 ? -1 : 1;
    const ads = (inp.buttons & BTN_ADS) !== 0;
    fortShotDir(s, p.ev.aimYaw, p.ev.aimPitch, p.ev.spread, p.seed, s.shots, side, ads, g.world, tg, n, this.dir);
    const ox = s.x;
    const oy = s.y + EYE_HEIGHT;
    const oz = s.z;
    const a = p.run.arsenal;
    const crit = hashFloat(p.seed ^ 0x3c417, s.shots) < critChance(a.lv[UP_CRIT]);
    const mul = dmgMul(a.lv[UP_DMG]) * (crit ? CRIT_MUL : 1);
    for (let i = 0; i < n; i++) {
      this.accDmg[i] = 0;
      this.accHits[i] = 0;
      this.accHead[i] = false;
    }
    this.touched.length = 0;
    const pellets = Math.max(1, spec.pellets);
    let ex = 0;
    let ey = 0;
    let ez = 0;
    let endKind = 2;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let k = 0; k < pellets; k++) {
      let dx = this.dir.dirX;
      let dy = this.dir.dirY;
      let dz = this.dir.dirZ;
      if (pellets > 1 && k > 0) {
        applySpread(dx, dy, dz, spec.cone, p.seed ^ 0x5eed, (s.shots * 16 + k) >>> 0, this.pd);
        dx = this.pd.dirX;
        dy = this.pd.dirY;
        dz = this.pd.dirZ;
      }
      let wall = SHOT_RANGE;
      let kind = 2;
      if (g.world.raycast(ox, oy, oz, dx, dy, dz, SHOT_RANGE, this.hit, true)) {
        wall = this.hit.t;
        kind = 0;
        if (k === 0) {
          nx = this.hit.nx;
          ny = this.hit.ny;
          nz = this.hit.nz;
        }
      }
      // болт прошивает до pierce целей: каждая следующая — ближайшая после предыдущей
      let keep = 1;
      let from = -1;
      let end = wall;
      for (let hitN = 0; hitN < spec.pierce; hitN++) {
        const i = this.nextZombie(ox, oy, oz, dx, dy, dz, from, wall, n);
        if (i < 0) break;
        const t = this.near.t;
        from = t;
        if (hitN === 0) {
          end = t;
          kind = 1;
        }
        const hy = oy + dy * t;
        const head = zombieHead(tg[i * FT_STRIDE + 3], hy, tg[i * FT_STRIDE + 1]);
        const base = gun === GUN_MARKER ? damageAt(t, head) : gunDamage(gun, t, head);
        if (this.accHits[i] === 0) {
          this.touched.push(i);
          this.accPt[i * 3] = ox + dx * t;
          this.accPt[i * 3 + 1] = hy;
          this.accPt[i * 3 + 2] = oz + dz * t;
        }
        this.accDmg[i] += base * mul * keep;
        this.accHits[i]++;
        if (head) this.accHead[i] = true;
        keep *= spec.pierceKeep;
      }
      if (k === 0) {
        ex = ox + dx * end;
        ey = oy + dy * end;
        ez = oz + dz * end;
        endKind = kind;
      }
    }
    if (gun === GUN_MARKER) g.event(['shot', p.id, r2(ox), r2(oy), r2(oz), r2(ex), r2(ey), r2(ez), endKind, nx, ny, nz]);
    else g.event(['gshot', p.id, gun, r2(ox), r2(oy), r2(oz), r2(ex), r2(ey), r2(ez), endKind, nx, ny, nz]);
    for (const i of this.touched) {
      const z = this.who[i];
      if (!z.alive) continue;
      if (crit) g.event(['crit', z.id]);
      // отброс: дробь (3+ дробины) и болт — мелочь отлетает по направлению выстрела
      if (spec.knock > 0 && (pellets === 1 || this.accHits[i] >= 3) && knockable(z)) {
        const hl = Math.hypot(this.dir.dirX, this.dir.dirZ) || 1;
        z.vx += (this.dir.dirX / hl) * spec.knock;
        z.vz += (this.dir.dirZ / hl) * spec.knock;
      }
      g.horde.damage(z, this.accDmg[i], p.id, this.accHead[i], this.accPt[i * 3], this.accPt[i * 3 + 1], this.accPt[i * 3 + 2]);
    }
  }

  /** Ближайший зомби на луче дальше from и ближе maxT (номер в списке целей) */
  private nextZombie(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, from: number, maxT: number, n: number): number {
    if (from < 0) return nearestZombie(ox, oy, oz, dx, dy, dz, maxT, this.tg, n, this.near);
    let best = maxT;
    let who = -1;
    for (let i = 0; i < n; i++) {
      const t = zombieRay(ox, oy, oz, dx, dy, dz, this.tg, i);
      if (t > from + 1e-4 && t < best) {
        best = t;
        who = i;
      }
    }
    this.near.t = best;
    return who;
  }

  // ------------------------------------------------------------ гранаты

  /** Отпустил G: бросок, если есть граната и прошла перезарядка броска */
  throwGrenade(p: FortPlayer, inp: Input): void {
    const g = this.game;
    const a = p.run.arsenal;
    if (!p.alive || g.phase === FT_END || a.gr <= 0 || g.tick < p.grenReady) return;
    a.gr--;
    p.grenReady = g.tick + GREN_CD;
    const gr = makeGrenade();
    grenadeLaunch(p.state.x, p.state.y, p.state.z, inp.yaw, inp.pitch, g.world, this.hit, gr);
    const id = this.nextGren++ & 0xffff;
    this.grenades.push({ id, by: p.id, g: gr, t: GREN_FUSE, dmg: GREN_DMG * dmgMul(a.lv[UP_DMG]) });
    g.event(['gren', p.id, id, gr.x, gr.y, gr.z, gr.vx, gr.vy, gr.vz]);
    g.touchRoster();
  }

  /** Сбросы припасов агента fort зовут сюда: гранаты выдаёт арсенал */
  grantSupply(p: FortPlayer, count = GREN_BUY): void {
    const a = p.run.arsenal;
    const max = grenadeMax(a.lv[UP_POUCH]);
    if (a.gr >= max) return;
    a.gr = Math.min(max, a.gr + count);
    this.game.event(['grens', p.id, a.gr]);
    this.game.touchRoster();
  }

  private stepGrenades(): void {
    const g = this.game;
    if (!this.grenades.length) return;
    const keep: Flying[] = [];
    for (const f of this.grenades) {
      grenadeStep(f.g, g.world, this.hit);
      f.t--;
      let boom = f.t <= 0 || f.g.y < -3;
      if (!boom) {
        // задела зомби — сразу
        for (const z of g.horde.zombies) {
          if (!z.alive) continue;
          const k = ZK[z.kind] ?? ZK[0];
          if (Math.abs(f.g.y - (z.y + k.hcy)) > k.hry + 0.15) continue;
          if (Math.hypot(f.g.x - z.x, f.g.z - z.z) > k.hrx + 0.15) continue;
          boom = true;
          break;
        }
      }
      if (!boom) {
        keep.push(f);
        continue;
      }
      g.event(['boom', r2(f.g.x), r2(f.g.y), r2(f.g.z), GREN_R, 0, f.id]);
      this.blast(f.g.x, f.g.y, f.g.z, GREN_R, f.dmg, GREN_EDGE / GREN_DMG, f.by, GREN_KNOCK);
    }
    this.grenades = keep;
  }

  /**
   * Взрыв: урон по площади (хук агента fort horde.areaDamage — с бронёй и щитом; пока его нет — свой: к краю
   * урон падает до edge) и отброс мелочи от центра. Своих, ворота и кристалл не задевает.
   */
  private blast(x: number, y: number, z: number, r: number, dmg: number, edge: number, by: number, knock: number): void {
    const g = this.game;
    const horde = g.horde as typeof g.horde & HordeHooks;
    if (knock > 0) {
      for (const zb of horde.zombies) {
        if (!zb.alive || !knockable(zb)) continue;
        const dx = zb.x - x;
        const dz = zb.z - z;
        const d = Math.hypot(dx, dz);
        if (d > r || Math.abs(zb.y - y) > r) continue;
        const k = knock * (1 - (0.5 * d) / r);
        zb.vx += d > 1e-3 ? (dx / d) * k : k;
        zb.vz += d > 1e-3 ? (dz / d) * k : 0;
      }
    }
    if (typeof horde.areaDamage === 'function') {
      horde.areaDamage(x, y, z, r, dmg, by);
      return;
    }
    for (const zb of horde.zombies) {
      if (!zb.alive) continue;
      const k = ZK[zb.kind] ?? ZK[0];
      const cy = zb.y + k.hcy;
      const d = Math.max(0, Math.hypot(zb.x - x, cy - y, zb.z - z) - k.hrx * 0.6);
      if (d > r) continue;
      const f = 1 - (1 - edge) * (d / r);
      horde.damage(zb, dmg * f, by, false, zb.x, cy, zb.z);
    }
  }

  // ------------------------------------------------------------ башни

  private teamDmgMul(): number {
    let sum = 0;
    let n = 0;
    for (const p of this.game.players.values()) {
      sum += dmgMul(p.run.arsenal.lv[UP_DMG]);
      n++;
    }
    return n ? sum / n : 1;
  }

  /** Лучшая видимая цель для башни: приоритет — меньше лучше (null — никого). Видит из бойницы — за бруствером. */
  private pick(spot: number, range: number, minRange: number, prio: (z: Zombie, d: number) => number): Zombie | null {
    const g = this.game;
    const s = TOWER_SPOTS[spot];
    const ox = s.x + s.nx * s.port;
    const oy = s.y + TOWER_MUZZLE;
    const oz = s.z + s.nz * s.port;
    let best: Zombie | null = null;
    let bp = Infinity;
    for (const z of g.horde.zombies) {
      if (!z.alive) continue;
      const k = ZK[z.kind] ?? ZK[0];
      const tx = z.x - ox;
      const ty = z.y + k.hcy - oy;
      const tz = z.z - oz;
      const d = Math.hypot(tx, ty, tz);
      if (d >= range || d < minRange || d < 1e-3) continue;
      const pr = prio(z, d);
      if (pr >= bp) continue;
      if (g.world.raycast(ox, oy, oz, tx / d, ty / d, tz / d, Math.max(0, d - k.hrx), this.hit, true)) continue;
      best = z;
      bp = pr;
    }
    return best;
  }

  private stepTowers(): void {
    const g = this.game;
    const team = this.teamDmgMul();
    for (let i = 0; i < TOWER_SPOT_COUNT; i++) {
      const t = this.towers[i];
      if (t.type < 0) continue;
      if (t.cd > 0) {
        t.cd--;
        continue;
      }
      const spec = TOWERS[t.type];
      const mul = towerMul(t.level, team);
      const s = TOWER_SPOTS[i];
      const by = TOWER_BY + i;
      switch (t.type) {
        case TW_BALLISTA: {
          // сначала крылатые, потом бронированные, потом ближние
          const z = this.pick(i, spec.range, 0, (zb, d) => {
            const f = kindFlags(zb.kind);
            return d - (f.air ? 100 : 0) - (f.armored ? 40 : 0);
          });
          if (!z) {
            t.cd = 6;
            break;
          }
          t.cd = spec.every;
          const y = z.y + (ZK[z.kind]?.hcy ?? 1);
          g.event(['bolt', i, z.id, r2(z.x), r2(y), r2(z.z)]);
          g.horde.damage(z, spec.dmg * mul, by, false, z.x, y, z.z);
          break;
        }
        case TW_CANNON: {
          const z = this.pick(i, spec.range, spec.minRange, (zb, d) => (kindFlags(zb.kind).air ? Infinity : d));
          if (!z) {
            t.cd = 6;
            break;
          }
          t.cd = spec.every;
          const d = Math.hypot(z.x - s.x, z.z - s.z);
          const flight = Math.max(6, Math.round((d / CANNON_SPEED) * TICK_RATE));
          // упреждение: куда зомби дойдёт за полёт ядра
          const x = z.x + z.vx * (flight / TICK_RATE) * 0.8;
          const zz = z.z + z.vz * (flight / TICK_RATE) * 0.8;
          this.balls.push({ spot: i, x, y: z.y, z: zz, at: g.tick + flight, dmg: spec.dmg * mul });
          g.event(['cball', i, r2(x), r2(z.y), r2(zz), flight]);
          break;
        }
        case TW_TAR: {
          if (this.tarUntil[i] > g.tick) {
            t.cd = 6;
            break;
          }
          // льёт на ближнего у подножия стены (снаружи)
          let best: Zombie | null = null;
          let bd = 10;
          for (const z of g.horde.zombies) {
            if (!z.alive || kindFlags(z.kind).air || z.y > 1.5 || insideFort(z.x, z.z)) continue;
            const d = Math.hypot(z.x - s.x, z.z - s.z);
            if (d < bd) {
              bd = d;
              best = z;
            }
          }
          if (!best) {
            t.cd = 12;
            break;
          }
          t.cd = spec.every;
          this.tarUntil[i] = g.tick + TAR_TICKS;
          this.tarAt[i].x = best.x;
          this.tarAt[i].z = best.z;
          g.event(['tar', i, r2(best.x), r2(best.z)]);
          break;
        }
        case TW_BRAZIER: {
          const oy = s.y + 1;
          let lit = 0;
          for (const z of g.horde.zombies) {
            if (!z.alive || kindFlags(z.kind).air) continue;
            const k = ZK[z.kind] ?? ZK[0];
            if (Math.hypot(z.x - s.x, z.y + k.hcy - oy, z.z - s.z) > spec.range) continue;
            const b = this.burns.get(z);
            const dps = spec.dmg * mul;
            if (b) {
              b.until = g.tick + BURN_TICKS;
              b.dps = Math.max(b.dps, dps);
              b.by = by;
            } else {
              this.burns.set(z, { until: g.tick + BURN_TICKS, dps, by });
            }
            g.event(['burn', z.id, BURN_TICKS]);
            lit++;
          }
          if (!lit) {
            t.cd = 6;
            break;
          }
          t.cd = spec.every;
          g.event(['coals', i]);
          break;
        }
      }
    }
  }

  private stepBalls(): void {
    if (!this.balls.length) return;
    const g = this.game;
    const keep: Ball[] = [];
    for (const b of this.balls) {
      if (g.tick < b.at) {
        keep.push(b);
        continue;
      }
      g.event(['boom', r2(b.x), r2(b.y + 0.4), r2(b.z), TOWERS[TW_CANNON].radius, 1, 0]);
      this.blast(b.x, b.y + 0.4, b.z, TOWERS[TW_CANNON].radius, b.dmg, 0.6, TOWER_BY + b.spot, 9);
    }
    this.balls = keep;
  }

  /** Горение и смола: урон раз в DOT_EVERY тиков */
  private stepDot(): void {
    const g = this.game;
    if (g.tick % DOT_EVERY !== 0) return;
    const sec = DOT_EVERY / TICK_RATE;
    for (const [z, b] of this.burns) {
      if (!z.alive || g.tick >= b.until) {
        this.burns.delete(z);
        continue;
      }
      g.horde.damage(z, b.dps * sec, b.by, false, z.x, z.y + (ZK[z.kind]?.hcy ?? 1), z.z);
    }
    const team = this.teamDmgMul();
    for (let i = 0; i < TOWER_SPOT_COUNT; i++) {
      if (this.tarUntil[i] <= g.tick) continue;
      const t = this.towers[i];
      if (t.type !== TW_TAR) continue;
      const c = this.tarAt[i];
      const dmg = TOWERS[TW_TAR].dmg * towerMul(t.level, team) * sec;
      for (const z of g.horde.zombies) {
        if (!z.alive || z.y > 1.2 || kindFlags(z.kind).air) continue;
        if (Math.hypot(z.x - c.x, z.z - c.z) > TOWERS[TW_TAR].radius) continue;
        g.horde.damage(z, dmg, TOWER_BY + i, false, z.x, z.y + 0.3, z.z);
      }
    }
  }

  /** Во сколько раз медленнее в точке (лужа смолы); для HordeHost.slow */
  slow(x: number, z: number): number {
    const tick = this.game.tick;
    for (let i = 0; i < TOWER_SPOT_COUNT; i++) {
      if (this.tarUntil[i] <= tick) continue;
      const c = this.tarAt[i];
      if (Math.hypot(x - c.x, z - c.z) < TOWERS[TW_TAR].radius) return TAR_SLOW;
    }
    return 1;
  }

  /** Тик арсенала: гранаты летят всегда, башни и ядра — в волну */
  step(): void {
    this.stepGrenades();
    if (this.game.phase !== FT_WAVE) return;
    this.stepTowers();
    this.stepBalls();
    this.stepDot();
  }

  // ------------------------------------------------------------ лавка, ворота, кристалл, башни

  get gateMax(): number {
    return gateMax(this.gateTier);
  }

  get crystalMax(): number {
    return crystalMax(this.crystalTier);
  }

  private calm(): boolean {
    return this.game.phase === FT_GATHER || this.game.phase === FT_BREAK;
  }

  private station(kind: string, arg = 0): FortStation | undefined {
    return this.game.map.stations.find((st) => st.kind === kind && st.arg === arg);
  }

  private teamView() {
    const g = this.game;
    return { wave: Math.max(1, g.wave), calm: this.calm(), gold: 0, gate: g.gate, gateTier: this.gateTier, crystal: g.crystal, crystalTier: this.crystalTier };
  }

  /** Действие из панели (id ≥ 2000). false — не наше. */
  use(p: FortPlayer, id: number): boolean {
    if (id < ACT_SHOP || id >= ACT_TOWER + TOWER_SPOT_COUNT * 10) return false;
    const g = this.game;
    if (g.phase === FT_END) return true;
    const a = p.run.arsenal;
    let row: PanelRow | undefined;
    let st: FortStation | undefined;
    if (id < ACT_SHOP + SHOP_ROWS) {
      st = this.station('shop');
      row = shopRows({ wave: Math.max(1, g.wave), calm: this.calm(), row: this.row(p) })[id - ACT_SHOP];
    } else if (id >= ACT_GATE && id < ACT_GATE + 3) {
      st = this.station('gate');
      row = gateRows({ ...this.teamView(), gold: a.gold })[id - ACT_GATE];
    } else if (id >= ACT_CRYSTAL && id < ACT_CRYSTAL + 2) {
      st = this.station('crystal');
      row = crystalRows({ ...this.teamView(), gold: a.gold })[id - ACT_CRYSTAL];
    } else if (id >= ACT_TOWER) {
      const spot = Math.floor((id - ACT_TOWER) / 10);
      const k = (id - ACT_TOWER) % 10;
      const t = this.towers[spot];
      if (!t || (k >= TW_TYPES && k !== TOWER_UPGRADE)) return true;
      st = this.station('tower', spot);
      row = towerRows(spot, t.type, t.level, a.gold, this.teamDmgMul()).find((r) => r.id === id);
    }
    if (!row || !st) return true;
    // отказ — событием: панель у игрока открыта, причину покажет в ней (общий тост панель бы не услышала)
    if (!g.atStation(p, st)) {
      g.event(['anope', p.id, id, NOPE_FAR]);
      return true;
    }
    if (row.locked) {
      g.event(['anope', p.id, id, NOPE_LOCKED]);
      return true;
    }
    if (row.price > a.gold) {
      g.event(['anope', p.id, id, NOPE_GOLD]);
      return true;
    }
    a.gold -= row.price;
    this.apply(p, id, row.price);
    g.event(['abuy', p.id, id]);
    g.flushRoster();
    return true;
  }

  private apply(p: FortPlayer, id: number, price: number): void {
    const g = this.game;
    const a = p.run.arsenal;
    if (id < ACT_SHOP + SHOP_ROWS) {
      const r = id - ACT_SHOP;
      if (r < 4 || r === ROW_POUCH) {
        const line = r === ROW_POUCH ? UP_POUCH : r;
        a.lv[line] = Math.min(a.lv[line] + 1, 99);
        if (line === UP_POUCH) a.gr = Math.min(grenadeMax(a.lv[UP_POUCH]), a.gr + 1);
        if (line === UP_MAG || line === UP_RATE) this.rearm(p);
      } else if (r === ROW_GRENADES) {
        a.gr = Math.min(grenadeMax(a.lv[UP_POUCH]), a.gr + GREN_BUY);
      } else {
        const gun = r - ROW_GUN0 + 1;
        if (gun > GUN_MARKER && gun < GUN_COUNT) {
          a.gn |= 1 << gun;
          a.hv = gun;
          this.rearm(p);
        }
      }
      return;
    }
    if (id < ACT_CRYSTAL) {
      const r = id - ACT_GATE;
      const max = this.gateMax;
      if (r === 0) {
        g.gate = Math.min(max, g.gate + max * 0.25);
        g.event(['gate', 1, p.id]);
      } else if (r === 1) {
        this.gateTier = Math.min(GATE_TIERS, this.gateTier + 1);
        g.gate = Math.min(this.gateMax, g.gate + (this.gateMax - max));
        g.event(['gate', 1, p.id]);
      } else {
        g.raiseGate(this.gateMax);
        g.event(['gate', 2, p.id]);
      }
      return;
    }
    if (id < ACT_TOWER) {
      const r = id - ACT_CRYSTAL;
      const max = this.crystalMax;
      if (r === 0) g.crystal = Math.min(max, g.crystal + max * 0.1);
      else {
        this.crystalTier = Math.min(CRYSTAL_TIERS, this.crystalTier + 1);
        g.crystal = Math.min(this.crystalMax, g.crystal + (this.crystalMax - max));
      }
      return;
    }
    const spot = Math.floor((id - ACT_TOWER) / 10);
    const k = (id - ACT_TOWER) % 10;
    const t = this.towers[spot];
    if (k === TOWER_UPGRADE) t.level = Math.min(TOWER_MAX_LEVEL, t.level + 1);
    else {
      t.type = k;
      t.level = 1;
      t.cd = 30;
      t.invest.clear();
    }
    t.invest.set(p.pid, (t.invest.get(p.pid) ?? 0) + price);
    a.invest += price;
    g.event(['tower', spot, t.type, t.level, p.id]);
    if (k !== TOWER_UPGRADE) g.systemChat(`🏰 ${p.name} ставит: ${TOWERS[t.type].name} · ${TOWER_SPOTS[spot].name.toLowerCase()}`);
  }

  /** Сменились ствол или магазин: оба ствола полные, предсказание клиента — заново от сервера */
  private rearm(p: FortPlayer): void {
    this.loadout(p, p.load);
    refillFort(p.state, p.load);
    p.selfReset = true;
  }

  /** Тяжёлый ствол в руках у игрока (для состава и тестов) */
  heavyInHands(p: FortPlayer): boolean {
    return (p.state.awp & HEAVY_IN_HANDS) !== 0 && p.load.heavy > 0;
  }

  // ------------------------------------------------------------ снимок

  /** Блок арсенала в хвост снимка (после зомби) */
  encodeTail(out: Uint8Array, at: number): number {
    const t = this.tail;
    let tar = 0;
    for (let i = 0; i < TOWER_SPOT_COUNT; i++) {
      t.type[i] = this.towers[i].type;
      t.level[i] = this.towers[i].level;
      if (this.tarUntil[i] > this.game.tick) tar |= 1 << i;
    }
    t.tar = tar;
    t.gateTier = this.gateTier;
    t.crystalTier = this.crystalTier;
    return encodeArsenalTail(out, at, t);
  }

  static readonly tailBytes = AR_TAIL_BYTES;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
