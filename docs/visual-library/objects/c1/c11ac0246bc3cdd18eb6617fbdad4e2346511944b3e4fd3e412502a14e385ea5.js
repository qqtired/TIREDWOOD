import {GLTFLoader} from '../../../game-opus/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {clone as skeletonClone} from '../../../game-opus/node_modules/three/examples/jsm/utils/SkeletonUtils.js';
import {kit} from './kit.js';
const registry=JSON.parse(document.getElementById('model-data').textContent);
const cache=new Map(),loader=new GLTFLoader();
const bytes=s=>{const decoded=atob(s);return Uint8Array.from(decoded,c=>c.charCodeAt(0)).buffer;};
export const assets={
 available:id=>['boat','kart','billiards-table'].includes(id)||!!registry[id],
 async clone(id){
  if(id==='boat')return kit.boat();
  if(id==='kart')return kit.kart();
  if(id==='billiards-table')return kit.billiardsTable();
  const data=registry[id];if(!data)throw new Error('Отсутствует настоящий GLB '+id);
  if(!cache.has(id))cache.set(id,loader.parseAsync(bytes(data.base64),'').catch(e=>{cache.delete(id);throw e;}));
  const gltf=await cache.get(id),group=skeletonClone(gltf.scene);
  group.animations=gltf.animations;group.userData.labModelId=id;group.userData.provenance=data.provenance;
  group.traverse(o=>{if(o.name==='route_plan_overlay'||o.userData.planOverlayOnly===true)o.visible=false;if(o.isMesh){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();o.castShadow=true;o.receiveShadow=true;}});
  return group;
 },
 info:id=>registry[id]||null,
 ids:()=>Object.keys(registry),
 clear(){for(const p of cache.values())p.then(g=>g.scene.traverse(o=>{o.geometry?.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))m?.dispose();}));cache.clear();}
};
