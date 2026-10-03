import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { FortMatch } from '../client/fort/match.ts';
import { ClockSync } from '../client/net.ts';
import { Predictor } from '../client/predict.ts';
import { FORT_MIN_DELAY, FT_WAVE, Z_BOSS, Z_WALKER } from '../shared/fort.ts';
import { GUN_MARKER, gunMag, gunReload } from '../shared/fortarsenal.ts';
import { fortAfter, fortBefore, makeFortStep } from '../shared/fortgun.ts';
import { buildFort } from '../shared/fortmap.ts';
import { encodeFortTail, fortTailSize, makeFortTail, type ZombieSnap } from '../shared/fortnet.ts';
import { encodeEntities, encodeSnapshot, makeHeader } from '../shared/protocol.ts';
import { BTN_FIRE, BTN_RELOAD, copyState, makeInput, makeState } from '../shared/sim.ts';
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
    predictor: { state: makeState() }, alive: true, mapTimer: Infinity,
    d: { hud, zombies: { push: noop }, world: { camera: new THREE.PerspectiveCamera(), renderer: { canvas: { clientHeight: 800 } } },
      settings: { showStats: false }, input: { isHeld: () => false }, net: {} },
    // арсенал — своя часть клиента (arsenalc.ts); здесь только то, что матч у него спрашивает
    ars: { applyTail: noop, gateMax: 1600, crystalMax: 2500, ammo: () => [30, null], spread: () => 0.01, frame: noop },
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

test('предсказание переигрывает ручную перезарядку магазина ступени 1 (35 → 38), сохраняя выстрел на её последнем тике', () => {
  const step = makeFortStep();
  const load = { heavy: 0, rate: 0, mag: 1 };
  const predictor: Predictor = new Predictor(new CollisionWorld(buildFort()), {
    before: (state, input) => fortBefore(step, state, input, load),
    after: (state, _input, events) => fortAfter(step, state, events, true, predictor.seed),
  });
  const mag = gunMag(GUN_MARKER, 1);
  const reload = gunReload(GUN_MARKER, 0);
  assert.equal(mag, 38);
  const initial = makeState();
  Object.assign(initial, { x: 0, y: 0, z: -40, ammo: 35, grounded: 1, awp: 127 });
  predictor.reset(initial, 0);
  const midway = makeState();
  const ack = Math.floor(reload / 2);
  const input = makeInput();
  for (let seq = 1; seq <= reload + 1; seq++) {
    input.seq = seq;
    input.buttons = seq === 1 ? BTN_RELOAD : seq === reload + 1 ? BTN_FIRE : 0;
    const events = predictor.step(input, true);
    if (seq === 1) { assert.equal(events.reloadStart, true); assert.equal(predictor.state.reloadT, reload); }
    if (seq === ack) copyState(midway, predictor.state);
  }
  assert.equal(predictor.state.ammo, mag - 1, 'заполнение до 38 и один выстрел на том же тике');
  midway.x += 0.5; // A real reconciliation forces pending inputs to replay through the Fortress hook.
  predictor.reconcile(ack, midway);
  assert.equal(predictor.state.reloadT, 0);
  assert.equal(predictor.state.ammo, mag - 1);
  assert.equal(predictor.state.shots, 1);
});
