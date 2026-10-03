// Профили: вход по ключу устройства, ники, коды для второго устройства, бонус, покупки, ограничения.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { DAILY_BONUS, START_TOKENS } from '../shared/economy.ts';
import { RECENT_ROWS } from '../shared/messages.ts';
import { Profiles, RateLimiter, hashKey, nickKey, validKey, validNick, type LoginResult } from '../server/profiles.ts';
import { Store } from '../server/store.ts';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function setup(start = Date.UTC(2026, 9, 1, 12)) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-prof-'));
  dirs.push(dir);
  const clock = { now: start };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  return { store, profiles, clock };
}

let keyN = 0;
function key(): string {
  return `testkey-${String(++keyN).padStart(10, '0')}-abcdef`;
}

function ok(r: LoginResult) {
  assert.ok(r.ok, `ожидали вход, а получили ${r.ok ? '' : r.code}`);
  return r;
}

test('ключ и ник: проверки', () => {
  assert.ok(validKey('abcdefghijklmnop'));
  assert.ok(!validKey('short'));
  assert.ok(!validKey('bad key with spaces!!'));
  assert.ok(!validKey(42));
  assert.equal(hashKey('abc').length, 64);
  assert.equal(nickKey('Ёжик'), nickKey('ежик'));
  assert.equal(validNick('  Ёжик  '), 'Ёжик');
  for (const bad of ['a', '!!!', '12', 'Бот', 'пудинг', 'Система', '', null]) assert.equal(validNick(bad), null, String(bad));
});

test('новый профиль, повторный вход тем же ключом, «нужен ник», занятый ник', () => {
  const { profiles, store } = setup();
  const k = key();
  assert.deepEqual(profiles.login({ key: k }, '1.1.1.1'), { ok: false, code: 'need_nick' });
  assert.deepEqual(profiles.login({ key: k, nick: '!' }, '1.1.1.1'), { ok: false, code: 'bad_nick' });
  const a = ok(profiles.login({ key: k, nick: 'Ёжик' }, '1.1.1.1'));
  assert.equal(a.created, true);
  assert.equal(a.daily, 0, 'в день создания бонуса нет');
  assert.equal(a.profile.tokens, START_TOKENS);
  assert.equal(a.profile.outfit.h, 'cap');
  assert.ok(!a.profile.keyHashes.includes(k), 'ключ хранится только хешем');
  const again = ok(profiles.login({ key: k }, '2.2.2.2'));
  assert.equal(again.created, false);
  assert.equal(again.profile.id, a.profile.id);
  assert.deepEqual(profiles.login({ key: key(), nick: 'ежик' }, '1.1.1.1'), { ok: false, code: 'nick_taken' });
  assert.deepEqual(profiles.login({ key: 'плохой' }, '1.1.1.1'), { ok: false, code: 'bad_key' });
  assert.equal(store.state.profiles.length, 1);
});

test('код для второго устройства: одноразовый, до 5 ключей на профиль', () => {
  const { profiles, clock } = setup();
  const a = ok(profiles.login({ key: key(), nick: 'Кот' }, '1.1.1.1')).profile;
  const { code, until } = profiles.issueCode(a);
  assert.match(code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  assert.equal(until, clock.now + 10 * 60_000);
  const k2 = key();
  const b = ok(profiles.login({ key: k2, code: ` ${code.toLowerCase().replace('-', ' ')} ` }, '1.1.1.1'));
  assert.equal(b.profile.id, a.id);
  assert.equal(a.keyHashes.length, 2);
  assert.deepEqual(profiles.login({ key: key(), code }, '1.1.1.1'), { ok: false, code: 'bad_code' }, 'второй раз не работает');
  ok(profiles.login({ key: k2 }, '1.1.1.1'));
  for (let i = 0; i < 6; i++) ok(profiles.login({ key: key(), code: profiles.issueCode(a).code }, '3.3.3.3'));
  assert.equal(a.keyHashes.length, 5);
  // просроченный код
  const late = profiles.issueCode(a).code;
  clock.now += 10 * 60_000 + 1;
  assert.deepEqual(profiles.login({ key: key(), code: late }, '4.4.4.4'), { ok: false, code: 'bad_code' });
  // новый код отменяет прежний
  const c1 = profiles.issueCode(a).code;
  profiles.issueCode(a);
  assert.deepEqual(profiles.login({ key: key(), code: c1 }, '4.4.4.4'), { ok: false, code: 'bad_code' });
});

test('подбор кодов ограничен: 10 неверных в час с адреса', () => {
  const { profiles } = setup();
  for (let i = 0; i < 10; i++) assert.deepEqual(profiles.login({ key: key(), code: 'AAAA-AAAA' }, '6.6.6.6'), { ok: false, code: 'bad_code' });
  assert.deepEqual(profiles.login({ key: key(), code: 'AAAA-AAAA' }, '6.6.6.6'), { ok: false, code: 'rate' });
  assert.deepEqual(profiles.login({ key: key(), code: 'AAAA-AAAA' }, '7.7.7.7'), { ok: false, code: 'bad_code' });
});

test('ежедневный бонус: в день создания 0, назавтра +50, повторно 0', () => {
  const { profiles, clock } = setup(Date.UTC(2026, 9, 1, 12));
  const k = key();
  ok(profiles.login({ key: k, nick: 'Сова' }, ''));
  assert.equal(ok(profiles.login({ key: k }, '')).daily, 0);
  clock.now = Date.UTC(2026, 9, 1, 21, 0, 1); // уже 2 октября по Москве
  const r = ok(profiles.login({ key: k }, ''));
  assert.equal(r.daily, DAILY_BONUS);
  assert.equal(r.profile.tokens, START_TOKENS + DAILY_BONUS);
  assert.equal(ok(profiles.login({ key: k }, '')).daily, 0);
});

test('покупки: не хватает, купил, уже есть, не продаётся; выдача с джекпота', () => {
  const { profiles } = setup();
  const p = ok(profiles.login({ key: key(), nick: 'Лиса' }, '')).profile;
  p.tokens = 299;
  assert.equal(profiles.buy(p, 'h:panama'), 'no_tokens');
  p.tokens = 340;
  assert.equal(profiles.buy(p, 'h:panama'), 'ok');
  assert.equal(p.tokens, 40);
  assert.ok(p.owned.includes('h:panama'));
  assert.equal(profiles.buy(p, 'h:panama'), 'owned');
  assert.equal(profiles.buy(p, 'h:cap'), 'owned');
  assert.equal(profiles.buy(p, 'h:crown'), 'not_for_sale');
  assert.equal(profiles.buy(p, 'a:epaulets'), 'not_for_sale');
  assert.equal(profiles.buy(p, 'x:nothing'), 'unknown');
  assert.equal(profiles.buy(p, 42), 'unknown');
  assert.equal(profiles.grant(p, 'h:crown'), true);
  assert.equal(profiles.grant(p, 'h:crown'), false);
  assert.equal(profiles.setOutfit(p, { ...p.outfit, h: 'crown', e: 'monocle' }).h, 'crown');
  assert.equal(p.outfit.e, 'normal', 'монокля нет — глаза обычные');
  assert.equal(profiles.spend(p, 41), false);
  assert.equal(profiles.spend(p, 40), true);
  assert.equal(p.tokens, 0);
  profiles.credit(p, 12);
  assert.equal(p.tokens, 12);
});

test('новые профили: не больше 5 в час с одного адреса', () => {
  const { profiles, clock } = setup();
  for (let i = 0; i < 5; i++) ok(profiles.login({ key: key(), nick: `Игрок${i}` }, '5.5.5.5'));
  assert.deepEqual(profiles.login({ key: key(), nick: 'Игрок9' }, '5.5.5.5'), { ok: false, code: 'rate' });
  ok(profiles.login({ key: key(), nick: 'Игрок9' }, '8.8.8.8'));
  clock.now += 3600_000 + 1;
  ok(profiles.login({ key: key(), nick: 'Игрок10' }, '5.5.5.5'));
});

test('смена ника: раз в минуту, занятые нельзя', () => {
  const { profiles, clock } = setup();
  const a = ok(profiles.login({ key: key(), nick: 'Барсук' }, '')).profile;
  ok(profiles.login({ key: key(), nick: 'Енот' }, ''));
  assert.equal(profiles.rename(a, 'Бобр'), 'ok');
  assert.equal(a.nick, 'Бобр');
  assert.equal(profiles.rename(a, 'Выдра'), 'rate');
  clock.now += 61_000;
  assert.equal(profiles.rename(a, 'енот'), 'nick_taken');
  assert.equal(profiles.rename(a, '?'), 'bad_nick');
  assert.equal(profiles.rename(a, 'Выдра'), 'ok');
  assert.deepEqual(profiles.login({ key: key(), nick: 'Барсук' }, ''), { ok: true, profile: profiles.byId(3)!, created: true, daily: 0 }, 'старый ник освободился');
});

test('доска почёта: самые богатые и самые побеждающие', () => {
  const { profiles } = setup();
  const list = ['Аист', 'Бык', 'Волк', 'Гусь', 'Дрозд', 'Ёрш', 'Жук'].map((n) => ok(profiles.login({ key: key(), nick: n }, '')).profile);
  list.forEach((p, i) => {
    p.tokens = 100 + i * 10;
    p.stats.pbWins = i % 3;
  });
  const h = profiles.honor();
  assert.deepEqual(h.rich.map((r) => r.nick), ['Жук', 'Ёрш', 'Дрозд', 'Гусь', 'Волк']);
  assert.deepEqual(h.wins.map((r) => [r.nick, r.n]), [['Волк', 2], ['Ёрш', 2], ['Бык', 1], ['Дрозд', 1]]);
  assert.equal(h.lastJackpot, null);
});

test('последние входы: сначала кто в игре, потом кто ушёл позже; секунды назад; не больше 8 строк', () => {
  const { profiles, clock } = setup();
  const t0 = clock.now;
  const names = ['Аист', 'Бык', 'Волк', 'Гусь', 'Дрозд', 'Ёрш', 'Жук', 'Зубр', 'Ибис', 'Кит'];
  const list = names.map((n) => ok(profiles.login({ key: key(), nick: n }, '')).profile);
  // i-й ушёл через i минут, сейчас — через 10
  list.forEach((p, i) => {
    clock.now = t0 + i * 60_000;
    profiles.touch(p);
  });
  clock.now = t0 + 10 * 60_000;
  const online = new Set([list[0].id, list[1].id]);
  const r = profiles.recent((pid) => online.has(pid));
  assert.equal(r.length, RECENT_ROWS);
  assert.deepEqual(r.map((x) => x.nick), ['Бык', 'Аист', 'Кит', 'Ибис', 'Зубр', 'Жук', 'Ёрш', 'Дрозд']);
  assert.deepEqual(r.slice(0, 2).map((x) => [x.on, x.ago]), [[true, 0], [true, 0]]);
  assert.deepEqual(r.slice(2).map((x) => [x.on, x.ago]), [[false, 60], [false, 120], [false, 180], [false, 240], [false, 300], [false, 360]]);
});

test('ограничитель частоты: окно скользит', () => {
  let now = 0;
  const rl = new RateLimiter(() => now);
  assert.ok(rl.hit('k', 2, 1000));
  assert.ok(rl.hit('k', 2, 1000));
  assert.ok(!rl.hit('k', 2, 1000));
  assert.ok(!rl.peek('k', 2, 1000));
  now = 1001;
  assert.ok(rl.peek('k', 2, 1000));
  assert.ok(rl.hit('k', 2, 1000));
});


test('premium purchases charge exact balance once; old ownership, exclusive rewards and fishing progress survive reload', () => {
  const { profiles, store, clock } = setup();
  const loginKey = key();
  const p = ok(profiles.login({ key: loginKey, nick: 'Орбитальщик' }, '')).profile;
  p.owned = ['h:panama', 'p:gold', 'h:crown', 'h:angler', 'e:angler', 'a:angler'];
  p.album = { hamsa: [31, 4] };
  p.fishing = { xp: 1234, questsDone: 5, questCaught: 3, rod: 2, beerUntil: clock.now + 5000 };
  const album = structuredClone(p.album);
  const fishing = { ...p.fishing };
  const oldOwned = [...p.owned];
  for (const id of ['h:astronaut', 'h:storm', 'a:jetpack', 'e:prism']) {
    p.tokens = 11999;
    assert.equal(profiles.buy(p, id), 'no_tokens');
    assert.equal(p.tokens, 11999);
    p.tokens = 12000;
    assert.equal(profiles.buy(p, id), 'ok');
    assert.equal(p.tokens, 0);
    assert.equal(profiles.buy(p, id), 'owned');
    assert.equal(p.tokens, 0);
    assert.equal(p.owned.filter(value => value === id).length, 1);
  }
  for (const id of oldOwned) {
    assert.equal(profiles.buy(p, id), 'owned');
    assert.equal(p.tokens, 0);
  }
  profiles.setOutfit(p, { ...p.outfit, h: 'astronaut', e: 'prism', a: 'jetpack' });
  store.close();
  const reloaded = new Store(store.dir, { log: () => {}, now: () => clock.now });
  reloaded.load();
  const after = ok(new Profiles(reloaded, { now: () => clock.now }).login({ key: loginKey }, '')).profile;
  assert.deepEqual(after.owned, p.owned);
  assert.deepEqual(after.outfit, p.outfit);
  assert.deepEqual(after.album, album);
  assert.deepEqual(after.fishing, fishing);
  assert.equal(after.tokens, 0);
  reloaded.close();
});

test('unearned angler collection rewards remain unavailable for purchase even with a premium balance', () => {
  const { profiles } = setup();
  const p = ok(profiles.login({ key: key(), nick: 'Коллекционер' }, '')).profile;
  p.tokens = 48000;
  for (const id of ['h:angler', 'e:angler', 'a:angler', 'h:crown', 'p:gold', 'h:fool', 'a:epaulets']) {
    assert.equal(profiles.buy(p, id), 'not_for_sale');
    assert.equal(p.tokens, 48000);
    assert.equal(p.owned.includes(id), false);
  }
});
