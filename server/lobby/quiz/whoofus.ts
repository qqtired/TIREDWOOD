import { newWhoOfUs, reduceWhoOfUs, whoOfUsBoard, whoOfUsView, whoOfUsMe, type WhoOfUsState, type WhoOfUsAction } from '../../../shared/quiz/whoofus.ts';
import { sanitizeChat } from '../../../shared/text.ts';
import type { QuizClientMsg } from '../../../shared/quiz/net.ts';
import type { RiddleWho } from '../../../shared/quiz/riddle.ts';
import { QZ, QZ_WHO as WHO } from '../../../shared/quiz/types.ts';
import type { ModeHost, ModeResult, ModeError, QuizController } from './controller.ts';
import type { QuizRewardEvent } from './tokens.ts';

export class WhoOfUsGame implements QuizController {
  readonly mode = 'whoofus';
  phase: 'roles' | 'game' | 'idle' = 'roles';
  accepted = false;
  nextId: number;
  deadline: number;
  readonly call = null;
  outcome: ModeResult | null = null;
  private h: ModeHost;
  private state: WhoOfUsState | null = null;
  private actors = new Map<number, RiddleWho>();
  private events: QuizRewardEvent[] = [];
  private presenceKey = '';
  private packs: string[] = [];
  constructor(h: ModeHost, now: number, nextId: number) {
    this.h = h; this.nextId = nextId; this.deadline = now + QZ.CALL_MS;
    h.say('Садитесь — играют сидящие', 'announce', now);
  }
  private seated() { return this.h.people().filter(p => p.chair >= 0).sort((a, b) => a.seatedAt - b.seatedAt).slice(0, WHO.MAX); }
  roleOf(slot: number) { return this.state?.players.some(p => p.slot === slot) ? 'player' as const : '' as const; }
  gapUntil(pid: number): number { return this.state?.gaps[pid] ?? 0; }
  boardFields() { return { who: this.state ? whoOfUsBoard(this.state) : null }; }
  viewFields() { return { who: this.state ? whoOfUsView(this.state) : null }; }
  meFields(slot: number) { return this.state ? { who: whoOfUsMe(this.state, slot) } : {}; }
  titles(pid: number): string[] { return this.state?.titles.filter(t => t.pid === pid).map(t => t.title) ?? []; }
  rewards(): QuizRewardEvent[] { const es = this.events; this.events = []; return es; }
  presence(now: number): void {
    const seated = this.seated(), key = JSON.stringify(seated.map(p => [p.pid, p.slot, p.nick, p.seatedAt]));
    if (key === this.presenceKey) return;
    this.presenceKey = key;
    if (this.state) this.apply({ a: 'presence', seated }, now);
  }
  tick(now: number): 'done' | null {
    if (this.state) this.apply({ a: 'tick' }, now);
    else if (now >= this.deadline && this.phase === 'roles') {
      const seated = this.seated();
      if (seated.length < WHO.MIN) { this.phase = 'idle'; this.h.say('Мало игроков', 'shrug', now); return null; }
      const packs = this.h.packs('whoofus').filter(p => !p.pack.adult); this.packs = packs.map(p => p.id);
      for (const id of this.packs) this.h.store?.setPlaying(id, true);
      this.state = newWhoOfUs(seated, packs.map(p => p.pack), now); this.state.nextId = this.nextId;
      this.phase = 'game'; this.remember(); this.h.say('Пишите свои вопросы — 30 секунд!', 'announce', now);
    }
    return this.outcome ? 'done' : null;
  }
  message(who: RiddleWho, msg: QuizClientMsg, _guessers: number, now: number): ModeError | undefined {
    this.accepted = false;
    if (!this.state || this.outcome) return;
    // Зрители тоже пишут «В игру», но в голосовании и своих вопросах не участвуют.
    if (msg.a === 'say' && !this.state.players.some(p => p.slot === who.slot)) {
      const text = sanitizeChat(msg.text), wait = this.gapUntil(who.pid) - now;
      if (wait > 0) return { code: 'rate', text: `Не так быстро — через ${Math.ceil(wait / 1000)} с`, wait };
      if (!text) return;
      this.state.gaps[who.pid] = now + QZ.SAY_GAP_MS;
      this.state.lines.push({ id: this.nextId++, slot: who.slot, nick: who.nick, text, at: now, kind: 'say', mark: '', markedAt: 0 });
      this.state.nextId = this.nextId; this.state.lines = this.state.lines.slice(-QZ.LINES_KEEP); this.accepted = true; return;
    }
    let action: WhoOfUsAction;
    if (msg.a === 'whoVote') action = { a: 'whoVote', slot: who.slot, target: msg.slot };
    else if (msg.a === 'whoAsk' || msg.a === 'whoSkip' || msg.a === 'say') action = { ...msg, slot: who.slot };
    else return;
    return this.apply(action, now, true);
  }
  stop(now: number): void { if (this.state) this.apply({ a: 'stop' }, now); }
  close(): void {
    for (const id of this.packs) this.h.store?.setPlaying(id, false);
    this.packs = [];
  }
  zat(text: string, now: number): void {
    if (!this.state) return;
    this.state.lines.push({ id: this.state.nextId++, slot: 0, nick: 'Затейник', text, at: now, kind: 'zat', mark: '', markedAt: 0 });
    this.state.lines = this.state.lines.slice(-QZ.LINES_KEEP); this.nextId = this.state.nextId;
  }
  private remember(): void { for (const p of this.state?.players ?? []) this.actors.set(p.pid, { ...p }); }
  private apply(action: WhoOfUsAction, now: number, input = false): ModeError | undefined {
    const old = this.state!, { state: s, error } = reduceWhoOfUs(old, action, now, this.h.rand);
    this.state = s; this.nextId = s.nextId; this.deadline = s.endsAt; this.remember();
    if (input) this.accepted = !error && JSON.stringify(old) !== JSON.stringify(s);
    if (s.step === 'vote' && (old.step !== 'vote' || s.current !== old.current && JSON.stringify(s.current) !== JSON.stringify(old.current))) {
      if (old.step === 'vote') this.h.say('Пропускаем вопрос', 'shrug', now);
      this.h.say(`Вопрос ${s.rounds + 1}!`, 'talk', now);
      this.h.say('Голосуем — клик по желейке!', 'point', now);
    }
    if (s.step === 'reveal' && old.step !== 'reveal' && s.leaders.length) this.h.say(`Титул — ${s.leaders.map(p => p.nick).join(', ')}!`, 'cheer', now);
    if (s.done && !this.outcome) {
      const r = s.result!, players = [...this.actors.values()].map(p => ({ ...p, pts: r.scores[p.pid] ?? 0 }));
      this.outcome = { players, completed: r.completed, titles: r.titles.map(({ pid: _pid, ...t }) => t) };
      this.events.push({ kind: 'whoofus', id: 'game', players: players.map(p => ({ pid: p.pid, score: p.pts })), titles: r.titles.map(t => t.pid), completed: r.completed });
      this.close();
    }
    return error;
  }
}
