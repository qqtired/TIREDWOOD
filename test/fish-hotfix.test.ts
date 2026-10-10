// Хотфикс рыбалки 2.0 (10.10, слова владельца): сундук на 250 — обычный, джекпот один («Сокровища Посейдона»); рыба у скупщиков
// на 35 % дешевле (FISH_PRICE_CUT), опыт и бонус за новый вид не режутся, рыба в рюкзаках сохраняет записанную цену; заброс не
// принимается, пока рыба в руках ждёт выбора; «Прекратить» (X: reel с d = 1) срывает рыбу тем же путём, что и обычный провал.
// Всё — через настоящие Hub/LobbyRoom и диск, как test/fishrelease.test.ts.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FE_BITE, FE_DONE, FE_LOST, FISH, FP_BITE, FP_HOLD, FP_IDLE, FP_REEL } from '../shared/fishing.ts';
import {
  BARKAS_INCOME, CHEST_ANNOUNCE, CHEST_MAX, COLLECTION, FISH_PRICE_CUT, NEW_BONUS2, POSEIDON_COINS, SP_BOOT, SP_CHEST, basePrice, fishPrice2, isPoseidon, reelStyleFor, type Hooked,
} from '../shared/fishrules.ts';
import type { FishCastMods } from '../shared/fishprogress.ts';
import { REEL_MAX_TICKS } from '../shared/fishreel.ts';
import type { LobbyEvent } from '../shared/messages.ts';
import { Hub } from '../server/hub.ts';
import { type FishingHall2 } from '../server/lobby/fishing2.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { EXPERT, playReel, type Play } from './fishbot.ts';
import { SMOKE, allOf, lastOf, login, placeAt } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const sp = (id: string): number => FISH.findIndex((f) => f.id === id);

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-hotfix-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 10, 12) };
  const store = new Store(dir, { now: () => clock.now, log: () => {}, saveDelayMs: 60_000 });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, now: () => clock.now, log: () => {}, build: 'test', smokeToken: SMOKE, fish2: true, weather: 'clear' });
  const a = login(hub, 'Рыбак');
  const b = login(hub, 'Зритель');
  const it = hub.lobby.map.interact.find((i) => i.kind === 'fish' && i.arg === 0)!;
  placeAt(hub, a.c, it.x, it.z);
  hub.onJson(a.c, { t: 'use', id: it.id });
  const hall = hub.lobby.fishing2 as FishingHall2;
  assert.ok(hall);
  hall.rand = () => .5;
  return { hub, clock, a, b, hall, profiles, p: a.c.profile! };
}
type Env = ReturnType<typeof setup>;

function advance(e: Env, n: number): void {
  for (let i = 0; i < n; i++) { e.clock.now += 1000 / TICK_RATE; e.hub.step(); }
}

function fishEvents(e: Env): Array<[number, number, number, number]> {
  return allOf(e.a.s, 'lev').flatMap((m) => m.e as LobbyEvent[]).filter((x) => x[0] === 'fish').map((x) => [x[1], x[2], x[3], x[4]] as [number, number, number, number]);
}

/** Забросить и дождаться поклёвки (what клюёт); возвращает номер события поплавка для подсечки */
function bite(e: Env, what: Hooked): number {
  e.hall.roll = () => ({ ...what });
  e.clock.now += 1100;
  if (e.hall.phase(0) === FP_HOLD) e.hub.onJson(e.a.c, { t: 'fish', a: 'keep' });
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  for (let i = 0; i < 30 * TICK_RATE && e.hall.phase(0) !== FP_BITE; i++) advance(e, 1);
  advance(e, 2);
  assert.equal(e.hall.phase(0), FP_BITE, 'поклёвка');
  return fishEvents(e).filter((x) => x[0] === FE_BITE).at(-1)![2];
}

/** Поймать what честно (опытный игрок, выигрышный сид шкалы) — рыба в руках */
function catchOne(e: Env, what: Hooked): void {
  const n = bite(e, what);
  const style = reelStyleFor(what.sp, e.hall.views()[0].mods!);
  let play: Play | null = null;
  let seed = 0;
  for (let c = 1; c <= 400 && !play; c++) { const p = playReel(style, c, EXPERT); if (p.caught) { play = p; seed = c; } }
  assert.ok(play);
  const rand = e.hall.rand;
  e.hall.rand = () => (seed >>> 0) / 0x1_0000_0000;
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'hook', n });
  e.hall.rand = rand;
  let sent = 0;
  for (let u = 0; u < play.ticks;) {
    const next = Math.min(play.ticks, u + 15);
    advance(e, next - u);
    const i = sent;
    const k: number[] = [];
    while (sent < play.toggles.length && play.toggles[sent] < next) k.push(play.toggles[sent++]);
    e.hub.onJson(e.a.c, { t: 'reel', i, k, u: next, ...(next === play.ticks ? { d: 1 } : {}) });
    u = next;
  }
  advance(e, 2);
  assert.equal(e.hall.phase(0), FP_HOLD, 'рыба в руках');
}

/** Подсечь вовремя: шкала идёт (сид — от сервера), без нажатий */
function hookOnly(e: Env, what: Hooked): void {
  const n = bite(e, what);
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'hook', n });
  assert.equal(e.hall.phase(0), FP_REEL, 'вываживание идёт');
  assert.ok(lastOf(e.a.s, 'fishReel'), 'шкала: сид от сервера');
}

test('сундук на 250 — обычный крупный: в чате без «с джекпотом», без большого тоста; джекпот только у «Сокровищ Посейдона» (1500)', () => {
  assert.equal(CHEST_MAX, 250);
  assert.ok(!isPoseidon(CHEST_MAX), '250 — не джекпот');
  assert.ok(isPoseidon(POSEIDON_COINS), 'джекпот — клад Посейдона');
  const e = setup();
  catchOne(e, { sp: SP_CHEST, g: 5000, coins: CHEST_MAX });
  const said = allOf(e.b.s, 'chat').filter((m) => m.sys);
  assert.deepEqual(said.map((m) => m.text), [`💰 Рыбак вылавливает сундук: ${CHEST_MAX} 🪙!`], 'строка в чат — обычная, как у любого крупного сундука');
  assert.ok(CHEST_MAX >= CHEST_ANNOUNCE);
  assert.ok(!said.some((m) => /джекпот/i.test(m.text)));
  assert.ok(!allOf(e.b.s, 'toast').some((m) => m.big || /джекпот/i.test(m.text)), 'ни большого тоста, ни слова «джекпот»');
  // клад Посейдона — по-прежнему событие на весь сервер
  catchOne(e, { sp: SP_CHEST, g: 5000, coins: POSEIDON_COINS });
  assert.ok(allOf(e.b.s, 'chat').some((m) => m.sys && m.text.includes('Сокровища Посейдона')));
  assert.ok(allOf(e.b.s, 'toast').some((m) => m.big && m.text.includes('Сокровища Посейдона')), 'крупный тост — только клад');
  // карточка клиента: ни надписи «джекпот», ни звука/свечения джекпота у 250 (всё — только за isPoseidon)
  const card = readFileSync(new URL('../client/lobby/fishcard2.ts', import.meta.url), 'utf8');
  assert.ok(!/['"`][^'"`\n]*джекпот/i.test(card), 'в карточке сундука нет строки «джекпот»');
  assert.ok(!card.includes('CHEST_MAX') && !card.includes('CHEST_JACKPOT'), 'карточка не зависит от суммы 250');
  assert.ok(card.includes('if (poseidon) this.sound.slotWin(true)'), 'звук джекпота — только у клада');
});

test('цена рыбы ×0,65 (FISH_PRICE_CUT): вся рыба пристани и баркаса; сундук, хлам, бонус за новый вид и клад не режутся; рюкзак держит записанную цену; опыт тот же', () => {
  assert.equal(FISH_PRICE_CUT, 0.65);
  const barkas = { zone: 'barkas' } as FishCastMods;
  let checked = 0;
  for (const s of COLLECTION) {
    for (const g of FISH[s].g) {
      const full = fishPrice2(s, g, 0, undefined, 1);
      const cut = fishPrice2(s, g);
      assert.equal(cut, Math.max(1, Math.round(full * FISH_PRICE_CUT)), `${FISH[s].id}, ${g} г: ${full} → ${cut}`);
      assert.equal(basePrice(s, g), Math.max(1, Math.round(basePrice(s, g, 1) * FISH_PRICE_CUT)));
      // баркас: ×1,25 поверх урезанной цены
      assert.equal(fishPrice2(s, g, 0, barkas), Math.round(basePrice(s, g) * BARKAS_INCOME));
      // у дорогой рыбы урезание — ровно 35 % (у мелочи округление и минимум 1 жетон добавляют до половины жетона)
      assert.ok(Math.abs(cut - full * FISH_PRICE_CUT) <= 0.5 + 1e-9 || cut === 1, `${FISH[s].id}, ${g} г`);
      checked++;
    }
  }
  assert.ok(checked >= 100, 'проверены все виды коллекции');
  // не рыба — как было
  assert.equal(fishPrice2(SP_CHEST, 5000, 137), 137);
  assert.equal(fishPrice2(SP_CHEST, 5000, POSEIDON_COINS), POSEIDON_COINS);
  assert.equal(fishPrice2(SP_BOOT, 900), 0);
  assert.deepEqual([...NEW_BONUS2], [5, 10, 20, 40, 100, 0, 0, 250], 'бонус за новый вид не режется');

  // улов на сервере: в рюкзаке — урезанная цена, общий опыт — по цене без урезания
  const e = setup();
  const xp0 = e.p.xp;
  catchOne(e, { sp: sp('tuna'), g: 60_000, coins: 0 });
  const land = lastOf(e.a.s, 'fishLand')!;
  const full = fishPrice2(sp('tuna'), 60_000, 0, undefined, 1);
  assert.equal(land.price, fishPrice2(sp('tuna'), 60_000));
  assert.equal(land.price, Math.round(full * FISH_PRICE_CUT));
  assert.deepEqual(e.p.fishing.bag.map((x) => x.p), [land.price], 'в рюкзаке — цена поимки');
  assert.equal(e.p.xp - xp0, full + NEW_BONUS2[3], 'общий опыт — по прежней цене + бонус нового вида');

  // рыба, что лежала в рюкзаке до хотфикса, продаётся по записанной цене — её не пересчитывают
  e.p.fishing.bag = [{ n: 90, f: 'scad', g: 300, p: 40, m: 0 }, { n: 91, f: 'tuna', g: 60_000, p: 900, m: 0 }];
  const sold = e.profiles.sellFish(e.p);
  assert.deepEqual(sold, { n: 2, coins: 940 });
});

test('заброс не принимается, пока рыба в руках ждёт выбора: сервер ничего не решает за игрока; выбрал — заброс идёт', () => {
  const e = setup();
  catchOne(e, { sp: sp('scad'), g: 300, coins: 0 });
  const casts = e.p.stats.fsCasts;
  const bag = e.p.fishing.bag.length;
  assert.equal(bag, 1, 'рыба уже в рюкзаке, но выбор ещё не сделан');
  for (let i = 0; i < 3; i++) {
    e.clock.now += 1100;
    e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
    advance(e, 2);
    assert.equal(e.hall.phase(0), FP_HOLD, `ЛКМ №${i + 1}: рыба всё ещё в руках`);
  }
  assert.equal(e.p.stats.fsCasts, casts, 'заброса не было');
  assert.equal(e.p.fishing.bag.length, bag, 'ничего не продано и не отпущено');
  assert.ok(!fishEvents(e).some((x) => x[0] === FE_DONE), 'сервер не закрыл «в руках» за игрока');
  // выбрал «Отпустить» — рыба в воде, и только теперь заброс идёт
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'release' });
  assert.equal(e.hall.phase(0), FP_IDLE);
  assert.equal(e.p.fishing.bag.length, 0);
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  assert.notEqual(e.hall.phase(0), FP_IDLE);
  assert.equal(e.p.stats.fsCasts, casts + 1);
  // хлам и сундук выбора не требуют — «в руках» кончается заброском, как раньше
  catchOne(e, { sp: SP_CHEST, g: 5000, coins: 90 });
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  assert.notEqual(e.hall.phase(0), FP_HOLD, 'у сундука выбора нет — заброс из рук идёт');
});

test('«Прекратить» (X): reel с d = 1 до конца шкалы — рыба срывается, как при обычном провале; ничего не засчитано, заброс снова идёт', () => {
  const what = { sp: sp('scad'), g: 300, coins: 0 };
  // сдался: клиент поиграл полсекунды (зону вверх не держал) и прислал последнее сообщение с d = 1
  const quit = setup();
  hookOnly(quit, what);
  advance(quit, 30);
  quit.hub.onJson(quit.a.c, { t: 'reel', i: 0, k: [], u: 30, d: 1 });
  advance(quit, 2);
  // обычный провал: рыба сорвалась сама — клиент молча тянул до конца шкалы
  const fail = setup();
  hookOnly(fail, what);
  for (let u = 0; u < REEL_MAX_TICKS && fail.hall.phase(0) === FP_REEL;) {
    const next = u + 15;
    advance(fail, 15);
    fail.hub.onJson(fail.a.c, { t: 'reel', i: 0, k: [], u: next });
    u = next;
  }
  advance(fail, 2);
  for (const e of [quit, fail]) {
    assert.equal(e.hall.phase(0), FP_IDLE, 'удочка свободна');
    assert.deepEqual(fishEvents(e).filter((x) => x[0] === FE_LOST), [[FE_LOST, 0, 0, 0]], 'все видят: сорвалась');
    assert.equal(lastOf(e.a.s, 'fishLand'), undefined, 'улова нет');
    assert.equal(e.p.stats.fsLost, 1);
    assert.equal(e.p.stats.fsCaught, 0);
    assert.deepEqual(e.p.album, {});
    assert.deepEqual(e.p.fishing.bag, []);
  }
  assert.deepEqual(
    { lost: quit.p.stats.fsLost, tokens: quit.p.tokens, xp: quit.p.fishing.xp, ph: quit.hall.phase(0) },
    { lost: fail.p.stats.fsLost, tokens: fail.p.tokens, xp: fail.p.fishing.xp, ph: fail.hall.phase(0) },
    'сдача и провал — один и тот же итог',
  );
  // управление вернулось: можно забрасывать снова
  quit.clock.now += 1100;
  quit.hub.onJson(quit.a.c, { t: 'fish', a: 'cast' });
  assert.notEqual(quit.hall.phase(0), FP_IDLE);
  // после сдачи следующая честная поимка засчитывается как обычно
  catchOne(quit, { sp: sp('scad'), g: 300, coins: 0 });
  assert.equal(quit.p.stats.fsCaught, 1);
});
