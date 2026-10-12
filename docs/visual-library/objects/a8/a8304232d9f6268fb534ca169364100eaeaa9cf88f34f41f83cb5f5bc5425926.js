import { authoredAquaOverview } from './aqua-overview.js';
import { controls, asset, loadKit, component, marker, ring, line, characterStep, poseJelly, platforms3d, clockText, TAU } from './common.js';

// Periods/bounce values preserve shared/aqua.ts:115–117,139–166; local collision/movement is a scoped lab simulation.
export function moverPhase(seconds, phase = 0, rest = 1.1, go = 3.4, stay = 1.1, back = 3.4) {
  const period = rest + go + stay + back;
  let t = ((seconds - phase) % period + period) % period;
  const smooth = k => k * k * (3 - 2 * k);
  if (t < rest) return 0; t -= rest;
  if (t < go) return smooth(t / go); t -= go;
  if (t < stay) return 1; t -= stay;
  return 1 - smooth(t / back);
}

export async function aqua(ctx) {
  const {THREE:T,kit,ui,sound}=ctx;
  const d=kit.diorama({cam:[-14,17,24],look:[-21,0,0],radius:.01,rail:false,waterY:-1.25}),keys=controls(ctx);
  const backgroundNodes=new Set(d.scene.children);
  const pads=[{id:0,x:0,y:-.4,z:0,w:4,d:3},{id:1,x:-5,y:-.4,z:0,w:4,d:3},{id:2,x:-8,y:-.4,z:0,w:2.4,d:2.4},{id:3,x:-21,y:-.4,z:0,w:4,d:3},{id:4,x:-25,y:-.45,z:0,w:1.8,d:1.8},{id:5,x:-28,y:-.45,z:0,w:1.8,d:1.8},{id:6,x:-32,y:-.3,z:0,w:6,d:6},{id:7,x:-37,y:-.55,z:0,w:1.6,d:1.8},{id:8,x:-40.7,y:1.6,z:0,w:3,d:3}];
  const courseKit=await loadKit(ctx,'aqua-kit');
  const authored=new Set();
  pads[6].radius=3;
  const meshes=pads.map((p,i)=>{const name=i===2?'aqua_ferry':i===4||i===5?'aqua_sink':i===6?'aqua_sweeper_disc':i===7?'aqua_trampoline':null;const model=name?component(courseKit,name,d.scene):null;if(model){authored.add(i);model.position.set(p.x,p.y,p.z);return model;}if(i===6){const disc=d.cyl(3,3,.25,0x8fbaa7);disc.position.set(p.x,p.y-.125,p.z);return disc;}return platforms3d(d,[p],[0x8fbaa7,0xdab46e,0xc69862])[0];});
  const sinks=[ring(ctx,d.scene,-25,-.28,0,.8),ring(ctx,d.scene,-28,-.28,0,.8)];
  const sweep=new T.Group();sweep.position.set(-32,.3,0);d.scene.add(sweep);
  if(!component(courseKit,'aqua_sweeper',sweep)){d.box(5.6,.2,.3,0xdc916d,sweep);d.cyl(.15,.2,1.4,0x997b5f,sweep).position.y=.2;}
  ring(ctx,d.scene,-37,-.36,0,.7,0x99c09a);
  marker(ctx,d,'Паром: дождись причала',-8,2.8,0,8);marker(ctx,d,'Мигает — скоро тонет',-26,2.8,0,8);marker(ctx,d,'Перепрыгни перекладину',-32,3.5,0,8);marker(ctx,d,'Батут → финиш',-39,4,0,7);
  const me=d.jelly({name:'Ты',x:0,z:0,outfit:{c:9,h:'cap'}});
  const full=authoredAquaOverview(ctx,d,courseKit,moverPhase);
  full.setVisible(false);
  const overviewNodes=new Set(full.objects),sliceNodes=d.scene.children.filter(o=>!backgroundNodes.has(o)&&!overviewNodes.has(o));
  let s={x:0,y:-.4,z:0,vy:0,yaw:Math.PI/2,grounded:true,pad:0},phase='ready',elapsed=0,falls=0,knocks=0,checkpoint=0,view='slice',best=Infinity,lastFerryX=-8,lastSinkY=[-.45,-.45],worldTime=0,knockCooldown=0;
  const time=ui.stat('Попытка','—'),fall=ui.stat('В воду','0'),progress=ui.stat('Опора','Старт'),cadence=ui.stat('Вертушка','Оборот 3,6 с');
  const sceneSelect=ui.select('Сцена',[{value:'slice',label:'Играть: паром → батут'},{value:'all',label:'Обзор полного маршрута'},...Object.entries({ferry:'Паром',sinks:'Тонущие подушки',tramps:'Два батута',sweep:'Вертушка 1',sweep2:'Вертушка 2',bags:'Мешки над бревном',lift:'Лифт',finish:'Встречные паромы'}).map(([key,label])=>({value:`part:${key}`,label}))],view,v=>{view=v;keys.clear();ui.note(v!=='slice'?full.available?'Настоящие модели механизмов на полном маршруте. Это обзор, а не проверенный полный забег.':'Полный набор моделей ещё не загружен. Управляемый фрагмент доступен отдельно.':'A — вдоль полосы, W/S — в стороны. Пробел — прыжок. Подвижная опора везёт тебя.');});
  ui.button('Старт · Enter',()=>reset(),true);ui.button('Повтор · R',()=>retry());ui.button('С начала',()=>reset());keys.movement(true);
  function reset(){s={x:0,y:-.4,z:0,vy:0,yaw:Math.PI/2,grounded:true,pad:0};phase='running';elapsed=0;falls=0;knocks=0;checkpoint=0;view='slice';sceneSelect.value='slice';keys.clear();me.action(kit.ACT.none);ui.note('A — по полосе. Жди паром; на мигающей подушке не задерживайся. Перекладину перепрыгни, батут сработает сам.');}
  function retry(){const p=pads[checkpoint];s={x:p.x,y:p.y,z:p.z,vy:0,yaw:Math.PI/2,grounded:true,pad:p.id};phase='running';view='slice';sceneSelect.value='slice';keys.clear();me.action(kit.ACT.none);ui.note(checkpoint?'Учебная страховка после парома — только в этом фрагменте. Полный режим сохраняет возврат на старт.':'Снова со старта. Поймай момент парома.');}
  ui.note('Любимая последовательность аквапарка сохранена. В этом локальном фрагменте можно проверить тайминг самому. Enter — старт.');
  return {
    scene:d.scene,camera:d.camera,target:d.target,cameraOwned:true,
    cancelInput(){keys.clear();},
    onKey(code,down){keys.onKey(code,down);if(down&&code==='Enter')reset();if(down&&code==='KeyR')retry();},
    update(dt,t){
      if(view==='slice')worldTime+=dt;
      const f=pads[2];f.x=-8-10*moverPhase(worldTime);
      const sinkY=[-.45-1.95*moverPhase(worldTime,0,2.5,.35,.8,.35),-.45-1.95*moverPhase(worldTime,.6,2.5,.35,.8,.35)];
      if(s.grounded&&s.pad===2)s.x+=f.x-lastFerryX;
      for(let i=0;i<2;i++){if(s.grounded&&s.pad===4+i)s.y+=sinkY[i]-lastSinkY[i];pads[4+i].y=sinkY[i];}
      lastFerryX=f.x;lastSinkY=sinkY;
      meshes.forEach((m,i)=>m.position.set(pads[i].x,pads[i].y-(authored.has(i)?0:.125),pads[i].z));
      for(let i=0;i<2;i++){const phaseT=((worldTime-i*.6)%4+4)%4,warn=phaseT>=1.7&&phaseT<2.5;sinks[i].position.y=pads[4+i].y+.17;sinks[i].material.color.setHex(warn?0xd57962:0xeac778);sinks[i].material.opacity=warn?.35+.55*Math.abs(Math.sin(worldTime*12)):.6;}
      const a=worldTime*TAU/3.6;sweep.rotation.y=a;full.setVisible(view!=='slice');full.update(t,view!=='slice');
      knockCooldown=Math.max(0,knockCooldown-dt);
      if(phase==='running'&&view==='slice'){
        elapsed+=dt;characterStep(s,keys,Math.min(dt,.04),pads,{speed:6.5});
        if(s.pad===3&&s.grounded)checkpoint=3;
        const dx=s.x+32,dz=s.z,along=dx*Math.cos(a)+dz*Math.sin(a),across=-dx*Math.sin(a)+dz*Math.cos(a);
        if(!knockCooldown&&s.y>-.4&&s.y<.65&&Math.abs(along)<2.9&&Math.abs(across)<.4){s.vy=5.5;s.grounded=false;s.x+=Math.sin(a)*1.8;s.z+=Math.cos(a)*1.8;knockCooldown=.7;knocks++;sound.slip();me.avatar?.jolt?.(.7);}
        if(s.pad===7&&s.grounded){s.vy=12;s.grounded=false;sound.whoosh();}
        if(s.y<-1.2){phase='failed';falls++;sound.splat();ui.note('Плюх! R — повтор со страховки. Тайминг опор и прыжков тот же.');}
        if(s.pad===8&&s.grounded){phase='won';best=Math.min(best,elapsed);sound.fanfare();me.action(kit.ACT.wave);ui.note(`Финиш! ${clockText(elapsed)} · падений ${falls}. Лучший фрагмент ${clockText(best)}. С начала — чистый забег.`);}
      }
      poseJelly(me,s,dt,t,d.camera);
      sliceNodes.forEach(o=>o.visible=view==='slice');
      if(view==='slice'){d.camera.position.set(s.x+8,9,s.z+13);d.camera.lookAt(s.x-6,1,s.z);}
      else if(view.startsWith('part:')){const c=full.centers[view.split(':')[1]];d.camera.position.set(c.x+10,c.y+8,c.z+12);d.camera.lookAt(c);}
      else {d.camera.position.set(35,42,48);d.camera.lookAt(9,1,-6);}
      time.set(clockText(elapsed));fall.set(String(falls));progress.set(['Старт','Причал','Паром','Страховка','Подушка 1','Подушка 2','Вертушка','Батут','Финиш'][s.pad]||'Прыжок');
    },
    getState:()=>({mode:'aqua',phase,clock:elapsed,score:s.pad,falls,knocks,grounded:s.grounded,verticalSpeed:s.vy,checkpoint,tutorialCheckpointOnly:true,view,overviewReady:full.available,overviewParts:full.parts,worldTime,ferryX:pads[2].x,sinkHeight:[pads[4].y,pads[5].y],sweeperPeriod:3.6,sinkPeriod:4,sinkWarning:.8,trampolineBounce:12,modelParts:['aqua_ferry','aqua_sink','aqua_sweeper','aqua_sweeper_disc','aqua_trampoline'].filter(n=>d.scene.getObjectByName(`lab-${n}`)),scope:'local simplified slice; tutorial checkpoint only; full game returns to start; authored full overview unverified',position:{x:s.x,y:s.y,z:s.z},actors:'actual game Avatar'}),
    dispose(){keys.clear();d.dispose();}
  };
}
