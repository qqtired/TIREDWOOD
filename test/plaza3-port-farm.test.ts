// Новая набережная (флаг PLAZA3), пакеты WP4 «Порт B — Маячный мол», WP7 «Выезд на ферму», WP8 «Жизнь площади»:
// числа раскладки v5.1 (docs/plaza3/level/layout.json → port, farmRoad) попали в код; места ловли на моле стоят на опоре;
// «Удалая», стоянка и пираты не задевают новые коробки; калитка фермы и зона «прошёл — на ферму»; звери ходят по суше;
// гирлянды висят на фонарях и перголе; молнии не бьют у нового порта. Старая площадь не меняется (test/plaza-legacy.test.ts).
// 11.10 (отзыв владельца): видимый настил мола один — модель pav_mole (в карте настилы порта невидимые), места 20–27 — на камне,
// Лавка Семёна со стойкой «Снасти у Семёна» — на помосте у сходней к стоянке.
// Раскладка выбирается при импорте (shared/layout.ts): сначала PLAZA3=1, потом — только динамический import().
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxOverlap, spotProblems } from './lobbycheck.ts';

process.env.PLAZA3 = '1';
const { lastOf, login, placeAt, setupHub, steps } = await import('./kit.ts');
const { PORT, MOLE_DECK_Y } = await import('../shared/plaza3/port.ts');
const { P3 } = await import('../shared/plaza3/layout.ts');
const { buildLobby, CANOPY_POLES } = await import('../shared/maps/lobby.ts');
const { CollisionWorld } = await import('../shared/world.ts');
const F = await import('../shared/fishplaces.ts');
const FE = await import('../shared/ferry.ts');
const OB = await import('../shared/ownboat.ts');
const FB = await import('../shared/fishboat.ts');
const PI = await import('../shared/pirates.ts');
const { PirateNav } = await import('../server/lobby/piratenav.ts');
const { BARKAS_BAK_Y } = await import('../shared/barkas.ts');
const { inIsleWaters } = await import('../shared/maps/isle.ts');
const FM = await import('../shared/farmmap.ts');
const CR = await import('../shared/maps/critters.ts');
const { sampleCritter, critterPeriod } = await import('../client/lobby/crittersim.ts');
const W = await import('../shared/weather.ts');
const SM = await import('../shared/storm.ts');
const MM = await import('../shared/mermaid.ts');
const { FISHERS } = await import('../client/lobby/folk.ts');
const LI = await import('../client/lobby/plaza3/lights.ts');
const { SEASON_FIELD } = await import('../client/lobby/seasonsign.ts');
const PD = await import('../client/lobby/plaza3/pavdata.ts');
const { readFileSync } = await import('node:fs');
const { makeState, makeEvents, stepPlayer, BTN_FORWARD, BTN_ADS } = await import('../shared/sim.ts');
const { TICK_RATE, WATER_Y, PLAYER_HALF } = await import('../shared/constants.ts');
const { FP_IDLE } = await import('../shared/fishing.ts');
const { ACT_FERRY, ACT_FISH } = await import('../shared/lobby.ts');

const map = buildLobby();
const world = new CollisionWorld(map);
const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps;

// ------------------------------------------------------------------ WP4: порт

test('порт B: места 20–27 — на Маячном моле (две на голове, шесть на южной кромке), на высоте мола, номера и порядок прежние', () => {
  assert.equal(F.FISH_FAR_SPOTS.length, 8);
  assert.equal(PORT.farSpots.length, 8);
  F.FISH_FAR_SPOTS.forEach((s, i) => {
    const p = PORT.farSpots[i];
    assert.equal(p.index, F.FISH_FAR_FIRST + i, 'номер места');
    assert.ok(near(s.x, p.x) && near(s.z, p.z), `место ${p.index}: (${s.x}; ${s.z}) против layout.json`);
    assert.ok(near(s.yaw, Math.PI, 0.01), 'лицом на юг');
    assert.equal(s.y, MOLE_DECK_Y);
    const it = map.interact.find((q) => q.kind === 'fish' && q.arg === p.index)!;
    assert.ok(it && near(it.x, s.x) && near(it.z, s.z) && it.y === MOLE_DECK_Y, `точка «порыбачить» ${p.index}`);
    assert.ok(near(world.groundBelow(s.x, 0.2, s.z), MOLE_DECK_Y), `место ${p.index} стоит на настиле мола`);
  });
  // голова: x −65,5 и −63 при z 47,95; кромка: x −31 … −46 шагом 3 при z 45,95 — рыбак в 0,55 м от кромки (как на площадке маяка)
  assert.deepEqual(F.FISH_FAR_SPOTS.slice(0, 2).map((s) => [s.x, s.z]), [[-65.5, 47.95], [-63, 47.95]]);
  assert.deepEqual(F.FISH_FAR_SPOTS.slice(2).map((s) => [s.x, s.z]), [-31, -34, -37, -40, -43, -46].map((x) => [x, 45.95]));
  // накладка места (1,64 × 0,92, client/lobby/fishplaces3d.ts) — целиком на камне, не над водой
  for (const s of F.FISH_FAR_SPOTS) for (const [dx, dz] of [[-0.82, -0.46], [0.82, -0.46], [-0.82, 0.46], [0.82, 0.46]]) {
    assert.ok(near(world.groundBelow(s.x + dx, 0.2, s.z + dz), MOLE_DECK_Y), `накладка места (${s.x}; ${s.z}): угол над водой`);
  }
  // перед местом (на юг, 1,5 м) — вода: настил кончается кромкой
  for (const s of F.FISH_FAR_SPOTS) assert.ok(world.groundBelow(s.x, 0.2, s.z + 1.6) < WATER_Y + 0.4 || !(world.groundBelow(s.x, 0.2, s.z + 1.6) > MOLE_DECK_Y - 0.01), 'впереди кромка');
});

test('порт B: нижние настилы y −0,5 и верхнее сопряжение y0 невидимые; старые дальние мостки и дом не строятся', () => {
  const decks = map.boxes.filter((b) => PORT.decks.some((d) => near(b.min[0], d.box[0]) && near(b.min[2], d.box[1]) && near(b.max[0], d.box[2]) && near(b.max[2], d.box[3]) && near(b.max[1], d.y)));
  assert.equal(decks.length, PORT.decks.length, 'все настилы порта есть в карте');
  // видимый настил один: мол, голову, сходни и ступень рисует pav_mole.glb, помост — доски fishplaces3d.ts; второй слой мерцал
  for (const b of decks) assert.equal(b.mat, 'invisible', `настил (${b.min[0]}; ${b.min[2]}) — без второго видимого слоя`);
  const stair = map.boxes.find((b) => near(b.min[0], PORT.stair.box[0]) && near(b.max[0], PORT.stair.box[2]) && near(b.max[1], PORT.stair.y))!;
  assert.equal(stair.mat, 'invisible', 'ступень — тоже модель');
  // пока модель не встала, их показывают коробки блокаута с pav mole (прячутся, когда модель загрузилась)
  for (const d of PORT.decks.filter((k) => k.id !== 'lavka')) {
    const cx = (d.box[0] + d.box[2]) / 2, cz = (d.box[1] + d.box[3]) / 2;
    assert.ok(P3.decor.some((k) => k.pav === 'mole' && k.t === 'box' && near(k.c[0], cx, 0.01) && near(k.c[2], cz, 0.01) && near(k.c[1] + k.s![1] / 2, d.y, 0.01)), `запасная коробка ${d.id}`);
  }
  for (let i = 0; i < decks.length; i++) for (let j = i + 1; j < decks.length; j++) assert.equal(boxOverlap(decks[i], decks[j]), 0, `настилы ${i} и ${j}`);
  // старая голова пирса x −25,5…−12,5, z 54…64 и дальние мостки x −20,5…−17,5, z 46…54: ни настила, ни дома
  assert.ok(!world.overlaps(-25.4, -0.45, 46.6, -12.6, 3, 64), 'на месте старых дальних мостков и головы пирса ничего нет');
  const lavka = PORT.decks.find((d) => d.id === 'lavka')!.box;
  assert.ok(F.FISH_HOUSE_BOXES.every((b) => b.x0 >= lavka[0] && b.x1 <= lavka[2] && b.z0 >= lavka[1] && b.z1 <= lavka[3]), 'сруб и стойка снастей — на помосте Лавки');
  assert.ok(!(world.groundBelow(-19, 0.5, 50) > WATER_Y), 'вода там, где были дальние мостки');
  // площадка расширена до края мола; landing вровень с её верхом, далее идёт рампа
  assert.ok(near(world.groundBelow(PORT.stair.box[0] + 0.3, 0.2, 45), PORT.stair.y));
  assert.equal(PORT.stair.y, 0);
});

test('порт B: Лавка Семёна — на помосте у сходней мола: дом, житель, стойка снастей и место разговора из layout.json, всё на настиле, рядом с рыбаками', () => {
  const S = PORT.semyon;
  const lavka = PORT.decks.find((d) => d.id === 'lavka')!;
  const [x0, z0, x1, z1] = lavka.box;
  // помост — в углу между молом (север), головой мола (запад, у головы) и сходнями (восток), на высоте мола
  assert.deepEqual([z0, x1, lavka.y, lavka.kind], [46.5, -55.2, MOLE_DECK_Y, 'wood']);
  assert.equal(x0, -62);
  assert.ok(S.house.x0 > x0 && S.house.x1 < x1 && S.house.z0 > z0 && S.house.z1 < z1, 'сруб на помосте');
  assert.equal(S.y, MOLE_DECK_Y);
  // сруб и стойка — невидимые боксы (сруб рисует pav_semyon.glb, стойку — fisherman.ts): второго дома нет
  assert.equal(F.FISH_HOUSE_BOXES.length, 2);
  for (const b of F.FISH_HOUSE_BOXES) assert.equal(b.mat, 'invisible');
  // житель на крыльце (доски крыльца на 6 см выше помоста), место разговора — на настиле, точка №… та же (kind fisher, arg 0)
  assert.deepEqual([F.FISHER_NPC.x, F.FISHER_NPC.z, F.FISHER_NPC.yaw], [S.npc.x, S.npc.z, S.npc.yaw]);
  assert.ok(near(F.FISHER_NPC.y, MOLE_DECK_Y + 0.06));
  assert.deepEqual([F.FISHER_USE.x, F.FISHER_USE.z, F.FISHER_USE.y], [S.use.x, S.use.z, MOLE_DECK_Y]);
  const it = map.interact.find((q) => q.kind === 'fisher' && q.arg === 0)!;
  assert.ok(near(it.x, S.use.x) && near(it.z, S.use.z) && near(it.y, MOLE_DECK_Y), 'точка разговора');
  assert.ok(near(world.groundBelow(it.x, 0.2, it.z), MOLE_DECK_Y), 'место разговора на настиле');
  // E доходит и перед Семёном (1,5 м перед ним), и перед стойкой снастей (0,9 м перед ней)
  const g = F.FISH_GEAR!;
  const ahead = (p: { x: number; z: number; yaw: number }, d: number): [number, number] => [p.x - Math.sin(p.yaw) * d, p.z - Math.cos(p.yaw) * d];
  for (const [x, z] of [ahead(S.npc, 1.5), ahead(g, 0.9)]) {
    assert.ok(Math.hypot(x - it.x, z - it.z) < it.r, `E у (${x.toFixed(2)}; ${z.toFixed(2)})`);
    assert.ok(near(world.groundBelow(x, 0.2, z), MOLE_DECK_Y) && !world.overlaps(x - 0.3, -0.45, z - 0.3, x + 0.3, 1.2, z + 0.3), 'там можно стоять');
  }
  // стойка снастей — справа от крыльца, на помосте, ни во что не врезается
  const gb = F.FISH_HOUSE_BOXES[1];
  assert.ok(g.x > S.npc.x && near(g.z, S.npc.z, 0.6), 'справа от Семёна');
  for (const b of map.boxes) if (!(near(b.min[0], gb.x0) && near(b.min[2], gb.z0) && near(b.max[1], gb.y1))) assert.equal(boxOverlap(b, { min: [gb.x0, gb.y0, gb.z0], max: [gb.x1, gb.y1, gb.z1], mat: 'invisible', color: 0 }), 0, `стойка в боксе (${b.min.join('; ')})`);
  // рыбаки рядом: до мест на моле — не дальше 15 м
  assert.ok(Math.min(...F.FISH_FAR_SPOTS.map((s) => Math.hypot(s.x - it.x, s.z - it.z))) < 15, 'места ловли рядом');
  // проходы: вдоль мола (к голове и «Удалой») и по сходням к стоянке — свободны
  for (let x = -61.5; x < -24.7; x += .2) {
    const floor = Math.max(world.groundBelow(x - .1, .5, 45), world.groundBelow(x + .1, .5, 45));
    assert.ok(Number.isFinite(floor) && !world.overlaps(x - .1, floor + .02, 43.9, x + .1, floor + 1.6, 46.2), 'вдоль мола и пологого перехода свободно');
  }
  assert.ok(!world.overlaps(-54.4, -0.45, 46, -53.6, 1.2, 58.4), 'по сходням к стоянке свободно');
  // место на берегу (−13; 10,5), где стояла Лавка, — свободный проход к витрине
  assert.ok(!world.overlaps(-16.5, 0.05, 7.5, -10.3, 1.6, 13.7), 'на берегу на месте Лавки пусто');
  // модель стоит там, где её ждёт раскладка: житель, вход, вывеска и доска сезона — по пустышкам pav_semyon.glb
  const place = PD.PAVILIONS.find((p) => p.id === 'semyon')!;
  assert.deepEqual([place.x, place.z, place.yaw, place.y], [S.root.x, S.root.z, S.root.yaw, S.y]);
  const an = PD.pavAnchors(PD.glbJson(new Uint8Array(readFileSync(new URL('../client/assets/plaza3/pav_semyon.glb', import.meta.url)))), place);
  const res = an.get('anchor_resident')!;
  assert.ok(near(res.x, S.npc.x, 0.02) && near(res.z, S.npc.z, 0.02) && near(Math.cos(res.yaw - S.npc.yaw), 1, 1e-3), 'житель — на пустышке модели');
  const entry = an.get('anchor_entry')!;
  assert.ok(Math.hypot(entry.x - S.use.x, entry.z - S.use.z) < 1, 'место разговора — у входа модели');
  const box = an.get('anchor_board_season')!;
  assert.ok(SEASON_FIELD && near(SEASON_FIELD.x, box.x, 0.01) && near(SEASON_FIELD.y, box.y, 0.01) && near(SEASON_FIELD.z, box.z, 0.01), 'доска сезона — на поле модели');
  assert.ok(near(SEASON_FIELD!.w, Number(box.data.w), 0.01) && SEASON_FIELD!.y < S.y + 5, 'доска сезона небольшая и на коньке, а не над крышей');
  const sign = P3.signs.find((k) => k.id === 'semyon')!;
  const sa = an.get('anchor_sign_semyon')!;
  assert.ok(near(sign.x, sa.x, 0.02) && near(sign.y, sa.y, 0.02) && near(sign.z, sa.z, 0.02), 'вывеска WP10 — на поле модели');
});

test('стоянка своих лодок: помост Лавки — твёрдое для лодок (якорь нельзя), берты и вызов не задевают Лавку', () => {
  assert.equal(OB.canAnchorAt(-58.6, 51), false, 'на помосте Лавки якорь нельзя');
  for (let b = 0; b < OB.PARK_COUNT; b++) {
    const pose = OB.berthPose(b, FB.BOATS[0]);
    assert.ok(pose.z > 54 + 2, `берт ${b} южнее помоста`);
  }
});

test('порт B через хаб: на месте мола садятся и забрасывают, у Лавки Семён открывает разговор (и от стойки снастей), «Удалая» уходит с головы мола', () => {
  const { hub, clock } = setupHub({ fish2: true });
  const a = login(hub, 'Tester7');
  steps(hub, 2);
  const me = hub.lobby.playerOf(a.c)!;
  // место 21 на голове мола: E — сел, заброс — поплавок в воде
  const spot = map.interact.find((q) => q.kind === 'fish' && q.arg === F.FISH_FAR_FIRST + 1)!;
  placeAt(hub, a.c, spot.x, spot.z, MOLE_DECK_Y);
  hub.onJson(a.c, { t: 'use', id: spot.id });
  assert.equal(me.action, ACT_FISH, 'сел на место мола');
  const hall = hub.lobby.fishing2!;
  clock.now += 1100;
  hub.onJson(a.c, { t: 'fish', a: 'cast' });
  steps(hub, 2);
  assert.notEqual(hall.phase(spot.arg), FP_IDLE, 'заброс с мола');
  hub.onJson(a.c, { t: 'unuse' });
  // Семён: E перед крыльцом и перед стойкой «Снасти у Семёна» открывает окно разговора (квесты, лавка снастей)
  const it = map.interact.find((q) => q.kind === 'fisher' && q.arg === 0)!;
  const S = PORT.semyon;
  const g = F.FISH_GEAR!;
  for (const [x, z] of [[S.npc.x - Math.sin(S.npc.yaw) * 1.5, S.npc.z - Math.cos(S.npc.yaw) * 1.5], [g.x - Math.sin(g.yaw) * 0.9, g.z - Math.cos(g.yaw) * 0.9]]) {
    clock.now += 1100;
    a.s.msgs.length = 0;
    placeAt(hub, a.c, x, z, MOLE_DECK_Y);
    hub.onJson(a.c, { t: 'use', id: it.id });
    const r = lastOf(a.s, 'fishNpc');
    assert.ok(r && r.open === true && r.npc === 'semyon', `Семён отвечает у (${x.toFixed(2)}; ${z.toFixed(2)}): ${r?.message ?? 'молчит'}`);
  }
  // «Удалая»: игрок 3-го уровня садится у головы мола, через 10 с лодка уходит и доходит до «Альбатроса»
  a.c.profile!.fishing.xp = 770;
  clock.now += 1100;
  const fb = map.interact.find((q) => q.kind === 'ferry' && q.arg === 0)!;
  placeAt(hub, a.c, fb.x, fb.z, MOLE_DECK_Y);
  hub.onJson(a.c, { t: 'use', id: fb.id });
  assert.equal(me.action, ACT_FERRY, 'сел в «Удалую»');
  steps(hub, FE.FERRY_BOARD_TICKS);
  assert.equal(hub.lobby.ferry.phase, FE.FE_OUT, 'отошла');
  steps(hub, FE.FERRY_OUT_TICKS);
  assert.equal(hub.lobby.ferry.phase, FE.FE_AWAY, 'дошла');
});

test('порт B: открытая Рыбная витрина — более крупный экран над поднятым навесом, прежнее место прилавка', () => {
  const b = F.FISH_BOARD;
  assert.ok(near(b.x, -12) && near(b.z, 21.365) && near(b.w, 6) && near(b.h, 7.65) && near(b.panelY, 4.9), 'экран над тканью, с исходным aspect');
  assert.ok(near(F.FISH_PODIUM.x, -12) && near(F.FISH_PODIUM.z, 19.3), 'прилавок');
  assert.equal(F.FISH_BOARD.yaw, 0);
});

test('порт B: точки и места появления на опоре и не в стене (в том числе места на моле, «Удалая», стоянка)', () => {
  assert.deepEqual(spotProblems(map, world, { bakY: BARKAS_BAK_Y, parkDeckY: OB.PARK_DECK_Y, inIsle: inIsleWaters }), []);
});

test('«Удалая»: дом у головы мола, путь 80–90 м, первая и последняя точки на стоянках, корпус не задевает мол, голову и сходни', () => {
  assert.deepEqual([FE.FERRY_HOME.x, FE.FERRY_HOME.z, FE.FERRY_HOME.yaw], [PORT.ferry.home.x, PORT.ferry.home.z, PORT.ferry.home.yaw].map((v) => v));
  assert.equal(FE.FERRY_DECK_Y, MOLE_DECK_Y);
  const lay = (a: { x: number; z: number }, b: { x: number; z: number }): boolean => near(a.x, b.x, 1e-6) && near(a.z, b.z, 1e-6);
  assert.ok(lay(FE.FERRY_SIGN, PORT.ferry.sign) && lay(FE.FERRY_HOME_BOARD, PORT.ferry.board) && lay(FE.FERRY_HOME_LANDING, PORT.ferry.landing));
  assert.ok(FE.FERRY_HOME_SPOTS.every(([x, z], i) => near(x, PORT.ferry.spots[i][0]) && near(z, PORT.ferry.spots[i][1])));
  assert.ok(FE.FERRY_OUT_LEN > 80 && FE.FERRY_OUT_LEN < 90, `путь туда ${FE.FERRY_OUT_LEN.toFixed(1)} м`);
  assert.ok(FE.FERRY_BACK_LEN > 80 && FE.FERRY_BACK_LEN < 95, `путь назад ${FE.FERRY_BACK_LEN.toFixed(1)} м`);
  // борт «Удалой» ходит вокруг настилов порта без касания: углы корпуса (5 × 2,2 м) вне камня и сходней — кроме дома у головы
  const decks = PORT.decks.map((d) => d.box);
  const hull = (x: number, z: number, yaw: number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (const lx of [-FE.FERRY_HALF_B, 0, FE.FERRY_HALF_B]) for (const lz of [-FE.FERRY_HALF_L, 0, FE.FERRY_HALF_L]) {
      const p = FE.ferryLocal({ x, z, yaw }, lx, lz);
      out.push([p.x, p.z]);
    }
    return out;
  };
  const pose = { x: 0, z: 0, yaw: 0 };
  for (const [ph, ticks] of [[FE.FE_OUT, FE.FERRY_OUT_TICKS], [FE.FE_BACK, FE.FERRY_BACK_TICKS]] as const) {
    for (let t = 0; t <= ticks; t += 3) {
      FE.ferryPose(ph, 0, t, pose);
      for (const [x, z] of hull(pose.x, pose.z, pose.yaw)) {
        for (const [x0, z0, x1, z1] of decks) assert.ok(!(x > x0 + 0.01 && x < x1 - 0.01 && z > z0 + 0.01 && z < z1 - 0.01), `рейс ${ph}, тик ${t}: корпус на настиле (${x.toFixed(2)}; ${z.toFixed(2)})`);
      }
    }
  }
  // в воде: центр лодки не внутри видимых твёрдых боксов карты (невидимые стены бухты — только для игроков)
  const solids = map.boxes.filter((b) => b.mat !== 'invisible' && b.max[1] > WATER_Y + 0.1 && b.min[1] < 3);
  for (const [ph, ticks] of [[FE.FE_OUT, FE.FERRY_OUT_TICKS], [FE.FE_BACK, FE.FERRY_BACK_TICKS]] as const) {
    for (let t = 0; t <= ticks; t += 15) {
      FE.ferryPose(ph, 0, t, pose);
      assert.ok(!solids.some((b) => pose.x > b.min[0] && pose.x < b.max[0] && pose.z > b.min[2] && pose.z < b.max[2]), `под лодкой вода (${pose.x.toFixed(1)}; ${pose.z.toFixed(1)})`);
    }
  }
});

test('стоянка своих лодок: PARK (−54; 58,5), мол/голова/сходни в BOXES, первые три строки не тронуты, берты в воде и не на молу', () => {
  assert.ok(near(OB.PARK.x, -54) && near(OB.PARK.z, 58.5) && OB.PARK.y === 0);
  assert.equal(OB.canAnchorAt(-300, 100), true, 'открытое море — якорь можно');
  assert.equal(OB.canAnchorAt(-45, 45), false, 'на молу якорь нельзя');
  assert.equal(OB.canAnchorAt(-65, 45), false, 'на голове мола — нельзя');
  assert.equal(OB.canAnchorAt(-54, 52), false, 'на сходнях — нельзя');
  assert.equal(OB.canAnchorAt(-19, 30), false, 'у мостков маяка — нельзя (строки 1–2 не тронуты)');
  for (let b = 0; b < OB.PARK_COUNT; b++) {
    const pose = OB.berthPose(b, FB.BOATS[0]);
    assert.ok(Math.abs(pose.x - OB.PARK.x) < 5 && pose.z >= OB.PARK.z, `берт ${b} к югу от сходней`);
    assert.ok(!PORT.decks.some((d) => pose.x > d.box[0] && pose.x < d.box[2] && pose.z > d.box[1] && pose.z < d.box[3]), `берт ${b} не на настиле порта`);
    const land = OB.berthLanding(b);
    assert.ok(Math.abs(land.x - pose.x) < 5 && Math.abs(land.z - pose.z) < 1, `берт ${b}: высадка напротив лодки`);
    assert.ok(Math.abs(land.x - OB.PARK.x) < 1, `берт ${b}: высадка на мостике`);
  }
  // сходни: одна ступень y −0,5 — игрок поднимается с настила стоянки (−0,62) на сходни и дальше на сходни к молу
  const ramp = OB.parkDeckBoxes().filter((b) => b.max[1] > OB.PARK_DECK_Y + 0.01 && b.max[1] <= 0).map((b) => b.max[1]);
  assert.ok(ramp.length > 0 && ramp.every((y) => near(y, -0.5)), 'сходни одним уровнем');
});

test('пираты: кучи, причалы и пушки на рабочей полосе свободны, пути от каждого причала к каждой куче есть, шлюпки идут по воде', () => {
  const nav = new PirateNav(map);
  for (const d of PI.PIRATE_DOCKS) assert.ok(nav.isFree(d.exitX, d.exitZ), `выход с причала ${d.x}`);
  for (const home of PI.PIRATE_LOOT_HOME) assert.ok(nav.isFree(home.x, home.z), `куча ${home.x}; ${home.z} свободна`);
  for (const c of PI.PIRATE_CANNONS) {
    const hit = map.boxes.some((b) => b.min[1] < 1.6 && b.max[1] > 0.3 && c.x + 0.45 > b.min[0] && c.x - 0.45 < b.max[0] && c.z + 0.65 > b.min[2] && c.z - 0.65 < b.max[2]);
    assert.ok(!hit, `пушка ${c.x}; ${c.z} не в коробке`);
  }
  const out = { x: 0, z: 0 };
  for (const d of PI.PIRATE_DOCKS) for (const pile of PI.PIRATE_PILES) {
    let x = d.exitX, z = d.exitZ, n = 0;
    while (Math.hypot(x - pile.x, z - pile.z) > 0.8 && n++ < 400) {
      nav.next(x, z, pile.x, pile.z, out);
      const dx = out.x - x, dz = out.z - z, len = Math.hypot(dx, dz) || 1, k = Math.min(1, 0.5 / len);
      x += dx * k; z += dz * k;
    }
    assert.ok(n < 400, `от причала ${d.x} до кучи ${pile.x} дойти нельзя`);
  }
  // полоса пиратов — как в layout.json (port.pirates.zone)
  const z = PORT.pirates.zone;
  assert.deepEqual([PI.PIRATE_ZONE.x0, PI.PIRATE_ZONE.x1, PI.PIRATE_ZONE.z0, PI.PIRATE_ZONE.z1], [z.x0, z.x1, z.z0, z.z1]);
  // шлюпки: ни точка маршрута, ни середины отрезков не в твёрдом на воде (стена порта на z ≤ 22 — вне маршрутов)
  for (const r of PI.PIRATE_ROUTES) for (let i = 0; i + 3 < r.pts.length; i += 2) {
    for (let t = 0; t <= 1; t += 0.1) {
      const x = r.pts[i] + (r.pts[i + 2] - r.pts[i]) * t, zz = r.pts[i + 1] + (r.pts[i + 3] - r.pts[i + 1]) * t;
      if (zz < 22.5) continue;
      assert.ok(!map.boxes.some((b) => b.min[1] < WATER_Y + 0.5 && b.max[1] > WATER_Y && x > b.min[0] && x < b.max[0] && zz > b.min[2] && zz < b.max[2]), `шлюпка в твёрдом (${x.toFixed(1)}; ${zz.toFixed(1)})`);
    }
  }
});

test('шторм: цель — дверь маяка достижима с корня мостков, мол не считается «настилом шторма»', () => {
  assert.ok(SM.stormReach(SM.STORM_GOAL.x, SM.STORM_GOAL.y, SM.STORM_GOAL.z));
  const p = makeState(), ev = makeEvents();
  Object.assign(p, { x: -19, y: 0, z: 23, grounded: 1 });
  let seq = 0;
  // по мосткам идут не по оси (там стойка): через две точки у края настила
  const way = [[-18, 30], [-18, 39], [SM.STORM_GOAL.x, SM.STORM_GOAL.z]];
  for (let i = 0, k = 0; i < 900 && !SM.stormReach(p.x, p.y, p.z); i++) {
    if (k < way.length - 1 && Math.hypot(way[k][0] - p.x, way[k][1] - p.z) < 0.5) k++;
    const dx = way[k][0] - p.x, dz = way[k][1] - p.z;
    stepPlayer(p, { seq: ++seq, buttons: BTN_FORWARD | BTN_ADS, yaw: Math.atan2(-dx, -dz), pitch: 0, viewTick: 0 }, world, false, 23, ev);
  }
  assert.ok(SM.stormReach(p.x, p.y, p.z), `дошёл до двери: (${p.x.toFixed(1)}; ${p.y.toFixed(1)}; ${p.z.toFixed(1)})`);
  assert.equal(SM.onStormPier(-45, MOLE_DECK_Y, 45), false, 'на молу волна не бьёт');
  assert.equal(SM.onStormPier(-19, 0, 30), true, 'на мостках — бьёт');
});

test('русалка: раскладка на новых местах строится (мостки маяка), на молу её нет — настил ниже 0', () => {
  const layout = MM.lobbyMermaidLayout(map.boxes);
  assert.ok(layout.sides.length >= 1, 'у мостков есть борта');
  for (const s of layout.sides) for (const lane of s.lanes) {
    assert.ok(!(lane.x > -70 && lane.x < -22 && lane.z > 42 && lane.z < 49), 'не выплывает на мол');
  }
});

test('рыбаки-желейки: оба на твёрдом настиле площадки маяка, лицом к воде, ведро рядом', () => {
  assert.equal(FISHERS.length, 2);
  for (const f of FISHERS) {
    const { x, z, yaw } = f.place;
    const bucket = f.place.bucket!;
    assert.ok(near(world.groundBelow(x, 0.5, z), 0), `рыбак (${x}; ${z}) на настиле`);
    assert.ok(!world.overlaps(x - 0.3, 0.02, z - 0.3, x + 0.3, 1.7, z + 0.3), 'не в стене');
    assert.ok(Math.hypot(bucket[0] - x, bucket[2] - z) < 1.2 && near(world.groundBelow(bucket[0], 0.5, bucket[2]), 0), 'ведро на настиле');
    // 4–6 м вперёд (заброс) — вода, а не мол и не стена
    for (const d of [3, 4.5, 6]) {
      const fx = x - Math.sin(yaw) * d, fz = z - Math.cos(yaw) * d;
      assert.ok(!(world.groundBelow(fx, 0.5, fz) > WATER_Y), `заброс ${d} м: вода (${fx.toFixed(1)}; ${fz.toFixed(1)})`);
    }
  }
});

// ------------------------------------------------------------------ WP7: выезд на ферму

test('ферма: калитка, E, возврат и телега — якорь farmGate (+31,5; −11,3), как в layout.json farmRoad; телега на земле y 0', () => {
  const R = P3.farmRoad;
  const g = FM.FARM_PLAZA_GATE;
  // углы в farmlayout.ts округлены до 4 знаков (−1,5708), поэтому по yaw допуск 1e-3
  assert.ok(near(g.use.x, R.use.x) && near(g.use.z, R.use.z) && g.use.r === R.use.r && near(g.use.yaw, -Math.PI / 2, 1e-3));
  assert.ok(near(g.spawnBack.x, R.spawnBack.x) && near(g.spawnBack.z, R.spawnBack.z) && near(g.spawnBack.yaw, R.spawnBack.yaw, 1e-3));
  assert.ok(near(g.cart.x, R.cart.x) && near(g.cart.z, R.cart.z) && g.cart.y === 0);
  assert.ok(near(FM.FARM_PLAZA_GATE_ANCHOR.x, R.gate.x) && near(FM.FARM_PLAZA_GATE_ANCHOR.z, R.gate.z) && near(FM.FARM_PLAZA_GATE_ANCHOR.yaw, R.gate.yaw, 1e-3));
  // створки открыты для прохода: бокса калитки в карте нет
  assert.ok(!map.boxes.some((b) => b.min[0] === g.box.min[0] && b.max[0] === g.box.max[0] && b.min[2] === g.box.min[2]), 'бокса калитки нет');
  const it = map.interact.find((q) => q.kind === 'farm')!;
  assert.ok(near(it.x, R.use.x) && near(it.z, R.use.z));
  assert.ok(near(map.farmSpawn.x, R.spawnBack.x) && near(map.farmSpawn.z, R.spawnBack.z));
  assert.ok(near(world.groundBelow(map.farmSpawn.x, 0.5, map.farmSpawn.z), 0), 'возврат на земле');
  assert.ok(!world.overlaps(map.farmSpawn.x - PLAYER_HALF, 0.01, map.farmSpawn.z - PLAYER_HALF, map.farmSpawn.x + PLAYER_HALF, 1.8, map.farmSpawn.z + PLAYER_HALF), 'возврат не в стене');
});

test('ферма: зона «прошёл — на ферму» сразу за калиткой; от возврата и места E до неё идёт свободный путь, в зоне нет стен', () => {
  const z = FM.FARM_ROAD_ZONE!;
  assert.ok(z && near(z.x0, 61.3) && near(z.x1, 62.9) && near(z.z0, -24.3) && near(z.z1, -22.3));
  assert.equal(FM.inFarmRoadZone(FM.FARM_PLAZA_GATE.spawnBack.x, 0, FM.FARM_PLAZA_GATE.spawnBack.z), false, 'возврат — вне зоны, повторного входа нет');
  assert.equal(FM.inFarmRoadZone(FM.FARM_PLAZA_GATE.use.x, 0, FM.FARM_PLAZA_GATE.use.z), false, 'место E — вне зоны');
  assert.equal(FM.inFarmRoadZone((z.x0 + z.x1) / 2, 0, (z.z0 + z.z1) / 2), true);
  assert.equal(FM.inFarmRoadZone((z.x0 + z.x1) / 2, -4, (z.z0 + z.z1) / 2), false, 'упал в воду под зоной — не считается');
  // боковые столбики калитки (x 61,15…61,45, z до −24,05 и от −22,55) задевают углы зоны шириной 2 м: проход между ними — 1,5 м
  for (let x = z.x0; x <= z.x1; x += 0.2) for (let zz = z.z0; zz <= z.z1; zz += 0.2) {
    assert.ok(near(world.groundBelow(x, 0.5, zz), 0), `земля в зоне (${x.toFixed(1)}; ${zz.toFixed(1)})`);
    if (Math.abs(zz + 23.3) > 0.3) continue; // середина прохода: между столбиками 1,5 м, тело игрока 0,84 м (PLAYER_HALF 0,42)
    assert.ok(!world.overlaps(x - PLAYER_HALF, 0.01, zz - PLAYER_HALF, x + PLAYER_HALF, 1.8, zz + PLAYER_HALF), `зона свободна (${x.toFixed(1)}; ${zz.toFixed(1)})`);
  }
  // пешком от места возврата на восток через калитку — в зону за секунду-две
  const p = makeState(), ev = makeEvents();
  Object.assign(p, { x: FM.FARM_PLAZA_GATE.spawnBack.x, y: 0, z: FM.FARM_PLAZA_GATE.spawnBack.z, grounded: 1 });
  let seq = 0, got = -1;
  for (let i = 0; i < 4 * TICK_RATE && got < 0; i++) {
    stepPlayer(p, { seq: ++seq, buttons: BTN_FORWARD | BTN_ADS, yaw: -Math.PI / 2, pitch: 0, viewTick: 0 }, world, false, 23, ev);
    if (FM.inFarmRoadZone(p.x, p.y, p.z)) got = i;
  }
  assert.ok(got >= 0, `дошёл до зоны: (${p.x.toFixed(1)}; ${p.z.toFixed(1)})`);
});

test('ферма через хаб: шагнул в зону — на ферме; вернулся — стоит у калитки вне зоны и сам не уходит; без фермы зона ничего не делает', () => {
  const z = FM.FARM_ROAD_ZONE!;
  const off = setupHub();
  const o = login(off.hub, 'NoFarm2');
  steps(off.hub, 121);
  placeAt(off.hub, o.c, (z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2);
  steps(off.hub, 5);
  assert.equal(o.c.room?.kind, 'lobby', 'ферма выключена — остаёмся на набережной');
  const { hub } = setupHub({ farm: true });
  const a = login(hub, 'Tester7');
  steps(hub, 121);
  placeAt(hub, a.c, FM.FARM_PLAZA_GATE.use.x, FM.FARM_PLAZA_GATE.use.z);
  steps(hub, 5);
  assert.equal(a.c.room?.kind, 'lobby', 'у калитки ещё на площади');
  placeAt(hub, a.c, (z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2);
  steps(hub, 3);
  assert.equal(a.c.room?.kind, 'farm', 'прошёл калитку — на ферме');
  assert.ok(lastOf(a.s, 'farm'));
  // обратно на площадь: встаёт у калитки, вне зоны, и остаётся на набережной
  steps(hub, 121);
  hub.onJson(a.c, { t: 'leave' });
  assert.equal(a.c.room?.kind, 'lobby');
  const me = hub.lobby.playerOf(a.c)!;
  assert.equal(FM.inFarmRoadZone(me.state.x, me.state.y, me.state.z), false);
  steps(hub, 10);
  assert.equal(a.c.room?.kind, 'lobby');
});

// ------------------------------------------------------------------ WP8: жизнь площади

test('звери: те же 15 (4 кошки, 6 чаек, 4 краба, собака); маршруты — по суше, не в стенах, без телепортов, остальное как в тесте старой площади', () => {
  const D = CR.CRITTERS;
  assert.equal(D.length, 15);
  assert.deepEqual(['cat', 'gull', 'crab', 'dog'].map((k) => D.filter((d) => d.kind === k).length), [4, 6, 4, 1]);
  assert.equal(CR.CRITTER_QUIET_ZONE.r, 0, 'памятника нет — тихая зона пуста');
  for (const def of D) {
    let prev = sampleCritter(def, 0);
    for (let time = 0; time < critterPeriod(def); time += 0.12) {
      const p = sampleCritter(def, (time - def.phase + critterPeriod(def)) * TICK_RATE);
      if (def.kind === 'crab') {
        assert.ok(CR.coveDry(p.x, p.z), `краб ${def.id} на сухом песке (${p.x}; ${p.z})`);
        assert.ok(Math.abs(p.y - CR.coveHeight(p.x, p.z)) < 0.05 && p.y > WATER_Y);
        continue;
      }
      if (p.action === 'fly') continue;
      assert.ok(world.groundBelow(p.x, p.y + 0.01, p.z) > WATER_Y, `${def.id}: вода (${p.x}; ${p.z})`);
      assert.ok(!world.overlaps(p.x - 0.13, p.y + 0.015, p.z - 0.13, p.x + 0.13, p.y + 0.45, p.z + 0.13), `${def.id}: в стене (${p.x}; ${p.y}; ${p.z})`);
      if (!p.moving && def.kind === 'cat') assert.ok(def.stops.some((s) => s.x === p.x && s.z === p.z), 'кошки отдыхают на своих местах');
      // на опоре: на земле, на кнехте (+4 см к 0,5 м) или на скамье у воды (сиденье 0,3 м — скамья в карте не твёрдая, как в старой раскладке)
      if (!p.moving) {
        const g = world.groundBelow(p.x, p.y + 0.01, p.z);
        assert.ok(p.y >= g - 0.02 && p.y - g <= 0.31, `${def.id} стоит на опоре, а не в воздухе (${p.x}; ${p.y}; ${p.z})`);
      }
    }
    for (let tick = 1; tick < critterPeriod(def) * TICK_RATE; tick++) {
      const p = sampleCritter(def, tick);
      assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) < 0.2, `${def.id}: скачок`);
      prev = p;
    }
  }
});

test('отмель у мостков в plaza3: песок и твёрдое под ним согласованы, сухого песка ровно столько же, сколько на старой площади', () => {
  let dry = 0;
  for (let x = -19; x < -12; x += 0.1) for (let z = 22.15; z < 27.3; z += 0.1) {
    const h = CR.coveHeight(x, z), solid = world.groundBelow(x, -0.5, z);
    assert.ok(solid === -Infinity || solid <= h + 0.003, `твёрдое ${solid} выше песка ${h} в (${x.toFixed(1)}; ${z.toFixed(1)})`);
    if (h > CR.CRITTER_COVE.dry && x > -16.9) assert.ok(world.groundBelow(x, h + 0.4, z) <= h + 0.003, 'над песком ничего нет');
    if (h > CR.CRITTER_COVE.dry) dry++;
  }
  assert.ok(dry > 150, `компактная отмель (${dry} точек)`);
});

test('гирлянды plaza3: нити висят на фонарях и стойках перголы, выше 2,3 м над землёй, лампочки считаются, ≤ 4 отрисовок', () => {
  const lamps = map.deco.filter((d) => d.kind === 'lamp');
  assert.equal(lamps.length, 6);
  const strings = LI.plaza3Garlands(map);
  assert.ok(strings.length >= 10);
  const known = new Set([...lamps.map((l) => [l.x, l.z]), ...CANOPY_POLES].map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`));
  // Актуальная веранда имеет пять настоящих стоек (3+2), а не прежний прямоугольник 3+3.
  const pav = PD.PAVILIONS.find((p) => p.id === 'cardveranda')!;
  const cols = PD.pavColliders(PD.glbJson(new Uint8Array(readFileSync(new URL(`../client/assets/plaza3/${pav.file}`, import.meta.url)))), pav)
    .filter((c) => c.name.startsWith('col_post'));
  assert.equal(cols.length, CANOPY_POLES.length);
  for (const [x, z] of CANOPY_POLES) assert.ok(cols.some((c) => near((c.min[0] + c.max[0]) / 2, x, .001) && near((c.min[2] + c.max[2]) / 2, z, .001)), 'опора нити совпадает с реальной стойкой GLB');
  const veranda = strings.filter((g) => g.colored);
  assert.equal(veranda.length, 7, 'три продольные нити, две диагонали, два торца неполной перголы');
  const key = (p: readonly number[]) => `${p[0].toFixed(2)},${p[p.length - 1].toFixed(2)}`;
  const reached = new Set([key(CANOPY_POLES[0])]);
  for (let i = 0; i < CANOPY_POLES.length; i++) for (const g of veranda) {
    if (reached.has(key(g.a))) reached.add(key(g.b));
    if (reached.has(key(g.b))) reached.add(key(g.a));
  }
  assert.deepEqual([...reached].sort(), CANOPY_POLES.map(key).sort(), 'все пять стоек связаны одной сетью');
  for (const g of strings) {
    for (const end of [g.a, g.b]) assert.ok(end[1] > 2.3 && end[1] < 5, `нить на высоте ${end[1]}`);
    for (let t = 0; t <= 1; t += 0.05) assert.ok(LI.garlandAt(g, t)[1] - 0.06 > 2.25, 'лампочка выше головы');
    assert.ok(LI.bulbCount(g) >= 2);
  }
  // концы нитей-фонарей — на фонарях карты
  for (const g of strings) for (const end of [g.a, g.b]) assert.ok(known.has(`${end[0].toFixed(2)},${end[2].toFixed(2)}`), `конец нити (${end[0]}; ${end[2]}) на фонаре`);
  const pools = LI.lightPools(map);
  assert.ok(pools.length >= 10 && pools.length <= 20);
  for (const p of pools) assert.ok(p.x > -35 && p.x < 95 && p.z > -50 && p.z < 25 && p.opacity > 0 && p.opacity <= 0.4, `пятно (${p.x}; ${p.z})`);
  const bulbs = strings.reduce((n, g) => n + LI.bulbCount(g), 0);
  assert.ok(bulbs > 100 && bulbs < 800, `${bulbs} лампочек одним инстансом`);
});

test('молнии: у нового порта (мол, голова, сходни, берты стоянки) не бьют; открытое море — бьют', () => {
  for (const [x, z] of [[-46, 52], [-66, 52], [-54, 70], [-75, 75], [-54, 80], [-30, 60]] as const) assert.equal(W.strikeClear(x, z), false, `порт (${x}; ${z})`);
  assert.equal(W.strikeClear(-150, 130), true, 'открытое море');
  assert.equal(W.strikeClear(40, 70), true, 'море перед регатой (суша ≥ 30 м, людных мест рядом нет)');
  // суша на востоке и севере — вся за landDist: ударов на ней нет
  assert.equal(W.landDist(70, 10), 0);
  assert.equal(W.landDist(90, 20), 0);
});

test('меню: облёт plaza3 — снаружи самых высоких зданий и выше крыш', () => {
  // орбита (8; −8), R 46, высота 22: каланча 26 м в (−7; −39) и колесо 18,6 м в (27; 13) — внутри круга, камера над ними или снаружи
  for (const pav of P3.pavilions) {
    if (!pav.box) continue;
    const cx = (pav.box.x0 + pav.box.x1) / 2, cz = (pav.box.z0 + pav.box.z1) / 2;
    const r = Math.hypot(cx - 8, cz - -8);
    const reach = Math.max(pav.box.x1 - pav.box.x0, pav.box.z1 - pav.box.z0) / 2;
    if (pav.h >= 22) assert.ok(r + reach < 44 || r - reach > 48, `${pav.id}: выше камеры — не должен пересекать орбиту (r ${r.toFixed(1)})`);
  }
});
