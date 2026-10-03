// «Крепость»: супер-босс Кракен (server/fort/kraken.ts) — появление, очередь ударов щупалец с метками, окна уязвимости,
// урон по стене, плевки, нырки, оглушение без щупалец, ярость, гибель с наградой, детерминизм, масштаб по защитникам.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WATER_Y } from '../shared/constants.ts';
import * as F from '../shared/fort.ts';
import { fortBounty } from '../shared/fortkinds.ts';
import {
  KRAKEN_DIVE_TICKS, KRAKEN_LURK_BARE, KRAKEN_OPEN_TICKS, KRAKEN_SPIT_DMG, KRAKEN_SPIT_FLIGHT, KRAKEN_SPIT_R, KRAKEN_SPIT_TICKS,
  KRAKEN_SPOTS, SEA_WALK_Z, SHORE_HIT_Z, TENT_COUNT, TENT_DMG, TENT_LANES, TENT_REST_RAGE, TENT_REST_TICKS, TENT_SLAM_R,
  TENT_WARN_TICKS, krakenSpitEvery,
} from '../shared/fortkraken.ts';
import { WALL_H } from '../shared/fortmap.ts';
import { ZF_RAGE, type ZombieSnap } from '../shared/fortnet.ts';
import { KRAKEN_HEAD_BASE_HP, TENTACLE_BASE_HP, krakenHp } from '../shared/fortwaves.ts';
import { FEATURES, planWave } from '../server/fort/director.ts';
import { FortGame, type FortPlayer } from '../server/fort/game.ts';
import type { Zombie } from '../server/fort/horde.ts';
import type { FortEvent } from '../shared/fort.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { attackSignal } from '../client/fort/signals.ts';
import { krakenInfo } from '../client/fort/krakenfx.ts';

function setup(n = 1) {
  const game = new FortGame();
  const events: FortEvent[] = [];
  const sink = { sendJson: (m: { t: string; e?: FortEvent[] }) => { if (m.t === 'fev' && m.e) events.push(...m.e); }, sendBinary() {}, close() {} };
  const players = Array.from({ length: n }, (_, i) => game.addHuman({ pid: i + 1, nick: `Защ${i}`, outfit: DEFAULT_OUTFIT }, sink as never)!);
  game.phase = F.FT_WAVE;
  // все — в тылу двора, пока тест не поставит их куда нужно
  players.forEach((p, i) => place(p, -6 + i, 0, -6));
  return { game, players, events };
}

function place(p: FortPlayer, x: number, y: number, z: number): void {
  Object.assign(p.state, { x, y, z, vx: 0, vy: 0, vz: 0, grounded: 1 });
}

function steps(game: FortGame, n: number, keep?: () => void): void {
  for (let i = 0; i < n; i++) {
    keep?.();
    game.step();
  }
}

/** Шагать, пока условие не выполнится (не дольше max тиков); keep — что делать перед каждым шагом */
function until(game: FortGame, ok: () => boolean, max = 2000, keep?: () => void): number {
  let i = 0;
  for (; i < max && !ok(); i++) {
    keep?.();
    game.step();
  }
  assert.ok(ok(), `не дождались за ${max} тиков`);
  return i;
}

function head(game: FortGame): Zombie | undefined {
  return game.horde.zombies.find((z) => z.alive && z.kind === F.Z_KRAKEN);
}

function arms(game: FortGame): Zombie[] {
  return game.horde.zombies.filter((z) => z.alive && z.kind === F.Z_TENTACLE).sort((a, b) => a.stage - b.stage);
}

/** Волна 25 только с Кракеном (без северной орды и лодок) */
function krakenWave(game: FortGame, n = 1): void {
  const plan = planWave(25, n, 7);
  game.wave = 25;
  game.horde.startWave({ ...plan, spawns: [], boats: [] }, game.tick);
}

/** Кракен всплыл и щупальца стоят над водой */
function risen(game: FortGame, keep?: () => void): Zombie {
  until(game, () => head(game)?.state === F.ZS_WALK, 600, keep);
  return head(game)!;
}

/** Урон по части и сколько прошло */
function hurt(game: FortGame, z: Zombie, dmg: number, by: number): number {
  const before = z.hp;
  game.horde.damage(z, dmg, by, false, z.x, z.y + 1, z.z, z.x, z.z - 10);
  return before - z.hp;
}

/** Срубить щупальце насовсем */
function chop(game: FortGame, t: Zombie): void {
  game.horde.kill(t, 0);
}

test('Кракен на 25-й волне: поднимается из бухты (щупальца по одному, потом голова), под водой неуязвим, HP — по формуле', () => {
  assert.equal(planWave(25, 1, 3, undefined, FEATURES).kraken, true, 'в игре Кракен включён');
  const { game, players, events } = setup();
  krakenWave(game);
  until(game, () => !!head(game), 60);
  const h = head(game)!;
  assert.equal(h.state, F.ZS_KRAKEN_DIVE);
  assert.ok(h.y < WATER_Y - 5, 'голова глубоко');
  assert.deepEqual([h.x, h.z], [KRAKEN_SPOTS[0].x, KRAKEN_SPOTS[0].z], 'в бухте');
  assert.ok(Math.abs(h.maxHp - krakenHp(KRAKEN_HEAD_BASE_HP, 25, 1)) < 1e-6);
  assert.ok(events.some((e) => e[0] === 'warn' && e[1] === h.id && e[2] === F.ZS_KRAKEN_DIVE), 'видно, где всплывёт');
  const a = arms(game);
  assert.equal(a.length, TENT_COUNT);
  assert.deepEqual(a.map((t) => t.stage), [0, 1, 2, 3], 'по щупальцу на полосу');
  for (const t of a) {
    assert.equal(t.state, F.ZS_KRAKEN_DIVE);
    assert.ok(Math.abs(t.maxHp - krakenHp(TENTACLE_BASE_HP, 25, 1)) < 1e-6);
    assert.equal(hurt(game, t, 500, players[0].id), 0, 'под водой неуязвимо');
  }
  assert.equal(hurt(game, h, 500, players[0].id), 0);
  // середина раньше краёв, голова — последней
  const first = new Map<number, number>();
  until(game, () => h.state === F.ZS_WALK, 600, () => {
    for (const t of arms(game)) if (t.state === F.ZS_TENT_IDLE && !first.has(t.stage)) first.set(t.stage, game.tick);
  });
  assert.equal(first.size, TENT_COUNT, 'все щупальца над водой раньше головы');
  assert.ok(first.get(1)! < first.get(0)! && first.get(2)! < first.get(3)!, 'середина — первой');
  assert.ok(h.y > WATER_Y - 2.5, 'голова над водой');
  assert.ok(events.filter((e) => e[0] === 'blast' && e[1] === F.ZS_KRAKEN_DIVE).length >= TENT_COUNT + 1, 'всплески');
});

test('щупальце: метка на человеке на морской стене за полное предупреждение, удар, булава лежит — окно (урон полный), иначе броня', () => {
  const { game, players, events } = setup(2);
  const [p, q] = players;
  const lane = TENT_LANES[2];
  const keep = () => {
    place(p, lane, WALL_H, 12.4);
    place(q, lane + TENT_SLAM_R + 0.8, WALL_H, 12.4);
    p.hp = q.hp = 100;
  };
  krakenWave(game);
  risen(game, keep);
  const t = arms(game)[2];
  const ordered = until(game, () => t.state === F.ZS_TENT_SLAM, 1500, keep);
  assert.ok(Math.abs(t.toX - lane) < 1e-9 && Math.abs(t.toZ - 12.4) < 1e-9, 'метка там, где стоял');
  assert.ok(Math.abs(t.toY - (WALL_H + 0.06)) < 1e-6, 'на ходу стены');
  steps(game, 2, keep);
  const warn = events.findLast((e) => e[0] === 'warn' && e[1] === t.id && e[2] === F.ZS_TENT_SLAM)!;
  assert.ok(warn && warn[6] === TENT_SLAM_R, 'круг удара');
  assert.ok(ordered > 0);
  const snaps: ZombieSnap[] = [];
  const s = snaps.slice(0, game.horde.snap(snaps)).find((z) => z.id === t.id)!;
  assert.equal(s.state, F.ZS_TENT_SLAM);
  assert.equal(s.r, TENT_SLAM_R, 'радиус метки в снимке');
  assert.equal(s.stage, 2, 'номер щупальца в снимке');
  assert.ok(Math.abs(hurt(game, t, 100, p.id) - 100 * F.BOSS_ARMOR) < 1e-6, 'в замахе — броня');
  // стоял — получил; рядом за кругом — цел
  let pHp = 100;
  let qHp = 100;
  const wind = until(game, () => t.state === F.ZS_TENT_REST, 200, () => {
    place(p, lane, WALL_H, 12.4);
    place(q, lane + TENT_SLAM_R + 0.8, WALL_H, 12.4);
    pHp = p.hp;
    qHp = q.hp;
  });
  game.step();
  game.step();
  assert.ok(wind + 2 >= TENT_WARN_TICKS - 2, `полное предупреждение: ${wind + 2}`);
  assert.equal(p.hp, pHp - TENT_DMG * game.horde.dmgMul, 'удар по стоящему в круге');
  assert.equal(q.hp, qHp, 'за кругом — цел');
  assert.ok(events.some((e) => e[0] === 'blast' && e[1] === F.ZS_TENT_SLAM), 'удар виден');
  assert.ok(Math.abs(t.x - lane) < 1e-6 && Math.abs(t.y - WALL_H) < 1e-6 && Math.abs(t.z - 12.4) < 1e-6, 'булава лежит на стене');
  assert.equal(hurt(game, t, 100, p.id), 100, 'лежит — урон полный');
  until(game, () => t.state === F.ZS_TENT_IDLE, TENT_REST_TICKS + 5, keep);
  assert.ok(Math.abs(hurt(game, t, 100, p.id) - 100 * F.BOSS_ARMOR) < 1e-6, 'поднялось — снова броня');
});

test('урон по стене: людей рядом нет — бьёт по очереди ход морской стены и берег; ниже уровня удара и под стеной — цел', () => {
  const { game, players } = setup(2);
  const [p, q] = players;
  krakenWave(game);
  risen(game);
  const t = arms(game)[0];
  const marks: Array<[number, number]> = [];
  for (let k = 0; k < 2; k++) {
    until(game, () => t.state === F.ZS_TENT_SLAM, 1500, () => { p.hp = q.hp = 100; });
    marks.push([Math.round(t.toY * 10) / 10, t.toZ]);
    until(game, () => t.state === F.ZS_TENT_IDLE, 400, () => { p.hp = q.hp = 100; });
  }
  assert.deepEqual(marks.map(([, z]) => z).sort((a, b) => a - b), [SEA_WALK_Z, SHORE_HIT_Z], 'по стене и по берегу');
  assert.ok(Math.abs(t.toX - TENT_LANES[0]) < 1e-9, 'напротив своей полосы');
  assert.ok(marks.some(([y, z]) => z === SEA_WALK_Z && y === Math.round((WALL_H + 0.06) * 10) / 10), 'на ходу стены');
  // человек на стене — метка на нём; второй на террасе у самой метки, но ниже хода стены — удар не достаёт
  const lane1 = TENT_LANES[1];
  const keep = () => {
    place(p, lane1 + 0.2, WALL_H, 12.4);
    place(q, lane1 + 1, 2.2, 10.7);
  };
  const t1 = arms(game)[1];
  until(game, () => t1.state === F.ZS_TENT_IDLE, 400, () => { keep(); p.hp = q.hp = 100; });
  until(game, () => t1.state === F.ZS_TENT_SLAM, 2500, () => { keep(); p.hp = q.hp = 100; });
  assert.ok(Math.abs(t1.toX - (lane1 + 0.2)) < 1e-9, 'метка на том, кто на стене');
  assert.ok(Math.hypot(q.state.x - t1.toX, q.state.z - t1.toZ) < TENT_SLAM_R, 'терраса — внутри круга по горизонтали');
  until(game, () => t1.state === F.ZS_TENT_REST, 200, keep);
  assert.equal(p.hp, 100 - TENT_DMG * game.horde.dmgMul, 'на стене — получил');
  assert.equal(q.hp, 100, 'терраса ниже хода стены — удар не достаёт');
});

test('голова: плевок по человеку — метка и бросок видны, ушёл — мимо, остался — попало; людей нет — по кристаллу', () => {
  for (const dodge of [false, true]) {
    const { game, players, events } = setup();
    const p = players[0];
    const keep = () => { place(p, 0, 0, -8); p.hp = 100; };
    krakenWave(game);
    const h = risen(game, keep);
    until(game, () => h.state === F.ZS_KRAKEN_SPIT, 800, keep);
    assert.ok(Math.abs(h.toX) < 1e-9 && Math.abs(h.toZ + 8) < 1e-9, 'метка на человеке');
    assert.ok(events.some((e) => e[0] === 'warn' && e[2] === F.ZS_KRAKEN_SPIT && e[6] === KRAKEN_SPIT_R));
    until(game, () => h.t <= KRAKEN_SPIT_FLIGHT - 1, KRAKEN_SPIT_TICKS, keep);
    assert.ok(events.some((e) => e[0] === 'throw' && e[8] === F.ZS_KRAKEN_SPIT), 'клякса летит');
    if (dodge) place(p, 6, 0, -8);
    p.hp = 100;
    until(game, () => h.state !== F.ZS_KRAKEN_SPIT, KRAKEN_SPIT_FLIGHT + 2);
    assert.equal(p.hp, dodge ? 100 : 100 - KRAKEN_SPIT_DMG * game.horde.dmgMul);
  }
  const { game, players } = setup();
  krakenWave(game);
  const h = risen(game);
  players[0].alive = false;
  players[0].respawnTick = 1e9;
  const crystal = game.crystal;
  until(game, () => h.state === F.ZS_KRAKEN_SPIT, 800);
  assert.ok(Math.abs(h.toZ - 2.6) < 1e-6, 'людей нет — по кристаллу');
  until(game, () => h.state !== F.ZS_KRAKEN_SPIT, KRAKEN_SPIT_TICKS + 2);
  assert.ok(game.crystal < crystal);
});

test('окна головы: пока щупальца живы — броня; срубили все — оглушена и открыта, потом ныряет (неуязвима) и всплывает в другом месте без защиты', () => {
  const { game, players, events } = setup();
  const p = players[0];
  krakenWave(game);
  const h = risen(game);
  assert.ok(Math.abs(hurt(game, h, 1000, p.id) - 1000 * F.BOSS_ARMOR) < 1e-6, 'щупальца живы — броня');
  for (const t of arms(game)) chop(game, t);
  game.step();
  assert.equal(h.state, F.ZS_BOSS_OPEN, 'оглушена');
  assert.equal(h.t, KRAKEN_OPEN_TICKS);
  steps(game, 2);
  assert.ok(events.some((e) => e[0] === 'blast' && e[1] === F.ZS_BOSS_OPEN), 'голова открыта — видно');
  assert.equal(hurt(game, h, 1000, p.id), 1000, 'открыта — урон полный');
  until(game, () => h.state === F.ZS_KRAKEN_DIVE, KRAKEN_OPEN_TICKS + 2);
  const from = [h.x, h.z];
  assert.equal(hurt(game, h, 1000, p.id), 0, 'нырнула — неуязвима');
  const dive = until(game, () => h.state === F.ZS_WALK, KRAKEN_DIVE_TICKS + 2);
  assert.ok(dive >= KRAKEN_DIVE_TICKS - 2);
  assert.notDeepEqual([h.x, h.z], from, 'всплыла в другом месте');
  assert.ok(KRAKEN_SPOTS.some((s) => s.x === h.x && s.z === h.z));
  assert.equal(hurt(game, h, 1000, p.id), 1000, 'без щупалец — урон полный');
  assert.equal(h.healT, KRAKEN_LURK_BARE, 'без щупалец ныряет чаще');
  game.step();
  assert.equal(h.state, F.ZS_BOSS_OPEN, 'в снимке — открыта');
  assert.equal(h.t, 0, 'не оглушена — плюётся');
  until(game, () => h.state === F.ZS_KRAKEN_SPIT, 600);
});

test('ярость на 50 %: признак в снимке у головы и щупалец, срубленные отрастают, голова ныряет, удары парами, булава лежит меньше', () => {
  const { game, players, events } = setup();
  const p = players[0];
  krakenWave(game);
  const h = risen(game);
  const [a, b] = arms(game);
  chop(game, a);
  chop(game, b);
  game.step();
  assert.equal(arms(game).length, 2);
  h.hp = h.maxHp * 0.49;
  game.step();
  assert.equal(h.stage, 2, 'ярость');
  assert.ok(events.some((e) => e[0] === 'bossphase' && e[1] === h.id && e[2] === 2));
  assert.equal(h.state, F.ZS_KRAKEN_DIVE, 'ныряет');
  assert.equal(arms(game).length, TENT_COUNT, 'срубленные отрастают');
  const grown = arms(game).filter((t) => t.state === F.ZS_KRAKEN_DIVE);
  assert.equal(grown.length, 2);
  for (const t of grown) assert.equal(t.hp, t.maxHp, 'с полным HP');
  game.step();
  const snaps: ZombieSnap[] = [];
  const list = snaps.slice(0, game.horde.snap(snaps));
  for (const z of list.filter((s) => s.kind === F.Z_KRAKEN || s.kind === F.Z_TENTACLE)) assert.ok((z.flags ?? 0) & ZF_RAGE, `ярость в снимке: ${F.ZK[z.kind].name}`);
  until(game, () => h.state === F.ZS_WALK, 400);
  // удары парами: двое в замахе в один тик
  let pair = 0;
  until(game, () => pair >= 2, 1200, () => { pair = arms(game).filter((t) => t.state === F.ZS_TENT_SLAM && t.t >= TENT_WARN_TICKS - 1).length; });
  const slamming = arms(game).filter((t) => t.state === F.ZS_TENT_SLAM);
  until(game, () => slamming[0].state === F.ZS_TENT_REST, TENT_WARN_TICKS + 2);
  const rest = until(game, () => slamming[0].state !== F.ZS_TENT_REST, TENT_REST_TICKS + 2);
  assert.ok(Math.abs(rest - TENT_REST_RAGE) <= 1, `лежит меньше: ${rest}`);
  assert.ok(Math.abs(hurt(game, h, 100, p.id) - 100 * F.BOSS_ARMOR) < 1e-6, 'отросли — голова снова в броне');
});

test('гибель: награда тем, кто бил, щупальца уходят под воду, волна кончается', () => {
  const { game, players, events } = setup(2);
  const [p, q] = players;
  krakenWave(game);
  const h = risen(game);
  for (const t of arms(game)) chop(game, t);
  game.step();
  assert.equal(h.state, F.ZS_BOSS_OPEN);
  // ярость на пути к гибели — отрастают, рубим снова
  hurt(game, h, h.maxHp * 0.6, p.id);
  until(game, () => h.state === F.ZS_WALK && arms(game).every((t) => t.state !== F.ZS_KRAKEN_DIVE), 600);
  assert.equal(h.stage, 2);
  for (const t of arms(game)) chop(game, t);
  until(game, () => h.state === F.ZS_BOSS_OPEN, 5);
  const ptsP = p.pts;
  const ptsQ = q.pts;
  const bounty = Math.round(fortBounty(F.Z_KRAKEN, 0, 25, false) * game.goldMul);
  hurt(game, h, h.hp + 1, q.id);
  assert.equal(h.alive, false);
  assert.equal(p.pts + q.pts - ptsP - ptsQ, bounty, 'награда за супер-босса — команде');
  assert.ok(p.pts - ptsP > q.pts - ptsQ, 'больше — тому, кто больше бил');
  steps(game, 2);
  assert.ok(events.some((e) => e[0] === 'zdie' && e[1] === h.id && e[2] === q.id && e[6] === F.Z_KRAKEN), 'гибель видна, добил второй');
  assert.equal(game.horde.alive, 0);
  assert.notEqual(game.phase, F.FT_WAVE, 'волна отбита');
});

test('щупальца без головы уходят под воду без награды', () => {
  const { game, players, events } = setup();
  krakenWave(game);
  const h = risen(game);
  const pts = players[0].pts;
  game.horde.kill(h, 0);
  const n = arms(game).length;
  assert.equal(n, TENT_COUNT);
  steps(game, 2);
  assert.equal(arms(game).length, 0);
  assert.equal(events.filter((e) => e[0] === 'zdie' && e[6] === F.Z_TENTACLE && e[2] === 0).length, TENT_COUNT);
  assert.equal(players[0].pts - pts, Math.round(fortBounty(F.Z_KRAKEN, 0, 25, false) * game.goldMul), 'за щупальца — ничего');
});

test('детерминизм: тот же бой — те же состояния, места и HP', () => {
  const run = () => {
    const { game, players } = setup(2);
    const [p, q] = players;
    krakenWave(game, 2);
    const trace: string[] = [];
    for (let i = 0; i < 2400; i++) {
      // один ходит вдоль морской стены, второй стоит у края террасы; оба бьют лежащие булавы и голову
      place(p, -12 + (i % 600) / 25, WALL_H, 12.4);
      place(q, 4, 2.2, 10);
      p.hp = q.hp = 100;
      if (i % 7 === 0) {
        for (const z of game.horde.zombies) {
          if (z.alive && (z.kind === F.Z_TENTACLE || z.kind === F.Z_KRAKEN)) game.horde.damage(z, z.maxHp * 0.02, i % 2 ? p.id : q.id, false, z.x, z.y + 1, z.z);
        }
      }
      game.step();
      const s: string[] = [];
      for (const z of game.horde.zombies) {
        if (z.alive && (z.kind === F.Z_TENTACLE || z.kind === F.Z_KRAKEN)) s.push(`${z.kind}/${z.stage}/${z.state}/${z.t}/${z.x.toFixed(4)}/${z.y.toFixed(4)}/${z.z.toFixed(4)}/${z.hp.toFixed(3)}`);
      }
      trace.push(s.join(' '));
    }
    return trace;
  };
  const a = run();
  const b = run();
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i], `тик ${i}`);
  assert.ok(a.some((s) => s.includes(`/${F.ZS_TENT_REST}/`)) && a.some((s) => s.includes(`/${F.ZS_KRAKEN_SPIT}/`)), 'бой шёл');
});

test('масштаб: HP на 1/2/4 защитников как у боссов, плевки чаще, у каждой полосы — свой человек; подкрепление пересчитывает HP', () => {
  const head1 = krakenHp(KRAKEN_HEAD_BASE_HP, 25, 1);
  for (const n of [1, 2, 4]) {
    const { game, players } = setup(n);
    krakenWave(game, n);
    until(game, () => !!head(game), 60);
    const h = head(game)!;
    assert.ok(Math.abs(h.maxHp / head1 - n) < 1e-9, `голова на ${n}: ×${(h.maxHp / head1).toFixed(2)}`);
    for (const t of arms(game)) assert.ok(Math.abs(t.maxHp - krakenHp(TENTACLE_BASE_HP, 25, n)) < 1e-6);
    if (n > 1) assert.ok(krakenSpitEvery(n, false, 0) < krakenSpitEvery(1, false, 0), 'плевки чаще');
    if (n === 4) {
      // по человеку у каждой полосы: каждое щупальце бьёт своего
      const keep = () => players.forEach((p, i) => { place(p, TENT_LANES[i], WALL_H, 12.4); p.hp = 100; });
      risen(game, keep);
      const seen = new Map<number, number>();
      until(game, () => seen.size === TENT_COUNT, 2000, () => {
        keep();
        for (const t of arms(game)) if (t.state === F.ZS_TENT_SLAM) seen.set(t.stage, t.toX);
      });
      for (const [lane, x] of seen) assert.ok(Math.abs(x - TENT_LANES[lane]) < 1e-9, `полоса ${lane} — свой человек`);
    }
  }
  // вошёл ещё один защитник посреди боя — максимум HP по формуле Кракена, доля сохраняется
  const { game } = setup(1);
  krakenWave(game);
  const h = risen(game);
  h.hp = h.maxHp * 0.8;
  game.addHuman({ pid: 77, nick: 'Поздний', outfit: DEFAULT_OUTFIT }, { sendJson() {}, sendBinary() {}, close() {} } as never);
  game.step();
  assert.ok(Math.abs(h.maxHp - krakenHp(KRAKEN_HEAD_BASE_HP, 25, 2)) < 1e-6, 'голова — на двоих');
  assert.ok(Math.abs(h.hp / h.maxHp - 0.8) < 1e-9, 'доля HP та же');
  for (const t of arms(game)) assert.ok(Math.abs(t.maxHp - krakenHp(TENTACLE_BASE_HP, 25, 2)) < 1e-6, 'щупальца — на двоих');
});

test('клиент: метки Кракена из снимка — замах красный и растёт к удару, плевок, окно булавы голубое; подсказка в полосе босса', () => {
  const start = attackSignal(F.ZS_TENT_SLAM, TENT_WARN_TICKS, TENT_SLAM_R)!;
  const hit = attackSignal(F.ZS_TENT_SLAM, 0, TENT_SLAM_R)!;
  assert.equal(start.progress, 0);
  assert.equal(hit.progress, 1);
  assert.equal(start.radius, TENT_SLAM_R);
  const spit = attackSignal(F.ZS_KRAKEN_SPIT, KRAKEN_SPIT_TICKS, KRAKEN_SPIT_R)!;
  assert.equal(spit.progress, 0);
  assert.equal(spit.radius, KRAKEN_SPIT_R);
  const rest = attackSignal(F.ZS_TENT_REST, TENT_REST_TICKS / 2, TENT_SLAM_R)!;
  assert.notEqual(rest.color, hit.color, 'окно — не красное');
  assert.ok(rest.progress > 0.4 && rest.progress < 0.6, 'окно тает');
  // нырок и голова без щупалец — без метки на земле (круги на воде рисует kraken3d)
  assert.equal(attackSignal(F.ZS_KRAKEN_DIVE, 100), null);
  assert.equal(attackSignal(F.ZS_BOSS_OPEN, 100), null);
  assert.match(krakenInfo(F.ZS_WALK, 0), /Броня/);
  assert.match(krakenInfo(F.ZS_BOSS_OPEN, 120), /Оглушён · 2\.0 с/);
  assert.match(krakenInfo(F.ZS_BOSS_OPEN, 0), /открыта/);
  assert.match(krakenInfo(F.ZS_KRAKEN_DIVE, 90), /Под водой/);
  assert.match(krakenInfo(F.ZS_KRAKEN_SPIT, 40), /метки/);
});
