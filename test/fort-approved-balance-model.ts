// Reproducible arithmetic sensitivity, not a win-rate or a substitute for a multiplayer playtest.
// node test/fort-approved-balance-model.ts > /tmp/fort-approved-balance.json
import { pathToFileURL } from 'node:url';
import { TICK_RATE } from '../shared/constants.ts';
import { BOSS_ARMOR } from '../shared/fort.ts';
import { ZK, Z_BRUTE, Z_KRAKEN, Z_TENTACLE } from '../shared/fortkinds.ts';
import * as A from '../shared/fortarsenal.ts';
import * as W from '../shared/fortwaves.ts';
import * as S from '../shared/fortsiege.ts';
import { TENT_COUNT } from '../shared/fortkraken.ts';
import { budgetHp, planWave, SIEGE_FEATURES } from '../server/fort/director.ts';
import { SKILLS, powerOf, simulate, type Director, type Kit, type Skill } from '../tools/fort-balance/model.ts';

const SEED = 12345;
const sampleWaves = [6, 12, 19, 40, 45, 78, 98];
export const assumptions = {
  kind: 'Arithmetic HP work with paid purchase trajectories; no paths, spawn queue, turret visibility, hit-rate observation or win-rate.',
  seed: SEED, sampleWaves, densities: [4, 8], towerBusy: .8, brazierNear: .6, repairBudgetShare: .15,
  acquireSecondsPerCounter: 1.2, weakpointAccuracy: .75, grenadeFirstThrowSeconds: 12,
  referenceBossEffectiveHp: 1.3,
  warning: 'The old economy model supplies buying choices only. Its continuous-grenade DPS and cannon x0.8 are replaced below. Income assumes every listed enemy is killed and a clean-wave fraction from SKILLS.',
};

function spec(w: number, n: number, approved: boolean) {
  const p = planWave(w, n, SEED, undefined, approved ? SIEGE_FEATURES : undefined);
  const spawns = p.spawns.map((s) => ({ kind: s.kind, count: 1, hp: budgetHp(s.kind, s.tier, w, n, p.hpScale, p.siegeHpScale), rank: s.tier }));
  for (const b of p.boats) for (let i = 0; i < b.crew.length; i++) spawns.push({ kind: b.crew[i], count: 1,
    hp: budgetHp(b.crew[i], b.tiers[i], w, n, p.hpScale, p.siegeHpScale), rank: b.tiers[i], ...{ crew: true } });
  if (p.boss >= 0) spawns.push({ kind: p.boss, count: 1, hp: p.bossHp * assumptions.referenceBossEffectiveHp, rank: 0 });
  if (p.kraken) {
    spawns.push({ kind: Z_TENTACLE, count: TENT_COUNT, hp: W.krakenHp(W.TENTACLE_BASE_HP, w, n) * 1.3, rank: 0 });
    spawns.push({ kind: Z_KRAKEN, count: 1, hp: W.krakenHp(W.KRAKEN_HEAD_BASE_HP, w, n) * 1.3, rank: 0 });
  }
  return { spawns, seconds: W.releaseSeconds(w), boats: p.boats.length };
}
const director: Director = (w, n) => spec(w, n, true);
const oldDirector: Director = (w, n) => spec(w, n, false);

function power(kit: Kit, skill: Skill, crowd: number, wave: number) {
  const player = powerOf(kit, { ...skill, crowd }, 60).player;
  const team = A.dmgMul(kit.lv[A.UP_DMG]);
  let towers = 0;
  for (const slot of kit.slots) {
    if (slot.type < 0) continue;
    const t = A.TOWERS[slot.type];
    const mul = A.towerMul(slot.level, team) * slot.share * assumptions.towerBusy;
    if (slot.type === A.TW_BALLISTA) towers += t.dmg * TICK_RATE / t.every * mul;
    if (slot.type === A.TW_CANNON) towers += t.dmg * TICK_RATE / t.every * mul * crowd;
    if (slot.type === A.TW_TAR) towers += t.dmg * (A.TAR_TICKS / t.every) * mul * crowd;
    if (slot.type === A.TW_BRAZIER) towers += t.dmg * assumptions.brazierNear * mul * crowd;
  }
  const grenades = Math.min(A.grenadeMax(kit.lv[A.UP_POUCH]), (wave === 1 ? A.GREN_START : A.GREN_PER_WAVE) + (skill.buysGrenades ? A.GREN_BUY : 0));
  return { player, towers, grenades, grenadeDamage: A.GREN_DMG * team * crowd };
}

/** Extra work removes only one human's manual fire. Towers keep firing; grenades are finite and delayed by work. */
function workSeconds(hp: number, n: number, p: ReturnType<typeof power>, jobs: number): number {
  const shots: number[] = [];
  for (let human = 0; human < n; human++) for (let i = 0; i < p.grenades; i++) {
    let t = assumptions.grenadeFirstThrowSeconds + i * A.GREN_CD / TICK_RATE;
    if (human === 0 && t >= 8 && t < 8 + jobs) t = 8 + jobs + i * A.GREN_CD / TICK_RATE;
    shots.push(t + A.GREN_FUSE / TICK_RATE);
  }
  const damage = (t: number) => n * (p.player + p.towers) * t - p.player * Math.max(0, Math.min(jobs, t - 8))
    + shots.filter((s) => s <= t).length * p.grenadeDamage;
  let lo = 0, hi = 3600;
  for (let i = 0; i < 45; i++) { const mid = (lo + hi) / 2; if (damage(mid) < hp) lo = mid; else hi = mid; }
  return hi;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function balanceRows() {
  const rows = [];
  for (const n of [1, 2, 4]) for (const skillId of ['newbie', 'experienced', 'master'] as const) {
    const skill = SKILLS[skillId];
    const paid = simulate(director, n, skill, 100);
    const previous = simulate(oldDirector, n, skill, 100);
    for (const w of sampleWaves) {
      const p = planWave(w, n, SEED, undefined, SIEGE_FEATURES);
      const gear = paid.rows[w - 1], oldGear = previous.rows[w - 1];
      const hp = spec(w, n, true).spawns.reduce((sum, s) => sum + s.hp * s.count, 0);
      const oldHp = spec(w, n, false).spawns.reduce((sum, s) => sum + s.hp * s.count, 0);
      const hitTime = A.gunIntervalQ(A.GUN_MARKER, gear.lv[A.UP_RATE]) / 4 / TICK_RATE / assumptions.weakpointAccuracy;
      const counterTime = (hits: number) => assumptions.acquireSecondsPerCounter + hits * hitTime;
      let jobs = 0;
      for (const z of p.spawns) if (z.kind >= S.Z_ROPECRAB) jobs += counterTime(z.kind === S.Z_CANOPY ? 1
        : z.kind === S.Z_JAMPUMP ? 2 : [S.Z_FOREMAN, S.Z_BATTERY, S.Z_SIEGE_TOWER].includes(z.kind) ? 4 : 3);
      if (p.boats.some((b) => b.anchor)) jobs += counterTime(3);
      if (p.event === W.EV_METEORS) jobs += counterTime(S.meteorHits(n)) * S.SIEGE_METEOR_COUNT;
      let counterHp = hp, ignoredHp = hp;
      if (p.boss === S.Z_CRABCRANE || p.boss === S.Z_MILLER) {
        const closed = p.boss === S.Z_MILLER ? 7.2 : 5.2;
        const normal = (closed + 3) / (closed * BOSS_ARMOR + 3);
        const rage = (2 * closed + 3) / (2 * closed * BOSS_ARMOR + 3);
        ignoredHp = hp - p.bossHp * 1.3 + p.bossHp * (normal + rage) / 2;
        const answer = counterTime(3);
        counterHp = hp - p.bossHp * 1.3 + p.bossHp * (answer + 3) / (answer * BOSS_ARMOR + 3);
        jobs += Math.ceil(W.releaseSeconds(w) / (answer + 3)) * answer;
      }
      for (const crowd of assumptions.densities) {
        const pow = power(gear, skill, crowd, w), oldPow = power(oldGear, skill, crowd, w);
        const counter = workSeconds(counterHp, n, pow, jobs);
        const repair = workSeconds(counterHp, n, pow, jobs + S.REPAIR_WORK_TICKS / TICK_RATE);
        const budget = gear.income * n * assumptions.repairBudgetShare;
        const physical = Math.max(0, Math.floor((repair - S.REPAIR_WORK_TICKS / TICK_RATE) / ((S.REPAIR_WORK_TICKS + S.REPAIR_COOLDOWN_TICKS) / TICK_RATE)) + 1);
        const financial = Math.floor(budget / A.repairPrice(w));
        rows.push({ n, w, skill: skillId, crowd, bodies: p.spawns.length + p.boats.reduce((s, b) => s + b.crew.length, 0),
          newKinds: p.spawns.filter((s) => s.kind >= S.Z_ROPECRAB).map((s) => ZK[s.kind].name),
          boss: p.boss >= 0 ? ZK[p.boss].name : null, event: p.event,
          oldWorkSeconds: round(workSeconds(oldHp, n, oldPow, 0)), counterWorkSeconds: round(counter),
          counterAndRepairSeconds: round(repair), ignoreWorkSeconds: round(workSeconds(ignoredHp, n, pow, 0)),
          extraPersonSeconds: round(jobs), manualDpsPerHuman: round(pow.player), towerDpsPerHuman: round(pow.towers),
          grenadeStockTeam: pow.grenades * n, incomePerHuman: round(gear.income), repairGoldBudgetTeam: round(budget),
          affordableGateRepairs: financial, timeLimitedGateRepairs: physical, gateRepairs: Math.min(physical, financial),
          maxGateRepairHpPerSecond: A.gateMax(A.GATE_TIERS) * .25 * TICK_RATE / (S.REPAIR_WORK_TICKS + S.REPAIR_COOLDOWN_TICKS),
          championBruteGateDps: round(ZK[Z_BRUTE].gateDps * W.waveDmgMul(w) * W.TIER_DMG[2]),
          meteorShotCost: S.meteorHits(n), meteorGateDamage: S.SIEGE_METEOR_GATE,
          artilleryVolleyDamage: round(S.BATTERY_GATE_DAMAGE * W.waveDmgMul(w)),
          markerHitSeconds: round(hitTime), repairCost: A.repairPrice(w), initialGateHp: A.gateMax(0), maxGateHp: A.gateMax(A.GATE_TIERS) });
      }
    }
  }
  return rows;
}

export function priorityBodyAudit() {
  let minOldBodyShare = 1, minTeamRatio = Infinity, maxBudgetError = 0;
  let largestFixed = { share: 0, w: 0, n: 0, seed: 0 };
  for (let seed = 1; seed <= 60; seed++) for (let w = 1; w <= 100; w++) {
    const solo = planWave(w, 1, seed, undefined, SIEGE_FEATURES);
    for (const n of [1, 2, 4]) {
      const p = n === 1 ? solo : planWave(w, n, seed, undefined, SIEGE_FEATURES);
      const ordinary = p.spawns.filter((s) => s.kind < S.Z_ROPECRAB).length;
      minOldBodyShare = Math.min(minOldBodyShare, ordinary / p.spawns.length);
      const body = (kind: number, tier: number) => budgetHp(kind, tier, w, n, p.hpScale, p.siegeHpScale);
      const priorityHp = p.spawns.filter((s) => s.kind >= S.Z_ROPECRAB).reduce((sum, s) => sum + body(s.kind, s.tier), 0);
      const total = p.spawns.reduce((sum, s) => sum + body(s.kind, s.tier), 0)
        + p.boats.reduce((sum, b) => sum + b.crew.reduce((hp, k, i) => hp + body(k, b.tiers[i]), 0), 0);
      const target = W.waveHpPerDefender(w) * n * W.teamPressure(n) * W.teamEarlyBoost(w, n) * (p.kraken ? .5 : p.boss >= 0 ? .6 : 1);
      maxBudgetError = Math.max(maxBudgetError, Math.abs(total / target - 1));
      if (priorityHp / target > largestFixed.share) largestFixed = { share: priorityHp / target, w, n, seed };
      if (n === 4) minTeamRatio = Math.min(minTeamRatio, p.siegeHpScale! * S.siegeBodyMul(S.Z_CANOPY, n) / solo.siegeHpScale!);
    }
  }
  const bodies = [];
  for (const w of [6, 8, 9, 12, 14, 16, 19, 31, 40, 45, 58, 70, 76, 78, 98]) for (const n of [1, 2, 4]) {
    const p = planWave(w, n, SEED, undefined, SIEGE_FEATURES);
    bodies.push({ w, n, boss: p.boss < 0 ? null : ZK[p.boss].name, bossHp: round(p.bossHp),
      ordinaryBodies: p.spawns.filter((s) => s.kind < S.Z_ROPECRAB).length,
      priority: p.spawns.filter((s) => s.kind >= S.Z_ROPECRAB).map((s) => ({ kind: s.kind, name: ZK[s.kind].name, tier: s.tier,
        hp: round(budgetHp(s.kind, s.tier, w, n, p.hpScale, p.siegeHpScale)) })) });
  }
  return { plans: 18000, seeds: [1, 60], defenders: [1, 2, 4], waves: [1, 100],
    minOldBodyShare, minTeamRatio, maxBudgetError, largestFixed, bodies };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify({ assumptions, feedback: priorityBodyAudit(), rows: balanceRows() }, null, 2));
}
