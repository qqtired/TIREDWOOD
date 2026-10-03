// Связь: пульс сервера (терпит 3 пропуска подряд) и причины отключения в журнале.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROTOCOL_VERSION } from '../shared/constants.ts';
import { CLOSE_SILENCE } from '../shared/messages.ts';
import { closeReason } from '../server/hub.ts';
import { MsgBudget, PULSE_MISS, PULSE_MS, Pulse } from '../server/pulse.ts';
import { connect, login, setupHub } from './kit.ts';

test('пульс: молчит три пульса подряд (6–8 с) — отключить, не раньше', () => {
  const p = new Pulse(0);
  let t = 0;
  for (let i = 0; i < PULSE_MISS; i++) {
    t += PULSE_MS;
    assert.equal(p.beat(t), i + 1, `пульс ${i + 1} — ещё пингуем`);
  }
  t += PULSE_MS;
  assert.equal(p.beat(t), null);
  assert.equal(p.silentS(t), 8);
});

test('пульс: любое сообщение или ответ сбрасывает счёт; время туда-обратно — только по последнему пингу', () => {
  const p = new Pulse(0);
  p.beat(2000);
  p.beat(4000);
  // ответ на первый пинг пришёл поздно: живой, но пинг по нему не меряем
  assert.equal(p.pong(4100, '1'), null);
  assert.equal(p.missed, 0);
  assert.equal(p.pong(4150, '2'), 150);
  for (let i = 0; i < 10; i++) {
    assert.notEqual(p.beat(6000 + i * 2000), null, 'клиент шлёт ввод — не отключаем');
    p.alive(6500 + i * 2000);
  }
});

test('ограничение частоты: пачка после 8 с замирания связи — не флуд, 400 в секунду подряд — флуд', () => {
  const b = new MsgBudget(0);
  let t = 0;
  // минута обычной игры: 62 сообщения в секунду
  for (let i = 0; i < 60 * 62; i++) assert.ok(b.take((t += 1000 / 62)), 'обычная игра');
  // связь замерла на 8 с, потом всё накопленное пришло разом, и игра идёт дальше
  t += 8000;
  for (let i = 0; i < 8 * 62; i++) assert.ok(b.take(t), 'пачка после замирания');
  for (let i = 0; i < 30 * 62; i++) assert.ok(b.take((t += 1000 / 62)), 'после пачки');
  // флуд: 400 в секунду — отрезает за несколько секунд
  let cut = -1;
  for (let i = 0; i < 400 * 10; i++) {
    if (!b.take((t += 1000 / 400))) {
      cut = i;
      break;
    }
  }
  assert.ok(cut > 0 && cut < 400 * 5, `флуд отрезан на ${cut}-м сообщении`);
});

test('причины закрытия по коду', () => {
  assert.equal(closeReason(1006), 'обрыв связи');
  assert.equal(closeReason(1001), 'закрыл вкладку или обновил страницу');
  assert.equal(closeReason(1008, 'flood'), 'слишком много сообщений');
  assert.equal(closeReason(4001), 'зашёл в другом окне');
  assert.equal(closeReason(CLOSE_SILENCE), 'не слышал сервер 8 с');
  assert.equal(closeReason(3999), 'код 3999');
});

test('журнал: выход — с причиной и временем в игре; переподключение — с прошлой причиной', () => {
  const lines: string[] = [];
  const { hub, clock } = setupHub({ log: (s) => lines.push(s) });
  const a = login(hub, 'Свошник');
  clock.now += 5 * 60_000;
  hub.disconnect(a.c, 'нет ответа 6 с');
  assert.match(lines.at(-1)!, /^\[выход\] Свошник \(#\d+, пинг ~0 мс, нет ответа 6 с, был 5 мин\); в игре: 0$/);

  const { c } = connect(hub);
  hub.onJson(c, { t: 'hello', v: PROTOCOL_VERSION, key: a.key, re: 1006 });
  assert.match(lines.at(-1)!, /^\[вход\] Свошник \(#\d+, переподключился: обрыв связи\); в игре: 1$/);
  // мусор в re не пишем
  const { c: c3 } = connect(hub);
  hub.onJson(c3, { t: 'hello', v: PROTOCOL_VERSION, key: a.key, re: 'x' as unknown as number });
  assert.match(lines.at(-1)!, /^\[вход\] Свошник \(#\d+\); в игре: 1$/);
  // а прошлое окно ушло с понятной причиной
  assert.ok(lines.some((l) => /^\[выход\] Свошник .*зашёл в другом окне, был 0 с\)/.test(l)), lines.join('\n'));
});
