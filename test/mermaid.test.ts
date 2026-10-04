// Русалка у мостков (владелец: «чтоб она иногда выплывала и махала рукой, раз в 5 минут, рандомно с одной из сторон, и
// сердечки над ней»). Здесь — расписание и ход одного появления: одно появление на окно, между соседними 4–6 минут,
// стороны случайные, у всех игроков одно и то же (чистая функция серверного тика), а место считается по местам рыбалки и
// настилу, а не по координатам: сдвинут или удлинят пирс — русалка окажется у мест рыбалки сама.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE, WATER_Y } from '../shared/constants.ts';
import type { FishSpot } from '../shared/fishplaces.ts';
import { CRITTER_QUIET_ZONE } from '../shared/maps/critters.ts';
import { FISH_SPOTS, STATUE, buildLobby } from '../shared/maps/lobby.ts';
import type { MapBox } from '../shared/maps/types.ts';
import {
  MERMAID_CUE, MERMAID_DIST, MERMAID_FROM_S, MERMAID_HEARTS, MERMAID_REST, MERMAID_SHOW_S, MERMAID_SPREAD_S, MERMAID_T, MERMAID_WINDOW_S,
  buildMermaidLayout, lobbyMermaidLayout, mermaidAt, mermaidFrame, mermaidHeart, mermaidShow, newMermaidFrame, type MermaidHeart, type MermaidLayout,
  type MermaidShow,
} from '../shared/mermaid.ts';

const N = 2000;
const map = buildLobby();
const layout = lobbyMermaidLayout(map.boxes);
const show = (n: number, l: MermaidLayout = layout, side?: number): MermaidShow => mermaidShow(n, l, side)!;
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): MapBox => ({ min: [x0, y0, z0], max: [x1, y1, z1], mat: 'wood', color: 0 });

test('одно появление на окно: подряд идущие тики дают ровно один непрерывный отрезок длиной MERMAID_SHOW_S, и он внутри своего окна', () => {
  const windows = 60;
  let prevN = -1;
  let first = -1;
  const spans = new Map<number, { from: number; to: number; pieces: number }>();
  for (let tick = 0; tick < windows * MERMAID_WINDOW_S * TICK_RATE; tick++) {
    const at = mermaidAt(tick, layout);
    if (!at) { prevN = -1; continue; }
    const s = spans.get(at.show.n);
    if (!s) spans.set(at.show.n, { from: tick, to: tick, pieces: 1 });
    else {
      if (prevN !== at.show.n) s.pieces++;
      s.to = tick;
    }
    prevN = at.show.n;
    assert.ok(at.age >= 0 && at.age < MERMAID_SHOW_S, 'возраст появления внутри показа');
    assert.equal(at.show.n, Math.floor(tick / TICK_RATE / MERMAID_WINDOW_S), 'появление — своего окна');
    if (first < 0) first = tick;
  }
  assert.equal(spans.size, windows, 'в каждом окне по одному появлению');
  for (const [n, s] of spans) {
    assert.equal(s.pieces, 1, `окно ${n}: одним куском`);
    assert.ok(Math.abs((s.to - s.from + 1) / TICK_RATE - MERMAID_SHOW_S) < 0.05, `окно ${n}: длится ${MERMAID_SHOW_S} с`);
    assert.ok(s.from >= n * MERMAID_WINDOW_S * TICK_RATE && s.to < (n + 1) * MERMAID_WINDOW_S * TICK_RATE, `окно ${n}: не вылезает из окна`);
  }
  assert.ok(first >= MERMAID_FROM_S * TICK_RATE - 1, 'после запуска сервера первые две минуты — тихо');
  assert.equal(mermaidAt(-1, layout), null);
  assert.equal(mermaidAt(NaN, layout), null);
  assert.equal(mermaidAt(Math.round(160 * TICK_RATE), { sides: [] }), null, 'нет мест рыбалки у настила — её просто нет');
});

test('между соседними появлениями 4–6 минут (240…360 с), в среднем около 5, разброс действительно используется', () => {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let n = 0; n < N; n++) {
    const gap = show(n + 1).start - show(n).start;
    assert.ok(gap > MERMAID_WINDOW_S - MERMAID_SPREAD_S && gap < MERMAID_WINDOW_S + MERMAID_SPREAD_S, `окно ${n}: пауза ${gap} с`);
    min = Math.min(min, gap);
    max = Math.max(max, gap);
    sum += gap;
  }
  assert.ok(min >= 240 && max <= 360, `${min}…${max}`);
  assert.ok(min < 255 && max > 345, `разброс используется (${min.toFixed(0)}…${max.toFixed(0)} с)`);
  assert.ok(Math.abs(sum / N - 300) < 5, `в среднем ${(sum / N).toFixed(1)} с`);
  for (let n = 0; n < N; n++) {
    const s = show(n);
    assert.ok(s.start >= n * 300 + 120 && s.start < n * 300 + 180, 'начало — на 120…180-й секунде окна');
    assert.ok(s.start + MERMAID_SHOW_S < (n + 1) * MERMAID_WINDOW_S, 'показ кончается до следующего окна');
  }
});

/** Точка на настиле (как в shared/mermaid.ts: верх у пола, низ под водой) */
const decks = map.boxes.filter((b) => b.max[1] > -0.1 && b.max[1] < 0.3 && b.min[1] < -0.2);
const onDeck = (x: number, z: number): boolean => decks.some((d) => x >= d.min[0] && x <= d.max[0] && z >= d.min[2] && z <= d.max[2]);

test('борта и промежутки выведены из мест рыбалки и настила: два борта мостков, промежутки между соседними местами, на кромке настила', () => {
  const rows = [...new Set(FISH_SPOTS.filter((s) => (s.zone ?? 'pier') === 'pier' && s.z < 38).map((s) => s.z))].sort((a, b) => a - b);
  assert.deepEqual(rows, [25, 28.5, 32, 35.5]);
  assert.equal(layout.sides.length, 2, 'у мостков два борта: восточный и западный');
  assert.deepEqual(layout.sides.map((s) => s.name).sort(), ['восток', 'запад']);
  for (const side of layout.sides) {
    // места борта — все, что смотрят в эту сторону на мостках (не баркас): 4 на самих мостках и 1 на площадке маяка
    const same = FISH_SPOTS.filter((p) => (p.zone ?? 'pier') === 'pier' && Math.abs(-Math.sin(p.yaw) - side.dx) < 1e-9 && Math.abs(-Math.cos(p.yaw) - side.dz) < 1e-9);
    assert.equal(side.spots, same.length);
    const zs = side.lanes.map((l) => l.z).sort((a, b) => a - b);
    // каждый промежуток — ровно посередине между двумя соседними местами борта (вдоль кромки) и на самой кромке настила:
    // чуть ближе к мосткам — настил, чуть дальше — вода. Так и для ближних мостков, и для дальних, и для площадки у дома рыбака
    const along = (p: { x: number; z: number }): number => -p.x * side.dz + p.z * side.dx;
    const us = same.map(along).sort((a, b) => a - b);
    for (const lane of side.lanes) {
      const u = along(lane);
      assert.ok(us.some((v, i) => i + 1 < us.length && Math.abs(u - (v + us[i + 1]) / 2) < 1e-6), `${side.name}: промежуток (${lane.x}, ${lane.z}) — посередине между соседними местами`);
      assert.ok(onDeck(lane.x - side.dx * 0.1, lane.z - side.dz * 0.1) && !onDeck(lane.x + side.dx * 0.1, lane.z + side.dz * 0.1), `${side.name}: промежуток (${lane.x}, ${lane.z}) на кромке настила`);
    }
    assert.ok(zs.includes(30.25) && zs.includes(33.75), 'середина и юг мостков — у обоих бортов');
    // первый промежуток у берега (26,75) с западного борта — у памятника: там её нет (тихая зона)
    if (side.dx < 0) assert.ok(!zs.includes(26.75), 'запад: у памятника не всплывает');
  }
  // пирс удлинили (дальние мостки и площадка с домом рыбака) — она всплывает и там, раскладка подхватила новые места сама
  assert.ok(layout.sides.every((d) => d.lanes.some((l) => l.z > 45)), 'у дальних мостков — с обоих бортов');
  // перепутанный порядок мест даёт те же борта
  const shuffled = [...FISH_SPOTS].reverse();
  assert.deepEqual(buildMermaidLayout(shuffled, map.boxes), layout);
  // баркас и одиночные места на площадке маяка бортами не считаются
  assert.deepEqual(buildMermaidLayout(FISH_SPOTS.filter((s) => s.zone === 'barkas'), map.boxes), { sides: [] });
  assert.deepEqual(buildMermaidLayout(FISH_SPOTS.slice(6, 12), map.boxes), { sides: [] });
});

test('стороны случайные: обе встречаются поровну, без длинных серий; расстояние от кромки 3,4–5,6 м; оба промежутка в деле', () => {
  const sides = [0, 0];
  const lanes = new Map<string, number>();
  let run = 0;
  let longest = 0;
  let prev = -1;
  for (let n = 0; n < N; n++) {
    const s = show(n);
    sides[s.side]++;
    run = s.side === prev ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = s.side;
    const def = layout.sides[s.side];
    const lane = def.lanes[s.lane];
    const out = (s.x - lane.x) * def.dx + (s.z - lane.z) * def.dz;
    assert.ok(out >= MERMAID_DIST[0] - 1e-9 && out <= MERMAID_DIST[1] + 1e-9, `окно ${n}: ${out.toFixed(2)} м от кромки`);
    assert.ok(Math.abs((s.x - lane.x) * -def.dz + (s.z - lane.z) * def.dx) <= 0.25 + 1e-9, 'вдоль кромки — не дальше четверти метра от середины промежутка');
    const key = `${s.side}:${s.lane}`;
    lanes.set(key, (lanes.get(key) ?? 0) + 1);
  }
  assert.ok(Math.abs(sides[0] - sides[1]) < N * 0.06, `борта ${sides}`);
  assert.ok(longest < 20, `самая длинная серия одного борта — ${longest}`);
  assert.equal(lanes.size, layout.sides.reduce((n, d) => n + d.lanes.length, 0), 'все промежутки всех бортов в деле');
  // каждый промежуток — не реже 60 % своей ровной доли (борт — половина показов, внутри борта — поровну)
  for (const [key, c] of lanes) {
    const side = layout.sides[Number(key.split(':')[0])];
    assert.ok(c > 0.6 * N / layout.sides.length / side.lanes.length, `ни один промежуток не забыт (${key}: ${c})`);
  }
  // принудительный борт (отладка) меняет только борт и место
  const a = show(7, layout, 0);
  const b = show(7, layout, 1);
  assert.equal(a.side, 0);
  assert.equal(b.side, 1);
  assert.notEqual(Math.sign(layout.sides[0].dx), Math.sign(layout.sides[1].dx));
  assert.equal(a.start, b.start);
  assert.equal(a.seed, b.seed);
  assert.equal(show(7, layout, 2).side, 0, 'номер борта — по кругу');
});

test('у всех одинаково: появление — чистая функция тика (порядок вызовов и «кто смотрит» ничего не меняют)', () => {
  const ticks = Array.from({ length: 400 }, (_, i) => Math.floor((i * 7919 + 13) % 4_000_000));
  const forward = ticks.map((t) => JSON.stringify(mermaidAt(t, layout)));
  const shows = ticks.map((t) => JSON.stringify(mermaidShow(Math.floor(t / TICK_RATE / MERMAID_WINDOW_S), layout)));
  const backward = [...ticks].reverse().map((t) => JSON.stringify(mermaidAt(t, layout))).reverse();
  assert.deepEqual(forward, backward);
  // «второй клиент» с той же раскладкой, но своей копией: между вызовами первого считает другие окна (общий кэш не должен путать)
  const copy = lobbyMermaidLayout(buildLobby().boxes);
  assert.deepEqual(copy, layout, 'раскладка у каждого клиента одна и та же');
  for (let i = 0; i < ticks.length; i++) {
    mermaidShow(5, copy);
    mermaidShow(1234, layout);
    assert.equal(JSON.stringify(mermaidAt(ticks[i], copy)), forward[i]);
    const n = Math.floor(ticks[i] / TICK_RATE / MERMAID_WINDOW_S);
    assert.equal(JSON.stringify(mermaidShow(n, layout)), shows[i]);
  }
  // кто вошёл посреди появления, видит ту же секунду: возраст зависит только от тика
  const s = show(3);
  const tick = Math.round((s.start + 4.5) * TICK_RATE);
  const at = mermaidAt(tick, layout)!;
  assert.ok(Math.abs(at.age - 4.5) < 1 / TICK_RATE);
  assert.ok(Math.abs(mermaidAt(tick + 3, layout)!.age - at.age - 3 / TICK_RATE) < 1e-9);
});

test('место в воде: не на настиле и не на твёрдом, далеко от памятника, между рядами мест — леска не закрыта', () => {
  const rows = FISH_SPOTS.filter((s) => (s.zone ?? 'pier') === 'pier');
  for (let side = 0; side < layout.sides.length; side++) {
    const def = layout.sides[side];
    for (let n = 0; n < 300; n++) {
      const s = show(n, layout, side);
      const R = 1.05;
      for (const k of map.boxes) {
        // водная толща вокруг неё: от дна до двух метров над водой (настил, берег, лодки, баркас, мель, колонны)
        const hit = s.x + R > k.min[0] && s.x - R < k.max[0] && s.z + R > k.min[2] && s.z - R < k.max[2] && k.max[1] > WATER_Y - 0.3 && k.min[1] < WATER_Y + 2.4;
        assert.ok(!hit, `окно ${n}, борт ${def.name}: (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) задевает твёрдое ${JSON.stringify(k.min)}…${JSON.stringify(k.max)}`);
      }
      assert.ok(Math.hypot(s.x - STATUE.x, s.z - STATUE.z) > CRITTER_QUIET_ZONE.r + 2, 'от памятника — за его тихой зоной с запасом');
      // леска идёт по ряду мест своего борта: от русалки до линии заброса любого места этого борта — не меньше 1,4 м
      for (const p of rows) {
        if (Math.abs(-Math.sin(p.yaw) - def.dx) > 1e-9 || Math.abs(-Math.cos(p.yaw) - def.dz) > 1e-9) continue;
        const across = Math.abs((s.x - p.x) * -def.dz + (s.z - p.z) * def.dx);
        assert.ok(across > 1.4, `от ряда мест (${p.x}, ${p.z}) — не ближе 1,4 м, а тут ${across.toFixed(2)}`);
      }
      // смотрит в сторону настила: на кромку напротив, а не в море
      const fx = -Math.sin(s.yaw);
      const fz = -Math.cos(s.yaw);
      assert.ok(fx * def.dx + fz * def.dz < -0.9, 'повернувшись, смотрит на мостки');
    }
  }
});

/** Ровный пирс вдоль оси: настил, ряды мест с двух сторон (yaw — куда смотрят) и вдоль какой оси идёт */
function straightPier(rows: readonly number[], x0 = -21, x1 = -17, zFrom = 22, zTo = 60): { spots: FishSpot[]; boxes: MapBox[] } {
  const spots: FishSpot[] = [];
  for (const z of rows) spots.push({ x: x0 + 0.55, z, yaw: Math.PI / 2 }, { x: x1 - 0.55, z, yaw: -Math.PI / 2 });
  return { spots, boxes: [box(x0, -0.6, zFrom, x1, 0, zTo)] };
}

test('удлинили пирс и добавили места — русалка сама оказывается у новых мест; сдвинули — сдвигается', () => {
  const base = straightPier([25, 28.5, 32, 35.5], -21, -17, 22, 38);
  const baseLayout = buildMermaidLayout(base.spots, base.boxes, null);
  assert.deepEqual(baseLayout.sides.map((s) => s.lanes.map((l) => l.z).sort((a, b) => a - b)), [[26.75, 30.25, 33.75], [26.75, 30.25, 33.75]]);
  // пирс удлинили в море до z = 60: ряды мест продолжили
  const longRows = [25, 28.5, 32, 35.5, 39, 42.5, 46, 49.5, 53, 56.5];
  const long = straightPier(longRows);
  const longLayout = buildMermaidLayout(long.spots, long.boxes, null);
  assert.equal(longLayout.sides.length, 2);
  const mids = longRows.slice(1).map((z, i) => (z + longRows[i]) / 2);
  for (const side of longLayout.sides) assert.deepEqual(side.lanes.map((l) => l.z).sort((a, b) => a - b), mids, `${side.name}: промежутки между всеми новыми рядами`);
  const seen: number[] = [];
  for (let n = 0; n < 600; n++) {
    const s = mermaidShow(n, longLayout)!;
    seen.push(s.z);
    // всегда рядом с настилом и между рядами: рядом с каким-то промежутком, а не посреди пустого моря
    assert.ok(mids.some((m) => Math.abs(m - s.z) <= 0.25 + 1e-9), `окно ${n}: z ${s.z} не у промежутка`);
    const edge = s.x < -19 ? -21 - s.x : s.x + 17;
    assert.ok(edge >= 3.4 - 1e-9 && edge <= 5.6 + 1e-9, 'на 3–6 м от кромки');
  }
  assert.ok(Math.max(...seen) > 52 && Math.min(...seen) < 28, `появляется вдоль всего пирса (${Math.min(...seen).toFixed(1)}…${Math.max(...seen).toFixed(1)})`);
  // всё сдвинули на 10 м в сторону моря и на 3 м вбок: промежутки сдвинулись так же
  const moved = straightPier(longRows.map((z) => z + 10), -21 + 3, -17 + 3, 32, 70);
  const movedLayout = buildMermaidLayout(moved.spots, moved.boxes, null);
  for (let i = 0; i < 2; i++) {
    const a = longLayout.sides[i];
    const b = movedLayout.sides[i];
    assert.equal(a.name, b.name);
    const key = (l: { x: number; z: number }): string => `${l.x.toFixed(6)},${l.z.toFixed(6)}`;
    assert.deepEqual(b.lanes.map(key).sort(), a.lanes.map((l) => key({ x: l.x + 3, z: l.z + 10 })).sort());
  }
  // дом рыбака на конце, шире настила: вода у него не свободна — там не всплывает, у остальных мест по-прежнему
  const house = [...long.boxes, box(-24, 0, 55.5, -14, 4, 59)];
  const houseLayout = buildMermaidLayout(long.spots, house, null);
  assert.equal(houseLayout.sides.length, 2);
  for (const side of houseLayout.sides) assert.deepEqual(side.lanes.map((l) => l.z).sort((a, b) => a - b), mids.slice(0, -1), `${side.name}: у дома не всплывает, у остальных мест — как было`);
  // пирс вдоль другой оси (места смотрят на север и на юг): борта считаются по направлению, а не «запад/восток»
  const sideways: FishSpot[] = [];
  for (const x of [-30, -26.5, -23, -19.5]) sideways.push({ x, z: 10.55, yaw: 0 }, { x, z: 13.45, yaw: Math.PI });
  const swLayout = buildMermaidLayout(sideways, [box(-34, -0.6, 10, -16, 0, 14)], null);
  assert.deepEqual(swLayout.sides.map((s) => s.name).sort(), ['север', 'юг']);
  for (let n = 0; n < 50; n++) {
    const s = mermaidShow(n, swLayout)!;
    assert.ok(s.z < 10 - 3.3 || s.z > 14 + 3.3, 'вынырнула в море с одной из сторон настила');
    assert.ok(s.x > -30 && s.x < -19.5, 'между рядами мест вдоль пирса');
  }
});

test('ход появления: всплеск, поворот к мосткам, три взмаха, сердечки, нырок с хвостом, под воду — и всё это за 6–8 секунд', () => {
  const T = MERMAID_T;
  const sh = show(11, layout, 1);
  const f = newMermaidFrame();
  assert.equal(mermaidFrame(sh, -0.5, f).shown, false);
  assert.ok(f.lift < -2, 'до выхода — под водой');
  // выныривает: поднимается, мелькает над водой, оседает по пояс
  let prev = mermaidFrame(sh, 0, f).lift;
  for (let a = 0.05; a <= T.apex; a += 0.05) {
    const l = mermaidFrame(sh, a, f).lift;
    assert.ok(l >= prev - 1e-9, `поднимается (${a.toFixed(2)})`);
    prev = l;
  }
  assert.ok(mermaidFrame(sh, T.apex, f).lift > 0.3 && f.air, 'на вершине тело над водой');
  assert.ok(Math.abs(mermaidFrame(sh, T.settle + 0.3, f).lift - MERMAID_REST) < 0.04 && !f.air, 'по пояс в воде');
  // поворачивается к мосткам: сначала отвёрнута, потом смотрит точно на них
  assert.ok(Math.abs(mermaidFrame(sh, 0.2, f).yaw - sh.yaw) > 0.7);
  assert.ok(Math.abs(mermaidFrame(sh, T.turnTo + 0.01, f).yaw - sh.yaw) < 1e-6);
  // три взмаха: за время взмахов взмах меняет знак ровно 6 раз (три туда-обратно); рука внизу, потом вверху, потом снова внизу
  assert.equal(mermaidFrame(sh, 0.5, f).hand, 0);
  assert.ok(mermaidFrame(sh, T.handTop + 1, f).hand > 0.99);
  let flips = 0;
  let sign = 0;
  for (let a = T.handTop; a < T.handTop + T.swings * T.swingS; a += 0.01) {
    mermaidFrame(sh, a, f);
    const s = Math.sign(f.swing);
    if (s !== 0 && sign !== 0 && s !== sign) flips++;
    if (s !== 0) sign = s;
    assert.ok(Math.abs(f.swing) <= 1 + 1e-9);
  }
  assert.ok(flips >= 4 && flips <= 6, `взмахов ${flips / 2}`);
  assert.equal(mermaidFrame(sh, T.handEnd + 0.1, f).hand, 0);
  assert.ok(Math.abs(f.swing) < 1e-9, 'после взмахов рука не качается');
  // сердечки: нет до начала, одновременно несколько, нет после
  const heart: MermaidHeart = { ox: 0, oz: 0, oy: 0, size: 0, alpha: 0, roll: 0 };
  const alive = (age: number): number => Array.from({ length: MERMAID_HEARTS }, (_, i) => mermaidHeart(sh, i, age, heart)).filter(Boolean).length;
  assert.equal(alive(1.5), 0);
  assert.ok(alive(4) >= 4 && alive(4) <= MERMAID_HEARTS, `в разгар — ${alive(4)} сердечек`);
  assert.equal(alive(MERMAID_SHOW_S - 0.05), 0, 'к концу все растаяли');
  for (let a = 0; a < MERMAID_SHOW_S; a += 0.05) for (let i = 0; i < MERMAID_HEARTS; i++) if (mermaidHeart(sh, i, a, heart)) {
    assert.ok(heart.alpha >= 0 && heart.alpha <= 1 && heart.size >= 0 && heart.size <= 0.6, 'сердечки небольшие и прозрачность 0…1');
    assert.ok(heart.oy >= 1.4 && heart.oy <= 3.3, 'всплывают над головой');
    assert.ok(Math.abs(heart.ox) < 0.7 && Math.abs(heart.oz) < 0.4);
  }
  // сердечки всплывают: с каждым кадром выше; тают: прозрачность в конце ниже, чем в середине жизни
  mermaidHeart(sh, 3, T.heartsFrom + 3 * T.heartsGap + 0.3, heart);
  const y0 = heart.oy;
  const a0 = heart.alpha;
  mermaidHeart(sh, 3, T.heartsFrom + 3 * T.heartsGap + 1.0, heart);
  assert.ok(heart.oy > y0, 'всплывает');
  assert.ok(mermaidHeart(sh, 3, T.heartsFrom + 3 * T.heartsGap + 2.2, heart) && heart.alpha < a0, 'тает');
  // нырок через 6–8 с после выхода: клонится вперёд, хвост машет над водой, уходит на глубину
  assert.ok(T.dive >= 6 && T.dive <= 8, `ныряет на ${T.dive} с`);
  assert.ok(MERMAID_CUE.up >= 0 && MERMAID_CUE.up < T.apex);
  assert.ok(MERMAID_CUE.down > T.dive && MERMAID_CUE.down < T.dive + T.diveS && MERMAID_CUE.down < MERMAID_SHOW_S);
  let maxPitch = 0;
  let maxFlick = 0;
  let prevLift = Infinity;
  for (let a = T.dive; a <= T.dive + T.diveS; a += 0.02) {
    mermaidFrame(sh, a, f);
    maxPitch = Math.max(maxPitch, f.pitch);
    maxFlick = Math.max(maxFlick, Math.abs(f.flick));
    assert.ok(f.lift <= prevLift + 0.03, 'при нырке только вниз');
    prevLift = f.lift;
    assert.ok(f.air && f.hand === 0);
  }
  assert.ok(maxPitch > 1.8, 'клонится вперёд так, что хвост над водой');
  assert.ok(maxFlick > 0.25, 'хвост машет');
  assert.ok(mermaidFrame(sh, T.dive + T.diveS, f).lift < -2.5, 'в конце нырка — глубоко');
  assert.equal(mermaidFrame(sh, T.dive + T.diveS + 0.3, f).shown, false);
  assert.equal(mermaidFrame(sh, MERMAID_SHOW_S, f).shown, false);
  assert.ok(MERMAID_SHOW_S > T.dive + T.diveS + 0.2, 'после ныряния есть время на круги и последние сердечки');
});
