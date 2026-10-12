// Только подключение к существующему CDP. Не запускает браузер/сервер и не закрывает чужие вкладки.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../docs/visual-library');
const browser=await chromium.connectOverCDP(process.env.VISUAL_CDP||'http://127.0.0.1:9333');
const context=browser.contexts()[0];const pages=[];const results=[];
const save=path.join(root,'verification');fs.mkdirSync(save,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.glb':'model/gltf-binary','.woff2':'font/woff2'};
try {
  const page=await context.newPage();pages.push(page);await page.setViewportSize({width:1440,height:900});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'domcontentloaded'});
  await page.locator('input[type=search]').fill('ферма');
  results.push({kind:'catalog-file-search',visible:await page.locator('article:visible').count(),errors:[...errors]});
  await page.locator('input[type=search]').fill('');
  await page.getByRole('button',{name:'HUD',exact:true}).click();
  results.push({kind:'catalog-file-filter',visible:await page.locator('article:visible').count()});
  await page.getByRole('button',{name:'Все',exact:true}).click();
  await page.screenshot({path:path.join(save,'catalog-file.png')});
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  results.push({kind:'dev-only-labels',visible:await page.getByText('Нужен Vite / TypeScript',{exact:false}).count()});
  const sample=[manifest.entries.find(e=>e.id==='7c52c5c11d040f'),manifest.entries.find(e=>e.origins.some(o=>o.origin==='workspace/reports/tiredwood-hud-five-directions-2026-10-12/index.html')),manifest.entries.find(e=>e.id==='30c17774a8bf18')].filter(Boolean);
  const images=()=>page.locator('img').evaluateAll(nodes=>({total:nodes.length,loaded:nodes.filter(n=>n.complete&&n.naturalWidth>0).length}));
  for(const entry of sample){errors.length=0;await page.goto(pathToFileURL(path.join(root,entry.path)).href,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(1100);results.push({kind:'document-file-alias',id:entry.id,title:entry.title,path:entry.path,scheme:'file',errors:[...errors],canvases:await page.locator('canvas').count(),images:await images(),body:await page.locator('body').innerText().then(s=>s.slice(0,160)).catch(()=>'' )});await page.screenshot({path:path.join(save,'file-'+entry.id+'.png')});}
  if(process.env.VISUAL_HTTP_BASE){for(const entry of sample){errors.length=0;await page.goto(process.env.VISUAL_HTTP_BASE.replace(/\/$/,'')+'/'+entry.path,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(1000);results.push({kind:'document-existing-http-alias',id:entry.id,path:entry.path,errors:[...errors],canvases:await page.locator('canvas').count(),images:await images()});}}
  fs.writeFileSync(path.join(save,'browser.json'),JSON.stringify({method:'Existing CDP; actual file aliases; optional existing HTTP server; no new server started',results},null,2));
  console.log(JSON.stringify(results.map(({kind,visible,id,errors})=>({kind,visible,id,errors}))));
} finally {for(const page of pages)await page.close().catch(()=>{});}
// Разрывается только соединение этого процесса; browser.close() намеренно не вызывается.
process.exit(0);
