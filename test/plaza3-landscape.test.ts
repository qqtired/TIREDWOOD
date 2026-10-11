import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.PLAZA3 = '1';
const { P3 } = await import('../shared/plaza3/layout.ts');
const { townHeight, townCoastZ, townLotBase, TOWN_LIMIT } = await import('../client/lobby/plaza3/landscape.ts');
const { gardenPlan, GARDEN_ROUTE, GARDEN_EDGE, inGardenField, routeDistance } = await import('../client/lobby/plaza3/garden-data.ts');
const { signHill, layoutSign, LETTER_H } = await import('../client/lobby/tiredwood.ts');

function ground(x: number, z: number): number {
  const depth = Math.max(Math.min(x - P3.land.town.e, townCoastZ(x) - z), Math.min(P3.land.town.n - z, x + 30));
  return townHeight(x, z, depth, signHill(x, z));
}

test('гора plaza3 плавно спускается к берегу и дальним краям сетки, а не обрывается стеной', () => {
  for (const x of [500, 800, 1100, TOWN_LIMIT.x1]) {
    const coast = townCoastZ(x);
    assert.ok(Math.abs(ground(x, coast - 0.6) + 0.6) < 0.001, `берег x=${x}`);
    assert.ok(Math.abs(ground(x, coast) - ground(x, coast - 0.6)) < 0.001);
  }
  for (const x of [92, 300, 500, 630, 650]) assert.equal(townCoastZ(x), 22, 'ближний город и зона полёта не сдвинуты');
  for (const z of [-250, -600, -900]) assert.equal(ground(TOWN_LIMIT.x1, z), -0.6, 'дальний восточный край');
  for (const x of [200, 700, 1100]) assert.equal(ground(x, TOWN_LIMIT.z0), -0.6, 'дальний северный край');
  assert.ok(ground(800, -300) > 80, 'цельная высокая гора за надписью сохранена');
});

test('правый силуэт за TIREDWOOD спускается постепенно с точки появления', () => {
  let previous = Infinity;
  for (let bearing = 89; bearing <= 111; bearing++) {
    const angle = bearing * Math.PI / 180;
    let skyline = -Infinity;
    for (let distance = 100; distance < 1590; distance += 10) {
      skyline = Math.max(skyline, Math.atan2(ground(8 + Math.sin(angle) * distance, -8 - Math.cos(angle) * distance) - 1.7, distance));
    }
    if (previous !== Infinity) assert.ok(previous - skyline < 0.9 * Math.PI / 180, `нет резкой грани на азимуте ${bearing}°`);
    if (bearing === 104) assert.ok(skyline > 2 * Math.PI / 180, 'склон продолжается правее последней буквы');
    previous = skyline;
  }
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
  assert.ok(plan.beds.length >= 16 && plan.beds.length <= 24);
  assert.ok(plan.sunflowers.length >= 200);
  for (const z of [-18, -26]) for (const x of [76, 83, 88]) {
    assert.ok(plan.beds.some((b) => b.x === x && b.z === z), 'передний правый участок засажен грядками');
  }
  assert.ok(plan.sunflowers.filter((p) => p.x > 72 && p.z > -29).length >= 15, 'правые грядки окружены подсолнухами');
  for (const p of plan.sunflowers) {
    assert.ok(inGardenField(p.x, p.z, 0.65), 'растения внутри огородного поля');
    assert.ok(routeDistance(p.x, p.z, GARDEN_ROUTE) > 2.2, 'видимый проход к мельнице');
    assert.ok(Math.hypot(p.x - 84, p.z + 62) > 5.3, 'основание мельницы свободно');
    assert.ok(Math.hypot(p.x - P3.farmRoad.use.x, p.z - P3.farmRoad.use.z) > 3, 'калитка и подсказка E свободны');
  }
  for (const bed of plan.beds) {
    assert.ok(routeDistance(bed.x, bed.z, GARDEN_ROUTE) > 5, 'грядки вне прохода');
    for (const dx of [-2.15, 2.15]) for (const dz of [-3.4, 3.4]) {
      assert.ok(inGardenField(bed.x + dx, bed.z + dz, 0.6), 'доски не пересекают границу поля');
    }
  }
  for (const fence of plan.fences) {
    assert.ok(routeDistance(fence.x, fence.z, GARDEN_EDGE) < 0.001, 'настоящий плетень стоит по краю поля');
    assert.ok(routeDistance(fence.x, fence.z, GARDEN_ROUTE) > 5, 'плетень не пересекает рабочую тропу');
    assert.ok((fence.stretch ?? 1) > 0.8 && (fence.stretch ?? 1) <= 1, 'секции сохраняют форму и высоту исходной модели');
    assert.ok(fence.y === 0.035 || fence.y === P3.land.streetY + 0.035, 'опоры на настиле или на поле, без парения над спуском');
  }
  assert.ok(plan.fences.some((p) => p.z > -14 && p.x > 75), 'периметр закрывает правый участок вдоль садовой аллеи');
  assert.ok(P3.colliders.some((c) => c.id === 'wall.garden' && c.mat === 'invisible' && c.min[0] === 70 && c.max[0] === 93), 'прежняя недоступная граница поля сохранена');
  assert.deepEqual(gardenPlan(), plan, 'раскладка одинакова при начальной загрузке');
});
