// Переносит планировку фермы из docs/farm/level/layout.json в shared/farmlayout.ts (координаты для сервера и клиента).
// Запуск: node tools/farm/layout.mjs — после правки layout.json (node docs/farm/level/check.mjs --write).
// Пояснения ('note', 'what', 'text') не переносятся: они для людей и остаются в layout.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = JSON.parse(readFileSync(path.join(root, 'docs/farm/level/layout.json'), 'utf8'));
const DROP = new Set(['note', 'what', 'text', 'frame', 'faces', 'lobbyEdits', 'where', 'nearby', 'zone', 'version', 'rule', 'jelly']);
const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!DROP.has(k)) o[k] = strip(x);
    return o;
  }
  return v;
};
const data = strip(src);
const out = `// СГЕНЕРИРОВАНО tools/farm/layout.mjs из docs/farm/level/layout.json — руками не править.
// Планировка фермы в метрах: x — восток, z — юг; участки, корыта, общие предметы, твёрдые боксы, вход с площади.
/* eslint-disable */
export const FARM_LAYOUT = ${JSON.stringify(data)} as const;
`;
writeFileSync(path.join(root, 'shared/farmlayout.ts'), out);
console.log('shared/farmlayout.ts:', out.length, 'байт');
