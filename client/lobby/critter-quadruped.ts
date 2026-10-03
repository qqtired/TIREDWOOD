import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { CritterPose } from './crittersim.ts';
import { smooth } from './crittersim.ts';

const urls={cat:new URL('../assets/critters/cat.glb',import.meta.url).href,dog:new URL('../assets/critters/dog.glb',import.meta.url).href};
const sources=new Map<string,Promise<GLTF>>();
export async function makeQuadruped(kind:'cat'|'dog',coat=0):Promise<RiggedQuadruped>{
  let source=sources.get(kind);
  if(!source){
    // All current animals share one bounded retry; permanent failure must not poison future views.
    const load=()=>new GLTFLoader().loadAsync(urls[kind]);
    source=load().catch(async()=>{await new Promise<void>(resolve=>setTimeout(resolve,500));return load();});
    sources.set(kind,source);
    const pending=source;void pending.catch(()=>{if(sources.get(kind)===pending)sources.delete(kind);});
  }
  return new RiggedQuadruped(await source,kind,coat);
}
const LEG_NAMES=[['Bone008','Bone009','Bone010'],['Bone011','Bone012','Bone013'],['Bone014','Bone015','Bone016'],['Bone017','Bone018','Bone019']] as const;
/** One continuous skinned mesh; authored gait, skeletal rest posing and fixed-length limb IK. */
export class RiggedQuadruped {
  readonly group=new THREE.Group();
  readonly model:THREE.Object3D;
  readonly mesh:THREE.SkinnedMesh;
  private readonly mixer:THREE.AnimationMixer;
  private readonly idle:THREE.AnimationAction;
  private readonly walk:THREE.AnimationAction;
  private readonly bones=new Map<string,THREE.Bone>();
  private readonly legs:Array<[THREE.Bone,THREE.Bone,THREE.Bone]>;
  private readonly footVertices:number[]=[];
  private readonly inverseRoot=new THREE.Matrix4();
  private readonly point=new THREE.Vector3();
  private readonly coat:number;
  private readonly kind:'cat'|'dog';
  private initialized=false;
  private readonly animatedBones:Array<{bone:THREE.Bone;position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3}>=[];

  constructor(asset:GLTF,kind:'cat'|'dog',coat=0){
    this.kind=kind;this.coat=coat;this.group.name=`${kind}-rigged-${coat}`;
    this.model=clone(asset.scene);this.group.add(this.model);
    let mesh:THREE.SkinnedMesh|undefined;
    this.model.traverse(o=>{if(o instanceof THREE.Bone)this.bones.set(o.name,o);if(o instanceof THREE.SkinnedMesh){mesh=o;o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});
    if(!mesh)throw new Error(`Missing ${kind} skin`);this.mesh=mesh;
    this.mesh.geometry=this.mesh.geometry.clone();
    this.mesh.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0});
    if(kind==='cat')this.applyCoat();
    this.legs=LEG_NAMES.map(names=>names.map(n=>this.bones.get(n)!) as [THREE.Bone,THREE.Bone,THREE.Bone]);
    this.mixer=new THREE.AnimationMixer(this.model);
    this.idle=this.mixer.clipAction(asset.animations.find(a=>a.name==='Idle')!);this.walk=this.mixer.clipAction(asset.animations.find(a=>a.name==='Walk')!);
    this.idle.play();this.walk.play();this.walk.setEffectiveWeight(0);this.mixer.update(0);this.group.updateMatrixWorld(true);
    for(const bone of this.bones.values())this.animatedBones.push({bone,position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()});
    this.inverseRoot.copy(this.group.matrixWorld).invert();
    const unique=new Set<string>();
    for(let i=0;i<this.mesh.geometry.attributes.position.count;i++){
      this.mesh.getVertexPosition(i,this.point).applyMatrix4(this.mesh.matrixWorld).applyMatrix4(this.inverseRoot);
      if(this.point.y>.085)continue;
      const key=this.point.toArray().map(v=>v.toFixed(5)).join(':');if(unique.has(key))continue;unique.add(key);this.footVertices.push(i);
    }
  }

  update(p:CritterPose,seconds:number,animate=true):void{
    if(!animate&&this.initialized)return;this.initialized=true;
    this.model.position.y=0;
    for(const b of this.animatedBones){b.bone.position.copy(b.position);b.bone.quaternion.copy(b.quaternion);b.bone.scale.copy(b.scale);}
    const moving=smooth(p.speed/(this.kind==='cat'?.38:.85));
    this.idle.time=(animate?seconds:0)%this.idle.getClip().duration;
    this.walk.time=(p.distance/(this.kind==='cat'?.46:.74)%1)*this.walk.getClip().duration;
    this.idle.setEffectiveWeight(1-moving);this.walk.setEffectiveWeight(moving);this.mixer.update(0);
    for(const b of this.animatedBones){b.position.copy(b.bone.position);b.quaternion.copy(b.bone.quaternion);b.scale.copy(b.bone.scale);}
    this.group.updateMatrixWorld(true);this.inverseRoot.copy(this.group.matrixWorld).invert();
    const lie=p.action==='sleep',resting=lie||p.action==='sit'||p.action==='groom'||p.action==='purr'||p.action==='rub';
    const weight=resting?p.restWeight:0;
    if(this.mesh.morphTargetInfluences)this.mesh.morphTargetInfluences[0]=lie?weight:0;
    if(weight>0.0001)this.restPose(lie,p.action==='groom',weight,seconds);
    else if(p.action==='sniff'){
      this.rotate('Bone002',new THREE.Vector3(1,0,0),-.30*p.restWeight);
      this.rotate('Bone003',new THREE.Vector3(1,0,0),-.18*p.restWeight);
    }
    if(p.action==='purr'||p.action==='rub')this.rotate('Bone003',new THREE.Vector3(0,1,0),Math.sin(seconds*3)*.08*p.restWeight);
    this.group.updateMatrixWorld(true);
    let low=Infinity;
    for(const i of this.footVertices){this.mesh.getVertexPosition(i,this.point).applyMatrix4(this.mesh.matrixWorld).applyMatrix4(this.inverseRoot);low=Math.min(low,this.point.y);}
    // Correct the source clip's <=4cm sole drift as one vertical offset; never stretch a leg or squash a body.
    if(Number.isFinite(low))this.model.position.y=-low;
    this.group.updateMatrixWorld(true);
  }

  private localPosition(bone:THREE.Bone):THREE.Vector3{return bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(this.inverseRoot);}
  private world(local:THREE.Vector3):THREE.Vector3{return local.clone().applyMatrix4(this.group.matrixWorld);}
  private setWorldQuaternion(bone:THREE.Bone,q:THREE.Quaternion):void{
    const parent=bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();bone.quaternion.copy(parent.multiply(q));bone.updateWorldMatrix(false,true);
  }
  private rotate(name:string,axis:THREE.Vector3,amount:number):void{
    const bone=this.bones.get(name)!;axis.applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion()));
    const q=new THREE.Quaternion().setFromAxisAngle(axis,amount).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));this.setWorldQuaternion(bone,q);
  }
  private restPose(lie:boolean,groom:boolean,weight:number,time:number):void{
    const feet=this.legs.map(l=>this.localPosition(l[2])),orientations=this.legs.map(l=>l[2].getWorldQuaternion(new THREE.Quaternion()));
    const pelvis=this.bones.get('Bone')!,hip=this.localPosition(pelvis);
    const drop=this.kind==='cat'?(lie?.18:.19):(lie?.22:.22);
    hip.y-=drop*weight;pelvis.position.copy(pelvis.parent!.worldToLocal(this.world(hip)));pelvis.updateWorldMatrix(false,true);
    if(lie){this.rotate('Bone001',new THREE.Vector3(1,0,0),(this.kind==='cat'?-.04:-.08)*weight);this.rotate('Bone002',new THREE.Vector3(1,0,0),(this.kind==='cat'?-.35:-.7)*weight);this.rotate('Bone003',new THREE.Vector3(1,0,0),(this.kind==='cat'?-.45:-.35)*weight);}
    else{
      this.rotate('Bone001',new THREE.Vector3(1,0,0),(this.kind==='cat'?.75:.62)*weight);
      this.rotate('Bone002',new THREE.Vector3(1,0,0),-.12*weight);
      this.rotate('Bone003',new THREE.Vector3(1,0,0),-(this.kind==='cat'?.63:.5)*weight);
    }
    this.rotate('Bone004',new THREE.Vector3(1,0,0),1.14*weight);
    this.rotate('Bone005',new THREE.Vector3(0,1,0),.5*weight);this.rotate('Bone006',new THREE.Vector3(0,1,0),.5*weight);
    if(lie&&this.kind==='cat'){
      for(const [name,child,target]of [['Bone004','Bone005',[.06,.14,.33]],['Bone005','Bone006',[.15,.065,.25]],['Bone006','Bone007',[.20,.055,.10]]] as const){
        const b=this.bones.get(name)!,c=this.bones.get(child)!;
        const goal=this.localPosition(c).lerp(new THREE.Vector3(...target),weight);this.aim(b,c,this.world(goal));
      }
    }
    const cat=this.kind==='cat';
    for(let i=0;i<4;i++){
      const back=i<2,side=i===0||i===3?-1:1;
      const target=new THREE.Vector3(side*(cat?.079:.16),cat?.009:.035,back?(lie?(cat?.09:.12):(cat?.23:.25)):(lie?(cat?-.44:-.57):(cat?-.15:-.26)));
      if(groom&&i===3){target.set(-.08,.40,-.29);target.z+=Math.sin(time*3)*.012;}
      target.lerpVectors(feet[i],target,weight);
      const pole=new THREE.Vector3(side*(lie?.55:.12),lie?1:.18,back?-1:1).normalize();
      this.solveLeg(this.legs[i],this.world(target),pole,orientations[i]);
    }
  }
  private solveLeg(leg:[THREE.Bone,THREE.Bone,THREE.Bone],goal:THREE.Vector3,pole:THREE.Vector3,footQ:THREE.Quaternion):void{
    const[a,b,c]=leg,A=a.getWorldPosition(new THREE.Vector3()),B=b.getWorldPosition(new THREE.Vector3()),C=c.getWorldPosition(new THREE.Vector3());
    const l1=A.distanceTo(B),l2=B.distanceTo(C),direction=goal.clone().sub(A),distance=THREE.MathUtils.clamp(direction.length(),Math.abs(l1-l2)+1e-5,l1+l2-1e-5);direction.normalize();
    pole.applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion()));pole.addScaledVector(direction,-pole.dot(direction)).normalize();
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const elbow=A.clone().addScaledVector(direction,along).addScaledVector(pole,height),end=A.clone().addScaledVector(direction,distance);
    this.aim(a,b,elbow);this.aim(b,c,end);this.setWorldQuaternion(c,footQ);
  }
  private aim(bone:THREE.Bone,child:THREE.Bone,target:THREE.Vector3):void{
    const origin=bone.getWorldPosition(new THREE.Vector3()),from=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize(),to=target.clone().sub(origin).normalize();
    const delta=new THREE.Quaternion().setFromUnitVectors(from,to);this.setWorldQuaternion(bone,delta.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
  }
  private applyCoat():void{
    const g=this.mesh.geometry,c=g.getAttribute('color'),p=g.getAttribute('position'),base=new THREE.Color(0xb98146),out=new THREE.Color();
    const palette=[0xc18a4c,0x8c9697,0x354043,0xe2d5bc],dark=[0x995f31,0x596467,0x354043,0x4d4944];
    for(let i=0;i<c.count;i++){
      if(Math.abs(c.getX(i)-base.r)+Math.abs(c.getY(i)-base.g)+Math.abs(c.getZ(i)-base.b)>.001)continue;
      const x=p.getX(i),side=p.getY(i),height=p.getZ(i);
      let hex=palette[this.coat];
      if(this.coat<2&&height>1.7&&x<1.8&&Math.sin(x*10+Math.abs(side)*2)>.72)hex=dark[this.coat];
      if(this.coat===3){if(x<-.45&&side>0||x>1.65&&side<0)hex=0xb4783e;else if(x>.4&&x<1.35&&side>.1||x< -1.6)hex=0x484745;}
      out.setHex(hex);c.setXYZ(i,out.r,out.g,out.b);
    }c.needsUpdate=true;
  }
}
