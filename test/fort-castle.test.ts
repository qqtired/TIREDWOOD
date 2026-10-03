// «Крепость»: вид замка (client/fort/castle*). Только вид, но он не должен мешать игре: ничего не стоит в проёме ворот,
// на ходу по стенам, у лестниц, башен с бойницами, прилавка и мест липучек; открытые створки уходят в ниши (проём
// 5 × 3 м не сужается); вид ворот по прочности и ступени одинаков у всех; гирлянды над террасой не лезут в камеру.
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import * as THREE from 'three';
import { GATE, TERRACE, THROAT_Z, WALL_T } from '../shared/fortmap.ts';
import { BUNTING, BUNTING_DROP, cylOverlaps, decorItems, gatePress, keepOut, overlaps } from '../client/fort/castle/layout.ts';
import { CRACKS, IRON, PLANKS, crackShown, gateLook, ironShown, plankState } from '../client/fort/castle/gatestate.ts';

/** Холст-заглушка для текстур (как в fort-render.test.ts) */
function fakeCanvas(t: TestContext): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const noop = () => {};
  const ctx = new Proxy({
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop: noop }), createLinearGradient: () => ({ addColorStop: noop }),
  }, { get: (o, k) => Reflect.get(o, k) ?? noop });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => ctx }) } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
}

test('замок не загораживает проём, ход по стенам, лестницы, башни с бойницами, прилавок и места липучек', () => {
  const bad: string[] = [];
  for (const it of decorItems()) {
    for (const k of keepOut()) {
      const hit = it.box ? overlaps(it.box, k.box) : cylOverlaps(it.cyl!.x, it.cyl!.z, it.cyl!.r, it.cyl!.y0, it.cyl!.y1, k.box);
      if (hit) bad.push(`${it.name} × ${k.name}`);
    }
  }
  assert.deepEqual(bad, []);
  // флажки над террасой висят выше 3 м над её полом (камера над плечом стреляющего с террасы — ниже)
  const across = BUNTING.find((b) => b.a[2] === b.b[2])!;
  const low = Math.min(across.a[1], across.b[1]) - across.sag - BUNTING_DROP;
  assert.ok(low >= TERRACE.h + 3, `флажки над террасой на ${low.toFixed(2)} м`);
});

test('открытые створки целиком в нишах: проём не сужается, во двор не торчат — на любой ступени железа', async (t) => {
  fakeCanvas(t);
  const { CastleFx } = await import('../client/fort/castle/fx.ts');
  const { CastleGate } = await import('../client/fort/castle/gate.ts');
  const gate = new CastleGate(new CastleFx());
  const m = new THREE.Matrix4();
  const box = new THREE.Box3();
  for (const tier of [0, 4, 8]) {
    gate.setTier(tier, true);
    gate.set(1, 1, false, true);
    gate.update(1 / 60, 0);
    let parts = 0;
    for (const o of gate.group.children) {
      const im = o as THREE.InstancedMesh;
      if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        box.copy(im.geometry.boundingBox!).applyMatrix4(m);
        const size = box.getSize(new THREE.Vector3());
        if (Math.max(size.x, size.y, size.z) < 0.01) continue; // спрятана
        parts++;
        const side = box.min.x >= GATE.x1 - 1e-3 || box.max.x <= GATE.x0 + 1e-3;
        assert.ok(side, `ступень ${tier}: часть в проёме x ${box.min.x.toFixed(3)}…${box.max.x.toFixed(3)}`);
        assert.ok(box.max.z <= GATE.face + WALL_T + 1e-3, `ступень ${tier}: торчит во двор до z ${box.max.z.toFixed(3)}`);
        assert.ok(box.min.y >= -1e-3 && box.max.y <= GATE.h + 1e-3, `ступень ${tier}: по высоте ${box.min.y.toFixed(3)}…${box.max.y.toFixed(3)}`);
      }
    }
    assert.ok(parts > 20, `ступень ${tier}: видимых частей ${parts}`);
  }
  // закрываются — створки снова поперёк проёма
  gate.set(0, 1, false, true);
  gate.update(1 / 60, 0);
  assert.equal(gate.info().modes, 'hinged/hinged');
  gate.dispose();
});

test('вид ворот по прочности: одинаков у всех и только портится с уроном', () => {
  assert.deepEqual(gateLook(1, 0), { holed: 0, gone: 0, cracks: 0, iron: gateLook(1, 0).iron });
  let prev = PLANKS.map(() => 0);
  let prevCracks = 0;
  for (let k = 100; k >= 0; k--) {
    const hp = k / 100;
    const now = PLANKS.map((s) => plankState(s, hp));
    now.forEach((st, i) => assert.ok(st >= prev[i], `доска ${i} «починилась» на ${hp}`));
    const cracks = CRACKS.filter((c) => crackShown(c, hp)).length;
    assert.ok(cracks >= prevCracks);
    prev = now;
    prevCracks = cracks;
  }
  const half = gateLook(0.5, 0);
  const low = gateLook(0.1, 0);
  assert.ok(half.holed >= 2 && half.gone === 0, 'на 50 % — пара пробитых досок');
  assert.ok(low.holed + low.gone >= 8 && low.gone >= 2, 'на 10 % — почти всё пробито, часть выбита');
  // железо: с 1-й ступени каждая следующая добавляет, на 8-й — золото
  for (let tier = 2; tier <= 8; tier++) assert.ok(gateLook(1, tier).iron > gateLook(1, tier - 1).iron, `ступень ${tier}`);
  assert.ok(IRON.some((p) => ironShown(p, 8) && p.goldFrom <= 8));
  assert.ok(!IRON.some((p) => ironShown(p, 7) && p.goldFrom <= 7));
});

test('сжатие босса в проёме: 1 в «горле» и проезде, к 0 за 2,5 м, сбоку — 0', () => {
  assert.equal(gatePress(0, (THROAT_Z + GATE.face) / 2), 1);
  assert.equal(gatePress(0, GATE.face + WALL_T / 2), 1);
  assert.ok(Math.abs(gatePress(0, THROAT_Z - 1.25) - 0.5) < 1e-9);
  assert.equal(gatePress(0, THROAT_Z - 3), 0);
  assert.equal(gatePress(0, GATE.face + WALL_T + 3), 0);
  assert.equal(gatePress(GATE.x1 + 3.5, GATE.face), 0);
});
