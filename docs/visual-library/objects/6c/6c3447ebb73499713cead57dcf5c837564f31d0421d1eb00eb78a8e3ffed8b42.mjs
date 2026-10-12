import * as THREE from '/@fs[LOCAL_PATH]';
import {Renderer} from '/@fs[LOCAL_PATH]';
import {LobbyWorld} from '/@fs[LOCAL_PATH]';
import {PlazaDress} from '/@fs[LOCAL_PATH]';
const canvas=document.querySelector('canvas'), r=new Renderer(canvas),world=new LobbyWorld(r,'high');const scene=world.scene;
const plaza=new PlazaDress(world.plazaCtx,{groundBelow:()=>0},()=>r.refreshShadows());for(const mode of ['fort','sky','fight','regatta','hide'])plaza.setMode(mode,true);
const cam=world.camera;cam.fov=44;function resize(){r.gl.setSize(innerWidth,innerHeight-80,false);cam.aspect=innerWidth/(innerHeight-80);cam.updateProjectionMatrix()}resize();addEventListener('resize',resize);
function view(pos,target){cam.position.set(...pos);cam.lookAt(...target);r.gl.clear();r.gl.render(scene,cam);document.querySelector('#status').textContent='Текущая геометрия игры · локальная сцена без входа на сервер';}document.querySelector('#north').onclick=()=>view([0,16,47],[0,4,-17]);document.querySelector('#cafe').onclick=()=>view([4,13,20],[24,3,-1]);document.querySelector('#kiosk').onclick=()=>view([-11,7,11],[-27,2,-3]);view([0,16,47],[0,4,-17]);
