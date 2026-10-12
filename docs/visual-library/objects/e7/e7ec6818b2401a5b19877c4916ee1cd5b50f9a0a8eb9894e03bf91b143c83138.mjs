import { chromium } from '../../../../unavailable.html';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const out=new URL('.',import.meta.url), result={headless:true,kind:'diagnostic capture; excluded from clean FPS measurements',errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-frame-rate-limit']});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>result.errors.push(String(e)));
  await page.addInitScript(()=>{window.__inspectTasks=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.__inspectTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});});
  await page.goto('http://127.0.0.1:5377/?debug',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__opus,null,{timeout:60000});
  await page.locator('.join .name').fill('FrameInspector');await page.getByRole('button',{name:'Играть',exact:true}).click();
  await page.waitForFunction(()=>window.__opus.state().screen==='game'&&window.__opus.state().hasSelf);
  await page.evaluate(()=>{const a=window.__opus.app;Object.assign(a.settings,{quality:'high',custom:false,showStats:false});a.applySettings();window.__opus.look(Math.PI,.05);});
  await page.waitForTimeout(2500);
  const snap=()=>page.evaluate(()=>({info:window.__opus.info(),state:window.__opus.state(),programs:window.__opus.app.renderer.gl.info.programs.length,tasks:window.__inspectTasks}));
  result.beforeQuality=await snap();
  result.qualityChangeAt=await page.evaluate(()=>{const t=performance.now(),a=window.__opus.app;a.settings.quality='low';a.applySettings();return t;});
  await page.waitForTimeout(2500);result.afterQuality=await snap();
  await page.evaluate(()=>{const a=window.__opus.app;a.settings.quality='high';a.applySettings();});await page.waitForTimeout(2000);
  result.drawFrame=await page.evaluate(()=>new Promise(resolve=>{
    const app=window.__opus.app, r=app.renderer.gl, owners=new WeakMap(),seen=new WeakSet();
    const scan=(value,label,depth)=>{
      if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
      if(value.isObject3D){if(!value.isScene)owners.set(value,label);return;}
      if(depth<0)return;
      if(value instanceof Map){let n=0;for(const [k,v] of value){if(n++>70)break;scan(v,`${label}/${k}`,depth-1);}return;}
      if(Array.isArray(value)){for(let i=0;i<Math.min(70,value.length);i++)scan(value[i],`${label}/${i}`,depth-1);return;}
      for(const [key,v]of Object.entries(value)){if(['renderer','deps','settings','ui','net','sound','input','camera'].includes(key))continue;scan(v,`${label}/${key}`,depth-1);}
    };
    scan(app.lobby,'lobby',3);
    const owner=obj=>{for(let v=obj;v;v=v.parent){if(owners.has(v))return owners.get(v);if(v.name)return v.name;}return 'scene static / unnamed';};
    const original=r.renderBufferDirect.bind(r),rows=[];let collect=true;
    r.renderBufferDirect=(camera,scene,geometry,material,obj,group)=>{const c=r.info.render.calls,t=r.info.render.triangles;const v=original(camera,scene,geometry,material,obj,group);if(collect&&r.info.render.calls>c)rows.push({owner:owner(obj),object:obj.name||obj.type,material:material.type,calls:r.info.render.calls-c,triangles:r.info.render.triangles-t,instances:obj.isInstancedMesh?obj.count:null});return v;};
    const oldEnd=app.renderer.endFrame.bind(app.renderer);
    app.renderer.endFrame=()=>{oldEnd();if(collect){collect=false;r.renderBufferDirect=original;app.renderer.endFrame=oldEnd;resolve({rows,info:window.__opus.info()});}};
  }));
  const groups={};for(const row of result.drawFrame.rows){const g=groups[row.owner]??={calls:0,triangles:0,materials:{}};g.calls+=row.calls;g.triangles+=row.triangles;g.materials[row.material]=(g.materials[row.material]??0)+row.calls;}
  result.drawGroups=Object.entries(groups).map(([name,v])=>({name,...v})).sort((a,b)=>b.calls-a.calls);
  await page.screenshot({path:new URL('./spector-scene.png',out).pathname});
  await page.addScriptTag({path:new URL('./spector-0.9.33.js',out).pathname});
  const capture=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const spec=new window.SPECTOR.Spector();window.__spector=spec;
    const timeout=setTimeout(()=>reject(Error('Spector capture timeout')),30000);
    spec.onCapture.add(c=>{clearTimeout(timeout);resolve(c);});
    spec.onError.add(e=>{clearTimeout(timeout);reject(Error(String(e)));});
    spec.captureNextFrame(window.__opus.app.renderer.gl.getContext(),true,false);
  }));
  writeFileSync(new URL('spector-full-game.json.gz',out),gzipSync(JSON.stringify(capture)));
  const counts={};for(const c of capture.commands??[]){const n=c.name??c.commandName??'unknown';counts[n]=(counts[n]??0)+1;}
  result.spector={commands:capture.commands?.length,commandCounts:counts,drawCalls:Object.entries(counts).filter(([n])=>/^draw/.test(n)).reduce((a,[,n])=>a+n,0),raw:'spector-full-game.json.gz',capturedAt:new Date().toISOString(),inspectorVersion:'0.9.33'};
  writeFileSync(new URL('./spector-game-summary.json',out),JSON.stringify(result,null,2));
  console.log(JSON.stringify({spector:result.spector,drawGroups:result.drawGroups.slice(0,20),quality:{before:result.beforeQuality.programs,after:result.afterQuality.programs,newLongTasks:result.afterQuality.tasks.filter(x=>x.start>=result.qualityChangeAt)},errors:result.errors}));
}catch(e){result.fatal=String(e.stack??e);writeFileSync(new URL('./spector-game-summary.json',out),JSON.stringify(result,null,2));console.error(e);process.exitCode=1;}
finally{await browser.close();}
