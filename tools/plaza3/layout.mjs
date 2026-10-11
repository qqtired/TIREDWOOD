// Переносит раскладку новой набережной из docs/plaza3/level/layout.json в shared/plaza3/layout.ts (флаг PLAZA3).
// Запуск: node docs/plaza3/level/check.mjs && node tools/plaza3/layout.mjs — после каждой правки layout.json.
// node tools/plaza3/layout.mjs --check — только сверить, что shared/plaza3/layout.ts свежий (так делает test/plaza3-map.test.ts).
// Пояснения ('note', 'what', 'todo') не переносятся: они для людей и остаются в layout.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(root, 'docs/plaza3/level/layout.json');
const OUT = path.join(root, 'shared/plaza3/layout.ts');
const DROP = new Set(['note', 'what', 'todo']);
const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!DROP.has(k)) o[k] = strip(x);
    return o;
  }
  return v;
};
const data = strip(JSON.parse(readFileSync(SRC, 'utf8')));
const out = `// СГЕНЕРИРОВАНО tools/plaza3/layout.mjs из docs/plaza3/level/layout.json — руками не править.
// Раскладка новой набережной (флаг PLAZA3): якоря групп, точки, твёрдое. Форма — shared/plaza3/types.ts.
import type { Plaza3Layout } from './types.ts';

export const P3: Plaza3Layout = ${JSON.stringify(data, null, 2)};
`;
if (process.argv.includes('--check')) {
  let now = '';
  try {
    now = readFileSync(OUT, 'utf8');
  } catch {
    // файла нет — несвежий
  }
  if (now !== out) {
    console.error('shared/plaza3/layout.ts не совпадает с docs/plaza3/level/layout.json — запусти node tools/plaza3/layout.mjs');
    process.exit(1);
  }
  console.log('shared/plaza3/layout.ts свежий');
} else {
  writeFileSync(OUT, out);
  console.log('shared/plaza3/layout.ts:', out.length, 'байт');
}
