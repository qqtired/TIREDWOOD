import { chromium } from '../../../../unavailable.html';
import WebSocket from './frozen-source/node_modules/ws/wrapper.mjs';
import { PROTOCOL_VERSION } from './frozen-source/shared/constants.ts';
import { encodeInputs } from './frozen-source/shared/protocol.ts';
import { makeInput } from './frozen-source/shared/sim.ts';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const out = new URL('.', import.meta.url), url = 'http://127.0.0.1:5377/?debug';
const results = { createdAt: new Date().toISOString(), url, hardware: 'Apple M1 Pro / 16 GB', browserPlugin: 'not available', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-frame-rate-limit'], runs: [], errors: [], peers: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: results.args });
const peers = [];
const save = () => writeFileSync(new URL('./game-measurements.json', out), JSON.stringify(results, null, 2));
const quantile = (xs,q) => { const a=xs.filter(Number.isFinite).sort((a,b)=>a-b); return a.length?a[Math.min(a.length-1,Math.floor(a.length*q))]:null; };
const summarize = run => {
  const s=run.samples, d=s.slice(1).map(x=>x.at).map((x,i)=>x-s[i].at), elapsed=s.length>1?s.at(-1).at-s[0].at:0;
  return { name:run.name, sampleCount:s.length, fps: elapsed>0?(s.length-1)*1000/elapsed:0, frameMedianMs:quantile(d,.5), frameP95Ms:quantile(d,.95), frameP99Ms:quantile(d,.99), cpuMedianMs:quantile(s.map(x=>x.cpu),.5), cpuP95Ms:quantile(s.map(x=>x.cpu),.95), gpuMedianMs:quantile(s.map(x=>x.gpu).filter(x=>x!==null),.5), callsMedian:quantile(s.map(x=>x.calls),.5), trianglesMedian:quantile(s.map(x=>x.triangles),.5), programs:run.end.programs, bytesPerSec: (run.end.ws.bytes-run.start.ws.bytes)*1000/run.durationMs, msgsPerSec: (run.end.ws.messages-run.start.ws.messages)*1000/run.durationMs, renderRatio:run.end.info.ratio, actualPlayers:run.health?.online, scene:run.end.state.scene, graphics:run.end.info.gfx };
};
try {
  const page=await browser.newPage({ viewport:{width:1920,height:1080},deviceScaleFactor:1 });
  const cdp=await page.context().newCDPSession(page);
  page.on('pageerror',e=>results.errors.push(String(e)));
  page.on('console',m=>{ if(m.type()==='error') results.errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__audit={ tasks:[], ws:{bytes:0,messages:0}, collect:false, samples:[] };
    new PerformanceObserver(list=>{for(const e of list.getEntries())window.__audit.tasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
    const Original=WebSocket;
    window.WebSocket=class extends Original{constructor(...args){super(...args);this.addEventListener('message',e=>{window.__audit.ws.messages++;window.__audit.ws.bytes+=typeof e.data==='string'?new TextEncoder().encode(e.data).length:e.data.byteLength??e.data.size??0;});}};
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__opus,null,{timeout:60000});
  results.browser=browser.version();
  results.startup=await page.evaluate(()=>({tasks:window.__audit.tasks, readyMs:performance.now(), navigation:performance.getEntriesByType('navigation')[0].toJSON()}));
  await page.evaluate(()=>{const a=window.__opus.app;Object.assign(a.settings,{quality:'high',custom:false,showStats:false});a.applySettings();});
  await page.locator('.join .name').fill('Tester7');
  await page.getByRole('button',{name:'Играть',exact:true}).click();
  await page.waitForFunction(()=>window.__opus.state().screen==='game'&&window.__opus.state().hasSelf,null,{timeout:20000});
  await page.waitForTimeout(2000);
  results.environment=await page.evaluate(()=>{const a=window.__opus.app,g=a.renderer.gl.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return{gl:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),gpuTimer:!!g.getExtension('EXT_disjoint_timer_query_webgl2'),visibility:document.visibilityState,viewport:[innerWidth,innerHeight,devicePixelRatio],initial:window.__opus.state(),settings:a.settings};});
  await page.evaluate(()=>{
    const r=window.__opus.app.renderer, original=r.endFrame.bind(r);
    r.endFrame=()=>{original();const a=window.__audit;if(a.collect){const i=r.gl.info.render;a.samples.push({at:performance.now(),cpu:r.cpuMs,gpu:window.__opus.app.settings.showStats?r.gpuMs:null,calls:i.calls,triangles:i.triangles});}};
  });
  const snapshot=()=>page.evaluate(()=>({info:window.__opus.info(),state:window.__opus.state(),programs:window.__opus.app.renderer.gl.info.programs.length,ws:{...window.__audit.ws},visibility:document.visibilityState}));
  async function measure(name, {quality='high', yaw=0, width=1920, height=1080, cpu=1, gpu=false, duration=5000, custom=null}={}) {
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
    await page.setViewportSize({width,height});
    await page.evaluate(({quality,yaw,gpu,custom})=>{const a=window.__opus.app;Object.assign(a.settings,{quality,custom:false,showStats:gpu});if(custom)Object.assign(a.settings,custom,{custom:true});a.applySettings();window.__opus.look(yaw,.05);},{quality,yaw,gpu,custom});
    await page.waitForTimeout(1800);
    const start=await snapshot();
    await page.evaluate(()=>{window.__audit.samples=[];window.__audit.collect=true;});
    const began=performance.now();
    await page.waitForTimeout(duration);
    const durationMs=performance.now()-began;
    const samples=await page.evaluate(()=>{window.__audit.collect=false;return window.__audit.samples;});
    const end=await snapshot(),health=await (await fetch('http://127.0.0.1:5377/health')).json();
    const run={name,settings:{quality,yaw,width,height,cpu,gpu,custom},start,end,samples,durationMs,health};run.summary=summarize(run);results.runs.push(run);save();console.log(JSON.stringify(run.summary));return run;
  }
  const angles=[];
  for(let i=0;i<4;i++)angles.push(await measure(`1080-high-angle-${i}`,{yaw:i*Math.PI/2,duration:4000}));
  const worst=angles.reduce((a,b)=>a.summary.cpuMedianMs>b.summary.cpuMedianMs?a:b).settings.yaw;
  results.worstYaw=worst;
  for(let i=0;i<2;i++)await measure(`1080-high-repeat-${i}`,{yaw:worst});
  await page.screenshot({path:new URL('./plaza-high-1080.png',out).pathname});
  for(let i=0;i<2;i++)await measure(`1080-low-repeat-${i}`,{yaw:worst,quality:'low'});
  for(let i=0;i<2;i++)await measure(`4k-high-repeat-${i}`,{yaw:worst,width:3840,height:2160});
  for(let i=0;i<2;i++)await measure(`cpu4-high-repeat-${i}`,{yaw:worst,cpu:4});
  for(let i=0;i<2;i++)await measure(`cpu4-low-repeat-${i}`,{yaw:worst,cpu:4,quality:'low'});
  await measure('1080-high-gpu-profile',{yaw:worst,gpu:true,duration:6000});
  await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
  await page.waitForTimeout(5000);const profile=await cdp.send('Profiler.stop');
  writeFileSync(new URL('./chrome-cpu-profile.json',out),JSON.stringify(profile));
  const hits=new Map();for(const id of profile.profile.samples??[])hits.set(id,(hits.get(id)??0)+1);
  results.cpuTop=profile.profile.nodes.map(n=>({function:n.callFrame.functionName,url:n.callFrame.url,hitCount:hits.get(n.id)??0})).sort((a,b)=>b.hitCount-a.hitCount).slice(0,20);
  async function addPeer(i){
    const ws=new WebSocket('ws://127.0.0.1:5377/ws',{headers:{Origin:'http://127.0.0.1:5377','X-Real-IP':`10.91.0.${i+1}`}});
    const p={ws,id:i,bytes:0,messages:0,json:0,binary:0,seq:0,epoch:1,errors:[]};peers.push(p);
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('peer hello timeout')),12000);ws.on('error',reject);ws.on('open',()=>ws.send(JSON.stringify({t:'hello',v:PROTOCOL_VERSION,key:randomUUID(),nick:`Load${i+1}`})));ws.on('message',(data,binary)=>{p.bytes+=data.length;p.messages++;if(binary)p.binary++;else{p.json++;const m=JSON.parse(data.toString());if(m.t==='scene')p.epoch=m.epoch;if(m.t==='lobby'){clearTimeout(timeout);resolve();}if(m.t==='error')p.errors.push(m.code);}});});
    p.timer=setInterval(()=>{if(ws.readyState!==WebSocket.OPEN)return;const input=makeInput();input.seq=++p.seq;input.yaw=(i/63)*Math.PI*2;input.buttons=0;ws.send(encodeInputs([input],0,1,p.epoch));},1000/60);
  }
  for(let i=0;i<15;i++)await addPeer(i);
  await measure('16-players-idle-high',{yaw:0,duration:6000});
  for(let i=15;i<63;i++)await addPeer(i);
  await measure('64-players-idle-high',{yaw:0,duration:7000});
  await page.screenshot({path:new URL('./plaza-64-players.png',out).pathname});
  await measure('64-players-idle-low',{yaw:0,quality:'low',duration:6000});
  results.peers=peers.map(({id,bytes,messages,json,binary,errors})=>({id,bytes,messages,json,binary,errors}));
  for(const p of peers){clearInterval(p.timer);p.ws.close(1000,'normal');}
  peers.length=0;
  results.completedAt=new Date().toISOString();save();
} catch(e){results.fatal=String(e.stack??e);save();console.error(e);process.exitCode=1;}
finally{for(const p of peers){clearInterval(p.timer);p.ws.terminate();}await browser.close();}
