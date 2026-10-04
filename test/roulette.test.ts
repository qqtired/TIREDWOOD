// Рулетка рыбака: вращение колеса на клиенте (шарик ровно в лунке числа сервера, одинаково у всех), стол на сервере с
// двумя игроками (выплаты, потолок, отказы с причиной, залог не списывается дважды, выплата без игрока и после рестарта).
// Всё через настоящие Hub/LobbyRoom и временный диск.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { ROULETTE_SPOT } from '../shared/fishplaces.ts';
import { BARKAS, BARKAS_LANDING } from '../shared/barkas.ts';
import {
  ROULETTE_LOG_SIZE, ROULETTE_MAX_PAYOUT, ROULETTE_OPEN_MS, ROULETTE_SPIN_MS, ROULETTE_WHEEL, onBarkas, pushRouletteLog, rouletteColor, rouletteDrawText, roulettePayout,
  type RouletteColor, type RouletteLogRow,
} from '../shared/roulette.ts';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { POCKET, R_POCKET, R_TRACK, TAU, pocketAngle, pocketOf, spinEndWheel, spinFrame, spinStartAt } from '../client/lobby/roulettespin.ts';
import { SMOKE, allOf, lastOf, login, placeAt } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

/** По модулю 2π в диапазон (−π, π] */
const wrap = (a: number): number => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

// ------------------------------------------------------------ вращение колеса (клиент)

test('вращение: шарик ложится ровно в лунку числа сервера — для каждого из 37 чисел', () => {
  for (const n of ROULETTE_WHEEL) {
    const w0 = 1.234;
    const f = spinFrame(n, w0, ROULETTE_SPIN_MS);
    assert.ok(f.done, `${n}: вращение кончилось`);
    assert.ok(Math.abs(wrap(f.ball - f.wheel - pocketOf(n) * POCKET)) < 1e-9, `${n}: шарик в лунке числа`);
    assert.ok(Math.abs(wrap(f.wheel - spinEndWheel(w0))) < 1e-9, `${n}: колесо встало, где ждёт покой`);
    assert.equal(f.radius, R_POCKET, `${n}: шарик в лунке, а не на дорожке`);
    assert.equal(pocketAngle(n), pocketOf(n) * POCKET);
    assert.equal(rouletteColor(n) === 'green', n === 0);
  }
  // позже конца и раньше начала — то же состояние, что на краях
  assert.deepEqual(spinFrame(17, 0, ROULETTE_SPIN_MS * 3), spinFrame(17, 0, ROULETTE_SPIN_MS));
  assert.equal(spinFrame(17, 0, -500).k, 0);
  assert.equal(spinFrame(17, 0, -500).done, false);
});

test('вращение: колесо раскручивается и тормозит до нуля, шарик бежит навстречу, замедляется и сходит с дорожки', () => {
  const dt = ROULETTE_SPIN_MS / 700;
  let prev = spinFrame(5, 0, 0);
  const speeds: number[] = [];
  const relative: number[] = [];
  const radii: number[] = [prev.radius];
  assert.equal(prev.radius, R_TRACK, 'в начале шарик на дорожке');
  for (let i = 1; i <= 700; i++) {
    const f = spinFrame(5, 0, i * dt);
    assert.ok(f.wheel >= prev.wheel - 1e-12, 'колесо не крутится назад');
    assert.ok(f.radius <= prev.radius + 1e-12, 'шарик только опускается');
    assert.ok(Math.abs(f.ball - prev.ball) < 1.3, `за кадр при 10 кадрах/с шарик не прыгает больше чем на 1,3 рад (${i})`);
    speeds.push((f.wheel - prev.wheel) / (dt / 1000));
    relative.push(f.ball - f.wheel);
    radii.push(f.radius);
    prev = f;
  }
  const peak = Math.max(...speeds);
  assert.ok(speeds[0] < peak * 0.45, 'колесо раскручивается — в самом начале ещё медленно');
  assert.ok(speeds[Math.floor(speeds.length * 0.05)] > peak * 0.75, 'через долю секунды колесо уже почти на полной скорости');
  assert.ok(speeds.at(-1)! < peak * 0.02, 'к концу колесо почти стоит');
  // шарик относительно колеса бежит назад (угол убывает) до самой лунки, потом только подпрыгивает
  const runTo = Math.floor(relative.length * 0.78);
  for (let i = 1; i < runTo; i++) assert.ok(relative[i] <= relative[i - 1] + 1e-9, 'шарик бежит навстречу колесу');
  assert.ok(relative[0] - relative[runTo] > 5 * TAU, 'шарик успевает обежать не меньше пяти кругов');
  assert.ok(Math.abs(relative[relative.length - 1] - pocketOf(5) * POCKET) < 1e-9);
  assert.equal(radii.at(-1), R_POCKET);
});

test('вращение: у всех одна картинка по серверному времени — письмо шло по-разному, но шарик падает в один момент', () => {
  // сервер в момент S разослал «вращение, осталось 7 с»; игрок A получил через 40 мс, B — через 180 мс
  const S = 10_000;
  const a = spinStartAt(S + 40, ROULETTE_SPIN_MS, 40);
  const b = spinStartAt(S + 180, ROULETTE_SPIN_MS, 180);
  assert.equal(a, S, 'A: вращение началось в S');
  assert.equal(b, S, 'B: вращение началось в S (на его часах — через свою задержку, но то же серверное время)');
  // опоздавший (зашёл через 3 с после начала): ему сказали «осталось 4 с» — он видит то, что видят остальные, с середины
  assert.equal(spinStartAt(S + 3000, ROULETTE_SPIN_MS - 3000, 0), S);
  const late = spinFrame(23, 0.5, 3000);
  const early = spinFrame(23, 0.5, 3000);
  assert.deepEqual(late, early);
  assert.ok(late.k > 0.4 && late.k < 0.45);
  // сеть не бывает отрицательной: пинг, которого не знаем, — просто начало сейчас
  assert.equal(spinStartAt(500, ROULETTE_SPIN_MS, 0), 500);
});

// ------------------------------------------------------------ стол на сервере: два игрока

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-roulette-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 3, 12) };
  const store = new Store(dir, { now: () => clock.now, log: () => {}, saveDelayMs: 60_000 });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, now: () => clock.now, log: () => {}, build: 'test', smokeToken: SMOKE, fish2: true, roulette: true, weather: 'clear' });
  const a = login(hub, 'Tester7');
  const b = login(hub, 'Tester8', undefined, '10.0.0.8');
  const table = hub.lobby.roulette!;
  assert.ok(table);
  const advance = (ticks: number): void => { for (let i = 0; i < ticks; i++) { clock.now += 1000 / TICK_RATE; hub.step(); } };
  return { hub, store, profiles, clock, dir, a, b, table, advance };
}
type Env = ReturnType<typeof setup>;
const fish = (n: number, p: number) => ({ n, f: 'tuna', g: 30_000, p, m: 0 });
const toTable = (e: Env, who: Env['a'], dz = 1): void => placeAt(e.hub, who.c, ROULETTE_SPOT.x + 1, ROULETTE_SPOT.z + dz, ROULETTE_SPOT.y);

test('стол: два игрока, красное и зеро, выплаты верные, жетоны и рыба списываются один раз', () => {
  const e = setup();
  const pa = e.a.c.profile!, pb = e.b.c.profile!;
  pa.fishing.bag = [fish(0, 100), fish(1, 54)];
  pb.fishing.bag = [fish(0, 700)];
  const ta = pa.tokens, tb = pb.tokens;
  toTable(e, e.a); toTable(e, e.b, -1);
  e.table.spin = () => 0;
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.deepEqual(pa.fishing.bag, [], 'рыба ушла на стол');
  assert.equal(pa.rouletteEscrow?.amount, 154);
  assert.equal(pa.tokens, ta, 'жетоны за ставку не списываются — ставка рыбой');
  let v = lastOf(e.b.s, 'roulette')!.v;
  assert.equal(v.phase, 'open');
  assert.equal(v.left, ROULETTE_OPEN_MS);
  assert.equal(v.round, 1);
  // вторая ставка того же игрока в раунде отклонена с причиной и ничего не списывает
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'black' });
  assert.equal(lastOf(e.a.s, 'toast')!.text, 'Ты уже поставил в этом раунде');
  assert.equal(pa.rouletteEscrow?.amount, 154);
  e.hub.onJson(e.b.c, { t: 'roulette', a: 'bet', c: 'green' });
  v = lastOf(e.a.s, 'roulette')!.v;
  assert.equal(v.phase, 'spin', 'оба у стола поставили — крутим сразу');
  assert.equal(v.n, 0);
  assert.equal(v.bets.length, 2);
  // пока крутится — новые ставки с причиной отказа
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.equal(lastOf(e.a.s, 'toast')!.text, 'Колесо уже крутится — дождись следующего раунда');
  e.advance(Math.floor((ROULETTE_SPIN_MS * TICK_RATE) / 1000) + 2);
  // зеро: красное проиграло, зеро выиграло 700 × 36 с потолком
  const win = Math.min(ROULETTE_MAX_PAYOUT, 700 * 36);
  assert.deepEqual(lastOf(e.a.s, 'rouletteResult'), { t: 'rouletteResult', n: 0, c: 'green', stake: 154, payout: 0, fish: 2 });
  assert.deepEqual(lastOf(e.b.s, 'rouletteResult'), { t: 'rouletteResult', n: 0, c: 'green', stake: 700, payout: win, fish: 1 });
  assert.equal(pa.tokens, ta);
  assert.equal(pb.tokens, tb + win);
  assert.equal(pa.rouletteEscrow, null);
  assert.equal(pb.rouletteEscrow, null);
  assert.equal(allOf(e.b.s, 'rouletteResult').length, 1, 'итог пришёл один раз');
  assert.equal(lastOf(e.a.s, 'roulette')!.v.phase, 'idle');
  assert.equal(lastOf(e.a.s, 'roulette')!.v.n, 0, 'число остаётся на столе до следующего раунда');
  // следующий раунд начинается с чистого числа и со счёта 2
  pa.fishing.bag = [fish(2, 40)];
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'black' });
  v = lastOf(e.a.s, 'roulette')!.v;
  assert.equal(v.round, 2);
  assert.equal(v.n === undefined || v.phase === 'spin', true);
  e.advance(Math.floor((ROULETTE_SPIN_MS * TICK_RATE) / 1000) + 2 + ROULETTE_OPEN_MS / 1000 * TICK_RATE);
  assert.equal(allOf(e.a.s, 'rouletteResult').length, 2, 'два раунда — два итога, не больше');
  // сколько жетонов вышло в игру — ровно выплаты
  assert.equal(pa.tokens + pb.tokens, ta + tb + win + roulettePayout(40, 'black', lastOf(e.a.s, 'rouletteResult')!.n));
});

test('стол: потолок выплаты 25 000 — и на красное, и на зеро', () => {
  const e = setup();
  const pa = e.a.c.profile!, pb = e.b.c.profile!;
  pa.fishing.bag = [fish(0, 13_000)];
  pb.fishing.bag = [fish(0, 800)];
  const ta = pa.tokens, tb = pb.tokens;
  toTable(e, e.a); toTable(e, e.b, -1);
  e.table.spin = () => 1; // красное
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  e.hub.onJson(e.b.c, { t: 'roulette', a: 'bet', c: 'green' });
  e.advance(Math.floor((ROULETTE_SPIN_MS * TICK_RATE) / 1000) + 2);
  assert.equal(lastOf(e.a.s, 'rouletteResult')!.payout, ROULETTE_MAX_PAYOUT, '13 000 × 2 = 26 000 → потолок 25 000');
  assert.equal(pa.tokens, ta + ROULETTE_MAX_PAYOUT);
  assert.equal(lastOf(e.b.s, 'rouletteResult')!.payout, 0);
  assert.equal(pb.tokens, tb);
  // зеро на 800: 28 800 → потолок
  pb.fishing.bag = [fish(1, 800)];
  e.table.spin = () => 0;
  toTable(e, e.b);
  e.hub.onJson(e.b.c, { t: 'roulette', a: 'bet', c: 'green' });
  e.advance(Math.floor((ROULETTE_SPIN_MS * TICK_RATE) / 1000) + 2 + ROULETTE_OPEN_MS / 1000 * TICK_RATE);
  assert.equal(lastOf(e.b.s, 'rouletteResult')!.payout, ROULETTE_MAX_PAYOUT);
  assert.equal(pb.tokens, tb + ROULETTE_MAX_PAYOUT);
  assert.ok(allOf(e.b.s, 'chat').some((m) => m.sys && m.text.includes('Tester8 поставил улов на зеро и выиграл')), 'зеро — строка в общий чат');
});

test('стол: отказы с понятной причиной, ничего не списывается', () => {
  const e = setup();
  const pa = e.a.c.profile!;
  const toast = (): string | undefined => lastOf(e.a.s, 'toast')?.text;
  // далеко от стола
  pa.fishing.bag = [fish(0, 50)];
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.equal(toast(), 'Подойди к столу рулетки');
  assert.equal(pa.fishing.bag.length, 1);
  // у стола, но пустой рюкзак
  toTable(e, e.a);
  pa.fishing.bag = [];
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.equal(toast(), 'Рюкзак пуст — ставить нечего');
  // неизвестное поле — молча игнорируем (так клиент не шлёт), рыба на месте
  pa.fishing.bag = [fish(0, 50)];
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'purple' } as never);
  assert.equal(pa.fishing.bag.length, 1);
  assert.equal(e.table.view().phase, 'idle');
  // рыба ничего не стоит — отказ с причиной, а не «Ставка не принята»
  pa.fishing.bag = [fish(0, 0)];
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.equal(toast(), 'Твой улов ничего не стоит — ставить нечего');
  assert.equal(pa.fishing.bag.length, 1);
  assert.equal(pa.rouletteEscrow ?? null, null);
});

test('стол: игрок ушёл, пока крутилось, — выплата всё равно приходит; рестарт посреди вращения возвращает цену улова', () => {
  const e = setup();
  const pa = e.a.c.profile!, pb = e.b.c.profile!;
  pa.fishing.bag = [fish(0, 200)];
  pb.fishing.bag = [fish(0, 300)];
  const ta = pa.tokens, tb = pb.tokens;
  toTable(e, e.a); toTable(e, e.b, -1);
  e.table.spin = () => 1;
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  e.hub.onJson(e.b.c, { t: 'roulette', a: 'bet', c: 'black' });
  assert.equal(e.table.view().phase, 'spin');
  // снимок диска посреди вращения: так сохранение выглядело бы при аварийном рестарте
  e.store.flush();
  const copy = new Store(e.dir, { now: () => e.clock.now, log: () => {} });
  copy.load();
  const restored = new Profiles(copy, { now: () => e.clock.now });
  assert.equal(restored.byId(pa.id)!.tokens, ta + 200, 'рестарт: цена улова вернулась жетонами');
  assert.equal(restored.byId(pb.id)!.tokens, tb + 300);
  assert.equal(restored.byId(pa.id)!.rouletteEscrow, null);
  copy.close();
  // а в живом сервере игрок A закрыл вкладку, B остался
  e.hub.disconnect(e.a.c);
  e.advance(Math.floor((ROULETTE_SPIN_MS * TICK_RATE) / 1000) + 2);
  assert.equal(pa.tokens, ta + roulettePayout(200, 'red', 1), 'ушедший красное выиграл: жетоны пришли на профиль');
  assert.equal(pa.rouletteEscrow, null);
  assert.equal(pb.tokens, tb, 'B поставил на чёрное — проиграл');
});

test('стол: тот, кто зашёл посреди вращения или после, видит то же число; без игроков в комнате раунд всё равно кончается', () => {
  const e = setup();
  const pa = e.a.c.profile!;
  pa.fishing.bag = [fish(0, 120)];
  toTable(e, e.a);
  e.table.spin = () => 17;
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'black' });
  assert.equal(e.table.view().phase, 'spin');
  e.advance(3 * TICK_RATE);
  // новый игрок, зашедший на 3-й секунде вращения: в приветствии стол с числом и остатком времени
  const c = login(e.hub, 'Tester9', undefined, '10.0.0.9');
  const hello = lastOf(c.s, 'lobby')!;
  assert.equal(hello.roulette?.phase, 'spin');
  assert.equal(hello.roulette?.n, 17);
  assert.ok(hello.roulette!.left > 3500 && hello.roulette!.left < 4200, `осталось ${hello.roulette!.left}`);
  // все ушли с набережной (закрыли вкладки) — колесо доворачивается без них
  e.hub.disconnect(c.c);
  e.hub.disconnect(e.b.c);
  e.hub.disconnect(e.a.c);
  assert.equal(e.hub.lobby.humans, 0);
  e.advance(6 * TICK_RATE);
  assert.equal(e.table.view().phase, 'idle', 'раунд закончился без игроков');
  assert.equal(pa.rouletteEscrow, null);
  assert.equal(pa.tokens, e.profiles.byId(pa.id)!.tokens);
});

// ------------------------------------------------------------ табло на баркасе: последние ставки, тосты, кто их получает

test('табло: журнал хранит последние 10 ставок, свежие сверху; в одном розыгрыше — по порядку ставок', () => {
  const row = (round: number, nick: string): RouletteLogRow => ({ round, pid: 1, nick, c: 'red', stake: 10, payout: 0, n: 5 });
  let log: RouletteLogRow[] = [];
  for (let i = 1; i <= 4; i++) log = pushRouletteLog(log, [row(i, `a${i}`), row(i, `b${i}`)]);
  assert.deepEqual(log.map((r) => r.nick), ['a4', 'b4', 'a3', 'b3', 'a2', 'b2', 'a1', 'b1'], 'пока меньше десяти — все, свежий розыгрыш сверху');
  for (let i = 5; i <= 8; i++) log = pushRouletteLog(log, [row(i, `a${i}`), row(i, `b${i}`)]);
  assert.equal(log.length, ROULETTE_LOG_SIZE, 'старше десяти отбрасываем');
  assert.deepEqual(log.map((r) => r.nick), ['a8', 'b8', 'a7', 'b7', 'a6', 'b6', 'a5', 'b5', 'a4', 'b4']);
});

test('табло: на баркасе — по обводу корпуса и над палубой, в воде и на набережной — нет', () => {
  const mid = (BARKAS.bow + BARKAS.stern) / 2;
  assert.ok(onBarkas(ROULETTE_SPOT.x, ROULETTE_SPOT.y, ROULETTE_SPOT.z), 'у стола рулетки');
  assert.ok(onBarkas(mid, 0, BARKAS.z) && onBarkas(BARKAS.stern - 0.1, 0, BARKAS.z), 'палуба и корма');
  assert.ok(onBarkas(mid, 1.2, BARKAS.z + BARKAS.half - 0.2), 'прыжок у борта');
  assert.ok(onBarkas(BARKAS.bow + 1.5, 0.45, BARKAS.z), 'бак');
  assert.ok(!onBarkas(mid, 0, BARKAS.z + BARKAS.half + 1), 'за бортом по Z');
  assert.ok(!onBarkas(BARKAS.stern + 2, 0, BARKAS.z), 'за кормой (там лодка)');
  assert.ok(!onBarkas(BARKAS.bow - 1, 0, BARKAS.z), 'перед носом');
  assert.ok(!onBarkas(BARKAS.bow + 1, 0, BARKAS.z + 2), 'на носу борта сходятся к форштевню');
  assert.ok(!onBarkas(mid, -3, BARKAS.z), 'под водой');
  assert.ok(!onBarkas(0, 0, 0), 'на набережной');
});

test('тост о розыгрыше: одна ставка — «Ник: N на цвет — выиграл/проиграл», свои не повторяем, много ставок — одна строка', () => {
  const r = (pid: number, nick: string, c: RouletteLogRow['c'], stake: number, payout: number): RouletteLogRow => ({ round: 1, pid, nick, c, stake, payout, n: 17 });
  assert.equal(rouletteDrawText([r(1, 'Tester7', 'red', 120, 240)], 2), '🎡 Tester7: 120 на красное — выиграл 240!');
  assert.equal(rouletteDrawText([r(1, 'Tester7', 'black', 50, 0)], 2), '🎡 Tester7: 50 на чёрное — проиграл');
  assert.equal(rouletteDrawText([r(1, 'Tester7', 'green', 20, 720)], 1), null, 'играл только ты сам — тост не нужен, свой итог отдельно');
  const two = [r(1, 'Tester7', 'red', 120, 0), r(2, 'Tester8', 'black', 80, 160)];
  assert.equal(rouletteDrawText(two, 3), '🎡 Выпало 17 — чёрное: Tester7 −120 · Tester8 +160');
  assert.equal(rouletteDrawText(two, 1), '🎡 Tester8: 80 на чёрное — выиграл 160!', 'без своей строки осталась одна ставка');
  const five = [1, 2, 3, 4, 5].map((i) => r(i, `P${i}`, 'black', 10 * i, 20 * i));
  assert.equal(rouletteDrawText(five, 9), '🎡 Выпало 17 — чёрное: P1 +20 · P2 +40 · P3 +60 · ещё 2');
});

test('табло на баркасе: 10 последних в правильном порядке; письма — только тем, кто на баркасе; пришедшему на палубу — история', () => {
  const e = setup();
  const pa = e.a.c.profile!, pb = e.b.c.profile!;
  const onPlaza = login(e.hub, 'Tester9', undefined, '10.0.0.9');
  const newcomer = login(e.hub, 'Tester10', undefined, '10.0.0.10');
  toTable(e, e.a); toTable(e, e.b, -1);
  const logs = (s: typeof e.a.s) => allOf(s, 'rouletteLog');
  e.advance(2);
  assert.equal(logs(e.a.s).length, 0, 'пока никто не играл — табло молчит');
  const spinTicks = Math.floor((ROULETTE_SPIN_MS * TICK_RATE) / 1000) + 2;
  // розыгрыш: что выпало и кто на что (цена улова) ставит; ставят по порядку списка
  const rounds: Array<{ n: number; bets: Array<['a' | 'b', RouletteColor, number]> }> = [
    { n: 1, bets: [['a', 'red', 100], ['b', 'black', 50]] },
    { n: 1, bets: [['a', 'black', 40]] },
    { n: 0, bets: [['b', 'green', 20]] },
    { n: 19, bets: [['a', 'red', 60], ['b', 'red', 30]] },
    { n: 2, bets: [['a', 'black', 10]] },
    { n: 20, bets: [['b', 'black', 15]] },
    { n: 3, bets: [['a', 'red', 25]] },
    { n: 4, bets: [['a', 'black', 5], ['b', 'red', 5]] },
  ];
  const played: RouletteLogRow[] = [];
  let k = 0;
  for (const [i, round] of rounds.entries()) {
    e.table.spin = () => round.n;
    pa.fishing.bag = [];
    pb.fishing.bag = [];
    // у кого есть улов — тот и ставит: пока кто-то у стола ещё не поставил, приём открыт
    for (const [who, , price] of round.bets) (who === 'a' ? pa : pb).fishing.bag = [fish(k++, price)];
    for (const [who, c, price] of round.bets) {
      const prof = who === 'a' ? pa : pb;
      e.hub.onJson((who === 'a' ? e.a : e.b).c, { t: 'roulette', a: 'bet', c });
      played.push({ round: i + 1, pid: prof.id, nick: prof.nick, c, stake: price, payout: roulettePayout(price, c, round.n), n: round.n });
    }
    e.advance(spinTicks);
    // после розыгрыша оба на баркасе получили одно и то же табло; fresh — сколько верхних строк только что сыграли
    const last = lastOf(e.a.s, 'rouletteLog')!;
    assert.equal(last.fresh, round.bets.length, `розыгрыш ${i + 1}: сколько верхних строк свежие`);
    assert.deepEqual(lastOf(e.b.s, 'rouletteLog'), last, 'у обоих на палубе одно табло');
  }
  assert.equal(played.length, 11);
  // свежие розыгрыши сверху, внутри розыгрыша — по порядку ставок; из одиннадцати ставок остались десять последних
  const want = [...rounds.keys()].reverse().flatMap((i) => played.filter((r) => r.round === i + 1)).slice(0, ROULETTE_LOG_SIZE);
  const got = lastOf(e.a.s, 'rouletteLog')!.rows;
  assert.equal(got.length, ROULETTE_LOG_SIZE, 'табло держит десять последних');
  assert.deepEqual(got, want);
  assert.deepEqual(got[0], { round: 8, pid: pa.id, nick: 'Tester7', c: 'black', stake: 5, payout: 10, n: 4 });
  assert.deepEqual(got[1], { round: 8, pid: pb.id, nick: 'Tester8', c: 'red', stake: 5, payout: 0, n: 4 });
  assert.deepEqual(got.at(-1), { round: 1, pid: pa.id, nick: 'Tester7', c: 'red', stake: 100, payout: 200, n: 1 }, 'одиннадцатая с конца (ставка B в первом розыгрыше) уже выпала');
  assert.deepEqual(e.table.history(), got, 'сервер хранит тот же журнал');
  // тем, кто не на баркасе, — ни письма; новичок на набережной тоже ничего не получил
  assert.equal(logs(onPlaza.s).length, 0, 'на набережной табло не шлют');
  assert.equal(logs(newcomer.s).length, 0, 'пока не вышел на палубу — тоже нет');
  // новичок вышел на баркас — получает историю один раз, без fresh (тоста о розыгрыше для него нет)
  placeAt(e.hub, newcomer.c, BARKAS_LANDING.x, BARKAS_LANDING.z);
  e.advance(2);
  assert.equal(logs(newcomer.s).length, 1);
  assert.deepEqual(logs(newcomer.s)[0], { t: 'rouletteLog', rows: got });
  e.advance(30);
  assert.equal(logs(newcomer.s).length, 1, 'стоит на палубе — повторно не шлём');
  // ушёл на набережную: розыгрыш его не касается; вернулся — получает снова, уже со свежим розыгрышем
  placeAt(e.hub, newcomer.c, 0, 0);
  e.advance(2);
  pa.fishing.bag = [fish(99, 70)];
  e.table.spin = () => 5;
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  e.advance(spinTicks);
  assert.equal(logs(newcomer.s).length, 1, 'на набережной уведомлений о розыгрыше нет');
  assert.equal(logs(onPlaza.s).length, 0);
  assert.equal(lastOf(e.a.s, 'rouletteLog')!.fresh, 1);
  placeAt(e.hub, newcomer.c, BARKAS_LANDING.x, BARKAS_LANDING.z);
  e.advance(2);
  assert.equal(logs(newcomer.s).length, 2);
  assert.deepEqual(logs(newcomer.s)[1].rows[0], { round: 9, pid: pa.id, nick: 'Tester7', c: 'red', stake: 70, payout: 140, n: 5 });
  assert.equal(logs(newcomer.s)[1].rows.length, ROULETTE_LOG_SIZE);
});
