import {THREE,kit,LabSound} from './kit.js';
import {assets} from './assets.js';
import {OrbitControls} from '../../../game-opus/node_modules/three/examples/jsm/controls/OrbitControls.js';
const sound=new LabSound();
// Default muted: a deliberate click unlocks and enables audio. No autoplay side effect.
sound.setEnabled(false);
function panelApi(panel,canInput,cancelInput){
 const offs=[],holds=[],notes=document.createElement('div');notes.className='live-note';panel.append(notes);
 const api={
  button(label,on,primary=false){const b=document.createElement('button');b.type='button';b.className='live-button'+(primary?' primary':'');b.textContent=label;b.addEventListener('click',()=>{if(!canInput())return;sound.unlock();on();});panel.append(b);return b;},
  hold(label,down,up){
   const b=document.createElement('button');b.type='button';b.className='live-button hold';b.textContent=label;let held=false;
   const press=()=>{if(held||!canInput())return;held=true;b.dataset.down='true';sound.unlock();down();},release=(natural=true)=>{if(!held)return;held=false;delete b.dataset.down;if(!natural)cancelInput('hold-cancel');up();};
   b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);press();});b.addEventListener('pointerup',()=>release());for(const ev of['pointercancel','lostpointercapture','blur'])b.addEventListener(ev,()=>release(false));
   b.addEventListener('keydown',e=>{if((e.code==='Space'||e.code==='Enter')&&!e.repeat){e.preventDefault();press();}});b.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter')release();});holds.push(()=>release(false));panel.append(b);return b;
  },
  meter(label){const el=document.createElement('label');el.className='live-meter';const cap=document.createElement('span');cap.textContent=label;const bar=document.createElement('i');bar.className='meter-bar';const zone=document.createElement('i');zone.className='meter-zone';const mark=document.createElement('i');mark.className='meter-mark';bar.append(zone,mark);el.append(cap,bar);panel.append(el);return{set:v=>{mark.style.left=(Math.min(1,Math.max(0,v))*100)+'%';},zone:(a,b)=>{zone.style.left=(a*100)+'%';zone.style.width=((b-a)*100)+'%';}};},
  stat(label,value=''){const el=document.createElement('span');el.className='live-stat';const cap=document.createElement('small');cap.textContent=label;const v=document.createElement('b');v.textContent=value;el.append(cap,v);panel.append(el);return{set:t=>{v.textContent=t;}};},
  note:text=>{notes.textContent=text;notes.hidden=!text;},
  select(label,options,value,onChange){const l=document.createElement('label');l.className='live-field';const span=document.createElement('span');span.textContent=label;const s=document.createElement('select');s.setAttribute('aria-label',label);options.forEach(o=>{const option=document.createElement('option');option.value=o.value??o.id??o;option.textContent=o.label??o.title??o;s.append(option);});s.value=value;let previous=value;s.addEventListener('change',()=>{if(!canInput()){s.value=previous;return;}previous=s.value;onChange(s.value);});l.append(span,s);panel.append(l);return s;},
  input(label,value,max){const l=document.createElement('label');l.className='live-field';const span=document.createElement('span');span.textContent=label;const i=document.createElement('input');i.type='text';i.value=value;i.maxLength=max;l.append(span,i);panel.append(l);return i;},
  release:()=>holds.forEach(f=>f()),clear:()=>{holds.forEach(f=>f());offs.forEach(f=>f());panel.replaceChildren();}
 };return api;
}
export class Stage{
 constructor(host,controls,status){
  this.host=host;this.controls=controls;this.status=status;this.renderer=null;this.live=null;this.ui=null;this.generation=0;this.keys=new Set();this.visible=true;this.paused=false;this.frames=0;this.activeId=null;
  this.canvas=document.createElement('canvas');this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','Управляемая 3D-сцена. Управление указано рядом.');host.append(this.canvas);
  this.canvas.addEventListener('pointerdown',e=>{if(!this.canInput())return;this.canvas.focus();sound.unlock();this.pointer={x:e.clientX,y:e.clientY,id:e.pointerId};});
  this.canvas.addEventListener('pointerup',e=>{const p=this.pointer;this.pointer=null;if(!this.canInput()||!p||Math.hypot(e.clientX-p.x,e.clientY-p.y)>8)return;const r=this.canvas.getBoundingClientRect();this.live?.tap?.((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);});
  this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  this.onKeyDown=e=>{if(!this.live||this.paused||!this.visible||document.hidden||e.ctrlKey||e.metaKey||e.altKey)return;if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.target.tagName==='BUTTON'&&(e.code==='Space'||e.code==='Enter'))return;if(e.target!==this.canvas&&e.target!==document.body&&!host.contains(e.target)&&!controls.contains(e.target))return;const allowed=/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Enter|Space|ShiftLeft|ShiftRight)$/.test(e.code);if(!allowed)return;e.preventDefault();if(!e.repeat){this.keys.add(e.code);sound.unlock();this.live.onKey?.(e.code,true);}};
  this.onKeyUp=e=>{if(this.keys.has(e.code)){this.keys.delete(e.code);this.live?.onKey?.(e.code,false);}};
  window.addEventListener('keydown',this.onKeyDown);window.addEventListener('keyup',this.onKeyUp);window.addEventListener('blur',()=>this.release('blur'));document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release('hidden');if(this.orbit)this.orbit.enabled=this.canInput();});
  this.io=new IntersectionObserver(entries=>{this.visible=entries[0]?.isIntersecting??true;if(!this.visible)this.release('offscreen');if(this.orbit)this.orbit.enabled=this.canInput();},{threshold:.03});this.io.observe(host);
  this.ro=new ResizeObserver(()=>this.resize());this.ro.observe(host);
 }
 canInput(){return !!this.live&&!this.error&&!this.paused&&this.visible&&!document.hidden;}
 release(reason='cancel'){this.live?.cancelInput?.(reason);for(const code of this.keys)this.live?.onKey?.(code,false);this.keys.clear();this.pointer=null;this.ui?.release();}
 getRenderer(){
  if(this.renderer)return this.renderer;
  const r=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,powerPreference:'default',alpha:false});r.setPixelRatio(Math.min(1.3,window.devicePixelRatio||1));r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.CustomToneMapping;r.toneMappingExposure=1;r.shadowMap.enabled=false;
  r.debug.checkShaderErrors=true;this.renderer=r;this.resize();return r;
 }
 resize(){if(!this.renderer)return;const width=Math.max(320,this.host.clientWidth),height=Math.max(280,this.host.clientHeight);this.renderer.setSize(width,height,false);if(this.live){this.live.camera.aspect=width/height;this.live.camera.updateProjectionMatrix();}}
 async activate(id,factory){
  const n=++this.generation;this.stop(false);this.error=null;this.paused=false;this.activeId=id;this.status.textContent='Собираем настоящую 3D-сцену…';this.host.classList.add('is-loading');this.controls.replaceChildren();const localPanel=document.createElement('div');localPanel.className='live-controls-inner';this.controls.append(localPanel);const ui=panelApi(localPanel,()=>this.canInput()&&this.ui===ui,reason=>this.live?.cancelInput?.(reason));this.ui=ui;
  try{
   this.getRenderer();const live=await factory({THREE,kit,ui,sound,assets});
   if(n!==this.generation){live.dispose();ui.clear();localPanel.remove();return;}
   this.live=live;if(live.cameraOwned===false){this.orbit=new OrbitControls(live.camera,this.canvas);if(live.target)this.orbit.target.copy(live.target);this.orbit.enableDamping=true;this.orbit.dampingFactor=.1;this.orbit.enabled=this.canInput();}
   this.t=0;this.last=0;this.frames=0;this.resize();this.status.textContent=this.paused?'Пауза · сцена и ввод остановлены':'Локальный управляемый прототип · настоящий WebGL';this.host.classList.remove('is-loading');this.canvas.focus({preventScroll:true});this.drawOnce();this.loop();
  }catch(e){if(n===this.generation){this.host.classList.remove('is-loading');this.fail(e);}}
 }
 drawOnce(){if(!this.live)return;this.live.scene.userData?.labWorldTime?.(this.t||0);this.live.update(0,this.t||0);this.renderer.render(this.live.scene,this.live.camera);}
 loop(){
  if(this.raf)return;const tick=now=>{
   this.raf=requestAnimationFrame(tick);const dt=this.last?Math.min(.05,(now-this.last)/1000):0;this.last=now;
   if(!this.live||!this.visible||this.paused||document.hidden)return;
   try{this.t+=dt;this.live.scene.userData?.labWorldTime?.(this.t);this.live.update(dt,this.t);this.orbit?.update();if(this.orbit)this.live.onOrbitChange?.(this.orbit.target);this.renderer.render(this.live.scene,this.live.camera);this.frames++;}catch(e){this.fail(e);}
  };this.raf=requestAnimationFrame(tick);
 }
 fail(e){this.error=e?.message||String(e);this.paused=true;this.release('error');if(this.raf){cancelAnimationFrame(this.raf);this.raf=0;}if(this.orbit)this.orbit.enabled=false;this.status.textContent='Ошибка сцены: '+this.error;this.ui?.note('Эта сцена остановлена. Переключись на другое занятие; изображение не заменяет работающий прототип.');console.error('Lab scene',this.activeId,e);}
 pause(on){if(this.error)return;this.paused=on;this.release(on?'pause':'resume');if(this.orbit)this.orbit.enabled=this.canInput();this.status.textContent=on?'Пауза · сцена и ввод остановлены':'Локальный управляемый прототип · настоящий WebGL';}
 stop(invalidate=true){if(invalidate)++this.generation;this.release('scene-change');if(this.raf){cancelAnimationFrame(this.raf);this.raf=0;}this.orbit?.dispose();this.orbit=null;if(this.live){this.live.dispose();this.live=null;}this.ui?.clear();this.ui=null;this.renderer?.renderLists.dispose();this.last=0;}
 state(){const gl=this.renderer?.getContext(),c=this.live?.camera;return{id:this.activeId,error:this.error||null,paused:this.paused,offscreen:!this.visible,hidden:document.hidden,frames:this.frames,renderers:this.renderer?1:0,backend:gl?gl.getParameter(gl.VERSION):null,contextLost:gl?.isContextLost()??null,drawCalls:this.renderer?.info.render.calls,triangles:this.renderer?.info.render.triangles,memory:this.renderer?.info.memory,cameraProjection:c?{projection:c.projectionMatrix.elements.slice(),view:c.matrixWorldInverse.elements.slice()}:null,scene:this.live?.getState?.()||null};}
 setSound(on){sound.unlock();sound.setEnabled(on);}
 dispose(){this.stop();this.io.disconnect();this.ro.disconnect();window.removeEventListener('keydown',this.onKeyDown);window.removeEventListener('keyup',this.onKeyUp);this.renderer?.dispose();assets.clear();}
}
