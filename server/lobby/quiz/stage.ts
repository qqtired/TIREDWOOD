/** «Ракушка»: одна сцена на набережной. Комната отвечает только за людей, посадку и доставку сообщений. */
import { ACT_QUIZ } from '../../../shared/lobby.ts';
import type { QuizClientMsg, QuizServerMsg, QzErrCode } from '../../../shared/quiz/net.ts';
import type { RiddleResult, RiddleWho } from '../../../shared/quiz/riddle.ts';
import { QZ, QZ_CROC, QZ_HALF, QZ_MODES, QZ_WHO, type QuizMode, type QzBoard, type QzCall, type QzMe, type QzPhase, type QzInkOp,
  type QzScoreRow, type QzView, type QzVote, type QzZatClip, type QzZatSay, type QzOrder, type QzPackKind, type QzTitle } from '../../../shared/quiz/types.ts';
import { QUIZ_VENUE, inQuizArea, placeAt, type VenueSpot } from '../../../shared/quiz/venue.ts';
import { createVote, castVote, syncVote, voteView, finishVote, type VoteState } from '../../../shared/quiz/vote.ts';
import { RiddleGame } from './riddle.ts';
import { JeopardyGame } from './jeopardy.ts';
import { CrocGame } from './croc.ts';
import { WhoOfUsGame } from './whoofus.ts';
import { WarmGame } from './warm.ts';
import { zatLine, ZAT_RIDDLE_SOLVED, ZAT_RIDDLE_MISSED } from './zat-lines.ts';
import { readMessage } from './input.ts';
import type { ModeHost, QuizController } from './controller.ts';
import { loadBuiltinPacks } from './builtin.ts';
import type { QuizPacks } from './packs.ts';
import type { QuizHttp } from './http.ts';
import { PackError } from '../../../shared/quiz/pack.ts';
import { QuizTokens, quizPlaces, quizMyRecords, quizTopRecords, type QuizStats, type QuizRewardEvent, type QuizAward } from './tokens.ts';

export interface QuizPerson extends RiddleWho {
  x: number; y: number; z: number; action: number; arg: number; ephemeral: boolean; riding: boolean;
  ping?: number;
  level?: number;
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
  packs?: QuizPacks;
  http?: QuizHttp;
  profiles?(): Array<{ pid: number; nick: string; stats: unknown }>;
  saveStats?(pid: number, stats: QuizStats): void;
  /** pid сохраняет получателя награды, если он уже ушёл с набережной или его slot заняли. */
  credit?(slot: number, n: number, pid?: number): void;
}

const READY = QZ_MODES.map(m => m.id);
/** «Ракушка» 1.1: «Сыграть» — какие паки можно заказать и как назвать игру в ответе */
const ORDER_GAME: Partial<Record<QzPackKind, string>> = { jeopardy: 'Своя игра', words: 'Крокодил', whoofus: 'Кто из нас?' };

export class QuizStage {
  private readonly h: QuizHost;
  private members = new Map<number, QuizPerson>();
  private phase: QzPhase = 'idle';
  private mode: QuizMode | null = null;
  private deadline = 0;
  private vote: VoteState | null = null;
  private voteAt = new Map<number, number>();
  private readonly again = new Map<number, number>();
  private decision: QzVote | null = null;
  private voteStep: 'ballot' | 'spin' | 'win' | 'nobody' = 'ballot';
  private readonly lastPlayed: Partial<Record<QuizMode, number>> = {};
  private call: QzCall | null = null;
  private acceptedBy: QzCall['by'] = 'open';
  private readonly skipped = new Set<number>();
  private lastRiddler = 0;
  private controller: QuizController | null = null;
  private warm: WarmGame | null = null;
  private get game(): RiddleGame | null { return this.controller instanceof RiddleGame ? this.controller : null; }
  private tokens: QuizTokens;
  private seatedAt = new Map<number, number>();
  private seatSeq = 0;
  private recsAt = new Map<number, number>();
  private inkPending: { d: number; ops: QzInkOp[] } | null = null;
  private inkAt = -Infinity;
  private inkFull = new Map<number, { pid: number; d: number; skip: number }>();
  private builtins: ReturnType<typeof loadBuiltinPacks> | null = null;
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
  private readonly eveningTitles = new Map<number, QzTitle>();
  private bravo: Array<{ slot: number; at: number }> = [];
  private readonly bravoAt = new Map<number, number>();
  private zatSay: QzZatSay | null = null;
  private zatId = 0;
  private greetAt = -Infinity;
  private idleAt = -Infinity;
  private announceAt = -Infinity;
  private announcedStart = false;
  private rev = 0;
  private stateKey = '';
  private readonly sent = new Map<number, { pid: number; inside: boolean; key: string; at: number }>();
  /** «Сыграть»: по одному заказу на вид пака, новый заменяет старый; живут, пока жив счёт вечера */
  private readonly orders = new Map<QzPackKind, QzOrder>();

  constructor(host: QuizHost) {
    this.h = host; this.emptyAt = host.now(); this.tokens = new QuizTokens(host.profiles?.());
  }

  raisedPults(): number[] { return this.phase === 'game' ? this.controller?.pults?.() ?? [] : []; }

  /** Не дать хабу уснуть с незавершённой игрой или сроком очистки счёта вечера. */
  get active(): boolean {
    return this.phase !== 'idle' || this.autoAt !== null || !!this.warm || this.bravo.length > 0
      || ((this.evening.size > 0 || this.eveningTitles.size > 0 || this.orders.size > 0) && this.emptyAt !== null);
  }

  step(): void {
    const now = this.h.now();
    this.bravo = this.bravo.filter(b => now - b.at < QZ.BRAVO_SHOW_MS);
    this.refresh(now);
    this.advance(now);
    if (this.phase === 'game') this.pay(this.tokens.minute(this.insidePids(), now));
    this.flushInk(now);
    this.flush(now);
  }

  use(slot: number, place: number): void {
    this.step();
    const p = this.members.get(slot), spot = placeAt(place);
    if (!p || !spot || this.onStage(slot) || Math.hypot(p.x - spot.x, p.z - spot.z) > 1.4 || Math.abs(p.y - spot.y) >= 2) return;
    if (spot.kind !== 'chair') {
      const error = this.controller?.use?.(slot, place, this.h.now());
      if (error) this.h.send(slot, { t: 'qzErr', ...error });
      this.refresh(this.h.now()); this.flush(this.h.now()); return;
    }
    if (this.controller?.roleOf(slot) && this.controller.mode !== 'riddle') this.controller.stood?.(slot, this.h.now());
    const occupied = [...this.members.values()].some(q => q.slot !== slot && q.action === ACT_QUIZ && q.arg === place);
    if (occupied || (this.reserved?.chair === place && this.reserved.slot !== slot)) { this.h.toast(slot, 'Место занято'); return; }
    if (p.action === ACT_QUIZ && p.arg === place) return;
    this.h.hold(slot, place);
    this.step();
  }

  /** Вызывается комнатой до снятия ACT_QUIZ: сцену покидают только завершением загадки или уходом. */
  stood(slot: number, apply = true): boolean { return !this.onStage(slot) && (!apply || (this.controller?.stood?.(slot, this.h.now()) ?? true)); }

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
    if (this.controller && !this.game) { this.controller.presence?.(this.h.now()); this.syncMode(this.h.now()); }
    if (!this.members.size) this.emptyAt ??= this.h.now();
  }

  message(slot: number, raw: unknown): void {
    const msg = readMessage(raw);
    if (!msg) return;
    this.step();
    const p = this.members.get(slot), now = this.h.now();
    if (!p) return;
    if (this.catalog(p, msg, now)) return;
    switch (msg.a) {
      case 'play':
        if (this.phase !== 'idle' || this.chair(p) < 0) return;
        if (this.members.size < 2) this.error(slot, 'few', 'Нужно хотя бы двое');
        else this.startVote(now);
        break;
      case 'vote': {
        if (this.phase !== 'vote' || this.voteStep !== 'ballot' || !this.vote) return;
        const voted = castVote(this.vote, slot, msg.m, [...this.members.values()], READY);
        if (voted !== this.vote) { this.voteAt.delete(slot); this.voteAt.set(slot, now); }
        this.vote = syncVote(voted, [...this.members.values()], now, READY);
        this.deadline = this.vote.endsAt;
        break;
      }
      case 'again':
        if (!this.canAgain(p)) return;
        if (!msg.on) this.again.delete(slot); else if (!this.again.has(slot)) this.again.set(slot, now);
        this.checkAgain(now);
        break;
      case 'bravo':
        if (this.chair(p) < 0 || now - (this.bravoAt.get(p.pid) ?? -Infinity) < QZ.BRAVO_GAP_MS) return;
        this.bravoAt.set(p.pid, now); this.bravo.push({ slot, at: now });
        break;
      case 'warm':
        if (msg.on && this.canWarm(p)) {
          const warm = new WarmGame({ ...this.modeHost(), toast: (who, text) => this.h.toast(who, text) }, p, now);
          if (warm.board()) this.warm = warm;
        } else if (!msg.on && this.warm?.who.pid === p.pid) this.warm = null;
        break;
      case 'swap':
        if (!this.canSwap(p)) return;
        if (msg.on) this.swaps.add(slot); else this.swaps.delete(slot);
        if (this.phase === 'game') this.tokens.action(p.pid, now);
        this.checkSwap(now);
        break;
      case 'role':
        if (this.controller && !this.game) { this.modeMessage(p, msg, now); break; }
        if (msg.r && msg.r !== 'riddler') return;
        if (this.swapPending) return;
        if (this.canTake(p) && this.call) {
          if (!msg.take) { this.game?.leaveQueue(p.pid); if (this.call.to) this.skip(p, this.call.by, now); break; }
          this.acceptedBy = this.call.by; this.call = null; this.deadline = 0;
          if (this.phase === 'roles') this.beginGame(now);
          this.game!.beginAsk(p, now); this.participant(p);
          this.tokens.action(p.pid, now);
        } else if (this.phase === 'game' && this.game) {
          if (!msg.take) this.game.leaveQueue(p.pid);
          else if (this.game.joinQueue(p)) this.tokens.action(p.pid, now);
        }
        break;
      default: {
        if (this.phase === 'idle' && this.warm && msg.a === 'say') {
          const error = this.warm.say(p, msg.text, now);
          if (error) this.h.send(slot, { t: 'qzErr', ...error });
          break;
        }
        if (this.phase !== 'game' || !this.controller || this.swapPending) return;
        if (!this.game) { this.modeMessage(p, msg, now); break; }
        const before = this.game.step, oldId = this.game.nextId, hints = this.game.round?.hints.length ?? 0;
        const error = this.controller.message(p, msg, this.members.size - 1, now);
        if (error) this.h.send(slot, { t: 'qzErr', ...error });
        if (this.controller.accepted) this.tokens.action(p.pid, now);
        if (msg.a === 'say' && this.game.nextId !== oldId && (before === 'round' || before === 'check') && p.slot !== this.game.riddler?.slot) this.participant(p);
        if (msg.a === 'ask' && before === 'ask' && this.game.step === 'round') {
          this.riddleStarted(p, now);
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

  view(slot = 0): QzView {
    const fields = this.controller?.viewFields(slot);
    return { ...this.base(this.h.now()), people: [...this.members.values()].map(p => ({ slot: p.slot, nick: p.nick,
      chair: this.chair(p), role: this.controller?.roleOf(p.slot) ?? '', vote: this.choice(p.slot),
      ...(this.mode === 'whoofus' ? { titles: this.controller?.titles?.(p.pid) ?? [] } : {}) })),
    call: this.call ? { ...this.call, to: this.call.to ? { ...this.call.to } : null } : null,
    swap: (this.phase === 'roles' || this.phase === 'game') && !this.swapPending ? { n: this.swaps.size, need: this.swapNeed() } : null,
    again: this.againView(), bravo: this.bravo.map(b => ({ ...b })),
    riddle: fields?.riddle ?? null, jp: fields?.jp ?? null, croc: fields?.croc ?? null, who: fields?.who ?? null,
    orders: [...this.orders.values()].map(o => ({ ...o, by: { ...o.by } })) };
  }

  me(slot: number): QzMe | null {
    const p = this.members.get(slot);
    if (!p) return null;
    const me: QzMe = { slot, place: p.action === ACT_QUIZ ? p.arg : -1, role: this.controller?.roleOf(slot) ?? '', vote: this.choice(slot),
      swap: this.swaps.has(slot), canSwap: this.canSwap(p), canPlay: this.phase === 'idle' && this.chair(p) >= 0 && this.members.size >= 2,
      canTake: this.canTake(p), gapUntil: this.warm?.gapUntil(p.pid) ?? this.controller?.gapUntil(p.pid) ?? 0,
      again: this.again.has(slot), canAgain: this.canAgain(p), canWarm: this.canWarm(p),
      ...this.controller?.meFields(slot, this.h.now()), dayCoins: this.tokens.stats(p.pid, this.h.now()).qzDayCoins };
    const up = this.h.http?.uploadCheck(p.nick, p.level ?? 1) ?? { ok: false, why: 'Паки пока недоступны.' };
    me.canUpload = up.ok; me.uploadWhy = up.why;
    const score = this.scores.get(p.pid);
    if (this.phase === 'results' && (score || this.tokens.gameCoins(p.pid))) me.result = {
      place: score ? 1 + [...this.scores.values()].filter(s => s.pts > score.pts).length : 0,
      pts: score?.pts ?? 0, tokens: this.tokens.gameCoins(p.pid) };
    return me;
  }

  private refresh(now: number): void {
    if (this.emptyAt !== null && now - this.emptyAt >= QZ.EVENING_IDLE_MS) { this.evening.clear(); this.eveningTitles.clear(); this.orders.clear(); }
    const lobby = [...this.h.people()];
    const next = new Map(lobby.filter(p => !p.ephemeral && !p.riding && inQuizArea(p.x, p.y, p.z)).map(p => [p.slot, { ...p }]));
    const previous = this.members; this.members = next;
    for (const p of previous.values()) if (next.get(p.slot)?.pid !== p.pid) this.departed(p, now);
    const entered = [...next.values()].some(p => previous.get(p.slot)?.pid !== p.pid);
    if (next.size) this.emptyAt = null; else this.emptyAt ??= now;
    const seated = new Set([...next.values()].filter(p => this.chair(p) >= 0).map(p => p.pid));
    for (const pid of this.seatedAt.keys()) if (!seated.has(pid)) this.seatedAt.delete(pid);
    for (const pid of seated) if (!this.seatedAt.has(pid)) this.seatedAt.set(pid, ++this.seatSeq);
    for (const p of this.h.profiles?.() ?? []) this.tokens.load(p.pid, p.stats);
    if ([...seated].some(pid => !this.seatedBefore.has(pid))) this.autoBlocked = false;
    this.seatedBefore = seated;
    for (const scores of [this.scores, this.evening, this.eveningTitles]) for (const [pid, row] of scores) {
      const live = lobby.find(p => p.pid === pid && !p.ephemeral);
      row.slot = live?.slot ?? 0; if (live) row.nick = live.nick;
    }
    this.game?.syncQueue([...next.values()]);
    if (this.warm) {
      const owner = [...next.values()].find(p => p.pid === this.warm!.who.pid);
      if (!owner || this.chair(owner) < 0 || this.phase !== 'idle') this.warm = null;
      else if (seated.size >= 2) { this.warm = null; this.say('О, нас двое — давайте играть!', 'cheer', now); }
      else this.warm.who = { ...owner };
    }
    if (this.call?.to) {
      const p = next.get(this.call.to.slot);
      if (p) this.call.to = { slot: p.slot, nick: p.nick };
    }
    if (entered && this.phase === 'idle' && !this.warm && now - this.greetAt >= QZ.ZAT_GREET_GAP_MS) {
      this.greetAt = now; this.idleAt = now; this.say('Заходи! Садись — сыграем!', 'greet', now);
    }
    if (this.controller && !this.game && (this.phase === 'roles' || this.phase === 'game')) {
      this.controller.presence?.(now); this.syncMode(now);
      for (const live of this.h.people()) if (next.get(live.slot)?.pid === live.pid) next.set(live.slot, { ...live });
    }
    for (const slot of this.swaps) { const p = next.get(slot); if (!p || !this.canSwap(p)) this.swaps.delete(slot); }
    for (const slot of this.again.keys()) { const p = next.get(slot); if (!p || !this.canAgain(p)) this.again.delete(slot); }
  }

  private departed(p: QuizPerson, now: number): void {
    const replacement = this.members.get(p.slot);
    if (replacement && replacement.pid !== p.pid && this.reserved?.slot === p.slot) this.reserved = null;
    this.swaps.delete(p.slot);
    this.again.delete(p.slot); this.voteAt.delete(p.slot); this.game?.leaveQueue(p.pid);
    this.bravo = this.bravo.filter(b => b.slot !== p.slot);
    if (this.warm?.who.pid === p.pid) this.warm = null;
    if (this.vote) {
      const votes = { ...this.vote.votes }; delete votes[p.slot]; this.vote = { ...this.vote, votes };
    }
    if (this.game?.riddler?.slot === p.slot) {
      if (this.game.step === 'ask') this.skip(p, this.acceptedBy, now);
      else if (this.game.finish('left', now)) this.settle(now);
    } else if (this.game && this.call?.to?.slot === p.slot) this.skip(p, this.call.by, now);
    if (this.reserved?.slot === p.slot) this.reserved = null;
    if (p.action === ACT_QUIZ && (!replacement || replacement.pid === p.pid)) this.h.release(p.slot);
  }

  private advance(now: number): void {
    if (this.phase === 'idle') {
      this.warm?.tick(now);
      if (this.seatedBefore.size >= QZ.AUTO_VOTE_SEATED && !this.autoBlocked) {
        this.autoAt ??= now + QZ.AUTO_VOTE_DELAY_MS;
        if (now >= this.autoAt) this.startVote(now);
      } else this.autoAt = null;
      if (this.phase === 'idle' && !this.warm && this.members.size && this.seatedBefore.size < 2 && now - this.idleAt >= QZ.ZAT_IDLE_GAP_MS) {
        this.idleAt = now; this.say('Садитесь — сыграем!', 'talk', now);
      }
    } else if (this.phase === 'vote' && this.vote) {
      if (this.voteStep === 'ballot') {
        this.vote = syncVote(this.vote, [...this.members.values()], now, READY); this.deadline = this.vote.endsAt;
        if (now >= this.deadline) {
          this.decision = finishVote(this.vote, [...this.members.values()], this.lastPlayed, () => this.h.rand(), READY);
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
          const win = this.decision?.win ?? -1, voters = [...this.voteAt].sort((a, b) => a[1] - b[1])
            .filter(([slot]) => this.members.has(slot) && this.vote?.votes[slot] === win).map(([slot]) => this.members.get(slot)!.pid);
          this.phase = 'roles'; this.deadline = 0; this.vote = null; this.decision = null;
          this.voteAt.clear();
          this.skipped.clear(); this.lastRiddler = 0;
          const h = this.modeHost();
          if (this.mode === 'jeopardy') this.controller = new JeopardyGame(h, now, voters, this.lineSeq);
          else if (this.mode === 'croc') this.controller = new CrocGame(h, now, this.lineSeq, voters);
          else if (this.mode === 'whoofus') this.controller = new WhoOfUsGame(h, now, this.lineSeq);
          else {
            const game = new RiddleGame(this.lineSeq); this.controller = game;
            for (const pid of voters) {
              const p = [...this.members.values()].find(p => p.pid === pid); if (p) game.joinQueue(p);
              if (this.phase === 'roles') this.nextQueued(now);
            }
            if (this.phase === 'roles') this.openCall(now);
          }
          this.syncMode(now);
        }
      }
    } else if (this.phase === 'roles' || this.phase === 'game') {
      this.checkSwap(now);
      if (this.phase !== 'roles' && this.phase !== 'game') return;
      if (this.controller && !this.game) {
        if (this.phase === 'game' && this.mode === 'croc') {
          if (this.members.size < 2) this.aloneAt ??= now; else this.aloneAt = null;
          if (this.aloneAt !== null && now - this.aloneAt >= QZ.ALONE_MS) this.controller.stop?.(now, 'empty');
        }
        this.controller.tick(now); this.syncMode(now); return;
      }
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
        const event = this.controller!.tick(now); this.settle(now);
        if (event === 'askTimeout' && this.game!.riddler) this.skip(this.game!.riddler, this.acceptedBy, now);
        else if (event === 'done') { this.finishResults(now); return; }
        else if (event === 'next') {
          const result = this.game!.round?.result;
          this.lastRiddler = result?.riddler.pid ?? 0; this.skipped.clear(); this.game!.beginCall();
          const solver = result?.solver ? [...this.members.values()].find(p => p.pid === result.solver!.pid) : undefined;
          if (!this.nextQueued(now)) { if (solver) this.setCall('solver', solver, now); else this.openCall(now); }
        }
        if (this.game?.takeHurry(now)) this.say('Осталась минута!', 'talk', now);
      }
      if (this.call && now >= this.call.endsAt) {
        const target = this.call.to ? this.members.get(this.call.to.slot) : undefined;
        if (target) this.skip(target, this.call.by, now); else this.assign(now);
      }
    } else if (this.phase === 'results') {
      this.checkAgain(now);
      if (this.phase === 'results' && now >= this.deadline) {
        if (this.members.size >= 2) this.startVote(now); else this.idle(false);
      }
    }
  }

  private startVote(now: number, repeat?: QuizMode): void {
    const again = new Map(this.again); this.again.clear(); this.voteAt.clear(); this.warm = null;
    this.lineSeq = this.controller?.nextId ?? this.lineSeq;
    this.restore(); this.controller?.close(); this.controller = null; this.tokens.endGame(); this.inkPending = null; this.call = null; this.mode = null;
    this.phase = 'vote'; this.vote = createVote(now); this.deadline = this.vote.endsAt; this.voteStep = 'ballot'; this.decision = null;
    this.swaps.clear(); this.swapPending = false; this.autoAt = null; this.autoBlocked = false; this.aloneAt = null;
    this.scores.clear(); this.announcedStart = false;
    if (repeat) {
      const win = QZ_MODES.findIndex(m => m.id === repeat);
      this.mode = repeat; this.voteStep = 'win'; this.deadline = now + QZ.WIN_MS;
      this.vote = { votes: Object.fromEntries([...again.keys()].map(slot => [slot, win])), endsAt: this.deadline, closing: true };
      this.voteAt = again;
      this.decision = { ...voteView(this.vote, [...this.members.values()], READY), win, again: true, why: 'Ещё раз!' };
      this.say('Ещё разок!', 'cheer', now);
    } else this.say('Голосуем — жмите 1–4!', 'announce', now);
  }

  private voteWinner(now: number): void {
    this.voteStep = 'win'; this.deadline = now + QZ.WIN_MS;
    this.decision = { ...this.decision!, spin: null }; this.mode = QZ_MODES[this.decision.win].id;
    this.say(`Поехали! ${QZ_MODES[this.decision.win].name}!`, 'cheer', now);
  }

  private idle(blocked: boolean): void {
    this.lineSeq = this.controller?.nextId ?? this.lineSeq;
    this.restore(); this.phase = 'idle'; this.mode = null; this.deadline = 0; this.vote = null; this.decision = null;
    this.controller?.close(); this.controller = null; this.tokens.endGame(); this.inkPending = null;
    this.call = null; this.autoAt = null; this.autoBlocked = blocked; this.swaps.clear(); this.swapPending = false;
    this.again.clear(); this.voteAt.clear(); this.warm = null;
  }

  private candidates(): QuizPerson[] {
    return [...this.members.values()].filter(p => !this.skipped.has(p.pid) && (p.pid !== this.lastRiddler || this.members.size === 1));
  }

  private canTake(p: QuizPerson): boolean {
    if (this.controller && !this.game) return !this.swapPending && (this.controller.canTake?.(p.slot) ?? false);
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
    if (this.nextQueued(now)) return;
    if (by === 'solver') this.openCall(now); else this.assign(now);
  }

  private nextQueued(now: number): boolean {
    const game = this.game; if (!game) return false;
    game.syncQueue([...this.members.values()]);
    const queued = game.takeQueued(); if (!queued) return false;
    const p = [...this.members.values()].find(p => p.pid === queued.who.pid)!;
    this.call = null; this.deadline = 0; this.acceptedBy = 'zat';
    if (this.phase === 'roles') this.beginGame(now);
    game.beginAsk(p, now); this.participant(p); this.tokens.action(p.pid, now);
    if (queued.prep) {
      game.message(p, { t: 'qz', a: 'ask', ...queued.prep }, this.members.size - 1, now);
      if (game.step === 'round') this.riddleStarted(p, now);
    }
    return true;
  }

  private riddleStarted(p: QuizPerson, now: number): void {
    this.reserved = { slot: p.slot, chair: this.chair(p) < 0 ? -1 : p.arg };
    this.h.hold(p.slot, QUIZ_VENUE.first.riddler);
    this.say(`${p.nick} загадал! Тема — ${this.game!.round!.category}`, 'announce', now);
    if (!this.announcedStart) {
      this.announcedStart = true;
      const names = [...this.members.values()].slice(0, 3).map(q => q.nick).join(', ');
      this.announce(`🎤 На «Ракушке» «Загадка»: ${names}${this.members.size > 3 ? ` и ещё ${this.members.size - 3}` : ''} — приходите угадывать!`, now);
    }
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
  private canSwap(p: QuizPerson): boolean { return (this.phase === 'roles' || this.phase === 'game') && !this.swapPending && (this.chair(p) >= 0 || !!this.controller?.roleOf(p.slot)); }
  private swapNeed(): number { return Math.floor([...this.members.values()].filter(p => this.canSwap(p)).length / 2) + 1; }
  private canWarm(p: QuizPerson): boolean { return this.phase === 'idle' && !this.warm && this.members.size === 1 && this.chair(p) >= 0; }
  private canAgain(p: QuizPerson): boolean {
    if (this.phase !== 'results' || !this.mode || this.members.size < QZ_MODES.find(m => m.id === this.mode)!.min) return false;
    if (this.mode === 'whoofus' && this.seatedBefore.size < QZ_WHO.MIN) return false;
    return this.chair(p) >= 0 || this.scores.has(p.pid);
  }
  private againView(): QzView['again'] {
    const voters = [...this.members.values()].filter(p => this.canAgain(p));
    return voters.length ? { n: voters.filter(p => this.again.has(p.slot)).length, need: Math.floor(voters.length / 2) + 1 } : null;
  }
  private checkAgain(now: number): void {
    const again = this.againView();
    if (again && again.n >= again.need) this.startVote(now, this.mode!);
  }

  private checkSwap(now: number): void {
    if ((this.phase !== 'roles' && this.phase !== 'game') || this.swapPending || this.swaps.size < this.swapNeed()) return;
    this.call = null;
    if (this.controller && !this.game) {
      this.controller.stop?.(now);
      for (const event of this.controller.rewards?.() ?? []) this.reward(event, now);
      this.say('Меняем игру!', 'talk', now); this.startVote(now); return;
    }
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
    const round = this.game?.round;
    if (round && result.solver) this.reward({ kind: 'riddle', id: String(this.game!.roundStartedAt), riddler: result.riddler.pid,
      solver: result.solver.pid, duration: now - this.game!.roundStartedAt, guessers: [...this.game!.guessers], solved: result.end === 'solved' }, now);
    for (const [id, pts] of Object.entries(result.points)) {
      const pid = Number(id), player = this.scores.get(pid);
      if (!player) continue;
      player.pts += pts;
      const old = this.evening.get(pid);
      this.evening.set(pid, { slot: player.slot, nick: player.nick, pts: (old?.pts ?? 0) + pts });
    }
    this.restore(result);
    if (result.end === 'solved') {
      this.game!.firstInQueue(result.solver!.pid);
      this.say(now - this.game!.roundStartedAt < 30_000 ? 'Вот это скорость!' : zatLine(ZAT_RIDDLE_SOLVED, () => this.h.rand()), 'cheer', now);
      this.announce(`🎤 «Ракушка»: ${result.solver!.nick} разгадал загадку ${result.riddler.nick} — «${result.answer}»!`, now);
    } else if (result.end === 'timeout') this.say(zatLine(ZAT_RIDDLE_MISSED, () => this.h.rand()), 'shrug', now);
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
    this.again.clear();
    this.tokens.endGame();
    const top = this.rows(this.scores)[0];
    if (top) {
      if (cheer) this.say(this.mode === 'jeopardy' ? `Победил ${top.nick} — ${top.pts}!` : `Молодцы! Лучший — ${top.nick}`, this.mode === 'jeopardy' ? 'cheer' : 'clap', now);
      if (this.mode === 'jeopardy') this.announce(`🏆 ${top.nick} выиграл «Свою игру» (пак «${this.controller?.outcome?.pack?.title ?? ''}») — ${top.pts}`, now);
      else if (this.mode === 'whoofus') this.announce(`🏆 Самый «в теме» на «Ракушке» — ${top.nick}: ${top.pts} из 10`, now);
      else this.announce(`🏆 ${top.nick} выиграл «${QZ_MODES.find(m => m.id === this.mode)!.name}» на «Ракушке» — ${top.pts} очков`, now);
    }
  }

  private choice(slot: number): number {
    if (this.phase !== 'vote' || !this.vote) return -1;
    const m = this.vote.votes[slot];
    return voteView(this.vote, [...this.members.values()], READY).options[m]?.off === null ? m : -1;
  }

  private rows(scores: Map<number, QzScoreRow>): QzScoreRow[] { return [...scores.values()].map(p => ({ ...p })).sort((a, b) => b.pts - a.pts); }

  private base(now: number) {
    const r = this.game?.view();
    const riddle = r ? (({ lines: _lines, ...board }) => board)(r) : null;
    const vote = this.decision ?? (this.vote ? voteView(this.vote, [...this.members.values()], READY) : null);
    return { rev: this.rev, now, phase: this.phase, endsAt: this.call?.endsAt ?? (this.game?.step === 'ask' ? this.game.deadline : this.deadline),
      mode: this.mode, count: this.members.size, seated: [...this.members.values()].filter(p => this.chair(p) >= 0).length,
      vote: vote ? structuredClone(vote) : null, riddle, ...this.controller?.boardFields(),
      results: this.phase === 'results' ? { mode: this.mode!, top: this.rows(this.scores).slice(0, 3), endsAt: this.deadline,
        ...(this.controller?.outcome?.pack ? { pack: this.controller.outcome.pack } : {}),
        ...(this.controller?.outcome?.titles ? { titles: this.controller.outcome.titles } : {}) } : null,
      evening: this.rows(this.evening).slice(0, 8), titles: [...this.eveningTitles.values()].reverse().slice(0, QZ.TITLES_MAX).map(t => ({ ...t })),
      noTokens: this.members.size < QZ_HALF.PEOPLE, halfTokens: this.members.size === QZ_HALF.PEOPLE,
      warm: this.warm?.board() ?? null, zat: this.zatSay ? { ...this.zatSay } : null };
  }

  private say(text: string, clip: QzZatClip, now: number): void {
    this.zatSay = { id: ++this.zatId, text, clip, at: now };
    if (this.phase === 'game' || this.controller?.phase === 'game' && this.phase === 'roles') this.controller?.zat(text, now);
  }

  private announce(text: string, now: number): void {
    if (now - this.announceAt < QZ.ANNOUNCE_GAP_MS) return;
    this.announceAt = now; this.h.announce(text);
  }

  private error(slot: number, code: QzErrCode, text: string): void { this.h.send(slot, { t: 'qzErr', code, text }); }

  private modeHost(): ModeHost {
    return {
      people: () => [...this.members.values()].map(p => ({ ...p, chair: this.chair(p), seatedAt: this.seatedAt.get(p.pid) ?? Infinity })),
      rand: () => this.h.rand(), hold: (slot, place) => this.h.hold(slot, place),
      release: (slot, to) => { if (this.members.has(slot)) this.h.release(slot, to); },
      say: (text, clip, now) => this.say(text, clip, now), ping: slot => this.members.get(slot)?.ping ?? 0,
      packs: kind => {
        if (this.h.packs) return this.h.packs.all(kind);
        this.builtins ??= loadBuiltinPacks(undefined, text => this.h.log(text));
        return this.builtins.filter(p => p.pack.kind === kind);
      },
      store: this.h.packs, ink: msg => this.ink(msg),
      order: kind => { const o = this.orders.get(kind); return o ? { ...o, by: { ...o.by } } : null; },
      orderUsed: (kind, id) => { if (this.orders.get(kind)?.id === id) this.orders.delete(kind); },
    };
  }

  private beginGame(now: number): void {
    this.phase = 'game'; this.lastPlayed[this.mode!] = now; this.tokens.startGame(now);
    if (this.mode !== 'riddle') {
      const names = [...this.members.values()].slice(0, 3).map(p => p.nick).join(', ');
      this.announce(`🎤 На «Ракушке» «${QZ_MODES.find(m => m.id === this.mode)!.name}»: ${names}${this.members.size > 3 ? ` и ещё ${this.members.size - 3}` : ''} — приходите угадывать!`, now);
    }
  }

  private modeMessage(p: QuizPerson, msg: QuizClientMsg, now: number): void {
    const c = this.controller; if (!c || this.swapPending || (this.phase !== 'roles' && this.phase !== 'game')) return;
    const error = c.message(p, msg, this.members.size - 1, now);
    if (error) this.h.send(p.slot, { t: 'qzErr', ...error });
    this.syncMode(now);
    if (c.accepted && this.phase === 'game') this.tokens.action(p.pid, now);
  }

  private syncMode(now: number): void {
    const c = this.controller;
    if (!c || this.game || (this.phase !== 'roles' && this.phase !== 'game')) return;
    if (c.phase === 'idle') { this.idle(true); return; }
    if (this.phase === 'roles' && c.phase === 'game') this.beginGame(now);
    if (c instanceof WhoOfUsGame) for (const { pid, ...title } of c.takeTitles()) {
      this.eveningTitles.delete(pid); this.eveningTitles.set(pid, title);
    }
    this.call = c.call ?? null; this.deadline = c.deadline ?? 0;
    for (const event of c.rewards?.() ?? []) this.reward(event, now);
    if (!c.outcome) return;
    this.scores.clear();
    for (const p of c.outcome.players) this.scores.set(p.pid, { slot: p.slot, nick: p.nick, pts: p.pts });
    if (c.outcome.completed) {
      const ranked = quizPlaces(c.outcome.players.map(p => ({ pid: p.pid, score: p.pts })));
      for (const p of ranked) {
        const row = this.scores.get(p.pid)!, pts = this.mode === 'jeopardy' ? [5, 3, 2][p.place - 1] ?? 0 : p.score;
        this.evening.set(p.pid, { ...row, pts: (this.evening.get(p.pid)?.pts ?? 0) + pts });
      }
    }
    this.finishResults(now);
  }

  private insidePids(): number[] { return [...this.members.values()].map(p => p.pid); }
  private pay(awards: QuizAward[]): void {
    for (const a of awards) {
      if (a.n) {
        const p = [...this.h.people()].find(p => p.pid === a.pid);
        this.h.credit?.(p?.slot ?? 0, a.n, a.pid);
      }
      this.h.saveStats?.(a.pid, a.stats);
    }
  }
  private reward(event: QuizRewardEvent, now: number): void {
    this.pay(this.tokens.event(event, this.insidePids(), now));
    const pids = event.kind === 'riddle' ? [event.riddler, event.solver] : event.kind === 'crocTurn' ? [event.drawer, ...event.guessed]
      : [...event.players.map(p => p.pid), ...(event.kind === 'jeopardy' && event.host ? [event.host] : []), ...(event.kind === 'whoofus' ? event.titles : [])];
    for (const pid of new Set(pids)) this.h.saveStats?.(pid, this.tokens.stats(pid, now));
  }

  private catalog(p: QuizPerson, msg: QuizClientMsg, now: number): boolean {
    if (!['packs', 'packOutline', 'packDel', 'packLike', 'packPlay', 'upTicket', 'recs'].includes(msg.a)) return false;
    try {
      const packs = this.h.packs;
      switch (msg.a) {
        case 'packs': this.h.send(p.slot, { t: 'qzPacks', ...(packs?.list(p.pid, msg.q, msg.kind) ?? { list: [], total: 0, admin: false }) }); break;
        case 'packOutline': {
          const outline = packs?.outline(msg.id, p.pid);
          if (!outline) throw new PackError('Пак не найден.', 404);
          this.h.send(p.slot, { t: 'qzPackOutline', outline }); break;
        }
        case 'packDel':
          if (!packs) throw new PackError('Паки пока недоступны.', 404);
          packs.delete(msg.id, p.pid); this.h.send(p.slot, { t: 'qzPacks', ...packs.list(p.pid) });
          for (const [kind, o] of this.orders) if (o.id === msg.id) this.orders.delete(kind);
          break;
        case 'packPlay': {
          const pack = packs?.get(msg.id), game = pack ? ORDER_GAME[pack.kind] : undefined;
          if (!pack) throw new PackError('Пак не найден.', 404);
          if (!game) throw new PackError('Этот пак нельзя заказать.');
          this.orders.set(pack.kind, { id: msg.id, title: pack.title, kind: pack.kind, by: { slot: p.slot, nick: p.nick }, at: now });
          this.h.toast(p.slot, `Заказан «${pack.title}» — будет в следующей игре «${game}»`); break;
        }
        case 'packLike':
          if (!packs) throw new PackError('Паки пока недоступны.', 404);
          packs.like(msg.id, p.pid); this.h.send(p.slot, { t: 'qzPacks', ...packs.list(p.pid) }); break;
        case 'upTicket':
          if (!this.h.http) throw new PackError('Паки пока недоступны.', 404);
          this.h.send(p.slot, { t: 'qzTicket', ...this.h.http.ticket(p.pid, p.level ?? 1, p.nick) }); break;
        case 'recs': {
          if (now - (this.recsAt.get(p.pid) ?? -Infinity) < 2000) break;
          this.recsAt.set(p.pid, now);
          const profiles = (this.h.profiles?.() ?? []).map(pr => ({ slot: [...this.h.people()].find(w => w.pid === pr.pid)?.slot ?? 0, nick: pr.nick, stats: pr.stats }));
          this.h.send(p.slot, { t: 'qzRecs', me: quizMyRecords(this.tokens.stats(p.pid, now), now), top: quizTopRecords(profiles) }); break;
        }
      }
    } catch (e) {
      const code: QzErrCode = msg.a === 'upTicket' && e instanceof PackError ? e.status === 403 ? 'level' : e.status === 429 || e.status === 413 ? 'limit' : 'pack' : 'pack';
      this.error(p.slot, code, e instanceof PackError ? e.message : 'Паки пока недоступны.');
      if (!(e instanceof PackError)) this.h.log('quiz: не удалось прочитать каталог паков');
    }
    return true;
  }

  private ink(msg: Extract<QuizServerMsg, { t: 'qzInk' }>): void {
    if (msg.full) { this.inkPending = null; this.inkFull.clear(); this.inkAt = this.h.now(); this.h.sendLobby(msg); return; }
    for (const p of this.members.values()) this.h.send(p.slot, msg);
    if (!this.inkPending || this.inkPending.d !== msg.d) this.inkPending = { d: msg.d, ops: [] };
    this.inkPending.ops.push(...msg.ops);
  }
  private flushInk(now: number): void {
    if (!this.inkPending || now - this.inkAt < QZ_CROC.INK_OUTSIDE_MS) return;
    const batch = this.inkPending;
    for (const p of this.h.people()) if (!this.members.has(p.slot)) {
      const full = this.inkFull.get(p.slot), skip = full?.pid === p.pid && full.d === batch.d ? full.skip : 0;
      const ops = batch.ops.slice(skip);
      if (ops.length) this.h.send(p.slot, { t: 'qzInk', d: batch.d, ops });
    }
    this.inkPending = null; this.inkFull.clear(); this.inkAt = now;
  }

  private flush(now: number): void {
    const view = this.view(), board = this.board();
    const fullKey = JSON.stringify({ ...view, rev: 0, now: 0 }), boardKey = JSON.stringify({ ...board, rev: 0, now: 0 });
    const personal = new Map([...this.members.keys()].map(slot => [slot, this.me(slot)!]));
    const views = new Map([...this.members.keys()].map(slot => [slot, this.view(slot)]));
    const stateKey = fullKey + JSON.stringify([...personal.values()]) + JSON.stringify([...views.values()].map(v => ({ ...v, now: 0, rev: 0 })));
    if (stateKey !== this.stateKey) { this.stateKey = stateKey; this.rev++; }
    view.rev = board.rev = this.rev;
    const lobby = [...this.h.people()];
    for (const p of lobby) {
      const me = personal.get(p.slot), inside = !!me, old = this.sent.get(p.slot);
      const ownView = views.get(p.slot) ?? null;
      if (ownView) ownView.rev = this.rev;
      const key = inside ? JSON.stringify({ ...ownView, rev: 0, now: 0 }) + JSON.stringify(me) : boardKey;
      const transition = !old || old.pid !== p.pid || old.inside !== inside;
      if (!transition && (old.key === key || now - old.at < QZ.SNAP_MIN_MS)) continue;
      this.h.send(p.slot, me ? { t: 'qz', v: ownView!, me } : { t: 'qzBoard', b: board });
      if (transition && this.controller?.fullInk) {
        const full = this.controller.fullInk(); this.h.send(p.slot, full);
        this.inkFull.set(p.slot, { pid: p.pid, d: full.d, skip: this.inkPending?.d === full.d ? this.inkPending.ops.length : 0 });
      }
      this.sent.set(p.slot, { pid: p.pid, inside, key, at: now });
    }
    const slots = new Set(lobby.map(p => p.slot));
    for (const slot of this.sent.keys()) if (!slots.has(slot)) this.sent.delete(slot);
  }
}
