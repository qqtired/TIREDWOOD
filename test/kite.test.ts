import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACT_NONE, ACT_SIT, ACT_WAVE } from '../shared/lobby.ts';
import { ACT_KITE, kiteAmount, kiteOffset, kiteReel } from '../shared/kite.ts';
import { BTN_FORWARD, makeState } from '../shared/sim.ts';
import { decodeSnapshot, makeHeader, type EntitySnap } from '../shared/protocol.ts';
import { bowGeometry, kiteGeometry, spoolGeometry } from '../client/lobby/kitemodel.ts';
import { hold, lastOf, login, setupHub, steps } from './kit.ts';

test('змей запускается у обоих, ходьба сохраняет полёт, остановка сматывает и освобождает руки', () => {
  const { hub, clock } = setupHub({ kite: true });
  const a = login(hub, 'Лётчик');
  const b = login(hub, 'Сосед');
  for (const { c } of [a, b]) hub.onJson(c, { t: 'emote', e: ACT_KITE });
  const pa = hub.lobby.playerOf(a.c)!;
  const pb = hub.lobby.playerOf(b.c)!;
  assert.equal(pa.action, ACT_KITE);
  assert.equal(pb.action, ACT_KITE);
  assert.equal(lastOf(a.s, 'lobby')?.kite, true);
  const z = pa.state.z;
  hold(hub, [a.c], BTN_FORWARD, 20);
  assert.ok(pa.state.z < z);
  assert.equal(pa.action, ACT_KITE, 'движение не отменяет змея');
  const seen: EntitySnap[] = [];
  const count = decodeSnapshot(b.s.bins.at(-1)!.slice().buffer, makeHeader(), makeState(), seen);
  assert.equal(seen.slice(0, count).filter(p => p.hp === ACT_KITE).length, 2, 'оба змея переданы наблюдателю старым бинарным снимком');
  steps(hub, 160);
  assert.equal(pa.arg, 0, 'запуск закончился, змей летит');
  clock.now += 1000;
  hub.onJson(a.c, { t: 'emote', e: ACT_NONE });
  assert.equal(pa.action, ACT_KITE, 'сначала видна фаза сматывания');
  assert.ok(pa.arg > 150);
  steps(hub, 75);
  assert.equal(pa.action, ACT_NONE);
  assert.equal(pb.action, ACT_KITE, 'другой игрок продолжает');
});

test('выключенный флаг, занятые руки, меню и неверный номер не запускают змея', () => {
  const off = setupHub();
  const a = login(off.hub, 'Выключен');
  off.hub.onJson(a.c, { t: 'emote', e: ACT_KITE });
  assert.equal(off.hub.lobby.playerOf(a.c)!.action, ACT_NONE);
  assert.notEqual(lastOf(a.s, 'lobby')?.kite, true);
  const { hub, clock } = setupHub({ kite: true });
  const b = login(hub, 'Занят');
  const p = hub.lobby.playerOf(b.c)!;
  p.action = ACT_SIT;
  hub.onJson(b.c, { t: 'emote', e: ACT_KITE });
  assert.equal(p.action, ACT_SIT);
  p.action = ACT_NONE;
  p.menuOpen = true;
  clock.now += 1000;
  hub.onJson(b.c, { t: 'emote', e: ACT_KITE });
  assert.equal(p.action, ACT_NONE);
  p.menuOpen = false;
  for (const e of [23, -1, 22.5, Number.NaN]) {
    clock.now += 1000;
    hub.onJson(b.c, { t: 'emote', e });
    assert.equal(p.action, ACT_NONE);
  }
});

test('повтор старта не сбрасывает запуск, stop всегда доступен, другая эмоция заменяет змея', () => {
  const { hub, clock } = setupHub({ kite: true });
  const { c } = login(hub, 'Катушка');
  const p = hub.lobby.playerOf(c)!;
  hub.onJson(c, { t: 'emote', e: ACT_KITE });
  steps(hub, 20);
  const progress = p.arg;
  hub.onJson(c, { t: 'emote', e: ACT_KITE });
  assert.equal(p.arg, progress);
  hub.onJson(c, { t: 'emote', e: ACT_NONE });
  assert.ok(p.arg > 150, 'сматывание не блокируется лимитом запуска');
  clock.now += 1500;
  hub.onJson(c, { t: 'emote', e: ACT_WAVE });
  assert.equal(p.action, ACT_WAVE);
  hub.onJson(c, { t: 'emote', e: ACT_NONE });
  assert.equal(p.action, ACT_WAVE, 'stop змея не вмешивается в другие эмоции');
});

test('все 64 игрока могут держать по змею, отключение убирает только свой', () => {
  const { hub } = setupHub({ kite: true });
  const clients = Array.from({ length: 64 }, (_, i) => login(hub, `Змей${i}`, undefined, `10.0.1.${i + 1}`).c);
  for (const c of clients) hub.onJson(c, { t: 'emote', e: ACT_KITE });
  assert.equal(clients.filter(c => hub.lobby.playerOf(c)?.action === ACT_KITE).length, 64);
  hub.disconnect(clients[0]);
  assert.equal(hub.lobby.playerOf(clients[0]), undefined);
  assert.equal(clients.slice(1).filter(c => hub.lobby.playerOf(c)?.action === ACT_KITE).length, 63);
});

test('взгляд ведёт курс и высоту, порыв двигает полотно; раннее сматывание сохраняет длину', () => {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 0, y: 0, z: 0 };
  kiteOffset(0, 0, 0, 1, a);
  kiteOffset(Math.PI / 2, 0.5, 0, 1, b);
  assert.ok(a.z < -5 && b.x < -5, 'курс следует направлению взгляда');
  assert.ok(b.y > a.y, 'взгляд вверх поднимает змея');
  kiteOffset(0, 0, 3, 1, b);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.1, 'порывы видимы без ввода');
  assert.ok(Math.abs(kiteAmount(kiteReel(50)) - kiteAmount(50)) < 0.02, 'нет скачка в полный выпуск');
});

test('полотно, катушка и банты создаются целыми цветными моделями без загрузки текстур', () => {
  for (const build of [kiteGeometry, spoolGeometry, bowGeometry]) {
    const geo = build();
    assert.ok(geo, 'совместимые атрибуты частей собираются в общую геометрию');
    const pos = geo.getAttribute('position');
    assert.ok(pos.count > 6);
    assert.equal(geo.getAttribute('color').count, pos.count);
    assert.ok([...pos.array].every(Number.isFinite));
    geo.dispose();
  }
});

test('потеря связи сматывает змея; смена комнаты не оставляет его на набережной', () => {
  const { hub } = setupHub({ kite: true });
  const a = login(hub, 'Ушёл');
  const b = login(hub, 'Видит');
  hub.onJson(a.c, { t: 'emote', e: ACT_KITE });
  steps(hub, 160);
  const p = hub.lobby.playerOf(a.c)!;
  hub.linkLost(a.c, a.s, 'test disconnect', 1006);
  steps(hub, 76);
  assert.equal(p.action, ACT_NONE, 'резерв места при переподключении не оставляет летящую игрушку');
  hub.onJson(b.c, { t: 'emote', e: ACT_KITE });
  assert.equal(hub.move(b.c, hub.paintball), true);
  assert.equal(hub.lobby.playerOf(b.c), undefined);
  hub.onJson(b.c, { t: 'emote', e: ACT_KITE });
  assert.equal(b.c.room?.kind, 'paintball', 'эмоция 7 не меняет чужой режим');
  steps(hub, 120);
  assert.equal(hub.move(b.c, hub.lobby), true);
  assert.equal(hub.lobby.playerOf(b.c)?.action, ACT_NONE, 'возврат начинается со свободными руками');
});
