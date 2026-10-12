import { SiegeScenarioStand, type SiegeScene } from './scenario-stand.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/800.css';
import '@fontsource/rubik-mono-one/cyrillic-400.css';
import '../../ui/kit/tokens.css';
import '../../ui/kit/kit.css';
import './stand.css';
import { APPROVED_ASSETS, ApprovedMobRenderer } from './renderer.ts';
import { EventFx } from '../eventfx.ts';
import { EventMarks } from '../marks.ts';
import { mobRoot } from '../mobs/renderer.ts';
import { SIEGE_METEOR_RADIUS } from '../../../shared/fortsiege.ts';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('stage');
const renderer = new THREE.WebGLRenderer({canvas,antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();scene.background=new THREE.Color(0xc2d9df);scene.fog=new THREE.Fog(0xc2d9df,55,100);
scene.add(new THREE.HemisphereLight(0xe7f1ff,0x8b6c45,2.2));const sun=new THREE.DirectionalLight(0xffedca,3.1);sun.position.set(-8,15,10);scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshStandardMaterial({color:0xb8ab89,roughness:.95}));ground.rotation.x=-Math.PI/2;ground.position.y=-.025;scene.add(ground);
const camera=new THREE.PerspectiveCamera(43,1,.05,200);camera.position.set(5,4,8);
const controls=new OrbitControls(camera,canvas);controls.target.set(0,1.5,0);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=1.3;controls.maxDistance=65;
const models=new ApprovedMobRenderer(scene);const scenario=new SiegeScenarioStand(scene,models);const fx=new EventFx(scene,camera);const marks=new EventMarks(scene);const matrix=new THREE.Matrix4();
let selected:number=APPROVED_ASSETS[0].kind,clip='idle',mode:'clip'|'cycle'|'lineup'|'event'='cycle',time=0,playing=true,far=false,last=performance.now();
let meteor:{start:number,id:number,phase:number}|null=null;
const from=[-9,14,-10],to=[0,0,0];
const names:Record<string,string>={idle:'Стоит',walk:'Подходит',deploy:'Развёртывание',windup:'Готовит удар',attack:'Действует',open:'Механизм открыт',recover:'Возвращается',hit:'Получил удар',death:'Гибель',spent:'Сорвано',route_attach:'Крепит канат',device_set:'Ставит устройство',anchor_set:'Опускает опоры',hook_windup:'Поднимает груз',hook_swing:'Сбрасывает груз',crank:'Взводит колесо',gust:'Порыв ветра',jammed:'Муфта заклинила',canopy_break:'Складывает навес',cover_disabled:'Навес отключён',pump:'Струя',redirect_windup:'Разворот клапана',redirect_attack:'Обратная струя',spawn:'Появление',rage:'Ярость'};
const explanations:Record<string,string>={ropecrab:'Катушка и крюк закрепляют путь. Стопор открывается перед срывом.',jampump:'Рычаг и сопло готовят смоляной плевок. Это отдельный моб; насоса на бойницах нет.',canopy:'Раскрытый навес прикрывает соседей. Попадание складывает его, сам носитель остаётся жив.',foreman:'Старшина разворачивает механизм, готовит заряд и открывает штифт после действия.',crabcrane:'Опоры упираются в землю, стрела ведёт крюк, груз падает в отмеченный сектор. При гибели ломается вся собственная конструкция.',miller:'Мельничиха взводит колесо и даёт порыв. После ветра муфта открыта. Колесо, ткань и тело имеют разные фазы гибели.',battery:'Два небольших расчётчика привозят пушку. Видны упоры, досылатель, заряд, отдача и открытый штифт.',siegetower:'Колёса и расчёт движутся вместе. Откидной мост открывает путь на стену; защёлка и мост ломаются отдельно.',spring:'Маленький живой гриб сжимает ножку и распрямляет шляпку. После срыва остаются опавшая шляпка и споры.'};
type Info={kind:number,id:string,height:number,triangles:number,parts:number,clips:Record<string,{duration:number}>};
function info():Info|undefined{return (models.inspect().models as Info[]).find(x=>x.kind===selected);}
function sequence():string[]{const i=info();if(!i)return[];const deploy=i.clips.deploy?'deploy':i.clips.anchor_set?'anchor_set':i.clips.device_set?'device_set':i.clips.route_attach?'route_attach':'windup';return ['walk',deploy,'windup',i.id==='crabcrane'?'hook_swing':i.id==='miller'?'gust':'attack','open','death'].filter((x,n,a)=>!!i.clips[x]&&(n===0||a[n-1]!==x));}
function duration():number{if(mode==='event')return 22;const i=info();return !i?1:mode==='cycle'?sequence().reduce((s,c)=>s+i.clips[c].duration,0):i.clips[clip]?.duration??1;}
function current():[string,number]{const i=info();if(!i)return['idle',0];if(mode!=='cycle')return[clip,time];let cursor=time;const sequenceClips=sequence();for(const c of sequenceClips){const d=i.clips[c].duration;if(cursor<=d)return[c,cursor];cursor-=d;}const end=sequenceClips.at(-1)??'idle';return[end,i.clips[end].duration];}
function fit(){const i=info();const h=i?.height??2;const d=far?25:Math.max(3.7,h*2.1);controls.target.set(0,h*.45,0);camera.position.set(far?d*.2:d*.60,far?6.2:h*.55+d*.45,d);controls.update();}
function buttons(){scenario.hide();const i=info();if(!i)return;el('clips').replaceChildren();for(const c of Object.keys(i.clips)){const b=document.createElement('button');b.className='k-btn k-btn--sm';b.textContent=names[c]??c;b.onclick=()=>{clip=c;mode='clip';time=0;playing=true;scenario.hide();};el('clips').append(b);}el('meaning').textContent=explanations[i.id]??'';fit();}
for(const spec of APPROVED_ASSETS){const b=document.createElement('button');b.className='k-btn';b.textContent=spec.name;b.dataset.kind=String(spec.kind);b.onclick=()=>{selected=spec.kind;time=0;mode='cycle';playing=true;buttons();};el('models').append(b);}
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-scene]'))b.onclick=()=>{mode='event';time=0;playing=true;scenario.start(b.dataset.scene as SiegeScene);const boat=b.dataset.scene==='anchor';controls.target.set(boat?-10:0,2,boat?18:-22);camera.position.set(boat?-25:18,10,boat?34:-37);controls.update();el('meaning').textContent='Сцена просмотра: подход → развёртывание → действие. Кнопка «Сорвать механизм» показывает прерывание; уже выпущенное ядро продолжает лететь.';};
el('interrupt').onclick=()=>{if(mode==='event')scenario.interrupt(time);};
el('play').onclick=()=>{playing=!playing;};el('cycle').onclick=()=>{mode='cycle';time=0;playing=true;scenario.hide();};el('reset').onclick=()=>{time=0;playing=true;if(mode==='event')scenario.start(scenario.scene);};el('camera').onclick=()=>{far=!far;fit();};el('lineup').onclick=()=>{mode='lineup';time=0;playing=true;scenario.hide();controls.target.set(0,1.5,0);camera.position.set(0,12,24);controls.update();};el<HTMLInputElement>('time').oninput=()=>{time=+el<HTMLInputElement>('time').value;playing=false;};
el('meteor-start').onclick=()=>{meteor={start:performance.now()/1000,id:90001,phase:0};fx.siegeMeteor(meteor.id,0,from,to,0,144,0);marks.meteor(0,0,0,SIEGE_METEOR_RADIUS,144,144,meteor.id);};el('meteor-break').onclick=()=>{if(!meteor||meteor.phase)return;meteor.phase=2;fx.siegeMeteor(meteor.id,2,from,to,0,144,(performance.now()/1000-meteor.start)*60);marks.cancel(meteor.id);};
await models.ready;buttons();el('status').textContent=models.error??'Модели загружены.';
function frame(now:number){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;const d=duration();if(playing)time+=dt;if(mode==='clip'&&['idle','walk'].includes(clip))time%=d;else if(mode!=='lineup'&&time>d){time=d;playing=false;}models.begin();
  if(mode==='event'){el('phase').textContent=scenario.frame(time,playing?dt:0);}
  else if(mode==='lineup'){APPROVED_ASSETS.forEach((s,i)=>{mobRoot(matrix,(i-(APPROVED_ASSETS.length-1)/2)*3.4,0,0,Math.PI);models.addClip(s.kind,matrix,'walk',time,0);});}
  else{const [key,t]=current();mobRoot(matrix,0,0,0,Math.PI);models.addClip(selected,matrix,key,t);el('phase').textContent=(APPROVED_ASSETS.find(x=>x.kind===selected)?.name??'')+' · '+(names[key]??key);}
  models.end();if(meteor)fx.setRenderTick((now/1000-meteor.start)*60);fx.update(dt);if(meteor){const age=now/1000-meteor.start;marks.update(dt,age*60);if(age>=2.4&&meteor.phase===0){meteor.phase=3;fx.siegeMeteor(meteor.id,3,from,to,0,144,age*60);fx.meteorHit(0,0,0,SIEGE_METEOR_RADIUS);marks.cancel(meteor.id);}}else marks.update(dt,0);
  const rect=canvas.getBoundingClientRect(),w=Math.round(rect.width),h=Math.round(rect.height);if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}controls.update();renderer.render(scene,camera);
  el('play').textContent=playing?'Пауза':'Продолжить';el('clock').textContent=time.toFixed(1)+' / '+d.toFixed(1)+' с';el<HTMLInputElement>('time').max=String(d);el<HTMLInputElement>('time').value=String(time);const i=info();el('metrics').textContent=i?`${i.triangles.toLocaleString('ru-RU')} треугольников · ${Object.keys(i.clips).length} настоящих клипов · 1 отрисовка на тип · кадр: ${renderer.info.render.calls} отрисовок / ${renderer.info.render.triangles.toLocaleString('ru-RU')} треугольников`:'';
}
requestAnimationFrame(frame);
(window as unknown as {fortressApproved:unknown}).fortressApproved={models,scene,renderer,camera,select(kind:number){selected=kind;time=0;mode='cycle';buttons();},setClip(name:string,t=0){clip=name;time=t;mode='clip';playing=false;},get state(){return {kind:selected,mode,clip:current()[0],time,current:current()[1],duration:duration(),loading:models.loading,error:models.error};}};
