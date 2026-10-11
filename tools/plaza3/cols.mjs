// Твёрдое мест, которые держит модель: боксы col_* GLB из client/assets/plaza3 → раздел colliders в layout.json (WP14a).
//   node tools/plaza3/cols.mjs           — показать, чем colliders отличаются от моделей (по списку SYNC ниже)
//   node tools/plaza3/cols.mjs --write   — переписать эти боксы в docs/plaza3/level/layout.json (потом
//                                          node docs/plaza3/level/check.mjs && node tools/plaza3/layout.mjs)
// Зачем: твёрдое режимов (Семён, витрина, бильярд, мол, скала, портал) считали по раскладке, а не по модели, и игрок то
// проходил сквозь видимую стенку, то упирался в воздух. Теперь эти боксы берутся из col_* самих моделей; свои id у них
// «pav.<павильон>.<имя>» (скала — «cliff.N» по порядку рядов), поле pav — павильон, чья это модель. Модели читаются без
// three.js (client/lobby/plaza3/pavdata.ts). Боксы, которые модель задаёт внахлёст (колонна на парапете), режутся clip.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LAYOUT = path.join(root, 'docs/plaza3/level/layout.json');
const ASSETS = path.join(root, 'client/assets/plaza3');
const { PAVILIONS, glbJson, pavColliders } = await import(path.join(root, 'client/lobby/plaza3/pavdata.ts'));

/**
 * Что берём из моделей. old — какие боксы раскладки этот пункт заменяет (по id); height: 'old' — высота как у прежних рядов
 * того же z (скала вдвое выше 8 м модели: камера и самолёт у массива не должны проходить над боксом); clip — урезать
 * бокс модели (там, где в игре рядом стоит ещё один твёрдый бокс режима и они пересеклись бы).
 */
const SYNC = [
  // Доски у spawn сохраняют один цельный бокс здания, но высота/опоры следуют актуальной модели после снятия вывесок.
  { pav: 'honor', match: /^col_/, name: () => 'pav.honor', old: /^pav\.honor(\..*)?$/, q: 'hub', mat: 'concrete', union: true },
  { pav: 'online', match: /^col_/, name: () => 'pav.online', old: /^pav\.online(\..*)?$/, q: 'hub', mat: 'concrete', union: true },
  // скала: ряды растра 0,75 м; заполнители блокаута арен (pav.back.*) и стенка кармана (wall.pocket) стоят вплотную к рядам и
  // перекрылись бы с ними — ряд обходит их (avoid), а не наоборот
  { pav: 'dungeon_cliff', match: /^col_rock_/, name: (i) => `cliff.${i}`, old: /^cliff\.\d+$/, q: 'cliffs', mat: 'concrete', height: 'old', avoid: true,
    // ряд col_rock_08 упирался бы в бочку Подземелья (plaza2.ts, x −20,0…−19,29)
    clipBy: { col_rock_08: { x1: -20.0 } } },
  { pav: 'fishshowcase', match: /^col_(counter|side_[lr]|wall|post_[lr])$/, q: 'port' },
  // южные колонны бильярда в игре стоят на z 21,53…21,79 (shared/billiards.ts BL_POSTS), стенки кончаются перед ними
  { pav: 'billiards', match: /^col_(east_wall|rail_w)$/, q: 'games', clip: { z1: 21.53 } },
  // перила крыльца в модели начинаются на столбе — свой бокс начинается за его южной гранью (Лавка на помосте у мола, крыльцо
  // на север: столб z 47,47…47,63)
  { pav: 'semyon', match: /^col_(porch_post_[ns]|porch_rail_n|porch_table|barrels_sw|bench_s|woodpile_e)$/, q: 'port', clipBy: { col_porch_rail_n: { z0: 47.63 } } },
  // col_sign_udalaya (1,14 м в ширину, на всю высоту) не берём: у таблички катера уже стоит столбик режима (BOAT/PORT.sign, 0,1 м)
  { pav: 'mole', match: /^col_red_light$/, q: 'port' },
  // крысиные бега v2 (11.10): уголок букмекера и две трибунки на понтоне; понтон, загон и столбы табло — твёрдое режима
  { pav: 'rats', match: /^col_(counter|easel|umbrella_pole|stand_[we]_(1|2|back|post_[ns]))$/, q: 'port' },
  // фонтан Бульварного сквера: чаша восьмиугольником из 7 боксов, пьедестал, нижняя чаша; заменяет плиту блокаута pav.fountain
  // (кольцо борта — четыре бокса pav.fountain-rim.* руками: боксы чаши модели перекрываются, а раскладка перекрытий не терпит)
  { pav: 'fountain', match: /^col_(basin_dg|pedestal)$/, old: /^pav\.fountain(\..+)?$/, q: 'games' },
];

const r3 = (v) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------- раздел colliders: разбор и печать (формат тот же, что в файле)
const src = readFileSync(LAYOUT, 'utf8');
const head = '\n  "colliders": [';
const start = src.indexOf(head);
const end = src.indexOf('\n  ],', start);
if (start < 0 || end < 0) throw new Error('в layout.json нет раздела colliders');
const old = JSON.parse(`[${src.slice(start + head.length, end)}]`);
const print = (c) => {
  const lines = Object.entries(c).map(([k, v]) => `      ${JSON.stringify(k)}: ${Array.isArray(v) ? `[${v.join(', ')}]` : JSON.stringify(v)}`);
  return `    {\n${lines.join(',\n')}\n    }`;
};
const printAll = (list) => list.map(print).join(',\n');
if (`\n${printAll(old)}` !== src.slice(start + head.length, end)) throw new Error('раздел colliders напечатан не так, как в файле: формат изменился — поправь print()');

// ---------------------------------------------------------------- боксы из моделей
function fromModel(s) {
  const p = PAVILIONS.find((x) => x.id === s.pav);
  if (!p) throw new Error(`нет павильона ${s.pav}`);
  const j = glbJson(new Uint8Array(readFileSync(path.join(ASSETS, p.file))));
  const cols = pavColliders(j, p).filter((c) => s.match.test(c.name)).sort((a, b) => (a.name < b.name ? -1 : 1));
  if (!s.union || !cols.length) return cols;
  return [{ name: 'col_body', min: [0, 1, 2].map((k) => Math.min(...cols.map((c) => c.min[k]))), max: [0, 1, 2].map((k) => Math.max(...cols.map((c) => c.max[k]))) }];
}

let list = old.slice();
const report = [];
for (const s of SYNC) {
  const cols = fromModel(s);
  if (!cols.length) throw new Error(`${s.pav}: нет боксов ${s.match}`);
  const mine = (c) => (s.old ? s.old.test(c.id) : c.id.startsWith(`pav.${s.pav}.`));
  const before = list.filter(mine);
  const at = list.findIndex(mine);
  const rows = before.map((c) => ({ z0: c.min[2], z1: c.max[2], h: c.max[1] }));
    // что обходить: боксы раскладки, которые не заменяются этим пунктом (пол и вода — не твёрдое для хождения)
  const others = list.filter((c) => !mine(c) && c.mat !== 'deck');
  let n = 0;
  const next = cols.flatMap((c) => {
    const min = c.min.map(r3);
    const max = c.max.map(r3);
    for (const k of [s.clip, s.clipBy?.[c.name]]) {
      if (!k) continue;
      if (k.x0 !== undefined) min[0] = Math.max(min[0], k.x0);
      if (k.x1 !== undefined) max[0] = Math.min(max[0], k.x1);
      if (k.z0 !== undefined) min[2] = Math.max(min[2], k.z0);
      if (k.z1 !== undefined) max[2] = Math.min(max[2], k.z1);
    }
    if (s.height === 'old') max[1] = Math.max(...rows.filter((r) => r.z1 > min[2] + 1e-6 && r.z0 < max[2] - 1e-6).map((r) => r.h), max[1]);
    // куски бокса вне чужих боксов: вычитание по x, z (по высоте бокс остаётся целым — чужие ниже, а над ними скале не мешают)
    let pieces = [{ min, max }];
    if (s.avoid) {
      for (const f of others) {
        pieces = pieces.flatMap((p) => {
          const hit = p.min[0] < f.max[0] - 1e-6 && p.max[0] > f.min[0] + 1e-6 && p.min[2] < f.max[2] - 1e-6 && p.max[2] > f.min[2] + 1e-6 && p.min[1] < f.max[1] - 1e-6 && p.max[1] > f.min[1] + 1e-6;
          if (!hit) return [p];
          const out = [];
          const zl = Math.max(p.min[2], f.min[2]);
          const zh = Math.min(p.max[2], f.max[2]);
          if (p.min[2] < zl) out.push({ min: p.min, max: [p.max[0], p.max[1], zl] });
          if (p.max[2] > zh) out.push({ min: [p.min[0], p.min[1], zh], max: p.max });
          if (p.min[0] < f.min[0]) out.push({ min: [p.min[0], p.min[1], zl], max: [f.min[0], p.max[1], zh] });
          if (p.max[0] > f.max[0]) out.push({ min: [f.max[0], p.min[1], zl], max: [p.max[0], p.max[1], zh] });
          return out;
        });
      }
    }
    return pieces.map((p) => ({
      id: s.name ? s.name(n++) : `pav.${s.pav}.${c.name.replace(/^col_/, '')}`,
      q: s.q, pav: s.pav, min: p.min.map(r3), max: p.max.map(r3), mat: s.mat ?? 'invisible', color: s.mat ? (before[0]?.color ?? 0) : 0,
    }));
  });
  list = list.filter((c) => !mine(c));
  list.splice(at < 0 ? list.length : at, 0, ...next);
  report.push(`${s.pav}: ${before.length} → ${next.length} боксов`);
}

const text = `${src.slice(0, start + head.length)}\n${printAll(list)}${src.slice(end)}`;
if (text === src) console.log('colliders совпадают с моделями');
else console.log(report.join('\n'));
if (process.argv.includes('--write')) {
  writeFileSync(LAYOUT, text);
  console.log(`layout.json: colliders — ${list.length} шт.`);
}
