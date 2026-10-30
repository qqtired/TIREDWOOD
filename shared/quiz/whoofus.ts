import { sanitizeChat } from '../text.ts';
import { parseWhoQuestion } from './text.ts';
import { QZ, QZ_WHO as WHO, type QzLine, type QzPack, type QzTitle, type QzWho, type QzWhoBoard, type QzWhoMe, type QzWhoView } from './types.ts';

export interface WhoOfUsPerson extends QzWho { pid: number; seatedAt: number }
interface Question { q: string; title: string; by: WhoOfUsPerson | null }
export interface WhoOfUsState {
  step: QzWhoBoard['step']; seated: WhoOfUsPerson[]; players: WhoOfUsPerson[]; own: Question[];
  asked: Record<number, number>; pool: Question[]; queue: Question[]; current: Question | null;
  votes: Record<number, number>; skips: number[]; scores: Record<number, number>;
  titles: Array<QzTitle & { pid: number }>; tally: QzWhoBoard['tally']; leaders: QzWho[];
  rounds: number; endsAt: number; total: number; lines: QzLine[]; nextId: number; gaps: Record<number, number>;
  done: boolean; result: { scores: Record<number, number>; titles: Array<QzTitle & { pid: number }>; completed: boolean } | null;
}
export type WhoOfUsAction =
  | { a: 'tick' }
  | { a: 'presence'; seated: WhoOfUsPerson[] }
  | { a: 'whoAsk' | 'say'; slot: number; text: string }
  | { a: 'whoVote'; slot: number; target: number }
  | { a: 'whoSkip'; slot: number; on: boolean }
  | { a: 'stop' };
export interface WhoOfUsReply { state: WhoOfUsState; error?: { code: 'word' | 'rate'; text: string; wait?: number } }
const who = (p: QzWho): QzWho => ({ slot: p.slot, nick: p.nick });
const firstSeated = (ps: WhoOfUsPerson[]): WhoOfUsPerson[] => [...ps].sort((a, b) => a.seatedAt - b.seatedAt)
  .filter((p, i, all) => all.findIndex(w => w.pid === p.pid) === i).slice(0, WHO.MAX).map(p => ({ ...p }));
function shuffled<T>(input: readonly T[], rand: () => number): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.min(i, Math.max(0, Math.floor(rand() * (i + 1)))); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function phase(s: WhoOfUsState, step: WhoOfUsState['step'], now: number, ms: number): void { s.step = step; s.endsAt = now + ms; s.total = ms; }
function finish(s: WhoOfUsState, completed: boolean): void {
  s.done = true; s.result = { scores: { ...s.scores }, titles: structuredClone(s.titles), completed };
}
export function newWhoOfUs(seated: WhoOfUsPerson[], packs: readonly QzPack[], now: number): WhoOfUsState {
  const pool: Question[] = [];
  for (const p of packs) if (p.kind === 'whoofus' && !p.adult) for (const q of p.who ?? []) {
    const value = parseWhoQuestion(q.title ? `${q.q} = ${q.title}` : q.q);
    if (value) pool.push({ ...value, by: null });
  }
  const players = firstSeated(seated);
  const s: WhoOfUsState = { step: 'ask', seated: players, players, own: [], asked: {}, pool, queue: [], current: null,
    votes: {}, skips: [], scores: {}, titles: [], tally: null, leaders: [], rounds: 0,
    endsAt: now + WHO.ASK_MS, total: WHO.ASK_MS, lines: [], nextId: 1, gaps: {}, done: false, result: null };
  if (players.length < WHO.MIN) finish(s, false);
  return s;
}
function next(s: WhoOfUsState, now: number, rand: () => number): void {
  s.players = firstSeated(s.seated);
  if (s.players.length < 3) { finish(s, false); return; }
  if (s.rounds >= WHO.ROUNDS) { finish(s, true); return; }
  // При пропусках берём остаток пака, затем новый перемешанный круг. Свои вопросы повторно не добавляются.
  if (!s.queue.length) s.queue = shuffled(s.pool, rand);
  s.current = s.queue.shift() ?? null;
  if (!s.current) { finish(s, false); return; }
  s.votes = {}; s.skips = []; s.tally = null; s.leaders = [];
  phase(s, 'vote', now, WHO.VOTE_MS);
}
function prepare(s: WhoOfUsState, now: number, rand: () => number): void {
  const own = s.own.slice(0, WHO.ROUNDS), pool = shuffled(s.pool, rand);
  const questions = [...own];
  for (let i = 0; questions.length < WHO.ROUNDS && pool.length; i++) questions.push(pool[i % pool.length]);
  s.queue = [...shuffled(questions, rand), ...pool.slice(Math.max(0, WHO.ROUNDS - own.length))];
  next(s, now, rand);
}
function reveal(s: WhoOfUsState, now: number): void {
  s.tally = s.players.map(p => ({ ...who(p), n: Object.values(s.votes).filter(pid => pid === p.pid).length }));
  const max = Math.max(0, ...s.tally.map(p => p.n));
  s.leaders = s.tally.filter(p => max > 0 && p.n === max).map(who);
  const winners = s.players.filter(p => s.leaders.some(w => w.slot === p.slot));
  for (const p of winners) s.titles.push({ ...who(p), pid: p.pid, title: s.current!.title });
  for (const [pid, voted] of Object.entries(s.votes)) if (winners.some(p => p.pid === voted)) s.scores[Number(pid)] = (s.scores[Number(pid)] ?? 0) + WHO.PTS;
  s.rounds++; phase(s, 'reveal', now, WHO.REVEAL_MS);
}
function closing(s: WhoOfUsState, now: number): void {
  if (s.players.length && s.players.every(p => s.votes[p.pid] !== undefined)) s.endsAt = Math.min(s.endsAt, now + WHO.VOTE_ALL_MS);
}
export function reduceWhoOfUs(before: WhoOfUsState, a: WhoOfUsAction, now: number, rand: () => number): WhoOfUsReply {
  if (before.done) return { state: before };
  const s = structuredClone(before);
  if (now >= s.endsAt) {
    if (s.step === 'ask') prepare(s, now, rand);
    else if (s.step === 'vote') reveal(s, now);
    else next(s, now, rand);
  }
  const reply = (error?: WhoOfUsReply['error']): WhoOfUsReply => ({ state: s, ...(error ? { error } : {}) });
  if (s.done || a.a === 'tick') return reply();
  if (a.a === 'stop') { finish(s, false); return reply(); }
  if (a.a === 'presence') {
    s.seated = firstSeated(a.seated);
    s.players = s.players.filter(p => s.seated.some(w => w.pid === p.pid));
    if (s.step === 'ask') s.players = firstSeated(s.seated);
    const pids = s.players.map(p => p.pid);
    for (const key of Object.keys(s.votes)) if (!pids.includes(Number(key)) || !pids.includes(s.votes[Number(key)])) delete s.votes[Number(key)];
    s.skips = s.skips.filter(pid => pids.includes(pid));
    if (s.players.length < 3) finish(s, false);
    else if (s.step === 'vote') {
      if (s.skips.length >= Math.floor(s.players.length / 2) + 1) next(s, now, rand); else closing(s, now);
    }
    return reply();
  }
  const p = s.players.find(p => p.slot === a.slot); if (!p) return reply();
  if (a.a === 'whoAsk' && s.step === 'ask' && (s.asked[p.pid] ?? 0) < WHO.OWN_MAX) {
    const q = parseWhoQuestion(a.text);
    if (!q) return reply({ code: 'word', text: 'Вопрос — до 120 знаков, титул — до 30.' });
    s.own.push({ ...q, by: { ...p } }); s.asked[p.pid] = (s.asked[p.pid] ?? 0) + 1;
  } else if (a.a === 'whoVote' && s.step === 'vote') {
    const target = s.players.find(p => p.slot === a.target);
    if (target && target.pid !== p.pid) { s.votes[p.pid] = target.pid; closing(s, now); }
  } else if (a.a === 'whoSkip' && s.step === 'vote') {
    s.skips = s.skips.filter(pid => pid !== p.pid);
    if (a.on) s.skips.push(p.pid);
    if (s.skips.length >= Math.floor(s.players.length / 2) + 1) next(s, now, rand);
  } else if (a.a === 'say') {
    const text = sanitizeChat(a.text).slice(0, QZ.LINE_MAX), wait = (s.gaps[p.pid] ?? 0) - now;
    if (wait > 0) return reply({ code: 'rate', text: `Не так быстро — через ${Math.ceil(wait / 1000)} с`, wait });
    if (text) {
      s.gaps[p.pid] = now + QZ.SAY_GAP_MS;
      s.lines.push({ id: s.nextId++, ...who(p), text, kind: 'say', at: now, mark: '', markedAt: 0 }); s.lines = s.lines.slice(-QZ.LINES_KEEP);
    }
  }
  return reply();
}
export function whoOfUsBoard(s: WhoOfUsState): QzWhoBoard {
  return { step: s.step, num: s.step === 'reveal' ? s.rounds : s.rounds + 1, of: WHO.ROUNDS, players: s.players.map(who),
    q: s.current?.q ?? '', title: s.current?.title ?? '', by: s.current?.by ? who(s.current.by) : null, asked: s.own.length,
    voted: Object.keys(s.votes).length, skip: { n: s.skips.length, need: Math.floor(s.players.length / 2) + 1 },
    tally: s.step === 'reveal' ? structuredClone(s.tally) : null, leaders: s.step === 'reveal' ? s.leaders.map(who) : [], endsAt: s.endsAt, total: s.total };
}
export function whoOfUsView(s: WhoOfUsState): QzWhoView { return { ...whoOfUsBoard(s), lines: structuredClone(s.lines) }; }
export function whoOfUsMe(s: WhoOfUsState, slot: number): QzWhoMe {
  const p = s.players.find(p => p.slot === slot);
  return { in: !!p, vote: p ? s.players.find(w => w.pid === s.votes[p.pid])?.slot ?? 0 : 0,
    skip: !!p && s.skips.includes(p.pid), own: p ? s.asked[p.pid] ?? 0 : 0, pts: p ? s.scores[p.pid] ?? 0 : 0 };
}
