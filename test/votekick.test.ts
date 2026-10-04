// Голосование «выгнать игрока» из меню Tab (shared/votekick.ts, server/votekick.ts): правило 60 % от проголосовавших
// и «за» ≥ 2, досрочный итог, конец по времени, защита от спама, бан выгнанного на 10 минут по профилю и IP.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROTOCOL_VERSION } from '../shared/constants.ts';
import { KICK_BAN_MS, KICK_COOLDOWN_MS, KICK_MIN_YES, KICK_PERCENT, KICK_VOTE_MS, kickOutcome, kickPasses } from '../shared/votekick.ts';
import type { Client } from '../server/hub.ts';
import { allOf, connect, lastOf, login, setupHub, type FakeSink } from './kit.ts';

type Hub = ReturnType<typeof setupHub>['hub'];
type P = { c: Client; s: FakeSink; key: string };

/** n игроков на разных адресах (новых профилей с одного адреса — не больше 5 в час) */
function players(hub: Hub, n: number, prefix = 'Tester'): P[] {
  return Array.from({ length: n }, (_, i) => login(hub, `${prefix}${i + 1}`, undefined, `10.0.${i}.1`));
}
const start = (hub: Hub, p: P, target: P): void => hub.onJson(p.c, { t: 'kick', a: 'start', pid: target.c.pid });
const vote = (hub: Hub, p: P, yes: boolean): void => hub.onJson(p.c, { t: 'kick', a: 'vote', yes });
const toasts = (p: P): string[] => allOf(p.s, 'toast').map((m) => m.text);
const sysChat = (p: P): string[] => allOf(p.s, 'chat').filter((m) => m.sys).map((m) => m.text);

test('правило: больше 60 % от проголосовавших и «за» не меньше двух; молчание не считается', () => {
  assert.equal(KICK_PERCENT, 60);
  assert.equal(KICK_MIN_YES, 2);
  assert.equal(kickPasses(1, 0), false, 'один инициатор — не кик, хоть это и 100 %');
  assert.equal(kickPasses(2, 0), true);
  assert.equal(kickPasses(2, 1), true, '2 из 3 = 66,7 %');
  assert.equal(kickPasses(3, 2), false, 'ровно 60 % — мало, нужно больше');
  assert.equal(kickPasses(4, 2), true);
  // по времени: молчащие не в счёт
  assert.equal(kickOutcome(2, 0, 3, true), 'kick');
  assert.equal(kickOutcome(1, 0, 4, true), 'stay');
  // досрочно — только когда исход уже не изменится
  assert.equal(kickOutcome(2, 0, 1, false), 'kick', 'даже если последний против — 2 из 3');
  assert.equal(kickOutcome(2, 0, 2, false), null, 'двое против сделали бы 50 %');
  assert.equal(kickOutcome(1, 2, 1, false), 'stay', 'даже если последний за — 2 из 4');
  assert.equal(kickOutcome(1, 1, 1, false), null);
  assert.equal(kickOutcome(1, 1, 0, false), 'stay', 'проголосовали все');
});

test('голосование: плашка всем, инициатор сразу «за», досрочный кик, сообщение выгнанному и строка в чат', () => {
  const { hub } = setupHub({ votekick: true });
  const [a, b, c, t] = players(hub, 4);
  assert.deepEqual(lastOf(a.s, 'kickVote'), { t: 'kickVote', v: null, on: 1 }, 'при входе — голосование включено');
  assert.ok(lastOf(a.s, 'online')!.list.every((e) => typeof e.pid === 'number' && e.pid > 0), 'в «кто где» есть номера профилей');

  start(hub, a, t);
  const va = lastOf(a.s, 'kickVote')!.v!;
  assert.equal(va.nick, 'Tester4');
  assert.equal(va.by, 'Tester1');
  assert.deepEqual([va.yes, va.no, va.voters, va.me], [1, 0, 3, 'yes']);
  assert.ok(va.left > KICK_VOTE_MS - 1000 && va.left <= KICK_VOTE_MS);
  assert.equal(lastOf(b.s, 'kickVote')!.v!.me, 'can');
  assert.equal(lastOf(t.s, 'kickVote')!.v!.me, 'out', 'кого выгоняют — не голосует, но плашку видит');
  assert.ok(sysChat(c).some((s) => s.includes('Tester1 предлагает выгнать Tester4')));

  vote(hub, t, false);
  assert.equal(lastOf(a.s, 'kickVote')!.v!.no, 0, 'голос выгоняемого не принимается');
  vote(hub, b, true);
  // 2 «за» из 3 голосующих: даже если третий против — 66,7 % > 60 %
  const end = lastOf(a.s, 'kickVote')!;
  assert.equal(end.v, null);
  assert.deepEqual(end.end, { pid: t.c.pid, nick: 'Tester4', kicked: true, yes: 2, no: 0 });
  const err = lastOf(t.s, 'error')!;
  assert.equal(err.code, 'kicked');
  assert.match(err.text, /выгнали голосованием.*10 мин/);
  assert.equal(t.s.closed?.code, 4004);
  assert.equal(hub.clientOf(t.c.pid), undefined, 'выгнанный отключён');
  assert.ok(sysChat(b).some((s) => s.includes('Tester4 выгнан голосованием на 10 мин (за 2, против 0)')));
  assert.ok(!lastOf(a.s, 'online')!.list.some((e) => e.nick === 'Tester4'));
});

test('один инициатор без других голосов — не кик: итог через 60 с', () => {
  const { hub, clock } = setupHub({ votekick: true });
  const [a, b, , t] = players(hub, 4);
  start(hub, a, t);
  clock.now += KICK_VOTE_MS - 1000;
  hub.step();
  assert.ok(lastOf(b.s, 'kickVote')!.v, 'за секунду до конца ещё идёт');
  clock.now += 1000;
  hub.step();
  const end = lastOf(b.s, 'kickVote')!;
  assert.equal(end.v, null);
  assert.deepEqual(end.end, { pid: t.c.pid, nick: 'Tester4', kicked: false, yes: 1, no: 0 });
  assert.ok(hub.clientOf(t.c.pid), 'остался в игре');
  assert.ok(sysChat(a).some((s) => s.includes('Tester4 остаётся')));
});

test('по времени: двое «за», остальные молчат — кик (считаем от проголосовавших)', () => {
  const { hub, clock } = setupHub({ votekick: true });
  const [a, b, c, , , t] = players(hub, 6);
  start(hub, a, t);
  vote(hub, b, true);
  assert.equal(lastOf(c.s, 'kickVote')!.v!.yes, 2, 'трое молчащих ещё могут сделать 40 % — ждём');
  clock.now += KICK_VOTE_MS;
  hub.step();
  assert.equal(lastOf(c.s, 'kickVote')!.end!.kicked, true);
  assert.equal(t.s.closed?.code, 4004);
});

test('досрочно «остаётся», когда «за» уже не набрать; ушедший до голоса не ждём', () => {
  const { hub } = setupHub({ votekick: true });
  const [a, b, c, d, t] = players(hub, 5);
  start(hub, a, t);
  vote(hub, b, false);
  vote(hub, c, false);
  // 1 за, 2 против, остался d: даже его «за» — 50 %
  assert.equal(lastOf(d.s, 'kickVote')!.end!.kicked, false);

  const h2 = setupHub({ votekick: true }).hub;
  const [x, y, z, u] = players(h2, 4, 'Other');
  start(h2, x, u);
  vote(h2, y, false);
  assert.ok(lastOf(x.s, 'kickVote')!.v, 'ждём z');
  h2.disconnect(z.c, 'ушёл');
  assert.deepEqual(lastOf(x.s, 'kickVote')!.end, { pid: u.c.pid, nick: 'Other4', kicked: false, yes: 1, no: 1 });
});

test('защита: не на себя, минимум 3 в игре, одно голосование за раз, запуск не чаще раза в 3 минуты', () => {
  const { hub, clock } = setupHub({ votekick: true });
  const [a, b] = players(hub, 2);
  start(hub, a, b);
  assert.equal(lastOf(a.s, 'kickVote')!.v, null, 'вдвоём не голосуют');
  assert.match(toasts(a).at(-1)!, /хотя бы 3 человека/);
  const [c, d] = players(hub, 2, 'Third');
  start(hub, a, a);
  assert.match(toasts(a).at(-1)!, /Себя выгнать нельзя/);
  start(hub, a, d);
  assert.ok(lastOf(b.s, 'kickVote')!.v);
  start(hub, b, c);
  assert.match(toasts(b).at(-1)!, /Уже идёт голосование/);
  vote(hub, b, false);
  vote(hub, c, false);
  assert.equal(lastOf(a.s, 'kickVote')!.end!.kicked, false);
  start(hub, a, c);
  assert.match(toasts(a).at(-1)!, /снова можно через 3 мин/);
  assert.equal(lastOf(b.s, 'kickVote')!.v, null);
  start(hub, b, c);
  assert.equal(lastOf(b.s, 'kickVote')!.v!.nick, 'Third1', 'другому игроку можно');
  vote(hub, a, false);
  vote(hub, d, false);
  clock.now += KICK_COOLDOWN_MS;
  start(hub, a, c);
  assert.equal(lastOf(a.s, 'kickVote')!.v!.by, 'Tester1', 'через 3 минуты — снова можно');
});

test('выгнанный не входит 10 минут — ни этим профилем, ни новым с того же IP; соседи по IP остаются; потом — входит', () => {
  const { hub, clock } = setupHub({ votekick: true });
  const a = login(hub, 'Alpha', undefined, '10.1.0.1');
  const b = login(hub, 'Bravo', undefined, '10.1.0.2');
  const t = login(hub, 'Target', undefined, '10.1.0.9');
  const n = login(hub, 'Neighbor', undefined, '10.1.0.9');
  start(hub, a, t);
  vote(hub, b, true);
  assert.equal(t.s.closed?.code, 4004);

  const again = (key: string, ip: string, nick?: string): { c: Client; s: FakeSink } => {
    const r = connect(hub, ip);
    hub.onJson(r.c, { t: 'hello', v: PROTOCOL_VERSION, key, ...(nick ? { nick } : {}) });
    return r;
  };
  const back = again(t.key, '10.1.0.50');
  assert.equal(back.c.profile, null, 'тот же профиль с другого адреса — нет');
  assert.equal(lastOf(back.s, 'error')!.code, 'kicked');
  assert.match(lastOf(back.s, 'error')!.text, /через 10 мин/);
  assert.equal(back.s.closed?.code, 4004);
  const fresh = again('fresh-key-0000000001', '10.1.0.9', 'Newbie');
  assert.equal(fresh.c.profile, null, 'новый профиль с того же IP — нет');
  hub.disconnect(n.c, 'обрыв');
  const neighbor = again(n.key, '10.1.0.9');
  assert.ok(neighbor.c.profile, 'кто играл с того же IP в момент кика — входит');

  clock.now += KICK_BAN_MS - 60_000;
  const early = again(t.key, '10.1.0.9');
  assert.match(lastOf(early.s, 'error')!.text, /через 60 с/);
  clock.now += 60_000;
  const late = again(t.key, '10.1.0.9');
  assert.equal(late.c.profile?.nick, 'Target', 'через 10 минут — снова в игре');
});

test('без флага VOTEKICK голосования нет', () => {
  const { hub } = setupHub();
  const [a, , , t] = players(hub, 4);
  assert.equal(lastOf(a.s, 'kickVote'), undefined);
  start(hub, a, t);
  assert.equal(lastOf(a.s, 'kickVote'), undefined);
});
