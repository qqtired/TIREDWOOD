import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { FortMatch } from '../client/fort/match.ts';
import { ClockSync } from '../client/net.ts';
import { Predictor } from '../client/predict.ts';
import { FORT_MIN_DELAY, FT_WAVE, Z_BOSS, Z_WALKER } from '../shared/fort.ts';
import { buildFort } from '../shared/fortmap.ts';
import { afterFortWeapon, beforeFortWeapon } from '../shared/fortweapon.ts';
import { encodeFortTail, fortTailSize, makeFortTail, type ZombieSnap } from '../shared/fortnet.ts';
import { encodeEntities, encodeSnapshot, makeHeader } from '../shared/protocol.ts';
import { BTN_FIRE, BTN_RELOAD, RELOAD_TICKS, copyState, makeInput, makeState } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';

function snapshot(tick: number, zombies: ZombieSnap[]): ArrayBuffer {
  const entities = encodeEntities([]);
  const body = new Uint8Array(entities.length + fortTailSize(zombies.length));
  body.set(entities);
  encodeFortTail(body, entities.length, { gate: 1600, crystal: 2500, turrets: 0, jams: 0, left: zombies.length }, zombies, zombies.length);
  return encodeSnapshot({ ...makeHeader(), tick, phase: FT_WAVE, scoreA: 8 }, null, body).buffer as ArrayBuffer;
}

test('HUD убирает убитого босса, даже если волна продолжается с оставшейся мелочью', (t) => {
  // Real snapshot decoding and HUD selection; omit DOM/Audio/WebGL plumbing in this Node test.
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { innerWidth: 1280, innerHeight: 800 } });
  t.after(() => { if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window'); });
  let bossHealth = 0;
  const noop = () => {};
  const pb = new Proxy({}, { get: () => noop });
  const hud = new Proxy({ pb, shopShown: false, endShown: false, setBoss: (hp: number) => { bossHealth = hp; } }, {
    get: (target, key) => Reflect.get(target, key) ?? noop,
  });
  const match = Object.assign(Object.create(FortMatch.prototype), {
    ready: true, myId: 1, clock: new ClockSync(FORT_MIN_DELAY), header: makeHeader(), selfSnap: makeState(),
    ents: [], tail: makeFortTail(), zlist: [], tracks: new Map(), seen: new Set(), roster: new Map(), rosterList: [],
    predictor: { state: makeState() }, alive: true, mapTimer: Infinity, turrets: 0, jams: 0,
    d: { hud, zombies: { push: noop }, world: { camera: new THREE.PerspectiveCamera(), renderer: { canvas: { clientHeight: 800 } } },
      settings: { showStats: false }, input: { isHeld: () => false }, net: {} },
    applyTail: noop, updateBlocked: noop,
  });
  const walker: ZombieSnap = { id: 1, kind: Z_WALKER, state: 0, hp: 1, x: 0, y: 0, z: -28, yaw: 0, atk: 0 };
  const boss: ZombieSnap = { ...walker, id: 2, kind: Z_BOSS, hp: 0.5 };
  match.onSnapshot(snapshot(100, [walker, boss]), performance.now());
  match.updateHud(0);
  assert.ok(bossHealth > 0);
  match.onSnapshot(snapshot(102, [walker]), performance.now());
  match.updateHud(0);
  assert.equal(bossHealth, 0, 'полоса исчезает после снимка без босса');
});

test('предсказание переигрывает ручную перезарядку 35 → 42, сохраняя выстрел на её последнем тике', () => {
  let extraReload = false;
  const predictor = new Predictor(new CollisionWorld(buildFort()), {
    before: (state, input) => { extraReload = beforeFortWeapon(state, input, true); },
    after: (state, _input, events) => afterFortWeapon(state, events, true, extraReload),
  });
  const initial = makeState();
  Object.assign(initial, { x: 0, y: 0, z: -40, ammo: 35, grounded: 1 });
  predictor.reset(initial, 0);
  const midway = makeState();
  const ack = Math.floor(RELOAD_TICKS / 2);
  const input = makeInput();
  for (let seq = 1; seq <= RELOAD_TICKS + 1; seq++) {
    input.seq = seq;
    input.buttons = seq === 1 ? BTN_RELOAD : seq === RELOAD_TICKS + 1 ? BTN_FIRE : 0;
    const events = predictor.step(input, true);
    if (seq === 1) { assert.equal(events.reloadStart, true); assert.equal(predictor.state.reloadT, RELOAD_TICKS); }
    if (seq === ack) copyState(midway, predictor.state);
  }
  assert.equal(predictor.state.ammo, 41, 'заполнение 42 и один выстрел на том же тике');
  midway.x += 0.5; // A real reconciliation forces pending inputs to replay through the Fortress hook.
  predictor.reconcile(ack, midway);
  assert.equal(predictor.state.reloadT, 0);
  assert.equal(predictor.state.ammo, 41);
  assert.equal(predictor.state.shots, 1);
});
