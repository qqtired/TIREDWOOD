import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { rolldown } from 'rolldown';
const require=createRequire(import.meta.url);
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.argv[2]??'/Users/tired/Desktop/tired.solutions/reports/tiredwood-fortress-expansion-2026-10-11/v3';
const bundle=await rolldown({input:path.join(repo,'client/fort/approved/stand.ts'),plugins:[{name:'embed-approved-assets',async load(id){if(id.endsWith('.css'))return {code:'export {};',moduleType:'js'};if(!id.endsWith('/approved/renderer.ts'))return;let code=await fs.readFile(id,'utf8');for(const match of [...code.matchAll(/new URL\('([^']+\.glb)', import\.meta\.url\)\.href/g)]){const data=await fs.readFile(path.resolve(path.dirname(id),match[1]));code=code.replace(match[0],JSON.stringify('data:model/gltf-binary;base64,'+data.toString('base64')));}return{code};}}]});
const result=await bundle.generate({format:'es',minify:true});await bundle.close();const js=result.output.find(x=>x.type==='chunk').code;
const styles=[...['400','600','800'].map(w=>require.resolve('@fontsource/rubik/'+w+'.css')),require.resolve('@fontsource/rubik-mono-one/cyrillic-400.css'),...['client/ui/kit/tokens.css','client/ui/kit/kit.css','client/fort/approved/stand.css'].map(x=>path.join(repo,x))];
let css='';for(const file of styles){let c=await fs.readFile(file,'utf8');for(const m of [...c.matchAll(/url\(['"]?([^'"()]+)['"]?\)/g)]){if(m[1].startsWith('data:'))continue;const font=await fs.readFile(path.resolve(path.dirname(file),m[1]));c=c.replace(m[0],'url(data:font/woff2;base64,'+font.toString('base64')+')');}css+='\n'+c;}
let html=await fs.readFile(path.join(repo,'tools/fortress/index.html'),'utf8');
html=html.replace('</head>','<style>'+css+'</style></head>').replace('<script type="module" src="/client/fort/approved/stand.ts"></script>','<script type="module">'+js.replaceAll('</script','<\\/script')+'</script>');
await fs.mkdir(out,{recursive:true});const file=path.join(out,'index.html');
try{await fs.access(file);const archive=path.join(out,'archive',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(archive,{recursive:true});await fs.copyFile(file,path.join(archive,'index.html'));}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile(file,html);console.log(JSON.stringify({file,bytes:Buffer.byteLength(html),embedded:true}));
