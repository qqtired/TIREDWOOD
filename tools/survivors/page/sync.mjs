// «Подземелье»: копирует данные страницы из docs/survivors/ в docs/survivors/page/.
// Запуск: node tools/survivors/page/sync.mjs   (из корня репозитория или откуда угодно)
// Копирует: design-data.json, level-data.json -> data/; map.svg; art/web/*.jpg -> art/;
//   models/*.glb -> models/; models/previews/*.png -> models/previews/.
// Делает: data/balance-40.json (вывод tools/survivors/balance.mjs 40 --json) и models/manifest.json
//   (какие GLB и превью реально есть, чтобы страница не стучалась в несуществующие файлы).
// index.html не трогает.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = join(ROOT, 'docs/survivors');
const DST = join(SRC, 'page');
const log = [];

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  log.push(`${from.replace(ROOT + '/', '')} -> ${to.replace(ROOT + '/', '')} (${(statSync(to).size / 1024).toFixed(0)} КБ)`);
}
function list(dir, ext) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith(ext)).sort() : [];
}
// чистим то, что синхронизируется, чтобы удалённые исходники не оставались в копии
function clean(dir, ext) {
  for (const f of list(dir, ext)) rmSync(join(dir, f));
}

copy(join(SRC, 'design-data.json'), join(DST, 'data/design-data.json'));
copy(join(SRC, 'level-data.json'), join(DST, 'data/level-data.json'));
copy(join(SRC, 'map.svg'), join(DST, 'map.svg'));

clean(join(DST, 'art'), '.jpg');
for (const f of list(join(SRC, 'art/web'), '.jpg')) copy(join(SRC, 'art/web', f), join(DST, 'art', f));

clean(join(DST, 'models'), '.glb');
clean(join(DST, 'models/previews'), '.png');
clean(join(DST, 'models/previews'), '.jpg');
const glb = list(join(SRC, 'models'), '.glb');
const previews = list(join(SRC, 'models/previews'), '.png');
clean(join(DST, 'models'), '.txt');
// Artifact не отдаёт .glb: страница грузит <имя>.glb.txt (base64 того же файла)
for (const f of glb) writeFileSync(join(DST, 'models', f + '.txt'), readFileSync(join(SRC, 'models', f)).toString('base64'));
// превью для страницы — JPEG до 1000 px по длинной стороне (оригиналы PNG в docs/survivors/models/previews не трогаем)
for (const f of previews) execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '1000', join(SRC, 'models/previews', f), '--out', join(DST, 'models/previews', f.replace(/\.png$/, '.jpg'))], { stdio: 'ignore' });

// баланс до 40-й волны (для графиков и калькулятора жетонов)
try {
  const out = execFileSync('node', [join(ROOT, 'tools/survivors/balance.mjs'), '40', '--json'], { encoding: 'utf8' });
  const rows = JSON.parse(out);
  writeFileSync(join(DST, 'data/balance-40.json'), JSON.stringify({ note: 'node tools/survivors/balance.mjs 40 --json', rows }));
  log.push(`balance-40.json: ${rows.length} волн`);
} catch (e) {
  log.push('balance-40.json: НЕ получилось — ' + e.message.split('\n')[0] + ' (страница возьмёт balanceSnapshot до 20-й волны)');
}

const manifest = {
  generated: new Date().toISOString(),
  glb: Object.fromEntries(glb.map((f) => [f, statSync(join(SRC, 'models', f)).size])),
  previews: previews.map((f) => f.replace(/\.png$/, '.jpg')),
};
writeFileSync(join(DST, 'models/manifest.json'), JSON.stringify(manifest, null, 1));
log.push(`manifest.json: GLB ${glb.length}, превью ${previews.length}`);

console.log(log.join('\n'));
console.log('Готово. Папка страницы:', DST);
