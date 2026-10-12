import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {readGLB} from '../models/scripts/verify_glb.mjs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function glb(path){const raw=read(path),length=raw.readUInt32LE(12);return {raw,doc:JSON.parse(raw.subarray(20,20+length)),bin:raw.subarray(28+length)};}
test('texture candidates preserve every baseline geometry and animation byte and embed the one real atlas',()=>{
 const manifest=JSON.parse(read('../models/manifest.json')),ab=manifest.textureAB;assert.equal(ab.revision,'ab2');assert.equal(ab.models.length,3);const atlas=read(ab.atlas);assert.equal(sha(atlas),ab.atlasSHA256);assert.equal(atlas.readUInt32BE(16),512);assert.equal(atlas.readUInt32BE(20),512);
 for(const candidate of ab.models){
  const baseline=manifest.models.find(m=>m.id===candidate.id),a=glb(baseline.glb),b=glb(candidate.glb);assert.equal(sha(a.raw),baseline.glbSHA256);assert.equal(sha(b.raw),candidate.glbSHA256);assert.deepEqual(b.bin.subarray(0,a.bin.length),a.bin);
  assert.deepEqual(b.doc.nodes,a.doc.nodes);assert.deepEqual(b.doc.animations,a.doc.animations);assert.deepEqual(b.doc.accessors.slice(0,a.doc.accessors.length),a.doc.accessors);assert.deepEqual(b.doc.bufferViews.slice(0,a.doc.bufferViews.length),a.doc.bufferViews);
  assert.equal(b.doc.materials.length,a.doc.materials.length);assert.equal(b.doc.meshes.length,a.doc.meshes.length);assert.equal(b.doc.images.length,1);assert.equal(b.doc.textures.length,1);
  const imageView=b.doc.bufferViews[b.doc.images[0].bufferView];assert.deepEqual(b.bin.subarray(imageView.byteOffset,imageView.byteOffset+imageView.byteLength),atlas);
  for(let i=0;i<a.doc.meshes.length;i++)for(let p=0;p<a.doc.meshes[i].primitives.length;p++){
   const original=a.doc.meshes[i].primitives[p],actual=b.doc.meshes[i].primitives[p],{TEXCOORD_1,...attrs}=actual.attributes;assert.deepEqual({...actual,attributes:attrs},original);
   if(b.doc.materials[actual.material].pbrMetallicRoughness?.baseColorTexture){assert.equal(b.doc.materials[actual.material].pbrMetallicRoughness.baseColorTexture.texCoord,1);assert(Number.isInteger(TEXCOORD_1));assert.equal(b.doc.accessors[TEXCOORD_1].count,a.doc.accessors[original.attributes.POSITION].count);}
  }
 }
});
test('the red boar nose and foreman head stay plain while equipment is textured',()=>{
 const manifest=JSON.parse(read('../models/manifest.json'));
 for(const id of ['miller','foreman']){
  const candidate=manifest.textureAB.models.find(m=>m.id===id),g=readGLB(new URL(candidate.glb,root).pathname),node=g.doc.nodes.find(n=>n.name===id+'_head_geometry');let checked=0;
  for(const p of g.doc.meshes[node.mesh].primitives){if(g.doc.materials[p.material].name!=='fort_matte')continue;const colors=g.accessor(p.attributes.COLOR_0),uv=g.accessor(p.attributes.TEXCOORD_1);
   for(let i=0;i<colors.count;i++){const [r,green,b]=colors.values.slice(i*colors.width,i*colors.width+3);if(r<.1)continue;const ratio=green/r;
    if(id==='miller'&&ratio<.3){assert.equal(uv.values[i*2],.5,'Red nose must use the neutral strip');assert.equal(uv.values[i*2+1],.9375);checked++;}
    if(id==='foreman'){assert.equal(uv.values[i*2],.5,'Head must stay plain');assert.equal(uv.values[i*2+1],.9375);checked++;}
   }
  }assert(checked>100,'Actual facial vertices must be inspected');
 }
});
