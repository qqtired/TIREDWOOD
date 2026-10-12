// Дурак (подкидной и переводной) за столиками кафе: карты, правила, ходы, ход по таймеру, бот,
// открытое состояние стола. Сервер ведёт партию этим кодом, клиент тем же кодом проверяет свои ходы.
// Проверки — test/durak.test.ts (в том числе 300 партий ботов).

export type DurakMode = 'throw' | 'transfer';

export const DECK_SIZE = 36;
export const HAND_SIZE = 6;
export const BOUT_MAX = 6;
export const FIRST_BOUT_MAX = 5;

export const SUIT_SIGNS: readonly string[] = ['♠', '♣', '♦', '♥'];
export const RANK_NAMES: readonly string[] = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
export const MODE_NAMES: Record<DurakMode, string> = { throw: 'Подкидной', transfer: 'Переводной' };
export const REACTIONS: readonly string[] = ['😂', '👏', '😡', '🤔'];

// Время в тиках (60 в секунду)
export const DK_COUNT_TICKS = 300;   // отсчёт перед раздачей
export const DK_TURN_TICKS = 1800;   // ход
export const DK_TAKE_TICKS = 360;    // окно подкидывания после «Беру» (от последней карты)
export const DK_SHOW_TICKS = 54;     // пауза перед «бито» / «взял»
export const DK_RESULT_TICKS = 480;  // показ итога
export const DK_AWAY_TICKS = 3600;   // автопилот за отошедшего, потом бот
export const DK_BOT_MIN = 42;        // раздумье бота
export const DK_BOT_MAX = 96;
export const DK_TOMATO_TICKS = 900;  // помидор с одного места
export const DK_REACT_TICKS = 72;    // реакции

/** Карта 0..35: масть = c div 9 (♠ ♣ ♦ ♥), достоинство = c mod 9 (6 … Т). */
export function suitOf(c: number): number {
  return Math.floor(c / 9);
}

export function rankOf(c: number): number {
  return c % 9;
}

export function cardName(c: number): string {
  return RANK_NAMES[rankOf(c)] + SUIT_SIGNS[suitOf(c)];
}

export function isRed(c: number): boolean {
  return suitOf(c) >= 2;
}

/** x бьёт y: та же масть и старше или козырь некозырную. trump — масть козыря. */
export function beats(x: number, y: number, trump: number): boolean {
  if (suitOf(x) === suitOf(y)) return rankOf(x) > rankOf(y);
  return suitOf(x) === trump;
}

/** Пара на столе: a — подкинутая, d — чем отбита (−1 — не отбита). */
export interface Pair {
  a: number;
  d: number;
}

export interface Durak {
  mode: DurakMode;
  n: number;
  hands: number[][];
  /** deck[0] — нижняя, она же козырная; берут с конца */
  deck: number[];
  /** Козырная карта (масть козыря — её масть) */
  trump: number;
  table: Pair[];
  attacker: number;
  defender: number;
  /** Отбивающийся сказал «Беру» */
  taking: boolean;
  /** Сказали «Бито» / «Пас» после последнего изменения стола */
  passed: boolean[];
  /** Сыграно отбоев (0 — идёт первый) */
  bout: number;
  /** Карт в бито */
  discard: number;
  /** Вышедшие, по порядку */
  out: number[];
  over: boolean;
  /** Дурак; −1 — ничья */
  fool: number;
}

export type DurakMove =
  | { a: 'attack'; card: number }
  | { a: 'beat'; card: number; on: number }
  | { a: 'transfer'; card: number }
  | { a: 'take' }
  | { a: 'pass' };

/**
 * Кого ждёт стол:
 * lead — первую карту, defend — отбивающегося, throw / take — подкидывающих (всё отбито / «Беру»),
 * bito / took — подкидывать больше некому, отбой можно закрывать; over — партия кончилась.
 */
export type Waiting = 'lead' | 'defend' | 'throw' | 'take' | 'bito' | 'took' | 'over';

/** Перемешанная колода (Фишер — Йетс), rand(n) ∈ [0, n). */
export function shuffledDeck(rand: (n: number) => number): number[] {
  const d = Array.from({ length: DECK_SIZE }, (_, i) => i);
  for (let i = d.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/**
 * Новая партия: по одной карте по кругу, шесть кругов, с конца колоды. Козырь — нижняя карта (при шестерых
 * она уходит последнему). Первым ходит lead («под дурака»), иначе — у кого младший козырь, а если козырей
 * ни у кого нет — у кого младшая карта (при равенстве — меньшая масть).
 */
export function newGame(n: number, deck: readonly number[], mode: DurakMode, lead = -1): Durak {
  const rest = [...deck];
  const hands: number[][] = Array.from({ length: n }, () => []);
  for (let r = 0; r < HAND_SIZE; r++) {
    for (let p = 0; p < n; p++) {
      const c = rest.pop();
      if (c !== undefined) hands[p].push(c);
    }
  }
  const g: Durak = {
    mode, n, hands, deck: rest, trump: deck[0], table: [], attacker: 0, defender: 0, taking: false,
    passed: new Array<boolean>(n).fill(false), bout: 0, discard: 0, out: [], over: false, fool: -1,
  };
  g.attacker = lead >= 0 && lead < n ? lead : firstMover(g);
  g.defender = nextIn(g, g.attacker);
  return g;
}

function firstMover(g: Durak): number {
  const ts = trumpSuit(g);
  let best = 0;
  let key = Infinity;
  for (let p = 0; p < g.n; p++) {
    for (const c of g.hands[p]) {
      const k = (suitOf(c) === ts ? 0 : 100) + rankOf(c) * 4 + suitOf(c);
      if (k < key) {
        key = k;
        best = p;
      }
    }
  }
  return best;
}

export function trumpSuit(g: Durak): number {
  return suitOf(g.trump);
}

/** Следующий по кругу, кто не вышел. */
export function nextIn(g: Durak, p: number): number {
  for (let i = 1; i <= g.n; i++) {
    const q = (p + i) % g.n;
    if (!g.out.includes(q)) return q;
  }
  return p;
}

function boutLimit(g: Durak): number {
  return g.bout === 0 ? FIRST_BOUT_MAX : BOUT_MAX;
}

function unbeaten(g: Durak): number {
  let k = 0;
  for (const t of g.table) if (t.d < 0) k++;
  return k;
}

function rankOnTable(g: Durak, rank: number): boolean {
  for (const t of g.table) if (rankOf(t.a) === rank || (t.d >= 0 && rankOf(t.d) === rank)) return true;
  return false;
}

/**
 * Положить карту: на пустой стол — только ходящий; дальше подкидывает любой, кроме отбивающегося,
 * достоинство должно быть на столе. Сказавший «Пас» молчит до следующего изменения стола.
 */
export function canAttack(g: Durak, p: number, card: number): boolean {
  if (g.over || p === g.defender || g.out.includes(p) || !g.hands[p].includes(card)) return false;
  if (g.table.length === 0 ? p !== g.attacker : g.passed[p] || !rankOnTable(g, rankOf(card))) return false;
  return g.table.length < boutLimit(g) && unbeaten(g) + 1 <= g.hands[g.defender].length;
}

export function canBeat(g: Durak, p: number, card: number, on: number): boolean {
  if (g.over || p !== g.defender || g.taking) return false;
  const t = g.table[on];
  return t !== undefined && t.d < 0 && g.hands[p].includes(card) && beats(card, t.a, trumpSuit(g));
}

/** Перевод: переводной режим, ничего не отбито, та же карта, у следующего хватает карт отбиться от всех. */
export function canTransfer(g: Durak, p: number, card: number): boolean {
  if (g.over || g.mode !== 'transfer' || p !== g.defender || g.taking || g.table.length === 0) return false;
  if (unbeaten(g) !== g.table.length || !g.hands[p].includes(card) || rankOf(card) !== rankOf(g.table[0].a)) return false;
  const q = nextIn(g, p);
  return q !== p && g.table.length + 1 <= boutLimit(g) && g.hands[q].length >= g.table.length + 1;
}

export function canTake(g: Durak, p: number): boolean {
  return !g.over && p === g.defender && !g.taking && unbeaten(g) > 0;
}

/** Есть что подкинуть прямо сейчас. */
export function canThrowAny(g: Durak, p: number): boolean {
  for (const c of g.hands[p]) if (canAttack(g, p, c)) return true;
  return false;
}

/** «Бито» / «Пас»: всё отбито или идёт «Беру», и есть что подкинуть (кому нечего — того не ждём). */
export function canPass(g: Durak, p: number): boolean {
  if (g.over || p === g.defender || g.out.includes(p) || g.table.length === 0 || g.passed[p]) return false;
  if (!g.taking && unbeaten(g) > 0) return false;
  return canThrowAny(g, p);
}

export function legal(g: Durak, p: number, m: DurakMove): boolean {
  switch (m.a) {
    case 'attack':
      return canAttack(g, p, m.card);
    case 'beat':
      return canBeat(g, p, m.card, m.on);
    case 'transfer':
      return canTransfer(g, p, m.card);
    case 'take':
      return canTake(g, p);
    case 'pass':
      return canPass(g, p);
  }
  return false;
}

/** Применяет ход, если он законен. Любое изменение стола сбрасывает «Пас». */
export function play(g: Durak, p: number, m: DurakMove): boolean {
  if (!legal(g, p, m)) return false;
  if (m.a === 'pass') {
    g.passed[p] = true;
    return true;
  }
  if (m.a === 'take') g.taking = true;
  else {
    const h = g.hands[p];
    h.splice(h.indexOf(m.card), 1);
    if (m.a === 'beat') g.table[m.on].d = m.card;
    else g.table.push({ a: m.card, d: -1 });
    if (m.a === 'transfer') g.defender = nextIn(g, p);
  }
  g.passed.fill(false);
  return true;
}

function anyThrower(g: Durak): boolean {
  for (let p = 0; p < g.n; p++) if (canPass(g, p)) return true;
  return false;
}

export function waiting(g: Durak): Waiting {
  if (g.over) return 'over';
  if (g.table.length === 0) return 'lead';
  if (g.taking) return anyThrower(g) ? 'take' : 'took';
  if (unbeaten(g) > 0) return 'defend';
  return anyThrower(g) ? 'throw' : 'bito';
}

/** Все, кто ещё может подкинуть, сказали «Пас» (истёк таймер). */
export function passAll(g: Durak): void {
  for (let p = 0; p < g.n; p++) if (p !== g.defender && !g.out.includes(p)) g.passed[p] = true;
}

/**
 * Закрыть отбой (только при bito / took): карты в бито или отбивающемуся, добор до шести — от ходившего
 * по кругу, отбивающийся последним. При пустой колоде вышедшие без карт выходят в порядке добора.
 * Остался один с картами — он дурак; никого — ничья.
 */
export function resolve(g: Durak): boolean {
  const w = waiting(g);
  if (w !== 'bito' && w !== 'took') return false;
  const cards: number[] = [];
  for (const t of g.table) {
    cards.push(t.a);
    if (t.d >= 0) cards.push(t.d);
  }
  if (w === 'took') g.hands[g.defender].push(...cards);
  else g.discard += cards.length;
  g.table = [];
  g.taking = false;
  g.passed.fill(false);
  g.bout++;

  const order: number[] = [];
  for (let i = 0; i < g.n; i++) {
    const p = (g.attacker + i) % g.n;
    if (p !== g.defender && !g.out.includes(p)) order.push(p);
  }
  if (!g.out.includes(g.defender)) order.push(g.defender);
  for (const p of order) {
    while (g.hands[p].length < HAND_SIZE && g.deck.length > 0) g.hands[p].push(g.deck.pop()!);
  }
  if (g.deck.length === 0) for (const p of order) if (g.hands[p].length === 0) g.out.push(p);

  const left = order.filter((p) => g.hands[p].length > 0);
  if (left.length <= 1) {
    g.over = true;
    g.fool = left.length === 1 ? left[0] : -1;
    return true;
  }
  g.attacker = w === 'took' || g.out.includes(g.defender) ? nextIn(g, g.defender) : g.defender;
  g.defender = nextIn(g, g.attacker);
  return true;
}

/** Цена карты для бота и хода по таймеру: козыри дороже всех. */
function cost(ts: number, c: number): number {
  return (suitOf(c) === ts ? 100 : 0) + rankOf(c);
}

/** Самая дешёвая карта списка (при равенстве — первая), −1 — список пуст. */
function cheapest(ts: number, cards: readonly number[]): number {
  let best = -1;
  for (const c of cards) if (best < 0 || cost(ts, c) < cost(ts, best)) best = c;
  return best;
}

/** Ход за человека, у которого истёк таймер. */
export function autoMove(g: Durak, p: number): DurakMove | null {
  const w = waiting(g);
  const ts = trumpSuit(g);
  if (w === 'lead') return p === g.attacker && g.hands[p].length > 0 ? { a: 'attack', card: cheapest(ts, g.hands[p]) } : null;
  if (w === 'defend') {
    if (p !== g.defender) return null;
    const on = g.table.findIndex((t) => t.d < 0);
    const c = cheapest(ts, g.hands[p].filter((x) => canBeat(g, p, x, on)));
    return c >= 0 ? { a: 'beat', card: c, on } : { a: 'take' };
  }
  if (w === 'throw' || w === 'take') return canPass(g, p) ? { a: 'pass' } : null;
  return null;
}

/** План отбоя: неотбитые от дорогих к дешёвым, каждой — самая дешёвая свободная карта, которая бьёт. */
function defensePlan(g: Durak, p: number): { card: number; on: number }[] | null {
  const ts = trumpSuit(g);
  const open: number[] = [];
  g.table.forEach((t, i) => {
    if (t.d < 0) open.push(i);
  });
  open.sort((x, y) => cost(ts, g.table[y].a) - cost(ts, g.table[x].a));
  const free = [...g.hands[p]];
  const plan: { card: number; on: number }[] = [];
  for (const on of open) {
    const c = cheapest(ts, free.filter((x) => beats(x, g.table[on].a, ts)));
    if (c < 0) return null;
    free.splice(free.indexOf(c), 1);
    plan.push({ card: c, on });
  }
  return plan;
}

/**
 * Бот (и автопилот за отошедшего). Ходит самой дешёвой. Отбиваясь, переводит некозырной, если можно;
 * не может отбиться или в начале партии тратит два козыря и больше — берёт. Подкидывает мелочь:
 * козыри и старше десятки бережёт, пока есть колода (картинки отдаёт только тому, кто берёт).
 */
export function botMove(g: Durak, p: number): DurakMove | null {
  const w = waiting(g);
  const ts = trumpSuit(g);
  const hand = g.hands[p];
  if (w === 'lead') return p === g.attacker && hand.length > 0 ? { a: 'attack', card: cheapest(ts, hand) } : null;
  if (w === 'defend') {
    if (p !== g.defender) return null;
    if (g.mode === 'transfer') {
      const t = cheapest(ts, hand.filter((c) => suitOf(c) !== ts && canTransfer(g, p, c)));
      if (t >= 0) return { a: 'transfer', card: t };
    }
    const plan = defensePlan(g, p);
    if (!plan) return { a: 'take' };
    let trumps = 0;
    for (const x of plan) if (suitOf(x.card) === ts) trumps++;
    if (trumps >= 2 && g.deck.length >= 12) return { a: 'take' };
    return { a: 'beat', card: plan[0].card, on: plan[0].on };
  }
  if (w === 'throw' || w === 'take') {
    if (!canPass(g, p)) return null;
    const fit = hand.filter((c) => canAttack(g, p, c) && (g.deck.length === 0 || (suitOf(c) !== ts && (g.taking || rankOf(c) <= 4))));
    const c = cheapest(ts, fit);
    return c >= 0 ? { a: 'attack', card: c } : { a: 'pass' };
  }
  return null;
}

/** Все ходы этой картой (если их несколько — клиент спрашивает, какой). */
export function movesFor(g: Durak, p: number, card: number): DurakMove[] {
  const list: DurakMove[] = [];
  if (canAttack(g, p, card)) list.push({ a: 'attack', card });
  if (canTransfer(g, p, card)) list.push({ a: 'transfer', card });
  for (let on = 0; on < g.table.length; on++) if (canBeat(g, p, card, on)) list.push({ a: 'beat', card, on });
  return list;
}

/** Погоны: у дурака в руке осталась шестёрка. */
export function epaulets(g: Durak): boolean {
  return g.over && g.fool >= 0 && g.hands[g.fool].some((c) => rankOf(c) === 0);
}

/** Открытое состояние стола: видят все. Чужих карт нет, только их число; руку дурака открываем в конце. */
export interface DurakView {
  mode: DurakMode;
  n: number;
  counts: number[];
  deck: number;
  trump: number;
  table: Pair[];
  attacker: number;
  defender: number;
  taking: boolean;
  passed: boolean[];
  bout: number;
  discard: number;
  out: number[];
  over: boolean;
  fool: number;
  waiting: Waiting;
  foolHand: number[];
}

export function viewOf(g: Durak): DurakView {
  return {
    mode: g.mode, n: g.n, counts: g.hands.map((h) => h.length), deck: g.deck.length, trump: g.trump,
    table: g.table.map((t) => ({ a: t.a, d: t.d })), attacker: g.attacker, defender: g.defender, taking: g.taking,
    passed: [...g.passed], bout: g.bout, discard: g.discard, out: [...g.out], over: g.over, fool: g.fool,
    waiting: waiting(g), foolHand: g.over && g.fool >= 0 ? [...g.hands[g.fool]] : [],
  };
}

/**
 * Состояние по открытому виду и своей руке. Чужие руки — заглушки −1 нужной длины, колода — заглушки
 * с козырем внизу. Проверки ходов для me совпадают с полным состоянием: они смотрят только свою руку
 * и число чужих карт. waiting() по такому состоянию считать нельзя — он есть в виде.
 */
export function fromView(v: DurakView, me: number, hand: readonly number[]): Durak {
  const hands = v.counts.map((k, i) => (i === me ? [...hand] : new Array<number>(k).fill(-1)));
  if (v.over && v.fool >= 0 && v.fool !== me) hands[v.fool] = [...v.foolHand];
  const deck = new Array<number>(v.deck).fill(-1);
  if (v.deck > 0) deck[0] = v.trump;
  return {
    mode: v.mode, n: v.n, hands, deck, trump: v.trump, table: v.table.map((t) => ({ a: t.a, d: t.d })),
    attacker: v.attacker, defender: v.defender, taking: v.taking, passed: [...v.passed], bout: v.bout,
    discard: v.discard, out: [...v.out], over: v.over, fool: v.fool,
  };
}
