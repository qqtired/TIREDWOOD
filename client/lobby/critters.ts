import * as THREE from 'three';
import { CRITTERS, CRITTERS_ENABLED, CRITTER_SAND, type CritterDef } from '../../shared/maps/critters.ts';
import { TICK_RATE } from '../../shared/constants.ts';
import { mergeColored, paint, place } from '../render/kit.ts';
import { makeQuadruped, type RiggedQuadruped } from './critter-quadruped.ts';
import { CoastalCritter } from './critter-coastal.ts';
import { sampleCritter, sampleReaction, startleReaction, type CritterPlayer, type CritterPose, type CritterReaction } from './crittersim.ts';

export interface CritterOptions { onPurr?: (x:number,y:number,z:number,hiss:boolean)=>void; onGullCry?: (x:number,y:number,z:number)=>void; }
export interface PettableCat { id:number;x:number;y:number;z:number;label:string; }
interface Animal {def:CritterDef;pose:CritterPose;reaction:CritterReaction|null;visual:RiggedQuadruped|CoastalCritter|null;}
/** Fifteen actual rigged residents. Logical API remains shared with the lobby's existing E/sound integration. */
export class LobbyCritters {
  readonly group=new THREE.Group();
  readonly ready:Promise<void>;
  private readonly animals:Animal[]=[];
  private readonly options:CritterOptions;
  private readonly shadows:THREE.InstancedMesh;
  private readonly hearts:THREE.InstancedMesh;
  private readonly matrix=new THREE.Matrix4();
  private readonly quaternion=new THREE.Quaternion();
  private readonly position=new THREE.Vector3();
  private readonly scale=new THREE.Vector3();
  private lastTime=0;
  private lastCryBucket:number|null=null;
  private lastPlayer={x:1e6,y:1e6,z:1e6};
  private loadError:string|null=null;

  constructor(scene:THREE.Scene,options:CritterOptions={}){
    this.options=options;this.group.name='city-critters';this.group.visible=CRITTERS_ENABLED;
    this.shadows=new THREE.InstancedMesh(shadowGeometry(),new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),15);
    this.shadows.name='critter-contact-shadows';this.shadows.frustumCulled=false;this.shadows.renderOrder=1;
    const heart=new THREE.Shape();heart.moveTo(0,-.07);heart.bezierCurveTo(-.14,.02,-.085,.15,0,.075);heart.bezierCurveTo(.085,.15,.14,.02,0,-.07);
    this.hearts=new THREE.InstancedMesh(new THREE.ExtrudeGeometry(heart,{depth:.022,bevelEnabled:true,bevelThickness:.006,bevelSize:.006,bevelSegments:1,steps:1}),new THREE.MeshStandardMaterial({color:0xe990a4,roughness:.72}),4);
    this.hearts.name='critter-pet-hearts';this.hearts.frustumCulled=false;
    for(const mesh of[this.shadows,this.hearts])for(let i=0;i<mesh.count;i++)mesh.setMatrixAt(i,new THREE.Matrix4().makeScale(0,0,0));
    this.group.add(this.shadows,this.hearts);scene.add(this.group);
    if(!CRITTERS_ENABLED){this.ready=Promise.resolve();return;}
    const pending:Promise<void>[]=[];
    for(const def of CRITTERS){
      const animal:Animal={def,pose:sampleCritter(def,0),reaction:null,visual:null};this.animals.push(animal);
      if(def.kind==='cat'||def.kind==='dog')pending.push(makeQuadruped(def.kind,def.coat).then(visual=>{animal.visual=visual;visual.group.visible=false;this.group.add(visual.group);}));
      else{animal.visual=new CoastalCritter(def.kind,def.coat);animal.visual.group.visible=false;this.group.add(animal.visual.group);}
    }
    this.buildSand();this.ready=Promise.all(pending).then(()=>{});
    void this.ready.catch(error=>{this.loadError=error instanceof Error?error.message:'Animal asset loading failed';});
  }

  update(serverTick:number,localSeconds:number,camera:{x:number;y:number;z:number},player:CritterPlayer,catchingFish:readonly{x:number;z:number}[]=[]):void{
    if(!CRITTERS_ENABLED)return;
    this.lastTime=localSeconds;Object.assign(this.lastPlayer,player);
    const dog=sampleCritter(CRITTERS[14],serverTick);
    for(const a of this.animals){
      sampleCritter(a.def,serverTick,a.pose);
      a.reaction=startleReaction(a.def,a.pose,player,serverTick,localSeconds,a.reaction);
      if(a.def.kind==='cat'&&!a.pose.moving&&player.speed<.15&&Math.abs(player.y-a.pose.y)<1&&Math.hypot(player.x-a.pose.x,player.z-a.pose.z)<.85&&(!a.reaction||localSeconds>=a.reaction.cooldown)&&(Math.floor(serverTick/TICK_RATE)+a.def.id*5)%23<2)a.reaction={kind:'rub',since:localSeconds,tick:serverTick,duration:2.4,cooldown:localSeconds+18};
      if(a.def.kind==='gull'&&(!a.reaction||localSeconds>=a.reaction.cooldown)){
        const nearDog=dog.moving&&Math.hypot(dog.x-a.pose.x,dog.z-a.pose.z)<2;
        if(nearDog||catchingFish.some(p=>Math.hypot(p.x-a.pose.x,p.z-a.pose.z)<7))a.reaction={kind:'startle',since:localSeconds,tick:serverTick,duration:4.8,cooldown:localSeconds+16};
      }
      sampleReaction(a.def,serverTick,localSeconds,a.reaction,a.pose);
      const p=a.pose,distance=Math.hypot(camera.x-p.x,camera.y-p.y,camera.z-p.z),visible=distance<=80;
      if(a.visual){
        a.visual.group.visible=visible;
        if(visible){a.visual.group.position.set(p.x,p.y,p.z);a.visual.group.rotation.y=p.yaw+(a.def.kind==='crab'?Math.PI/2:0);a.visual.update(p,serverTick/TICK_RATE+a.def.id*.37,distance<=50);}
      }
      this.drawGround(a,visible&&!!a.visual,camera);
    }
    const bucket=Math.floor(serverTick/(TICK_RATE*13));
    if(this.lastCryBucket!==null&&bucket!==this.lastCryBucket){const gull=this.animals[4+((bucket%6)+6)%6].pose;if(Math.hypot(camera.x-gull.x,camera.z-gull.z)<30)this.options.onGullCry?.(gull.x,gull.y+.2,gull.z);}
    this.lastCryBucket=bucket;this.shadows.instanceMatrix.needsUpdate=true;this.hearts.instanceMatrix.needsUpdate=true;
  }

  nearestCat(player:{x:number;y:number;z:number},maxDistance=1.25):PettableCat|null{
    if(!CRITTERS_ENABLED)return null;let result:PettableCat|null=null,best=maxDistance;
    for(const a of this.animals){if(a.def.kind!=='cat'||!a.visual||a.pose.airborne||(a.reaction&&this.lastTime<a.reaction.cooldown))continue;const p=a.pose,d=Math.hypot(player.x-p.x,player.z-p.z);if(d<best&&Math.abs(player.y-p.y)<1.25){best=d;result={id:a.def.id,x:p.x,y:p.y,z:p.z,label:'погладить кота'};}}
    return result;
  }
  petCat(id:number,serverTick:number,localSeconds:number):boolean{
    const a=this.animals.find(a=>a.def.id===id&&a.def.kind==='cat');
    if(!CRITTERS_ENABLED||!a?.visual||(a.reaction&&localSeconds<a.reaction.cooldown))return false;
    // The E target can outlive its last rendered pose. Re-sample the authoritative route time
    // before starting a freeze so a just-started hop can never be suspended in mid-air.
    const current=sampleCritter(a.def,serverTick);
    if(current.airborne||Math.hypot(this.lastPlayer.x-current.x,this.lastPlayer.z-current.z)>1.35||Math.abs(this.lastPlayer.y-current.y)>1.25)return false;
    const hiss=(id*13+Math.floor(serverTick/TICK_RATE))%9===0;
    a.reaction={kind:hiss?'hiss':'purr',since:localSeconds,tick:serverTick,duration:hiss?2.4:3.2,cooldown:localSeconds+5.5};
    this.options.onPurr?.(current.x,current.y+.3,current.z,hiss);return true;
  }
  debug():Record<string,unknown>{return{enabled:CRITTERS_ENABLED,count:this.animals.length,modelsReady:this.animals.filter(a=>!!a.visual).length,loadError:this.loadError,animals:this.animals.map(a=>({id:a.def.id,kind:a.def.kind,...a.pose,reaction:a.reaction?.kind??null}))};}

  private drawGround(a:Animal,visible:boolean,camera:{x:number;y:number;z:number}):void{
    const p=a.pose,kind=a.def.kind;
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),p.yaw);
    const onFloor=visible&&p.action!=='fly'&&p.action!=='burrow';
    const sx=kind==='dog'?.29:kind==='cat'?.17:kind==='gull'?.11:.22,sz=kind==='dog'?.62:kind==='cat'?.40:kind==='gull'?.23:.20;
    this.matrix.compose(this.position.set(p.x,p.y+.006,p.z),this.quaternion,this.scale.set(onFloor?sx:0,1,onFloor?sz:0));this.shadows.setMatrixAt(a.def.id,this.matrix);
    if(kind==='cat'){
      const heart=visible&&a.reaction?.kind==='purr'&&this.lastTime<a.reaction.since+a.reaction.duration;
      this.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(camera.x-p.x,camera.z-p.z));
      this.matrix.compose(this.position.set(p.x,p.y+.79+Math.sin(this.lastTime*3)*.022,p.z),this.quaternion,this.scale.setScalar(heart?1:0));this.hearts.setMatrixAt(a.def.id,this.matrix);
    }
  }
  private buildSand():void{
    const b=CRITTER_SAND,parts:THREE.BufferGeometry[]=[place(paint(new THREE.BoxGeometry(b.x1-b.x0,.26,b.z1-b.z0),0xc6b28a),(b.x0+b.x1)/2,b.y-.13,(b.z0+b.z1)/2)];
    for(let i=0;i<15;i++){const z=i<8?b.z1-.02:b.z0+.06,x=b.x0+.14+(i%8)*(b.x1-b.x0-.28)/7;parts.push(place(paint(new THREE.DodecahedronGeometry(.13+(i%3)*.025,0).scale(1.25,.7,.9),i%2?0x9b9c87:0x797f78),x,b.y-.01,z));}
    const mesh=new THREE.Mesh(mergeColored(parts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94}));mesh.name='critter-shore-sand';mesh.receiveShadow=true;mesh.castShadow=true;this.group.add(mesh);
  }
}
function shadowGeometry():THREE.BufferGeometry{
  const positions:number[]=[],colors:number[]=[],indices:number[]=[],n=24,rings=5;
  for(let r=0;r<=rings;r++)for(let j=0;j<n;j++){const radius=r/rings,angle=j/n*Math.PI*2;positions.push(Math.cos(angle)*radius,0,Math.sin(angle)*radius);colors.push(0,0,0,.24*(1-radius)**2);}
  for(let r=0;r<rings;r++)for(let j=0;j<n;j++){const a=r*n+j,b=r*n+(j+1)%n,c=b+n,d=a+n;indices.push(a,d,b,b,d,c);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));g.setIndex(indices);return g;
}
