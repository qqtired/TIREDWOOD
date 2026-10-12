async (page) => {
  // Prepared for the root-owned browser after heavy release. Controls write only
  // the local prototype; APIs below are read-only observations, never drivers.
  const results=[],expect=(ok,message)=>{if(!ok)throw new Error(message);};
  await page.waitForFunction(()=>!!window.fortressV2Lab);
  await page.locator('#event-canvas').scrollIntoViewIfNeeded();
  await page.locator('#event-humans').selectOption('4');
  await page.locator('#calc-wave').selectOption('98');
  const state=()=>page.evaluate(()=>window.fortressV2Lab.state);
  const seek=async time=>{await page.locator('#event-time').evaluate((node,t)=>{node.value=String(t);node.dispatchEvent(new Event('input',{bubbles:true}));},time);return state();};
  const scenario=async id=>{await page.locator(`#scenario-tabs [data-scenario="${id}"]`).click();await page.locator('#run-reset').click();if(await page.evaluate(()=>window.fortressV2Native?.ready)){if(id==='pump')await page.waitForFunction(()=>window.fortressV2Lab.pumpActorState.ready);if(id==='spread')await page.waitForFunction(()=>window.fortressV2Lab.canopyActorState.ready);}};
  const choose=async id=>{await page.locator(`#choice-buttons [data-action="${id}"]`).click();await page.locator('#run-play').click();};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const record=(id,s)=>results.push({id,outcome:s.outcome,physical:s.physical,cost:s.cost});

  await scenario('gate');await seek(7);await choose('drop');expect((await seek(11)).trapped===6,'Gate early trap');const gated=await seek(24);expect(gated.passed===1&&gated.cost.grenadesSpent===2,'Gate finite grenades / surviving brute');record('gate',gated);
  await scenario('gate');const passed=await seek(23);await choose('abort');const closed=await seek(24);expect(closed.passed===passed.passed&&closed.gateHp===passed.gateHp&&closed.outcome==='failure','Late gate close rewrote history');

  await scenario('tower');await seek(6);await choose('wheel');const stopped=await seek(28);expect(stopped.boarded===0&&stopped.towerBroken,'Tower early stop');record('tower',stopped);
  await scenario('tower');const boarded=await seek(25);await choose('wheel');const lateTower=await seek(28);expect(lateTower.boarded===boarded.boarded&&lateTower.outcome==='failure'&&!lateTower.resultNote.includes('высадки нет'),'Late tower false success');

  await scenario('pump');await seek(5);await choose('redirect');const redirected=await seek(11);expect(!redirected.film&&redirected.jamRadius>0&&redirected.enemySpeed<2.4,'Pump reverse physics');record('pump',redirected);
  await scenario('pump');const unwashed=await seek(11);expect(unwashed.film&&unwashed.jamRadius===0,'Pump ignore not distinct');

  await scenario('battery');const impacted=await seek(23);await choose('lock');const broken=await seek(28);expect(broken.gateHp===impacted.gateHp&&broken.turretHp===impacted.turretHp&&broken.outcome==='failure','Battery historical rollback');record('battery',broken);
  await scenario('battery');await seek(9.5);await choose('lock');expect((await seek(11)).history.some(e=>e.type==='impact'),'Destroyed source removed in-flight shell');

  await scenario('stores');await seek(7);await choose('water');const saved=await seek(30);expect(saved.savedCrates===3,'Stores deadline completion');record('stores',saved);
  await scenario('stores');await seek(7.1);await choose('water');expect((await seek(30)).savedCrates===0,'Late water recovered burned stock');
  await scenario('stores');await seek(20);await choose('salvage_repair');expect((await seek(30)).savedCrates===0,'Salvage recovered burned stock');

  await scenario('forge');await seek(1);await choose('kit');expect((await seek(4.9)).cost.goldSpent===0,'Forge charges incomplete work');expect((await seek(5)).cost.goldSpent===432,'Forge wave98 price');expect((await seek(10)).forgeConsumed==='kit','Forge item never consumed');const forged=await seek(22);expect(forged.history.some(e=>e.type==='repair')&&forged.forgeItem===null,'Forge next threat missing');record('forge',forged);

  await scenario('anchor');await seek(6);await choose('hull');const landed=await seek(28);expect(landed.boatSunk&&landed.boarded===1,'Anchor hull forward crew');record('anchor',landed);
  await scenario('anchor');await seek(6);await choose('anchor');expect((await seek(28)).boarded===0,'Anchor cut distinct outcome');

  await scenario('spread');const baseline=await seek(18);await scenario('spread');await seek(5);await choose('canopy');const folded=await seek(18);expect(same(folded.units.slice(4),baseline.units.slice(4)),'Canopy modified both groups');if(await page.evaluate(()=>window.fortressV2Native?.ready)){const native=await page.evaluate(()=>window.fortressV2Lab.canopyActorState);expect(native.ready&&native.actors.length===2&&native.actors[0].disabled&&native.actors[0].alive&&!native.actors[0].coverage&&native.actors[1].coverage,'Native living cover break state');}
  await scenario('spread');await seek(5);await choose('trap');const trapped=await seek(22);expect(trapped.trapped===4&&trapped.grateY<1&&trapped.cost.grateChargesSpent===1,'Spread physical trap');expect(trapped.units.filter(u=>u.speed===0).every(u=>Math.abs(u.z+23)<1e-8),'Trap does not stop at its plane');record('spread',trapped);expect((await seek(32)).trapped===0,'Trap does not release');

  // Scrub/replay must preserve the command journal; reset must erase it.
  for(const [id,time,action,end]of [['gate',7,'drop',24],['tower',6,'wheel',28],['pump',5,'redirect',24],['battery',7,'lock',28],['stores',7,'water',30],['forge',1,'kit',22],['anchor',6,'hull',28],['spread',5,'canopy',32]]){
    await scenario(id);await seek(time);await choose(action);const after=await seek(end);const before=await seek(0);expect(before.choice===null&&before.cost.goldSpent===0,'Future command leaked into past '+id);const replay=await seek(end);expect(same(after.physical,replay.physical)&&same(after.history,replay.history),'Scrub replay mismatch '+id);await page.locator('#run-reset').click();const reset=await state();expect(reset.t===0&&reset.choice===null,'Reset failure '+id);
  }
  await scenario('gate');await page.locator('#run-play').click();await page.waitForTimeout(150);await page.locator('#run-play').click();const pauseA=(await state()).t;await page.waitForTimeout(150);const pauseB=(await state()).t;expect(pauseA>0&&pauseA===pauseB,'Real play/pause controls');
  await page.locator('#run-step').click();expect(Math.abs((await state()).t-(pauseB+1))<1e-8,'Real step control');
  await page.locator('#event-humans').selectOption('1');await page.locator('#scenario-tabs [data-scenario="spread"]').click();expect((await state()).groupCount===1,'Solo group count');await page.locator('#event-humans').selectOption('4');expect((await state()).groupCount===2,'Four defenders group count');
  return {events:results,controls:'PASS',lateFailures:'PASS',scrubReplay:'PASS',reset:'PASS',pause:'PASS',n1n4:'PASS',nativeModelsAwaitSeparateVisualReview:true,notPlaytest:true};
}
