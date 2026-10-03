// Небесная каланча проходима настоящей физикой желейки: каждый переход (бег, прыжок без рывка, гриб, поток, люлька,
// тележка, карусель, корзина, облака, ступени) и весь основной путь подряд — с работающими ловушками — быстрее золота.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeSkillMap } from '../shared/skillmap.ts';
import { SKILL_GOLD_TICKS } from '../shared/skilltest.ts';
import { makeState } from '../shared/sim.ts';
import { SkillBot, SkillRouteBot } from './skillbot.ts';

test('every link of the sky tower is passable with real jelly physics and no dash', () => {
  const map = makeSkillMap();
  const bot = new SkillBot(map);
  assert.ok(map.links.length >= 60, `links: ${map.links.length}`);
  const failed = map.links.filter((l) => !bot.check(l).ok).map((l) => l.name);
  assert.deepEqual(failed, []);
});

test('gaps marked as jumps really need a jump (walking off the edge falls)', () => {
  const map = makeSkillMap();
  const bot = new SkillBot(map);
  // перекладина карусели — ловушка, а не яма: её можно и переждать
  const gaps = map.links.filter((l) => l.how === 'jump' && !l.name.includes('карусел'));
  assert.ok(gaps.length >= 20);
  const walkable = gaps.filter((l) => (l.at ?? [0]).some((t0) => bot.attempt(l, t0, -1) > 0)).map((l) => l.name);
  assert.deepEqual(walkable, []);
});

test('the whole main route with every trap running reaches the bell well under gold time', () => {
  const map = makeSkillMap();
  const bot = new SkillRouteBot(map);
  const s = Object.assign(makeState(), { x: -14, y: 0, z: 11, grounded: 1 });
  const r = bot.run(map.links.filter((l) => !l.alt), s, 0);
  assert.ok(r.ok, `stuck at ${r.failed}`);
  // бот ждёт идеально и не падает: человеку остаётся запас на ошибки, но и короткой трасса быть не должна
  assert.ok(r.end < SKILL_GOLD_TICKS * 0.8, `bot time ${(r.end / 60).toFixed(1)} s`);
  assert.ok(r.end > 55 * 60, `bot time ${(r.end / 60).toFixed(1)} s — too short`);
});
