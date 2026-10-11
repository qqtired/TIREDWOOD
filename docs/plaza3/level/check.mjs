// Проверка раскладки новой набережной до кода: node docs/plaza3/level/check.mjs (код возврата 1 — есть ошибки).
// Что проверяет (docs/plaza3/tech-foundation.md §1.3, §7.4): числа на месте, якоря — четверть оборота с центром,
// боксы твёрдого целые, по высоте в ±128 м и не пересекают друг друга; точки E и места появления не в боксах;
// от центральной площади до входов ≤ maxFromCenter по прямой (50 м — 5–6 с бега; игровой квартал и ферма — 57 м);
// суша — многоугольник, у боксов есть квартал q. Опору под точками и проходы вокруг старых сборок
// проверяет test/plaza3-map.test.ts на собранной карте.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = JSON.parse(readFileSync(path.join(here, 'layout.json'), 'utf8'));
const errors = [];
const bad = (msg) => errors.push(msg);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
/** Игрок — бокс 0,84 × 1,6 м (PLAYER_HALF = 0,42, shared/constants.ts) */
const HALF = 0.42;
const LIM = L.maxFromCenter ?? { default: 50 };
/** Точка внутри многоугольника [[x, z], …] (чёт-нечет) */
const inPoly = (x, z, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
/** Предел для точки: квартал-исключение (games, farm), если точка в его многоугольнике, иначе default */
const limitAt = (x, z) => {
  for (const q of L.quarters ?? []) if (q.poly && LIM[q.id] && inPoly(x, z, q.poly)) return LIM[q.id];
  return LIM.default;
};

for (const k of ['skeleton', 'legacyStatic']) if (typeof L[k] !== 'boolean') bad(`${k}: нужно true или false`);
if (!num(L.center?.x) || !num(L.center?.z)) bad('center: нужны x и z');
if (!num(LIM.default)) bad('maxFromCenter.default: нужно число');
if (!L.skeleton) {
  const poly = L.land?.polygon;
  if (!Array.isArray(poly) || poly.length < 3 || !poly.every((p) => num(p[0]) && num(p[1]))) bad('land.polygon: нужен многоугольник [[x, z], …]');
  else if (!inPoly(L.lobby?.spawn?.x, L.lobby?.spawn?.z, poly)) bad('lobby.spawn: не на суше (land.polygon)');
  if (!num(L.land?.town?.e) || !num(L.land?.town?.n)) bad('land.town: нужны e и n');
}

for (const [g, a] of Object.entries(L.anchors ?? {})) {
  if (!num(a.dx) || !num(a.dz)) bad(`anchors.${g}: нужны dx и dz`);
  if (![0, 1, 2, 3].includes(a.rot)) bad(`anchors.${g}: rot — 0, 1, 2 или 3 (четверти оборота)`);
  if (a.rot && (!num(a.cx) || !num(a.cz))) bad(`anchors.${g}: при повороте нужен центр группы cx, cz (старые координаты)`);
}

const lobby = L.lobby ?? {};
const uses = [];
const spots = [];
for (const [k, v] of Object.entries(lobby)) {
  if (v && typeof v === 'object' && 'x' in v && 'z' in v) {
    if (!num(v.x) || !num(v.z) || ('yaw' in v && !num(v.yaw))) bad(`lobby.${k}: x, z, yaw — числа`);
    if ('r' in v) {
      if (!(v.r > 0)) bad(`lobby.${k}: r > 0`);
      uses.push({ name: `lobby.${k}`, ...v });
    } else if ('yaw' in v && k !== 'mirror') spots.push({ name: `lobby.${k}`, ...v });
    // mirror — не место, где стоит игрок, а стекло зеркала на восточной стене примерочной (в 9 см от стены): в бокс стены оно не «встаёт»
  }
}
for (const [k, v] of Object.entries(L.modes ?? {})) {
  if (v && typeof v === 'object' && !Array.isArray(v) && num(v.x) && num(v.z) && num(v.r)) uses.push({ name: `modes.${k}`, ...v });
}
if (L.farmRoad?.use) uses.push({ name: 'farmRoad.use', ...L.farmRoad.use });
(L.arcade ?? []).forEach((a, i) => {
  if (!num(a.x) || !num(a.z) || !num(a.yaw) || !(a.r > 0)) bad(`arcade[${i}]: нужны x, z, yaw и r > 0`);
  uses.push({ name: `arcade[${i}]`, ...a });
});

const ids = new Set();
const cols = L.colliders ?? [];
for (const c of cols) {
  if (ids.has(c.id)) bad(`colliders: повтор id ${c.id}`);
  if (!L.skeleton && typeof c.q !== 'string') bad(`colliders.${c.id}: нужен квартал q`);
  ids.add(c.id);
  if (!Array.isArray(c.min) || !Array.isArray(c.max) || c.min.length !== 3 || c.max.length !== 3 || ![...c.min, ...c.max].every(num)) {
    bad(`colliders.${c.id}: min и max — по три числа`);
    continue;
  }
  if (!(c.min[0] < c.max[0] && c.min[1] < c.max[1] && c.min[2] < c.max[2])) bad(`colliders.${c.id}: min меньше max по всем осям`);
  if (c.min[1] < -128 || c.max[1] > 128) bad(`colliders.${c.id}: высота вне ±128 м (снимок не передаст)`);
}
const okCols = cols.filter((c) => Array.isArray(c.min) && Array.isArray(c.max));
for (let i = 0; i < okCols.length; i++) {
  for (let j = 0; j < i; j++) {
    const a = okCols[i];
    const b = okCols[j];
    const d = [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]));
    if (d.every((x) => x > 1e-6)) bad(`colliders: ${a.id} пересекает ${b.id}`);
  }
}
for (const p of [...uses, ...spots]) {
  for (const c of okCols) {
    if (c.max[1] <= 0.01 || c.min[1] >= 1.6) continue;
    if (p.x + HALF > c.min[0] && p.x - HALF < c.max[0] && p.z + HALF > c.min[2] && p.z - HALF < c.max[2]) bad(`${p.name} (${p.x}; ${p.z}) — в боксе ${c.id}`);
  }
}
for (const u of uses) {
  const d = Math.hypot(u.x - L.center.x, u.z - L.center.z);
  const lim = limitAt(u.x, u.z);
  if (d > lim) bad(`${u.name}: ${d.toFixed(1)} м от центра — дальше ${lim} м`);
}

if (errors.length) {
  for (const e of errors) console.error('✗', e);
  process.exit(1);
}
console.log(`layout.json: ок (${Object.keys(L.anchors ?? {}).length} якорей, ${uses.length} точек E, ${cols.length} боксов, скелет: ${L.skeleton})`);
