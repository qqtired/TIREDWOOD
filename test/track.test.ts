// Трассы картинга — геометрия. «Портовое кольцо» (harbor) и «Солнечный серпантин» (hills): замкнутая дорога без
// изломов, ширина и обочины (трава, песок) меняются плавно, рельеф без ступенек (острые перегибы — только гребни и
// трамплины), контрольные точки, решётка, ящики, поиск отрезка с поверхностью под колёсами, прогресс по кругу.
// Порт: два трамплина через каналы, причалы без стен, суша под дорогой, декор. Серпантин: подъём, гребень, река.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { HILLS, HILLS_FOUNTAIN_NODE, buildHills, hillsFountain } from '../shared/maps/hills.ts';
import { CRANE_HALF_X, CRANE_HALF_Z, RING, RING_CANALS, buildRing } from '../shared/maps/ring.ts';
import { landHas } from '../shared/maps/ringland.ts';
import {
  KERB_TOL, NO_GROUND, SURF_GRASS, SURF_ROAD, SURF_SAND, buildTrack, locate, locateAny, makeLoc, nodeArc, onGround, progress, wrapSeg,
  type Track, type TrackDef,
} from '../shared/track.ts';

const TRACKS: Array<{ id: string; def: TrackDef; tr: Track }> = [
  { id: 'harbor', def: RING, tr: buildRing().track },
  { id: 'hills', def: HILLS, tr: buildHills().track },
];
const { track: tr, land, deco } = buildRing();
const hills = buildHills().track;
const onLand = (x: number, z: number): boolean => landHas(land, x, z);

/** Точка у отрезка i: доля t по нему, lat — вправо по ходу */
function at(t0: Track, i: number, t: number, lat: number): { x: number; z: number } {
  return {
    x: t0.px[i] + t0.tx[i] * t0.len[i] * t - t0.tz[i] * lat,
    z: t0.pz[i] + t0.tz[i] * t0.len[i] * t + t0.tx[i] * lat,
  };
}

/** Полуширина дороги у отрезка i на доле t */
function hwAt(t0: Track, i: number, t: number): number {
  const j = wrapSeg(t0, i + 1);
  return t0.hw[i] + (t0.hw[j] - t0.hw[i]) * t;
}

/** Начала провалов (каналов под трамплинами) по ходу гонки */
function gapStarts(t0: Track): number[] {
  const starts: number[] = [];
  for (let i = 0; i < t0.n; i++) if (t0.gap[i] && !t0.gap[wrapSeg(t0, i - 1)]) starts.push(i);
  return starts;
}

test('кольцо замкнуто: отрезки до 2 м без изломов, длина круга, ширина и обочины меняются плавно', () => {
  for (const { id, tr: t0 } of TRACKS) {
    assert.ok(t0.length > 1050 && t0.length < 1250, `${id}: круг ${t0.length} м`);
    for (let i = 0; i < t0.n; i++) {
      assert.ok(t0.len[i] > 0.1 && t0.len[i] <= 2 + 1e-9, `${id}: отрезок ${i}: ${t0.len[i]} м`);
      const j = wrapSeg(t0, i + 1);
      // самые крутые дуги (r 7) при шаге 2 м — меньше 12° на точку
      assert.ok(t0.tx[i] * t0.tx[j] + t0.tz[i] * t0.tz[j] > 0.978, `${id}: излом в точке ${j}`);
      const e = at(t0, i, 1, 0);
      assert.ok(Math.abs(e.x - t0.px[j]) < 1e-9 && Math.abs(e.z - t0.pz[j]) < 1e-9, `${id}: разрыв после отрезка ${i}`);
      assert.ok(t0.hw[i] >= 3.7 && t0.hw[i] <= 7.5 + 1e-9, `${id}: ширина в точке ${i}: ${t0.hw[i] * 2}`);
      // ширина — не больше 0,1 м на метр пути, обочина — не больше 0,6
      assert.ok(Math.abs(t0.hw[j] - t0.hw[i]) <= 0.1 * t0.len[i] + 1e-9, `${id}: скачок ширины у отрезка ${i}`);
      for (const v of [t0.vl, t0.vr]) {
        assert.ok(v[i] >= 0 && v[i] <= 20, `${id}: обочина ${v[i]}`);
        assert.ok(Math.abs(v[j] - v[i]) <= 0.6 * t0.len[i] + 1e-9, `${id}: скачок обочины у отрезка ${i}`);
      }
    }
    assert.ok(Math.abs(t0.s[t0.n - 1] + t0.len[t0.n - 1] - t0.length) < 1e-9);
    assert.equal(t0.half, Math.max(...t0.hw));
  }
});

test('рельеф без ступенек: уклон до 26%, острые перегибы — только гребни и трамплины', () => {
  const sharp: Record<string, number> = {};
  for (const { id, tr: t0 } of TRACKS) {
    sharp[id] = 0;
    for (let i = 0; i < t0.n; i++) {
      const j = wrapSeg(t0, i + 1);
      const k = wrapSeg(t0, j + 1);
      if (t0.gap[i]) continue;
      const s1 = (t0.h[j] - t0.h[i]) / t0.len[i];
      assert.ok(Math.abs(s1) <= 0.26, `${id}: уклон ${s1.toFixed(3)} у отрезка ${i}`);
      if (t0.gap[j]) continue;
      const s2 = (t0.h[k] - t0.h[j]) / t0.len[j];
      if (Math.abs(s2 - s1) > 0.1) sharp[id]++;
    }
  }
  // порт: горб на восточном причале и два въезда на трамплины; серпантин: гребень и трамплин над канавой
  assert.deepEqual(sharp, { harbor: 3, hills: 2 });
});

test('серпантин: три шпильки вверх по 3 м, гребень на 11,6 м, дальше спуск к реке; узкий мост', () => {
  const t0 = hills;
  const hAt = (cp: number): number => t0.h[t0.cpSeg[cp]];
  // КТ 2–4 — на подъёмах между шпильками: каждая на 3 м выше; КТ 5 — наверху, на 9 м
  for (let cp = 3; cp <= 4; cp++) assert.ok(Math.abs(hAt(cp) - hAt(cp - 1) - 3) < 0.6, `КТ ${cp}: ${hAt(cp)} после ${hAt(cp - 1)}`);
  assert.ok(Math.abs(hAt(5) - 9) < 0.2, `КТ 5: ${hAt(5)}`);
  let top = 0;
  for (let i = 1; i < t0.n; i++) if (t0.h[i] > t0.h[top]) top = i;
  assert.ok(Math.abs(t0.h[top] - 11.6) < 1e-9);
  assert.equal(t0.leg[top], 9);
  // шпильки — радиус 7 м, по два узла на 90°
  for (const node of [3, 4, 5, 6, 7, 8]) assert.equal(HILLS.nodes[node].r, 7);
  let narrow = Infinity;
  for (let i = 0; i < t0.n; i++) if (t0.leg[i] === 12) narrow = Math.min(narrow, t0.hw[i] * 2);
  assert.ok(Math.abs(narrow - 7.5) < 1e-9, `мост ${narrow} м`);
  // фонтан — внутри своей дуги
  const f = hillsFountain();
  const arc = nodeArc(HILLS, HILLS_FOUNTAIN_NODE);
  assert.deepEqual([f.x, f.z], [arc.cx, arc.cz]);
  assert.ok(arc.r === 30);
});

test('контрольные точки по ходу гонки: КТ 0 — линия старта, остальные — дальше 20 м друг от друга, не над каналом', () => {
  const want: Record<string, number> = { harbor: 9, hills: 12 };
  for (const { id, tr: t0 } of TRACKS) {
    assert.equal(t0.cpSeg.length, want[id], id);
    assert.equal(t0.cpSeg[0], 0);
    for (let k = 1; k < t0.cpSeg.length; k++) assert.ok(t0.s[t0.cpSeg[k]] > t0.s[t0.cpSeg[k - 1]] + 20, `${id}: КТ ${k} слишком близко`);
    assert.ok(t0.length - t0.s[t0.cpSeg[t0.cpSeg.length - 1]] > 20, `${id}: последняя КТ у самой линии`);
    for (let k = 0; k < t0.cpSeg.length; k++) assert.equal(t0.gap[t0.cpSeg[k]], 0, `${id}: КТ ${k} над каналом`);
  }
  // порт: старт на южной прямой курсом на восток; серпантин — на запад
  assert.ok(Math.abs(tr.px[0] + 60) < 1e-9 && Math.abs(tr.pz[0] - 112) < 1e-9 && tr.tx[0] > 0.9999);
  assert.ok(Math.abs(hills.pz[0] - 178) < 1e-9 && hills.tx[0] < -0.9999);
});

test('кривизна: знак — влево +, вправо −; самые крутые дуги — r 7 м; на прямой — ноль', () => {
  const loc = makeLoc();
  // порт: восточный поворот на север (r 36, влево), шикана в бухте (r 7)
  locateAny(tr, 135 - 36 + 36 * Math.cos(Math.PI / 4), 100.53 - 36 + 36 * Math.sin(Math.PI / 4), loc);
  assert.ok(Math.abs(tr.curv[loc.seg] - 1 / 36) < 0.003, `восточный поворот ${tr.curv[loc.seg]}`);
  locateAny(tr, -100, 112, loc);
  assert.ok(Math.abs(tr.curv[loc.seg]) < 1e-9, 'прямая');
  for (const { id, tr: t0 } of TRACKS) {
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < t0.n; i++) {
      lo = Math.min(lo, t0.curv[i]);
      hi = Math.max(hi, t0.curv[i]);
    }
    assert.ok(hi > 1 / 9 && lo < -1 / 7.5 && hi < 1 / 6.9 && lo > -1 / 6.9, `${id}: кривизна ${lo} … ${hi}`);
  }
});

test('решётка: шесть мест за линией, на дороге и не впритык', () => {
  for (const { id, tr: t0 } of TRACKS) {
    assert.equal(t0.grid.length, 6);
    const loc = makeLoc();
    t0.grid.forEach((g, k) => {
      locateAny(t0, g.x, g.z, loc);
      assert.ok(Math.abs(loc.lat) <= loc.hw - 2, `${id}: место ${k} у края`);
      assert.ok(Math.abs(g.hx - t0.tx[0]) < 1e-9 && Math.abs(g.hz - t0.tz[0]) < 1e-9);
      // за линией: по ходу — позади
      assert.ok((g.x - t0.px[0]) * t0.tx[0] + (g.z - t0.pz[0]) * t0.tz[0] < -5, `${id}: место ${k} не за линией`);
      for (let m = 0; m < k; m++) {
        const o = t0.grid[m];
        assert.ok(Math.hypot(g.x - o.x, g.z - o.z) > 2.4, `${id}: места ${m} и ${k} впритык`);
      }
    });
  }
});

test('ящики: ряды по 3–4 поперёк дороги, на асфальте и на высоте дороги', () => {
  const rowsWant: Record<string, number> = { harbor: 7, hills: 5 };
  for (const { id, tr: t0 } of TRACKS) {
    const loc = makeLoc();
    for (const c of t0.crates) {
      locateAny(t0, c.x, c.z, loc);
      assert.ok(Math.abs(loc.lat) <= loc.hw - 1.5, `${id}: ящик ${c.x},${c.z} у края`);
      assert.equal(c.y, t0.h[c.seg]);
      assert.equal(t0.gap[c.seg], 0);
    }
    const rows = new Map<number, number>();
    for (const c of t0.crates) rows.set(c.seg, (rows.get(c.seg) ?? 0) + 1);
    assert.equal(rows.size, rowsWant[id], id);
    for (const [seg, count] of rows) assert.ok(count >= 3 && count <= 4, `${id}: ряд у отрезка ${seg}: ${count} ящиков`);
  }
});

test('порт: два трамплина через каналы по 14 м — на восточном (J1) и северном (J2) причалах', () => {
  const starts = gapStarts(tr);
  assert.equal(starts.length, 2);
  const [j1, j2] = starts;
  assert.equal(tr.leg[j1], 3);
  assert.equal(tr.leg[j2], 8);
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
    const air = at(tr, g0 + 2, 0.5, 0);
    assert.equal(locate(tr, air.x, air.z, g0, loc).ground, NO_GROUND);
  }
  assert.ok(tr.s[j2] - tr.s[j1] > 300, 'трамплины не подряд');
});

test('открытые края: в порту — только справа (причалы и бухта), на серпантине — только у реки слева', () => {
  for (const { id, def, tr: t0 } of TRACKS) {
    for (let i = 0; i < t0.n; i++) {
      for (const side of ['left', 'right'] as const) {
        const got = side === 'left' ? t0.openL[i] : t0.openR[i];
        let want = 0;
        if (t0.leg[i] >= 0) {
          const a = t0.legAt[i];
          const b = a + t0.len[i];
          for (const o of def.open) if (o.side === side && o.leg === t0.leg[i] && a >= o.from - 1e-6 && b <= o.to + 1e-6) want = 1;
        } else if (def.openNodes?.some((o) => o.side === side && o.node === t0.node[i])) want = 1;
        assert.equal(got, want, `${id}: отрезок ${i} (нога ${t0.leg[i]}, узел ${t0.node[i]}) ${side}`);
      }
    }
  }
  assert.ok(tr.openL.every((v) => v === 0));
  assert.ok(hills.openR.every((v) => v === 0));
  for (let i = 0; i < tr.n; i++) if (tr.leg[i] === 0) assert.equal(tr.openR[i], 0, 'на стартовой прямой стены с обеих сторон');
});

test('поиск отрезка восстанавливает точку, окно переходит через линию старта; под колёсами — асфальт, трава или песок', () => {
  for (const { id, tr: t0 } of TRACKS) {
    const loc = makeLoc();
    for (let i = 0; i < t0.n; i++) {
      for (const [t, lat] of [
        [0.3, -2],
        [0.5, 0],
        [0.7, 2],
      ]) {
        const p = at(t0, i, t, lat);
        locate(t0, p.x, p.z, wrapSeg(t0, i - 3), loc);
        // сбоку от очень короткого отрезка между дугами ближе бывает соседний — тогда точка та же в его рамке
        if (loc.seg !== i) {
          assert.ok(t0.len[i] < 1 && Math.abs(wrapSeg(t0, loc.seg - i + 1) - 1) <= 1, `${id}: точка у отрезка ${i} — у ${loc.seg}`);
          const q = at(t0, loc.seg, loc.t, loc.lat);
          assert.ok(Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.z - p.z) < 1e-6, `${id}: отрезок ${i}: рамка соседа`);
          continue;
        }
        assert.ok(Math.abs(loc.t - t) < 1e-6 && Math.abs(loc.lat - lat) < 1e-6, `${id}: отрезок ${i}: t ${loc.t}, lat ${loc.lat}`);
        assert.ok(Math.abs(loc.hw - hwAt(t0, i, t)) < 1e-9, `${id}: ширина в точке отрезка ${i}`);
        assert.equal(loc.surf, SURF_ROAD);
        assert.equal(locateAny(t0, p.x, p.z, loc).seg, i);
      }
      // обочина: за поребриком — трава или песок, как задано у точки
      if (t0.gap[i]) continue;
      for (const side of [-1, 1]) {
        const v = side > 0 ? t0.vr[i] : t0.vl[i];
        if (v < 1) continue;
        const lat = side * (t0.hw[i] + Math.min(v, 1.5) - 0.2);
        const p = at(t0, i, 0, lat);
        locate(t0, p.x, p.z, i, loc);
        if (loc.seg !== i) continue;
        const sand = side > 0 ? t0.sr[i] : t0.sl[i];
        assert.equal(loc.surf, sand ? SURF_SAND : SURF_GRASS, `${id}: обочина у отрезка ${i} (${side})`);
        assert.ok(onGround(loc, 0));
        // на поребрике — ещё асфальт
        const kerb = at(t0, i, 0, side * (t0.hw[i] + KERB_TOL * 0.5));
        assert.equal(locate(t0, kerb.x, kerb.z, i, loc).surf, SURF_ROAD, `${id}: поребрик у отрезка ${i}`);
      }
    }
  }
});

test('обочины серпантина: песок снаружи шпилек и внутри дуги фонтана, трава вдоль гребня', () => {
  const sandOut = (node: number, side: 'l' | 'r'): boolean => {
    for (let i = 0; i < hills.n; i++) if (hills.node[i] === node && (side === 'l' ? hills.sl[i] : hills.sr[i]) && (side === 'l' ? hills.vl[i] : hills.vr[i]) >= 4.9) return true;
    return false;
  };
  for (const [node, side] of [
    [3, 'r'],
    [4, 'r'],
    [5, 'l'],
    [6, 'l'],
    [7, 'r'],
    [8, 'r'],
  ] as const) {
    assert.ok(sandOut(node, side), `шпилька у узла ${node}: песок снаружи`);
  }
  let fountain = 0;
  for (let i = 0; i < hills.n; i++) if (hills.node[i] === HILLS_FOUNTAIN_NODE && hills.sr[i] && hills.vr[i] > 18) fountain++;
  assert.ok(fountain > 10, 'песок внутри дуги фонтана');
  for (let i = 0; i < hills.n; i++) {
    if (hills.leg[i] !== 9 || hills.legAt[i] < 4 || hills.legAt[i] > 60) continue;
    assert.ok(hills.vl[i] >= 2.4 && hills.vr[i] >= 2.4 && !hills.sl[i] && !hills.sr[i], `гребень, отрезок ${i}: трава`);
  }
});

test('порт: суша под дорогой с обочиной и под стенами, за причалами — вода, под провалом — канал', () => {
  for (let i = 0; i < tr.n; i++) {
    const c = at(tr, i, 0.5, 0);
    if (tr.gap[i]) {
      assert.ok(!onLand(c.x, c.z), `провал ${i} над сушей`);
      continue;
    }
    assert.ok(onLand(c.x, c.z), `дорога ${i} не на суше`);
    const hw = hwAt(tr, i, 0.5);
    for (const side of [-1, 1]) {
      const v = side > 0 ? Math.min(tr.vr[i], tr.vr[wrapSeg(tr, i + 1)]) : Math.min(tr.vl[i], tr.vl[wrapSeg(tr, i + 1)]);
      const road = at(tr, i, 0.5, side * (hw + v - 0.3));
      assert.ok(onLand(road.x, road.z), `край дороги у отрезка ${i} (${side}) не на суше`);
      if (side > 0 ? tr.openR[i] : tr.openL[i]) {
        const vMax = side > 0 ? Math.max(tr.vr[i], tr.vr[wrapSeg(tr, i + 1)]) : Math.max(tr.vl[i], tr.vl[wrapSeg(tr, i + 1)]);
        const hwMax = Math.max(tr.hw[i], tr.hw[wrapSeg(tr, i + 1)]);
        const water = at(tr, i, 0.5, side * (hwMax + vMax + 0.8));
        assert.ok(!onLand(water.x, water.z), `за причалом у отрезка ${i} суша`);
      } else {
        for (const t of [0.25, 0.5, 0.75]) {
          const wall = at(tr, i, t, side * (hwAt(tr, i, t) + v + 1.4));
          assert.ok(onLand(wall.x, wall.z), `стена у отрезка ${i} (${side}) над водой`);
        }
      }
    }
  }
});

test('порт: каналы — рукав воды в суше доходит дальше стены, глубина как в RING_CANALS', () => {
  const starts = gapStarts(tr);
  assert.equal(RING_CANALS.length, starts.length);
  starts.forEach((g, k) => {
    let m = g;
    while (tr.gap[m]) m = wrapSeg(tr, m + 1);
    const mid = wrapSeg(tr, g + Math.round((m - g) / 2));
    const hw = hwAt(tr, mid, 0.5) + tr.vl[mid];
    const near = at(tr, mid, 0.5, -(hw + RING_CANALS[k] - 1));
    assert.ok(!onLand(near.x, near.z), `канал ${k} мельче ${RING_CANALS[k]} м`);
    const far = at(tr, mid, 0.5, -(hw + RING_CANALS[k] + 4));
    assert.ok(onLand(far.x, far.z), `за каналом ${k} нет суши`);
  });
});

/** Насколько точка дальше края дороги с обочиной (меньше нуля — на дороге) */
function outside(x: number, z: number): number {
  const loc = locateAny(tr, x, z, makeLoc());
  return Math.abs(loc.lat) - (loc.hw + (loc.lat > 0 ? loc.vr : loc.vl));
}

/** Ближе всего к краю дороги с обочиной по периметру прямоугольника, м */
function rectClearance(x0: number, z0: number, x1: number, z1: number): number {
  let m = Infinity;
  for (let k = 0; k <= 40; k++) {
    const f = k / 40;
    const x = x0 + (x1 - x0) * f;
    const z = z0 + (z1 - z0) * f;
    m = Math.min(m, outside(x, z0), outside(x, z1), outside(x0, z), outside(x1, z));
  }
  return m;
}

function rectOnLand(x0: number, z0: number, x1: number, z1: number): boolean {
  return onLand(x0, z0) && onLand(x1, z1) && onLand(x0, z1) && onLand(x1, z0) && onLand((x0 + x1) / 2, (z0 + z1) / 2);
}

/** Прямоугольник пересекает полосу рельсов контейнера (путь плюс вылет назад во двор) */
function overRails(x0: number, z0: number, x1: number, z1: number): boolean {
  for (const m of tr.hz.movers) {
    if (m.kind !== 0) continue;
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

test('порт: площадки, склады, резервуары и краны — на суше, не ближе 2 м от края дороги с обочиной, вне рельсов', () => {
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
    const swap = Math.abs(Math.sin(c.yaw)) > 0.5;
    const hx = swap ? CRANE_HALF_Z : CRANE_HALF_X;
    const hz = swap ? CRANE_HALF_X : CRANE_HALF_Z;
    assert.ok(rectOnLand(c.x - hx, c.z - hz, c.x + hx, c.z + hz), `кран ${c.x},${c.z} не на суше`);
    assert.ok(rectClearance(c.x - hx, c.z - hz, c.x + hx, c.z + hz) >= 2, `опоры крана ${c.x},${c.z} у самой дороги`);
    assert.ok(!overRails(c.x - hx, c.z - hz, c.x + hx, c.z + hz), `кран ${c.x},${c.z} на рельсах контейнера`);
    rects.push([`кран ${c.x},${c.z}`, c.x - hx, c.z - hz, c.x + hx, c.z + hz]);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [na, ax0, az0, ax1, az1] = rects[i];
      const [nb, bx0, bz0, bx1, bz1] = rects[j];
      const clash = ax0 < bx1 + 1 && ax1 > bx0 - 1 && az0 < bz1 + 1 && az1 > bz0 - 1;
      assert.ok(!clash, `${na} и ${nb} налезают друг на друга`);
    }
  }
  for (const s of deco.signs) assert.ok(onLand(s.x, s.z), `щит ${s.text} не на суше`);
});

test('прогресс непрерывен через линию и растёт по кругу', () => {
  for (const { id, tr: t0 } of TRACKS) {
    const L = t0.length;
    const last = t0.cpSeg.length - 1;
    const loc = makeLoc();
    locateAny(t0, t0.grid[0].x, t0.grid[0].z, loc);
    assert.ok(Math.abs(progress(t0, 0, last, loc.seg, loc.t) - (L - 6)) < 1e-6, id);
    assert.equal(progress(t0, 1, 0, 0, 0), L);
    assert.ok(Math.abs(progress(t0, 1, 0, t0.n - 1, 0.5) - (L - t0.len[t0.n - 1] / 2)) < 1e-6, `${id}: сдал назад за линию`);
    let prev = -Infinity;
    let cp = 0;
    for (let i = 0; i < t0.n; i++) {
      while (cp < last && i >= t0.cpSeg[cp + 1]) cp++;
      const p = progress(t0, 1, cp, i, 0.5);
      assert.ok(p > prev, `${id}: прогресс у отрезка ${i}`);
      prev = p;
    }
    for (let k = 1; k <= last; k++) {
      const s = t0.cpSeg[k];
      const before = progress(t0, 1, k - 1, s - 1, 0.5);
      const after = progress(t0, 1, k, s, 0.5);
      assert.ok(after > before && after - before < 2.5, `${id}: скачок прогресса на КТ ${k}: ${after - before}`);
    }
  }
});

test('две сборки трассы совпадают бит в бит, включая ширину, обочины, рельеф и помехи', () => {
  for (const { def } of TRACKS) {
    const a = buildTrack(def);
    const b = buildTrack(def);
    for (const key of ['px', 'pz', 'h', 's', 'len', 'tx', 'tz', 'curv', 'hw', 'vl', 'vr', 'legAt'] as const) {
      assert.deepEqual(Buffer.from(a[key].buffer), Buffer.from(b[key].buffer), key);
    }
    for (const key of ['gap', 'openL', 'openR', 'sl', 'sr', 'leg', 'node', 'cpSeg'] as const) {
      assert.deepEqual(Buffer.from(a[key].buffer), Buffer.from(b[key].buffer), key);
    }
    assert.equal(a.length, b.length);
    assert.deepEqual(a.grid, b.grid);
    assert.deepEqual(a.crates, b.crates);
    assert.deepEqual(a.hz, b.hz);
  }
  const la = buildRing().land;
  const lb = buildRing().land;
  assert.deepEqual(Buffer.from(la.poly.buffer), Buffer.from(lb.poly.buffer));
});

test('в общей физике трассы — только точная арифметика (без Math.sin, atan2, ** и т. п.)', () => {
  for (const f of ['shared/track.ts', 'shared/maps/ring.ts', 'shared/maps/hills.ts', 'shared/kart.ts', 'shared/hazards.ts']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const bad = src.match(/Math\.(?:a?sinh?|a?cosh?|a?tanh?|atan2|exp|expm1|log|log1p|log2|log10|pow|hypot|cbrt|random)\b|\*\*/g);
    assert.equal(bad, null, `${f}: ${bad}`);
  }
});
