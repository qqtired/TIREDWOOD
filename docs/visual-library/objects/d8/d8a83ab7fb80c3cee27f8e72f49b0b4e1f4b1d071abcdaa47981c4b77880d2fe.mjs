// Accelerated initial fixtures only. No mutations after createRun/first view/hash.
import {D} from '../../../../../../../unavailable.html';
import {startWave} from '../../../../../../../unavailable.html';
import {spawnBosses} from '../../../../../../../unavailable.html';
import {spawnMob} from '../../../../../../../unavailable.html';
import {applyCard,openChest,pick,xpNeed} from '../../../../../../../unavailable.html';
import {dropItem,dropGem} from '../../../../../../../unavailable.html';
import {dgHash} from '../../../../../../../unavailable.html';
import {blocked,T_SOLID,T_PIT} from '../../../../../../../unavailable.html';
export const GAME='[LOCAL_PATH]';
export const CASES=[
 {id:'wave16-kite',wave:16,build:'kite',type:'normalHP',seconds:25},
 {id:'wave17-kite',wave:17,build:'kite',type:'normalHP',seconds:25},
 {id:'wave18-range',wave:18,build:'range',type:'normalHP',seconds:30},
 {id:'wave19-guard',wave:19,build:'guard',type:'normalHP',seconds:30},
 {id:'boss20-kite',wave:20,build:'kite',type:'normalHP',seconds:120},
 {id:'boss20-guard',wave:20,build:'guard',type:'normalHP',seconds:120},
 {id:'boss20-range',wave:20,build:'range',type:'normalHP',seconds:120},
 {id:'recipes-kite',wave:16,build:'kite',type:'recipeFixture',seconds:60},
 {id:'recipes-guard',wave:16,build:'guard',type:'recipeFixture',seconds:60},
 {id:'hook-contact',wave:16,kind:'hookclaw',type:'contactFixture',seconds:7},
 {id:'mole-Q',wave:17,kind:'wickmole',type:'contactFixture',seconds:10},
 {id:'rail-KB',wave:18,kind:'railhopper',type:'contactFixture',seconds:8},
 {id:'chain-twohits',wave:18,kind:'chainwarden',type:'contactFixture',seconds:8},
 {id:'boss-phases',wave:20,build:'guard',type:'registrationOnly',seconds:100},
 {id:'distinct-deaths',wave:19,type:'deathFixture',seconds:7},
 {id:'crowd-mixed',wave:19,type:'crowdFixture',seconds:10},
 {id:'crowd-beetles',wave:19,type:'crowdFixture',seconds:10},
 {id:'timer20-to21',wave:20,type:'timerFixture',seconds:125},
].map((c,i)=>({...c,seed:704300+i}));
export const BUILDS={
 kite:{weapons:['lantern','embers','pickaxe','charges','spark'],passives:{might:5,cooldown:5,amount:2,speed:5,magnet:5}},
 guard:{weapons:['lantern','embers','fireflies','stalactites','beam'],passives:{might:5,maxhp:5,armor:5,cooldown:5,area:5}},
 range:{weapons:['lantern','embers','spark','stalactites','beam'],passives:{might:5,armor:5,area:5,cooldown:5,magnet:5}}
};
export const caseBySeed=seed=>CASES.find(c=>c.seed===seed)??null;
export function setup(sim){
 const c=caseBySeed(sim.seed);if(!c)return {case:'normal',accelerated:false,initialHash:dgHash(sim)};
 if(sim.t!==0)throw Error('QA setup must run before tick0');
 const edits=['skip to wave'+c.wave,'assume previous '+(c.wave-1)+' waves for local fixture counters'];
 sim.hero.x=120;sim.hero.z=120;sim.firstPick=1;
 startWave(sim,c.wave);sim.stats.waves=c.wave-1;sim.stats.ms=0;
 if(c.build){
  const b=BUILDS[c.build];sim.weapons=[];sim.passives=[];
  for(const id of b.weapons)for(let lv=1;lv<=(c.id.startsWith('recipes')&&id==='lantern'?6:7);lv++)applyCard(sim,{k:'w',id,lv});
  for(const [id,max]of Object.entries(b.passives))for(let lv=1;lv<=max;lv++)applyCard(sim,{k:'p',id,lv});
  for(let n=0;n<5;n++)applyCard(sim,{k:'temper'});
  if(!c.id.startsWith('recipes'))for(let n=0;n<5;n++){openChest(sim,'plain');pick(sim,0);}
  edits.push('finished legal5+5 inventory and temper5 supplied by setup, not earned');
 }
 const isolated= !['normalHP','timerFixture'].includes(c.type);
 if(isolated){sim.wave.pend.fill(0);sim.wave.ev=[];sim.wave.total=sim.wave.left=0;sim.wave.minAlive=0;sim.props=[];sim.items=[];sim.gems=[];edits.push('isolated fixture: no director background/props/map pickups; actual map collision stays');}
 if(c.type==='recipeFixture'){
  const hold=spawnMob(sim,'rat',138,138,0);hold.hp=hold.hpMax=1e8;hold.spd=hold.dmg=0;
  const points=[[129,120],[120,129],[120,111],[127,127],[127,113]];
  for(const [x,z]of points){if(blocked(x,z,.8,T_SOLID|T_PIT))throw Error('Recipe chest must have clear player clearance');dropItem(sim,'chest',x,z,'plain');}
  // A real XP pickup triggers normal levelUp/maybeOpenChoice/HUD; no fabricated cards.
  dropGem(sim,120,120,sim.hero.xpNext+1);
  edits.push('lantern6→7 must be obtained from the actual level card; 5 real chest pickups and 1 real XP gem placed by setup; pickup/recipe/card handling remains real');
 }
 if(c.type==='contactFixture'){
  sim.weapons=[{id:'lantern',lv:1,evo:0,cd:99999,t2:0}];sim.passives=[];sim.hero.hp=sim.hero.hpMax=100;sim.wave.hpMul=6;sim.wave.dmgMul=1;
  const dist=c.kind==='hookclaw'?2:c.kind==='wickmole'?5.1:c.kind==='railhopper'?10:3.06;
  const m=spawnMob(sim,c.kind,120+dist,120,c.kind==='chainwarden'?1:0);m.cd=c.kind==='wickmole'?90:0;m.spd=0;
  if(c.kind==='railhopper'){sim.weapons=[];for(let lv=1;lv<=7;lv++)applyCard(sim,{k:'w',id:'pickaxe',lv});}
  edits.push('one real enemy at measured distance; spd0, HPmul6 and damageMul1 for clear registration; normal hero100HP');
  if(c.kind!=='railhopper')edits.push('auto lantern cooldown delayed, use genuine Q/input to trigger damage');
 }
 if(c.type==='registrationOnly'){
  spawnBosses(sim,20,1);sim.wave.ev=[];const m=sim.mobs.find(m=>m.k==='cauldronmaster'),b=sim.bosses.find(b=>b.id===m.id);
  m.x=122.6;m.z=120;b.act='pause';b.actT=-100;sim.hero.hp=sim.hero.hpMax=10000;
  edits.push('boss at2.6m, damageMul1 and hero10000HP to register all phase attack families; not survival/balance evidence');
 }
 if(c.type==='deathFixture'){
  sim.weapons=[{id:'lantern',lv:1,evo:0,cd:99999,t2:0}];sim.passives=[];sim.hero.level=40;sim.hero.xpNext=xpNeed(40);
  for(const [i,kind]of ['hookclaw','wickmole','railhopper','chainwarden'].entries()){
   const p=[[123,120],[120,123],[117,120],[120,117]][i],m=spawnMob(sim,kind,p[0],p[1],kind==='chainwarden'?1:0);m.hp=m.hpMax=50;m.cd=99999;m.spd=0;
  }
  spawnBosses(sim,20,1);sim.wave.ev=[];const m=sim.mobs.find(m=>m.k==='cauldronmaster');m.x=124;m.z=123;m.hp=50;m.spd=0;
  edits.push('enemyHP50/auto cooldown99999; herolevel40 avoids XP choice before all5 actual Q deaths complete; not balance');
 }
 if(c.type==='crowdFixture'){
  sim.weapons=[{id:'lantern',lv:1,evo:0,cd:99999,t2:0}];sim.passives=[];sim.hero.invT=1e9;
  const kinds=c.id==='crowd-beetles'?Array(300).fill('beetle'):[...Array(267).fill('rat'),...Array(18).fill('hookclaw'),...Array(6).fill('wickmole'),...Array(8).fill('railhopper'),'chainwarden'];
  for(let i=0;i<300;i++){const col=i%20,row=Math.floor(i/20),x=120+(col-9.5)*.5,z=120+(row-7)*.5,m=spawnMob(sim,kinds[i],x,z,kinds[i]==='chainwarden'?1:0);m.cd=99999;}
  edits.push('300 real models at narrow visible grid; invT1e9/auto cooldown99999 prevent early death; performance/cap fixture only');
 }
 if(c.type==='timerFixture'){sim.weapons=[{id:'lantern',lv:1,evo:0,cd:99999,t2:0}];sim.hero.invT=1e9;edits.push('invT1e9 and delayed autoattack for timer/carryover proof only; all budgets, boss and wave clocks unchanged');}
 if(sim.weapons.length>5||sim.passives.length>5)throw Error('illegal QA inventory');
 const initialHash=dgHash(sim);
 return {case:c.id,type:c.type,seed:c.seed,accelerated:true,initialHash,edits,seconds:c.seconds,normalHP:c.type==='normalHP',heroHp:sim.hero.hp,weapons:sim.weapons.map(w=>({id:w.id,lv:w.lv,evo:w.evo})),passives:sim.passives.map(p=>({...p}))};
}
export function summary(sim){
 return {tick:sim.t,hash:dgHash(sim),wave:sim.wave.n,stage:sim.wave.stage,end:sim.end,hero:{x:sim.hero.x,z:sim.hero.z,hp:sim.hero.hp,hpMax:sim.hero.hpMax,level:sim.hero.level,qHold:sim.hero.qHold,qCd:sim.hero.qCd},cards:!!sim.choice,chest:!!sim.chest,alive:sim.mobs.filter(m=>!m.die).length,
  mobs:sim.mobs.filter(m=>['hookclaw','wickmole','railhopper','chainwarden','cauldronmaster'].includes(m.k)).slice(0,40).map(m=>({id:m.id,k:m.k,x:m.x,z:m.z,hp:m.hp,die:m.die,st:m.st,attackKind:m.attackKind,attackAt:m.attackAt,attackStep:m.attackStep,ax:m.ax,az:m.az,kx:m.kx,kz:m.kz,stunT:m.stunT})),
  bosses:sim.bosses.map(b=>({id:b.id,family:b.family,phase:b.phase,act:b.act,actT:b.actT})),marks:sim.marks.map(m=>({id:m.id,src:m.src,what:m.what,k:m.k,x:m.x,z:m.z,r:m.r,inner:m.inner,dx:m.dx,dz:m.dz,w:m.w,len:m.len,t0:m.t0,t1:m.t1})),enemyCharges:sim.enemyCharges.map(c=>({...c})),weapons:sim.weapons.map(w=>({id:w.id,lv:w.lv,evo:w.evo})),stats:{...sim.stats},fx:sim.fx.filter(f=>['hurt','q','die','phase'].includes(f.k)).map(f=>({...f}))};
}
