// «Подземелье»: директор волн — отряд по таблице (1–10), события (стая, налёт, кольцо, элита, Орда, босс),
// бесконечные 11+ (смеси, рост, предел тел), конец волны и передышка. Враги рождаются в полосе за краем экрана.
import { spawnBosses } from './boss.ts';
import { fx, healHero, newId } from './core.ts';
import { D, LV, MOB_KINDS, mobDef, type MobKind, type WaveDef } from './data.ts';
import { blocked } from './map.ts';
import { aliveCount, enrage, spawnMob } from './mobs.ts';
import { dropGem, vacuum } from './pickups.ts';
import { wavePropsReset } from './props.ts';
import type { DgAlert, DgSim, DgWave } from './types.ts';
import { dirOf, powi, rnd, rndRange, ticks, wrapD, wrapP } from './util.ts';

const MAX_ALIVE = D.mobRules.maxAlive;
const AHEAD = D.mobRules.spawnAheadShare;
const BAND_IN = LV.spawnRing.inner;
const BAND_OUT = LV.spawnRing.outer;
const RETRIES = LV.spawnRing.retries;
// полуширина и полувысота экрана на полу (верхние углы шире — берём середину)
const corners = LV.camera.groundCornersFromHero;
const HW = (Math.abs(corners.topLeft[0]) + Math.abs(corners.bottomLeft[0])) / 2;
const HH = (Math.abs(corners.topLeft[1]) + Math.abs(corners.bottomLeft[1])) / 2;
const SPRINGS = LV.buildings.spring;
const V = { x: 0, z: 0 };
/** Таймер босс-волны, с (из данных или 120) */
const BOSS_DUR = (D.waveRules as { bossDur?: number }).bossDur ?? 120;
/** Бонус опыта за зачистку: × номер волны */
const SWEEP_XP = (D.waveRules as { sweepXp?: number }).sweepXp ?? 5;

export function emptyWave(): DgWave {
  return {
    n: 1, stage: 'intro', t0: 0, t1: 0, total: 0, left: 0, spawned: 0, boss: 0, horde: 0, hpMul: 1, dmgMul: 1, minAlive: 0,
    pend: MOB_KINDS.map(() => 0), prog: 0, ev: [], mix: '', debt: 0, old: 0, swept: 0,
  };
}

/**
 * Точка рождения в полосе 4–9 м за краем экрана. ahead — 40 % по ходу героя (если бежит). Пишет в out, false — не нашлось.
 */
export function spawnPoint(sim: DgSim, r: number, flying: boolean, aheadOnly: boolean, out: { x: number; z: number }): boolean {
  const h = sim.hero;
  const sp = Math.sqrt(h.vx * h.vx + h.vz * h.vz);
  for (let k = 0; k < RETRIES; k++) {
    if (sp > 2 && (aheadOnly || rnd(sim) < AHEAD)) {
      // сектор 120° по ходу: угол бега через полярный поворот (без atan2): берём вектор бега и поворачиваем
      const da = (rnd(sim) - 0.5) * ((LV.spawnRing.aheadConeDeg * Math.PI) / 180);
      dirOf(da, V);
      const bx = h.vx / sp;
      const bz = h.vz / sp;
      const cx = bx * V.x - bz * V.z;
      const cz = bx * V.z + bz * V.x;
      V.x = cx;
      V.z = cz;
    } else {
      dirOf(rnd(sim) * Math.PI * 2, V);
    }
    const ax = Math.abs(V.x) < 1e-6 ? 1e-6 : Math.abs(V.x);
    const az = Math.abs(V.z) < 1e-6 ? 1e-6 : Math.abs(V.z);
    const edge = Math.min(HW / ax, HH / az);
    const d = edge + rndRange(sim, BAND_IN, BAND_OUT);
    const x = wrapP(h.x + V.x * d);
    const z = wrapP(h.z + V.z * d);
    if (!flying && blocked(x, z, r)) continue;
    let nearSpring = false;
    for (const s of SPRINGS) {
      const dx = wrapD(s.x - x);
      const dz = wrapD(s.z - z);
      if (dx * dx + dz * dz < 36) nearSpring = true;
    }
    if (nearSpring) continue;
    out.x = x;
    out.z = z;
    return true;
  }
  return false;
}

// ---------- описание волн ----------
function waveDef(n: number): WaveDef | null {
  for (const w of D.waves) if (w.w === n) return w;
  return null;
}

/** HP-бюджет 9-й волны без элит (с слизнятами) — база бесконечных волн */
function budget9(): number {
  const w9 = waveDef(9)!;
  let sum = 0;
  const add = (k: string, n: number) => {
    const def = mobDef(k);
    sum += def.hp * n;
    if (def.splitInto) sum += mobDef(def.splitInto.id).hp * def.splitInto.n * n;
  };
  for (const [k, n] of Object.entries(w9.mobs)) add(k, n as number);
  for (const e of w9.events) if (e.mob && (e.type === 'pack' || e.type === 'swarm' || e.type === 'ring')) add(e.mob, e.n);
  return sum * w9.hpMul;
}
const B9 = budget9();

function endlessDur(n: number): number {
  let dur = 70;
  for (const d of D.endless.durations) if (n >= d.from) dur = d.dur;
  return dur;
}

/** Номер круга бесконечности (50+ — круг заново) */
export function cycleOf(n: number): number {
  return n < 50 ? 0 : Math.floor((n - 10) / 40);
}

/** Множитель HP одного врага на волне n */
export function hpMulOf(n: number): number {
  const w = waveDef(n);
  if (w) return w.hpMul;
  const w10 = waveDef(10)!;
  return w10.hpMul * powi(D.endless.hpMul, n - 10) * (1 + 0.25 * cycleOf(n));
}
function dmgMulOf(n: number): number {
  const w = waveDef(n);
  if (w) return w.dmgMul;
  return 1 + D.endless.dmgPerWave * (n - 1);
}

/** Начать волну n */
export function startWave(sim: DgSim, n: number): void {
  const w = sim.wave;
  w.n = n;
  w.t0 = sim.t;
  w.spawned = 0;
  w.horde = 0;
  w.prog = 0;
  w.ev = [];
  w.pend = MOB_KINDS.map(() => 0);
  w.hpMul = hpMulOf(n);
  w.dmgMul = dmgMulOf(n);
  const boss = n % 10 === 0;
  w.boss = boss ? 1 : 0;
  w.stage = boss ? 'boss' : 'wave';
  let total = 0;
  const def = waveDef(n);
  if (def) {
    w.minAlive = def.minAlive;
    w.t1 = sim.t + ticks(boss || def.dur <= 0 ? BOSS_DUR : def.dur);
    for (const [k, c] of Object.entries(def.mobs)) {
      w.pend[MOB_KINDS.indexOf(k as MobKind)] += c as number;
      total += c as number;
    }
    for (const e of def.events) {
      w.ev.push({ at: ticks(e.at), type: e.type, mob: e.mob ?? '', n: e.n, done: 0 });
      if (e.type !== 'horde' && e.type !== 'boss') total += e.n;
    }
  } else if (boss) {
    // бесконечные босс-волны: фон крыс, как на 10-й
    const w10 = waveDef(10)!;
    w.minAlive = w10.minAlive;
    w.t1 = sim.t + ticks(BOSS_DUR);
    for (const [k, c] of Object.entries(w10.mobs)) {
      w.pend[MOB_KINDS.indexOf(k as MobKind)] += c as number;
      total += c as number;
    }
    w.ev.push({ at: 0, type: 'boss', mob: 'povidl', n: 1, done: 0 });
  } else {
    total = endlessSetup(sim, n);
  }
  w.total = total;
  w.left = total;
  w.swept = 0;
  wavePropsReset(sim);
  if (boss) sim.bossT0 = sim.t;
  fx(sim, { k: 'wave', n, what: 'start' });
}

/** Состав бесконечной волны: бюджет HP, смесь, предел тел, события и элиты. Возвращает размер отряда. */
function endlessSetup(sim: DgSim, n: number): number {
  const E = D.endless;
  const w = sim.wave;
  const dur = endlessDur(n);
  w.t1 = sim.t + ticks(dur);
  w.minAlive = Math.min(E.minAliveCap, waveDef(9)!.minAlive + E.minAlivePerWave * (n - 9));
  // смесь: 11 — первая, дальше по кругу; после 20-й — случайная, не та же подряд
  let mi: number;
  if (n <= 20) mi = (n - 11) % E.mixes.length;
  else {
    const prev = E.mixes.findIndex((m) => m.id === w.mix);
    mi = Math.floor(rnd(sim) * (E.mixes.length - 1));
    if (mi >= prev && prev >= 0) mi++;
  }
  const mix = E.mixes[mi];
  w.mix = mix.id;
  const hpMul = w.hpMul;
  const budget = B9 * E.step11 * powi(E.countGrowth, n - 11);
  const counts: number[] = MOB_KINDS.map(() => 0);
  let bodies = 0;
  for (const [k, share] of Object.entries(mix.share)) {
    const def = mobDef(k);
    let unit = def.hp;
    if (def.splitInto) unit += mobDef(def.splitInto.id).hp * def.splitInto.n;
    const c = Math.round(((share as number) * budget) / (unit * hpMul));
    counts[MOB_KINDS.indexOf(k as MobKind)] = c;
    bodies += c;
  }
  const cap = n <= 20 ? E.bodyCap.upTo20 : E.bodyCap.after;
  if (bodies > cap) {
    // сверх предела растёт HP каждого, а не число
    const f = bodies / cap;
    w.hpMul = hpMul * f;
    bodies = 0;
    for (let i = 0; i < counts.length; i++) {
      counts[i] = Math.floor(counts[i] / f);
      bodies += counts[i];
    }
  }
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    w.pend[i] = counts[i];
    total += counts[i];
  }
  const T = ticks(dur);
  // события: налёт — каждая 2-я, кольцо — каждая 3-я, Орда — каждая 4-я (последние 15 с)
  const evN = 24 + 2 * (n - 10);
  if (n % 2 === 0) w.ev.push({ at: Math.round(T * 0.35), type: 'swarm', mob: 'bat', n: evN, done: 0 });
  if (n % 3 === 0) w.ev.push({ at: Math.round(T * 0.55), type: 'ring', mob: mix.share.shroom ? 'shroom' : 'rat', n: evN, done: 0 });
  if (n % 4 === 0) w.ev.push({ at: T - ticks(15), type: 'horde', mob: '', n: 0, done: 0 });
  for (const e of w.ev) if (e.type !== 'horde') total += e.n;
  // элиты: 1 + ⌊(w − 10)/4⌋; каждая 5-я — Бочар и Шаман вместе
  const ne = 1 + Math.floor((n - 10) / 4);
  for (let i = 0; i < ne; i++) {
    const k = n % 5 === 0 ? (i % 2 === 0 ? 'barrel' : 'shaman') : (n + i) % 2 === 0 ? 'barrel' : 'shaman';
    w.ev.push({ at: Math.round(T * (0.15 + (0.6 * i) / Math.max(1, ne))), type: 'elite', mob: k, n: 1, done: 0 });
    total += 1;
  }
  if (n % 5 === 0 && ne === 1) {
    w.ev.push({ at: Math.round(T * 0.2), type: 'elite', mob: 'shaman', n: 1, done: 0 });
    total += 1;
  }
  w.ev.sort((a, b) => a.at - b.at);
  return total;
}

function pendTotal(w: DgWave): number {
  let s = 0;
  for (const c of w.pend) s += c;
  return s;
}

/** Взять вид из невышедших (взвешенно по остатку) */
function takePend(sim: DgSim): MobKind | null {
  const w = sim.wave;
  const tot = pendTotal(w);
  if (tot <= 0) return null;
  let r = Math.floor(rnd(sim) * tot);
  for (let i = 0; i < w.pend.length; i++) {
    if (r < w.pend[i]) {
      w.pend[i]--;
      return MOB_KINDS[i];
    }
    r -= w.pend[i];
  }
  return null;
}

const P = { x: 0, z: 0 };

/** Выпустить одного из отряда в полосе рождения; не нашлось места — вернуть в очередь */
function spawnOne(sim: DgSim, k: MobKind): boolean {
  const def = mobDef(k);
  if (!spawnPoint(sim, def.radius, !!def.flying, false, P)) {
    sim.wave.pend[MOB_KINDS.indexOf(k)]++;
    return false;
  }
  const m = spawnMob(sim, k, P.x, P.z, 1);
  payDebt(sim.wave, m, 1);
  sim.wave.spawned++;
  return true;
}

function alert(sim: DgSim, k: DgAlert['k'], x: number, z: number, mob: string, dur: number): void {
  const a: DgAlert = { k, x: wrapP(x), z: wrapP(z), mob, t0: sim.t, t1: sim.t + dur };
  sim.alerts.push(a);
  fx(sim, { k: 'alert', a });
}

/** Шаг директора */
export function stepDirector(sim: DgSim): void {
  const w = sim.wave;
  if (sim.end !== 'running') return;
  // устаревшие объявления
  if (sim.alerts.length) {
    let j = 0;
    for (const a of sim.alerts) if (a.t1 > sim.t) sim.alerts[j++] = a;
    sim.alerts.length = j;
  }
  if (w.stage === 'intro' || w.stage === 'breather') {
    if (sim.t >= w.t1) startWave(sim, w.n);
    return;
  }
  // живые остатки прошлых волн — для HUD
  let old = 0;
  for (const m of sim.mobs) if (!m.die && m.rage > 0) old++;
  w.old = old;
  if (w.stage !== 'wave' && w.stage !== 'boss') return;
  const el = sim.t - w.t0;
  // события (с тревогой заранее)
  for (const e of w.ev) {
    if (e.done) continue;
    const pre = e.type === 'swarm' ? ticks(1.5) : e.type === 'ring' ? ticks(2) : e.type === 'pack' ? ticks(1) : 0;
    if (el === e.at - pre && pre > 0) preEvent(sim, e);
    if (el >= e.at) {
      e.done = 1;
      runEvent(sim, e);
    }
  }
  // поток отряда
  const alive = aliveCount(sim);
  const left = pendTotal(w);
  if (left > 0 && alive < MAX_ALIVE) {
    const T = (w.t1 - w.t0) * 0.85;
    w.prog += (w.horde ? 2 : 1) / T;
    const regTotal = w.spawned + left; // всё, что ещё выйдет обычным потоком, плюс вышедшие
    let want = Math.floor(Math.min(1, w.prog) * regTotal) - w.spawned;
    if (alive < w.minAlive * (w.horde ? 1.5 : 1)) want = Math.max(want, Math.min(4, w.minAlive - alive));
    for (let i = 0; i < want && i < 6 && aliveCount(sim) < MAX_ALIVE; i++) {
      const k = takePend(sim);
      if (!k) break;
      spawnOne(sim, k);
    }
  } else if (left === 0 && w.debt >= 1 && alive < w.minAlive && alive < MAX_ALIVE) {
    // очередь пуста, а долг остался — добираем им (крысы с HP из долга)
    for (let i = 0; i < 4 && w.debt >= 1 && aliveCount(sim) < Math.min(w.minAlive, MAX_ALIVE); i++) {
      if (!spawnPoint(sim, mobDef('rat').radius, false, false, P)) break;
      const m = spawnMob(sim, 'rat', P.x, P.z, 0);
      payDebt(w, m, 3);
    }
  }
  // босс повержен — фон босс-волны больше не идёт
  if (w.boss && sim.bosses.length === 0 && el > 5) w.pend.fill(0);
  // конец волны: зачистка (все живые перебиты, отряд и долг вышли) или таймер
  if (el >= ticks(3) && pendTotal(w) === 0 && w.debt < 1 && eventsDone(w) && aliveCount(sim) === 0) sweep(sim);
  else if (sim.t >= w.t1) timerEnd(sim);
}

function eventsDone(w: DgWave): boolean {
  for (const e of w.ev) if (!e.done && e.type !== 'horde') return false;
  return true;
}

/** Новый враг забирает часть долга: до mul × своего HP */
function payDebt(w: DgWave, m: { hp: number; hpMax: number }, mul: number): void {
  if (w.debt < 1) return;
  const add = Math.min(w.debt, m.hpMax * mul);
  m.hp += add;
  m.hpMax += add;
  w.debt -= add;
}

function preEvent(sim: DgSim, e: DgWave['ev'][number]): void {
  const h = sim.hero;
  if (e.type === 'swarm' || e.type === 'pack') {
    // сторона: по ходу или случайная
    if (!spawnPoint(sim, 0.5, true, false, P)) return;
    alert(sim, e.type, P.x, P.z, e.mob, ticks(e.type === 'swarm' ? 1.5 : 1) + 1);
  } else if (e.type === 'ring') {
    // норы вокруг героя в 11 м
    for (let i = 0; i < e.n; i++) {
      const a = (i / e.n) * Math.PI * 2;
      for (let s = 0; s < 8; s++) {
        dirOf(a + s * 0.07, P);
        const x = wrapP(h.x + P.x * 11);
        const z = wrapP(h.z + P.z * 11);
        if (blocked(x, z, 0.6)) continue;
        sim.marks.push({
          id: newId(sim), k: 'circle', what: 'hole', x, z, r: 0.6, dx: 0, dz: 0, len: 0, w: 0, t0: sim.t, t1: sim.t + ticks(2),
          own: 0, fx: x, fz: z, dmg: 0, kb: 0, stun: 0, pud: 0, src: -1,
        });
        break;
      }
    }
    alert(sim, 'ring', h.x, h.z, e.mob, ticks(2));
  }
}

function runEvent(sim: DgSim, e: DgWave['ev'][number]): void {
  const h = sim.hero;
  const w = sim.wave;
  const k = e.mob as MobKind;
  switch (e.type) {
    case 'pack':
    case 'swarm': {
      // с той стороны, что объявили (или новой)
      let ax: number;
      let az: number;
      const a = sim.alerts.find((x) => x.k === e.type);
      if (a) {
        ax = a.x;
        az = a.z;
      } else {
        if (!spawnPoint(sim, 0.5, true, false, P)) {
          w.pend[MOB_KINDS.indexOf(k)] += e.n;
          return;
        }
        ax = P.x;
        az = P.z;
      }
      let dx = wrapD(h.x - ax);
      let dz = wrapD(h.z - az);
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= d;
      dz /= d;
      for (let i = 0; i < e.n; i++) {
        const row = Math.floor(i / 6);
        const col = (i % 6) - 2.5;
        const x = ax - dx * row * 1.2 - dz * col * 1.3 + (rnd(sim) - 0.5) * 0.6;
        const z = az - dz * row * 1.2 + dx * col * 1.3 + (rnd(sim) - 0.5) * 0.6;
        const def = mobDef(k);
        if (!def.flying && blocked(wrapP(x), wrapP(z), def.radius)) {
          w.pend[MOB_KINDS.indexOf(k)]++;
          continue;
        }
        const m = spawnMob(sim, k, x, z, 1);
        w.spawned++;
        if (e.type === 'swarm') {
          m.sw = sim.t + ticks(5);
          m.ax = dx;
          m.az = dz;
          m.st = 'dash';
        }
      }
      break;
    }
    case 'ring': {
      let made = 0;
      for (const mk of sim.marks) {
        if (mk.what !== 'hole' || made >= e.n) continue;
        spawnMob(sim, k, mk.x, mk.z, 1);
        w.spawned++;
        made++;
        mk.t1 = sim.t;
      }
      if (made < e.n) w.pend[MOB_KINDS.indexOf(k)] += e.n - made;
      break;
    }
    case 'elite': {
      for (let i = 0; i < e.n; i++) {
        if (!spawnPoint(sim, mobDef(k).radius, false, true, P) && !spawnPoint(sim, mobDef(k).radius, false, false, P)) {
          P.x = wrapP(h.x + 20);
          P.z = h.z;
        }
        spawnMob(sim, k, P.x, P.z, 1);
        w.spawned++;
        alert(sim, 'elite', P.x, P.z, k, ticks(3));
      }
      break;
    }
    case 'horde':
      w.horde = 1;
      alert(sim, 'horde', h.x, h.z, '', (w.t1 > sim.t ? w.t1 - sim.t : ticks(15)));
      break;
    case 'boss':
      spawnBosses(sim);
      alert(sim, 'boss', h.x, h.z, 'povidl', ticks(3));
      break;
  }
}

/** Волна засчитана (таймер или зачистка): время рекорда */
function countWave(sim: DgSim): void {
  sim.stats.waves = sim.wave.n;
  sim.stats.ms = Math.round((sim.t * 1000) / 30);
  fx(sim, { k: 'wave', n: sim.wave.n, what: 'clear' });
}

/**
 * Таймер волны кончился, герой жив: волна засчитана, следующая начинается сразу. Живые остаются и звереют
 * (+1 уровень, до 3), невышедшие из-за предела 300 уходят в долг HP. Босс жив — в ярость, следующая волна поверх.
 */
export function timerEnd(sim: DgSim): void {
  const w = sim.wave;
  countWave(sim);
  let n = 0;
  let top = 0;
  for (const m of sim.mobs) {
    if (m.die || m.st === 'flee') continue;
    if (m.k === 'povidl') {
      for (const b of sim.bosses) if (b.id === m.id) b.rage = 1;
      continue;
    }
    m.sq = 0;
    if (enrage(m)) n++;
    if (m.rage > top) top = m.rage;
  }
  if (n > 0) fx(sim, { k: 'rage', n, level: top });
  // осколки на полу слетаются к герою (как раньше в конце волны); выстоял — немного здоровья
  vacuum(sim);
  const heal = (D.waveRules as { timerHeal?: number }).timerHeal ?? 0;
  if (heal > 0) healHero(sim, heal);
  for (let i = 0; i < w.pend.length; i++) {
    if (w.pend[i] > 0) w.debt += w.pend[i] * mobDef(MOB_KINDS[i]).hp * w.hpMul;
    w.pend[i] = 0;
  }
  startWave(sim, w.n + 1);
}

/** «Зачистка!»: все живые перебиты до таймера — бонус опыта, опыт к герою, передышка 5 с (Enter — раньше) */
function sweep(sim: DgSim): void {
  const w = sim.wave;
  countWave(sim);
  const xp = SWEEP_XP * w.n;
  dropGem(sim, sim.hero.x, sim.hero.z, xp);
  vacuum(sim);
  fx(sim, { k: 'sweep', n: w.n, xp });
  w.swept = 1;
  w.n++;
  w.stage = 'breather';
  w.t0 = sim.t;
  w.t1 = sim.t + ticks(D.waveRules.breather);
  w.horde = 0;
}

/** Enter: начать раньше */
export function goNow(sim: DgSim): void {
  const w = sim.wave;
  if (w.stage === 'intro' || w.stage === 'breather') w.t1 = sim.t;
}
