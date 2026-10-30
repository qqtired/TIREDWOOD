/** «Ракушка» заменяет «Ласточку»: настоящая комната, без сети и локального сервера. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.PLAZA3 = '1';
const { Hub } = await import('../server/hub.ts');
const { setupHub, login, lastOf, allOf, placeAt, steps } = await import('./kit.ts');
const { BOAT_BOARD_TICKS, BOAT_RIDE_TICKS, BOAT_PRICE, BP_DOCK, BP_BOARD, BP_RIDE, LAUNCH, ridePose, seatAt } = await import('../shared/boat.ts');
const { ACT_NONE, ACT_BOAT, ACT_RIDE } = await import('../shared/lobby.ts');
const { BOAT_GATE } = await import('../shared/plaza2.ts');
const { BOAT_SIGN } = await import('../shared/maps/lobby.ts');

function setup(quiz: boolean) {
  const { store, profiles, clock } = setupHub();
  const hub = new Hub({ store, profiles, now: () => clock.now, quiz, smokeToken: '', build: 'test', log: () => {} });
  const a = login(hub, 'Tester7');
  const point = hub.lobby.map.interact.find(it => it.kind === 'boat')!;
  placeAt(hub, a.c, LAUNCH.x, 20.5);
  return { hub, a, point, player: hub.lobby.playerOf(a.c)! };
}

test('QUIZ: use катера не сажает, не списывает жетоны и не запускает поездку', () => {
  const { hub, a, point, player } = setup(true);
  const tokens = a.c.profile!.tokens;
  const position = [player.state.x, player.state.y, player.state.z];
  const dock = { ph: BP_DOCK, at: 0, n: 0, nick: '' };
  assert.deepEqual(lastOf(a.s, 'lobby')!.boat, dock);

  hub.onJson(a.c, { t: 'use', id: point.id });
  assert.equal(player.action, ACT_NONE);
  assert.equal(a.c.profile!.tokens, tokens);
  assert.deepEqual([player.state.x, player.state.y, player.state.z], position);
  steps(hub, BOAT_BOARD_TICKS + BOAT_RIDE_TICKS);
  assert.deepEqual(hub.lobby.boat.status(), dock);
  assert.equal(allOf(a.s, 'boat').length, 0);
  const b = login(hub, 'Tester8');
  assert.deepEqual(lastOf(b.s, 'lobby')!.boat, dock);
});

test('без QUIZ: use катера сажает, поездка отправляется и возвращается как раньше', () => {
  const { hub, a, point, player } = setup(false);
  const tokens = a.c.profile!.tokens;
  hub.onJson(a.c, { t: 'use', id: point.id });
  assert.equal(player.action, ACT_BOAT);
  assert.equal(a.c.profile!.tokens, tokens - BOAT_PRICE);
  assert.equal(lastOf(a.s, 'boat')!.ph, BP_BOARD);
  steps(hub, BOAT_BOARD_TICKS);
  assert.equal(player.action, ACT_RIDE);
  assert.equal(lastOf(a.s, 'boat')!.ph, BP_RIDE);
  steps(hub, 60);
  const at = seatAt(ridePose(60), 0);
  assert.equal(player.state.x, at.x);
  assert.equal(player.state.z, at.z);
  steps(hub, BOAT_RIDE_TICKS - 60);
  assert.equal(player.action, ACT_NONE);
  assert.equal(lastOf(a.s, 'boat')!.ph, BP_DOCK);
  assert.equal(hub.lobby.boat.riders, 0);
});

for (const quiz of [true, false]) {
  test(`${quiz ? 'QUIZ' : 'без QUIZ'}: коробки ворот, вывески и катера ${quiz ? 'выключены' : 'включены'}`, () => {
    const { hub } = setup(quiz);
    const { map, world } = hub.lobby;
    const boxes = map.swallowBoxes;
    assert.ok(boxes && boxes.length === 3, 'swallowBoxes содержит две стойки ворот и столбик вывески');
    assert.deepEqual(boxes.map(i => {
      const b = map.boxes[i];
      return [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
    }), [[BOAT_SIGN.x, BOAT_SIGN.z], [BOAT_GATE.x0, BOAT_GATE.z], [BOAT_GATE.x1, BOAT_GATE.z]]);
    assert.equal(map.boatBoxes.length, 7);
    for (const i of [...boxes, ...map.boatBoxes]) {
      assert.equal(world.maxX[i] > world.minX[i], !quiz, `бокс ${i}`);
    }
    const other = map.plaza3Boxes![0];
    assert.ok(world.maxX[other] > world.minX[other], 'настил площади остаётся включён');
  });
}
