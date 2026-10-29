// Забрать кадры сцены из Blender/three.js (concepts_blender/quiz/frames/<имя>.png + .json) в страницу:
// PNG 2880×1800 → JPEG 2880×1800 (качество 86, sips), JSON — как есть + имя картинки; список — frames/index.json.
//   node lab/quiz/v2/frames/sync.mjs [папка кадров]
import { execFileSync } from 'node:child_process';
import { copyFileSync, readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] ?? '/Users/tired/Desktop/tired.solutions/concepts_blender/quiz/frames';
const names = readdirSync(src).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => existsSync(join(src, `${n}.png`)));
const list = [];
for (const n of names) {
  const png = join(src, `${n}.png`), jpg = join(here, `${n}.jpg`);
  const fresh = !existsSync(jpg) || statSync(jpg).mtimeMs < statSync(png).mtimeMs;
  if (fresh) execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '86', png, '--out', jpg], { stdio: 'ignore' });
  const j = JSON.parse(readFileSync(join(src, `${n}.json`), 'utf8'));
  j.image = `${n}.jpg`;
  // маска перекрытий (красное — видно табло, зелёное — таблички, синее — мольберт): по ней экраны прячутся за головы и вещи
  const mask = join(src, `${n}.mask.png`);
  if (existsSync(mask)) { copyFileSync(mask, join(here, `${n}.mask.png`)); j.mask = `${n}.mask.png`; }
  writeFileSync(join(here, `${n}.json`), JSON.stringify(j));
  list.push(n);
  console.log(fresh ? 'обновлён' : 'тот же  ', n);
}
writeFileSync(join(here, 'index.json'), JSON.stringify(list));
