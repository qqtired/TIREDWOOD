// Телефон: джойстик — восемь сторон с мёртвой зоной; руль в гонке — без мёртвых мест и без дребезга у шва;
// поле зрения на узком экране шире, но не больше 95°.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { narrowFov } from '../client/render/renderer.ts';
import { steerKey, stickKeys, type SteerKey } from '../client/touch.ts';

/** Отклонение на r px под углом deg от «вперёд» по часовой стрелке (экранная y — вниз) */
function at(deg: number, r = 50): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [Math.sin(a) * r, -Math.cos(a) * r];
}

test('джойстик: у центра — ничего, по осям — одна клавиша, наискосок — две', () => {
  assert.deepEqual(stickKeys(0, 0), []);
  assert.deepEqual(stickKeys(...at(45, 12)), [], 'мёртвая зона — 30 % хода');
  assert.deepEqual(stickKeys(...at(0)), ['KeyW']);
  assert.deepEqual(stickKeys(...at(90)), ['KeyD']);
  assert.deepEqual(stickKeys(...at(180)), ['KeyS']);
  assert.deepEqual(stickKeys(...at(270)), ['KeyA']);
  assert.deepEqual(stickKeys(...at(45)), ['KeyW', 'KeyD']);
  assert.deepEqual(stickKeys(...at(135)), ['KeyS', 'KeyD']);
  assert.deepEqual(stickKeys(...at(225)), ['KeyS', 'KeyA']);
  assert.deepEqual(stickKeys(...at(315)), ['KeyW', 'KeyA']);
});

test('джойстик: сектор оси — ±22,5°, дальше уже наискосок', () => {
  assert.deepEqual(stickKeys(...at(20)), ['KeyW'], 'чуть правее «вперёд» — всё ещё прямо');
  assert.deepEqual(stickKeys(...at(25)), ['KeyW', 'KeyD']);
  assert.deepEqual(stickKeys(...at(-20)), ['KeyW']);
  assert.deepEqual(stickKeys(...at(70)), ['KeyD'], 'почти вправо — только вправо');
  assert.deepEqual(stickKeys(...at(60, 200)), ['KeyW', 'KeyD'], 'дальше края хода — то же направление');
});

test('руль: коснулся — сторона по шву, мимо не бывает (и у самого шва, и далеко от него)', () => {
  assert.equal(steerKey(129, 130, null), 'ArrowLeft');
  assert.equal(steerKey(130, 130, null), 'ArrowRight');
  assert.equal(steerKey(0, 130, null), 'ArrowLeft', 'у края экрана — тоже влево');
  assert.equal(steerKey(400, 130, null), 'ArrowRight');
});

test('руль: ведёшь палец, не отрывая, — перекладывается за швом, у шва не дребезжит', () => {
  let k: SteerKey = steerKey(60, 130, null);
  const path = [100, 125, 135, 139, 141, 160, 135, 125, 121, 119, 60];
  const seen: SteerKey[] = [];
  for (const x of path) {
    k = steerKey(x, 130, k);
    seen.push(k);
  }
  const L = 'ArrowLeft';
  const R = 'ArrowRight';
  // вправо — только дальше шва на 10 px (141), обратно — только левее шва на 10 px (119)
  assert.deepEqual(seen, [L, L, L, L, R, R, R, R, R, L, L]);
});

test('поле зрения: широкий экран — как в настройках, стоя — шире, но не больше 95°', () => {
  assert.equal(narrowFov(70, 16 / 9), 70);
  assert.equal(narrowFov(70, 4 / 3), 70);
  const phone = narrowFov(70, 375 / 812);
  assert.ok(phone > 85 && phone <= 95, `телефон стоя: ${phone.toFixed(1)}°`);
  assert.ok(narrowFov(70, 0.6) < phone, 'чем уже экран, тем шире обзор');
  assert.equal(narrowFov(95, 0.3), 95, 'потолок — 95°');
});
