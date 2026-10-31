import assert from 'node:assert/strict';
import test from 'node:test';
import { DungeonTips, parseSeen, TIP_TEXT, type TipStore } from '../client/dungeon/tips.ts';
import type { DgView } from '../client/dungeon/view.ts';

function memory(raw: string | null = null): TipStore & { raw: string | null } {
  const s = { raw, load: () => s.raw, save: (v: string) => { s.raw = v; } };
  return s;
}

/** Достаточный для подсказок кусок вида: тик (30 в секунду), стадия, герой, враги вокруг, постройки */
function view(o: { sec: number; stage?: string; enemies?: number; dist?: number; hp?: number; build?: { kind: string; dist: number } }): DgView {
  const enemies = Array.from({ length: o.enemies ?? 0 }, (_, i) => ({ id: i, x: o.dist ?? 3, z: 0 }));
  const buildings = o.build ? [{ id: 1, kind: o.build.kind, x: o.build.dist, z: 0 }] : [];
  return {
    tick: Math.round(o.sec * 30), stage: o.stage ?? 'wave', cards: null, chest: null, enemies, buildings,
    hero: { x: 0, z: 0, hp: o.hp ?? 100, hpMax: 100, dead: false },
  } as unknown as DgView;
}

test('Q-подсказка: в бою при стае рядом, один раз, и запоминается', () => {
  const store = memory();
  const tips = new DungeonTips(store);
  assert.equal(tips.next(view({ sec: 3, enemies: 6 })), null, 'первые 6 секунд — без подсказок');
  assert.equal(tips.next(view({ sec: 10, enemies: 2 })), null, 'двое врагов — ещё не стая');
  assert.equal(tips.next(view({ sec: 10, stage: 'breather', enemies: 6 })), null, 'в передышке стая не считается');
  assert.equal(tips.next(view({ sec: 10, enemies: 5 })), 'q');
  assert.equal(TIP_TEXT.q, 'Зажми Q и отпусти в гуще');
  assert.equal(store.raw, 'q');
  assert.equal(tips.next(view({ sec: 40, enemies: 5 })), null, 'один раз');
  assert.equal(new DungeonTips(store).has('q'), true, 'и в новой вкладке она уже видена');
});

test('рывок: стая вплотную или здоровье ниже 70 %, не чаще раза в 15 с; сделал рывок — подсказка не нужна', () => {
  const tips = new DungeonTips(memory('q'));
  assert.equal(tips.next(view({ sec: 10, enemies: 5, dist: 6 })), null, 'дальше 5 м и здоровье целое');
  assert.equal(tips.next(view({ sec: 11, enemies: 7, dist: 2 })), 'dash');
  assert.equal(TIP_TEXT.dash, 'Пробел — рывок сквозь стаю');
  const learned = new DungeonTips(memory('q'));
  learned.noteDash();
  assert.equal(learned.next(view({ sec: 12, enemies: 7, dist: 2 })), null);
  const hurt = new DungeonTips(memory('q'));
  assert.equal(hurt.next(view({ sec: 12, enemies: 0, hp: 60 })), 'dash', 'или здоровья меньше 70 %');
});

test('круг: подошёл к алтарю ближе 9 м; между плашками 15 с; запретные окна — без подсказок', () => {
  const tips = new DungeonTips(memory('q,dash'));
  assert.equal(tips.next(view({ sec: 20, build: { kind: 'altar', dist: 12 } })), null);
  assert.equal(tips.next(view({ sec: 20, build: { kind: 'minecart', dist: 3 } })), null, 'вагонетка — без круга');
  const v = view({ sec: 20, build: { kind: 'altar', dist: 7 } });
  (v as unknown as { cards: unknown }).cards = {};
  assert.equal(tips.next(v), null, 'пока открыты карточки — тишина');
  assert.equal(tips.next(view({ sec: 20, build: { kind: 'altar', dist: 7 } })), 'circle');
  assert.equal(TIP_TEXT.circle, 'Встань в круг и постой');

  // между двумя подсказками — не меньше 15 с времени забега
  const pair = new DungeonTips(memory());
  assert.equal(pair.next(view({ sec: 10, enemies: 5, build: { kind: 'forge', dist: 4 } })), 'q');
  assert.equal(pair.next(view({ sec: 14, build: { kind: 'forge', dist: 4 } })), null);
  assert.equal(pair.next(view({ sec: 26, build: { kind: 'forge', dist: 4 } })), 'circle');
  pair.reset();
  assert.equal(pair.next(view({ sec: 8, enemies: 9, dist: 1 })), 'dash', 'новый забег — интервал считается заново');
});

test('Q: долгий заряд — «знакома»; короткое нажатие подсказку не отменяет; битая строка хранилища не ломает', () => {
  const quick = new DungeonTips(memory());
  quick.noteQ(true, 10);
  quick.noteQ(false, 10.2);
  assert.equal(quick.has('q'), false);
  assert.equal(quick.next(view({ sec: 11, enemies: 5 })), 'q');
  const held = new DungeonTips(memory());
  held.noteQ(true, 10);
  held.noteQ(false, 11);
  assert.equal(held.has('q'), true);
  assert.equal(held.next(view({ sec: 12, enemies: 5 })), null);
  assert.deepEqual([...parseSeen('q,мусор,circle,,')], ['q', 'circle']);
  assert.deepEqual([...parseSeen(null)], []);
});
