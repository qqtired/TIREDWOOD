// Голосование за трассу картинга в круге «Старт»: большинство побеждает, ничья — жребий (виден на табло и в тосте),
// голос можно сменить до старта, вышел из круга — голос снят. Считает сервер (server/lobby/room.ts voteKartTrack).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KART_CHECK_EVERY, KART_COUNT_TICKS, KART_DRAW_TICKS } from '../shared/lobby.ts';
import { KART_START } from '../shared/maps/lobby.ts';
import { tallyTrackVotes } from '../shared/racecourse.ts';
import type { Client, Hub } from '../server/hub.ts';
import { allOf, lastOf, login, placeAt, setupHub, steps } from './kit.ts';

const vote = (hub: Hub, c: Client, track: 'harbor' | 'hills'): void => hub.onJson(c, { t: 'kartTrack', track });
const enter = (hub: Hub, c: Client, i: number): void => { placeAt(hub, c, KART_START.x + (i - 1) * 0.6, KART_START.z); steps(hub, KART_CHECK_EVERY); };
const slot = (hub: Hub, c: Client): number => hub.lobby.playerOf(c)!.slot;
/** Дойти до окна жребия: до старта осталось меньше KART_DRAW_TICKS, но гонка ещё не пошла */
const toDraw = (hub: Hub): void => {
  for (let i = 0; i < KART_COUNT_TICKS && hub.lobby.kartStatus().left > 3; i++) steps(hub, 1);
  assert.equal(hub.lobby.kartStatus().phase, 'count');
};

test('подсчёт: нет голосов — трасса по умолчанию, поровну — несколько впереди', () => {
  assert.deepEqual(tallyTrackVotes([]), { counts: [0, 0], leaders: ['harbor'] });
  assert.deepEqual(tallyTrackVotes(['hills', 'hills', 'harbor']), { counts: [1, 2], leaders: ['hills'] });
  assert.deepEqual(tallyTrackVotes(['hills', 'harbor']), { counts: [1, 1], leaders: ['harbor', 'hills'] });
});

test('большинство побеждает; голос можно сменить до старта; число голосов — на табло', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Voter1'), b = login(hub, 'Voter2'), c = login(hub, 'Voter3');
  enter(hub, a.c, 0); enter(hub, b.c, 1); enter(hub, c.c, 2);
  vote(hub, a.c, 'hills'); vote(hub, b.c, 'harbor'); vote(hub, c.c, 'harbor');
  let st = hub.lobby.kartStatus();
  assert.equal(st.phase, 'count');
  assert.deepEqual(st.ballots, [[slot(hub, a.c), 1], [slot(hub, b.c), 0], [slot(hub, c.c), 0]]);
  assert.equal(st.track, 'harbor');
  assert.deepEqual(lastOf(a.s, 'kart')?.ballots, st.ballots, 'табло разослано всем');
  // двое передумали — серпантин впереди
  vote(hub, b.c, 'hills');
  st = hub.lobby.kartStatus();
  assert.equal(st.track, 'hills');
  assert.equal(st.draw, undefined);
  steps(hub, KART_COUNT_TICKS + KART_CHECK_EVERY);
  assert.equal(hub.race.status()?.track, 'hills', 'в гонку поехали по большинству');
  assert.equal(lastOf(a.s, 'race')?.track, 'hills');
  assert.ok(!allOf(a.s, 'toast').some((t) => /Ничья/.test(t.text)), 'без ничьей жребия нет');
});

test('ничья — жребий бросается на последних секундах, виден на табло и в тосте; смена голоса отменяет его', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Tie1'), b = login(hub, 'Tie2');
  hub.lobby.kartRoll = (n) => n - 1; // жребий всегда на последнюю из ничьих
  enter(hub, a.c, 0); enter(hub, b.c, 1);
  vote(hub, a.c, 'harbor'); vote(hub, b.c, 'hills');
  assert.equal(hub.lobby.kartStatus().draw, undefined, 'рано: жребий ещё не брошен');
  toDraw(hub);
  assert.equal(hub.lobby.kartStatus().draw, 'hills');
  assert.equal(lastOf(a.s, 'kart')?.draw, 'hills', 'жребий разослан');
  // второй передумал — ничьей нет, жребий снят
  vote(hub, b.c, 'harbor');
  assert.equal(hub.lobby.kartStatus().draw, undefined);
  assert.equal(hub.lobby.kartStatus().track, 'harbor');
  // и снова поровну — новый жребий
  vote(hub, b.c, 'hills');
  assert.equal(hub.lobby.kartStatus().draw, 'hills');
  steps(hub, KART_DRAW_TICKS + KART_CHECK_EVERY * 2);
  assert.equal(hub.race.status()?.track, 'hills', 'поехали на выпавшую по жребию');
  assert.match(allOf(a.s, 'toast').at(-1)!.text, /Ничья — жребий: «Солнечный серпантин»/);
  assert.match(allOf(b.s, 'toast').at(-1)!.text, /Ничья — жребий/);
});

test('вышел из круга — голос снят; пока никто не голосовал, едет трасса по умолчанию', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Stay'), b = login(hub, 'Leave');
  enter(hub, a.c, 0); enter(hub, b.c, 1);
  vote(hub, a.c, 'harbor'); vote(hub, b.c, 'hills');
  assert.equal(hub.lobby.kartStatus().ballots?.length, 2);
  placeAt(hub, b.c, 0, 0); steps(hub, KART_CHECK_EVERY);
  assert.deepEqual(hub.lobby.kartStatus().ballots, [[slot(hub, a.c), 0]], 'голос вышедшего снят');
  // оставшийся не голосовал бы — поехали бы на трассу по умолчанию
  vote(hub, a.c, 'hills');
  placeAt(hub, a.c, 0, 0); steps(hub, KART_CHECK_EVERY);
  assert.equal(hub.lobby.kartStatus().phase, 'idle');
  enter(hub, a.c, 0);
  assert.deepEqual(hub.lobby.kartStatus().ballots, [], 'вернулся — голоса прежнего нет');
  steps(hub, KART_COUNT_TICKS + KART_CHECK_EVERY);
  assert.equal(hub.race.status()?.track, 'harbor');
});

test('голос не из круга не считается; E у гаража трассу не выбирает', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Outside'), b = login(hub, 'Inside');
  enter(hub, b.c, 0);
  vote(hub, a.c, 'hills');
  assert.match(lastOf(a.s, 'toast')!.text, /Встань в круг/);
  assert.deepEqual(hub.lobby.kartStatus().ballots, []);
  const garage = hub.lobby.map.interact.find((i) => i.kind === 'garage')!;
  hub.onJson(b.c, { t: 'use', id: garage.id });
  assert.equal(hub.lobby.kartStatus().track, 'harbor');
  vote(hub, b.c, 'hills');
  assert.equal(hub.lobby.kartStatus().track, 'hills');
  vote(hub, b.c, 'hills');
  assert.equal(hub.lobby.kartStatus().ballots?.length, 1, 'повторный голос не плодит записи');
});
