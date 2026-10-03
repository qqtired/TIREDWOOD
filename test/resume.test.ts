// Возврат после обрыва связи: игрок ждёт в своей комнате, новый сокет подхватывает сессию и получает всё,
// что не дошло (link.ts + Hub.linkLost/resume).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROTOCOL_VERSION, TICK_RATE } from '../shared/constants.ts';
import { LINK_KEEP_MSGS, SessionLink } from '../server/link.ts';
import { RESUME_MS, resumableClose } from '../server/hub.ts';
import { connect, fakeSink, login, setupHub } from './kit.ts';

test('связь сессии: номера, подтверждение, досылка с нужного места, снимки без связи пропадают', () => {
  const s1 = fakeSink();
  const link = new SessionLink(s1);
  for (let i = 0; i < 5; i++) link.sendJson({ t: 'toast', text: `m${i}` });
  assert.equal(link.sent, 5); assert.equal(s1.msgs.length, 5);
  link.ack(2); assert.equal(link.pending, 3);
  assert.equal(link.canResume(1), false, 'подтверждённое уже забыто');
  assert.equal(link.canResume(2), true); assert.equal(link.canResume(6), false);
  link.detach();
  link.sendJson({ t: 'toast', text: 'm5' }); link.sendBinary(new Uint8Array([2, 0]));
  assert.equal(s1.msgs.length, 5); assert.equal(s1.bins.length, 0);
  const s2 = fakeSink();
  assert.equal(link.attach(s2, 4), true);
  assert.deepEqual(s2.msgs.map(m => (m as { text: string }).text), ['m4', 'm5']);
  link.sendJson({ t: 'toast', text: 'm6' }); assert.equal(s2.msgs.length, 3);
  // ack мусором не ломается
  for (const bad of [-1, 1.5, 'x', null, 99]) link.ack(bad);
  assert.equal(link.canResume(2), true);
  // частое состояние режима и pong — вне нумерации: доходят, но не хранятся
  link.sendJson({ t: 'pong', c: 1, k: 2 });
  link.sendJson({ t: 'hide_state' } as never);
  assert.equal(link.sent, 7); assert.equal(s2.msgs.length, 5);
});

test('связь сессии: потолок хранения — старое забывается, вернуться к нему нельзя', () => {
  const link = new SessionLink(fakeSink());
  for (let i = 0; i < LINK_KEEP_MSGS + 10; i++) link.sendJson({ t: 'toast', text: 'x' });
  assert.equal(link.pending, LINK_KEEP_MSGS);
  assert.equal(link.canResume(0), false); assert.equal(link.canResume(10), true);
});

test('обрыв: игрок остаётся на месте и в комнате, возврат досылает пропущенное, без «выхода» в журнале', () => {
  const lines: string[] = [];
  const { hub, clock } = setupHub({ log: s => lines.push(s) });
  const a = login(hub, 'Обрыв'), b = login(hub, 'Сосед');
  const slot = hub.lobby.playerOf(a.c)!.slot;
  hub.linkLost(a.c, a.s, 'обрыв связи', 1006);
  assert.ok(a.c.lostAt > 0); assert.equal(a.c.closed, false);
  assert.equal(hub.lobby.playerOf(a.c)?.slot, slot, 'место в комнате держим');
  const received = a.s.msgs.length;
  hub.onJson(b.c, { t: 'chat', text: 'пока тебя не было' });
  clock.now += 10_000; hub.step();
  const { c, s } = connect(hub);
  hub.onJson(c, { t: 'hello', v: PROTOCOL_VERSION, key: a.key, re: 1006, rs: received });
  assert.equal(c.adopted, a.c); assert.equal(hub.clients.has(c), false);
  assert.equal(s.msgs[0].t, 'resumed');
  assert.ok(s.msgs.some(m => m.t === 'chat' && m.text === 'пока тебя не было'), 'пропущенное дослано');
  assert.ok(!s.msgs.some(m => m.t === 'scene'), 'сцена не пересоздаётся');
  assert.equal(hub.lobby.playerOf(a.c)?.slot, slot); assert.equal(a.c.lostAt, 0);
  assert.ok(!lines.some(l => l.startsWith('[выход] Обрыв')));
  assert.match(lines.at(-1)!, /^\[возврат\] Обрыв \(#\d+, обрыв связи, без связи 10 с\)/);
  // дальше сессия живёт в новом сокете, его закрытие снова даёт ожидание, а не выход
  hub.onJson(b.c, { t: 'chat', text: 'с возвращением' });
  assert.equal(s.msgs.at(-1)!.t, 'chat');
  hub.linkLost(a.c, a.s, 'обрыв связи', 1006);
  assert.equal(a.c.lostAt, 0, 'закрытие старого сокета после возврата не в счёт');
});

test('обрыв: не вернулся за 45 с — выход; закрытая вкладка и флуд — выход сразу', () => {
  const lines: string[] = [];
  const { hub, clock } = setupHub({ log: s => lines.push(s) });
  const a = login(hub, 'Пропал');
  hub.linkLost(a.c, a.s, 'нет ответа 20 с', 1006);
  clock.now += RESUME_MS - 1000;
  for (let i = 0; i < TICK_RATE; i++) hub.step();
  assert.equal(a.c.closed, false);
  clock.now += 1000;
  for (let i = 0; i < TICK_RATE; i++) hub.step();
  assert.equal(a.c.closed, true); assert.equal(hub.lobby.playerOf(a.c), undefined);
  assert.match(lines.find(l => l.startsWith('[выход] Пропал'))!, /нет ответа 20 с, не вернулся за 45 с/);
  for (const code of [1000, 1001, 1005, 1008, 1012, 4001, 4002]) assert.equal(resumableClose(code), false, String(code));
  for (const code of [1006, 1011, 1013, 4900]) assert.equal(resumableClose(code), true, String(code));
  const b = login(hub, 'Закрыл');
  hub.linkLost(b.c, b.s, 'закрыл вкладку', 1001);
  assert.equal(b.c.closed, true);
});

test('возврат при ещё «живом» старом сокете, устаревший номер — вход заново, подтверждение в пинге', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Тишина');
  // клиент 20 с не слышал сервер и пришёл с новым сокетом раньше, чем сервер заметил обрыв
  const { c, s } = connect(hub);
  hub.onJson(c, { t: 'hello', v: PROTOCOL_VERSION, key: a.key, re: 4900, rs: a.s.msgs.length });
  assert.equal(c.adopted, a.c); assert.deepEqual(a.s.closed, { code: 4003, reason: 'resumed' });
  assert.equal(s.msgs[0].t, 'resumed');
  // подтверждение в пинге: принятое забываем, к нему уже не вернуться
  const n = s.msgs.length - 1 + a.s.msgs.length;
  hub.onJson(a.c, { t: 'ping', c: 1, r: n });
  assert.equal(a.c.sink.canResume(n - 1), false);
  // обрыв, а клиент пришёл со старым номером — входит заново (как раньше), прежняя сессия закрыта
  hub.linkLost(a.c, s, 'обрыв связи', 1006);
  const fresh = connect(hub);
  hub.onJson(fresh.c, { t: 'hello', v: PROTOCOL_VERSION, key: a.key, rs: 1 });
  assert.equal(fresh.c.adopted, null); assert.equal(a.c.closed, true);
  assert.ok(fresh.c.profile); assert.ok(fresh.s.msgs.some(m => m.t === 'scene'));
});
