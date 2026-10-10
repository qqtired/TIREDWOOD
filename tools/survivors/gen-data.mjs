// Таблицы «Подземелья» для симуляции: docs/survivors/design-data.json и level-data.json → TS-модули в shared/dungeon/.
// Зачем: сервер (node без сборки) и клиент (Vite) импортируют один и тот же .ts, без import-атрибутов JSON.
// Запуск после правки JSON геймдизайнером/левел-дизайнером: node tools/survivors/gen-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

// поля только для модели баланса и длинные пояснения — в игру не нужны
// верхний уровень: разделы для страницы и модели баланса; на любой глубине — только model
const DROP_TOP = new Set(['balanceModel', 'balanceSnapshot', 'notes', 'about', 'stats', 'results', 'leaderboard', 'pause', 'changes']);
function strip(v, top = false) {
  if (Array.isArray(v)) return v.map((x) => strip(x));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (k !== 'model' && !(top && DROP_TOP.has(k))) o[k] = strip(x);
    return o;
  }
  return v;
}

function emit(file, name, src, data) {
  const body = `// Сгенерировано tools/survivors/gen-data.mjs из ${src} — не править руками.\n` +
    `export const ${name} = ${JSON.stringify(data)};\n`;
  writeFileSync(join(root, file), body);
  console.log(file, body.length, 'байт');
}

emit('shared/dungeon/gen-design.ts', 'DESIGN_RAW', 'docs/survivors/design-data.json', strip(read('docs/survivors/design-data.json'), true));
emit('shared/dungeon/gen-level.ts', 'LEVEL_RAW', 'docs/survivors/level-data.json', strip(read('docs/survivors/level-data.json'), true));
