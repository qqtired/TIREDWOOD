import assert from'node:assert/strict';import{test}from'node:test';import{registerHooks}from'node:module';import*as THREE from'three';
import{EVENING,makeSky,makeSea}from'../client/render/sky.ts';import{WeatherState}from'../client/lobby/weatherfx.ts';import{rainEvent,rainPlan}from'../shared/weather.ts';
test('радуга после обычного дождя: если по плану — когда разойдутся тучи, потом гаснет; после бубна — нет',()=>{
 const seed=[...Array(64).keys()].find(s=>rainPlan(rainEvent({dur:300*60,seed:s,k:0})).rainbow)!;assert.ok(seed!==undefined);
 const w=new WeatherState();let now=0;const go=(sec:number)=>{for(let i=0;i<sec*10;i++){now+=.1;w.step(.1,now,()=>{});}};
 w.set(true,true,{el:290*60,dur:300*60,seed,k:0},now);go(5);w.set(false,false,null,now);assert.equal(w.rainbow(now),0);
 go(12);assert.ok(w.rainbow(now)>.5,`радуга ${w.rainbow(now)}`);go(60);assert.equal(w.rainbow(now),0);
 const drum=new WeatherState();drum.set(true,true,{el:290*60,dur:300*60,seed,k:1},0);drum.set(false,false,null,1);assert.equal(drum.rainbow(12),0);
});
test('World: storm is weather at full force (restores baseline), flash never compounds, lamps respect quality, lighthouse beam toggles',async()=>{
 // Node cannot import image assets. Only URL imports are stubbed; the actual World methods and Three objects run.
 const hook=registerHooks({load(url,ctx,next){if(/\.(webp|png|jpg|glb|bin|css)$/.test(new URL(url).pathname))return{format:'module',source:`export default ${JSON.stringify(url)}`,shortCircuit:true};return next(url,ctx);}});
 let World:any;try{World=(await import('../client/lobby/world.ts')).LobbyWorld;}finally{hook.deregister();}
 const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xffffff,70,460);scene.background=new THREE.Color();
 const lamp=new THREE.PointLight(),powered=new THREE.Object3D(),sign=new THREE.MeshStandardMaterial({emissiveIntensity:.4});let enabled=true;const heard:any[]=[];
 const w=Object.assign(Object.create(World.prototype),{weather:new WeatherState(),sky:{flash:0,rainbow:{target:0},strike(){},update(){}},strikeFns:new Set(),
  scene,skyMat:makeSky(EVENING).material,seaMat:makeSea(EVENING).material,sun:new THREE.DirectionalLight(),hemi:new THREE.HemisphereLight(),
  beamMat:{uniforms:{uStrength:{value:0}}},haze:{uHaze:{value:0},uHazeColor:{value:new THREE.Color()}},wet:{uWet:{value:0}},wetMats:[],envRain:new THREE.Texture(),envClear:new THREE.Texture(),
  lamps:[lamp],powered:[powered],poweredSigns:new Map([[sign,.4]]),lampQuality:'high',look:{weather(){}},lighthouse:{setLampEnabled:(v:boolean)=>enabled=v},beam:new THREE.Group(),beamFlash:new THREE.Group(),
  camera:new THREE.PerspectiveCamera(),rainFx:{update(){}},cover:{top:()=>-1}});
 const run=(sec:number)=>{for(let i=0;i<sec*10;i++)w.stepWeather(.1);};
 // обычный дождь в разгаре (вошли — сразу, без перехода)
 w.setRain(true,true,{el:150*60,dur:360*60,seed:12345,k:0});assert.ok(w.weather.rain>.3&&w.weather.overcast>.8);
 const sun=w.sun.intensity,hemi=w.hemi.intensity;
 // шторм поверх: темнее, свет в городе гаснет, дождь — на максимум
 w.setStormClimate(1,false);run(6);assert.ok(w.hemi.intensity<hemi);assert.ok(w.weather.rain>.95);assert.equal(lamp.visible,false);assert.equal(powered.visible,false);assert.equal(sign.emissiveIntensity,0);
 const darkSun=w.sun.intensity;w.sky.flash=.8;w.applyWeather();assert.ok(w.sun.intensity>darkSun);w.sky.flash=0;w.applyWeather();assert.equal(w.sun.intensity,darkSun,'lighting cannot compound each frame');
 // стих: снова обычный дождь и свет
 w.setStormClimate(0,true);run(20);assert.equal(w.weather.on,true);assert.ok(Math.abs(w.sun.intensity-sun)<.05);assert.equal(lamp.visible,true);assert.equal(sign.emissiveIntensity,.4);
 w.lampQuality='low';w.setStormClimate(1,false);w.setStormClimate(0,true);assert.equal(lamp.visible,false);
 // удар молнии: подписчики слышат, где и как далеко; близко к камере не бьёт
 w.onStrike((e:any)=>heard.push(e));w.camera.position.set(0,3,30);w.camera.updateMatrixWorld();w.strike({t:0,x:5,z:40,power:1,far:false,shape:1});
 assert.equal(heard.length,1);assert.ok(heard[0].dist>=27.9);assert.ok(heard[0].pan>=-1&&heard[0].pan<=1);
 w.setLighthouseEnabled(false);assert.equal(enabled,false);assert.equal(w.beam.visible,false);w.setLighthouseEnabled(true);assert.equal(enabled,true);assert.equal(w.beam.visible,true);
});
