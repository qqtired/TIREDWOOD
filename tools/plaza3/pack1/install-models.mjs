import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const plaza='/Users/tired/Desktop/tired.solutions/concepts_blender/plaza3';const base=path.join(plaza,'v2-2026-10-11-pack1');
const entries=[['fishshowcase','fishshowcase'],['semyon','semyon'],['mole','mole'],['cafe-cards','cafe'],['cafe-cards','cardveranda'],['sunset','sunset'],['lighthouse-arch','lighthouse_arch'],['rotunda','rotunda'],['honor','honor'],['online','online'],['farm-arch','farm_arch'],['kursaal','kursaal']];
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const [topic,id] of entries){const src=path.join(base,topic,`pav_${id}.glb`),dst=path.resolve(`client/assets/plaza3/pav_${id}.glb`);fs.copyFileSync(src,dst);console.log(`${id} ${hash(src)}`);}
for(const topic of new Set(entries.map(e=>e[0]))){
 const dir=path.join(base,topic);const ids=entries.filter(e=>e[0]===topic).map(e=>e[1]);
 const extra=!['fishshowcase','semyon','mole','cafe-cards'].includes(topic);
 const exporter=extra?'build-extra.py':'build.py';
 const manifests=fs.readdirSync(dir).filter(f=>/^manifest.*\.json$/.test(f));
 for(const manifest of manifests){const mf=path.join(dir,manifest),data=JSON.parse(fs.readFileSync(mf,'utf8'));if(data.pavilions)data.pavilions=Object.fromEntries(Object.entries(data.pavilions).filter(([id])=>ids.includes(id)));for(const info of Object.values(data.pavilions??{}))delete info.renders;data.version='v2-2026-10-11-pack1';data.runtime_placement_source='client/lobby/plaza3/pavdata.ts';fs.writeFileSync(mf,JSON.stringify(data,null,2)+'\n');}
 const paths=[...manifests,...fs.readdirSync(path.join(dir,'source')).filter(f=>f.endsWith('.py')).map(f=>`source/${f}`),...ids.map(id=>`pav_${id}.glb`),...fs.readdirSync(dir).filter(f=>f.endsWith('.blend')),...fs.readdirSync(path.join(dir,'source')).filter(f=>f.endsWith('.blend')).map(f=>`source/${f}`)];
 const info={version:'v2-2026-10-11-pack1',topic,created:'2026-10-11',baseline:'plaza3/v1-2026-10-11 immutable',generation:'Copied first-party procedural Blender sources; no third-party images/textures; new geometry uses existing p3 materials.',runtimeVerified:false,files:Object.fromEntries(paths.map(f=>[f,hash(path.join(dir,f))]))};
 fs.writeFileSync(path.join(dir,'PROVENANCE.json'),JSON.stringify(info,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'README.md'),`# ${topic} — PACK1 v2\n\nOriginal v1 and original source package are unchanged. All runtime placements are local to the pavilion root.\n\nPrepare: from game-opus-waterfront-pack1 run \`node tools/plaza3/pack1/prepare-models.mjs\` then (for extra models) \`node tools/plaza3/pack1/prepare-extra-models.mjs\`.\nExport sequentially, only in the shared Blender slot (build.py for first five; build-extra.py for remaining models): \`/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 --python ${base}/${exporter}\`.\nGLB, source .blend, generators and manifest are kept here. PROVENANCE.json records SHA-256.\n\nBlender previews are model evidence; browser/runtime acceptance is performed by the lead after all group work is combined.\n`);
}
