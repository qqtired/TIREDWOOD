import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FishNextCast, type QuickKeepContext } from '../client/lobby/fishnextcast.ts';

const at = (over: Partial<QuickKeepContext> = {}): QuickKeepContext => ({
  seat: 2, fishing: true, canKeep: true, fresh: true, typing: false, blocked: false, locked: false, full: false, now: 1000, ...over,
});

test('Space отправляет keep, ждёт успешный FE_DONE1 и разрешает ровно один следующий cast', () => {
  const s = new FishNextCast();
  assert.equal(s.request(at()), 'keep');
  assert.equal(s.request(at()), 'consume', 'свежий второй Space не повторяет keep до подтверждения');
  assert.equal(s.confirm(1, at({ now: 1300 })), true);
  assert.equal(s.confirm(1, at({ now: 1400 })), false, 'дубликат подтверждения не делает ещё заброс');
});

test('держишь Space от reel/repeat, поле ввода, чужое окно или pause — keep не отправляется', () => {
  for (const context of [at({ fresh: false }), at({ typing: true }), at({ blocked: true }), at({ fishing: false }), at({ seat: -1 })]) {
    const s = new FishNextCast();
    assert.equal(s.request(context), 'pass');
    assert.equal(s.confirm(1, at()), false);
  }
  const s = new FishNextCast();
  assert.equal(s.request(at({ locked: true })), 'consume');
  assert.equal(s.confirm(1, at()), false, 'пауза после reel не ставит действие в очередь');
});

test('полный рюкзак, отказ/таймаут, release и смена места отменяют авто, без повторов', () => {
  for (const [done, context] of [
    [1, at({ full: true })], [1, at({ blocked: true })], [1, at({ fishing: false })],
    [1, at({ seat: 3 })], [1, at({ typing: true })], [1, at({ now: 3100 })], [3, at()], [0, at()],
  ] as const) {
    const s = new FishNextCast(); s.request(at());
    assert.equal(s.confirm(done, context), false);
    assert.equal(s.confirm(1, at()), false, 'отмена не оставляет отложенный cast');
  }
});

test('leave/reset/disconnect/новая карточка отменяют ожидание прежнего keep', () => {
  const s = new FishNextCast(); s.request(at()); s.cancel();
  assert.equal(s.confirm(1, at()), false);
  assert.equal(s.request(at({ canKeep: false })), 'pass', 'сундук/хлам/fullbag карточка выбора не принимает Space');
});

test('при заполнении последнего слота keep подтверждён, следующий cast не отправляется', () => {
  const s = new FishNextCast();
  assert.equal(s.request(at({ full: true })), 'keep', 'текущая рыба уже лежит в последнем слоте');
  assert.equal(s.confirm(1, at({ full: true })), false);
});
