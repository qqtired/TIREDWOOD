// «Крепость»: карта (опоры, лестницы, ворота), числа волн и жетонов, хвост снимка.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_HALF, PLAYER_HEIGHT, TICK_RATE } from '../shared/constants.ts';
import { FORT_WAVES, Z_BRUTE, Z_CLIMBER, Z_KINDS, Z_WALKER, ZS_TOP, waveCounts, zombieHp } from '../shared/fort.ts';
import { FT_TOK_MVP, FT_TOK_WIN, killTokens, waveTokens } from '../shared/fortwaves.ts';
import { makeRun, settle } from '../server/fort/ledger.ts';
import { FT_STRIDE, nearestZombie, zombieHead } from '../shared/fortaim.ts';
import { CLIMBS, FORT, GATE, ROADS, TERRACE, WALL_H, buildFort, insideFort, outsideFort } from '../shared/fortmap.ts';
import { decodeFortTail, encodeFortTail, fortTailSize, makeFortTail, type ZombieSnap } from '../shared/fortnet.ts';
import { BTN_FORWARD, makeEvents, makeInput, makeState, type PlayerState } from '../shared/sim.ts';
import { stepPlayer } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';

const map = buildFort();
const world = new CollisionWorld(map);

function freeAt(w: CollisionWorld, x: number, y: number, z: number): boolean {
  return !w.overlaps(x - PLAYER_HALF, y + 0.01, z - PLAYER_HALF, x + PLAYER_HALF, y + PLAYER_HEIGHT, z + PLAYER_HALF);
}

/** Идём по точкам: взгляд на точку, «вперёд», пока не подойдём на 0,3 м */
function walk(w: CollisionWorld, s: PlayerState, pts: ReadonlyArray<readonly [number, number]>): void {
  const inp = makeInput();
  const ev = makeEvents();
  for (const [x, z] of pts) {
    for (let t = 0; t < 20 * TICK_RATE; t++) {
      const dx = x - s.x;
      const dz = z - s.z;
      if (dx * dx + dz * dz < 0.09) break;
      inp.seq++;
      inp.yaw = Math.atan2(-dx, -dz);
      inp.buttons = BTN_FORWARD;
      stepPlayer(s, inp, w, false, 1, ev);
    }
    assert.ok(Math.hypot(x - s.x, z - s.z) < 0.5, `дошли до (${x}, ${z}), а стоим в (${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)})`);
  }
  // постоять: приземлиться
  inp.buttons = 0;
  for (let t = 0; t < 30; t++) stepPlayer(s, inp, w, false, 1, ev);
}

test('точки появления и стойки — на опоре и не в стене', () => {
  assert.equal(map.spawns.length, 6);
  for (const p of [...map.spawns, ...map.stations]) {
    assert.ok(Math.abs(world.groundBelow(p.x, p.y + 0.05, p.z) - p.y) < 1e-6, `опора под (${p.x}, ${p.y}, ${p.z})`);
    assert.ok(freeAt(world, p.x, p.y, p.z), `свободно в (${p.x}, ${p.y}, ${p.z})`);
    assert.ok(insideFort(p.x, p.z) || p.y >= WALL_H - 1e-9, 'стойки и точки появления — в крепости или на стенах');
  }
  for (const s of map.spawns) assert.equal(s.y, TERRACE.h);
  const kinds = map.stations.map((s) => s.kind).sort();
  assert.deepEqual(kinds, ['bell', 'crystal', 'gate', 'jam', 'jam', 'jam', 'shop', 'turret', 'turret']);
});

test('с террасы по лестницам — во двор, на северную стену и на воротную башню', () => {
  const s = makeState();
  const sp = map.spawns[0];
  s.x = sp.x;
  s.y = sp.y;
  s.z = sp.z;
  walk(world, s, [[-7.5, 6], [-7.5, 4.6], [-7.5, 0]]);
  assert.ok(s.y < 0.01, `во дворе: y ${s.y}`);
  walk(world, s, [[-6, -4], [-9, -7.8], [-9, -14.2]]);
  assert.ok(Math.abs(s.y - WALL_H) < 0.01, `на стене: y ${s.y}`);
  walk(world, s, [[-4.25, -15], [-4.25, -17.2]]);
  assert.ok(Math.abs(s.y - WALL_H) < 0.01, `на башне: y ${s.y}`);
});

test('ворота: целы — не пройти; пали — проход на луг', () => {
  const w = new CollisionWorld(map);
  const s = makeState();
  s.x = 0;
  s.z = -11;
  const inp = makeInput();
  const ev = makeEvents();
  for (let t = 0; t < 3 * TICK_RATE; t++) {
    inp.seq++;
    inp.buttons = BTN_FORWARD;
    stepPlayer(s, inp, w, false, 1, ev);
  }
  assert.ok(s.z > GATE.z1, `упёрлись в ворота: z ${s.z}`);
  w.setEnabled(map.gateBox, false);
  for (let t = 0; t < 3 * TICK_RATE; t++) {
    inp.seq++;
    stepPlayer(s, inp, w, false, 1, ev);
  }
  assert.ok(s.z < FORT.z0 - 4, `вышли за ворота: z ${s.z}`);
  assert.ok(outsideFort(s.x, s.y, s.z));
  assert.equal(map.boxes[map.gateBox].mat, 'wood');
});

test('дороги начинаются на лугу и сходятся к воротам, точки липучек — на наружных гранях', () => {
  for (const r of ROADS) {
    const [sx, sz] = r.pts[0];
    const [ex, ez] = r.pts[r.pts.length - 1];
    assert.ok(outsideFort(sx, 0, sz));
    assert.ok(sx > map.bounds.minX && sx < map.bounds.maxX && sz > map.bounds.minZ && sz < map.bounds.maxZ);
    assert.ok(Math.abs(ex) < GATE.x1 && ez < GATE.face, 'конец дороги — перед воротами');
    assert.ok(freeAt(world, sx, 0, sz), 'начало дороги свободно');
  }
  for (const c of CLIMBS) {
    // шаг наружу от грани — земля и свободно, шаг внутрь — стена
    assert.ok(freeAt(world, c.x + c.nx * 1, 0, c.z + c.nz * 1));
    assert.ok(!freeAt(world, c.x - c.nx * 1, 0, c.z - c.nz * 1));
  }
});

test('волны растут, с людьми зомби больше и толще', () => {
  let prev = 0;
  for (let w = 1; w <= FORT_WAVES; w++) {
    const n = waveCounts(w, 1).reduce((a, b) => a + b, 0);
    assert.ok(n > prev, `волна ${w}: ${n} > ${prev}`);
    prev = n;
    const n3 = waveCounts(w, 3).reduce((a, b) => a + b, 0);
    assert.ok(n3 > n);
  }
  assert.equal(waveCounts(1, 1)[Z_BRUTE], 0);
  assert.ok(waveCounts(FORT_WAVES, 1)[Z_CLIMBER] > 0);
  assert.ok(zombieHp(Z_WALKER, 4) > zombieHp(Z_WALKER, 1));
  assert.equal(waveCounts(1, 1).length, Z_KINDS);
});

test('жетоны: каждую волну и каждый десяток сбитых платят один раз; бонусы — только в итогах', () => {
  assert.equal(waveTokens(1), 6);
  assert.equal(waveTokens(7), 6 + 8, 'босс');
  assert.equal(waveTokens(25), 8 + 25, 'супер-босс');
  assert.equal(waveTokens(300), 14 + 25, 'потолок за волну — 14');
  assert.equal(killTokens(9), 0);
  assert.equal(killTokens(10_000), 40, 'за сбитых не больше 40 за забег');
  const run = makeRun(50);
  assert.equal(settle(run, null), null, 'ничего не нажил — платить нечего');
  run.waves = 3;
  run.tokWaves = waveTokens(1) + waveTokens(2) + waveTokens(3);
  run.kills = 25;
  const a = settle(run, null)!;
  assert.deepEqual(a, { total: 18 + 2, n: 3, waves: 18, kills: 2, win: 0, mvp: 0, record: 0 });
  assert.equal(settle(run, null), null, 'второй раз то же самое не платят');
  run.tokWaves += waveTokens(4);
  run.kills = 31;
  const b = settle(run, { mvp: true, record: true, win: false })!;
  assert.equal(b.waves, 6);
  assert.equal(b.kills, 1);
  assert.equal(b.mvp, FT_TOK_MVP);
  assert.ok(b.record! > 0);
  assert.equal(settle(makeRun(0), { mvp: false, record: false, win: true })?.win, FT_TOK_WIN);
});

test('хвост снимка туда и обратно', () => {
  const list: ZombieSnap[] = [
    { id: 7, kind: Z_WALKER, state: 0, hp: 1, x: -12.345, y: 0, z: -40.5, yaw: 1.2, atk: 3 },
    { id: 65000, kind: Z_CLIMBER, state: ZS_TOP, hp: 0.31, x: 17.2, y: 3.4, z: 4.01, yaw: -2.5, atk: 255 },
  ];
  const t = { gate: 1234.2, crystal: 2500, turrets: 2, jams: 5, left: 17 };
  const buf = new Uint8Array(5 + fortTailSize(list.length));
  const end = encodeFortTail(buf, 5, t, list, list.length);
  assert.equal(end, buf.length);
  const back = makeFortTail();
  const out: ZombieSnap[] = [];
  assert.equal(decodeFortTail(buf.buffer, 5, back, out), 2);
  assert.deepEqual(back, { gate: 1235, crystal: 2500, turrets: 2, jams: 5, left: 17, defenders: 1, rally: 0, rallyCd: 0 });
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const b = out[i];
    assert.equal(b.id, a.id);
    assert.equal(b.kind, a.kind);
    assert.equal(b.state, a.state);
    assert.equal(b.atk, a.atk);
    assert.ok(Math.abs(b.x - a.x) < 0.006 && Math.abs(b.y - a.y) < 0.006 && Math.abs(b.z - a.z) < 0.006, 'с шагом 1 см');
    assert.ok(Math.abs(b.hp - a.hp) < 0.01);
    const dy = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    assert.ok(Math.abs(dy) < 0.03);
  }
  assert.equal(decodeFortTail(buf.buffer.slice(0, 20), 5, back, out), -1, 'обрезанный хвост');
});

test('луч по зомби: у бугая хитбокс больше, голова — выше', () => {
  const tg = new Float64Array(2 * FT_STRIDE);
  tg.set([0, 0, -10, Z_WALKER, 0, 0, -10, Z_BRUTE]);
  const hit = { t: 0 };
  // на высоте 1,9 м шаркуна не задеть, бугая — да
  assert.equal(nearestZombie(0, 1.9, 0, 0, 0, -1, 100, tg.subarray(0, 4), 1, hit), -1);
  assert.equal(nearestZombie(0, 1.9, 0, 0, 0, -1, 100, tg.subarray(4, 8), 1, hit), 0);
  assert.ok(zombieHead(Z_WALKER, 1.3, 0));
  assert.ok(!zombieHead(Z_BRUTE, 1.3, 0));
});

test('expanded tail carries locked roster and shared shield clocks, rejects truncation at new header', () => {
  const tail={gate:1500,crystal:2400,turrets:0,jams:0,left:345,defenders:6,rally:480,rallyCd:1800};
  const bytes=new Uint8Array(fortTailSize(0));
  encodeFortTail(bytes,0,tail,[],0);
  const out=makeFortTail();
  assert.equal(decodeFortTail(bytes.buffer,0,out,[]),0);
  assert.deepEqual(out,tail);
  assert.equal(decodeFortTail(bytes.buffer.slice(0,13),0,makeFortTail(),[]),-1);
});
