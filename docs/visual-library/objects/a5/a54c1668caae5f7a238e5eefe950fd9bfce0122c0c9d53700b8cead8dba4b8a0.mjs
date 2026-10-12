// Read-only source snapshot calculations. No game/server/browser is started.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { planWave, budgetHp } from '../../../game-opus/server/fort/director.ts';
import * as W from '../../../game-opus/shared/fortwaves.ts';
import * as A from '../../../game-opus/shared/fortarsenal.ts';
import { ZK, Z_WALKER, Z_BOAT, Z_KRAKEN, Z_TENTACLE } from '../../../game-opus/shared/fortkinds.ts';
import { TENT_COUNT } from '../../../game-opus/shared/fortkraken.ts';
import { SKILLS, simulate, sustainedDps } from '../../../game-opus/tools/fort-balance/model.ts';
import { director } from '../../../game-opus/tools/fort-balance/fort-director.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../../../game-opus');
const waves = [1, 10, 20, 40, 60, 80, 98, 100];
const teams = [1, 2, 4];
const SEEDS = 256;
const refs = ['shared/fortwaves.ts','shared/fortarsenal.ts','shared/fortkinds.ts','shared/fort.ts', 'server/fort/director.ts','server/fort/horde.ts','server/fort/game.ts','server/fort/arsenal.ts','tools/fort-balance/model.ts','tools/fort-balance/fort-director.ts'];
const round = (v, d=2) => Math.round(v * 10**d) / 10**d;
const stats = (xs) => { const a=xs.toSorted((x,y)=>x-y); return { min:round(a[0]), p10:round(a[Math.floor(.1*(a.length-1))]), median:round(a[Math.floor(.5*(a.length-1))]), p90:round(a[Math.floor(.9*(a.length-1))]), max:round(a.at(-1)) }; };
function work(plan) {
  const w=plan.w,n=plan.defenders;
  const land = plan.spawns.reduce((s,z)=>s+budgetHp(z.kind,z.tier,w,n,plan.hpScale),0);
  const cargo = plan.boats.reduce((s,b)=>s+b.crew.reduce((p,k,i)=>p+budgetHp(k,b.tiers[i],w,n,plan.hpScale),0),0);
  const hull = plan.boats.length * ZK[Z_BOAT].hp * plan.hpScale;
  // Exactly the old audit model's boss armor heuristic; NOT a real combat multiplier.
  const boss=plan.bossHp*1.3;
  const kraken=plan.kraken ? (W.krakenHp(W.KRAKEN_HEAD_BASE_HP,w,n)+TENT_COUNT*W.krakenHp(W.TENTACLE_BASE_HP,w,n))*1.3 : 0;
  return {land,cargo,hull,boss,kraken,scheduled:land+cargo+boss+kraken,intercept:land+hull+boss+kraken};
}
function averageIncome(plan, cleanProbability, allBoatsIntercepted=true, rush=1) {
  let shooter=0;
  for(const z of plan.spawns) shooter+=A.killBounty(z.kind,plan.w,z.tier);
  for(const b of plan.boats) b.crew.forEach((k,i)=>shooter+=A.killBounty(k,plan.w,b.tiers[i],true));
  if(plan.boss>=0) shooter+=A.killBounty(plan.boss,plan.w);
  if(plan.kraken) shooter+=A.killBounty(Z_KRAKEN,plan.w);
  const weighted=.6+.4*(1+.5*cleanProbability);
  const boatGold=allBoatsIntercepted ? plan.boats.length*A.BOAT_BOUNTY*A.bountyMul(plan.w)*rush : 0;
  return shooter/.6*weighted*rush/plan.defenders+A.waveBonus(plan.w)+boatGold/plan.defenders;
}
const matrix=[];
for(const n of teams) for(const w of waves) {
  const sample=[];
  for(let seed=1;seed<=SEEDS;seed++) {
    const p=planWave(w,n,seed),hp=work(p);
    sample.push({count:p.spawns.length+p.boats.reduce((s,b)=>s+b.crew.length,0),landCount:p.spawns.length, boats:p.boats.length,cargoCount:p.boats.reduce((s,b)=>s+b.crew.length,0),hpScale:p.hpScale,walkerHp:60*p.hpScale, scheduled:hp.scheduled,intercept:hp.intercept,saving:(hp.scheduled-hp.intercept)/hp.scheduled,seaSaving:hp.cargo ? (hp.cargo-hp.hull)/hp.cargo : 0,cargoShare:hp.cargo/hp.scheduled,incomeClean:averageIncome(p,1),incomeNotClean:averageIncome(p,0),bubbleToWalkerRatio:100*W.waveHpMul(w)/(60*p.hpScale),event:p.event,boss:p.boss,bossHp:p.bossHp});
  }
  const result={n,w,releaseSeconds:W.releaseSeconds(w),bodyCap:W.bodyCap(n),liveCap:60,teamPressure:round(W.teamPressure(n),4),teamEarly:round(W.teamEarlyBoost(w,n),4),dmgMul:round(W.waveDmgMul(w),4),waveTokens:W.waveTokens(w),sampleSeeds:SEEDS, boss:sample[0].boss,bossHp:round(sample[0].bossHp)};
  for(const key of ['count','landCount','boats','cargoCount','hpScale','walkerHp','scheduled','intercept','saving','seaSaving','cargoShare','incomeClean','incomeNotClean','bubbleToWalkerRatio']) result[key]=stats(sample.map(x=>x[key]));
  matrix.push(result);
}

const trajectories=[];
for(const n of teams) for(const key of ['newbie','experienced','master']) {
  const run=simulate(director,n,SKILLS[key],100);
  trajectories.push({n,skill:key,firstArithmeticMarginBelow1:run.wall,rows:run.rows.filter(r=>waves.includes(r.wave)).map(r=>{
    const p=planWave(r.wave,n,12345),hp=work(p),gap=hp.scheduled-hp.intercept;
    return {w:r.wave,lv:r.lv,gun:r.gun,slots:r.slots,power:{player:round(r.power.player),towers:round(r.power.towers),grenades:round(r.power.grenades),total:round(r.power.total)},oldModelMargin:round(r.margin,3),oldModelIncome:round(r.income),actualFormulaAverageIncome:round(averageIncome(p,SKILLS[key].clean)),modelIncomeBoatGrowthOmission:round(p.boats.length*A.BOAT_BOUNTY*(A.bountyMul(r.wave)-1)/n),effectiveWorkSecondsScheduled:round(hp.scheduled/(n*r.power.total)),effectiveWorkSecondsAllBoatsIntercepted:round(hp.intercept/(n*r.power.total)),cargoSaving:round(gap),goldAfterOldModelPurchases:round(r.gold)};
  })});
}
const presets=[
  {name:'novice',label:'Старт: куплен урон I, маркер, без башен',lv:[1,0,0,0,0],gun:0},
  {name:'mid',label:'Средний комплект: урон VIII, темп IV, магазин III, крит III, арбалет',lv:[8,4,3,3,1],gun:2},
  {name:'advanced',label:'Поздний комплект для стенда: урон XVII, темп VIII, магазин VI, крит VIII, арбалет',lv:[17,8,6,8,3],gun:2},
  {name:'legal_max',label:'Математический максимум, НЕ достижимая экипировка обычного забега',lv:[60,8,6,8,3],gun:2}
].map(p=>({...p,damageMultiplier:round(A.dmgMul(p.lv[0]),3),sustainedBodyDps:round(sustainedDps(p.gun,p.lv)),sustainedBodyDpsMG:round(sustainedDps(3,p.lv)),upgradeCost:p.lv.reduce((s,max,line)=>s+Array.from({length:max},(_,t)=>A.upgradePrice(line,t)).reduce((a,b)=>a+b,0),0)+A.GUNS[p.gun].price}));

const currentTeamFacts=teams.map(n=>({n,teamCountMul:W.teamCountMul(n),teamHpMul:W.teamHpMul(n),teamPressure:W.teamPressure(n),teamWaveHpFactor:n*W.teamPressure(n),bossFactor:W.bossTeamMul(n),bodyCap:W.bodyCap(n),alivePerDefender:60/n}));
const tokenBase=Array.from({length:100},(_,i)=>W.waveTokens(i+1)).reduce((a,b)=>a+b,0);
const normalBreakTotal=Array.from({length:99},(_,i)=>W.breakSecondsAfter(i+1)).reduce((a,b)=>a+b,0);
const output={generatedAt:new Date().toISOString(),sourceRoot:root,sourceHashes:Object.fromEntries(refs.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),method:{seedCount:SEEDS,arithmeticModelSeed:12345,scheduledIncludes:'Director armor-budget health of land + all crew + boss/kraken x1.3 assumption; hull not included unless intercepted.',interceptIncludes:'Same land + boat normal hull HP instead of full crew HP; assumes every boat killed before any unload.',exclusions:['Healing','Bubble/barrel/meteor friendly damage','Boss summons/regrowing tentacles','Geometric LOS and aim','Movement and reload transitions','Alive cap queue timing','Actual repairs and respawns','Per-person unequal gold','Live players and win rates'],notGameplayEvidence:true},currentTeamFacts,matrix,trajectories,presets,economy:{baseTokensAll100:tokenBase,normalBreakSeconds99:normalBreakTotal,earliestReadyBreakSeconds:99*3,maxGateHp:A.gateMax(8),maxCrystalHp:A.crystalMax(5),wave100GateRepairPrice:A.repairPrice(100),wave100GateRepairHp:A.gateMax(8)*.25,wave100CrystalRepairPrice:A.crystalHealPrice(100),wave100CrystalRepairHp:A.crystalMax(5)*.1}};
fs.writeFileSync(path.join(dir,'./balance-data.json'),JSON.stringify(output,null,2)+'\n');
const lines=['# Deterministic source calculations (not gameplay)','', '|N|W|bodies median|boats/crew|walker HP median|scheduled work|all boats intercepted|saving|clean gold/person|', '|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
for(const r of matrix) lines.push(`|${r.n}|${r.w}|${r.count.median}|${r.boats.median}/${r.cargoCount.median}|${r.walkerHp.median}|${r.scheduled.median}|${r.intercept.median}|${round(r.saving.median*100)}%|${r.incomeClean.median}|`);
lines.push('','## Old economy trajectory assumptions','', '|N|skill|W|lv dmg/rate/mag/crit/pouch|gun|player/tower/grenade DPS|scheduled/intercept seconds|old margin|', '|---:|---|---:|---|---:|---|---|---:|');
for(const t of trajectories) for(const r of t.rows) lines.push(`|${t.n}|${t.skill}|${r.w}|${r.lv.join('/')}|${r.gun}|${r.power.player}/${r.power.towers}/${r.power.grenades}|${r.effectiveWorkSecondsScheduled}/${r.effectiveWorkSecondsAllBoatsIntercepted}|${r.oldModelMargin}|`);
fs.writeFileSync(path.join(dir,'./tables.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({written:['./balance-data.json','./tables.md'],rows:matrix.length,trajectories:trajectories.map(t=>({n:t.n,skill:t.skill,firstArithmeticMarginBelow1:t.firstArithmeticMarginBelow1,w100:t.rows.at(-1)})),presets,economy:output.economy},null,2));
