import { sanitizeChat } from '../text.ts';
import { checkAnswer } from './answer.ts';
import type { QzErrCode } from './net.ts';
import { QZ, QZ_CATEGORIES, type QzCategory, type QzLine, type QzRiddleEnd, type QzRiddleView, type QzWho } from './types.ts';

export interface RiddleWho extends QzWho { pid: number }
export interface RiddleError { code: QzErrCode; text: string; wait?: number }
interface Line extends QzLine {
  pid: number;
  unmarkedAt: number;
  version: number;
  match: 'yes' | 'near' | 'no';
  cancelled: boolean;
}
export interface RiddleResult {
  end: QzRiddleEnd;
  answer: string;
  riddler: RiddleWho;
  solver: RiddleWho | null;
  points: Record<number, number>;
  counted: boolean;
}
export interface RiddleState {
  step: 'round' | 'check' | 'reveal';
  riddler: RiddleWho;
  word: string;
  category: QzCategory;
  hints: string[];
  lines: Line[];
  nextId: number;
  endsAt: number;
  checking: QzRiddleView['checking'];
  undo: Array<{ id: number; version: number }>;
  gaps: Record<number, number>;
  result: RiddleResult | null;
}
export type RiddleAction =
  | { a: 'say'; who: RiddleWho; text: string; guessers: number }
  | { a: 'mark'; slot: number; id: number; m: 'warm' | 'hot' | 'miss' | 'win' }
  | { a: 'unmark'; slot: number; id: number }
  | { a: 'undo'; slot: number }
  | { a: 'giveup'; slot: number }
  | { a: 'hint'; slot: number; text: string }
  | { a: 'zat'; text: string }
  | { a: 'end'; end: 'left' | 'swap' | 'empty' }
  | { a: 'tick' };
export interface RiddleReply { state: RiddleState; error?: RiddleError }

const answerError = (): RiddleError => ({ code: 'answer', text: 'Нельзя писать ответ — опиши иначе' });
const wordError = (): RiddleError => ({ code: 'word', text: 'Напиши слово — от 2 до 40 знаков' });
const hintsError = (): RiddleError => ({ code: 'hints', text: 'Подсказок больше нет' });

export function validateWord(word: string, cat: string, hint = ''): { word: string; cat: QzCategory; hint: string; error?: RiddleError } {
  word = sanitizeChat(word); hint = sanitizeChat(hint);
  const value = { word, cat: cat as QzCategory, hint };
  if (word.length < QZ.WORD_MIN || word.length > QZ.WORD_MAX || !/\p{L}/u.test(word) || !QZ_CATEGORIES.includes(cat as QzCategory)) return { ...value, error: wordError() };
  if (hint.length > QZ.HINT_MAX) return { ...value, error: { code: 'hints', text: 'Подсказка — до 40 знаков' } };
  if (hint && checkAnswer(hint, word) !== 'no') return { ...value, error: answerError() };
  return value;
}

export function newRiddle(riddler: RiddleWho, word: string, category: QzCategory, hint: string, now: number, nextId = 1): RiddleState {
  return { step: 'round', riddler: { ...riddler }, word, category, hints: hint ? [hint] : [], lines: [], nextId,
    endsAt: now + QZ.ROUND_MS, checking: null, undo: [], gaps: {}, result: null };
}

function finish(s: RiddleState, end: QzRiddleEnd): void {
  const solverLine = end === 'solved' ? s.lines.find(l => l.id === s.checking?.line) : undefined;
  const solver = solverLine ? { slot: solverLine.slot, pid: solverLine.pid, nick: solverLine.nick } : null;
  const points: Record<number, number> = {};
  if (end === 'solved' || end === 'timeout') {
    for (const l of s.lines) if (l.mark === 'warm' || l.mark === 'hot') {
      points[l.pid] = Math.min(QZ.PTS_WARM_CAP, (points[l.pid] ?? 0) + (l.mark === 'hot' ? QZ.PTS_HOT : QZ.PTS_WARM));
    }
    if (solver) {
      points[solver.pid] = (points[solver.pid] ?? 0) + QZ.PTS_SOLVER;
      points[s.riddler.pid] = (points[s.riddler.pid] ?? 0) + QZ.PTS_RIDDLER;
    }
  }
  if (solverLine) solverLine.mark = 'win';
  s.result = { end, answer: s.word, riddler: { ...s.riddler }, solver, points, counted: end === 'solved' || end === 'timeout' };
  s.checking = null; s.step = 'reveal';
}

function check(s: RiddleState, l: Line, now: number): void {
  l.mark = 'check'; l.markedAt = now; l.version++;
  s.step = 'check'; s.checking = { slot: l.slot, nick: l.nick, line: l.id, until: now + QZ.CHECK_MS };
}

function unmark(l: Line, now: number): void {
  // Правка возвращает строку на исходный at. Прежние неотмеченные удаляет только НОВАЯ догадка (§7).
  l.mark = ''; l.markedAt = 0; l.unmarkedAt = now; l.version++;
}

/** Чистый переход: входное состояние не меняется, часы и автор приходят от сервера. */
export function reduceRiddle(before: RiddleState, a: RiddleAction, now: number): RiddleReply {
  if (before.result) return { state: before };
  const s: RiddleState = { ...before, lines: before.lines.map(l => ({ ...l })), hints: [...before.hints], undo: [...before.undo], gaps: { ...before.gaps } };
  const unchanged = (error?: RiddleError): RiddleReply => ({ state: before, ...(error ? { error } : {}) });
  if (a.a === 'tick') {
    s.lines = s.lines.filter(l => l.kind !== 'guess' || l.mark !== '' || now - l.unmarkedAt < QZ.LINE_TTL_MS);
    if (s.checking && now >= s.checking.until) finish(s, 'solved');
    else if (s.step === 'round' && now >= s.endsAt) finish(s, 'timeout');
    else if (s.lines.length === before.lines.length) return unchanged();
  } else if (a.a === 'end') finish(s, a.end);
  else if (a.a === 'zat') s.lines.push({ id: s.nextId++, slot: 0, pid: 0, nick: 'Затейник', text: a.text, at: now,
    kind: 'zat', mark: '', markedAt: 0, unmarkedAt: now, version: 0, match: 'no', cancelled: false });
  else if (a.a === 'say') {
    const text = sanitizeChat(a.text).slice(0, QZ.LINE_MAX);
    if (!text) return unchanged();
    const own = a.who.slot === s.riddler.slot;
    const match = checkAnswer(text, s.word);
    if (own && match !== 'no') return unchanged(answerError());
    const wait = (s.gaps[a.who.pid] ?? 0) - now;
    if (wait > 0) return unchanged({ code: 'rate', text: `Не так быстро — через ${Math.ceil(wait / 1000)} с`, wait });
    s.gaps[a.who.pid] = now + (own ? QZ.SAY_GAP_MS : a.guessers >= QZ.GUESS_CROWD ? QZ.GUESS_GAP_CROWD_MS : QZ.GUESS_GAP_MS);
    if (!own) s.lines = s.lines.filter(l => l.pid !== a.who.pid || l.kind !== 'guess' || l.mark !== '');
    const line: Line = { id: s.nextId++, ...a.who, text, at: now, kind: own ? 'say' : 'guess', mark: '', markedAt: 0,
      unmarkedAt: now, version: 0, match: own ? 'no' : match, cancelled: false };
    s.lines.push(line);
    if (!own && match === 'yes' && s.step === 'round') check(s, line, now);
  } else {
    if (a.slot !== s.riddler.slot) return unchanged();
    if (a.a === 'undo' && s.step === 'check' && s.checking) {
      const line = s.lines.find(l => l.id === s.checking!.line)!;
      line.cancelled = true; unmark(line, now); s.checking = null; s.step = 'round';
      if (now >= s.endsAt) finish(s, 'timeout');
      else {
        const next = s.lines.find(l => l.kind === 'guess' && l.mark === '' && l.match === 'yes' && !l.cancelled);
        if (next) check(s, next, now);
      }
    } else {
      if (s.step !== 'round') return unchanged();
      if (a.a === 'giveup') finish(s, 'timeout');
      else if (a.a === 'hint') {
        if (s.hints.length >= QZ.HINTS) return unchanged(hintsError());
        const text = sanitizeChat(a.text);
        if (!text || text.length > QZ.HINT_MAX) return unchanged({ code: 'hints', text: 'Подсказка — до 40 знаков' });
        if (checkAnswer(text, s.word) !== 'no') return unchanged(answerError());
        s.hints.push(text);
      } else if (a.a === 'undo') {
        let line: Line | undefined;
        while (s.undo.length && !line) {
          const entry = s.undo.pop()!;
          line = s.lines.find(l => l.id === entry.id && l.version === entry.version && (l.mark === 'warm' || l.mark === 'hot' || l.mark === 'miss'));
        }
        if (!line) return unchanged();
        if (line.mark === 'hot') {
          line.mark = 'warm'; line.markedAt = now; line.version++; s.undo.push({ id: line.id, version: line.version });
        } else unmark(line, now);
      } else {
        const line = s.lines.find(l => l.id === a.id && l.kind === 'guess');
        if (!line) return unchanged();
        if (a.a === 'unmark') {
          if (line.mark !== 'warm' && line.mark !== 'hot' && line.mark !== 'miss') return unchanged();
          unmark(line, now);
        } else {
          if (line.mark === a.m) return unchanged();
          if (a.m === 'win') check(s, line, now);
          else { line.mark = a.m; line.markedAt = now; line.version++; s.undo.push({ id: line.id, version: line.version }); }
        }
      }
    }
  }
  return { state: s };
}

/** Только публичные поля строки: pid, совпадения и стек никогда не идут в сеть. */
export function publicLine(l: QzLine): QzLine {
  return { id: l.id, slot: l.slot, nick: l.nick, text: l.text, at: l.at, kind: l.kind, mark: l.mark, markedAt: l.markedAt };
}

export function visibleLines(lines: readonly QzLine[]): QzLine[] {
  const out = lines.map(publicLine);
  while (out.length > QZ.LINES_KEEP) {
    const i = out.findIndex(l => l.kind !== 'guess' || l.mark === 'miss');
    out.splice(i < 0 ? 0 : i, 1);
  }
  return out;
}

export function nearLines(s: RiddleState): number[] {
  return s.lines.filter(l => l.kind === 'guess' && l.mark === '' && l.match !== 'no').map(l => l.id);
}

export function riddleView(s: RiddleState, num = 1): QzRiddleView {
  const who = (p: QzWho): QzWho => ({ slot: p.slot, nick: p.nick });
  const hot = s.lines.filter(l => l.mark === 'hot').sort((a, b) => a.markedAt - b.markedAt || a.id - b.id);
  return { step: s.step, num, of: QZ.RIDDLES, riddler: who(s.riddler), category: s.category, hints: [...s.hints],
    misses: s.lines.filter(l => l.mark === 'miss').sort((a, b) => a.markedAt - b.markedAt || a.id - b.id).slice(-QZ.BOARD_MISSES).map(l => l.text),
    warm: s.lines.filter(l => l.mark === 'warm').length, hot: hot.length, hotText: hot.at(-1)?.text ?? '',
    endsAt: s.step === 'reveal' ? 0 : s.endsAt, total: QZ.ROUND_MS,
    checking: s.checking ? { ...s.checking } : null, lines: visibleLines(s.lines),
    last: s.result ? { end: s.result.end, answer: s.result.answer, riddler: who(s.result.riddler), solver: s.result.solver ? who(s.result.solver) : null } : null };
}
