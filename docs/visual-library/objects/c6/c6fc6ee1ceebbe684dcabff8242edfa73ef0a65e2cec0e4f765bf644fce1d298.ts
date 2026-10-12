// Боты: видят только то, что в прямой видимости, реагируют с задержкой,
// целятся «рукой» (с дрожанием и доводкой), стреляют очередями, стрейфят,
// прыгают, ходят по навигационной сетке и умеют пользоваться батутами.
import { DT, EYE_HEIGHT, PHASE_PLAY, STEP_HEIGHT, TICK_RATE } from '../../shared/constants.ts';
import { makeRng, wrapAngle } from '../../shared/math.ts';
import { BTN_ADS, BTN_BACK, BTN_DASH, BTN_FIRE, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, MAG_SIZE, makeInput, type Input } from '../../shared/sim.ts';
import { makeRayHit } from '../../shared/world.ts';
import type { Game, Player } from './game.ts';

export type Skill = 'easy' | 'normal' | 'hard';

interface SkillParams {
  reaction: [number, number];
  maxTurn: number;
  gain: number;
  noise: number;
  settle: number;
  burst: [number, number];
  pause: [number, number];
  tolerance: number;
  recoilComp: number;
  headChance: number;
  fov: number;
  jumpChance: number;
  dashChance: number;
  adsRange: number;
  strafe: [number, number];
}

const SKILLS: Record<Skill, SkillParams> = {
  easy: {
    reaction: [26, 40], maxTurn: 4.2, gain: 6.5, noise: 0.075, settle: 0.35, burst: [3, 5], pause: [20, 34],
    tolerance: 1.6, recoilComp: 0.15, headChance: 0.04, fov: 1.9, jumpChance: 0.25, dashChance: 0.1, adsRange: 99, strafe: [34, 80],
  },
  normal: {
    reaction: [15, 25], maxTurn: 7.5, gain: 10, noise: 0.044, settle: 0.55, burst: [4, 7], pause: [12, 24],
    tolerance: 1.25, recoilComp: 0.55, headChance: 0.14, fov: 2.2, jumpChance: 0.45, dashChance: 0.3, adsRange: 24, strafe: [22, 58],
  },
  hard: {
    reaction: [9, 16], maxTurn: 11, gain: 14, noise: 0.025, settle: 0.7, burst: [5, 9], pause: [8, 16],
    tolerance: 1.1, recoilComp: 0.85, headChance: 0.3, fov: 2.5, jumpChance: 0.6, dashChance: 0.5, adsRange: 17, strafe: [16, 44],
  },
};

interface Waypoint {
  x: number;
  z: number;
  h: number;
  tramp: boolean;
}

const VIEW_RANGE = 80;

export class BotBrain {
  private readonly p: Player;
  private readonly game: Game;
  private sk: SkillParams;
  private readonly rng: () => number;
  private readonly input: Input = makeInput();
  private yaw = 0;
  private pitch = 0;
  // цель
  private target: Player | null = null;
  private reactUntil = 0;
  private lastSeenTick = -9999;
  private lastSeen = { x: 0, y: 0, z: 0 };
  private huntUntil = 0;
  private trackSince = 0;
  private aimHead = false;
  private noiseYaw = 0;
  private noisePitch = 0;
  private burstLeft = 0;
  private pauseUntil = 0;
  private lastShots = 0;
  private hurtTick = -9999;
  // движение
  private waypoints: Waypoint[] = [];
  private wi = 0;
  private goalX = 0;
  private goalZ = 0;
  private goalY = 0;
  private hasGoal = false;
  private repathAt = 0;
  private goalUntil = 0;
  private strafe = 0;
  private strafeUntil = 0;
  private advance = 0;
  private stuckAt = 0;
  private stuckX = 0;
  private stuckZ = 0;
  private stuckCount = 0;
  private jumpNext = false;
  private lookOffset = 0;
  private lookUntil = 0;
  private pullAt = Infinity;
  private readonly thinkPhase: number;
  private readonly path: number[] = [];
  private readonly hit = makeRayHit();

  constructor(p: Player, game: Game, skill: Skill, seed: number) {
    this.p = p;
    this.game = game;
    this.sk = SKILLS[skill];
    this.rng = makeRng(seed);
    this.thinkPhase = seed % 4;
  }

  setSkill(skill: Skill): void {
    this.sk = SKILLS[skill];
  }

  schedulePull(now: number, end: number): void {
    const span = Math.max(30, end - now - 50);
    this.pullAt = now + 35 + Math.floor(this.rng() * span);
  }

  wantsPull(tick: number): boolean {
    return tick >= this.pullAt;
  }

  onSpawn(yaw: number): void {
    this.yaw = yaw;
    this.pitch = 0;
    this.target = null;
    this.hasGoal = false;
    this.waypoints = [];
    this.huntUntil = 0;
    this.burstLeft = 0;
    this.stuckCount = 0;
    this.stuckAt = this.game.tick + 30;
    this.stuckX = this.p.state.x;
    this.stuckZ = this.p.state.z;
  }

  onHurt(attacker: Player): void {
    const tick = this.game.tick;
    this.hurtTick = tick;
    if (!this.target || tick - this.lastSeenTick > 6) {
      // не видим, кто стреляет, — поворачиваемся на звук и идём проверить
      this.lastSeen.x = attacker.state.x;
      this.lastSeen.y = attacker.state.y;
      this.lastSeen.z = attacker.state.z;
      this.huntUntil = tick + 5 * TICK_RATE;
      this.hasGoal = false;
    }
  }

  update(): Input {
    const g = this.game;
    const tick = g.tick;
    const p = this.p;
    const s = p.state;
    const inp = this.input;
    inp.seq++;
    inp.viewTick = tick;
    let buttons = 0;

    if (!p.alive) {
      inp.buttons = 0;
      inp.yaw = Math.fround(this.yaw);
      inp.pitch = Math.fround(this.pitch);
      return inp;
    }

    if ((tick + this.thinkPhase) % 4 === 0) this.perceive();

    const seeing = this.target !== null && this.target.alive && tick - this.lastSeenTick <= 8;
    if (seeing) {
      buttons |= this.fight(this.target!);
    } else {
      if (this.target && (!this.target.alive || tick - this.lastSeenTick > 8)) {
        if (this.target.alive) this.huntUntil = tick + 4 * TICK_RATE;
        this.target = null;
        this.hasGoal = false;
      }
      buttons |= this.roam();
      if (s.ammo < MAG_SIZE * 0.4 && s.reloadT === 0 && tick - this.hurtTick > 60) buttons |= BTN_RELOAD;
    }

    // застряли — прыгаем, потом меняем цель
    if (tick >= this.stuckAt) {
      const moved = Math.hypot(s.x - this.stuckX, s.z - this.stuckZ);
      if ((buttons & (BTN_FORWARD | BTN_BACK | BTN_LEFT | BTN_RIGHT)) && moved < 0.4) {
        this.stuckCount++;
        this.jumpNext = true;
        if (this.stuckCount >= 3) {
          this.hasGoal = false;
          this.huntUntil = 0;
          this.stuckCount = 0;
        }
      } else this.stuckCount = 0;
      this.stuckX = s.x;
      this.stuckZ = s.z;
      this.stuckAt = tick + 30;
    }
    if (this.jumpNext && s.grounded) {
      buttons |= BTN_JUMP;
      this.jumpNext = false;
    }

    inp.buttons = buttons;
    inp.yaw = Math.fround(wrapAngle(this.yaw));
    inp.pitch = Math.fround(this.pitch);
    return inp;
  }

  // ------------------------------------------------------------ восприятие

  private perceive(): void {
    const g = this.game;
    const s = this.p.state;
    const ex = s.x;
    const ey = s.y + EYE_HEIGHT;
    const ez = s.z;
    let best: Player | null = null;
    let bestScore = Infinity;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    for (const q of g.players.values()) {
      if (q.team === this.p.team || !q.alive) continue;
      const dx = q.state.x - ex;
      const dz = q.state.z - ez;
      const dist = Math.hypot(dx, dz);
      if (dist > VIEW_RANGE) continue;
      const cos = dist > 0.01 ? (dx * fx + dz * fz) / dist : 1;
      const inFov = cos > Math.cos(this.sk.fov / 2);
      const heard = q.firingUntil > g.tick && dist < 38;
      const known = q === this.target;
      if (!inFov && !known && dist > 5 && !heard) continue;
      if (!this.visible(ex, ey, ez, q)) {
        if (heard && !this.target && g.tick > this.huntUntil - 3 * TICK_RATE) {
          this.lastSeen.x = q.state.x;
          this.lastSeen.y = q.state.y;
          this.lastSeen.z = q.state.z;
          this.huntUntil = g.tick + 4 * TICK_RATE;
          this.hasGoal = false;
        }
        continue;
      }
      const score = dist + (1 - cos) * 12 - (known ? 10 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = q;
      }
    }
    if (best) {
      if (best !== this.target) {
        this.target = best;
        const [a, b] = this.sk.reaction;
        const dist = Math.hypot(best.state.x - ex, best.state.z - ez);
        this.reactUntil = g.tick + Math.round(a + (b - a) * this.rng() + (dist > 30 ? 6 : 0));
        this.trackSince = g.tick;
        const n = this.sk.noise * 2.6;
        this.noiseYaw = (this.rng() - 0.5) * 2 * n;
        this.noisePitch = (this.rng() - 0.5) * n;
        this.aimHead = this.rng() < this.sk.headChance;
        this.burstLeft = 0;
      }
      this.lastSeenTick = g.tick;
      this.lastSeen.x = best.state.x;
      this.lastSeen.y = best.state.y;
      this.lastSeen.z = best.state.z;
    }
  }

  private visible(ex: number, ey: number, ez: number, q: Player): boolean {
    const w = this.game.world;
    for (const h of [0.9, 1.35]) {
      const tx = q.state.x - ex;
      const ty = q.state.y + h - ey;
      const tz = q.state.z - ez;
      const len = Math.hypot(tx, ty, tz);
      if (len < 0.01) return true;
      if (!w.raycast(ex, ey, ez, tx / len, ty / len, tz / len, len, this.hit, true)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ бой

  private fight(q: Player): number {
    const g = this.game;
    const s = this.p.state;
    const sk = this.sk;
    const ex = s.x;
    const ey = s.y + EYE_HEIGHT;
    const ez = s.z;
    const aimY = q.state.y + (this.aimHead ? 1.3 : 0.9);
    const dx = q.state.x - ex;
    const dy = aimY - ey;
    const dz = q.state.z - ez;
    const hd = Math.hypot(dx, dz);
    const dist = Math.hypot(hd, dy);
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, hd);

    // дрожание прицела: процесс Орнштейна–Уленбека, с доводкой по мере слежения
    const tracked = Math.min(1, (g.tick - this.trackSince) / (1.3 * TICK_RATE));
    const moving = Math.hypot(q.state.vx, q.state.vz) / 8;
    const sigma = sk.noise * (1 - sk.settle * tracked) * (0.7 + 0.6 * moving);
    const theta = 3;
    const k = Math.sqrt(2 * theta * DT) * sigma;
    this.noiseYaw += -this.noiseYaw * theta * DT + k * this.gauss();
    this.noisePitch += -this.noisePitch * theta * DT + k * 0.6 * this.gauss();

    const comp = sk.recoilComp;
    const aimYaw = wantYaw + this.noiseYaw - s.recoilY * comp;
    const aimPitch = wantPitch + this.noisePitch - s.recoilP * comp;
    this.turnTo(aimYaw, aimPitch);

    let buttons = 0;
    // стрельба очередями, когда прицел на цели
    const shotYaw = this.yaw + s.recoilY;
    const shotPitch = this.pitch + s.recoilP;
    const err = Math.hypot(wrapAngle(shotYaw - wantYaw) * Math.cos(wantPitch), shotPitch - wantPitch);
    const radius = Math.atan2(0.5, Math.max(dist, 0.5)) * sk.tolerance;
    if (s.shots !== this.lastShots) {
      this.lastShots = s.shots;
      if (this.burstLeft > 0) {
        this.burstLeft--;
        if (this.burstLeft === 0) {
          const [a, b] = sk.pause;
          this.pauseUntil = g.tick + Math.round(a + (b - a) * this.rng() + (dist > 25 ? 8 : 0));
        }
      }
    }
    if (g.phase === PHASE_PLAY && g.tick >= this.reactUntil && g.tick >= this.pauseUntil) {
      if (this.burstLeft === 0) {
        const [a, b] = sk.burst;
        this.burstLeft = Math.round(a + (b - a) * this.rng() - (dist > 30 ? 2 : 0));
        if (this.burstLeft < 2) this.burstLeft = 2;
      }
      if (err < radius) buttons |= BTN_FIRE;
    }
    if (dist > sk.adsRange && g.tick >= this.reactUntil) buttons |= BTN_ADS;

    // движение: стрейф, держим дистанцию
    if (g.tick >= this.strafeUntil) {
      const r = this.rng();
      this.strafe = r < 0.43 ? -1 : r < 0.86 ? 1 : 0;
      const [a, b] = sk.strafe;
      this.strafeUntil = g.tick + Math.round(a + (b - a) * this.rng());
      const r2 = this.rng();
      this.advance = dist > 26 ? 1 : dist < 7 ? -1 : r2 < 0.2 ? 1 : r2 < 0.35 ? -1 : 0;
    }
    // направление движения в мире
    const fx = dx / (hd || 1);
    const fz = dz / (hd || 1);
    let mx = fx * this.advance + -fz * this.strafe;
    let mz = fz * this.advance + fx * this.strafe;
    if (!this.safeAhead(mx, mz)) {
      this.strafe = -this.strafe;
      mx = fx * this.advance + -fz * this.strafe;
      mz = fz * this.advance + fx * this.strafe;
      if (!this.safeAhead(mx, mz)) {
        this.advance = hd > 10 ? 1 : 0;
        this.strafe = 0;
        mx = fx * this.advance;
        mz = fz * this.advance;
        if (!this.safeAhead(mx, mz)) {
          mx = 0;
          mz = 0;
        }
      }
    }
    buttons |= this.keysFor(mx, mz);
    if (s.grounded && this.rng() < sk.jumpChance * DT) buttons |= BTN_JUMP;
    if (g.tick - this.hurtTick < 8 && s.dashCd === 0 && (mx !== 0 || mz !== 0) && this.rng() < sk.dashChance * 0.15) buttons |= BTN_DASH;
    return buttons;
  }

  private gauss(): number {
    const u = Math.max(1e-9, this.rng());
    const v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Плавный поворот «рукой»: пропорционально ошибке, но не быстрее предела. */
  private turnTo(yaw: number, pitch: number): void {
    const sk = this.sk;
    const max = sk.maxTurn * DT;
    let dy = wrapAngle(yaw - this.yaw) * Math.min(1, sk.gain * DT);
    if (dy > max) dy = max;
    else if (dy < -max) dy = -max;
    this.yaw = wrapAngle(this.yaw + dy);
    let dp = (pitch - this.pitch) * Math.min(1, sk.gain * DT);
    if (dp > max) dp = max;
    else if (dp < -max) dp = -max;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dp));
  }

  /** Клавиши, которые дают движение в мировом направлении (mx, mz) при текущем взгляде. */
  private keysFor(mx: number, mz: number): number {
    if (mx === 0 && mz === 0) return 0;
    const want = Math.atan2(-mx, -mz);
    const d = wrapAngle(want - this.yaw);
    const a = Math.abs(d);
    let b = 0;
    if (a < 1.18) b |= BTN_FORWARD;
    else if (a > Math.PI - 1.18) b |= BTN_BACK;
    if (d > 0.39 && d < Math.PI - 0.39) b |= BTN_LEFT;
    else if (d < -0.39 && d > -Math.PI + 0.39) b |= BTN_RIGHT;
    return b;
  }

  /** Не свалимся ли в воду / не упрёмся ли в стену, если пойдём так ~0.35 с. */
  private safeAhead(mx: number, mz: number): boolean {
    if (mx === 0 && mz === 0) return true;
    const nav = this.game.nav;
    const s = this.p.state;
    const len = Math.hypot(mx, mz);
    const x = s.x + (mx / len) * 1.6;
    const z = s.z + (mz / len) * 1.6;
    const c = nav.cellAt(x, z);
    if (c < 0) return false;
    if (!nav.walk[c]) return false;
    if (nav.danger[c]) {
      const here = nav.cellAt(s.x, s.z);
      if (here < 0 || !nav.danger[here]) return false;
    }
    if (nav.tramp[c]) return false;
    if (nav.height[c] < s.y - 2.8) return false;
    return true;
  }

  // ------------------------------------------------------------ перемещение по карте

  private roam(): number {
    const g = this.game;
    const s = this.p.state;
    const tick = g.tick;
    if (!this.hasGoal || tick >= this.goalUntil) this.pickGoal();
    if (tick >= this.repathAt || this.waypoints.length === 0) this.repath();

    // следующая точка маршрута
    let wp = this.waypoints[this.wi];
    while (wp) {
      const d = Math.hypot(wp.x - s.x, wp.z - s.z);
      const reached = wp.tramp ? d < 1.0 : d < 0.55 || (d < 1.2 && s.grounded && Math.abs(wp.h - s.y) < 0.3 && this.wi < this.waypoints.length - 1 && this.passed(wp));
      if (!reached) break;
      this.wi++;
      wp = this.waypoints[this.wi];
    }
    if (!wp) {
      this.hasGoal = false;
      this.lookAround(tick);
      return 0;
    }
    const dx = wp.x - s.x;
    const dz = wp.z - s.z;
    const d = Math.hypot(dx, dz);
    // смотрим по ходу движения, иногда оглядываемся
    const moveYaw = Math.atan2(-dx, -dz);
    if (tick >= this.lookUntil) {
      this.lookOffset = this.rng() < 0.3 ? (this.rng() - 0.5) * 1.6 : 0;
      this.lookUntil = tick + 40 + Math.floor(this.rng() * 80);
    }
    let lookYaw = moveYaw + this.lookOffset * 0.6;
    if (tick < this.huntUntil) {
      // идём проверить, откуда стреляли, — смотрим туда, если это примерно по пути
      const huntYaw = Math.atan2(-(this.lastSeen.x - s.x), -(this.lastSeen.z - s.z));
      if (Math.abs(wrapAngle(huntYaw - moveYaw)) < 1.6) lookYaw = huntYaw;
    }
    this.turnTo(lookYaw, -0.04);
    let buttons = this.keysFor(dx, dz);
    // ступень выше шага — прыгаем
    if (s.grounded && wp.h > s.y + STEP_HEIGHT && d < 1.6) buttons |= BTN_JUMP;
    // в полёте с батута рулим к точке приземления
    if (!s.grounded && s.y > wp.h + 0.2 && d < 0.8) buttons &= ~(BTN_FORWARD | BTN_BACK | BTN_LEFT | BTN_RIGHT);
    return buttons;
  }

  /** Прошли ли точку (она уже позади по направлению к следующей). */
  private passed(wp: Waypoint): boolean {
    const next = this.waypoints[this.wi + 1];
    if (!next) return false;
    const s = this.p.state;
    const ax = next.x - wp.x;
    const az = next.z - wp.z;
    return (s.x - wp.x) * ax + (s.z - wp.z) * az > 0;
  }

  private lookAround(tick: number): void {
    if (tick >= this.lookUntil) {
      this.lookOffset = (this.rng() - 0.5) * 2.4;
      this.lookUntil = tick + 30 + Math.floor(this.rng() * 50);
    }
    this.turnTo(this.yaw + this.lookOffset * 0.05, -0.05);
  }

  private pickGoal(): void {
    const g = this.game;
    const p = this.p;
    const tick = g.tick;
    this.hasGoal = true;
    this.goalUntil = tick + 12 * TICK_RATE;
    if (tick < this.huntUntil) {
      this.setGoal(this.lastSeen.x, this.lastSeen.y, this.lastSeen.z);
      this.goalUntil = this.huntUntil;
      return;
    }
    // ранен — к варенью
    if (p.hp < p.maxHp * 0.55) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < g.jars.length; i++) {
        const j = g.jars[i];
        if (!j.available) continue;
        const d = Math.hypot(j.x - p.state.x, j.z - p.state.z) + Math.abs(j.y - p.state.y) * 4;
        if (d < bestD && d < 40) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) {
        const j = g.jars[best];
        this.setGoal(j.x, j.y, j.z);
        return;
      }
    }
    const nav = g.nav;
    const enemyZ = p.team === 0 ? 18 : -18;
    let bestCell = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < 10; i++) {
      const c = nav.walkable[Math.floor(this.rng() * nav.walkable.length)];
      const z = nav.cz(c);
      const score = -Math.abs(z - enemyZ * 0.45) * 0.35 + this.rng() * 12 + nav.height[c] * 0.8 - (nav.danger[c] ? 6 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestCell = c;
      }
    }
    if (bestCell >= 0) this.setGoal(nav.cx(bestCell), nav.height[bestCell], nav.cz(bestCell));
  }

  private setGoal(x: number, y: number, z: number): void {
    this.goalX = x;
    this.goalY = y;
    this.goalZ = z;
    this.repathAt = 0;
  }

  private repath(): void {
    const g = this.game;
    const nav = g.nav;
    const s = this.p.state;
    this.repathAt = g.tick + 90 + Math.floor(this.rng() * 30);
    const start = nav.nearestWalkable(s.x, s.y, s.z, 3);
    const goal = nav.nearestWalkable(this.goalX, this.goalY, this.goalZ, 4);
    this.waypoints = [];
    this.wi = 0;
    if (start < 0 || goal < 0) {
      this.hasGoal = false;
      return;
    }
    nav.findPath(start, goal, this.path);
    if (this.path.length < 2) {
      this.hasGoal = false;
      return;
    }
    // «натягиваем нитку»: пропускаем промежуточные клетки, если можно пройти по прямой
    const path = this.path;
    let i = 0;
    while (i < path.length - 1) {
      let j = Math.min(path.length - 1, i + 28);
      while (j > i + 1 && (nav.tramp[path[j]] || nav.tramp[path[i]] || !nav.straightWalkable(path[i], path[j]))) j--;
      const c = path[j];
      this.waypoints.push({ x: nav.cx(c), z: nav.cz(c), h: nav.height[c], tramp: nav.tramp[c] === 1 });
      i = j;
    }
  }
}
