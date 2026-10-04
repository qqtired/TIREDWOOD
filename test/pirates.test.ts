// «Набег пиратов»: правила (shared/pirates.ts) и ход события на сервере (server/lobby/pirates.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WATER_Y } from '../shared/constants.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import type { GameMap } from '../shared/maps/types.ts';
import { makeState } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';
import * as P from '../shared/pirates.ts';
import type { EventPlayer, EventStats } from '../server/lobby/events.ts';
import { Pirates } from '../server/lobby/pirates.ts';
import { PirateNav } from '../server/lobby/piratenav.ts';

/** Один и тот же «случай» каждый запуск */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

interface Award { pid: number; tokens: number; stats: EventStats }
type Inner = {
  v: P.PirateView; pirates: Array<{ id: number; x: number; z: number; hp: number; aboard: boolean; captain: boolean; loot: number; loot2: number; st: number }>;
  boats: Array<{ id: number; dock: number; d: number; since: number; x: number; z: number; vx: number; vz: number; hp: number; st: number; cargo: number[] }>;
  items: Array<{ id: number; st: number; x: number; z: number }>; launches: Array<{ at: number; dock: number; crew: number; captain: boolean }>;
};

function setup(opts: { n?: number; map?: GameMap; seed?: number } = {}) {
  const n = opts.n ?? 2;
  const players: EventPlayer[] = Array.from({ length: n }, (_, i) => ({ pid: i + 1, slot: i + 1, nick: `P${i + 1}`, eligible: true, state: makeState() }));
  const log = { views: [] as P.PirateView[], snaps: [] as P.PirateSnapMsg[], fx: [] as P.PirateFx[], chat: [] as string[], awards: [] as Award[] };
  const map = opts.map ?? buildLobby();
  const raid = new Pirates({
    players: () => players,
    award: (pid, tokens, stats) => log.awards.push({ pid, tokens, stats }),
    chat: t => log.chat.push(t),
    view: v => log.views.push(v), snap: m => log.snaps.push(m), fx: m => log.fx.push(...m.e),
  }, map, new CollisionWorld(map), lcg(opts.seed ?? 7));
  let tick = 0;
  const api = {
    raid, players, log, map, inner: raid as unknown as Inner,
    get tick() { return tick; },
    /** Идём тик за тиком, пока не выполнится условие (или не выйдет срок) */
    until(cond: () => boolean, max = P.PIRATE_LIMIT + P.PIRATE_WARN + 600): boolean {
      for (let i = 0; i < max; i++) {
        if (cond()) return true;
        raid.step(++tick);
      }
      return cond();
    },
    go(ticks: number): void { for (let i = 0; i < ticks; i++) raid.step(++tick); },
    /** Событие сразу с началом набега */
    begin(): void { raid.start(tick, 'raid:test'); api.until(() => raid.view().phase === 'raid'); },
    /** Выстрел защитника; эффекты уходят клиентам со следующим тиком, поэтому шагаем один тик и возвращаем последний эффект вида kind */
    shoot(pid: number, aim: { yaw: number; pitch: number }, kind: string): { ok: boolean; fx: P.PirateFx | undefined } {
      const ok = raid.fire(pid, { ...aim, viewTick: tick });
      api.go(1);
      return { ok, fx: log.fx.filter(e => e[0] === kind).at(-1) };
    },
    stand(i: number, x: number, z: number, y = 0): void { Object.assign(players[i].state, { x, y, z }); },
  };
  return api;
}

/** Взгляд игрока, чтобы центр экрана (над плечом) пришёлся в точку */
function aimAt(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): { yaw: number; pitch: number } {
  let yaw = P.yawOf(to.x - from.x, to.z - from.z), pitch = 0;
  for (let i = 0; i < 4; i++) {
    const o = P.aimOrigin(from.x, from.y, from.z, yaw);
    yaw = P.yawOf(to.x - o.x, to.z - o.z);
    pitch = Math.atan2(to.y - o.y, Math.hypot(to.x - o.x, to.z - o.z));
  }
  return { yaw, pitch };
}

const open = (): GameMap => ({ ...buildLobby(), boxes: [] });

// ---------------------------------------------------------------- правила

test('волны и корабль: состав ограничен и растёт с числом защитников, капитан только в последней волне', () => {
  for (let wave = 1; wave <= P.PIRATE_WAVES; wave++) {
    for (let n = 1; n <= 12; n++) {
      const w = P.wavePlan(wave, n);
      assert.ok(w.boats >= 1 && w.boats <= 3, `шлюпок ${w.boats}`);
      assert.equal(w.crew.length, w.boats);
      assert.ok(w.crew.every(c => c >= 2 && c <= 3), `экипаж ${w.crew}`);
      assert.equal(w.captain, wave === P.PIRATE_WAVES);
      if (w.captain) assert.ok(w.crew[0] >= 3);
    }
  }
  const sum = (wave: number, n: number): number => P.wavePlan(wave, n).crew.reduce((a, b) => a + b, 0);
  assert.ok(sum(2, 1) < sum(2, 3) && sum(2, 3) <= sum(2, 6), 'толпе — больше пиратов');
  assert.equal(P.shipHpMax(1), 11);
  assert.ok(P.shipHpMax(2) > P.shipHpMax(1) && P.shipHpMax(100) === P.shipHpMax(8), 'прочность растёт, но не бесконечно');
});

test('награды: только за заслуги, один раз, никаких списаний; победа и лучший защитник — больше', () => {
  const none = { kos: 0, sinks: 0, hits: 0, saves: 0 };
  for (const win of [true, false]) for (const mvp of [true, false]) assert.equal(P.pirateReward(none, win, mvp), 0, 'кто ничего не делал — не получает');
  const one = { kos: 1, sinks: 0, hits: 0, saves: 0 };
  assert.equal(P.pirateReward(one, false, false), 2 + P.PIRATE_REWARD_LOSS);
  assert.equal(P.pirateReward(one, true, false), 2 + P.PIRATE_REWARD_WIN);
  assert.equal(P.pirateReward(one, true, true), 2 + P.PIRATE_REWARD_WIN + P.PIRATE_REWARD_MVP);
  assert.equal(P.pirateReward({ kos: 99, sinks: 99, hits: 99, saves: 99 }, true, true), P.PIRATE_REWARD_CAP + P.PIRATE_REWARD_WIN + P.PIRATE_REWARD_MVP, 'заслуги ограничены');
  assert.ok(P.contribution({ kos: 0, sinks: 1, hits: 0, saves: 0 }) > P.contribution({ kos: 1, sinks: 0, hits: 0, saves: 0 }), 'шлюпка весомее пирата');
});

test('прицел над плечом: точка на центральном луче камеры и один и тот же расчёт пушки у сервера и клиента', () => {
  const o0 = P.aimOrigin(10, 0, 20, 0), o1 = P.aimOrigin(10, 0, 20, Math.PI / 2);
  assert.ok(Math.abs(o0.x - 10.7) < 1e-9 && o0.z === 20, 'при взгляде на север плечо справа');
  assert.ok(Math.abs(o1.x - 10) < 1e-9 && Math.abs(o1.z - 19.3) < 1e-9);
  assert.ok(o0.y > 1 && o0.y < 2);
  // шлюпка на воде: кружок прицела ведёт на неё, ядро летит ровно в точку с упреждением
  const cannon = P.PIRATE_CANNONS[1], me = { x: cannon.x, y: 0, z: cannon.z + 0.8 };
  const boat = { id: 5, x: 6, z: 32, vx: 0, vz: 0 };
  const aim = aimAt(me, { x: boat.x, y: WATER_Y + 0.4, z: boat.z });
  const o = P.aimOrigin(me.x, me.y, me.z, aim.yaw), shot = P.cannonSolve(cannon.x, cannon.z, o.x, o.y, o.z, aim.yaw, aim.pitch, [boat], true, P.makeShot());
  assert.equal(shot.ok, true);
  assert.equal(shot.kind, P.SK_BOAT);
  assert.equal(shot.boat, 5);
  assert.ok(Math.hypot(shot.x - boat.x, shot.z - boat.z) < 0.01);
  assert.ok(shot.ticks >= 40 && shot.ticks < 120);
  // борт корабля, обращённый к причалам
  const toShip = aimAt(me, { x: P.PIRATE_SHIP.x, y: 2, z: P.PIRATE_SHIP.z - P.PIRATE_SHIP.az });
  const o2 = P.aimOrigin(me.x, me.y, me.z, toShip.yaw), hit = P.cannonSolve(cannon.x, cannon.z, o2.x, o2.y, o2.z, toShip.yaw, toShip.pitch, [], true, P.makeShot());
  assert.equal(hit.kind, P.SK_SHIP);
  assert.equal(P.cannonSolve(cannon.x, cannon.z, o2.x, o2.y, o2.z, toShip.yaw, toShip.pitch, [], false, P.makeShot()).kind, P.SK_WATER, 'уходящий корабль не цель');
  // ядро на причал не падает: стрелять под ноги незачем
  const down = P.cannonSolve(cannon.x, cannon.z, o2.x, o2.y, o2.z, 0, -0.6, [], true, P.makeShot());
  assert.equal(down.ok, false);
});

test('причалы, кучи и пушки: ходовая зона найдена, пути от каждого причала к каждой куче есть', () => {
  const map = buildLobby(), nav = new PirateNav(map);
  for (const home of P.PIRATE_LOOT_HOME) assert.ok(nav.isFree(home.x, home.z) || nav.nearest(home.x, home.z), `куча ${home.x};${home.z}`);
  for (const d of P.PIRATE_DOCKS) assert.ok(nav.isFree(d.exitX, d.exitZ), `выход с причала ${d.x}`);
  const out = { x: 0, z: 0 };
  for (const d of P.PIRATE_DOCKS) for (const pile of P.PIRATE_PILES) {
    let x = d.exitX, z = d.exitZ, steps = 0;
    while (Math.hypot(x - pile.x, z - pile.z) > 0.8 && steps++ < 400) {
      // next даёт ближайшую точку пути; шаг — полметра, как у пирата за несколько тиков
      nav.next(x, z, pile.x, pile.z, out);
      const dx = out.x - x, dz = out.z - z, len = Math.hypot(dx, dz) || 1, k = Math.min(1, 0.5 / len);
      x += dx * k; z += dz * k;
    }
    assert.ok(steps < 400, `от причала ${d.x} до кучи ${pile.x} дойти нельзя`);
  }
  assert.ok(P.PIRATE_ROUTES.every((r, i) => Math.hypot(r.pts[r.pts.length - 2] - P.PIRATE_DOCKS[i].x, r.pts[r.pts.length - 1] - P.PIRATE_DOCKS[i].z) < 0.01), 'маршрут кончается на своём причале');
});

test('корабль приходит с горизонта, встаёт на якорь бортом к набережной и после набега уходит; без события корабля нет', () => {
  const buf: P.ShipPose = { x: 0, z: 0, yaw: 0, speed: 0, anchored: 0, turn: 0, flee: 0 };
  const at = (v: Pick<P.PirateView, 'phase' | 't0' | 'fleeAt'>, tick: number): P.ShipPose & { on: boolean } => ({ on: P.shipPose(v, tick, buf), ...buf });
  assert.equal(at({ phase: 'idle', t0: 0, fleeAt: 0 }, 100).on, false);
  const v = { phase: 'warn' as const, t0: 1000, fleeAt: 0 };
  assert.equal(at(v, 900).on, false, 'до анонса — нет');
  const far = at(v, 1000 + 60);
  assert.equal(far.on, true);
  assert.ok(far.z > 100 && far.speed > 1 && far.anchored === 0, 'идёт издалека');
  const near = at(v, 1000 + P.PIRATE_SAIL);
  assert.equal(near.on, true);
  assert.ok(near.anchored === 1 && Math.abs(near.x - P.PIRATE_SHIP.x) < 1e-9 && Math.abs(near.z - P.PIRATE_SHIP.z) < 1e-9 && near.speed === 0, 'встал на якорь на своём месте');
  const flee = { phase: 'end' as const, t0: 1000, fleeAt: 5000 };
  const before = at(flee, 4999);
  assert.ok(before.on && before.anchored === 1 && before.flee === 0, 'пока не ушёл — стоит');
  const gone = at(flee, 5000 + P.PIRATE_FLEE_TICKS);
  assert.ok(gone.on && gone.flee === 1 && gone.z > 150, 'уходит в море');
  assert.equal(at(flee, 5000 + P.PIRATE_FLEE_TICKS * 2).on, false, 'скрылся за горизонтом');
});

// ---------------------------------------------------------------- ход события

test('анонс: «на горизонте», 30 секунд до высадки, потом набег; закрытый вид события без игроков не наказывает никого', () => {
  const t = setup({ n: 1 });
  t.raid.start(0, 'raid:1');
  assert.equal(t.raid.view().phase, 'warn');
  assert.equal(t.raid.active, true);
  assert.match(t.log.chat[0], /Пираты на горизонте/);
  assert.equal(t.raid.fire(1, { yaw: 0, pitch: 0, viewTick: 0 }), false, 'в анонс стрелять не во что');
  t.until(() => t.raid.view().phase === 'raid');
  assert.equal(t.tick, P.PIRATE_WARN);
  const v = t.raid.view();
  assert.equal(v.hpMax, P.shipHpMax(1));
  assert.equal(v.hp, v.hpMax);
  assert.equal(v.wave, 1);
  assert.equal(v.total, P.PIRATE_LOOT);
  assert.equal(v.left, P.PIRATE_LOOT);
  assert.equal(v.stolen, 0);
  t.raid.start(t.tick, 'raid:again');
  assert.equal(t.raid.view().id, 'raid:test'.length ? 'raid:1' : '', 'второй старт посреди набега не сбрасывает его');
});

test('никто не защищает: пираты утаскивают добычу, набег проигран, наград нет, и всё честно заканчивается', () => {
  const t = setup({ n: 2 });
  t.raid.start(0, 'raid:lose');
  let maxPirates = 0, maxBoats = 0, loot = 0;
  t.until(() => {
    for (const m of t.log.snaps.splice(0)) { maxPirates = Math.max(maxPirates, m.p.length); maxBoats = Math.max(maxBoats, m.d.length); loot = Math.max(loot, m.l?.length ?? 0); }
    return t.raid.view().phase === 'end';
  });
  const v = t.raid.view();
  assert.equal(v.win, false);
  assert.ok(v.stolen >= P.PIRATE_LIMIT_STOLEN, `украдено ${v.stolen}`);
  assert.ok(t.tick - P.PIRATE_WARN < P.PIRATE_LIMIT, 'проиграли раньше конца времени');
  assert.ok(maxPirates > 0 && maxPirates <= 9 + 3, `пиратов в кадре ${maxPirates}`);
  assert.ok(maxBoats > 0 && maxBoats <= 6, `шлюпок в кадре ${maxBoats}`);
  assert.equal(loot, P.PIRATE_LOOT, 'добыча приходит целым списком');
  assert.deepEqual(t.log.awards, [], 'без заслуг жетонов нет, а списаний не бывает вовсе');
  assert.ok(t.log.chat.some(s => /утащили/.test(s)));
  assert.ok(t.log.fx.some(e => e[0] === 'lose'));
  // после итога — 14 секунд и тишина; игроки и профили не трогаются
  t.until(() => !t.raid.active, P.PIRATE_END + 600);
  assert.equal(t.raid.active, false);
  assert.equal(t.raid.snapshot(), null);
  assert.equal(t.log.views.at(-1)?.phase, 'idle');
  for (const p of t.players) assert.deepEqual([p.state.x, p.state.y, p.state.z], [0, 0, 0], 'игроков набег не двигает');
});

test('маркер: два попадания заляпывают вора, он бросает ношу; перезарядка, чужие и невидимые стрелки не считаются', () => {
  const t = setup({ n: 3, map: open() });
  t.begin();
  assert.ok(t.until(() => t.inner.pirates.some(p => !p.aboard && p.st !== P.PS_JUMP)), 'высадились');
  const pirate = t.inner.pirates.find(p => !p.aboard && p.st !== P.PS_JUMP)!;
  t.go(2);
  assert.equal(pirate.hp, P.PIRATE_HP);
  t.stand(0, pirate.x, pirate.z - 6);
  t.players[1].eligible = false; t.stand(1, pirate.x, pirate.z - 6);
  const target = () => ({ x: pirate.x, y: 0.9, z: pirate.z });
  const shot = (i: number) => { const a = aimAt(t.players[i].state, target()); return t.raid.fire(i + 1, { yaw: a.yaw, pitch: a.pitch, viewTick: t.tick }); };
  assert.equal(shot(1), false, 'у кого занято (стол, удочка, меню) — не стреляет');
  assert.equal(pirate.hp, P.PIRATE_HP);
  assert.equal(shot(0), true);
  assert.equal(pirate.hp, P.PIRATE_HP - 1, 'первое попадание');
  assert.equal(pirate.st, P.PS_STUN);
  assert.equal(shot(0), false, 'перезарядка маркера');
  t.go(P.PIRATE_MARKER_CD + 1);
  assert.equal(shot(0), true);
  assert.ok(!t.inner.pirates.includes(pirate) || pirate.hp <= 0, 'второе — заляпан');
  t.go(1);
  assert.ok(t.log.fx.some(e => e[0] === 'ko'));
  // награда один раз, только тому, кто красил; тот, кто стоял без дела, ничего не получает: проигрыш — за заслуги и утешение
  for (let i = 0; i < P.PIRATE_LIMIT_STOLEN; i++) t.inner.items[i].st = P.LS_STOLEN;
  t.go(2);
  assert.equal(t.raid.view().phase, 'end');
  assert.equal(t.raid.view().win, false);
  assert.deepEqual(t.log.awards.map(a => a.pid), [1]);
  assert.equal(t.log.awards[0].tokens, P.contribution({ kos: 1, sinks: 0, hits: 2, saves: 0 }) + P.PIRATE_REWARD_LOSS, 'два попадания, заляпан, утешение за проигрыш');
  assert.equal(t.log.awards[0].stats.prKos, 1);
  assert.equal(t.log.awards[0].stats.prRaids, 1);
  assert.equal(t.log.awards[0].stats.prWins, 0);
  assert.ok(t.log.awards.every(a => a.tokens >= 0 && (a.stats.prKos ?? 0) >= 0), 'ничего не списывается');
  t.go(P.PIRATE_END * 2);
  assert.equal(t.log.awards.filter(a => a.pid === 1).length, 1, 'награда ровно один раз');
});

test('стена между стрелком и вором: краска не проходит, но выстрел засчитывается как выстрел', () => {
  const base = open();
  const t0 = setup({ n: 1, map: base });
  t0.begin();
  t0.until(() => t0.inner.pirates.some(p => !p.aboard && p.st !== P.PS_JUMP));
  const at = t0.inner.pirates.find(p => !p.aboard && p.st !== P.PS_JUMP)!;
  const wall = { min: [at.x - 3, 0, at.z - 4] as [number, number, number], max: [at.x + 3, 3, at.z - 3.5] as [number, number, number], mat: 'concrete' as const, color: 0 };
  const t = setup({ n: 1, map: { ...base, boxes: [wall] } });
  t.begin();
  t.until(() => t.inner.pirates.some(p => !p.aboard && p.st !== P.PS_JUMP));
  const pirate = t.inner.pirates.find(p => !p.aboard && p.st !== P.PS_JUMP)!;
  t.go(2);
  Object.assign(wall, { min: [pirate.x - 3, 0, pirate.z - 4], max: [pirate.x + 3, 3, pirate.z - 3.5] });
  const w = new CollisionWorld({ ...base, boxes: [wall] });
  (t.raid as unknown as { world: CollisionWorld }).world = w;
  t.stand(0, pirate.x, pirate.z - 7);
  const a = aimAt(t.players[0].state, { x: pirate.x, y: 0.9, z: pirate.z });
  const shot = t.shoot(1, a, 'pt');
  assert.equal(shot.ok, true);
  assert.equal(pirate.hp, P.PIRATE_HP, 'за стеной не достать');
  assert.equal(shot.fx![shot.fx!.length - 1], 0, 'в эффекте — промах');
});

test('береговая пушка: стрелять можно только стоя у неё; ядро идёт туда, куда сказал прицел; шлюпка тонет с двух попаданий', () => {
  const t = setup({ n: 2, map: open() });
  t.begin();
  assert.ok(t.until(() => t.inner.boats.length > 0));
  const boat = t.inner.boats[0], cannon = P.PIRATE_CANNONS[1];
  // шлюпка стоит на воде в одной точке маршрута (у швартовки): ядро летит в эту точку
  const route = P.PIRATE_ROUTES[boat.dock], at = { x: 0, z: 0, yaw: 0 };
  P.routeAt(route, route.total * 0.55, false, at);
  const freeze = () => { Object.assign(boat, { d: route.total * 0.55, st: P.DS_MOOR, since: t.tick }); };
  freeze();
  t.go(2);
  assert.ok(Math.hypot(boat.x - at.x, boat.z - at.z) < 1e-6 && boat.vx === 0 && boat.vz === 0);
  const me = { x: cannon.x, y: 0, z: cannon.z + 0.8 };
  t.stand(0, me.x, me.z);
  t.stand(1, cannon.x, cannon.z - 6); // далеко от пушек: стреляет маркером, а не ядром
  const a = aimAt(me, { x: at.x, y: WATER_Y + 0.4, z: at.z });
  assert.equal(t.shoot(2, a, 'fire').ok, true, 'это маркер: ядра нет');
  assert.ok(!t.log.fx.some(e => e[0] === 'fire'), 'без пушки ядро не вылетает');
  freeze();
  const first = t.shoot(1, a, 'fire');
  assert.equal(first.ok, true);
  const fire = first.fx!;
  assert.deepEqual([fire[1], fire[2]], [1, 1], 'пушка 1, стреляет слот 1');
  assert.equal(fire[7], P.SK_BOAT);
  assert.ok(Math.hypot(fire[3] - at.x, fire[5] - at.z) < 0.01, 'в шлюпку');
  assert.equal(t.raid.fire(1, { ...a, viewTick: t.tick }), false, 'пушка заряжается 3,5 с');
  for (let i = 0; i < fire[6] - 1; i++) { freeze(); t.go(1); } // последний шаг — тот, на котором ядро падает
  assert.equal(boat.hp, P.PIRATE_BOAT_HP - 1, 'шлюпка получила пробоину');
  assert.ok(t.log.fx.some(e => e[0] === 'dh'));
  for (let i = 0; i < P.PIRATE_CANNON_CD; i++) { freeze(); t.go(1); }
  const second = t.shoot(1, a, 'fire');
  assert.equal(second.ok, true);
  for (let i = 0; i < second.fx![6] - 1; i++) { freeze(); t.go(1); }
  assert.ok(boat.st === P.DS_SUNK || !t.inner.boats.includes(boat), 'вторая пробоина — тонет');
  assert.ok(t.log.fx.some(e => e[0] === 'sink'));
});

test('корабль можно пробить ядрами: прочность падает, на нуле набег отбит; награда один раз, лучшему — бонус', () => {
  const t = setup({ n: 2, map: open() });
  t.begin();
  const cannon = P.PIRATE_CANNONS[1], me = { x: cannon.x, y: 0, z: cannon.z + 0.8 };
  t.stand(0, me.x, me.z);
  t.stand(1, 40, 0);
  t.inner.v.hp = 2;
  const a = aimAt(me, { x: P.PIRATE_SHIP.x, y: 2, z: P.PIRATE_SHIP.z - P.PIRATE_SHIP.az });
  for (let k = 0; k < 2; k++) {
    const s = t.shoot(1, a, 'fire');
    assert.equal(s.ok, true);
    assert.equal(s.fx![7], P.SK_SHIP);
    t.go(s.fx![6] + 2);
    assert.equal(t.raid.view().hp, 1 - k);
    t.go(P.PIRATE_CANNON_CD);
    if (k === 0) assert.equal(t.raid.view().phase, 'raid');
  }
  const v = t.raid.view();
  assert.equal(v.phase, 'end');
  assert.equal(v.win, true);
  assert.deepEqual(t.log.awards.map(x => x.pid), [1], 'второй игрок ничего не делал');
  assert.equal(t.log.awards[0].tokens, 2 + P.PIRATE_REWARD_WIN + P.PIRATE_REWARD_MVP);
  assert.deepEqual(t.log.awards[0].stats, { prRaids: 1, prWins: 1, prKos: 0 });
  assert.ok(t.log.chat.some(s => /Набег отбит/.test(s)));
  assert.equal(v.results[0].mvp, true);
  t.until(() => !t.raid.active, P.PIRATE_END + 600);
  assert.equal(t.log.awards.length, 1);
});

test('спасение ящика: упавший ящик возвращается в кучу от прикосновения; пока он в руках у пирата — не берётся', () => {
  const t = setup({ n: 1, map: open() });
  t.begin();
  const it = t.inner.items[3];
  Object.assign(it, { st: P.LS_DROPPED, x: 12, z: 14 });
  (it as unknown as { dropAt: number }).dropAt = t.tick;
  t.stand(0, 12.4, 14.2);
  t.go(5);
  assert.equal(it.st, P.LS_DROPPED, 'сразу не берут: пираты тоже не успевают');
  t.go(20);
  assert.equal(it.st, P.LS_PILE);
  assert.ok(t.log.fx.some(e => e[0] === 'rs' && e[1] === 3));
  // забранный пиратом — не лежит на земле: касание его не касается
  const held = t.inner.items[4];
  held.st = P.LS_CARRIED;
  held.x = 12; held.z = 14;
  t.go(40);
  assert.equal(held.st, P.LS_CARRIED);
});

test('капитан берёт два ящика сразу; краска заставляет его бросить оба', () => {
  const t = setup({ n: 1, map: open() });
  t.begin();
  // капитан один в шлюпке: никто не занял вещи рядом, и он хватает две
  t.inner.launches.push({ at: t.tick + 1, dock: 1, crew: 1, captain: true });
  assert.ok(t.until(() => t.inner.pirates.some(p => p.captain && p.loot >= 0 && p.loot2 >= 0), 3600), 'капитан взял две вещи');
  const cap = t.inner.pirates.find(p => p.captain)!;
  assert.notEqual(cap.loot, cap.loot2);
  const row = t.raid.snapshot()!.p.find(r => r[0] === cap.id)!;
  assert.ok((row[6] & P.PL_CAPTAIN) !== 0 && (row[6] & (P.PL_CRATE | P.PL_BARREL)) !== 0, 'на модели видно ношу');
  t.stand(0, cap.x, cap.z - 5);
  const held = [cap.loot, cap.loot2];
  let tries = 0;
  while (cap.loot >= 0 && tries++ < 12) {
    const a = aimAt(t.players[0].state, { x: cap.x, y: 0.9, z: cap.z });
    t.raid.fire(1, { ...a, viewTick: t.tick });
    t.go(P.PIRATE_MARKER_CD + 1);
    t.stand(0, cap.x, cap.z - 5);
  }
  assert.equal(cap.loot, -1);
  assert.equal(cap.loot2, -1);
  for (const id of held) assert.ok(t.inner.items[id].st === P.LS_DROPPED || t.inner.items[id].st === P.LS_PILE || t.inner.items[id].st === P.LS_CARRIED, 'вещи на земле или уже у других');
});

test('число защитников: только свободные игроки считаются; занятые за столом, с удочкой и в меню не мешают и не получают ничего', () => {
  const t = setup({ n: 4 });
  t.players[1].eligible = false; t.players[2].eligible = false; t.players[3].eligible = false;
  const before = t.players.map(p => ({ ...p.state }));
  t.begin();
  assert.equal(t.raid.view().hpMax, P.shipHpMax(1));
  t.until(() => t.raid.view().phase === 'end');
  t.until(() => !t.raid.active, P.PIRATE_END + 600);
  assert.deepEqual(t.log.awards, []);
  t.players.forEach((p, i) => assert.deepEqual({ ...p.state }, before[i], 'событие игроков не трогает'));
  assert.ok(t.players.every(p => p.state.y >= 0));
});

test('прервать набег (команда разработчика): всё гаснет без наград, можно начать заново', () => {
  const t = setup({ n: 1 });
  t.begin();
  t.go(300);
  t.raid.abort();
  assert.equal(t.raid.active, false);
  assert.equal(t.raid.snapshot(), null);
  assert.equal(t.log.views.at(-1)?.phase, 'idle');
  const last = t.log.snaps.at(-1)!;
  assert.deepEqual([last.p.length, last.d.length], [0, 0], 'экран очищен');
  assert.deepEqual(t.log.awards, []);
  t.raid.start(t.tick, 'raid:2');
  assert.equal(t.raid.view().phase, 'warn');
});

test('ввод стрелка проверяется: мусор вместо взгляда и стрельба с высоты не засчитываются', () => {
  const t = setup({ n: 1, map: open() });
  t.begin();
  t.stand(0, 6, 15);
  assert.equal(t.raid.fire(1, { yaw: NaN, pitch: 0, viewTick: t.tick }), false);
  assert.equal(t.raid.fire(1, { yaw: 0, pitch: Infinity, viewTick: t.tick }), false);
  assert.equal(t.raid.fire(99, { yaw: 0, pitch: 0, viewTick: t.tick }), false, 'такого игрока нет');
  t.stand(0, 6, 15, 4);
  assert.equal(t.raid.fire(1, { yaw: 0, pitch: 0, viewTick: t.tick }), false, 'в воздухе (прыжок с крыши) — нет');
  t.stand(0, 6, 15, 0);
  assert.equal(t.raid.fire(1, { yaw: 0, pitch: 0, viewTick: Number.NaN }), true, 'viewTick мусор — берётся текущий тик');
});
