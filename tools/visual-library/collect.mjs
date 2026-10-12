#!/usr/bin/env node
// Собирает только библиотеку; исходники, Git и игровые сборки не меняет.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspace = process.env.TIREDWOOD_VISUAL_SOURCE || (fs.existsSync(path.resolve(repo,'../reports')) ? path.resolve(repo,'..') : path.resolve(repo,'../tired.solutions'));
const out = path.join(repo, 'docs/visual-library');
const includeR8 = process.argv.includes('--include-r8');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const slash = s => s.split(path.sep).join('/');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const textExt = new Set(['.html','.htm','.js','.mjs','.cjs','.ts','.tsx','.css','.json','.gltf','.svg','.md','.txt']);
const assetExt = /\.(?:html?|m?js|cjs|tsx?|css|json|gltf|glb|bin|png|jpe?g|webp|gif|svg|avif|ico|woff2?|ttf|otf|mp[34]|webm|wav|ogg|m4a|pdf|md|txt)(?:[?#].*)?$/i;
const skipDirs = /(?:^|\/)(?:\.git|node_modules|\.playwright-cli|visual-library)(?:\/|$)/;
const trees = process.env.TIREDWOOD_VISUAL_ROOTS ? JSON.parse(process.env.TIREDWOOD_VISUAL_ROOTS) : execFileSync('git',['worktree','list','--porcelain'],{cwd:repo,encoding:'utf8'}).split('\n').filter(x=>x.startsWith('worktree ')).map(x=>x.slice(9));
const roots = [workspace, ...trees.filter(x=>!x.startsWith(workspace+'/'))];
const namespaces = new Map(roots.map((r,i)=>[r,i ? 'worktrees/'+path.basename(r) : 'workspace']));
const origin = p => {
  const r = roots.filter(r=>p===r||p.startsWith(r+'/')).sort((a,b)=>b.length-a.length)[0];
  return r ? namespaces.get(r)+'/'+slash(path.relative(r,p)) : 'outside/'+path.basename(p);
};
const destination = p => path.join(out,'files',origin(p));
const allowed = p => roots.some(r=>p.startsWith(r+'/')) && !/(?:^|\/)ssh\//.test(slash(p)) && !/(?:^|\/)(?:\.env|lab-key|smoke-token|credentials)(?:\/|$)/.test(slash(p)) && !/\/(?:game-opus[^/]*|frozen-source)\/data\/|\/backups\/.*\/data\//.test(slash(p));
const exclusions = [], pending = [], findings = [], missing = [], external = [];
const documents = [], nodes = new Map(), queue = [], redirects = new Map();
const objects = new Map();
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'.gitattributes'),'* -text\n');
function persist(output,buffer) {
  const digest=hash(buffer), object='objects/'+digest.slice(0,2)+'/'+digest+path.extname(output);
  const file=path.join(out,object), alias=path.join(out,output);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if(!fs.existsSync(file))fs.writeFileSync(file,buffer);
  fs.mkdirSync(path.dirname(alias),{recursive:true});
  const target=relative(output,object);
  if(fs.existsSync(alias)||(()=>{try{return fs.lstatSync(alias).isSymbolicLink();}catch{return false;}})()) {
    if(fs.lstatSync(alias).isSymbolicLink()&&fs.readlinkSync(alias)===target){objects.set(object,buffer.length);return object;}
    // Меняется только созданная сборщиком копия. Оригиналы вне библиотеки не затрагиваются.
    fs.unlinkSync(alias);
  }
  fs.symlinkSync(target,alias);objects.set(object,buffer.length);return object;
}

function exclusion(p) {
  const rel = origin(p);
  if (skipDirs.test(rel)) return 'Зависимости пакетов, служебный кэш или сама библиотека';
  if (/\/(?:site|server-check|tech\/server)\//.test(rel) || /\/tech\/demo-redirect\.html$/.test(rel)) return 'Другой проект или служебная страница размещения, не материал TIREDWOOD';
  if (/\/dist\/index\.html$/.test(rel)) return 'Собранный вход игры, не самостоятельный документ';
  if (path.basename(p)==='index.html' && fs.existsSync(path.join(path.dirname(p),'package.json')) && fs.existsSync(path.join(path.dirname(p),'client'))) return 'Системный вход игры';
  return null;
}
function enqueue(p, via=null) {
  p=path.resolve(p);
  if (!allowed(p) || !fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  if(!assetExt.test(p)&&!/^LICENSE(?:\.|$)/i.test(path.basename(p))&&!/\.(?:wgsl|glsl|vert|frag)$/.test(p))return null;
  if(/\/backups\//.test(p)&&/\/(?:state|profiles|secrets|tokens)\.json$/i.test(p))return null;
  if (/\.(?:blend\d*|pyc|zip|tar|gz|dmg|exe|sqlite|db|log)$/i.test(p)) return null;
  if (!includeR8 && /\/evolutions-r8\//.test(p)) { pending.push({origin:origin(p),reason:'Ожидает подтверждения freeze r8'}); return null; }
  if (!nodes.has(p)) { const n={source:p,origin:origin(p),output:slash(path.relative(out,destination(p))),via,refs:[],issues:[],external:[]}; nodes.set(p,n); queue.push(n); }
  return nodes.get(p);
}
for (const root of roots) {
  let files=[];
  try { files=execFileSync('rg',['--files','--hidden','--no-ignore','-g','*.html','-g','!**/.git/**','-g','!**/node_modules/**','-g','!**/.playwright-cli/**','-g','!**/visual-library/**',root],{encoding:'utf8',maxBuffer:32*1024*1024}).trim().split('\n').filter(Boolean); } catch {}
  for (const p of files) {
    const why=exclusion(p);
    if (why) { exclusions.push({origin:origin(p),reason:why}); continue; }
    const n=enqueue(p); if (n) documents.push(n);
  }
}

function projectRoot(p) {
  let d=path.dirname(p);
  while (allowed(d+'/x')) { if(fs.existsSync(path.join(d,'package.json')) && fs.existsSync(path.join(d,'client'))) return d; const up=path.dirname(d); if(up===d)break; d=up; }
  const r=roots.filter(r=>p.startsWith(r+'/')).sort((a,b)=>b.length-a.length)[0];
  return r===workspace ? path.join(workspace,'game-opus') : r;
}
function existing(p) {
  if (!fs.existsSync(p)) return null;
  if (fs.statSync(p).isDirectory()) { for(const f of ['index.html','index.js','index.ts']) if(fs.existsSync(path.join(p,f)))return path.join(p,f); return null; }
  return p;
}
function resolveLocal(raw, source) {
  let clean=raw.replace(/&amp;/g,'&').split(/[?#]/)[0];
  try { clean=decodeURIComponent(clean); } catch {}
  if(clean.startsWith('file://')) { try{return existing(fileURLToPath(clean));}catch{return null;} }
  if(clean.startsWith(workspace+'/') || roots.some(r=>clean.startsWith(r+'/')))return existing(clean);
  if(clean.startsWith('/')) {
    const candidates=[path.join(projectRoot(source),clean),path.join(projectRoot(source),'public',clean),path.join(workspace,'reports',clean),path.join(workspace,clean),path.join(path.dirname(source),clean)];
    if(clean.startsWith('/three/'))candidates.unshift(path.join(projectRoot(source),'node_modules',clean));
    if(clean.startsWith('/fitting-room/'))candidates.unshift(path.join(projectRoot(source),'dist-fitting-room',clean.slice('/fitting-room/'.length)));
    if(clean.startsWith('/tech/tiredwood-lab/'))candidates.unshift(path.join(workspace,'reports/tech-publication-2026-10-07/lab',clean.slice('/tech/tiredwood-lab/'.length)));
    if(clean.startsWith('/tech/')) candidates.unshift(path.join(workspace,'reports',clean.slice(6)));
    return candidates.map(existing).find(Boolean)||null;
  }
  const direct=existing(path.resolve(path.dirname(source),clean)); if(direct)return direct;
  if(/\/source\/|\/archive\//.test(source)){let d=path.dirname(source);for(let i=0;i<5;i++){d=path.dirname(d);const p=existing(path.resolve(d,clean));if(p&&allowed(p))return p;}}
  if(!path.extname(clean) && /^\.{1,2}\//.test(clean)) for(const ext of ['.ts','.js','.mjs']) {const x=existing(path.resolve(path.dirname(source),clean+ext));if(x)return x;}
  return null;
}
function refs(text, ext) {
  const result=new Map();
  const add=(raw,kind='asset')=>{if(!raw||raw.length>2048||/^(?:data:|blob:|#|mailto:|tel:|javascript:)/i.test(raw))return; result.set(raw,kind);};
  for(const m of text.matchAll(/\b(src|href|poster|data-src|data-model|data-glb)\s*=\s*(["'])([^"'<>\r\n]{1,2048})\2/gi)) add(m[3],m[1].toLowerCase()==='href'?'link':'asset');
  for(const m of text.matchAll(/url\(\s*(["']?)([^)"'\r\n]{1,2048})\1\s*\)/gi)) add(m[2].trim());
  for(const m of text.matchAll(/(["'`])([^"'`\r\n]{1,2048})\1/g)) {
    const s=m[2]; if(assetExt.test(s) && !/[<>\n]/.test(s) && (s.includes('/') || /^[\w.-]+\.[a-z0-9]+(?:[?#].*)?$/i.test(s)))add(s);
    if(/^https?:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|threejs\.org)\//.test(s))add(s);
    if(/^(?:\.{1,2}\/|\/client\/|\/assets\/)[\w/.*{}$-]+\/$/.test(s)&&/(?:assets|models|images|textures|fonts|icons|screenshots|previews|renders)\//.test(s))add(s,'directory');
    if(s.includes('*') && /^(?:\.{1,2}\/|\/)/.test(s))add(s,'glob');
  }
  if(ext==='.md')for(const m of text.matchAll(/\]\(([^\s)]+)\)/g))add(m[1],'link');
  return [...result].map(([raw,kind])=>({raw,kind}));
}
function sanitize(text, n) {
  const patterns=[
    ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['api-token',/\b(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{24,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[A-Z0-9]{16})\b/g],
    ['bot-token',/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g],
    ['private-server-url',/\b(?:https?|wss?|ssh):\/\/(?:[^\s"'<>/@]+:[^\s"'<>/@]+@)?(?:(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}(?:\.\d{1,3}){1,2}|[\w.-]+\.(?:internal|local))(?::\d+)?[^\s"'<>]*/gi],
  ];
  for(const [type,re]of patterns)text=text.replace(re,()=>{ findings.push({origin:n.origin,type,action:'Значение скрыто в библиотечной копии; оригинал сохранён'}); n.issues.push('Скрыты чувствительные данные');return '[REDACTED]';});
  text=text.replace(/\b(?:https?|wss?|ssh):\/\/[^\s"'<>/@]+:[^\s"'<>/@]+@[^\s"'<>]+/g,()=>{findings.push({origin:n.origin,type:'url-credentials',action:'Значение скрыто в копии'});n.issues.push('Скрыты чувствительные данные');return '[REDACTED]';});
  text=text.replace(/\b(?:https?|wss?|ssh):\/\/(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?[^\s"'<>]*/g,(value,ip)=>{if(ip==='127.0.0.1'||ip==='0.0.0.0')return value;findings.push({origin:n.origin,type:'server-ip-url',action:'Адрес сервера скрыт в копии'});n.issues.push('Скрыт адрес сервера');return '[REDACTED]';});
  text=text.replace(/(?<![0-9a-f.])(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}(?![0-9a-f.])/gi,value=>{const a=value.split('.').map(Number);if(a.some(n=>n>255)||value==='127.0.0.1'||value==='0.0.0.0'||value==='255.255.255.255')return value;findings.push({origin:n.origin,type:'server-address',action:'Адрес скрыт в копии'});n.issues.push('Скрыт адрес сервера');return '[REDACTED]';});
  return text;
}
const remoteAllowed=new Set(['cdn.jsdelivr.net','unpkg.com','esm.sh','cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com','threejs.org']);
const remoteNodes=new Map();
const remotePrefixes=new Map();
let remoteActive=0;const remoteWaiters=[];
async function downloadPublic(url){const cache=path.join(out,'.cache/remote',hash(url));if(fs.existsSync(cache))return fs.readFileSync(cache);if(remoteActive>=6)await new Promise(resolve=>remoteWaiters.push(resolve));remoteActive++;try{const res=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error('HTTP '+res.status);const bytes=Buffer.from(await res.arrayBuffer());fs.mkdirSync(path.dirname(cache),{recursive:true});fs.writeFileSync(cache,bytes);return bytes;}finally{remoteActive--;remoteWaiters.shift()?.();}}
async function remote(url,via) {
  if(remoteNodes.has(url))return remoteNodes.get(url);
  const u=new URL(url); if(!remoteAllowed.has(u.hostname))return null;
  if(url.endsWith('/')){const n={source:url,origin:'remote/'+u.hostname+u.pathname,output:'vendor/modules/'+hash(url).slice(0,16)+'/',directory:true};remotePrefixes.set(url,n.output);remoteNodes.set(url,n);fs.mkdirSync(path.join(out,n.output),{recursive:true});return n;}
  const foundExt=path.extname(u.pathname);const ext=/^\.(?:m?js|css|json|png|jpe?g|webp|svg|woff2?|ttf|otf|glb|bin)$/.test(foundExt)?foundExt:(u.hostname==='fonts.googleapis.com'?'.css':'.js');
  const prefix=[...remotePrefixes.keys()].filter(p=>url.startsWith(p)).sort((a,b)=>b.length-a.length)[0];
  const dest=prefix?remotePrefixes.get(prefix)+url.slice(prefix.length).split(/[?#]/)[0]:'vendor/'+hash(url).slice(0,16)+ext;
  const n={source:url,origin:'remote/'+u.hostname+u.pathname,output:dest,via,refs:[],issues:[],external:[],remote:true,download:downloadPublic(url).catch(error=>({error}))};remoteNodes.set(url,n);queue.push(n);return n;
}
function remoteRefs(text,ext){if(ext==='.css')return refs(text,ext);const found=[];for(const re of [/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?["']([^"']+)["']/g,/\bimport\s*\(\s*["']([^"']+)["']/g])for(const m of text.matchAll(re))if(m[1].startsWith('.')||m[1].startsWith('/')||m[1].startsWith('https:'))found.push({raw:m[1],kind:'asset'});return found;}
function relative(from,to){let r=slash(path.relative(path.dirname(from),to));return r.startsWith('.')?r:'./'+r;}
for(let i=0;i<queue.length;i++) {
  const n=queue[i];
  let buffer;
  try {
    if(n.remote){buffer=await n.download;if(buffer.error)throw buffer.error;}
    else buffer=fs.readFileSync(n.source);
  } catch(e){n.issues.push('Не удалось получить ресурс');missing.push({origin:n.origin,reference:n.remote?n.source:path.basename(n.source),reason:String(e.message).slice(0,140)});continue;}
  n.bytes=buffer.length;n.sha256=hash(buffer);
  const ext=path.extname(n.remote?n.output:n.source).toLowerCase()||'.js';
  const isText=textExt.has(ext)||n.remote&&ext==='';
  if(isText) {
    let text=sanitize(buffer.toString('utf8'),n); const replacements=new Map();
    let importMap={};if(ext==='.html')for(const map of text.matchAll(/<script[^>]+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/g)){try{Object.assign(importMap,JSON.parse(map[1]).imports||{});}catch{}}
    n.typescript=/\.(?:ts|tsx)$/.test(ext)||/<script[^>]+src=["'][^"']+\.tsx?(?:[?"'])/i.test(text);
    n.module=/type=["']module|\bimport\s*(?:\{|\*|["'])|\bfetch\s*\(|GLTFLoader|import\.meta/.test(text);
    n.template=/__(?:[A-Z][A-Z0-9_]+)__|@@[A-Z_]+[:@]|\{\{[A-Z_]+\}\}/.test(text)||/\.template\.html$|\/p[12]-(?:body|style)\.html$|\/source\/(?:page|report)\.html$/.test(n.source);
    for(const ref of (n.remote?remoteRefs(text,ext):refs(text,ext))) {
      if(/^https?:\/\//i.test(ref.raw)) {
        let u;try{u=new URL(ref.raw);}catch{continue;}
        if(/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(u.hostname)){const p=!n.remote&&resolveLocal(u.pathname,n.source);const target=p&&!exclusion(p)&&enqueue(p,n.origin);if(target){n.refs.push(target.output);replacements.set(ref.raw,relative(n.output,target.output));}else{replacements.set(ref.raw,relative(n.output,'unavailable.html'));n.issues.push('Ссылка требовала локального игрового сервера');}continue;}
        if(remoteAllowed.has(u.hostname) && (ref.kind!=='link'||assetExt.test(ref.raw))) {
          const target=await remote(ref.raw.replace(/&amp;/g,'&'),n.origin);if(target){if(!target.directory)n.refs.push(target.output);replacements.set(ref.raw,relative(n.output,target.output)+(target.directory?'/':''));}
        } else {n.external.push(ref.raw);external.push({origin:n.origin,url:ref.raw,runtime:/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(u.hostname)});}
        continue;
      }
      if(/^[a-z][\w+.-]*:/i.test(ref.raw)&&!ref.raw.startsWith('file:'))continue;
      if(ref.kind==='glob'||ref.kind==='directory'||ref.raw.includes('${')){
        if(n.remote)continue;
        const pattern=ref.raw.startsWith('/')?path.join(projectRoot(n.source),ref.raw):path.resolve(path.dirname(n.source),ref.raw);
        const glob=ref.kind==='directory'?pattern+'**/*':pattern.replace(/\$\{[^}]+\}/g,'*');
        try{for(const p of fs.globSync(glob)){if(assetExt.test(p)&&fs.statSync(p).isFile()){const x=enqueue(p,n.origin);if(x)n.refs.push(x.output);}}}catch{}
        continue;
      }
      let target;
      if(n.remote){try{target=await remote(new URL(ref.raw,n.source).href,n.origin);}catch{}}
      else{
        const mapped=importMap[ref.raw]||Object.keys(importMap).filter(k=>k.endsWith('/')&&ref.raw.startsWith(k)).sort((a,b)=>b.length-a.length).map(k=>importMap[k]+ref.raw.slice(k.length))[0];
        if(mapped&&/^https?:/.test(mapped))target=await remote(mapped,n.origin);
        const p=resolveLocal(ref.raw,n.source);
        if(!target&&p&&allowed(p)){const why=exclusion(p);if(!why||!p.endsWith('.html'))target=enqueue(p,n.origin);}
        if(!target && /^\/(?:api|health|socket|ws)(?:\/|$)/.test(ref.raw)){n.issues.push('Нужен игровой сервер');continue;}
      }
      if(target){n.refs.push(target.output);const suffix=ref.raw.match(/[?#].*$/)?.[0]||'';const rewritten=relative(n.output,target.output)+suffix;replacements.set(ref.raw,rewritten);}
      else if(ref.kind==='asset'||ref.kind==='link') {
        if(!assetExt.test(ref.raw)&&ref.kind!=='link')continue;
        if(/^\/|^\.{1,2}\/|^file:|^[\w-]+\.(?:js|css|json|glb|png|webp|jpg|html)/.test(ref.raw)) {
          n.issues.push('Есть недоступные ссылки или ресурсы');missing.push({origin:n.origin,reference:ref.raw,kind:ref.kind});
          // Явная страница состояния вместо абсолютного пути к чужому компьютеру.
          if(ref.raw.startsWith('file:')||ref.raw.startsWith('/Users/'))replacements.set(ref.raw,relative(n.output,'unavailable.html'));
        }
      }
    }
    if(replacements.size){const re=new RegExp([...replacements.keys()].sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');text=text.replace(re,s=>replacements.get(s));}
    buffer=Buffer.from(text);
    if(n.source.endsWith('.html')){
      n.title=(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||path.basename(n.source)).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,180);
      const preview=text.match(/<img[^>]+src=["']data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)["']/i);
      if(preview){const image=Buffer.from(preview[2],'base64');if(image.length>5000&&image.length<3000000){n.preview='previews/'+hash(image).slice(0,20)+'.'+(preview[1]==='jpeg'?'jpg':preview[1]);persist(n.preview,image);}}
    }
  }
  n.object=persist(n.output,buffer);
  n.copiedBytes=buffer.length;n.issues=[...new Set(n.issues)];n.refs=[...new Set(n.refs)];
  if(i%150===0)console.log(JSON.stringify({processed:i,queued:queue.length}));
}

function tags(n){const t=(n.title+' '+n.origin).toLowerCase(); const cats=[];if(/hud|ui\/|интерфейс|окно|badge|window/.test(t))cats.push('HUD');if(/model|модел|blender|мобы|mob|cosmetic|эволюц|evolution/.test(t))cats.push('Модели');if(/water|plaza|island|набереж|остров|свет|окруж|art-v2|ground/.test(t))cats.push('Окружение');if(/econom|эконом|balance/.test(t))cats.push('Экономика');if(/farm|fish|fort|dungeon|survivor|race|regatta|skill|aqua|pirate|jukebox|hide|режим|подзем|крепост|рыбал|ферм/.test(t))cats.push('Режимы');return cats.length?cats:['История'];}
const failedRemote=queue.filter(n=>n.remote&&n.copiedBytes===undefined);
if(failedRemote.length)throw new Error('Не удалось сохранить обязательные внешние зависимости: '+failedRemote.map(n=>n.origin).join(', '));
function mode(n){const t=(n.title+' '+n.origin).toLowerCase();return /dungeon|survivor|подзем|evolution/.test(t)?'Подземелье':/farm|ферм/.test(t)?'Ферма':/fort|крепост/.test(t)?'Крепость':/fish|рыбал/.test(t)?'Рыбалка':/kart|race|картинг/.test(t)?'Картинг':/regatta|регат/.test(t)?'Регата':/skill|cloudtower|каланча/.test(t)?'Выше облаков':/aqua|аква/.test(t)?'Аквапарк':/plaza|water|island|набереж|остров/.test(t)?'Набережная':'Общее';}
const groups=new Map();
for(const n of documents){if(!n.sha256)continue;const g=groups.get(n.sha256)||{id:n.sha256.slice(0,14),title:n.title,origins:[],categories:tags(n),mode:mode(n),bytes:n.bytes};
  const archived=/(?:\/archive\/|\/backups\/|\/\.claude\/|\/frozen-source\/|before-|pre-release|\/revision2\/|\/r[1-6]-|\/v1\/|\/v2\/)/.test(n.origin);
  const date=n.origin.match(/20\d{2}-\d{2}-\d{2}/)?.[0]||fs.statSync(n.source).mtime.toISOString().slice(0,10);
  const version=[...n.origin.matchAll(/\/(r\d+(?:-[^/]+)?|v\d+|revision[^/]*|review\d+)(?:\/|\.)/g)].at(-1)?.[1]||'снимок';
  g.origins.push({origin:n.origin,path:n.output,date,version,archived,runtime:n.template?'Шаблон / фрагмент сборки':n.typescript?'Нужен Vite / TypeScript':n.module?'Нужен HTTP; интерактивный документ':'HTML-файл; без обязательного сервера',issues:n.issues});groups.set(n.sha256,g);
}
const entries=[...groups.values()].sort((a,b)=>a.title.localeCompare(b.title,'ru'));
for(const e of entries){e.origins.sort((a,b)=>Number(a.archived)-Number(b.archived)||Number(!a.origin.startsWith('workspace/reports/'))-Number(!b.origin.startsWith('workspace/reports/'))||b.date.localeCompare(a.date));e.path=e.origins[0].path;e.date=e.origins[0].date;e.version=e.origins[0].version;e.archived=e.origins.every(x=>x.archived);if(e.archived&&!e.categories.includes('История'))e.categories.push('История');const n=documents.find(n=>n.sha256.slice(0,14)===e.id);e.preview=n?.preview||n?.refs.find(r=>/\.(?:png|webp|jpg|jpeg)$/i.test(r)&&fs.existsSync(path.join(out,r))&&fs.statSync(path.join(out,r)).size>10000)||null;}
const files=queue.filter(n=>n.copiedBytes!==undefined).map(({origin,output,object,sha256,bytes,copiedBytes,refs,issues,remote})=>({origin,path:output,object,sha256,bytes,copiedBytes,refs,issues,...remote?{remote:true}:{}}));
const manifest={schema:1,generated:new Date().toISOString(),sourceRoots:[...namespaces.values()],scope:'Только TIREDWOOD: workspace и действующие worktrees; оригиналы не изменяются',entries,files,objects:[...objects].map(([path,bytes])=>({path,bytes})),exclusions,pending:[...new Map(pending.map(x=>[x.origin,x])).values()],missing,external,redactions:findings,summary:{htmlOrigins:documents.length,uniqueHtml:entries.length,copiedFiles:files.length,copiedBytes:files.reduce((a,n)=>a+n.copiedBytes,0),uniqueBytes:[...objects.values()].reduce((a,n)=>a+n,0),uniqueObjects:objects.size,missing:missing.length,redactions:findings.length},rules:['node_modules и служебные кэши не инвентаризируются; точечные зависимости копируются, если прямо нужны документу','Системные входы игры исключены; самостоятельные страницы в dist сохранены','Неиспользуемые blend, архивы, базы данных и генераторные исходники не копируются','Содержимое хранится один раз по SHA-256; относительные ссылки-алиасы сохраняют исходные имена и контекст импортов','HTTP-документы и TypeScript-стенды не объявляются автономными file:// страницами']};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(out,'unavailable.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><title>Ресурс недоступен</title><h1>Ресурс отсутствует в исходном материале</h1><p>Оригинальная ссылка требовала локальной рабочей среды. Ограничение записано в manifest.json библиотеки.</p><a href="index.html">Вернуться в каталог</a></html>');
const data=JSON.stringify(entries).replace(/</g,'\\u003c');
const styles=`*{box-sizing:border-box}body{margin:0;background:#f3f4ef;color:#17343a;font:16px/1.5 system-ui}main{max-width:1320px;margin:auto;padding:36px 24px}h1{font-size:clamp(30px,5vw,48px);line-height:1.1;margin:12px 0}h2{font-size:19px;margin:8px 0}p{color:#4c6567}.eyebrow,.tag{font-size:12px;font-weight:750;letter-spacing:.05em}.bar{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}input,select,button{font:inherit;color:inherit;border:1px solid #c7d5cc;border-radius:10px;background:white;padding:10px 14px}input[type=search]{flex:1;min-width:240px}button{cursor:pointer}button[aria-pressed=true]{background:#173f3b;color:white}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}article,.notice{background:white;border:1px solid #dbe2dd;border-radius:14px;padding:20px}article{display:flex;flex-direction:column}article p{font-size:14px}a{color:#075e56;font-weight:650}article>a{margin-top:auto;padding-top:12px}details{font-size:13px;margin-top:12px}summary{cursor:pointer}details li{margin:8px 0;overflow-wrap:anywhere}.meta{font-size:13px;color:#607576}.archive{color:#8b5d14}.notice{margin:18px 0;border-left:4px solid #dcaa4d}.count{font-size:14px}footer{margin-top:28px;font-size:14px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #dca34d;outline-offset:3px}[hidden]{display:none!important}@media(max-width:960px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){main{padding:22px 14px}.grid{grid-template-columns:1fr}}`;
const staticCards=entries.map(e=>`<article data-id="${e.id}">${e.preview?`<img src="${esc(e.preview)}" alt="Из материала: ${esc(e.title)}" loading="lazy" style="width:100%;height:170px;object-fit:contain;background:#f3f4ef;border-radius:8px;margin-bottom:12px">`:''}<span class="tag${e.archived?' archive':''}">${esc(e.mode)} · ${e.archived?'Архив':'Материал'}</span><h2>${esc(e.title)}</h2><div class="meta">${esc(e.date)} · ${esc(e.version)} · ${e.origins.length} источников</div><p>${esc(e.origins[0].runtime)}${e.origins.some(o=>o.issues.length)?' · Есть ограничения: см. источники и manifest.':''}</p><a href="${esc(e.path)}" target="_blank" rel="noopener">Открыть материал ↗</a><details><summary>Все версии и происхождение</summary><ul>${e.origins.map(o=>`<li><a href="${esc(o.path)}" target="_blank" rel="noopener">${esc(o.origin)}</a><br>${esc(o.version)} · ${esc(o.date)} · ${o.archived?'архив · ':''}${esc(o.runtime)}${o.issues.length?'<br>'+esc(o.issues.join('; ')):''}</li>`).join('')}</ul></details></article>`).join('');
const runtime=`const entries=JSON.parse(document.getElementById('library-data').textContent);let category='Все';const search=document.querySelector('input[type=search]'),mode=document.querySelector('select'),archive=document.querySelector('#archives');for(const name of [...new Set(entries.map(e=>e.mode))].sort()){const o=document.createElement('option');o.value=o.textContent=name;mode.append(o)}function update(){const q=search.value.toLocaleLowerCase('ru');let count=0;for(const e of entries){const show=(category==='Все'||e.categories.includes(category))&&(!mode.value||e.mode===mode.value)&&(archive.checked||!e.archived)&&(!q||(e.title+' '+e.mode+' '+e.origins.map(o=>o.origin+' '+o.date+' '+o.version).join(' ')).toLocaleLowerCase('ru').includes(q));document.querySelector('[data-id="'+e.id+'"]').hidden=!show;if(show)count++}document.querySelector('#count').textContent='Показано '+count+' из '+entries.length}document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));update()});search.oninput=mode.onchange=archive.onchange=update;update();`;
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TIREDWOOD — библиотека визуальных материалов</title><style>${styles}</style></head><body><main><div class="eyebrow">TIREDWOOD · БИБЛИОТЕКА ПРОЕКТА</div><h1>Все материалы в одном месте</h1><p>Дизайн-документы, модели, интерфейсы, экономика и исторические варианты. Оригинальные названия и пути сохранены; материалы находятся в репозитории.</p><div class="notice"><b>${entries.length} разных HTML · ${documents.length} исходных страниц.</b> Самостоятельные документы открываются файлом. Модульные стенды требуют HTTP, TypeScript — Vite и зависимости проекта. ${manifest.pending.length?'Версия r8 ожидает завершения работы автора. ':''}Ограничения исходных ссылок видны в карточках и <a href="manifest.json">manifest.json</a>. Визуальная приёмка этой библиотеки ещё не проведена.</div><div class="bar"><input type="search" aria-label="Поиск материалов" placeholder="Название, режим, версия или исходный путь"><select aria-label="Режим"><option value="">Все режимы</option></select><label><input id="archives" type="checkbox" checked> Показывать архивные</label></div><div class="bar" aria-label="Категории">${['Все','Режимы','Модели','HUD','Окружение','Экономика','История'].map(x=>`<button data-category="${x}" aria-pressed="${x==='Все'}">${x}</button>`).join('')}</div><p id="count" class="count" aria-live="polite">Показано ${entries.length}</p><section class="grid">${staticCards}</section><footer><a href="manifest.json">Все источники, зависимости и исключения</a> · <a href="README.md">Как открыть и обновить</a><p>Исторический вариант не означает принятое решение или выпущенную игровую функцию.</p></footer></main><script id="library-data" type="application/json">${data}</script><script>${runtime}</script></body></html>`;
fs.writeFileSync(path.join(out,'index.html'),html);
fs.writeFileSync(path.join(out,'README.md'),`# Библиотека TIREDWOOD\n\nОткрыть: index.html. Встроенный каталог работает через file:// и HTTP. Ссылки относительные.\n\nДля модульных HTML: \`node tools/visual-library/serve.mjs\`, затем localhost:5389. TypeScript-стенды требуют установленного окружения Vite проекта; они обозначены отдельно.\n\nОбновление: \`TIREDWOOD_VISUAL_SOURCE=/путь/к/tired.solutions node tools/visual-library/collect.mjs --include-r8\`. Без --include-r8 незавершённая r8 откладывается. Сборщик не меняет оригиналы и не выполняет Git-команды записи.\n\nmanifest.json содержит все исходные имена, категории, версии, хеши, зависимости, внешние адреса, пропуски и причины исключений. Совпадающий HTML сгруппирован; ссылки каждого origin сохранены, потому что одинаковые оболочки могут использовать различающиеся ресурсы.\n\nСекреты и частные серверные URL скрываются в копиях; значения не попадают в журнал. Список обработанных файлов — redactions в manifest.\n\nБиблиотека лежит вне public/dist и не входит в игровые ресурсы Vite. Архивы .blend, базы и прочие неиспользуемые исходники не копируются.\n`);
fs.appendFileSync(path.join(out,'README.md'),'\nФизическое содержимое дедуплицировано в objects/. files/ и previews/ содержат относительные символьные ссылки внутри библиотеки. Git должен сохранять symlink (обычное поведение macOS/Linux); при распаковке архива не разыменовывать их. Служебный кэш сборщика и устаревшие промежуточные копии исключены через .gitignore.\n');
// Белый список финального manifest: промежуточные копии первого прохода не удаляются и не попадут в Git.
const selected=[...files.map(f=>f.path),...objects.keys(),...entries.map(e=>e.preview).filter(Boolean)];
fs.writeFileSync(path.join(out,'.gitignore'),['*','!*/','!.gitignore','!.gitattributes','!index.html','!manifest.json','!README.md','!unavailable.html',...selected.map(p=>'!/'+p),'.cache/'].join('\n')+'\n');
console.log(JSON.stringify({complete:true,...manifest.summary,pending:manifest.pending.length,excluded:exclusions.length}));
