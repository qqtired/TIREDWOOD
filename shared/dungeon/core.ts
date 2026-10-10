// «Подземелье»: общее ядро шага — номера, эффекты, сетка врагов, урон врагам и герою, множители героя.
import { D, mobDef, type MobKind } from './data.ts';
import { CELL, CELLS, cellIdx, cellOf } from './map.ts';
import type { DgFx, DgMob, DgSim } from './types.ts';
import { cosDeg, ticks, wrapD, wrapP } from './util.ts';

export function newId(sim: DgSim): number {
  return sim.nextId++;
}

export function fx(sim: DgSim, e: DgFx): void {
  if (!sim.noFx) sim.fx.push(e);
}

// ---------- сетка врагов (перекладывается каждый шаг; общая для всех забегов — это черновик, не состояние) ----------
const head = new Int32Array(CELLS * CELLS);
let next = new Int32Array(512);
/** результат запроса: индексы врагов в sim.mobs */
export const Q = new Int32Array(2048);

export function buildGrid(sim: DgSim): void {
  head.fill(-1);
  const mobs = sim.mobs;
  if (next.length < mobs.length) next = new Int32Array(mobs.length * 2);
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.die || m.under) continue;
    const c = cellOf(m.x, m.z);
    next[i] = head[c];
    head[c] = i;
  }
}

/** Живые врагов-цели, у которых край тела в круге (x, z, r). Возвращает число, индексы — в Q. */
export function queryCircle(sim: DgSim, x: number, z: number, r: number): number {
  const mobs = sim.mobs;
  const reach = r + 1.5;
  const gx0 = Math.floor((x - reach) / CELL);
  const gx1 = Math.floor((x + reach) / CELL);
  const gz0 = Math.floor((z - reach) / CELL);
  const gz1 = Math.floor((z + reach) / CELL);
  let n = 0;
  for (let gz = gz0; gz <= gz1; gz++) {
    const rz = cellIdx(gz * CELL);
    for (let gx = gx0; gx <= gx1; gx++) {
      const rx = cellIdx(gx * CELL);
      for (let i = head[rz * CELLS + rx]; i !== -1; i = next[i]) {
        const m = mobs[i];
        if (m.die || m.under) continue;
        const dx = wrapD(m.x - x);
        const dz = wrapD(m.z - z);
        const rr = r + m.r;
        if (dx * dx + dz * dz <= rr * rr && n < Q.length) Q[n++] = i;
      }
    }
  }
  // корзины обходятся в разном порядке при разных x — сортируем, чтобы порядок попаданий зависел только от списка
  if (n > 1) sortQ(n);
  return n;
}

function sortQ(n: number): void {
  for (let i = 1; i < n; i++) {
    const v = Q[i];
    let j = i - 1;
    while (j >= 0 && Q[j] > v) {
      Q[j + 1] = Q[j];
      j--;
    }
    Q[j + 1] = v;
  }
}

/** Ближайший живой враг-цель в радиусе maxR (индекс или −1). Перебор — ≤ 300 врагов. */
export function nearestMob(sim: DgSim, x: number, z: number, maxR: number, skipId = -1): number {
  let best = -1;
  let bd = maxR * maxR;
  const mobs = sim.mobs;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.die || m.under || m.id === skipId) continue;
    const dx = wrapD(m.x - x);
    const dz = wrapD(m.z - z);
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Самая густая корзина врагов в радиусе maxR от точки: центр толпы в out, число врагов — результат */
export function densest(sim: DgSim, x: number, z: number, maxR: number, out: { x: number; z: number }): number {
  const mobs = sim.mobs;
  const g = Math.ceil(maxR / CELL);
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  let best = 0;
  for (let dz = -g; dz <= g; dz++) {
    for (let dx = -g; dx <= g; dx++) {
      const c = cellIdx((cz + dz) * CELL) * CELLS + cellIdx((cx + dx) * CELL);
      let n = 0;
      let sx = 0;
      let sz = 0;
      for (let i = head[c]; i !== -1; i = next[i]) {
        const m = mobs[i];
        const ox = wrapD(m.x - x);
        const oz = wrapD(m.z - z);
        if (ox * ox + oz * oz > maxR * maxR) continue;
        n++;
        sx += ox;
        sz += oz;
      }
      if (n > best) {
        best = n;
        out.x = x + sx / n;
        out.z = z + sz / n;
      }
    }
  }
  return best;
}

/** Обход соседей по сетке 3 × 3 корзины вокруг точки — для расталкивания: индексы в Q, число — результат */
export function neighbors(sim: DgSim, x: number, z: number): number {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  let n = 0;
  for (let dz = -1; dz <= 1; dz++) {
    const rz = cellIdx((cz + dz) * CELL);
    for (let dx = -1; dx <= 1; dx++) {
      const rx = cellIdx((cx + dx) * CELL);
      for (let i = head[rz * CELLS + rx]; i !== -1 && n < Q.length; i = next[i]) Q[n++] = i;
    }
  }
  void sim;
  return n;
}

// ---------- множители героя ----------
export function passiveLv(sim: DgSim, id: string): number {
  for (const p of sim.passives) if (p.id === id) return p.lv;
  return 0;
}
export function hasBuff(sim: DgSim, id: string): boolean {
  for (const b of sim.hero.buffs) if (b.id === id && b.t1 > sim.t) return true;
  return false;
}
/** Общий множитель урона: Фитиль, Закалка, Ярость алтаря */
export function dmgMul(sim: DgSim): number {
  const might = passiveLv(sim, 'might') * passiveDefPer('might');
  const temper = sim.temper * D.levelUp.temper.dmg;
  return (1 + might + temper) * (hasBuff(sim, 'fury') ? 1.5 : 1);
}
/** Множитель перезарядки оружий: Лампадное масло, Спешка */
export function cdMul(sim: DgSim): number {
  const c = 1 - passiveLv(sim, 'cooldown') * passiveDefPer('cooldown');
  return (c < 0.3 ? 0.3 : c) * (hasBuff(sim, 'haste') ? 0.7 : 1);
}
/** Множитель области: Линза */
export function areaMul(sim: DgSim): number {
  return 1 + passiveLv(sim, 'area') * passiveDefPer('area');
}
/** Доп. снаряды: Кремень */
export function amount(sim: DgSim): number {
  return passiveLv(sim, 'amount');
}
const perCache = new Map<string, number>();
function passiveDefPer(id: string): number {
  let v = perCache.get(id);
  if (v === undefined) {
    v = 0;
    for (const p of D.passives) if (p.id === id) v = p.per;
    perCache.set(id, v);
  }
  return v;
}

// ---------- урон ----------
/** Флаги удара по врагу */
export const H_SHIELD = 1; // уважает щит жука (снаряды, конус, луч)
export const H_PROP = 2; // удар постройки (не в урон по оружиям)

/**
 * Урон врагу. src — чем (id оружия, 'q', 'prop', …), fromX/Z — откуда пришёл удар (для щита и отброса),
 * kb — отброс в метрах, stun — оглушение в шагах. Возвращает нанесённый урон.
 */
export function hurtMob(
  sim: DgSim, m: DgMob, dmg: number, src: string, fromX: number, fromZ: number, kb: number, stun: number, flags: number,
): number {
  if (m.die || m.under || dmg <= 0) return 0;
  if (m.k === 'povidl' && m.st === 'roar') return 0;
  let ox = wrapD(m.x - fromX);
  let oz = wrapD(m.z - fromZ);
  let d = Math.sqrt(ox * ox + oz * oz);
  if (d > 1e-6) {
    ox /= d;
    oz /= d;
  } else {
    ox = 1;
    oz = 0;
    d = 0;
  }
  if (flags & H_SHIELD && m.k === 'beetle') {
    const def = mobDef('beetle');
    const sh = def.shield;
    // удар пришёл спереди: направление «от врага к источнику» близко к взгляду
    if (sh && -(ox * m.dx + oz * m.dz) > SHIELD_COS) dmg *= sh.mul;
  }
  if (m.vulT > sim.t) dmg *= m.k === 'povidl' ? 1.5 : vulnMul();
  m.hp -= dmg;
  m.hitT = sim.t;
  sim.stats.dmg[src] = (sim.stats.dmg[src] || 0) + dmg;
  fx(sim, { k: 'hit', id: m.id, x: m.x, z: m.z, n: Math.round(dmg), big: src === 'q' ? 1 : 0, w: src });
  if (kb > 0 && m.k !== 'povidl') {
    const res = mobDef(m.k).knockbackResist || 0;
    const v = kb * (1 - res) * KB_V;
    m.kx += ox * v;
    m.kz += oz * v;
  }
  if (stun > 0 && m.k !== 'povidl') {
    const until = sim.t + stun;
    if (m.stunT < until) m.stunT = until;
  }
  if (m.hp <= 0) killHook(sim, m, src);
  return dmg;
}
/** Отброс: скорость = расстояние × KB_V, затухает ×KB_DECAY за шаг (итого ровно kb метров) */
export const KB_DECAY = 0.8;
export const KB_V = (1 - KB_DECAY) * 30;
let SHIELD_COS = 0.34;
{
  const sh = D.mobs.find((m) => m.id === 'beetle')?.shield;
  if (sh) SHIELD_COS = cosDeg(sh.arc / 2);
}
function vulnMul(): number {
  return D.mobs.find((m) => m.id === 'barrel')?.charge?.vulnMul ?? 1.5;
}

// убийство отдаём наружу (mobs.ts), чтобы не тянуть сюда всё
let killHook: (sim: DgSim, m: DgMob, src: string) => void = () => {};
export function setKillHook(f: (sim: DgSim, m: DgMob, src: string) => void): void {
  killHook = f;
}

/** Урон герою (касание, плевок, таран). Броня Каски, неуязвимость, смерть. */
export function hurtHero(sim: DgSim, dmg: number, by: string): boolean {
  const h = sim.hero;
  if (h.dead || h.invT > sim.t || h.dashT > 0 || h.jumpT1 > sim.t) return false;
  const armor = passiveLv(sim, 'armor');
  let n = dmg - armor;
  if (n < D.hero.minDamageTaken) n = D.hero.minDamageTaken;
  n = Math.round(n);
  h.hp -= n;
  h.hurtT = sim.t;
  h.invT = sim.t + ticks(D.hero.hitInvuln);
  fx(sim, { k: 'hurt', n, by });
  // удар сбивает ковку в кузне
  if (h.useId >= 0) h.useId = -1;
  if (h.hp <= 0) {
    h.hp = 0;
    h.dead = sim.t;
    sim.end = 'death';
    sim.stats.killedBy = by;
    fx(sim, { k: 'dead' });
  }
  return true;
}

export function healHero(sim: DgSim, n: number): void {
  const h = sim.hero;
  if (h.dead) return;
  const before = h.hp;
  h.hp = Math.min(h.hpMax, h.hp + n);
  if (h.hp > before + 0.5) fx(sim, { k: 'heal', n: Math.round(h.hp - before) });
}

/** Новый враг (без проверки места) */
export function makeMob(sim: DgSim, k: MobKind, x: number, z: number, hpMul: number, dmgMulV: number, sq: 0 | 1): DgMob {
  const def = mobDef(k);
  const hp = Math.round(def.hp * hpMul);
  const m: DgMob = {
    id: newId(sim), k, elite: def.tier === 'elite' ? 1 : 0, x: wrapP(x), z: wrapP(z), dx: 1, dz: 0, vx: 0, vz: 0, kx: 0, kz: 0,
    hp, hpMax: hp, dmg: def.dmg * dmgMulV, spd: def.speed, r: def.radius, st: 'walk', stT: sim.t, hitT: -1, die: 0, cd: 0, cd2: 0, touch: 0,
    stunT: 0, burnT: 0, burnD: 0, sq, ax: 0, az: 0, sw: 0, castHp: 0, under: 0, vulT: 0, chkT: sim.t, chkD: 1e9, ffT: 0, bmT: 0, curse: -1,
  };
  sim.mobs.push(m);
  return m;
}
