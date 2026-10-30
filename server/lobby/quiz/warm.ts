import { sanitizeChat } from '../../../shared/text.ts';
import { checkAnswer } from '../../../shared/quiz/answer.ts';
import type { RiddleWho } from '../../../shared/quiz/riddle.ts';
import { QZ, QZ_WARM, type QzWarmBoard } from '../../../shared/quiz/types.ts';
import type { ModeError, ModeHost } from './controller.ts';
import { zatLine, ZAT_WARM_CORRECT } from './zat-lines.ts';

interface WarmQuestion { theme: string; q: string; answers: string[] }
type WarmHost = Pick<ModeHost, 'packs' | 'rand' | 'say'> & { toast(slot: number, text: string): void };

/** Соло-вопросы вне игры: нет наград, статистики, мест и счёта вечера. */
export class WarmGame {
  who: RiddleWho;
  private h: WarmHost;
  private questions: WarmQuestion[] = [];
  private remaining: WarmQuestion[] = [];
  private current: WarmQuestion | null = null;
  private state: QzWarmBoard | null = null;
  private gap = 0;

  constructor(h: WarmHost, who: RiddleWho, now: number) {
    this.h = h; this.who = { ...who };
    const seen = new Set<string>();
    for (const p of h.packs('jeopardy')) if (p.id.startsWith('b-')) {
      for (const round of p.pack.rounds) if (!round.final) for (const theme of round.themes) for (const question of theme.questions) {
        if ([...question.content, ...question.reveal].some(c => c.kind !== 'text')) continue;
        const q = question.content.map(c => c.kind === 'text' ? c.value : '').join(' ').trim();
        const answers = question.answers.filter(a => a.trim());
        if (!q || q.length > QZ_WARM.Q_MAX || !answers.length || seen.has(q)) continue;
        seen.add(q); this.questions.push({ theme: theme.name, q, answers: [...answers] });
      }
    }
    this.next(now);
    if (this.state) h.say('Разминка! Отвечай в чат «В игру»', 'announce', now);
  }

  board(): QzWarmBoard | null {
    return this.state ? { ...this.state, who: { slot: this.who.slot, nick: this.who.nick }, last: this.state.last ? { ...this.state.last } : null } : null;
  }

  gapUntil(pid: number): number { return pid === this.who.pid ? this.gap : 0; }

  say(who: RiddleWho, raw: string, now: number): ModeError | undefined {
    if (who.pid !== this.who.pid || this.state?.step !== 'q' || !this.current) return;
    const text = sanitizeChat(raw).slice(0, QZ.LINE_MAX);
    if (!text) return;
    const wait = this.gap - now;
    if (wait > 0) return { code: 'rate', text: `Не так быстро — через ${Math.ceil(wait / 1000)} с`, wait };
    this.gap = now + QZ.SAY_GAP_MS;
    const matches = this.current.answers.map(a => checkAnswer(text, a));
    if (matches.includes('yes')) this.reveal(true, now);
    else if (matches.includes('near')) this.h.toast(who.slot, 'Почти!');
  }

  tick(now: number): void {
    if (!this.state || now < this.state.endsAt) return;
    if (this.state.step === 'q') this.reveal(false, now); else this.next(now);
  }

  private reveal(ok: boolean, now: number): void {
    if (!this.state || !this.current) return;
    this.state = { ...this.state, step: 'reveal', ok: this.state.ok + Number(ok), endsAt: now + QZ_WARM.REVEAL_MS,
      total: QZ_WARM.REVEAL_MS, last: { answer: this.current.answers[0], ok } };
    if (ok) this.h.say(zatLine(ZAT_WARM_CORRECT, () => this.h.rand()), 'clap', now);
  }

  private next(now: number): void {
    if (!this.questions.length) return;
    if (!this.remaining.length) this.remaining = [...this.questions];
    const i = Math.min(this.remaining.length - 1, Math.max(0, Math.floor(this.h.rand() * this.remaining.length)));
    this.current = this.remaining.splice(i, 1)[0];
    this.state = { who: { slot: this.who.slot, nick: this.who.nick }, step: 'q', num: (this.state?.num ?? 0) + 1,
      ok: this.state?.ok ?? 0, theme: this.current.theme, q: this.current.q, endsAt: now + QZ_WARM.Q_MS,
      total: QZ_WARM.Q_MS, last: this.state?.last ?? null };
  }
}
