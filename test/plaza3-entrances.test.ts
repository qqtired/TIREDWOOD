import assert from 'node:assert/strict';
import { test } from 'node:test';
process.env.PLAZA3 = '1';
const { START_ZONES, START_DWELL_TICKS, inStartCircle } = await import('../shared/startzones.ts');
const { login, placeAt, setupHub, steps } = await import('./kit.ts');

test('plaza3: widened fort circle admits its outer strip after the same three seconds', () => {
  const circle = START_ZONES.find(z => z.kind === 'fort')!;
  assert.equal(circle.r, 1.65);
  const { hub } = setupHub({ fort: true }), player = login(hub, 'WideFort');
  placeAt(hub, player.c, circle.x, circle.z + 1.5);
  assert.equal(inStartCircle({ x: circle.x, z: circle.z + 1.5 }, circle), true);
  steps(hub, START_DWELL_TICKS - 1); assert.equal(player.c.room?.kind, 'lobby');
  steps(hub, 2); assert.equal(player.c.room?.kind, 'fort');
});

test('plaza3: paintball circle is wider while immediate E entry is preserved', () => {
  const circle = START_ZONES.find(z => z.kind === 'paintball')!;
  assert.equal(circle.r, 1.8);
  const { hub } = setupHub(), player = login(hub, 'WidePaint');
  steps(hub, START_DWELL_TICKS);
  placeAt(hub, player.c, circle.x, circle.z + 1.6);
  const entry = hub.lobby.map.interact.find(i => i.kind === 'pb_gate')!;
  hub.onJson(player.c, { t: 'use', id: entry.id });
  assert.equal(player.c.room?.kind, 'paintball');
});

const { fortEntryOccupied, stepFortEntryDoor } = await import('../client/lobby/plaza3/fortentry.ts');
test('plaza3: either player opens the fort only inside the real circle, and exit closes smoothly', () => {
  const z = START_ZONES.find(z => z.kind === 'fort')!;
  const inside = { x: z.x, y: 0, z: z.z + 1.5 };
  const outside = { x: z.x, y: 0, z: z.z + z.r + 0.01 };
  assert.equal(fortEntryOccupied(null, [outside], true), false);
  assert.equal(fortEntryOccupied(inside, [], true), true);
  assert.equal(fortEntryOccupied(null, [inside], true), true);
  assert.equal(fortEntryOccupied({ ...inside, y: 6 }, [], true), false);
  assert.equal(fortEntryOccupied(inside, [inside], false), false);
  const opening = stepFortEntryDoor(0, true, 0.1);
  assert.ok(opening > 0 && opening < 1);
  const open = stepFortEntryDoor(opening, true, 3);
  assert.ok(open > 0.99);
  const closing = stepFortEntryDoor(open, false, 0.1);
  assert.ok(closing > 0 && closing < open);
  assert.ok(stepFortEntryDoor(closing, false, 3) < 0.01);
});
