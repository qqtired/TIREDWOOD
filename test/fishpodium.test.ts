import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { FishPodium3D, makePodiumFish, podiumFishLength } from '../client/lobby/fishpodium.ts';
import { FISH_PODIUM, FISH_PODIUM_STEPS, FISH_PODIUM_STEP_WIDTH } from '../shared/fishplaces.ts';
import { FISH, fmtWeight } from '../shared/fishing.ts';
import { COLLECTION } from '../shared/fishrules.ts';

const species = (id:string):number => FISH.findIndex(f=>f.id===id);
const first = FISH_PODIUM_STEPS.find(s=>s.rank===0)!;
const bounds = (object:THREE.Object3D):THREE.Box3 => new THREE.Box3().setFromObject(object);

test('same species grows visibly from 26 to 100 kg, beyond the hand-held cap',()=>{
  for(const id of ['tuna','swordfish','whiteshark']) {
    const sp=species(id);
    const small=makePodiumFish(sp,26_000,first).getObjectByName('podium-fish')!;
    const large=makePodiumFish(sp,100_000,first).getObjectByName('podium-fish')!;
    const a=bounds(small).getSize(new THREE.Vector3()),b=bounds(large).getSize(new THREE.Vector3());
    assert.ok(b.y/a.y>1.5,`${id}: ${b.y/a.y}x length`);
    // Uniform scale preserves each species' shape instead of only stretching its body.
    assert.ok(Math.abs(b.x/a.x-b.y/a.y)<1e-9);
    assert.ok(Math.abs(b.z/a.z-b.y/a.y)<1e-9);
  }
});

test('25, 320 and 540 kg trophies read as different masses across the screenshot species',()=>{
  const small=podiumFishLength(species('sturgeon'),25_430);
  const middle=podiumFishLength(species('whiteshark'),320_700);
  const large=podiumFishLength(species('whiteshark'),540_180);
  assert.ok(middle>small*2.4);
  assert.ok(large>middle*1.2);
  assert.ok(large>2.3,'large catches are no longer capped at 87 cm');
  for(const sp of COLLECTION) {
    let previous=0;
    for(let i=0;i<=20;i++) {
      const [min,max]=FISH[sp].g;
      const length=podiumFishLength(sp,min+(max-min)*i/20);
      assert.ok(length>previous,`${FISH[sp].id}: growth must never flatten in its valid range`);
      previous=length;
    }
  }
});

test('every maximum-weight model and its holder fit each original step footprint without neighbour overlap',()=>{
  // Real cached Three geometry, including fins: this is stronger than testing target length alone.
  for(const sp of COLLECTION) {
    const rows=FISH_PODIUM_STEPS.map(step=>{
      const model=makePodiumFish(sp,FISH[sp].g[1],step),box=bounds(model);
      assert.ok(box.min.x>=step.x-FISH_PODIUM_STEP_WIDTH/2,`${FISH[sp].id}: left edge`);
      assert.ok(box.max.x<=step.x+FISH_PODIUM_STEP_WIDTH/2,`${FISH[sp].id}: right edge`);
      assert.ok(box.min.z>=-.64 && box.max.z<=.64,`${FISH[sp].id}: depth within existing step`);
      assert.ok(box.min.y>=step.h-1e-9,`${FISH[sp].id}: supported above step`);
      assert.ok(bounds(model.getObjectByName('podium-fish')!).max.y<4.7,'highest fish remains inside the finite display envelope');
      return box;
    });
    for(let i=1;i<rows.length;i++) assert.ok(rows[i-1].max.x<rows[i].min.x);
  }
});

test('five catches keep their ranks and labels; clearing the daily board removes fish and lowers the header',()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,'document');
  const texts:string[]=[];
  const context={fillStyle:'',textAlign:'',textBaseline:'',font:'',fillRect(){},fillText(text:string){texts.push(text);},measureText(text:string){return {width:text.length*12};}};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(){return {width:0,height:0,getContext(){return context;}};}}});
  try {
    const scene=new THREE.Scene(),podium=new FishPodium3D(scene);
    podium.group.updateMatrixWorld(true);
    const labelSizes:THREE.Vector3[]=[];
    for(const step of FISH_PODIUM_STEPS) {
      const labels=podium.group.getObjectByName(`podium-label-${step.rank+1}`)!;
      const panel=labels.getObjectByName('podium-catch-label') as THREE.Mesh;
      const rank=labels.getObjectByName('podium-rank-label') as THREE.Mesh;
      const plate=bounds(panel),rankBox=bounds(rank),support=bounds(labels);
      labelSizes.push(plate.getSize(new THREE.Vector3()));
      assert.ok(plate.min.y>FISH_PODIUM.y+FISH_PODIUM.h+.04,'lowest plate clears the base rail');
      assert.ok(rankBox.min.y>plate.max.y,'rank is on a separate strip above the catch');
      assert.ok(support.min.z>=FISH_PODIUM.z-FISH_PODIUM.d/2,'labels and mounts stay inside the old front edge');
      assert.ok(panel.material instanceof THREE.MeshBasicMaterial && !panel.material.toneMapped,'text does not darken with the night/weather lighting');
      for(const sp of COLLECTION) {
        const trophy=makePodiumFish(sp,FISH[sp].g[0],step);
        trophy.updateMatrixWorld(true);
        const fish=bounds(trophy.getObjectByName('podium-fish')!);
        assert.ok(fish.min.y>rankBox.max.y-FISH_PODIUM.y+.05,'raised labels never cover even the smallest catch');
      }
    }
    for(const size of labelSizes) assert.ok(size.distanceTo(labelSizes[0])<1e-8,'all ranks have equally large catch plates');
    const rows=FISH_PODIUM_STEPS.map((_,rank)=>({pid:1,nick:`Рыбак ${rank+1}`,sp:species('greenlandshark'),g:1_400_000-rank*100_000,at:rank}));
    podium.set(rows);
    const trophies=podium.group.children.filter(child=>child.name==='podium-trophy');
    assert.equal(trophies.length,5);
    for(let rank=0;rank<5;rank++) {
      const step=FISH_PODIUM_STEPS.find(s=>s.rank===rank)!;
      assert.equal(trophies[rank].position.x,step.x);
      assert.equal(trophies[rank].position.y,step.h);
      assert.ok(texts.includes(`${rank+1} МЕСТО`));assert.ok(texts.includes(rows[rank].nick));
      assert.ok(texts.includes(fmtWeight(rows[rank].g)));
    }
    const rail=podium.group.getObjectByName('podium-title-rail')!;
    assert.ok(bounds(rail).min.y>Math.max(...trophies.map(t=>bounds(t).max.y)),'header clears even the heaviest fish');
    const size=bounds(podium.group).getSize(new THREE.Vector3());
    assert.ok(size.x<=FISH_PODIUM.w+.001 && size.z<=FISH_PODIUM.d+.001,'display does not expand the old horizontal footprint');
    const raised=rail.position.y;
    podium.set([]);
    assert.equal(podium.group.children.filter(child=>child.name==='podium-trophy').length,0);
    assert.ok(rail.position.y<raised);
    assert.equal(texts.filter(text=>text==='Ждёт улова').length,10,'initial and reset empty labels');
  } finally {
    if(prior) Object.defineProperty(globalThis,'document',prior);else Reflect.deleteProperty(globalThis,'document');
  }
});
