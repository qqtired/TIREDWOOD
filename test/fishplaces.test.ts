// Физическая приёмка 12 мест: старые IDs, опора всей капсулы, свободный проход и заброс в воду.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_HALF, PLAYER_HEIGHT } from '../shared/constants.ts';
import { FISH_BOARD, FISH_DECKS, FISH_FAR_SPOTS, FISH_HOUSE, FISH_HOUSE_BOXES, FISHER_BODY, FISHER_NPC, FISHER_USE, FISH_PODIUM_STEP_BOXES, FISHER_CANOPY_BOXES } from '../shared/fishplaces.ts';
import { FERRY_BACK_LEN, FERRY_OUT_LEN } from '../shared/ferry.ts';
import { FISH_SPOTS, PHOTO, buildLobby } from '../shared/maps/lobby.ts';
import { CollisionWorld } from '../shared/world.ts';
import { FISH_APPROACH_ROUTES, FISH_FAR_ROUTES, FISHER_ROUTE } from './fishpaths.ts';

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

test('у пристани 20 мест: 8 на мостках, 4 у маяка, (8 на баркасе), 8 на дальних мостках и у дома, (ещё 2 на баркасе); прежние позиции и все interaction IDs сохранены, новое — в конце', () => {
  const map = buildLobby();
  const pier = FISH_SPOTS.filter((s) => (s.zone ?? 'pier') === 'pier');
  assert.equal(pier.length, 20);
  // + 8 мест на моле острова «Последний свет» (zone isle, флаг ISLE) — в самом конце
  assert.equal(FISH_SPOTS.length, 38);
  assert.deepEqual(FISH_SPOTS.slice(0, 6), OLD_SPOTS);
  assert.deepEqual(FISH_SPOTS.slice(6, 12), NEW_SPOTS);
  assert.ok(FISH_SPOTS.slice(12, 20).every((s) => s.zone === 'barkas'), 'места баркаса — сразу после мест у маяка, номера прежние');
  assert.deepEqual(FISH_SPOTS.slice(20, 28), FISH_FAR_SPOTS, 'дальние мостки и дом — после баркаса');
  assert.ok(FISH_SPOTS.slice(28, 30).every((s) => s.zone === 'barkas'), 'ещё два места удлинённого баркаса — после дальних мостков');
  assert.ok(FISH_SPOTS.slice(30).every((s) => s.zone === 'isle'), 'восемь мест на моле острова — в самом конце');
  assert.ok(FISH_FAR_SPOTS.every((s) => (s.zone ?? 'pier') === 'pier'));
  assert.equal(pier.filter((s) => s.z < 38).length, 8);
  assert.equal(pier.filter((s) => s.z >= 38 && s.z < 46).length, 4);
  assert.equal(pier.filter((s) => s.z >= 46).length, 8);
  assert.deepEqual(map.interact.slice(0, 46).map((i) => `${i.kind}:${i.arg}`), OLD_INTERACT);
  assert.deepEqual(map.interact.slice(46, 56).map((i) => `${i.kind}:${i.arg}`),
    [...Array.from({ length: 6 }, (_, i) => `fish:${i + 6}`), 'fisher:0', 'skill:0', 'boatrace:0', 'hide:0'], 'выпуск 6 — те же номера');
  assert.ok(map.interact.every((i, n) => i.id === n));
  assert.deepEqual(map.interact.filter((i) => i.kind === 'fish').map((i) => i.arg), FISH_SPOTS.map((_, i) => i), 'arg места = номер в FISH_SPOTS');
  assert.deepEqual(map.interact.filter((i) => i.kind === 'fish').map((i) => i.id).slice(0, 12), [35, 36, 37, 38, 39, 40, 46, 47, 48, 49, 50, 51]);
  assert.equal(map.interact.find(i => i.kind === 'fisher')?.id, 52);
  // музыкальный автомат уже в main (id 56) — после него, в самом конце: места баркаса, лодка «Удалая», Саня, стол рулетки,
  // крысиные бега (флаг RATRACE), второй автомат (на баке баркаса), места дальних мостков и площадки у дома рыбака, три бильярдных стола, гидроплан и заказ баннера (PLANE)
  assert.deepEqual(map.interact.slice(56).map((i) => `${i.kind}:${i.arg}`),
    ['juke:0', ...FISH_SPOTS.slice(12, 20).map((_, i) => `fish:${i + 12}`), 'ferry:0', 'ferry:1', 'fisher:1', 'roulette:0', 'ratrace:0', 'juke:1',
      ...FISH_FAR_SPOTS.map((_, i) => `fish:${i + 20}`), 'billiards:0', 'billiards:1', 'billiards:2', 'plane:0', 'banner:0', 'fish:28', 'fish:29',
      ...Array.from({ length: 8 }, (_, i) => `fish:${i + 30}`), 'fisher:2']);
  assert.equal(map.fishPropsBoxes.length, 5 + FISH_PODIUM_STEP_BOXES.length + FISHER_CANOPY_BOXES.length, 'NPC, доска, основание/пять ступеней, опоры навеса и доски зависят от FISH2');
  assert.equal(new Set(map.fishPropsBoxes).size, map.fishPropsBoxes.length);
  assert.ok(map.fishPropsBoxes.every((i) => map.boxes[i].mat === 'invisible' && map.boxes[i].min[1] >= 0), 'полы/швартовные тумбы не отключаются с FISH2');
});

test('все места полностью стоят на полу, не пересекают AABB, разнесены; забросы направлены в воду', () => {
  const w = new CollisionWorld(buildLobby());
  const all = [...OLD_SPOTS, ...NEW_SPOTS, ...FISH_FAR_SPOTS];
  for (const [n, s] of all.entries()) {
    supportedAndClear(w, s.x, s.z, `место ${n}`);
    for (const other of all.slice(n + 1)) {
      assert.ok(Math.hypot(s.x - other.x, s.z - other.z) > 2 * PLAYER_HALF + 0.5, `место ${n}: чужой рыбак не перекрывает выход`);
    }
    const dx = -Math.sin(s.yaw), dz = -Math.cos(s.yaw);
    assert.equal(w.groundBelow(s.x + dx * 6, 0, s.z + dz * 6), -Infinity, `место ${n}: поплавок в море`);
  }
});

test('каждое новое место достижимо от входа на пирс и обратно без прыжка, воды и столкновений', () => {
  const w = new CollisionWorld(buildLobby());
  // маршруты к дальним местам кончаются на самих местах
  FISH_FAR_ROUTES.forEach((route, i) => assert.deepEqual(route[route.length - 1], [FISH_FAR_SPOTS[i].x, FISH_FAR_SPOTS[i].z], `маршрут к месту ${i + 20}`));
  for (const [n, route] of [...FISH_APPROACH_ROUTES.slice(6), ...FISH_FAR_ROUTES, FISHER_ROUTE].entries()) {
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
  // рыбаки-декорации с ведром и термосом (client/lobby/folk.ts): один — в юго-восточном углу площадки у дома рыбака
  // (в юго-западном — место рыбалки у причала «Удалой»), второй — у западного края площадки маяка
  const props: Point[] = [[-13.05, 63.3], [-13.7, 62.85], [-23.4, 43.6], [-23.25, 44.55], [-23.15, 43.15], [PHOTO.x, PHOTO.z]];
  for (const [n, s] of [...NEW_SPOTS, ...FISH_FAR_SPOTS].entries()) {
    for (const p of props) assert.ok(Math.hypot(s.x - p[0], s.z - p[1]) > 1.3, `место ${n + 6}: проход возле старого предмета ${p}`);
    for (const it of map.interact.filter((i) => i.kind !== 'fish' && i.kind !== 'fisher')) {
      assert.ok(Math.hypot(s.x - it.x, s.z - it.z) > 1 + it.r + 0.2, `место ${n + 6}: зона ${it.kind}:${it.arg} отдельно`);
    }
  }
});

test('настил у маяка, дальние мостки и площадка с домом соединены; Семён на крыльце, перед ним свободный пол; столбы доски совпадают с видимыми', () => {
  const map = buildLobby();
  const w = new CollisionWorld(map);
  // Семён — на крыльце своего дома, перед дверью дома и в стороне от неё; лицом к мосткам
  assert.equal(FISHER_NPC.yaw, 0);
  assert.ok(FISHER_NPC.z < FISH_HOUSE.z0 && FISHER_NPC.z > FISH_HOUSE.z0 - FISH_HOUSE.porch, 'на крыльце');
  assert.ok(Math.abs(FISHER_NPC.x - FISH_HOUSE.door) > 1.2, 'дверь свободна');
  assert.ok(FISHER_BODY.x0 < FISHER_NPC.x && FISHER_BODY.x1 > FISHER_NPC.x && FISHER_BODY.z0 < FISHER_NPC.z && FISHER_BODY.z1 > FISHER_NPC.z);
  supportedAndClear(w, FISHER_USE.x, FISHER_USE.z, 'посетитель NPC');
  assert.equal(w.groundBelow(FISHER_NPC.x, 0, FISHER_NPC.z), 0);
  // прежний настил у маяка (на нём стоял Семён) остаётся проходом между мостками и площадкой маяка
  for (const [x, z] of [[-17, 36.5], [-16.6, 36.5], [-15.5, 36.5], [-17.25, 38], [-17.25, 38.5]]) supportedAndClear(w, x, z, 'соединение настила у маяка');
  // площадка маяка → дальние мостки → площадка с домом: без щелей
  for (const [x, z] of [[-19, 45.6], [-19, 46], [-19, 46.4], [-19, 53.8], [-19, 54.2], [-19, 55]]) supportedAndClear(w, x, z, 'стык дальних мостков');
  // дом твёрдый, внутрь не пройти; крыша недосягаема прыжком
  const H = FISH_HOUSE_BOXES[0];
  assert.ok(w.overlaps(-19, 0.1, 61.5, -18.9, 1.5, 61.6), 'внутри сруба — стена');
  assert.ok(H.y1 >= 2.5);
  // в воде за пирсом — своя «бухта»: стены не дальше x −31 на западе (вода баркаса — x < −30)
  assert.ok(map.boxes.some((b) => b.mat === 'invisible' && b.min[0] <= -31 && b.max[0] >= -30 && b.min[2] <= 48 && b.max[2] >= 71), 'западная стена бухты');
  // лодка «Удалая» обходит пирс: путь длиннее прежнего, но рейс короче полутора минут
  assert.ok(FERRY_OUT_LEN < 90 && FERRY_BACK_LEN < 95, `${FERRY_OUT_LEN} / ${FERRY_BACK_LEN}`);
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
