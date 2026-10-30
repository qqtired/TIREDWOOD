import { arcDay } from '../../../shared/arcade/rewards.ts';
import { QZ_TOKENS as TOK, type QzMyRecs, type QzTopRecs, type QzWho } from '../../../shared/quiz/types.ts';

export interface QuizStats {
  qzDay: number; qzDayCoins: number; qzJpGames: number; qzJpWins: number; qzJpBest: number;
  qzRdSolved: number; qzRdMade: number; qzCrGuessed: number; qzCrDrawn: number; qzWhoTitles: number;
}
export const emptyQuizStats = (): QuizStats => ({ qzDay: 0, qzDayCoins: 0, qzJpGames: 0, qzJpWins: 0, qzJpBest: 0,
  qzRdSolved: 0, qzRdMade: 0, qzCrGuessed: 0, qzCrDrawn: 0, qzWhoTitles: 0 });
/** Самостоятельная нормализация до подключения полей в Stats/emptyStats. Чужие поля не меняет. */
export function normalizeQuizStats(raw: unknown): QuizStats {
  const out = emptyQuizStats(), data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  for (const k of Object.keys(out) as Array<keyof QuizStats>) {
    const n = data[k]; if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[k] = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n));
  }
  out.qzDayCoins = Math.min(TOK.DAY_CAP, out.qzDayCoins); return out;
}
export interface QuizAward { pid: number; n: number; gameCoins: number; capped: boolean; stats: QuizStats }
export interface QuizStanding { pid: number; score: number }
export type QuizRewardEvent =
  | { kind: 'riddle'; id: string; riddler: number; solver: number; duration: number; guessers: number[]; solved: boolean }
  | { kind: 'jeopardy'; id: string; players: QuizStanding[]; host: number | null; completed: boolean }
  | { kind: 'crocTurn'; id: string; drawer: number; guessed: number[]; counted: boolean }
  | { kind: 'croc'; id: string; players: QuizStanding[]; completed: boolean }
  | { kind: 'whoofus'; id: string; players: QuizStanding[]; titles: number[]; completed: boolean };

/** Равный счёт — равное место (1, 1, 3). Профиль встречается один раз. */
export function quizPlaces(players: readonly QuizStanding[]): Array<QuizStanding & { place: number }> {
  const sorted = players.filter((p, i) => players.findIndex(w => w.pid === p.pid) === i).map(p => ({ ...p })).sort((a, b) => b.score - a.score);
  return sorted.map((p, i) => ({ ...p, place: sorted.findIndex(w => w.score === p.score) + 1 }));
}

/** Только расчёт: хранит копии статистики, никогда не пишет профиль и не вызывает credit. */
export class QuizTokens {
  private accounts = new Map<number, QuizStats>();
  private actions = new Map<number, number>();
  private pairs = new Map<string, number[]>();
  private events = new Set<string>();
  private coins = new Map<number, number>();
  private nextMinute = 0;
  private running = false;
  constructor(profiles: Iterable<{ pid: number; stats: unknown }> = []) {
    for (const p of profiles) this.accounts.set(p.pid, normalizeQuizStats(p.stats));
  }
  /** Профиль мог впервые войти уже после создания сцены. Существующий счёт не перетираем. */
  load(pid: number, stats: unknown): void { if (!this.accounts.has(pid)) this.accounts.set(pid, normalizeQuizStats(stats)); }
  startGame(now: number): void {
    this.actions.clear(); this.events.clear(); this.coins.clear(); this.nextMinute = now + 60_000; this.running = true;
  }
  endGame(): void { this.running = false; }
  action(pid: number, now: number): void { if (this.running && Number.isSafeInteger(pid) && pid > 0) this.actions.set(pid, now); }
  stats(pid: number, now: number): QuizStats {
    const s = this.account(pid);
    if (s.qzDay !== arcDay(now)) { s.qzDay = arcDay(now); s.qzDayCoins = 0; }
    return { ...s };
  }
  gameCoins(pid: number): number { return this.coins.get(pid) ?? 0; }
  private account(pid: number): QuizStats {
    let s = this.accounts.get(pid); if (!s) { s = emptyQuizStats(); this.accounts.set(pid, s); } return s;
  }
  private award(pid: number, n: number, now: number): QuizAward {
    this.stats(pid, now);
    const s = this.account(pid), got = Math.max(0, Math.min(n, TOK.DAY_CAP - s.qzDayCoins));
    s.qzDayCoins += got; this.coins.set(pid, this.gameCoins(pid) + got);
    return { pid, n: got, gameCoins: this.gameCoins(pid), capped: s.qzDayCoins >= TOK.DAY_CAP, stats: { ...s } };
  }
  /** Вызывать в game. Пропущенные тики не превращаются в выплаты за неизвестную прошлую активность. */
  minute(inside: readonly number[], now: number): QuizAward[] {
    if (!this.running || now < this.nextMinute) return [];
    this.nextMinute += (Math.floor((now - this.nextMinute) / 60_000) + 1) * 60_000;
    const people = [...new Set(inside)].filter(pid => pid > 0);
    if (people.length < TOK.MIN_PEOPLE) return [];
    return people.filter(pid => { const t = this.actions.get(pid); return t !== undefined && t <= now && now - t <= TOK.ACTIVE_MS; })
      .map(pid => this.award(pid, TOK.PER_MIN, now));
  }
  /** id — стабильный номер результата/рисунка в текущей игре, чтобы повтор тика не удвоил награду и рекорды. */
  event(e: QuizRewardEvent, inside: readonly number[], now: number): QuizAward[] {
    const key = `${e.kind}:${e.id}`;
    if (!this.running || this.events.has(key)) return [];
    this.events.add(key);
    const enough = new Set(inside.filter(pid => pid > 0)).size >= TOK.MIN_PEOPLE, amounts = new Map<number, number>();
    const add = (pid: number, n: number) => { if (pid > 0) amounts.set(pid, (amounts.get(pid) ?? 0) + n); };
    if (e.kind === 'riddle' && e.solved && e.riddler !== e.solver && e.riddler > 0 && e.solver > 0) {
      this.account(e.riddler).qzRdMade++; this.account(e.solver).qzRdSolved++;
      // Направленная пара: «загадал–угадал», скользящий час в памяти сервера.
      for (const [pair, ts] of this.pairs) { const fresh = ts.filter(t => now - t < 3600_000); if (fresh.length) this.pairs.set(pair, fresh); else this.pairs.delete(pair); }
      const pair = `${e.riddler}:${e.solver}`, times = this.pairs.get(pair) ?? [];
      if (enough && e.duration >= TOK.RD_MIN_MS && new Set(e.guessers.filter(pid => pid > 0 && pid !== e.riddler)).size >= TOK.RD_MIN_GUESSERS && times.length < TOK.RD_PAIR_HOUR) {
        add(e.riddler, TOK.RD_RIDDLER); add(e.solver, TOK.RD_SOLVER); this.pairs.set(pair, [...times, now]);
      }
    } else if (e.kind === 'jeopardy' && e.completed) {
      const ranked = quizPlaces(e.players);
      for (const p of ranked) {
        const s = this.account(p.pid); s.qzJpGames++; if (p.place === 1) s.qzJpWins++; s.qzJpBest = Math.max(s.qzJpBest, p.score);
        if (ranked.length >= TOK.JP_PLACES_MIN) add(p.pid, TOK.JP_PLACES[p.place - 1] ?? 0);
      }
      if (e.host) add(e.host, TOK.JP_HOST);
    } else if (e.kind === 'crocTurn' && e.counted) {
      const guessed = [...new Set(e.guessed)].filter(pid => pid !== e.drawer && pid > 0);
      for (const pid of guessed) this.account(pid).qzCrGuessed++;
      if (guessed.length) this.account(e.drawer).qzCrDrawn++;
    } else if (e.kind === 'croc' && e.completed) {
      for (const p of quizPlaces(e.players)) add(p.pid, TOK.CR_PLACES[p.place - 1] ?? 0);
    } else if (e.kind === 'whoofus') {
      for (const pid of e.titles) this.account(pid).qzWhoTitles++;
      const ranked = quizPlaces(e.players);
      if (e.completed && ranked.length >= TOK.WHO_BEST_MIN) for (const p of ranked) if (p.place === 1) add(p.pid, TOK.WHO_BEST);
    }
    if (!enough) return [];
    return [...amounts].filter(([, n]) => n > 0).map(([pid, n]) => this.award(pid, n, now));
  }
}
export function quizMyRecords(stats: unknown, now: number): QzMyRecs {
  const s = normalizeQuizStats(stats);
  return { jpGames: s.qzJpGames, jpWins: s.qzJpWins, jpBest: s.qzJpBest, rdSolved: s.qzRdSolved, rdMade: s.qzRdMade,
    crGuessed: s.qzCrGuessed, crDrawn: s.qzCrDrawn, whoTitles: s.qzWhoTitles, dayCoins: s.qzDay === arcDay(now) ? s.qzDayCoins : 0 };
}
export function quizTopRecords(profiles: ReadonlyArray<QzWho & { stats: unknown }>): QzTopRecs {
  const top = (key: keyof QuizStats) => profiles.map(p => ({ slot: p.slot, nick: p.nick, pts: normalizeQuizStats(p.stats)[key] }))
    .filter(p => p.pts > 0).sort((a, b) => b.pts - a.pts || a.nick.localeCompare(b.nick)).slice(0, 5);
  return { jpWins: top('qzJpWins'), rdSolved: top('qzRdSolved'), crGuessed: top('qzCrGuessed'), whoTitles: top('qzWhoTitles') };
}
