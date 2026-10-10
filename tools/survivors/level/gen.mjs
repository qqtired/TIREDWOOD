// Генератор левел-дизайна «Подземелья»: зоны (силовая диаграмма на торе), ориентиры, препятствия, постройки,
// проверка проходимости. Пишет docs/survivors/level-data.json; SVG рисует draw.mjs по этим данным.
import fs from 'fs';
import { L, wrap, mod, SEEDS, zoneAt, boundaryDist } from './zones.mjs';

const OUT = '/Users/tired/Desktop/game-opus-survivors/docs/survivors';
const CHUNK = 24;
const r1 = (v) => Math.round(v * 10) / 10;

// ---------- детерминированный ГПСЧ
let S = 20261010;
const rnd = () => { S = (S * 1664525 + 1013904223) >>> 0; return S / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();

// ---------- зоны: многоугольники силовой диаграммы на торе (координаты без свёртки, по модулю L)
function clip(poly, a, b, c) { // оставить a*x + b*z <= c
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length];
    const fp = a * P[0] + b * P[1] - c, fq = a * Q[0] + b * Q[1] - c;
    if (fp <= 0) out.push(P);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}
const zones = SEEDS.map((p) => {
  let poly = [[p.x - L, p.z - L], [p.x + L, p.z - L], [p.x + L, p.z + L], [p.x - L, p.z + L]];
  for (const q of SEEDS) for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
    if (q === p && ox === 0 && oz === 0) continue;
    const qx = q.x + ox * L, qz = q.z + oz * L;
    // |x-p|^2 - wp <= |x-q|^2 - wq  =>  2x·(q-p) <= |q|^2 - |p|^2 - wq + wp
    poly = clip(poly, 2 * (qx - p.x), 2 * (qz - p.z), qx * qx + qz * qz - p.x * p.x - p.z * p.z - q.w + p.w);
  }
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const A = poly[i], B = poly[(i + 1) % poly.length]; area += A[0] * B[1] - B[0] * A[1]; }
  return { id: p.id, seed: { x: p.x, z: p.z }, weight: p.w, polygon: poly.map(([x, z]) => [r1(x), r1(z)]), area: Math.round(Math.abs(area) / 2) };
});
const ZINFO = {
  cellars: { name: 'Старые погреба', color: '#b98a5e', mood: 'кирпичные своды, бочки, винные стеллажи, факелы' },
  mushrooms: { name: 'Грибная пещера', color: '#8f9a5a', mood: 'мягкая земля и мох, грибы-великаны со светящимися шляпками' },
  crystals: { name: 'Кристальный грот', color: '#4fa8a0', mood: 'холодный сланец, бирюзовые кристаллы, подземное озеро и мелкие лужи' },
  mine: { name: 'Старая шахта', color: '#a07a48', mood: 'утоптанная земля, крепь из брёвен, рельсы, рудные кучи, провалы' },
  jam: { name: 'Варенные жилы', color: '#8a4f9a', mood: 'сливово-серый камень, светящиеся жилы и лужи варенья, бродильные чаны, Котёл Барона' },
};
for (const z of zones) Object.assign(z, ZINFO[z.id]);

// ---------- геометрия на торе
const d2 = (ax, az, bx, bz) => Math.hypot(wrap(ax - bx), wrap(az - bz));
function segDistPt(s, x, z) { // расстояние от точки до оси отрезка (на торе)
  const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, hx = (s.x1 - s.x0) / 2, hz = (s.z1 - s.z0) / 2;
  const px = wrap(x - cx), pz = wrap(z - cz);
  const l2 = hx * hx + hz * hz;
  let t = l2 > 0 ? (px * hx + pz * hz) / l2 : 0; t = Math.max(-1, Math.min(1, t));
  return Math.hypot(px - hx * t, pz - hz * t);
}
function shapeDistPt(o, x, z) { return (o.t === 'c' ? d2(o.x, o.z, x, z) : segDistPt(o, x, z)) - o.r; }
function shapeGap(a, b) { // зазор между фигурами (край к краю)
  if (a.t === 'c') return shapeDistPt(b, a.x, a.z) - a.r;
  if (b.t === 'c') return shapeDistPt(a, b.x, b.z) - b.r;
  let best = 1e9; const n = Math.ceil(Math.hypot(a.x1 - a.x0, a.z1 - a.z0)) + 1;
  for (let i = 0; i <= n; i++) { const t = i / n; best = Math.min(best, segDistPt(b, a.x0 + (a.x1 - a.x0) * t, a.z0 + (a.z1 - a.z0) * t)); }
  return best - a.r - b.r;
}
const bbox = (o) => o.t === 'c' ? [o.x - o.r, o.z - o.r, o.x + o.r, o.z + o.r]
  : [Math.min(o.x0, o.x1) - o.r, Math.min(o.z0, o.z1) - o.r, Math.max(o.x0, o.x1) + o.r, Math.max(o.z0, o.z1) + o.r];

// ---------- ручная разметка: ориентиры, арены, тракты
const landmarks = [
  { id: 'well', zone: 'cellars', x: 120, z: 120, r: 6, name: 'Световой колодец', desc: 'Точка старта. Лестница с площади (к западу от центра) уходит в потолок, сквозь решётку бьёт столб дневного света, на полу — мозаика «роза ветров», как на площади.' },
  { id: 'ring', zone: 'mushrooms', x: 52, z: 84, r: 12.5, name: 'Ведьмин круг', desc: 'Кольцо из 12 светящихся грибов Ø 25 м, внутри — моховая поляна-арена.' },
  { id: 'lake', zone: 'crystals', x: 180, z: 54, r: 11, name: 'Подземное озеро', desc: 'Глубокое озеро Ø 22 м (не пройти), на островке — бирюзовая друза; вокруг мелководье (замедляет).' },
  { id: 'kopyor', zone: 'mine', x: 168, z: 194, r: 4.5, name: 'Копёр', desc: 'Бревенчатый копёр с колесом над главным стволом шахты (провал), к нему сходятся рельсы.' },
  { id: 'cauldron', zone: 'jam', x: 0, z: 180, r: 4, name: 'Котёл Барона', desc: 'Огромный медный котёл на помосте, булькает варенье; от него расходятся 4 светящиеся реки варенья. Отсюда начинается Жила-компас.' },
  { id: 'gallery', zone: 'cellars', x: 82, z: 128, r: 14, name: 'Винная галерея', desc: 'Четыре ряда винных стеллажей по 14 м: три коридора для кайта «паровозом».' },
  { id: 'bigbarrel', zone: 'cellars', x: 146, z: 150, r: 3.2, name: 'Бочка-великан', desc: 'Лежащая бочка высотой в два роста героя, с краником; видна издалека по тёплому свету.' },
  { id: 'patriarch', zone: 'mushrooms', x: 22, z: 48, r: 3, name: 'Гриб-Патриарх', desc: 'Самый большой гриб (шляпка Ø 14 м на высоте 6 м, растворяется, когда герой под ней).' },
  { id: 'druse', zone: 'crystals', x: 214, z: 100, r: 3, name: 'Поющая друза', desc: 'Кристалл в два роста, тихо звенит; бирюзовый свет на 12 м.' },
  { id: 'heap', zone: 'mine', x: 200, z: 154, r: 4, name: 'Рудный отвал', desc: 'Гора пустой породы с брошенной вагонеткой наверху.' },
  { id: 'brewery', zone: 'jam', x: 62, z: 218, r: 10, name: 'Бродильня', desc: 'Шесть бродильных чанов 3×2 в старых кирпичных сводах — Барон занял дальние погреба.' },
];
const arenas = [
  { id: 'well_hall', x: 120, z: 120, r: 18, name: 'Зал Колодца' },
  { id: 'ring_in', x: 52, z: 84, r: 10.5, name: 'Внутри Ведьмина круга' },
  { id: 'glade', x: 24, z: 118, r: 15, name: 'Моховая поляна' },
  { id: 'lake_shore', x: 180, z: 54, r: 19, name: 'Берег озера (вокруг воды)' },
  { id: 'kopyor_yard', x: 168, z: 194, r: 13, name: 'Двор копра' },
  { id: 'dais', x: 0, z: 180, r: 16, name: 'Помост Котла' },
  { id: 'cellar_field', x: 150, z: 102, r: 13, name: 'Пустой погреб' },
  { id: 'mine_field', x: 120, z: 228, r: 14, name: 'Старый забой' },
];
const ROAD_X = 120;            // «Винный тракт» с севера на юг — замыкается кольцом
const RAIL_Z = 204;            // рельсовое кольцо с запада на восток
const VEIN_C = 60;             // Жила-компас: x − z ≡ 60 (mod 240), через Котёл (0; 180)
const veinDist = (x, z) => Math.min(...[-1, 0, 1].map((k) => Math.abs(x - z - VEIN_C - k * L))) / Math.SQRT2;
const avenues = [
  { id: 'road', name: 'Винный тракт', kind: 'road', width: 7, line: [[ROAD_X, 0], [ROAD_X, L]], note: 'мощёная дорога с севера на юг; на торе — замкнутое кольцо 240 м через Зал Колодца' },
  { id: 'rails', name: 'Рельсовое кольцо', kind: 'rails', width: 5, line: [[0, RAIL_Z], [L, RAIL_Z]], note: 'рельсы с запада на восток; кольцо 240 м через шахту и жилы; ответвление к Копру' },
  { id: 'rail_spur', name: 'Ветка к Копру', kind: 'rails', width: 5, line: [[168, RAIL_Z], [168, 200]] },
  { id: 'vein', name: 'Жила-компас', kind: 'vein', width: 1.2, line: [[VEIN_C, 0], [L, L - VEIN_C], [0, L - VEIN_C], [VEIN_C, L]], note: 'светящаяся трещина x − z ≡ 60: всегда идёт по диагонали «↘», петля 339 м, проходит через Котёл (0; 180). Без коллизии.' },
];

// ---------- опасности
const hazards = [];
const hz = (o) => hazards.push(o);
hz({ t: 'c', kind: 'pit', x: 180, z: 54, r: 11, name: 'Глубокое озеро', blocks: 'walk' });
hz({ t: 'c', kind: 'water', x: 180, z: 54, r: 15, name: 'Мелководье озера', note: 'кольцо 11–15 м' });
hz({ t: 'c', kind: 'pit', x: 168, z: 194, r: 4.5, name: 'Ствол шахты под копром', blocks: 'walk' });
for (const a of [45, 135, 225, 315]) { // реки варенья от Котла
  const t = a * Math.PI / 180;
  hz({ t: 's', kind: 'jam', x0: r1(Math.cos(t) * 6), z0: r1(180 + Math.sin(t) * 6), x1: r1(Math.cos(t) * 24), z1: r1(180 + Math.sin(t) * 24), r: 1.5, name: 'Река варенья' });
}

// ---------- твёрдые: ручные ансамбли
const obstacles = [];
const C = (x, z, r, kind, extra = {}) => ({ t: 'c', x: r1(mod(x)), z: r1(mod(z)), r, kind, ...extra });
const Sg = (x0, z0, x1, z1, r, kind, extra = {}) => ({ t: 's', x0: r1(x0), z0: r1(z0), x1: r1(x1), z1: r1(z1), r, kind, ...extra });
const fixed = [];
// лестница с площади: уходит в потолок к северу от центра зала
fixed.push(Sg(101, 120, 107, 120, 2.2, 'stairs', { h: 6, note: 'лестница вверх, на площадь' }));
// Ведьмин круг: 12 светящихся грибов R 12.5
for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2 + 0.13; fixed.push(C(52 + Math.cos(t) * 12.5, 84 + Math.sin(t) * 12.5, 1.0, 'ring_mushroom')); }
// Винная галерея: 4 стеллажа с севера на юг, 14 м, шаг 6 м
for (let i = 0; i < 4; i++) fixed.push(Sg(73 + i * 6, 121, 73 + i * 6, 135, 0.5, 'wine_rack', { h: 2.1 }));
fixed.push(C(146, 150, 3.2, 'giant_barrel', { h: 4 }));
fixed.push(C(22, 48, 2.2, 'patriarch_stem', { h: 6, cap: 7 }));
fixed.push(C(214, 100, 2.6, 'druse', { h: 4 }));
fixed.push(C(200, 154, 4, 'ore_heap', { h: 3 }));
fixed.push(C(0, 180, 4, 'cauldron', { h: 3.5 }));
for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) fixed.push(C(55 + i * 7, 214 + j * 8, 1.6, 'vat', { h: 2.6 }));
// колоннады проклятых сундуков: 12 колонн R 13, зазор 4,5 м
const chests = [
  { id: 'chest_k', zone: 'crystals', x: 140, z: 22, name: 'Зеркальный зал' },
  { id: 'chest_s', zone: 'mine', x: 200, z: 176, name: 'Забытый забой' },
  { id: 'chest_j', zone: 'jam', x: 40, z: 178, name: 'Сироп-зал' },
];
for (const ch of chests) for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2; fixed.push(C(ch.x + Math.cos(t) * 13, ch.z + Math.sin(t) * 13, 1.1, 'chest_column', { h: 3 })); }
// своды погребов: 4 зала с сеткой кирпичных колонн 3×3, шаг 7 м
for (const [vx, vz] of [[100, 66], [160, 130], [78, 160]]) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) fixed.push(C(vx + i * 7, vz + j * 7, 0.8, 'brick_pillar', { h: 3.2, group: 'vault' }));
// шахтные штреки: ряды крепи парами вдоль направления, шаг 6 м, ширина прохода 4,4 м
for (const [gx, gz, ang] of [[196, 214, 0.3], [150, 232, 0]]) for (let k = -2; k <= 2; k++) for (const s of [-1, 1]) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  fixed.push(C(gx + ca * k * 6 - sa * s * 2.6, gz + sa * k * 6 + ca * s * 2.6, 0.4, 'timber_support', { h: 2.6, group: 'drift' }));
}
for (const o of fixed) { o.zone = zoneAt(o.t === 'c' ? o.x : (o.x0 + o.x1) / 2, o.t === 'c' ? o.z : (o.z0 + o.z1) / 2); obstacles.push(o); }

// ---------- постройки (базовые)
const altars = [
  { id: 'altar_c', zone: 'cellars', x: 98, z: 92 }, { id: 'altar_m', zone: 'mushrooms', x: 38, z: 64 },
  { id: 'altar_k', zone: 'crystals', x: 196, z: 20 }, { id: 'altar_s', zone: 'mine', x: 140, z: 178 },
  { id: 'altar_j', zone: 'jam', x: 220, z: 214 },
];
const springs = [
  { id: 'spring_m', zone: 'mushrooms', x: 28, z: 40 }, { id: 'spring_k', zone: 'crystals', x: 200, z: 110 }, { id: 'spring_s', zone: 'mine', x: 150, z: 215 },
];
// ---------- предложения (места)
const lifts = [{ id: 'lift_s', x: 156, z: 184 }, { id: 'lift_m', x: 16, z: 100 }, { id: 'lift_k', x: 150, z: 72 }];
const bells = [{ id: 'bell_c', x: 146, z: 92 }, { id: 'bell_m', x: 30, z: 150 }, { id: 'bell_s', x: 190, z: 140 }];
const forges = [{ id: 'forge_s', x: 120, z: 210 }, { id: 'forge_c', x: 136, z: 162 }];
const station = { x: 168, z: RAIL_Z, name: 'Станция у Копра' };

// ---------- что держать свободным
const keepClear = [];
for (const a of arenas) keepClear.push({ x: a.x, z: a.z, r: a.r + 1.5 });
for (const b of [...altars, ...springs]) keepClear.push({ x: b.x, z: b.z, r: 6 });
for (const b of [...lifts, ...bells, ...forges]) keepClear.push({ x: b.x, z: b.z, r: 4.5 });
for (const ch of chests) keepClear.push({ x: ch.x, z: ch.z, r: 11 });
function clearOK(o, extra = 0) {
  const [x0, z0, x1, z1] = bbox(o); const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const k of keepClear) if (shapeDistPt(o, k.x, k.z) < k.r + extra) return false;
  // тракты
  const half = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) / 2;
  if (Math.abs(wrap(cx - ROAD_X)) < 3.5 + half) return false;
  if (Math.abs(wrap(cz - RAIL_Z)) < 2.5 + half) return false;
  if (Math.abs(wrap(cx - 168)) < 2.5 + half && wrap(cz - 200) > -6 && wrap(cz - 200) < 8) return false;
  if (veinDist(cx, cz) < 1.5 + half) return false;
  for (const h of hazards) { const g = shapeGap(o, h); if (g < (h.kind === 'pit' ? 3.6 : 1.0)) return false; }
  return true;
}
const MIN_GAP = 3.6;
function fits(o) {
  if (!clearOK(o)) return false;
  for (const p of obstacles) if (shapeGap(o, p) < MIN_GAP) return false;
  return true;
}

// ---------- наборы для россыпи (на 1000 м² зоны)
const KITS = {
  cellars: { density: 12, items: [['brick_pillar', 'c', 0.8, 0.8, 3.2, 4], ['barrel_stack', 'c', 1.0, 1.3, 1.6, 4], ['rubble', 'c', 1.2, 1.6, 1.0, 1.5], ['wine_rack', 's', 0.5, 0.5, 2.1, 1.5, 6, 9], ['crate_stack', 'c', 0.8, 1.0, 1.5, 1.5]] },
  mushrooms: { density: 10, items: [['mushroom_big', 'c', 0.9, 1.8, 2.8, 5], ['puffball', 'c', 0.8, 1.1, 1.2, 2], ['root_ridge', 's', 0.6, 0.6, 1.2, 1.5, 5, 9], ['stalagmite', 'c', 0.5, 0.8, 2.2, 1]] },
  crystals: { density: 9, items: [['crystal_cluster', 'c', 0.7, 1.6, 2.4, 5], ['stalagmite', 'c', 0.5, 0.8, 2.2, 3], ['rock_ridge', 's', 0.9, 1.1, 2.0, 1, 6, 10]] },
  mine: { density: 9, items: [['timber_support', 'c', 0.4, 0.45, 2.6, 3], ['ore_pile', 'c', 1.2, 1.6, 1.4, 2.5], ['rock_ridge', 's', 0.9, 1.1, 2.0, 2, 8, 14], ['cart_wreck', 'c', 1.0, 1.0, 1.4, 1]] },
  jam: { density: 9.5, items: [['vat', 'c', 1.4, 1.7, 2.6, 2], ['rock_ridge', 's', 0.9, 1.1, 2.0, 2, 6, 12], ['stalagmite', 'c', 0.5, 0.8, 2.2, 3], ['jam_rock', 'c', 1.0, 1.5, 1.6, 2]] },
};
function pickItem(kit) {
  const tot = kit.items.reduce((s, it) => s + it[5], 0); let v = rnd() * tot;
  for (const it of kit.items) { v -= it[5]; if (v <= 0) return it; }
  return kit.items[0];
}
// опасности-россыпь: провалы в шахте, лужи в гроте, варенье в жилах
const HZ_SCATTER = { mine: ['pit', 6, 2.0, 3.5], crystals: ['water', 9, 3, 6], jam: ['jam', 9, 2.5, 5] };
for (const [zid, [kind, n, ra, rb]] of Object.entries(HZ_SCATTER)) {
  let placed = 0, tries = 0;
  while (placed < n && tries < 4000) {
    tries++; const x = rnd() * L, z = rnd() * L; if (zoneAt(x, z) !== zid || boundaryDist(x, z) < 8) continue;
    const h = { t: 'c', kind, x: r1(x), z: r1(z), r: r1(rr(ra, rb)), name: { pit: 'Провал', water: 'Мелкая лужа', jam: 'Лужа варенья' }[kind] };
    if (keepClear.some((k) => d2(k.x, k.z, h.x, h.z) < k.r + h.r + 2)) continue;
    if (hazards.some((o) => shapeGap(h, o) < 8)) continue;
    if (Math.abs(wrap(h.x - ROAD_X)) < 4 + h.r || Math.abs(wrap(h.z - RAIL_Z)) < 3 + h.r || veinDist(h.x, h.z) < 2 + h.r) continue;
    if (obstacles.some((o) => shapeGap(h, o) < 3.6)) continue;
    hazards.push(h); placed++;
  }
}
// опорные скалы — крупные массы (срезаны на 3 м), по 3 на зону
for (const zid of Object.keys(KITS)) { let n = 0, tries = 0;
  while (n < 3 && tries < 20000) { tries++; const x = rnd() * L, z = rnd() * L; if (zoneAt(x, z) !== zid || boundaryDist(x, z) < 10) continue;
    const o = C(x, z, r1(rr(4.5, 7)), 'rock_mass', { h: 3, zone: zid });
    if (!clearOK(o, 4)) continue; if (obstacles.some((p) => shapeGap(o, p) < 9)) continue; if (hazards.some((h) => shapeGap(o, h) < 9)) continue;
    obstacles.push(o); n++; } }
// россыпь твёрдых
const zoneArea = Object.fromEntries(zones.map((z) => [z.id, z.area]));
for (const zid of Object.keys(KITS)) {
  const kit = KITS[zid]; const target = Math.round(kit.density * zoneArea[zid] / 1000);
  let have = obstacles.filter((o) => o.zone === zid).length, tries = 0;
  while (have < target && tries < 60000) {
    tries++;
    const x = rnd() * L, z = rnd() * L; let zz = zoneAt(x, z);
    // полоса перехода ±6 м: предмет берём из набора любой из соседних зон
    let useKit = kit; if (zz !== zid) continue;
    if (boundaryDist(x, z) < 6 && rnd() < 0.5) {
      const near = SEEDS.map((q) => ({ q, d: d2(x, z, q.x, q.z) ** 2 - q.w })).sort((a, b) => a.d - b.d)[1].q.id; useKit = KITS[near];
    }
    const it = pickItem(useKit); const [kind, shape, ra, rb, h] = it; const r = r1(rr(ra, rb));
    let o;
    if (shape === 'c') o = C(x, z, r, kind, { h });
    else {
      const len = rr(it[6], it[7]); const ang = kind === 'wine_rack' ? (rnd() < 0.5 ? 0 : Math.PI / 2) : rnd() * Math.PI;
      o = Sg(x - Math.cos(ang) * len / 2, z - Math.sin(ang) * len / 2, x + Math.cos(ang) * len / 2, z + Math.sin(ang) * len / 2, r, kind, { h });
    }
    o.zone = zid;
    if (!fits(o)) continue;
    obstacles.push(o); have++;
  }
}
// ---------- жаровни: россыпь мест, шаг ≥ 18 м
const braziers = []; { let tries = 0;
  while (tries < 40000) {
    tries++; const x = rnd() * L, z = rnd() * L;
    if (d2(x, z, 120, 120) < 9) continue;
    if (braziers.some((b) => d2(b.x, b.z, x, z) < 18)) continue;
    if (obstacles.some((o) => shapeDistPt(o, x, z) < 2.5)) continue;
    if (hazards.some((h) => shapeDistPt(h, x, z) < 1.5)) continue;
    if ([...altars, ...springs, ...chests].some((b) => d2(b.x, b.z, x, z) < 7)) continue;
    braziers.push({ x: r1(x), z: r1(z), zone: zoneAt(x, z) });
  } }
// ---------- предложения-россыпи
function scatter(n, zonesOk, minD, clearR, extraOk = () => true) {
  const out = []; let tries = 0;
  while (out.length < n && tries < 30000) {
    tries++; const x = rnd() * L, z = rnd() * L; if (!zonesOk.includes(zoneAt(x, z))) continue;
    if (out.some((p) => d2(p.x, p.z, x, z) < minD)) continue;
    if (obstacles.some((o) => shapeDistPt(o, x, z) < clearR)) continue;
    if (hazards.some((h) => shapeDistPt(h, x, z) < clearR)) continue;
    if (braziers.some((b) => d2(b.x, b.z, x, z) < 4)) continue;
    if (!extraOk(x, z)) continue;
    out.push({ x: r1(x), z: r1(z), zone: zoneAt(x, z) });
  }
  return out;
}
const kegs = scatter(12, ['mine', 'cellars', 'jam'], 26, 3.5, (x, z) => d2(x, z, 120, 120) > 30);
const trampolines = scatter(8, ['mushrooms'], 20, 3.5);
const traps = scatter(10, ['cellars', 'mine'], 18, 2.5, (x, z) => d2(x, z, 120, 120) > 24);
// фонари-маяки: решётка 60 м со сдвигом, ближайшее свободное место
const lanterns = [];
for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
  const bx = 30 + i * 60, bz = 30 + j * 60; let best = null;
  for (let k = 0; k < 400 && !best; k++) {
    const rad = k * 0.08, a = k * 2.4; const x = mod(bx + Math.cos(a) * rad), z = mod(bz + Math.sin(a) * rad);
    if (obstacles.some((o) => shapeDistPt(o, x, z) < 2.5) || hazards.some((h) => shapeDistPt(h, x, z) < 2)) continue;
    if (braziers.some((b) => d2(b.x, b.z, x, z) < 4)) continue;
    best = { x: r1(x), z: r1(z), zone: zoneAt(x, z) };
  }
  lanterns.push(best);
}

// ---------- проверка проходимости: сетка 1 м, BFS на торе (герой r 0.45 и элита r 1.2)
function reach(radius) {
  const N = L, walk = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i + 0.5, z = j + 0.5; let ok = 1;
    for (const h of hazards) if (h.kind === 'pit' && shapeDistPt(h, x, z) < radius) { ok = 0; break; }
    if (ok) for (const o of obstacles) { const [x0, z0, x1, z1] = bbox(o); if (Math.abs(wrap(x - (x0 + x1) / 2)) > (x1 - x0) / 2 + radius + 1 || Math.abs(wrap(z - (z0 + z1) / 2)) > (z1 - z0) / 2 + radius + 1) continue; if (shapeDistPt(o, x, z) < radius) { ok = 0; break; } }
    walk[j * N + i] = ok;
  }
  const seen = new Uint8Array(N * N); const q = [120 * N + 120]; seen[q[0]] = 1; let n = 0;
  while (q.length) { const c = q.pop(); n++; const i = c % N, j = (c / N) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = (i + di + N) % N, nj = (j + dj + N) % N, k = nj * N + ni; if (walk[k] && !seen[k]) { seen[k] = 1; q.push(k); } } }
  let tot = 0; for (let k = 0; k < N * N; k++) tot += walk[k];
  return { walkable: tot, reached: n, trapped: tot - n, walkPct: r1(100 * tot / (N * N)) };
}
const reachHero = reach(0.45), reachElite = reach(1.2);

// ---------- статистика
let collArea = 0;
for (const o of obstacles) collArea += o.t === 'c' ? Math.PI * o.r * o.r : 2 * o.r * Math.hypot(o.x1 - o.x0, o.z1 - o.z0) + Math.PI * o.r * o.r;
let pitArea = 0; for (const h of hazards) if (h.kind === 'pit') pitArea += Math.PI * h.r * h.r;
let minGap = 1e9; for (let i = 0; i < obstacles.length; i++) for (let j = i + 1; j < obstacles.length; j++) { const a = obstacles[i], b = obstacles[j]; if (d2((bbox(a)[0] + bbox(a)[2]) / 2, (bbox(a)[1] + bbox(a)[3]) / 2, (bbox(b)[0] + bbox(b)[2]) / 2, (bbox(b)[1] + bbox(b)[3]) / 2) > 30) continue; minGap = Math.min(minGap, shapeGap(a, b)); }
const perChunk = new Array(100).fill(0); for (const o of obstacles) { const [x0, z0, x1, z1] = bbox(o); perChunk[Math.floor(mod((z0 + z1) / 2) / CHUNK) * 10 + Math.floor(mod((x0 + x1) / 2) / CHUNK)]++; }
const byKind = {}; for (const o of obstacles) byKind[o.kind] = (byKind[o.kind] || 0) + 1;
const byZone = {}; for (const o of obstacles) byZone[o.zone] = (byZone[o.zone] || 0) + 1;
const hzCount = {}; for (const h of hazards) hzCount[h.kind] = (hzCount[h.kind] || 0) + 1;
const pair = (arr) => { let m = 1e9; for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) m = Math.min(m, d2(arr[i].x, arr[i].z, arr[j].x, arr[j].z)); return Math.round(m); };
const stats = {
  obstacles: obstacles.length, byZone, byKind, hazards: hzCount, braziers: braziers.length,
  colliderCoverPct: r1(100 * collArea / (L * L)), pitCoverPct: r1(100 * pitArea / (L * L)),
  minGapBetweenColliders: r1(minGap), perChunk: { min: Math.min(...perChunk), max: Math.max(...perChunk), avg: r1(obstacles.length / 100) },
  reachHero, reachElite,
  minDistance: { altars: pair(altars), springs: pair(springs), chests: pair(chests), lifts: pair(lifts) },
};
console.log(JSON.stringify(stats, null, 1));
// конфликты ручных ансамблей
const selfClear = new Set();
for (const o of fixed) { const saved = keepClear.slice(); 
  const own = keepClear.filter((k) => shapeDistPt(o, k.x, k.z) < k.r && (o.kind === 'chest_column' || o.kind === 'ring_mushroom' || o.kind === 'stairs' || ['cauldron','wine_rack'].includes(o.kind)));
  for (const k of own) keepClear.splice(keepClear.indexOf(k), 1);
  if (!clearOK(o)) console.log('CONFLICT clear', o.kind, o.x ?? o.x0, o.z ?? o.z0);
  keepClear.length = 0; keepClear.push(...saved); }
for (let i = 0; i < obstacles.length; i++) for (let j = i + 1; j < obstacles.length; j++) { const g = shapeGap(obstacles[i], obstacles[j]); if (g < 3.55) console.log('CONFLICT gap', g.toFixed(2), obstacles[i].kind, obstacles[j].kind, obstacles[i].x ?? obstacles[i].x0, obstacles[i].z ?? obstacles[i].z0); }

// ---------- вход на площади (координаты площади: x — восток, z — юг)
const CAVE = { x: -18.4, z: 11.6 };
const dir = [18.4, -5.6]; const dl = Math.hypot(...dir); const ux = dir[0] / dl, uz = dir[1] / dl;
const mouth = { x: r1(CAVE.x + ux * 2.9), z: r1(CAVE.z + uz * 2.9) };
const yawOut = Math.round(Math.atan2(-ux, -uz) * 1000) / 1000; // yaw = 0 смотрит в −Z
const plaza = {
  note: 'Координаты площади (shared/maps/lobby.ts): x — восток, z — юг, yaw = 0 смотрит на север (−Z). Место — западная лужайка между путём к аквапарку и путём к маяку.',
  cave: {
    center: CAVE, footprint: { shape: 'скала-овал', sizeX: 5.6, sizeZ: 5.4, height: 3.8, crestHeight: 4.6 },
    colliders: [{ min: [-21.2, 0, 9.4], max: [-15.8, 3.8, 13.8] }, { min: [-20.6, 0, 8.8], max: [-16.4, 3.0, 14.4] }],
    mouth: { ...mouth, width: 2.6, height: 2.5, facesToward: { x: 0, z: 6 }, yaw: yawOut },
    interact: { kind: 'survivors', x: r1(mouth.x + ux * 1.0), z: r1(mouth.z + uz * 1.0), r: 1.8, yaw: r1(yawOut + Math.PI), label: 'Подземелье' },
    returnSpawn: { x: r1(mouth.x + ux * 2.6), z: r1(mouth.z + uz * 2.6), yaw: yawOut },
  },
  recordsBoard: { x: -15.6, z: 13.9, yaw: Math.round(Math.atan2(-(15.6), -(6 - 13.9)) * 1000) / 1000, width: 2.4, height: 1.8, bottomY: 1.0, posts: [{ x: -16.7, z: 14.4 }, { x: -14.5, z: 13.4 }], columns: ['Всё время', 'Неделя'], rows: 5 },
  tout: { x: -13.4, z: 12.9, name: 'Шахтёр Шура', hat: 'helmet' },
  signpostArrow: { label: 'ПОДЗЕМЕЛЬЕ', x: -15.6, z: 10.8 },
  checks: [
    'до кадки (−24; 15): 2,0 м от скалы — проход к маяку не нужен, обход с юга свободен',
    'до фонаря (−14; 16): 2,6 м от доски рекордов',
    'путь «точка появления (0; 6) → аквапарк (−31; 9)» идёт севернее скалы (z ≈ 6–8), мимо входа',
    'путь к мосткам маяка (x −21…−17, z 22) идёт южнее скалы (z > 14,4)',
    'до батута (−8,15; 5,63): 7,6 м; до лодки «Рыбного двора» (−8,1; 12,6): 5 м от точки возврата',
    'место памятника (−23,6; 19,2) не занято: 7,7 м до скалы',
  ],
};

// ---------- запись JSON
const data = {
  version: 1,
  about: 'Левел-дизайн режима «Подземелье» (docs/survivors/level.md). Карта — тор: все координаты по модулю L, расстояния — через wrap(d) = d − L·round(d/L). x — восток, z — юг, y — вверх, метры. t: "c" — круг (x, z, r), "s" — капсула-отрезок (x0, z0, x1, z1, r). Сгенерировано скриптом с фиксированным зерном; ручные ансамбли — в fixed-видах.',
  map: { L, chunk: CHUNK, chunksPerSide: L / CHUNK, heroSpawn: { x: 120, z: 120 }, floorY: 0, ceilingHint: 'потолка не рисуем: камера сверху; стены пещеры только как препятствия' },
  camera: {
    type: 'perspective', vFovDeg: 36, pitchDeg: 62, distance: 31, lookAtOffsetZ: 2.0, height: 27.4, horizontalBack: 14.6,
    visibleAtHeroLine16x9: { width: 35.8, ahead: 11.8, behind: 11.7, pxPerMeter1080p: 53.6 },
    groundCornersFromHero: { topLeft: [-21.6, -11.8], topRight: [21.6, -11.8], bottomLeft: [-15.3, 11.7], bottomRight: [15.3, 11.7] },
    aspectRule: 'шире 16:9 — горизонтальный угол не растёт (поля по бокам темнеют виньеткой); уже 16:9 — растёт вертикальный',
    near: 5, far: 90, zoom: 'фиксированный (честный рекорд); на босса — плавно +8 % дальше',
  },
  spawnRing: { rule: 'многоугольник видимости (4 угла проекции экрана на пол) + полоса 4–9 м наружу', inner: 4, outer: 9, nearestFromHero: 15.7, farthestFromHero: 33.6, aheadBias: 0.55, aheadConeDeg: 120, recycleDistance: 48, recycleTo: 'кольцо по ходу движения героя', retries: 6, notInside: ['collider', 'pit', 'buildingSafe'] },
  zones: zones.map(({ id, name, color, mood, seed, weight, area, polygon }) => ({ id, name, color, mood, seed, weight, areaM2: area, polygon })),
  transitions: { blendBand: 12, propMixBand: 6, rule: 'граница зон — шумная полоса 12 м: цвет пола плавно смешивается, предметы обеих зон вперемешку; на трактах — «ворота» перехода' },
  avenues, arenas, landmarks, hazards, obstacles,
  buildings: {
    altar: altars, spring: springs, cursedChest: chests.map((c) => ({ ...c, colonnade: { r: 13, columns: 12, columnR: 1.1, gap: 4.5 } })),
    brazier: braziers,
  },
  proposals: {
    lantern: lanterns, minecart: { rails: [[0, RAIL_Z], [L, RAIL_Z]], spur: [[168, RAIL_Z], [168, 200]], station, carts: 2 },
    bell: bells, powderKegs: kegs.map((k) => ({ ...k, count: 4 })), mushroomTrampoline: trampolines, traps: traps.map((t) => ({ ...t, count: 3 })), lift: lifts, forge: forges,
  },
  plaza,
  stats,
};
fs.writeFileSync(`${OUT}/level-data.json`, JSON.stringify(data, null, 1).replace(/\n\s+(-?[\d.]+,?)(?=\n)/g, ' $1').replace(/\[\n\s+(-?[\d.]+), (-?[\d.]+)\n\s+\]/g, '[$1, $2]'));
console.log('ok', fs.statSync(`${OUT}/level-data.json`).size);
