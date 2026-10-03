import { buildLobby } from './maps/lobby.ts';
import { makeEvents,stepPlayer,copyState,makeState,type Input,type PlayerState,type StepEvents } from './sim.ts';
import { CollisionWorld } from './world.ts';
import { HIDE_FORMS,type HideForm,type HideProp } from './hide.ts';

/** Отдельная копия центральной городской площади; южная граница перед водой и мемориалом. */
export const HIDE_BOUNDS={minX:-28,maxX:28,minZ:-24,maxZ:13};
export const HIDE_SPAWN={x:0,y:0,z:6};
export function hideWorld():CollisionWorld{return new CollisionWorld(buildLobby());}
export function hideFits(world:CollisionWorld,s:Pick<PlayerState,'x'|'y'|'z'>,form:HideForm,yaw:number):boolean {
  if(!Number.isFinite(s.x+s.y+s.z+yaw))return false;
  const f=HIDE_FORMS[form],c=Math.abs(Math.cos(yaw)),n=Math.abs(Math.sin(yaw));
  const hx=f.w*c+f.d*n,hz=f.w*n+f.d*c,b=HIDE_BOUNDS;
  if(s.x-hx<b.minX||s.x+hx>b.maxX||s.z-hz<b.minZ||s.z+hz>b.maxZ||s.y<-.05||s.y>.4)return false;
  if(world.overlaps(s.x-hx,s.y+.035,s.z-hz,s.x+hx,s.y+f.h,s.z+hz))return false;
  for(const dx of [-hx,hx])for(const dz of [-hz,hz])if(world.groundBelow(s.x+dx,s.y+.06,s.z+dz)<s.y-.08)return false;
  return true;
}
/** Anonymous public prop volumes: the predictor and authority reject the same overlap. */
export function hideClearOfProps(s:Pick<PlayerState,'x'|'z'>,form:HideForm,yaw:number,ownId:number,props:readonly HideProp[]):boolean {
  const f=HIDE_FORMS[form],rx=Math.abs(Math.cos(yaw))*f.w+Math.abs(Math.sin(yaw))*f.d,rz=Math.abs(Math.sin(yaw))*f.w+Math.abs(Math.cos(yaw))*f.d;
  return props.every(q=>{if(q.id===ownId)return true;const g=HIDE_FORMS[q.form],qx=Math.abs(Math.cos(q.yaw))*g.w+Math.abs(Math.sin(q.yaw))*g.d,qz=Math.abs(Math.sin(q.yaw))*g.w+Math.abs(Math.cos(q.yaw))*g.d;return Math.abs(q.x-s.x)>=rx+qx+.04||Math.abs(q.z-s.z)>=rz+qz+.04;});
}
/** Одинаковая ограниченная ходьба на сервере/клиенте. Прыжок и рывок не открывают крыши/воду. */
export class HidePhysics {
  form:HideForm='barrel';locked=false;free=true;yaw=0;
  /** Only prop players collide with these public records; hunter movement keeps its original rules. */
  props:readonly HideProp[]=[];propId=0;
  private readonly beforeState=makeState();
  private readonly events=makeEvents();
  private readonly world:CollisionWorld;
  constructor(world:CollisionWorld){this.world=world;}
  before(s:PlayerState,input:Input):void {
    copyState(this.beforeState,s);input.buttons=this.locked||!this.free?0:input.buttons&15;
    if(this.locked||!this.free){s.vx=0;s.vz=0;}
  }
  after(s:PlayerState,_input:Input,_events:StepEvents):void {
    if(!hideFits(this.world,s,this.form,this.yaw)||(this.propId!==0&&!hideClearOfProps(s,this.form,this.yaw,this.propId,this.props)))copyState(s,this.beforeState);
  }
  step(s:PlayerState,input:Input):void{this.before(s,input);stepPlayer(s,input,this.world,false,0,this.events);this.after(s,input,this.events);}
}
/** Луч в ориентированный объём предмета. Значение — расстояние, Infinity — не попал. */
export function hideRayProp(ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,p:HideProp,max=42):number {
  const f=HIDE_FORMS[p.form],c=Math.cos(p.yaw),s=Math.sin(p.yaw),rx=ox-p.x,rz=oz-p.z;
  const origin=[rx*c-rz*s,oy-p.y,rx*s+rz*c],dir=[dx*c-dz*s,dy,dx*s+dz*c],min=[-f.w,0,-f.d],hi=[f.w,f.h,f.d];
  let near=0,far=max;
  for(let i=0;i<3;i++){
    if(Math.abs(dir[i])<1e-8){if(origin[i]<min[i]||origin[i]>hi[i])return Infinity;continue;}
    const a=(min[i]-origin[i])/dir[i],b=(hi[i]-origin[i])/dir[i];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return Infinity;
  }
  return near<=max?near:Infinity;
}
