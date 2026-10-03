import * as THREE from 'three';
import { HIDE_FORMS,HIDE_PROPS,type HideForm,type HideProp } from '../../shared/hide.ts';
import { mergeColored,paint,place } from '../render/kit.ts';
/** Одна геометрия на вид и один материал: игрок и декорация не отличаются ни цветом, ни тенями. */
function geometry(form:HideForm):THREE.BufferGeometry {
 const parts:THREE.BufferGeometry[]=[];const wood=HIDE_FORMS[form].color,metal=0x445765;
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>parts.push(place(paint(new THREE.BoxGeometry(w,h,d),color),x,y,z));
 if(form==='barrel'){
  parts.push(place(paint(new THREE.CylinderGeometry(.53,.53,1.22,14),wood),0,.61,0));
  for(const y of [.16,.98])parts.push(place(paint(new THREE.CylinderGeometry(.557,.557,.095,14),metal),0,y,0));
  parts.push(place(paint(new THREE.CylinderGeometry(.46,.46,.035,14),0x536f73),0,1.24,0));
 }else if(form==='pot'){
  parts.push(place(paint(new THREE.CylinderGeometry(.49,.34,.66,12),wood),0,.33,0));
  parts.push(place(paint(new THREE.CylinderGeometry(.54,.54,.105,12),0xd59c74),0,.65,0));
  parts.push(place(paint(new THREE.CylinderGeometry(.45,.45,.05,12),0x453e30),0,.7,0));
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;parts.push(place(paint(new THREE.IcosahedronGeometry(.31,0).scale(.9,1.2,.9),i%2?0x648d5b:0x80a56c),Math.sin(a)*.21,1.02+((i%2)*.1),Math.cos(a)*.21));}
 }else if(form==='bench'){
  for(const x of [-.95,.95]){box(x,.27,0,.12,.54,.76,metal);box(x,.68,.37,.1,.72,.12,metal);}
  for(const z of [-.35,-.1,.15,.38])box(0,.55,z,2.48,.12,.18,wood);
  for(const y of [.8,.98])box(0,y,.43,2.48,.14,.1,wood);
 }else{
  box(0,.57,0,1.2,1.14,1.2,wood);
  for(const y of [.12,1.02]){box(0,y,.608,1.24,.14,.04,0x8c623e);box(.608,y,0,.04,.14,1.24,0x8c623e);box(-.608,y,0,.04,.14,1.24,0x8c623e);box(0,y,-.608,1.24,.14,.04,0x8c623e);}
 }
 return mergeColored(parts);
}
export class HideProps {
 private readonly meshes=new Map<HideForm,THREE.InstancedMesh>();private readonly dummy=new THREE.Object3D();
 private readonly instances=new Map<number,{mesh:THREE.InstancedMesh;index:number}>();
 private readonly raycaster=new THREE.Raycaster();private readonly instanceMatrix=new THREE.Matrix4();private readonly normalMatrix=new THREE.Matrix3();
 private readonly material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85});
 constructor(scene:THREE.Scene){for(const form of HIDE_PROPS){const mesh=new THREE.InstancedMesh(geometry(form),this.material,64);mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;this.meshes.set(form,mesh);scene.add(mesh);}}
 update(props:readonly HideProp[],ownId=0,own?:{x:number;y:number;z:number}):void {
  this.instances.clear();
  for(const mesh of this.meshes.values())mesh.count=0;
  for(const prop of props){const mesh=this.meshes.get(prop.form);if(!mesh||mesh.count>=64)continue;const p=prop.id===ownId&&own?own:prop;this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(0,prop.yaw,0);this.dummy.updateMatrix();this.instances.set(prop.id,{mesh,index:mesh.count});mesh.setMatrixAt(mesh.count++,this.dummy.matrix);}
  for(const mesh of this.meshes.values()){mesh.instanceMatrix.needsUpdate=true;mesh.boundingSphere=null;}
 }
 /** Paint attaches to a visible triangle of the anonymous prop, never to empty space in its gameplay box. */
 raycastProp(id:number,origin:THREE.Vector3,direction:THREE.Vector3,maxDistance:number):{point:THREE.Vector3;normal:THREE.Vector3;size:number}|null {
  const entry=this.instances.get(id);if(!entry)return null;
  const {mesh,index}=entry;mesh.updateMatrixWorld(true);
  this.raycaster.set(origin,direction);this.raycaster.near=0;this.raycaster.far=maxDistance;
  const hits:THREE.Intersection[]=[];mesh.raycast(this.raycaster,hits);
  const hit=hits.filter(h=>h.instanceId===index&&h.face).sort((a,b)=>a.distance-b.distance)[0];if(!hit?.face)return null;
  mesh.getMatrixAt(index,this.instanceMatrix);this.instanceMatrix.premultiply(mesh.matrixWorld);this.normalMatrix.getNormalMatrix(this.instanceMatrix);
  // Box triangles share their face bounds, so the internal triangulation diagonal does not erase centre hits.
  // Limit the footprint on narrow rendered pieces (bench legs/slats), rather than painting a full gameplay box.
  const local=hit.point.clone().applyMatrix4(this.instanceMatrix.clone().invert()),vertices=[hit.face.a,hit.face.b,hit.face.c].map(i=>new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i));
  const axes=['x','y','z'] as const,normalAxis=axes.reduce((a,b)=>Math.abs(hit.face!.normal[a])>Math.abs(hit.face!.normal[b])?a:b);
  let size=.72;
  for(const axis of axes){if(axis===normalAxis)continue;const lo=Math.min(...vertices.map(v=>v[axis])),hi=Math.max(...vertices.map(v=>v[axis]));size=Math.min(size,Math.max(0,Math.min(local[axis]-lo,hi-local[axis]))*Math.SQRT2);}
  if(size<.025)return null;
  return {point:hit.point.clone(),normal:hit.face.normal.clone().applyMatrix3(this.normalMatrix).normalize(),size};
 }
 clear():void{this.instances.clear();for(const mesh of this.meshes.values())mesh.count=0;}
 dispose():void{for(const mesh of this.meshes.values()){mesh.removeFromParent();mesh.geometry.dispose();}this.material.dispose();}
}
