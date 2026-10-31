import { mskDay } from '../shared/economy.ts';
import { checkAnswer } from '../shared/quiz/answer.ts';
import type { QzPack } from '../shared/quiz/types.ts';

export interface ChatQuestion { q: string; answers: string[]; wrong: string[]; comment: string }

/** Текстовые вопросы «Своей игры» за 100–300, без паков 18+ и вопросов только для ведущего. */
export function chatQuestionsFromPacks(packs: ReadonlyArray<{ id: string; pack: QzPack }>): ChatQuestion[] {
  const questions: ChatQuestion[] = [];
  for (const { pack } of packs) {
    if (pack.kind !== 'jeopardy' || pack.adult) continue;
    for (const round of pack.rounds) for (const theme of round.themes) for (const question of theme.questions) {
      if (question.price < 100 || question.price > 300 || !question.answers.length) continue;
      const parts = question.content.filter(c => c.kind === 'text');
      if (parts.length !== question.content.length || !parts.some(c => !c.say)) continue;
      const q = parts.map(c => c.value).join(' ').trim();
      if (!q) continue;
      questions.push({ q, answers: [...question.answers], wrong: [...question.wrong], comment: question.comment });
    }
  }
  return questions;
}

export const CQ_EVERY_MS: readonly [number, number] = [20 * 60_000, 30 * 60_000];
export const CQ_RETRY_MS = 60_000;
export const CQ_ANSWER_MS = 60_000;
export const CQ_REWARD = 10;
export const CQ_DAY_MAX = 50;
export const CQ_MIN_ONLINE = 3;

export interface ChatQuizHost {
  now(): number;
  /** [0, 1) */
  rand(): number;
  /** Все люди в игре, без проверочных клиентов. */
  online(): number[];
  /** У «Ракушки» есть люди или идёт игра. */
  stageBusy(): boolean;
  say(text: string, pids: number[]): void;
  /** false — игрок вышел, жетоны не выданы. */
  pay(pid: number, tokens: number): boolean;
  nick(pid: number): string;
  questions(): ChatQuestion[];
}

interface ActiveQuestion {
  question: ChatQuestion;
  audience: Set<number>;
  endsAt: number;
}

export class ChatQuiz {
  private h: ChatQuizHost;
  private off = new Set<number>();
  private daily = new Map<number, { day: string; total: number }>();
  private current: ActiveQuestion | null = null;
  private lastQuestion: string | null = null;
  private nextAt: number;

  constructor(host: ChatQuizHost) {
    this.h = host;
    this.nextAt = host.now() + this.delay();
  }

  setOn(pid: number, on: boolean): void {
    if (on) this.off.delete(pid); else this.off.add(pid);
  }

  isOn(pid: number): boolean { return !this.off.has(pid); }

  /** Убираем только из текущего вопроса; настройка и дневная награда переживают выход. */
  left(pid: number): void { this.current?.audience.delete(pid); }

  get asking(): boolean { return this.current !== null; }

  step(): void {
    try {
      const now = this.h.now();
      if (this.current) {
        if (now >= this.current.endsAt) this.timeout(now);
        return;
      }
      if (now < this.nextAt) return;
      this.nextAt = now + CQ_RETRY_MS;
      const online = this.h.online();
      if (online.length < CQ_MIN_ONLINE || this.h.stageBusy()) return;
      const audience = online.filter(pid => this.isOn(pid));
      if (!audience.length) return;
      const questions = this.h.questions();
      if (!questions.length) return;
      const different = questions.filter(q => q.q !== this.lastQuestion);
      const pool = different.length ? different : questions;
      const question = pool[Math.floor(this.h.rand() * pool.length)];
      this.current = { question, audience: new Set(audience), endsAt: now + CQ_ANSWER_MS };
      this.lastQuestion = question.q;
      this.h.say(`🎤 Затейник: ${question.q} — ответь в чат за 60 с, первому +10 🪙`, audience);
    } catch { /* Ошибка викторины не должна прерывать игровой тик. */ }
  }

  onChat(pid: number, text: string): boolean {
    let paid = false;
    try {
      const current = this.current;
      if (!current) return false;
      const now = this.h.now();
      if (now >= current.endsAt) {
        this.timeout(now);
        return false;
      }
      if (!current.audience.has(pid) || !this.isOn(pid)) return false;
      const guess = text.slice(0, 200);
      const { answers, wrong, comment } = current.question;
      if (wrong.some(a => checkAnswer(guess, a) === 'yes') || !answers.some(a => checkAnswer(guess, a) === 'yes')) return false;
      const day = mskDay(now);
      const previous = this.daily.get(pid);
      const total = previous?.day === day ? previous.total : 0;
      if (total >= CQ_DAY_MAX) {
        this.h.say('🎤 Затейник: на сегодня награды за вопросы выданы (50 🪙) — отдохни, дай другим', [pid]);
        return false;
      }
      if (!this.h.pay(pid, CQ_REWARD)) return false;
      paid = true;
      this.daily.set(pid, { day, total: total + CQ_REWARD });
      // Закрываем до остальных вызовов host: ошибка сообщения не должна дать вторую награду.
      this.close(now);
      const reply = `🎤 Затейник: верно, ${this.h.nick(pid)}! ${answers[0]}${comment ? ` — ${comment}` : ''}`;
      const reward = ' — +10 🪙';
      this.h.say(reply.slice(0, 160 - reward.length) + reward, this.audience(current));
    } catch { /* Уже успешная выплата остаётся успешной, даже если объявить её не получилось. */ }
    return paid;
  }

  private delay(): number {
    return CQ_EVERY_MS[0] + this.h.rand() * (CQ_EVERY_MS[1] - CQ_EVERY_MS[0]);
  }

  private audience(current: ActiveQuestion): number[] {
    return [...current.audience].filter(pid => this.isOn(pid));
  }

  private close(now: number): void {
    this.current = null;
    // При сбое rand всё равно выдерживаем минимальный интервал после закрытия.
    this.nextAt = now + CQ_EVERY_MS[0];
    try { this.nextAt = now + this.delay(); } catch { /* Игра важнее расписания викторины. */ }
  }

  private timeout(now: number): void {
    const current = this.current!;
    this.close(now);
    this.h.say(`🎤 Затейник: время вышло — ответ: ${current.question.answers[0]}`, this.audience(current));
  }
}
