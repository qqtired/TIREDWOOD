// Голосование «выгнать игрока» (votekick, меню Tab): одно на весь сервер. Правило и числа — shared/votekick.ts.
// Голосуют все, кто был в игре на начало, кроме того, кого выгоняют; инициатор сразу «за». Итог — через KICK_VOTE_MS
// или раньше, когда проголосовали все или исход уже не изменится. Выгнанного отключаем с понятным сообщением и не
// пускаем KICK_BAN_MS — по профилю и по IP (в памяти сервера; кто в момент кика играл с того же IP — не задет: друзья
// в одной сети или офисе остаются).
import {
  KICK_BAN_MS, KICK_COOLDOWN_MS, KICK_MIN_ONLINE, KICK_VOTE_MS, kickedText, kickOutcome, kickWait,
  type KickClientMsg, type KickMe, type KickResult, type KickVoteView,
} from '../shared/votekick.ts';
import type { Client } from './hub.ts';

/** Что голосованию нужно от хаба */
export interface KickHost {
  now(): number;
  /** Кто сейчас в игре: с профилем, не служебный вход, в комнате (как в «кто где») */
  online(): Client[];
  /** Подключённый игрок по номеру профиля */
  clientOf(pid: number): Client | undefined;
  /** Строка в общий чат всем */
  announce(text: string): void;
  toast(c: Client, text: string): void;
  /** Отключить выгнанного: сообщение, закрытие, выход из комнаты */
  kickOut(c: Client, text: string): void;
  /** Ограничение частоты сообщений: false — слишком часто */
  allow(key: string, n: number, ms: number): boolean;
  log(s: string): void;
}

interface Vote {
  id: number;
  /** Кого выгоняют: профиль, ник и IP на начало (если уйдёт сам — бан всё равно по ним) */
  pid: number;
  nick: string;
  ip: string;
  by: string;
  end: number;
  /** Кто вправе голосовать: все в игре на начало, кроме выгоняемого */
  voters: Set<number>;
  ballots: Map<number, boolean>;
}

interface Count { yes: number; no: number; pending: number }

export class KickVotes {
  readonly enabled: boolean;
  private readonly host: KickHost;
  private vote: Vote | null = null;
  private nextId = 1;
  /** Кто когда последний раз начинал голосование */
  private readonly startedAt = new Map<number, number>();
  private readonly bannedPid = new Map<number, number>();
  private readonly bannedIp = new Map<string, { until: number; keep: Set<number> }>();

  constructor(host: KickHost, enabled: boolean) {
    this.host = host;
    this.enabled = enabled;
  }

  /** Идёт голосование */
  get active(): boolean {
    return this.vote !== null;
  }

  /** Сколько мс ещё нельзя войти: 0 — можно. pid 0 — профиль ещё не известен (новый ключ) */
  banLeft(ip: string, pid: number): number {
    if (!this.enabled) return 0;
    const now = this.host.now();
    let left = 0;
    const until = pid > 0 ? this.bannedPid.get(pid) : undefined;
    if (until !== undefined) {
      if (until > now) left = until - now;
      else this.bannedPid.delete(pid);
    }
    const b = ip ? this.bannedIp.get(ip) : undefined;
    if (b) {
      if (b.until <= now) this.bannedIp.delete(ip);
      else if (!(pid > 0 && b.keep.has(pid))) left = Math.max(left, b.until - now);
    }
    return left;
  }

  /** Вход отклонён: выгнан и срок не вышел */
  refuse(c: Client, left: number, who: string): void {
    this.host.log(`[вход] отказ: ${who} выгнан голосованием, ещё ${kickWait(left)}`);
    c.sink.sendJson({ t: 'error', code: 'kicked', text: kickedText(left) });
    c.sink.close(4004, 'kicked');
  }

  onMessage(c: Client, msg: KickClientMsg): void {
    if (!this.enabled || !c.profile || c.ephemeral || !this.host.allow(`kick:${c.pid}`, 8, 10_000)) return;
    if (msg.a === 'start') this.start(c, msg.pid);
    else if (msg.a === 'vote') this.cast(c, msg.yes);
  }

  /** Вошёл в игру: голосование включено и что сейчас идёт */
  joined(c: Client): void {
    if (!this.enabled || c.ephemeral) return;
    this.step();
    c.sink.sendJson({ t: 'kickVote', v: this.view(c), on: 1 });
  }

  /** Кто-то вышел из игры: не проголосовавший больше не ждём — может, итог уже ясен */
  left(): void {
    if (this.vote && !this.decide()) this.broadcast();
  }

  /** Каждый тик хаба: время вышло — итог */
  step(): void {
    const v = this.vote;
    if (v && this.host.now() >= v.end) this.decide();
  }

  private start(c: Client, pid: unknown): void {
    if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) return;
    this.step();
    if (this.vote) {
      this.host.toast(c, 'Уже идёт голосование — дождись итога');
      return;
    }
    if (pid === c.pid) {
      this.host.toast(c, 'Себя выгнать нельзя 🙂');
      return;
    }
    const online = this.host.online();
    const target = this.host.clientOf(pid);
    if (!target || !online.includes(target)) {
      this.host.toast(c, 'Этого игрока уже нет в игре');
      return;
    }
    if (online.length < KICK_MIN_ONLINE) {
      this.host.toast(c, `Голосовать можно, когда в игре хотя бы ${KICK_MIN_ONLINE} ${people(KICK_MIN_ONLINE)}`);
      return;
    }
    const now = this.host.now();
    const last = this.startedAt.get(c.pid);
    if (last !== undefined && now - last < KICK_COOLDOWN_MS) {
      this.host.toast(c, `Предложить снова можно через ${kickWait(KICK_COOLDOWN_MS - (now - last))}`);
      return;
    }
    this.sweep(now);
    this.startedAt.set(c.pid, now);
    const voters = new Set<number>();
    for (const o of online) if (o.pid !== pid) voters.add(o.pid);
    this.vote = { id: this.nextId++, pid, nick: target.nick, ip: target.ip, by: c.nick, end: now + KICK_VOTE_MS, voters, ballots: new Map([[c.pid, true]]) };
    this.host.log(`[голосование] ${c.nick} (#${c.pid}) предлагает выгнать ${target.nick} (#${pid}); голосуют ${voters.size}`);
    this.host.announce(`👢 ${c.nick} предлагает выгнать ${target.nick} — голосование ${Math.round(KICK_VOTE_MS / 1000)} с: Y — за, N — против`);
    if (!this.decide()) this.broadcast();
  }

  private cast(c: Client, yes: unknown): void {
    const v = this.vote;
    if (!v || typeof yes !== 'boolean' || !v.voters.has(c.pid) || v.ballots.has(c.pid)) return;
    v.ballots.set(c.pid, yes);
    if (!this.decide()) this.broadcast();
  }

  /** Ещё может проголосовать: из голосующих, в игре, ещё не голосовал */
  private count(v: Vote): Count {
    let yes = 0;
    let no = 0;
    let pending = 0;
    for (const b of v.ballots.values()) if (b) yes++; else no++;
    for (const pid of v.voters) {
      if (v.ballots.has(pid)) continue;
      const c = this.host.clientOf(pid);
      if (c && !c.closed && c.room) pending++;
    }
    return { yes, no, pending };
  }

  /** Итог ясен — подвести; true — голосование кончилось */
  private decide(): boolean {
    const v = this.vote;
    if (!v) return false;
    const n = this.count(v);
    const out = kickOutcome(n.yes, n.no, n.pending, this.host.now() >= v.end);
    if (!out) return false;
    this.finish(v, out === 'kick', n);
    return true;
  }

  private finish(v: Vote, kicked: boolean, n: Count): void {
    this.vote = null;
    const score = `за ${n.yes}, против ${n.no}`;
    this.host.log(`[голосование] итог: ${v.nick} (#${v.pid}) ${kicked ? 'выгнан' : 'остаётся'} (${score})`);
    const end: KickResult = { pid: v.pid, nick: v.nick, kicked, yes: n.yes, no: n.no };
    if (kicked) {
      const until = this.host.now() + KICK_BAN_MS;
      const target = this.host.clientOf(v.pid);
      this.bannedPid.set(v.pid, until);
      const ip = target?.ip || v.ip;
      if (ip) {
        const keep = new Set<number>();
        for (const o of this.host.online()) if (o.ip === ip && o.pid !== v.pid) keep.add(o.pid);
        this.bannedIp.set(ip, { until, keep });
      }
      this.host.announce(`👢 ${v.nick} выгнан голосованием на ${kickWait(KICK_BAN_MS)} (${score})`);
      if (target) this.host.kickOut(target, kickedText(KICK_BAN_MS, score));
    } else {
      this.host.announce(`👢 ${v.nick} остаётся: голосование не прошло (${score})`);
    }
    for (const c of this.host.online()) c.sink.sendJson({ t: 'kickVote', v: null, end });
  }

  private view(c: Client, n = this.vote ? this.count(this.vote) : null): KickVoteView | null {
    const v = this.vote;
    if (!v || !n) return null;
    const b = v.ballots.get(c.pid);
    const me: KickMe = b === true ? 'yes' : b === false ? 'no' : v.voters.has(c.pid) ? 'can' : 'out';
    return { id: v.id, pid: v.pid, nick: v.nick, by: v.by, yes: n.yes, no: n.no, voters: n.yes + n.no + n.pending, left: Math.max(0, v.end - this.host.now()), me };
  }

  private broadcast(): void {
    const v = this.vote;
    if (!v) return;
    const n = this.count(v);
    for (const c of this.host.online()) c.sink.sendJson({ t: 'kickVote', v: this.view(c, n) });
  }

  /** Забыть истёкшее: баны, давние запуски */
  private sweep(now: number): void {
    for (const [pid, until] of this.bannedPid) if (until <= now) this.bannedPid.delete(pid);
    for (const [ip, b] of this.bannedIp) if (b.until <= now) this.bannedIp.delete(ip);
    for (const [pid, at] of this.startedAt) if (now - at >= KICK_COOLDOWN_MS) this.startedAt.delete(pid);
  }
}

function people(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'человек';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'человека';
  return 'человек';
}
