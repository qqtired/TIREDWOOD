// Дурак: правила, лимиты, «Беру», «Бито», перевод, выход, авто-ход, бот, восстановление из открытого вида.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  autoMove, beats, botMove, canAttack, canBeat, canPass, canTake, canTransfer, epaulets, fromView, legal, newGame, passAll, play,
  resolve, shuffledDeck, suitOf, viewOf, waiting, type Durak, type DurakMode, type DurakMove,
} from '../shared/durak.ts';
import { makeRng } from '../shared/math.ts';

const SUIT: Record<string, number> = { '♠': 0, '♣': 1, '♦': 2, '♥': 3 };
const RANK: Record<string, number> = { '6': 0, '7': 1, '8': 2, '9': 3, '10': 4, 'В': 5, 'Д': 6, 'К': 7, 'Т': 8 };

/** Карта по записи: '10♥', 'Д♠' */
function C(s: string): number {
  const suit = SUIT[s.slice(-1)];
  const rank = RANK[s.slice(0, -1)];
  assert.ok(suit !== undefined && rank !== undefined, s);
  return suit * 9 + rank;
}

const H = (...s: string[]): number[] => s.map(C);

/** Состояние посреди партии — собранное руками. Козырь по умолчанию бубны. */
function state(o: Partial<Durak> & { hands: number[][] }): Durak {
  const n = o.hands.length;
  return {
    mode: 'throw', n, deck: [], trump: C('Т♦'), table: [], attacker: 0, defender: 1, taking: false,
    passed: new Array<boolean>(n).fill(false), bout: 1, discard: 0, out: [], over: false, fool: -1, ...o,
  };
}

function ok(g: Durak, p: number, m: DurakMove): void {
  assert.ok(play(g, p, m), `ход ${JSON.stringify(m)} игрока ${p} не принят`);
}

/** Колода, при раздаче которой игроки получат эти руки (раздача — по кругу с конца), а rest останется (rest[0] — козырь). */
function rig(hands: number[][], rest: number[]): number[] {
  const seq: number[] = [];
  for (let r = 0; r < 6; r++) for (const h of hands) seq.push(h[r]);
  return [...rest, ...seq.reverse()];
}

test('кто кого бьёт', () => {
  const spades = 0;
  assert.ok(beats(C('7♥'), C('6♥'), spades));
  assert.ok(!beats(C('6♥'), C('7♥'), spades));
  assert.ok(beats(C('6♠'), C('Т♥'), spades), 'козырь бьёт некозырную');
  assert.ok(!beats(C('Т♥'), C('6♠'), spades), 'некозырная не бьёт козырь');
  assert.ok(beats(C('7♠'), C('6♠'), spades), 'старший козырь бьёт младший');
  assert.ok(!beats(C('Т♦'), C('6♥'), spades), 'разные некозырные масти не бьют');
});

test('колода — перестановка 36 карт; раздача по 6, козырь — нижняя карта', () => {
  const rng = makeRng(7);
  for (let n = 2; n <= 6; n++) {
    const deck = shuffledDeck((k) => Math.floor(rng() * k));
    assert.deepEqual([...deck].sort((a, b) => a - b), Array.from({ length: 36 }, (_, i) => i));
    const g = newGame(n, deck, 'throw');
    for (const h of g.hands) assert.equal(h.length, 6);
    assert.equal(g.deck.length, 36 - 6 * n);
    assert.equal(g.trump, deck[0]);
    const all = [...g.hands.flat(), ...g.deck];
    assert.equal(new Set(all).size, 36);
    if (n < 6) assert.equal(g.deck[0], deck[0], 'козырь лежит под колодой');
    else assert.ok(g.hands[5].includes(deck[0]), 'при шестерых козырь уходит последнему');
  }
});

test('первым ходит младший козырь; «под дурака» — кого назначили', () => {
  const hands = [
    H('Д♦', '7♠', '8♠', '9♠', '10♠', 'В♠'),
    H('7♦', '7♣', '8♣', '9♣', '10♣', 'В♣'),
    H('9♦', '7♥', '8♥', '9♥', '10♥', 'В♥'),
  ];
  const deck = rig(hands, H('Т♦', 'К♠'));
  let g = newGame(3, deck, 'throw');
  assert.deepEqual(g.hands, hands);
  assert.equal(g.attacker, 1, 'у второго 7♦');
  assert.equal(g.defender, 2);
  g = newGame(3, deck, 'throw', 0);
  assert.equal(g.attacker, 0);
  assert.equal(g.defender, 1);
  // козырей на руках нет — ходит младшая карта, при равенстве — меньшая масть
  const plain = [H('7♠', '8♠', '9♠', '10♠', 'В♠', 'Д♠'), H('6♣', '8♣', '9♣', '10♣', 'В♣', 'Д♣'), H('6♠', '7♥', '8♥', '9♥', '10♥', 'В♥')];
  g = newGame(3, rig(plain, H('Т♦', 'К♦')), 'throw');
  assert.equal(g.attacker, 2, '6♠ младше 6♣');
});

test('лимиты отбоя: в первом не больше 5, потом 6, и не больше, чем карт у отбивающегося', () => {
  const beaten = [['7♠', '8♠'], ['7♣', '8♣'], ['8♥', '9♥'], ['8♦', '9♦'], ['7♥', 'В♥']].map(([a, d]) => ({ a: C(a), d: C(d) }));
  let g = state({ hands: [H('7♦', '9♠'), H('6♣', '6♥', '6♠')], table: beaten.map((t) => ({ ...t })), bout: 0 });
  assert.ok(!canAttack(g, 0, C('7♦')), 'шестая карта в первом отбое');
  g = state({ hands: [H('7♦', '9♠'), H('6♣', '6♥', '6♠')], table: beaten.map((t) => ({ ...t })), bout: 1 });
  assert.ok(canAttack(g, 0, C('7♦')), 'во втором отбое можно шестую');
  ok(g, 0, { a: 'attack', card: C('7♦') });
  assert.ok(!canAttack(g, 0, C('9♠')), 'седьмую нельзя');
  // неотбитых не больше, чем карт у отбивающегося
  g = state({ hands: [H('7♠', '7♣', '7♥'), H('6♥', '6♣')] });
  ok(g, 0, { a: 'attack', card: C('7♠') });
  ok(g, 0, { a: 'attack', card: C('7♣') });
  assert.ok(!canAttack(g, 0, C('7♥')), 'у отбивающегося две карты — третью не кладут');
});

test('подкидывают только достоинства со стола; отбивающийся не подкидывает; первую карту кладёт ходящий', () => {
  const g = state({ hands: [H('7♠', '7♣', '9♦', '8♣'), H('9♠', '6♥', '7♥', '10♥'), H('8♥', '7♦')], attacker: 0, defender: 1 });
  assert.ok(!canAttack(g, 2, C('7♦')), 'на пустой стол — только ходящий');
  ok(g, 0, { a: 'attack', card: C('7♠') });
  assert.ok(!canAttack(g, 1, C('7♥')), 'отбивающийся не подкидывает');
  ok(g, 1, { a: 'beat', card: C('9♠'), on: 0 });
  assert.ok(canAttack(g, 0, C('7♣')), 'семёрка есть на столе');
  assert.ok(canAttack(g, 2, C('7♦')), 'подкидывать может любой, кроме отбивающегося');
  assert.ok(!canAttack(g, 0, C('8♣')), 'восьмёрки на столе нет');
  assert.ok(canAttack(g, 0, C('9♦')), 'девятка — отбивающая карта');
  assert.ok(!canBeat(g, 1, C('6♥'), 0), 'отбитую не бьют второй раз');
});

test('«Беру»: окно подкидывания, потом все карты у отбивающегося, ходит следующий после него', () => {
  const g = state({ hands: [H('7♠', '7♣', '9♥'), H('6♥', '10♥'), H('7♥', '8♠')] });
  ok(g, 0, { a: 'attack', card: C('7♠') });
  assert.equal(waiting(g), 'defend');
  assert.ok(!canBeat(g, 1, C('6♥'), 0));
  ok(g, 1, { a: 'take' });
  assert.equal(waiting(g), 'take', 'есть кому подкинуть');
  assert.ok(!canTake(g, 1), 'дважды не берут');
  ok(g, 2, { a: 'attack', card: C('7♥') });
  assert.equal(waiting(g), 'took', 'больше не положить: у отбивающегося две карты');
  assert.ok(resolve(g));
  assert.deepEqual([...g.hands[1]].sort((a, b) => a - b), H('6♥', '10♥', '7♠', '7♥').sort((a, b) => a - b));
  assert.equal(g.attacker, 2, 'взявший пропускает ход');
  assert.equal(g.defender, 0);
  assert.equal(g.table.length, 0);
  // passAll закрывает окно сразу
  const h = state({ hands: [H('7♠', '7♣'), H('6♥', '10♥', 'В♥'), H('7♥')] });
  ok(h, 0, { a: 'attack', card: C('7♠') });
  ok(h, 1, { a: 'take' });
  assert.equal(waiting(h), 'take');
  passAll(h);
  assert.equal(waiting(h), 'took');
});

test('«Бито»: карты в бито, отбивавшийся ходит, добор от ходившего, отбивающийся последним, козырь — последним', () => {
  const hands = () => [
    H('7♠', '9♥', '10♥', 'В♥', 'Д♥', 'К♥'),
    H('8♠', '9♣', '10♣', 'В♣', '6♣', '6♥'),
    H('9♠', '10♠', 'В♠', 'Д♠', 'К♠', '6♠'),
  ];
  let g = state({ hands: hands(), deck: H('Т♦', 'К♣', 'Д♣') });
  ok(g, 0, { a: 'attack', card: C('7♠') });
  ok(g, 1, { a: 'beat', card: C('8♠'), on: 0 });
  assert.equal(waiting(g), 'bito', 'подкинуть нечего');
  assert.ok(resolve(g));
  assert.equal(g.discard, 2);
  assert.ok(g.hands[0].includes(C('Д♣')), 'ходивший берёт первым — верхнюю');
  assert.ok(g.hands[1].includes(C('К♣')), 'отбивавшийся — последним');
  assert.deepEqual(g.deck, H('Т♦'));
  assert.equal(g.attacker, 1, 'отбился — ходит');
  assert.equal(g.defender, 2);
  // козырная карта из-под колоды уходит последней
  g = state({ hands: hands(), deck: H('Т♦', 'К♣') });
  ok(g, 0, { a: 'attack', card: C('7♠') });
  ok(g, 1, { a: 'beat', card: C('8♠'), on: 0 });
  assert.ok(resolve(g));
  assert.ok(g.hands[0].includes(C('К♣')));
  assert.ok(g.hands[1].includes(C('Т♦')));
  assert.equal(g.deck.length, 0);
  assert.deepEqual(g.out, [], 'у всех есть карты');
});

test('«Пас» ждут только от тех, кому есть чем подкинуть; новая карта сбрасывает пасы', () => {
  const g = state({ hands: [H('7♠', '7♣', 'Т♥'), H('8♠', '8♣', '9♥', '10♥'), H('7♥', 'К♣')] });
  ok(g, 0, { a: 'attack', card: C('7♠') });
  ok(g, 1, { a: 'beat', card: C('8♠'), on: 0 });
  assert.equal(waiting(g), 'throw');
  assert.ok(canPass(g, 0) && canPass(g, 2));
  ok(g, 0, { a: 'pass' });
  assert.equal(waiting(g), 'throw', 'третий ещё может подкинуть');
  ok(g, 2, { a: 'attack', card: C('7♥') });
  assert.ok(!g.passed[0], 'новая карта — пасы заново');
  ok(g, 1, { a: 'beat', card: C('9♥'), on: 1 });
  ok(g, 0, { a: 'pass' });
  assert.equal(waiting(g), 'bito', 'у третьего больше нечего подкинуть — его не ждём');
  assert.ok(!canPass(g, 2));
});

test('перевод: только в переводном, пока ничего не отбито, той же картой и если у следующего хватает карт', () => {
  const mk = (mode: DurakMode, p2: string[]) => state({ mode, hands: [H('7♠', '7♣', '9♣'), H('7♥', '8♠', '7♦'), H(...p2)] });
  let g = mk('transfer', ['6♥', '10♥', 'В♥']);
  ok(g, 0, { a: 'attack', card: C('7♠') });
  assert.ok(!canTransfer(g, 1, C('8♠')), 'другое достоинство');
  ok(g, 1, { a: 'transfer', card: C('7♥') });
  assert.equal(g.defender, 2);
  assert.equal(g.attacker, 0, 'добор по-прежнему от ходившего');
  assert.equal(g.table.length, 2);
  assert.ok(canAttack(g, 0, C('7♣')) && canAttack(g, 1, C('7♦')), 'перевёл — подкидывают все, кроме нового отбивающегося');

  // вдвоём перевод возвращает карты ходившему
  const two = state({ mode: 'transfer', hands: [H('7♠', '9♣', '10♣'), H('7♥', '8♠', '6♣')] });
  ok(two, 0, { a: 'attack', card: C('7♠') });
  ok(two, 1, { a: 'transfer', card: C('7♥') });
  assert.equal(two.defender, 0);
  assert.ok(canTake(two, 0));
  ok(two, 0, { a: 'take' });
  passAll(two);
  assert.ok(resolve(two));
  assert.equal(two.hands[0].length, 4);
  assert.equal(two.attacker, 1, 'взял — ходит другой');
  assert.equal(two.defender, 0);

  g = mk('throw', ['6♥', '10♥']);
  ok(g, 0, { a: 'attack', card: C('7♠') });
  assert.ok(!canTransfer(g, 1, C('7♥')), 'в подкидном не переводят');

  g = mk('transfer', ['6♥', '10♥']);
  ok(g, 0, { a: 'attack', card: C('7♠') });
  ok(g, 1, { a: 'beat', card: C('8♠'), on: 0 });
  ok(g, 0, { a: 'attack', card: C('7♣') });
  assert.ok(!canTransfer(g, 1, C('7♥')), 'одна уже отбита');

  g = mk('transfer', ['6♥']);
  ok(g, 0, { a: 'attack', card: C('7♠') });
  assert.ok(!canTransfer(g, 1, C('7♥')), 'у следующего одна карта, а на столе будет две');
});

test('выход и конец: последний с картами — дурак, одновременный выход — ничья', () => {
  let g = state({ hands: [H('7♠'), H('8♠', '9♥')], bout: 3 });
  ok(g, 0, { a: 'attack', card: C('7♠') });
  ok(g, 1, { a: 'beat', card: C('8♠'), on: 0 });
  assert.equal(waiting(g), 'bito');
  assert.ok(resolve(g));
  assert.ok(g.over);
  assert.deepEqual(g.out, [0]);
  assert.equal(g.fool, 1);
  assert.equal(waiting(g), 'over');
  assert.ok(!epaulets(g), 'шестёрок у дурака нет');

  g = state({ hands: [H('7♠'), H('8♠', '6♥')], bout: 3 });
  ok(g, 0, { a: 'attack', card: C('7♠') });
  ok(g, 1, { a: 'beat', card: C('8♠'), on: 0 });
  resolve(g);
  assert.equal(g.fool, 1);
  assert.ok(epaulets(g), 'остался с шестёркой — погоны');

  g = state({ hands: [H('7♠'), H('8♠')], bout: 3 });
  ok(g, 0, { a: 'attack', card: C('7♠') });
  ok(g, 1, { a: 'beat', card: C('8♠'), on: 0 });
  resolve(g);
  assert.ok(g.over);
  assert.equal(g.fool, -1, 'ничья');
  assert.deepEqual(g.out, [0, 1]);

  g = state({ hands: [H('7♠'), H('8♠'), H('9♥', '10♥')], bout: 3 });
  ok(g, 0, { a: 'attack', card: C('7♠') });
  ok(g, 1, { a: 'beat', card: C('8♠'), on: 0 });
  resolve(g);
  assert.deepEqual(g.out, [0, 1]);
  assert.equal(g.fool, 2);
});

test('ход по таймеру: младшая некозырная, младшая подходящая или «Беру», «Пас»', () => {
  let g = state({ hands: [H('К♠', '7♦', '9♣'), H('10♠')] });
  assert.deepEqual(autoMove(g, 0), { a: 'attack', card: C('9♣') });
  assert.equal(autoMove(g, 1), null, 'не его ход');

  g = state({ hands: [H('Т♥'), H('К♠', '10♠', '6♦')], table: [{ a: C('9♠'), d: -1 }] });
  assert.deepEqual(autoMove(g, 1), { a: 'beat', card: C('10♠'), on: 0 });
  g = state({ hands: [H('Т♥'), H('6♣', '7♥')], table: [{ a: C('9♠'), d: -1 }] });
  assert.deepEqual(autoMove(g, 1), { a: 'take' });

  g = state({ hands: [H('9♥'), H('6♣', '7♥')], table: [{ a: C('9♠'), d: C('10♠') }] });
  assert.deepEqual(autoMove(g, 0), { a: 'pass' });
});

test('бот: переводит некозырной, бережёт козыри в начале, подкидывает мелочь', () => {
  // перевод
  let g = state({ mode: 'transfer', hands: [H('9♣'), H('7♥', '8♠'), H('6♥', '10♥', 'В♥')], table: [{ a: C('7♠'), d: -1 }] });
  assert.deepEqual(botMove(g, 1), { a: 'transfer', card: C('7♥') });
  g = state({ mode: 'transfer', hands: [H('9♣'), H('7♦', '8♠'), H('6♥', '10♥', 'В♥')], table: [{ a: C('7♠'), d: -1 }] });
  assert.deepEqual(botMove(g, 1), { a: 'beat', card: C('8♠'), on: 0 }, 'козырем не переводит');
  // два козыря в начале партии — берёт, под конец — бьёт
  const deck = (k: number) => Array.from({ length: k }, (_, i) => i === 0 ? C('Т♦') : -1);
  g = state({ hands: [H('9♣'), H('6♦', '7♦', '8♣')], table: [{ a: C('Т♠'), d: -1 }, { a: C('Т♣'), d: -1 }], deck: deck(12) });
  assert.deepEqual(botMove(g, 1), { a: 'take' });
  g.deck = deck(3);
  assert.deepEqual(botMove(g, 1), { a: 'beat', card: C('6♦'), on: 0 });
  // нечем отбиться — берёт
  g = state({ hands: [H('9♣'), H('6♣')], table: [{ a: C('Т♠'), d: -1 }] });
  assert.deepEqual(botMove(g, 1), { a: 'take' });
  // подкидывание: мелкую некозырную — да, козырь при полной колоде — нет, картинку — только тому, кто берёт
  const beaten = [{ a: C('7♠'), d: C('8♠') }];
  g = state({ hands: [H('7♦', '7♣'), H('6♥', '10♥', 'В♥')], table: beaten.map((t) => ({ ...t })), deck: deck(10) });
  assert.deepEqual(botMove(g, 0), { a: 'attack', card: C('7♣') });
  g = state({ hands: [H('7♦'), H('6♥', '10♥', 'В♥')], table: beaten.map((t) => ({ ...t })), deck: deck(10) });
  assert.deepEqual(botMove(g, 0), { a: 'pass' });
  g = state({ hands: [H('Д♣'), H('6♥', '10♥', 'В♥')], table: [{ a: C('Д♠'), d: C('К♠') }], deck: deck(10) });
  assert.deepEqual(botMove(g, 0), { a: 'pass' });
  g = state({ hands: [H('Д♣'), H('6♥', '10♥', 'В♥')], table: [{ a: C('Д♠'), d: -1 }], deck: deck(10), taking: true });
  assert.deepEqual(botMove(g, 0), { a: 'attack', card: C('Д♣') });
});

/** Проверки, которые держатся на любом шаге партии. */
function invariants(g: Durak): void {
  const live: number[] = [...g.hands.flat(), ...g.deck];
  for (const t of g.table) {
    live.push(t.a);
    if (t.d >= 0) live.push(t.d);
  }
  assert.equal(live.length + g.discard, 36, 'карт всего 36');
  assert.equal(new Set(live).size, live.length, 'карты не двоятся');
  let unbeaten = 0;
  for (const t of g.table) if (t.d < 0) unbeaten++;
  if (!g.over) assert.ok(unbeaten <= g.hands[g.defender].length, 'неотбитых не больше, чем карт у отбивающегося');
  assert.ok(g.table.length <= (g.bout === 0 ? 5 : 6), 'лимит отбоя');
}

/** Кого ждём (как на сервере): ходящего, отбивающегося или всех, кто может подкинуть. */
function actors(g: Durak): number[] {
  const w = waiting(g);
  if (w === 'lead') return [g.attacker];
  if (w === 'defend') return [g.defender];
  if (w === 'throw' || w === 'take') return Array.from({ length: g.n }, (_, p) => p).filter((p) => canPass(g, p));
  return [];
}

/** Шаг партии ботов. false — партия кончилась. */
function botStep(g: Durak): boolean {
  if (g.over) return false;
  const w = waiting(g);
  if (w === 'bito' || w === 'took') {
    assert.ok(resolve(g));
    return true;
  }
  const list = actors(g);
  assert.ok(list.length > 0, `кого-то ждём (${w})`);
  for (const p of list) {
    const m = botMove(g, p);
    assert.ok(m, `бот ${p} знает, что делать (${w})`);
    if (m.a === 'pass') continue;
    assert.ok(legal(g, p, m), `ход бота законен: ${JSON.stringify(m)}`);
    ok(g, p, m);
    return true;
  }
  for (const p of list) ok(g, p, { a: 'pass' });
  return true;
}

test('300 партий ботов: карты не теряются, лимиты держатся, партия кончается', () => {
  let draws = 0;
  for (let i = 0; i < 300; i++) {
    const n = 2 + (i % 5);
    const mode: DurakMode = i % 2 ? 'transfer' : 'throw';
    const rng = makeRng(1000 + i);
    const g = newGame(n, shuffledDeck((k) => Math.floor(rng() * k)), mode);
    let moves = 0;
    invariants(g);
    while (botStep(g)) {
      invariants(g);
      assert.ok(++moves < 3000, `партия ${i} затянулась`);
    }
    assert.equal(g.out.length + (g.fool >= 0 ? 1 : 0), n, `партия ${i}: все вышли, кроме дурака`);
    if (g.fool >= 0) assert.ok(g.hands[g.fool].length > 0);
    else draws++;
  }
  assert.ok(draws < 60, `ничьих слишком много: ${draws}`);
});

test('клиент по открытому виду и своей руке знает свои ходы так же, как сервер', () => {
  for (let i = 0; i < 40; i++) {
    const n = 2 + (i % 5);
    const rng = makeRng(77 + i);
    const g = newGame(n, shuffledDeck((k) => Math.floor(rng() * k)), i % 2 ? 'transfer' : 'throw');
    let steps = 0;
    do {
      if (steps++ % 3 !== 0) continue;
      const v = viewOf(g);
      for (let p = 0; p < n; p++) {
        const h = fromView(v, p, g.hands[p]);
        assert.equal(suitOf(h.trump), suitOf(g.trump));
        assert.equal(canTake(h, p), canTake(g, p));
        assert.equal(canPass(h, p), canPass(g, p));
        for (const c of g.hands[p]) {
          assert.equal(canAttack(h, p, c), canAttack(g, p, c));
          assert.equal(canTransfer(h, p, c), canTransfer(g, p, c));
          for (let on = 0; on < g.table.length; on++) assert.equal(canBeat(h, p, c, on), canBeat(g, p, c, on));
        }
      }
    } while (botStep(g));
  }
});
