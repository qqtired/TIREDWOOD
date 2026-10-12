import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function overlap(a: number[][], b: number[][]): number {
  const signed = b.reduce((sum, p, i) => { const q = b[(i + 1) % b.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
  let polygon = a;
  for (let edge = 0; edge < b.length; edge++) {
    const p = b[edge], q = b[(edge + 1) % b.length], sign = signed >= 0 ? 1 : -1;
    const distance = (v: number[]) => sign * ((q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]));
    const result: number[][] = [];
    for (let i = 0; i < polygon.length; i++) {
      const x = polygon[i], y = polygon[(i + 1) % polygon.length], dx = distance(x), dy = distance(y);
      if (dx >= -1e-7) result.push(x);
      if ((dx >= -1e-7) !== (dy >= -1e-7)) { const t = dx / (dx - dy); result.push([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t]); }
    }
    polygon = result;
  }
  return Math.abs(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
}

test('actual Kursaal: подшивка и карниз не имеют общих лицевых поверхностей', async () => {
  const { PAVILIONS } = await import('../client/lobby/plaza3/pavdata.ts');
  const bytes = readFileSync(new URL(`../client/assets/plaza3/${PAVILIONS.find((p) => p.id === 'kursaal')!.file}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const faces: number[][][] = [];
  gltf.scene.getObjectByName('static_kursaal')!.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const p = o.geometry.getAttribute('position'), indices = o.geometry.index;
    for (let i = 0; i < (indices?.count ?? p.count); i += 3) faces.push([0, 1, 2].map((k) => { const id = indices ? indices.getX(i + k) : i + k; return [p.getX(id), p.getY(id), p.getZ(id)]; }));
  });
  let intersections = 0, area = 0;
  for (const [axis, at] of [[0, 9.88], [0, -9.88], [2, 5.28]]) {
    const axes = [0, 1, 2].filter((x) => x !== axis);
    const onPlane = faces.filter((f) => f.every((v) => Math.abs(v[axis] - at) < 1e-4 && v[1] >= 5.69 && v[1] <= 5.91));
    for (let i = 0; i < onPlane.length; i++) for (let j = i + 1; j < onPlane.length; j++) {
      const shared = overlap(onPlane[i].map((v) => axes.map((axis) => v[axis])), onPlane[j].map((v) => axes.map((axis) => v[axis])));
      if (shared > 1e-5) { intersections++; area += shared; }
    }
  }
  assert.equal(intersections, 0, `совпадающих пар ${intersections}, площадь ${area.toFixed(5)}м²`);
  // Removing hidden overlap must retain both wooden borders and the stone middle of all three sides.
  gltf.scene.updateMatrixWorld(true);
  for (const y of [5.71, 5.79, 5.86]) for (const [origin, direction, axis, want] of [
    [[11, y, 1], [-1, 0, 0], 'x', 9.88], [[-11, y, 1], [1, 0, 0], 'x', -9.88], [[0, y, 7], [0, 0, -1], 'z', 5.28],
  ] as const) {
    const hit = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction)).intersectObject(gltf.scene, true)[0];
    // Above the stone strip the original roof tiles project 2.249cm beyond the fascia.
    const boundary = y === 5.86 ? (axis === 'x' ? Math.sign(want) * 9.90249 : 5.302492) : want;
    assert.ok(hit && Math.abs(hit.point[axis] - boundary) < 1e-4, `дырка на ${axis}=${boundary}, y=${y}`);
  }
});
