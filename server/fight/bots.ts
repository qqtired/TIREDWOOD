// Боты «Fight Club»: подходят, кружат, бьют сериями, иногда тяжёлым или захватом (по блоку — чаще), ставят блок
// на замах тяжёлого или уклоняются вбок, без выносливости — пятятся в блоке, из темноты идут к свету, пойманные —
// вырываются. Ввод — те же кнопки, что у людей; шаг — тот же stepFighter.
import { FA_HEAVY, FA_HOLD } from '../../shared/fight.ts';
import { BTN_BLOCK, striking } from '../../shared/fightsim.ts';
import { clamp, wrapAngle } from '../../shared/math.ts';
import { BTN_ADS, BTN_BACK, BTN_DASH, BTN_FIRE, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RIGHT, BTN_USE, type Input } from '../../shared/sim.ts';
import type { FcPlayer, FightGame } from './game.ts';

/** Ударные кнопки: одно нажатие — один тик, иначе боец не увидит нового нажатия */
const TAPS = BTN_FIRE | BTN_ADS | BTN_USE | BTN_DASH | BTN_JUMP;

export class FightBot {
  /** 0.55…0.95: реакция, поворот, частота ударов */
  readonly skill: number;
  private readonly rng: () => number;
  private target = 0;
  private yaw = 0;
  private yawSet = false;
  private strafe = 1;
  private strafeUntil = 0;
  private nextSwing = 0;
  private threatAt = -1;
  /** 0 — нет, 1 — блок, 2 — уклон */
  private defend = 0;
  private defendUntil = 0;
  private throwAt = 0;
  private last = 0;

  constructor(rng: () => number, skill: number) {
    this.rng = rng;
    this.skill = skill;
  }

  think(me: FcPlayer, g: FightGame, tick: number, out: Input): void {
    const f = me.f;
    out.viewTick = tick;
    out.pitch = 0;
    if (!this.yawSet) {
      this.yaw = f.yaw;
      this.yawSet = true;
    }
    out.yaw = this.yaw;
    if (f.ko) {
      out.buttons = this.last = 0;
      return;
    }
    if (f.held) {
      // вырывается: жмёт через тик
      out.buttons = !(this.last & BTN_FIRE) && this.rng() < 0.45 + 0.4 * this.skill ? BTN_FIRE : 0;
      this.last = out.buttons;
      return;
    }
    const t = this.pick(me, g);
    const s = f.s;
    let tx = 0;
    let tz = 0;
    let dist = 99;
    if (t) {
      tx = t.f.s.x - s.x;
      tz = t.f.s.z - s.z;
      dist = Math.sqrt(tx * tx + tz * tz);
    }
    const want = t ? Math.atan2(-tx, -tz) : Math.atan2(s.x, s.z);
    const turn = 0.09 + 0.12 * this.skill;
    this.yaw = wrapAngle(this.yaw + clamp(wrapAngle(want - this.yaw), -turn, turn));
    out.yaw = this.yaw;
    const facing = Math.abs(wrapAngle(want - this.yaw)) < 0.45;

    // куда идти (в мировых осях)
    let mx = 0;
    let mz = 0;
    const r = Math.sqrt(s.x * s.x + s.z * s.z);
    const dark = g.zone.r < g.ringR - 0.01 && r > g.zone.r - 0.8;
    if (dark) {
      mx = -s.x;
      mz = -s.z;
    } else if (t) {
      if (dist > 1.35) {
        mx += tx;
        mz += tz;
      } else if (dist < 0.95) {
        mx -= tx;
        mz -= tz;
      }
      if (dist < 3.2) {
        if (tick >= this.strafeUntil) {
          this.strafe = this.rng() < 0.5 ? -1 : 1;
          this.strafeUntil = tick + 40 + Math.floor(this.rng() * 90);
        }
        mx += -tz * this.strafe * 0.7;
        mz += tx * this.strafe * 0.7;
      }
    }
    let b = moveButtons(this.yaw, mx, mz);

    // угроза: соперник рядом замахнулся тяжёлым (или изредка — любым ударом)
    const threat = !!t && dist < 2.4 && striking(t.f) && (t.f.act === FA_HEAVY || this.rng() < 0.03);
    if (threat) {
      if (this.threatAt < 0) this.threatAt = tick;
      const react = 15 - Math.round(9 * this.skill);
      if (tick - this.threatAt >= react && this.defend === 0) {
        this.defend = this.rng() < 0.25 + 0.25 * this.skill ? 2 : 1;
        this.defendUntil = tick + 26;
      }
    } else {
      this.threatAt = -1;
    }
    if (this.defend !== 0 && tick >= this.defendUntil) this.defend = 0;
    const tired = f.st < 260;

    if (this.defend === 2) {
      b |= BTN_DASH | (this.strafe > 0 ? BTN_RIGHT : BTN_LEFT);
      this.defend = 0;
    } else if (this.defend === 1 || (tired && !!t && dist < 2.3)) {
      b |= BTN_BLOCK;
      if (tired) b = (b & ~BTN_FORWARD) | BTN_BACK;
    } else if (f.act === FA_HOLD) {
      // держит: подержать и швырнуть
      if (this.throwAt === 0) this.throwAt = tick + 12 + Math.floor(this.rng() * 30);
      if (tick >= this.throwAt) {
        b |= BTN_USE;
        this.throwAt = 0;
      }
    } else if (t && dist < 1.5 && facing && !dark && tick >= this.nextSwing) {
      const k = this.rng();
      if (t.f.block && k < 0.45) b |= BTN_ADS;
      else if (t.f.block && k < 0.75) b |= BTN_USE;
      else if (k < 0.1) b |= BTN_ADS;
      else if (k < 0.16) b |= BTN_USE;
      else b |= BTN_FIRE;
      this.nextSwing = tick + 7 + Math.floor(this.rng() * (16 - 9 * this.skill));
    }
    if (this.rng() < 0.002) b |= BTN_JUMP;
    b &= ~(this.last & TAPS);
    this.last = b;
    out.buttons = b;
  }

  /** Цель: ближайший соперник на ногах (за прежней держится, пока она не сильно дальше других). */
  private pick(me: FcPlayer, g: FightGame): FcPlayer | null {
    let best: FcPlayer | null = null;
    let bestD = Infinity;
    let cur: FcPlayer | null = null;
    let curD = Infinity;
    for (const p of g.players.values()) {
      if (p === me || !p.fighter || p.f.ko || g.inCrowd(p) || !g.canHurt(me, p)) continue;
      const d = (p.f.s.x - me.f.s.x) ** 2 + (p.f.s.z - me.f.s.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
      if (p.id === this.target) {
        cur = p;
        curD = d;
      }
    }
    const t = cur && curD < bestD + 4 ? cur : best;
    this.target = t ? t.id : 0;
    return t;
  }
}

/** Кнопки ходьбы, чтобы идти в мировом направлении (mx, mz), глядя по курсу yaw. */
function moveButtons(yaw: number, mx: number, mz: number): number {
  const l = Math.sqrt(mx * mx + mz * mz);
  if (l < 0.05) return 0;
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const fwd = (-s * mx - c * mz) / l;
  const right = (c * mx - s * mz) / l;
  let b = 0;
  if (fwd > 0.38) b |= BTN_FORWARD;
  else if (fwd < -0.38) b |= BTN_BACK;
  if (right > 0.38) b |= BTN_RIGHT;
  else if (right < -0.38) b |= BTN_LEFT;
  return b;
}
