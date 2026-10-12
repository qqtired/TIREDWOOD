import { authoredTowerOverview } from './tower-overview.js';
import { controls, asset, loadKit, component, marker, line, ring, characterStep, poseJelly, platforms3d, clockText, TAU } from './common.js';

export const TOWER_CONTENT = [
  [0,8,'Крыши-разгон','roof'],[8,20,'Мельничные люльки','basket'],[20,30,'Маятники с карманами','pendulum'],
  [30,42,'Двойные поршни','piston'],[42,52,'Волна облаков','cloud'],[52,60,'Мешок → точная посадка','pendulum'],
  [60,70,'Ветер за парусами','sail'],[70,82,'Батутная тележка','trampoline'],[82,90,'Восходящий поток','cloud'],
  [90,101,'Встречные карусели','carousel'],[101,110,'Облака под маятником','pendulum'],[110,120,'Две корзины навстречу','basket'],
  [120,132,'Батут → узкая галерея','trampoline'],[132,142,'Поршни с кромкой-срезкой','piston'],[142,150,'Посадка с шара','cloud'],
  [150,163,'Лестница с обвалом','roof'],[163,175,'Финальная связка: ветер + прыжок','sail'],[175,185,'Спираль → колокол','bell']
];

export async function tower(ctx) {
  const {THREE:T,kit,ui,sound}=ctx;
  const d=kit.diorama({cam:[12,11,15],look:[2,3,-3],radius:.01,rail:false});
  const backgroundNodes=new Set(d.scene.children);
  const keys=controls(ctx), pads=[{id:0,x:0,y:0,z:0,w:4,d:4},{id:1,x:4,y:1.2,z:0,w:3.2,d:3.2},{id:2,x:4,y:2.4,z:-4,w:3.2,d:3.2},{id:3,x:0,y:3.6,z:-4,w:3.2,d:3.2},{id:4,x:0,y:4.8,z:-8,w:4,d:3.2}];
  const courseKit=await loadKit(ctx,'tower-course');
  pads.forEach((p,i)=>{const model=component(courseKit,'tower_platform',d.scene);if(model){model.position.set(p.x,p.y,p.z);model.scale.set(p.w/3.2,1,p.d/3.2);}else platforms3d(d,[p]);});
  pads.forEach(p=>marker(ctx,d,p.id===0?'Старт':p.id===2?'Страховка':p.id===4?'Колокол':`${p.y.toFixed(1)} м`,p.x,p.y+2.5,p.z,3));
  const me=d.jelly({name:'Ты',x:0,z:0,outfit:{c:9,h:'cap'}});
  const full=authoredTowerOverview(ctx,d,courseKit,TOWER_CONTENT);
  full.setVisible(false);
  const trap=new T.Group();trap.position.set(0,4.2,-4);d.scene.add(trap);d.cyl(.12,.18,1,0xa86c48,trap).position.y=-.2;
  if(!component(courseKit,'trap_arm',trap))d.box(3.2,.18,.25,0xd88650,trap);
  const bell=component(courseKit,'checkpoint_bell',d.scene);if(bell)bell.position.set(0,4.8,-8);
  const warn=ring(ctx,d.scene,0,3.64,-4,1.5,0xd4824e);
  const overviewNodes=new Set(full.objects),sliceNodes=d.scene.children.filter(o=>!backgroundNodes.has(o)&&!overviewNodes.has(o));
  let s={x:0,y:0,z:0,vy:0,yaw:Math.PI,grounded:true,pad:0},phase='ready',elapsed=0,falls=0,checkpoint=0,view='slice',best=Infinity;
  const height=ui.stat('Фрагмент','0 / 4,8 м'),time=ui.stat('Время','—'),fall=ui.stat('Падения','0'),content=ui.stat('Полная башня','185 м · 18 испытаний');
  const sceneSelect=ui.select('Сцена',[{value:'slice',label:'Играть: фрагмент 4,8 м'},{value:'all',label:'Обзор всей башни 185 м'},...Array.from({length:6},(_,i)=>({value:String(i),label:`Пояс ${i+1} · ${i*30}–${i===5?185:(i+1)*30} м`})),...TOWER_CONTENT.map((p,i)=>({value:`trial:${i}`,label:`${i+1}. ${p[2]}`}))],view,v=>{view=v;keys.clear();ui.note(v==='slice'?'WASD — движение, Пробел — прыжок. Площадка «Страховка» сохраняет путь.':full.available?'Связная башня и 18 испытаний — настоящий 3D-план. Полные 185 м ещё не проверены прохождением.':'Полная модель ещё не загружена. Управляемый фрагмент доступен отдельно.');});
  ui.button('Старт · Enter',()=>reset(),true);ui.button('Повтор со страховки · R',()=>retry());ui.button('С начала',()=>reset());keys.movement(true);
  function reset(){s={x:0,y:0,z:0,vy:0,yaw:Math.PI,grounded:true,pad:0};phase='running';elapsed=0;falls=0;checkpoint=0;view='slice';sceneSelect.value='slice';keys.clear();me.action(kit.ACT.none);ui.note('Перепрыгни 4 уступа и вертушку. Это проверяемый короткий фрагмент, а не вся башня.');}
  function retry(){const p=pads[checkpoint];s={x:p.x,y:p.y,z:p.z,vy:0,yaw:0,grounded:true,pad:p.id};phase='running';view='slice';sceneSelect.value='slice';keys.clear();me.action(kit.ACT.none);ui.note(`Повтор со страховки ${p.y.toFixed(1)} м. Время продолжается; «С начала» сбросит попытку.`);}
  ui.note('185 м и 18 испытаний показаны в обзоре. Здесь можно самому пройти короткий фрагмент. Enter — старт.');
  return {
    scene:d.scene,camera:d.camera,target:d.target,cameraOwned:true,
    cancelInput(){keys.clear();},
    onKey(code,down){keys.onKey(code,down);if(down&&code==='Enter')reset();if(down&&code==='KeyR')retry();},
    update(dt,t){
      const angle=t*TAU/3.6;trap.rotation.y=angle;warn.material.opacity=.18+.6*Math.pow(Math.max(0,Math.cos(angle*2)),8);
      const trial=view.startsWith('trial:')?Number(view.split(':')[1]):null;
      full.setVisible(view!=='slice',trial);full.update(dt,view!=='slice');
      if((phase==='running'||phase==='failed')&&view==='slice')elapsed+=dt;
      if(phase==='running'&&view==='slice'){
        characterStep(s,keys,Math.min(dt,.04),pads,{speed:5.2});
        if(s.pad>=2&&s.grounded)checkpoint=2;
        const dx=s.x,dz=s.z+4,along=dx*Math.cos(angle)+dz*Math.sin(angle),across=-dx*Math.sin(angle)+dz*Math.cos(angle);
        if(s.y>=3.5&&s.y<4.3&&Math.abs(along)<1.8&&Math.abs(across)<.38){s.grounded=false;s.vy=4.5;s.x+=Math.sin(angle)*.8;s.z+=Math.cos(angle)*.8;s.y-=.2;s.pad=-1;sound.slip();}
        if(s.y<-.6){phase='failed';falls++;ui.note('В воду! Время идёт, страховка сохранена. R — ещё попытка.');sound.splat();me.avatar?.jolt?.(1);}
        if(s.pad===4&&s.grounded){phase='won';best=Math.min(best,elapsed);ui.note(`Колокол! ${clockText(elapsed)} · падений ${falls}. Рекорд фрагмента ${clockText(best)}. Сначала — новый чистый проход.`);sound.ding();me.action(kit.ACT.dance);}
      }
      poseJelly(me,s,dt,t,d.camera);
      sliceNodes.forEach(o=>o.visible=view==='slice');
      if(view==='slice'){d.camera.position.set(s.x+10,Math.max(9,s.y+7),s.z+14);d.camera.lookAt(2,Math.max(2.5,s.y+.8),-4);height.set(`${Math.max(0,s.y).toFixed(1)} / 4,8 м`);}
      else if(view==='all'){d.camera.position.set(140,108,170);d.camera.lookAt(-32,91,-18);height.set('Обзор · 185 м');}
      else if(trial!==null){const c=full.centers[trial];d.camera.position.set(c.x+16,c.y+5,c.z+20);d.camera.lookAt(c.x,c.y,c.z);content.set(`${TOWER_CONTENT[trial][0]}–${TOWER_CONTENT[trial][1]} м · ${TOWER_CONTENT[trial][2]}`);}
      else {const i=Number(view),c=full.centers[i*3+1];d.camera.position.set(c.x+23,c.y+9,c.z+29);d.camera.lookAt(c.x,c.y,c.z);content.set(TOWER_CONTENT.slice(i*3,i*3+3).map(p=>p[2]).join(' · '));}
      time.set(clockText(elapsed));fall.set(String(falls));
    },
    getState:()=>({mode:'tower',phase,clock:elapsed,score:s.pad,height:s.y,falls,checkpoint,view,fullOverviewReady:full.available,overviewClips:full.clips,fullRouteHeight:185,fullRouteTrials:18,playableSliceHeight:4.8,modelParts:['tower_platform','trap_arm','checkpoint_bell','tower_full_overview'].filter(n=>d.scene.getObjectByName(`lab-${n}`)),scope:'local simplified 4.8m slice; authored 185m content overview is not full-course acceptance',position:{x:s.x,y:s.y,z:s.z},actors:'actual game Avatar'}),
    dispose(){keys.clear();full.dispose();d.dispose();}
  };
}
