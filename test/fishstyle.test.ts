// Награды рыбалки (выпуск 7): лестница по видам в журнале, выдача сервером при входе и после улова, снасти надеваются
// сами и меняются вне примерочной, одежда — только в примерочной; новые поля наряда — без сброса старых профилей.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import { COLLECTION, COLLECTION_SIZE } from '../shared/fishrules.ts';
import {
  ALL, GEAR_SLOTS, ISLE_LADDER, LADDER, REWARD_INFO, earnedItems, fishTotal, gearOnly, needOf, nextStep, stepNeed,
} from '../shared/fishstyle.ts';
import { DEFAULT_OUTFIT, EXTRA_SLOTS, ITEMS, itemById, sameOutfit, sanitizeOutfit, slotKey, type Outfit } from '../shared/outfit.ts';
import { grantLadder, ladderAnnounce, ladderToast } from '../server/fishstyle.ts';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store, normalizeProfile } from '../server/store.ts';
import { ACT_WARDROBE } from '../shared/lobby.ts';
import { SMOKE, allOf, lastOf, login } from './kit.ts';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function env(fish2 = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fishstyle-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 3, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, fish2 });
  return { hub, store, profiles, clock };
}

/** Альбом с первыми n видами коллекции */
function album(n: number): Record<string, [number, number]> {
  const a: Record<string, [number, number]> = {};
  for (const sp of COLLECTION.slice(0, n)) a[FISH[sp].id] = [FISH[sp].g[0], 1];
  return a;
}

test('лестница: каждые 5 видов до 45, финал — все виды; вещи — трофеи каталога, без повторов; сеты на 20, 30 и все', () => {
  const needs = LADDER.map((s) => s.need);
  assert.deepEqual(needs, [5, 10, 15, 20, 25, 30, 35, 40, 45, ALL]);
  const ids = LADDER.flatMap((s) => s.items);
  assert.equal(new Set(ids).size, ids.length, 'вещь только на одной ступени');
  for (const id of ids) {
    const it = itemById(id);
    assert.ok(it, `${id} есть в каталоге`);
    assert.equal(it.tier, 'trophy', `${id} не продаётся`);
    assert.ok(REWARD_INFO[id]?.text, `${id}: описание`);
  }
  assert.deepEqual(LADDER.filter((s) => s.set).map((s) => [s.need, s.set]), [[20, 'Бывалый рыбак'], [30, 'Капитан баркаса'], [ALL, 'Хозяин глубин']]);
  // первые поплавки — на 15 видах; прежний рыбацкий комплект — сет на 20
  assert.equal(needOf('b:duck', 51), 15);
  assert.deepEqual(LADDER[3].items, ['h:angler', 'e:angler', 'a:angler']);
  // все трофеи рыбалки нового выпуска кто-то выдаёт (вещи острова — своя лестница, test/islecos.test.ts)
  const isle = ISLE_LADDER.flatMap((s) => s.items);
  for (const it of ITEMS.filter((i) => i.tier === 'trophy')) assert.ok(ids.includes(it.id) || isle.includes(it.id), `${it.id} на лестнице`);
});

test('пороги считаются от числа видов в коде: выше — сливаются с финалом; 51 вид — финал на 51', () => {
  assert.equal(fishTotal(), COLLECTION.length);
  assert.deepEqual(LADDER.map((s) => stepNeed(s, 51)), [5, 10, 15, 20, 25, 30, 35, 40, 45, 51]);
  assert.deepEqual(LADDER.map((s) => stepNeed(s, 32)), [5, 10, 15, 20, 25, 30, 32, 32, 32, 32]);
  assert.deepEqual(earnedItems(4, 51), []);
  assert.deepEqual(earnedItems(14, 51), ['w:chart', 'r:hazel', 'a:kukan']);
  assert.equal(earnedItems(50, 51).includes('h:captain'), false);
  assert.equal(earnedItems(51, 51).includes('h:captain'), true);
  assert.equal(nextStep(22, 51)?.need, 25);
  assert.equal(nextStep(46, 51)?.need, ALL);
  assert.equal(nextStep(51, 51), null);
});

test('52 вида в игре (04.10: + кальмар): ступени 35/40/45 и финал на 52 выдаются ровно на пороге, раньше — ничего', () => {
  assert.equal(COLLECTION.length, 52);
  assert.equal(COLLECTION_SIZE, COLLECTION.length);
  assert.equal(fishTotal(), 52);
  assert.equal(FISH[COLLECTION[51]].id, 'kalmar', 'божественный — последним в журнале');
  assert.deepEqual(LADDER.map((s) => stepNeed(s)), [5, 10, 15, 20, 25, 30, 35, 40, 45, 52]);
  const e = env();
  const p = login(e.hub, 'Коллекционер').c.profile!;
  const at = new Map(LADDER.map((s) => [stepNeed(s), s.items]));
  // по одному виду: вещи ступени появляются ровно на её пороге, между порогами — ничего
  for (let n = 0; n <= COLLECTION.length; n++) {
    p.album = album(n);
    const g = grantLadder(e.profiles, p);
    assert.deepEqual(g.items, at.get(n) ?? [], `${n} видов`);
    assert.equal(g.master, n === 52, `${n} видов: финал`);
    assert.deepEqual(p.owned, earnedItems(n), `${n} видов: всё положенное и только оно`);
  }
  for (const [id, need] of [['a:net', 35], ['w:night', 40], ['b:firefly', 45], ['h:captain', 52], ['n:anchor', 52]] as const) {
    assert.equal(needOf(id), need, id);
    assert.equal(earnedItems(need - 1).includes(id), false, `${id}: не раньше ${need}`);
  }
  // кто собрал все 51 до 04.10, награды финала не теряет: лестница только выдаёт, не отбирает
  const old = login(e.hub, 'Старожил').c.profile!;
  for (const id of ['h:captain', 'n:anchor']) e.profiles.grant(old, id);
  old.album = album(51);
  assert.equal(grantLadder(e.profiles, old).master, false);
  assert.ok(old.owned.includes('h:captain') && old.owned.includes('n:anchor'), 'финал 51 вида остаётся');
});

test('наряд: новые слоты только когда надето не «пустое»; чужое — снимается; старые наряды не меняются', () => {
  const owned = ['s:parrot', 'r:gold', 'b:duck', 'w:night', 'n:anchor'];
  const full: Outfit = { ...DEFAULT_OUTFIT, s: 'parrot', r: 'gold', b: 'duck', w: 'night', n: 'anchor' };
  assert.deepEqual(sanitizeOutfit(full, owned), full);
  assert.deepEqual(sanitizeOutfit(full, []), DEFAULT_OUTFIT, 'без наград — как раньше, без лишних полей');
  assert.deepEqual(sanitizeOutfit({ ...DEFAULT_OUTFIT, r: 'basic', b: 'classic', w: 'wood', s: 'none', n: 'none' }, []), DEFAULT_OUTFIT);
  assert.deepEqual(sanitizeOutfit({ ...DEFAULT_OUTFIT, r: 'nope', b: 7 }, owned), DEFAULT_OUTFIT);
  for (const slot of EXTRA_SLOTS) assert.equal(itemById(`${slot}:${slotKey(DEFAULT_OUTFIT, slot)}`)?.tier, 'free');
  assert.ok(sameOutfit(DEFAULT_OUTFIT, { ...DEFAULT_OUTFIT, r: 'basic' }));
  assert.ok(!sameOutfit(DEFAULT_OUTFIT, { ...DEFAULT_OUTFIT, b: 'duck' }));
  // старый профиль из файла: поля нет — всё на месте, ничего не добавилось
  const old = normalizeProfile({ id: 7, nick: 'Старик', owned: ['h:angler', 'e:angler', 'a:angler'], outfit: { c: 1, c2: 2, p: 'none', e: 'angler', h: 'angler', a: 'angler' } })!;
  assert.deepEqual(old.outfit, { c: 1, c2: 2, p: 'none', e: 'angler', h: 'angler', a: 'angler' });
  assert.deepEqual(old.owned, ['h:angler', 'e:angler', 'a:angler']);
});

test('вне примерочной меняются только снасти и значок; пропущенное поле — «пустая» вещь', () => {
  const cur: Outfit = { ...DEFAULT_OUTFIT, h: 'captain', s: 'gull', r: 'hazel' };
  const next = gearOnly(cur, { c: 1, h: 'crown', a: 'chain', s: 'parrot', b: 'duck', w: 'chart' });
  assert.deepEqual(next, { ...DEFAULT_OUTFIT, h: 'captain', s: 'gull', b: 'duck', w: 'chart' });
  assert.deepEqual(GEAR_SLOTS, ['r', 'b', 'w', 'n']);
});

test('выдача: всё положенное по альбому, один раз; снасти надеваются сами (последняя в слоте), одежда — нет', () => {
  const e = env();
  const a = login(e.hub, 'Рыбак');
  const p = a.c.profile!;
  p.album = album(16);
  const g = grantLadder(e.profiles, p);
  assert.deepEqual(g.items, ['w:chart', 'r:hazel', 'a:kukan', 'b:quill', 'b:duck']);
  assert.deepEqual(g.sets, []);
  assert.equal(g.master, false);
  assert.equal(g.outfit, true);
  assert.deepEqual(p.owned, g.items);
  assert.equal(p.outfit.w, 'chart');
  assert.equal(p.outfit.r, 'hazel');
  assert.equal(p.outfit.b, 'duck');
  assert.equal(p.outfit.a, 'none', 'кукан — в примерочной');
  // повтор ничего не выдаёт и не трогает наряд (вернул старый поплавок — так и остаётся)
  p.outfit = sanitizeOutfit({ ...p.outfit, b: 'classic' }, p.owned);
  const again = grantLadder(e.profiles, p);
  assert.deepEqual(again, { items: [], sets: [], master: false, outfit: false });
  assert.equal(slotKey(p.outfit, 'b'), 'classic');
  assert.match(ladderToast(g), /поплавок «Уточка»/);
  assert.match(ladderToast(g), /одежда \(1\) — в примерочной/);
});

test('сеты и финал: строки в чат; ветеран со старым комплектом его сохраняет; финал — за все виды', () => {
  const e = env();
  const a = login(e.hub, 'Ветеран');
  const p = a.c.profile!;
  p.owned = ['h:angler', 'e:angler', 'a:angler', 'h:tophat'];
  p.album = album(30);
  const g = grantLadder(e.profiles, p);
  assert.ok(!g.items.includes('h:angler'), 'старый комплект не выдаётся второй раз');
  assert.deepEqual(g.sets.map((s) => s.name), ['Капитан баркаса']);
  for (const id of ['h:angler', 'e:angler', 'a:angler', 'h:tophat', 'h:sou', 'a:oilskin', 's:gull', 'r:carved']) assert.ok(p.owned.includes(id), id);
  assert.deepEqual(ladderAnnounce('Ветеран', g), ['🎣 Ветеран поймал 30 видов рыб — сет «Капитан баркаса»!']);
  p.album = album(COLLECTION.length);
  const fin = grantLadder(e.profiles, p);
  assert.equal(fin.master, true);
  assert.ok(fin.items.includes('n:anchor') && fin.items.includes('r:gold'));
  assert.equal(p.outfit.n, 'anchor');
  assert.equal(p.outfit.r, 'gold');
  assert.equal(p.outfit.h, DEFAULT_OUTFIT.h, 'фуражку надевает сам в примерочной');
  assert.match(ladderAnnounce('Ветеран', fin).at(-1)!, /собрал всю коллекцию/);
});

test('вход: награды по альбому выдаются сразу (тост и чат), без FISH2 — ничего; профиль сохраняется', () => {
  for (const fish2 of [true, false]) {
    const e = env(fish2);
    const first = login(e.hub, 'Сосед');
    const p = first.c.profile!;
    p.album = album(21);
    e.hub.disconnect(first.c);
    const b = login(e.hub, 'Зритель');
    const again = login(e.hub, 'Сосед', first.key);
    const me = lastOf(again.s, 'me')!;
    if (!fish2) {
      assert.deepEqual(me.owned, []);
      continue;
    }
    assert.deepEqual(me.owned, earnedItems(21));
    assert.equal(me.outfit.b, 'duck');
    assert.match(allOf(again.s, 'toast').map((m) => m.text).join('\n'), /Награды коллекции рыб/);
    assert.ok(allOf(b.s, 'chat').some((m) => m.sys && m.text.includes('сет «Бывалый рыбак»')));
    e.store.flush();
    const restored = new Store(e.store.dir, { log: () => {} });
    restored.load();
    const saved = restored.state.profiles.find((x) => x.nick === 'Сосед')!;
    assert.deepEqual(saved.owned, earnedItems(21));
    assert.equal(saved.outfit.r, 'hazel');
    restored.close();
  }
});

test('снасти из журнала меняются где угодно, одежда — только в примерочной; без перемен — без рассылки', () => {
  const e = env();
  const a = login(e.hub, 'Модник');
  const b = login(e.hub, 'Глядящий');
  const p = a.c.profile!;
  p.album = album(16);
  grantLadder(e.profiles, p);
  b.s.msgs.length = 0;
  // вне примерочной: вернуть обычную удочку можно, надеть чужую шапку — нет
  e.hub.onJson(a.c, { t: 'outfit', o: { ...p.outfit, r: 'basic', h: 'tophat', b: 'quill' } });
  assert.equal(slotKey(p.outfit, 'r'), 'basic');
  assert.equal(p.outfit.b, 'quill');
  assert.equal(p.outfit.h, DEFAULT_OUTFIT.h);
  assert.equal(lastOf(b.s, 'outfitOf')!.o.b, 'quill');
  // то же самое ещё раз — ничего не рассылается
  b.s.msgs.length = 0;
  e.clock.now += 2000;
  e.hub.onJson(a.c, { t: 'outfit', o: { ...p.outfit } });
  assert.equal(lastOf(b.s, 'outfitOf'), undefined);
  // неполученная снасть не надевается
  e.hub.onJson(a.c, { t: 'outfit', o: { ...p.outfit, r: 'gold' } });
  assert.equal(slotKey(p.outfit, 'r'), 'basic');
  assert.notEqual(e.hub.lobby.playerOf(a.c)!.action, ACT_WARDROBE);
});
