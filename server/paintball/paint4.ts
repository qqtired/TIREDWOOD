// PAINT4: попадания наборов, толчок Лейки, полёт стрел и ведёрок. Числа и общий шаг — shared/paint4.ts.
import { tpsShotDir } from '../../shared/aim.ts';
import { DROWN_Y, EYE_HEIGHT, HEADSHOT_Y, HITBOX_CY, HITBOX_RX, HITBOX_RY, PHASE_PLAY } from '../../shared/constants.ts';
import { makeGrenade, type Grenade } from '../../shared/fortgren.ts';
import {
  ARROW_LIFE_TICKS, BUCKET_CD_TICKS, BUCKET_LIFE_TICKS, BUCKET_R, CAN_PUSH_MIN, KITS, KIT_BOW, KIT_CAN,
  applyShove, arrowDamage, arrowSpeed, arrowStep, bucketDamage, bucketLaunch, bucketStep, canPushSpeed, fanDir, kitDamage,
  type Arrow,
} from '../../shared/paint4.ts';
import { BTN_ADS, BTN_SHOULDER, type Input } from '../../shared/sim.ts';
import { makeRayHit, rayEllipsoid } from '../../shared/world.ts';
import type { Game, Player } from './game.ts';

interface FlyingArrow {
  a: Arrow;
  by: Player;
  shot: number;
  charge: number;
}

interface FlyingBucket {
  g: Grenade;
  by: Player;
  t: number;
}

interface FanHit {
  amount: number;
  hits: number;
  head: boolean;
  x: number;
  y: number;
  z: number;
}

export class Paint4 {
  private readonly game: Game;
  private readonly arrows: FlyingArrow[] = [];
  private readonly buckets: FlyingBucket[] = [];
  private readonly hit = makeRayHit();
  private readonly dir = { dirX: 0, dirY: 0, dirZ: 0 };

  constructor(game: Game) {
    this.game = game;
  }

  reset(): void {
    this.arrows.length = 0;
    this.buckets.length = 0;
    for (const p of this.game.players.values()) p.bucketAt = 0;
  }

  fire(p: Player, inp: Input): void {
    const g = this.game;
    const s = p.state;
    const n = g.collectTargets(p, inp);
    const dir = this.dir;
    dir.dirX = p.ev.dirX;
    dir.dirY = p.ev.dirY;
    dir.dirZ = p.ev.dirZ;
    if (!p.isBot) {
      const side = (inp.buttons & BTN_SHOULDER) !== 0 ? -1 : 1;
      tpsShotDir(s, p.ev.aimYaw, p.ev.aimPitch, p.ev.spread, p.seed, s.shots, side, (inp.buttons & BTN_ADS) !== 0,
        g.world, g.targets, n, dir);
    }
    const ox = s.x, oy = s.y + EYE_HEIGHT, oz = s.z;
    const cx = dir.dirX, cy = dir.dirY, cz = dir.dirZ;
    if (p.kit === KIT_BOW) {
      const charge = p.p4step.charge;
      const speed = arrowSpeed(charge);
      const a: Arrow = { x: ox, y: oy, z: oz, vx: cx * speed, vy: cy * speed, vz: cz * speed, t: 0 };
      this.arrows.push({ a, by: p, shot: s.shots, charge });
      g.event(['arrow', p.id, s.shots, round2(ox), round2(oy), round2(oz), round2(a.vx), round2(a.vy), round2(a.vz), round2(charge)]);
      return;
    }

    const kit = KITS[p.kit];
    const can = p.kit === KIT_CAN;
    const ends: number[] = [];
    const hits = new Map<Player, FanHit>();
    for (let i = 0; i < kit.pellets; i++) {
      if (can) fanDir(cx, cy, cz, i, kit.pellets, kit.fan, p.seed, s.shots, dir);
      const dx = dir.dirX, dy = dir.dirY, dz = dir.dirZ;
      let best = kit.range;
      let kind = 2;
      let nx = 0, ny = 0, nz = 0;
      if (g.world.raycast(ox, oy, oz, dx, dy, dz, best, this.hit, true)) {
        best = this.hit.t;
        kind = 0;
        nx = this.hit.nx;
        ny = this.hit.ny;
        nz = this.hit.nz;
      }
      let target: Player | null = null;
      let targetY = 0;
      for (let j = 0; j < n; j++) {
        const tg = g.targets;
        const t = rayEllipsoid(ox, oy, oz, dx, dy, dz, tg[j * 3], tg[j * 3 + 1] + HITBOX_CY, tg[j * 3 + 2], HITBOX_RX, HITBOX_RY);
        if (t >= 0 && t < best) {
          best = t;
          target = g.targetPlayers[j];
          targetY = tg[j * 3 + 1];
          kind = 1;
        }
      }
      const x = ox + dx * best, y = oy + dy * best, z = oz + dz * best;
      if (can) ends.push(round2(x), round2(y), round2(z), kind);
      else g.event(['shot', p.id, round2(ox), round2(oy), round2(oz), round2(x), round2(y), round2(z), kind, round2(nx), round2(ny), round2(nz)]);
      if (!target) continue;
      const head = y - targetY >= HEADSHOT_Y;
      const amount = kitDamage(p.kit, best, head) * p.dmgMult;
      if (!can) {
        g.damage(target, p, amount, head, x, y, z, 'squirt');
        continue;
      }
      const h = hits.get(target);
      if (h) {
        h.amount += amount;
        h.hits++;
        h.head ||= head;
      } else hits.set(target, { amount, hits: 1, head, x, y, z });
    }
    if (!can) return;
    for (const [v, h] of hits) {
      g.damage(v, p, h.amount, h.head, h.x, h.y, h.z, 'can');
      if (!v.alive || g.tick < v.protectUntil || h.hits < CAN_PUSH_MIN) continue;
      const dx = v.state.x - ox, dz = v.state.z - oz;
      const speed = canPushSpeed(h.hits);
      applyShove(v.state, dx, dz, speed);
      g.event(['shove', v.id, round2(dx), round2(dz), round2(speed)]);
    }
    g.event(['fan', p.id, round2(ox), round2(oy), round2(oz), ends]);
  }

  throwBucket(p: Player, inp: Input): void {
    const game = this.game;
    if (!p.alive || game.phase !== PHASE_PLAY || game.tick < p.bucketAt) return;
    p.bucketAt = game.tick + BUCKET_CD_TICKS;
    const g = makeGrenade();
    bucketLaunch(p.state.x, p.state.y, p.state.z, inp.yaw, inp.pitch, game.world, this.hit, g);
    this.buckets.push({ g, by: p, t: 0 });
    game.event(['bucket', p.id, round2(g.x), round2(g.y), round2(g.z), round2(g.vx), round2(g.vy), round2(g.vz)]);
  }

  tick(): void {
    const game = this.game;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const f = this.arrows[i];
      if (game.players.get(f.by.id) !== f.by) {
        this.arrows.splice(i, 1);
        continue;
      }
      const a = f.a;
      const ox = a.x, oy = a.y, oz = a.z;
      const wall = arrowStep(a, game.world, this.hit);
      const contact = this.segmentTarget(f.by, ox, oy, oz, a.x, a.y, a.z);
      let kind: number;
      let nx = 0, ny = 0, nz = 0;
      if (contact) {
        a.x = contact.x;
        a.y = contact.y;
        a.z = contact.z;
        const head = a.y - contact.v.state.y >= HEADSHOT_Y;
        game.damage(contact.v, f.by, arrowDamage(f.charge, head) * f.by.dmgMult, head, a.x, a.y, a.z, 'bow');
        kind = 1;
      } else if (wall) {
        kind = 0;
        nx = this.hit.nx;
        ny = this.hit.ny;
        nz = this.hit.nz;
      } else if (a.t > ARROW_LIFE_TICKS || a.y < DROWN_Y - 2) kind = 2;
      else continue;
      game.event(['arrowEnd', f.by.id, f.shot, round2(a.x), round2(a.y), round2(a.z), kind, round2(nx), round2(ny), round2(nz)]);
      this.arrows.splice(i, 1);
    }
    for (let i = this.buckets.length - 1; i >= 0; i--) {
      const f = this.buckets[i];
      if (game.players.get(f.by.id) !== f.by) {
        this.buckets.splice(i, 1);
        continue;
      }
      const g = f.g;
      const ox = g.x, oy = g.y, oz = g.z;
      const wall = bucketStep(g, game.world, this.hit);
      f.t++;
      if (wall || this.segmentTarget(f.by, ox, oy, oz, g.x, g.y, g.z) || f.t > BUCKET_LIFE_TICKS || g.y < DROWN_Y) {
        this.splash(f);
        this.buckets.splice(i, 1);
      }
    }
  }

  /** Ближайший живой противник на отрезке полёта, без отката позиций. */
  private segmentTarget(by: Player, ox: number, oy: number, oz: number, x: number, y: number, z: number): { v: Player; x: number; y: number; z: number } | null {
    const len = Math.hypot(x - ox, y - oy, z - oz);
    if (len < 1e-7) return null;
    const dx = (x - ox) / len, dy = (y - oy) / len, dz = (z - oz) / len;
    let best = len;
    let target: Player | null = null;
    for (const v of this.game.players.values()) {
      if (!v.alive || v === by || v.team === by.team) continue;
      const s = v.state;
      const t = rayEllipsoid(ox, oy, oz, dx, dy, dz, s.x, s.y + HITBOX_CY, s.z, HITBOX_RX, HITBOX_RY);
      if (t >= 0 && t <= best) {
        best = t;
        target = v;
      }
    }
    return target ? { v: target, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best } : null;
  }

  private splash(f: FlyingBucket): void {
    const game = this.game;
    const g = f.g;
    game.event(['bsplash', f.by.id, round2(g.x), round2(g.y), round2(g.z)]);
    for (const v of game.players.values()) {
      if (!v.alive || v === f.by || v.team === f.by.team) continue;
      const cx = v.state.x, cy = v.state.y + HITBOX_CY, cz = v.state.z;
      const d = Math.hypot(cx - g.x, cy - g.y, cz - g.z);
      if (d >= BUCKET_R) continue;
      const dx = cx - g.x, dy = cy - (g.y + 0.3), dz = cz - g.z;
      const len = Math.hypot(dx, dy, dz);
      if (len > 1e-7 && game.world.raycast(g.x, g.y + 0.3, g.z, dx / len, dy / len, dz / len, len, this.hit, true)) continue;
      game.damage(v, f.by, bucketDamage(d) * f.by.dmgMult, false, cx, cy, cz, 'bucket');
    }
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
