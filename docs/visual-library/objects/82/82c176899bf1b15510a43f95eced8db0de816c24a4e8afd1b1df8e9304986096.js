import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {createWeaponStage} from './weapon.js';

export function createViewer(canvas,assets,onInfo){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#251c16');
 scene.add(new THREE.HemisphereLight('#ffebcd','#50463b',2));
 const key=new THREE.DirectionalLight('#ffd6a0',3.4);key.position.set(-5,8,5);scene.add(key);
 const rim=new THREE.DirectionalLight('#b9b6d0',1.25);rim.position.set(4,5,-5);scene.add(rim);
 const floor=new THREE.Mesh(new THREE.CircleGeometry(18,64),new THREE.MeshStandardMaterial({color:'#9C7B5B',roughness:.94}));floor.rotation.x=-Math.PI/2;floor.position.y=-.025;scene.add(floor);
 const grid=new THREE.GridHelper(24,24,'#765a42','#876c52');grid.position.y=-.018;scene.add(grid);
 const camera=new THREE.PerspectiveCamera(34,1,.02,200);camera.position.set(4,3.5,6);
 const controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.09;
 const loader=new GLTFLoader();let model=null,mixer=null,action=null,clips=[],extent=1,modelHeight=1,id=null,playing=false,visible=true,requested=false,last=performance.now(),view='3q';
 const cache=new Map();let requestNumber=0;
 let weapon=null,weaponCanvas=null,weaponCtx=null,weaponVisible=false,weaponPlaying=true;
 function frame(now){requested=false;const dt=Math.min((now-last)/1000,.04);last=now;if((!visible&&!weaponVisible)||document.hidden)return;
  if(weapon&&weaponVisible){if(weaponPlaying)weapon.update(dt);weapon.camera.aspect=camera.aspect;weapon.camera.updateProjectionMatrix();renderer.render(weapon.scene,weapon.camera);weaponCtx.drawImage(canvas,0,0,weaponCanvas.width,weaponCanvas.height);}
  if(visible){controls.update();if(mixer&&playing)mixer.update(dt);renderer.render(scene,camera);}if(playing&&visible||weaponVisible&&weaponPlaying)requestFrame();}
 function requestFrame(){if(!requested&&(visible||weaponVisible)&&!document.hidden){requested=true;requestAnimationFrame(frame);}}
 controls.addEventListener('change',requestFrame);
 const observer=new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible){last=performance.now();requestFrame();}},{rootMargin:'100px'});observer.observe(canvas);
 document.addEventListener('visibilitychange',()=>{last=performance.now();requestFrame();});
 const resize=new ResizeObserver(()=>{const w=canvas.clientWidth||640,h=canvas.clientHeight||420;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();requestFrame();});resize.observe(canvas);
 function positionCamera(){const targetY=modelHeight*.5;controls.target.set(0,targetY,0);const dist=extent*2.1;
  if(view==='top')camera.position.set(.001,targetY+dist*.883,dist*.469);
  else if(view==='front')camera.position.set(0,targetY+dist*.23,dist);
  else if(view==='side')camera.position.set(dist,targetY+dist*.3,.001);
  else camera.position.set(dist*.67,targetY+dist*.58,dist*.83);
  controls.minDistance=extent*.85;controls.maxDistance=extent*6;controls.update();requestFrame();
 }
 async function load(next){id=next;const req=++requestNumber;playing=false;if(mixer)mixer.stopAllAction();if(model){scene.remove(model);model=null;}mixer=null;clips=[];action=null;
  if(!assets[next]){onInfo({id:next,missing:true});requestFrame();return;}
  onInfo({id:next,loading:true});
  let gltf=cache.get(next);if(!gltf){const raw=atob(assets[next].base64);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);gltf=await new Promise((resolve,reject)=>loader.parse(bytes.buffer,'',resolve,reject));cache.set(next,gltf);}
  if(req!==requestNumber)return;
  model=gltf.scene;model.position.set(0,0,0);model.scale.set(1,1,1);model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());model.position.set(-center.x,-box.min.y,-center.z);extent=Math.max(size.x,size.y,size.z,1);modelHeight=size.y;scene.add(model);
  floor.scale.setScalar(Math.max(extent*.5,1)/2);grid.scale.setScalar(Math.max(extent*.25,1));
  mixer=new THREE.AnimationMixer(model);clips=gltf.animations;let tris=0,meshes=0;model.traverse(o=>{if(o.isMesh){meshes++;tris+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;}});
  positionCamera();const idle=clips.find(c=>/idle/i.test(c.name));if(idle)play(idle.name,false);
  onInfo({id:next,loaded:true,clips:clips.map(c=>({name:c.name,duration:c.duration})),triangles:Math.round(tris),meshes,size:[size.x,size.z,size.y],manifest:assets[next].manifest});requestFrame();
 }
 function play(name,run=true){if(!mixer)return;const clip=clips.find(c=>c.name===name);if(!clip)return;mixer.stopAllAction();action=mixer.clipAction(clip);action.reset().setLoop(THREE.LoopRepeat,Infinity).play();playing=run;last=performance.now();mixer.update(0);requestFrame();}
 function pause(){playing=false;requestFrame();}
 function resume(){playing=!!action;last=performance.now();requestFrame();}
 function pose(f){if(!action||!mixer)return;playing=false;action.time=Math.max(0,Math.min(.999,f))*action.getClip().duration;mixer.update(0);requestFrame();}
 function cameraView(v){view=v;positionCamera();}
 function wire(on){model?.traverse(o=>{if(o.isMesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials)m.wireframe=on;}});requestFrame();}
 function weaponPreview(target,next,evo,stats){if(!weapon){weapon=createWeaponStage();weaponCanvas=target;weaponCtx=target.getContext('2d');new IntersectionObserver(es=>{weaponVisible=es[0].isIntersecting;last=performance.now();requestFrame();},{rootMargin:'100px'}).observe(target);}weapon.choose(next,evo,stats);requestFrame();}
 function weaponPause(on){weaponPlaying=!on;requestFrame();}
 return {load,play,pause,resume,pose,cameraView,wire,weaponPreview,weaponPause,get playing(){return playing;},get clip(){return action?.getClip().name;},get clips(){return clips;}};
}
