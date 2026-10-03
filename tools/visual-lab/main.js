import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Renderer } from '../../client/render/renderer.ts';
import { RaceWorld } from '../../client/race/world.ts';
import { BoatRaceWorld, BoatModel } from '../../client/boatrace/world.ts';
import { SkillWorld } from '../../client/skilltest/world.ts';
import { LobbyWorld } from '../../client/lobby/world.ts';
import { LobbyCritters } from '../../client/lobby/critters.ts';
import { Avatar, tickAvatarShared } from '../../client/render/avatar.ts';
import { DEFAULT_OUTFIT } from '../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';

const renderer = new Renderer(document.querySelector('canvas'));
const worlds = new Map();
const buttons = [...document.querySelectorAll('[data-mode]')];
const view = document.querySelector('#view'), stats = document.querySelector('#stats');
let active, controls, mode = new URLSearchParams(location.search).get('mode') || 'boats';
let playing = true, elapsed = 0, last = performance.now(), lastStats = 0;
const v = (label, camera, target, tick = 0, cp = 0) => ({label,camera,target,tick,cp});
function build(name) {
  if (name === 'boats') {
    const world = new BoatRaceWorld(renderer), g = world.course.gates[0];
    const boat = {x:g.x-g.hx*7,z:g.z-g.hz*7,hx:g.hx,hz:g.hz,speed:12};
    const model = new BoatModel(world.scene, 1, {...DEFAULT_OUTFIT,c:7}, '');
    return {world, boat, model, views:[v('Катер крупно',[boat.x+5,3.0,boat.z+5],[boat.x,1,boat.z]),v('Стартовая акватория',[g.x-g.hx*18,7,g.z-g.hz*18],[g.x+g.hx*18,1,g.z+g.hz*18]),v('Бухта сверху',[150,115,165],[0,0,0]),v('Мыс и порт',[-130,22,-70],[0,3,0])]};
  }
  if (name === 'skill') {
    const world = new SkillWorld(renderer), avatar = new Avatar(1,{gun:false});
    avatar.addTo(world.scene);avatar.setOutfit({...DEFAULT_OUTFIT,c:4});
    return {world, avatar, views:[v('Первый остров',[4,43.4,11],[13,40,0]),v('Гондола',[30,44,10],[44,40,0],120,1),v('Пневмолиния',[64,44.8,10],[76,40,0],135,2),v('Вертушки',[123,44,10],[137,40,0],100,4),v('Лифт',[150,47.5,12],[160,42,0],190,5),v('Грузовые кассеты',[181,45,12],[198,37,0],220,6),v('Общий вид',[84,88,105],[105,39,0],0,3)]};
  }
  if (name === 'critters') {
    const world = new LobbyWorld(renderer,'high'), animals = new LobbyCritters(world.scene);
    return {world,animals,views:[v('Кот на скамейке',[-3,1.4,22],[-.7,.35,19.4],0),v('Кот идёт',[-2,1.2,23.8],[0,.35,20.2],42*60),v('Кот у маяка',[-13.7,1.1,41],[-17,.25,40],49*60),v('Пёс',[23.5,1.25,9],[20,.3,6.6],90*60),v('Чайки',[-2.6,1.3,23],[-5,.3,20.5],12*60),
      v('Отмель с набережной',[-12.2,1.7,19.8],[-15.3,-1.0,23.4],0),v('Отмель с мостков',[-18.5,2.4,28.8],[-15.6,-1.0,23.4],8*60),v('Отмель с моря',[-12.5,.6,31],[-15.4,-.9,23.3],20*60),v('Крабы крупно',[-13.9,-.45,25.6],[-15.5,-.98,23.3],14*60)]};
  }
  const world = new RaceWorld(renderer,'high','port');
  return {world,views:[v('Портовое кольцо',[15,6,34],[35,1,0]),v('Обзор порта',[135,100,165],[0,0,0])]};
}
function resetView() {
  const p = active.views[Number(view.value)||0]; elapsed=0;
  active.world.camera.position.set(...p.camera); controls.target.set(...p.target); controls.update();
  renderer.refreshShadows();
  history.replaceState(null,'',`?mode=${mode}&view=${view.value}`);
}
function select(name) {
  const previous = new URLSearchParams(location.search);
  const savedView = previous.get('mode')===name ? Number(previous.get('view')||0) : 0;
  mode=['reference','boats','skill','critters'].includes(name)?name:'boats';
  controls?.dispose(); active=worlds.get(mode);
  if(!active){active=build(mode);worlds.set(mode,active);}
  const {world}=active; world.resize(innerWidth,innerHeight); world.setQuality?.(document.querySelector('#quality').value);
  controls=new OrbitControls(world.camera,renderer.canvas);controls.enableDamping=true;controls.dampingFactor=.12;controls.maxPolarAngle=Math.PI*.94;controls.minDistance=.6;controls.maxDistance=500;
  view.replaceChildren(...active.views.map((p,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=p.label;return o;}));
  view.value=String(Math.min(active.views.length-1,Math.max(0,savedView)));
  for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  resetView(); window.__visualLab={mode,active,renderer,controls,select,resetView,setTime(seconds){elapsed=seconds;playing=false;document.querySelector('#motion').setAttribute('aria-pressed','false');}};
}
function frame(now) {
  const dt=Math.min(.05,(now-last)/1000);last=now;if(playing)elapsed+=dt;
  const p=active.views[Number(view.value)||0],tick=p.tick+elapsed*60,{world}=active;
  renderer.beginFrame(true); controls.update();
  if(mode==='boats'){const b=active.boat;active.model.update(b.x,b.z,b.hx,b.hz,Math.sin(elapsed*.5)*.15,b.speed,tick,dt,world.camera.position,true);world.update(tick,1,[b]);}
  else if(mode==='skill'){world.update(tick,p.cp);const pad=world.map.pads.find(x=>x.section===p.cp)||world.map.pads[0];active.avatar.update({x:pad.x,y:pad.y,z:1.8,yaw:-Math.PI/2,pitch:0,flags:E_ALIVE|E_GROUNDED},dt,tick/60,{groundBelow:()=>pad.y},world.camera.position,false);tickAvatarShared(tick/60);}
  else if(mode==='critters'){world.update(dt,tick);active.animals.update(tick,elapsed,world.camera.position,{x:1e6,y:0,z:1e6,speed:0});}
  else world.update(dt);
  world.render();renderer.endFrame();
  if(now-lastStats>500){lastStats=now;stats.textContent=`${mode} · ${renderer.gl.info.render.calls} вызовов · ${renderer.gl.info.render.triangles.toLocaleString('ru')} треугольников · CPU ${renderer.cpuMs.toFixed(1)} мс`;}
  requestAnimationFrame(frame);
}
for(const b of buttons)b.onclick=()=>select(b.dataset.mode);
view.onchange=resetView;document.querySelector('#reset').onclick=resetView;
document.querySelector('#motion').onclick=e=>{playing=!playing;e.currentTarget.setAttribute('aria-pressed',String(playing));};
document.querySelector('#quality').onchange=e=>{active.world.setQuality?.(e.target.value);renderer.refreshShadows();};
document.querySelector('#save').onclick=()=>{active.world.render();const a=document.createElement('a');a.download=`opus-${mode}-${view.value}.png`;a.href=renderer.canvas.toDataURL('image/png');a.click();};
addEventListener('resize',()=>{renderer.resize(innerWidth,innerHeight,Math.min(devicePixelRatio,1.5));active?.world.resize(innerWidth,innerHeight);});
addEventListener('error',e=>{const el=document.querySelector('#error');el.hidden=false;el.textContent=e.message;});
renderer.resize(innerWidth,innerHeight,Math.min(devicePixelRatio,1.5));select(mode);requestAnimationFrame(frame);
