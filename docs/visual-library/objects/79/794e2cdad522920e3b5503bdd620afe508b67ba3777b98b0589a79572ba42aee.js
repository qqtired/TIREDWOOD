import {component,marker,authoredAnimation} from './common.js';

// The whole tower is authored geometry; the 4.8m controller remains a separate educational slice.
export function authoredTowerOverview(ctx,d,pack,content){
 const T=ctx.THREE,root=component(pack,'tower_full_overview',d.scene),centers=[],labels=[];
 const offset=new T.Vector3(-32,0,-18);
 if(root){root.position.copy(offset);root.updateMatrixWorld(true);}
 for(let i=0;i<content.length;i++){
  const [from,to,title]=content[i],anchor=root?.getObjectByName(`sector_${String(i+1).padStart(2,'0')}`);
  const fallback=new T.Vector3(Math.cos(i*.84)*8.9,(from+to)/2,Math.sin(i*.84)*8.9).add(offset);
  const center=anchor?anchor.getWorldPosition(new T.Vector3()):fallback;centers.push(center);
  if(root)labels.push(marker(ctx,d,title,center.x,center.y+2.2,center.z,6.5));
 }
 if(root)for(let b=0;b<6;b++)labels.push(marker(ctx,d,`${b*30}–${b===5?185:(b+1)*30} м`,offset.x, b*30+6,offset.z+12,10));
 const animation=authoredAnimation(ctx,pack,root);
 return {
  root,centers,objects:[root,...labels].filter(Boolean),available:!!root,clips:animation.clips,
  setVisible(on,sector=null){if(root)root.visible=on;labels.forEach((label,i)=>{if(label)label.visible=on&&(sector===null||i===sector||i>=content.length);});},
  update(dt,on){if(on)animation.update(dt);},dispose(){animation.dispose();}
 };
}
