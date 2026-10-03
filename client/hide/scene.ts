import * as THREE from 'three';
import { cameraRig,RIG_LOBBY } from '../../shared/aim.ts';
import { viewDir } from '../../shared/math.ts';
import { EYE_HEIGHT } from '../../shared/constants.ts';
import { HIDE_FORMS,HIDE_PROPS,type HideClientMsg,type HideServerMsg } from '../../shared/hide.ts';
import { HIDE_BOUNDS } from '../../shared/hidephysics.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { encodeInputs,E_ALIVE,E_GROUNDED } from '../../shared/protocol.ts';
import { makeInput } from '../../shared/sim.ts';
import { LobbyWorld } from '../lobby/world.ts';
import { HideMotion } from './motion.ts';
import { Avatar,tickAvatarShared,type AvatarPose } from '../render/avatar.ts';
import type { Scene,SceneDeps } from '../scene.ts';
import type { Quality } from '../settings.ts';
import { HideProps } from './props.ts';
import { HideShots } from './shots.ts';
import './hide.css';

export class HideScene implements Scene {
 readonly kind='hide' as const;readonly wantsPointer=true;readonly touchMode='walk' as const;
 readonly world:LobbyWorld;private readonly d:SceneDeps;private motion:HideMotion;
 private readonly props:HideProps;private readonly shots:HideShots;private readonly hunter:Avatar;private readonly hunterPose:AvatarPose={x:0,y:0,z:0,yaw:0,pitch:0,flags:E_ALIVE|E_GROUNDED};
 private readonly root:HTMLElement;private readonly title:HTMLElement;private readonly info:HTMLElement;private readonly clock:HTMLElement;private readonly notice:HTMLElement;private readonly blind:HTMLElement;private readonly forms:HTMLElement;private readonly freeze:HTMLButtonElement;
 private readonly cross:HTMLElement;private readonly cue:THREE.Mesh;private readonly pos=new THREE.Vector3();private readonly look=new THREE.Vector3();private readonly direction=new THREE.Vector3();
 private message:HideServerMsg|null=null;private active=false;private acc=0;private seq=0;private lastHud=0;private lastShot=0;private lastCue=0;private readonly inputs=[makeInput()];
 constructor(d:SceneDeps){
  this.d=d;this.world=new LobbyWorld(d.renderer,d.settings.quality==='low'?'low':d.settings.quality==='medium'?'medium':'high');this.motion=new HideMotion(this.world.collision);
  this.props=new HideProps(this.world.scene);this.hunter=new Avatar(65000,{voice:false});this.hunter.addTo(this.world.scene);
  this.shots=new HideShots(this.world.scene,this.world.collision,d.sound,(id,origin,direction,max)=>this.props.raycastProp(id,origin,direction,max));
  // Нейтральная граница отдельной арены; исходная геометрия и памятник не изменяются.
  const b=HIDE_BOUNDS,points=[new THREE.Vector3(b.minX,.025,b.minZ),new THREE.Vector3(b.maxX,.025,b.minZ),new THREE.Vector3(b.maxX,.025,b.maxZ),new THREE.Vector3(b.minX,.025,b.maxZ)];
  this.world.scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xe6c475,transparent:true,opacity:.45})));
  this.cue=new THREE.Mesh(new THREE.RingGeometry(2.3,2.5,32),new THREE.MeshBasicMaterial({color:0xffd47d,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));this.cue.rotation.x=-Math.PI/2;this.cue.visible=false;this.world.scene.add(this.cue);
  this.root=document.createElement('section');this.root.className='hide-hud';this.root.hidden=true;this.root.innerHTML=`<div class="hide-panel"><span class="hide-eyebrow">ГОРОДСКИЕ ПРЯТКИ</span><h2></h2><div class="hide-time"></div><p class="hide-info"></p><p class="hide-notice" role="status" aria-live="polite"></p></div><div class="hide-forms"></div><div class="hide-actions"><button type="button" data-a="freeze">Замереть · E</button><button type="button" data-a="rotate">Повернуть · R</button><button type="button" data-a="taunt">Шорох · T</button><button type="button" data-a="leave">На набережную</button></div><div class="hide-cross" aria-hidden="true">+</div><div class="hide-blind"><strong>Предметы прячутся</strong><span>Искатель выйдет через 20 секунд</span></div>`;
  this.title=this.root.querySelector('h2')!;this.info=this.root.querySelector('.hide-info')!;this.clock=this.root.querySelector('.hide-time')!;this.notice=this.root.querySelector('.hide-notice')!;this.blind=this.root.querySelector('.hide-blind')!;this.forms=this.root.querySelector('.hide-forms')!;this.cross=this.root.querySelector('.hide-cross')!;this.freeze=this.root.querySelector('[data-a="freeze"]')!;
  HIDE_PROPS.forEach((form,i)=>{const button=document.createElement('button');button.type='button';button.textContent=`${i+1} · ${HIDE_FORMS[form].name}`;button.addEventListener('click',()=>this.send({t:'hide',a:'form',form}));button.dataset.form=form;this.forms.append(button);});
  this.root.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(button=>button.addEventListener('click',()=>{const a=button.dataset.a;if(a==='leave')d.net.send({t:'leave'});else if(a==='freeze'&&this.message?.self.role==='hunter')this.shoot();else this.send({t:'hide',a:a as HideClientMsg['a']});}));d.hudRoot.append(this.root);
 }
 get touchUseIcon():string{return this.message?.self.role==='hunter'?'◎':'❄';}
 enter():void{this.active=true;this.message=null;this.seq=0;this.acc=0;this.lastCue=0;this.root.hidden=false;this.props.clear();this.shots.clear();this.hunter.update(null,0,0,this.world.collision,this.world.camera.position,false);this.motion=new HideMotion(this.world.collision);this.title.textContent='Собираемся';this.info.textContent='Нужно минимум двое';this.notice.textContent='';this.blind.hidden=true;this.cross.hidden=true;this.d.sound.setOutdoor(1);}
 exit():void{this.active=false;this.message=null;this.root.hidden=true;this.props.clear();this.shots.clear();this.cue.visible=false;this.hunter.update(null,0,0,this.world.collision,this.world.camera.position,false);}
 setQuality(q:Quality,slow=false):void{this.world.setQuality(q==='low'||slow?'low':q==='medium'?'medium':'high');}
 onJson(msg:ServerMsg):void{
  if(!this.active||(msg as {t:string}).t!=='hide_state')return;const m=msg as HideServerMsg;
  if(this.message&&this.message.phase==='seek'&&m.self.role==='hunter'&&m.remaining<this.message.remaining&&m.result!=='cancelled')this.d.sound.hitmarker(false);
  if(this.message&&m.cue&&m.cue.until!==this.lastCue&&m.self.role==='hunter')this.d.sound.fishNibble([m.cue.x,.6,m.cue.z]);
  this.lastCue=m.cue?.until??0;this.message=m;this.motion.accept(m,performance.now());
  this.shots.onState(m,this.world.camera.position);
  if(m.hunter){this.hunter.setInfo(m.hunter.nick,null,false,m.hunter.level);this.hunter.setOutfit(m.hunter.outfit);}
  this.updateHud(m.tick);
 }
 onSnapshot(_buf:ArrayBuffer,_at:number):void{}
 frame(now:number,dt:number):void{
  if(!this.active)return;const m=this.message;
  if(!m){this.world.camera.position.set(0,8,14);this.world.camera.lookAt(0,0,0);this.world.render();return;}
  // Clamp before serialization as well as rendering; no hidden mouse travel beyond the mode limit.
  this.d.input.pitch=Math.max(-1.2,Math.min(1.2,this.d.input.pitch));
  const tick=this.motion.tick(now);this.acc=Math.min(.15,this.acc+dt);
  while(this.acc>=1/60){this.acc-=1/60;const input=this.inputs[0];input.seq=++this.seq;input.buttons=this.d.input.sample();input.yaw=Math.fround(this.d.input.yaw);input.pitch=Math.fround(this.d.input.pitch);input.viewTick=tick;
   // The shared physics and authority apply the same walking constraints.
   this.motion.step(input);this.d.net.sendBinary(encodeInputs(this.inputs,0,1,this.d.net.epoch));}
  this.motion.render(now,dt,this.acc*60);this.pos.copy(this.motion.position);
  const yaw=this.d.input.yaw,pitch=this.d.input.pitch;
  if(m.self.role==='hunter'&&m.phase==='seek')this.world.camera.position.set(this.pos.x,this.pos.y+EYE_HEIGHT,this.pos.z);
  else cameraRig(this.pos.x,this.pos.y,this.pos.z,yaw,pitch,RIG_LOBBY,0,this.world.collision,this.world.camera.position);
  viewDir(yaw,pitch,this.direction);
  this.world.camera.lookAt(this.look.copy(this.direction).add(this.world.camera.position));
  this.d.sound.setListener(this.world.camera.position.x,this.world.camera.position.y,this.world.camera.position.z,this.direction.x,this.direction.y,this.direction.z);
  this.props.update(this.motion.props,m.self.propId,m.self.role==='prop'&&!m.self.found?this.pos:undefined);
  tickAvatarShared(now/1000,this.d.renderer.canvas.clientHeight || window.innerHeight);
  if(m.hunter&&m.self.role!=='hunter'&&m.phase!=='hide'){
   const h=this.motion.hunter;this.hunterPose.x=h.x;this.hunterPose.y=h.y;this.hunterPose.z=h.z;this.hunterPose.yaw=h.yaw;
   this.hunter.update(this.hunterPose,dt,now/1000,this.world.collision,this.world.camera.position,false);
  }else this.hunter.update(null,dt,now/1000,this.world.collision,this.world.camera.position,false);
  this.cue.visible=!!m.cue&&m.cue.until>tick&&m.self.role==='hunter';if(this.cue.visible)this.cue.position.set(m.cue!.x,.045,m.cue!.z);
  this.world.update(dt,tick);this.shots.update(dt);if(now-this.lastHud>100){this.lastHud=now;this.updateHud(tick);}this.world.render();
 }
 private updateHud(tick:number):void{
  const m=this.message;if(!m)return;const prop=m.self.role==='prop'&&!m.self.found,playing=m.phase==='hide'||m.phase==='seek';
  this.title.textContent=m.phase==='result'?m.notice:m.phase==='gather'?'Собираемся':m.self.role==='hunter'?'Вы — искатель':prop?'Вы — предмет':'Вы наблюдаете';
  this.clock.textContent=m.phaseEnd?`${Math.max(0,Math.ceil((m.phaseEnd-tick)/60))} с · Осталось ${m.remaining} из ${m.total}`:'Ждём ещё игроков';
  this.info.textContent=m.self.role==='hunter'?'WASD — ходить · ЛКМ / E — проверить. Промах отнимает 3 секунды.':prop?'WASD — двигаться · 1–4 — предмет · E — замереть · R — повернуть · T — шорох.':'Следующий раунд начнётся автоматически. Можно вернуться на набережную.';
  this.notice.textContent=m.notice;this.blind.hidden=!(m.phase==='hide'&&m.self.role!=='prop');this.blind.querySelector('span')!.textContent=`Выход через ${Math.max(0,Math.ceil((m.phaseEnd-tick)/60))} с`;
  this.cross.hidden=!(m.self.role==='hunter'&&m.phase==='seek');this.forms.hidden=!prop||!playing;
  this.forms.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.classList.toggle('selected',b.dataset.form===m.self.form));
  this.freeze.textContent=m.self.role==='hunter'?'Проверить · E':m.self.locked?'Двигаться · E':'Замереть · E';this.freeze.disabled=!playing||m.self.role==='spectator'||m.self.found||(m.self.role==='hunter'&&m.phase!=='seek');
  this.root.querySelectorAll<HTMLButtonElement>('[data-a="rotate"],[data-a="taunt"]').forEach(b=>{b.hidden=!prop;b.disabled=!playing||(b.dataset.a==='rotate'&&m.self.locked);});
 }
 private send(msg:HideClientMsg):void{this.d.net.send(msg);}
 private shoot():void{const now=performance.now();if(now-this.lastShot<710||this.message?.self.role!=='hunter'||this.message.phase!=='seek')return;this.lastShot=now;this.send({t:'hide',a:'shoot',aim:[this.d.input.yaw,Math.max(-1.2,Math.min(1.2,this.d.input.pitch))]});}
 onKey(code:string,down:boolean,e:KeyboardEvent):boolean{if(!down||e.repeat||this.d.input.blocked)return false;const digit=Number(code.replace('Digit',''));if(digit>=1&&digit<=4&&code.startsWith('Digit')){this.send({t:'hide',a:'form',form:HIDE_PROPS[digit-1]});return true;}if(code==='KeyR'||code==='KeyT'){this.send({t:'hide',a:code==='KeyR'?'rotate':'taunt'});return true;}return false;}
 onUse(mouse:boolean):void{if(this.message?.self.role==='hunter')this.shoot();else if(!mouse)this.send({t:'hide',a:'freeze'});}
 resize(w:number,h:number):void{this.world.resize(w,h);}
 debugState():Record<string,unknown>{return{mode:'hide',ready:!!this.message,phase:this.message?.phase,role:this.message?.self.role,round:this.message?.round,remaining:this.message?.remaining,form:this.message?.self.form,locked:this.message?.self.locked,player:{x:this.motion.predictor.state.x,y:this.motion.predictor.state.y,z:this.motion.predictor.state.z},renderedPlayer:{...this.motion.position},corrections:this.motion.predictor.corrections,props:this.message?.props.length??0,shots:this.shots.debug()};}
}
