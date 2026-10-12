import { chromium } from '../../../../../../../unavailable.html';
import { WebSocketServer, WebSocket } from './frozen-source/node_modules/ws/wrapper.mjs';
import { writeFileSync } from 'node:fs';
const out=new URL('.',import.meta.url),result={scope:'Built client, localhost; delay is a WS application proxy with FIFO delivery, not real packet loss',errors:[],network:[],modes:[]};
let delay=0,jitter=0;
const relay=new WebSocketServer({host:'127.0.0.1',port:5397});
const relaySockets=[];
relay.on('connection',down=>{
  const up=new WebSocket('ws://127.0.0.1:5377/ws',{headers:{Origin:'http://127.0.0.1:5377','X-Real-IP':'[REDACTED]'}});relaySockets.push(down,up);
  let upDue=0,downDue=0;const pending=[];
  function forward(to,data,binary,direction){const now=performance.now(),d=Math.max(0,delay+(Math.random()*2-1)*jitter),at=Math.max(now+d,direction==='up'?upDue:downDue);if(direction==='up')upDue=at;else downDue=at;setTimeout(()=>{if(to.readyState===WebSocket.OPEN)to.send(data,{binary});},at-now);}
  down.on('message',(data,binary)=>{if(up.readyState!==WebSocket.OPEN)pending.push([data,binary]);else forward(up,data,binary,'up');});
  up.on('open',()=>{for(const [data,binary]of pending)forward(up,data,binary,'up');pending.length=0;});
  up.on('message',(data,binary)=>forward(down,data,binary,'down'));
  down.on('close',()=>up.close());up.on('close',()=>{if(down.readyState===WebSocket.OPEN)down.close();});
  up.on('error',e=>result.errors.push(String(e)));down.on('error',e=>result.errors.push(String(e)));
});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>result.errors.push(String(e)));
  await page.addInitScript(()=>{const Original=WebSocket;window.WebSocket=class extends Original{constructor(url,...args){const u=new URL(url,location.href);if(u.pathname==='/ws')u.port='5397';super(u.href,...args);}};});
  await page.goto('http://127.0.0.1:5377/?debug',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__opus,null,{timeout:60000});
  await page.locator('.join .name').fill('NetInspector');await page.getByRole('button',{name:'Играть',exact:true}).click();
  await page.waitForFunction(()=>window.__opus.state().screen==='game'&&window.__opus.state().hasSelf);await page.waitForTimeout(2000);
  for(const setting of [{name:'direct',oneWayMs:0,jitterMs:0},{name:'80ms-RTT',oneWayMs:40,jitterMs:0},{name:'80ms-RTT-jitter20',oneWayMs:40,jitterMs:20}]){
    delay=setting.oneWayMs;jitter=setting.jitterMs;await page.waitForTimeout(2000);
    await page.keyboard.down('w');await page.waitForTimeout(350);await page.keyboard.up('w');
    const samples=[];for(let i=0;i<30;i++){samples.push(await page.evaluate(()=>({at:performance.now(),state:window.__opus.state(),buffered:window.__opus.net.buffered})));await page.waitForTimeout(100);}
    result.network.push({...setting,samples,health:await(await fetch('http://127.0.0.1:5377/health')).json()});
  }
  delay=0;jitter=0;await page.waitForTimeout(1000);
  for(const kind of ['paintball','fort','skill','hide','race','fight']){
    const at=performance.now();await page.evaluate(kind=>window.__opus.send({t:'chat',text:`/go ${kind}`}),kind);
    await page.waitForFunction(kind=>window.__opus.state().scene===kind&&window.__opus.state().transition.phase==='idle',kind,{timeout:60000});
    await page.waitForTimeout(800);const state=await page.evaluate(()=>({state:window.__opus.state(),info:window.__opus.info(),programs:window.__opus.app.renderer.gl.info.programs.length}));
    result.modes.push({kind,readyMs:performance.now()-at,...state});
    if(kind==='fort')await page.screenshot({path:new URL('./fort-smoke.png',out).pathname});
    await page.evaluate(()=>window.__opus.send({t:'leave'}));await page.waitForFunction(()=>window.__opus.state().scene==='lobby'&&window.__opus.state().transition.phase==='idle',null,{timeout:60000});
  }
  result.identity={url:page.url(),title:await page.title(),viewport:{width:1440,height:900},bodyNotBlank:(await page.locator('body').innerText()).length>50,frameworkOverlay:await page.locator('vite-error-overlay').count()};
  result.completedAt=new Date().toISOString();writeFileSync(new URL('./mode-network-smoke.json',out),JSON.stringify(result,null,2));
  console.log(JSON.stringify({identity:result.identity,modes:result.modes.map(m=>({kind:m.kind,readyMs:m.readyMs,scene:m.state.scene,calls:m.info.calls})),network:result.network.map(n=>({name:n.name,first:n.samples[0].state,last:n.samples.at(-1).state})),errors:result.errors}));
}catch(e){result.fatal=String(e.stack??e);writeFileSync(new URL('./mode-network-smoke.json',out),JSON.stringify(result,null,2));console.error(e);process.exitCode=1;}
finally{await browser.close();for(const ws of relaySockets)ws.terminate();await new Promise(resolve=>relay.close(resolve));}
