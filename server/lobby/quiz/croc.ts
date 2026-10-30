import { newCroc, reduceCroc, crocBoard, crocView, crocMe, crocInk, type CrocState, type CrocAction } from '../../../shared/quiz/croc.ts';
import type { QuizClientMsg } from '../../../shared/quiz/net.ts';
import type { RiddleWho } from '../../../shared/quiz/riddle.ts';
import { QZ, QZ_CROC as CR, type QzCall } from '../../../shared/quiz/types.ts';
import { QUIZ_VENUE as V } from '../../../shared/quiz/venue.ts';
import { publicWho, type ModeHost, type ModeResult, type ModeError, type QuizController } from './controller.ts';
import type { QuizRewardEvent } from './tokens.ts';

export class CrocGame implements QuizController {
  readonly mode = 'croc';
  phase: 'roles' | 'game' | 'idle' = 'roles';
  accepted = false;
  outcome: ModeResult | null = null;
  private h: ModeHost;
  private state: CrocState;
  private held: RiddleWho | null = null;
  private actors = new Map<number, RiddleWho>();
  private events: QuizRewardEvent[] = [];
  private presenceKey = '';
  private hurryDrawing = -1;
  private packs: string[];
  /** voters — pid голосовавших за «Крокодил» по времени голоса: сразу очередь рисующих (A2, «Ракушка» 1.1) */
  constructor(h: ModeHost, now: number, nextId: number, voters: number[] = []) {
    this.h = h;
    const packs = h.packs('words').filter(p => !p.pack.adult); this.packs = packs.map(p => p.id);
    for (const id of this.packs) h.store?.setPlaying(id, true);
    const people = this.people(), queue = voters.flatMap(pid => people.filter(p => p.pid === pid));
    this.state = newCroc(people, packs.map(p => p.pack), now, queue); this.state.nextId = nextId;
    h.say('Кто рисует? Жмите «Хочу рисовать»!', 'announce', now);
  }
  get nextId(): number { return this.state.nextId; }
  set nextId(n: number) { this.state.nextId = n; }
  get deadline(): number { return this.state.endsAt; }
  get call(): QzCall | null {
    const s = this.state;
    return !s.done && s.step === 'call' ? { role: 'drawer', roles: ['drawer'], taken: s.queue.map(publicWho),
      by: s.assigned ? 'zat' : 'open', to: s.assigned ? publicWho(s.assigned) : null, endsAt: s.endsAt } : null;
  }
  canTake(slot: number): boolean {
    const s = this.state, p = s.people.find(p => p.slot === slot);
    return !!p && !s.done && !s.drew.includes(p.pid) && !s.queue.some(q => q.pid === p.pid) && s.drawer?.pid !== p.pid
      && (!s.assigned || s.assigned.pid === p.pid) && s.drew.length + s.queue.length + Number(s.step === 'words') < CR.TURNS_MAX;
  }
  roleOf(slot: number) { return !this.outcome && this.state.drawer?.slot === slot && ['words', 'draw'].includes(this.state.step) ? 'drawer' as const : '' as const; }
  gapUntil(pid: number): number { return this.state.gaps[pid] ?? 0; }
  boardFields() { return { croc: crocBoard(this.state) }; }
  viewFields(slot: number) { return { croc: crocView(this.state, slot) }; }
  meFields(slot: number) { return { croc: crocMe(this.state, slot) }; }
  fullInk() { return { t: 'qzInk' as const, ...crocInk(this.state) }; }
  rewards(): QuizRewardEvent[] { const es = this.events; this.events = []; return es; }
  private people() { return this.h.people().map(p => ({ ...p, seated: p.chair >= 0 })); }
  presence(now: number): void {
    const people = this.people(), key = JSON.stringify(people.map(p => [p.pid, p.slot, p.nick, p.seated]));
    if (key === this.presenceKey) return;
    this.presenceKey = key; this.apply({ a: 'presence', people }, now);
  }
  tick(now: number): 'done' | null {
    this.apply({ a: 'tick' }, now);
    return this.outcome ? 'done' : null;
  }
  message(who: RiddleWho, msg: QuizClientMsg, _guessers: number, now: number): ModeError | undefined {
    this.accepted = false;
    let action: CrocAction;
    if (msg.a === 'role' && (!msg.r || msg.r === 'drawer')) action = { a: 'role', who, take: msg.take };
    else if (msg.a === 'crWord' || msg.a === 'crInk' || msg.a === 'say') action = { ...msg, slot: who.slot };
    else return;
    const error = this.apply(action, now, true);
    if (this.accepted && (msg.a === 'role' || msg.a === 'say')) this.actors.set(who.pid, { ...who });
    return error;
  }
  stood(slot: number, now: number): boolean {
    if (this.held?.slot === slot) this.apply({ a: 'end', end: 'left' }, now);
    return true;
  }
  stop(now: number, end: 'swap' | 'empty' = 'swap'): void { this.apply({ a: 'end', end }, now); this.close(); }
  close(): void {
    this.restore();
    for (const id of this.packs) this.h.store?.setPlaying(id, false);
    this.packs = [];
  }
  private restore(): void {
    if (this.held && this.h.people().some(p => p.pid === this.held!.pid && p.slot === this.held!.slot)) this.h.release(this.held.slot, V.back);
    this.held = null;
  }
  zat(text: string, now: number): void {
    this.state.lines.push({ id: this.nextId++, slot: 0, nick: 'Затейник', text, at: now, kind: 'zat', mark: '', markedAt: 0 });
    this.state.lines = this.state.lines.slice(-QZ.LINES_KEEP);
  }
  private key(s: CrocState): string {
    const { pool: _pool, strokes: _strokes, ...rest } = s; return JSON.stringify(rest);
  }
  private apply(action: CrocAction, now: number, input = false): ModeError | undefined {
    const old = this.state;
    const { state: s, error, ink } = reduceCroc(old, action, now, this.h.rand);
    this.state = s;
    if (input) this.accepted = (!error || error.code === 'near') && (this.key(old) !== this.key(s) || !!ink);
    if (ink) this.h.ink({ t: 'qzInk', ...ink });
    const drawer = ['words', 'draw'].includes(s.step) && !s.done ? s.drawer : null;
    if (this.held?.pid !== drawer?.pid) {
      this.restore();
      if (drawer) { this.held = { ...drawer }; this.actors.set(drawer.pid, { ...drawer }); this.h.hold(drawer.slot, V.first.drawer); }
    }
    if (drawer) this.phase = 'game';
    if (s.drawer && s.step === 'words' && (old.step !== s.step || old.drawer?.pid !== s.drawer.pid)) this.h.say(`Рисует ${s.drawer.nick}!`, 'point', now);
    if (s.assigned && s.assigned.pid !== old.assigned?.pid) this.h.say(`${s.assigned.nick}, давай ты!`, 'point', now);
    if (s.step === 'call' && old.step !== 'call') this.h.say('Кто рисует? Жмите «Хочу рисовать»!', 'announce', now);
    if (s.step === 'draw' && s.endsAt - now <= 20_000 && this.hurryDrawing !== s.drawing) {
      this.hurryDrawing = s.drawing; this.h.say('Осталось 20 секунд!', 'talk', now);
    }
    for (const turn of s.turns.slice(old.turns.length)) {
      for (const p of [turn.drawer, ...turn.guessed]) this.actors.set(p.pid, { ...p });
      this.events.push({ kind: 'crocTurn', id: String(s.turns.indexOf(turn)), drawer: turn.drawer.pid, guessed: turn.guessed.map(p => p.pid), counted: turn.counted });
      if (turn.end === 'all') this.h.say('Все угадали!', 'cheer', now);
      else if (turn.end === 'timeout') this.h.say(`Это был ${s.last?.word ?? ''}`, 'shrug', now);
      else if (turn.end === 'left') this.h.say(`${turn.drawer.nick} ушёл — рисунок не в счёт`, 'shrug', now);
    }
    if (s.done && !this.outcome) {
      if (this.phase === 'roles') this.phase = 'idle';
      const completed = !s.turns.some(t => t.end === 'swap' || t.end === 'empty') && s.turns.some(t => t.counted);
      const players = [...this.actors.values()].map(p => ({ ...p, pts: s.scores[p.pid] ?? 0 }));
      this.outcome = { players, completed };
      this.events.push({ kind: 'croc', id: 'game', players: players.map(p => ({ pid: p.pid, score: p.pts })), completed });
      this.close();
    }
    return error;
  }
}
