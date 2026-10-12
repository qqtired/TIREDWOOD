// Actual shared step with legal finished loadouts and three deterministic input policies. Not browser/playtest evidence.
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),GAME='[LOCAL_PATH]';
const api=await import(pathToFileURL(join(GAME,'shared/dungeon/sim.ts')));
const {startWave,stepDirector}=await import(pathToFileURL(join(GAME,'shared/dungeon/director.ts')));
const {applyCard,openChest}=await import(pathToFileURL(join(GAME,'shared/dungeon/progress.ts')));
const {D}=await import(pathToFileURL(join(GAME,'shared/dungeon/data.ts')));
const {wrapD}=await import(pathToFileURL(join(GAME,'shared/dungeon/util.ts')));
const calculations=JSON.parse(readFileSync(join(ROOT,'./calculations.json'))),rows=[];
for(const build of calculations.builds)for(const policy of ['stand','orbit6','retreat16','contact2.6-registration']) {
 const s=api.createRun(7043);s.t=1;s.props=[];s.weapons=[];s.passives=[];s.temper=5;
 for(const w of build.weapons)for(let lv=1;lv<=7;lv++)applyCard(s,{k:'w',id:w.id,lv});
 for(const [id,lv]of Object.entries(build.passives))for(let n=1;n<=lv;n++)applyCard(s,{k:'p',id,lv:n});
 for(const w of build.weapons)if(w.evolved){openChest(s,'plain');s.chest=null;}
 if(s.weapons.length!==5||s.passives.length!==5||s.weapons.some(w=>!w.evo))throw Error('illegal loadout');
 if(policy==='contact2.6-registration')s.hero.hp=s.hero.hpMax=10000;
 startWave(s,20);stepDirector(s);const boss=s.mobs.find(m=>m.k==='cauldronmaster');
 const phases={1:0},attacks={},maxState={mobs:0,enemyCharges:0,marks:0,shots:0,traps:0};let hit=0,bossKilledAt=null,last='';
 for(let frame=0;frame<3600&&s.end==='running';frame++) {
  if(s.chest)api.applyEvent(s,{t:s.t,k:'pick',i:0});
  if(s.choice){const i=Math.max(0,s.choice.cards.findIndex(c=>c.k==='stew'));api.applyEvent(s,{t:s.t,k:'pick',i});}
  const dx=wrapD(s.hero.x-boss.x),dz=wrapD(s.hero.z-boss.z),dist=Math.sqrt(dx*dx+dz*dz)||1;let mx=0,mz=0;
  if(policy==='orbit6'){const radial=(6-dist)*.35;mx=-dz/dist+dx/dist*radial;mz=dx/dist+dz/dist*radial;}
  else if(policy==='retreat16'&&dist<16){mx=dx/dist;mz=dz/dist;}
  else if(policy==='contact2.6-registration'){const direction=dist<2.55?1:dist>2.65?-1:0;mx=dx/dist*direction;mz=dz/dist*direction;}
  const len=Math.max(1,Math.sqrt(mx*mx+mz*mz));api.applyEvent(s,{t:s.t,k:'mv',x:Math.round(mx/len*100),y:Math.round(mz/len*100)});
  api.step(s);
  for(const f of s.fx)if(f.k==='hurt')hit+=f.n;
  const b=s.bosses.find(b=>b.id===boss.id);
  if(b){if(phases[b.phase]===undefined)phases[b.phase]=s.t/30;const key=b.act+':'+b.actT;if(key!==last){last=key;if(['ladle','ladle2','pour','boil'].includes(b.act))attacks[b.act]=(attacks[b.act]??0)+1;}}
  if(boss.die&&bossKilledAt===null)bossKilledAt=s.t/30;
  for(const [key,arr]of [['mobs',s.mobs.filter(m=>!m.die)],['enemyCharges',s.enemyCharges],['marks',s.marks],['shots',s.shots],['traps',s.traps]])maxState[key]=Math.max(maxState[key],arr.length);
  if(bossKilledAt!==null)break;
 }
 rows.push({build:build.id,policy,registrationOnly:policy==='contact2.6-registration',ticks:s.t,bossKilledAt,bossHp:Math.max(0,Math.round(boss.hp)),heroHp:Math.round(s.hero.hp),heroHpMax:s.hero.hpMax,heroDamageReceived:hit,end:s.end,wave:s.wave.n,phases,attacks,maxState,weaponDamage:s.stats.dmg});
}
const out={date:'2026-10-12',seed:7043,method:'Actual shared simulation, finished legal5+5 loadout, temper5, normal map collision/invulnerability, auto-pick healing if offered, no Q/dash/building effects. Stand/orbit6/retreat16 use normal HP. Contact2.6-registration uses10000HP solely to exercise all phase attacks; not balance/survival evidence. All input policies are synthetic, not a browser playtest or manual acceptance.',geometry:{hook:D.mobs.find(m=>m.id==='hookclaw').hook,chain:D.mobs.find(m=>m.id==='chainwarden').swing,cauldron:D.cauldron.attacks},rows};
writeFileSync(join(ROOT,'./encounters.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(rows.map(r=>({build:r.build,policy:r.policy,bossKilledAt:r.bossKilledAt,heroDamage:r.heroDamageReceived,end:r.end,phase:Object.keys(r.phases),attacks:r.attacks})),null,2));
