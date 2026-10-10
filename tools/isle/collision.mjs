// Коллизия острова «Последний свет» из его GLB: невидимые полы (сетка 1 м, склеенная в прямоугольники), стены по краю
// суши, где ходить нельзя, и твёрдые дома/маяк. Пишет shared/maps/isleboxes.ts (координаты острова u, h, v: от центра,
// вода — h 0). Запуск: node tools/isle/collision.mjs — после правки моделей острова (client/assets/isle/).
// Ходят: причал (площадка, мостки, понтон), улица (плато деревни и пляж к молу), крыльцо Игната, лестница к маяку и его
// площадка (+16 м), мол. Остальное — стены; со стороны воды стен нет: упал — выныриваешь на причале (shared/maps/isle.ts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DIR = path.join(ROOT, 'client/assets/isle');
const OUT = path.join(ROOT, 'shared/maps/isleboxes.ts');

const loader = new GLTFLoader();
async function load(f) {
  const buf = fs.readFileSync(path.join(DIR, f));
  const g = await new Promise((res, rej) => loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
  g.scene.updateMatrixWorld(true);
  return g.scene;
}

/** Поверхности по сетке 2 м: треугольники нужных мешей */
function surfaces(scenes, pick) {
  const C = 2, grid = new Map();
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (const sc of scenes) sc.traverse((o) => {
    if (!o.isMesh || !pick(o.name)) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(o.matrixWorld);
      const t = [v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z];
      const x0 = Math.floor(Math.min(t[0], t[3], t[6]) / C), x1 = Math.floor(Math.max(t[0], t[3], t[6]) / C);
      const z0 = Math.floor(Math.min(t[2], t[5], t[8]) / C), z1 = Math.floor(Math.max(t[2], t[5], t[8]) / C);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const key = x + ',' + z; (grid.get(key) ?? grid.set(key, []).get(key)).push(t); }
    }
  });
  /** Высоты поверхностей в точке (по возрастанию) */
  return (u, w) => {
    const out = [];
    for (const t of grid.get(Math.floor(u / C) + ',' + Math.floor(w / C)) ?? []) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((bz - cz) * (u - cx) + (cx - bx) * (w - cz)) / d;
      const l2 = ((cz - az) * (u - cx) + (ax - cx) * (w - cz)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      out.push(l1 * ay + l2 * by + l3 * cy);
    }
    return out.sort((a, b) => a - b);
  };
}

const terrainScene = await load('island-terrain.glb');
const pierScene = await load('pier-breakwater.glb');
const lightScene = await load('lighthouse.glb');
const terrain = surfaces([terrainScene], (n) => n === 'terrain');
const mole = surfaces([pierScene], (n) => n === 'breakwater_1');
const stairs = surfaces([lightScene], (n) => n === 'lighthouse_stairs');
const top = (f, u, w) => { const h = f(u, w); return h.length ? h[h.length - 1] : -Infinity; };
/** Самая высокая точка поверхности в клетке (центр и углы чуть внутри) */
const cellTop = (f, u, w) => Math.max(...[[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].map(([a, b]) => top(f, u + a, w + b)));

// DUMP=u0,u1,v0,v1 — только напечатать высоты земли (для подбора ступеней)
if (process.env.DUMP) {
  const [a, b, c, d] = process.env.DUMP.split(',').map(Number);
  for (let w = c; w < d; w++) { let row = String(w).padStart(4); for (let u = a; u < b; u++) row += ' ' + top(process.env.DUMP_STAIRS ? stairs : terrain, u + 0.5, w + 0.5).toFixed(1).padStart(4); console.log(row); }
  process.exit(0);
}

// ---------------------------------------------------------------- сетка 1 м
const U0 = -10, U1 = 130, V0 = -80, V1 = 45;
const W = U1 - U0, H = V1 - V0;
const cellH = new Float64Array(W * H).fill(NaN);
const at = (u, w) => (w - V0) * W + (u - U0);
const inR = (u, w, [u0, u1, w0, w1]) => u >= u0 && u + 1 <= u1 && w >= w0 && w + 1 <= w1;
const STEP = Number(process.env.STEP ?? 2);
const Q = Number(process.env.Q ?? 0.25);
const q = (h, s) => Math.ceil(h / s - 1e-6) * s;

/** Улица: плато деревни (до забора завода и подножия холма) и пляж к молу — по земле, ступенями по 0,3 м */
const STREET = [[5, 54, -30, -11], [5, 58, -24, -5], [5, 40, -5, 17], [40, 55, -5, 33.5], [40, 49, 33, 37]];
/** Площадка маяка: по земле (+16 м) */
const LIGHT = [61, 90, -67, -49.5];
for (let w = V0; w < V1; w++) for (let u = U0; u < U1; u++) {
  if (STREET.some((r) => inR(u, w, r))) {
    const c = top(terrain, u + 0.5, w + 0.5);
    // ступени по Q (0,25 м) на квадратах STEP × STEP (2 × 2 м): меньше коробок, нога над травой не выше ~0,3 м, а соседние
    // квадраты на склоне к пляжу — не выше шага (0,52 м)
    const bu = u - ((u % STEP) + STEP) % STEP, bw = w - ((w % STEP) + STEP) % STEP;
    if (c >= 0.15) cellH[at(u, w)] = q(Math.max(...[0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].map((j) => top(terrain, bu + (i + 0.5) * STEP / 4, bw + (j + 0.5) * STEP / 4)))), Q);
  }
  if (inR(u, w, LIGHT)) {
    const c = top(terrain, u + 0.5, w + 0.5);
    if (c >= 15.5) cellH[at(u, w)] = 16;
  }
  // мол: верх камня 2,28 (места рыбалки — fish_0…7)
  const m = top(mole, u + 0.5, w + 0.5);
  if (m >= 2.1 && m <= 2.45 && w > 9) cellH[at(u, w)] = 2.28;
  // лестница к маяку: ступени поверх всего
  const s = stairs(u + 0.5, w + 0.5);
  if (s.length && w <= -20) cellH[at(u, w)] = q(Math.max(...[[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]].map(([a, b]) => { const h = stairs(u + a, w + b); return h.length ? h[h.length - 1] : -Infinity; })), 0.05);
}
// лестница: у края ступеней поверхность бывает только в одной клетке ряда — добираем соседей по ряду;
for (let w = -52; w <= -20; w++) {
  const row = [];
  for (let u = 50; u < 72; u++) if (stairs(u + 0.5, w + 0.5).length) row.push(u);
  if (!row.length) continue;
  const lo = Math.min(...row), hi = Math.max(...row);
  // ровный подъём (ступени в модели — по 0,15–0,2 м, а клетка в 1 м ловит и соседнюю): от улицы (2,25 у ряда −21) до площадки
  // маяка (16 у ряда −51) — по 0,46 м на ряд, шаг игрока 0,52
  const h = 2.25 + (-21 - w) * (16 - 2.25) / 30;
  // три клетки в ширину (лишняя — к востоку, куда лестница уходит вверх): соседние ряды сдвинуты на клетку, а между ними
  // должно оставаться 2 м прохода — игрок шириной 0,84 м не цепляется за углы
  for (let u = lo - (hi - lo < 1 ? 1 : 0); u <= hi + 1; u++) cellH[at(u, w)] = h;
}

// ---------------------------------------------------------------- вручную: причал и крыльцо (верх настила из модели)
const floors = [];
const fixed = [
  // площадка высадки у дома смотрителя
  [55, 61.3, -11.2, -5.8, 1.8],
  // мостки на сваях от площадки на восток и сходни вниз, к понтону
  [61.3, 69.5, -9.4, -6.6, 1.4], [69.5, 70.5, -9.4, -6.6, 1.05], [70.5, 71.5, -9.4, -6.6, 0.7],
  // понтон: шесть бертов по южному краю
  [71.5, 96.6, -10, -6.6, 0.4],
  // крыльцо Игната (дом — твёрдый, ниже)
  [53.4, 55.7, -19.4, -13.2, 2.6],
  // ступени на мол с пляжа (корень мола выше песка на 1,9 м)
  [48.6, 49.4, 33.6, 36.4, 0.85], [49.4, 50.2, 33.6, 36.4, 1.3], [50.2, 51, 33.6, 36.4, 1.8],
];
for (const [u0, u1, w0, w1, h] of fixed) {
  floors.push([u0, h - 3, w0, u1, h, w1]);
  // клетки под настилом — уже не «край суши» (стен у них не будет) и не улица: настил главнее земли под ним (центр клетки
  // на настиле — клетку убираем; по краю клетка земли остаётся: ступенька на настил)
  for (let w = Math.floor(w0); w < Math.ceil(w1); w++) for (let u = Math.floor(u0); u < Math.ceil(u1); u++) {
    const inside = u + 0.5 > u0 && u + 0.5 < u1 && w + 0.5 > w0 && w + 0.5 < w1;
    if (inside || Number.isNaN(cellH[at(u, w)])) cellH[at(u, w)] = -1e9;
  }
}

// ---------------------------------------------------------------- склейка клеток в прямоугольники
// жадно: из каждой свободной клетки — самый большой прямоугольник одной высоты (по строкам или по столбцам), крупные — первыми
const used = new Uint8Array(W * H);
const same = (u, w, h) => u < U1 && w < V1 && !used[at(u, w)] && cellH[at(u, w)] === h;
function grow(u, w, h, rowFirst) {
  if (rowFirst) {
    let u1 = u;
    while (same(u1 + 1, w, h)) u1++;
    let w1 = w;
    while (w1 + 1 < V1 && [...Array(u1 - u + 1).keys()].every((i) => same(u + i, w1 + 1, h))) w1++;
    return [u, w, u1, w1];
  }
  let w1 = w;
  while (same(u, w1 + 1, h)) w1++;
  let u1 = u;
  while (u1 + 1 < U1 && [...Array(w1 - w + 1).keys()].every((i) => same(u1 + 1, w + i, h))) u1++;
  return [u, w, u1, w1];
}
const cands = [];
for (let pass = 0; pass < 2; pass++) {
  // первый проход — только прямоугольники от 16 м², второй — всё, что осталось
  for (let w = V0; w < V1; w++) for (let u = U0; u < U1; u++) {
    const h = cellH[at(u, w)];
    if (Number.isNaN(h) || h < -1e8 || used[at(u, w)]) continue;
    const r1 = grow(u, w, h, true), r2 = grow(u, w, h, false);
    const area = (r) => (r[2] - r[0] + 1) * (r[3] - r[1] + 1);
    const r = area(r1) >= area(r2) ? r1 : r2;
    if (pass === 0 && area(r) < 16) continue;
    for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) used[at(x, y)] = 1;
    floors.push([r[0], Math.min(h - 3, -1), r[1], r[2] + 1, h, r[3] + 1]);
  }
}

// ---------------------------------------------------------------- стены: край пола там, где за ним суша (не вода)
const walkable = (u, w) => u >= U0 && u < U1 && w >= V0 && w < V1 && !Number.isNaN(cellH[at(u, w)]);
const land = (u, w) => top(terrain, u + 0.5, w + 0.5) > 0.2;
const T = 0.25;
const segs = [];
for (let w = V0; w < V1; w++) for (let u = U0; u < U1; u++) {
  if (!walkable(u, w)) continue;
  const h = cellH[at(u, w)];
  const lo = h < -1e8 ? 0 : h;
  for (const [du, dw] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nu = u + du, nw = w + dw;
    if (walkable(nu, nw) || !land(nu, nw)) continue;
    // стена во всю клетку соседа по краю (толщина T), от пола до +4 м
    segs.push({ axis: du !== 0 ? 'u' : 'v', side: du + dw, line: du !== 0 ? (du > 0 ? u + 1 : u) : (dw > 0 ? w + 1 : w), a: du !== 0 ? w : u, lo, hi: lo + 4 });
  }
}
// склеить соседние отрезки на одной линии
segs.sort((x, y) => (x.axis + x.side + x.line).localeCompare(y.axis + y.side + y.line) || x.line - y.line || x.a - y.a);
const walls = [];
for (const s of segs) {
  const last = walls[walls.length - 1];
  if (last && last.axis === s.axis && last.side === s.side && last.line === s.line && last.b === s.a && Math.abs(last.lo - s.lo) < 1.2) {
    last.b = s.a + 1; last.lo = Math.min(last.lo, s.lo); last.hi = Math.max(last.hi, s.hi);
  } else walls.push({ ...s, b: s.a + 1 });
}
const wallBoxes = walls.map((s) => {
  const t0 = s.side > 0 ? s.line : s.line - T, t1 = s.side > 0 ? s.line + T : s.line;
  return s.axis === 'u' ? [t0, s.lo - 1, s.a, t1, s.hi, s.b] : [s.a, s.lo - 1, t0, s.b, s.hi, t1];
});

// ---------------------------------------------------------------- твёрдое: дома, маяк, Игнат, грузы на площадке
const solids = [
  // дома деревни (по габаритам моделей) и дом смотрителя (без крыльца)
  [28.6, 35.4, -32.2, -23.1], [3.3, 13.3, -2, 6], [20.6, 29.4, -13.9, -4.6], [24.9, 34.5, 8.4, 15.6], [6.5, 18.4, -40.8, -28.8],
  [46.5, 53.4, -20.2, -12],
  // маяк: башня и пристройка с ревуном
  [71.6, 78.4, -63.4, -56.6], [77.6, 84.6, -59, -53],
  // Игнат на крыльце
  [54.1, 54.85, -16.8, -16],
  // бочки, ловушки и ящики на площадке высадки, табличка острова
  [55.1, 56.8, -11.1, -9.3], [55.4, 57.4, -7.2, -6], [58.2, 59.9, -7.1, -6.1], [59.6, 60.9, -12.2, -10.6],
];
const solidBoxes = solids.map(([u0, u1, w0, w1]) => [u0, -3, w0, u1, 30, w1]);

const r2 = (x) => Math.round(x * 100) / 100;
const fmt = (b) => `[${b.map(r2).join(', ')}]`;
const lines = [
  '// Сгенерировано tools/isle/collision.mjs из GLB острова — руками не править (запусти скрипт после правки моделей).',
  '// Коробки в координатах острова: [u0, h0, v0, u1, h1, v1] — метры от центра (u — восток, v — юг), h — от воды.',
  '',
  `/** Невидимые полы: причал, улица и пляж, крыльцо, мол, лестница и площадка маяка (${floors.length}) */`,
  `export const ISLE_FLOORS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [\n${floors.map((b) => '  ' + fmt(b)).join(',\n')},\n];`,
  '',
  `/** Стены по краю суши, где ходить нельзя (${wallBoxes.length}) */`,
  `export const ISLE_WALLS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [\n${wallBoxes.map((b) => '  ' + fmt(b)).join(',\n')},\n];`,
  '',
  `/** Твёрдое: дома, маяк, Игнат, грузы на площадке (${solidBoxes.length}) */`,
  `export const ISLE_SOLIDS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [\n${solidBoxes.map((b) => '  ' + fmt(b)).join(',\n')},\n];`,
  '',
];
fs.writeFileSync(OUT, lines.join('\n'));
console.log(`полов ${floors.length}, стен ${wallBoxes.length}, твёрдого ${solidBoxes.length} → ${path.relative(ROOT, OUT)}`);
