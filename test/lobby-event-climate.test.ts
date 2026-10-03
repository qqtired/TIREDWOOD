import assert from'node:assert/strict';import{test}from'node:test';import{registerHooks}from'node:module';import*as THREE from'three';
import{EVENING,makeSky,makeSea}from'../client/render/sky.ts';
test('World storm contribution restores baseline rain/light, respects quality, and toggles the existing lighthouse beam',async()=>{
 // Node cannot import image assets. Only URL imports are stubbed; the actual World methods and Three objects run.
 const hook=registerHooks({load(url,ctx,next){if(/\.(webp|png|jpg|glb|bin|css)$/.test(new URL(url).pathname))return{format:'module',source:`export default ${JSON.stringify(url)}`,shortCircuit:true};return next(url,ctx);}});
 let World:any;try{World=(await import('../client/lobby/world.ts')).LobbyWorld;}finally{hook.deregister();}
 const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xffffff,70,460);scene.background=new THREE.Color();
 const lamp=new THREE.PointLight(),powered=new THREE.Object3D(),sign=new THREE.MeshStandardMaterial({emissiveIntensity:.4});let enabled=true;
 const w=Object.assign(Object.create(World.prototype),{weather:{on:false,overcast:0,rain:0,wet:0},storm:{dark:0,rain:0,flash:0,lampsOn:true},
  scene,skyMat:makeSky(EVENING).material,seaMat:makeSea(EVENING).material,sun:new THREE.DirectionalLight(),hemi:new THREE.HemisphereLight(),
  beamMat:{uniforms:{uStrength:{value:0}}},haze:{uHaze:{value:0},uHazeColor:{value:new THREE.Color()}},wet:{uWet:{value:0}},wetMats:[],envRain:new THREE.Texture(),envClear:new THREE.Texture(),
  lamps:[lamp],powered:[powered],poweredSigns:new Map([[sign,.4]]),lampQuality:'high',look:{weather(){}},lighthouse:{setLampEnabled:(v:boolean)=>enabled=v},beam:new THREE.Group(),beamFlash:new THREE.Group()});
 w.setRain(true,true);const base={...w.weather},sun=w.sun.intensity,hemi=w.hemi.intensity;w.setStormClimate(1,1,0,false);assert.deepEqual(w.weather,base);assert.ok(w.hemi.intensity<hemi);assert.equal(lamp.visible,false);assert.equal(powered.visible,false);assert.equal(sign.emissiveIntensity,0);
 const darkSun=w.sun.intensity;w.setStormClimate(1,1,.7,false);assert.ok(w.sun.intensity>darkSun);w.setStormClimate(1,1,0,false);assert.equal(w.sun.intensity,darkSun,'lighting cannot compound each frame');
 w.setStormClimate(0,0,0,true);assert.deepEqual(w.weather,base);assert.equal(w.effectiveRain,1);assert.equal(w.sun.intensity,sun);assert.equal(lamp.visible,true);assert.equal(sign.emissiveIntensity,.4);
 w.lampQuality='low';w.setStormClimate(1,1,0,false);w.setStormClimate(0,0,0,true);assert.equal(lamp.visible,false);
 w.setLighthouseEnabled(false);assert.equal(enabled,false);assert.equal(w.beam.visible,false);w.setLighthouseEnabled(true);assert.equal(enabled,true);assert.equal(w.beam.visible,true);
});
