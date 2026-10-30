import { sanitizeChat } from '../text.ts';
import { checkAnswer } from './answer.ts';
import type { QzErrCode } from './net.ts';
import { QZ, QZ_JP as JP, type QzJpBoard, type QzJpMe, type QzJpPlayer, type QzJpView, type QzLine,
  type QzOrder, type QzPack, type QzQuestion, type QzRound, type QzWho } from './types.ts';

export interface JeopardyWho extends QzWho { pid: number }
export interface JeopardyError { code: QzErrCode; text: string; wait?: number }
export interface JeopardyRoles {
  step: 'roles' | 'setup' | 'packvote' | 'idle'; host: JeopardyWho | null;
  taken: JeopardyWho[]; players: JeopardyWho[]; voters: number[]; attempt: number; endsAt: number;
}
export function newJeopardyRoles(now: number, voters: number[] = []): JeopardyRoles {
  return { step: 'roles', host: null, taken: [], players: [], voters: [...voters], attempt: 1, endsAt: now + JP.CALL_MS };
}
export function reduceJeopardyRoles(before: JeopardyRoles, a: { a: 'tick' } | { a: 'left'; pid: number }
  | { a: 'role'; who: JeopardyWho; r: 'host' | 'player'; take: boolean }, now: number): JeopardyRoles {
  if (before.step !== 'roles') return before;
  const s = structuredClone(before);
  if (now >= s.endsAt) {
    s.players = [...s.taken.filter(p => s.voters.includes(p.pid)), ...s.taken.filter(p => !s.voters.includes(p.pid))].slice(0, JP.PLAYERS_MAX);
    if (s.players.length >= JP.PLAYERS_MIN) s.step = s.host ? 'setup' : 'packvote';
    else if (s.attempt === 1) { s.attempt++; s.endsAt = now + JP.CALL_MS; }
    else s.step = 'idle';
    return s;
  }
  if (a.a === 'left') { if (s.host?.pid === a.pid) s.host = null; s.taken = s.taken.filter(p => p.pid !== a.pid); }
  else if (a.a === 'role') {
    if (a.r === 'host') {
      if (a.take && !s.host) { s.host = { ...a.who }; s.taken = s.taken.filter(p => p.pid !== a.who.pid); }
      else if (!a.take && s.host?.pid === a.who.pid) s.host = null;
    } else if (!a.take) s.taken = s.taken.filter(p => p.pid !== a.who.pid);
    else if (s.host?.pid !== a.who.pid && !s.taken.some(p => p.pid === a.who.pid)) s.taken.push({ ...a.who });
  }
  return s;
}

export interface JeopardyPack { id: string; pack: QzPack; plays?: number; fresh?: boolean; at?: number }
interface Player extends QzJpPlayer { pid: number }
interface FinalPlayer extends JeopardyWho { score: number; bet: number; text: string; answered: boolean; ok: boolean | null }
interface Final {
  round: QzRound; remaining: number[]; order: FinalPlayer[]; removeIndex: number; question: QzQuestion | null;
  theme: string; shown: number;
}
export interface JeopardyState {
  step: QzJpBoard['step']; host: JeopardyWho | null; players: Player[]; people: JeopardyWho[];
  pool: JeopardyPack[]; options: JeopardyPack[]; votes: Record<number, number>; pack: JeopardyPack | null;
  order: QzOrder | null;
  round: QzRound | null; final: boolean; fin: Final | null; used: string[]; turn: number;
  current: { th: number; cell: number; question: QzQuestion; theme: string } | null;
  openAt: number; buzz: number; buzzes: Array<{ slot: number; t: number; arrived: number }>;
  buzzUntil: number; locks: Record<number, number>; out: number[]; said: string; verdict: '' | 'yes' | 'no';
  penalty: number; disputeVotes: Record<number, boolean>; more: number; showAt: number;
  endsAt: number; total: number; fewAt: number | null; asks: Array<JeopardyWho & { pult: number }>;
  lines: QzLine[]; nextId: number; gaps: Record<number, number>; played: boolean; endRound: boolean;
  done: boolean; result: { players: Player[]; host: JeopardyWho | null; completed: boolean } | null;
}
export type JeopardyAction =
  | { a: 'tick' }
  | { a: 'presence'; people: JeopardyWho[] }
  | { a: 'away'; slot: number }
  | { a: 'seat'; who: JeopardyWho; pult: number }
  | { a: 'host'; who: JeopardyWho }
  | { a: 'stop' }
  | { a: 'jpStart'; slot: number; pack: string; round: number; themes: number[]; final: boolean }
  | { a: 'jpZat' | 'jpOpen' | 'jpMore' | 'jpShow' | 'jpEnd' | 'jpDispute'; slot: number }
  | { a: 'jpPv'; slot: number; i: number }
  | { a: 'jpPick'; slot: number; th: number; cell: number }
  | { a: 'jpGive' | 'jpSeat' | 'jpFjudge'; slot: number; target: number; ok?: boolean }
  | { a: 'jpBuzz'; slot: number; ping: number }
  | { a: 'jpAns' | 'jpFans' | 'say'; slot: number; text: string }
  | { a: 'jpJudge' | 'jpDv'; slot: number; ok: boolean }
  | { a: 'jpDrop'; slot: number; th: number }
  | { a: 'jpBet'; slot: number; n: number };
export interface JeopardyReply { state: JeopardyState; error?: JeopardyError }
const who = (p: QzWho): QzWho => ({ slot: p.slot, nick: p.nick });
const index = (n: number, rand: () => number): number => Math.min(n - 1, Math.max(0, Math.floor(rand() * n)));
const active = (s: JeopardyState): Player[] => s.players.filter(p => !p.away);
const eligible = (s: JeopardyState): Player[] => active(s).filter(p => !s.out.includes(p.slot));
const player = (s: JeopardyState, slot: number): Player | undefined => s.players.find(p => p.slot === slot);
function phase(s: JeopardyState, step: JeopardyState['step'], now: number, ms: number): void { s.step = step; s.endsAt = now + ms; s.total = ms; }
function finish(s: JeopardyState, completed = true): void {
  s.done = true; s.result = { players: s.players.map(p => ({ ...p })).sort((a, b) => b.score - a.score), host: s.host && { ...s.host }, completed };
}
function packOptions(pool: JeopardyPack[], rand: () => number, order: QzOrder | null): JeopardyPack[] {
  const left = pool.filter(p => p.pack.kind === 'jeopardy' && !p.pack.adult && p.pack.rounds.some(r => !r.final && r.themes.length >= JP.THEMES_MIN));
  const result: JeopardyPack[] = [];
  const fresh = left.filter(p => p.fresh).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
  const ordered = left.findIndex(p => p.id === order?.id);
  if (ordered >= 0) result.push(left.splice(ordered, 1)[0]);
  if (fresh && fresh.id !== order?.id && result.length < JP.PACKVOTE_OPTIONS) result.push(left.splice(left.indexOf(fresh), 1)[0]);
  while (left.length && result.length < JP.PACKVOTE_OPTIONS) {
    const weights = left.map(p => 1 / (Math.max(0, p.plays ?? 0) + 1));
    let r = rand() * weights.reduce((a, b) => a + b, 0), i = 0;
    while (i < left.length - 1 && (r -= weights[i]) >= 0) i++;
    result.push(left.splice(i, 1)[0]);
  }
  return result;
}
function packVote(s: JeopardyState, now: number, rand: () => number): void {
  s.host = null; s.options = packOptions(s.pool, rand, s.order); s.votes = {};
  phase(s, 'packvote', now, JP.PACKVOTE_MS);
  if (!s.options.length) finish(s, false);
}
export function newJeopardy(input: { players: JeopardyWho[]; host: JeopardyWho | null; packs: JeopardyPack[]; people?: JeopardyWho[]; order?: QzOrder | null }, now: number, rand: () => number): JeopardyState {
  const s: JeopardyState = { step: 'setup', host: input.host && { ...input.host },
    players: input.players.slice(0, JP.PLAYERS_MAX).map((p, pult) => ({ ...p, pult, score: 0, away: 0 })),
    people: structuredClone(input.people ?? [...input.players, ...(input.host ? [input.host] : [])]),
    pool: structuredClone(input.packs), options: [], votes: {}, pack: null, order: input.order ? structuredClone(input.order) : null, round: null, final: false, fin: null,
    used: [], turn: 0, current: null, openAt: 0, buzz: 0, buzzes: [], buzzUntil: 0, locks: {}, out: [], said: '', verdict: '',
    penalty: 0, disputeVotes: {}, more: 0, showAt: 0, endsAt: now + JP.SETUP_MS, total: JP.SETUP_MS, fewAt: null, asks: [],
    lines: [], nextId: 1, gaps: {}, played: false, endRound: false, done: false, result: null };
  if (s.players.length < JP.PLAYERS_MIN) finish(s, false);
  else if (!s.host) packVote(s, now, rand);
  return s;
}
export function readingMs(q: QzQuestion): number {
  const chars = q.content.reduce((n, c) => n + (c.kind === 'text' ? c.value.length : 0), 0);
  return Math.min(JP.READ_MAX_MS, Math.max(JP.READ_MIN_MS, JP.READ_BASE_MS + chars * JP.READ_PER_CHAR_MS))
    + q.content.reduce((n, c) => n + (c.kind === 'audio' ? c.sec * 1000 : 0), 0);
}
function cells(s: JeopardyState): Array<{ th: number; cell: number }> {
  return s.round?.themes.flatMap((t, th) => t.questions.map((_, cell) => ({ th, cell })).filter(c => !s.used.includes(`${th}:${c.cell}`))) ?? [];
}
function nextPick(s: JeopardyState, now: number, rand: () => number): void {
  s.current = null; s.openAt = 0; s.buzz = 0; s.said = ''; s.verdict = ''; s.out = [];
  if (!player(s, s.turn) || player(s, s.turn)!.away) { const ps = active(s); s.turn = ps.length ? ps[index(ps.length, rand)].slot : 0; }
  if (!cells(s).length || s.endRound) { startFinal(s, now); return; }
  phase(s, 'pick', now, JP.PICK_MS);
}
function startRound(s: JeopardyState, pack: JeopardyPack, round: number, themes: number[], final: boolean, now: number, rand: () => number): boolean {
  const r = pack.pack.rounds[round];
  if (pack.pack.kind !== 'jeopardy' || !r || r.final || themes.length < JP.THEMES_MIN || themes.length > JP.THEMES_MAX
    || new Set(themes).size !== themes.length || themes.some(i => !Number.isInteger(i) || !r.themes[i])) return false;
  s.pack = pack; s.round = { ...r, themes: themes.map(i => ({ ...r.themes[i], questions: r.themes[i].questions.slice(0, JP.PRICES_MAX) })) };
  s.final = final && pack.pack.rounds.some(r => r.final && r.themes.length > 0);
  const ps = active(s); s.turn = ps.length ? ps[index(ps.length, rand)].slot : 0;
  nextPick(s, now, rand); return true;
}
function ask(s: JeopardyState, th: number, cell: number, now: number): boolean {
  const theme = s.round?.themes[th], question = theme?.questions[cell];
  if (!Number.isInteger(th) || !Number.isInteger(cell) || !question || s.used.includes(`${th}:${cell}`)) return false;
  s.current = { th, cell, theme: theme!.name, question }; s.used.push(`${th}:${cell}`); s.played = true;
  s.buzz = 0; s.buzzes = []; s.buzzUntil = 0; s.out = []; s.said = ''; s.verdict = ''; s.penalty = 0; s.showAt = 0; s.disputeVotes = {};
  phase(s, question.type === 'cat' ? 'cat' : 'read', now, question.type === 'cat' ? JP.CAT_MS : readingMs(question));
  s.openAt = s.step === 'read' ? s.endsAt : 0; return true;
}
function open(s: JeopardyState, now: number, repeat = false): void {
  s.buzz = 0; s.buzzes = []; s.buzzUntil = 0; s.showAt = 0; s.openAt = now;
  phase(s, 'buzz', now, repeat ? JP.REBUZZ_MS : JP.BUZZ_MS);
  if (!eligible(s).length) { s.showAt = now + JP.SHOW_AUTO_MS; s.endsAt = s.showAt; s.total = JP.SHOW_AUTO_MS; }
}
function answer(s: JeopardyState, slot: number, now: number): void {
  s.buzz = slot; s.said = ''; s.more = 0; s.penalty = 0; s.buzzes = []; s.buzzUntil = 0;
  phase(s, 'answer', now, s.host ? JP.ANSWER_MS : JP.ANSWER_ZAT_MS);
}
function reveal(s: JeopardyState, now: number): void { s.showAt = 0; phase(s, 'reveal', now, JP.REVEAL_MS); }
function judge(s: JeopardyState, ok: boolean, now: number, penalize = true): void {
  const p = player(s, s.buzz), q = s.current?.question;
  if (!p || !q) { open(s, now, true); return; }
  s.verdict = ok ? 'yes' : 'no';
  if (ok) { p.score += s.penalty + q.price; s.penalty = 0; s.turn = p.slot; reveal(s, now); }
  else {
    if (!s.out.includes(p.slot)) s.out.push(p.slot);
    s.penalty = penalize && q.type !== 'noRisk' ? q.price : 0; p.score -= s.penalty;
    if (!s.host && penalize) phase(s, 'wrong', now, JP.DISPUTE_OFFER_MS);
    else open(s, now, true);
  }
}
function correct(text: string, q: QzQuestion): boolean {
  return !q.wrong.some(w => checkAnswer(text, w) === 'yes') && q.answers.some(a => checkAnswer(text, a) === 'yes');
}
function startFinal(s: JeopardyState, now: number): void {
  const round = s.final ? s.pack?.pack.rounds.find(r => r.final && r.themes.length) : null;
  const order = active(s).filter(p => p.score > 0).sort((a, b) => a.score - b.score || a.pult - b.pult)
    .map(p => ({ slot: p.slot, pid: p.pid, nick: p.nick, score: p.score, bet: 0, text: '', answered: false, ok: null }));
  if (!round || !order.length) { finish(s); return; }
  s.fin = { round, remaining: round.themes.map((_, i) => i), order, removeIndex: 0, question: null, theme: '', shown: 0 };
  s.current = null; s.buzz = 0; s.openAt = 0; s.said = ''; s.verdict = '';
  if (s.fin.remaining.length === 1) finalBet(s, now); else phase(s, 'fremove', now, JP.FINAL_REMOVE_MS);
}
function finalBet(s: JeopardyState, now: number): void {
  const f = s.fin!, theme = f.round.themes[f.remaining[0]];
  f.question = theme.questions[0]; f.theme = theme.name; phase(s, 'fbet', now, JP.FINAL_BET_MS);
}
function drop(s: JeopardyState, th: number, now: number): void {
  const f = s.fin!, i = f.remaining.indexOf(th); if (i < 0) return;
  f.remaining.splice(i, 1); f.removeIndex = (f.removeIndex + 1) % f.order.length;
  if (f.remaining.length === 1) finalBet(s, now); else phase(s, 'fremove', now, JP.FINAL_REMOVE_MS);
}
function finalShow(s: JeopardyState, now: number): void {
  const f = s.fin!;
  if (f.shown >= f.order.length) { finish(s); return; }
  const row = f.order[f.shown++], p = s.players.find(p => p.pid === row.pid);
  if (p) p.score += (row.ok ? 1 : -1) * row.bet;
  phase(s, 'freveal', now, JP.FINAL_REVEAL_MS);
}
function timer(s: JeopardyState, now: number, rand: () => number): void {
  s.players = s.players.filter(p => !p.away || now < p.away);
  if (active(s).length < JP.PLAYERS_MIN) s.fewAt ??= now; else s.fewAt = null;
  if (s.fewAt !== null && now - s.fewAt >= JP.FEW_MS) { finish(s, false); return; }
  if (s.step === 'buzz' && s.buzzUntil && now >= s.buzzUntil) {
    const best = s.buzzes.filter(b => eligible(s).some(p => p.slot === b.slot)).sort((a, b) => a.t - b.t || a.arrived - b.arrived)[0];
    if (best) { answer(s, best.slot, now); return; }
    s.buzzUntil = 0;
  }
  if (now < s.endsAt) return;
  switch (s.step) {
    case 'setup': packVote(s, now, rand); break;
    case 'packvote': {
      const counts = s.options.map((_, i) => Object.values(s.votes).filter(v => v === i).length), max = Math.max(...counts);
      const tied = s.options.filter((_, i) => counts[i] === max), pack = tied[index(tied.length, rand)];
      if (!pack) { finish(s, false); break; }
      const r = pack.pack.rounds.findIndex(r => !r.final && r.themes.length >= JP.THEMES_MIN);
      startRound(s, pack, r, pack.pack.rounds[r].themes.slice(0, JP.THEMES_MAX).map((_, i) => i), true, now, rand); break;
    }
    case 'pick': { const left = cells(s), c = left[index(left.length, rand)]; if (c) ask(s, c.th, c.cell, now); else startFinal(s, now); break; }
    case 'cat': { const ps = active(s).filter(p => p.slot !== s.turn); if (ps.length) answer(s, ps[index(ps.length, rand)].slot, now); else reveal(s, now); break; }
    case 'read': open(s, now); break;
    case 'buzz':
      if (s.buzzUntil) break;
      if (s.showAt) reveal(s, now); else { s.showAt = now + JP.SHOW_AUTO_MS; s.endsAt = s.showAt; s.total = JP.SHOW_AUTO_MS; }
      break;
    case 'answer': if (s.host) phase(s, 'judge', now, JP.JUDGE_MS); else judge(s, false, now); break;
    case 'judge': judge(s, false, now, false); break;
    case 'wrong': open(s, now, true); break;
    case 'dispute': {
      const vs = Object.values(s.disputeVotes), yes = vs.filter(Boolean).length;
      if (yes > vs.length - yes) judge(s, true, now); else open(s, now, true); break;
    }
    case 'reveal': nextPick(s, now, rand); break;
    case 'fremove': drop(s, s.fin!.remaining[index(s.fin!.remaining.length, rand)], now); break;
    case 'fbet':
      for (const p of s.fin!.order) p.bet ||= 1;
      phase(s, 'fanswer', now, JP.FINAL_ANSWER_MS); break;
    case 'fanswer':
      if (s.host) phase(s, 'fjudge', now, JP.FINAL_JUDGE_MS);
      else { for (const p of s.fin!.order) p.ok = correct(p.text, s.fin!.question!); finalShow(s, now); } break;
    case 'fjudge': for (const p of s.fin!.order) p.ok ??= false; finalShow(s, now); break;
    case 'freveal': finalShow(s, now); break;
  }
}

/** Чистый переход; ping/people/slot приходят от сервера, а не из JSON игрока. */
export function reduceJeopardy(before: JeopardyState, a: JeopardyAction, now: number, rand: () => number): JeopardyReply {
  if (before.done) return { state: before };
  const s = structuredClone(before);
  timer(s, now, rand);
  const reply = (error?: JeopardyError): JeopardyReply => ({ state: s, ...(error ? { error } : {}) });
  if (s.done || a.a === 'tick') return reply();
  if (a.a === 'stop') { finish(s, false); return reply(); }
  if (a.a === 'presence') {
    s.people = structuredClone(a.people);
    if (s.host && !s.people.some(p => p.pid === s.host!.pid)) {
      s.host = null;
      if (s.step === 'setup') packVote(s, now, rand);
      else if (s.step === 'answer' || s.step === 'judge') { phase(s, 'answer', now, JP.ANSWER_ZAT_MS); if (s.said) judge(s, correct(s.said, s.current!.question), now); }
      else if (s.step === 'fjudge') { for (const p of s.fin!.order) p.ok ??= correct(p.text, s.fin!.question!); finalShow(s, now); }
    }
    for (const p of s.players) if (!p.away && !s.people.some(w => w.pid === p.pid)) leave(s, p.slot, now, rand);
    for (const pid of Object.keys(s.votes)) if (!s.people.some(p => p.pid === Number(pid))) delete s.votes[Number(pid)];
    s.asks = s.asks.filter(p => s.people.some(w => w.pid === p.pid));
    return reply();
  }
  if (a.a === 'away') { leave(s, a.slot, now, rand); return reply(); }
  if (a.a === 'host') {
    const person = s.people.find(p => p.pid === a.who.pid && p.slot === a.who.slot);
    if (person && canHost(s, person.slot, now)) {
      s.host = { ...person }; s.options = []; s.votes = {};
      phase(s, 'setup', now, JP.SETUP_MS);
    }
    return reply();
  }
  if (a.a === 'seat') {
    if (!Number.isInteger(a.pult) || a.pult < 0 || a.pult >= JP.PLAYERS_MAX || a.who.pid === s.host?.pid
      || !s.people.some(p => p.pid === a.who.pid)) return reply();
    const own = s.players.find(p => p.pid === a.who.pid), occupied = s.players.find(p => p.pult === a.pult);
    if (own && own.pult === a.pult && own.away > now) {
      const old = own.slot;
      Object.assign(own, a.who, { away: 0 });
      s.out = s.out.map(slot => slot === old ? own.slot : slot);
      if (s.locks[old]) { s.locks[own.slot] = s.locks[old]; if (old !== own.slot) delete s.locks[old]; }
      const fp = s.fin?.order.find(p => p.pid === own.pid); if (fp) Object.assign(fp, a.who);
      if (!s.turn || s.turn === old) s.turn = own.slot;
      if (active(s).length >= JP.PLAYERS_MIN) s.fewAt = null;
      return reply();
    }
    if (own || occupied || s.fin) return reply();
    if (!s.host) s.players.push({ ...a.who, pult: a.pult, score: 0, away: 0 });
    else { if (!s.asks.some(p => p.pid === a.who.pid)) s.asks.push({ ...a.who, pult: a.pult }); return reply({ code: 'seat', text: 'Ждём согласия ведущего' }); }
    return reply();
  }
  const person = s.people.find(p => p.slot === a.slot);
  if (!person) return reply();
  const host = s.host?.slot === a.slot, p = player(s, a.slot);
  if (a.a === 'jpZat' && host && s.step === 'setup') packVote(s, now, rand);
  else if (a.a === 'jpStart' && host && s.step === 'setup') { const pack = s.pool.find(p => p.id === a.pack); if (pack) startRound(s, pack, a.round, a.themes, a.final, now, rand); }
  else if (a.a === 'jpPv' && s.step === 'packvote' && Number.isInteger(a.i) && s.options[a.i]) {
    s.votes[person.pid] = a.i;
    if (s.people.every(p => s.votes[p.pid] !== undefined)) s.endsAt = Math.min(s.endsAt, now + JP.PACKVOTE_ALL_MS);
  } else if (a.a === 'jpSeat' && host) {
    const ask = s.asks.find(p => p.slot === a.target);
    if (ask && a.ok && !s.fin && !s.players.some(p => p.pult === ask.pult || p.pid === ask.pid)) s.players.push({ ...ask, score: 0, away: 0 });
    s.asks = s.asks.filter(p => p.slot !== a.target);
  } else if (a.a === 'jpPick' && s.step === 'pick' && a.slot === s.turn && p && !p.away) ask(s, a.th, a.cell, now);
  else if (a.a === 'jpGive' && s.step === 'cat' && a.slot === s.turn && a.target !== a.slot && active(s).some(p => p.slot === a.target)) answer(s, a.target, now);
  else if (a.a === 'jpOpen' && host && s.step === 'read') open(s, now);
  else if (a.a === 'jpBuzz' && p && !p.away && !s.out.includes(a.slot)) {
    if ((s.locks[a.slot] ?? 0) > now) return reply();
    if (s.step === 'read') { s.locks[a.slot] = now + JP.EARLY_LOCK_MS; return reply({ code: 'early', text: 'Рано! Кнопка ждёт 1 с', wait: JP.EARLY_LOCK_MS }); }
    if (s.step !== 'buzz' || s.showAt || s.buzzes.some(b => b.slot === a.slot) || (s.buzzUntil && now >= s.buzzUntil)) return reply();
    const half = Number.isFinite(a.ping) ? Math.min(JP.HALF_PING_MAX_MS, Math.max(0, a.ping / 2)) : 0;
    s.buzzes.push({ slot: a.slot, t: Math.max(s.openAt, now - half), arrived: now });
    s.buzzUntil ||= now + JP.BUZZ_WINDOW_MS;
  } else if (a.a === 'jpAns' && s.step === 'answer' && a.slot === s.buzz && p && !p.away) {
    const text = sanitizeChat(a.text).slice(0, JP.ANSWER_MAX); if (!text) return reply();
    s.said = text; line(s, person, text, now);
    if (!s.host) judge(s, correct(text, s.current!.question), now);
  } else if (a.a === 'jpJudge' && host && (s.step === 'answer' || s.step === 'judge')) judge(s, a.ok, now);
  else if (a.a === 'jpMore' && host && s.step === 'answer' && s.more < JP.MORE_MAX) { s.more++; s.endsAt += JP.MORE_MS; s.total += JP.MORE_MS; }
  else if (a.a === 'jpShow' && host && s.step === 'buzz' && s.showAt) reveal(s, now);
  else if (a.a === 'jpEnd' && host && s.round && !s.fin) {
    s.endRound = true;
    if (s.step === 'pick') startFinal(s, now); else reveal(s, now);
  } else if (a.a === 'jpDispute' && s.step === 'wrong' && a.slot === s.buzz && p && !p.away) {
    s.disputeVotes = {}; phase(s, 'dispute', now, JP.DISPUTE_VOTE_MS);
  } else if (a.a === 'jpDv' && s.step === 'dispute' && p && !p.away && a.slot !== s.buzz) s.disputeVotes[person.pid] = a.ok;
  else if (a.a === 'jpDrop' && s.step === 'fremove' && a.slot === s.fin!.order[s.fin!.removeIndex].slot
    && Number.isInteger(a.th) && s.fin!.remaining[a.th] !== undefined) drop(s, s.fin!.remaining[a.th], now);
  else if (a.a === 'jpBet' && s.step === 'fbet') {
    const fp = s.fin!.order.find(p => p.pid === person.pid);
    if (fp && Number.isSafeInteger(a.n) && a.n >= 1 && a.n <= fp.score) fp.bet = a.n;
  } else if (a.a === 'jpFans' && s.step === 'fanswer') {
    const fp = s.fin!.order.find(p => p.pid === person.pid), text = sanitizeChat(a.text).slice(0, JP.ANSWER_MAX);
    if (fp && text) { fp.text = text; fp.answered = true; }
  } else if (a.a === 'jpFjudge' && host && s.step === 'fjudge' && typeof a.ok === 'boolean') {
    const fp = s.fin!.order.find(p => p.slot === a.target); if (fp) fp.ok = a.ok;
    if (s.fin!.order.every(p => p.ok !== null)) finalShow(s, now);
  } else if (a.a === 'say' && !s.fin) {
    const text = sanitizeChat(a.text).slice(0, QZ.LINE_MAX), wait = (s.gaps[person.pid] ?? 0) - now;
    if (wait > 0) return reply({ code: 'rate', text: `Не так быстро — через ${Math.ceil(wait / 1000)} с`, wait });
    if (text) { line(s, person, text, now); s.gaps[person.pid] = now + QZ.SAY_GAP_MS; }
  }
  return reply();
}
function leave(s: JeopardyState, slot: number, now: number, rand: () => number): void {
  const p = player(s, slot); if (!p || p.away) return;
  p.away = now + JP.AWAY_MS;
  if (s.buzz === slot && (s.step === 'answer' || s.step === 'judge')) judge(s, false, now, false);
  if (s.turn === slot) { const ps = active(s); s.turn = ps.length ? ps[index(ps.length, rand)].slot : 0; }
  if (s.step === 'fremove' && s.fin?.order[s.fin.removeIndex].slot === slot) {
    for (let i = 1; i <= s.fin.order.length; i++) {
      const next = (s.fin.removeIndex + i) % s.fin.order.length;
      if (active(s).some(p => p.pid === s.fin!.order[next].pid)) { s.fin.removeIndex = next; s.endsAt = now + JP.FINAL_REMOVE_MS; break; }
    }
  }
  if (active(s).length < JP.PLAYERS_MIN) s.fewAt ??= now;
}
function line(s: JeopardyState, p: QzWho, text: string, now: number): void {
  s.lines.push({ id: s.nextId++, ...who(p), text, at: now, kind: 'say', mark: '', markedAt: 0 });
  s.lines = s.lines.slice(-QZ.LINES_KEEP);
}
function publicPlayer(p: Player): QzJpPlayer { return { ...who(p), pult: p.pult, score: p.score, away: p.away }; }
export function jeopardyBoard(s: JeopardyState): QzJpBoard {
  const f = s.fin, current = s.current, q = f?.question ?? current?.question;
  const shownQuestion = current && s.step !== 'cat' ? { theme: current.question.type === 'cat' ? current.question.catTheme || current.theme : current.theme,
    price: current.question.price, type: current.question.type, th: current.th, cell: current.cell,
    content: current.question.content.filter(c => c.kind !== 'text' || !c.say) } : null;
  const finalQuestion = f?.question && ['fanswer', 'fjudge', 'freveal'].includes(s.step)
    ? { theme: f.theme, price: 0, type: f.question.type, th: f.remaining[0], cell: 0, content: f.question.content.filter(c => c.kind !== 'text' || !c.say) } : null;
  const answer = q && (s.step === 'reveal' || s.step === 'freveal') ? { text: q.answers[0] ?? '', comment: q.comment, reveal: q.reveal.filter(c => c.kind !== 'text' || !c.say) } : null;
  const by = player(s, s.buzz);
  return structuredClone({ step: s.step, pack: s.pack && { id: s.pack.id, title: s.pack.pack.title }, round: s.round?.name ?? '', final: s.final,
    host: s.host && who(s.host), players: s.players.map(publicPlayer), turn: s.turn,
    themes: s.round?.themes.map((t, th) => ({ name: t.name, cells: t.questions.map((q, c) => s.used.includes(`${th}:${c}`) ? 0 : q.price) })) ?? [],
    packs: s.step === 'packvote' ? s.options.map((p, i) => ({ id: p.id, title: p.pack.title, sub: p.pack.author, n: Object.values(s.votes).filter(v => v === i).length,
      ...(p.id === s.order?.id ? { by: s.order.by.nick } : {}), ...(p.fresh ? { fresh: true } : {}) })) : null,
    q: finalQuestion ?? shownQuestion, openAt: s.openAt, buzz: by ? who(by) : null, out: [...s.out], said: s.said, verdict: s.verdict, answer,
    dispute: s.step === 'dispute' && by ? { by: who(by), yes: Object.values(s.disputeVotes).filter(Boolean).length, no: Object.values(s.disputeVotes).filter(v => !v).length } : null,
    fin: f ? { themes: f.remaining.map(i => f.round.themes[i].name), remover: s.step === 'fremove' ? f.order[f.removeIndex].slot : 0,
      bet: f.order.filter(p => p.bet > 0).map(p => p.slot), answered: f.order.filter(p => p.answered).map(p => p.slot),
      shown: f.order.slice(0, f.shown).map(p => ({ ...who(p), text: p.text, ok: p.ok === true, bet: p.bet })) } : null,
    endsAt: s.endsAt, total: s.total });
}
export function jeopardyView(s: JeopardyState, slot: number): QzJpView {
  return { ...jeopardyBoard(s), lines: structuredClone(s.lines), asks: s.host?.slot === slot ? s.asks.map(who) : [] };
}
function canHost(s: JeopardyState, slot: number, now: number): boolean {
  const person = s.people.find(p => p.slot === slot);
  return !s.done && s.step === 'packvote' && now < s.endsAt && !s.host && !!person && !s.players.some(p => p.pid === person.pid);
}
export function jeopardyMe(s: JeopardyState, slot: number, now: number): QzJpMe {
  const p = player(s, slot), q = s.fin?.question ?? s.current?.question, fp = s.fin?.order.find(p => p.slot === slot);
  const me: QzJpMe = { pult: p?.pult ?? -1, canBuzz: !!p && !p.away && s.step === 'buzz' && !s.showAt && !s.out.includes(slot)
    && (s.locks[slot] ?? 0) <= now && now < s.endsAt && (!s.buzzUntil || now < s.buzzUntil), lockUntil: s.locks[slot] ?? 0, cat: s.step === 'cat' && s.turn === slot };
  if (s.host?.slot === slot && q) me.host = { answers: [...q.answers], wrong: [...q.wrong], comment: q.comment,
    say: q.content.filter(c => c.kind === 'text' && c.say).map(c => c.kind === 'text' ? c.value : ''), ...(q.catTheme ? { catTheme: q.catTheme } : {}) };
  if (fp) { me.bet = fp.bet; me.fanswered = fp.answered; }
  if (s.host?.slot === slot && s.step === 'fjudge') me.fanswers = s.fin!.order.map(p => ({ ...who(p), text: p.text, ok: p.ok === null ? '' : p.ok ? 'yes' : 'no' }));
  me.canDispute = s.step === 'wrong' && s.buzz === slot && !!p && !p.away;
  me.canJudgeDispute = s.step === 'dispute' && s.buzz !== slot && !!p && !p.away;
  me.canHost = canHost(s, slot, now);
  return me;
}
