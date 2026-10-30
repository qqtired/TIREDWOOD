import { newJeopardy, newJeopardyRoles, reduceJeopardy, reduceJeopardyRoles, jeopardyBoard, jeopardyView, jeopardyMe,
  type JeopardyState, type JeopardyRoles, type JeopardyAction } from '../../../shared/quiz/jeopardy.ts';
import type { QuizClientMsg } from '../../../shared/quiz/net.ts';
import type { RiddleWho } from '../../../shared/quiz/riddle.ts';
import { QZ, QZ_JP as JP, type QzCall } from '../../../shared/quiz/types.ts';
import { QUIZ_VENUE as V } from '../../../shared/quiz/venue.ts';
import { publicWho, type ModeHost, type ModeResult, type ModeError, type QuizController } from './controller.ts';
import type { QuizRewardEvent } from './tokens.ts';

export class JeopardyGame implements QuizController {
  readonly mode = 'jeopardy';
  phase: 'roles' | 'game' | 'idle' = 'roles';
  accepted = false;
  nextId: number;
  outcome: ModeResult | null = null;
  private h: ModeHost;
  private roles: JeopardyRoles;
  private state: JeopardyState | null = null;
  private held = new Map<number, { slot: number; place: number }>();
  private events: QuizRewardEvent[] = [];
  private packId: string | null = null;
  private packPlayed = false;
  private optionLocks = new Set<string>();
  private actors = new Map<number, RiddleWho>();
  private presenceKey = '';

  constructor(h: ModeHost, now: number, voters: number[], nextId: number) {
    this.h = h; this.nextId = nextId; this.roles = newJeopardyRoles(now, voters);
    const people = h.people(), players = [...new Set(voters)].flatMap(pid => people.filter(p => p.pid === pid)).slice(0, JP.PLAYERS_MAX);
    if (players.length >= JP.PLAYERS_MIN) this.start(players, null, now);
    else h.say('Кто ведёт? Кто играет? Жмите!', 'announce', now);
  }
  get deadline(): number { return this.state?.endsAt ?? this.roles.endsAt; }
  get call(): QzCall | null {
    return this.phase === 'roles' ? { role: 'host', roles: ['host', 'player'], by: 'open', to: null,
      taken: [...this.roles.taken.filter(p => this.roles.voters.includes(p.pid)), ...this.roles.taken.filter(p => !this.roles.voters.includes(p.pid))]
        .slice(0, JP.PLAYERS_MAX).map(publicWho), endsAt: this.roles.endsAt } : null;
  }
  canTake(slot: number): boolean { return this.phase === 'roles' && this.h.people().some(p => p.slot === slot); }
  roleOf(slot: number) {
    const host = this.state ? this.state.host : this.roles.host;
    if (host?.slot === slot) return 'host' as const;
    if (this.state?.players.some(p => p.slot === slot && !p.away)) return 'player' as const;
    return '' as const;
  }
  pults(): number[] { return this.outcome ? [] : this.state?.players.map(p => p.pult) ?? []; }
  gapUntil(pid: number): number { return this.state?.gaps[pid] ?? 0; }
  boardFields() { return { jp: this.state ? jeopardyBoard(this.state) : null }; }
  viewFields(slot: number) { return { jp: this.state ? jeopardyView(this.state, slot) : null }; }
  meFields(slot: number, now: number) { return this.state ? { jp: jeopardyMe(this.state, slot, now) } : {}; }
  rewards(): QuizRewardEvent[] { const es = this.events; this.events = []; return es; }

  presence(now: number): void {
    const people = this.h.people();
    const key = JSON.stringify(people.map(p => [p.pid, p.slot, p.nick]));
    if (key === this.presenceKey) return;
    this.presenceKey = key;
    if (this.state) this.apply({ a: 'presence', people }, now);
    else {
      for (const p of [...this.roles.taken, ...(this.roles.host ? [this.roles.host] : [])]) {
        if (!people.some(w => w.pid === p.pid)) this.roles = reduceJeopardyRoles(this.roles, { a: 'left', pid: p.pid }, now);
      }
      this.syncPlaces();
    }
  }
  tick(now: number): 'done' | null {
    if (this.state) this.apply({ a: 'tick' }, now);
    else {
      const attempt = this.roles.attempt;
      this.roles = reduceJeopardyRoles(this.roles, { a: 'tick' }, now);
      if (this.roles.attempt !== attempt) this.h.say('Нужен ещё игрок', 'announce', now);
      if (this.roles.step === 'idle') {
        this.phase = 'idle'; this.close(); this.h.say('Не набралось игроков', 'shrug', now);
      } else if (this.roles.step !== 'roles') {
        this.start(this.roles.players, this.roles.host, now);
      }
    }
    return this.outcome ? 'done' : null;
  }
  message(who: RiddleWho, msg: QuizClientMsg, _guessers: number, now: number): ModeError | undefined {
    this.accepted = false;
    if (msg.a === 'role' && this.phase === 'roles') {
      const r = msg.r ?? 'host'; if (r !== 'host' && r !== 'player') return;
      const before = JSON.stringify(this.roles);
      this.roles = reduceJeopardyRoles(this.roles, { a: 'role', who, r, take: msg.take }, now);
      this.accepted = before !== JSON.stringify(this.roles); this.syncPlaces(); return;
    }
    if (!this.state || this.outcome) return;
    let action: JeopardyAction;
    const slot = who.slot;
    switch (msg.a) {
      case 'role':
        if (msg.r !== 'host' || !msg.take) return;
        action = { a: 'host', who }; break;
      case 'jpStart':
        if (this.state.host?.slot !== slot || this.state.step !== 'setup') return;
        this.state.pool = this.h.packs('jeopardy');
        if (!this.state.pool.some(p => p.id === msg.pack)) return { code: 'pack', text: 'Пак не найден.' };
        action = { ...msg, slot }; break;
      case 'jpGive': case 'jpSeat': case 'jpFjudge': action = { ...msg, slot, target: msg.slot }; break;
      case 'jpBuzz': action = { a: 'jpBuzz', slot, ping: this.h.ping(slot) }; break;
      case 'jpZat': case 'jpOpen': case 'jpMore': case 'jpShow': case 'jpEnd': case 'jpDispute':
      case 'jpPv': case 'jpPick': case 'jpAns': case 'jpFans': case 'say': case 'jpJudge': case 'jpDv': case 'jpDrop': case 'jpBet':
        action = { ...msg, slot }; break;
      default: return;
    }
    return this.apply(action, now, true);
  }
  use(slot: number, place: number, now: number): ModeError | undefined {
    const who = this.h.people().find(p => p.slot === slot); if (!who) return;
    if (place === V.first.podium) return this.message(who, { t: 'qz', a: 'role', take: true, r: 'host' }, 0, now);
    if (this.state && !this.outcome && place >= V.first.pult && place < V.first.pult + V.pults.length) {
      const pult = place - V.first.pult, p = this.state.players.find(p => p.pult === pult);
      if (p && p.pid !== who.pid) return { code: 'seat', text: 'Место занято' };
      return this.apply({ a: 'seat', who, pult }, now);
    }
  }
  stood(slot: number, now: number): boolean {
    if (this.state?.host?.slot === slot) this.apply({ a: 'presence', people: this.h.people().filter(p => p.slot !== slot) }, now);
    else if (this.state) this.apply({ a: 'away', slot }, now);
    else if (this.roles.host?.slot === slot) {
      this.roles = reduceJeopardyRoles(this.roles, { a: 'left', pid: this.roles.host.pid }, now); this.syncPlaces();
    }
    return true;
  }
  stop(now: number): void { if (this.state) this.apply({ a: 'stop' }, now); this.close(); }
  close(): void {
    for (const [pid, held] of this.held) if (this.h.people().some(p => p.pid === pid && p.slot === held.slot)) this.h.release(held.slot, V.back);
    this.held.clear(); this.unlockPack();
    for (const id of this.optionLocks) this.h.store?.setPlaying(id, false);
    this.optionLocks.clear();
  }
  zat(text: string, now: number): void {
    if (!this.state) return;
    this.state.lines.push({ id: this.state.nextId++, slot: 0, nick: 'Затейник', text, at: now, kind: 'zat', mark: '', markedAt: 0 });
    this.state.lines = this.state.lines.slice(-QZ.LINES_KEEP); this.nextId = this.state.nextId;
  }
  private key(s: JeopardyState): string {
    const { pool: _pool, options: _options, pack: _pack, round: _round, ...rest } = s;
    return JSON.stringify(rest);
  }
  private start(players: RiddleWho[], host: RiddleWho | null, now: number): void {
    this.phase = 'game';
    this.state = newJeopardy({ players, host, packs: this.h.packs('jeopardy'), people: this.h.people(), order: this.h.order?.('jeopardy') }, now, this.h.rand);
    this.state.nextId = this.nextId; this.lockOptions();
    if (this.state.step === 'packvote') this.h.say('Выбираем пак — жмите 1–3!', 'announce', now);
    this.syncPlaces(); this.finish();
  }
  private apply(action: JeopardyAction, now: number, input = false): ModeError | undefined {
    const old = this.state!;
    if (old.step === 'setup' && (now >= old.endsAt || action.a === 'jpZat' || action.a === 'presence')) {
      // В setup паки не заблокированы: перед новым голосованием перечитываем каталог и заказ.
      old.pool = this.h.packs('jeopardy'); old.order = this.h.order?.('jeopardy') ?? null;
    }
    const { state: s, error } = reduceJeopardy(old, action, now, this.h.rand);
    this.state = s; this.nextId = s.nextId;
    if (input) this.accepted = !error && this.key(old) !== this.key(s);
    if (s.pack && s.pack.id !== this.packId) { this.unlockPack(); this.packId = s.pack.id; this.h.store?.setPlaying(s.pack.id, true); }
    this.lockOptions();
    if (s.played && !this.packPlayed && this.packId) {
      this.packPlayed = true; this.h.store?.played(this.packId); this.h.orderUsed?.('jeopardy', this.packId);
    }
    this.syncPlaces();
    if (!old.host && s.host) this.h.say(`${s.host.nick} ведёт!`, 'point', now);
    if (old.host && !s.host) this.h.say('Затейник подхватил игру!', 'cheer', now);
    if (s.step === 'packvote' && old.step !== s.step) this.h.say('Выбираем пак — жмите 1–3!', 'announce', now);
    if (!old.pack && s.pack) this.h.say(`Первый ход — ${s.players.find(p => p.slot === s.turn)?.nick ?? ''}!`, 'point', now);
    if (s.used.length > old.used.length && s.current) this.h.say(s.step === 'cat' ? 'Кот в мешке! Кому отдашь?' : `${s.current.theme} за ${s.current.question.price}!`, s.step === 'cat' ? 'point' : 'talk', now);
    if (s.verdict === 'yes' && old.verdict !== 'yes') this.h.say(['Верно!', 'Браво!', 'Точно в цель!'][Math.min(2, Math.floor(this.h.rand() * 3))], 'clap', now);
    else if (s.out.length > old.out.length) this.h.say(['Мимо!', 'Эх, нет'][Math.min(1, Math.floor(this.h.rand() * 2))], 'shrug', now);
    if (s.step === 'reveal' && old.step !== 'reveal' && !s.verdict) this.h.say('Эх, никто не знает…', 'shrug', now);
    if (!old.fin && s.fin) this.h.say('Финал! Убираем темы', 'announce', now);
    this.finish(); return error;
  }
  private syncPlaces(): void {
    const wanted = new Map<number, { slot: number; place: number }>();
    const host = this.state ? this.state.host : this.roles.host;
    if (!this.outcome) {
      if (host) wanted.set(host.pid, { slot: host.slot, place: V.first.podium });
      for (const p of this.state?.players ?? []) if (!p.away) wanted.set(p.pid, { slot: p.slot, place: V.first.pult + p.pult });
    }
    for (const [pid, p] of this.held) if ((!wanted.has(pid) || wanted.get(pid)!.slot !== p.slot) && this.h.people().some(w => w.pid === pid && w.slot === p.slot)) this.h.release(p.slot, V.back);
    for (const [pid, p] of wanted) {
      if (this.held.get(pid)?.place !== p.place || this.held.get(pid)?.slot !== p.slot) this.h.hold(p.slot, p.place);
      const actor = this.h.people().find(p => p.pid === pid); if (actor) this.actors.set(pid, { ...actor });
    }
    this.held = wanted;
  }
  private unlockPack(): void {
    if (this.packId) this.h.store?.setPlaying(this.packId, false, this.packPlayed ? [...this.actors.keys()] : []);
    this.packId = null;
  }
  private lockOptions(): void {
    const wanted = new Set(this.state?.step === 'packvote' ? this.state.options.map(p => p.id) : []);
    for (const id of this.optionLocks) if (!wanted.has(id) && id !== this.packId) this.h.store?.setPlaying(id, false);
    for (const id of wanted) if (!this.optionLocks.has(id)) this.h.store?.setPlaying(id, true);
    this.optionLocks = wanted;
  }
  private finish(): void {
    const r = this.state?.result; if (!r || this.outcome) return;
    this.outcome = { players: r.players.map(p => ({ ...p, pts: p.score })), completed: r.completed,
      ...(this.state?.pack ? { pack: { id: this.state.pack.id, title: this.state.pack.pack.title } } : {}) };
    this.events.push({ kind: 'jeopardy', id: 'game', players: r.players.map(p => ({ pid: p.pid, score: p.score })), host: r.host?.pid ?? null, completed: r.completed });
    this.close();
  }
}
