import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quizVoiceSpot } from '../server/lobby/quiz/voice.ts';
import { QUIZ_VENUE as V, insideFence, QUIZ_AREA_TOP } from '../shared/quiz/venue.ts';

process.env.PLAZA3 = '1';
const { Hub } = await import('../server/hub.ts');
const { setupHub, login, lastOf, placeAt, steps } = await import('./kit.ts');

test('голос: вход за ограду меняет world на stage и соседей; выход и QUIZ=0', () => {
  for (const quiz of [true, false]) {
    const { store, profiles, clock } = setupHub();
    const hub = new Hub({ store, profiles, now: () => clock.now, quiz, voice: true, smokeToken: '', build: 'test', log: () => {} });
    const a = login(hub, 'Tester7'), b = login(hub, 'Tester8'), outside = login(hub, 'Tester9');
    for (const p of [a, b, outside]) hub.onJson(p.c, { t: 'voice', a: 'join' });
    const first = lastOf(a.s, 'voiceState')!.self!;
    for (const [p, chair] of [[a, V.chairs[0]], [b, V.chairs[1]]] as const) placeAt(hub, p.c, chair.x, chair.z, chair.y);
    steps(hub, 6);
    const state = lastOf(a.s, 'voiceState')!;
    assert.equal(state.zone, quiz ? 'stage' : 'world');
    assert.equal(a.c.spot, quiz ? 'stage' : null);
    if (quiz) {
      assert.ok(state.self! > first); assert.deepEqual(state.peers.map(p => p.pid), [b.c.pid]);
      assert.ok(!lastOf(outside.s, 'voiceState')!.peers.some(p => p.pid === a.c.pid));
      placeAt(hub, a.c, V.center[0] + 100, V.center[1], V.world.y ?? 0); steps(hub, 6);
      assert.equal(lastOf(a.s, 'voiceState')!.zone, 'world');
      assert.ok(lastOf(a.s, 'voiceState')!.self! > state.self!);
      assert.ok(lastOf(outside.s, 'voiceState')!.peers.some(p => p.pid === a.c.pid));
    } else assert.equal(state.self, first);
  }
});

test('голос у границы: полоса 0,5 м сохраняет зону; высота и поездка её снимают', () => {
  const [a, b] = V.fence;
  const mid = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 }, dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  let nx = -dz / len, nz = dx / len;
  if (insideFence(mid.x + nx * 0.2, mid.z + nz * 0.2)) { nx = -nx; nz = -nz; }
  const point = (d: number) => ({ x: mid.x + nx * d, z: mid.z + nz * d, y: V.world.y ?? 0, riding: false, ephemeral: false });
  assert.equal(quizVoiceSpot(true, null, point(-0.2)), 'stage');
  assert.equal(quizVoiceSpot(true, 'stage', point(0.25)), 'stage');
  assert.equal(quizVoiceSpot(true, null, point(0.25)), null);
  assert.equal(quizVoiceSpot(true, 'stage', point(0.6)), null);
  assert.equal(quizVoiceSpot(false, 'stage', point(-0.2)), null);
  assert.equal(quizVoiceSpot(true, 'stage', { ...point(-0.2), y: (V.world.y ?? 0) + QUIZ_AREA_TOP }), null);
  assert.equal(quizVoiceSpot(true, 'stage', { ...point(-0.2), riding: true }), null);
});
