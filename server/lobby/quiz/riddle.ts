/** Сроки «Загадки». Решения о людях, ролях и местах остаются в QuizStage. */
import { sanitizeChat } from '../../../shared/text.ts';
import type { QuizClientMsg } from '../../../shared/quiz/net.ts';
import { newRiddle, reduceRiddle, riddleView, nearLines, validateWord, visibleLines,
  type RiddleAction, type RiddleError, type RiddleResult, type RiddleState, type RiddleWho } from '../../../shared/quiz/riddle.ts';
import { QZ, type QzLine, type QzMe, type QzRiddleView, type QzRiddleStep } from '../../../shared/quiz/types.ts';
import type { QuizController } from './controller.ts';

export class RiddleGame implements QuizController {
  readonly mode = 'riddle';
  accepted = false;
  step: QzRiddleStep = 'call';
  riddler: RiddleWho | null = null;
  played = 0;
  startedAt: number | null = null;
  deadline = 0;
  nextId: number;
  round: RiddleState | null = null;
  readonly guessers = new Set<number>();
  roundStartedAt = 0;
  last: QzRiddleView['last'] = null;
  private pending: RiddleResult | null = null;
  private lines: QzLine[] = [];
  private gaps: Record<number, number> = {};
  private hurry = false;
  private queue: RiddleWho[] = [];
  private preps = new Map<number, NonNullable<QzMe['prep']>>();

  constructor(nextId = 1) { this.nextId = nextId; }

  beginAsk(who: RiddleWho, now: number): void {
    this.leaveQueue(who.pid); this.round = null; this.lines = [];
    this.startedAt ??= now;
    this.riddler = { ...who }; this.step = 'ask'; this.deadline = now + QZ.ASK_MS;
  }

  beginCall(): void {
    this.round = null; this.riddler = null; this.step = 'call'; this.deadline = 0; this.lines = [];
  }

  joinQueue(who: RiddleWho): boolean {
    if (this.roleOf(who.slot) || this.queue.some(p => p.pid === who.pid) || this.queue.length >= QZ.QUEUE_MAX) return false;
    this.queue.push({ ...who }); return true;
  }

  leaveQueue(pid: number): void {
    this.queue = this.queue.filter(p => p.pid !== pid); this.preps.delete(pid);
  }

  syncQueue(people: readonly RiddleWho[]): void {
    for (const p of this.queue) if (!people.some(w => w.pid === p.pid)) this.leaveQueue(p.pid);
    this.queue = this.queue.map(p => ({ ...people.find(w => w.pid === p.pid)! }));
  }

  firstInQueue(pid: number): void {
    const i = this.queue.findIndex(p => p.pid === pid);
    if (i > 0) this.queue.unshift(...this.queue.splice(i, 1));
  }

  takeQueued(): { who: RiddleWho; prep: QzMe['prep'] } | null {
    const who = this.queue[0];
    if (!who) return null;
    const prep = this.preps.get(who.pid) ?? null;
    this.leaveQueue(who.pid); return { who, prep };
  }

  message(who: RiddleWho, msg: QuizClientMsg, guessers: number, now: number): RiddleError | undefined {
    const before = JSON.stringify([this.step, this.round, this.lines, this.gaps, [...this.preps]]);
    const error = this.receive(who, msg, guessers, now);
    this.accepted = !error && before !== JSON.stringify([this.step, this.round, this.lines, this.gaps, [...this.preps]]);
    if (this.accepted && msg.a === 'say' && this.round && who.pid !== this.riddler?.pid && (this.step === 'round' || this.step === 'check')) this.guessers.add(who.pid);
    return error;
  }

  private receive(who: RiddleWho, msg: QuizClientMsg, guessers: number, now: number): RiddleError | undefined {
    if (msg.a === 'prep') {
      if (!this.queue.some(p => p.pid === who.pid)) return;
      const word = validateWord(msg.word, msg.cat, msg.hint);
      if (word.error) return word.error;
      this.preps.set(who.pid, { word: word.word, cat: word.cat, hint: word.hint }); return;
    }
    if (msg.a === 'ask') {
      if (this.step !== 'ask' || who.slot !== this.riddler?.slot) return;
      const word = validateWord(msg.word, msg.cat, msg.hint);
      if (word.error) return word.error;
      this.round = { ...newRiddle(who, word.word, word.cat, word.hint, now, this.nextId), gaps: { ...this.gaps } };
      this.roundStartedAt = now; this.guessers.clear();
      this.step = 'round'; this.deadline = this.round.endsAt; this.lines = []; this.hurry = false;
      return;
    }
    if (this.round && (this.step === 'round' || this.step === 'check')) {
      let action: RiddleAction;
      switch (msg.a) {
        case 'say': action = { a: 'say', who, text: msg.text, guessers }; break;
        case 'mark': action = { a: 'mark', slot: who.slot, id: msg.id, m: msg.m }; break;
        case 'unmark': action = { a: 'unmark', slot: who.slot, id: msg.id }; break;
        case 'undo': case 'giveup': action = { a: msg.a, slot: who.slot }; break;
        case 'hint': action = { a: 'hint', slot: who.slot, text: msg.text }; break;
        default: return;
      }
      return this.apply(action, now);
    }
    if (msg.a === 'say') {
      const text = sanitizeChat(msg.text).slice(0, QZ.LINE_MAX);
      if (!text) return;
      const wait = this.gapUntil(who.pid) - now;
      if (wait > 0) return { code: 'rate', text: `Не так быстро — через ${Math.ceil(wait / 1000)} с`, wait };
      this.gaps[who.pid] = now + QZ.SAY_GAP_MS;
      this.lines.push({ id: this.nextId++, slot: who.slot, nick: who.nick, text, at: now, kind: 'say', mark: '', markedAt: 0 });
      this.lines = visibleLines(this.lines);
    }
  }

  tick(now: number): 'askTimeout' | 'next' | 'done' | null {
    if (this.step === 'round' || this.step === 'check') this.apply({ a: 'tick' }, now);
    if (this.step === 'ask' && now >= this.deadline) return 'askTimeout';
    if (this.step === 'reveal' && now >= this.deadline) {
      return this.played >= QZ.RIDDLES || (this.startedAt !== null && now - this.startedAt >= QZ.GAME_MS) ? 'done' : 'next';
    }
    return null;
  }

  finish(end: 'left' | 'swap' | 'empty', now: number): boolean {
    if (!this.round || (this.step !== 'round' && this.step !== 'check')) return false;
    this.apply({ a: 'end', end }, now);
    return true;
  }

  takeResult(): RiddleResult | null {
    const r = this.pending; this.pending = null; return r;
  }

  takeHurry(now: number): boolean {
    if (!this.round || this.hurry || (this.step !== 'round' && this.step !== 'check') || now < this.round.endsAt - QZ.HURRY_MS) return false;
    this.hurry = true; return true;
  }

  gapUntil(pid: number): number { return this.gaps[pid] ?? 0; }

  boardFields() { const { lines: _lines, ...riddle } = this.view(); return { riddle }; }
  viewFields() { return { riddle: this.view() }; }
  meFields(slot: number) {
    const i = this.queue.findIndex(p => p.slot === slot), prep = i >= 0 ? this.preps.get(this.queue[i].pid) : null;
    return { queuePos: i + 1, prep: prep ? { ...prep } : null,
      ...(this.roleOf(slot) && this.round ? { word: this.round.word, near: this.near(), hintsLeft: QZ.HINTS - this.round.hints.length } : {}) };
  }
  roleOf(slot: number) { return this.riddler?.slot === slot && ['ask', 'round', 'check'].includes(this.step) ? 'riddler' as const : '' as const; }
  close(): void {}

  near(): number[] { return this.round ? nearLines(this.round) : []; }

  zat(text: string, now: number): void {
    if (this.round && (this.step === 'round' || this.step === 'check')) this.apply({ a: 'zat', text }, now);
    else {
      this.lines.push({ id: this.nextId++, slot: 0, nick: 'Затейник', text, at: now, kind: 'zat', mark: '', markedAt: 0 });
      this.lines = visibleLines(this.lines);
    }
  }

  view(): QzRiddleView {
    const queue = this.queue.map(({ slot, nick }) => ({ slot, nick }));
    if (this.round) {
      const v = riddleView(this.round, this.played + (this.round.result?.counted ? 0 : 1));
      return { ...v, queue, lines: visibleLines([...v.lines, ...this.lines].sort((a, b) => a.id - b.id)) };
    }
    return { step: this.step, num: this.played + 1, of: QZ.RIDDLES,
      riddler: this.riddler ? { slot: this.riddler.slot, nick: this.riddler.nick } : null,
      category: '', hints: [], misses: [], warm: 0, hot: 0, hotText: '', queue, endsAt: 0, total: QZ.ROUND_MS, checking: null,
      last: this.last, lines: this.lines.map(l => ({ ...l })) };
  }

  private apply(action: RiddleAction, now: number): RiddleError | undefined {
    if (!this.round) return;
    const { state, error } = reduceRiddle(this.round, action, now);
    if (state !== this.round) {
      this.round = state; this.step = state.step; this.nextId = state.nextId; this.gaps = state.gaps;
      if (state.result) {
        this.pending = state.result;
        if (state.result.counted) this.played++;
        this.last = riddleView(state).last;
        this.deadline = now + (state.result.end === 'swap' ? QZ.SWAP_REVEAL_MS : QZ.REVEAL_MS);
      }
    }
    return error;
  }
}
