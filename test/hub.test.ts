// Хаб: вход, версия, ник, вход с двух окон, ввод со старым epoch, общий чат, проверка после выкладки, переходы,
// круг «Старт» и гонка, табло гонки у гаража и «болеть».
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BALL_BYTES, BALL_HOME, makeBall, readBall } from '../shared/ball.ts';
import { PROTOCOL_VERSION, TICK_RATE } from '../shared/constants.ts';
import { START_TOKENS, raceReward } from '../shared/economy.ts';
import { RC_RACE, RC_RESULTS, RC_RESULTS_TICKS } from '../shared/kart.ts';
import { ACT_WAVE } from '../shared/lobby.ts';
import { KART_START } from '../shared/maps/lobby.ts';
import { KPOS_STRIDE, type RaceResultRow } from '../shared/messages.ts';
import { MSG_SNAPSHOT, SNAP_SELF_RESET, decodeSnapshot, makeHeader, type EntitySnap } from '../shared/protocol.ts';
import { BTN_FORWARD, makeState } from '../shared/sim.ts';
import type { Client, Hub } from '../server/hub.ts';
import { allOf, connect, lastOf, login, newKey, placeAt, sendInput, setupHub, SMOKE, steps, types } from './kit.ts';

test('вход новичка: me, chatlog, scene, lobby по порядку, потом снимки', () => {
  const { hub } = setupHub();
  const { c, s } = login(hub, 'Боцман');
  assert.deepEqual(types(s).slice(0, 4), ['me', 'chatlog', 'scene', 'lobby']);
  const me = lastOf(s, 'me')!;
  assert.equal(me.tokens, START_TOKENS);
  assert.equal(me.nick, 'Боцман');
  assert.equal(me.build, 'test');
  assert.deepEqual(lastOf(s, 'scene'), { t: 'scene', scene: 'lobby', epoch: 1 });
  const lobby = lastOf(s, 'lobby')!;
  assert.equal(lobby.players.length, 1);
  assert.equal(lobby.players[0].nick, 'Боцман');
  assert.ok(lobby.pool >= 1000);
  assert.equal(c.epoch, 1);
  assert.equal(s.bins.length, 0);
  steps(hub, 2);
  assert.equal(s.bins.length, 1);
  const buf = s.bins[0];
  assert.equal(buf[0], MSG_SNAPSHOT);
  const h = makeHeader();
  const self = makeState();
  const ents: EntitySnap[] = [];
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const n = decodeSnapshot(ab, h, self, ents);
  assert.equal(n, 1);
  assert.ok(h.flags & SNAP_SELF_RESET, 'первый снимок сбрасывает предсказание');
  assert.equal(ents[0].id, lobby.id);
  // за списком — мяч: лежит дома
  assert.equal(ab.byteLength, h.tail + BALL_BYTES);
  const ball = makeBall();
  ball.x = 99;
  readBall(new DataView(ab), h.tail, ball);
  assert.equal(ball.x, BALL_HOME.x);
  assert.equal(ball.z, Math.fround(BALL_HOME.z));
  assert.ok(Math.hypot(self.x - 0, self.z - 6) < 1.2, 'появился у точки входа');
  assert.equal(hub.health().online, 1);
  assert.equal(hub.health().lobby, 1);
});

test('старая версия клиента: error version и закрытие 4002', () => {
  const { hub } = setupHub();
  const { c, s } = connect(hub);
  hub.onJson(c, { t: 'hello', v: 1, key: newKey(), nick: 'Старичок' });
  assert.equal(lastOf(s, 'error')?.code, 'version');
  assert.equal(s.closed?.code, 4002);
  assert.equal(c.profile, null);
});

test('без ника: need_nick, соединение живо; с ником — вход', () => {
  const { hub } = setupHub();
  const { c, s } = connect(hub);
  const key = newKey();
  hub.onJson(c, { t: 'hello', v: PROTOCOL_VERSION, key });
  assert.equal(lastOf(s, 'error')?.code, 'need_nick');
  assert.equal(s.closed, null);
  hub.onJson(c, { t: 'chat', text: 'до входа не слышно' });
  assert.ok(!types(s).includes('chat'));
  hub.onJson(c, { t: 'hello', v: PROTOCOL_VERSION, key, nick: 'Юнга' });
  assert.equal(c.nick, 'Юнга');
  assert.equal(lastOf(s, 'scene')?.scene, 'lobby');
});

test('вход тем же ключом из второго окна: первое получает replaced и 4001', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Штурман');
  const { c: c2 } = connect(hub);
  hub.onJson(c2, { t: 'hello', v: PROTOCOL_VERSION, key: a.key });
  assert.equal(lastOf(a.s, 'error')?.code, 'replaced');
  assert.equal(a.s.closed?.code, 4001);
  assert.equal(c2.nick, 'Штурман');
  assert.equal(hub.lobby.humans, 1);
  assert.equal(hub.health().online, 1);
  // закрытие старого сокета после замены ничего не ломает
  hub.disconnect(a.c);
  assert.equal(hub.lobby.humans, 1);
  assert.equal(c2.room, hub.lobby);
});

test('ввод со старым epoch отбрасывается, с текущим — принят', () => {
  const { hub } = setupHub();
  const { c } = login(hub, 'Кок');
  const lp = hub.lobby.playerOf(c)!;
  sendInput(hub, c, BTN_FORWARD, 0, c.epoch - 1);
  assert.equal(lp.inq.lastSeq, -1);
  const seq = sendInput(hub, c, BTN_FORWARD);
  assert.equal(lp.inq.lastSeq, seq);
  hub.onBinary(c, new Uint8Array([1, c.epoch]));
  assert.equal(lp.inq.lastSeq, seq, 'обрывок пакета не ломает очередь');
});

test('общий чат: доходит всем, опоздавший видит в chatlog', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Лоцман');
  const b = login(hub, 'Матрос');
  hub.onJson(a.c, { t: 'chat', text: '  привет, набережная!  ' });
  for (const s of [a.s, b.s]) {
    const line = lastOf(s, 'chat')!;
    assert.equal(line.text, 'привет, набережная!');
    assert.equal(line.from, 'Лоцман');
    assert.equal(line.pid, a.c.pid);
    assert.equal(line.room, 'lobby');
    assert.equal(line.sys, false);
  }
  const c = login(hub, 'Опоздун');
  const log = lastOf(c.s, 'chatlog')!;
  assert.equal(log.list.length, 1);
  assert.equal(log.list[0].text, 'привет, набережная!');
  // не больше 5 сообщений за 5 секунд
  for (let i = 0; i < 6; i++) hub.onJson(b.c, { t: 'chat', text: `раз ${i}` });
  assert.equal(lastOf(a.s, 'chat')?.text, 'раз 4');
});

test('проверка после выкладки: вход по токену, профиль не сохраняется', () => {
  const { hub, store } = setupHub();
  const { c, s } = connect(hub);
  hub.onJson(c, { t: 'hello', v: PROTOCOL_VERSION, smoke: 'неверный' });
  assert.equal(lastOf(s, 'error')?.code, 'bad_key');
  hub.onJson(c, { t: 'hello', v: PROTOCOL_VERSION, smoke: SMOKE });
  assert.ok(types(s).includes('me'));
  assert.equal(lastOf(s, 'scene')?.scene, 'lobby');
  assert.equal(store.state.profiles.length, 0);
  assert.equal(hub.health().online, 0, 'проверку не видно в «кто где»');
  steps(hub, 2);
  assert.ok(s.bins.length > 0, 'снимки идут');
  const other = login(hub, 'Зевака');
  assert.equal(lastOf(other.s, 'lobby')!.players.length, 1, 'проверку не видно на набережной');
});

test('«Последние входы»: вошёл — «в игре», вышел — сколько назад; проверки нет; остальным — рассылкой', () => {
  const { hub, clock } = setupHub();
  const a = login(hub, 'Боцман');
  assert.deepEqual(lastOf(a.s, 'lobby')!.honor.recent, [{ nick: 'Боцман', ago: 0, on: true }], 'себя видно сразу');
  const b = login(hub, 'Юнга');
  clock.now += 5 * 60_000;
  hub.disconnect(b.c, 'закрыл вкладку');
  const sm = connect(hub);
  hub.onJson(sm.c, { t: 'hello', v: PROTOCOL_VERSION, smoke: SMOKE });
  assert.ok(types(sm.s).includes('lobby'), 'проверка вошла');
  clock.now += 2 * 60_000;
  assert.deepEqual(hub.honor().recent, [{ nick: 'Боцман', ago: 0, on: true }, { nick: 'Юнга', ago: 120, on: false }]);
  // кто пришёл и ушёл — доска разошлётся остальным (не чаще раза в минуту)
  steps(hub, 60 * TICK_RATE + 1);
  assert.deepEqual(lastOf(a.s, 'honor')?.recent.map((r) => [r.nick, r.on]), [['Боцман', true], ['Юнга', false]]);
});

test('переходы: в пейнтбол и обратно (epoch 2 и 3), не чаще раза в 2 секунды', () => {
  const { hub } = setupHub();
  const { c, s } = login(hub, 'Рулевой');
  assert.equal(hub.move(c, hub.paintball), false, 'сразу после входа — рано');
  steps(hub, 121);
  assert.equal(hub.move(c, hub.paintball), true);
  assert.deepEqual(lastOf(s, 'scene'), { t: 'scene', scene: 'paintball', epoch: 2 });
  assert.equal(types(s)[types(s).lastIndexOf('scene') + 1], 'welcome', 'сразу за scene — welcome пейнтбола');
  assert.equal(hub.paintball.humans, 1);
  assert.equal(hub.lobby.humans, 0);
  steps(hub, 121);
  hub.onJson(c, { t: 'leave' });
  assert.deepEqual(lastOf(s, 'scene'), { t: 'scene', scene: 'lobby', epoch: 3 });
  assert.equal(hub.paintball.humans, 0);
  assert.equal(hub.lobby.humans, 1);
  const lp = hub.lobby.playerOf(c)!;
  assert.ok(Math.hypot(lp.state.x - 0, lp.state.z + 12.5) < 1.2, 'вернулся к воротам склада');
  assert.equal(lastOf(s, 'lobby')!.yaw, Math.PI);
});

/** Встать в круг «Старт» и дождаться отсчёта (круг проверяется раз в 6 тиков). */
function toCircle(hub: Hub, c: Client): void {
  placeAt(hub, c, KART_START.x, KART_START.z);
  steps(hub, 6);
}

/** Гонка дошла до итогов (время вышло), итоги показаны — всех обратно. */
function finishRace(hub: Hub): void {
  const race = hub.race.race!;
  for (let i = 0; i < 600 && race.phase !== RC_RACE; i++) hub.step();
  assert.equal(race.phase, RC_RACE, 'решётка кончилась, гонка идёт');
  race.phaseEnd = race.tick + 1;
  steps(hub, 2);
  assert.equal(race.phase, RC_RESULTS);
  steps(hub, RC_RESULTS_TICKS + 1);
}

test('круг «Старт»: 15 с отсчёта — сцена race, после итогов — снова набережная, у гаража', () => {
  const { hub } = setupHub();
  const { c, s } = login(hub, 'Гонщик');
  assert.equal(lastOf(s, 'lobby')!.kart.phase, 'idle', 'приветствие набережной знает про картинг');
  toCircle(hub, c);
  const st = lastOf(s, 'kart')!;
  assert.equal(st.phase, 'count');
  assert.equal(st.left, 15);
  assert.deepEqual(st.names, ['Гонщик']);
  steps(hub, 14 * TICK_RATE);
  assert.equal(c.room?.kind, 'lobby', 'ещё отсчёт');
  steps(hub, TICK_RATE);
  assert.deepEqual(lastOf(s, 'scene'), { t: 'scene', scene: 'race', epoch: 2 });
  assert.equal(types(s)[types(s).lastIndexOf('scene') + 1], 'race', 'сразу за scene — приветствие гонки');
  assert.equal(c.room?.kind, 'race');
  assert.equal(hub.lobby.humans, 0);
  assert.equal(hub.race.humans, 1);
  assert.ok(hub.race.race!.karts.size >= 4, 'боты добраны');
  const h = hub.health();
  assert.equal(h.race, 1);
  assert.equal(h.busy, 1, 'выкладка не оборвёт заезд');
  assert.ok(hub.active);

  finishRace(hub);
  assert.ok(lastOf(s, 'raceEnd'), 'итоги пришли');
  assert.deepEqual(lastOf(s, 'scene'), { t: 'scene', scene: 'lobby', epoch: 3 });
  assert.equal(c.room?.kind, 'lobby');
  assert.equal(hub.race.humans, 0);
  assert.equal(hub.health().busy, 0);
  const lp = hub.lobby.playerOf(c)!;
  const g = hub.lobby.map.garageSpawn;
  assert.ok(Math.hypot(lp.state.x - g.x, lp.state.z - g.z) < 1.2, 'появился у гаража');
  assert.ok(Math.hypot(lp.state.x - KART_START.x, lp.state.z - KART_START.z) > KART_START.r, 'не в круге');
  assert.equal(lastOf(s, 'lobby')!.yaw, g.yaw);
  steps(hub, 12);
  assert.equal(lastOf(s, 'kart')!.phase, 'idle', 'новый отсчёт сам не начался');
  assert.equal(c.profile!.stats.rcRaces, 1, 'гонка засчитана');
});

test('вышел из круга до конца отсчёта — отсчёт сброшен, вернулся — начался заново', () => {
  const { hub } = setupHub();
  const { c, s } = login(hub, 'Передумал');
  toCircle(hub, c);
  steps(hub, 10 * TICK_RATE);
  assert.equal(lastOf(s, 'kart')!.phase, 'count');
  placeAt(hub, c, 0, 6);
  steps(hub, 6);
  assert.equal(lastOf(s, 'kart')!.phase, 'idle');
  toCircle(hub, c);
  steps(hub, 10 * TICK_RATE);
  assert.equal(c.room?.kind, 'lobby', 'отсчёт идёт с начала');
  assert.equal(lastOf(s, 'kart')!.phase, 'count');
  steps(hub, 5 * TICK_RATE);
  assert.equal(c.room?.kind, 'race');
});

test('из гонки — «На набережную»: к гаражу, гонка без людей закрыта, круг снова работает', () => {
  const { hub } = setupHub();
  const { c, s } = login(hub, 'Сошёл');
  toCircle(hub, c);
  steps(hub, 15 * TICK_RATE);
  assert.equal(c.room?.kind, 'race');
  hub.onJson(c, { t: 'chat', text: '/bots' });
  assert.match(lastOf(s, 'chat')!.text, /Гонка/, 'команды в гонке — подсказка');
  steps(hub, 2 * TICK_RATE);
  hub.onJson(c, { t: 'leave' });
  assert.deepEqual(lastOf(s, 'scene'), { t: 'scene', scene: 'lobby', epoch: 3 });
  assert.ok(hub.race.idle, 'гонка без людей закрыта');
  const lp = hub.lobby.playerOf(c)!;
  const g = hub.lobby.map.garageSpawn;
  assert.ok(Math.hypot(lp.state.x - g.x, lp.state.z - g.z) < 1.2, 'у гаража');
  toCircle(hub, c);
  assert.equal(lastOf(s, 'kart')!.phase, 'count', 'можно ехать снова');
});

/** Гонка с одним человеком: он уехал, остальные остались на набережной. */
function startRace(hub: Hub, c: Client): void {
  toCircle(hub, c);
  steps(hub, 15 * TICK_RATE);
  assert.equal(c.room?.kind, 'race');
}

test('табло у гаража: кто едет и где — зрителям на набережной, опоздавшему — сразу, после гонки — тишина', () => {
  const { hub } = setupHub();
  const racer = login(hub, 'Гонщик');
  const fan = login(hub, 'Болельщик');
  startRace(hub, racer.c);
  const karts = lastOf(fan.s, 'kart')!.karts!;
  assert.ok(karts.length >= 4, 'на табло все карты, с ботами');
  assert.deepEqual(karts.filter((k) => !k.bot).map((k) => k.nick), ['Гонщик']);
  assert.equal(new Set(karts.map((k) => k.color)).size, karts.length, 'у каждого свой цвет');
  const p0 = lastOf(fan.s, 'kpos')!.p;
  assert.equal(p0.length, karts.length * KPOS_STRIDE);
  const ids: number[] = [];
  const places: number[] = [];
  for (let i = 0; i < p0.length; i += KPOS_STRIDE) {
    ids.push(p0[i]);
    places.push(p0[i + 3]);
  }
  assert.deepEqual([...ids].sort(), karts.map((k) => k.id).sort(), 'все карты');
  assert.deepEqual(places, karts.map((_, i) => i + 1), 'по местам');
  assert.equal(allOf(racer.s, 'kpos').length, 0, 'гонщику табло не шлём');

  const race = hub.race.race!;
  for (let i = 0; i < 600 && race.phase !== RC_RACE; i++) hub.step();
  const n0 = allOf(fan.s, 'kpos').length;
  steps(hub, 5 * TICK_RATE);
  const n = allOf(fan.s, 'kpos').length - n0;
  assert.ok(n >= 10 && n <= 50, `едут — табло обновляется, но не чаще 10 раз в секунду (${n} за 5 с)`);

  const late = login(hub, 'Опоздавший');
  const tl = types(late.s);
  assert.equal(tl[tl.indexOf('lobby') + 1], 'kpos', 'опоздавшему — сразу за приветствием');
  assert.deepEqual(lastOf(late.s, 'kpos')!.p, hub.race.positions(), 'где карты сейчас');

  finishRace(hub);
  steps(hub, 12);
  assert.equal(lastOf(fan.s, 'kart')!.phase, 'idle');
  assert.equal(lastOf(fan.s, 'kart')!.karts, undefined);
  const n1 = allOf(fan.s, 'kpos').length;
  steps(hub, TICK_RATE);
  assert.equal(allOf(fan.s, 'kpos').length, n1, 'гонки нет — табло молчит');
  const tr = types(racer.s);
  assert.notEqual(tr[tr.lastIndexOf('lobby') + 1], 'kpos', 'вернувшемуся с гонки — без старых позиций');
});

test('болеть у табло: гонщикам «за вас болеют» — с игрока раз в 4 с, на гонку раз в 2 с; без гонки — подсказка', () => {
  const { hub, clock } = setupHub();
  const racer = login(hub, 'Гонщик');
  const fan = login(hub, 'Болельщик');
  const fan2 = login(hub, 'Фанат');
  const id = hub.lobby.map.interact.findIndex((it) => it.kind === 'kboard');
  const board = hub.lobby.map.interact[id];
  placeAt(hub, fan.c, board.x, board.z);
  placeAt(hub, fan2.c, board.x + 0.4, board.z);

  hub.onJson(fan.c, { t: 'use', id });
  assert.match(lastOf(fan.s, 'toast')!.text, /никто не едет/);

  startRace(hub, racer.c);
  placeAt(hub, fan.c, board.x, board.z);
  hub.onJson(fan.c, { t: 'use', id });
  steps(hub, 2);
  assert.deepEqual(allOf(racer.s, 'cheer'), [{ t: 'cheer', nick: 'Болельщик' }]);
  const fanSlot = hub.lobby.playerOf(fan.c)!.slot;
  assert.ok(allOf(fan2.s, 'lev').some((m) => m.e.some((e) => e[0] === 'cheer' && e[1] === fanSlot)), 'набережная видит, кто болеет');
  assert.equal(hub.lobby.playerOf(fan.c)!.action, ACT_WAVE, 'желейка машет');

  clock.now += 1000;
  hub.onJson(fan.c, { t: 'use', id });
  hub.onJson(fan2.c, { t: 'use', id });
  steps(hub, 2);
  assert.equal(allOf(racer.s, 'cheer').length, 1, 'второй болельщик через миг — гонщикам не шлём, чтобы не засыпать');
  const lev = allOf(fan.s, 'lev').flatMap((m) => m.e).filter((e) => e[0] === 'cheer');
  assert.equal(lev.length, 2, 'на набережной слышно обоих, повтор первого — нет');

  steps(hub, 2 * TICK_RATE);
  clock.now += 2000;
  hub.onJson(fan.c, { t: 'use', id });
  steps(hub, 2);
  assert.equal(allOf(racer.s, 'cheer').length, 1, 'с одного — не чаще раза в 4 с');
  clock.now += 1500;
  hub.onJson(fan.c, { t: 'use', id });
  steps(hub, 2);
  assert.deepEqual(allOf(racer.s, 'cheer').map((m) => m.nick), ['Болельщик', 'Болельщик']);

  placeAt(hub, fan2.c, 0, 6);
  clock.now += 5000;
  hub.onJson(fan2.c, { t: 'use', id });
  steps(hub, 2);
  assert.equal(allOf(racer.s, 'cheer').length, 2, 'болеть можно только у табло');
});

test('итог гонки: жетоны по месту, гонки, победы, подиумы, лучший круг', () => {
  const { hub } = setupHub();
  const { c, s } = login(hub, 'Чемпион');
  const prof = c.profile!;
  const t0 = prof.tokens;
  const row: RaceResultRow = { id: 1, nick: 'Чемпион', bot: false, place: 1, time: 95_000, best: 41_300, tokens: raceReward(1).total };
  hub.onRaceResult(c, row, raceReward(1));
  assert.equal(prof.tokens, t0 + raceReward(1).total);
  assert.equal(lastOf(s, 'tokens')!.n, prof.tokens);
  assert.deepEqual([prof.stats.rcRaces, prof.stats.rcWins, prof.stats.rcPodiums, prof.stats.rcBestLapHarbor], [1, 1, 1, 41_300]);
  hub.onRaceResult(c, { ...row, place: 3, best: 43_000, tokens: raceReward(3).total }, raceReward(3));
  assert.deepEqual([prof.stats.rcRaces, prof.stats.rcWins, prof.stats.rcPodiums, prof.stats.rcBestLapHarbor], [2, 1, 2, 41_300]);
  hub.onRaceResult(c, { ...row, place: 0, time: 0, best: 40_100, tokens: 0 }, null);
  assert.deepEqual([prof.stats.rcRaces, prof.stats.rcWins, prof.stats.rcPodiums, prof.stats.rcBestLapHarbor], [3, 1, 2, 40_100], 'не доехал: без жетонов, но круг засчитан');
  assert.equal(prof.tokens, t0 + raceReward(1).total + raceReward(3).total);
  // строка без трассы — рекорд трассы по умолчанию («Портовое кольцо»); старые поля не трогаются
  assert.equal(prof.stats.rcBestLap, 0);
});
