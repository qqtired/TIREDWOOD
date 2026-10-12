import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {NativeTimeline,clipSuffix,CLIP_LABELS,rootMotionCorrection,deathPhases} from './native-model-timeline.mjs';

const DEATH_RU={ropecrab:['Срывается стопор, отдельно раскручивается катушка','Разматывается канат, лапы оседают по очереди','Панцирь осел; крюк и катушка останавливаются последними'],jampump:['Отлетает клапан при опёртом корпусе','Две петли шланга и остаток варенья','Бак сдувается; барсук садится; сопло падает последним'],canopy:['Отщёлкивается замок под шляпой','Рёбра складываются по очереди, шляпа опускается','Ножка втягивается; корневые башмаки остаются'],foreman:['Срывается храповик отдельно от тела','Опоры складываются, щит падает вперёд','Хвост тормозит; бобр садится, роняет молоток'],crabcrane:['Лопается тормоз; опоры проседают разной фазой','Стрела кладёт груз в поле','Корпус садится, лапы теряют натяжение','Свободный блок качается после остановки тела'],miller:['Срывается муфта, колесо тормозит рывками','Лопасть ломается, мука оседает','Мельничиха садится на мешок; колесо откатывается','Платок падает, рукоять останавливается последней']};
const bytes=uri=>{const raw=atob(uri.slice(uri.indexOf(',')+1)),array=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)array[i]=raw.charCodeAt(i);return array.buffer;};
const v=()=>new THREE.Vector3();
export class NativeModelViewer{
 constructor({scene,camera,controls,assets,onInfo}){
  this.assets=assets;this.camera=camera;this.controls=controls;this.onInfo=onInfo;this.loader=new GLTFLoader();this.cache=new Map();this.ticket=0;this.holdWalk=true;this.showPorts=false;this.visible=false;this.active=null;this.root=new THREE.Group();this.root.name='FortressR2NativeViewer';scene.add(this.root);
  this.root.visible=false;this.annotation=new THREE.Group();this.root.add(this.annotation);this.portMarkers=new Map();this.line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([v(),v()]),new THREE.LineBasicMaterial({color:'#d4ae78'}));this.annotation.add(this.line);
  this.stream=new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({length:16},()=>v())),new THREE.LineBasicMaterial({color:'#8c35a9'}));this.annotation.add(this.stream);
  this.target=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,1.2,8),new THREE.MeshStandardMaterial({color:'#99643e',roughness:.9}));this.annotation.add(this.target);
 }
 async select(id,variant='A'){
  if(!this.assets.ready)throw new Error('Accepted native models are not embedded');const entry=this.assets.models.find(m=>m.id===id);if(!entry)throw new Error('Unknown R2 id');
  const asset=variant==='B'&&id==='foreman'?this.assets.textureAB:null;if(variant==='B'&&!asset)throw new Error('Accepted atlas B unavailable');
  const ticket=++this.ticket,key=id+':'+variant;this.error=null;this.loading=true;this.onInfo?.({loading:true,id});
  if(!this.cache.has(key))this.cache.set(key,this.loader.parseAsync(bytes((asset??entry).asset.glb),'').then(gltf=>{
   gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});const holder=new THREE.Group();holder.add(gltf.scene);this.root.add(holder);holder.visible=false;gltf.scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(gltf.scene),center=box.getCenter(v()),size=box.getSize(v());holder.position.set(-center.x,0,-center.z);
   const rootNode=entry.rootMotionNode?gltf.scene.getObjectByName(entry.rootMotionNode):null;
   const model={entry,variant,gltf,holder,mixer:new THREE.AnimationMixer(gltf.scene),timeline:new NativeTimeline(entry),rootNode,rootRest:rootNode?.position.clone(),holderRest:holder.position.clone(),size,restMinY:box.min.y,action:null,lastClip:null,ports:{}};
   for(const [key,port]of Object.entries(entry.ports??{})){const object=gltf.scene.getObjectByName(port.node);if(!object)throw new Error('Missing exported port '+port.node);model.ports[key]=object;}
   for(const clip of gltf.animations){const metadata=entry.clipTimings.find(t=>t.name===clip.name);if(metadata&&Math.abs(clip.duration-metadata.runtimeDuration)>2e-5)throw new Error('Actual AnimationClip.duration mismatch: '+clip.name);}
   return model;
  }));
  let model;try{model=await this.cache.get(key);}catch(error){if(ticket!==this.ticket)return false;this.loading=false;this.error=error.message;this.root.visible=this.visible=false;throw error;}if(ticket!==this.ticket)return false;if(this.active)this.active.holder.visible=false;this.active=model;model.holder.visible=true;this.root.visible=true;this.visible=true;this.loading=false;model.timeline.setClip(entry.id+'_idle');this.sample();this.fitCamera();return true;
 }
 hide(){this.ticket++;this.loading=false;this.visible=false;this.root.visible=false;}
 fitCamera(){if(!this.active)return;const size=this.active.size,r=Math.max(size.x,size.y,size.z,.8),tan=Math.tan(THREE.MathUtils.degToRad(this.camera.fov)/2),width=Math.hypot(size.x,size.z),distance=1.3*Math.max(width/(2*tan*this.camera.aspect),size.y/(2*tan))+size.z*.5,target=new THREE.Vector3(0,size.y*.45,0),direction=new THREE.Vector3(1.35,.8,2.15).normalize();this.camera.position.copy(target).addScaledVector(direction,distance);this.controls.target.copy(target);this.controls.minDistance=r*.55;this.controls.maxDistance=Math.max(100,r*8);this.controls.update();}
 setClip(name){if(!this.active)return;this.active.timeline.setClip(name);this.sample();}
 setCycle(){if(!this.active)return;this.active.timeline.setCycle();this.sample();}
 seek(t){if(!this.active)return;this.active.timeline.seek(t);this.sample();}
 reset(){if(!this.active)return;this.active.timeline.seek(0);this.sample();}
 setHoldWalk(value){this.holdWalk=!!value;this.sample();}
 setPorts(value){this.showPorts=!!value;this.sample();}
 tick(dt,playing){if(!this.active||!this.visible||this.loading)return;if(playing)this.active.timeline.step(dt);this.sample();}
 sample(){
  const m=this.active;if(!m)return;const state=m.timeline.snapshot(),clip=m.gltf.animations.find(c=>c.name===state.clip);if(!clip)throw new Error('GLB clip not found');
  if(m.lastClip!==clip.name){m.mixer.stopAllAction();m.action=m.mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);m.action.clampWhenFinished=true;m.lastClip=clip.name;}
  m.action.reset().play();m.mixer.setTime(state.clipTime);
  const correction=m.rootNode?rootMotionCorrection(m.rootRest.toArray(),m.rootNode.position.toArray(),this.holdWalk,state.suffix):[0,0,0];m.holder.position.copy(m.holderRest).add(new THREE.Vector3(...correction));this.root.updateMatrixWorld(true);
  for(const marker of this.portMarkers.values())marker.visible=false;
  for(const [name,object]of Object.entries(m.ports)){let marker=this.portMarkers.get(name);if(!marker){marker=new THREE.Mesh(new THREE.SphereGeometry(.055,10,8),new THREE.MeshBasicMaterial({color:name==='weaknessPort'?'#ffcd4a':'#85d8d4',depthTest:false}));this.annotation.add(marker);this.portMarkers.set(name,marker);}marker.visible=this.showPorts;object.getWorldPosition(marker.position);}
  const activeAction=['windup','attack','route_attach','pump','hook','gust'].includes(state.suffix);this.line.visible=this.stream.visible=this.target.visible=false;
  if(m.ports.tetherPort&&activeAction){const from=m.ports.tetherPort.getWorldPosition(v()),to=new THREE.Vector3(from.x,.6,Math.max(2.8,m.size.z*1.4));this.line.geometry.setFromPoints([from,to]);this.line.visible=true;this.target.position.copy(to);this.target.visible=true;}
  // Pump jet is an actual GLB node with native scale keys. No invented arc or
  // windup emission; the event adapter extends this actual phase along barrel.
  this.onInfo?.({...this.snapshot,loading:false});
 }
 get snapshot(){if(!this.active)return {loading:this.loading,error:this.error,ready:false};const m=this.active,s=m.timeline.snapshot(),phase=s.suffix==='death'?deathPhases(m.entry).findIndex(p=>s.clipTime>=p.start&&s.clipTime<=p.end):-1;return {...s,ready:this.visible&&!this.error,loading:this.loading,error:this.error,variant:m.variant,holdWalk:this.holdWalk&&s.suffix==='walk'&&!!m.rootNode,showPorts:this.showPorts,height:m.entry.height,width:m.entry.width,triangles:m.entry.triangles,materials:m.entry.materials,rootMotionNode:m.entry.rootMotionNode,restMinY:m.restMinY,phaseRu:phase>=0?DEATH_RU[m.entry.id]?.[phase]??s.phase:null};}
 get exportedPorts(){if(!this.active)return{};return Object.fromEntries(Object.entries(this.active.ports).map(([name,node])=>[name,{node:node.name,world:node.getWorldPosition(v()).toArray()}]));}
 get clips(){return this.active?.entry.clips.map(name=>({name,label:CLIP_LABELS[clipSuffix(this.active.entry.id,name)]??clipSuffix(this.active.entry.id,name)}))??[];}
 get phases(){return this.active?deathPhases(this.active.entry).map((p,i)=>({...p,text:DEATH_RU[this.active.entry.id]?.[i]??p.text})):[];}
 get contactFrames(){if(!this.active)return[];const m=this.active,clip=m.entry.contactChecks?.clips?.find(c=>c.name===m.entry.id+'_death'),timing=m.entry.clipTimings.find(c=>c.name===m.entry.id+'_death');return Object.entries(clip?.firstFloorContactS??{}).filter(([,time])=>time>0).map(([part,time])=>({part,time:time+timing.inputStart})).sort((a,b)=>a.time-b.time);}
 get currentContactChecks(){return this.active?.entry.contactChecks?.clips?.find(c=>c.name===this.active.timeline.snapshot().clip)??null;}
}
