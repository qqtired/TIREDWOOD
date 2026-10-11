// Новая набережная (флаг PLAZA3, docs/plaza3/tech-foundation.md §1.5, §1.9): данные layout.json проходят проверку и
// свежо перенесены в код; номера и смысл точек 0–112 те же, что у старой площади (новые — только №113+ «arcade»);
// точки стоят на опоре и не в стене; новое твёрдое ни с чем не пересекается и не залезает в круги сбора; от центра
// до входов ≤ 50 м (игровой квартал и ферма — ≤ 57 м, maxFromCenter). Пока раскладка была скелетом WP0, plaza3 побитно
// совпадала со старой площадью; с блокаутом WP2 (skeleton: false) — своя суша, павильоны-коробки и новые места входов.
// Раскладка выбирается при импорте (shared/layout.ts): сначала PLAZA3=1, потом — только динамический import().
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LEGACY_LOBBY_SHA, circleProblems, interactKinds, overlapProblems, sha, spotProblems } from './lobbycheck.ts';

process.env.PLAZA3 = '1';
const { LAYOUT } = await import('../shared/layout.ts');
const { buildLobby } = await import('../shared/maps/lobby.ts');
const { P3 } = await import('../shared/plaza3/layout.ts');
const { xfBox2, xfP, xfSpot } = await import('../shared/plaza3/xf.ts');
const { CollisionWorld } = await import('../shared/world.ts');
const { BARKAS_BAK_Y } = await import('../shared/barkas.ts');
const { PARK_DECK_Y } = await import('../shared/ownboat.ts');
const { inIsleWaters } = await import('../shared/maps/isle.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const map = buildLobby();
const solid = map.plaza3Boxes ?? [];

test('plaza3: раскладка 3, сервер говорит её в /health и в me', async () => {
  assert.equal(LAYOUT, 3);
  const { setupHub, login, lastOf } = await import('./kit.ts');
  const { hub } = setupHub();
  assert.equal(hub.health().plaza, 3);
  const { s } = login(hub, 'Tester7');
  assert.equal(lastOf(s, 'me')!.lay, 3);
});

test('plaza3: layout.json проходит check.mjs, shared/plaza3/layout.ts сгенерирован из него', () => {
  for (const script of ['docs/plaza3/level/check.mjs', 'tools/plaza3/layout.mjs']) {
    execFileSync(process.execPath, [script, '--check'], { cwd: root, stdio: 'pipe' });
  }
});

test('plaza3: точки 0–112 и аркады с №113 сохраняются, два места бельведера добавлены только в конец', () => {
  const want = JSON.parse(readFileSync(new URL('./fixtures/lobby-interact-kinds.json', import.meta.url), 'utf8')) as Array<[string, number]>;
  const got = interactKinds(map);
  assert.deepEqual(got.slice(0, want.length), want);
  assert.deepEqual(got.slice(want.length), [...P3.arcade.map((_a, i) => ['arcade', i]), ['seat', 24], ['seat', 25]]);
  map.interact.forEach((it, i) => assert.equal(it.id, i));
});

test('plaza3: точки и места появления на опоре и не в стене', () => {
  const world = new CollisionWorld(map);
  assert.deepEqual(spotProblems(map, world, { bakY: BARKAS_BAK_Y, parkDeckY: PARK_DECK_Y, inIsle: inIsleWaters }), []);
});

/** Предел «от центра до входа» для точки: квартал-исключение из maxFromCenter (games, farm) или default */
function limitAt(x: number, z: number): number {
  const lim = P3.maxFromCenter as unknown as Record<string, number>;
  for (const q of P3.quarters) if (q.poly && lim[q.id] && inPoly(x, z, q.poly)) return lim[q.id];
  return lim.default;
}

function inPoly(x: number, z: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

test('plaza3: новое твёрдое не пересекается и не залезает в круги сбора, входы ≤ 50 м от центра (57 — игры и ферма)', () => {
  assert.deepEqual(overlapProblems(map, solid), []);
  const circles = map.interact.filter((it) => ['pb_gate', 'garage', 'skill', 'boatrace', 'hide'].includes(it.kind)).map((it) => ({ x: it.x, z: it.z, r: it.r, name: it.kind }));
  assert.equal(circles.length, 5);
  assert.deepEqual(circleProblems(map, solid, circles), []);
  // входы режимов (Семён — пока на голове пирса, его дом переезжает на берег в WP4: тогда добавить 'fisher' arg 0)
  const ENTRY = new Set(['slot', 'pb_gate', 'garage', 'kiosk', 'honor', 'kboard', 'boat', 'wheel', 'fort', 'skill', 'boatrace', 'hide', 'ratrace', 'billiards', 'plane', 'dungeon', 'farm', 'arcade']);
  for (const it of map.interact) {
    if (!ENTRY.has(it.kind) && !(it.kind === 'juke' && it.arg === 0)) continue;
    const d = Math.hypot(it.x - P3.center.x, it.z - P3.center.z);
    const lim = limitAt(it.x, it.z);
    assert.ok(d <= lim, `вход ${it.kind} (${it.x}; ${it.z}) — ${d.toFixed(1)} м от центра, предел ${lim}`);
  }
});

test('plaza3: перенос группы — тот же объект без сдвига, четверть оборота — точно', () => {
  const p = { x: 3, z: -2, yaw: 0.5, r: 1 };
  assert.equal(xfP(null, p), p);
  assert.equal(xfSpot({ dx: 0, dz: 0, rot: 0 }, p), p);
  // rotation.y на 90° вокруг (1; 1): (u, v) = (2; −3) → (−3; −2), затем сдвиг (10; 20)
  assert.deepEqual(xfSpot({ dx: 10, dz: 20, rot: 1, cx: 1, cz: 1 }, p), { x: 8, z: 19, yaw: 0.5 + Math.PI / 2, r: 1 });
  assert.deepEqual(xfBox2({ dx: 0, dz: 0, rot: 2 }, { x0: 1, z0: 2, x1: 3, z1: 5 }), { x0: -3, z0: -5, x1: -1, z1: -2 });
});

test('plaza3: пока раскладка — скелет WP0, карта побитно та же, что без флага', { skip: !P3.skeleton && 'левел-дизайн начат (skeleton: false)' }, () => {
  const { plaza3Boxes, ...rest } = map;
  assert.deepEqual(plaza3Boxes, []);
  assert.equal(sha(rest), LEGACY_LOBBY_SHA);
});
