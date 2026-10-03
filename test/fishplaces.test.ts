// Физическая приёмка 12 мест: старые IDs, опора всей капсулы, свободный проход и заброс в воду.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_HALF, PLAYER_HEIGHT } from '../shared/constants.ts';
import { FISH_BOARD, FISH_DECKS, FISHER_NPC, FISHER_USE, FISH_PODIUM_STEP_BOXES, FISHER_CANOPY_BOXES } from '../shared/fishplaces.ts';
import { FISH_SPOTS, PHOTO, buildLobby } from '../shared/maps/lobby.ts';
import { CollisionWorld } from '../shared/world.ts';
import { FISH_APPROACH_ROUTES } from './fishpaths.ts';

const OLD_SPOTS = [25, 28.5, 32].flatMap((z) => [
  { x: -20.45, z, yaw: Math.PI / 2 }, { x: -17.55, z, yaw: -Math.PI / 2 },
]);
const OLD_INTERACT = [
  ...Array.from({ length: 5 }, (_, i) => `slot:${i}`), 'pb_gate:0', 'garage:0', 'kiosk:0', 'honor:0',
  ...Array.from({ length: 18 }, (_, i) => `${i < 12 ? 'durak' : 'blackjack'}:${i}`), ...Array.from({ length: 6 }, (_, i) => `seat:${18 + i}`),
  'kboard:0', 'photo:0', ...Array.from({ length: 6 }, (_, i) => `fish:${i}`), 'recent:0', 'boat:0', 'wheel:0', 'fort:0', 'fight:0',
];
const NEW_SPOTS = [
  { x: -20.45, z: 35.5, yaw: Math.PI / 2 }, { x: -17.55, z: 35.5, yaw: -Math.PI / 2 },
  { x: -23.45, z: 41, yaw: Math.PI / 2 }, { x: -14.55, z: 42.5, yaw: -Math.PI / 2 },
  { x: -21.65, z: 45.45, yaw: Math.PI }, { x: -16.35, z: 45.45, yaw: Math.PI },
];
type Point = readonly [number, number];

function supportedAndClear(w: CollisionWorld, x: number, z: number, why: string): void {
  for (const dx of [-PLAYER_HALF, PLAYER_HALF]) for (const dz of [-PLAYER_HALF, PLAYER_HALF]) {
    assert.equal(w.groundBelow(x + dx, 0, z + dz), 0, `${why}: край ступней над настилом (${x + dx},${z + dz})`);
  }
  assert.ok(!w.overlaps(x - PLAYER_HALF, 0.002, z - PLAYER_HALF, x + PLAYER_HALF, PLAYER_HEIGHT, z + PLAYER_HALF), `${why}: капсула вне твёрдых предметов`);
}

test('мест ровно 12: 8 на пирсе и 4 у маяка; прежние 6 позиций и все 46 interaction IDs сохранены', () => {
  const map = buildLobby();
  assert.equal(FISH_SPOTS.length, 12);
  assert.deepEqual(FISH_SPOTS.slice(0, 6), OLD_SPOTS);
  assert.deepEqual(FISH_SPOTS.slice(6), NEW_SPOTS);
  assert.equal(FISH_SPOTS.filter((s) => s.z < 38).length, 8);
  assert.equal(FISH_SPOTS.filter((s) => s.z >= 38).length, 4);
  assert.deepEqual(map.interact.slice(0, 46).map((i) => `${i.kind}:${i.arg}`), OLD_INTERACT);
  assert.ok(map.interact.every((i, n) => i.id === n));
  assert.deepEqual(map.interact.filter((i) => i.kind === 'fish').map((i) => i.id), [35, 36, 37, 38, 39, 40, 46, 47, 48, 49, 50, 51]);
  assert.equal(map.interact.find(i => i.kind === 'fisher')?.id, 52);
  assert.equal(map.fishPropsBoxes.length, 5 + FISH_PODIUM_STEP_BOXES.length + FISHER_CANOPY_BOXES.length, 'NPC, доска, основание/пять ступеней, опоры навеса и доски зависят от FISH2');
  assert.equal(new Set(map.fishPropsBoxes).size, map.fishPropsBoxes.length);
  assert.ok(map.fishPropsBoxes.every((i) => map.boxes[i].mat === 'invisible' && map.boxes[i].min[1] >= 0), 'полы/швартовные тумбы не отключаются с FISH2');
});

test('все места полностью стоят на полу, не пересекают AABB, разнесены; забросы направлены в воду', () => {
  const w = new CollisionWorld(buildLobby());
  for (const [n, s] of [...OLD_SPOTS, ...NEW_SPOTS].entries()) {
    supportedAndClear(w, s.x, s.z, `место ${n}`);
    for (const other of [...OLD_SPOTS, ...NEW_SPOTS].slice(n + 1)) {
      assert.ok(Math.hypot(s.x - other.x, s.z - other.z) > 2 * PLAYER_HALF + 0.5, `место ${n}: чужой рыбак не перекрывает выход`);
    }
    const dx = -Math.sin(s.yaw), dz = -Math.cos(s.yaw);
    assert.equal(w.groundBelow(s.x + dx * 6, 0, s.z + dz * 6), -Infinity, `место ${n}: поплавок в море`);
  }
});

test('каждое новое место достижимо от входа на пирс и обратно без прыжка, воды и столкновений', () => {
  const w = new CollisionWorld(buildLobby());
  for (const [n, route] of FISH_APPROACH_ROUTES.slice(6).entries()) {
    for (let k = 1; k < route.length; k++) {
      const a = route[k - 1], b = route[k];
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1);
      for (let t = 0; t <= steps; t++) {
        const f = t / steps;
        supportedAndClear(w, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, `маршрут нового места ${n + 6}, отрезок ${k}`);
      }
    }
  }
});

test('новые места не перекрывают фото, декорации рыбаков, снасти, кнехты и прочие старые interactions', () => {
  const map = buildLobby();
  const props: Point[] = [[-14.6, 40.3], [-14.85, 39.35], [-14.85, 40.72], [-23.4, 43.6], [-23.25, 44.55], [-23.15, 43.15], [PHOTO.x, PHOTO.z]];
  for (const [n, s] of NEW_SPOTS.entries()) {
    for (const p of props) assert.ok(Math.hypot(s.x - p[0], s.z - p[1]) > 1.3, `место ${n + 6}: проход возле старого предмета ${p}`);
    for (const it of map.interact.filter((i) => i.kind !== 'fish' && i.kind !== 'fisher')) {
      assert.ok(Math.hypot(s.x - it.x, s.z - it.z) > 1 + it.r + 0.2, `место ${n + 6}: зона ${it.kind}:${it.arg} отдельно`);
    }
  }
});

test('настил NPC соединён с пирсом и маяком; перед рыбаком есть полный свободный пол, столбы доски совпадают с видимыми', () => {
  const map = buildLobby();
  const w = new CollisionWorld(map);
  assert.deepEqual(FISHER_NPC, { x: -15.5, y: 0, z: 37.72, yaw: 0 }, 'точное прежнее место доски');
  supportedAndClear(w, FISHER_USE.x, FISHER_USE.z, 'посетитель NPC');
  assert.equal(w.groundBelow(FISHER_NPC.x, 0, FISHER_NPC.z), 0);
  for (const [x, z] of [[-17, 36.5], [-16.6, 36.5], [-15.5, 36.5], [-17.25, 38], [-17.25, 38.5]]) supportedAndClear(w, x, z, 'соединение настила NPC');
  const use = map.interact.find((i) => i.kind === 'fisher')!;
  assert.deepEqual([use.x, use.y, use.z, use.yaw, use.r], [FISHER_USE.x, FISHER_USE.y, FISHER_USE.z, FISHER_USE.yaw, FISHER_USE.r]);
  for (const s of FISH_SPOTS) assert.ok(Math.hypot(s.x - use.x, s.z - use.z) > use.r + 0.2, 'центры fishing и NPC use раздельны');
  for (let i = 0; i < FISH_DECKS.length; i++) for (const b of FISH_DECKS.slice(i + 1)) {
    const a = FISH_DECKS[i];
    assert.ok(a.x1 <= b.x0 || a.x0 >= b.x1 || a.z1 <= b.z0 || a.z0 >= b.z1, 'новые настилы не пересекаются объёмами');
  }
  for (const sign of [-1, 1]) {
    const x = FISH_BOARD.x + sign * (FISH_BOARD.w / 2 + 0.09);
    assert.ok(w.overlaps(x - 0.07, 0.01, FISH_BOARD.z - 0.07, x + 0.07, 1.5, FISH_BOARD.z + 0.07), 'видимый столб доски твёрдый');
  }
  supportedAndClear(w, FISH_BOARD.x, FISH_BOARD.z - 1.4, 'северный подход к доске');
  supportedAndClear(w, -11, 15.7, 'северный подход к пьедесталу');
  supportedAndClear(w, -11, 18.7, 'проход между подиумом и скамейками');
  supportedAndClear(w, -19, 20.8, 'центральный вход на мостки');
});
