import {D} from './data.ts';
import {cauldronActionSpeed,cauldronMoveMul} from './cauldron-tempo.ts';
import {fx,makeMob,hurtHero} from './core.ts';
import {addMark,addContactMark,spawnMob,canSpawn} from './mobs.ts';
import {collide,T_SOLID,T_PIT} from './map.ts';
import type {DgSim,DgMob,DgBoss} from './types.ts';
import {ticks,DT,wrapD,wrapP,dirOf,rnd,rotate} from './util.ts';

const C=D.cauldron,V={x:0,z:0};
// Сроки в данных совпадают с исходными GLB: симуляция и вид проигрывают их с одним темпом.
const phaseTicks=(seconds:number,phase:number):number=>ticks(seconds/cauldronActionSpeed(phase));
export function spawnCauldron(sim:DgSim,w:number,damageMul:number):void {
 dirOf(rnd(sim)*Math.PI*2,V);const m=makeMob(sim,'cauldronmaster',sim.hero.x+V.x*16,sim.hero.z+V.z*16,1,damageMul,0);
 m.hp=m.hpMax=Math.round(C.hp*C.endlessGrowth**(w-20)*(1+.25*Math.floor((w-10)/40)));m.elite=1;m.attackAt=sim.t;m.attackKind='appear';m.st='rest';
 sim.bosses.push({id:m.id,phase:1,kind:1,family:'cauldronmaster',act:'appear',actT:sim.t,step:0,sumT:sim.t+phaseTicks(C.summonEvery,1),rot:0,rage:0,scale:1,startedAt:sim.t,summonLeft:C.summonBudget,bornWave:w});
}
function begin(sim:DgSim,m:DgMob,b:DgBoss,act:string):void {b.act=act;b.actT=sim.t;b.step=0;m.attackAt=sim.t;m.attackKind=act==='ladle'||act==='ladle2'?'attack':act;m.attackStep=0;m.st=act==='pause'?'walk':act==='roar'?'roar':'wind';}
function angleToHero(sim:DgSim,m:DgMob):number {let x=wrapD(sim.hero.x-m.x),z=wrapD(sim.hero.z-m.z);const d=Math.sqrt(x*x+z*z);m.ax=m.dx=x/(d||1);m.az=m.dz=z/(d||1);return d;}
function aimContact(m:DgMob,id:string):void {const a=C.attacks[id],r=Math.sqrt(a.right!**2+a.forward!**2)||1,x=m.ax,z=m.az; m.ax=m.dx=x*a.forward!/r-z*a.right!/r; m.az=m.dz=x*a.right!/r+z*a.forward!/r;}
function contact(sim:DgSim,m:DgMob,id:string,warn:number,second=false):void {const a=C.attacks[id];addContactMark(sim,m,'cauldron_ladle',second?a.right2!:a.right!,second?a.forward2!:a.forward!,second?a.radius2!:a.radius,warn,a.dmg*m.dmg/C.contactDmg,3);}
function clearMarks(sim:DgSim,m:DgMob):void {for(const mk of sim.marks)if(mk.src===m.id)mk.t1=sim.t-1;}

export function stepCauldron(sim:DgSim,m:DgMob):void {
 const b=sim.bosses.find(b=>b.id===m.id);if(!b)return;
 if(m.touch>0)m.touch--;
 if(!b.rage&&sim.t-(b.startedAt??sim.bossT0)>=ticks(C.enrageAt))b.rage=1;
 if(sim.freezeT>sim.t){b.actT++;if(m.attackAt!==undefined)m.attackAt++;b.sumT++;for(const mk of sim.marks)if(mk.src===m.id){mk.t0++;mk.t1++;}m.vx=m.vz=0;return;}
 const fraction=m.hp/m.hpMax,want=fraction<=.33?3:fraction<=.66?2:1;
 if(want>b.phase){b.phase=want;clearMarks(sim,m);begin(sim,m,b,'roar');m.attackKind='phase'+want;fx(sim,{k:'phase',id:m.id,phase:want});}
 const actionTicks=(seconds:number):number=>phaseTicks(seconds,b.phase);
 const el=sim.t-b.actT;const h=sim.hero;
 if(m.attackStep===-1&&b.act==='boil'){clearMarks(sim,m);begin(sim,m,b,'recover');m.st='rest';m.vulT=sim.t+actionTicks(2);return;}
 let vx=0,vz=0;
 if(b.act==='appear'||b.act==='roar'||b.act==='recover'){
  if(el>=actionTicks(b.act==='recover'?2:C.transition))begin(sim,m,b,'pause');
 }else if(b.act==='pause'){
  angleToHero(sim,m);vx=m.dx*m.spd*cauldronMoveMul(b.phase);vz=m.dz*m.spd*cauldronMoveMul(b.phase);m.attackKind='walk';
  if(el>=actionTicks((b.phase===1?1.6:1.1)*(b.rage?.5:1))){const rotations=b.phase===1?['ladle','pour']:b.phase===2?['ladle2','pour']:['boil','pour','ladle2'];let next=rotations[b.rot++%rotations.length];const a=C.attacks[next],distance=angleToHero(sim,m);
   if((next==='ladle'||next==='ladle2')&&distance>Math.sqrt(a.right!**2+a.forward!**2)+a.radius+.45)next='pour';
   if(next==='boil'&&distance>a.radius+.45)next='pour';
   begin(sim,m,b,next);vx=vz=0;if(next==='ladle'||next==='ladle2')aimContact(m,next);
   if(next==='ladle'||next==='ladle2')contact(sim,m,next,actionTicks(C.attacks[next].impact));
   else if(next==='boil'){const a=C.attacks.boil;addMark(sim,'ring','cauldron_boil',m.x,m.z,a.radius,0,0,actionTicks(a.impact),a.dmg*m.dmg/C.contactDmg,3,0,m);sim.marks[sim.marks.length-1].inner=a.inner;}
   else {const a=C.attacks.pour,baseN=b.phase===2?2:3,sideN=baseN*C.groundVolleyMul,n=sideN+(b.phase===2?1:0);for(let i=0;i<n;i++){
    if(b.phase===1){const off=(i-(n-1)/2)*2.8;addMark(sim,'circle','cauldron_pour',h.x-m.az*off,h.z+m.ax*off,a.radius,0,0,actionTicks(a.impact),a.dmg*m.dmg/C.contactDmg,0,4,m);}
    else {rotate(m.ax,m.az,i===sideN?0:(i/(sideN-1)-.5)*(baseN-1)*(b.phase===2?1.5:1.3),V);addMark(sim,'lane','cauldron_flow',m.x,m.z,0,V.x,V.z,actionTicks(a.impact),22*m.dmg/C.contactDmg,0,0,m,a.length??14,a.width??1.2);}
   }}
  }
 }else {
  const a=C.attacks[b.act];if(!a)return;
  if(b.act==='ladle2'&&b.step===0&&el>=actionTicks((a.impact2??2.833)-1)){contact(sim,m,'ladle2',Math.max(0,actionTicks(a.impact2??2.833)-el),true);b.step=1;}
  const lastImpact=a.impact2??a.impact;
  if(el>=actionTicks(lastImpact)){m.st='rest';if(m.attackStep===0){m.attackStep=1;m.vulT=sim.t+actionTicks(b.phase===3?3:b.phase===2?2.5:2);}}
  if(el>=actionTicks(a.recover))begin(sim,m,b,'pause');
 }
 if(b.phase===2&&sim.t>=b.sumT&&(b.summonLeft??0)>0){let made=0;for(let i=0;i<Math.min(C.summonN,b.summonLeft??0)&&canSpawn(sim,'hookclaw');i++){dirOf(i*Math.PI/2,V);spawnMob(sim,'hookclaw',m.x+V.x*3,m.z+V.z*3,0);made++;}b.summonLeft=(b.summonLeft??0)-made;b.sumT=sim.t+actionTicks(made?C.summonEvery:1);}
 const p=collide(m.x+vx*DT,m.z+vz*DT,m.r,T_SOLID|T_PIT);m.vx=vx;m.vz=vz;m.x=wrapP(p.x);m.z=wrapP(p.z);
 const dx=wrapD(h.x-m.x),dz=wrapD(h.z-m.z);if(m.touch===0&&m.st!=='roar'&&b.act!=='appear'&&dx*dx+dz*dz<(m.r+.45)**2&&hurtHero(sim,m.dmg,'cauldronmaster'))m.touch=actionTicks(1);
}
