import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KART_CHECK_EVERY, KART_COUNT_TICKS, ACT_RIDE } from '../shared/lobby.ts';
import { BOAT_RACE_CIRCLE, HIDE_CIRCLE, KART_START } from '../shared/maps/lobby.ts';
import { BTN_FORWARD, BTN_JUMP } from '../shared/sim.ts';
import { START_DWELL_TICKS, START_ZONES } from '../shared/startzones.ts';
import { lastOf, login, placeAt, sendInput, setupHub, steps } from './kit.ts';

for (const kind of ['paintball', 'fort', 'boatrace', 'hide', 'race'] as const) {
  const circle = kind === 'boatrace' ? BOAT_RACE_CIRCLE : kind === 'hide' ? HIDE_CIRCLE : kind === 'race' ? KART_START : START_ZONES.find(z => z.kind === kind)!;
  const dwell = kind === 'paintball' || kind === 'fort';
  test(`${kind}: repeated wire-input jumps preserve countdown and enter the separate room on time`, () => {
    const { hub } = setupHub({ fort: true, boatrace: true, hide: true });
    const a = login(hub, 'Jumper'), b = kind === 'hide' ? login(hub, 'Partner') : null;
    placeAt(hub, a.c, circle.x, circle.z);
    if (b) placeAt(hub, b.c, circle.x + 0.6, circle.z);
    let apex = 0, previous = Infinity;
    const deadline = dwell ? START_DWELL_TICKS + 1 : KART_COUNT_TICKS + KART_CHECK_EVERY;
    for (let tick = 1; tick <= deadline; tick++) {
      sendInput(hub, a.c, tick % 60 === 10 ? BTN_JUMP : 0);
      if (b) sendInput(hub, b.c, 0);
      hub.step();
      const p = hub.lobby.playerOf(a.c);
      if (!p) break;
      apex = Math.max(apex, p.state.y);
      if (tick < KART_CHECK_EVERY) continue;
      const status = dwell ? lastOf(a.s, 'startZone') : kind === 'boatrace' ? hub.lobby.boatStatus() : kind === 'hide' ? hub.lobby.hideStatus() : hub.lobby.kartStatus();
      assert.ok(status);
      if ('kind' in status) assert.equal(status.kind, kind, `jump cancelled dwell at tick ${tick}, y=${p.state.y}`);
      else { assert.equal(status.phase, 'count', `jump cancelled gathering at tick ${tick}, y=${p.state.y}`); assert.deepEqual(status.names, b ? ['Jumper', 'Partner'] : ['Jumper']); }
      assert.ok(status.left <= previous, `countdown backed up at tick ${tick}`);
      previous = status.left;
    }
    assert.ok(apex > 1.3, `real input must pass the old height gate; apex=${apex}`);
    assert.equal(a.c.room?.kind, kind);
    if (b) assert.equal(b.c.room?.kind, kind);
  });
  test(`${kind}: roof height and held rides cannot enter a gathering circle`, () => {
    const { hub } = setupHub({ fort: true, boatrace: true, hide: true });
    const a = login(hub, 'Roof'), b = kind === 'hide' ? login(hub, 'Partner') : null;
    placeAt(hub, a.c, circle.x, circle.z, 8);
    if (b) placeAt(hub, b.c, circle.x + 0.6, circle.z);
    steps(hub, KART_CHECK_EVERY * 2);
    const assertExcluded = () => {
      if (dwell) assert.notEqual(lastOf(a.s, 'startZone')?.kind, kind);
      else { const status = kind === 'boatrace' ? hub.lobby.boatStatus() : kind === 'hide' ? hub.lobby.hideStatus() : hub.lobby.kartStatus(); assert.ok(!status?.names.includes('Roof')); }
    };
    assertExcluded();
    placeAt(hub, a.c, circle.x, circle.z);
    hub.lobby.playerOf(a.c)!.action = ACT_RIDE;
    steps(hub, KART_CHECK_EVERY * 2);
    assertExcluded();
  });
  test(`${kind}: jumping out across the horizontal boundary cancels participation`, () => {
    const { hub } = setupHub({ fort: true, boatrace: true, hide: true });
    const a = login(hub, 'Leaving'), b = kind === 'hide' ? login(hub, 'Partner') : null;
    placeAt(hub, a.c, circle.x, circle.z);
    if (b) placeAt(hub, b.c, circle.x + 0.6, circle.z);
    steps(hub, 60);
    let crossedInAir = false;
    for (let tick = 0; tick < 35; tick++) {
      sendInput(hub, a.c, BTN_FORWARD | (tick === 0 ? BTN_JUMP : 0));
      hub.step();
      const p = hub.lobby.playerOf(a.c)!;
      if (Math.hypot(p.state.x - circle.x, p.state.z - circle.z) > circle.r && p.state.y > 0.1) crossedInAir = true;
    }
    assert.ok(crossedInAir, 'real movement must leave the circle while airborne');
    steps(hub, KART_CHECK_EVERY);
    if (dwell) assert.equal(lastOf(a.s, 'startZone')?.kind, null);
    else {
      const status = kind === 'boatrace' ? hub.lobby.boatStatus() : kind === 'hide' ? hub.lobby.hideStatus() : hub.lobby.kartStatus();
      assert.equal(status?.phase, 'idle');
      assert.ok(!status?.names.includes('Leaving'));
    }
    assert.equal(a.c.room?.kind, 'lobby');
  });
}

test('kart host keeps the selected map and arrival order while jumping', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Host'), b = login(hub, 'Guest');
  placeAt(hub, a.c, KART_START.x, KART_START.z); steps(hub, KART_CHECK_EVERY);
  placeAt(hub, b.c, KART_START.x + 0.6, KART_START.z); steps(hub, KART_CHECK_EVERY);
  hub.onJson(a.c, { t: 'kartTrack', track: 'foundry' });
  for (let tick = 0; tick < 60; tick++) {
    sendInput(hub, a.c, tick === 0 ? BTN_JUMP : 0); hub.step();
    const status = hub.lobby.kartStatus();
    assert.equal(status.hostId, hub.lobby.playerOf(a.c)!.slot);
    assert.equal(status.track, 'foundry');
    assert.deepEqual(status.names, ['Host', 'Guest']);
  }
  hub.onJson(b.c, { t: 'kartTrack', track: 'port' });
  assert.equal(hub.lobby.kartStatus().track, 'foundry');
});
