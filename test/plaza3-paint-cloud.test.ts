// Геометрические дефекты двух моделей: краска отделена от пола, проём облачного портала свободен.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

type Point = [number, number, number];
function modelTriangles(file: string, family: string): Point[][] {
  const b = readFileSync(new URL(`../client/assets/plaza3/${file}`, import.meta.url));
  const len = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + len).toString());
  const bin = b.subarray(28 + len);
  const values = (id: number): number[] => {
    const a = j.accessors[id], v = j.bufferViews[a.bufferView];
    const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const n = a.type === 'VEC3' ? 3 : 1;
    const read = a.componentType === 5126 ? (at: number) => bin.readFloatLE(at) : a.componentType === 5123 ? (at: number) => bin.readUInt16LE(at) : (at: number) => bin.readUInt32LE(at);
    const bytes = a.componentType === 5123 ? 2 : 4;
    return Array.from({ length: a.count * n }, (_, i) => read(start + i * bytes));
  };
  const out: Point[][] = [];
  for (const node of j.nodes.filter((n: { name?: string; mesh?: number }) => n.mesh !== undefined && n.name?.startsWith('static_'))) {
    for (const p of j.meshes[node.mesh].primitives) {
      if (j.materials[p.material].name !== family) continue;
      const pos = values(p.attributes.POSITION), idx = p.indices === undefined ? Array.from({ length: pos.length / 3 }, (_, i) => i) : values(p.indices);
      for (let k = 0; k < idx.length; k += 3) out.push(idx.slice(k, k + 3).map((i) => pos.slice(i * 3, i * 3 + 3) as Point));
    }
  }
  return out;
}

test('краска у склада выше пола ниши и настила перед входом', () => {
  const floor = modelTriangles('pav_paintball.glb', 'p3_gloss').filter((t) =>
    t.every((p) => Math.abs(p[1] - t[0][1]) < 1e-6 && p[1] < 0.08 && p[2] < -6.3 && p[2] > -11.7));
  assert.ok(floor.length > 100, 'пятна на земле сохранены');
  for (const t of floor) {
    const niche = t.every((p) => p[2] > -8);
    assert.ok(t[0][1] >= (niche ? 0.045 : 0.03) - 1e-6, `краска на высоте ${t[0][1]} лежит вплотную к полу`);
  }
});

test('облачный портал: поперёк прохода нет старой белой балки', () => {
  const beam = modelTriangles('pav_skytower.glb', 'p3_matte').filter((t) => t.every(([x, y, z]) =>
    x >= -1.62001 && x <= 1.62001 && y >= 4.27999 && y <= 4.48001 && z >= -9.93001 && z <= -9.66999));
  assert.equal(beam.length, 0, 'сохранилась геометрия поперечины');
});

const FIXER = '../tools/plaza3/v2/paint-cloud.mjs';
const { subtract2D, area2D, intersectionArea2D } = await import(FIXER);

test('обрезка краски сохраняет открытый край и удаляет только закрытую площадь', () => {
  const base = [[0, 0], [1, 0], [0, 1]], cover = [[0, 0], [.5, 0], [0, .5]];
  assert.ok(Math.abs(subtract2D(base, cover).reduce((sum: number, p: number[][]) => sum + area2D(p), 0) - .375) < 1e-9);
  assert.ok(Math.abs(intersectionArea2D(base, cover) - .125) < 1e-9);
  assert.equal(subtract2D(base, base).length, 0);
  assert.ok(Math.abs(subtract2D(base, [[2, 0], [3, 0], [2, 1]]).reduce((sum: number, p: number[][]) => sum + area2D(p), 0) - .5) < 1e-9);
});

test('пейнтбол: на одной плоскости нет перекрывающихся треугольников разных слоёв краски', () => {
  const planes: Array<[number, number[]]> = [[0, [-10.03, 10.03]], [1, [.015, .03, .05]], [2, [-8.03, -8.035, -8.04, -2.955, -2.97, -3.955, -3.97]]];
  const tris = modelTriangles('pav_paintball.glb', 'p3_gloss');
  let checked = 0;
  for (const [axis, positions] of planes) for (const at of positions) {
    const on = tris.filter((t) => t.every((v) => Math.abs(v[axis] - at) < 1e-5)).map((t) => t.map((v) => v.filter((_, k) => k !== axis)));
    const bounds = on.map((t) => [Math.min(...t.map((v) => v[0])), Math.min(...t.map((v) => v[1])), Math.max(...t.map((v) => v[0])), Math.max(...t.map((v) => v[1]))]);
    for (let i = 0; i < on.length; i++) for (let k = i + 1; k < on.length; k++) {
      const a = bounds[i], b = bounds[k];
      if (a[0] >= b[2] || b[0] >= a[2] || a[1] >= b[3] || b[1] >= a[3]) continue;
      const overlap = intersectionArea2D(on[i], on[k]); checked++;
      assert.ok(overlap < 1e-7, `копланарная краска: ось${axis}, плоскость${at}, площадь пересечения${overlap}`);
    }
  }
  assert.ok(checked > 100, 'проверены настоящие треугольники краски');
});
