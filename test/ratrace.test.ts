// Крысиные бега: таймер приёма (15 с, новый игрок +3 с, не больше 30 с), отказы с причиной и лимиты ставки, потолок
// выплаты, честность розыгрыша (частоты побед ≈ шансам, возврат ≈ 95,3 %), забег с двумя игроками (один вид у всех,
// итог и жетоны ровно один раз), уход посреди забега, рестарт (залог возвращается), план забега (финиш ровно в
// серверном порядке), «болеть», без флага. Всё через настоящие Hub/LobbyRoom и временный диск.
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { PROTOCOL_VERSION, TICK_RATE } from '../shared/constants.ts';
import {
  RAT_ADD_MS, RAT_CENTER, RAT_CHEER_MS, RAT_CHEER_R, RAT_COUNT, RAT_LAP, RAT_LAST_MS, RAT_MAX_BET, RAT_MAX_PAYOUT, RAT_MIN_BET, RAT_MULTS, RAT_OPEN_MAX_MS,
  RAT_OPEN_MS, RAT_RTP, RAT_RUN_MS, RAT_USE, RAT_WEIGHT_SUM, RATS, isRatOrder, ratAt, ratChance, ratDrawOrder, ratOdds, ratPayout, ratPlan, ratShuffle,
  ratStandings, ratWin,
} from '../shared/ratrace.ts';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store, normalizeProfile } from '../server/store.ts';
import { SMOKE, allOf, connect, lastOf, login, placeAt } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

const fmt = new Intl.NumberFormat('ru-RU');
/** Коэффициенты — перестановка шести форм дня */
const isCard = (odds: readonly number[]): boolean => odds.length === RAT_COUNT && [...odds].sort((a, b) => a - b).join() === [...RAT_MULTS].sort((a, b) => a - b).join();

function setup(ratrace = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-ratrace-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 4, 12) };
  const store = new Store(dir, { now: () => clock.now, log: () => {}, saveDelayMs: 60_000 });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, now: () => clock.now, log: () => {}, build: 'test', smokeToken: SMOKE, ratrace, weather: 'clear' });
  let n = 0;
  type Who = ReturnType<typeof login>;
  /** К арене (с набережной перед понтоном), чуть в стороне от остальных */
  const toArena = (who: Who): void => placeAt(hub, who.c, RAT_USE.x - 1.2 + (n % 5) * 0.6, RAT_USE.z - 0.9);
  /** Новый игрок у арены с жетонами (у каждого свой адрес — лимит новых профилей на адрес) */
  const player = (tokens = 2000): Who => {
    n++;
    const who = login(hub, `Racer${n}`, undefined, `10.0.7.${n}`);
    who.c.profile!.tokens = tokens;
    toArena(who);
    return who;
  };
  const track = hub.lobby.ratrace;
  /** Ставка от игрока; race — по умолчанию номер текущего забега (игрок видел его коэффициенты) */
  const bet = (who: Who, rat: unknown, amount: unknown, race: unknown = track?.view().race): void => {
    hub.onJson(who.c, { t: 'rat', a: 'bet', rat, amount, race });
  };
  const cheer = (who: Who, rat: unknown): void => hub.onJson(who.c, { t: 'rat', a: 'cheer', rat });
  /** Время вперёд с тиками хаба (60 в секунду), ровно на ms */
  const advance = (ms: number): void => {
    const end = clock.now + ms;
    while (clock.now < end) {
      clock.now = Math.min(end, clock.now + Math.round(1000 / TICK_RATE));
      hub.step();
    }
  };
  /** Следующий забег выиграет крыса rat (остальные места — по номерам, сид 0) */
  const forceWinner = (rat: number): void => {
    const odds = track!.view().odds;
    let before = 0;
    for (let i = 0; i < rat; i++) before += Math.round(ratChance(odds[i]) * RAT_WEIGHT_SUM);
    track!.rand = (k) => (k === RAT_WEIGHT_SUM ? before : 0);
  };
  return { hub, store, profiles, clock, dir, track: track!, player, toArena, bet, cheer, advance, forceWinner };
}

// ------------------------------------------------------------ таймер

test('таймер: первая ставка — 15 с даже в одиночку; новый игрок +3 с; не больше 30 с с первой ставки; свою ставку не повторить', () => {
  const e = setup();
  const a = e.player(), b = e.player();
  let v = e.track.view();
  assert.equal(v.phase, 'idle');
  assert.equal(v.race, 1);
  assert.equal(v.left, 0);
  assert.ok(isCard(v.odds), `коэффициенты ${v.odds}`);
  const t0 = e.clock.now;
  e.bet(a, 2, 50);
  assert.deepEqual(lastOf(a.s, 'ratBet'), { t: 'ratBet', ok: true, text: `Ставка принята: ${RATS[2].name} · 50 🪙` });
  v = lastOf(b.s, 'rat')!.v;
  assert.equal(v.phase, 'open');
  assert.equal(v.left, RAT_OPEN_MS, 'первая ставка — ровно 15 с до старта, хотя игрок один');
  assert.deepEqual(v.bets, [{ pid: a.c.pid, nick: a.c.nick, rat: 2, stake: 50 }]);
  assert.equal(v.seed, undefined);
  assert.equal(v.order, undefined);
  // через 2 с ставит второй — старт отодвигается на 3 с
  e.advance(2000);
  e.bet(b, 4, 10);
  assert.equal(lastOf(b.s, 'ratBet')!.ok, true);
  v = lastOf(a.s, 'rat')!.v;
  assert.equal(v.left, t0 + RAT_OPEN_MS + RAT_ADD_MS - e.clock.now);
  assert.equal(v.left, RAT_OPEN_MS + RAT_ADD_MS - 2000);
  // тот же игрок ещё раз — отказ, время не прибавилось
  e.bet(a, 3, 10);
  assert.deepEqual(lastOf(a.s, 'ratBet'), { t: 'ratBet', ok: false, text: 'Ты уже поставил в этом забеге' });
  assert.equal(e.track.view().left, t0 + RAT_OPEN_MS + RAT_ADD_MS - e.clock.now);
  assert.equal(e.track.view().bets.length, 2);
  // ещё шесть игроков: по +3 с, но не дальше 30 с от первой ставки
  for (let i = 0; i < 6; i++) {
    const c = e.player();
    e.bet(c, i % RAT_COUNT, RAT_MIN_BET);
    assert.equal(lastOf(c.s, 'ratBet')!.ok, true);
    const left = e.track.view().left;
    assert.equal(left, Math.min(t0 + RAT_OPEN_MS + RAT_ADD_MS * (i + 2), t0 + RAT_OPEN_MAX_MS) - e.clock.now, `игрок ${i + 3}`);
    assert.ok(e.clock.now + left <= t0 + RAT_OPEN_MAX_MS, 'не дальше 30 с с первой ставки');
  }
  assert.equal(e.track.view().left, t0 + RAT_OPEN_MAX_MS - e.clock.now, 'упёрлись в потолок 30 с');
  assert.equal(e.track.view().bets.length, 8);
  // до 30-й секунды — приём, на ней — старт
  e.advance(t0 + RAT_OPEN_MAX_MS - e.clock.now - 50);
  assert.equal(e.track.view().phase, 'open');
  e.advance(100);
  v = lastOf(a.s, 'rat')!.v;
  assert.equal(v.phase, 'run');
  assert.ok(isRatOrder(v.order), `порядок ${v.order}`);
  assert.ok(Number.isInteger(v.seed) && v.seed! >= 0);
  assert.ok(v.left > RAT_RUN_MS - 100 && v.left <= RAT_RUN_MS);
});

test('одна ставка: забег через 15 с, итог через 12 с, жетоны — минус ставка, плюс выигрыш, без опыта', () => {
  const e = setup();
  const a = e.player(1000);
  const pa = a.c.profile!;
  const xp = pa.xp;
  const odds = e.track.view().odds;
  e.forceWinner(1);
  e.bet(a, 1, 100);
  assert.equal(pa.tokens, 900);
  assert.equal(lastOf(a.s, 'tokens')!.n, 900, 'жетоны после ставки — сразу на экран');
  assert.equal(pa.ratEscrow?.amount, 100);
  e.advance(RAT_OPEN_MS - 20);
  assert.equal(e.track.view().phase, 'open');
  e.advance(40);
  assert.equal(e.track.view().phase, 'run');
  assert.equal(e.track.view().order![0], 1);
  e.advance(RAT_RUN_MS + 20);
  const win = ratWin(100, odds[1]);
  assert.deepEqual(allOf(a.s, 'ratResult'), [{ t: 'ratResult', race: 1, rat: 1, stake: 100, payout: win, winner: 1 }]);
  assert.equal(pa.tokens, 900 + win);
  assert.equal(lastOf(a.s, 'tokens')!.n, 900 + win);
  assert.equal(pa.ratEscrow, null);
  assert.equal(pa.xp, xp, 'выигрыш на бегах опыта не даёт');
  const v = e.track.view();
  assert.equal(v.phase, 'idle');
  assert.equal(v.race, 2);
  assert.deepEqual(v.last, { race: 1, order: [1, 0, 2, 3, 4, 5], odds, wins: [{ nick: a.c.nick, payout: win }] });
});

// ------------------------------------------------------------ отказы, лимиты, потолок

test('ставка: отказы с понятной причиной — жетоны не тронуты, залога нет, приём не открылся', () => {
  const e = setup();
  const a = e.player(3);
  const pa = a.c.profile!;
  const said = (): string | undefined => lastOf(a.s, 'ratBet')?.text;
  // у ставок свой лимит частоты (4 в секунду) — между попытками часы чуть вперёд
  const tryBet = (rat: unknown, amount: unknown, race?: unknown): void => {
    e.clock.now += 300;
    e.bet(a, rat, amount, race ?? e.track.view().race);
  };
  tryBet(0, 5);
  assert.equal(said(), `Нет жетонов на ставку — нужно хотя бы ${RAT_MIN_BET} 🪙`);
  assert.equal(pa.tokens, 3);
  pa.tokens = 100;
  tryBet(0, 4);
  assert.equal(said(), `Ставка — от ${RAT_MIN_BET} 🪙`);
  tryBet(0, 7.5);
  assert.equal(said(), `Ставка — от ${RAT_MIN_BET} 🪙`);
  tryBet(0, '50');
  assert.equal(said(), `Ставка — от ${RAT_MIN_BET} 🪙`);
  tryBet(0, RAT_MAX_BET + 1);
  assert.equal(said(), `Ставка — не больше ${RAT_MAX_BET} 🪙`);
  tryBet(0, 101);
  assert.equal(said(), 'Не хватает жетонов: у тебя 100 🪙');
  tryBet(0, 50, 7);
  assert.equal(said(), 'Коэффициенты обновились — глянь на них ещё раз');
  // не та крыса — молча (так клиент не шлёт)
  const replies = allOf(a.s, 'ratBet').length;
  for (const rat of [RAT_COUNT, -1, '0', 1.5, null]) tryBet(rat, 50);
  assert.equal(allOf(a.s, 'ratBet').length, replies);
  // далеко от арены
  placeAt(e.hub, a.c, 0, 0);
  tryBet(0, 50);
  assert.equal(said(), 'Подойди к арене крысиных бегов');
  e.toArena(a);
  // залог прошлой ставки ещё висит
  pa.ratEscrow = { round: 'old-1', amount: 5 };
  tryBet(0, 50);
  assert.equal(said(), 'Твоя прошлая ставка ещё не рассчитана');
  pa.ratEscrow = null;
  assert.equal(pa.tokens, 100);
  assert.equal(e.track.view().phase, 'idle', 'ни одна из отказанных ставок не открыла приём');
  assert.equal(e.track.view().bets.length, 0);
  // смотритель без профиля — подсказка, а не ставка
  const sm = connect(e.hub, '10.0.9.9');
  e.hub.onJson(sm.c, { t: 'hello', v: PROTOCOL_VERSION, smoke: SMOKE });
  e.hub.onJson(sm.c, { t: 'rat', a: 'bet', rat: 0, amount: 10, race: 1 });
  assert.equal(lastOf(sm.s, 'toast')?.text, 'Крысиные бега — только для игроков с профилем');
  assert.equal(lastOf(sm.s, 'ratBet'), undefined);
  // забег идёт — ставь на следующий
  const b = e.player();
  e.bet(b, 0, 10);
  e.advance(RAT_OPEN_MS + 50);
  assert.equal(e.track.view().phase, 'run');
  tryBet(0, 50);
  assert.equal(said(), 'Забег уже идёт — ставь на следующий');
  assert.equal(pa.tokens, 100);
  assert.equal(pa.ratEscrow ?? null, null);
  // после забега — новые коэффициенты; кто смотрел на старые, получает «обновились», на новые — ставка проходит
  e.advance(RAT_RUN_MS + 50);
  assert.equal(e.track.view().race, 2);
  tryBet(0, 50, 1);
  assert.equal(said(), 'Коэффициенты обновились — глянь на них ещё раз');
  tryBet(0, 50, 2);
  assert.equal(lastOf(a.s, 'ratBet')!.ok, true);
  assert.equal(pa.tokens, 50);
});

test('потолок выплаты: 1000 × 25 = 25 000 ровно; ни одна ставка не принесёт больше', () => {
  assert.equal(RAT_MAX_PAYOUT, 25_000);
  assert.equal(Math.max(...RAT_MULTS), 25);
  assert.equal(ratWin(RAT_MAX_BET, 25), 25_000);
  let over = 0;
  for (const m of RAT_MULTS) {
    for (let s = RAT_MIN_BET; s <= RAT_MAX_BET; s++) {
      const w = ratWin(s, m);
      if (w > RAT_MAX_PAYOUT || w !== Math.min(s * m, RAT_MAX_PAYOUT)) over++;
    }
  }
  assert.equal(over, 0);
  assert.equal(ratWin(10_000, 25), RAT_MAX_PAYOUT, 'даже ставка, которую сервер не примет, — с потолком');
  const odds = [3, 4, 5, 7, 12, 25];
  assert.equal(ratPayout(1000, 5, odds, 5), 25_000);
  assert.equal(ratPayout(1000, 4, odds, 5), 0, 'не та крыса — 0');
  assert.equal(ratPayout(0, 5, odds, 5), 0);
  assert.equal(ratPayout(-5, 5, odds, 5), 0);
  assert.equal(ratPayout(5.5, 5, odds, 5), 0);
  // на сервере: 1000 на ×25, крыса выиграла — ровно 25 000 и строка в общий чат
  const e = setup();
  const a = e.player(1000), b = e.player(10);
  const pa = a.c.profile!;
  const rat = e.track.view().odds.indexOf(25);
  e.forceWinner(rat);
  e.bet(a, rat, RAT_MAX_BET);
  assert.equal(pa.tokens, 0);
  e.advance(RAT_OPEN_MS + RAT_RUN_MS + 100);
  assert.equal(lastOf(a.s, 'ratResult')!.payout, 25_000);
  assert.equal(pa.tokens, 25_000);
  const line = `🐀 ${a.c.nick} поставил на ${RATS[rat].name} (×25) и выиграл ${fmt.format(25_000)} 🪙!`;
  assert.ok(allOf(b.s, 'chat').some((m) => m.sys && m.text === line), 'крупный выигрыш — в общий чат');
});

// ------------------------------------------------------------ честность

test('честность: шансы 2100/× из 2204 — сумма ровно 1, возврат на любую крысу одинаковый ≈ 95,3 %', () => {
  let sum = 0;
  for (const m of RAT_MULTS) {
    const w = ratChance(m) * RAT_WEIGHT_SUM;
    assert.ok(Math.abs(w - Math.round(w)) < 1e-9, `×${m}: целый вес`);
    assert.equal(Math.round(w) * m, 2100, `×${m}: вес ровно 2100/×`);
    sum += Math.round(w);
    assert.ok(Math.abs(ratChance(m) * m - RAT_RTP) < 1e-12, `×${m}: возврат как у всех`);
  }
  assert.equal(sum, RAT_WEIGHT_SUM, 'целые веса в сумме ровно 2204');
  assert.ok(Math.abs(RAT_MULTS.reduce((a, m) => a + ratChance(m), 0) - 1) < 1e-12);
  assert.ok(Math.abs(RAT_RTP - 0.953) < 0.0005, `возврат ${RAT_RTP}`);
  assert.equal(ratChance(2), 0, 'чужой коэффициент — шанса нет');
});

test('честность: 200 000 забегов на crypto.randomInt — победы по шансам каждой формы, крысы равны, возврат ≈ 95,3 %', () => {
  const N = 200_000;
  const rand = (n: number): number => randomInt(n);
  const byMult = new Map<number, number>(RAT_MULTS.map((m) => [m, 0]));
  const byRat = new Array<number>(RAT_COUNT).fill(0);
  let returned = 0;
  let bad = 0;
  for (let i = 0; i < N; i++) {
    // как на сервере: каждый забег — новые коэффициенты и порядок
    const odds = ratOdds(ratShuffle(RAT_COUNT, rand));
    const order = ratDrawOrder(odds, rand);
    if (i < 1000 && !isRatOrder(order)) bad++;
    const m = odds[order[0]];
    byMult.set(m, byMult.get(m)! + 1);
    byRat[order[0]]++;
    // по 1 жетону на каждую из шести крыс — вернулось m
    returned += m;
  }
  assert.equal(bad, 0, 'порядок — всегда перестановка шести крыс');
  for (const m of RAT_MULTS) {
    const p = ratChance(m), f = byMult.get(m)! / N, se = Math.sqrt((p * (1 - p)) / N);
    assert.ok(Math.abs(f - p) < 5 * se, `×${m}: частота ${f.toFixed(4)}, шанс ${p.toFixed(4)}`);
  }
  // коэффициенты раздаются равномерно — каждая крыса побеждает в 1/6 забегов
  for (let rat = 0; rat < RAT_COUNT; rat++) {
    const p = 1 / RAT_COUNT, f = byRat[rat] / N, se = Math.sqrt((p * (1 - p)) / N);
    assert.ok(Math.abs(f - p) < 5 * se, `${RATS[rat].name}: ${f.toFixed(4)}`);
  }
  const em = RAT_MULTS.reduce((a, m) => a + ratChance(m) * m, 0);
  const em2 = RAT_MULTS.reduce((a, m) => a + ratChance(m) * m * m, 0);
  const se = Math.sqrt((em2 - em * em) / N) / RAT_COUNT;
  const rtp = returned / (RAT_COUNT * N);
  assert.ok(Math.abs(rtp - RAT_RTP) < 5 * se, `возврат ${rtp.toFixed(4)} против ${RAT_RTP.toFixed(4)}`);
});

// ------------------------------------------------------------ забег с игроками

test('два игрока: у всех один забег (сид и порядок), итог каждому один раз, жетоны списаны и начислены ровно раз', () => {
  const e = setup();
  const a = e.player(1000), b = e.player(1000);
  const pa = a.c.profile!, pb = b.c.profile!;
  const odds = e.track.view().odds;
  e.bet(a, 3, 100);
  e.bet(b, 0, 40);
  assert.equal(pa.tokens, 900);
  assert.equal(pb.tokens, 960);
  assert.equal(pa.ratEscrow?.amount, 100);
  assert.equal(pb.ratEscrow?.amount, 40);
  assert.equal(pa.ratEscrow!.round === pb.ratEscrow!.round, true, 'один забег — один номер раунда');
  // повтор ставки ничего не списывает
  e.bet(a, 3, 100);
  e.bet(b, 1, 40);
  assert.equal(pa.tokens, 900);
  assert.equal(pb.tokens, 960);
  e.advance(RAT_OPEN_MS + RAT_ADD_MS + 50);
  const va = lastOf(a.s, 'rat')!.v, vb = lastOf(b.s, 'rat')!.v;
  assert.equal(va.phase, 'run');
  assert.deepEqual(vb, va, 'обоим — один и тот же забег');
  assert.ok(isRatOrder(va.order));
  assert.deepEqual(va.odds, odds, 'коэффициенты на забег не меняются');
  // зашедший посреди забега видит тот же сид и порядок и сколько осталось
  e.advance(4000);
  const c = e.player();
  const hello = lastOf(c.s, 'lobby')!.ratrace!;
  assert.equal(hello.phase, 'run');
  assert.equal(hello.seed, va.seed);
  assert.deepEqual(hello.order, va.order);
  // старт был на первом тике после конца приёма (до 50 мс назад от конца шага выше), с тех пор — ещё 4 с
  assert.equal(hello.left, e.track.view().left);
  assert.ok(hello.left > RAT_RUN_MS - 4100 && hello.left <= RAT_RUN_MS - 4000, `осталось ${hello.left}`);
  // у всех на финише — ровно серверный порядок
  assert.deepEqual(ratStandings(ratPlan(va.seed!, va.order!), RAT_RUN_MS), va.order);
  e.advance(RAT_RUN_MS);
  const winner = va.order![0];
  const wa = ratPayout(100, 3, odds, winner), wb = ratPayout(40, 0, odds, winner);
  assert.deepEqual(allOf(a.s, 'ratResult'), [{ t: 'ratResult', race: 1, rat: 3, stake: 100, payout: wa, winner }]);
  assert.deepEqual(allOf(b.s, 'ratResult'), [{ t: 'ratResult', race: 1, rat: 0, stake: 40, payout: wb, winner }]);
  assert.equal(allOf(c.s, 'ratResult').length, 0, 'кто не ставил — итога нет');
  assert.equal(pa.tokens, 900 + wa);
  assert.equal(pb.tokens, 960 + wb);
  assert.equal(lastOf(a.s, 'tokens')!.n, pa.tokens);
  assert.equal(lastOf(b.s, 'tokens')!.n, pb.tokens);
  assert.equal(pa.ratEscrow, null);
  assert.equal(pb.ratEscrow, null);
  const idle = lastOf(c.s, 'rat')!.v;
  assert.equal(idle.phase, 'idle');
  assert.equal(idle.left, 0);
  assert.equal(idle.race, 2);
  assert.deepEqual(idle.bets, []);
  assert.equal(idle.seed, undefined);
  assert.equal(idle.order, undefined);
  assert.ok(isCard(idle.odds));
  const wins = [{ nick: a.c.nick, payout: wa }, { nick: b.c.nick, payout: wb }].filter((w) => w.payout > 0);
  assert.deepEqual(idle.last, { race: 1, order: va.order, odds, wins });
  // дальше — ничего: ни второго итога, ни лишних жетонов
  e.advance(5000);
  assert.equal(allOf(a.s, 'ratResult').length, 1);
  assert.equal(allOf(b.s, 'ratResult').length, 1);
  assert.equal(pa.tokens + pb.tokens, 2000 - 140 + wa + wb);
  assert.equal(e.track.view().phase, 'idle');
  // ставка в новом забеге — снова со своими коэффициентами и номером
  e.bet(a, 0, 10);
  assert.equal(lastOf(a.s, 'ratBet')!.ok, true);
  assert.equal(lastOf(a.s, 'rat')!.v.race, 2);
  // точка «крысиные бега» (E) — свежий вид ипподрома
  const it = e.hub.lobby.map.interact.find((i) => i.kind === 'ratrace')!;
  const before = allOf(b.s, 'rat').length;
  e.hub.onJson(b.c, { t: 'use', id: it.id });
  assert.equal(allOf(b.s, 'rat').length, before + 1);
  assert.equal(lastOf(b.s, 'rat')!.v.phase, 'open');
});

test('ушёл посреди забега — ставка всё равно рассчитана на профиль; все ушли — забег доходит до конца', () => {
  const e = setup();
  const a = e.player(500), b = e.player(500);
  const pa = a.c.profile!, pb = b.c.profile!;
  const odds = e.track.view().odds;
  e.forceWinner(2);
  e.bet(a, 2, 200);
  e.bet(b, 5, 100);
  // A закрыл вкладку ещё до старта, B — посреди забега
  e.hub.disconnect(a.c);
  e.advance(RAT_OPEN_MS + RAT_ADD_MS + 50);
  assert.equal(e.track.view().phase, 'run');
  e.advance(1000);
  e.hub.disconnect(b.c);
  assert.equal(e.hub.lobby.humans, 0);
  e.advance(RAT_RUN_MS);
  assert.equal(e.track.view().phase, 'idle', 'забег кончился без игроков');
  assert.equal(pa.tokens, 300 + ratWin(200, odds[2]), 'ушедший выиграл — жетоны на профиле');
  assert.equal(pa.ratEscrow, null);
  assert.equal(pb.tokens, 400, 'B проиграл — ставка ушла, больше ничего');
  assert.equal(pb.ratEscrow, null);
  // вернулся тем же ключом — жетоны уже с выигрышем
  const back = login(e.hub, 'whatever', a.key, '10.0.7.1');
  assert.equal(back.c.profile, pa);
  assert.equal(lastOf(back.s, 'me')!.tokens, pa.tokens);
});

test('рестарт посреди забега: залог на диске, после рестарта жетоны возвращаются, залога нет; старые профили читаются', () => {
  const e = setup();
  const a = e.player(800), b = e.player(800);
  const pa = a.c.profile!, pb = b.c.profile!;
  e.bet(a, 1, 300);
  e.bet(b, 4, 25);
  e.advance(RAT_OPEN_MS + RAT_ADD_MS + 50);
  assert.equal(e.track.view().phase, 'run');
  // так диск выглядел бы при аварийном рестарте посреди забега: ставки уже записаны
  const copy = new Store(e.dir, { now: () => e.clock.now, log: () => {} });
  copy.load();
  const onDisk = copy.state.profiles.find((p) => p.id === pa.id)!;
  assert.equal(onDisk.tokens, 500);
  assert.equal(onDisk.ratEscrow?.amount, 300);
  const restored = new Profiles(copy, { now: () => e.clock.now });
  assert.equal(restored.byId(pa.id)!.tokens, 800, 'рестарт: ставка вернулась');
  assert.equal(restored.byId(pa.id)!.ratEscrow, null);
  assert.equal(restored.byId(pb.id)!.tokens, 800);
  assert.equal(restored.byId(pb.id)!.ratEscrow, null);
  copy.close();
  // возврат сам записан на диск — второй рестарт не вернёт ещё раз
  const again = new Store(e.dir, { now: () => e.clock.now, log: () => {} });
  again.load();
  const twice = new Profiles(again, { now: () => e.clock.now });
  assert.equal(twice.byId(pa.id)!.tokens, 800);
  assert.equal(twice.byId(pb.id)!.tokens, 800);
  again.close();
  // профиль без нового поля (старое сохранение) — читается как раньше; битый залог — как будто его нет
  const old = normalizeProfile({ id: 7, nick: 'Old', tokens: 70 })!;
  assert.equal(old.tokens, 70);
  assert.equal(old.ratEscrow, null);
  assert.equal(normalizeProfile({ id: 7, nick: 'Old', ratEscrow: { round: '', amount: 5 } })!.ratEscrow, null);
  assert.equal(normalizeProfile({ id: 7, nick: 'Old', ratEscrow: { round: 'r-1', amount: -5 } })!.ratEscrow, null);
  assert.deepEqual(normalizeProfile({ id: 7, nick: 'Old', ratEscrow: { round: 'r-1', amount: 40 } })!.ratEscrow, { round: 'r-1', amount: 40 });
  // новый профиль — сразу с пустым залогом
  assert.equal(e.player().c.profile!.ratEscrow, null);
});

test('залог: reserveRat/settleRat — один залог, только свой раунд, выплата не дважды', () => {
  const e = setup();
  const a = e.player(100);
  const pa = a.c.profile!;
  assert.equal(e.profiles.reserveRat(pa.id, '', 10), false);
  assert.equal(e.profiles.reserveRat(pa.id, 'r'.repeat(101), 10), false);
  assert.equal(e.profiles.reserveRat(pa.id, 'r-1', 0), false);
  assert.equal(e.profiles.reserveRat(pa.id, 'r-1', 1.5), false);
  assert.equal(e.profiles.reserveRat(pa.id, 'r-1', 101), false);
  assert.equal(e.profiles.reserveRat(9999, 'r-1', 10), false);
  assert.equal(pa.tokens, 100);
  assert.equal(e.profiles.reserveRat(pa.id, 'r-1', 60), true);
  assert.equal(e.profiles.reserveRat(pa.id, 'r-2', 10), false, 'второй залог, пока первый не рассчитан, — нет');
  assert.equal(pa.tokens, 40);
  assert.equal(e.profiles.settleRat(pa.id, 'r-2', 500), false, 'чужой раунд');
  assert.equal(e.profiles.settleRat(pa.id, 'r-1', -1), false);
  assert.equal(e.profiles.settleRat(pa.id, 'r-1', 2.5), false);
  assert.equal(e.profiles.settleRat(pa.id, 'r-1', 180), true);
  assert.equal(e.profiles.settleRat(pa.id, 'r-1', 180), false, 'второй раз не платим');
  assert.equal(pa.tokens, 220);
  assert.equal(pa.ratEscrow, null);
});

// ------------------------------------------------------------ план забега

test('план забега: финиш ровно в серверном порядке, путь не убывает, все финишируют до конца забега', () => {
  assert.ok(RAT_LAST_MS < RAT_RUN_MS);
  for (let i = 0; i < 400; i++) {
    const order = i % 2 ? ratShuffle(RAT_COUNT, randomInt) : ratDrawOrder(ratOdds(ratShuffle(RAT_COUNT, randomInt)), randomInt);
    const seed = randomInt(2 ** 31 - 1);
    const plan = ratPlan(seed, order);
    const tag = `сид ${seed}, порядок ${order}`;
    assert.deepEqual(ratStandings(plan, RAT_RUN_MS), order, tag);
    assert.deepEqual(ratStandings(plan, RAT_LAST_MS), order, tag);
    for (let k = 1; k < RAT_COUNT; k++) assert.ok(plan.finish[order[k]] > plan.finish[order[k - 1]], `${tag}: финиш по порядку`);
    for (let rat = 0; rat < RAT_COUNT; rat++) {
      const T = plan.finish[rat];
      assert.ok(T > 0 && T <= RAT_LAST_MS, `${tag}: ${RATS[rat].name} финиширует в ${T}`);
      const d = plan.dist[rat];
      let back = -1;
      for (let s = 1; s < plan.steps && back < 0; s++) if (d[s] < d[s - 1]) back = s;
      assert.equal(back, -1, `${tag}: ${RATS[rat].name} пятится на шаге ${back}`);
      assert.ok(ratAt(plan, rat, T - 1).dist < RAT_LAP, `${tag}: до финиша — не за линией`);
      assert.ok(ratAt(plan, rat, T).dist >= RAT_LAP, `${tag}: в момент финиша — на линии`);
    }
    // в любой момент финишировавшие — начало серверного порядка
    for (let ms = 0; ms <= RAT_RUN_MS; ms += 250) {
      const done = order.filter((r) => ms >= plan.finish[r]).length;
      assert.deepEqual(ratStandings(plan, ms).slice(0, done), order.slice(0, done), `${tag}: ${ms} мс`);
    }
  }
  // одинаковый у всех: тот же сид и порядок — тот же план
  const p1 = ratPlan(12345, [3, 1, 0, 5, 2, 4]), p2 = ratPlan(12345, [3, 1, 0, 5, 2, 4]);
  assert.deepEqual(p1.finish, p2.finish);
  assert.deepEqual(p1.dist, p2.dist);
  assert.deepEqual(p1.events, p2.events);
});

// ------------------------------------------------------------ болеть и без флага

test('болеть: только пока идёт приём или забег, рядом с ареной, не чаще раза в 1,2 с — всей набережной', () => {
  const e = setup();
  const a = e.player(), b = e.player(), far = e.player();
  placeAt(e.hub, far.c, RAT_CENTER.x + 18, RAT_CENTER.z - 12);
  const slotA = e.hub.lobby.playerOf(a.c)!.slot, slotB = e.hub.lobby.playerOf(b.c)!.slot;
  // забега нет — молча ничего
  e.cheer(a, 1);
  assert.equal(allOf(b.s, 'ratCheer').length, 0);
  e.bet(a, 0, 10);
  e.cheer(a, 1);
  assert.deepEqual(lastOf(b.s, 'ratCheer'), { t: 'ratCheer', id: slotA, rat: 1 });
  assert.deepEqual(lastOf(far.s, 'ratCheer'), { t: 'ratCheer', id: slotA, rat: 1 }, 'слышно всей набережной');
  // сразу ещё раз — рано
  e.cheer(a, 2);
  assert.equal(allOf(b.s, 'ratCheer').length, 1);
  e.clock.now += RAT_CHEER_MS;
  e.cheer(a, 2);
  assert.equal(allOf(b.s, 'ratCheer').length, 2);
  // не та крыса, далеко от арены, смотритель без профиля — молча
  e.cheer(b, RAT_COUNT);
  e.cheer(b, -1);
  e.cheer(b, 'Пуля');
  assert.ok(Math.hypot(RAT_CENTER.x + 18 - RAT_CENTER.x, -12) > RAT_CHEER_R);
  e.cheer(far, 0);
  const sm = connect(e.hub, '10.0.9.9');
  e.hub.onJson(sm.c, { t: 'hello', v: PROTOCOL_VERSION, smoke: SMOKE });
  e.hub.onJson(sm.c, { t: 'rat', a: 'cheer', rat: 0 });
  assert.equal(allOf(a.s, 'ratCheer').length, 2);
  // во время забега — можно
  e.advance(RAT_OPEN_MS + 50);
  assert.equal(e.track.view().phase, 'run');
  e.cheer(b, 3);
  assert.deepEqual(lastOf(a.s, 'ratCheer'), { t: 'ratCheer', id: slotB, rat: 3 });
  // забег кончился — снова молча
  e.advance(RAT_RUN_MS + 50);
  assert.equal(e.track.view().phase, 'idle');
  e.cheer(b, 3);
  assert.equal(allOf(a.s, 'ratCheer').length, 3);
});

test('без флага RATRACE ипподрома нет: ни вида в приветствии, ни ставок, ни «болеть», понтона нет — там вода', () => {
  const off = setup(false);
  assert.equal(off.hub.ratrace, false);
  assert.equal(off.hub.lobby.ratrace, null);
  const a = off.player(500);
  assert.equal(lastOf(a.s, 'lobby')!.ratrace, undefined);
  off.bet(a, 0, 50, 1);
  off.cheer(a, 0);
  const it = off.hub.lobby.map.interact.find((i) => i.kind === 'ratrace')!;
  off.hub.onJson(a.c, { t: 'use', id: it.id });
  assert.equal(lastOf(a.s, 'ratBet'), undefined);
  assert.equal(lastOf(a.s, 'ratCheer'), undefined);
  assert.equal(lastOf(a.s, 'rat'), undefined);
  assert.equal(a.c.profile!.tokens, 500);
  assert.equal(a.c.profile!.ratEscrow, null);
  // настил понтона: без флага коллизии нет, с флагом — есть
  const on = setup(true);
  const welcome = lastOf(on.player().s, 'lobby')!.ratrace!;
  assert.equal(welcome.phase, 'idle');
  assert.ok(isCard(welcome.odds));
  const deck = on.hub.lobby.map.boxes[on.hub.lobby.map.ratBoxes[0]];
  const cx = (deck.min[0] + deck.max[0]) / 2, cz = (deck.min[2] + deck.max[2]) / 2;
  const solid = (h: Hub): boolean => h.lobby.world.overlaps(cx - 0.1, -0.3, cz - 0.1, cx + 0.1, -0.1, cz + 0.1);
  assert.equal(solid(off.hub), false);
  assert.equal(solid(on.hub), true);
});
