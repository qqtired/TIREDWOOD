// Аркада новой набережной (WP12, флаг PLAZA3: точки 'arcade' есть только в её карте): шесть корпусов в курзале, по два
// на игру. Решает сервер (AGENTS §8): занимает корпус (один игрок на корпус), выдаёт зерно партии, собирает журнал ввода,
// по концу партии сам переигрывает её модулем из shared/arcade/ и записывает свой счёт, рекорды и жетоны (с потолком
// 150 в день). Соседям рассылает, кто за каким корпусом и его живой счёт (решение 3а: на экране — демо, «ИГРАЕТ <ник>»
// и счёт). Протокол — shared/arcade/net.ts.
import { randomInt } from 'node:crypto';
import { ARC_CABS, ARC_GAMES, ARC_GAME_IDS, ARC_PAUSE_MS, arcGameOfCab, arcMaxEvents, arcMinMs, checkArcLog, replayArc } from '../../shared/arcade/games.ts';
import { ARC_MAX_TICKS, HZ, medalOf, type ArcGameId, type ArcLogRow } from '../../shared/arcade/kit.ts';
import type { ArcBoard, ArcCabView, ArcMe, ArcResult, ArcadeClientMsg, ArcadeServerMsg } from '../../shared/arcade/net.ts';
import {
  ARC_DAY_CAP, ARC_TOP_SHOWN, arcBest, arcDay, arcDayCoins, arcKeys, arcTables, arcWeek, arcadeReward, type ArcProfileLike, type ArcRow,
} from '../../shared/arcade/rewards.ts';

/** Игрок у корпуса: номер на набережной, профиль, где стоит */
export interface ArcWho {
  pid: number;
  nick: string;
  profile: ArcProfileLike;
  x: number;
  z: number;
}

export interface ArcadeHost {
  /** Точки корпусов по номеру (arg точки 'arcade'): где стоять и радиус E */
  cabs: ReadonlyArray<{ x: number; z: number; r: number }>;
  /** Кто это (null — нет на набережной или без профиля: гость, смоук-тест) */
  who(slot: number): ArcWho | null;
  profiles(): Iterable<ArcProfileLike>;
  /** Начислить жетоны за режим (и показать игроку новый баланс) */
  credit(pid: number, n: number): void;
  send(slot: number, msg: ArcadeServerMsg): void;
  broadcast(msg: ArcadeServerMsg): void;
  toast(slot: number, text: string): void;
  announce(text: string): void;
  markDirty(): void;
  /** Ограничитель частоты сообщений: false — превышено */
  limit(key: string, n: number, ms: number): boolean;
  now(): number;
}

interface Run {
  id: number;
  cab: number;
  game: ArcGameId;
  seed: number;
  slot: number;
  /** Когда выдали зерно и когда было последнее сообщение партии, мс */
  at: number;
  last: number;
  log: ArcLogRow[];
}

interface Cab {
  /** Номер игрока на набережной (0 — свободен) */
  slot: number;
  pid: number;
  nick: string;
  /** Последнее действие у корпуса (для «минута без игры — свободен»), мс */
  idleAt: number;
  run: Run | null;
  /** Живой счёт партии для экрана соседей (со слов клиента) */
  live: number;
}

/** Минута без партии у корпуса — он свободен */
export const ARC_IDLE_MS = 60_000;
/** Партия без сообщений столько — закрыта без счёта (обрыв связи; клиент шлёт журнал раз в полсекунды и на паузе) */
export const ARC_LOST_MS = 60_000;
/** Отошёл от точки корпуса дальше радиуса на столько — корпус свободен */
const ARC_AWAY = 2.5;
/** Строк журнала в одном сообщении (JSON ≤ 16 КБ) */
export const ARC_CHUNK = 400;

export class ArcadeHall {
  private readonly h: ArcadeHost;
  private readonly cabs: Cab[];
  private readonly seed: () => number;
  private nextRun = 1;
  private dirty = false;
  /** Лидеры недели по играм — строкой (рассылаем, когда поменялись) */
  private leadKey = '';

  constructor(host: ArcadeHost, seed: () => number = () => randomInt(0, 2 ** 32)) {
    this.h = host;
    this.seed = seed;
    this.cabs = Array.from({ length: Math.min(ARC_CABS, host.cabs.length) }, () => ({ slot: 0, pid: 0, nick: '', idleAt: 0, run: null, live: 0 }));
  }

  /** Вошедшему на набережную — кто за какими корпусами и лидеры недели */
  welcome(send: (m: ArcadeServerMsg) => void): void {
    send(this.view());
  }

  /** E у корпуса: занять (свободен или уже мой) и открыть окно игры */
  use(slot: number, cab: number): void {
    const c = this.cabs[cab];
    const who = this.h.who(slot);
    if (!c || !who) return;
    if (c.slot !== 0 && c.slot !== slot) {
      this.h.toast(slot, `Играет ${this.nickOf(c)} — подожди или посмотри`);
      return;
    }
    // за другим корпусом — оттуда уходит (партия там не засчитывается: окно было закрыто)
    for (let i = 0; i < this.cabs.length; i++) if (i !== cab && this.cabs[i].slot === slot) this.free(i, false);
    if (c.slot !== slot) Object.assign(c, { slot, pid: who.pid, nick: who.nick, run: null, live: 0 });
    c.idleAt = this.h.now();
    const game = arcGameOfCab(cab);
    this.h.send(slot, { t: 'arcOpen', cab, game, me: this.me(who.profile, game), board: this.board(game), cap: ARC_DAY_CAP });
    this.dirty = true;
  }

  message(slot: number, msg: ArcadeClientMsg): void {
    if (!this.h.limit(`arc:${slot}`, 10, 1000)) return;
    const i = this.cabs.findIndex((c) => c.slot === slot);
    if (i < 0) {
      if (msg.a === 'start') this.h.send(slot, { t: 'arcErr', text: 'Подойди к автомату и нажми E' });
      return;
    }
    const c = this.cabs[i];
    const now = this.h.now();
    switch (msg.a) {
      case 'start': {
        // новая партия поверх незакрытой: та не засчитывается (клиент сначала шлёт end — это на случай сбоя)
        const run: Run = { id: this.nextRun++, cab: i, game: arcGameOfCab(i), seed: this.seed() >>> 0, slot, at: now, last: now, log: [] };
        c.run = run;
        c.live = 0;
        c.idleAt = now;
        this.dirty = true;
        this.h.send(slot, { t: 'arcRun', run: run.id, seed: run.seed });
        return;
      }
      case 'log': {
        const run = c.run;
        if (!run || msg.run !== run.id) return;
        const ev = msg.ev;
        if (!Array.isArray(ev) || ev.length > ARC_CHUNK || msg.from !== run.log.length || run.log.length + ev.length > arcMaxEvents(ARC_MAX_TICKS)) {
          this.drop(c, 'Связь с автоматом сбилась — партия не засчитана');
          return;
        }
        for (const row of ev) run.log.push(row);
        run.last = now;
        c.idleAt = now;
        const s = Math.floor(Number(msg.s));
        if (Number.isFinite(s) && s >= 0 && s !== c.live) {
          c.live = Math.min(s, 9_999_999);
          this.dirty = true;
        }
        return;
      }
      case 'end': {
        const run = c.run;
        if (!run || msg.run !== run.id) return;
        c.run = null;
        c.idleAt = now;
        this.dirty = true;
        // на экране корпуса у соседей до следующей партии — её итог (счёт сервера; не сошёлся журнал — 0)
        c.live = this.finish(run, msg.ticks, Math.floor(Number(msg.s)) || 0, now);
        return;
      }
      case 'close':
        this.free(i, false);
        return;
    }
  }

  /** Ушёл с набережной (в режим, вышел из игры): корпус свободен, незаконченная партия не засчитана */
  leave(slot: number): void {
    for (let i = 0; i < this.cabs.length; i++) if (this.cabs[i].slot === slot) this.free(i, false);
  }

  /** Тик набережной: раз в секунду — кто отошёл, заснул или пропал; рассылка экранов — не чаще 4 раз в секунду */
  step(tick: number): void {
    if (tick % HZ === 0) {
      const now = this.h.now();
      for (let i = 0; i < this.cabs.length; i++) {
        const c = this.cabs[i];
        if (c.slot === 0) continue;
        const who = this.h.who(c.slot);
        const at = this.h.cabs[i];
        if (!who || who.pid !== c.pid) this.free(i, false);
        else if (Math.hypot(who.x - at.x, who.z - at.z) > at.r + ARC_AWAY) this.free(i, true);
        else if (c.run && now - c.run.last > ARC_LOST_MS) this.drop(c, 'Связь с автоматом пропала — партия не засчитана');
        else if (!c.run && now - c.idleAt > ARC_IDLE_MS) {
          this.h.toast(c.slot, 'Автомат освободился: минута без игры');
          this.free(i, true);
        }
      }
    }
    if (tick % 15 === 0 && this.dirty) {
      this.dirty = false;
      this.h.broadcast(this.view());
    }
  }

  /** Для проверок: кто за корпусом (0 — свободен) */
  occupant(cab: number): number {
    return this.cabs[cab]?.slot ?? 0;
  }

  /** Отладка: корпуса */
  debug(): Array<{ slot: number; nick: string; run: number; live: number }> {
    return this.cabs.map((c) => ({ slot: c.slot, nick: c.nick, run: c.run?.id ?? 0, live: c.live }));
  }

  // ------------------------------------------------------------ внутреннее

  private nickOf(c: Cab): string {
    return this.h.who(c.slot)?.nick ?? c.nick;
  }

  /** Освободить корпус; notify — сказать игроку закрыть окно (сервер освободил сам) */
  private free(i: number, notify: boolean): void {
    const c = this.cabs[i];
    if (c.slot === 0) return;
    if (notify) this.h.send(c.slot, { t: 'arcClose', cab: i });
    Object.assign(c, { slot: 0, pid: 0, nick: '', run: null, live: 0 });
    this.dirty = true;
  }

  /** Партия сбилась или пропала: закрыть без счёта, корпус остаётся за игроком */
  private drop(c: Cab, text: string): void {
    c.run = null;
    c.live = 0;
    c.idleAt = this.h.now();
    this.dirty = true;
    this.h.send(c.slot, { t: 'arcErr', text });
  }

  private me(p: ArcProfileLike, game: ArcGameId): ArcMe {
    const now = this.h.now();
    return { ...arcBest(p.stats, game, now), dayCoins: arcDayCoins(p.stats, now) };
  }

  private board(game: ArcGameId): ArcBoard {
    return arcTables(this.h.profiles(), game, this.h.now(), ARC_TOP_SHOWN);
  }

  private view(): ArcadeServerMsg {
    const cabs: Array<ArcCabView | null> = this.cabs.map((c) => (c.slot ? { nick: this.nickOf(c), s: c.live } : null));
    const now = this.h.now();
    const lead: Array<ArcRow | null> = ARC_GAME_IDS.map((g) => arcTables(this.h.profiles(), g, now, 1).week[0] ?? null);
    this.leadKey = JSON.stringify(lead);
    return { t: 'arcCabs', cabs, lead };
  }

  /** Конец партии: проверить журнал и время, переиграть, записать свой счёт, рекорды и жетоны */
  private finish(run: Run, ticks: unknown, claimed: number, now: number): number {
    const slot = run.slot;
    const who = this.h.who(slot);
    if (!who) return 0;
    const t = typeof ticks === 'number' ? ticks : NaN;
    const bad = checkArcLog(run.game, run.log, t);
    if (bad) {
      this.h.send(slot, { t: 'arcErr', text: 'Журнал партии не сошёлся — партия не засчитана' });
      return 0;
    }
    const elapsed = now - run.at;
    if (elapsed < arcMinMs(t)) {
      this.h.send(slot, { t: 'arcErr', text: 'Партия прошла быстрее, чем можно сыграть, — не засчитана' });
      return 0;
    }
    if (elapsed - (t / HZ) * 1000 > ARC_PAUSE_MS + 30_000) {
      this.h.send(slot, { t: 'arcErr', text: 'Пауза дольше 5 минут — партия не засчитана' });
      return 0;
    }
    const r = replayArc(run.game, run.seed, run.log, t);
    const res = this.settle(who, run, r.score, claimed, now);
    const game = run.game;
    this.h.send(slot, { t: 'arcRes', ...res, me: this.me(who.profile, game), board: this.board(game) });
    // лидер недели мог смениться — подсказки у корпусов
    const lead = JSON.stringify(ARC_GAME_IDS.map((g) => arcTables(this.h.profiles(), g, now, 1).week[0] ?? null));
    if (lead !== this.leadKey) this.dirty = true;
    return r.score;
  }

  /** Записать партию в статистику профиля и начислить жетоны (правила — shared/arcade/rewards.ts) */
  private settle(who: ArcWho, run: Run, score: number, claimed: number, now: number): ArcResult {
    const game = run.game;
    const meta = ARC_GAMES[game].meta;
    const st = who.profile.stats;
    const k = arcKeys(game);
    const before = arcTables(this.h.profiles(), game, now, 1);
    const today = arcDay(now);
    if (st.arDay !== today) {
      st.arDay = today;
      st.arDayCoins = 0;
      st.arRecMask = 0;
    }
    st[k.runs]++;
    const newBest = score > 0 && score > st[k.best];
    if (newBest) st[k.best] = score;
    const week = arcWeek(now);
    if (st[k.wk] !== week) {
      st[k.wk] = week;
      st[k.wkBest] = 0;
    }
    if (score > st[k.wkBest]) st[k.wkBest] = score;
    const after = arcTables(this.h.profiles(), game, now, 1000);
    const pid = who.pid;
    const wPlace = after.week.findIndex((r) => r.pid === pid) + 1;
    const aPlace = after.all.findIndex((r) => r.pid === pid) + 1;
    const tookWeek = wPlace === 1 && before.week[0]?.pid !== pid;
    const tookAll = aPlace === 1 && before.all[0]?.pid !== pid;
    const bit = 1 << ARC_GAME_IDS.indexOf(game);
    const record = newBest && (st.arRecMask & bit) === 0;
    if (record) st.arRecMask |= bit;
    const medal = medalOf(score, meta.medals);
    const rw = arcadeReward({ medal, coins: meta.coins, record, first: tookWeek || tookAll, dayCoins: st.arDayCoins });
    st.arDayCoins += rw.total;
    if (rw.total > 0) this.h.credit(pid, rw.total);
    this.h.markDirty();
    // новый рекорд автомата (за всё время или недели) — строка в общий чат
    const beatAll = aPlace === 1 && score > (before.all[0]?.score ?? 0);
    const beatWeek = wPlace === 1 && score > (before.week[0]?.score ?? 0);
    if (beatAll || beatWeek) this.h.announce(`🕹️ ${who.nick} набрал ${score} в «${meta.title}» — ${beatAll ? 'рекорд автомата за всё время' : 'рекорд недели'}!`);
    return {
      run: run.id, score, claimed, medal, coins: rw.total, parts: { medal: rw.medal, record: rw.record, first: rw.first }, capped: rw.capped, newBest,
      week: wPlace, all: aPlace,
    };
  }
}
