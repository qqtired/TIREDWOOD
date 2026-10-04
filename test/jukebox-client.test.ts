// Клиент музыкального автомата (client/lobby/jukebox.ts) с двумя автоматами: модели видны только с флагом (на баркасе —
// ещё и вблизи), окно закрывается, если отошёл от того автомата, у которого его открыл.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { LobbyJukebox, type JukeModelLike } from '../client/lobby/jukebox.ts';
import { JUKEBOX_BARKAS, JUKE_BARKAS_USE, JUKE_USE } from '../shared/jukebox.ts';

const g = globalThis as { document?: unknown };
g.document ??= { hidden: false, addEventListener: () => {} };

function make() {
  const models = [0, 1].map(() => {
    const m = { vis: false, frames: 0, setVisible: (on: boolean) => { m.vis = on; }, update: () => { m.frames++; } };
    return m;
  });
  const panel = { open: false };
  const juke = new LobbyJukebox({
    sound: { musicLevel: 0, jukeKit: null, duckMusic: () => {}, coin: () => {} } as never,
    send: () => {}, toast: () => {}, myPid: () => 1, tokens: () => 100, ping: () => 0,
    onOpen: () => {}, onClose: () => {}, setSolid: () => {}, refreshShadows: () => {},
  });
  juke.attachPanel(() => ({
    open: () => { panel.open = true; },
    close: () => { panel.open = false; },
    get isOpen() { return panel.open; },
    update: () => {},
    onKey: () => false,
  }));
  juke.attachModels(models satisfies JukeModelLike[]);
  return { juke, models };
}

function cam(x: number, y: number, z: number): THREE.Camera {
  const c = new THREE.PerspectiveCamera();
  c.position.set(x, y, z);
  c.updateMatrixWorld();
  return c;
}

const at = (x: number, y: number, z: number) => ({ x, y, z });
const atPlaza = (dx = 0) => at(JUKE_USE.x + dx, 0, JUKE_USE.z);
const atBarkas = (dx = 0) => at(JUKE_BARKAS_USE.x + dx, JUKEBOX_BARKAS.y, JUKE_BARKAS_USE.z);
const camPlaza = () => cam(JUKE_USE.x, 3, JUKE_USE.z + 4);
const camBarkas = () => cam(JUKE_BARKAS_USE.x, 3, JUKE_BARKAS_USE.z - 4);

test('модели: без «juke» с сервера — ни одной; на площади — всегда, на баркасе — только вблизи; вышел из лобби — нет', () => {
  const { juke, models } = make();
  juke.reset(true);
  assert.deepEqual(models.map((m) => m.vis), [false, false]);
  juke.onMsg({ t: 'juke', v: { now: 0, cur: null, queue: [] } });
  juke.update(0.016, atPlaza(), camPlaza());
  assert.deepEqual(models.map((m) => m.vis), [true, false], 'с площади автомат на баркасе не рисуем');
  juke.update(0.016, atBarkas(), camBarkas());
  assert.deepEqual(models.map((m) => m.vis), [true, true], 'на баркасе — оба');
  assert.ok(models.every((m) => m.frames > 0), 'обе модели получают кадр');
  juke.reset(false);
  assert.deepEqual(models.map((m) => m.vis), [false, false]);
});

test('окно: открыл у автомата на баркасе — работает там, отошёл от него — закрылось; на площади — от своего автомата', () => {
  const { juke } = make();
  juke.reset(true);
  juke.onMsg({ t: 'juke', v: { now: 0, cur: null, queue: [] } });
  juke.update(0.016, atBarkas(), camBarkas());
  juke.open();
  assert.equal(juke.isOpen, true);
  juke.update(0.016, atBarkas(1), camBarkas());
  assert.equal(juke.isOpen, true, 'шаг в сторону — окно открыто');
  juke.update(0.016, atBarkas(JUKE_BARKAS_USE.r + 1.5), camBarkas());
  assert.equal(juke.isOpen, false, 'отошёл от автомата на баке — закрылось');
  juke.update(0.016, atPlaza(), camPlaza());
  juke.open();
  juke.update(0.016, atPlaza(2), camPlaza());
  assert.equal(juke.isOpen, true);
  juke.update(0.016, atPlaza(JUKE_USE.r + 1.5), camPlaza());
  assert.equal(juke.isOpen, false);
});
