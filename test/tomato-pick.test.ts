import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TOMATO_REACH_PX, TOMATO_REACH_TOUCH_PX, distanceTo, pickTomatoTarget, targetable, tomatoRadius, type PickPoint,
} from '../client/lobby/tomatopick.ts';

/** Сидящий на экране с радиусом, как в игре: основа, тело на экране, расстояние */
const at = (ch: number, x: number, y: number, body = 60, dist = 2.5, base = TOMATO_REACH_PX): PickPoint => ({ ch, x, y, r: tomatoRadius(base, body, dist) });

test('клик у края тела и около головы попадает: раньше нужно было целиться почти в центр', () => {
  const pts = [at(1, 640, 300)];
  assert.equal(pickTomatoTarget(pts, 640 + 100, 300), 1, 'у края силуэта');
  assert.equal(pickTomatoTarget(pts, 640, 300 - 95), 1, 'над макушкой');
  assert.equal(pickTomatoTarget(pts, 640 + 80, 300 - 70), 1, 'наискосок, около головы');
});

test('желейка — отрезок от таза до макушки: клик по макушке и над головой попадает, хотя от середины корпуса далеко', () => {
  const body: PickPoint = { ch: 1, x: 640, y: 330, x2: 640, y2: 110, r: tomatoRadius(TOMATO_REACH_PX, 60, 2.5) };
  const circle: PickPoint = { ch: 1, x: 640, y: 220, r: body.r };
  assert.equal(pickTomatoTarget([circle], 654, 80), -1, 'одним кругом вокруг середины макушка была бы мимо');
  assert.equal(pickTomatoTarget([body], 654, 80), 1, 'над макушкой');
  assert.equal(pickTomatoTarget([body], 640 + 90, 110), 1, 'сбоку от головы');
  assert.equal(pickTomatoTarget([body], 640, 330 + 100), 1, 'под тазом, у сиденья');
  assert.equal(pickTomatoTarget([body], 640 + 200, 220), -1, 'далеко в стороне — мимо');
  assert.equal(distanceTo(body, 700, 500), Math.hypot(60, 170), 'за концом отрезка — расстояние до конца');
  assert.equal(distanceTo({ ch: 0, x: 5, y: 5, r: 1 }, 8, 9), 5, 'без второго конца — до точки');
});

test('за кругом ничего: вне радиуса — никого', () => {
  const pts = [at(1, 640, 300)];
  assert.equal(pickTomatoTarget(pts, 640 + 260, 300), -1);
  assert.equal(pickTomatoTarget(pts, 640, 300 + 400), -1);
  assert.equal(pickTomatoTarget([], 10, 10), -1);
});

test('двое рядом: выбирается ближайший к точке клика', () => {
  const pts = [at(1, 600, 300), at(3, 720, 300)];
  assert.equal(pickTomatoTarget(pts, 650, 300), 1, 'ближе к левому');
  assert.equal(pickTomatoTarget(pts, 690, 300), 3, 'ближе к правому');
  assert.equal(pickTomatoTarget(pts, 655, 300), 1, 'у середины — тот, что чуть ближе (55 px против 65)');
});

test('ближний сосед с огромным силуэтом: клик по его краю его и выбирает, а не далёкий', () => {
  const neighbour = at(1, 200, 420, 190, 1.0); // силуэт ~190 px
  const farOne = at(4, 400, 260, 40, 3.5);
  const pts = [neighbour, farOne];
  assert.ok(neighbour.r > 200, 'радиус ближнего растёт с размером на экране');
  assert.equal(pickTomatoTarget(pts, 200 + 200, 420), 1, 'на краю силуэта соседа');
  assert.equal(pickTomatoTarget(pts, 400, 250), 4, 'у далёкого — далёкий');
});

test('себя не выбирает, даже если круг накрыл клик', () => {
  const pts = [at(0, 640, 650), at(2, 900, 300)];
  assert.equal(pickTomatoTarget(pts, 640, 650, 0), -1);
  assert.equal(pickTomatoTarget(pts, 640, 650, -1), 0, 'без указания «я» это был бы стул 0');
  assert.equal(pickTomatoTarget(pts, 900, 300, 0), 2);
});

test('кого можно: чужие игроки и боты — да; я, пустое место, ушедший — нет', () => {
  assert.equal(targetable({ k: 1, id: 7 }, 2, 0), true, 'чужой игрок');
  assert.equal(targetable({ k: 2, id: 0 }, 2, 0), true, 'бот');
  assert.equal(targetable({ k: 1, id: 7 }, 0, 0), false, 'я сам');
  assert.equal(targetable({ k: 0, id: 0 }, 3, 0), false, 'пустое место');
  assert.equal(targetable({ k: 1, id: 0 }, 3, 0), false, 'игрок ушёл, остался автопилот');
  assert.equal(targetable(undefined, 3, 0), false);
});

test('радиус: на телефоне шире, далёкому чуть больше, ближний — по размеру на экране', () => {
  assert.ok(TOMATO_REACH_TOUCH_PX > TOMATO_REACH_PX);
  assert.equal(tomatoRadius(TOMATO_REACH_PX, 10, 1), TOMATO_REACH_PX);
  assert.ok(tomatoRadius(TOMATO_REACH_PX, 10, 5) > tomatoRadius(TOMATO_REACH_PX, 10, 2));
  assert.ok(tomatoRadius(TOMATO_REACH_PX, 10, 50) <= TOMATO_REACH_PX * 1.15 + 1e-9, 'надбавка за даль ограничена');
  assert.ok(tomatoRadius(TOMATO_REACH_PX, 200, 1) >= 200, 'не меньше силуэта');
  const touch = [at(1, 640, 300, 60, 2.5, TOMATO_REACH_TOUCH_PX)];
  const mouse = [at(1, 640, 300, 60, 2.5, TOMATO_REACH_PX)];
  assert.equal(pickTomatoTarget(touch, 640 + 135, 300), 1, 'пальцем промах на 135 px ещё попадает');
  assert.equal(pickTomatoTarget(mouse, 640 + 135, 300), -1, 'мышью уже мимо');
});
