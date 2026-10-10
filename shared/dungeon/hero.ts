// «Подземелье»: Фонарщик — бег, рывок (с перелётом провалов до 5 м), удар фонарём Q (тап и заряд).
import { areaMul, dmgMul, fx, hasBuff, hurtMob, KB_DECAY, passiveLv, queryCircle, Q } from './core.ts';
import { D, passiveDef } from './data.ts';
import { blocked, collide, inPit, T_JAM, T_PIT, T_SOLID, T_WATER, terrainAt } from './map.ts';
import { hitProps } from './props.ts';
import type { DgSim } from './types.ts';
import { DT, ticks, wrapD, wrapP } from './util.ts';

export const HERO_R = 0.45;

export function heroSpeed(sim: DgSim): number {
  const sp = passiveLv(sim, 'speed') * passiveDef('speed').per;
  return D.hero.speed * (1 + sp) * (hasBuff(sim, 'wind') ? 1.3 : 1);
}

export function dashCdTicks(sim: DgSim): number {
  if (hasBuff(sim, 'wind')) return ticks(1);
  const per = passiveDef('speed').dashCd ?? 0.25;
  return ticks(Math.max(0.5, D.actives.dash.cooldown - passiveLv(sim, 'speed') * per));
}

/** Замедление героя сейчас: действует самое сильное (варенье, мелководье, лужи, споры, заряд Q) */
function slowNow(sim: DgSim): number {
  const h = sim.hero;
  let s = 0;
  const ter = terrainAt(h.x, h.z);
  if (ter & T_JAM) s = Math.max(s, D.terrain?.jam?.heroSlow ?? 0.35);
  if (ter & T_WATER) s = Math.max(s, D.terrain?.water?.slowAll ?? 0.25);
  for (const p of sim.puddles) {
    if (p.t1 <= sim.t || p.slow <= s) continue;
    const dx = wrapD(p.x - h.x);
    const dz = wrapD(p.z - h.z);
    if (dx * dx + dz * dz < p.r * p.r) s = p.slow;
  }
  if (h.qHold > 0) s = Math.max(s, 1 - D.actives.strike.chargeMoveMul);
  return 1 - s;
}

/** Длина рывка по направлению: провал до pitJump м перелетаем, шире — встаём у края */
function dashLength(x: number, z: number, dx: number, dz: number): number {
  const dist = D.actives.dash.distance;
  const jump = D.actives.dash.pitJump ?? 5;
  const stepL = 0.25;
  let a = -1;
  for (let s = stepL; s <= dist + 1e-9; s += stepL) {
    if (inPit(wrapP(x + dx * s), wrapP(z + dz * s))) {
      a = s;
      break;
    }
  }
  if (a < 0) return dist;
  // ищем другой край
  for (let s = a; s <= a + jump + 1e-9; s += stepL) {
    if (!inPit(wrapP(x + dx * s), wrapP(z + dz * s))) {
      // пролетели: приземляемся за краем
      const end = s + 0.6;
      return end > dist ? end : dist;
    }
  }
  return Math.max(0, a - 0.6);
}

/** Шаг героя: ввод, бег, рывок, заряд и удар Q */
export function stepHero(sim: DgSim): void {
  const h = sim.hero;
  const inp = sim.in;
  if (h.dead) return;
  // прыжок с батута: летим по прямой, ничего не делаем
  if (h.jumpT1 > sim.t) {
    const k = (sim.t + 1 - h.jumpT0) / (h.jumpT1 - h.jumpT0);
    const nx = h.jx0 + wrapD(h.jx1 - h.jx0) * k;
    const nz = h.jz0 + wrapD(h.jz1 - h.jz0) * k;
    h.vx = wrapD(nx - h.x) / DT;
    h.vz = wrapD(nz - h.z) / DT;
    h.x = wrapP(nx);
    h.z = wrapP(nz);
    inp.dash = 0;
    return;
  }
  // направление ввода
  let mx = inp.mx;
  let mz = inp.mz;
  const ml = Math.sqrt(mx * mx + mz * mz);
  if (ml > 1) {
    mx /= ml;
    mz /= ml;
  }
  if (ml > 0.05) {
    h.dx = mx / (ml > 1 ? 1 : ml);
    h.dz = mz / (ml > 1 ? 1 : ml);
    const l = Math.sqrt(h.dx * h.dx + h.dz * h.dz);
    h.dx /= l;
    h.dz /= l;
  }
  if (h.dashCd > 0) h.dashCd--;
  if (h.qCd > 0) h.qCd--;

  // рывок
  if (inp.dash) {
    inp.dash = 0;
    if (h.dashCd === 0 && h.dashT === 0) {
      if (h.ride >= 0) h.ride = -1;
      let dx = h.dx;
      let dz = h.dz;
      if (ml > 0.05) {
        dx = mx / ml;
        dz = mz / ml;
      }
      const dl = dashLength(h.x, h.z, dx, dz);
      const n = ticks(D.actives.dash.time);
      h.dashT = n;
      h.ddx = (dx * dl) / n;
      h.ddz = (dz * dl) / n;
      h.dashCdMax = dashCdTicks(sim);
      h.dashCd = h.dashCdMax;
      const inv = sim.t + ticks(D.actives.dash.invuln);
      if (h.invT < inv) h.invT = inv;
      h.useId = -1;
      fx(sim, { k: 'dash', x: h.x, z: h.z, dx, dz });
    }
  }

  let nx: number;
  let nz: number;
  if (h.dashT > 0) {
    nx = h.x + h.ddx;
    nz = h.z + h.ddz;
    h.dashT--;
    const c = collide(nx, nz, HERO_R, h.dashT > 0 ? T_SOLID : T_SOLID | T_PIT);
    nx = c.x;
    nz = c.z;
  } else if (h.ride >= 0) {
    nx = h.x;
    nz = h.z; // вагонетка двигает героя сама (props.ts)
  } else {
    h.slow = slowNow(sim);
    const sp = heroSpeed(sim) * h.slow;
    nx = h.x + (mx * sp + h.kx) * DT;
    nz = h.z + (mz * sp + h.kz) * DT;
    const c = collide(nx, nz, HERO_R, T_SOLID | T_PIT);
    nx = c.x;
    nz = c.z;
    // застрял между двумя формами — второй проход
    if (c.hit) {
      const c2 = collide(nx, nz, HERO_R, T_SOLID | T_PIT);
      nx = c2.x;
      nz = c2.z;
    }
  }
  h.kx *= KB_DECAY;
  h.kz *= KB_DECAY;
  if (h.kx * h.kx + h.kz * h.kz < 0.01) h.kx = h.kz = 0;
  h.vx = (nx - h.x) / DT;
  h.vz = (nz - h.z) / DT;
  h.x = wrapP(nx);
  h.z = wrapP(nz);

  // Q: нажал — начал заряд, отпустил — удар
  if (inp.qPress) {
    inp.qPress = 0;
    if (h.qCd === 0 && h.qHold === 0) h.qHold = 1;
  }
  if (h.qHold > 0) {
    if (inp.q) {
      h.qHold++;
      if (h.qHold === h.qFull) fx(sim, { k: 'qfull' });
    } else {
      strikeQ(sim);
    }
  }
}

/** Удар фонарём: сила от времени заряда */
function strikeQ(sim: DgSim): void {
  const h = sim.hero;
  const S = D.actives.strike;
  const held = (h.qHold - 1) / 30;
  const full = h.qHold >= h.qFull;
  let f = (held - S.tap.holdBelow) / (S.chargeTime - S.tap.holdBelow);
  f = full ? 1 : f < 0 ? 0 : f > 1 ? 1 : f;
  const lvMul = 1 + S.levelScale * (h.level - 1);
  const dmg = (S.tap.damage + (S.full.damage - S.tap.damage) * f) * lvMul * dmgMul(sim);
  const r = (S.tap.radius + (S.full.radius - S.tap.radius) * f) * areaMul(sim);
  const kb = S.tap.knockback + (S.full.knockback - S.tap.knockback) * f;
  const stun = full ? ticks(S.full.stun) : 0;
  h.qHold = 0;
  h.qCdMax = ticks(S.cooldown * (hasBuff(sim, 'haste') ? 0.7 : 1));
  h.qCd = h.qCdMax;
  const n = queryCircle(sim, h.x, h.z, r);
  for (let i = 0; i < n; i++) hurtMob(sim, sim.mobs[Q[i]], dmg, 'q', h.x, h.z, kb, stun, 0);
  if (full) {
    // гасит плевки
    for (const p of sim.puddles) {
      if (p.k !== 'spit' && p.k !== 'boss') continue;
      const dx = wrapD(p.x - h.x);
      const dz = wrapD(p.z - h.z);
      if (dx * dx + dz * dz < (r + p.r) * (r + p.r)) p.t1 = sim.t;
    }
  }
  hitProps(sim, h.x, h.z, r);
  fx(sim, { k: 'q', x: h.x, z: h.z, r, full: full ? 1 : 0 });
}

/** Точка свободна для героя (для батута и вагонетки) */
export function heroFree(x: number, z: number): boolean {
  return !blocked(x, z, HERO_R);
}
