import * as THREE from 'three';
import { HIDE_SHOT_EVENT_TICKS,type HideProp,type HideServerMsg,type HideShot } from '../../shared/hide.ts';
import { makeRayHit,type CollisionWorld } from '../../shared/world.ts';
import type { Sound } from '../audio.ts';
import { Tracers } from '../paintball/tracers.ts';
import { Effects } from '../render/effects.ts';

const PAINT_LIFE=5, PAINT_LIMIT=16, COLOR=0xff962f;
type Surface={point:THREE.Vector3;normal:THREE.Vector3;size?:number};
type SurfaceRay=(id:number,origin:THREE.Vector3,direction:THREE.Vector3,maxDistance:number)=>Surface|null;
interface Paint {handle:number;life:number;prop:HideProp|null}

/** One authoritative shot feed shared by the hunter, hiders and spectators.
 * Rendering reuses the paintball pools; no client target or hidden player identity is needed. */
export class HideShots {
  private readonly effects:Effects;
  private readonly tracers:Tracers;
  private readonly world:CollisionWorld;
  private readonly sound:Pick<Sound,'shot'|'splat'>;
  private readonly surface:SurfaceRay;
  private round=-1;
  private lastId=0;
  private played=0;
  private mine=false;
  private pending:HideShot[]=[];
  private paint:Paint[]=[];
  private props=new Map<number,HideProp>();
  private readonly camera=new THREE.Vector3();
  private readonly from=new THREE.Vector3();
  private readonly to=new THREE.Vector3();
  private readonly direction=new THREE.Vector3();
  private readonly start=new THREE.Vector3();
  private readonly check=new THREE.Vector3();
  private readonly wall=makeRayHit();
  private lastShot:HideShot|null=null;

  constructor(scene:THREE.Scene,world:CollisionWorld,sound:Pick<Sound,'shot'|'splat'>,surface:SurfaceRay) {
    this.world=world;this.sound=sound;this.surface=surface;
    this.effects=new Effects(scene,world);this.tracers=new Tracers(scene);
  }

  onState(state:HideServerMsg,camera:THREE.Vector3):void {
    if(state.round!==this.round||state.phase==='hide'||state.phase==='gather') {this.clear();this.round=state.round;}
    this.camera.copy(camera);this.mine=state.self.role==='hunter';
    this.props=new Map(state.props.map(prop=>[prop.id,prop]));
    if(state.phase==='hide'||state.phase==='gather')return;
    for(const shot of state.shots) {
      if(shot.id<=this.lastId||!validShot(shot)||state.tick-shot.tick>HIDE_SHOT_EVENT_TICKS||state.tick<shot.tick)continue;
      this.lastId=shot.id;this.pending.push(shot);
    }
    // A throttled background tab cannot build an unbounded effects backlog.
    if(this.pending.length>4)this.pending.splice(0,this.pending.length-4);
  }

  /** Run after HideProps.update, so a prop hit resolves against its current real mesh. */
  update(dt:number):void {
    this.effects.update(dt);this.tracers.update(dt);
    this.paint=this.paint.filter(paint=>{
      paint.life-=dt;
      const prop=paint.prop,current=prop?this.props.get(prop.id):undefined;
      const moved=prop&&(!current||prop.form!==current.form||prop.x!==current.x||prop.y!==current.y||prop.z!==current.z||prop.yaw!==current.yaw);
      if(paint.life<=0||moved){this.effects.removeSplat(paint.handle);return false;}return true;
    });
    for(const shot of this.pending)this.play(shot);
    this.pending=[];
  }

  clear():void {
    this.effects.clear();this.tracers.clear();this.paint=[];this.pending=[];this.props.clear();this.lastId=0;this.round=-1;this.played=0;this.lastShot=null;
  }

  debug():{played:number;paint:number;pending:number;lastShot:HideShot|null} {
    return {played:this.played,paint:this.paint.length,pending:this.pending.length,lastShot:this.lastShot};
  }

  private play(shot:HideShot):void {
    this.from.fromArray(shot.from);this.to.fromArray(shot.to);this.direction.copy(this.to).sub(this.from).normalize();
    const distance=this.from.distanceTo(this.to),prop=shot.kind==='prop'?this.props.get(shot.propId):undefined;
    let normal=shot.normal,paintable=shot.kind==='world',paintSize=.72;
    if(prop) {
      const hit=this.surface(prop.id,this.from,this.direction,distance+3);
      // The authoritative box may include air around a barrel or between bench legs.
      // Paint only real triangles and never a surface behind a nearer static wall.
      if(hit&&Number.isFinite(hit.point.lengthSq()+hit.normal.lengthSq())&&hit.normal.lengthSq()>.9&&
        !this.world.raycast(this.from.x,this.from.y,this.from.z,this.direction.x,this.direction.y,this.direction.z,this.from.distanceTo(hit.point)-.01,this.wall,true)) {
        this.to.copy(hit.point);normal=[hit.normal.x,hit.normal.y,hit.normal.z];paintSize=Math.min(.72,hit.size??.72);paintable=paintSize>=.025;
      }
    }
    this.start.copy(this.from);
    if(this.mine&&distance>.5) {
      // A tiny muzzle offset makes a forward trace visible in first person. The endpoint is
      // still the server ray; fall back to the eye if the offset would cross nearby geometry.
      this.start.x-=this.direction.z*.14;this.start.y-=.12;this.start.z+=this.direction.x*.14;
      this.start.addScaledVector(this.direction,.20);
      this.check.copy(this.start).sub(this.from);const offset=this.check.length();this.check.normalize();
      const blocked=this.world.raycast(this.from.x,this.from.y,this.from.z,this.check.x,this.check.y,this.check.z,offset,this.wall,true);
      this.check.copy(this.to).sub(this.start);const travel=this.check.length();this.check.normalize();
      if(blocked||this.world.raycast(this.start.x,this.start.y,this.start.z,this.check.x,this.check.y,this.check.z,travel-.02,this.wall,true))this.start.copy(this.from);
    }
    const {x:sx,y:sy,z:sz}=this.start,{x:tx,y:ty,z:tz}=this.to;
    this.tracers.shoot(sx,sy,sz,tx,ty,tz,COLOR);
    this.effects.shootBall(sx,sy,sz,tx,ty,tz,COLOR,0,{kind:2,nx:0,ny:0,nz:0,victim:0,head:false});
    this.effects.puff(sx,sy,sz,.2,0xffe2a0,.12,.1,.4,1.1);
    this.sound.shot(this.mine?null:shot.from,this.camera.distanceTo(this.from));
    if(shot.kind!=='air') {
      const [nx,ny,nz]=normal;
      this.effects.burst(tx,ty,tz,COLOR,9,2.4,nx,ny,nz,.04);
      this.sound.splat([tx,ty,tz],this.camera.distanceTo(this.to));
      if(paintable) {
        const handle=this.effects.splat(tx,ty,tz,nx,ny,nz,paintSize,COLOR,prop?-2:-1,PAINT_LIFE);
        if(handle>=0) {
          this.paint.push({handle,life:PAINT_LIFE,prop:prop?{...prop}:null});
          if(this.paint.length>PAINT_LIMIT)this.effects.removeSplat(this.paint.shift()!.handle);
        }
      }
    }
    this.lastShot=shot;this.played++;
  }
}

function validShot(shot:HideShot):boolean {
  const vector=(v:readonly number[])=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  if(!Number.isSafeInteger(shot.id)||shot.id<=0||!Number.isFinite(shot.tick)||!vector(shot.from)||!vector(shot.to)||!vector(shot.normal))return false;
  const distance=Math.hypot(shot.to[0]-shot.from[0],shot.to[1]-shot.from[1],shot.to[2]-shot.from[2]);
  return distance>.01&&distance<=42.001&&(['world','prop','air'] as const).includes(shot.kind)&&
    (shot.kind==='air'||Math.abs(Math.hypot(...shot.normal)-1)<.01);
}
