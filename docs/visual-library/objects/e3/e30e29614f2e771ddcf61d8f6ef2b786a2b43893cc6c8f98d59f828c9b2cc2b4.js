import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const decode=uri=>Uint8Array.from(atob(uri.slice(uri.indexOf(',')+1)),c=>c.charCodeAt(0)).buffer;
export function canopyScenePose(entry,state,index){
 const mapping=entry.sceneClips??{},impact=state.choiceAt+1,broken=index===0&&state.choice==='canopy'&&state.t>=impact;
 let name=entry.id+'_idle',elapsed=state.t,disabled=false;
 if(broken){if(!mapping.coverBreak||!mapping.coverDisabled)return {ready:false,reason:'Нет живых клипов поломки'};const timing=entry.clipTimings.find(c=>c.name===mapping.coverBreak),duration=timing.inputEnd-timing.inputStart;elapsed=state.t-impact;if(elapsed>=duration){name=mapping.coverDisabled;elapsed-=duration;disabled=true;}else name=mapping.coverBreak;}
 const timing=entry.clipTimings.find(c=>c.name===name);if(!timing)return {ready:false,reason:'Нет фактических интервалов '+name};const span=timing.inputEnd-timing.inputStart,time=timing.inputStart+(name===mapping.coverBreak?Math.min(span,elapsed):elapsed%span);
 return {ready:true,clip:name,time,coverage:!broken,disabled,alive:true};
}
export class NativeCanopyActors{
 constructor(scene,assets){this.entry=assets.ready?assets.models.find(m=>m.id==='canopy'):null;this.loader=new GLTFLoader();this.root=new THREE.Group();this.root.visible=false;scene.add(this.root);this.ready=false;this.loading=false;this.status={ready:false};}
 load(){if(this.promise)return this.promise;if(!this.entry)return Promise.resolve(false);this.loading=true;this.promise=this.loader.parseAsync(decode(this.entry.asset.glb),'').then(gltf=>{
  const mapping=this.entry.sceneClips??{};this.breakName=mapping.coverBreak;this.disabledName=mapping.coverDisabled;
  if(!this.breakName||!this.disabledName)throw new Error('Живая поломка навеса ещё не экспортирована; клип гибели не используется.');
  for(const name of[this.breakName,this.disabledName])if(!gltf.animations.some(a=>a.name===name))throw new Error('Нет живого клипа '+name);
  this.clips=gltf.animations;this.views=[0,1].map(()=>{const model=gltf.scene.clone(true),holder=new THREE.Group();holder.add(model);this.root.add(holder);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return {model,holder,mixer:new THREE.AnimationMixer(model)};});this.loading=false;this.ready=true;this.status={ready:true};return true;
 }).catch(error=>{this.loading=false;this.status={ready:false,error:error.message};console.error(error);return false;});return this.promise;}
 hide(){this.root.visible=false;}
 update(state){if(state.id!=='spread'){this.hide();return;}this.root.visible=this.ready;if(!this.ready){this.status={...this.status,ready:false,loading:this.loading};return;}
  const actors=[];for(let i=0;i<this.views.length;i++){const view=this.views[i],group=state.groups[i];view.holder.visible=!!group;if(!group)continue;view.holder.position.set(group.center,0,-24.5);
   const pose=canopyScenePose(this.entry,state,i);if(!pose.ready)throw new Error(pose.reason);const name=pose.clip,time=pose.time,clip=this.clips.find(c=>c.name===name);
   if(view.name!==name){view.mixer.stopAllAction();view.action=view.mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);view.action.clampWhenFinished=true;view.name=name;}
   view.action.reset().play();view.mixer.setTime(time);view.model.updateMatrixWorld(true);actors.push({index:i,...pose,world:view.holder.position.toArray()});
  }this.status={ready:true,actors,scope:'Носители стоят в зоне строя; движение старой группы задано сценарным маршрутом. Это не симуляция сопровождения и его радиуса.'};
 }
}
