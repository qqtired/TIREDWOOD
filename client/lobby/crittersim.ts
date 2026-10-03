// Absolute shared-time routes. Position, speed, heading and travelled distance are all analytic,
// so gait can be driven by distance without depending on the joining time or frame rate.
import { TICK_RATE } from '../../shared/constants.ts';
import { CRITTERS, type CritterAction, type CritterDef } from '../../shared/maps/critters.ts';
export type CritterPoseAction = CritterAction | 'purr' | 'rub' | 'hiss' | 'shy';
export interface CritterPose {
  x:number;y:number;z:number;yaw:number;pitch:number;action:CritterPoseAction;rest:string|null;
  moving:boolean;airborne:boolean;phase:number;distance:number;speed:number;restWeight:number;age:number;remaining:number;
}
export interface CritterPlayer { x:number;y:number;z:number;speed:number; }
export interface CritterReaction { kind:'startle'|'purr'|'rub'|'hiss'; since:number; tick:number; duration:number; cooldown:number; }
interface Route {total:number;length:number;legs:readonly number[];lengths:readonly number[];}
const periods=new Map<number,Route>();
for(const def of CRITTERS){
  const lengths=def.stops.map((a,i)=>{const b=def.stops[(i+1)%def.stops.length];return Math.hypot(b.x-a.x,b.z-a.z);});
  const legs=lengths.map((length,i)=>Math.max(def.stops[(i+1)%def.stops.length].travel==='fly'?3.6:1,length/(def.stops[(i+1)%def.stops.length].travel==='fly'?1.7:def.speed)));
  periods.set(def.id,{total:def.stops.reduce((sum,s,i)=>sum+s.hold+legs[i],0),length:lengths.reduce((a,b)=>a+b,0),lengths,legs});
}
export const smooth=(v:number):number=>{const x=Math.max(0,Math.min(1,v));return x*x*(3-2*x);};
const angle=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*smooth(t);
export function critterPeriod(def:CritterDef):number{return periods.get(def.id)!.total;}
function pose():CritterPose{return{x:0,y:0,z:0,yaw:0,pitch:0,action:'sit',rest:null,moving:false,airborne:false,phase:0,distance:0,speed:0,restWeight:0,age:0,remaining:0};}
export function sampleCritter(def:CritterDef,tick:number,out:CritterPose=pose()):CritterPose {
  const cycle=periods.get(def.id)!;
  const absolute=Math.max(0,Number.isFinite(tick)?tick:0)/TICK_RATE+def.phase;
  let t=absolute%cycle.total,distance=Math.floor(absolute/cycle.total)*cycle.length;
  for(let i=0;i<def.stops.length;i++){
    const a=def.stops[i],b=def.stops[(i+1)%def.stops.length],prev=def.stops[(i+def.stops.length-1)%def.stops.length],duration=cycle.legs[i];
    const outgoing=Math.atan2(-(b.x-a.x),-(b.z-a.z)),incoming=Math.atan2(-(a.x-prev.x),-(a.z-prev.z));
    if(t<a.hold){
      const resting=a.yaw??incoming;
      const yaw=t<.65?angle(incoming,resting,t/.65):angle(resting,outgoing,(t-a.hold+.85)/.85);
      Object.assign(out,{x:a.x,y:a.y,z:a.z,yaw,pitch:0,action:a.action,rest:a.rest,moving:false,airborne:false,phase:t/a.hold,distance,speed:0,restWeight:Math.min(smooth(t/.7),smooth((a.hold-t)/.85)),age:t,remaining:a.hold-t});return out;
    }
    t-=a.hold;
    if(t<duration){
      const u=t/duration,r=Math.min(.18,.5/duration),fly=b.travel==='fly',hop=b.travel==='hop';
      const progress=u<r?u*u/(2*r*(1-r)):u>1-r?1-(1-u)**2/(2*r*(1-r)):(u-r/2)/(1-r);
      const rate=(u<r?u/r:u>1-r?(1-u)/r:1)/(1-r)/duration;
      const arc=Math.sin(Math.PI*progress)**2,dArc=Math.PI*Math.sin(2*Math.PI*progress);
      const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y;
      const vy=(dy+(fly?2.5:hop?.5:0)*dArc)*rate,vx=dx*rate,vz=(dz+(fly?.8:0)*dArc)*rate;
      Object.assign(out,{x:a.x+dx*progress,y:a.y+dy*progress+(fly?2.5*arc:hop?.65*Math.sin(Math.PI*progress):0),z:a.z+dz*progress+(fly?.8:0)*arc,
        yaw:fly?Math.atan2(-dx,-(dz+.8*dArc)):outgoing,pitch:fly?Math.atan2(vy,Math.hypot(vx,vz)):0,
        action:fly?'fly':'walk',rest:null,moving:true,airborne:fly||hop,phase:progress,distance:distance+cycle.lengths[i]*progress,speed:Math.hypot(vx,vz),restWeight:0,age:t,remaining:duration-t});return out;
    }
    t-=duration;distance+=cycle.lengths[i];
  }
  return sampleCritter(def,0,out);
}
/** Temporary local reactions sample the same validated route; no target-following or spatial snap. */
export function sampleReaction(def:CritterDef,tick:number,time:number,reaction:CritterReaction|null,out?:CritterPose):CritterPose {
  if(!reaction||time<reaction.since||time>=reaction.since+reaction.duration)return sampleCritter(def,tick,out);
  const u=(time-reaction.since)/reaction.duration,soft=Math.sin(Math.PI*u)**2;
  const affectionate=reaction.kind==='purr'||reaction.kind==='rub';
  const lead=Math.min(def.kind==='gull'?1.2:.55,reaction.duration*.24);
  const recovery=Math.max(0,Math.min(1,(u-.6)/.4));
  const shifted=affectionate?reaction.tick+(tick-reaction.tick)*smooth(recovery):tick+soft*lead*TICK_RATE;
  const p=sampleCritter(def,shifted,out);
  if(reaction.kind==='purr'||reaction.kind==='rub'){
    p.speed*=smooth(recovery)+u*6*recovery*(1-recovery)/.4;
    p.moving=p.speed>.02;
    if(u<.78){p.action=reaction.kind;p.restWeight=Math.min(smooth(u/.15),1-smooth((u-.55)/.23));}
  }
  else if(def.kind==='gull'){p.y+=soft*2.4;p.action='fly';p.moving=true;p.airborne=true;p.age=u*reaction.duration;p.remaining=(1-u)*reaction.duration;}
  else if(def.kind==='crab'){p.action='burrow';p.restWeight=soft;}
  else{p.speed*=1+lead*Math.PI/reaction.duration*Math.sin(2*Math.PI*u);p.action=reaction.kind==='hiss'?'hiss':'shy';p.moving=p.speed>.01;}
  return p;
}
export function startleReaction(def:CritterDef,p:CritterPose,player:CritterPlayer,tick:number,time:number,old:CritterReaction|null):CritterReaction|null {
  if(old&&time<old.cooldown)return old;
  if(player.speed<2.5||Math.abs(player.y-p.y)>1.5||Math.hypot(player.x-p.x,player.z-p.z)>(def.kind==='gull'?2.4:1.6))return null;
  const duration=def.kind==='gull'?4.8:def.kind==='crab'?3.2:2.4;
  return{kind:'startle',since:time,tick,duration,cooldown:time+duration+5};
}
