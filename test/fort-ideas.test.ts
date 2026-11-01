import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { EYE_HEIGHT, TICK_RATE, TRAMPOLINE_VELOCITY } from '../shared/constants.ts';
import { FT_BREAK, FT_END, FT_WAVE, Z_BRUTE, Z_WALKER, ZK, type FortEvent } from '../shared/fort.ts';
import { F50_BOSSES, f50Wave, holeCenter, USE_STONE, USE_WALL_FIX, WALL_SECTIONS, STONE_FALL_TICKS, wallFixPrice } from '../shared/fort50.ts';
import { CRAFT_MASON, CRAFTS, CRAB_HITS, CRAB_JACKPOT, crabGold, RACK, TRAMP_SPOTS, trampPrice, USE_CARD, USE_CRAFT, USE_TRAMP, Z_GOLDCRAB } from '../shared/fortideas.ts';
import { gunMag, gunIntervalQ, gunReload, loadoutOf, ACT_GATE, ACT_CRYSTAL, ACT_TOWER, gateRows, crystalRows, towerRows, GUNS } from '../shared/fortarsenal.ts';
import { FT_STRIDE, zombieRay } from '../shared/fortaim.ts';
import { REPAIR_WORK_TICKS, Z_BATTERY, ZS_SIEGE_WINDUP, BATTERY_FLIGHT_TICKS, BATTERY_GATE_DAMAGE } from '../shared/fortsiege.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { makeEvents, makeInput, makeState, stepPlayer, BTN_ADS } from '../shared/sim.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { FortGame, type FortHooks, type FortPlayer } from '../server/fort/game.ts';

function setup(count = 1, hooks: FortHooks = { fort50: true, ideas: true, elite: true }) {
  const messages: ServerMsg[][] = [], events: FortEvent[] = [], bins: Uint8Array[] = [];
  const now = Date.now;
  Date.now = () => 1700000000000;
  let g: FortGame;
  const players: FortPlayer[] = [];
  try {
    g = new FortGame(hooks);
    for (let i = 0; i < count; i++) {
      const ms: ServerMsg[] = []; messages.push(ms);
      players.push(g.addHuman({ pid: i + 1, nick: `Tester${i + 7}`, outfit: DEFAULT_OUTFIT }, {
        sendJson(m) { ms.push(m); }, sendBinary(b) { bins.push(new Uint8Array(b)); }, close() {},
      })!);
    }
  } finally { Date.now = now; }
  const event = g!.event.bind(g!);
  g!.event = (e) => { events.push(e); event(e); };
  g!.debug = true;
  return { g: g!, p: players[0], players, messages, events, bins };
}
function craft(g: FortGame, p: FortPlayer, c: number) {
  Object.assign(p.state, { x: RACK.x, y: 0, z: RACK.z });
  g.use(p, USE_CRAFT + c);
}
function ticks(g: FortGame, n: number) { for (let i = 0; i < n; i++) g.step(); }
function completeBoss(g: FortGame, w = 5) {
  g.wave = w; g.phase = FT_WAVE; g.horde.clear(); g.step();
}
function shoot(g: FortGame, p: FortPlayer, yaw = 0, pitch = 0) {
  const inp = { ...makeInput(), yaw, pitch, viewTick: g.tick, buttons: BTN_ADS };
  p.ev.aimYaw = yaw; p.ev.aimPitch = pitch; p.ev.spread = 0;
  p.state.shots++;
  g.arsenal.fire(p, inp);
}

test('без флагов сохраняются исходные сообщения и бинарный снимок; fideas нет', () => {
  const { g, p, messages, bins } = setup(1, { fort50: true, ideas: false, elite: false });
  craft(g, p, 1);
  ticks(g, 10);
  assert(!messages[0].some((m) => m.t === 'fideas'));
  const digest = createHash('sha256').update(JSON.stringify(messages)).update(Buffer.concat(bins)).digest('hex');
  assert.equal(digest, '93df7787861c4fe5465bedfbbc16d6c597b20ed71b881d2c4da45dfaa7bc036a');
  const off = setup(1, { fort50: false, ideas: true, elite: true });
  assert(!off.messages[0].some((m) => m.t === 'fideas'));
});

test('ремесло: вешалка, отказ в волну, шапка, скидка стены и сохранение при возврате', () => {
  const { g, p, events } = setup(2);
  g.phase = FT_BREAK; g.phaseEnd = 1e8;
  craft(g, p, CRAFT_MASON);
  assert.equal(p.outfit.h, CRAFTS[0].hat);
  const sec = WALL_SECTIONS.findIndex((s) => s.id === 'w2');
  const at = holeCenter(sec);
  Object.assign(p.state, { x: at.x, y: 0, z: at.z });
  p.run.arsenal.gold = 1000;
  g.walls.setPercent(sec, 0); g.use(p, USE_WALL_FIX + sec);
  assert.equal(p.run.arsenal.gold, 1000 - Math.round(wallFixPrice(1) * .7));
  g.phase = FT_WAVE; craft(g, p, 2);
  assert.equal(p.outfit.h, CRAFTS[0].hat);
  assert(events.some((e) => e[0] === 'anope' && e[2] === USE_CRAFT + 2));
  g.removePlayer(p.id);
  assert.deepEqual(p.outfit, DEFAULT_OUTFIT);
  const back = g.addHuman({ pid: p.pid, nick: p.name, outfit: DEFAULT_OUTFIT }, p.sink)!;
  assert.equal(back.outfit.h, CRAFTS[0].hat);
  g.newGame(); assert.deepEqual(back.outfit, DEFAULT_OUTFIT);
  craft(g, back, 2); g.phase = FT_WAVE; g.command(back, '/lose');
  assert.equal(g.phase, FT_END); assert.deepEqual(back.outfit, DEFAULT_OUTFIT);
});

test('полный расчёт умножает начисления лишь пока все четыре ремесла в крепости', () => {
  const { g, players, messages } = setup(4);
  players.forEach((p, i) => craft(g, p, i + 1));
  const before = players[0].run.arsenal.gold;
  g.arsenal.giveGold(players[0], 100, 0, 0, 0);
  assert.equal(players[0].run.arsenal.gold - before, 110);
  assert(messages[0].some((m) => m.t === 'fideas' && m.full));
  g.removePlayer(players[3].id);
  g.arsenal.giveGold(players[0], 100, 0, 0, 0);
  assert.equal(players[0].run.arsenal.gold - before, 210);
});

test('после босса: личные голоса, смена голоса, колокол ждёт и выбирается общая карточка', () => {
  const { g, players, messages, events } = setup(2);
  completeBoss(g);
  const m = messages[0].findLast((m) => m.t === 'fideas');
  assert(m?.t === 'fideas' && m.vote && m.vote.ids.length === 3);
  const end = g.phaseEnd;
  const bell = g.map.stations.find((s) => s.kind === 'bell')!;
  for (const p of players) { Object.assign(p.state, bell); g.use(p, bell.id); }
  assert.equal(g.phaseEnd, end);
  g.use(players[0], USE_CARD); g.use(players[0], USE_CARD + 1);
  const mine = messages[0].findLast((m) => m.t === 'fideas');
  const other = messages[1].findLast((m) => m.t === 'fideas');
  assert(mine?.t === 'fideas' && mine.vote?.mine === 1);
  assert(other?.t === 'fideas' && other.vote?.mine === -1);
  g.use(players[1], USE_CARD + 1);
  assert(events.some((e) => e[0] === 'card' && e[1] === m.vote!.ids[1]));
});

test('ничья детерминирована сидом; golden в десятой, карточки не повторяются', () => {
  const run = () => {
    const { g, players, messages } = setup(2);
    completeBoss(g);
    g.use(players[0], USE_CARD); g.use(players[1], USE_CARD + 1);
    const m = messages[0].findLast((m) => m.t === 'fideas');
    assert(m?.t === 'fideas');
    completeBoss(g, 10);
    const next = messages[0].findLast((m) => m.t === 'fideas');
    assert(next?.t === 'fideas' && next.vote);
    assert(!next.vote.ids.includes(m.taken[0]));
    assert(next.vote.ids.some((id) => ['goldtowers', 'squall', 'stonewalls', 'grenadebox'].includes(id)));
    return m.taken;
  };
  assert.deepEqual(run(), run());
});

test('stones удваивает камень со стены', () => {
  const run = (card: boolean) => {
    const { g, p } = setup();
    if (card) g.ideas.take('stones');
    const sec = 0, s = WALL_SECTIONS[sec];
    const z = g.horde.spawn(Z_BRUTE, 0)!;
    Object.assign(z, { x: s.nx ? s.face + s.nx : s.stack[0], y: 0, z: s.nz ? s.face + s.nz : s.stack[2], hp: 1e6, maxHp: 1e6 });
    Object.assign(p.state, { x: s.stack[0], y: s.stack[1], z: s.stack[2] });
    g.use(p, USE_STONE + sec);
    g.tick += STONE_FALL_TICKS; g.walls.step();
    return 1e6 - z.hp;
  };
  assert.equal(run(true), run(false) * 2);
});

test('краб: одна подходящая волна в пятёрке, 30 выстрелов дают джекпот всем и не держат волну', () => {
  const { g, p, players, events } = setup(2);
  assert.equal(g.ideas.crab.waves.length, 10);
  for (let i = 0; i < 10; i++) {
    const w = g.ideas.crab.waves[i];
    assert(w >= i * 5 + 1 && w <= i * 5 + 5 && w !== 1 && !F50_BOSSES[w] && !f50Wave(w).event);
  }
  g.wave = 3; g.command(p, '/crab');
  const crab = g.horde.zombies.find((z) => z.alive && z.kind === Z_GOLDCRAB)!;
  assert(crab); assert.equal(g.horde.left, 0); assert(g.horde.cleared);
  Object.assign(crab, { x: 0, y: 0, z: -35 });
  Object.assign(p.state, { x: 0, y: .45 - EYE_HEIGHT, z: -30 });
  const hp = crab.hp;
  g.horde.areaDamage(0, 0, -35, 10, 1e12, p.id); assert.equal(crab.hp, hp);
  const before = players.map((p) => p.run.arsenal.gold);
  for (let i = 0; i < CRAB_HITS; i++) shoot(g, p);
  const expected = crabGold(3, g.goldMul) * (CRAB_HITS + CRAB_JACKPOT);
  players.forEach((p, i) => assert.equal(p.run.arsenal.gold - before[i], expected));
  assert(!crab.alive); assert.equal(p.kills, 0);
  assert(events.some((e) => e[0] === 'crab' && e[1] === 'caught'));
  assert(events.some((e) => e[0] === 'zdie' && e[1] === crab.id));
});

test('батут: списание, коллизия, импульс 13.2; набережный тип 1 прежний', () => {
  const { g, p } = setup();
  const spot = TRAMP_SPOTS[0];
  Object.assign(p.state, { x: spot.x, y: 0, z: spot.z });
  p.run.arsenal.gold = 1000;
  g.use(p, USE_TRAMP);
  assert.equal(p.run.arsenal.gold, 1000 - trampPrice(0));
  const box = g.map.trampBoxes![0];
  assert.equal(g.world.tramp[box], 2);
  const bounce = () => {
    const s = makeState(), ev = makeEvents();
    Object.assign(s, { x: spot.x, y: .42, z: spot.z, vy: -1 });
    stepPlayer(s, makeInput(), g.world, false, 1, ev);
    assert(ev.bounced); return s.vy;
  };
  assert.equal(bounce(), 13.2);
  g.world.tramp[box] = 1; assert.equal(bounce(), TRAMPOLINE_VELOCITY);
  g.newGame(); assert(!g.world.overlaps(spot.x - .1, .1, spot.z - .1, spot.x + .1, .3, spot.z + .1));
});

test('слабое место Бугая: сзади ×2.5 со stagger; спереди сквозь тело обычное', () => {
  const run = (back: boolean) => {
    const { g, p, events } = setup();
    const z = g.horde.spawn(Z_BRUTE, 1)!;
    Object.assign(z, { x: 0, y: 0, z: -35, yaw: 0, hp: 1000 });
    // Прицел камеры ADS смещён на 0.5 вправо и 0.18 вверх от глаз: направляем его именно в бочонок.
    Object.assign(p.state, { x: back ? -.5 : .5, y: 1.5 - EYE_HEIGHT - .18, z: back ? -30 : -40 });
    shoot(g, p, back ? 0 : Math.PI);
    return { damage: 1000 - z.hp, weak: events.some((e) => e[0] === 'weak') };
  };
  const back = run(true), front = run(false);
  assert.equal(front.weak, false); assert.equal(back.weak, true);
  assert.equal(back.damage, front.damage * 2.5);
});

test('чемпион замедляет орду до 30%, история пишется каждый тик, повтор через 2 с не срабатывает', () => {
  const run = (slow: boolean) => {
    const { g, p, events } = setup();
    g.phase = FT_WAVE;
    const z = g.horde.spawn(Z_WALKER, 1)!;
    Object.assign(z, { x: 0, y: 0, z: -45 });
    if (slow) g.horde.kill(g.horde.spawn(Z_WALKER, 1, 1, 2)!, p.id);
    ticks(g, 90);
    const out = { x: 0, y: 0, z: 0 };
    assert(g.horde.sample(z, g.tick - 1, out));
    const distance = z.z + 45;
    if (slow) {
      ticks(g, 30); g.horde.kill(g.horde.spawn(Z_WALKER, 1, 1, 2)!, p.id);
      assert.equal(events.filter((e) => e[0] === 'slow').length, 1);
    }
    return distance;
  };
  const ratio = run(true) / run(false);
  assert(Math.abs(ratio - .3) < .04, `ratio ${ratio}`);
});

test('элитный хитбокс растёт вместе с моделью, обычный луч на 1.1 hrx проходит мимо', () => {
  const tg = new Float64Array(FT_STRIDE);
  tg[3] = Z_WALKER;
  const x = ZK[Z_WALKER].hrx * 1.1;
  assert(zombieRay(x, 1, 5, 0, 0, -1, tg, 0, 1.5) >= 0);
  assert(zombieRay(x, 1, 5, 0, 0, -1, tg, 0) < 0);
});

test('оружие: итоговые магазины и интервалы из ArsenalRow действуют в общем предсказании', () => {
  const { g, p } = setup();
  g.ideas.take('mag'); g.ideas.take('squall');
  const load = loadoutOf(g.arsenal.row(p), { heavy: 0, mag: 0, rate: 0 });
  for (let gun = 0; gun < GUNS.length; gun++) {
    assert.equal(gunMag(gun, load.mag), Math.round(GUNS[gun].mag * 1.3));
    assert.equal(gunIntervalQ(gun, load.rate), Math.round(GUNS[gun].interval * 4 * .8));
    assert.equal(gunReload(gun, load.rate), GUNS[gun].reload);
  }
});

test('ремонт: скидки перемножаются и совпадают с панелями; Каменщик ускоряет общую работу ворот', () => {
  const { g, p, players } = setup(2);
  craft(g, players[1], CRAFT_MASON);
  g.ideas.take('repair');
  const st = g.map.stations.find((s) => s.kind === 'gate')!;
  for (const q of players) { Object.assign(q.state, { x: st.x, y: st.y, z: st.z }); q.run.arsenal.gold = 1000; }
  g.phase = FT_WAVE; g.gate = 100;
  const team = { wave: g.force, calm: false, gold: 1000, gate: g.gate, gateTier: 0, crystal: 1, crystalTier: 0 };
  const mason = g.arsenal.row(players[1]);
  assert.equal(gateRows({ ...team, repairMul: mason.repairMul })[0].price, Math.round(48 * .7 * .7));
  assert.equal(crystalRows({ ...team, repairMul: mason.repairMul })[0].price, Math.round(72 * .7 * .7));
  g.use(p, ACT_GATE); g.use(players[1], ACT_GATE);
  for (let i = 0; i < REPAIR_WORK_TICKS * .6; i++) { g.tick++; g.arsenal.step(); }
  assert(g.gate > 100);
  assert.equal(p.run.arsenal.gold, 1000 - Math.round(48 * .7));
  assert.equal(players[1].run.arsenal.gold, 1000);
});

test('немедленные карточки: кристалл, целые усиленные стены, гранаты; повтор не усиливает снова', () => {
  const { g, p } = setup();
  g.crystal = 100;
  const old = g.arsenal.crystalMax;
  g.ideas.take('crystal'); assert.equal(g.crystal, 100 + old * .2); assert.equal(g.arsenal.crystalMax, old * 1.2);
  g.walls.setPercent(0, 0); const wall = g.walls.max[0];
  g.ideas.take('stonewalls'); assert.equal(g.walls.hp[0], wall * 1.3);
  g.ideas.take('stonewalls'); assert.equal(g.walls.max[0], wall * 1.3);
  craft(g, p, 3); g.ideas.take('grenadebox'); assert.equal(p.run.arsenal.gr, 6);
  g.ideas.take('bandage'); p.hp = 10; g.ideas.startWave(); assert.equal(p.hp, 60);
  g.newGame(); assert.equal(g.arsenal.crystalMax, old); assert.equal(g.arsenal.grenadeMax(p), 3);
});

test('краб продолжает бег в передышке, ныряет и исчезает без zdie', () => {
  const { g, p, events } = setup();
  g.command(p, '/crab');
  const crab = g.horde.zombies.find((z) => z.alive && z.kind === Z_GOLDCRAB)!;
  g.phase = FT_BREAK; g.phaseEnd = 100000;
  ticks(g, 19 * TICK_RATE); assert(crab.alive); assert(crab.y <= 0); assert.equal(crab.state, 75);
  ticks(g, TICK_RATE); assert(!crab.alive);
  assert(events.some((e) => e[0] === 'crab' && e[1] === 'gone'));
  assert(!events.some((e) => e[0] === 'zdie' && e[1] === crab.id));
});

test('голосование без голосов истекает в передышке; выход убирает голос и завершает выбор оставшихся', () => {
  const { g, p, players, messages } = setup(2);
  completeBoss(g);
  g.use(p, USE_CARD + 1); g.removePlayer(players[1].id);
  assert.equal(g.ideas.vote, null); assert.equal(g.ideas.taken.length, 1);
  completeBoss(g, 10);
  const v = g.ideas.vote!; const ids = [...v.ids];
  g.tick = v.end - 1; g.step();
  assert.equal(g.phase, FT_BREAK); assert.equal(g.ideas.vote, null);
  assert(ids.includes(g.ideas.taken[1]));
  assert(messages[0].some((m) => m.t === 'fideas' && m.vote === null && m.taken.length === 2));
});

test('панели и покупки: личная скидка башни, ремонт кристалла; Канонир и карточка умножают урон башни', () => {
  const { g, p } = setup();
  craft(g, p, 2); p.run.arsenal.gold = 1000;
  const tower = g.map.stations.find((s) => s.kind === 'tower' && s.arg === 0)!;
  Object.assign(p.state, { x: tower.x, y: tower.y, z: tower.z });
  const price = towerRows(0, -1, 0, 1000, 1, g.arsenal.row(p).towerPriceMul)[0].price;
  assert.equal(price, 255); g.use(p, ACT_TOWER); assert.equal(p.run.arsenal.gold, 1000 - price);
  g.ideas.take('goldtowers'); g.ideas.take('towers'); g.phase = FT_WAVE;
  const z = g.horde.spawn(Z_BRUTE, 1)!;
  Object.assign(z, { x: -4.9, y: 0, z: -25, hp: 1000 });
  g.arsenal.towers[0].cd = 0; g.arsenal.step();
  assert(Math.abs((1000 - z.hp) - 45 * 1.15 * 1.5) < 1e-8);
  assert.equal(g.arsenal.towers[0].cd, 46 * .8);
  g.phase = FT_BREAK; craft(g, p, 1); g.ideas.take('repair'); g.crystal = 100;
  const st = g.map.stations.find((s) => s.kind === 'crystal')!;
  Object.assign(p.state, { x: st.x, y: st.y, z: st.z });
  const before = p.run.arsenal.gold; g.use(p, ACT_CRYSTAL);
  assert.equal(before - p.run.arsenal.gold, Math.round(72 * .49));
});

test('замедление задерживает уже выпущенный снаряд осады, фаза и шаги игроков остаются обычными', () => {
  const { g, p, events } = setup();
  g.phase = FT_WAVE;
  const b = g.horde.spawn(Z_BATTERY, 1)!;
  Object.assign(b, { x: -10, z: -30, state: ZS_SIEGE_WINDUP, t: 2, chase: -1, toX: 0, toY: 1.5, toZ: -16 });
  ticks(g, 2);
  assert(events.some((e) => e[0] === 'throw'));
  const gate = g.gate;
  g.horde.kill(g.horde.spawn(Z_WALKER, 1, 1, 2)!, p.id);
  ticks(g, BATTERY_FLIGHT_TICKS);
  assert.equal(g.gate, gate);
  ticks(g, 90 + BATTERY_FLIGHT_TICKS);
  assert(g.gate <= gate - BATTERY_GATE_DAMAGE);
});
