// Вывески новой набережной: места и размеры — из якорей anchor_sign_* моделей павильонов (WP9), а не от руки.
//   node tools/plaza3/signs.mjs           — показать, чем раздел signs в layout.json отличается от моделей
//   node tools/plaza3/signs.mjs --write   — переписать раздел signs в docs/plaza3/level/layout.json (потом
//                                           node docs/plaza3/level/check.mjs && node tools/plaza3/layout.mjs)
// Берёт именно игровые GLB из client/assets/plaza3 (или PLAZA3_ASSETS) и игровые корни PAVILIONS. Поэтому v2 и
// перенесённый павильон не возвращаются к устаревшим координатам исходного манифеста при следующей генерации.
// Размеры поля — масштаб пустышки (половины ширины и высоты), «наружу» — её локальная +Z.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LAYOUT = path.join(root, 'docs/plaza3/level/layout.json');
const MODELS = process.env.PLAZA3_ASSETS || path.join(root, 'client/assets/plaza3');
const { PAVILIONS } = await import(path.join(root, 'client/lobby/plaza3/pavdata.ts'));

/**
 * Сдвиг вывески от стены «наружу» (в сторону, куда она смотрит), м: у модели в этом месте карниз выступает дальше плоскости
 * щита — без сдвига он режет верх вывески. Пейнтбол: карниз pav_paintball (y 6,42…6,60) выступает на z −28,86, щит стоял на
 * −28,881 (WP14a: щит теперь на 12 см впереди карниза, лампочки рамки — позади щита).
 */
const NUDGE = { paintball: 0.12 };

/** Вывеска → (файл, якорь [, якорь обратной стороны]), текст на вывеске, порядок — как в layout.json */
const SIGNS = [
  ['kurzal', 'АВТОМАТЫ · АРКАДА', 'pav_kursaal', 'anchor_sign_face'],
  ['billiards', 'БИЛЬЯРД', 'pav_billiards', 'anchor_sign_face'],
  ['wheel', 'КОЛЕСО ОБОЗРЕНИЯ', null, { x: 24.2, y: 3.4, z: 13, yaw: Math.PI / 2, w: 2, h: 0.55, note: 'нет модели: портал из двух стоек у кассы колеса (WHEEL_GATE 24,4; 13), лицом на запад' }],
  ['kalancha', 'ВЫШЕ ОБЛАКОВ', 'pav_skytower', 'anchor_sign_face'],
  ['paintball', 'ПЕЙНТБОЛ', 'pav_paintball', 'anchor_sign_face'],
  ['fortress', 'КРЕПОСТЬ', 'pav_fort', 'anchor_sign_face'],
  ['karting', 'КАРТИНГ', 'pav_karting', 'anchor_sign_face'],
  ['dungeon', 'ПОДЗЕМЕЛЬЕ', 'pav_dungeon_cliff', 'anchor_sign_face'],
  ['aquapark', 'АКВАПАРК «ВОЛНА»', 'pav_lifeguard', 'anchor_sign_aqua', 'anchor_sign_aqua_back'],
  ['wardrobe', 'ПРИМЕРОЧНАЯ', 'pav_cabins', 'anchor_sign_wardrobe'],
  ['plane', 'ГИДРОПЛАН «СТРИЖ»', 'pav_aeroclub', 'anchor_sign_aeroclub', 'anchor_sign_aeroclub_back'],
  ['semyon', 'ЛАВКА СЕМЁНА', 'pav_semyon', 'anchor_sign_semyon'],
  ['udalaya', '«УДАЛАЯ» · К БАРКАСУ', 'pav_mole', 'anchor_sign_udalaya'],
  ['showcase', 'КРУПНЕЙШИЕ РЫБЫ СЕГОДНЯ', 'pav_fishshowcase', 'anchor_sign_biggest'],
  ['hide', 'РЫБНЫЙ ДВОР', 'pav_fishyard', 'anchor_sign_fishyard', 'anchor_sign_fishyard_back'],
  ['ratrace', 'КРЫСИНЫЕ БЕГА', null, { x: -0.4, y: 2.1, z: 26.5, yaw: 0, w: 2.6, h: 0.6, note: 'в модели нет вывески: табличка под табло board_rats (низ y 2,4), между его стойками, лицом на север' }],
  ['lastochka', '«ЛАСТОЧКА»', 'pav_swallow_gate', 'anchor_sign_lastochka', 'anchor_sign_lastochka_back'],
  ['regatta', 'ПОРТОВАЯ РЕГАТА', 'pav_swallow_gate', 'anchor_sign_regatta', 'anchor_sign_regatta_back'],
];

// ---------------------------------------------------------------- GLB: узлы с мировыми матрицами внутри файла
const readGlb = (f) => {
  const b = readFileSync(f);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
};
const mulQ = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
  aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz,
];
const rotV = ([x, y, z, w], [vx, vy, vz]) => {
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};
function anchors(file) {
  const nodes = readGlb(file).nodes ?? [];
  const parent = nodes.map(() => -1);
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const world = (i) => {
    const n = nodes[i];
    const t = n.translation ?? [0, 0, 0], q = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1];
    if (parent[i] < 0) return { t, q, s };
    const p = world(parent[i]);
    const r = rotV(p.q, [t[0] * p.s[0], t[1] * p.s[1], t[2] * p.s[2]]);
    return { t: [p.t[0] + r[0], p.t[1] + r[1], p.t[2] + r[2]], q: mulQ(p.q, q), s: [p.s[0] * s[0], p.s[1] * s[1], p.s[2] * s[2]] };
  };
  const out = {};
  nodes.forEach((n, i) => {
    if (!n.name?.startsWith('anchor_sign')) return;
    const w = world(i);
    out[n.name] = { t: w.t, s: w.s, fwd: rotV(w.q, [0, 0, 1]) };
  });
  return out;
}

const r3 = (v) => Math.round(v * 1000) / 1000;
/** Якорь модели → мир: центр поля и куда оно смотрит (yaw: 0 — на −Z, как у остальных точек раскладки) */
function toWorld(rootPose, a) {
  const c = Math.cos(rootPose.yaw), s = Math.sin(rootPose.yaw);
  const [x, y, z] = a.t;
  const f = a.fwd;
  const fx = f[0] * c + f[2] * s, fz = -f[0] * s + f[2] * c;
  return { x: rootPose.x + x * c + z * s, y: (rootPose.y ?? 0) + y, z: rootPose.z - x * s + z * c, yaw: Math.atan2(-fx, -fz), w: 2 * a.s[0], h: 2 * a.s[1] };
}

const rows = [];
for (const [id, text, file, a, aBack] of SIGNS) {
  if (!file) {
    const { note, ...pos } = a;
    rows.push({ id, text, x: pos.x, y: pos.y, z: pos.z, yaw: r3(pos.yaw), w: pos.w, h: pos.h, note });
    continue;
  }
  const pose = PAVILIONS.find((p) => p.id === file.replace(/^pav_/, ''));
  if (!pose) throw new Error(`нет корня павильона ${file}`);
  const an = anchors(path.join(MODELS, pose.file));
  if (!an[a]) throw new Error(`${file}: нет якоря ${a}`);
  const w = toWorld(pose, an[a]);
  const out = NUDGE[id] ?? 0;
  w.x += -Math.sin(w.yaw) * out;
  w.z += -Math.cos(w.yaw) * out;
  const row = { id, text, x: r3(w.x), y: r3(w.y), z: r3(w.z), yaw: r3(w.yaw), w: r3(w.w), h: r3(w.h) };
  if (aBack) {
    if (!an[aBack]) throw new Error(`${file}: нет якоря ${aBack}`);
    const b = toWorld(pose, an[aBack]);
    row.back = [r3(b.x), r3(b.y), r3(b.z)];
  }
  rows.push(row);
}

// ---------------------------------------------------------------- сверка и запись
const src = readFileSync(LAYOUT, 'utf8');
const start = src.indexOf('\n  "signs": [');
const end = src.indexOf('\n  ],', start);
if (start < 0 || end < 0) throw new Error('в layout.json нет раздела signs');
const old = JSON.parse(`[${src.slice(start + '\n  "signs": ['.length, end)}]`);
let diffs = 0;
for (const r of rows) {
  const o = old.find((s) => s.id === r.id);
  if (!o) { console.log(`+ ${r.id}: новая (${r.x}; ${r.y}; ${r.z}) ${r.w}×${r.h}`); diffs++; continue; }
  const d = Math.max(Math.abs(o.x - r.x), Math.abs(o.y - r.y), Math.abs(o.z - r.z));
  if (d > 0.015 || o.yaw === undefined) {
    console.log(`~ ${r.id}: (${o.x}; ${o.y}; ${o.z}) → (${r.x}; ${r.y}; ${r.z}) yaw ${r.yaw} ${r.w}×${r.h}${r.back ? ' +обратная' : ''}`);
    diffs++;
  }
}
console.log(diffs ? `расхождений: ${diffs}` : 'вывески совпадают с моделями');
if (process.argv.includes('--write')) {
  const body = rows.map((r) => JSON.stringify(r, null, 2).replace(/^/gm, '    ')).join(',\n');
  writeFileSync(LAYOUT, `${src.slice(0, start)}\n  "signs": [\n${body}${src.slice(end)}`);
  console.log(`layout.json: signs — ${rows.length} шт.`);
}
