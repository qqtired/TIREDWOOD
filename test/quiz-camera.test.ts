// Х-8: камера за спиной стоящего на сцене «Ракушки» упирается в стенки ракушки и заднее полотно, а не уходит внутрь
// (раньше она пропускала все невидимые боксы, и полэкрана закрашивалось цветом ракушки); игроков стенки по-прежнему
// не пускают, прочие невидимые боксы камера, как и раньше, пропускает.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.PLAZA3 = '1';
const { buildLobby } = await import('../shared/maps/lobby.ts');
const { CollisionWorld } = await import('../shared/world.ts');
const { cameraRig, RIG_LOBBY } = await import('../shared/aim.ts');
const { QUIZ_VENUE: V, toWorld } = await import('../shared/quiz/venue.ts');

const map = buildLobby();
const world = new CollisionWorld(map);
// то же без стенок для камеры — как было до исправления
const before = new CollisionWorld({ ...map, boxes: map.boxes.map((b) => ({ ...b, cam: false })) });
/** Стоит на сцене, в середине, местный x 1,6 (до заднего полотна 1,2 м) */
const [px, py, pz] = toWorld(V.data.world, 1.6, 0.6, 0);
const out = { x: 0, y: 0, z: 0 };
const walls = map.boxes.filter((b) => b.cam);

/** Отрезок от опоры игрока (над ногами) до камеры пересекает бокс (метод плит) */
const crosses = (b: { min: number[]; max: number[] }): boolean => {
  const o = [px, py + 1.45, pz], e = [out.x, out.y, out.z];
  let t0 = 0, t1 = 1;
  for (let a = 0; a < 3; a++) {
    const d = e[a] - o[a];
    if (Math.abs(d) < 1e-9) {
      if (o[a] <= b.min[a] || o[a] >= b.max[a]) return false;
      continue;
    }
    const u = (b.min[a] - o[a]) / d, v = (b.max[a] - o[a]) / d;
    t0 = Math.max(t0, Math.min(u, v));
    t1 = Math.min(t1, Math.max(u, v));
    if (t0 > t1) return false;
  }
  return true;
};

test('стенки ракушки и заднее полотно — невидимые, но камера в них упирается; стенка — до крыши ракушки', () => {
  assert.ok(walls.length >= 13, `стенок ${walls.length}`);
  assert.ok(walls.every((b) => b.mat === 'invisible'));
  const roof = (V.world.y ?? 0) + V.data.shell!.baseY + V.data.shell!.height;
  assert.ok(walls.filter((b) => b.max[1] >= roof - 1e-6).length >= 12, 'стенки подняты до крыши');
  assert.ok(map.boxes.filter((b) => b.mat === 'invisible' && !b.cam).length > walls.length, 'прочие невидимые боксы остались прозрачными для камеры');
  walls.forEach((_, i) => assert.equal(world.camBlock[map.boxes.indexOf(walls[i])], 1));
  assert.equal(world.camBlock.reduce((a, v) => a + v, 0), walls.length);
});

test('камера на сцене не проходит сквозь ракушку в любом повороте и наклоне; раньше проходила', () => {
  let wasInside = 0;
  for (const yaw of [0, 0.4, -0.4, Math.PI / 2, -Math.PI / 2]) {
    for (const pitch of [-0.9, -0.4, 0, 0.3]) {
      cameraRig(px, py, pz, yaw, pitch, RIG_LOBBY, 0, before, out);
      if (walls.some(crosses)) wasInside++;
      cameraRig(px, py, pz, yaw, pitch, RIG_LOBBY, 0, world, out);
      for (const b of walls) assert.ok(!crosses(b), `камера за стенкой (yaw ${yaw}, pitch ${pitch})`);
    }
  }
  assert.ok(wasInside > 0, 'без стенок для камеры она проходила сквозь ракушку (тест ловит исходный дефект)');
});

test('игроков стенки по-прежнему не пускают', () => {
  const b = walls[0];
  assert.equal(world.overlaps(b.min[0] + 0.05, b.min[1] + 0.05, b.min[2] + 0.05, b.max[0] - 0.05, b.min[1] + 1, b.max[2] - 0.05), true);
});
