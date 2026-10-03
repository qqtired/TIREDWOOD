// Трасса картинга «Портовое кольцо»: замкнутая дорога без изломов и переменной ширины, контрольные точки, решётка,
// ящики, два трамплина через каналы, причалы без стен, поиск отрезка, суша под дорогой и вода за причалами.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CRANE_HALF_X, CRANE_HALF_Z, RING, RING_CANALS, buildRing } from '../shared/maps/ring.ts';
import { landHas } from '../shared/maps/ringland.ts';
import { NO_GROUND, buildTrack, locate, locateAny, makeLoc, progress, wrapSeg } from '../shared/track.ts';

const { track: tr, land, deco } = buildRing();

const onLand = (x: number, z: number): boolean => landHas(land, x, z);

/** Точка у отрезка i: доля t по нему, lat — вправо по ходу */
function at(i: number, t: number, lat: number): { x: number; z: number } {
  return {
    x: tr.px[i] + tr.tx[i] * tr.len[i] * t - tr.tz[i] * lat,
    z: tr.pz[i] + tr.tz[i] * tr.len[i] * t + tr.tx[i] * lat,
  };
}

/** Полуширина дороги у отрезка i на доле t */
function hwAt(i: number, t: number): number {
  const j = wrapSeg(tr, i + 1);
  return tr.hw[i] + (tr.hw[j] - tr.hw[i]) * t;
}

/** Углы сглаживания трассы: узел по ближайшему углу многоугольника (дуги ближе к своему углу, чем к чужому) */
function nodeOf(i: number): number {
  let best = 0;
  let bestD = Infinity;
  RING.nodes.forEach((n, k) => {
    const d = Math.hypot(n.x - tr.px[i], n.z - tr.pz[i]);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
  return best;
}

/** Начала провалов (каналов под трамплинами) по ходу гонки */
function gapStarts(): number[] {
  const starts: number[] = [];
  for (let i = 0; i < tr.n; i++) if (tr.gap[i] && !tr.gap[wrapSeg(tr, i - 1)]) starts.push(i);
  return starts;
}

test('кольцо замкнуто: отрезки 0,3–2 м без изломов, круг около 1,09 км, ширина 10–15 м', () => {
  assert.ok(tr.length > 1000 && tr.length < 1150, `круг ${tr.length} м`);
  for (let i = 0; i < tr.n; i++) {
    assert.ok(tr.len[i] >= 0.3 && tr.len[i] <= 2 + 1e-9, `отрезок ${i}: ${tr.len[i]} м`);
    const j = wrapSeg(tr, i + 1);
    assert.ok(tr.tx[i] * tr.tx[j] + tr.tz[i] * tr.tz[j] > 0.99, `излом в точке ${j}`);
    const e = at(i, 1, 0);
    assert.ok(Math.abs(e.x - tr.px[j]) < 1e-9 && Math.abs(e.z - tr.pz[j]) < 1e-9, `разрыв после отрезка ${i}`);
    assert.ok(tr.hw[i] >= 5 - 1e-9 && tr.hw[i] <= 7.5 + 1e-9, `ширина в точке ${i}: ${tr.hw[i] * 2}`);
    // ширина меняется плавно: не больше 0,3 м на метр пути
    assert.ok(Math.abs(tr.hw[j] - tr.hw[i]) <= 0.15 * tr.len[i] + 1e-9, `скачок ширины у отрезка ${i}`);
  }
  assert.ok(Math.abs(tr.s[tr.n - 1] + tr.len[tr.n - 1] - tr.length) < 1e-9);
  assert.equal(tr.half, 7.5);
  assert.ok(Math.min(...tr.hw) * 2 <= 10.001 && Math.max(...tr.hw) * 2 >= 14.999, 'ширина от 10 до 15 м');
});

test('двенадцать контрольных точек по ходу гонки, КТ 0 — линия старта на южной прямой, курс на восток', () => {
  assert.equal(tr.cpSeg.length, 13);
  assert.equal(tr.cpSeg[0], 0);
  for (let k = 1; k < 13; k++) assert.ok(tr.s[tr.cpSeg[k]] > tr.s[tr.cpSeg[k - 1]] + 20, `КТ ${k} слишком близко`);
  assert.ok(tr.length - tr.s[tr.cpSeg[12]] > 20, 'последняя КТ далеко до линии');
  [0, 0, 0, 1, 1, 3, 5, 6, 6, 7, 8, 10, 11].forEach((leg, k) => assert.equal(tr.leg[tr.cpSeg[k]], leg, `КТ ${k}`));
  assert.ok(Math.abs(tr.px[0] + 60) < 1e-9 && Math.abs(tr.pz[0] - 112) < 1e-9);
  assert.ok(tr.tx[0] > 0.9999);
  // трамплины и провалы не лежат на контрольных точках: КТ всегда на дороге
  for (let k = 0; k < 13; k++) assert.equal(tr.gap[tr.cpSeg[k]], 0, `КТ ${k} над каналом`);
});

test('кривизна: знак — влево +, вправо −; радиусы 12–40 м; на прямой — ноль', () => {
  const loc = makeLoc();
  // восточный поворот на север (радиус 40, влево), 45° по дуге
  locateAny(tr, 123.28, 100.28, loc);
  assert.ok(Math.abs(tr.curv[loc.seg] - 1 / 40) < 0.002, `восточный поворот ${tr.curv[loc.seg]}`);
  // вход в бухту у (90; 2): радиус 12, вправо
  locateAny(tr, 86.49, -1.51, loc);
  assert.ok(Math.abs(tr.curv[loc.seg] + 1 / 12) < 0.002, `поворот у бухты ${tr.curv[loc.seg]}`);
  locateAny(tr, -60, 112, loc);
  assert.ok(Math.abs(tr.curv[loc.seg]) < 1e-9, 'прямая');
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < tr.n; i++) {
    lo = Math.min(lo, tr.curv[i]);
    hi = Math.max(hi, tr.curv[i]);
  }
  assert.ok(hi > 1 / 13 && lo < -1 / 13 && hi < 1 / 11 && lo > -1 / 11, `кривизна ${lo} … ${hi}`);
});

test('решётка: шесть мест за линией, на дороге и не впритык', () => {
  assert.equal(tr.grid.length, 6);
  const loc = makeLoc();
  tr.grid.forEach((g, k) => {
    locateAny(tr, g.x, g.z, loc);
    assert.ok(Math.abs(loc.lat) <= loc.hw - 2, `место ${k} у края`);
    assert.ok(g.x < -60 && g.x > -82, `место ${k}: x = ${g.x}`);
    assert.ok(Math.abs(g.z - 112) < 5);
    assert.ok(g.hx > 0.9999 && Math.abs(g.hz) < 1e-9);
    for (let m = 0; m < k; m++) {
      const o = tr.grid[m];
      assert.ok(Math.hypot(g.x - o.x, g.z - o.z) > 2.4, `места ${m} и ${k} впритык`);
      assert.ok(g.x < o.x, 'каждое следующее место дальше от линии');
    }
  });
});

test('ящики: семь рядов (23 ящика) поперёк дороги на ногах 0, 1, 3, 5, 6, 8 и 10', () => {
  assert.equal(tr.crates.length, 23);
  const loc = makeLoc();
  for (const c of tr.crates) {
    locateAny(tr, c.x, c.z, loc);
    assert.ok(Math.abs(loc.lat) <= loc.hw - 1.5, `ящик ${c.x},${c.z} у края`);
    assert.equal(c.y, tr.h[c.seg]);
    assert.equal(c.y, 0);
    assert.equal(tr.gap[c.seg], 0);
  }
  assert.deepEqual([...new Set(tr.crates.map((c) => tr.leg[c.seg]))], [0, 1, 3, 5, 6, 8, 10]);
  // ряды — по 3–4 ящика, у каждого ряда ящики в одну линию поперёк дороги
  const rows = new Map<number, number>();
  for (const c of tr.crates) rows.set(c.seg, (rows.get(c.seg) ?? 0) + 1);
  assert.equal(rows.size, 7);
  for (const [seg, count] of rows) assert.ok(count >= 3 && count <= 4, `ряд у отрезка ${seg}: ${count} ящиков`);
});

test('трамплины: два провала по 14 м через каналы — на восточном (J1) и северном (J2) причалах', () => {
  const starts = gapStarts();
  assert.equal(starts.length, 2);
  const [j1, j2] = starts;
  assert.equal(tr.leg[j1], 1);
  assert.equal(tr.leg[j2], 6);
  for (const [g0, up, height] of [
    [j1, 10, 2.2],
    [j2, 12, 2.4],
  ]) {
    let gapLen = 0;
    let i = g0;
    for (; tr.gap[i]; i = wrapSeg(tr, i + 1)) gapLen += tr.len[i];
    assert.ok(Math.abs(gapLen - 14) < 0.1, `провал ${gapLen} м`);
    assert.ok(Math.abs(tr.h[g0] - height) < 1e-9, `край трамплина на ${height} м`);
    assert.equal(tr.h[i], 0, 'приземление на ровную дорогу');
    let run = 0;
    let k = wrapSeg(tr, g0 - 1);
    for (; tr.h[k] > 0; k = wrapSeg(tr, k - 1)) {
      assert.ok(tr.h[k] < tr.h[wrapSeg(tr, k + 1)]);
      run += tr.len[k];
    }
    run += tr.len[k];
    assert.ok(Math.abs(run - up) < 0.1, `подъём ${run} м`);
    const loc = makeLoc();
    const air = at(g0 + 2, 0.5, 0);
    assert.equal(locate(tr, air.x, air.z, g0, loc).ground, NO_GROUND);
    const ramp = at(g0 - 2, 0.5, 1);
    const want = tr.h[g0 - 2] + (tr.h[g0 - 1] - tr.h[g0 - 2]) * 0.5;
    assert.ok(Math.abs(locate(tr, ramp.x, ramp.z, g0 - 4, loc).ground - want) < 1e-9);
  }
  // между трамплинами — не меньше круга половины трассы: не прыгать подряд
  assert.ok(tr.s[j2] - tr.s[j1] > 300);
});

test('причалы без стен — только справа: восточный и северный причалы, берега бухты и мыс', () => {
  for (let i = 0; i < tr.n; i++) {
    assert.equal(tr.openL[i], 0, `отрезок ${i}`);
    let open = 0;
    if (tr.leg[i] >= 0) {
      const a = tr.legAt[i];
      const b = a + tr.len[i];
      for (const o of RING.open) if (o.side === 'right' && o.leg === tr.leg[i] && a >= o.from - 1e-6 && b <= o.to + 1e-6) open = 1;
    } else if (RING.openNodes?.some((o) => o.side === 'right' && o.node === nodeOf(i))) open = 1;
    assert.equal(tr.openR[i], open, `отрезок ${i} (нога ${tr.leg[i]})`);
  }
  // справа открыты обе длинные прямые и ничего больше на южной прямой
  for (let i = 0; i < tr.n; i++) if (tr.leg[i] === 0) assert.equal(tr.openR[i], 0);
});

test('поиск отрезка восстанавливает точку, окно переходит через линию старта', () => {
  const loc = makeLoc();
  for (let i = 0; i < tr.n; i++) {
    for (const [t, lat] of [
      [0.3, -3],
      [0.5, 0],
      [0.7, 3],
    ]) {
      const p = at(i, t, lat);
      locate(tr, p.x, p.z, wrapSeg(tr, i - 3), loc);
      assert.equal(loc.seg, i, `точка у отрезка ${i}`);
      assert.ok(Math.abs(loc.t - t) < 1e-6 && Math.abs(loc.lat - lat) < 1e-6, `отрезок ${i}: t ${loc.t}, lat ${loc.lat}`);
      assert.ok(Math.abs(loc.hw - hwAt(i, t)) < 1e-9, `ширина в точке отрезка ${i}`);
      assert.equal(locateAny(tr, p.x, p.z, loc).seg, i);
    }
  }
});

test('суша под дорогой и под стенами, за причалами — вода, под провалом — канал', () => {
  for (let i = 0; i < tr.n; i++) {
    const c = at(i, 0.5, 0);
    if (tr.gap[i]) {
      assert.ok(!onLand(c.x, c.z), `провал ${i} над сушей`);
      continue;
    }
    assert.ok(onLand(c.x, c.z), `дорога ${i} не на суше`);
    const hw = hwAt(i, 0.5);
    const hwMax = Math.max(tr.hw[i], tr.hw[wrapSeg(tr, i + 1)]);
    for (const side of [-1, 1]) {
      const road = at(i, 0.5, side * (hw - 0.3));
      assert.ok(onLand(road.x, road.z), `край дороги у отрезка ${i} (${side}) не на суше`);
      if (side > 0 ? tr.openR[i] : tr.openL[i]) {
        const water = at(i, 0.5, side * (hwMax + 0.8));
        assert.ok(!onLand(water.x, water.z), `за причалом у отрезка ${i} суша`);
      } else {
        // стена: отбойник или покрышки — до 1,4 м за краем, дальше ещё бетон до LAND_MARGIN
        for (const t of [0.25, 0.5, 0.75]) {
          const wall = at(i, t, side * (hwAt(i, t) + 1.4));
          assert.ok(onLand(wall.x, wall.z), `стена у отрезка ${i} (${side}) над водой`);
        }
      }
    }
  }
});

test('каналы: сам рукав воды в суше доходит дальше стены — глубина по ходу гонки как в RING_CANALS', () => {
  const starts = gapStarts();
  assert.equal(RING_CANALS.length, starts.length);
  starts.forEach((g, k) => {
    // на середине провала: на RING_CANALS[k] − 1 м за левым краем — вода, дальше за канал — суша
    let m = g;
    while (tr.gap[m]) m = wrapSeg(tr, m + 1);
    const mid = wrapSeg(tr, g + Math.round((m - g) / 2));
    const hw = hwAt(mid, 0.5);
    const near = at(mid, 0.5, -(hw + RING_CANALS[k] - 1));
    assert.ok(!onLand(near.x, near.z), `канал ${k} мельче ${RING_CANALS[k]} м`);
    const far = at(mid, 0.5, -(hw + RING_CANALS[k] + 4));
    assert.ok(onLand(far.x, far.z), `за каналом ${k} нет суши`);
  });
});

/** Расстояние от точки до осевой (ломаной) */
function toAxis(x: number, z: number): { d: number; hw: number } {
  let best = Infinity;
  let hw = 0;
  for (let i = 0; i < tr.n; i++) {
    const j = (i + 1) % tr.n;
    const dx = tr.px[j] - tr.px[i];
    const dz = tr.pz[j] - tr.pz[i];
    const t = Math.max(0, Math.min(1, ((x - tr.px[i]) * dx + (z - tr.pz[i]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - tr.px[i] - dx * t, z - tr.pz[i] - dz * t);
    if (d - tr.hw[i] < best - hw) {
      best = d;
      hw = tr.hw[i];
    }
  }
  return { d: best, hw };
}

/** Ближе всего к краю дороги по периметру прямоугольника, м */
function rectClearance(x0: number, z0: number, x1: number, z1: number): number {
  let m = Infinity;
  const look = (x: number, z: number): void => {
    const a = toAxis(x, z);
    m = Math.min(m, a.d - a.hw);
  };
  for (let k = 0; k <= 40; k++) {
    const f = k / 40;
    const x = x0 + (x1 - x0) * f;
    const z = z0 + (z1 - z0) * f;
    look(x, z0);
    look(x, z1);
    look(x0, z);
    look(x1, z);
  }
  return m;
}

/** Все четыре угла и середина прямоугольника на суше */
function rectOnLand(x0: number, z0: number, x1: number, z1: number): boolean {
  return onLand(x0, z0) && onLand(x1, z1) && onLand(x0, z1) && onLand(x1, z0) && onLand((x0 + x1) / 2, (z0 + z1) / 2);
}

/** Прямоугольник пересекает полосу рельсов контейнера или площадку под кран */
function overRails(x0: number, z0: number, x1: number, z1: number): boolean {
  for (const m of tr.hz.movers) {
    if (m.kind !== 0) continue;
    // путь контейнера плюс вылет назад в двор: 9 м и полоса шириной 7 м
    const ex = m.bx - m.ax;
    const ez = m.bz - m.az;
    const l = Math.hypot(ex, ez);
    const ux = ex / l;
    const uz = ez / l;
    for (let s = -9; s <= l + 4; s += 1) {
      const px = m.ax + ux * s;
      const pz = m.az + uz * s;
      if (px > x0 - 3.5 && px < x1 + 3.5 && pz > z0 - 3.5 && pz < z1 + 3.5) return true;
    }
  }
  return false;
}

test('декор: площадки, склады, резервуары и краны — на суше, не ближе 2 м от края дороги, вне рельсов', () => {
  assert.ok(deco.yards.length >= 6 && deco.cranes.length >= 4 && deco.sheds.length >= 1 && deco.tanks.length >= 1);
  const rects: Array<[string, number, number, number, number]> = [];
  for (const y of deco.yards) {
    assert.ok(rectOnLand(y.x0, y.z0, y.x1, y.z1), `площадка ${y.x0},${y.z0} не на суше`);
    assert.ok(rectClearance(y.x0, y.z0, y.x1, y.z1) >= 2, `площадка ${y.x0},${y.z0} у самой дороги`);
    assert.ok(!overRails(y.x0, y.z0, y.x1, y.z1), `площадка ${y.x0},${y.z0} на рельсах контейнера`);
    rects.push([`площадка ${y.x0},${y.z0}`, y.x0, y.z0, y.x1, y.z1]);
  }
  for (const s of deco.sheds) {
    assert.ok(rectOnLand(s.x0, s.z0, s.x1, s.z1), `склад ${s.x0},${s.z0} не на суше`);
    assert.ok(rectClearance(s.x0, s.z0, s.x1, s.z1) >= 2, `склад ${s.x0},${s.z0} у самой дороги`);
    rects.push([`склад ${s.x0},${s.z0}`, s.x0, s.z0, s.x1, s.z1]);
  }
  for (const t of deco.tanks) {
    assert.ok(rectOnLand(t.x - t.r, t.z - t.r, t.x + t.r, t.z + t.r), `резервуар ${t.x},${t.z} не на суше`);
    assert.ok(rectClearance(t.x - t.r, t.z - t.r, t.x + t.r, t.z + t.r) >= 2, `резервуар ${t.x},${t.z} у самой дороги`);
    rects.push([`резервуар ${t.x},${t.z}`, t.x - t.r, t.z - t.r, t.x + t.r, t.z + t.r]);
  }
  for (const c of deco.cranes) {
    // поворот на ±90° меняет стороны местами
    const swap = Math.abs(Math.sin(c.yaw)) > 0.5;
    const hx = swap ? CRANE_HALF_Z : CRANE_HALF_X;
    const hz = swap ? CRANE_HALF_X : CRANE_HALF_Z;
    assert.ok(rectOnLand(c.x - hx, c.z - hz, c.x + hx, c.z + hz), `кран ${c.x},${c.z} не на суше`);
    assert.ok(toAxis(c.x, c.z).d > tr.half + 2, `кран ${c.x},${c.z} стоит на дороге`);
    assert.ok(rectClearance(c.x - hx, c.z - hz, c.x + hx, c.z + hz) >= 2, `опоры крана ${c.x},${c.z} у самой дороги`);
    assert.ok(!overRails(c.x - hx, c.z - hz, c.x + hx, c.z + hz), `кран ${c.x},${c.z} на рельсах контейнера`);
    rects.push([`кран ${c.x},${c.z}`, c.x - hx, c.z - hz, c.x + hx, c.z + hz]);
  }
  // площадки не налезают друг на друга и на склады/краны (запас 1 м)
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [na, ax0, az0, ax1, az1] = rects[i];
      const [nb, bx0, bz0, bx1, bz1] = rects[j];
      const clash = ax0 < bx1 + 1 && ax1 > bx0 - 1 && az0 < bz1 + 1 && az1 > bz0 - 1;
      assert.ok(!clash, `${na} и ${nb} налезают друг на друга`);
    }
  }
  // щиты и бытовки — на суше
  for (const s of deco.signs) assert.ok(onLand(s.x, s.z), `щит ${s.text} не на суше`);
});

test('прогресс непрерывен через линию и растёт по кругу', () => {
  const L = tr.length;
  const loc = makeLoc();
  locateAny(tr, tr.grid[0].x, tr.grid[0].z, loc);
  assert.ok(Math.abs(progress(tr, 0, 12, loc.seg, loc.t) - (L - 6)) < 1e-6);
  assert.equal(progress(tr, 1, 0, 0, 0), L);
  assert.ok(Math.abs(progress(tr, 1, 0, tr.n - 1, 0.5) - (L - tr.len[tr.n - 1] / 2)) < 1e-6, 'сдал назад за линию');
  let prev = -Infinity;
  let cp = 0;
  for (let i = 0; i < tr.n; i++) {
    while (cp < 12 && i >= tr.cpSeg[cp + 1]) cp++;
    const p = progress(tr, 1, cp, i, 0.5);
    assert.ok(p > prev, `прогресс у отрезка ${i}`);
    prev = p;
  }
  // и при смене контрольной точки прогресс не скачет: у границы КТ разница — не больше шага отрезка
  for (let k = 1; k <= 12; k++) {
    const s = tr.cpSeg[k];
    const before = progress(tr, 1, k - 1, s - 1, 0.5);
    const after = progress(tr, 1, k, s, 0.5);
    assert.ok(after > before && after - before < 2.5, `скачок прогресса на КТ ${k}: ${after - before}`);
  }
});

test('две сборки трассы совпадают бит в бит, включая ширину и помехи', () => {
  const a = buildTrack(RING);
  const b = buildTrack(RING);
  for (const key of ['px', 'pz', 'h', 's', 'len', 'tx', 'tz', 'curv', 'hw', 'legAt'] as const) {
    assert.deepEqual(Buffer.from(a[key].buffer), Buffer.from(b[key].buffer), key);
  }
  for (const key of ['gap', 'openL', 'openR', 'leg', 'cpSeg'] as const) {
    assert.deepEqual(Buffer.from(a[key].buffer), Buffer.from(b[key].buffer), key);
  }
  assert.equal(a.length, b.length);
  assert.deepEqual(a.grid, b.grid);
  assert.deepEqual(a.crates, b.crates);
  assert.deepEqual(a.hz, b.hz);
  // и суша двух сборок одинакова
  const la = buildRing().land;
  const lb = buildRing().land;
  assert.deepEqual(Buffer.from(la.poly.buffer), Buffer.from(lb.poly.buffer));
});

test('в общей физике трассы — только точная арифметика (без Math.sin, atan2, ** и т. п.)', () => {
  for (const f of ['shared/track.ts', 'shared/maps/ring.ts', 'shared/kart.ts', 'shared/hazards.ts']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const bad = src.match(/Math\.(?:a?sinh?|a?cosh?|a?tanh?|atan2|exp|expm1|log|log1p|log2|log10|pow|hypot|cbrt|random)\b|\*\*/g);
    assert.equal(bad, null, `${f}: ${bad}`);
  }
});
