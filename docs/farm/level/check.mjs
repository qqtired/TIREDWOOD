#!/usr/bin/env node
// Ферма — раскладка локации и проверка чисел (описание — level.md рядом).
//   node docs/farm/level/check.mjs          — проверить layout.json
//   node docs/farm/level/check.mjs --write  — пересобрать layout.json и map.svg из параметров ниже, потом проверить
// Оси как в shared/maps/lobby.ts: x — восток, z — юг (север = −Z), метры. yaw = 0 смотрит на −Z; поворот — как
// rotation.y в three.js: мир = центр + (lx·cos yaw + lz·sin yaw, −lx·sin yaw + lz·cos yaw).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEG = Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;

// ------------------------------------------------------------------ параметры (меняешь — запускай с --write)
const CELL = 2; // 1 клетка = грядка 1,6 м + межа 0,4 м ≈ две желейки в ширину
const JELLY = { height: 1.58, radius: 0.525, half: 0.42 }; // client/render/outfit3d.ts (BODY_H, профиль), shared/constants.ts
const HALF = 36; // ферма — квадрат ±36 м
const WELL = { half: 1.15, h: 2.9, r: 1.1 };
const TROUGH = { r: 1.95, len: 1.8, wid: 0.6, h: 0.55, useR: 3.0, useRadius: 1.6 };
const D = 21; // от места у корыта до калитки любого участка
const BETA = 19; // шаг участков по дуге вокруг своего корыта, °
const PLOT = { w: 6, l: 10 };
const RING = { in: D - 2.2, out: D - 0.2 }; // дорожка-кольцо перед калитками: расстояние от места у своего корыта
const APRON_R = 4.5;
const SIDES = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];

// участок изнутри: начало — центр участка; −Z — от калитки вглубь, +Z — к калитке (к корыту); +X — правая рука входящего
const LOCAL = {
  frame: 'начало — центр участка; −Z — вглубь (от колодца), +Z — к калитке; +X — правая рука, если войти в калитку; в мир — как rotation.y = yaw участка',
  gate: { x: 0, z: 5, w: 1.2 },
  gatePosts: [[-0.65, 5], [0.65, 5]],
  path: { x0: -0.6, x1: 0.6, z0: -3.6, z1: 5 },
  beds: [
    { n: 1, x: 2, z: 4, level: 1 }, { n: 2, x: -2, z: 4, level: 2 },
    { n: 3, x: 2, z: 2, level: 4 }, { n: 4, x: -2, z: 2, level: 6 },
    { n: 5, x: 2, z: 0, level: 8 }, { n: 6, x: -2, z: 0, level: 10 },
    { n: 7, x: 2, z: -2, level: 11 }, { n: 8, x: -2, z: -2, level: 12 },
  ],
  bedSize: 1.6,
  pen: { x: -2, z: -4.05, w: 1.8, d: 1.5, level: 10, what: 'загон трюфельного свина' },
  compost: { x: 0, z: -4.2, w: 1.2, d: 1.0, level: 11, what: 'компостная куча (v10 — ур. 11, decisions — предварительно 12)' },
  hive: { x: 2, z: -4.2, w: 0.7, d: 0.7, level: 10, what: 'улей пчёл-опылителей' },
  sign: { x: -1.3, z: 5.4, w: 1.1, h: 0.55, y: 1.0, faces: '+Z (к колодцу)' },
  pennant: { x: 0.7, z: 5.0, y: 2.0 },
  use: { x: 0, z: 5.9, r: 1.6, what: 'E у калитки: занять свободный участок' },
  clickBed: { r: 6, what: 'ЛКМ по грядке с расстояния до 6 м или E по грядке перед собой до 2 м' },
};

// ------------------------------------------------------------------ геометрия
const dir = (a) => [Math.sin(a), -Math.cos(a)]; // a — от севера по часовой стрелке (к востоку)
const normYaw = (y) => {
  let v = (((y + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  if (v <= -Math.PI + 1e-9) v = Math.PI;
  return v;
};
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const toWorld = (o, lx, lz) => [o.x + lx * Math.cos(o.yaw) + lz * Math.sin(o.yaw), o.z - lx * Math.sin(o.yaw) + lz * Math.cos(o.yaw)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const rectPoly = (cx, cz, w, d, yaw = 0) =>
  [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => toWorld({ x: cx, z: cz, yaw }, x, z));
const boxPoly = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const circlePoly = (cx, cz, r, n = 20) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cz + r * Math.sin((i / n) * 2 * Math.PI)]);
const segPoly = (a, b, w) => {
  const len = dist(a, b);
  const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n = [-t[1] * (w / 2), t[0] * (w / 2)];
  return [[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]];
};
const roundPoly = (p) => p.map(([x, z]) => [r2(x), r2(z)]);

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(p, a, b) {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / (abx * abx + abz * abz || 1);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * abx, p[1] - a[1] - t * abz);
}
function segCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
/** Наименьший зазор между многоугольниками; 0 — пересекаются */
function polyGap(A, B) {
  if (A.some((p) => pointInPoly(p, B)) || B.some((p) => pointInPoly(p, A))) return 0;
  let m = Infinity;
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    const b = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const c = B[j];
      const d = B[(j + 1) % B.length];
      if (segCross(a, b, c, d)) return 0;
      m = Math.min(m, segDist(a, c, d), segDist(c, a, b));
    }
  }
  return m;
}
const samples = (poly, step = 0.25) => {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
};

// ------------------------------------------------------------------ сборка раскладки
function build() {
  const troughs = SIDES.map(([id, deg]) => {
    const a = deg * DEG;
    const [dx, dz] = dir(a);
    const tangentX = deg % 180 === 0;
    const hx = (tangentX ? TROUGH.len : TROUGH.wid) / 2;
    const hz = (tangentX ? TROUGH.wid : TROUGH.len) / 2;
    const x = dx * TROUGH.r;
    const z = dz * TROUGH.r;
    return {
      id, x: r2(x), z: r2(z), w: r2(2 * hx), d: r2(2 * hz), h: TROUGH.h,
      box: { min: [r2(x - hx), 0, r2(z - hz)], max: [r2(x + hx), TROUGH.h, r2(z + hz)] },
      use: { x: r2(dx * TROUGH.useR), z: r2(dz * TROUGH.useR), yaw: r4(normYaw(Math.PI - a)), r: TROUGH.useRadius, what: 'E — набрать лейку (мини-игра у каждого своя, очереди нет)' },
    };
  });

  const plots = [];
  SIDES.forEach(([id, deg], k) => {
    const u = troughs[k].use;
    for (let j = -2; j <= 2; j++) {
      const a = (deg + j * BETA) * DEG;
      const d = dir(a);
      const gate = [u.x + d[0] * D, u.z + d[1] * D];
      const c = { x: gate[0] + (d[0] * PLOT.l) / 2, z: gate[1] + (d[1] * PLOT.l) / 2, yaw: normYaw(-a) };
      const w = (lx, lz) => roundPoly([toWorld(c, lx, lz)])[0];
      const n = plots.length + 1;
      plots.push({
        n, trough: id, angleDeg: r2(((deg + j * BETA) % 360 + 360) % 360),
        x: r2(c.x), z: r2(c.z), yaw: r4(c.yaw), w: PLOT.w, l: PLOT.l,
        gate: { x: r2(gate[0]), z: r2(gate[1]) },
        corners: [w(-PLOT.w / 2, PLOT.l / 2), w(PLOT.w / 2, PLOT.l / 2), w(PLOT.w / 2, -PLOT.l / 2), w(-PLOT.w / 2, -PLOT.l / 2)],
        use: { ...(() => { const [x, z] = w(LOCAL.use.x, LOCAL.use.z); return { x, z }; })(), yaw: r4(c.yaw), r: LOCAL.use.r },
        sign: { ...(() => { const [x, z] = w(LOCAL.sign.x, LOCAL.sign.z); return { x, z }; })(), yaw: r4(normYaw(c.yaw + Math.PI)) },
      });
    }
  });

  // --- общие предметы. foot — пятно на земле (для проверок и превью), solid — твёрдые боксы (AABB, как в shared/maps)
  const box = (id, x0, z0, x1, z1, h, extra = {}) => ({ id, min: [r2(x0), 0, r2(z0)], max: [r2(x1), h, r2(z1)], ...extra });
  const objects = [];
  const obj = (o) => objects.push(o);

  obj({
    id: 'well', name: 'Колодец', x: 0, z: 0, yaw: 0, foot: roundPoly(circlePoly(0, 0, WELL.r, 16)),
    solid: [box('well', -WELL.half, -WELL.half, WELL.half, WELL.half, WELL.h)],
    note: 'каменный сруб, крыша-домик на двух столбах, ворот с ведром; на коньке — флюгер-петушок (ориентир, видно отовсюду)',
  });
  for (const t of troughs) obj({ id: `trough${t.id}`, name: `Корыто ${t.id}`, x: t.x, z: t.z, yaw: 0, foot: roundPoly(boxPoly(t.box.min[0], t.box.min[2], t.box.max[0], t.box.max[2])), solid: [{ id: `trough${t.id}`, ...t.box }], use: t.use, onApron: true });

  // СВ — базар: Семечкин и Дядюшка Гриб рядом, между ними — доска заказов
  obj({
    id: 'semechkin', name: 'Семечкин — семена', x: 6.6, z: -11.0, yaw: Math.PI, npc: { x: 6.6, z: -11.4, yaw: Math.PI },
    foot: boxPoly(5.1, -11.9, 8.1, -10.1), solid: [box('semechkin', 5.1, -11.9, 8.1, -10.1, 2.6)],
    use: { x: 6.6, z: -9.3, yaw: 0, r: 1.8, what: 'E — купить и посадить семена' },
    note: 'лоток-тележка с мешками семян, вывеска-подсолнух 3,2 м; прилавок смотрит на юг, к колодцу',
  });
  obj({
    id: 'grib', name: 'Дядюшка Гриб — скупка', x: 11.0, z: -6.6, yaw: Math.PI / 2, npc: { x: 11.4, z: -6.6, yaw: Math.PI / 2 },
    foot: boxPoly(10.1, -8.1, 11.9, -5.1), solid: [box('grib', 10.1, -8.1, 11.9, -5.1, 2.6)],
    use: { x: 9.3, z: -6.6, yaw: r4(-Math.PI / 2), r: 1.8, what: 'E — продать урожай, обменять вторичные ресурсы на опыт' },
    note: 'киоск под шляпкой гриба (красная в белый горошек), окошко смотрит на запад, к колодцу',
  });
  {
    const c = [10.3, -10.3];
    const yaw = yawTo(c[0], c[1], 0, 0); // лицом к колодцу (на юго-запад)
    const right = [-(-Math.cos(yaw)), -Math.sin(yaw)];
    const posts = [-1, 1].map((s) => [c[0] + right[0] * s, c[1] + right[1] * s]);
    obj({
      id: 'orders', name: 'Доска заказов', x: c[0], z: c[1], yaw: r4(yaw), w: 2.0,
      foot: roundPoly(segPoly(posts[0], posts[1], 0.3)),
      solid: posts.map((p, i) => box(`orders-post${i}`, p[0] - 0.08, p[1] - 0.08, p[0] + 0.08, p[1] + 0.08, 2.4)),
      use: { x: 9.38, z: -9.38, yaw: r4(yawTo(9.38, -9.38, c[0], c[1])), r: 1.5, what: 'E — мои 3 заказа' },
      note: 'личная доска: каждый видит свои 3 заказа; доска повёрнута к колодцу, твёрдые только два столбика',
    });
  }

  // СЗ — приезд: точка появления, доска фермы, телега «В город»
  const nw = [-Math.SQRT1_2, -Math.SQRT1_2];
  const ne = [Math.SQRT1_2, -Math.SQRT1_2];
  const spawnC = [nw[0] * 15.5, nw[1] * 15.5];
  const spawnYaw = yawTo(spawnC[0], spawnC[1], 0, 0);
  const sRight = [-(-Math.cos(spawnYaw)), -Math.sin(spawnYaw)];
  const spawns = [];
  for (const back of [0, 1.3]) for (const side of [-1.2, 0, 1.2]) {
    spawns.push({ x: r2(spawnC[0] + sRight[0] * side + nw[0] * back), z: r2(spawnC[1] + sRight[1] * side + nw[1] * back), yaw: r4(spawnYaw) });
  }
  {
    const c = [nw[0] * 13 - ne[0] * 3.2, nw[1] * 13 - ne[1] * 3.2];
    const yaw = yawTo(c[0], c[1], c[0] + ne[0], c[1] + ne[1]); // лицом к дороге (на северо-восток)
    const along = [-ne[1], ne[0]];
    const posts = [-1, 1].map((s) => [c[0] + along[0] * 1.2 * s, c[1] + along[1] * 1.2 * s]);
    const use = [c[0] + ne[0] * 1.4, c[1] + ne[1] * 1.4];
    obj({
      id: 'farmBoard', name: 'Доска фермы', x: r2(c[0]), z: r2(c[1]), yaw: r4(yaw), w: 2.4,
      foot: roundPoly(segPoly(posts[0], posts[1], 0.3)),
      solid: posts.map((p, i) => box(`farmBoard-post${i}`, p[0] - 0.08, p[1] - 0.08, p[0] + 0.08, p[1] + 0.08, 2.6)),
      use: { x: r2(use[0]), z: r2(use[1]), yaw: r4(yawTo(use[0], use[1], c[0], c[1])), r: 1.8, what: 'E — карта фермы: 20 участков, кто где, уровни и репутация' },
      note: 'нарисованная карта 20 участков с никами: свой — золотом, свободные — зелёным «свободно»',
    });
  }
  obj({
    id: 'cart', name: 'Телега «В город»', x: -8.4, z: -15.4, yaw: r4(Math.PI / 2), foot: boxPoly(-11.2, -16.2, -6.8, -14.6),
    solid: [box('cart', -10.0, -16.2, -6.8, -14.6, 2.2)],
    use: { x: -8.4, z: -13.8, yaw: 0, r: 1.8, what: 'E — в город, на набережную' },
    note: 'телега с сеном и тыквами у дороги, оглобли — на запад, к городу (оглобли без коллизии)',
  });

  // ЮВ — Фургон
  obj({
    id: 'van', name: 'Фургон (стоянка)', x: 9.9, z: 9.9, yaw: 0, foot: boxPoly(8.9, 7.65, 10.9, 12.15),
    solid: [box('van', 8.9, 7.65, 10.9, 12.15, 2.4, { toggle: 'van', what: 'только пока Фургон открыт' })],
    use: { x: 7.6, z: 9.9, yaw: r4(-Math.PI / 2), r: 2.2, what: 'E — сделки Фургона (открыт 1 ч / закрыт 1 ч)' },
    awaySign: { x: 9.9, z: 9.9, what: 'грифельный «домик»: «Фургон приедет через 37 мин»' },
    drive: [[36, 27], [24, 24], [16.5, 16.5], [11.5, 14.5], [9.9, 12.4], [9.9, 9.9]],
    note: 'старый фургончик кремовый с терракотовой полосой и навесом-маркизой; носом на север, окошко — на запад, к колодцу; приезжает по ЮВ аллее',
  });

  // ЮЗ — костёр и пьедестал Древа
  {
    const c = [-Math.SQRT1_2 * 9, Math.SQRT1_2 * 9];
    const seats = [];
    const logs = [];
    for (const [ox, oz, along, yaw] of [[0, -2.1, 'x', Math.PI], [0, 2.1, 'x', 0], [-2.1, 0, 'z', -Math.PI / 2], [2.1, 0, 'z', Math.PI / 2]]) {
      const lx = c[0] + ox;
      const lz = c[1] + oz;
      logs.push(along === 'x' ? boxPoly(lx - 0.9, lz - 0.225, lx + 0.9, lz + 0.225) : boxPoly(lx - 0.225, lz - 0.9, lx + 0.225, lz + 0.9));
      for (const s of [-0.5, 0.5]) seats.push({ x: r2(along === 'x' ? lx + s : lx), z: r2(along === 'x' ? lz : lz + s), yaw: r4(yaw), r: 0.7 });
    }
    obj({
      id: 'campfire', name: 'Костёр', x: r2(c[0]), z: r2(c[1]), yaw: 0,
      foot: roundPoly(boxPoly(c[0] - 2.33, c[1] - 2.33, c[0] + 2.33, c[1] + 2.33)), logs: logs.map(roundPoly),
      solid: [box('campfire', c[0] - 0.7, c[1] - 0.7, c[0] + 0.7, c[1] + 0.7, 0.6)],
      seats, use: null,
      note: 'каменное кольцо, 4 бревна-скамейки (8 мест, E — сесть), чат и эмоции; свет — светящееся пламя и пятно на земле, без лампы',
    });
  }
  {
    const c = [-Math.SQRT1_2 * 16.8, Math.SQRT1_2 * 16.8];
    obj({
      id: 'boss', name: 'Пьедестал Древа разлома', x: r2(c[0]), z: r2(c[1]), yaw: r4(yawTo(c[0], c[1], 0, 0)),
      foot: roundPoly(boxPoly(c[0] - 2, c[1] - 2, c[0] + 2, c[1] + 2)),
      solid: [
        box('boss-plinth', c[0] - 2, c[1] - 2, c[0] + 2, c[1] + 2, 0.3, { what: 'каменная площадка, на неё заходят (ступень 0,3 м)' }),
        box('boss-stump', c[0] - 0.6, c[1] - 0.6, c[0] + 0.6, c[1] + 0.6, 0.9, { what: 'пень, пока Древо спит' }),
        box('boss-trunk', c[0] - 0.9, c[1] - 0.9, c[0] + 0.9, c[1] + 0.9, 8, { toggle: 'boss', what: 'ствол, пока Древо проснулось (19:00, 6 ч)' }),
      ],
      use: { x: r2(c[0] + 2.5), z: r2(c[1]), yaw: r4(-Math.PI / 2), r: 2.0, what: 'E — Древо: здоровье, твой вклад, награды' },
      note: 'квадратная каменная площадка 4×4 м; Древо ~8 м с полосой здоровья над кроной; силуэт на фоне моря и вечернего солнца',
    });
  }

  // фонари на стыках радиальных дорожек с кольцом (светящийся материал и пятно на земле, без ламп)
  const lanterns = SIDES.map(([id, deg]) => {
    const a = deg * DEG;
    const d = dir(a);
    const t = [Math.cos(a), Math.sin(a)];
    const s = TROUGH.useR + RING.in - 0.8;
    return { id: `lantern${id}`, x: r2(d[0] * s + t[0] * 1.7), z: r2(d[1] * s + t[1] * 1.7) };
  });
  for (const l of lanterns) obj({ id: l.id, name: 'Фонарь', x: l.x, z: l.z, yaw: 0, foot: roundPoly(boxPoly(l.x - 0.15, l.z - 0.15, l.x + 0.15, l.z + 0.15)), solid: [box(l.id, l.x - 0.12, l.z - 0.12, l.x + 0.12, l.z + 0.12, 2.8)], use: null });

  // --- деревья: в клиньях между соседними участками одной группы, в саду (ЮВ), у пасеки (СВ), у смотровой (ЮЗ), у дороги (СЗ)
  const trees = [];
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    const q = plots[i + 1];
    if (!q || q.trough !== p.trough) continue;
    const a = p.corners[2]; // зад-право p
    const b = q.corners[3]; // зад-лево q
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const len = Math.hypot(m[0], m[1]);
    trees.push({ kind: 'apple', x: r2(m[0] - (m[0] / len) * 1.4), z: r2(m[1] - (m[1] / len) * 1.4), zone: 'клин между участками' });
  }
  for (const [x, z] of [[25.5, 30.5], [29.5, 33], [32.5, 29.5], [30.5, 22.5], [34, 22.5], [27, 34]]) trees.push({ kind: 'apple', x, z, zone: 'сад (ЮВ)' });
  for (const [x, z] of [[-33, 23.5], [-23, 33]]) trees.push({ kind: 'cypress', x, z, zone: 'смотровая (ЮЗ)' });
  for (const [x, z] of [[24.5, -33.5], [33.5, -24.5]]) trees.push({ kind: 'linden', x, z, zone: 'пасека (СВ)' });
  for (const [x, z] of [[-31, -33.5], [-33.5, -20]]) trees.push({ kind: 'linden', x, z, zone: 'у дороги (СЗ)' });
  const treeBoxes = trees.map((t, i) => box(`tree${i}`, t.x - 0.2, t.z - 0.2, t.x + 0.2, t.z + 0.2, 3));

  const nooks = [
    { id: 'apiary', name: 'Пасека', x: 28.5, z: -28.5, items: [{ kind: 'hiveDecor', x: 27.5, z: -30.2 }, { kind: 'hiveDecor', x: 29.1, z: -29.0 }, { kind: 'hiveDecor', x: 30.5, z: -27.5 }, { kind: 'bench', x: 26.6, z: -26.6, yaw: r4(yawTo(26.6, -26.6, 0, 0) + Math.PI) }], note: 'декоративные ульи и лавочка; за забором — поле подсолнухов до холмов' },
    { id: 'orchard', name: 'Сад', x: 28.5, z: 28.5, items: [{ kind: 'vanGate', x: 36, z: 27 }], note: 'яблони, по саду — колея Фургона к воротам в восточном заборе' },
    { id: 'viewpoint', name: 'Смотровая', x: -28.5, z: 28.5, items: [{ kind: 'bench', x: -30.5, z: 30.5, yaw: r4(yawTo(-30.5, 30.5, -60, 60)) }, { kind: 'telescope', x: -32.6, z: 32.6 }], note: 'скамейка лицом к морю и городу с маяком; перила обрыва вместо забора' },
    { id: 'road', name: 'Дорога в город', x: -28.5, z: -28.5, items: [{ kind: 'farmGate', x: -36, z: -27 }, { kind: 'haystack', x: -27.5, z: -32.5 }, { kind: 'haystack', x: -32.5, z: -31.5 }], note: 'дорога уходит через ворота в западном заборе к городу; стога сена' },
  ];
  const nookBoxes = [];
  for (const n of nooks) for (const it of n.items) {
    if (it.kind === 'haystack') nookBoxes.push(box(`hay${nookBoxes.length}`, it.x - 1, it.z - 1, it.x + 1, it.z + 1, 1.8));
    if (it.kind === 'hiveDecor') nookBoxes.push(box(`apiary${nookBoxes.length}`, it.x - 0.3, it.z - 0.3, it.x + 0.3, it.z + 0.3, 0.9));
    if (it.kind === 'telescope') nookBoxes.push(box('telescope', it.x - 0.15, it.z - 0.15, it.x + 0.15, it.z + 0.15, 1.4));
  }

  // --- дорожки
  const road = { width: 2.6, points: [[-3.2, -3.2], [-17, -17], [-24, -23.6], [-36, -27]] };
  const radial = SIDES.map(([id, deg]) => {
    const d = dir(deg * DEG);
    const s1 = TROUGH.useR + RING.in + 0.3;
    return { id, width: 2, from: [r2(d[0] * (APRON_R - 0.2)), r2(d[1] * (APRON_R - 0.2))], to: [r2(d[0] * s1), r2(d[1] * s1)] };
  });
  const foot = [
    { id: 'NE', width: 1.5, points: [[17.2, -17.2], [26, -26]] },
    { id: 'SE', width: 2.4, points: [[17.2, 17.2], [24, 24], [36, 27]], what: 'колея Фургона' },
    { id: 'SW', width: 1.5, points: [[-17.2, 17.2], [-29.5, 29.5]] },
    { id: 'back', width: 1.6, what: 'задняя тропка вдоль забора — проходит за участками' },
  ];

  const walls = [
    box('wallN', -HALF - 1, -HALF - 1, HALF + 1, -HALF, 8),
    box('wallS', -HALF - 1, HALF, HALF + 1, HALF + 1, 8),
    box('wallW', -HALF - 1, -HALF, -HALF, HALF, 8),
    box('wallE', HALF, -HALF, HALF + 1, HALF, 8),
  ];

  const boxes = [
    ...walls.map((b) => ({ ...b, what: 'невидимая стена по забору' })),
    ...objects.flatMap((o) => o.solid ?? []),
    ...treeBoxes.map((b) => ({ ...b, what: 'ствол' })),
    ...nookBoxes,
    // декор земли (client/farm/decor/decor.ts): стог тюков у дороги, поленница у костра, бочки у колодца
    box('decor-bales', -12.8, -16.12, -11.75, -15.08, 0.84, { what: 'стог тюков' }),
    box('decor-woodpile', -10.5, 3.59, -9.4, 4.92, 0.66, { what: 'поленница' }),
    box('decor-barrel0', 2.95, -3.55, 3.55, -2.95, 0.7, { what: 'бочка' }),
    box('decor-barrel1', -3.53, 2.97, -2.97, 3.53, 0.67, { what: 'бочка' }),
  ];

  // --- вход с площади: набор вокруг одной точки (переносится тремя числами)
  const gateAnchor = { x: 29.8, z: -12.0, yaw: -Math.PI / 2 };
  const kitLocal = {
    frame: 'начало — середина калитки на линии стены; −Z — наружу (на дорогу к ферме), +Z — на площадь; +X — правая рука выходящего; yaw — взгляд выходящего',
    wicket: { x: 0, z: 0, w: 1.4, h: 1.3, what: 'калитка из штакетника в проёме парапета, над ней дуга «ФЕРМА» с подсолнухом на двух столбах 3 м' },
    arch: { posts: [[-0.85, 0], [0.85, 0]], h: 3.0, boardY: 2.6 },
    box: { x0: -0.7, z0: -0.2, x1: 0.7, z1: 0.2, h: 2.2, what: 'калитка закрыта, пройти нельзя: вход — по E' },
    use: { x: 0, z: 1.2, r: 1.6 },
    spawnBack: { x: 0, z: 2.6, yawOffset: r4(Math.PI), what: 'сюда встаёт вернувшийся с фермы, лицом к площади' },
    cart: { x: 0.3, z: -3.4, l: 3.0, w: 1.6, what: 'телега с сеном, тыквами и подсолнухами за калиткой (на улице, без коллизии)' },
    signpost: { x: -1.6, z: 0.9, h: 2.6, what: 'столбик-указатель «ФЕРМА → · своя грядка»' },
    tout: { x: 1.2, z: 1.9, what: 'зазывала у калитки' },
  };
  const kw = (lx, lz) => roundPoly([toWorld(gateAnchor, lx, lz)])[0];
  const kb = kitLocal.box;
  const kbA = kw(kb.x0, kb.z0);
  const kbB = kw(kb.x1, kb.z1);
  const plazaGate = {
    anchor: { x: gateAnchor.x, z: gateAnchor.z, yaw: r4(gateAnchor.yaw) },
    local: kitLocal,
    current: {
      where: 'нынешняя площадь: восточный конец «Улицы Аттракционов», карман между гаражом картинга и кафе «Чайка», в парапете над улицей',
      use: { ...(() => { const [x, z] = kw(0, 1.2); return { x, z }; })(), yaw: r4(gateAnchor.yaw), r: 1.6 },
      spawnBack: { ...(() => { const [x, z] = kw(0, 2.6); return { x, z }; })(), yaw: r4(normYaw(gateAnchor.yaw + Math.PI)) },
      cart: (() => { const [x, z] = kw(0.3, -3.4); return { x, z, y: -0.6 }; })(),
      signpost: (() => { const [x, z] = kw(-1.6, 0.9); return { x, z }; })(),
      tout: (() => { const [x, z] = kw(1.2, 1.9); return { x, z }; })(),
      box: { min: [Math.min(kbA[0], kbB[0]), 0, Math.min(kbA[1], kbB[1])], max: [Math.max(kbA[0], kbB[0]), kb.h, Math.max(kbA[1], kbB[1])] },
      lobbyEdits: [
        'парапет [29.6, 0, −16]–[30, 1, −10] делится на два: z −16…−12.7 и −11.3…−10; проём закрывает бокс калитки',
        "новая точка 'farm' — в самый конец списка interact (номера прежних не меняются)",
        'farmSpawn в LobbyMap — как fortSpawn',
        "стрелка 'ФЕРМА' в DEST указателя «Куда идти» (client/lobby/plaza/street.ts)",
      ],
      nearby: { kboard: { x: 26.05, z: -14.3, r: 1.6 }, kartStart: { x: 20.5, z: -12.6, r: 2.2 }, cafe: [24, -10, 30, 4], garage: [13, -26, 28, -16] },
    },
  };

  return {
    version: 1,
    note: 'Сгенерировано docs/farm/level/check.mjs --write. Описание — level.md. Метры; x — восток, z — юг (север = −Z); yaw = 0 смотрит на −Z, поворот — как rotation.y в three.js.',
    cell: CELL,
    jelly: JELLY,
    rule: {
      D, betaDeg: BETA, troughUseR: TROUGH.useR,
      text: 'Участки — 4 дуги по 5: каждая дуга — окружность радиуса D вокруг места у своего корыта. Калитка любого участка ровно в D от ближайшего корыта; участок смотрит калиткой на своё корыто.',
    },
    bounds: { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF },
    well: { x: 0, z: 0, r: WELL.r, h: WELL.h },
    troughs,
    plot: { w: PLOT.w, l: PLOT.l },
    plotLocal: LOCAL,
    plots,
    objects,
    spawns,
    paths: {
      apron: { x: 0, z: 0, r: APRON_R },
      ring: { centers: troughs.map((t) => ({ trough: t.id, x: t.use.x, z: t.use.z })), in: RING.in, out: RING.out, width: r2(RING.out - RING.in), text: 'полоса от RING.in до RING.out вокруг места у своего корыта; дуги смыкаются на диагоналях' },
      radial,
      road,
      foot,
    },
    trees,
    nooks,
    boxes,
    plazaGate,
  };
}

// ------------------------------------------------------------------ проверки
function check(L) {
  const fails = [];
  const rows = [];
  const ok = (name, pass, detail) => {
    rows.push(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!pass) fails.push(name);
  };
  const U = L.troughs.map((t) => [t.use.x, t.use.z]);
  const rule = L.rule;
  const plotPolys = L.plots.map((p) => p.corners);

  // 1. Равные расстояния до ближайшего корыта
  let maxErr = 0;
  let wrongNearest = 0;
  const centerD = [];
  for (const p of L.plots) {
    const g = [p.gate.x, p.gate.z];
    const ds = U.map((u) => dist(g, u));
    const k = ds.indexOf(Math.min(...ds));
    if (L.troughs[k].id !== p.trough) wrongNearest++;
    maxErr = Math.max(maxErr, Math.abs(ds[k] - rule.D));
    const cd = U.map((u) => dist([p.x, p.z], u));
    centerD.push(Math.min(...cd));
    // второе по близости корыто — насколько дальше
    p._second = [...ds].sort((a, b) => a - b)[1];
  }
  ok('калитка каждого участка — ровно D от ближайшего корыта', maxErr < 0.011, `D = ${rule.D} м, наибольшее отклонение ${maxErr.toFixed(3)} м (округление координат до 1 см)`);
  ok('ближайшее корыто — своё (на которое смотрит калитка)', wrongNearest === 0, `чужих: ${wrongNearest}; до второго по близости — от ${Math.min(...L.plots.map((p) => p._second)).toFixed(1)} м`);
  ok('центр участка тоже на равном расстоянии', Math.max(...centerD) - Math.min(...centerD) < 0.02, `${Math.min(...centerD).toFixed(2)}–${Math.max(...centerD).toFixed(2)} м`);
  // для сравнения: если бы участки стояли на одной окружности вокруг колодца
  {
    const R = rule.troughUseR + rule.D;
    const ds = Array.from({ length: 20 }, (_, i) => {
      const g = dir((i * 18 + 9) * DEG).map((v) => v * R);
      return Math.min(...U.map((u) => dist(g, u)));
    });
    rows.push(`  для сравнения: 20 участков на одной окружности R = ${R} м дали бы ${Math.min(...ds).toFixed(2)}–${Math.max(...ds).toFixed(2)} м до ближайшего корыта (разница ${(Math.max(...ds) - Math.min(...ds)).toFixed(2)} м)`);
  }

  // 2. Радиус в клетках
  const gr = L.plots.map((p) => Math.hypot(p.gate.x, p.gate.z));
  ok('от центра до калитки — 10–12 клеток', Math.min(...gr) / L.cell >= 10 && Math.max(...gr) / L.cell <= 12.001, `${Math.min(...gr).toFixed(2)}–${Math.max(...gr).toFixed(2)} м = ${(Math.min(...gr) / L.cell).toFixed(2)}–${(Math.max(...gr) / L.cell).toFixed(2)} клетки (клетка ${L.cell} м)`);

  // 3. Участки не пересекаются; зазоры
  const order = L.plots.map((p, i) => i);
  let inMin = Infinity;
  let alleyMin = Infinity;
  let anyOverlap = 0;
  for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) if (polyGap(plotPolys[i], plotPolys[j]) === 0) anyOverlap++;
  const backGap = [];
  for (let i = 0; i < 20; i++) {
    const a = L.plots[order[i]];
    const b = L.plots[order[(i + 1) % 20]];
    const g = polyGap(a.corners, b.corners);
    if (a.trough === b.trough) {
      inMin = Math.min(inMin, g);
      backGap.push(dist(a.corners[2], b.corners[3]));
    } else alleyMin = Math.min(alleyMin, g);
  }
  ok('20 участков 6×10 м не пересекаются', anyOverlap === 0, `пересечений: ${anyOverlap}`);
  ok('между соседями в группе — не меньше 1 м', inMin >= 0.99, `у калиток ${inMin.toFixed(2)} м, у задних углов ${Math.min(...backGap).toFixed(2)} м`);
  ok('аллеи на диагоналях — не меньше 3 м', alleyMin >= 3, `самое узкое место (у калиток) ${alleyMin.toFixed(2)} м`);
  const maxXZ = Math.max(...plotPolys.flat().map(([x, z]) => Math.max(Math.abs(x), Math.abs(z))));
  ok('участки внутри забора, сзади остаётся тропка', maxXZ <= L.bounds.maxX - 1.5, `дальний угол участка ${maxXZ.toFixed(2)} м, забор ${L.bounds.maxX} м`);

  // 4. Грядки внутри участка
  const lp = L.plotLocal;
  const hw = L.plot.w / 2;
  const hl = L.plot.l / 2;
  const bs = lp.bedSize / 2;
  const bedRects = lp.beds.map((b) => boxPoly(b.x - bs, b.z - bs, b.x + bs, b.z + bs));
  const inside = (r, m) => r.every(([x, z]) => Math.abs(x) <= hw - m && Math.abs(z) <= hl - m);
  ok('8 грядок 1,6×1,6 м внутри участка (от забора ≥ 0,15 м)', bedRects.every((r) => inside(r, 0.15)));
  let bedGap = Infinity;
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) bedGap = Math.min(bedGap, polyGap(bedRects[i], bedRects[j]));
  ok('грядки не касаются друг друга (межа ≥ 0,3 м)', bedGap >= 0.3, `межа ${bedGap.toFixed(2)} м`);
  const pathR = boxPoly(lp.path.x0, lp.path.z0, lp.path.x1, lp.path.z1);
  const pathGap = Math.min(...bedRects.map((r) => polyGap(r, pathR)));
  ok('дорожка 1,2 м от калитки вглубь свободна от грядок', pathGap >= 0.3, `от дорожки до грядок ${pathGap.toFixed(2)} м`);
  const yard = [lp.pen, lp.compost, lp.hive].map((o) => boxPoly(o.x - o.w / 2, o.z - o.d / 2, o.x + o.w / 2, o.z + o.d / 2));
  let yardGap = Infinity;
  for (const y of yard) for (const r of bedRects) yardGap = Math.min(yardGap, polyGap(y, r));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) yardGap = Math.min(yardGap, polyGap(yard[i], yard[j]));
  ok('загон, компост и улей — на заднем дворе, без наложений', yard.every((r) => inside(r, 0.1)) && yardGap >= 0.2, `зазор ${yardGap.toFixed(2)} м`);
  ok('грядки открываются по уровням по порядку', lp.beds.every((b, i) => i === 0 || b.level > lp.beds[i - 1].level), lp.beds.map((b) => `${b.n}:ур.${b.level}`).join(' '));

  // 5. Общие предметы: не на участках, не на дорожках, не друг на друге, внутри забора
  const ringRho = (p) => {
    const a = (Math.atan2(p[0], -p[1]) / DEG + 360) % 360;
    const k = Math.round(a / 90) % 4;
    return dist(p, U[k]);
  };
  const ringClear = (poly) => {
    const rho = samples(poly).map(ringRho);
    const inner = rule.D - 2.2;
    const outer = rule.D - 0.2;
    return Math.max(...rho) < inner ? inner - Math.max(...rho) : Math.min(...rho) > outer ? Math.min(...rho) - outer : -1;
  };
  const roadPolys = L.paths.road.points.slice(1).map((b, i) => segPoly(L.paths.road.points[i], b, L.paths.road.width));
  const radialPolys = L.paths.radial.map((r) => segPoly(r.from, r.to, r.width));
  const apron = circlePoly(0, 0, L.paths.apron.r, 32);
  const objFoots = L.objects.filter((o) => !o.onApron && o.id !== 'well');
  let worst = { plot: Infinity, ring: Infinity, path: Infinity, obj: Infinity };
  const bad = [];
  for (const o of objFoots) {
    const gp = Math.min(...plotPolys.map((p) => polyGap(o.foot, p)));
    const gr2 = ringClear(o.foot);
    const gpath = Math.min(...[...roadPolys, ...radialPolys, apron].map((p) => polyGap(o.foot, p)));
    worst.plot = Math.min(worst.plot, gp);
    worst.ring = Math.min(worst.ring, gr2);
    worst.path = Math.min(worst.path, gpath);
    if (gp < 0.8 || gr2 < 0.3 || gpath < 0.3) bad.push(`${o.id} (участок ${gp.toFixed(2)}, кольцо ${gr2.toFixed(2)}, дорожки ${gpath.toFixed(2)})`);
  }
  for (let i = 0; i < objFoots.length; i++) for (let j = i + 1; j < objFoots.length; j++) {
    const g = polyGap(objFoots[i].foot, objFoots[j].foot);
    worst.obj = Math.min(worst.obj, g);
    if (g < 0.5) bad.push(`${objFoots[i].id}↔${objFoots[j].id} ${g.toFixed(2)}`);
  }
  ok('общие предметы не стоят на участках, дорожках и друг на друге', bad.length === 0,
    bad.length ? bad.join('; ') : `до участков ≥ ${worst.plot.toFixed(2)} м, до кольца ≥ ${worst.ring.toFixed(2)} м, до дорожек ≥ ${worst.path.toFixed(2)} м, между собой ≥ ${worst.obj.toFixed(2)} м`);
  const apronItems = L.objects.filter((o) => o.onApron || o.id === 'well');
  ok('колодец и корыта — на мощёном круге', apronItems.every((o) => o.foot.every((p) => Math.hypot(p[0], p[1]) <= L.paths.apron.r)));

  // 6. Твёрдые боксы, места E и точки появления
  const solid = L.boxes.filter((b) => !/^wall/.test(b.id));
  const inBox = (p, b, m) => p[0] > b.min[0] - m && p[0] < b.max[0] + m && p[1] > b.min[2] - m && p[1] < b.max[2] + m;
  const boxPolys = solid.filter((b) => b.max[1] > 0.52).map((b) => ({ b, poly: boxPoly(b.min[0], b.min[2], b.max[0], b.max[2]) }));
  const boxOnPlot = boxPolys.filter(({ poly }) => plotPolys.some((p) => polyGap(poly, p) === 0)).map(({ b }) => b.id);
  ok('на участках нет твёрдого', boxOnPlot.length === 0, boxOnPlot.join(', '));
  const boxOnPath = boxPolys.filter(({ b, poly }) => !/^(well|trough)/.test(b.id) && ([...roadPolys, ...radialPolys].some((p) => polyGap(poly, p) === 0) || ringClear(poly) < 0)).map(({ b }) => b.id);
  ok('на дорожках нет твёрдого', boxOnPath.length === 0, boxOnPath.join(', '));
  const uses = [
    ...L.troughs.map((t) => ({ id: `trough${t.id}`, ...t.use })),
    ...L.objects.filter((o) => o.use).map((o) => ({ id: o.id, ...o.use })),
    ...L.objects.flatMap((o) => (o.seats ?? []).map((s, i) => ({ id: `${o.id}-seat${i}`, ...s }))),
    ...L.plots.map((p) => ({ id: `plot${p.n}`, ...p.use })),
  ];
  const useBad = uses.filter((u) => solid.some((b) => !b.toggle && b.max[1] > 0.52 && inBox([u.x, u.z], b, L.jelly.half - 0.05)) || plotPolys.some((p) => pointInPoly([u.x, u.z], p)));
  ok(`места E (${uses.length}) свободны: не в боксах и не внутри участков`, useBad.length === 0, useBad.map((u) => u.id).join(', '));
  const sp = L.spawns.map((s) => [s.x, s.z]);
  let spMin = Infinity;
  for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) spMin = Math.min(spMin, dist(sp[i], sp[j]));
  const spBad = sp.filter((p) => solid.some((b) => inBox(p, b, L.jelly.half + 0.1)) || plotPolys.some((q) => pointInPoly(p, q)));
  const spPrompt = sp.filter((p) => uses.some((u) => dist(p, [u.x, u.z]) < u.r));
  ok(`${sp.length} точек появления свободны и не друг на друге`, spBad.length === 0 && spMin >= 1.1, `шаг ${spMin.toFixed(2)} м`);
  ok('при появлении не всплывает подсказка E', spPrompt.length === 0, spPrompt.length ? `${spPrompt.length} точек в радиусе E` : '');
  const outside = [...L.objects.flatMap((o) => o.foot), ...sp, ...L.trees.map((t) => [t.x, t.z])].filter(([x, z]) => Math.abs(x) > L.bounds.maxX - 0.4 || Math.abs(z) > L.bounds.maxZ - 0.4);
  ok('всё внутри забора', outside.length === 0);
  const treeBad = L.trees.filter((t) => {
    const p = circlePoly(t.x, t.z, 0.35, 8);
    return plotPolys.some((q) => polyGap(p, q) < 0.3) || [...roadPolys, ...radialPolys].some((q) => polyGap(p, q) === 0) || ringClear(p) < 0 || L.paths.foot.filter((f) => f.points).some((f) => f.points.slice(1).some((b, i) => polyGap(p, segPoly(f.points[i], b, f.width)) === 0));
  });
  ok(`деревья (${L.trees.length}) не на участках и не на дорожках`, treeBad.length === 0, treeBad.map((t) => `${t.x},${t.z}`).join('; '));
  const roadGap = Math.min(...roadPolys.flatMap((r) => plotPolys.map((p) => polyGap(r, p))));
  ok('дорога 2,6 м проходит в аллее, не задевая участков', roadGap >= 0.3, `зазор ${roadGap.toFixed(2)} м`);
  const footGap = Math.min(...L.paths.foot.filter((f) => f.points).flatMap((f) => f.points.slice(1).flatMap((b, i) => plotPolys.map((p) => polyGap(segPoly(f.points[i], b, f.width), p)))));
  ok('тропинки в аллеях не задевают участков', footGap >= 0.2, `зазор ${footGap.toFixed(2)} м`);

  // 7. Вход с площади (нынешняя площадь)
  const pg = L.plazaGate.current;
  const near = pg.nearby;
  const inRect = (p, r, m = 0) => p[0] > r[0] - m && p[0] < r[2] + m && p[1] > r[1] - m && p[1] < r[3] + m;
  const pts = [[pg.use.x, pg.use.z], [pg.spawnBack.x, pg.spawnBack.z], [pg.signpost.x, pg.signpost.z], [pg.tout.x, pg.tout.z]];
  ok('вход с площади: точки не в стенах кафе и гаража, на настиле', pts.every((p) => !inRect(p, near.cafe, 0.4) && !inRect(p, near.garage, 0.4) && p[0] < 29.6 && p[0] > -30));
  const dk = dist([pg.use.x, pg.use.z], [near.kboard.x, near.kboard.z]);
  ok('E калитки не перекрывает E табло картинга', dk >= pg.use.r + near.kboard.r, `${dk.toFixed(2)} м при сумме радиусов ${pg.use.r + near.kboard.r} м`);
  const dks = dist([pg.spawnBack.x, pg.spawnBack.z], [near.kartStart.x, near.kartStart.z]);
  ok('вернувшийся с фермы не встаёт в круг картинга', dks > near.kartStart.r + 0.6, `${dks.toFixed(2)} м`);

  // сводка для level.md
  const sem = L.objects.find((o) => o.id === 'semechkin').use;
  const grib = L.objects.find((o) => o.id === 'grib').use;
  const van = L.objects.find((o) => o.id === 'van').use;
  const range = (pt) => {
    const ds = L.plots.map((p) => dist([p.gate.x, p.gate.z], [pt.x, pt.z]));
    return `${Math.min(...ds).toFixed(0)}–${Math.max(...ds).toFixed(0)} м`;
  };
  rows.push(`  от калитки до Семечкина ${range(sem)}, до Гриба ${range(grib)}, до Фургона ${range(van)}, до точки появления ${range(L.spawns[1])}`);
  rows.push(`  твёрдых боксов: ${L.boxes.length} (из них ${L.boxes.filter((b) => b.toggle).length} включаются по событию)`);
  return { rows, fails };
}

// ------------------------------------------------------------------ карта (map.svg)
function svg(L) {
  const C = {
    page: '#f7f0e1', meadow: '#e9e0c2', hills: '#d9d8a8', sun: '#e2b13c', sea: '#c4dbd5', seaInk: '#5f807a',
    grass: '#dfe0b4', fence: '#8c6a46', path: '#ecdab2', pathEdge: '#d4bd8c', apron: '#ddd3be',
    plot: '#d6b385', plotEdge: '#8c6a46', bed: '#9c6b47', bedLocked: '#c9a77d', yard: '#b9945f', free: '#ece0bb', freeEdge: '#7f9a5a',
    own: '#d4a017', ink: '#4a3a2a', soft: '#7a6a55', water: '#8fb7c4', stone: '#b4b0a5', wood: '#a07650',
    market: '#c66f4c', van: '#6f9e8e', boss: '#6f8f45', fire: '#e0863a', board: '#8c6a46', cart: '#b88a4a', spawn: '#5e88a8', line: '#6a8fa0', tree: '#93a865',
  };
  const out = [];
  const T = (x, z, s, txt, o = {}) => out.push(`<text x="${r2(x)}" y="${r2(z)}" font-size="${o.size ?? 1.25}" fill="${o.fill ?? C.ink}" text-anchor="${o.anchor ?? 'middle'}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.italic ? ' font-style="italic"' : ''}>${txt}</text>`);
  const poly = (p, fill, stroke = 'none', sw = 0.1, extra = '') => `<polygon points="${p.map(([x, z]) => `${r2(x)},${r2(z)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extra}/>`;
  const line = (pts, stroke, sw, extra = '') => `<polyline points="${pts.map(([x, z]) => `${r2(x)},${r2(z)}`).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
  const U = L.troughs.map((t) => [t.use.x, t.use.z]);

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-46 -50 124 98" width="1240" height="980" font-family="Rubik, 'PT Sans', 'Helvetica Neue', Arial, sans-serif">`);
  out.push(`<rect x="-46" y="-50" width="124" height="98" fill="${C.page}"/>`);
  // окрестности: холмы с подсолнухами на севере, море на юге
  out.push(`<rect x="-41" y="-44" width="82" height="86" rx="1.2" fill="${C.meadow}"/>`);
  out.push(`<path d="M-41,-37 C-30,-42 -18,-38 -6,-41 C6,-44 18,-39 30,-42 C35,-43 39,-41 41,-40 L41,-44 L-41,-44 Z" fill="${C.hills}"/>`);
  for (let x = -38; x <= 38; x += 2.2) for (const z of [-42.6, -40.4, -38.6]) if (z > -43 + Math.abs(Math.sin(x)) * 0.8) out.push(`<circle cx="${r2(x + (z % 2))}" cy="${r2(z + Math.sin(x * 1.7) * 0.4)}" r="0.32" fill="${C.sun}" opacity="0.85"/>`);
  T(0, -45.4, 0, 'холмы и поле подсолнухов', { size: 1.1, fill: C.soft, italic: true });
  out.push(`<path d="M-41,38.2 C-25,37.4 -10,38.6 5,37.8 C20,37 32,38.4 41,37.6 L41,42 L-41,42 Z" fill="${C.sea}"/>`);
  T(14, 40.9, 0, 'Чёрное море · солнце садится на западе, над водой', { size: 1.1, fill: C.seaInk, italic: true });
  T(-30.5, 40.9, 0, '← город и маяк', { size: 1.1, fill: C.seaInk, italic: true });
  // ферма: трава и забор
  out.push(`<rect x="${-L.bounds.maxX}" y="${-L.bounds.maxZ}" width="${2 * L.bounds.maxX}" height="${2 * L.bounds.maxZ}" fill="${C.grass}" stroke="${C.fence}" stroke-width="0.3"/>`);
  out.push(`<line x1="-36" y1="36" x2="36" y2="36" stroke="#f2ede2" stroke-width="0.35" stroke-dasharray="0.6 0.4"/>`);
  T(0, 37.4, 0, 'перила обрыва — вид на море', { size: 0.95, fill: C.seaInk });
  // дорожки: мощёный круг, кольцо (4 дуги), радиальные, дорога, тропинки
  const ringPts = (rho) => {
    const pts = [];
    for (let deg = 0; deg < 360; deg += 1.5) {
      const th = deg * DEG;
      const d = dir(th);
      const k = Math.round(deg / 90) % 4;
      const b = d[0] * U[k][0] + d[1] * U[k][1];
      const s = b + Math.sqrt(b * b - (U[k][0] ** 2 + U[k][1] ** 2) + rho * rho);
      pts.push([d[0] * s, d[1] * s]);
    }
    return pts;
  };
  const pathD = (pts) => `M${pts.map(([x, z]) => `${r2(x)},${r2(z)}`).join(' L')} Z`;
  for (const f of L.paths.foot.filter((f) => f.points)) out.push(line(f.points, C.path, f.width, ` stroke-opacity="0.85"`));
  out.push(line(L.paths.road.points, C.pathEdge, L.paths.road.width + 0.3));
  out.push(line(L.paths.road.points, C.path, L.paths.road.width));
  for (const r of L.paths.radial) out.push(line([r.from, r.to], C.path, r.width));
  out.push(`<path d="${pathD(ringPts(L.paths.ring.out))} ${pathD(ringPts(L.paths.ring.in).reverse())}" fill="${C.path}" fill-rule="evenodd" stroke="${C.pathEdge}" stroke-width="0.08"/>`);
  out.push(`<circle cx="0" cy="0" r="${L.paths.apron.r}" fill="${C.apron}" stroke="${C.pathEdge}" stroke-width="0.08"/>`);
  // равные расстояния: тонкие линии от каждого корыта к его 5 калиткам
  for (const p of L.plots) {
    const t = L.troughs.find((q) => q.id === p.trough);
    out.push(line([[t.use.x, t.use.z], [p.gate.x, p.gate.z]], C.line, 0.07, ' stroke-dasharray="0.45 0.35" opacity="0.55"'));
  }
  // деревья
  for (const t of L.trees) out.push(`<circle cx="${t.x}" cy="${t.z}" r="${t.kind === 'cypress' ? 0.7 : 1.15}" fill="${C.tree}" opacity="0.9"/>`);
  // участки
  const lp = L.plotLocal;
  const OWN = 7;
  const FREE = new Set([12, 18]);
  for (const p of L.plots) {
    const deg = -p.yaw / DEG;
    const free = FREE.has(p.n);
    out.push(`<g transform="translate(${p.x},${p.z}) rotate(${r2(deg)})">`);
    out.push(`<rect x="${-p.w / 2}" y="${-p.l / 2}" width="${p.w}" height="${p.l}" fill="${free ? C.free : C.plot}" stroke="${p.n === OWN ? C.own : free ? C.freeEdge : C.plotEdge}" stroke-width="${p.n === OWN ? 0.4 : 0.14}"${free ? ' stroke-dasharray="0.6 0.35"' : ''}/>`);
    const bs = lp.bedSize;
    lp.beds.forEach((b, i) => out.push(`<rect x="${b.x - bs / 2}" y="${b.z - bs / 2}" width="${bs}" height="${bs}" rx="0.15" fill="${free ? (i === 0 ? C.bed : C.bedLocked) : i < 4 ? C.bed : C.bedLocked}" opacity="0.95"/>`));
    out.push(`<rect x="${lp.path.x0}" y="${lp.path.z0}" width="${lp.path.x1 - lp.path.x0}" height="${lp.path.z1 - lp.path.z0}" fill="${C.path}" opacity="0.9"/>`);
    for (const y of [lp.pen, lp.compost, lp.hive]) out.push(`<rect x="${y.x - y.w / 2}" y="${y.z - y.d / 2}" width="${y.w}" height="${y.d}" rx="0.1" fill="${C.yard}" opacity="${free ? 0.25 : 0.7}"/>`);
    out.push(`<rect x="${lp.sign.x - lp.sign.w / 2}" y="${lp.sign.z - 0.12}" width="${lp.sign.w}" height="0.24" fill="${p.n === OWN ? C.own : free ? C.freeEdge : C.fence}"/>`);
    out.push(`<rect x="${-lp.gate.w / 2}" y="${lp.gate.z - 0.1}" width="${lp.gate.w}" height="0.2" fill="${C.page}"/>`);
    out.push('</g>');
    const lab = toWorld(p, 0, -0.9);
    T(lab[0], lab[1] + 0.45, 0, `${p.n}`, { size: 1.35, weight: 700, fill: p.n === OWN ? '#9a6f00' : C.ink });
  }
  // колодец и корыта
  out.push(`<circle cx="0" cy="0" r="${L.well.r}" fill="${C.stone}" stroke="${C.ink}" stroke-width="0.08"/><circle cx="0" cy="0" r="0.6" fill="${C.water}"/>`);
  for (const t of L.troughs) {
    out.push(`<rect x="${t.box.min[0]}" y="${t.box.min[2]}" width="${t.w}" height="${t.d}" rx="0.1" fill="${C.wood}"/>`);
    out.push(`<circle cx="${t.use.x}" cy="${t.use.z}" r="0.28" fill="${C.line}"/>`);
  }
  // общие предметы
  const label = (o, txt, dx, dz, col, size = 1.15, anchor = 'middle') => T(o.x + dx, o.z + dz, 0, txt, { size, fill: col ?? C.ink, weight: 600, anchor });
  for (const o of L.objects) {
    if (/^(well|trough)/.test(o.id)) continue;
    const col = { semechkin: C.market, grib: C.market, orders: C.board, farmBoard: C.board, cart: C.cart, van: C.van, campfire: C.fire, boss: C.boss }[o.id] ?? C.fence;
    if (o.id === 'campfire') {
      for (const lg of o.logs) out.push(poly(lg, C.wood));
      out.push(`<circle cx="${o.x}" cy="${o.z}" r="0.75" fill="${C.fire}"/>`);
    } else if (o.id === 'van') {
      out.push(poly(o.foot, C.van, C.ink, 0.06, ' stroke-dasharray="0.4 0.25" fill-opacity="0.75"'));
      out.push(line(o.drive, C.van, 0.12, ' stroke-dasharray="0.5 0.4" opacity="0.7"'));
    } else if (o.id === 'boss') {
      out.push(poly(o.foot, '#cfc8b4', C.ink, 0.06));
      out.push(`<circle cx="${o.x}" cy="${o.z}" r="1.5" fill="${C.boss}" opacity="0.85"/>`);
    } else out.push(poly(o.foot, col, 'none'));
    if (o.use) out.push(`<circle cx="${o.use.x}" cy="${o.use.z}" r="0.25" fill="none" stroke="${C.ink}" stroke-width="0.08"/>`);
  }
  const O = Object.fromEntries(L.objects.map((o) => [o.id, o]));
  label(O.semechkin, 'Семечкин', 0, -1.6, C.market);
  label(O.grib, 'Дядюшка Гриб', 2.2, 2.9, C.market);
  label(O.orders, 'заказы', 2.6, -0.4, C.soft, 1.0);
  label(O.farmBoard, 'Доска фермы', -1.4, 2.1, C.board);
  label(O.cart, 'Телега «В город»', -0.4, -1.4, C.cart);
  label(O.van, 'Фургон', 3.0, 0.2, C.van, 1.15, 'start');
  label(O.van, '1 ч / 1 ч', 3.0, 1.5, C.soft, 0.95, 'start');
  label(O.campfire, 'Костёр', 3.6, -0.6, C.fire);
  label(O.boss, 'Древо разлома', 0.2, 3.5, C.boss);
  T(-4.9, -2.3, 0, 'колодец и 4 корыта', { size: 0.95, fill: C.soft, anchor: 'end' });
  for (const s of L.spawns) out.push(`<circle cx="${s.x}" cy="${s.z}" r="0.34" fill="${C.spawn}"/>`);
  T(L.spawns[1].x + 3.7, L.spawns[1].z + 0.4, 0, 'появление', { size: 1.0, fill: C.spawn, weight: 600 });
  for (const n of L.nooks) {
    for (const it of n.items) {
      if (it.kind === 'haystack') out.push(`<circle cx="${it.x}" cy="${it.z}" r="1" fill="#e2c46e"/>`);
      if (it.kind === 'hiveDecor') out.push(`<rect x="${it.x - 0.35}" y="${it.z - 0.35}" width="0.7" height="0.7" fill="#e2b13c"/>`);
      if (it.kind === 'bench') out.push(`<circle cx="${it.x}" cy="${it.z}" r="0.45" fill="${C.wood}"/>`);
      if (it.kind === 'farmGate' || it.kind === 'vanGate') out.push(`<rect x="${it.x - 0.5}" y="${it.z - 1.6}" width="1" height="3.2" fill="${C.page}" stroke="${C.fence}" stroke-width="0.15"/>`);
    }
    T(n.id === 'road' ? -22.5 : n.x, n.id === 'road' ? -33.4 : n.z + (n.z > 0 ? 3.2 : -2.4), 0, n.name, { size: 1.1, fill: C.soft, italic: true });
  }
  T(-39.4, -27, 0, 'в город', { size: 0.95, fill: C.soft, italic: true });
  // заголовок
  T(-45, -47.6, 0, 'Ферма — вид сверху', { size: 2.2, weight: 700, anchor: 'start' });
  T(-45, -45.8, 0, '20 участков в кольце · 1 клетка = 2 м · север сверху', { size: 1.1, fill: C.soft, anchor: 'start' });
  // масштаб и север
  out.push(`<g transform="translate(26,-46.6)"><line x1="0" y1="0" x2="10" y2="0" stroke="${C.ink}" stroke-width="0.18"/><line x1="0" y1="-0.5" x2="0" y2="0.5" stroke="${C.ink}" stroke-width="0.14"/><line x1="10" y1="-0.5" x2="10" y2="0.5" stroke="${C.ink}" stroke-width="0.14"/><line x1="4" y1="-0.35" x2="4" y2="0.35" stroke="${C.ink}" stroke-width="0.1"/></g>`);
  T(31, -47.4, 0, '10 м = 5 клеток', { size: 0.95, fill: C.soft });
  out.push(`<g transform="translate(39.6,-46.4)"><polygon points="0,-1.6 0.7,0.4 0,0 -0.7,0.4" fill="${C.ink}"/></g>`);
  T(39.6, -44.4, 0, 'С', { size: 0.95, weight: 700 });

  // ---- врезка: участок изнутри
  const ix = 46;
  const iz = -40;
  const s = 2.15;
  T(ix, iz - 1.6, 0, 'Участок изнутри', { size: 1.5, weight: 700, anchor: 'start' });
  T(ix, iz + 0.1, 0, '6 × 10 м · калитка смотрит на своё корыто', { size: 0.95, fill: C.soft, anchor: 'start' });
  out.push(`<g transform="translate(${ix + 7.5},${iz + 13.5}) scale(${s})">`);
  out.push(`<rect x="-3" y="-5" width="6" height="10" fill="${C.plot}" stroke="${C.plotEdge}" stroke-width="0.07"/>`);
  out.push(`<rect x="${lp.path.x0}" y="${lp.path.z0}" width="${lp.path.x1 - lp.path.x0}" height="${lp.path.z1 - lp.path.z0}" fill="${C.path}"/>`);
  lp.beds.forEach((b) => out.push(`<rect x="${b.x - 0.8}" y="${b.z - 0.8}" width="1.6" height="1.6" rx="0.12" fill="${b.n <= 4 ? C.bed : C.bedLocked}"/>`));
  for (const y of [lp.pen, lp.compost, lp.hive]) out.push(`<rect x="${y.x - y.w / 2}" y="${y.z - y.d / 2}" width="${y.w}" height="${y.d}" rx="0.08" fill="${C.yard}"/>`);
  out.push(`<rect x="${-lp.gate.w / 2}" y="${lp.gate.z - 0.06}" width="${lp.gate.w}" height="0.12" fill="${C.page}"/>`);
  out.push(`<rect x="${lp.sign.x - lp.sign.w / 2}" y="${lp.sign.z - 0.09}" width="${lp.sign.w}" height="0.18" fill="${C.own}"/>`);
  out.push('</g>');
  // подписи во врезке: локальная (lx, lz) → (ix+7.5 + lx·s, iz+13.5 + lz·s); калитка внизу, вход — вверх, +X — вправо
  const IL = (lx, lz) => [ix + 7.5 + lx * s, iz + 13.5 + lz * s];
  for (const b of lp.beds) {
    const [x, z] = IL(b.x, b.z);
    T(x, z - 0.05, 0, `${b.n}`, { size: 1.15, weight: 700, fill: '#fbf5e6' });
    T(x, z + 1.05, 0, b.level === 1 ? 'старт' : `ур. ${b.level}`, { size: 0.75, fill: '#fbf5e6' });
  }
  for (const [o, txt] of [[lp.pen, 'свин · 10'], [lp.compost, 'компост · 11'], [lp.hive, 'улей · 10']]) {
    const [x, z] = IL(o.x, o.z);
    T(x, z + 0.3, 0, txt, { size: 0.68, fill: C.ink });
  }
  {
    const [gx, gz] = IL(0, 5);
    T(gx, gz + 2.3, 0, 'калитка · к корыту ↓', { size: 0.8, fill: C.soft });
    const [sx, sz] = IL(lp.sign.x, lp.sign.z);
    T(sx - 1.4, sz + 0.3, 0, 'табличка', { size: 0.8, fill: '#9a6f00', anchor: 'end' });
  }
  T(ix + 15.6, iz + 5, 0, 'Грядки открываются', { size: 0.95, weight: 600, anchor: 'start' });
  T(ix + 15.6, iz + 6.4, 0, 'от калитки вглубь,', { size: 0.95, anchor: 'start' });
  T(ix + 15.6, iz + 7.8, 0, 'зигзагом: 1 → 8.', { size: 0.95, anchor: 'start' });
  T(ix + 15.6, iz + 10.2, 0, 'Дорожка 1,2 м', { size: 0.95, anchor: 'start' });
  T(ix + 15.6, iz + 11.6, 0, 'ведёт к заднему', { size: 0.95, anchor: 'start' });
  T(ix + 15.6, iz + 13, 0, 'двору (ур. 10–11).', { size: 0.95, anchor: 'start' });
  T(ix + 15.6, iz + 15.4, 0, 'Клик по грядке —', { size: 0.95, anchor: 'start' });
  T(ix + 15.6, iz + 16.8, 0, 'до 6 м.', { size: 0.95, anchor: 'start' });

  // ---- врезка: вход с площади
  const gx0 = 46;
  const gz0 = 2.5;
  const g = 1.7;
  const pgc = L.plazaGate.current;
  T(gx0, gz0 - 1.6, 0, 'Вход с площади', { size: 1.5, weight: 700, anchor: 'start' });
  T(gx0, gz0 + 0.1, 0, 'восточный конец Улицы Аттракционов', { size: 0.95, fill: C.soft, anchor: 'start' });
  const PW = (x, z) => [gx0 + 2 + (x - 21) * g, gz0 + 2 + (z + 17) * g];
  const pr = (x0, z0, x1, z1, fill, extra = '') => { const [a, b] = PW(x0, z0); const [c, d] = PW(x1, z1); out.push(`<rect x="${r2(a)}" y="${r2(b)}" width="${r2(c - a)}" height="${r2(d - b)}" fill="${fill}"${extra}/>`); };
  pr(21, -17, 30, -6.8, '#e6dccb');
  pr(21, -17, 28, -16, '#b9846f');
  pr(24, -10, 30, -6.8, '#efe5d2', ` stroke="${C.fence}" stroke-width="0.08"`);
  pr(30, -17, 35.5, -6.8, '#cfcabf');
  pr(29.6, -16, 30, -12.7, '#cfc7b6');
  pr(29.6, -11.3, 30, -10, '#cfc7b6');
  pr(29.6, -12.7, 30, -11.3, C.wood);
  {
    const [cx, cz] = PW(pgc.cart.x, pgc.cart.z);
    out.push(`<rect x="${r2(cx - 1.5 * g)}" y="${r2(cz - 0.8 * g)}" width="${r2(3 * g)}" height="${r2(1.6 * g)}" rx="0.3" fill="#e2c46e" stroke="${C.cart}" stroke-width="0.15"/>`);
    T(cx, cz + 3.2, 0, 'телега', { size: 0.85, fill: C.ink });
    const [ux, uz] = PW(pgc.use.x, pgc.use.z);
    out.push(`<circle cx="${r2(ux)}" cy="${r2(uz)}" r="${r2(pgc.use.r * g)}" fill="${C.own}" fill-opacity="0.15" stroke="${C.own}" stroke-width="0.1"/>`);
    T(ux, uz + 0.4, 0, 'E', { size: 1.2, weight: 700, fill: '#9a6f00' });
    const [bx, bz] = PW(pgc.spawnBack.x, pgc.spawnBack.z);
    out.push(`<circle cx="${r2(bx)}" cy="${r2(bz)}" r="0.45" fill="${C.spawn}"/>`);
    T(bx - 1.0, bz + 0.4, 0, 'возврат', { size: 0.8, fill: C.spawn, anchor: 'end' });
    const [sx, sz] = PW(pgc.signpost.x, pgc.signpost.z);
    out.push(`<circle cx="${r2(sx)}" cy="${r2(sz)}" r="0.3" fill="${C.fence}"/>`);
    T(sx, sz - 1.0, 0, 'указатель', { size: 0.8, fill: C.ink });
    const [kx, kz] = PW(near0(L).kboard.x, near0(L).kboard.z);
    out.push(`<circle cx="${r2(kx)}" cy="${r2(kz)}" r="${r2(1.6 * g)}" fill="none" stroke="${C.soft}" stroke-width="0.08" stroke-dasharray="0.4 0.3"/>`);
    T(kx, kz + 0.3, 0, 'табло картинга', { size: 0.75, fill: C.soft });
    const [wx, wz] = PW(29.8, -12.0);
    T(wx + 1.0, wz - 2.4, 0, 'калитка', { size: 0.85, fill: C.ink, anchor: 'start' });
  }
  T(...PW(24.5, -16.6), 0, 'гараж картинга', { size: 0.85, fill: '#fbf5e6' });
  T(...PW(27, -8.2), 0, 'кафе «Чайка»', { size: 0.85, fill: C.soft });
  T(...PW(32.8, -7.6), 0, 'улица', { size: 0.85, fill: C.soft });

  // ---- легенда
  const lx0 = 46;
  let lz = 27;
  T(lx0, lz - 1.4, 0, 'Обозначения', { size: 1.5, weight: 700, anchor: 'start' });
  const leg = (draw, txt) => { out.push(draw(lx0 + 0.8, lz + 0.5)); T(lx0 + 2.4, lz + 0.9, 0, txt, { size: 0.95, anchor: 'start' }); lz += 2.1; };
  leg((x, z) => `<rect x="${x - 0.8}" y="${z - 0.6}" width="1.6" height="1.2" fill="${C.plot}" stroke="${C.plotEdge}" stroke-width="0.1"/>`, 'занятый участок (табличка с ником)');
  leg((x, z) => `<rect x="${x - 0.8}" y="${z - 0.6}" width="1.6" height="1.2" fill="${C.plot}" stroke="${C.own}" stroke-width="0.3"/>`, 'свой участок — золотом (пример: №7)');
  leg((x, z) => `<rect x="${x - 0.8}" y="${z - 0.6}" width="1.6" height="1.2" fill="${C.free}" stroke="${C.freeEdge}" stroke-width="0.12" stroke-dasharray="0.4 0.25"/>`, 'свободный — клик, чтобы занять (№12, №18)');
  leg((x, z) => `<line x1="${x - 0.9}" y1="${z}" x2="${x + 0.9}" y2="${z}" stroke="${C.line}" stroke-width="0.12" stroke-dasharray="0.45 0.35"/>`, `от корыта до калитки — ровно ${L.rule.D} м у всех 20`);
  leg((x, z) => `<circle cx="${x}" cy="${z}" r="0.3" fill="none" stroke="${C.ink}" stroke-width="0.1"/>`, 'место, где жать E');
  leg((x, z) => `<circle cx="${x}" cy="${z}" r="0.34" fill="${C.spawn}"/>`, 'точки появления (6)');
  leg((x, z) => `<rect x="${x - 0.9}" y="${z - 0.45}" width="1.8" height="0.9" fill="${C.path}" stroke="${C.pathEdge}" stroke-width="0.06"/>`, 'дорожки: кольцо, 4 луча, дорога');
  out.push('</svg>');
  return out.join('\n');
}
const near0 = (L) => L.plazaGate.current.nearby;

// ------------------------------------------------------------------ запуск
const file = join(HERE, 'layout.json');
if (process.argv.includes('--write')) {
  const layout = build();
  writeFileSync(file, `${JSON.stringify(layout, null, 1)}\n`);
  writeFileSync(join(HERE, 'map.svg'), `${svg(layout)}\n`);
  console.log('записаны layout.json и map.svg');
}
const L = JSON.parse(readFileSync(file, 'utf8'));
const { rows, fails } = check(L);
console.log(rows.join('\n'));
console.log(fails.length ? `\nНЕ ПРОШЛО: ${fails.length}` : '\nВсё сходится.');
process.exit(fails.length ? 1 : 0);
