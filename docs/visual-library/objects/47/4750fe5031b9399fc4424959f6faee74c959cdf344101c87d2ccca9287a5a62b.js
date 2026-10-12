// Reuses the real old Lab environment, Avatar and production actor geometry.
// This adapter lives only in the artifact; no production source is edited.
import * as THREE from '../../../game-opus/node_modules/three/build/three.module.js';
import {kit as originalKit,Jelly} from '../../../game-opus/client/lab/kit3d.ts';
import {LabSound} from '../../../game-opus/client/lab/sound.ts';
import {Avatar} from '../../../game-opus/client/render/avatar.ts';
import {BoatModel} from '../../../game-opus/client/lobby/regattaboat.ts';
import {Kart3D} from '../../../game-opus/client/race/kart3d.ts';
import {Billiards3D} from '../../../game-opus/client/lobby/billiards3d.ts';
import {BL_TABLES,BL_OUT_HX,BL_OUT_HZ} from '../../../game-opus/shared/billiards.ts';
import {DEFAULT_OUTFIT} from '../../../game-opus/shared/outfit.ts';
import {WATER_Y} from '../../../game-opus/shared/constants.ts';
import {KE_ON,KE_GROUND,KE_DRIFT,KE_BOOST} from '../../../game-opus/shared/kartnet.ts';
export {THREE,LabSound};
let nextActor=33000;
function retainActor(model,avatar,objects,nativeUpdate,kind=model.constructor.name){
 const root=model.root,clonedMats=new Map();let owner=null,visible=true,disposed=false,updates=0,opacity=1,last=null;
 root.userData.labActor={
  attach(scene){if(disposed)throw Error('Актёр уже освобождён');owner=scene;for(const o of objects)scene.add(o);},
  setVisible(on){visible=on;if(!on)for(const o of objects)o.visible=false;else root.visible=true;},
  setOpacity(alpha){opacity=alpha;const copy=m=>{if([...clonedMats.values()].includes(m))return m;if(!clonedMats.has(m)){const c=m.clone();c.onBeforeCompile=m.onBeforeCompile;c.customProgramCacheKey=m.customProgramCacheKey;clonedMats.set(m,c);}return clonedMats.get(m);};for(const o of objects)o.traverse(n=>{if(!n.material)return;n.material=Array.isArray(n.material)?n.material.map(copy):copy(n.material);for(const m of Array.isArray(n.material)?n.material:[n.material]){m.transparent=alpha<1;m.opacity=alpha;m.depthWrite=alpha===1;}});},
  update(s,y,dt,t,cam){if(disposed)return;nativeUpdate(s,y,dt,t,cam||new THREE.Vector3(0,3,8),visible);updates++;last={x:s.x,z:s.z,yaw:-s.yaw-Math.PI/2,steer:s.steer};if(!visible)for(const o of objects)o.visible=false;},
  state(){return{retainedClass:kind,updates,disposed,visible,opacity,driverSteer:avatar.steer,last,ownedObjects:objects.length,separateDriver:!!owner&&avatar.root.parent===owner};},
  dispose(){if(disposed)return;disposed=true;for(const o of objects)o.removeFromParent();model.dispose(owner||new THREE.Scene());for(const m of clonedMats.values())m.dispose();clonedMats.clear();owner=null;}
 };return root;
}
export const kit={
 ...originalKit,
 WATER:-.3,
 diorama(opts={}){
  const d=originalKit.diorama(opts);
  const actors=new Set(),dispose=d.dispose.bind(d);
  d.scene.userData.labWorldTime=t=>{if(d.sky?.material.uniforms.uTime)d.sky.material.uniforms.uTime.value=t;if(d.sea?.material.uniforms.uTime)d.sea.material.uniforms.uTime.value=t;};
  d.scene.userData.labOwnActor=root=>{const actor=root.userData.labActor;actor.attach(d.scene);actors.add(actor);};
  d.dispose=()=>{for(const actor of actors)actor.dispose();actors.clear();dispose();};
  // Short diagnostic water slices use a local datum, explicitly separate from production geometry.
  if(d.sea)d.sea.position.y=opts.waterY??-.3;
  const jelly=d.jelly.bind(d);
  d.jelly=(o={})=>{
   let j;
   if(o.gun){
    const a=new Avatar(nextActor++,{gun:true,voice:false});a.setOutfit({...DEFAULT_OUTFIT,h:'none',...o.outfit});a.setInfo('',null,false,1);a.addTo(d.scene);
    j=new Jelly(a);j.pos.set(o.x??0,0,o.z??0);j.yaw=o.yaw??0;if(o.name)d.tag(j,o.name);d.jellies.push(j);j.update(.016,0,d.camera.position);
   }else j=jelly(o);
   const avatarUpdate=j.avatar.update.bind(j.avatar),surface={groundBelow:()=>j.grounded?j.pos.y:-1000};
   j.avatar.update=(pose,dt,t,_ground,cam,local)=>avatarUpdate(pose,dt,t,surface,cam,local);
   Object.defineProperty(j,'root',{get:()=>j.avatar.root});
   return j;
  };
  return d;
 },
 label(text,{x=0,y=2,z=0,width=3}={}){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=144;
  const g=canvas.getContext('2d');g.clearRect(0,0,768,144);g.fillStyle='#fff4dc';g.strokeStyle='#0e5550';g.lineWidth=10;g.lineJoin='round';g.font='700 58px Rubik';g.textAlign='center';g.textBaseline='middle';g.strokeText(text,384,72,730);g.fillText(text,384,72,730);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,toneMapped:false}));s.position.set(x,y,z);s.scale.set(width,width*144/768,1);return s;
 },
 ring(radius,color=0xffcd4a){const m=new THREE.Mesh(new THREE.RingGeometry(radius*.87,radius,40),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));m.rotation.x=-Math.PI/2;return m;},
 gripWorld(j,targets){
  const mittens=j.avatar.mittens;
  if(!Array.isArray(mittens)||mittens.length!==2)throw new Error('У настоящего Avatar отсутствуют варежки');
  j.avatar.root.updateMatrixWorld(true);
  const errors=[];
  for(let i=0;i<2;i++){
   const m=mittens[i],world=targets[i].clone();
   m.parent.updateWorldMatrix(true,false);m.position.copy(m.parent.worldToLocal(world));m.visible=true;m.updateMatrixWorld(true);
   errors.push(m.getWorldPosition(new THREE.Vector3()).distanceTo(targets[i]));
  }
  return errors;
 },
 muzzleWorld:j=>j.avatar.muzzle(new THREE.Vector3()),
 async boat(){
  const scene=new THREE.Scene(),id=nextActor++;
  const model=new BoatModel(scene,0,id,false,{...DEFAULT_OUTFIT,c:0,h:'none'},'');
  await model.ready;
  if(!model.debug().assetLoaded){model.dispose(scene);throw Error('Настоящий GLB корпуса катера не загрузился');}
  const rider=model.rider;
  model.root.visible=true;model.root.userData.actorSource='Retained BoatModel + kenney-speed-a.glb + world-space Avatar';
  return retainActor(model,rider,[model.root,rider.root,rider.shadow],(s,y,dt,t,cam,on)=>{
   model.update(s.x,s.z,0,Math.cos(s.yaw),Math.sin(s.yaw),s.steer,Math.hypot(s.vx||0,s.vz||0),s.drift?s.driftDir:0,t,dt,cam,false,on);
   const raise=y-WATER_Y;model.root.position.y+=raise;rider.root.position.y+=raise;rider.shadow.position.y+=raise;model.seat.y+=raise;model.root.updateMatrixWorld(true);rider.root.updateMatrixWorld(true);
  },'BoatModel');
 },
 kart(){
  const model=new Kart3D(nextActor++,0xe5483b,1);
  model.setDriver('',{...DEFAULT_OUTFIT,c:9,h:'none'});
  const rider=model.avatar;
  model.root.userData.actorSource='Retained Kart3D + world-space driving Avatar';
  return retainActor(model,rider,[model.root,model.shadow,rider.root,rider.shadow],(s,y,dt,t,cam,on)=>{
   const p={x:s.x,y:y-.02,z:s.z,yaw:-s.yaw-Math.PI/2,steer:s.steer,flags:KE_ON|KE_GROUND|(s.drift?KE_DRIFT:0)|(s.boost>0?KE_BOOST:0),misc:0};
   model.update(on?p:null,dt,t,{groundAt:(_x,_z,loc)=>{if(loc)loc.surf=0;return 0;}},null,cam,false);
  },'Kart3D');
 },
 billiardsTable(){
  const scene=new THREE.Scene(),hall=new Billiards3D(scene),root=new THREE.Group();
  const center=BL_TABLES[0];
  // Production tables are merged. Keep exact authored triangles of the first table, without hall/lamps/balls.
  hall.group.updateMatrixWorld(true);
  hall.group.traverse(mesh=>{
   if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.geometry?.attributes.position)return;
   const geo=mesh.geometry,pos=geo.attributes.position,indices=geo.index;const attributes={};
   for(const [name,attr] of Object.entries(geo.attributes))if(attr.itemSize<=4)attributes[name]=[];
   const count=indices?indices.count:pos.count;
   for(let i=0;i+2<count;i+=3){
    const ids=[0,1,2].map(j=>indices?indices.getX(i+j):i+j);
    const vv=ids.map(j=>new THREE.Vector3().fromBufferAttribute(pos,j).applyMatrix4(mesh.matrixWorld));
    if(!vv.every(p=>Math.abs(p.x-center.x)<BL_OUT_HX+.05&&Math.abs(p.z-center.z)<BL_OUT_HZ+.05&&p.y<1.04&&p.y>-.08))continue;
    for(let k=0;k<3;k++)for(const [name,out] of Object.entries(attributes)){
     const attr=geo.attributes[name],index=ids[k];
     if(name==='position')out.push(vv[k].x-center.x,vv[k].y,vv[k].z-center.z);
     else for(let q=0;q<attr.itemSize;q++)out.push(attr['get'+['X','Y','Z','W'][q]](index));
    }
   }
   if(!attributes.position?.length)return;
   const result=new THREE.BufferGeometry();
   for(const [name,values] of Object.entries(attributes))result.setAttribute(name,new THREE.Float32BufferAttribute(values,geo.attributes[name].itemSize));
   if(!result.attributes.normal)result.computeVertexNormals();
   const materials=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
   const piece=new THREE.Mesh(result,materials);piece.castShadow=true;piece.receiveShadow=true;root.add(piece);
  });
  root.name='actual-billiards-table';root.userData.actorSource='Exact triangle subset of current client/lobby/billiards3d.ts';
  if(!root.children.length)throw new Error('Не удалось выделить настоящий стол Billiards3D');return root;
 }
};
