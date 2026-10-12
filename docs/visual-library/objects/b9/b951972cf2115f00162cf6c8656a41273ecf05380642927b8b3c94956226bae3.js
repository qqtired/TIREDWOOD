import {component,marker,authoredAnimation} from './common.js';

export function authoredRegattaOverview(ctx,d,pack){
 const T=ctx.THREE,root=component(pack,'regatta_full_course',d.scene),labels=[];
 if(root){root.position.set(0,-.3,0);root.updateMatrixWorld(true);}
 const fallback={zone_marina:[-61,0,-12],zone_cliffs:[36,0,-22],zone_lighthouse:[52,0,41],inner_line:[36,0,-22],outer_line:[43,0,-30]},centers={};
 for(const [key,p] of Object.entries(fallback)){const anchor=root?.getObjectByName(key);centers[key]=anchor?anchor.getWorldPosition(new T.Vector3()):new T.Vector3(...p);}
 if(root)for(const [title,key] of [['Марина','zone_marina'],['Белые скалы','zone_cliffs'],['Маячок','zone_lighthouse'],['Внутри: узкий срез','inner_line'],['Снаружи: широкая дуга','outer_line']]){const p=centers[key];labels.push(marker(ctx,d,title,p.x,p.y+6,p.z,13));}
 const animation=authoredAnimation(ctx,pack,root),box=root?new T.Box3().setFromObject(root):new T.Box3(new T.Vector3(-70,-1,-60),new T.Vector3(70,15,60));
 const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),span=Math.max(size.x,size.z,80);
 return{root,objects:[root,...labels].filter(Boolean),available:!!root,centers,clips:animation.clips,
  setVisible(on){if(root)root.visible=on;labels.forEach(m=>{if(m)m.visible=on;});},
  update(dt,on){if(on)animation.update(dt);},
  camera(view,camera){camera.fov=58;camera.updateProjectionMatrix();if(view==='planning'){camera.position.set(center.x+span*.6,center.y+span*.65,center.z+span*.82);camera.lookAt(center);}else{const shot=root?.getObjectByName('game_camera_'+view),look=root?.getObjectByName('game_look_'+view);if(shot&&look){camera.fov=68;camera.updateProjectionMatrix();camera.position.copy(shot.getWorldPosition(new T.Vector3()));camera.lookAt(look.getWorldPosition(new T.Vector3()));labels.forEach(m=>{if(m)m.visible=false;});}else{const key={marina:'zone_marina',cliffs:'zone_cliffs',lighthouse:'zone_lighthouse',choice:'inner_line'}[view]||'inner_line',p=centers[key];camera.position.set(p.x+28,p.y+22,p.z+34);camera.lookAt(p);}}},
  dispose(){animation.dispose();}
 };
}
