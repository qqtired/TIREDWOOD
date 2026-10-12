import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {solve} from './work-model.mjs';
import {ScenarioRun,SCENARIOS} from './scenarios.mjs';
import {TACTIC_FOR_SCENARIO} from './scenario-tactics.mjs';
const ROOT=path.resolve(import.meta.dirname,'..');
const GAME='[LOCAL_PATH]';
const baseline=JSON.parse(fs.readFileSync(path.join(ROOT,'../../../../v1/analysis/balance-data.json'),'utf8'));
for(const [file,want]of Object.entries(baseline.sourceHashes)){const got=crypto.createHash('sha256').update(fs.readFileSync(path.join(GAME,file))).digest('hex');assert.equal(got,want,'Baseline drift: '+file);}
const A=await import(pathToFileURL(path.join(GAME,'shared/fortarsenal.ts')));
const W=await import(pathToFileURL(path.join(GAME,'shared/fortwaves.ts')));
const K=await import(pathToFileURL(path.join(GAME,'shared/fortkinds.ts')));
const M=await import(pathToFileURL(path.join(GAME,'tools/fort-balance/model.ts')));
const NUM=v=>Number(v.toFixed(3));

// These are deliberate scenario assumptions. They are editable inputs, not observed players.
export const ASSUMPTIONS={towerBusy:.8,brazierNear:.6,returnToFrontSeconds:5,repairBudgetShare:.15,repairChannel:4,repairPauseAfterCompletion:8,repairInterruptedExtraSeconds:0,eventStart:12,eventSeconds:18};
export function power(kit,skill,crowd,wave,busy=ASSUMPTIONS.towerBusy){
 const s={...skill,crowd};const p=M.powerOf(kit,s,60);const team=A.dmgMul(kit.lv[A.UP_DMG]);let tower=0;const byType={ballista:0,cannon:0,tar:0,brazier:0};
 for(const slot of kit.slots){if(slot.type<0)continue;const spec=A.TOWERS[slot.type],mul=A.towerMul(slot.level,team)*slot.share*busy;let d=0;
  if(slot.type===A.TW_BALLISTA)d=spec.dmg*60/spec.every*mul;
  if(slot.type===A.TW_CANNON)d=spec.dmg*60/spec.every*mul*crowd; // Actual areaDamage applies full damage; old 0.8 removed.
  if(slot.type===A.TW_TAR)d=spec.dmg*crowd*(A.TAR_TICKS/spec.every)*mul;
  if(slot.type===A.TW_BRAZIER)d=spec.dmg*crowd*ASSUMPTIONS.brazierNear*mul; // No invented extra 1.5 burn multiplier.
  tower+=d;byType[['ballista','cannon','tar','brazier'][slot.type]]+=d;
 }
 const grenadeCount=Math.min(A.grenadeMax(kit.lv[A.UP_POUCH]),(wave===1?A.GREN_START:A.GREN_PER_WAVE)+(skill.buysGrenades?A.GREN_BUY:0));
 return {player:p.player,towers:tower,crowd,grenadeCount,grenadeDamagePerTarget:A.GREN_DMG*team,byType};
}

const tactics=[
 {id:'old_assumptions',name:'Старые коэффициенты башен; конечные гранаты',crowd:null,suppression:0,jobs:0,deaths:0,eventSeconds:0,old:true},
 {id:'one_point',name:'Держать плотную точку',crowd:4,suppression:0,jobs:0,deaths:0,eventSeconds:0},
 {id:'dense',name:'Очень плотная группа: 8 целей AoE',crowd:8,suppression:0,jobs:0,deaths:0,eventSeconds:0},
 {id:'one_down',name:'Одна гибель + путь к фронту',crowd:4,suppression:0,jobs:0,deaths:1,eventSeconds:0},
 {id:'two_repairs',name:'План: до двух работ ремонта',crowd:4,suppression:0,jobs:8,deaths:0,eventSeconds:0}
];
const effects={spread_ignore:{crowd:1.5,eventSeconds:18},spread_counter:{crowd:2.75,eventSeconds:10},spread_split:{crowd:1.5,eventSeconds:10},spread_trap:{crowd:2.75,eventSeconds:8},pump_ignore:{suppression:.25,eventSeconds:13},pump_smash:{suppression:.25,eventSeconds:1.5},pump_wash:{suppression:.25,eventSeconds:5},pump_redirect:{crowd:5,suppression:.125,eventSeconds:6},gate_trap:{crowd:6,suppression:1,eventSeconds:8},battery_ballista:{ballistaDiversion:true,eventSeconds:8}};
for(const def of SCENARIOS)for(const action of [null,...def.actions]){const id=TACTIC_FOR_SCENARIO[def.id][action?.id??'ignore'];tactics.push({id,name:def.name+': '+(action?.name??'принять угрозу'),scenario:def.id,action:action?.id??null,first:def.first,crowd:4,suppression:0,jobs:0,deaths:0,eventSeconds:0,...effects[id]});}
const rows=[];
for(const n of[1,2,4])for(const w of[1,10,20,40,60,98,100])for(const skillId of['newbie','experienced','master']){
 const census=baseline.matrix.find(r=>r.n===n&&r.w===w),gear=baseline.trajectories.find(t=>t.n===n&&t.skill===skillId).rows.find(r=>r.w===w),skill=M.SKILLS[skillId];
 const regular=power(gear,skill,4,w);
 for(const tactic of tactics){
  const crowd=tactic.id==='spread_counter'&&n===1?4:tactic.crowd??skill.crowd;let normal={...regular},event=power(gear,skill,crowd,w);event.towers*=1-tactic.suppression;
  const lab=tactic.scenario?new ScenarioRun(tactic.scenario,n,{wave:w}):null;if(lab){lab.seek(lab.def.decisionAt);if(tactic.action)lab.choose(tactic.action);lab.seek(lab.def.total);}const outcome=lab?.snapshot();
  let jobs=outcome?.cost.personSeconds??tactic.jobs;const prepSeconds=tactic.scenario==='forge'?jobs:0;if(prepSeconds)jobs=0;
  const ballistaAvailable=gear.slots.some(s=>s.type===A.TW_BALLISTA);if(tactic.ballistaDiversion&&ballistaAvailable){const active=gear.slots.filter(s=>s.type===A.TW_BALLISTA),one=Math.max(...active.map(s=>A.TOWERS[A.TW_BALLISTA].dmg*60/A.TOWERS[A.TW_BALLISTA].every*A.towerMul(s.level,A.dmgMul(gear.lv[A.UP_DMG]))*s.share*ASSUMPTIONS.towerBusy));event.towers=Math.max(0,event.towers-one);}
  if(tactic.old){normal={...regular,player:gear.power.player,towers:gear.power.towers,crowd:skill.crowd};event={...normal};}
  else if(tactic.id==='one_point'||tactic.id==='dense'){normal=event;}
  const result=solve({hp:census.intercept.median,n,regular:normal,event,eventStart:ASSUMPTIONS.eventStart,eventSeconds:tactic.eventSeconds,jobs,deaths:tactic.deaths,returnSeconds:ASSUMPTIONS.returnToFrontSeconds,grenadeCooldown:A.GREN_CD/60,grenadeFuse:A.GREN_FUSE/60,holdTwoForGate:tactic.id==='gate_trap',jobAllowsGrenades:tactic.id==='gate_trap'});
  const clean=tactic.deaths===0;const income=(clean?census.incomeClean:census.incomeNotClean).median;
  for(const structures of['base','max']){
   const gateHp=structures==='max'?A.gateMax(A.GATE_TIERS):A.gateMax(0),crystalHp=structures==='max'?A.crystalMax(A.CRYSTAL_TIERS):A.crystalMax(0),gateHeal=gateHp*.25,crystalHeal=crystalHp*.1;
   const goldSpent=outcome?.cost.goldSpent??0,gold=Math.max(0,income*n*ASSUMPTIONS.repairBudgetShare-goldSpent);
   const period=ASSUMPTIONS.repairChannel+ASSUMPTIONS.repairPauseAfterCompletion;
   const timeRepairs=Math.max(0,Math.floor((result.seconds-ASSUMPTIONS.repairChannel)/period)+1);
   const moneyGate=Math.floor(gold/A.repairPrice(w)),moneyCrystal=Math.floor(gold/A.crystalHealPrice(w));
   const gateCount=Math.min(timeRepairs,moneyGate),crystalCount=Math.min(timeRepairs,moneyCrystal);
   const tier=w>=20?2:w>=6?1:0,brutePossible=w>=K.ZK[K.Z_BRUTE].first;const bruteGateDps=brutePossible?K.ZK[K.Z_BRUTE].gateDps*W.waveDmgMul(w)*W.TIER_DMG[tier]:0;
   const unavailable=w<(tactic.first??1)?'Открывается на '+tactic.first:tactic.id==='gate_trap'&&regular.grenadeCount<2?'Нужны 2 гранаты; в этой траектории запас '+regular.grenadeCount:((tactic.id==='battery_ballista'||tactic.id==='forge_bolts')&&!ballistaAvailable)?'В оплаченной конфигурации нет баллисты':null;
   rows.push({n,w,skill:skillId,tactic:tactic.id,structures,seconds:NUM(result.seconds),workHp:census.intercept.median,personalDps:NUM(normal.player),towerDps:NUM(normal.towers),grenadeStockPerDefender:regular.grenadeCount,grenadeStockTeam:result.grenadeStockTeam,grenadesThrown:result.grenadesThrown,grenadesExploded:result.grenadesExploded,grenadeDamage:NUM(result.grenadeDamage),eventCrowd:crowd,eventTowerSuppression:tactic.suppression,extraPersonSeconds:NUM(result.extraPersonSeconds),prepSeconds,goldSpent,available:!unavailable,unavailable,ballistaAvailable,guideOutcome:outcome?.outcome??null,guideDamageGateHp:NUM((1-(outcome?.gateHp??1))*gateHp),guideDamageTowerFraction:NUM(1-(outcome?.turretHp??1)),guidePassed:outcome?.passed??0,guideBoarded:outcome?.boarded??0,grateChargesSpent:outcome?.cost.grateChargesSpent??0,guideGrenadesSpent:outcome?.cost.grenadesSpent??0,futureRepairBonus:outcome?.cost.repairChargesAdded??0,futureGrenadeBonus:outcome?.cost.grenadesAdded??0,incomePerDefender:income,clean,repairBudgetTeam:NUM(gold),gateHp,crystalHp,gateHeal,crystalHeal,gatePrice:A.repairPrice(w),crystalPrice:A.crystalHealPrice(w),financialGateRepairs:moneyGate,financialCrystalRepairs:moneyCrystal,physicalRepairs:timeRepairs,channelGateRepairHp:gateCount*gateHeal,channelCrystalRepairHp:crystalCount*crystalHeal,stockGateRepairHp:Math.min(gateCount,1+n)*gateHeal,stockCrystalRepairHp:Math.min(crystalCount,1+n)*crystalHeal,maxGateRepairHpPerSecond:NUM(gateHeal/period),maxCrystalRepairHpPerSecond:NUM(crystalHeal/period),oneBruteGateDps:NUM(bruteGateDps),oneBruteSecondsToGate:bruteGateDps?NUM(gateHp/bruteGateDps):null,repairCountsAreAlternatives:true,repairCountsAreDedicatedOperatorUpperBounds:true});
  }
 }
}
const data={generatedAt:new Date().toISOString(),baseline:'62f814f',sourceHashes:baseline.sourceHashes,assumptions:{...ASSUMPTIONS,grenadeStart:12,grenadeCooldown:A.GREN_CD/60,grenadeFuse:A.GREN_FUSE/60,grenadeSupply:'wave1 start2; later1 + bought2 for master, capped by pouch; no carry/refill during arithmetic window'},mapping:TACTIC_FOR_SCENARIO,tactics,rows,method:{type:'bounded arithmetic work sensitivity and repair capacity; NOT clear-time or victory simulation',income:'source median256fixedplans;15% projected team waveincome repair reserve minus forge cost, not guaranteed starting cash',gear:'frozen old economy trajectory; new economy trajectory after failures not simulated',changes:['Actual cannon and grenade full AoE; no inherited0.8/average EDGE factor','Finite grenade count, cooldown and fuse; unavailable owners defer throws','Explicit manual outages; autonomous towers continue','Eight event choices: work, preparation, gold, stock, structural consequences and availability','Repair money and4+8physical limits separate;1+nstock alternative'],limitations:['Density/coverage are scenario inputs, not actual measured targets','EffectiveHP retains old armour/bosswork assumptions','No pathing/spawn queue/structure damage integrated over the whole wave; seconds is work sensitivity ONLY','Guide damage/boarding from small deterministic 3D group, not scaled whole-wave forecast','Future stores bonuses not secretly added to current DPS or repairs','No clean-loss feedback into subsequent purchases','Repair gate/crystal dedicated-operator bounds share money/time, not additive; only two_repairs includes repair work in wave work','Unavailable event rows are exploratory counterfactuals, not feasible strategy promises','Roman98gear/position/latency unknown; no winrate/playtest']} };
assert.equal(rows.length,3*7*3*tactics.length*2);for(const row of rows){for(const value of Object.values(row))if(typeof value==='number')assert(Number.isFinite(value));assert(row.stockGateRepairHp<=row.channelGateRepairHp);assert(row.grenadesThrown<=row.grenadeStockTeam);assert(row.grenadesExploded<=row.grenadesThrown);}
for(const n of[1,2,4])for(const w of[1,10,20,40,60,98,100])for(const skill of['newbie','experienced','master']){const find=t=>rows.find(r=>r.n===n&&r.w===w&&r.skill===skill&&r.tactic===t&&r.structures==='max');assert(find('one_down').seconds>=find('one_point').seconds);assert(find('dense').seconds<=find('one_point').seconds);}
fs.writeFileSync(path.join(ROOT,'../data/tactics-v2.json'),JSON.stringify(data,null,2));
let md='# V2 — совместная чувствительность тактик\n\nАрифметическая чувствительность работы, не время зачистки/победы и не плейтест. Старые оплаченные ступени, 256 составов на опорный случай. Гранаты конечны; учитываются cooldown/fuse/занятость владельца. Восемь событий связаны с ценой, подготовкой и малыми сценарными последствиями, не экстраполированными на всю волну. На события отводится конкретная часть времени; снижение плотности не применяется ко всей волне молча. Ремонт ворот/кристалла не складывать: общие деньги и время игроков.\n\n|N|W|Траектория|Тактика|Работа,с|Доп.работа человеко-сек|Личный DPS|Башни DPS|Доход/person|Денег на gate repairs|Физически за4+8с|Строгий cap1+n|\n|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n';
for(const row of rows.filter(r=>r.skill==='master'&&r.structures==='max'&&[10,40,98].includes(r.w)&&['one_point','dense','spread_ignore','spread_counter','pump_ignore','pump_redirect','gate_trap','one_down','two_repairs'].includes(r.tactic)))md+=`|${row.n}|${row.w}|${row.skill}|${row.tactic}|${row.seconds}|${row.extraPersonSeconds}|${row.personalDps}|${row.towerDps}|${row.incomePerDefender}|${row.financialGateRepairs}|${row.physicalRepairs}|${1+row.n}|\n`;
md+='\nНепрерывный ремонт полностью укреплённых ворот по предложению — 100HP/с, кристалла41.667HP/с; даже один чемпион-бугай98-й даёт308.25HP/с, если всё время бьёт. Это пример локальной угрозы, не утверждение, что такой бугай действительно проживёт весь этот срок.\n';
fs.writeFileSync(path.join(ROOT,'../TACTICS.md'),md);
console.log(JSON.stringify({rows:rows.length,sourceHashesChecked:Object.keys(baseline.sourceHashes).length,output:'../../../data/tactics-v2.json',notPlaytest:true}));
