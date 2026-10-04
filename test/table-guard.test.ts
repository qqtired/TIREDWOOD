// Столы набережной — не подиум: на столики кафе (дурак, блэкджек) и бильярдные столы не встать ни прыжком, ни рывком,
// ни ступенькой, сверху на колпак не попасть; к стульям и местам у бильярда подойти и сесть можно, встать — тоже.
// Физика общая (shared/sim.ts) — так считают и сервер, и предсказание клиента.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BL_HALL, BL_OUT_HX, BL_OUT_HZ, BL_TABLES, blSpot } from '../shared/billiards.ts';
import { PLAYER_HALF, PLAYER_HEIGHT } from '../shared/constants.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { BTN_BACK, BTN_DASH, BTN_FORWARD, BTN_JUMP, makeEvents, makeState, stepPlayer, type PlayerState } from '../shared/sim.ts';
import {
  BILLIARDS_TABLE_TOP, CAFE_GUARD_TOP, CAFE_TABLE_HALF, CAFE_TABLE_TOP, TRAMPOLINE_APEX, billiardsTableGuards, cafeTableGuards,
} from '../shared/tableguard.ts';
import { CollisionWorld } from '../shared/world.ts';

const map = buildLobby();
const ev = makeEvents();

interface Table { x: number; z: number; hx: number; hz: number; top: number }
const cafe: Table[] = map.tables.map((t) => ({ ...t, hx: CAFE_TABLE_HALF, hz: CAFE_TABLE_HALF, top: CAFE_TABLE_TOP }));
const billiards: Table[] = BL_TABLES.map((t) => ({ ...t, hx: BL_OUT_HX, hz: BL_OUT_HZ, top: BILLIARDS_TABLE_TOP }));

/** Номер бокса карты с такими границами */
function boxIndex(min: readonly number[], max: readonly number[]): number {
  return map.boxes.findIndex((b) => b.min.every((v, i) => Math.abs(v - min[i]) < 1e-9) && b.max.every((v, i) => Math.abs(v - max[i]) < 1e-9));
}
const guardIdx = [...cafeTableGuards(map.tables), ...billiardsTableGuards()].map((g) => boxIndex(g.min, g.max));

/** Взгляд из (x, z) на (tx, tz): yaw = 0 — на −Z */
const yawTo = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z));

/** Стоит ли тело желейки хоть краем над столешницей (по x и z) */
const overTable = (s: PlayerState, t: Table): boolean =>
  Math.abs(s.x - t.x) < t.hx + PLAYER_HALF - 1e-6 && Math.abs(s.z - t.z) < t.hz + PLAYER_HALF - 1e-6;

function standing(x: number, z: number): PlayerState {
  const s = makeState();
  s.x = x;
  s.z = z;
  s.grounded = 1;
  return s;
}

/** Разбег к столу с разных сторон: прыжок на разных тиках, рывок, торможение в воздухе. Попал ли хоть раз на стол. */
function climbAttempts(w: CollisionWorld, t: Table): { tries: number; onTable: number } {
  let tries = 0;
  let onTable = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const x = t.x + Math.sin(a) * (Math.abs(Math.sin(a)) * t.hx + Math.abs(Math.cos(a)) * t.hz + PLAYER_HALF + 0.7);
    const z = t.z + Math.cos(a) * (Math.abs(Math.sin(a)) * t.hx + Math.abs(Math.cos(a)) * t.hz + PLAYER_HALF + 0.7);
    const yaw = yawTo(x, z, t.x, t.z);
    for (const jump of [0, 3, 7]) {
      for (const brake of [-1, 9, 14, 20]) {
        for (const dash of [-1, jump + 3]) {
          const s = standing(x, z);
          tries++;
          let hit = false;
          for (let tick = 0; tick < 90; tick++) {
            let b = tick < brake || brake < 0 ? BTN_FORWARD : tick < brake + 14 ? BTN_BACK : 0;
            if (tick === jump) b |= BTN_JUMP;
            if (tick === dash) b |= BTN_DASH;
            stepPlayer(s, { seq: tick + 1, buttons: b, yaw, pitch: 0, viewTick: 0 }, w, false, 1, ev);
            if (overTable(s, t)) hit = true;
          }
          if (hit) onTable++;
        }
      }
    }
  }
  return { tries, onTable };
}

test('колпаки лежат ровно на столешницах и не шире их; над кафе — выше прыжка с батута, у бильярда — до крыши', () => {
  assert.ok(guardIdx.every((i) => i >= 0), 'все колпаки есть в карте');
  for (const i of guardIdx) assert.equal(map.boxes[i].mat, 'invisible');
  for (const t of map.tables) {
    const table = boxIndex([t.x - CAFE_TABLE_HALF, 0, t.z - CAFE_TABLE_HALF], [t.x + CAFE_TABLE_HALF, CAFE_TABLE_TOP, t.z + CAFE_TABLE_HALF]);
    assert.ok(table >= 0 && map.boxes[table].mat === 'wood', `стол (${t.x}; ${t.z}) на месте`);
  }
  assert.ok(CAFE_GUARD_TOP > TRAMPOLINE_APEX + 1, `верх колпака ${CAFE_GUARD_TOP} выше вершины прыжка с батута ${TRAMPOLINE_APEX.toFixed(2)}`);
  const roof = map.billiardsBoxes.map((i) => map.boxes[i]).find((b) => b.min[1] === BL_HALL.eaveY);
  assert.ok(roof, 'крыша навеса в карте');
  for (const g of billiardsTableGuards()) {
    assert.ok(map.billiardsBoxes.includes(boxIndex(g.min, g.max)), 'колпак бильярда включается флагом BILLIARDS вместе со столом');
    assert.equal(g.max[1], roof.min[1], 'колпак упирается в крышу');
  }
  // бильярдные столы и колпаки — до плитки оформления площади (она в самом конце списка)
  assert.ok(Math.max(...guardIdx) < map.plazaBoxes[0]);
});

test('на стол не встать: прыжок с разбега, рывок, торможение в воздухе — со всех сторон; без колпаков — получалось', () => {
  const w = new CollisionWorld(map);
  for (const t of [...cafe, ...billiards]) {
    const r = climbAttempts(w, t);
    assert.equal(r.onTable, 0, `стол (${t.x}; ${t.z}): ${r.onTable} из ${r.tries} попыток над столешницей`);
  }
  // контроль: без колпаков те же попытки забираются на стол — значит, проверка настоящая
  const bare = new CollisionWorld(map);
  for (const i of guardIdx) bare.setEnabled(i, false);
  for (const t of [cafe[0], billiards[1]]) assert.ok(climbAttempts(bare, t).onTable > 0, `без колпака на стол (${t.x}; ${t.z}) забирались`);
});

test('ступенькой на стол не взойти, шаг в стол — без подъёма', () => {
  const w = new CollisionWorld(map);
  for (const t of [...cafe, ...billiards]) {
    const s = standing(t.x - t.hx - PLAYER_HALF - 0.3, t.z);
    let maxY = 0;
    for (let tick = 0; tick < 60; tick++) {
      stepPlayer(s, { seq: tick + 1, buttons: BTN_FORWARD, yaw: -Math.PI / 2, pitch: 0, viewTick: 0 }, w, false, 1, ev);
      maxY = Math.max(maxY, s.y);
    }
    assert.equal(maxY, 0, `у стола (${t.x}; ${t.z}) подняло на ${maxY}`);
    assert.ok(t.x - s.x >= t.hx + PLAYER_HALF - 1e-6, 'упёрся в край стола');
  }
});

test('к стульям кафе подойти, сесть и встать можно; к местам у бильярда — тоже', () => {
  const w = new CollisionWorld(map);
  const free = (x: number, z: number): boolean => !w.overlaps(x - PLAYER_HALF, 0.01, z - PLAYER_HALF, x + PLAYER_HALF, PLAYER_HEIGHT, z + PLAYER_HALF);
  const walk = (s: PlayerState, yaw: number, buttons: number, ticks: number): void => {
    for (let tick = 0; tick < ticks; tick++) stepPlayer(s, { seq: tick + 1, buttons, yaw, pitch: 0, viewTick: 0 }, w, false, 1, ev);
  };
  const chairs = map.interact.filter((i) => i.kind === 'durak' || i.kind === 'blackjack');
  assert.equal(chairs.length, 18);
  for (const it of chairs) {
    assert.ok(free(it.x, it.z), `стул ${it.arg} свободен`);
    const t = map.tables[Math.floor(it.arg / 6)];
    const ux = (it.x - t.x) / Math.hypot(it.x - t.x, it.z - t.z);
    const uz = (it.z - t.z) / Math.hypot(it.x - t.x, it.z - t.z);
    // подход снаружи: дошёл до стула (E срабатывает в радиусе точки)
    const s = standing(it.x + ux * 1.6, it.z + uz * 1.6);
    walk(s, yawTo(s.x, s.z, it.x, it.z), BTN_FORWARD, 12);
    assert.ok(Math.hypot(s.x - it.x, s.z - it.z) <= it.r, `до стула ${it.arg} не дойти: ${Math.hypot(s.x - it.x, s.z - it.z).toFixed(2)}`);
    // встал со стула — отходит назад и вбок
    for (const turn of [0, Math.PI / 2, -Math.PI / 2]) {
      const up = standing(it.x, it.z);
      walk(up, yawTo(0, 0, ux, uz) + turn, BTN_FORWARD, 20);
      assert.ok(Math.hypot(up.x - it.x, up.z - it.z) > 1, `со стула ${it.arg} не отойти (${turn})`);
      assert.equal(up.y, 0);
    }
  }
  for (let i = 0; i < BL_TABLES.length; i++) {
    for (const side of [0, 1]) {
      const sp = blSpot(i, side);
      assert.ok(free(sp.x, sp.z), `место ${i}/${side} у бильярда свободно`);
      const out = side === 0 ? -1 : 1;
      const s = standing(sp.x + out * 1.5, sp.z);
      walk(s, yawTo(s.x, s.z, sp.x, sp.z), BTN_FORWARD, 9);
      assert.ok(Math.hypot(s.x - sp.x, s.z - sp.z) < 0.6, `к месту ${i}/${side} не подойти`);
    }
  }
});

test('без флага BILLIARDS над бильярдными столами пусто, как и сами столы', () => {
  const w = new CollisionWorld(map);
  for (const i of map.billiardsBoxes) w.setEnabled(i, false);
  for (const t of BL_TABLES) assert.ok(!w.overlaps(t.x - 0.1, 0.01, t.z - 0.1, t.x + 0.1, 3.5, t.z + 0.1), `стол (${t.x}; ${t.z}) выключен целиком`);
});
