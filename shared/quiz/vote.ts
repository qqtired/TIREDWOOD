import { QZ, QZ_MODES, type QuizMode, type QzVote, type QzWho } from './types.ts';

export interface VoteState {
  votes: Readonly<Record<number, number>>;
  endsAt: number;
  closing: boolean;
}
const READY: readonly QuizMode[] = ['riddle'];

export function createVote(now: number): VoteState {
  return { votes: {}, endsAt: now + QZ.VOTE_MS, closing: false };
}

export function voteView(s: VoteState, people: readonly QzWho[], ready: readonly QuizMode[] = READY): QzVote {
  const options = QZ_MODES.map((m, i) => {
    const off = people.length < m.min ? `от ${m.min}` : !ready.includes(m.id) ? 'Скоро' : null;
    const who = off ? [] : people.filter(p => s.votes[p.slot] === i).map(p => p.nick);
    return { mode: m.id, n: who.length, who, off };
  });
  return { options, people: people.length, voted: options.reduce((n, o) => n + o.n, 0), closing: s.closing,
    spin: null, win: -1, nobody: false, why: '' };
}

export function castVote(s: VoteState, slot: number, m: number, people: readonly QzWho[], ready: readonly QuizMode[] = READY): VoteState {
  if (!Number.isInteger(m) || !people.some(p => p.slot === slot) || !QZ_MODES[m] || voteView(s, people, ready).options[m].off || s.votes[slot] === m) return s;
  return { ...s, votes: { ...s.votes, [slot]: m } };
}

export function syncVote(s: VoteState, people: readonly QzWho[], now: number, ready: readonly QuizMode[] = READY): VoteState {
  const v = voteView(s, people, ready);
  const votes = Object.fromEntries(people.filter(p => v.options[s.votes[p.slot]]?.off === null).map(p => [p.slot, s.votes[p.slot]]));
  const closing = s.closing || (people.length > 0 && v.voted === people.length);
  const endsAt = closing && !s.closing ? Math.min(s.endsAt, now + QZ.VOTE_ALL_MS) : s.endsAt;
  if (closing === s.closing && JSON.stringify(votes) === JSON.stringify(s.votes)) return s;
  return { votes, closing, endsAt };
}

export function finishVote(s: VoteState, people: readonly QzWho[], last: Partial<Record<QuizMode, number>>, rand: () => number,
  ready: readonly QuizMode[] = READY): QzVote {
  const v = voteView(s, people, ready);
  const max = Math.max(...v.options.map(o => o.n));
  if (!max) return { ...v, nobody: true };
  const tied = v.options.flatMap((o, i) => o.off === null && o.n === max ? [i] : []);
  const oldest = Math.min(...tied.map(i => last[QZ_MODES[i].id] ?? 0));
  const candidates = tied.filter(i => (last[QZ_MODES[i].id] ?? 0) === oldest);
  const win = candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(rand() * candidates.length)))];
  const suffix = max % 100 >= 11 && max % 100 <= 14 ? 'голосов' : max % 10 === 1 ? 'голос' : max % 10 >= 2 && max % 10 <= 4 ? 'голоса' : 'голосов';
  return { ...v, win, spin: tied.length > 1 ? { tied, win } : null,
    why: `${max} ${suffix}${tied.length > 1 ? ' · дольше не играли' : ''}` };
}
