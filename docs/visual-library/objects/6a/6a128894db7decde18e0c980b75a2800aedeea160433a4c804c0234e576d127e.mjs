import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const archive=path.join(root,'archive/ten-materials-approved-before-11-15-2026-10-12');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const errors=[];const featureChecks=[];
const protectedHashes=JSON.parse(fs.readFileSync(path.join(archive,'PRESERVED.json'),'utf8'));
for(const [f,hash]of Object.entries(protectedHashes))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')!==hash)errors.push('Changed protected source '+f);
function boot(base,extra){const elements=new Map();function el(id){if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',className:'',style:{setProperty(){}},classList:{toggle(){},add(){},remove(){}},clientWidth:1440,clientHeight:900,addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null,setAttribute(){},append(){},focus(){},remove(){}});return elements.get(id);}
 const document={querySelector:el,querySelectorAll:()=>[],addEventListener(){},createElement:()=>el('temp'),body:el('body')};
 const manifest=JSON.parse(read('./assets.json'));const timers=[];const c={document,window:{},console,setTimeout:(fn,ms)=>(timers.push({fn,ms}),timers.length),clearTimeout(){},setInterval:()=>0,clearInterval(){},performance:{now:()=>0},ResizeObserver:class{observe(){}},ASSETS:Object.fromEntries(Object.keys(manifest).map(k=>[k,'asset:'+k])),AVATAR:read('../assets/avatar.svg'),BACKGROUND_NOTE:''};vm.createContext(c);
 const files=extra?['./data.js','./next-data.js','./extra-data.js','./next.js','./extra.js','./app.js','./extra-boot.js']:['./data.js','./next-data.js','./next.js','./app.js'];vm.runInContext(files.map(f=>fs.readFileSync(path.join(base,'source',f),'utf8')).join('\n'),c);return {c,el,timers};
}
const before=boot(archive,false),after=boot(root,true);let preservationComparisons=0;
const oldIds=['clean','enamel','lantern','ribbon','ledger','passport','edge','chronicle','deck','instrument'];
for(const d of oldIds.concat(['pins','bearing','jelly','umbra','mosaic']))for(const scenario of oldIds.includes(d)?['plaza','fort','busy','dungeon']:['dungeon'])for(const load of ['0','1','3']){for(const x of [before,after]){Object.assign(x.c.window.hudPrototype.state,{direction:d,scenario,load});x.c.window.hudPrototype.render();}const norm=h=>h.replace(/portrait-\d+-/g,'portrait-N-');if(norm(before.el('#hud').innerHTML)!==norm(after.el('#hud').innerHTML))errors.push('Preservation mismatch '+d+'/'+scenario+'/'+load);preservationComparisons++;}
function feature(name,body){try{vm.runInContext(body,after.c);featureChecks.push(name);}catch(e){errors.push(name+': '+e.message);}}
feature('Pins folds and restores context',"state.direction='pins';state.scenario='plaza';reset();act('ex-quiet');if(!exState.quiet||!document.querySelector('#hud').innerHTML.includes('ex-context is-quiet'))throw Error('not folded');act('ex-quiet');if(exState.quiet)throw Error('not restored')");
feature('Context help can be pinned',"state.direction='bearing';reset();act('ex-help');act('ex-help-pin');if(!exState.help||!exState.helpPinned||!document.querySelector('#hud').innerHTML.includes('ex-context-help'))throw Error('help missing');act('ex-help');if(exState.help||exState.helpPinned)throw Error('help did not close')");
feature('Jelly damage retains previous HP',"state.direction='jelly';state.scenario='fort';reset();act('hit');if(state.hp!==54||exState.ghostHp!==72||!document.querySelector('#hud').innerHTML.includes('−18'))throw Error('ghost lost');act('heal');if(state.hp!==72||exState.ghostHp!==null)throw Error('heal did not clear ghost')");
feature('Jelly ready signal toggles',"state.direction='jelly';reset();act('ex-ready');if(!exState.ready||!document.querySelector('#hud').innerHTML.includes('Готовы 4 / 7'))throw Error('not ready');act('ex-ready');if(exState.ready)throw Error('not toggled off')");
feature('Umbra rewards expand under critical event',"state.direction='umbra';state.scenario='busy';reset();act('ex-events');act('priority');if(!exState.eventsOpen||!document.querySelector('#hud').innerHTML.includes('Связь пропала')||!document.querySelector('#hud').innerHTML.includes('ex-notices'))throw Error('priority/stack missing');act('ex-events');if(exState.eventsOpen||!document.querySelector('#hud').innerHTML.includes('Связь пропала'))throw Error('critical folded')");
feature('Mosaic moves one context toward action',"state.direction='mosaic';state.scenario='plaza';reset();act('ex-pin');if(!exState.pinContext||!document.querySelector('#hud').innerHTML.includes('ex-mosaic-action\"><div class=\"ex-context'))throw Error('context not moved')");
feature('Mosaic HP detail is reversible',"state.direction='mosaic';state.scenario='fort';reset();act('ex-hp-detail');if(!document.querySelector('#hud').innerHTML.includes('30 · осторожно'))throw Error('detail missing');act('ex-hp-detail');if(exState.hpDetail)throw Error('detail stuck')");
const require=createRequire(import.meta.url);let cssRules=0;try{const postcss=require(require.resolve('postcss',{paths:['[LOCAL_PATH]']}));postcss.parse(read('./extra.css')).walkRules(()=>cssRules++);}catch(e){errors.push('CSS: '+e.message);}
const result={ok:errors.length===0,node:process.version,protectedSourceFiles:Object.keys(protectedHashes).length,preservationComparisons,featureChecks,cssRules,errors,verificationKind:'structural-and-state-only'};fs.writeFileSync(path.join(root,'./extra-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(errors.length)process.exitCode=1;
