// Read-only runtime extraction and controlled weapon traces. Node 24 required. This is not a playtest.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const GAME='[LOCAL_PATH]';
const {D,LV,MOB_KINDS}=await import(pathToFileURL(join(GAME,'shared/dungeon/data.ts')));
const {createRun}=await import(pathToFileURL(join(GAME,'shared/dungeon/sim.ts')));
const {startWave}=await import(pathToFileURL(join(GAME,'shared/dungeon/director.ts')));
const {spawnBosses}=await import(pathToFileURL(join(GAME,'shared/dungeon/boss.ts')));
const {buildGrid,makeMob,hurtMob}=await import(pathToFileURL(join(GAME,'shared/dungeon/core.ts')));
const {stepWeapons,ownMarkHit}=await import(pathToFileURL(join(GAME,'shared/dungeon/weapons.ts')));
const doc=JSON.parse(readFileSync(join(GAME,'docs/survivors/design-data.json'),'utf8'));
// gen-design intentionally omits prose, balanceModel/model and historical snapshots. Every retained field must match.
function assertRetained(runtime,source,path='D'){
 if(runtime&&typeof runtime==='object'){for(const [k,v]of Object.entries(runtime))assertRetained(v,source?.[k],path+'.'+k);}
 else if(runtime!==source)throw new Error('Retained runtime field differs: '+path);
}
assertRetained(D,doc);
copyFileSync(join(GAME,'docs/survivors/design-data.json'),join(ROOT,'source','./runtime-design-data.json'));
const mobs=Object.fromEntries(D.mobs.map(m=>[m.id,m]));
function unit(id){const m=mobs[id];return {hp:m.hp+(m.splitInto?mobs[m.splitInto.id].hp*m.splitInto.n:0),xp:m.xp+(m.splitInto?mobs[m.splitInto.id].xp*m.splitInto.n:0)};}
function runtimeWave(n){
 const sim=createRun(20261011);sim.noFx=true;startWave(sim,n);const w=sim.wave;
 const regular={};MOB_KINDS.forEach((id,i)=>{if(w.pend[i])regular[id]=w.pend[i];});
 const events=w.ev.map(e=>({...e,at:e.at/30}));const totals={...regular};
 for(const e of events)if(e.mob&&e.type!=='boss'&&e.type!=='horde'&&e.type!=='pressure')totals[e.mob]=(totals[e.mob]??0)+e.n;
 let hp=0,xp=0,bodies=0;for(const [id,count]of Object.entries(totals)){const u=unit(id);hp+=count*u.hp*w.hpMul;xp+=count*u.xp;bodies+=count;}
 let boss=null,bossFamily=null;if(n%10===0){spawnBosses(sim,n,w.dmgMul);const bs=sim.mobs.filter(m=>m.k==='povidl'||m.k==='cauldronmaster');boss=bs.reduce((sum,m)=>sum+m.hpMax,0);bossFamily=bs[0]?.k;}
 return {n,duration:(w.t1-w.t0)/30,hpMul:w.hpMul,dmgMul:w.dmgMul,minAlive:w.minAlive,regular,events,totals,bodies,hp:Math.round(hp),xp,mix:w.mix,boss,bossFamily};
}
const waves=Array.from({length:15},(_,i)=>runtimeWave(i+11));
const cases={
 single:{label:'Одна цель',desc:'Неподвижная элита в 4 м, R 0.8 м, без щита',positions:[[4,0,.8]]},
 bossBody:{label:'Открытый босс',desc:'Одна неподвижная крупная цель в 5 м, R 1.8 м; без щита/нырка/переходов',positions:[[5,0,1.8]]},
 column:{label:'Колонна',desc:'8 рядовых в линии от 3 до 12.1 м, R 0.35 м',positions:Array.from({length:8},(_,i)=>[3+i*1.3,(i%2?1:-1)*.25,.35])},
 surround:{label:'Вокруг',desc:'12 рядовых равномерно вокруг героя в 3.2 м, R 0.35 м',positions:Array.from({length:12},(_,i)=>[Math.cos(i*Math.PI/6)*3.2,Math.sin(i*Math.PI/6)*3.2,.35])},
 spread:{label:'Редкая стая',desc:'8 рядовых по кругу в 8–10 м, R 0.35 м',positions:Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4)*(8+i%3),Math.sin(i*Math.PI/4)*(8+i%3),.35])}
};
function trace(id,lv,evo,scenario,build=null){
 const sim=createRun(20261011);sim.noFx=true;sim.props=[];sim.items=[];sim.gems=[];sim.mobs=[];sim.bosses=[];sim.weapons=build?build.weapons.map(w=>({id:w.id,lv:7,evo:w.evolved?1:0,cd:0,t2:0})):[{id,lv,evo:evo?1:0,cd:0,t2:0}];sim.passives=build?Object.entries(build.passives).map(([id,lv])=>({id,lv})):[];sim.temper=build?.temper??0;
 sim.hero.x=120;sim.hero.z=120;sim.hero.vx=0;sim.hero.vz=0;sim.hero.dx=1;sim.hero.dz=0;
 for(const [x,z,r]of cases[scenario].positions){const m=makeMob(sim,'rat',120+x,120+z,1,1,0);m.hp=m.hpMax=1e9;m.r=r;m.spd=0;m.kx=m.kz=0;}
 let before=0;const warm=300,end=2100;
 for(sim.t=0;sim.t<end;sim.t++){
  buildGrid(sim);
  // Same burn cadence as mobs.ts; locomotion and AI deliberately absent from this controlled trace.
  for(const m of sim.mobs)if(m.burnT>sim.t&&(sim.t-m.burnT)%15===0)hurtMob(sim,m,m.burnD*.5,'lantern',m.x,m.z,0,0,0);
  stepWeapons(sim);
  let wr=0;for(const mk of sim.marks){if(mk.t1===sim.t&&mk.own)ownMarkHit(sim,mk);if(mk.t1>=sim.t)sim.marks[wr++]=mk;}sim.marks.length=wr;
  if(sim.t===warm-1)before=build?Object.values(sim.stats.dmg).reduce((a,b)=>a+b,0):sim.stats.dmg[id]??0;
 }
 const total=build?Object.values(sim.stats.dmg).reduce((a,b)=>a+b,0):sim.stats.dmg[id]??0;
 return +((total-before)/((end-warm)/30)).toFixed(2);
}
const traces=[];for(const w of D.weapons){for(const evo of [false,true]){const e=D.evolutions.find(e=>e.from===w.id);if(evo&&!e)continue;const result={id:w.id,name:evo?e.name:w.name,level:7,evolved:evo,dps:{}};for(const c of Object.keys(cases))result.dps[c]=trace(w.id,7,evo,c);traces.push(result);}}
const builds=[
 {id:'kite',name:'Кайт и ловушки',weapons:[{id:'lantern',evolved:true},{id:'embers',evolved:true},{id:'pickaxe',evolved:true},{id:'charges',evolved:true},{id:'spark',evolved:true}],passives:{might:5,cooldown:5,amount:2,speed:5,magnet:5},temper:5,tradeoff:'Пять готовых эволюций: сильнее погоня и связные стаи; 100 HP, без Каски/лечения/урона сверху. Пять катализаторов занимают все бонусные слоты.'},
 {id:'guard',name:'Защитный круг',weapons:[{id:'lantern',evolved:true},{id:'embers',evolved:true},{id:'fireflies',evolved:true},{id:'stalactites',evolved:true},{id:'beam',evolved:true}],passives:{might:5,maxhp:5,armor:5,cooldown:5,area:5},temper:5,tradeoff:'200 HP, броня, лечение Роя и Обвал; нет Сапог/Кремня/Подковы. Связные дальние цепи и бумеранги уступают место защите.'},
 {id:'range',name:'Дальний коридор',weapons:[{id:'lantern',evolved:true},{id:'embers',evolved:true},{id:'spark',evolved:true},{id:'stalactites',evolved:true},{id:'beam',evolved:true}],passives:{might:5,armor:5,area:5,cooldown:5,magnet:5},temper:5,tradeoff:'Достаёт стрелков и разные стороны; 100 HP, нет ускорения рывка/лечения/Шашек. На открытом боссе залп силён, но пять эволюций требуют пяти сундуков.'}
];
for(const b of builds){if(b.weapons.length>5||Object.keys(b.passives).length>5)throw Error('Illegal slots');for(const w of b.weapons)if(w.evolved&&!b.passives[D.evolutions.find(e=>e.from===w.id).with])throw Error('Missing catalyst');}
for(const b of builds){b.dps={};for(const c of Object.keys(cases))b.dps[c]=trace('',7,false,c,b);}
const files=['shared/dungeon/data.ts','shared/dungeon/weapons.ts','shared/dungeon/director.ts','shared/dungeon/boss.ts','shared/dungeon/cauldron.ts','shared/dungeon/expansion.ts','shared/dungeon/enemycharges.ts','shared/dungeon/mobs.ts','shared/dungeon/props.ts','shared/dungeon/pickups.ts','shared/dungeon/progress.ts','shared/dungeon/core.ts','shared/dungeon/sim.ts','shared/dungeon/api.ts','client/dungeon/simview.ts','client/dungeon/game.ts','client/dungeon/mobs.ts','client/dungeon/boss.ts','client/dungeon/weaponvisuals.ts','client/dungeon/zones.ts','docs/survivors/design-data.json','docs/survivors/level-data.json','tools/survivors/balance.mjs'];
const hashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(join(GAME,f))).digest('hex')]));
const result={date:'2026-10-12',commit:execFileSync('git',['rev-parse','--short=7','HEAD'],{cwd:GAME,encoding:'utf8'}).trim()+' + uncommitted mode/dungeon-expansion-v2',worktree:GAME,baselineCommit:'62f814f',method:'Read-only startWave extraction + 60s native weapon traces after 10s warmup; static targets, no AI, no shield, no buffs, no Q, no overkill. Isolated weapon traces have no passives; build traces use legal 5 weapon +5 catalyst builds and 5 temper. Not survival or playtest.',runtimeDataMatchesDoc:true,waves,cases,traces,builds,hashes};
writeFileSync(join(ROOT,'source','./calculations.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({runtimeDataMatchesDoc:true,builds:builds.map(b=>({name:b.name,dps:b.dps})),traceCount:traces.length},null,2));
