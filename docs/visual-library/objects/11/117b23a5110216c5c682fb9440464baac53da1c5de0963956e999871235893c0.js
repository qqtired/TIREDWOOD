import { controls, asset, marker, ring, line, poseJelly, clamp, clockText } from './common.js';

export async function paintball(ctx) {
  const { THREE:T,kit,ui,sound }=ctx;
  const d=kit.diorama({cam:[17,22,28],look:[0,0,-6],radius:2,rail:false}),keys=controls(ctx);
  d.box(18,.3,34,0xc7c4a6).position.set(0,-.16,-6);
  const covers=[{x:-4,z:3,w:3,d:2,h:1.8},{x:4,z:-3,w:3,d:2,h:1.8},{x:-4,z:-9,w:3,d:2,h:1.8},{x:4,z:-14,w:3,d:2,h:1.8}];
  const coverBoxes=[];
  covers.forEach((c,i)=>{
    const root=new T.Group();root.position.set(c.x,0,c.z);d.scene.add(root);
    d.box(c.w,c.h,c.d,i%2?0xb98959:0x86a899,root).position.y=c.h/2;
    for(const side of [-1,1])d.box(.12,c.h+.05,c.d+.05,0xe1c9a2,root).position.set(side*(c.w/2-.15),c.h/2,0);
    coverBoxes.push(new T.Box3(new T.Vector3(c.x-c.w/2,0,c.z-c.d/2),new T.Vector3(c.x+c.w/2,c.h,c.z+c.d/2)));
  });
  line(ctx,d.scene,[[-3,0.035,8],[-3,0.035,1],[-2.5,0.035,-6],[-3,0.035,-13],[-1,0.035,-19]],0x7caf8e,.8);
  line(ctx,d.scene,[[0,0.035,8],[0,0.035,-19]],0xd8a166,.6);
  marker(ctx,d,'Через укрытия',-5,3,5,5);marker(ctx,d,'Коротко, но открыто',3,3,5,7);marker(ctx,d,'Довези груз',0,3,-20,5);
  const cart=new T.Group();d.scene.add(cart);
  const optionalCart=await asset(ctx,'paintball-cart',cart,true);
  if(!optionalCart){
    d.box(1.9,.18,1.8,0xb28759,cart).position.y=.45;
    for(const x of [-1,1])for(const z of [-.6,.6]){const wheel=d.cyl(.25,.25,.18,0x555c4f,cart,16);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.26,z);}
    for(const x of [-.78,.78]){d.box(.1,.55,1.8,0xd6b58a,cart).position.set(x,.77,0);d.cyl(.045,.045,1.25,0x7c6d56,cart,8).position.set(x,1.3,.75);}
    for(const x of [-.45,.45])for(const z of [-.35,.35]){d.cyl(.26,.27,.55,x<0?0xd78567:0x89ac97,cart).position.set(x,.82,z);d.cyl(.28,.28,.06,0xe7d3af,cart).position.set(x,1.12,z);}
  }
  const escortRing=ring(ctx,d.scene,0,.04,7,3.4,0xe8bf6d),finishRing=ring(ctx,d.scene,0,.04,-19,2,0xa7c29c);
  const me=d.jelly({name:'Ты',x:0,z:10,gun:true,outfit:{c:9,h:'cap'}});
  const foes=[{j:d.jelly({name:'Защитник 1',x:2,z:-5,gun:true,outfit:{c:5,h:'bandana'}}),x:2,z:-5,hp:2,cycle:-1},{j:d.jelly({name:'Защитник 2',x:-2,z:-14,gun:true,outfit:{c:0,h:'cap'}}),x:-2,z:-14,hp:2,cycle:-1}];
  foes.forEach(e=>{e.warning=ring(ctx,d.scene,e.x,.04,e.z,1,0xcb775d);});
  const projectiles=[],paintMarks=[];
  let s={x:0,y:0,z:10,yaw:0,grounded:true},phase='ready',elapsed=0,hp=3,cartZ=7,shots=0,hits=0,blocked=0,enemyShots=0,invulnerable=0,escortedDistance=0,lastPlayerMuzzle=null;
  const hpStat=ui.stat('Жизнь','3 / 3'),goalStat=ui.stat('Груз','0%'),timeStat=ui.stat('Время','—'),shotStat=ui.stat('Попал / выстрелил','0 / 0'),escortStat=ui.stat('Тележка','Старт');
  const aimRay=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),-1),aimPoint=new T.Vector3(0,1,-5);
  ui.button('Старт · Enter',()=>reset(),true);ui.button('Повтор · R',()=>reset());keys.movement();
  ui.button('Выстрел в направлении героя · Пробел',()=>fire(aimPoint),true);
  function clearShots(){for(const p of projectiles){d.scene.remove(p.mesh);p.mesh.geometry?.dispose();p.mesh.material?.dispose?.();}projectiles.length=0;}
  function reset(){phase='running';elapsed=0;hp=3;cartZ=7;shots=hits=blocked=enemyShots=0;invulnerable=0;escortedDistance=0;lastPlayerMuzzle=null;keys.clear();s={x:0,y:0,z:10,yaw:0,grounded:true};for(const e of foes){e.hp=2;e.cycle=-1;e.j.action(kit.ACT.none);const root=e.j.root||e.j.avatar?.root;if(root)root.visible=true;}clearShots();me.action(kit.ACT.none);ui.note('Эскорт: довези груз и останови защитников. Краска вылетает из настоящего маркера; укрытия её блокируют.');}
  function launch(from,to,enemy=false){const delta=new T.Vector3().subVectors(to,from).normalize();const mesh=d.ball(.065,enemy?0xd47d58:0xd68da2);mesh.position.copy(from);projectiles.push({mesh,vel:delta.multiplyScalar(enemy?15:23),enemy,life:2});}
  function muzzle(j,pose){j.pos.set(pose.x,pose.y||0,pose.z);j.yaw=pose.yaw;j.avatar?.onShot?.();j.update?.(.001,elapsed,d.camera.position);if(kit.muzzleWorld)return kit.muzzleWorld(j);if(typeof document!=='undefined')throw Error('Не подключено настоящее дуло Avatar');return new T.Vector3(pose.x,1.05,pose.z);}
  function fire(to){if(phase!=='running')return;const at=to.clone();if(at.distanceTo(new T.Vector3(s.x,1.05,s.z))<.1)return;s.yaw=Math.atan2(-(at.x-s.x),-(at.z-s.z));const from=muzzle(me,s);shots++;lastPlayerMuzzle=from.toArray();aimPoint.copy(at);launch(from,at);sound.pop();}
  function hitCover(ray,length){return coverBoxes.some(b=>{const p=ray.intersectBox(b,new T.Vector3());return p&&p.distanceTo(ray.origin)<=length;});}
  ui.note('Локальная постановочная сцена с двумя защитниками. Укрытия, попадания и жизнь считаются; баланс и сетевой AI здесь не проверяются. Enter — старт.');
  return {
    scene:d.scene,camera:d.camera,target:d.target,cameraOwned:true,
    cancelInput(){keys.clear();},
    onKey(code,down){keys.onKey(code,down);if(down&&(code==='Enter'||code==='KeyR'))reset();if(down&&code==='Space')fire(aimPoint);},
    tap(nx,ny){aimRay.setFromCamera(new T.Vector2(nx,ny),d.camera);let target=null,distance=Infinity;for(const e of foes){if(!e.hp)continue;const hit=aimRay.ray.intersectSphere(new T.Sphere(new T.Vector3(e.x,1,e.z),.75),new T.Vector3());if(hit&&hit.distanceTo(aimRay.ray.origin)<distance){target=new T.Vector3(e.x,1,e.z);distance=hit.distanceTo(aimRay.ray.origin);}}if(!target)target=aimRay.ray.intersectPlane(plane,new T.Vector3());if(target)fire(target);},
    update(dt,t){
      if(phase==='running'){
        elapsed+=dt;invulnerable=Math.max(0,invulnerable-dt);
        const dx=keys.x(),dz=keys.z(),len=Math.hypot(dx,dz)||1,oldX=s.x,oldZ=s.z;
        s.x=clamp(s.x+dx/len*5.2*dt,-8,8);s.z=clamp(s.z+dz/len*5.2*dt,-21,10);
        if(dx||dz){s.yaw=Math.atan2(-dx,-dz);aimPoint.set(s.x-Math.sin(s.yaw)*15,1,s.z-Math.cos(s.yaw)*15);}
        if(covers.some(c=>Math.abs(s.x-c.x)<c.w/2+.4&&Math.abs(s.z-c.z)<c.d/2+.4)){s.x=oldX;s.z=oldZ;}
        const playerNear=Math.hypot(s.x,s.z-cartZ)<3.4,blockedByFoe=foes.some(e=>e.hp&&Math.hypot(e.x,e.z-cartZ)<5.5);
        escortStat.set(!playerNear?'Подойди к грузу':blockedByFoe?'Защитник блокирует':'Едет');
        if(playerNear&&!blockedByFoe){cartZ-=1.75*dt;escortedDistance+=1.75*dt;}
        for(let i=0;i<foes.length;i++){
          const e=foes[i];if(!e.hp)continue;e.x=(i? -1:1)*(1.6+Math.sin(elapsed*.8+i)*1.2);e.z=(i?-14:-5)+Math.sin(elapsed*.4+i)*.8;
          const cycle=Math.floor((elapsed+i*.9)/3.2),p=(elapsed+i*.9)%3.2;
          if(p>2.5&&cycle!==e.cycle){e.cycle=cycle;const pose={x:e.x,y:0,z:e.z,yaw:Math.atan2(-(s.x-e.x),-(s.z-e.z))},from=muzzle(e.j,pose),to=new T.Vector3(s.x,1,s.z);launch(from,to,true);enemyShots++;sound.tick(.7);}
          e.warning.material.opacity=p>1.8?.2+.6*(p-1.8)/1.4:.08;e.warning.position.set(e.x,.04,e.z);
        }
        for(let i=projectiles.length-1;i>=0;i--){
          const p=projectiles[i],old=p.mesh.position.clone(),len=p.vel.length()*dt,ray=new T.Ray(old,p.vel.clone().normalize());p.mesh.position.addScaledVector(p.vel,dt);p.life-=dt;
          let impact=hitCover(ray,len);
          if(impact){if(!p.enemy)blocked++;sound.tick(.6);}
          if(!impact&&!p.enemy){for(const e of foes){if(!e.hp)continue;const hit=ray.intersectSphere(new T.Sphere(new T.Vector3(e.x,1,e.z),.52),new T.Vector3());if(hit&&hit.distanceTo(old)<=len){e.hp--;hits++;impact=true;sound.splat();e.j.avatar?.jolt?.(.6);if(!e.hp)e.j.action(kit.ACT.tired||kit.ACT.sit);break;}}}
          if(!impact&&p.enemy&&!invulnerable){const hit=ray.intersectSphere(new T.Sphere(new T.Vector3(s.x,1,s.z),.5),new T.Vector3());if(hit&&hit.distanceTo(old)<=len){hp--;invulnerable=.55;impact=true;sound.splat();me.avatar?.jolt?.(.7);}}
          if(impact||p.life<=0){d.scene.remove(p.mesh);p.mesh.geometry?.dispose();if(p.mesh.material?.dispose)p.mesh.material.dispose();projectiles.splice(i,1);}
        }
        if(hp<=0){phase='failed';ui.note('Тебя заляпали. Попробуй пройти через укрытия и остановить защитника раньше. R — повтор.');sound.slip();clearShots();}
        else if(cartZ<=-19&&hits>=4&&escortedDistance>=10){phase='won';ui.note(`Груз доставлен! ${clockText(elapsed)} · попаданий ${hits}/${shots} · жизнь ${hp}/3. R — другой подход.`);sound.fanfare();me.action(kit.ACT.wave);clearShots();}
        else if(elapsed>60){phase='failed';ui.note('Груз не довезён за минуту. Подойди к нему, останови блокирующего защитника. R — повтор.');clearShots();}
      }
      poseJelly(me,s,dt,t,d.camera);
      for(const e of foes){poseJelly(e.j,{x:e.x,y:0,z:e.z,yaw:Math.atan2(-(s.x-e.x),-(s.z-e.z)),grounded:true},dt,t,d.camera);e.warning.visible=e.hp>0;}
      cart.position.set(0,0,cartZ);escortRing.position.z=cartZ;
      escortRing.material.opacity=phase==='running'&&Math.hypot(s.x,s.z-cartZ)<3.4?.75:.22;
      d.camera.position.set(s.x*.25+13,18,s.z+15);d.camera.lookAt(s.x*.3,0,s.z-7);
      hpStat.set(`${Math.max(0,hp)} / 3`);goalStat.set(`${Math.round(clamp((7-cartZ)/26,0,1)*100)}%`);timeStat.set(clockText(elapsed));shotStat.set(`${hits} / ${shots}`);
      if(phase==='won')escortStat.set('Доставлено');else if(phase==='failed')escortStat.set('Попытка окончена');
    },
    getState:()=>({mode:'paintball',feature:'escort',phase,clock:elapsed,score:(7-cartZ)/26,hp,cartZ,shots,hits,escortedDistance,playerMuzzle:lastPlayerMuzzle,marker:kit.muzzleWorld?'actual Avatar gun/muzzle/recoil':'Node test stub',blockedShots:blocked,enemyShots,enemies:foes.map(e=>({hp:e.hp,x:e.x,z:e.z})),position:{x:s.x,z:s.z},scope:'local escort with staged defenders; does not prove two-team moving-point capture, production balance or AI',actors:'actual game Avatar with marker'}),
    dispose(){keys.clear();clearShots();d.dispose();}
  };
}
