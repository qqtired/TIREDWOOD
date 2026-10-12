// Маленькая проверка сборки и рендеров HTML, не браузерная приёмка.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(dir);
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'./assets.json'),'utf8'));
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',className:'',style:{setProperty(){}},classList:{toggle(){},add(){},remove(){}},clientWidth:1440,clientHeight:900,addEventListener(){},setAttribute(){},append(){},focus(){},remove(){}});return elements.get(id);}
const doc={querySelector:element,querySelectorAll:()=>[],addEventListener(){},createElement:()=>element('temp'),body:element('body')};
const ctx={document:doc,window:{},console,setTimeout:()=>0,clearTimeout(){},ResizeObserver:class{observe(){}},ASSETS:Object.fromEntries(Object.keys(manifest).map(k=>[k,'asset:'+k])),AVATAR:fs.readFileSync(path.join(root,'../assets/avatar.svg'),'utf8'),BACKGROUND_NOTE:''};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(dir,'./data.js'),'utf8')+fs.readFileSync(path.join(dir,'./app.js'),'utf8'),ctx);
let renders=0;const errors=[];
for(const d of ctx.window.hudPrototype.directions)for(const scenario of Object.keys(ctx.window.hudPrototype.scenarios))for(const load of ['0','1','3']){
 Object.assign(ctx.window.hudPrototype.state,{direction:d.id,scenario,load});ctx.window.hudPrototype.render();const html=element('#hud').innerHTML;renders++;
 if(/undefined|NaN/.test(html))errors.push(`${d.id}/${scenario}/${load}: invalid HTML value`);
 const expected=ctx.window.hudPrototype.scenarios[scenario];if(expected.combat&&!html.includes(String(expected.hp)))errors.push(`${d.id}/${scenario}: missing HP`);
 if(!html.includes('1')||!html.includes('250'))errors.push(`${d.id}/${scenario}: missing balance`);
 if((html.match(/class="toast surface/g)||[]).length>3)errors.push(`${d.id}/${scenario}: too many notices`);
}
const html=fs.readFileSync(path.join(root,'../index.html'),'utf8');
if(/\/\*__[A-Z]+__\*\//.test(html))errors.push('Unresolved build placeholder');
if(/(?:src|href)=["'](?:https?:|\/\/)/.test(html))errors.push('External resource URL');
for(const file of Object.values(manifest))if(!fs.existsSync(path.join(root,file)))errors.push('Missing asset '+file);
for(const file of ['./app.js','./data.js'])new vm.Script(fs.readFileSync(path.join(dir,file),'utf8'));
const result={ok:errors.length===0,renders,offlineBytes:fs.statSync(path.join(root,'../index.html')).size,inlineAssets:Object.keys(manifest).length,errors,browserVerified:false};
fs.writeFileSync(path.join(root,'../structure-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(errors.length)process.exitCode=1;
