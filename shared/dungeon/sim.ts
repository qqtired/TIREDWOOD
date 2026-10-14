// «Подземелье»: витрина симуляции. createRun → applyEvent (ввод из журнала) → step (30 Гц) → dgResult / dgHash.
// Детерминизм: одно зерно + один журнал → один и тот же забег в node и в браузере (без Math.random/sin/cos/Date).
// Пауза — просто не вызывать step. Выбор карточек и сундук замораживают мир: step ничего не двигает и не растит t,
// пока не придёт pick. Сервер: для каждого события с ev.t === sim.t — applyEvent, затем step; если открыт выбор
// (sim.choice/sim.chest) и событий на этот t больше нет — ждать следующего куска журнала.
import type { DgEvent, DgResult } from './api.ts';
import { buildGrid, hurtHero, fx } from './core.ts';
import { D, LV } from './data.ts';
import { emptyWave, goNow, stepDirector } from './director.ts';
import { stepHero } from './hero.ts';
import { addPuddle, cleanupMobs, pushHero, stepMobs } from './mobs.ts';
import { initChests, stepPickups } from './pickups.ts';
import { ban, maybeOpenChoice, pick, reroll, xpNeed } from './progress.ts';
import { enemyHitsKegs, initProps, scanProps, stepProps } from './props.ts';
import type { DgSim } from './types.ts';
import { ticks, wrapD } from './util.ts';
import { ownMarkHit, stepWeapons } from './weapons.ts';
import {stepEnemyCharges} from './enemycharges.ts';
import {syncPhysicalMarks} from './expansion.ts';
import { heroInMark } from './attack-footprint.ts';
import { hash32 } from '../math.ts';

export type * from './types.ts';
export { D as DG_DATA, LV as DG_LEVEL } from './data.ts';
export { beamDir, orbCount, orbPos, wstats } from './weapons.ts';
export { wrapD, wrapP } from './util.ts';
export { heroSpeed } from './hero.ts';
export { pickupRadius } from './pickups.ts';

/** Длительность вступления перед 1-й волной, с */
const INTRO = 3;

export function createRun(seed: number): DgSim {
  const sp = LV.map.heroSpawn;
  const sim: DgSim = {
    v: 1,
    seed: seed >>> 0,
    rng: hash32(seed >>> 0, 0x5eed) | 0,
    t: 0,
    nextId: 1,
    hero: {
      x: sp.x, z: sp.z, dx: 0, dz: 1, vx: 0, vz: 0, kx: 0, kz: 0, hp: D.hero.hp, hpMax: D.hero.hp, level: 1, xp: 0, xpNext: xpNeed(1),
      dashCd: 0, dashCdMax: ticks(D.actives.dash.cooldown), dashT: 0, ddx: 0, ddz: 0, invT: 0,
      qCd: 0, qCdMax: ticks(D.actives.strike.cooldown), qHold: 0, qFull: ticks(D.actives.strike.chargeTime) + 1,
      hurtT: -100, jumpT0: 0, jumpT1: 0, jx0: 0, jz0: 0, jx1: 0, jz1: 0, ride: -1, useId: -1, useT0: 0, useT1: 0, lockId: -1, buffs: [], slow: 1, dead: 0,
    },
    weapons: [{ id: D.hero.startWeapon, lv: 1, evo: 0, cd: 0, t2: 0 }],
    passives: [],
    temper: 0,
    mobs: [],
    bosses: [],
    shots: [],
    marks: [],
    puddles: [],
    gems: [],
    items: [],
    traps: [],
    enemyCharges: [],
    pendingBossWaves: [],
    props: [],
    alerts: [],
    wave: emptyWave(),
    choice: null,
    chest: null,
    pendLv: 0,
    chN: 0,
    rerolls: D.levelUp.rerolls,
    banishes: D.levelUp.banishes,
    banned: [],
    firstPick: 0,
    evoReady: [],
    freezeT: 0,
    bossT0: 0,
    isleT: 0,
    in: { mx: 0, mz: 0, q: 0, qPress: 0, dash: 0, use: 0 },
    stats: { kills: 0, bosses: 0, dmg: {}, killedBy: '', waves: 0, ms: 0, chests: 0, lamps: 0 },
    fx: [],
    noFx: false,
    end: 'running',
  };
  sim.wave.t1 = ticks(INTRO);
  initProps(sim);
  initChests(sim);
  return sim;
}

function num(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return n < lo ? lo : n > hi ? hi : n;
}

/** Применить событие журнала (ввод игрока). Вызывать для событий с ev.t === sim.t до step. */
export function applyEvent(sim: DgSim, ev: DgEvent): void {
  if (sim.end !== 'running') return;
  const inp = sim.in;
  switch (ev.k) {
    case 'mv': {
      let x = Math.round(num(ev.x, -100, 100));
      let y = Math.round(num(ev.y, -100, 100));
      const l = x * x + y * y;
      if (l > 10000) {
        const s = 100 / Math.sqrt(l);
        x *= s;
        y *= s;
      }
      inp.mx = x / 100;
      inp.mz = y / 100;
      break;
    }
    case 'dash':
      inp.dash = 1;
      break;
    case 'q':
      if (ev.on) {
        inp.q = 1;
        inp.qPress = 1;
      } else inp.q = 0;
      break;
    case 'use':
      inp.use = 1;
      break;
    case 'pick':
      pick(sim, Math.round(num(ev.i, 0, 2)));
      break;
    case 'reroll':
      reroll(sim);
      break;
    case 'ban':
      ban(sim, Math.round(num(ev.i, 0, 2)));
      break;
    case 'go':
      goNow(sim);
      break;
  }
}

/** Шаг мира (1/30 с). fx очищается в начале каждого вызова. */
export function step(sim: DgSim): void {
  sim.fx.length = 0;
  if (sim.end !== 'running') return;
  if (sim.choice || sim.chest) return;
  sim.chN = 0;
  buildGrid(sim);
  scanProps(sim);
  stepHero(sim);
  stepMobs(sim);
  buildGrid(sim);
  syncPhysicalMarks(sim);
  stepWeapons(sim);
  stepEnemyCharges(sim);
  stepMarks(sim);
  stepPuddles(sim);
  stepPickups(sim);
  stepProps(sim);
  stepDirector(sim);
  cleanupMobs(sim);
  pruneBuffs(sim);
  if (sim.end !== 'running') sim.wave.stage = 'over';
  else maybeOpenChoice(sim);
  sim.t++;
}

function pruneBuffs(sim: DgSim): void {
  const b = sim.hero.buffs;
  if (b.length === 0) return;
  let w = 0;
  for (const x of b) if (x.t1 > sim.t) b[w++] = x;
  b.length = w;
}

/** Метки: в момент t1 — удар (свой — по врагам, вражеский — по герою), лужа; старые убираем */
function stepMarks(sim: DgSim): void {
  const marks = sim.marks;
  let w = 0;
  for (let i = 0; i < marks.length; i++) {
    const mk = marks[i];
    if (mk.t1 === sim.t) {
      if (mk.own) ownMarkHit(sim, mk);
      else {
        if (mk.what === 'cavein' || mk.what === 'bspit' || mk.what === 'rise') fx(sim, { k: 'boom', x: mk.x, z: mk.z, r: mk.r, what: mk.what });
        const phase = sim.bosses.find(b => b.id === mk.src)?.phase ?? 1;
        if (mk.what === 'cauldron_flow') fx(sim, { k: 'flow', x: mk.x, z: mk.z, dx: mk.dx, dz: mk.dz, len: mk.len, w: mk.w, phase });
        if (mk.what === 'cauldron_boil') fx(sim, { k: 'boil', x: mk.x, z: mk.z, r: mk.r, inner: mk.inner ?? 0, phase });
        if (mk.dmg > 0 && heroInMark(sim.hero, mk)) {
          let by = mk.what;
          for (const m of sim.mobs) if (m.id === mk.src) by = m.k;
          if (hurtHero(sim, mk.dmg, by) && mk.kb > 0) {
            const h = sim.hero;
            let ox = wrapD(h.x - mk.x);
            let oz = wrapD(h.z - mk.z);
            if (mk.k === 'lane' || mk.k === 'sector') {
              ox = mk.k === 'lane' ? mk.dx : ox;
              oz = mk.k === 'lane' ? mk.dz : oz;
            }
            const d = Math.sqrt(ox * ox + oz * oz) || 1;
            pushHero(sim, ox / d, oz / d, mk.kb);
          }
        }
        if (mk.what === 'spit' || mk.what === 'bspit') enemyHitsKegs(sim, mk.x, mk.z, mk.r);
        if (mk.pud > 0) {
          const boss = mk.what === 'bspit';
          addPuddle(sim, boss ? 'boss' : 'spit', mk.x, mk.z, mk.r, ticks(mk.pud), 0.4, boss ? 5 : 0);
        }
      }
    }
    if (mk.t1 >= sim.t) marks[w++] = mk;
  }
  marks.length = w;
}

/** Лужи: урон в секунду (лужи босса), старые убираем */
function stepPuddles(sim: DgSim): void {
  const p = sim.puddles;
  const h = sim.hero;
  let w = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    if (q.t1 <= sim.t) continue;
    if (q.dps > 0 && (sim.t - q.t0) % 15 === 0) {
      const ox = wrapD(h.x - q.x);
      const oz = wrapD(h.z - q.z);
      if (ox * ox + oz * oz < q.r * q.r) hurtHero(sim, q.dps * 0.5, 'puddle');
    }
    p[w++] = q;
  }
  p.length = w;
}

/** Итог забега по текущему состоянию */
export function dgResult(sim: DgSim): DgResult {
  const dmg: Record<string, number> = {};
  for (const [k, v] of Object.entries(sim.stats.dmg)) dmg[k] = Math.round(v);
  return {
    waves: sim.stats.waves,
    ms: sim.stats.ms,
    kills: sim.stats.kills,
    level: sim.hero.level,
    bosses: sim.stats.bosses,
    killedBy: sim.stats.killedBy,
    dmg,
    end: sim.end,
  };
}

/** Сумма состояния для поиска расхождений клиента и сервера */
export function dgHash(sim: DgSim): number {
  let h = 0x811c9dc5 | 0;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v | 0), 16777619);
  };
  const q = (v: number) => Math.round(v * 1000);
  mix(sim.t);
  mix(sim.rng);
  mix(sim.nextId);
  const he = sim.hero;
  mix(q(he.x));
  mix(q(he.z));
  mix(q(he.hp));
  mix(q(he.xp));
  mix(he.level);
  mix(sim.mobs.length);
  for (const m of sim.mobs) {
    mix(m.id);
    mix(q(m.x));
    mix(q(m.z));
    mix(q(m.hp));
  }
  mix(sim.gems.length);
  mix(sim.wave.n);
  mix(sim.stats.kills);
  for (const w of sim.weapons) mix(w.lv * 2 + w.evo);
  // Новый бой включает отложенные удары и фазы: одинаковая позиция ещё не означает одинаковое состояние.
  for (const m of sim.mobs) if (m.attackAt !== undefined) { mix(m.id); mix(m.attackAt); mix(m.attackStep ?? 0); }
  for (const b of sim.bosses) { mix(b.id); mix(b.phase); mix(b.actT); mix(b.step); mix(b.summonLeft ?? 0); }
  for (const c of sim.enemyCharges) { mix(c.id); mix(q(c.x)); mix(q(c.z)); mix(c.end); }
  for (const mk of sim.marks) { mix(mk.id); mix(mk.t1); mix(q(mk.dmg)); }
  for (const tr of sim.traps) { mix(tr.id); mix(tr.end); mix(tr.chained ?? 0); }
  for (const p of sim.pendingBossWaves) { mix(p.wave); mix(p.at); }
  for (const p of sim.wave.pend) mix(p);
  mix(q(sim.wave.debt));
  return h >>> 0;
}

