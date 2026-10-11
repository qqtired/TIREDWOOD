// Новая набережная (PLAZA3), пакеты WP3 «Игровой квартал», WP5 «Пляж», WP6 «Арены и скалы»: режимы стоят на новых местах, а не
// там, где были на старой площади, и ничему не мешают — бильярдная лоджия у воды (столы, столбы, крыша, батуты свободны),
// музыкальный автомат в ротонде лицом на север, мяч на «Розе ветров», доска аквапарка не прижата к балюстраде, стенка
// примерочной у зеркала, круги старта у ворот Склада №3 и арки крепости, скала и доска «Подземелья» под поворот входа.
// Раскладка выбирается при импорте (shared/layout.ts): сначала PLAZA3=1, потом — только динамический import().
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { circleProblems, overlapProblems } from './lobbycheck.ts';

process.env.PLAZA3 = '1';
const { PLAZA3 } = await import('../shared/layout.ts');
const lobby = await import('../shared/maps/lobby.ts');
const { P3 } = await import('../shared/plaza3/layout.ts');
const { CollisionWorld } = await import('../shared/world.ts');
const { PLAYER_HALF, PLAYER_HEIGHT } = await import('../shared/constants.ts');
const bl = await import('../shared/billiards.ts');
const { billiardsTableGuards } = await import('../shared/tableguard.ts');
const jb = await import('../shared/jukebox.ts');
const { BALL_DROP_Y, BALL_HOME, BALL_R, makeBall, stepBall } = await import('../shared/ball.ts');
const { AQUA_BOARD, AQUA_JETTY } = await import('../shared/aqua.ts');
const { PLANE_EXIT, PLANE_SIGN, PLANE_USE } = await import('../shared/plane.ts');
const { START_DWELL_TICKS, START_ZONES } = await import('../shared/startzones.ts');
const p2 = await import('../shared/plaza2.ts');
const { Hub } = await import('../server/hub.ts');
const { Profiles } = await import('../server/profiles.ts');
const { Store } = await import('../server/store.ts');
const { SMOKE, lastOf, login, newKey, placeAt, setupHub, steps } = await import('./kit.ts');

const map = lobby.buildLobby();
const world = new CollisionWorld(map);
const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** Игрок встаёт целиком в точку (x, z) на пол y и не упирается ни в одну коробку карты */
function standFree(x: number, z: number, y = 0): boolean {
  const H = PLAYER_HALF;
  return !world.overlaps(x - H, y + 0.01, z - H, x + H, y + PLAYER_HEIGHT, z + H) && Math.abs(world.groundBelow(x, y + 0.5, z) - y) < 1e-9;
}

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

test('plaza3: тест идёт в раскладке 3', () => {
  assert.equal(PLAZA3, true);
});

// ------------------------------------------------------------ WP3: игровой квартал

test('бильярд: лоджия x 33…48,4, z 13,6…21,8, конёк 5,5, свес 3,4; столы (36,5 / 41 / 45,5; 17,7) внутри неё', () => {
  const H = bl.BL_HALL;
  assert.deepEqual([H.x0, H.x1, H.z0, H.z1, H.roofY, H.eaveY], [33, 48.4, 13.6, 21.8, 5.5, 3.4]);
  assert.deepEqual(bl.BL_TABLES.map((t) => [t.x, t.z]), [[36.5, 17.7], [41, 17.7], [45.5, 17.7]]);
  for (const t of bl.BL_TABLES) {
    assert.ok(t.x - bl.BL_OUT_HX > H.x0 && t.x + bl.BL_OUT_HX < H.x1 && t.z - bl.BL_OUT_HZ > H.z0 && t.z + bl.BL_OUT_HZ < H.z1, `стол ${t.x} в лоджии`);
  }
  // колонны модели pav_billiards: север и юг по четырём x, торцы — на z 17,7 (юг сдвинут к северу, чтобы не пересечь rail.east)
  assert.equal(bl.BL_POSTS.length, 10);
  for (const x of [33.2, 38.75, 43.25, 48.2]) assert.ok(bl.BL_POSTS.some(([px, pz]) => px === x && pz === 13.9) && bl.BL_POSTS.some(([px, pz]) => px === x && pz === 21.66));
  assert.ok(bl.BL_POSTS.some(([px, pz]) => px === 33.2 && pz === 17.7) && bl.BL_POSTS.some(([px, pz]) => px === 48.2 && pz === 17.7));
  assert.equal(bl.BL_POST_HALF, 0.13);
  assert.equal(bl.BL_POST_H, 3.1);
});

test('бильярд: места у столов свободны и на полу, колпаки столов — до свеса 3,4, крыши навеса над батутами пляжа больше нет', () => {
  for (let t = 0; t < bl.BL_TABLE_COUNT; t++) {
    for (const side of [0, 1]) {
      const s = bl.blSpot(t, side);
      assert.ok(standFree(s.x, s.z), `место ${t}/${side} (${s.x}; ${s.z}) свободно`);
    }
  }
  const guards = billiardsTableGuards();
  assert.equal(guards.length, 3);
  for (const g of guards) assert.equal(g.max[1], 3.4);
  // твёрдое лоджии (столы, колпаки, колонны, «крыша») не пересекает ничего из блокаута
  assert.deepEqual(overlapProblems(map, map.billiardsBoxes.filter((i) => !guards.some((g) => map.boxes[i].min[1] === g.min[1] && map.boxes[i].max[1] === g.max[1]))), []);
  // старый навес стоял над батутами пляжа (−18,5; −10,5), (−10,5; −10,5), (−14,5; −17,4): над ними невидимых боксов выше пояса нет
  for (const [tx, tz] of lobby.PLAZA_TRAMPOLINES) {
    for (const i of map.billiardsBoxes) {
      const b = map.boxes[i];
      assert.ok(b.min[0] > tx + 3 || b.max[0] < tx - 3 || b.min[2] > tz + 3 || b.max[2] < tz - 3, `бокс бильярда ${i} над батутом (${tx}; ${tz})`);
    }
  }
});

test('бильярд: «крыша» карты для дождя — на лоджии, а не на старом месте', () => {
  const cover = bl.billiardsCover();
  assert.ok(cover.length > 10);
  for (const c of cover) {
    assert.ok(c.min[0] > 32 && c.max[0] < 49 && c.min[2] >= 13.6 - 1e-9 && c.max[2] <= 22.01, `полоса крыши ${c.min}…${c.max}`);
    assert.ok(c.max[1] <= 5.6 && c.max[1] >= 3.4, `высота ${c.max[1]}`);
  }
});

test('музыкальный автомат: в ротонде (15; 10,2), лицом на север, на подиуме 0,36; место заказа — с севера', () => {
  assert.deepEqual([jb.JUKEBOX.x, jb.JUKEBOX.z, jb.JUKEBOX.yaw], [15, 10.2, 0]);
  assert.equal(jb.JUKEBOX_Y, 0.36);
  const use = jb.JUKE_USE;
  assert.equal(use.x, 15);
  assert.ok(near(use.z, 10.2 - jb.JUKE_D / 2 - 0.85), `JUKE_USE.z ${use.z}`);
  assert.ok(use.z < jb.JUKEBOX.z, 'игрок стоит севернее автомата, лицом к его лицу');
  const [plaza, barkas] = jb.JUKE_SPOTS;
  assert.deepEqual([plaza.x, plaza.y, plaza.z, plaza.yaw, plaza.use], [15, 0.36, 10.2, 0, use]);
  assert.equal(barkas.yaw, 0);
  assert.equal(jb.jukeNearest(use.x, use.z), 0);
  // точка «juke» на карте — на месте заказа; корпус твёрдый, рядом с колоннами ротонды не пересекается, место заказа свободно
  const it = map.interact.find((i) => i.kind === 'juke' && i.arg === 0)!;
  assert.deepEqual([it.x, it.z], [use.x, use.z]);
  // пол ротонды — подиум 0,36 (боксы pav.rotunda.floor_* по модели, WP9)
  assert.ok(standFree(use.x, use.z, jb.JUKEBOX_Y), 'у автомата можно стоять');
  const body = map.boxes[map.jukeBoxes[0]];
  assert.deepEqual([body.min[0], body.max[0], body.min[2], body.max[2]], [15 - jb.JUKE_W / 2, 15 + jb.JUKE_W / 2, 10.2 - jb.JUKE_D / 2, 10.2 + jb.JUKE_D / 2]);
  assert.deepEqual(overlapProblems(map, map.jukeBoxes), []);
});

test('музыкальный автомат: заказ через хаб с нового места принимается, с места старой площади — нет', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-p3-juke-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 11, 18) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, weather: 'clear', jukebox: true });
  const far = login(hub, 'Tester1', newKey(), '10.3.0.1');
  placeAt(hub, far.c, -8.6, -3.2 + 1.24);
  hub.onJson(far.c, { t: 'juke', song: 1 } as never);
  assert.equal(lastOf(far.s, 'jukeRes')?.ok, false, 'у старого места автомата — далеко');
  const here = login(hub, 'Tester2', newKey(), '10.3.0.2');
  placeAt(hub, here.c, jb.JUKE_USE.x, jb.JUKE_USE.z);
  hub.onJson(here.c, { t: 'juke', song: 1 } as never);
  assert.equal(lastOf(here.s, 'jukeRes')?.ok, true);
});

test('мяч: дом — «Роза ветров» (8; −8), там пусто, мяч падает и ложится рядом', () => {
  assert.deepEqual({ ...BALL_HOME }, { x: P3.center.x, z: P3.center.z });
  assert.deepEqual([BALL_HOME.x, BALL_HOME.z], [8, -8]);
  assert.equal(world.overlaps(BALL_HOME.x - 1, 0.01, BALL_HOME.z - 1, BALL_HOME.x + 1, BALL_DROP_Y + 1, BALL_HOME.z + 1), false, 'вокруг дома мяча (2 × 2 м, до неба) нет боксов');
  const b = makeBall();
  Object.assign(b, { x: BALL_HOME.x, y: BALL_DROP_Y, z: BALL_HOME.z, vx: 0, vy: 0, vz: 0, still: 0, grounded: false });
  for (let i = 0; i < 60 * 8 && b.still < 20; i++) stepBall(b, world);
  assert.ok(Math.abs(b.y - BALL_R) < 0.01, `лежит на настиле: ${b.y}`);
  assert.ok(Math.hypot(b.x - BALL_HOME.x, b.z - BALL_HOME.z) < 0.5, `лёг у дома: (${b.x}; ${b.z})`);
});

test('курзал: «Топ проигравших» (65,55; 4,8) висит на восточной стене изнутри, автоматы стоят у стены галереи', () => {
  // восточная стена курзала изнутри — x 65,6 (блокаут pav.kurzal.e), экран на 5 см перед ней (client/lobby/losers.ts)
  const wall = P3.colliders.find((c) => c.id === 'pav.kurzal.e')!;
  assert.equal(wall.min[0], 65.6);
  assert.ok(wall.min[2] < 4.8 - 3 && wall.max[2] > 4.8 + 3, 'экран шириной 6 м целиком на стене');
  assert.ok(near(lobby.MACHINE_FRONT_Z, 2.9, 1e-9) && lobby.MACHINE_XS.length === 5);
  assert.ok(lobby.MACHINE_XS.every((x) => x > 51 && x < 63), 'автоматы между арками галереи');
  for (const m of map.machines) assert.ok(standFree(m.x, lobby.MACHINE_FRONT_Z + 1), 'перед автоматом можно стоять');
});

// ------------------------------------------------------------ WP5: пляж

test('аквапарк: доска рекордов — в 2 м от балюстрады угла, столбики свободны, к мостику ведёт проход', () => {
  assert.deepEqual({ ...AQUA_BOARD }, { x: -27.6, z: 13.6 });
  const rail = P3.colliders.find((c) => c.id === 'rail.westCorner')!;
  const posts = [-0.62, 0.62].map((dz) => map.boxes.findIndex((b) => near(b.min[0], AQUA_BOARD.x - 0.06) && near(b.min[2], AQUA_BOARD.z + dz - 0.06)));
  assert.ok(posts.every((i) => i >= 0), 'два столбика доски в карте');
  const gap = map.boxes[posts[0]].min[0] - rail.max[0];
  assert.ok(gap >= 1.9, `между столбиками и балюстрадой ${gap.toFixed(2)} м`);
  assert.deepEqual(overlapProblems(map, posts), []);
  // от мостика аквапарка (x −30, z 7,5…10,5) к доске и к площади можно пройти: точка перед доской и точка у мостика свободны
  assert.ok(standFree(AQUA_BOARD.x + 1.2, AQUA_BOARD.z), 'перед доской можно стоять');
  assert.ok(standFree(AQUA_JETTY.x1 + 1.5, 9), 'у мостика можно стоять');
});

test('примерочная: стенка на 0,5 м длиннее прежней и доходит до зеркала, зеркало и точка «E» свободны', () => {
  const wall = map.boxes.find((b) => b.min[0] === -29.5 && b.min[2] === -6 && b.max[2] === 0)!;
  assert.ok(wall, 'бокс примерочной');
  assert.equal(wall.max[0], -25.5);
  assert.ok(near(map.zones.kiosk.x1, wall.max[0]), 'зона киоска и бокс заканчиваются вместе');
  // стекло зеркала висит в 9 см перед стенкой (client/lobby/world.ts buildKiosk: fx + 0.085), по высоте и ширине внутри неё
  assert.ok(map.mirror.z > wall.min[2] + 0.5 && map.mirror.z < wall.max[2] - 0.5);
  const kiosk = map.interact.find((i) => i.kind === 'kiosk')!;
  assert.ok(standFree(kiosk.x, kiosk.z), 'у примерочной можно стоять');
  assert.ok(Math.hypot(kiosk.x - map.mirror.x, kiosk.z - map.mirror.z) < 2.5, 'точка рядом с зеркалом');
});

test('гидроплан: стоянка, место посадки и табличка свободны, будка аэроклуба не лезет на них', () => {
  assert.ok(standFree(PLANE_USE.x, PLANE_USE.z), 'PLANE_USE');
  assert.ok(standFree(PLANE_EXIT.x, PLANE_EXIT.z), 'PLANE_EXIT');
  const hut = map.boxes.find((b) => near(b.min[0], -29.6) && near(b.max[0], -26.6) && near(b.min[2], -20.5));
  assert.ok(hut, 'будка в блокауте');
  assert.ok(hut!.max[2] < PLANE_SIGN.z - 1, 'табличка в 1 м и дальше от будки');
});

// ------------------------------------------------------------ WP6: арены и скалы

test('круги старта: пейнтбол — у ворот Склада №3 (8; −28,2), крепость — на 0,9 м перед аркой (26; −28,1), оба свободны', () => {
  const [paint, fort] = START_ZONES;
  assert.deepEqual([paint.kind, paint.x, paint.z], ['paintball', 8, -28.2]);
  assert.equal(paint.x, lobby.FORT_ARCH.x - 18);
  assert.deepEqual([fort.kind, fort.x, fort.z], ['fort', lobby.FORT_ARCH.x, lobby.FORT_ARCH.z + 0.9]);
  const gate = map.interact.find((i) => i.kind === 'pb_gate')!;
  assert.deepEqual([gate.x, gate.z], [paint.x, paint.z]);
  const all = map.boxes.map((_, i) => i);
  assert.deepEqual(circleProblems(map, all, START_ZONES.map((z) => ({ x: z.x, z: z.z, r: z.r, name: z.kind }))), []);
  for (const z of START_ZONES) assert.ok(standFree(z.x, z.z), `круг ${z.kind}`);
});

test('круги старта: с нового места пейнтбол и крепость запускаются через хаб за 3 секунды', () => {
  const [paint, fort] = START_ZONES;
  const a = setupHub();
  const p = login(a.hub, 'Tester7');
  placeAt(a.hub, p.c, paint.x, paint.z);
  steps(a.hub, START_DWELL_TICKS - 1);
  assert.equal(p.c.room?.kind, 'lobby');
  steps(a.hub, 2);
  assert.equal(p.c.room?.kind, 'paintball');
  const b = setupHub({ fort: true });
  const f = login(b.hub, 'Tester8');
  placeAt(b.hub, f.c, fort.x, fort.z);
  steps(b.hub, START_DWELL_TICKS + 1);
  assert.equal(f.c.room?.kind, 'fort');
});

test('«Подземелье»: корень входа (−20,25; −34,8), yaw 0,803; E и возврат — та же точка модели; доска не закрывает зев', () => {
  const R = p2.DUNGEON_ROCK;
  assert.deepEqual([R.x, R.z, R.yaw], [-20.25, -34.8, 0.803]);
  // локальная точка (−0,06; 3,96) модели plaza_entrance → мир: x + lx·cos + lz·sin, z − lx·sin + lz·cos
  const lx = -0.06;
  const lz = 3.96;
  const wx = R.x + lx * Math.cos(R.yaw) + lz * Math.sin(R.yaw);
  const wz = R.z - lx * Math.sin(R.yaw) + lz * Math.cos(R.yaw);
  assert.ok(Math.hypot(wx - lobby.DUNGEON_USE.x, wz - lobby.DUNGEON_USE.z) < 0.05, `E (${lobby.DUNGEON_USE.x}; ${lobby.DUNGEON_USE.z}) против (${wx.toFixed(2)}; ${wz.toFixed(2)})`);
  const use = map.interact.find((i) => i.kind === 'dungeon')!;
  assert.deepEqual([use.x, use.z], [lobby.DUNGEON_USE.x, lobby.DUNGEON_USE.z]);
  assert.ok(standFree(use.x, use.z), 'у входа можно стоять');
  assert.ok(standFree(lobby.DUNGEON_RETURN.x, lobby.DUNGEON_RETURN.z), 'точка возврата свободна');
  // доска стоит левее оси зева (от середины зева (−18,0; −32,9) вдоль взгляда), не ближе 3 м к ней
  const B = p2.DUNGEON_BOARD;
  const dx = Math.sin(R.yaw);
  const dz = Math.cos(R.yaw);
  const off = Math.abs((B.x + 18.01) * dz - (B.z + 32.89) * dx);
  assert.ok(off > 3, `доска в ${off.toFixed(1)} м от оси зева`);
  assert.ok(Math.abs(B.yaw - R.yaw) < 1e-9, 'доска повёрнута как вход');
});

test('«Подземелье»: твёрдое входа (доска, бочка, вагонетка, фонари) — за флагом режима, не пересекает скалу и круги', () => {
  const ids = map.plazaModeBoxes.dungeon;
  assert.equal(ids.length, 10);
  // ни один бокс входа не пересекает бокс блокаута (скалу cliff.*, дорожки, ступени)
  for (const i of ids) {
    for (const j of map.plaza3Boxes ?? []) {
      const a = map.boxes[i];
      const b = map.boxes[j];
      const d = [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]));
      assert.ok(!d.every((v) => v > 1e-6), `бокс входа ${i} пересекает бокс блокаута ${j}`);
    }
  }
  // доска — три бокса по диагонали, под ней и между столбами не пролезть
  const board = ids.slice(0, 3).map((i) => map.boxes[i]);
  for (const b of board) assert.ok(b.max[1] - b.min[1] >= 3.2 - 1e-9);
  // без флага режима бокса нет
  const off = setupHub();
  const lobbyWorld = off.hub.lobby.world;
  for (const i of ids) assert.equal(lobbyWorld.overlaps(map.boxes[i].min[0] + 0.05, 0.5, map.boxes[i].min[2] + 0.05, map.boxes[i].max[0] - 0.05, 1.5, map.boxes[i].max[2] - 0.05), false, `бокс ${i} выключен без DUNGEON`);
});

test('вход крепости: точка E и круг старта — у одной арки, оба в зоне досягаемости друг друга', () => {
  const fortIt = map.interact.find((i) => i.kind === 'fort')!;
  const fort = START_ZONES[1];
  assert.ok(Math.hypot(fortIt.x - fort.x, fortIt.z - fort.z) <= fortIt.r, `E (${fortIt.x}; ${fortIt.z}) против круга (${fort.x}; ${fort.z})`);
  assert.equal(fortIt.x, lobby.FORT_ARCH.x);
});
