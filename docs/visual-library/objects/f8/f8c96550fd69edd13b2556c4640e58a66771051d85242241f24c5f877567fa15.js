// Run through the group's existing Playwright CLI session after rebuilding v2.
// No browser/server process is created. The output directory must exist first.
async (page) => {
 const url='../index.html';
 const output='[LOCAL_PATH]';
 const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.setViewportSize({width:1440,height:1000});
 const response=await page.goto(url);await page.waitForFunction(()=>window.fortressV2Native?.ready);
 // Match the game's image/connect restrictions for the transport under test.
 // This tightens the local report's policy; no project/server CSP is edited.
 await page.evaluate(()=>{window.textureCspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.textureCspViolations.push({directive:e.effectiveDirective,blocked:e.blockedURI}));const meta=document.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content="img-src 'self' data:; connect-src 'self';";document.head.append(meta);});
 const receipt={url,httpStatus:response.status(),servedCSP:response.headers()['content-security-policy']??null,transportTestCSP:"img-src 'self' data:; connect-src 'self';",models:[]};
 for(const id of ['foreman','jampump','miller']){
  await page.evaluate(id=>window.fortressV2Lab.selectNativeModel(id,'A'),id);
  await page.waitForFunction(id=>window.fortressV2Native.state.id===id&&window.fortressV2Native.state.ready,id);
  await page.locator('#model-clip').selectOption(id+'_attack');
  await page.locator('#event-time').evaluate(input=>{input.value='0.375';input.dispatchEvent(new Event('input',{bubbles:true}));});
  const pairs=[];
  for(const distance of ['near','game','far']){
   await page.locator('#model-camera-'+distance).click();
   const variants=[];
   for(const variant of ['A','B']){
    await page.locator('#model-variant').selectOption(variant);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const proof=await page.evaluate(()=>({state:window.fortressV2Native.state,comparison:window.fortressV2Native.comparison}));
    const path=output+'/'+id+'-'+distance+'-'+variant+'.png';await page.locator('#event-canvas').screenshot({path});variants.push({variant,path,...proof});
   }
   const [a,b]=variants;const maxCameraDelta=Math.max(...a.comparison.camera.map((v,i)=>Math.abs(v-b.comparison.camera[i])),...a.comparison.target.map((v,i)=>Math.abs(v-b.comparison.target[i])));const same=maxCameraDelta<1e-10&&a.comparison.modelUUID===b.comparison.modelUUID&&a.state.clip===b.state.clip&&a.state.clipTime===b.state.clipTime;
   if(!same||a.state.texture.mappedMaterials!==0||!b.state.texture.loaded||b.state.texture.mappedMaterials===0)throw Error('Actual A/B texture invariant failed for '+id+'/'+distance);
   if(a.comparison.meshUUIDs.some((m,i)=>m.mesh!==b.comparison.meshUUIDs[i].mesh||m.geometry!==b.comparison.meshUUIDs[i].geometry||m.materials.some((v,j)=>v.id!==b.comparison.meshUUIDs[i].materials[j].id)))throw Error('A/B replaced mesh/geometry/material');
   if(a.comparison.render.calls!==b.comparison.render.calls||a.comparison.render.triangles!==b.comparison.render.triangles)throw Error('A/B changed actual render calls or triangle count');pairs.push({distance,sameCameraLightModelFrame:true,maxCameraDelta,variants});
  }
  receipt.models.push({id,pairs});
 }
 await page.locator('#model-model').selectOption('canopy');
 receipt.untexturedModelHasNoB=await page.locator('#model-variant-control').isHidden();
 receipt.cspViolations=await page.evaluate(()=>window.textureCspViolations);receipt.errors=errors;
 if(!receipt.untexturedModelHasNoB||errors.length||receipt.cspViolations.length)throw Error(JSON.stringify(receipt));
 return receipt;
}
