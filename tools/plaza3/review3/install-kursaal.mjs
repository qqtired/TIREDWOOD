// После одного Blender-export: сохраняем уже принятый фикс карниза, ставим новый GLB отдельным файлом.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fixCornice } from '../pack1/flicker-models.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = '/Users/tired/Desktop/tired.solutions/concepts_blender/plaza3/v3-2026-10-12-review3/kursaal';
const final = path.join(source, 'pav_kursaal_runtime.glb');
const cornice = fixCornice(path.join(source, 'pav_kursaal.glb'), final);
const asset = 'client/assets/plaza3/pav_kursaal_v3.glb';
fs.copyFileSync(final, path.join(root, asset));
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(final)).digest('hex');
fs.writeFileSync(path.join(source, 'PROVENANCE.json'), JSON.stringify({
  source: 'v2-2026-10-11-pack1/kursaal plus the existing v3 cornice repair',
  prepare: 'tools/plaza3/review3/prepare-kursaal.mjs', install: 'tools/plaza3/review3/install-kursaal.mjs',
  asset, sha256, cornice,
  changes: ['Original slot and arcade anchors are canonical', 'Jackpot on slot wall', '56 triangles of quiet inward wall finish in existing p3_matte, no texture image or baked AO', 'Exterior and all collider nodes preserved; existing cornice overlap fix reapplied'],
}, null, 2) + '\n');
console.log({ asset, sha256, bytes: fs.statSync(final).size, cornice });
