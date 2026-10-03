import { randomInt } from 'node:crypto';
import { viewDir } from '../../shared/math.ts';
import { EYE_HEIGHT } from '../../shared/constants.ts';
import { HIDE_CAPACITY,HIDE_COUNT_TICKS,HIDE_MIN,HIDE_PREP_TICKS,HIDE_SEEK_TICKS,HIDE_RESULT_TICKS,HIDE_REJOIN_TICKS,HIDE_SHOT_TICKS,HIDE_MISS_TICKS,HIDE_PROPS,HIDE_FORMS,type HideClientMsg,type HideForm,type HidePhase,type HideProp,type HideResult,type HideRole,type HideServerMsg } from '../../shared/hide.ts';
import { HidePhysics,HIDE_SPAWN,hideClearOfProps,hideFits,hideRayProp,hideWorld } from '../../shared/hidephysics.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { makeState,type Input,type PlayerState } from '../../shared/sim.ts';
import type { RayHit } from '../../shared/world.ts';
import { InputQueue } from '../inputs.ts';
import { HIDE_SHOT_HISTORY,HIDE_SHOT_EVENT_TICKS,type HideShot } from '../../shared/hide.ts';
export interface HideSink {sendJson(msg:HideServerMsg):void}
export interface HidePlayer {
 id:number;pid:number;nick:string;level:number;outfit:Outfit;sink:HideSink|null;connected:boolean;leftAt:number;
 state:PlayerState;input:InputQueue;physics:HidePhysics;role:HideRole;form:HideForm;locked:boolean;found:boolean;propId:number;
 yaw:number;pitch:number;propYaw:number;reset:number;round:number;rewardEligible:boolean;awarded:boolean;
 moved:number;chose:boolean;shots:number;finds:number;lastShot:number;lastAction:number;lastTaunt:number;lastPacket:number;lastHuntAt:number;
}
interface Hooks {finished(pid:number,result:HideResult):void;rand?:(n:number)=>number}
export class HideGame {
 readonly world=hideWorld();readonly players=new Map<number,HidePlayer>();tick=0;round=0;phase:HidePhase='gather';phaseEnd=0;
 result:HideServerMsg['result']=null;notice='Нужно 2–8 игроков';cue:HideServerMsg['cue']=null;
 private readonly hooks:Hooks;private readonly rand:(n:number)=>number;private nextId=1;private hunterPid=0;private lastHunter=0;
 private props:HideProp[]=[];private initialProps=0;private seekAt=0;private nextCue=0;
 private readonly shotDir={x:0,y:0,z:0};
 private shots:HideShot[]=[];private shotSerial=0;
 private readonly wallHit:RayHit={t:0,nx:0,ny:0,nz:0,box:-1};
 constructor(hooks:Hooks){this.hooks=hooks;this.rand=hooks.rand??randomInt;}
 canRejoin(pid:number):boolean{return [...this.players.values()].some(p=>p.pid===pid&&!p.connected&&!p.found&&p.role!=='spectator'&&this.tick-p.leftAt<HIDE_REJOIN_TICKS);}
 get humans():number{return [...this.players.values()].filter(p=>p.connected).length;}
 get active():boolean{return this.phase!=='gather'||this.phaseEnd>0;}
 get busy():number{return [...this.players.values()].filter(p=>p.connected&&p.role!=='spectator'&&this.phase!=='gather').length;}
 addHuman(info:{pid:number;nick:string;level:number;outfit:Outfit},sink:HideSink):HidePlayer|null {
  const old=[...this.players.values()].find(p=>p.pid===info.pid);
  if(old?.connected||this.humans>=HIDE_CAPACITY)return null;
  if(old){old.connected=true;old.sink=sink;old.nick=info.nick;old.outfit=info.outfit;old.level=info.level;old.input.reset();old.reset++;old.lastPacket=this.tick;this.send(old);this.recount();return old;}
  const p:HidePlayer={...info,id:this.nextId++,sink,connected:true,leftAt:0,state:Object.assign(makeState(),HIDE_SPAWN,{grounded:1}),input:new InputQueue(),physics:new HidePhysics(this.world),role:'spectator',form:'barrel',locked:false,found:false,propId:0,yaw:0,pitch:0,propYaw:0,reset:0,round:0,rewardEligible:false,awarded:false,moved:0,chose:false,shots:0,finds:0,lastShot:-9999,lastAction:-9999,lastTaunt:-9999,lastPacket:this.tick,lastHuntAt:-9999};
  this.players.set(p.id,p);this.recount();this.send(p);return p;
 }
 removePlayer(id:number):void {
  const p=this.players.get(id);if(!p)return;
  p.connected=false;p.sink=null;p.leftAt=this.tick;p.rewardEligible=false;
  if(this.phase==='gather'||this.phase==='result'||p.role==='spectator'||p.found)this.players.delete(id);
  this.recount();
 }
 onInputs(p:HidePlayer,inputs:Input[],count:number):void {
  if(!p.connected)return;p.lastPacket=this.tick;
  const valid=inputs.slice(0,Math.max(0,Math.min(count,inputs.length))).filter(i=>Number.isFinite(i.yaw)&&Number.isFinite(i.pitch));p.input.push(valid,valid.length);
 }
 action(p:HidePlayer,msg:HideClientMsg):void {
  if(!p.connected||p.found||(this.phase!=='hide'&&this.phase!=='seek'))return;
  if(msg.a==='shoot'){
   if(msg.aim!==undefined&&(!Array.isArray(msg.aim)||msg.aim.length!==2||!msg.aim.every(v=>typeof v==='number'&&Number.isFinite(v))))return;
   if(p.role==='hunter'&&this.phase==='seek')this.shoot(p,msg.aim);return;
  }
  if(p.role!=='prop'||this.tick-p.lastAction<9)return;p.lastAction=this.tick;
  if(msg.a==='form'&&HIDE_PROPS.includes(msg.form!)){
   if(hideFits(this.world,p.state,msg.form!,p.propYaw)&&this.clearOfProps(p,msg.form!,p.propYaw)){p.form=msg.form!;p.chose=true;p.reset++;}
  }else if(msg.a==='freeze'){p.locked=!p.locked;p.chose=true;p.reset++;}
  else if(msg.a==='rotate'){
   const yaw=p.propYaw+Math.PI/2;if(hideFits(this.world,p.state,p.form,yaw)&&this.clearOfProps(p,p.form,yaw)){p.propYaw=yaw;p.chose=true;p.reset++;}
  }else if(msg.a==='taunt'&&this.phase==='seek'&&this.tick-p.lastTaunt>=1200){p.lastTaunt=this.tick;this.signal(p);}
  this.send(p);
 }
 private recount():void {
  if(this.phase!=='gather')return;
  if(this.humans<HIDE_MIN)this.phaseEnd=0;
  else if(!this.phaseEnd)this.phaseEnd=this.tick+HIDE_COUNT_TICKS;
 }
 private layout():void {
  const spots:{x:number;y:number;z:number}[]=[];
  for(let z=-21;z<=10;z+=4)for(let x=-25;x<=25;x+=4){const s={x:x+(this.rand(21)-10)/100,y:this.world.groundBelow(x,.4,z),z:z+(this.rand(21)-10)/100};if(hideFits(this.world,s,'bench',0)&&hideFits(this.world,s,'bench',Math.PI/2))spots.push(s);}
  for(let i=spots.length-1;i>0;i--){const j=this.rand(i+1);[spots[i],spots[j]]=[spots[j],spots[i]];}
  const base=10000+this.rand(1000000);this.props=spots.slice(0,Math.min(48,spots.length)).map((s,i)=>({...s,id:base+i,form:HIDE_PROPS[this.rand(4)],yaw:this.rand(4)*Math.PI/2}));
 }
 private begin():void {
  const players=[...this.players.values()].filter(p=>p.connected).sort((a,b)=>a.pid-b.pid);
  if(players.length<HIDE_MIN){this.phaseEnd=0;return;}
  const hunter=players.find(p=>p.pid>this.lastHunter)??players[0];this.hunterPid=hunter.pid;this.lastHunter=hunter.pid;
  this.round++;this.phase='hide';this.phaseEnd=this.tick+HIDE_PREP_TICKS;this.result=null;this.notice='20 секунд: выберите предмет и спрячьтесь';this.cue=null;this.shots=[];
  this.layout();const choices=[...this.props];
  for(let i=choices.length-1;i>0;i--){const j=this.rand(i+1);[choices[i],choices[j]]=[choices[j],choices[i]];}
  let slot=0;this.initialProps=players.length-1;
  for(const p of players){
   p.role=p===hunter?'hunter':'prop';p.round=this.round;p.found=false;p.locked=false;p.chose=false;p.awarded=false;p.rewardEligible=true;p.moved=0;p.shots=0;p.finds=0;p.lastShot=-9999;p.lastHuntAt=-9999;p.input.reset();p.reset++;
   if(p.role==='prop'){const prop=choices[slot++];p.propId=prop.id;p.form=prop.form;p.propYaw=prop.yaw;p.state=Object.assign(makeState(),{x:prop.x,y:prop.y,z:prop.z,grounded:1});}
   else{p.propId=0;p.form='barrel';p.state=Object.assign(makeState(),HIDE_SPAWN,{grounded:1});}
  }
  this.broadcast();
 }
 private currentProps():HideProp[]{return this.props.flatMap(prop=>{const p=[...this.players.values()].find(p=>p.propId===prop.id&&p.round===this.round);if(!p)return [{...prop}];if(p.found)return [];return [{id:prop.id,form:p.form,x:p.state.x,y:p.state.y,z:p.state.z,yaw:p.propYaw}];});}
 private clearOfProps(p:HidePlayer,form:HideForm,yaw:number):boolean {
  return hideClearOfProps(p.state,form,yaw,p.propId,this.currentProps());
 }
 private shoot(p:HidePlayer,aim?:[number,number]):void {
  if(this.tick-p.lastShot<HIDE_SHOT_TICKS)return;p.lastShot=this.tick;p.lastHuntAt=this.tick;p.shots++;
  // Only orientation comes from this action; origin and collision stay server-authoritative.
  viewDir(aim?.[0]??p.yaw,Math.max(-1.2,Math.min(1.2,aim?.[1]??p.pitch)),this.shotDir);const {x:dx,y:dy,z:dz}=this.shotDir;
  let nearest=42,id=0,hitProp:HideProp|undefined;for(const prop of this.currentProps()){const d=hideRayProp(p.state.x,p.state.y+EYE_HEIGHT,p.state.z,dx,dy,dz,prop);if(d<nearest){nearest=d;id=prop.id;hitProp=prop;}}
  const blocked=this.world.raycast(p.state.x,p.state.y+EYE_HEIGHT,p.state.z,dx,dy,dz,nearest,this.wallHit,true);
  const distance=blocked?this.wallHit.t:nearest;
  const from:[number,number,number]=[p.state.x,p.state.y+EYE_HEIGHT,p.state.z];
  const to:[number,number,number]=[from[0]+dx*distance,from[1]+dy*distance,from[2]+dz*distance];
  const normal:[number,number,number]=blocked?[this.wallHit.nx,this.wallHit.ny,this.wallHit.nz]:hitProp?propNormal(hitProp,to):[0,0,0];
  this.shots.push({id:++this.shotSerial,tick:this.tick,from,to,normal,kind:blocked?'world':id?'prop':'air',propId:blocked?0:id});
  this.shots=this.shots.filter(shot=>this.tick-shot.tick<=HIDE_SHOT_EVENT_TICKS).slice(-HIDE_SHOT_HISTORY);
  const target=id&&!blocked?[...this.players.values()].find(q=>q.propId===id&&q.role==='prop'&&q.connected&&!q.found&&q.round===this.round):undefined;
  if(target){target.found=true;target.reset++;p.finds++;this.notice='Нашли предмет!';if(this.remaining().length===0)this.finish('hunter');}
  else{this.phaseEnd=Math.max(this.tick,this.phaseEnd-HIDE_MISS_TICKS);this.notice='Промах: −3 секунды';}
  this.broadcast();
 }
 private remaining():HidePlayer[]{return [...this.players.values()].filter(p=>p.round===this.round&&p.role==='prop'&&!p.found);}
 private signal(p:HidePlayer):void {this.cue={x:Math.round(p.state.x/4)*4,z:Math.round(p.state.z/4)*4,until:this.tick+180};this.notice='Шорох: предмет где-то в отмеченном квартале';}
 private finish(result:HideServerMsg['result']):void {
  if(this.phase==='result')return;
  if(result!=='cancelled'&&(![...this.players.values()].some(p=>p.round===this.round&&p.role==='hunter'&&p.connected)||![...this.players.values()].some(p=>p.round===this.round&&p.role==='prop'&&p.connected)))result='cancelled';
  const hunter=[...this.players.values()].find(p=>p.round===this.round&&p.role==='hunter');
  const hunterActive=!!hunter&&hunter.connected&&hunter.moved>=4&&hunter.shots>0&&this.tick-hunter.lastHuntAt<=1800;
  const preparedOpponent=[...this.players.values()].some(p=>p.round===this.round&&p.role==='prop'&&p.connected&&p.moved>=4&&p.chose);
  if(result!=='cancelled'&&(!hunterActive||!preparedOpponent))result='cancelled';
  this.phase='result';this.result=result;this.phaseEnd=this.tick+HIDE_RESULT_TICKS;this.cue=null;
  this.notice=result==='hunter'?'Искатель нашёл всех':result==='props'?'Предметы продержались!':'Раунд без наград: нужны активные соперники';
  if(result!=='cancelled')for(const p of this.players.values()){
   if(p.awarded||p.round!==this.round||p.role==='spectator')continue;p.awarded=true;
   const participated=p.connected&&p.rewardEligible&&p.moved>=4&&(p.role==='hunter'?p.shots>0:p.chose);
   if(!participated)continue;
   const won=p.role==='hunter'?result==='hunter':!p.found&&result==='props',survived=p.role==='prop'&&!p.found&&result==='props';
   const seconds=Math.max(0,(this.tick-this.seekAt)/60),earned=p.role==='hunter'?Math.floor(seconds/60*8)+p.finds*3+(won?3:0):survived?Math.floor(seconds/60*10):0;
   this.hooks.finished(p.pid,{round:this.round,role:p.role,won,found:p.finds,survived,reward:seconds>=15?Math.min(35,earned):0});
  }
  this.broadcast();
 }
 step():void {
  this.tick++;
  for(const [id,p] of this.players){
   if(!p.connected&&this.tick-p.leftAt>=HIDE_REJOIN_TICKS){if(p.role==='hunter'&&(this.phase==='hide'||this.phase==='seek')){this.finish('cancelled');}p.found=true;p.role='spectator';if(this.phase==='gather'||this.phase==='result')this.players.delete(id);continue;}
   if(!p.connected)continue;
   const n=p.input.due();for(let i=0;i<n;i++){
    if(!p.input.length)break;const inp=p.input.shift();const oldYaw=p.yaw,oldPitch=p.pitch;p.yaw=inp.yaw;p.pitch=Math.max(-1.2,Math.min(1.2,inp.pitch));
    const free=(p.role==='prop'&&!p.found&&(this.phase==='hide'||this.phase==='seek'))||(p.role==='hunter'&&this.phase==='seek');
    p.physics.form=p.form;p.physics.locked=p.locked;p.physics.free=free;p.physics.yaw=p.propYaw;
    const x=p.state.x,z=p.state.z,before={...p.state};p.physics.step(p.state,inp);
    if(p.role==='prop'&&!this.clearOfProps(p,p.form,p.propYaw))Object.assign(p.state,before);
    const moved=Math.hypot(p.state.x-x,p.state.z-z);p.moved+=moved;
    if(p.role==='hunter'&&this.phase==='seek'&&(moved>.02||Math.abs(p.yaw-oldYaw)>.02||Math.abs(p.pitch-oldPitch)>.02))p.lastHuntAt=this.tick;
   }
  }
  if(this.phase==='gather'&&this.phaseEnd&&this.tick>=this.phaseEnd)this.begin();
  else if(this.phase==='hide'&&this.tick>=this.phaseEnd){this.phase='seek';this.seekAt=this.tick;this.phaseEnd=this.tick+HIDE_SEEK_TICKS;this.nextCue=this.tick+1800;this.notice='Искатель вышел на площадь';this.broadcast();}
  else if(this.phase==='seek'){
   if(!this.remaining().length)this.finish('cancelled');
   else if(this.tick>=this.phaseEnd)this.finish('props');
   else if(this.tick>=this.nextCue){const props=this.remaining();this.signal(props[this.rand(props.length)]);this.nextCue=this.tick+1800;}
  }else if(this.phase==='result'&&this.tick>=this.phaseEnd){this.phase='gather';this.phaseEnd=0;this.props=[];this.shots=[];this.result=null;for(const p of this.players.values()){p.role='spectator';p.propId=0;p.state=Object.assign(makeState(),HIDE_SPAWN,{grounded:1});p.reset++;}this.recount();this.broadcast();}
  if(this.tick%6===0)this.broadcast();
 }
 view(p:HidePlayer):HideServerMsg {
  const blind=this.phase==='hide'&&p.role!=='prop';const hunter=[...this.players.values()].find(q=>q.pid===this.hunterPid&&q.round===this.round);
  return{t:'hide_state',tick:this.tick,round:this.round,phase:this.phase,phaseEnd:this.phaseEnd,
   self:{id:p.id,ack:p.input.ack,reset:p.reset,state:{...p.state},role:p.role,form:p.form,propId:p.propId,propYaw:p.propYaw,locked:p.locked,found:p.found},
   props:blind?[]:this.currentProps(),hunter:blind||!hunter?null:{x:hunter.state.x,y:hunter.state.y,z:hunter.state.z,yaw:hunter.yaw,nick:hunter.nick,level:hunter.level,outfit:hunter.outfit},
   remaining:this.remaining().length,total:this.initialProps,notice:this.notice,result:this.result,cue:blind?null:this.cue,
   shots:this.phase==='hide'||this.phase==='gather'?[]:this.shots.filter(shot=>this.tick-shot.tick<=HIDE_SHOT_EVENT_TICKS)};
 }
 send(p:HidePlayer):void{p.sink?.sendJson(this.view(p));}
 private broadcast():void{for(const p of this.players.values())if(p.connected)this.send(p);}
}
/** Normal of the same oriented collision box used to judge a prop hit; no hidden metadata. */
function propNormal(prop:HideProp,point:readonly number[]):[number,number,number] {
 const f=HIDE_FORMS[prop.form],c=Math.cos(prop.yaw),s=Math.sin(prop.yaw),rx=point[0]-prop.x,rz=point[2]-prop.z;
 const x=rx*c-rz*s,y=point[1]-prop.y,z=rx*s+rz*c;
 const faces=[{d:Math.abs(x+f.w),n:[-c,0,s]},{d:Math.abs(x-f.w),n:[c,0,-s]},{d:Math.abs(y),n:[0,-1,0]},{d:Math.abs(y-f.h),n:[0,1,0]},{d:Math.abs(z+f.d),n:[-s,0,-c]},{d:Math.abs(z-f.d),n:[s,0,c]}];
 return faces.reduce((best,face)=>face.d<best.d?face:best).n as [number,number,number];
}
