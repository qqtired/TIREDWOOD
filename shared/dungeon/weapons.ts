// «Подземелье»: 8 оружий и 4 эволюции. Оружие бьёт само: наведение по design-data (ближайший, густая толпа, по ходу).
// Положения светляков и лучей Маяка считает orbPos/beamDir — клиент рисует ими же (с дробным шагом alpha).
import {
  amount, areaMul, cdMul, densest, dmgMul, fx, H_SHIELD, healHero, hurtMob, nearestMob, newId, queryCircle, Q,
} from './core.ts';
import { D, evoOf, weaponDef, type WeaponLevel } from './data.ts';
import { hitProps, hitPropsLine } from './props.ts';
import type { DgMark, DgSim, DgWeapon } from './types.ts';
import { cosDeg, DT, rnd, rotate, ticks, wrapD, wrapP } from './util.ts';
import { sinCos } from '../math.ts';

const SC = { s: 0, c: 0 };
const V = { x: 0, z: 0 };
const C = { x: 0, z: 0 };
const TAU = Math.PI * 2;

/** Числа оружия на его уровне (с эволюцией поверх 7-го) */
export function wstats(w: DgWeapon): WeaponLevel & Record<string, unknown> {
  const def = weaponDef(w.id);
  const base = def.levels[Math.min(w.lv, def.levels.length) - 1];
  if (!w.evo) return base as WeaponLevel & Record<string, unknown>;
  const e = evoOf(w.id);
  return (e ? { ...base, ...e.stats } : base) as WeaponLevel & Record<string, unknown>;
}
// кэш, чтобы не собирать объект каждый шаг
const statCache = new Map<string, WeaponLevel & Record<string, unknown>>();
function st(w: DgWeapon): WeaponLevel & Record<string, unknown> {
  const key = w.id + w.lv + (w.evo ? 'e' : '');
  let s = statCache.get(key);
  if (!s) {
    s = wstats(w);
    statCache.set(key, s);
  }
  return s;
}

function cdTicks(sim: DgSim, sec: number): number {
  return Math.max(2, Math.round(sec * cdMul(sim) * 30));
}

/** Направление на ближайшего врага (в V), false — некого */
function aimNearest(sim: DgSim, maxR: number): boolean {
  const h = sim.hero;
  const i = nearestMob(sim, h.x, h.z, maxR);
  if (i < 0) return false;
  const m = sim.mobs[i];
  const dx = wrapD(m.x - h.x);
  const dz = wrapD(m.z - h.z);
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-6) {
    V.x = h.dx;
    V.z = h.dz;
  } else {
    V.x = dx / d;
    V.z = dz / d;
  }
  return true;
}

export function stepWeapons(sim: DgSim): void {
  if (sim.hero.dead) return;
  for (const w of sim.weapons) {
    if (w.cd > 0) w.cd--;
    switch (w.id) {
      case 'lantern':
        lantern(sim, w);
        break;
      case 'embers':
        embers(sim, w);
        break;
      case 'pickaxe':
        pickaxe(sim, w);
        break;
      case 'fireflies':
        fireflies(sim, w);
        break;
      case 'spark':
        spark(sim, w);
        break;
      case 'stalactites':
        stalactites(sim, w);
        break;
      case 'charges':
        charges(sim, w);
        break;
      case 'beam':
        beam(sim, w);
        break;
    }
  }
  stepShots(sim);
  stepTraps(sim);
}

// ---------- Фонарь: конус к ближайшему; эволюция — вперёд и назад, поджигает ----------
function lantern(sim: DgSim, w: DgWeapon): void {
  const s = st(w);
  const am = amount(sim);
  if (w.t2 > 0 && w.t2 === sim.t) {
    // повтор вспышки от Кремня
    const range = (s.range ?? 5) * areaMul(sim);
    if (aimNearest(sim, range + 3)) cone(sim, w, s, V.x, V.z, 0.5 * am);
  }
  if (w.cd > 0) return;
  const range = (s.range ?? 5) * areaMul(sim);
  if (!aimNearest(sim, range + 3)) {
    V.x = sim.hero.dx;
    V.z = sim.hero.dz;
    // некого — копим готовность, бьём, как только кто-то подойдёт
    if (nearestMob(sim, sim.hero.x, sim.hero.z, range + 3) < 0) return;
  }
  cone(sim, w, s, V.x, V.z, 1);
  if (w.evo) cone(sim, w, s, -V.x, -V.z, 1);
  w.cd = cdTicks(sim, s.cd ?? 1.1);
  if (am > 0) w.t2 = sim.t + 6;
}

function cone(sim: DgSim, w: DgWeapon, s: WeaponLevel & Record<string, unknown>, dx: number, dz: number, mul: number): void {
  const h = sim.hero;
  const range = (s.range ?? 5) * areaMul(sim);
  const angle = s.angle ?? 80;
  const cosH = cosDeg(angle / 2);
  const dmg = s.dmg * dmgMul(sim) * mul;
  const burn = typeof s.burn === 'number' ? s.burn : 0;
  const n = queryCircle(sim, h.x, h.z, range);
  for (let i = 0; i < n; i++) {
    const m = sim.mobs[Q[i]];
    const ox = wrapD(m.x - h.x);
    const oz = wrapD(m.z - h.z);
    const d = Math.sqrt(ox * ox + oz * oz);
    // край тела в конусе: угол к центру с поправкой на радиус
    if (d > m.r + 0.3 && (ox * dx + oz * dz) / d < cosH - m.r / d) continue;
    hurtMob(sim, m, dmg, 'lantern', h.x, h.z, 0.4, 0, H_SHIELD);
    if (burn > 0 && !m.die) {
      m.burnT = sim.t + 60;
      m.burnD = (dmg * burn) / 2;
    }
  }
  hitProps(sim, wrapP(h.x + dx * range * 0.5), wrapP(h.z + dz * range * 0.5), range * 0.5);
  fx(sim, { k: 'cone', x: h.x, z: h.z, dx, dz, r: range, a: angle, evo: w.evo });
}

// ---------- Угольки: самонаводящиеся ----------
const picked: number[] = [];
function embers(sim: DgSim, w: DgWeapon): void {
  if (w.cd > 0) return;
  const s = st(w);
  const h = sim.hero;
  const n = (s.n ?? 2) + amount(sim);
  picked.length = 0;
  for (let k = 0; k < n; k++) {
    // ближайший, ещё не выбранный в этом залпе
    let best = -1;
    let bd = 18 * 18;
    for (let i = 0; i < sim.mobs.length; i++) {
      const m = sim.mobs[i];
      if (m.die || m.under || picked.includes(m.id)) continue;
      const dx = wrapD(m.x - h.x);
      const dz = wrapD(m.z - h.z);
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) {
      if (k === 0) return; // некого
      best = nearestMob(sim, h.x, h.z, 18);
      if (best < 0) break;
    }
    const m = sim.mobs[best];
    picked.push(m.id);
    let dx = wrapD(m.x - h.x);
    let dz = wrapD(m.z - h.z);
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= d;
    dz /= d;
    // веер на вылете
    rotate(dx, dz, (k - (n - 1) / 2) * 0.35, C);
    const sp = s.speed ?? 12;
    sim.shots.push({
      id: newId(sim), k: 'ember', x: h.x, z: h.z, vx: C.x * sp, vz: C.z * sp, dx: C.x, dz: C.z, v0: sp, t0: sim.t, ph: m.id, size: 0.35,
      dmg: s.dmg * dmgMul(sim), pierce: s.pierce ?? 1, hit: [],
    });
  }
  w.cd = cdTicks(sim, s.cd ?? 1);
}

// ---------- Кирка: бумеранг по ходу ----------
function pickaxe(sim: DgSim, w: DgWeapon): void {
  if (w.cd > 0) return;
  const s = st(w);
  const h = sim.hero;
  const n = (s.n ?? 1) + amount(sim);
  const sp = Math.sqrt(h.vx * h.vx + h.vz * h.vz);
  let dx: number;
  let dz: number;
  if (sp > 0.5) {
    dx = h.vx / sp;
    dz = h.vz / sp;
  } else if (aimNearest(sim, 12)) {
    dx = V.x;
    dz = V.z;
  } else {
    dx = h.dx;
    dz = h.dz;
  }
  const range = (s.range ?? 7) * (1 + (areaMul(sim) - 1) * 0.5);
  const v0 = (2 * range) / 0.5; // замедляется до 0 за 0,5 с — ровно range метров
  for (let k = 0; k < n; k++) {
    rotate(dx, dz, (k - (n - 1) / 2) * 0.35, C);
    sim.shots.push({
      id: newId(sim), k: 'pick', x: h.x, z: h.z, vx: C.x * v0, vz: C.z * v0, dx: C.x, dz: C.z, v0, t0: sim.t, ph: 0,
      size: (s.size ?? 1) * areaMul(sim), dmg: s.dmg * dmgMul(sim), pierce: 99, hit: [],
    });
  }
  w.cd = cdTicks(sim, s.cd ?? 2.2);
}

function stepShots(sim: DgSim): void {
  const h = sim.hero;
  const shots = sim.shots;
  let wr = 0;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const age = sim.t - s.t0;
    let keep = true;
    if (s.k === 'ember') {
      // доворот к цели
      let tg = -1;
      for (let j = 0; j < sim.mobs.length; j++) {
        const m = sim.mobs[j];
        if (m.id === s.ph) {
          if (!m.die && !m.under) tg = j;
          break;
        }
      }
      if (tg < 0) {
        tg = nearestMob(sim, s.x, s.z, 10);
        if (tg >= 0) s.ph = sim.mobs[tg].id;
      }
      if (tg >= 0) {
        const m = sim.mobs[tg];
        let dx = wrapD(m.x - s.x);
        let dz = wrapD(m.z - s.z);
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        dx = s.vx / s.v0 + (dx / d) * 0.45;
        dz = s.vz / s.v0 + (dz / d) * 0.45;
        const l = Math.sqrt(dx * dx + dz * dz) || 1;
        s.vx = (dx / l) * s.v0;
        s.vz = (dz / l) * s.v0;
      }
      s.x = wrapP(s.x + s.vx * DT);
      s.z = wrapP(s.z + s.vz * DT);
      const n = queryCircle(sim, s.x, s.z, s.size);
      for (let q = 0; q < n && keep; q++) {
        const m = sim.mobs[Q[q]];
        if (s.hit.includes(m.id)) continue;
        s.hit.push(m.id);
        const before = m.hp;
        const dealt = hurtMob(sim, m, s.dmg, 'embers', s.x - s.vx * DT, s.z - s.vz * DT, 0.5, 0, H_SHIELD);
        s.pierce--;
        // щит жука: уголёк отскакивает
        if (m.k === 'beetle' && dealt < s.dmg * 0.5 && before > 0) s.pierce = 0;
        if (s.pierce <= 0) keep = false;
      }
      if (age > 60) keep = false;
    } else {
      // кирка
      if (s.ph === 0) {
        const f = 1 - age / 15;
        s.vx = s.dx * s.v0 * (f > 0 ? f : 0);
        s.vz = s.dz * s.v0 * (f > 0 ? f : 0);
        if (age >= 15) {
          s.ph = 1;
          s.hit.length = 0;
        }
      } else {
        const dx = wrapD(h.x - s.x);
        const dz = wrapD(h.z - s.z);
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        const sp = Math.min(20, 4 + (age - 15) * 0.7);
        s.vx = (dx / d) * sp;
        s.vz = (dz / d) * sp;
        if (d < 0.9) keep = false;
      }
      s.x = wrapP(s.x + s.vx * DT);
      s.z = wrapP(s.z + s.vz * DT);
      const n = queryCircle(sim, s.x, s.z, 0.55 * s.size);
      for (let q = 0; q < n; q++) {
        const m = sim.mobs[Q[q]];
        if (s.hit.includes(m.id)) continue;
        s.hit.push(m.id);
        hurtMob(sim, m, s.dmg, 'pickaxe', h.x, h.z, 0.6, 0, H_SHIELD);
      }
      hitProps(sim, s.x, s.z, 0.55 * s.size);
      if (age > 150) keep = false;
    }
    if (keep) shots[wr++] = s;
  }
  shots.length = wr;
}

// ---------- Светляки: вокруг героя ----------
/** Сколько огоньков у оружия сейчас (0 — погашены в перерыве) */
export function orbCount(sim: DgSim, w: DgWeapon, t = sim.t): number {
  const s = st(w);
  if (w.evo) return (s.n as number) ?? 7;
  const on = s.on ?? 4;
  const off = s.off ?? 0;
  if (off > 0) {
    const per = ticks(on + off);
    if (t % per >= ticks(on)) return 0;
  }
  return (s.n ?? 2) + amount(sim);
}

/**
 * Положение огонька i светляков (для отрисовки — с дробным шагом alpha 0…1). Пишет в out x/z.
 * У Роя светляков два встречных кольца: первые 4 — внутреннее, остальные — внешнее.
 */
export function orbPos(sim: DgSim, w: DgWeapon, i: number, alpha: number, out: { x: number; z: number }): void {
  const s = st(w);
  const h = sim.hero;
  const t = sim.t + alpha;
  let r: number;
  let n: number;
  let k: number;
  let dir = 1;
  const spin = s.spin ?? 2;
  if (w.evo) {
    const rings = (s.rings as number[]) ?? [2.6, 4.2];
    const total = orbCount(sim, w);
    const inner = Math.ceil(total / 2) + (total % 2 === 0 ? 0 : 0);
    if (i < inner) {
      r = rings[0];
      n = inner;
      k = i;
    } else {
      r = rings[1];
      n = total - inner;
      k = i - inner;
      dir = -1;
    }
  } else {
    r = s.radius ?? 2.6;
    n = orbCount(sim, w, Math.floor(t)) || 1;
    k = i;
  }
  r *= areaMul(sim);
  const a = dir * (t / (spin * 30)) * TAU + (k / n) * TAU;
  sinCos(a, SC);
  out.x = h.x + SC.c * r;
  out.z = h.z + SC.s * r;
}

function fireflies(sim: DgSim, w: DgWeapon): void {
  const n = orbCount(sim, w);
  if (n === 0) return;
  const s = st(w);
  const def = weaponDef('fireflies');
  const rehit = ticks(def.rehit ?? 0.5);
  const dmg = s.dmg * dmgMul(sim);
  const healEvery = typeof s.healEveryHits === 'number' ? s.healEveryHits : 0;
  for (let i = 0; i < n; i++) {
    orbPos(sim, w, i, 0, C);
    const x = wrapP(C.x);
    const z = wrapP(C.z);
    const q = queryCircle(sim, x, z, 0.5);
    for (let j = 0; j < q; j++) {
      const m = sim.mobs[Q[j]];
      if (m.ffT > sim.t) continue;
      m.ffT = sim.t + rehit;
      hurtMob(sim, m, dmg, 'fireflies', sim.hero.x, sim.hero.z, 0.8, 0, 0);
      if (healEvery > 0) {
        w.t2++;
        if (w.t2 >= healEvery) {
          w.t2 = 0;
          healHero(sim, 1);
        }
      }
    }
    if ((sim.t + i) % 6 === 0) hitProps(sim, x, z, 0.5);
  }
}

// ---------- Искра: цепь ----------
const chainHit: number[] = [];
function spark(sim: DgSim, w: DgWeapon): void {
  if (w.cd > 0) return;
  const s = st(w);
  const h = sim.hero;
  const first = nearestMob(sim, h.x, h.z, 9);
  if (first < 0) return;
  const chains = s.chains ?? 1;
  const jumps = (s.jumps ?? 3) + 2 * amount(sim);
  const jr = (s.jumpRange ?? 5) * areaMul(sim);
  const fall = weaponDef('spark').falloff ?? 0.1;
  const dmg0 = s.dmg * dmgMul(sim);
  chainHit.length = 0;
  for (let c = 0; c < chains; c++) {
    let cur = c === 0 ? first : nearestMob(sim, h.x, h.z, 9, sim.mobs[first].id);
    if (cur < 0) break;
    let px = h.x;
    let pz = h.z;
    const pts: number[] = [h.x, h.z];
    for (let j = 0; j < jumps && cur >= 0; j++) {
      const m = sim.mobs[cur];
      chainHit.push(m.id);
      pts.push(m.x, m.z);
      hurtMob(sim, m, dmg0 * (1 - fall * j), 'spark', px, pz, 0.2, 0, H_SHIELD);
      px = m.x;
      pz = m.z;
      // следующий: ближайший к текущему, ещё не задетый
      let best = -1;
      let bd = jr * jr;
      for (let i = 0; i < sim.mobs.length; i++) {
        const o = sim.mobs[i];
        if (o.die || o.under || chainHit.includes(o.id)) continue;
        const dx = wrapD(o.x - px);
        const dz = wrapD(o.z - pz);
        const d = dx * dx + dz * dz;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      cur = best;
    }
    fx(sim, { k: 'chain', pts });
  }
  w.cd = cdTicks(sim, s.cd ?? 1.5);
}

// ---------- Сталактиты: тень на полу, потом удар; Обвал — ещё глыба ----------
function ownMark(sim: DgSim, what: string, x: number, z: number, r: number, warn: number, dmg: number, stun: number): void {
  const m: DgMark = {
    id: newId(sim), k: 'circle', what, x: wrapP(x), z: wrapP(z), r, dx: 0, dz: 0, len: 0, w: 0, t0: sim.t, t1: sim.t + warn,
    own: 1, fx: x, fz: z, dmg, kb: 0.5, stun, pud: 0, src: -1,
  };
  sim.marks.push(m);
}

function stalactites(sim: DgSim, w: DgWeapon): void {
  const s = st(w);
  const h = sim.hero;
  const boulder = s.boulder as { every: number; dmg: number; radius: number; warn: number; stun: number } | undefined;
  if (boulder) {
    if (w.t2 > 0) w.t2--;
    else if (densest(sim, h.x, h.z, 14, C) > 0) {
      ownMark(sim, 'boulder', C.x, C.z, boulder.radius * areaMul(sim), ticks(boulder.warn), boulder.dmg * dmgMul(sim), ticks(boulder.stun));
      w.t2 = ticks(boulder.every);
    }
  }
  if (w.cd > 0) return;
  const n = (s.n ?? 1) + amount(sim);
  const r = (s.radius ?? 1.8) * areaMul(sim);
  const warn = ticks(s.warn ?? 0.35);
  const dmg = s.dmg * dmgMul(sim);
  // случайные цели в 14 м
  let cnt = 0;
  for (const m of sim.mobs) {
    if (m.die || m.under) continue;
    const dx = wrapD(m.x - h.x);
    const dz = wrapD(m.z - h.z);
    if (dx * dx + dz * dz < 196) cnt++;
  }
  if (cnt === 0) return;
  for (let k = 0; k < n; k++) {
    let pick = Math.floor(rnd(sim) * cnt);
    for (const m of sim.mobs) {
      if (m.die || m.under) continue;
      const dx = wrapD(m.x - h.x);
      const dz = wrapD(m.z - h.z);
      if (dx * dx + dz * dz >= 196) continue;
      if (pick-- === 0) {
        ownMark(sim, 'stal', m.x, m.z, r, warn, dmg, 0);
        break;
      }
    }
  }
  w.cd = cdTicks(sim, s.cd ?? 1.8);
}

/** Удар своей метки (сталактит, глыба) */
export function ownMarkHit(sim: DgSim, mk: DgMark): void {
  const n = queryCircle(sim, mk.x, mk.z, mk.r);
  const src = mk.what === 'boulder' || mk.what === 'stal' ? 'stalactites' : mk.what;
  for (let i = 0; i < n; i++) hurtMob(sim, sim.mobs[Q[i]], mk.dmg, src, mk.x, mk.z, mk.kb, mk.stun, 0);
  hitProps(sim, mk.x, mk.z, mk.r);
  fx(sim, { k: 'boom', x: mk.x, z: mk.z, r: mk.r, what: mk.what });
}

// ---------- Шашки: ловушки ----------
function charges(sim: DgSim, w: DgWeapon): void {
  if (w.cd > 0) return;
  const s = st(w);
  const h = sim.hero;
  const max = (s.maxOnFloor ?? 3) + amount(sim);
  const n = (s.n ?? 1) + amount(sim);
  for (let k = 0; k < n && sim.traps.length < max; k++) {
    const ox = k === 0 ? 0 : (rnd(sim) - 0.5) * 1.6;
    const oz = k === 0 ? 0 : (rnd(sim) - 0.5) * 1.6;
    sim.traps.push({
      id: newId(sim), x: wrapP(h.x + ox), z: wrapP(h.z + oz), t0: sim.t, arm: sim.t + ticks(s.arm ?? 0.5),
      end: sim.t + ticks(s.fuse ?? 8), dmg: s.dmg * dmgMul(sim), r: (s.radius ?? 2.5) * areaMul(sim), stun: ticks(s.stun ?? 0),
    });
  }
  w.cd = cdTicks(sim, s.cd ?? 2.5);
}

function stepTraps(sim: DgSim): void {
  const traps = sim.traps;
  let wr = 0;
  for (let i = 0; i < traps.length; i++) {
    const t = traps[i];
    let boom = sim.t >= t.end;
    if (!boom && sim.t >= t.arm) boom = queryCircle(sim, t.x, t.z, 0.6) > 0;
    if (boom) {
      const n = queryCircle(sim, t.x, t.z, t.r);
      for (let q = 0; q < n; q++) hurtMob(sim, sim.mobs[Q[q]], t.dmg, 'charges', t.x, t.z, 1.2, t.stun, 0);
      hitProps(sim, t.x, t.z, t.r);
      fx(sim, { k: 'boom', x: t.x, z: t.z, r: t.r, what: 'charge' });
      continue;
    }
    traps[wr++] = t;
  }
  traps.length = wr;
}

// ---------- Маячный луч: в густую толпу; Маяк — два крутящихся луча ----------
/** Направление луча Маяка b (0, 1) с дробным шагом alpha — в out */
export function beamDir(sim: DgSim, w: DgWeapon, b: number, alpha: number, out: { x: number; z: number }): void {
  const s = st(w);
  const per = (s.period as number) ?? 2.4;
  const beams = (s.beams as number) ?? 2;
  const a = ((sim.t + alpha) / (per * 30)) * TAU + (b / beams) * TAU;
  sinCos(a, SC);
  out.x = SC.c;
  out.z = SC.s;
}

function beamHit(sim: DgSim, dx: number, dz: number, len: number, wd: number, dmg: number, rehit: number): void {
  const h = sim.hero;
  const n = queryCircle(sim, wrapP(h.x + (dx * len) / 2), wrapP(h.z + (dz * len) / 2), len / 2 + wd);
  for (let i = 0; i < n; i++) {
    const m = sim.mobs[Q[i]];
    const ox = wrapD(m.x - h.x);
    const oz = wrapD(m.z - h.z);
    const along = ox * dx + oz * dz;
    if (along < -m.r || along > len + m.r) continue;
    const perp = Math.abs(ox * dz - oz * dx);
    if (perp > wd / 2 + m.r) continue;
    if (rehit > 0) {
      if (m.bmT > sim.t) continue;
      m.bmT = sim.t + rehit;
    }
    hurtMob(sim, m, dmg, 'beam', h.x, h.z, 0.5, 0, H_SHIELD);
  }
  hitPropsLine(sim, h.x, h.z, dx, dz, len, wd);
}

function beam(sim: DgSim, w: DgWeapon): void {
  const s = st(w);
  const h = sim.hero;
  const am = areaMul(sim);
  if (w.evo) {
    const beams = (s.beams as number) ?? 2;
    const len = ((s.length as number) ?? 16) * am;
    const wd = ((s.width as number) ?? 1.6) * am;
    for (let b = 0; b < beams; b++) {
      beamDir(sim, w, b, 0, C);
      beamHit(sim, C.x, C.z, len, wd, s.dmg * dmgMul(sim), 15);
    }
    return;
  }
  if (w.cd > 0) return;
  const n = (s.n ?? 1) + amount(sim);
  const len = (s.length ?? 14) * am;
  const wd = (s.width ?? 1.2) * am;
  if (densest(sim, h.x, h.z, 14, C) === 0) {
    w.cd = 10;
    return;
  }
  let dx = wrapD(C.x - h.x);
  let dz = wrapD(C.z - h.z);
  let d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-6) {
    dx = h.dx;
    dz = h.dz;
    d = 1;
  }
  dx /= d;
  dz /= d;
  for (let k = 0; k < n; k++) {
    // следующие лучи — веером через равные углы
    rotate(dx, dz, (k * TAU) / n, C);
    beamHit(sim, C.x, C.z, len, wd, s.dmg * dmgMul(sim), 0);
    fx(sim, { k: 'beam', x: h.x, z: h.z, dx: C.x, dz: C.z, len, w: wd });
  }
  w.cd = cdTicks(sim, s.cd ?? 3);
}

void D;
