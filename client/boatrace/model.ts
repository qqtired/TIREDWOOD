import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { boatWave } from '../../shared/boatracephysics.ts';
import { PALETTE,type Outfit } from '../../shared/outfit.ts';
import { E_ALIVE } from '../../shared/protocol.ts';
import { Avatar,DRIVE_WHEEL,DRIVE_TURN,type AvatarPose } from '../render/avatar.ts';

export const SPORT_BOAT={beam:1.92,length:4.68,seatX:.35,seatY:.42,seatZ:.64} as const;
const assetUrl=new URL('../assets/boats/kenney-speed-a.glb',import.meta.url).href;
let asset:Promise<THREE.Group>|null=null;
function sourceBoat():Promise<THREE.Group>{
 if(asset)return asset;
 const load=()=>new GLTFLoader().loadAsync(assetUrl).then(g=>g.scene);
 // Retry once for existing models, sharing the request; later entries may retry a final failure.
 const pending=load().catch(async()=>{await new Promise<void>(resolve=>setTimeout(resolve,500));return load();});
 asset=pending;void pending.catch(()=>{if(asset===pending)asset=null;});return pending;
}
let teak:THREE.CanvasTexture|null=null;
function teakTexture():THREE.CanvasTexture {
 if(teak)return teak;const c=document.createElement('canvas');c.width=128;c.height=256;const g=c.getContext('2d')!;
 g.fillStyle='#927358';g.fillRect(0,0,128,256);
 for(let x=0;x<128;x+=16){g.fillStyle=x%32?'#a48364':'#94765c';g.fillRect(x+1,0,14,256);g.fillStyle='#293b3e';g.fillRect(x,0,2,256);}
 for(let i=0;i<140;i++){g.strokeStyle=`rgba(236,213,167,${.025+(i%4)*.012})`;g.beginPath();const x=(i*37)%128;g.moveTo(x,i%256);g.lineTo(x+.5,(i%256)+15);g.stroke();}
 teak=new THREE.CanvasTexture(c);teak.colorSpace=THREE.SRGBColorSpace;teak.wrapS=teak.wrapT=THREE.RepeatWrapping;teak.repeat.set(1,2);return teak;
}
function numberTexture(number:number):THREE.CanvasTexture {
 const c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d')!;x.fillStyle='#f4f0dc';x.beginPath();x.roundRect(4,7,248,114,20);x.fill();x.strokeStyle='#213e50';x.lineWidth=5;x.stroke();x.fillStyle='#203f50';x.font='900 86px Rubik,system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(String(number).padStart(2,'0'),128,67);return Object.assign(new THREE.CanvasTexture(c),{colorSpace:THREE.SRGBColorSpace});
}
function pipe(points:THREE.Vector3[],radius:number,material:THREE.Material):THREE.Mesh {
 return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(8,points.length*5),radius,6,false),material);
}

function batchStatic(parent:THREE.Object3D):void {
 const groups=new Map<THREE.Material,THREE.Mesh[]>();
 for(const object of [...parent.children])if(object instanceof THREE.Mesh&&!Array.isArray(object.material)){let group=groups.get(object.material);if(!group){group=[];groups.set(object.material,group);}group.push(object);}
 for(const [material,meshes] of groups){if(meshes.length<2)continue;const parts=meshes.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});const geometry=mergeGeometries(parts,false);if(!geometry){for(const p of parts)p.dispose();continue;}for(const mesh of meshes){parent.remove(mesh);mesh.geometry.dispose();}for(const p of parts)p.dispose();const batch=new THREE.Mesh(geometry,material);batch.castShadow=batch.receiveShadow=true;parent.add(batch);}
}

/** The authored Kenney topology is the visible shell. Detail layers have independent steering/engine motion. */
export class BoatModel {
 readonly root=new THREE.Group();readonly rider:Avatar;readonly ready:Promise<void>;
 private readonly accent:THREE.MeshPhysicalMaterial;
 private readonly engine=new THREE.Group();private readonly propeller=new THREE.Group();private readonly wheel=new THREE.Group();
 private readonly number:THREE.CanvasTexture;private readonly seat=new THREE.Vector3();private readonly riderPose:AvatarPose={x:0,y:0,z:0,yaw:0,pitch:0,flags:E_ALIVE};
 private readonly mats=new Set<THREE.Material>();private disposed=false;private loaded=false;private roll=0;private pitch=0;private previousSpeed=0;
 constructor(scene:THREE.Scene,id:number,outfit:Outfit,name:string){
  this.root.name=`sport-boat-${id}`;scene.add(this.root);
  this.accent=new THREE.MeshPhysicalMaterial({color:PALETTE[outfit.c]??0x287a92,roughness:.24,metalness:.09,clearcoat:.85,clearcoatRoughness:.2});
  const ivory=new THREE.MeshPhysicalMaterial({color:0xf0eddf,roughness:.35,metalness:.025,clearcoat:.55});
  const dark=new THREE.MeshStandardMaterial({color:0x182f3b,roughness:.53,metalness:.08});
  const rubber=new THREE.MeshStandardMaterial({color:0x202b30,roughness:.86});
  const chrome=new THREE.MeshStandardMaterial({color:0xbdc8c5,roughness:.25,metalness:.83});
  const leather=new THREE.MeshStandardMaterial({color:0xe5e4d9,roughness:.68});
  const glass=new THREE.MeshPhysicalMaterial({color:0x9dc5ca,metalness:.04,roughness:.12,transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide,clearcoat:1});
  const timber=new THREE.MeshStandardMaterial({map:teakTexture(),roughness:.92});
  [this.accent,ivory,dark,rubber,chrome,leather,glass,timber].forEach(m=>this.mats.add(m));
  const mesh=(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,parent:THREE.Object3D=this.root)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  // The open cockpit is inset below the gunwales; two separate cushions/backrests, never a block laid on top.
  mesh(new THREE.BoxGeometry(1.28,.045,1.58),timber,0,.385,.38);
  for(const side of [-1,1]){
   mesh(new THREE.SphereGeometry(1,18,12).scale(.29,.105,.34),leather,side*.35,.48,.61);
   const back=mesh(new THREE.SphereGeometry(1,18,12).scale(.30,.34,.10),leather,side*.35,.75,.96);back.rotation.x=-.12;
   mesh(new THREE.CylinderGeometry(.095,.095,.24,10),chrome,side*.35,.28,.61);
   // Rubrail follows the chine from stern around the tapered foredeck.
   this.root.add(pipe([new THREE.Vector3(side*.88,.39,1.79),new THREE.Vector3(side*.96,.37,.72),new THREE.Vector3(side*.89,.42,-.55),new THREE.Vector3(side*.62,.47,-1.53),new THREE.Vector3(side*.07,.43,-2.20)],.047,this.accent));
   const fender=mesh(new THREE.CapsuleGeometry(.085,.43,4,8),rubber,side*.96,.29,.73);fender.rotation.x=Math.PI/2;
   for(const z of [-1.30,1.49]){mesh(new THREE.BoxGeometry(.19,.035,.065),chrome,side*(z<0?.56:.78),.53,z);mesh(new THREE.CylinderGeometry(.023,.023,.07,6),chrome,side*(z<0?.56:.78),.48,z);}
   mesh(new THREE.BoxGeometry(.12,.04,.12),chrome,side*.82,.42,-.68);
   mesh(new THREE.SphereGeometry(.034,10,6),new THREE.MeshBasicMaterial({color:side<0?0xe26651:0x72c99c}),side*.82,.455,-.68);
  }
  // Follow the actual authored GLB windshield vertices: one glazed shell, one fitted frame.
  for(const side of[-1,1]){
   this.root.add(pipe([new THREE.Vector3(side*.444,.656,-.232),new THREE.Vector3(side*.195,.656,-.715),new THREE.Vector3(0,.656,-.846)],.016,chrome));
   this.root.add(pipe([new THREE.Vector3(side*.592,.407,-.520),new THREE.Vector3(side*.259,.407,-1.163),new THREE.Vector3(0,.407,-1.339)],.015,chrome));
   this.root.add(pipe([new THREE.Vector3(side*.444,.656,-.232),new THREE.Vector3(side*.592,.407,-.520)],.018,chrome));
  }
  const dash=mesh(new THREE.BoxGeometry(1.08,.14,.22),dark,0,.64,-.21);dash.rotation.x=.15;
  for(const x of [-.10,.06,.21]){const radius=x===.06?.059:.045;const gauge=mesh(new THREE.CircleGeometry(radius,16),dark,x,.716,-.20);gauge.rotation.x=-Math.PI/2;const bezel=mesh(new THREE.RingGeometry(radius*.83,radius,16),chrome,x,.718,-.20);bezel.rotation.x=-Math.PI/2;}
  // Wheel matches the existing avatar driving mittens; no disconnected hands floating over the deck.
  this.wheel.position.set(SPORT_BOAT.seatX,SPORT_BOAT.seatY+DRIVE_WHEEL.y,SPORT_BOAT.seatZ+DRIVE_WHEEL.z);this.wheel.rotation.x=DRIVE_WHEEL.tilt;
  this.root.add(pipe([new THREE.Vector3(SPORT_BOAT.seatX,.61,-.25),new THREE.Vector3(SPORT_BOAT.seatX,SPORT_BOAT.seatY+DRIVE_WHEEL.y,SPORT_BOAT.seatZ+DRIVE_WHEEL.z)],.042,dark));
  const rim=mesh(new THREE.TorusGeometry(DRIVE_WHEEL.r,.025,8,24),rubber,0,0,0,this.wheel);rim.castShadow=true;
  for(let i=0;i<3;i++){const spoke=mesh(new THREE.CylinderGeometry(.016,.016,.18,6),chrome,0,0,0,this.wheel);spoke.rotation.z=i*Math.PI*2/3;spoke.position.set(-Math.sin(spoke.rotation.z)*.09,Math.cos(spoke.rotation.z)*.09,0);}
  mesh(new THREE.CylinderGeometry(.055,.055,.05,12).rotateX(Math.PI/2),dark,0,0,0,this.wheel);this.root.add(this.wheel);
  // Separate streamlined outboard shell, cooling ribs, lower leg and a turning three-blade screw.
  this.engine.position.set(0,.23,2.02);this.root.add(this.engine);
  mesh(new THREE.SphereGeometry(1,18,12).scale(.31,.42,.30),dark,0,.55,.08,this.engine);
  mesh(new THREE.SphereGeometry(1,18,10).scale(.29,.11,.29),this.accent,0,.91,.08,this.engine);
  for(const side of [-1,1])for(let y=.46;y<.71;y+=.07)mesh(new THREE.BoxGeometry(.02,.02,.28),rubber,side*.303,y,.08,this.engine);
  mesh(new THREE.CylinderGeometry(.095,.13,.69,10),chrome,0,-.10,.05,this.engine);
  mesh(new THREE.SphereGeometry(1,10,8).scale(.14,.14,.28),dark,0,-.42,.11,this.engine);
  this.propeller.position.set(0,-.43,.37);this.engine.add(this.propeller);
  for(let i=0;i<3;i++){const blade=mesh(new THREE.SphereGeometry(1,10,6).scale(.08,.23,.028),chrome,0,.15,0,this.propeller);blade.rotation.z=i*Math.PI*2/3;blade.position.set(-Math.sin(blade.rotation.z)*.15,Math.cos(blade.rotation.z)*.15,0);}
  this.number=numberTexture(id%99+1);const numberMat=new THREE.MeshStandardMaterial({map:this.number,roughness:.55,side:THREE.DoubleSide});this.mats.add(numberMat);
  for(const side of [-1,1]){const badge=mesh(new THREE.PlaneGeometry(.52,.25),numberMat,side*.96,.32,1.24);badge.rotation.y=side*Math.PI/2;}
  const bowBadge=mesh(new THREE.PlaneGeometry(.42,.21),numberMat,0,.455,-1.56);bowBadge.rotation.x=-Math.PI/2;
  batchStatic(this.root);batchStatic(this.engine);batchStatic(this.wheel);batchStatic(this.propeller);
  this.rider=new Avatar(id);this.rider.driving=true;this.rider.addTo(scene);this.rider.setOutfit(outfit);this.rider.setInfo(name,null,false);
  this.ready=sourceBoat().then(source=>{
   if(this.disposed)return;const hull=source.clone(true);hull.name='kenney-authored-hull';hull.rotation.y=Math.PI;hull.scale.set(1.075,.83,1.31);hull.position.y=-.34;
   hull.traverse(o=>{if(!(o instanceof THREE.Mesh))return;o.geometry=o.geometry.clone();const colors=o.geometry.getAttribute('color'),mask=o.geometry.getAttribute('_boat_paint');if(colors&&mask){const pearl=new THREE.Color(0xeae8dc);for(let i=0;i<colors.count;i++)if(mask.getX(i)>.5){const k=.88+Math.min(.12,colors.getY(i)*.45);colors.setXYZ(i,pearl.r*k,pearl.g*k,pearl.b*k);}}
    const m=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.31,metalness:.035,clearcoat:.75,clearcoatRoughness:.23});const solid:number[]=[],glazing:number[]=[];const index=o.geometry.index;
    if(index&&colors){for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];const list=ids.every(k=>colors.getZ(k)>.8&&colors.getY(k)>.5&&colors.getX(k)<.85)?glazing:solid;list.push(...ids);}o.geometry.setIndex([...solid,...glazing]);o.geometry.clearGroups();o.geometry.addGroup(0,solid.length,0);o.geometry.addGroup(solid.length,glazing.length,1);o.material=[m,glass];}else o.material=m;
    this.mats.add(m);o.castShadow=true;o.receiveShadow=true;});
   this.root.add(hull);this.loaded=true;
  }).catch(()=>{this.loaded=false;});
 }
 outfit(outfit:Outfit,name:string):void{this.accent.color.setHex(PALETTE[outfit.c]??0x287a92);this.rider.setOutfit(outfit);this.rider.setInfo(name,null,false);}
 update(x:number,z:number,hx:number,hz:number,steer:number,speed:number,tick:number,dt:number,camera:THREE.Vector3,local:boolean):void{
  const wave=boatWave(x,z,tick),yaw=Math.atan2(-hx,-hz),v=Math.min(1,speed/23),acc=dt>0?THREE.MathUtils.clamp((speed-this.previousSpeed)/dt,-8,8):0;this.previousSpeed=speed;
  const blend=1-Math.exp(-dt*6);this.roll+=(wave.roll*.72+steer*v*.16-this.roll)*blend;this.pitch+=(wave.pitch*.75+v*.055+acc*.003-this.pitch)*blend;
  this.root.position.set(x,wave.y+.025*v,z);this.root.rotation.set(this.pitch,yaw,this.roll,'YXZ');this.root.updateMatrixWorld(true);
  this.engine.rotation.y=-steer*.30;this.engine.rotation.x=-v*.09;this.propeller.rotation.z=tick*(.3+speed*.035);this.wheel.rotation.z=steer*DRIVE_TURN;
  this.seat.set(SPORT_BOAT.seatX,SPORT_BOAT.seatY,SPORT_BOAT.seatZ).applyMatrix4(this.root.matrixWorld);
  this.rider.steer=steer;Object.assign(this.riderPose,{x:this.seat.x,y:this.seat.y,z:this.seat.z,yaw});this.rider.update(this.riderPose,dt,tick/60,{groundBelow:()=>-100},camera,local);this.rider.root.rotation.set(this.pitch,yaw,this.roll,'YXZ');
 }
 debug():{assetLoaded:boolean;beam:number;length:number}{return{assetLoaded:this.loaded,beam:SPORT_BOAT.beam,length:SPORT_BOAT.length};}
 dispose(scene:THREE.Scene):void{this.disposed=true;scene.remove(this.root);this.rider.dispose(scene);const geometries=new Set<THREE.BufferGeometry>();this.root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])this.mats.add(m);}});for(const g of geometries)g.dispose();for(const m of this.mats)m.dispose();this.number.dispose();}
}
