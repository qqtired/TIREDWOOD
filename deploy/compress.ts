// Кладёт рядом с текстовыми файлами сборки их сжатые копии (.gz): nginx отдаёт их сам (gzip_static),
// не сжимая на лету. Модель статуи (.bin) тоже сжимается: 1,2 МБ → 0,9 МБ.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { constants, gzipSync } from 'node:zlib';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const TEXT = new Set(['.html', '.js', '.css', '.svg', '.json', '.txt', '.bin']);

let files = 0;
let before = 0;
let after = 0;
function walk(dir: string): void {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) {
      walk(file);
      continue;
    }
    if (!TEXT.has(path.extname(name))) continue;
    const raw = readFileSync(file);
    if (raw.length < 1024) continue;
    const gz = gzipSync(raw, { level: constants.Z_BEST_COMPRESSION });
    writeFileSync(`${file}.gz`, gz);
    files++;
    before += raw.length;
    after += gz.length;
  }
}
walk(DIST);
console.log(`gzip: ${files} файлов, ${(before / 1024).toFixed(0)} КБ → ${(after / 1024).toFixed(0)} КБ`);
