// Остров «Последний свет» (флаг ISLE): расписание «Туман наступает» и сезона острова, точки карты (берты, мол, Игнат,
// высадка), по острову можно дойти от причала до Игната, на мол и по лестнице к маяку; туман по дальности без скачков.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_HALF, PLAYER_HEIGHT, TICK_RATE, WATER_Y } from '../shared/constants.ts';
import { FISH_ISLE_FIRST, FISH_NPC_USE, FISH_SPOTS, spotZone } from '../shared/fishplaces.ts';
import { ISLE_FOG, ISLE_FOG_EVENT, isleClimate, isleEnabled } from '../shared/isle.ts';
import {
  ISLE_BERTHS, ISLE_BUOYS, ISLE_CENTER, ISLE_FISH_SPOTS, ISLE_IGNAT_USE, ISLE_LANDING_SPOTS, ISLE_LIGHTHOUSE_GROUND, ISLE_ROUTE_BUOYS, ISLE_SPAWN, ISLE_Y,
  inIsleWaters, isleDist,
} from '../shared/maps/isle.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { BTN_FORWARD, makeEvents, makeState, stepPlayer } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';
import { FishSeason, SEASON_MS, seasonAt } from '../server/lobby/fishseason.ts';
import { IsleState, isleHome, isleLanding, nearIgnat, ownsBoat } from '../server/lobby/isle.ts';
import { ISLE_SEASON_SHIFT_MS } from '../shared/isle.ts';

const map = buildLobby();
const world = new CollisionWorld(map);
const H = 3600_000;
/** Час по Москве в момент ms */
const mskHour = (ms: number) => new Date(ms + 3 * H).getUTCHours();

test('флаг ISLE: только вместе с FISH2; без переменной — только в разработке', () => {
  assert.equal(isleEnabled('1', false, true), true);
  assert.equal(isleEnabled('1', true, false), false);
  assert.equal(isleEnabled(undefined, true, true), true);
  assert.equal(isleEnabled(undefined, false, true), false);
  assert.equal(isleEnabled('0', true, true), false);
});

test('сезон острова — в нечётные часы по Москве на 10 минут, сезон набережной — в чётные: не совпадают', () => {
  const day = Date.UTC(2026, 9, 10);
  const starts: number[] = [];
  for (let t = day; t < day + 24 * H; t += 60_000) {
    const s = seasonAt(t, ISLE_SEASON_SHIFT_MS);
    if (s.on && !seasonAt(t - 60_000, ISLE_SEASON_SHIFT_MS).on) starts.push(t);
    assert.ok(!(s.on && seasonAt(t).on), 'сезоны острова и набережной не идут вместе');
  }
  assert.equal(starts.length, 12);
  for (const t of starts) {
    assert.equal(mskHour(t) % 2, 1, `нечётный час: ${mskHour(t)}`);
    assert.equal(new Date(t).getUTCMinutes(), 0);
    assert.equal(seasonAt(t, ISLE_SEASON_SHIFT_MS).endsAt - t, SEASON_MS);
  }
  // 17:00 по Москве — сезон острова
  assert.equal(seasonAt(Date.UTC(2026, 9, 10, 14, 5), ISLE_SEASON_SHIFT_MS).on, true);
  assert.equal(seasonAt(Date.UTC(2026, 9, 10, 14, 5)).on, false);
  assert.equal(new FishSeason(() => Date.UTC(2026, 9, 10, 14, 5), ISLE_SEASON_SHIFT_MS).on, true);
});

test('«Туман наступает»: ясно 15–30 мин, туман 4:48–8:00, тост только не сезоном; сезон держит туман до конца', () => {
  // вне сезона: 12:20 по Москве (чётный час — сезон острова не идёт)
  let now = Date.UTC(2026, 9, 10, 9, 20);
  const isle = new IsleState(() => now, () => 0.5);
  assert.equal(isle.fogOn, false);
  assert.equal(isle.step().changed, false);
  let ticks = 0;
  let r = isle.step();
  while (!r.changed && ticks < 40 * 60 * TICK_RATE) {
    ticks++;
    now += 1000 / TICK_RATE;
    r = isle.step();
  }
  assert.ok(ticks >= 15 * 60 * TICK_RATE && ticks <= 30 * 60 * TICK_RATE, `ясно ${ticks / TICK_RATE} с`);
  assert.equal(isle.fogOn, true);
  assert.equal(r.fogStart, true);
  const v = isle.view();
  assert.equal(v.fog, true);
  const len = v.fogUntil - now;
  assert.ok(len >= 288_000 - 50 && len <= 480_000 + 50, `туман ${len} мс`);
  // отладка: туман уже идёт
  assert.equal(isle.forceFog(), false);

  // сезон: 13:00 по Москве — туман сразу, до конца сезона, без тоста тумана (будет строка о сезоне)
  now = Date.UTC(2026, 9, 10, 9, 59, 59);
  const s = new IsleState(() => now, () => 0.5);
  s.step();
  now = Date.UTC(2026, 9, 10, 10, 0, 0);
  const st = s.step();
  assert.equal(st.season, 'start');
  assert.equal(st.fogStart, false);
  assert.equal(s.seasonOn, true);
  assert.equal(s.fogOn, true);
  assert.ok(s.view().fogUntil >= now + SEASON_MS - 1);
  assert.match(s.seasonLine('start'), /Великий туман/);
  now += SEASON_MS + 1000;
  assert.equal(s.step().season, 'end');
  assert.match(s.seasonLine('end'), /15:00/);
});

test('точки острова: в его водах; берты у понтона на воде; места мола — на камне, впереди вода; высадка и Игнат — на настиле', () => {
  assert.ok(isleDist(ISLE_CENTER.x, ISLE_CENTER.z) === 0 && isleDist(0, 0) > 2300, 'остров в 2,4 км от площади');
  assert.ok(!inIsleWaters(0, 0));
  for (const p of [ISLE_SPAWN, ...ISLE_LANDING_SPOTS, ...ISLE_BERTHS, ...ISLE_FISH_SPOTS, ISLE_IGNAT_USE]) assert.ok(inIsleWaters(p.x, p.z));
  assert.equal(ISLE_BERTHS.length, 6);
  assert.deepEqual(ISLE_BERTHS.map((b) => b.n), [1, 2, 3, 4, 5, 6]);
  for (const b of ISLE_BERTHS) {
    // корма у понтона, нос на юг (+Z): под лодкой (2–6 м южнее точки) — вода
    for (const d of [2, 4, 6]) assert.equal(world.groundBelow(b.x, 5, b.z + d), -Infinity, `берт ${b.n}: вода в ${d} м`);
    assert.ok(world.groundBelow(b.x, 5, b.z - 1.5) > WATER_Y, `берт ${b.n}: понтон рядом`);
  }
  // места рыбалки — в самом конце FISH_SPOTS, зона isle
  assert.equal(ISLE_FISH_SPOTS.length, 8);
  assert.equal(FISH_ISLE_FIRST, 30);
  for (let i = 0; i < 8; i++) assert.equal(spotZone(FISH_ISLE_FIRST + i), 'isle');
  const fish = map.interact.filter((it) => it.kind === 'fish' && it.arg >= FISH_ISLE_FIRST);
  assert.equal(fish.length, 8);
  for (const it of fish) {
    const s = FISH_SPOTS[it.arg] as (typeof ISLE_FISH_SPOTS)[number];
    assert.equal(it.y, s.y, 'точка — на высоте камня');
    standsOn(s.x, s.y, s.z, `место ${it.arg}`);
    // поплавок падает в 6,5–9,5 м впереди — там вода
    for (const d of [6.5, 8, 9.5]) {
      const x = s.x - Math.sin(s.yaw) * d, z = s.z - Math.cos(s.yaw) * d;
      assert.equal(world.groundBelow(x, 0, z), -Infinity, `место ${it.arg}: вода в ${d} м`);
    }
  }
  standsOn(ISLE_SPAWN.x, ISLE_SPAWN.y, ISLE_SPAWN.z, 'высадка');
  for (const [i, p] of ISLE_LANDING_SPOTS.entries()) standsOn(p.x, p.y, p.z, `выныривание ${i}`);
  // Игнат: окно — fisher arg 2, стоять на настиле у крыльца
  const ig = map.interact.find((it) => it.kind === 'fisher' && it.arg === 2)!;
  assert.ok(ig && ig.y === ISLE_IGNAT_USE.y && FISH_NPC_USE.ignat === ISLE_IGNAT_USE);
  standsOn(ISLE_IGNAT_USE.x, ISLE_IGNAT_USE.y, ISLE_IGNAT_USE.z, 'у Игната');
  assert.ok(nearIgnat(ISLE_IGNAT_USE) && !nearIgnat(ISLE_SPAWN));
  // буи и вехи: F6 — у острова, F1 — у стоянки, через ~400 м
  assert.equal(ISLE_BUOYS.length, 12);
  assert.equal(ISLE_ROUTE_BUOYS.length, 6);
  for (let i = 1; i < 6; i++) {
    const a = ISLE_ROUTE_BUOYS[i - 1], b = ISLE_ROUTE_BUOYS[i];
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 400) < 2);
  }
  // в водах острова — выныриваешь на причале; вне — нет
  assert.deepEqual(isleLanding(ISLE_CENTER.x + 200, ISLE_CENTER.z, 7), ISLE_LANDING_SPOTS[1]);
  assert.equal(isleLanding(0, 40, 0), null);
});

/** Стоит ровно на опоре высоты y и не упирается в твёрдое */
function standsOn(x: number, y: number, z: number, why: string): void {
  assert.ok(Math.abs(world.groundBelow(x, y + 0.3, z) - y) < 1e-6, `${why}: под ногами ${world.groundBelow(x, y + 0.3, z)}, а точка на ${y}`);
  assert.ok(!world.overlaps(x - PLAYER_HALF, y + 0.002, z - PLAYER_HALF, x + PLAYER_HALF, y + PLAYER_HEIGHT, z + PLAYER_HALF), `${why}: свободно`);
}

/** Идти по точкам острова (u, v); не падать в воду. Возвращает, где оказался. */
function walk(from: { x: number; y: number; z: number }, path: ReadonlyArray<readonly [number, number]>): { x: number; y: number; z: number } {
  const p = makeState(), ev = makeEvents();
  Object.assign(p, { x: from.x, y: from.y, z: from.z, grounded: 1 });
  let seq = 0;
  for (const [u, v] of path) {
    const tx = ISLE_CENTER.x + u, tz = ISLE_CENTER.z + v;
    let ok = false;
    for (let i = 0; i < 30 * TICK_RATE; i++) {
      const dx = tx - p.x, dz = tz - p.z;
      if (Math.hypot(dx, dz) < 0.35) { ok = true; break; }
      stepPlayer(p, { seq: ++seq, buttons: BTN_FORWARD, yaw: Math.atan2(-dx, -dz), pitch: 0, viewTick: 0 }, world, false, 1, ev);
      assert.ok(p.y > ISLE_Y - 0.2, `упал в воду у (${(p.x - ISLE_CENTER.x).toFixed(1)}, ${(p.z - ISLE_CENTER.z).toFixed(1)}) по пути к (${u}, ${v})`);
    }
    assert.ok(ok, `не дошёл до (${u}, ${v}): стоит у (${(p.x - ISLE_CENTER.x).toFixed(1)}, ${(p.y - ISLE_Y).toFixed(2)}, ${(p.z - ISLE_CENTER.z).toFixed(1)})`);
  }
  return { x: p.x, y: p.y, z: p.z };
}

test('по острову ходят: от причала к Игнату, на мол к местам рыбалки, по лестнице к маяку (+16 м), на понтон к бертам', () => {
  const ignat = walk(ISLE_SPAWN, [[57, -12], [56.4, -16.4]]);
  assert.ok(nearIgnat(ignat), 'дошёл до Игната');
  const mole = walk(ISLE_SPAWN, [[54, -8], [48, -2], [47, 20], [47, 35], [53, 35], [58.76, 35.51], [80, 32], [113.98, 23.98]]);
  assert.ok(Math.abs(mole.y - (ISLE_Y + 2.28)) < 0.01, 'на камне мола');
  const top = walk(ISLE_SPAWN, [
    [57, -12], [56.5, -20], [56.5, -22.5], [57.5, -25.5], [58.5, -27.5], [59.5, -29.5], [60.5, -32], [61.5, -34.5], [62.5, -36.5], [63.5, -39], [64.5, -41.5],
    [65.5, -43.5], [66.5, -46], [67.5, -48.5], [68.5, -50.5], [70, -54],
  ]);
  assert.ok(Math.abs(top.y - (ISLE_Y + ISLE_LIGHTHOUSE_GROUND)) < 0.01, `у маяка на ${top.y - ISLE_Y}`);
  const pontoon = walk(ISLE_SPAWN, [[62, -8], [70, -8], [80, -8.2], [93, -8.2]]);
  assert.ok(Math.abs(pontoon.y - (ISLE_Y + 0.4)) < 0.01, 'на понтоне');
});

test('«На большую землю»: у Игната, без своей лодки, за 250 🪙', () => {
  let tokens = 300, moved = 0;
  const host = (boat: boolean) => ({ hasBoat: () => boat, spend: (n: number) => (tokens >= n ? ((tokens -= n), true) : false), move: () => { moved++; } });
  assert.equal(isleHome(ISLE_SPAWN, host(false)), 'far');
  assert.equal(isleHome(ISLE_IGNAT_USE, host(true)), 'boat');
  assert.equal(isleHome(ISLE_IGNAT_USE, host(false)), 'ok');
  assert.equal(tokens, 50);
  assert.equal(isleHome(ISLE_IGNAT_USE, host(false)), 'poor');
  assert.equal(moved, 1);
  assert.equal(ownsBoat({}), false);
  assert.equal(ownsBoat({ boats: ['volzhanka'] }), true);
});

test('туман по дальности: на площади — как было, в водах острова — 160 м (в событие 85 м), по пути без скачков', () => {
  const at = (d: number, ev = 0) => {
    // камера на прямой от площади к острову
    const k = d / isleDist(0, 0);
    const x = ISLE_CENTER.x * (1 - k), z = ISLE_CENTER.z * (1 - k);
    return isleClimate(Math.hypot(x, z), isleDist(x, z), ev);
  };
  const bay = isleClimate(30, 2400, 0);
  assert.equal(bay.far, Infinity);
  assert.equal(bay.sun, 1);
  assert.equal(bay.tint, 0);
  const inside = isleClimate(2400, 100, 0);
  assert.equal(inside.far, ISLE_FOG.far);
  assert.equal(inside.near, ISLE_FOG.near);
  assert.equal(isleClimate(2400, 100, 1).far, ISLE_FOG_EVENT.far);
  let prev = Infinity;
  for (let d = 2420; d >= 0; d -= 2) {
    const far = at(d, 0).far;
    if (Number.isFinite(prev) && Number.isFinite(far)) assert.ok(Math.abs(far - prev) < 12, `скачок тумана у ${d} м: ${prev} → ${far}`);
    prev = far;
  }
});

test('отладка: /isle fog — туман сразу (view.fog), /isle season — сезон сразу и держит туман', () => {
  let now = Date.UTC(2026, 9, 10, 9, 20);
  const isle = new IsleState(() => now, () => 0.5);
  isle.step();
  assert.equal(isle.forceFog(), true);
  assert.equal(isle.view().fog, true);
  assert.ok(isle.view().fogUntil > now);
  const s = new IsleState(() => now, () => 0.5);
  s.step();
  assert.equal(s.forceSeason(), true);
  const r = s.step();
  assert.equal(r.season, 'start');
  assert.equal(r.changed, true);
  assert.equal(s.view().fog, true);
  now += 1;
});
