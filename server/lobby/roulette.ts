// Рулетка рыбака (fisheco, флаг сервера ROULETTE): стол у ROULETTE_SPOT. Ставка — весь улов из рюкзака на цвет; первая
// ставка открывает приём на 10 с (все у стола поставили — крутим сразу), колесо крутится 7 с у всех на глазах, число —
// crypto.randomInt на сервере. Улов уходит в залог профиля и пишется на диск; выплата — жетонами при остановке колеса,
// даже если игрок ушёл; после аварийного рестарта залог возвращается жетонами (server/profiles.ts). Табло на баркасе:
// последние ROULETTE_LOG_SIZE ставок с итогом держим в памяти; их получает (и тост о розыгрыше) только тот, кто стоит
// на баркасе, — сразу при выходе на палубу и после каждого розыгрыша.
import { randomInt } from 'node:crypto';
import { ROULETTE_SPOT } from '../../shared/fishplaces.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import {
  ROULETTE_ANNOUNCE, ROULETTE_COLOR_NAMES, ROULETTE_OPEN_MS, ROULETTE_SPIN_MS, isRouletteColor, pushRouletteLog, roulettePayout, rouletteColor,
  type RouletteBetView, type RouletteLogRow, type RouletteView,
} from '../../shared/roulette.ts';
import type { Profiles } from '../profiles.ts';
import type { Profile } from '../store.ts';

export interface RouletteWho {
  pid: number;
  nick: string;
  profile: Profile;
  x: number;
  y: number;
  z: number;
}

export interface RouletteHost {
  now(): number;
  /** Кто стоит у стола (живые игроки с профилем) — крутим, когда все они поставили */
  nearby(): RouletteWho[];
  send(pid: number, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
  toast(pid: number, text: string): void;
  announce(text: string): void;
  /** Жетоны или рюкзак поменялись */
  changed(pid: number): void;
  /** Кто сейчас стоит на баркасе (shared/roulette.ts onBarkas): id — стабильный номер соединения, send — письмо ему одному */
  aboard(): Array<{ id: number; send(msg: ServerMsg): void }>;
}

/** Стоит ли у стола */
export function atRoulette(x: number, y: number, z: number): boolean {
  return Math.hypot(x - ROULETTE_SPOT.x, z - ROULETTE_SPOT.z) <= ROULETTE_SPOT.r + .5 && Math.abs(y - ROULETTE_SPOT.y) < 2;
}

/** Улов, который уходит на стол: рыба и её цена (ничего не стоит — ставить нечего) */
function bagStake(profile: Profile): number {
  let sum = 0;
  for (const f of profile.fishing.bag) sum += f.p;
  return sum;
}

interface Bet extends RouletteBetView {
  round: string;
}

const fmt = new Intl.NumberFormat('ru-RU');

export class RouletteTable {
  /** Число 0…36 (в тестах подменяется) */
  spin: () => number = () => randomInt(37);
  private readonly host: RouletteHost;
  private readonly profiles: Profiles;
  private phase: RouletteView['phase'] = 'idle';
  private until = 0;
  private round = 0;
  private bets: Bet[] = [];
  private n: number | undefined;
  /** Табло: последние ставки с итогом, свежие сверху */
  private log: RouletteLogRow[] = [];
  /** Кто был на баркасе в прошлый тик (и пустой набор под следующий): вышедшему на палубу отдаём табло один раз */
  private aboard = new Set<number>();
  private aboardNext = new Set<number>();
  private readonly tag = `${Date.now().toString(36)}-${randomInt(1 << 30).toString(36)}`;

  constructor(host: RouletteHost, profiles: Profiles) {
    this.host = host;
    this.profiles = profiles;
  }

  /** Идёт ли раунд (приём ставок или вращение): комнату надо шагать, даже если в ней никого нет, — иначе ставки зависнут */
  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /** Последние ставки с итогом для табло (свежие сверху) */
  history(): readonly RouletteLogRow[] {
    return this.log;
  }

  view(): RouletteView {
    return {
      phase: this.phase, left: this.phase === 'idle' ? 0 : Math.max(0, this.until - this.host.now()), round: this.round,
      bets: this.bets.map(({ pid, nick, c, stake, fish }) => ({ pid, nick, c, stake, fish })), ...(this.n !== undefined ? { n: this.n } : {}),
    };
  }

  /** Весь улов — на цвет c */
  bet(who: RouletteWho, c: unknown): void {
    const fail = (text: string): void => this.host.toast(who.pid, text);
    if (!isRouletteColor(c)) return;
    if (!atRoulette(who.x, who.y, who.z)) return fail('Подойди к столу рулетки');
    if (this.phase === 'spin') return fail('Колесо уже крутится — дождись следующего раунда');
    if (this.bets.some((b) => b.pid === who.pid)) return fail('Ты уже поставил в этом раунде');
    if (who.profile.rouletteEscrow) return fail('Твоя прошлая ставка ещё не рассчитана');
    if (!who.profile.fishing.bag.length) return fail('Рюкзак пуст — ставить нечего');
    if (bagStake(who.profile) <= 0) return fail('Твой улов ничего не стоит — ставить нечего');
    if (this.phase === 'idle') {
      this.round++;
      this.n = undefined;
    }
    const round = `${this.tag}-${this.round}`;
    const r = this.profiles.reserveRoulette(who.profile, round);
    if (!r) return fail('Ставка не принята');
    this.bets.push({ pid: who.pid, nick: who.nick, c, stake: r.stake, fish: r.fish, round });
    if (this.phase === 'idle') {
      this.phase = 'open';
      this.until = this.host.now() + ROULETTE_OPEN_MS;
    }
    this.host.changed(who.pid);
    this.publish();
    this.step();
  }

  /** Каждый тик комнаты: конец приёма (или все у стола поставили) — вращение; конец вращения — выплаты */
  step(): void {
    this.greet();
    const now = this.host.now();
    if (this.phase === 'open') {
      const near = this.host.nearby();
      const all = near.length > 0 && near.every((w) => this.bets.some((b) => b.pid === w.pid) || !w.profile.fishing.bag.length);
      if (now >= this.until || all) {
        this.phase = 'spin';
        this.until = now + ROULETTE_SPIN_MS;
        this.n = this.spin();
        this.publish();
      }
    } else if (this.phase === 'spin' && now >= this.until) {
      this.settle();
    }
  }

  /** Вышедший на палубу баркаса получает табло; ушедший с неё забывается — вернётся и получит снова */
  private greet(): void {
    const here = this.aboardNext;
    here.clear();
    for (const w of this.host.aboard()) {
      here.add(w.id);
      if (!this.aboard.has(w.id) && this.log.length) w.send({ t: 'rouletteLog', rows: this.log });
    }
    this.aboardNext = this.aboard;
    this.aboard = here;
  }

  private settle(): void {
    const n = this.n ?? 0;
    const c = rouletteColor(n);
    const rows: RouletteLogRow[] = [];
    for (const b of this.bets) {
      const payout = roulettePayout(b.stake, b.c, n);
      if (!this.profiles.settleRoulette(b.pid, b.round, payout)) continue;
      rows.push({ round: this.round, pid: b.pid, nick: b.nick, c: b.c, stake: b.stake, payout, n });
      this.host.send(b.pid, { t: 'rouletteResult', n, c, stake: b.stake, payout, fish: b.fish });
      this.host.changed(b.pid);
      if (payout > 0 && (b.c === 'green' || payout >= ROULETTE_ANNOUNCE)) {
        this.host.announce(`🎡 ${b.nick} поставил улов на ${ROULETTE_COLOR_NAMES[b.c]} и выиграл ${fmt.format(payout)} 🪙!`);
      }
    }
    this.bets = [];
    this.phase = 'idle';
    this.until = 0;
    this.publish();
    // табло и тост о розыгрыше — всем на баркасе (в том числе тому, кто поставил: ему табло обновится, свой тост — отдельный)
    if (rows.length) {
      this.log = pushRouletteLog(this.log, rows);
      for (const w of this.host.aboard()) w.send({ t: 'rouletteLog', rows: this.log, fresh: rows.length });
    }
  }

  private publish(): void {
    this.host.broadcast({ t: 'roulette', v: this.view() });
  }
}
