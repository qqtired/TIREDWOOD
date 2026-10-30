// «Ракушка», ?quizdemo части 2 — снимки без сервера: «Своя игра» (пульты, лампы, клетки), «Крокодил» (мольберт),
// «Кто из нас?» (голос со сцены). Шаги сменяются по кругу, чтобы видеть подъём пультов, лампу отвечающего и мазки.
// Только для отладки и снимков: в игру не влияет (сервер такие письма не шлёт).
import type { QzInkOp, QzMe, QzView } from '../../../shared/quiz/types.ts';

type Demo = { v: QzView; me: QzMe };

function base(slot: number, rev: number, mode: QzView['mode']): QzView {
  return {
    rev, now: Date.now(), phase: 'game', endsAt: 0, mode, count: 5, seated: 4, vote: null, riddle: null, results: null,
    evening: [{ slot, nick: 'Tester9', pts: 4 }], noTokens: false, zat: null,
    people: [{ slot, nick: 'Tester9', chair: -1, role: '', vote: -1 }], call: null, swap: { n: 0, need: 3 },
  };
}

function me(slot: number, place: number): QzMe {
  return { slot, place, role: '', vote: -1, swap: false, canSwap: true, canPlay: false, canTake: false, gapUntil: 0 };
}

const JP_STEPS = ['pick', 'read', 'buzz', 'answer', 'reveal'] as const;

/** «Своя игра»: я за пультом 0 (или ведущий), ещё двое; шаги по кругу каждые 5 с */
export function demoJp(slot: number, rev: number, place: number, host: boolean): Demo {
  const v = base(slot, rev, 'jeopardy');
  const now = Date.now();
  const step = JP_STEPS[rev % JP_STEPS.length];
  const players = [
    ...(host ? [] : [{ slot, nick: 'Tester9', pult: 0, score: 300, away: 0 }]),
    { slot: 901, nick: 'Барон', pult: 1, score: 500, away: 0 },
    { slot: 902, nick: 'Соня', pult: 3, score: -100, away: 0 },
  ];
  const themes = ['Рыбалка', 'Набережная', 'Кино', 'Море', 'Еда'].map((name, i) => ({ name, cells: [100, 200, 300, 400, 500].map((c, j) => ((i + j + rev) % 7 === 0 ? 0 : c)) }));
  const q = { theme: 'Рыбалка', price: 300, type: 'simple' as const, th: 0, cell: 2, content: [{ kind: 'text' as const, value: 'Самая крупная рыба, пойманная на пирсе' }] };
  v.jp = {
    step, pack: { id: 'b-naberezhnaya', title: 'Набережная' }, round: 'Раунд 1', final: false,
    host: host ? { slot, nick: 'Tester9' } : null, players, turn: step === 'pick' ? (host ? 901 : slot) : 0, themes, packs: null,
    q: step === 'pick' ? null : q, openAt: step === 'buzz' ? now : 0, buzz: step === 'answer' ? { slot: 901, nick: 'Барон' } : null, out: [], said: '',
    verdict: '', answer: step === 'reveal' ? { text: 'Сом', comment: '', reveal: [] } : null, dispute: null, fin: null,
    endsAt: now + 5000, total: 5000, lines: [], asks: [],
  };
  const m = me(slot, place);
  m.role = host ? 'host' : 'player';
  m.jp = { pult: host ? -1 : 0, canBuzz: step === 'buzz', lockUntil: 0, cat: false };
  v.people = [{ slot, nick: 'Tester9', chair: -1, role: m.role, vote: -1 }];
  return { v, me: m };
}

/** «Крокодил»: рисую я (или смотрю с кресла), шаг draw */
export function demoCroc(slot: number, rev: number, place: number, drawer: boolean): Demo {
  const v = base(slot, rev, 'croc');
  const now = Date.now();
  v.croc = {
    step: 'draw', num: 2, of: 4, drawer: drawer ? { slot, nick: 'Tester9' } : { slot: 0, nick: 'Барон' }, queue: [], mask: drawer ? 'МАЯК' : '_ _ _ _',
    level: 1, guessed: [], drawing: 1, endsAt: now + 60_000, total: 80_000, last: null, lines: [],
  };
  const m = me(slot, place);
  m.role = drawer ? 'drawer' : '';
  m.croc = { queued: false, drew: drawer, got: false, ...(drawer ? { word: 'маяк' } : {}) };
  return { v, me: m };
}

/** Мазки для зрителя «Крокодила»: домик-маяк по кусочку (каждый вызов — следующий кусок) */
export function demoInk(step: number): QzInkOp[] {
  const parts: QzInkOp[] = [
    ['s', 1, 0, 1, 420, 640, 460, 260, 560, 260, 600, 640],
    ['s', 2, 1, 2, 455, 330, 565, 330],
    ['s', 2, 1, 2, 445, 430, 575, 430],
    ['s', 3, 3, 2, 470, 260, 510, 180, 550, 260],
    ['s', 4, 3, 1, 520, 200, 760, 140, 520, 220, 760, 260],
    ['s', 5, 5, 2, 120, 690, 300, 660, 500, 690, 700, 660, 900, 690],
  ];
  return step < parts.length ? [parts[step]] : [];
}

/** «Кто из нас?»: голос — мой выбор кликом по желейке */
export function demoWho(slot: number, rev: number, place: number): Demo {
  const v = base(slot, rev, 'whoofus');
  const now = Date.now();
  v.who = {
    step: 'vote', num: 3, of: 10, players: [{ slot, nick: 'Tester9' }], q: 'Кто из нас первым уснёт на рыбалке?', title: 'Соня набережной', by: null,
    asked: 2, voted: 1, skip: { n: 0, need: 3 }, tally: null, leaders: [], endsAt: now + 12_000, total: 15_000, lines: [],
  };
  v.people = [{ slot, nick: 'Tester9', chair: 2, role: '', vote: -1, titles: ['Душа компании'] }];
  const m = me(slot, place);
  m.who = { in: true, vote: 0, skip: false, own: 1, pts: 2 };
  return { v, me: m };
}
