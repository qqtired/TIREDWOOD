// Вывески «Сезон рыбалки» (client/lobby/seasonsign.ts): что написано в каждой фазе и где стоят доски.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BARKAS, BARKAS_HOUSE } from '../shared/barkas.ts';
import { FISH_HOUSE } from '../shared/fishplaces.ts';
import { SEASON_SIGN_PERK, SEASON_SIGN_SPOTS, SEASON_SOON_MS, seasonSignView } from '../client/lobby/seasonsign.ts';

test('season sign: countdown, "soon" for the last 5 minutes, live season with time left', () => {
  assert.deepEqual(seasonSignView(null), { phase: 'none', title: 'СЕЗОН РЫБАЛКИ', big: 'скоро', sub: 'Все шансы ×2 · 10 минут' });
  const wait = seasonSignView({ on: false, left: (72 * 60 + 30) * 1000 });
  assert.equal(wait.phase, 'wait');
  assert.equal(wait.title, 'СЕЗОН РЫБАЛКИ ЧЕРЕЗ');
  assert.equal(wait.big, '1:12:30');
  assert.equal(wait.sub, `${SEASON_SIGN_PERK} · 10 минут`);
  assert.equal(seasonSignView({ on: false, left: SEASON_SOON_MS + 1000 }).phase, 'wait');
  const soon = seasonSignView({ on: false, left: SEASON_SOON_MS });
  assert.equal(soon.phase, 'soon');
  assert.equal(soon.big, '5:00');
  assert.match(soon.title, /СКОРО/);
  const on = seasonSignView({ on: true, left: (7 * 60 + 42) * 1000 });
  assert.equal(on.phase, 'on');
  assert.equal(on.title, 'СЕЗОН РЫБАЛКИ!');
  assert.equal(on.big, 'Все шансы ×2');
  assert.match(on.sub, /^ещё 7:42/);
});

test('season signs stand on the roofs and follow the shared house and barkas constants', () => {
  const h = SEASON_SIGN_SPOTS.house;
  // на коньке дома Семёна, по его середине, лицом на север; доска не шире крыши со свесами
  assert.equal(h.z, (FISH_HOUSE.z0 + FISH_HOUSE.z1) / 2);
  assert.equal(h.x, (FISH_HOUSE.x0 + FISH_HOUSE.x1) / 2);
  assert.ok(h.y > FISH_HOUSE.ridge);
  assert.equal(h.yaw, Math.PI);
  assert.ok(h.w / 2 + 0.3 < (FISH_HOUSE.x1 - FISH_HOUSE.x0) / 2 + 0.3);
  const b = SEASON_SIGN_SPOTS.barkas;
  // на крыше рубки у кормовой кромки (крыша — со свесом 0,3 м), по оси баркаса, лицом на корму
  assert.equal(b.z, BARKAS.z);
  assert.ok(b.y > BARKAS_HOUSE.h);
  assert.equal(b.yaw, Math.PI / 2);
  const posts = b.x - 0.145;
  assert.ok(posts > BARKAS_HOUSE.x1 - 0.3 && posts < BARKAS_HOUSE.x1 + 0.3, 'столбы — на крыше рубки');
  assert.ok(b.w / 2 + 0.25 <= (BARKAS_HOUSE.z1 - BARKAS_HOUSE.z0) / 2 + 0.3, 'доска с козырьком не шире крыши рубки');
  assert.ok(BARKAS_HOUSE.x1 > BARKAS.bow && BARKAS_HOUSE.x1 < BARKAS.stern);
});
