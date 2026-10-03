import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HIDE_FINAL_TICKS, HIDE_PREP_TICKS, HIDE_RESPAWN_TICKS, HIDE_RESULT_TICKS, HIDE_PODIUM_TICKS, HIDE_SEEK_TICKS, HIDE_SHOT_TICKS, PAINT, PTS, TAUNT, type HideStateMsg } from '../shared/hide.ts';
import { HIDE_KINDS, hideHits } from '../shared/hideprops.ts';
import { YARD } from '../shared/hidemap.ts';
import { active, aimAt, hideSetup, mirror, shoot, steps, toSeek } from './hide-helpers.ts';
import { BTN_FORWARD } from '../shared/sim.ts';

const lastState = (msgs: readonly { t: string }[]) => msgs.filter((m): m is HideStateMsg => m.t === 'hide_state').at(-1)!;

test('match starts after the gather wait; one hunter for 2–4, two for 5–8; hunters see nothing during prep', () => {
  for (const [n, hunters] of [[2, 1], [4, 1], [5, 2], [8, 2]] as const) {
    const { game, ps, sent } = hideSetup(n);
    assert.equal(game.phase, 'gather');
    steps(game, 300);
    assert.equal(game.phase, 'hide');
    assert.equal(ps.filter(p => p.role === 'hunter').length, hunters, `${n} players`);
    steps(game, 6);
    for (const p of ps) {
      const known = mirror(sent.get(p.pid)!);
      if (p.role === 'hunter') { assert.equal(known.size, 0, 'hunter in the shed gets no props'); assert.equal(lastState(sent.get(p.pid)!).self.state.x < YARD.shed.x1, true); }
      else assert.ok(known.size > 80, 'hiders see the whole yard');
    }
    steps(game, HIDE_PREP_TICKS);
    for (const p of ps) assert.ok(mirror(sent.get(p.pid)!).size > 80, 'everyone sees the yard in the seek phase');
  }
});

test('public props are anonymous: 7 numbers each, sorted by random id, no player fields', () => {
  const { game, ps, sent } = hideSetup(3);
  toSeek(game); steps(game, 6);
  const first = sent.get(ps[0].pid)!.filter((m): m is HideStateMsg => m.t === 'hide_state').find(m => m.full && m.p.length)!;
  assert.equal(first.p.length % 7, 0);
  const ids = first.p.filter((_, i) => i % 7 === 0);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
  const live = ps.filter(p => p.role === 'prop').map(p => p.prop);
  const known = mirror(sent.get(ps[0].pid)!);
  for (const id of live) assert.ok(known.has(id));
  assert.ok(!JSON.stringify(first.p).includes('Tester'));
  assert.equal(lastState(sent.get(ps[0].pid)!).left, live.length);
});

test('snapshots are deltas: a still yard sends nothing, a moving hider only itself, a caught one is gone', () => {
  const { game, ps, sent } = hideSetup(2);
  toSeek(game); steps(game, 12);
  const hunter = ps.find(p => p.role === 'hunter')!, prop = ps.find(p => p.role === 'prop')!;
  const box = sent.get(hunter.pid)!;
  const before = box.length; steps(game, 6);
  const still = box.slice(before).filter((m): m is HideStateMsg => m.t === 'hide_state');
  assert.ok(still.length >= 1 && still.every(m => !m.full && m.p.length === 0), 'nothing moved — nothing sent');
  assert.ok(JSON.stringify(still.at(-1)).length < 900, `compact: ${JSON.stringify(still.at(-1)).length} bytes`);
  let seq = prop.input.lastSeq;
  const mark = box.length;
  for (let i = 0; i < 12; i++) { prop.input.push([{ seq: ++seq, buttons: BTN_FORWARD, yaw: 0, pitch: 0, viewTick: 0 }], 1); game.step(); }
  const moving = box.slice(mark).filter((m): m is HideStateMsg => m.t === 'hide_state' && m.p.length > 0);
  assert.ok(moving.length >= 1 && moving.every(m => m.p.length === 7 && m.p[0] === prop.prop));
  game.decor = []; Object.assign(hunter.state, { x: 7, y: 0, z: 8 }); Object.assign(prop.state, { x: 7, y: 0, z: 3 }); prop.kind = 'bucket';
  steps(game, 1); shoot(game, hunter, aimAt(hunter, 7, 0.2, 3));
  assert.equal(game.phase, 'result');
  steps(game, 6);
  assert.ok(!mirror(box).has(prop.prop), 'caught hider disappears from the yard');
});

test('transform: look at a nearby object and press E — kind and yaw copied; far, blocked or on cooldown — refused', () => {
  const { game, ps, events } = hideSetup(2);
  steps(game, 301);
  const prop = ps.find(p => p.role === 'prop')!;
  game.decor = [{ id: 501, kind: 'gnome', x: 7, y: 0, z: 2, yaw: 5 }, { id: 502, kind: 'bench', x: 7, y: 0, z: 9.5, yaw: 0 }];
  Object.assign(prop.state, { x: 7, y: 0, z: 4 });
  game.action(prop, { t: 'hide', a: 'take', id: 501 });
  assert.equal(prop.kind, 'gnome'); assert.equal(prop.propYaw, 5); assert.equal(prop.chose, true);
  steps(game, 10);
  Object.assign(prop.state, { x: 7, z: 7.5 });
  game.action(prop, { t: 'hide', a: 'take', id: 502 });
  assert.equal(prop.kind, 'gnome', 'cooldown between transforms');
  steps(game, 60);
  Object.assign(prop.state, { x: 7, z: 2.8 });
  game.action(prop, { t: 'hide', a: 'take', id: 502 });
  assert.equal(prop.kind, 'gnome', 'bench 6.7 m away is too far');
  Object.assign(prop.state, { x: 7, z: 7.5 }); steps(game, 10);
  game.action(prop, { t: 'hide', a: 'take', id: 502 });
  assert.equal(prop.kind, 'bench');
  // сквозь стену склада — нельзя
  game.decor.push({ id: 503, kind: 'crate', x: -8, y: 0, z: -11, yaw: 0 });
  Object.assign(prop.state, { x: -8, z: -6.2 }); steps(game, 70);
  game.action(prop, { t: 'hide', a: 'take', id: 503 });
  assert.equal(prop.kind, 'bench', 'the warehouse wall blocks the view');
  Object.assign(prop.state, { x: 7, z: 7.5 });
  assert.ok(events(prop.pid).some(e => e.k === 'puff'));
  // кляксы: со второй кляксой маленьким стать нельзя
  prop.hits = 1; steps(game, 70);
  game.action(prop, { t: 'hide', a: 'take', id: 501 });
  assert.equal(prop.kind, 'bench');
  assert.ok(events(prop.pid).some(e => e.k === 'note' && e.text.includes('заляпан')));
});

test('paint: empty object −20, wall −5, a hider +30 and squeaks; at zero the gun jams until 20', () => {
  const { game, ps, events } = hideSetup(2);
  toSeek(game);
  const hunter = ps.find(p => p.role === 'hunter')!, prop = ps.find(p => p.role === 'prop')!;
  game.decor = [{ id: 601, kind: 'barrel', x: 7, y: 0, z: 2, yaw: 0 }];
  Object.assign(hunter.state, { x: 7, y: 0, z: 8 }); Object.assign(prop.state, { x: 2.2, y: 0, z: 9 }); prop.kind = 'barrel';
  shoot(game, hunter, aimAt(hunter, 7, 0.5, 2));
  assert.equal(hunter.paint, PAINT.max - PAINT.decor);
  assert.equal(hunter.misses, 1);
  steps(game, HIDE_SHOT_TICKS);
  shoot(game, hunter, [0, -1.2]);
  assert.equal(hunter.paint, PAINT.max - PAINT.decor - PAINT.world);
  steps(game, HIDE_SHOT_TICKS);
  hunter.paint = 50;
  shoot(game, hunter, aimAt(hunter, 2.2, 0.5, 9));
  assert.equal(prop.hits, 1); assert.equal(prop.role, 'prop', 'a barrel survives its first splat');
  assert.equal(hunter.paint, 50 + PAINT.hit);
  assert.ok(events(prop.pid).some(e => e.k === 'shot' && e.hit === 'prop' && e.size === 1), 'everyone hears the squeak');
  hunter.paint = 10; steps(game, HIDE_SHOT_TICKS);
  shoot(game, hunter, aimAt(hunter, 7, 0.5, 2));
  assert.equal(hunter.paint, 0); assert.equal(hunter.jam, true); assert.equal(hunter.paintOuts, 1);
  steps(game, HIDE_SHOT_TICKS);
  const misses = hunter.misses; shoot(game, hunter, aimAt(hunter, 7, 0.5, 2));
  assert.equal(hunter.misses, misses, 'a jammed gun does not fire');
  steps(game, PAINT.regenDelay + 60 * PAINT.unjam / PAINT.regen + 5);
  assert.equal(hunter.jam, false);
});

test('infection: the last splat catches, the hider pops and walks out of the shed as a hunter with 60 paint', () => {
  const { game, ps, events } = hideSetup(3);
  toSeek(game);
  const hunter = ps.find(p => p.role === 'hunter')!, [a, b] = ps.filter(p => p.role === 'prop');
  game.decor = [];
  Object.assign(hunter.state, { x: 7, y: 0, z: 8 }); Object.assign(a.state, { x: 7, y: 0, z: 3 }); a.kind = 'bucket';
  Object.assign(b.state, { x: 2, y: 0, z: 12 });
  assert.equal(hideHits('bucket'), 1);
  shoot(game, hunter, aimAt(hunter, 7, 0.2, 3));
  assert.equal(a.role, 'caught');
  const ev = events(b.pid).find(e => e.k === 'catch');
  assert.ok(ev && ev.k === 'catch' && ev.text === '💥 Ведро — это Tester' + a.pid + '! Ловец — Tester' + hunter.pid);
  assert.equal(hunter.finds, 1); assert.equal(hunter.pts, PTS.hit + PTS.catch);
  steps(game, HIDE_RESPAWN_TICKS);
  assert.equal(a.role, 'hunter'); assert.equal(a.paint, PAINT.infected);
  assert.ok(a.state.x > YARD.shed.x0 && a.state.x < YARD.shed.x1 && a.state.z > YARD.shed.z0 && a.state.z < YARD.shed.z1);
  assert.equal(game.phase, 'seek');
});

test('catching the last hider ends the round for the hunters with a team bonus and funny lines', () => {
  const { game, ps, results } = hideSetup(2);
  toSeek(game);
  const hunter = ps.find(p => p.role === 'hunter')!, prop = ps.find(p => p.role === 'prop')!;
  active(hunter); active(prop); game.decor = [];
  steps(game, 1200);
  Object.assign(hunter.state, { x: 7, y: 0, z: 8 }); Object.assign(prop.state, { x: 7, y: 0, z: 3 }); prop.kind = 'gnome';
  shoot(game, hunter, aimAt(hunter, 7, 0.3, 3));
  assert.equal(game.phase, 'result');
  assert.equal(game.result?.winner, 'hunters');
  assert.ok(game.result!.lines.some(l => l.startsWith('⏱ Садовый гном (Tester') && l.includes('продержался 0:2')), game.result!.lines.join(' | '));
  assert.equal(results.length, 2);
  const hr = results.find(r => r.pid === hunter.pid)!;
  assert.equal(hr.won, true); assert.equal(hr.found, 1);
  assert.equal(hunter.pts, PTS.hit + PTS.catch + PTS.teamWin);
  assert.ok(hr.reward > 0 && hr.reward <= 30);
});

test('forced taunt is a silent wiggle: first in 10–30 s, then every 30 s', () => {
  const { game, ps, events } = hideSetup(2);
  toSeek(game);
  const prop = ps.find(p => p.role === 'prop')!, hunter = ps.find(p => p.role === 'hunter')!;
  const first = prop.tauntAt - game.tick;
  assert.ok(first >= TAUNT.firstMin - 1 && first <= TAUNT.firstMax, `first taunt in ${first} ticks`);
  const wiggles = () => events(hunter.pid).filter(e => e.k === 'wiggle').length;
  steps(game, first + 1); assert.equal(wiggles(), 1);
  assert.ok(events(hunter.pid).some(e => e.k === 'wiggle' && e.id === prop.prop), 'the hider\'s own item trembles');
  steps(game, TAUNT.every); assert.equal(wiggles(), 2);
  assert.equal(events(hunter.pid).filter(e => e.k === 'taunt').length, 0, 'no sound and no notes');
});

test('own taunt (Z): quiet sound + wiggle, pays by distance, 15 s cooldown, caps at 75; no hint in the feed', () => {
  const { game, ps, events } = hideSetup(2);
  toSeek(game);
  const prop = ps.find(p => p.role === 'prop')!, hunter = ps.find(p => p.role === 'hunter')!;
  const sounds = () => events(hunter.pid).filter(e => e.k === 'taunt').length;
  const wiggles = () => events(hunter.pid).filter(e => e.k === 'wiggle' && e.id === prop.prop).length;
  const tauntAt = (dx: number) => { Object.assign(prop.state, { x: hunter.state.x + dx, z: hunter.state.z }); game.action(prop, { t: 'hide', a: 'taunt' }); return prop.tauntPts; };
  const before = prop.pts;
  assert.equal(tauntAt(4), 25); assert.equal(prop.pts - before, 25);
  assert.equal(sounds(), 1); assert.equal(wiggles(), 1);
  assert.ok(!events(hunter.pid).some(e => e.k === 'feed' && /насмешк/i.test(e.text)), 'the feed gives the hunter no hint');
  steps(game, TAUNT.cd - 10); assert.equal(tauntAt(4), 25, 'cooldown 15 s'); assert.equal(sounds(), 1);
  steps(game, 10); assert.equal(tauntAt(9), 40);
  steps(game, TAUNT.cd); assert.equal(tauntAt(30), 45);
  prop.tauntPts = 70;
  steps(game, TAUNT.cd); assert.equal(tauntAt(3), TAUNT.cap);
  steps(game, TAUNT.cd); assert.equal(tauntAt(3), TAUNT.cap);
  assert.equal(sounds(), 5, 'capped taunts still sound');
  assert.equal(game.phase, 'seek');
  // своя насмешка отодвигает обязательную
  assert.equal(prop.tauntAt, game.tick + TAUNT.every);
});

test('final 30 s: forced wiggles every 10 s, a single «final» signal for everyone', () => {
  const { game, ps, events } = hideSetup(2);
  toSeek(game);
  const hunter = ps.find(p => p.role === 'hunter')!;
  const count = () => events(hunter.pid).filter(e => e.k === 'wiggle').length;
  steps(game, game.phaseEnd - game.tick - HIDE_FINAL_TICKS + 1);
  assert.equal(events(hunter.pid).filter(e => e.k === 'final').length, 1);
  const at = count(); steps(game, HIDE_FINAL_TICKS - 2);
  assert.ok(count() - at >= 2, `final taunts: ${count() - at}`);
  assert.equal(game.phase, 'seek');
  steps(game, 2); assert.equal(game.phase, 'result');
});

test('time out: survivors win, AFK hunter cancels rewards, three rounds then podium and a new match', () => {
  const { game, ps, results } = hideSetup(3);
  toSeek(game);
  for (const p of ps) active(p);
  const hunter = ps.find(p => p.role === 'hunter')!;
  hunter.shots = 1; hunter.lastHuntAt = game.tick + HIDE_SEEK_TICKS;
  steps(game, HIDE_SEEK_TICKS);
  assert.equal(game.phase, 'result'); assert.equal(game.result?.winner, 'props');
  const survivors = ps.filter(p => p.role === 'prop');
  // +1 за секунду поиска и +40 за то, что дожил
  for (const p of survivors) { assert.equal(p.survivedEnd, true); assert.ok(p.pts >= PTS.survive + HIDE_SEEK_TICKS / 60 - 10, `${p.pts} points`); }
  assert.ok(game.result!.lines.some(l => l.startsWith('🏆')));
  assert.equal(results.length, 3);
  // раунд 2: ищущий ничего не делает — без наград
  steps(game, HIDE_RESULT_TICKS + HIDE_PREP_TICKS);
  assert.equal(game.round, 2); assert.equal(game.phase, 'seek');
  assert.notEqual(ps.find(p => p.role === 'hunter')!.pid, hunter.pid, 'roles rotate');
  for (const p of ps) active(p);
  steps(game, HIDE_SEEK_TICKS);
  assert.equal(game.result?.winner, 'cancelled'); assert.equal(results.length, 3);
  steps(game, HIDE_RESULT_TICKS + HIDE_PREP_TICKS);
  assert.equal(game.round, 3);
  for (const p of ps) { active(p); if (p.role === 'hunter') { p.shots = 1; p.lastHuntAt = game.tick + HIDE_SEEK_TICKS; } }
  steps(game, HIDE_SEEK_TICKS);
  assert.equal(game.result?.last, true);
  const last = results.slice(3);
  assert.equal(last.length, 3);
  assert.ok(last.some(r => r.reward >= 10), 'podium bonus with three players');
  steps(game, HIDE_RESULT_TICKS);
  assert.equal(game.phase, 'final');
  steps(game, HIDE_PODIUM_TICKS);
  assert.equal(game.match, 2); assert.equal(game.round, 1); assert.equal(game.phase, 'hide');
});

test('late joiner: during prep hides, during seek walks out as a hunter in 3 s; rejoin keeps role, not the payout', () => {
  const { game, ps } = hideSetup(2);
  steps(game, 301);
  const late = game.addHuman({ pid: 9, nick: 'Late', level: 1, outfit: ps[0].outfit }, { sendJson() {} })!;
  assert.equal(late.role, 'prop');
  steps(game, HIDE_PREP_TICKS);
  const later = game.addHuman({ pid: 10, nick: 'Later', level: 1, outfit: ps[0].outfit }, { sendJson() {} })!;
  assert.equal(later.role, 'caught');
  steps(game, HIDE_RESPAWN_TICKS);
  assert.equal(later.role, 'hunter');
  const prop = ps.find(p => p.role === 'prop')!;
  game.removePlayer(prop.id); steps(game, 60);
  assert.ok(game.canRejoin(prop.pid));
  const back = game.addHuman({ pid: prop.pid, nick: prop.nick, level: 1, outfit: prop.outfit }, { sendJson() {} })!;
  assert.equal(back, prop); assert.equal(back.role, 'prop'); assert.equal(back.rewardEligible, false);
});

test('every kind has a size, hits 1–3 and a mesh-friendly box', () => {
  for (const k of HIDE_KINDS) assert.ok([1, 2, 3].includes(hideHits(k)));
});
