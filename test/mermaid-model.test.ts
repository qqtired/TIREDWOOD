// Русалка: модель и ход одного появления на сцене (client/lobby/mermaid.ts). Расписание и место — test/mermaid.test.ts.
// Здесь — что геометрия не битая (хвост когда-то вышел вывернутым наизнанку и рисовался тёмным: нормаль смотрела внутрь), что на сцене
// она видна ровно пока идёт появление, всплеск со звуком — дважды (вынырнула, нырнула), сердечки появляются и тают.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { TICK_RATE } from '../shared/constants.ts';
import { MERMAID_CUE, MERMAID_SHOW_S, MERMAID_T, lobbyMermaidLayout, mermaidAt } from '../shared/mermaid.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { Mermaid3D, mermaidArmGeometry, mermaidHairGeometry, mermaidHandGeometry, mermaidTailGeometry, mermaidTrinketsGeometry } from '../client/lobby/mermaid.ts';

/** Холста в node нет: подменяем только рисование (как в test/avatar-speech.test.ts) */
function withCanvasStub<T>(fn: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const ctx = new Proxy({}, { get: (_target, key) => {
    if (key === 'getImageData' || key === 'createImageData') return (_x: number, _y: number, w = 128, h = 128) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (key === 'measureText') return (s: string) => ({ width: s.length * 16 });
    return () => {};
  }, set: () => true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 128, height: 128, getContext: () => ctx }) } });
  try {
    return fn();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  }
}

/** Доля площади треугольников, чья лицевая сторона (порядок вершин) смотрит туда же, куда нормали вершин */
function agreeing(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const idx = g.getIndex();
  const n = idx ? idx.count / 3 : pos.count / 3;
  const at = (k: number): number => (idx ? idx.getX(k) : k);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
  let good = 0, total = 0;
  for (let t = 0; t < n; t++) {
    const ia = at(t * 3), ib = at(t * 3 + 1), ic = at(t * 3 + 2);
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    const face = e1.subVectors(b, a).cross(e2.subVectors(c, a));
    const area = face.length();
    if (area < 1e-12) continue;
    nn.fromBufferAttribute(nor, ia).add(c.fromBufferAttribute(nor, ib)).add(c.fromBufferAttribute(nor, ic));
    total += area;
    if (face.dot(nn) > 0) good += area;
  }
  return total ? good / total : 1;
}

test('модель: волосы, украшения, хвост и руки — конечные числа, нормали на месте, лицевая сторона смотрит наружу, треугольников немного', () => {
  const parts = {
    волосы: mermaidHairGeometry(), украшения: mermaidTrinketsGeometry(), хвост: mermaidTailGeometry().geometry,
    рука: mermaidArmGeometry(), кисть: mermaidHandGeometry(),
  };
  let triangles = 0;
  for (const [name, g] of Object.entries(parts)) {
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const col = g.getAttribute('color');
    assert.ok(pos && nor && col, `${name}: позиции, нормали и цвета есть`);
    assert.equal(nor.count, pos.count, `${name}: нормаль у каждой вершины`);
    assert.equal(col.count, pos.count, `${name}: цвет у каждой вершины`);
    for (let i = 0; i < pos.count; i++) {
      for (const v of [pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), col.getX(i)]) assert.ok(Number.isFinite(v), `${name}: вершина ${i} конечна`);
    }
    const share = agreeing(g);
    assert.ok(share > 0.97, `${name}: порядок вершин согласован с нормалями (${(share * 100).toFixed(1)}%)`);
    triangles += (g.getIndex() ? g.getIndex()!.count : pos.count) / 3;
  }
  assert.ok(triangles < 9000, `всё вместе — недорого для одной русалки (${triangles} треугольников)`);
});

test('хвост: растёт вниз от тела, плавник шире трубы, конец (tip) ниже всех точек трубы', () => {
  const { geometry, tip } = mermaidTailGeometry();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  assert.ok(box.max.y > 0 && box.max.y <= 0.4, 'верхушка внутри тела');
  assert.ok(box.min.y < -1.0, 'хвост достаточно длинный, чтобы плавник мелькал над водой при прыжке');
  assert.ok(box.max.x - box.min.x > 0.8, 'плавник шире хвоста');
  assert.ok(tip.y < -1, 'метка плавника у конца');
});

test('сцена: видна только пока идёт её появление; всплеск ровно дважды (вынырнула и нырнула), сердечки появляются и тают', () => {
  const lobby = buildLobby();
  const layout = lobbyMermaidLayout(lobby.boxes);
  // первое настоящее появление по расписанию
  let start = 0;
  while (!mermaidAt(start, layout)) start++;
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300);
  camera.position.set(-19, 1.4, 31);
  camera.updateMatrixWorld();
  const scene = new THREE.Scene();
  const splashes: boolean[] = [];
  let ripples = 0;
  const m = withCanvasStub(() => new Mermaid3D(scene, { layout, effects: { ripple: () => { ripples++; } }, onSplash: (_x, _y, _z, dive) => { splashes.push(dive); } }));
  assert.equal(m.group.visible, false, 'до появления спрятана');
  const dt = 1 / 20;
  const total = Math.round(MERMAID_SHOW_S * TICK_RATE);
  let seenHearts = false;
  let lastVisibleAge = -1;
  let hiddenAfter = false;
  for (let k = -3 * TICK_RATE; k < total + 3 * TICK_RATE; k += 3) {
    const tick = start + k;
    m.update(tick, dt, tick / TICK_RATE, camera);
    const at = mermaidAt(tick, layout);
    const dbg = m.debug();
    assert.equal(dbg.active, !!at, `тик ${k}: идёт появление — и она на сцене`);
    if (at && m.group.visible) lastVisibleAge = at.age;
    if (at) {
      assert.ok(Math.abs(m.group.position.x - at.show.x) < 1e-9 && Math.abs(m.group.position.z - at.show.z) < 1e-9, 'стоит там, где по расписанию');
      if (dbg.hearts) seenHearts = true;
    }
    if (k > total + TICK_RATE && !m.group.visible) hiddenAfter = true;
    if (!at) assert.equal(m.group.visible, false, `тик ${k}: вне появления спрятана`);
  }
  assert.ok(seenHearts, 'сердечки были');
  assert.ok(hiddenAfter, 'после нырка спрятана');
  assert.ok(lastVisibleAge > MERMAID_T.dive, 'видна до самого нырка');
  assert.deepEqual(splashes, [false, true], 'всплеск при появлении и при нырке — по разу');
  assert.ok(ripples >= 4, 'круги на воде расходятся');
  assert.ok(MERMAID_CUE.down > MERMAID_T.dive && MERMAID_CUE.down < MERMAID_SHOW_S, 'всплеск нырка — когда плавник уходит в воду');
  m.dispose(scene);
});
