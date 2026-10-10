// «Подземелье»: рядовые и элиты — ИИ, движение, расталкивание, касание, смерть (опыт, слизнята, споры, сундук).
import { stepBoss } from './boss.ts';
import {
  fx, hurtHero, hurtMob, KB_DECAY, KB_V, makeMob, neighbors, newId, Q, setKillHook,
} from './core.ts';
import { D, mobDef, type MobKind } from './data.ts';
import { cursedKill, enemyHitsKegs } from './props.ts';
import { dropGem, dropItem } from './pickups.ts';
import { spawnPoint } from './director.ts';
import { HERO_R } from './hero.ts';
import { collide, T_PIT, T_SOLID, T_WATER, terrainAt } from './map.ts';
import type { DgMob, DgSim } from './types.ts';
import { DT, rnd, ticks, wrapD, wrapP } from './util.ts';
import { sinCos } from '../math.ts';

/** Сколько шагов мёртвый лежит в списке (анимация смерти) */
export const DIE_TICKS = 15;
const SC = { s: 0, c: 0 };
const P = { x: 0, z: 0 };

// поворот жука: шаг угла за тик
let TURN_C = 1;
let TURN_S = 0;
{
  const tr = (D.mobs.find((m) => m.id === 'beetle')?.turnRate ?? 90) * (Math.PI / 180) / 30;
  sinCos(tr, SC);
  TURN_C = SC.c;
  TURN_S = SC.s;
}

/** Есть место для добавки сверх отряда (свита, слизнята, личинки): живых меньше 300 */
export function roomForExtra(sim: DgSim, n = 1): boolean {
  return aliveCount(sim) + n <= D.mobRules.maxAlive;
}

/** Живых (без умирающих) */
export function aliveCount(sim: DgSim): number {
  let n = 0;
  for (const m of sim.mobs) if (!m.die) n++;
  return n;
}

export function spawnMob(sim: DgSim, k: MobKind, x: number, z: number, sq: 0 | 1, hpExtra = 1): DgMob {
  const w = sim.wave;
  const m = makeMob(sim, k, x, z, w.hpMul * hpExtra, w.dmgMul, sq);
  const def = mobDef(k);
  if (def.spit) m.cd = ticks(def.spit.every * (0.5 + rnd(sim) * 0.5));
  if (def.charge) m.cd = ticks(def.charge.every * 0.6);
  if (def.heal) m.cd = ticks(def.heal.every * 0.5);
  if (def.summon) m.cd2 = ticks(def.summon.every * 0.7);
  // смотрит на героя
  const dx = wrapD(sim.hero.x - m.x);
  const dz = wrapD(sim.hero.z - m.z);
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 1e-6) {
    m.dx = dx / d;
    m.dz = dz / d;
  }
  return m;
}

function setSt(sim: DgSim, m: DgMob, st: DgMob['st']): void {
  m.st = st;
  m.stT = sim.t;
}

/** Шаг всех врагов */
export function stepMobs(sim: DgSim): void {
  const h = sim.hero;
  const frozen = sim.freezeT > sim.t;
  const mobs = sim.mobs;
  // зажжённые фонари рядом (замедление врагов в свете)
  let litN = 0;
  for (const p of sim.props) {
    if (p.k !== 'lamp' || p.st !== 1) continue;
    const dx = wrapD(p.x - h.x);
    const dz = wrapD(p.z - h.z);
    if (dx * dx + dz * dz < 60 * 60 && litN < LIT.length / 2) {
      LIT[litN * 2] = p.x;
      LIT[litN * 2 + 1] = p.z;
      litN++;
    }
  }
  const lampR = LAMP_R * LAMP_R;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.die) continue;
    if (m.k === 'povidl') {
      stepBoss(sim, m);
      continue;
    }
    if (m.touch > 0) m.touch--;
    // огонь Негасимого фонаря
    if (m.burnT > sim.t && (sim.t - m.burnT) % 15 === 0) {
      hurtMob(sim, m, m.burnD * 0.5, 'lantern', m.x, m.z, 0, 0, 0);
      if (m.die) continue;
    }
    let ox = wrapD(h.x - m.x);
    let oz = wrapD(h.z - m.z);
    const d = Math.sqrt(ox * ox + oz * oz) || 1e-6;
    ox /= d;
    oz /= d;
    let vx = 0;
    let vz = 0;
    const def = mobDef(m.k);
    const flying = !!def.flying;

    if (m.st === 'flee') {
      vx = -ox * m.spd * 1.5;
      vz = -oz * m.spd * 1.5;
      if (sim.t - m.stT >= 30) {
        m.die = 1; // убрать без добычи и без счёта
        continue;
      }
    } else if (frozen || m.stunT > sim.t) {
      // стоит (песочные часы, оглушение)
      if (m.st === 'dash' && m.k === 'barrel') setSt(sim, m, 'stun');
    } else {
      // дальние: рядовых переносим вперёд, элиты ускоряются
      if (d > RECYCLE && !m.elite && m.sw <= sim.t) {
        if (spawnPoint(sim, m.r, flying, true, P)) {
          m.x = P.x;
          m.z = P.z;
          continue;
        }
      }
      const far = m.elite && d > 30 ? 2 : 1;
      switch (m.k) {
        case 'bat': {
          const ds = (def.dashSpeed ?? 8) * rageMul(m);
          if (m.sw > sim.t) {
            vx = m.ax * ds;
            vz = m.az * ds;
          } else if (m.st === 'dash') {
            vx = m.ax * ds;
            vz = m.az * ds;
            if (sim.t - m.stT >= 30) setSt(sim, m, 'hover');
          } else if (m.st === 'hover') {
            vx = ox * 1;
            vz = oz * 1;
            if (sim.t - m.stT >= 15) {
              setSt(sim, m, 'dash');
              m.ax = ox;
              m.az = oz;
            }
          } else {
            vx = ox * m.spd;
            vz = oz * m.spd;
            if (d < 12) {
              setSt(sim, m, 'dash');
              m.ax = ox;
              m.az = oz;
            }
          }
          break;
        }
        case 'rat': {
          // лёгкий зигзаг поперёк хода
          sinCos(sim.t * 0.21 + m.id * 1.7, SC);
          const zig = 0.35 * SC.s;
          vx = (ox - oz * zig) * m.spd;
          vz = (oz + ox * zig) * m.spd;
          break;
        }
        case 'beetle': {
          // разворот не быстрее 90°/с
          const cross = m.dx * oz - m.dz * ox;
          const dot = m.dx * ox + m.dz * oz;
          if (dot > TURN_C) {
            m.dx = ox;
            m.dz = oz;
          } else {
            const s = cross >= 0 ? TURN_S : -TURN_S;
            const nx = m.dx * TURN_C - m.dz * s;
            const nz = m.dx * s + m.dz * TURN_C;
            const l = Math.sqrt(nx * nx + nz * nz);
            m.dx = nx / l;
            m.dz = nz / l;
          }
          vx = m.dx * m.spd;
          vz = m.dz * m.spd;
          break;
        }
        case 'spitter':
          spitterAi(sim, m, d, ox, oz);
          vx = m.vx;
          vz = m.vz;
          break;
        case 'barrel':
          barrelAi(sim, m, d, ox, oz);
          vx = m.vx * far;
          vz = m.vz * far;
          break;
        case 'shaman':
          shamanAi(sim, m, d, ox, oz);
          vx = m.vx * far;
          vz = m.vz * far;
          break;
        default:
          vx = ox * m.spd;
          vz = oz * m.spd;
      }
      // проверка «застрял»: 1 с не приближается — толчок вбок
      if (!flying && sim.t - m.chkT >= 30) {
        if (d > 3 && d > m.chkD - 0.3 && m.st === 'walk') {
          const sgn = m.id & 1 ? 1 : -1;
          m.kx += -oz * sgn * 3 * KB_V * 0.5;
          m.kz += ox * sgn * 3 * KB_V * 0.5;
        }
        m.chkT = sim.t;
        m.chkD = d;
      }
    }
    // замедления: мелководье (все, кроме летучих), свет фонарей
    let mul = 1;
    if (!flying && terrainAt(m.x, m.z) & T_WATER) mul = 1 - (D.terrain?.water?.slowAll ?? 0.25);
    if (litN > 0) {
      for (let j = 0; j < litN; j++) {
        const lx = wrapD(LIT[j * 2] - m.x);
        const lz = wrapD(LIT[j * 2 + 1] - m.z);
        if (lx * lx + lz * lz < lampR) {
          const ls = 1 - (m.elite ? LAMP_ELITE : LAMP_SLOW);
          if (ls < mul) mul = ls;
          break;
        }
      }
    }
    vx *= mul;
    vz *= mul;
    if (vx * vx + vz * vz > 0.01 && m.k !== 'beetle' && m.st !== 'dash') {
      const l = Math.sqrt(vx * vx + vz * vz);
      m.dx = vx / l;
      m.dz = vz / l;
    }
    let nx = m.x + (vx + m.kx) * DT;
    let nz = m.z + (vz + m.kz) * DT;
    m.kx *= KB_DECAY;
    m.kz *= KB_DECAY;
    if (m.kx * m.kx + m.kz * m.kz < 0.01) m.kx = m.kz = 0;
    // расталкивание толпы
    const nn = neighbors(sim, m.x, m.z);
    let pushX = 0;
    let pushZ = 0;
    let seen = 0;
    for (let q = 0; q < nn && seen < 10; q++) {
      const j = Q[q];
      if (j === i) continue;
      const o = mobs[j];
      if (o.die || o.under) continue;
      const ex = wrapD(m.x - o.x);
      const ez = wrapD(m.z - o.z);
      const rr = m.r + o.r;
      const dd = ex * ex + ez * ez;
      if (dd >= rr * rr) continue;
      seen++;
      const dl = Math.sqrt(dd);
      const ov = rr - dl;
      const w = m.elite && !o.elite ? 0.15 : o.elite && !m.elite ? 0.85 : 0.5;
      if (dl > 1e-6) {
        pushX += (ex / dl) * ov * w;
        pushZ += (ez / dl) * ov * w;
      } else {
        pushX += (m.id & 1 ? 1 : -1) * ov * w;
      }
    }
    nx += pushX;
    nz += pushZ;
    if (!flying) {
      const c = collide(nx, nz, m.r, T_SOLID | T_PIT);
      if (c.hit && m.k === 'barrel' && m.st === 'dash') barrelWall(sim, m);
      nx = c.x;
      nz = c.z;
    }
    m.vx = (nx - m.x) / DT;
    m.vz = (nz - m.z) / DT;
    m.x = wrapP(nx);
    m.z = wrapP(nz);
    // касание героя
    if (m.st !== 'flee' && m.touch === 0 && !h.dead) {
      const tx = wrapD(h.x - m.x);
      const tz = wrapD(h.z - m.z);
      const rr = m.r + HERO_R;
      if (tx * tx + tz * tz < rr * rr && h.ride < 0) {
        const charging = m.k === 'barrel' && m.st === 'dash';
        const dmg = charging ? m.dmg : m.dmg;
        if (hurtHero(sim, dmg, m.k)) {
          m.touch = ticks(D.hero.contactHitCooldown);
          if (charging) pushHero(sim, m.ax, m.az, mobDef('barrel').charge ? 5 : 3);
        }
      }
    }
  }
}

const LIT = new Float64Array(64);
let LAMP_R = 7;
let LAMP_SLOW = 0.2;
let LAMP_ELITE = 0.1;
{
  const it = D.interactables.find((x) => x.id === 'lamppost');
  if (it) {
    if (typeof it.lightRadius === 'number') LAMP_R = it.lightRadius;
    if (typeof it.enemySlow === 'number') LAMP_SLOW = it.enemySlow;
    if (typeof it.eliteSlow === 'number') LAMP_ELITE = it.eliteSlow;
  }
}
const RECYCLE = 48;

/** Толкнуть героя по направлению (dx, dz) на kb метров */
export function pushHero(sim: DgSim, dx: number, dz: number, kb: number): void {
  const h = sim.hero;
  if (h.jumpT1 > sim.t) return;
  h.kx += dx * kb * KB_V;
  h.kz += dz * kb * KB_V;
}

function spitterAi(sim: DgSim, m: DgMob, d: number, ox: number, oz: number): void {
  const sp = mobDef('spitter').spit!;
  if (m.st === 'wind') {
    m.vx = 0;
    m.vz = 0;
    m.dx = ox;
    m.dz = oz;
    if (sim.t - m.stT >= ticks(sp.windup)) {
      const h = sim.hero;
      addMark(sim, 'circle', 'spit', h.x, h.z, sp.radius, 0, 0, ticks(sp.warn), m.dmg, 0, sp.puddle, m);
      setSt(sim, m, 'walk');
      m.cd = ticks(sp.every);
    }
    return;
  }
  // держит 8–11 м
  let s = 0;
  if (d < 8) s = -1;
  else if (d > 11) s = 1;
  m.vx = ox * m.spd * s;
  m.vz = oz * m.spd * s;
  if (s === 0) {
    // шаг вбок, чтобы не стоял столбом
    const sg = m.id & 1 ? 0.4 : -0.4;
    m.vx = -oz * m.spd * sg;
    m.vz = ox * m.spd * sg;
  }
  if (m.cd > 0) m.cd--;
  else if (d < 15) {
    setSt(sim, m, 'wind');
    fx(sim, { k: 'atk', id: m.id, what: 'spit' });
  }
}

function barrelAi(sim: DgSim, m: DgMob, d: number, ox: number, oz: number): void {
  const ch = mobDef('barrel').charge!;
  // течёт вареньем на половине HP
  if (m.hp < m.hpMax / 2) {
    if (m.cd2 > 0) m.cd2--;
    else {
      m.cd2 = 30;
      addPuddle(sim, 'jam', m.x, m.z, 1.3, ticks(4), D.terrain?.jam?.heroSlow ?? 0.35, 0);
    }
  }
  switch (m.st) {
    case 'wind':
      m.vx = 0;
      m.vz = 0;
      if (sim.t - m.stT >= ticks(ch.warn)) setSt(sim, m, 'dash');
      return;
    case 'dash':
      enemyHitsKegs(sim, m.x, m.z, m.r);
      m.vx = m.ax * ch.speed * rageMul(m);
      m.vz = m.az * ch.speed * rageMul(m);
      m.dx = m.ax;
      m.dz = m.az;
      if (sim.t - m.stT >= Math.round((ch.laneLength / ch.speed) * 30)) setSt(sim, m, 'rest');
      return;
    case 'rest':
      m.vx = 0;
      m.vz = 0;
      if (sim.t - m.stT >= ticks(ch.recover)) setSt(sim, m, 'walk');
      return;
    case 'stun':
      m.vx = 0;
      m.vz = 0;
      if (sim.t - m.stT >= ticks(ch.stunWall)) setSt(sim, m, 'walk');
      return;
  }
  m.vx = ox * m.spd;
  m.vz = oz * m.spd;
  if (m.cd > 0) m.cd--;
  else if (d < ch.laneLength - 2) {
    setSt(sim, m, 'wind');
    m.ax = ox;
    m.az = oz;
    m.cd = ticks(ch.every);
    addMark(sim, 'lane', 'charge', m.x, m.z, 0, ox, oz, ticks(ch.warn), 0, 0, 0, m, ch.laneLength, ch.laneWidth);
    fx(sim, { k: 'atk', id: m.id, what: 'charge' });
  }
}

function barrelWall(sim: DgSim, m: DgMob): void {
  const ch = mobDef('barrel').charge!;
  setSt(sim, m, 'stun');
  m.vulT = sim.t + ticks(ch.stunWall);
}

function shamanAi(sim: DgSim, m: DgMob, d: number, ox: number, oz: number): void {
  const def = mobDef('shaman');
  const heal = def.heal!;
  const sum = def.summon!;
  if (m.st === 'cast') {
    m.vx = 0;
    m.vz = 0;
    if (m.castHp - m.hp > m.hpMax * (def.interrupt ?? 0.15)) {
      setSt(sim, m, 'walk'); // сбит
      m.cd = ticks(heal.every);
      for (const mk of sim.marks) if (mk.src === m.id && mk.what === 'heal') mk.t1 = sim.t;
      return;
    }
    if (sim.t - m.stT >= ticks(heal.warn)) {
      const r2 = heal.radius * heal.radius;
      for (const o of sim.mobs) {
        if (o === m || o.die) continue;
        const ex = wrapD(o.x - m.x);
        const ez = wrapD(o.z - m.z);
        // босса (Повидл II) — на 3 %
        if (ex * ex + ez * ez < r2) o.hp = Math.min(o.hpMax, o.hp + o.hpMax * (o.k === 'povidl' ? 0.03 : heal.frac));
      }
      setSt(sim, m, 'walk');
      m.cd = ticks(heal.every);
    }
    return;
  }
  if (m.st === 'summon') {
    m.vx = 0;
    m.vz = 0;
    if (sim.t - m.stT >= ticks(sum.warn)) {
      const early = sim.wave.n < 5;
      const k: MobKind = early ? 'rat' : sum.mob;
      const n = early ? 6 : sum.n;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2;
        sinCos(a, SC);
        summonFromBudget(sim, k, m.x + SC.c * 1.8, m.z + SC.s * 1.8);
      }
      setSt(sim, m, 'walk');
      m.cd2 = ticks(sum.every);
    }
    return;
  }
  // держится в 7–10 м
  let s = 0;
  if (d < 7) s = -1;
  else if (d > 10) s = 1;
  m.vx = ox * m.spd * s;
  m.vz = oz * m.spd * s;
  if (m.cd > 0) m.cd--;
  if (m.cd2 > 0) m.cd2--;
  if (m.cd === 0) {
    setSt(sim, m, 'cast');
    m.castHp = m.hp;
    addMark(sim, 'ring', 'heal', m.x, m.z, heal.radius, 0, 0, ticks(heal.warn), 0, 0, 0, m);
    fx(sim, { k: 'atk', id: m.id, what: 'heal' });
  } else if (m.cd2 === 0) {
    setSt(sim, m, 'summon');
    fx(sim, { k: 'atk', id: m.id, what: 'summon' });
  }
}

/** Свита из бюджета волны: если в отряде есть невышедшие такого вида — берём их (они часть отряда) */
export function summonFromBudget(sim: DgSim, k: MobKind, x: number, z: number): DgMob | null {
  const w = sim.wave;
  const ki = KIND_IDX[k];
  let sq: 0 | 1 = 0;
  if (ki !== undefined && w.pend[ki] > 0) {
    w.pend[ki]--;
    w.spawned++;
    sq = 1;
  }
  if (!sq && !roomForExtra(sim)) return null;
  return spawnMob(sim, k, x, z, sq);
}
import { MOB_KINDS } from './data.ts';
const KIND_IDX: Record<string, number> = {};
MOB_KINDS.forEach((k, i) => (KIND_IDX[k] = i));

/** Метка на полу (тревога). len/w — для полосы, w — угол сектора. */
export function addMark(
  sim: DgSim, k: 'circle' | 'lane' | 'sector' | 'ring', what: string, x: number, z: number, r: number, dx: number, dz: number,
  dur: number, dmg: number, kb: number, pud: number, src: DgMob | null, len = 0, w = 0,
): void {
  sim.marks.push({
    id: newId(sim), k, what, x: wrapP(x), z: wrapP(z), r, dx, dz, len, w, t0: sim.t, t1: sim.t + dur, own: 0,
    fx: src ? src.x : x, fz: src ? src.z : z, dmg, kb, stun: 0, pud, src: src ? src.id : -1,
  });
}

export function addPuddle(sim: DgSim, k: 'spit' | 'jam' | 'spore' | 'boss', x: number, z: number, r: number, dur: number, slow: number, dps: number): void {
  sim.puddles.push({ id: newId(sim), k, x: wrapP(x), z: wrapP(z), r, t0: sim.t, t1: sim.t + dur, slow, dps });
}

/** Смерть врага: опыт, слизнята, споры, сундук элиты, счёт отряда */
function onKill(sim: DgSim, m: DgMob, src: string): void {
  m.die = sim.t;
  m.hp = 0;
  sim.stats.kills++;
  if (m.sq) sim.wave.left--;
  fx(sim, { k: 'die', id: m.id, mob: m.k, x: m.x, z: m.z });
  void src;
  const def = mobDef(m.k);
  if (m.k === 'povidl') {
    bossDeath(sim, m);
    return;
  }
  dropGem(sim, m.x, m.z, def.xp);
  if (def.splitInto && roomForExtra(sim, def.splitInto.n)) {
    for (let j = 0; j < def.splitInto.n; j++) {
      const c = spawnMob(sim, def.splitInto.id, m.x + (j ? 0.4 : -0.4), m.z + (j ? -0.3 : 0.3), 0);
      c.kx = (j ? 1 : -1) * 2 * KB_V;
    }
  }
  if (def.deathCloud) addPuddle(sim, 'spore', m.x, m.z, def.deathCloud.radius, ticks(def.deathCloud.time), def.deathCloud.slow, 0);
  if (m.elite) {
    if (m.curse >= 0) cursedKill(sim, m);
    else dropItem(sim, 'chest', m.x, m.z);
  }
}
import { bossDeath } from './boss.ts';
setKillHook(onKill);

/** Озверение за пережитый конец волны: +rage.speed скорости и +rage.dmg урона за уровень, не больше rage.max. true — поднялось */
export function enrage(m: DgMob): boolean {
  const R = rageRule();
  if (m.rage >= R.max) return false;
  const fs = (1 + R.speed * (m.rage + 1)) / (1 + R.speed * m.rage);
  const fd = (1 + R.dmg * (m.rage + 1)) / (1 + R.dmg * m.rage);
  m.rage++;
  m.spd *= fs;
  m.dmg *= fd;
  return true;
}
/** Числа озверения (design-data mobRules.rage) */
export function rageRule(): { speed: number; dmg: number; max: number } {
  const r = (D.mobRules as { rage?: { speed?: number; dmg?: number; max?: number } }).rage;
  return { speed: r?.speed ?? 0.1, dmg: r?.dmg ?? 0.1, max: r?.max ?? 3 };
}
/** Множитель озверения для скоростей из таблиц (рывок мыши, таран Бочара) */
function rageMul(m: DgMob): number {
  return 1 + rageRule().speed * m.rage;
}

/** Все живые уходят в норы (сейчас не используется: остатки волны остаются и звереют) */
export function fleeAll(sim: DgSim): void {
  for (const m of sim.mobs) {
    if (m.die || m.st === 'flee') continue;
    m.st = 'flee';
    m.stT = sim.t;
    m.under = 0;
  }
  sim.marks.length = 0;
}

/** Убрать умерших и ушедших */
export function cleanupMobs(sim: DgSim): void {
  const mobs = sim.mobs;
  let w = 0;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.die && sim.t - m.die > DIE_TICKS) continue;
    mobs[w++] = m;
  }
  mobs.length = w;
}
