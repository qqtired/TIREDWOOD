import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.PLAZA3 = '1';
const { P3 } = await import('../shared/plaza3/layout.ts');
const { townHeight, townLotBase, TOWN_LIMIT } = await import('../client/lobby/plaza3/landscape.ts');
const { gardenPlan, GARDEN_ROUTE, routeDistance } = await import('../client/lobby/plaza3/garden-data.ts');
const { signHill, layoutSign, LETTER_H } = await import('../client/lobby/tiredwood.ts');

function ground(x: number, z: number): number {
  const depth = Math.max(Math.min(x - P3.land.town.e, 22 - z), Math.min(P3.land.town.n - z, x + 30));
  return townHeight(x, z, depth, signHill(x, z));
}

test('гора plaza3 плавно спускается к берегу и дальним краям сетки, а не обрывается стеной', () => {
  for (const x of [500, 800, 1100, TOWN_LIMIT.x1]) {
    assert.ok(Math.abs(ground(x, 21.4) + 0.6) < 0.001, `берег x=${x}`);
    assert.ok(Math.abs(ground(x, 22) - ground(x, 21.4)) < 0.001);
  }
  for (const z of [-250, -600, -900]) assert.equal(ground(TOWN_LIMIT.x1, z), -0.6, 'дальний восточный край');
  for (const x of [200, 700, 1100]) assert.equal(ground(x, TOWN_LIMIT.z0), -0.6, 'дальний северный край');
  assert.ok(ground(800, -300) > 80, 'цельная высокая гора за надписью сохранена');
});

test('все буквы надписи стоят на склоне, большинство целиком на фоне горы', () => {
  const letters = layoutSign(ground);
  let covered = 0;
  for (const letter of letters) {
    assert.ok(Math.abs(ground(letter.x, letter.z) - P3.sign.lineY) < 2, `${letter.ch}: буква на земле (случайный сдвиг опор ±4 м)`);
    const distance = Math.hypot(letter.x - 27, letter.z - 13);
    const bearing = Math.atan2(letter.x - 27, 13 - letter.z);
    let skyline = -Infinity;
    for (let r = distance + 8; r < 1450; r += 6) {
      const x = 27 + Math.sin(bearing) * r, z = 13 - Math.cos(bearing) * r;
      skyline = Math.max(skyline, Math.atan2(ground(x, z) - 17, r));
    }
    if (skyline >= Math.atan2(letter.y + LETTER_H - 17, distance)) covered++;
  }
  assert.ok(covered >= 8, 'не меньше восьми букв целиком на фоне горы; последняя D стоит на конце склона');
});

test('дома не ставятся на крутой склон и площадку с бугром в середине', () => {
  assert.equal(townLotBase((x) => x, 0, 0, 12, 12), null);
  assert.equal(townLotBase((x, z) => x === 6 && z === 6 ? 5 : 0, 0, 0, 12, 12), null);
  assert.equal(townLotBase(() => 2, 0, 0, 12, 12), 1.6);
});

test('грядки и многочисленные подсолнухи заполняют поле, сохраняя калитку, проход к мельнице и её основание', () => {
  const plan = gardenPlan();
  assert.ok(plan.beds.length >= 6 && plan.beds.length <= 12);
  assert.ok(plan.sunflowers.length >= 100);
  for (const p of plan.sunflowers) {
    assert.ok(p.x > 49 && p.x < 91 && p.z > -69 && p.z < -27, 'растения внутри огородного поля');
    assert.ok(routeDistance(p.x, p.z, GARDEN_ROUTE) > 2.2, 'видимый проход к мельнице');
    assert.ok(Math.hypot(p.x - 84, p.z + 62) > 5.3, 'основание мельницы свободно');
    assert.ok(Math.hypot(p.x - P3.farmRoad.use.x, p.z - P3.farmRoad.use.z) > 3, 'калитка и подсказка E свободны');
  }
  for (const bed of plan.beds) assert.ok(routeDistance(bed.x, bed.z, GARDEN_ROUTE) > 5, 'грядки вне прохода');
  assert.deepEqual(gardenPlan(), plan, 'раскладка одинакова при начальной загрузке');
});
