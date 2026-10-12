import { controls, asset, marker, ring, line, clamp, clockText } from './common.js';

// Table dimensions and coefficient baseline: shared/billiards.ts:65–89,135–157.
// These two-ball teaching tasks use a local hard-contact simulation, not the full production spring solver.
export const POOL = { hx:.56,hz:1.12,r:.0285,y:.8,ballElasticity:.93,railElasticity:.7,rollA:.3,rollK:.35 };
export function poolStep(balls,dt,events){
  const {hx,hz,r}=POOL;
  for(const b of balls){if(!b.on)continue;b.x+=b.vx*dt;b.z+=b.vz*dt;const sp=Math.hypot(b.vx,b.vz),next=Math.max(0,sp-(POOL.rollA+POOL.rollK*sp)*dt),k=sp?next/sp:0;b.vx*=k;b.vz*=k;if(next<.006)b.vx=b.vz=0;
    const pockets=[[-hx,-hz],[hx,-hz],[-hx,hz],[hx,hz],[-hx,0],[hx,0]];
    let p=-1;for(let i=0;i<pockets.length;i++)if(Math.hypot(b.x-pockets[i][0],b.z-pockets[i][1])<(i<4?.05:.03)){p=i;break;}
    if(p>=0){b.on=false;b.pocket=p;b.vx=b.vz=0;events.pots.push(b.id);continue;}
    const corner=Math.abs(b.z)>hz-.085,side=Math.abs(b.z)<.066;
    if(Math.abs(b.x)>hx-r&&!corner&&!side){b.x=Math.sign(b.x)*(hx-r);b.vx=-b.vx*POOL.railElasticity;b.vz*=.94;events.rails++;}
    if(Math.abs(b.z)>hz-r&&Math.abs(b.x)<hx-.085){b.z=Math.sign(b.z)*(hz-r);b.vz=-b.vz*POOL.railElasticity;b.vx*=.94;events.rails++;}
    if(Math.abs(b.x)>hx+.1||Math.abs(b.z)>hz+.1){b.on=false;b.vx=b.vz=0;events.pots.push(b.id);}
  }
  const a=balls[0],b=balls[1];if(!a.on||!b.on)return;
  const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz);
  if(dist<r*2&&dist>1e-9){const nx=dx/dist,nz=dz/dist,over=r*2-dist;a.x-=nx*over/2;a.z-=nz*over/2;b.x+=nx*over/2;b.z+=nz*over/2;const closing=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;if(closing>0){const impulse=(1+POOL.ballElasticity)*closing/2;a.vx-=impulse*nx;a.vz-=impulse*nz;b.vx+=impulse*nx;b.vz+=impulse*nz;events.contact=true;}}
}

export const POOL_DT=1/960;
const bankWall=POOL.hx-POOL.r;
const bankSlope=(POOL.hz+.8)/((bankWall-.25)+(bankWall+POOL.hx)*.94/POOL.railElasticity);
const bankZ=-.8+(bankWall-.25)*bankSlope;
export const BILLIARDS_TASKS={
 accuracy:{title:'Точность',cue:{x:-.25,z:-.64},object:{x:.12,z:.22},pocket:3,aim:1.21,powerZone:[.25,.43],goal:'Забей светлый шар в отмеченный угол, сохрани красный биток.'},
 bank:{title:'Борт',cue:{x:.25,z:-.8},object:{x:(bankWall-POOL.hx)/2,z:(bankZ+POOL.hz)/2},pocket:2,aim:.9,powerZone:[.42,.75],bank:true,bankPoint:{x:bankWall,z:bankZ},goal:'Сначала коснись битком борта, затем забей светлый шар в отмеченный угол.'},
 position:{title:'Позиция',cue:{x:-.35,z:-.55},object:{x:.06,z:.15},pocket:3,aim:1.08,powerZone:[.28,.42],cueZone:{x:.05,z:.10,r:.055},goal:'Забей светлый шар и оставь красный биток целиком в зелёном кольце.'}
};
const POCKETS=[[-POOL.hx,-POOL.hz],[POOL.hx,-POOL.hz],[-POOL.hx,POOL.hz],[POOL.hx,POOL.hz],[-POOL.hx,0],[POOL.hx,0]];

export async function billiards(ctx){
 const {THREE:T,kit,ui,sound}=ctx;
 const d=kit.diorama({cam:[2.5,3.7,3.7],look:[0,.8,0],radius:4,rail:false}),keys=controls(ctx);
 await asset(ctx,'billiards-table',d.scene);
 const me=d.jelly({name:'Ты',x:-.2,z:-1.75,outfit:{c:9,h:'cap'}});me.face(0,0);
 const meshes=[d.ball(POOL.r,0xb94839,d.scene,28),d.ball(POOL.r,0xf1e4c9,d.scene,28)],cue=d.cyl(.007,.015,1.25,0xab794e,d.scene,12);
 const targetPocket=ring(ctx,d.scene,POOL.hx,POOL.y+.006,POOL.hz,.067,0xdabc68),positionZone=ring(ctx,d.scene,.05,POOL.y+.006,.10,.055,0x80b995);
 let balls=[],phase='ready',task='accuracy',aim=1.21,power=0,chargeT=0,elapsed=0,accum=0,shots=0,pots=0,fouls=0,help=false,settle=0,contact=false,railHits=0,preContactRails=0;
 const records=Object.fromEntries(Object.keys(BILLIARDS_TASKS).map(id=>[id,{attempts:0,wins:0}]));
 const powerMeter=ui.meter('Сила'),shotStat=ui.stat('Удар','—'),resultStat=ui.stat('Результат','Выбери линию'),record=ui.stat('Успехи в задании','0 / 0');
 const aimLine=line(ctx,d.scene,[[0,POOL.y+.035,0],[0,POOL.y+.035,1]],0xeed99b,.7),guide=ring(ctx,d.scene,0,POOL.y+.04,0,.035,0xd9d6b6);guide.visible=false;
 ui.select('Задание',Object.entries(BILLIARDS_TASKS).map(([value,c])=>({value,label:c.title})),task,value=>{task=value;reset();});
 ui.button('Расставить · Enter',()=>reset(),true);ui.button('Повтор · R',()=>reset());
 ui.hold('← Точнее · A',()=>keys.onKey('KeyA',true),()=>keys.onKey('KeyA',false));ui.hold('Точнее · D →',()=>keys.onKey('KeyD',true),()=>keys.onKey('KeyD',false));
 ui.hold('Удар: держи и отпусти · Пробел',()=>charge(),()=>release());ui.button('Подсказка касания',()=>{help=!help;guide.visible=help;});
 function reset(){const c=BILLIARDS_TASKS[task];balls=[{id:0,...c.cue,vx:0,vz:0,on:true,pocket:-1},{id:1,...c.object,vx:0,vz:0,on:true,pocket:-1}];phase='aim';elapsed=0;accum=0;settle=0;power=0;chargeT=0;contact=false;railHits=preContactRails=0;aim=c.aim;keys.clear();powerMeter.set(0);powerMeter.zone(...c.powerZone);const p=POCKETS[c.pocket];targetPocket.position.set(p[0],POOL.y+.006,p[1]);positionZone.visible=!!c.cueZone;ui.note(`${c.title}: ${c.goal} A/D — точная поправка; держи и отпусти Пробел.`);resultStat.set('Прицеливайся');me.action(kit.ACT.none);}
 function charge(){if(phase!=='aim')return;phase='charge';chargeT=0;power=0;sound.tick();}
 function release(){if(phase!=='charge')return;phase='rolling';shots++;records[task].attempts++;elapsed=0;settle=0;balls[0].vx=Math.cos(aim)*(.25+4.75*power);balls[0].vz=Math.sin(aim)*(.25+4.75*power);sound.pop();me.avatar?.jolt?.(.15);resultStat.set('Шары катятся…');}
 function cueInZone(){const c=BILLIARDS_TASKS[task];return !c.cueZone||(balls[0].on&&Math.hypot(balls[0].x-c.cueZone.x,balls[0].z-c.cueZone.z)+POOL.r<=c.cueZone.r);}
 function finish(){const c=BILLIARDS_TASKS[task],safe=balls[0].on,potted=!balls[1].on&&balls[1].pocket===c.pocket,bankOK=!c.bank||preContactRails>0,zoneOK=cueInZone();
  if(safe&&potted&&bankOK&&zoneOK){phase='won';pots++;records[task].wins++;resultStat.set(`${c.title}: выполнено`);ui.note(c.bank?'Через борт — точно в лузу! R — тот же удар.':c.cueZone?'Шар забит, биток остался в зоне. R — закрепи силу.':'Точный срез! R — повтор или выбери другое задание.');sound.ding();me.action(kit.ACT.wave);}
  else{phase='failed';if(!safe)fouls++;const why=!safe?'Не сохранил биток':!contact?'Не задел светлый шар':!bankOK?'Удар без борта':!potted?'Не попал в выбранную лузу':'Биток вне зелёной зоны';resultStat.set(why);ui.note(`${why}. ${c.cueZone&&potted?'Шар забит, но задача требует ещё и позиции битка. ':''}R — повтор той же расстановки.`);sound.slip();}}
 reset();phase='ready';ui.note('Игровой интерфейс не меняем. Здесь три учебных задания: Точность, Борт и Позиция. Enter — расставить.');
 const ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),-(POOL.y+POOL.r));
 return{scene:d.scene,camera:d.camera,target:d.target,cameraOwned:true,
  cancelInput(){keys.clear();if(phase==='charge'){phase='aim';power=0;chargeT=0;powerMeter.set(0);ui.note('Заряд отменён. Снова удерживай и отпусти Пробел для удара.');}},
  onKey(code,down){keys.onKey(code,down);if(down&&(code==='Enter'||code==='KeyR'))reset();if(code==='Space'){if(down)charge();else release();}},
  tap(nx,ny){if(phase!=='aim')return;ray.setFromCamera(new T.Vector2(nx,ny),d.camera);const at=ray.ray.intersectPlane(plane,new T.Vector3());if(at)aim=Math.atan2(at.z-balls[0].z,at.x-balls[0].x);},
  update(dt,t){const c=BILLIARDS_TASKS[task];
   if(phase==='aim'||phase==='charge')aim+=(Number(keys.down('KeyD'))-Number(keys.down('KeyA')))*dt*.22;
   if(phase==='charge'){chargeT+=dt;power=.5-.5*Math.cos(chargeT*2.2);powerMeter.set(power);}
   if(phase==='rolling'){elapsed+=dt;accum+=dt;while(accum>=POOL_DT){const ev={pots:[],rails:0,contact:false};poolStep(balls,POOL_DT,ev);if(!contact)preContactRails+=ev.rails;if(ev.contact&&!contact){contact=true;sound.tick(1.6);}if(ev.rails){railHits+=ev.rails;sound.tick(.8);}for(const id of ev.pots)sound.plip(id?1.4:.6);accum-=POOL_DT;}
    if(balls.every(b=>!b.on||Math.hypot(b.vx,b.vz)<.006))settle+=dt;else settle=0;if(settle>.4||elapsed>12)finish();}
   balls.forEach((b,i)=>{meshes[i].visible=b.on;meshes[i].position.set(b.x,POOL.y+POOL.r,b.z);meshes[i].rotation.x+=b.vz*dt/POOL.r;meshes[i].rotation.z-=b.vx*dt/POOL.r;});
   const b=balls[0],hx=Math.cos(aim),hz=Math.sin(aim),pull=phase==='charge'?.15*power:0;cue.visible=phase==='aim'||phase==='charge';cue.position.set(b.x-hx*(.75+pull),POOL.y+POOL.r,b.z-hz*(.75+pull));cue.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(hx,0,hz));
   aimLine.visible=cue.visible;const attr=aimLine.geometry.getAttribute('position');attr.setXYZ(0,b.x,POOL.y+.033,b.z);attr.setXYZ(1,b.x+hx*.38,POOL.y+.033,b.z+hz*.38);attr.needsUpdate=true;
   if(c.bank)guide.position.set(c.bankPoint.x,POOL.y+.04,c.bankPoint.z);else{const obj=balls[1],p=POCKETS[c.pocket],dx=p[0]-obj.x,dz=p[1]-obj.z,len=Math.hypot(dx,dz);guide.position.set(obj.x-dx/len*POOL.r*2,POOL.y+.04,obj.z-dz/len*POOL.r*2);}guide.visible=help&&cue.visible;
   positionZone.visible=!!c.cueZone;me.update?.(dt,t,d.camera.position);shotStat.set(phase==='rolling'?clockText(elapsed):`${Math.round(power*100)}% силы`);record.set(`${records[task].wins} / ${records[task].attempts}`);
  },
  getState:()=>({mode:'billiards',task,title:BILLIARDS_TASKS[task].title,phase,clock:elapsed,score:pots,shots,fouls,power,aim,contact,railHits,preContactRails,cueInZone:cueInZone(),cueZone:BILLIARDS_TASKS[task].cueZone?{...BILLIARDS_TASKS[task].cueZone}:null,balls:balls.map(b=>({...b})),targetPocket:BILLIARDS_TASKS[task].pocket,records:Object.fromEntries(Object.entries(records).map(([id,r])=>[id,{...r}])),scope:'three local teaching tasks; actual table geometry; production UI/rules and spring solver unchanged',actors:'actual game billiards furniture and Avatar'}),
  dispose(){keys.clear();d.dispose();}
 };
}
