import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../docs/visual-library');
const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const absent=[],outside=[],large=[];let references=0;
for(const f of m.files){const alias=path.join(root,f.path);if(!fs.existsSync(alias)){absent.push(f.path);continue;}const real=fs.realpathSync(alias);if(!real.startsWith(root+'/'))outside.push(f.path);for(const ref of f.refs){references++;if(!fs.existsSync(path.join(root,ref)))absent.push(ref);}}
for(const o of m.objects||[])if(o.bytes>95*1024*1024)large.push({path:o.path,bytes:o.bytes});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const x of html.matchAll(/(?:href|src)="([^"]+)"/g)){if(/^(?:https?:|#|data:)/.test(x[1]))continue;const dest=path.resolve(root,x[1].split(/[?#]/)[0]);if(!fs.existsSync(dest))absent.push(x[1]);}
const report={aliases:m.files.length,references,missingCopiedFiles:[...new Set(absent)],outsideSymlinks:outside,over95MiB:large,sourceMissing:m.missing.length,sourceExternal:m.external.length,redactions:m.redactions,uniqueBytes:m.summary.uniqueBytes,devOnly:m.entries.filter(e=>e.origins.some(o=>/TypeScript|Шаблон/.test(o.runtime))).map(e=>({id:e.id,title:e.title,origins:e.origins.map(o=>o.origin)}))};
fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification/links.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,redactions:report.redactions.length,devOnly:report.devOnly.length}));
if(absent.length||outside.length||large.length)process.exitCode=1;
