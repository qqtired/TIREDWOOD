import {D,mobDef,type MobKind} from './data.ts';
import {fx,newId} from './core.ts';
import {addMark,addContactMark} from './mobs.ts';
import type {DgSim,DgMob} from './types.ts';
import {ticks,wrapP} from './util.ts';

export function expansionKind(k:MobKind):boolean{return k==='hookclaw'||k==='wickmole'||k==='railhopper'||k==='chainwarden';}
export function holdExpansionAttack(sim:DgSim,m:DgMob):void {if(m.attackAt===undefined)return;m.attackAt++;for(const mk of sim.marks)if(mk.src===m.id){mk.t0++;mk.t1++;}}
export function cancelExpansionAttack(sim:DgSim,m:DgMob):void {m.attackAt=sim.t;m.attackKind='recover';m.attackStep=0;m.st='rest';for(const mk of sim.marks)if(mk.src===m.id)mk.t1=sim.t-1;}
/** Модель могла сдвинуться от обычного отброса. Физическая метка следует руке, направление остаётся зафиксированным. */
export function syncPhysicalMarks(sim:DgSim):void {
 for(const mk of sim.marks){if(mk.localRight===undefined||mk.localForward===undefined||mk.t1<sim.t)continue;const m=sim.mobs.find(m=>m.id===mk.src);if(!m||m.die)continue;mk.x=wrapP(m.x+m.ax*mk.localForward+m.az*mk.localRight);mk.z=wrapP(m.z+m.az*mk.localForward-m.ax*mk.localRight);}
 // AI создал выстрел до интеграции отброса тела. Нулевой кадр снаряда начинается у актуального источника.
 for(const shot of sim.shots)if(shot.k==='rail'&&shot.t0===sim.t){const m=sim.mobs.find(m=>m.id===shot.ph);if(m&&!m.die){shot.x=m.x;shot.z=m.z;}}
 // Только момент передачи сосуда: после t0 поставленный заряд уже самостоятельный объект мира.
 for(const charge of sim.enemyCharges)if(charge.t0===sim.t){const m=sim.mobs.find(m=>m.id===charge.src);if(m&&!m.die){const a=mobDef(m.k).plant!;charge.x=wrapP(m.x+m.ax*a.forward+m.az*a.right);charge.z=wrapP(m.z+m.az*a.forward-m.ax*a.right);}}
}
function freeWarning(sim:DgSim):boolean {let n=sim.enemyCharges.filter(c=>c.end>=sim.t).length;for(const mk of sim.marks)if(mk.t1>=sim.t&&['hook_snap','plant_warn','rail_warn','chain_swing'].includes(mk.what))n++;return n<D.expansion.newTelegraphs;}

export function expansionAi(sim:DgSim,m:DgMob,d:number,ox:number,oz:number):void {
 const def=mobDef(m.k),atk=def.hook??def.plant??def.rail??def.swing!;
 m.vx=m.vz=0;
 if(m.attackAt!==undefined){
  const age=(sim.t-m.attackAt)/30;
  if(m.attackKind==='recover'){if(age>=.6){m.attackAt=undefined;m.attackKind=undefined;m.st='walk';m.cd=ticks(atk.every);}return;}
  if(def.swing&&m.st==='wind'&&m.attackHp!==undefined&&m.attackHp-m.hp>=m.hpMax*def.swing.interrupt){cancelExpansionAttack(sim,m);return;}
  if(m.attackStep===0&&age>=atk.impact){m.attackStep=1;m.st='rest';
   if(def.plant&&sim.enemyCharges.filter(c=>c.end>=sim.t).length<D.expansion.enemyCharges){sim.enemyCharges.push({id:newId(sim),x:wrapP(m.x+m.ax*def.plant.forward+m.az*def.plant.right),z:wrapP(m.z+m.az*def.plant.forward-m.ax*def.plant.right),t0:sim.t,end:sim.t+ticks(def.plant.fuse),r:def.plant.radius,dmg:def.plant.dmg*m.dmg/def.dmg,src:m.id});fx(sim,{k:'atk',id:m.id,what:'plant_impact'});}
   if(def.rail){sim.shots.push({id:newId(sim),k:'rail',x:m.x,z:m.z,vx:m.ax*def.rail.speed,vz:m.az*def.rail.speed,dx:m.ax,dz:m.az,v0:def.rail.speed,t0:sim.t,ph:m.id,size:def.rail.width/2,dmg:def.rail.dmg*m.dmg/def.dmg,pierce:1,hit:[],maxAge:ticks(def.rail.length/def.rail.speed)});fx(sim,{k:'atk',id:m.id,what:'rail_impact'});}
  }
  if(def.swing&&m.attackStep===1&&age>=def.swing.impact2-.9){if(!freeWarning(sim)){m.attackAt++;return;}m.attackStep=2;m.st='wind';m.attackHp=m.hp;addContactMark(sim,m,'chain_swing',def.swing.right2,def.swing.forward2,def.swing.radius2,ticks(def.swing.impact2)- (sim.t-m.attackAt),def.swing.dmg*m.dmg/def.dmg,2);}
  if(def.swing&&m.attackStep===2&&age>=def.swing.impact2){m.attackStep=3;m.st='rest';m.vulT=sim.t+ticks(2.2);}
  if(age>=atk.recover){m.attackAt=undefined;m.attackKind=undefined;m.st='walk';m.cd=ticks(Math.max(.1,atk.every-atk.recover));}
  return;
 }
 if(m.cd>0)m.cd--;
 const close=def.hook?d<Math.sqrt(def.hook.forward**2+def.hook.right**2)+def.hook.radius+.3:def.swing?d<Math.sqrt(def.swing.forward**2+def.swing.right**2)+def.swing.radius+.3:def.plant?d>=5&&d<=9:d>=8&&d<=14;
 if(m.cd===0&&close&&freeWarning(sim)&&(!def.plant||sim.enemyCharges.filter(c=>c.end>=sim.t).length<D.expansion.enemyCharges)){
  m.attackAt=sim.t;m.attackKind='attack';m.attackStep=0;m.attackHp=m.hp;m.st='wind';m.stT=sim.t;m.ax=m.dx=ox;m.az=m.dz=oz;
  if(def.hook)addContactMark(sim,m,'hook_snap',def.hook.right,def.hook.forward,def.hook.radius,ticks(def.hook.impact),def.hook.dmg*m.dmg/def.dmg);
  else if(def.swing)addContactMark(sim,m,'chain_swing',def.swing.right,def.swing.forward,def.swing.radius,ticks(def.swing.impact),def.swing.dmg*m.dmg/def.dmg,2);
  else if(def.rail){addMark(sim,'lane','rail_warn',m.x,m.z,0,ox,oz,ticks(def.rail.impact),0,0,0,m,def.rail.length,def.rail.width);const mark=sim.marks[sim.marks.length-1];mark.localRight=0;mark.localForward=0;}
  else addContactMark(sim,m,'plant_warn',def.plant!.right,def.plant!.forward,def.plant!.radius,ticks(def.plant!.impact),0);
  fx(sim,{k:'atk',id:m.id,what:m.k});return;
 }
 if(def.hook){const side=m.id&1?1:-1,along=d<4?.45:.9;let x=ox*along-oz*.65*side,z=oz*along+ox*.65*side;const n=Math.sqrt(x*x+z*z)||1;m.vx=x/n*m.spd;m.vz=z/n*m.spd;}
 else {const min=def.plant?5:def.rail?9:0,max=def.plant?9:def.rail?13:3,sg=d<min?-1:d>max?1:0;m.vx=ox*m.spd*sg;m.vz=oz*m.spd*sg;}
}
