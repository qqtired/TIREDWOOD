// «Подземелье»: босс — Старый Повидл. 3 фазы (100–66–33 %), нырок с бугром и кругом вынырка, плевки, хвост,
// обвал свода, призыв личинок; окно ×1,5 после вынырка; ярость с 180-й секунды. Варианты бесконечности:
// 20 — Повидл II (+2 шамана, вынырок оставляет лужи), 30 — Близнецы (два ×0,75 по 50 % HP), 40 — Повидл III (+3 Бочара,
// обвал с 1-й фазы), 50+ — круг заново (+25 % HP, +10 % скорости за круг).
import { fx, hurtHero, makeMob, newId } from './core.ts';
import { D, type BossAttack } from './data.ts';
import { cycleOf } from './director.ts';
import { addMark, pushHero, roomForExtra, spawnMob } from './mobs.ts';
import { dropGem, dropItem } from './pickups.ts';
import type { DgBoss, DgMob, DgSim } from './types.ts';
import { DT, dirOf, powi, rnd, rotate, ticks, wrapD, wrapP } from './util.ts';

const B = D.boss;
const V = { x: 0, z: 0 };
const R = 1.8;

function attack(phase: number, id: string): BossAttack {
  const ph = B.phases[phase - 1];
  for (const a of ph.attacks) if (a.id === id) return a;
  for (const p of B.phases) for (const a of p.attacks) if (a.id === id) return a;
  return { id, dmg: 20, radius: 2 };
}

/** Появление босса(ов) на босс-волне */
export function spawnBosses(sim: DgSim): void {
  const n = sim.wave.n;
  const kind = (Math.floor(n / 10) - 1) % 4;
  const cyc = cycleOf(n);
  const hp = B.hp * powi(B.endlessGrowth, n - 10) * (1 + 0.25 * cyc);
  const count = kind === 2 ? 2 : 1;
  const h = sim.hero;
  for (let i = 0; i < count; i++) {
    dirOf(rnd(sim) * Math.PI * 2, V);
    const m = makeMob(sim, 'povidl', h.x + V.x * 16, h.z + V.z * 16, 1, sim.wave.dmgMul, 0);
    const scale = kind === 2 ? 0.75 : 1;
    m.hp = m.hpMax = Math.round(hp * (kind === 2 ? 0.5 : 1));
    m.dmg = B.contactDmg * sim.wave.dmgMul;
    m.spd = B.speed * (1 + 0.1 * cyc);
    m.r = R * scale;
    m.elite = 1;
    m.under = 1;
    m.st = 'under';
    const b: DgBoss = {
      id: m.id, phase: 1, kind, act: 'burrow', step: 1, actT: sim.t - (i === 1 ? -ticks(3) : 0), sumT: sim.t + ticks(8),
      rot: 0, rage: 0, scale,
    };
    sim.bosses.push(b);
  }
  if (kind === 1) for (let i = 0; i < 2; i++) spawnHelper(sim, 'shaman', i);
  if (kind === 3) for (let i = 0; i < 3; i++) spawnHelper(sim, 'barrel', i);
}

function spawnHelper(sim: DgSim, k: 'shaman' | 'barrel', i: number): void {
  const h = sim.hero;
  dirOf(i * 2.1 + 0.5, V);
  spawnMob(sim, k, h.x + V.x * 20, h.z + V.z * 20, 0);
}

function bossOf(sim: DgSim, m: DgMob): DgBoss | null {
  for (const b of sim.bosses) if (b.id === m.id) return b;
  return null;
}

function setAct(sim: DgSim, b: DgBoss, act: string, step = 0): void {
  b.act = act;
  b.step = step;
  b.actT = sim.t;
}

function pauseTicks(sim: DgSim, b: DgBoss): number {
  const p = B.phases[b.phase - 1].pause;
  return ticks(p * (b.rage ? 0.5 : 1));
}

/** Ходы по фазам */
function rotation(b: DgBoss): string[] {
  if (b.phase === 1) return b.kind === 3 ? ['burrow', 'spit', 'cavein'] : ['burrow', 'spit'];
  if (b.phase === 2) return ['burrow2', 'spit5', 'tail'];
  return ['burrowChain', 'cavein', 'spit5'];
}

function larvae(sim: DgSim, x: number, z: number, n: number, r: number): void {
  for (let i = 0; i < n; i++) {
    dirOf((i / n) * Math.PI * 2, V);
    if (!roomForExtra(sim)) break;
    spawnMob(sim, 'larva', x + V.x * r, z + V.z * r, 0);
  }
}

function mark(sim: DgSim, m: DgMob, what: string, x: number, z: number, r: number, warn: number, dmg: number, kb: number, pud: number): void {
  addMark(sim, 'circle', what, x, z, r, 0, 0, warn, dmg * sim.wave.dmgMul, kb, pud, m);
}

export function stepBoss(sim: DgSim, m: DgMob): void {
  const b = bossOf(sim, m);
  if (!b) return;
  const h = sim.hero;
  let ox = wrapD(h.x - m.x);
  let oz = wrapD(h.z - m.z);
  const d = Math.sqrt(ox * ox + oz * oz) || 1e-6;
  ox /= d;
  oz /= d;
  const el = sim.t - b.actT;
  const spd = m.spd * (b.phase === 3 ? (B.phases[2].speedMul ?? 1.3) : 1);
  if (!b.rage && sim.t - sim.bossT0 >= ticks(B.enrageAt)) b.rage = 1;
  if (m.touch > 0) m.touch--;
  // смена фазы
  const frac = m.hp / m.hpMax;
  if (b.act !== 'roar' && ((b.phase === 1 && frac <= B.phases[0].hpTo) || (b.phase === 2 && frac <= B.phases[1].hpTo))) {
    b.phase++;
    m.under = 0;
    m.st = 'roar';
    m.stT = sim.t;
    setAct(sim, b, 'roar');
    fx(sim, { k: 'phase', id: m.id, phase: b.phase });
    if (b.phase === 3) addMark(sim, 'ring', 'roar', m.x, m.z, 6, 0, 0, ticks(1.5), 0, 0, 0, m);
  }
  let vx = 0;
  let vz = 0;
  switch (b.act) {
    case 'roar':
      if (el >= ticks(1.5)) {
        if (b.phase === 2) {
          larvae(sim, m.x, m.z, 8, 3);
          m.under = 1;
          m.st = 'under';
          m.stT = sim.t;
          setAct(sim, b, 'burrow2', 1);
        } else {
          // кольцо отброса и кольцо личинок вокруг героя
          if (d < 6) pushHero(sim, ox, oz, 6);
          larvae(sim, h.x, h.z, 16, 9);
          setAct(sim, b, 'pause');
          m.st = 'walk';
          m.stT = sim.t;
        }
      }
      break;
    case 'pause':
      vx = ox * spd;
      vz = oz * spd;
      m.st = 'walk';
      if (el >= pauseTicks(sim, b)) {
        const ph = B.phases[b.phase - 1];
        if (sim.t >= b.sumT) {
          setAct(sim, b, 'summon');
          m.st = 'summon';
          m.stT = sim.t;
          b.sumT = sim.t + ticks(ph.summons.every);
          fx(sim, { k: 'atk', id: m.id, what: 'summon' });
          break;
        }
        const rot = rotation(b);
        let next = rot[b.rot % rot.length];
        b.rot++;
        // хвост — только если герой за спиной
        if (next === 'tail' && m.dx * ox + m.dz * oz > -0.2) {
          next = rot[b.rot % rot.length];
          b.rot++;
        }
        setAct(sim, b, next);
        fx(sim, { k: 'atk', id: m.id, what: next });
      }
      break;
    case 'summon':
      if (el >= ticks(1)) {
        larvae(sim, m.x, m.z, B.phases[b.phase - 1].summons.n, 2.5);
        setAct(sim, b, 'pause');
      }
      break;
    case 'burrow':
    case 'burrow2':
    case 'burrowChain':
      burrow(sim, m, b, el, ox, oz);
      if (m.under && m.st === 'under') {
        vx = ox * 5.5;
        vz = oz * 5.5;
      }
      break;
    case 'spit':
    case 'spit5': {
      m.st = 'wind';
      if (b.step === 0) {
        m.stT = sim.t;
        b.step = 1;
      }
      if (el >= ticks(0.8)) {
        const a = attack(b.phase, b.act);
        const n = a.n ?? 3;
        const pud = a.puddle?.time ?? 5;
        for (let i = 0; i < n; i++) {
          let x = h.x;
          let z = h.z;
          if (b.act === 'spit5') {
            rotate(ox, oz, (i - (n - 1) / 2) * 0.3, V);
            x = m.x + V.x * d;
            z = m.z + V.z * d;
          } else if (i > 0) {
            dirOf(rnd(sim) * Math.PI * 2, V);
            const rr = 1.5 + rnd(sim) * 1.5;
            x += V.x * rr;
            z += V.z * rr;
          }
          mark(sim, m, 'bspit', x, z, a.radius, ticks(1), a.dmg, 0, pud);
        }
        setAct(sim, b, 'pause');
      }
      break;
    }
    case 'tail': {
      m.st = 'tail';
      if (b.step === 0) {
        m.stT = sim.t;
        b.step = 1;
        const a = attack(2, 'tail');
        addMark(sim, 'sector', 'tail', m.x, m.z, a.radius, -m.dx, -m.dz, ticks(1), a.dmg * sim.wave.dmgMul, a.knockback ?? 6, 0, m, 0, 180);
      }
      if (el >= ticks(1.3)) setAct(sim, b, 'pause');
      break;
    }
    case 'cavein': {
      if (b.step === 0) {
        b.step = 1;
        const a = attack(3, 'cavein');
        const n = a.n ?? 6;
        for (let i = 0; i < n; i++) {
          let x = h.x;
          let z = h.z;
          if (i > 0) {
            dirOf(rnd(sim) * Math.PI * 2, V);
            const rr = 2 + rnd(sim) * 5;
            x += V.x * rr;
            z += V.z * rr;
          }
          mark(sim, m, 'cavein', x, z, a.radius, ticks(1), a.dmg, 0, 0);
        }
      }
      vx = ox * spd * 0.5;
      vz = oz * spd * 0.5;
      if (el >= ticks(1.2)) setAct(sim, b, 'pause');
      break;
    }
  }
  if (vx * vx + vz * vz > 0.01 && !m.under) {
    const l = Math.sqrt(vx * vx + vz * vz);
    m.dx = vx / l;
    m.dz = vz / l;
  }
  m.vx = vx;
  m.vz = vz;
  m.x = wrapP(m.x + vx * DT);
  m.z = wrapP(m.z + vz * DT);
  // касание
  if (!m.under && m.touch === 0 && m.st !== 'roar') {
    const tx = wrapD(h.x - m.x);
    const tz = wrapD(h.z - m.z);
    const rr = m.r + 0.45;
    if (tx * tx + tz * tz < rr * rr && hurtHero(sim, m.dmg, 'povidl')) m.touch = ticks(1);
  }
}

/** Нырок: 0 — ныряет 1 с; 1 — бугор ползёт за героем 3 с; 2 — круг вынырка; 3 — стоит столбом (окно) */
function burrow(sim: DgSim, m: DgMob, b: DgBoss, el: number, ox: number, oz: number): void {
  const p3 = b.phase === 3;
  const warn = ticks(p3 ? 1.0 : 1.2);
  switch (b.step) {
    case 0:
      m.st = 'dive';
      if (el === 0) m.stT = sim.t;
      if (el >= ticks(1)) {
        m.under = 1;
        m.st = 'under';
        m.stT = sim.t;
        b.step = 1;
        b.actT = sim.t;
      }
      break;
    case 1:
      if (el >= ticks(p3 ? 2 : 3)) {
        const a = attack(b.phase, b.act === 'burrow2' ? 'burrow' : b.act === 'burrowChain' ? 'burrowChain' : 'burrow');
        mark(sim, m, 'rise', m.x, m.z, a.radius, warn, a.dmg, a.knockback ?? 5, 0);
        if (b.act === 'burrow2') {
          // ещё 2 круга по 3 м цепочкой к герою через 0,6 с
          const a2 = attack(2, 'burrow2');
          for (let k = 1; k <= 2; k++) {
            const x = m.x + ox * 3.5 * k;
            const z = m.z + oz * 3.5 * k;
            addMark(sim, 'circle', 'rise', x, z, a2.radius, 0, 0, warn + ticks(0.6 * k), a2.dmg * sim.wave.dmgMul, 4, 0, m);
          }
        }
        m.st = 'rise';
        m.stT = sim.t;
        b.step = 2;
        b.actT = sim.t;
      }
      break;
    case 2: {
      const extra = b.act === 'burrow2' ? ticks(1.2) : 0;
      if (el >= warn + extra) {
        // вынырнул (в последнем круге для тройного)
        if (b.act === 'burrow2') {
          m.x = wrapP(m.x + ox * 7);
          m.z = wrapP(m.z + oz * 7);
        }
        m.under = 0;
        if (b.kind === 1) {
          for (let k = 0; k < 6; k++) {
            dirOf((k / 6) * Math.PI * 2, V);
            sim.puddles.push({
              id: newId(sim), k: 'boss', x: wrapP(m.x + V.x * 4), z: wrapP(m.z + V.z * 4), r: 1.6, t0: sim.t, t1: sim.t + ticks(5), slow: 0.4, dps: 5,
            });
          }
        }
        // двойной нырок: сразу второй
        if (b.act === 'burrowChain' && m.ax === 0) {
          m.ax = 1;
          b.step = 0;
          b.actT = sim.t;
          break;
        }
        m.ax = 0;
        m.st = 'stuck';
        m.stT = sim.t;
        const win = b.act === 'burrowChain' ? 3 : 2;
        m.vulT = sim.t + ticks(win);
        b.step = 3;
        b.actT = sim.t;
      }
      break;
    }
    case 3:
      if (el >= ticks(b.act === 'burrowChain' ? 3 : 2)) setAct(sim, b, 'pause');
      break;
  }
}

/** Босс повержен: большой сундук, магнит, похлёбка, опыт; +1 переброс и +1 изгнание */
export function bossDeath(sim: DgSim, m: DgMob): void {
  const idx = sim.bosses.findIndex((b) => b.id === m.id);
  if (idx >= 0) sim.bosses.splice(idx, 1);
  // Близнецы: второй сразу в 3-й фазе
  for (const b of sim.bosses) {
    if (b.phase < 3) {
      const o = sim.mobs.find((x) => x.id === b.id);
      if (o) {
        b.phase = 2;
        o.hp = Math.min(o.hp, o.hpMax * 0.33);
      }
    }
  }
  if (sim.bosses.length > 0) {
    dropGem(sim, m.x, m.z, B.xp / 2);
    return;
  }
  sim.stats.bosses++;
  sim.rerolls += D.levelUp.perBoss.rerolls;
  sim.banishes += D.levelUp.perBoss.banishes;
  dropItem(sim, 'bigchest', m.x, m.z);
  dropItem(sim, 'magnet', m.x + 1.5, m.z);
  dropItem(sim, 'stew', m.x - 1.5, m.z);
  dropGem(sim, m.x, m.z + 1.5, B.xp);
}
