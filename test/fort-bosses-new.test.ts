// «Крепость»: новые боссы — Король-Тыква (тыквята, перекат вдоль стены, семечки), Ткачиха (висит на стене: паутина,
// хлёст лапами, кладка; ярость — через стену во двор), Леший (корни под людьми, воротами и кристаллом, целебная роща
// со срывом, прятки под землёй с рощей лесовиков). Ротация шести боссов, метки на полное предупреждение, окно
// уязвимости, ярость на 50 %, проход павших ворот, «не застревают», детерминизм.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as F from '../shared/fort.ts';
import {
  LS_BREAK, LS_EMERGE_R, LS_GROVE_BASE, LS_HEAL_FRAC, LS_HEAL_R, LS_HOME_Z, LS_IN_Z, LS_ROOT_CRYSTAL, LS_ROOT_DMG, LS_ROOT_GATE,
  LS_ROOT_R, LS_UNDER_Y, PK_IN_Z, PK_POST_X, PK_POST_Z, PK_ROLL_DMG, PK_ROLL_R, PK_SPIT_DMG, PK_SPIT_R, PK_SUMMON_R,
  WV_BITE_CRYSTAL, WV_FOOT_Z, WV_HANG_Y, WV_HANG_Z, WV_IN_Z, WV_SWEEP_DMG, WV_WEB_DOT, WV_WEB_EVERY, WV_WEB_HIT, WV_WEB_HP,
} from '../shared/fortbosses.ts';
import { BOSS_ARMOR as ARMOR } from '../shared/fort.ts';
import { CRYSTAL, GATE, THROAT_Z, WALL_H } from '../shared/fortmap.ts';
import { ZF_RAGE, isTimedState, type ZombieSnap } from '../shared/fortnet.ts';
import { bossHp, bossTier, isBossWave } from '../shared/fortwaves.ts';
import { makeRng } from '../shared/math.ts';
import { BTN_FIRE, BTN_JUMP, makeInput } from '../shared/sim.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { packSize } from '../server/fort/bosses.ts';
import { tearWebAt, webCount, weaverInside, weaverOnWall } from '../server/fort/boss-weaver.ts';
import { ALL_FEATURES, FEATURES, planWave } from '../server/fort/director.ts';
import { FortGame } from '../server/fort/game.ts';
import type { Zombie } from '../server/fort/horde.ts';
import type { FortEvent } from '../shared/fort.ts';

const NEW = [F.Z_PUMPKIN, F.Z_WEAVER, F.Z_LESHY];

function setup(n = 1) {
  const game = new FortGame();
  const events: FortEvent[] = [];
  const sink = { sendJson: (m: { t: string; e?: FortEvent[] }) => { if (m.t === 'fev' && m.e) events.push(...m.e); }, sendBinary() {}, close() {} };
  const players = Array.from({ length: n }, (_, i) => game.addHuman({ pid: i + 1, nick: `Tester${i + 7}`, outfit: DEFAULT_OUTFIT }, sink as never)!);
  game.phase = F.FT_WAVE;
  return { game, players, events };
}

function steps(game: FortGame, n: number): void {
  for (let i = 0; i < n; i++) game.step();
}

/** Шагать, пока условие не выполнится (не дольше max тиков) */
function until(game: FortGame, ok: () => boolean, max = 2000): number {
  let i = 0;
  for (; i < max && !ok(); i++) game.step();
  assert.ok(ok(), `не дождались за ${max} тиков`);
  return i;
}

/** Человек стоит в точке (на стене y = WALL_H) */
function place(p: { state: { x: number; y: number; z: number; grounded: number } }, x: number, y: number, z: number): void {
  Object.assign(p.state, { x, y, z, grounded: 1 });
}

/** События уходят клиентам раз в несколько тиков — тест смотрит и разосланные, и ещё не разосланные */
function seen(game: FortGame, events: FortEvent[]): FortEvent[] {
  return [...events, ...(game as unknown as { events: FortEvent[] }).events];
}

function warnOf(game: FortGame, events: FortEvent[], attack: number): FortEvent | undefined {
  return seen(game, events).find((e) => e[0] === 'warn' && e[2] === attack);
}

function aliveOf(game: FortGame, kind: number): Zombie[] {
  return game.horde.zombies.filter((z) => z.alive && z.kind === kind);
}

// ------------------------------------------------------------ ротация

test('ротация: шесть боссов по кругу, новые — с 28-й; круг растёт, когда все побывали; HP растёт как раньше', () => {
  const waves = [7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84];
  assert.deepEqual(waves.map((w) => planWave(w, 1, 3, undefined, FEATURES).boss),
    [F.Z_BOSS, F.Z_RAM, F.Z_GOLEM, F.Z_PUMPKIN, F.Z_WEAVER, F.Z_LESHY, F.Z_BOSS, F.Z_RAM, F.Z_GOLEM, F.Z_PUMPKIN, F.Z_WEAVER, F.Z_LESHY]);
  assert.deepEqual(waves.map((w) => planWave(w, 1, 3, undefined, FEATURES).bossTier), [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
  for (let w = 1; w < 28; w++) assert.ok(!NEW.includes(planWave(w, 1, 3, undefined, ALL_FEATURES).boss), `${w}: новичок сначала встречает знакомых`);
  // все 300 волн: боссы строго по кругу, круг — после шестерых (175-я — супер-волна, счёт боссов её пропускает)
  const order = [F.Z_BOSS, F.Z_RAM, F.Z_GOLEM, F.Z_PUMPKIN, F.Z_WEAVER, F.Z_LESHY];
  let n = 0;
  for (let w = 1; w <= 300; w++) {
    if (!isBossWave(w)) continue;
    const plan = planWave(w, 1, 3, undefined, FEATURES);
    assert.equal(plan.boss, order[n % 6], `${w}: босс по кругу`);
    assert.equal(plan.bossTier, Math.floor(n / 6), `${w}: круг`);
    n++;
  }
  assert.equal(n, 41, 'боссов за кампанию');
  for (const w of [28, 35, 42, 49, 84]) {
    assert.equal(planWave(w, 2, 3, undefined, FEATURES).bossHp, bossHp(w, 2, bossTier(w)), `${w}: HP — по прежней кривой`);
  }
  assert.equal(planWave(28, 1, 3, undefined, FEATURES).card.title, F.ZK[F.Z_PUMPKIN].name);
  for (const kind of NEW) {
    assert.ok(F.isBossKind(kind), `${F.ZK[kind].name}: босс`);
    assert.ok(!F.isWalkerKind(kind), 'ходит напрямую, без поля расстояний');
    assert.ok(F.ZK[kind].headY < F.ZK[kind].hcy + F.ZK[kind].hry, 'голова — внутри хитбокса');
  }
});

test('каждый новый босс выходит на своей волне (первым в очереди)', () => {
  for (const [w, kind] of [[28, F.Z_PUMPKIN], [35, F.Z_WEAVER], [42, F.Z_LESHY]] as const) {
    const { game } = setup(1);
    game.jumpTo(w);
    until(game, () => game.phase === F.FT_WAVE && game.wave === w, 400);
    until(game, () => aliveOf(game, kind).length === 1, 120);
    assert.equal(game.card?.boss, kind);
    assert.equal(game.card?.title, F.ZK[kind].name);
  }
});

// ------------------------------------------------------------ Король-Тыква

/** Король на посту, готов к атаке номер index (0 — тыквята, 1 — семечки, 2 — перекат) */
function king(game: FortGame, index: number, x = PK_POST_X): Zombie {
  const k = game.horde.spawn(F.Z_PUMPKIN, 1)!;
  Object.assign(k, { x, z: PK_POST_Z, state: F.ZS_WALK, t: 1, homeX: x, attackIndex: index });
  return k;
}

test('Король-Тыква: тыквята — оранжевый круг на полное предупреждение, потом стая пузырей бьёт ворота; окно', () => {
  const { game, events } = setup(1);
  const k = king(game, 0);
  game.step();
  assert.equal(k.state, F.ZS_PK_SUMMON);
  const w = warnOf(game, events, F.ZS_PK_SUMMON);
  assert.ok(w && w[6] === PK_SUMMON_R, 'метка — круг вокруг него');
  const before = aliveOf(game, F.Z_BLOATER).length;
  steps(game, F.BOSS_WARN_TICKS - 2);
  assert.equal(k.state, F.ZS_PK_SUMMON, 'полное предупреждение');
  assert.equal(aliveOf(game, F.Z_BLOATER).length, before, 'до конца метки — никого');
  until(game, () => k.state === F.ZS_BOSS_OPEN, 5);
  assert.equal(aliveOf(game, F.Z_BLOATER).length, packSize(1), 'стая тыквят');
  assert.equal(k.t, F.BOSS_OPEN_TICKS, 'после атаки открыт');
  until(game, () => game.gate < F.GATE_HP, 60 * 25);
});

test('Король-Тыква: семечки — метка на человеке, ушёл — мимо, остался — попало', () => {
  for (const dodge of [false, true]) {
    const { game, players, events } = setup(1);
    const p = players[0];
    place(p, -4, WALL_H, -14.6);
    const k = king(game, 1);
    game.step();
    assert.equal(k.state, F.ZS_PK_SPIT);
    assert.ok(Math.abs(k.toX + 4) < 1e-9 && Math.abs(k.toZ + 14.6) < 1e-9, 'метка там, где стоял');
    assert.equal(warnOf(game, events, F.ZS_PK_SPIT)?.[6], PK_SPIT_R);
    until(game, () => k.t < 20, 200);
    assert.ok(seen(game, events).some((e) => e[0] === 'throw' && e[8] === F.ZS_PK_SPIT), 'семечки летят на виду');
    if (dodge) p.state.x = -9;
    until(game, () => k.state !== F.ZS_PK_SPIT, 60);
    assert.equal(p.hp, dodge ? 100 : 100 - PK_SPIT_DMG);
    assert.equal(k.state, F.ZS_BOSS_OPEN);
  }
});

test('Король-Тыква: перекат вдоль стены — метка на стене над ним, бегущий круг; стоящего задевает раз, прыгнувшего — нет', () => {
  for (const jump of [false, true]) {
    const { game, players, events } = setup(1);
    const p = players[0];
    place(p, 0, WALL_H, -14.6);
    const k = king(game, 2);
    game.step();
    assert.equal(k.state, F.ZS_PK_ROLL_WARN);
    const w = warnOf(game, events, F.ZS_PK_ROLL_WARN);
    assert.ok(w && w[6] === PK_ROLL_R && (w[4] as number) > WALL_H, 'метка — на ходу стены');
    steps(game, F.BOSS_WARN_TICKS - 2);
    assert.equal(k.state, F.ZS_PK_ROLL_WARN, 'полное предупреждение');
    assert.equal(k.x, PK_POST_X, 'до конца метки стоит');
    const input = makeInput();
    let jumped = false;
    let seq = 1;
    const st = (): number => k.state;
    for (let i = 0; i < 400 && st() !== F.ZS_BOSS_OPEN; i++) {
      // прыжок, когда круг почти под ним
      input.seq = seq++;
      input.buttons = jump && !jumped && st() === F.ZS_PK_ROLL && k.x < 4.5 ? BTN_JUMP : 0;
      if (input.buttons) jumped = true;
      game.onInputs(p, [input], 1);
      game.step();
      if (st() === F.ZS_PK_ROLL) assert.ok(Math.abs(k.toX - k.x) < 1e-9, 'круг бежит вместе с ним');
    }
    assert.equal(p.hp, jump ? 100 : 100 - PK_ROLL_DMG, jump ? 'перепрыгнул' : 'задело один раз');
    assert.equal(k.state, F.ZS_BOSS_OPEN, 'врезался — открыт');
    assert.ok(Math.abs(k.x + PK_POST_X) < 0.01 && Math.abs(k.z - PK_POST_Z) < 0.01, 'на другом посту');
  }
});

test('Король-Тыква в ярости катится туда и обратно — у каждого переката полная метка', () => {
  const { game, events } = setup(1);
  const k = king(game, 2);
  k.hp = k.maxHp * 0.45;
  game.step();
  assert.equal(k.stage, 2);
  assert.ok(seen(game, events).some((e) => e[0] === 'bossphase' && e[1] === k.id && e[2] === 2), 'ярость объявлена');
  until(game, () => k.state === F.ZS_PK_ROLL, 200);
  until(game, () => k.state !== F.ZS_PK_ROLL, 200);
  assert.ok(Math.abs(k.x + PK_POST_X) < 0.01, 'докатился');
  until(game, () => k.state === F.ZS_PK_ROLL_WARN, 5);
  const back = game.tick;
  until(game, () => k.state === F.ZS_PK_ROLL, 200);
  assert.ok(game.tick - back >= F.BOSS_WARN_TICKS - 1, 'вторая метка — полная');
  until(game, () => k.state === F.ZS_BOSS_OPEN, 200);
  assert.ok(Math.abs(k.x - PK_POST_X) < 0.01, 'и обратно');
});

// ------------------------------------------------------------ Ткачиха

/** Ткачиха уже висит на стене в x, готова к атаке номер index (0 — паутина, 1 — хлёст, 2 — кладка) */
function weaver(game: FortGame, index: number, x = 10): Zombie {
  const w = game.horde.spawn(F.Z_WEAVER, 1)!;
  Object.assign(w, { x, y: WV_HANG_Y, z: WV_HANG_Z, state: F.ZS_WV_HANG, t: 1, homeX: x, attackIndex: index, addsMask: 2 });
  return w;
}

test('Ткачиха: идёт к той стороне стены, где люди, лезет на грань и висит; голова — над бруствером', () => {
  const { game, players } = setup(2);
  place(players[0], 9, WALL_H, -14.6);
  place(players[1], 11, WALL_H, -14.6);
  const w = game.horde.spawn(F.Z_WEAVER, 1)!;
  const ticks = until(game, () => w.state === F.ZS_WV_HANG, 60 * 40);
  assert.ok(ticks < 60 * 35, `долезла за ${(ticks / 60).toFixed(1)} с`);
  assert.ok(weaverOnWall(w));
  assert.ok(w.x > 6 && w.x < 15, `восточная сторона: x = ${w.x.toFixed(2)}`);
  assert.ok(Math.abs(w.y - WV_HANG_Y) < 0.01 && Math.abs(w.z - WV_HANG_Z) < 0.01, 'висит на наружной грани');
  const top = w.y + F.ZK[F.Z_WEAVER].hcy + F.ZK[F.Z_WEAVER].hry;
  assert.ok(top > WALL_H + 0.8, 'хитбокс выглядывает над бруствером');
});

test('Ткачиха: паутина — метка на человеке, урон, липкая паутина жжётся, пока стоишь; выстрелы рвут её', () => {
  const { game, players, events } = setup(1);
  const p = players[0];
  place(p, 9, WALL_H, -14.6);
  const w = weaver(game, 0, 9);
  game.step();
  assert.equal(w.state, F.ZS_WV_WEB);
  assert.ok(Math.abs(w.toX - 9) < 1e-9, 'метка на человеке');
  steps(game, F.BOSS_WARN_TICKS - 2);
  assert.equal(p.hp, 100, 'до конца метки — цел');
  until(game, () => w.state === F.ZS_BOSS_OPEN, 5);
  assert.equal(p.hp, 100 - WV_WEB_HIT, 'накрыло');
  assert.equal(webCount(game.horde, game.tick), 1);
  assert.ok(seen(game, events).some((e) => e[0] === 'blast' && e[1] === F.ZS_WV_WEB), 'паутина видна');
  // стоит в паутине — жжётся
  const hp = p.hp;
  steps(game, WV_WEB_EVERY * 2);
  assert.ok(p.hp <= hp - WV_WEB_DOT * 2 + 1e-9 && p.hp >= hp - WV_WEB_DOT * 3 - 1e-9, `жжётся: ${hp} → ${p.hp}`);
  // выстрелы под ноги рвут паутину: WV_WEB_HP попаданий
  const input = makeInput();
  input.pitch = -1.45;
  for (let i = 0; i < 240 && webCount(game.horde, game.tick) > 0; i++) {
    input.seq = i + 1;
    input.buttons = i % 2 ? 0 : BTN_FIRE;
    input.viewTick = game.tick;
    game.onInputs(p, [input], 1);
    game.step();
  }
  assert.equal(webCount(game.horde, game.tick), 0, 'порвали выстрелами');
  assert.ok(seen(game, events).some((e) => e[0] === 'blast' && e[1] === F.ZS_WV_TORN), 'порвана — вспышка');
  // и прямым вызовом: ровно WV_WEB_HP попаданий
  const s = setup(1);
  const q = s.players[0];
  place(q, -9, WALL_H, -14.6);
  const w2 = weaver(s.game, 0, -9);
  s.game.step();
  until(s.game, () => w2.state === F.ZS_BOSS_OPEN, 200);
  for (let i = 0; i < WV_WEB_HP - 1; i++) assert.ok(tearWebAt(s.game, s.game.horde, -9.5, WALL_H, -14.2));
  assert.equal(webCount(s.game.horde, s.game.tick), 1, 'ещё держится');
  assert.ok(tearWebAt(s.game, s.game.horde, -9.5, WALL_H, -14.2));
  assert.equal(webCount(s.game.horde, s.game.tick), 0);
  assert.equal(tearWebAt(s.game, s.game.horde, -9.5, WALL_H, -14.2), false, 'больше нечего рвать');
});

test('Ткачиха: хлёст лапами по ходу стены — прыжок не спасает, отойти — спасает', () => {
  for (const away of [false, true]) {
    const { game, players } = setup(1);
    const p = players[0];
    place(p, 10, WALL_H, -14.6);
    const w = weaver(game, 1);
    game.step();
    assert.equal(w.state, F.ZS_WV_SWEEP);
    assert.ok(w.toY > WALL_H && Math.abs(w.toX - 10) < 1e-9, 'метка на ходу стены перед ней');
    const input = makeInput();
    const wind = w.t;
    for (let i = 0; i < wind; i++) {
      input.seq = i + 1;
      input.buttons = !away && i === wind - 12 ? BTN_JUMP : 0;
      game.onInputs(p, [input], 1);
      if (away && i === wind - 5) p.state.x = 3;
      game.step();
    }
    assert.equal(p.hp, away ? 100 : 100 - WV_SWEEP_DMG);
    assert.equal(w.state, F.ZS_BOSS_OPEN);
  }
});

test('Ткачиха: кладка — паучата-липучки у подножия лезут на стену рядом с ней', () => {
  const { game } = setup(1);
  const w = weaver(game, 2);
  game.step();
  assert.equal(w.state, F.ZS_WV_BROOD);
  until(game, () => w.state === F.ZS_BOSS_OPEN, 200);
  const brood = aliveOf(game, F.Z_CLIMBER);
  assert.equal(brood.length, packSize(1));
  for (const b of brood) assert.ok(Math.abs(b.z - (WV_FOOT_Z + 0.6)) < 1 && Math.abs(b.x - 10) < 3, 'у подножия под ней');
  until(game, () => brood.some((b) => b.state === F.ZS_CLIMB || b.state === F.ZS_TOP), 60 * 10);
});

test('Ткачиха в ярости бросает атаку, перелезает через стену во двор, идёт к кристаллу и кусает его', () => {
  const { game, players, events } = setup(1);
  place(players[0], -30, 0, -40);
  const w = weaver(game, 1);
  game.step();
  assert.equal(w.state, F.ZS_WV_SWEEP);
  w.hp = w.maxHp * 0.45;
  game.step();
  assert.equal(w.state, F.ZS_WV_OVER, 'атака брошена — лезет через стену');
  assert.ok(seen(game, events).some((e) => e[0] === 'bossphase' && e[1] === w.id));
  let jump = 0;
  let last = { x: w.x, y: w.y, z: w.z };
  until(game, () => {
    jump = Math.max(jump, Math.hypot(w.x - last.x, w.y - last.y, w.z - last.z));
    last = { x: w.x, y: w.y, z: w.z };
    return w.state !== F.ZS_WV_OVER;
  }, 400);
  assert.ok(jump < 0.5, `перелезает плавно (шаг ${jump.toFixed(2)} м)`);
  assert.ok(weaverInside(w) && !weaverOnWall(w) && w.y === 0 && w.z > -12, 'во дворе');
  const crystal = game.crystal;
  until(game, () => w.state === F.ZS_WV_BITE, 60 * 20);
  assert.ok(Math.abs(w.x) < 0.5 && Math.abs(w.z - WV_IN_Z) < 0.5, 'у постамента');
  until(game, () => w.state === F.ZS_BOSS_OPEN, 200);
  assert.ok(Math.abs(crystal - game.crystal - WV_BITE_CRYSTAL) < 1e-6, 'укус кристалла');
});

// ------------------------------------------------------------ Леший

function leshy(game: FortGame, index: number): Zombie {
  const l = game.horde.spawn(F.Z_LESHY, 1)!;
  Object.assign(l, { x: 0, z: LS_HOME_Z, state: F.ZS_WALK, t: 1, homeX: 0, attackIndex: index });
  return l;
}

test('Леший: корни — метка под человеком на стене, под воротами, под кристаллом (кристаллу — без пролома)', () => {
  const { game, players, events } = setup(1);
  const p = players[0];
  place(p, 3, WALL_H, -14.6);
  const l = leshy(game, 0);
  game.step();
  assert.equal(l.state, F.ZS_LS_ROOTS);
  assert.ok(Math.abs(l.toX - 3) < 1e-9 && l.toY > WALL_H, 'под человеком на стене');
  assert.equal(warnOf(game, events, F.ZS_LS_ROOTS)?.[6], LS_ROOT_R);
  steps(game, F.BOSS_WARN_TICKS - 2);
  assert.equal(p.hp, 100, 'полное предупреждение');
  until(game, () => l.state === F.ZS_BOSS_OPEN, 5);
  assert.equal(p.hp, 100 - LS_ROOT_DMG);
  // под воротами
  const s = setup(1);
  place(s.players[0], -30, 0, 30);
  const g = leshy(s.game, 2);
  s.game.step();
  assert.ok(g.toZ < GATE.face && Math.abs(g.toX) < 1e-9, 'под воротами');
  until(s.game, () => g.state === F.ZS_BOSS_OPEN, 200);
  assert.equal(s.game.gate, F.GATE_HP - LS_ROOT_GATE);
  // под кристаллом — пока ворота целы
  const t = setup(1);
  const c = leshy(t.game, 6);
  t.game.step();
  assert.ok(t.game.gateUp() && Math.abs(c.toX - CRYSTAL.x) < 1e-9 && Math.abs(c.toZ - CRYSTAL.z) < 1e-9, 'под кристаллом');
  until(t.game, () => c.state === F.ZS_BOSS_OPEN, 200);
  assert.equal(t.game.crystal, F.CRYSTAL_HP - LS_ROOT_CRYSTAL);
});

test('Леший: целебная роща лечит армию; набрать урон за каст — колдовство сорвано, Леший открыт', () => {
  for (const interrupt of [false, true]) {
    const { game, players, events } = setup(1);
    const l = leshy(game, 1);
    const grunt = game.horde.spawn(F.Z_WALKER, 1)!;
    Object.assign(grunt, { x: 4, z: LS_HOME_Z + 5, hp: grunt.maxHp * 0.5 });
    game.step();
    assert.equal(l.state, F.ZS_LS_HEAL);
    assert.equal(warnOf(game, events, F.ZS_LS_HEAL)?.[6], LS_HEAL_R);
    if (interrupt) {
      steps(game, 30);
      game.horde.damage(l, (l.maxHp * LS_BREAK) / ARMOR * 1.01, players[0].id, false, l.x, 3, l.z);
      game.step();
      assert.equal(l.state, F.ZS_BOSS_OPEN, 'сорвано — открыт');
      assert.ok(seen(game, events).some((e) => e[0] === 'blast' && e[1] === F.ZS_LS_HEAL && e[5] === 0), 'срыв виден');
      const hp = l.hp;
      game.horde.damage(l, 100, players[0].id, false, l.x, 3, l.z);
      assert.ok(Math.abs(hp - l.hp - 100) < 1e-9, 'в окне брони нет');
    } else {
      until(game, () => l.state !== F.ZS_LS_HEAL, 200);
      assert.ok(Math.abs(grunt.hp - grunt.maxHp * (0.5 + LS_HEAL_FRAC)) < 1e-6, 'армия подлечилась');
      assert.ok(seen(game, events).some((e) => e[0] === 'heal' && e[1] === l.id));
      assert.equal(l.state, F.ZS_WALK, 'докастовал — окна нет');
    }
  }
});

test('Леший: прятки — под землёй неуязвим, вылезает в круге метки с рощей лесовиков, потом открыт', () => {
  const { game, events } = setup(1);
  const l = leshy(game, 3);
  game.step();
  assert.equal(l.state, F.ZS_LS_SINK);
  until(game, () => l.state === F.ZS_LS_UNDER, 200);
  assert.equal(l.y, LS_UNDER_Y);
  const w = warnOf(game, events, F.ZS_LS_UNDER);
  assert.ok(w && w[6] === LS_EMERGE_R && w[3] !== 0, 'метка — где вылезет, на новом месте');
  const hp = l.hp;
  game.horde.areaDamage(l.x, 0.3, l.z, 4, 1e6, 0);
  assert.equal(l.hp, hp, 'взрыв над ним не достаёт');
  const left = l.t;
  assert.ok(left >= F.BOSS_WARN_TICKS - 1, 'полное предупреждение');
  until(game, () => l.state === F.ZS_LS_RISE, 200);
  assert.equal(l.y, 0);
  assert.ok(Math.abs(l.x - (w![3] as number)) < 0.01, 'вылез в круге');
  assert.equal(aliveOf(game, F.Z_SHIELD).length, LS_GROVE_BASE, 'роща лесовиков');
  for (const s of aliveOf(game, F.Z_SHIELD)) assert.ok(s.z > l.z, 'встали перед ним');
  until(game, () => l.state === F.ZS_BOSS_OPEN, 60);
});

test('Леший в ярости: корни дважды подряд — в другую цель, у каждых полная метка', () => {
  const { game, players } = setup(1);
  const p = players[0];
  place(p, 3, WALL_H, -14.6);
  const l = leshy(game, 0);
  l.hp = l.maxHp * 0.4;
  game.step();
  assert.equal(l.stage, 2);
  assert.equal(l.state, F.ZS_LS_ROOTS);
  assert.equal(l.chase, p.id);
  until(game, () => l.t === 1, 200);
  game.step();
  assert.equal(l.state, F.ZS_LS_ROOTS, 'сразу вторые');
  assert.ok(l.chase < 0, 'вторые — под воротами или кристаллом');
  assert.ok(l.t >= F.BOSS_WARN_TICKS - 1);
});

// ------------------------------------------------------------ общее

test('новые боссы: броня вне окна, полный урон в окне; ярость в снимке; радиус метки — в снимке', () => {
  const { game, players } = setup(1);
  for (const kind of NEW) {
    const b = game.horde.spawn(kind, 1)!;
    let hp = b.hp;
    game.horde.damage(b, 100, players[0].id, false, b.x, 2, b.z);
    assert.ok(Math.abs(hp - b.hp - 100 * ARMOR) < 1e-9, `${F.ZK[kind].name}: броня вне окна`);
    b.state = F.ZS_BOSS_OPEN;
    hp = b.hp;
    game.horde.damage(b, 100, players[0].id, false, b.x, 2, b.z);
    assert.ok(Math.abs(hp - b.hp - 100) < 1e-9, `${F.ZK[kind].name}: в окне — полный урон`);
    b.alive = false;
    game.horde.alive--;
  }
  const k = king(game, 0);
  k.hp = k.maxHp * 0.4;
  game.step();
  const snaps: ZombieSnap[] = [];
  const n = game.horde.snap(snaps);
  const s = snaps.slice(0, n).find((z) => z.id === k.id)!;
  assert.ok((s.flags ?? 0) & ZF_RAGE, 'ярость в снимке');
  assert.equal(s.state, F.ZS_PK_SUMMON);
  assert.ok(isTimedState(s.state), 'у метки в снимке есть отсчёт и цель');
  assert.equal(s.r, PK_SUMMON_R);
});

test('Король-Тыква и Леший проходят павшие ворота только по оси и встают во дворе', () => {
  for (const [kind, inZ] of [[F.Z_PUMPKIN, PK_IN_Z], [F.Z_LESHY, LS_IN_Z]] as const) {
    const { game, players, events } = setup(1);
    place(players[0], -30, 0, 30);
    const b = game.horde.spawn(kind, 1)!;
    Object.assign(b, { x: 9, z: -26, state: F.ZS_WALK, t: 1 });
    game.hitGate(99999);
    let worst = 0;
    const ticks = until(game, () => {
      if (b.z > THROAT_Z - 0.5 && b.z < -12.5) worst = Math.max(worst, Math.abs(b.x));
      return Math.abs(b.z - inZ) < 0.4 && Math.abs(b.x) < 0.4;
    }, 60 * 40);
    assert.ok(worst < 0.5, `${F.ZK[kind].name}: в проёме смещение ${worst.toFixed(2)} м`);
    assert.ok(ticks < 60 * 25, `${F.ZK[kind].name}: дошёл за ${(ticks / 60).toFixed(1)} с`);
    assert.ok(seen(game, events).some((e) => e[0] === 'breach' && e[1] === b.id), 'прорыв объявлен');
  }
});

test('новые боссы не застревают: без людей, ворота стоят, потом падают — что-то меняется хотя бы раз в 6 с, сам во дворе', () => {
  for (const kind of NEW) {
    const { game } = setup(0);
    const b = game.horde.spawn(kind, 1)!;
    let last = { x: b.x, y: b.y, z: b.z, st: b.state, at: 0 };
    let worst = 0;
    let inside = -1;
    for (let i = 0; i < 60 * 100 && game.phase === F.FT_WAVE; i++) {
      if (i === 60 * 30) game.hitGate(99999);
      game.step();
      if (!b.alive) break;
      if (Math.hypot(b.x - last.x, b.y - last.y, b.z - last.z) > 0.2 || b.state !== last.st) last = { x: b.x, y: b.y, z: b.z, st: b.state, at: i };
      worst = Math.max(worst, i - last.at);
      if (inside < 0 && b.y > -1 && b.z > -12) inside = i;
    }
    assert.ok(worst < 60 * 6, `${F.ZK[kind].name}: стоял без дела ${(worst / 60).toFixed(1)} с`);
    assert.ok(inside > 60 * 30 && inside < 60 * 75, `${F.ZK[kind].name}: ворота пали — сам во дворе (${(inside / 60).toFixed(1)} с)`);
    assert.ok(game.crystal < F.CRYSTAL_HP, `${F.ZK[kind].name}: кристаллу достаётся`);
  }
});

test('детерминизм: тот же забег — те же шаги боссов, урон и подкрепления', () => {
  const trace = (): string => {
    const { game, players } = setup(2);
    (game.horde as unknown as { rng: () => number }).rng = makeRng(77);
    place(players[0], 9, WALL_H, -14.6);
    place(players[1], -3, WALL_H, -14.6);
    const bosses = NEW.map((kind, i) => {
      const b = game.horde.spawn(kind, 1)!;
      Object.assign(b, { x: (i - 1) * 10, z: -40 });
      return b;
    });
    const out: string[] = [];
    for (let i = 0; i < 60 * 45; i++) {
      if (i === 60 * 25) game.hitGate(99999);
      game.step();
      if (i % 30 === 0) {
        out.push(bosses.map((b) => `${b.state}:${b.x.toFixed(3)},${b.y.toFixed(3)},${b.z.toFixed(3)}:${b.hp.toFixed(1)}`).join('|')
          + `#${game.gate.toFixed(1)},${game.crystal.toFixed(1)},${game.horde.alive},${players.map((p) => p.hp.toFixed(1)).join(',')}`);
      }
    }
    return out.join('\n');
  };
  const a = trace();
  assert.equal(trace(), a);
  assert.ok(a.includes(`${F.ZS_PK_ROLL}:`) || a.includes(`${F.ZS_PK_SUMMON}:`), 'Король атаковал');
});
