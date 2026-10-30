/** «Ракушка»: одна сцена на набережной. Комната отвечает только за людей, посадку и доставку сообщений. */
import { ACT_QUIZ } from '../../../shared/lobby.ts';
import type { QuizClientMsg, QuizServerMsg, QzErrCode } from '../../../shared/quiz/net.ts';
import type { RiddleResult, RiddleWho } from '../../../shared/quiz/riddle.ts';
import { QZ, QZ_CATEGORIES, QZ_MODES, type QuizMode, type QzBoard, type QzCall, type QzMe, type QzPhase,
  type QzScoreRow, type QzView, type QzVote, type QzZatClip, type QzZatSay } from '../../../shared/quiz/types.ts';
import { QUIZ_VENUE, inQuizArea, placeAt, type VenueSpot } from '../../../shared/quiz/venue.ts';
import { createVote, castVote, syncVote, voteView, finishVote, type VoteState } from '../../../shared/quiz/vote.ts';
import { RiddleGame } from './riddle.ts';

export interface QuizPerson extends RiddleWho {
  x: number; y: number; z: number; action: number; arg: number; ephemeral: boolean; riding: boolean;
}
export interface QuizHost {
  now(): number;
  rand(): number;
  people(): Iterable<QuizPerson>;
  hold(slot: number, place: number): void;
  release(slot: number, to?: VenueSpot): void;
  send(slot: number, msg: QuizServerMsg): void;
  sendLobby(msg: QuizServerMsg, except?: readonly number[]): void;
  announce(text: string): void;
  toast(slot: number, text: string): void;
  log(text: string): void;
}

function readMessage(raw: unknown): QuizClientMsg | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (m.t !== 'qz' || typeof m.a !== 'string') return null;
  const exact = (...keys: string[]): boolean => Object.keys(m).every(k => k === 't' || k === 'a' || keys.includes(k));
  const text = (x: unknown): x is string => typeof x === 'string';
  const id = (x: unknown): boolean => Number.isSafeInteger(x) && (x as number) >= 0;
  let ok = false;
  switch (m.a) {
    case 'vote': ok = exact('m') && id(m.m) && (m.m as number) < QZ_MODES.length; break;
    case 'play': case 'undo': case 'giveup': ok = exact(); break;
    case 'swap': ok = exact('on') && typeof m.on === 'boolean'; break;
    case 'role': ok = exact('take', 'r') && typeof m.take === 'boolean' && (m.r === undefined || m.r === 'riddler'); break;
    case 'ask': ok = exact('word', 'cat', 'hint') && text(m.word) && text(m.cat) && QZ_CATEGORIES.some(c => c === m.cat) && (m.hint === undefined || text(m.hint)); break;
    case 'say': case 'hint': ok = exact('text') && text(m.text); break;
    case 'mark': ok = exact('id', 'm') && id(m.id) && (m.m === 'warm' || m.m === 'miss' || m.m === 'win'); break;
    case 'unmark': ok = exact('id') && id(m.id); break;
  }
  return ok ? raw as QuizClientMsg : null;
}

export class QuizStage {
  private readonly h: QuizHost;
  private members = new Map<number, QuizPerson>();
  private phase: QzPhase = 'idle';
  private mode: QuizMode | null = null;
  private deadline = 0;
  private vote: VoteState | null = null;
  private decision: QzVote | null = null;
  private voteStep: 'ballot' | 'spin' | 'win' | 'nobody' = 'ballot';
  private readonly lastPlayed: Partial<Record<QuizMode, number>> = {};
  private call: QzCall | null = null;
  private acceptedBy: QzCall['by'] = 'open';
  private readonly skipped = new Set<number>();
  private lastRiddler = 0;
  private game: RiddleGame | null = null;
  private lineSeq = 1;
  private reserved: { slot: number; chair: number } | null = null;
  private readonly swaps = new Set<number>();
  private swapPending = false;
  private autoAt: number | null = null;
  private autoBlocked = false;
  private seatedBefore = new Set<number>();
  private aloneAt: number | null = null;
  private emptyAt: number | null;
  private readonly scores = new Map<number, QzScoreRow>();
  private readonly evening = new Map<number, QzScoreRow>();
  private zatSay: QzZatSay | null = null;
  private zatId = 0;
  private greetAt = -Infinity;
  private idleAt = -Infinity;
  private announceAt = -Infinity;
  private announcedStart = false;
  private rev = 0;
  private stateKey = '';
  private readonly sent = new Map<number, { pid: number; inside: boolean; key: string; at: number }>();

  constructor(host: QuizHost) { this.h = host; this.emptyAt = host.now(); }

  /** Не дать хабу уснуть с незавершённой игрой или сроком очистки счёта вечера. */
  get active(): boolean {
    return this.phase !== 'idle' || this.autoAt !== null || (this.evening.size > 0 && this.emptyAt !== null);
  }

  step(): void {
    const now = this.h.now();
    this.refresh(now);
    this.advance(now);
    this.flush(now);
  }

  use(slot: number, place: number): void {
    this.step();
    const p = this.members.get(slot), spot = placeAt(place);
    if (!p || !spot || spot.kind !== 'chair' || this.onStage(slot) || Math.hypot(p.x - spot.x, p.z - spot.z) > 1.4 || Math.abs(p.y - spot.y) >= 2) return;
    const occupied = [...this.members.values()].some(q => q.slot !== slot && q.action === ACT_QUIZ && q.arg === place);
    if (occupied || (this.reserved?.chair === place && this.reserved.slot !== slot)) { this.h.toast(slot, 'Место занято'); return; }
    if (p.action === ACT_QUIZ && p.arg === place) return;
    this.h.hold(slot, place);
    this.step();
  }

  /** Вызывается комнатой до снятия ACT_QUIZ: сцену покидают только завершением загадки или уходом. */
  stood(slot: number): boolean { return !this.onStage(slot); }

  blocksEmotes(slot: number): boolean {
    const p = [...this.h.people()].find(p => p.slot === slot);
    return !!p && !p.ephemeral && !p.riding && inQuizArea(p.x, p.y, p.z) && (this.phase === 'vote' || this.isRiddler(slot));
  }

  /** Комната вызывает до удаления игрока; снимок для вышедшего из комнаты уже не нужен. */
  left(slot: number): void {
    const p = this.members.get(slot);
    if (!p) return;
    this.members.delete(slot); this.sent.delete(slot);
    this.departed(p, this.h.now());
    if (!this.members.size) this.emptyAt ??= this.h.now();
  }

  message(slot: number, raw: unknown): void {
    const msg = readMessage(raw);
    if (!msg) return;
    this.step();
    const p = this.members.get(slot), now = this.h.now();
    if (!p) return;
    switch (msg.a) {
      case 'play':
        if (this.phase !== 'idle' || this.chair(p) < 0) return;
        if (this.members.size < 2) this.error(slot, 'few', 'Нужно хотя бы двое');
        else this.startVote(now);
        break;
      case 'vote':
        if (this.phase !== 'vote' || this.voteStep !== 'ballot' || !this.vote) return;
        this.vote = syncVote(castVote(this.vote, slot, msg.m, [...this.members.values()]), [...this.members.values()], now);
        this.deadline = this.vote.endsAt;
        break;
      case 'swap':
        if (!this.canSwap(p)) return;
        if (msg.on) this.swaps.add(slot); else this.swaps.delete(slot);
        this.checkSwap(now);
        break;
      case 'role':
        if (!this.canTake(p) || !this.call) return;
        if (msg.take) {
          this.acceptedBy = this.call.by; this.call = null; this.deadline = 0;
          if (this.phase === 'roles') { this.phase = 'game'; this.lastPlayed.riddle = now; }
          this.game!.beginAsk(p, now); this.participant(p);
        } else if (this.call.to) this.skip(p, this.call.by, now);
        break;
      default: {
        if (this.phase !== 'game' || !this.game || this.swapPending) return;
        const before = this.game.step, oldId = this.game.nextId, hints = this.game.round?.hints.length ?? 0;
        const error = this.game.message(p, msg, this.members.size - 1, now);
        if (error) this.h.send(slot, { t: 'qzErr', ...error });
        if (msg.a === 'say' && this.game.nextId !== oldId && (before === 'round' || before === 'check') && p.slot !== this.game.riddler?.slot) this.participant(p);
        if (msg.a === 'ask' && before === 'ask' && this.game.step === 'round') {
          this.reserved = { slot, chair: this.chair(p) < 0 ? -1 : p.arg };
          this.h.hold(slot, QUIZ_VENUE.first.riddler);
          this.say(`${p.nick} загадал! Тема — ${this.game.round!.category}`, 'announce', now);
          if (!this.announcedStart) {
            this.announcedStart = true;
            const names = [...this.members.values()].slice(0, 3).map(q => q.nick).join(', ');
            this.announce(`🎤 На «Ракушке» «Загадка»: ${names}${this.members.size > 3 ? ` и ещё ${this.members.size - 3}` : ''} — приходите угадывать!`, now);
          }
        }
        if (msg.a === 'hint' && (this.game.round?.hints.length ?? 0) > hints) this.say(`Подсказка: ${this.game.round!.hints.at(-1)}`, 'point', now);
        this.settle(now);
      }
    }
    this.refresh(now); this.flush(now);
  }

  /** Табло для снаружи: строки догадок, личное и ники голосовавших сюда не попадают. */
  board(): QzBoard {
    const b = this.base(this.h.now());
    if (b.vote) b.vote = { ...b.vote, options: b.vote.options.map(o => ({ ...o, who: [] })) };
    return b;
  }

  view(): QzView {
    return { ...this.base(this.h.now()), people: [...this.members.values()].map(p => ({ slot: p.slot, nick: p.nick,
      chair: this.chair(p), role: this.isRiddler(p.slot) ? 'riddler' : '', vote: this.choice(p.slot) })),
    call: this.call ? { ...this.call, to: this.call.to ? { ...this.call.to } : null } : null,
    swap: (this.phase === 'roles' || this.phase === 'game') && !this.swapPending ? { n: this.swaps.size, need: this.swapNeed() } : null,
    riddle: this.game?.view() ?? null };
  }

  me(slot: number): QzMe | null {
    const p = this.members.get(slot);
    if (!p) return null;
    const role = this.isRiddler(slot);
    const me: QzMe = { slot, place: p.action === ACT_QUIZ ? p.arg : -1, role: role ? 'riddler' : '', vote: this.choice(slot),
      swap: this.swaps.has(slot), canSwap: this.canSwap(p), canPlay: this.phase === 'idle' && this.chair(p) >= 0 && this.members.size >= 2,
      canTake: this.canTake(p), gapUntil: this.game?.gapUntil(p.pid) ?? 0 };
    if (role && this.game?.round) {
      me.word = this.game.round.word; me.near = this.game.near(); me.hintsLeft = QZ.HINTS - this.game.round.hints.length;
    }
    const score = this.scores.get(p.pid);
    if (this.phase === 'results' && score) me.result = { place: 1 + [...this.scores.values()].filter(s => s.pts > score.pts).length, pts: score.pts, tokens: 0 };
    return me;
  }

  private refresh(now: number): void {
    if (this.emptyAt !== null && now - this.emptyAt >= QZ.EVENING_IDLE_MS) this.evening.clear();
    const lobby = [...this.h.people()];
    const next = new Map(lobby.filter(p => !p.ephemeral && !p.riding && inQuizArea(p.x, p.y, p.z)).map(p => [p.slot, { ...p }]));
    const previous = this.members; this.members = next;
    for (const p of previous.values()) if (next.get(p.slot)?.pid !== p.pid) this.departed(p, now);
    const entered = [...next.values()].some(p => previous.get(p.slot)?.pid !== p.pid);
    if (next.size) this.emptyAt = null; else this.emptyAt ??= now;
    const seated = new Set([...next.values()].filter(p => this.chair(p) >= 0).map(p => p.pid));
    if ([...seated].some(pid => !this.seatedBefore.has(pid))) this.autoBlocked = false;
    this.seatedBefore = seated;
    for (const scores of [this.scores, this.evening]) for (const [pid, row] of scores) {
      const live = lobby.find(p => p.pid === pid && !p.ephemeral);
      row.slot = live?.slot ?? 0; if (live) row.nick = live.nick;
    }
    if (this.call?.to) {
      const p = next.get(this.call.to.slot);
      if (p) this.call.to = { slot: p.slot, nick: p.nick };
    }
    if (entered && this.phase === 'idle' && now - this.greetAt >= QZ.ZAT_GREET_GAP_MS) {
      this.greetAt = now; this.idleAt = now; this.say('Заходи! Садись — сыграем!', 'greet', now);
    }
  }

  private departed(p: QuizPerson, now: number): void {
    const replacement = this.members.get(p.slot);
    if (replacement && replacement.pid !== p.pid && this.reserved?.slot === p.slot) this.reserved = null;
    this.swaps.delete(p.slot);
    if (this.vote) {
      const votes = { ...this.vote.votes }; delete votes[p.slot]; this.vote = { ...this.vote, votes };
    }
    if (this.game?.riddler?.slot === p.slot) {
      if (this.game.step === 'ask') this.skip(p, this.acceptedBy, now);
      else if (this.game.finish('left', now)) this.settle(now);
    } else if (this.call?.to?.slot === p.slot) this.skip(p, this.call.by, now);
    if (this.reserved?.slot === p.slot) this.reserved = null;
    if (p.action === ACT_QUIZ && (!replacement || replacement.pid === p.pid)) this.h.release(p.slot);
  }

  private advance(now: number): void {
    if (this.phase === 'idle') {
      if (this.seatedBefore.size >= QZ.AUTO_VOTE_SEATED && !this.autoBlocked) {
        this.autoAt ??= now + QZ.AUTO_VOTE_DELAY_MS;
        if (now >= this.autoAt) this.startVote(now);
      } else this.autoAt = null;
      if (this.phase === 'idle' && this.members.size && this.seatedBefore.size < 2 && now - this.idleAt >= QZ.ZAT_IDLE_GAP_MS) {
        this.idleAt = now; this.say('Садитесь — сыграем!', 'talk', now);
      }
    } else if (this.phase === 'vote' && this.vote) {
      if (this.voteStep === 'ballot') {
        this.vote = syncVote(this.vote, [...this.members.values()], now); this.deadline = this.vote.endsAt;
        if (now >= this.deadline) {
          this.decision = finishVote(this.vote, [...this.members.values()], this.lastPlayed, () => this.h.rand());
          if (this.decision.nobody) {
            this.voteStep = 'nobody'; this.deadline = now + QZ.NOBODY_MS; this.say('Ну, как надумаете!', 'shrug', now);
          } else if (this.decision.spin) {
            this.voteStep = 'spin'; this.deadline = now + QZ.SPIN_MS; this.say('Кручу колесо!', 'point', now);
          } else this.voteWinner(now);
        }
      } else if (now >= this.deadline) {
        if (this.voteStep === 'nobody') this.idle(true);
        else if (this.voteStep === 'spin') this.voteWinner(now);
        else {
          this.phase = 'roles'; this.deadline = 0; this.vote = null; this.decision = null;
          this.game = new RiddleGame(this.lineSeq); this.skipped.clear(); this.lastRiddler = 0;
          this.openCall(now);
        }
      }
    } else if (this.phase === 'roles' || this.phase === 'game') {
      this.checkSwap(now);
      if (this.phase !== 'roles' && this.phase !== 'game') return;
      if (this.swapPending) {
        if (now >= this.game!.deadline) this.startVote(now);
        return;
      }
      if (this.phase === 'game') {
        if (this.members.size < 2) this.aloneAt ??= now; else this.aloneAt = null;
        if (this.aloneAt !== null && now - this.aloneAt >= QZ.ALONE_MS) {
          this.game!.finish('empty', now); this.settle(now);
          if (this.game!.played) this.finishResults(now); else this.idle(false);
          return;
        }
        const event = this.game!.tick(now); this.settle(now);
        if (event === 'askTimeout' && this.game!.riddler) this.skip(this.game!.riddler, this.acceptedBy, now);
        else if (event === 'done') { this.finishResults(now); return; }
        else if (event === 'next') {
          const result = this.game!.round?.result;
          this.lastRiddler = result?.riddler.pid ?? 0; this.skipped.clear(); this.game!.beginCall();
          const solver = result?.solver ? [...this.members.values()].find(p => p.pid === result.solver!.pid) : undefined;
          if (solver) this.setCall('solver', solver, now); else this.openCall(now);
        }
        if (this.game?.takeHurry(now)) this.say('Осталась минута!', 'talk', now);
      }
      if (this.call && now >= this.call.endsAt) {
        const target = this.call.to ? this.members.get(this.call.to.slot) : undefined;
        if (target) this.skip(target, this.call.by, now); else this.assign(now);
      }
    } else if (this.phase === 'results' && now >= this.deadline) {
      if (this.members.size >= 2) this.startVote(now); else this.idle(false);
    }
  }

  private startVote(now: number): void {
    this.lineSeq = this.game?.nextId ?? this.lineSeq;
    this.restore(); this.game = null; this.call = null; this.mode = null;
    this.phase = 'vote'; this.vote = createVote(now); this.deadline = this.vote.endsAt; this.voteStep = 'ballot'; this.decision = null;
    this.swaps.clear(); this.swapPending = false; this.autoAt = null; this.autoBlocked = false; this.aloneAt = null;
    this.scores.clear(); this.announcedStart = false;
    this.say('Голосуем — жмите 1–4!', 'announce', now);
  }

  private voteWinner(now: number): void {
    this.voteStep = 'win'; this.deadline = now + QZ.WIN_MS;
    this.decision = { ...this.decision!, spin: null }; this.mode = QZ_MODES[this.decision.win].id;
    this.say(`Поехали! ${QZ_MODES[this.decision.win].name}!`, 'cheer', now);
  }

  private idle(blocked: boolean): void {
    this.lineSeq = this.game?.nextId ?? this.lineSeq;
    this.restore(); this.phase = 'idle'; this.mode = null; this.deadline = 0; this.vote = null; this.decision = null;
    this.game = null; this.call = null; this.autoAt = null; this.autoBlocked = blocked; this.swaps.clear(); this.swapPending = false;
  }

  private candidates(): QuizPerson[] {
    return [...this.members.values()].filter(p => !this.skipped.has(p.pid) && (p.pid !== this.lastRiddler || this.members.size === 1));
  }

  private canTake(p: QuizPerson): boolean {
    return !!this.call && !this.swapPending && (!this.call.to || this.call.to.slot === p.slot) && this.candidates().some(q => q.slot === p.slot);
  }

  private setCall(by: QzCall['by'], to: QuizPerson | null, now: number): void {
    this.call = { role: 'riddler', by, to: to ? { slot: to.slot, nick: to.nick } : null, endsAt: now + QZ.CALL_MS };
    if (by === 'open') this.say('Кто загадывает?', 'talk', now);
    else if (by === 'zat') this.say(`${to!.nick}, давай ты!`, 'point', now);
  }

  private openCall(now: number): void {
    if (!this.candidates().length) this.noVolunteers(now); else this.setCall('open', null, now);
  }

  private assign(now: number): void {
    const pool = this.candidates(), seated = pool.filter(p => this.chair(p) >= 0), choices = seated.length ? seated : pool;
    if (!choices.length) { this.noVolunteers(now); return; }
    const i = Math.min(choices.length - 1, Math.max(0, Math.floor(this.h.rand() * choices.length)));
    this.setCall('zat', choices[i], now);
  }

  private skip(p: RiddleWho, by: QzCall['by'], now: number): void {
    this.skipped.add(p.pid); this.call = null; this.game?.beginCall();
    if (by === 'solver') this.openCall(now); else this.assign(now);
  }

  private noVolunteers(now: number): void {
    if (this.phase === 'roles') this.idle(false); else this.finishResults(now, false);
    this.say('Никто не хочет загадывать — тогда в другой раз', 'shrug', now);
  }

  private isRiddler(slot: number): boolean {
    return this.game?.riddler?.slot === slot && ['ask', 'round', 'check'].includes(this.game.step);
  }

  private onStage(slot: number): boolean { return this.reserved?.slot === slot; }
  private chair(p: QuizPerson): number { const place = p.action === ACT_QUIZ ? placeAt(p.arg) : null; return place?.kind === 'chair' ? place.n : -1; }
  private canSwap(p: QuizPerson): boolean { return (this.phase === 'roles' || this.phase === 'game') && !this.swapPending && (this.chair(p) >= 0 || this.isRiddler(p.slot)); }
  private swapNeed(): number { return Math.floor([...this.members.values()].filter(p => this.chair(p) >= 0 || this.isRiddler(p.slot)).length / 2) + 1; }

  private checkSwap(now: number): void {
    if ((this.phase !== 'roles' && this.phase !== 'game') || this.swapPending || this.swaps.size < this.swapNeed()) return;
    this.call = null;
    if (this.game?.finish('swap', now)) { this.swapPending = true; this.settle(now); this.say('Меняем игру!', 'talk', now); }
    else { this.say('Меняем игру!', 'talk', now); this.startVote(now); }
  }

  private participant(p: RiddleWho): void {
    if (!this.scores.has(p.pid)) this.scores.set(p.pid, { slot: p.slot, nick: p.nick, pts: 0 });
  }

  private settle(now: number): void {
    const result = this.game?.takeResult();
    if (!result) return;
    this.lastRiddler = result.riddler.pid;
    for (const [id, pts] of Object.entries(result.points)) {
      const pid = Number(id), player = this.scores.get(pid);
      if (!player) continue;
      player.pts += pts;
      const old = this.evening.get(pid);
      this.evening.set(pid, { slot: player.slot, nick: player.nick, pts: (old?.pts ?? 0) + pts });
    }
    this.restore(result);
    if (result.end === 'solved') {
      this.say(`Угадал! Это был ${result.answer}`, 'cheer', now);
      this.announce(`🎤 «Ракушка»: ${result.solver!.nick} разгадал загадку ${result.riddler.nick} — «${result.answer}»!`, now);
    } else if (result.end === 'timeout') this.say(`Не угадали: это был ${result.answer}`, 'shrug', now);
    else if (result.end === 'left') this.say(`${result.riddler.nick} ушёл — загадка не в счёт`, 'shrug', now);
  }

  private restore(result?: RiddleResult): void {
    const r = this.reserved; this.reserved = null;
    if (!r) return;
    if (result?.end === 'left' || !this.members.has(r.slot)) this.h.release(r.slot);
    else if (r.chair >= 0) this.h.hold(r.slot, r.chair);
    else this.h.release(r.slot, QUIZ_VENUE.back);
    // Хост двигает живого игрока; копия нужна уже в ближайшем снимке.
    const p = [...this.h.people()].find(p => p.slot === r.slot);
    if (p && this.members.has(r.slot)) this.members.set(r.slot, { ...p });
  }

  private finishResults(now: number, cheer = true): void {
    this.restore(); this.phase = 'results'; this.call = null; this.deadline = now + QZ.RESULTS_MS; this.swaps.clear(); this.swapPending = false;
    const top = this.rows(this.scores)[0];
    if (top) {
      if (cheer) this.say(`Молодцы! Лучший — ${top.nick}`, 'clap', now);
      this.announce(`🏆 ${top.nick} выиграл «Загадку» на «Ракушке» — ${top.pts} очков`, now);
    }
  }

  private choice(slot: number): number {
    if (this.phase !== 'vote' || !this.vote) return -1;
    const m = this.vote.votes[slot];
    return voteView(this.vote, [...this.members.values()]).options[m]?.off === null ? m : -1;
  }

  private rows(scores: Map<number, QzScoreRow>): QzScoreRow[] { return [...scores.values()].map(p => ({ ...p })).sort((a, b) => b.pts - a.pts); }

  private base(now: number) {
    const r = this.game?.view();
    const riddle = r ? (({ lines: _lines, ...board }) => board)(r) : null;
    const vote = this.decision ?? (this.vote ? voteView(this.vote, [...this.members.values()]) : null);
    return { rev: this.rev, now, phase: this.phase, endsAt: this.call?.endsAt ?? (this.game?.step === 'ask' ? this.game.deadline : this.deadline),
      mode: this.mode, count: this.members.size, seated: [...this.members.values()].filter(p => this.chair(p) >= 0).length,
      vote: vote ? structuredClone(vote) : null, riddle,
      results: this.phase === 'results' ? { mode: this.mode!, top: this.rows(this.scores).slice(0, 3), endsAt: this.deadline } : null,
      evening: this.rows(this.evening).slice(0, 8), noTokens: this.members.size < QZ.TOKENS_MIN_PEOPLE, zat: this.zatSay ? { ...this.zatSay } : null };
  }

  private say(text: string, clip: QzZatClip, now: number): void {
    this.zatSay = { id: ++this.zatId, text, clip, at: now };
    if (this.phase === 'game') this.game?.zat(text, now);
  }

  private announce(text: string, now: number): void {
    if (now - this.announceAt < QZ.ANNOUNCE_GAP_MS) return;
    this.announceAt = now; this.h.announce(text);
  }

  private error(slot: number, code: QzErrCode, text: string): void { this.h.send(slot, { t: 'qzErr', code, text }); }

  private flush(now: number): void {
    const view = this.view(), board = this.board();
    const fullKey = JSON.stringify({ ...view, rev: 0, now: 0 }), boardKey = JSON.stringify({ ...board, rev: 0, now: 0 });
    const personal = new Map([...this.members.keys()].map(slot => [slot, this.me(slot)!]));
    const stateKey = fullKey + JSON.stringify([...personal.values()]);
    if (stateKey !== this.stateKey) { this.stateKey = stateKey; this.rev++; }
    view.rev = board.rev = this.rev;
    const lobby = [...this.h.people()];
    for (const p of lobby) {
      const me = personal.get(p.slot), inside = !!me, old = this.sent.get(p.slot);
      const key = inside ? fullKey + JSON.stringify(me) : boardKey;
      const transition = !old || old.pid !== p.pid || old.inside !== inside;
      if (!transition && (old.key === key || now - old.at < QZ.SNAP_MIN_MS)) continue;
      this.h.send(p.slot, me ? { t: 'qz', v: view, me } : { t: 'qzBoard', b: board });
      this.sent.set(p.slot, { pid: p.pid, inside, key, at: now });
    }
    const slots = new Set(lobby.map(p => p.slot));
    for (const slot of this.sent.keys()) if (!slots.has(slot)) this.sent.delete(slot);
  }
}
