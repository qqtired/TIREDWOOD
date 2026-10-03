import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HIDE_POOLS, HIDE_SLOTS, YARD } from '../shared/hidemap.ts';
import { HIDE_KIND, HIDE_KINDS, hideHalf, hideKindHint } from '../shared/hideprops.ts';
import { hideFillProps, hideFits, hideMotionWorld, stepProp, type HideBody } from '../shared/hidephysics.ts';
import { HideGame } from '../server/hide/game.ts';
import { BTN_BACK, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RIGHT, makeInput, makeState } from '../shared/sim.ts';

const lcg = (seed: number) => { let s = seed >>> 0 || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const world = hideMotionWorld();
hideFillProps(world, [], -1);

test('every authored slot fits every kind of its pool; spawns are free', () => {
  for (const s of HIDE_SLOTS) for (const kind of HIDE_POOLS[s.pool]) {
    assert.ok(hideFits(world, s.x, s.y, s.z, kind, s.yaw), `slot ${s.x},${s.z} (${s.pool}) cannot hold ${kind}`);
  }
  for (const [x, z] of YARD.propSpawns) assert.ok(hideFits(world, x, 0, z, 'crate', 0) && hideFits(world, x, 0, z, 'bucket', 0), `prop spawn ${x},${z}`);
  for (const [x, z] of YARD.hunterSpawns) assert.ok(!world.overlaps(x - 0.42, 0.01, z - 0.42, x + 0.42, 1.6, z + 0.42), `hunter spawn ${x},${z}`);
});

test('round layouts are dense, varied and never overlap', () => {
  const kinds = new Set<string>();
  for (let seed = 1; seed <= 6; seed++) {
    const rng = lcg(seed), game = new HideGame({ finished() {}, rand: n => Math.floor(rng() * n) });
    (game as unknown as { layout(): void }).layout();
    const d = game.decor;
    assert.ok(d.length >= 90 && d.length <= 135, `seed ${seed}: ${d.length} props`);
    assert.equal(new Set(d.map(b => b.id)).size, d.length, 'ids are unique');
    const a = { x: 0, z: 0 }, b = { x: 0, z: 0 };
    for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) {
      const p = d[i], q = d[j];
      hideHalf(p.kind, p.yaw, a); hideHalf(q.kind, q.yaw, b);
      const apart = Math.abs(p.x - q.x) >= a.x + b.x - 1e-9 || Math.abs(p.z - q.z) >= a.z + b.z - 1e-9 || Math.abs(p.y - q.y) > 0.5;
      assert.ok(apart, `seed ${seed}: ${p.kind}@${p.x},${p.z} overlaps ${q.kind}@${q.x},${q.z}`);
    }
    for (const b of d) kinds.add(b.kind);
  }
  assert.equal(kinds.size, HIDE_KINDS.length, 'all sixteen kinds appear across rounds');
});

function walk(kind: (typeof HIDE_KINDS)[number], x: number, z: number, buttons: number, yaw: number, ticks: number, props: HideBody[] = []) {
  hideFillProps(world, props, -1);
  const s = Object.assign(makeState(), { x, y: 0, z, grounded: 1 });
  for (let i = 0; i < ticks; i++) stepProp(s, { ...makeInput(), seq: i + 1, buttons, yaw }, world, kind, 0, false);
  return s;
}

test('size decides where a disguise fits: a bucket slides under a counter and the boat, a barrel does not', () => {
  const st = YARD.stalls[0];
  // из-за прилавка (со стороны продавца, с севера) — на юг, под столешницу
  const bucket = walk('bucket', st.x, st.z - 1.0, BTN_BACK, 0, 40);
  assert.ok(bucket.z > st.z - 0.3, `bucket got under the counter: z=${bucket.z}`);
  const barrel = walk('barrel', st.x, st.z - 1.0, BTN_BACK, 0, 40);
  assert.ok(barrel.z < st.z - 0.45, `a barrel is too tall for the counter gap: z=${barrel.z}`);
  const bt = YARD.boat, under = walk('can', (bt.x0 + bt.x1) / 2, bt.z0 - 1, BTN_BACK, 0, 40);
  assert.ok(under.z > bt.z0 + 0.3, `watering can slides under the boat: z=${under.z}`);
});

test('size changes speed: small 95%, medium 85%, large 75% of a runner', () => {
  const run = (kind: (typeof HIDE_KINDS)[number]) => walk(kind, 7, 12, BTN_FORWARD, 0, 60).z;
  const small = 12 - run('bucket'), medium = 12 - run('crate'), large = 12 - run('bench');
  assert.ok(small > medium && medium > large, `${small} > ${medium} > ${large}`);
  assert.ok(Math.abs(medium / small - 0.85 / 0.95) < 0.03 && Math.abs(large / small - 0.75 / 0.95) < 0.03);
});

test('props climb the dock stairs, jump, and never leave the yard', () => {
  const dk = YARD.dock, sx = (dk.stairX0 + dk.stairX1) / 2;
  const up = walk('crate', sx, dk.z1 + 2.2, BTN_FORWARD, 0, 90);
  assert.ok(Math.abs(up.y - dk.top) < 1e-6 && up.z < dk.z1, `crate climbed the stairs: y=${up.y} z=${up.z}`);
  for (const [buttons, yaw] of [[BTN_FORWARD | BTN_JUMP, 0], [BTN_LEFT | BTN_JUMP, 0], [BTN_RIGHT | BTN_JUMP, Math.PI], [BTN_BACK | BTN_JUMP, 0]] as const) {
    const s = walk('gnome', 7, 2, buttons, yaw, 600);
    assert.ok(s.x > -20 && s.x < 20 && s.z > -15 && s.z < 15 && s.y >= 0, `stays inside: ${s.x},${s.y},${s.z}`);
  }
});

test('hover hint names speed and paint in the object gender', () => {
  assert.equal(hideKindHint('bucket'), 'ведро (быстрое, 1 клякса)');
  assert.equal(hideKindHint('barrel'), 'бочка (средняя, 2 кляксы)');
  assert.equal(hideKindHint('bench'), 'скамейка (медленная, 3 кляксы)');
  assert.equal(hideKindHint('gnome'), 'садовый гном (быстрый, 1 клякса)');
  assert.ok(Object.values(HIDE_KIND).every(k => k.h > 0.3 && k.w > 0.1 && k.d > 0.1));
});
