import { sanitizeChat } from '../text.ts';
import { checkAnswer } from './answer.ts';
import type { QzErrCode } from './net.ts';
import { QZ, QZ_CROC as CR, type QzCrocBoard, type QzCrocEnd, type QzCrocMe, type QzCrocView, type QzInkOp,
  type QzLine, type QzPack, type QzWho } from './types.ts';

export interface CrocWho extends QzWho { pid: number; seated?: boolean }
export interface CrocError { code: QzErrCode; text: string; wait?: number }
type Stroke = { id: number; color: number; width: number; points: number[] } | { id: number; color: number; fill: [number, number] };
export interface CrocTurnResult {
  id: number; end: QzCrocEnd; drawer: CrocWho; guessed: CrocWho[]; points: Record<number, number>; counted: boolean;
}
export interface CrocState {
  step: QzCrocBoard['step']; people: CrocWho[]; queue: CrocWho[]; drew: number[]; skipped: number[];
  drawer: CrocWho | null; assigned: CrocWho | null; initialCall: boolean;
  pool: NonNullable<QzPack['words']>; choices: [string, string, string] | null; word: string; level: number;
  revealed: number[]; letters: number; guessed: Array<CrocWho & { pts: number }>;
  scores: Record<number, number>; turns: CrocTurnResult[]; drawing: number;
  strokes: Stroke[]; inkPoints: number; inkStrokes: number; maxStroke: number; inkAt: number | null;
  lines: QzLine[]; nextId: number; gaps: Record<number, number>;
  endsAt: number; total: number; last: QzCrocBoard['last']; done: boolean;
}
export type CrocAction =
  | { a: 'tick' }
  | { a: 'presence'; people: CrocWho[] }
  | { a: 'role'; who: CrocWho; take: boolean }
  | { a: 'crWord'; slot: number; i: number }
  | { a: 'crInk'; slot: number; ops: QzInkOp[] }
  | { a: 'say'; slot: number; text: string }
  | { a: 'end'; end: 'left' | 'swap' | 'empty' };
export interface CrocReply { state: CrocState; error?: CrocError; ink?: { d: number; ops: QzInkOp[]; full?: boolean } }
const who = (p: QzWho): QzWho => ({ slot: p.slot, nick: p.nick });
const choose = <T>(xs: readonly T[], rand: () => number): T => xs[Math.min(xs.length - 1, Math.max(0, Math.floor(rand() * xs.length)))];
function phase(s: CrocState, step: CrocState['step'], now: number, ms: number): void { s.step = step; s.endsAt = now + ms; s.total = ms; }
export function crocWords(packs: readonly QzPack[]): NonNullable<QzPack['words']> {
  const out = { easy: [] as string[], mid: [] as string[], hard: [] as string[] };
  for (const p of packs) if (p.kind === 'words' && !p.adult && p.words) for (const k of ['easy', 'mid', 'hard'] as const) out[k].push(...p.words[k]);
  for (const k of ['easy', 'mid', 'hard'] as const) out[k] = [...new Set(out[k])];
  return out;
}
export function newCroc(people: CrocWho[], packs: readonly QzPack[], now: number, queue: CrocWho[] = []): CrocState {
  const pool = crocWords(packs);
  queue = structuredClone(queue).filter((p, i, xs) => xs.findIndex(w => w.pid === p.pid) === i && people.some(w => w.pid === p.pid)).slice(0, CR.TURNS_MAX);
  const callMs = queue.length ? 0 : QZ.CALL_MS;
  return { step: 'call', people: structuredClone(people), queue,
    drew: [], skipped: [], drawer: null, assigned: null, initialCall: true, pool, choices: null, word: '', level: 0,
    revealed: [], letters: 0, guessed: [], scores: {}, turns: [], drawing: 0, strokes: [], inkPoints: 0, inkStrokes: 0,
    maxStroke: -1, inkAt: null, lines: [], nextId: 1, gaps: {}, endsAt: now + callMs, total: callMs,
    last: null, done: people.length < 2 || Object.values(pool).some(a => !a.length) };
}
function begin(s: CrocState, drawer: CrocWho, now: number, rand: () => number): void {
  s.drawer = { ...drawer }; s.assigned = null; s.queue = s.queue.filter(p => p.pid !== drawer.pid);
  s.choices = [choose(s.pool.easy, rand), choose(s.pool.mid, rand), choose(s.pool.hard, rand)];
  s.guessed = []; s.word = ''; s.revealed = []; s.letters = 0; s.lines = []; s.gaps = {};
  phase(s, 'words', now, CR.WORDS_MS);
}
function draw(s: CrocState, i: number, now: number): void {
  if (!s.choices || !Number.isInteger(i) || i < 0 || i > 2) return;
  s.word = s.choices[i]; s.level = i; s.drawing++; s.drew.push(s.drawer!.pid);
  s.strokes = []; s.inkPoints = 0; s.inkStrokes = 0; s.maxStroke = -1; s.inkAt = null;
  phase(s, 'draw', now, CR.DRAW_MS);
}
function finishTurn(s: CrocState, end: QzCrocEnd, now: number): void {
  if (!s.drawer || !['words', 'draw'].includes(s.step)) return;
  const counted = (end === 'all' || end === 'timeout') && s.step === 'draw', points: Record<number, number> = {};
  if (counted) {
    for (const p of s.guessed) points[p.pid] = p.pts;
    points[s.drawer.pid] = Math.ceil(Math.min(CR.PTS_DRAWER_CAP, s.guessed.length * CR.PTS_DRAWER) * CR.MULT[s.level]);
    for (const [pid, pts] of Object.entries(points)) s.scores[Number(pid)] = (s.scores[Number(pid)] ?? 0) + pts;
  }
  s.turns.push({ id: s.drawing, end, drawer: { ...s.drawer }, guessed: s.guessed.map(p => ({ ...p })), points, counted });
  s.last = { end, word: s.word, drawer: who(s.drawer), guessed: s.guessed.length };
  phase(s, 'reveal', now, CR.REVEAL_MS);
}
function next(s: CrocState, now: number, rand: () => number): void {
  s.drawer = null; s.assigned = null; s.word = ''; s.choices = null; s.initialCall = false; s.skipped = [];
  if (s.drew.length >= CR.TURNS_MAX) { s.done = true; return; }
  const p = s.queue.shift();
  if (p) begin(s, p, now, rand); else phase(s, 'call', now, QZ.CALL_MS);
}
function allGuessed(s: CrocState): boolean {
  const ps = s.people.filter(p => p.pid !== s.drawer?.pid);
  return ps.length > 0 && ps.every(p => s.guessed.some(g => g.pid === p.pid));
}
function assign(s: CrocState, now: number, rand: () => number): void {
  const ps = s.people.filter(p => !s.drew.includes(p.pid) && !s.skipped.includes(p.pid));
  const seated = ps.filter(p => p.seated);
  if (!ps.length) { s.done = true; return; }
  s.assigned = { ...choose(seated.length ? seated : ps, rand) }; s.endsAt = now + QZ.CALL_MS;
}
function timer(s: CrocState, now: number, rand: () => number): void {
  if (s.step === 'draw') {
    while (s.letters < CR.LETTERS_AT_MS.length && s.endsAt - now <= CR.LETTERS_AT_MS[s.letters]) {
      const candidates = [...s.word].map((c, i) => /[\p{L}\p{N}]/u.test(c) && !s.revealed.includes(i) ? i : -1).filter(i => i >= 0);
      if (candidates.length) s.revealed.push(choose(candidates, rand)); s.letters++;
    }
  }
  if (now < s.endsAt) return;
  if (s.step === 'call') {
    const p = s.queue.shift();
    if (p) begin(s, p, now, rand);
    else if (!s.initialCall) s.done = true;
    else { if (s.assigned) s.skipped.push(s.assigned.pid); assign(s, now, rand); }
  } else if (s.step === 'words') draw(s, choose([0, 1, 2], rand), now);
  else if (s.step === 'draw') finishTurn(s, 'timeout', now);
  else next(s, now, rand);
}

/** Пачка атомарна: неверная точка/операция не применяет даже предыдущие мазки. Лимит — за весь рисунок. */
function ink(s: CrocState, ops: QzInkOp[], now: number): boolean {
  if (!Array.isArray(ops) || !ops.length || ops.length > CR.INK_STROKES + CR.INK_PTS_MSG || (s.inkAt !== null && now - s.inkAt < CR.INK_BATCH_MS)) return false;
  let points = 0, count = s.inkStrokes, max = s.maxStroke;
  const strokes = s.strokes.map(st => ({ ...st }));
  for (const op of ops) {
    if (!Array.isArray(op)) return false;
    if (op[0] === 'x' && op.length === 1) strokes.length = 0;
    else if (op[0] === 'u' && op.length === 2 && Number.isSafeInteger(op[1]) && op[1] >= 0) {
      for (let i = strokes.length - 1; i >= 0; i--) if (strokes[i].id === op[1]) strokes.splice(i, 1);
    } else if (op[0] === 'f' && op.length === 5) {
      const [, id, color, x, y] = op;
      if (![id, color, x, y].every(Number.isSafeInteger) || id <= max || color < 0 || color > CR.ERASER
        || x < 0 || x >= CR.W || y < 0 || y >= CR.H || ++count > CR.INK_STROKES
        || ++points > CR.INK_PTS_MSG || s.inkPoints + points > CR.INK_PTS) return false;
      max = id; strokes.push({ id, color, fill: [x, y] });
    } else if (op[0] === 's' && op.length >= 6 && op.length % 2 === 0) {
      const [, id, color, width, ...xy] = op;
      if (![id, color, width].every(Number.isSafeInteger) || id < 0 || color < 0 || color > CR.ERASER || width < 0 || width >= CR.WIDTHS.length
        || xy.some((n, i) => !Number.isInteger(n) || n < 0 || n >= (i % 2 ? CR.H : CR.W))) return false;
      points += xy.length / 2;
      if (points > CR.INK_PTS_MSG || s.inkPoints + points > CR.INK_PTS) return false;
      const st = strokes.find(st => st.id === id);
      if (st) {
        if ('fill' in st || st.color !== color || st.width !== width) return false;
        const last = strokes.at(-1)!;
        // Продолжение старого мазка после заливки остаётся после неё и в полном рисунке.
        if (last.id === id && 'points' in last) last.points = [...last.points, ...xy];
        else strokes.push({ id, color, width, points: xy });
      } else {
        if (id <= max || ++count > CR.INK_STROKES) return false;
        max = id; strokes.push({ id, color, width, points: xy });
      }
    } else return false;
  }
  s.strokes = strokes; s.inkPoints += points; s.inkStrokes = count; s.maxStroke = max; s.inkAt = now; return true;
}
/** Чистый переход; массив точек копируется лишь у изменённого мазка. */
export function reduceCroc(before: CrocState, a: CrocAction, now: number, rand: () => number): CrocReply {
  if (before.done) return { state: before };
  const s: CrocState = { ...before, people: before.people.map(p => ({ ...p })), queue: [...before.queue], drew: [...before.drew],
    skipped: [...before.skipped], revealed: [...before.revealed], guessed: [...before.guessed], scores: { ...before.scores },
    turns: [...before.turns], lines: [...before.lines], gaps: { ...before.gaps } };
  const oldDrawing = s.drawing;
  timer(s, now, rand);
  const reply = (error?: CrocError): CrocReply => ({ state: s, ...(error ? { error } : {}), ...(s.drawing !== oldDrawing ? { ink: crocInk(s) } : {}) });
  if (s.done || a.a === 'tick') return reply();
  if (a.a === 'presence') {
    s.people = structuredClone(a.people);
    s.queue = s.queue.filter(p => s.people.some(w => w.pid === p.pid));
    if (s.drawer && !s.people.some(p => p.pid === s.drawer!.pid)) finishTurn(s, 'left', now);
    else if (s.step === 'draw' && allGuessed(s)) finishTurn(s, 'all', now);
    if (s.assigned && !s.people.some(p => p.pid === s.assigned!.pid)) { s.skipped.push(s.assigned.pid); assign(s, now, rand); }
    return reply();
  }
  if (a.a === 'end') {
    finishTurn(s, a.end, now);
    if (a.end === 'swap' || a.end === 'empty') s.done = true;
    return reply();
  }
  if (a.a === 'role') {
    if (!s.people.some(p => p.pid === a.who.pid)) return reply();
    if (!a.take) {
      s.queue = s.queue.filter(p => p.pid !== a.who.pid);
      if (s.assigned?.pid === a.who.pid) { s.skipped.push(a.who.pid); assign(s, now, rand); }
      else if (s.drawer?.pid === a.who.pid && s.step === 'words') { s.skipped.push(a.who.pid); next(s, now, rand); }
      return reply();
    }
    if (s.drew.includes(a.who.pid) || s.queue.some(p => p.pid === a.who.pid) || s.drawer?.pid === a.who.pid
      || s.drew.length + s.queue.length + Number(s.step === 'words') >= CR.TURNS_MAX) return reply();
    if (s.step === 'call' && (s.assigned?.pid === a.who.pid || !s.initialCall)) begin(s, a.who, now, rand);
    else if (!s.assigned) s.queue.push({ ...a.who });
    return reply();
  }
  const p = s.people.find(p => p.slot === a.slot); if (!p) return reply();
  const drawer = s.drawer?.pid === p.pid;
  if (a.a === 'crWord' && drawer && s.step === 'words') draw(s, a.i, now);
  else if (a.a === 'crInk' && drawer && s.step === 'draw') {
    if (ink(s, a.ops, now)) return { state: s, ink: { d: s.drawing, ops: structuredClone(a.ops) } };
  } else if (a.a === 'say') {
    const text = sanitizeChat(a.text).slice(0, QZ.LINE_MAX); if (!text) return reply();
    const got = s.guessed.some(g => g.pid === p.pid), match = s.step === 'draw' ? checkAnswer(text, s.word) : 'no';
    if (drawer && match !== 'no') return reply({ code: 'answer', text: 'Нельзя писать ответ — опиши иначе' });
    const wait = (s.gaps[p.pid] ?? 0) - now;
    if (wait > 0) return reply({ code: 'rate', text: `Не так быстро — через ${Math.ceil(wait / 1000)} с`, wait });
    const guess = s.step === 'draw' && !drawer && !got;
    s.gaps[p.pid] = now + (guess && s.people.length - 1 >= QZ.GUESS_CROWD ? QZ.GUESS_GAP_CROWD_MS : QZ.SAY_GAP_MS);
    if (guess && match === 'near') return reply({ code: 'near', text: 'Почти!' });
    if (guess && match === 'yes') {
      const pts = Math.ceil((CR.PTS_ORDER[s.guessed.length] ?? CR.PTS_REST) * CR.MULT[s.level]);
      s.guessed.push({ ...p, pts });
      s.lines.push({ id: s.nextId++, ...who(p), text: `✓ ${p.nick} угадал!`, kind: 'got', at: now, mark: '', markedAt: 0 });
      if (allGuessed(s)) finishTurn(s, 'all', now);
    } else s.lines.push({ id: s.nextId++, ...who(p), text, kind: guess ? 'guess' : 'say', at: now, mark: '', markedAt: 0,
      ...(got && s.step === 'draw' ? { only: 'guessed' as const } : {}) });
    s.lines = s.lines.slice(-QZ.LINES_KEEP);
  }
  return reply();
}
export function crocInk(s: CrocState): { d: number; ops: QzInkOp[]; full: true } {
  return { d: s.drawing, full: true, ops: s.strokes.map(st => 'fill' in st ? ['f', st.id, st.color, ...st.fill] : ['s', st.id, st.color, st.width, ...st.points]) };
}
export function crocBoard(s: CrocState): QzCrocBoard {
  const chars = [...s.word].map((c, i) => /[\p{L}\p{N}]/u.test(c) && !s.revealed.includes(i) ? '_' : c);
  return { step: s.step, num: Math.min(CR.TURNS_MAX, s.drew.length + Number(s.step === 'call' || s.step === 'words')),
    of: Math.min(CR.TURNS_MAX, Math.max(1, s.drew.length + s.queue.length + Number(s.step === 'words'))),
    drawer: s.drawer && who(s.drawer), queue: s.queue.map(who), mask: chars.join(' '), level: s.level,
    guessed: s.guessed.map(p => ({ ...who(p), pts: p.pts })), drawing: s.drawing, endsAt: s.endsAt, total: s.total,
    last: s.last ? structuredClone(s.last) : null };
}
export function crocView(s: CrocState, slot: number): QzCrocView {
  const p = s.people.find(p => p.slot === slot), canRead = !!p && (s.drawer?.pid === p.pid || s.guessed.some(g => g.pid === p.pid));
  return { ...crocBoard(s), lines: s.lines.filter(l => !l.only || canRead).map(l => ({ ...l })) };
}
export function crocMe(s: CrocState, slot: number): QzCrocMe {
  const p = s.people.find(p => p.slot === slot), pid = p?.pid;
  const me: QzCrocMe = { queued: s.queue.some(p => p.pid === pid), drew: pid !== undefined && s.drew.includes(pid), got: s.guessed.some(p => p.pid === pid) };
  if (pid !== undefined && s.drawer?.pid === pid) {
    if (s.step === 'words' && s.choices) me.choices = [...s.choices];
    if (s.step === 'draw') me.word = s.word;
  }
  return me;
}
